/**
 * 常驻浏览器代理
 *
 *   ws://127.0.0.1:61822   ← 浏览器扩展连这里（扩展是客户端）
 *   http://127.0.0.1:61823 ← 我下命令的地方
 *
 * 用法:
 *   node agent.js                    后台常驻
 *   curl -X POST http://127.0.0.1:61823/cmd -d '{"command":"goto","params":{"url":"..."}}'
 *   curl http://127.0.0.1:61823/status
 */
const http = require('http');
const bridge = require('./bridge');

const HTTP_PORT = 61823;

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => resolve(d));
  });
}

(async () => {
  await bridge.start();
  console.log(`[agent] 扩展端口  ws://127.0.0.1:${bridge.PORT}`);
  console.log('[agent] 命令端口  http://127.0.0.1:' + HTTP_PORT);
  console.log('[agent] 等待扩展连接……（请在 Chrome 中启用 NavAgent 扩展）');

  bridge.waitForClient(600000)
    .then(() => console.log('[agent] ✅ 扩展已就绪，可以下命令了'))
    .catch((e) => console.log('[agent] ⚠️ ' + e.message));

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/status') {
      let connected = false;
      try { await bridge.waitForClient(500); connected = true; } catch (_) {}
      return json(res, 200, { extensionConnected: connected, wsPort: bridge.PORT });
    }
    if (req.method === 'POST' && req.url === '/cmd') {
      let payload;
      try {
        const raw = await readBody(req);
        payload = JSON.parse(raw);
      } catch (e) {
        return json(res, 400, { ok: false, error: '请求体不是合法 JSON: ' + e.message });
      }
      const { command, params = {}, timeout = 90000 } = payload;
      if (!command) return json(res, 400, { ok: false, error: '缺少 command 字段' });
      const t0 = Date.now();
      try {
        const result = await bridge.send(command, params, timeout);
        console.log(`[agent] ${command} 完成 (${Date.now() - t0}ms)`);
        return json(res, 200, { ok: true, command, ms: Date.now() - t0, result });
      } catch (e) {
        console.log(`[agent] ${command} 失败: ${e.message}`);
        return json(res, 200, { ok: false, command, error: e.message });
      }
    }
    json(res, 404, { ok: false, error: '未知路径' });
  });

  server.listen(HTTP_PORT, '127.0.0.1', () => {
    console.log(`[agent] HTTP 命令接口已监听 ${HTTP_PORT}`);
  });
})().catch((e) => {
  console.error('[agent] 启动失败:', e.message);
  process.exit(1);
});
