/* Skyhold TD — render/voxkit.js
   A small voxel sculpting kit for the detailed models (bosses first). A model part is a 3D grid of
   equal cubes; you fill it with shapes (boxes, ellipsoids, capsules, cones...) or with a function,
   then emit() turns it into ONE mesh per part:
     - only faces that touch air are kept (a 60-voxel-tall boss stays a few thousand quads),
     - every corner gets ambient occlusion from its neighbours (the classic voxel look),
     - each voxel's colour is nudged a little by a hash, so flat colours read as material,
     - emissive voxels go to the glow batch (blooms in game), solid ones to the lit batch.
   The output goes into a Part (render/kit.js), so the instanced enemy renderer, the thumbnail rig
   and the gallery use these models exactly like the box-built ones. */
import * as THREE from "three";

const hash3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// face table: normal, the two in-plane axes (u, v) used for AO, and the 4 corners (as 0/1 offsets)
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO = [0.52, 0.68, 0.84, 1.0];

export class Vox {
  // u: voxel size in world units; bounds in voxel coordinates (inclusive)
  constructor(u, x0, x1, y0, y1, z0, z1) {
    this.u = u; this.x0 = x0; this.y0 = y0; this.z0 = z0;
    this.nx = x1 - x0 + 1; this.ny = y1 - y0 + 1; this.nz = z1 - z0 + 1;
    this.cells = new Uint16Array(this.nx * this.ny * this.nz);
    this.pals = [null]; this.palKey = new Map();
  }
  // a material: colour, emissive strength (0 = lit), per-voxel brightness jitter
  pal(hex, e = 0, jit = 0.07) {
    const k = hex + "|" + e + "|" + jit;
    let i = this.palKey.get(k);
    if (i == null) { i = this.pals.length; this.pals.push({ c: new THREE.Color(hex), e, jit }); this.palKey.set(k, i); }
    return i;
  }
  idx(x, y, z) { x -= this.x0; y -= this.y0; z -= this.z0; return x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz ? -1 : (z * this.ny + y) * this.nx + x; }
  get(x, y, z) { const i = this.idx(x, y, z); return i < 0 ? 0 : this.cells[i]; }
  set(x, y, z, p) { const i = this.idx(Math.round(x), Math.round(y), Math.round(z)); if (i >= 0) this.cells[i] = p || 0; return this; }
  // fill every cell in a box region for which fn(x,y,z) returns a palette index (0/undefined = leave)
  fill(fn, bx0 = this.x0, bx1 = this.x0 + this.nx - 1, by0 = this.y0, by1 = this.y0 + this.ny - 1, bz0 = this.z0, bz1 = this.z0 + this.nz - 1) {
    bx0 = Math.max(this.x0, Math.floor(bx0)); by0 = Math.max(this.y0, Math.floor(by0)); bz0 = Math.max(this.z0, Math.floor(bz0));
    bx1 = Math.min(this.x0 + this.nx - 1, Math.ceil(bx1)); by1 = Math.min(this.y0 + this.ny - 1, Math.ceil(by1)); bz1 = Math.min(this.z0 + this.nz - 1, Math.ceil(bz1));
    for (let z = bz0; z <= bz1; z++) for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const p = fn(x, y, z); if (p === undefined || p === null || p === false) continue;
      this.cells[(( z - this.z0) * this.ny + (y - this.y0)) * this.nx + (x - this.x0)] = p;
    }
    return this;
  }
  // p may be a palette index or a function (x,y,z) -> index, so shapes can be shaded inside
  _p(p, x, y, z) { return typeof p === "function" ? p(x, y, z) : p; }
  box(x0, y0, z0, x1, y1, z1, p) { return this.fill((x, y, z) => this._p(p, x, y, z), x0, x1, y0, y1, z0, z1); }
  ell(cx, cy, cz, rx, ry, rz, p) {
    return this.fill((x, y, z) => { const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz; return dx * dx + dy * dy + dz * dz <= 1 ? this._p(p, x, y, z) : null; }, cx - rx, cx + rx, cy - ry, cy + ry, cz - rz, cz + rz);
  }
  // a capsule (limb, horn, chain, spike) from a to b; r0 at a and r1 at b
  cap(a, b, r0, p, r1 = r0) {
    const [ax, ay, az] = a, [bx, by, bz] = b;
    const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1, R = Math.max(r0, r1);
    return this.fill((x, y, z) => {
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qy = ay + dy * t - y, qz = az + dz * t - z, r = r0 + (r1 - r0) * t;
      return qx * qx + qy * qy + qz * qz <= r * r ? this._p(p, x, y, z) : null;
    }, Math.min(ax, bx) - R, Math.max(ax, bx) + R, Math.min(ay, by) - R, Math.max(ay, by) + R, Math.min(az, bz) - R, Math.max(az, bz) + R);
  }
  // a capsule along a polyline (curved horns, tails, chains of links)
  path(pts, r0, r1, p) { for (let i = 0; i < pts.length - 1; i++) { const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1); this.cap(pts[i], pts[i + 1], r0 + (r1 - r0) * t0, p, r0 + (r1 - r0) * t1); } return this; }
  cyl(cx, y0, cz, r, y1, p, axis = "y") {
    if (axis === "y") return this.fill((x, y, z) => ((x - cx) ** 2 + (z - cz) ** 2 <= r * r ? this._p(p, x, y, z) : null), cx - r, cx + r, y0, y1, cz - r, cz + r);
    if (axis === "x") return this.fill((x, y, z) => ((y - y0) ** 2 + (z - cz) ** 2 <= r * r ? this._p(p, x, y, z) : null), cx, y1, y0 - r, y0 + r, cz - r, cz + r);
    return this.fill((x, y, z) => ((x - cx) ** 2 + (y - y0) ** 2 <= r * r ? this._p(p, x, y, z) : null), cx - r, cx + r, y0 - r, y0 + r, cz, y1);
  }
  // remove everything a predicate says (sockets, hollows, gaps)
  carve(fn) { for (let z = this.z0; z < this.z0 + this.nz; z++) for (let y = this.y0; y < this.y0 + this.ny; y++) for (let x = this.x0; x < this.x0 + this.nx; x++) if (fn(x, y, z, this.get(x, y, z))) this.cells[this.idx(x, y, z)] = 0; return this; }
  // repaint existing voxels (bands, trims, grime)
  paint(fn) { for (let i = 0, z = this.z0; z < this.z0 + this.nz; z++) for (let y = this.y0; y < this.y0 + this.ny; y++) for (let x = this.x0; x < this.x0 + this.nx; x++, i++) { const c = this.cells[i]; if (!c) continue; const p = fn(x, y, z, c); if (p) this.cells[i] = p; } return this; }
  mirrorX() { for (let z = this.z0; z < this.z0 + this.nz; z++) for (let y = this.y0; y < this.y0 + this.ny; y++) for (let x = 1; x < this.x0 + this.nx; x++) { const c = this.get(x, y, z); if (c && !this.get(-x, y, z)) this.set(-x, y, z, c); } return this; }

  _open(F, x, y, z, occ) {
    const [nx, ny, nz] = F.n, lx = x + nx, ly = y + ny, lz = z + nz;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue;
      if (nx ? occ(lx, ly + a, lz + b) : ny ? occ(lx + a, ly, lz + b) : occ(lx + a, ly + b, lz)) return false;
    }
    return true;
  }
  // ---- mesh it into a Part: offset = where voxel (0,0,0)'s centre sits in part space
  // merge > 1: unshaded faces of one material in one plane are merged into tiles of up to merge×merge
  // voxels (each tile keeps its own colour jitter), which cuts a large flat model's vertices several-fold
  emit(P, ox = 0, oy = 0, oz = 0, merge = 1) {
    const u = this.u, lit = P.lit, glow = P.glow;
    const l0 = lit.pos.length, g0 = glow.pos.length;
    const occ = (x, y, z) => { const c = this.get(x, y, z); return c && !this.pals[c].e ? 1 : 0; };
    const solid = (x, y, z) => this.get(x, y, z) !== 0;
    const col = new THREE.Color();
    const planes = merge > 1 ? new Map() : null;   // "face|slice" -> Map("a,b" -> palette)
    const lo = [this.x0, this.y0, this.z0];
    for (let z = this.z0; z < this.z0 + this.nz; z++) for (let y = this.y0; y < this.y0 + this.ny; y++) for (let x = this.x0; x < this.x0 + this.nx; x++) {
      const c = this.get(x, y, z); if (!c) continue;
      const pal = this.pals[c];
      const k = 1 + (hash3(x, y, z) - 0.5) * 2 * pal.jit;
      const B = pal.e ? glow : lit;
      for (let fi = 0; fi < 6; fi++) {
        const F = FACES[fi];
        const [nx, ny, nz] = F.n;
        if (solid(x + nx, y + ny, z + nz)) continue;
        if (planes && this._open(F, x, y, z, occ)) {
          const na = nx ? 0 : ny ? 1 : 2, p = [x, y, z], key = fi * 4096 + (p[na] - lo[na]);
          let m = planes.get(key); if (!m) planes.set(key, (m = new Map()));
          m.set((p[(na + 1) % 3] - lo[(na + 1) % 3]) * 4096 + (p[(na + 2) % 3] - lo[(na + 2) % 3]), c);
          continue;
        }
        const first = B.pos.length / 3;
        const ao = [];
        for (const [cx, cy, cz] of F.c) {
          // the corner's world position
          B.pos.push((x + cx - 0.5) * u + ox, (y + cy - 0.5) * u + oy, (z + cz - 0.5) * u + oz);
          B.nor.push(nx, ny, nz);
          let a = 3;
          if (!pal.e) {
            // the two edge neighbours and the corner neighbour on the outside layer of this face
            const sx = cx ? 1 : -1, sy = cy ? 1 : -1, sz = cz ? 1 : -1;
            const ex = nx ? 0 : sx, ey = ny ? 0 : sy, ez = nz ? 0 : sz;
            const lx = x + nx, ly = y + ny, lz = z + nz;
            let s1, s2;
            if (nx) { s1 = occ(lx, ly + ey, lz); s2 = occ(lx, ly, lz + ez); }
            else if (ny) { s1 = occ(lx + ex, ly, lz); s2 = occ(lx, ly, lz + ez); }
            else { s1 = occ(lx + ex, ly, lz); s2 = occ(lx, ly + ey, lz); }
            const cc = occ(lx + ex, ly + ey, lz + ez);
            a = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
          }
          ao.push(a);
          const shade = pal.e ? pal.e * k : AO[a] * k * (ny < 0 ? 0.82 : 1);
          col.copy(pal.c).multiplyScalar(shade);
          B.col.push(col.r, col.g, col.b);
        }
        // flip the quad's diagonal so AO gradients don't crease
        if (ao[0] + ao[2] < ao[1] + ao[3]) B.idx.push(first + 1, first + 2, first + 3, first + 1, first + 3, first);
        else B.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
      }
    }
    if (planes) for (const [key, m] of planes) {
      const fi = Math.floor(key / 4096), F = FACES[fi], na = F.n[0] ? 0 : F.n[1] ? 1 : 2, ua = (na + 1) % 3, wa = (na + 2) % 3;
      for (const [ab, c] of m) {
        if (!c) continue;
        const a = Math.floor(ab / 4096), b = ab % 4096;
        let du = 1, dw = 1;
        while (du < merge && m.get((a + du) * 4096 + b) === c) du++;
        grow: while (dw < merge) { for (let i = 0; i < du; i++) if (m.get((a + i) * 4096 + b + dw) !== c) break grow; dw++; }
        for (let i = 0; i < du; i++) for (let j = 0; j < dw; j++) m.set((a + i) * 4096 + b + j, 0);
        const p = [0, 0, 0]; p[na] = (key % 4096) + lo[na]; p[ua] = a + lo[ua]; p[wa] = b + lo[wa];
        const ext = [1, 1, 1]; ext[ua] = du; ext[wa] = dw;
        const pal = this.pals[c], B = pal.e ? glow : lit, k = 1 + (hash3(p[0], p[1], p[2]) - 0.5) * 2 * pal.jit;
        col.copy(pal.c).multiplyScalar(pal.e ? pal.e * k : AO[3] * k * (F.n[1] < 0 ? 0.82 : 1));
        const first = B.pos.length / 3;
        for (const cc of F.c) {
          B.pos.push((p[0] + cc[0] * ext[0] - 0.5) * u + ox, (p[1] + cc[1] * ext[1] - 0.5) * u + oy, (p[2] + cc[2] * ext[2] - 0.5) * u + oz);
          B.nor.push(F.n[0], F.n[1], F.n[2]); B.col.push(col.r, col.g, col.b);
        }
        B.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
      }
    }
    // honour the batches' transform stacks (towers scale their heads by stage)
    for (const [B, s0] of [[lit, l0], [glow, g0]]) {
      const m = B.m; if (isIdent(m)) continue;
      const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3();
      for (let i = s0; i < B.pos.length; i += 3) {
        v.set(B.pos[i], B.pos[i + 1], B.pos[i + 2]).applyMatrix4(m); B.pos[i] = v.x; B.pos[i + 1] = v.y; B.pos[i + 2] = v.z;
        v.set(B.nor[i], B.nor[i + 1], B.nor[i + 2]).applyMatrix3(nm).normalize(); B.nor[i] = v.x; B.nor[i + 1] = v.y; B.nor[i + 2] = v.z;
      }
    }
    return P;
  }
}
const IDENT = new THREE.Matrix4().elements;
const isIdent = (m) => m.elements.every((e, i) => e === IDENT[i]);

// value noise for sculpting (fur clumps, rock, rust patches)
const P8 = new Uint8Array(512); { let s = 1337; const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P8[i] = p[i & 255]; }
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = fade(x - X), fy = fade(y - Y), fz = fade(z - Z);
  const h = (i, j, k) => P8[(P8[(P8[(X + i) & 255] + Y + j) & 255] + Z + k) & 255] / 255;
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy), l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
