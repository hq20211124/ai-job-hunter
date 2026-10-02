/**
 * 猎聘 投递流水线
 *
 * 用法:
 *   node apply-jobs-liepin.js <城市码> <关键词> <数量> [--dry]
 *   node apply-jobs-liepin.js 050020 Java 10
 *
 * 城市码（实测）:
 *   广州 050020  深圳 050090  东莞 050040  佛山 050050
 *   中山 050130  珠海 050140  惠州 050060  汕头 050080
 *   潮州 050030  清远 050070  湛江 050110  肇庆 050120
 *   江门 050150  阳江 050160  韶关 050170  茂名 050180
 *   梅州 050190  汕尾 050200
 *
 * 页面结构（实测）:
 *   搜索页  https://www.liepin.com/zhaopin/?key=<词>&dqs=<城市码>
 *   卡片    .jobCardPcContainer     每页 40 条
 *   卡片里有指向详情页的 <a href="https://www.liepin.com/job/<jobId>.shtml">
 *   详情页  a.btn-minor「投简历」→ 弹窗「选择附件简历」→ button「立即投递」
 *           a.btn-main 「聊一聊」（走 IM，自动化下挂载不出来，不用）
 *
 * ⚠️ 猎聘是 React，列表卡片上的操作按钮是悬停才出现的，所以走「进详情页再投」这条路。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const DATA = 'C:\\D\\agent\\find-job\\data';
const RESULTS = path.join(DATA, 'apply-results-liepin.json');
const LOG = path.join(DATA, 'apply-log-liepin.txt');

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
const pe = (code, t = 20000) => call('pageEval', { code }, t).then(r => String(r?.result?.result ?? ''));
const nap = (a = 2000, b = 3500) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));
const logline = s => { console.log(s); fs.appendFileSync(LOG, s + '\n', 'utf8'); };

const OUTSOURCE = /人力|人才|劳务|外服|派遣|外包|企业管理|万宝盛华|人瑞|人惠|中智|仁联|科锐|高凡|拓保|博才|易才|朗钧|外企德科|FESCO|佰钧成|中科铭天|腾信软创|网新|赛意|华立数字|中软国际|软通动力|中电金信|文思海辉|博彦|法本|同海科技|同方鼎欣|中科软|众合|贸易商行|商行|人力资源/i;
const NON_DEV = /测试|运维|实施|产品经理|销售|运营|讲师|UI设计|视觉设计|硬件|结构|电气|机械|采购|财务|编辑|设计师|实习|应届|校招|初级|前台|客服/i;

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const pos = args.filter(a => !a.startsWith('--'));
  const CITY = pos[0] || '050020';
  const KW = pos[1] || 'Java';
  const COUNT = Number(pos[2] || 5);

  const history = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : [];
  const isDone = h => h.ok === true || h.why === '已投递过';
  const seen = new Set(history.filter(isDone).map(h => h.jobId).filter(Boolean));

  logline(`\n${'#'.repeat(72)}`);
  logline(`# ${new Date().toLocaleString('zh-CN')}  猎聘 城市=${CITY} 关键词=${KW} 目标=${COUNT}${dry ? '  [DRY]' : ''}`);
  logline(`${'#'.repeat(72)}`);

  const url = `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(KW)}&dqs=${CITY}`;
  const r = await call('goto', { url });
  if (!r.ok) { logline('❌ 打开搜索页失败'); process.exit(1); }
  await nap(10000, 12000);
  for (let i = 0; i < 3; i++) { await call('scroll', { direction: 'down', times: 2 }); await nap(1500, 2300); }
  await call('scroll', { direction: 'up', times: 8 });
  await nap(2000, 3000);

  const list = JSON.parse(await pe(`JSON.stringify((function(){
    return Array.from(document.querySelectorAll('.jobCardPcContainer')).map((c, i) => {
      const a = c.querySelector('a[href*="/job/"]');
      const href = a ? a.getAttribute('href') : '';
      const m = href.match(/\\/job\\/(\\d+)\\.shtml/);
      const titleEl = c.querySelector('[class*="jobTitleBox"] [title]') || c.querySelector('[class*="jobTitleBox"] div');
      const t = (c.innerText||'').replace(/\\s+/g,' ');
      return {
        i: i + 1,
        jobId: m ? m[1] : '',
        url: m ? 'https://www.liepin.com/job/' + m[1] + '.shtml' : '',
        title: titleEl ? (titleEl.getAttribute('title') || titleEl.innerText || '').trim() : '',
        text: t.slice(0, 200)
      };
    }).filter(x => x.jobId);
  })())`));
  logline(`列表卡片数: ${list.length}`);

  let done = 0;
  const records = [];

  for (const job of list) {
    if (done >= COUNT) break;
    logline(`\n${'='.repeat(70)}`);
    logline(`【${done + 1}/${COUNT}】${job.title}`);
    logline(`  ${job.text.slice(0, 120)}`);

    if (!job.title) { logline('  ⏭️ 无标题，跳过'); continue; }
    if (NON_DEV.test(job.title)) { logline('  ⏭️ 标题不像开发岗，跳过'); continue; }
    if (seen.has(job.jobId)) { logline('  ⏭️ 历史里投过，跳过'); continue; }

    // 进详情页
    const g = await call('goto', { url: job.url });
    if (!g.ok) { logline('  ❌ 打开详情页失败'); continue; }
    await nap(7000, 9000);

    const info = JSON.parse(await pe(`JSON.stringify((function(){
      const body = (document.body.innerText||'').replace(/\\s+/g,' ');
      const comp = (document.querySelector('a[href*="/company/"], [class*="company-name"], [class*="companyName"]')?.innerText || '').trim();
      const btn = Array.from(document.querySelectorAll('a.btn-minor, a, button')).find(e => (e.innerText||'').trim() === '投简历');
      const applied = /已投递|已申请/.test(body.slice(0, 800));
      return { company: comp, jd: body.slice(0, 6000), hasApplyBtn: !!btn, applied, head: body.slice(0, 200) };
    })())`));
    logline(`  公司: ${info.company || '(未读到)'}`);
    logline(`  ${info.head.slice(0, 110)}`);

    if (info.company && OUTSOURCE.test(info.company)) { logline(`  ⏭️ 公司名命中外包黑名单：${info.company}`); continue; }
    if (/驻场/.test(info.jd) && !/(无需|不需要|不用|非|不)驻场|自研非外包|非外包/.test(info.jd)) { logline('  ⏭️ JD 含「驻场」，跳过'); continue; }
    if (!info.hasApplyBtn) { logline('  ⏭️ 没找到「投简历」按钮'); continue; }

    if (dry) { logline('  [DRY] 不点击投递'); records.push({ ...job, company: info.company, ok: false, why: 'DRY', ts: Date.now() }); continue; }

    // 点「投简历」
    const r1 = await pe(`(function(){
      const el = Array.from(document.querySelectorAll('a.btn-minor, a, button')).find(e => (e.innerText||'').trim() === '投简历' && e.offsetParent !== null);
      if (!el) return 'nf';
      el.click(); return 'clicked';
    })()`);
    logline(`  点「投简历」: ${r1}`);
    await nap(3500, 5000);

    // 弹窗里点「立即投递」
    // ⚠️ 必须点 <button.ant-c-btn-primary>，不能点外层的 .ant-c-modal-footer DIV
    //    —— 三个元素（footer DIV / BUTTON / SPAN）文字都是「立即投递」，
    //    按文档顺序取第一个会取到 DIV，点了等于没点（这个坑踩过一次）
    const r2 = await pe(`(function(){
      const el = document.querySelector('button.ant-c-btn-primary')
        || Array.from(document.querySelectorAll('button')).find(e => (e.innerText||'').trim() === '立即投递' && e.offsetParent !== null);
      if (!el) return 'nf';
      if (el.disabled) return 'disabled';
      el.click();
      return 'clicked:' + el.tagName;
    })()`);
    logline(`  点「立即投递」: ${r2}`);
    await nap(4500, 6500);

    // 核对：弹窗是否消失（弹窗还在 = 没投出去）
    const modalGone = await pe(`(function(){
      const box = Array.from(document.querySelectorAll('div,section')).find(e => /选择附件简历/.test(e.innerText||'') && (e.innerText||'').length < 900);
      return box ? 'still-open' : 'closed';
    })()`);
    logline(`  弹窗状态: ${modalGone}`);

    // 核对
    const after = await pe(`(function(){
      const body = (document.body.innerText||'').replace(/\\s+/g,' ');
      const modal = Array.from(document.querySelectorAll('[class*="modal"],[class*="dialog"]')).find(e => e.offsetParent !== null && (e.innerText||'').length < 400);
      return (modal ? '弹窗:' + (modal.innerText||'').replace(/\\s+/g,' ').slice(0,120) : '') + ' || 页面:' + body.slice(0, 150);
    })()`);
    const ok = r2.startsWith('clicked') && modalGone === 'closed';
    logline(`  结果: ${ok ? '✅ 投递成功（弹窗已关闭）' : '⚠️ 未成功（弹窗仍在或没点到按钮）'}`);
    logline(`  核对: ${after.slice(0, 200)}`);

    seen.add(job.jobId);
    records.push({ ...job, company: info.company, ok, after: String(after).slice(0, 200), ts: Date.now() });
    if (ok) done++;

    const wait = 7000 + Math.random() * 9000;
    logline(`  （等待 ${(wait / 1000).toFixed(0)} 秒）`);
    await new Promise(rr => setTimeout(rr, wait));
  }

  const merged = history.concat(records);
  fs.writeFileSync(RESULTS, JSON.stringify(merged, null, 2), 'utf8');
  logline(`\n本轮：成功 ${records.filter(x => x.ok).length} / 处理 ${records.length}`);
  records.forEach(x => logline(`  ${x.ok ? '✅' : '⏭️'} ${x.title} | ${x.company || ''}${x.why ? ' | ' + x.why : ''}`));
  logline(`历史累计: ${merged.length} 条 → ${RESULTS}`);
  process.exit(0);
})();
