# AI Job-Hunt Automation — Browser Extension Approach

**English** | [中文](README.md)

Let an AI operate job sites on your behalf: browse listings, read job descriptions, apply, and chat with recruiters.

**Core idea: don't launch a new browser, don't use CDP, don't copy your profile. Install a browser extension and drive the Chrome you're already logged into.**

> 📖 **Step-by-step tutorial (Chinese): [`docs/TUTORIAL.md`](docs/TUTORIAL.md)** — a from-scratch, beginner-friendly walkthrough covering installation, scraping, ranking, applying, writing your own scripts, and using it with an AI assistant.

---

## Why not Playwright / Selenium / CDP

| Approach | Problem |
|---|---|
| Playwright launching a new browser | Requires re-login (QR scan), and presents a new device fingerprint |
| CDP attaching to your Chrome | Chrome 154+ refuses to open a debug port on the default user-data-dir |
| Copying the profile directory | Triggers App-Bound Encryption — **cookies get wiped** (measured: 848 → 35) |
| Directory junction | Same ABE trigger (measured: 848 → 45), plus risk of corrupting the original profile |

**The extension approach wins** because it runs inside your real browser, sharing the real cookies, the real fingerprint, and the real session. To the website, it looks like *you* are browsing.

---

## Architecture

```
┌─────────────────┐   chrome.tabs.sendMessage   ┌──────────────────┐
│  Extension      │ ◄──────────────────────────► │  Content script  │
│  background.js  │                              │  (ISOLATED world)│
│  (service worker)│                             └────────┬─────────┘
└────────┬─────────┘                                      │ postMessage
         │                                                ▼
         │ WebSocket (extension is the client)   ┌──────────────────┐
         │                                       │  MAIN world      │
┌────────▼─────────┐                             │  shadow-hook.js  │
│  Local agent     │                             │  (page JS access)│
│  agent.js        │                             └──────────────────┘
│  ws://:61822     │
│  http://:61823   │ ◄── your scripts / AI send commands over HTTP
└──────────────────┘
```

**Why a MAIN-world script is needed:** content scripts run in an isolated world and cannot reach the page's Vue/React instances. Some sites only respond to genuine user input, so you must reach into the page context.

---

## Quick start

### 1. Install the extension

```
Chrome → chrome://extensions → enable "Developer mode" → "Load unpacked" → select the extension/ folder
```

### 2. Start the local agent

```bash
cd agent
npm install
node agent.js
```

You should see `✅ 扩展已就绪` (extension ready).

### 3. Send commands

```bash
node cmd.js goto "https://www.zhipin.com/web/geek/jobs?query=Java&city=101280100"
node cmd.js read
node cmd.js extract
node cmd.js screenshot
```

For a full walkthrough, see the [tutorial](docs/TUTORIAL.md).

---

## Command reference

| Command | Description |
|---|---|
| `goto <url>` | Open a page |
| `back` | Go back |
| `read` | Read the page as plain text |
| `extract` | Read the page as structured Markdown (**including link URLs**) |
| `scan` | List interactive elements with indices |
| `zone <n>` | Read a specific region |
| `click <n>` | Click the Nth element from `scan` |
| `query {selector,limit}` | Query elements by CSS selector (position + visibility included) |
| `clickSel {selector,nth}` | Click an element |
| `showSel {selector,nth}` | Diagnose an element's visibility |
| `typeSel {selector,nth,text,submit,fast}` | Type text; `fast:true` for long content |
| `scroll` | Scroll down one screen |
| `pageEval {code}` | **Execute JS in the page's MAIN world** |
| `screenshot` | Save a screenshot to `shots/` |

### Node API (`agent/lib/client.js`)

```js
const { goto, extract, pe, nap } = require('./lib/client');

await goto('https://example.com');
const md = await extract();                 // structured Markdown with links
const title = await pe('document.title');  // run JS in the page's main world
await nap(2000, 3500);                     // human-paced delay
```

---

## Core technique: defeating controls that ignore synthetic clicks

