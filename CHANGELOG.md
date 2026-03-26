# 1.3.4
## 新增
- 支持通过对话的形式选择调试浏览器
- 支持多浏览器调试，可同时打开Edge和Chrome浏览器
## 优化
- 支持单独调用`get_console_logs`，不再依赖于`dev_plugin`、 `import_plugin`导入后才支持调试

# 1.3.3
## 新增
- `dev_plugin`修改为调试触发，新增支持连续5分钟的error日志监听，可在导入后5分钟内测试扩展，如果出现error则继续监听5s日志后返回Agent执行错误分析并修复。
- 新增支持窗口比例较小时高级菜单即便被隐藏也能正常执行插件导入
- 新增自动构建opencode的MCP配置文件
## 修复
- 补充浏览器启动参数，避免浏览器进入向导界面导致工具失效

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
