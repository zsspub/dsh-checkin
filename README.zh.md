# DSH 打卡

[English](README.md) | 中文

通过 DSH 对话或宿主右侧打卡 Tab 管理日常打卡。每个主题每天只有“完成”或“未完成”两种状态，数据通过 Key 和参数化 SQL 保存在 [zss.pub 数据库管理](https://zss.pub) 的自定义字段表中。配置相同库表的 Host、工作区与会话共享数据，不再使用本地 SQLite。

## 安装

需要 DSH `0.1.5-rc.1` 和 Node.js `^22.19.0 || >=24.0.0`。可从仓库安装；正式环境建议固定到已验证的提交：

```sh
dsh plugin --profile web add github:zsspub/dsh-checkin
```

安装后重启该 DSH profile 并刷新页面，在打卡 Tab 完成 Key 登录。Git 仓库包含编译产物，安装时不需要编译插件。也可以安装 `pnpm pack` 生成的 tarball。

## 首次登录

1. 打开打卡 Tab，点击[注册账号](https://zss.pub/register)，再到[数据库管理](https://zss.pub/databases)生成具有 `databases` 读写权限的 Key。
2. 返回插件，在密码式输入框粘贴 Key，点击“验证并继续”。仅验证读取权限，不创建线上资源；创建和业务写入仍由服务端校验写权限。远程页面必须使用 HTTPS，本机回环开发页面例外。
3. 默认创建 `dsh_checkin` 数据库、`checkin_topics` 主题表和 `checkin_records` 打卡记录表。两张表可以分别新建或选择已有表。核对目标、字段和配额后点击“确认创建并连接”；两张表都已存在时使用“检查并连接”，不会覆盖原表。成功后直接进入日历，不需要重启。

Key 与连接信息通过 `ctx.credentials` 保存在宿主的插件专属记录 `dsh-checkin/connection`，不会写入浏览器存储、URL、模型工具参数或会话记录。默认凭据服务使用仅 OS 用户可读的文件，并非加密保险库；同一 `DSH_HOME` 的 profile/会话共享该记录。所有连接到该 Host 的已认证客户端属于同一信任域，不提供多租户隔离。输入时 Key 会单向经过已认证的 DSH Remote，状态响应不返回 Key。

“连接信息”可更新 Key 或确认退出。退出会清除宿主保存的连接，影响共享连接的会话，但不删除云端数据、不撤销 zss.pub Key。已打开的同页面 Tab 同步清空旧数据，其他客户端下一次刷新时同步。刷新/重启恢复已保存的连接。

初始化部分失败会保留已创建资源和待完成状态。先刷新资源，选择已创建的数据库或表继续，不自动重复创建、不删除回滚，不修改不兼容的旧表。Key 不足、服务禁用、库未就绪或配额不足会明确报错；可在页面更换 Key。凭据服务缺失或不可写时提示检查部署，DSH 仍可启动。

## 对话打卡

- “新建一个阅读打卡主题。”
- “今天阅读打卡完成了。”
- “补签昨天的阅读，查看本月完成情况。”
- “撤销昨天的阅读打卡。”
- “把阅读主题改名为读书。”
- “删除运动主题和它的全部打卡记录。”

Agent 会先查询主题，再使用精确 ID 操作；主题指代不清时会澄清。删除主题会永久删除该主题的全部记录。撤销某一天只删除当天记录，不删除主题。

## 右侧打卡 Tab

点击左侧栏底部“打卡”，宿主会打开或聚焦右侧打卡 Tab。默认显示当前月份，每天显示“完成数 / 当前主题数”。切换主题可查看单个主题的完成状态；选择日期后，在下方清单完成或撤销打卡。每个主题旁有重命名与删除入口，删除需要确认。

日期统一使用北京时间。可以补签任意过去日期，未来日期只读。不设主题开始日期，因此新增或删除主题也会改变历史总览的分母。月历支持方向键移动日期、Home/End 移到月初/月末；Tab 的关闭、分栏、浮动和全屏由宿主右栏统一提供。

Tab 可见且页面可见时默认每 30 秒刷新；手动写入后立即读取，重新显示或页面恢复可见时也会刷新。保存失败保留输入，错误区的“重试”仅刷新数据，不会重发写入。

## 数据与配置

以下是可选的 Host 管理接入方式。显式配置/环境变量中的 Key 或数据库 ID 只要存在，就整体优先于页面保存的连接；缺一项会显示配置错误，不与保存记录混搭。完整外部配置显示“由 Host 管理”，页面不能覆盖或退出它。清除外部配置并重启后，才能使用页面管理连接。

1. 登录 zss.pub「数据库管理」，选择或创建专用数据库，按下方结构准备主题表和打卡记录表。也可使用已有的兼容双表；只有表名相同但字段不兼容是不够的。
2. 生成具有 `databases: ["read", "write"]` 权限的 Key，取得概览中目标数据库的真实 UUID（不是数据库名称）。
3. 在启动 DSH 的进程环境中设置 `PUB_DATABASE_KEY` 和 `PUB_DATABASE_ID`。例如，在 zsh 中隐藏输入 Key：

```sh
read -rs 'PUB_DATABASE_KEY?Pub database key: '
export PUB_DATABASE_KEY
printf '\n'
export PUB_DATABASE_ID='这里替换为真实数据库 UUID'
dsh --profile web
```

服务地址固定为 `https://zss.pub/api`；Host 只使用 `x-api-key`，禁止重定向、不发送 Cookie 或额外 Bearer token，不连接底层 MySQL，也不调用 habits API。除登录时从浏览器单向提交到 Host 外，Key 不经过打卡数据 Remote 或模型工具参数。Key 能访问所属用户的全部受管数据库，并非单库凭据。

在 profile 的 `cordis.patch.yml` 中覆盖 `checkin` 行配置（Key 和数据库 ID 默认从上述环境变量读取）：

```yaml
- id: checkin
  config:
    tableName: checkin_topics
    recordsTableName: checkin_records
    requestTimeoutMs: 15000
    refreshIntervalMs: 30000
```

也支持 Host 配置字段 `databaseId` 和标记为 secret 的 `apiKey`，优先于环境变量；推荐 Key 使用环境变量，避免明文进入配置、配置转储或 Git。更改凭据后重启 Host。配置的物理表名须匹配 `^[a-z][a-z0-9_]{0,63}$`（结构化创建接口上限为 48 字符），不会加减前缀。请求超时至少 1 毫秒，刷新间隔至少 1000 毫秒。

数据库客户端不在宿主启动时初始化。无配置时展示登录页；外部配置不完整或 UUID 无效时仅打卡功能报错，DSH 和其他插件仍可启动。插件先读取概览和 `/databases/:id/tables/:table/schema`，验证服务已启用、库状态为 `ready`、真实表名、字段和索引。仅在页面明确确认后创建库表；不会自动切换账号、删除数据腾配额或回退 SQLite/旧 records API。

### SQL 双表结构

关系为 `checkin_topics.id` → `checkin_records.topic_id`（一对多）。主题表不保存日期数组；打卡记录存在表示当天完成，不存在表示未完成。

确认真实目标数据库、且两张表不存在后，先通过 `POST /databases/:id/tables` 创建主题表。插件初始化也必须先点击确认：

```json
{
  "name": "checkin_topics",
  "columns": [
    {"name":"id","type":"VARCHAR","length":36,"primaryKey":true},
    {"name":"name","type":"VARCHAR","length":200,"unique":true},
    {"name":"created_at","type":"VARCHAR","length":24},
    {"name":"updated_at","type":"VARCHAR","length":24},
    {"name":"revision","type":"VARCHAR","length":36}
  ]
}
```

打卡记录表通过 `POST /databases/:id/query` 提交以下 SQL，`params` 为 `[]`。结构化建表接口不支持联合主键，因此这里使用受限 SQL DDL：

```sql
CREATE TABLE `checkin_records` (
  `topic_id` VARCHAR(36) NOT NULL,
  `date` VARCHAR(10) NOT NULL,
  `created_at` VARCHAR(24) NOT NULL,
  `revision` VARCHAR(36) NOT NULL,
  PRIMARY KEY (`topic_id`, `date`),
  INDEX `by_date` (`date`, `topic_id`)
)
```

所有字段均非空。主题 `id` 为主键、`name` 唯一，名称去空白后为 1–200 字符，唯一性最终受数据库排序规则影响。打卡表以 `(topic_id, date)` 为联合主键，确保一个主题一天最多一条记录；`(date, topic_id)` 索引用于月历查询。日期保存北京时间 `YYYY-MM-DD` 字符串，保留现有 `0001`–`9999` 年范围，不受 MySQL DATE 下限影响。Host 生成 UUID 和 UTC ISO 时间，记录 `revision` 防止撤销操作误删并发补签。主题更新时间只随重命名更新，不随打卡更新。额外字段须可空或有默认值，插件不会覆盖；API 不支持外键。

### SQL 操作与限制

- 数据操作统一调用 `POST /databases/:id/query`，每次一条参数化语句，文本只进入标量 `params`。SELECT 虽使用 POST，仍按只读处理。打卡工具不暴露任意 SQL 执行入口。
- 主题按主键分页，记录在 SQL 中按日期范围及可选主题筛选，再按 `(date, topic_id)` 游标分页，每页 100 条。拒绝重复或不前进的游标，读取前后用精确 COUNT 核验，大数不经 Number 转换。月历加载主题目录，但只查询所选日期范围的记录；不把多次读取宣称为事务快照。
- 重命名用主题 `id + revision` 条件更新。完成一天用 `INSERT SELECT` 同时检查主题存在、版本匹配及当天未完成；撤销用记录主键和 revision 条件 DELETE。不同日期互不覆盖，不再改写整段历史。
- 删除主题使用一条带版本条件的多表 `DELETE ... LEFT JOIN` 同时删除主题和全部记录，避免拆成两次请求；不是外键级联。`deletedRecords` 为实际影响行数减去一条主题。配合条件插入及服务端 SQL 串行执行，插件写入不会留下孤立记录；任意外部写入仍须遵循这些约定。没有跨请求事务或自动回滚。
- 写后重读结构、概览和数据核验，不自动重试。物理用量达到/超过 `maxBytes` 时，INSERT 和所有 UPDATE 受限，但撤销打卡和删除主题均使用 DELETE，仍可执行；不保证删除归还物理页，不自动 TRUNCATE、DROP 或清理历史。
- SQL 最多 16 KiB，参数最多 1000 项/64 KiB，结果最多 500 行/1 MiB。插件每页 100 行并检查参数上限；一页结果过大仍可能报错。HTTP 413 表示请求/结果大小限制，不是存储配额。
- 超时、网络中断或写后核验失败时提示“写入结果尚未确认”。先刷新检查实际状态再决定下一步，不能直接重复创建主题。错误提示不会透传响应正文或凭据。

### 从旧版升级

这是存储配置的破坏性变更：删除旧配置中的 `databasePath`、`busyTimeoutMs`，按上述步骤配置远程库。旧 `$DSH_HOME/checkin/checkin.sqlite3` 文件保持原样，插件不再打开它，也不会自动上传、迁移或删除旧数据。新目标表为空时界面即为空；需要迁移历史时应另行确认导入范围并备份。数据库、导出文件和凭据不要提交到公开仓库。

旧 Pub JSON 接入也需要单独迁移：服务已移除 `/records`，历史表现在可能以 `t_checkin_topics` 等真实物理名称显示。插件不会删除前缀、改名，或假设旧 `data`/时间列与新结构相同。应先查看并备份旧表结构及数据，再明确规划导入兼容表；只修改 `tableName` 不会自动转换 JSON 记录。

上一版带 `completed_dates` 的单 SQL 表同样不兼容，即便该列可空也会明确拒绝。版本 1 的已保存连接会回到设置页，Key 仍保留在 Host，不迁移、不删旧数据、不通过修改结构掩盖历史。请选择或新建一组兼容双表，历史迁移另行确认；版本 2 凭据同时保存两个表名。新建双表须预留两个表配额，若只创建成功一张，刷新资源并明确选择该表，只创建缺失的另一张。

## 开发与验证

```sh
pnpm install
pnpm run check
```

`check` 包含构建、类型检查、lint、HTTP 数据库／工具／UI 测试和打包检查。测试使用内存 HTTP 模拟服务，无需真实 Key，也不会写入线上数据。旧版真实模型及浏览器验收记录见 [验证说明](docs/verification.md)，不代表本次远程数据库已通过线上验收。

不提供提醒、奖励、备注、计数目标、归档、离线写入队列或自动本地数据迁移。
