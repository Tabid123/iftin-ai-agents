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

/** Color chosen in the GitHub "Run workflow" form (splash / status bar color). */
export const BUILD_BAR_COLOR: string | null =
  (import.meta.env.VITE_SPLASH_COLOR as string | undefined)?.trim() || null;

let appliedHex: string | null = null;
let overlaySet = false;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Applies the given color to the native Android status and navigation bars.
 * Calls are serialised and de-duplicated: re-applying the same color makes the
 * native bars re-layout, which the user sees as the navigation bar "jumping"
 * on every tap/page change.
 */
export async function applyNativeStatusBarColor(color: string, force = false) {
  if (!Capacitor.isNativePlatform()) return;
  // The build-time color always wins on native so every tenant app matches
  // the color entered in the workflow.
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
    if (!overlaySet) {
      overlaySet = true;
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
    await StatusBar.setBackgroundColor({ color: hex });
    await StatusBar.setStyle({ style: isLight(hex) ? Style.Light : Style.Dark });
  } catch {
    /* plugin unavailable */
  }
  try {
    const { EdgeToEdge } = await import('@capawesome/capacitor-android-edge-to-edge-support');
    await EdgeToEdge.setBackgroundColor({ color: hex });
  } catch {
    /* plugin unavailable */
  }
}


/**
 * Locks the native bars to the build-time (workflow) color as early as
 * possible and re-applies it when the app returns from the background, where
 * Android can reset the navigation bar color. Safe to call multiple times.
 */
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
