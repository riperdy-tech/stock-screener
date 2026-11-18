// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/decidedText.test.ts   (node:test; no other runner is installed)
// Invented data only: none of these figures belongs to a real company.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecidedRun, DecidedValuation } from '../data-service';
import { compactAmount, ffoViews, groupFlags, humanise, inputName, inputRows, inputText, isFinancialRun, lossLine, mergedAdjustments, mergedRisks, oldDefaultsValue, parseFlag, pct1, pctList, riskValue, runSeeds, situationItems, taxLine, withRange, yearsShape } from './decidedText';

const run = (g: number): DecidedRun => ({
    inputs: { rev_growth: [g, 0.05, 0.04, 0.03, 0.02], op_margin: [0.2, 0.19, 0.18, 0.17, 0.16], long_run_op_margin: 0.15, terminal_growth: 0.025, fade_years: 8,
              return_on_new_investment_long_run: 0.09, capex_to_revenue: 0.12 },
    ranges: { long_run_op_margin: [0.1, 0.2], rev_growth_y3: [0.01, 0.07], terminal_growth: [0.015, 0.033] },
    reasons: { rev_growth: { why: 'Orders are growing.', quotes: [{ id: 'P1', quote: 'Orders rose.' }], quotes_given: 1 }, op_margin: { why: 'Costs rise.', quotes: [] } },
});
const dec = (patch: Partial<DecidedValuation> = {}): DecidedValuation => ({ runs: { '3000': run(0.035), '1000': run(0.03) }, ...patch });

test('pct1: one decimal, a missing value is a dash, zero is a value', () => {
    assert.equal(pct1(0.035), '3.5%');
    assert.equal(pct1(0), '0.0%');
    assert.equal(pct1(null), '—');
    assert.equal(pct1(undefined), '—');
    assert.equal(pct1('0.1'), '—');
});

test('pctList: comma list, empty is a dash', () => {
    assert.equal(pctList([0.035, 0.05, 0]), '3.5%, 5.0%, 0.0%');
    assert.equal(pctList([]), '—');
    assert.equal(pctList(undefined), '—');
});

test('withRange: the figure with its low to high, or the figure alone', () => {
    assert.equal(withRange(0.15, [0.1, 0.2]), '15.0% (low 10.0% to high 20.0%)');
    assert.equal(withRange(0.15, undefined), '15.0%');
    assert.equal(withRange(undefined, [0.1, 0.2]), '— (low 10.0% to high 20.0%)');
});

test('runSeeds: numeric order, so run 1 is the lower seed whatever the key order', () => {
    assert.deepEqual(runSeeds(dec()), ['1000', '3000']);
});

test('oldDefaultsValue: the quoted value wins, 0 counts, else the plain one, else null', () => {
    assert.equal(oldDefaultsValue(dec({ value_at_old_defaults: 10, value_at_old_defaults_quoted: 12 })), 12);
    assert.equal(oldDefaultsValue(dec({ value_at_old_defaults: 10, value_at_old_defaults_quoted: 0 })), 0);
    assert.equal(oldDefaultsValue(dec({ value_at_old_defaults: 10 })), 10);
    assert.equal(oldDefaultsValue(dec({ value_at_old_defaults: null })), null);
    assert.equal(oldDefaultsValue(dec()), null);
});

test('inputText: each input in its unit', () => {
    const r = run(0.03);
    assert.equal(inputText('rev_growth', r), '3.0%, 5.0%, 4.0%, 3.0%, 2.0%');
    assert.equal(inputText('long_run_op_margin', r), '15.0% (low 10.0% to high 20.0%)');
    assert.equal(inputText('terminal_growth', r), '2.5% (low 1.5% to high 3.3%)');
    assert.equal(inputText('fade_years', r), '8');
    assert.equal(inputText('capex_to_revenue', r), '12.0%');
    assert.equal(inputText('fade_years', undefined), '—');
});

