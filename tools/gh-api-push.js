#!/usr/bin/env node
/**
 * 通过 GitHub REST API 推送（适用于 github.com:443 被墙、但 api.github.com 可达的网络环境）
 *
 * 原理：用 Git Data API 逐个创建 blob → tree → commit → 更新 ref，
 *      全程只走 api.github.com，不需要 git push。
 *
 * 用法：
 *   node gh-api-push.js <owner/repo> [branch] [--message "提交信息"]
 *
 * 需要环境变量 GITHUB_TOKEN（或用 `gh auth token` 自动获取）
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const REPO = process.argv[2];
const BRANCH = process.argv[3] || 'main';
if (!REPO || !REPO.includes('/')) {
  console.error('用法: node gh-api-push.js <owner/repo> [branch] [--message "提交信息"]');
  process.exit(1);
}
const mi = process.argv.indexOf('--message');
const MESSAGE = mi > 0 ? process.argv[mi + 1] : 'Update from gh-api-push';

const TOKEN = process.env.GITHUB_TOKEN || (() => {
  try { return execSync('gh auth token', { encoding: 'utf8' }).trim(); }
  catch { console.error('无法获取 token：请设置 GITHUB_TOKEN 或先 gh auth login'); process.exit(1); }
})();

const ROOT = path.resolve(__dirname, '..');
const [OWNER, NAME] = REPO.split('/');

function api(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: urlPath,
      method,
      headers: Object.assign({
        'User-Agent': 'gh-api-push',
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j = null;
        try { j = d ? JSON.parse(d) : null; } catch { j = { raw: d }; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
        else reject(new Error(`${method} ${urlPath} -> ${res.statusCode}: ${d.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** 递归列出仓库里要提交的文件（遵守 .gitignore —— 直接用 git ls-files 最准） */
function listFiles() {
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** 是否二进制 */
function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

(async () => {
  const files = listFiles();
  console.log(`准备推送 ${files.length} 个文件 → ${REPO} (${BRANCH})\n`);

  // 1. 取当前 ref（空仓库会 404）
  let baseSha = null;
  try {
    const ref = await api('GET', `/repos/${OWNER}/${NAME}/git/ref/heads/${BRANCH}`);
    baseSha = ref.object.sha;
    console.log(`  已有分支，父提交 ${baseSha.slice(0, 8)}`);
  } catch (e) {
    console.log('  分支不存在（空仓库），将创建初始提交');
  }

  // 2. 为每个文件创建 blob
  const tree = [];
  let i = 0;
  for (const f of files) {
    i++;
    const abs = path.join(ROOT, f);
    const buf = fs.readFileSync(abs);
    const bin = isBinary(buf);
    const blob = await api('POST', `/repos/${OWNER}/${NAME}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    tree.push({
      path: f.split(path.sep).join('/'),
      mode: bin ? '100644' : '100644',
      type: 'blob',
      sha: blob.sha,
    });
    process.stdout.write(`\r  blob ${i}/${files.length}  ${f.slice(0, 50).padEnd(50)}`);
  }
  console.log('\n');

  // 3. 创建 tree
  const treeRes = await api('POST', `/repos/${OWNER}/${NAME}/git/trees`, {
    tree,
    ...(baseSha ? {} : {}),
  });
  console.log(`  tree 已创建: ${treeRes.sha.slice(0, 8)}`);

  // 4. 创建 commit
  const commitBody = { message: MESSAGE, tree: treeRes.sha };
  if (baseSha) commitBody.parents = [baseSha];
  const commit = await api('POST', `/repos/${OWNER}/${NAME}/git/commits`, commitBody);
  console.log(`  commit 已创建: ${commit.sha.slice(0, 8)}`);

  // 5. 更新 ref
  if (baseSha) {
    await api('PATCH', `/repos/${OWNER}/${NAME}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
    console.log(`  分支 ${BRANCH} 已更新`);
  } else {
    await api('POST', `/repos/${OWNER}/${NAME}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    console.log(`  分支 ${BRANCH} 已创建`);
  }

  console.log(`\n✅ 完成: https://github.com/${OWNER}/${NAME}`);
})().catch((e) => {
  console.error('\n❌ 失败:', e.message);
  process.exit(1);
});
