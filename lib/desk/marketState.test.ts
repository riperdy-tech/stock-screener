// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/marketState.test.ts   (node:test; no other runner is installed)

import test from 'node:test';
import assert from 'node:assert/strict';
import type { MriMarketState } from '../data-service';
import {
    agreeKey, changeText, daysOld, driverFlagsFor, driverMoveRows, driverPhrase, econWordKey, economyRows, exposedKey, fundRows,
    isWarnStep, marketMetrics, marketStale, num, readState, sectorLeadersLaggards, sgn, stepKey, unitSuffix,
} from './marketState';

test('num and sgn: zero is a value, null is a dash, a true minus', () => {
    assert.equal(num(0), '0.0');
    assert.equal(num(-8.11), '−8.1');
    assert.equal(num(null), '—');
    assert.equal(num(undefined), '—');
    assert.equal(sgn(0), '0.0');
    assert.equal(sgn(7.88), '+7.9');
    assert.equal(sgn(-0.04), '0.0');         // rounds to zero, so no sign
    assert.equal(sgn(-3, 0), '−3');
});

test('changeText: unit decides the digits and the suffix', () => {
    assert.equal(unitSuffix('basis points'), ' bp');
    assert.equal(unitSuffix('log change, %'), '%');
    assert.equal(unitSuffix('points'), '');
    assert.equal(changeText(20.0000000002, 'basis points'), '+20 bp');
    assert.equal(changeText(-14.93, 'log change, %'), '−14.9%');
    assert.equal(changeText(0, 'basis points'), '0 bp');
    assert.equal(changeText(null, 'points'), '—');
});

test('marketStale: more than five days old is stale, exactly five is not', () => {
    const now = Date.parse('2026-11-25');
    assert.equal(daysOld('2026-11-20', now), 5);
    assert.equal(marketStale('2026-11-20', now), false);
    assert.equal(marketStale('2026-11-19', now), true);
    assert.equal(marketStale(null, now), false);
    assert.equal(marketStale('not a date', now), false);
});

test('stepKey and isWarnStep: four steps known, stress and crisis warn', () => {
    assert.equal(stepKey('calm'), 'mcTStepCalm');
    assert.equal(stepKey('crisis'), 'mcTStepCrisis');
    assert.equal(stepKey('toString'), null);
    assert.equal(stepKey(null), null);
    assert.equal(isWarnStep('stress'), true);
    assert.equal(isWarnStep('crisis'), true);
    assert.equal(isWarnStep('watch'), false);
});

test('driverPhrase: known drivers, both sector spellings, unknown shown with spaces', () => {
    assert.deepEqual(driverPhrase('rates'), { key: 'mcTDrvRates', vars: {} });
    assert.deepEqual(driverPhrase('growth_credit'), { key: 'mcTDrvGrowth', vars: {} });
    assert.deepEqual(driverPhrase('none'), { key: 'mcTDrvNone', vars: {} });
    assert.deepEqual(driverPhrase('sector_led:information_technology'), { key: 'mcTDrvSector', vars: { s: 'information technology' } });
    assert.deepEqual(driverPhrase('sector:information_technology'), { key: 'mcTDrvSector', vars: { s: 'information technology' } });
    assert.deepEqual(driverPhrase('some_new_driver'), { key: null, vars: { raw: 'some new driver' } });
    assert.equal(driverPhrase(null), null);
});

const ms = {
    facts: {
        spy: { below_200d: true, drawdown_pct: -8.11, return_5: -5.4, return_21: 0, return_63: -6.5 },
        vix: { level: 24.56, change_unit: 'points', change_21: 7.88 },
        breadth_below_200d_pct: 54.5,
        series: { DGS2: { level: 4.8, change_unit: 'basis points', change_21: -1 } },
        sectors: {
            A: { sector_id: 'consumer_staples', relative_21: 10.8 }, B: { sector_id: 'utilities', relative_21: 10.1 },
            C: { sector_id: 'real_estate', relative_21: 9.6 }, D: { sector_id: 'energy', relative_21: -3.6 },
            E: { sector_id: 'information_technology', relative_21: -8.3 }, F: { sector_id: 'financials', relative_21: 1.9 },
            G: { sector_id: 'materials', relative_21: 0 },
        },
    },
} as MriMarketState;

test('marketMetrics: values, a zero shown, a missing series is a dash', () => {
    const m = Object.fromEntries(marketMetrics(ms).map((x) => [x.key, x]));
    assert.equal(m.r5.value, '−5.4%');
    assert.equal(m.r21.value, '0.0%');
    assert.equal(m.dd.value, '−8.1%');
    assert.equal(m.m200.valueKey, 'mcTBelow');
    assert.equal(m.vix.value, '24.6');
    assert.deepEqual(m.vix.sub, { key: 'mcTChg21', v: '+7.9' });
    assert.equal(m.y2.value, '4.80%');
    assert.deepEqual(m.y2.sub, { key: 'mcTChg21', v: '−1 bp' });
    assert.equal(m.y10.value, '—');            // not in the data
    assert.equal(m.br.value, '55%');
    const empty = marketMetrics(null);
    assert.equal(empty.length, 11);
    assert.ok(empty.every((x) => x.value === '—' && x.valueKey === undefined));
});

