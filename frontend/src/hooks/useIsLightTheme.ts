import { useEffect, useState } from 'react';

/** Tracks the `light` class the theme toggle puts on <html>. */
export function useIsLightTheme(): boolean {
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setLight(document.documentElement.classList.contains('light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return light;
}
