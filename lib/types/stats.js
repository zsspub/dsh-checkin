const MS_PER_DAY = 86_400_000;
const MAX_ALL_HEATMAP_MONTHS = 120;
const MAX_TREND_BUCKETS = 10;
/** Allowed window preset values for runtime validation. */
export const STATS_PRESETS = ['7d', '30d', '90d', 'month', 'all'];
/** Type guard for runtime StatsPreset validation. */
export function isStatsPreset(value) {
    return typeof value === 'string' && STATS_PRESETS.includes(value);
}
/** Validate a canonical YYYY-MM-DD calendar date in 0001-01-01..9999-12-31. */
export function isValidDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date < '0001-01-01')
        return false;
    const [y, m, day] = date.split('-').map(Number);
    if (m < 1 || m > 12 || day < 1 || day > daysInMonth(y, m))
        return false;
    return true;
}
/** Number of calendar days in a 1-indexed month, safe for years 0001..9999. */
export function daysInMonth(year, month) {
    const value = new Date(0);
    value.setUTCFullYear(year, month, 0);
    return value.getUTCDate();
}
/** Convert canonical YYYY-MM-DD to exact UTC epoch day without 2-digit year coercion. */
export function dateToEpochDay(date) {
    const [y, m, day] = date.split('-').map(Number);
    const value = new Date(0);
    value.setUTCFullYear(y, m - 1, day);
    return Math.round(value.getTime() / MS_PER_DAY);
}
/** Convert UTC epoch day back to canonical YYYY-MM-DD (returns out-of-range markers for years <1 or >9999). */
export function epochDayToDate(epochDay) {
    const value = new Date(epochDay * MS_PER_DAY);
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    const yearText = y < 0 ? `-${String(-y).padStart(4, '0')}` : String(y).padStart(4, '0');
    return `${yearText}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const MIN_EPOCH_DAY = dateToEpochDay('0001-01-01');
/** Shift a canonical YYYY-MM-DD date by an integer number of days in UTC. */
export function shiftDate(date, days) {
    return epochDayToDate(dateToEpochDay(date) + days);
}
/** Shift a YYYY-MM calendar month by an integer number of months using pure integer math. */
export function shiftMonth(month, amount) {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + amount;
    const nextYear = Math.floor(total / 12);
    const nextMonth = ((total % 12) + 12) % 12 + 1;
    const yearText = nextYear < 0 ? `-${String(-nextYear).padStart(4, '0')}` : String(nextYear).padStart(4, '0');
    return `${yearText}-${String(nextMonth).padStart(2, '0')}`;
}
/** Compute inclusive start/end dates for a validated YYYY-MM month. */
export function monthBounds(month) {
    const from = `${month}-01`;
    if (!isValidDate(from))
        throw new Error('checkin/invalid-date');
    const [y, m] = month.split('-').map(Number);
    const to = `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
    return { from, to };
}
/** Monday-first weekday index (0=Mon..6=Sun) from UTC epoch day (1970-01-01 is Thu=3). */
export function weekdayMon0(epochDay) {
    return (((epochDay + 3) % 7) + 7) % 7;
}
function monthIndex(ym) {
    const [y, m] = ym.split('-').map(Number);
    return y * 12 + (m - 1);
}
function monthFromIndex(index) {
    const y = Math.floor(index / 12);
    const m = ((index % 12) + 12) % 12 + 1;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}
