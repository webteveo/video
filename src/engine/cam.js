// Tiny 3D camera helpers shared by the raymarched and point-sprite scenes.
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

// Orbit camera: azimuth around +y, elevation above the xz plane, distance from target.
export function orbit(target, az, el, dist) {
  return [
    target[0] + dist * Math.cos(el) * Math.sin(az),
    target[1] + dist * Math.sin(el),
    target[2] + dist * Math.cos(el) * Math.cos(az),
  ];
}

// Column-major mat3 [right, up, back] for GLSL; ray = normalize(M * vec3(px, py, -focal)).
export function lookAt(eye, target, roll = 0, upHint = [0, 1, 0]) {
  const back = v3.norm(v3.sub(eye, target));
  let right = v3.norm(v3.cross(upHint, back));
  let up = v3.cross(back, right);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = v3.add(v3.scale(right, c), v3.scale(up, s));
    const u2 = v3.add(v3.scale(up, c), v3.scale(right, -s));
    right = r2; up = u2;
  }
  return { eye, right, up, back, mat: [...right, ...up, ...back] };
}

// Project world point to pixel coords (W×H, y down) for a camera + focal (screen-height units).
export function project(cam, p, focal, W = 1920, H = 1080) {
  const d = v3.sub(p, cam.eye);
  const z = -v3.dot(d, cam.back);
  if (z <= 1e-4) return null;
  const x = v3.dot(d, cam.right), y = v3.dot(d, cam.up);
  return [W / 2 + (x / z) * focal * H, H / 2 - (y / z) * focal * H, z];
}

// Rotation matrices (column-major mat3).
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; }
export function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
export function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; }
export function mul3(a, b) {
  const o = new Array(9);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
    o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  }
  return o;
}
export function apply3(m, p) {
  return [m[0] * p[0] + m[3] * p[1] + m[6] * p[2], m[1] * p[0] + m[4] * p[1] + m[7] * p[2], m[2] * p[0] + m[5] * p[1] + m[8] * p[2]];
}
