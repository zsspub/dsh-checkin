/** Locale-owned check-in copy. */
export const NS = 'checkin'
/** Simplified Chinese dictionary. */
export const zh = {
  title: '打卡', open: '打开打卡', subtitle: '每天一小步，记录你的坚持。',
  add: '新建主题', rename: '重命名', remove: '删除主题', name: '主题名称', placeholder: '例如：阅读、运动、早睡',
  save: '保存', cancel: '取消', all: '全部主题', filter: '查看主题', prev: '上个月', next: '下个月', today: '今天',
  dataMenu: '数据', exportJson: '导出 JSON', importJson: '导入 JSON', importFile: '选择 JSON 备份',
  importTitle: '确认导入备份', importClose: '关闭导入确认',
  importSummary: '文件：{filename}；共 {topics} 个主题、{completions} 条打卡记录。',
  importExportedAt: '备份时间：{exportedAt}', importWarning: '已有相同主题 ID 将整项跳过，不会覆盖本地修改；其他主题及其打卡记录将增量导入。',
  confirmImport: '确认导入', transferBusy: '正在处理备份…', exportSuccess: '备份已生成并请求下载。',
  importSuccess: '导入完成：新增 {importedTopics} 个主题和 {importedCompletions} 条记录，跳过 {skippedTopics} 个已有主题。',
  invalidBackup: '备份操作失败：请选择有效的 dsh-checkin 版本 1 或 2 JSON 备份。', backupTooLarge: '备份操作失败：备份 JSON 不能超过 20 MiB。',
  importConflict: '备份操作失败：新增主题与本地主题名称冲突，未写入任何数据。', fileReadError: '备份操作失败：无法读取所选文件。',
  loading: '正在读取打卡…', retry: '重试', error: '暂时无法完成操作，请重试。', empty: '从一个小习惯开始', emptyHint: '新建一个主题，在日历里记录每天是否完成。',
  completed: '已完成', incomplete: '未完成', future: '未来日期暂不可打卡', tz: '北京时间 · 可补签过去日期',
  totalHint: '历史总览按当前主题数统计', calendar: '打卡日历', daySummary: '{date}，完成 {done} / {total}',
  dateTitle: '{date} 的打卡', count: '{done} / {total} 已完成', set: '完成 {name}', unset: '撤销 {name}',
  deleteTitle: '删除「{name}」？', deleteHint: '这个主题和全部历史打卡将永久删除。', confirmDelete: '确认删除',
  duplicate: '已有同名主题，请换个名称。', invalidName: '请输入 1–200 个字符的主题名称。', notFound: '该主题已被删除，请刷新后重试。', invalidDate: '日期无效，请选择有效日期。',
  sun: '日', mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', busy: '正在保存…',
}
/** Dictionary key union. */
export type CheckinKey = keyof typeof zh
/** English dictionary. */
export const en: Record<CheckinKey, string> = {
  title: 'Check-ins', open: 'Open check-ins', subtitle: 'Small steps, one day at a time.',
  add: 'New topic', rename: 'Rename', remove: 'Delete topic', name: 'Topic name', placeholder: 'Reading, exercise, an early night…',
  save: 'Save', cancel: 'Cancel', all: 'All topics', filter: 'Filter topics', prev: 'Previous month', next: 'Next month', today: 'Today',
  dataMenu: 'Data', exportJson: 'Export JSON', importJson: 'Import JSON', importFile: 'Select JSON backup',
  importTitle: 'Confirm backup import', importClose: 'Close import confirmation',
  importSummary: 'File: {filename}; {topics} topics and {completions} check-in records.',
  importExportedAt: 'Backup time: {exportedAt}', importWarning: 'Topics with an existing ID are skipped without overwriting local changes. Other topics and their records are imported incrementally.',
  confirmImport: 'Import', transferBusy: 'Processing backup…', exportSuccess: 'Backup generated and download requested.',
  importSuccess: 'Import complete: added {importedTopics} topics and {importedCompletions} records; skipped {skippedTopics} existing topics.',
  invalidBackup: 'Backup failed: select a valid dsh-checkin version 1 or 2 JSON backup.', backupTooLarge: 'Backup failed: JSON must not exceed 20 MiB.',
  importConflict: 'Backup failed: a new topic conflicts with a local topic name. No data was written.', fileReadError: 'Backup failed: could not read the selected file.',
  loading: 'Loading check-ins…', retry: 'Retry', error: 'Could not complete this action. Please retry.', empty: 'Start with a small habit', emptyHint: 'Create a topic and mark each completed day on the calendar.',
  completed: 'Completed', incomplete: 'Incomplete', future: 'Future dates are read-only', tz: 'Beijing time · Past days can be edited',
  totalHint: 'Historical totals use the current topics', calendar: 'Check-in calendar', daySummary: '{date}, {done} of {total} completed',
  dateTitle: 'Check-ins for {date}', count: '{done} / {total} completed', set: 'Complete {name}', unset: 'Undo {name}',
  deleteTitle: 'Delete “{name}”?', deleteHint: 'This topic and all its completed days will be permanently deleted.', confirmDelete: 'Delete permanently',
  duplicate: 'A topic with this name already exists.', invalidName: 'Enter a topic name of 1–200 characters.', notFound: 'This topic was deleted. Refresh and try again.', invalidDate: 'Select a valid calendar date.',
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', busy: 'Saving…',
}
