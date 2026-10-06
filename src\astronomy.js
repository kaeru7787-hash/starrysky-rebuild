import { CONSTELLATION_LINES, STARS } from './catalog-data.js';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function degToRad(value) {
  return value * DEG;
}

export function radToDeg(value) {
  return value * RAD;
}

export function normalizeDegrees(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function normalizeSignedDegrees(value) {
  return normalizeDegrees(value + 180) - 180;
}

export function declinationFromDDMM(value) {
  const numeric = Number(value) || 0;
  const sign = numeric < 0 ? -1 : 1;
  const absolute = Math.abs(numeric);
  const degrees = Math.floor(absolute / 100);
  const minutes = absolute - degrees * 100;
  return sign * (degrees + minutes / 60);
}

export function julianDate(date) {
  return 2440587.5 + date.getTime() / 86400000;
}

export function greenwichSiderealTime(date) {
  const j = julianDate(date);
  const centuries = (j - 2451545) / 36525;
  return normalizeDegrees(
    280.46061837 +
      360.98564736629 * (j - 2451545) +
      0.000387933 * centuries * centuries -
      (centuries * centuries * centuries) / 38710000,
  );
}

export function horizontalCoordinates(ra, dec, date, latitude, longitude) {
  const localSiderealTime = normalizeDegrees(greenwichSiderealTime(date) + longitude);
  const hourAngle = degToRad(localSiderealTime - ra);
  const declination = degToRad(dec);
  const observerLatitude = degToRad(latitude);
  const sinAltitude =
    Math.sin(declination) * Math.sin(observerLatitude) +
    Math.cos(declination) * Math.cos(observerLatitude) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const y = Math.sin(hourAngle);
  const x =
    Math.cos(hourAngle) * Math.sin(observerLatitude) -
    Math.tan(declination) * Math.cos(observerLatitude);
  const azimuth = Math.atan2(y, x) + Math.PI;
  return {
    azimuth: normalizeDegrees(radToDeg(azimuth)),
    altitude: radToDeg(altitude),
  };
}

function sinDegrees(value) {
  return Math.sin(degToRad(value));
}

function cosDegrees(value) {
  return Math.cos(degToRad(value));
}

function atan2Degrees(y, x) {
  return radToDeg(Math.atan2(y, x));
}

function solveKepler(meanAnomaly, eccentricity) {
  const anomaly = normalizeDegrees(meanAnomaly);
  let eccentricAnomaly =
    anomaly +
    RAD * eccentricity * sinDegrees(anomaly) * (1 + eccentricity * cosDegrees(anomaly));

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const next =
      eccentricAnomaly -
      (eccentricAnomaly - RAD * eccentricity * sinDegrees(eccentricAnomaly) - anomaly) /
        (1 - eccentricity * cosDegrees(eccentricAnomaly));
    if (Math.abs(next - eccentricAnomaly) < 1e-8) {
      eccentricAnomaly = next;
      break;
    }
    eccentricAnomaly = next;
  }
  return eccentricAnomaly;
}

function sunBase(date) {
  const days = julianDate(date) - 2451543.5;
  const longitudeCorrection = -0.0000382394 * days;
  const obliquity = 23.4393 - 3.563e-7 * days;
  const perihelion = 282.9404 + 0.0000470935 * days;
  const eccentricity = 0.01671022 - 1.151e-9 * days;
  const meanAnomaly = 356.047 + 0.9856002585 * days;
  const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
  const xv = cosDegrees(eccentricAnomaly) - eccentricity;
  const yv = Math.sqrt(1 - eccentricity * eccentricity) * sinDegrees(eccentricAnomaly);
  const trueAnomaly = atan2Degrees(yv, xv);
  const distance = Math.hypot(xv, yv);
  const solarLongitude = trueAnomaly + perihelion + longitudeCorrection;
  return {
    days,
    longitudeCorrection,
    obliquity,
    perihelion,
    meanAnomaly,
    distance,
    xs: distance * cosDegrees(solarLongitude),
    ys: distance * sinDegrees(solarLongitude),
  };
}

