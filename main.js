import * as THREE from 'three';

/* ------------------------------------------------------------------ utils */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const map = (x, a, b) => clamp((x - a) / (b - a));
const smooth = (x, a = 0, b = 1) => { const t = map(x, a, b); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

let seed = 241126;                      // fixed seed: same bouquet every visit
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (a, b) => a + (b - a) * rnd();
const ri = (a, b) => Math.floor(rr(a, b + 1));

/* ----------------------------------------------------------- voxel model */
// every voxel: target cell, colour, and when/how it arrives
const voxels = [];
const C = (hex) => new THREE.Color(hex);
function vox(x, y, z, hex, t0, dur, mode, from) {
  const col = C(hex); col.offsetHSL(0, 0, (rnd() - 0.5) * 0.045);
  voxels.push({ x, y, z, col, t0, dur, mode, from: from || null, spin: rr(-6, 6) });
}

/* floating island (always there) */
{
  const R = 9;
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
    const d = Math.hypot(x, z);
    if (d > R + 0.3) continue;
    vox(x, -1, z, (x + z) & 1 ? '#6fd45b' : '#62c94f', -1, 0, 'static');   // grass
    const depth = Math.round((1 - Math.pow(d / (R + 0.5), 1.6)) * 6 + rr(-0.6, 0.9));
    for (let k = 1; k <= depth; k++) vox(x, -1 - k, z, k === 1 ? '#a8693c' : k > 3 ? '#70401f' : '#8d5530', -1, 0, 'static');
  }
  // little decorations on the grass
  const deco = (x, z, stem, cap) => { vox(x, 0, z, stem, -1, 0, 'static'); vox(x, 1, z, cap, -1, 0, 'static'); };
  deco(-6, 3, '#f4ead8', '#e8453c'); deco(6, -3, '#f4ead8', '#e8453c'); deco(5, 5, '#3fae4b', '#ffd23f');
  deco(-5, -5, '#3fae4b', '#ff8fb1'); deco(-2, 7, '#3fae4b', '#ffffff'); deco(7, 1, '#3fae4b', '#9b6bff');
}

/* vase: stacked rings, bottom to top */
const VASE_TOP = 10;
{
  const prof = [3.0, 3.7, 4.3, 4.6, 4.4, 3.8, 3.0, 2.4, 2.4, 2.9];
  for (let y = 0; y < prof.length; y++) {
    const r = prof[y];
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      const d = Math.hypot(x, z);
      if (d > r + 0.2) continue;
      if (y > 0 && d < r - 1.15) continue;                       // hollow above the base
      const ang = Math.atan2(z, x);
      let col = '#f6f1e6';
      if (y === 3 || y === 4) col = (Math.round(ang * 4 / Math.PI) + y) & 1 ? '#3f74e0' : '#f6f1e6';
      if (y === 2 || y === 5) col = '#3f74e0';
      if (y === 9) col = '#ffcf40';
      if (y === 0) col = '#d9d2c2';
      const t0 = 0.06 + 0.2 * (y / 9) + 0.022 * ((ang + Math.PI) / (2 * Math.PI));
      const a = rr(0, 6.28), dist = rr(14, 26);
      vox(x, y, z, col, t0, 0.06, 'fly', [Math.cos(a) * dist, y + rr(6, 22), Math.sin(a) * dist]);
    }
  }
}

/* flowers */
const heads = [];        // completion time of every flower, for the counter
function line(a, b) {     // voxel line between two cells, no duplicates
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]));
  const out = []; let last = '';
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    // slight bow so stems curve out of the vase instead of running dead straight
    const bow = Math.sin(t * Math.PI) * 0.9;
    const c = [Math.round(lerp(a[0], b[0], t * t * 0.55 + t * 0.45)), Math.round(lerp(a[1], b[1], t) + bow), Math.round(lerp(a[2], b[2], t * t * 0.55 + t * 0.45))];
    const k = c.join(',');
    if (k !== last) { out.push(c); last = k; }
  }
  return out;
}

