/** @type {import('tailwindcss').Config} */

// "Obsidian" design system. The slate / sky / indigo scales are remapped so every existing
// component picks up the new neutrals and neon accents without per-file edits:
//   slate  -> cool obsidian neutrals
//   sky    -> neon cyan   (Builder agent, primary actions, focus)
//   indigo -> violet      (shared modules, module traffic)
const obsidian = {
  50: '#F7F8FA', 100: '#E8EAF0', 200: '#D3D6DE', 300: '#B4B9C5', 400: '#9BA1B0',
  500: '#737987', 600: '#5A606D', 700: '#3F4450', 800: '#262A33', 900: '#181B22', 950: '#0E1015',
};
const neonCyan = {
  50: '#ECFCFF', 100: '#CFF7FF', 200: '#A5EFFF', 300: '#67E3FF', 400: '#2DD4FF',
  500: '#06B8E6', 600: '#0891B2', 700: '#0E7490', 800: '#155E75', 900: '#164E63', 950: '#083344',
};
const violet = {
  50: '#F5F3FF', 100: '#EDE9FE', 200: '#DDD6FE', 300: '#C4B5FD', 400: '#A78BFA',
  500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9', 800: '#5B21B6', 900: '#4C1D95', 950: '#2E1065',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: obsidian,
        sky: neonCyan,
        indigo: violet,
        studio: {
          bg: 'var(--studio-bg)',
          surface: 'var(--studio-surface)',
          card: 'var(--studio-card)',
          border: 'var(--studio-border)',
          hover: 'var(--studio-hover)',
          accent: '#2DD4FF',
          accentHover: '#06B8E6',
          purple: '#A78BFA',
          emerald: '#34D399',
          amber: '#FBBF24',
          rose: '#FB7185',
        },
      },
      fontFamily: {
        // SF Pro on Apple devices (the native macOS/iOS feel), Geist elsewhere.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
      },
      boxShadow: {
        glow: '0 0 24px -6px rgba(45, 212, 255, 0.35)',
        purpleGlow: '0 0 24px -6px rgba(167, 139, 250, 0.35)',
        emeraldGlow: '0 0 24px -6px rgba(52, 211, 153, 0.35)',
        window: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.55), 0 2px 6px -2px rgba(0,0,0,0.35)',
      },
      animation: {
        pulseSlow: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};
