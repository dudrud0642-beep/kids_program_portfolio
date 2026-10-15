// 사용법: node scripts/collectors/nowon-childcare.js [--out <파일>] [--today YYYY-MM-DD] [--verbose]
//   --verbose: 뺀 일정마다 번호·제목·이유를 stderr로 보여 준다
//   기본 저장 위치: data/raw/11110/childcare.json
// 노원구육아종합지원센터(www.nwscc.or.kr) "교육 및 행사 신청" 달력에서 영유아 가정·부모 대상 프로그램을 모은다.
//  - 이 달과 다음 달 목록(GET, EUC-KR, 서버가 그린 HTML, 한 쪽 20건)을 읽고,
//    고른 행만 상세(schedule_proc.php — 로그인 없이 보이는 "일정보기" 내용)를 1초 넘게 쉬며 하나씩 읽는다
//  - 신청(온라인 신청하기)·도담도담나눔터 예약은 회원 로그인이 필요해 하지 않는다
//  - 대상·연령은 대부분 상세 글 속 포스터 그림에만 있어 null로 둔다 (그림 글자는 읽지 않는다)
//  - 교사교육·평가제·도담도담나눔터 이용 예약·어린이집(기관) 신청 행사·장난감병원·포토존 같은 서비스는 뺀다
//  - 접속이 안 되거나 화면 구조가 바뀌었으면 파일을 쓰지 않고 exit 1
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = 'nowon-childcare';
const CENTER = '노원구육아종합지원센터';
const HOME = 'https://www.nwscc.or.kr'; // 지금은 https://www.nwscc.or.kr:46627/new/main/ 으로 넘겨 준다
const UA = 'MoaNolja/1.0 (+https://dudrud0642-beep.github.io/kids_program_portfolio/)';
const TIMEOUT = 20000;
const DELAY = 1100; // 요청 사이 최소 1초
const MAX_REQUESTS = 80;
const MAX_PAGES = 10; // 한 달 목록 쪽 수 상한 (지금 2~3쪽)
const WINDOW_DAYS = 60; // 오늘부터 60일 안에 시작하는 것만
const PAGE_SIZE = 20;

/* ---------- 인자 ---------- */
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const OUT = path.resolve(arg('out') || path.join(ROOT, 'data', 'raw', '11110', 'childcare.json'));
const TODAY = arg('today') || kstToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) { console.error(`[${SOURCE}] --today 형식이 틀려요: ${TODAY}`); process.exit(1); }
const fail = (msg) => { console.error(`[${SOURCE}] 실패: ${msg}`); process.exit(1); };
const warn = (msg) => console.error(`[${SOURCE}] 참고: ${msg}`);
const VERBOSE = process.argv.includes('--verbose');

/* ---------- 날짜 ---------- */
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
// "2026-10-15", "2026.9.29" 같은 날짜를 모두 YYYY-MM-DD로
const allDates = (s) => [...String(s || '').matchAll(/(\d{4})[.-]\s*(\d{1,2})[.-]\s*(\d{1,2})/g)]
  .map((m) => `${m[1]}-${pad(m[2])}-${pad(m[3])}`)
  .filter((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d);
const HORIZON = addDays(TODAY, WINDOW_DAYS);

/* ---------- 글자 정리 ---------- */
const ENTITY = { nbsp: ' ', lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", middot: '·', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', rarr: '→', sim: '∼' };
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m);
// 진짜 태그(영문 이름)만 지운다 — 제목 속 "<오싹오싹>" 같은 한글 꺾쇠는 남긴다
const stripTags = (s) => String(s || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
const clean = (s) => decode(stripTags(s)).replace(/﻿/g, '').replace(/\s+/g, ' ').trim();
// 줄바꿈을 살려서 정리 (상세 글)
const cleanLines = (s) => decode(stripTags(String(s || '').replace(/<br\s*\/?>|<\/(?:p|div|li|h\d)>/gi, '\n')))
  .replace(/﻿/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
// 자바스크립트 문자열 안의 \' \" \\ \n 풀기
const unescapeJs = (s) => String(s || '').replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? ' ' : c === 'r' ? '' : c));
const toInt = (s) => { const m = /(\d[\d,]*)/.exec(String(s || '')); return m ? parseInt(m[1].replace(/,/g, ''), 10) : null; };

/* ---------- 요청 (순서대로, 1초 넘게 쉬며, 1번 다시 시도) ---------- */
let requests = 0;
let lastAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, { redirect = 'follow', okStatus = (s) => s >= 200 && s < 300 } = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (requests >= MAX_REQUESTS) throw new Error(`요청 상한 ${MAX_REQUESTS}회를 넘으려 해요`);
    const wait = lastAt + DELAY - Date.now();
    if (wait > 0) await sleep(wait);
    requests++;
    lastAt = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect, signal: AbortSignal.timeout(TIMEOUT) });
      const buf = Buffer.from(await res.arrayBuffer());
      lastAt = Date.now();
      if (okStatus(res.status)) return { status: res.status, headers: res.headers, buf };
      if (res.status < 500 || attempt === 2) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
    } catch (e) {
      lastAt = Date.now();
      if (e.final || attempt === 2) throw new Error(`${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''} — ${url}`);
    }
    await sleep(2000);
  }
  throw new Error(`요청 실패 ${url}`);
}
const eucKr = (buf) => new TextDecoder('euc-kr').decode(buf);

