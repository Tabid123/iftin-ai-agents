import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from "@/lib/router-compat";
import { Phone, MessageCircle, ArrowLeft, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RotatingBanner from '@/components/RotatingBanner';
import CachedImage from '@/components/CachedImage';
import { localizeImage } from '@/lib/localImages';
import { Button } from '@/components/ui/button';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useTenant } from '@/contexts/TenantContext';
import { useSupportPhone } from '@/hooks/useSupportPhone';
import { fetchIftinCatalog, hasCatalog, mapCategories, readCachedCatalog } from '@/lib/iftinCatalog';
import { setCategoryIntent } from '@/lib/categoryIntent';

interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id?: string | null;
  category_image?: string | null;
  created_at?: string;
  updated_at?: string;
}

function readCachedProviders(): any[] {
  try {
    const raw = localStorage.getItem('offline_providers');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveProviderId(provider?: string): string | null {
  if (!provider) return null;
  if (provider.includes('-')) return provider;
  const target = provider.toLowerCase();
  const match = readCachedProviders().find((p: any) =>
    String(p?.id ?? '').toLowerCase() === target ||
    String(p?.provider_name ?? '').toLowerCase() === target
  );
  return match?.id ?? null;
}

function readCachedCategories(providerId: string | null): Category[] {
  if (!providerId) return [];
  try {
    const raw = localStorage.getItem('offline_categories');
    const all = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(all)) return [];
    return Array.from(
      new Map(
        all
          .filter((category: Category) => String(category.provider_id ?? '') === providerId)
          .map((category: Category) => [category.id, category]),
      ).values(),
    ) as Category[];
  } catch {
    return [];
  }
}

const CategorySelection = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isReallyOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const tenantState = useTenant();
  const support = useSupportPhone();
  const brandName = (tenantState as any).tenant?.name || 'App';
  const { provider } = useParams<{ provider: string }>();
  const providerName = location.state?.providerName || 'Provider';
  const isOffline = location.state?.isOffline || false;
  const senderPhone = location.state?.senderPhone || '';
  const receiverPhone = location.state?.receiverPhone || '';

  const cachedIftinCatalog = useMemo(() => readCachedCatalog(), []);
  const isIftinTenant = hasCatalog(cachedIftinCatalog);
  const immediateProviderId = useMemo(() => resolveProviderId(provider), [provider]);

  useEffect(() => {
    void showBannerAd();
    return () => { void hideBannerAd(); };
  }, []);

  // Iftin tenants are refreshed by the catalog cache. Subscribing to the local
  // reseller tables only invalidated already-good data and caused a second paint.
  useEffect(() => {
    if (isIftinTenant) return;
    const channel = supabase
      .channel(`categories-realtime:${provider ?? 'unknown'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_categories' }, () => {
        const id = resolveProviderId(provider) ?? provider;
        if (id) queryClient.invalidateQueries({ queryKey: ['categories', id] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isIftinTenant, provider, queryClient]);

  // Only standalone legacy routes that use a provider name need a DB lookup.
  // Normal tenant navigation passes the UUID and therefore never waits here.
  const { data: lookedUpProvider } = useQuery({
    queryKey: ['provider-lookup', provider],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('providers_config')
        .select('id')
        .ilike('provider_name', provider || '')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!provider && !immediateProviderId && !isIftinTenant && isReallyOnline !== false,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const providerId = immediateProviderId || lookedUpProvider?.id || null;
  const initialCategories = useMemo(() => readCachedCategories(providerId), [providerId]);

  const { data: categories = initialCategories } = useQuery<Category[]>({
    // This key matches the cache seeded in router.tsx and useOfflineCache.
    queryKey: ['categories', providerId ?? provider ?? 'unknown'],
    queryFn: async () => {
      const cached = readCachedCategories(providerId);
      if (!providerId || isReallyOnline === false) return cached;

      const catalog = await fetchIftinCatalog();
      if (hasCatalog(catalog)) {
        const list = mapCategories(catalog!, providerId) as Category[];
        return list.length ? list : cached;
      }

      try {
        const { data, error } = await (supabase as any).rpc('get_active_categories', {
          p_provider_id: providerId,
        });
        if (error) return cached;
        return Array.from(
          new Map(((data as Category[]) || []).map((category) => [category.id, category])).values(),
        ) as Category[];
      } catch {
        return cached;
      }
    },
    enabled: !!providerId,
    initialData: initialCategories.length ? initialCategories : undefined,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (!categories.length) return;
    const localized = categories.map((category) => ({
      ...category,
      category_image: localizeImage('category', category.category_image, category.category_name, providerName),
    }));
    try {
      const existing = JSON.parse(localStorage.getItem('offline_categories') || '[]');
      const merged = Array.from(
        new Map([...(Array.isArray(existing) ? existing : []), ...localized].map((c: any) => [c.id, c])).values(),
      );
      localStorage.setItem('offline_categories', JSON.stringify(merged));
    } catch {
      // Keep the in-memory list if storage is unavailable.
    }
  }, [categories, providerName]);

  const getBrandBorderClass = (name: string) => {
    switch ((name || '').toLowerCase()) {
      case 'hormuud': return 'border-hormuud';
      case 'somtel': return 'border-somtel';
      case 'somlink': return 'border-somlink';
      case 'somnet': return 'border-somnet';
      case 'amtel': return 'border-amtel';
      default: return 'border-primary';
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    const navProviderId = providerId || provider;
    if (!navProviderId) return;
    const category = categories.find(c => c.id === categoryId);
    const categoryName = category?.category_name || '';
    setCategoryIntent(categoryId, categoryName);
    navigate(`/packages/${navProviderId}`, {
      state: {
        providerName,
        selectedCategoryId: categoryId,
        categoryName,
        senderPhone,
        receiverPhone,
        isOffline,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 100%)',
          paddingTop: 'var(--effective-safe-area-top, 0px)',
          boxSizing: 'border-box' as const,
        }}
      >
        <div className="text-white p-4">
          <div className="flex justify-between items-center">
            <div className="flex min-w-0 items-center gap-2">
              <ArrowLeft
                className="w-6 h-6 shrink-0 cursor-pointer text-accent"
                onClick={() => navigate('/providers')}
                aria-label="Go back"
              />
              <h1 className="truncate text-lg font-bold text-accent">{brandName} - {providerName}</h1>
            </div>
            <div className="flex shrink-0 gap-3 ml-3">
              <Phone className="w-6 h-6 cursor-pointer" onClick={() => window.open(support.telHref, '_self')} />
              <MessageCircle className="w-6 h-6 cursor-pointer" onClick={() => window.open(support.whatsappHref, '_blank')} />
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex-1"
        style={{
          paddingTop: 'calc(5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="px-4 pt-1 pb-4">
          <RotatingBanner />
        </div>

        <div className="p-4 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Dooro Nooca Internet-ka</h2>
            <div className="grid grid-cols-3 gap-3">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryClick(category.id)}
                  className={`bg-card border ${getBrandBorderClass(providerName)} rounded-lg shadow-sm active:scale-[0.98] h-28 w-full flex flex-col items-center justify-center gap-1`}
                >
                  <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                    <CachedImage
                      src={category.category_image}
                      alt={category.category_name}
                      kind="category"
                      bundledName={category.category_name}
                      providerName={providerName}
                      className="w-12 h-12 object-contain"
                      loading="eager"
                      decoding="sync"
                    />
                  </div>
                  <span className="text-foreground text-center px-2 text-[10px] font-semibold line-clamp-2 leading-tight max-w-full">
                    {category.category_name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isOffline && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pb-2">
          <Button
            onClick={() => navigate('/offline-mode')}
            className="w-full bg-card hover:bg-card/90 text-primary border-2 border-primary shadow-lg font-semibold"
            size="lg"
          >
            <Edit className="w-5 h-5 mr-2" />
            Badal Lambarka
          </Button>
        </div>
      )}
    </div>
  );
};

export default CategorySelection;
