import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Calendar and topic management rendered in the host's right-side tab. */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { CalendarCheck2, Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { CheckinController } from "./controller.js";
import { styles } from "./styles.js";
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function shiftDate(date, days) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}
function shiftMonth(month, amount) {
    const value = new Date(`${month}-01T00:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + amount);
    return value.toISOString().slice(0, 7);
}
function failureKey(error) {
    if (error.includes('duplicate-name'))
        return 'duplicate';
    if (error.includes('invalid-name'))
        return 'invalidName';
    if (error.includes('topic-not-found'))
        return 'notFound';
    if (error.includes('future-date'))
        return 'future';
    if (error.includes('invalid-date') || error.includes('invalid-range'))
        return 'invalidDate';
    return 'error';
}
/** Sidebar action respects the host's collapsed rail.
 * @param props - Localized shell props and right-panel opener. @returns Sidebar trigger.
 */
export function CheckinTrigger({ wide, t, openPanel }) {
    return _jsxs(_Fragment, { children: [_jsx("style", { "aria-hidden": "true", children: styles }), _jsxs("button", { className: "ci-trigger", "data-wide": wide, "aria-label": t('open'), onClick: openPanel, children: [_jsx(CalendarCheck2, { size: 16, "aria-hidden": "true" }), wide && _jsx("span", { children: t('title') })] })] });
}
/** Calendar, topic management and daily completion controls.
 * @param props - Localized tab props and per-occurrence controller factory. @returns Right-tab body.
 */
export function CheckinPanel({ t, createController, useTabInfo }) {
    const [controller] = useState(createController);
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const { tab } = useTabInfo();
    const { data, busy } = state;
    const titleId = useId();
    const nameId = useId();
    const [selected, setSelected] = useState('');
    const [topicId, setTopicId] = useState('');
    const [form, setForm] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const addRef = useRef(null);
    const panelRef = useRef(null);
    const nameRef = useRef(null);
    const focusDay = useRef(false);
    const navigationFocus = useRef(null);
    const deleteCancel = useRef(null);
    const deleteTrigger = useRef(null);
    useEffect(() => { if (deleting)
        deleteCancel.current?.focus(); }, [deleting]);
    const formOpen = form !== null;
    const formId = form?.id;
    useEffect(() => { if (formOpen)
        nameRef.current?.focus(); }, [formOpen, formId]);
    useEffect(() => () => { controller.dispose(); }, [controller]);
    useEffect(() => {
        if (!tab.visible || tab.signal.aborted) {
            controller.cancelRead();
            return;
        }
        void controller.refresh();
        return () => { controller.cancelRead(); };
    }, [controller, tab.signal, tab.visible]);
    useEffect(() => {
        const cancel = () => { controller.cancelRead(); };
        if (tab.signal.aborted) {
            cancel();
            return;
        }
        tab.signal.addEventListener('abort', cancel, { once: true });
        return () => { tab.signal.removeEventListener('abort', cancel); };
    }, [controller, tab.signal]);
    useEffect(() => {
        if (!tab.visible || tab.signal.aborted || !data)
            return;
        const poll = () => { if (!tab.signal.aborted && document.visibilityState === 'visible')
            void controller.refresh(true); };
        const timer = window.setInterval(poll, data.refreshIntervalMs);
        document.addEventListener('visibilitychange', poll);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
    }, [controller, tab.signal, tab.visible, data?.refreshIntervalMs, Boolean(data)]);
    useEffect(() => {
        if (!data)
            return;
        if (selected.slice(0, 7) !== data.month)
            setSelected(data.today.startsWith(data.month) ? data.today : data.from);
        if (topicId && !data.topics.some(topic => topic.id === topicId))
            setTopicId('');
    }, [data, selected, topicId]);
    useEffect(() => {
        if (focusDay.current && data && selected.startsWith(data.month)) {
            panelRef.current?.querySelector(`button[data-date="${selected}"]`)?.focus();
            focusDay.current = false;
        }
        else if (data && navigationFocus.current) {
            panelRef.current?.querySelector(`button[data-nav="${navigationFocus.current}"]`)?.focus();
            navigationFocus.current = null;
        }
    }, [data, selected]);
    const topics = data?.topics.filter(topic => !topicId || topic.id === topicId) ?? [];
    const complete = new Set(data?.completions.map(row => `${row.date}/${row.topicId}`));
    const count = (date) => topics.filter(topic => complete.has(`${date}/${topic.id}`)).length;
    const future = data !== null && selected > data.today;
    const calendar = [];
    if (data) {
        const offset = (new Date(`${data.from}T00:00:00Z`).getUTCDay() + 6) % 7;
        const days = Number(data.to.slice(-2));
        const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => index >= offset && index < offset + days ? `${data.month}-${String(index - offset + 1).padStart(2, '0')}` : null);
        for (let index = 0; index < cells.length; index += 7)
            calendar.push(cells.slice(index, index + 7));
    }
    const navigate = (month, action) => { navigationFocus.current = action; setSelected(`${month}-01`); controller.selectMonth(month); };
    const onDayKey = (event, date) => {
        const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        let next;
        if (event.key === 'Home')
            next = data.from;
        else if (event.key === 'End')
            next = data.to;
        else if (event.key in deltas)
            next = shiftDate(date, deltas[event.key]);
        else
            return;
        event.preventDefault();
        if (!/^\d{4}-/u.test(next) || next < '0001-01-01')
            return;
        focusDay.current = true;
        setSelected(next);
        if (next.slice(0, 7) !== data.month)
            controller.selectMonth(next.slice(0, 7));
    };
    const beginForm = (topic) => { setDeleting(null); setForm(topic ? { id: topic.id, name: topic.name } : { name: '' }); };
    const submit = async () => {
        if (!form)
            return;
        const request = form;
        const saved = await controller.mutate((api, signal) => request.id ? api.update({ id: request.id, name: request.name }, signal) : api.create({ name: request.name }, signal));
        if (saved) {
            setForm(null);
            addRef.current?.focus();
        }
    };
    return _jsxs("section", { ref: panelRef, className: "dsh-checkin ci-panel", "aria-labelledby": titleId, children: [_jsxs("header", { className: "ci-header", children: [_jsx("h2", { id: titleId, children: t('title') }), _jsx("p", { className: "ci-subtitle", children: t('subtitle') })] }), _jsxs("div", { className: "ci-scroll", children: [_jsxs("div", { className: "ci-toolbar", children: [_jsxs("div", { className: "ci-filter", children: [_jsxs("select", { className: "ci-select", "aria-label": t('filter'), value: topicId, onChange: event => setTopicId(event.target.value), children: [_jsx("option", { value: "", children: t('all') }), data?.topics.map(topic => _jsx("option", { value: topic.id, children: topic.name }, topic.id))] }), _jsx(ChevronDown, { size: 16, "aria-hidden": "true" })] }), _jsxs("button", { ref: addRef, className: "ci-button ci-primary", disabled: busy, onClick: () => beginForm(), children: [_jsx(Plus, { size: 16 }), t('add')] })] }), form && _jsxs("form", { className: "ci-form", onSubmit: event => { event.preventDefault(); void submit(); }, children: [_jsx("label", { htmlFor: nameId, children: form.id ? t('rename') : t('name') }), _jsx("input", { ref: nameRef, id: nameId, value: form.name, placeholder: t('placeholder'), required: true, maxLength: 200, disabled: busy, onChange: event => setForm({ ...form, name: event.target.value }) }), _jsxs("div", { className: "ci-actions", children: [_jsx("button", { type: "button", className: "ci-button", disabled: busy, onClick: () => { setForm(null); addRef.current?.focus(); }, children: t('cancel') }), _jsx("button", { className: "ci-button ci-primary", disabled: busy || !form.name.trim(), children: busy ? t('busy') : t('save') })] })] }), deleting && _jsxs("div", { className: "ci-confirm", role: "group", "aria-label": t('deleteTitle', { name: deleting.name }), children: [_jsx("h3", { children: t('deleteTitle', { name: deleting.name }) }), _jsx("p", { children: t('deleteHint') }), _jsxs("div", { className: "ci-actions", children: [_jsx("button", { ref: deleteCancel, className: "ci-button", disabled: busy, onClick: () => { setDeleting(null); deleteTrigger.current?.focus(); }, children: t('cancel') }), _jsx("button", { className: "ci-button ci-danger", disabled: busy, onClick: () => { void controller.mutate((api, signal) => api.delete({ id: deleting.id }, signal)).then(saved => { if (saved) {
                                            setDeleting(null);
                                            addRef.current?.focus();
                                        } }); }, children: t('confirmDelete') })] })] }), state.error && _jsxs("div", { className: "ci-alert", role: "alert", children: [_jsx("span", { children: t(failureKey(state.error)) }), _jsx("button", { className: "ci-button", disabled: busy, onClick: () => { void controller.refresh(); }, children: t('retry') })] }), state.loading && _jsx("div", { className: "ci-status", role: "status", children: t('loading') }), data && data.topics.length === 0 && _jsxs("div", { className: "ci-empty", children: [_jsx(CalendarCheck2, { className: "ci-empty-icon", size: 36, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("h3", { children: t('empty') }), _jsx("p", { children: t('emptyHint') }), _jsxs("button", { className: "ci-button", disabled: busy, onClick: () => beginForm(), children: [_jsx(Plus, { size: 16 }), t('add')] })] }), data && data.topics.length > 0 && _jsxs(_Fragment, { children: [_jsxs("div", { className: "ci-monthnav", children: [_jsx("h3", { children: data.month.replace('-', ' / ') }), _jsxs("div", { className: "ci-actions", children: [_jsx("button", { "data-nav": "prev", className: "ci-icon", "aria-label": t('prev'), disabled: busy || data.month === '0001-01', onClick: () => navigate(shiftMonth(data.month, -1), 'prev'), children: _jsx(ChevronLeft, { size: 18 }) }), _jsx("button", { "data-nav": "today", className: "ci-button", disabled: busy, onClick: () => { navigationFocus.current = 'today'; setSelected(''); controller.selectMonth(); }, children: t('today') }), _jsx("button", { "data-nav": "next", className: "ci-icon", "aria-label": t('next'), disabled: busy || data.month === '9999-12', onClick: () => navigate(shiftMonth(data.month, 1), 'next'), children: _jsx(ChevronRight, { size: 18 }) })] })] }), _jsxs("table", { className: "ci-calendar", role: "grid", "aria-label": t('calendar'), children: [_jsx("thead", { children: _jsx("tr", { children: WEEK.map(day => _jsx("th", { scope: "col", children: t(day) }, day)) }) }), _jsx("tbody", { children: calendar.map((week, i) => _jsx("tr", { children: week.map((date, j) => _jsx("td", { "aria-selected": date === selected, children: date && _jsxs("button", { className: "ci-day", "data-date": date, "data-selected": date === selected, "data-today": date === data.today, "data-future": date > data.today, "data-done": count(date) > 0, tabIndex: date === selected ? 0 : -1, "aria-current": date === data.today ? 'date' : undefined, "aria-label": `${t('daySummary', { date, done: count(date), total: topics.length })}${date > data.today ? `, ${t('future')}` : ''}`, onClick: () => setSelected(date), onKeyDown: event => onDayKey(event, date), children: [_jsx("span", { className: "ci-date", children: Number(date.slice(-2)) }), _jsx("small", { children: date > data.today ? null : topicId ? count(date) ? _jsx(Check, { size: 12, "aria-hidden": "true" }) : null : `${count(date)}/${topics.length}` })] }) }, date ?? j)) }, i)) })] }), _jsx("p", { className: "ci-hint", children: t('totalHint') }), _jsxs("section", { className: "ci-detail", "aria-label": t('dateTitle', { date: selected }), children: [_jsxs("div", { className: "ci-detailhead", children: [_jsx("h3", { children: selected }), _jsx("span", { children: future ? t('future') : t('count', { done: count(selected), total: topics.length }) })] }), topics.map(topic => {
                                        const done = complete.has(`${selected}/${topic.id}`);
                                        return _jsxs("div", { className: "ci-row", children: [_jsx("button", { role: "checkbox", className: "ci-toggle", "aria-checked": done, "aria-label": t(done ? 'unset' : 'set', { name: topic.name }), disabled: busy || future || !selected || !selected.startsWith(data.month), onClick: () => { void controller.mutate((api, signal) => api.set({ topicId: topic.id, date: selected, completed: !done }, signal)); }, children: done && _jsx(Check, { size: 16 }) }), _jsx("span", { className: "ci-row-name", children: topic.name }), _jsx("button", { className: "ci-icon", "aria-label": `${t('rename')} ${topic.name}`, disabled: busy, onClick: () => beginForm(topic), children: _jsx(Pencil, { size: 14 }) }), _jsx("button", { className: "ci-icon", "aria-label": `${t('remove')} ${topic.name}`, disabled: busy, onClick: event => { deleteTrigger.current = event.currentTarget; setForm(null); setDeleting(topic); }, children: _jsx(Trash2, { size: 14 }) })] }, topic.id);
                                    })] })] })] }), _jsx("footer", { className: "ci-footer", children: busy ? t('busy') : t('tz') })] });
}
//# sourceMappingURL=CheckinPanel.js.map
