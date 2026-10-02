// NavAgent Core — pure/semi-pure functions extracted for testability
// Loaded before content-script.js via manifest js array
// Tests access via globalThis.__NavAgentCore after eval in JSDOM

(function() {
  'use strict';

  const nativeTags = new Set(['A', 'BUTTON', 'SUMMARY']);
  const interactiveRoles = new Set([
    'button','link','menuitem','menuitemcheckbox',
    'menuitemradio','tab','option','switch','treeitem'
  ]);

  // ── Text helpers ──────────────────────

  function trunc(s, m) { return s.length<=m ? s : s.substring(0,m-1)+'…'; }

  function getZonePreview(elements, maxLen = 80) {
    const texts = [];
    let len = 0;
    for (const item of elements) {
      if (!item.text || item.text === '∅') continue;
      const t = item.text.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (len + t.length > maxLen) break;
      texts.push(t);
      len += t.length + 3;
    }
    return texts.join(' · ');
  }

  function getDirectText(el) {
    let t = '';
    for (const n of el.childNodes) {
      if (n.nodeType===3) t += n.textContent;
      else if (n.nodeType===1 && !isStronglyClickable(n)) t += getDirectText(n);
    }
    if (el.shadowRoot) {
      for (const n of el.shadowRoot.childNodes) {
        if (n.nodeType===3) t += n.textContent;
        else if (n.nodeType===1 && !isStronglyClickable(n)) t += getDirectText(n);
      }
    }
    return t.trim().replace(/\s+/g,' ');
  }

  // Like getDirectText but aware of input values and contenteditable content
  function getElementText(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value || '';
    }
    if (el.getAttribute('contenteditable') === 'true' || el.isContentEditable) {
      // innerText handles complex editors (DraftJS, ProseMirror) where getDirectText fails
      const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      return t || '';
    }
    return getDirectText(el);
  }

  // ── Visibility ──────────────────────

  function isVisible(el) {
    try { var s = getComputedStyle(el); } catch { return false; }
    if (s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity)===0) return false;
    if (s.display==='contents') return true;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function hasCursorPointer(el) { try { return getComputedStyle(el).cursor==='pointer'; } catch { return false; } }

  // ── Clickability detection ──────────────────────

  function isSamePageAnchor(el) {
    if (el.tagName !== 'A') return false;
    const h = (el.getAttribute('href') || '').trim();
    if (!h || h === '#' || h.toLowerCase().startsWith('javascript:')) return true;
    // Hash routes (#/path/..., #!/hashbang) are SPA navigation, NOT same-page anchors
    if (h.startsWith('#/') || h.startsWith('#!')) return false;
    if (h.startsWith('#')) return true;
    try {
      const currentBase = (() => {
        try { const u = new URL(location.href); u.hash=''; u.search=''; return u.href.replace(/\/+$/,''); }
        catch { return location.href; }
      })();
      const r = new URL(h, location.href);
      if (r.hash) { const c = new URL(r.href); c.hash=''; c.search=''; return c.href.replace(/\/+$/,'') === currentBase; }
    } catch {}
    return false;
  }

  function hasInteractiveRole(el) {
    const role = el.getAttribute('role');
    if (role && interactiveRoles.has(role.toLowerCase())) return true;
    if (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'),10)>=0) return true;
    return false;
  }

  function hasInlineHandler(el) {
    return el.hasAttribute('onclick')||el.hasAttribute('onmousedown')||el.hasAttribute('ontouchstart');
  }

  function isStronglyClickable(el) {
    if (el.tagName==='A') return !isSamePageAnchor(el);
    if (nativeTags.has(el.tagName)) return true;
    if (el.tagName==='INPUT') {
      const t = (el.getAttribute('type')||'').toLowerCase();
      if (['submit','button','reset','image'].includes(t)) return true;
      if (['text','search','email','url','tel','number','password',''].includes(t)) return true;
    }
    if (el.tagName==='TEXTAREA'||el.tagName==='SELECT') return true;
    if (el.tagName==='LABEL') return true;
    if (el.getAttribute('contenteditable') === 'true') return true;
    if (hasInteractiveRole(el)) return true;
    if (hasInlineHandler(el)) return true;
    return false;
  }

  function isWeaklyClickable(el) {
    if (hasCursorPointer(el)) return true;
    for (const a of ['data-click','data-action','data-href','data-link','data-toggle','data-bs-toggle','ng-click','v-on:click','@click','x-on:click'])
      if (el.hasAttribute(a)) return true;
    return false;
  }

  function isClickable(el, inside) {
    if (isStronglyClickable(el)) return true;
    if (!inside && isWeaklyClickable(el)) return true;
    return false;
  }

  // ── Container filter ──────────────────────

  function isContainer(el, r) {
    if (nativeTags.has(el.tagName)||el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.tagName==='LABEL'||el.getAttribute('contenteditable')==='true') return false;
    const role = el.getAttribute('role');
    if (role && interactiveRoles.has(role.toLowerCase())) return false;
    const vpArea = innerWidth * innerHeight;
    if (r.width*r.height > vpArea*0.4) return true;
    if (r.width > innerWidth*0.9 && r.height > innerHeight*0.3) return true;
    return false;
  }

  // ── Zone detection ──────────────────────

  function inferZoneLabel(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return trunc(ariaLabel, 30);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return trunc(labelEl.textContent.trim(), 30);
    }
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    if (tag === 'nav' || role === 'navigation') return 'Navigation';
    if (tag === 'header' || role === 'banner') return 'Header';
    if (tag === 'footer' || role === 'contentinfo') return 'Footer';
    if (tag === 'aside' || role === 'complementary') return 'Sidebar';
    if (tag === 'article' || role === 'article') return 'Article';
    if (role === 'search') return 'Search';
    if (role === 'dialog' || tag === 'dialog' || el.getAttribute('aria-modal') === 'true') return 'Dialog';
    if (tag === 'form') return el.getAttribute('name') || 'Form';
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }

  // ── Element kind ──────────────────────

  function getKind(el) {
    if (el.tagName==='INPUT'||el.tagName==='TEXTAREA') return 'input';
    if (el.getAttribute('contenteditable') === 'true') return 'input';
    if (el.tagName==='SELECT') return 'select';
    if (el.tagName==='A') {
      try { if (new URL(el.href).origin !== location.origin) return 'ext'; } catch {}
      return 'link';
    }
    if (el.tagName==='BUTTON') return 'btn';
    if (el.tagName==='SUMMARY') return 'menu';
    const role = el.getAttribute('role');
    if (role==='menu'||role==='menuitem'||el.getAttribute('data-toggle')||el.getAttribute('data-bs-toggle')) return 'menu';
    if (role==='switch') return 'switch';
    return 'action';
  }

  // ── Export ──────────────────────

  globalThis.__NavAgentCore = {
    nativeTags, interactiveRoles,
    trunc, getZonePreview, getDirectText, getElementText,
    isVisible, hasCursorPointer,
    isSamePageAnchor, hasInteractiveRole, hasInlineHandler,
    isStronglyClickable, isWeaklyClickable, isClickable,
    isContainer, inferZoneLabel, getKind,
  };
})();
