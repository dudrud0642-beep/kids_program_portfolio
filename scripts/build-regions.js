// 사용법: node scripts/build-regions.js [--api data/raw/seoul-api.json] [--hjd scripts/geo/seoul-hjd.json]
// 서울시 공공서비스예약 아이·가족 프로그램(scripts/collect-seoul-api.js 결과)을 구별로 나누고,
// 기관 사이트를 따로 모은 구는 data/raw/<구 코드>/*.json 을 합쳐 구마다 data/regions/<코드>.js 를 만든다.
//  - 도봉구는 data/programs.js(scripts/build-data.js)로 만든다 → 여기서는 도봉구 공공예약 몫만
//    data/raw/11100/yeyak.json 으로 넘겨 준다
//  - 행정동 경계: https://github.com/vuski/admdongkor (ver20260701) 서울만 추린 scripts/geo/seoul-hjd.json
//    — 구별 지도와 장소의 동 찾기에 쓴다
//  - 끝난 프로그램은 빼고, 아이디는 바뀌지 않게(공공예약 서비스 ID·원문 주소), 처음 본 날(NEW)을 붙인다
const fs = require('fs');
const path = require('path');
const { ROOT, kstToday, assignIds, notEnded, loadState, saveState, stampFirstSeen, normalizeProgram, str } = require('./lib/common');

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const API_FILE = path.resolve(arg('api', path.join(ROOT, 'data', 'raw', 'seoul-api.json')));
const HJD_FILE = path.resolve(arg('hjd', path.join(ROOT, 'scripts', 'geo', 'seoul-hjd.json')));
const TODAY = arg('today', kstToday());
const OUT_DIR = path.join(ROOT, 'data', 'regions');
const RAW = path.join(ROOT, 'data', 'raw');
const HOME = '도봉구';
const DATASET_URL = 'https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do';

global.window = {};
require(path.join(ROOT, 'data', 'geo.js'));
const SEOUL = window.KIDS_GEO.seoul.gu; // { code, name, d, cx, cy }
const HOME_CODE = SEOUL.find((g) => g.name === HOME).code;

const api = JSON.parse(fs.readFileSync(API_FILE, 'utf8'));
// 기관 시설의 동: 주소정보누리집에서 찾아 둔 결과 (scripts/lookup-areas.js, 손으로 돌림)
const LOOKUP = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', 'areas.lookup.json'), 'utf8')).results; } catch (e) { return []; } })();

/* ---------- 나이 분류·일정 ---------- */
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
// 제목에 원문 그대로 적힌 요일만 읽는다: "(토)", "(화,수,목)", "[노원정원지원센터/일]", "매주 토", "토요일", "(주말)"
// 추측하지 않는다 — 요일 표시가 없으면 빈 배열
const DOW_ORDER = '월화수목금토일';
function daysFromTitle(title) {
  const t = title || '';
  const found = new Set();
  const add = (s) => [...s].filter((c) => DOW_ORDER.includes(c)).forEach((c) => found.add(c));
  for (const m of t.matchAll(/\(([월화수목금토일](?:\s*[,·/]\s*[월화수목금토일])*)\)/g)) add(m[1]);
  for (const m of t.matchAll(/\/([월화수목금토일])\]/g)) add(m[1]);
  for (const m of t.matchAll(/매주\s*([월화수목금토일](?:\s*[,·]\s*[월화수목금토일])*)/g)) add(m[1]);
  for (const m of t.matchAll(/([월화수목금토일])요일/g)) add(m[1]);
  if (/\(주말|주말\)|\[주말/.test(t)) { found.add('토'); found.add('일'); }
  return [...found].sort((a, b) => DOW_ORDER.indexOf(a) - DOW_ORDER.indexOf(b));
}
const hm = (s) => (/\d{2}:\d{2}/.test(s || '') ? s.slice(11, 16) : null);