test('inputRows: seven rows in order, one cell and one reason per run in seed order', () => {
    const rows = inputRows(dec());
    assert.deepEqual(rows.map((r) => r.key), ['rev_growth', 'op_margin', 'long_run_op_margin', 'terminal_growth', 'fade_years', 'return_on_new_investment_long_run', 'capex_to_revenue']);
    assert.equal(rows[0].cells[0], '3.0%, 5.0%, 4.0%, 3.0%, 2.0%');
    assert.equal(rows[0].cells[1], '3.5%, 5.0%, 4.0%, 3.0%, 2.0%');
    assert.deepEqual(rows[0].whys[0], { text: 'Orders are growing.', quotes: [{ id: 'P1', quote: 'Orders rose.' }] });
    assert.deepEqual(rows[4].whys[0], { text: '', quotes: [] });
});

test('riskValue and inputName: years for the fade, percent otherwise, unknown input stays raw', () => {
    assert.equal(riskValue('fade_years', 12), '12');
    assert.equal(riskValue('rev_growth', 0.01), '1.0%');
    assert.equal(riskValue('rev_growth', [0.01, 0.02]), '1.0%, 2.0%');
    assert.equal(riskValue('capex_to_revenue', undefined), '—');
    assert.deepEqual(inputName('capex_to_revenue'), { key: 'dcInCapex' });
    assert.deepEqual(inputName('long_run_op_margin'), { key: 'dcInLongMargin' });
    assert.deepEqual(inputName('rev_growth.y1'), { key: 'dcInGrowthYear', n: 1 });
    assert.deepEqual(inputName('op_margin.y5'), { key: 'dcInMarginYear', n: 5 });
    assert.deepEqual(inputName('rev_growth_y3'), { key: 'dcInGrowthYear', n: 3 });
    assert.equal(inputName('toString'), null);
    assert.equal(inputName('mystery'), null);
});

test('parseFlag: sentence key, detail after it, and the run it came from', () => {
    assert.deepEqual(parseFlag('run 1000: margin_outside_filed_record: op_margin.y5 0.1830 (filed 0.1394 to 0.1828)'),
        { key: 'dcFlagMargin', detail: 'op_margin.y5 0.1830 (filed 0.1394 to 0.1828)', seed: '1000' });
    assert.equal(parseFlag('growth_outside_filed_record: rev_growth.y1 0.0390 (filed 0.04 to 0.2)').key, 'dcFlagGrowth');
    assert.deepEqual(parseFlag('run 3000: base_year_not_representative'), { key: 'dcFlagBaseYear', detail: '', seed: '3000' });
    assert.equal(parseFlag('confidence_low').key, 'dcFlagConfidence');
    assert.equal(parseFlag('situation_unclear').key, 'dcFlagSituation');
    assert.equal(parseFlag('return_above_base_year: long-run 0.1 against the base year at 0.08').key, 'dcFlagReturn');
    assert.equal(parseFlag('run 1000: scenario_order_not_monotone: bear 5, base 4, bull 6').key, 'dcFlagOrder');
});

test('parseFlag: quotes_verified reads as n of m; an unknown flag is shown whole', () => {
    assert.deepEqual(parseFlag('run 3000: quotes_verified: 13 of 14'), { key: 'dcFlagQuotes', detail: '', seed: '3000', n: 13, m: 14 });
    assert.deepEqual(parseFlag('some_new_flag: x'), { key: null, detail: 'some new flag: x', seed: null });
    assert.deepEqual(parseFlag('constructor'), { key: null, detail: 'constructor', seed: null });
    assert.deepEqual(parseFlag('run 1000: odd_flag: y'), { key: null, detail: 'odd flag: y', seed: '1000' });
});

test('taxLine: both values and both rates, else null', () => {
    const row = { value_base: 20, tax_range: { rate: 0.21, rate_alt: 0.25, value_alt: { base: 18.5 } } };
    assert.deepEqual(taxLine(row), { rate: '21.0%', value: '$20.00', rateAlt: '25.0%', valueAlt: '$18.50' });
    assert.equal(taxLine({ value_base: 20 }), null);
    assert.equal(taxLine({ value_base: 20, tax_range: { rate: 0.21, rate_alt: 0.25, value_alt: null } }), null);
    assert.equal(taxLine({ value_base: undefined, tax_range: row.tax_range }), null);
});

