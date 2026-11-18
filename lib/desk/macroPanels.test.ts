// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/macroPanels.test.ts   (node:test; no other runner is installed)

import test from 'node:test';
import assert from 'node:assert/strict';
import type { MriRegime } from '../data-service';
import {
    componentBars, convictionKey, dimensionAverages, directionReason, directionRows, quadrantOf, quadrantTrail,
    regimeRuns, signed, sourceHealth, unchangedMonths, validationSections,
} from './macroPanels';

const regime = (patch: Partial<MriRegime>): MriRegime => ({ ...patch }) as MriRegime;

test('signed: zero is a value, null is a dash', () => {
    assert.equal(signed(0), '0.00');
    assert.equal(signed(0.274), '+0.27');
    assert.equal(signed(-0.469), '−0.47');
    assert.equal(signed(-0.0007), '0.00');             // rounds to zero, so no sign
    assert.equal(signed(null), '—');
    assert.equal(signed(undefined), '—');
});

test('directionReason: the four engine reasons in words, unknown ones passed through', () => {
    assert.deepEqual(directionReason('score_invalid_or_missing_at_as_of'), { key: 'mcdReasonNow', vars: {} });
    assert.deepEqual(directionReason('score_missing_6_months_before_as_of'), { key: 'mcdReasonBefore', vars: { n: 6 } });
    assert.deepEqual(directionReason('history_short:42_of_60_changes'), { key: 'mcdReasonShort', vars: { n: 42, m: 60 } });
    assert.deepEqual(directionReason('zero_dispersion'), { key: 'mcdReasonZero', vars: {} });
    assert.deepEqual(directionReason('something_new'), { key: 'mcdReasonRaw', vars: { raw: 'something_new' } });
    assert.deepEqual(directionReason(undefined), { key: 'mcdNoReason', vars: {} });
});

test('directionRows: a file without the direction field still gives the levels, and says why direction is empty', () => {
    const rows = directionRows(regime({ factors: { growth_momentum: { score: 0.27 }, dollar: { score: 0 } } }));
    assert.deepEqual(rows.map((r) => r.id), ['growth_momentum', 'dollar']);
    assert.equal(rows[0].level.value, 0.27);
    assert.equal(rows[1].level.value, 0);              // 0.0 stays a value
    assert.equal(rows[0].d3.value, null);
    assert.equal(rows[0].d3.reason?.key, 'mcdNoField');
});

test('directionRows: values come through, and a null names the engine reason', () => {
    const rows = directionRows(regime({
        factors: { growth_momentum: { score: 0.27 }, yield_curve: { score: null, reason: 'insufficient' } },
        dimension_direction: {
            growth_momentum: { d3: 0.1, d6: 0, z3: 0.5, z6: 0.2, reasons: {} },
            yield_curve: { d3: null, d6: null, z3: null, z6: null, reasons: { d3: 'score_missing_3_months_before_as_of', z6: 'history_short:10_of_60_changes' } },
        },
    }));
    const growth = rows.find((r) => r.id === 'growth_momentum')!;
    assert.equal(growth.d6.value, 0);
    assert.equal(growth.z6.value, 0.2);
    const curve = rows.find((r) => r.id === 'yield_curve')!;
    assert.equal(curve.level.value, null);
    assert.equal(curve.level.reason?.key, 'mcdLevelNone');
    assert.equal(curve.d3.reason?.key, 'mcdReasonBefore');
    assert.equal(curve.z6.reason?.key, 'mcdReasonShort');
});

test('directionRows: no factors means no rows', () => {
    assert.deepEqual(directionRows(null), []);
    assert.deepEqual(directionRows(regime({})), []);
});

test('quadrantOf follows the engine: growth up and inflation down is Goldilocks', () => {
    assert.equal(quadrantOf(0.3, -0.1), 'goldilocks');
    assert.equal(quadrantOf(0.3, 0.1), 'reflation');
    assert.equal(quadrantOf(-0.3, -0.1), 'recession');
    assert.equal(quadrantOf(-0.3, 0.1), 'stagflation');
});

test('dimensionAverages: monthly mean per dimension, unmapped left out; quadrantTrail pairs months', () => {
    const features = {
        end_date: '2026-03-01',
        dimensions: [
            { dimension_id: 'inflation_pressure', features: [
                { series_id: 'A', points: [{ date: '2026-01-01', value: 1 }, { date: '2026-02-01', value: 2 }] },
                { series_id: 'B', points: [{ date: '2026-01-01', value: 3 }] },
            ] },
            { dimension_id: 'growth_momentum', features: [{ series_id: 'C', points: [{ date: '2026-01-01', value: 0 }, { date: '2026-02-01', value: -1 }, { date: '2026-03-01', value: 5 }] }] },
            { dimension_id: 'unmapped', features: [{ series_id: 'D', points: [{ date: '2026-01-01', value: 9 }] }] },
        ],
    };
    const avgs = dimensionAverages(features);
    assert.deepEqual(avgs.map((a) => a.id), ['growth_momentum', 'inflation_pressure']);
    assert.equal(avgs[1].points[0].value, 2);            // (1 + 3) / 2
    const trail = quadrantTrail(avgs);
    assert.deepEqual(trail.map((t) => t.date), ['2026-01-01', '2026-02-01']);   // March has no inflation value
    assert.equal(trail[0].growth, 0);                    // a zero stays a zero
    const health = sourceHealth(features);
    assert.equal(health.find((h) => h.id === 'A')!.stale, true);
    assert.equal(health.find((h) => h.id === 'C')!.stale, false);
});

test('regimeRuns and unchangedMonths count the latest unbroken stretch', () => {
    const pts = ['recession', 'goldilocks', 'goldilocks', 'goldilocks'].map((r) => ({ reported_regime: r }));
    assert.deepEqual(regimeRuns(pts), [{ regime: 'recession', start: 0, len: 1 }, { regime: 'goldilocks', start: 1, len: 3 }]);
    assert.equal(unchangedMonths(pts), 3);
    assert.equal(unchangedMonths([]), null);
});

test('convictionKey cut points', () => {
    assert.equal(convictionKey(0.35), 'mcvHigh');
    assert.equal(convictionKey(0.12), 'mcvModerate');
    assert.equal(convictionKey(0.05), 'mcvLow');
    assert.equal(convictionKey(0), 'mcvLow');
    assert.equal(convictionKey(null), null);
});

test('componentBars sorts by contribution and labels regime priors', () => {
    const bars = componentBars({
        top_supporting_components: [{ component_id: 'inflation_pressure', component_type: 'dimension_exposure', contribution: 0.23 }],
        top_opposing_components: [{ component_id: 'goldilocks', component_type: 'regime_prior', contribution: -0.01 }, { component_id: 'x', contribution: null }],
    });
    assert.deepEqual(bars.map((b) => b.label), ['Inflation', 'Regime prior · Goldilocks']);
    assert.equal(bars[0].value, 0.23);
});

test('validationSections groups by cross-section in file order', () => {
    const s = validationSections({ summary: [
        { cross_section: 'gics_11', horizon: '1m' }, { cross_section: 'gics_11', horizon: '3m' }, { cross_section: 'pooled_17', horizon: '1m' },
    ] });
    assert.deepEqual(s.map((x) => [x.section, x.rows.length]), [['gics_11', 2], ['pooled_17', 1]]);
    assert.deepEqual(validationSections(null), []);
});
