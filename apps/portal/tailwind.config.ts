import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // CSS-var driven so .dark on <html> flips the whole UI without touching
        // any utility class. Opacity modifiers like bg-hairline/60 still work
        // via the rgb(var) / <alpha-value> form.
        bone:     'rgb(var(--bone-rgb) / <alpha-value>)',
        paper:    'rgb(var(--paper-rgb) / <alpha-value>)',
        ink:      'rgb(var(--ink-rgb) / <alpha-value>)',
        // CTA / primary-action surface. Stays dark in BOTH themes (no white
        // flip). Text on top is always white.
        cta:      'rgb(var(--cta-rgb) / <alpha-value>)',
        graphite: 'rgb(var(--graphite-rgb) / <alpha-value>)',
        smoke:    'rgb(var(--smoke-rgb) / <alpha-value>)',
        ash:      'rgb(var(--ash-rgb) / <alpha-value>)',
        hairline: 'rgb(var(--hairline-rgb) / <alpha-value>)',
        rule:     'rgb(var(--rule-rgb) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          50: 'rgb(var(--accent-50-rgb) / <alpha-value>)',
          600: 'rgb(var(--accent-rgb) / <alpha-value>)',
          700: 'rgb(var(--accent-700-rgb) / <alpha-value>)',
        },
        signal: {
          pending: '#D97706',  // amber-600 — saturated, not pastel
          scheduled: '#3B43E0',
          done: '#16A34A',     // green-600 — clean
          stop: '#DC2626',     // red-600
        },
      },
      letterSpacing: {
        microcaps: '0.08em',
        tightish: '-0.012em',
      },
      animation: {
        'fade-in':       'fadeIn 0.2s ease-out',
        'slide-up':      'slideUp 0.25s ease-out',
        // Sidebar text reveal — used when expanding. Slides in from the left
        // with a slight elastic settle so the labels feel like they "drop into
        // place" instead of fading.
        'sidebar-reveal':  'sidebarReveal 0.32s cubic-bezier(0.34,1.56,0.64,1) both',
        // Sidebar text exit — used when collapsing. Quick fade + tiny shift
        // back so the bar feels like it's snapping shut.
        'sidebar-conceal': 'sidebarConceal 0.14s cubic-bezier(0.4,0,1,1) both',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        sidebarReveal: {
          '0%':   { opacity: '0', transform: 'translateX(-6px)' },
          '60%':  { opacity: '1' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        sidebarConceal: {
          from: { opacity: '1', transform: 'translateX(0)' },
          to:   { opacity: '0', transform: 'translateX(-4px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