test('sectorLeadersLaggards: top three and bottom three, worst first, no repeats', () => {
    const { leaders, laggards } = sectorLeadersLaggards(ms);
    assert.deepEqual(leaders.map((x) => x.name), ['Consumer Staples', 'Utilities', 'Real Estate']);
    assert.deepEqual(laggards.map((x) => x.name), ['Information Technology', 'Energy', 'Materials']);
    const two = sectorLeadersLaggards({ facts: { sectors: { A: { sector_id: 'a', relative_21: 1 }, B: { sector_id: 'b', relative_21: 2 } } } });
    assert.equal(two.leaders.length, 2);
    assert.equal(two.laggards.length, 0);
    assert.deepEqual(sectorLeadersLaggards(null), { leaders: [], laggards: [] });
});

test('readState, agreeKey, exposedKey', () => {
    assert.equal(readState(null), 'none');
    assert.equal(readState({ status: 'none' }), 'none');
    assert.equal(readState({ status: 'kept_previous', read: { why: 'x' } }), 'kept');
    assert.equal(readState({ status: 'fresh', read: { why: 'x' } }), 'fresh');
    assert.equal(readState({ status: 'fresh' }), 'none');
    assert.equal(agreeKey(true), 'mcTAgree');
    assert.equal(agreeKey(false), 'mcTDiffer');
    assert.equal(agreeKey(null), null);
    assert.equal(exposedKey('hurt'), 'mcTHurt');
    assert.equal(exposedKey('helped'), 'mcTHelped');
    assert.equal(exposedKey('x'), null);
});

test('economyRows: words as written, one number each, null is a dash, zero is shown', () => {
    const rows = economyRows({
        inflation: { level: 'well above target', direction: 'steady', series: { PCEPI: { rate_12: { value: 3.648, month: '2026-09' } } } },
        policy: { direction: 'tightening', funds_rate: { value: 3.88 }, change_6m: { value: 0.24 } },
        jobs: { state: 'steady', unemployment: { value: 4.1 }, rise_from_low: { value: 0 } },
        growth: { state: 'expanding', direction: 'steady', payrolls_rate_12: { value: null } },
    });
    assert.deepEqual(rows.map((r) => r.key), ['inflation', 'policy', 'jobs', 'growth']);
    assert.deepEqual(rows[0].numVars, { v: '3.6%' });
    assert.deepEqual(rows[1].numVars, { r: '3.88%', c: '+0.24' });
    assert.deepEqual(rows[2].numVars, { u: '4.1%', r: '0.0' });
    assert.deepEqual(rows[3].numVars, { v: '—' });
    assert.deepEqual(rows[3].words, ['expanding', 'steady']);
    const none = economyRows(null);
    assert.ok(none.every((r) => r.words.every((w) => w === null)));
    assert.equal(econWordKey('well above target'), 'mcTwWellAbove');
    assert.equal(econWordKey('on hold'), 'mcTwOnHold');
    assert.equal(econWordKey('new word'), null);
});

test('driverMoveRows and fundRows: 21-session window, sorted by realised, zero kept', () => {
    const x = {
        drivers: { market: { unit: 'percent (log return)', windows: { '21': { change: -7.69, moved: true }, '63': { change: 1, moved: false } } }, rates: { unit: 'basis points', windows: { '21': { change: 0, moved: false } } } },
        funds: {
            XLK: { sector_id: 'information_technology', readings: { '21': { realised: -8.3, implied_total: -3.5, unexplained: -4.8 } } },
            XLP: { sector_id: 'consumer_staples', readings: { '21': { realised: 0, implied_total: 1, unexplained: -1 } } },
            XLU: { sector_id: 'utilities', readings: {} },
            XLE: { sector_id: 'energy', readings: { '21': { realised: 5, implied_total: null, unexplained: null } } },
        },
    };
    assert.deepEqual(driverMoveRows(x).map((r) => [r.id, r.change, r.moved]), [['market', '−7.7%', true], ['rates', '0 bp', false]]);
    assert.deepEqual(fundRows(x).map((r) => r.id), ['XLE', 'XLP', 'XLK', 'XLU']);
    assert.equal(fundRows(x)[1].realised, 0);
    assert.equal(fundRows(x)[3].realised, null);
    assert.deepEqual(fundRows(null), []);
});

test('driverFlagsFor: absent entry or null exposures hides the panel; no flags is an empty list', () => {
    const p = {
        tickers: {
            AAA: { exposures: { market: {} }, flags: [{ text: 'One.' }, { text: '' }, { text: 'Two.' }] },
            BBB: { exposures: { market: {} }, flags: [] },
            CCC: { exposures: null, flags: [] },
        },
    };
    assert.deepEqual(driverFlagsFor(p, 'aaa'), ['One.', 'Two.']);
    assert.deepEqual(driverFlagsFor(p, 'BBB'), []);
    assert.equal(driverFlagsFor(p, 'CCC'), null);
    assert.equal(driverFlagsFor(p, 'ZZZ'), null);
    assert.equal(driverFlagsFor(null, 'AAA'), null);
});
