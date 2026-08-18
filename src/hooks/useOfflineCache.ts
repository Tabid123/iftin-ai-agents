import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from '@/contexts/ConnectivityContext';

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

export const useOfflineCache = () => {
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();
  const hasLoadedRef = useRef(false);
  const hasCachedRef = useRef(false);

  // Force refresh - ignores TTL, used during splash screen
  const forceRefreshCache = async () => {
    if (!isReallyOnline) return;
    console.log('🔄 Force refreshing cache (splash screen)...');
    await cacheData();
  };

  const cacheData = async () => {
    try {
      // Cache providers
      const { data: providersRaw } = await (supabase as any).rpc('get_active_providers');
      const providers: any[] = Array.isArray(providersRaw) ? providersRaw : [];
      if (providers.length) {
        localStorage.setItem(CACHE_KEYS.providers, JSON.stringify(providers));
        queryClient.setQueryData(['providers'], providers);
      }

      // Cache categories per provider with deduplication
      let allCategories: any[] = [];
      for (const provider of providers) {
        const { data: categories } = await (supabase as any).rpc('get_active_categories', { p_provider_id: provider.id });
        if (Array.isArray(categories)) {
          allCategories = [...allCategories, ...categories];
        }
      }
      const uniqueCategories = Array.from(
        new Map(allCategories.map((cat: any) => [cat.id, cat])).values()
      );
      // Iftin-partner tenants have no local rows; an empty result must never
      // overwrite the catalog data already cached from Iftin.
      if (uniqueCategories.length) {
        localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(uniqueCategories));
        queryClient.setQueryData(['categories'], uniqueCategories);
      }

      // Cache payment providers
      const { data: paymentProviders } = await (supabase as any).rpc('get_active_payment_providers');
      if (Array.isArray(paymentProviders) && paymentProviders.length) {
        localStorage.setItem(CACHE_KEYS.paymentProviders, JSON.stringify(paymentProviders));
        queryClient.setQueryData(['paymentProviders'], paymentProviders);
      }


      // Cache packages for each provider
      if (providers.length) {
        const allPackages: any = {};
        for (const provider of providers) {
          const { data: packages } = await (supabase as any).rpc('get_public_packages', { 
            p_provider_id: provider.id 
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

      // Cache delivery instructions (via security-definer RPC for anon)
      const { data: deliveryInstructions } = await (supabase as any).rpc('get_tenant_delivery_instructions');
      if (Array.isArray(deliveryInstructions) && deliveryInstructions.length) {
        localStorage.setItem(CACHE_KEYS.deliveryInstructions, JSON.stringify(deliveryInstructions));
      }

      // Cache featured packages
      const { data: featuredPackages } = await (supabase as any).rpc('get_featured_packages');
      if (Array.isArray(featuredPackages) && featuredPackages.length) {
        localStorage.setItem('offline_featured_packages', JSON.stringify(featuredPackages));
        queryClient.setQueryData(['featuredPackages'], featuredPackages);
      }

      // Cache app settings (via security-definer RPC for anon)
      const { data: appSettings } = await (supabase as any).rpc('get_tenant_app_settings');
      if (appSettings) {
        const filtered = (appSettings as any[]).filter(s =>
          ['payment_number', 'payment_prefix'].includes(s.setting_key)
        );
        localStorage.setItem(CACHE_KEYS.appSettings, JSON.stringify(filtered));
      }

      // Update cache timestamp
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      // Silent error handling
    }
  };

  const loadCachedData = () => {
    try {
      const cachedProviders = localStorage.getItem(CACHE_KEYS.providers);
      if (cachedProviders) {
        queryClient.setQueryData(['providers'], JSON.parse(cachedProviders));
      }

      const cachedCategories = localStorage.getItem(CACHE_KEYS.categories);
      if (cachedCategories) {
        const categories = JSON.parse(cachedCategories);
        const uniqueCategories = Array.from(
          new Map(categories.map((cat: any) => [cat.id, cat])).values()
        );
        localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(uniqueCategories));
        queryClient.setQueryData(['categories'], uniqueCategories);
      }

      const cachedPaymentProviders = localStorage.getItem(CACHE_KEYS.paymentProviders);
      if (cachedPaymentProviders) {
        queryClient.setQueryData(['paymentProviders'], JSON.parse(cachedPaymentProviders));
      }

      const cachedPackages = localStorage.getItem(CACHE_KEYS.packages);
      if (cachedPackages) {
        const packagesData = JSON.parse(cachedPackages);
        Object.entries(packagesData).forEach(([providerId, packages]) => {
          queryClient.setQueryData(['packages', providerId], packages);
        });
      }

      const cachedFeaturedPackages = localStorage.getItem('offline_featured_packages');
      if (cachedFeaturedPackages) {
        queryClient.setQueryData(['featuredPackages'], JSON.parse(cachedFeaturedPackages));
      }
    } catch (error) {
      // Silent error handling
    }
  };

  const isCacheStale = (): boolean => {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return true;
    return Date.now() - parseInt(timestamp, 10) > CACHE_TTL_MS;
  };

  useEffect(() => {
    // Load cached data immediately on first mount only
    if (!hasLoadedRef.current) {
      loadCachedData();
      hasLoadedRef.current = true;
    }
  }, []);

  // Cache fresh data when online - but only if cache is stale (> 1 hour)
  useEffect(() => {
    if (isReallyOnline && !hasCachedRef.current) {
      if (isCacheStale()) {
        cacheData();
      }
      hasCachedRef.current = true;
    }
  }, [isReallyOnline]);

  // Realtime: invalidate cache when providers or packages change
  useEffect(() => {
    // Remove any existing channel with same name first (prevents duplicate subscribe error)
    const existingChannel = supabase.channel('offline-cache-invalidation');
    supabase.removeChannel(existingChannel);

    const channel = supabase.channel('offline-cache-invalidation');

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
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'data_packages_config' },
        async () => {
          const providersStr = localStorage.getItem(CACHE_KEYS.providers);
          if (!providersStr) return;
          const providers = JSON.parse(providersStr);
          const allPackages: any = {};
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
        }

      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    cacheData,
    loadCachedData,
    forceRefreshCache,
  };
};
