// Journal and offline work belong to one identity, including a separate guest journal.
function initialScope(): string {
  try { return JSON.parse(localStorage.getItem('keepnet:current_user') || '{}').user?.id || 'guest'; }
  catch { return 'guest'; }
}
let scope = initialScope();
const listeners = new Set<() => void>();
export const getAccountScope = () => scope;
export function setAccountScope(userId?: string | null) {
  const next = userId || 'guest';
  if (next === scope) return;
  scope = next;
  listeners.forEach(listener => listener());
}
export function onAccountScopeChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const scopedStorageKey = (base: string, identity = scope) => `${base}:${encodeURIComponent(identity)}`;