test('lossLine: needs a label; the explanation is optional', () => {
    assert.deepEqual(lossLine({ loss_record: { label: ' a one-off write-down ', explanation: 'Impairment in year 2. ' } }), { label: 'a one-off write-down', explanation: 'Impairment in year 2.' });
    assert.deepEqual(lossLine({ loss_record: { label: 'x' } }), { label: 'x', explanation: '' });
    assert.equal(lossLine({ loss_record: { label: null, explanation: 'unexplained' } }), null);
    assert.equal(lossLine({}), null);
});

test('mergedRisks: one entry per risk text, marked with the runs that named it and what each said', () => {
    const d = dec();
    d.runs['1000'].risks = [{ risk: 'Demand falls', input_hit: 'rev_growth', bear_value: 0.01 }, { risk: 'Costs rise', input_hit: 'op_margin', bear_value: 0.1 }];
    d.runs['3000'].risks = [{ risk: ' Demand falls ', input_hit: 'rev_growth', bear_value: 0.02 }, { risk: 'A new rival', input_hit: 'capex_to_revenue', bear_value: 0.2 }, { risk: '' }];
    assert.deepEqual(mergedRisks(d), [
        { risk: 'Demand falls', runs: [{ run: 0, input: 'rev_growth', value: 0.01 }, { run: 1, input: 'rev_growth', value: 0.02 }] },
        { risk: 'Costs rise', runs: [{ run: 0, input: 'op_margin', value: 0.1 }] },
        { risk: 'A new rival', runs: [{ run: 1, input: 'capex_to_revenue', value: 0.2 }] },
    ]);
    assert.deepEqual(mergedRisks(dec()), []);
});

const SEEDS = ['1000', '3000'];
test('groupFlags: outside-record years merge per kind and direction, with the run marks and the filed range once', () => {
    const g = groupFlags([
        'run 1000: growth_outside_filed_record: rev_growth.y1 0.0390 (filed 0.0432 to 0.2077)',
        'run 1000: growth_outside_filed_record: rev_growth.y2 0.0400 (filed 0.0432 to 0.2077)',
        'run 1000: growth_outside_filed_record: rev_growth.y3 0.0420 (filed 0.0432 to 0.2077)',
        'run 3000: growth_outside_filed_record: rev_growth.y4 0.0420 (filed 0.0432 to 0.2077)',
        'run 3000: growth_outside_filed_record: rev_growth.y1 0.0390 (filed 0.0432 to 0.2077)',
        'run 3000: growth_outside_filed_record: rev_growth.y5 0.2500 (filed 0.0432 to 0.2077)',
    ], SEEDS);
    assert.equal(g.notes.length, 2);
    const [below, above] = g.notes;
    assert.deepEqual([below.key, below.subject, below.dir, below.lo, below.hi], ['dcNoteYears', 'rev_growth', 'below', '4.3%', '20.8%']);
    assert.deepEqual(below.occ, [{ run: 0, years: [1, 2, 3] }, { run: 1, years: [1, 4] }]);
    assert.deepEqual([above.dir, above.occ], ['above', [{ run: 1, years: [5] }]]);
});

test('groupFlags: margins split into year notes and the long-run note; the long-run one has no years', () => {
    const g = groupFlags([
        'run 1000: margin_outside_filed_record: op_margin.y5 0.1830 (filed 0.1394 to 0.1828)',
        'run 1000: margin_outside_filed_record: long_run_op_margin 0.5000 (filed 0.1394 to 0.1828)',
        'run 3000: margin_outside_filed_record: long_run_op_margin 0.5100 (filed 0.1394 to 0.1828)',
    ], SEEDS);
    assert.deepEqual(g.notes.map((n) => [n.key, n.subject, n.dir]), [['dcNoteYears', 'op_margin', 'above'], ['dcNoteLong', 'long_run_op_margin', 'above']]);
    assert.deepEqual(g.notes[1].occ, [{ run: 0, years: [] }, { run: 1, years: [] }]);
});

