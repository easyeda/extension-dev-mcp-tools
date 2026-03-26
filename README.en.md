English | [中文](./README.md)

# extension-dev-mcp-tools

An MCP (Model Context Protocol) service for developing and debugging [JLCEDA & EasyEDA Pro](https://pro.easyeda.com/) extensions. With this MCP, AI Agents can automatically import plugins, collect browser console logs, and debug extensions — hands-free.

## Features

| Tool | Description |
|------|-------------|
| `import_plugin` | Import an `.eext` extension file into JLCEDA Pro |
| `dev_plugin` | Import a plugin and start continuous console error log monitoring |
| `get_console_logs` | Retrieve browser console output (supports filtering, pagination, and cache clearing) |

## Installation

### 1. Build the MCP

Choose any location to store the MCP, then run the following commands in your terminal:

```bash
git clone https://github.com/easyeda/extension-dev-mcp-tools
cd ./extension-dev-mcp-tools
npm install
npm run build
```

Build output is located in the `dist/` folder.

### 2. Configure MCP

Generate the MCP config files:

```bash
npm run mcp-config
```

This creates `mcp-config.json` and `opencode.json`.  
Import the generated config file into your AI Agent following its documentation.

For example:

> **QwenCode**  
> **Project scope:** `.qwen/settings.json` in the project root  
> **User scope:** `~/.qwen/settings.json` (applies to all projects on this machine)  
> Simply rename the generated `mcp-config.json` to `settings.json` and place it at the corresponding path.

> **OpenCode**  
> **Project scope:** `opencode.json` in the project root  
> **User scope:** `~/.config/opencode/opencode.json` (applies to all projects on this machine)  
> Simply place the generated `opencode.json` at the corresponding path.

> **Kiro / Trae**  
> Copy the contents of the generated `mcp-config.json` into the MCP configuration page of the corresponding editor.

Restart your AI Agent after configuration.

### 3. Usage

Open your plugin source code folder and ask the AI:  
`Import this plugin`, `Debug this plugin`, `Get browser logs`  
The corresponding tools will be called automatically:  
`import_plugin`, `dev_plugin`, `get_console_logs`  

To specify a browser, tell the AI:  
`Import this plugin using Edge`, `Debug this plugin using Chrome`  
`Get Edge browser logs`, `Get error logs from Chrome`  

## How It Works

1. By default, launches Chrome with remote debugging (port 9222-9231), or connects to an already running instance. A specific browser can be specified via the AI.  
2. Opens JLCEDA Pro in debug mode. If not logged in, a QR code login page is displayed automatically.  
3. Login state is cached in the `.browser-data/` directory — no repeated logins needed.  
4. Uses Playwright to control the browser and complete the plugin upload flow.  
5. After `import_plugin`, the tool registers `console` and `pageerror` event listeners on the page, capturing all `log` / `warn` / `error` / `info` output (up to 500 entries cached).  
6. Use `get_console_logs` at any time to pull cached logs — filter by type or keyword, limit the number of results, or clear the cache after retrieval.  
7. The AI Agent analyzes the collected logs to diagnose plugin behavior and adjust source code accordingly.  

## Requirements

- Node.js 20.17.0+  
- Google Chrome / Microsoft Edge

## Browser Path Configuration (Optional)

The tool automatically detects the browser installation path:  
- **Windows:** Checks the registry (`App Paths`) and common install locations  
- **macOS:** `/Applications/Google Chrome.app/...`  
- **Linux:** Uses `which` to find `google-chrome` / `chromium`  

If auto-detection fails or you need a specific browser, simply tell the AI:  
`Import this plugin using Edge`  
The AI will find the browser path and import automatically.

## Tested Platforms

✅ OpenClaw
✅ OpenCode
✅ QwenCode
✅ Kiro
✅ Trae

## Demo Video

Based on OpenCode:

https://github.com/user-attachments/assets/45a66a9c-96e5-43a4-a9af-c94d2007f1a3
