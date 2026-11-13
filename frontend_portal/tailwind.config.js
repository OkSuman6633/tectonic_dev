/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        voxa: {
          sidebar: '#080b11',
          canvas: '#0e131f',
          surface: '#151c2c',
          bubble: '#1a2234',
          bubbleBorder: 'rgba(255, 255, 255, 0.08)',
          accent: '#2563eb', // VOXA blue send button
          accentHover: '#1d4ed8',
          textMuted: '#94a3b8',
          textDim: '#64748b',
          border: 'rgba(255, 255, 255, 0.06)',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