/* ---------- robots.txt ---------- */
// User-agent: * 또는 MoaNolja 묶음의 Disallow만 본다 (Allow가 더 길면 허용)
function robotsAllows(txt, pathname) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.includes('moanolja')));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (pathname.startsWith(r.path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
async function checkRobots(origin, paths) {
  const r = await get(`${origin}/robots.txt`, { okStatus: (s) => (s >= 200 && s < 300) || s === 404 });
  if (r.status === 404) return;
  const txt = r.buf.toString('utf8');
  const blocked = paths.filter((p) => !robotsAllows(txt, p));
  if (blocked.length) fail(`${origin}/robots.txt가 ${blocked.join(', ')} 수집을 막고 있어요`);
}

/* ---------- 기관·지점 (주소는 사이트 "오시는 길" 페이지 글 그대로, 2026-10-15 확인) ---------- */
const PLACES = {
  [CENTER]: { address: '서울시 노원구 덕릉로 859 공공복합청사 4층', page: 'location.html' },
  '놀이아띠 상계점': { address: '서울시 노원구 덕릉로 859 공공복합청사 4층', page: 'location2.html' },
  '놀이아띠 상계2호점': { address: '서울시 노원구 노원로34길 43 노원중앙도서관 지하1층', page: 'location2_2.html' },
  '놀이아띠 공릉점': { address: '서울시 노원구 공릉로 166-1 공릉보건지소 4층', page: 'location2_3.html' },
  '놀이아띠 월계점': { address: '서울시 노원구 월계로 378 월계헬스케어센터 3층', page: 'location2_4.html' },
  '놀이아띠': { address: null, page: 'location2.html' },
  '도담도담나눔터 상계8동': { address: '서울 노원구 동일로 227길 49', page: 'location3.html' },
  '도담도담나눔터 공릉2동': { address: '서울 노원구 화랑로51길 78 503동 101호 (공릉동, 비선아파트)', page: 'location3_2.html' },
  '도담도담나눔터 월계3동': { address: '서울 노원구 마들로31 그랑빌아파트 119동 101호', page: 'location3_3.html' },
  '도담도담나눔터 중계본동': { address: '서울 노원구 중계로14바길 43 할렐루야교회 내 1층', page: 'location3_4.html' },
  '도담도담나눔터 상계1동': { address: '서울 노원구 동일로 1697 상계1동 주민센터 내 3층', page: 'location3_5.html' },
  '도담도담나눔터 상계6,7동': { address: '서울 노원구 덕릉로 70길 100 노원아이돌봄센터 1층', page: 'location3_6.html' },
  '도담도담나눔터 하계2동': { address: '서울 노원구 섬밭로229(하계동 271-3) 벽산아파트 9동 110호', page: 'location3_7.html' },
  '도담도담나눔터 상계9동': { address: '서울 노원구 한글비석로480 204동 103호(보람A)', page: 'location3_8.html' },
  '도담도담나눔터': { address: null, page: 'location3.html' }
};
const NANUM = ['상계6,7동', '상계8동', '상계9동', '상계1동', '공릉2동', '월계3동', '중계본동', '하계1동', '하계2동'];
const ATTI = ['상계2호점', '상계점', '공릉점', '월계점', '정보도서관점'];
// 제목 머리말([도담도담나눔터]·[놀이아띠])로 지점을 정한다. 없으면 센터 (실제 교육실은 사이트에 적혀 있지 않다)
function facilityOf(title) {
  const t = title.replace(/\s+/g, '');
  if (t.startsWith('[도담도담나눔터]')) { const d = NANUM.find((n) => t.includes(n)); return d ? `도담도담나눔터 ${d}` : '도담도담나눔터'; }
  if (t.startsWith('[놀이아띠]')) { const b = ATTI.find((n) => t.includes(n)); return b ? `놀이아띠 ${b}` : '놀이아띠'; }
  return CENTER;
}

/* ---------- 고르기 ---------- */
// 구분(목록 둘째 칸)별: 아이·가족과 상관없는 것은 통째로 뺀다
const SKIP_KINDS = {
  교사교육: '보육교직원 대상',
  평가제: '어린이집 평가제(기관 대상)',
  도담도담나눔터: '공동육아방 이용 예약(기관 이용 시간대)'
};
const KEEP_KINDS = ['부모교육', '양육지원', '체험행사'];
// 제목·상세 글에 적힌 말로 빼는 것
const SKIP_TITLE = [
  [/\(기관\)/, '기관(어린이집) 이용'],
  [/장난감\s*병원|장난감\s*대여|토이\s*붕붕/, '장난감 수리·대여 서비스'],
  [/포토존/, '백일·돌상 포토존 이용(서비스)'],
  [/키즈\s*카페/, '놀이 공간 이용']
];
const SKIP_TEXT = /기관\s*아이디|신청\s*기관|기관에\s*우선|확정된\s*어린이집|어린이집\s*대상|보육\s*교직원|보육교사|교사\s*대상/;
// 체험행사는 어린이집 단체 위주라, 개인·가족 신청이라는 말이 있을 때만 남긴다
const FAMILY_WORDS = /\(개인\)|가족|부모|자녀|양육자|아이와|엄마|아빠/;

// 연령 분류는 적힌 말에서만: 대상 문구와 제목의 [영아]·[유아] 같은 머리말
function ageTagsOf({ kind, title, target }) {
  const tags = new Set();
  // 제목 머리말은 [영아]·[유아]·[3~5세]·(18개월 이상)처럼 나이만 적힌 것만 본다 ([영유아발달지원] 같은 사업 이름은 제외)
  const head = (title.match(/[[(][^\])]{1,15}[\])]/g) || []).map((s) => s.slice(1, -1).trim())
    .filter((s) => /^(?:영아|유아|영유아)(?:\s*대상)?$|\d+\s*(?:~\s*\d+\s*)?(?:세|개월)/.test(s)).join(' ');
  const t = `${target || ''} ${head}`;
  const family = /부모\s*[-·]?\s*자녀|가족|(?:아이|자녀|양육자)\s*와\s*함께/.test(`${title} ${target || ''}`);
  if (family) tags.add('family');
  if (kind === '부모교육' || /부모\s*교육/.test(title)) tags.add('parent');
  // 부모만 듣는 교육은 아이 연령 분류를 달지 않는다
  if (family || !tags.has('parent')) {
    if (/영유아|영아/.test(t)) tags.add('infant');
    if (/영유아|(?<!영)유아|미취학|[3-7]\s*세/.test(t)) tags.add('preschool');
    for (const m of t.matchAll(/(\d+)\s*개월/g)) tags.add(+m[1] >= 36 ? 'preschool' : 'infant');
  }
  return ['infant', 'preschool', 'elem-low', 'elem-high', 'family', 'parent'].filter((x) => tags.has(x));
}

