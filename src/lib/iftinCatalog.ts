/**
 * Iftin Internet catalog (client side).
 *
 * We are ONLY a client of the Iftin API. Providers, categories, packages,
 * prices, payment numbers and USSD prefixes all come from
 * `GET /partner-catalog` (proxied by our `iftin-catalog` edge function so the
 * ift_live_… key never reaches the browser).
 */
import { supabase } from '@/integrations/supabase/client';
import { getTenantId, setTenantHeader } from '@/integrations/supabase/client';
import { ensureResellerOverrides, loadResellerOverrides, paymentNumberFor, sellPriceFor } from '@/lib/resellerOverrides';
import { cacheImages } from '@/lib/imageCache';

export type IftinCatalog = {
  partner?: string;
  balance_due?: number;
  credit_limit?: number;
  counts?: { providers?: number; packages?: number; payment_providers?: number };
  providers?: any[];
  payment_providers?: any[];
  generated_at?: string;
  stale?: boolean;
  error?: string | null;
};

const CACHE_KEY = 'iftin_catalog';
const TTL_MS = 5 * 60 * 1000;

let inflight: Promise<IftinCatalog | null> | null = null;
let memo: { at: number; tenantId: string | null; catalog: IftinCatalog } | null = null;
/** Tenant resolution is a network round trip — resolve it once per session. */
let tenantPromise: Promise<string | null> | null = null;

function readCachedEntry(): { at: number; catalog: IftinCatalog } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.catalog) return null;
    return { at: Number(parsed.at ?? 0), catalog: parsed.catalog };
  } catch {
    return null;
  }
}


export function readCachedCatalog(): IftinCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.catalog ?? null;
  } catch {
    return null;
  }
}

export const IFTIN_ERROR_MESSAGES: Record<string, string> = {
  missing_api_key: 'API key-ga waa qaldan yahay (lama dejin)',
  invalid_api_key: 'API key-ga waa qaldan yahay',
  partner_suspended: 'Partner-ka waa la joojiyay (suspended)',
  network_error: 'Xiriirka Iftin ma shaqeynayo — xogtii hore ayaa la tusayaa',
};

export function iftinErrorMessage(code?: string | null): string | null {
  if (!code) return null;
  return IFTIN_ERROR_MESSAGES[code] ?? `Iftin API khalad: ${code}`;
}

/**
 * On the reseller dashboard there is no `/t/:slug` prefix, so the tenant header
 * is not set yet. Fall back to the tenant of the signed-in member.
 */
const TENANT_CACHE_KEY = 'iftin_tenant_id_v1';

export async function resolveTenantId(): Promise<string | null> {
  const fromHeader = getTenantId();
  if (fromHeader) return fromHeader;
  // Cached id makes registration instant instead of waiting on auth + a query.
  try {
    const cached = localStorage.getItem(TENANT_CACHE_KEY);
    if (cached) {
      setTenantHeader(cached);
      return cached;
    }
  } catch { /* ignore */ }
  if (tenantPromise) return tenantPromise;
  tenantPromise = (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return null;
      const { data } = await supabase
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', auth.user.id)
        .limit(1)
        .maybeSingle();
      const memberTenantId = (data as any)?.tenant_id ?? null;
      if (memberTenantId) {
        setTenantHeader(memberTenantId);
        try { localStorage.setItem(TENANT_CACHE_KEY, memberTenantId); } catch { /* ignore */ }
      }
      return memberTenantId;
    } catch {
      return null;
    }
  })();
  const resolved = await tenantPromise;
  if (!resolved) tenantPromise = null; // allow a retry after sign-in
  return resolved;
}

