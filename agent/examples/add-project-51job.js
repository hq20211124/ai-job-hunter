#!/usr/bin/env node
/**
 * 前程无忧 —— 批量添加「项目经历」
 *
 * 原理：直接调页面 ProjectExperience 组件的 API 方法，不碰 UI。
 *      实测 8 个项目连续添加 8/8 成功。
 *
 * 用法：
 *   1. 准备一个 JSON 文件（数组），每项：
 *      { "name": "项目名", "start": "2024-02", "end": "2026-09",
 *        "tech": "技术栈（可选）", "describe": "项目描述" }
 *   2. node examples/add-project-51job.js projects.json
 *
 * 依赖：先启动本地代理（node agent.js）并确保扩展已连接。
 * 详细说明见 docs/ADD-PROJECTS.md
 */
const fs = require('fs');
const path = require('path');
const { call, pe, nap, goto } = require('../lib/client');

const FILE = process.argv[2];
if (!FILE) {
  console.error('用法: node examples/add-project-51job.js <projects.json>');
  process.exit(1);
}
const PROJECTS = JSON.parse(fs.readFileSync(path.resolve(FILE), 'utf8'));

/** 读现有项目名（用组件数据，不用 DOM —— 页面会折叠） */
async function currentProjects() {
  const r = await pe(`JSON.stringify((function(){
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => e.__vue__ && e.__vue__.$options.name === 'PCResume');
    return el ? (el.__vue__.projects || []).map(p => p.projectName) : [];
  })())`, 15000);
  try { return JSON.parse(r); } catch { return []; }
}

/** 添加一个项目 */
async function addProject(p) {
  const desc = p.tech ? `技术方案：${p.tech}\n\n${p.describe}` : p.describe;
  return await pe(`JSON.stringify((function(){
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => e.__vue__ && e.__vue__.$options.name === 'ProjectExperience');
    if (!el) return { error: 'ProjectExperience 组件未找到，确认已登录并打开简历页' };
    const v = el.__vue__;
    v.projectContinerForm.startTime   = ${JSON.stringify(p.start)};
    v.projectContinerForm.endTime     = ${JSON.stringify(p.end)};
    v.projectContinerForm.projectName = ${JSON.stringify(p.name)};
    v.projectContinerForm.describe    = ${JSON.stringify(desc)};
    v.projectContinerForm.companyName = ${JSON.stringify(p.company || '无')};
    v.submiting = false;
    try { v.getProjectExperienceAdd(); return { ok: true }; }
    catch (e) { return { error: String(e && e.message || e) }; }
  })())`, 25000);
}

(async () => {
  await goto('https://www.51job.com/resume/center');
  await nap(10000, 12000);

  const before = await currentProjects();
  console.log(`现有 ${before.length} 个项目: ${before.join(' / ')}\n`);

  let ok = 0, skip = 0, fail = 0;
  for (const p of PROJECTS) {
    console.log('—'.repeat(60));
    console.log(`${p.name}  (${p.start} ~ ${p.end})`);

    // 幂等：已存在就跳过（避免重跑产生重复项）
    if (before.includes(p.name)) {
      console.log('   ⏭️  已存在，跳过');
      skip++;
      continue;
    }

    const r = await addProject(p);
    if (r && r.includes && r.includes('"ok":true')) {
      console.log('   ✅ 已提交');
      ok++;
    } else {
      console.log(`   ❌ ${r}`);
      fail++;
    }
    await nap(6000, 8000);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`提交 ${ok} 个 / 跳过 ${skip} 个 / 失败 ${fail} 个`);

  console.log('\n核对（重新加载）：');
  await goto('https://www.51job.com/resume/center');
  await nap(11000, 13000);
  const after = await currentProjects();
  console.log(`   现在共 ${after.length} 个项目:`);
  after.forEach((n, i) => console.log(`      ${i + 1}. ${n}`));

  const missing = PROJECTS.filter(p => !after.includes(p.name));
  if (missing.length) console.log(`\n⚠️ 未生效: ${missing.map(p => p.name).join(', ')}`);
  else console.log('\n✅ 全部到位');

  process.exit(0);
})();
