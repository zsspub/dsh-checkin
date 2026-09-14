/** Right-tab state and latest-request-wins reads, independent of React and transport. */
import type { CreateTopic, MonthRequest, MonthResult, SetCheckin, TopicRequest, UpdateTopic } from '../types.ts';
import type { ConnectionController } from './connection-controller.ts';
/** Typed Host methods used by the right-tab UI. */
export interface CheckinApi {
    month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult>;
    create(request: CreateTopic, signal: AbortSignal): Promise<unknown>;
    update(request: UpdateTopic, signal: AbortSignal): Promise<unknown>;
    delete(request: TopicRequest, signal: AbortSignal): Promise<unknown>;
    set(request: SetCheckin, signal: AbortSignal): Promise<unknown>;
}
/** Stable external-store snapshot. */
export interface Snapshot {
    month: string | undefined;
    data: MonthResult | null;
    loading: boolean;
    busy: boolean;
    error: string | null;
}
/** Owns in-flight reads and UI writes; disposing cancels all requests. */
export declare class CheckinController {
    private readonly api;
    readonly connection?: ConnectionController | undefined;
    private state;
    private readonly listeners;
    private reader;
    private writer;
    private disposed;
    private unsubscribe;
    private connectionRevision;
    /** @param api - Generated Remote adapter. */
    constructor(api: CheckinApi, connection?: ConnectionController | undefined);
    /** @returns Immutable snapshot for React. */
    getSnapshot: () => Snapshot;
    /** @param listener - Snapshot observer. @returns Disposer. */
    subscribe: (listener: () => void) => (() => void);
    private publish;
    /** Cancel the current read while preserving selection and loaded data. */
    cancelRead(): void;
    /** @param month - Selected month; undefined requests the current Host month. */
    selectMonth(month?: string): void;
    /** @param silent - Keep visible data/errors during background polling. */
    refresh(silent?: boolean): Promise<void>;
    /** @param operation - One write sharing the UI controller's cancellation scope. @returns Whether the write succeeded. */
    mutate(operation: (api: CheckinApi, signal: AbortSignal) => Promise<unknown>): Promise<boolean>;
    /** Stop all requests and observers on plugin unload. */
    dispose(): void;
}