const SHAPES = {
  tulip(c, dark) {
    const v = [];
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (Math.abs(x) + Math.abs(z) < 2) v.push([x, 0, z, dark]);
      v.push([x, 1, z, c]); v.push([x, 2, z, (x === 0 && z === 0) ? dark : c]);
      if (Math.abs(x) + Math.abs(z) === 2) v.push([x, 3, z, c]);
    }
    return v;
  },
  rose(c, dark, light) {
    const v = [[1, 0, 0, '#3fae4b'], [-1, 0, 0, '#3fae4b'], [0, 0, 1, '#3fae4b'], [0, 0, -1, '#3fae4b']];
    for (let x = -1; x <= 1; x++) for (let y = 1; y <= 3; y++) for (let z = -1; z <= 1; z++) {
      v.push([x, y, z, ((x + y + z) & 1) ? dark : c]);
    }
    v.push([0, 4, 0, light]); v.push([1, 4, 1, c]); v.push([-1, 4, -1, c]);
    return v;
  },
  daisy(c) {
    const v = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      const ax = Math.abs(x), az = Math.abs(z);
      if (ax === 2 && az === 2) continue;
      if (ax + az <= 1) { v.push([x, 1, z, ax + az === 0 ? '#ff9f1c' : '#ffd23f']); if (ax + az === 0) v.push([0, 2, 0, '#ffd23f']); }
      else v.push([x, 1, z, c]);
    }
    v.push([0, 0, 0, '#3fae4b']);
    return v;
  },
  pom(c, dark, light) {
    const v = [];
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
      const d = Math.hypot(x, y, z);
      if (d <= 2.3 && d > 1.2) v.push([x, y + 2, z, (x * 7 + y * 3 + z * 5) % 3 === 0 ? light : (x + z) & 1 ? c : dark]);
    }
    return v;
  },
};
const PAL = [
  ['#ff4d6d', '#d62f52', '#ff8fa3'],   // red
  ['#ff8fb1', '#f0668f', '#ffc2d4'],   // pink
  ['#ffd23f', '#f4a91c', '#fff0a8'],   // yellow
  ['#b388ff', '#8c5cf0', '#d9c4ff'],   // violet
  ['#ff9f43', '#f07b1f', '#ffc98a'],   // orange
  ['#ffffff', '#e6e9f5', '#ffffff'],   // white
];

const plan = [];
plan.push({ x: 0, y: 27, z: 0, shape: 'rose', pal: 0 });
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.4;
  plan.push({ x: Math.round(Math.cos(a) * 6), y: 23 + (i & 1) * 2, z: Math.round(Math.sin(a) * 6), shape: ['tulip', 'pom', 'rose'][i % 3], pal: [1, 3, 2, 0, 4, 1][i] });
}
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2;
  plan.push({ x: Math.round(Math.cos(a) * 11), y: 17 + (i % 3), z: Math.round(Math.sin(a) * 11), shape: ['daisy', 'tulip', 'rose'][i % 3], pal: [5, 2, 1, 5, 4, 0, 5, 3, 1][i] });
}

const stemCells = new Set();
plan.forEach((f, j) => {
  const order = plan.length - 1 - j;                    // outer ring first, crown last
  const ang = Math.atan2(f.z, f.x), base = j === 0 ? 0 : 1;
  const a0 = [Math.round(Math.cos(ang) * base), VASE_TOP - 2, Math.round(Math.sin(ang) * base)];
  const cells = line(a0, [f.x, f.y - 1, f.z]);
  const sStart = 0.3 + rr(0, 0.06);
  cells.forEach((c, k) => {
    const key = c.join(',');
    if (stemCells.has(key)) return; stemCells.add(key);
    vox(c[0], c[1], c[2], k & 1 ? '#3fae4b' : '#35993f', sStart + 0.17 * (k / cells.length), 0.03, 'pop');
    // a leaf halfway up
    if (k === Math.floor(cells.length * 0.55) && j > 0) {
      const lx = Math.round(-Math.sin(ang)), lz = Math.round(Math.cos(ang));
      const s = j & 1 ? 1 : -1;
      vox(c[0] + lx * s, c[1], c[2] + lz * s, '#58c463', sStart + 0.12, 0.03, 'pop');
      vox(c[0] + lx * s * 2, c[1] + 1, c[2] + lz * s * 2, '#58c463', sStart + 0.13, 0.03, 'pop');
    }
  });
  const [c, dark, light] = PAL[f.pal];
  const shape = SHAPES[f.shape](c, dark, light);
  const t0 = 0.5 + 0.36 * (order / (plan.length - 1));
  shape.sort((p, q) => p[1] - q[1]);
  shape.forEach((s, k) => {
    vox(f.x + s[0], f.y + s[1], f.z + s[2], s[3], t0 + 0.025 * (k / shape.length), 0.035, 'bloom', [f.x, f.y, f.z]);
  });
  heads.push(t0 + 0.035);
});
heads.sort((a, b) => a - b);