/* ---------- 목록 쪽 읽기 ---------- */
function parseListPage(html, y, m) {
  const head = /<div class="__scheHead">\s*<strong>\s*(\d{4})년\s*(\d{1,2})월\s*<\/strong>/.exec(html);
  if (!head) throw new Error('달력 머리(__scheHead)를 못 찾았어요');
  if (+head[1] !== y || +head[2] !== m) throw new Error(`요청한 달(${y}-${m})과 다른 달(${head[1]}-${head[2]})이 왔어요`);

  const ca = html.indexOf('<table class="__scheTbl">');
  if (ca < 0) throw new Error('달력 표(__scheTbl)를 못 찾았어요');
  const cal = html.slice(ca, html.indexOf('</table>', ca));
  const calIds = new Set([...cal.matchAll(/modeChange\('(\d+)'/g)].map((x) => x[1]));

  const la = html.indexOf('<table class="__tblList respond2">');
  if (la < 0) throw new Error('일정 목록 표(__tblList)를 못 찾았어요');
  const lb = html.indexOf('</table>', la);
  const tb = html.indexOf('<tbody>', la);
  if (tb < 0 || tb > lb) throw new Error('일정 목록 tbody를 못 찾았어요');
  const body = html.slice(tb, lb);
  const head4 = html.slice(la, tb);
  if (!/일정[\s\S]*구분[\s\S]*제목[\s\S]*신청\/정원\/대기/.test(head4)) throw new Error('일정 목록 머리 칸(일정·구분·제목·신청/정원/대기)이 바뀌었어요');

  const rows = [];
  let bad = 0;
  let empty = false;
  for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (tds.length === 1 && /colspan/.test(tr[1]) && /없습니다/.test(tds[0])) { empty = true; continue; }
    const link = tds.length === 4 && /<a href="javascript:modeChange\('(\d+)','[^']*'\)">([\s\S]*?)<\/a>/.exec(tds[2]);
    if (!link) { bad++; continue; }
    const when = clean(tds[0]);
    const nums = /^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/.exec(clean(tds[3]));
    rows.push({
      idx: link[1],
      y, m,
      when,
      date: allDates(when)[0] || null,
      time: when.replace(/^\s*\d{4}-\d{1,2}-\d{1,2}\s*(\([^)]*\))?\s*/, '').trim() || null,
      kind: clean(tds[1]),
      title: clean(link[2]),
      applied: nums ? +nums[1] : null,
      capacity: nums ? +nums[2] : null
    });
  }
  const pages = [...html.slice(lb, lb + 3000).matchAll(/goPage3\((\d+)\)|<strong class='num active'>(\d+)<\/strong>/g)].map((x) => +(x[1] || x[2]));
  return { rows, bad, empty, calIds, maxPage: pages.length ? Math.max(...pages) : 1 };
}

