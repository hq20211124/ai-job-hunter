/**
 * 投递流水线 —— 逐个职位：进详情 → 读JD+真实薪资 → 定制话术 → 投递 → 发招呼语
 *
 * 用法:
 *   node apply-jobs.js <起始序号> <数量> [--min=15000] [--dry]
 *
 *   起始序号/数量  对应 data/jobs-queue.json 的 1-based 序号
 *   --min=15000   详情页真实月薪上限低于此值的岗位直接跳过（默认 15000）
 *   --dry         只读不投，用于试跑核对
 *
 * 数据文件（全部在 data/，已 gitignore）:
 *   data/jobs-queue.json     投递队列（build-queue.py 产出）
 *   data/apply-results.json  投递历史（只追加，按 URL 去重，不会再被覆盖）
 *   data/jd/                 每个岗位的 JD 存档
 *   data/apply-log.txt       人类可读的投递日志
 *
 * 变更说明（修掉的坑）:
 *   - 原来读 C:\D\agent\find-job\gd-jobs-ranked.json（不存在），改为 data/jobs-queue.json
 *   - 原来每轮 覆盖 apply-results.json，丢失历史 → 改为只追加 + URL 去重
 *   - 原来只按标题正则过滤，外包/人力公司会漏进 → 改为公司黑名单 + 薪资闸门
 *   - 原来不检查是否已投过 → 改为详情页出现「继续沟通」即跳过
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\D\\agent\\find-job';
const DATA = path.join(ROOT, 'data');
const QUEUE = path.join(DATA, 'jobs-queue.json');
const RESULTS = path.join(DATA, 'apply-results.json');
const JDDIR = path.join(DATA, 'jd');
const LOG = path.join(DATA, 'apply-log.txt');

function call(command, params = {}, timeout = 150000) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ command, params, timeout });
    const req = http.request({
      host: '127.0.0.1', port: 61823, path: '/cmd', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(body); req.end();
  });
}
const nap = (a = 2000, b = 3500) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));
const txt = r => String(r?.result?.result ?? '');
const logline = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n', 'utf8'); };

/** 解析详情页薪资文本，返回 {min,max,raw}（单位：元/月） */
function parseSalary(raw) {
  const s = String(raw || '').replace(/\s+/g, '');
  if (!s) return null;
  const nums = [];
  const re = /(\d+(?:\.\d+)?)\s*([Kk千万]?)/g;
  let m;
  while ((m = re.exec(s))) {
    let v = parseFloat(m[1]);
    const u = m[2];
    if (u === 'K' || u === 'k') v *= 1000;
    else if (u === '万') v *= 10000;
    else if (u === '千') v *= 1000;
    else if (v < 1000) v *= 1000;   // 「8-10K」里的裸数字按 K 处理
    nums.push(Math.round(v));
  }
  const vals = nums.filter(v => v >= 1000 && v <= 1000000);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), raw: s };
}

/** 根据职位特征挑选最贴合的自我介绍片段 */
function buildGreeting(job, jd) {
  const all = job.title + ' ' + jd;
  const parts = [];

  if (/AI|人工智能|大模型|LLM|智能体|Agent|LangChain/i.test(all)) {
    parts.push('我现在做的正是 AI 落地：用 LangGraph + LangChain 构建生产级智能体，让 AI 参与金融发债主体的信用评价并直接产出风险评估报告（已上线城投债、产业债、REITs），同时用 Java 搭了配套的调度服务——因为智能体本身不擅长数据中转。');
  }
  if (/金融|证券|期货|基金|量化|投研|资管|银行|支付/.test(all)) {
    parts.push('金融方向我做过券商统一大系统下的投资策略研究平台（微服务架构，高斯数据库 + 东方通中间件），负责策略展示服务，对接前端动态因子参数，与算法组协作完成因子计算；也做过模拟组合计算服务，按金融公式实现开盘初始化、实时计算、组合汇总与仓位更新。');
  }
  if (/MES|WMS|制造|工业|仓储|生产|供应链|ERP/.test(all)) {
    parts.push('工业侧我独立开发过 WMS 仓储 / MES 制造系统，覆盖出入库、库区管理、库存变更、质检登记，支持 PDA 与 PC 端协同的上下料、料盘绑定、报废与损耗计算。');
  }
  if (/架构|技术负责人|组长|Leader|技术经理/.test(all)) {
    parts.push('架构上我主导过老式多模块单体到微服务 + DDD 的改造：拆服务、建网关与工作流基座、上容器化与自动化部署实现一键发布，同时重构了需求与发版节奏、建立起单元测试到端到端测试的质量体系。');
  }
  if (!parts.length) {
    parts.push('我 7 年 Java 后端，做过微服务架构改造、金融投资策略平台、WMS/MES 制造系统，也做 AI 智能体落地。');
  }

  return [
    `您好，看到「${job.title}」这个岗位。`,
    parts.slice(0, 2).join('\n'),
    '方便的话想了解下团队规模和技术栈，聊聊看是否合适。',
  ].join('\n');
}

