/** Calendar and topic management rendered in the host's right-side tab. */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CalendarCheck2, Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Topic, TopicId } from '../types.ts'
import { CheckinController } from './controller.ts'
import type { CheckinKey } from './locales.ts'
import { styles } from './styles.ts'

/** Injected factory gives each right-tab occurrence independent request and UI state. */
export interface Injected { createController: () => CheckinController }
/** Sidebar entry opens or reveals the check-in page in the host right panel. */
export interface TriggerInjected { openPanel: () => void }
type Localized = PropsLocale<'checkin'>
type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & Localized & Injected
type TriggerProps = PropsRuntime<'sidebar.footer.action'> & Localized & TriggerInjected
const WEEK: CheckinKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function shiftMonth(month: string, amount: number): string {
  const value = new Date(`${month}-01T00:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + amount)
  return value.toISOString().slice(0, 7)
}
function failureKey(error: string): CheckinKey {
  if (error.includes('duplicate-name')) return 'duplicate'
  if (error.includes('invalid-name')) return 'invalidName'
  if (error.includes('topic-not-found')) return 'notFound'
  if (error.includes('future-date')) return 'future'
  if (error.includes('invalid-date') || error.includes('invalid-range')) return 'invalidDate'
  return 'error'
}
/** Sidebar action respects the host's collapsed rail.
 * @param props - Localized shell props and right-panel opener. @returns Sidebar trigger.
 */
export function CheckinTrigger({ wide, t, openPanel }: TriggerProps) {
  return <><style aria-hidden="true">{styles}</style><button className="ci-trigger" data-wide={wide} aria-label={t('open')} onClick={openPanel}><CalendarCheck2 size={16} aria-hidden="true" />{wide && <span>{t('title')}</span>}</button></>
}
/** Calendar, topic management and daily completion controls.
 * @param props - Localized tab props and per-occurrence controller factory. @returns Right-tab body.
 */
export function CheckinPanel({ t, createController, useTabInfo }: PanelProps) {
  const [controller] = useState(createController)
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { tab } = useTabInfo()
  const { data, busy } = state
  const titleId = useId()
  const nameId = useId()
  const [selected, setSelected] = useState('')
  const [topicId, setTopicId] = useState<TopicId | ''>('')
  const [form, setForm] = useState<{ id?: TopicId; name: string } | null>(null)
  const [deleting, setDeleting] = useState<Topic | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
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
    void controller.refresh()
    return () => { controller.cancelRead() }
  }, [controller, tab.signal, tab.visible])
  useEffect(() => {
    const cancel = () => { controller.cancelRead() }
    if (tab.signal.aborted) { cancel(); return }
    tab.signal.addEventListener('abort', cancel, { once: true })
    return () => { tab.signal.removeEventListener('abort', cancel) }
  }, [controller, tab.signal])
  useEffect(() => {
    if (!tab.visible || tab.signal.aborted || !data) return
    const poll = () => { if (!tab.signal.aborted && document.visibilityState === 'visible') void controller.refresh(true) }
    const timer = window.setInterval(poll, data.refreshIntervalMs)
    document.addEventListener('visibilitychange', poll)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll) }
  }, [controller, tab.signal, tab.visible, data?.refreshIntervalMs, Boolean(data)])
  useEffect(() => {
    if (!data) return
    if (selected.slice(0, 7) !== data.month) setSelected(data.today.startsWith(data.month) ? data.today : data.from)
    if (topicId && !data.topics.some(topic => topic.id === topicId)) setTopicId('')
  }, [data, selected, topicId])
  useEffect(() => {
    if (focusDay.current && data && selected.startsWith(data.month)) {
      panelRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${selected}"]`)?.focus()
      focusDay.current = false
    } else if (data && navigationFocus.current) {
      panelRef.current?.querySelector<HTMLButtonElement>(`button[data-nav="${navigationFocus.current}"]`)?.focus()
      navigationFocus.current = null
    }
  }, [data, selected])
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
  const beginForm = (topic?: Topic) => { setDeleting(null); setForm(topic ? { id: topic.id, name: topic.name } : { name: '' }) }
  const submit = async () => {
    if (!form) return
    const request = form
    const saved = await controller.mutate((api, signal) => request.id ? api.update({ id: request.id, name: request.name }, signal) : api.create({ name: request.name }, signal))
    if (saved) { setForm(null); addRef.current?.focus() }
  }
  return <section ref={panelRef} className="dsh-checkin ci-panel" aria-labelledby={titleId}>
    <header className="ci-header"><h2 id={titleId}>{t('title')}</h2><p className="ci-subtitle">{t('subtitle')}</p></header>
    <div className="ci-scroll">
      <div className="ci-toolbar"><div className="ci-filter"><select className="ci-select" aria-label={t('filter')} value={topicId} onChange={event => setTopicId(event.target.value as TopicId | '')}><option value="">{t('all')}</option>{data?.topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></div><button ref={addRef} className="ci-button ci-primary" disabled={busy} onClick={() => beginForm()}><Plus size={16} />{t('add')}</button></div>
      {form && <form className="ci-form" onSubmit={event => { event.preventDefault(); void submit() }}><label htmlFor={nameId}>{form.id ? t('rename') : t('name')}</label><input ref={nameRef} id={nameId} value={form.name} placeholder={t('placeholder')} required maxLength={200} disabled={busy} onChange={event => setForm({ ...form, name: event.target.value })} /><div className="ci-actions"><button type="button" className="ci-button" disabled={busy} onClick={() => { setForm(null); addRef.current?.focus() }}>{t('cancel')}</button><button className="ci-button ci-primary" disabled={busy || !form.name.trim()}>{busy ? t('busy') : t('save')}</button></div></form>}
      {deleting && <div className="ci-confirm" role="group" aria-label={t('deleteTitle', { name: deleting.name })}><h3>{t('deleteTitle', { name: deleting.name })}</h3><p>{t('deleteHint')}</p><div className="ci-actions"><button ref={deleteCancel} className="ci-button" disabled={busy} onClick={() => { setDeleting(null); deleteTrigger.current?.focus() }}>{t('cancel')}</button><button className="ci-button ci-danger" disabled={busy} onClick={() => { void controller.mutate((api, signal) => api.delete({ id: deleting.id }, signal)).then(saved => { if (saved) { setDeleting(null); addRef.current?.focus() } }) }}>{t('confirmDelete')}</button></div></div>}
      {state.error && <div className="ci-alert" role="alert"><span>{t(failureKey(state.error))}</span><button className="ci-button" disabled={busy} onClick={() => { void controller.refresh() }}>{t('retry')}</button></div>}
      {state.loading && <div className="ci-status" role="status">{t('loading')}</div>}
      {data && data.topics.length === 0 && <div className="ci-empty"><CalendarCheck2 className="ci-empty-icon" size={36} strokeWidth={1.5} aria-hidden="true" /><h3>{t('empty')}</h3><p>{t('emptyHint')}</p><button className="ci-button" disabled={busy} onClick={() => beginForm()}><Plus size={16} />{t('add')}</button></div>}
      {data && data.topics.length > 0 && <>
        <div className="ci-monthnav"><h3>{data.month.replace('-', ' / ')}</h3><div className="ci-actions"><button data-nav="prev" className="ci-icon" aria-label={t('prev')} disabled={busy || data.month === '0001-01'} onClick={() => navigate(shiftMonth(data.month, -1), 'prev')}><ChevronLeft size={18} /></button><button data-nav="today" className="ci-button" disabled={busy} onClick={() => { navigationFocus.current = 'today'; setSelected(''); controller.selectMonth() }}>{t('today')}</button><button data-nav="next" className="ci-icon" aria-label={t('next')} disabled={busy || data.month === '9999-12'} onClick={() => navigate(shiftMonth(data.month, 1), 'next')}><ChevronRight size={18} /></button></div></div>
        <table className="ci-calendar" role="grid" aria-label={t('calendar')}><thead><tr>{WEEK.map(day => <th key={day} scope="col">{t(day)}</th>)}</tr></thead><tbody>{calendar.map((week, i) => <tr key={i}>{week.map((date, j) => <td key={date ?? j} aria-selected={date === selected}>{date && <button className="ci-day" data-date={date} data-selected={date === selected} data-today={date === data.today} data-future={date > data.today} data-done={count(date) > 0} tabIndex={date === selected ? 0 : -1} aria-current={date === data.today ? 'date' : undefined} aria-label={`${t('daySummary', { date, done: count(date), total: topics.length })}${date > data.today ? `, ${t('future')}` : ''}`} onClick={() => setSelected(date)} onKeyDown={event => onDayKey(event, date)}><span className="ci-date">{Number(date.slice(-2))}</span><small>{date > data.today ? null : topicId ? count(date) ? <Check size={12} aria-hidden="true" /> : null : `${count(date)}/${topics.length}`}</small></button>}</td>)}</tr>)}</tbody></table>
        <p className="ci-hint">{t('totalHint')}</p>
        <section className="ci-detail" aria-label={t('dateTitle', { date: selected })}><div className="ci-detailhead"><h3>{selected}</h3><span>{future ? t('future') : t('count', { done: count(selected), total: topics.length })}</span></div>{topics.map(topic => {
          const done = complete.has(`${selected}/${topic.id}`)
          return <div className="ci-row" key={topic.id}><button role="checkbox" className="ci-toggle" aria-checked={done} aria-label={t(done ? 'unset' : 'set', { name: topic.name })} disabled={busy || future || !selected || !selected.startsWith(data.month)} onClick={() => { void controller.mutate((api, signal) => api.set({ topicId: topic.id, date: selected, completed: !done }, signal)) }}>{done && <Check size={16} />}</button><span className="ci-row-name">{topic.name}</span><button className="ci-icon" aria-label={`${t('rename')} ${topic.name}`} disabled={busy} onClick={() => beginForm(topic)}><Pencil size={14} /></button><button className="ci-icon" aria-label={`${t('remove')} ${topic.name}`} disabled={busy} onClick={event => { deleteTrigger.current = event.currentTarget; setForm(null); setDeleting(topic) }}><Trash2 size={14} /></button></div>
        })}</section>
      </>}
    </div><footer className="ci-footer">{busy ? t('busy') : t('tz')}</footer>
  </section>
}
