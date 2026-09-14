import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { ConnectionController } from './connection-controller.ts';
type Props = PropsLocale<'checkin'> & {
    controller: ConnectionController;
};
export declare function ConnectionPanel({ controller, t }: Props): import("react").JSX.Element;
export {};
