/**
 * 广东全省岗位抓取 —— BOSS直聘
 * 逐城市搜索，每城人类节奏滚动，提取后解析
 */
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
const nap = (a = 1500, b = 3000) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));
const txt = r => String(r?.result?.result ?? '');
const OUT = 'C:\\D\\agent\\find-job';

// BOSS直聘城市代码
const CITIES = [
  { name: '广州', code: '101280100' },
  { name: '深圳', code: '101280600' },
  { name: '东莞', code: '101281600' },
  { name: '佛山', code: '101280800' },
  { name: '中山', code: '101281700' },
  { name: '惠州', code: '101280300' },
  { name: '珠海', code: '101280700' },
];

const KEYWORDS = ['Java', '高级Java', '后端开发'];

function parseJobs(md, city, kw) {
  const jobs = [];
  const re = /\[([^\]]{2,60})\]\((https:\/\/www\.zhipin\.com\/job_detail\/[^)]+)\)([^\n]*)\n+([\s\S]{0,220}?)\[([^\]]{1,40})\]\((https:\/\/www\.zhipin\.com\/gongsi\/[^)]+)\)\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const [, title, url, salaryRaw, mid, company, , loc] = m;
    jobs.push({
      city, keyword: kw,
      title: title.trim(), url,
      salary: salaryRaw.replace(/^[-–\s]*/, '').trim() || '详见职位页',
      exp: (mid.match(/(\d+-\d+年|应届|经验不限)/) || [])[1] || '',
      edu: (mid.match(/(大专|本科|硕士|博士|学历不限)/) || [])[1] || '',
      company: company.trim(),
      location: loc.trim(),
    });
  }
  return jobs;
}

(async () => {
  const all = [];
  const seen = new Set();

  for (const c of CITIES) {
    console.log(`\n${'='.repeat(60)}\n  ${c.name}  (city=${c.code})\n${'='.repeat(60)}`);
    for (const kw of KEYWORDS) {
      const url = `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(kw)}&city=${c.code}`;
      let r = await call('goto', { url });
      if (!r.ok) { console.log(`  ${kw}: ❌ ${r.error}`); continue; }
      await nap(3000, 4500);

      const title = txt(await call('scan', {}, 30000)).split('\n')[1] || '';
      const cityOk = title.includes(c.name) || title.includes('招聘');
      console.log(`  ${kw.padEnd(8)} → ${title.slice(0, 55)}`);

      // 滚动加载
      for (let i = 0; i < 5; i++) {
        await call('scroll', { direction: 'down' }, 25000);
        await nap(1300, 2400);
      }
      await nap(1500, 2500);

      r = await call('extract', { max_length: 50000, offset: 0 });
      const md = txt(r);
      const jobs = parseJobs(md, c.name, kw);
      let added = 0;
      for (const j of jobs) {
        if (seen.has(j.url)) continue;
        seen.add(j.url);
        all.push(j);
        added++;
      }
      console.log(`         解析 ${jobs.length} 条，新增 ${added} 条（累计 ${all.length}）`);
      await nap(2000, 3500);
    }
  }

  fs.writeFileSync(`${OUT}\\gd-jobs.json`, JSON.stringify(all, null, 2), 'utf8');
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`总计 ${all.length} 个去重职位 → gd-jobs.json`);
  const byCity = {};
  all.forEach(j => { byCity[j.city] = (byCity[j.city] || 0) + 1; });
  console.log('城市分布:', JSON.stringify(byCity, null, 2));
  console.log('\n前 20 条:');
  all.slice(0, 20).forEach((j, i) =>
    console.log(`${String(i + 1).padStart(2)}. [${j.city}] ${j.title} | ${j.company} | ${j.location}`));
  process.exit(0);
})();
