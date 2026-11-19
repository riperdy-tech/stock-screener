// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/macroPanels.test.ts   (node:test; no other runner is installed)

import test from 'node:test';
import assert from 'node:assert/strict';
import type { MriRegime } from '../data-service';
import {
    CLOUD_STALE_DAYS, cloudAgeDays, cloudDate, cloudStale, componentBars, convictionKey, coverageRows, dimensionAverages, directionReason,
    directionRows, fallbackNote, filterRuns, labelOf, lowConfidenceItems, maxRankChange, medianLeadMonths, newsSectorRows, newsThemeRows,
    newsWeightRange, overlayMoves, prettyId, quadrantOf, quadrantTrail, recessionSpans, regimeRuns, runTimeUtc, safeHttpUrl, sectorLabels, signed,
    sourceHealth, unchangedMonths, validationSections,
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

// ── The cloud news job's files (WO_MP2) ──

const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);

test('cloud age: whole days from the file date, never negative, null when unreadable', () => {
    assert.equal(cloudAgeDays('2026-11-18', noon('2026-11-18')), 0);
    assert.equal(cloudAgeDays('2026-11-18', noon('2026-11-21')), 3);
    assert.equal(cloudAgeDays('2026-11-18', noon('2026-11-10')), 0);      // a date in the future is not a negative age
    assert.equal(cloudAgeDays('2026-11-18T04:22:00', noon('2026-11-19')), 1);
    assert.equal(cloudAgeDays(null, noon('2026-11-19')), null);
    assert.equal(cloudAgeDays('not a date', noon('2026-11-19')), null);
});

test('cloud stale: older than three days, not at three; an unknown date is not called stale', () => {
    assert.equal(CLOUD_STALE_DAYS, 3);
    assert.equal(cloudStale('2026-11-18', noon('2026-11-21')), false);    // 3 days
    assert.equal(cloudStale('2026-11-18', noon('2026-11-22')), true);     // 4 days
    assert.equal(cloudStale(null, noon('2026-11-22')), false);
});

test('cloudDate: the date the sync recorded for a file, or null', () => {
    const manifest = { cloud_files: { 'news_score_report.json': { date: '2026-11-18' }, 'data_health.json': { date: null } } };
    assert.equal(cloudDate(manifest, 'news_score_report.json'), '2026-11-18');
    assert.equal(cloudDate(manifest, 'data_health.json'), null);
    assert.equal(cloudDate(manifest, 'nber_benchmark.json'), null);
    assert.equal(cloudDate(null, 'news_score_report.json'), null);
});

test('safeHttpUrl: only http and https become links', () => {
    assert.equal(safeHttpUrl('https://www.federalreserve.gov/feeds/press_all.xml'), 'https://www.federalreserve.gov/feeds/press_all.xml');
    assert.equal(safeHttpUrl('http://example.com/a'), 'http://example.com/a');
    assert.equal(safeHttpUrl('javascript:alert(1)'), null);
    assert.equal(safeHttpUrl('data:text/html,hi'), null);
    assert.equal(safeHttpUrl('not a url'), null);
    assert.equal(safeHttpUrl(null), null);
});

test('news theme and sector rows: both lists together, strongest first, a score of 0 kept, rows without a score dropped', () => {
    const rows = newsThemeRows({
        top_positive_macro_themes: [{ id: 'inflation_pressure', score: 7.8, item_count: 195 }, { id: 'flat', score: 0, item_count: 3 }],
        top_negative_macro_themes: [{ id: 'growth_momentum', score: -2.1 }, { id: 'broken', score: null }, { score: 4 }],
    });
    assert.deepEqual(rows.map((r) => [r.id, r.score, r.items]), [['inflation_pressure', 7.8, 195], ['flat', 0, 3], ['growth_momentum', -2.1, null]]);
    const sectors = newsSectorRows({
        top_sector_news_tailwinds: [{ id: 'energy', score: 3, item_count: 10 }],
        top_sector_news_headwinds: [{ id: 'real_estate', score: -6, item_count: 12 }],
    });
    assert.deepEqual(sectors.map((r) => r.id), ['energy', 'real_estate']);
    assert.deepEqual(newsThemeRows(null), []);
});

test('lowConfidenceItems: at most eight, items with no text dropped', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ news_id: `n${i}`, title: `t${i}` }));
    assert.equal(lowConfidenceItems({ low_confidence_items: items }).length, 8);
    assert.equal(lowConfidenceItems({ low_confidence_items: [{ news_id: 'x' }] }).length, 0);
    assert.deepEqual(lowConfidenceItems(null), []);
});

test('sector labels: the ranking supplies them, an unknown id is title-cased', () => {
    const labels = sectorLabels({ sector_ranking: [{ sector_id: 'energy', label: 'Energy' }, { sector_id: 'x' }] } as never);
    assert.equal(labelOf('energy', labels), 'Energy');
    assert.equal(labelOf('consumer_staples', labels), 'Consumer staples');
    assert.equal(labelOf('oil_gas_ep', labels), 'Oil & Gas E&P');
    assert.equal(labelOf(null, labels), '—');
});

test('overlay moves: macro-only rank from the macro score, thin when the news weight is 0, empty when a row is incomplete', () => {
    const combined = {
        combined_experimental_ranking: [
            { sector_id: 'a', rank: 1, sector_macro_score: 0.5, news_component_weight: 0 },
            { sector_id: 'b', rank: 2, sector_macro_score: 1.5, news_component_weight: 0.25 },
            { sector_id: 'c', rank: 3, sector_macro_score: -1, news_component_weight: 0 },
        ],
    };
    const moves = overlayMoves(combined);
    assert.deepEqual(moves.map((m) => [m.id, m.from, m.to, m.thin]), [['a', 2, 1, true], ['b', 1, 2, false], ['c', 3, 3, true]]);
    assert.equal(maxRankChange(moves), 1);
    assert.deepEqual(newsWeightRange(combined), { min: 0, max: 0.25 });
    assert.deepEqual(overlayMoves({ combined_experimental_ranking: [{ sector_id: 'a', rank: 1 }] }), []);
    assert.deepEqual(overlayMoves(null), []);
    assert.equal(newsWeightRange({ combined_experimental_ranking: [{ sector_id: 'a' }] }), null);
});

