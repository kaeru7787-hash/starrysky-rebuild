import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SIMULATION_SPEED,
  advanceSimulationTime,
  clampSimulationSpeed,
  isNearRealtime,
} from '../src/simulation.js';

test('任意倍率でシミュレーション時刻を進める', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  assert.equal(advanceSimulationTime(start, 2000, 3600).toISOString(), '2026-01-01T02:00:00.000Z');
});

test('不正な速度と上限を安全に補正する', () => {
  assert.equal(clampSimulationSpeed(-3), 0);
  assert.equal(clampSimulationSpeed('invalid'), 1);
  assert.equal(clampSimulationSpeed(MAX_SIMULATION_SPEED + 1), MAX_SIMULATION_SPEED);
});

test('リアルタイム近傍を判定する', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(isNearRealtime(new Date(now.getTime() + 1500), now), true);
  assert.equal(isNearRealtime(new Date(now.getTime() + 2500), now), false);
});

