import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { CheckinController } from './controller.ts';
/** Injected controller shared by the sidebar and overlay entries. */
export interface Injected {
    controller: CheckinController;
}
type Localized = PropsLocale<'checkin'>;
type PanelProps = PropsRuntime<'shell.overlay'> & Localized & Injected;
type TriggerProps = PropsRuntime<'sidebar.footer.action'> & Localized & Injected;
/** Sidebar action respects the host's collapsed rail.
 * @param props - Localized shell props and shared controller. @returns Sidebar trigger.
 */
export declare function CheckinTrigger({ wide, t, controller }: TriggerProps): import("react").JSX.Element;
/** Calendar, topic management and daily completion controls.
 * @param props - Localized shell props and shared controller. @returns Overlay or null when closed.
 */
export declare function CheckinPanel({ t, controller }: PanelProps): import("react").JSX.Element | null;
export {};
