// Force all shadow roots to open mode so the content script can access them.
// Must run at document_start in the MAIN world, before page scripts execute.
(function() {
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function(init) {
    return orig.call(this, { ...init, mode: 'open' });
  };
})();

// ── 页面主世界代码执行桥 ──────────────────────────────────────
// 内容脚本（隔离世界）无法访问页面的 Vue/React 实例与闭包变量。
// 这里在 MAIN world 接收 postMessage，执行代码并回传结果。
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.channel !== 'navagent-pageeval') return;
  const { id, code } = e.data;
  let out;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('return (' + code + ')');
    out = fn();
    // 结果序列化（避免循环引用）
    let serialized;
    try { serialized = JSON.parse(JSON.stringify(out)); }
    catch (_) { serialized = String(out); }
    window.postMessage({ channel: 'navagent-pageeval-reply', id, result: serialized }, '*');
  } catch (err) {
    window.postMessage({ channel: 'navagent-pageeval-reply', id, error: String(err && err.message || err) }, '*');
  }
});

// ── Vue 组件操作助手（在 MAIN world 直接改组件状态）─────────────
window.__navagentHelpers = {
  /** 找到元素上挂载的 Vue 组件实例（Vue2/Vue3 通用） */
  findVue(el) {
    if (!el) return null;
    return el.__vue__ || (el.__vueParentComponent && el.__vueParentComponent.proxy) || null;
  },
  /** 递归查找第一个满足条件的子组件 */
  findComponentByProp(root, propName) {
    if (!root) return null;
    const seen = new Set();
    const walk = (c, depth) => {
      if (!c || depth > 30 || seen.has(c)) return null;
      seen.add(c);
      const props = c.$props || (c.props) || {};
      if (propName in props) return c;
      const kids = c.$children || (c.subTree ? [c.subTree] : []);
      for (const k of kids) { const r = walk(k, depth + 1); if (r) return r; }
      return null;
    };
    return walk(root, 0);
  },
  /** 统计页面上所有 Vue 根实例 */
  countVueRoots() {
    const all = document.querySelectorAll('*');
    let n = 0;
    for (const el of all) { if (el.__vue__) { n++; if (n > 200) break; } }
    return n;
  },
};

// WebMCP bridge — exposes navigator.modelContext to the content script (ISOLATED world)
// via window.postMessage. Only this MAIN world script can access the page's modelContext.
window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.channel !== 'navagent-webmcp') return;
  const { id, method, args } = e.data;
  try {
    if (!navigator.modelContext) {
      window.postMessage({ channel: 'navagent-webmcp-reply', id, error: 'WebMCP not available on this page' }, '*');
      return;
    }
    let result;
    if (method === 'listTools') {
      const tools = await navigator.modelContext.tools();
      result = (tools || []).slice(0, 50).map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    } else if (method === 'callTool') {
      result = await navigator.modelContext.callTool(args.name, args.arguments || {});
    }
    window.postMessage({ channel: 'navagent-webmcp-reply', id, result }, '*');
  } catch (err) {
    window.postMessage({ channel: 'navagent-webmcp-reply', id, error: err.message }, '*');
  }
});
