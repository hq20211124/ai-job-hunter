# 批量添加/删除「项目经历」—— 智联招聘 & 前程无忧

> 这份文档记录的是**踩完坑之后的结论**，照着做不用重复探索。
> 配套脚本：`agent/examples/add-project-51job.js`、`agent/examples/add-project-zhaopin.js`

---

## 一句话对比

| | 智联招聘 | 前程无忧 |
|---|---|---|
| **页面框架** | Vue 2 | Vue 2 |
| **可靠做法** | 操作表单 + 用组件方法删除 | **直接调组件 API 方法** |
| **时间字段格式** | **Date 对象** ← 坑 | `'YYYY-MM'` 字符串 |
| **验证成功的正确姿势** | **读组件数据** ← 坑 | 读组件数据 |

**核心教训：两家的简历页都会把项目列表"折叠"，只渲染前 2 条。用页面元素数量判断成败一定会误判。**

---

## 一、前程无忧（简单，5 分钟搞定）

### 原理

页面上的 `ProjectExperience` 组件把业务方法暴露出来了，**直接调它就能新增，完全不用碰 UI**。

```js
// 找到组件
const el = Array.from(document.querySelectorAll('*'))
  .find(e => e.__vue__ && e.__vue__.$options.name === 'ProjectExperience');
const v = el.__vue__;
```

### 组件接口

```js
// 表单数据模型
v.projectContinerForm = {
  startTime:   '2024-02',   // 'YYYY-MM' 字符串
  endTime:     '2026-09',   // 空字符串 = 至今
  projectName: '项目名称',
  describe:    '项目描述',
  companyName: '无'          // 或具体公司名，null 也可
};

// 业务方法（就是这三个）
v.getProjectExperienceAdd()                 // 新增
v.getProjectExperienceEdit()                // 编辑（需先设 v.getProjectExperienceEditId）
v.projectDel(item)                          // 删除，item 是 projectdata.projects 里的元素
```

### 完整代码

```js
async function addProject51job(p) {
  const desc = `技术方案：${p.tech}\n\n${p.describe}`;
  const r = await pe(`JSON.stringify((function(){
    const el = Array.from(document.querySelectorAll('*'))
      .find(e => e.__vue__ && e.__vue__.$options.name === 'ProjectExperience');
    if (!el) return { error: 'component not found' };
    const v = el.__vue__;
    v.projectContinerForm.startTime   = ${JSON.stringify(p.start)};
    v.projectContinerForm.endTime     = ${JSON.stringify(p.end)};
    v.projectContinerForm.projectName = ${JSON.stringify(p.name)};
    v.projectContinerForm.describe    = ${JSON.stringify(desc)};
    v.projectContinerForm.companyName = '无';
    v.submiting = false;
    try { v.getProjectExperienceAdd(); return { ok: true }; }
    catch (e) { return { error: String(e && e.message || e) }; }
  })())`, 25000);
  return r;
}
```

### 验证是否成功（重要）

**不要数页面元素**，读 `PCResume` 组件的 `projects` 数组：

```js
const r = await pe(`JSON.stringify((function(){
  const el = Array.from(document.querySelectorAll('*'))
    .find(e => e.__vue__ && e.__vue__.$options.name === 'PCResume');
  return el ? (el.__vue__.projects || []).map(p => p.projectName) : [];
})())`);
```

实测：**8 个项目连续添加，8/8 成功，零失败。**

---

## 二、智联招聘（坑多，但已全部摸清）

### 坑 1：选择器必须限定作用域

智联的简历页是**一个大表单**，个人信息、求职意向、项目经历全在一个页面里。
如果你用全局选择器：

```js
document.querySelectorAll('input.ivu-input')   // ❌ 会命中「个人信息」的姓名字段
```

**因为滚出视口但仍在 DOM 里的元素，在你的 `query` 里依然算"可见"。**

正确做法 —— 限定在项目表单容器内：

```js
const SCOPE = '.project-exp-edit-wrapper';
`${SCOPE} input.ivu-input`   // nth 1 = 项目名称, nth 2 = 开始时间, nth 3 = 结束时间
`${SCOPE} textarea`          // nth 1 = 项目描述
```

### 坑 2：日期必须按回车提交

日期框填完值后，**必须发一次回车**组件才认账。否则点保存会提示"请选择开始时间"。

在本项目的 `typeSel` 里就是 `submit: true`：

```js
await typeSel(`${SCOPE} input.ivu-input`, p.start, { nth: 2, submit: true });
await typeSel(`${SCOPE} input.ivu-input`, p.end,   { nth: 3, submit: true });
```

### 坑 3：组件里 `startDate` 是 Date 对象，不是字符串

如果你走「直接改组件数据」的路子，必须传 Date：

```js
// ❌ 无效
v.startDate = '2024-02';
// ✅ 有效
v.startDate = new Date(2024, 1, 1);   // 月份从 0 开始
```

（走 UI 填表则不用管这个，组件自己会转。）

### 坑 4：页面把项目折叠了 ⚠️ 最容易踩

**智联的在线简历只渲染前 2 条项目，其余收在「查看全部」后面。**

