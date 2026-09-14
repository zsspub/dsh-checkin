import { z } from 'zod';
import { PubClient } from './http.ts';
export { failure } from './http.ts';
declare const recordSchema: z.ZodObject<{
    id: z.ZodUUID;
    name: z.ZodString;
    createdAt: z.ZodISODateTime;
    updatedAt: z.ZodISODateTime;
    revision: z.ZodUUID;
}, z.core.$strip>;
declare const completionSchema: z.ZodObject<{
    topicId: z.ZodUUID;
    date: z.ZodString;
    createdAt: z.ZodISODateTime;
    revision: z.ZodUUID;
}, z.core.$strip>;
export type DatabaseRecord = z.infer<typeof recordSchema>;
export type DatabaseCompletion = z.infer<typeof completionSchema>;
export interface StoreConfig {
    apiKey?: string;
    databaseId?: string;
    tableName?: string;
    recordsTableName?: string;
    requestTimeoutMs?: number;
}
export declare const topicColumns: ({
    name: string;
    type: string;
    length: number;
    primaryKey: boolean;
    unique?: never;
} | {
    name: string;
    type: string;
    length: number;
    unique: boolean;
    primaryKey?: never;
} | {
    name: string;
    type: string;
    length: number;
    primaryKey?: never;
    unique?: never;
})[];
export declare function recordsTableSql(name: string): string;
export declare function validateTable(client: PubClient, databaseId: string, name: string, role: 'topics' | 'records', signal?: AbortSignal): Promise<void>;
export declare class PubDatabase {
    private readonly apiKey;
    private readonly databaseId;
    private readonly tableName;
    private readonly recordsTableName;
    private readonly timeout;
    private readonly client;
    private readonly databasePath;
    private readonly table;
    private readonly recordsTable;
    private schemaValidatedAt;
    constructor(config: StoreConfig);
    close(): void;
    private request;
    private parse;
    overview(signal?: AbortSignal): Promise<{
        limits: {
            maxDatabases: number;
            maxTables: number;
            maxBytes: number;
        };
        database: {
            id: string;
            status: "ready" | "provisioning" | "deleting";
            usedBytes: number;
            tables: {
                name: string;
            }[];
        };
        table: {
            name: string;
        };
    }>;
    private prepare;
    private execute;
    private select;
    private count;
    list(signal?: AbortSignal): Promise<DatabaseRecord[]>;
    private read;
    get(id: string, signal?: AbortSignal): Promise<DatabaseRecord | null>;
    private verify;
    create(name: string, timestamp: string, signal?: AbortSignal): Promise<DatabaseRecord>;
    update(previous: DatabaseRecord, patch: {
        name: string;
    }, timestamp: string, signal?: AbortSignal): Promise<DatabaseRecord>;
    delete(previous: DatabaseRecord, signal?: AbortSignal): Promise<number>;
    private selectCompletions;
    completions(from: string, to: string, topicId?: string, signal?: AbortSignal): Promise<DatabaseCompletion[]>;
    set(previous: DatabaseRecord, date: string, completed: boolean, timestamp: string, signal?: AbortSignal): Promise<void>;
}
