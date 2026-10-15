// 사용법: node scripts/collectors/familynet.js --center <서브도메인> --gu <구 이름> [--out <파일>] [--today YYYY-MM-DD]
//   예) node scripts/collectors/familynet.js --center nowon --gu 노원구   → data/raw/11110/family.json
// 가족센터 공통 플랫폼(<서브도메인>.familynet.or.kr)의 "프로그램신청" 목록에서 아이·가족 프로그램을 모은다.
//  - 목록(GET, 서버가 그린 HTML, 쿠키·로그인 없이)만 읽는다. 한 쪽에 5건 고정(rows 값은 무시됨)
//  - 상세 페이지는 내용이 비어 있고 자바스크립트가 POST /recruitReceipt/getView.do(CSRF 토큰+세션 필요)로 채운다
//    → 쓰지 않는다. 그래서 대상·정원·회차 일정·소개글은 null (목록에 없는 값은 지어내지 않는다)
//  - robots.txt를 먼저 읽어 쓰는 경로가 막혀 있으면 멈추고, Crawl-delay(지금 10초)만큼 쉬며 하나씩 요청한다
//  - 화면 구조가 바뀌었거나 접속이 안 되면 파일을 쓰지 않고 exit 1
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const UA = 'MoaNolja/1.0 (+https://dudrud0642-beep.github.io/kids_program_portfolio/)';
const TIMEOUT = 20000;
const MIN_DELAY = 1000; // robots.txt에 Crawl-delay가 없을 때도 최소 1초
const MAX_PAGES = 25; // 목록 쪽 수 상한 (Crawl-delay 10초면 요청 27회·4.5분). 넘으면 앞쪽(최근 등록)만 읽고 경고
// 목록은 최근 등록순이라 뒤쪽에 1년짜리 상시 프로그램이 몰려 있다 → 너무 줄이면 진행 중인 것을 놓친다
const WINDOW_DAYS = 90; // 오늘부터 90일 안에 시작하는 것만
const STATUS = 'plan,ongoing'; // 접수예정 + 접수중 (접수마감은 신청할 수 없고 지난 것이 수백 건 섞여 있어 뺀다)

/* ---------- 인자 ---------- */
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const fail = (msg) => { console.error(`[familynet] 실패: ${msg}`); process.exit(1); };

/* ---------- 글자 정리 ---------- */
const ENTITY = { nbsp: ' ', lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", middot: '·', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', rarr: '→', sim: '∼', ndash: '–', mdash: '—', bull: '•', laquo: '«', raquo: '»', copy: '©', times: '×' };
const decodeOnce = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m);
// 제목이 두 번 이스케이프된 채 저장된 경우(&amp;#039;)가 있어 남은 기호를 한 번 더 푼다
const decode = (s) => { const once = decodeOnce(s); return /&(?:#\d+|#x[0-9a-f]+|amp|quot|lt|gt|apos);/i.test(once) ? decodeOnce(once) : once; };
// 진짜 태그(<a …>, </p>, <br/> 등 영문 이름)만 지운다 — 제목 속 "<오싹오싹>" 같은 한글 꺾쇠는 남긴다
const stripTags = (s) => String(s || '').replace(/<\/?[a-zA-Z][^>]*>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim();
const ymd = (s) => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/* ---------- robots.txt ---------- */
// User-agent: * (또는 MoaNolja) 묶음의 Disallow·Allow·Crawl-delay
function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((cur = { agents: [], disallow: [], allow: [], delay: null }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'disallow' && val) cur.disallow.push(val);
    else if (key === 'allow' && val) cur.allow.push(val);
    else if (key === 'crawl-delay' && Number.isFinite(+val)) cur.delay = +val;
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && 'moanolja'.startsWith(a))) || groups.find((g) => g.agents.includes('*'));
  return mine || { agents: [], disallow: [], allow: [], delay: null };
}
// 가장 긴 규칙이 이긴다 (* 와 $ 지원)
function robotsAllows(rules, urlPath) {
  const match = (rule) => {
    const re = new RegExp('^' + rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$'));
    return re.test(urlPath) ? rule.length : -1;
  };
  const dis = Math.max(-1, ...rules.disallow.map(match));
  const al = Math.max(-1, ...rules.allow.map(match));
  return dis < 0 || al >= dis;
}

/* ---------- 요청 (차례로, 간격 두고, 한 번 다시 시도) ---------- */
let delay = MIN_DELAY;
let lastAt = 0;
let requests = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, { allow404 = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastAt + delay - Date.now();
    if (wait > 0) await sleep(wait);
    requests++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      const text = await res.text();
      lastAt = Date.now();
      if (allow404 && res.status === 404) return { status: 404, text: '' };
      if (res.status === 403 || res.status === 429) throw Object.assign(new Error(`${res.status} — 자동 접속이 막힌 듯`), { fatal: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, text, url: res.url };
    } catch (e) {
      lastAt = Date.now();
      if (e.fatal || attempt === 1) throw new Error(`${url}: ${e.message}`);
    }
  }
}

/* ---------- 첫 화면: 센터 이름·주소·목록 주소 ---------- */
function parseIndex(html) {
  const box = /<div class="direct clearfix">([\s\S]*?)<div class="icon">/.exec(html);
  const name = box && clean((/<h2>([\s\S]*?)<\/h2>/.exec(box[1]) || [])[1]);
  const address = box && clean((/<p class="loc">([\s\S]*?)<\/p>/.exec(box[1]) || [])[1]);
  const title = clean((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1]);
  const list = (/href="(\/center\/[^"?]*\/recruitReceipt\/list\.do)"/.exec(html) || [])[1] || null;
  return { name: name || title || null, address: address || null, listPath: list };
}

