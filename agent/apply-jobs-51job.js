/**
 * 前程无忧（51job）投递流水线
 *
 * 用法:
 *   node apply-jobs-51job.js <城市码> <关键词> <数量> [--dry]
 *   node apply-jobs-51job.js 030200 Java 10
 *
 * 城市码（实测）:
 *   广州 030200  深圳 040000  东莞 030800  佛山 030600
 *   中山 030700  珠海 030500  惠州 030300  汕头 030400
 *
 * 页面结构（实测）:
 *   搜索页  https://we.51job.com/pc/search?jobArea=<码>&keyword=<词>&searchType=2
 *   卡片    .joblist-item                        每页 20 条
 *   字段    .jname(标题) .sal(薪资) .area(地点) .cname(公司) .tags .tag(技能标签)
 *   关键    .joblist-item-job 的 sensorsdata 属性里是 JSON，直接带
 *           jobId / jobTitle / jobSalary / jobArea / jobYear / jobDegree / companyId
 *   投递    button.btn.apply（「投递」）—— 一键完成，之后弹 el-dialog「投递成功」
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const DATA = 'C:\\D\\agent\\find-job\\data';
const RESULTS = path.join(DATA, 'apply-results-51job.json');
const LOG = path.join(DATA, 'apply-log-51job.txt');

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
  const AREA = pos[0] || '030200';
  const KW = pos[1] || 'Java';
  const COUNT = Number(pos[2] || 5);

  const history = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : [];
  const isDone = h => h.ok === true || h.why === '已投递过';
  const seen = new Set(history.filter(isDone).map(h => h.jobId).filter(Boolean));

  logline(`\n${'#'.repeat(72)}`);
  logline(`# ${new Date().toLocaleString('zh-CN')}  51job 城市=${AREA} 关键词=${KW} 目标=${COUNT}${dry ? '  [DRY]' : ''}`);
  logline(`${'#'.repeat(72)}`);

  const url = `https://we.51job.com/pc/search?jobArea=${AREA}&keyword=${encodeURIComponent(KW)}&searchType=2`;
  const r = await call('goto', { url });
  if (!r.ok) { logline('❌ 打开搜索页失败'); process.exit(1); }
  await nap(10000, 12000);

  for (let i = 0; i < 3; i++) { await call('scroll', { direction: 'down', times: 2 }); await nap(1500, 2300); }
  await call('scroll', { direction: 'up', times: 8 });
  await nap(2000, 3000);

  const total = Number(await pe(`document.querySelectorAll('.joblist-item').length`));
  logline(`列表卡片数: ${total}`);

  // 一次性把所有卡片的基本信息读出来（避免反复进出）
  const list = JSON.parse(await pe(`JSON.stringify((function(){
    return Array.from(document.querySelectorAll('.joblist-item')).map((c, i) => {
      const q = s => { const e = c.querySelector(s); return e ? (e.innerText||'').trim().replace(/\\s+/g,' ') : ''; };
      const sd = c.querySelector('[sensorsdata]');
      let meta = {};
      if (sd) { try { meta = JSON.parse(sd.getAttribute('sensorsdata') || '{}'); } catch(e) {} }
      const btn = c.querySelector('button.btn.apply, .btn.apply, button');
      return {
        i: i + 1,
        jobId: meta.jobId || '',
        jname: q('.jname'),
        sal: q('.sal'),
        area: q('.area'),
        cname: q('.cname'),
        tags: q('.tags'),
        jobYear: meta.jobYear || '',
        jobDegree: meta.jobDegree || '',
        btnText: btn ? (btn.innerText||'').trim() : '',
        btnCls: btn ? String(btn.className) : ''
      };
    });
  })())`));
  logline(`已读取 ${list.length} 条卡片信息`);

  let done = 0;
  const records = [];

  for (const job of list) {
    if (done >= COUNT) break;
    logline(`\n${'='.repeat(70)}`);
    logline(`【${done + 1}/${COUNT}】#${job.i} ${job.jname} | ${job.cname} | ${job.sal} | ${job.area}`);

    if (!job.jname) { logline('  ⏭️ 标题为空，跳过'); continue; }
    if (NON_DEV.test(job.jname)) { logline('  ⏭️ 标题不像开发岗，跳过'); continue; }
    if (OUTSOURCE.test(job.cname)) { logline(`  ⏭️ 公司名命中外包黑名单：${job.cname}`); continue; }
    if (job.jobId && seen.has(job.jobId)) { logline('  ⏭️ 历史里投过，跳过'); continue; }
    if (/已投递|已申请/.test(job.btnText)) {
      logline('  ⏭️ 页面显示已投递');
      seen.add(job.jobId);
      records.push({ ...job, ok: false, why: '已投递过', ts: Date.now() });
      continue;
    }

    if (dry) { logline('  [DRY] 不点击投递'); records.push({ ...job, ok: false, why: 'DRY', ts: Date.now() }); continue; }

    // 点这张卡片里的「投递」按钮
    const applied = await pe(`(function(){
      const c = document.querySelectorAll('.joblist-item')[${job.i} - 1];
      if (!c) return 'no-card';
      const b = c.querySelector('button.btn.apply') || Array.from(c.querySelectorAll('button')).find(x => /投递|申请/.test((x.innerText||'').trim()));
      if (!b) return 'no-btn';
      b.scrollIntoView({ block:'center' });
      b.click();
      return 'clicked';
    })()`);
    logline(`  点「投递」: ${applied}`);
    await nap(4000, 6000);

    // 读结果
    const res = await pe(`(function(){
      const dlg = Array.from(document.querySelectorAll('.el-dialog, [role="dialog"], [class*="dialog"]'))
        .find(e => e.offsetParent !== null && (e.innerText||'').length < 400);
      const t = dlg ? (dlg.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 200) : '';
      return t;
    })()`);
    const ok = /投递成功|申请成功/.test(String(res)) || /已投递|已申请/.test(String(await pe(`(function(){
      const c = document.querySelectorAll('.joblist-item')[${job.i} - 1];
      const b = c ? c.querySelector('button.btn.apply, button') : null;
      return b ? (b.innerText||'').trim() : '';
    })()`)));
    logline(`  结果: ${ok ? '✅ 投递成功' : '⚠️ 未确认'}  弹窗内容: ${String(res).slice(0, 80)}`);

    // 关键：立刻核对按钮状态是否变化（而不是只看弹窗）
    const after = await pe(`(function(){
      const c = document.querySelectorAll('.joblist-item')[${job.i} - 1];
      const b = c ? c.querySelector('button.btn.apply, button') : null;
      return b ? (b.innerText||'').trim() : '(无)';
    })()`);
    logline(`  按钮文案变化: "${job.btnText}" → "${after}"`);

    // 关掉弹窗
    await pe(`(function(){
      const x = document.querySelector('.el-dialog__headerbtn, .el-dialog__close, [class*="dialog"] [class*="close"]');
      if (x) { x.click(); return 'closed'; }
      // 兜底：点遮罩
      const m = document.querySelector('.el-overlay, [class*="overlay"], [class*="mask"]');
      if (m) { m.click(); return 'mask'; }
      return 'none';
    })()`);
    await nap(1500, 2500);

    if (job.jobId) seen.add(job.jobId);
    records.push({ ...job, ok, afterBtn: String(after), modal: String(res), ts: Date.now() });
    if (ok) done++;

    const wait = 7000 + Math.random() * 9000;
    logline(`  （等待 ${(wait / 1000).toFixed(0)} 秒）`);
    await new Promise(r => setTimeout(r, wait));
  }

  const merged = history.concat(records);
  fs.writeFileSync(RESULTS, JSON.stringify(merged, null, 2), 'utf8');
  logline(`\n本轮：成功 ${records.filter(x => x.ok).length} / 处理 ${records.length}`);
  records.forEach(x => logline(`  ${x.ok ? '✅' : '⏭️'} ${x.jname} | ${x.cname} | ${x.sal}${x.why ? ' | ' + x.why : ''}`));
  logline(`历史累计: ${merged.length} 条 → ${RESULTS}`);
  process.exit(0);
})();
