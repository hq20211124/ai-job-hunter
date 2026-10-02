# 四平台实战手册 —— 入口 / 组件 API / 动作流程 / 反爬

> 这份文档记录的是**四个招聘平台已经跑通的完整操作路径**，全部经过实测。
> 照着做不用再探索。配合 [`ADD-PROJECTS.md`](ADD-PROJECTS.md)（项目经历专题）和 [`TUTORIAL.md`](TUTORIAL.md)（上手教程）一起看。
>
> 最后更新：2026-10-02

---

## 0. 总表：入口与框架

| | BOSS直聘 | 智联招聘 | 前程无忧 | 猎聘 |
|---|---|---|---|---|
| **前端框架** | Vue | Vue 2 | Vue 2 | **React 16** |
| **简历页** | `zhipin.com/web/geek/resume` | `i.zhaopin.com/resume` | `www.51job.com/resume/center` | `c.liepin.com/resume/edit` |
| **附件简历** | 简历页侧栏「附件管理」 | 简历页内「附件简历」 | 简历页「附件管理」 | 简历页「附件简历」 |
| **消息页** | `zhipin.com/web/geek/chat` ✅ | `i.zhaopin.com/im?refcode=4018` ✅ | ❌ 未找到 | ❌ 弹窗挂载为空 |
| **主要拦路虎** | 请求卡片多按钮 | 级联选择器 | 悬停才出编辑入口 | React fiber |

**入口踩坑备忘**
- 前程无忧：`i.51job.com/` 直接访问返回 **403**，`i.51job.com/resume/resume.php` 是 **404**（改版前的老地址）。正确入口从 `www.51job.com` 首页的「在线简历」点进去 → `www.51job.com/resume/center`。
- 猎聘：首页 `www.liepin.com` 会 302 到 `c.liepin.com`，用后者。
- 智联：`goto` 返回的是**跳转前**的 URL，等 6-9 秒再 `scan` 才是新页面。

---

## 1. 通用四步法：对付「点了没反应」的控件

按顺序试，绝大多数问题在第 3 级解决。

### 第 1 级 —— 强制显示隐藏元素

悬停才出现的按钮（删除/编辑）先要让它**有布局盒子**，否则点击无效（坐标为 `0,0`）。

```js
// ❌ 错的：设成空字符串只是清空内联样式，会回退到 CSS 的 display:none
node.style.display = '';

// ✅ 对的：显式覆盖，并用 !important 压过 CSS 优先级
node.style.setProperty('display', 'block', 'important');
node.style.setProperty('visibility', 'visible', 'important');
node.style.setProperty('opacity', '1', 'important');
node.style.setProperty('pointer-events', 'auto', 'important');
```

> 这是项目早期一个真实 bug：`forceVisible()` 一直用错写法，导致所有隐藏控件都点不动。
> 已修在 `extension/content-script.js`。

### 第 2 级 —— 点对元素

包装元素（`<div class="btn-box">`）通常没有事件处理器，**真正带事件的是内层 `<button>` / `<a>`**。

```js
// ❌ 按文档顺序，第一个匹配到的是外层 DIV
querySelectorAll('button, a, span, div')[0]
// ✅ 明确标签
querySelectorAll('button')[0]
```

**真实案例**：猎聘「同步向导」的「更新并继续」，外层是 `<div class="btn-box">`，内层才是 `<button class="ant-btn ant-btn-primary">`。点 DIV 十几次毫无反应，点 BUTTON 一次就前进。

### 第 3 级 —— Vue：读方法源码，直接调 API ⭐ 最常用

```js
// 1. 找元素上挂的 Vue 实例
let n = el, d = 0, vue = null;
while (n && d < 20) { if (n.__vue__) { vue = n.__vue__; break; } n = n.parentElement; d++; }

// 2. 看它有什么
vue.$options.name                 // 组件名
vue.$options.methods              // 方法名列表
vue.$data                         // 数据模型

// 3. 读源码，找真正调 API 的那个（关键一步）
vue.$options.methods.handleSave.toString()
// → function(ref){ this.$refs[ref].validate(ok => ok && this.saveSelfInfo()) }
//   ↑ handleSave 只是校验包装，saveSelfInfo 才调 API → 直接调它

// 4. 直接调用，绕过 UI 校验
vue.advantageForm.desc = '新内容';
vue.saveSelfInfo();
```

**判断标准**：找那种**名字朴实、方法体里直接出现 `$api.xxx` 或 `axios`** 的方法。

