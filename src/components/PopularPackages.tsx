import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Wifi, AlertCircle } from 'lucide-react';
import { Card } from './ui/card';
import { useNavigate } from "@/lib/router-compat";
import { formatPrice } from '@/lib/utils';
import { fetchIftinCatalog, mapPopularPackages, type PopularPackageDTO } from '@/lib/iftinCatalog';
import { cacheImages } from '@/lib/imageCache';
import CachedImage from '@/components/CachedImage';

/** Bumped key: the old `popularPackages` cache held pre-Iftin data. */
const QUERY_KEY = ['popularPackages', 'v2-iftin'] as const;
const OFFLINE_KEY = 'offline_popular_packages_v2';

// One-time cleanup of the legacy cache so stale rows never render again.
try {
  localStorage.removeItem('offline_featured_packages');
} catch { /* ignore */ }

function readOffline(): PopularPackageDTO[] {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOffline(list: PopularPackageDTO[]) {
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(list));
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
  const [offline] = React.useState<PopularPackageDTO[]>(() => readOffline());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<PopularPackageDTO[]> => {
      const catalog = await fetchIftinCatalog({ force: true });
      const mapped = mapPopularPackages(catalog);
      if (mapped.length > 0) {
        writeOffline(mapped);
        cacheImages(mapped.map((p) => p.provider_logo));
      }
      return mapped;
    },
    // Show the last known list instantly, then refresh in the background.
    initialData: offline.length > 0 ? offline : undefined,
    refetchOnMount: 'always',
    staleTime: 0,
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
            className="p-3 rounded-2xl bg-card hover:shadow-md transition-shadow cursor-pointer border"
            onClick={() => navigate(`/packages/${pkg.provider_id}`, {
              state: { providerName: pkg.provider_name, selectedPackageId: pkg.package_id },
            })}
          >
            <div className="flex items-center justify-between gap-3 overflow-hidden">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {pkg.provider_logo && (
                  <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
                    <CachedImage src={pkg.provider_logo} alt={pkg.provider_name} className="w-9 h-9 object-contain" />
                  </div>
                )}
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
