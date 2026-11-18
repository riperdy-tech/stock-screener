// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/yardstick.test.ts   (node:test; no other runner is installed)

import test from 'node:test';
import assert from 'node:assert/strict';
import type { DeskRow } from './rankings';
import { aiCounts, analystTarget, ourValue, stripPos, stripScale, upside } from './yardstick';

type Opus = NonNullable<DeskRow['opus']>;
type Gem = NonNullable<DeskRow['geminiC']>;

const analyst = (mean: number | null, currency: string | null = null) =>
    ({ target_mean: mean, target_median: null, target_low: 9, target_high: 15, analysts: 7, rating: null, currency }) as Opus['analyst'];
const opus = (patch: Partial<Opus>) => ({ verdict: 'WATCH', currency: 'USD', value: { median: null, low: null, high: null }, ...patch }) as Opus;
const gem = (patch: Partial<Gem>) => ({ verdict: 'BUY', analysis: 'complete', date: '2026-11-17T13:44:38Z', valued: true, ...patch }) as Gem;
const row = (ticker: string, band: string, patch: Partial<DeskRow> = {}) =>
    ({ ticker, fct: { fct_band: band }, ...patch }) as unknown as DeskRow;

test('analystTarget: the file wins when its mean is a number', () => {
    const t = analystTarget(
        { row: { mean: 12.3, median: 12, high: 15, low: 9, fetched_at: '2026-11-18T01:02:03Z' }, generatedAt: '2026-11-18T02:00:00Z', source: 'Yahoo consensus via yfinance' },
        { opus: opus({ analyst: analyst(20) }), asOf: '2026-11-15' },
    );
    assert.deepEqual(t, { mean: 12.3, low: 9, high: 15, asOf: '2026-11-18', source: 'Yahoo consensus via yfinance', currency: null, comparable: true });
});

test('analystTarget: a file row without a fetch date takes the file date; a mean of 0 is a value', () => {
    const t = analystTarget({ row: { mean: 0 }, generatedAt: '2026-11-18T02:00:00Z' }, { opus: undefined });
    assert.equal(t?.mean, 0);
    assert.equal(t?.asOf, '2026-11-18');
    assert.equal(t?.low, null);
});

test('analystTarget: falls back to the overlay, with its date and currency', () => {
    const o = opus({ analyst: analyst(20) });
    for (const fileRow of [undefined, {}, { mean: null }, { mean: 'x' as unknown as number }]) {
        const t = analystTarget({ row: fileRow, generatedAt: '2026-11-18T02:00:00Z' }, { opus: o, asOf: '2026-11-15', source: 'Yahoo consensus via yfinance' });
        assert.deepEqual(t, { mean: 20, low: 9, high: 15, asOf: '2026-11-15', source: 'Yahoo consensus via yfinance', currency: 'USD', comparable: true });
    }
    const eur = analystTarget({ row: undefined }, { opus: opus({ analyst: analyst(20, 'EUR') }) });
    assert.equal(eur?.comparable, false);
    assert.equal(eur?.asOf, null);
});

test('analystTarget: none when neither carries a target', () => {
    assert.equal(analystTarget({ row: undefined }, { opus: undefined }), null);
    assert.equal(analystTarget({ row: { mean: null } }, { opus: opus({ analyst: null }) }), null);
    assert.equal(analystTarget({ row: undefined }, { opus: opus({ analyst: analyst(null) }) }), null);
});

test('ourValue: the read gives bear, base and bull', () => {
    const v = ourValue({ geminiC: gem({ value_base: 10, value_bear: 6, value_bull: 14, far_from_price: true, model: 'claude-sonnet-5-5' }), opus: opus({ verdict: 'AVOID' }) });
    assert.deepEqual(v, { base: 10, low: 6, high: 14, kind: 'scenarios', source: 'sonnet', date: '2026-11-17', far: true, currency: 'USD' });
});

