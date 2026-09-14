/** Model-facing check-in tools; all writes use the same Host service as the drawer. */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis tool plugin identifier. */
export declare const name = "checkin-tools";
/** Required Host capabilities. */
export declare const inject: string[];
/** Register tools whose inputs/results use DSH's ordinary Session log.
 * @param ctx - Host context containing the check-in service.
 */
export declare function apply(ctx: Context): void;
