/**
 * 岗位过滤的公共规则 —— 四个平台的投递脚本共用这一份。
 *
 * 规则本身放在 ../filters.json，这样 Python 脚本（build-queue.py / rank-jobs.py）
 * 和 JS 脚本读的是同一份名单，不用两边各改一遍。
 *
 * ⚠️ 名单是活的：每投一批，检查一遍实际投出去的公司，
 *    发现新的外包商就补进 agent/filters.json。
 */
const fs = require('fs');
const path = require('path');

const CFG_PATH = path.resolve(__dirname, '..', 'filters.json');

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
} catch (e) {
  throw new Error(`读不到筛选规则 ${CFG_PATH}：${e.message}`);
}

/** 把配置里的字符串数组编译成正则数组 */
const compile = (arr) => (arr || []).map(p => new RegExp(p, 'i'));

const companyPatterns = compile(cfg.excludeCompany);
const companyStrictPatterns = compile(cfg.excludeCompanyStrict);
const companyOddPatterns = compile(cfg.excludeCompanyOdd);
const titlePatterns = compile(cfg.excludeTitle);
const devTitleRe = new RegExp(cfg.devTitleHint || '.', 'i');
const ONSITE_NEG = new RegExp(cfg.onsiteNegation || '$^');
const ONSITE = new RegExp(cfg.onsiteKeyword || '驻场');

/** 兼容旧用法：一个能直接 .test(company) 的大正则 */
const OUTSOURCE_COMPANY = new RegExp((cfg.excludeCompany || []).join('|'), 'i');

/** 兼容旧用法：一个能直接 .test(title) 的大正则 */
const NON_DEV_TITLE = new RegExp((cfg.excludeTitle || []).join('|'), 'i');

/**
 * JD 层面的驻场检测。
 *
 * ⚠️ 必须处理否定语境：有的公司会专门写「自研非外包」「无需驻场」，那是好事，不能误杀。
 *    （实测：某交易所旗下金融科技公司的 JD 里写着「自研非外包」，差点被误排除）
 *
 * @param {string} jdText 职位详情页的正文
 * @returns {string[]} 命中的信号词
 */
function outsourceSignal(jdText) {
  const hits = [];
  if (ONSITE.test(jdText) && !ONSITE_NEG.test(jdText)) hits.push(cfg.onsiteKeyword || '驻场');
  return hits;
}

/**
 * 判断一个岗位该不该跳过（只看职位名和公司名，不看 JD）。
 *
 * @param {string} title   职位名
 * @param {string} company 公司名
 * @returns {string|null}  跳过原因；null 表示可以投
 */
function skipReason(title, company) {
  const t = title || '';
  const c = company || '';
  if (!t) return '无标题';
  if (!devTitleRe.test(t)) return '不是开发岗';
  for (const p of titlePatterns) if (p.test(t)) return `标题命中排除规则（${p.source}）`;
  for (const p of companyStrictPatterns) if (p.test(c)) return `公司命中严格黑名单（${p.source}）`;
  for (const p of companyPatterns) if (p.test(c)) return `公司名命中外包黑名单（${c}）`;
  for (const p of companyOddPatterns) if (p.test(c)) return `非软件行业挂 IT 岗（${p.source}）`;
  return null;
}

/** 详情页薪资文本 → { min, max, raw }（单位：元/月） */
function parseSalary(raw) {
  // ⚠️ 先去掉「·14薪」这类薪水月数，否则「14」会被当成薪资数字混进来
  //    （实测 '30-40K·14薪' 会被解析成 min=14000，正确是 30000）
  const s = String(raw || '')
    .replace(/[·・.]\s*\d+\s*薪.*$/, '')
    .replace(/\s+/g, '');
  if (!s) return null;
  // 整串的主单位：范围写法里单位只写一次（「1.5-2.5万」），要作用于两个数
  const hasWan = /万/.test(s);
  const hasK = /[Kk]/.test(s);
  const nums = [];
  const re = /(\d+(?:\.\d+)?)\s*([Kk千万]?)/g;
  let m;
  while ((m = re.exec(s))) {
    let v = parseFloat(m[1]);
    const u = m[2];
    if (u === 'K' || u === 'k') v *= 1000;
    else if (u === '万') v *= 10000;
    else if (u === '千') v *= 1000;
    else if (hasWan) v *= 10000;        // 裸数字跟随整串单位
    else if (hasK) v *= 1000;
    else if (v < 1000) v *= 1000;       // 「8-10K」里的裸数字按 K 处理
    nums.push(Math.round(v));
  }
  const vals = nums.filter(v => v >= 1000 && v <= 1000000);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), raw: String(raw).replace(/\s+/g, '') };
}

module.exports = {
  config: cfg,
  configPath: CFG_PATH,
  OUTSOURCE_COMPANY,
  NON_DEV_TITLE,
  outsourceSignal,
  skipReason,
  parseSalary,
};
