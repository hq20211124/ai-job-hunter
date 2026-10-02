/**
 * 投递流水线 —— 逐个职位：进详情 → 读JD → 定制话术 → 投递 → 发招呼语
 * 用法: node apply-jobs.js <起始序号> <数量>
 */
const http = require('http');
const fs = require('fs');
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
const nap = (a = 2000, b = 3500) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));
const txt = r => String(r?.result?.result ?? '');

/** 根据职位特征挑选最贴合的自我介绍片段 */
function buildGreeting(job, jd) {
  const all = job.title + ' ' + jd;
  const parts = [];

  if (/AI|人工智能|大模型|LLM|智能体|Agent|LangChain/i.test(all)) {
    parts.push('我现在做的正是 AI 落地：用 LangGraph + LangChain 构建生产级智能体，让 AI 参与金融发债主体的信用评价并直接产出风险评估报告（已上线城投债、产业债、REITs），同时用 Java 搭了配套的调度服务——因为智能体本身不擅长数据中转。');
  }
  if (/金融|证券|期货|基金|量化|投研|资管|银行|支付/.test(all)) {
    parts.push('金融方向我做过券商统一大系统下的投资策略研究平台（微服务架构，高斯数据库 + 东方通中间件），负责策略展示服务，对接前端动态因子参数，与算法组协作完成因子计算；也做过模拟组合计算服务，按金融公式实现开盘初始化、实时计算、组合汇总与仓位更新。');
  }
  if (/MES|WMS|制造|工业|仓储|生产|供应链|ERP/.test(all)) {
    parts.push('工业侧我独立开发过 WMS 仓储 / MES 制造系统，覆盖出入库、库区管理、库存变更、质检登记，支持 PDA 与 PC 端协同的上下料、料盘绑定、报废与损耗计算。');
  }
  if (/架构|技术负责人|组长|Leader|技术经理/.test(all)) {
    parts.push('架构上我主导过老式多模块单体到微服务 + DDD 的改造：拆服务、建网关与工作流基座、上容器化与自动化部署实现一键发布，同时重构了需求与发版节奏、建立起单元测试到端到端测试的质量体系。');
  }
  if (!parts.length) {
    parts.push('我 7 年 Java 后端，做过微服务架构改造、金融投资策略平台、WMS/MES 制造系统，也做 AI 智能体落地。');
  }

  return [
    `您好，看到「${job.title}」这个岗位。`,
    parts.slice(0, 2).join('\n'),
    '方便的话想了解下团队规模和技术栈，聊聊看是否合适。',
  ].join('\n');
}

async function openConversation(keywords) {
  const q = await call('query', { selector: '.friend-content', limit: 100 });
  const items = (q.result?.items || []).filter(i => i.visible && i.text.length > 10);
  if (!items.length) return { ok: false, why: '会话列表为空' };

  // 依次尝试多个候选关键词
  for (const kw of keywords) {
    if (!kw || kw.length < 2) continue;
    const t = items.find(i => i.text.includes(kw));
    if (t) {
      const c = await call('clickSel', { selector: '.friend-content .text', nth: t.i });
      if (c.ok) {
        await nap(3000, 4500);
        const rd = await call('read', {}, 30000);
        if (txt(rd).includes(kw)) return { ok: true, matched: kw };
      }
    }
  }

  // 兜底：刚投递的会话应该在最前面，尝试前 3 条
  for (let i = 1; i <= Math.min(3, items.length); i++) {
    const c = await call('clickSel', { selector: '.friend-content .text', nth: i });
    if (!c.ok) continue;
    await nap(3000, 4500);
    const rd = await call('read', {}, 30000);
    const page = txt(rd);
    // 确认打开的是某个会话（右侧不再是空状态提示）
    if (!/与您进行过沟通的 Boss 都会在左侧列表中显示/.test(page)) {
      return { ok: true, matched: `兜底第${i}条`, text: items[i - 1].text.slice(0, 60) };
    }
  }
  return { ok: false, why: '所有候选都未匹配' };
}

/** 生成公司名的多个候选匹配词 */
function companyKeywords(job) {
  const c = job.company || '';
  const cands = [
    c,
    c.replace(/有限公司|股份有限公司|科技|集团|公司|（.*?）|\(.*?\)/g, '').trim(),
    c.slice(0, 4),
    c.slice(0, 3),
    c.slice(0, 2),
  ];
  return [...new Set(cands.filter(x => x && x.length >= 2))];
}

