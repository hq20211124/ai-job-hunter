# 保姆级教程：从零开始用 AI 自动找工作

> 这份教程假设你**从没用过命令行、没写过代码**。每一步都写清楚了「敲什么命令」「看到什么算成功」「出错了怎么办」。
>
> 读完并跟着做完，你会拥有一套跑在**你自己 Chrome** 里的求职助手：自动抓岗位、按你的条件筛掉不合适的、批量投递并发送针对每个岗位定制的打招呼消息。

**读完这份教程大约需要 40 分钟。** 其中真正动手的部分只有 15 分钟左右，剩下的时间在等抓取和投递跑完。

---

## 目录

- [这份工具能做什么、不能做什么](#这份工具能做什么不能做什么)
- [前置条件](#前置条件)
- [第 0 步：把项目下载到本地](#第-0-步把项目下载到本地)
- [第 1 步：安装浏览器扩展](#第-1-步安装浏览器扩展)
- [第 2 步：启动本地代理](#第-2-步启动本地代理)
- [第 3 步：验证扩展和代理连上了](#第-3-步验证扩展和代理连上了)
- [第 4 步：下第一条命令](#第-4-步下第一条命令)
- [第 5 步：在你自己的 Chrome 里登录招聘网站](#第-5-步在你自己的-chrome-里登录招聘网站)
- [第 6 步：抓取岗位](#第-6-步抓取岗位)
- [第 7 步：筛选与打分](#第-7-步筛选与打分)
- [第 8 步：批量投递](#第-8-步批量投递)
- [第 9 步：写自己的脚本](#第-9-步写自己的脚本)
- [进阶：配合 AI 助手一起用](#进阶配合-ai-助手一起用)
- [遇到问题怎么办](#遇到问题怎么办)
- [附录](#附录)

---

## 这份工具能做什么、不能做什么

**能做：**

| 能力 | 说明 |
|---|---|
| 打开网页 | 在**你自己登录状态的 Chrome** 里打开任意网址 |
| 读页面 | 把页面变成纯文本或带链接的 Markdown，方便 AI 阅读 |
| 点按钮、填表单 | 模拟真实鼠标点击和键盘输入 |
| 截图 | 把当前页面存成图片 |
| 执行页面脚本 | 深入页面内部，操作那些"点了没反应"的顽固控件 |

**不能做：**

| 做不到 | 原因 |
|---|---|
| 绕过验证码 | 这是刻意保留的边界。**遇到验证码请停下来自己处理** |
| 上传文件 | 浏览器出于安全禁止脚本设置文件选择框。附件简历要你自己传一次 |
| 保证不被风控 | 任何自动化都有风险，请严格按[第 8 步](#第-8-步批量投递)的节奏来 |

> ⚠️ **重要提醒**：本工具只是「手和眼睛」。真正让它聪明的是你配合使用的 AI 助手（见[进阶章节](#进阶配合-ai-助手一起用)）。请勿用它骚扰 HR 或虚假投递。

---

## 前置条件

### 1. Node.js（必需）

这是运行代理程序的引擎。

- **版本要求**：Node.js **18 或更新**（推荐直接用最新的 LTS 版）
- **检查是否已装**：打开命令行，输入：

  ```bash
  node --version
  ```

  如果显示 `v18.x.x` 或更高（例如 `v20.11.0`、`v22.5.0`），就说明装好了。
- **没装的话**：去 <https://nodejs.org/> 下载 LTS 版本，一路点「下一步」安装。装完**关掉命令行重新打开**，再执行上面的检查命令。

### 2. Google Chrome（必需）

- **版本要求**：Chrome **111 或更新**（因为用到了 Manifest V3 的 `world: "MAIN"` 特性）
- **检查**：Chrome 右上角 `⋮` → 帮助 → 关于 Google Chrome

> 用 Edge、Brave 等 Chromium 内核浏览器也行，但本教程以 Chrome 为准。

### 3. Python（可选）

只有[第 7 步](#第-7-步筛选与打分)的岗位筛选脚本需要它。

- **版本要求**：Python **3.8 或更新**
- **检查**：`python --version`
- 不装也行，你可以跳过第 7 步，直接用抓到的原始数据。

### 4. 怎么打开命令行

- **Windows**：按 `Win + R`，输入 `cmd` 或 `powershell`，回车
- **macOS**：`Command + 空格`，输入 `terminal`，回车

后面的命令都在这个窗口里输入。

---

## 第 0 步：把项目下载到本地

```bash
git clone <这个仓库的地址>
cd find-job
```

没装 git 的话，直接在 GitHub 页面上点绿色的 **Code → Download ZIP**，解压后用 `cd` 进入解压出来的目录。

**验证一下**，列出目录内容：

```bash
ls          # macOS / Linux
dir         # Windows
```

应该能看到 `README.md`、`extension`、`agent` 这几个名字。

---

## 第 1 步：安装浏览器扩展

扩展是这套方案的**眼睛和手**。它住在你的 Chrome 里，所以网站看到的是「你本人」。

### 1.1 打开扩展管理页面

在 Chrome 地址栏输入下面这行，回车：

```
chrome://extensions
```

> 💡 直接复制粘贴，不用手打。

### 1.2 打开「开发者模式」

看页面**右上角**，有一个 **「开发者模式」** 开关，**把它打开**。

打开后，左上角会多出三个按钮：「加载已解压的扩展程序」「打包扩展程序」「更新」。

### 1.3 加载扩展

1. 点左上角的 **「加载已解压的扩展程序」**
2. 在弹出的文件选择框里，**选中项目里的 `extension` 文件夹**（注意：是选中这个文件夹本身，不是进去选里面的文件）
3. 点「选择文件夹」

### 1.4 确认成功

页面上会出现一张卡片，写着：

```
NavAgent
0.1.0
```

**看到这张卡片就是成功了。**

> ⚠️ **如果浏览器提示「请先关闭开发者模式扩展」之类的警告**，忽略它。我们就是在用开发者模式。

### 1.5 常见失败

| 现象 | 原因 | 解决 |
|---|---|---|
| 提示「清单文件缺失或不可读」 | 选错目录了 | 重新点「加载已解压的扩展程序」，确保选的是 `extension` 文件夹，里面有 `manifest.json` |
| 卡片出现了但很快报错 | Chrome 版本太低 | 升级 Chrome 到 111+ |
| 找不到「开发者模式」开关 | 页面太窄被折叠了 | 把浏览器窗口拉宽，或点页面左上角的菜单图标 |

### 1.6 把扩展固定到工具栏（可选但推荐）

点 Chrome 工具栏的拼图图标 🧩，找到 NavAgent，点旁边的图钉 📌。这样你能随时看到它。

---

## 第 2 步：启动本地代理

代理是**中间人**：你的脚本把命令发给它，它转发给扩展。

### 2.1 安装依赖

```bash
cd agent
npm install
```

> 没装 npm？装 Node.js 时会自动带上。

**预期输出**：一串 `added 1 package` 之类的话，最后没有红色的 `ERR!`。

### 2.2 启动代理

```bash
node agent.js
```

### 2.3 确认成功

**预期输出**（大概长这样）：

```
[bridge] 监听 ws://127.0.0.1:61822
[agent] 扩展端口  ws://127.0.0.1:61822
[agent] 命令端口  http://127.0.0.1:61823
[agent] 等待扩展连接……（请在 Chrome 中启用 NavAgent 扩展）
[agent] HTTP 命令接口已监听 61823
[agent] ✅ 扩展已就绪，可以下命令了
```

**看到最后一行 `✅ 扩展已就绪` 就是成功了。**

> 📌 **这个窗口不要关！** 代理要一直跑着。后面的操作请**再开一个新的命令行窗口**来做。
>
> 关掉代理 = 整套工具停止工作。

### 2.4 如果卡在「等待扩展连接」

说明 Chrome 里的扩展没连上。按顺序排查：

1. **Chrome 开着吗？** 扩展必须在 Chrome 运行时才能连接。
2. **扩展启用了吗？** 回到 `chrome://extensions`，确认 NavAgent 卡片右下角的开关是**蓝色**（开启状态）。
3. **等 30 秒。** 扩展是每 24 秒轮询一次重连的，刚启动代理时不会立刻连上。
4. **刷新一下任意网页。** 扩展会在页面加载时尝试连接。
5. **点一下扩展图标。** 手动触发一次重连。

### 2.5 端口被占用怎么办

如果报错 `EADDRINUSE`，说明 61822 或 61823 端口被别的程序占了。

**改 WebSocket 端口**（扩展连接用的那个）：

```bash
# macOS / Linux
NAVAGENT_PORT=62822 node agent.js

# Windows PowerShell
$env:NAVAGENT_PORT=62822; node agent.js
```

改完还要告诉扩展：点 Chrome 工具栏的 NavAgent 图标 → 打开选项页 → 把端口改成 `62822` → 保存。

**改 HTTP 端口**（你的脚本下命令用的那个）：

```bash
# macOS / Linux
NAVAGENT_HTTP_PORT=62823 node agent.js

# Windows PowerShell
$env:NAVAGENT_HTTP_PORT=62823; node agent.js
```

对应的，你的脚本也要设同一个环境变量 `NAVAGENT_HTTP_PORT=62823`。

> 💡 两个端口是独立的：**61822 是扩展连代理**，**61823 是你连代理**。别搞混。

---

## 第 3 步：验证扩展和代理连上了

**新开一个命令行窗口**（第 2 步那个留着别动），执行：

```bash
curl http://127.0.0.1:61823/status
```

**预期输出：**

```json
{"extensionConnected":true,"wsPort":61822}
```

**关键看 `extensionConnected` 是不是 `true`。**

| 结果 | 含义 | 怎么办 |
|---|---|---|
| `{"extensionConnected":true,...}` | ✅ 一切正常 | 继续下一步 |
| `{"extensionConnected":false,...}` | 代理在跑，但扩展没连上 | 回[第 2.4 节](#24-如果卡在等待扩展连接)排查 |
| `curl: (7) Failed to connect` | 代理没在跑 | 回[第 2 步](#第-2-步启动本地代理)启动它 |
| `'curl' 不是内部或外部命令` | Windows 没装 curl | 用 PowerShell 的 `Invoke-RestMethod http://127.0.0.1:61823/status`，或直接跳到第 4 步用 `cmd.js` 测 |

> 💡 Windows PowerShell 里 `curl` 是 `Invoke-WebRequest` 的别名，行为不一样。用 `curl.exe`（带 .exe）可以强制调用真正的 curl。

---

## 第 4 步：下第一条命令

现在让你的浏览器干活。

### 4.1 打开一个网页

在**新的**命令行窗口里（不是跑代理的那个）：

```bash
cd agent
node cmd.js goto "https://example.com"
```

**预期输出：**

```
✅ goto  (940ms)
📍 https://example.com/
📄 Example Domain
```

**同时你的 Chrome 里应该自动打开了一个新标签页，显示 "Example Domain"。**

🎉 恭喜，扩展、代理、脚本三方已经打通了。

> 💡 这个标签页是工具的「工作台」。**你可以把它拖到另一个窗口或最小化，但不要关掉它**——关了工具就得重新开。

### 4.2 读页面内容

```bash
node cmd.js read
```

输出页面的纯文本。你会看到 `Example Domain`、`Learn more` 这些字。

### 4.3 读结构化内容（给 AI 用）

```bash
node cmd.js extract
```

输出带链接的 Markdown，长这样：

```markdown
# Example Domain

This domain is for use in illustrative examples in documents...

[More information...](https://www.iana.org/domains/example)
```

**这个 `extract` 是最常用的命令** —— 它保留了链接地址，AI 读了才能知道每个按钮指向哪里。

### 4.4 截图

```bash
node cmd.js screenshot
```

**预期输出：**

```
✅ screenshot 已保存: C:\...\find-job\shots\shot-1735689600000.png  (245 KB)
```

去 `shots` 目录就能看到图片。

> ⚠️ 如果报错 `Either the '<all_urls>' or 'activeTab' permission is required`，说明你在用旧版扩展。回到 `chrome://extensions`，点 NavAgent 卡片上的 **⟳ 重新加载** 按钮刷新一次。

### 4.5 试试更多命令

```bash
node cmd.js query "a"              # 列出页面上的链接
node cmd.js pageEval "document.title"   # 在页面里执行 JS
```

### 4.6 命令速查表

| 命令 | 作用 | 例子 |
|---|---|---|
| `goto <网址>` | 打开网页 | `node cmd.js goto "https://www.baidu.com"` |
| `read` | 读纯文本 | `node cmd.js read` |
| `extract` | 读带链接的 Markdown ⭐ | `node cmd.js extract` |
| `scan` | 列出可点击元素及编号 | `node cmd.js scan` |
| `query <选择器>` | 按 CSS 选择器查元素 | `node cmd.js query "button"` |
| `clickSel <选择器>` | 点元素 | `node cmd.js clickSel "button"` |
| `typeSel` | 输入文字 | 见下方 JSON 写法 |
| `scroll` | 向下滚动一屏 | `node cmd.js scroll` |
| `pageEval <代码>` | 在页面里执行 JS ⭐ | `node cmd.js pageEval "document.title"` |
| `screenshot` | 截图 | `node cmd.js screenshot` |
| `back` | 后退 | `node cmd.js back` |

**输入文字**要用 JSON 格式：

```bash
node cmd.js typeSel "{\"selector\":\"#kw\",\"text\":\"Java开发\",\"submit\":true}"
```

- `selector`：CSS 选择器
- `text`：要输入的内容
- `submit: true`：输入完按回车
- `fast: true`：长文本用（默认已开启），否则一个字一个字敲会很慢

---

## 第 5 步：在你自己的 Chrome 里登录招聘网站

**这一步是整套方案的核心优势，请务必理解。**

### 5.1 为什么必须用你自己的 Chrome

其他自动化方案（Playwright、Selenium）会**新开一个干净的浏览器**，结果是：

- 招聘网站不认识你 → 要求重新登录
- 扫码登录 → 手机上还要确认一次
- 新设备指纹 → 更容易被风控盯上
- 有些平台直接给你一个空白页

**本方案不新开浏览器**，而是在**你日常用的那个 Chrome** 里操作。所以：

- ✅ 你的登录状态直接可用
- ✅ Cookie、指纹、插件全是你自己的
- ✅ 网站看到的就是「你本人在用浏览器」

### 5.2 手动登录一次

现在**手动**在 Chrome 里登录你要用的招聘网站（就用你平时的方式，扫码或密码都行）：

| 平台 | 地址 |
|---|---|
| BOSS直聘 | <https://www.zhipin.com> |
| 智联招聘 | <https://www.zhaopin.com> |
| 前程无忧 | <https://www.51job.com> |
| 猎聘 | <https://www.liepin.com> |

**登录一次就够了，之后工具会一直复用这个登录状态。**

### 5.3 验证登录状态

拿 BOSS直聘举例：

```bash
node cmd.js goto "https://www.zhipin.com/web/geek/chat"
node cmd.js read
```

如果输出里能看到你的名字、聊天列表，说明登录状态被正确复用了。

**如果输出是空的、或者显示登录页** —— 回到 5.2 手动登录一次。

> ⚠️ **重要**：登录状态有有效期。工具用着用着突然操作失败，第一件事就是回来看这个页面是不是掉登录了。

### 5.4 关于简历附件（必读）

**浏览器出于安全禁止脚本上传文件。** 所以你必须在**开始投递之前**，手动把简历附件传好：

1. 打开平台的「简历」页面
2. 找到「附件简历」或「简历附件」
3. 上传你的最新版 PDF

**为什么强调「投递之前」**：一旦开始批量投递，HR 点开你的附件看到的就都是这个版本了。传错了要一家家补发，很麻烦。

---

## 第 6 步：抓取岗位

现在开始自动化。打开 `agent/scrape-jobs.js`，按你的情况改两个地方。

### 6.1 改城市

找到这段：

```js
const CITIES = [
  { name: '广州', code: '101280100' },
  { name: '深圳', code: '101280600' },
  { name: '东莞', code: '101281600' },
  { name: '佛山', code: '101280800' },
  { name: '中山', code: '101281700' },
  { name: '惠州', code: '101280300' },
  { name: '珠海', code: '101280700' },
];
```

**删掉你不想要的城市，只留你要的。** 城市代码见[附录 A](#附录-aboss直聘城市代码)。

比如只想要广州和深圳：

```js
const CITIES = [
  { name: '广州', code: '101280100' },
  { name: '深圳', code: '101280600' },
];
```

### 6.2 改搜索关键词

找到：

```js
const KEYWORDS = ['Java', '高级Java', '后端开发'];
```

改成你想要的岗位名称。比如做前端的：

```js
const KEYWORDS = ['前端', '前端开发', 'React'];
```

### 6.3 改输出路径（可选）

找到：

```js
const OUT = 'C:\\D\\agent\\find-job';
```

改成你自己的路径。注意 Windows 里反斜杠要写两个 `\\`。

> 💡 不改也行，但要在 `agent` 目录下运行脚本，否则找不到输出目录。

### 6.4 运行

```bash
node scrape-jobs.js
```

**预期输出：**

```
============================================================
  广州  (city=101280100)
============================================================
  Java     → 📄 「广州招聘」-2026年广州人才招聘信息 - BOSS直聘
         解析 15 条，新增 15 条（累计 15）
  高级Java  → 📄 「广州招聘」-2026年广州人才招聘信息 - BOSS直聘
         解析 12 条，新增 11 条（累计 26）
```

**跑完会生成 `gd-jobs.json`。**

> ⏱️ **时间**：每个「城市 × 关键词」组合大约 20 秒。7 个城市 × 3 个关键词 ≈ 7 分钟。这是刻意放慢的（模拟人类浏览节奏），**不要为了快而改小延时**。

### 6.5 关于抓取节奏

脚本里的 `nap()` 是「人类节奏延时」：

```js
const nap = (a = 1500, b = 3000) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));
```

它在 1.5～3 秒之间随机等待。**随机的**，不是固定的——固定间隔反而是机器特征。

**请保持这个设计，不要改成 `setTimeout(r, 0)`。**

---

## 第 7 步：筛选与打分

抓回来的岗位良莠不齐（有外包、有兼职、有根本不对口的）。这一步把垃圾滤掉，把最匹配的排到前面。

### 7.1 运行

```bash
python rank-jobs.py ../data/gd-jobs.json
```

> 路径按你实际的 JSON 位置填。不填第二个参数的话，会在同目录生成 `gd-jobs-ranked.json`。

**预期输出：**

```
原始 250 条 → 排除 33 条 → 保留 217 条

=== 排除原因分布 ===
  实习: 7
  兼职: 4
  外包: 2

==========================================================================================
=== 按匹配度排序 TOP 30 ===
==========================================================================================
  1. [ 9分] [广州] 资深后端开发工程师（AI工具辅助开发）
       某某数字科技 | 广州·黄埔区 | AI/大模型/智能体 / 中高级/资深
  2. [ 8分] [广州] 高级java开发工程师（架构/低代码方向）
       某某软件 | 广州·黄埔区 | 架构/技术负责人/组长 / 中高级/资深
```

### 7.2 改排除规则

打开 `rank-jobs.py`，找到：

```python
EXCLUDE_TITLE = [
    r'外包', r'驻场', r'派遣', r'人力', r'兼职', r'实习',
    r'销售', r'产品经理', r'运营', r'测试', r'前端', r'UI', r'实施', r'运维',
]
```

这是**按职位名排除**。比如你是做后端的，就保留 `前端` 让它滤掉前端岗；你是做前端的，就把 `前端` 删掉。

```python
EXCLUDE_COMPANY = [
    r'人力资源', r'人才服务', r'劳务', r'外服',
]
```

这是**按公司名排除**。如果你知道某些公司是外包，加进来：

```python
EXCLUDE_COMPANY = [
    r'人力资源', r'人才服务', r'劳务', r'外服',
    r'某某软件', r'某某信息',   # ← 加上你不想投的公司
]
```

### 7.3 改加分规则（最重要）

找到：

```python
SCORE = {
    '金融/证券/期货/基金': (r'金融|证券|期货|基金|量化|投研|资管|理财|银行|保险|支付', 5),
    'AI/大模型/智能体':    (r'AI|人工智能|大模型|LLM|智能体|LangChain|Agent', 5),
    '架构/技术负责人':      (r'架构|技术负责人|组长|Leader|技术经理|Team', 4),
    '微服务/SpringCloud':  (r'微服务|Spring\s*Cloud|SpringCloud|Nacos|分布式', 3),
    ...
}
```

**格式是 `'标签': (正则表达式, 分值)`**：

- **左边**是标签，会显示在筛选结果里，方便你看为什么这条分高
- **中间**是正则表达式，匹配职位名 + 公司名 + 地点
- **右边**是分值，越匹配你的经历给越高

**怎么改成适合自己的**：想想你最想让 HR 看到的三件事，给它们高分。比如你是做测试开发的：

```python
SCORE = {
    '自动化测试':   (r'自动化测试|测试开发|UI自动化|接口自动化', 5),
    '性能测试':     (r'性能测试|压测|JMeter|LoadRunner', 4),
    '测试平台':     (r'测试平台|质量平台|效能平台', 5),
    '大厂经历':     (r'字节|腾讯|阿里|美团', 3),
    '中高级/资深':  (r'高级|资深|Senior|专家', 2),
}
```

> 💡 **正则表达式速查**：`|` 表示「或」，`\s*` 表示「任意个空格」，`.*` 表示「任意字符」。`r'高级|资深'` 就是「包含『高级』或『资深』」。

---

## 第 8 步：批量投递

⚠️ **这是风险最高的一步，请完整读完本节再动手。**

### 8.1 先改打招呼的话术

打开 `agent/apply-jobs.js`，找到 `buildGreeting` 函数。它的逻辑是：**读一遍 JD，看里面提到了什么，就挑对应的一段自我介绍发过去。**

```js
function buildGreeting(job, jd) {
  const all = job.title + ' ' + jd;
  const parts = [];

  if (/AI|人工智能|大模型|LLM|智能体|Agent|LangChain/i.test(all)) {
    parts.push('我现在做的正是 AI 落地：用 LangGraph + LangChain 构建生产级智能体……');
  }
  if (/金融|证券|期货|基金|量化/.test(all)) {
    parts.push('金融方向我做过券商统一大系统下的投资策略研究平台……');
  }
  if (/MES|WMS|制造|工业|仓储|生产|供应链|ERP/.test(all)) {
    parts.push('工业侧我独立开发过 WMS 仓储 / MES 制造系统……');
  }
  if (/架构|技术负责人|组长|Leader|技术经理/.test(all)) {
    parts.push('架构上我主导过老式多模块单体到微服务 + DDD 的改造……');
  }

  // 兜底：一个都没匹配上时用的通用版本
  if (!parts.length) {
    parts.push('我 7 年 Java 后端，做过微服务架构改造、金融投资策略平台、WMS/MES 制造系统。');
  }

  return [
    `您好，看到「${job.title}」这个岗位。`,
    parts.slice(0, 2).join('\n'),
    '方便的话想了解下团队规模和技术栈，聊聊看是否合适。',
  ].join('\n');
}
```

**你要改的是 `parts.push(...)` 里的内容** —— 换成你自己的真实经历。

**改的原则：**

1. **只写你真做过的。** 写了编造的细节，面试一问就穿帮，而且这是诚信问题。
2. **别写数字**，除非你能解释它怎么来的。
3. **每条控制在 2～3 句**，HR 没耐心读长文。
4. **结尾留个钩子**，比如「方便的话想了解下团队规模和技术栈」。

**给你一个改写的模板：**

```js
function buildGreeting(job, jd) {
  const all = job.title + ' ' + jd;
  const parts = [];

  // 按 JD 里出现的关键词，挑对应的经历
  if (/AI|大模型|智能体/.test(all)) {
    parts.push('我最近在做 AI 落地：用 LangChain 搭了一套问答系统，服务内部员工。');
  }
  if (/电商|订单|支付/.test(all)) {
    parts.push('电商方向我做过订单系统，包括状态流转、支付对接、库存扣减。');
  }
  if (/微服务|分布式|高并发/.test(all)) {
    parts.push('我主导过单体到微服务的拆分，做过 Nacos 注册中心和网关。');
  }

  // 兜底：都没匹配上时用的通用版本
  if (!parts.length) {
    parts.push('我做了 5 年后端，主要方向是 xxx。');
  }

  return [
    `您好，看到「${job.title}」这个岗位。`,
    parts.slice(0, 2).join('\n'),        // 最多发前两段，太长没人看
    '方便的话想了解下团队规模和技术栈，聊聊看是否合适。',
  ].join('\n');
}
```

### 8.2 改数据来源路径

找到这一行，把路径改成你自己的：

```js
// 抓取结果（rank-jobs.py 的输出）
const jobs = JSON.parse(fs.readFileSync('C:\\D\\agent\\find-job\\gd-jobs-ranked.json', 'utf8'));
```

还有这一行，把 JD 存档写到你想放的地方：

```js
// 每个岗位的 JD 存档
const outPath = `C:\\D\\agent\\find-job\\jd-apply-${idx}.txt`;
fs.writeFileSync(outPath, `职位: ${job.title}\n公司: ${job.company}\n\n${jd}`, 'utf8');
```

> 💡 Windows 路径里的反斜杠要写两个（`\\`），因为单个 `\` 在 JS 字符串里是转义符。

### 8.3 先小批量试跑

**不要一上来就投 50 个。** 先用 2 个试：

```bash
node apply-jobs.js 1 2
```

参数含义：`apply-jobs.js <从第几条开始> <投几条>`。上面这行的意思是「从第 1 条开始，投 2 条」。

**预期输出：**

```
======================================================================
【1】资深后端开发工程师（AI工具辅助开发）  |  某某数字科技  |  广州·黄埔区
======================================================================
  JD 12727 字符
  ✅ 已点「立即沟通」(a[class*="chat"] #1)
  会话匹配: ✅ 命中「某某数字科技」
  招呼语: ✅ 已发送
  （等待 21 秒，人类节奏）
```

### 8.4 去网站上人工核对（关键！）

**跑完 2 个之后，一定要自己去网站上确认：**

1. 打开 BOSS直聘 的聊天页面
2. 看这两个岗位的会话在不在
3. 点进去看**你发的话是不是你想发的那句**

**确认没问题，再放量：**

```bash
node apply-jobs.js 3 15     # 从第 3 条开始，投 15 条
```

### 8.5 节奏控制（必读）

脚本里已经内置了延时：

```js
const wait = 12000 + Math.random() * 15000;   // 每个岗位之间等 12～27 秒
```

**为什么必须这样：**

- **BOSS直聘 是唯一有主动反自动化机制的平台。** 有开源项目作者明确警告过：不要依赖程序批量投递 BOSS直聘，触发风控就当天停止，第二天再投，否则可能封号。
- 每日沟通数通常有上限（**100 次左右**），**留出余量**。
- 智联、前程无忧、猎聘的风控比 BOSS直聘 松得多，适合走量。

**红线：**

| ❌ 不要做 | ✅ 应该做 |
|---|---|
| 一次投几百个 | 一天控制在 30～50 个 |
| 把延时改成 0 追求速度 | 保持 12～27 秒随机延时 |
| 24 小时不间断跑 | 白天跑，晚上停 |
| 绕过验证码 | **遇到验证码立刻停手**，人工处理 |
| 深夜高频操作 | 工作时间操作，更像真人 |

### 8.6 出现这些信号就立刻停

| 信号 | 含义 | 动作 |
|---|---|---|
| 操作开始失败/超时 | 可能被限流 | **立刻停止当天所有投递** |
| 页面突然要求重新登录 | 会话被踢 | 停止，手动重新登录，当天别再投 |
| 出现验证码 | 风控触发 | 停止，人工处理，当天别再投 |
| 消息显示「发送失败」 | 被限制 | 停止，第二天再试 |

**停下来不丢人，封号才麻烦。**

---

## 第 9 步：写自己的脚本

前面用的是现成脚本。现在学怎么用公共模块写自己的——**这才是这套工具真正的用法**。

### 9.1 公共模块速查

`agent/lib/client.js` 里所有能用的函数：

| 函数 | 作用 | 返回 |
|---|---|---|
| `goto(url)` | 打开网页 | `{ok, ms}` |
| `read()` | 读纯文本 | `string` |
| `extract(max)` | 读带链接的 Markdown | `string` |
| `query(selector, limit)` | 查元素 | 数组，每项含 `text/i/x/y/visible/cls` |
| `clickSel(selector, nth)` | 点第 nth 个匹配元素 | `{ok}` |
| `typeSel(selector, text, opts)` | 输入文字 | `{ok}` |
| `scroll(direction, times)` | 滚动 N 屏 | `{ok}` |
| `pe(code)` | 在页面里执行 JS ⭐ | 计算结果 |
| `nap(a, b)` | 随机等待 a～b 毫秒 | — |
| `call(command, params)` | 发原始命令（万能兜底） | `{ok, result}` |

### 9.2 完整可跑的例子

新建文件 `agent/my-first-bot.js`：

```js
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
    await nap(5000, 7000);      // ⚠️ 跳转后要多等一会，见下面「坑 4」

    const url = await pe('(function(){ return location.href; })()');
    console.log('现在在:', typeof url === 'string' ? url : JSON.stringify(url));
  }

  console.log('完成');
  process.exit(0);
})();
```

**运行：**

```bash
cd agent
node my-first-bot.js
```

**预期输出：**

```
打开网页…
页面标题: Example Domain
找到 1 个链接
  1. "Learn more"
点击第一个链接…
现在在: https://www.iana.org/help/example-domains
完成
```

### 9.3 四个必须知道的坑

#### 坑 1：`pe()` 里的代码必须是「一个表达式」

`pe()` 内部会把你的代码包成 `return (你的代码)`。所以**不能写分号**：

```js
// ❌ 报错 Unexpected token ';'
await pe('const x = 1; return x;');

// ✅ 用立即执行函数（IIFE）包起来
await pe('(function(){ const x = 1; return x; })()');

// ✅ 单行表达式可以直接写
await pe('document.title');
```

#### 坑 2：返回对象会变成 `[object Object]`

**错误写法** —— 直接返回对象：

```js
// ❌ 拿到的是字符串 "[object Object]"
const info = await pe('({a: 1, b: 2})');
```

**正确写法** —— 在页面里先 `JSON.stringify`，外面再 `JSON.parse`：

```js
// ✅ 在页面内序列化，在外面反序列化
const info = await pe('JSON.stringify({a: 1, b: 2})');
const obj = JSON.parse(info);
console.log(obj.a);   // 1
```

> ⚠️ **这个坑很危险**：如果你拿这个结果去覆盖页面上的内容，会把用户的数据写成 `[object Object]`。**写回页面之前，一定要先 `console.log` 核对内容。**

#### 坑 3：有些按钮点了没反应

这是最常遇到的问题。三个原因，对应三种解法：

**原因 A：你点的是外层包装元素，真正带事件的是里面的按钮。**

```js
// ❌ 按文档顺序，第一个匹配到的是外层 <div class="btn-box">
await clickSel('button, a, span, div', 1);

// ✅ 明确指定标签
await clickSel('button', 1);
```

**原因 B：元素被 CSS 隐藏了（鼠标悬停才显示）。** 扩展里的 `forceVisible()` 会自动处理，但偶尔还是点不动，这时用 `showSel` 诊断：

```bash
node cmd.js showSel "{\"selector\":\".action-delete\",\"nth\":1}"
```

输出会告诉你元素的位置和可见性。

**原因 C：页面用了 Vue / React，只认真实用户交互。** 这是最硬的骨头，解法见[第 9.4 节](#94-进阶对付点不动的按钮)。

#### 坑 4：点击导致跳转后，立刻执行 `pe()` 会超时

**症状**：

```
点击第一个链接…
现在在: { error: '命令 pageEval 超时' }
```

**原因**：点击触发了页面跳转，新页面还在加载。此时内容脚本还没注入完成，命令自然没人响应。

**解法**：跳转之后**多等一会**（5～7 秒），再做下一步：

```js
await clickSel('a', 1);
await nap(5000, 7000);        // ⚠️ 不要只等 2 秒
const url = await pe('(function(){ return location.href; })()');
```

**另外**：`pe()` 出错时返回的是 `{ error: '...' }` 对象而不是字符串。所以取值前先判断类型，否则你的日志里会打出 `[object Object]`：

```js
const url = await pe('(function(){ return location.href; })()');
console.log(typeof url === 'string' ? url : JSON.stringify(url));
```

> 💡 用 `goto()` 直接跳转不受这个影响 —— 它内部会等页面加载完成。只有「点击链接跳转」才需要手动多等。

### 9.4 进阶：对付「点不动」的按钮

有些网站的按钮，你怎么点都没反应。因为它们是 Vue / React 组件，不接受合成事件。

**解法是绕过 UI，直接调用组件内部的方法。**

工具提供了 `pe()`，它能在**页面主世界**执行代码，从而访问到页面的框架实例。

#### Vue 应用的解法

```js
const { pe, goto, nap } = require('./lib/client');

(async () => {
  await goto('https://某个用vue的网站');
  await nap(5000, 7000);

  // 1. 找到元素上挂的 Vue 实例
  const info = await pe(`JSON.stringify((function(){
    let el = document.querySelector('.目标元素的选择器'), depth = 0, vue = null;
    while (el && depth < 15) {
      if (el.__vue__) { vue = el.__vue__; break; }
      el = el.parentElement; depth++;
    }
    if (!vue) return { error: '没找到 Vue 实例' };
    return {
      name: vue.$options.name,                    // 组件名
      data: Object.keys(vue.$data || {}),         // 有哪些数据
      methods: Object.keys(vue.$options.methods || {})  // 有哪些方法
    };
  })())`);
  console.log(JSON.parse(info));

  // 2. 读方法源码，找到真正干活的那个
  const src = await pe(`JSON.stringify((function(){
    let el = document.querySelector('.目标元素的选择器'), vue = null;
    while (el) { if (el.__vue__) { vue = el.__vue__; break; } el = el.parentElement; }
    return vue.$options.methods.保存方法名.toString();
  })())`);
  console.log('方法源码:', src);

  // 3. 直接调用
  await pe(`(function(){
    let el = document.querySelector('.目标元素的选择器'), vue = null;
    while (el) { if (el.__vue__) { vue = el.__vue__; break; } el = el.parentElement; }
    vue.表单数据.字段 = '新的内容';
    vue.真正调API的方法();
    return 'done';
  })()`, 20000);
})();
```

**第 2 步是关键。** 很多网站的「保存」按钮只是个校验包装，把方法源码打出来就能看清：

```text
function(e) {
  this.$refs[e].validate(ok => ok && this.saveSelfInfo())
}
//                              ↑ 真正调 API 的是 saveSelfInfo
```

所以要找的是 **`saveSelfInfo` 这种名字朴实、直接调 `$api.xxx` 的方法**，直接调它就能绕过校验。

完整可跑的例子见 `agent/examples/vue-call-api.js`。

#### React 应用的解法

React 需要沿 fiber 树往上找事件处理器：

```js
const { pe } = require('./lib/client');

(async () => {
  // React 16/17 的元素上是 __reactInternalInstance$xxx
  const result = await pe(`JSON.stringify((function(){
    const el = document.querySelector('.目标按钮');
    const key = Object.keys(el).find(k => k.startsWith('__reactInternalInstance'));
    if (!key) return { error: '不是 React 元素，或 React 版本不同' };

    let fiber = el[key];
    let depth = 0;
    while (fiber && depth < 20) {
      const props = fiber.memoizedProps || fiber.pendingProps || {};
      if (typeof props.onClick === 'function') {
        // 找到事件处理器，直接调用
        props.onClick({
          preventDefault(){}, stopPropagation(){},
          target: el, currentTarget: el, type: 'click', nativeEvent: {}
        });
        return { clicked: true, depth };
      }
      fiber = fiber.return;   // 沿 fiber 树向上
      depth++;
    }
    return { error: '祖先里没找到 onClick' };
  })())`, 20000);
  console.log(result);
})();
```

**注意**：React 17+ 的元素上可能是 `__reactProps$xxx`，这时直接取 `el[那个key].onClick` 就行。两种都试。

完整可跑的例子见 `agent/examples/react-fiber-click.js`。

#### Ant Design 的确认弹窗

很多国内网站用 Ant Design。它的按钮有个坑：**两个汉字的按钮文字中间会被塞一个空格**。

```
你以为是 "确定"，实际 DOM 里是 "确 定"
```

所以用文字匹配会失败：

```js
// ❌ 匹配不到
document.querySelectorAll('button').find(b => b.textContent.trim() === '确定');

// ✅ 用类名
document.querySelector('.ant-modal-confirm-btns .ant-btn-primary').click();
```

### 9.5 一个实用的例子：抓 JD 并生成报告

```js
const fs = require('fs');
const { goto, extract, nap } = require('./lib/client');

const JOBS = [
  { title: '高级Java开发', url: 'https://www.zhipin.com/job_detail/xxx1.html' },
  { title: '后端架构师',   url: 'https://www.zhipin.com/job_detail/xxx2.html' },
];

(async () => {
  const report = [];

  for (const job of JOBS) {
    console.log(`读取: ${job.title}`);

    const r = await goto(job.url);
    if (!r.ok) { console.log('  失败:', r.error); continue; }
    await nap(3500, 5000);

    const jd = await extract(20000);
    report.push(`\n${'='.repeat(60)}\n${job.title}\n${job.url}\n${'='.repeat(60)}\n${jd}`);

    console.log(`  拿到 ${jd.length} 字符`);
    await nap(2000, 4000);     // 人类节奏
  }

  fs.writeFileSync('jd-report.md', report.join('\n'), 'utf8');
  console.log(`\n报告已生成: jd-report.md（${report.length} 个岗位）`);
  process.exit(0);
})();
```

**这个脚本生成的 `jd-report.md` 可以直接丢给 AI 助手**，让它帮你分析每个岗位的重点、生成针对性的招呼语。

---

## 进阶：配合 AI 助手一起用

### 为什么需要 AI 助手

这套工具本身**只是手和眼睛**——它能打开网页、读内容、点按钮，但它**不理解内容，也不会做判断**。

真正让它有价值的是：**你把自己的需求告诉 AI 助手，让它驱动这套工具。**

分工是这样的：

| 角色 | 负责 |
|---|---|
| **你** | 说清楚你要什么（岗位方向、城市、底线条件） |
| **AI 助手** | 读 JD、判断匹配度、写招呼语、分析 HR 回复、按需改脚本 |
| **本工具** | 打开网页、抓取内容、点击、输入、发送 |

### 怎么把工具交给 AI 助手

AI 助手（比如 DeepSeek Harness、Claude Code、Cursor 等能执行命令的助手）需要知道两件事：

1. **代理在跑**（`http://127.0.0.1:61823`）
2. **有哪些命令可用**（就是本文档的[命令速查表](#46-命令速查表)）

你可以直接把下面这段话发给 AI 助手作为开场：

```
我在本地跑了一个浏览器自动化代理，它能控制我自己登录状态的 Chrome。

接口: POST http://127.0.0.1:61823/cmd
请求体: {"command": "命令名", "params": {...}}
常用命令:
  goto      {url}                          打开网页
  read      {}                             读纯文本
  extract   {max_length}                   读带链接的 Markdown
  query     {selector, limit}              按 CSS 选择器查元素
  clickSel  {selector, nth}                点击元素
  typeSel   {selector, text, submit, fast} 输入文字
  scroll    {direction}                    滚动一屏
  pageEval  {code}                         在页面里执行 JS（必须是单个表达式，多语句用 IIFE）
  screenshot {}                            截图

也可以用 agent/lib/client.js 这个 Node 模块来写脚本:
  const { goto, extract, pe, nap } = require('./lib/client');

请帮我做：<在这里写你的需求>
```

### 对话示例

#### 例子 1：让它读 JD 并判断匹配度

> **你**：用 `goto` 打开这个职位 https://www.zhipin.com/job_detail/xxxx.html，然后 `extract` 读一下内容，告诉我：
> 1. 这个岗位主要做什么
> 2. 需要哪些技术栈
> 3. 我的背景是 5 年后端、做过电商订单系统和微服务拆分，匹配度如何
> 4. 有哪些我可能不满足的硬性要求

**AI 会**：执行命令、读回内容、逐条分析。

#### 例子 2：让它写针对性的招呼语

> **你**：根据刚才那个 JD，帮我写一段打招呼的话。要求：
> - 3 句话以内
> - 只提我真实做过的（电商订单系统、微服务拆分）
> - 不要用"精通""熟练掌握"这种词
> - 结尾问一下团队规模

**AI 会**：结合 JD 里的关键词和你的真实经历，生成一段话。

#### 例子 3：让它批量分析

> **你**：我跑了 `scrape-jobs.js`，结果在 `data/gd-jobs.json` 里。请读这个文件，帮我：
> 1. 统计一下有多少个岗位
> 2. 找出所有提到"AI""大模型"的岗位
> 3. 按匹配度给我排个序，说明排序理由
> 4. 把最匹配的前 10 个写成一个 Markdown 表格

**AI 会**：读文件、分析、生成表格。

#### 例子 4：让它分析 HR 的回复

> **你**：用命令打开 BOSS直聘 的聊天页面，读出最近的会话，然后帮我分析：
> 1. 哪些 HR 回复了
> 2. 哪些是在问我的期望薪资
> 3. 哪些提到"外包""驻场"（我不考虑）
> 4. 给每个需要回复的 HR 起草一段回复

**AI 会**：读聊天列表、分类、起草回复，**发之前会给你确认**。

#### 例子 5：让它改脚本

> **你**：`scrape-jobs.js` 现在抓的是 BOSS直聘。帮我改成也能抓智联招聘，输出到同一个 JSON 里，字段保持一致。

**AI 会**：读现有脚本、了解智联的页面结构、改写脚本。

### 怎么让 AI 助手表现更好

| 做法 | 效果 |
|---|---|
| **说清楚你的底线** | "我不考虑外包和驻场"——这样它会自动过滤 |
| **给它真实信息** | 别让它编造你的经历，把你真实的项目告诉它 |
| **让它先小批量试** | "先投 2 个给我看看" 比 "投 50 个" 安全得多 |
| **要求它核对** | "发之前先把内容给我看" |
| **一次一件事** | 一次让它做太多容易乱 |
| **发现它编造就纠正** | AI 有时会脑补细节，涉及简历内容必须较真 |

### ⚠️ 关于 AI 的三条红线

1. **不要让 AI 编造你的经历。** 它很擅长写漂亮话，但那些话必须是**你真的做过的事**。面试会问细节，而且这是诚信问题。
2. **不要让 AI 写数字。** "提升 40% 性能" 这种如果没有真实依据，就是给自己埋雷。
3. **涉及承诺的事必须你拍板。** 面试时间、期望薪资、到岗时间——让 AI 起草，但**发送前你自己确认**。

---

## 遇到问题怎么办

### 排查总原则

**从下往上查**：先确认代理活着 → 再确认扩展连上了 → 再确认页面状态对不对 → 最后才怀疑脚本。

### 问题 1：`extensionConnected: false`

扩展没连上代理。

1. Chrome 开着吗？
2. `chrome://extensions` 里 NavAgent 是启用的（蓝色）吗？
3. **等 30 秒** —— 扩展每 24 秒重连一次
4. 在 Chrome 里刷新任意网页
5. 点一下扩展图标手动触发
6. 端口对得上吗？扩展选项页里的端口要和代理的 `wsPort` 一致

### 问题 2：命令报 `Unknown: xxx`

**扩展的代码和你电脑上跑的不是同一份。**

Chrome **不会自动热重载扩展**。你改了 `extension/` 里的代码后，必须：

```
chrome://extensions → 找到 NavAgent → 点卡片上的 ⟳ 重新加载
```

然后再试。

> 💡 **这是本工具最常踩的坑之一。** 任何时候改了扩展代码，第一件事就是重载。

### 问题 3：元素点不动

按顺序试：

1. **确认选择器对不对**

   ```bash
   node cmd.js query "你的选择器"
   ```

   看输出的 `visible` 是不是 `true`，`x/y` 是不是有实际值。

2. **换标签重试** —— 别用 `'button, a, span, div'` 这种大范围选择器，明确写 `'button'` 或 `'a'`。

3. **诊断隐藏元素**

   ```bash
   node cmd.js showSel "{\"selector\":\".你的选择器\",\"nth\":1}"
   ```

4. **还不行就走第 9.4 节的框架内部调用**。

### 问题 4：输入了内容但保存无效

**十有八九是字数超限。** 很多网站的输入框有上限（比如智联的「个人优势」上限 **500 字**）。

**症状**：脚本报告「写入成功」，但刷新页面后内容没变。

**解法**：先读页面上有没有「还可输入 N 个字」这类提示，确认你的内容没超。或者用 `pe()` 读一下实际值：

```js
const actual = await pe(`(function(){
  const ta = document.querySelector('textarea');
  return ta ? ta.value.length : -1;
})()`);
console.log('实际写入长度:', actual);
```

### 问题 5：日期/时间字段填了但校验不通过

**有些日期控件必须按回车才会提交值。**

**症状**：界面上显示有日期了，但保存时报「请选择开始时间」。

**解法**：输入时加上 `submit: true`（发送回车）。

```js
await typeSel('input.ivu-input', '2026-03', { submit: true });
```

### 问题 6：被风控了

**症状**：操作持续失败、要求重新登录、出现验证码、消息发不出去。

**动作**：

1. **立刻停止当天所有自动化操作**
2. 手动登录一次，确认账号正常
3. 至少等 24 小时
4. 恢复后**大幅降低频率**（每天 10～20 个，而不是 50 个）

**预防**：严格遵守[第 8.5 节](#85-节奏控制必读)。

### 问题 7：页面读到的是空白

可能原因：

| 原因 | 判断 | 解法 |
|---|---|---|
| 掉登录了 | 手动打开看是不是登录页 | 重新登录 |
| 页面还没加载完 | 内容比预期短很多 | 加大 `nap()` 的等待时间 |
| 内容在 iframe 里 | 读到的内容对不上 | 目前不支持跨 iframe，需单独定位 |
| 内容需要滚动才加载 | 只有前几条 | 先 `scroll` 几次再读 |

**加大等待时间的写法：**

```js
await goto(url);
await nap(6000, 8000);        // 等 6～8 秒，别用固定值
const content = await extract();
```

### 问题 8：内容被折叠了，读不全

**症状**：明明页面上有的内容，`extract` 读不到。

**原因**：很多网站默认只显示一部分，要点击「查看全部」才展开。

**解法**：先点展开按钮再读。

```js
const { query, clickSel, extract, nap } = require('./lib/client');

const btns = await query('[class*="show-all"], [class*="expand"]', 10);
for (const b of btns) {
  if (/查看全部|展开/.test(b.text)) {
    await clickSel('[class*="show-all"], [class*="expand"]', b.i);
    await nap(1500, 2500);
  }
}
const full = await extract();
```

> ⚠️ **这个坑很容易误判。** 你可能以为「网站没这个信息」，其实是折叠了。判断内容是否完整前，先确认所有可展开的都展开了。

### 问题 9：写回数据时写坏了

**这是最危险的错误。**

**真实案例**：用 `pe()` 读取一个输入框的内容时，返回的是对象而不是字符串，结果把 `[object Object]` 写进了简历，覆盖了原有内容。

**三条规矩：**

1. **读的时候显式转字符串**

   ```js
   // ✅ 在页面里就转成字符串
   const val = await pe(`(function(){
     const ta = document.querySelector('textarea');
     return ta ? String(ta.value) : '';
   })()`);
   ```

2. **写之前先打印出来看**

   ```js
   console.log('即将写入的内容:');
   console.log(JSON.stringify(newValue).slice(0, 200));
   console.log('长度:', newValue.length);
   // 确认没问题再写
   ```

3. **先备份原内容**

   ```js
   const original = await pe('(function(){ return String(document.querySelector("textarea").value); })()');
   fs.writeFileSync('backup.txt', original, 'utf8');   // 出事了能恢复
   ```

---

## 附录

### 附录 A：BOSS直聘城市代码

| 城市 | 代码 | 城市 | 代码 |
|---|---|---|---|
| 全国 | `100010` | 广州 | `101280100` |
| 深圳 | `101280600` | 东莞 | `101281600` |
| 佛山 | `101280800` | 中山 | `101281700` |
| 惠州 | `101280300` | 珠海 | `101280700` |
| 江门 | `101281100` | 肇庆 | `101280900` |
| 汕头 | `101280500` | 北京 | `101010100` |
| 上海 | `101020100` | 杭州 | `101210100` |
| 成都 | `101270100` | 武汉 | `101200100` |
| 南京 | `101190100` | 西安 | `101110100` |

**用法**：拼进搜索网址。

```
https://www.zhipin.com/web/geek/jobs?query=Java&city=101280100
```

> 💡 找不到你要的城市？在 BOSS直聘 网页上手动切到那个城市，然后看地址栏里的 `city=` 后面的数字。

### 附录 B：完整命令参考

**命令行（`node cmd.js <命令> [参数]`）**

| 命令 | 参数 | 说明 |
|---|---|---|
| `goto` | `"网址"` | 打开网页 |
| `back` | — | 后退 |
| `read` | — | 读纯文本 |
| `extract` | — | 读带链接的 Markdown |
| `scan` | — | 列出可交互元素（带编号） |
| `zone` | `编号` | 读指定区域 |
| `click` | `编号` | 点 `scan` 出来的第 N 个元素 |
| `query` | `"选择器"` | 查元素 |
| `clickSel` | `"选择器"` | 点元素 |
| `showSel` | `{JSON}` | 诊断元素的可见性 |
| `typeSel` | `{JSON}` | 输入文字 |
| `scroll` | — | 向下滚动一屏 |
| `pageEval` | `"代码"` | 在页面执行 JS |
| `screenshot` | — | 截图存到 `shots/` |

**程序接口（`require('./lib/client')`）**

```js
const {
  call,      // call(command, params, timeout) → {ok, result}
  txt,       // txt(response) → string
  pe,        // pe(code, timeout) → 主世界执行结果 ⭐
  goto,      // goto(url)
  read,      // read(timeout) → string
  extract,   // extract(maxLength) → string
  query,     // query(selector, limit) → array
  clickSel,  // clickSel(selector, nth)
  typeSel,   // typeSel(selector, text, {submit, fast})
  scroll,    // scroll(direction, times)
  nap,       // nap(minMs, maxMs) → 随机等待
  settle,    // settle(ms)
} = require('./lib/client');
```

### 附录 C：环境变量

| 变量 | 默认值 | 作用 | 谁读它 |
|---|---|---|---|
| `NAVAGENT_HOST` | `127.0.0.1` | 代理地址 | `lib/client.js` |
| `NAVAGENT_HTTP_PORT` | `61823` | 脚本下命令的 HTTP 端口 | `agent.js`、`lib/client.js` |
| `NAVAGENT_PORT` | `61822` | 扩展连接的 WebSocket 端口 | `bridge.js` |

> ⚠️ 改 WebSocket 端口时，**扩展选项页里的端口也要同步改**，否则连不上。

### 附录 D：HTTP 接口原始用法

不想用 Node 脚本的话，可以直接发 HTTP 请求：

```bash
# 查状态
curl http://127.0.0.1:61823/status

# 打开网页
curl -X POST http://127.0.0.1:61823/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"goto","params":{"url":"https://example.com"}}'

# 读内容
curl -X POST http://127.0.0.1:61823/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"extract","params":{"max_length":50000},"timeout":60000}'
```

**响应格式：**

```json
{
  "ok": true,
  "command": "goto",
  "ms": 940,
  "result": { "ok": true, "result": "..." }
}
```

> ⚠️ 注意 `result` 是**嵌套**的：外层 `result` 是扩展的响应对象，真正的数据在里面那层 `result`。

### 附录 E：文件都在哪

```
find-job/
├── extension/              浏览器扩展
│   ├── manifest.json         扩展配置
│   ├── background.js         命令路由、截图
│   ├── content-script.js     DOM 操作、forceVisible、pageEval 桥
│   └── shadow-hook.js        主世界脚本（Vue/React 访问）
│
├── agent/                  本地代理与脚本
│   ├── agent.js              ⭐ 入口，跑这个
│   ├── bridge.js             扩展连接管理
│   ├── cmd.js                命令行工具
│   ├── lib/client.js         ⭐ 写脚本用这个
│   ├── examples/             技法示例
│   │   ├── vue-call-api.js
│   │   ├── react-fiber-click.js
│   │   └── resume-audit.js
│   ├── scrape-jobs.js        抓岗位
│   ├── apply-jobs.js         批量投递
│   └── rank-jobs.py          筛选打分
│
├── data/                   抓取结果（已被 .gitignore 排除）
├── shots/                  截图（自动创建）
└── docs/
    ├── TUTORIAL.md         ⭐ 你正在读的文件
    ├── PLATFORMS.md        ★ 四平台操作手册（入口 / 组件 API / 发附件简历 / 反爬）
    └── ADD-PROJECTS.md     ★ 批量填项目经历的实战笔记
```

> 💡 **当你开始针对某个招聘平台写脚本时，先看 [`PLATFORMS.md`](PLATFORMS.md)。**
> 里面记录了四个平台各自已经跑通的做法：简历页/附件/消息页的准确入口、
> Vue 组件要调哪个方法、React 界面怎么走 fiber 找事件、
> 以及各平台的反爬特性（比如 BOSS 列表页的薪资是字体混淆过的假字符、会话列表只保留 40 条）。
> **这些结论都是用时间换来的，照着做不用重复探索。**

### 附录 F：一页纸速查

```bash
# ===== 启动 =====
cd agent
npm install          # 只第一次需要
node agent.js        # 保持这个窗口开着

# ===== 新开一个窗口 =====

# 确认连通
curl http://127.0.0.1:61823/status
# 期望: {"extensionConnected":true,"wsPort":61822}

# 试一下
node cmd.js goto "https://example.com"
node cmd.js read
node cmd.js screenshot

# 抓岗位（先改 scrape-jobs.js 里的城市和关键词）
node scrape-jobs.js

# 筛选（先改 rank-jobs.py 里的规则）
python rank-jobs.py ../data/gd-jobs.json

# 投递（先改 apply-jobs.js 里的招呼语）
node apply-jobs.js 1 2      # 先试 2 个！
node apply-jobs.js 3 15     # 确认没问题再放量

# ===== 出问题了 =====
# 改了 extension/ 里的代码 → chrome://extensions 点 ⟳ 重载
# 掉登录了 → 手动重新登录
# 被风控了 → 立刻停，等 24 小时
```

---

## 最后

**这套工具的价值不在于「自动」，而在于把重复劳动交给机器，让你把时间花在判断和选择上。**

几个真心建议：

1. **投递质量 > 投递数量。** 一个读懂了 JD、说中要害的招呼语，比投 50 家模板消息有用得多。
2. **遇到验证码就停。** 这是平台的边界，尊重它。
3. **别让 AI 替你编经历。** 它写得越漂亮，你面试越难圆。
4. **简历附件提前传好。** 这是唯一需要你手动做、但影响最大的事。
5. **先投 2 个，自己核对，再放量。** 每个环节都值得先验证再批量。

祝求职顺利。
