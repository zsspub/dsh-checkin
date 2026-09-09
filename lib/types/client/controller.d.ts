/** Drawer state and latest-request-wins reads, independent of React and transport. */
import type { CreateTopic, MonthRequest, MonthResult, SetCheckin, TopicRequest, UpdateTopic } from '../types.ts';
/** Typed Host methods used by the drawer. */
export interface CheckinApi {
    month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult>;
    create(request: CreateTopic, signal: AbortSignal): Promise<unknown>;
    update(request: UpdateTopic, signal: AbortSignal): Promise<unknown>;
    delete(request: TopicRequest, signal: AbortSignal): Promise<unknown>;
    set(request: SetCheckin, signal: AbortSignal): Promise<unknown>;
}
/** Stable external-store snapshot. */
export interface Snapshot {
    open: boolean;
    month: string | undefined;
    data: MonthResult | null;
    loading: boolean;
    busy: boolean;
    error: string | null;
}
/** Owns in-flight reads and UI writes; closing cancels reads, disposing cancels all requests. */
export declare class CheckinController {
    private readonly api;
    private state;
    private readonly listeners;
    private reader;
    private writer;
    private disposed;
    /** @param api - Generated Remote adapter. */
    constructor(api: CheckinApi);
    /** @returns Immutable snapshot for React. */
    getSnapshot: () => Snapshot;
    /** @param listener - Snapshot observer. @returns Disposer. */
    subscribe: (listener: () => void) => (() => void);
    private publish;
    /** Open and refresh from the authoritative Host date/catalog. */
    open(): void;
    /** Close while preserving selection; cancelled reads cannot publish later. */
    close(): void;
    /** @param month - Selected month; undefined requests the current Host month. */
    selectMonth(month?: string): void;
    /** @param silent - Keep visible data/errors during background polling. */
    refresh(silent?: boolean): Promise<void>;
    /** @param operation - One write sharing the drawer's cancellation scope. @returns Whether the write succeeded. */
    mutate(operation: (api: CheckinApi, signal: AbortSignal) => Promise<unknown>): Promise<boolean>;
    /** Stop all requests and observers on plugin unload. */
    dispose(): void;
}
