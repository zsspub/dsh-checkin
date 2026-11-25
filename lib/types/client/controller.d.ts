/** Right-tab state and latest-request-wins reads, independent of React and transport. */
import type { CreateTopic, ExportDataRequest, ExportDataResult, ImportDataRequest, ImportDataResult, MonthRequest, MonthResult, SetCheckin, StatsPreset, StatsRequest, StatsResult, StatsSnapshot, TopicId, TopicRequest, UpdateTopic } from '../types.ts';
/** Active right-tab view. */
export type PanelView = 'calendar' | 'stats';
/** Typed Host methods used by the right-tab UI. */
export interface CheckinApi {
    month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult>;
    stats(request: StatsRequest, signal: AbortSignal): Promise<StatsResult>;
    create(request: CreateTopic, signal: AbortSignal): Promise<unknown>;
    update(request: UpdateTopic, signal: AbortSignal): Promise<unknown>;
    delete(request: TopicRequest, signal: AbortSignal): Promise<unknown>;
    set(request: SetCheckin, signal: AbortSignal): Promise<unknown>;
    exportData(request: ExportDataRequest, signal: AbortSignal): Promise<ExportDataResult>;
    importData(request: ImportDataRequest, signal: AbortSignal): Promise<ImportDataResult>;
}
/** Stable external-store snapshot shared by calendar and statistics views. */
export interface Snapshot {
    view: PanelView;
    topicId: TopicId | '';
    month: string | undefined;
    data: MonthResult | null;
    loading: boolean;
    busy: boolean;
    error: string | null;
    statsPreset: StatsPreset;
    statsMonth: string | undefined;
    stats: StatsSnapshot | null;
    statsToday: string | null;
    statsRefreshIntervalMs: number;
    statsRevision: string | null;
    statsLoading: boolean;
    statsRefreshing: boolean;
    statsError: string | null;
    statsNotice: 'topicDeleted' | null;
    statsStale: boolean;
}
/** Owns in-flight reads and UI writes; disposing cancels all requests. */
export declare class CheckinController {
    private readonly api;
    private state;
    private readonly listeners;
    private reader;
    private statsReader;
    private writer;
    private calendarStale;
    private disposed;
    /** @param api - Generated Remote adapter. */
    constructor(api: CheckinApi);
    /** @returns Immutable snapshot for React. */
    getSnapshot: () => Snapshot;
    /** @param listener - Snapshot observer. @returns Disposer. */
    subscribe: (listener: () => void) => (() => void);
    private publish;
    /** Cancel in-flight reads for both views while preserving loaded data. */
    cancelRead(): void;
    /** Clear active error banners after dismissal. */
    clearError(): void;
    /** Dismiss the deleted-topic auto-recovery notice. */
    clearStatsNotice(): void;
    /** Switch between calendar and statistics while preserving shared topic context. */
    setView(view: PanelView): void;
    /** Update the shared topic filter across calendar and statistics views. */
    setTopicId(topicId: TopicId | ''): void;
    /** Change the statistics time range preset (and optional YYYY-MM when preset is 'month'). */
    setStatsFilter(preset: StatsPreset, month?: string): void;
    /** Drill down from statistics into the calendar tab, optionally switching month and topic. */
    openCalendar(options?: {
        month?: string;
        topicId?: TopicId | '';
    }): void;
    /** @param month - Selected month; undefined requests the current Host month. */
    selectMonth(month?: string): void;
    /** @param silent - Keep visible data/errors during background polling. */
    refresh(silent?: boolean): Promise<void>;
    /** Fetch or conditionally revalidate statistics using the Host's O(1) revision watermark. */
    refreshStats(silent?: boolean): Promise<void>;
    /** @param operation - One write sharing the UI controller's cancellation scope. @returns Whether the write succeeded. */
    mutate(operation: (api: CheckinApi, signal: AbortSignal) => Promise<unknown>): Promise<boolean>;
    /** Export without changing the current calendar snapshot. */
    exportData(): Promise<ExportDataResult | null>;
    /** Import a validated backup and refresh the active view. */
    importData(request: ImportDataRequest): Promise<ImportDataResult | null>;
    /** Stop all requests and observers on plugin unload. */
    dispose(): void;
}
