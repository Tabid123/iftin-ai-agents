import { useEffect } from 'react';
import { App } from '@capacitor/app';

// Detect Android WebView using User-Agent (works even with Capacitor remote URL)
const isAndroidWebView = (): boolean => {
  if (typeof window === 'undefined' || !navigator?.userAgent) return false;
  const ua = navigator.userAgent;
  return /Android/.test(ua) && ua.includes('wv');
};

export const useEdgeToEdge = () => {
  useEffect(() => {
    const setSafeArea = () => {
      if (isAndroidWebView()) {
        // Capacitor already adjusts the Android WebView for edge-to-edge/status
        // bar insets (`adjustMarginsForEdgeToEdge: force`). Adding a guessed
        // 18/32px CSS inset on top of that double-counted the status bar and
        // made every fixed header look too tall. Keep the web header flush with
        // the WebView's real content bounds and let the native layer own the
        // Android status-bar inset.
        document.documentElement.style.setProperty('--effective-safe-area-top', '0px');
      } else {
        // iOS/web still need the browser-provided safe-area inset.
        document.documentElement.style.setProperty(
          '--effective-safe-area-top',
          'env(safe-area-inset-top, 0px)'
        );
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
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      resumeListener?.remove();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
};