function dayLevel(done, possible, singleTopic) {
    if (done <= 0 || possible <= 0)
        return 0;
    if (singleTopic)
        return 4;
    if (done >= possible)
        return 4;
    const ratio = done / possible;
    if (ratio <= 0.25)
        return 1;
    if (ratio <= 0.5)
        return 2;
    return 3;
}
function monthLevel(done, possible) {
    if (done <= 0 || possible <= 0)
        return 0;
    const ratio = done / possible;
    if (ratio <= 0.25)
        return 1;
    if (ratio <= 0.5)
        return 2;
    if (ratio <= 0.75)
        return 3;
    return 4;
}
/** Compute full check-in statistics for a Beijing calendar date without Node/DOM dependencies. */
export function computeCheckinStats(input) {
    const { today, topics: catalog, completions, preset, topicId } = input;
    const todayEpoch = dateToEpochDay(today);
    const scopedTopics = topicId === undefined ? [...catalog] : catalog.filter(topic => topic.id === topicId);
    const scopedIds = new Set(scopedTopics.map(topic => topic.id));
    // Deduplicate completions per scoped topic and clamp to <= today for defense-in-depth.
    const daysByTopic = new Map();
    for (const topic of scopedTopics)
        daysByTopic.set(topic.id, []);
    const seen = new Set();
    for (const item of completions) {
        if (!scopedIds.has(item.topicId) || item.date > today)
            continue;
        const key = `${item.topicId}\0${item.date}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        daysByTopic.get(item.topicId)?.push(dateToEpochDay(item.date));
    }
    let firstEpoch = null;
    let lastEpoch = null;
    const countByDay = new Map();
    const countByMonth = new Map();
    for (const days of daysByTopic.values()) {
        days.sort((a, b) => a - b);
        if (days.length > 0) {
            const first = days[0];
            const last = days[days.length - 1];
            if (firstEpoch === null || first < firstEpoch)
                firstEpoch = first;
            if (lastEpoch === null || last > lastEpoch)
                lastEpoch = last;
            for (const epoch of days) {
                countByDay.set(epoch, (countByDay.get(epoch) ?? 0) + 1);
                const ym = epochDayToDate(epoch).slice(0, 7);
                countByMonth.set(ym, (countByMonth.get(ym) ?? 0) + 1);
            }
        }
    }
    const firstCompletedDate = firstEpoch !== null ? epochDayToDate(firstEpoch) : null;
    const lastCompletedDate = lastEpoch !== null ? epochDayToDate(lastEpoch) : null;
    // Resolve active window and comparison baseline.
    let resolvedMonth = null;
    let fromEpoch;
    let toEpoch;
    let effectiveToEpoch;
    let elapsedDays;
    let prior = null;
    if (preset === '7d' || preset === '30d' || preset === '90d') {
        const length = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
        toEpoch = todayEpoch;
        fromEpoch = Math.max(MIN_EPOCH_DAY, todayEpoch - (length - 1));
        effectiveToEpoch = todayEpoch;
        elapsedDays = effectiveToEpoch - fromEpoch + 1;
        const priorTo = fromEpoch - 1;
        if (priorTo >= MIN_EPOCH_DAY) {
            prior = { fromEpoch: Math.max(MIN_EPOCH_DAY, priorTo - (elapsedDays - 1)), toEpoch: priorTo };
        }
    }
    else if (preset === 'month') {
        resolvedMonth = input.month ?? today.slice(0, 7);
        const bounds = monthBounds(resolvedMonth);
        fromEpoch = dateToEpochDay(bounds.from);
        toEpoch = dateToEpochDay(bounds.to);
        if (fromEpoch > todayEpoch) {
            effectiveToEpoch = null;
            elapsedDays = 0;
        }
        else {
            effectiveToEpoch = Math.min(toEpoch, todayEpoch);
            elapsedDays = effectiveToEpoch - fromEpoch + 1;
            if (resolvedMonth > '0001-01') {
                const prevBounds = monthBounds(shiftMonth(resolvedMonth, -1));
                const prevFrom = dateToEpochDay(prevBounds.from);
                const prevEnd = dateToEpochDay(prevBounds.to);
                const prevTo = effectiveToEpoch === toEpoch ? prevEnd : Math.min(prevEnd, prevFrom + elapsedDays - 1);
                prior = { fromEpoch: prevFrom, toEpoch: prevTo };
            }
        }
    }
    else {
        fromEpoch = firstEpoch ?? todayEpoch;
        toEpoch = todayEpoch;
        effectiveToEpoch = firstEpoch !== null ? todayEpoch : null;
        elapsedDays = null;
    }
    const from = epochDayToDate(fromEpoch);
    const to = epochDayToDate(toEpoch);
    const effectiveTo = effectiveToEpoch !== null ? epochDayToDate(effectiveToEpoch) : null;
    const topicCount = scopedTopics.length;
    // Per-topic metrics (full-history streaks + active-window counts).
    let completedCheckins = 0;
    let todayDoneCount = 0;
    let bestLongest = 0;
    let bestLongestTopicId = null;
    let bestLongestTopicName = null;
    let bestLongestFrom = null;
    let bestLongestTo = null;
    const topicStats = scopedTopics.map(topic => {
        const days = daysByTopic.get(topic.id) ?? [];
        const allTimeCount = days.length;
        const topicFirst = allTimeCount > 0 ? epochDayToDate(days[0]) : null;
        const topicLast = allTimeCount > 0 ? epochDayToDate(days[allTimeCount - 1]) : null;
        const completedToday = allTimeCount > 0 && days[allTimeCount - 1] === todayEpoch;
        if (completedToday)
            todayDoneCount += 1;
        let windowCount = 0;
        if (effectiveToEpoch !== null) {
            for (const epoch of days) {
                if (epoch >= fromEpoch && epoch <= effectiveToEpoch)
                    windowCount += 1;
            }
        }
        completedCheckins += windowCount;
        const windowRate = elapsedDays !== null && elapsedDays > 0 ? windowCount / elapsedDays : null;
        // Current streak with today-grace rule.
        let currentStreak = 0;
        let streakStatus = 'broken';
        if (allTimeCount > 0) {
            const last = days[allTimeCount - 1];
            if (last === todayEpoch || last === todayEpoch - 1) {
                streakStatus = last === todayEpoch ? 'done_today' : 'pending_today';
                currentStreak = 1;
                for (let i = allTimeCount - 2; i >= 0; i -= 1) {
                    if (days[i] === days[i + 1] - 1)
                        currentStreak += 1;
                    else
                        break;
                }
            }
        }
        // All-time longest streak (ties broken by most recent end date).
        let longestStreak = 0;
        let longestStart = null;
        let longestEnd = null;
        if (allTimeCount > 0) {
            let runStart = days[0];
            let runLen = 1;
            longestStreak = 1;
            longestStart = runStart;
            longestEnd = runStart;
            for (let i = 1; i < allTimeCount; i += 1) {
                const cur = days[i];
                if (cur === days[i - 1] + 1) {
                    runLen += 1;
                }
                else {
                    runStart = cur;
                    runLen = 1;
                }
                if (runLen >= longestStreak) {
                    longestStreak = runLen;
                    longestStart = runStart;
                    longestEnd = cur;
                }
            }
        }
        const longestStreakFrom = longestStart !== null ? epochDayToDate(longestStart) : null;
        const longestStreakTo = longestEnd !== null ? epochDayToDate(longestEnd) : null;
        if (longestStreak > bestLongest ||
            (longestStreak > 0 && longestStreak === bestLongest && (longestStreakTo ?? '') > (bestLongestTo ?? ''))) {
            bestLongest = longestStreak;
            bestLongestTopicId = topic.id;
            bestLongestTopicName = topic.name;
            bestLongestFrom = longestStreakFrom;
            bestLongestTo = longestStreakTo;
        }
        return {
            topic,
            windowCount,
            windowRate,
            allTimeCount,
            completedToday,
            currentStreak,
            streakStatus,
            longestStreak,
            longestStreakFrom,
            longestStreakTo,
            firstCompletedDate: topicFirst,
            lastCompletedDate: topicLast,
        };
    });
    // Active & perfect days inside the effective window.
    let activeDays = 0;
    let perfectDays = 0;
    if (effectiveToEpoch !== null && topicCount > 0) {
        for (const [epoch, done] of countByDay) {
            if (epoch < fromEpoch || epoch > effectiveToEpoch)
                continue;
            if (done > 0)
                activeDays += 1;
            if (done >= topicCount)
                perfectDays += 1;
        }
    }
    const possibleCheckins = elapsedDays !== null && elapsedDays > 0 && topicCount > 0 ? topicCount * elapsedDays : null;
    const completionRate = possibleCheckins !== null && possibleCheckins > 0 ? completedCheckins / possibleCheckins : null;
    // Period-over-period comparison gated on prior history existence.
    let comparison = null;
    if (prior !== null && topicCount > 0 && elapsedDays !== null && elapsedDays > 0 && firstEpoch !== null && firstEpoch <= prior.toEpoch) {
        const priorElapsed = prior.toEpoch - prior.fromEpoch + 1;
        const priorPossible = topicCount * priorElapsed;
        let priorCompleted = 0;
        for (const [epoch, done] of countByDay) {
            if (epoch >= prior.fromEpoch && epoch <= prior.toEpoch)
                priorCompleted += done;
        }
        const priorRate = priorPossible > 0 ? priorCompleted / priorPossible : null;
        const rateDeltaPp = completionRate !== null && priorRate !== null
            ? Math.round((completionRate - priorRate) * 1000) / 10
            : null;
        comparison = {
            from: epochDayToDate(prior.fromEpoch),
            to: epochDayToDate(prior.toEpoch),
            elapsedDays: priorElapsed,
            completedCheckins: priorCompleted,
            possibleCheckins: priorPossible,
            completionRate: priorRate,
            rateDeltaPp,
        };
    }
    const summary = {
        topicCount,
        todayDoneCount,
        todayTotalCount: topicCount,
        elapsedDays,
        completedCheckins,
        possibleCheckins,
        completionRate,
        activeDays,
        perfectDays,
        longestStreak: bestLongest,
        longestStreakTopicId: bestLongestTopicId,
        longestStreakTopicName: bestLongestTopicName,
        longestStreakFrom: bestLongestFrom,
        longestStreakTo: bestLongestTo,
        firstCompletedDate,
        lastCompletedDate,
        comparison,
    };
    // Heatmap cells.
    const heatmapGranularity = preset === 'all' ? 'month' : 'day';
    const heatmap = [];
    if (heatmapGranularity === 'day') {
        const singleTopic = topicCount === 1;
        for (let epoch = fromEpoch; epoch <= toEpoch; epoch += 1) {
            const future = epoch > todayEpoch;
            const completed = future ? 0 : (countByDay.get(epoch) ?? 0);
            const possible = future ? 0 : topicCount;
            heatmap.push({
                key: epochDayToDate(epoch),
                slot: weekdayMon0(epoch),
                completed,
                possible,
                level: future ? 0 : dayLevel(completed, possible, singleTopic),
                future,
            });
        }
    }
    else if (firstCompletedDate !== null) {
        const firstMonthIdx = monthIndex(firstCompletedDate.slice(0, 7));
        const todayMonthIdx = monthIndex(today.slice(0, 7));
        const startIdx = Math.max(firstMonthIdx, todayMonthIdx - (MAX_ALL_HEATMAP_MONTHS - 1));
        for (let idx = startIdx; idx <= todayMonthIdx; idx += 1) {
            const ym = monthFromIndex(idx);
            const bounds = monthBounds(ym);
            const mFrom = dateToEpochDay(bounds.from);
            const mTo = Math.min(dateToEpochDay(bounds.to), todayEpoch);
            const mDays = mTo - mFrom + 1;
            const possible = topicCount * mDays;
            const completed = countByMonth.get(ym) ?? 0;
            heatmap.push({
                key: ym,
                slot: Number(ym.slice(5, 7)),
                completed,
                possible,
                level: monthLevel(completed, possible),
                future: false,
            });
        }
    }
    // Adaptive trend buckets (<= 10 points, omitted for 7d).
    const trend = computeTrend(preset, fromEpoch, effectiveToEpoch, topicCount, countByDay);
    // Monday-first weekday rhythm.
    const weekdayCompleted = [0, 0, 0, 0, 0, 0, 0];
    if (effectiveToEpoch !== null) {
        for (const [epoch, done] of countByDay) {
            if (epoch < fromEpoch || epoch > effectiveToEpoch)
                continue;
            const wd = weekdayMon0(epoch);
            weekdayCompleted[wd] = (weekdayCompleted[wd] ?? 0) + done;
        }
    }
    const boundedElapsed = effectiveToEpoch !== null ? effectiveToEpoch - fromEpoch + 1 : 0;
    const fullWeeks = Math.floor(boundedElapsed / 7);
    const remainder = boundedElapsed % 7;
    const startWd = weekdayMon0(fromEpoch);
    const weekdays = Array.from({ length: 7 }, (_, wd) => {
        const completed = weekdayCompleted[wd] ?? 0;
        if (effectiveToEpoch === null) {
            return { weekday: wd, occurrences: 0, completed: 0, possible: 0, rate: null };
        }
        const offset = (wd - startWd + 7) % 7;
        const occurrences = fullWeeks + (offset < remainder ? 1 : 0);
        if (preset === 'all') {
            return { weekday: wd, occurrences, completed, possible: 0, rate: null };
        }
        const possible = topicCount * occurrences;
        return {
            weekday: wd,
            occurrences,
            completed,
            possible,
            rate: possible > 0 ? completed / possible : null,
        };
    });
    return {
        preset,
        month: resolvedMonth,
        from,
        to,
        effectiveTo,
        topicId: topicId ?? null,
        catalog: [...catalog],
        summary,
        topics: topicStats,
        heatmapGranularity,
        heatmap,
        trend,
        weekdays,
    };
}
function makeBucket(key, bFrom, bTo, topicCount, countByDay) {
    const elapsedDays = bTo - bFrom + 1;
    const possible = topicCount * elapsedDays;
    let completed = 0;
    for (const [epoch, done] of countByDay) {
        if (epoch >= bFrom && epoch <= bTo)
            completed += done;
    }
    return {
        key,
        from: epochDayToDate(bFrom),
        to: epochDayToDate(bTo),
        elapsedDays,
        completed,
        possible,
        rate: possible > 0 ? completed / possible : 0,
    };
}
function computeTrend(preset, fromEpoch, effectiveToEpoch, topicCount, countByDay) {
    if (preset === '7d' || effectiveToEpoch === null || topicCount === 0 || effectiveToEpoch < fromEpoch)
        return [];
    if (preset === '30d' || preset === 'month') {
        const buckets = [];
        let cursor = fromEpoch;
        while (cursor <= effectiveToEpoch) {
            const wd = weekdayMon0(cursor);
            const weekEnd = Math.min(effectiveToEpoch, cursor + (6 - wd));
            const label = epochDayToDate(cursor).slice(5);
            buckets.push(makeBucket(label, cursor, weekEnd, topicCount, countByDay));
            cursor = weekEnd + 1;
        }
        return buckets;
    }
    if (preset === '90d') {
        const buckets = [];
        for (let cursor = fromEpoch; cursor <= effectiveToEpoch; cursor += 10) {
            const end = Math.min(effectiveToEpoch, cursor + 9);
            buckets.push(makeBucket(epochDayToDate(cursor).slice(5), cursor, end, topicCount, countByDay));
        }
        return buckets;
    }
    // All-time adaptive buckets strictly capped at <= 10.
    const startDate = epochDayToDate(fromEpoch);
    const endDate = epochDayToDate(effectiveToEpoch);
    const startIdx = monthIndex(startDate.slice(0, 7));
    const endIdx = monthIndex(endDate.slice(0, 7));
    const totalMonths = endIdx - startIdx + 1;
    if (totalMonths <= MAX_TREND_BUCKETS) {
        const buckets = [];
        for (let idx = startIdx; idx <= endIdx; idx += 1) {
            const ym = monthFromIndex(idx);
            const bounds = monthBounds(ym);
            const bFrom = Math.max(fromEpoch, dateToEpochDay(bounds.from));
            const bTo = Math.min(effectiveToEpoch, dateToEpochDay(bounds.to));
            buckets.push(makeBucket(ym, bFrom, bTo, topicCount, countByDay));
        }
        return buckets;
    }
    // Try quarterly, half-yearly, yearly, then multi-year chunks until <= 10 buckets.
    const startQ = Math.floor(startIdx / 3);
    const endQ = Math.floor(endIdx / 3);
    if (endQ - startQ + 1 <= MAX_TREND_BUCKETS) {
        const buckets = [];
        for (let q = startQ; q <= endQ; q += 1) {
            const y = Math.floor(q / 4);
            const qNum = (q % 4) + 1;
            const mStart = monthFromIndex(q * 3);
            const mEnd = monthFromIndex(q * 3 + 2);
            const bFrom = Math.max(fromEpoch, dateToEpochDay(monthBounds(mStart).from));
            const bTo = Math.min(effectiveToEpoch, dateToEpochDay(monthBounds(mEnd).to));
            buckets.push(makeBucket(`${String(y).padStart(4, '0')}-Q${qNum}`, bFrom, bTo, topicCount, countByDay));
        }
        return buckets;
    }
    const startH = Math.floor(startIdx / 6);
    const endH = Math.floor(endIdx / 6);
    if (endH - startH + 1 <= MAX_TREND_BUCKETS) {
        const buckets = [];
        for (let h = startH; h <= endH; h += 1) {
            const y = Math.floor(h / 2);
            const hNum = (h % 2) + 1;
            const mStart = monthFromIndex(h * 6);
            const mEnd = monthFromIndex(h * 6 + 5);
            const bFrom = Math.max(fromEpoch, dateToEpochDay(monthBounds(mStart).from));
            const bTo = Math.min(effectiveToEpoch, dateToEpochDay(monthBounds(mEnd).to));
            buckets.push(makeBucket(`${String(y).padStart(4, '0')}-H${hNum}`, bFrom, bTo, topicCount, countByDay));
        }
        return buckets;
    }
    const startYear = Number(startDate.slice(0, 4));
    const endYear = Number(endDate.slice(0, 4));
    const totalYears = endYear - startYear + 1;
    const yearStep = totalYears <= MAX_TREND_BUCKETS ? 1 : Math.ceil(totalYears / MAX_TREND_BUCKETS);
    const buckets = [];
    for (let y = startYear; y <= endYear; y += yearStep) {
        const yEnd = Math.min(endYear, y + yearStep - 1);
        const yText = String(y).padStart(4, '0');
        const yEndText = String(yEnd).padStart(4, '0');
        const bFrom = Math.max(fromEpoch, dateToEpochDay(`${yText}-01-01`));
        const bTo = Math.min(effectiveToEpoch, dateToEpochDay(`${yEndText}-12-31`));
        const key = y === yEnd ? yText : `${yText}–${yEndText}`;
        buckets.push(makeBucket(key, bFrom, bTo, topicCount, countByDay));
    }
    return buckets;
}
//# sourceMappingURL=stats.js.map
