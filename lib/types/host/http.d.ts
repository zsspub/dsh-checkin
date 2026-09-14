import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import type { CheckinErrorCode } from '../types.ts';
export declare function failure(code: CheckinErrorCode): RemoteError<CheckinErrorCode>;
export declare class PubClient {
    private readonly apiKey;
    private readonly timeout;
    private readonly lifetime;
    constructor(apiKey: string, timeout?: number);
    close(): void;
    request(path: string, signal?: AbortSignal, body?: unknown, write?: boolean): Promise<Response>;
    parse<Shape extends z.ZodType>(response: Response, schema: Shape): Promise<z.infer<Shape>>;
}
