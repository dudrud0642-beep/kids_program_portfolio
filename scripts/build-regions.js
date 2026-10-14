// 사용법: node scripts/build-regions.js <공공서비스예약 CSV> <행정동 geojson>
// 서울 열린데이터광장 "서울시 공공서비스예약(종합) 정보"(OA-20497, 공공누리 1유형) CSV에서
// 도봉구를 뺀 24개 구의 아이·가족 프로그램을 골라 구마다 data/regions/<코드>.js 를 만든다.
//  - CSV: https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do → [내려받기(CSV)] (로그인 없이 받을 수 있음)
//  - 행정동 경계: https://github.com/vuski/admdongkor (ver20260701) — 구별 지도와 장소의 동 찾기에 쓴다
//  - 도봉구는 기관 11곳을 따로 모은 data/programs.js 를 그대로 쓴다
const fs = require('fs');
const path = require('path');

const [csvPath, hjdPath] = process.argv.slice(2);
if (!csvPath || !hjdPath) { console.error('사용법: node scripts/build-regions.js <CSV> <행정동 geojson>'); process.exit(1); }
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'regions');
const HOME = '도봉구';
const DATASET_URL = 'https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do';

global.window = {};
require(path.join(ROOT, 'data', 'geo.js'));
const SEOUL = window.KIDS_GEO.seoul.gu; // { code, name, d, cx, cy }

/* ---------- CSV (EUC-KR, 따옴표 묶음) ---------- */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length >= head.length).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}
const buf = fs.readFileSync(csvPath);
const csvText = (() => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('euc-kr').decode(buf); } })();
const rows = parseCSV(csvText.replace(/^﻿/, ''));
const csvDate = new Date(fs.statSync(csvPath).mtime.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

/* ---------- 고르기·나이 분류 ---------- */
const KID_WORDS = /어린이|아동|유아|영아|초등|가족|아이|자녀|개월|미취학|유치원|어린이집|보호자\s*동반/;
function ageTags(target) {
  const t = target || '';
  const tags = new Set();
  if (/영아|\d+\s*개월|(?:^|[^0-9])[0-2]\s*세/.test(t)) tags.add('infant');
  if (/유아|미취학|유치원|어린이집|(?:^|[^0-9])[3-7]\s*세/.test(t)) tags.add('preschool');
  if (/초등|어린이|아동|(?:^|[^0-9])(?:[8-9]|1[0-3])\s*세/.test(t)) {
    const low = /저학년|[1-3]\s*학년/.test(t), high = /고학년|[4-6]\s*학년/.test(t);
    if (low || !high) tags.add('elem-low');
    if (high || !low) tags.add('elem-high');
  }
  if (/가족|부모|보호자|자녀/.test(t)) tags.add('family');
  return [...tags];
}
const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(0, 10) : null);
const hm = (s) => (/\d{2}:\d{2}/.test(s || '') ? s.slice(11, 16) : null);

