/**
 * 查各平台的 HR 回复 / 主动来消息。
 *
 * 用法:
 *   node check-replies.js            # 查全部支持查询的平台
 *   node check-replies.js boss       # 只查 BOSS直聘
 *   node check-replies.js zhaopin    # 只查智联招聘
 *
 * 结果同时打印到终端并写入 data/replies-<平台>-<时间>.json
 *
 * ⚠️ 两个关键经验（都是踩过坑才有的）：
 *
 * 1. BOSS 的会话列表**只保留最近 100 条**，而且 DOM 只渲染 40 条（虚拟列表）。
 *    HR 主动找过来的消息很可能被挤出去 —— **只有点「未读」标签才看得到**。
 *    而「未读」标签**点开一次就会把会话标记为已读**（第二次点开是空的），
 *    所以必须「点开 → 立刻整体落盘」。
 *
 * 2. 判断「最后一条是谁发的」靠会话预览的前缀：
 *    我们发的会带 [送达] / [已读] / 「您的附件简历」/「您正在与Boss」；
 *    没有这些前缀的，就是对方发的。
 */
const fs = require('fs');
const path = require('path');
const { goto, call, pe, nap } = require('./lib/client');

const DATA = path.resolve(__dirname, '..', 'data');

/** 我们发出的消息在预览里的特征 */
const OUR = /\[送达\]|\[已读\]|您(加密的)?附件简历|您正在与Boss/;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function save(tag, obj) {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  const p = path.join(DATA, `replies-${tag}-${stamp()}.json`);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  return p;
}

/** 读 BOSS 会话列表（.friend-content 必须用精确类名，否则序号错位） */
const bossList = () => pe(`JSON.stringify(Array.from(document.querySelectorAll('.friend-content .text'))
  .map((e, i) => ({ i: i + 1, txt: (e.innerText || '').trim().replace(/\\s+/g, ' ') })))`)
  .then(s => { try { return JSON.parse(s); } catch { return []; } });

/** 点 BOSS 列表顶部的标签（全部/未读/新招呼/仅沟通） */
async function bossTab(name) {
  const r = await pe(`(function(){
    const el = Array.from(document.querySelectorAll('li,span,a,div'))
      .find(e => new RegExp('^' + ${JSON.stringify(name)} + '(\\\\s*\\\\d+)?$').test((e.innerText || '').trim())
             && e.offsetParent !== null && e.children.length <= 2);
    if (!el) return 'nf';
    el.click();
    return 'clicked:' + (el.innerText || '').trim();
  })()`);
  await nap(4000, 6000);
  return r;
}

async function checkBoss() {
  console.log('\n' + '='.repeat(70));
  console.log('BOSS直聘');
  console.log('='.repeat(70));

  await goto('https://www.zhipin.com/web/geek/chat');
  await nap(8000, 10000);

  const result = { platform: 'boss', unread: [], replies: [], recentlySent: [] };

  // ① 未读标签 —— 唯一一次机会，抓到立刻存
  const t = await bossTab('未读');
  console.log(`点「未读」: ${t}`);
  const unread = await bossList();
  result.unread = unread;
  console.log(`未读会话 ${unread.length} 条`);
  unread.forEach(c => console.log(`  [${c.i}] ${c.txt.slice(0, 130)}`));
  if (unread.length) console.log('  ⚠️ 这些会话已被标记为已读，下次点「未读」就看不到了');

  // ② 全部标签 —— 近日会话里谁最后发言
  await goto('https://www.zhipin.com/web/geek/chat');
  await nap(7000, 9000);
  const all = await bossList();
  const replied = all.filter(c => !OUR.test(c.txt));
  result.replies = replied;
  result.recentlySent = all.filter(c => OUR.test(c.txt)).slice(0, 10);

  console.log(`\n会话列表 ${all.length} 条（注：上限 100，DOM 只渲染 40）`);
  console.log(`★ 最后一条是对方发的（需要处理）: ${replied.length} 条`);
  replied.forEach(c => console.log(`  [${c.i}] ${c.txt.slice(0, 150)}`));
  if (!replied.length) console.log('  （无）');

  console.log(`\n最近发出的（核对用）:`);
  result.recentlySent.slice(0, 5).forEach(c => console.log(`  [${c.i}] ${c.txt.slice(0, 100)}`));

  console.log(`\n→ ${save('boss', result)}`);
  return result;
}

async function checkZhaopin() {
  console.log('\n' + '='.repeat(70));
  console.log('智联招聘');
  console.log('='.repeat(70));

  await goto('https://i.zhaopin.com/im?refcode=4018');
  await nap(10000, 12000);

  const result = { platform: 'zhaopin', tabs: {} };

  for (const tab of ['未读', '新招呼', '沟通中']) {
    const r = await pe(`(function(){
      const el = Array.from(document.querySelectorAll('a,li,span,div'))
        .find(e => (e.innerText || '').trim() === ${JSON.stringify(tab)} && e.offsetParent !== null && e.children.length <= 1);
      if (!el) return 'nf';
      el.click();
      return 'clicked';
    })()`);
    await nap(4000, 6000);

    // 智联的会话列表没有稳定类名，直接读页面文本的会话区
    const body = await pe(`(function(){
      const t = (document.body.innerText || '').replace(/\\s+/g, ' ');
      const i = t.indexOf('不合适');
      return t.slice(i >= 0 ? i + 3 : 0, (i >= 0 ? i + 3 : 0) + 1200).trim();
    })()`);
    result.tabs[tab] = body;
    console.log(`\n--- 「${tab}」 ---`);
    console.log(String(body).slice(0, 800) || '(空)');
  }

  console.log(`\n→ ${save('zhaopin', result)}`);
  return result;
}

(async () => {
  const which = (process.argv[2] || 'all').toLowerCase();
  try {
    if (which === 'all' || which === 'boss') await checkBoss();
    if (which === 'all' || which === 'zhaopin' || which === 'zhilian') await checkZhaopin();
    if (which === 'all') {
      console.log('\n' + '='.repeat(70));
      console.log('提示');
      console.log('='.repeat(70));
      console.log('猎聘 / 前程无忧 的网页版消息入口目前拿不到（猎聘的沟通弹窗在自动化下不挂载），');
      console.log('这两家建议在 APP 里看。');
    }
  } catch (e) {
    console.error('出错:', e.message);
    process.exit(1);
  }
  process.exit(0);
})();
