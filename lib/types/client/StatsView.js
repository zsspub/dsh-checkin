import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Statistics view rendered inside the right-tab panel alongside the calendar view. */
import { useEffect, useRef, useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Plus, RefreshCw, Table2, X, } from 'lucide-react';
import { shiftMonth } from "../stats.js";
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const PRESETS = [
    { id: '7d', key: 'preset7d' },
    { id: '30d', key: 'preset30d' },
    { id: '90d', key: 'preset90d' },
    { id: 'month', key: 'presetMonth' },
    { id: 'all', key: 'presetAll' },
];
const DEFAULT_VISIBLE_TOPICS = 8;
const DEFAULT_VISIBLE_MONTHS = 24;
function formatCompactCount(value) {
    if (value >= 10_000)
        return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString('en-US');
}
function formatPct(rate) {
    if (rate === null)
        return '—';
    return `${(rate * 100).toFixed(1)}%`;
}
function shortDate(date) {
    return date ? date.slice(5) : '—';
}
function presetLabelKey(preset) {
    return PRESETS.find(item => item.id === preset)?.key ?? 'preset30d';
}
function roundedTopBarPath(x, y, w, h, r) {
    if (h <= 0)
        return '';
    const radius = Math.min(r, w / 2, h);
    const bottom = y + h;
    return `M${x},${bottom} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${bottom} Z`;
}
function DeltaBadge({ deltaPp, t }) {
    if (deltaPp === null)
        return _jsx("span", { className: "ci-kpi-sub-text", children: t('kpiNoPrior') });
    const dir = deltaPp > 0 ? 'up' : deltaPp < 0 ? 'down' : 'flat';
    const sign = deltaPp > 0 ? '+' : '';
    return (_jsxs("span", { className: "ci-kpi-delta", "data-dir": dir, children: [dir === 'up' && _jsx(ArrowUp, { size: 12, "aria-hidden": "true" }), dir === 'down' && _jsx(ArrowDown, { size: 12, "aria-hidden": "true" }), _jsx("span", { children: `${sign}${deltaPp.toFixed(1)}pp` })] }));
}
function TopicMeterSection({ stats, today, t, onSelectTopic, onOpenCalendar, }) {
    const [sortBy, setSortBy] = useState('primary');
    const [sortAsc, setSortAsc] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [tableMode, setTableMode] = useState(false);
    const isAll = stats.preset === 'all';
    const maxAllTime = stats.topics.reduce((max, item) => Math.max(max, item.allTimeCount), 0);
    const sorted = (() => {
        if (sortBy === 'default')
            return sortAsc ? [...stats.topics].reverse() : [...stats.topics];
        const list = [...stats.topics];
        list.sort((a, b) => {
            let diff = 0;
            if (sortBy === 'streak') {
                diff = a.currentStreak - b.currentStreak || a.longestStreak - b.longestStreak;
            }
            else if (isAll) {
                diff = a.allTimeCount - b.allTimeCount;
            }
            else {
                diff = (a.windowRate ?? -1) - (b.windowRate ?? -1) || a.windowCount - b.windowCount;
            }
            if (diff !== 0)
                return sortAsc ? diff : -diff;
            return a.topic.name.localeCompare(b.topic.name);
        });
        return list;
    })();
    const hiddenCount = Math.max(0, sorted.length - DEFAULT_VISIBLE_TOPICS);
    const visibleRows = expanded || hiddenCount === 0 ? sorted : sorted.slice(0, DEFAULT_VISIBLE_TOPICS);
    return (_jsxs("figure", { className: "ci-fig", "aria-label": t(isAll ? 'topicRanking' : 'topicBreakdown'), children: [_jsxs("div", { className: "ci-fig-head", children: [_jsx("h3", { className: "ci-fig-title", children: t(isAll ? 'topicRanking' : 'topicBreakdown') }), _jsxs("div", { className: "ci-fig-controls", children: [_jsxs("div", { className: "ci-mini-filter", children: [_jsxs("select", { className: "ci-mini-select", "aria-label": t('sortBy'), value: sortBy, onChange: event => setSortBy(event.target.value), children: [_jsx("option", { value: "primary", children: t(isAll ? 'sortCount' : 'sortRate') }), _jsx("option", { value: "streak", children: t('sortStreak') }), _jsx("option", { value: "default", children: t('sortDefault') })] }), _jsx(ChevronDown, { size: 13, "aria-hidden": "true" })] }), _jsx("button", { type: "button", className: "ci-mini-btn", "aria-label": t(sortAsc ? 'sortAsc' : 'sortDesc'), "aria-pressed": sortAsc, onClick: () => setSortAsc(prev => !prev), children: sortAsc ? _jsx(ArrowUp, { size: 13, "aria-hidden": "true" }) : _jsx(ArrowDown, { size: 13, "aria-hidden": "true" }) }), _jsxs("button", { type: "button", className: "ci-mini-btn", "aria-pressed": tableMode, onClick: () => setTableMode(prev => !prev), children: [tableMode ? _jsx(BarChart3, { size: 13, "aria-hidden": "true" }) : _jsx(Table2, { size: 13, "aria-hidden": "true" }), _jsx("span", { children: t(tableMode ? 'viewChart' : 'viewTable') })] })] })] }), tableMode ? (_jsx("div", { className: "ci-table-wrap", children: _jsxs("table", { className: "ci-table", children: [_jsx("caption", { className: "ci-sr-only", children: t(isAll ? 'topicRanking' : 'topicBreakdown') }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('colTopic') }), _jsx("th", { scope: "col", className: "ci-num", children: t(isAll ? 'colCompleted' : 'colWindow') }), _jsx("th", { scope: "col", className: "ci-num", children: t('colStreak') }), _jsx("th", { scope: "col", className: "ci-num", children: t('colBest') })] }) }), _jsx("tbody", { children: sorted.map(row => (_jsxs("tr", { children: [_jsx("th", { scope: "row", className: "ci-cell-name", children: row.topic.name }), _jsx("td", { className: "ci-num", children: isAll
                                            ? formatCompactCount(row.allTimeCount)
                                            : `${formatPct(row.windowRate)} (${row.windowCount}/${stats.summary.elapsedDays ?? 0})` }), _jsx("td", { className: "ci-num", children: t('daysUnit', { n: row.currentStreak }) }), _jsx("td", { className: "ci-num", children: t('daysUnit', { n: row.longestStreak }) })] }, row.topic.id))) })] }) })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "ci-meter-list", children: visibleRows.map(row => {
                            const widthPct = isAll
                                ? (maxAllTime > 0 ? (row.allTimeCount / maxAllTime) * 100 : 0)
                                : ((row.windowRate ?? 0) * 100);
                            const statLabel = isAll
                                ? formatCompactCount(row.allTimeCount)
                                : `${formatPct(row.windowRate)} · ${row.windowCount}/${stats.summary.elapsedDays ?? 0}`;
                            const targetDate = row.lastCompletedDate ?? today;
                            return (_jsxs("div", { className: "ci-meter-item", children: [_jsxs("button", { type: "button", className: "ci-meter-btn", onClick: () => onSelectTopic(row.topic.id), children: [_jsxs("div", { className: "ci-meter-top", children: [_jsx("span", { className: "ci-meter-name", title: row.topic.name, children: row.topic.name }), _jsx("span", { className: "ci-meter-stat", children: statLabel })] }), _jsx("div", { className: "ci-meter-track", "aria-hidden": "true", children: _jsx("div", { className: "ci-meter-fill", style: { width: `${Math.max(0, Math.min(100, widthPct))}%` } }) }), _jsxs("div", { className: "ci-meter-meta", children: [row.streakStatus === 'done_today' && _jsx(Check, { size: 12, className: "ci-good-icon", "aria-hidden": "true" }), row.streakStatus === 'pending_today' && _jsx(Clock, { size: 12, className: "ci-warn-icon", "aria-hidden": "true" }), _jsx("span", { children: t('topicMeta', { streak: row.currentStreak, best: row.longestStreak }) }), row.streakStatus === 'pending_today' && _jsxs("span", { children: ["\u00B7 ", t('streakPendingToday')] }), row.lastCompletedDate && _jsxs("span", { children: ["\u00B7 ", t('topicLastDate', { date: shortDate(row.lastCompletedDate) })] })] })] }), _jsx("button", { type: "button", className: "ci-icon ci-meter-cal", "aria-label": t('openTopicCalendar', { name: row.topic.name }), onClick: () => onOpenCalendar({ date: targetDate, month: targetDate.slice(0, 7), topicId: row.topic.id }), children: _jsx(CalendarDays, { size: 14, "aria-hidden": "true" }) })] }, row.topic.id));
                        }) }), hiddenCount > 0 && (_jsx("button", { type: "button", className: "ci-fold-btn", "aria-expanded": expanded, onClick: () => setExpanded(prev => !prev), children: expanded
                            ? t('showLessTopics')
                            : t('showMoreTopics', { n: hiddenCount, total: sorted.length }) }))] }))] }));
}
function HeatmapSection({ stats, today, singleTopicView, t, onOpenCalendar, }) {
    const [tableMode, setTableMode] = useState(false);
    const [showOlderMonths, setShowOlderMonths] = useState(false);
    const [activeKey, setActiveKey] = useState(null);
    const cells = stats.heatmap;
    const isMonth = stats.heatmapGranularity === 'month';
    const activeCell = activeKey !== null ? cells.find(cell => cell.key === activeKey) ?? null : null;
    const cellSummary = (cell) => {
        if (isMonth) {
            const rate = cell.possible > 0 ? cell.completed / cell.possible : null;
            return t('readoutMonth', { done: cell.completed, total: cell.possible, pct: formatPct(rate), month: cell.key });
        }
        if (cell.future)
            return t('readoutDayFuture', { date: cell.key });
        const wd = t(WEEK[cell.slot] ?? 'mon');
        if (singleTopicView) {
            return t('readoutDaySingle', { status: t(cell.completed > 0 ? 'completed' : 'incomplete'), date: cell.key, weekday: wd });
        }
        const rate = cell.possible > 0 ? cell.completed / cell.possible : null;
        return t('readoutDay', { done: cell.completed, total: cell.possible, pct: formatPct(rate), date: cell.key, weekday: wd });
    };
    const triggerCell = (cell) => {
        if (cell.future)
            return;
        if (isMonth) {
            const targetDate = today.startsWith(cell.key) ? today : `${cell.key}-01`;
            onOpenCalendar({ month: cell.key, date: targetDate });
        }
        else {
            onOpenCalendar({ date: cell.key, month: cell.key.slice(0, 7) });
        }
    };
    // Group cells for 90d (7-column vertical weeks) or all-time (year -> 6-col months).
    const weeks90 = [];
    if (stats.preset === '90d' && cells.length > 0) {
        const padded = [...Array(cells[0].slot).fill(null), ...cells];
        while (padded.length % 7 !== 0)
            padded.push(null);
        for (let i = 0; i < padded.length; i += 7) {
            const row = padded.slice(i, i + 7);
            const firstOfMonth = row.find(item => item !== null && item.key.endsWith('-01'));
            const firstNonNull = row.find(item => item !== null);
            const label = firstOfMonth
                ? firstOfMonth.key.slice(5, 7)
                : (i === 0 && firstNonNull ? firstNonNull.key.slice(5, 7) : '');
            weeks90.push({ label: label ? `${Number(label)}M` : '', cells: row });
        }
    }
    const paddedCalendar = [];
    if ((stats.preset === '30d' || stats.preset === 'month') && cells.length > 0) {
        paddedCalendar.push(...Array(cells[0].slot).fill(null), ...cells);
        while (paddedCalendar.length % 7 !== 0)
            paddedCalendar.push(null);
    }
    const hiddenMonths = isMonth ? Math.max(0, cells.length - DEFAULT_VISIBLE_MONTHS) : 0;
    const visibleMonthCells = isMonth && !showOlderMonths && hiddenMonths > 0
        ? cells.slice(cells.length - DEFAULT_VISIBLE_MONTHS)
        : cells;
    const yearGroups = [];
    if (isMonth) {
        for (const cell of visibleMonthCells) {
            const year = cell.key.slice(0, 4);
            const last = yearGroups[yearGroups.length - 1];
            if (last && last.year === year)
                last.cells.push(cell);
            else
                yearGroups.push({ year, cells: [cell] });
        }
    }
    return (_jsxs("figure", { className: "ci-fig", "aria-label": t('heatmapTitle'), children: [_jsxs("div", { className: "ci-fig-head", children: [_jsx("h3", { className: "ci-fig-title", children: t('heatmapTitle') }), _jsx("div", { className: "ci-fig-controls", children: _jsxs("button", { type: "button", className: "ci-mini-btn", "aria-pressed": tableMode, onClick: () => setTableMode(prev => !prev), children: [tableMode ? _jsx(BarChart3, { size: 13, "aria-hidden": "true" }) : _jsx(Table2, { size: 13, "aria-hidden": "true" }), _jsx("span", { children: t(tableMode ? 'viewChart' : 'viewTable') })] }) })] }), cells.length === 0 ? (_jsx("p", { className: "ci-hint", children: t('statsEmptyAll') })) : tableMode ? (_jsx("div", { className: "ci-table-wrap", children: _jsxs("table", { className: "ci-table", children: [_jsx("caption", { className: "ci-sr-only", children: t('heatmapTitle') }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t(isMonth ? 'colMonth' : 'colDate') }), _jsx("th", { scope: "col", className: "ci-num", children: t('colCompleted') }), _jsx("th", { scope: "col", className: "ci-num", children: t('colRate') })] }) }), _jsx("tbody", { children: cells.filter(cell => !cell.future).map(cell => (_jsxs("tr", { children: [_jsx("th", { scope: "row", children: cell.key }), _jsx("td", { className: "ci-num", children: `${cell.completed}/${cell.possible}` }), _jsx("td", { className: "ci-num", children: formatPct(cell.possible > 0 ? cell.completed / cell.possible : null) })] }, cell.key))) })] }) })) : (_jsxs(_Fragment, { children: [stats.preset === '7d' && (_jsxs(_Fragment, { children: [_jsx("div", { className: "ci-heat-dow", "aria-hidden": "true", children: cells.map(cell => _jsx("span", { children: t(WEEK[cell.slot] ?? 'mon') }, cell.key)) }), _jsx("div", { className: "ci-heat-grid", children: cells.map(cell => (_jsx("button", { type: "button", className: "ci-heat-cell", "data-date": cell.key, "data-level": cell.level, "data-future": cell.future, "data-active": activeKey === cell.key, disabled: cell.future, "aria-label": cellSummary(cell), onMouseEnter: () => setActiveKey(cell.key), onFocus: () => setActiveKey(cell.key), onClick: () => triggerCell(cell), children: Number(cell.key.slice(-2)) }, cell.key))) })] })), (stats.preset === '30d' || stats.preset === 'month') && (_jsxs(_Fragment, { children: [_jsx("div", { className: "ci-heat-dow", "aria-hidden": "true", children: WEEK.map(day => _jsx("span", { children: t(day) }, day)) }), _jsx("div", { className: "ci-heat-grid", children: paddedCalendar.map((cell, index) => (cell ? (_jsx("button", { type: "button", className: "ci-heat-cell", "data-date": cell.key, "data-level": cell.level, "data-future": cell.future, "data-active": activeKey === cell.key, disabled: cell.future, "aria-label": cellSummary(cell), onMouseEnter: () => setActiveKey(cell.key), onFocus: () => setActiveKey(cell.key), onClick: () => triggerCell(cell), children: Number(cell.key.slice(-2)) }, cell.key)) : (_jsx("span", { className: "ci-heat-spacer", "aria-hidden": "true" }, `pad-${index}`)))) })] })), stats.preset === '90d' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "ci-heat-dow-90", "aria-hidden": "true", children: [_jsx("span", {}), WEEK.map(day => _jsx("span", { children: t(day) }, day))] }), _jsx("div", { className: "ci-heat-90", children: weeks90.map((row, rowIndex) => (_jsxs("div", { className: "ci-heat-90-row", children: [_jsx("span", { className: "ci-heat-row-label", "aria-hidden": "true", children: row.label }), row.cells.map((cell, colIndex) => (cell ? (_jsx("button", { type: "button", className: "ci-heat-cell ci-heat-cell-compact", "data-date": cell.key, "data-level": cell.level, "data-future": cell.future, "data-active": activeKey === cell.key, disabled: cell.future, "aria-label": cellSummary(cell), onMouseEnter: () => setActiveKey(cell.key), onFocus: () => setActiveKey(cell.key), onClick: () => triggerCell(cell) }, cell.key)) : (_jsx("span", { className: "ci-heat-spacer", "aria-hidden": "true" }, `p-${rowIndex}-${colIndex}`))))] }, rowIndex))) })] })), isMonth && (_jsxs(_Fragment, { children: [hiddenMonths > 0 && (_jsx("button", { type: "button", className: "ci-fold-btn", "aria-expanded": showOlderMonths, style: { marginTop: 0, marginBottom: 10 }, onClick: () => setShowOlderMonths(prev => !prev), children: showOlderMonths ? t('heatmapHideOlder') : t('heatmapShowOlder', { n: hiddenMonths }) })), yearGroups.map(group => (_jsxs("div", { className: "ci-heat-year-group", children: [_jsx("p", { className: "ci-heat-year-label", children: group.year }), _jsx("div", { className: "ci-heat-months", children: group.cells.map(cell => (_jsx("button", { type: "button", className: "ci-heat-cell ci-heat-cell-month", "data-month": cell.key, "data-level": cell.level, "data-active": activeKey === cell.key, "aria-label": cellSummary(cell), onMouseEnter: () => setActiveKey(cell.key), onFocus: () => setActiveKey(cell.key), onClick: () => triggerCell(cell), children: _jsx("span", { children: cell.slot }) }, cell.key))) })] }, group.year)))] })), _jsx("div", { className: "ci-readout", "aria-live": "polite", "data-testid": "heatmap-readout", children: activeCell
                            ? _jsx("span", { className: "ci-readout-strong", children: cellSummary(activeCell) })
                            : _jsx("span", { children: t(isMonth ? 'readoutHintMonth' : 'readoutHintDay') }) }), _jsx("div", { className: "ci-heat-legend", "aria-hidden": "true", children: singleTopicView && !isMonth ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "ci-heat-swatch", "data-level": "0" }), _jsx("span", { children: t('incomplete') }), _jsx("span", { className: "ci-heat-swatch", "data-level": "4", style: { marginLeft: 8 } }), _jsx("span", { children: t('completed') })] })) : (_jsxs(_Fragment, { children: [_jsx("span", { children: t('heatmapLess') }), [0, 1, 2, 3, 4].map(level => _jsx("span", { className: "ci-heat-swatch", "data-level": level }, level)), _jsx("span", { children: t('heatmapMore') })] })) })] }))] }));
}
function TrendSection({ trend, t }) {
    const [tableMode, setTableMode] = useState(false);
    const [activeIndex, setActiveIndex] = useState(null);
    const bandRefs = useRef([]);
    useEffect(() => { setActiveIndex(null); }, [trend]);
    if (trend.length === 0)
        return null;
    const width = 320;
    const height = 144;
    const left = 36;
    const right = 308;
    const top = 14;
    const bottom = 114;
    const plotW = right - left;
    const plotH = bottom - top;
    const xAt = (index) => trend.length === 1 ? left + plotW / 2 : left + (index / (trend.length - 1)) * plotW;
    const yAt = (rate) => bottom - Math.max(0, Math.min(1, rate)) * plotH;
    const points = trend.map((bucket, index) => ({ x: xAt(index), y: yAt(bucket.rate), bucket }));
    const linePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPoints = points.length >= 2
        ? `${points[0].x.toFixed(1)},${bottom} ${linePoints} ${points[points.length - 1].x.toFixed(1)},${bottom}`
        : '';
    const bandW = plotW / trend.length;
    const active = activeIndex !== null ? points[activeIndex] ?? null : null;
    const onBandKey = (event, index) => {
        let next = index;
        if (event.key === 'ArrowLeft')
            next = Math.max(0, index - 1);
        else if (event.key === 'ArrowRight')
            next = Math.min(trend.length - 1, index + 1);
        else if (event.key === 'Home')
            next = 0;
        else if (event.key === 'End')
            next = trend.length - 1;
        else
            return;
        event.preventDefault();
        setActiveIndex(next);
        bandRefs.current[next]?.focus();
    };
    const labelFor = (bucket) => t('trendReadout', { pct: formatPct(bucket.rate), done: bucket.completed, total: bucket.possible, from: bucket.from, to: bucket.to });
    return (_jsxs("figure", { className: "ci-fig", "aria-label": t('trendTitle'), children: [_jsxs("div", { className: "ci-fig-head", children: [_jsx("h3", { className: "ci-fig-title", children: t('trendTitle') }), _jsx("div", { className: "ci-fig-controls", children: _jsxs("button", { type: "button", className: "ci-mini-btn", "aria-pressed": tableMode, onClick: () => setTableMode(prev => !prev), children: [tableMode ? _jsx(BarChart3, { size: 13, "aria-hidden": "true" }) : _jsx(Table2, { size: 13, "aria-hidden": "true" }), _jsx("span", { children: t(tableMode ? 'viewChart' : 'viewTable') })] }) })] }), tableMode ? (_jsx("div", { className: "ci-table-wrap", children: _jsxs("table", { className: "ci-table", children: [_jsx("caption", { className: "ci-sr-only", children: t('trendTitle') }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('colPeriod') }), _jsx("th", { scope: "col", className: "ci-num", children: t('colCompleted') }), _jsx("th", { scope: "col", className: "ci-num", children: t('colRate') })] }) }), _jsx("tbody", { children: trend.map(bucket => (_jsxs("tr", { children: [_jsx("th", { scope: "row", children: `${bucket.from} – ${bucket.to}` }), _jsx("td", { className: "ci-num", children: `${bucket.completed}/${bucket.possible}` }), _jsx("td", { className: "ci-num", children: formatPct(bucket.rate) })] }, bucket.key))) })] }) })) : (_jsxs(_Fragment, { children: [_jsxs("svg", { className: "ci-svg", viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": t('trendTitle'), children: [[0, 0.5, 1].map(tick => {
                                const y = yAt(tick);
                                return (_jsxs("g", { children: [_jsx("line", { className: "ci-svg-grid", x1: left, x2: right, y1: y, y2: y }), _jsx("text", { className: "ci-svg-axis", x: left - 6, y: y + 3, textAnchor: "end", children: `${Math.round(tick * 100)}%` })] }, tick));
                            }), areaPoints && _jsx("polygon", { points: areaPoints, fill: "var(--ci-area-wash)" }), points.length >= 2 && (_jsx("polyline", { points: linePoints, fill: "none", stroke: "var(--ci-mark-primary)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" })), points.length === 1 && (_jsx("circle", { cx: points[0].x, cy: points[0].y, r: 4, fill: "var(--ci-mark-primary)" })), active && (_jsxs(_Fragment, { children: [_jsx("line", { className: "ci-svg-crosshair", x1: active.x, x2: active.x, y1: top, y2: bottom }), _jsx("circle", { cx: active.x, cy: active.y, r: 4, fill: "var(--ci-mark-primary)", stroke: "var(--ci-bg)", strokeWidth: 1.5 })] })), _jsx("text", { className: "ci-svg-axis", x: left, y: height - 8, textAnchor: "start", children: trend[0].key }), trend.length >= 2 && (_jsx("text", { className: "ci-svg-axis", x: right, y: height - 8, textAnchor: "end", children: trend[trend.length - 1].key })), points.map((point, index) => (_jsx("rect", { ref: element => { bandRefs.current[index] = element; }, className: "ci-svg-band", x: left + index * bandW, y: top, width: bandW, height: plotH, tabIndex: 0, role: "button", "aria-label": labelFor(point.bucket), onMouseEnter: () => setActiveIndex(index), onFocus: () => setActiveIndex(index), onKeyDown: event => onBandKey(event, index) }, point.bucket.key)))] }), _jsx("div", { className: "ci-readout", "aria-live": "polite", "data-testid": "trend-readout", children: active
                            ? _jsx("span", { className: "ci-readout-strong", children: labelFor(active.bucket) })
                            : _jsx("span", { children: t('trendHint') }) })] }))] }));
}
function WeekdaySection({ weekdays, isAll, t }) {
    const [tableMode, setTableMode] = useState(false);
    const [activeIndex, setActiveIndex] = useState(null);
    const bandRefs = useRef([]);
    useEffect(() => { setActiveIndex(null); }, [weekdays, isAll]);
    const width = 320;
    const height = 136;
    const left = 36;
    const right = 308;
    const top = 20;
    const bottom = 108;
    const plotW = right - left;
    const plotH = bottom - top;
    const colW = plotW / 7;
    const barW = 16;
    const maxCount = weekdays.reduce((max, item) => Math.max(max, item.completed), 0);
    const valueOf = (item) => isAll ? item.completed : item.rate;
    const ratioOf = (item) => {
        if (isAll)
            return maxCount > 0 ? item.completed / maxCount : 0;
        return item.rate ?? 0;
    };
    let bestIndex = -1;
    let worstIndex = -1;
    let bestVal = -1;
    let worstVal = Number.POSITIVE_INFINITY;
    for (let i = 0; i < weekdays.length; i += 1) {
        const val = valueOf(weekdays[i]);
        if (val === null)
            continue;
        if (val > bestVal) {
            bestVal = val;
            bestIndex = i;
        }
        if (val < worstVal) {
            worstVal = val;
            worstIndex = i;
        }
    }
    if (bestVal <= 0) {
        bestIndex = -1;
        worstIndex = -1;
    }
    else if (bestIndex === worstIndex || bestVal === worstVal) {
        worstIndex = -1;
    }
    const onBandKey = (event, index) => {
        let next = index;
        if (event.key === 'ArrowLeft')
            next = Math.max(0, index - 1);
        else if (event.key === 'ArrowRight')
            next = Math.min(6, index + 1);
        else if (event.key === 'Home')
            next = 0;
        else if (event.key === 'End')
            next = 6;
        else
            return;
        event.preventDefault();
        setActiveIndex(next);
        bandRefs.current[next]?.focus();
    };
    const readoutFor = (item) => {
        const weekday = t(WEEK[item.weekday] ?? 'mon');
        if (isAll)
            return t('weekdayReadoutCount', { done: item.completed, weekday });
        return t('weekdayReadoutRate', { pct: formatPct(item.rate), done: item.completed, total: item.possible, weekday });
    };
    const active = activeIndex !== null ? weekdays[activeIndex] ?? null : null;
    const yTicks = isAll
        ? [0, Math.round(maxCount / 2), Math.max(1, maxCount)]
        : [0, 0.5, 1];
    return (_jsxs("figure", { className: "ci-fig", "aria-label": t('weekdayTitle'), children: [_jsxs("div", { className: "ci-fig-head", children: [_jsx("h3", { className: "ci-fig-title", children: t('weekdayTitle') }), _jsx("div", { className: "ci-fig-controls", children: _jsxs("button", { type: "button", className: "ci-mini-btn", "aria-pressed": tableMode, onClick: () => setTableMode(prev => !prev), children: [tableMode ? _jsx(BarChart3, { size: 13, "aria-hidden": "true" }) : _jsx(Table2, { size: 13, "aria-hidden": "true" }), _jsx("span", { children: t(tableMode ? 'viewChart' : 'viewTable') })] }) })] }), tableMode ? (_jsx("div", { className: "ci-table-wrap", children: _jsxs("table", { className: "ci-table", children: [_jsx("caption", { className: "ci-sr-only", children: t('weekdayTitle') }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('colWeekday') }), _jsx("th", { scope: "col", className: "ci-num", children: t('colCompleted') }), !isAll && _jsx("th", { scope: "col", className: "ci-num", children: t('colRate') })] }) }), _jsx("tbody", { children: weekdays.map(item => (_jsxs("tr", { children: [_jsx("th", { scope: "row", children: t(WEEK[item.weekday] ?? 'mon') }), _jsx("td", { className: "ci-num", children: isAll ? formatCompactCount(item.completed) : `${item.completed}/${item.possible}` }), !isAll && _jsx("td", { className: "ci-num", children: formatPct(item.rate) })] }, item.weekday))) })] }) })) : (_jsxs(_Fragment, { children: [_jsxs("svg", { className: "ci-svg", viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": t('weekdayTitle'), children: [yTicks.map((tick, tickIdx) => {
                                const ratio = isAll ? (maxCount > 0 ? tick / maxCount : tickIdx / 2) : tick;
                                const y = bottom - ratio * plotH;
                                const label = isAll ? String(tick) : `${Math.round(tick * 100)}%`;
                                return (_jsxs("g", { children: [_jsx("line", { className: "ci-svg-grid", x1: left, x2: right, y1: y, y2: y }), _jsx("text", { className: "ci-svg-axis", x: left - 6, y: y + 3, textAnchor: "end", children: label })] }, `${tick}-${tickIdx}`));
                            }), weekdays.map((item, index) => {
                                const cx = left + (index + 0.5) * colW;
                                const barH = ratioOf(item) * plotH;
                                const barY = bottom - barH;
                                const directLabel = index === bestIndex || index === worstIndex
                                    ? (isAll ? String(item.completed) : `${Math.round((item.rate ?? 0) * 100)}%`)
                                    : null;
                                return (_jsxs("g", { children: [barH > 0 && (_jsx("path", { d: roundedTopBarPath(cx - barW / 2, barY, barW, barH, 4), fill: "var(--ci-mark-primary)", opacity: activeIndex === null || activeIndex === index ? 1 : 0.45 })), directLabel && (_jsx("text", { className: "ci-svg-label", x: cx, y: Math.max(12, barY - 5), textAnchor: "middle", children: directLabel })), _jsx("text", { className: "ci-svg-axis", x: cx, y: height - 8, textAnchor: "middle", children: t(WEEK[item.weekday] ?? 'mon') }), _jsx("rect", { ref: element => { bandRefs.current[index] = element; }, className: "ci-svg-band", x: left + index * colW, y: top, width: colW, height: plotH, tabIndex: 0, role: "button", "aria-label": readoutFor(item), onMouseEnter: () => setActiveIndex(index), onFocus: () => setActiveIndex(index), onKeyDown: event => onBandKey(event, index) })] }, item.weekday));
                            })] }), _jsx("div", { className: "ci-readout", "aria-live": "polite", "data-testid": "weekday-readout", children: active
                            ? _jsx("span", { className: "ci-readout-strong", children: readoutFor(active) })
                            : _jsx("span", { children: t('weekdayHint') }) })] }))] }));
}
/** Main statistics view combining Today Strip, global filter bar, KPIs, comparison list, heatmap, trend, and weekday rhythm. */
export function StatsView({ state, controller, t, onCreateTopic, onOpenCalendar, failureKey }) {
    const [rangeOpen, setRangeOpen] = useState(false);
    const { stats, busy } = state;
    const today = state.statsToday ?? state.data?.today ?? '';
    if (state.statsLoading && !stats) {
        return _jsx("div", { className: "ci-status", role: "status", children: t('statsLoading') });
    }
    const notice = state.statsNotice === 'topicDeleted' && (_jsxs("div", { className: "ci-notice", role: "status", children: [_jsx("span", { children: t('statsTopicDeleted') }), _jsx("button", { type: "button", className: "ci-icon", "aria-label": t('dismiss'), onClick: () => controller.clearStatsNotice(), children: _jsx(X, { size: 14, "aria-hidden": "true" }) })] }));
    const errorBanner = state.statsError && (_jsxs("div", { className: "ci-alert", role: "alert", children: [_jsx("span", { children: t(failureKey(state.statsError)) }), _jsx("button", { type: "button", className: "ci-button", disabled: busy, onClick: () => { void controller.refreshStats(false); }, children: t('retry') })] }));
    if (!stats) {
        return (_jsxs(_Fragment, { children: [notice, errorBanner] }));
    }
    if (stats.catalog.length === 0) {
        return (_jsxs(_Fragment, { children: [notice, errorBanner, _jsxs("div", { className: "ci-empty", children: [_jsx(BarChart3, { className: "ci-empty-icon", size: 36, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("h3", { children: t('empty') }), _jsx("p", { children: t('emptyHint') }), _jsxs("button", { type: "button", className: "ci-button", disabled: busy, onClick: onCreateTopic, children: [_jsx(Plus, { size: 16, "aria-hidden": "true" }), t('add')] })] })] }));
    }
    const singleTopicView = stats.catalog.length === 1 || state.topicId !== '';
    const activeTopic = singleTopicView ? stats.topics[0] ?? null : null;
    const isAll = stats.preset === 'all';
    const isFutureMonth = stats.preset === 'month' && stats.effectiveTo === null;
    const todayPct = stats.summary.todayTotalCount > 0
        ? (stats.summary.todayDoneCount / stats.summary.todayTotalCount) * 100
        : 0;
    const windowText = isAll
        ? t('windowAllSummary', { from: stats.from, to: stats.to })
        : isFutureMonth
            ? t('windowFutureSummary', { from: stats.from, to: stats.to })
            : t('windowSummary', { from: stats.from, to: stats.effectiveTo ?? stats.to, days: stats.summary.elapsedDays ?? 0 });
    const hasEmptyWindow = stats.summary.completedCheckins === 0 && !isFutureMonth;
    return (_jsxs("div", { children: [notice, errorBanner, _jsx("section", { className: "ci-today-strip", "aria-label": t('today'), children: !singleTopicView ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "ci-today-row", children: [_jsx("span", { className: "ci-today-label", children: t('todayProgress', { done: stats.summary.todayDoneCount, total: stats.summary.todayTotalCount }) }), _jsx("button", { type: "button", className: "ci-link-btn", onClick: () => onOpenCalendar({ date: today, month: today.slice(0, 7) }), children: _jsx("span", { children: t('goToday') }) })] }), _jsx("div", { className: "ci-today-meter", "aria-hidden": "true", children: _jsx("div", { className: "ci-today-fill", style: { width: `${Math.max(0, Math.min(100, todayPct))}%` } }) })] })) : activeTopic ? (_jsxs("div", { className: "ci-today-row", children: [_jsxs("div", { className: "ci-today-topic", children: [stats.catalog.length >= 2 && (_jsx("button", { type: "button", className: "ci-icon", "aria-label": t('backAllTopics'), onClick: () => controller.setTopicId(''), children: _jsx(ArrowLeft, { size: 15, "aria-hidden": "true" }) })), _jsx("button", { type: "button", role: "checkbox", className: "ci-toggle", "aria-checked": activeTopic.completedToday, "aria-label": t(activeTopic.completedToday ? 'unset' : 'set', { name: activeTopic.topic.name }), disabled: busy || !today, onClick: () => {
                                        void controller.mutate((api, signal) => api.set({
                                            topicId: activeTopic.topic.id,
                                            date: today,
                                            completed: !activeTopic.completedToday,
                                        }, signal));
                                    }, children: activeTopic.completedToday && _jsx(Check, { size: 16, "aria-hidden": "true" }) }), _jsx("span", { className: "ci-today-topic-name", children: activeTopic.topic.name })] }), _jsx("div", { className: "ci-today-actions", children: _jsxs("button", { type: "button", className: "ci-link-btn", onClick: () => {
                                    const target = activeTopic.lastCompletedDate ?? today;
                                    onOpenCalendar({ date: target, month: target.slice(0, 7), topicId: activeTopic.topic.id });
                                }, children: [_jsx(CalendarDays, { size: 13, "aria-hidden": "true" }), _jsx("span", { children: t('viewInCalendar') })] }) })] })) : null }), _jsxs("div", { className: "ci-stats-filters", children: [_jsx(Menu, { open: rangeOpen, onClose: () => setRangeOpen(false), align: "start", portal: true, dense: true, items: PRESETS.map(item => ({
                            id: item.id,
                            label: t(item.key),
                            ...(state.statsPreset === item.id ? { icon: _jsx(Check, { size: 16, "aria-hidden": "true" }) } : {}),
                            disabled: busy,
                        })), onSelect: id => {
                            setRangeOpen(false);
                            if (busy)
                                return;
                            controller.setStatsFilter(id);
                        }, anchor: (_jsxs(Button, { size: "md", variant: "outline", className: "ci-range-trigger", "aria-label": t('statsRange'), "aria-haspopup": "menu", "aria-expanded": rangeOpen, disabled: busy, onClick: () => setRangeOpen(open => !open), children: [_jsx("span", { children: t(presetLabelKey(state.statsPreset)) }), _jsx(ChevronDown, { size: 14, "aria-hidden": "true" })] })) }), _jsxs("div", { className: "ci-filter", children: [_jsxs("select", { className: "ci-select", "aria-label": t('filter'), value: state.topicId, onChange: event => controller.setTopicId(event.target.value), children: [_jsx("option", { value: "", children: t('all') }), stats.catalog.map(topic => _jsx("option", { value: topic.id, children: topic.name }, topic.id))] }), _jsx(ChevronDown, { size: 16, "aria-hidden": "true" })] }), _jsx("button", { type: "button", className: "ci-icon", "aria-label": t('statsRefresh'), disabled: busy, onClick: () => { void controller.refreshStats(false); }, children: _jsx(RefreshCw, { size: 14, "aria-hidden": "true" }) })] }), _jsxs("div", { className: "ci-stats-window", children: [_jsx("span", { className: "ci-stats-window-text", children: windowText }), stats.preset === 'month' && stats.month && (_jsxs("div", { className: "ci-month-steppers", children: [_jsx("button", { type: "button", className: "ci-icon", "aria-label": t('prev'), disabled: busy || stats.month === '0001-01', onClick: () => controller.setStatsFilter('month', shiftMonth(stats.month, -1)), children: _jsx(ChevronLeft, { size: 16, "aria-hidden": "true" }) }), _jsx("button", { type: "button", className: "ci-icon", "aria-label": t('next'), disabled: busy || stats.month === '9999-12', onClick: () => controller.setStatsFilter('month', shiftMonth(stats.month, 1)), children: _jsx(ChevronRight, { size: 16, "aria-hidden": "true" }) })] }))] }), _jsxs("div", { className: "ci-stats-body", "data-refreshing": state.statsRefreshing, children: [!singleTopicView ? (_jsxs("div", { className: "ci-kpi-grid", children: [_jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t(isAll ? 'kpiActiveDays' : 'kpiRate') }), _jsxs("div", { className: "ci-kpi-main", children: [_jsx("span", { className: "ci-kpi-value", children: isAll ? formatCompactCount(stats.summary.activeDays) : formatPct(stats.summary.completionRate) }), !isAll && _jsx(DeltaBadge, { deltaPp: stats.summary.comparison?.rateDeltaPp ?? null, t: t })] }), _jsx("div", { className: "ci-kpi-sub", children: _jsx("span", { className: "ci-kpi-sub-text", children: isAll
                                                ? (stats.summary.firstCompletedDate ? t('kpiFirstSub', { date: stats.summary.firstCompletedDate }) : t('kpiNoRecord'))
                                                : (stats.summary.comparison ? t('kpiVsPrior') : t('kpiNoPrior')) }) })] }), _jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t(isAll ? 'kpiTotalCheckins' : 'kpiCheckins') }), _jsx("div", { className: "ci-kpi-main", children: _jsx("span", { className: "ci-kpi-value", children: formatCompactCount(stats.summary.completedCheckins) }) }), _jsx("div", { className: "ci-kpi-sub", children: _jsx("span", { className: "ci-kpi-sub-text", children: isAll
                                                ? (stats.summary.lastCompletedDate ? t('kpiSpanSub', { date: stats.summary.lastCompletedDate }) : t('kpiNoRecord'))
                                                : t('kpiActiveSub', { active: stats.summary.activeDays, days: stats.summary.elapsedDays ?? 0 }) }) })] }), _jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t('kpiPerfectDays') }), _jsx("div", { className: "ci-kpi-main", children: _jsx("span", { className: "ci-kpi-value", children: t('daysUnit', { n: stats.summary.perfectDays }) }) }), _jsx("div", { className: "ci-kpi-sub", children: _jsx("span", { className: "ci-kpi-sub-text", children: !isAll && stats.summary.elapsedDays && stats.summary.elapsedDays > 0
                                                ? t('kpiPerfectSub', { pct: formatPct(stats.summary.perfectDays / stats.summary.elapsedDays) })
                                                : '—' }) })] }), _jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t('kpiLongestStreak') }), _jsx("div", { className: "ci-kpi-main", children: _jsx("span", { className: "ci-kpi-value", children: t('daysUnit', { n: stats.summary.longestStreak }) }) }), _jsx("div", { className: "ci-kpi-sub", children: _jsx("span", { className: "ci-kpi-sub-text", title: stats.summary.longestStreakTopicName ?? undefined, children: stats.summary.longestStreakTopicName ?? t('kpiNoRecord') }) })] })] })) : activeTopic ? (_jsxs("div", { className: "ci-kpi-grid", children: [_jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t(isAll ? 'kpiTotalCheckins' : 'kpiRate') }), _jsxs("div", { className: "ci-kpi-main", children: [_jsx("span", { className: "ci-kpi-value", children: isAll ? formatCompactCount(activeTopic.allTimeCount) : formatPct(activeTopic.windowRate) }), !isAll && _jsx(DeltaBadge, { deltaPp: stats.summary.comparison?.rateDeltaPp ?? null, t: t })] }), _jsx("div", { className: "ci-kpi-sub", children: _jsx("span", { className: "ci-kpi-sub-text", children: isAll
                                                ? (activeTopic.lastCompletedDate ? t('kpiSpanSub', { date: activeTopic.lastCompletedDate }) : t('kpiNoRecord'))
                                                : (stats.summary.comparison ? t('kpiVsPrior') : t('kpiNoPrior')) }) })] }), _jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t(isAll ? 'kpiFirstCheckin' : 'kpiCheckins') }), _jsx("div", { className: "ci-kpi-main", children: _jsx("span", { className: "ci-kpi-value", children: isAll ? (activeTopic.firstCompletedDate ?? '—') : formatCompactCount(activeTopic.windowCount) }) }), _jsx("div", { className: "ci-kpi-sub", children: _jsx("span", { className: "ci-kpi-sub-text", children: isAll
                                                ? (activeTopic.lastCompletedDate ? t('kpiSpanSub', { date: activeTopic.lastCompletedDate }) : t('kpiNoRecord'))
                                                : t('kpiActiveSub', { active: stats.summary.activeDays, days: stats.summary.elapsedDays ?? 0 }) }) })] }), _jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t('kpiCurrentStreak') }), _jsx("div", { className: "ci-kpi-main", children: _jsx("span", { className: "ci-kpi-value", children: t('daysUnit', { n: activeTopic.currentStreak }) }) }), _jsxs("div", { className: "ci-kpi-sub", children: [activeTopic.streakStatus === 'done_today' && _jsx(Check, { size: 12, className: "ci-good-icon", "aria-hidden": "true" }), activeTopic.streakStatus === 'pending_today' && _jsx(Clock, { size: 12, className: "ci-warn-icon", "aria-hidden": "true" }), _jsx("span", { className: "ci-kpi-sub-text", children: t(activeTopic.streakStatus === 'done_today'
                                                    ? 'streakDoneToday'
                                                    : activeTopic.streakStatus === 'pending_today'
                                                        ? 'streakPendingToday'
                                                        : 'streakBroken') })] })] }), _jsxs("div", { className: "ci-kpi", children: [_jsx("span", { className: "ci-kpi-label", children: t('kpiLongestStreak') }), _jsx("div", { className: "ci-kpi-main", children: _jsx("span", { className: "ci-kpi-value", children: t('daysUnit', { n: activeTopic.longestStreak }) }) }), _jsx("div", { className: "ci-kpi-sub", children: _jsx("span", { className: "ci-kpi-sub-text", children: activeTopic.longestStreakFrom && activeTopic.longestStreakTo
                                                ? t('kpiStreakRange', { from: shortDate(activeTopic.longestStreakFrom), to: shortDate(activeTopic.longestStreakTo) })
                                                : t('kpiNoRecord') }) })] })] })) : null, hasEmptyWindow && (_jsxs("div", { className: "ci-stats-callout", role: "status", children: [_jsx("span", { children: t(stats.summary.firstCompletedDate !== null ? 'statsEmptyWindow' : 'statsEmptyAll') }), stats.summary.firstCompletedDate !== null && !isAll ? (_jsx("button", { type: "button", className: "ci-button", onClick: () => controller.setStatsFilter('all'), children: t('switchAllTime') })) : stats.summary.firstCompletedDate === null ? (_jsx("button", { type: "button", className: "ci-button", onClick: () => onOpenCalendar({ date: today, month: today.slice(0, 7) }), children: t('goFirstCheckin') })) : null] })), !singleTopicView && (_jsx(TopicMeterSection, { stats: stats, today: today, t: t, onSelectTopic: id => controller.setTopicId(id), onOpenCalendar: onOpenCalendar })), _jsx(HeatmapSection, { stats: stats, today: today, singleTopicView: singleTopicView, t: t, onOpenCalendar: onOpenCalendar }), singleTopicView && stats.preset !== '7d' && (_jsxs(_Fragment, { children: [_jsx(TrendSection, { trend: stats.trend, t: t }), _jsx(WeekdaySection, { weekdays: stats.weekdays, isAll: isAll, t: t })] })), _jsx("p", { className: "ci-hint", children: t('statsHint') })] })] }));
}
//# sourceMappingURL=StatsView.js.map