test('groupFlags: simple flags merge over the runs, quotes are summed, situation_unclear is lifted out', () => {
    const g = groupFlags(['situation_unclear', 'run 1000: confidence_low', 'run 3000: confidence_low', 'run 1000: base_year_not_representative',
        'run 1000: quotes_verified: 13 of 13', 'run 3000: quotes_verified: 12 of 14'], SEEDS);
    assert.equal(g.situation, true);
    assert.deepEqual(g.quotes, { n: 25, m: 27 });
    assert.deepEqual(g.notes.map((n) => [n.key, n.occ.map((o) => o.run)]), [['dcFlagConfidence', [0, 1]], ['dcFlagBaseYear', [0]]]);
    assert.equal(groupFlags([], SEEDS).quotes, null);
});

test('groupFlags: return and scenario figures are formatted; runs with different figures stay separate lines', () => {
    const g = groupFlags(["run 1000: return_above_base_year: long-run 0.1000 against the base year's 0.0800", "run 3000: return_above_base_year: long-run 0.1200 against the base year's 0.0800",
        'run 1000: scenario_order_not_monotone: bear 5.0000, base 4.0000, bull 6.0000'], SEEDS);
    assert.deepEqual(g.notes.map((n) => [n.key, n.vals]), [['dcNoteReturn', ['10.0%', '8.0%']], ['dcNoteReturn', ['12.0%', '8.0%']], ['dcNoteOrder', ['$5.00', '$4.00', '$6.00']]]);
});

test('groupFlags: a detail it does not recognise keeps the sentence and the raw detail; nothing is dropped', () => {
    const g = groupFlags(['run 1000: margin_outside_filed_record: something new 0.5', 'run 3000: margin_outside_filed_record: something new 0.5',
        'run 1000: growth_outside_filed_record: op_margin.y2 0.1 (filed 0.2 to 0.3)', 'run 1000: return_above_base_year: odd', 'run 1000: brand_new_flag: z',
        'run 1000: growth_outside_filed_record: rev_growth.y1 0.0500 (filed 0.0400 to 0.0600)'], SEEDS);
    assert.deepEqual(g.notes.map((n) => [n.key, n.detail, n.occ.map((o) => o.run)]), [
        ['dcFlagMargin', 'something new 0.5', [0, 1]],
        ['dcFlagGrowth', 'op_margin.y2 0.1 (filed 0.2 to 0.3)', [0]],
        ['dcFlagReturn', 'odd', [0]],
        [null, 'brand new flag: z', [0]],
        ['dcFlagGrowth', 'rev_growth.y1 0.0500 (filed 0.0400 to 0.0600)', [0]],   // inside the range: no direction to state
    ]);
});

test('yearsShape: one year, three or more in a row as a span, otherwise a list', () => {
    assert.equal(yearsShape([]), null);
    assert.deepEqual(yearsShape([2]), { kind: 'one', n: 2 });
    assert.deepEqual(yearsShape([1, 2, 3, 4, 5]), { kind: 'span', a: 1, b: 5 });
    assert.deepEqual(yearsShape([1, 2]), { kind: 'list', list: '1, 2' });
    assert.deepEqual(yearsShape([1, 4]), { kind: 'list', list: '1, 4' });
});

// ── financial, operating v2, real estate, unknown keys ───────────────────────

