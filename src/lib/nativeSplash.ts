import { Capacitor } from '@capacitor/core';

/** Fixed native splash duration for every tenant and every launch. */
export const NATIVE_SPLASH_MS = 1500;

let hidden = false;
let hidePromise: Promise<void> | null = null;

/** Timestamp of the first script evaluation = closest we get to app start. */
const bootedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

function elapsedSinceBoot() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - bootedAt;
}

/**
 * Hides the native (Android) splash screen, but never before NATIVE_SPLASH_MS
 * has passed since app start — so the splash always lasts the same 1.5s for
 * every tenant, on cold start and on resume alike. Callers may invoke this as
 * soon as the web splash has painted; the wait is handled here.
 */
export function hideNativeSplash(): Promise<void> {
  if (hidePromise) return hidePromise;
  hidePromise = (async () => {
    if (hidden) return;
    hidden = true;
    if (!Capacitor.isNativePlatform()) return;
    const wait = Math.max(0, NATIVE_SPLASH_MS - elapsedSinceBoot());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide({ fadeOutDuration: 150 });
    } catch {
      /* plugin unavailable (web / remote mode) */
    }
  })();
  return hidePromise;
}

/**
 * Safety net so the app can never stay stuck behind the native splash, even if
 * the web splash never paints (slow route, error boundary, resume from
 * background). Default fires right after the fixed 1.5s window.
 */
export function scheduleNativeSplashFallback(ms = NATIVE_SPLASH_MS + 300) {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    void hideNativeSplash();
  }, ms);
}
