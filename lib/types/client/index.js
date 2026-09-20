import remote from 'dsh-checkin/remote';
import { CheckinController } from "./controller.js";
import { CheckinPanel, CheckinTrigger } from "./CheckinPanel.js";
import { en, NS, zh } from "./locales.js";
const CHECKIN_ID = 'dsh-checkin';
const CHECKIN_KIND = 'checkin';
/** Required client services. */
export const inject = ['slots', 'locale', 'remote', 'sidebarRightTabs', 'sidebarRight'];
function unwrap(result) {
    if (!result.ok)
        throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.value;
}
/** Mount generated Remote declarations and reversible UI registrations.
 * @param ctx - Browser root context. @returns Async disposer.
 */
export async function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'checkin: dictionaries');
    const t = ctx.locale.bind(NS);
    const definition = {
        id: CHECKIN_ID,
        kind: CHECKIN_KIND,
        title: () => t('title'),
    };
    ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'checkin: right tab type');
    const unmount = await ctx.remote.$mount(remote);
    const fiber = ctx.inject(['remote.checkin'], scope => {
        const api = {
            month: async (request, signal) => unwrap(await scope.remote.checkin.month(request, signal)),
            create: async (request, signal) => unwrap(await scope.remote.checkin.create(request, signal)),
            update: async (request, signal) => unwrap(await scope.remote.checkin.update(request, signal)),
            delete: async (request, signal) => unwrap(await scope.remote.checkin.delete(request, signal)),
            set: async (request, signal) => unwrap(await scope.remote.checkin.set(request, signal)),
            exportData: async (request, signal) => unwrap(await scope.remote.checkin.exportData(request, signal)),
            importData: async (request, signal) => unwrap(await scope.remote.checkin.importData(request, signal)),
        };
        const panelProps = () => ({ createController: () => new CheckinController(api) });
        const triggerProps = () => ({
            openPanel: () => {
                try {
                    scope.sidebarRight.openTab(CHECKIN_KIND);
                }
                catch (error) {
                    if (!(error instanceof Error && error.message === 'sidebarRight: no session surface is mounted'))
                        throw error;
                }
            },
        });
        scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
            name: 'sidebar.footer.action', id: CHECKIN_KIND, order: 50, locale: NS, inject: triggerProps,
        }, CheckinTrigger));
        scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
            name: 'sidebar.right.pane.tab', key: CHECKIN_ID, locale: NS, inject: panelProps,
        }, CheckinPanel));
    });
    try {
        await fiber;
    }
    catch (error) {
        await unmount();
        throw error;
    }
    return async () => { await fiber.dispose(); await unmount(); };
}
//# sourceMappingURL=index.js.map
