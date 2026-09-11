import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { CheckinController } from './controller.ts';
/** Injected factory gives each right-tab occurrence independent request and UI state. */
export interface Injected {
    createController: () => CheckinController;
}
/** Sidebar entry opens or reveals the check-in page in the host right panel. */
export interface TriggerInjected {
    openPanel: () => void;
}
type Localized = PropsLocale<'checkin'>;
type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & Localized & Injected;
type TriggerProps = PropsRuntime<'sidebar.footer.action'> & Localized & TriggerInjected;
/** Sidebar action respects the host's collapsed rail.
 * @param props - Localized shell props and right-panel opener. @returns Sidebar trigger.
 */
export declare function CheckinTrigger({ wide, t, openPanel }: TriggerProps): import("react").JSX.Element;
/** Calendar, topic management and daily completion controls.
 * @param props - Localized tab props and per-occurrence controller factory. @returns Right-tab body.
 */
export declare function CheckinPanel({ t, createController, useTabInfo }: PanelProps): import("react").JSX.Element;
export {};
