import test from 'node:test';
import assert from 'node:assert/strict';
import { applyManualDrag, basisDirection, clipLineToRect, manualCameraBasis } from '../src/renderer.js';

test('両端が画面外でも横切る星座線を残す', () => {
  assert.deepEqual(clipLineToRect(-20, 50, 120, 50, 0, 0, 100, 100), {
    x1: 0, y1: 50, x2: 100, y2: 50,
  });
});

test('画面と交差しない線を除外する', () => {
  assert.equal(clipLineToRect(-20, -10, 120, -10, 0, 0, 100, 100), null);
});

test('手動カメラの方位と高度を復元できる', () => {
  const direction = basisDirection(manualCameraBasis(225, 42));
  assert.ok(Math.abs(direction.heading - 225) < 1e-9);
  assert.ok(Math.abs(direction.pitch - 42) < 1e-9);
});

test('通常モードではドラッグした方向へ星空が追従する', () => {
  const movedRight = applyManualDrag(180, 25, 100, 0, 1000, 500);
  const movedDown = applyManualDrag(180, 25, 0, 100, 1000, 500);
  assert.ok(movedRight.heading < 180, '右ドラッグ時は視線を左へ回して星空を右へ動かす');
  assert.ok(movedDown.pitch > 25, '下ドラッグ時は視線を上げて星空を下へ動かす');
});
