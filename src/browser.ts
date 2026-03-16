import { chromium, Browser, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { execSync, spawn } from "child_process";
import * as http from "http";

const LCEDA_URL = "https://pro.lceda.cn/editor?cll=debug";
const USER_DATA_DIR = path.join(__dirname, "..", ".browser-data");
const REMOTE_DEBUG_PORT = 9222;

let browser: Browser | null = null;
let page: Page | null = null;

/** 真正尝试 HTTP 请求 CDP /json/version，成功才算浏览器在线 */
function isCDPReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${REMOTE_DEBUG_PORT}/json/version`,
      { timeout: 2000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function getChromePath(): string {
  // 优先使用环境变量
  if (process.env["CHROME_PATH"]) return process.env["CHROME_PATH"];

  if (process.platform === "win32") {
    // 优先从注册表查（系统级和用户级安装都能找到）
    const regKeys = [
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
      "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
      // Edge 备选
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe",
    ];
    for (const key of regKeys) {
      try {
        const result = execSync(`reg query "${key}" /ve`, { encoding: "utf8", stdio: "pipe" });
        const match = result.match(/REG_SZ\s+(.+)/);
        if (match) {
          const p = match[1].trim();
          if (fs.existsSync(p)) return p;
        }
      } catch { /* 继续尝试 */ }
    }
    // 注册表找不到时回退到常见路径
    const candidates = [
      process.env["PROGRAMFILES"] + "\\Google\\Chrome\\Application\\chrome.exe",
      process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
      process.env["LOCALAPPDATA"] + "\\Google\\Chrome\\Application\\chrome.exe",
    ];
    const found = candidates.find((p) => p && fs.existsSync(p));
    if (found) return found;
    throw new Error("未找到 Chrome，请设置环境变量 CHROME_PATH 指定路径");
  }

  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) return found;
    throw new Error("未找到 Chrome，请设置环境变量 CHROME_PATH 指定路径");
  }

  // Linux：用 which 动态查找
  const linuxCandidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium-browser",
    "chromium",
    "microsoft-edge",
  ];
  for (const bin of linuxCandidates) {
    try {
      const result = execSync(`which ${bin} 2>/dev/null`, { encoding: "utf8" }).trim();
      if (result) return result;
    } catch { /* 继续尝试下一个 */ }
  }
  throw new Error("未找到 Chrome，请设置环境变量 CHROME_PATH 指定路径");
}

function launchChrome() {
  const chromePath = getChromePath();
  const child = spawn(chromePath, [
    `--remote-debugging-port=${REMOTE_DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
  ], { detached: true, stdio: "ignore" });
  child.unref();
}

async function connectCDP(): Promise<Browser> {
  // 最多重试 2 次，首次失败时清理旧连接后重试
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${REMOTE_DEBUG_PORT}`);
    } catch (err: any) {
      if (attempt === 0 && err.message?.includes("Browser context management")) {
        // 旧 CDP 连接残留，断开后重试
        if (browser) {
          await browser.close().catch(() => {});
          browser = null;
          page = null;
        }
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("CDP 连接失败");
}

export async function getPage(): Promise<Page> {
  if (browser && page) {
    try {
      await page.title();
      return page;
    } catch {
      // 连接已断开，清理后重新连接
      await browser?.close().catch(() => {});
      browser = null;
      page = null;
    }
  }

  if (!(await isCDPReachable())) {
    launchChrome();
    // 等待 CDP 真正可达，最多 20 秒
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await isCDPReachable()) break;
    }
    if (!(await isCDPReachable())) {
      throw new Error("Chrome 启动超时，CDP 端口未就绪");
    }
  }

  browser = await connectCDP();
  const contexts = browser.contexts();
  // 优先复用已有 context，避免触发 setDownloadBehavior 冲突
  if (contexts.length > 0) {
    const pages = contexts[0].pages();
    page = pages.length > 0 ? pages[0] : await contexts[0].newPage();
  } else {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
  }
  return page;
}

async function isLoggedIn(p: Page): Promise<boolean> {
  const count = await p.locator("#login-btn").count();
  if (count === 0) return true; // 元素不存在，已登录
  // 元素存在时再检查可见性
  const isVisible = await p.locator("#login-btn").isVisible().catch(() => false);
  return !isVisible;
}

export async function ensureLoggedIn(p: Page): Promise<boolean> {
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  if (await isLoggedIn(p)) return true;

  // 未登录，用 JS 点击绕过可见性限制
  await p.locator("#login-btn").evaluate((el: HTMLElement) => el.click());

  return false;
}

export async function navigateToEditor(p: Page): Promise<void> {
  if (!p.url().includes("pro.lceda.cn")) {
    for (let i = 0; i < 3; i++) {
      try {
        await p.goto(LCEDA_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        // 等待页面稳定
        await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
        return;
      } catch (err) {
        if (i === 2) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}