const finRun = (roe1: number): DecidedRun => ({
    situation: { institution: 'insurer', roe_position: 'Claims were light.', base_year_representative: 'no', capital_constrained: 'no', why: 'A quiet year.' },
    inputs: { roe: [roe1, 0.2, 0.18, 0.16, 0.15], book_growth: [0.08, 0.05, 0.04, 0.04, 0.03], long_run_roe: 0.14, terminal_growth: 0.03, fade_years: 10 },
    ranges: { long_run_roe: [0.11, 0.17], book_growth_y3: [0.02, 0.06], terminal_growth: [0.02, 0.04] },
    reasons: { roe: { why: 'Q4 is known.', quotes: [{ id: 'F2', quote: 'Net income 100' }] }, long_run_roe: { why: 'Mid-cycle.', quotes: [] } },
});

test('a financial run: its own inputs in order, with its own labels and ranges', () => {
    const d: DecidedValuation = { runs: { '1000': finRun(0.34), '3000': finRun(0.3) } };
    const rows = inputRows(d);
    assert.deepEqual(rows.map((r) => r.key), ['roe', 'book_growth', 'long_run_roe', 'terminal_growth', 'fade_years']);
    assert.deepEqual(rows.map((r) => r.label), ['dcInRoe', 'dcInBookGrowth', 'dcInLongRoe', 'dcInLongGrowth', 'dcInFade']);
    assert.equal(rows[0].cells[0], '34.0%, 20.0%, 18.0%, 16.0%, 15.0%');
    assert.equal(rows[2].cells[1], '14.0% (low 11.0% to high 17.0%)');
    assert.equal(rows[4].cells[0], '10');
    assert.deepEqual(rows[0].whys[0], { text: 'Q4 is known.', quotes: [{ id: 'F2', quote: 'Net income 100' }] });
    assert.deepEqual(inputName('roe'), { key: 'dcInRoe' });
    assert.deepEqual(inputName('roe.y1'), { key: 'dcInRoeYear', n: 1 });
    assert.deepEqual(inputName('book_growth_y3'), { key: 'dcInBookYear', n: 3 });
    assert.equal(riskValue('long_run_roe', 0.1), '10.0%');
    assert.equal(isFinancialRun(finRun(0.3)), true);
    assert.equal(isFinancialRun(run(0.03)), false);
});

test('a financial situation: kind of institution, why the return is where it is, capital', () => {
    const items = situationItems(finRun(0.3));
    assert.deepEqual(items.map((i) => (i.kind === 'word' ? [i.label, i.value] : [i.head, i.text])), [
        ['dcSitInstitution', 'insurer'], ['dcSitRoeWhy', 'Claims were light.'], [null, 'A quiet year.'], ['dcSitCapital', 'no'],
    ]);
});

test('financial flags group like the operating ones, with the roe subjects', () => {
    const g = groupFlags(['run 1000: roe_outside_filed_record: roe.y1 0.3600 (filed -0.1750 to 0.3347)', 'run 1000: roe_outside_filed_record: long_run_roe 0.3700 (filed -0.1750 to 0.3347)',
        'run 3000: book_growth_outside_filed_record: book_growth.y2 0.0100 (filed 0.0200 to 0.1000)', 'run 1000: capital_constraint_not_modeled',
        'run 3000: capital_constraint_not_modeled'], SEEDS);
    assert.deepEqual(g.notes.map((n) => [n.key, n.subject, n.dir, n.lo, n.hi]), [
        ['dcNoteYears', 'roe', 'above', '-17.5%', '33.5%'], ['dcNoteLong', 'long_run_roe', 'above', '-17.5%', '33.5%'],
        ['dcNoteYears', 'book_growth', 'below', '2.0%', '10.0%'], ['dcFlagCapital', undefined, undefined, undefined, undefined],
    ]);
    assert.deepEqual(g.notes[3].occ.map((o) => o.run), [0, 1]);
});

const opRun = (): DecidedRun => ({
    ...run(0.03),
    situation: { cyclical: 'no', margin_position: 'Near its peak.', why: 'Steady.', base_year_representative: 'yes',
                 tax_rate_representative: { answer: 'no', why: 'The rate was helped by a credit.' }, debt_level_representative: { answer: 'yes', why: 'Normal.' } },
    adjustments: { cash_not_free: { what: 'Cash held for customers', amount: 1.2e9, quotes: [{ id: 'F1', quote: 'Customer funds 1.2' }] },
                   base_year_one_offs: [{ sign: 'charge', what: 'Restructuring', amount: 340e6, quotes: [{ id: 'F2', quote: 'Restructuring 340' }] }, { sign: 'gain', what: 'Sale of a unit', amount: 29.5e6, quotes: [] }] },
});

