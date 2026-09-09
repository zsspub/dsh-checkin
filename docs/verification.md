# 验证记录

## 自动化

`pnpm run check` 已通过构建、Host/Client/测试类型检查、lint、14 项测试和 tarball 内容检查。覆盖真实 SQLite 数据持久化、主题 CRUD、打卡幂等和撤销、日期校验、未来日期拒绝、北京时间午夜、闰年、数据库重开、更高 schema 拒绝、工具输出快照、请求竞态、UI 失败保留输入与键盘焦点恢复。

工具输出快照是无 API key 的确定性工具回放，不代表真实模型验证。

## 浏览器预验收

已从 tarball 安装到隔离 DSH `0.1.5-alpha.1` Web profile，验证创建主题、手动打卡、月份切换、删除确认焦点与取消恢复；390×844 无横向溢出，桌面验证尺寸为 1280×900。独立视觉复核提出的两项焦点问题均已修复并复验。

真实 DeepSeek-V4-Flash 已通过聊天调用 `checkin_topic_list` 并返回 SQLite 中的主题与北京时间日期。

## 正式录屏

正式录屏将在同一构建的全新隔离数据目录完成，覆盖对话写入、UI 操作和刷新／Host 重启恢复。完整录屏与逐项结果随验收补入本页。

验收使用 DSH 自带的 browser directory-picker，以便在当前无法控制原生目录窗口的环境下选择隔离工作区。模型使用现有 credential provider，不向录屏或仓库写入凭据。浏览器使用专用新 origin 和新标签页，运行在现有 Chrome profile 中；未声称使用全新的 Chrome profile。
