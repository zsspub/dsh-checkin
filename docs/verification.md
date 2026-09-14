# 验证记录

## 主题表与打卡记录表拆分（2026-09-13）

存储改为 `checkin_topics` 五字段主题表和 `checkin_records` 四字段记录表，记录以 `(topic_id, date)` 为联合主键，增加 `(date, topic_id)` 索引。月历在 SQL 中筛选日期范围并按联合游标分页；重命名不改记录，补签不重写历史，撤销用记录版本条件 DELETE。删除主题采用单语句多表 DELETE，返回实际删除记录数。登录与初始化支持分别选择已有表、只创建缺失的另一张；旧版单表凭据回到设置页，不迁移或删除旧数据。

最终 `pnpm run check` 通过构建、Host/Client/测试类型检查、lint、127 项测试和打包检查，发布产物已重新生成，工具快照不变。覆盖双表字段/索引与旧 JSON 列拒绝、410 条范围记录分页、联合游标重复检测、日期下限、配额下撤销、父记录删除与补签竞争、记录版本保护、丢失写响应、实际级联删除计数、双表配额、部分建表失败与明确复用、旧凭据恢复、双表表单及同名拦截。测试使用内存 HTTP 模拟，不是实际 MySQL 执行证据。

在本机对 zss.pub 服务端现有 `validateSql` 执行了 CREATE TABLE 联合主键/索引、INSERT SELECT 顶层反连接和多表 DELETE 的验证，均通过其白名单。条件 INSERT 使用顶层 LEFT JOIN，而非 MySQL 不允许的目标表子查询；没有请求线上接口或依赖跨请求事务。

执行 `pnpm dsh plugin --profile web add /Users/bytedance/Github/dsh-checkin` 重新安装，确认本地 profile 仍链接当前仓库；重启 `pnpm dsh web --no-open` 后监听 `127.0.0.1:3080`，未认证连接 Remote 返回 HTTP 401。本次未提交真实 Key、未执行线上创建/迁移/删除。安装提示 peer dependency warning，未阻止安装或启动。

Browser 工具再次在启动阶段因 `sandboxCwd must be an absolute file URI` 失败。桌面/窄屏和明暗主题视觉验收仍未完成；表单行为有 jsdom 测试，不能替代真实浏览器及线上 MySQL 验证。以下单表说明保留为历史验证记录。

## Key 登录与首次初始化（2026-09-13）

新增打卡 Tab 登录、注册链接、Key 验证、已有库表连接、确认创建、连接信息和退出流程。使用 `ctx.credentials` 的插件专属记录，保留外部 Host 配置优先级，不混搭凭据。创建操作需用户确认，失败保留部分资源；不自动重发、不删除回滚。

`pnpm run check` 通过构建、Host/Client/测试类型检查、lint、108 项测试和打包内容检查。新增测试覆盖读取权限验证、401/403/503、凭据读写失败、记录恢复、退出不删除云端数据、Host 配置锁定、确认边界、精确建表字段、部分创建恢复、结果未知后显式连接、同名/未就绪资源、名称校验、配额预检、取消、注册链接、输入遮罩与清空、重试保留输入、无需重启进入日历及多 Tab 旧响应隔离。既有工具快照不变。界面静态检测未发现问题。

重新安装至本地 `web` profile，核对链接与登录页产物，重启 `pnpm dsh web --no-open` 后成功监听 `127.0.0.1:3080`。使用本次服务提供的正常登录交换，在内存中持有认证信息，实际调用 `/api/checkin/connection` 返回 HTTP 200 与 `{phase:"login",source:"none",revision:"none",writable:true}`；未认证调用返回 401。没有读取/打印宿主凭据文件，没有向线上发送数据库 Key 或创建资源。

Browser 工具在启动阶段因 `sandboxCwd must be an absolute file URI` 环境错误不可用。因此本次未完成真实浏览器桌面/窄屏与明暗主题视觉验收，也未使用真实 Key 验证线上初始化。UI 交互证据来自 jsdom 测试，不能替代浏览器视觉验收。

