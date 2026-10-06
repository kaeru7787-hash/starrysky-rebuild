import {
  angularSeparation,
  bodySnapshot,
  horizontalCoordinates,
  sunEquatorial,
} from './astronomy.js';
import { DeviceOrientationController } from './orientation.js';
import { SkyRenderer } from './renderer.js';
import { advanceSimulationTime, clampSimulationSpeed, isNearRealtime } from './simulation.js';

const elements = Object.fromEntries(
  [
    'app', 'sky', 'smartMode', 'pcMode', 'gyroMode', 'locationTrigger', 'locationSummary',
    'directionValue', 'altitudeValue', 'clockModeLabel', 'simDate', 'simTimezone',
    'timelineMarker', 'playPause', 'playIcon', 'speedInput', 'resetNow', 'objectPanel',
    'objectClose', 'objectKind', 'objectSymbol', 'objectName', 'objectDesignation',
    'objectData', 'objectNote', 'locationDialog', 'locationForm', 'latitudeInput',
    'longitudeInput', 'useGps', 'locationStatus', 'toast', 'sensorNote', 'canvasHint',
  ].map((id) => [id, document.getElementById(id)]),
);

const STORAGE_KEY = 'starrysky-atlas-settings-v1';
const DEFAULT_LOCATION = { latitude: 35, longitude: 135 };
const SPECTRAL_NOTES = {
  O: '非常に高温で青く輝くO型星です。', B: '高温で青白く見えるB型星です。',
  A: '白く見えるA型星です。', F: '黄白色に見えるF型星です。',
  G: '太陽に近い黄色のG型星です。', K: '橙色に見えるK型星です。',
  M: '比較的低温で赤く見えるM型星です。',
};

function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const latitude = Number(stored?.latitude);
    const longitude = Number(stored?.longitude);
    const hasSavedLocation = stored?.hasSavedLocation === true && Number.isFinite(latitude) && Number.isFinite(longitude);
    return {
      location: hasSavedLocation ? { latitude, longitude } : { ...DEFAULT_LOCATION },
      hasSavedLocation,
      displayMode: stored?.displayMode === 'pc' ? 'pc' : 'smart',
    };
  } catch {
    return { location: { ...DEFAULT_LOCATION }, hasSavedLocation: false, displayMode: 'smart' };
  }
}

const saved = readSettings();
const state = {
  location: saved.location,
  displayMode: saved.displayMode,
  simulatedTime: new Date(),
  speed: 1,
  playing: true,
  selected: null,
  gyroActive: false,
  locationRevision: 0,
  hasSavedLocation: saved.hasSavedLocation,
};

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      latitude: state.location.latitude,
      longitude: state.location.longitude,
      hasSavedLocation: state.hasSavedLocation,
      displayMode: state.displayMode,
    }));
  } catch {
    // Storage may be unavailable in private browsing. The app still works for this session.
  }
}

function formatCoordinate(value, positive, negative) {
  return `${value >= 0 ? positive : negative}${Math.abs(value).toFixed(2)}°`;
}

function updateLocationSummary() {
  elements.locationSummary.textContent = `${formatCoordinate(state.location.latitude, '北緯', '南緯')} ${formatCoordinate(state.location.longitude, '東経', '西経')}`;
  elements.latitudeInput.value = String(state.location.latitude);
  elements.longitudeInput.value = String(state.location.longitude);
}

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const timezoneName = new Intl.DateTimeFormat('ja-JP', { timeZoneName: 'short' })
  .formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value || '端末時刻';

