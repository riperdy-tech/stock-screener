/** @type {import('tailwindcss').Config} */

// Every semantic colour is a CSS variable (declared in app/globals.css) so the desk's light theme
// (`.theme-light`, applied on components/desk/Shell.tsx only) can swap them while /admin and the
// legacy pages keep the dark :root values. Declared in function form so the `/opacity` modifier
// still works: it is spliced in with color-mix, which also accepts oklch and rgba variables.
const tok = (name) => ({ opacityValue }) => {
    if (opacityValue === undefined) return `var(${name})`;
    const n = Number(opacityValue);
    const pct = Number.isNaN(n) ? `calc(${opacityValue} * 100%)` : `${Math.round(n * 10000) / 100}%`;
    return `color-mix(in oklch, var(${name}) ${pct}, transparent)`;
};

const ACCENT = tok('--accent');
const POS = tok('--pos');

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
                page: tok('--page'),        // recessed ground (dark: body; light: README "surf")
                surface: tok('--surface'),  // app surface (light: README "bg")
                inset: tok('--inset'),      // inset panels, transcript viewers, tooltips
                ink: {
                    DEFAULT: tok('--ink'),  // text primary
                    2: tok('--ink-2'),      // secondary
                    3: tok('--ink-3'),      // tertiary / faint
                    q: tok('--ink-q'),      // body-quote
                },
                // One meaning per colour (2026-10 colour system; validated pairwise for normal and
                // colour-blind vision on the desk surface).
                accent: ACCENT,         // blue: the list / funnel progress, selection, links-as-controls
                list2: tok('--list2'),  // softer blue: watchlist (second step of the list)
                pos: POS,               // green: undervalued, gains, good
                fair: tok('--fair'),    // neutral midpoint of the verdict
                warn: tok('--warn'),    // amber: warnings and caution only
                neg: tok('--neg'),      // coral: overvalued, losses, bad
                off: tok('--off'),      // dim grey: doesn't count (blocked, vetoed, no data)
                link: { DEFAULT: tok('--link'), hover: tok('--link-hover') },
                // Why a stock is listed: the door families and the scores inside them.
                factor: {
                    quality: '#a774d6', revisions: '#c0a2de',
                    value: '#149c82', exp_gap: '#72bca8',
                    momentum: '#fb9dbb',
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
                    DEFAULT: tok('--rule-14'),
                    24: tok('--rule-24'),   // inactive chip / input border
                    22: tok('--rule-22'),   // header rule
                    18: tok('--rule-18'),   // table header rule
                    14: tok('--rule-14'),   // section rules
                    10: tok('--rule-10'),   // row dividers
                },
                hover: tok('--hover'),
                wash: tok('--wash'),
                track: {
                    12: tok('--track'),    // every bar / band-strip track
                    18: tok('--track-18'), // cash bar fill
                },

                // ── Legacy shadcn aliases, remapped for the migration window.
                // Removed once every surface is swept (see plan phase 9).
                background: tok('--surface'),
                foreground: tok('--ink'),
                border: tok('--rule-14'),
                input: tok('--rule-24'),
                ring: tok('--accent'),
                primary: { DEFAULT: ACCENT, foreground: tok('--surface') },
                secondary: { DEFAULT: tok('--hover'), foreground: tok('--ink') },
                muted: { DEFAULT: tok('--hover'), foreground: tok('--ink-2') },
                popover: { DEFAULT: tok('--page'), foreground: tok('--ink') },
                card: { DEFAULT: tok('--surface'), foreground: tok('--ink') },
                destructive: { DEFAULT: tok('--neg'), foreground: tok('--ink') },
                success: POS,
                warning: tok('--warn'),
                danger: tok('--neg'),
            },
            fontFamily: {
                sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
                mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
