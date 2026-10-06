export const MAX_SIMULATION_SPEED = 1_000_000;

export function clampSimulationSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(MAX_SIMULATION_SPEED, Math.max(0, numeric));
}

export function advanceSimulationTime(currentTime, elapsedRealMilliseconds, speed) {
  const safeElapsed = Math.max(0, Number(elapsedRealMilliseconds) || 0);
  const safeSpeed = clampSimulationSpeed(speed);
  return new Date(currentTime.getTime() + safeElapsed * safeSpeed);
}

export function isNearRealtime(simulatedTime, now = new Date(), toleranceMilliseconds = 2000) {
  return Math.abs(simulatedTime.getTime() - now.getTime()) <= toleranceMilliseconds;
}

