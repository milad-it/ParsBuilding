import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8f6',
          100: '#f9eee9',
          200: '#f2dad0',
          300: '#e5bcab',
          400: '#d5947a',
          500: '#c26e4e',
          600: '#b25333', // رنگ آجری ساختمانی گرم
          700: '#954127',
          800: '#7a3622',
          900: '#643021',
          950: '#38160e'
        },
        slate: {
          850: '#151e2e',
          950: '#090d16'
        }
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow-brand': '0 0 25px -5px rgba(99, 102, 241, 0.4)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.4)',
        'glow-rose': '0 0 25px -5px rgba(244, 63, 94, 0.4)'
      },
      backdropBlur: {
        'xs': '2px',
      }
    }
  },
  plugins: []
} satisfies Config;