// 공공서비스예약 원문 행 → 프로그램 (원문 값 그대로, 형식만 정리)
function fromSeoulRow(r) {
  const target = (r.USETGTINFO || '').replace(/\s+/g, ' ').trim();
  const vmin = r.V_MIN && r.V_MIN !== '00:00' ? r.V_MIN : null;
  const vmax = r.V_MAX && r.V_MAX !== '00:00' ? r.V_MAX : null;
  const applyAt = hm(r.RCPTBGNDT) && hm(r.RCPTBGNDT) !== '00:00' ? `${r.RCPTBGNDT.slice(5, 10).replace('-', '/')} ${hm(r.RCPTBGNDT)}부터` : null;
  const days = daysFromTitle(r.SVCNM);
  return {
    title: (r.SVCNM || '').replace(/\s+/g, ' ').trim().replace(/^[-–·*]+\s*/, ''), // 맨 앞 '- ' 같은 기호만 뗀다
    facility: r.PLACENM || null,
    category: [r.MAXCLASSNM, r.MINCLASSNM].filter(Boolean).join(' > '),
    target,
    ageTags: ageTags(target),
    programStart: day(r.SVCOPNBGNDT),
    programEnd: day(r.SVCOPNENDDT),
    // 여러 날 진행: 제목에 적힌 요일 + 이용 시각 (예: "토요일 10:00~12:00") → 이번 주 일정·주말에 쓰인다
    schedule: [days.length && day(r.SVCOPNBGNDT) !== day(r.SVCOPNENDDT) ? `${days.join('·')}요일` : null,
      vmin ? `${vmin}${vmax ? `~${vmax}` : ''}` : null].filter(Boolean).join(' ') || null,
    sessions: null,
    applyStart: day(r.RCPTBGNDT),
    applyEnd: day(r.RCPTENDDT),
    applyMethod: ['온라인 예약 (서울시 공공서비스예약)', applyAt].filter(Boolean).join(' · '),
    capacity: null,
    applied: null,
    fee: r.PAYATNM === '무료' ? 0 : null,
    feeText: r.PAYATNM || null,
    statusText: r.SVCSTATNM || null,
    url: r.SVCURL || null,
    image: r.IMGURL || null,
    description: r.DTLCONT || null
  };
}

/* ---------- 지도: 행정동 경계 → SVG ---------- */
const hjd = JSON.parse(fs.readFileSync(HJD_FILE, 'utf8')).features.filter((f) => f.properties.sidonm === '서울특별시');
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

/* ---------- 공공예약 행을 구별로 ---------- */
const byGu = {};
let assigned = 0;
for (const r of api.rows) {
  const dong = dongAt(Number(r.X), Number(r.Y));
  // 지역명이 비어 있으면 장소 좌표로 구를 찾는다 (서울 밖은 뺀다)
  let gu = /구$/.test(r.AREANM) ? r.AREANM : (dong ? dong.properties.sggnm : null);
  if (!/구$/.test(r.AREANM) && gu) assigned++;
  if (!gu || !SEOUL.some((g) => g.name === gu)) continue;
  (byGu[gu] = byGu[gu] || []).push({ r, dong: dong && dong.properties.sggnm === gu ? dong.properties.adm_nm.split(' ').pop() : null });
}

