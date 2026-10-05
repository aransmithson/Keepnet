import { useSyncExternalStore } from 'react';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; notify(); });
}
export function useInstallPrompt() {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => installPrompt, () => null);
}
export async function installApp() {
  const prompt = installPrompt;
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice;
  installPrompt = null;
  notify();
}
