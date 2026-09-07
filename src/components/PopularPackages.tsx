import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Wifi, AlertCircle } from 'lucide-react';
import { Card } from './ui/card';
import { useNavigate } from "@/lib/router-compat";
import { formatPrice } from '@/lib/utils';
import { fetchIftinCatalog, mapPopularPackages, type PopularPackageDTO } from '@/lib/iftinCatalog';
import { cacheImages } from '@/lib/imageCache';
import CachedImage from '@/components/CachedImage';
import { useTenant } from '@/contexts/TenantContext';

const LEGACY_OFFLINE_KEY = 'offline_popular_packages_v2';

// One-time cleanup of the older pre-Iftin cache.
try {
  localStorage.removeItem('offline_featured_packages');
} catch { /* ignore */ }

function offlineKey(tenantKey: string) {
  return `offline_popular_packages_v3:${tenantKey}`;
}

function readOffline(key: string): PopularPackageDTO[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;

    // Migrate the previous unscoped cache once. New writes are always tenant
    // scoped so switching reseller/workspace can never leak another catalog.
    const legacyRaw = localStorage.getItem(LEGACY_OFFLINE_KEY);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    return Array.isArray(legacy) ? legacy : [];
  } catch {
    return [];
  }
}

function writeOffline(key: string, list: PopularPackageDTO[]) {
  if (list.length === 0) return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
    localStorage.removeItem(LEGACY_OFFLINE_KEY);
  } catch { /* quota */ }
}

const SectionShell = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <TrendingUp className="w-5 h-5 text-primary" />
      <h2 className="text-base font-bold text-foreground">Xirmooyinka ugu Caansan</h2>
    </div>
    {children}
  </div>
);

const PopularPackages = () => {
  const navigate = useNavigate();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended'
    ? tenantState.tenant
    : null;
  const tenantKey = tenant?.id || tenant?.slug || 'default';
  const storageKey = React.useMemo(() => offlineKey(tenantKey), [tenantKey]);
  const offline = React.useMemo(() => readOffline(storageKey), [storageKey]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['popularPackages', 'v3', tenantKey],
    queryFn: async (): Promise<PopularPackageDTO[]> => {
      // Use the shared catalog cache. The old implementation forced a fresh
      // API request every time this component mounted, which made API tenants
      // feel slow and caused the list to disappear/reappear during navigation.
      const catalog = await fetchIftinCatalog();
      const mapped = mapPopularPackages(catalog);
      if (mapped.length > 0) {
        writeOffline(storageKey, mapped);
        void cacheImages(mapped.map((p) => p.provider_logo));
        return mapped;
      }

      // Never replace a visible known-good list with a transient empty API
      // response. Keep the last snapshot until a real non-empty refresh lands.
      return offline;
    },
    initialData: offline.length > 0 ? offline : undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const packages = data && data.length > 0 ? data : offline;

  if (isLoading && packages.length === 0) {
    return (
      <SectionShell>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-32" />
                </div>
                <div className="h-5 w-12 bg-muted rounded" />
              </div>
            </Card>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (isError && packages.length === 0) {
    return (
      <SectionShell>
        <Card className="p-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Xirmooyinka lama soo dejin karin{(error as any)?.message ? ` — ${(error as any).message}` : ''}.
          </p>
        </Card>
      </SectionShell>
    );
  }

  if (packages.length === 0) {
    return (
      <SectionShell>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Weli xirmo caan ah lama dejin.</p>
        </Card>
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <div className="space-y-2">
        {packages.map((pkg, idx) => (
          <Card
            key={`${pkg.package_id}-${pkg.provider_id}-${idx}`}
            className="p-3 rounded-2xl bg-card hover:shadow-md transition-shadow cursor-pointer border touch-manipulation"
            onClick={() => navigate(`/packages/${pkg.provider_id}`, {
              state: { providerName: pkg.provider_name, selectedPackageId: pkg.package_id },
            })}
          >
            <div className="flex items-center justify-between gap-3 overflow-hidden">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
                  <CachedImage
                    src={pkg.provider_logo}
                    alt={pkg.provider_name}
                    bundledName={pkg.provider_name}
                    className="w-9 h-9 object-contain"
                    fallback={
                      <span className="flex h-full w-full items-center justify-center bg-primary text-sm font-black text-primary-foreground">
                        {(pkg.provider_name || '?').trim().charAt(0).toUpperCase()}
                      </span>
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wifi className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="font-semibold text-sm text-foreground truncate">
                      {pkg.data_amount || pkg.package_name}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {pkg.provider_name} - {pkg.package_name}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-primary text-base whitespace-nowrap">${formatPrice(pkg.selling_price)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </SectionShell>
  );
};

export default PopularPackages;
