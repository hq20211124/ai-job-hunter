# 参考项目

本方案在设计时参考了以下开源项目。这里只放链接，不放原文（原文版权归各作者）。

## 直接启发

| 项目 | 关键启发 |
|---|---|
| [yangfeng20/boss_batch_push](https://github.com/yangfeng20/boss_batch_push) | **不依赖 UI，直接操作页面框架的组件状态**。作者原话是"直接通过标签绑定的 vue 组件修改了 enableSubmit 的值"。本项目的「直接调 Vue 组件方法」思路来源于此。 |
| [DimitriBouriez/navagent-mcp](https://github.com/DimitriBouriez/navagent-mcp) | 本项目的扩展基于它改造。核心价值：**用扩展而非 CDP 驱动浏览器**，因此能复用用户真实登录态。 |
| [muyuniao/boss-auto-apply](https://github.com/muyuniao/boss-auto-apply) | 油猴脚本方案。反风控参数参考：4–10 秒随机延时、每日上限 150 次、不绕过验证码。 |
| [jolie-z/jobhunter-ai](https://github.com/jolie-z/jobhunter-ai) | Playwright + CDP + 独立 Edge 配置目录的方案。可作为对比：优点是实现直接，缺点是需要在新配置里重新登录。 |
| [Jerry-poor/get_jobs](https://github.com/Jerry-poor/get_jobs) | 作者明确警告：**不要依赖程序批量投递 BOSS直聘**——"当天停止投递，第二天接着投，否则可能会封号"。本项目把这个警告落实为投递节奏控制。 |

## 技术要点出处

- **App-Bound Encryption（ABE）导致复制配置目录后 Cookie 失效** —— Chrome 127+ 引入，实测复制配置目录后 Cookie 从 848 掉到 35，目录联结掉到 45。
- **Chrome 拒绝在默认配置目录上开远程调试端口** —— `DevTools remote debugging requires a non-default data directory`，Chrome 与 Edge 均如此。
- **MANIFEST V3 扩展不能自我重载** —— 改完扩展源码必须在 `chrome://extensions` 手动点重载，这是 Chrome 的硬性安全设计。

## 相关标准

- [WebMCP](https://github.com/MicrosoftEdge/MCP) —— 扩展中保留了 `navigator.modelContext` 的桥接能力，页面若暴露 WebMCP 工具即可直接调用。
