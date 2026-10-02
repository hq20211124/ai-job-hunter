#!/usr/bin/env node
/**
 * 通过 GitHub REST API 推送（适用于 github.com:443 被墙、但 api.github.com 可达的网络环境）
 *
 * 原理：用 Git Data API 复刻本地的提交历史 —— 逐提交创建 blob / tree / commit，
 *      最后更新 ref。全程只走 api.github.com，不需要 git push。
 *
 * 用法：
 *   node tools/gh-api-push.js <owner/repo> [branch]
 *
 * 可选参数：
 *   --squash          不保留历史，把当前工作区压成一个提交
 *   --message "..."   配合 --squash 使用
 *
 * 需要环境变量 GITHUB_TOKEN（或用 `gh auth token` 自动获取）
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const REPO = process.argv[2];
const BRANCH = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'main';
if (!REPO || !REPO.includes('/')) {
  console.error('用法: node tools/gh-api-push.js <owner/repo> [branch] [--squash --message "..."]');
  process.exit(1);
}
const SQUASH = process.argv.includes('--squash');
const mi = process.argv.indexOf('--message');
const SQUASH_MSG = mi > 0 ? process.argv[mi + 1] : 'Initial commit';

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

const git = (args, opts = {}) =>
  execSync(`git ${args}`, { cwd: ROOT, encoding: 'buffer', maxBuffer: 500 * 1024 * 1024, ...opts });

const gitText = (args) => git(args, { encoding: 'utf8' });

function readAtCommit(commit, file) {
  return git(`show ${commit}:${file}`);
}

function filesAtCommit(commit) {
  return gitText(`ls-tree -r --name-only ${commit}`)
    .split('\n').map((s) => s.trim()).filter(Boolean);
}

function localFiles() {
  return gitText('ls-files').split('\n').map((s) => s.trim()).filter(Boolean);
}

function commitMessage(commit) {
  return gitText(`log -1 --format=%B ${commit}`).trim();
}

async function pushOne({ files, contents, message, parents, index, total, label }) {
  const tree = [];
  let i = 0;
  for (const f of files) {
    i++;
    const blob = await api('POST', `/repos/${OWNER}/${NAME}/git/blobs`, {
      content: contents[f].toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
    process.stdout.write(`\r  [${index}/${total}] ${String(label).slice(0, 30).padEnd(30)} ${i}/${files.length}   `);
  }
  const treeRes = await api('POST', `/repos/${OWNER}/${NAME}/git/trees`, { tree });
  const body = { message, tree: treeRes.sha };
  if (parents.length) body.parents = parents;
  const commit = await api('POST', `/repos/${OWNER}/${NAME}/git/commits`, body);
  process.stdout.write(`\r  [${index}/${total}] ${String(label).slice(0, 30).padEnd(30)} ✓ ${commit.sha.slice(0, 8)}        \n`);
  return commit.sha;
}

async function updateRef(sha, base) {
  if (base) {
    await api('PATCH', `/repos/${OWNER}/${NAME}/git/refs/heads/${BRANCH}`, { sha, force: true });
    console.log(`\n  分支 ${BRANCH} 已更新`);
  } else {
    await api('POST', `/repos/${OWNER}/${NAME}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha });
    console.log(`\n  分支 ${BRANCH} 已创建`);
  }
  console.log(`\n✅ 完成: https://github.com/${OWNER}/${NAME}`);
}

/**
 * 空仓库需要先有一个提交，Git Data API（blobs/trees/commits）才能用。
 * 这里用 Contents API 建一个占位提交作为基底。
 */
async function bootstrapEmptyRepo() {
  console.log('  仓库为空 —— 先用 Contents API 建一个基底提交…');
  const res = await api('PUT', `/repos/${OWNER}/${NAME}/contents/.gitignore`, {
    message: 'chore: 初始化仓库',
    content: Buffer.from('# 由 tools/gh-api-push.js 初始化\n').toString('base64'),
  });
  const sha = res.commit.sha;
  console.log(`  基底提交 ${sha.slice(0, 8)}\n`);
  return sha;
}

(async () => {
  console.log(`目标: ${REPO}   分支: ${BRANCH}\n`);

  let remoteHead = null;
  try {
    const ref = await api('GET', `/repos/${OWNER}/${NAME}/git/ref/heads/${BRANCH}`);
    remoteHead = ref.object.sha;
    console.log(`远端已有分支，HEAD = ${remoteHead.slice(0, 8)}\n`);
  } catch {
    console.log('远端分支不存在');
    remoteHead = await bootstrapEmptyRepo();
  }

  if (SQUASH || (remoteHead && remoteHead !== null && process.argv.includes('--append'))) {
    const files = localFiles();
    const contents = {};
    for (const f of files) contents[f] = fs.readFileSync(path.join(ROOT, f));
    const msg = SQUASH ? SQUASH_MSG : commitMessage('HEAD');
    console.log(`推送工作区快照（${files.length} 个文件）:\n`);
    const sha = await pushOne({
      files, contents, message: msg,
      parents: remoteHead ? [remoteHead] : [],
      index: 1, total: 1, label: '(snapshot)',
    });
    await updateRef(sha, remoteHead);
    return;
  }

  const commits = gitText('rev-list --reverse HEAD')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  console.log(`复刻 ${commits.length} 个本地提交:\n`);

  const shaMap = new Map();
  let idx = 0;
  for (const c of commits) {
    idx++;
    const files = filesAtCommit(c);
    const contents = {};
    for (const f of files) contents[f] = readAtCommit(c, f);
    let parents = gitText(`log -1 --format=%P ${c}`)
      .trim().split(/\s+/).filter(Boolean)
      .map((p) => shaMap.get(p)).filter(Boolean);
    // 第一个本地提交没有父提交 → 挂到基底提交上（若存在）
    if (!parents.length && remoteHead) parents = [remoteHead];
    const sha = await pushOne({
      files, contents,
      message: commitMessage(c),
      parents, index: idx, total: commits.length,
      label: commitMessage(c).split('\n')[0],
    });
    shaMap.set(c, sha);
  }

  await updateRef(shaMap.get(commits[commits.length - 1]), remoteHead);
})().catch((e) => {
  console.error('\n❌ 失败:', e.message);
  process.exit(1);
});