/* ---------- 목록 한 쪽 ---------- */
function parseList(html) {
  const hit = /<p class="hit">\s*전체\s*:\s*<span>\s*(\d+)\s*<\/span>\s*\(\s*<b>\s*(\d+)\s*<\/b>\s*\/\s*(\d+)\s*페이지\s*\)/.exec(html);
  if (!hit) throw new Error('목록 건수(p.hit)를 찾지 못함 — 화면 구조가 바뀐 듯');
  const gubun = /센터구분<\/label><\/div>\s*<div class="right">([\s\S]*?)<input/.exec(html);
  const start = html.indexOf('<div class="program_list apply_type1">');
  if (start < 0) throw new Error('목록 영역(div.program_list)을 찾지 못함');
  const stop = html.indexOf('<div class="paging">', start);
  const body = html.slice(start, stop > start ? stop : undefined);
  const items = body.split('<li class="clearfix">').slice(1).map(parseItem);
  return { total: +hit[1], page: +hit[2], pages: +hit[3], center: gubun ? clean(gubun[1]) : null, items };
}

// 목록 항목 하나 (li.clearfix)
function parseItem(li) {
  const field = (label) => { const m = new RegExp(`<b>${label}</b>([\\s\\S]*?)</p>`).exec(li); return m ? m[1] : null; };
  const tit = /<p class="tit">([\s\S]*?)<\/p>/.exec(li);
  const link = tit && /<a\b[^>]*onclick="send\('(\d+)'[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(tit[1]);
  const period = clean(field('행사기간'));
  const recv = clean(field('접수기간'));
  const [ps, pe] = period.split('~').map(ymd);
  const [as, ae] = recv.split('~').map(ymd);
  const round = clean(field('회차정보'));
  // 진행장소: 글자 그대로 + 오시는길 링크의 (주소, 상세) 두 값
  const placeRaw = /<b>진행장소<\/b>([\s\S]*?)(?:<a\b|<\/p>)/.exec(li);
  const placeText = placeRaw ? clean(placeRaw[1]) : null;
  const modal = /comeWay\.openModal\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/.exec(li);
  const state = /<div class="state">[\s\S]*?<span class="c\d">([\s\S]*?)<\/span>/.exec(li);
  const loc = /<div class="loc">([\s\S]*?)<\/div>/.exec(li);
  return {
    seq: link ? link[1] : null,
    title: link ? clean(link[2]) : null,
    sessions: /총\s*(\d+)\s*회/.test(round) ? +/총\s*(\d+)\s*회/.exec(round)[1] : null,
    roundText: round || null,
    periodText: period || null,
    programStart: ps || null,
    programEnd: pe || null,
    applyText: recv || null,
    applyStart: as || null,
    applyEnd: ae || null,
    placeText: placeText && placeText !== '-' ? placeText : null,
    place1: modal ? clean(modal[2]) || null : null,
    place2: modal ? clean(modal[3]) || null : null,
    statusText: state ? clean(state[1]) || null : null,
    loc: loc ? clean(loc[1]) : null
  };
}

