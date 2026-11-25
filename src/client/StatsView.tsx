/** Statistics view rendered inside the right-tab panel alongside the calendar view. */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  ArrowDown, ArrowLeft, ArrowUp, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Plus, RefreshCw, Table2, X,
} from 'lucide-react'
import { shiftMonth } from '../stats.ts'
import type { HeatmapCell, StatsPreset, StatsSnapshot, TopicId, TopicStat, TrendBucket, WeekdayStat } from '../types.ts'
import type { CheckinController, Snapshot } from './controller.ts'
import type { CheckinKey } from './locales.ts'

const WEEK: readonly CheckinKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const PRESETS: readonly { id: StatsPreset; key: CheckinKey }[] = [
  { id: '7d', key: 'preset7d' },
  { id: '30d', key: 'preset30d' },
  { id: '90d', key: 'preset90d' },
  { id: 'month', key: 'presetMonth' },
  { id: 'all', key: 'presetAll' },
]
const DEFAULT_VISIBLE_TOPICS = 8
const DEFAULT_VISIBLE_MONTHS = 24

type Translator = (key: CheckinKey, params?: Record<string, string | number>) => string

/** Callback options for drilling down from statistics into the calendar view. */
export interface CalendarDrilldown {
  date?: string
  month?: string
  topicId?: TopicId | ''
}

/** Props passed from CheckinPanel to StatsView. */
export interface StatsViewProps {
  state: Snapshot
  controller: CheckinController
  t: Translator
  onCreateTopic: () => void
  onOpenCalendar: (target: CalendarDrilldown) => void
  failureKey: (error: string) => CheckinKey
}

