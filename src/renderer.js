import {
  BODY_DEFINITIONS,
  CONSTELLATION_CENTERS,
  NORMALIZED_LINES,
  NORMALIZED_STARS,
  bodySnapshot,
  degToRad,
  horizontalCoordinates,
  normalizeDegrees,
  radToDeg,
} from './astronomy.js';

const SPECTRAL_COLORS = {
  O: '#b8d7ff', B: '#c9ddff', A: '#e8f0ff', F: '#fff8e7',
  G: '#fff2c6', K: '#ffd19a', M: '#ffac83',
};

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vectorFromHorizontal(azimuth, altitude) {
  const az = degToRad(azimuth);
  const alt = degToRad(altitude);
  const horizontal = Math.cos(alt);
  return {
    x: horizontal * Math.sin(az),
    y: horizontal * Math.cos(az),
    z: Math.sin(alt),
  };
}

export function manualCameraBasis(heading, pitch) {
  const az = degToRad(heading);
  const alt = degToRad(pitch);
  return {
    forward: vectorFromHorizontal(heading, pitch),
    right: { x: Math.cos(az), y: -Math.sin(az), z: 0 },
    up: {
      x: -Math.sin(alt) * Math.sin(az),
      y: -Math.sin(alt) * Math.cos(az),
      z: Math.cos(alt),
    },
  };
}

export function basisDirection(basis) {
  return {
    heading: normalizeDegrees(radToDeg(Math.atan2(basis.forward.x, basis.forward.y))),
    pitch: radToDeg(Math.asin(Math.max(-1, Math.min(1, basis.forward.z)))),
  };
}

export function applyManualDrag(heading, pitch, dx, dy, width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  return {
    // Direct manipulation: dragged sky content follows the pointer.
    heading: normalizeDegrees(heading - (dx / safeWidth) * 155),
    pitch: Math.max(-75, Math.min(88, pitch + (dy / safeHeight) * 110)),
  };
}

export function clipLineToRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let start = 0;
  let end = 1;
  const checks = [
    [-dx, x1 - minX], [dx, maxX - x1], [-dy, y1 - minY], [dy, maxY - y1],
  ];
  for (const [p, q] of checks) {
    if (p === 0 && q < 0) return null;
    if (p === 0) continue;
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return null;
  }
  return {
    x1: x1 + start * dx, y1: y1 + start * dy,
    x2: x1 + end * dx, y2: y1 + end * dy,
  };
}

