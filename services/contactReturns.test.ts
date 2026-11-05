import test from 'node:test';
import assert from 'node:assert/strict';
import { shortReturnType, sortReturns, statusClass, type ContactReturn } from './contactReturns.ts';

const ret = (taxYear: string, updatedAt: string | null, returnId = taxYear + (updatedAt ?? '')): ContactReturn => ({
  returnId, taxYear, returnType: 'Individual Tax Return (Form 1040)', status: 'Filed', updatedAt,
});

test('shortReturnType keeps just the form number', () => {
  assert.equal(shortReturnType('Individual Tax Return (Form 1040)'), '1040');
  assert.equal(shortReturnType('Partnership Return (Form 1065)'), '1065');
  assert.equal(shortReturnType('S Corporation Return (Form 1120-S)'), '1120-S');
  assert.equal(shortReturnType('Exempt Organization (form 990-ez)'), '990-EZ');
  assert.equal(shortReturnType('  Amended Return  '), 'Amended Return');
  assert.equal(shortReturnType(''), '');
  assert.equal(shortReturnType(null), '');
});

test('sortReturns puts the newest tax year first, then the latest update', () => {
  const sorted = sortReturns([
    ret('2023', '2026-01-01'),
    ret('2025', '2026-01-01'),
    ret('2024', '2026-03-01'),
    ret('2025', '2026-02-01'),
  ]);
  assert.deepEqual(sorted.map((r) => [r.taxYear, r.updatedAt]), [
    ['2025', '2026-02-01'],
    ['2025', '2026-01-01'],
    ['2024', '2026-03-01'],
    ['2023', '2026-01-01'],
  ]);
});

test('sortReturns puts returns without a valid year last and does not change its input', () => {
  const input = [ret('', '2026-05-01'), ret('2024', null), ret('n/a', '2026-06-01')];
  const sorted = sortReturns(input);
  assert.deepEqual(sorted.map((r) => r.taxYear), ['2024', 'n/a', '']);
  assert.deepEqual(input.map((r) => r.taxYear), ['', '2024', 'n/a']);
});

test('statusClass uses the FilersHub dashboard colors, with a neutral fallback', () => {
  assert.equal(statusClass('Filed'), 'bg-cyan-50 text-cyan-600');
  assert.equal(statusClass('Missing Documents'), 'bg-rose-50 text-rose-600');
  assert.equal(statusClass('Ready for Signature'), 'bg-purple-50 text-purple-600');
  assert.equal(statusClass('Something New'), 'bg-slate-100 text-slate-600');
  assert.equal(statusClass(''), 'bg-slate-100 text-slate-600');
});