> 打包压缩后有些方法会显示 `function () { [native code] }`（Vue 3 setup 返回的函数）。这时改走「设 `$data` + 调业务方法」，或者往上找父组件。

### 第 4 级 —— React：走 fiber 树拿事件处理器

React 元素上没有 `__vue__`。React 16/17 挂的是 `__reactInternalInstance$xxx`（**不是** `__reactProps$`，后者是 React 17+ 才有的另一种键）。

```js
const el = document.querySelector('.action-delete');

// 先试 React 17+ 的直接 props
const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps'));
if (propsKey && typeof el[propsKey].onClick === 'function') {
  el[propsKey].onClick({ preventDefault(){}, stopPropagation(){} });
} else {
  // React 16：沿 fiber 树向上找
  const key = Object.keys(el).find(k => k.startsWith('__reactInternalInstance'));
  let fiber = el[key], depth = 0;
  while (fiber && depth < 20) {
    const props = fiber.memoizedProps || fiber.pendingProps || {};
    if (typeof props.onClick === 'function') {
      props.onClick({ preventDefault(){}, stopPropagation(){}, target: el, currentTarget: el, type: 'click', nativeEvent: {} });
      break;
    }
    fiber = fiber.return;   // 沿 fiber 树向上
    depth++;
  }
}
```

**实战**：猎聘工作经历的删除按钮（`<span class="action-delete">`）挂在 fiber `d=0` 上，只有 `onClick`；往上到 `d=3` 才拿到组件级的 `onEdit` / `onDelete`。

**Ant Design 确认弹窗**：两个汉字的按钮文字中间会被插一个空格（`确 定`），别用文字匹配，用类名：

```js
document.querySelector('.ant-modal-confirm-btns .ant-btn-primary').click();
```

---

## 2. BOSS直聘

### 2.1 去重判据：详情页按钮，不是会话列表 ⚠️

**BOSS 的消息会话列表只保留最近 40 条**（滚到底、点「滚动加载更多」都不会增加；新会话进来，旧会话被挤掉）。

所以 **「会话列表里没有」≠「没投过」**。唯一可靠的判据在**职位详情页**：

```
按钮文案「立即沟通」  → 没投过，可以投
按钮文案「继续沟通」  → 已经投过了，跳过
```

> 实测教训：按会话列表去重后去投，队列前 16 个岗位全部显示「继续沟通」——
> 它们早就投过了，只是会话被挤出了 40 条窗口。

### 2.2 薪资被字体混淆（列表页），详情页才是明文 ⚠️

BOSS 在**搜索结果列表页**用 Unicode 私有区码点（`U+E0xx`）做**字体混淆**反爬。抓下来的"薪资"是假字符：

```
U+E032 U+E036 "-" U+E032 U+E037 "K"
```

**`scrape-jobs.js` 从列表页抓到的 salary 字段不可用。**
**职位详情页的 `.salary` 是明文**：

```js
await pe(`(function(){ const e=document.querySelector('.salary'); return e ? String(e.innerText).trim() : ''; })()`)
// → "30-40K·14薪"
```

**结论：薪资一律在详情页读。**

### 2.3 投递动作链

```js
// ① 进详情页，读薪资 + JD
await goto(jobUrl);
await nap(4000, 6000);
const salary = await pe(`(function(){const e=document.querySelector('.salary');return e?e.innerText.trim():'';})()`);

// ② 判重：按钮文案
//    必须用 query 列出候选元素的 text 再筛，别只看第一个
// ③ 点「立即沟通」—— 必须点 <a>，不是外层 <div>
for (const sel of ['a[class*="chat"]', '[class*="chat"] a', 'a']) { ... }

// ④ 回消息页，打开对应会话
await goto('https://www.zhipin.com/web/geek/chat');
await nap(4500, 6000);

// ⑤ 输入：目标必须是 .chat-input 本身
await typeSel('.chat-input', greeting, { submit: false, fast: true });

// ⑥ 发送：点 textContent === '发送' 的 <button>
// ⑦ 成功判据：.chat-input 已清空（不是"点了按钮就算成功"）
```

### 2.4 会话列表与打开会话

```js
// ✅ 必须用精确类名 .friend-content
//    用 [class*="friend-content"] 会同时命中 .friend-content-warp，序号全部错位
const list = await pe(`JSON.stringify(Array.from(document.querySelectorAll('.friend-content .text'))
  .map((e,i)=>({ i:i+1, txt:(e.innerText||'').trim().replace(/\\s+/g,' ') })))`);

// 打开会话：点 .text（不是 .friend-content）
await clickSel('.friend-content .text', nth);
```

