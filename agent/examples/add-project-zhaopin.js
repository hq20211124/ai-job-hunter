#!/usr/bin/env node
/**
 * 智联招聘 —— 批量添加 / 删除「项目经历」
 *
 * ⚠️ 四个关键坑（详见 docs/ADD-PROJECTS.md）：
 *   1. 选择器必须限定在 .project-exp-edit-wrapper 内
 *      （全局 input.ivu-input 会命中「个人信息」的字段，因为滚出视口的元素仍算"可见"）
 *   2. 日期字段必须【按回车】才提交（submit: true）
 *   3. 页面只渲染前 2 条项目，其余折叠 —— 判断成败必须读组件数据，不能数 DOM
 *   4. 删除是 deleteHandle(item) 传【对象】，传索引无效
 *
 * 用法：
 *   node examples/add-project-zhaopin.js projects.json            # 添加
 *   node examples/add-project-zhaopin.js --list                   # 只看列表
 *   node examples/add-project-zhaopin.js --delete "项目名"         # 删除
 */
const fs = require('fs');
const path = require('path');
const { call, pe, nap, goto, typeSel, clickSel } = require('../lib/client');

const SCOPE = '.project-exp-edit-wrapper';
const PARENT = '.resume-project-exp-wrapper';
const GV_P = `(function(){ const el=document.querySelector('${PARENT}'); return el && el.__vue__ ? el.__vue__ : null; })()`;

/** ★ 读项目列表 —— 从组件 props 读，不受页面折叠影响 */
async function currentProjects() {
  const r = await pe(`JSON.stringify((function(){
    const v = ${GV_P};
    if (!v) return null;
    return (v.ProjectExperience || []).map((p, i) => ({
      i, name: p.proExpProjectName, path: p.path
    }));
  })())`, 20000);
  try { return JSON.parse(r); } catch { return null; }
}

/** 进编辑态 */
async function enterEdit() {
  await goto('https://i.zhaopin.com/resume');
  await nap(9000, 11000);
  await clickSel('.profile-pre-edit', 1);
  await nap(4500, 6000);
}

/** 添加一个项目 */
async function addProject(p) {
  // 打开新增表单
  await clickSel('.project-exp-add', 1);
  await nap(4000, 5500);

  const desc = p.tech ? `技术方案：${p.tech}\n\n${p.describe}` : p.describe;

  // 填四个字段（作用域限定！日期回车！）
  await typeSel(`${SCOPE} input.ivu-input`, p.name, { nth: 1, fast: true });
  await nap(1500, 2500);
  await typeSel(`${SCOPE} input.ivu-input`, p.start, { nth: 2, submit: true, fast: true });
  await nap(1800, 2800);
  await typeSel(`${SCOPE} input.ivu-input`, p.end, { nth: 3, submit: true, fast: true });
  await nap(1800, 2800);
  await typeSel(`${SCOPE} textarea`, desc, { nth: 1, fast: true });
  await nap(2000, 3000);

  // 保存
  await clickSel('button.project-exp-edit-btns-sure', 1);
  await nap(6000, 8000);
}

/** 删除一个项目（必须传对象） */
async function deleteProject(idx) {
  return await pe(`JSON.stringify((function(){
    const v = ${GV_P};
    if (!v) return { error: '父组件未找到' };
    const item = v.ProjectExperience[${idx}];
    if (!item) return { error: 'index ' + ${idx} + ' 不存在' };
    try { v.deleteHandle(item); return { ok: true, name: item.proExpProjectName }; }
    catch (e) { return { error: String(e && e.message || e) }; }
  })())`, 20000);
}

(async () => {
  const arg = process.argv[2];

  // ---- --list ----
  if (arg === '--list') {
    await enterEdit();
    const list = await currentProjects();
    console.log(`共 ${list.length} 条:`);
    list.forEach(p => console.log(`  [${p.i}] ${p.name}`));
    process.exit(0);
  }

  // ---- --delete "名称" ----
  if (arg === '--delete') {
    const name = process.argv[3];
    if (!name) { console.error('用法: --delete "项目名"'); process.exit(1); }
    await enterEdit();
    let list = await currentProjects();
    const t = list.find(p => p.name === name);
    if (!t) { console.log(`未找到 "${name}"`); process.exit(1); }
    console.log(`删除 [${t.i}] ${t.name}`);
    console.log('  ' + await deleteProject(t.i));
    await nap(7000, 9000);
    // 核对
    await enterEdit();
    list = await currentProjects();
    console.log(`  剩余 ${list.length} 条，目标${list.some(p => p.name === name) ? '🔴 仍在' : '✅ 已删除'}`);
    process.exit(0);
  }

  // ---- 批量添加 ----
  if (!arg) {
    console.error('用法: node examples/add-project-zhaopin.js <projects.json>');
    process.exit(1);
  }
  const PROJECTS = JSON.parse(fs.readFileSync(path.resolve(arg), 'utf8'));

  await enterEdit();
  let list = await currentProjects();
  console.log(`现有 ${list.length} 个项目\n`);

  let ok = 0, skip = 0, fail = 0;
  for (const p of PROJECTS) {
    console.log('—'.repeat(60));
    console.log(`${p.name}  (${p.start} ~ ${p.end})`);

    // 幂等：已存在就跳过
    if (list.some(x => x.name === p.name)) {
      console.log('   ⏭️  已存在，跳过');
      skip++;
      continue;
    }

    await addProject(p);

    // ★ 用组件数据验证，不数 DOM
    const now = await currentProjects();
    if (now.some(x => x.name === p.name)) {
      console.log(`   ✅ 成功（共 ${now.length} 条）`);
      ok++;
      list = now;
    } else {
      console.log(`   ⚠️ 未确认（共 ${now.length} 条）`);
      fail++;
    }
    await nap(2000, 3000);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`成功 ${ok} / 跳过 ${skip} / 失败 ${fail}`);

  await enterEdit();
  const final = await currentProjects();
  console.log(`\n最终共 ${final.length} 个项目:`);
  final.forEach(p => console.log(`  [${p.i}] ${p.name}`));
  process.exit(0);
})();
