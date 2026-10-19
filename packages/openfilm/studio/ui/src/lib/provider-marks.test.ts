import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listProviders } from '../../../server/providers/index.mjs';
import { MARKS } from './provider-marks.ts';

/* Settings → Providers shows each service by its mark: a new provider comes with one (from Lobe Icons or Simple Icons,
   which name their license), or it reads as a bare letter beside the others' logos */
test('every provider has its mark', () => {
  const missing = listProviders().map((p: { id: string }) => p.id).filter((id: string) => !MARKS[id]);
  assert.deepEqual(missing, [], `no mark in studio/ui/src/lib/provider-marks.ts for: ${missing.join(', ')}`);
});

test('a mark has a finite, positive square viewport, one path or its parts', () => {
  for (const [id, mark] of Object.entries(MARKS)) {
    const viewport = mark.viewBox.trim().split(/[\s,]+/).map(Number);
    assert.equal(viewport.length, 4, `${id}: viewBox needs x, y, width and height`);
    assert.ok(viewport.every(Number.isFinite), `${id}: viewBox must be finite`);
    assert.ok(viewport[2] > 0, `${id}: viewBox width must be positive`);
    assert.equal(viewport[2], viewport[3], `${id}: viewBox must be square`);
    assert.ok(mark.parts?.length ? mark.parts.every((p) => /^[Mm]/.test(p.d)) : /^[Mm]/.test(mark.d), id);
  }
});


test('Devin retains its original viewport and nonzero fill rule', () => {
  assert.equal(MARKS.devin.viewBox, '48 48 330 330');
  assert.equal(MARKS.devin.fillRule, 'nonzero');
});
