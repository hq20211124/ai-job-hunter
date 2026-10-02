const http = require('http');
const fs = require('fs');
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
const nap = (a = 4000, b = 5500) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));
const txt = r => String(r?.result?.result ?? '');

const PLATFORMS = [
  { name: 'BOSS直聘',  url: 'https://www.zhipin.com/web/geek/resume' },
  { name: '智联招聘',  url: 'https://i.zhaopin.com/resume' },
  { name: '猎聘',      url: 'https://c.liepin.com/resume/edit' },
  { name: '前程无忧',  url: 'https://www.51job.com/resume/center' },
];

const CHECKS = [
  ['🔴 40% 编造数字',      /约\s*40%|40%\s*以上|减少重复代码\s*40%/, 'bad'],
  ['🔴 10 年前单体',       /10\s*年前单体/, 'bad'],
  ['🔴 [object Object]',   /\[object Object\]/, 'bad'],
  ['🟢 上一代单体',         /上一代单体/, 'good'],
  ['🟢 显著减少冗余代码',    /显著减少冗余代码|减少大量冗余代码|显著减少冗余/, 'good'],
  ['🟢 技术栈',            /技术栈/, 'good'],
  ['🟢 LangGraph/LangChain', /LangGraph|LangChain/, 'good'],
  ['🟢 AI 发债主体信用评价',  /发债主体信用评价|AI\s*发债/, 'good'],
  ['🟢 某某科技',           /某某科技/, 'good'],
  ['🟢 某某信息',            /某某信息/, 'good'],
  ['🟢 某某软件',            /某某软件/, 'good'],
  ['🟢 某某大学',           /某某大学/, 'good'],
  ['🟢 Cursor',            /Cursor/, 'good'],
];

(async () => {
  const summary = {};
  const details = {};

  for (const p of PLATFORMS) {
    console.log(`\n${'='.repeat(72)}\n  ${p.name}\n${'='.repeat(72)}`);
    const r = await call('goto', { url: p.url });
    if (!r.ok) { console.log('  ❌ 打开失败: ' + r.error); continue; }
    await nap(8000, 10000);
    for (let i = 0; i < 6; i++) { await call('scroll', { direction: 'down' }, 20000); await nap(1000, 1800); }

    const md = txt(await call('extract', { max_length: 60000, offset: 0 }));
    fs.writeFileSync(`C:\\D\\agent\\find-job\\data\\final-${p.name}.md`, md, 'utf8');
    console.log(`  全文 ${md.length} 字符\n`);

    const row = [];
    for (const [label, re, type] of CHECKS) {
      const hit = re.test(md);
      const icon = type === 'bad' ? (hit ? '🔴【仍在】' : '✅【已清除】') : (hit ? '🟢【有】' : '⚪【缺】');
      console.log(`  ${icon} ${label.replace(/^[🔴🟢] /, '')}`);
      row.push({ label: label.replace(/^[🔴🟢] /, ''), type, hit });
    }
    summary[p.name] = row;
    details[p.name] = md;
  }

  console.log(`\n\n${'='.repeat(72)}\n  总结：还有哪些问题\n${'='.repeat(72)}`);
  let allClean = true;
  for (const [name, row] of Object.entries(summary)) {
    const bad = row.filter(x => x.type === 'bad' && x.hit).map(x => x.label);
    const missing = row.filter(x => x.type === 'good' && !x.hit).map(x => x.label);
    console.log(`\n【${name}】`);
    if (bad.length) { console.log(`   🔴 残留问题: ${bad.join(' / ')}`); allClean = false; }
    else console.log('   ✅ 无编造/损坏内容');
    if (missing.length) console.log(`   ⚪ 缺失内容: ${missing.join(' / ')}`);
    else console.log('   ✅ 关键内容齐全');
  }
  console.log(`\n${allClean ? '🎉 四个平台的编造数字与损坏文本已全部清除' : '⚠️ 仍有平台存在残留问题'}`);

  // 猎聘重复条目专项确认
  console.log('\n\n=== 猎聘重复条目专项 ===');
  if (details['猎聘']) {
    const md = details['猎聘'];
    const wg = (md.match(/北京某某科技科技有限公司/g) || []).length;
    console.log(`  "北京某某科技科技有限公司" 出现 ${wg} 次`);
    const k = md.indexOf('工作经历');
    console.log('  工作经历片段:');
    console.log('  ' + md.slice(k, k + 500).replace(/\n{2,}/g, '\n'));
  }
  process.exit(0);
})();
