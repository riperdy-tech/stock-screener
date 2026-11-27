// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/nav.test.ts   (node:test; no other runner is installed)

import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARKS, SIXTY_FORTY, buildCurve, sixtyForty } from './nav';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('60/40 starts at 100 and takes 60% of SPY\'s day and 40% of AGG\'s, set back to 60/40 every close', () => {
    const out = sixtyForty([
        { date: '2026-11-25', spy: 100, agg: 50 },
        { date: '2026-11-27', spy: 110, agg: 50 },      // SPY +10%, AGG flat: +6%
        { date: '2026-11-30', spy: 110, agg: 45 },      // SPY flat, AGG -10%: -4%
    ]);
    assert.deepEqual(out.map((r) => r.date), ['2026-11-25', '2026-11-27', '2026-11-30']);
    assert.ok(close(out[0].value, 100) && close(out[1].value, 106) && close(out[2].value, 106 * 0.96));
});

test('a day missing either close is skipped and the next return runs from the last day that had both', () => {
    const out = sixtyForty([
        { date: 'a', spy: null, agg: 50 },
        { date: 'b', spy: 100, agg: 50 },
        { date: 'c', spy: 105, agg: null },
        { date: 'd', spy: 110, agg: 55 },               // from b: SPY +10%, AGG +10%
    ]);
    assert.deepEqual(out.map((r) => r.date), ['b', 'd']);
    assert.ok(close(out[1].value, 110));
    assert.deepEqual(sixtyForty([]), []);
});

test('the curve carries 60/40 beside the ETFs when SPY and AGG closes are stored, and not without AGG', () => {
    const nav = (agg: number | null) => [
        { date: '2026-11-25', nav: 100, benches: { SPY: 100, QQQ: 200, AGG: agg } },
        { date: '2026-11-27', nav: 101, benches: { SPY: 110, QQQ: 210, AGG: agg } },
    ];
    assert.ok((BENCHMARKS as readonly string[]).includes(SIXTY_FORTY) && (BENCHMARKS as readonly string[]).includes('SOXL'));
    const withAgg = buildCurve({ ledgers: { equal: { nav_series: nav(50) } } }, null);
    assert.ok(close(withAgg.series[SIXTY_FORTY][1] as number, 106) && close(withAgg.series.QQQ[1] as number, 105));
    const without = buildCurve({ ledgers: { equal: { nav_series: nav(null) } } }, null);
    assert.equal(without.series[SIXTY_FORTY], undefined);
});
