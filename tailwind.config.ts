import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        xrpl: {
          blue: '#1a73e8',
          dark: '#0a0f1e',
          card: '#111827',
          border: '#1f2937',
        },
      },
    },
  },
  plugins: [],
}
export default config