/* ---------------------------------------------------------------- three */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const amb = new THREE.AmbientLight(0xffffff, 1.35);
scene.add(amb);
const NIGHT_AMB = new THREE.Color('#7f8fe0'), DAWN_AMB = new THREE.Color('#ffd2c4'), DAY_AMB = new THREE.Color('#ffffff');
const NIGHT_SUN = new THREE.Color('#9fb4ff'), DAWN_SUN = new THREE.Color('#ffb27a'), DAY_SUN = new THREE.Color('#fff4d6');
const sun = new THREE.DirectionalLight(0xfff4d6, 2.1);
sun.position.set(0.55, 1, 0.75);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(26, 1, 1, 600);
const world = new THREE.Group();
scene.add(world);

const N = voxels.length;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), N);
mesh.frustumCulled = false;
voxels.forEach((v, i) => mesh.setColorAt(i, v.col));
mesh.instanceColor.needsUpdate = true;
world.add(mesh);

/* ---------------------------------------------------------------- sky 2d */
const sky = document.getElementById('sky');
const g = sky.getContext('2d');
let W = 0, H = 0, S = 3, bw = 0, bh = 0, fitDist = 100;

const clouds = Array.from({ length: 7 }, (_, i) => ({ x: rnd(), y: 0.08 + rnd() * 0.42, s: 0.7 + rnd() * 0.9, v: 0.004 + rnd() * 0.006, far: i % 2 }));
const stars = Array.from({ length: 40 }, () => ({ x: rnd(), y: rnd() * 0.55, w: rnd() * 6.28 }));
const hearts = Array.from({ length: 16 }, () => ({ x: rnd(), o: rnd(), v: 0.05 + rnd() * 0.06, s: rnd() < 0.3 ? 2 : 1 }));
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

const mix = (a, b, t) => {
  const ca = C(a), cb = C(b); ca.lerp(cb, t);
  return '#' + ca.getHexString();           // back to sRGB for the 2D canvas
};
const R = (x, y, w, h) => g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
function disc(cx, cy, r) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(cx - w, cy + dy, 2 * w + 1, 1); }
}
function cloud(cx, cy, u) {
  disc(cx - 6 * u, cy, 4 * u); disc(cx, cy - 2 * u, 6 * u); disc(cx + 7 * u, cy, 4.5 * u);
  R(cx - 9 * u, cy, 20 * u, 4 * u);
}

// three keyframes: night -> sunrise -> day
let kA = 0, kB = 0, night = 1;
function setPhase(p) {
  kA = smooth(p, 0.06, 0.5);       // night -> sunrise
  kB = smooth(p, 0.46, 0.86);      // sunrise -> day
  night = 1 - smooth(p, 0.05, 0.42);
}
const tri = (n, d, day) => (kB > 0 ? mix(d, day, kB) : mix(n, d, kA));