async function readMonth(base, y, m) {
  const all = [];
  let calIds = null;
  let maxPage = 1;
  for (let p = 1; p <= Math.min(maxPage, MAX_PAGES); p++) {
    const url = `${base}/new/study/care.php?pno=050700&yy=${y}&mm=${m}${p > 1 ? `&page3=${p}` : ''}`;
    const r = parseListPage(eucKr((await get(url)).buf), y, m);
    if (r.bad) throw new Error(`${y}-${m} ${p}쪽: 모양이 다른 목록 행 ${r.bad}개`);
    if (p === 1) calIds = r.calIds;
    maxPage = Math.max(maxPage, r.maxPage);
    all.push(...r.rows);
    if (r.empty || r.rows.length < PAGE_SIZE) break;
  }
  // 달력에 있는 일정이 목록에 다 나왔는지 맞춰 본다 (목록 읽기가 어긋났는지 확인)
  const listIds = new Set(all.map((r) => r.idx));
  const missing = [...calIds].filter((id) => !listIds.has(id));
  if (missing.length) throw new Error(`${y}-${m} 달력 ${calIds.size}건 중 ${missing.length}건이 목록에 없어요 (${missing.slice(0, 5).join(', ')})`);
  if (calIds.size && !all.length) throw new Error(`${y}-${m} 달력에는 ${calIds.size}건이 있는데 목록 행을 하나도 못 읽었어요`);
  return { rows: all, calendar: calIds.size };
}