function formatCompactCount(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}K`
  return value.toLocaleString('en-US')
}

function formatPct(rate: number | null): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function shortDate(date: string | null): string {
  return date ? date.slice(5) : '—'
}

function presetLabelKey(preset: StatsPreset): CheckinKey {
  return PRESETS.find(item => item.id === preset)?.key ?? 'preset30d'
}

function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return ''
  const radius = Math.min(r, w / 2, h)
  const bottom = y + h
  return `M${x},${bottom} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${bottom} Z`
}

function DeltaBadge({ deltaPp, t }: { deltaPp: number | null; t: Translator }) {
  if (deltaPp === null) return <span className="ci-kpi-sub-text">{t('kpiNoPrior')}</span>
  const dir = deltaPp > 0 ? 'up' : deltaPp < 0 ? 'down' : 'flat'
  const sign = deltaPp > 0 ? '+' : ''
  return (
    <span className="ci-kpi-delta" data-dir={dir}>
      {dir === 'up' && <ArrowUp size={12} aria-hidden="true" />}
      {dir === 'down' && <ArrowDown size={12} aria-hidden="true" />}
      <span>{`${sign}${deltaPp.toFixed(1)}pp`}</span>
    </span>
  )
}

function TopicMeterSection({
  stats,
  today,
  t,
  onSelectTopic,
  onOpenCalendar,
}: {
  stats: StatsSnapshot
  today: string
  t: Translator
  onSelectTopic: (topicId: TopicId) => void
  onOpenCalendar: (target: CalendarDrilldown) => void
}) {
  const [sortBy, setSortBy] = useState<'primary' | 'streak' | 'default'>('primary')
  const [sortAsc, setSortAsc] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tableMode, setTableMode] = useState(false)

  const isAll = stats.preset === 'all'
  const maxAllTime = stats.topics.reduce((max, item) => Math.max(max, item.allTimeCount), 0)

  const sorted: TopicStat[] = (() => {
    if (sortBy === 'default') return sortAsc ? [...stats.topics].reverse() : [...stats.topics]
    const list = [...stats.topics]
    list.sort((a, b) => {
      let diff = 0
      if (sortBy === 'streak') {
        diff = a.currentStreak - b.currentStreak || a.longestStreak - b.longestStreak
      } else if (isAll) {
        diff = a.allTimeCount - b.allTimeCount
      } else {
        diff = (a.windowRate ?? -1) - (b.windowRate ?? -1) || a.windowCount - b.windowCount
      }
      if (diff !== 0) return sortAsc ? diff : -diff
      return a.topic.name.localeCompare(b.topic.name)
    })
    return list
  })()

  const hiddenCount = Math.max(0, sorted.length - DEFAULT_VISIBLE_TOPICS)
  const visibleRows = expanded || hiddenCount === 0 ? sorted : sorted.slice(0, DEFAULT_VISIBLE_TOPICS)

  return (
    <figure className="ci-fig" aria-label={t(isAll ? 'topicRanking' : 'topicBreakdown')}>
      <div className="ci-fig-head">
        <h3 className="ci-fig-title">{t(isAll ? 'topicRanking' : 'topicBreakdown')}</h3>
        <div className="ci-fig-controls">
          <div className="ci-mini-filter">
            <select
              className="ci-mini-select"
              aria-label={t('sortBy')}
              value={sortBy}
              onChange={event => setSortBy(event.target.value as 'primary' | 'streak' | 'default')}
            >
              <option value="primary">{t(isAll ? 'sortCount' : 'sortRate')}</option>
              <option value="streak">{t('sortStreak')}</option>
              <option value="default">{t('sortDefault')}</option>
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </div>
          <button
            type="button"
            className="ci-mini-btn"
            aria-label={t(sortAsc ? 'sortAsc' : 'sortDesc')}
            aria-pressed={sortAsc}
            onClick={() => setSortAsc(prev => !prev)}
          >
            {sortAsc ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="ci-mini-btn"
            aria-pressed={tableMode}
            onClick={() => setTableMode(prev => !prev)}
          >
            {tableMode ? <BarChart3 size={13} aria-hidden="true" /> : <Table2 size={13} aria-hidden="true" />}
            <span>{t(tableMode ? 'viewChart' : 'viewTable')}</span>
          </button>
        </div>
      </div>

      {tableMode ? (
        <div className="ci-table-wrap">
          <table className="ci-table">
            <caption className="ci-sr-only">{t(isAll ? 'topicRanking' : 'topicBreakdown')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('colTopic')}</th>
                <th scope="col" className="ci-num">{t(isAll ? 'colCompleted' : 'colWindow')}</th>
                <th scope="col" className="ci-num">{t('colStreak')}</th>
                <th scope="col" className="ci-num">{t('colBest')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.topic.id}>
                  <th scope="row" className="ci-cell-name">{row.topic.name}</th>
                  <td className="ci-num">
                    {isAll
                      ? formatCompactCount(row.allTimeCount)
                      : `${formatPct(row.windowRate)} (${row.windowCount}/${stats.summary.elapsedDays ?? 0})`}
                  </td>
                  <td className="ci-num">{t('daysUnit', { n: row.currentStreak })}</td>
                  <td className="ci-num">{t('daysUnit', { n: row.longestStreak })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="ci-meter-list">
            {visibleRows.map(row => {
              const widthPct = isAll
                ? (maxAllTime > 0 ? (row.allTimeCount / maxAllTime) * 100 : 0)
                : ((row.windowRate ?? 0) * 100)
              const statLabel = isAll
                ? formatCompactCount(row.allTimeCount)
                : `${formatPct(row.windowRate)} · ${row.windowCount}/${stats.summary.elapsedDays ?? 0}`
              const targetDate = row.lastCompletedDate ?? today
              return (
                <div className="ci-meter-item" key={row.topic.id}>
                  <button
                    type="button"
                    className="ci-meter-btn"
                    onClick={() => onSelectTopic(row.topic.id)}
                  >
                    <div className="ci-meter-top">
                      <span className="ci-meter-name" title={row.topic.name}>{row.topic.name}</span>
                      <span className="ci-meter-stat">{statLabel}</span>
                    </div>
                    <div className="ci-meter-track" aria-hidden="true">
                      <div className="ci-meter-fill" style={{ width: `${Math.max(0, Math.min(100, widthPct))}%` }} />
                    </div>
                    <div className="ci-meter-meta">
                      {row.streakStatus === 'done_today' && <Check size={12} className="ci-good-icon" aria-hidden="true" />}
                      {row.streakStatus === 'pending_today' && <Clock size={12} className="ci-warn-icon" aria-hidden="true" />}
                      <span>{t('topicMeta', { streak: row.currentStreak, best: row.longestStreak })}</span>
                      {row.streakStatus === 'pending_today' && <span>· {t('streakPendingToday')}</span>}
                      {row.lastCompletedDate && <span>· {t('topicLastDate', { date: shortDate(row.lastCompletedDate) })}</span>}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="ci-icon ci-meter-cal"
                    aria-label={t('openTopicCalendar', { name: row.topic.name })}
                    onClick={() => onOpenCalendar({ date: targetDate, month: targetDate.slice(0, 7), topicId: row.topic.id })}
                  >
                    <CalendarDays size={14} aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="ci-fold-btn"
              aria-expanded={expanded}
              onClick={() => setExpanded(prev => !prev)}
            >
              {expanded
                ? t('showLessTopics')
                : t('showMoreTopics', { n: hiddenCount, total: sorted.length })}
            </button>
          )}
        </>
      )}
    </figure>
  )
}

function HeatmapSection({
  stats,
  today,
  singleTopicView,
  t,
  onOpenCalendar,
}: {
  stats: StatsSnapshot
  today: string
  singleTopicView: boolean
  t: Translator
  onOpenCalendar: (target: CalendarDrilldown) => void
}) {
  const [tableMode, setTableMode] = useState(false)
  const [showOlderMonths, setShowOlderMonths] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const cells = stats.heatmap
  const isMonth = stats.heatmapGranularity === 'month'
  const activeCell = activeKey !== null ? cells.find(cell => cell.key === activeKey) ?? null : null

  const cellSummary = (cell: HeatmapCell): string => {
    if (isMonth) {
      const rate = cell.possible > 0 ? cell.completed / cell.possible : null
      return t('readoutMonth', { done: cell.completed, total: cell.possible, pct: formatPct(rate), month: cell.key })
    }
    if (cell.future) return t('readoutDayFuture', { date: cell.key })
    const wd = t(WEEK[cell.slot] ?? 'mon')
    if (singleTopicView) {
      return t('readoutDaySingle', { status: t(cell.completed > 0 ? 'completed' : 'incomplete'), date: cell.key, weekday: wd })
    }
    const rate = cell.possible > 0 ? cell.completed / cell.possible : null
    return t('readoutDay', { done: cell.completed, total: cell.possible, pct: formatPct(rate), date: cell.key, weekday: wd })
  }

  const triggerCell = (cell: HeatmapCell) => {
    if (cell.future) return
    if (isMonth) {
      const targetDate = today.startsWith(cell.key) ? today : `${cell.key}-01`
      onOpenCalendar({ month: cell.key, date: targetDate })
    } else {
      onOpenCalendar({ date: cell.key, month: cell.key.slice(0, 7) })
    }
  }

  // Group cells for 90d (7-column vertical weeks) or all-time (year -> 6-col months).
  const weeks90: { label: string; cells: (HeatmapCell | null)[] }[] = []
  if (stats.preset === '90d' && cells.length > 0) {
    const padded: (HeatmapCell | null)[] = [...Array<null>(cells[0]!.slot).fill(null), ...cells]
    while (padded.length % 7 !== 0) padded.push(null)
    for (let i = 0; i < padded.length; i += 7) {
      const row = padded.slice(i, i + 7)
      const firstOfMonth = row.find(item => item !== null && item.key.endsWith('-01'))
      const firstNonNull = row.find(item => item !== null)
      const label = firstOfMonth
        ? firstOfMonth.key.slice(5, 7)
        : (i === 0 && firstNonNull ? firstNonNull.key.slice(5, 7) : '')
      weeks90.push({ label: label ? `${Number(label)}M` : '', cells: row })
    }
  }

  const paddedCalendar: (HeatmapCell | null)[] = []
  if ((stats.preset === '30d' || stats.preset === 'month') && cells.length > 0) {
    paddedCalendar.push(...Array<null>(cells[0]!.slot).fill(null), ...cells)
    while (paddedCalendar.length % 7 !== 0) paddedCalendar.push(null)
  }

  const hiddenMonths = isMonth ? Math.max(0, cells.length - DEFAULT_VISIBLE_MONTHS) : 0
  const visibleMonthCells = isMonth && !showOlderMonths && hiddenMonths > 0
    ? cells.slice(cells.length - DEFAULT_VISIBLE_MONTHS)
    : cells

  const yearGroups: { year: string; cells: HeatmapCell[] }[] = []
  if (isMonth) {
    for (const cell of visibleMonthCells) {
      const year = cell.key.slice(0, 4)
      const last = yearGroups[yearGroups.length - 1]
      if (last && last.year === year) last.cells.push(cell)
      else yearGroups.push({ year, cells: [cell] })
    }
  }

  return (
    <figure className="ci-fig" aria-label={t('heatmapTitle')}>
      <div className="ci-fig-head">
        <h3 className="ci-fig-title">{t('heatmapTitle')}</h3>
        <div className="ci-fig-controls">
          <button
            type="button"
            className="ci-mini-btn"
            aria-pressed={tableMode}
            onClick={() => setTableMode(prev => !prev)}
          >
            {tableMode ? <BarChart3 size={13} aria-hidden="true" /> : <Table2 size={13} aria-hidden="true" />}
            <span>{t(tableMode ? 'viewChart' : 'viewTable')}</span>
          </button>
        </div>
      </div>

      {cells.length === 0 ? (
        <p className="ci-hint">{t('statsEmptyAll')}</p>
      ) : tableMode ? (
        <div className="ci-table-wrap">
          <table className="ci-table">
            <caption className="ci-sr-only">{t('heatmapTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t(isMonth ? 'colMonth' : 'colDate')}</th>
                <th scope="col" className="ci-num">{t('colCompleted')}</th>
                <th scope="col" className="ci-num">{t('colRate')}</th>
              </tr>
            </thead>
            <tbody>
              {cells.filter(cell => !cell.future).map(cell => (
                <tr key={cell.key}>
                  <th scope="row">{cell.key}</th>
                  <td className="ci-num">{`${cell.completed}/${cell.possible}`}</td>
                  <td className="ci-num">{formatPct(cell.possible > 0 ? cell.completed / cell.possible : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {stats.preset === '7d' && (
            <>
              <div className="ci-heat-dow" aria-hidden="true">
                {cells.map(cell => <span key={cell.key}>{t(WEEK[cell.slot] ?? 'mon')}</span>)}
              </div>
              <div className="ci-heat-grid">
                {cells.map(cell => (
                  <button
                    key={cell.key}
                    type="button"
                    className="ci-heat-cell"
                    data-date={cell.key}
                    data-level={cell.level}
                    data-future={cell.future}
                    data-active={activeKey === cell.key}
                    disabled={cell.future}
                    aria-label={cellSummary(cell)}
                    onMouseEnter={() => setActiveKey(cell.key)}
                    onFocus={() => setActiveKey(cell.key)}
                    onClick={() => triggerCell(cell)}
                  >
                    {Number(cell.key.slice(-2))}
                  </button>
                ))}
              </div>
            </>
          )}

          {(stats.preset === '30d' || stats.preset === 'month') && (
            <>
              <div className="ci-heat-dow" aria-hidden="true">
                {WEEK.map(day => <span key={day}>{t(day)}</span>)}
              </div>
              <div className="ci-heat-grid">
                {paddedCalendar.map((cell, index) => (
                  cell ? (
                    <button
                      key={cell.key}
                      type="button"
                      className="ci-heat-cell"
                      data-date={cell.key}
                      data-level={cell.level}
                      data-future={cell.future}
                      data-active={activeKey === cell.key}
                      disabled={cell.future}
                      aria-label={cellSummary(cell)}
                      onMouseEnter={() => setActiveKey(cell.key)}
                      onFocus={() => setActiveKey(cell.key)}
                      onClick={() => triggerCell(cell)}
                    >
                      {Number(cell.key.slice(-2))}
                    </button>
                  ) : (
                    <span key={`pad-${index}`} className="ci-heat-spacer" aria-hidden="true" />
                  )
                ))}
              </div>
            </>
          )}

          {stats.preset === '90d' && (
            <>
              <div className="ci-heat-dow-90" aria-hidden="true">
                <span />
                {WEEK.map(day => <span key={day}>{t(day)}</span>)}
              </div>
              <div className="ci-heat-90">
                {weeks90.map((row, rowIndex) => (
                  <div className="ci-heat-90-row" key={rowIndex}>
                    <span className="ci-heat-row-label" aria-hidden="true">{row.label}</span>
                    {row.cells.map((cell, colIndex) => (
                      cell ? (
                        <button
                          key={cell.key}
                          type="button"
                          className="ci-heat-cell ci-heat-cell-compact"
                          data-date={cell.key}
                          data-level={cell.level}
                          data-future={cell.future}
                          data-active={activeKey === cell.key}
                          disabled={cell.future}
                          aria-label={cellSummary(cell)}
                          onMouseEnter={() => setActiveKey(cell.key)}
                          onFocus={() => setActiveKey(cell.key)}
                          onClick={() => triggerCell(cell)}
                        />
                      ) : (
                        <span key={`p-${rowIndex}-${colIndex}`} className="ci-heat-spacer" aria-hidden="true" />
                      )
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {isMonth && (
            <>
              {hiddenMonths > 0 && (
                <button
                  type="button"
                  className="ci-fold-btn"
                  aria-expanded={showOlderMonths}
                  style={{ marginTop: 0, marginBottom: 10 }}
                  onClick={() => setShowOlderMonths(prev => !prev)}
                >
                  {showOlderMonths ? t('heatmapHideOlder') : t('heatmapShowOlder', { n: hiddenMonths })}
                </button>
              )}
              {yearGroups.map(group => (
                <div className="ci-heat-year-group" key={group.year}>
                  <p className="ci-heat-year-label">{group.year}</p>
                  <div className="ci-heat-months">
                    {group.cells.map(cell => (
                      <button
                        key={cell.key}
                        type="button"
                        className="ci-heat-cell ci-heat-cell-month"
                        data-month={cell.key}
                        data-level={cell.level}
                        data-active={activeKey === cell.key}
                        aria-label={cellSummary(cell)}
                        onMouseEnter={() => setActiveKey(cell.key)}
                        onFocus={() => setActiveKey(cell.key)}
                        onClick={() => triggerCell(cell)}
                      >
                        <span>{cell.slot}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="ci-readout" aria-live="polite" data-testid="heatmap-readout">
            {activeCell
              ? <span className="ci-readout-strong">{cellSummary(activeCell)}</span>
              : <span>{t(isMonth ? 'readoutHintMonth' : 'readoutHintDay')}</span>}
          </div>

          <div className="ci-heat-legend" aria-hidden="true">
            {singleTopicView && !isMonth ? (
              <>
                <span className="ci-heat-swatch" data-level="0" />
                <span>{t('incomplete')}</span>
                <span className="ci-heat-swatch" data-level="4" style={{ marginLeft: 8 }} />
                <span>{t('completed')}</span>
              </>
            ) : (
              <>
                <span>{t('heatmapLess')}</span>
                {[0, 1, 2, 3, 4].map(level => <span key={level} className="ci-heat-swatch" data-level={level} />)}
                <span>{t('heatmapMore')}</span>
              </>
            )}
          </div>
        </>
      )}
    </figure>
  )
}

function TrendSection({ trend, t }: { trend: TrendBucket[]; t: Translator }) {
  const [tableMode, setTableMode] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const bandRefs = useRef<(SVGRectElement | null)[]>([])

  useEffect(() => { setActiveIndex(null) }, [trend])

  if (trend.length === 0) return null

  const width = 320
  const height = 144
  const left = 36
  const right = 308
  const top = 14
  const bottom = 114
  const plotW = right - left
  const plotH = bottom - top

  const xAt = (index: number) => trend.length === 1 ? left + plotW / 2 : left + (index / (trend.length - 1)) * plotW
  const yAt = (rate: number) => bottom - Math.max(0, Math.min(1, rate)) * plotH

  const points = trend.map((bucket, index) => ({ x: xAt(index), y: yAt(bucket.rate), bucket }))
  const linePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPoints = points.length >= 2
    ? `${points[0]!.x.toFixed(1)},${bottom} ${linePoints} ${points[points.length - 1]!.x.toFixed(1)},${bottom}`
    : ''
  const bandW = plotW / trend.length
  const active = activeIndex !== null ? points[activeIndex] ?? null : null

  const onBandKey = (event: KeyboardEvent<SVGRectElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    else if (event.key === 'ArrowRight') next = Math.min(trend.length - 1, index + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = trend.length - 1
    else return
    event.preventDefault()
    setActiveIndex(next)
    bandRefs.current[next]?.focus()
  }

  const labelFor = (bucket: TrendBucket) =>
    t('trendReadout', { pct: formatPct(bucket.rate), done: bucket.completed, total: bucket.possible, from: bucket.from, to: bucket.to })

  return (
    <figure className="ci-fig" aria-label={t('trendTitle')}>
      <div className="ci-fig-head">
        <h3 className="ci-fig-title">{t('trendTitle')}</h3>
        <div className="ci-fig-controls">
          <button
            type="button"
            className="ci-mini-btn"
            aria-pressed={tableMode}
            onClick={() => setTableMode(prev => !prev)}
          >
            {tableMode ? <BarChart3 size={13} aria-hidden="true" /> : <Table2 size={13} aria-hidden="true" />}
            <span>{t(tableMode ? 'viewChart' : 'viewTable')}</span>
          </button>
        </div>
      </div>

      {tableMode ? (
        <div className="ci-table-wrap">
          <table className="ci-table">
            <caption className="ci-sr-only">{t('trendTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('colPeriod')}</th>
                <th scope="col" className="ci-num">{t('colCompleted')}</th>
                <th scope="col" className="ci-num">{t('colRate')}</th>
              </tr>
            </thead>
            <tbody>
              {trend.map(bucket => (
                <tr key={bucket.key}>
                  <th scope="row">{`${bucket.from} – ${bucket.to}`}</th>
                  <td className="ci-num">{`${bucket.completed}/${bucket.possible}`}</td>
                  <td className="ci-num">{formatPct(bucket.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <svg className="ci-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t('trendTitle')}>
            {[0, 0.5, 1].map(tick => {
              const y = yAt(tick)
              return (
                <g key={tick}>
                  <line className="ci-svg-grid" x1={left} x2={right} y1={y} y2={y} />
                  <text className="ci-svg-axis" x={left - 6} y={y + 3} textAnchor="end">{`${Math.round(tick * 100)}%`}</text>
                </g>
              )
            })}
            {areaPoints && <polygon points={areaPoints} fill="var(--ci-area-wash)" />}
            {points.length >= 2 && (
              <polyline
                points={linePoints}
                fill="none"
                stroke="var(--ci-mark-primary)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {points.length === 1 && (
              <circle cx={points[0]!.x} cy={points[0]!.y} r={4} fill="var(--ci-mark-primary)" />
            )}
            {active && (
              <>
                <line className="ci-svg-crosshair" x1={active.x} x2={active.x} y1={top} y2={bottom} />
                <circle cx={active.x} cy={active.y} r={4} fill="var(--ci-mark-primary)" stroke="var(--ci-bg)" strokeWidth={1.5} />
              </>
            )}
            <text className="ci-svg-axis" x={left} y={height - 8} textAnchor="start">{trend[0]!.key}</text>
            {trend.length >= 2 && (
              <text className="ci-svg-axis" x={right} y={height - 8} textAnchor="end">{trend[trend.length - 1]!.key}</text>
            )}
            {points.map((point, index) => (
              <rect
                key={point.bucket.key}
                ref={element => { bandRefs.current[index] = element }}
                className="ci-svg-band"
                x={left + index * bandW}
                y={top}
                width={bandW}
                height={plotH}
                tabIndex={0}
                role="button"
                aria-label={labelFor(point.bucket)}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={event => onBandKey(event, index)}
              />
            ))}
          </svg>
          <div className="ci-readout" aria-live="polite" data-testid="trend-readout">
            {active
              ? <span className="ci-readout-strong">{labelFor(active.bucket)}</span>
              : <span>{t('trendHint')}</span>}
          </div>
        </>
      )}
    </figure>
  )
}

function WeekdaySection({ weekdays, isAll, t }: { weekdays: WeekdayStat[]; isAll: boolean; t: Translator }) {
  const [tableMode, setTableMode] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const bandRefs = useRef<(SVGRectElement | null)[]>([])

  useEffect(() => { setActiveIndex(null) }, [weekdays, isAll])

  const width = 320
  const height = 136
  const left = 36
  const right = 308
  const top = 20
  const bottom = 108
  const plotW = right - left
  const plotH = bottom - top
  const colW = plotW / 7
  const barW = 16

  const maxCount = weekdays.reduce((max, item) => Math.max(max, item.completed), 0)
  const valueOf = (item: WeekdayStat): number | null => isAll ? item.completed : item.rate
  const ratioOf = (item: WeekdayStat): number => {
    if (isAll) return maxCount > 0 ? item.completed / maxCount : 0
    return item.rate ?? 0
  }

  let bestIndex = -1
  let worstIndex = -1
  let bestVal = -1
  let worstVal = Number.POSITIVE_INFINITY
  for (let i = 0; i < weekdays.length; i += 1) {
    const val = valueOf(weekdays[i]!)
    if (val === null) continue
    if (val > bestVal) { bestVal = val; bestIndex = i }
    if (val < worstVal) { worstVal = val; worstIndex = i }
  }
  if (bestVal <= 0) { bestIndex = -1; worstIndex = -1 }
  else if (bestIndex === worstIndex || bestVal === worstVal) { worstIndex = -1 }

  const onBandKey = (event: KeyboardEvent<SVGRectElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    else if (event.key === 'ArrowRight') next = Math.min(6, index + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 6
    else return
    event.preventDefault()
    setActiveIndex(next)
    bandRefs.current[next]?.focus()
  }

  const readoutFor = (item: WeekdayStat): string => {
    const weekday = t(WEEK[item.weekday] ?? 'mon')
    if (isAll) return t('weekdayReadoutCount', { done: item.completed, weekday })
    return t('weekdayReadoutRate', { pct: formatPct(item.rate), done: item.completed, total: item.possible, weekday })
  }

  const active = activeIndex !== null ? weekdays[activeIndex] ?? null : null
  const yTicks = isAll
    ? [0, Math.round(maxCount / 2), Math.max(1, maxCount)]
    : [0, 0.5, 1]

  return (
    <figure className="ci-fig" aria-label={t('weekdayTitle')}>
      <div className="ci-fig-head">
        <h3 className="ci-fig-title">{t('weekdayTitle')}</h3>
        <div className="ci-fig-controls">
          <button
            type="button"
            className="ci-mini-btn"
            aria-pressed={tableMode}
            onClick={() => setTableMode(prev => !prev)}
          >
            {tableMode ? <BarChart3 size={13} aria-hidden="true" /> : <Table2 size={13} aria-hidden="true" />}
            <span>{t(tableMode ? 'viewChart' : 'viewTable')}</span>
          </button>
        </div>
      </div>

      {tableMode ? (
        <div className="ci-table-wrap">
          <table className="ci-table">
            <caption className="ci-sr-only">{t('weekdayTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('colWeekday')}</th>
                <th scope="col" className="ci-num">{t('colCompleted')}</th>
                {!isAll && <th scope="col" className="ci-num">{t('colRate')}</th>}
              </tr>
            </thead>
            <tbody>
              {weekdays.map(item => (
                <tr key={item.weekday}>
                  <th scope="row">{t(WEEK[item.weekday] ?? 'mon')}</th>
                  <td className="ci-num">{isAll ? formatCompactCount(item.completed) : `${item.completed}/${item.possible}`}</td>
                  {!isAll && <td className="ci-num">{formatPct(item.rate)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <svg className="ci-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t('weekdayTitle')}>
            {yTicks.map((tick, tickIdx) => {
              const ratio = isAll ? (maxCount > 0 ? tick / maxCount : tickIdx / 2) : tick
              const y = bottom - ratio * plotH
              const label = isAll ? String(tick) : `${Math.round(tick * 100)}%`
              return (
                <g key={`${tick}-${tickIdx}`}>
                  <line className="ci-svg-grid" x1={left} x2={right} y1={y} y2={y} />
                  <text className="ci-svg-axis" x={left - 6} y={y + 3} textAnchor="end">{label}</text>
                </g>
              )
            })}
            {weekdays.map((item, index) => {
              const cx = left + (index + 0.5) * colW
              const barH = ratioOf(item) * plotH
              const barY = bottom - barH
              const directLabel = index === bestIndex || index === worstIndex
                ? (isAll ? String(item.completed) : `${Math.round((item.rate ?? 0) * 100)}%`)
                : null
              return (
                <g key={item.weekday}>
                  {barH > 0 && (
                    <path
                      d={roundedTopBarPath(cx - barW / 2, barY, barW, barH, 4)}
                      fill="var(--ci-mark-primary)"
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.45}
                    />
                  )}
                  {directLabel && (
                    <text className="ci-svg-label" x={cx} y={Math.max(12, barY - 5)} textAnchor="middle">
                      {directLabel}
                    </text>
                  )}
                  <text className="ci-svg-axis" x={cx} y={height - 8} textAnchor="middle">
                    {t(WEEK[item.weekday] ?? 'mon')}
                  </text>
                  <rect
                    ref={element => { bandRefs.current[index] = element }}
                    className="ci-svg-band"
                    x={left + index * colW}
                    y={top}
                    width={colW}
                    height={plotH}
                    tabIndex={0}
                    role="button"
                    aria-label={readoutFor(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onKeyDown={event => onBandKey(event, index)}
                  />
                </g>
              )
            })}
          </svg>
          <div className="ci-readout" aria-live="polite" data-testid="weekday-readout">
            {active
              ? <span className="ci-readout-strong">{readoutFor(active)}</span>
              : <span>{t('weekdayHint')}</span>}
          </div>
        </>
      )}
    </figure>
  )
}

/** Main statistics view combining Today Strip, global filter bar, KPIs, comparison list, heatmap, trend, and weekday rhythm. */
export function StatsView({ state, controller, t, onCreateTopic, onOpenCalendar, failureKey }: StatsViewProps) {
  const [rangeOpen, setRangeOpen] = useState(false)
  const { stats, busy } = state
  const today = state.statsToday ?? state.data?.today ?? ''

  if (state.statsLoading && !stats) {
    return <div className="ci-status" role="status">{t('statsLoading')}</div>
  }

  const notice = state.statsNotice === 'topicDeleted' && (
    <div className="ci-notice" role="status">
      <span>{t('statsTopicDeleted')}</span>
      <button type="button" className="ci-icon" aria-label={t('dismiss')} onClick={() => controller.clearStatsNotice()}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )

  const errorBanner = state.statsError && (
    <div className="ci-alert" role="alert">
      <span>{t(failureKey(state.statsError))}</span>
      <button type="button" className="ci-button" disabled={busy} onClick={() => { void controller.refreshStats(false) }}>
        {t('retry')}
      </button>
    </div>
  )

  if (!stats) {
    return (
      <>
        {notice}
        {errorBanner}
      </>
    )
  }

  if (stats.catalog.length === 0) {
    return (
      <>
        {notice}
        {errorBanner}
        <div className="ci-empty">
          <BarChart3 className="ci-empty-icon" size={36} strokeWidth={1.5} aria-hidden="true" />
          <h3>{t('empty')}</h3>
          <p>{t('emptyHint')}</p>
          <button type="button" className="ci-button" disabled={busy} onClick={onCreateTopic}>
            <Plus size={16} aria-hidden="true" />
            {t('add')}
          </button>
        </div>
      </>
    )
  }

  const singleTopicView = stats.catalog.length === 1 || state.topicId !== ''
  const activeTopic = singleTopicView ? stats.topics[0] ?? null : null
  const isAll = stats.preset === 'all'
  const isFutureMonth = stats.preset === 'month' && stats.effectiveTo === null

  const todayPct = stats.summary.todayTotalCount > 0
    ? (stats.summary.todayDoneCount / stats.summary.todayTotalCount) * 100
    : 0

  const windowText = isAll
    ? t('windowAllSummary', { from: stats.from, to: stats.to })
    : isFutureMonth
      ? t('windowFutureSummary', { from: stats.from, to: stats.to })
      : t('windowSummary', { from: stats.from, to: stats.effectiveTo ?? stats.to, days: stats.summary.elapsedDays ?? 0 })

  const hasEmptyWindow = stats.summary.completedCheckins === 0 && !isFutureMonth

  return (
    <div>
      {notice}
      {errorBanner}

      <section className="ci-today-strip" aria-label={t('today')}>
        {!singleTopicView ? (
          <>
            <div className="ci-today-row">
              <span className="ci-today-label">
                {t('todayProgress', { done: stats.summary.todayDoneCount, total: stats.summary.todayTotalCount })}
              </span>
              <button
                type="button"
                className="ci-link-btn"
                onClick={() => onOpenCalendar({ date: today, month: today.slice(0, 7) })}
              >
                <span>{t('goToday')}</span>
              </button>
            </div>
            <div className="ci-today-meter" aria-hidden="true">
              <div className="ci-today-fill" style={{ width: `${Math.max(0, Math.min(100, todayPct))}%` }} />
            </div>
          </>
        ) : activeTopic ? (
          <div className="ci-today-row">
            <div className="ci-today-topic">
              {stats.catalog.length >= 2 && (
                <button
                  type="button"
                  className="ci-icon"
                  aria-label={t('backAllTopics')}
                  onClick={() => controller.setTopicId('')}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                role="checkbox"
                className="ci-toggle"
                aria-checked={activeTopic.completedToday}
                aria-label={t(activeTopic.completedToday ? 'unset' : 'set', { name: activeTopic.topic.name })}
                disabled={busy || !today}
                onClick={() => {
                  void controller.mutate((api, signal) => api.set({
                    topicId: activeTopic.topic.id,
                    date: today,
                    completed: !activeTopic.completedToday,
                  }, signal))
                }}
              >
                {activeTopic.completedToday && <Check size={16} aria-hidden="true" />}
              </button>
              <span className="ci-today-topic-name">{activeTopic.topic.name}</span>
            </div>
            <div className="ci-today-actions">
              <button
                type="button"
                className="ci-link-btn"
                onClick={() => {
                  const target = activeTopic.lastCompletedDate ?? today
                  onOpenCalendar({ date: target, month: target.slice(0, 7), topicId: activeTopic.topic.id })
                }}
              >
                <CalendarDays size={13} aria-hidden="true" />
                <span>{t('viewInCalendar')}</span>
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="ci-stats-filters">
        <Menu
          open={rangeOpen}
          onClose={() => setRangeOpen(false)}
          align="start"
          portal
          dense
          items={PRESETS.map(item => ({
            id: item.id,
            label: t(item.key),
            ...(state.statsPreset === item.id ? { icon: <Check size={16} aria-hidden="true" /> } : {}),
            disabled: busy,
          }))}
          onSelect={id => {
            setRangeOpen(false)
            if (busy) return
            controller.setStatsFilter(id as StatsPreset)
          }}
          anchor={(
            <Button
              size="md"
              variant="outline"
              className="ci-range-trigger"
              aria-label={t('statsRange')}
              aria-haspopup="menu"
              aria-expanded={rangeOpen}
              disabled={busy}
              onClick={() => setRangeOpen(open => !open)}
            >
              <span>{t(presetLabelKey(state.statsPreset))}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </Button>
          )}
        />
        <div className="ci-filter">
          <select
            className="ci-select"
            aria-label={t('filter')}
            value={state.topicId}
            onChange={event => controller.setTopicId(event.target.value as TopicId | '')}
          >
            <option value="">{t('all')}</option>
            {stats.catalog.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
        <button
          type="button"
          className="ci-icon"
          aria-label={t('statsRefresh')}
          disabled={busy}
          onClick={() => { void controller.refreshStats(false) }}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="ci-stats-window">
        <span className="ci-stats-window-text">{windowText}</span>
        {stats.preset === 'month' && stats.month && (
          <div className="ci-month-steppers">
            <button
              type="button"
              className="ci-icon"
              aria-label={t('prev')}
              disabled={busy || stats.month === '0001-01'}
              onClick={() => controller.setStatsFilter('month', shiftMonth(stats.month!, -1))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ci-icon"
              aria-label={t('next')}
              disabled={busy || stats.month === '9999-12'}
              onClick={() => controller.setStatsFilter('month', shiftMonth(stats.month!, 1))}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="ci-stats-body" data-refreshing={state.statsRefreshing}>
        {!singleTopicView ? (
          <div className="ci-kpi-grid">
            <div className="ci-kpi">
              <span className="ci-kpi-label">{t(isAll ? 'kpiActiveDays' : 'kpiRate')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">
                  {isAll ? formatCompactCount(stats.summary.activeDays) : formatPct(stats.summary.completionRate)}
                </span>
                {!isAll && <DeltaBadge deltaPp={stats.summary.comparison?.rateDeltaPp ?? null} t={t} />}
              </div>
              <div className="ci-kpi-sub">
                <span className="ci-kpi-sub-text">
                  {isAll
                    ? (stats.summary.firstCompletedDate ? t('kpiFirstSub', { date: stats.summary.firstCompletedDate }) : t('kpiNoRecord'))
                    : (stats.summary.comparison ? t('kpiVsPrior') : t('kpiNoPrior'))}
                </span>
              </div>
            </div>

            <div className="ci-kpi">
              <span className="ci-kpi-label">{t(isAll ? 'kpiTotalCheckins' : 'kpiCheckins')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">{formatCompactCount(stats.summary.completedCheckins)}</span>
              </div>
              <div className="ci-kpi-sub">
                <span className="ci-kpi-sub-text">
                  {isAll
                    ? (stats.summary.lastCompletedDate ? t('kpiSpanSub', { date: stats.summary.lastCompletedDate }) : t('kpiNoRecord'))
                    : t('kpiActiveSub', { active: stats.summary.activeDays, days: stats.summary.elapsedDays ?? 0 })}
                </span>
              </div>
            </div>

            <div className="ci-kpi">
              <span className="ci-kpi-label">{t('kpiPerfectDays')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">{t('daysUnit', { n: stats.summary.perfectDays })}</span>
              </div>
              <div className="ci-kpi-sub">
                <span className="ci-kpi-sub-text">
                  {!isAll && stats.summary.elapsedDays && stats.summary.elapsedDays > 0
                    ? t('kpiPerfectSub', { pct: formatPct(stats.summary.perfectDays / stats.summary.elapsedDays) })
                    : '—'}
                </span>
              </div>
            </div>

            <div className="ci-kpi">
              <span className="ci-kpi-label">{t('kpiLongestStreak')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">{t('daysUnit', { n: stats.summary.longestStreak })}</span>
              </div>
              <div className="ci-kpi-sub">
                <span
                  className="ci-kpi-sub-text"
                  title={stats.summary.longestStreakTopicName ?? undefined}
                >
                  {stats.summary.longestStreakTopicName ?? t('kpiNoRecord')}
                </span>
              </div>
            </div>
          </div>
        ) : activeTopic ? (
          <div className="ci-kpi-grid">
            <div className="ci-kpi">
              <span className="ci-kpi-label">{t(isAll ? 'kpiTotalCheckins' : 'kpiRate')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">
                  {isAll ? formatCompactCount(activeTopic.allTimeCount) : formatPct(activeTopic.windowRate)}
                </span>
                {!isAll && <DeltaBadge deltaPp={stats.summary.comparison?.rateDeltaPp ?? null} t={t} />}
              </div>
              <div className="ci-kpi-sub">
                <span className="ci-kpi-sub-text">
                  {isAll
                    ? (activeTopic.lastCompletedDate ? t('kpiSpanSub', { date: activeTopic.lastCompletedDate }) : t('kpiNoRecord'))
                    : (stats.summary.comparison ? t('kpiVsPrior') : t('kpiNoPrior'))}
                </span>
              </div>
            </div>

            <div className="ci-kpi">
              <span className="ci-kpi-label">{t(isAll ? 'kpiFirstCheckin' : 'kpiCheckins')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">
                  {isAll ? (activeTopic.firstCompletedDate ?? '—') : formatCompactCount(activeTopic.windowCount)}
                </span>
              </div>
              <div className="ci-kpi-sub">
                <span className="ci-kpi-sub-text">
                  {isAll
                    ? (activeTopic.lastCompletedDate ? t('kpiSpanSub', { date: activeTopic.lastCompletedDate }) : t('kpiNoRecord'))
                    : t('kpiActiveSub', { active: stats.summary.activeDays, days: stats.summary.elapsedDays ?? 0 })}
                </span>
              </div>
            </div>

            <div className="ci-kpi">
              <span className="ci-kpi-label">{t('kpiCurrentStreak')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">{t('daysUnit', { n: activeTopic.currentStreak })}</span>
              </div>
              <div className="ci-kpi-sub">
                {activeTopic.streakStatus === 'done_today' && <Check size={12} className="ci-good-icon" aria-hidden="true" />}
                {activeTopic.streakStatus === 'pending_today' && <Clock size={12} className="ci-warn-icon" aria-hidden="true" />}
                <span className="ci-kpi-sub-text">
                  {t(activeTopic.streakStatus === 'done_today'
                    ? 'streakDoneToday'
                    : activeTopic.streakStatus === 'pending_today'
                      ? 'streakPendingToday'
                      : 'streakBroken')}
                </span>
              </div>
            </div>

            <div className="ci-kpi">
              <span className="ci-kpi-label">{t('kpiLongestStreak')}</span>
              <div className="ci-kpi-main">
                <span className="ci-kpi-value">{t('daysUnit', { n: activeTopic.longestStreak })}</span>
              </div>
              <div className="ci-kpi-sub">
                <span className="ci-kpi-sub-text">
                  {activeTopic.longestStreakFrom && activeTopic.longestStreakTo
                    ? t('kpiStreakRange', { from: shortDate(activeTopic.longestStreakFrom), to: shortDate(activeTopic.longestStreakTo) })
                    : t('kpiNoRecord')}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {hasEmptyWindow && (
          <div className="ci-stats-callout" role="status">
            <span>{t(stats.summary.firstCompletedDate !== null ? 'statsEmptyWindow' : 'statsEmptyAll')}</span>
            {stats.summary.firstCompletedDate !== null && !isAll ? (
              <button type="button" className="ci-button" onClick={() => controller.setStatsFilter('all')}>
                {t('switchAllTime')}
              </button>
            ) : stats.summary.firstCompletedDate === null ? (
              <button
                type="button"
                className="ci-button"
                onClick={() => onOpenCalendar({ date: today, month: today.slice(0, 7) })}
              >
                {t('goFirstCheckin')}
              </button>
            ) : null}
          </div>
        )}

        {!singleTopicView && (
          <TopicMeterSection
            stats={stats}
            today={today}
            t={t}
            onSelectTopic={id => controller.setTopicId(id)}
            onOpenCalendar={onOpenCalendar}
          />
        )}

        <HeatmapSection
          stats={stats}
          today={today}
          singleTopicView={singleTopicView}
          t={t}
          onOpenCalendar={onOpenCalendar}
        />

        {singleTopicView && stats.preset !== '7d' && (
          <>
            <TrendSection trend={stats.trend} t={t} />
            <WeekdaySection weekdays={stats.weekdays} isAll={isAll} t={t} />
          </>
        )}

        <p className="ci-hint">{t('statsHint')}</p>
      </div>
    </div>
  )
}