test('an operating run with adjustments: the answers with their sentences, and the adjustments merged over the runs', () => {
    const items = situationItems(opRun());
    assert.deepEqual(items.filter((i) => i.kind === 'word').map((i) => (i.kind === 'word' ? [i.label, i.value, i.why] : [])), [
        ['dcCyclical', 'no', ''], ['dcSitTax', 'no', 'The rate was helped by a credit.'], ['dcSitDebt', 'yes', 'Normal.'],
    ]);
    const other = opRun();
    other.adjustments = { cash_not_free: null, base_year_one_offs: [{ sign: 'charge', what: 'Restructuring', amount: 340e6, quotes: [] }] };
    const m = mergedAdjustments({ runs: { '1000': opRun(), '3000': other } });
    assert.deepEqual(m.map((a) => [a.kind, a.what, a.amount, a.runs]), [
        ['cash', 'Cash held for customers', '1.2B', [0]], ['charge', 'Restructuring', '340M', [0, 1]], ['gain', 'Sale of a unit', '29.5M', [0]],
    ]);
    assert.deepEqual(m[0].quotes, [{ id: 'F1', quote: 'Customer funds 1.2' }]);
    assert.deepEqual(mergedAdjustments({ runs: { '1000': run(0.03) } }), []);
    assert.deepEqual(mergedAdjustments({ runs: { '1000': { ...run(0.03), adjustments: { cash_not_free: null, base_year_one_offs: [] } } } }), []);
});

test('compactAmount: B, M, K and plain, with a true minus', () => {
    assert.deepEqual([1.2e9, 340e6, 29.5e6, 2e6, 12345, 12, -5e6, null].map(compactAmount), ['1.2B', '340M', '29.5M', '2M', '12.3K', '12', '−5M', '—']);
});

const reRun = (ffo: NonNullable<DecidedRun['real_estate']>['ffo']): DecidedRun => ({ ...run(0.03), real_estate: { property_business: 'owns_or_operates', ffo }, situation: { cyclical: 'yes', property_business: 'owns_or_operates' } });

test('a real-estate run: reported against derived FFO, per share or total, and the missing and underivable cases', () => {
    const a = reRun({ status: 'compared', reported: { value: 2.03, per: 'per_share' }, derived_after_preferred: 1436e6, per_share_divisor: 700e6, gap_after_preferred: 0.019 });
    const b = reRun({ status: 'compared', reported: { value: 900e6, per: 'total' }, derived_after_preferred: 927e6, per_share_divisor: null, gap_after_preferred: -0.0123 });
    assert.deepEqual(ffoViews({ runs: { '1000': a, '3000': a } }).map((f) => [f.status, f.reported, f.derived, f.perShare, f.gap, f.runs]), [['compared', '$2.03', '$2.05', true, '+1.9%', [0, 1]]]);
    assert.deepEqual(ffoViews({ runs: { '1000': a, '3000': b } }).map((f) => [f.reported, f.derived, f.gap, f.runs]), [['$2.03', '$2.05', '+1.9%', [0]], ['900M', '927M', '−1.2%', [1]]]);
    assert.deepEqual(ffoViews({ runs: { '1000': reRun({ status: 'not_reported_or_not_found' }), '3000': reRun({ status: 'not_derivable', reported: { value: 5, per: 'per_share' } }) } })
        .map((f) => [f.status, f.reported]), [['missing', null], ['not_derivable', '$5.00']]);
    assert.deepEqual(ffoViews({ runs: { '1000': reRun({ status: 'something_new' }) } }).map((f) => [f.status, f.raw]), [['other', 'something_new']]);
    assert.deepEqual(ffoViews({ runs: { '1000': run(0.03) } }), []);
    assert.deepEqual(situationItems(a).map((i) => (i.kind === 'word' ? [i.label, i.value] : [])), [['dcCyclical', 'yes'], ['dcSitProperty', 'owns_or_operates']]);
});

