/**
 * 示例 3：多平台简历审计 —— 批量检查各平台在线简历的一致性
 *
 * 用途：同一份简历填到多个招聘网站，很容易出现「这个平台改了、那个平台忘了」。
 *      这个脚本把每个平台的在线简历读下来，逐项检查：
 *        · bad  类：不该出现的内容（编造的数字、写坏的文本、过时的说法）
 *        · good 类：应该出现的内容（技能栈、关键项目、完整的工作经历）
 *
 * 用法：
 *   1. 先在浏览器里登录好所有平台
 *   2. 按自己的情况改下面的 PLATFORMS 和 CHECKS
 *   3. node examples/resume-audit.js
 *
 * 运行前请确认代理已启动：node agent.js
 */
const fs = require('fs');
const path = require('path');
const { goto, extract, scroll, nap } = require('../lib/client');

// ── 要审计的平台（按需增删）──
const PLATFORMS = [
  { name: 'BOSS直聘', url: 'https://www.zhipin.com/web/geek/resume' },
  { name: '智联招聘', url: 'https://i.zhaopin.com/resume' },
  { name: '猎聘',     url: 'https://c.liepin.com/resume/edit' },
  { name: '前程无忧', url: 'https://www.51job.com/resume/center' },
];

// ── 检查项 ──
// [标签, 正则, 类型]   类型: 'bad' = 不该有, 'good' = 应该有
// ⚠️ 按自己的情况改。下面只是示例。
const CHECKS = [
  // 不该出现的内容
  ['编造的百分比',    /\d+%\s*以上|约\s*\d+%/,                              'bad'],
  ['写坏的文本',      /\[object Object\]|undefined|null/,                   'bad'],
  ['过时的技术表述',  /10\s*年前的单体|老掉牙/,                              'bad'],

  // 应该出现的内容
  ['技能栈',          /技术栈/,                                            'good'],
  ['最近一份工作',    /某某科技有限公司/,                                    'good'],
  ['关键项目',        /某某平台|某某系统/,                                   'good'],
  ['学历',            /某某大学/,                                          'good'],
];

const OUT_DIR = path.join(__dirname, '..', '..', 'data');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {};

  for (const p of PLATFORMS) {
    console.log(`\n${'='.repeat(72)}\n  ${p.name}\n${'='.repeat(72)}`);

    const r = await goto(p.url);
    if (!r.ok) { console.log('  ❌ 打开失败:', r.error); continue; }
    await nap(7000, 9000);

    // 滚到底，触发懒加载 / 折叠内容
    await scroll('down', 6);

    const md = await extract(60000);
    const outFile = path.join(OUT_DIR, `audit-${p.name}.md`);
    fs.writeFileSync(outFile, md, 'utf8');
    console.log(`  读到 ${md.length} 字符 → ${path.basename(outFile)}\n`);

    const row = [];
    for (const [label, re, type] of CHECKS) {
      const hit = re.test(md);
      const icon = type === 'bad'
        ? (hit ? '🔴 仍存在' : '✅ 已清除')
        : (hit ? '🟢 已有  ' : '⚪ 缺失  ');
      console.log(`  ${icon}  ${label}`);
      row.push({ label, type, hit });
    }
    summary[p.name] = row;
  }

  // ── 汇总 ──
  console.log(`\n\n${'='.repeat(72)}\n  汇总：还需要改什么\n${'='.repeat(72)}`);
  for (const [name, row] of Object.entries(summary)) {
    const bad = row.filter((x) => x.type === 'bad' && x.hit).map((x) => x.label);
    const missing = row.filter((x) => x.type === 'good' && !x.hit).map((x) => x.label);

    console.log(`\n【${name}】`);
    console.log(bad.length ? `   🔴 残留问题: ${bad.join(' / ')}` : '   ✅ 无异常内容');
    console.log(missing.length ? `   ⚪ 缺失内容: ${missing.join(' / ')}` : '   ✅ 关键内容齐全');
  }

  console.log('\n各平台原文已存到 data/audit-*.md，可以自己再看一遍。');
  process.exit(0);
})();
