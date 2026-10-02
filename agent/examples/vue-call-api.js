/**
 * 示例 1：Vue 应用 —— 绕过失效的 UI，直接调组件方法
 *
 * 场景：前程无忧「个人优势」的编辑入口是 CSS :hover 显示的，合成点击无效；
 *      即使强制显示出来，保存按钮走的 validate() 也需要完整表单上下文。
 *
 * 解法：拿元素上的 Vue 实例 → 读方法源码找到真正调 API 的那个 → 直接调用。
 *
 * 运行：node examples/vue-call-api.js
 */
const { pe, goto, nap, extract } = require('../lib/client');

// 在页面里按组件名找 Vue 实例
const findVue = (name) => `(function(){
  const el = Array.from(document.querySelectorAll('*'))
    .find(e => e.__vue__ && e.__vue__.$options.name === ${JSON.stringify(name)});
  return el ? el.__vue__ : null;
})()`;

const NEW_TEXT = [
  '7 年 Java 后端经验，擅长微服务架构与企业级系统开发。',
  '技术栈：Java、Spring Boot、Spring Cloud、Nacos、MySQL、Redis、Kafka、Docker。',
].join('\n');

(async () => {
  await goto('https://www.51job.com/resume/center');
  await nap(8000, 10000);

  // ── 第 1 步：先读源码，找到真正调 API 的方法 ──────────────────
  // 这一步最关键：UI 上的「保存」往往只是校验包装，
  // 真正的 API 调用藏在它调用的另一个方法里。
  const sources = await pe(`JSON.stringify((function(){
    const v = ${findVue('PersonalAdvantage')};
    if (!v) return { error: 'component not found' };
    const out = {};
    ['handleSave', 'saveSelfInfo'].forEach(k => {
      out[k] = v.$options.methods[k] ? v.$options.methods[k].toString() : '(none)';
    });
    return out;
  })())`);

  console.log('=== 方法源码 ===');
  if (typeof sources === 'string') {
    const o = JSON.parse(sources);
    for (const [k, s] of Object.entries(o)) {
      console.log(`\n[${k}]\n${s}\n`);
    }
    // 从源码可以看出：
    //   handleSave(refName) → this.$refs[refName].validate(ok => ok && this.saveSelfInfo())
    //   saveSelfInfo()      → this.$api.resumeApi.editSelfIntroduction(resumeId, {...})
    // 所以直接调 saveSelfInfo() 即可绕过校验。
  } else {
    console.log(sources);
    process.exit(1);
  }

  // ── 第 2 步：设表单值 + 直接调 API 方法 ──────────────────────
  const saved = await pe(`JSON.stringify((function(){
    const v = ${findVue('PersonalAdvantage')};
    if (!v) return { error: 'component not found' };
    v.advantageForm.desc = ${JSON.stringify(NEW_TEXT)};
    v.submiting = false;
    try {
      v.saveSelfInfo();          // ← 直达 API，不经 UI 校验
      return { called: true, len: v.advantageForm.desc.length };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  })())`, 30000);

  console.log('调用结果:', saved);
  await nap(8000, 10000);

  // ── 第 3 步：刷新页面，从服务端核对 ──────────────────────────
  await goto('https://www.51job.com/resume/center');
  await nap(10000, 12000);
  const md = await extract();

  console.log('\n=== 服务端核对 ===');
  console.log('  内容已保存:', md.includes('技术栈') ? '✅' : '❌');
  const k = md.indexOf('个人优势');
  console.log('  ' + md.slice(k, k + 300).replace(/\n{2,}/g, '\n'));

  process.exit(0);
})();
