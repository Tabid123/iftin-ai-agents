import { useEffect } from 'react';
import { App } from '@capacitor/app';

// Detect Android WebView using User-Agent (works even with Capacitor remote URL)
const isAndroidWebView = (): boolean => {
  if (typeof window === 'undefined' || !navigator?.userAgent) return false;
  const ua = navigator.userAgent;
  return /Android/.test(ua) && ua.includes('wv');
};

const setVar = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value);
};

/**
 * Keeps --effective-safe-area-top / --effective-safe-area-bottom in sync with the
 * real system bar insets.
 *
 * On Android 15+ the WebView is always laid out edge-to-edge, so content would slide
 * under the status bar icons unless we reserve the inset ourselves. env() is often
 * reported as 0px inside the Android WebView, so we ask the EdgeToEdge plugin for the
 * real inset and fall back to a safe minimum.
 */
export const useEdgeToEdge = () => {
  useEffect(() => {
    let cancelled = false;

    const applyAndroidInsets = async () => {
      // Sensible defaults so the header never sits under the status bar even
      // before the plugin answers.
      setVar('--effective-safe-area-top', 'max(env(safe-area-inset-top, 0px), 26px)');
      setVar('--effective-safe-area-bottom', 'max(env(safe-area-inset-bottom, 0px), 0px)');

      try {
        const mod = await import('@capawesome/capacitor-android-edge-to-edge-support');
        const getInsets = (mod as unknown as {
          EdgeToEdge?: { getInsets?: () => Promise<{ top: number; bottom: number }> };
        }).EdgeToEdge?.getInsets;
        if (!getInsets) return;
        const insets = await getInsets();
        if (cancelled || !insets) return;
        if (typeof insets.top === 'number' && insets.top >= 0) {
          setVar('--effective-safe-area-top', `${Math.round(insets.top)}px`);
        }
        if (typeof insets.bottom === 'number' && insets.bottom >= 0) {
          setVar('--effective-safe-area-bottom', `${Math.round(insets.bottom)}px`);
        }
      } catch {
        /* plugin unavailable — keep the env()/minimum fallback */
      }
    };

    const setSafeArea = () => {
      if (isAndroidWebView()) {
        void applyAndroidInsets();
      } else {
        // iOS / web: the browser reports correct insets.
        setVar('--effective-safe-area-top', 'env(safe-area-inset-top, 0px)');
        setVar('--effective-safe-area-bottom', 'env(safe-area-inset-bottom, 0px)');
      }
    };

    setSafeArea();

    let resumeListener: { remove: () => void } | undefined;

    if (typeof App !== 'undefined' && App.addListener) {
      App.addListener('appStateChange', (state) => {
        if (state.isActive) setSafeArea();
      }).then(listener => {
        resumeListener = listener;
      }).catch(() => {
        // App listener is not available in a normal browser.
      });
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) setSafeArea();
    };
    const handleResize = () => setSafeArea();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      cancelled = true;
      resumeListener?.remove();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
};