列表预览文本长这样，**可以用来匹配公司名或职位名**：

```
15:07 王先生深圳市某某科技人事 [送达] 您好，看到「高级java开发工程师」这个岗位。 ……
```

> 兜底技巧：公司简称匹配不上时，用**职位名**匹配——预览里就含「职位名」。

**标签页**：`全部` / `未读` / `新招呼` / `仅沟通`。
**别只看「全部」** —— 新消息的会话可能排在虚拟列表里没渲染出来，要看「未读」。

### 2.5 找历史会话：列表上限 100 条 + 虚拟滚动 + 搜索框

#### ⚠️ 会话列表是**虚拟列表**，DOM 里只有 40 条，实际最多 100 条

```html
<div class="user-list-content">
  <ul role="group" style="padding: 0px 0px 4680px;">   <!-- 大块 padding = 未渲染的条目占位 -->
    <li>…</li> ×40                                       <!-- 只渲染 40 个 -->
```

`padding-bottom` 越大，说明没渲染的条目越多。**直接设 `scrollTop` 不会触发重渲染**，
必须补一个 `scroll` 事件：

```js
// ✅ 这样滚才有效（每次 500px，循环到 scrollTop 触底）
await pe(`(function(){
  const box = document.querySelector('.user-list-content');
  box.scrollTop = box.scrollTop + 500;
  box.dispatchEvent(new Event('scroll', { bubbles: true }));   // ← 关键
  return box.scrollTop;
})()`);
await nap(2000, 3000);
// 每滚一轮就把当前渲染出来的条目收集进 Set 去重，滚到底就能凑齐全部
```

❌ 无效的做法：`box.scrollTo(...)`、`dispatchEvent(new WheelEvent(...))` —— `scrollTop` 会变，但列表不重渲染。

#### 会话列表最多只有 100 条，更早的会被挤出去

实测：批量投递当天，列表里的 100 条**全是当天下午的**，更早的对话（哪怕只隔了 9 天）都不在列表里。

**要找旧会话，用页面顶部的会话搜索框**（`.boss-search-input`）——
但**搜索结果渲染在另一个容器里**，不是 `.friend-content`：

```js
// 输入关键词
await typeSel('.boss-search-input', '某某公司', { submit: false, fast: true });
await nap(2500, 3500);

// ✅ 结果在这里（.friend-content 里是空的，别找错地方）
const results = JSON.parse(await pe(`JSON.stringify(
  Array.from(document.querySelectorAll('.search-list'))
    .map((e,i)=>({ i:i+1, txt:(e.innerText||'').trim().replace(/\\s+/g,' ') })))`));
// → [{ i:1, txt:'张女士 某某公司 HR 职位: java开发工程师' }, …]

// 点第 i 条打开会话
await pe(`(function(){
  const els = Array.from(document.querySelectorAll('.search-list')).filter(e => (e.innerText||'').trim());
  els[${i} - 1].click();
})()`);
```

> 搜索框的 placeholder 是「搜索30天内的联系人」，所以**只能找到 30 天内的**。
> 同名联系人可能有多条（如「华苏科技」有 4 个人），要用姓名精确挑。

#### ⚠️ 判断「会话是否真的打开了」，别用 `read` 命令的文本

这是个踩过的坑：用 `read` 的输出里有没有「按Enter键发送」来判断，**会误判**——
明明会话已经打开（DOM 里就有那句话），`read` 却没带上，导致整批发送被跳过。

**正确做法：直接读 `.chat-conversation` 的 DOM。**

```js
const st = JSON.parse(await pe(`JSON.stringify((function(){
  const e = document.querySelector('.chat-conversation');
  return {
    head: e ? (e.innerText||'').replace(/\\s+/g,' ').slice(0,100) : '',
    hasInput: !!document.querySelector('.chat-input'),
    alreadyReplied: e ? /感谢联系/.test(e.innerText||'') : false   // 幂等：已回过就跳过
  };
})())`));
// 用 head.length > 30 && hasInput 判定会话已打开
```

**发送成功的唯一判据仍然是 `.chat-input` 已清空**，而且发送前先读一次输入框回显，
确认文字真的进去了（回显 < 10 字就别发，否则会把空消息或残留内容发出去）。

### 2.6 检查 HR 回复：**必须先点「未读」标签** ⚠️ 最容易漏

