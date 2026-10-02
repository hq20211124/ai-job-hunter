/**
 * 智联招聘 投递流水线
 *
 * 用法:
 *   node apply-jobs-zhaopin.js <城市码> <关键词> <数量> [--dry]
 *   node apply-jobs-zhaopin.js 763 Java 8
 *
 * 智联的城市码（实测）:
 *   广州 763  深圳 765  珠海 766  汕头 767  佛山 768  江门 769
 *   湛江 770  茂名 771  肇庆 772  惠州 773  韶关 764  梅州 774
 *   汕尾 775  河源 776  阳江 777  清远 778  东莞 779  中山 780
 *   潮州 781  揭阳 782  云浮 783
 *
 * 页面结构（实测）:
 *   搜索页是「左列表 + 右详情」布局
 *   列表项: .job-list-panel .job-card        每页 20 条
 *   详情面板: .job-split-layout__right
 *   按钮:   button.job-detail-summary__apply      立即投递（一键完成：发简历 + 发招呼语）
 *           button.job-detail-summary__prechat    先聊聊
 *   点「立即投递」后弹 deliver-greeting-modal，只是成功提示，不需要二次确认。
 *
 * 招呼语在 https://i.zhaopin.com/im/greeting/setting 设置（已设好自定义话术）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const DATA = 'C:\\D\\agent\\find-job\\data';
const RESULTS = path.join(DATA, 'apply-results-zhaopin.json');
const LOG = path.join(DATA, 'apply-log-zhaopin.txt');

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
const logline = s => { console.log(s); fs.appendFileSync(LOG, s + '\n', 'utf8'); };

const OUTSOURCE = /人力|人才|劳务|外服|派遣|外包|企业管理|万宝盛华|人瑞|人惠|中智|仁联|科锐|高凡|拓保|博才|易才|朗钧|外企德科|FESCO|佰钧成|中科铭天|腾信软创|网新|赛意|华立数字|中软国际|软通动力|中电金信|文思海辉|博彦|法本|同海科技|同方鼎欣|中科软|众合|贸易商行|商行/i;
const NON_DEV = /测试|运维|实施|产品经理|销售|运营|讲师|UI设计|视觉设计|硬件|结构|电气|机械|采购|财务|编辑|设计师|实习|应届|校招|初级/i;

/** 读右侧详情面板 */
const detail = () => pe(`JSON.stringify((function(){
  const box = document.querySelector('.job-split-layout__right');
  if (!box) return { err: 'no-panel' };
  const t = (box.innerText||'').replace(/\\s+/g,' ');
  // 标题 / 薪资 / 地点 在面板前部
  const title = (box.querySelector('h1, [class*="summary__title"], [class*="job-title"]')?.innerText || '').trim();
  const salary = (box.querySelector('[class*="summary__salary"], [class*="salary"]')?.innerText || '').trim();
  const btns = Array.from(document.querySelectorAll('button')).map(b => ({
    cls: String(b.className).slice(0,60), t: (b.innerText||'').trim(), dis: !!b.disabled, vis: b.offsetParent !== null
  })).filter(b => b.t && b.vis);
  return { title, salary, head: t.slice(0, 220), jd: t.slice(0, 6000), btns };
})())`);

