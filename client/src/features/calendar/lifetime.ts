import type {CalendarHost} from './host';
export interface CalendarLifetime {
 view: number; navigation: number; refresh: number; events: number; userData: number; requests: number;
 initialized: boolean; disposers: Map<string, () => void>;
}
/** Owner is stored on the host, never in a bundled module-local singleton. */
export function lifetime(JE: CalendarHost): CalendarLifetime {
 return JE.internals.calendarLifetime ||= {view:0,navigation:0,refresh:0,events:0,userData:0,requests:0,initialized:false,disposers:new Map()};
}
export function lease(JE: CalendarHost, channel?: 'navigation' | 'refresh' | 'events' | 'userData' | 'requests') {
 const owner = lifetime(JE), view = owner.view, epoch = JE.session?.getEpoch(), session = JE.session?.createLease?.();
 const serial = channel ? ++owner[channel] : 0;
 const container = JE.internals.calendarPage?.state?._customTabContainer;
 return () => owner.view === view && (!channel || owner[channel] === serial) &&
  (epoch === undefined || JE.session?.isCurrent(epoch) === true) && (!session || session.isCurrent()) &&
  (!container || container.isConnected && JE.helpers.isActiveTabContainer(container));
}
/** Cancel only pending item navigation; refresh and request caches retain ownership. */
export function cancelNavigation(JE: CalendarHost): void {
 lifetime(JE).navigation++;
}
export function invalidate(JE: CalendarHost): void {
 const owner = lifetime(JE); owner.view++;
 const state = JE.internals.calendarPage?.state;
 if (state) {state.isLoading=false; state.requestedLoading=false;}
}
export function own(JE: CalendarHost, key: string, dispose: () => void): void {
 const owner = lifetime(JE); owner.disposers.get(key)?.(); owner.disposers.set(key,dispose);
}
export function disposeCalendar(JE: CalendarHost): void {
 invalidate(JE);
 const owner = lifetime(JE); for (const dispose of owner.disposers.values()) dispose(); owner.disposers.clear(); owner.initialized=false;
 const state = JE.internals.calendarPage?.state;
 if (state) {state._customTabContainer=null;state.pageVisible=false;state.locationUnsubscribe=null;}
}
/** Migrate only after a successful scoped write; never delete a preference on storage failure. */
export function preferenceKey(JE: CalendarHost, storage: Storage, base: string): string {
 const legacyUser = JE.session?.userScopedKey(base) ?? `${base}:anonymous`;
 const server = JE.session?.getServerId?.();
 const scoped = server ? `${legacyUser}:server:${encodeURIComponent(server)}` : legacyUser;
 for (const old of [...new Set([legacyUser,base])]) {
  if (old === scoped) continue;
  try {
   const value = storage.getItem(old);
   if (value === null) continue;
   if (storage.getItem(scoped) === null) storage.setItem(scoped,value);
   storage.removeItem(old);
  } catch { /* Keep the old document if storage is unavailable. */ }
 }
 return scoped;
}