BOSS 消息页有四个标签：`全部` / `未读` / `新招呼` / `仅沟通`。

- **「全部」只按最近活动排序，且列表上限约 40 条** —— 新投递的会话会把旧的挤出去。
- **HR 主动找过来的消息，很可能不在「全部」的前 40 条里。**
- **只有「未读」标签能看到它们。**

> **真实教训**：连续几次检查都只看了「全部」，结论是「没人回复」；
> 后来点开「未读」，发现 **40 条 HR 主动发来的消息，最早的是 9 天前，一直没被看到**。

**⚠️ 而且「未读」标签点开一次就会把这些会话标记为已读** —— 第二次点开就空了。

所以正确的检查顺序是：

```
1. 先点「未读」→ 立刻把整份列表抓下来存盘（这是唯一一次机会）
2. 再点「新招呼」→ 看有没有 HR 主动发起沟通
3. 最后看「全部」→ 核对我们发出去的招呼语状态
```

**抓下来之后立刻落盘**，别只打印在终端里，否则下一次就抓不到了。

**区分「谁发的」**：会话预览有固定格式，我们发的会带状态前缀：

```
15:07 王先生某某科技人事 [送达] 您好，看到「高级java开发工程师」这个岗位。……   ← 我们发的
09月30日 周女士某公司高级招聘顾问 你好，我们正在招聘Java……                   ← HR 发的
```

判定用的正则：

```js
const OUR = /\[送达\]|\[已读\]|您(加密的)?附件简历|您正在与Boss/;
const replies = convs.filter(c => !OUR.test(c.txt));   // 最后一条不是我们发的
```

### 2.7 附件简历请求卡片（容易重复发送）⚠️

HR 发起「我想要一份您的附件简历，您是否同意」时，会话里会出现一张卡片：

```html
<div class="message-card-wrap">
  <div class="message-card-top-title">我想要一份您的附件简历，您是否同意</div>
  <div class="message-card-buttons">
    <span class="card-btn">拒绝</span>
    <span class="card-btn">同意</span>
  </div>
</div>
```

**同一个会话里通常有 3 张卡片**（附件简历 / 交换联系方式 / 交换微信），长得一模一样。必须**按卡片标题定位**，再在卡片内定位按钮：

```js
// 算出目标按钮在全局 .card-btn 序列里的 1-based 下标
const idx = await pe(`(function(){
  const cards = Array.from(document.querySelectorAll('.message-card-wrap'));
  const card = cards.find(c => /交换联系方式/.test(c.querySelector('.message-card-top-title')?.innerText||''));
  if (!card) return 0;
  const btn = Array.from(card.querySelectorAll('.card-btn')).find(b => b.innerText.trim() === '同意');
  return btn ? Array.from(document.querySelectorAll('.card-btn')).indexOf(btn) + 1 : 0;
})()`);
await clickSel('.card-btn', idx);       // 用全局下标点，精确命中
```

**点击前后都要读状态**，按钮变 `disabled`（class 里出现 `disabled`）才算生效：

```js
// 点击后重新读卡片
// card.btns.every(b => /disabled/.test(b.className))  →  true 表示生效
```

**⚠️ 重复发送陷阱**：卡片**点了不会消失**，只是按钮变成 `disabled`。
如果你在循环里"点第一个同意"，就会**连发 N 次附件简历**。
**规矩：一次只点一下 → 读状态确认 → 再决定下一步。**

### 2.8 点「立即沟通」会自动发一条默认招呼语

BOSS 在你点「立即沟通」时会**自动替你把默认招呼语发出去**（内容形如「你好，关注贵公司很久了，XX还有空缺么？」）。

**含义**：
- 你自己定制的话术即使发送失败，这次接触**也不算白费**；
- 但如果你随后又发定制话术，HR 会看到**两条**消息。

### 2.9 猎头索要联系方式

会话里会出现「我想要和您交换联系方式，您是否同意」。同意后**对方手机号会直接显示在会话里**（卡片变成「XX的手机号 138xxxxxxxx」+「复制手机号」按钮）。

> ⚠️ 这类操作涉及个人隐私，**未获用户明确授权不要点**。

---

## 3. 智联招聘

### 3.1 入口

| 页面 | 地址 |
|---|---|
| 简历 | `https://i.zhaopin.com/resume` |
| 消息 | `https://i.zhaopin.com/im?refcode=4018`（首页点「消息」跳转） |
| 聊天设置 | `https://i.zhaopin.com/im/greeting/setting` |

