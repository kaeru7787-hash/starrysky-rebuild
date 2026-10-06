import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CompassCalibrator,
  basisFromDeviceOrientation,
  circularMeanDegrees,
  compassCalibrationMeasurement,
} from '../src/orientation.js';
import { basisDirection } from '../src/renderer.js';

const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
};

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (vector) => Math.hypot(vector.x, vector.y, vector.z);

test('背面カメラ方向を全方位の視線として使う', () => {
  const north = basisDirection(basisFromDeviceOrientation(0, 90, 0));
  const east = basisDirection(basisFromDeviceOrientation(270, 90, 0));
  const south = basisDirection(basisFromDeviceOrientation(180, 90, 0));
  const west = basisDirection(basisFromDeviceOrientation(90, 90, 0));
  near(north.heading, 0);
  near(east.heading, 90);
  near(south.heading, 180);
  near(west.heading, 270);
  for (const direction of [north, east, south, west]) near(direction.pitch, 0);
});

test('端末を上へ向けると天頂、下へ向けると地面を表示する', () => {
  const ceiling = basisDirection(basisFromDeviceOrientation(0, 180, 0));
  const ground = basisDirection(basisFromDeviceOrientation(0, 0, 0));
  near(ceiling.pitch, 90);
  near(ground.pitch, -90);
});

test('画面回転後も背面カメラの視線は変わらない', () => {
  for (const screenAngle of [0, 90, 180, 270]) {
    const direction = basisDirection(basisFromDeviceOrientation(90, 90, 0, screenAngle));
    near(direction.heading, 270);
    near(direction.pitch, 0);
  }
});

test('上下移動は地面から水平線を通って天頂へ連続して追従する', () => {
  const pitches = [0, 45, 90, 135, 180]
    .map((beta) => basisDirection(basisFromDeviceOrientation(0, beta, 0)).pitch);
  assert.deepEqual(pitches.map((pitch) => Math.round(pitch) || 0), [-90, -45, 0, 45, 90]);
});

test('全方位・全画面角度でカメラ基底を正規直交に保つ', () => {
  for (const alpha of [0, 90, 180, 270]) {
    for (const screenAngle of [0, 90, 180, 270]) {
      const basis = basisFromDeviceOrientation(alpha, 90, 0, screenAngle);
      near(length(basis.right), 1);
      near(length(basis.up), 1);
      near(length(basis.forward), 1);
      near(dot(basis.right, basis.up), 0);
      near(dot(basis.right, basis.forward), 0);
      near(dot(basis.up, basis.forward), 0);
    }
  }
});

test('コンパス補正は端末が水平に近い場合だけ許可する', () => {
  const flat = compassCalibrationMeasurement({
    alpha: 0, beta: 0, gamma: 0, compassHeading: 0, compassAccuracy: 5,
  });
  const upright = compassCalibrationMeasurement({
    alpha: 0, beta: 90, gamma: 0, compassHeading: 218, compassAccuracy: 5,
  });
  assert.equal(flat.eligible, true);
  near(flat.offset, 0);
  assert.equal(upright.eligible, false);
  assert.equal(upright.reason, 'needs-flat');
});

test('水平判定の15度境界を守る', () => {
  const within = compassCalibrationMeasurement({
    alpha: 0, beta: 14.9, gamma: 0, compassHeading: 0, compassAccuracy: 5,
  });
  const outside = compassCalibrationMeasurement({
    alpha: 0, beta: 15.1, gamma: 0, compassHeading: 0, compassAccuracy: 5,
  });
  assert.equal(within.eligible, true);
  assert.equal(outside.eligible, false);
  assert.equal(outside.reason, 'needs-flat');
});

test('精度が悪いコンパス値は水平でも採用しない', () => {
  for (const compassAccuracy of [-1, 21, 90]) {
    const measurement = compassCalibrationMeasurement({
      alpha: 0, beta: 0, gamma: 0, compassHeading: 0, compassAccuracy,
    });
    assert.equal(measurement.eligible, false);
    assert.equal(measurement.reason, 'accuracy-poor');
  }
});

test('端末上端のコンパス方位から水平回転差を求める', () => {
  const measurement = compassCalibrationMeasurement({
    alpha: 90, beta: 0, gamma: 0, compassHeading: 0, compassAccuracy: 4,
  });
  assert.equal(measurement.eligible, true);
  near(measurement.rawTopHeading, 270);
  near(measurement.offset, 90);
});

test('0度境界をまたぐコンパス値を円周平均できる', () => {
  const mean = circularMeanDegrees([179, -179, 178, -178]);
  assert.ok(Math.abs(Math.abs(mean) - 180) < 1e-8);
});

test('水平で安定した値だけを確定し、立てた後は補正値を固定する', () => {
  const calibrator = new CompassCalibrator({ settleMilliseconds: 500, minimumSamples: 5 });
  const horizontal = {
    alpha: 90, beta: 0, gamma: 0, compassHeading: 0, compassAccuracy: 4,
  };
  let result;
  for (const now of [0, 125, 250, 375, 500]) result = calibrator.observe(horizontal, now);
  assert.equal(result.state, 'calibrated');
  assert.equal(result.calibrated, true);
  near(result.offset, 90);

  for (let index = 0; index < 20; index += 1) {
    result = calibrator.observe({
      alpha: index * 10,
      beta: 90,
      gamma: 0,
      compassHeading: index * 17,
      compassAccuracy: 4,
    }, 600 + index * 16);
  }
  assert.equal(result.state, 'needs-flat');
  assert.equal(result.calibrated, true);
  near(result.offset, 90);
});

test('急に飛んだコンパス値は、それ以前の平均から切り離す', () => {
  const calibrator = new CompassCalibrator({
    settleMilliseconds: 300,
    minimumSamples: 3,
    maxSampleDeviationDegrees: 5,
  });
  const sample = (compassHeading, now) => calibrator.observe({
    alpha: 0, beta: 0, gamma: 0, compassHeading, compassAccuracy: 3,
  }, now);

  sample(0, 0);
  sample(1, 100);
  let result = sample(40, 200);
  assert.equal(result.calibrated, false);
  result = sample(41, 300);
  result = sample(39, 400);
  assert.equal(result.calibrated, false);
  result = sample(40, 500);
  assert.equal(result.state, 'calibrated');
  near(result.offset, 40, 1);
});
