import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import CachedImage from '@/components/CachedImage';
import { useTenant } from '@/contexts/TenantContext';

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  media_type?: string;
  video_duration?: number | null;
  rotation_interval?: number | null;
}

const BANNER_TTL_MS = 10 * 60 * 1000;

function readBannerCache(key: string | null): Banner[] {
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const RotatingBanner = () => {
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended'
    ? tenantState.tenant
    : null;
  const bannerCacheKey = tenant?.id ? `offline_banners:${tenant.id}` : null;
  const bannerTimestampKey = tenant?.id ? `offline_banners_at:${tenant.id}` : null;

  // Critical for visual stability: read the tenant cache during the FIRST render,
  // not later in an effect. This prevents a blank/skeleton banner frame whenever
  // the route remounts.
  const [banners, setBanners] = useState<Banner[]>(() => readBannerCache(bannerCacheKey));
  const [currentBanner, setCurrentBanner] = useState(() => {
    try {
      const sessionActive = sessionStorage.getItem('session_active');
      if (!sessionActive) {
        sessionStorage.setItem('session_active', 'true');
        sessionStorage.removeItem('banner_position');
        return 0;
      }
      const saved = sessionStorage.getItem('banner_position');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [isLoading, setIsLoading] = useState(() => readBannerCache(bannerCacheKey).length === 0);
  const [isVisible, setIsVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('banner_position', currentBanner.toString());
    } catch {}
  }, [currentBanner]);

  useEffect(() => {
    if (banners.length > 0 && currentBanner >= banners.length) setCurrentBanner(0);
  }, [banners.length, currentBanner]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    const currentMedia = banners[currentBanner];
    if (currentMedia?.media_type !== 'video') return;
    if (isVisible && !document.hidden) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [isVisible, currentBanner, banners]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!videoRef.current) return;
      const currentMedia = banners[currentBanner];
      if (currentMedia?.media_type !== 'video') return;
      if (document.hidden || !isVisible) videoRef.current.pause();
      else videoRef.current.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isVisible, currentBanner, banners]);

  useEffect(() => {
    const saveVideoPosition = () => {
      if (videoRef.current && banners[currentBanner]?.media_type === 'video') {
        try {
          sessionStorage.setItem('video_position', videoRef.current.currentTime.toString());
          sessionStorage.setItem('video_banner_index', currentBanner.toString());
        } catch {}
      }
    };
    const interval = setInterval(saveVideoPosition, 2000);
    window.addEventListener('beforeunload', saveVideoPosition);
    return () => {
      saveVideoPosition();
      clearInterval(interval);
      window.removeEventListener('beforeunload', saveVideoPosition);
    };
  }, [currentBanner, banners]);

  const handleVideoLoaded = () => {
    try {
      const savedPosition = sessionStorage.getItem('video_position');
      const savedBannerIndex = sessionStorage.getItem('video_banner_index');
      if (savedPosition && savedBannerIndex === currentBanner.toString()) {
        const position = parseFloat(savedPosition);
        if (videoRef.current && position > 0 && position < (videoRef.current.duration - 0.5)) {
          videoRef.current.currentTime = position;
        }
        sessionStorage.removeItem('video_position');
        sessionStorage.removeItem('video_banner_index');
      }
    } catch {}
  };

  useEffect(() => {
    try { localStorage.removeItem('offline_banners'); } catch {}

    if (!bannerCacheKey) {
      setBanners([]);
      setIsLoading(false);
      return;
    }

    const cachedBanners = readBannerCache(bannerCacheKey);
    if (cachedBanners.length > 0) {
      setBanners(cachedBanners);
      setIsLoading(false);
    }

    // Do not re-query banners merely because the user navigated away and back.
    // Refresh only when the tenant snapshot is missing or older than 10 minutes.
    let freshEnough = false;
    if (bannerTimestampKey && cachedBanners.length > 0) {
      try {
        const at = Number(localStorage.getItem(bannerTimestampKey) || 0);
        freshEnough = at > 0 && Date.now() - at < BANNER_TTL_MS;
      } catch {}
    }
    if (freshEnough) return;

    let cancelled = false;
    const loadBanners = async () => {
      try {
        const { data, error } = await (supabase as any).rpc('get_tenant_banners');
        if (cancelled) return;
        if (error) throw error;
        const freshBanners = Array.isArray(data) ? (data as Banner[]) : [];
        // Tenant-kan ayaa xogtiisa keliya la muujinayaa. Haddii uu banner
        // lahayn, tirtir wixii hore — yaan tenant kale banner-kiisa u muuqan.
        setBanners(freshBanners);
        try {
          if (freshBanners.length > 0) {
            localStorage.setItem(bannerCacheKey, JSON.stringify(freshBanners));
          } else {
            localStorage.removeItem(bannerCacheKey);
          }
          if (bannerTimestampKey) localStorage.setItem(bannerTimestampKey, String(Date.now()));
        } catch {}

      } catch {
        // Keep the last known snapshot.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadBanners();
    return () => { cancelled = true; };
  }, [bannerCacheKey, bannerTimestampKey]);

  useEffect(() => {
    if (banners.length === 0) return;
    const currentMedia = banners[currentBanner];
    if (!currentMedia || currentMedia.media_type === 'video') return;
    const rotationTime = currentMedia.rotation_interval ? currentMedia.rotation_interval * 1000 : 4000;
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, rotationTime);
    return () => clearInterval(interval);
  }, [banners.length, currentBanner, banners]);

  const handleVideoEnded = () => setCurrentBanner((prev) => (prev + 1) % banners.length);

  if (banners.length === 0) {
    if (isLoading) {
      return (
        <div className="w-full space-y-2">
          <div className="w-full rounded-xl overflow-hidden bg-muted" style={{ aspectRatio: '2.5/1', maxHeight: '320px' }} />
          <div className="flex justify-center space-x-1.5">
            {[1, 2, 3].map(i => <div key={i} className="w-6 h-1.5 rounded-full bg-muted-foreground/20" />)}
          </div>
        </div>
      );
    }
    return null;
  }

  const currentMedia = banners[currentBanner];
  if (!currentMedia) return null;
  const isVideo = currentMedia.media_type === 'video';

  return (
    <div ref={containerRef} className="w-full space-y-2">
      <div className="w-full rounded-xl overflow-hidden shadow-elegant relative" style={{ aspectRatio: '2.5/1', maxHeight: '320px' }}>
        {isVideo ? (
          <video
            ref={videoRef}
            key={currentMedia.banner_image}
            src={currentMedia.banner_image}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            preload="auto"
            onEnded={handleVideoEnded}
            onLoadedMetadata={handleVideoLoaded}
            aria-label={currentMedia.alt_text || 'Promotional video'}
          />
        ) : (
          <CachedImage
            key={currentMedia.banner_image}
            src={currentMedia.banner_image}
            alt={currentMedia.alt_text || 'Promotional banner'}
            kind="banner"
            bundledName={null}
            className="w-full h-full object-cover"
            width={1200}
            height={400}
            sizes="(max-width: 768px) 100vw, 1200px"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}
      </div>
      <div className="flex justify-center space-x-1.5">
        {banners.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full ${index === currentBanner ? 'w-8 bg-primary' : 'w-4 bg-muted-foreground/30'}`}
            aria-label={`Banner ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default RotatingBanner;
