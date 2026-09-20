# 验证记录

## SQLite 数据导入导出（2026-09-20）

右侧打卡面板参照 `dsh-personal-todo` 增加“数据”菜单、宿主原生确认模态框以及独立的成功／失败反馈。版本化 JSON 全量导出格式为 `dsh-checkin`、版本为 `2`，包含导出时间、全部主题、全部完成记录及其原始创建时间；导入同时兼容版本 1，并在浏览器与 Host 限制为 20 MiB。浏览器先用共享解析器校验并预览文件名、主题数和记录数，用户显式确认后 Host 再次严格校验。导入采用增量合并：已有主题 ID 整项跳过且不覆盖本地修改，其他主题及其记录在单个事务内新增；新增主题名称冲突会使整个导入回滚。不提供模型工具入口。

Node `v24.13.0` 下 `CI=true pnpm run check` 已通过 Host/Client 构建、类型检查、lint、4 个测试文件共 26 项测试及打包检查。新增回归覆盖重复导入幂等、同 ID 本地修改不覆盖、版本 1 兼容、名称冲突整笔回滚、数据菜单下载、取消后重选及确认后成功反馈。

正式 `web` profile 重新加载新 bundle 后完成真实 Playwright E2E：从“数据”菜单导出版本 2 JSON，客户端 Modal 正确预览 4 个主题和 407 条记录；同一备份连续确认导入两次，均返回“新增 0 个主题和 0 条记录，跳过 4 个已有主题”。刷新页面后仍显示“全部主题”及原有 4 个主题，再次导出的主题和完成记录与首次导出语义一致。页面无控制台错误或未捕获异常。验收产物位于 `/private/tmp/dsh-checkin-export-before.json`、`/private/tmp/dsh-checkin-export-after.json` 和 `/private/tmp/dsh-checkin-import-export-e2e.png`。

增量导入 E2E 后真实 SQLite 保持 `PRAGMA user_version = 2`、4 个主题、407 条记录，无孤立记录，`PRAGMA integrity_check` 返回 `ok`。主题、完成日期及全部创建／更新时间的逐行 SHA-256 为 `6081e738a65cbd3d1af65db13c9a74f61c87a14e5bdbf9c19f292b4a9d848077`，与 E2E 前通过 SQLite 在线备份生成的 `/private/tmp/dsh-checkin-before-incremental-import.sqlite3` 完全一致。

## 恢复纯 SQLite 与 schema v2 兼容（2026-09-20）

移除 zss.pub、连接凭据、远端初始化和镜像切换后，存储仅使用 `$DSH_HOME/checkin/checkin.sqlite3`。首次直接回退到旧版 SQLite v1 实现时，真实数据库已由此前双存储版本升级为 `PRAGMA user_version = 2`，因此插件启动报 `checkin/newer-schema`。当前实现正式采用现有 `checkin_topics` / `checkin_records` v2 双表作为纯 SQLite schema；v2 数据库直接打开，v1 `topics` / `completions` 在单个事务中保留主题、时间戳和完成日期迁移到 v2，更新版本后才删除旧表，更高版本仍拒绝修改。

Node `v24.13.0` 下 `pnpm run check` 通过 Host/Client 构建、类型检查、lint、4 个测试文件共 26 项测试及打包检查。新增回归覆盖 v1 到 v2 的保留数据迁移。对真实数据库的副本执行当前 `CheckinStore` 读取，得到 4 个主题和 407 条记录；随后以原命令 `pnpm dsh web --no-open` 重启 `web` profile，Loader 无插件失败并监听 `127.0.0.1:3080`。真实数据库保持 `user_version = 2`、4 个主题、407 条记录，`PRAGMA integrity_check` 返回 `ok`。

首次只验证 Host 启动遗漏了 Web 客户端激活失败。真实 Playwright 冷启动复现到 `dsh-checkin: failed`，通过 Chrome 调试协议取得原始异常：`typert: dsh-checkin#checkin/create result strict codec has no create() factory`。根因是 `0.1.5-rc.1` Typert 生成器产出的严格 codec 只有 `schema`，而当前 Harness 注册表要求 `create()` 工厂。升级 `@deepseek-ai/dsh-typert-generator` 与 `@deepseek-ai/dsh-typert-protocol` 至 `0.1.6-alpha.2` 后，生成的 13 个严格 codec 均带 `create()`；生成脚本同时加入数量断言，后续不兼容产物会在构建阶段直接失败。修复后的真实页面无 `Failed to load plugins`、无控制台错误，并完成打开面板、读取现有 4 个主题、新建临时主题、当天打卡、撤销和删除的完整 UI 流程。流程结束后数据库仍为 4 个主题、407 条记录，无临时主题，完整性为 `ok`。

验收日期：2026-09-10（北京时间）。验证代码提交：`bb9e46c3b2b42224d7d45e12f897e3450695ccc2`。文档与媒体在后续提交附加，运行代码未改变。

## 安装与环境

在干净提交上执行 `pnpm run build`，确认 `lib/` 与提交内容一致，再执行 `pnpm pack`。使用发布版 DSH `0.1.5-alpha.1` 和 Node `v24.13.0`，通过 `dsh plugin --profile web add <tarball>` 安装；已核对安装后的 Host、tools、client 与生成 Remote 文件 SHA-256 和提交产物一致。

正式运行位于本仓库忽略的 `.verification/` 下，使用全新的 `final-home`、`final-agents`、`final-workspace`，由 `dsh --profile web` 启动，origin 为 `http://127.0.0.1:39878`。全部 GIF 帧来自同一工作区、会话和数据目录；中间有一次用于持久化验收的正常 Host 停止及重启。