### 3.2 在线简历编辑

**编辑态入口**：`.profile-pre-edit`（个人信息区块）、个人优势用**隐藏的** `.zp-evalution-edit-text`（`vis=false`，但**直接 `el.click()` 能生效**）。

**个人优势 —— 500 字硬上限** ⚠️

字段旁有提示 `<div class="zp-evalution-edit-surplus fr">还可输入 188 个字</div>`。
**写入前先读这个提示**，否则写入"成功"但保存被服务端拒绝，刷新后内容还原。

> 实测：写 606 字 → 保存无效（刷新还原）；压到 438 字 → 立即成功。

**技术栈没有独立板块** → 并进「个人优势」。

**点不动的组件**：求职意向的**级联选择器**（`s-cascader__option`）不接受合成点击，只能人工操作。

### 3.3 发附件简历给 HR（组件 API 路线）⭐

点「同意」**不会直接发送**，而是**弹出「请选择要发送的简历」对话框**（选项：在线简历 / 附件 PDF）。之前脚本"点不动"的真相就在这里。

```
①  组件 ImMessageCustom11（消息卡片）
    方法: onAccept / onRefuse / onAcceptSuccess / patchSessionAfterAccept
          / openUploadAttach / checkAcceptIntercept / refreshHaveAttachResume
    数据: localStatus / busy / haveAttachResume / sessionContext

②  调 onAccept()  →  弹出选择框

③  在选择框里选「附件简历」→ 点「发送」

④  弹窗组件 ImDialog（.im-dialog-root）
    方法: mountToBody / handleMaskClick / handleClose / handleCancel / handleConfirm
    —— 发送按钮点不动时，可直接调 handleConfirm()
```

**可用的精确类名**：

```
button.im-msg-11__btn.im-msg-11__btn--agree     「同意」
button.im-send-resume-nav__chip                 「发简历」
```

**成功率与限制**（实测）：

| 情况 | 结果 |
|---|---|
| 昨天的会话（1 天内） | ✅ 发送成功 |
| 30-50 天前的旧消息 | ❌ 发不出去；部分直接提示「该职位已下线或删除」 |

**结论：过期会话放弃，不要反复重试。**

### 3.4 项目经历

见 [`ADD-PROJECTS.md`](ADD-PROJECTS.md) 第二节（含必踩的 4 个坑）。

---

## 4. 前程无忧

### 4.1 入口

| 页面 | 地址 |
|---|---|
| 简历 | `https://www.51job.com/resume/center?lang=c` |
| 附件附件列表接口 | 简历页「附件管理」区块 |
| 消息 | ❌ 网页版未找到入口（用户平时在 APP 看） |

> ⚠️ `i.51job.com/` 返回 **403**，`i.51job.com/resume/resume.php` 是老的 404 地址 —— 别再用。

### 4.2 个人优势 —— 必须走组件 API

**DOM 里根本没有编辑按钮**：

```html
<div class="advantage_Content">
  <div class="advantage_info">
    <div class="advantage_title">个人优势</div>
    <div class="advantage_desc hoverTrans">     <!-- hoverTrans = 悬停才变 -->
      <div class="advantage_desc_text">7 年 Java 后端经验…</div>
```

点描述文字打不开编辑区。**直接调组件**：

```
组件名: PersonalAdvantage
props:  resumeId / closeEdit / advantageInfo
data:   isAdvantageEditFlag / advantageForm / descLengthCount
方法:   handleEdit / handleSave / handleCancel / saveSelfInfo
```

读源码看清了链条：

```js
handleSave(refName) {                          // 只是校验包装
  this.$refs[refName].validate(ok => ok && this.saveSelfInfo())
}
saveSelfInfo() {                               // ← 真正调 API 的
  const p = { selfIntroduction: this.advantageForm.desc, isEnglish: false };
  this.$api.resumeApi.editSelfIntroduction(this.resumeId, p, { loading: false })
    .then(r => { if (r.status === '1') { this.$emit('submit'); this.reset(); } });
}
```

**正确顺序**（`handleSave` 直接调会报 `Cannot read properties of undefined (reading 'validate')`，因为编辑 UI 还没渲染）：

```js
// ① 先进编辑态，等 Vue 渲染出表单
v.isAdvantageEditFlag = true;
// 等 2-3 秒，确认 $refs.advantageRefForm 出现、textarea（.el-textarea__inner）出现

// ② 再设值 + 直接调业务方法
v.advantageForm.desc = '新的个人优势……';
v.saveSelfInfo();                              // 绕过校验，直达 API
```

