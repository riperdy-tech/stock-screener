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
    | 'ai'          // RS2 LLM overlay
    | 'portfolio'   // sizing & the suggested plan
    | 'track'       // track record & performance measurement
    | 'data'        // data sources & pipeline
    | 'overlay'     // overlays & forensic flags
    | 'bands';      // bands & vetoes

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
    ai: 'RS2 / AI',
    portfolio: 'Portfolio & sizing',
    track: 'Track record',
    data: 'Data & pipeline',
    overlay: 'Overlays & forensics',
    bands: 'Bands & vetoes',
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
        term: 'Composite score',
        category: 'core',
        plain: 'The single 0–100 number every stock is ranked by.',
        definition:
            'The final grade that puts every stock on one leaderboard. It starts as a blend of the five factor scores (value, quality, momentum, low volatility, revisions), each measured against the stock’s own sector. It is then converted to a percentile (0–100) and reduced by three safety “haircuts” for fragile accounting or missing data. Higher = more evidence in the stock’s favor.',
        related: ['factor', 'sector-neutral', 'percentile', 'haircut'],
    },
    factor: {
        term: 'Factor',
        category: 'core',
        plain: 'A measurable, historically profitable trait of a stock.',
        definition:
            'A quantifiable characteristic — like being cheap, or profitable, or recently winning — that academic research has shown to predict future returns on average. This site scores five factors: value, quality, momentum, low volatility, and revisions. Think of them as the five events in a decathlon: each is a separate skill, and the composite is the combined result.',
        related: ['composite', 'value', 'quality', 'momentum'],
    },
    'sector-neutral': {
        term: 'Sector-neutral',
        category: 'core',
        plain: 'Every grade is relative to the stock’s own industry group.',
        definition:
            'Each stock is only compared to other companies in the same sector — a supermarket competes with supermarkets, not software companies. Without this, “high momentum” would just mean “is a tech stock,” and “cheap” would just mean “is a bank.” Measuring within a sector keeps the comparisons fair and is why the five factors are computed sector-by-sector.',
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
            'A ranking converted to a 0–100 scale: the 98th percentile means the stock scores higher than 98% of the ~6,600-name universe today. Bands are cut directly from percentiles (97+ = Research Now, 90+ = Watchlist, 70+ = Monitor).',
        related: ['composite', 'band'],
    },
    'rank-ic': {
        term: 'Rank IC',
        category: 'core',
        plain: 'A monthly measure of whether each factor actually predicted returns.',
        definition:
            'Information Coefficient — the rank correlation between a factor score and the stock’s subsequent return. It is measured every month for each factor as a diagnostic. The engine does NOT let these measurements steer its weights (see equal-weight); it uses them only to check that the factors are still doing their job and to report drift.',
        related: ['equal-weight', 'backtest', 'out-of-sample'],
    },
    'equal-weight': {
        term: 'Equal weighting (1/N)',
        category: 'core',
        plain: 'All five factors count exactly the same, on purpose.',
        definition:
            'Each of the five factors contributes an equal 20% to the composite. Decades of research (DeMiguel, Garlappi & Uppal 2009) show that weights estimated from past data almost always overfit — the “perfect” weights found in a backtest rarely survive in future data. A simple, humble 1/N split is one of the hardest things to beat out-of-sample.',
        related: ['rank-ic', 'overfitting', 'out-of-sample'],
    },
    overfitting: {
        term: 'Overfitting',
        category: 'core',
        plain: 'Tuning rules to past data so precisely they break on new data.',
        definition:
            'The classic quant trap: the more knobs you tune until a backtest looks amazing, the more you are memorizing the past instead of learning a durable pattern. This site deliberately refuses to optimize factor weights precisely because of this. A rule that “would have” made money is worthless if it was reverse-engineered from the same data it is tested on.',
        related: ['out-of-sample', 'equal-weight', 'backtest'],
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
            'Reconstructing a decision as if the outcome was predictable. The paper-trading system eliminates it: every buy and sell is recorded in real time, before the future happens, and the record is append-only.',
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
            'Measures whether a stock is cheap relative to the cash its business actually produces. Built from four yields (free-cash-flow, owner earnings, EBIT, and plain earnings), all measured against the current market price. Cheap beats expensive on average over time — but “cheap” is always judged within the stock’s own sector.',
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
            'A model that scores how likely a company is to have manipulated its earnings, using eight ratios like days-sales-in-receivables and asset quality. An elevated M-score is a forensic alarm; if it fires together with high accruals, the stock is vetoed outright.',
        related: ['forensic', 'accruals', 'veto'],
    },
    forensic: {
        term: 'Forensic flags',
        category: 'quality',
        plain: 'Yellow and red cards for suspicious accounting.',
        definition:
            'Warning lights from the forensic battery (Beneish M-score, Sloan accruals, heavy issuance, and more). A single flag applies a 0.85 safety haircut to the score; certain flags firing together are a hard veto. Think of a house with beautiful photos that failed the structural inspection.',
        related: ['beneish', 'accruals', 'haircut', 'veto'],
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
            'Winners tend to keep winning for a while. The momentum factor combines the 12-1 skip-month return (the academic-standard 12-month return that skips the most recent month) and 52-week-high proximity. It is the classic, robust “trend” factor.',
        related: ['skip-month', 'high-proximity'],
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
    lowvol: {
        term: 'Low volatility factor',
        category: 'risk',
        plain: 'Calm stocks have delivered more return per unit of pain.',
        definition:
            'Measures how gently or wildly a stock’s price moves, using the standard deviation of monthly returns (minimum 12 observations). Counterintuitively, calm stocks have historically produced better risk-adjusted returns than volatile ones. It is also why the site exports each stock’s annualized volatility to size positions.',
        related: ['volatility', 'annualized-volatility'],
    },
    volatility: {
        term: 'Volatility (σ)',
        category: 'risk',
        plain: 'How much the price swings — the “wildness” of a stock.',
        definition:
            'The standard deviation of returns. High volatility means the price swings widely in a short time; low volatility means it moves calmly. Sigma (σ) is the Greek letter used as its symbol. Volatility is the “risk” input in position sizing.',
        related: ['lowvol', 'annualized-volatility', 'kelly'],
    },
    'annualized-volatility': {
        term: 'Annualized volatility',
        category: 'risk',
        plain: 'Monthly swing, scaled up to a one-year number.',
        definition:
            'Monthly return volatility multiplied by √12 to express it on a yearly scale (monthly σ × square root of 12 months). It is exported per stock and feeds the Kelly position-sizing math in the suggested plan.',
        related: ['volatility', 'kelly'],
    },

    // ── Revisions factor ─────────────────────────────────────────────────
    revisions: {
        term: 'Revisions factor',
        category: 'revisions',
        plain: 'Are professional analysts raising or cutting their forecasts?',
        definition:
            'Measures the direction of change in analyst expectations. When analysts raise earnings estimates, the stock tends to keep rising; when they cut, it tends to keep falling. Built from the normalized slope of the EPS trajectory and a structured analyst score.',
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
            'The slope of EPS forecasts over time — are they climbing, flat, or falling? The revisions factor normalizes this slope to a −1…+1 range and blends it with a structured analyst score, so “improving” and “deteriorating” become comparable numbers.',
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
        term: 'Expectations gap (DCF gap)',
        category: 'valuation',
        plain: 'The growth the price demands minus the growth the company proved.',
        definition:
            'Implied growth (from the reverse DCF) minus demonstrated growth (last 5 years of actual revenue/FCF growth from SEC filings), in percentage points. Green/negative = the price demands LESS than the company has proven — a potential bargain. Amber/positive = the price needs an acceleration nobody has demonstrated — you must believe a story.',
        related: ['implied-growth', 'reverse-dcf', 'demonstrated-growth'],
    },
    'demonstrated-growth': {
        term: 'Demonstrated growth',
        category: 'valuation',
        plain: 'Growth the company has actually delivered, from the filings.',
        definition:
            'The last five years of real revenue and free-cash-flow growth taken from SEC filings. It is the ground truth the price’s promise is compared against in the expectations gap.',
        related: ['expectations-gap', 'sec-filings'],
    },
    'intrinsic-value': {
        term: 'Intrinsic value',
        category: 'valuation',
        plain: 'What the business is really worth, independent of its price.',
        definition:
            'An estimate of a company’s true worth based on its future cash-generating ability — the number a DCF produces. The RS2 AI’s intrinsic value is anchored to the analyst consensus band and de-forwarded to present value so the margin of safety measures cheapness today, not a 12-month price target.',
        related: ['dcf', 'margin-of-safety', 'present-value'],
    },
    'margin-of-safety': {
        term: 'Margin of safety',
        category: 'valuation',
        plain: 'The discount you get: how far below intrinsic value you buy.',
        definition:
            'How much cheaper the price is than the estimated intrinsic value, in percent. A 30% margin of safety means you pay 70 cents for a dollar of estimated value. RS2 uses it (with conviction) as the gate for its Research Now list: deep value (MoS ≥ 30%) earns Research Now at any conviction; moderate value needs conviction ≥ 9.5.',
        related: ['intrinsic-value', 'conviction'],
    },
    'cost-of-equity': {
        term: 'Cost of equity',
        category: 'valuation',
        plain: 'The return shareholders require — the discount rate for equity cash.',
        definition:
            'The minimum annual return investors demand to hold a stock instead of a safer asset. It is the rate used to discount future equity cash flows in the DCF. RS2 discounts one year of cost-of-equity to de-forward its intrinsic value to today.',
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

    // ── RS2 / AI ─────────────────────────────────────────────────────────
    llm: {
        term: 'LLM (large language model)',
        category: 'ai',
        plain: 'The AI that reads filings and writes independent verdicts.',
        definition:
            'The RS2 system runs a local AI (a large language model) that reads each company’s actual SEC filings and produces its own independent analysis — like getting a second doctor’s opinion. Its verdicts create a parallel ranking you can view through the RS2 LLM lens.',
        related: ['stance', 'conviction', 'action'],
    },
    stance: {
        term: 'Stance',
        category: 'ai',
        plain: 'The AI’s valuation call: undervalued, fair, or overvalued.',
        definition:
            'RS2’s headline verdict: UNDERVALUED (price looks too low for the evidence), FAIR, or OVERVALUED (price already assumes a lot). Rendered as a colored pill in the rankings.',
        related: ['llm', 'margin-of-safety'],
    },
    conviction: {
        term: 'Conviction',
        category: 'ai',
        plain: 'How confident the AI is in its verdict, 0–15.',
        definition:
            'RS2’s self-reported confidence in its own verdict, from 0 (a guess) to 15 (very confident). It matters for the AI Research Now gate: moderate value only earns Research Now if conviction is high enough.',
        related: ['llm', 'margin-of-safety'],
    },
    action: {
        term: 'Action',
        category: 'ai',
        plain: 'What the AI analyst would do with the stock — an opinion, never an order.',
        definition:
            'The AI’s suggested action (buy / accumulate / hold / reduce / avoid…). It is an opinion for research, not a trade — nothing on this site executes trades. A hard avoid or sell is a veto in the AI lens.',
        related: ['llm', 'exit-review'],
    },
    'exit-review': {
        term: 'Exit review',
        category: 'ai',
        plain: 'The AI’s hold/trim/sell call for current holders of a fallen name.',
        definition:
            'When a stock drops out of the quant Research Now list, RS2 reviews it for the people who already own it: hold, trim, or sell. Rendered as an amber “LLM EXIT” chip. It is a decision for existing holders, not a new buy case.',
        related: ['llm', 'action', 'band'],
    },

    // ── Bands & vetoes ───────────────────────────────────────────────────
    band: {
        term: 'Band',
        category: 'bands',
        plain: 'A bucket that translates the rank into an action.',
        definition:
            'Percentile cut into four practical buckets: RESEARCH NOW (top 3%), WATCHLIST (top 10%), MONITOR (top 30%), PASS (the rest). The band is what tells you how much of your time a stock deserves today.',
        related: ['research-now', 'watchlist', 'percentile'],
    },
    'research-now': {
        term: 'Research Now',
        category: 'bands',
        plain: 'Top 3% — the shortlist worth your research time today.',
        definition:
            'The highest band: the top 3% of scored stocks. In the AI lens, the RS2 Research Now gate adds extra requirements — a real margin of safety, and conviction — so the two lists can differ. It is a research shortlist, never a buy order.',
        related: ['band', 'watchlist', 'margin-of-safety'],
    },
    watchlist: {
        term: 'Watchlist',
        category: 'bands',
        plain: 'Top 10% — strong evidence, worth monitoring.',
        definition:
            'The second band (90th–97th percentile). Strong evidence, just below the Research Now cut. Stocks here are worth watching and often get promoted.',
        related: ['band', 'research-now'],
    },
    monitor: {
        term: 'Monitor',
        category: 'bands',
        plain: 'Top 30% — reasonable, but not exceptional evidence.',
        definition:
            'The third band (70th–90th percentile). Reasonable scores without standout evidence. Low priority for your research time.',
        related: ['band'],
    },
    pass: {
        term: 'Pass',
        category: 'bands',
        plain: 'Everything below the top 30%.',
        definition:
            'The default band for the ~70% of stocks that do not reach the top 30%. Not a “bad company” verdict — just not enough evidence to earn your attention today.',
        related: ['band'],
    },
    veto: {
        term: 'Veto',
        category: 'bands',
        plain: 'Automatic disqualification, no matter how good the score looks.',
        definition:
            'A hard disqualifier applied before scoring: a red chip regardless of composite. Reasons include failing the reverse engine’s safety checks, firing both forensic alarms together (Beneish + accruals), heavy share issuance, or an AI hard avoid/sell. The reason is written on the chip.',
        related: ['forensic', 'beneish', 'dilution'],
    },
    haircut: {
        term: 'Safety haircut',
        category: 'bands',
        plain: 'A multiplicative discount to the score for fragility or missing data.',
        definition:
            'A penalty applied to the composite after ranking: survivability = 0.7 + 0.3×(survivability/100); data quality = min(1, 0.8 + 0.04×data quality); forensic = 0.85 if a single Beneish or accruals alarm fired. Result is re-ranked. A haircut reduces the score; it is not a veto.',
        related: ['composite', 'veto', 'forensic'],
    },

    // ── Portfolio & sizing ───────────────────────────────────────────────
    kelly: {
        term: 'Kelly criterion',
        category: 'portfolio',
        plain: 'A formula for the mathematically “right” bet size given an edge.',
        definition:
            'A classic money-management formula: bet a fraction of your capital proportional to your edge divided by your variance (f = edge / variance). This site uses quarter-Kelly (0.25 × that), capped at 5% per position — deliberately conservative, because full Kelly is too aggressive for real-world uncertainty.',
        related: ['edge', 'position-sizing', 'annualized-volatility'],
    },
    edge: {
        term: 'Edge',
        category: 'portfolio',
        plain: 'Your expected advantage — here, the expectations gap closing.',
        definition:
            'In this system, edge is estimated as the expectations gap closing over roughly three years — the market repricing a stock that is priced below its demonstrated growth. Only names priced BELOW their demonstrated growth have measurable edge, which is why high-ranked-but-expensive names are skipped with “no Kelly edge.”',
        related: ['expectations-gap', 'kelly'],
    },
    'position-sizing': {
        term: 'Position sizing',
        category: 'portfolio',
        plain: 'Deciding how much of your capital goes into each stock.',
        definition:
            'The math that turns a shortlist into a portfolio: quarter-Kelly sizing, capped at 5% per position, halved by forensic flags, shrunk by geopolitical risk and insider selling, and bounded by sector (25%) and theme (30%) caps. The rest stays in cash.',
        related: ['kelly', 'sector-cap', 'theme-cap'],
    },
    'sector-cap': {
        term: 'Sector cap',
        category: 'portfolio',
        plain: 'A ceiling on how much of the book one sector can occupy.',
        definition:
            'A risk rule limiting any single sector to 25% of the portfolio, so the plan cannot become a disguised single-industry bet. Theme concentration is similarly capped at 30%.',
        related: ['position-sizing', 'theme-cap'],
    },
    'theme-cap': {
        term: 'Theme cap',
        category: 'portfolio',
        plain: 'A ceiling on how much of the book one hype theme can occupy.',
        definition:
            'A risk rule limiting any single theme to 30% of the portfolio. Prevents the plan from piling into one crowded narrative (AI, biotech, etc.) regardless of how many names in it score well.',
        related: ['position-sizing', 'sector-cap', 'theme'],
    },
    cash: {
        term: 'Cash (in the plan)',
        category: 'portfolio',
        plain: 'Un-invested capital — a feature, not a bug.',
        definition:
            'The portion of the suggested plan not deployed. The value core deliberately runs ~50% cash because it only buys names with measurable edge and refuses to overpay. Cash is protection: it means you do not have to be right about everything, and you have dry powder when bargains appear.',
        related: ['edge', 'kelly'],
    },
    'book-value': {
        term: 'Book value',
        category: 'portfolio',
        plain: 'The accounting value of the portfolio’s invested capital.',
        definition:
            'The cost basis / capital base of the plan. Caps and sleeve sizes are expressed as percentages of book value (e.g., the quality sleeve is capped at ~35% of book).',
        related: ['sleeve'],
    },
    sleeve: {
        term: 'Quality sleeve',
        category: 'portfolio',
        plain: 'The hybrid plan’s extra bucket that buys top names regardless of price.',
        definition:
            'Part of the hybrid (plan2) portfolio: on top of the Kelly value core, it buys the top-ranked names REGARDLESS of valuation gap, capped at ~35% of book value. This is how the hybrid holds expensive leaders (TSM, GOOGL, MU) that the value core refuses, and deploys the idle cash. Sleeve rows are tinted pink in the plan table.',
        related: ['book-value', 'cash', 'plan'],
    },
    'macro-derisk': {
        term: 'Macro de-risk',
        category: 'portfolio',
        plain: 'When Fed warning lights fire, every position size halves.',
        definition:
            'A rule that watches macro flags built from Fed data. If two or more flags fire at once, every suggested position size is automatically halved to reduce exposure to a deteriorating macro environment.',
        related: ['macro-flags', 'position-sizing'],
    },
    'macro-flags': {
        term: 'Macro flags',
        category: 'portfolio',
        plain: 'Warning lights from Federal Reserve data.',
        definition:
            'Signals derived from FRED (Fed) data series — like yield-curve and growth indicators. Shown on the Portfolio tab as “Macro flags: …”; when 2+ fire, macro de-risk halves every size.',
        related: ['macro-derisk', 'fred'],
    },
    plan: {
        term: 'Plan (value core)',
        category: 'portfolio',
        plain: 'The suggested allocation built from the Research Now list.',
        definition:
            'A machine-built allocation (NOT your portfolio) from the Research Now list. The value core uses quarter-Kelly sizing, only buys names priced below their demonstrated growth, respects sector/theme caps, and runs ~50% cash. It is decision support — nothing executes trades.',
        related: ['kelly', 'sleeve', 'cash'],
    },
    plan2: {
        term: 'Plan2 (hybrid)',
        category: 'portfolio',
        plain: 'The value core plus a quality sleeve that holds the leaders.',
        definition:
            'The hybrid variant: the same Kelly value core, plus a quality sleeve that buys top-ranked names regardless of valuation gap (capped ~35% of book), so it captures the expensive leaders and invests more of the cash (~78% invested). Trade-off: more leader exposure, less value discipline, bigger drawdowns in a bust.',
        related: ['sleeve', 'plan', 'drawdown'],
    },
    'paper-trading': {
        term: 'Paper trading',
        category: 'track',
        plain: 'Trading with rules but no real money — recorded for real.',
        definition:
            'The system pretends to buy and sell its own picks every day using real prices and real transaction costs, and the record is append-only and cannot be edited. It is the honest meter: if the machine is wrong, the Track Record page will say so — publicly and permanently.',
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
        plain: 'The return you lose by deviating from the plan.',
        definition:
            'The difference between what the disciplined model earns and what you actually earn, caused by your own decisions — selling too early, chasing, ignoring exits. On Track Record, “mine lagging plan” is the behavior gap, measured in public with real money.',
        related: ['track-record', 'mine', 'plan'],
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
            'The decline from a portfolio’s all-time high to its lowest subsequent point, in percent. A 30% drawdown means the portfolio lost 30% of its peak value at the worst point. It is the “pain” side of the risk equation — the hybrid (plan2) tends to draw down harder in busts.',
        related: ['plan2', 'volatility', 'sharpe-ratio'],
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
        plain: 'The honest, uneditable scoreboard of the system’s own paper trades.',
        definition:
            'A tab that paper-trades four portfolios daily (plan, plan2, equal, mine) with real prices and transaction costs, recorded append-only. Instead of a flattering backtest, it is a permanent public record of what the machine actually did — including its mistakes.',
        related: ['paper-trading', 'behavior-gap', 'alpha'],
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
            'The Federal Reserve Bank of St. Louis’s free database of US economic series. It supplies the macro series behind the macro flags that trigger de-risking.',
        related: ['macro-flags', 'macro-derisk'],
    },
    'github-actions': {
        term: 'GitHub Actions',
        category: 'data',
        plain: 'The cloud automation that re-runs the whole pipeline daily.',
        definition:
            'A CI/CD service that automatically runs the data fetch, scoring chain, and paper-trading ledgers on a schedule. It also triggers AI analysis jobs when you request them. The entire pipeline re-runs daily, and the IC drift report recalculates monthly.',
        related: ['pipeline'],
    },
    pipeline: {
        term: 'Pipeline',
        category: 'data',
        plain: 'The ordered chain of scripts that turns raw data into a ranked list.',
        definition:
            'The end-to-end process: fetch fundamentals and prices → build the fundamentals history → run the reverse engine → score factors → build the portfolio plan → measure forward outcomes. An orchestrator enforces the order and data-integrity checks so stale or partial data can never silently corrupt the rankings.',
        related: ['github-actions', 'reverse-engine'],
    },
    'reverse-engine': {
        term: 'Reverse engine',
        category: 'data',
        plain: 'The first-pass safety and quality engine the factor lab builds on.',
        definition:
            'The scoring stage that classifies each name’s archetype (A–F), scores survivability and data quality, and computes forensic flags. It also nominates candidates and, together with the reverse-DCF models, produces the safety inputs and demonstrated-growth numbers the Factor Lab consumes.',
        related: ['pipeline', 'reverse-dcf', 'forensic'],
    },

    // ── Overlays & forensics ─────────────────────────────────────────────
    gpr: {
        term: 'GPR (geopolitical exposure)',
        category: 'overlay',
        plain: 'A 0–3 tag for how exposed a company is to geopolitics.',
        definition:
            'Geopolitical risk tagged from the company’s actual business profile — revenue geography, supply chains, regulation, sanctions. Never a buy/sell signal: instead, at level 3 it shrinks suggested position sizes and demands a bigger margin of safety.',
        related: ['overlay', 'position-sizing'],
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
            'When a company issues new shares, each existing share represents a smaller slice of the pie. Heavy issuance is a forensic flag and can be a hard veto (unless the company’s archetype makes issuance its expected financing mode — like banks and some financials).',
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
        plain: 'Extra context tags layered on top of the score.',
        definition:
            'Non-scoring signals shown as chips: GPR (geopolitical exposure) and ▲/▼ INSIDERS (informed demand). They never add to the composite — they shrink position sizes, demand bigger margins of safety, or question your thesis.',
        related: ['gpr', 'informed-demand'],
    },
    theme: {
        term: 'Theme',
        category: 'overlay',
        plain: 'A hype category (AI, biotech…) — context, never a scoring factor.',
        definition:
            'A market narrative a stock belongs to (e.g., AI, semiconductor, biotech). Theme membership rides along for orientation and for crowding warnings, but never adds to the score — naive theme exposure has historically destroyed value (specialized theme ETFs average −3.1%/yr).',
        related: ['theme-cap', 'composite'],
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