/* ---------- 상세 (일정보기) ---------- */
// schedule_proc.php는 부모 창의 칸(info0~info6)을 채우는 스크립트를 돌려준다. 주석 처리된 줄은 건너뛴다
function parseDetail(html) {
  const v = {};
  let hidePeriod = false;
  for (const line of html.split(/\r?\n/)) {
    if (/^\s*\/\//.test(line)) continue;
    const m = /getElementById\('(\w+)'\)\.innerHTML\s*=\s*"((?:[^"\\]|\\.)*)";/.exec(line);
    if (m) v[m[1]] = unescapeJs(m[2]);
    if (/getElementById\('info3_2'\)\.style\.display\s*=\s*"none"/.test(line)) hidePeriod = true;
  }
  if (v.info3 === undefined || v.info1 === undefined) return null;
  if (hidePeriod) delete v.info3_2_1;
  return v;
}

/* ---------- 실행 ---------- */
(async () => {
  const started = Date.now();
  const [ty, tm] = TODAY.split('-').map(Number);
  const months = [[ty, tm], tm === 12 ? [ty + 1, 1] : [ty, tm + 1]];

  // 1) robots.txt 확인 + 실제 주소(포트 46627로 넘겨 줌) 알아내기
  await checkRobots(HOME, ['/']);
  const home = await get(`${HOME}/`, { redirect: 'manual', okStatus: (s) => (s >= 200 && s < 400) });
  const loc = home.status >= 300 ? home.headers.get('location') : null;
  const base = loc ? new URL(loc, `${HOME}/`).origin : HOME;
  if (!/^https?:\/\/(www\.)?nwscc\.or\.kr(:\d+)?$/.test(base)) fail(`처음 주소가 다른 곳(${base})으로 넘어가요`);
  if (base !== HOME) await checkRobots(base, ['/new/study/care.php', '/new/study/schedule_proc.php']);

  // 2) 이 달·다음 달 목록
  const rows = [];
  const monthInfo = [];
  for (const [y, m] of months) {
    const r = await readMonth(base, y, m);
    rows.push(...r.rows);
    monthInfo.push(`${m}월 ${r.rows.length}건`);
  }
  const undated = rows.filter((r) => !r.date).length;
  if (rows.length && undated > rows.length * 0.2) fail(`목록 날짜를 ${undated}/${rows.length}건 못 읽었어요`);

  // 3) 구분·제목으로 먼저 거르고, 남은 것만 상세를 읽는다
  const skipped = {};
  const skip = (why, r) => {
    skipped[why] = (skipped[why] || 0) + 1;
    if (VERBOSE && r) console.error(`  뺌 ${r.idx} ${r.date || '?'} [${r.kind}] ${r.title} — ${why}`);
  };
  const unknownKinds = new Set();
  const cand = [];
  const seenIdx = new Set();
  for (const r of rows) {
    // 두 달에 걸친 일정이 두 달 목록에 모두 나올 수 있어 번호로 한 번만
    if (seenIdx.has(r.idx)) continue;
    seenIdx.add(r.idx);
    if (!r.date) { skip('날짜 없음', r); continue; }
    if (r.date > HORIZON) { skip(`${WINDOW_DAYS}일 뒤 시작`, r); continue; }
    if (SKIP_KINDS[r.kind]) { skip(SKIP_KINDS[r.kind], r); continue; }
    if (!KEEP_KINDS.includes(r.kind)) { unknownKinds.add(r.kind); skip('모르는 구분', r); continue; }
    const t = SKIP_TITLE.find(([re]) => re.test(r.title));
    if (t) { skip(t[1], r); continue; }
    cand.push(r);
  }
  if (unknownKinds.size) warn(`처음 보는 구분이라 뺐어요: ${[...unknownKinds].join(', ')}`);
  // 오늘 이후 일정부터 읽고, 오늘 전 일정(여러 날 이어지는 행사인지 확인용)은 나중에
  const plan = [
    ...cand.filter((r) => r.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date)),
    ...cand.filter((r) => r.date < TODAY).sort((a, b) => b.date.localeCompare(a.date))
  ];

  const programs = [];
  let detailFail = 0;
  let dateFallback = 0;
  let notRead = 0;
  for (const r of plan) {
    if (requests >= MAX_REQUESTS - 1) { notRead++; continue; }
    const html = eucKr((await get(`${base}/new/study/schedule_proc.php?pno=050700&idx=${r.idx}`)).buf);
    const d = parseDetail(html);
    if (!d) { detailFail++; continue; }

    const desc = cleanLines(d.info4 || '');
    const text = `${r.title} ${desc.join(' ')}`;
    if (SKIP_TEXT.test(text)) { skip('기관·교사 대상(상세 글)', r); continue; }
    if (r.kind === '체험행사' && !FAMILY_WORDS.test(text)) { skip('체험행사 중 개인·가족 신청이라는 말이 없음', r); continue; }

    const range = allDates(clean(d.info1));
    if (!range.length) dateFallback++;
    const programStart = range[0] || r.date;
    const programEnd = range[range.length - 1] || r.date;
    if (programEnd < TODAY) { skip('끝난 일정', r); continue; }
    if (programStart > HORIZON) { skip(`${WINDOW_DAYS}일 뒤 시작`, r); continue; }

    // 여러 날짜면 일정 글 그대로, 하루면 시간만
    const info1 = clean(d.info1).replace(/\s*\/\s*$/, '');
    const schedule = programStart !== programEnd ? info1 : r.time;
    const period = allDates(d.info3_2_1 || '');
    const feeText = clean(d.info3_fee) || null;
    const capacity = toInt(d.info3_max) ?? r.capacity;
    const applied = toInt(d.info5) ?? r.applied;
    const targetLine = desc.map((l) => /(?:^|\s)(?:교육|참여|신청)?\s*대상\s*[:：]\s*(.+)$/.exec(l)).find(Boolean);
    const target = targetLine ? targetLine[1].trim().slice(0, 100) : null;
    const descText = desc.join(' ').trim();
    const title = r.title;
    programs.push({
      title,
      facility: facilityOf(title),
      category: clean(d.info0) || r.kind,
      target,
      ageTags: ageTagsOf({ kind: r.kind, title, target }),
      programStart,
      programEnd,
      schedule,
      sessions: null,
      applyStart: period[0] || null,
      applyEnd: period[1] || null,
      applyMethod: '온라인 신청하기 (회원만 신청할 수 있습니다)',
      capacity: capacity ? capacity : null,
      applied,
      fee: /무료/.test(feeText || '') ? 0 : (/(\d[\d,]*)\s*원/.test(feeText || '') ? toInt(feeText) : null),
      feeText,
      statusText: null,
      url: `${base}/new/study/care.php?main=Y&mainv=${r.idx}&mainx=ok&yy=${r.y}&mm=${r.m}`,
      description: descText ? (descText.length > 300 ? `${descText.slice(0, 299)}…` : descText) : null
    });
  }
  if (detailFail && detailFail * 2 >= cand.length - notRead) fail(`상세(일정보기) ${detailFail}/${cand.length - notRead}건의 모양이 달라요`);
  if (detailFail) warn(`상세를 못 읽은 일정 ${detailFail}건은 뺐어요`);
  if (notRead) warn(`요청 상한 때문에 상세를 못 읽은 후보 ${notRead}건`);
  if (dateFallback) warn(`상세 일정 날짜를 못 읽어 목록 날짜를 쓴 일정 ${dateFallback}건`);

  programs.sort((a, b) => a.programStart.localeCompare(b.programStart) || String(a.schedule).localeCompare(String(b.schedule)) || a.url.localeCompare(b.url));
  const used = [...new Set(programs.map((p) => p.facility))];
  const facilities = used.map((name) => ({ name, address: (PLACES[name] || {}).address || null, area: null, url: `${base}/new/center/${(PLACES[name] || PLACES[CENTER]).page}` }));

  const data = {
    source: SOURCE,
    sourceName: CENTER,
    sourceUrl: HOME,
    listUrl: `${base}/new/study/care.php`,
    collectedAt: TODAY,
    howToCollect: [
      `Official site ${HOME} redirects to ${base}/new/main/ (nginx/PHP, EUC-KR pages; on 2026-10-15 the target was port 46627). robots.txt on both origins = "User-agent: * / Allow: /" (checked every run).`,
      'All dated programs of the center and its branches (놀이아띠 toy libraries, 도담도담나눔터 공동육아방) are on one calendar, 교육 및 행사 신청: GET /new/study/care.php?pno=050700&yy=YYYY&mm=M[&page3=N] (plain GET, no cookies). Each page has a month grid (table.__scheTbl, idx in modeChange(\'idx\',...), no times) and a list table.__tblList (20 rows/page; columns 일정 "YYYY-MM-DD (요일) HH:MM~HH:MM" | 구분 | 제목 | 신청/정원/대기); pagination is page3=N (the page\'s goPage3() JS is missing, the GET param works). Empty month row: "등록된 교육 및 행사 일정이 없습니다.". We read the current and next month and check that every grid idx appears in the list.',
      'Detail ("일정보기") is filled by an iframe script: GET /new/study/schedule_proc.php?pno=050700&idx=N returns JS setting info0 구분, info1 일정 ("YYYY.M.D (요일) ~ YYYY.M.D (요일) / HH:MM~HH:MM"; 체험행사 uses "YYYY-MM-DD (요일) HH:MM~HH:MM"), info2 조회수 (our requests probably count as views), info3 제목, info3_max 교육정원 ("12명"), info3_fee 교육비 ("무료"), info3_2_1 신청기간 ("YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM"; applyStart/End keep only the dates as written, an end of "00:00" means the period closes at the start of that day), info4 body HTML (usually empty or a poster image; target/age/venue details are only in the images, not read), info5 신청인원. No login needed to view; applying ("온라인 신청하기") alerts "회원만 신청할 수 있습니다." and 도담도담나눔터 예약 (/new/raise/time4.php) redirects to login, so neither is used. Stable public link per program: /new/study/care.php?main=Y&mainv={idx}&mainx=ok&yy=YYYY&mm=M (opens the detail view; used as url/ID). Dates on the site carry the year, no inference needed. Each session is its own row/idx (weekly series are separate rows); rows dated before today are still opened once to catch multi-day ranges.',
      'statusText is null: the 마감/대기 button label set by the detail script targets an element (btnOk02) that does not exist on the page, so no status is shown to users; applied/capacity come from 신청인원/교육정원 (list 신청/정원/대기 as fallback; 정원 0 → null). target is null unless the body text has a "대상: ..." line; ageTags only from explicit words (구분 부모교육 → parent; 부모-자녀/가족 → family; [영아]/[유아] or target wording → infant/preschool; parent-only lectures get no child-age tags). facility = branch named in the title prefix ([도담도담나눔터] / [놀이아띠] + 지점) else the center; the actual room is not stated, so plain "도담도담나눔터" has no address. Addresses are copied from the 오시는 길 pages (/new/center/location*.html).',
      'Excluded: 구분 교사교육 (보육교직원) and 평가제 (어린이집); 구분 도담도담나눔터 = "(기관)" 공동육아방 time slots for daycare centers; [공통부모교육] 부모-자녀체험활동/찾아가는 공통부모교육 whose body says daycare centers apply with a 기관아이디 (capacity 1 = one daycare); 체험행사 unless the text says (개인)/가족/부모/자녀 (e.g. "[문화공연] 어린이 소방안전교육" was booked by 어린이집); services [놀이아띠]장난감병원 (toy repair slots) and [백.돌.이] 백일 돌상 포토존 (photo-zone rental slots); 장난감 대여/토이붕붕 and the toy catalogue (/new/raise/dab3.php). Scope: programEnd >= collectedAt and programStart within 60 days.'
    ].join(' '),
    facilities,
    programs
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  const why = Object.entries(skipped).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`[${SOURCE}] ${TODAY} 목록 ${monthInfo.join(' + ')} → 후보 ${cand.length} → 프로그램 ${programs.length}건 (요청 ${requests}회, ${sec}초) → ${path.relative(ROOT, OUT)}${why ? ` | 뺀 것: ${why}` : ''}`);
})().catch((e) => fail(e.message));
