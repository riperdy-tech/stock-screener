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
                page: '#0e0f11',        // body
                surface: '#131416',     // app surface
                ink: {
                    DEFAULT: '#e7e5e0', // text primary
                    2: '#8b887f',       // secondary
                    3: '#66635b',       // tertiary / faint
                    q: '#c9c6be',       // body-quote
                },
                accent: ACCENT,         // AI / brand — desaturated blue
                pos: POS,               // undervalued, returns, buy
                warn: '#cfa14e',        // fair, demotions, HALF/QUARTER
                neg: '#c2695a',         // overvalued, vetoes, sell
                link: { DEFAULT: '#a8b4d8', hover: '#c3cce6' },
                factor: {
                    value: '#5a9b6d', quality: '#6b93c4', momentum: '#cfa14e',
                    lowvol: '#9a83c2', revisions: '#c2798f',
                },
                series: {
                    equal: 'oklch(0.78 0.08 250)', plan: '#c9c6be', plan2: '#c2798f',
                    plan3: '#b56a4f', mine: '#cfa14e',
                    iwm: '#6e6b64', spy: '#6b93c4', qqq: '#4f9e8f',
                    dram: '#8f7fc0', soxx: '#b56a4f',
                },
                rule: {
                    DEFAULT: 'rgba(255,255,255,.09)',
                    16: 'rgba(255,255,255,.16)',   // header rule
                    14: 'rgba(255,255,255,.14)',   // inactive chip / input border
                    12: 'rgba(255,255,255,.12)',   // table header rule
                    9: 'rgba(255,255,255,.09)',    // section rules
                    6: 'rgba(255,255,255,.06)',    // row dividers
                },
                hover: 'rgba(255,255,255,.03)',
                track: {
                    4: 'rgba(255,255,255,.04)',    // hero band track
                    5: 'rgba(255,255,255,.05)',    // mini band strip track
                    8: 'rgba(255,255,255,.08)',    // factor / DCF bar track
                    10: 'rgba(255,255,255,.10)',
                    18: 'rgba(255,255,255,.18)',   // cash bar fill
                },

                // ── Legacy shadcn aliases, remapped for the migration window.
                // Removed once every surface is swept (see plan phase 9).
                background: '#131416',
                foreground: '#e7e5e0',
                border: 'rgba(255,255,255,.09)',
                input: 'rgba(255,255,255,.14)',
                ring: 'oklch(0.78 0.08 250)',
                primary: { DEFAULT: ACCENT, foreground: '#131416' },
                secondary: { DEFAULT: 'rgba(255,255,255,.05)', foreground: '#e7e5e0' },
                muted: { DEFAULT: 'rgba(255,255,255,.05)', foreground: '#8b887f' },
                popover: { DEFAULT: '#0e0f11', foreground: '#e7e5e0' },
                card: { DEFAULT: '#131416', foreground: '#e7e5e0' },
                destructive: { DEFAULT: '#c2695a', foreground: '#e7e5e0' },
                success: POS,
                warning: '#cfa14e',
                danger: '#c2695a',
            },
            fontFamily: {
                sans: ['var(--font-hanken)', 'system-ui', 'sans-serif'],
                mono: ['var(--font-spline)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
            },
            letterSpacing: {
                micro: '.12em',
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
