/**
 * Tenant resolution for the native (Capacitor) app.
 *
 * On the web the tenant comes from the hostname / `/t/<slug>` path. Inside the
 * native shell the hostname is `localhost`, so the tenant must come from:
 *   1. a build-time slug baked into the APK (`VITE_TENANT_SLUG`), or
 *   2. a slug the user entered once (reseller code), stored on device, or
 *   3. a deep link such as `iftin://t/<slug>` / `https://iftinagents.com/t/<slug>`.
 */

export const TENANT_STORAGE_KEY = "najax.tenant_slug";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Slug baked into this build (per-tenant APKs produced by CI). */
export function buildTenantSlug(): string | null {
  const slug = (import.meta.env.VITE_TENANT_SLUG as string | undefined)?.trim();
  return slug ? slug.toLowerCase() : null;
}

export function storedTenantSlug(): string | null {
  try {
    return localStorage.getItem(TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeTenantSlug(slug: string) {
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, slug.trim().toLowerCase());
  } catch {
    /* ignore storage restrictions */
  }
}

export function clearTenantSlug() {
  try {
    localStorage.removeItem(TENANT_STORAGE_KEY);
  } catch {
    /* ignore storage restrictions */
  }
}

/** Extract `<slug>` from `iftin://t/<slug>` or `https://host/t/<slug>`. */
export function slugFromDeepLink(url: string): string | null {
  const m = url.match(/(?:\/t\/|:\/\/t\/)([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Listen for deep links while the native app is running. */
export async function registerDeepLinkTenantListener(onSlug: (slug: string) => void) {
  if (!isNativeApp()) return;
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", ({ url }) => {
      const slug = slugFromDeepLink(url);
      if (slug) {
        storeTenantSlug(slug);
        onSlug(slug);
      }
    });
  } catch {
    /* plugin not available */
  }
}
