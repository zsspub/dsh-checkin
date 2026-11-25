/** Calendar, statistics and topic management rendered in the host's right-side tab. */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  BarChart3, CalendarCheck2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Database, Download,
  Pencil, Plus, Trash2, Upload,
} from 'lucide-react'
import { CHECKIN_BACKUP_MAX_BYTES, parseCheckinBackup } from '../backup.ts'
import { shiftDate, shiftMonth } from '../stats.ts'
import type { CheckinBackup, Topic, TopicId } from '../types.ts'
import { CheckinController, type PanelView } from './controller.ts'
import type { CheckinKey } from './locales.ts'
import { StatsView, type CalendarDrilldown } from './StatsView.tsx'
import { useCheckinStyles } from './styles.ts'

/** Injected factory gives each right-tab occurrence independent request and UI state. */
export interface Injected { createController: () => CheckinController }
/** Sidebar entry opens or reveals the check-in page in the host right panel. */
export interface TriggerInjected { openPanel: () => void }
type Localized = PropsLocale<'checkin'>
type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & Localized & Injected
type TriggerProps = PropsRuntime<'sidebar.footer.action'> & Localized & TriggerInjected
const WEEK: CheckinKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function failureKey(error: string): CheckinKey {
  if (error.includes('duplicate-name')) return 'duplicate'
  if (error.includes('invalid-name')) return 'invalidName'
  if (error.includes('topic-not-found')) return 'notFound'
  if (error.includes('future-date')) return 'future'
  if (error.includes('invalid-date') || error.includes('invalid-range')) return 'invalidDate'
  if (error.includes('invalid-backup')) return 'invalidBackup'
  if (error.includes('backup-too-large')) return 'backupTooLarge'
  if (error.includes('import-conflict')) return 'importConflict'
  return 'error'
}

/** Sidebar action respects the host's collapsed rail.
 * @param props - Localized shell props and right-panel opener. @returns Sidebar trigger.
 */
export function CheckinTrigger({ wide, t, openPanel }: TriggerProps) {
  useCheckinStyles()
  return (
    <button className="ci-trigger" data-wide={wide} aria-label={t('open')} onClick={openPanel}>
      <CalendarCheck2 size={16} aria-hidden="true" />
      {wide && <span>{t('title')}</span>}
    </button>
  )
}

/** Calendar, statistics, topic management and daily completion controls.
 * @param props - Localized tab props and per-occurrence controller factory. @returns Right-tab body.
 */
