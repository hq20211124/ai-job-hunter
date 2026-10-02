const http = require('http');
function call(command, params = {}, timeout = 150000) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ command, params, timeout });
    const req = http.request({
      host: '127.0.0.1', port: 61823, path: '/cmd', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(body); req.end();
  });
}
const nap = (a = 4000, b = 5500) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));
const pe = async (code, t = 25000) => {
  const r = await call('pageEval', { code, timeout: t });
  if (r.ok && r.result) return r.result.error ? { error: r.result.error } : r.result.result;
  return { error: JSON.stringify(r).slice(0, 300) };
};

const LIST = `JSON.stringify(Array.from(document.querySelectorAll('.work-exp-view-item-inner')).map((el,i)=>({
  idx:i+1, title:(el.querySelector('.item-title')||{}).textContent, time:(el.querySelector('.item-title-time')||{}).textContent
})))`;

// 删除第 2 条
const DO_DELETE = `JSON.stringify((function(){
  const fk = (n) => n ? Object.keys(n).find(k => k.startsWith('__reactInternalInstance')) : null;
  const el = Array.from(document.querySelectorAll('.work-exp-view-item-inner'))[1];
  if (!el) return { error: 'no item 2' };
  const del = el.querySelector('.action-delete');
  const fiber = del[fk(del)];
  const props = fiber.memoizedProps || fiber.pendingProps;
  if (typeof props.onClick !== 'function') return { error: 'no onClick' };
  props.onClick({ preventDefault(){}, stopPropagation(){}, target: del, currentTarget: del, type:'click', nativeEvent:{} });
  return { called: true, target: (el.querySelector('.item-title-time')||{}).textContent };
})())`;

// 用 Ant Design 标准类名点确认
const CONFIRM = `JSON.stringify((function(){
  const sel = '.ant-modal-confirm-btns .ant-btn-primary, .ant-modal-confirm .ant-btn-primary, .ant-modal-footer .ant-btn-primary';
  const btns = Array.from(document.querySelectorAll(sel));
  if (!btns.length) {
    // 兜底：找模态框里所有按钮
    const all = Array.from(document.querySelectorAll('.ant-modal-root button, .ant-modal button'));
    return { error: 'no primary btn', available: all.map(b => ({cls:(b.className||'').toString().slice(0,60), txt:(b.textContent||'').trim()})) };
  }
  btns[0].click();
  return { clicked: true, text: (btns[0].textContent||'').trim(), cls: (btns[0].className||'').toString().slice(0,60) };
})())`;

(async () => {
  await call('goto', { url: 'https://c.liepin.com/resume/edit' });
  await nap(10000, 12000);
  for (let i = 0; i < 3; i++) { await call('scroll', { direction: 'down' }, 20000); await nap(1200, 2000); }

  console.log('① 删除前');
  let r = await pe(LIST);
  if (typeof r === 'string') JSON.parse(r).forEach(w => console.log(`   ${w.idx}. ${w.title}  ${w.time}`));

  console.log('\n② 触发删除');
  r = await pe(DO_DELETE);
  console.log('   ', typeof r === 'string' ? r : JSON.stringify(r));
  await nap(3500, 5000);

  console.log('\n③ 点确认');
  r = await pe(CONFIRM);
  console.log('   ', typeof r === 'string' ? r : JSON.stringify(r));
  await nap(6000, 8000);

  console.log('\n④ 服务端核对（刷新）');
  await call('goto', { url: 'https://c.liepin.com/resume/edit' });
  await nap(11000, 13000);
  for (let i = 0; i < 4; i++) { await call('scroll', { direction: 'down' }, 20000); await nap(1200, 2000); }
  r = await pe(LIST);
  if (typeof r === 'string') {
    const list = JSON.parse(r);
    console.log('   剩余条目:');
    list.forEach(w => console.log(`      ${w.idx}. ${w.title}  ${w.time}`));
    console.log(`   某某科技: ${list.filter(w => /某某科技/.test(w.title)).length} 条`);
  }
  const md = String((await call('extract', { max_length: 50000, offset: 0 }))?.result?.result ?? '');
  console.log('   含 "2024/02 - 2026/02":', /2024\/02 - 2026\/02/.test(md) ? '🔴 仍在' : '✅ 已去重');
  console.log('   40% 编造数字:', /约\s*40%/.test(md) ? '🔴 仍在' : '✅ 已清除');
  console.log('   三段公司齐全:', ['某某科技','某某信息','某某软件'].map(n => `${n}${md.includes(n)?'✅':'❌'}`).join(' '));
  process.exit(0);
})();
