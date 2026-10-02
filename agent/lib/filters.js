/**
 * 岗位过滤的公共规则 —— 四个平台的投递脚本共用这一份。
 *
 * 之前每个平台的投递脚本各抄了一遍黑名单，改一处要改四处，很容易漏。
 * 统一到这里。
 *
 * ⚠️ 名单是活的：每投一批，检查一遍实际投出去的公司，
 *    发现新的外包商就补进 OUTSOURCE_COMPANY。
 */

/** 外包 / 人力 / 派遣 / 猎头 类公司 —— 按公司名排除 */
const OUTSOURCE_COMPANY = /人力|人才|劳务|外服|派遣|外包|企业管理|万宝盛华|人瑞|人惠|中智|仁联|科锐|高凡|拓保|博才|易才|朗钧|外企德科|FESCO|佰钧成|中科铭天|腾信软创|网新|赛意|华立数字|中软国际|软通动力|中电金信|文思海辉|博彦|法本|同海科技|同方鼎欣|中科软|众合|贸易商行|商行|人力资源/i;

/** 非开发岗 / 级别严重不符 —— 按职位名排除 */
const NON_DEV_TITLE = /测试|运维|实施|产品经理|销售|运营|讲师|UI设计|视觉设计|硬件|结构|电气|机械|采购|财务|编辑|设计师|实习|应届|校招|初级|前台|客服/i;

/** 华为系社招基本是 OD 外包，单独处理（要匹配公司名开头） */
const HUAWEI_OD = /^华为|华为技术|华为云/;

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
  const NEG = /(无需|不需要|不用|非|不)驻场|自研非外包|非外包|无外包|不是外包|不涉及外包/;
  const hits = [];
  if (/驻场/.test(jdText) && !NEG.test(jdText)) hits.push('驻场');
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
  if (!title) return '无标题';
  if (NON_DEV_TITLE.test(title)) return '标题不像开发岗';
  if (HUAWEI_OD.test(company || '')) return '华为系（社招基本是 OD 外包）';
  if (OUTSOURCE_COMPANY.test(company || '')) return `公司名命中外包黑名单（${company}）`;
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
  OUTSOURCE_COMPANY,
  NON_DEV_TITLE,
  HUAWEI_OD,
  outsourceSignal,
  skipReason,
  parseSalary,
};
