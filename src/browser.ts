import { chromium, Browser, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { execSync, spawn } from "child_process";
import * as http from "http";

const LCEDA_URL = "https://pro.lceda.cn/editor?cll=debug";
const BASE_USER_DATA_DIR = path.join(__dirname, "..", ".browser-data");
const DEFAULT_DEBUG_PORT = 9222;

// 防止 Playwright CDP 断开时的未捕获异常导致进程崩溃
process.on("unhandledRejection", (err: any) => {
  const msg = err?.message || String(err);
  if (msg.includes("Connection closed") || msg.includes("Target closed") || msg.includes("Browser closed") || msg.includes("Browser has been closed")) {
    console.error("[browser] suppressed CDP disconnect error:", msg);
    return;
  }
  console.error("[browser] unhandled rejection:", err);
});

process.on("uncaughtException", (err: any) => {
  const msg = err?.message || String(err);
  if (msg.includes("Connection closed") || msg.includes("Target closed") || msg.includes("Browser closed") || msg.includes("Browser has been closed")) {
    console.error("[browser] suppressed CDP uncaught exception:", msg);
    return;
  }
  console.error("[browser] uncaught exception:", err);
  process.exit(1);
});

/** 每个浏览器路径对应一个独立的连接实例 */
interface BrowserInstance {
  browser: Browser | null;
  page: Page | null;
  port: number;
  userDataDir: string;
  browserPath: string;
}

/** 浏览器路径 -> 实例映射 */
const instances = new Map<string, BrowserInstance>();

/** 当前活跃的浏览器路径 */
let currentBrowserPath: string | null = null;

/** 根据浏览器路径生成稳定的端口号（9222-9322 范围） */
function portForPath(browserPath: string): number {
  let hash = 0;
  for (let i = 0; i < browserPath.length; i++) {
    hash = ((hash << 5) - hash + browserPath.charCodeAt(i)) | 0;
  }
  return DEFAULT_DEBUG_PORT + (Math.abs(hash) % 100);
}

/** 根据浏览器路径获取或创建实例配置 */
function getInstance(browserPath: string): BrowserInstance {
  let inst = instances.get(browserPath);
  if (!inst) {
    const port = portForPath(browserPath);
    // 用浏览器名称区分 user-data-dir，避免冲突
    const name = path.basename(browserPath, path.extname(browserPath)).toLowerCase();
    const userDataDir = path.join(BASE_USER_DATA_DIR, name);
    inst = { browser: null, page: null, port, userDataDir, browserPath };
    instances.set(browserPath, inst);
  }
  return inst;
}

function isCDPReachableOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}/json/version`,
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

/** 切换当前活跃浏览器，不关闭旧浏览器 */
export async function setBrowserPath(p: string | undefined): Promise<boolean> {
  if (!p) return false;
  if (currentBrowserPath === p) return false;
  currentBrowserPath = p;
  return true;
}

function getChromePath(): string {
  // 1. 运行时参数覆盖 > 2. 环境变量 > 3. 自动检测
  if (currentBrowserPath) return currentBrowserPath;
  if (process.env["CHROME_PATH"]) return process.env["CHROME_PATH"];

  if (process.platform === "win32") {
    const regKeys = [
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
      "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
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

  const linuxCandidates = [
    "google-chrome", "google-chrome-stable",
    "chromium-browser", "chromium", "microsoft-edge",
  ];
  for (const bin of linuxCandidates) {
    try {
      const result = execSync(`which ${bin} 2>/dev/null`, { encoding: "utf8" }).trim();
      if (result) return result;
    } catch { /* 继续尝试下一个 */ }
  }
  throw new Error("未找到 Chrome，请设置环境变量 CHROME_PATH 指定路径");
}

function launchBrowser(inst: BrowserInstance) {
  // 确保 user-data-dir 存在
  if (!fs.existsSync(inst.userDataDir)) {
    fs.mkdirSync(inst.userDataDir, { recursive: true });
  }
  const child = spawn(inst.browserPath, [
    `--remote-debugging-port=${inst.port}`,
    `--user-data-dir=${inst.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
  ], { detached: true, stdio: "ignore" });
  child.unref();
}

async function connectCDP(port: number): Promise<Browser> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (err: any) {
      if (attempt === 0 && err.message?.includes("Browser context management")) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("CDP 连接失败");
}

export async function getPage(): Promise<Page> {
  const browserPath = getChromePath();
  const inst = getInstance(browserPath);

  // 尝试复用已有连接
  if (inst.browser && inst.page) {
    try {
      await inst.page.title();
      return inst.page;
    } catch {
      if (inst.browser) {
        try { inst.browser.removeAllListeners(); } catch { /* ignore */ }
      }
      inst.browser = null;
      inst.page = null;
    }
  }

  // 启动浏览器（如果端口未被占用）
  if (!(await isCDPReachableOnPort(inst.port))) {
    launchBrowser(inst);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await isCDPReachableOnPort(inst.port)) break;
    }
    if (!(await isCDPReachableOnPort(inst.port))) {
      throw new Error(`浏览器启动超时，CDP 端口 ${inst.port} 未就绪`);
    }
  }

  inst.browser = await connectCDP(inst.port);
  const contexts = inst.browser.contexts();
  if (contexts.length > 0) {
    const pages = contexts[0].pages();
    inst.page = pages.length > 0 ? pages[0] : await contexts[0].newPage();
  } else {
    const ctx = await inst.browser.newContext();
    inst.page = await ctx.newPage();
  }
  return inst.page;
}

async function isLoggedIn(p: Page): Promise<boolean> {
  const count = await p.locator("#login-btn").count();
  if (count === 0) return true;
  const isVisible = await p.locator("#login-btn").isVisible().catch(() => false);
  return !isVisible;
}

export async function ensureLoggedIn(p: Page): Promise<boolean> {
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  if (await isLoggedIn(p)) return true;
  await p.locator("#login-btn").evaluate((el: HTMLElement) => el.click());
  return false;
}

export async function navigateToEditor(p: Page): Promise<void> {
  if (!p.url().includes("pro.lceda.cn")) {
    for (let i = 0; i < 3; i++) {
      try {
        await p.goto(LCEDA_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
        return;
      } catch (err) {
        if (i === 2) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}
