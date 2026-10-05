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

// Tailwind classes per category, used by the popup badge and glossary chips. One neutral style
// for every category: on the light desk a colour means one thing, and a category is not a colour.
const NEUTRAL_CATEGORY = 'border-rule-24 bg-transparent text-ink-2';
export const CATEGORY_STYLES: Record<GlossaryCategory, string> = {
    core: NEUTRAL_CATEGORY,
    value: NEUTRAL_CATEGORY,
    quality: NEUTRAL_CATEGORY,
    momentum: NEUTRAL_CATEGORY,
    risk: NEUTRAL_CATEGORY,
    revisions: NEUTRAL_CATEGORY,
    valuation: NEUTRAL_CATEGORY,
    ai: NEUTRAL_CATEGORY,
    portfolio: NEUTRAL_CATEGORY,
    track: NEUTRAL_CATEGORY,
    data: NEUTRAL_CATEGORY,
    overlay: NEUTRAL_CATEGORY,
    bands: NEUTRAL_CATEGORY,
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
        plain: 'The range of values from the analyst’s independent runs.',
        definition:
            'The analyst values each stock in independent runs, and each usable run ends in an estimate of what the business is worth. The value band (also called the plausible-value range) runs from the lowest to the highest of those estimates; the median is the middle one. The verdict is where today’s price sits against the whole band: below it, with enough margin = undervalued; inside it = fair; above it, with enough margin = overvalued. How many runs a band rests on is printed on each row (“n of m usable”), never assumed, and with one run the band is a single point. On the desk the shaded band is the range and the dark tick is today’s price. A wider band means the runs disagreed, which lowers the size hint.',
        related: ['intrinsic-value', 'actionable', 'position-sizing'],
    },
    'not-usable': {
        term: 'Not usable',
        category: 'ai',
        plain: 'A row where the analyst produced no usable verdict.',
        definition:
            'When the verdict step malfunctions — there is no complete, parseable valuation — the row is marked not usable instead of being given a guess. It has no direction and is never shown as a pick. On the desk it sits under Blocked by the gate, so it stays visible as a record.',
        related: ['actionable', 'iv-band'],
    },
    actionable: {
        term: 'Actionable',
        category: 'ai',
        plain: 'A verdict that passed every rule of the gate.',
        definition:
            'Every verdict carries a yes/no flag called actionable, plus the list of reasons when the answer is no. Only an actionable verdict can appear under Research now, Waiting or No edge today on the desk, or be followed by the AI paper book. A verdict that is not actionable is not deleted: it stays visible under Blocked by the gate. Actionable means a verdict is allowed to count. It does not mean the verdict is right.',
        related: ['gate', 'blocked', 'gate-reason', 'rn-depth'],
    },
    'gate-reason': {
        term: 'Gate reason',
        category: 'ai',
        plain: 'The plain-words reason a verdict was blocked.',
        definition:
            'When a verdict is blocked, the desk says why — for example “made by the old analyst” or “runs disagree too much”. A verdict can have more than one reason. The full list is in the gate section of this handbook, built from the same wording the desk uses.',
        related: ['gate', 'actionable', 'street-fence'],
    },
    'street-fence': {
        term: 'Street range (street fence)',
        category: 'ai',
        plain: 'The analysts’ price-target range, used as an outside check.',
        definition:
            'The Street means the professional analysts who follow a company. The Street range — called the street fence in the data — is the range of their price targets. It is a sanity check, not an input to the valuation. Code checks the AI analyst’s answer against it: a value outside the range is blocked, a verdict with no range to check against is blocked, and so is one whose value is implausibly far above the price. On the stock page it is drawn as a bar above the value band.',
        related: ['actionable', 'gate-reason', 'estimates'],
    },
    'thesis-status': {
        term: 'Thesis status (intact / breached / unknown)',
        category: 'ai',
        plain: 'Whether the written “what would prove me wrong” conditions still hold.',
        definition:
            'Each rebuilt-analyst verdict states its own invalidation rules in advance: checkable conditions that, if they happen, mean the thesis is broken. The stock page lists each rule with its threshold, its window and its current value. Intact = the rules were checked and none has fired; breached = at least one has; unknown = none could be checked. The daily follow-up re-checks the rules; it is built but not live yet, so until it is, a thesis may read unknown.',
        related: ['follow-up', 'actionable'],
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
            'The highest band: roughly the top 50 to 60 names by priority, including a few trend leaders. It is a research shortlist, never a buy order. The desk section of the same name is narrower: a name appears under Research now only when the analyst’s verdict says undervalued, passes the gate and is not held back.',
        related: ['band', 'watchlist', 'actionable'],
    },
    watchlist: {
        term: 'Watchlist',
        category: 'bands',
        plain: 'The rest of the shortlist — strong evidence, worth watching.',
        definition:
            'The second band: the part of the shortlist below Research now (the whole shortlist holds roughly 150 names). Stocks here are worth watching and often move up. This is the screen’s own band name. It is not a verdict and not a desk section: on the desk, a name whose verdict is fair or overvalued and passes the gate sits under No edge today.',
        related: ['band', 'research-now', 'no-edge'],
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
            'A hard disqualifier. A vetoed stock gets no band and is not analysed. Reasons include: the stock cannot be traded (delisted or halted), it is too small or too thinly traded, it has no usable filed fundamentals, it is a shell company, or — only for companies worth under $10 billion — it has chronic operating losses with heavy debt, or two forensic red flags agree. Larger companies get a warning instead. On the desk a vetoed name sits under Disqualified with its reason written beside it.',
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
            'This site does not give you a portfolio plan. What it gives is a size hint on a verdict — quarter, half or full — set by the most conservative of four buckets: how much the runs disagree, the margin of safety, the analyst’s own conviction, and the macro turbulence flag. A single run is capped at quarter. The stock page also prints an upper bound (a quarter-Kelly cap), which is a ceiling and not a suggestion. The older Kelly-sized plan books were retired.',
        related: ['iv-band', 'entry-timing'],
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
        related: ['track-record', 'behavior-gap'],
    },
    'behavior-gap': {
        term: 'Behavior gap',
        category: 'track',
        plain: 'The return you lose by deviating from the system.',
        definition:
            'The difference between what the disciplined system earns and what you actually earn, caused by your own decisions — selling too early, chasing, ignoring exits. On the track record page, My book lagging the control book is the behavior gap, measured in public.',
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
            'Excess return divided by volatility. It measures reward relative to risk: a higher Sharpe means the strategy earned its return with less violent ups and downs. The track record page hides it until there are enough observations, because on a few weeks of data it is noise.',
        related: ['volatility', 'observations'],
    },
    cagr: {
        term: 'CAGR',
        category: 'track',
        plain: 'The smoothed annual growth rate of the portfolio.',
        definition:
            'Compound Annual Growth Rate — the single annual percentage that would take the starting value to the ending value over the whole period, as if growth were perfectly smooth. It lets you compare portfolios on a yearly basis. The track record page hides it while the record is too short for an annualised number to mean anything.',
        related: ['observations', 'roic'],
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
            'The performance of a portfolio beyond its benchmark (like QQQ or SPY), after costs. Positive alpha means the stock-picking or sizing added value; negative means the machine (or your deviations) cost you relative to just owning the index.',
        related: ['benchmark', 'iwm', 'spy'],
    },
    benchmark: {
        term: 'Benchmark',
        category: 'track',
        plain: 'The index you compare the portfolios against.',
        definition:
            'A reference portfolio — typically a broad index — used to judge whether the machine is adding value. The paper books are benchmarked against QQQ (Nasdaq-100). SPY (S&P 500) and IWM (Russell 2000 small-cap) are also on the NAV chart, and verdict grading still reports IWM, SPY and QQQ. You can toggle which appear on the NAV chart.',
        related: ['qqq', 'spy', 'iwm', 'alpha'],
    },
    qqq: {
        term: 'QQQ',
        category: 'track',
        plain: 'The Invesco QQQ ETF — the Nasdaq-100.',
        definition:
            'An exchange-traded proxy for the Nasdaq-100, the large technology-heavy index. It is the benchmark the paper books are judged against, so a book that trails QQQ has not beaten simply owning the index.',
        related: ['benchmark', 'spy', 'iwm'],
    },
    iwm: {
        term: 'IWM',
        category: 'track',
        plain: 'The iShares Russell 2000 ETF — small-cap US stocks.',
        definition:
            'The most common exchange-traded proxy for the Russell 2000 small-cap index. Because the system screens small and mid caps, it stays on the chart as a second reference; the paper books are judged against QQQ.',
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
        term: 'Track record',
        category: 'track',
        plain: 'The scoreboard of the system’s own paper books.',
        definition:
            'A page that paper-trades three books every day with real prices and assumed transaction costs — the AI book, the control book and My book — and grades every verdict on a scoreboard. Instead of a flattering backtest, it is a record of what the system actually did, including its mistakes. It is a paper record over a short period, and not yet proof of anything.',
        related: ['paper-trading', 'control-book', 'behavior-gap', 'not-yet-proven'],
    },
    'rn-depth': {
        term: 'AI book (rn_depth)',
        category: 'track',
        plain: 'The paper book that follows the AI analyst’s passing verdicts.',
        definition:
            'One of the three paper books. It holds equal amounts of every name on the list whose verdict is undervalued and passes the gate — and, once the daily follow-up is live, whose buying is not paused and whose entry timing says buy now. When no verdict passes, it holds only cash. Its history so far comes from the old analyst, which was ruled invalid, so the AI record restarts from zero when the rebuilt analyst goes live and the old history is archived (see Record reset).',
        related: ['actionable', 'track-record', 'record-reset', 'control-book'],
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
            'The end-to-end chain: the macro backdrop → the screener (safety filters, three doors, bands) → the AI analyst → the gate → the daily follow-up (built, not live yet) → grading and the paper books. Each step hands the next only a data file. The scoring part runs in a fixed order with integrity checks, so stale or partial data cannot quietly corrupt the list.',
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

    // ── Misc / frequently seen ───────────────────────────────────────────
    ticker: {
        term: 'Ticker',
        category: 'core',
        plain: 'The stock’s trading symbol — e.g., AAPL.',
        definition:
            'The short exchange symbol used to identify and trade a stock (like AAPL for Apple or TSM for TSMC). It is the key of every row on the desk.',
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

    // ── Stockpeak v3 handbook (step 4b) ─────────────────────────────────
    crux: {
        term: 'The crux',
        category: 'ai',
        plain: 'The one input the price gets wrong, according to the analyst.',
        definition:
            'A buy or sell call has to name the single valuation input that today’s price gets wrong — for example growth in years 3–5 — with the value the price implies, the analyst’s own value, and quotes from the company’s filings that support it. Code checks every quote against the named source. A call that cannot name a valid crux is held at FAIR. The crux explains a verdict; it does not predict anything.',
        related: ['price-implied', 'gate', 'iv-band'],
    },
    'price-implied': {
        term: 'What the price implies',
        category: 'valuation',
        plain: 'The value of an input that would justify today’s price on its own.',
        definition:
            'Take one input of the valuation — say, growth in years 3–5 — and ask what value it would need to have for the model to land exactly on today’s price. That is what the price implies for that input. The crux sets it beside the analyst’s own value. If no value of an input, on its own, can explain the price, the stock page says so.',
        related: ['crux', 'reverse-dcf', 'implied-growth'],
    },
    gate: {
        term: 'The gate',
        category: 'ai',
        plain: 'The automatic check that decides whether a verdict may count.',
        definition:
            'After a verdict is written, code re-judges it every time the data are rebuilt and marks it actionable (yes or no), with reasons. A verdict that fails is still published and shown — marked blocked, with its reasons — but it can never be a recommendation and never enters the AI paper book. Passing the gate means a verdict is allowed to count. It does not prove the verdict is right.',
        related: ['actionable', 'blocked', 'gate-reason'],
    },
    blocked: {
        term: 'Blocked',
        category: 'ai',
        plain: 'A verdict that failed the gate: kept for the record, never a recommendation.',
        definition:
            'Blocked is the opposite of actionable. A blocked verdict is shown in grey with its reasons in plain words, under “Blocked by the gate”. It is never styled like a pick, never counted as one, and never bought by the AI book. Blocked does not mean wrong; it means the system will not stand behind it.',
        related: ['actionable', 'gate', 'gate-reason'],
    },
    waiting: {
        term: 'Waiting',
        category: 'ai',
        plain: 'Cheap on value, but held back for now.',
        definition:
            'A desk section for names that pass the gate and are undervalued but are held back: by timing (the analyst says wait for momentum, or avoid), by buying being paused while something is pending, or by follow-up data that is stale. The reason is shown on the row. Waiting is not a sell. The section fills in once the daily follow-up is live.',
        related: ['buy-paused', 'entry-timing', 'follow-up'],
    },
    'no-edge': {
        term: 'No edge today',
        category: 'ai',
        plain: 'A verdict that passes the gate but finds no gap between price and value.',
        definition:
            'The desk section for names whose verdict passes the gate and is FAIR (the price sits inside the value band, or the margin is too thin) or overvalued. FAIR is a real answer — the uncertainty contains the price — not a refusal and not a sell signal. It is separate from the screen’s watchlist band.',
        related: ['iv-band', 'watchlist', 'actionable'],
    },
    'buy-paused': {
        term: 'Buy paused',
        category: 'ai',
        plain: 'New buying is on hold while something is pending. Never a sell.',
        definition:
            'Set by the daily follow-up while a break condition, a floor event, a re-analysis or an “avoid” timing call is pending against a verdict. If the follow-up data is older than 36 hours or missing, the name is treated as paused, never as buyable. Buy paused never means sell: a held name is removed only by a new verdict. The follow-up is built but not live yet.',
        related: ['follow-up', 'waiting', 'reanalysis-queued'],
    },
    'follow-up': {
        term: 'Follow-up / What we’re watching',
        category: 'ai',
        plain: 'The daily check of each held or candidate name against its own watch-list.',
        definition:
            'Every verdict ends with a watch-list of conditions to look for. Each day the follow-up checks every held name and every buy candidate against new filings, news and the value band. It decides only one thing: re-analyse now, or nothing new. It never sells and never changes a verdict itself. “What we’re watching” on the stock page lists the watch items with their evidence. The follow-up is built and in acceptance testing, but not live yet.',
        related: ['code-floor', 'reanalysis-queued', 'buy-paused', 'thesis-status'],
    },
    'code-floor': {
        term: 'Code floor',
        category: 'ai',
        plain: 'Exact signals that always queue a re-analysis, whatever any model says.',
        definition:
            'A fixed list the follow-up applies in code, apart from the local model: an earnings release; a filing of the bankruptcy, restatement, delisting or change-of-control kind; a thesis rule that has just become true; a safety-filter veto appearing on a held name; and two closes on the far side of the value band. Any one of them queues a re-analysis.',
        related: ['follow-up', 'reanalysis-queued'],
    },
    'reanalysis-queued': {
        term: 'Re-analysis queued',
        category: 'ai',
        plain: 'Something has moved this name to the front of the analyst’s queue.',
        definition:
            'An event — an earnings release, a filing, the price leaving the value band, a thesis rule tripping — has pushed the name to the front of the analyst’s queue. The existing verdict stays in place until a new one replaces it. Every name is also re-analysed at least every 14 days regardless. Re-analysis queued is never a sell signal.',
        related: ['follow-up', 'code-floor', 'buy-paused'],
    },
    'held-carry': {
        term: 'Held — verdict being re-checked',
        category: 'ai',
        plain: 'A held name whose newest verdict failed to process, kept on its last good one.',
        definition:
            'If a re-analysis of a name the AI book holds fails to produce a usable verdict, the last good verdict is carried — for at most two failures or 21 days. The desk labels such a name “held — verdict being re-checked”. After that the carry ends.',
        related: ['follow-up', 'rn-depth'],
    },
    'entry-timing': {
        term: 'Entry timing',
        category: 'ai',
        plain: 'The analyst’s timing call, separate from its value call.',
        definition:
            'A verdict says whether a name is cheap; entry timing says whether now is the moment: buy now, wait for momentum, or avoid. A waiting name carries a flip condition — what would change the call — and a break rule. The momentum view (confirming, neutral, contradicting) sits beside it. Timing can hold back an undervalued name; it never changes the value verdict.',
        related: ['waiting', 'iv-band'],
    },
    'rebuilt-analyst': {
        term: 'Old analyst / rebuilt analyst',
        category: 'ai',
        plain: 'Which generation of the analyst wrote a verdict.',
        definition:
            'The first analyst was ruled invalid and replaced. Its verdicts carry the gate reason “made by the old analyst”, are kept off the desk, and remain on each stock page under verdict history. The rebuilt analyst’s verdicts are stamped with a pack revision and a gate version. Today the rebuilt analyst has started publishing its first verdicts, and none of them passes the gate yet.',
        related: ['record-reset', 'gate-reason', 'actionable'],
    },
    'record-reset': {
        term: 'Record reset',
        category: 'track',
        plain: 'The moment the AI paper record restarts from zero.',
        definition:
            'Because the analyst was replaced, the AI book’s record restarts from zero when the rebuilt analyst goes live. The previous record, made by the old analyst, is archived and stays viewable as “Archived record · old analyst”; the new record starts as “Since go-live”. It has not happened yet.',
        related: ['rn-depth', 'rebuilt-analyst', 'track-record'],
    },
    'graded-pending': {
        term: 'Graded / pending',
        category: 'track',
        plain: 'Verdict horizons whose follow-up window has, or has not, fully elapsed.',
        definition:
            'Each verdict is graded at 30, 91, 182 and 365 days against the benchmarks. A horizon is graded only after it has fully elapsed; until then it is pending. The scoreboard shows both counts so that a thin sample cannot be mistaken for evidence. Verdicts from the old analyst are graded too, but labelled legacy and inconclusive.',
        related: ['not-yet-proven', 'track-record', 'benchmark'],
    },
    'control-book': {
        term: 'Control book',
        category: 'track',
        plain: 'Every Research now name, no AI — the test of whether the AI adds value.',
        definition:
            'An equal-weight paper book of every Research now name, with no AI involved. It is the scientific control: if the AI book cannot beat it, the expensive AI tier adds nothing over arithmetic. (In the data it is called “equal”.)',
        related: ['rn-depth', 'track-record', 'paper-trading'],
    },
    observations: {
        term: 'Observations',
        category: 'track',
        plain: 'How many daily data points a performance number rests on.',
        definition:
            'Every return figure on the track record page is printed with the number of daily observations behind it. Annualised ratios such as CAGR and Sharpe on a few weeks of data are noise, so they stay hidden until the count is meaningful.',
        related: ['cagr', 'sharpe-ratio', 'not-yet-proven'],
    },
    'not-yet-proven': {
        term: 'Not yet proven',
        category: 'track',
        plain: 'The system’s own status line about its performance.',
        definition:
            'Nothing in this system has been shown to beat the market. The paper records are short, the verdicts graded so far come from the old analyst, and none of the rebuilt analyst’s verdicts passes the gate yet. The site shows counts — graded and pending — rather than a headline, and nothing here should be read as proof.',
        related: ['graded-pending', 'observations', 'track-record'],
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
