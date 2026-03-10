# 1.3.2
## 修复
- 修复关闭浏览器后再次调用报 `ECONNREFUSED` 的问题
- Chrome 路径查找优化，支持三平台自动检测：
  - Windows：优先查注册表 `App Paths`（覆盖系统级和用户级安装），回退到常见路径
  - macOS：按优先级检查 Chrome / Chromium / Edge
  - Linux：用 `which` 动态查找，覆盖各发行版差异（`google-chrome`、`chromium-browser`、`chromium` 等）
  - 所有平台支持环境变量 `CHROME_PATH` 手动指定路径
- `import_plugin` / `dev_plugin` 工具描述中增加产物位置及后缀提示以便Agent理解查找


# 1.3.1
## 新增
- `import_plugin` 工具：将本地插件文件导入到嘉立创EDA专业版
- `dev_plugin` 工具：导入插件并开启浏览器控制台日志监听
- `get_console_logs` 工具：获取控制台日志，支持过滤、限制条数、清空缓存
- 自动启动 Chrome 并通过 CDP 远程连接
- 登录状态持久化缓存，扫码登录后无需重复登录
- `generate-mcp-config` 脚本，自动生成 MCP 配置文件
