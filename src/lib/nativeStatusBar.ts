import { Capacitor } from '@capacitor/core';

/** Resolve any CSS color (including hsl(var(--primary))) to a #rrggbb hex string. */
export function resolveCssColor(input: string): string | null {
  if (typeof document === 'undefined') return null;
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = input;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}

function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

export const BUILD_BAR_COLOR: string | null =
  (import.meta.env.VITE_SPLASH_COLOR as string | undefined)?.trim() || null;

let appliedHex: string | null = null;
let overlayInitialized = false;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Keep Android system bars stable. The WebView is placed below the status bar
 * exactly once at startup; route changes never alter native insets.
 */
export async function applyNativeStatusBarColor(color: string, force = false) {
  if (!Capacitor.isNativePlatform()) return;
  const source = BUILD_BAR_COLOR ?? color;
  const hex = source.startsWith('#') ? source : resolveCssColor(source);
  if (!hex) return;
  if (!force && hex === appliedHex) return;
  appliedHex = hex;
  queue = queue.then(() => applyNow(hex)).catch(() => {});
  return queue as Promise<void>;
}

async function applyNow(hex: string) {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    if (!overlayInitialized) {
      overlayInitialized = true;
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
    await StatusBar.setBackgroundColor({ color: hex });
    // Dark tenant header -> light icons. Light header -> dark icons.
    await StatusBar.setStyle({ style: isLight(hex) ? Style.Dark : Style.Light });
  } catch {
    /* status bar plugin unavailable */
  }
}

/** Apply color once and on resume without changing WebView geometry again. */
export function initNativeBars(fallbackColor = 'hsl(var(--primary))') {
  if (!Capacitor.isNativePlatform()) return () => {};
  void applyNativeStatusBarColor(fallbackColor);
  let remove: (() => void) | undefined;
  void import('@capacitor/app')
    .then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void applyNativeStatusBarColor(fallbackColor, true);
      }),
    )
    .then((handle) => {
      remove = () => handle.remove();
    })
    .catch(() => {});
  return () => remove?.();
}