export function sunEquatorial(date) {
  const sun = sunBase(date);
  const x = sun.xs;
  const y = sun.ys * cosDegrees(sun.obliquity);
  const z = sun.ys * sinDegrees(sun.obliquity);
  return {
    ra: normalizeDegrees(atan2Degrees(y, x)),
    dec: atan2Degrees(z, Math.hypot(x, y)),
    distance: sun.distance,
  };
}

function orbitalElements(name, days) {
  switch (name) {
    case 'Mercury':
      return {
        node: 48.33167 + 3.24587e-5 * days,
        inclination: 7.00487 + 5e-8 * days,
        perihelion: 29.1241 + 1.01444e-5 * days,
        axis: 0.38709893,
        eccentricity: 0.20563069 + 5.59e-10 * days,
        meanAnomaly: 168.6562 + 4.0923344368 * days,
      };
    case 'Venus':
      return {
        node: 76.752 + 2.4659e-5 * days,
        inclination: 3.39471 + 2.75e-8 * days,
        perihelion: 54.9238 + 1.38374e-5 * days,
        axis: 0.72333199,
        eccentricity: 0.00677323 + 1.302e-9 * days,
        meanAnomaly: 48.0052 + 1.6021302244 * days,
      };
    case 'Mars':
      return {
        node: 49.57854 + 2.11081e-5 * days,
        inclination: 1.85061 + 1.78e-8 * days,
        perihelion: 286.5016 + 2.92961e-5 * days,
        axis: 1.52366232844,
        eccentricity: 0.09341233 + 2.516e-9 * days,
        meanAnomaly: 18.6021 + 0.5240207766 * days,
      };
    case 'Jupiter':
      return {
        node: 100.4542 + 2.76854e-5 * days,
        inclination: 1.3028 + 1.557e-7 * days,
        perihelion: 273.8777 + 1.64505e-5 * days,
        axis: 5.20336289787,
        eccentricity: 0.04851 + 4.469e-9 * days,
        meanAnomaly: 19.895 + 0.0830853001 * days,
      };
    case 'Saturn':
      return {
        node: 113.6634 + 2.3898e-5 * days,
        inclination: 2.4886 + 1.081e-7 * days,
        perihelion: 339.3939 + 2.97661e-5 * days,
        axis: 9.537070235853,
        eccentricity: 0.05552 + 9.499e-9 * days,
        meanAnomaly: 316.967 + 0.0334442282 * days,
      };
    case 'Uranus':
      return {
        node: 74.0005 + 1.3978e-5 * days,
        inclination: 0.7733 + 1.9e-8 * days,
        perihelion: 96.6612 + 3.0565e-5 * days,
        axis: 19.20120912523 + 1.55e-8 * days,
        eccentricity: 0.04638 + 7.45e-9 * days,
        meanAnomaly: 142.5905 + 0.011725806 * days,
      };
    case 'Neptune':
      return {
        node: 131.7806 + 3.0173e-5 * days,
        inclination: 1.76917 + 2.55e-7 * days,
        perihelion: 272.8461 + 6.027e-6 * days,
        axis: 30.06896340805 + 3.313e-8 * days,
        eccentricity: 0.0097 + 2.15e-9 * days,
        meanAnomaly: 260.2471 + 0.005995147 * days,
      };
    default:
      throw new Error(`Unknown orbital body: ${name}`);
  }
}