function pe(code, timeout = 20000) { return call('pageEval', { code }, timeout).then(r => txt(r)); }

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const pos = args.filter(a => !a.startsWith('--'));
  const CITY = pos[0] || '763';
  const KW = pos[1] || 'Java';
  const COUNT = Number(pos[2] || 5);

  const history = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : [];
  // 只有「真的投过」才永久跳过；DRY-RUN 等记录不挡路
  const isDone = h => h.ok === true || h.why === '已投递过';
  const seen = new Set(history.filter(isDone).map(h => h.key));

  logline(`\n${'#'.repeat(72)}`);
  logline(`# ${new Date().toLocaleString('zh-CN')}  智联 城市=${CITY} 关键词=${KW} 目标=${COUNT}${dry ? '  [DRY]' : ''}`);
  logline(`${'#'.repeat(72)}`);

  const url = `https://www.zhaopin.com/jobs?jl=${CITY}&kw=${encodeURIComponent(KW)}`;
  let r = await call('goto', { url });
  if (!r.ok) { logline('❌ 打开搜索页失败'); process.exit(1); }
  await nap(9000, 11000);

  // 滚几次加载更多
  for (let i = 0; i < 3; i++) { await call('scroll', { direction: 'down', times: 2 }); await nap(1500, 2300); }
  await call('scroll', { direction: 'up', times: 8 });
  await nap(2000, 3000);

  const total = Number(await pe(`document.querySelectorAll('.job-list-panel .job-card').length`));
  logline(`列表卡片数: ${total}`);

  let done = 0;
  const records = [];

  for (let i = 1; i <= total && done < COUNT; i++) {
    logline(`\n${'='.repeat(70)}`);
    logline(`【${done + 1}/${COUNT}】列表第 ${i} 张卡片`);

    const clicked = await pe(`(function(){
      const c = document.querySelectorAll('.job-list-panel .job-card')[${i} - 1];
      if (!c) return 'nf';
      c.scrollIntoView({ block: 'center' });
      c.click();
      return 'ok';
    })()`);
    if (clicked !== 'ok') { logline('  ⏭️ 卡片不存在'); continue; }
    await nap(3500, 5000);

    const d = JSON.parse(await detail());
    if (d.err) { logline('  ⏭️ 详情面板没读到'); continue; }

    logline(`  ${d.title} | ${d.salary}`);
    logline(`  ${d.head.slice(0, 110)}`);

    // 从详情面板提取公司名：DOM 优先，正则兜底
    const compDom = await pe(`(function(){
      const box = document.querySelector('.job-split-layout__right');
      if (!box) return '';
      // 常见位置：详情面板里公司链接 / 公司名元素
      const a = box.querySelector('a[href*="companydetail"]');
      if (a) return (a.innerText || a.getAttribute('title') || '').trim();
      const el = box.querySelector('[class*="company-name"], [class*="companyName"], [class*="company__name"]');
      return el ? (el.innerText||'').trim() : '';
    })()`);
    let company = String(compDom || '').trim();
    if (!company) {
      // 兜底：head 形如「… 公司名 /100-299人 · 行业」或「… 公司名 /不需要融资 · 行业」
      const m = d.head.match(/([\u4e00-\u9fa5A-Za-z0-9()（）]{2,40}?)\s*\/\s*(?:\d+-\d+人|不需要融资|已上市|未融资|天使轮|A轮|B轮|C轮|D轮及以上|融资未公开|10000人以上)/);
      company = m ? m[1].trim() : '';
    }
    const key = `${d.title}@@${company}`;

    if (!d.title) { logline('  ⏭️ 没有标题，跳过'); continue; }
    if (NON_DEV.test(d.title)) { logline(`  ⏭️ 标题不像开发岗，跳过`); continue; }
    if (company && OUTSOURCE.test(company)) { logline(`  ⏭️ 公司名命中外包黑名单：${company}`); continue; }
    if (/驻场/.test(d.jd) && !/(无需|不需要|不用|非|不)驻场|自研非外包|非外包/.test(d.jd)) { logline('  ⏭️ JD 含「驻场」，跳过'); continue; }
    if (seen.has(key)) { logline('  ⏭️ 历史里投过，跳过'); continue; }

    const applyBtn = (d.btns || []).find(b => b.t === '立即投递' || b.t === '已投递');
    if (!applyBtn) { logline('  ⏭️ 没找到「立即投递」按钮'); continue; }
    if (applyBtn.t === '已投递') { logline('  ⏭️ 已投递过'); seen.add(key); records.push({ key, title: d.title, company, salary: d.salary, ok: false, why: '已投递过', ts: Date.now() }); continue; }

    if (dry) { logline('  [DRY] 不点击投递'); records.push({ key, title: d.title, company, salary: d.salary, ok: false, why: 'DRY', ts: Date.now() }); continue; }

    // 投递
    const applied = await pe(`(function(){
      const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').trim() === '立即投递' && x.offsetParent !== null);
      if (!b) return 'nf';
      b.click(); return 'clicked';
    })()`);
    logline(`  点「立即投递」: ${applied}`);
    await nap(4500, 6500);

    // 读弹窗确认
    const modal = await pe(`(function(){
      const m = document.querySelector('[class*="deliver-greeting-modal__content"]');
      return m ? (m.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 300) : '';
    })()`);
    const ok = applied === 'clicked' && String(modal).length > 0;
    logline(`  结果: ${ok ? '✅ 已投递' : '⚠️ 未确认'}`);
    if (String(modal).length) logline(`  实际发出的招呼语: ${modal}`);

    // 关掉弹窗
    await pe(`(function(){
      const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').trim() === '留在此页' && x.offsetParent !== null);
      if (b) b.click();
      return 1;
    })()`);
    await nap(1500, 2500);

    seen.add(key);
    records.push({ key, title: d.title, company, salary: d.salary, city: CITY, kw: KW, ok, greeting: String(modal), ts: Date.now() });
    if (ok) done++;

    const wait = 8000 + Math.random() * 10000;
    logline(`  （等待 ${(wait / 1000).toFixed(0)} 秒）`);
    await new Promise(res => setTimeout(res, wait));
  }

  const merged = history.concat(records);
  fs.writeFileSync(RESULTS, JSON.stringify(merged, null, 2), 'utf8');
  logline(`\n本轮：成功 ${records.filter(x => x.ok).length} / 处理 ${records.length}`);
  records.forEach(x => logline(`  ${x.ok ? '✅' : '⏭️'} ${x.title} | ${x.company} | ${x.salary}${x.why ? ' | ' + x.why : ''}`));
  logline(`历史累计: ${merged.length} 条 → ${RESULTS}`);
  process.exit(0);
})();