**Symptom:** you dispatch `el.click()` plus a full pointer/mouse event sequence, and nothing happens.

**Root cause:** the site manages state through a framework (Vue / React) and only trusts genuine interaction. Some controls are revealed purely by CSS `:hover`, which synthetic events cannot trigger.

**Solution — four escalating levels:**

### Level 1: Force visibility + full event sequence

```js
// content-script.js — forceVisible()
// ⚠️ The trap: assigning '' merely clears the inline style, so it falls back
//    to the CSS rule display:none — effectively a no-op.
node.style.setProperty('display', 'block', 'important');   // ✅ must override explicitly
node.style.setProperty('visibility', 'visible', 'important');
node.style.setProperty('pointer-events', 'auto', 'important');
```

### Level 2: Click the right element

Wrapper elements (`<div class="btn-box">`) often carry no handler — the real one is on an inner `<button>` or `<a>`.

```js
// ❌ In document order this matches the outer DIV first
querySelectorAll('button, a, span, div')[0]
// ✅ Be specific about the tag
querySelectorAll('button')[0]
```

### Level 3: Vue — call the component method directly

```js
// 1. Find the Vue instance attached to the element
let n = document.querySelector('.target'), d = 0, vue = null;
while (n && d < 15) { if (n.__vue__) { vue = n.__vue__; break; } n = n.parentElement; d++; }

// 2. Read the method source to find the one that actually calls the API (the key step!)
vue.$options.methods.handleSave.toString()
// → function(e){ this.$refs[e].validate(ok => ok && this.saveSelfInfo()) }
//   ↑ handleSave is just a validation wrapper; saveSelfInfo does the real work

// 3. Invoke the business method directly
vue.advantageForm.desc = 'new content';
vue.saveSelfInfo();     // bypasses UI validation, goes straight to the API
```

Runnable example: [`agent/examples/vue-call-api.js`](agent/examples/vue-call-api.js)

### Level 4: React — walk the fiber tree for the handler

```js
// React 16/17: elements carry __reactInternalInstance$xxx (not __reactProps$)
const key = Object.keys(el).find(k => k.startsWith('__reactInternalInstance'));
let fiber = el[key];
while (fiber) {
  const props = fiber.memoizedProps || fiber.pendingProps;
  if (typeof props.onClick === 'function') {
    props.onClick({ preventDefault() {}, stopPropagation() {} });
    break;
  }
  fiber = fiber.return;   // walk up the fiber tree
}
```

> React 17+ may instead expose `__reactProps$xxx` directly on the element — try both.

Runnable example: [`agent/examples/react-fiber-click.js`](agent/examples/react-fiber-click.js)

---

## Pitfalls we hit (the painful list)

| Pitfall | Symptom | Fix |
|---|---|---|
| **Field character limit** | Write reports success, but the save does nothing | Read the "N characters remaining" hint first. One site's summary field capped at **500 characters** |
| **Date pickers need Enter** | Value is displayed, yet validation says "please select a time" | Pass `submit: true` to `typeSel` |
| **`display: ''` is a no-op** | Element forced visible but still has no layout box | Use `setProperty(..., 'important')` |
| **Ant Design inserts a space** | Regex `^确定$` fails to match `确 定` | Match by class (`.ant-btn-primary`), not by text |
| **`pageEval` returns objects** | You get `[object Object]` and may write it back into a form | `JSON.stringify` inside the page; **always verify before writing back** |
| **`pageEval` only takes expressions** | `Unexpected token ';'` | Wrap multi-statement code in an IIFE: `(function(){ ... })()` |
| **Virtualized conversation lists** | The target conversation can't be found by scanning | Use the "unread" tab and the search box, not just the list |
| **Extension edits don't apply** | New commands fail with `Unknown` | Chrome never hot-reloads extensions — **click reload manually** |
| **`pageEval` right after a navigation** | Fails with "pageEval timed out" | After a click that navigates, wait 5–7 s for the content script to be injected |
| **`NAVAGENT_PORT` name collision** | Changing the WS port silently breaks the HTTP client | HTTP port uses `NAVAGENT_HTTP_PORT`; WS port uses `NAVAGENT_PORT` |

