import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        bg: { primary: '#0b0e11', secondary: '#12161c', tertiary: '#181d25', border: '#1e2530' },
        accent: { DEFAULT: '#6366f1', soft: 'rgba(99,102,241,0.12)' },
        bull: { DEFAULT: '#22c55e', soft: 'rgba(34,197,94,0.12)' },
        bear: { DEFAULT: '#ef4444', soft: 'rgba(239,68,68,0.12)' },
        txt: { primary: '#e8eaed', secondary: '#8b8fa3', tertiary: '#565a6e' },
      },
    },
  },
  plugins: [],
}
export default config
