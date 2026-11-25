import type { TopicId } from '../types.ts';
import type { CheckinController, Snapshot } from './controller.ts';
import type { CheckinKey } from './locales.ts';
type Translator = (key: CheckinKey, params?: Record<string, string | number>) => string;
/** Callback options for drilling down from statistics into the calendar view. */
export interface CalendarDrilldown {
    date?: string;
    month?: string;
    topicId?: TopicId | '';
}
/** Props passed from CheckinPanel to StatsView. */
export interface StatsViewProps {
    state: Snapshot;
    controller: CheckinController;
    t: Translator;
    onCreateTopic: () => void;
    onOpenCalendar: (target: CalendarDrilldown) => void;
    failureKey: (error: string) => CheckinKey;
}
/** Main statistics view combining Today Strip, global filter bar, KPIs, comparison list, heatmap, trend, and weekday rhythm. */
export declare function StatsView({ state, controller, t, onCreateTopic, onOpenCalendar, failureKey }: StatsViewProps): import("react").JSX.Element;
export {};