---

## Anti-detection notes

- **Don't rely on programmatic mass-applying on BOSS Zhipin.** It is the one platform with active anti-automation. If you trip the risk control, stop for the day and resume tomorrow.
- **Human pacing:** 2–5 s between actions, 15–25 s between batches. Keep the jitter *random* — a fixed interval is itself a bot signature.
- **Daily caps:** BOSS Zhipin typically allows ~100 greetings/day. Leave headroom; stay well under it.
- **Never bypass CAPTCHAs.** Stop and hand it to a human.
- **Prefer the laxer platforms for volume.** Zhaopin / 51job / Liepin have far looser controls than BOSS Zhipin.
- **Verify before scaling:** apply to 2 listings, check the results on the site yourself, then ramp up.

---

## Code examples

`agent/examples/` contains complete, runnable examples built on `agent/lib/client.js`:

| File | Technique demonstrated |
|---|---|
| [`vue-call-api.js`](agent/examples/vue-call-api.js) | **Vue:** read the method source to find the real API call, then invoke it directly, bypassing a broken UI validation path |
| [`react-fiber-click.js`](agent/examples/react-fiber-click.js) | **React 16:** walk the fiber tree to grab `onClick`, click a hidden button, then handle the Ant Design confirm dialog |
| [`resume-audit.js`](agent/examples/resume-audit.js) | Multi-platform resume audit: check for fabricated metrics, missing content, and corrupted text |

The shared client module:

```js
const { pe, goto, extract, nap } = require('./lib/client');

await goto('https://example.com');
const md = await extract();                   // structured Markdown (with links)
const title = await pe('document.title');    // execute JS in the page's main world
```

---

## Using it with an AI assistant

This tool is only **hands and eyes** — it can open pages, read content, and click. It does not understand what it reads.

The value comes from pairing it with an AI assistant (DeepSeek Harness, Claude Code, Cursor, or anything that can run commands). Tell the assistant what you want; it reads job descriptions, drafts tailored greetings, analyses recruiter replies, and adapts the scripts.

The assistant needs two things: that the agent is running on `http://127.0.0.1:61823`, and the command list above. See the [tutorial](docs/TUTORIAL.md) for a ready-to-paste prompt and concrete dialogue examples (the tutorial is currently Chinese only).

**Three hard rules when using an AI assistant:**

1. **Never let it invent experience.** It writes convincingly, but everything it says must be something you actually did.
2. **Never let it state metrics you can't defend.** "Improved performance by 40%" without evidence is a liability in an interview.
3. **Anything involving commitment is your call.** Interview times, salary expectations, start dates — let it draft, but you confirm before sending.

---

## Repository layout

```
├── extension/              Browser extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js         service worker: command routing, screenshots
│   ├── content-script.js     isolated world: DOM ops, forceVisible, pageEval bridge
│   ├── shadow-hook.js        MAIN world: Vue/React access, code-eval bridge
│   └── lib.js
├── agent/                  Local agent + automation scripts
│   ├── agent.js              WebSocket(:61822) + HTTP(:61823)
│   ├── bridge.js             extension connection management
│   ├── cmd.js                command-line client
│   ├── lib/client.js         shared module (use this to write scripts)
│   ├── examples/             technique examples (see above)
│   ├── scrape-jobs.js        job scraping
│   ├── apply-jobs.js         application pipeline (with JD-tailored greetings)
│   └── rank-jobs.py          filtering + match scoring
├── resume/                 Resume builder (personal data in gitignored profile.json)
├── docs/
│   ├── TUTORIAL.md           step-by-step tutorial (Chinese)
│   └── architecture.svg
└── data/                   Scraped data (gitignored)
```

---

## License and disclaimer

For personal job-hunting use only. You are responsible for any account risk arising from automation, and you must comply with each platform's terms of service.

**Do not use this to spam recruiters, submit false applications, or commit any form of fraud.**