export function planetEquatorial(name, date) {
  const sun = sunBase(date);
  const elements = orbitalElements(name, sun.days);
  const eccentricAnomaly = solveKepler(elements.meanAnomaly, elements.eccentricity);
  const xv = elements.axis * (cosDegrees(eccentricAnomaly) - elements.eccentricity);
  const yv =
    elements.axis *
    Math.sqrt(1 - elements.eccentricity * elements.eccentricity) *
    sinDegrees(eccentricAnomaly);
  const trueAnomaly = atan2Degrees(yv, xv);
  const radius = Math.hypot(xv, yv);
  let xh =
    radius *
    (cosDegrees(elements.node) * cosDegrees(trueAnomaly + elements.perihelion) -
      sinDegrees(elements.node) *
        sinDegrees(trueAnomaly + elements.perihelion) *
        cosDegrees(elements.inclination));
  let yh =
    radius *
    (sinDegrees(elements.node) * cosDegrees(trueAnomaly + elements.perihelion) +
      cosDegrees(elements.node) *
        sinDegrees(trueAnomaly + elements.perihelion) *
        cosDegrees(elements.inclination));
  let zh = radius * sinDegrees(trueAnomaly + elements.perihelion) * sinDegrees(elements.inclination);
  let longitude = atan2Degrees(yh, xh) + sun.longitudeCorrection;
  let latitude = atan2Degrees(zh, Math.hypot(xh, yh));

  const jupiterAnomaly = orbitalElements('Jupiter', sun.days).meanAnomaly;
  const saturnAnomaly = orbitalElements('Saturn', sun.days).meanAnomaly;
  let corrected = false;

  if (name === 'Jupiter') {
    longitude +=
      -0.332 * sinDegrees(2 * elements.meanAnomaly - 5 * saturnAnomaly - 67.6) -
      0.056 * sinDegrees(2 * elements.meanAnomaly - 2 * saturnAnomaly + 21) +
      0.042 * sinDegrees(3 * elements.meanAnomaly - 5 * saturnAnomaly + 21) -
      0.036 * sinDegrees(elements.meanAnomaly - 2 * saturnAnomaly) +
      0.022 * cosDegrees(elements.meanAnomaly - saturnAnomaly) +
      0.023 * sinDegrees(2 * elements.meanAnomaly - 3 * saturnAnomaly + 52) -
      0.016 * sinDegrees(elements.meanAnomaly - 5 * saturnAnomaly - 69);
    corrected = true;
  } else if (name === 'Saturn') {
    longitude +=
      0.812 * sinDegrees(2 * jupiterAnomaly - 5 * elements.meanAnomaly - 67.6) -
      0.229 * cosDegrees(2 * jupiterAnomaly - 4 * elements.meanAnomaly - 2) +
      0.119 * sinDegrees(jupiterAnomaly - 2 * elements.meanAnomaly - 3) +
      0.046 * sinDegrees(2 * jupiterAnomaly - 6 * elements.meanAnomaly - 69) +
      0.014 * sinDegrees(jupiterAnomaly - 3 * elements.meanAnomaly + 32);
    latitude +=
      -0.02 * cosDegrees(2 * jupiterAnomaly - 4 * elements.meanAnomaly - 2) +
      0.018 * sinDegrees(2 * jupiterAnomaly - 6 * elements.meanAnomaly - 49);
    corrected = true;
  } else if (name === 'Uranus') {
    longitude +=
      0.04 * sinDegrees(saturnAnomaly - 2 * elements.meanAnomaly + 6) +
      0.035 * sinDegrees(saturnAnomaly - 3 * elements.meanAnomaly + 33) -
      0.015 * sinDegrees(jupiterAnomaly - elements.meanAnomaly + 20);
    corrected = true;
  }

  if (corrected) {
    xh = radius * cosDegrees(longitude) * cosDegrees(latitude);
    yh = radius * sinDegrees(longitude) * cosDegrees(latitude);
    zh = radius * sinDegrees(latitude);
  }

  const x = xh + sun.xs;
  const y = (yh + sun.ys) * cosDegrees(sun.obliquity) - zh * sinDegrees(sun.obliquity);
  const z = (yh + sun.ys) * sinDegrees(sun.obliquity) + zh * cosDegrees(sun.obliquity);
  return {
    ra: normalizeDegrees(atan2Degrees(y, x)),
    dec: atan2Degrees(z, Math.hypot(x, y)),
    distance: Math.hypot(x, y, z),
  };
}

