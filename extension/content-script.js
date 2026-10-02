(() => {
  'use strict';

  // Import functions from lib.js (loaded before us via manifest js array)
  const {
    nativeTags, interactiveRoles, trunc, getZonePreview, getDirectText, getElementText,
    isVisible, isStronglyClickable, isWeaklyClickable, isClickable,
    isContainer, inferZoneLabel, getKind,
  } = globalThis.__NavAgentCore;

  let registry = [];
  let currentPage = 0;       // pagination state
  const MAX_TEXT = 60;
  const PAGE_SIZE = 25;

  // Zone state
  let zones = [];              // detected zones: { id, label, type, el, elements[], preview }
  let activeZoneId = null;     // null = overview mode, number = drilled into zone
  let zoneRegistry = [];       // elements of the active zone (for zone-local indexing)
  const ZONE_PAGE_SIZE = 20;
  let _dbg = ''; // debug stats for empty scans

  // ── Zone detection ──────────────────────

  const LANDMARK_SELECTORS = [
    'header, [role="banner"]',
    'nav, [role="navigation"]',
    'aside, [role="complementary"]',
    'footer, [role="contentinfo"]',
    'form[aria-label], form[name]',
    '[role="search"]',
    '[role="dialog"], dialog, [aria-modal="true"]',
  ];

  const REPEATED_SELECTORS = [
    'article', '[role="article"]', '[role="listitem"]',
  ];

  function getDepth(el) {
    let d = 0, n = el;
    while (n) {
      if (n.parentElement) { d++; n = n.parentElement; }
      else if (n.parentNode && n.parentNode.nodeType === 11) { d++; n = n.parentNode.host; } // cross shadow boundary
      else break;
    }
    return d;
  }

  // querySelectorAll that also searches inside open shadow roots
  function deepQuerySelectorAll(root, selector) {
    const results = [...root.querySelectorAll(selector)];
    const visit = (node) => {
      if (!node.shadowRoot) return;
      results.push(...node.shadowRoot.querySelectorAll(selector));
      node.shadowRoot.querySelectorAll('*').forEach(visit);
    };
    root.querySelectorAll('*').forEach(visit);
    return results;
  }

  // Node.contains() doesn't cross shadow DOM boundaries — this does
  function deepContains(ancestor, descendant) {
    let node = descendant;
    while (node) {
      if (node === ancestor) return true;
      if (node.parentElement) { node = node.parentElement; }
      else if (node.parentNode && node.parentNode.nodeType === 11) { node = node.parentNode.host; }
      else break;
    }
    return false;
  }

  function detectZones() {
    const zoneContainers = [];
    const seen = new Set();

    for (const sel of LANDMARK_SELECTORS) {
      for (const el of deepQuerySelectorAll(document, sel)) {
        if (!isVisible(el) || seen.has(el)) continue;
        seen.add(el);
        zoneContainers.push({ el, label: inferZoneLabel(el), type: 'landmark', depth: getDepth(el) });
      }
    }

    for (const sel of REPEATED_SELECTORS) {
      for (const el of deepQuerySelectorAll(document, sel)) {
        if (!isVisible(el) || seen.has(el)) continue;
        seen.add(el);
        zoneContainers.push({ el, label: inferZoneLabel(el), type: 'repeated', depth: getDepth(el) });
      }
    }

    // Sort by depth descending so innermost zone wins during assignment
    zoneContainers.sort((a, b) => b.depth - a.depth);
    return zoneContainers;
  }

  // ── Scan ──────────────────────

  function scan() {
    registry = [];
    currentPage = 0;
    zones = [];
    activeZoneId = null;
    zoneRegistry = [];
    const seen = new Set();
    const WALK_SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','LINK','META','COLGROUP','COL']);
    const MAX_VISIT = 8000; // safety cap to prevent timeout on huge DOMs
    let _v = 0, _sh = 0, _inv = 0; // debug counters

    function walk(el, inside = false) {
      if (++_v > MAX_VISIT) return;
      if (el.nodeType!==1 || WALK_SKIP.has(el.tagName)) return;
      // Traverse same-origin iframes (micro-frontend architectures: OVH Manager, etc.)
      if (el.tagName === 'IFRAME') {
        try { const doc = el.contentDocument; if (doc?.body) for (const c of doc.body.children) walk(c, false); }
        catch {} // cross-origin → SecurityError → skip silently
        return;
      }
      if (!isVisible(el)) {
        // Still traverse shadow roots even if host is invisible (e.g. LinkedIn's #interop-outlet has height:0 but its shadow root contains visible fixed-position modals)
        if (el.shadowRoot) { _sh++; for (const c of el.shadowRoot.children) walk(c, false); }
        _inv++; return;
      }
      const clickable = isClickable(el, inside);

      if (clickable) {
        const rect = el.getBoundingClientRect();
        // display:contents elements have no box — always expand into children
        const isContents = rect.width === 0 && rect.height === 0;
        if (isContents || isContainer(el, rect)) {
          for (const c of el.children) walk(c, false);
          if (el.shadowRoot) { _sh++; for (const c of el.shadowRoot.children) walk(c, false); }
          return;
        }

        const raw = getElementText(el);
        const text = raw || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || '';
        const roleKey = el.getAttribute('role') || '';
        const key = `${Math.round(rect.x)},${Math.round(rect.y)},${roleKey},${text.substring(0,30)}`;
        if (!seen.has(key) && (text || rect.width >= 5)) {
          seen.add(key);
          registry.push({ el, text: trunc(text||'∅', MAX_TEXT), kind: getKind(el), rect });
        }
      }
      for (const c of el.children) walk(c, inside || clickable);
      if (el.shadowRoot) { _sh++; for (const c of el.shadowRoot.children) walk(c, inside || clickable); }
    }

    // 裸 SVG / XML 文档没有 body，直接以 documentElement 作为根（否则这里会抛异常）
    const scanRoot = document.body || document.documentElement;
    if (!scanRoot) return { ok: false, error: '文档没有可扫描的根节点' };

    for (const c of scanRoot.children) walk(c, false);
    if (scanRoot.shadowRoot) for (const c of scanRoot.shadowRoot.children) walk(c, false);

    // Force-scan shadow roots for overlay/modal content (e.g. LinkedIn #interop-outlet)
    // These hosts often have height:0 and their children may also fail isVisible()
    // because they inherit layout from the invisible host. We directly query for
    // clickable elements inside and add them to the registry.
    scanRoot.querySelectorAll('*').forEach(host => {
      if (!host.shadowRoot || host.shadowRoot.children.length === 0) return;
      const sr = host.shadowRoot;
      sr.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="link"], [role="switch"], [role="textbox"], [contenteditable="true"], [tabindex]').forEach(el => {
        try {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return;
          const raw = el.textContent?.trim()?.replace(/\s+/g, ' ') || '';
          const text = raw || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || '';
          const key = `${Math.round(r.x)},${Math.round(r.y)},${text.substring(0,30)}`;
          if (!seen.has(key) && (text || r.width >= 5)) {
            seen.add(key);
            registry.push({ el, text: trunc(text||'∅', MAX_TEXT), kind: getKind(el), rect: r });
          }
        } catch {}
      });
    });

    // Safety scan: catch widget-role elements that the walk may have missed
    // (e.g., due to MAX_VISIT cap on very large DOMs like Amazon checkout)
    const registeredEls = new Set(registry.map(r => r.el));
    for (const sel of ['[role="switch"]', '[role="slider"]', '[role="spinbutton"]']) {
      deepQuerySelectorAll(document, sel).forEach(el => {
        if (registeredEls.has(el)) return;
        try {
          if (!isVisible(el)) return;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          const raw = getElementText(el);
          const text = raw || el.getAttribute('aria-label') || el.getAttribute('title') || '';
          if (text || r.width >= 5) {
            registry.push({ el, text: trunc(text||'∅', MAX_TEXT), kind: getKind(el), rect: r });
          }
        } catch {}
      });
    }

    // Safety scan: catch light DOM clickable elements the walk may have missed
    // Covers main frame + same-origin iframes
    const registeredElsFull = new Set(registry.map(r => r.el));
    let _safety = 0;
    const safetySel = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"], [tabindex]';
    function safetyScan(root) {
      root.querySelectorAll(safetySel).forEach(el => {
        if (registeredElsFull.has(el)) return;
        try {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return;
          const raw = getElementText(el);
          const text = raw || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || '';
          const key = `${Math.round(r.x)},${Math.round(r.y)},${text.substring(0,30)}`;
          if (!seen.has(key) && (text || r.width >= 5)) {
            seen.add(key);
            registry.push({ el, text: trunc(text||'∅', MAX_TEXT), kind: getKind(el), rect: r });
            _safety++;
          }
        } catch {}
      });
    }
    safetyScan(document.body);
    document.body.querySelectorAll('iframe').forEach(f => {
      try { if (f.contentDocument?.body) safetyScan(f.contentDocument.body); } catch {}
    });

    _dbg = `visited:${_v} shadow:${_sh} invis:${_inv} safety:${_safety}`;
    registry.sort((a,b) => Math.abs(a.rect.y-b.rect.y)<10 ? a.rect.x-b.rect.x : a.rect.y-b.rect.y);

    // Dedup links
    const linksSeen = new Map();
    const deduped = [];
    for (const item of registry) {
      if (item.kind==='link'||item.kind==='ext') {
        const href = item.el.href;
        if (href && linksSeen.has(href)) { const ex = linksSeen.get(href); if (item.text.length>ex.text.length) ex.text=item.text; continue; }
        if (href) linksSeen.set(href, item);
      }
      deduped.push(item);
    }
    registry = deduped;

    // ── Zone detection ──
    const zoneContainers = detectZones();
    if (zoneContainers.length >= 2) {
      const zoneMap = new Map(); // zone el → zone object
      let zoneId = 1;

      // Assign each element to its closest (deepest) zone container
      for (const item of registry) {
        let assigned = false;
        for (const zc of zoneContainers) {
          if (deepContains(zc.el, item.el)) {
            if (!zoneMap.has(zc.el)) {
              zoneMap.set(zc.el, { id: zoneId++, label: zc.label, type: zc.type, el: zc.el, elements: [] });
            }
            zoneMap.get(zc.el).elements.push(item);
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          if (!zoneMap.has(null)) {
            zoneMap.set(null, { id: zoneId++, label: 'Other', type: 'catchall', el: null, elements: [] });
          }
          zoneMap.get(null).elements.push(item);
        }
      }

      // Merge tiny zones (1 element) into "Other" — they add no grouping value
      const otherZone = zoneMap.get(null) || { id: 0, label: 'Other', type: 'catchall', el: null, elements: [] };
      if (!zoneMap.has(null)) zoneMap.set(null, otherZone);
      for (const [key, z] of zoneMap) {
        if (key !== null && z.elements.length <= 1) {
          otherZone.elements.push(...z.elements);
          z.elements = [];
        }
      }

      // Build zones array sorted by position of first element
      zones = Array.from(zoneMap.values())
        .filter(z => z.elements.length > 0)
        .sort((a, b) => (a.elements[0]?.rect.y ?? Infinity) - (b.elements[0]?.rect.y ?? Infinity));

      // Reassign sequential IDs and generate previews
      zones.forEach((z, i) => { z.id = i + 1; z.preview = getZonePreview(z.elements); });

      // Fallback to flat list if all zones ended up empty
      if (zones.length >= 2) return formatZoneOverview();
    }

    return formatList();
  }

  function formatList(page) {
    if (page === undefined) page = currentPage;
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, registry.length);
    const slice = registry.slice(start, end);

    const lines = [`📍 ${location.href}`];
    const title = document.title?.trim();
    if (title) lines.push(`📄 ${trunc(title, 70)}`);

    if (registry.length === 0) {
      lines.push('', `(no clickable elements found — ${_dbg})`);
      return lines.join('\n');
    }

    // Show range indicator if multi-page
    if (registry.length > PAGE_SIZE) {
      lines.push(`[${start+1}-${end} / ${registry.length}]`);
    }
    lines.push('');

    for (let i = start; i < end; i++) {
      let line = `${i+1}. ${registry[i].text}`;
      const k = registry[i].kind;
      if (k==='input') line += ' [input]';
      if (k==='select') line += ' [select]';
      if (k==='menu') line += ' [menu]';
      if (k==='ext') line += ' [ext]';
      if (k==='switch') line += ' [switch]';
      lines.push(line);
    }

    const remaining = registry.length - end;
    if (remaining > 0) lines.push(`--- ${remaining} more → browse_more`);

    return lines.join('\n');
  }

  function formatZoneOverview(page) {
    if (page === undefined) page = 0;
    const start = page * ZONE_PAGE_SIZE;
    const end = Math.min(start + ZONE_PAGE_SIZE, zones.length);

    const lines = [`📍 ${location.href}`];
    const title = document.title?.trim();
    if (title) lines.push(`📄 ${trunc(title, 70)}`);
    lines.push('', 'Zones:');

    for (let i = start; i < end; i++) {
      const z = zones[i];
      const count = z.elements.length === 1 ? '1 action' : `${z.elements.length} actions`;
      let line = `Z${z.id}. ${z.label} (${count})`;
      if (z.preview) line += ` — ${trunc(z.preview, 80)}`;
      lines.push(line);
    }

    const remaining = zones.length - end;
    if (remaining > 0) lines.push(`--- ${remaining} more zones → browse_more`);

    lines.push('', 'Use browse_zone(N) to see actions in a zone.');
    return lines.join('\n');
  }

  function zone(zoneId) {
    if (zones.length === 0) scan(); // auto-recovery: rescan if state was lost (page reload, late redirect)
    const z = zones.find(z => z.id === zoneId);
    if (!z) return { ok: false, error: `Zone Z${zoneId} not found (1-${zones.length})` };

    activeZoneId = zoneId;
    zoneRegistry = z.elements;

    const lines = [`Zone Z${z.id} — ${z.label}`];
    if (z.preview) lines.push(z.preview);
    lines.push('');

    for (let i = 0; i < zoneRegistry.length; i++) {
      let line = `${i + 1}. ${zoneRegistry[i].text}`;
      const k = zoneRegistry[i].kind;
      if (k === 'input') line += ' [input]';
      if (k === 'select') line += ' [select]';
      if (k === 'menu') line += ' [menu]';
      if (k === 'ext') line += ' [ext]';
      if (k === 'switch') line += ' [switch]';
      lines.push(line);
    }

    return { ok: true, result: lines.join('\n'), count: zoneRegistry.length };
  }

  // ── 主世界代码执行（绕过隔离世界限制，可访问页面 Vue/React 实例）──────
  const pageEvalPending = new Map();
  let pageEvalSeq = 0;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.channel !== 'navagent-pageeval-reply') return;
    const cb = pageEvalPending.get(e.data.id);
    if (cb) { pageEvalPending.delete(e.data.id); cb(e.data); }
  });

  function pageEval(code, timeoutMs) {
    return new Promise((resolve) => {
      const id = 'pe-' + (++pageEvalSeq);
      const timer = setTimeout(() => {
        pageEvalPending.delete(id);
        resolve({ ok: false, error: '主世界执行超时（可能被页面 CSP 拦截）' });
      }, timeoutMs || 8000);
      pageEvalPending.set(id, (data) => {
        clearTimeout(timer);
        if (data.error) resolve({ ok: false, error: data.error });
        else resolve({ ok: true, result: data.result });
      });
      window.postMessage({ channel: 'navagent-pageeval', id, code }, '*');
    });
  }

  // ── Actions ──────────────────────

  // 强制显示被 :hover / display:none 隐藏的元素（合成事件触发不了 CSS :hover）
  // 注意：必须用 setProperty(..., 'important') 显式覆盖，
  // 设成 '' 只是清空内联样式，会回退到 CSS 的 display:none，等于没改。
  function forceVisible(el) {
    try {
      const INLINE_TAGS = /^(SPAN|A|I|EM|B|STRONG|LABEL|IMG|INPUT|BUTTON)$/;
      const fix = (node) => {
        if (!node || !node.style || node.nodeType !== 1) return;
        const cs = getComputedStyle(node);
        if (cs.display === 'none') {
          const natural = INLINE_TAGS.test(node.tagName) ? 'inline-block' : 'block';
          node.style.setProperty('display', natural, 'important');
        }
        if (cs.visibility === 'hidden' || cs.visibility === 'collapse') {
          node.style.setProperty('visibility', 'visible', 'important');
        }
        if (parseFloat(cs.opacity) === 0) {
          node.style.setProperty('opacity', '1', 'important');
        }
        if (cs.pointerEvents === 'none') {
          node.style.setProperty('pointer-events', 'auto', 'important');
        }
        if (cs.position === 'absolute' && (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)')) {
          node.style.setProperty('clip', 'auto', 'important');
          node.style.setProperty('clip-path', 'none', 'important');
        }
      };
      fix(el);
      // 向上清理所有祖先（含 body/html），最多 25 层
      let p = el.parentElement, depth = 0;
      while (p && depth < 25) { fix(p); p = p.parentElement; depth++; }
      // 触发悬停类事件（对用 JS 控制显隐的组件有效；纯 CSS :hover 靠上面的样式覆盖）
      const hover = (target) => {
        try {
          target.dispatchEvent(new MouseEvent('mouseover',  { bubbles:true,  cancelable:true, view:window }));
          target.dispatchEvent(new MouseEvent('mouseenter',{ bubbles:false, cancelable:true, view:window }));
          target.dispatchEvent(new MouseEvent('mousemove',  { bubbles:true,  cancelable:true, view:window }));
        } catch (_) {}
      };
      hover(el);
      if (el.parentElement) hover(el.parentElement);
      if (el.parentElement && el.parentElement.parentElement) hover(el.parentElement.parentElement);
    } catch (_) {}
  }

  // 更真实的点击：完整「指针 + 鼠标」事件序列，带真实坐标
  function realClick(el) {
    try { el.scrollIntoView({ behavior:'instant', block:'center' }); } catch(_) {}
    forceVisible(el);
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const base = { bubbles:true, cancelable:true, composed:true, view:window,
                   clientX:cx, clientY:cy, screenX:cx, screenY:cy };
    const mk = (T, extra) => { try { return new T(Object.assign({}, base, extra)); } catch(_) { return null; } };
    const fire = (ev) => { if (ev) { try { el.dispatchEvent(ev); } catch(_) {} } };

    fire(mk(PointerEvent, { pointerId:1, pointerType:'mouse', isPrimary:true, width:1, height:1, pressure:0.5, button:0, buttons:1 }));
    fire(mk(MouseEvent,   { detail:1, button:0, buttons:1 }));
    try { el.focus({ preventScroll:true }); } catch(_) {}
    fire(mk(PointerEvent, { pointerId:1, pointerType:'mouse', isPrimary:true, width:1, height:1, pressure:0, button:0, buttons:0 }));
    fire(mk(MouseEvent,   { detail:1, button:0, buttons:0 }));
    fire(mk(MouseEvent,   { detail:1, button:0, buttons:0 }));
    try { el.click(); } catch(_) {}
    return { x:cx, y:cy };
  }

  function findBySelector(selector, nth) {
    const list = Array.from(document.querySelectorAll(selector));
    const i = (nth || 1) - 1;
    return { el: list[i] || null, total: list.length };
  }

  function click(index) {
    const source = activeZoneId !== null ? zoneRegistry : registry;
    const idx = index - 1;
    if (idx<0 || idx>=source.length) {
      const ctx = activeZoneId !== null ? `zone Z${activeZoneId}` : 'scan';
      return { ok:false, error:`#${index} out of range (1-${source.length}) in ${ctx}` };
    }
    const el = source[idx].el;
    const pos = realClick(el);
    return { ok:true, text: source[idx].text, url: location.href, tag: el.tagName, clickedAt: pos };
  }

  function clickSelector(selector, nth) {
    const { el, total } = findBySelector(selector, nth);
    if (!el) return { ok:false, error:`选择器 "${selector}" 没匹配到第 ${nth||1} 个元素（共 ${total} 个）` };
    forceVisible(el);
    const pos = realClick(el);
    return { ok:true, selector, nth: nth||1, total, tag: el.tagName,
             text: (el.innerText||el.value||'').trim().slice(0,80), clickedAt: pos };
  }

  // 强制显示某元素并回报其状态（用于诊断隐藏控件）
  function showSelector(selector, nth) {
    const { el, total } = findBySelector(selector, nth);
    if (!el) return { ok:false, error:`选择器 "${selector}" 没匹配到第 ${nth||1} 个元素（共 ${total} 个）` };
    const before = getComputedStyle(el);
    const b = { display: before.display, visibility: before.visibility, opacity: before.opacity };
    forceVisible(el);
    const after = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { ok:true, tag: el.tagName, text: (el.innerText||'').trim().slice(0,60),
             before: b, after: { display: after.display, visibility: after.visibility, opacity: after.opacity },
             rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } };
  }

  function querySelector(selector, limit) {
    const list = Array.from(document.querySelectorAll(selector)).slice(0, limit || 20);
    return { ok:true, total: document.querySelectorAll(selector).length, items: list.map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i: i+1, tag: el.tagName, cls: (el.className||'').toString().slice(0,80),
               text: (el.innerText||el.value||'').replace(/\s+/g,' ').trim().slice(0,100),
               visible: r.width>0 && r.height>0, x: Math.round(r.left), y: Math.round(r.top) };
    })};
  }

  async function type(index, text, submit, selector, nth, fast) {
    let el;
    if (selector) {
      const f = findBySelector(selector, nth || 1);
      if (!f.el) return { ok:false, error:`选择器 "${selector}" 未匹配到第 ${nth||1} 个元素（共 ${f.total} 个）` };
      el = f.el;
    } else {
      const source = activeZoneId !== null ? zoneRegistry : registry;
      const idx = index - 1;
      if (idx<0 || idx>=source.length) return { ok:false, error:`#${index} out of range` };
      el = source[idx].el;
    }
    forceVisible(el);
    el.scrollIntoView({ behavior:'instant', block:'center' });
    el.focus();

    const isContentEditable = el.getAttribute('contenteditable') === 'true' || el.isContentEditable;
    const delay = ms => new Promise(r => setTimeout(r, ms));

    if (isContentEditable) {
      // Clear existing content
      el.innerHTML = '';
      el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'deleteContentBackward' }));
      await delay(50);

      // Insert text in bulk using execCommand for best framework compatibility
      // Convert newlines to <br> for proper line breaks in contenteditable
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          // Insert line break
          document.execCommand('insertLineBreak', false);
          await delay(10);
        }
        if (lines[i]) {
          document.execCommand('insertText', false, lines[i]);
          await delay(10);
        }
      }

      // Fire final input event
      el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:text }));
    } else {
      // Use native setter to bypass React/Vue overrides
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
      function setValue(v) { nativeSetter ? nativeSetter.call(el, v) : (el.value = v); }

      if (fast) {
        // 快速路径：一次性写入 + 完整事件序列（适合长文本、Vue 表单）
        setValue('');
        el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'deleteContentBackward' }));
        await delay(30);
        el.dispatchEvent(new KeyboardEvent('keydown',  { key:'a', bubbles:true }));
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, inputType:'insertText', data:text }));
        setValue(text);
        el.dispatchEvent(new InputEvent('input',  { bubbles:true, inputType:'insertText', data:text }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key:'a', bubbles:true }));
        el.dispatchEvent(new Event('change', { bubbles:true }));
        await delay(50);
        return { ok:true, fast:true, length: el.value.length, preview: el.value.slice(0, 60) };
      }

      // Clear existing value
      setValue('');
      el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'deleteContentBackward' }));

      // Type character by character
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const keyOpts = { key:char, code:`Key${char.toUpperCase()}`, keyCode:char.charCodeAt(0), bubbles:true };

        el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
        el.dispatchEvent(new KeyboardEvent('keypress', { ...keyOpts, charCode:char.charCodeAt(0) }));
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, inputType:'insertText', data:char }));

        setValue(text.substring(0, i + 1));
        el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:char }));

        el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
        await delay(30);
      }
    }

    el.dispatchEvent(new Event('change', { bubbles:true }));

    if (submit) {
      el.dispatchEvent(new KeyboardEvent('keydown',  { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
      el.dispatchEvent(new KeyboardEvent('keyup',    { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
      const form = el.closest('form');
      if (form) { form.requestSubmit?.() || form.submit(); }
    }
    return { ok:true };
  }

  function readPage() {
    const vw = innerWidth, vh = innerHeight;

    function isInViewport(el) {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    }

    function collectText(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode() && len < 2000) {
        const parent = walker.currentNode.parentElement;
        if (!parent) continue;
        const t = walker.currentNode.textContent.trim();
        if (t.length > 2 && isInViewport(parent) && isVisible(parent)) {
          chunks.push(t); len += t.length;
        }
      }
    }
    const chunks = [];
    let len = 0;
    collectText(document.body);
    // Also read same-origin iframes
    document.body.querySelectorAll('iframe').forEach(f => {
      try { if (f.contentDocument?.body) collectText(f.contentDocument.body); } catch {}
    });
    return chunks.join(' ').replace(/\s+/g,' ').substring(0, 2000);
  }

  // ── Full-page content extraction as markdown ──────────────────────

  const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','TEMPLATE']);
  const NOISE_TAGS = new Set(['NAV','FOOTER','ASIDE','HEADER']);

  function isRendered(el) {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) !== 0;
  }

  function extractContent(maxLen, offset) {
    maxLen = maxLen || 5000;
    offset = offset || 0;

    // Find the best content root
    const root = document.querySelector('article, main, [role="main"]') || document.body;
    const isBody = root === document.body;

    let md = '';

    function walk(el) {
      if (el.nodeType === 3) {
        const t = el.textContent.replace(/[ \t]+/g, ' ');
        if (t.trim()) md += t;
        return;
      }
      if (el.nodeType !== 1) return;
      // Traverse same-origin iframes instead of skipping them
      if (el.tagName === 'IFRAME') {
        try { const doc = el.contentDocument; if (doc?.body) for (const c of doc.body.childNodes) walk(c); }
        catch {} // cross-origin → skip
        return;
      }
      if (SKIP_TAGS.has(el.tagName)) return;
      if (isBody && NOISE_TAGS.has(el.tagName)) return;
      if (!isRendered(el)) return;

      const tag = el.tagName;

      // Headings
      if (/^H[1-6]$/.test(tag)) {
        const text = el.textContent.trim();
        if (text) md += '\n\n' + '#'.repeat(parseInt(tag[1])) + ' ' + text + '\n\n';
        return;
      }

      // Preformatted / code blocks
      if (tag === 'PRE') {
        md += '\n\n```\n' + el.textContent.trimEnd() + '\n```\n\n';
        return;
      }

      // Inline code (not inside PRE)
      if (tag === 'CODE') {
        md += '`' + el.textContent + '`';
        return;
      }

      // Links
      if (tag === 'A') {
        const href = el.getAttribute('href') || '';
        const text = el.textContent.trim();
        if (text && href && !href.startsWith('javascript:') && href !== '#') {
          try { md += '[' + text + '](' + new URL(href, location.href).href + ')'; }
          catch { md += text; }
        } else { md += text; }
        return;
      }

      // Images
      if (tag === 'IMG') {
        const alt = el.getAttribute('alt')?.trim();
        if (alt) md += '[image: ' + alt + ']';
        return;
      }

      // Horizontal rule
      if (tag === 'HR') { md += '\n\n---\n\n'; return; }

      // Line break
      if (tag === 'BR') { md += '\n'; return; }

      // Blockquote
      if (tag === 'BLOCKQUOTE') {
        const text = el.textContent.trim();
        if (text) md += '\n\n' + text.split('\n').map(l => '> ' + l.trim()).join('\n') + '\n\n';
        return;
      }

      // Table
      if (tag === 'TABLE') {
        const rows = el.querySelectorAll('tr');
        if (rows.length === 0) return;
        md += '\n\n';
        rows.forEach((row, i) => {
          const cells = row.querySelectorAll('th, td');
          md += '| ' + Array.from(cells).map(c => c.textContent.trim().replace(/\|/g, '\\|')).join(' | ') + ' |\n';
          if (i === 0 && row.querySelector('th')) {
            md += '| ' + Array.from(cells).map(() => '---').join(' | ') + ' |\n';
          }
        });
        md += '\n';
        return;
      }

      // List items
      if (tag === 'LI') {
        const parent = el.parentElement;
        if (parent && parent.tagName === 'OL') {
          const idx = Array.from(parent.children).filter(c => c.tagName === 'LI').indexOf(el) + 1;
          md += '\n' + idx + '. ';
        } else {
          md += '\n- ';
        }
        for (const c of el.childNodes) walk(c);
        return;
      }

      // Bold
      if (tag === 'STRONG' || tag === 'B') {
        md += '**'; for (const c of el.childNodes) walk(c); md += '**';
        return;
      }

      // Italic
      if (tag === 'EM' || tag === 'I') {
        md += '*'; for (const c of el.childNodes) walk(c); md += '*';
        return;
      }

      // Block-level elements get newlines
      const isBlock = /^(P|DIV|SECTION|ARTICLE|MAIN|FIGURE|FIGCAPTION|DETAILS|SUMMARY|DL|DT|DD|UL|OL|HGROUP|ADDRESS)$/.test(tag);
      if (isBlock) md += '\n\n';

      for (const c of el.childNodes) walk(c);

      if (isBlock) md += '\n';
    }

    walk(root);

    // Clean up
    md = md.replace(/\n{3,}/g, '\n\n').trim();

    // Apply pagination
    const total = md.length;
    if (offset > 0) md = md.substring(offset);
    if (md.length > maxLen) {
      md = md.substring(0, maxLen);
      const nextOffset = offset + maxLen;
      md += '\n\n--- content truncated (' + (total - nextOffset) + ' chars remaining). Use offset=' + nextOffset + ' to continue ---';
    }

    return md || '(no content found)';
  }

  // ── DOM stability detection ──────────────────────

  function waitForDOMStability(quietPeriod, timeout) {
    quietPeriod = quietPeriod || 800;
    timeout = timeout || 3000;
    return new Promise((resolve) => {
      let timer = null;
      const abs = setTimeout(() => { observer.disconnect(); if (timer) clearTimeout(timer); resolve(); }, timeout);
      const observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { observer.disconnect(); clearTimeout(abs); resolve(); }, quietPeriod);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
      // Start quiet timer immediately (resolves fast if DOM is already stable)
      timer = setTimeout(() => { observer.disconnect(); clearTimeout(abs); resolve(); }, quietPeriod);
    });
  }

  // ── Message handler ──────────────────────

  // ── WebMCP bridge (ISOLATED → MAIN world via postMessage) ──

  let webmcpId = 0;
  const webmcpPending = new Map();

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.channel !== 'navagent-webmcp-reply') return;
    const p = webmcpPending.get(e.data.id);
    if (p) { webmcpPending.delete(e.data.id); p(e.data); }
  });

  function webmcpRequest(method, args = {}) {
    return new Promise((resolve) => {
      const id = ++webmcpId;
      const timer = setTimeout(() => { webmcpPending.delete(id); resolve({ error: 'WebMCP timeout' }); }, 3000);
      webmcpPending.set(id, (data) => { clearTimeout(timer); resolve(data); });
      window.postMessage({ channel: 'navagent-webmcp', id, method, args }, '*');
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      switch (msg.action) {
        case 'scan':
          sendResponse({ ok:true, result: scan(), count: registry.length, hasZones: zones.length > 0, url: location.href });
          break;
        case 'zone':
          sendResponse(zone(msg.zoneId));
          break;
        case 'click':
          sendResponse(click(msg.index));
          break;
        case 'clickSel':
          sendResponse(clickSelector(msg.selector, msg.nth));
          break;
        case 'query':
          sendResponse(querySelector(msg.selector, msg.limit));
          break;
        case 'showSel':
          sendResponse(showSelector(msg.selector, msg.nth));
          break;
        case 'pageEval':
          pageEval(msg.code, msg.timeout).then(sendResponse);
          return true;
        case 'type':
          type(msg.index, msg.text, msg.submit ?? true, msg.selector, msg.nth, msg.fast).then(sendResponse);
          return true; // keep channel open for async response
        case 'typeSel':
          type(0, msg.text, msg.submit ?? true, msg.selector, msg.nth, msg.fast).then(sendResponse);
          return true;
        case 'more': {
          if (zones.length > 0 && activeZoneId === null) {
            // Zone overview pagination
            currentPage = Math.min(currentPage + 1, Math.floor(Math.max(0, zones.length - 1) / ZONE_PAGE_SIZE));
            sendResponse({ ok:true, result: formatZoneOverview(currentPage), count: zones.length });
          } else {
            // Flat list pagination (no zones or inside a zone)
            const maxPage = Math.floor(Math.max(0, registry.length - 1) / PAGE_SIZE);
            currentPage = Math.min(currentPage + 1, maxPage);
            sendResponse({ ok:true, result: formatList(currentPage), count: registry.length });
          }
          break;
        }
        case 'scroll':
          // Physical scroll for lazy-loading / infinite scroll, then full rescan
          window.scrollBy({ top: (msg.direction==='up' ? -1 : 1) * innerHeight * 0.8, behavior:'instant' });
          setTimeout(() => sendResponse({ ok:true, result: scan(), count: registry.length }), 500);
          return true;
        case 'read':
          sendResponse({ ok:true, result: readPage() });
          break;
        case 'extract':
          sendResponse({ ok:true, result: extractContent(msg.max_length, msg.offset) });
          break;
        case 'waitForStable':
          waitForDOMStability(msg.quietPeriod, msg.timeout).then(() => sendResponse({ ok: true }));
          return true; // keep channel open for async response
        case 'listTools':
          webmcpRequest('listTools').then(r => {
            if (r.error) sendResponse({ ok: false, error: r.error });
            else sendResponse({ ok: true, result: r.result });
          });
          return true;
        case 'callTool':
          webmcpRequest('callTool', { name: msg.name, arguments: msg.arguments }).then(r => {
            if (r.error) sendResponse({ ok: false, error: r.error });
            else sendResponse({ ok: true, result: r.result });
          });
          return true;
        default:
          sendResponse({ ok:false, error: `Unknown: ${msg.action}` });
      }
    } catch (e) { sendResponse({ ok:false, error: e.message }); }
    return false;
  });
})();
