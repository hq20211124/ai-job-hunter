/**
 * 示例 2：React 应用 —— 走 fiber 树调用隐藏按钮的事件处理器
 *
 * 场景：某招聘网站「工作经历」的删除按钮是 CSS :hover 才显示的（display:none），
 *      即使强制显示出来，普通 click 也不生效 —— 因为它是 React 16 渲染的。
 *
 * 解法：React 会把内部 fiber 挂在 DOM 元素上（__reactInternalInstance$xxx）。
 *      沿 fiber 树向上找带 onClick 的 props，直接调用它。
 *
 * 本示例以「删除一条重复的工作经历」为例，并处理 Ant Design 的二次确认弹窗。
 *
 * ⚠️ 示例中的选择器和公司名占位符需要按目标网站实际情况替换。
 * ⚠️ 这是写操作，跑之前请确认你真的要删那一条。
 *
 * 运行：node examples/react-fiber-click.js
 */
const { pe, goto, extract, scroll, nap } = require('../lib/client');

// ── 在页面里执行的代码（必须是单个表达式，所以都用 IIFE 包起来）──

/** 列出工作经历条目 */
const LIST = `JSON.stringify(
  Array.from(document.querySelectorAll('.work-exp-view-item-inner')).map((el, i) => ({
    idx: i + 1,
    title: (el.querySelector('.item-title') || {}).textContent,
    time: (el.querySelector('.item-title-time') || {}).textContent
  }))
)`;

/** 调用第 N 条删除按钮的 onClick */
const makeDelete = (nth) => `JSON.stringify((function(){
  // React 16/17 的元素上挂的是 __reactInternalInstance$xxx
  const fk = (n) => n ? Object.keys(n).find(k => k.startsWith('__reactInternalInstance')) : null;

  const el = Array.from(document.querySelectorAll('.work-exp-view-item-inner'))[${nth - 1}];
  if (!el) return { error: 'item not found' };

  const del = el.querySelector('.action-delete');
  if (!del) return { error: '.action-delete not found' };

  const key = fk(del);
  if (!key) return { error: 'not a React element (no __reactInternalInstance)' };

  const fiber = del[key];
  const props = fiber && (fiber.memoizedProps || fiber.pendingProps);
  if (!props || typeof props.onClick !== 'function') return { error: 'no onClick handler' };

  // 构造一个最小事件对象；多数实现不读它，但传了更保险
  props.onClick({
    preventDefault() {}, stopPropagation() {},
    target: del, currentTarget: del, type: 'click', nativeEvent: {}
  });
  return { called: true, target: (el.querySelector('.item-title-time') || {}).textContent };
})())`;

/** 点掉 Ant Design 的确认弹窗 */
const CONFIRM = `JSON.stringify((function(){
  // ⚠️ Ant Design 会在两个汉字之间插空格，DOM 里是「确 定」而不是「确定」，
  //    所以这里按类名匹配，不要按文字匹配。
  const sel = '.ant-modal-confirm-btns .ant-btn-primary, .ant-modal-confirm .ant-btn-primary';
  const btns = Array.from(document.querySelectorAll(sel));
  if (!btns.length) {
    const all = Array.from(document.querySelectorAll('.ant-modal button'));
    return { error: 'no primary btn', available: all.map(b => (b.textContent || '').trim()) };
  }
  btns[0].click();
  return { clicked: true, text: (btns[0].textContent || '').trim() };
})())`;

// ── 主流程 ──

(async () => {
  const TARGET_URL = 'https://example.com/resume/edit';   // ← 换成目标页面
  const DUPLICATE_INDEX = 2;                              // ← 要删第几条

  await goto(TARGET_URL);
  await nap(8000, 10000);
  await scroll('down', 3);        // 让懒加载的内容渲染出来

  console.log('① 删除前的条目');
  let r = await pe(LIST);
  if (typeof r === 'string') {
    JSON.parse(r).forEach((w) => console.log(`   ${w.idx}. ${w.title}  ${w.time}`));
  } else {
    console.log('   读取失败:', JSON.stringify(r));
    process.exit(1);
  }

  console.log(`\n② 触发第 ${DUPLICATE_INDEX} 条的删除`);
  r = await pe(makeDelete(DUPLICATE_INDEX), 20000);
  console.log('   ', typeof r === 'string' ? r : JSON.stringify(r));
  await nap(3500, 5000);

  console.log('\n③ 点掉确认弹窗');
  r = await pe(CONFIRM, 20000);
  console.log('   ', typeof r === 'string' ? r : JSON.stringify(r));
  await nap(6000, 8000);

  console.log('\n④ 刷新页面，从服务端核对');
  await goto(TARGET_URL);
  await nap(10000, 12000);
  await scroll('down', 4);

  r = await pe(LIST);
  if (typeof r === 'string') {
    const list = JSON.parse(r);
    console.log('   剩余条目:');
    list.forEach((w) => console.log(`      ${w.idx}. ${w.title}  ${w.time}`));
  }

  const md = await extract(50000);
  console.log('\n   页面里还找得到那条重复记录吗:', md.includes('2024/02 - 2026/02') ? '🔴 还在' : '✅ 已删除');

  process.exit(0);
})();
