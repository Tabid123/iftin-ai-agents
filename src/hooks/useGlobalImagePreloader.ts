import { useEffect } from 'react';
import { cacheImages } from '@/lib/imageCache';
import { bundledStaticImages, getLocalImage } from '@/lib/localImages';

export const useGlobalImagePreloader = () => {
  useEffect(() => {
    const preloadAllImages = () => {
      try {
        // Get all cached data from localStorage
        const providers = JSON.parse(localStorage.getItem('offline_providers') || '[]');
        const categories = JSON.parse(localStorage.getItem('offline_categories') || '[]');
        const banners = JSON.parse(localStorage.getItem('offline_banners') || '[]');
        const paymentProviders = JSON.parse(localStorage.getItem('offline_payment_providers') || '[]');
        
        // Collect ALL image URLs
        const cachedImageUrls: string[] = [
          ...providers.map((p: any) => p.provider_logo).filter(Boolean),
          ...categories.map((c: any) => c.category_image).filter(Boolean),
          ...banners.map((b: any) => b.banner_image).filter(Boolean),
          ...paymentProviders.map((pp: any) => pp.provider_logo).filter(Boolean),
        ];
        
        // Remove duplicates
        const uniqueUrls = [...new Set([...bundledStaticImages, ...cachedImageUrls])];
        
        // Preload ALL images into browser memory immediately
        uniqueUrls.forEach(url => {
          const img = new Image();
          img.src = url;
        });

        // Known static images are already in the bundle. Cache only custom
        // remote uploads; known provider/category/banner images never need I/O.
        const customRemoteUrls = cachedImageUrls.filter((url) =>
          /^https?:/i.test(url) &&
          !getLocalImage('provider', null, url) &&
          !getLocalImage('payment', null, url) &&
          !getLocalImage('category', null, url) &&
          !getLocalImage('banner', null, url),
        );
        cacheImages(customRemoteUrls);
        
        console.log(`[ImagePreloader] Preloaded ${uniqueUrls.length} images into memory`);
      } catch (error) {
        console.error('[ImagePreloader] Error preloading images:', error);
      }
    };
    
    // Run immediately
    preloadAllImages();
    
    // Also run when coming back online
    window.addEventListener('online', preloadAllImages);
    
    return () => {
      window.removeEventListener('online', preloadAllImages);
    };
  }, []);
};
