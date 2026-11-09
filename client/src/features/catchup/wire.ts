import type { SocialApi, SocialSession } from '../activity/public-api';
/**
 * Pure helpers catchup used to import at runtime from activity/host.ts (step C3-catchup). They are copied here
 * verbatim, because a runtime import of another feature's module is a boundary violation (frontend.md §2.2, §2.4
 * rule 1) and each entry is bundled as its own IIFE, so every catchup output already carried its own copy. They are
 * stateless: no module-level state, and each one reads only its arguments.
 */
export function currentLease(session: SocialSession | undefined, getApi?: () => SocialApi | undefined): () => boolean {
 const epoch = session?.getEpoch(), user = getApi?.()?.getCurrentUserId(), server = getApi?.()?.getUrl('/');
 return () => (epoch === undefined || session?.isCurrent(epoch) === true) && user === getApi?.()?.getCurrentUserId() && server === getApi?.()?.getUrl('/');
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
export function object(value: unknown): Record<string, unknown> {if (!record(value)) throw Error('Invalid response object'); return value;}
export function string(value: unknown): string {if (typeof value !== 'string') throw Error('Invalid response string'); return value;}
export function number(value: unknown): number {if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Invalid response number'); return value;}
export function optionalString(value: unknown): string | undefined {return value == null ? undefined : string(value);}
export function optionalNumber(value: unknown): number | undefined {return value == null ? undefined : number(value);}
export function optionalBoolean(value: unknown): boolean | undefined {if (value == null) return undefined; if (typeof value !== 'boolean') throw Error('Invalid response boolean'); return value;}
export function array<T>(value: unknown, decode: (value: unknown) => T): T[] {if (!Array.isArray(value)) throw Error('Invalid response array'); return value.map(decode);}