function formatRightAscension(degrees) {
  const totalMinutes = ((degrees / 15) * 60 + 1440) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}h ${String(Math.floor(totalMinutes % 60)).padStart(2, '0')}m`;
}

function formatDeclination(degrees) {
  return `${degrees >= 0 ? '+' : '−'}${Math.abs(degrees).toFixed(1)}°`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 3200);
}

function setDetailRows(rows) {
  elements.objectData.replaceChildren();
  for (const [term, value] of rows) {
    const group = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    group.append(dt, dd);
    elements.objectData.append(group);
  }
}

function updateObjectPanel() {
  if (!state.selected) return;
  if (state.selected.type === 'star') {
    const star = state.selected.star;
    const horizontal = horizontalCoordinates(star.raDeg, star.decDeg, state.simulatedTime, state.location.latitude, state.location.longitude);
    elements.objectKind.textContent = 'STAR · 恒星';
    elements.objectSymbol.textContent = '✦';
    elements.objectName.textContent = star.properName || star.ja || `恒星 ${star.id}`;
    elements.objectDesignation.textContent = star.ja || star.constellation || `カタログ番号 ${star.id}`;
    setDetailRows([
      ['カタログ番号', String(star.id)], ['星座', star.constellation || '—'],
      ['等級', `${Number(star.mag).toFixed(2)} 等`], ['スペクトル型', star.color || '—'],
      ['赤経', formatRightAscension(star.raDeg)], ['赤緯', formatDeclination(star.decDeg)],
      ['方位', `${horizontal.azimuth.toFixed(1)}°`], ['高度', `${horizontal.altitude.toFixed(1)}°`],
    ]);
    elements.objectNote.textContent = SPECTRAL_NOTES[star.color] || '登録された恒星カタログの位置・明るさを表示しています。';
    return;
  }

  const { definition } = state.selected;
  const snapshot = bodySnapshot(definition, state.simulatedTime, state.location.latitude, state.location.longitude);
  const elongation = angularSeparation(snapshot.equatorial, sunEquatorial(state.simulatedTime));
  elements.objectKind.textContent = `${definition.key.toUpperCase()} · ${definition.kind}`;
  elements.objectSymbol.textContent = definition.symbol;
  elements.objectName.textContent = definition.name;
  elements.objectDesignation.textContent = `計算時刻 ${dateFormatter.format(state.simulatedTime)}`;
  setDetailRows([
    ['赤経', formatRightAscension(snapshot.equatorial.ra)], ['赤緯', formatDeclination(snapshot.equatorial.dec)],
    ['方位', `${snapshot.horizontal.azimuth.toFixed(1)}°`], ['高度', `${snapshot.horizontal.altitude.toFixed(1)}°`],
    ['太陽離角', `${elongation.toFixed(1)}°`],
    ['距離（概算）', definition.key === 'Moon' ? `${snapshot.equatorial.distance.toFixed(1)} 地球半径` : `${snapshot.equatorial.distance.toFixed(3)} AU`],
  ]);
  elements.objectNote.textContent = definition.note;
}

function selectObject(target) {
  state.selected = target;
  elements.objectPanel.classList.add('is-open');
  elements.objectPanel.setAttribute('aria-hidden', 'false');
  updateObjectPanel();
}

function cardinalDirection(heading) {
  return ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(heading / 45) % 8];
}

const renderer = new SkyRenderer(elements.sky, {
  onSelect: selectObject,
  onViewChange: ({ heading, pitch }) => {
    elements.directionValue.textContent = `${cardinalDirection(heading)} ${Math.round(heading)}°`;
    elements.altitudeValue.textContent = `高度 ${Math.round(pitch)}°`;
  },
});

let calibrationToastShown = false;

function updateGyroStatus(source, calibration) {
  const accuracy = Number.isFinite(calibration?.accuracy) ? `±${Math.round(calibration.accuracy)}°` : '';
  let message = `ジャイロ追従中 · ${source}`;
  let visualState = 'tracking';

  if (calibration?.state === 'calibrating') {
    const progress = Math.round((calibration.progress || 0) * 100);
    message = calibration.calibrated
      ? `端末を水平に保持 · 方位を再補正中 ${progress}%`
      : `端末を水平に保持 · 方位補正中 ${progress}%`;
    visualState = 'calibrating';
  } else if (calibration?.calibrated) {
    if (calibration.state === 'accuracy-poor') {
      message = `方位補正済み · 精度低下${accuracy ? ` ${accuracy}` : ''}のため補正値を固定中`;
      visualState = 'warning';
    } else {
      message = '方位補正済み · ジャイロ追従中';
      visualState = 'ready';
    }
  } else if (calibration?.state === 'needs-flat') {
    message = '端末を水平にして方位を補正';
    visualState = 'needs-action';
  } else if (calibration?.state === 'accuracy-poor') {
    message = `コンパス精度不足${accuracy ? ` ${accuracy}` : ''} · 磁石や金属から離してください`;
    visualState = 'warning';
  } else if (calibration?.state === 'unavailable' && !calibration?.calibrated) {
    message = `ジャイロ追従中 · ${source}`;
  }

  elements.sensorNote.textContent = message;
  elements.sensorNote.dataset.state = visualState;
  elements.sensorNote.hidden = false;

  if (calibration?.justCalibrated && !calibrationToastShown) {
    calibrationToastShown = true;
    showToast('水平コンパス補正が完了しました。端末を空へ向けてください。');
  }
}

const orientation = new DeviceOrientationController({
  initialHeading: () => renderer.getDirection().heading,
  onUpdate: ({ basis, source, calibration }) => {
    renderer.setGyroBasis(basis);
    updateGyroStatus(source, calibration);
  },
});

function setDisplayMode(mode) {
  state.displayMode = mode;
  elements.app.dataset.displayMode = mode;
  elements.smartMode.classList.toggle('is-active', mode === 'smart');
  elements.pcMode.classList.toggle('is-active', mode === 'pc');
  renderer.setDisplayMode(mode);
  saveSettings();
  renderer.render(true);
}

function setSpeed(value) {
  state.speed = clampSimulationSpeed(value);
  elements.speedInput.value = String(state.speed);
  for (const button of document.querySelectorAll('[data-speed]')) {
    button.classList.toggle('is-active', Number(button.dataset.speed) === state.speed);
  }
  updatePlaybackUi();
}

function updatePlaybackUi() {
  elements.playIcon.textContent = state.playing ? 'Ⅱ' : '▶';
  elements.playPause.setAttribute('aria-label', state.playing ? 'シミュレーションを一時停止' : 'シミュレーションを再生');
  const realtime = state.playing && state.speed === 1 && isNearRealtime(state.simulatedTime);
  elements.clockModeLabel.textContent = realtime ? 'REAL TIME' : state.playing ? `SIMULATION · ${state.speed.toLocaleString()}×` : 'PAUSED';
}

function updateClock() {
  elements.simDate.textContent = dateFormatter.format(state.simulatedTime);
  elements.simTimezone.textContent = `端末のタイムゾーン · ${timezoneName}`;
  const dayFraction = (state.simulatedTime.getHours() * 3600 + state.simulatedTime.getMinutes() * 60 + state.simulatedTime.getSeconds()) / 86400;
  elements.timelineMarker.style.left = `${dayFraction * 100}%`;
  updatePlaybackUi();
  updateObjectPanel();
}

function applyLocation(latitude, longitude, { save = true, message = '' } = {}) {
  state.location = { latitude, longitude };
  state.locationRevision += 1;
  state.hasSavedLocation = true;
  updateLocationSummary();
  if (save) saveSettings();
  renderer.render(true);
  if (message) showToast(message);
}

function requestLocation({ startup = false } = {}) {
  const requestRevision = state.locationRevision;
  if (!navigator.geolocation) {
    elements.locationStatus.textContent = 'このブラウザは位置情報に対応していません。';
    return;
  }
  elements.locationStatus.textContent = '現在地を取得しています…';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (requestRevision !== state.locationRevision) return;
      applyLocation(position.coords.latitude, position.coords.longitude, { message: '現在地を観測地点に設定しました。' });
      elements.locationStatus.textContent = '現在地を取得しました。';
      if (!startup) window.setTimeout(() => elements.locationDialog.close(), 450);
    },
    (error) => {
      const reason = error.code === 1 ? '位置情報の利用が許可されていません。' : '現在地を取得できませんでした。緯度・経度を入力できます。';
      elements.locationStatus.textContent = reason;
      if (!startup) showToast(reason);
    },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 },
  );
}

async function toggleGyro() {
  if (state.gyroActive) {
    orientation.stop();
    renderer.clearGyro();
    state.gyroActive = false;
    elements.gyroMode.classList.remove('is-active');
    elements.gyroMode.setAttribute('aria-pressed', 'false');
    elements.sensorNote.hidden = true;
    delete elements.sensorNote.dataset.state;
    calibrationToastShown = false;
    elements.canvasHint.textContent = 'ドラッグで空を見回す · 天体名をタップして詳細';
    renderer.render(true);
    return;
  }

  elements.gyroMode.disabled = true;
  elements.sensorNote.textContent = '端末方向センサーを待っています…';
  elements.sensorNote.dataset.state = 'calibrating';
  elements.sensorNote.hidden = false;
  const result = await orientation.start();
  elements.gyroMode.disabled = false;
  if (!result.ok) {
    renderer.clearGyro();
    elements.sensorNote.textContent = result.reason;
    elements.sensorNote.dataset.state = 'warning';
    showToast(result.reason);
    return;
  }
  state.gyroActive = true;
  calibrationToastShown = Boolean(result.calibration?.calibrated);
  elements.gyroMode.classList.add('is-active');
  elements.gyroMode.setAttribute('aria-pressed', 'true');
  elements.canvasHint.textContent = '端末を水平にすると方位補正 · 空へ向けて天体名をタップ';
  showToast(result.calibration?.calibrated
    ? 'ジャイロモードを開始しました。'
    : 'ジャイロを開始しました。端末を水平にすると方位を補正します。');
}

elements.smartMode.addEventListener('click', () => setDisplayMode('smart'));
elements.pcMode.addEventListener('click', () => setDisplayMode('pc'));
elements.gyroMode.addEventListener('click', toggleGyro);
elements.locationTrigger.addEventListener('click', () => {
  // An in-flight automatic GPS result must not overwrite coordinates the user is about to edit.
  state.locationRevision += 1;
  updateLocationSummary();
  elements.locationStatus.textContent = '';
  elements.locationDialog.showModal();
});
elements.useGps.addEventListener('click', () => requestLocation());
elements.locationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') {
    elements.locationDialog.close();
    return;
  }
  const latitude = Number(elements.latitudeInput.value);
  const longitude = Number(elements.longitudeInput.value);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    elements.locationStatus.textContent = '緯度は−90〜90、経度は−180〜180で入力してください。';
    return;
  }
  applyLocation(latitude, longitude, { message: '観測地点を更新しました。' });
  elements.locationDialog.close();
});
elements.playPause.addEventListener('click', () => { state.playing = !state.playing; updatePlaybackUi(); });
elements.speedInput.addEventListener('change', () => setSpeed(elements.speedInput.value));
elements.speedInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { setSpeed(elements.speedInput.value); elements.speedInput.blur(); }
});
for (const button of document.querySelectorAll('[data-speed]')) {
  button.addEventListener('click', () => setSpeed(button.dataset.speed));
}
elements.resetNow.addEventListener('click', () => {
  state.simulatedTime = new Date();
  state.playing = true;
  setSpeed(1);
  updateClock();
  showToast('現在時刻へ戻しました。');
});
elements.objectClose.addEventListener('click', () => {
  state.selected = null;
  elements.objectPanel.classList.remove('is-open');
  elements.objectPanel.setAttribute('aria-hidden', 'true');
  renderer.render(true);
});

let previousFrame = performance.now();
let lastClockUpdate = 0;
function frame(now) {
  const elapsed = Math.max(0, Math.min(now - previousFrame, 60000));
  previousFrame = now;
  if (state.playing && state.speed > 0) state.simulatedTime = advanceSimulationTime(state.simulatedTime, elapsed, state.speed);
  renderer.setScene({ date: state.simulatedTime, latitude: state.location.latitude, longitude: state.location.longitude, selected: state.selected });
  renderer.render();
  if (now - lastClockUpdate > 180) { updateClock(); lastClockUpdate = now; }
  requestAnimationFrame(frame);
}

updateLocationSummary();
setDisplayMode(state.displayMode);
setSpeed(1);
updateClock();
requestAnimationFrame(frame);
if (!saved.hasSavedLocation) requestLocation({ startup: true });