/**
 * 生成会话匹配词：公司名各截断 + 职位名。
 * 兜底加职位名，因为会话列表的预览就是「您好，看到「职位名」这个岗位。…」，
 * 公司名截断匹配不到时（BOSS 会话里有时不显示公司全名）还能靠标题命中。
 */
function companyKeywords(job) {
  const c = job.company || '';
  const t = (job.title || '').replace(/[\s（）()【】[\]]/g, '');
  const cands = [
    c,
    c.replace(/有限公司|股份有限公司|科技|集团|公司|（.*?）|\(.*?\)/g, '').trim(),
    c.slice(0, 4),
    c.slice(0, 3),
    c.slice(0, 2),
    job.title,
    t.slice(0, 10),
    t.slice(0, 8),
  ];
  return [...new Set(cands.filter(x => x && x.length >= 2))];
}

/** 打开刚投递的会话。命中返回 true */
async function openConversation(keywords) {
  const q = await call('query', { selector: '.friend-content .text', limit: 120 });
  const items = (q.result?.items || []).filter(i => i.visible && i.text.length > 10);
  if (!items.length) return { ok: false, why: '会话列表为空' };

  for (const kw of keywords) {
    if (!kw || kw.length < 2) continue;
    const t = items.find(i => i.text.includes(kw));
    if (t) {
      const c = await call('clickSel', { selector: '.friend-content .text', nth: t.i });
      if (c.ok) {
        await nap(3000, 4500);
        const rd = await call('read', {}, 30000);
        if (txt(rd).includes(kw)) return { ok: true, matched: kw };
      }
    }
  }
  return { ok: false, why: '会话未匹配到公司名（可能投递未成功）' };
}

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const minArg = args.find(a => a.startsWith('--min='));
  const MIN_SALARY = minArg ? Number(minArg.split('=')[1]) : 15000;
  const pos = args.filter(a => !a.startsWith('--'));
  const start = Number(pos[0] || 1) - 1;
  const count = Number(pos[1] || 3);

  const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
  const history = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : [];
  const doneUrls = new Set(history.map(h => h.url));
  if (!fs.existsSync(JDDIR)) fs.mkdirSync(JDDIR, { recursive: true });

  const batch = queue.slice(start, start + count);
  logline(`\n${'#'.repeat(72)}`);
  logline(`# ${new Date().toLocaleString('zh-CN')}  ${dry ? '[DRY-RUN] ' : ''}队列 #${start + 1}..#${start + batch.length} / 共 ${queue.length}  |  薪资下限 ${MIN_SALARY}`);
  logline(`${'#'.repeat(72)}`);

  const newRecords = [];
  let skipped = 0, appliedOk = 0;

  for (let k = 0; k < batch.length; k++) {
    const job = batch[k];
    const idx = start + k + 1;
    logline(`\n${'='.repeat(70)}`);
    logline(`【${idx}】${job.title}  |  ${job.company}  |  ${job.location}  |  score ${job._score}`);
    logline('='.repeat(70));

    if (doneUrls.has(job.url)) { logline('  ⏭️  历史记录里已投过，跳过'); skipped++; continue; }

    // ① 进详情页
    let r = await call('goto', { url: job.url });
    if (!r.ok) { logline('  ❌ 打开失败: ' + r.error); newRecords.push({ ...job, ok: false, why: '打开失败', ts: Date.now() }); continue; }
    await nap(4000, 6000);

    // ② 读真实薪资（列表页薪资被 BOSS 字体反爬混淆，详情页是明文）
    const salRaw = await call('pageEval', { code: `(function(){ const e=document.querySelector('.salary'); return e ? String(e.innerText).trim() : ''; })()` });
    const salary = parseSalary(txt(salRaw));
    logline(`  薪资(详情页明码): ${salary ? salary.raw : '(未读到)'}`);

    if (salary && salary.max < MIN_SALARY) {
      logline(`  ⏭️  薪资上限 ${salary.max} < ${MIN_SALARY}，跳过`);
      skipped++; newRecords.push({ ...job, ok: false, why: `薪资过低(${salary.raw})`, salary: salary.raw, ts: Date.now() });
      continue;
    }

    // ③ 读 JD
    r = await call('extract', { max_length: 25000, offset: 0 });
    const jd = txt(r);
    const jdText = jd.replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
    const jdFile = path.join(JDDIR, `${idx}-${(job.company || '').replace(/[\\/:*?"<>|]/g, '_')}.txt`);
    fs.writeFileSync(jdFile, `职位: ${job.title}\n公司: ${job.company}\n地点: ${job.location}\n薪资: ${salary ? salary.raw : '?'}\nURL: ${job.url}\n\n${jd}`, 'utf8');
    logline(`  JD ${jd.length} 字符 → ${path.basename(jdFile)}`);

    // ④ 是否已投过（按钮变成「继续沟通」）
    let btnText = '';
    for (const sel of ['a[class*="chat"]', '[class*="chat"] a', 'a', 'button']) {
      const q = await call('query', { selector: sel, limit: 100 });
      const item = (q.result?.items || []).find(i => i.visible && /^(立即沟通|继续沟通|沟通中)$/.test(i.text.trim()));
      if (item) { btnText = item.text.trim(); break; }
    }
    if (btnText === '继续沟通') { logline('  ⏭️  该岗位已沟通过，跳过'); skipped++; newRecords.push({ ...job, ok: false, why: '已沟通过', salary: salary?.raw, ts: Date.now() }); continue; }

    if (dry) {
      logline('  [DRY] 不做任何点击，仅预览招呼语：');
      logline('  ' + buildGreeting(job, jdText).replace(/\n/g, '\n  '));
      newRecords.push({ ...job, ok: false, why: 'DRY-RUN', salary: salary?.raw, ts: Date.now() });
      continue;
    }

    // ⑤ 点「立即沟通」
    let applied = false;
    for (const sel of ['a[class*="chat"]', '[class*="chat"] a', 'a']) {
      const q = await call('query', { selector: sel, limit: 100 });
      const btn = (q.result?.items || []).find(i => i.visible && i.text.trim() === '立即沟通');
      if (btn) {
        const c = await call('clickSel', { selector: sel, nth: btn.i });
        if (c.ok) { applied = true; logline(`  ✅ 已点「立即沟通」(${sel} #${btn.i})`); break; }
      }
    }
    if (!applied) logline('  ⚠️ 没找到「立即沟通」按钮');
    await nap(4500, 6500);

    // ⑥ 打开会话发招呼语
    await call('goto', { url: 'https://www.zhipin.com/web/geek/chat' });
    await nap(4500, 6000);
    const conv = await openConversation(companyKeywords(job));
    logline('  会话匹配: ' + (conv.ok ? `✅ 命中「${conv.matched}」` : `⚠️ ${conv.why}`));

    let sent = false, greeting = '';
    if (conv.ok) {
      greeting = buildGreeting(job, jdText);
      await call('typeSel', { selector: '.chat-input', text: greeting, submit: false, fast: true });
      await nap(2000, 3000);

      // 读输入框回显，确认文字真的进去了（防止「未知发送」）
      const typed = await call('pageEval', { code: `(function(){ const e=document.querySelector('.chat-input'); return e ? String(e.innerText||e.value||'').trim() : ''; })()` });
      const typedLen = txt(typed).length;
      if (typedLen < 10) logline(`  ⚠️ 输入框回显只有 ${typedLen} 字，可能没输入成功`);

      const bq = await call('query', { selector: 'button', limit: 60 });
      const sendBtn = (bq.result?.items || []).find(i => i.visible && i.text.trim() === '发送');
      if (sendBtn) {
        await call('clickSel', { selector: 'button', nth: sendBtn.i });
        await nap(4000, 5500);
        // 唯一成功判据：输入框已清空
        const after = await call('pageEval', { code: `(function(){ const e=document.querySelector('.chat-input'); return e ? String(e.innerText||e.value||'').trim() : ''; })()` });
        sent = txt(after).length === 0;
        logline('  招呼语: ' + (sent ? '✅ 已发送（输入框已清空）' : `❌ 未发出（残留 ${txt(after).length} 字）`));
      } else {
        logline('  ❌ 找不到发送按钮');
      }
    }
    if (sent) appliedOk++;

    newRecords.push({
      ...job, ok: applied && sent, salary: salary?.raw, greeting, ts: Date.now(),
      why: sent ? undefined : (conv.ok ? '招呼语未发出' : '会话未匹配到（已点沟通但未发话）'),
    });

    const wait = 12000 + Math.random() * 15000;
    logline(`  （等待 ${(wait / 1000).toFixed(0)} 秒，人类节奏）`);
    await new Promise(res => setTimeout(res, wait));
  }

  // ⑦ 只追加，不覆盖
  const merged = history.concat(newRecords);
  fs.writeFileSync(RESULTS, JSON.stringify(merged, null, 2), 'utf8');

  logline(`\n${'='.repeat(70)}\n本轮汇总：成功 ${appliedOk} / 处理 ${batch.length}（跳过 ${skipped}）`);
  newRecords.forEach(r => logline(`  ${r.ok ? '✅' : '⚠️ '} ${r.title} | ${r.company} | ${r.salary || '-'} | ${r.why || '招呼语已发送'}`));
  logline(`历史累计: ${merged.length} 条 → ${RESULTS}`);
  process.exit(0);
})();
