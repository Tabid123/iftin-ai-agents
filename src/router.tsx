import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./mobile-stability.css";

function readJson(key: string): any {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Hydrate the route query cache synchronously BEFORE the first page renders.
 *
 * Previously useOfflineCache filled React Query from an effect, which is too
 * late: the destination page rendered once without data and started a request,
 * then rendered a second time when cached/API data arrived. On Android that
 * looked like a flash/refresh on every tap.
 */
function hydrateStorefrontCache(queryClient: QueryClient) {
  if (typeof window === "undefined") return;

  const providers = readJson("offline_providers");
  if (Array.isArray(providers) && providers.length) {
    queryClient.setQueryData(["providers"], providers);
  }

  const categories = readJson("offline_categories");
  if (Array.isArray(categories) && categories.length) {
    queryClient.setQueryData(["categories"], categories);

    for (const provider of Array.isArray(providers) ? providers : []) {
      const providerId = String(provider?.id ?? "");
      if (!providerId) continue;
      const scoped = categories.filter((category: any) => String(category?.provider_id ?? "") === providerId);
      queryClient.setQueryData(["categories", providerId], scoped);
      queryClient.setQueryData(["categories", providerId, providerId], scoped);
    }
  }

  const rawPackages = readJson("offline_packages");
  if (rawPackages) {
    const grouped: Record<string, any[]> = Array.isArray(rawPackages) ? {} : rawPackages;
    if (Array.isArray(rawPackages)) {
      for (const pkg of rawPackages) {
        const providerId = String(pkg?.provider_id ?? "");
        if (!providerId) continue;
        (grouped[providerId] ??= []).push(pkg);
      }
      try { localStorage.setItem("offline_packages", JSON.stringify(grouped)); } catch {}
    }

    for (const [providerId, packages] of Object.entries(grouped || {})) {
      if (Array.isArray(packages)) queryClient.setQueryData(["packages", providerId], packages);
    }
  }

  const paymentProviders = readJson("offline_payment_providers");
  if (Array.isArray(paymentProviders)) {
    queryClient.setQueryData(["paymentProviders"], paymentProviders);
  }

  const popularPackages = readJson("offline_popular_packages_v2");
  if (Array.isArray(popularPackages)) {
    queryClient.setQueryData(["popularPackages", "v2-iftin"], popularPackages);
  }

  const featuredPackages = readJson("offline_featured_packages");
  if (Array.isArray(featuredPackages)) {
    queryClient.setQueryData(["featuredPackages"], featuredPackages);
  }
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  hydrateStorefrontCache(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 5 * 60 * 1000,
  });

  return router;
};
