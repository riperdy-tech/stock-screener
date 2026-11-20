// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/aiOverlay.test.ts   (node:test; no other runner is installed)
// The AI analyst's overlay (gemini_c_overlay.json) drives the freshness stamp, the phase and the funnel counts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFreshness, VERDICT_STALE_MS, type StatusInput } from './health';
import { deskNotice } from './notice';
import { funnelCounts } from './funnel';
import type { DeskRow } from './rankings';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const DAY = 24 * 3_600_000;

const status = (over: Partial<StatusInput> = {}): StatusInput => ({
    factor: null, depth: null, geminiC: null, ledgers: null, manifest: null, regime: null, anchor: null, pricesAsOf: null,
    ...over,
});
const overlay = (generated_at: string, count: number, valued_count: number) =>
    ({ schema: 's', generated_at, model: 'm', effort: 'e', count, valued_count, verdict_counts: {}, verdict_rule: '', note: '', tickers: {} }) as unknown as NonNullable<StatusInput['geminiC']>;

test('with the AI overlay loaded: phase C, its stamp, its counts', () => {
    const f = computeFreshness(status({ geminiC: overlay('2026-11-20T05:04:51Z', 120, 80) }), NOW);
    assert.equal(f.phase, 'C');
    assert.equal(f.aiLoaded, true);
    assert.equal(f.verdictAt, '2026-11-20T05:04:51Z');
    assert.equal(f.verdictStale, false);
    assert.equal(f.rebuiltCount, 120);
    assert.equal(f.actionableCount, 80);
});

test('zero valued names is a value, not an absence', () => {
    const f = computeFreshness(status({ geminiC: overlay('2026-11-20T05:04:51Z', 5, 0) }), NOW);
    assert.equal(f.actionableCount, 0);
    assert.equal(f.rebuiltCount, 5);
});

test('the 14-day stale rule follows the AI overlay stamp', () => {
    const fresh = new Date(NOW - VERDICT_STALE_MS + DAY).toISOString();
    const old = new Date(NOW - VERDICT_STALE_MS - DAY).toISOString();
    assert.equal(computeFreshness(status({ geminiC: overlay(fresh, 1, 1) }), NOW).verdictStale, false);
    assert.equal(computeFreshness(status({ geminiC: overlay(old, 1, 1) }), NOW).verdictStale, true);
});

test('without the AI overlay the depth rows decide (phase A when none is rebuilt)', () => {
    const f = computeFreshness(status({ depth: { generated_at: '2026-10-06T00:00:00Z', count: 0, tickers: {} } as unknown as StatusInput['depth'] }), NOW);
    assert.equal(f.aiLoaded, false);
    assert.equal(f.phase, 'A');
});

test('notice: AI overlay loaded but nothing valued says so; any valued name clears it', () => {
    assert.equal(deskNotice('C', 0, true)?.messageKey, 'noticeAiNoValue');
    assert.equal(deskNotice('C', 3, true), null);
    assert.equal(deskNotice(null, 0, true), null);
});

const row = (ticker: string, band: string, g?: { analysis: string; valued: boolean }) => ({
    ticker, info: undefined, fct: { fct_band: band, fct_nominated_doors: [] }, depth: undefined,
    ...(g ? { geminiC: g } : {}),
}) as unknown as DeskRow;

test('funnel read and valued steps count the AI overlay rows on the list', () => {
    const rows = [
        row('A', 'research_now', { analysis: 'complete', valued: true }),
        row('B', 'research_now', { analysis: 'complete', valued: false }),
        row('C', 'watchlist', { analysis: 'not run', valued: false }),
        row('D', 'watchlist'),
        row('E', 'pass', { analysis: 'complete', valued: true }),   // off the list: not counted
    ];
    const c = funnelCounts(rows, { band_counts: { research_now: 2, watchlist: 2 }, tickers: {} } as never);
    assert.equal(c.verdicts, 2);
    assert.equal(c.actionable, 1);
    assert.equal(c.queued, 2);
});