function drawSky(p, time) {
  setPhase(p);
  const N_ = ['#0b1033', '#111a4a', '#18245f', '#203070', '#2a3d82', '#354b93'];
  const D_ = ['#3b3f8f', '#6a4fa3', '#a862a8', '#e8839b', '#ffa98a', '#ffd39a'];
  const Y_ = ['#3f9bff', '#5aaeff', '#77c0ff', '#96d2ff', '#b6e2ff', '#d2efff'];
  const bands = N_.length;
  for (let i = 0; i < bands; i++) {
    g.fillStyle = tri(N_[i], D_[i], Y_[i]);
    R(0, Math.floor((i * bh) / bands), bw, Math.ceil(bh / bands) + 1);
  }
  const u = Math.max(1, Math.round(Math.min(bw, bh * 0.6) / 90));   // art unit in buffer pixels

  // stars fade as the night ends
  if (night > 0.02) {
    for (const s of stars) {
      g.fillStyle = `rgba(255,255,255,${(night * (0.45 + 0.55 * Math.sin(time * 2 + s.w) ** 2)).toFixed(2)})`;
      R(s.x * bw, s.y * bh * 1.3, u, u);
    }
    // crescent moon (drawn row by row so no cut-out disc shows), drifting up and out
    const mx = Math.round(bw * 0.84), my = Math.round(bh * (0.085 - p * 0.5)), mr = 7 * u;
    const ox = mx + 3 * u, oy = my - 2 * u, or = 6 * u;
    g.fillStyle = `rgba(255,246,214,${night.toFixed(2)})`;
    for (let dy = -mr; dy <= mr; dy++) {
      const w = Math.floor(Math.sqrt(mr * mr - dy * dy));
      const ddy = my + dy - oy;
      let x0 = mx - w, x1 = mx + w;
      if (Math.abs(ddy) <= or) { const ow = Math.floor(Math.sqrt(or * or - ddy * ddy)); if (ox - ow <= x1) x1 = Math.min(x1, ox - ow - 1); }
      if (x1 >= x0) g.fillRect(x0, my + dy, x1 - x0 + 1, 1);
    }
  }

  // the sun climbs from behind the hills
  const sunY = bh * lerp(1.12, bw < bh ? 0.47 : 0.17, smooth(p, 0.14, 0.9));   // on phones it stops beside the bouquet, clear of the text
  const sunX = bw * (bw < bh ? 0.86 : 0.8);
  g.fillStyle = tri('#ffb38a', '#ffd9a0', '#fff3a6'); disc(sunX, sunY, 11 * u);
  g.fillStyle = tri('#ff7a59', '#ffb347', '#ffe45c'); disc(sunX, sunY, 9 * u);

  // clouds, two depths
  for (const c of clouds) {
    const x = (((c.x + time * c.v * (c.far ? 0.5 : 1)) % 1.3) - 0.15) * bw;
    const y = c.y * bh - p * bh * (c.far ? 0.05 : 0.12);
    const cu = u * c.s * (c.far ? 0.8 : 1.3);
    g.fillStyle = tri('#2c3a78', '#e58fa0', c.far ? '#e6f4ff' : '#c9e3fb'); cloud(x, y + 1.5 * cu, cu);
    g.fillStyle = tri('#44548f', '#ffd0c2', '#ffffff'); cloud(x, y, cu);
  }

  // hills, back to front
  const base = bh * (1.02 - p * 0.05);
  g.fillStyle = tri('#1f3a6b', '#8f76b8', '#a5e6a0');
  disc(bw * 0.18, base + 30 * u, 62 * u); disc(bw * 0.78, base + 44 * u, 74 * u);
  g.fillStyle = tri('#17305a', '#6f8f8a', '#74d06f');
  disc(bw * 0.02, base + 52 * u, 66 * u); disc(bw * 0.5, base + 78 * u, 92 * u); disc(bw * 1.0, base + 50 * u, 60 * u);
  g.fillStyle = tri('#10254a', '#55786f', '#4fb85a');
  for (let i = 0; i < 26; i++) {      // speckles on the near hills
    const x = ((i * 0.618) % 1) * bw, y = base - 6 * u + ((i * 37) % 23) * u;
    R(x, y, 2 * u, u); R(x + u, y - u, u, u);
  }

  // hearts rise once the bouquet is finished
  const hh = smooth(p, 0.9, 0.97);
  if (hh > 0.01) {
    for (const h of hearts) {
      const t = (h.o + time * h.v) % 1;
      const x = h.x * bw + Math.sin(time * 1.5 + h.o * 9) * 3 * u, y = bh * (1.05 - t * 1.15);
      g.fillStyle = `rgba(255,90,120,${(hh * Math.min(1, (1 - t) * 3)).toFixed(2)})`;
      const k = u * h.s;
      HEART.forEach((row, ry) => { for (let rx = 0; rx < 7; rx++) if (row[rx] === 'X') R(x + rx * k, y + ry * k, k, k); });
    }
  }
}


