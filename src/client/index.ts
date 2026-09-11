/** Browser registration: shared Remote controller, sidebar entry and host right-tab body. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import remote from 'dsh-checkin/remote'
import { CheckinController, type CheckinApi } from './controller.ts'
import { CheckinPanel, CheckinTrigger, type Injected, type TriggerInjected } from './CheckinPanel.tsx'
import { en, NS, zh, type CheckinKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { checkin: CheckinKey }
}

const CHECKIN_ID = 'dsh-checkin'
const CHECKIN_KIND = 'checkin'

/** Required client services. */
export const inject = ['slots', 'locale', 'remote', 'sidebarRightTabs', 'sidebarRight']

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string; code: string } }): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

/** Mount generated Remote declarations and reversible UI registrations.
 * @param ctx - Browser root context. @returns Async disposer.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'checkin: dictionaries')
  const t = ctx.locale.bind(NS)
  const definition: SidebarRightTabDefinition = {
    id: CHECKIN_ID,
    kind: CHECKIN_KIND,
    title: () => t('title'),
  }
  ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'checkin: right tab type')

  const unmount = await ctx.remote.$mount(remote)
  const fiber = ctx.inject(['remote.checkin'], scope => {
    const api: CheckinApi = {
      month: async (request, signal) => unwrap(await scope.remote.checkin.month(request, signal)),
      create: async (request, signal) => unwrap(await scope.remote.checkin.create(request, signal)),
      update: async (request, signal) => unwrap(await scope.remote.checkin.update(request, signal)),
      delete: async (request, signal) => unwrap(await scope.remote.checkin.delete(request, signal)),
      set: async (request, signal) => unwrap(await scope.remote.checkin.set(request, signal)),
    }
    const panelProps = (): Injected => ({ createController: () => new CheckinController(api) })
    const triggerProps = (): TriggerInjected => ({
      openPanel: () => {
        try {
          scope.sidebarRight.openTab(CHECKIN_KIND)
        } catch (error) {
          if (!(error instanceof Error && error.message === 'sidebarRight: no session surface is mounted')) throw error
        }
      },
    })
    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
      name: 'sidebar.footer.action', id: CHECKIN_KIND, order: 50, locale: NS, inject: triggerProps,
    }, CheckinTrigger))
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: CHECKIN_ID, locale: NS, inject: panelProps,
    }, CheckinPanel))
  })
  try { await fiber } catch (error) { await unmount(); throw error }
  return async () => { await fiber.dispose(); await unmount() }
}
