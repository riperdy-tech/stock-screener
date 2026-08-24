/** @type {import('tailwindcss').Config} */

// Colors that must support the `/opacity` modifier but are not hex (oklch) are
// declared in function form so Tailwind can splice the alpha into the slash slot.
const alphaFn = (base) => ({ opacityValue }) =>
    opacityValue === undefined ? base.replace(' / <a>', '') : base.replace('<a>', opacityValue);

const ACCENT = alphaFn('oklch(0.78 0.08 250 / <a>)');
const POS = alphaFn('oklch(0.75 0.11 155 / <a>)');

module.exports = {
    darkMode: ["class"],
    content: [
        './pages/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './app/**/*.{ts,tsx}',
        './src/**/*.{ts,tsx}',
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        // Editorial desk aesthetic: rules + whitespace, never cards. Overriding these
        // (not extending) neutralises every legacy `rounded-*` / `shadow-*` in one shot.
        borderRadius: {
            none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0',
            xl: '0', '2xl': '0', '3xl': '0', full: '0',
        },
        boxShadow: {
            none: 'none', sm: 'none', DEFAULT: 'none', md: 'none',
            lg: 'none', xl: 'none', '2xl': 'none', inner: 'none',
        },
        extend: {
            colors: {
                // ── Desk tokens ──────────────────────────────────────────
                // Values below are the Aug-24 legibility pass (handoff rev1): the
                // canvas is lifted off near-black and every grey tier raised, because
                // the old muted greys were unreadable on real screens.
                page: '#15171a',        // body
                surface: '#1c1e21',     // app surface
                inset: '#202225',       // inset panels, transcript viewers, tooltips
                ink: {
                    DEFAULT: '#f2f0eb', // text primary
                    2: '#d3cfc5',       // secondary
                    3: '#c3bfb5',       // tertiary / faint
                    q: '#e0ddd6',       // body-quote
                },
                accent: ACCENT,         // AI / brand — desaturated blue
                pos: POS,               // undervalued, returns, buy
                warn: '#cfa14e',        // fair, demotions, HALF/QUARTER
                neg: '#e2917f',         // overvalued, vetoes, sell
                link: { DEFAULT: '#a8b4d8', hover: '#c3cce6' },
                factor: {
                    value: '#5a9b6d', quality: '#6b93c4', momentum: '#cfa14e',
                    lowvol: '#9a83c2', revisions: '#c2798f',
                },
                series: {
                    equal: 'oklch(0.78 0.08 250)', plan: '#e0ddd6', plan2: '#c2798f',
                    plan3: '#b56a4f', mine: '#cfa14e',
                    iwm: '#908d86', spy: '#6b93c4', qqq: '#4f9e8f',
                    dram: '#8f7fc0', soxx: '#b56a4f',
                },
                // Rules are one step stronger than the first cut so structure still
                // reads against the lighter canvas. The suffix IS the alpha.
                rule: {
                    DEFAULT: 'rgba(255,255,255,.14)',
                    24: 'rgba(255,255,255,.24)',   // inactive chip / input border
                    22: 'rgba(255,255,255,.22)',   // header rule
                    18: 'rgba(255,255,255,.18)',   // table header rule
                    14: 'rgba(255,255,255,.14)',   // section rules
                    10: 'rgba(255,255,255,.10)',   // row dividers
                },
                hover: 'rgba(255,255,255,.05)',
                track: {
                    12: 'rgba(255,255,255,.12)',   // every bar / band-strip track
                    18: 'rgba(255,255,255,.18)',   // cash bar fill
                },

                // ── Legacy shadcn aliases, remapped for the migration window.
                // Removed once every surface is swept (see plan phase 9).
                background: '#1c1e21',
                foreground: '#f2f0eb',
                border: 'rgba(255,255,255,.14)',
                input: 'rgba(255,255,255,.24)',
                ring: 'oklch(0.78 0.08 250)',
                primary: { DEFAULT: ACCENT, foreground: '#1c1e21' },
                secondary: { DEFAULT: 'rgba(255,255,255,.05)', foreground: '#f2f0eb' },
                muted: { DEFAULT: 'rgba(255,255,255,.05)', foreground: '#d3cfc5' },
                popover: { DEFAULT: '#15171a', foreground: '#f2f0eb' },
                card: { DEFAULT: '#1c1e21', foreground: '#f2f0eb' },
                destructive: { DEFAULT: '#e2917f', foreground: '#f2f0eb' },
                success: POS,
                warning: '#cfa14e',
                danger: '#e2917f',
            },
            fontFamily: {
                sans: ['var(--font-hanken)', 'system-ui', 'sans-serif'],
                mono: ['var(--font-spline)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
            },
            letterSpacing: {
                // Micro-labels moved 11px/600 — half the old tracking reads better.
                micro: '.05em',
                section: '.08em',
                head: '-.01em',
                brand: '.06em',
            },
            maxWidth: {
                desk: '1280px',
            },
        },
    },
    plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}
