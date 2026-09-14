import type { ConnectionState, ConnectRequest, DatabaseResources, InitializeRequest, LoginRequest } from '../types.ts';
export interface ConnectionApi {
    connection(signal: AbortSignal): Promise<ConnectionState>;
    login(request: LoginRequest, signal: AbortSignal): Promise<ConnectionState>;
    resources(signal: AbortSignal): Promise<DatabaseResources>;
    connect(request: ConnectRequest, signal: AbortSignal): Promise<ConnectionState>;
    initialize(request: InitializeRequest, signal: AbortSignal): Promise<ConnectionState>;
    logout(signal: AbortSignal): Promise<ConnectionState>;
}
export interface ConnectionSnapshot {
    connection: ConnectionState | null;
    resources: DatabaseResources | null;
    busy: boolean;
    error: string | null;
}
export declare function secureKeyTransport(location: Pick<Location, 'protocol' | 'hostname'>): boolean;
export declare class ConnectionController {
    private readonly api;
    private state;
    private readonly listeners;
    private readonly lifetime;
    private generation;
    constructor(api: ConnectionApi);
    getSnapshot: () => ConnectionSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    refresh(signal?: AbortSignal, clearError?: boolean): Promise<ConnectionState | null>;
    loadResources(): Promise<void>;
    run(operation: (api: ConnectionApi, signal: AbortSignal) => Promise<ConnectionState>): Promise<boolean>;
    dispose(): void;
}