### 4.3 工作经历

```
组件方法 setWorkExperienceAddOrEdit(mode)
  mode='add'  → resumeApi.addWorkExpList(resumeId, payload)
  mode='edit' → resumeApi.editWorkExp(resumeId, getItemId, payload)
前置: 先调 handleEdit(条目) 载入表单，再改描述
```

### 4.4 项目经历

见 [`ADD-PROJECTS.md`](ADD-PROJECTS.md) 第一节。**实测 8/8 一次成功**。

---

## 5. 猎聘

### 5.1 入口

```
简历编辑   https://c.liepin.com/resume/edit
简历预览   https://c.liepin.com/resume/preview?resId=xxx
附件简历   简历编辑页内「附件简历」
消息       首页右下角浮标「我的沟通」（#im-c-entry）
```

### 5.2 框架是 React，不是 Vue ⚠️

```js
// 探测结果
{ vue2: false, vue3: false, react: true }
// 带 __vue__ 的元素: 0 个
```

所以智联/前程无忧那套 Vue 方法在这里**完全无效**，要走 **fiber 树**（见第 1 节第 4 级）。

### 5.3 删除工作经历里的重复项

**结构**（`action-delete` / `action-edit` 都是悬停才显示的 `display:none` 元素）：

```html
<div class="work-exp-view-item-inner">
  <div class="item-title">某某公司</div>
  <div class="item-title-time">2024/02 - 2026/02</div>
  <div class="item-action">                <!-- vis=N -->
    <span class="action-delete">删除</span>
    <span class="action-edit">编辑</span>
  </div>
</div>
```

**⚠️ `.action-delete` 全页有 17 个**（各区块都有），索引会错位 —— **必须限定作用域**：

```js
'.work-exp-view-item-inner .action-delete'
```

流程：

```
① 找 fiber 上的 onClick → 调用 → 弹出 AntD 确认框
② 点 .ant-modal-confirm-btns .ant-btn-primary
③ 刷新核对条目数（读数据，不数 DOM）
```

### 5.4 「同步向导」按钮点不动

猎聘检测到新附件后会提示「可同步」，向导分步走：

| 步骤 | 按钮文字 | 注意 |
|---|---|---|
| 1/2 | 更新并继续 | 外层 `<div class="btn-box">`，**要点内层 `<button class="ant-btn ant-btn-primary">`** |
| 2/2 | **完成更新** | **文案变了**，用文案找会漏 |

### 5.5 消息页：目前无解

首页右下角浮标 `#im-c-entry`，点击后 `.im-ui-chat-modal-container` 会变成 `display:block`，
但**内部始终挂载为空**（轮询 25 秒、派发完整真实鼠标事件序列、试 React props，全部无效）。

**结论：猎聘网页版消息读不到，建议在 APP 看。**

---

## 6. 附件简历

### 6.1 文件上传无法自动化 ⚠️

浏览器出于安全**禁止脚本设置 `<input type="file">` 的值**。合成点击能点按钮、能打字，但**点不开系统文件对话框**，也无法伪造文件内容。

**所以：上传新附件必须人工拖一次文件。** 这是这套方案唯一的硬边界。

### 6.2 检查各平台附件版本

| 平台 | 读法 |
|---|---|
| BOSS直聘 | 简历页侧栏 `.resume-attachment` → 文本形如「附件管理 文件（1/3）某某-高级Java.pdf 408.2KB 更新于 2026.10.01 22:06」 |
| 智联 | `i.zhaopin.com/resume` → 「附件简历」区块，含文件名 + 「2026.10.01 22:08 上传」 |
| 前程无忧 | 简历页 `.upload_Item` → 「附件简历 / 文件名 / 2026-10-01 22:10 更新」 |
| 猎聘 | 简历编辑页「附件简历」区块 → 文件名 + `0.4MB 2026.10.01 22:07上传` |

**核对技巧**：把平台显示的文件大小（KB）和本地文件字节数对比，能确认传的是不是同一份。

### 6.3 发送附件简历的正确姿势

**投递之前**就把附件传好 —— 一旦开始批量投递，HR 点开的都是当前版本，传错了要一家家补发。

---

## 7. 期望城市 / 求职意向

各平台对「期望城市」的支持差别很大，**直接决定你能不能投全省**。

