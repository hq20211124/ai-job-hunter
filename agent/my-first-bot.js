const { goto, read, extract, query, clickSel, pe, nap } = require('./lib/client');

(async () => {
  // 1. 打开一个网页
  console.log('打开网页…');
  const r = await goto('https://example.com');
  if (!r.ok) {
    console.log('打开失败:', r.error);
    process.exit(1);
  }
  await nap(1500, 2500);        // 等页面加载

  // 2. 读标题（在页面里执行 JS）
  const title = await pe('(function(){ return document.title; })()');
  console.log('页面标题:', title);

  // 3. 数一数有几个链接
  const links = await query('a', 20);
  console.log(`找到 ${links.length} 个链接`);
  links.forEach((l, i) => {
    console.log(`  ${i + 1}. "${l.text.trim()}"`);
  });

  // 4. 如果有链接，点第一个
  if (links.length) {
    console.log('点击第一个链接…');
    await clickSel('a', 1);
    await nap(2000, 3000);
    console.log('现在在:', await pe('(function(){ return location.href; })()'));
  }

  console.log('完成');
  process.exit(0);
})();
