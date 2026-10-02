/**
 * 命令行下命令给常驻代理
 *   node cmd.js <command> [arg]
 * 例:
 *   node cmd.js goto https://www.zhipin.com
 *   node cmd.js read
 *   node cmd.js click 12
 *   node cmd.js pageEval "document.title"
 *   node cmd.js screenshot              -> 存到 shots/shot-<时间>.png
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const [, , command, arg] = process.argv;
if (!command) { console.error('用法: node cmd.js <command> [arg]'); process.exit(1); }

let params = {};
if (arg) {
  if (command === 'goto') params = { url: arg };
  else if (command === 'zone') params = { zoneId: Number(arg) };
  else if (command === 'pageEval') params = { code: arg };
  else if (/^\d+$/.test(arg)) params = { index: Number(arg) };
  else { try { params = JSON.parse(arg); } catch { params = { text: arg }; } }
}

const body = JSON.stringify({ command, params, timeout: 120000 });

const req = http.request({
  host: '127.0.0.1', port: 61823, path: '/cmd', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let d = '';
  res.setEncoding('utf8');
  res.on('data', (c) => { d += c; });
  res.on('end', () => {
    let j;
    try { j = JSON.parse(d); } catch { console.log(d); return; }
    if (!j.ok) { console.log('❌ ' + j.error); return; }
    const r = j.result;

    // 截图：把 dataURL 落盘
    if (command === 'screenshot' && r && r.dataUrl) {
      const b64 = String(r.dataUrl).replace(/^data:image\/png;base64,/, '');
      const dir = path.join(__dirname, '..', 'shots');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `shot-${Date.now()}.png`);
      fs.writeFileSync(f, Buffer.from(b64, 'base64'));
      console.log(`✅ screenshot 已保存: ${f}  (${Math.round(b64.length * 0.75 / 1024)} KB)`);
      return;
    }

    console.log(`✅ ${command}  (${j.ms}ms)`);
    if (typeof r === 'string') console.log(r);
    else if (r && typeof r === 'object') {
      if (r.error) { console.log('⚠️ ' + r.error); return; }
      if (r.result !== undefined) {
        console.log(typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2));
      } else if (r.scan) {
        console.log(r.scan);
      } else {
        console.log(JSON.stringify(r, null, 2));
      }
    }
  });
});
req.on('error', (e) => console.error('请求失败:', e.message));
req.write(body);
req.end();
