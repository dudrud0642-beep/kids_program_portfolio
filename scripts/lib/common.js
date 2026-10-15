// 수집·만들기 스크립트가 함께 쓰는 도구
//  - 한국 시간 날짜, 바뀌지 않는 프로그램 아이디, 처음 본 날(NEW 표시) 기록
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, 'data', 'state', 'first-seen.json');

// 한국 시간 기준 오늘 (YYYY-MM-DD)과 지금 (YYYY-MM-DDTHH:MM+09:00)
const kstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16) + '+09:00';
const kstToday = () => kstNow().slice(0, 10);

// 짧은 해시 (FNV-1a 32비트 → 36진수) — 같은 글자면 늘 같은 값
function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// 프로그램 아이디: 원문 상세 주소(없거나 여러 프로그램이 같은 주소를 쓰면 제목·장소·시작일까지)로 만든다
// 수집할 때마다 순서가 바뀌어도 같은 프로그램은 같은 아이디 → 저장·공유 링크·NEW가 유지된다
function assignIds(programs, prefix) {
  const urlCount = {};
  programs.forEach((p) => { if (p.url) urlCount[p.url] = (urlCount[p.url] || 0) + 1; });
  const used = new Set();
  programs.forEach((p) => {
    const basis = p.url && urlCount[p.url] === 1 ? p.url : [p.url, p.title, p.facility, p.programStart].join('|');
    let id = `${prefix}-${hash(basis)}`;
    for (let n = 2; used.has(id); n++) id = `${prefix}-${hash(basis)}-${n}`;
    used.add(id);
    p.id = id;
  });
}

// 끝난 프로그램은 빼고 넘긴다 (끝나는 날이 없으면 시작일로, 날짜가 아예 없으면 남긴다)
const notEnded = (p, today) => (p.programEnd ? p.programEnd >= today : p.programStart ? p.programStart >= today : true);

/* ---------- 처음 본 날 (NEW 표시) ----------
 * data/state/first-seen.json
 *   sources: 출처마다 처음 모은 날 — 새로 추가한 출처의 프로그램은 처음엔 NEW를 붙이지 않는다
 *   seen: 아이디 → [처음 본 날, 마지막으로 본 날] ("base" = 자동 갱신 전부터 있던 것, NEW 없음)
 */
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return null; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  // 90일 넘게 안 보인 아이디는 지운다 (잠깐 수집이 실패했다 돌아온 것은 NEW로 다시 뜨지 않게 넉넉히)
  const cut = new Date(Date.parse(state.updated) - 90 * 864e5).toISOString().slice(0, 10);
  Object.keys(state.seen).forEach((id) => { if (state.seen[id][1] < cut) delete state.seen[id]; });
  const seen = Object.fromEntries(Object.keys(state.seen).sort().map((k) => [k, state.seen[k]]));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, seen }, null, 0).replace(/\],"/g, '],\n"') + '\n');
}
// programs의 각 프로그램에 firstSeen(YYYY-MM-DD 또는 null)을 붙인다. sourceOf(p) = 출처 키
// knownSources: 이번에 프로그램이 0건이어도 출처로 등록해 둘 키 (다음에 올라오는 것부터 NEW)
function stampFirstSeen(state, programs, sourceOf, today, knownSources = []) {
  const fresh = !state.seen;
  state.seen = state.seen || {};
  state.sources = state.sources || {};
  state.updated = today;
  const newSources = new Set();
  [...programs.map(sourceOf), ...knownSources].forEach((src) => {
    if (fresh || !state.sources[src]) newSources.add(src);
  });
  newSources.forEach((s) => { state.sources[s] = state.sources[s] || today; });
  programs.forEach((p) => {
    const rec = state.seen[p.id];
    if (rec) rec[1] = today;
    else state.seen[p.id] = [newSources.has(sourceOf(p)) ? 'base' : today, today];
    const first = state.seen[p.id][0];
    p.firstSeen = first === 'base' ? null : first;
  });
}

/* ---------- 기관 수집 결과(data/raw/…json) 한 건을 화면용으로 ---------- */
const AGE_TAGS = ['infant', 'preschool', 'elem-low', 'elem-high', 'family', 'parent'];
// 대상 문구에 아이·가족 대상이라는 말이 없고 나이 분류도 없으면 뺀다 (예: "방문객 누구나")
const KID_WORDS = /어린이|아동|유아|영아|초등|가족|패밀리|아이|자녀|개월|미취학|부모|보호자|공동육아|나눔터|\d+\s*세/;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const norm = (s) => (s || '').replace(/\s+/g, '');
// 원문 값은 바꾸지 않고 형식(날짜·숫자)만 확인한다. 아이 대상이 아니면 null
function normalizeProgram(p) {
  const title = str(p.title);
  if (!title) return null;
  const ageTags = Array.isArray(p.ageTags) ? p.ageTags.filter((t) => AGE_TAGS.includes(t)) : [];
  if (!ageTags.length && !KID_WORDS.test(`${p.target || ''} ${title}`)) return null;
  return {
    title,
    facility: str(p.facility),
    category: str(p.category),
    target: str(p.target),
    ageTags,
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
    image: str(p.image),
    description: str(p.description)
  };
}

// 생성 파일(window.X = {...};)에서 데이터만 읽기
function readDataFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.slice(text.indexOf(' = {') + 3).trim().replace(/;\s*$/, ''));
}

module.exports = { ROOT, kstNow, kstToday, hash, assignIds, notEnded, loadState, saveState, stampFirstSeen,
  AGE_TAGS, isDate, num, str, norm, normalizeProgram, readDataFile };
