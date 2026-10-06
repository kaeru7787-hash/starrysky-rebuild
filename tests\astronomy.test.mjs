import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_DEFINITIONS,
  NORMALIZED_LINES,
  NORMALIZED_STARS,
  bodySnapshot,
  declinationFromDDMM,
  greenwichSiderealTime,
  horizontalCoordinates,
  sunEquatorial,
} from '../src/astronomy.js';

test('カタログ形式の赤緯DDMMを角度へ変換する', () => {
  assert.equal(declinationFromDDMM(-1642), -16.7);
  assert.equal(declinationFromDDMM(3847), 38 + 47 / 60);
});

test('子午線上の赤道座標は赤道上の観測者から天頂に見える', () => {
  const date = new Date('2026-01-01T00:00:00Z');
  const result = horizontalCoordinates(greenwichSiderealTime(date), 0, date, 0, 0);
  assert.ok(Math.abs(result.altitude - 90) < 1e-6);
});

test('未来へ進めると天体は東から子午線を越えて西へ動く', () => {
  const before = new Date('2026-01-01T00:00:00Z');
  const rightAscension = greenwichSiderealTime(before) + 15;
  const after = new Date(before.getTime() + (86164.0905 / 12) * 1000);
  const east = horizontalCoordinates(rightAscension, 0, before, 35, 0);
  const west = horizontalCoordinates(rightAscension, 0, after, 35, 0);
  assert.ok(east.azimuth > 90 && east.azimuth < 180, `開始時の方位は${east.azimuth}°`);
  assert.ok(west.azimuth > 180 && west.azimuth < 270, `未来時刻の方位は${west.azimuth}°`);
});

test('春分付近の太陽赤緯は赤道付近になる', () => {
  const sun = sunEquatorial(new Date('2026-03-20T15:00:00Z'));
  assert.ok(Math.abs(sun.dec) < 1, `sun dec was ${sun.dec}`);
});

test('移植したカタログと全太陽系天体が有限値を返す', () => {
  assert.equal(NORMALIZED_STARS.length, 888);
  assert.equal(NORMALIZED_LINES.length, 672);
  const date = new Date('2032-08-10T12:00:00Z');
  for (const definition of BODY_DEFINITIONS) {
    const snapshot = bodySnapshot(definition, date, 35.6812, 139.7671);
    for (const value of [snapshot.equatorial.ra, snapshot.equatorial.dec, snapshot.horizontal.azimuth, snapshot.horizontal.altitude]) {
      assert.ok(Number.isFinite(value), `${definition.key} returned ${value}`);
    }
  }
});
