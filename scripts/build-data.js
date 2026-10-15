// 사용법: node scripts/build-data.js [--today YYYY-MM-DD]
// 도봉구 기관별 수집 결과를 합쳐 화면에서 쓰는 data/programs.js로 만든다.
//  - data/raw/11100/*.json: 자동 수집(scripts/collectors/*, 공공예약은 build-regions.js가 씀) — 있으면 이것을 쓴다
//  - data/raw/*.json: 처음에 사람이 확인하며 모은 자료 — 자동 수집기가 없는 기관(육아종합지원센터·청소년시설 등)은 이것을 쓴다
// 원문 값은 바꾸지 않고, 형식(날짜·숫자)만 정리하고 중복·끝난 프로그램을 걸러 낸다.
const fs = require('fs');
const path = require('path');
const { ROOT, kstToday, assignIds, notEnded, loadState, saveState, stampFirstSeen, normalizeProgram, str, norm } = require('./lib/common');

const RAW = path.join(ROOT, 'data', 'raw');
const AUTO = path.join(RAW, '11100');
const OUT = path.join(ROOT, 'data', 'programs.js');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const TODAY = arg('today', kstToday());

// 탭 = 기관 유형 (화면 순서)
const TYPES = [
  { key: 'library', label: '도서관' },
  { key: 'foundation', label: '문화재단' },
  { key: 'public', label: '공공예약' },
  { key: 'childcare', label: '육아지원센터' },
  { key: 'family', label: '가족센터' },
  { key: 'youth', label: '청소년시설' },
  { key: 'museum', label: '박물관' }
];
const SOURCE_TYPE = { unilib: 'library', dbfac: 'foundation', yeyak: 'public', dooly: 'museum' };
// 서울시 공공서비스예약에는 구청 시설과 서울시 시설(로봇인공지능과학관, 서울창포원 등)이 함께 있어 이름을 바꿔 보여 준다
const SOURCE_NAME = { yeyak: '서울시 공공서비스예약 (도봉구)' };
// 자동 수집 파일 이름 → 기관 키 (처음 모은 자료와 같은 키를 써서 화면·저장이 이어지게)
const AUTO_ORG = { 'family.json': { key: 'familycenter', type: 'family' } };

// 수집은 됐지만 이 서비스 기준(도봉구에서 열리는 아이 프로그램)에 맞지 않아 뺀 것 — 이유를 남긴다
const EXCLUDE = [
  { org: 'yeyak', title: '우리 가족 마음 채움', reason: '1차 장소가 강북구(시립강북청소년센터)이고 청소년 가족 대상' }
];
const AREAS = ['쌍문동', '방학동', '창동', '도봉동'];

