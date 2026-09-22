# Stock Screener · Factor Lab

A **quantitative + LLM-assisted stock screening and research platform** that scores listed companies on multiple factor engines, paper-trades the resulting portfolios daily, and stores AI deep-dives — all in a single dark dashboard that speaks **English, 한국어, and 中文**.

## ✨ What it does

### Factor Lab Cockpit (`/`)

The daily decision surface. Browse factor-engine rankings through three lenses:

- **Quant** — the deterministic factor engine (composite scores, factor-mix bars, valuation gaps)
- **RS2 LLM** — the local AI analyst’s own rankings and verdicts
- **Compare** — both side by side, biggest disagreements first

Plus band filtering, expectations-gap valuations, macro overlays, and a searchable, sortable table.

### Lenses — the full screener (`/lenses`)

A comprehensive filter screen across **US, Korea, and Taiwan** markets with four strategies:

- **100-Bagger** — strict growth, valuation, float, and ownership gates
- **Reverse Engine** — ranks survivors by quality, margin of safety, and survivability
- **Paradigm** — scores secular-theme participation, momentum, and economics
- **YouTube Strategy** — earnings momentum, deep-value reversal, and turnaround seeds

### AI Reports (`/reports`)

A searchable repository of cloud-stored **DeepSeek V4** analyses, filterable by action (BUY / ACCUMULATE / HOLD / SELL), valuation stance, archetype, and conviction.

### Track Record

Live **paper-traded portfolios** (value core, hybrid + quality sleeve, equal-weight, and your own holdings) with NAV curves benchmarked against **IWM / SPY / QQQ**, per-side commission modeling, and a zoomable date-range scrubber.

### Trilingual Handbook (`/help`)

A complete manual in **EN / KO / ZH** with a hyperlinked financial glossary (hover any term for a pop-up definition) and workflow diagrams of the daily data pipeline.

## 🛠 Tech stack

- **Next.js 14** (App Router) · **React 18** · **TypeScript** (strict)
- **Tailwind CSS 3** dark theme
- **Recharts** (charts & the date-range scrubber)
- **Supabase** (optional auth & cloud report storage)
- **Google Gemini** & **DeepSeek** (AI analysis)
- **react-markdown** (AI report rendering)

## 🔄 Data pipeline

Python scripts in `scripts/` fetch **SEC filings, fundamentals history, and prices**, then score every name and publish the results to `public/data`. A **GitHub Actions** workflow refreshes and re-scores after every market close.

```text
SEC / fundamental / price data → scoring chain (macro → reverse → paradigm) → public/data → dashboard
```

Run the full chain locally:

```bash
run_chain.bat          # Windows
python scripts/run_chain.py
```

## 🚀 Getting started

```bash
npm install
npm run dev            # http://localhost:3000
npm run build && npm run start   # production build
```

Optional: add `.env.local` with your Supabase URL/key to enable cloud login and report storage. The app runs fine without it and falls back to local data.

## 📁 Repo layout

```text
app/          Next.js pages (cockpit, lenses, reports, help, API routes)
components/   React components
lib/          data services, i18n, glossary
public/data/  published screening data
scripts/      Python data pipeline
```

## 🤝 Contributing

Contributions are welcome. Please open an issue or submit a pull request. For major changes, please discuss first.

## 📄 License

This project is currently unlicensed. If you intend to make it open source, consider adding a license (e.g., MIT, Apache-2.0).

## 📬 Contact

For questions or feedback, please open an issue on GitHub.