test('the new flag kinds get their sentences; ffo variants and unknown flags keep their words', () => {
    const g = groupFlags(['run 1000: tax_rate_representative_no: The 17% rate was helped by a credit.', 'run 3000: tax_rate_representative_no: The rate looks low.',
        'run 1000: debt_level_representative_no: Debt rose.', 'run 1000: ffo_derived_vs_reported: +1.9%', 'run 3000: ffo_derived_vs_reported: +1.9%',
        'run 1000: ffo_not_reported_or_not_found', 'run 1000: ffo_derived_preferred_dividends_taken_as_0', 'run 1000: ronic0_not_readjusted', 'run 3000: ronic0_not_readjusted',
        'run 1000: cash_interest_not_readjusted', 'run 1000: nwc_not_classified_taken_as_0', 'run 1000: real_estate_base', 'run 1000: ffo_derived_vs_reported: odd',
        'run 3000: a_flag_from_the_future: detail_here 3'], SEEDS);
    assert.deepEqual(g.notes.map((n) => [n.key, n.detail, n.vals, n.occ.map((o) => o.run)]), [
        ['dcFlagTaxRate', 'The 17% rate was helped by a credit.', undefined, [0]], ['dcFlagTaxRate', 'The rate looks low.', undefined, [1]],
        ['dcFlagDebt', 'Debt rose.', undefined, [0]], ['dcNoteFfoGap', '', ['+1.9%'], [0, 1]], ['dcFlagFfoMissing', '', undefined, [0]],
        ['dcFlagFfoOther', 'ffo derived preferred dividends taken as 0', undefined, [0]], ['dcFlagRonic', '', undefined, [0, 1]], ['dcFlagCashInterest', '', undefined, [0]],
        ['dcFlagNwc', '', undefined, [0]], ['dcFlagReBase', '', undefined, [0]], ['dcFlagFfoGap', 'odd', undefined, [0]], [null, 'a flag from the future: detail_here 3', undefined, [1]],
    ]);
});

test('an unknown input key is a row of its own, after the known ones, under its words; an unknown risk or situation key is kept', () => {
    const r1 = run(0.03);
    r1.inputs = { ...r1.inputs, working_capital_days: [41, 40.5], mystery_ratio: 0.1234567 };
    r1.reasons = { ...r1.reasons, working_capital_days: { why: 'Stable.', quotes: [] } };
    r1.situation = { ...r1.situation, some_new_view: 'Steady demand.', some_new_answer: { answer: 'maybe', why: 'Unsure.' }, base_year_representative: 'yes' };
    const rows = inputRows({ runs: { '1000': r1, '3000': run(0.04) } });
    assert.deepEqual(rows.slice(-2).map((r) => [r.key, r.label, r.name, r.cells]), [
        ['working_capital_days', null, 'working capital days', ['41, 40.5', '—']], ['mystery_ratio', null, 'mystery ratio', ['0.1235', '—']],
    ]);
    assert.equal(rows[0].key, 'rev_growth');
    assert.deepEqual(rows[rows.length - 2].whys[0], { text: 'Stable.', quotes: [] });
    assert.equal(riskValue('working_capital_days', 41), '41');
    assert.equal(humanise('cash_interest_not_readjusted'), 'cash interest not readjusted');
    const sit = situationItems(r1);
    assert.deepEqual(sit.slice(-2).map((i) => (i.kind === 'word' ? [i.name, i.value, i.why] : [i.name, i.text])), [['some new view', 'Steady demand.'], ['some new answer', 'maybe', 'Unsure.']]);
    assert.deepEqual(inputRows({ runs: {} }), []);
    assert.deepEqual(situationItems(undefined), []);
});
