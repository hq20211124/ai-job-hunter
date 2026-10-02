const DEFAULT_PORT = 61822;
let ws = null;

// ── Connection ──────────────────────

async function getWsUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ port: DEFAULT_PORT }, (data) => {
      resolve(`ws://127.0.0.1:${data.port}`);
    });
  });
}

async function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (ws) { try { ws.close(); } catch {} ws = null; }
  try {
    const url = await getWsUrl();
    ws = new WebSocket(url);
    ws.onopen = () => { console.log('[NavAgent] Connected to', url); };
    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.ping) { ws.send(JSON.stringify({ pong: true })); return; }
        const result = await handleCommand(msg);
        ws.send(JSON.stringify({ id: msg.id, result }));
      } catch (err) { ws.send(JSON.stringify({ id: null, error: err.message })); }
    };
    ws.onclose = () => { ws = null; };
    ws.onerror = () => { try { ws?.close(); } catch {} ws = null; };
  } catch { ws = null; }
}

// ── Auto-reconnect on port change ──────────────────────

chrome.storage.onChanged.addListener((changes) => {
  if (changes.port) {
    if (ws) { try { ws.close(); } catch {} ws = null; }
    connect();
  }
});

// ── Keepalive via chrome.alarms (survives service worker termination) ──

chrome.alarms.create('navagent-keepalive', { periodInMinutes: 0.4 }); // ~24s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'navagent-keepalive') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connect();
    } else {
      // Send a ping to detect dead sockets
      try { ws.send(JSON.stringify({ ping: true })); } catch { ws = null; connect(); }
    }
  }
});

// ── Wake on Chrome events ──────────────────────

chrome.tabs.onActivated.addListener(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connect();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'complete' && (!ws || ws.readyState !== WebSocket.OPEN)) connect();
});

// ── Dedicated NavAgent tab (background, no focus steal) ──────────────────────

let navTabId = null;

// Clean up if user closes the NavAgent tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === navTabId) navTabId = null;
});

async function getNavTab() {
  // Check if our dedicated tab still exists
  if (navTabId !== null) {
    try {
      const tab = await chrome.tabs.get(navTabId);
      if (tab) return tab;
    } catch { navTabId = null; }
  }
  // Fallback: use the active tab (first command before any goto)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureNavTab(url) {
  // If we already have a dedicated tab, navigate it
  if (navTabId !== null) {
    try {
      await chrome.tabs.get(navTabId);
      await chrome.tabs.update(navTabId, { url });
      return;
    } catch { navTabId = null; }
  }
  // Create a new background tab (active: false = no focus steal)
  const tab = await chrome.tabs.create({ url, active: false });
  navTabId = tab.id;
}

// ── Content messaging ──────────────────────

function sendToContent(action, params = {}) {
  return new Promise(async (resolve, reject) => {
    const tab = await getNavTab();
    if (!tab) return reject(new Error('No tab available'));
    chrome.tabs.sendMessage(tab.id, { action, ...params }, (r) => {
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r);
    });
  });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Wait for DOM to stabilize (async React/Vue rendering) then scan
async function stableScan() {
  try { await sendToContent('waitForStable', { quietPeriod: 800, timeout: 3000 }); } catch {}
  return await sendToContent('scan');
}

// ── Command handler ──────────────────────