## 缺少数据库配置时的启动修复（2026-09-13）

复现并修复 `CheckinService` 构造阶段创建数据库客户端、因缺少 Key/UUID 而使整个 Host 插件树加载失败的问题。存储改为首次打卡请求时初始化；未配置或 UUID 无效时仅打卡请求返回 `checkin/invalid-config`，不发送 HTTP 请求，不回退 SQLite。失败初始化不缓存，取消请求与已释放的服务不会初始化存储。

`pnpm run check` 通过构建、Host/Client/测试类型检查、lint、81 项测试和打包内容检查。新增回归覆盖缺少 Key、缺少 UUID、两者都缺失、UUID 无效、进程环境补齐后重试、请求取消及服务释放，以及面板的本地化配置错误与只读重试。发布产物已重新生成，本地 Web profile 通过链接直接使用本仓库。

在 `/Users/bytedance/Github/deepseek-harness` 执行 `pnpm dsh web --no-open`，服务成功监听 `127.0.0.1:3080`，未再出现插件加载阶段的 `checkin/invalid-config`。未认证 HTTP 请求返回预期的 401，确认服务可响应且鉴权仍生效。SQLite experimental warning 仍存在，但不阻止启动。当前未配置真实数据库凭据，没有进行线上数据库读写或本次浏览器验收。

## Pub SQL 接入（2026-09-13）

按新版 pub-databases 协议替换已移除的 JSON records API。运行路径为概览、实际表 schema 和参数化 `POST /databases/:id/query`，不回退旧接口或 SQLite，不自动建表或迁移数据。

`pnpm run check` 通过构建、Host/Client/测试类型检查、lint、74 项测试和打包内容检查。新增/更新测试覆盖字段及单列唯一索引校验、212 条 SQL 主键分页、估算行数忽略、精确 COUNT 大整数处理、重复页与前后数量变化、列顺序与 JSON 值解析、参数化文本、物理软配额下禁止所有 UPDATE 而允许 DELETE、revision 条件写入与 affectedRows、SQL POST 读写错误区分、400/404/413/503/504、写后核验和不自动重发。原工具快照保持不变。

发布产物已重新生成，检查确认 Host 不包含 `node:sqlite`、`/records`、`nextCursor` 或 `maxRecordBytes`，浏览器及 Remote 参数未引入 Key。当前仍缺少 `PUB_DATABASE_KEY` 与 `PUB_DATABASE_ID`，因此这些验证使用 HTTP 模拟，不代表实际 MySQL 执行或线上联调已通过；没有读写、改表或迁移线上数据。建表模板与旧表升级限制见 README。

以下 JSON API 和 SQLite 记录仅保留为历史证据，不适用于当前 SQL 协议。

## Pub 数据库接入（2026-09-12）

存储已从本地 SQLite 替换为 `https://zss.pub/api/databases` HTTP API。`pnpm run check` 通过构建、Host/Client/测试类型检查、lint、46 项测试和 tarball 内容检查，发布用 `lib/` 已重新生成。随后补充默认配置与 Host 环境凭据启动测试，再次通过类型检查、lint 和全部 47 项测试。

本次数据库测试使用内存 HTTP 模拟：覆盖 Key 环境变量、固定服务地址和禁止重定向、112 条记录跨页读取、重复游标/记录/计数变化检测、服务禁用及库未就绪、权限与配额错误、UTF-8 计量和超额时缩小记录、写后读取核验、204 删除响应、网络结果未知时不重发、超时及取消。工具回放快照保持兼容，新增异步月历与远程错误提示测试。

当前环境未设置 `PUB_DATABASE_KEY` 和 `PUB_DATABASE_ID`，因此没有连接或改写线上数据，也没有执行本次真实模型或浏览器验收。接入线上仍需准备目标数据库与兼容表、设置读写 Key 和真实 UUID。以下记录为旧 SQLite 版本的历史验收，不是本次远程存储的线上验证。

## 历史验收

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