export function CheckinPanel({ t, createController, useTabInfo }: PanelProps) {
  useCheckinStyles()
  const [controller] = useState(createController)
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { tab } = useTabInfo()
  const { data, busy, view, topicId } = state
  const titleId = useId()
  const nameId = useId()
  const calTabId = useId()
  const statsTabId = useId()
  const calPanelId = useId()
  const statsPanelId = useId()
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState<{ id?: TopicId; name: string } | null>(null)
  const [deleting, setDeleting] = useState<Topic | null>(null)
  const [dataOpen, setDataOpen] = useState(false)
  const [transferReading, setTransferReading] = useState(false)
  const [transferResult, setTransferResult] = useState<string | null>(null)
  const [transferError, setTransferError] = useState<CheckinKey | null>(null)
  const [importing, setImporting] = useState<{ key: number; name: string; json: string; backup: CheckinBackup } | null>(null)
  const importSequence = useRef(0)
  const addRef = useRef<HTMLButtonElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const calTabRef = useRef<HTMLButtonElement>(null)
  const statsTabRef = useRef<HTMLButtonElement>(null)
  const focusDay = useRef(false)
  const navigationFocus = useRef<string | null>(null)
  const deleteCancel = useRef<HTMLButtonElement>(null)
  const deleteTrigger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => { if (deleting) deleteCancel.current?.focus() }, [deleting])
  const formOpen = form !== null
  const formId = form?.id
  useEffect(() => { if (formOpen) nameRef.current?.focus() }, [formOpen, formId])
  useEffect(() => () => { controller.dispose() }, [controller])

  useEffect(() => {
    if (!tab.visible || tab.signal.aborted) { controller.cancelRead(); return }
    const current = controller.getSnapshot()
    if (current.view === 'stats') void controller.refreshStats(current.stats !== null)
    else void controller.refresh()
    return () => { controller.cancelRead() }
  }, [controller, tab.signal, tab.visible])

  useEffect(() => {
    const cancel = () => { controller.cancelRead() }
    if (tab.signal.aborted) { cancel(); return }
    tab.signal.addEventListener('abort', cancel, { once: true })
    return () => { tab.signal.removeEventListener('abort', cancel) }
  }, [controller, tab.signal])

  useEffect(() => {
    if (!tab.visible || tab.signal.aborted) return
    if (view === 'calendar') {
      if (!data) return
      const poll = () => { if (!tab.signal.aborted && document.visibilityState === 'visible') void controller.refresh(true) }
      const timer = window.setInterval(poll, data.refreshIntervalMs)
      document.addEventListener('visibilitychange', poll)
      return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll) }
    }
    if (!state.stats) return
    const poll = () => { if (!tab.signal.aborted && document.visibilityState === 'visible') void controller.refreshStats(true) }
    const timer = window.setInterval(poll, state.statsRefreshIntervalMs)
    document.addEventListener('visibilitychange', poll)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll) }
  }, [controller, tab.signal, tab.visible, view, data?.refreshIntervalMs, Boolean(data), state.statsRefreshIntervalMs, Boolean(state.stats)])

  useEffect(() => {
    if (!data) return
    if (selected.slice(0, 7) !== data.month) setSelected(data.today.startsWith(data.month) ? data.today : data.from)
  }, [data, selected])

  useEffect(() => {
    if (view !== 'calendar') return
    if (focusDay.current && data && selected.startsWith(data.month)) {
      panelRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${selected}"]`)?.focus()
      focusDay.current = false
    } else if (data && navigationFocus.current) {
      panelRef.current?.querySelector<HTMLButtonElement>(`button[data-nav="${navigationFocus.current}"]`)?.focus()
      navigationFocus.current = null
    }
  }, [view, data, selected])

  const topics = data?.topics.filter(topic => !topicId || topic.id === topicId) ?? []
  const complete = new Set(data?.completions.map(row => `${row.date}/${row.topicId}`))
  const count = (date: string) => topics.filter(topic => complete.has(`${date}/${topic.id}`)).length
  const future = data !== null && selected > data.today
  const calendar: (string | null)[][] = []
  if (data) {
    const offset = (new Date(`${data.from}T00:00:00Z`).getUTCDay() + 6) % 7
    const days = Number(data.to.slice(-2))
    const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => index >= offset && index < offset + days ? `${data.month}-${String(index - offset + 1).padStart(2, '0')}` : null)
    for (let index = 0; index < cells.length; index += 7) calendar.push(cells.slice(index, index + 7))
  }

  const navigate = (month: string, action: string) => { navigationFocus.current = action; setSelected(`${month}-01`); controller.selectMonth(month) }

  const onDayKey = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next: string
    if (event.key === 'Home') next = data!.from
    else if (event.key === 'End') next = data!.to
    else if (event.key in deltas) next = shiftDate(date, deltas[event.key]!)
    else return
    event.preventDefault()
    if (!/^\d{4}-/u.test(next) || next < '0001-01-01') return
    focusDay.current = true
    setSelected(next)
    if (next.slice(0, 7) !== data!.month) controller.selectMonth(next.slice(0, 7))
  }

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: PanelView) => {
    let next: PanelView | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = current === 'calendar' ? 'stats' : 'calendar'
    else if (event.key === 'Home') next = 'calendar'
    else if (event.key === 'End') next = 'stats'
    if (!next) return
    event.preventDefault()
    controller.setView(next)
    if (next === 'calendar') calTabRef.current?.focus()
    else statsTabRef.current?.focus()
  }

  const openFromStats = (target: CalendarDrilldown) => {
    if (target.date) {
      focusDay.current = true
      setSelected(target.date)
    }
    const targetMonth = target.month ?? target.date?.slice(0, 7)
    controller.openCalendar({
      ...(targetMonth !== undefined ? { month: targetMonth } : {}),
      ...(target.topicId !== undefined ? { topicId: target.topicId } : {}),
    })
  }

  const beginForm = (topic?: Topic) => { setDeleting(null); setForm(topic ? { id: topic.id, name: topic.name } : { name: '' }) }

  const submit = async () => {
    if (!form) return
    const request = form
    const saved = await controller.mutate((api, signal) => request.id ? api.update({ id: request.id, name: request.name }, signal) : api.create({ name: request.name }, signal))
    if (saved) { setForm(null); addRef.current?.focus() }
  }

  const downloadBackup = async () => {
    setTransferError(null)
    setTransferResult(null)
    const file = await controller.exportData()
    if (!file) { setTransferError(failureKey(controller.getSnapshot().error ?? '')); return }
    const blob = new Blob([file.json], { type: 'application/json;charset=utf-8' })
    if (blob.size > CHECKIN_BACKUP_MAX_BYTES) { setTransferError('backupTooLarge'); return }
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    try {
      anchor.href = url
      anchor.download = file.filename
      document.body.append(anchor)
      anchor.click()
      setTransferResult(t('exportSuccess'))
    } finally {
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }

  const selectBackup = (file: File) => {
    const key = ++importSequence.current
    setForm(null)
    setDeleting(null)
    setImporting(null)
    setTransferError(null)
    setTransferResult(null)
    setTransferReading(true)
    void (async () => {
      if (file.size > CHECKIN_BACKUP_MAX_BYTES) { setTransferError('backupTooLarge'); return }
      let json: string
      try { json = await file.text() } catch { setTransferError('fileReadError'); return }
      let backup: CheckinBackup
      try { backup = parseCheckinBackup(json, data?.today ?? state.statsToday ?? undefined) } catch (error) { setTransferError(failureKey(String(error))); return }
      if (key === importSequence.current) setImporting({ key, name: file.name, json, backup })
    })().finally(() => { if (key === importSequence.current) setTransferReading(false) })
  }

  const confirmImport = async () => {
    if (!importing) return
    setTransferError(null)
    const result = await controller.importData({ json: importing.json })
    if (!result) { setTransferError(failureKey(controller.getSnapshot().error ?? '')); return }
    setImporting(null)
    setTransferResult(t('importSuccess', { ...result }))
  }

  return (
    <section ref={panelRef} className="dsh-checkin ci-panel" aria-labelledby={titleId}>
      <header className="ci-header">
        <div className="ci-header-top">
          <h2 id={titleId}>{t('title')}</h2>
          <div className="ci-tabs" role="tablist" aria-label={t('viewSwitch')}>
            <button
              ref={calTabRef}
              id={calTabId}
              type="button"
              role="tab"
              className="ci-tab"
              aria-selected={view === 'calendar'}
              aria-controls={calPanelId}
              tabIndex={view === 'calendar' ? 0 : -1}
              onClick={() => controller.setView('calendar')}
              onKeyDown={event => onTabKey(event, 'calendar')}
            >
              <CalendarDays size={14} aria-hidden="true" />
              <span>{t('tabCalendar')}</span>
            </button>
            <button
              ref={statsTabRef}
              id={statsTabId}
              type="button"
              role="tab"
              className="ci-tab"
              aria-selected={view === 'stats'}
              aria-controls={statsPanelId}
              tabIndex={view === 'stats' ? 0 : -1}
              onClick={() => controller.setView('stats')}
              onKeyDown={event => onTabKey(event, 'stats')}
            >
              <BarChart3 size={14} aria-hidden="true" />
              <span>{t('tabStats')}</span>
            </button>
          </div>
        </div>
        <p className="ci-subtitle">{t('subtitle')}</p>
      </header>

      <div className="ci-scroll">
        <input
          ref={importRef}
          type="file"
          hidden
          accept=".json,application/json"
          aria-label={t('importFile')}
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) selectBackup(file)
          }}
        />

        {form && (
          <form className="ci-form" onSubmit={event => { event.preventDefault(); void submit() }}>
            <label htmlFor={nameId}>{t('name')}</label>
            <input
              ref={nameRef}
              id={nameId}
              value={form.name}
              placeholder={t('placeholder')}
              maxLength={200}
              disabled={busy}
              onChange={event => setForm({ ...form, name: event.target.value })}
            />
            <div className="ci-actions">
              <button type="button" className="ci-button" disabled={busy} onClick={() => { setForm(null); controller.clearError() }}>
                {t('cancel')}
              </button>
              <button type="submit" className="ci-button ci-primary" disabled={busy}>
                {t('save')}
              </button>
            </div>
          </form>
        )}

        {deleting && (
          <div className="ci-confirm" role="alertdialog" aria-label={t('deleteTitle', { name: deleting.name })}>
            <h3>{t('deleteTitle', { name: deleting.name })}</h3>
            <p>{t('deleteHint')}</p>
            <div className="ci-actions">
              <button
                ref={deleteCancel}
                type="button"
                className="ci-button"
                disabled={busy}
                onClick={() => { setDeleting(null); deleteTrigger.current?.focus() }}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="ci-button ci-danger"
                disabled={busy}
                onClick={() => {
                  const target = deleting
                  void controller.mutate((api, signal) => api.delete({ id: target.id }, signal)).then(done => {
                    if (done) { setDeleting(null); addRef.current?.focus() }
                  })
                }}
              >
                {t('confirmDelete')}
              </button>
            </div>
          </div>
        )}

        {transferError && !importing && <div className="ci-alert" role="alert">{t(transferError)}</div>}
        {transferResult && <div className="ci-transfer-result" role="status">{transferResult}</div>}
        {state.error && !transferError && !importing && (
          <div className="ci-alert" role="alert">
            <span>{t(failureKey(state.error))}</span>
            <button
              type="button"
              className="ci-button"
              disabled={busy}
              onClick={() => {
                if (view === 'stats') void controller.refreshStats(false)
                else void controller.refresh()
              }}
            >
              {t('retry')}
            </button>
          </div>
        )}

        {view === 'calendar' ? (
          <div id={calPanelId} role="tabpanel" aria-labelledby={calTabId}>
            <div className="ci-toolbar">
              <div className="ci-filter">
                <select
                  className="ci-select"
                  aria-label={t('filter')}
                  value={topicId}
                  onChange={event => controller.setTopicId(event.target.value as TopicId | '')}
                >
                  <option value="">{t('all')}</option>
                  {data?.topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
              <div className="ci-toolbar-actions">
                <Menu
                  open={dataOpen}
                  onClose={() => setDataOpen(false)}
                  align="end"
                  portal
                  dense
                  items={[
                    { id: 'export', label: t('exportJson'), icon: <Download size={16} aria-hidden="true" />, disabled: busy || transferReading },
                    { id: 'import', label: t('importJson'), icon: <Upload size={16} aria-hidden="true" />, disabled: busy || transferReading },
                  ]}
                  onSelect={id => {
                    setDataOpen(false)
                    if (busy || transferReading) return
                    if (id === 'export') void downloadBackup()
                    if (id === 'import') importRef.current?.click()
                  }}
                  anchor={(
                    <Button
                      size="md"
                      variant="outline"
                      icon={<Database size={16} aria-hidden="true" />}
                      aria-haspopup="menu"
                      aria-expanded={dataOpen}
                      disabled={busy || transferReading}
                      onClick={() => setDataOpen(open => !open)}
                    >
                      {t('dataMenu')}
                    </Button>
                  )}
                />
                <button ref={addRef} type="button" className="ci-button" disabled={busy} onClick={() => beginForm()}>
                  <Plus size={16} aria-hidden="true" />
                  {t('add')}
                </button>
              </div>
            </div>

            {state.loading && <div className="ci-status" role="status">{t('loading')}</div>}
            {data && data.topics.length === 0 && (
              <div className="ci-empty">
                <CalendarCheck2 className="ci-empty-icon" size={36} strokeWidth={1.5} aria-hidden="true" />
                <h3>{t('empty')}</h3>
                <p>{t('emptyHint')}</p>
                <button type="button" className="ci-button" disabled={busy} onClick={() => beginForm()}>
                  <Plus size={16} />
                  {t('add')}
                </button>
              </div>
            )}
            {data && data.topics.length > 0 && (
              <>
                <div className="ci-monthnav">
                  <h3>{data.month.replace('-', ' / ')}</h3>
                  <div className="ci-actions">
                    <button data-nav="prev" type="button" className="ci-icon" aria-label={t('prev')} disabled={busy || data.month === '0001-01'} onClick={() => navigate(shiftMonth(data.month, -1), 'prev')}>
                      <ChevronLeft size={18} />
                    </button>
                    <button data-nav="today" type="button" className="ci-button" disabled={busy} onClick={() => { navigationFocus.current = 'today'; setSelected(''); controller.selectMonth() }}>
                      {t('today')}
                    </button>
                    <button data-nav="next" type="button" className="ci-icon" aria-label={t('next')} disabled={busy || data.month === '9999-12'} onClick={() => navigate(shiftMonth(data.month, 1), 'next')}>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <table className="ci-calendar" role="grid" aria-label={t('calendar')}>
                  <thead>
                    <tr>{WEEK.map(day => <th key={day} scope="col">{t(day)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {calendar.map((week, i) => (
                      <tr key={i}>
                        {week.map((date, j) => (
                          <td key={date ?? j} aria-selected={date === selected}>
                            {date && (
                              <button
                                type="button"
                                className="ci-day"
                                data-date={date}
                                data-selected={date === selected}
                                data-today={date === data.today}
                                data-future={date > data.today}
                                data-done={count(date) > 0}
                                tabIndex={date === selected ? 0 : -1}
                                aria-current={date === data.today ? 'date' : undefined}
                                aria-label={`${t('daySummary', { date, done: count(date), total: topics.length })}${date > data.today ? `, ${t('future')}` : ''}`}
                                onClick={() => setSelected(date)}
                                onKeyDown={event => onDayKey(event, date)}
                              >
                                <span className="ci-date">{Number(date.slice(-2))}</span>
                                <small>{date > data.today ? null : topicId ? (count(date) ? <Check size={12} aria-hidden="true" /> : null) : `${count(date)}/${topics.length}`}</small>
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="ci-hint">{t('totalHint')}</p>
                <section className="ci-detail" aria-label={t('dateTitle', { date: selected })}>
                  <div className="ci-detailhead">
                    <h3>{selected}</h3>
                    <span>{future ? t('future') : t('count', { done: count(selected), total: topics.length })}</span>
                  </div>
                  {topics.map(topic => {
                    const done = complete.has(`${selected}/${topic.id}`)
                    return (
                      <div className="ci-row" key={topic.id}>
                        <button
                          type="button"
                          role="checkbox"
                          className="ci-toggle"
                          aria-checked={done}
                          aria-label={t(done ? 'unset' : 'set', { name: topic.name })}
                          disabled={busy || future || !selected || !selected.startsWith(data.month)}
                          onClick={() => { void controller.mutate((api, signal) => api.set({ topicId: topic.id, date: selected, completed: !done }, signal)) }}
                        >
                          {done && <Check size={16} />}
                        </button>
                        <span className="ci-row-name">{topic.name}</span>
                        <button type="button" className="ci-icon" aria-label={`${t('rename')} ${topic.name}`} disabled={busy} onClick={() => beginForm(topic)}>
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="ci-icon"
                          aria-label={`${t('remove')} ${topic.name}`}
                          disabled={busy}
                          onClick={event => { deleteTrigger.current = event.currentTarget; setForm(null); setDeleting(topic) }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </section>
              </>
            )}
          </div>
        ) : (
          <div id={statsPanelId} role="tabpanel" aria-labelledby={statsTabId}>
            <StatsView
              state={state}
              controller={controller}
              t={t}
              onCreateTopic={() => beginForm()}
              onOpenCalendar={openFromStats}
              failureKey={failureKey}
            />
          </div>
        )}
      </div>

      <footer className="ci-footer">{busy ? t('busy') : t('tz')}</footer>

      <Modal
        open={importing !== null}
        onClose={() => { if (!busy) { setImporting(null); setTransferError(null); controller.clearError() } }}
        title={t('importTitle')}
        closeLabel={t('importClose')}
        className="ci-import-dialog"
        footer={(
          <>
            <Button variant="outline" disabled={busy} onClick={() => { setImporting(null); setTransferError(null); controller.clearError() }}>
              {t('cancel')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => { void confirmImport() }}>
              {busy ? t('transferBusy') : t('confirmImport')}
            </Button>
          </>
        )}
      >
        <div className="ci-import" aria-busy={busy}>
          {importing && (
            <>
              <p>{t('importSummary', { filename: importing.name, topics: importing.backup.topics.length, completions: importing.backup.completions.length })}</p>
              <p>{t('importExportedAt', { exportedAt: importing.backup.exportedAt })}</p>
            </>
          )}
          <p>{t('importWarning')}</p>
          {transferError && <div className="ci-error" role="alert">{t(transferError)}</div>}
        </div>
      </Modal>
    </section>
  )
}
