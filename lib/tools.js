import { defineTool } from "@deepseek-ai/dsh-tools";
//#region lib/types/tools.js
/** Cordis tool plugin identifier. */
const name = "checkin-tools";
/** Required Host capabilities. */
const inject = ["tools", "checkin"];
const TOPIC = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			type: "string",
			required: true
		},
		name: {
			type: "string",
			required: true
		},
		createdAt: {
			type: "string",
			required: true
		},
		updatedAt: {
			type: "string",
			required: true
		}
	}
};
const TOPICS = {
	type: "array",
	items: TOPIC,
	required: true
};
const CLOCK = {
	today: {
		type: "string",
		required: true
	},
	timeZone: {
		type: "string",
		required: true
	}
};
const ID = {
	type: "string",
	required: true,
	description: "Exact topic ID from checkin_topic_list; never guess an ID."
};
const NAME = {
	type: "string",
	required: true,
	description: "Unique topic name, 1–200 characters after trimming."
};
const NULLABLE_STRING = {
	oneOf: [{ type: "string" }, { type: "null" }],
	required: true
};
const NULLABLE_NUMBER = {
	oneOf: [{ type: "number" }, { type: "null" }],
	required: true
};
const NULLABLE_INTEGER = {
	oneOf: [{ type: "integer" }, { type: "null" }],
	required: true
};
const STATS_SUMMARY = {
	type: "object",
	additionalProperties: false,
	required: true,
	properties: {
		topicCount: {
			type: "integer",
			required: true
		},
		todayDoneCount: {
			type: "integer",
			required: true
		},
		todayTotalCount: {
			type: "integer",
			required: true
		},
		elapsedDays: NULLABLE_INTEGER,
		completedCheckins: {
			type: "integer",
			required: true
		},
		possibleCheckins: NULLABLE_INTEGER,
		completionRate: NULLABLE_NUMBER,
		activeDays: {
			type: "integer",
			required: true
		},
		perfectDays: {
			type: "integer",
			required: true
		},
		longestStreak: {
			type: "integer",
			required: true
		},
		longestStreakTopicId: NULLABLE_STRING,
		longestStreakTopicName: NULLABLE_STRING,
		longestStreakFrom: NULLABLE_STRING,
		longestStreakTo: NULLABLE_STRING,
		firstCompletedDate: NULLABLE_STRING,
		lastCompletedDate: NULLABLE_STRING,
		comparison: {
			oneOf: [{
				type: "object",
				additionalProperties: false,
				properties: {
					from: {
						type: "string",
						required: true
					},
					to: {
						type: "string",
						required: true
					},
					elapsedDays: {
						type: "integer",
						required: true
					},
					completedCheckins: {
						type: "integer",
						required: true
					},
					possibleCheckins: {
						type: "integer",
						required: true
					},
					completionRate: NULLABLE_NUMBER,
					rateDeltaPp: NULLABLE_NUMBER
				}
			}, { type: "null" }],
			required: true
		}
	}
};
const TOPIC_STAT = {
	type: "object",
	additionalProperties: false,
	properties: {
		topic: {
			...TOPIC,
			required: true
		},
		windowCount: {
			type: "integer",
			required: true
		},
		windowRate: NULLABLE_NUMBER,
		allTimeCount: {
			type: "integer",
			required: true
		},
		completedToday: {
			type: "boolean",
			required: true
		},
		currentStreak: {
			type: "integer",
			required: true
		},
		streakStatus: {
			type: "string",
			enum: [
				"done_today",
				"pending_today",
				"broken"
			],
			required: true
		},
		longestStreak: {
			type: "integer",
			required: true
		},
		longestStreakFrom: NULLABLE_STRING,
		longestStreakTo: NULLABLE_STRING,
		firstCompletedDate: NULLABLE_STRING,
		lastCompletedDate: NULLABLE_STRING
	}
};
const WEEKDAY_STAT = {
	type: "object",
	additionalProperties: false,
	properties: {
		weekday: {
			type: "integer",
			required: true
		},
		occurrences: {
			type: "integer",
			required: true
		},
		completed: {
			type: "integer",
			required: true
		},
		possible: {
			type: "integer",
			required: true
		},
		rate: NULLABLE_NUMBER
	}
};
const HEATMAP_CELL = {
	type: "object",
	additionalProperties: false,
	properties: {
		key: {
			type: "string",
			required: true
		},
		slot: {
			type: "integer",
			required: true
		},
		completed: {
			type: "integer",
			required: true
		},
		possible: {
			type: "integer",
			required: true
		},
		level: {
			type: "integer",
			required: true
		},
		future: {
			type: "boolean",
			required: true
		}
	}
};
const TREND_BUCKET = {
	type: "object",
	additionalProperties: false,
	properties: {
		key: {
			type: "string",
			required: true
		},
		from: {
			type: "string",
			required: true
		},
		to: {
			type: "string",
			required: true
		},
		elapsedDays: {
			type: "integer",
			required: true
		},
		completed: {
			type: "integer",
			required: true
		},
		possible: {
			type: "integer",
			required: true
		},
		rate: {
			type: "number",
			required: true
		}
	}
};
/** Register reversible tools whose inputs/results use DSH's ordinary Session log.
* @param ctx - Host context containing the SQLite service.
*/
function apply(ctx) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "checkin_topic_create",
		description: "Create a daily check-in topic shared across all sessions. Only a completed/not-completed status is tracked.",
		parameters: { name: NAME },
		output: {
			schema: TOPIC,
			render: (_args, result) => [{
				type: "text",
				text: JSON.stringify(result)
			}]
		},
		execute: (args, exec) => ctx.checkin.create(args, exec.signal),
		presentCall: (args) => ({
			card: "generic",
			title: `Create check-in topic: ${args.name}`,
			kind: "other",
			rawInput: args
		})
	})), "checkin: create tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "checkin_topic_list",
		description: "Find topic IDs and names before check-in, rename or deletion. Returns today in Asia/Shanghai. Ask the user if a topic reference is ambiguous.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					...CLOCK,
					topics: TOPICS
				}
			},
			render: (_args, result) => [{
				type: "text",
				text: JSON.stringify(result)
			}]
		},
		execute: (_args, exec) => ctx.checkin.list(exec.signal),
		presentCall: (args) => ({
			card: "generic",
			title: "List check-in topics",
			kind: "search",
			rawInput: args
		})
	})), "checkin: list tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "checkin_topic_update",
		description: "Rename an existing check-in topic without changing its historical completions. Resolve its ID with checkin_topic_list.",
		parameters: {
			id: ID,
			name: NAME
		},
		output: {
			schema: TOPIC,
			render: (_args, result) => [{
				type: "text",
				text: JSON.stringify(result)
			}]
		},
		execute: (args, exec) => ctx.checkin.update({
			...args,
			id: args.id
		}, exec.signal),
		presentCall: (args) => ({
			card: "generic",
			title: `Rename check-in topic: ${args.name}`,
			kind: "other",
			rawInput: args
		})
	})), "checkin: update tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "checkin_topic_delete",
		description: "Permanently delete a topic AND all its completed dates only when the user requests topic deletion. To undo one daily check-in, use checkin_set(completed=false) instead.",
		parameters: { id: ID },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					topic: {
						...TOPIC,
						required: true
					},
					deletedRecords: {
						type: "integer",
						required: true
					}
				}
			},
			render: (_args, result) => [{
				type: "text",
				text: JSON.stringify(result)
			}]
		},
		execute: (args, exec) => ctx.checkin.delete({ id: args.id }, exec.signal),
		presentCall: (args) => ({
			card: "generic",
			title: "Delete check-in topic and history",
			kind: "other",
			rawInput: args
		})
	})), "checkin: delete tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "checkin_set",
		description: "Set a topic as completed or incomplete on a Beijing calendar date. Omitted date means today in Asia/Shanghai. Any past date is allowed, future dates are rejected. Repeated writes are idempotent. Resolve topicId with checkin_topic_list first.",
		parameters: {
			topicId: ID,
			date: {
				type: "string",
				description: "YYYY-MM-DD in Asia/Shanghai, defaults to today."
			},
			completed: {
				type: "boolean",
				required: true,
				description: "true completes the day; false removes the completion."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					topic: {
						...TOPIC,
						required: true
					},
					date: {
						type: "string",
						required: true
					},
					completed: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, result) => [{
				type: "text",
				text: JSON.stringify(result)
			}]
		},
		execute: (args, exec) => ctx.checkin.set({
			...args,
			topicId: args.topicId
		}, exec.signal),
		presentCall: (args) => ({
			card: "generic",
			title: args.completed ? "Complete daily check-in" : "Undo daily check-in",
			kind: "other",
			rawInput: args
		})
	})), "checkin: set tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "checkin_query",
		description: "Query an inclusive range of Beijing dates, optionally for one topic. Returns current topics and only completed topic/date pairs; absent pairs are incomplete. Historical totals use the current topic catalog, with no start date. Future days are read-only, not missed days.",
		parameters: {
			from: {
				type: "string",
				required: true,
				description: "Inclusive YYYY-MM-DD."
			},
			to: {
				type: "string",
				required: true,
				description: "Inclusive YYYY-MM-DD."
			},
			topicId: {
				type: "string",
				description: "Exact topic ID; omit to select all topics."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					...CLOCK,
					from: {
						type: "string",
						required: true
					},
					to: {
						type: "string",
						required: true
					},
					topics: TOPICS,
					completions: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								topicId: {
									type: "string",
									required: true
								},
								date: {
									type: "string",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, result) => [{
				type: "text",
				text: JSON.stringify(result)
			}]
		},
		execute: (args, exec) => ctx.checkin.query({
			from: args.from,
			to: args.to,
			...args.topicId === void 0 ? {} : { topicId: args.topicId }
		}, exec.signal),
		presentCall: (args) => ({
			card: "generic",
			title: `Check-in history: ${args.from} – ${args.to}`,
			kind: "search",
			rawInput: args
		})
	})), "checkin: query tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "checkin_stats",
		description: "Compute check-in statistics (completion rates, streaks with today-grace status, weekday rhythm, and optional heatmap/trend series) in Asia/Shanghai. Prefer this over checkin_query when answering summary, rate, ranking, streak, or rhythm questions. Resolve topicId with checkin_topic_list first.",
		parameters: {
			preset: {
				type: "string",
				enum: [
					"7d",
					"30d",
					"90d",
					"month",
					"all"
				],
				description: "Window preset: 7d, 30d (default), 90d, month, or all."
			},
			month: {
				type: "string",
				description: "YYYY-MM calendar month when preset is month; defaults to current Beijing month."
			},
			topicId: {
				type: "string",
				description: "Exact topic ID from checkin_topic_list; omit for all current topics."
			},
			includeSeries: {
				type: "boolean",
				description: "Include heatmap and trend series (default false for compact output)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					...CLOCK,
					preset: {
						type: "string",
						enum: [
							"7d",
							"30d",
							"90d",
							"month",
							"all"
						],
						required: true
					},
					month: NULLABLE_STRING,
					from: {
						type: "string",
						required: true
					},
					to: {
						type: "string",
						required: true
					},
					effectiveTo: NULLABLE_STRING,
					topicId: NULLABLE_STRING,
					summary: STATS_SUMMARY,
					topics: {
						type: "array",
						items: TOPIC_STAT,
						required: true
					},
					weekdays: {
						type: "array",
						items: WEEKDAY_STAT,
						required: true
					},
					heatmapGranularity: {
						type: "string",
						enum: ["day", "month"]
					},
					heatmap: {
						type: "array",
						items: HEATMAP_CELL
					},
					trend: {
						type: "array",
						items: TREND_BUCKET
					}
				}
			},
			render: (_args, result) => [{
				type: "text",
				text: JSON.stringify(result)
			}]
		},
		execute: async (args, exec) => {
			const result = await ctx.checkin.stats({
				...args.preset !== void 0 ? { preset: args.preset } : {},
				...args.month !== void 0 ? { month: args.month } : {},
				...args.topicId !== void 0 ? { topicId: args.topicId } : {}
			}, exec.signal);
			const snapshot = result.snapshot;
			return {
				today: result.today,
				timeZone: result.timeZone,
				preset: snapshot.preset,
				month: snapshot.month,
				from: snapshot.from,
				to: snapshot.to,
				effectiveTo: snapshot.effectiveTo,
				topicId: snapshot.topicId,
				summary: snapshot.summary,
				topics: snapshot.topics,
				weekdays: snapshot.weekdays,
				...args.includeSeries === true ? {
					heatmapGranularity: snapshot.heatmapGranularity,
					heatmap: snapshot.heatmap,
					trend: snapshot.trend
				} : {}
			};
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Check-in stats (${args.preset ?? (args.month ? "month" : "30d")}${args.month ? `: ${args.month}` : ""})`,
			kind: "search",
			rawInput: args
		})
	})), "checkin: stats tool");
}
//#endregion
export { apply, inject, name };