/* ------------------------------------------------------------ pixel art */
// tiny hand-drawn sprites: one character = one pixel
const SPR = {
  cinna: { pal: { o: '#7fb2e5', w: '#ffffff', b: '#2f6fd6', p: '#ffb3c7', m: '#7fb2e5' }, rows: [
    '.......oooooooo.......',
    '......owwwwwwwwo......',
    '.....owwwwwwwwwwo.....',
    '.oooowwwwwwwwwwwwoooo.',
    'owwwwwwwwwwwwwwwwwwwwo',
    'owwwwwwbwwwwwwbwwwwwwo',
    '.oooowwbwwwwwwbwwoooo.',
    '.....owpwwmmwwpwo.....',
    '.....owwwwwwwwwwo.....',
    '......owwwwwwwwo......',
    '.......oooooooo.......',
  ] },
  kuromi: { pal: { k: '#2b2233', w: '#ffffff', s: '#ff7ab8', e: '#2b2233', p: '#ffc2dd' }, rows: [
    '..kk..........kk..',
    '.kkkk........kkkk.',
    '.kkkkk......kkkkk.',
    '..kkkkkkkkkkkkkk..',
    '..kkkkkksskkkkkk..',
    '.kkkkkksssskkkkkk.',
    '.kkwwwwwwwwwwwwkk.',
    '.kwwwwwwwwwwwwwwk.',
    '.kwwwewwwwwwewwwk.',
    '.kwwwewwwwwwewwwk.',
    '.kwwpwwwsswwwpwwk.',
    '..kwwwwwwwwwwwwk..',
    '...kkwwwwwwwwkk...',
    '.....kkkkkkkk.....',
  ] },
  kitty: { pal: { o: '#2b2233', w: '#ffffff', r: '#ff3b5c', R: '#ffd23f', k: '#2b2233', y: '#ffd23f' }, rows: [
    '..oo.........rr.rr..',
    '.owwo.......rrrrrrr.',
    '.owwwoooooooorrRrrr.',
    'owwwwwwwwwwwwwrrrro.',
    'owwwwwwwwwwwwwwwwwo.',
    'owwwwwwwwwwwwwwwwwo.',
    'owwkwwwwwwwwwwkwwwo.',
    'owwkwwwwwyywwwkwwwo.',
    'owwwwwwwwwwwwwwwwwo.',
    '.owwwwwwwwwwwwwwwo..',
    '..oowwwwwwwwwwwoo...',
    '....ooooooooooo.....',
  ] },
  apple: { pal: { r: '#ff4d6d', R: '#ffb3c1', n: '#8d5530', l: '#58c463', d: '#d62f52' }, rows: [
    '.....n.ll..',
    '.....nll...',
    '..rrrnrrr..',
    '.rRRrrrrrr.',
    'rRRrrrrrrrd',
    'rRrrrrrrrrd',
    'rrrrrrrrrrd',
    'rrrrrrrrrdd',
    '.rrrrrrrdd.',
    '.rrrrrrddd.',
    '..ddd.ddd..',
  ] },
  book: { pal: { b: '#3f74e0', w: '#ffffff', g: '#b9c6e6', y: '#ffd23f' }, rows: [
    '.bbbbb.bbbbb.',
    'bwwwwwbwwwwwb',
    'bwgggwbwgggwb',
    'bwwwwwbwwwwwb',
    'bwgggwbwgggwb',
    'bwwwwwbwwwwwb',
    'bwgggwbwggwwb',
    'bwwwwwbwwwwwb',
    'bbbbbbbbbbbbb',
    '.....yyy.....',
  ] },
  pencil: { pal: { d: '#2b2233', t: '#f2c89a', y: '#ffd23f', Y: '#f4a91c', g: '#c9d1e6', p: '#ff8fb1' }, rows: [
    '..d..',
    '.tdt.',
    '.ttt.',
    'yyYYY',
    'yyYYY',
    'yyYYY',
    'yyYYY',
    'yyYYY',
    'yyYYY',
    'ggggg',
    'ppppp',
    'ppppp',
  ] },
  board: { pal: { f: '#8d5530', g: '#2f7d5b', w: '#ffffff', y: '#ffd23f' }, rows: [
    'fffffffffffffff',
    'fgggggggggggggf',
    'fgwgggwwgggwwgf',
    'fwgwggwgwggwggf',
    'fwwwggwwgggwggf',
    'fwgwggwgwggwwgf',
    'fgggggggggggggf',
    'fgggyyyyyyygggf',
    'fffffffffffffff',
    '..f.........f..',
  ] },
};
function paint(cv, name) {
  const { pal, rows } = SPR[name];
  const w = Math.max(...rows.map((r) => r.length));
  cv.width = w; cv.height = rows.length;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, w, rows.length);
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) { c.fillStyle = pal[row[x]]; c.fillRect(x, y, 1, 1); } });
}
document.querySelectorAll('canvas[data-sprite]').forEach((cv) => paint(cv, cv.dataset.sprite));

