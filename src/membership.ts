import { useAuth } from './auth';
import { actions, useStore } from './store';

/** Re-evaluate access when either the account or its subscription changes. */
export function usePremiumMembership(): boolean {
  useStore();
  useAuth();
  return actions.isPremium();
}
