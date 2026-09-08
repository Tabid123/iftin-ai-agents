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

/** Keep CSS and native system-bar inset ownership mutually exclusive. */
export const useEdgeToEdge = () => {
  useEffect(() => {
    const applyAndroidInsets = async () => {
      // Android's plugin applies the measured status/navigation-bar margins to
      // the WebView. CSS must stay at zero here or the inset is counted twice.
      setVar('--effective-safe-area-top', '0px');
      setVar('--effective-safe-area-bottom', '0px');
      try {
        const { EdgeToEdge } = await import('@capawesome/capacitor-android-edge-to-edge-support');
        await EdgeToEdge.enable();
      } catch {
        // Older native builds without the plugin still receive a conservative
        // CSS inset so their header cannot sit beneath the status icons.
        setVar('--effective-safe-area-top', 'max(env(safe-area-inset-top, 0px), 24px)');
        setVar('--effective-safe-area-bottom', 'env(safe-area-inset-bottom, 0px)');
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
      resumeListener?.remove();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
};
