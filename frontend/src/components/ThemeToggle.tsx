import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * A small dark/light toggle that reads and writes the same `theme` localStorage key and `.light`
 * document class that the main Studio uses, so theme stays consistent across the login screen,
 * the plan picker and the Studio.
 */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'));

  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    try {
      localStorage.setItem('theme', next ? 'light' : 'dark');
    } catch {
      /* not persisted */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300 ${className}`}
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
};