export function moonEquatorial(date) {
  const sun = sunBase(date);
  const node = 125.1228 - 0.0529538083 * sun.days;
  const inclination = 5.1454;
  const perihelion = 318.0634 + 0.1643573223 * sun.days;
  const axis = 60.2666;
  const eccentricity = 0.0549;
  const meanAnomaly = 115.3654 + 13.0649929509 * sun.days;
  const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
  const xv = axis * (cosDegrees(eccentricAnomaly) - eccentricity);
  const yv = axis * Math.sqrt(1 - eccentricity * eccentricity) * sinDegrees(eccentricAnomaly);
  const trueAnomaly = atan2Degrees(yv, xv);
  let radius = Math.hypot(xv, yv);
  let xh =
    radius *
    (cosDegrees(node) * cosDegrees(trueAnomaly + perihelion) -
      sinDegrees(node) * sinDegrees(trueAnomaly + perihelion) * cosDegrees(inclination));
  let yh =
    radius *
    (sinDegrees(node) * cosDegrees(trueAnomaly + perihelion) +
      cosDegrees(node) * sinDegrees(trueAnomaly + perihelion) * cosDegrees(inclination));
  let zh = radius * sinDegrees(trueAnomaly + perihelion) * sinDegrees(inclination);
  let longitude = atan2Degrees(yh, xh) + sun.longitudeCorrection;
  let latitude = atan2Degrees(zh, Math.hypot(xh, yh));
  const meanLongitude = meanAnomaly + perihelion + node;
  const elongation = meanLongitude - (sun.meanAnomaly + sun.perihelion);
  const argumentOfLatitude = meanLongitude - node;

  longitude +=
    -1.274 * sinDegrees(meanAnomaly - 2 * elongation) +
    0.658 * sinDegrees(2 * elongation) -
    0.186 * sinDegrees(sun.meanAnomaly) -
    0.059 * sinDegrees(2 * meanAnomaly - 2 * elongation) -
    0.057 * sinDegrees(meanAnomaly - 2 * elongation + sun.meanAnomaly) +
    0.053 * sinDegrees(meanAnomaly + 2 * elongation) +
    0.046 * sinDegrees(2 * elongation - sun.meanAnomaly) +
    0.041 * sinDegrees(meanAnomaly - sun.meanAnomaly) -
    0.035 * sinDegrees(elongation) -
    0.031 * sinDegrees(meanAnomaly + sun.meanAnomaly) -
    0.015 * sinDegrees(2 * argumentOfLatitude - 2 * elongation) +
    0.011 * sinDegrees(meanAnomaly - 4 * elongation);
  latitude +=
    -0.173 * sinDegrees(argumentOfLatitude - 2 * elongation) -
    0.055 * sinDegrees(meanAnomaly - argumentOfLatitude - 2 * elongation) -
    0.046 * sinDegrees(meanAnomaly + argumentOfLatitude - 2 * elongation) +
    0.033 * sinDegrees(argumentOfLatitude + 2 * elongation) +
    0.017 * sinDegrees(2 * meanAnomaly + argumentOfLatitude);
  radius +=
    -0.58 * cosDegrees(meanAnomaly - 2 * elongation) - 0.46 * cosDegrees(2 * elongation);

  xh = radius * cosDegrees(longitude) * cosDegrees(latitude);
  yh = radius * sinDegrees(longitude) * cosDegrees(latitude);
  zh = radius * sinDegrees(latitude);
  const x = xh;
  const y = yh * cosDegrees(sun.obliquity) - zh * sinDegrees(sun.obliquity);
  const z = yh * sinDegrees(sun.obliquity) + zh * cosDegrees(sun.obliquity);
  return {
    ra: normalizeDegrees(atan2Degrees(y, x)),
    dec: atan2Degrees(z, Math.hypot(x, y)),
    distance: radius,
  };
}

export function angularSeparation(first, second) {
  const ra1 = degToRad(first.ra);
  const ra2 = degToRad(second.ra);
  const dec1 = degToRad(first.dec);
  const dec2 = degToRad(second.dec);
  const cosine =
    Math.sin(dec1) * Math.sin(dec2) +
    Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
  return radToDeg(Math.acos(Math.max(-1, Math.min(1, cosine))));
}

export function constellationName(star) {
  const designation = String(star.ja || '');
  const index = designation.indexOf('座');
  if (index < 0) return '';
  const name = designation.slice(0, index + 1);
  return name === 'りゅこつ座' ? 'りゅうこつ座' : name;
}

export function properStarName(star) {
  const name = String(star.en || '').trim();
  if (star.id === 46) return '北極星（ポラリス）';
  return name;
}

export const NORMALIZED_STARS = STARS.map((star) => ({
  ...star,
  raDeg: Number(star.ra),
  decDeg: declinationFromDDMM(star.dec),
  properName: properStarName(star),
  constellation: constellationName(star),
}));

