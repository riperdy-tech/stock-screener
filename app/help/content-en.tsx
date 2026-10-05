'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — English body
//
// The English handbook sections (welcome → data). Same section ids and order as content-ko.tsx and
// content-zh.tsx; page.tsx renders whichever matches the site language. The gate reason list is
// drawn from lib/desk/tone.ts (GATE_REASON_LABEL) so it cannot drift from what the desk says.
// ─────────────────────────────────────────────────────────────────────────────

import { Term } from '@/components/GlossaryTerm';
import { FAMILY } from '@/lib/desk/tone';
import { A, Callout, ColourKey, DoorCard, GateReasons, Section, SubHeading } from './help-ui';
import { PipelineDiagram } from './WorkflowDiagram';

export function EnglishHelpBody() {
    return (
        <>
            {/* Welcome */}
            <Section id="welcome" title="Welcome — what this site is, and what it is not">
                <p>
                    Stockpeak is a research system published as a website. Every day a computer reads the financial
                    reports and price history of roughly <b>7,000 US-listed stocks</b> and narrows them to a short
                    list. A separate AI analyst then values the names on that list, one company at a time, and says
                    whether each price looks too low, about right or too high. This handbook explains how each step
                    works, what every label on the screen means, and what the system has <i>not</i> proven.
                </p>
                <Callout kind="warn">
                    <b>Nothing here buys or sells anything, and nothing here is financial advice.</b> It is a research
                    system with the evidence laid out — a machine for narrowing thousands of stocks down to a few worth{' '}
                    <i>your</i> research time. The site places no trades. Even the paper books are simulated, with real
                    prices and assumed transaction costs.
                </Callout>
                <Callout kind="info">
                    <b>Where things stand today.</b>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        <li>
                            The rebuilt AI analyst has started publishing its first verdicts. Each comes from a single
                            run, and every one is blocked by the gate for now, so nothing sits under Research now. See{' '}
                            <A href="#analyst">The AI analyst</A> and <A href="#relaunch">What changes at go-live</A>.
                        </li>
                        <li>
                            The daily follow-up is built but not live, and the AI paper record has not been reset yet.
                            Real-money mirroring is halted; this site never trades.
                        </li>
                        <li>
                            Nothing here is proven yet. See <A href="#validation">How it is validated</A>.
                        </li>
                    </ul>
                </Callout>
                <p>
                    If a word has a <span className="border-b border-dotted border-accent/50 font-semibold text-accent">dotted
                    underline</span>, it is a technical term — click it to see what it means without leaving the page. A
                    complete, searchable index of every term lives in the <A href="#glossary">glossary section</A>.
                </p>
            </Section>

            {/* Pipeline */}
            <Section id="pipeline" title="The chain, every day — from the economy to a graded record">
                <p>
                    Behind the page is a chain of six steps. The order is enforced and each step hands the next only a
                    data file, so stale or partial data cannot quietly corrupt the list. The cloud part re-runs on a
                    schedule via <Term term="github-actions" />. In plain words:
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>
                        <b>Macro — the weather.</b> A separate engine reads US economic data (<Term term="fred" />) and
                        publishes the economic backdrop and the cost-of-capital number the analyst discounts with. It is
                        context, not a call on the market. See <A href="#macro">The macro engine</A>.
                    </li>
                    <li>
                        <b>Screener — what the analyst reads.</b> Filings, prices and analyst forecasts come in. Safety
                        filters remove stocks nobody could sensibly buy, three <Term term="door">doors</Term> — compounder, value
                        gap and trend leader — score what is left, the best cases make the list, and bands sort it. Its
                        job is to decide where the analyst&apos;s limited time goes. See{' '}
                        <A href="#screen">The quant screen</A> and <A href="#bands">Bands, vetoes &amp; warnings</A>.
                    </li>
                    <li>
                        <b>Analyst — values each name.</b> An AI model on a local computer researches one listed company
                        at a time, about 1 h 45 min each on one GPU. The AI chooses every valuation input, Python does
                        every calculation, and code checks the result. The output is a verdict against a value band, and
                        the <Term term="crux">crux</Term> behind it. See <A href="#analyst">The AI analyst</A>.
                    </li>
                    <li>
                        <b>Gate — checks every verdict.</b> Code re-judges each verdict. One that fails stays visible,
                        marked blocked, with the reasons. Verdicts and their gate marks are then published to this site.
                        See <A href="#gate">The gate</A>.
                    </li>
                    <li>
                        <b>Follow-up — watches daily.</b> Each day it checks every held name and buy candidate against
                        new filings and news and decides only: re-analyse now, or nothing new. It never sells.{' '}
                        <b>Built, but not live yet.</b> See <A href="#followup">The daily follow-up</A>.
                    </li>
                    <li>
                        <b>Grading — scores every call.</b> Each verdict is later graded against what the price did, and
                        three paper books follow the machine, a control and your own holdings. See{' '}
                        <A href="#track">Track record</A>.
                    </li>
                </ol>
                <PipelineDiagram />
                <p>
                    Everything is <Term term="point-in-time" />: each logged signal uses only information that existed
                    at that moment. That discipline is what makes a track record worth reading.
                </p>
            </Section>

            {/* Desk */}
            <Section id="desk" title="Reading the desk">
                <p>The desk is the main page. From top to bottom:</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>The freshness strip</b> — when prices, the book and the latest verdict were last updated, a
                        health dot, and the macro read on the right. See <A href="#health">System health</A>.
                    </li>
                    <li>
                        <b>A notice</b>, when something needs saying. Today it says the rebuilt analyst is publishing
                        its first verdicts and none passes the gate yet.
                    </li>
                    <li>
                        <b>The gate line</b> — one sentence on whether any verdict passes the gate.
                    </li>
                    <li>
                        <b>The funnel</b> — five counts: US stocks → pass safety → make the list → AI verdicts → pass
                        the gate. Clicking a step only <i>selects</i> it: the summary below changes, and &ldquo;show
                        how&rdquo; opens the detail. It does not filter the table. Where a step removes names, its detail
                        panel says why.
                    </li>
                    <li>
                        <b>One table</b> for every name, in the sections below, with filters for verdict, door, sector
                        and search. A filter that hides rows always says &ldquo;showing k of n&rdquo;.
                    </li>
                </ul>

                <SubHeading>The sections of the table, in order</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Research now</b> — the verdict says undervalued, it passes <A href="#gate">the gate</A>, and
                        it is not held back. Ranked by margin of safety.
                    </li>
                    <li>
                        <b><Term term="waiting" /></b> — undervalued and passing the gate, but held back by timing or by
                        buying being paused. The reason is shown. This section fills in once the follow-up is live.
                    </li>
                    <li>
                        <b><Term term="no-edge" /></b> — passes the gate, and the verdict is FAIR or overvalued. FAIR
                        is a real answer, not a sell. Overvalued means &ldquo;do not buy&rdquo;.
                    </li>
                    <li>
                        <b>Blocked by the gate</b> — a verdict that fails the gate, or that has no usable run. It is
                        kept for the record, with its reasons, and is never a recommendation.
                    </li>
                    <li>
                        <b>Awaiting underwriting</b> — on the list, not yet valued by the analyst. Queued by screen
                        priority. Not a failure.
                    </li>
                    <li>
                        <b>Disqualified</b> — on the list but removed by a safety filter, or rejected by the analyst.
                        The reason is shown beside it.
                    </li>
                </ul>
                <p>
                    Verdicts from the <Term term="rebuilt-analyst">old analyst</Term> are not shown on the desk; one
                    quiet line counts them, and each stays on its stock page under verdict history. The screen also has
                    a band called <Term term="watchlist" />: that is the screen&apos;s own name for the lower part of
                    the list, and has nothing to do with the sections above.
                </p>

                <SubHeading>Reading a row</SubHeading>
                <p>
                    Each row shows the company, today&apos;s price, the verdict, the value band, the margin of safety
                    (MoS, signed: positive means the price is below the median value), the size hint (FULL, HALF or
                    QUARTER), the timing call (buy now, wait: trend, paused, avoid, or single run), the door that listed
                    it, how high it ranked on that door, and five small bars for the pillars Q M R V G — quality,
                    momentum, revisions, value and expectations gap. A bar grows up when the stock is above its sector
                    peers and down when below. A dashed empty bar means the pillar is <i>missing</i>, not zero.
                </p>
                <p>
                    Click anywhere on a row to open it. The AI analyst column shows the value band, the margin of
                    safety, the size hint with its four buckets, how many runs were usable and how far they spread, the
                    timing, the thesis, the verdict&apos;s age and the crux in one line. The screener column shows the
                    route, band and rank, the pillars, the expectations gap, market cap and flags. A row that is still
                    awaiting underwriting shows only the screener column. &ldquo;Open full case ›&rdquo; goes to the
                    stock page.
                </p>

                <SubHeading>The value band strip</SubHeading>
                <p>
                    Next to a verdict is a thin strip. The <b>shaded band</b> is the range of values from the
                    analyst&apos;s runs, and the <b>dark tick</b> is today&apos;s price; the label gives the range and
                    the median (for example &ldquo;$52–58 · MED 55&rdquo;). A tick left of the band means the price is
                    below every run&apos;s value; inside means it is within the range; right of it means above every
                    run. With a single run the band is one point. The verdict is where the price sits against the
                    whole band, and it is frozen at verdict time: the desk never recomputes it from a live price. See{' '}
                    <Term term="iv-band" />.
                </p>

                <SubHeading>The stock page</SubHeading>
                <p>
                    &ldquo;Open full case&rdquo; leads to the page for one name. Its left column holds the verdict and
                    value band, <A href="#crux">what the price gets wrong</A>, the stats (median value, run spread, size
                    hint, usable runs), timing, what would prove the verdict wrong, <A href="#followup">what we&apos;re
                    watching</A> (empty until the follow-up is live: &ldquo;No watch items yet&rdquo;), the evidence and
                    integrity checks, the analyst&apos;s thesis and the run transcripts. The right column shows how the
                    stock got on the list, what the price expects, a 400-day price chart, key financials, the verdict
                    history and which paper books hold it.
                </p>
                <p>
                    Under <b>⋯ → On-demand</b> are verdicts the operator requested on any ticker. They use the same
                    stock page with a banner: &ldquo;This name is not in the book; it never enters the paper
                    portfolios.&rdquo;
                </p>

                <SubHeading>Colour key — one meaning per colour</SubHeading>
                <ColourKey
                    rows={[
                        { name: 'Blue', text: 'The list: how far a stock has come through the screen. Also marks what you have selected, and links.' },
                        { name: 'Violet', text: 'Quality: a high-quality business, and the scores behind it.' },
                        { name: 'Teal', text: 'Value: cheap against the growth it has delivered, and the scores behind it.' },
                        { name: 'Pink', text: 'Trend: a strong, steady price trend.' },
                        { name: 'Green', text: 'Good: undervalued, a gain, a verdict that passes the gate.' },
                        { name: 'Neutral ink', text: 'Fair: the price sits inside the value band.' },
                        { name: 'Coral', text: 'Bad: overvalued, a loss.' },
                        { name: 'Amber', text: 'A warning, look closer: a stale stamp, a notice, buying paused, half or quarter size.' },
                        { name: 'Grey', text: 'Does not count: a blocked verdict, a vetoed stock, no data.' },
                    ]}
                />
                <p>
                    Every coloured state also carries a word or a glyph, so colour is never the only signal.
                </p>
            </Section>

            {/* Macro */}
            <Section id="macro" title="The macro engine — the economic backdrop">
                <p>
                    A separate engine reads the state of the US economy and publishes its read on the{' '}
                    <A href="/macro">Macro</A> page. Its numbers come only from <Term term="fred" />; news is used as
                    context for the story, never as a number.
                </p>
                <SubHeading>What the Macro page shows</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>The regime and its probability</b>, as a title in the form &ldquo;Regime, p % — strength
                        label&rdquo;. Underneath is a probability for each of five economic seasons —
                        goldilocks, reflation, tightening, stagflation, recession (see{' '}
                        <Term term="probability-vector" />). The single label is only a summary and drives no number.
                    </li>
                    <li>
                        <b>The strength label.</b> It comes from the engine&apos;s confidence: below 0.10 is &ldquo;weak
                        signal, context only&rdquo;; 0.10 to 0.30 is &ldquo;moderate signal&rdquo;; above 0.30 is
                        &ldquo;clear signal&rdquo;.
                    </li>
                    <li>
                        <b>Why</b> — which of the seven dimensions (growth, inflation, policy, credit and liquidity,
                        the yield curve, monetary liquidity, housing) supported or opposed the regime.
                    </li>
                    <li>
                        <b>Shocks</b> — seven alarms for fear, credit, interest rates, oil, the dollar, jobs and
                        inflation (<Term term="shock-register" />), with the active ones marked, and any data-health
                        warnings in full.
                    </li>
                    <li>
                        <b>Cost of capital</b> — the market&apos;s implied equity risk premium (with where it sits in
                        its own history) and the implied <Term term="cost-of-equity" />, with a flag if it is degraded.
                        This is the discount rate the analyst anchors to.
                    </li>
                </ul>
                <SubHeading>What is switched on, and what is off</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Off: sector tilt.</b> The macro read could give extra list places to sectors that suit the
                        economy, but its sector picking failed a pre-registered test, so the read has not shown it can
                        pick sectors. Every sector gets the same <Term term="sector-quota" />.
                    </li>
                    <li>
                        <b>On: the turbulence flag.</b> It turns on when the fear index (VIX) is 30 or higher, and it
                        feeds the size hint.
                    </li>
                    <li>
                        <b>On: the regime as dated facts.</b> The analyst is told the regime as a dated fact, not as a
                        forecast.
                    </li>
                </ul>
                <Callout kind="info">
                    The macro read is background, not a call on the market. It uses revised economic data, not
                    point-in-time data. If a macro stamp is older than 45 days it turns amber and says stale.
                </Callout>
            </Section>

            {/* Screen */}
            <Section id="screen" title="The quant screen — three doors">
                <p>
                    The screen does not blend everything into one score. A company can deserve attention by being
                    excellent, by being mispriced, or by being in a strong, steady uptrend — and averaging those into one
                    number describes none of them well. So there are three <Term term="door">doors</Term>. A stock needs to clear
                    only one. The screen&apos;s job is to decide what the analyst reads, so the analyst&apos;s time is
                    never spent on a company that was never worth it.
                </p>
                <div className="space-y-3">
                    <DoorCard color={FAMILY.quality} title="Door 1 — Quality (compounder)">
                        Companies that earn real money, keep growing, are rising in price and are having their forecasts
                        raised. It blends <Term term="quality" />, <Term term="momentum" /> and{' '}
                        <Term term="revisions" />, with quality counting most.
                    </DoorCard>
                    <DoorCard color={FAMILY.value} title="Door 2 — Value (value gap)">
                        Companies that look cheap against their own demonstrated growth: the price asks for less growth
                        than the company has actually delivered (the <Term term="expectations-gap" />), and the stock is
                        cheap on its <Term term="value" />. A <b>falling-knife floor</b> keeps out names in steep decline,
                        because cheap and still falling is not a bargain yet.
                    </DoorCard>
                    <DoorCard color={FAMILY.momentum} title="Door 3 — Trend (trend leaders)">
                        Strong, steady uptrends that the other two doors would miss — for example a sector-wide boom. Up to
                        20 extra places, with at most 5 per industry group. A candidate must be profitable and reasonably
                        large, must not have falling analyst forecasts, and must have climbed steadily rather than in one
                        lucky month.
                    </DoorCard>
                </div>
                <SubHeading>How the doors compete</SubHeading>
                <p>
                    Each of the first two doors turns its score into a <Term term="percentile" />, and the better of the
                    two is what a stock competes on. A <Term term="champion" /> — a stock in the top 10% on both doors —
                    gets a small bonus of +2, because being excellent and cheap at once is rare. A falling knife cannot be
                    a champion. On the desk the door that listed a name is shown as a coloured square and its name.
                </p>
                <SubHeading>Staying power</SubHeading>
                <p>
                    A name already on the list stays until it falls clearly out. This is called{' '}
                    <Term term="hysteresis" />: it stays in Research now while its rank is 60 or better, and on the list
                    while its rank is 150 or better. Without that buffer, stocks sitting on the cut line would hop in and
                    out with every small price move.
                </p>
                <SubHeading>Fair comparisons</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        Most grades are <Term term="sector-neutral" /> — a bank competes with banks, not with software
                        companies — and no sector may take more than 18 % of the list.
                    </li>
                    <li>
                        <Term term="momentum" /> is the exception, in a useful way: it is also read across the whole market,
                        so a boom that lifts an entire sector stays visible instead of looking ordinary.
                    </li>
                    <li>
                        For cyclical businesses — oil, gas, mining, shipping and similar — whose cash flow swings with the
                        cycle, the screen averages cash flow over several years (<b>8 years</b> for oil, gas and mining;{' '}
                        <b>3 years</b> for other cyclicals) instead of using one good or bad year.
                    </li>
                </ul>
                <SubHeading>Sector tilt is off</SubHeading>
                <p>
                    Every sector gets the same base <Term term="sector-quota" /> of list places. The macro engine could
                    give extra places to sectors that suit the economy, but its sector picking has not proved itself, so
                    the tilt is switched off until it does.
                </p>
            </Section>

            {/* Bands */}
            <Section id="bands" title="Bands, vetoes & warnings">
                <p>
                    The result of the screen is four <Term term="band">bands</Term>. The list is the first two together:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>RESEARCH NOW</b> — the top of the list, roughly the first 50 to 60 names. Worth your research time today.</li>
                    <li><b>WATCHLIST</b> — the rest of the list, which holds about 150 names in all. This is the screen&apos;s own band name; it is not a verdict.</li>
                    <li><b>PASS</b> — scored, but not on the list.</li>
                    <li><b>VETOED</b> — removed by a safety filter. No band, and the reason is written beside it; on the desk it sits under Disqualified.</li>
                </ul>
                <SubHeading>What removes a stock</SubHeading>
                <p>
                    A <Term term="veto" /> is a hard disqualifier, applied before the doors score anything. The reasons
                    are: the stock cannot be traded, it is too small or too thinly traded, it has no usable filed
                    fundamentals, it is a shell company, it has chronic operating losses together with heavy debt, or it
                    shows two <Term term="forensic" /> red flags at once. The last two apply only to companies worth under
                    $10 billion.
                </p>
                <SubHeading>What only warns</SubHeading>
                <p>
                    On large companies the forensic tests are <b>warnings</b>: <Term term="beneish" /> (likely earnings
                    manipulation), <Term term="accruals" /> (profits not backed by cash), Altman Z (a distress score) and
                    heavy <Term term="dilution" /> from issuing shares. A warning never removes a stock worth $10 billion
                    or more. On smaller companies a stock is removed only when two red flags agree. This keeps fast-growing
                    leaders from being thrown out for looking unusual, while still showing you the warning so you can look
                    closer.
                </p>
                <SubHeading>Notes are not warnings</SubHeading>
                <p>
                    Data notes — for example that a stock&apos;s momentum was worked out from monthly prices, or that its
                    latest annual report is old — describe how a number was built. They say nothing bad about the company
                    and never remove a stock.
                </p>
                <Callout kind="tip">
                    The principle is <i>annotate, never silently gate</i>: wherever possible a concern is shown as a flag
                    with its reason, so you can see it, instead of quietly deleting the stock.
                </Callout>
            </Section>

            {/* Analyst */}
            <Section id="analyst" title="The AI analyst — how a verdict is made">
                <p>
                    A name on the list is valued in depth by an AI analyst — like getting a careful second opinion. The
                    work is divided so that each part does what it is good at:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>The AI does the research</b> and chooses every valuation input, reading the company&apos;s own
                        filings and cited web sources. It runs on a local model (<Term term="llm" />), not a cloud service.
                    </li>
                    <li>
                        <b>Python does every calculation.</b> An AI is a good analyst but an unreliable calculator, so no
                        number is left to its arithmetic.
                    </li>
                    <li>
                        <b>Code checks the answer</b> against outside anchors: the professional analysts&apos; forecasts and
                        their price-target range (the <Term term="street-fence" />).
                    </li>
                </ul>
                <SubHeading>The verdict is a direction against a band</SubHeading>
                <p>
                    Each stock is valued in independent runs, and each usable run ends in an estimate of what the business
                    is worth. How many runs a verdict rests on is printed on every row (&ldquo;n of m usable&rdquo;) and is
                    never assumed. The verdict is where today&apos;s price sits against the whole <Term term="iv-band">value band</Term>:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Undervalued</b> — the price is below the whole band, with at least a 10 % margin of safety: every run says it is worth more.</li>
                    <li><b>Overvalued</b> — the price is above the whole band, with at least a 10 % margin: every run says do not buy.</li>
                    <li><b>FAIR</b> — the price sits inside the band, or the margin is too thin. The uncertainty contains the price: no edge. That is a decision, not a refusal.</li>
                    <li><b><Term term="not-usable" /></b> — there is no complete valuation. That is a malfunction and is never shown as a verdict.</li>
                </ul>
                <p>
                    A single run is shown as a point, not a range, and its size is capped. A wider band means the runs
                    disagreed, which lowers the size hint. The size hint is the most conservative of four buckets — run
                    disagreement, margin of safety, the analyst&apos;s own conviction and the macro turbulence flag — and
                    the stock page prints an upper bound that is a ceiling, not a suggestion. See{' '}
                    <Term term="position-sizing" />.
                </p>
                <SubHeading>Timing, and what would prove it wrong</SubHeading>
                <p>
                    Cheap is not the same as now. <Term term="entry-timing" /> is a separate call — buy now, wait for
                    momentum or avoid — with the condition that would flip it. And before any position exists, each
                    verdict writes down what would prove it wrong, as checkable rules (see{' '}
                    <Term term="thesis-status" />).
                </p>
                <Callout kind="warn">
                    <b>Current state.</b> The rebuilt analyst passed an acceptance test on companies it had not seen; that
                    is not a track record. Today it is publishing its first verdicts, each from a single run, and all of them
                    are blocked by the gate. Verdicts from the old analyst, which was ruled invalid, are kept off the desk.
                    See <Term term="rebuilt-analyst" />.
                </Callout>
            </Section>

            {/* Crux */}
            <Section id="crux" title="The crux — what the price gets wrong">
                <p>
                    A buy or sell call has to name the <b>one input</b> that today&apos;s price gets wrong. That is the{' '}
                    <Term term="crux">crux</Term>. It is what turns &ldquo;the analyst says undervalued&rdquo; into a claim you can
                    check.
                </p>
                <SubHeading>Two numbers for one input</SubHeading>
                <p>
                    Take one input of the valuation — growth in years 3–5, the cost of equity, how long growth fades, the
                    return earned on new capital. <Term term="price-implied">What the price implies</Term> is the value
                    that input would need to have for the model to land exactly on today&apos;s price. The analyst&apos;s
                    value is what it believes the input to be. The gap between the two is the disagreement with the market.
                </p>
                <SubHeading>Quotes checked by code</SubHeading>
                <p>
                    The analyst has to back its number with quotes from the company&apos;s filings, and code checks every
                    quote against the named source. A quote that cannot be found word for word does not count.
                </p>
                <SubHeading>No valid crux means FAIR</SubHeading>
                <p>
                    A call that cannot name a valid crux gets no direction: the verdict is held at FAIR, and the stock page
                    says &ldquo;No valid stated disagreement → verdict held at FAIR&rdquo;. The gate has its own reason for
                    the same thing, <code className="font-mono text-[12px]">directional_without_valid_crux</code>.
                </p>
                <SubHeading>On the stock page</SubHeading>
                <p>
                    &ldquo;What the price gets wrong&rdquo; shows each input on a number line with two markers — what the
                    price implies, and the analyst&apos;s value — then the analyst&apos;s reason as a quote, and flags that
                    say whether the stated disagreement checked out (&ldquo;crux valid&rdquo;) and whether the input was left
                    at its default value. If no value of any other single input would explain the price, a line says so.
                    The crux explains a verdict. It does not predict anything.
                </p>
            </Section>

            {/* Gate */}
            <Section id="gate" title="The gate — which verdicts count">
                <p>
                    After a verdict is written, code re-checks it every time the data are rebuilt. A verdict counts only if
                    it passes <Term term="gate">the gate</Term>. Every verdict is marked <Term term="actionable" /> (yes or
                    no), and when the answer is no, the desk gives the <Term term="gate-reason">gate reasons</Term> in plain words. A
                    verdict that fails is still published and shown, with its reasons, but it can never be a recommendation
                    and never enters the AI paper book.
                </p>
                <p>Every reason the gate can give, with the wording the desk uses:</p>
                <GateReasons />
                <p>
                    A verdict can have more than one reason. The desk shows these reasons in English in every language, so
                    the words match exactly. The Desk&apos;s funnel step &ldquo;pass the gate&rdquo; counts how many rows
                    carry each reason.
                </p>
                <Callout kind="info">
                    A blocked verdict is not deleted. It stays visible under <i>Blocked by the gate</i> as a record of what
                    was said and why it does not count. Passing the gate means a verdict is allowed to count; it does not
                    prove the verdict is right.
                </Callout>
            </Section>

            {/* Follow-up */}
            <Section id="followup" title="The daily follow-up — monitoring never sells">
                <Callout kind="warn">
                    <b>Built, but not live yet.</b> It is in acceptance testing. Until it is live there are no watch items,
                    and each stock page says so.
                </Callout>
                <p>
                    Every verdict ends with a watch-list: the things that would matter if they happened. Once the follow-up
                    is live, it checks each held name and each buy candidate once a day (<Term term="follow-up" />):
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>
                        <b>Gather.</b> New SEC filings and company news not seen before, and whether the latest closes sit
                        inside or outside the verdict&apos;s value band. No GPU is needed.
                    </li>
                    <li>
                        <b>The code floor.</b> Exact signals that always queue a re-analysis, whatever any model says: an
                        earnings release; a filing of the bankruptcy, restatement, delisting or change-of-control kind; a
                        thesis rule that has just become true; a safety veto appearing on a held name; two closes on the far
                        side of the value band (<Term term="code-floor" />).
                    </li>
                    <li>
                        <b>The local model&apos;s read.</b> It checks each watch item against the day&apos;s material and
                        answers only &ldquo;re-analyse now&rdquo; or &ldquo;nothing new&rdquo;. It is never shown the
                        verdict or any valuation figure, and every quote it cites must be found word for word in the named
                        source, checked by code.
                    </li>
                    <li>
                        <b>Effects.</b> A re-analysis jumps the queue (<Term term="reanalysis-queued" />). New buying can be
                        paused (<Term term="buy-paused" />). And every name is re-analysed at least every 14 days.
                    </li>
                </ol>
                <SubHeading>Monitoring never sells</SubHeading>
                <p>
                    The follow-up only asks for a fresh look. A held name is removed only by a new verdict. If a re-analysis
                    of a held name fails, its last good verdict is carried for at most two failures or 21 days, and the desk
                    labels it <Term term="held-carry">held — verdict being re-checked</Term>. Buy paused never means sell.
                    If the follow-up data is older than 36 hours or missing, a name is treated as paused, never as buyable.
                </p>
                <p>
                    On the site this becomes the <Term term="waiting" /> section of the desk, and &ldquo;What we&apos;re
                    watching&rdquo; on each stock page: every watch item with its status (reported, not found, unclear),
                    whether it would break or confirm the thesis, the quote, its source and date, and whether the quote was
                    verified.
                </p>
            </Section>

            {/* Relaunch */}
            <Section id="relaunch" title="What changes when the new analyst goes live">
                <p>
                    The rebuild reaches the site in three phases. Only the first has started, and no date is promised for
                    the others.
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>
                        <b>Today — first verdicts, none passing.</b> The rebuilt analyst is publishing its first verdicts,
                        each from a single run. None passes the gate. Research now is empty, the AI book holds only cash,
                        and old-analyst verdicts are kept off the desk.
                    </li>
                    <li>
                        <b>Baseline fill.</b> The analyst works through the whole list one company at a time, about 1 h 45
                        min each on one GPU, in screen-priority order, with no ETA promised. Names it has not reached show as
                        Awaiting underwriting — queued, not failed. New verdicts land in the sections by the normal rules.
                    </li>
                    <li>
                        <b>Steady state.</b> The <A href="#followup">daily follow-up</A> goes live, so every name is
                        refreshed at least every 14 days and the Waiting, buy-paused and held states fill in. Grading starts
                        to accumulate.
                    </li>
                </ol>
                <SubHeading>The AI record resets</SubHeading>
                <p>
                    At go-live the AI paper record restarts from zero (<Term term="record-reset" />). The old AI record —
                    made by the old analyst, which was ruled invalid — is archived and stays viewable as &ldquo;Archived
                    record · old analyst&rdquo;; a fresh record starts as &ldquo;Since go-live&rdquo;. None of this has
                    happened yet.
                </p>
            </Section>

            {/* Track */}
            <Section id="track" title="Track record — the honest meter">
                <p>
                    Instead of a flattering <Term term="backtest" />, the system <Term term="paper-trading">paper-trades</Term> every day
                    with real prices and assumed <Term term="transaction-costs" />, and grades every verdict. If the system
                    is wrong, this page will say so. Every number on it is paper (simulated) and covers a short period.
                </p>
                <SubHeading>The verdict scoreboard</SubHeading>
                <p>
                    It comes first, before any returns. It shows three counts — verdicts graded from the valid analyst,
                    verdicts graded from the old analyst (labelled legacy and inconclusive), and verdicts still pending
                    (<Term term="graded-pending" />) — then four horizon tiles (30, 91, 182 and 365 days) with how many are
                    gradeable at each. The method is printed under it: entry is the first close on or after the verdict
                    date, the benchmark uses the same dates, a horizon is graded only after it has fully elapsed, and
                    repeat verdicts on one name are correlated. The data file&apos;s own caveats are shown word for word.
                    While the count from the valid analyst is zero, no average-excess or percent-beat headline is shown.
                </p>
                <SubHeading>The record switch</SubHeading>
                <p>
                    Two chips: &ldquo;Archived record · old analyst&rdquo; and &ldquo;Since go-live&rdquo;. The old AI
                    history sits under the first, with a banner saying it comes from an analyst ruled invalid. The second
                    starts empty and stays so until the rebuilt analyst goes live (<Term term="record-reset" />).
                </p>
                <SubHeading>The paper books</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>AI book</b> — follows the verdicts that pass the gate (<Term term="rn-depth" />). It holds only
                        cash when nothing passes, which is the case today.
                    </li>
                    <li>
                        <b>Control book</b> — every Research now name, with no AI (<Term term="control-book" />). It is the
                        test of whether the AI adds anything over plain arithmetic.
                    </li>
                    <li>
                        <b>My book</b> — your own saved holdings, tracked like a fund (<Term term="unitization" />) so that
                        adding money never fakes performance. Signed out, it asks you to log in.
                    </li>
                </ul>
                <p>
                    Each book shows its return, how it did against IWM, its maximum drawdown, win rate, open positions and
                    average hold. Under the return and the benchmark comparison is the number of{' '}
                    <Term term="observations" /> behind it. <Term term="sharpe-ratio" /> and <Term term="cagr" /> are
                    hidden while there are too few observations — the page says &ldquo;not meaningful at n
                    observations&rdquo; — because annualised ratios on a few weeks of data are noise.
                </p>
                <SubHeading>Growth of 100, and the ledger</SubHeading>
                <p>
                    Growth of 100 plots the books and the benchmarks (<Term term="iwm" />, <Term term="spy" />, QQQ and a few
                    more) from the same start, with a window selector and a what-if cost box that re-costs every trade. A vertical
                    rule marks the record reset. The ledger lists the AI book&apos;s trades with a plain reason (for example
                    &ldquo;left the ranked list&rdquo;) and shows days with no trade as &ldquo;no changes&rdquo;.
                </p>
                <SubHeading>Honest rules</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>A trade happens at the <b>first close after the signal</b>, because a signal can only be acted on after it exists.</li>
                    <li>Costs are included on every trade.</li>
                    <li>Benchmarks use the same dates as the trades.</li>
                </ul>
                <SubHeading>How to read it</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Control vs IWM</b> — the stock selection works only if the picks beat the small-cap <Term term="benchmark" />.</li>
                    <li><b>AI book vs control</b> — the AI analyst earns its keep only if its book beats the plain list.</li>
                    <li><b>My book vs the others</b> — your own deviations show up as the <Term term="behavior-gap" />.</li>
                </ul>
                <Callout kind="info">
                    <Term term="not-yet-proven">Not yet proven.</Term> Nothing on this page shows that the system beats the
                    market.
                </Callout>
            </Section>

            {/* Portfolio */}
            <Section id="portfolio" title="My portfolio — checking your own holdings">
                <p>
                    The Portfolio page is for your <b>actual</b> holdings. Add a ticker and a dollar value, or paste a
                    broker export. They are saved only in this browser unless you log in. Each holding is checked against
                    the machine, and the result is shown next to it as the machine&apos;s stance.
                </p>
                <p>The stance words, and what they mean:</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>NO COVERAGE</b> — the stock is not in the screened universe.</li>
                    <li><b>✕ VETOED · reason</b> — a safety filter removed it.</li>
                    <li><b>NO ANALYSIS YET</b> — the rebuilt analyst has not valued it.</li>
                    <li><b>BLOCKED · reason</b> — a verdict exists but fails the gate. It is never a signal.</li>
                    <li><b>REDUCE (overvalued)</b>, <b>FAIR</b> and <b>BUY · size</b> — the verdict passes the gate and says overvalued, fair or undervalued.</li>
                    <li><b>NO PLAUSIBLE RUN</b> — no run was usable.</li>
                </ul>
                <p>
                    Stances come from rebuilt-analyst verdicts only. BUY and REDUCE are the machine&apos;s labels on a
                    research list, never advice to you. Where they exist, the thesis and follow-up status sit beside each
                    holding. The footer gives your total, your cash share, a warning if one sector is over the 25 % rule,
                    and what the AI book holds today. Your holdings also feed My book on <A href="#track">Track record</A>.
                </p>
                <Callout kind="info">
                    There is no allocation plan on this page. The site does not build a portfolio for you — the older
                    Kelly-sized books and the theme allocation were retired. See <Term term="position-sizing" /> for the size
                    guidance that still exists.
                </Callout>
            </Section>

            {/* Archive */}
            <Section id="lenses" title="The archive — retired pages kept for reference">
                <p>
                    Under <b>⋯ → Archive</b> are pages from older versions of the site, each marked retired: the{' '}
                    <A href="/lenses">legacy lenses</A> (the 100-bagger and Reverse screens), the AI archive and the
                    YouTube strategy. They are kept for reference. They are <b>not</b> the current system, and nothing on
                    the desk is built from them. The desk itself has one view; the old Quant and Compare switches are gone.
                </p>
            </Section>

            {/* Validation */}
            <Section id="validation" title="How the system is validated">
                <p>Four habits keep the system honest:</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Rules before results.</b> Pass/fail rules are written down before the results are seen, so they
                        cannot be tuned afterwards to look good (that would be <Term term="overfitting" />).
                    </li>
                    <li>
                        <b>Grading verdicts.</b> A grader checks each verdict against what the price did over 30, 91, 182 and
                        365 days, compared with <Term term="iwm" />, <Term term="spy" /> and QQQ. A horizon is graded only once
                        it has fully elapsed, the benchmarks use the same dates as the verdict, and repeat verdicts on one
                        name are treated as correlated, not independent.
                    </li>
                    <li>
                        <b>A control.</b> The sharpest question is whether the analyst&apos;s opinion adds anything on top of
                        the screen. The <Term term="control-book" /> exists to answer it: if the AI book cannot beat the plain
                        list, the expensive tier adds nothing.
                    </li>
                    <li>
                        <b>Paper books.</b> The <A href="#track">track record</A> books trade daily with real prices and
                        assumed costs.
                    </li>
                </ul>
                <p>
                    Negative results are published too. The macro sector tilt failed its test and was switched off, and the
                    macro page says so.
                </p>
                <Callout kind="warn">
                    <b>No conclusion yet.</b> <Term term="not-yet-proven" />: every graded verdict so far is from the old
                    analyst, and none of the rebuilt analyst&apos;s verdicts passes the gate. No conclusion can be drawn
                    until valid verdicts exist and their horizons have elapsed.
                </Callout>
            </Section>

            {/* Data */}
            <Section id="data" title="Where the data comes from, and system health">
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="sec-filings" /> — 10 years of as-filed fundamentals via <Term term="company-facts" /> (the ground truth for quality, forensic warnings and demonstrated growth), kept <Term term="point-in-time" />.</li>
                    <li><Term term="yahoo-finance" /> — prices, analyst <Term term="estimates" />, and coverage.</li>
                    <li><Term term="fred" /> — US economic series behind the macro engine.</li>
                    <li>News — narrative context only. It is never turned into a number.</li>
                </ul>
                <SubHeading>Two clocks</SubHeading>
                <p>
                    The scoring chain re-runs in the cloud several times each weekday, with a refresh after the close.
                    Cloud schedulers can run late, so every file carries its own timestamp. The AI analyst runs separately on
                    a local computer with one GPU, and produces verdicts on its own clock.
                </p>
                <SubHeading id="health">System health</SubHeading>
                <p>
                    The strip under the masthead on every page answers &ldquo;is anything stale or broken?&rdquo;:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Three stamps</b> — <i>prices as of</i>, <i>book scored</i> and <i>latest verdict</i>. A stamp
                        turns amber with a ● when it is past its expected age: prices after 24 hours, the book after 36
                        hours, and — once the rebuilt analyst is publishing — the latest verdict after 14 days.
                    </li>
                    <li>
                        <b>The health dot</b> — green when all is well. Amber for a stale stamp, a discount rate that did
                        not come from the macro anchor, or a degraded macro read. Red when the chain&apos;s own integrity
                        check failed or an error alert was raised in the last 7 days.
                    </li>
                    <li>
                        <b>The macro chip</b> on the right — the regime, its probability, the strength label and the cost of
                        equity, linking to <A href="/macro">Macro</A>. Macro stamps older than 45 days turn amber.
                    </li>
                </ul>
                <p>
                    Click the dot to open the health drawer. It is read-only: Freshness (each stamp with its expected
                    cadence), Analyst (the state, the baseline progress, and that the real-money mirror is halted), Alerts
                    (from the paper ledgers) and Checks (the chain&apos;s integrity checks, the discount-rate source, macro
                    warnings and the follow-up state). A file that failed to load is shown as not loaded, not as a failure.
                    There are no controls in it.
                </p>
            </Section>
        </>
    );
}