| 平台 | 字段 | 支持几个城市 | 能否表达「广东全省」 |
|---|---|---|---|
| BOSS直聘 | 工作城市 + 其他感兴趣的城市 | 1 主 + **最多 9 个** | ✅ 主城市 + 其余 9 个广东省内城市 |
| 智联招聘 | 求职意向 · 期望城市 | 多选 | ⚠️ 级联选择器不响应合成事件 |
| 前程无忧 | 求职意向 · `expectArea` | **只有 1 个** | ❌ 单城市字段，放不下 |
| 猎聘 | 求职期望 · 期望地点 | 多选（实见「广州、深圳」） | 需走 React 路线 |

### 7.1 BOSS直聘：工作城市 + 「其他感兴趣的城市」

**组件与数据模型**（实测）：

```js
// 期望职位表单组件
const v = document.querySelector('.expectation-form').__vue__;

v.$data.cityOptions            // 城市全量树 [{code, name, subLevelModelList:[...]}]
v.$data.formData.cityValue     // [101280000, 101280100, 0]  ← 省 / 市 / 区
v.$data.formData.locationName  // '广州'
v.$data.interestLocationList   // []  ← 「其他感兴趣的城市」的城市对象数组
v.$data.interestLocationCode   // []  ← 对应的 code 数组

// 组件内部改值的入口
v.selectCityChange(list)       // 把 list 赋给 interestLocationList
```

**⚠️ 城市多选面板的合成点击无效**：`el.click()` 和完整鼠标事件序列都点不动，
`.select-section` 里的计数一直停在 `0/9`。**必须直接写组件数据**：

```js
const v = document.querySelector('.expectation-form').__vue__;
const names = ['深圳','东莞','佛山','中山','珠海','惠州','江门','汕头','肇庆'];
const picked = [];
(function walk(nodes){
  (nodes || []).forEach(n => {
    if (names.includes(n.name) && !picked.some(p => p.name === n.name)) picked.push(n);
    if (n.subLevelModelList && n.subLevelModelList.length) walk(n.subLevelModelList);
  });
})(v.$data.cityOptions);

v.interestLocationList = picked;
v.interestLocationCode = picked.map(x => x.code);
if (v.formData) v.formData.interestLocationList = picked;

// 然后点表单里的「完成」按钮 —— 这个按钮的合成点击是有效的
```

> **上限 9 个**。面板里广东省内能选的就是广州、深圳、东莞、佛山、中山、珠海、惠州、江门、汕头、肇庆
> —— 除广州作主城市外全选，即覆盖全省。
>
> **刷新后核对**，期望职位区块应显示为：
> `期望职位 全职职位 Java面议广州，深圳，惠州，汕头，珠海，佛山，肇庆，江门，东莞，中山`

> 💡 `cityOptions` 里同一个城市会出现多次（热门城市区 + 按字母列表区），
> 去重按键名判断即可，服务端自己会去重。

### 7.2 前程无忧：单城市，改不了全省

保存时用的是**单值**：

```js
// hanlendOnEditOnClick 的 payload
{ salaryType: 1,
  expectArea: this.careerObjectiveRuleForm.cityInfo.code,   // ← 只有一个城市 code
  expectIndustry, expectFunction, seekType, maxSalary, minSalary, salaryMonth }
```

字段在 `.careerObjective` 组件的 `careerObjectiveRuleForm.cityInfo.code`；
`onChange(e)` 的实现就是 `this.careerObjectiveRuleForm.cityInfo.code = e.code`。

**结论：前程无忧只能填一个城市，「广东全省」表达不了** —— 保留广州即可。

### 7.3 简历本体的期望城市

本地简历在 `resume/profile.json` 的 `headline`：

```json
"headline": "高级 Java 开发工程师　·　7 年工作经验　·　期望城市：广东全省　·　一周内到岗"
```

改完重新生成（`build_resume.py` → LibreOffice 转 PDF），再**手动**上传到四个平台的附件
（上传不能自动化，见第 6 节）。

---

## 8. 反爬与风控

| 机制 | 表现 | 应对 |
|---|---|---|
| **字体混淆** | 列表页薪资是 `U+E0xx` 假字符 | 薪资在详情页读 `.salary` |
| **列表上限** | 会话列表只留最近 40 条 | 用详情页按钮判重 |
| **虚拟滚动** | 未读会话可能没渲染 | 用「未读」标签，别只看「全部」 |
| **默认招呼语** | 点「立即沟通」自动发一条 | 知道就好，别重复发 |
| **频率限制** | 连续高频后命令超时/失败 | 保持 12-27 秒随机延时，单日留余量 |

