# 本机 DSH 0.2.1-rc.3 兼容性

核查日期：2026-10-24。原基准：`6a0c92e5c3f6ae6427beb65ad24235a82a3cb512`（本次 fetch 的 `origin/main`）。仅适配本机已安装版本，不查询最新版、不升级 DSH。

## 适配依据

本机以下命令实际返回 `0.2.1-rc.3`：

```sh
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' --version
```

只读核对应用 `Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/`：

- 所用 DSH 运行时包为 `0.2.1-rc.3`；Cordis 为 `4.0.5`，Schemastery 为 `3.18.5`。
- `dsh-client-ui-sidebar-right/lib/client.js` 保留 `sidebarRightTabs.register`、`sidebarRight.openTab`，以及 `useTabInfo()` 返回的 `tab.visible` / `tab.signal`。无挂载会话时的错误仍为 `sidebarRight: no session surface is mounted`。
- `dsh-api-remotes/lib/client.js` 继续通过 `remote.$mount` 挂载生成描述；locale 客户端仍提供 `bind`。
- 应用前端 `dsh-web-frontend/dist/assets/index-BXV-oxvX.js` 内置共享模块表仍提供 `@deepseek-ai/dsh-client-ui-primitives`、slots、Cordis、React 与 JSX runtime。保留现有宿主组件及 inject / external 配置。
- 应用 `runtime/versions.json` 记录 Node `24.21.0`、pnpm `11.28.5`；开发构建使用本机 Node `24.22.0` 和 pnpm `11.28.5`。

应用精简包没有完整客户端类型声明；类型检查使用与本机版本精确对应的 npm 包，并结合上述应用内实现核对。

## 改动与验证

仅将直接 DSH peer/dev 依赖固定为 `0.2.1-rc.3`，由 pnpm 同步 lockfile，并重新构建 `lib/`。Cordis、Schemastery、其他直接依赖及业务代码不变；数据库 schema 和数据迁移规则不变。

重建后 Host、Remote 和客户端 JS 内容均与原基准一致；`lib/client.js.map` 的协议依赖来源路径由 `rc.2` 更新为 `rc.3`。

```sh
pnpm install --lockfile-only
pnpm install --frozen-lockfile
pnpm check
# 明确暂存本次文件后，与暂存的 lib/ 比较重建结果：
pnpm artifacts:check
git diff --exit-code
git ls-files --others --exclude-standard
git write-tree
```

`pnpm check` 已通过构建、类型检查、lint、5 个测试文件共 28 项测试和 pack dry-run。现有 Remote 严格 codec、SQLite、工具、控制器和面板测试全部保留；未放宽检查配置。

## 验证边界

本次没有提交、推送、安装插件、重启或修改 DSH，也没有访问真实插件数据库或 profile。自动化与 API 核对不等同于真实桌面面板验收；原生界面、实际 Remote 连接和工具调用仍需安装后验证。

历史 `rc.2` 安装及回滚记录保留在 [原交接文档](desktop-0.2.1-rc.2.md)，其中版本、profile 和数据库状态均为当时记录，不代表本次现状。
