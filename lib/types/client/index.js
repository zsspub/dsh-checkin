import remote from 'dsh-checkin/remote';
import { CheckinController } from "./controller.js";
import { CheckinPanel, CheckinTrigger } from "./CheckinPanel.js";
import { en, NS, zh } from "./locales.js";
/** Required client services. */
export const inject = ['slots', 'locale', 'remote'];
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
    const unmount = await ctx.remote.$mount(remote);
    const fiber = ctx.inject(['remote.checkin'], scope => {
        const controller = new CheckinController({
            month: async (request, signal) => unwrap(await scope.remote.checkin.month(request, signal)),
            create: async (request, signal) => unwrap(await scope.remote.checkin.create(request, signal)),
            update: async (request, signal) => unwrap(await scope.remote.checkin.update(request, signal)),
            delete: async (request, signal) => unwrap(await scope.remote.checkin.delete(request, signal)),
            set: async (request, signal) => unwrap(await scope.remote.checkin.set(request, signal)),
        });
        scope.effect(() => () => controller.dispose(), 'checkin: controller');
        const props = () => ({ controller });
        scope.slots.inject('sidebar.footer.action', () => scope.slots.register({ name: 'sidebar.footer.action', id: 'checkin', order: 50, locale: NS, inject: props }, CheckinTrigger));
        scope.slots.inject('shell.overlay', () => scope.slots.register({ name: 'shell.overlay', id: 'checkin', order: 50, locale: NS, inject: props }, CheckinPanel));
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
