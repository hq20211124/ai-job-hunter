/**
 * 本地代理客户端 —— 所有脚本共用的基础模块
 *
 *   const { call, pe, goto, read, extract, nap } = require('./lib/client');
 *   await goto('https://example.com');
 *   const md = await extract();
 *   const r  = await pe('document.title');   // 在页面主世界执行 JS
 */
const http = require('http');

const HOST = process.env.NAVAGENT_HOST || '127.0.0.1';
const PORT = Number(process.env.NAVAGENT_PORT || 61823);

/** 发一条命令给本地代理 */
function call(command, params = {}, timeout = 120000) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ command, params, timeout });
    const req = http.request({
      host: HOST, port: PORT, path: '/cmd', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false, error: 'bad json' }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

/** 取命令结果（字符串） */
const txt = (r) => String((r && r.result && r.result.result) || '');

/**
 * 在页面【主世界】执行 JS —— 可访问页面的 Vue / React 实例
 * ⚠️ code 必须是一个【表达式】（内部会包成 return (...)）。
 *    多语句请用 IIFE：`(function(){ ... })()`
 * ⚠️ 返回对象会被外层再序列化一次；建议在页面内先 JSON.stringify，避免拿到 [object Object]
 */
async function pe(code, timeout = 15000) {
  const r = await call('pageEval', { code, timeout });
  if (!r.ok) return { error: r.error };
  if (!r.result) return { error: 'empty' };
  if (r.result.error) return { error: r.result.error };
  return r.result.result;
}

/** 常用封装 */
const goto = (url) => call('goto', { url });
const read = (t = 40000) => call('read', {}, t).then(txt);
const extract = (max = 60000) => call('extract', { max_length: max, offset: 0 }).then(txt);
const query = (selector, limit = 60) => call('query', { selector, limit }).then((r) => (r.result && r.result.items) || []);
const clickSel = (selector, nth = 1) => call('clickSel', { selector, nth });
const typeSel = (selector, text, opts = {}) =>
  call('typeSel', Object.assign({ selector, text, submit: false, fast: true }, opts));
const scroll = (direction = 'down', times = 1) => call('scroll', { direction, times });

/** 人类节奏延时 */
const nap = (a = 2000, b = 3500) => new Promise((r) => setTimeout(r, a + Math.random() * (b - a)));

/** 等页面稳定的简单实现 */
async function settle(ms = 5000) { await nap(ms, ms + 1500); }

module.exports = {
  call, txt, pe, goto, read, extract, query, clickSel, typeSel, scroll, nap, settle,
  HOST, PORT,
};
