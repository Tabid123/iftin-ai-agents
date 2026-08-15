import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from '@/integrations/supabase/client';
import { setTenantHeader } from '@/integrations/supabase/client';
import {
  isNativeApp,
  buildTenantSlug,
  storedTenantSlug,
  storeTenantSlug,
  registerDeepLinkTenantListener,
} from '@/lib/nativeTenant';


export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  status: "trial" | "active" | "suspended" | "cancelled";
  plan_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}


type TenantState =
  | { status: "loading"; tenant: null; isPlatform: false }
  | { status: "ready"; tenant: Tenant; isPlatform: false }
  | { status: "suspended"; tenant: Tenant; isPlatform: false }
  | { status: "not_found"; tenant: null; isPlatform: false; slug: string }
  | { status: "needs_code"; tenant: null; isPlatform: false }
  | { status: "platform"; tenant: null; isPlatform: true };

const TenantContext = createContext<TenantState>({
  status: "loading",
  tenant: null,
  isPlatform: false,
});

const RESERVED = new Set(["admin", "www", "api", "app", "mail", "status"]);

/**
 * Resolve the tenant slug from the current hostname.
 * - `admin.<domain>` → platform (super-admin) view
 * - `<slug>.<domain>` → tenant
 * - localhost / lovable.app preview → ?tenant=<slug> query, else "demo"
 */
function resolveSlug(): { slug: string | null; isPlatform: boolean; needsCode?: boolean } {
  const host = window.location.hostname;
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const overrideTenant = params.get("tenant");
  const overridePlatform = params.get("platform") === "1";

  // Path-based super-admin override — /admin/* always renders super-admin console
  if (path === "/admin" || path.startsWith("/admin/")) {
    return { slug: null, isPlatform: true };
  }

  if (overridePlatform) return { slug: null, isPlatform: true };



  // Path-based tenant: /t/<slug>/... → tenant. The prefix stays in the URL
  // (it is the router basepath), so we only remember the slug here.
  const prefixSlug = path.match(/^\/t\/([^/]+)(?=\/|$)/);
  if (prefixSlug) {
    const slug = prefixSlug[1];
    try { localStorage.setItem("najax.tenant_slug", slug); } catch { /* ignore storage restrictions */ }
    return { slug, isPlatform: false };
  }

  // Rescue accidentally nested links like /providers/t/somdata/providers.
  const tMatch = path.match(/\/t\/([^/]+)(\/.*)?$/);
  if (tMatch) {
    const slug = tMatch[1];
    const rest = `/t/${slug}${tMatch[2] || "/"}`;
    try { localStorage.setItem("najax.tenant_slug", slug); } catch { /* ignore storage restrictions */ }
    window.history.replaceState(null, "", rest + window.location.search + window.location.hash);
    return { slug, isPlatform: false };
  }



  // Query override (works on any host)
  if (overrideTenant) {
    try { localStorage.setItem("najax.tenant_slug", overrideTenant); } catch { /* ignore storage restrictions */ }
    return { slug: overrideTenant, isPlatform: false };
  }

  // Native app: hostname is always `localhost`, so never fall through to the
  // platform console. Use the build-time slug, then the stored one, otherwise
  // ask the user for their reseller code.
  if (isNativeApp()) {
    const slug = buildTenantSlug() || storedTenantSlug();
    if (slug) return { slug, isPlatform: false };
    return { slug: null, isPlatform: false, needsCode: true };
  }

  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com");

  if (isLocal) {
    // Sticky slug for preview/prod-on-lovable: remember last `?tenant=`
    let stored: string | null = null;
    try { stored = localStorage.getItem("najax.tenant_slug"); } catch { /* ignore storage restrictions */ }
    // No hardcoded default — if nothing stored, send the user to the platform console
    if (!stored) {
      return { slug: null, isPlatform: true };
    }
    return { slug: stored, isPlatform: false };
  }


  const parts = host.split(".");
  if (parts.length < 3) return { slug: null, isPlatform: false };
  const sub = parts[0];
  if (sub === "admin") return { slug: null, isPlatform: true };
  if (RESERVED.has(sub)) return { slug: null, isPlatform: false };
  return { slug: sub, isPlatform: false };
}


