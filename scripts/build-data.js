// 사용법: node scripts/build-data.js
// data/raw/*.json (기관별 수집 결과)을 합쳐 화면에서 쓰는 data/programs.js로 만든다.
// 원문 값은 바꾸지 않고, 형식(날짜·숫자)만 정리하고 중복만 걸러 낸다.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'programs.js');

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

// 수집은 됐지만 이 서비스 기준(도봉구에서 열리는 아이 프로그램)에 맞지 않아 뺀 것 — 이유를 남긴다
const EXCLUDE = [
  { org: 'yeyak', title: '우리 가족 마음 채움', reason: '1차 장소가 강북구(시립강북청소년센터)이고 청소년 가족 대상' }
];
const AREAS = ['쌍문동', '방학동', '창동', '도봉동'];
const AGE_TAGS = ['infant', 'preschool', 'elem-low', 'elem-high', 'family', 'parent'];

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const norm = (s) => (s || '').replace(/\s+/g, '');

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

function addFacility(org, f) {
  const name = str(f.name);
  if (!name || facilities.some((x) => x.org === org && x.name === name)) return;
  // 사이트 주소에 동이 없으면 주소정보누리집 조회 결과(scripts/lookup-areas.js)로 채운다
  const found = lookup.find((r) => r.address === f.address && r.area);
  const area = AREAS.includes(f.area) ? f.area : (found ? found.area : null);
  facilities.push({ org, name, address: str(f.address), area, url: str(f.url) });
}

// 대상 문구에 아이·가족 대상이라는 말이 없고 나이 분류도 없으면 뺀다 (예: "방문객 누구나")
const KID_WORDS = /어린이|아동|유아|영아|초등|가족|아이|자녀|개월|\d+\s*세/;

function addProgram(org, p) {
  const title = str(p.title);
  if (!title) return;
  if (!(Array.isArray(p.ageTags) && p.ageTags.length) && !KID_WORDS.test(p.target || '')) {
    skipped.push(`${org}: ${title} (${p.target})`);
    return;
  }
  const ex = EXCLUDE.find((e) => e.org === org && title.includes(e.title));
  if (ex) {
    skipped.push(`${org}: ${title} — ${ex.reason}`);
    return;
  }
  const key = [org, norm(title), norm(p.facility), p.programStart || ''].join('|');
  if (seen.has(key)) return;
  seen.add(key);
  const fac = facilities.find((f) => f.org === org && norm(f.name) === norm(p.facility));
  programs.push({
    id: `${org}-${programs.filter((x) => x.org === org).length + 1}`,
    org,
    title,
    facility: str(p.facility),
    area: fac ? fac.area : null,
    category: str(p.category),
    target: str(p.target),
    ageTags: Array.isArray(p.ageTags) ? p.ageTags.filter((t) => AGE_TAGS.includes(t)) : [],
    programStart: isDate(p.programStart) ? p.programStart : null,
    programEnd: isDate(p.programEnd) ? p.programEnd : null,
    schedule: str(p.schedule),
    sessions: num(p.sessions),
    applyStart: isDate(p.applyStart) ? p.applyStart : null,
    applyEnd: isDate(p.applyEnd) ? p.applyEnd : null,
    applyMethod: str(p.applyMethod),
    capacity: num(p.capacity),
    applied: num(p.applied),
    fee: num(p.fee),
    feeText: str(p.feeText),
    statusText: str(p.statusText),
    url: str(p.url),
    image: imageOf.get(p.url) || null,
    description: str(p.description)
  });
}

const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((f) => f.endsWith('.json') && !f.endsWith('.lookup.json')) : [];
let collectedAt = null;

files.forEach((file) => {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));
  if (isDate(raw.collectedAt) && (!collectedAt || raw.collectedAt > collectedAt)) collectedAt = raw.collectedAt;

  if (Array.isArray(raw.orgs)) {
    // 여러 기관을 담은 파일 (육아·가족·청소년)
    raw.orgs.forEach((o) => {
      const type = { childcare: 'childcare', family: 'family', youth: 'youth' }[o.type];
      if (!type) return;
      // 수집 메모(영문)를 화면용 한국어 안내로 바꾼다
      const st = String(o.status || '');
      const note = /login/i.test(st) ? '프로그램 상세·예약은 회원 로그인 후 볼 수 있어요'
        : /no current/i.test(st) ? '수집 시점에 아이 대상 프로그램이 없었어요'
        : null;
      orgs.push({ key: o.key, name: o.name, type, url: str(o.url), listUrl: str(o.listUrl), note, method: 'crawl' });
    });
    (raw.facilities || []).forEach((f) => addFacility(f.org, f));
    (raw.programs || []).forEach((p) => orgs.some((o) => o.key === p.org) && addProgram(p.org, p));
    return;
  }

  const type = SOURCE_TYPE[raw.source];
  if (!type) return;
  orgs.push({
    key: raw.source,
    name: SOURCE_NAME[raw.source] || raw.sourceName,
    type,
    url: str(raw.sourceUrl),
    listUrl: str(raw.listUrl),
    note: null,
    method: raw.source === 'yeyak' ? 'public' : 'crawl'
  });
  (raw.facilities || []).forEach((f) => addFacility(raw.source, f));
  (raw.programs || []).forEach((p) => addProgram(raw.source, p));
});

// 기관 순서: 탭 순서 → 프로그램 많은 순
const count = (key) => programs.filter((p) => p.org === key).length;
const typeOrder = (t) => TYPES.findIndex((x) => x.key === t);
orgs.sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || count(b.key) - count(a.key));

const usedTypes = new Set(orgs.filter((o) => count(o.key)).map((o) => o.type));
const data = {
  region: '도봉구',
  collectedAt,
  types: TYPES.filter((t) => usedTypes.has(t.key)),
  orgs,
  facilities,
  programs
};

fs.writeFileSync(OUT, `/* 자동 생성: scripts/build-data.js — 직접 고치지 말고 data/raw/*.json을 고친 뒤 다시 실행하세요 */\nwindow.KIDS_DATA = ${JSON.stringify(data, null, 1)};\n`);

const byOrg = {};
programs.forEach((p) => { byOrg[p.org] = (byOrg[p.org] || 0) + 1; });
console.log(`programs ${programs.length} | orgs ${orgs.length} | facilities ${facilities.length} | collectedAt ${collectedAt}`);
console.log('by org', byOrg);
console.log('area unknown', programs.filter((p) => !p.area).length, '| no applyEnd', programs.filter((p) => !p.applyEnd).length, '| no programStart', programs.filter((p) => !p.programStart).length);
if (skipped.length) console.log('skipped:\n  ' + skipped.join('\n  '));