test('coverage rows: sources ok and not dead, out of those configured, per group', () => {
    const rows = coverageRows({
        news_health: {
            groups: [{ group: 'labor', sources: ['bls', 'dol'] }, { group: 'real_estate', sources: ['hw'], uncovered: true }],
            sources: [
                { source_id: 'bls', status: 'ok', dead: false },
                { source_id: 'dol', status: 'ok', dead: true },
                { source_id: 'hw', status: 'degraded' },
            ],
        },
    });
    assert.deepEqual(rows, [{ id: 'labor', ok: 1, total: 2, uncovered: false }, { id: 'real_estate', ok: 0, total: 1, uncovered: true }]);
    assert.deepEqual(coverageRows({ news_health: {} }), []);
    assert.deepEqual(coverageRows(null), []);
});

test('fallback note: only an extended input has one; the narrow dollar index is named; months are optional', () => {
    assert.equal(fallbackNote({ series_id: 'DGS10', extended_by_fallback: false }), null);
    assert.equal(fallbackNote({ series_id: 'DGS10' }), null);
    assert.deepEqual(fallbackNote({ series_id: 'NNUSBIS', extended_by_fallback: true, fallback_months: 3 }), { key: 'mcfbNarrowMonths', vars: { n: 3 } });
    assert.deepEqual(fallbackNote({ series_id: 'NNUSBIS', extended_by_fallback: true }), { key: 'mcfbNarrow', vars: { n: '' } });
    assert.deepEqual(fallbackNote({ series_id: 'X', extended_by_fallback: true, fallback_months: 0 }), { key: 'mcfbGenericMonths', vars: { n: 0 } });
});

test('NBER: spans only when the status is ok; median timing from the detections', () => {
    const nber = {
        status: 'ok',
        nber_recessions: [{ start: '2001-03', end: '2001-11' }, { start: '2020-02' }],
        recession_detection: [{ lead_lag_months: -6 }, { lead_lag_months: 0 }, { lead_lag_months: -2 }, { lead_lag_months: null }],
    };
    assert.deepEqual(recessionSpans(nber), [{ start: '2001-03', end: '2001-11' }]);
    assert.deepEqual(recessionSpans({ ...nber, status: 'error' }), []);
    assert.deepEqual(recessionSpans(null), []);
    assert.equal(medianLeadMonths(nber), -2);
    assert.equal(medianLeadMonths({ recession_detection: [{ lead_lag_months: -4 }, { lead_lag_months: 2 }] }), -1);
    assert.equal(medianLeadMonths({ recession_detection: [] }), null);
});

test('run history: filter by mode, newest first as given, capped, with the full count', () => {
    const runs = [
        ...Array.from({ length: 40 }, (_, i) => ({ run_id: `d${i}`, run_mode: 'daily' })),
        { run_id: 'r1', run_mode: 'replay' },
    ];
    const all = filterRuns({ runs }, 'all');
    assert.equal(all.rows.length, 30);
    assert.equal(all.total, 41);
    assert.equal(filterRuns({ runs }, 'live').total, 40);
    assert.deepEqual(filterRuns({ runs }, 'replay').rows.map((r) => r.run_id), ['r1']);
    assert.deepEqual(filterRuns(null, 'all'), { rows: [], total: 0 });
});

test('run time: the UTC time from a run id, null when absent', () => {
    assert.equal(runTimeUtc('20261118T035925Z-b08d849a'), '03:59 UTC');
    assert.equal(runTimeUtc('replay-2026-11'), null);
    assert.equal(runTimeUtc(null), null);
});

test('prettyId: acronyms in capitals, other words capitalised', () => {
    assert.equal(prettyId('cnbc_retail'), 'CNBC Retail');
    assert.equal(prettyId('technology_ai'), 'Technology AI');
    assert.equal(prettyId('credit_financial_conditions'), 'Credit Financial Conditions');
    assert.equal(prettyId(''), '');
});

test('series and dimension names follow the reader\'s language and fall back to English for an id without a key', async () => {
    const { seriesLabel, dimensionLabel, featureLabel } = await import('./macroPanels');
    const { TRANSLATIONS } = await import('../i18n');
    const tOf = (lang: 'en' | 'ko' | 'zh') => (key: string) => (TRANSLATIONS[lang] as Record<string, string>)[key] || (TRANSLATIONS.en as Record<string, string>)[key] || key;
    assert.equal(seriesLabel(tOf('en') as never, 'ICSA'), 'Initial jobless claims');
    assert.equal(seriesLabel(tOf('ko') as never, 'ICSA'), '신규 실업수당 청구');
    assert.equal(dimensionLabel(tOf('zh') as never, 'credit_liquidity'), '金融狀況');
    assert.equal(seriesLabel(tOf('ko') as never, 'UNKNOWN1'), 'UNKNOWN1');
    assert.equal(dimensionLabel(tOf('ko') as never, 'some_new_dimension'), 'Some new dimension');
    assert.equal(featureLabel({ feature_id: 'icsa_level', series_id: 'ICSA' }, (id) => seriesLabel(tOf('ko') as never, id)), '신규 실업수당 청구 · level');
});
