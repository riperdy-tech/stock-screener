// Run: node node_modules/sucrase/bin/sucrase-node lib/desk/bookMembership.test.ts   (node:test; no other runner is installed)
// A stock is in the AI book when it is in ledgers.ai_book.state.holdings; the stopped monthly books are never shown.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bookMembership } from './stockPage';

const h = { AAA: { entry_date: '2026-11-27', entry_price: 100 } };

test('bookMembership: in the AI book when held there; P&L from the live price', () => {
    const out = bookMembership({ ledgers: { ai_book: { state: { holdings: h } } } }, 'AAA', 110);
    assert.equal(out.length, 1);
    assert.equal(out[0].book, 'ai_book');
    assert.equal(out[0].entryPrice, 100);
    assert.ok(Math.abs((out[0].pnlPct ?? 0) - 10) < 1e-9);
});

test('bookMembership: absent ai_book, or a stock not in it, gives no row; stopped books are ignored', () => {
    assert.deepEqual(bookMembership({ ledgers: {} }, 'AAA', 110), []);
    assert.deepEqual(bookMembership({ ledgers: { ai_book: { state: { holdings: {} } } } }, 'AAA', 110), []);
    assert.deepEqual(bookMembership({ ledgers: { qwen_book: { state: { holdings: h } }, code_book: { state: { holdings: h } } } }, 'AAA', 110), []);
});