/** Fetches the catalog (5 min cache). Returns null when Iftin is not configured. */
export async function fetchIftinCatalog(opts: { force?: boolean } = {}): Promise<IftinCatalog | null> {
  // Warm the in-memory cache from localStorage on the first call after a reload
  // so navigation (provider → categories → packages) is instant.
  if (!memo && !opts.force) {
    const entry = readCachedEntry();
    if (entry && Date.now() - entry.at < TTL_MS) {
      const headerTenant = getTenantId();
      memo = { at: entry.at, tenantId: headerTenant, catalog: entry.catalog };
      if (headerTenant) {
        await ensureResellerOverrides();
        return entry.catalog;
      }
    }
  }

  if (!opts.force && inflight) return inflight;

  const tenantId = await resolveTenantId();

  // Never call the tenant-scoped proxy without a tenant. This can happen when
  // a platform super-admin (who is intentionally not a tenant member) opens a
  // reseller-only dashboard route.
  if (!tenantId) return null;

  if (!opts.force && memo && memo.tenantId === tenantId && Date.now() - memo.at < TTL_MS) {
    // Overrides must be loaded before the caller maps prices, otherwise the
    // storefront falls back to Iftin's own selling price.
    await ensureResellerOverrides();
    return memo.catalog;
  }
  if (!opts.force && inflight) return inflight;


  inflight = (async () => {
    try {
      const qs = new URLSearchParams();
      if (tenantId) qs.set('tenant_id', tenantId);
      if (opts.force) qs.set('refresh', '1');
      // Plain fetch (not functions.invoke): a 401 "missing_api_key" is an
      // expected state for tenants that are not Iftin partners, so it must not
      // surface as a thrown FunctionsHttpError / runtime error.
      const url =
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iftin-catalog` +
        (qs.toString() ? `?${qs.toString()}` : '');
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'GET',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      const body: any = await res.json().catch(() => null);

      if (!body) {
        const cached = readCachedCatalog();
        if (cached) return { ...cached, stale: true, error: 'network_error' };
        return null;
      }
      if (body?.error && !body?.providers) {
        const cached = readCachedCatalog();
        if (cached) return { ...cached, stale: true, error: body.error };
        // Not an Iftin partner → no catalog; the storefront falls back to local data.
        if (body.error === 'missing_api_key') return null;
        return { error: body.error, providers: [], payment_providers: [] };
      }


      const catalog: IftinCatalog = {
        ...body,
        stale: Boolean(body?.stale),
        error: body?.error ?? null,
      };
      memo = { at: Date.now(), tenantId, catalog };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), catalog }));
      } catch { /* quota */ }
      // Reseller-local overrides (sell_price / payment_number) before mapping.
      await loadResellerOverrides().catch(() => []);
      cacheLegacyShapes(catalog);
      return catalog;
    } catch {
      const cached = readCachedCatalog();
      return cached ? { ...cached, stale: true, error: 'network_error' } : null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function hasCatalog(catalog: IftinCatalog | null | undefined): boolean {
  return Boolean(catalog && Array.isArray(catalog.providers) && catalog.providers.length > 0);
}

/** `category_id: null` bucket renders as "Guud". */
export function catalogCategoryId(providerId: string, categoryId: string | null | undefined): string {
  return categoryId ?? `guud-${providerId}`;
}

/* ---------- mapping to the shapes the storefront components expect ---------- */

export function mapProviders(catalog: IftinCatalog) {
  return [...(catalog.providers ?? [])]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((p) => ({
      id: p.provider_id,
      provider_name: p.provider_name,
      provider_logo: p.provider_logo ?? null,
      promotional_text: p.promotional_text ?? null,
      display_order: p.display_order ?? 0,
      is_active: true,
    }));
}

export function mapCategories(catalog: IftinCatalog, providerId?: string | null) {
  const out: any[] = [];
  for (const p of catalog.providers ?? []) {
    if (providerId && p.provider_id !== providerId) continue;
    const cats = [...(p.categories ?? [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    );
    for (const c of cats) {
      out.push({
        id: catalogCategoryId(p.provider_id, c.category_id),
        category_name: c.category_id ? c.category_name : (c.category_name || 'Guud'),
        category_image: c.category_image ?? null,
        display_order: c.display_order ?? 0,
        provider_id: p.provider_id,
        is_active: true,
      });
    }
  }
  return out;
}

export function mapPackages(catalog: IftinCatalog, providerId?: string | null) {
  const out: any[] = [];
  for (const p of catalog.providers ?? []) {
    if (providerId && p.provider_id !== providerId) continue;
    for (const c of p.categories ?? []) {
      for (const pkg of c.packages ?? []) {
        const basePrice = Number(pkg.base_price ?? pkg.price ?? 0);
        // cost_price waa QIIMAHA IFTIN oo keliya. Haddii Iftin aanu soo dirin,
        // waxaan ka dhignaa null (ma nuqulaysanno base price) si UI-da u tuso
        // "ma jiro" halkii ay tusi lahayd qiime khaldan.
        const rawCost = (pkg as any).cost_price ?? (pkg as any).costPrice ?? null;
        const costPrice = rawCost === null || rawCost === '' ? null : Number(rawCost);

        out.push({
          id: pkg.package_id,
          package_name: pkg.name,
          data_amount: pkg.data ?? '',
          validity_days: String(pkg.validity ?? ''),
          // Iftin charges base_price; the reseller may sell higher (local override).
          selling_price: sellPriceFor(pkg.package_id, basePrice),
          base_price: basePrice,
          cost_price: costPrice,
          connection_type_label: pkg.type ?? '',
          category_id: catalogCategoryId(p.provider_id, c.category_id),
          provider_id: p.provider_id,
          ussd_code: pkg.package_code ?? null,
          package_code: pkg.package_code ?? null,
          is_active: true,
        });
      }
    }
  }
  return out.sort((a, b) => a.selling_price - b.selling_price);
}

export function mapPaymentProviders(catalog: IftinCatalog) {
  return (catalog.payment_providers ?? []).map((pp) => ({
    id: pp.id,
    provider_name: pp.name,
    provider_logo: pp.logo ?? null,
    payment_number: paymentNumberFor(pp.id, pp.payment_number ?? null),
    base_payment_number: pp.payment_number ?? null,
    prefix_code: pp.prefix_code ?? pp.ussd_prefix ?? null,
    ussd_prefix: pp.ussd_prefix ?? null,
    ussd_code_template: pp.ussd_template ?? null,
    commission_rate: Number(pp.commission_rate ?? 0),
    is_active: true,
  }));
}

/**
 * Builds the USSD string strictly from what Iftin returned for that payment
 * provider. Nothing (no `*712*`, no number) is hardcoded here.
 */
export function buildPaymentUssd(
  paymentProvider: { ussd_code_template?: string | null; ussd_prefix?: string | null; prefix_code?: string | null; payment_number?: string | null },
  amount: number | string,
): string | null {
  const number = paymentProvider.payment_number ?? '';
  const tpl = paymentProvider.ussd_code_template;
  if (tpl) {
    return tpl
      .replace(/\{\{?\s*(number|payment_number|phone)\s*\}?\}/gi, number)
      .replace(/\{\{?\s*amount\s*\}?\}/gi, String(amount));
  }
  const prefix = paymentProvider.ussd_prefix ?? paymentProvider.prefix_code;
  if (!prefix || !number) return null;
  const base = prefix.endsWith('*') ? prefix : `${prefix}*`;
  return `${base}${number}*${amount}#`;
}

/** Keeps the existing offline caches filled from Iftin's catalog. */
function cacheLegacyShapes(catalog: IftinCatalog) {
  if (!hasCatalog(catalog)) return;
  try {
    const providers = mapProviders(catalog);
    const paymentProviders = mapPaymentProviders(catalog);
    localStorage.setItem('offline_providers', JSON.stringify(providers));
    localStorage.setItem('offline_categories', JSON.stringify(mapCategories(catalog)));
    localStorage.setItem('offline_packages', JSON.stringify(mapPackages(catalog)));
    localStorage.setItem('offline_payment_providers', JSON.stringify(paymentProviders));
    // Persist logos as data URLs right away so they show instantly & offline.
    cacheImages([
      ...providers.map((p: any) => p.provider_logo),
      ...paymentProviders.map((p: any) => p.provider_logo),
    ]);
  } catch { /* quota */ }
}

/** Credit state from the catalog — Iftin owns these numbers. */
export function catalogLimits(catalog: IftinCatalog | null | undefined) {
  const balance = Number(catalog?.balance_due ?? 0);
  const limit = Number(catalog?.credit_limit ?? 0);
  const blocked = limit > 0 && balance >= limit;
  return { balance, limit, blocked };
}

/** UI guard: is ordering blocked because the Iftin credit limit is reached? */
export function isOrderingBlocked(): boolean {
  const catalog = memo?.catalog ?? readCachedCatalog();
  return catalogLimits(catalog).blocked;
}

/* ---------- popular packages ---------- */

export type PopularPackageDTO = {
  package_id: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  provider_id: string;
  provider_name: string;
  provider_logo: string | null;
  connection_type_label: string;
};

/**
 * Iftin may return popular packages either globally (`popular_packages` /
 * `popularPackages`) or per provider (`provider.popular_packages`).
 * Field names also vary (name/price/data/id), so every shape is normalised here.
 */
export function mapPopularPackages(catalog: IftinCatalog | null | undefined): PopularPackageDTO[] {
  if (!catalog) return [];
  const anyCatalog = catalog as any;
  const providers: any[] = catalog.providers ?? [];

  const providerById = new Map<string, any>();
  for (const p of providers) providerById.set(String(p.provider_id ?? p.id), p);

  let raw: any[] = anyCatalog.popular_packages ?? anyCatalog.popularPackages ?? [];
  if (!Array.isArray(raw) || raw.length === 0) {
    raw = [];
    for (const p of providers) {
      const list = p.popular_packages ?? p.popularPackages ?? [];
      for (const pkg of list) raw.push({ ...pkg, provider_id: pkg.provider_id ?? p.provider_id ?? p.id });
    }
  }

  return raw
    .map((pkg: any) => {
      const providerId = String(pkg.provider_id ?? pkg.providerId ?? '');
      const provider = providerById.get(providerId);
      const packageId = String(pkg.package_id ?? pkg.id ?? '');
      const basePrice = Number(pkg.selling_price ?? pkg.price ?? pkg.base_price ?? 0);
      return {
        package_id: packageId,
        package_name: String(pkg.package_name ?? pkg.name ?? ''),
        data_amount: String(pkg.data_amount ?? pkg.data ?? ''),
        selling_price: sellPriceFor(packageId, basePrice),
        provider_id: providerId,
        provider_name: String(pkg.provider_name ?? provider?.provider_name ?? ''),
        provider_logo: pkg.provider_logo ?? provider?.provider_logo ?? null,
        connection_type_label: String(pkg.connection_type_label ?? pkg.type ?? ''),
      };
    })
    .filter((p) => p.package_id && (p.data_amount || p.package_name));
}