/* ---------- 지도: 행정동 경계 → SVG ---------- */
const hjd = JSON.parse(fs.readFileSync(hjdPath, 'utf8')).features.filter((f) => f.properties.sidonm === '서울특별시');
const outerRings = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));
const allRings = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());
function projector(features, width, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  features.forEach((f) => allRings(f.geometry).forEach((r) => r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })));
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const s = (width - pad * 2) / ((x1 - x0) * k);
  return { width, height: Math.round((y1 - y0) * s + pad * 2), p: ([x, y]) => [pad + (x - x0) * k * s, pad + (y1 - y) * s] };
}
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const sq = (a, b, p) => { let [x, y] = a; let dx = b[0] - x, dy = b[1] - y; if (dx || dy) { const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } } dx = p[0] - x; dy = p[1] - y; return dx * dx + dy * dy; };
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) { const [a, b] = stack.pop(); let idx = -1, max = tol * tol; for (let i = a + 1; i < b; i++) { const d = sq(pts[a], pts[b], pts[i]); if (d > max) { idx = i; max = d; } } if (idx > -1) { keep[idx] = 1; stack.push([a, idx], [idx, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const pathOf = (g, pr, tol) => outerRings(g).map((r) => 'M' + simplify(r.map(pr.p), tol).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z').join('');
function centroid(g, pr) {
  let A = 0, cx = 0, cy = 0;
  outerRings(g).forEach((r) => { const pts = r.map(pr.p); for (let i = 0; i < pts.length - 1; i++) { const [a0, b0] = pts[i], [a1, b1] = pts[i + 1]; const f = a0 * b1 - a1 * b0; A += f; cx += (a0 + a1) * f; cy += (b0 + b1) * f; } });
  A /= 2; return { x: cx / (6 * A), y: cy / (6 * A), size: Math.abs(A) };
}
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inGeom = (pt, g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));
const dongAt = (x, y) => (Number.isFinite(x) && Number.isFinite(y) ? hjd.find((f) => inGeom([x, y], f.geometry)) : null);

// 행정동을 지도 권역으로 묶기: "상계1동·상계3·4동…" → "상계동", 혼자인 동은 이름 그대로
const baseName = (dong) => dong.replace(/(?:제?\d+(?:[·.,]\d+)*가?|본)동$/, '동');

/* ---------- 구별로 모으기 ---------- */
const kidsRows = rows.filter((r) => ['교육강좌', '문화체험'].includes(r['대분류명']) && KID_WORDS.test(r['서비스대상'] || ''));
const byGu = {};
let assigned = 0;
for (const r of kidsRows) {
  const x = Number(r['장소X좌표']), y = Number(r['장소Y좌표']);
  const dong = dongAt(x, y);
  // 지역명이 비어 있으면 장소 좌표로 구를 찾는다
  let gu = /구$/.test(r['지역명']) ? r['지역명'] : (dong ? dong.properties.sggnm : null);
  if (!/구$/.test(r['지역명']) && gu) assigned++;
  if (!gu || gu === HOME || !SEOUL.some((g) => g.name === gu)) continue;
  (byGu[gu] = byGu[gu] || []).push({ r, dong: dong && dong.properties.sggnm === gu ? dong.properties.adm_nm.split(' ').pop() : null });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const index = {};
for (const g of SEOUL) {
  if (g.name === HOME) continue;
  const list = byGu[g.name] || [];
  const feats = hjd.filter((f) => f.properties.sggnm === g.name);
  const pr = projector(feats, 360, 12);
  const dongs = feats.map((f) => {
    const name = f.properties.adm_nm.split(' ').pop();
    const c = centroid(f.geometry, pr);
    return { name, base: baseName(name), d: pathOf(f.geometry, pr, 0.25), cx: c.x, cy: c.y, size: c.size };
  });
  const baseCount = dongs.reduce((a, d) => ((a[d.base] = (a[d.base] || 0) + 1), a), {});
  dongs.forEach((d) => { d.area = baseCount[d.base] > 1 ? d.base : d.name; });
  const areaMap = {};
  dongs.forEach((d) => {
    const a = areaMap[d.area] || (areaMap[d.area] = { name: d.area, sx: 0, sy: 0, size: 0, dongs: [] });
    a.sx += d.cx * d.size; a.sy += d.cy * d.size; a.size += d.size; a.dongs.push(d.name);
  });
  const areas = Object.values(areaMap).map((a) => ({ name: a.name, cx: +(a.sx / a.size).toFixed(1), cy: +(a.sy / a.size).toFixed(1), dongs: a.dongs.sort((p, q) => p.localeCompare(q, 'ko')) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const areaOfDong = Object.fromEntries(dongs.map((d) => [d.name, d.area]));

  const facilities = [];
  const programs = [];
  const seen = new Set();
  list.forEach(({ r, dong }) => {
    if (seen.has(r['서비스ID'])) return;
    seen.add(r['서비스ID']);
    const place = r['장소명'];
    const area = dong ? areaOfDong[dong] : null;
    if (place && !facilities.some((f) => f.name === place)) facilities.push({ org: 'seoul', name: place, address: null, area, tel: r['연락처'] || null });
    const target = r['서비스대상'].replace(/\s+/g, ' ').trim();
    const vmin = r['서비스이용시작시간'] && r['서비스이용시작시간'] !== '00:00' ? r['서비스이용시작시간'] : null;
    const vmax = r['서비스이용종료시간'] && r['서비스이용종료시간'] !== '00:00' ? r['서비스이용종료시간'] : null;
    const applyAt = hm(r['접수시작일시']) && hm(r['접수시작일시']) !== '00:00' ? `${r['접수시작일시'].slice(5, 10).replace('-', '/')} ${hm(r['접수시작일시'])}부터` : null;
    programs.push({
      id: `${g.code}-${programs.length + 1}`,
      org: 'seoul',
      title: r['서비스명'].replace(/\s+/g, ' ').trim().replace(/^[-–·*]+\s*/, ''), // 맨 앞 '- ' 같은 기호만 뗀다
      facility: place || null,
      area,
      category: [r['대분류명'], r['소분류명']].filter(Boolean).join(' > '),
      target,
      ageTags: ageTags(target),
      programStart: day(r['서비스개시시작일시']),
      programEnd: day(r['서비스개시종료일시']),
      schedule: vmin ? `${vmin}${vmax ? `~${vmax}` : ''}` : null,
      sessions: null,
      applyStart: day(r['접수시작일시']),
      applyEnd: day(r['접수종료일시']),
      applyMethod: ['온라인 예약 (서울시 공공서비스예약)', applyAt].filter(Boolean).join(' · '),
      capacity: null,
      applied: null,
      fee: r['결제방법'] === '무료' ? 0 : null,
      feeText: r['결제방법'] || null,
      statusText: r['서비스상태'] || null,
      url: r['바로가기URL'] || null,
      image: r['이미지주소'] || null,
      description: null
    });
  });

  const data = {
    region: g.name,
    collectedAt: csvDate,
    scope: 'public', // 이 구는 서울시 공공서비스예약 한 곳만 모았음
    types: [{ key: 'public', label: '공공예약' }],
    orgs: [{
      key: 'seoul', name: `서울시 공공서비스예약 (${g.name})`, type: 'public', method: 'public',
      url: 'https://yeyak.seoul.go.kr', listUrl: DATASET_URL,
      note: '서울 열린데이터광장 "서울시 공공서비스예약(종합) 정보"(공공누리 1유형)에서 받은 자료예요. 구 도서관·문화재단 등 다른 기관 소식은 아직 모으지 않았어요.'
    }],
    facilities,
    programs,
    geo: {
      width: pr.width, height: pr.height,
      dongs: dongs.map((d) => ({ name: d.name, area: d.area, d: d.d })).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      areas
    }
  };
  const file = `${g.code}.js`;
  fs.writeFileSync(path.join(OUT_DIR, file), `/* 자동 생성: scripts/build-regions.js — 직접 고치지 마세요 */\n(window.KIDS_REGION_DATA = window.KIDS_REGION_DATA || {})[${JSON.stringify(g.name)}] = ${JSON.stringify(data)};\n`);
  index[g.name] = { code: g.code, file, count: programs.length };
  const placed = programs.filter((p) => p.area).length;
  console.log(`${g.name.padEnd(5)} ${String(programs.length).padStart(3)}건 · 지도에 표시 ${placed} · 권역 ${areas.length}개 · 지도 ${pr.width}×${pr.height} · ${(fs.statSync(path.join(OUT_DIR, file)).size / 1024).toFixed(0)}KB`);
}
fs.writeFileSync(path.join(OUT_DIR, 'index.js'), `/* 자동 생성: scripts/build-regions.js — 직접 고치지 마세요 */\nwindow.KIDS_REGIONS = ${JSON.stringify({ collectedAt: csvDate, source: DATASET_URL, home: HOME, list: index })};\n`);
console.log(`아이·가족 ${kidsRows.length}건 (지역명이 비어 좌표로 구를 찾은 것 ${assigned}건) → data/regions/ ${Object.keys(index).length}개 구`);