/* dialogue: revealed by scrolling, typed out letter by letter */
const LINES = [
  ['cinna', 'CINNAMOROLL', "Mrs. Bebida! Leck'ten sana bir mesaj getirdik."],
  ['kuromi', 'KUROMI', 'Çiçek solar dedi. Biz de solmayanını kuruyoruz, izle.'],
  ['cinna', 'CINNAMOROLL', 'Bir sürü bebene öğrettiğin her şeyi çok seviyormuş.'],
  ['kuromi', 'KUROMI', 'Bebelerin şanslı. Ama en çok Leck öğrenmiş, itiraf etti.'],
  ['cinna', 'CINNAMOROLL', 'Heyecanı, mutluluğu, güzelliği, bir de sevilmeyi. Hepsini senden öğrenmiş.'],
  ['kuromi', 'KUROMI', 'Çalışma şeklinle, işine saygınla, yaptığın her şeyle gurur duyuyor.'],
  ['kitty', 'HELLO KITTY', 'Hep güzellik saçmaya devam et, Öğretmenler Günün kutlu olsun!'],
].map((l, i) => ({ who: l[0], name: l[1], text: l[2], a: 0.085 + i * 0.118, b: 0.085 + i * 0.118 + 0.11 }));
const talk = document.getElementById('talk');
const faceCv = document.getElementById('face');
const whoEl = document.getElementById('who');
const saidEl = document.getElementById('said');
const unsaidEl = document.getElementById('unsaid');
let talkIdx = -1, talkChars = -1;
function updateTalk(p) {
  const i = LINES.findIndex((l) => p >= l.a && p <= l.b);
  if (i < 0) { if (talkIdx !== -2) { talk.style.opacity = 0; talk.style.visibility = 'hidden'; talkIdx = -2; } return; }
  const l = LINES[i];
  if (i !== talkIdx) {
    talkIdx = i; talkChars = -1;
    paint(faceCv, l.who); whoEl.textContent = l.name;
    talk.classList.toggle('right', l.who === 'kuromi');
    talk.classList.toggle('kitty', l.who === 'kitty');
    talk.style.visibility = 'visible';
  }
  const o = smooth(p, l.a, l.a + 0.012) * (1 - smooth(p, l.b - 0.012, l.b));
  talk.style.opacity = o.toFixed(3);
  const n = Math.round(l.text.length * map(p, l.a + 0.008, l.a + 0.062));
  if (n !== talkChars) { talkChars = n; saidEl.textContent = l.text.slice(0, n); unsaidEl.textContent = l.text.slice(n); }
}

/* ---------------------------------------------------------------- layout */
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  S = W < 820 ? 2 : 3;                               // chunky screen pixels
  bw = Math.ceil(W / S); bh = Math.ceil(H / S);
  sky.width = bw; sky.height = bh;
  renderer.setSize(bw, bh, false);
  camera.aspect = bw / bh;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const narrow = W < 820;
  const availH = narrow ? 0.55 : 0.58, availW = 0.9;
  fitDist = Math.max(40 / (2 * t * availH), 30 / (2 * t * camera.aspect * availW));
  camera.setViewOffset(bw, bh, 0, -Math.round(bh * (narrow ? 0.15 : 0.15)), bw, bh);   // leave the top for the text
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ loop */
const hero = document.getElementById('hero');
const fin = document.getElementById('final');
const countEl = document.getElementById('count');
const hud = document.getElementById('hud');
const peekL = document.getElementById('peekL'), peekR = document.getElementById('peekR'), peekB = document.getElementById('peekB');
let lastCount = -1;

