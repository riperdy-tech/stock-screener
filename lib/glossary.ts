// ---------------------------------------------------------------------------
// GLOSSARY — the dictionary behind every hyperlinked financial term.
//
// Every technical word on the /help page (and anywhere else that imports <Term>)
// resolves to an entry here. The <Term> component renders the word as a link and,
// when clicked, shows a mini-popup with this definition.
//
// Keys are kebab-case and stable — they double as the anchor id in the glossary
// index (#term-<key>). `related` lists other glossary keys shown as quick links.
// ---------------------------------------------------------------------------

export type GlossaryCategory =
    | 'core'        // core concepts & how scoring works
    | 'value'       // value factor
    | 'quality'     // quality factor
    | 'momentum'    // momentum factor
    | 'risk'        // volatility / risk
    | 'revisions'   // analyst revisions factor
    | 'valuation'   // DCF & valuation
    | 'ai'          // the AI analyst and its gate
    | 'portfolio'   // position sizing
    | 'track'       // track record & performance measurement
    | 'data'        // data sources & pipeline
    | 'overlay'     // overlays & forensic flags
    | 'bands';      // doors, bands & vetoes

export interface TermDef {
    term: string;
    category: GlossaryCategory;
    /** One-line plain-English summary shown as the popup subtitle. */
    plain: string;
    /** The full definition shown in the popup body. */
    definition: string;
    /** Optional: other glossary keys surfaced as "see also" chips. */
    related?: string[];
}

export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
    core: 'Core concepts',
    value: 'Value factor',
    quality: 'Quality factor',
    momentum: 'Momentum factor',
    risk: 'Risk & volatility',
    revisions: 'Revisions factor',
    valuation: 'Valuation & DCF',
    ai: 'AI analyst',
    portfolio: 'Portfolio & sizing',
    track: 'Track record',
    data: 'Data & pipeline',
    overlay: 'Overlays & forensics',
    bands: 'Doors, bands & vetoes',
};

// Tailwind classes per category, used by the popup badge and glossary chips.
export const CATEGORY_STYLES: Record<GlossaryCategory, string> = {
    core: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    value: 'border-green-500/40 bg-green-500/15 text-green-300',
    quality: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
    momentum: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    risk: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
    revisions: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
    valuation: 'border-teal-500/40 bg-teal-500/15 text-teal-300',
    ai: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
    portfolio: 'border-pink-500/40 bg-pink-500/15 text-pink-300',
    track: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
    data: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
    overlay: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
    bands: 'border-lime-500/40 bg-lime-500/15 text-lime-300',
};