// 기관 사이트에서 따로 모은 자료 (data/raw/<구 코드>/*.json, scripts/collectors/*)
function institutionFiles(code) {
  const dir = path.join(RAW, code);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'yeyak.json').sort()
    .map((f) => ({ file: f, raw: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}
// 기관 종류 (탭) — 수집기 이름으로 정한다
const INST_TYPE = (source) => (/lib/.test(source) ? 'library' : /childcare/.test(source) ? 'childcare' : /famil/.test(source) ? 'family' : /youth/.test(source) ? 'youth' : 'foundation');
const TYPES = [
  { key: 'library', label: '도서관' }, { key: 'foundation', label: '문화재단' }, { key: 'public', label: '공공예약' },
  { key: 'childcare', label: '육아지원센터' }, { key: 'family', label: '가족센터' }, { key: 'youth', label: '청소년시설' }, { key: 'museum', label: '박물관' }
];

fs.mkdirSync(OUT_DIR, { recursive: true });
const state = loadState() || {};
const index = {};
for (const g of SEOUL) {
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
  // 주소 글에 적힌 동 이름("(상계동)", "공릉동 …")으로 권역 찾기 — 없으면 비워 둔다
  const areaOfAddress = (addr) => {
    if (!addr) return null;
    const hit = areas.find((a) => new RegExp(`[\\s(,]${a.name.replace(/동$/, '')}\\d*(?:[·.]\\d+)*동`).test(` ${addr}`));
    return hit ? hit.name : null;
  };

  // 공공예약 몫
  const pubFacilities = [];
  const pubPrograms = [];
  list.forEach(({ r, dong }) => {
    const place = r.PLACENM;
    const area = dong ? areaOfDong[dong] : null;
    if (place && !pubFacilities.some((f) => f.name === place)) pubFacilities.push({ name: place, address: null, area, url: null, tel: r.TELNO && r.TELNO !== '***' ? r.TELNO : null });
    const p = fromSeoulRow(r);
    if (!notEnded(p, TODAY)) return;
    pubPrograms.push({ svcId: r.SVCID, area, ...p });
  });

  // 도봉구: 공공예약 몫을 기관 수집 결과와 같은 모양으로 넘긴다 (build-data.js가 합친다)
  if (g.code === HOME_CODE) {
    const dir = path.join(RAW, HOME_CODE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'yeyak.json'), JSON.stringify({
      source: 'yeyak', sourceName: `서울시 공공서비스예약 (${HOME})`, sourceUrl: 'https://yeyak.seoul.go.kr', listUrl: DATASET_URL,
      collectedAt: api.collectedAt,
      howToCollect: 'scripts/collect-seoul-api.js(서울 열린데이터광장 공공서비스예약 정보 API) → scripts/build-regions.js가 도봉구 몫만 이 파일로 씀. 장소의 동은 장소 좌표로 찾음.',
      facilities: pubFacilities.map(({ tel, ...f }) => f),
      programs: pubPrograms.map(({ svcId, area, ...p }) => p)
    }, null, 1));
    console.log(`${g.name.padEnd(5)} 공공예약 ${pubPrograms.length}건 → data/raw/${HOME_CODE}/yeyak.json`);
    continue;
  }

  const orgs = [{
    key: 'seoul', name: `서울시 공공서비스예약 (${g.name})`, type: 'public', method: 'public', statusKey: 'seoul-api',
    url: 'https://yeyak.seoul.go.kr', listUrl: DATASET_URL, collectedAt: api.collectedAt,
    note: '서울 열린데이터광장 "서울시 공공서비스예약 정보"(공공누리 1유형)에서 받은 자료예요.'
  }];
  const facilities = pubFacilities.map((f) => ({ org: 'seoul', ...f }));
  const programs = pubPrograms.map(({ svcId, ...p }) => ({ id: `${g.code}-${svcId}`, org: 'seoul', ...p }));

  // 기관 사이트 몫
  institutionFiles(g.code).forEach(({ file, raw }) => {
    const key = raw.source;
    orgs.push({
      key, name: raw.sourceName, type: INST_TYPE(key), method: 'crawl', statusKey: `${g.code}/${file.replace(/\.json$/, '')}`,
      url: str(raw.sourceUrl), listUrl: str(raw.listUrl), collectedAt: raw.collectedAt, note: str(raw.note)
    });
    (raw.facilities || []).forEach((f) => {
      const name = str(f.name);
      const found = LOOKUP.find((r) => r.address === f.address && r.area && areas.some((a) => a.name === r.area));
      if (name && !facilities.some((x) => x.org === key && x.name === name)) facilities.push({ org: key, name, address: str(f.address), area: f.area || (found && found.area) || areaOfAddress(f.address), url: str(f.url) });
    });
    const mine = [];
    (raw.programs || []).forEach((rp) => {
      const p = normalizeProgram(rp);
      if (!p || !notEnded(p, TODAY)) return;
      const fac = facilities.find((f) => f.org === key && f.name === p.facility);
      mine.push({ org: key, area: fac ? fac.area : null, ...p });
    });
    assignIds(mine, `${g.code}-${key}`);
    programs.push(...mine.map(({ id, ...p }) => ({ id, ...p })));
  });

  stampFirstSeen(state, programs, (p) => `${g.code}/${p.org}`, TODAY, orgs.map((o) => `${g.code}/${o.key}`));
  const instCount = programs.filter((p) => p.org !== 'seoul').length;
  const usedTypes = new Set(programs.map((p) => orgs.find((o) => o.key === p.org).type));
  const data = {
    region: g.name,
    collectedAt: [api.collectedAt, ...orgs.map((o) => o.collectedAt)].filter(Boolean).sort().pop(),
    scope: orgs.length > 1 ? 'mixed' : 'public', // public = 서울시 공공서비스예약 한 곳만, mixed = 기관 사이트도 일부
    types: TYPES.filter((t) => usedTypes.has(t.key)),
    orgs,
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
  console.log(`${g.name.padEnd(5)} ${String(programs.length).padStart(3)}건${instCount ? ` (기관 ${instCount})` : ''} · 지도에 표시 ${placed} · 권역 ${areas.length}개 · ${(fs.statSync(path.join(OUT_DIR, file)).size / 1024).toFixed(0)}KB`);
}
saveState(state);
fs.writeFileSync(path.join(OUT_DIR, 'index.js'), `/* 자동 생성: scripts/build-regions.js — 직접 고치지 마세요 */\nwindow.KIDS_REGIONS = ${JSON.stringify({ collectedAt: api.collectedAt, source: DATASET_URL, home: HOME, list: index })};\n`);
console.log(`아이·가족 ${api.rows.length}건 (지역명이 비어 좌표로 구를 찾은 것 ${assigned}건) → data/regions/ ${Object.keys(index).length}개 구`);