let p = 0, target = 0;
const readScroll = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  target = max > 0 ? clamp(window.scrollY / max) : 0;
};
window.addEventListener('scroll', readScroll, { passive: true });
readScroll();
const forced = new URLSearchParams(location.search).get('p');   // ?p=0.8 shows that moment

const dummy = new THREE.Object3D();
const clock = new THREE.Clock();
const look = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (forced !== null) { target = parseFloat(forced); p = target; }
  p += (target - p) * (1 - Math.pow(0.002, dt));
  if (Math.abs(target - p) < 0.00005) p = target;

  /* text */
  const ho = 1 - smooth(p, 0.012, 0.055);
  hero.style.opacity = ho.toFixed(3); hero.style.visibility = ho < 0.01 ? 'hidden' : 'visible';
  hero.style.transform = `translate3d(0, ${Math.round((ho - 1) * 40)}px, 0)`;
  hud.style.opacity = (1 - ho).toFixed(3);
  const fo = smooth(p, 0.93, 0.975);
  fin.style.opacity = fo.toFixed(3); fin.style.visibility = fo < 0.01 ? 'hidden' : 'visible';
  fin.style.transform = `translate3d(0, ${Math.round((1 - fo) * 18)}px, 0)`;
  updateTalk(p);
  const pk = smooth(p, 0.945, 0.995), bobY = Math.round(Math.sin(time * 2.2) * 2) * 2;
  peekL.style.transform = `translate3d(${Math.round((pk - 1) * 130)}%, ${bobY}px, 0) rotate(14deg)`;
  peekR.style.transform = `translate3d(${Math.round((1 - pk) * 130)}%, ${-bobY}px, 0) rotate(-14deg)`;
  peekB.style.transform = `translate3d(0, ${Math.round((1 - pk) * 130)}%, 0) translateY(${bobY}px)`;
  let n = 0; for (const h of heads) if (p >= h) n++;
  if (n !== lastCount) { lastCount = n; countEl.textContent = '×' + String(n).padStart(2, '0'); }

  /* light follows the sky */
  setPhase(p);
  if (kB > 0) { amb.color.lerpColors(DAWN_AMB, DAY_AMB, kB); sun.color.lerpColors(DAWN_SUN, DAY_SUN, kB); }
  else { amb.color.lerpColors(NIGHT_AMB, DAWN_AMB, kA); sun.color.lerpColors(NIGHT_SUN, DAWN_SUN, kA); }
  amb.intensity = lerp(0.95, 1.35, smooth(p, 0.06, 0.8));
  sun.intensity = lerp(0.9, 2.1, smooth(p, 0.06, 0.8));

  /* voxels */
  for (let i = 0; i < N; i++) {
    const v = voxels[i];
    let x = v.x, y = v.y, z = v.z, s = 1, rot = 0;
    if (v.mode !== 'static') {
      const l = map(p, v.t0, v.t0 + v.dur);
      if (l <= 0) s = 0;
      else if (l < 1) {
        const e = easeOut(l);
        if (v.mode === 'fly') {
          x = lerp(v.from[0], v.x, e); y = lerp(v.from[1], v.y, e); z = lerp(v.from[2], v.z, e);
          rot = (1 - e) * v.spin; s = Math.min(1, l * 4);
        } else if (v.mode === 'bloom') {
          x = lerp(v.from[0], v.x, e); y = lerp(v.from[1], v.y, e); z = lerp(v.from[2], v.z, e);
          s = e * (1 + 0.45 * Math.sin(Math.PI * l));
        } else {
          s = e * (1 + 0.35 * Math.sin(Math.PI * l));
        }
      }
    }
    dummy.position.set(x, y, z);
    dummy.rotation.set(rot, rot * 0.7, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  /* turn + float */
  world.rotation.y = p * Math.PI * 2.5 + time * 0.12;
  world.position.y = Math.sin(time * 0.9) * 0.5;

  /* camera: starts near the empty island, pulls back as the bouquet grows */
  const k = smooth(p, 0.12, 0.5);
  const dist = fitDist * lerp(0.62, 1, k);
  const cy = lerp(4, 12.5, k);
  camera.position.set(0, cy + dist * 0.3, dist * 0.954);
  camera.lookAt(look.set(0, cy, 0));

  drawSky(p, time);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