export const GLOSSARY: Record<string, TermDef> = {
    // ── Core concepts ────────────────────────────────────────────────────
    composite: {
        term: 'Door percentile (composite)',
        category: 'core',
        plain: 'The 0–100 number a stock is ranked by: its better door.',
        definition:
            'Every stock gets a score from each of the first two doors, and each score is turned into a percentile (0–100). The stock competes on the better of the two, and a champion gets a small bonus when names are put in order. Higher = a stronger case on at least one door. It is a way to order a shortlist, not a price target.',
        related: ['door', 'champion', 'percentile'],
    },
    factor: {
        term: 'Factor',
        category: 'core',
        plain: 'A measurable trait of a stock that the doors are built from.',
        definition:
            'A quantifiable characteristic — like being profitable, being cheap, rising analyst forecasts, or recently winning — that research has linked to future returns on average. The screen measures quality, value, the expectations gap, momentum and revisions. The factors are not averaged equally: each door blends the ones it cares about with its own weights.',
        related: ['door', 'value', 'quality', 'momentum'],
    },
    'sector-neutral': {
        term: 'Sector-neutral',
        category: 'core',
        plain: 'Grades are relative to the stock’s own industry group.',
        definition:
            'Each stock is mostly compared with companies in the same sector — a supermarket competes with supermarkets, not software companies. Without this, “cheap” would just mean “is a bank” and “high momentum” would just mean “is a tech stock.” Quality, value and revisions are measured this way. Momentum is the exception: it is also read against the whole market, so a boom that lifts an entire sector does not look ordinary.',
        related: ['zscore', 'composite'],
    },
    zscore: {
        term: 'Z-score',
        category: 'core',
        plain: 'How many standard deviations a value sits from the sector average.',
        definition:
            'A statistical ruler that converts a raw number (say, a 14% free-cash-flow yield) into how unusual it is within its sector. A z-score of +1.5 means the stock is 1.5 standard deviations above its sector’s average for that metric. Z-scores make very different units (percentages, growth rates, volatility) comparable on one scale.',
        related: ['sector-neutral', 'winsorize', 'composite'],
    },
    winsorize: {
        term: 'Winsorize',
        category: 'core',
        plain: 'Clipping extreme outliers so they cannot distort the rankings.',
        definition:
            'Before scoring, any value beyond the 1st or 99th percentile within a sector is pulled back to that boundary. A single absurd data point — a typo, a one-time anomaly, a nearly-dead stock with a bizarre ratio — is prevented from silently dominating everyone else’s ranking.',
        related: ['zscore', 'sector-neutral'],
    },
    percentile: {
        term: 'Percentile',
        category: 'core',
        plain: 'Your position in line, 0–100, among all scored stocks.',
        definition:
            'A ranking converted to a 0–100 scale: the 98th percentile means the stock scores higher than 98% of the stocks that were scored. Each door score is turned into a percentile, and a stock competes on the better of its first two.',
        related: ['composite', 'door'],
    },
    overfitting: {
        term: 'Overfitting',
        category: 'core',
        plain: 'Tuning rules to past data so precisely they break on new data.',
        definition:
            'The classic quant trap: the more knobs you tune until a backtest looks amazing, the more you are memorizing the past instead of learning a durable pattern. A rule that “would have” made money is worthless if it was reverse-engineered from the same data it is tested on. That is why this site writes its pass/fail rules down before it sees results.',
        related: ['out-of-sample', 'backtest'],
    },
    'out-of-sample': {
        term: 'Out-of-sample',
        category: 'core',
        plain: 'Testing on data the model never saw while being built.',
        definition:
            'The only honest test of a rule: how it performs on data that was not used to create it. Forward-logged signals that are later measured against real future prices are a pure out-of-sample test — no hindsight, no editing.',
        related: ['overfitting', 'point-in-time', 'paper-trading'],
    },
    backtest: {
        term: 'Backtest',
        category: 'core',
        plain: 'Replaying history to see how a rule “would have” done.',
        definition:
            'Running a strategy over historical data to estimate its performance. Backtests are useful but flattering — they suffer from hindsight bias, survivorship bias, and overfitting. This site treats them as diagnostics, and prefers forward-logged, paper-traded signals as the honest meter.',
        related: ['survivorship-bias', 'paper-trading', 'overfitting'],
    },
    'point-in-time': {
        term: 'Point-in-time',
        category: 'core',
        plain: 'Using only information that was actually known at that moment.',
        definition:
            'A discipline that forbids peeking: a signal logged on a given day may only use data that existed that day — no future restatements, no future prices. Every forward-logged signal here is point-in-time, which is what makes the track record trustworthy.',
        related: ['out-of-sample', 'hindsight-bias'],
    },
    'survivorship-bias': {
        term: 'Survivorship bias',
        category: 'core',
        plain: 'Forgetting the losers that got delisted when measuring winners.',
        definition:
            'If you only measure the stocks that are still around today, you miss all the ones that failed and disappeared — which flatters every backtest. Avoiding it means including delisted, bankrupt, and fallen names in the measurement, which this pipeline does.',
        related: ['backtest', 'point-in-time'],
    },
    'hindsight-bias': {
        term: 'Hindsight bias',
        category: 'core',
        plain: 'Pretending you knew at the time what you only know in hindsight.',
        definition:
            'Reconstructing a decision as if the outcome was predictable. The paper books guard against it: every buy and sell is recorded on its own day, before the future happens.',
        related: ['point-in-time', 'paper-trading'],
    },
    'market-cap': {
        term: 'Market cap',
        category: 'core',
        plain: 'The price of the whole company — shares × share price.',
        definition:
            'Market capitalization = share price × shares outstanding. Shown as $T (trillion), $B (billion), or $M (million). It tells you roughly how big the company is, which matters for risk, liquidity, and how much of your portfolio one position represents.',
        related: ['float', 'enterprise-value'],
    },

    // ── Value factor ─────────────────────────────────────────────────────
    value: {
        term: 'Value factor',
        category: 'value',
        plain: 'Are you paying $1 for $2 of cash earnings, or $2 for $1?',
        definition:
            'Measures whether a stock is cheap relative to the cash its business actually produces, always judged within the stock’s own sector. Built from cash-based yields — free cash flow, owner earnings and EBIT (earnings for banks and insurers), each against the price. It is one ingredient of the value-gap door.',
        related: ['fcf-yield', 'owner-earnings', 'enterprise-value'],
    },
    'fcf-yield': {
        term: 'Free cash flow (FCF) yield',
        category: 'value',
        plain: 'Cash the business keeps, as a percentage of its price.',
        definition:
            'FCF = operating cash flow − capital expenditure — the real cash a company can spend after keeping its plants and equipment running. FCF yield divides that by market cap. High = the company throws off a lot of cash relative to what you pay. It is one of the four yields in the value factor.',
        related: ['value', 'owner-earnings', 'market-cap'],
    },
    'owner-earnings': {
        term: 'Owner earnings yield',
        category: 'value',
        plain: 'Buffett-style earnings power as a percentage of price.',
        definition:
            'Net income + depreciation & amortization − capital expenditure, divided by market cap. It approximates the cash a true owner could withdraw while keeping the business intact — a more honest “earnings” than the accounting net income alone. One of the four yields in the value factor.',
        related: ['value', 'fcf-yield', 'ebit'],
    },
    ebit: {
        term: 'EBIT',
        category: 'value',
        plain: 'Earnings before interest and tax — operating profit.',
        definition:
            'Earnings Before Interest and Taxes. It isolates how much money the core business makes before financing choices (debt vs equity) and taxes muddy the picture. EBIT yield = EBIT ÷ enterprise value, one of the four value yields.',
        related: ['enterprise-value', 'value', 'roic'],
    },
    'enterprise-value': {
        term: 'Enterprise value (EV)',
        category: 'value',
        plain: 'What you would pay to own the whole company, debt included.',
        definition:
            'EV = market cap + long-term debt − cash. Buying a company means inheriting its debt and getting its cash, so EV is the truer “price” for a business than market cap alone. Used in EBIT yield and several valuation multiples.',
        related: ['market-cap', 'ebit'],
    },
    'earnings-yield': {
        term: 'Earnings yield',
        category: 'value',
        plain: 'Net profit as a percentage of price — the inverse P/E.',
        definition:
            'Net income ÷ market cap. It is the inverse of the price-to-earnings ratio: instead of “years to pay back,” it answers “what % of the price do I get back in profit each year?” It has the broadest data coverage of the four yields, which rescues stocks missing some cash-flow detail.',
        related: ['value', 'fcf-yield'],
    },

    // ── Quality factor ───────────────────────────────────────────────────
    quality: {
        term: 'Quality factor',
        category: 'quality',
        plain: 'Does the company make real money, consistently, with clean books?',
        definition:
            'Measures how reliably a business earns its profits and how honest its accounting is. Combines revenue quality, gross-margin stability over several years, negative accruals (preferring earnings backed by cash, not accounting tricks), and the Piotroski F-score. A profitable business with honest books beats a good story.',
        related: ['roic', 'accruals', 'piotroski'],
    },
    'gross-margin': {
        term: 'Gross margin',
        category: 'quality',
        plain: 'What % of each dollar of sales survives after the cost of goods.',
        definition:
            '(Revenue − cost of goods sold) ÷ revenue. It shows how much pricing power a company has. The quality factor rewards gross margins that stay stable across several fiscal years — volatile margins are a yellow flag that the business is fragile.',
        related: ['quality', 'revenue-quality'],
    },
    'revenue-quality': {
        term: 'Revenue quality',
        category: 'quality',
        plain: 'A reverse-engine score of how trustworthy the revenue is.',
        definition:
            'A score produced by the reverse engine that grades how real and sustainable a company’s reported revenue looks — checking for aggressive recognition, customer concentration, and other patterns that make revenue fragile. A quality input, never additive to the score by itself.',
        related: ['quality', 'forensic'],
    },
    accruals: {
        term: 'Accruals',
        category: 'quality',
        plain: 'Accounting profits not yet backed by actual cash.',
        definition:
            'The gap between reported earnings and the cash actually collected. High accruals mean profits are being booked on paper (invoices, estimates) faster than cash arrives — a classic sign of earnings inflation. The quality factor prefers low or negative accruals, and a high accruals alarm is a forensic flag.',
        related: ['quality', 'forensic', 'beneish'],
    },
    piotroski: {
        term: 'Piotroski F-score',
        category: 'quality',
        plain: 'A 9-point checklist of financial-health signals.',
        definition:
            'A famous score by Joseph Piotroski that checks nine binary signals — profitability, leverage, and operating efficiency — and adds a point for each that is healthy (0–9). Higher is stronger. It comes from the SEC-filed fundamentals battery and feeds the quality factor.',
        related: ['quality', 'fundamentals-battery'],
    },
    beneish: {
        term: 'Beneish M-score',
        category: 'quality',
        plain: 'A statistical detector of likely earnings manipulation.',
        definition:
            'A model that scores how likely a company is to have manipulated its earnings, using eight ratios like days-sales-in-receivables and asset quality. An elevated M-score is a forensic warning. On its own it never removes a stock; a smaller company is removed only when it fires together with high accruals.',
        related: ['forensic', 'accruals', 'veto'],
    },
    forensic: {
        term: 'Forensic warnings',
        category: 'quality',
        plain: 'Yellow and red cards for suspicious accounting or fragile finances.',
        definition:
            'Warning lights from the accounting tests: the Beneish M-score (likely earnings manipulation), accruals (profits not backed by cash), Altman Z (distress) and heavy share issuance. On a company worth $10 billion or more these are warnings only — they never remove a stock. On smaller companies a stock is removed only when two red flags agree. Think of a house with beautiful photos that failed the structural inspection.',
        related: ['beneish', 'accruals', 'veto'],
    },
    roic: {
        term: 'ROIC',
        category: 'quality',
        plain: 'Return on invested capital — how efficiently the company compounds money.',
        definition:
            'NOPAT (operating profit after tax) ÷ invested capital (equity + debt − cash). It answers: for every dollar the company keeps in the business, how much profit does it generate? A company that earns 20% on its capital is compounding 20% a year on reinvested earnings — the engine of long-term wealth.',
        related: ['quality', 'ebit', 'cagr'],
    },
    'fundamentals-battery': {
        term: 'Fundamentals battery',
        category: 'quality',
        plain: 'Ten years of SEC-filed ratios behind the forensic and quality checks.',
        definition:
            'A per-ticker dataset built from SEC Company Facts (10 years of as-filed fundamentals) containing the raw material for Piotroski F, Sloan accruals, a real Beneish M-score, and net issuance — the inputs that replaced the old placeholder scores.',
        related: ['piotroski', 'beneish', 'sec-filings'],
    },

    // ── Momentum factor ──────────────────────────────────────────────────
    momentum: {
        term: 'Momentum factor',
        category: 'momentum',
        plain: 'Has the stock been winning over the past year?',
        definition:
            'Winners tend to keep winning for a while. Momentum combines the 12-1 skip-month return (the academic-standard 12-month return that skips the most recent month) and 52-week-high proximity. It is used by the compounder door, as a falling-knife floor for the value-gap door, and on its own, across the whole market, by the trend-leader door.',
        related: ['skip-month', 'high-proximity', 'door'],
    },
    'skip-month': {
        term: '12-1 skip-month return',
        category: 'momentum',
        plain: 'The 12-month return, excluding the most recent month.',
        definition:
            'The academic standard for measuring momentum: take the return over the last 12 months but skip the most recent month. Skipping the last month avoids short-term reversal — the tendency of last month’s winners to briefly snap back — which would muddy the signal. Monthly closes are used.',
        related: ['momentum', 'reversal'],
    },
    'high-proximity': {
        term: '52-week-high proximity',
        category: 'momentum',
        plain: 'How close the price is to its best level of the past year.',
        definition:
            'Current price ÷ its 52-week high. Prices near their highs have historically been followed by continued strength, while prices far below their highs often keep falling. Combined with the 12-1 return to form the momentum factor.',
        related: ['momentum'],
    },
    reversal: {
        term: 'Short-term reversal',
        category: 'momentum',
        plain: 'Last month’s winners briefly snap back before resuming.',
        definition:
            'A short-horizon quirk where stocks that rose the most in the most recent month tend to give a little back. It is why momentum is measured over 12 months skipping the last month — so the durable trend is captured without the noisy one-month bounce.',
        related: ['skip-month', 'momentum'],
    },
    // ── Risk / low volatility ────────────────────────────────────────────
    volatility: {
        term: 'Volatility (σ)',
        category: 'risk',
        plain: 'How much the price swings — the “wildness” of a stock.',
        definition:
            'The standard deviation of returns. High volatility means the price swings widely in a short time; low volatility means it moves calmly. Sigma (σ) is the Greek letter used as its symbol.',
        related: ['annualized-volatility'],
    },
    'annualized-volatility': {
        term: 'Annualized volatility',
        category: 'risk',
        plain: 'Monthly swing, scaled up to a one-year number.',
        definition:
            'Monthly return volatility multiplied by √12 to express it on a yearly scale (monthly σ × square root of 12 months).',
        related: ['volatility'],
    },

    // ── Revisions factor ─────────────────────────────────────────────────
    revisions: {
        term: 'Revisions factor',
        category: 'revisions',
        plain: 'Are professional analysts raising or cutting their forecasts?',
        definition:
            'Measures the direction of change in analyst expectations. When analysts raise earnings estimates, the stock tends to keep rising; when they cut, it tends to keep falling. It is the smallest ingredient of the compounder door, and a trend leader must not have falling forecasts.',
        related: ['eps', 'estimates', 'eps-trajectory'],
    },
    eps: {
        term: 'EPS',
        category: 'revisions',
        plain: 'Earnings per share — profit allocated to each share.',
        definition:
            'Net income ÷ shares outstanding. The most-watched single number in investing. The revisions factor looks at how the EPS forecast has been moving over time, not just its level.',
        related: ['revisions', 'eps-trajectory'],
    },
    estimates: {
        term: 'Analyst estimates',
        category: 'revisions',
        plain: 'Professional analysts’ forecasts for future earnings.',
        definition:
            'Consensus forecasts published by the sell-side analysts who follow a company. Their revisions — upgrades and downgrades — carry information, which is exactly what the revisions factor harvests.',
        related: ['revisions', 'eps'],
    },
    'eps-trajectory': {
        term: 'EPS trajectory',
        category: 'revisions',
        plain: 'The direction and steepness of the earnings-forecast path.',
        definition:
            'The slope of analysts’ forward earnings forecasts over time — are they climbing, flat, or falling? It makes “improving” and “deteriorating” comparable numbers.',
        related: ['revisions', 'eps'],
    },

    // ── Valuation / DCF ──────────────────────────────────────────────────
    dcf: {
        term: 'Discounted cash flow (DCF)',
        category: 'valuation',
        plain: 'The value of a business = its future cash, discounted to today.',
        definition:
            'The classic valuation framework: estimate all the cash a company will produce in the future, discount it back to today’s money (because a dollar next year is worth less than a dollar now), and add it up. The number you get is the “intrinsic value.”',
        related: ['intrinsic-value', 'present-value', 'cost-of-equity'],
    },
    'reverse-dcf': {
        term: 'Reverse DCF',
        category: 'valuation',
        plain: 'Turn the DCF around: what growth does today’s price assume?',
        definition:
            'Instead of guessing growth to get a value, a reverse DCF solves the math backwards: given the current price, what growth rate does the market already assume? It is computed by bisection — narrowing down until the DCF equals today’s price. The result is the growth the market is charging you for.',
        related: ['dcf', 'implied-growth', 'bisection'],
    },
    'implied-growth': {
        term: 'Implied growth',
        category: 'valuation',
        plain: 'The growth rate the current price silently promises.',
        definition:
            'Every stock price embeds a promise about future growth. The reverse DCF extracts that promise as a number: the growth rate that makes the discounted cash flows equal today’s price. This site compares it against what the company has actually delivered.',
        related: ['reverse-dcf', 'expectations-gap'],
    },
    'expectations-gap': {
        term: 'Expectations gap',
        category: 'valuation',
        plain: 'The growth the price demands minus the growth the company proved.',
        definition:
            'Implied growth (from the reverse DCF) minus demonstrated growth (the last 5 years of actual growth in the company’s cash earnings, from SEC filings), in percentage points. Negative = the price demands LESS than the company has proven — a potential bargain. Positive = the price needs an acceleration nobody has demonstrated — you must believe a story. It is one ingredient of the value-gap door.',
        related: ['implied-growth', 'reverse-dcf', 'demonstrated-growth'],
    },
    'demonstrated-growth': {
        term: 'Demonstrated growth',
        category: 'valuation',
        plain: 'Growth the company has actually delivered, from the filings.',
        definition:
            'The last five years of real growth in the company’s cash earnings, taken from SEC filings (revenue growth is used only when that is not available). It is the ground truth the price’s promise is compared against in the expectations gap.',
        related: ['expectations-gap', 'sec-filings'],
    },
    'intrinsic-value': {
        term: 'Intrinsic value',
        category: 'valuation',
        plain: 'What the business is really worth, independent of its price.',
        definition:
            'An estimate of a company’s true worth based on its future cash-generating ability — the number a DCF produces. The AI analyst produces one in each run; the verdict compares today’s price with the range of those values (the value band), not with a single number.',
        related: ['dcf', 'margin-of-safety', 'iv-band'],
    },
    'margin-of-safety': {
        term: 'Margin of safety',
        category: 'valuation',
        plain: 'The discount you get: how far below estimated value you buy.',
        definition:
            'How much cheaper the price is than the estimated value, in percent. A 30% margin of safety means you pay 70 cents for a dollar of estimated value. A margin that looks implausibly large is itself a warning sign: the gate blocks a verdict whose value is implausibly far above the price.',
        related: ['intrinsic-value', 'gate-reason'],
    },
    'cost-of-equity': {
        term: 'Cost of equity',
        category: 'valuation',
        plain: 'The return shareholders require — the discount rate for equity cash.',
        definition:
            'The minimum annual return investors demand to hold a stock instead of a safer asset. It is the rate used to discount future equity cash flows in the DCF. The screen takes it from the macro engine’s cost-of-capital anchor (roughly 6.6% for utilities up to 12.6% for chip makers) and, if that anchor is missing or stale, falls back loudly to 10% and records that it did.',
        related: ['dcf', 'present-value'],
    },
    'present-value': {
        term: 'Present value / discounting',
        category: 'valuation',
        plain: 'Future money is worth less; discounting converts it to today’s terms.',
        definition:
            'A dollar next year is worth less than a dollar today (you could invest today’s dollar and earn a return). Discounting applies that logic: dividing future cash flows by (1 + discount rate) per year to express them in today’s money before adding them up.',
        related: ['dcf', 'cost-of-equity'],
    },
    bisection: {
        term: 'Bisection',
        category: 'valuation',
        plain: 'A computer’s way of narrowing in on an exact answer.',
        definition:
            'A numerical method that repeatedly halves a range until it converges. The reverse DCF uses bisection to solve for the exact growth rate that makes a DCF equal the current price — too low? raise the guess; too high? lower it; keep halving until the answer is found.',
        related: ['reverse-dcf', 'implied-growth'],
    },

    // ── The AI analyst ─────────────────────────────────────────────────────────
    llm: {
        term: 'LLM (large language model)',
        category: 'ai',
        plain: 'The kind of AI that does the research for the analyst.',
        definition:
            'A large language model is an AI that reads and writes text. The analyst runs one on a local computer, not a cloud service. It reads the filings, does the research and chooses every valuation input. It does not do the arithmetic — Python code does every calculation — and code then checks the answer against outside anchors.',
        related: ['iv-band', 'street-fence', 'actionable'],
    },
    'iv-band': {
        term: 'Value band (IV band)',
        category: 'ai',
        plain: 'The range of values from the analyst’s runs.',
        definition:
            'Each stock is analysed in 2–3 independent runs, and each run ends in an estimate of what the business is worth. The value band is the range from the lowest to the highest of those estimates; the median is the middle one. The verdict is where today’s price sits against the band: below it = undervalued, inside it = fair, above it = overvalued. On the desk the shaded band is the range, the tick is the median and the white line is the price. A wider band means the runs disagreed, which lowers the suggested size.',
        related: ['intrinsic-value', 'actionable', 'position-sizing'],
    },
    'not-usable': {
        term: 'Not usable',
        category: 'ai',
        plain: 'A row where the analyst produced no usable verdict.',
        definition:
            'When the verdict step malfunctions, the row is marked not usable instead of being given a guess. It has no direction, is never shown as a pick, and sits under Vetoed on the AI side of the desk.',
        related: ['actionable', 'iv-band'],
    },
    actionable: {
        term: 'Actionable',
        category: 'ai',
        plain: 'A verdict that passed every rule of the gate.',
        definition:
            'Every AI verdict carries a yes/no flag called actionable, plus the list of reasons when the answer is no. Only an actionable verdict can appear under Research now or Watchlist on the AI side, or be followed by the AI paper book. A verdict that is not actionable is not deleted: it stays visible, marked as blocked.',
        related: ['gate-reason', 'street-fence', 'rn-depth'],
    },
    'gate-reason': {
        term: 'Gate reason',
        category: 'ai',
        plain: 'The plain-words reason a verdict was blocked.',
        definition:
            'When a verdict is blocked, the desk says why — for example “made by the old analyst” or “runs disagree too much”. A verdict can have more than one reason. The full list is in the gate section of this handbook.',
        related: ['actionable', 'street-fence'],
    },
    'street-fence': {
        term: 'Street fence',
        category: 'ai',
        plain: 'The analysts’ price-target range, used as an outside check.',
        definition:
            'The Street means the professional analysts who follow a company. The street fence is the range of their price targets. Code checks the AI analyst’s answer against it: a value outside the fence is blocked, a verdict with no fence to check against is blocked, and so is one whose value is implausibly far above the price. It is an outside check on the analyst’s own work.',
        related: ['actionable', 'gate-reason', 'estimates'],
    },
    'thesis-status': {
        term: 'Thesis status',
        category: 'ai',
        plain: 'Whether the reasons behind a verdict still hold.',
        definition:
            'Each new-analyst verdict states its own invalidation rules — things that, if they happen, mean the thesis is broken. A monitor re-checks those rules against current data. Intact = rules were checked and none fired; breached = at least one fired; unknown = none could be checked. A breached thesis is flagged. This arrives with the relaunch of the analyst.',
        related: ['actionable', 'position-basis'],
    },
    'position-basis': {
        term: 'Position basis',
        category: 'ai',
        plain: 'Whether a stock is held for its value or for its momentum.',
        definition:
            'A verdict can carry a basis. Value basis: the case rests on the price being below the value band. Momentum basis: the analyst’s value is below the price, but the stock is in a strong uptrend that its fundamentals back up, so it may be held — at half or quarter size — instead of sold. None: no position is suggested. This arrives with the relaunch of the analyst.',
        related: ['position-sizing', 'thesis-status'],
    },

    // ── Bands & vetoes ───────────────────────────────────────────────────
    band: {
        term: 'Band',
        category: 'bands',
        plain: 'A bucket that translates the rank into an action.',
        definition:
            'The screen puts every stock in one of four bands: RESEARCH NOW (the top of the shortlist), WATCHLIST (the rest of the shortlist), PASS (scored, but not shortlisted) and VETOED (removed by a safety filter). Bands come from a stock’s rank, not from fixed percentage cut-offs, and a name already on the shortlist stays until it falls clearly out.',
        related: ['research-now', 'watchlist', 'hysteresis'],
    },
    'research-now': {
        term: 'Research now',
        category: 'bands',
        plain: 'The top of the shortlist — worth your research time today.',
        definition:
            'The highest band: roughly the top 50 to 60 names by priority, including a few trend leaders. It is a research shortlist, never a buy order. On the AI side of the desk a name appears under Research now only when its AI verdict says undervalued and passes the gate.',
        related: ['band', 'watchlist', 'actionable'],
    },
    watchlist: {
        term: 'Watchlist',
        category: 'bands',
        plain: 'The rest of the shortlist — strong evidence, worth watching.',
        definition:
            'The second band: the part of the shortlist below Research now (the whole shortlist holds roughly 150 names). Stocks here are worth watching and often move up. On the AI side of the desk, a name appears under Watchlist when its AI verdict is fair or overvalued and passes the gate.',
        related: ['band', 'research-now'],
    },
    pass: {
        term: 'Pass',
        category: 'bands',
        plain: 'Scored, but not on the shortlist.',
        definition:
            'The default band for the stocks that were scored but did not earn a shortlist place. Not a “bad company” verdict — just not enough evidence to earn your attention today.',
        related: ['band'],
    },
    veto: {
        term: 'Veto',
        category: 'bands',
        plain: 'A stock removed by a safety filter, no matter how good it looks.',
        definition:
            'A hard disqualifier. A vetoed stock gets no band and is not analysed. Reasons include: the stock cannot be traded (delisted or halted), it is too small or too thinly traded, it has no usable filed fundamentals, it is a shell company, or — only for companies worth under $10 billion — it has chronic operating losses with heavy debt, or two forensic red flags agree. Larger companies get a warning instead. The reason is written on the red chip.',
        related: ['forensic', 'beneish', 'dilution'],
    },
    door: {
        term: 'Door',
        category: 'bands',
        plain: 'One of three ways a stock can earn a place on the shortlist.',
        definition:
            'The screen does not blend everything into one score. A company can earn attention by being excellent, by being mispriced, or by being in a strong steady uptrend — so there are three doors. Door 1, the compounder door, rewards quality, momentum and rising analyst forecasts. Door 2, the value-gap door, rewards cheapness and a price that asks for less growth than the company has delivered. Door 3, the trend-leader door, adds up to 20 extra places for strong, steady uptrends. A stock needs to clear only one door.',
        related: ['champion', 'sector-quota', 'hysteresis'],
    },
    champion: {
        term: 'Champion',
        category: 'bands',
        plain: 'A stock that is top-tier on both of the first two doors.',
        definition:
            'A stock in the top 10% on both the compounder door and the value-gap door. Being both excellent and cheap is rare, so a champion gets a small bonus (+2) when the shortlist is put in order. A stock in steep decline cannot be a champion.',
        related: ['door', 'composite'],
    },
    hysteresis: {
        term: 'Hysteresis (sticky shortlist)',
        category: 'bands',
        plain: 'A name already on the shortlist stays until it falls clearly out.',
        definition:
            'Without a buffer, a stock sitting right at the cut line would hop in and out of the shortlist with every small price move. So a name already in Research now stays there while its rank is 60 or better, and a name already on the shortlist stays on it while its rank is 150 or better. Only a clear fall removes it. The shortlist changes less, so it is easier to follow.',
        related: ['band', 'research-now', 'watchlist'],
    },
    'sector-quota': {
        term: 'Sector quota',
        category: 'bands',
        plain: 'How many shortlist places each sector gets.',
        definition:
            'The shortlist is spread across sectors so no one industry crowds out the rest. Every sector gets the same base quota. The macro engine could in principle give more places to the sectors that suit the economy — a “tilt” — but its sector picking has not proved itself, so the tilt is switched off and every sector gets the same quota until it does.',
        related: ['door', 'probability-vector'],
    },
    // ── Portfolio & sizing ───────────────────────────────────────────────
    'position-sizing': {
        term: 'Position sizing',
        category: 'portfolio',
        plain: 'Deciding how much of your capital goes into each stock.',
        definition:
            'The math that turns a shortlist into a portfolio. This site does not give you a portfolio plan. What it does give is a size hint on an AI verdict — quarter, half or full — read off how wide the value band is: the more the runs disagreed, the smaller the suggested size.',
        related: ['iv-band', 'position-basis'],
    },
    'paper-trading': {
        term: 'Paper trading',
        category: 'track',
        plain: 'Trading with rules but no real money — recorded for real.',
        definition:
            'The system pretends to buy and sell its own picks every day using real prices and real transaction costs, and keeps the record. It is the honest meter: if the system is wrong, the Track Record page will say so.',
        related: ['transaction-costs', 'out-of-sample', 'track-record'],
    },
    unitization: {
        term: 'Unitization',
        category: 'track',
        plain: 'Treating a portfolio like a fund so deposits don’t fake returns.',
        definition:
            'The “mine” ledger is unitized like a mutual fund: adding or removing money changes the number of units, never the unit price. This prevents deposits from inflating returns. It is how your real holdings are measured fairly against the model portfolios.',
        related: ['track-record', 'mine'],
    },
    'behavior-gap': {
        term: 'Behavior gap',
        category: 'track',
        plain: 'The return you lose by deviating from the system.',
        definition:
            'The difference between what the disciplined system earns and what you actually earn, caused by your own decisions — selling too early, chasing, ignoring exits. On Track Record, the Mine book lagging the Equal-weight book is the behavior gap, measured in public.',
        related: ['track-record', 'unitization'],
    },
    'transaction-costs': {
        term: 'Transaction costs (bps)',
        category: 'track',
        plain: 'The real frictions of trading, measured in basis points.',
        definition:
            'The commissions and slippage applied to every paper trade. A basis point (bp) is 1/100th of a percent. The ledgers are traded with real costs (shown as “Xbps per trade”) so the record is honest about the drag of trading. A what-if overlay lets you re-cost every trade at your own rate.',
        related: ['paper-trading', 'track-record'],
    },
    'sharpe-ratio': {
        term: 'Sharpe ratio',
        category: 'track',
        plain: 'Return per unit of risk — how much pain each point of gain cost.',
        definition:
            'Excess return divided by volatility. It measures reward relative to risk: a higher Sharpe means the strategy earned its return with less violent ups and downs. It only appears on the Track Record page once enough days of live data have accumulated.',
        related: ['volatility', 'track-record'],
    },
    cagr: {
        term: 'CAGR',
        category: 'track',
        plain: 'The smoothed annual growth rate of the portfolio.',
        definition:
            'Compound Annual Growth Rate — the single annual percentage that would take the starting value to the ending value over the whole period, as if growth were perfectly smooth. It lets you compare portfolios on an apples-to-apples yearly basis.',
        related: ['track-record', 'roic'],
    },
    drawdown: {
        term: 'Drawdown',
        category: 'track',
        plain: 'How far the portfolio falls from its peak.',
        definition:
            'The decline from a portfolio’s all-time high to its lowest subsequent point, in percent. A 30% drawdown means the portfolio lost 30% of its peak value at the worst point. It is the “pain” side of the risk equation.',
        related: ['volatility', 'sharpe-ratio'],
    },
    alpha: {
        term: 'Alpha / excess return',
        category: 'track',
        plain: 'Return above what the market or benchmark delivered.',
        definition:
            'The performance of a portfolio beyond its benchmark (like IWM or SPY), after costs. Positive alpha means the stock-picking or sizing added value; negative means the machine (or your deviations) cost you relative to just owning the index.',
        related: ['benchmark', 'iwm', 'spy'],
    },
    benchmark: {
        term: 'Benchmark',
        category: 'track',
        plain: 'The index you compare the portfolios against.',
        definition:
            'A reference portfolio — typically a broad index — used to judge whether the machine is adding value. This system benchmarks against IWM (Russell 2000 small-cap, its closest universe) and SPY (S&P 500). You can toggle which appear on the NAV chart.',
        related: ['iwm', 'spy', 'alpha'],
    },
    iwm: {
        term: 'IWM',
        category: 'track',
        plain: 'The iShares Russell 2000 ETF — small-cap US stocks.',
        definition:
            'The most common exchange-traded proxy for the Russell 2000 small-cap index. Because the system screens small and mid caps, IWM is the most relevant benchmark to beat.',
        related: ['benchmark', 'spy'],
    },
    spy: {
        term: 'SPY',
        category: 'track',
        plain: 'The SPDR S&P 500 ETF — the broad US large-cap market.',
        definition:
            'An exchange-traded fund that tracks the S&P 500, the standard barometer of the overall US stock market. Used as the second benchmark on the Track Record NAV chart.',
        related: ['benchmark', 'iwm'],
    },
    'track-record': {
        term: 'Track Record',
        category: 'track',
        plain: 'The scoreboard of the system’s own paper books.',
        definition:
            'A tab that paper-trades three books every day with real prices and transaction costs: Equal-weight, the AI book and Mine. Instead of a flattering backtest, it is a record of what the system actually did — including its mistakes.',
        related: ['paper-trading', 'behavior-gap', 'alpha'],
    },
    'rn-depth': {
        term: 'AI book (rn_depth)',
        category: 'track',
        plain: 'The paper book that follows the AI analyst’s passing verdicts.',
        definition:
            'One of the three paper books. It holds equal amounts of every shortlisted name whose AI verdict is undervalued and passes the gate. When no verdict passes, it holds only cash — which has been the case since 2026-09-24. Its history so far comes from the old analyst, which was ruled invalid, so the AI record restarts from zero when the new analyst goes live and the old history is archived.',
        related: ['actionable', 'track-record', 'paper-trading'],
    },

    // ── Data & pipeline ──────────────────────────────────────────────────
    'sec-filings': {
        term: 'SEC filings',
        category: 'data',
        plain: 'The official financial reports public companies must file.',
        definition:
            'The regulatory filings (10-K, 10-Q, and the structured Company Facts feed) that publicly traded US companies must submit to the SEC. They are the ground truth for fundamentals — 10 years of as-filed data feed the quality, forensic, and demonstrated-growth inputs.',
        related: ['company-facts', 'as-filed', 'demonstrated-growth'],
    },
    'company-facts': {
        term: 'SEC Company Facts',
        category: 'data',
        plain: 'SEC’s machine-readable feed of every filed fundamental.',
        definition:
            'The SEC’s structured, machine-readable dataset of as-filed financial facts for every US filer. The pipeline uses it to build the 10-year fundamentals battery (Piotroski F, Sloan accruals, real Beneish M, net issuance) that replaced placeholder scores.',
        related: ['sec-filings', 'fundamentals-battery', 'as-filed'],
    },
    'as-filed': {
        term: 'As-filed',
        category: 'data',
        plain: 'Exactly what the company reported at the time — before restatements.',
        definition:
            'Data exactly as the company originally reported it, dated at the moment of filing. This is what makes point-in-time analysis possible: you can know what the numbers looked like on any given day, not what they were later revised to.',
        related: ['point-in-time', 'sec-filings', 'company-facts'],
    },
    ttm: {
        term: 'TTM',
        category: 'data',
        plain: 'Trailing twelve months — the most recent full year of data.',
        definition:
            'The sum of the latest four quarters, giving a rolling one-year window that is always current (as opposed to a fiscal year that ends months ago). Used for revenue, margins, and growth throughout the data pipeline.',
        related: ['sec-filings'],
    },
    'yahoo-finance': {
        term: 'Yahoo Finance',
        category: 'data',
        plain: 'The source of prices, estimates, and analyst coverage.',
        definition:
            'A major financial data provider used by the pipeline for live prices, price history, analyst estimates, and coverage metadata. Combined with SEC fundamentals for the full picture.',
        related: ['fred', 'sec-filings'],
    },
    fred: {
        term: 'FRED',
        category: 'data',
        plain: 'The Federal Reserve’s public economic data service.',
        definition:
            'The Federal Reserve Bank of St. Louis’s free database of US economic series. It is the only source of numbers for the macro engine’s probabilities and shock alarms. News is used as context only, never as a number.',
        related: ['probability-vector', 'shock-register'],
    },
    'probability-vector': {
        term: 'Probability vector',
        category: 'data',
        plain: 'A probability for each economic “season”, adding up to 100%.',
        definition:
            'The macro engine does not just name the current economic season. It publishes a probability for each of five seasons: goldilocks, reflation, tightening, stagflation and recession. These probabilities are the main output. The single season label is only a summary, and it drives no number.',
        related: ['shock-register', 'fred', 'sector-quota'],
    },
    'shock-register': {
        term: 'Shock register',
        category: 'data',
        plain: 'Seven alarms that watch for sudden economic stress.',
        definition:
            'Seven alarms: fear (market volatility), credit, interest rates, oil, the dollar, jobs and inflation. Each is read from FRED data only. Beside them is a turbulence-risk flag that turns on when the fear index (the VIX) is 30 or higher.',
        related: ['probability-vector', 'fred'],
    },
    'github-actions': {
        term: 'GitHub Actions',
        category: 'data',
        plain: 'The cloud automation that re-runs the data pipeline on a schedule.',
        definition:
            'A CI/CD service that automatically runs the data fetch, the scoring chain and the paper-trading books on a schedule. The AI analyst runs separately, on a local computer.',
        related: ['pipeline'],
    },
    pipeline: {
        term: 'Pipeline',
        category: 'data',
        plain: 'The ordered chain of steps from raw data to a graded record.',
        definition:
            'The end-to-end process: fetch filings, prices and macro data → safety filters → the three-door screen → bands → the AI analyst (when it is running) → the gate → publish to the site → paper books → grading. The scoring part runs in a fixed order with integrity checks, so stale or partial data cannot quietly corrupt the shortlist.',
        related: ['github-actions', 'reverse-engine'],
    },
    'reverse-engine': {
        term: 'Reverse engine',
        category: 'data',
        plain: 'An earlier safety and quality screen whose scores feed the doors.',
        definition:
            'The scoring stage that classifies each business type (its archetype), scores how well the company would survive a downturn and how reliable its data is, and builds the reverse-DCF numbers. Its quality and survivability scores reach the screen as inputs, not as a gate.',
        related: ['pipeline', 'reverse-dcf', 'forensic'],
    },

    // ── Overlays & forensics ─────────────────────────────────────────────
    gpr: {
        term: 'GPR (geopolitical exposure)',
        category: 'overlay',
        plain: 'A 0–3 tag for how exposed a company is to geopolitics.',
        definition:
            'Geopolitical risk tagged from the company’s actual business profile — revenue geography, supply chains, regulation, sanctions. Shown as a context chip. Never a buy/sell signal and never part of the shortlist ranking.',
        related: ['overlay'],
    },
    insiders: {
        term: 'Insider buying / selling',
        category: 'overlay',
        plain: 'What the people running the company are doing with their own shares.',
        definition:
            'Legal trades by executives and directors in their own company’s stock. ▲ INSIDERS = insiders net-buying while short sellers retreat (a confirming signal). ▼ INSIDERS = insiders selling into elevated or rising short interest (a reason to interrogate the thesis). Confirmation or warning only — never additive to the score.',
        related: ['short-interest', 'informed-demand'],
    },
    'short-interest': {
        term: 'Short interest',
        category: 'overlay',
        plain: 'How much of the stock is borrowed and sold by bears.',
        definition:
            'The quantity of shares sold short — borrowed and sold by investors betting the price will fall — relative to the float. High or rising short interest alongside insider selling is the ▼ warning pattern.',
        related: ['insiders', 'float'],
    },
    'informed-demand': {
        term: 'Informed demand',
        category: 'overlay',
        plain: 'A combined read of insiders and shorts, one of the site’s overlays.',
        definition:
            'A synthesized signal: positive when insiders are net-buying without rising short interest; negative when insiders are selling into elevated/rising short interest. Shown as the ▲/▼ INSIDERS chips. It is context for your thesis, never an additive score component.',
        related: ['insiders', 'short-interest', 'overlay'],
    },
    dilution: {
        term: 'Share dilution / issuance',
        category: 'overlay',
        plain: 'The company printing new shares, which shrinks your ownership slice.',
        definition:
            'When a company issues new shares, each existing share represents a smaller slice of the pie. Heavy issuance is shown as a forensic warning.',
        related: ['forensic', 'veto'],
    },
    float: {
        term: 'Float',
        category: 'overlay',
        plain: 'The shares actually available to trade in the market.',
        definition:
            'Shares outstanding minus shares locked up by insiders and institutions. Small floats can amplify price swings and short squeezes. It is one of the classic 100-bagger screening inputs.',
        related: ['market-cap', 'short-interest'],
    },
    overlay: {
        term: 'Overlay',
        category: 'overlay',
        plain: 'Extra context tags layered on top of the ranking.',
        definition:
            'Non-scoring signals shown as chips: GPR (geopolitical exposure) and ▲/▼ INSIDERS (informed demand). They never change the ranking — they are context for your own thinking.',
        related: ['gpr', 'informed-demand'],
    },
    theme: {
        term: 'Theme',
        category: 'overlay',
        plain: 'A hype category (AI, biotech…) — context, never a scoring factor.',
        definition:
            'A market narrative a stock belongs to (e.g., AI, semiconductor, biotech). Theme membership rides along for orientation, but never adds to the score — naive theme exposure has historically destroyed value (specialized theme ETFs average −3.1%/yr).',
        related: ['overlay'],
    },

    // ── Misc / frequently seen ───────────────────────────────────────────
    ticker: {
        term: 'Ticker',
        category: 'core',
        plain: 'The stock’s trading symbol — e.g., AAPL.',
        definition:
            'The short exchange symbol used to identify and trade a stock (like AAPL for Apple or TSM for TSMC). It is the primary key of every row in the leaderboard.',
        related: ['market-cap'],
    },
    'analyst-coverage': {
        term: 'Analyst coverage',
        category: 'revisions',
        plain: 'How many professional analysts follow the company.',
        definition:
            'The number of sell-side analysts publishing estimates on a stock. More coverage means more forecast revisions for the revisions factor to read; thin coverage means less signal. Coverage data comes from Yahoo Finance.',
        related: ['estimates', 'revisions', 'yahoo-finance'],
    },
};

export const CATEGORY_ORDER: GlossaryCategory[] = [
    'core', 'bands', 'value', 'quality', 'momentum', 'risk', 'revisions',
    'valuation', 'ai', 'portfolio', 'track', 'overlay', 'data',
];

/** Resolve a term key safely (graceful when the key does not exist). */
export function lookupTerm(key: string): TermDef | undefined {
    return GLOSSARY[key];
}
