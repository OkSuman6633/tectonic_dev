import { useEffect, useState } from 'react';

/**
 * React hook that returns true if the app is currently in Dark Mode,
 * reactively updating whenever the user toggles the theme in the navigation bar.
 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Synchronize initial state with the actual documentElement class
    setIsDark(document.documentElement.classList.contains('dark'));

    // Observe class attribute changes on <html>
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}