/* ---------- 분야·대상 범위 (목록에 대상 칸이 없어 제목 글자로만 판단) ---------- */
// 제목 앞의 사업 영역 표시: "[관계]…", "[공동체] …", "가족관계_…", "지역공동체_…" (가족센터 공통 영역 이름일 때만)
const AREA = /^(?:가족)?(?:관계|돌봄|생활|상담)$|^(?:지역)?공동체$|^공동육아나눔터$|^돌봄품앗이$/;
function splitCategory(title) {
  const b = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(title);
  if (b && AREA.test(b[1].trim())) return { category: b[1].trim(), rest: b[2] };
  const u = /^\s*([가-힣]+)_\s*(.*)$/.exec(title);
  if (u && AREA.test(u[1])) return { category: u[1], rest: u[2] };
  return { category: null, rest: title };
}
// 아이가 직접 드러나는 말 / 가족·양육 말 / 어른·청소년만 대상인 표시
const CHILD = /자녀|아동|어린이|유아|영아|아이(?!디어|템|콘|돌|스)|초등|미취학|저학년|고학년|\d\s*(?:-\s*\d\s*)?학년|\d+\s*세|\d+\s*개월|키즈|공동육아나눔터|품앗이/;
const FAMILY = /가족|패밀리|부모|양육|육아/;
const ADULT = /1인가구|사회통합프로그램|취업|구직|직업탐색|중장년|어르신|노인|시니어|청소년|한국어\s*(?:교육|사전교육)|토픽|자조모임|봉사단|동아리|결혼이민자|부부/;
function scopeOf(title) {
  const { category, rest } = splitCategory(title);
  if (CHILD.test(rest)) return { category, keep: true };
  if (FAMILY.test(rest) && !ADULT.test(rest)) return { category, keep: true };
  return { category, keep: false, why: ADULT.test(rest) ? 'adult/teen' : 'no child/family word' };
}

/* ---------- 장소 ---------- */
const norm = (s) => String(s || '').replace(/\s+/g, '');
// 도로명 + 건물번호 ("동일로173가길 94", "도봉로 552")
const roadOf = (s) => { const m = /([가-힣A-Za-z0-9.]+(?:로|길))\s*(\d+(?:-\d+)?)/.exec(s || ''); return m ? m[1] + m[2] : null; };
const ROOM_ONLY = /^(?:[가-힣A-Za-z0-9]+동\s+)?(?:지하\s*)?(?:\d+\s*층)?\s*,?\s*(?:강당|대강당|소강당|교육장|교육실|강의실|프로그램실|회의실|세미나실|다목적실|상담실)?\s*[\d,\s]*$/;
// 진행장소 → { name, address }. 센터 자체(센터 이름이 적혀 있거나 센터와 같은 도로명 주소)면 센터 이름
function venueOf(item, center) {
  const full = item.placeText;
  if (!full) return { name: center.name, address: center.address };
  const detail = item.place2 || (item.place1 ? '' : full);
  const nanum = /공동육아나눔터\s*[가-힣A-Za-z0-9]+점/.exec(detail);
  if (nanum) return { name: nanum[0].replace(/\s+/g, ' ').replace(/^공동육아나눔터(?=\S)/, '공동육아나눔터 '), address: full };
  if (/온라인|zoom|비대면/i.test(detail)) return { name: detail, address: null };
  if (norm(detail).includes(norm(center.name)) || (roadOf(item.place1) && roadOf(item.place1) === roadOf(center.address))) return { name: center.name, address: center.address };
  // 다른 곳: 앞의 층 표시를 뗀 상세 이름. 상세가 없거나 방 이름뿐이면 진행장소 글 그대로
  if (!detail || ROOM_ONLY.test(detail)) return { name: full, address: full };
  return { name: detail.replace(/^(?:지하\s*)?\d+\s*층\s*,?\s*/, '').trim(), address: full };
}

