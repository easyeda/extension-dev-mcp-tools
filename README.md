# extension-dev-mcp-tools

用于 嘉立创EDA & EasyEDA 专业版扩展开发与调试的 MCP 服务。使用此MCP可以实现通过 AI Agent 自动完成插件导入、浏览器控制台日志采集等操作，由AI自动开发、构建、调试插件。

## 功能

| 工具 | 说明 |
|------|------|
| `import_plugin` | 自动将eext导入到嘉立创EDA专业版 |
| `dev_plugin` | 导入插件并开启控制台错误日志持续监听 |
| `get_console_logs` | 获取浏览器控制台输出（支持过滤、分页、清空） |

## 工作原理

1. 自动启动 Chrome（开启远程调试端口 9222），或连接已运行的实例
2. 自动在浏览器中打开嘉立创EDA专业版调试模式，未登录时自动弹出扫码登录页面
3. 登录状态缓存在 `.browser-data/` 目录，后续无需重复登录
4. 通过 Playwright 操作浏览器完成插件上传流程
5. `import_plugin` 导入后自动注册页面 `console` 和 `pageerror` 事件监听，捕获所有 log / warn / error / info 输出，最多缓存 500 条
6. 通过 `get_console_logs` 随时拉取缓存日志，支持按类型或关键词过滤、限制返回条数、获取后清空缓存
7. AI Agent可按获取到的日志情况分析插件运行状态，以便对插件源码调整

## 环境要求

- Node.js 20.17.0+
- Google Chrome  

### 调试用浏览器路径配置（可选）

工具会自动查找 Chrome 安装路径：
- Windows：查注册表 `App Paths` 或常见安装位置
- macOS：`/Applications/Google Chrome.app/...`
- Linux：通过 `which` 查找 `google-chrome` / `chromium` 

如果自动检测失败，或需要使用特定浏览器，可设置环境变量：

```bash
# Windows (PowerShell)
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"

# macOS / Linux
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 已测试的平台
  
✅OpenClaw  
✅OpenCode
✅Kiro  
✅Trae  
✅QwenCode  

## 安装

```bash
npm install
npm run build
```

## 配置 MCP

生成 MCP 配置文件：

```bash
npm run mcp-config
```

将生成的MCP配置文件```mcp-config.json```按照你所使用的AI Agent提供的文档导入


## 使用示例

在 AI 对话中：

```
帮我导入插件
```
![img](https://github.com/user-attachments/assets/adebd86a-da60-4653-abd5-ec56943823d4)

```
已完成登录
```

![img](https://github.com/user-attachments/assets/861ee48e-6202-45e4-a418-ad178f90ba30)

```
分析下现在的日志
```
![img](https://github.com/user-attachments/assets/1aac01ee-18ac-4bb4-95c8-e3da444aac30)





