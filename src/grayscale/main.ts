// Grayscale client entry (the /grayscale Vite entry, loaded by grayscale.html).
// Loads the active locale, then mounts the app. Only `en` is resident
// synchronously; a stored non-en locale lazy-loads here before the first
// localized paint (mirrors src/main.ts and src/guide/main.ts).

import './styles.css';
import { ensureLocaleLoaded, getLanguage } from '../ui/i18n';
import { GrayscaleApp } from './app';

async function boot(): Promise<void> {
  const mount = document.getElementById('grayscale-app');
  if (!mount) return;
  try {
    await ensureLocaleLoaded(getLanguage());
  } catch {
    // A missing locale chunk falls back to English; render regardless.
  }
  new GrayscaleApp(mount).start();
}

void boot();