function hexToHslTriplet(hex: string): string | null {
  const m = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m) && !/^[0-9a-fA-F]{3}$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function toHslTriplet(value: string | null): string | null {
  if (!value) return null;
  const c = value.trim();
  if (!c) return null;
  if (c.startsWith("#")) return hexToHslTriplet(c);
  if (/^hsl\(/i.test(c)) return c.replace(/^hsl\(/i, "").replace(/\)$/, "").trim();
  return c;
}

function foregroundForHslTriplet(hsl: string | null): string | null {
  if (!hsl) return null;
  const parts = hsl.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) return null;
  const lightness = parts[2];
  return lightness > 58 ? "270 30% 10%" : "0 0% 100%";
}

function applyColor(varName: string, brandVar: string, value: string | null) {
  const root = document.documentElement;
  const hsl = toHslTriplet(value);
  if (!hsl) return;
  root.style.setProperty(varName, hsl);
  root.style.setProperty(brandVar, `hsl(${hsl})`);
}

function applyBranding(tenant: Tenant | null) {
  applyColor("--primary", "--brand-primary", tenant?.primary_color ?? null);
  applyColor("--accent", "--brand-accent", tenant?.accent_color ?? null);

  const root = document.documentElement;
  const primary = toHslTriplet(tenant?.primary_color ?? null);
  const accent = toHslTriplet(tenant?.accent_color ?? null);
  const primaryForeground = foregroundForHslTriplet(primary);
  const accentForeground = foregroundForHslTriplet(accent);

  if (primary) {
    root.style.setProperty("--ring", primary);
    root.style.setProperty("--sidebar-primary", primary);
    root.style.setProperty("--gradient-button", `linear-gradient(135deg, hsl(${primary}), hsl(${accent || primary}))`);
    root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${primary}), hsl(${accent || primary}))`);
    root.style.setProperty("--shadow-elegant", `0 10px 30px -10px hsl(${primary} / 0.3)`);
    root.style.setProperty("--shadow-glow", `0 0 40px hsl(${primary} / 0.2)`);
  }

  if (primaryForeground) {
    root.style.setProperty("--primary-foreground", primaryForeground);
    root.style.setProperty("--sidebar-primary-foreground", primaryForeground);
  }

  if (accentForeground) {
    root.style.setProperty("--accent-foreground", accentForeground);
  }
}


export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<TenantState>({
    status: "loading",
    tenant: null,
    isPlatform: false,
  });

  useEffect(() => {
    const { slug, isPlatform, needsCode } = resolveSlug();

    registerDeepLinkTenantListener(() => window.location.reload());

    if (needsCode) {
      setTenantHeader(null);
      setState({ status: "needs_code", tenant: null, isPlatform: false });
      return;
    }

    if (isPlatform) {
      // Super-admin console: don't scope queries to any tenant
      setTenantHeader(null);
      setState({ status: "platform", tenant: null, isPlatform: true });
      return;
    }

    if (!slug) {
      setTenantHeader(null);
      setState({
        status: "not_found",
        tenant: null,
        isPlatform: false,
        slug: "",
      });
      return;
    }

    (async () => {
      // Clear any stale header before resolving the new tenant so the lookup
      // itself isn't filtered by a wrong tenant.
      setTenantHeader(null);

      const { data: rpcData, error } = await supabase.rpc(
        "get_tenant_by_slug",
        { p_slug: slug }
      );
      const data = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      if (error || !data) {
        setState({
          status: "not_found",
          tenant: null,
          isPlatform: false,
          slug,
        });
        return;
      }

      const tenant = data as Tenant;
      // Activate tenant scoping for ALL subsequent supabase queries
      setTenantHeader(tenant.id);
      applyBranding(tenant);

      if (tenant.status === "suspended" || tenant.status === "cancelled") {
        setState({ status: "suspended", tenant, isPlatform: false });
        return;
      }

      setState({ status: "ready", tenant, isPlatform: false });
    })();
  }, []);


  return (
    <TenantContext.Provider value={state}>{children}</TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