/* ---------- 실행 ---------- */
async function main() {
  const center = arg('center');
  let gu = arg('gu');
  if (!center || !/^[a-z0-9-]+$/.test(center)) fail('--center <서브도메인> 이 필요해요 (예: nowon)');
  if (!gu) fail('--gu <구 이름> 이 필요해요 (예: 노원구)');
  gu = gu.trim();
  if (!/구$/.test(gu)) gu += '구';
  const today = arg('today') || kstToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) fail('--today 는 YYYY-MM-DD');
  let out = arg('out');
  if (!out) {
    // 구 코드: data/geo.js (scripts/build-regions.js와 같은 목록)
    global.window = global.window || {};
    require(path.join(ROOT, 'data', 'geo.js'));
    const g = window.KIDS_GEO.seoul.gu.find((x) => x.name === gu);
    if (!g) fail(`구 코드를 찾지 못함: ${gu} — --out 으로 파일을 정해 주세요`);
    out = path.join(ROOT, 'data', 'raw', g.code, 'family.json');
  }
  const t0 = Date.now();
  const origin = `https://${center}.familynet.or.kr`;

  // 1) robots.txt
  const robots = await get(`${origin}/robots.txt`, { allow404: true });
  const rules = parseRobots(robots.text);
  if (rules.delay) delay = Math.max(MIN_DELAY, rules.delay * 1000);
  const allowed = (p) => robotsAllows(rules, p);
  if (!allowed('/center/index.do')) fail('robots.txt가 /center/index.do 를 막고 있어 수집하지 않음');

  // 2) 첫 화면: 센터 이름·주소·목록 주소
  const home = parseIndex((await get(`${origin}/center/index.do`)).text);
  if (!home.name || !home.listPath) fail('첫 화면에서 센터 이름이나 프로그램신청 목록 링크를 찾지 못함 — 화면 구조가 바뀐 듯');
  if (!allowed(home.listPath)) fail(`robots.txt가 ${home.listPath} 를 막고 있어 수집하지 않음`);
  if (!home.name.includes(gu)) fail(`센터 이름 "${home.name}"에 ${gu}가 없음 — --center 와 --gu 를 확인해 주세요`);
  const centerInfo = { name: home.name, address: home.address };

  // 3) 목록 (접수예정+접수중), 한 쪽 5건
  const listUrl = `${origin}${home.listPath}`;
  const pageUrl = (n) => `${listUrl}?rows=5&cpage=${n}&status=${STATUS}`;
  const first = parseList((await get(pageUrl(1))).text);
  if (!first.center || !first.center.includes(gu)) fail(`목록의 센터구분 "${first.center}"에 ${gu}가 없음`);
  const pages = Math.min(first.pages, MAX_PAGES);
  const raw = [...first.items];
  for (let n = 2; n <= pages; n++) raw.push(...parseList((await get(pageUrl(n))).text).items);
  // 구조 점검: 건수가 있는데 못 읽었거나, 제목·날짜를 대부분 못 읽으면 실패
  if (first.total > 0 && raw.length === 0) fail(`목록에 ${first.total}건이 있는데 항목을 하나도 읽지 못함`);
  const expected = Math.min(first.total, pages * 5);
  if (raw.length < expected * 0.8) fail(`목록 항목을 ${raw.length}/${expected}건만 읽음 — 화면 구조가 바뀐 듯`);
  const bad = (k) => raw.filter((i) => !i[k]).length;
  if (bad('seq') || bad('title')) fail(`제목·번호를 못 읽은 항목 ${Math.max(bad('seq'), bad('title'))}건`);
  if (bad('programStart') > raw.length / 2 || bad('applyStart') > raw.length / 2) fail('행사기간·접수기간 날짜를 대부분 읽지 못함');
  if (bad('statusText') > raw.length / 2) fail('접수 상태를 대부분 읽지 못함');
  const seen = new Set();
  const items = raw.filter((i) => !seen.has(i.seq) && seen.add(i.seq));

  // 4) 고르기: 끝나지 않았고 90일 안에 시작 + 아이·가족 대상
  const until = addDays(today, WINDOW_DAYS);
  const dropped = { ended: 0, later: 0, scope: [] };
  const facilities = [{ name: centerInfo.name, address: centerInfo.address, area: null, url: `${origin}/center/index.do` }];
  const programs = [];
  for (const i of items) {
    const notEnded = i.programEnd ? i.programEnd >= today : i.programStart ? i.programStart >= today : true;
    if (!notEnded) { dropped.ended++; continue; }
    if (i.programStart && i.programStart > until) { dropped.later++; continue; }
    const s = scopeOf(i.title);
    if (!s.keep) { dropped.scope.push(i.title); continue; }
    const v = venueOf(i, centerInfo);
    const f = facilities.find((x) => x.name === v.name);
    if (!f) facilities.push({ name: v.name, address: v.address, area: null, url: null });
    else if (v.address && f.url === null && (!f.address || v.address.length > f.address.length)) f.address = v.address; // 같은 곳은 가장 자세한 진행장소 글
    programs.push({
      title: i.title,
      facility: v.name,
      category: s.category,
      target: null, // 참여대상은 상세(POST)에만 있음
      ageTags: [], // 대상 문구가 없어 나이 분류를 하지 않는다
      programStart: i.programStart,
      programEnd: i.programEnd,
      schedule: null, // 회차별 일시는 상세(POST)에만 있음
      sessions: i.sessions,
      applyStart: i.applyStart,
      applyEnd: i.applyEnd,
      applyMethod: null,
      capacity: null,
      applied: null,
      fee: null, // 플랫폼에 참가비 칸이 없음
      feeText: null,
      statusText: i.statusText,
      url: `${listUrl.replace(/list\.do$/, 'view.do')}?seq=${i.seq}`,
      description: null
    });
  }
  programs.sort((a, b) => (a.programStart || '').localeCompare(b.programStart || '') || a.url.localeCompare(b.url));

  const minutes = ((Date.now() - t0) / 60000).toFixed(1);
  const data = {
    source: `familynet-${center}`,
    sourceName: centerInfo.name,
    sourceUrl: `${origin}/center/index.do`,
    listUrl,
    collectedAt: kstToday(),
    howToCollect: [
      `Gu 가족센터 site on the national familynet.or.kr platform (한국건강가정진흥원), collected by scripts/collectors/familynet.js --center ${center}. robots.txt (User-agent *) allows /center/…, Crawl-delay ${rules.delay ?? 'none'} → requests are sequential ${delay / 1000}s apart, plain GET, no cookies or login.`,
      `Center name/address: GET /center/index.do (div.direct h2, p.loc). List: GET ${home.listPath}?rows=5&cpage=N&status=${STATUS} (server-rendered HTML; 5 per page fixed, rows ignored; status plan=접수예정, ongoing=접수중; 접수마감 left out — not open for application and the closed list is mostly past programs).`,
      'Each li.clearfix: title + seq from send(\'<seq>\',…) in p.tit; 회차정보 "총 N회" → sessions ("단회기" → null, it is also used for year-long classes); 행사기간 → programStart/End; 접수기간 "YYYY-MM-DD HH:MM ~ …" → applyStart/End; 진행장소 text + comeWay.openModal(\'\', 주소, 상세) → venue; div.state span.cN → statusText. url = …/recruitReceipt/view.do?seq=<seq>.',
      'Not collected: the view page is an empty shell filled by POST /recruitReceipt/getView.do (needs CSRF token + session cookie), so target, 정원, 회차 일시, 소개글 are null and ageTags is empty (no target text to derive from). No fee field exists on the platform.',
      'Venue: "공동육아나눔터 ○○점" in 상세 → that name; 상세 mentions the center or same road address as the center → center name; online → 상세 as written; other address → 상세 without floor prefix (or the whole 진행장소 text when 상세 is only a room). Facility address = 진행장소 text as written (longest variant).',
      `Scope by title only (no target field): category = leading [영역] or 영역_ (관계·돌봄·생활·상담·공동체 names); keep when the rest has a child word (자녀, 아동, 유아, 초등, ○학년, 공동육아나눔터 …) or a family word (가족, 패밀리, 부모, 양육) without adult/teen markers (1인가구, 한국어교육, 취업, 자조모임, 봉사단, 동아리, 청소년, 결혼이민자 …). Dates: programEnd >= ${today} (no end → start) and start <= ${until}.`,
      `This run: ${first.total} listed (${pages}/${first.pages} pages), ${dropped.ended} ended, ${dropped.later} start after ${until}, ${dropped.scope.length} out of scope: ${dropped.scope.join(' / ') || '-'}.`
    ].join(' '),
    facilities,
    programs
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
  const warn = first.pages > MAX_PAGES ? ` | 주의: 목록 ${first.pages}쪽 중 ${MAX_PAGES}쪽만 읽음` : '';
  console.log(`[familynet] ${centerInfo.name}: 목록 ${first.total}건 → 아이·가족 ${programs.length}건 (장소 ${facilities.length}곳) | 요청 ${requests}회 · ${minutes}분${warn} → ${path.relative(process.cwd(), out)}`);
}

if (require.main === module) main().catch((e) => fail(e.message));
module.exports = { parseRobots, robotsAllows, parseIndex, parseList, parseItem, scopeOf, splitCategory, venueOf, clean, decode };
