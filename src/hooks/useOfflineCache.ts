import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import {
  fetchIftinCatalog,
  hasCatalog,
  mapCategories,
  mapPackages,
  mapPaymentProviders,
  mapPopularPackages,
  mapProviders,
  readCachedCatalog,
  type IftinCatalog,
} from '@/lib/iftinCatalog';
import { cacheImages } from '@/lib/imageCache';

const CACHE_KEYS = {
  providers: 'offline_providers',
  categories: 'offline_categories',
  packages: 'offline_packages',
  paymentProviders: 'offline_payment_providers',
  deliveryInstructions: 'offline_delivery_instructions',
  appSettings: 'offline_app_settings',
};

const CACHE_TIMESTAMP_KEY = 'offline_cache_timestamp';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const POPULAR_QUERY_KEY = ['popularPackages', 'v2-iftin'] as const;
const POPULAR_OFFLINE_KEY = 'offline_popular_packages_v2';

function groupPackagesByProvider(packages: any[]) {
  const grouped: Record<string, any[]> = {};
  for (const pkg of packages) {
    const providerId = String(pkg?.provider_id ?? '');
    if (!providerId) continue;
    (grouped[providerId] ??= []).push(pkg);
  }
  return grouped;
}

export const useOfflineCache = () => {
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();
  const hasLoadedRef = useRef(false);
  const hasCachedRef = useRef(false);
  const sourceRef = useRef<'unknown' | 'iftin' | 'local'>('unknown');

  /**
   * One Iftin catalog response already contains the storefront graph. Seed all
   * route query keys from that single response so tapping a provider/category
   * never waits for another request before it can paint.
   */
  const hydrateIftinCatalog = (catalog: IftinCatalog) => {
    if (!hasCatalog(catalog)) return false;

    const providers = mapProviders(catalog);
    const categories = mapCategories(catalog);
    const packages = mapPackages(catalog);
    const paymentProviders = mapPaymentProviders(catalog);
    const popularPackages = mapPopularPackages(catalog);
    const packagesByProvider = groupPackagesByProvider(packages);

    sourceRef.current = 'iftin';

    // Global route caches.
    queryClient.setQueryData(['providers'], providers);
    queryClient.setQueryData(['paymentProviders'], paymentProviders);
    queryClient.setQueryData(POPULAR_QUERY_KEY, popularPackages);

    // Provider-scoped route caches. Seed both legacy/current category keys so
    // existing pages can paint synchronously while we keep compatibility.
    for (const provider of providers) {
      const providerCategories = categories.filter((c: any) => c.provider_id === provider.id);
      const providerPackages = packagesByProvider[provider.id] ?? [];
      queryClient.setQueryData(['categories', provider.id], providerCategories);
      queryClient.setQueryData(['categories', provider.id, provider.id], providerCategories);
      queryClient.setQueryData(['packages', provider.id], providerPackages);
      queryClient.setQueryData(['promotionalText', provider.id], provider.promotional_text || '');
    }

    try {
      localStorage.setItem(CACHE_KEYS.providers, JSON.stringify(providers));
      localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(categories));
      // DataPackages expects an object keyed by provider id. The old Iftin
      // cache wrote a flat array, which made the page look empty until a fresh
      // request completed.
      localStorage.setItem(CACHE_KEYS.packages, JSON.stringify(packagesByProvider));
      localStorage.setItem(CACHE_KEYS.paymentProviders, JSON.stringify(paymentProviders));
      localStorage.setItem(POPULAR_OFFLINE_KEY, JSON.stringify(popularPackages));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch {
      /* storage quota / private mode */
    }

    // Warm every storefront logo/category image while the user is still on the
    // first screen. CachedImage then paints immediately on later routes.
    cacheImages([
      ...providers.map((p: any) => p.provider_logo),
      ...categories.map((c: any) => c.category_image),
      ...paymentProviders.map((p: any) => p.provider_logo),
      ...popularPackages.map((p: any) => p.provider_logo),
    ]);

    return true;
  };

  // Force refresh - used only when a caller explicitly asks for a full cache refresh.
  const forceRefreshCache = async () => {
    if (!isReallyOnline) return;
    await cacheData(true);
  };

  const cacheData = async (forceIftin = false) => {
    try {
      // FIRST decide the tenant data source. An Iftin API tenant must never run
      // the local reseller catalog RPC fan-out in parallel.
      const catalog = await fetchIftinCatalog({ force: forceIftin });
      if (catalog && hydrateIftinCatalog(catalog)) return;

      sourceRef.current = 'local';

      // Standalone tenant only: cache providers from its own DB.
      const { data: providersRaw } = await (supabase as any).rpc('get_active_providers');
      const providers: any[] = Array.isArray(providersRaw) ? providersRaw : [];
      if (providers.length) {
        localStorage.setItem(CACHE_KEYS.providers, JSON.stringify(providers));
        queryClient.setQueryData(['providers'], providers);
      }

      // Cache categories per provider with deduplication.
      let allCategories: any[] = [];
      for (const provider of providers) {
        const { data: categories } = await (supabase as any).rpc('get_active_categories', { p_provider_id: provider.id });
        if (Array.isArray(categories)) {
          allCategories = [...allCategories, ...categories];
          queryClient.setQueryData(['categories', provider.id], categories);
          queryClient.setQueryData(['categories', provider.id, provider.id], categories);
        }
      }
      const uniqueCategories = Array.from(
        new Map(allCategories.map((cat: any) => [cat.id, cat])).values()
      );
      if (uniqueCategories.length) {
        localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(uniqueCategories));
        queryClient.setQueryData(['categories'], uniqueCategories);
      }

      // Cache payment providers.
      const { data: paymentProviders } = await (supabase as any).rpc('get_active_payment_providers');
      if (Array.isArray(paymentProviders) && paymentProviders.length) {
        localStorage.setItem(CACHE_KEYS.paymentProviders, JSON.stringify(paymentProviders));
        queryClient.setQueryData(['paymentProviders'], paymentProviders);
      }

      // Cache packages for each provider.
      if (providers.length) {
        const allPackages: Record<string, any[]> = {};
        for (const provider of providers) {
          const { data: packages } = await (supabase as any).rpc('get_public_packages', {
            p_provider_id: provider.id,
          });
          if (Array.isArray(packages) && packages.length) {
            allPackages[provider.id] = packages;
            queryClient.setQueryData(['packages', provider.id], packages);
          }
        }
        if (Object.keys(allPackages).length) {
          localStorage.setItem(CACHE_KEYS.packages, JSON.stringify(allPackages));
        }
      }

      // Cache delivery instructions (via security-definer RPC for anon).
      const { data: deliveryInstructions } = await (supabase as any).rpc('get_tenant_delivery_instructions');
      if (Array.isArray(deliveryInstructions) && deliveryInstructions.length) {
        localStorage.setItem(CACHE_KEYS.deliveryInstructions, JSON.stringify(deliveryInstructions));
      }

      // Cache featured packages.
      const { data: featuredPackages } = await (supabase as any).rpc('get_featured_packages');
      if (Array.isArray(featuredPackages) && featuredPackages.length) {
        localStorage.setItem('offline_featured_packages', JSON.stringify(featuredPackages));
        queryClient.setQueryData(['featuredPackages'], featuredPackages);
      }

      // Cache app settings (via security-definer RPC for anon).
      const { data: appSettings } = await (supabase as any).rpc('get_tenant_app_settings');
      if (appSettings) {
        const filtered = (appSettings as any[]).filter(s =>
          ['payment_number', 'payment_prefix'].includes(s.setting_key)
        );
        localStorage.setItem(CACHE_KEYS.appSettings, JSON.stringify(filtered));
      }

      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch {
      // Keep the last known cache visible.
    }
  };

  const loadCachedData = () => {
    try {
      // Prefer the complete Iftin catalog cache when available. This hydrates
      // every route before any component query has a chance to show an empty
      // loading state.
      const catalog = readCachedCatalog();
      if (catalog && hydrateIftinCatalog(catalog)) return;

      const cachedProviders = localStorage.getItem(CACHE_KEYS.providers);
      const providers = cachedProviders ? JSON.parse(cachedProviders) : [];
      if (Array.isArray(providers) && providers.length) {
        queryClient.setQueryData(['providers'], providers);
      }

      const cachedCategories = localStorage.getItem(CACHE_KEYS.categories);
      if (cachedCategories) {
        const categories = JSON.parse(cachedCategories);
        const uniqueCategories = Array.from(
          new Map((Array.isArray(categories) ? categories : []).map((cat: any) => [cat.id, cat])).values()
        ) as any[];
        localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(uniqueCategories));
        queryClient.setQueryData(['categories'], uniqueCategories);
        for (const provider of providers) {
          const list = uniqueCategories.filter((cat: any) => cat.provider_id === provider.id);
          queryClient.setQueryData(['categories', provider.id], list);
          queryClient.setQueryData(['categories', provider.id, provider.id], list);
        }
      }

      const cachedPaymentProviders = localStorage.getItem(CACHE_KEYS.paymentProviders);
      if (cachedPaymentProviders) {
        queryClient.setQueryData(['paymentProviders'], JSON.parse(cachedPaymentProviders));
      }

      const cachedPackages = localStorage.getItem(CACHE_KEYS.packages);
      if (cachedPackages) {
        const raw = JSON.parse(cachedPackages);
        // Migrate the old Iftin flat-array cache in place.
        const packagesData = Array.isArray(raw) ? groupPackagesByProvider(raw) : raw;
        if (Array.isArray(raw)) {
          localStorage.setItem(CACHE_KEYS.packages, JSON.stringify(packagesData));
        }
        Object.entries(packagesData || {}).forEach(([providerId, packages]) => {
          queryClient.setQueryData(['packages', providerId], packages);
        });
      }

      const cachedPopular = localStorage.getItem(POPULAR_OFFLINE_KEY);
      if (cachedPopular) {
        queryClient.setQueryData(POPULAR_QUERY_KEY, JSON.parse(cachedPopular));
      }

      const cachedFeaturedPackages = localStorage.getItem('offline_featured_packages');
      if (cachedFeaturedPackages) {
        queryClient.setQueryData(['featuredPackages'], JSON.parse(cachedFeaturedPackages));
      }
    } catch {
      // Ignore malformed legacy cache and let the network refresh repair it.
    }
  };

  const isCacheStale = (): boolean => {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return true;
    return Date.now() - parseInt(timestamp, 10) > CACHE_TTL_MS;
  };

  useEffect(() => {
    if (!hasLoadedRef.current) {
      loadCachedData();
      hasLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (isReallyOnline && !hasCachedRef.current) {
      // Always resolve the source once per app session. fetchIftinCatalog itself
      // is memoized, so a fresh cached Iftin tenant does not hit the network.
      if (sourceRef.current === 'unknown' || isCacheStale()) {
        void cacheData();
      }
      hasCachedRef.current = true;
    }
  }, [isReallyOnline]);

  // Local realtime subscriptions are useful for standalone tenants, but they
  // are pure overhead for Iftin API tenants. Resolve the source first.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeLocalRealtime = async () => {
      const catalog = await fetchIftinCatalog();
      if (cancelled || (catalog && hasCatalog(catalog))) return;
      sourceRef.current = 'local';

      channel = supabase.channel('offline-cache-invalidation');
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'providers_config' },
          async () => {
            const { data } = await (supabase as any).rpc('get_active_providers');
            if (data) {
              localStorage.setItem(CACHE_KEYS.providers, JSON.stringify(data));
              queryClient.setQueryData(['providers'], data);
              localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
            }
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'data_packages_config' },
          async () => {
            const providersStr = localStorage.getItem(CACHE_KEYS.providers);
            if (!providersStr) return;
            const providers = JSON.parse(providersStr);
            const allPackages: Record<string, any[]> = {};
            for (const provider of providers) {
              const { data } = await (supabase as any).rpc('get_public_packages', { p_provider_id: provider.id });
              if (Array.isArray(data) && data.length) {
                allPackages[provider.id] = data;
                queryClient.setQueryData(['packages', provider.id], data);
              }
            }
            if (Object.keys(allPackages).length) {
              localStorage.setItem(CACHE_KEYS.packages, JSON.stringify(allPackages));
            }
            const { data: featured } = await (supabase as any).rpc('get_featured_packages');
            if (Array.isArray(featured) && featured.length) {
              localStorage.setItem('offline_featured_packages', JSON.stringify(featured));
              queryClient.setQueryData(['featuredPackages'], featured);
            }
            localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          },
        )
        .subscribe();
    };

    void subscribeLocalRealtime();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return {
    cacheData,
    loadCachedData,
    forceRefreshCache,
  };
};
