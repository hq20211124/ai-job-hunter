/**
 * 岗位抓取 —— BOSS直聘
 *
 * 逐「城市 × 关键词」搜索，按人类节奏滚动加载，从页面 Markdown 里解析职位。
 *
 * 用法:
 *   node scrape-jobs.js                                  # 用默认城市和关键词
 *   node scrape-jobs.js --cities 广州,深圳,东莞
 *   node scrape-jobs.js --cities 广州 --keywords Java,Python,前端
 *   node scrape-jobs.js --city-codes 101280100,101280600
 *   node scrape-jobs.js --verify                         # 只验证城市码，不抓取
 *   node scrape-jobs.js --out data/gd-jobs.json --pages 8
 *
 * 选项:
 *   --cities      城市名，逗号分隔（从内置表查码）；特殊值 all-guangdong = 广东全省 21 市
 *   --city-codes  直接给 BOSS 城市码，逗号分隔（表里没有的城市用这个）
 *   --keywords    搜索关键词，逗号分隔
 *   --out         输出文件（默认 data/gd-jobs.json）
 *   --pages       每个「城市 × 关键词」向下滚动几次（默认 5，越大抓得越多也越慢）
 *   --verify      只逐个打开城市页并打印页面标题，用来核对城市码对不对
 *   --help
 *
 * ⚠️ 城市码不能靠规律猜！不同平台编码体系完全不同，同一平台内也不连续。
 *    拿到新城市码后，务必先跑一次 `--verify` 核对页面标题里的城市名。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

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
const ROOT = path.resolve(__dirname, '..');

/**
 * BOSS直聘城市码表 —— 下面这些**全部实测核对过**（用页面标题里的城市名逐条比对）。
 * 表里没有的城市：在 BOSS 网页上手动切到那个城市，看地址栏 city= 后面的数字，
 * 拿到后用 `--city-codes` 传入，并先跑 `--verify` 确认。
 *
 * 💡 广东 21 个地级市是**连续区间**：101280100（广州）→ 101282100（汕尾），步长 100。
 */
const CITY_TABLE = {
  '全国': '100010',
  // ── 广东 21 市（实测） ──
  '广州': '101280100',
  '韶关': '101280200',
  '惠州': '101280300',
  '梅州': '101280400',
  '汕头': '101280500',
  '深圳': '101280600',
  '珠海': '101280700',
  '佛山': '101280800',
  '肇庆': '101280900',
  '湛江': '101281000',
  '江门': '101281100',
  '河源': '101281200',
  '清远': '101281300',
  '云浮': '101281400',
  '潮州': '101281500',
  '东莞': '101281600',
  '中山': '101281700',
  '阳江': '101281800',
  '揭阳': '101281900',
  '茂名': '101282000',
  '汕尾': '101282100',
  // ── 其它主要城市（官方文档，用前建议 --verify） ──
  '北京': '101010100',
  '上海': '101020100',
  '杭州': '101210100',
  '成都': '101270100',
  '武汉': '101200100',
  '南京': '101190100',
  '西安': '101110100',
};

/** 广东全省 —— 想广撒网时可以用它一次铺开 */
const GUANGDONG = [
  '广州', '深圳', '东莞', '佛山', '中山', '惠州', '珠海',
  '江门', '肇庆', '汕头', '湛江', '茂名', '韶关', '梅州',
  '汕尾', '河源', '阳江', '清远', '潮州', '揭阳', '云浮',
];

const DEFAULTS = {
  cities: ['广州', '深圳', '东莞', '佛山', '中山', '惠州', '珠海'],
  keywords: ['Java', '高级Java', '后端开发'],
  out: path.join(ROOT, 'data', 'gd-jobs.json'),
  pages: 5,
};

const HELP = `
岗位抓取（BOSS直聘）

用法:
  node scrape-jobs.js [选项]

选项:
  --cities 广州,深圳,东莞      城市名（默认广东 7 城）
                               特殊值 all-guangdong = 广东全省 21 市
  --city-codes 101280100,...   直接给城市码（表里没有的城市用这个）
  --keywords Java,后端开发      搜索关键词（默认 Java,高级Java,后端开发）
  --out data/gd-jobs.json      输出文件
  --pages 5                    每个「城市 × 关键词」向下滚动几次
  --verify                     只打开城市页核对城市码，不抓取
  --help

城市码表内置了**广东全省 21 市（全部实测核对过）** + 几个主要城市。
表里没有的：在 BOSS 网页上手动切到那个城市，看地址栏 city= 后面的数字，再用 --city-codes 传入。

示例:
  node scrape-jobs.js --cities 广州 --keywords Java,Python,前端
  node scrape-jobs.js --cities all-guangdong
  node scrape-jobs.js --city-codes 101280100,101280600 --pages 8
  node scrape-jobs.js --verify
`.trim();