async function handleCommand(msg) {
  const { command, params } = msg;

  switch (command) {
    case 'scan':
      return await sendToContent('scan');

    case 'zone':
      return await sendToContent('zone', { zoneId: params.zoneId });

    case 'click': {
      const tab = await getNavTab();
      const beforeUrl = tab?.url || null;
      const tabId = tab?.id;

      // Listen for navigation BEFORE clicking (captures the event even if it fires fast)
      let navUrl = null;
      const navPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(null); }, 2000);
        function listener(id, info) {
          if (id !== tabId) return;
          if (info.url && info.url !== beforeUrl) {
            navUrl = info.url;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timeout);
            // Don't resolve yet — wait for 'complete' status
          }
          if (info.status === 'complete' && navUrl) {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timeout);
            resolve(navUrl);
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });

      const r = await sendToContent('click', { index: params.index });
      if (!r.ok) return r;

      // Wait for either: navigation completes, or 2s timeout (same-page update)
      const navigatedTo = await navPromise;

      let scanResult;
      if (navigatedTo) {
        // Full navigation detected — retry scan on new page (like goto)
        for (let i = 0; i < 6; i++) {
          await wait(500);
          try { scanResult = await sendToContent('scan'); break; } catch {}
        }
        if (!scanResult) return { ...r, scan: '🔀 Navigated to: ' + navigatedTo + '\n(page did not load in time)' };
        // Re-scan after DOM stabilizes (catches async React/Vue rendering)
        try { scanResult = await stableScan(); } catch {}
        scanResult.result = '🔀 Navigated to: ' + navigatedTo + '\n' + scanResult.result;
      } else {
        // Same-page update (cart, modal, dropdown): wait for stability then scan
        try { scanResult = await stableScan(); }
        catch { await wait(1500); scanResult = await sendToContent('scan'); }
      }

      let scanText = scanResult.result;
      // Append content read so LLM sees partial updates (cart total, modals)
      try {
        const rd = await sendToContent('read');
        if (rd?.result) scanText += '\n\n📝 Content:\n' + rd.result;
      } catch {}
      return { ...r, scan: scanText };
    }

    case 'type': {
      const r = await sendToContent('type', { index: params.index, text: params.text, submit: params.submit ?? true });
      if (!r.ok) return r;
      if (params.submit !== false) {
        try {
          const s = await stableScan();
          let scanText = s.result;
          // Append content read (like goto/click) so LLM sees the result
          try {
            const rd = await sendToContent('read');
            if (rd?.result) scanText += '\n\n📝 Content:\n' + rd.result;
          } catch {}
          return { ...r, scan: scanText };
        } catch {
          await wait(1500);
          const s = await sendToContent('scan');
          return { ...r, scan: s.result };
        }
      } else {
        await wait(600);
        try { const s = await sendToContent('scan'); return { ...r, scan: s.result }; }
        catch { return r; }
      }
    }

    case 'scroll':
      return await sendToContent('scroll', { direction: params.direction || 'down' });

    case 'more':
      return await sendToContent('more');

    case 'read':
      return await sendToContent('read');

    case 'extract':
      return await sendToContent('extract', { max_length: params.max_length, offset: params.offset });

    case 'pageEval':
      return await sendToContent('pageEval', { code: params.code, timeout: params.timeout });

    case 'screenshot': {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        return { ok: true, dataUrl };
      } catch (e) {
        return { ok: false, error: '截图失败: ' + ((e && e.message) || e) };
      }
    }

    case 'listTools':
      return await sendToContent('listTools');

    case 'callTool':
      return await sendToContent('callTool', { name: params.name, arguments: params.arguments });

    case 'back': {
      const tab = await getNavTab();
      await chrome.tabs.goBack(tab.id);
      let scanResult;
      for (let i = 0; i < 6; i++) {
        await wait(500);
        try { scanResult = await sendToContent('scan'); break; } catch {}
      }
      if (!scanResult) return { ok: false, error: 'Page did not load in time' };
      // Re-scan after DOM stabilizes
      try { scanResult = await stableScan(); } catch {}
      return scanResult;
    }

    case 'goto': {
      await ensureNavTab(params.url);
      let scanResult;
      for (let i = 0; i < 8; i++) {
        await wait(500);
        try { scanResult = await sendToContent('scan'); break; } catch {}
      }
      if (!scanResult) return { ok: false, error: 'Page did not load in time' };
      // Re-scan after DOM stabilizes (catches async React/Vue rendering)
      try { scanResult = await stableScan(); } catch {}
      // Append page content so the AI gets both structure AND readable text
      try {
        const readResult = await sendToContent('read');
        if (readResult && readResult.result) {
          scanResult.result = scanResult.result + '\n\n📝 Content:\n' + readResult.result;
        }
      } catch {}
      return scanResult;
    }

    case 'clickSel':
      return await sendToContent('clickSel', { selector: params.selector, nth: params.nth });

    case 'typeSel': {
      const r = await sendToContent('typeSel', {
        selector: params.selector, nth: params.nth,
        text: params.text, submit: params.submit ?? false,
        fast: params.fast ?? false,
      });
      if (!r || !r.ok) return r;
      if (params.submit === false && params.fast) return r;
      await wait(1200);
      try {
        const s = await sendToContent('read');
        return { ...r, page: s?.result?.slice(0, 1500) || '' };
      } catch { return r; }
    }

    case 'query':
      return await sendToContent('query', { selector: params.selector, limit: params.limit });

    default:
      // 未显式处理的命令，直接转发给内容脚本
      try { return await sendToContent(command, params || {}); }
      catch (e) { return { ok: false, error: `Unknown: ${command} — ${e.message}` }; }
  }
}

// ── Startup ──────────────────────

connect();
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
