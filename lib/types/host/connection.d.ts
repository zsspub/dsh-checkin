import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionState, ConnectRequest, DatabaseResources, InitializeRequest } from '../types.ts';
import { CheckinStore, type StoreConfig } from './store.ts';
export declare class CheckinConnection {
    private readonly ctx;
    private readonly config;
    private queue;
    private readonly lifetime;
    private store;
    private storeSignature;
    constructor(ctx: Context, config: StoreConfig);
    close(): void;
    private serial;
    private external;
    private provider;
    private saved;
    private save;
    private editable;
    private overview;
    private state;
    connection(signal: AbortSignal): Promise<ConnectionState>;
    login(apiKey: string, signal: AbortSignal): Promise<ConnectionState>;
    resources(signal: AbortSignal): Promise<DatabaseResources>;
    private activate;
    connect(target: ConnectRequest, signal: AbortSignal): Promise<ConnectionState>;
    initialize(request: InitializeRequest, signal: AbortSignal): Promise<ConnectionState>;
    logout(signal: AbortSignal): Promise<ConnectionState>;
    use<Result>(signal: AbortSignal, action: (store: CheckinStore, signal: AbortSignal) => Promise<Result>): Promise<Result>;
}