export const NORMALIZED_LINES = CONSTELLATION_LINES.map((line) => ({
  ra1: Number(line[0]),
  dec1: declinationFromDDMM(line[1]),
  ra2: Number(line[2]),
  dec2: declinationFromDDMM(line[3]),
}));

export const CONSTELLATION_CENTERS = (() => {
  const groups = new Map();
  for (const star of NORMALIZED_STARS) {
    if (!star.constellation) continue;
    const group = groups.get(star.constellation) || {
      name: star.constellation,
      x: 0,
      y: 0,
      z: 0,
      count: 0,
    };
    const ra = degToRad(star.raDeg);
    const dec = degToRad(star.decDeg);
    const cosDec = Math.cos(dec);
    group.x += cosDec * Math.cos(ra);
    group.y += cosDec * Math.sin(ra);
    group.z += Math.sin(dec);
    group.count += 1;
    groups.set(star.constellation, group);
  }
  return [...groups.values()].map((group) => {
    const length = Math.hypot(group.x, group.y, group.z);
    const x = group.x / length;
    const y = group.y / length;
    const z = group.z / length;
    return {
      name: group.name,
      ra: normalizeDegrees(radToDeg(Math.atan2(y, x))),
      dec: radToDeg(Math.asin(Math.max(-1, Math.min(1, z)))),
      count: group.count,
    };
  });
})();

export const BODY_DEFINITIONS = [
  {
    key: 'Sun',
    name: '太陽',
    symbol: '☉',
    color: '#ffd98f',
    radius: 8,
    kind: '恒星',
    note: '太陽系の中心にある恒星です。表示位置は観測時刻に応じて移動します。',
    equatorial: sunEquatorial,
  },
  {
    key: 'Moon',
    name: '月',
    symbol: '☾',
    color: '#ece9db',
    radius: 7,
    kind: '衛星',
    note: '地球の唯一の自然衛星です。ここでは移植元と同じ簡易軌道モデルを使用しています。',
    equatorial: moonEquatorial,
  },
  {
    key: 'Mercury',
    name: '水星',
    symbol: '☿',
    color: '#d8d2c8',
    radius: 4,
    kind: '惑星',
    note: '太陽に最も近い惑星です。日の出前または日没後の低い空で見つかります。',
  },
  {
    key: 'Venus',
    name: '金星',
    symbol: '♀',
    color: '#fff0bd',
    radius: 6,
    kind: '惑星',
    note: '明けの明星・宵の明星として知られる、非常に明るい惑星です。',
  },
  {
    key: 'Mars',
    name: '火星',
    symbol: '♂',
    color: '#ee9c7b',
    radius: 5,
    kind: '惑星',
    note: '酸化鉄を含む地表により赤く見える惑星です。',
  },
  {
    key: 'Jupiter',
    name: '木星',
    symbol: '♃',
    color: '#f1d3ae',
    radius: 6,
    kind: '惑星',
    note: '太陽系最大の惑星です。肉眼でも明るく見えます。',
  },
  {
    key: 'Saturn',
    name: '土星',
    symbol: '♄',
    color: '#e8d6a5',
    radius: 5,
    kind: '惑星',
    note: '大きな環を持つガス惑星です。',
  },
  {
    key: 'Uranus',
    name: '天王星',
    symbol: '♅',
    color: '#a8e1e5',
    radius: 4,
    kind: '惑星',
    note: '自転軸が大きく傾いた氷惑星です。',
  },
  {
    key: 'Neptune',
    name: '海王星',
    symbol: '♆',
    color: '#83aef7',
    radius: 4,
    kind: '惑星',
    note: '太陽系で最も外側を公転する惑星です。',
  },
];

export function bodySnapshot(definition, date, latitude, longitude) {
  const equatorial = definition.equatorial
    ? definition.equatorial(date)
    : planetEquatorial(definition.key, date);
  return {
    definition,
    equatorial,
    horizontal: horizontalCoordinates(
      equatorial.ra,
      equatorial.dec,
      date,
      latitude,
      longitude,
    ),
  };
}