/** 极简参数解析：--key value 形式 + 布尔开关 */
function parseArgs(argv) {
  const out = { _flags: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._flags.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; continue; }
    out[key] = next;
    i++;
  }
  return out;
}

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

/**
 * 读页面标题（scan 输出的第二行）。
 *
 * ⚠️ BOSS 的城市页标题是异步渲染的：等得太短会读到通用标题
 *    「求职|找工作|招聘信息-BOSS直聘」，看起来像城市码错了。
 *    所以这里轮询重试，直到标题里出现城市名或重试次数用尽。
 */
async function readTitle(cityName, tries = 4) {
  let title = '';
  for (let i = 0; i < tries; i++) {
    title = txt(await call('scan', {}, 30000)).split('\n')[1] || '';
    if (!cityName || title.includes(cityName)) return title;
    // 还是通用标题 → 再等等
    if (!/求职\|找工作\|招聘信息/.test(title)) return title;
    await nap(2500, 3500);
  }
  return title;
}

/** 解析 --cities / --city-codes，返回 [{name, code}] */
function resolveCities(args) {
  const list = [];
  if (typeof args['city-codes'] === 'string') {
    args['city-codes'].split(',').map(s => s.trim()).filter(Boolean).forEach(code => {
      // 反查表里的名字，方便日志可读
      const name = Object.keys(CITY_TABLE).find(k => CITY_TABLE[k] === code) || code;
      list.push({ name, code });
    });
  }
  if (typeof args.cities === 'string') {
    const names = args.cities.trim() === 'all-guangdong'
      ? GUANGDONG
      : args.cities.split(',').map(s => s.trim()).filter(Boolean);
    names.forEach(name => {
      const code = CITY_TABLE[name];
      if (!code) {
        console.error(`⚠️ 城市「${name}」不在城市码表里，已跳过。`);
        console.error(`   在 BOSS 网页切到该城市，取地址栏 city= 的数字，用 --city-codes 传入。`);
        return;
      }
      list.push({ name, code });
    });
  }
  if (!list.length) {
    return DEFAULTS.cities.map(name => ({ name, code: CITY_TABLE[name] }));
  }
  // 去重
  const seen = new Set();
  return list.filter(c => { if (seen.has(c.code)) return false; seen.add(c.code); return true; });
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { console.log(HELP); process.exit(0); }

  const cities = resolveCities(args);
  const keywords = typeof args.keywords === 'string'
    ? args.keywords.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULTS.keywords;
  const outFile = typeof args.out === 'string'
    ? path.resolve(process.cwd(), args.out)
    : args.out;
  const pages = Number(args.pages) || DEFAULTS.pages;

  // --verify：只核对城市码，不抓取
  if (args.verify) {
    console.log('核对城市码（看页面标题里的城市名对不对）\n');
    let bad = 0;
    for (const c of cities) {
      const url = `https://www.zhipin.com/web/geek/jobs?query=Java&city=${c.code}`;
      const r = await call('goto', { url });
      if (!r.ok) { console.log(`  ${c.code}  期望=${c.name}  ❌ 打开失败`); bad++; continue; }
      await nap(5000, 6500);
      const title = await readTitle(c.name);
      const ok = title.includes(c.name);
      if (!ok) bad++;
      console.log(`  ${c.code}  期望=${c.name}  ${ok ? '✅' : '❌'}  ${title.slice(0, 50)}`);
    }
    console.log(`\n${bad ? `⚠️ ${bad} 个城市码对不上，核对后再抓。` : '✅ 全部正确。'}`);
    process.exit(0);
  }

  console.log(`城市   : ${cities.map(c => c.name).join('、')}`);
  console.log(`关键词 : ${keywords.join('、')}`);
  console.log(`输出   : ${outFile}`);
  console.log(`滚动   : 每组合 ${pages} 次\n`);

  const all = [];
  const seen = new Set();

  for (const c of cities) {
    console.log(`\n${'='.repeat(60)}\n  ${c.name}  (city=${c.code})\n${'='.repeat(60)}`);
    for (const kw of keywords) {
      const url = `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(kw)}&city=${c.code}`;
      let r = await call('goto', { url });
      if (!r.ok) { console.log(`  ${kw}: ❌ ${r.error}`); continue; }
      await nap(3000, 4500);

      const title = await readTitle(c.name);
      console.log(`  ${kw.padEnd(8)} → ${title.slice(0, 55)}`);

      // 滚动加载
      for (let i = 0; i < pages; i++) {
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

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2), 'utf8');
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`总计 ${all.length} 个去重职位 → ${outFile}`);
  const byCity = {};
  all.forEach(j => { byCity[j.city] = (byCity[j.city] || 0) + 1; });
  console.log('城市分布:', JSON.stringify(byCity, null, 2));
  console.log('\n前 20 条:');
  all.slice(0, 20).forEach((j, i) =>
    console.log(`${String(i + 1).padStart(2)}. [${j.city}] ${j.title} | ${j.company} | ${j.location}`));
  process.exit(0);
})();