test('ourValue: Claude quick valuation gives its range midpoint, else the code median', () => {
    const review = { checked_on: '2026-11-15', fair_value_range: [40, 60] } as Opus['review'];
    const noCallRead = gem({ verdict: 'NO_CALL', valued: false });
    assert.deepEqual(
        ourValue({ geminiC: noCallRead, opus: opus({ review, value: { median: 45, low: 41, high: 52 } }) }),
        { base: 50, low: 40, high: 60, kind: 'range', source: 'claude', date: '2026-11-15', far: false, currency: 'USD' },
    );
    assert.deepEqual(
        ourValue({ geminiC: undefined, opus: opus({ value: { median: 45, low: 41, high: 52 }, captured_at: '2026-11-15T14:34:42+09:00' }) }),
        { base: 45, low: 41, high: 52, kind: 'runs', source: 'claude', date: '2026-11-15', far: false, currency: 'USD' },
    );
});

test('ourValue: none for no verdict, a no call, or a verdict without a number', () => {
    assert.equal(ourValue({ geminiC: undefined, opus: undefined }), null);
    assert.equal(ourValue({ geminiC: gem({ verdict: 'NO_CALL', valued: false }), opus: opus({ verdict: 'NO_CALL' }) }), null);
    assert.equal(ourValue({ geminiC: undefined, opus: opus({}) }), null);
    assert.equal(ourValue({ geminiC: gem({ valued: true }), opus: undefined }), null);
});

test('upside: a fraction against the price; null without a positive price', () => {
    assert.equal(upside(12, 10), 0.19999999999999996);
    assert.equal(upside(0, 10), -1);
    assert.equal(upside(12, 0), null);
    assert.equal(upside(null, 10), null);
    assert.equal(upside(12, undefined), null);
});

test('stripScale: one scale over every number, padded; positions stay inside it', () => {
    const s = stripScale([10, null, 20, undefined, 15]);
    assert.deepEqual(s, { lo: 9.2, hi: 20.8 });
    assert.ok(Math.abs(stripPos(10, s!) - 6.8966) < 1e-3);
    assert.ok(Math.abs(stripPos(15, s!) - 50) < 1e-9);
    assert.equal(stripPos(100, s!), 100);
    assert.equal(stripPos(-5, s!), 0);
});

test('stripScale: one number sits in the middle; no number gives no scale; 0 is a number', () => {
    const one = stripScale([50]);
    assert.deepEqual(one, { lo: 45, hi: 55 });
    assert.equal(stripPos(50, one!), 50);
    assert.deepEqual(stripScale([0]), { lo: -1, hi: 1 });
    assert.equal(stripScale([null, undefined, NaN]), null);
});

test('aiCounts: list names only, counted from aiVerdict; a no call is not a verdict', () => {
    const rows = [
        row('AAA', 'research_now', { geminiC: gem({ verdict: 'BUY', date: '2026-11-16T00:00:00Z' }) }),
        row('BBB', 'watchlist', { geminiC: gem({ verdict: 'NO_CALL', valued: false, date: '2026-11-17T09:00:00Z' }), opus: opus({ verdict: 'WATCH' }) }),
        row('CCC', 'watchlist', { opus: opus({ verdict: 'AVOID' }) }),
        row('DDD', 'research_now', { geminiC: gem({ verdict: 'NO_CALL', valued: false, analysis: 'not run', date: '2026-11-18T00:00:00Z' }) }),
        row('EEE', 'watchlist'),
        row('GGG', 'watchlist', { geminiC: gem({ verdict: 'NO_CALL', valued: false, date: '2026-11-10T00:00:00Z' }) }),
        row('FFF', 'pass', { geminiC: gem({ verdict: 'BUY', date: '2026-11-19T00:00:00Z' }) }),
    ];
    assert.deepEqual(aiCounts(rows), { list: 6, buy: 1, watch: 1, avoid: 1, noCall: 1, verdicts: 3, newestRead: '2026-11-17' });
    assert.deepEqual(aiCounts([]), { list: 0, buy: 0, watch: 0, avoid: 0, noCall: 0, verdicts: 0, newestRead: null });
});