function roundedRect(context, x, y, width, height, radius = 6) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export class SkyRenderer {
  constructor(canvas, { onSelect, onViewChange } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.onSelect = onSelect;
    this.onViewChange = onViewChange;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.date = new Date();
    this.latitude = 35;
    this.longitude = 135;
    this.heading = 180;
    this.pitch = 25;
    this.displayMode = 'smart';
    this.gyroBasis = null;
    this.selected = null;
    this.hitRegions = [];
    this.pointer = null;
    this.lastRender = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    canvas.addEventListener('pointercancel', () => { this.pointer = null; });
    canvas.addEventListener('wheel', (event) => this.wheel(event), { passive: false });
    this.resize();
  }

  setScene({ date, latitude, longitude, selected }) {
    this.date = date;
    this.latitude = latitude;
    this.longitude = longitude;
    this.selected = selected;
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
  }

  setGyroBasis(basis) {
    this.gyroBasis = basis;
  }

  clearGyro() {
    this.gyroBasis = null;
  }

  getDirection() {
    return basisDirection(this.gyroBasis || manualCameraBasis(this.heading, this.pitch));
  }

  resize() {
    const rectangle = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rectangle.width));
    this.height = Math.max(1, Math.round(rectangle.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.render(true);
  }

  project(azimuth, altitude, basis, focal) {
    const vector = vectorFromHorizontal(azimuth, altitude);
    const forward = dot(vector, basis.forward);
    if (forward <= 0.018) return null;
    return {
      x: this.width / 2 + (dot(vector, basis.right) / forward) * focal,
      y: this.height / 2 - (dot(vector, basis.up) / forward) * focal,
      depth: forward,
    };
  }

  render(force = false) {
    const now = performance.now();
    if (!force && now - this.lastRender < 30) return;
    this.lastRender = now;
    const context = this.context;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const gradient = context.createRadialGradient(
      this.width * 0.5, this.height * 0.37, 0,
      this.width * 0.5, this.height * 0.37, Math.max(this.width, this.height) * 0.82,
    );
    gradient.addColorStop(0, '#10203b');
    gradient.addColorStop(0.48, '#071122');
    gradient.addColorStop(1, '#02050c');
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);

    this.drawAtmosphere(context);
    const basis = this.gyroBasis || manualCameraBasis(this.heading, this.pitch);
    const verticalFov = this.displayMode === 'pc' ? 80 : 67;
    const focal = (this.height * 0.5) / Math.tan(degToRad(verticalFov * 0.5));
    const projector = (azimuth, altitude) => this.project(azimuth, altitude, basis, focal);
    this.hitRegions = [];
    this.drawHorizon(context, projector);
    this.drawConstellationLines(context, projector);
    this.drawStars(context, projector);
    this.drawBodies(context, projector);
    this.drawConstellationNames(context, projector);
    this.onViewChange?.(basisDirection(basis));
  }

  drawAtmosphere(context) {
    const glow = context.createLinearGradient(0, 0, 0, this.height);
    glow.addColorStop(0, 'rgba(47, 82, 142, 0.04)');
    glow.addColorStop(0.67, 'rgba(22, 76, 116, 0.02)');
    glow.addColorStop(1, 'rgba(42, 128, 158, 0.12)');
    context.fillStyle = glow;
    context.fillRect(0, 0, this.width, this.height);
  }

  drawHorizon(context, project) {
    context.save();
    context.strokeStyle = 'rgba(125, 224, 249, 0.28)';
    context.lineWidth = 1;
    for (let azimuth = 0; azimuth < 360; azimuth += 4) {
      const first = project(azimuth, 0);
      const second = project(azimuth + 4, 0);
      if (!first || !second) continue;
      const clipped = clipLineToRect(first.x, first.y, second.x, second.y, 0, 0, this.width, this.height);
      if (!clipped) continue;
      context.beginPath();
      context.moveTo(clipped.x1, clipped.y1);
      context.lineTo(clipped.x2, clipped.y2);
      context.stroke();
    }
    context.fillStyle = 'rgba(155, 225, 242, 0.76)';
    context.font = '700 10px ui-sans-serif, system-ui';
    context.textAlign = 'center';
    for (const marker of [{ a: 0, n: 'N' }, { a: 90, n: 'E' }, { a: 180, n: 'S' }, { a: 270, n: 'W' }]) {
      const point = project(marker.a, 1.5);
      if (point && point.x > 16 && point.x < this.width - 16 && point.y > 16 && point.y < this.height - 16) {
        context.fillText(marker.n, point.x, point.y);
      }
    }
    context.restore();
  }

  drawConstellationLines(context, project) {
    context.save();
    context.strokeStyle = 'rgba(118, 166, 221, 0.22)';
    context.lineWidth = 0.75;
    for (const line of NORMALIZED_LINES) {
      const firstHorizontal = horizontalCoordinates(line.ra1, line.dec1, this.date, this.latitude, this.longitude);
      const secondHorizontal = horizontalCoordinates(line.ra2, line.dec2, this.date, this.latitude, this.longitude);
      const first = project(firstHorizontal.azimuth, firstHorizontal.altitude);
      const second = project(secondHorizontal.azimuth, secondHorizontal.altitude);
      if (!first || !second) continue;
      const clipped = clipLineToRect(first.x, first.y, second.x, second.y, -8, -8, this.width + 8, this.height + 8);
      if (!clipped) continue;
      context.beginPath();
      context.moveTo(clipped.x1, clipped.y1);
      context.lineTo(clipped.x2, clipped.y2);
      context.stroke();
    }
    context.restore();
  }

  drawStars(context, project) {
    const occupied = [];
    const visible = [];
    for (const star of NORMALIZED_STARS) {
      const horizontal = horizontalCoordinates(star.raDeg, star.decDeg, this.date, this.latitude, this.longitude);
      if (horizontal.altitude < -4) continue;
      const point = project(horizontal.azimuth, horizontal.altitude);
      if (!point || point.x < -20 || point.x > this.width + 20 || point.y < -20 || point.y > this.height + 20) continue;
      visible.push({ star, horizontal, point });
    }
    visible.sort((a, b) => b.star.mag - a.star.mag);

    for (const item of visible) {
      const { star, point } = item;
      const radius = Math.max(0.65, Math.min(4.2, 3.25 - Number(star.mag) * 0.48));
      const selected = this.selected?.type === 'star' && this.selected.star.id === star.id;
      if (selected) {
        context.beginPath();
        context.arc(point.x, point.y, radius + 7, 0, Math.PI * 2);
        context.strokeStyle = '#88e7ff';
        context.lineWidth = 1.2;
        context.stroke();
      }
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.shadowColor = SPECTRAL_COLORS[star.color] || '#eef6ff';
      context.shadowBlur = radius > 2 ? 7 : 2;
      context.fillStyle = SPECTRAL_COLORS[star.color] || '#eef6ff';
      context.fill();
      context.shadowBlur = 0;
      this.hitRegions.push({ x: point.x, y: point.y, radius: Math.max(10, radius + 5), target: { type: 'star', star } });

      const label = star.properName && Number(star.mag) <= (this.width < 600 ? 1.55 : 2.45);
      if (!label) continue;
      context.font = Number(star.mag) < 1 ? '600 11px ui-sans-serif, system-ui' : '500 10px ui-sans-serif, system-ui';
      const textWidth = context.measureText(star.properName).width;
      const rect = { x: point.x + 8, y: point.y - 9, width: textWidth + 9, height: 18 };
      if (rect.x + rect.width > this.width - 4 || rect.y < 4 || rect.y + rect.height > this.height - 4) continue;
      if (occupied.some((other) => rect.x < other.x + other.width && rect.x + rect.width > other.x && rect.y < other.y + other.height && rect.y + rect.height > other.y)) continue;
      occupied.push(rect);
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 5);
      context.fillStyle = 'rgba(5, 12, 23, 0.62)';
      context.fill();
      context.fillStyle = 'rgba(240, 247, 255, 0.9)';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(star.properName, rect.x + 4, rect.y + rect.height / 2);
      this.hitRegions.push({ ...rect, target: { type: 'star', star } });
    }
  }

  drawBodies(context, project) {
    for (const definition of BODY_DEFINITIONS) {
      const snapshot = bodySnapshot(definition, this.date, this.latitude, this.longitude);
      if (snapshot.horizontal.altitude < -6) continue;
      const point = project(snapshot.horizontal.azimuth, snapshot.horizontal.altitude);
      if (!point || point.x < -40 || point.x > this.width + 40 || point.y < -40 || point.y > this.height + 40) continue;
      const selected = this.selected?.type === 'body' && this.selected.definition.key === definition.key;
      context.beginPath();
      context.arc(point.x, point.y, definition.radius + (selected ? 7 : 3), 0, Math.PI * 2);
      context.fillStyle = selected ? 'rgba(136, 231, 255, 0.18)' : `${definition.color}22`;
      context.fill();
      if (selected) {
        context.strokeStyle = '#88e7ff';
        context.lineWidth = 1.2;
        context.stroke();
      }
      context.beginPath();
      context.arc(point.x, point.y, definition.radius, 0, Math.PI * 2);
      context.fillStyle = definition.color;
      context.shadowColor = definition.color;
      context.shadowBlur = 12;
      context.fill();
      context.shadowBlur = 0;
      context.font = '700 11px ui-sans-serif, system-ui';
      const textWidth = context.measureText(definition.name).width;
      const x = point.x + definition.radius + 7;
      const y = point.y - 9;
      roundedRect(context, x, y, textWidth + 10, 19, 6);
      context.fillStyle = 'rgba(5, 12, 23, 0.76)';
      context.fill();
      context.fillStyle = definition.color;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(definition.name, x + 5, y + 9.5);
      const target = { type: 'body', definition };
      this.hitRegions.push({ x: point.x, y: point.y, radius: Math.max(13, definition.radius + 5), target });
      this.hitRegions.push({ x, y, width: textWidth + 10, height: 19, target });
    }
  }

  drawConstellationNames(context, project) {
    context.save();
    context.font = '500 9px ui-sans-serif, system-ui';
    context.fillStyle = 'rgba(140, 170, 208, 0.48)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const center of CONSTELLATION_CENTERS) {
      if (center.count < 2) continue;
      const horizontal = horizontalCoordinates(center.ra, center.dec, this.date, this.latitude, this.longitude);
      const point = project(horizontal.azimuth, horizontal.altitude);
      if (point && point.x > 30 && point.x < this.width - 30 && point.y > 100 && point.y < this.height - 110) {
        context.fillText(center.name, point.x, point.y);
      }
    }
    context.restore();
  }

  eventPosition(event) {
    const rectangle = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  }

  pointerDown(event) {
    if (this.gyroBasis) return;
    const point = this.eventPosition(event);
    this.pointer = { id: event.pointerId, startX: point.x, startY: point.y, x: point.x, y: point.y, moved: false };
    this.canvas.setPointerCapture(event.pointerId);
  }

  pointerMove(event) {
    if (!this.pointer || this.pointer.id !== event.pointerId || this.gyroBasis) return;
    const point = this.eventPosition(event);
    const dx = point.x - this.pointer.x;
    const dy = point.y - this.pointer.y;
    if (Math.hypot(point.x - this.pointer.startX, point.y - this.pointer.startY) > 5) this.pointer.moved = true;
    const direction = applyManualDrag(this.heading, this.pitch, dx, dy, this.width, this.height);
    this.heading = direction.heading;
    this.pitch = direction.pitch;
    this.pointer.x = point.x;
    this.pointer.y = point.y;
    this.render(true);
  }

  pointerUp(event) {
    const point = this.eventPosition(event);
    const moved = this.pointer?.moved;
    this.pointer = null;
    if (moved) return;
    for (let index = this.hitRegions.length - 1; index >= 0; index -= 1) {
      const region = this.hitRegions[index];
      const hit = region.radius
        ? Math.hypot(point.x - region.x, point.y - region.y) <= region.radius
        : point.x >= region.x && point.x <= region.x + region.width && point.y >= region.y && point.y <= region.y + region.height;
      if (hit) {
        this.onSelect?.(region.target);
        return;
      }
    }
  }

  wheel(event) {
    if (this.gyroBasis) return;
    event.preventDefault();
    this.pitch = Math.max(-75, Math.min(88, this.pitch - Math.sign(event.deltaY) * 3));
    this.render(true);
  }
}
