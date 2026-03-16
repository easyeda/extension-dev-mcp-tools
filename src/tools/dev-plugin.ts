import * as fs from "fs";
import * as path from "path";
import { Page } from "playwright";
import { getPage, navigateToEditor, ensureLoggedIn } from "../browser.js";

interface ConsoleEntry {
  timestamp: string;
  type: string;
  text: string;
}

const consoleLogs: ConsoleEntry[] = [];
const MAX_LOGS = 500;
let listening = false;

function startConsoleListener(p: Page) {
  if (listening) return;
  listening = true;

  p.on("console", (msg) => {
    consoleLogs.push({
      timestamp: new Date().toISOString(),
      type: msg.type(),
      text: msg.text(),
    });
    if (consoleLogs.length > MAX_LOGS) {
      consoleLogs.splice(0, consoleLogs.length - MAX_LOGS);
    }
  });

  p.on("pageerror", (err) => {
    consoleLogs.push({
      timestamp: new Date().toISOString(),
      type: "error",
      text: err.message,
    });
  });
}

/** 执行插件导入操作（共用逻辑） */
async function doImport(p: Page, pluginPath: string): Promise<string> {
  await navigateToEditor(p);

  if (!(await ensureLoggedIn(p))) {
    throw new Error("嘉立创EDA未登录，请先在浏览器中完成登录后再继续操作。");
  }

  // 窗口小时"高级"菜单可能藏在"更多"按钮里，需要先展开
  const moreButton = p.locator('.tool-bottom-menu-more_SoDfO');
  const moreContainer = p.locator('.tool-bottom-menu-more-container_NmJv7');
  const advancedMenu = p.locator('span[data-test="Advanced"]');
  const advancedInMore = moreContainer.locator('span[data-test="Advanced"]');
  
  // 尝试直接点击高级菜单
  try {
    await advancedMenu.click({ timeout: 2000 });
  } catch {
    // 如果失败，说明高级菜单藏在"更多"里
    const containerVisible = await moreContainer.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.visibility === 'visible';
    }).catch(() => false);
    
    if (!containerVisible) {
      await moreButton.click();
      await moreContainer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }
    // 使用 JS 点击高级菜单
    await advancedInMore.evaluate((el: HTMLElement) => el.click());
  }
  
  await p.waitForTimeout(300); // 等待高级菜单展开
  await p.getByText("扩展管理器", { exact: false }).click({ timeout: 10000 });

  const modal = p.locator("[class*='lc_modal_dialog']").first();
  await modal.waitFor({ state: "visible", timeout: 10000 });

  const [fileChooser] = await Promise.all([
    p.waitForEvent("filechooser", { timeout: 10000 }),
    modal.locator("button", { hasText: "导入" }).click(),
  ]);
  await fileChooser.setFiles(pluginPath);
  await p.waitForTimeout(2000);

  const closeBtn = modal.locator("[class*='close']").first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  } else {
    await p.keyboard.press("Escape");
  }
  await p.waitForTimeout(300);

  return path.basename(pluginPath);
}

/** import_plugin：导入插件并开启控制台监听，立即返回 */
export async function importPlugin(args: { pluginPath: string }) {
  if (!fs.existsSync(args.pluginPath)) {
    return { type: "text" as const, text: `文件不存在: ${args.pluginPath}` };
  }

  const p = await getPage();

  try {
    consoleLogs.length = 0;
    startConsoleListener(p);
    const name = await doImport(p, args.pluginPath);
    return {
      type: "text" as const,
      text: `插件导入成功: ${name}。已开启控制台监听，可通过 get_console_logs 获取调试日志。`,
    };
  } catch (error: any) {
    return { type: "text" as const, text: error.message.includes("未登录") ? error.message : `导入失败: ${error.message}` };
  }
}

/** dev_plugin：导入插件后持续监听，等到出现 error 日志才返回 */
export async function devPlugin(args: { pluginPath: string; timeout?: number }) {
  if (!fs.existsSync(args.pluginPath)) {
    return { type: "text" as const, text: `文件不存在: ${args.pluginPath}` };
  }

  const p = await getPage();

  try {
    consoleLogs.length = 0;
    startConsoleListener(p);
    const name = await doImport(p, args.pluginPath);

    // 等待 error 日志出现，超时则返回无错误
    // 导入后 5 秒内的错误忽略（可能是其他扩展的残留错误）
    const maxWait = (args.timeout || 300) * 1000;
    const startTime = Date.now();
    const graceEnd = startTime + 5000;

    const errorLogs = await new Promise<ConsoleEntry[]>((resolve) => {
      let collectDeadline: number | null = null;

      const interval = setInterval(() => {
        const errors = consoleLogs.filter(
          (l) => l.type === "error" && new Date(l.timestamp).getTime() >= graceEnd
        );

        if (errors.length > 0 && collectDeadline === null) {
          // 收到第一条 error，再等 5 秒收集更多
          collectDeadline = Date.now() + 5000;
        }

        if (collectDeadline !== null && Date.now() >= collectDeadline) {
          // 5 秒收集窗口结束，返回所有 error
          clearInterval(interval);
          const allErrors = consoleLogs.filter(
            (l) => l.type === "error" && new Date(l.timestamp).getTime() >= graceEnd
          );
          resolve(allErrors);
        } else if (Date.now() - startTime > maxWait) {
          clearInterval(interval);
          resolve([]);
        }
      }, 500);
    });

    if (errorLogs.length > 0) {
      return {
        type: "text" as const,
        text: `插件 ${name} 导入后检测到 ${errorLogs.length} 条错误:\n${formatLogs(errorLogs)}`,
      };
    }

    return {
      type: "text" as const,
      text: `插件 ${name} 导入成功，监听 ${args.timeout || 300} 秒内未检测到错误。`,
    };
  } catch (error: any) {
    return { type: "text" as const, text: error.message.includes("未登录") ? error.message : `导入失败: ${error.message}` };
  }
}

/** 获取控制台日志 */
export async function getConsoleLogs(args: { clear?: boolean; filter?: string; count?: number }) {
  const count = args.count || 50;
  let logs = consoleLogs.slice(-count);

  if (args.filter) {
    const f = args.filter.toLowerCase();
    logs = logs.filter(
      (l) => l.type.includes(f) || l.text.toLowerCase().includes(f)
    );
  }

  const result = formatLogs(logs);

  if (args.clear) {
    consoleLogs.length = 0;
  }

  return {
    type: "text" as const,
    text: logs.length === 0
      ? "暂无控制台日志。确保已通过 dev_plugin 导入插件并开启监听。"
      : `控制台日志(${logs.length}条):\n${result}`,
  };
}

function formatLogs(logs: ConsoleEntry[]): string {
  if (logs.length === 0) return "(空)";
  return logs
    .map((l) => `[${l.timestamp}] [${l.type}] ${l.text}`)
    .join("\n");
}
