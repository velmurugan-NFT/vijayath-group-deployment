/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
        serif: ['Instrument Serif', 'serif'],
      },
      colors: {
        vijayanth: {
          green: '#133E22',
          'green-deep': '#0E2E1A',
          'green-hover': '#1A5230',
          'green-50': '#F1F6F1',
          'green-100': '#DCE8DC',
          'green-200': '#B9D2B9',
          gold: '#D9B963',
          'gold-soft': '#EFE0B5',
          'gold-deep': '#B79341',
          page: '#F7F4EC',
          surface: '#FFFFFF',
          'surface-2': '#FBF8F1',
          'row-alt': '#F4F9F4',
          line: '#E8E3D6',
          'line-soft': '#F1ECDF',
          ink: '#1B2620',
          'ink-2': '#3A4540',
          muted: '#6E756C',
          'muted-2': '#95988F',
          danger: '#B6342A',
          'danger-soft': '#FBEAE7',
          warning: '#B5841A',
          'warning-soft': '#FAF1DA',
          success: '#186C3A',
          'success-soft': '#E3F1E6',
          info: '#2D5A87',
          'info-soft': '#E5EEF6',
        },
      },
      borderRadius: {
        brand: '10px',
        'brand-sm': '6px',
        'brand-lg': '14px',
      },
      boxShadow: {
        'brand-sm': '0 1px 2px rgba(20,30,20,.04)',
        brand: '0 2px 14px -6px rgba(20,30,20,.08), 0 1px 2px rgba(20,30,20,.04)',
        'brand-lg': '0 18px 48px -20px rgba(20,30,20,.18), 0 4px 12px -4px rgba(20,30,20,.05)',
      },
      spacing: {
        sidebar: '248px',
        topbar: '64px',
      },
    },
  },
  plugins: [],
};
