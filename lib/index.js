import Schema from "@deepseek-ai/schemastery";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
const timestamp = z.iso.datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)));
const topic = z.strictObject({
	id: z.string().min(1).refine((value) => value.trim().length > 0),
	name: z.string().min(1).max(200).refine((value) => value === value.trim()),
	createdAt: timestamp,
	updatedAt: timestamp
}).refine((value) => Date.parse(value.createdAt) <= Date.parse(value.updatedAt));
const completionV1 = z.strictObject({
	topicId: z.string().min(1),
	date: z.iso.date().refine((value) => value >= "0001-01-01")
});
const completionV2 = completionV1.extend({ createdAt: timestamp });
const backupFields = {
	format: z.literal("dsh-checkin"),
	exportedAt: timestamp,
	topics: z.array(topic)
};
const backup = z.union([z.strictObject({
	...backupFields,
	version: z.literal(1),
	completions: z.array(z.union([completionV1, completionV2]))
}), z.strictObject({
	...backupFields,
	version: z.literal(2),
	completions: z.array(completionV2)
})]);
function assertBackupSize(json) {
	if (new TextEncoder().encode(json).byteLength > 20971520) throw new Error("checkin/backup-too-large");
}
function assertUnique(values) {
	if (new Set(values).size !== values.length) throw new Error("checkin/invalid-backup");
}
/** Strictly parse a portable backup in both the browser and Host. */
function parseCheckinBackup(json, today) {
	assertBackupSize(json);
	let value;
	try {
		value = JSON.parse(json.replace(/^\uFEFF/u, ""));
	} catch {
		throw new Error("checkin/invalid-backup");
	}
	const parsed = backup.safeParse(value);
	if (!parsed.success) throw new Error("checkin/invalid-backup");
	const result = parsed.data;
	assertUnique(result.topics.map((item) => item.id));
	assertUnique(result.topics.map((item) => item.name));
	assertUnique(result.completions.map((item) => `${item.topicId}\0${item.date}`));
	const topicIds = new Set(result.topics.map((item) => item.id));
	if (result.completions.some((item) => !topicIds.has(item.topicId) || today !== void 0 && item.date > today)) throw new Error("checkin/invalid-backup");
	return {
		format: result.format,
		version: 2,
		exportedAt: result.exportedAt,
		topics: result.topics.map((item) => ({
			...item,
			id: item.id
		})),
		completions: result.completions.map((item) => ({
			...item,
			topicId: item.topicId,
			createdAt: "createdAt" in item ? item.createdAt : result.exportedAt
		}))
	};
}
//#endregion
//#region lib/types/stats.js
const MS_PER_DAY = 864e5;
const MAX_TREND_BUCKETS = 10;
/** Allowed window preset values for runtime validation. */
const STATS_PRESETS = [
	"7d",
	"30d",
	"90d",
	"month",
	"all"
];
/** Type guard for runtime StatsPreset validation. */
function isStatsPreset(value) {
	return typeof value === "string" && STATS_PRESETS.includes(value);
}
/** Validate a canonical YYYY-MM-DD calendar date in 0001-01-01..9999-12-31. */
function isValidDate(date) {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date < "0001-01-01") return false;
	const [y, m, day] = date.split("-").map(Number);
	if (m < 1 || m > 12 || day < 1 || day > daysInMonth(y, m)) return false;
	return true;
}
/** Number of calendar days in a 1-indexed month, safe for years 0001..9999. */
function daysInMonth(year, month) {
	const value = /* @__PURE__ */ new Date(0);
	value.setUTCFullYear(year, month, 0);
	return value.getUTCDate();
}
/** Convert canonical YYYY-MM-DD to exact UTC epoch day without 2-digit year coercion. */
function dateToEpochDay(date) {
	const [y, m, day] = date.split("-").map(Number);
	const value = /* @__PURE__ */ new Date(0);
	value.setUTCFullYear(y, m - 1, day);
	return Math.round(value.getTime() / MS_PER_DAY);
}
/** Convert UTC epoch day back to canonical YYYY-MM-DD (returns out-of-range markers for years <1 or >9999). */
function epochDayToDate(epochDay) {
	const value = /* @__PURE__ */ new Date(epochDay * MS_PER_DAY);
	const y = value.getUTCFullYear();
	const m = value.getUTCMonth() + 1;
	const day = value.getUTCDate();
	return `${y < 0 ? `-${String(-y).padStart(4, "0")}` : String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const MIN_EPOCH_DAY = dateToEpochDay("0001-01-01");
/** Shift a YYYY-MM calendar month by an integer number of months using pure integer math. */
function shiftMonth(month, amount) {
	const [y, m] = month.split("-").map(Number);
	const total = y * 12 + (m - 1) + amount;
	const nextYear = Math.floor(total / 12);
	const nextMonth = (total % 12 + 12) % 12 + 1;
	return `${nextYear < 0 ? `-${String(-nextYear).padStart(4, "0")}` : String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}
/** Compute inclusive start/end dates for a validated YYYY-MM month. */
function monthBounds(month) {
	const from = `${month}-01`;
	if (!isValidDate(from)) throw new Error("checkin/invalid-date");
	const [y, m] = month.split("-").map(Number);
	return {
		from,
		to: `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`
	};
}
/** Monday-first weekday index (0=Mon..6=Sun) from UTC epoch day (1970-01-01 is Thu=3). */
function weekdayMon0(epochDay) {
	return ((epochDay + 3) % 7 + 7) % 7;
}
function monthIndex(ym) {
	const [y, m] = ym.split("-").map(Number);
	return y * 12 + (m - 1);
}
function monthFromIndex(index) {
	const y = Math.floor(index / 12);
	const m = (index % 12 + 12) % 12 + 1;
	return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}
function dayLevel(done, possible, singleTopic) {
	if (done <= 0 || possible <= 0) return 0;
	if (singleTopic) return 4;
	if (done >= possible) return 4;
	const ratio = done / possible;
	if (ratio <= .25) return 1;
	if (ratio <= .5) return 2;
	return 3;
}
function monthLevel(done, possible) {
	if (done <= 0 || possible <= 0) return 0;
	const ratio = done / possible;
	if (ratio <= .25) return 1;
	if (ratio <= .5) return 2;
	if (ratio <= .75) return 3;
	return 4;
}
/** Compute full check-in statistics for a Beijing calendar date without Node/DOM dependencies. */
function computeCheckinStats(input) {
	const { today, topics: catalog, completions, preset, topicId } = input;
	const todayEpoch = dateToEpochDay(today);
	const scopedTopics = topicId === void 0 ? [...catalog] : catalog.filter((topic) => topic.id === topicId);
	const scopedIds = new Set(scopedTopics.map((topic) => topic.id));
	const daysByTopic = /* @__PURE__ */ new Map();
	for (const topic of scopedTopics) daysByTopic.set(topic.id, []);
	const seen = /* @__PURE__ */ new Set();
	for (const item of completions) {
		if (!scopedIds.has(item.topicId) || item.date > today) continue;
		const key = `${item.topicId}\0${item.date}`;
		if (seen.has(key)) continue;
		seen.add(key);
		daysByTopic.get(item.topicId)?.push(dateToEpochDay(item.date));
	}
	let firstEpoch = null;
	let lastEpoch = null;
	const countByDay = /* @__PURE__ */ new Map();
	const countByMonth = /* @__PURE__ */ new Map();
	for (const days of daysByTopic.values()) {
		days.sort((a, b) => a - b);
		if (days.length > 0) {
			const first = days[0];
			const last = days[days.length - 1];
			if (firstEpoch === null || first < firstEpoch) firstEpoch = first;
			if (lastEpoch === null || last > lastEpoch) lastEpoch = last;
			for (const epoch of days) {
				countByDay.set(epoch, (countByDay.get(epoch) ?? 0) + 1);
				const ym = epochDayToDate(epoch).slice(0, 7);
				countByMonth.set(ym, (countByMonth.get(ym) ?? 0) + 1);
			}
		}
	}
	const firstCompletedDate = firstEpoch !== null ? epochDayToDate(firstEpoch) : null;
	const lastCompletedDate = lastEpoch !== null ? epochDayToDate(lastEpoch) : null;
	let resolvedMonth = null;
	let fromEpoch;
	let toEpoch;
	let effectiveToEpoch;
	let elapsedDays;
	let prior = null;
	if (preset === "7d" || preset === "30d" || preset === "90d") {
		const length = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
		toEpoch = todayEpoch;
		fromEpoch = Math.max(MIN_EPOCH_DAY, todayEpoch - (length - 1));
		effectiveToEpoch = todayEpoch;
		elapsedDays = effectiveToEpoch - fromEpoch + 1;
		const priorTo = fromEpoch - 1;
		if (priorTo >= MIN_EPOCH_DAY) prior = {
			fromEpoch: Math.max(MIN_EPOCH_DAY, priorTo - (elapsedDays - 1)),
			toEpoch: priorTo
		};
	} else if (preset === "month") {
		resolvedMonth = input.month ?? today.slice(0, 7);
		const bounds = monthBounds(resolvedMonth);
		fromEpoch = dateToEpochDay(bounds.from);
		toEpoch = dateToEpochDay(bounds.to);
		if (fromEpoch > todayEpoch) {
			effectiveToEpoch = null;
			elapsedDays = 0;
		} else {
			effectiveToEpoch = Math.min(toEpoch, todayEpoch);
			elapsedDays = effectiveToEpoch - fromEpoch + 1;
			if (resolvedMonth > "0001-01") {
				const prevBounds = monthBounds(shiftMonth(resolvedMonth, -1));
				const prevFrom = dateToEpochDay(prevBounds.from);
				const prevEnd = dateToEpochDay(prevBounds.to);
				prior = {
					fromEpoch: prevFrom,
					toEpoch: effectiveToEpoch === toEpoch ? prevEnd : Math.min(prevEnd, prevFrom + elapsedDays - 1)
				};
			}
		}
	} else {
		fromEpoch = firstEpoch ?? todayEpoch;
		toEpoch = todayEpoch;
		effectiveToEpoch = firstEpoch !== null ? todayEpoch : null;
		elapsedDays = null;
	}
	const from = epochDayToDate(fromEpoch);
	const to = epochDayToDate(toEpoch);
	const effectiveTo = effectiveToEpoch !== null ? epochDayToDate(effectiveToEpoch) : null;
	const topicCount = scopedTopics.length;
	let completedCheckins = 0;
	let todayDoneCount = 0;
	let bestLongest = 0;
	let bestLongestTopicId = null;
	let bestLongestTopicName = null;
	let bestLongestFrom = null;
	let bestLongestTo = null;
	const topicStats = scopedTopics.map((topic) => {
		const days = daysByTopic.get(topic.id) ?? [];
		const allTimeCount = days.length;
		const topicFirst = allTimeCount > 0 ? epochDayToDate(days[0]) : null;
		const topicLast = allTimeCount > 0 ? epochDayToDate(days[allTimeCount - 1]) : null;
		const completedToday = allTimeCount > 0 && days[allTimeCount - 1] === todayEpoch;
		if (completedToday) todayDoneCount += 1;
		let windowCount = 0;
		if (effectiveToEpoch !== null) {
			for (const epoch of days) if (epoch >= fromEpoch && epoch <= effectiveToEpoch) windowCount += 1;
		}
		completedCheckins += windowCount;
		const windowRate = elapsedDays !== null && elapsedDays > 0 ? windowCount / elapsedDays : null;
		let currentStreak = 0;
		let streakStatus = "broken";
		if (allTimeCount > 0) {
			const last = days[allTimeCount - 1];
			if (last === todayEpoch || last === todayEpoch - 1) {
				streakStatus = last === todayEpoch ? "done_today" : "pending_today";
				currentStreak = 1;
				for (let i = allTimeCount - 2; i >= 0; i -= 1) if (days[i] === days[i + 1] - 1) currentStreak += 1;
				else break;
			}
		}
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
				if (cur === days[i - 1] + 1) runLen += 1;
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
		if (longestStreak > bestLongest || longestStreak > 0 && longestStreak === bestLongest && (longestStreakTo ?? "") > (bestLongestTo ?? "")) {
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
			lastCompletedDate: topicLast
		};
	});
	let activeDays = 0;
	let perfectDays = 0;
	if (effectiveToEpoch !== null && topicCount > 0) for (const [epoch, done] of countByDay) {
		if (epoch < fromEpoch || epoch > effectiveToEpoch) continue;
		if (done > 0) activeDays += 1;
		if (done >= topicCount) perfectDays += 1;
	}
	const possibleCheckins = elapsedDays !== null && elapsedDays > 0 && topicCount > 0 ? topicCount * elapsedDays : null;
	const completionRate = possibleCheckins !== null && possibleCheckins > 0 ? completedCheckins / possibleCheckins : null;
	let comparison = null;
	if (prior !== null && topicCount > 0 && elapsedDays !== null && elapsedDays > 0 && firstEpoch !== null && firstEpoch <= prior.toEpoch) {
		const priorElapsed = prior.toEpoch - prior.fromEpoch + 1;
		const priorPossible = topicCount * priorElapsed;
		let priorCompleted = 0;
		for (const [epoch, done] of countByDay) if (epoch >= prior.fromEpoch && epoch <= prior.toEpoch) priorCompleted += done;
		const priorRate = priorPossible > 0 ? priorCompleted / priorPossible : null;
		const rateDeltaPp = completionRate !== null && priorRate !== null ? Math.round((completionRate - priorRate) * 1e3) / 10 : null;
		comparison = {
			from: epochDayToDate(prior.fromEpoch),
			to: epochDayToDate(prior.toEpoch),
			elapsedDays: priorElapsed,
			completedCheckins: priorCompleted,
			possibleCheckins: priorPossible,
			completionRate: priorRate,
			rateDeltaPp
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
		comparison
	};
	const heatmapGranularity = preset === "all" ? "month" : "day";
	const heatmap = [];
	if (heatmapGranularity === "day") {
		const singleTopic = topicCount === 1;
		for (let epoch = fromEpoch; epoch <= toEpoch; epoch += 1) {
			const future = epoch > todayEpoch;
			const completed = future ? 0 : countByDay.get(epoch) ?? 0;
			const possible = future ? 0 : topicCount;
			heatmap.push({
				key: epochDayToDate(epoch),
				slot: weekdayMon0(epoch),
				completed,
				possible,
				level: future ? 0 : dayLevel(completed, possible, singleTopic),
				future
			});
		}
	} else if (firstCompletedDate !== null) {
		const firstMonthIdx = monthIndex(firstCompletedDate.slice(0, 7));
		const todayMonthIdx = monthIndex(today.slice(0, 7));
		const startIdx = Math.max(firstMonthIdx, todayMonthIdx - 119);
		for (let idx = startIdx; idx <= todayMonthIdx; idx += 1) {
			const ym = monthFromIndex(idx);
			const bounds = monthBounds(ym);
			const mFrom = dateToEpochDay(bounds.from);
			const possible = topicCount * (Math.min(dateToEpochDay(bounds.to), todayEpoch) - mFrom + 1);
			const completed = countByMonth.get(ym) ?? 0;
			heatmap.push({
				key: ym,
				slot: Number(ym.slice(5, 7)),
				completed,
				possible,
				level: monthLevel(completed, possible),
				future: false
			});
		}
	}
	const trend = computeTrend(preset, fromEpoch, effectiveToEpoch, topicCount, countByDay);
	const weekdayCompleted = [
		0,
		0,
		0,
		0,
		0,
		0,
		0
	];
	if (effectiveToEpoch !== null) for (const [epoch, done] of countByDay) {
		if (epoch < fromEpoch || epoch > effectiveToEpoch) continue;
		const wd = weekdayMon0(epoch);
		weekdayCompleted[wd] = (weekdayCompleted[wd] ?? 0) + done;
	}
	const boundedElapsed = effectiveToEpoch !== null ? effectiveToEpoch - fromEpoch + 1 : 0;
	const fullWeeks = Math.floor(boundedElapsed / 7);
	const remainder = boundedElapsed % 7;
	const startWd = weekdayMon0(fromEpoch);
	const weekdays = Array.from({ length: 7 }, (_, wd) => {
		const completed = weekdayCompleted[wd] ?? 0;
		if (effectiveToEpoch === null) return {
			weekday: wd,
			occurrences: 0,
			completed: 0,
			possible: 0,
			rate: null
		};
		const offset = (wd - startWd + 7) % 7;
		const occurrences = fullWeeks + (offset < remainder ? 1 : 0);
		if (preset === "all") return {
			weekday: wd,
			occurrences,
			completed,
			possible: 0,
			rate: null
		};
		const possible = topicCount * occurrences;
		return {
			weekday: wd,
			occurrences,
			completed,
			possible,
			rate: possible > 0 ? completed / possible : null
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
		weekdays
	};
}
function makeBucket(key, bFrom, bTo, topicCount, countByDay) {
	const elapsedDays = bTo - bFrom + 1;
	const possible = topicCount * elapsedDays;
	let completed = 0;
	for (const [epoch, done] of countByDay) if (epoch >= bFrom && epoch <= bTo) completed += done;
	return {
		key,
		from: epochDayToDate(bFrom),
		to: epochDayToDate(bTo),
		elapsedDays,
		completed,
		possible,
		rate: possible > 0 ? completed / possible : 0
	};
}
function computeTrend(preset, fromEpoch, effectiveToEpoch, topicCount, countByDay) {
	if (preset === "7d" || effectiveToEpoch === null || topicCount === 0 || effectiveToEpoch < fromEpoch) return [];
	if (preset === "30d" || preset === "month") {
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
	if (preset === "90d") {
		const buckets = [];
		for (let cursor = fromEpoch; cursor <= effectiveToEpoch; cursor += 10) {
			const end = Math.min(effectiveToEpoch, cursor + 9);
			buckets.push(makeBucket(epochDayToDate(cursor).slice(5), cursor, end, topicCount, countByDay));
		}
		return buckets;
	}
	const startDate = epochDayToDate(fromEpoch);
	const endDate = epochDayToDate(effectiveToEpoch);
	const startIdx = monthIndex(startDate.slice(0, 7));
	const endIdx = monthIndex(endDate.slice(0, 7));
	if (endIdx - startIdx + 1 <= MAX_TREND_BUCKETS) {
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
	const startQ = Math.floor(startIdx / 3);
	const endQ = Math.floor(endIdx / 3);
	if (endQ - startQ + 1 <= MAX_TREND_BUCKETS) {
		const buckets = [];
		for (let q = startQ; q <= endQ; q += 1) {
			const y = Math.floor(q / 4);
			const qNum = q % 4 + 1;
			const mStart = monthFromIndex(q * 3);
			const mEnd = monthFromIndex(q * 3 + 2);
			const bFrom = Math.max(fromEpoch, dateToEpochDay(monthBounds(mStart).from));
			const bTo = Math.min(effectiveToEpoch, dateToEpochDay(monthBounds(mEnd).to));
			buckets.push(makeBucket(`${String(y).padStart(4, "0")}-Q${qNum}`, bFrom, bTo, topicCount, countByDay));
		}
		return buckets;
	}
	const startH = Math.floor(startIdx / 6);
	const endH = Math.floor(endIdx / 6);
	if (endH - startH + 1 <= MAX_TREND_BUCKETS) {
		const buckets = [];
		for (let h = startH; h <= endH; h += 1) {
			const y = Math.floor(h / 2);
			const hNum = h % 2 + 1;
			const mStart = monthFromIndex(h * 6);
			const mEnd = monthFromIndex(h * 6 + 5);
			const bFrom = Math.max(fromEpoch, dateToEpochDay(monthBounds(mStart).from));
			const bTo = Math.min(effectiveToEpoch, dateToEpochDay(monthBounds(mEnd).to));
			buckets.push(makeBucket(`${String(y).padStart(4, "0")}-H${hNum}`, bFrom, bTo, topicCount, countByDay));
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
		const yText = String(y).padStart(4, "0");
		const yEndText = String(yEnd).padStart(4, "0");
		const bFrom = Math.max(fromEpoch, dateToEpochDay(`${yText}-01-01`));
		const bTo = Math.min(effectiveToEpoch, dateToEpochDay(`${yEndText}-12-31`));
		const key = y === yEnd ? yText : `${yText}–${yEndText}`;
		buckets.push(makeBucket(key, bFrom, bTo, topicCount, countByDay));
	}
	return buckets;
}
//#endregion
//#region lib/types/host/store.js
/** SQLite owns the global topic catalog, sparse daily completions and portable backups. */
function failure(code) {
	return new RemoteError(code, code, {});
}
/** Calendar date in Beijing, independent of the machine's time zone.
* @param now - Instant to project. @returns YYYY-MM-DD date.
*/
function todayInBeijing(now = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(now);
}
/** Reject impossible or non-canonical dates at the request boundary.
* @param date - Calendar date. @returns Validated date.
*/
function validDate(date) {
	if (!isValidDate(date)) throw failure("checkin/invalid-date");
	return date;
}
/** Resolve an inclusive month range without using the local machine time zone.
* @param month - YYYY-MM month. @returns First and last calendar date.
*/
function monthRange(month) {
	try {
		return monthBounds(month);
	} catch {
		throw failure("checkin/invalid-date");
	}
}
function validName(value) {
	const name = value.trim();
	if (!name || name.length > 200) throw failure("checkin/invalid-name");
	return name;
}
function parseBackup(json, today) {
	try {
		return parseCheckinBackup(json, today);
	} catch (error) {
		if (error instanceof Error && error.message === "checkin/backup-too-large") throw failure("checkin/backup-too-large");
		throw failure("checkin/invalid-backup");
	}
}
function sqliteText(value) {
	if (typeof value !== "string") throw failure("checkin/invalid-config");
	return value;
}
function createSchema(db) {
	db.exec(`CREATE TABLE checkin_topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision TEXT NOT NULL
    );
    CREATE TABLE checkin_records (
      topic_id TEXT NOT NULL REFERENCES checkin_topics(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revision TEXT NOT NULL,
      PRIMARY KEY(topic_id, date)
    );
    CREATE INDEX checkin_records_by_date ON checkin_records(date, topic_id);
    PRAGMA user_version = 2;`);
}
/** One connection, prepared writes, and atomic catalog/record snapshots. */
var CheckinStore = class {
	now;
	db;
	storeEpoch = randomUUID().slice(0, 8);
	mutationSeq = 0;
	/** @param config - Absolute path and lock timeout. @param now - Clock used by date-sensitive operations. */
	constructor(config, now = () => /* @__PURE__ */ new Date()) {
		this.now = now;
		if (!isAbsolute(config.databasePath) || !Number.isSafeInteger(config.busyTimeoutMs) || config.busyTimeoutMs < 1) throw failure("checkin/invalid-config");
		mkdirSync(dirname(config.databasePath), {
			recursive: true,
			mode: 448
		});
		this.db = new DatabaseSync(config.databasePath);
		try {
			chmodSync(config.databasePath, 384);
			const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
			if (typeof version !== "number" || version > 2) throw failure("checkin/newer-schema");
			this.db.exec(`PRAGMA busy_timeout = ${config.busyTimeoutMs}; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`);
			if (version === 0) this.transaction(() => {
				createSchema(this.db);
			});
			if (version === 1) this.transaction(() => {
				const topics = this.db.prepare("SELECT id,name,createdAt,updatedAt FROM topics ORDER BY createdAt,id").all();
				const completions = this.db.prepare("SELECT topicId,date FROM completions ORDER BY date,topicId").all();
				createSchema(this.db);
				const insertTopic = this.db.prepare("INSERT INTO checkin_topics(id,name,created_at,updated_at,revision) VALUES(?,?,?,?,?)");
				const insertRecord = this.db.prepare("INSERT INTO checkin_records(topic_id,date,created_at,revision) VALUES(?,?,?,?)");
				for (const topic of topics) insertTopic.run(sqliteText(topic.id), sqliteText(topic.name), sqliteText(topic.createdAt), sqliteText(topic.updatedAt), randomUUID());
				const migratedAt = this.now().toISOString();
				for (const completion of completions) insertRecord.run(sqliteText(completion.topicId), sqliteText(completion.date), migratedAt, randomUUID());
				this.db.exec("DROP TABLE completions; DROP TABLE topics;");
			});
		} catch (error) {
			this.db.close();
			throw error;
		}
	}
	transaction(run) {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const result = run();
			this.db.exec("COMMIT");
			this.mutationSeq += 1;
			return result;
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	readTransaction(run) {
		this.db.exec("BEGIN");
		try {
			const result = run();
			this.db.exec("COMMIT");
			return result;
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	topic(id) {
		const row = this.db.prepare("SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM checkin_topics WHERE id=?").get(id);
		if (!row) throw failure("checkin/topic-not-found");
		return row;
	}
	/** Release the connection when the owning plugin unloads. */
	close() {
		this.db.close();
	}
	/** @returns Current catalog and Beijing date. */
	list() {
		return {
			today: todayInBeijing(this.now()),
			timeZone: "Asia/Shanghai",
			topics: this.db.prepare("SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM checkin_topics ORDER BY created_at,id").all()
		};
	}
	/** @param rawName - User-entered name. @returns Created topic. */
	create(rawName) {
		const name = validName(rawName);
		return this.transaction(() => {
			if (this.db.prepare("SELECT id FROM checkin_topics WHERE name=?").get(name)) throw failure("checkin/duplicate-name");
			const topic = {
				id: randomUUID(),
				name,
				createdAt: this.now().toISOString(),
				updatedAt: this.now().toISOString()
			};
			this.db.prepare("INSERT INTO checkin_topics(id,name,created_at,updated_at,revision) VALUES(?,?,?,?,?)").run(topic.id, name, topic.createdAt, topic.updatedAt, randomUUID());
			return topic;
		});
	}
	/** @param id - Existing topic. @param rawName - Replacement name. @returns Updated topic. */
	update(id, rawName) {
		const name = validName(rawName);
		return this.transaction(() => {
			this.topic(id);
			if (this.db.prepare("SELECT id FROM checkin_topics WHERE name=? AND id<>?").get(name, id)) throw failure("checkin/duplicate-name");
			this.db.prepare("UPDATE checkin_topics SET name=?,updated_at=?,revision=? WHERE id=?").run(name, this.now().toISOString(), randomUUID(), id);
			return this.topic(id);
		});
	}
	/** @param id - Topic to permanently remove. @returns Removed topic and completion count. */
	delete(id) {
		return this.transaction(() => {
			const topic = this.topic(id);
			const deletedRecords = Number(this.db.prepare("SELECT count(*) AS count FROM checkin_records WHERE topic_id=?").get(id)?.count);
			this.db.prepare("DELETE FROM checkin_topics WHERE id=?").run(id);
			return {
				topic,
				deletedRecords
			};
		});
	}
	/** @param request - Explicit desired status. @returns Actual date, topic and status. */
	set(request) {
		const today = todayInBeijing(this.now());
		const date = validDate(request.date ?? today);
		if (date > today) throw failure("checkin/future-date");
		return this.transaction(() => {
			const topic = this.topic(request.topicId);
			if (request.completed) this.db.prepare("INSERT OR IGNORE INTO checkin_records(topic_id,date,created_at,revision) VALUES(?,?,?,?)").run(topic.id, date, this.now().toISOString(), randomUUID());
			else this.db.prepare("DELETE FROM checkin_records WHERE topic_id=? AND date=?").run(topic.id, date);
			return {
				topic,
				date,
				completed: request.completed
			};
		});
	}
	/** @param request - Inclusive date range. @returns Current topics and sparse completed days. */
	query(request) {
		const from = validDate(request.from), to = validDate(request.to);
		if (from > to) throw failure("checkin/invalid-range");
		return this.readTransaction(() => {
			const list = this.list();
			const topics = request.topicId === void 0 ? list.topics : [this.topic(request.topicId)];
			const completions = request.topicId === void 0 ? this.db.prepare("SELECT topic_id AS topicId,date FROM checkin_records WHERE date BETWEEN ? AND ? ORDER BY date,topic_id").all(from, to) : this.db.prepare("SELECT topic_id AS topicId,date FROM checkin_records WHERE date BETWEEN ? AND ? AND topic_id=? ORDER BY date").all(from, to, request.topicId);
			return {
				...list,
				from,
				to,
				topics,
				completions
			};
		});
	}
	/** @param request - Window preset, optional month/topic filter, and revision watermark. @returns Computed stats or O(1) unchanged hit. */
	stats(request) {
		if (request.preset !== void 0 && !isStatsPreset(request.preset)) throw failure("checkin/invalid-range");
		const preset = request.preset ?? (request.month !== void 0 ? "month" : "30d");
		return this.readTransaction(() => {
			const today = todayInBeijing(this.now());
			const resolvedMonth = preset === "month" ? request.month ?? today.slice(0, 7) : void 0;
			if (resolvedMonth !== void 0) monthRange(resolvedMonth);
			const dataVersion = Number(this.db.prepare("PRAGMA data_version").get()?.data_version ?? 0);
			const queryFingerprint = `${preset}:${resolvedMonth ?? ""}:${request.topicId ?? ""}`;
			const revision = `${today}:${this.storeEpoch}:${this.mutationSeq}:${dataVersion}:${queryFingerprint}`;
			if (request.ifNoneMatch !== void 0 && request.ifNoneMatch === revision) return {
				today,
				timeZone: "Asia/Shanghai",
				revision,
				unchanged: true,
				snapshot: null
			};
			const topics = this.db.prepare("SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM checkin_topics ORDER BY created_at,id").all();
			if (request.topicId !== void 0 && !topics.some((topic) => topic.id === request.topicId)) throw failure("checkin/topic-not-found");
			return {
				today,
				timeZone: "Asia/Shanghai",
				revision,
				unchanged: false,
				snapshot: computeCheckinStats({
					today,
					topics,
					completions: request.topicId === void 0 ? this.db.prepare("SELECT topic_id AS topicId,date FROM checkin_records WHERE date<=? ORDER BY topic_id,date").all(today) : this.db.prepare("SELECT topic_id AS topicId,date FROM checkin_records WHERE topic_id=? AND date<=? ORDER BY date").all(request.topicId, today),
					preset,
					...resolvedMonth !== void 0 ? { month: resolvedMonth } : {},
					...request.topicId !== void 0 ? { topicId: request.topicId } : {}
				})
			};
		});
	}
	/** @returns Deterministic full backup and timestamped filename. */
	exportData() {
		const backup = this.readTransaction(() => ({
			format: "dsh-checkin",
			version: 2,
			exportedAt: this.now().toISOString(),
			topics: this.list().topics,
			completions: this.db.prepare("SELECT topic_id AS topicId,date,created_at AS createdAt FROM checkin_records ORDER BY date,topic_id").all()
		}));
		const json = JSON.stringify(backup, null, 2);
		try {
			assertBackupSize(json);
		} catch {
			throw failure("checkin/backup-too-large");
		}
		return {
			filename: `dsh-checkin-${backup.exportedAt.replace(/[:.]/gu, "-")}.json`,
			json
		};
	}
	/** Atomically add unseen topic IDs while preserving all existing local topics. */
	importData(json) {
		const backup = parseBackup(json, todayInBeijing(this.now()));
		return this.transaction(() => {
			const existingIds = new Set(this.db.prepare("SELECT id FROM checkin_topics").all().map((row) => row.id));
			const incoming = backup.topics.filter((topic) => !existingIds.has(topic.id));
			const findName = this.db.prepare("SELECT id FROM checkin_topics WHERE name=?");
			if (incoming.some((topic) => findName.get(topic.name) !== void 0)) throw failure("checkin/import-conflict");
			const insertTopic = this.db.prepare("INSERT INTO checkin_topics(id,name,created_at,updated_at,revision) VALUES(?,?,?,?,?)");
			const insertRecord = this.db.prepare("INSERT INTO checkin_records(topic_id,date,created_at,revision) VALUES(?,?,?,?)");
			for (const topic of incoming) insertTopic.run(topic.id, topic.name, topic.createdAt, topic.updatedAt, randomUUID());
			const importedIds = new Set(incoming.map((topic) => topic.id));
			const completions = backup.completions.filter((item) => importedIds.has(item.topicId));
			for (const item of completions) insertRecord.run(item.topicId, item.date, item.createdAt, randomUUID());
			return {
				importedTopics: incoming.length,
				importedCompletions: completions.length,
				skippedTopics: backup.topics.length - incoming.length
			};
		});
	}
};
//#endregion
//#region lib/types/index.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Global SQLite service; no session or workspace partitioning. */
let CheckinService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _list_decorators;
	let _create_decorators;
	let _update_decorators;
	let _delete_decorators;
	let _set_decorators;
	let _query_decorators;
	let _month_decorators;
	let _stats_decorators;
	let _exportData_decorators;
	let _importData_decorators;
	return class CheckinService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_list_decorators = [Remote];
			_create_decorators = [Remote];
			_update_decorators = [Remote];
			_delete_decorators = [Remote];
			_set_decorators = [Remote];
			_query_decorators = [Remote];
			_month_decorators = [Remote];
			_stats_decorators = [Remote];
			_exportData_decorators = [Remote];
			_importData_decorators = [Remote];
			__esDecorate(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _create_decorators, {
				kind: "method",
				name: "create",
				static: false,
				private: false,
				access: {
					has: (obj) => "create" in obj,
					get: (obj) => obj.create
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _update_decorators, {
				kind: "method",
				name: "update",
				static: false,
				private: false,
				access: {
					has: (obj) => "update" in obj,
					get: (obj) => obj.update
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _delete_decorators, {
				kind: "method",
				name: "delete",
				static: false,
				private: false,
				access: {
					has: (obj) => "delete" in obj,
					get: (obj) => obj.delete
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _set_decorators, {
				kind: "method",
				name: "set",
				static: false,
				private: false,
				access: {
					has: (obj) => "set" in obj,
					get: (obj) => obj.set
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _query_decorators, {
				kind: "method",
				name: "query",
				static: false,
				private: false,
				access: {
					has: (obj) => "query" in obj,
					get: (obj) => obj.query
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _month_decorators, {
				kind: "method",
				name: "month",
				static: false,
				private: false,
				access: {
					has: (obj) => "month" in obj,
					get: (obj) => obj.month
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _stats_decorators, {
				kind: "method",
				name: "stats",
				static: false,
				private: false,
				access: {
					has: (obj) => "stats" in obj,
					get: (obj) => obj.stats
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _exportData_decorators, {
				kind: "method",
				name: "exportData",
				static: false,
				private: false,
				access: {
					has: (obj) => "exportData" in obj,
					get: (obj) => obj.exportData
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _importData_decorators, {
				kind: "method",
				name: "importData",
				static: false,
				private: false,
				access: {
					has: (obj) => "importData" in obj,
					get: (obj) => obj.importData
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		config = __runInitializers(this, _instanceExtraInitializers);
		static Config = Schema.object({
			databasePath: Schema.string().required(),
			busyTimeoutMs: Schema.number().step(1).min(1).default(5e3),
			refreshIntervalMs: Schema.number().step(1).min(250).default(3e3)
		});
		store;
		/** @param ctx - Host context. @param config - Validated deployment settings. */
		constructor(ctx, config) {
			super(ctx, "checkin");
			this.config = config;
			this.store = new CheckinStore(config);
			ctx.effect(() => () => this.store.close(), "checkin: close sqlite");
		}
		/** @param signal - Request cancellation. @returns Catalog and Beijing date. */
		async list(signal) {
			signal.throwIfAborted();
			return this.store.list();
		}
		/** @param request - New name. @param signal - Cancellation. @returns Created topic. */
		async create(request, signal) {
			signal.throwIfAborted();
			return this.store.create(request.name);
		}
		/** @param request - Topic and new name. @param signal - Cancellation. @returns Updated topic. */
		async update(request, signal) {
			signal.throwIfAborted();
			return this.store.update(request.id, request.name);
		}
		/** @param request - Topic to delete. @param signal - Cancellation. @returns Removed topic and count. */
		async delete(request, signal) {
			signal.throwIfAborted();
			return this.store.delete(request.id);
		}
		/** @param request - Desired completion status. @param signal - Cancellation. @returns Persisted status. */
		async set(request, signal) {
			signal.throwIfAborted();
			return this.store.set(request);
		}
		/** @param request - Inclusive dates. @param signal - Cancellation. @returns Sparse completions. */
		async query(request, signal) {
			signal.throwIfAborted();
			return this.store.query(request);
		}
		/** @param request - Month, defaulting to Beijing's current month. @param signal - Cancellation. @returns Calendar snapshot. */
		async month(request, signal) {
			signal.throwIfAborted();
			const month = request.month ?? this.store.list().today.slice(0, 7);
			return {
				...this.store.query(monthRange(month)),
				month,
				refreshIntervalMs: this.config.refreshIntervalMs
			};
		}
		/** @param request - Statistics window, optional topic filter, and conditional revision watermark. @param signal - Cancellation. @returns Aggregated check-in statistics or O(1) unchanged hit. */
		async stats(request, signal) {
			signal.throwIfAborted();
			return {
				...this.store.stats(request),
				refreshIntervalMs: this.config.refreshIntervalMs
			};
		}
		/** @param _request - Empty request. @param signal - Cancellation. @returns Portable JSON backup. */
		async exportData(_request, signal) {
			signal.throwIfAborted();
			return this.store.exportData();
		}
		/** @param request - Confirmed backup. @param signal - Cancellation. @returns Incremental import counts. */
		async importData(request, signal) {
			signal.throwIfAborted();
			return this.store.importData(request.json);
		}
	};
})();
//#endregion
export { CheckinService, CheckinService as default };
