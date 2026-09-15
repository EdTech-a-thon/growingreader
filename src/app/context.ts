import { getContext, setContext } from 'svelte';
import type { App } from './store.svelte';

const KEY = Symbol('app');

export function provideApp(app: App) {
  setContext(KEY, app);
}

export function useApp(): App {
  return getContext<App>(KEY);
}
