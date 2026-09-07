import { useState, useEffect, useRef } from 'react';
import { useNavigate } from "@/lib/router-compat";
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import najaxLogoSplash from '@/assets/najax-logo.jpeg';
import { useTenant } from '@/contexts/TenantContext';
import { hideNativeSplash } from '@/lib/nativeSplash';
import CachedImage from '@/components/CachedImage';

const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const STARTUP_PAINT_MS = 450;

const Index = () => {
  const navigate = useNavigate();
  const wasAlreadyInitialized = sessionStorage.getItem('appInitialized') === 'true';
  const [isChecking, setIsChecking] = useState(!wasAlreadyInitialized);
  const hasInitialized = useRef(false);
  const { isReallyOnline } = useConnectivity();
  const { forceRefreshCache } = useOfflineCache();

  const hasOfflineRegistration = (): boolean => {
    const hasSkipped = localStorage.getItem('hasSkippedOfflineRegistration') === 'true';
    if (hasSkipped) return true;
    const sender = localStorage.getItem('offlineSenderPhone');
    const receiver = localStorage.getItem('offlineReceiverPhone');
    return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
  };

  const continueIntoApp = () => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const verifiedPhone = localStorage.getItem('verifiedPhone');
    sessionStorage.setItem('appInitialized', 'true');

    if (isValidSomaliPhone(verifiedPhone)) {
      navigate(hasOfflineRegistration() ? '/providers' : '/offline-mode', { replace: true });
      return;
    }

    if (verifiedPhone) localStorage.removeItem('verifiedPhone');
    setIsChecking(false);
  };

  useEffect(() => {
    if (wasAlreadyInitialized) continueIntoApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wasAlreadyInitialized || !isChecking) return;
    const timer = window.setTimeout(continueIntoApp, STARTUP_PAINT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasAlreadyInitialized, isChecking]);

  const refreshStarted = useRef(false);
  useEffect(() => {
    if (!isReallyOnline || refreshStarted.current) return;
    refreshStarted.current = true;
    void forceRefreshCache().catch(() => {});
  }, [isReallyOnline, forceRefreshCache]);

  if (isChecking) return <SplashScreen />;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-start sm:justify-center overflow-y-auto px-5 py-5 gap-4">
      <div className="w-full max-w-md space-y-5 shrink-0">
        <HeroSection />
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
          <PhoneInput />
        </div>
      </div>
      <div className="shrink-0 pb-4">
        <Footer />
      </div>
    </div>
  );
};

const SplashScreen = () => {
  const t = useTenant();
  const tenant = t.status === 'ready' || t.status === 'suspended' ? t.tenant : null;
  const logo = tenant?.logo_url || najaxLogoSplash;
  const name = tenant?.name || 'Najax Data';

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => void hideNativeSplash());
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-primary">
      <CachedImage
        src={logo}
        alt={name}
        className="w-36 h-36 rounded-2xl object-cover"
        fallback={<img src={najaxLogoSplash} alt={name} className="w-36 h-36 rounded-2xl object-cover" />}
      />
      <div className="w-9 h-9 mt-8 border-[3px] border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  );
};

export default Index;
