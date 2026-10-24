import { PATH_POINTS } from "../data.js";

const segments = [];
let totalLength = 0;
for (let i = 0; i < PATH_POINTS.length - 1; i++) {
  const a = PATH_POINTS[i], b = PATH_POINTS[i + 1];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  segments.push({ a, b, length, start: totalLength });
  totalLength += length;
}

export function pathLength() { return totalLength; }

export function pointAtDistance(distance) {
  const d = Math.max(0, Math.min(totalLength, distance));
  const segment = segments.find((s) => d <= s.start + s.length) || segments[segments.length - 1];
  const t = segment.length ? (d - segment.start) / segment.length : 0;
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * t,
    z: segment.a.z + (segment.b.z - segment.a.z) * t
  };
}

export function isNearPath(x, z, padding = 0.72) {
  for (const segment of segments) {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.z - segment.a.z;
    const denom = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / denom));
    const px = segment.a.x + dx * t, pz = segment.a.z + dz * t;
    if (Math.hypot(x - px, z - pz) < padding) return true;
  }
  return false;
}
