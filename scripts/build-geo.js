// 사용법: node scripts/build-geo.js <행정동 geojson> <서울 구 geojson> data/geo.js
// 도봉구 행정동 경계와 서울 25개 구 경계를 SVG path로 바꿔 data/geo.js로 저장한다.
// 행정동: https://github.com/vuski/admdongkor (ver20260701/HangJeongDong_ver20260701.geojson)
// 서울 구: https://github.com/southkorea/seoul-maps (kostat/2013/json/seoul_municipalities_geo_simple.json)
const fs = require('fs');
const [hjdPath, guPath, outPath] = process.argv.slice(2);

const hjd = JSON.parse(fs.readFileSync(hjdPath, 'utf8'));
const gu = JSON.parse(fs.readFileSync(guPath, 'utf8'));

const AREA_OF = (dong) => {
  if (dong.startsWith('쌍문')) return '쌍문동';
  if (dong.startsWith('방학')) return '방학동';
  if (dong.startsWith('창')) return '창동';
  if (dong.startsWith('도봉')) return '도봉동';
  return null;
};

const ringsOf = (geom) => geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
const outerRingsOf = (geom) => geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);

function makeProjector(features, width, pad) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  features.forEach((f) => ringsOf(f.geometry).forEach((r) => r.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  })));
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  const w = (maxX - minX) * k, h = maxY - minY;
  const s = (width - pad * 2) / w;
  const height = Math.round(h * s + pad * 2);
  return {
    width, height,
    p: ([x, y]) => [pad + (x - minX) * k * s, pad + (maxY - y) * s]
  };
}

// Douglas-Peucker
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const sq = (a, b, p) => {
    let [x, y] = a; let dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y; return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, max = tol * tol;
    for (let i = a + 1; i < b; i++) { const d = sq(pts[a], pts[b], pts[i]); if (d > max) { idx = i; max = d; } }
    if (idx > -1) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function pathOf(geom, proj, tol) {
  return outerRingsOf(geom).map((ring) => {
    const pts = simplify(ring.map(proj.p), tol);
    return 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
  }).join('');
}

// 면적 가중 중심
function centroidOf(geom, proj) {
  let A = 0, cx = 0, cy = 0;
  outerRingsOf(geom).forEach((ring) => {
    const pts = ring.map(proj.p);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const f = x0 * y1 - x1 * y0; A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
  });
  A /= 2;
  return { x: cx / (6 * A), y: cy / (6 * A), area: Math.abs(A) };
}

// 도봉구 행정동
const dobong = hjd.features.filter((f) => f.properties.sggnm === '도봉구');
const dp = makeProjector(dobong, 360, 12);
const dongs = dobong.map((f) => {
  const name = f.properties.adm_nm.split(' ').pop();
  const c = centroidOf(f.geometry, dp);
  return { name, code: f.properties.adm_cd2, area: AREA_OF(name), d: pathOf(f.geometry, dp, 0.2), cx: +c.x.toFixed(1), cy: +c.y.toFixed(1), size: c.area };
}).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const areas = {};
dongs.forEach((d) => {
  const a = areas[d.area] || (areas[d.area] = { name: d.area, sx: 0, sy: 0, size: 0, dongs: [] });
  a.sx += d.cx * d.size; a.sy += d.cy * d.size; a.size += d.size; a.dongs.push(d.name);
});
const areaList = Object.values(areas).map((a) => ({ name: a.name, cx: +(a.sx / a.size).toFixed(1), cy: +(a.sy / a.size).toFixed(1), dongs: a.dongs }));
dongs.forEach((d) => delete d.size);

// 서울 25개 구
const sp = makeProjector(gu.features, 320, 8);
const seoul = gu.features.map((f) => {
  const c = centroidOf(f.geometry, sp);
  return { code: f.properties.code, name: f.properties.name, d: pathOf(f.geometry, sp, 0.5), cx: +c.x.toFixed(1), cy: +c.y.toFixed(1) };
}).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const out = {
  source: '행정동 경계: vuski/admdongkor ver20260701 (통계청 행정동 기준), 구 경계: southkorea/seoul-maps (통계청 2013)',
  dobong: { width: dp.width, height: dp.height, dongs, areas: areaList },
  seoul: { width: sp.width, height: sp.height, gu: seoul }
};
fs.writeFileSync(outPath, `/* 자동 생성: build-geo.js — 직접 고치지 마세요 */\nwindow.KIDS_GEO = ${JSON.stringify(out)};\n`);
console.log('dongs', dongs.map((d) => d.name + ':' + d.area).join(', '));
console.log('areas', JSON.stringify(areaList));
console.log('dobong size', dp.width, dp.height, '| seoul size', sp.width, sp.height, '| gu', seoul.length);
console.log('bytes', fs.statSync(outPath).size);