**风控红线**：

- BOSS直聘 是四家里**唯一有主动反自动化机制**的。有开源作者明确警告：不要依赖程序批量投递 BOSS，触发风控当天停止、第二天再投，否则可能封号。
- 遇到验证码**立刻停手**，人工处理。
- 操作开始失败/要求重新登录/消息发不出去 → **当天停止所有自动化**。
- 智联 / 前程无忧 / 猎聘的风控远松于 BOSS直聘，适合走量。

---

## 9. 踩坑速查表（汇总）

| 症状 | 原因 | 解法 |
|---|---|---|
| 隐藏按钮点不动，坐标 (0,0) | `display:none` 没有布局盒子 | `setProperty('display','block','important')` |
| 强制显示后仍无效 | 用了 `node.style.display = ''` | 必须 `setProperty(...,'important')` |
| 按钮点了没反应 | 点到外层包装 `<div>` | 点内层 `<button>` / `<a>` |
| AntD 确定按钮匹配不到 | 文字是「确 定」带空格 | 用 `.ant-btn-primary` 类名 |
| `pageEval` 报 `Unexpected token ';'` | 只接受单个表达式 | 包成 `(function(){ … })()` |
| `pageEval` 拿到 `[object Object]` | 返回了对象 | 页面内先 `JSON.stringify` |
| **写入前没核对导致覆盖数据** | 拿对象当字符串写回 | **写之前先打印内容核对** |
| 写入成功但保存无效 | 字段字数超限 | 先读「还可输入 N 个字」 |
| 日期填了但校验不通过 | 日期控件要回车才提交 | `typeSel` 加 `submit: true` |
| 数 DOM 判断成败误判 | 列表折叠 / 虚拟滚动 | **读组件 `$data`/`$props`** |
| 序号错位点错元素 | 选择器全局匹配了多个区块 | 限定作用域（如 `.work-exp-view-item-inner .action-delete`） |
| 循环点击重复发送 | 卡片点了不消失，只变 disabled | **点一次 → 读状态 → 再继续** |
| 改了扩展不生效 | Chrome 不热重载扩展 | `chrome://extensions` 手动点 ⟳ |
| 点击导致跳转后 `pageEval` 超时 | 内容脚本还没注入 | 等 5-7 秒再执行 |
| 会话列表序号对不上 | `[class*="friend-content"]` 命中了 warp | 用精确的 `.friend-content` |
| **看不到 HR 的回复** | 只看了「全部」标签（只留最近 40 条） | **先点「未读」**，抓到就立刻落盘（点一次就变已读） |
| **找不到几天前的会话** | 会话列表最多 100 条，更早的被挤出去了 | 用 `.boss-search-input` 搜索；**结果在 `.search-list` 里，不是 `.friend-content`** |
| 滚不动会话列表 | 虚拟列表，直接改 `scrollTop` 不触发重渲染 | 改完 `scrollTop` 再 `dispatchEvent(new Event('scroll'))` |
| **误判「会话没打开」** | 用 `read` 命令的文本判断 | 直接读 `.chat-conversation` 的 DOM（`head.length > 30 && hasInput`） |
| 发了空消息 | 没确认输入框内容就点发送 | 发送前先读 `.chat-input` 回显，< 10 字就别发 |
| 城市多选面板点不动 | `.select-section` 计数停在 `0/9` | 直接写组件的 `interestLocationList` / `interestLocationCode` |
| 工具栏「换电话/换微信」点不开 | 是悬停弹层 `.sentence-popover` | 弹层在 DOM 里但 `display:none`；微信那条**没有**对应弹层，只能人工 |
| 求职意向保存报"请选择…" | 校验没通过 | 点「完成」= `submitSave()` → 走 `validate()`，字段必须真的写进组件数据 |

---

## 10. 三条最贵的教训

1. **验证写操作，读数据源（组件 `$data`/`$props`），不读 DOM。**
   DOM 会被折叠、虚拟滚动、懒加载影响。曾经因为数 DOM 误判失败而反复重试，往简历里塞了 9 条测试垃圾数据。

2. **任何「点击后要产生副作用」的动作，点一次就必须读状态确认，再决定下一步。**
   曾经在循环里连点，给同一位猎头重复发了 **7 次**附件简历。

3. **往页面写数据之前，先把要写的内容打印出来核对。**
   曾经把 `[object Object]` 当成原文写回，覆盖了简历里一整段职责业绩（后已恢复）。
