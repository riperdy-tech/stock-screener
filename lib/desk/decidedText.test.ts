// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/decidedText.test.ts   (node:test; no other runner is installed)
// Invented data only: none of these figures belongs to a real company.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecidedRun, DecidedValuation } from '../data-service';
import { inputRows, inputText, lossLine, mergedRisks, oldDefaultsValue, parseFlag, pct1, pctList, riskInputKey, riskValue, runSeeds, taxLine, withRange } from './decidedText';

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

test('riskValue and riskInputKey: years for the fade, percent otherwise, unknown input stays raw', () => {
    assert.equal(riskValue('fade_years', 12), '12');
    assert.equal(riskValue('rev_growth', 0.01), '1.0%');
    assert.equal(riskValue('rev_growth', [0.01, 0.02]), '1.0%, 2.0%');
    assert.equal(riskValue('capex_to_revenue', undefined), '—');
    assert.equal(riskInputKey('capex_to_revenue'), 'dcInCapex');
    assert.equal(riskInputKey('toString'), null);
    assert.equal(riskInputKey('mystery'), null);
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
    assert.deepEqual(parseFlag('some_new_flag: x'), { key: null, detail: 'some_new_flag: x', seed: null });
    assert.deepEqual(parseFlag('constructor'), { key: null, detail: 'constructor', seed: null });
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
