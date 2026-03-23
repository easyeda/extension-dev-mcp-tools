English | [中文](./README.md)

# extension-dev-mcp-tools

An MCP (Model Context Protocol) service for developing and debugging [JLCEDA & EasyEDA Pro](https://pro.easyeda.com/) extensions. With this MCP, AI Agents can automatically import plugins, collect browser console logs, and debug extensions — hands-free.

## Features

| Tool | Description |
|------|-------------|
| `import_plugin` | Import an `.eext` extension file into JLCEDA Pro |
| `dev_plugin` | Import a plugin and start continuous console error log monitoring |
| `get_console_logs` | Retrieve browser console output (supports filtering, pagination, and cache clearing) |

## How It Works

1. Automatically launches Chrome with remote debugging (port 9222), or connects to an already running instance.
2. Opens JLCEDA Pro in debug mode. If not logged in, a QR code login page is displayed automatically.
3. Login state is cached in the `.browser-data/` directory — no repeated logins needed.
4. Uses Playwright to control the browser and complete the plugin upload flow.
5. After `import_plugin`, the tool registers `console` and `pageerror` event listeners on the page, capturing all `log` / `warn` / `error` / `info` output (up to 500 entries cached).
6. Use `get_console_logs` at any time to pull cached logs — filter by type or keyword, limit the number of results, or clear the cache after retrieval.
7. The AI Agent analyzes the collected logs to diagnose plugin behavior and adjust source code accordingly.

## Requirements

- Node.js 20.17.0+
- Google Chrome

### Custom Chrome Path (Optional)

The tool automatically detects Chrome's installation path:
- **Windows:** Checks the registry (`App Paths`) and common install locations
- **macOS:** `/Applications/Google Chrome.app/...`
- **Linux:** Uses `which` to find `google-chrome` / `chromium`

If auto-detection fails or you need a specific browser, set the environment variable:

```bash
# Windows (PowerShell)
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"

# macOS / Linux
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Tested Platforms

✅ OpenClaw
✅ OpenCode
✅ QwenCode
✅ Kiro
✅ Trae

## Install & Build

```bash
git clone https://github.com/easyeda/extension-dev-mcp-tools
cd extension-dev-mcp-tools
npm install
npm run build
```

Build output is located in the `dist/` folder.

## MCP Configuration

Generate the MCP config file:

```bash
npm run mcp-config
```

This creates `mcp-config.json`. Import it into your AI Agent following the agent's documentation.

## Demo Video

Based on OpenCode:  

https://github.com/user-attachments/assets/45a66a9c-96e5-43a4-a9af-c94d2007f1a3