```js
document.querySelectorAll('.project-exp-pre-item').length   // 永远是 2！
```

**后果**：你写完发现"条数没变"，以为失败，反复重试 —— 实际上每次都成功了，最后简历里堆了一堆重复项。

**正确做法：判断成败一律读组件数据**

```js
const P = '.resume-project-exp-wrapper';
const GV = `(function(){ const el=document.querySelector('${P}'); return el && el.__vue__ ? el.__vue__ : null; })()`;

// 项目数据挂在父组件的 props.ProjectExperience 上
const list = JSON.parse(await pe(`JSON.stringify((${GV}).ProjectExperience.map((p,i)=>({
  i, name: p.proExpProjectName, path: p.path
})))`));
```

### 完整流程（新增）

```js
// 1. 进编辑态
await clickSel('.profile-pre-edit', 1);

// 2. 点「添加项目经历」
await clickSel('.project-exp-add', 1);

// 3. 填四个字段
await typeSel(`${SCOPE} input.ivu-input`, name,  { nth: 1 });
await typeSel(`${SCOPE} input.ivu-input`, start, { nth: 2, submit: true });  // 回车！
await typeSel(`${SCOPE} input.ivu-input`, end,   { nth: 3, submit: true });  // 回车！
await typeSel(`${SCOPE} textarea`,        desc,  { nth: 1 });

// 4. 保存（精确类名）
await clickSel('button.project-exp-edit-btns-sure', 1);

// 5. 验证 —— 读组件数据，不看 DOM！
```

### 删除：`deleteHandle(item)` —— 传**对象**不是索引

父组件有两个方法：

```js
// .resume-project-exp-wrapper 的方法
deleteHandle(item)     // ← 传「项目对象」才有效
updateHandle(item)
```

**实测对比：**

```js
// ❌ 传索引：返回成功，但没有删除
v.deleteHandle(16);

// ✅ 传对象：真正删除
const item = v.ProjectExperience[16];
v.deleteHandle(item);
```

完整删除代码：

```js
const r = await pe(`JSON.stringify((function(){
  const v = ${GV};
  const item = v.ProjectExperience[${idx}];
  if (!item) return { error: 'item not found' };
  try { v.deleteHandle(item); return { ok: true, name: item.proExpProjectName }; }
  catch (e) { return { error: String(e && e.message || e) }; }
})())`);
```

**删除注意事项：**
- 一次删一条，删完**重新加载页面**再读列表确认（不要连删，容易乱）
- 从**列表末尾往前删**，避免索引错位
- 页面里有个 **「删除简历」** 的弹窗（`zp-modal`）—— 那是删**整个简历**，脚本里务必排除，别手滑点了

---

## 三、通用原则（两家都适用）

### 1. 优先找 Vue 组件的 API 方法，而不是点 UI

定位方法：

```js
// 找元素上挂的 Vue 实例
let n = el, d = 0, vue = null;
while (n && d < 20) {
  if (n.__vue__) { vue = n.__vue__; break; }
  n = n.parentElement; d++;
}

// 列出它有什么
vue.$options.methods          // 方法名
vue.$data                     // 数据模型

// 读源码找出真正调 API 的那个
vue.$options.methods.handleSave.toString()
```

**典型案例**：某平台的 `handleSave(refName)` 只是 `this.$refs[refName].validate(ok => ok && this.saveSelfInfo())` 的包装 —— 直接调 `saveSelfInfo()` 就绕过了表单校验。

> 有些打包后的方法会显示 `function () { [native code] }`，这时改用「设置 `$data` + 调用业务方法」的方式。

### 2. 验证成功与否，读数据源，不读 DOM

DOM 会被折叠、虚拟滚动、懒加载影响。**Vue 组件的 `$data` / `$props` 才是服务端真实状态的镜像。**

### 3. 每步之间要有等待

三个平台的操作后等待建议：
- 进编辑态：4–6 秒
- 打开表单：4–6 秒
- 保存提交：5–8 秒
- 删除后核对：6–8 秒

### 4. 写操作要幂等

脚本开头先读一次现有数据，**已存在同名项目就跳过**。否则重跑一次就多一堆重复项。

---

## 四、踩坑速查表

| 症状 | 原因 | 解法 |
|---|---|---|
| 填了时间，保存报"请选择开始时间" | 日期没按回车 | `typeSel` 加 `submit: true` |
| 明明填对了，保存没反应 | 选择器命中了别的区块的字段 | 用 `.project-exp-edit-wrapper` 限定作用域 |
| 写 Date 字符串进组件无效 | 组件要 Date 对象 | `new Date(y, m-1, 1)` |
| "条数没变"但实际已保存 | 页面折叠只渲染 2 条 | 读 `props.ProjectExperience` |
| 反复重试导致一堆重复项 | 误判为失败 | 用数据源验证 + 幂等检查 |
| `deleteHandle(index)` 返回成功但没删 | 签名是传对象 | `deleteHandle(item)` |
| 连删多条只生效一条 | 服务端异步/限流 | 一条一条删，每条后重新加载核对 |
