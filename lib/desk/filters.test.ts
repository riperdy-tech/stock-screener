// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/filters.test.ts   (node:test; no other runner is installed)

import test from 'node:test';
import assert from 'node:assert/strict';
import { aiVerdict } from './aiVerdict';
import { applyDeskFilters, filtersActive, NO_FILTERS, parseDeskUrl, writeDeskUrl, type DeskFilters } from './filters';
import type { DeskRow } from './rankings';

const row = (ticker: string, opus?: string, gem?: string) => ({
    ticker,
    info: undefined,
    fct: { fct_nominated_doors: [] },
    depth: undefined,
    ...(opus ? { opus: { verdict: opus } } : {}),
    ...(gem ? { geminiC: { verdict: gem, analysis: gem === 'NOT_RUN' ? 'not run' : 'complete' } } : {}),
}) as unknown as DeskRow;

const rows = [
    row('AAA', 'BUY'),               // Claude only
    row('BBB', 'BUY', 'AVOID'),      // both: Gemini wins
    row('CCC', undefined, 'WATCH'),  // Gemini only
    row('DDD', 'NO_CALL'),
    row('EEE'),                      // neither
];
const f = (patch: Partial<DeskFilters>): DeskFilters => ({ ...NO_FILTERS, ...patch });
const tickers = (fl: DeskFilters) => applyDeskFilters(rows, fl).map((r) => r.ticker);

test('aiVerdict: Gemini over Claude, Claude alone, neither', () => {
    assert.deepEqual(aiVerdict(rows[1]), { verdict: 'AVOID', source: 'gemini' });
    assert.deepEqual(aiVerdict(rows[0]), { verdict: 'BUY', source: 'claude' });
    assert.deepEqual(aiVerdict(rows[2]), { verdict: 'WATCH', source: 'gemini' });
    assert.equal(aiVerdict(rows[4]), null);
    assert.deepEqual(aiVerdict(row('FFF', 'BUY', 'NOT_RUN')), { verdict: 'BUY', source: 'claude' });   // a refused Gemini run hides nothing
});

test('ai filter: empty means all, one value, several values together', () => {
    assert.equal(filtersActive(NO_FILTERS), false);
    assert.equal(filtersActive(f({ ai: ['BUY'] })), true);
    assert.deepEqual(tickers(f({ ai: [] })), ['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    assert.deepEqual(tickers(f({ ai: ['BUY'] })), ['AAA']);                 // BBB is BUY at Claude but AVOID at Gemini
    assert.deepEqual(tickers(f({ ai: ['BUY', 'WATCH'] })), ['AAA', 'CCC']);
    assert.deepEqual(tickers(f({ ai: ['AVOID', 'NO_CALL'] })), ['BBB', 'DDD']);
});

test('ai filter: a name with neither verdict matches no ticked box', () => {
    assert.deepEqual(tickers(f({ ai: ['BUY', 'WATCH', 'AVOID', 'NO_CALL'] })), ['AAA', 'BBB', 'CCC', 'DDD']);
});

test('URL: ai round trip, empty omitted, canonical order', () => {
    const p = new URLSearchParams('tab=rankings');
    writeDeskUrl(p, { step: 3, how: false, filters: f({ ai: ['BUY', 'WATCH'] }) });
    assert.equal(p.get('ai'), 'BUY,WATCH');
    assert.equal(p.get('tab'), 'rankings');
    assert.deepEqual(parseDeskUrl(p).filters.ai, ['BUY', 'WATCH']);
    writeDeskUrl(p, { step: 3, how: false, filters: NO_FILTERS });
    assert.equal(p.has('ai'), false);
    assert.deepEqual(parseDeskUrl(new URLSearchParams('ai=WATCH,BUY')).filters.ai, ['BUY', 'WATCH']);
});

test('URL: legacy opus= is read as ai, ai wins when both, junk ignored, and the legacy key is dropped on write', () => {
    assert.deepEqual(parseDeskUrl(new URLSearchParams('opus=BUY')).filters.ai, ['BUY']);
    assert.deepEqual(parseDeskUrl(new URLSearchParams('opus=BUY&ai=AVOID')).filters.ai, ['AVOID']);
    assert.deepEqual(parseDeskUrl(new URLSearchParams('ai=NOPE,BUY')).filters.ai, ['BUY']);
    assert.deepEqual(parseDeskUrl(new URLSearchParams('opus=bogus')).filters.ai, []);
    const p = new URLSearchParams('opus=BUY');
    writeDeskUrl(p, parseDeskUrl(p));
    assert.equal(p.get('ai'), 'BUY');
    assert.equal(p.has('opus'), false);
});