const LOOKUP_FILE = 'areas.lookup.json';
const IMAGES_FILE = 'images.lookup.json';
const readLookup = (file) => (fs.existsSync(path.join(RAW, file)) ? JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8')).results : []);
const lookup = readLookup(LOOKUP_FILE);
// 상세 페이지 대표 이미지 (scripts/fetch-images.js)
const imageOf = new Map(readLookup(IMAGES_FILE).filter((r) => r.image).map((r) => [r.url, r.image]));

const orgs = [];
const facilities = [];
const programs = [];
const seen = new Set();
const skipped = [];
let ended = 0;

function addFacility(org, f) {
  const name = str(f.name);
  if (!name || facilities.some((x) => x.org === org && x.name === name)) return;
  // 사이트 주소에 동이 없으면 주소정보누리집 조회 결과(scripts/lookup-areas.js)로 채운다
  const found = lookup.find((r) => r.address === f.address && r.area);
  const known = manualFacArea.get(norm(name));
  const area = AREAS.includes(f.area) ? f.area : found && AREAS.includes(found.area) ? found.area : AREAS.includes(known) ? known : null;
  facilities.push({ org, name, address: str(f.address), area, url: str(f.url) });
}

// 자동 수집기가 목록만 읽을 수 있는 기관(가족센터: 상세는 로그인 세션 필요)은
// 같은 원문 주소를 처음에 사람이 확인하며 모은 기록이 있으면, 비어 있는 상세 값만 그 기록으로 채운다 (같은 공식 페이지의 값)
const DETAIL_FIELDS = ['target', 'schedule', 'sessions', 'capacity', 'applyMethod', 'description', 'category'];
const manualByUrl = new Map();
const manualFacArea = new Map();
fs.readdirSync(RAW).filter((f) => f.endsWith('.json') && !f.endsWith('.lookup.json') && f !== 'seoul-api.json').forEach((file) => {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));
  (raw.programs || []).forEach((p) => { if (p.url) manualByUrl.set(p.url, p); });
  (raw.facilities || []).forEach((f) => { if (f.area) manualFacArea.set(norm(f.name), f.area); });
});
const LIST_ONLY = new Set(['familycenter']); // 목록만 읽는 수집기
function fillFromManual(org, raw) {
  const old = LIST_ONLY.has(org) && raw.url && manualByUrl.get(raw.url);
  if (!old) return raw;
  const out = { ...raw };
  DETAIL_FIELDS.forEach((k) => { if (out[k] == null && old[k] != null) out[k] = old[k]; });
  if (!(out.ageTags || []).length && (old.ageTags || []).length) out.ageTags = old.ageTags;
  return out;
}

function addPrograms(org, list) {
  const mine = [];
  const urlCount = {};
  list.forEach((p) => { if (p.url) urlCount[p.url] = (urlCount[p.url] || 0) + 1; });
  list.forEach((raw0) => {
    const raw = fillFromManual(org, raw0);
    const p = normalizeProgram(raw);
    if (!p) { skipped.push(`${org}: ${raw.title} (${raw.target})`); return; }
    const ex = EXCLUDE.find((e) => e.org === org && p.title.includes(e.title));
    if (ex) { skipped.push(`${org}: ${p.title} — ${ex.reason}`); return; }
    if (!notEnded(p, TODAY)) { ended++; return; }
    // 같은 기관 안의 중복만 거른다: 원문 주소가 있으면 주소로 (제목이 같아도 요일·대상이 다른 반은 따로)
    const key = [org, p.url && urlCount[p.url] === 1 ? p.url : [p.url, norm(p.title), norm(p.facility), p.programStart || ''].join('|')].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const fac = facilities.find((f) => f.org === org && norm(f.name) === norm(p.facility));
    mine.push({ org, ...p, area: fac ? fac.area : null, image: p.image || imageOf.get(p.url) || null });
  });
  assignIds(mine, org);
  programs.push(...mine.map(({ id, ...p }) => ({ id, ...p })));
}

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const autoFiles = fs.existsSync(AUTO) ? fs.readdirSync(AUTO).filter((f) => f.endsWith('.json')).sort() : [];
const autoKeys = new Set(autoFiles.map((f) => (AUTO_ORG[f] ? AUTO_ORG[f].key : readJSON(path.join(AUTO, f)).source)));

// 1) 자동 수집 자료
autoFiles.forEach((file) => {
  const raw = readJSON(path.join(AUTO, file));
  const map = AUTO_ORG[file];
  const key = map ? map.key : raw.source;
  const type = map ? map.type : SOURCE_TYPE[key];
  if (!type) return;
  orgs.push({
    key, name: SOURCE_NAME[key] || raw.sourceName, type,
    url: str(raw.sourceUrl), listUrl: str(raw.listUrl), note: str(raw.note),
    method: key === 'yeyak' ? 'public' : 'crawl',
    statusKey: key === 'yeyak' ? 'seoul-api' : `11100/${file.replace(/\.json$/, '')}`,
    collectedAt: raw.collectedAt
  });
  (raw.facilities || []).forEach((f) => addFacility(key, f));
  addPrograms(key, raw.programs || []);
});

