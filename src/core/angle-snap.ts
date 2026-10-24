export const ANGLE_SNAP = {
  acquire: (7 * Math.PI) / 180,
  release: (10 * Math.PI) / 180,
};
const distance = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function magneticAngle(
  angle: number,
  enabled = true,
  previous?: number,
  config = ANGLE_SNAP,
) {
  if (!enabled) return { angle, snapped: false };
  if (
    previous !== undefined &&
    Math.abs(distance(angle, previous)) <= config.release + 1e-10
  )
    return { angle: previous, snapped: true };
  const target = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(distance(angle, target)) <= config.acquire + 1e-10
    ? {
        angle: ((target % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
        snapped: true,
      }
    : { angle, snapped: false };
}
