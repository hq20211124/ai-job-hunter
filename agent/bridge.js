/**
 * NavAgent 桥接服务
 * 在 127.0.0.1:61822 监听，等待浏览器扩展连上来，然后转发命令。
 *
 * 用法（库）：
 *   const bridge = require('./bridge');
 *   await bridge.start();
 *   const r = await bridge.send('goto', { url: 'https://www.zhipin.com' });
 *
 * 用法（命令行自测）：
 *   node bridge.js --test
 */
const { WebSocketServer } = require('ws');

const PORT = process.env.NAVAGENT_PORT ? Number(process.env.NAVAGENT_PORT) : 61822;

let wss = null;
let client = null;
let nextId = 1;
const pending = new Map();

function start() {
  return new Promise((resolve, reject) => {
    if (wss) return resolve();
    wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

    wss.on('listening', () => {
      console.log(`[bridge] 监听 ws://127.0.0.1:${PORT}`);
      resolve();
    });
    wss.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${PORT} 已被占用（可能已有另一个 bridge 在跑）`));
      } else reject(e);
    });

    wss.on('connection', (ws) => {
      client = ws;
      console.log('[bridge] 扩展已连接 ✅');
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.pong) return;
        if (msg.id && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg.error ? { ok: false, error: msg.error } : msg.result);
        }
      });
      ws.on('close', () => {
        console.log('[bridge] 扩展断开');
        if (client === ws) client = null;
      });
      ws.on('error', () => {});
    });
  });
}

function waitForClient(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (client && client.readyState === 1) return resolve();
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (client && client.readyState === 1) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        reject(new Error('等待扩展连接超时 —— 请确认 Chrome 已打开且 NavAgent 扩展已启用'));
      }
    }, 300);
  });
}

async function send(command, params = {}, timeoutMs = 90000) {
  await waitForClient();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve });
    try {
      client.send(JSON.stringify({ id, command, params }));
    } catch (e) {
      pending.delete(id);
      return reject(e);
    }
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`命令 ${command} 超时`)); }
    }, timeoutMs);
  });
}

function stop() {
  if (wss) { try { wss.close(); } catch (_) {} wss = null; client = null; }
}

module.exports = { start, stop, send, waitForClient, PORT };

// ---------- 命令行自测 ----------
if (require.main === module && process.argv.includes('--test')) {
  (async () => {
    await start();
    console.log('等待扩展连接……（请在 Chrome 中启用 NavAgent 扩展）');
    await waitForClient(120000);
    console.log('已连接，开始测试 goto + scan\n');

    const r1 = await send('goto', { url: 'https://www.baidu.com' });
    console.log('=== goto 返回 ===');
    console.log(typeof r1 === 'string' ? r1.slice(0, 1500) : JSON.stringify(r1).slice(0, 1500));

    const r2 = await send('read');
    console.log('\n=== read 返回 ===');
    console.log(typeof r2 === 'string' ? r2.slice(0, 800) : JSON.stringify(r2).slice(0, 800));

    stop();
    process.exit(0);
  })().catch((e) => { console.error('失败:', e.message); process.exit(1); });
}