// 2) 처음 모은 자료 중 자동 수집기가 없는 기관
const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.json') && !f.endsWith('.lookup.json') && f !== 'seoul-api.json');
files.forEach((file) => {
  const raw = readJSON(path.join(RAW, file));
  if (Array.isArray(raw.orgs)) {
    // 여러 기관을 담은 파일 (육아·가족·청소년)
    raw.orgs.forEach((o) => {
      const type = { childcare: 'childcare', family: 'family', youth: 'youth' }[o.type];
      if (!type || autoKeys.has(o.key)) return;
      // 수집 메모(영문)를 화면용 한국어 안내로 바꾼다
      const st = String(o.status || '');
      const note = /login/i.test(st) ? '프로그램 상세·예약은 회원 로그인 후 볼 수 있어요'
        : /no current/i.test(st) ? '수집 시점에 아이 대상 프로그램이 없었어요'
        : null;
      orgs.push({ key: o.key, name: o.name, type, url: str(o.url), listUrl: str(o.listUrl), note, method: 'manual', statusKey: null, collectedAt: raw.collectedAt });
    });
    (raw.facilities || []).forEach((f) => !autoKeys.has(f.org) && addFacility(f.org, f));
    const groups = {};
    (raw.programs || []).forEach((p) => { if (!autoKeys.has(p.org) && orgs.some((o) => o.key === p.org)) (groups[p.org] = groups[p.org] || []).push(p); });
    Object.entries(groups).forEach(([org, list]) => addPrograms(org, list));
    return;
  }
  const type = SOURCE_TYPE[raw.source];
  if (!type || autoKeys.has(raw.source)) return;
  orgs.push({
    key: raw.source, name: SOURCE_NAME[raw.source] || raw.sourceName, type,
    url: str(raw.sourceUrl), listUrl: str(raw.listUrl), note: null,
    method: raw.source === 'yeyak' ? 'public' : 'manual', statusKey: null, collectedAt: raw.collectedAt
  });
  (raw.facilities || []).forEach((f) => addFacility(raw.source, f));
  addPrograms(raw.source, raw.programs || []);
});

// 기관 순서: 탭 순서 → 프로그램 많은 순
const count = (key) => programs.filter((p) => p.org === key).length;
const typeOrder = (t) => TYPES.findIndex((x) => x.key === t);
orgs.sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || count(b.key) - count(a.key));

// 처음 본 날 (NEW 표시)
const state = loadState() || {};
stampFirstSeen(state, programs, (p) => `11100/${p.org}`, TODAY, orgs.map((o) => `11100/${o.key}`));
saveState(state);

const usedTypes = new Set(orgs.filter((o) => count(o.key)).map((o) => o.type));
const data = {
  region: '도봉구',
  collectedAt: orgs.map((o) => o.collectedAt).filter(Boolean).sort().pop() || null,
  types: TYPES.filter((t) => usedTypes.has(t.key)),
  orgs,
  facilities,
  programs
};

fs.writeFileSync(OUT, `/* 자동 생성: scripts/build-data.js — 직접 고치지 말고 data/raw/의 수집 결과를 고친 뒤 다시 실행하세요 */\nwindow.KIDS_DATA = ${JSON.stringify(data, null, 1)};\n`);

const byOrg = {};
programs.forEach((p) => { byOrg[p.org] = (byOrg[p.org] || 0) + 1; });
console.log(`programs ${programs.length} | orgs ${orgs.length} | facilities ${facilities.length} | collectedAt ${data.collectedAt} | 끝나서 뺀 것 ${ended}`);
console.log('by org', byOrg);
console.log('auto', [...autoKeys].join(', ') || '(없음)');
console.log('area unknown', programs.filter((p) => !p.area).length, '| no applyEnd', programs.filter((p) => !p.applyEnd).length, '| no programStart', programs.filter((p) => !p.programStart).length);
if (skipped.length) console.log('skipped:\n  ' + skipped.join('\n  '));