(async () => {
  const start = Number(process.argv[2] || 1) - 1;
  const count = Number(process.argv[3] || 3);
  const jobs = JSON.parse(fs.readFileSync('C:\\D\\agent\\find-job\\gd-jobs-ranked.json', 'utf8'));

  // 标题必须是开发/技术类岗位，否则跳过（防止"车间主任"这类误投）
  const DEV_TITLE = /java|后端|服务端|开发|研发|架构|技术|engineer|developer|backend|程序|软件|系统/i;
  const batch = jobs.slice(start, start + count).filter(j => {
    if (!DEV_TITLE.test(j.title)) {
      console.log(`⏭️  跳过非开发岗: ${j.title} | ${j.company}`);
      return false;
    }
    return true;
  });

  const results = [];

  for (let k = 0; k < batch.length; k++) {
    const job = batch[k];
    const idx = start + k + 1;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`【${idx}】${job.title}  |  ${job.company}  |  ${job.location}`);
    console.log('='.repeat(70));

    // ① 进详情页
    let r = await call('goto', { url: job.url });
    if (!r.ok) { console.log('  ❌ 打开失败:', r.error); results.push({ ...job, ok: false, why: '打开失败' }); continue; }
    await nap(3500, 5000);

    // ② 读 JD
    r = await call('extract', { max_length: 25000, offset: 0 });
    const jd = txt(r);
    const jdText = jd.replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
    fs.writeFileSync(`C:\\D\\agent\\find-job\\jd-apply-${idx}.txt`,
      `职位: ${job.title}\n公司: ${job.company}\n地点: ${job.location}\nURL: ${job.url}\n\n${jd}`, 'utf8');
    console.log(`  JD ${jd.length} 字符`);

    // ③ 点「立即沟通」
    let applied = false;
    for (const sel of ['a[class*="chat"]', '[class*="chat"] a', 'a']) {
      const q = await call('query', { selector: sel, limit: 80 });
      const btn = (q.result?.items || []).find(i => i.visible && i.text.trim() === '立即沟通');
      if (btn) {
        const c = await call('clickSel', { selector: sel, nth: btn.i });
        if (c.ok) { applied = true; console.log(`  ✅ 已点「立即沟通」(${sel} #${btn.i})`); break; }
      }
    }
    if (!applied) { console.log('  ⚠️ 没找到「立即沟通」按钮（可能已投过）'); }
    await nap(4000, 6000);

    // ④ 打开会话发招呼语
    await call('goto', { url: 'https://www.zhipin.com/web/geek/chat' });
    await nap(4000, 5500);
    const conv = await openConversation(companyKeywords(job));
    console.log(`  会话匹配:`, conv.ok ? `✅ 命中「${conv.matched}」` : `⚠️ ${conv.why}`);
    if (conv.ok) {
      const greeting = buildGreeting(job, jdText);
      r = await call('typeSel', { selector: '.chat-input', text: greeting, submit: false, fast: true });
      await nap(1800, 2800);
      const bq = await call('query', { selector: 'button', limit: 40 });
      const sendBtn = (bq.result?.items || []).find(i => i.visible && i.text.trim() === '发送');
      if (sendBtn) {
        const sc = await call('clickSel', { selector: 'button', nth: sendBtn.i });
        await nap(3500, 5000);
        const ib = await call('query', { selector: '.chat-input', limit: 5 });
        const box = (ib.result?.items || [])[0];
        const sent = !box || !box.text.trim();
        console.log('  招呼语:', sent ? '✅ 已发送' : '❌ 未发出');
        results.push({ ...job, ok: applied && sent, greeting });
      } else {
        console.log('  ❌ 找不到发送按钮');
        results.push({ ...job, ok: false, why: '无发送按钮' });
      }
    } else {
      results.push({ ...job, ok: applied, why: '会话未找到' });
    }

    const wait = 12000 + Math.random() * 15000;
    console.log(`  （等待 ${(wait / 1000).toFixed(0)} 秒，人类节奏）`);
    await new Promise(res => setTimeout(res, wait));
  }

  fs.writeFileSync('C:\\D\\agent\\find-job\\apply-results.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n\n${'='.repeat(70)}\n汇总`);
  results.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'} ${r.title} | ${r.company}`));
  const okN = results.filter(r => r.ok).length;
  console.log(`成功 ${okN} / ${results.length}`);
  process.exit(0);
})();
