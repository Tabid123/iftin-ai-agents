import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '@capacitor/keyboard';

export const useKeyboardInsets = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const revealFocusedInput = () => {
      // Wait until Android has finished resizing the WebView, then position the
      // focused phone/OTP input inside the visible viewport. Smooth scrolling
      // fought the keyboard animation and could leave the field underneath it.
      window.setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !('scrollIntoView' in active)) return;
        active.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }, 60);
    };

    const willShow = Keyboard.addListener('keyboardWillShow', (info: KeyboardInfo) => {
      setKeyboardHeight(info.keyboardHeight);
      setIsKeyboardVisible(true);
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });

    const didShow = Keyboard.addListener('keyboardDidShow', (info: KeyboardInfo) => {
      setKeyboardHeight(info.keyboardHeight);
      setIsKeyboardVisible(true);
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      revealFocusedInput();
    });

    const willHide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    });

    return () => {
      willShow.then(handle => handle.remove());
      didShow.then(handle => handle.remove());
      willHide.then(handle => handle.remove());
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
};
