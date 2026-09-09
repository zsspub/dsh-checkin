/** Browser registration: shared Remote controller, sidebar entry and shell overlay. */
import type { Context } from '@deepseek-ai/cordis';
import { type CheckinKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        checkin: CheckinKey;
    }
}
/** Required client services. */
export declare const inject: string[];
/** Mount generated Remote declarations and reversible UI registrations.
 * @param ctx - Browser root context. @returns Async disposer.
 */
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