浏览器使用现有 Chrome profile 的专用新 origin 与新标签页，未使用全新 Chrome profile。录制页面截图尺寸为 2560×1267；另验证 390×844 窄屏，页面宽度与滚动宽度均为 390。验收使用 DSH 自带的 browser directory-picker 替换原生目录选择器。真实模型通过现有 credential provider 访问 DeepSeek-V4-Flash（High），没有复制或发布凭据。

## 真实模型与 UI 场景

两个真实模型回合共 12 步、13 次工具调用；Session 日志中有对应的 13 条 `tool/call` 和 13 条 `tool/result`。全部六种插件工具均被调用：create 3 次、list 2 次、update 1 次、delete 1 次、set 3 次、query 3 次。

| 场景 | 结果 |
| --- | --- |
| 空数据库打开侧栏打卡入口 | 展示空状态与新建入口 |
| 对话创建阅读、运动，完成今天阅读、补签昨天运动并查询 | 月历显示两个主题及对应日期完成数 |
| UI 完成今天运动、补签昨天阅读 | 总览即时更新为 2/2 |
| 单主题筛选、前后月份、回到今天 | 显示对应主题状态和月份 |
| 查看未来日期 | 可以选中；完成操作禁用 |
| 新建同名主题失败后改名重试 | 提示同名错误，输入保留，修改后成功 |
| UI 创建、重命名并完成饮水主题，再确认删除 | 主题及完成记录删除，总览分母恢复为 2 |
| 刷新浏览器、重新打开抽屉 | 主题和打卡状态恢复 |
| 对话撤销昨天阅读、运动改名锻炼、创建并删除临时主题、查询 | 抽屉在打开状态自动读取变化；撤销与改名保留正确历史 |
| 正常停止及重启 Host | 断连提示后恢复；数据库前后快照完全一致 |
| 390px 窄屏 | 抽屉铺满视口，未发现横向溢出 |

重启后的有效主题为「阅读」「锻炼」，共三条完成记录：锻炼 2026-09-09、锻炼 2026-09-10、阅读 2026-09-10。昨天阅读的撤销状态和已删除主题均未恢复。

## 演示记录

以下 GIF 由同一次真实运行的 25 张页面截图顺序编码，每张停留 2 秒，总长 50 秒（2560×1268，约 2.2 MB）。它是截图序列演示，不是连续视频，也不表示模型响应速度。画面包括请求、模型执行及结果、UI 操作、刷新和 Host 重启恢复。

![真实模型及打卡抽屉验收](media/checkin-e2e.gif)

[桌面截图](media/desktop.png) · [窄屏截图](media/mobile.png) · [脱敏工具调用及持久化证据](evidence.json)

## 自动化

`pnpm run check` 已通过构建、Host/Client/测试类型检查、lint、14 项测试和 tarball 内容检查。覆盖真实 SQLite 持久化、主题 CRUD、打卡幂等和撤销、级联删除、日期校验、未来日期拒绝、北京时间午夜、闰年与跨月、数据库重开、更高 schema 拒绝、请求竞态、UI 失败保留输入与键盘焦点恢复。

工具输出快照是无 API key 的确定性工具回放，与上述真实模型验收分别提供证据。验收范围是实际安装后的 DSH Web profile；没有验证原生桌面应用或原生目录选择器。数据库、原始会话、认证信息与运行目录均未纳入版本控制。

## 样式调整复验（2026-09-10）

本地样式修订对齐 Settings 入口的 42px 高度与 14px 字号，为原生主题筛选增加 Lucide 箭头，并限定空状态插画的间距，消除按钮内加号的垂直偏移。`pnpm run check` 通过全部 14 项测试。重新打包后安装至独立 `style-home` Web profile（39879），实际验证侧栏入口、空状态新建与主题筛选；DOM 测量确认两个入口尺寸一致，按钮图标下边距为 0。本次仅验证样式和手动操作，没有重复模型回合。

![样式修订：入口、空状态与主题筛选的三帧演示](media/checkin-style.gif)

## 宿主右侧 Tab 迁移复验（2026-09-11）

本地未提交改动升级至 DSH `0.1.5-rc.1`，并将自建 `shell.overlay` 抽屉迁移到宿主 `sidebar.right.pane.tab`。`pnpm run check` 通过构建、Host/Client/测试类型检查、lint、19 项测试和 tarball 内容检查；定向 `npm ls ... --all` 也确认直接与传递 DSH peer 均解析到 `0.1.5-rc.1`。新增测试覆盖隐藏 Tab 取消请求，以及分栏中的两个打卡 Tab 独立维护月份和请求状态。

将构建后的 tarball 安装到隔离 `checkin-right` Web profile，使用 DSH 本地构建 `0.1.5-rc.1-aa8262e` 与 Node `v24.13.0` 在 `http://127.0.0.1:39880` 做真实浏览器复验。已确认：左侧“打卡”入口能打开宿主 Tab；关闭唯一 Tab 形成空右栏后可再次打开；宿主提供关闭、分栏、全屏和收起控件；两个 Pane 可同时打开打卡 Tab，一个切到 2026 / 08 时另一个仍停留在 2026 / 09；新建主题后月历即时出现；完成当天打卡后显示 `1 / 1 已完成`。无会话页面点击入口不会抛出未捕获错误。本次未重复真实模型回合。
