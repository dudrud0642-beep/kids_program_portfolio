// 사용법: node scripts/collectors/dooly.js [--out <파일>] [--today YYYY-MM-DD]
// 둘리뮤지엄(doolymuseum.or.kr) 교육·행사 접수 목록과, 도봉문화재단 문화프로그램의 둘리뮤지엄 탭(전시 등)에서
// 아이·가족 대상 프로그램을 모아 data/raw/11100/dooly.json 에 쓴다.
//  - 둘 다 서버가 그린 HTML을 로그인·쿠키 없이 GET으로만 읽는다. robots.txt는 매번 먼저 확인
//  - 지금 모집·진행 중인 교육이 없으면 0건이 정상 결과다 (목록 틀은 있어야 함)
//  - 화면 구조가 바뀌었거나 접속이 안 되면 파일을 쓰지 않고 exit 1
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'raw', '11100', 'dooly.json');
const BASE = 'https://www.doolymuseum.or.kr';
const DBFAC = 'https://www.dbfac.or.kr';
const UA = 'MoaNolja/1.0 (+https://dudrud0642-beep.github.io/kids_program_portfolio/)';
const TIMEOUT = 20000;
const GAP = 1000; // 요청 사이 최소 1초
const MAX_REQUESTS = 120;
const DEADLINE = 170e3;
const WINDOW_DAYS = 90;
const MAX_PAGES = 5; // 교육 목록 쪽 수 상한 (쪽당 9건, 최신부터)
const FACILITY = { name: '둘리뮤지엄', address: '서울특별시 도봉구 시루봉로1길 6(쌍문동)', area: '쌍문동', url: `${BASE}/html/sub01/sub01_0106.php` };

const HOW_TO = [
  '[1] 교육·행사 목록: GET https://www.doolymuseum.or.kr/html/sub05/sub05_0501.php?cate2=&searchField=&searchText=&only_ing=&page={n} (서버 렌더링 HTML, 쪽당 9건, idx 내림차순). 카드 div.row.gallery_body > div.col-md-4: a[href="sub05_0501_view.php?idx={idx}"], div.category(분류: 특강/교육/행사/전시연계/기타), p.subject(제목 — "<호이 호이 ! …>"처럼 꺾쇠 글자가 그대로 들어 있음), "신청기간 : YYYY-MM-DD~YYYY-MM-DD", "교육기간 : …", "대상 : …", "선착순 : {신청} / {정원} ( 대기 : N명 )", div.info-status(마감 등). 교육기간 끝 ≥ 오늘인 카드가 한 장도 없는 쪽에서 멈춘다(최대 5쪽). 전체 목록 첫 쪽에 카드가 하나도 없으면 구조가 바뀐 것으로 보고 실패 처리. only_ing=Y(모집 중만) 결과가 비어 있는 것은 정상.',
  '[2] 교육 상세: GET https://www.doolymuseum.or.kr/html/sub05/sub05_0501_view.php?idx={idx} — div.content-txt의 dl(교육명, 접수기간, 교육기간, 모집대상, 모집인원 "선착순 70 / 70", 교육장소, 참가비 "무료"), div.btn-status2(상태), 본문 div.bt-content(글자 줄만 소개글로; 포스터 이미지는 읽지 않음). 시간 칸이 없어 schedule은 null. applyMethod는 모집인원 칸의 방식 글자(선착순). sessions는 본문의 "총 N회"(여러 날에 걸친 교육만).',
  '[3] 기획전시·행사: 같은 전시가 도봉문화재단 문화프로그램의 둘리뮤지엄 탭에 표 형식으로 올라오므로 그쪽을 쓴다. 목록 GET https://www.dbfac.or.kr/front/supportManageReq/supportManageListPage.do?miv_pageNo=1&miv_pageSize=50&mode=V&searchkey=NAME&search_gb=All&search_gb2=09&searchType=title&searchtxt= , 상세 GET https://www.dbfac.or.kr/front/supportManageReq/supportManageView.do?mode=V&seq={seq}&gubun={gubun} (table.boardViewTable: 구분, 장소, 기간, 시간, 대상, 모집인원, 접수기간, 기본비용). 장소에 "둘리뮤지엄"이 없는 글(익산·태백 순회전과 연계 교육·관광투어 등 도봉구 밖 행사)은 뺀다. 둘리뮤지엄은 어린이 박물관이라 자체 전시(구분=전시)는 대상 글자와 관계없이 넣고(ageTags는 대상 글자에서만 → "둘리뮤지엄 관람객"이면 빈 배열), 공연·행사·교육·체험은 대상에 아이·가족이 드러난 것만 넣는다. 교육 목록[1]과 같은 프로그램이면 [1]을 남긴다. 둘리뮤지엄 자체 기획전시 게시판(/html/sub06/sub06_0603.php?bbsCode=sub0603)은 같은 내용이라 읽지 않는다.',
  '[4] 공지사항(/html/sub04/sub04_0401.php?bbsCode=sub0401)은 형식 없는 글·포스터라 자동 수집에서 뺀다(예: "찾아가는 둘리 인형탈"처럼 공지에만 올라오는 행사는 수동 확인 필요).',
  '[5] 고르는 기준: 기간 끝 ≥ 오늘, 시작 ≤ 오늘+90일. 대상 "누구나"만 적힌 교육은 빼고, "누구나 (13세 이하 보호자 동반 필수)"처럼 아이·보호자가 드러나면 넣는다. ageTags 규칙은 unilib.js와 같다. 주소: https://www.doolymuseum.or.kr/html/sub01/sub01_0106.php ("도로" 줄).'
].join(' ');

/* ---------- 인자 ---------- */
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/* ---------- 글자 정리 ---------- */
const ENTITY = { nbsp: ' ', lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", middot: '·', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', rarr: '→', larr: '←', sim: '∼', times: '×', bull: '•', ndash: '–', mdash: '—' };
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m);
// 진짜 HTML 태그만 지운다 — 제목 속 "<소중한 약속>" 같은 꺾쇠 글자는 남긴다
const BLOCK = 'p|div|br|li|ul|ol|dl|dt|dd|tr|td|th|table|tbody|thead|h[1-6]|hr|section|article|blockquote|pre|center|figure|figcaption|caption';
const INLINE = 'a|abbr|b|i|u|s|em|strong|span|font|small|big|sub|sup|mark|del|ins|strike|label|img|wbr|o:p|input|button|iframe|colgroup|col|meta|link';
const BLOCK_RE = new RegExp(`<\\/?(?:${BLOCK})(?=[\\s/>])[^>]*>`, 'gi');
const INLINE_RE = new RegExp(`<\\/?(?:${INLINE})(?=[\\s/>])[^>]*>`, 'gi');
// 편집기가 "<K-라면과 구공탄>"을 태그로 바꿔 "<k-라면과 구공탄="">…</k-라면과>"가 된 경우를 되돌린다
const fixFakeTags = (s) => s.replace(/<\/[^>\s]*[가-힣][^>]*>/g, '').replace(/<([A-Za-z][^<>]*[가-힣][^<>]*?)=""\s*>/g, '<$1>');
const dropJunk = (s) => fixFakeTags(String(s || '').replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ''));
const ZW = /[\u200b\ufeff]/g;
const clean = (s) => decode(dropJunk(s).replace(BLOCK_RE, ' ').replace(INLINE_RE, '')).replace(ZW, '').replace(/\s+/g, ' ').trim();
const toLines = (s) => decode(dropJunk(s).replace(/<(?:br|\/p|\/div|\/li|\/h\d|\/tr|\/dd|\/dt)\b[^>]*>/gi, '\n').replace(BLOCK_RE, '\n').replace(INLINE_RE, ''))
  .replace(ZW, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

/* ---------- 날짜 ---------- */
const validDate = (y, m, d) => { const t = new Date(Date.UTC(+y, +m - 1, +d)); return t.getUTCFullYear() === +y && t.getUTCMonth() === +m - 1 && t.getUTCDate() === +d; };
const mk = (y, m, d) => (validDate(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// "2026-07-25~2026-08-08", "2026.05.02 ~ 2026.10.25" → { start, end } (두 날짜 모두 연도가 적혀 있다)
function dates(s) {
  const all = [...String(s || '').matchAll(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g)].map((m) => mk(m[1], m[2], m[3]));
  return { start: all[0] || null, end: all[1] || all[0] || null };
}

/* ---------- 대상 → ageTags (unilib.js와 같은 규칙) ---------- */
const AGE = ['infant', 'preschool', 'elem-low', 'elem-high']; // 4 청소년, 5 성인
const ageStage = (n) => (n <= 2 ? 0 : n <= 7 ? 1 : n <= 10 ? 2 : n <= 13 ? 3 : n <= 19 ? 4 : 5);
const KID_WORD = /어린이|아동|아이(?!디|나라|패드|폰)|유아|영아|미취학|유치원|초등|가족|자녀|개월/;
function ageTags(target, year) {
  let t = String(target || '').replace(/\s+/g, ' ');
  if (!t) return [];
  const family = /가족|보호자|양육자|부모|학부모|엄마|아빠|아버지|어머니|자녀\s*(?:와|동반|\d)|동반/.test(t);
  // 어른만 참여하는 부모·양육자 교육
  const bare = t.replace(/\([^)]*\)|\d+\s*(?:명|팀|가족)|선착순/g, ' ').replace(/\s+/g, ' ').trim();
  if (/자녀를\s*둔|양육\s*중인|임신부|예비\s*양육자|양육자\s*\(\s*성인\s*\)/.test(t) ||
      (/(?:양육자|부모|학부모)$/.test(bare) && !/어린이|아동|아이|가족|동반|\+|[와과및]\s*(?:양육자|보호자|부모|학부모)/.test(bare))) return ['parent'];
  t = t.replace(/(\d)\s*(?:학년)?\s*[~\-–,]\s*(\d)\s*학년/g, '$1학년~$2학년')
    .replace(/(\d{1,2})\s*(?:세)?\s*[~\-–]\s*(\d{1,2})\s*세/g, '$1세~$2세')
    .replace(/(\d{4})\s*년?\s*[~\-–]\s*(\d{4})\s*년생/g, '$1년생~$2년생');
  const toks = [];
  const add = (re, fn) => { for (const m of t.matchAll(re)) { const r = fn(m); if (r) toks.push({ at: m.index, end: m.index + m[0].length, ...r }); } };
  add(/(초등|중|고등?)?\s*(?:학교|학생)?\s*(\d)\s*학년/g, (m) => {
    const g = +m[2];
    if (m[1] && m[1] !== '초등') return { lo: 4, hi: 4 };
    return g >= 1 && g <= 6 ? { lo: g <= 3 ? 2 : 3, hi: g <= 3 ? 2 : 3 } : null;
  });
  add(/(?:만\s*)?(\d{1,2})\s*세/g, (m) => ({ lo: ageStage(+m[1]), hi: ageStage(+m[1]), age: +m[1] }));
  add(/(\d{1,3})\s*개월/g, (m) => { const s = +m[1] < 36 ? 0 : +m[1] < 96 ? 1 : 2; return { lo: s, hi: s }; });
  add(/영유아/g, () => ({ lo: 0, hi: 1 }));
  add(/영아/g, (m) => (t[m.index - 1] === '유' ? null : { lo: 0, hi: 0 }));
  add(/(?<!영)유아/g, () => ({ lo: 1, hi: 1 }));
  add(/미취학|유치원|어린이집|취학\s*전/g, () => ({ lo: 1, hi: 1 }));
  add(/초등(?:학교|학생)?(?!\s*(?:학교|학생)?\s*\d)(?!\s*[저고]학년)/g, () => ({ lo: 2, hi: 3 }));
  add(/저학년/g, () => ({ lo: 2, hi: 2 }));
  add(/고학년/g, () => ({ lo: 3, hi: 3 }));
  add(/청소년|중학생|고등학생|중고생/g, () => ({ lo: 4, hi: 4 }));
  add(/성인|어른|중장년/g, () => ({ lo: 5, hi: 5 }));
  if (!toks.length) {
    add(/(\d{4})\s*년생/g, (m) => { const a = year - +m[1] + 1; return a >= 0 && a < 100 ? { lo: ageStage(a), hi: ageStage(a) } : null; });
  }
  toks.sort((a, b) => a.at - b.at);
  const spans = [];
  for (const k of toks) {
    const prev = spans[spans.length - 1];
    if (prev && /^\s*[~\-–]\s*$/.test(t.slice(prev.end, k.at))) { prev.lo = Math.min(prev.lo, k.lo); prev.hi = Math.max(prev.hi, k.hi); prev.end = k.end; continue; }
    if (prev && prev.end > k.at) continue;
    spans.push({ ...k, open: false });
  }
  for (const s of spans) {
    s.open = /^\s*(?:이상|부터)/.test(t.slice(s.end, s.end + 4));
    s.below = (/^\s*(이하|미만|까지)/.exec(t.slice(s.end, s.end + 4)) || [])[1];
  }
  const tags = new Set();
  const closedHi = Math.max(-1, ...spans.filter((s) => !s.open).map((s) => s.hi));
  for (const s of spans) {
    let { lo, hi } = s;
    if (s.open) {
      if (s.age >= 12) continue; // "12세 이상 관람가"는 아이 대상이 아님
      hi = closedHi >= lo ? Math.min(closedHi, 3) : 3;
    }
    if (s.below) { lo = 0; if (s.below === '미만' && s.age) hi = ageStage(s.age - 1); } // "13세 이하"는 그 아래 나이 모두
    for (let i = lo; i <= Math.min(hi, 3); i++) tags.add(AGE[i]);
  }
  if (family) tags.add('family');
  return AGE.concat('family').filter((x) => tags.has(x));
}
const isKidTarget = (target, tags) => tags.length > 0 || KID_WORD.test(String(target || '').replace(/\d+\s*세\s*이상\s*관람가/, ''));

/* ---------- 본문 → 소개글·회차 (unilib.js와 같은 규칙) ---------- */
const INTRO = /^[\[【<]?\s*(?:프로그램|공연|강연|행사|강좌|교육|전시|체험|작품)\s*소개\s*[\]】>]?\s*[:：]?\s*$/;
const CONTENT_LABEL = /^(?:프로그램\s*)?(?:내용|소개)\s*[:：]\s*/;
const LABEL = /^[\[【][^\]】]{1,20}[\]】]|^[가-힣 ]{1,8}\s*[:：|]/;
const NOTICE = /문의|☎|\d{2,4}\s*[-)]\s*\d{3,4}\s*-\s*\d{4}|신청|접수|추가\s*모집|모집\s*(?:기간|인원|대상|일정|방법)|\d+\s*명\s*모집|아이디|비고|주차|취소|노쇼|페널티|불참|대기자|선착순|유의|안내사항|감면|결석|폐강|촬영|홍보|준비물|인증|회원|새로고침|전화번호|신분증|증빙|서류|지참|수령|수강료|참가비|재료비|교재비|변경될\s*수|변경되었|변경됩니다|지원을\s*받아|주최|주관|후원|https?:\/\//;
const BULLET = /^(?:[-–—•·○●◎◆◇■□▶▷☞※*★☆♥♡◈▣▪✔✅✨\p{Extended_Pictographic}\p{Mn}\p{Me}\p{Cf}]+\s*|\d{1,2}[.)]\s+|ㅇ\s+)+/u;
const TAIL = /[\s\p{Extended_Pictographic}\p{Mn}\p{Me}\p{Cf}]+$/u;
const ENDS = /(?:[.!?~]|[다요죠네까])[\s!.~♥♡★☆)」』"'’”]*$/;
const JOINS = /(?:,|[는고며서면여해된한을를이가의와과에로도및]\s*)$/;
function sentences(lines) {
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && JOINS.test(prev) && !ENDS.test(prev) && !BULLET.test(l) && !/^[\[【]/.test(l) && prev.length < 250) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out;
}
function describe(lines0, title) {
  const lines = sentences(lines0);
  const norm = (s) => s.replace(/[^가-힣A-Za-z0-9]/g, '');
  const tnorm = norm(title || '');
  const kind = (l) => { const m = BULLET.exec(l); return m ? (/\d/.test(m[0]) ? 'num' : [...m[0].trim()][0] || '') : ''; };
  const body = (l) => l.replace(BULLET, '').replace(CONTENT_LABEL, '').replace(TAIL, '').trim();
  const good = (l) => {
    if (/^[※*]/.test(l)) return false; // 참고 줄
    const s = body(l);
    if (s.length < 12 || /^[*=\-_~—]{3,}/.test(s)) return false;
    if (/^[(\[【<「『〈《][^)\]】>」』〉》]*[)\]】>」』〉》]$/.test(s)) return false; // 괄호로 둘러싼 머리
    if (!CONTENT_LABEL.test(l.replace(BULLET, '')) && LABEL.test(s)) return false;
    if (NOTICE.test(s)) return false;
    if (/\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}:\d{2}|오[전후]\s*\d{1,2}\s*시|^\d{1,2}\s*[/.]\s*\d{1,2}|^\d{4}\s*[.년]/.test(s)) return false; // 날짜·시간 줄
    const n = norm(s);
    if (tnorm && (tnorm.includes(n) || n.includes(tnorm))) return false; // 제목 되풀이
    return /[가-힣]{2}/.test(s);
  };
  const paras = [];
  let cur = null;
  lines.forEach((l, i) => {
    if (!good(l)) { cur = null; return; }
    if (!cur || cur.kind !== kind(l)) paras.push((cur = { kind: kind(l), at: i, lines: [] }));
    cur.lines.push(body(l));
  });
  const intro = lines.findIndex((l) => INTRO.test(l.replace(BULLET, '')));
  const done = (p) => ENDS.test(p.lines[p.lines.length - 1]) && !(p.lines.length === 1 && /\?[\s★☆!~]*$/.test(p.lines[0]));
  const pick = (intro > -1 && paras.find((p) => p.at > intro)) || paras.find(done) || null;
  // 문단 앞의 머리 줄(문장으로 끝나지 않는 줄)은 뗀다
  while (pick && pick.lines.length > 1 && !ENDS.test(pick.lines[0])) pick.lines.shift();
  let text = pick ? pick.lines.join(' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) return null;
  if (text.length > 300) {
    const cut = text.slice(0, 300);
    const j = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('다.'), cut.lastIndexOf('요.'));
    text = j > 80 ? cut.slice(0, j + (cut[j] === '다' || cut[j] === '요' ? 2 : 1)).trim() : cut.slice(0, 299).trim() + '…';
  }
  return text;
}
function sessionsOf(text, start, end) {
  if (!start || !end || start === end) return null;
  const m = /총\s*(\d{1,2})\s*(?:회차|회|차시|강)(?![가-힣]*\s*(?:이상|결석))/.exec(String(text || ''));
  const n = m ? +m[1] : null;
  return n && n > 1 && n <= 60 ? n : null;
}
// 요금 글자 → 숫자 ("무료" → 0, "5,000원" → 5000)
function feeOf(text) {
  const t = String(text || '').trim();
  if (!t || t === '-') return { fee: null, feeText: null };
  if (/^(?:전석\s*|전액\s*)?무료/.test(t)) return { fee: 0, feeText: t };
  const m = /^([\d,]+)\s*원/.exec(t);
  return { fee: m ? +m[1].replace(/,/g, '') : null, feeText: t };
}

/* ---------- 요청 (차례로, 간격 두고, 한 번 다시 시도) ---------- */
let lastAt = 0;
let requests = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, { allow404 = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (requests >= MAX_REQUESTS) throw Object.assign(new Error(`요청 상한 ${MAX_REQUESTS}회 도달`), { budget: true });
    const wait = lastAt + GAP - Date.now();
    if (wait > 0) await sleep(wait);
    requests++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      const text = await res.text();
      lastAt = Date.now();
      if (allow404 && res.status === 404) return '';
      if (res.status === 403 || res.status === 429) throw Object.assign(new Error(`HTTP ${res.status} — 자동 접속이 막힌 듯`), { fatal: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (/captcha|비정상적인 접근|접근이 차단/i.test(text.slice(0, 3000))) throw Object.assign(new Error('차단·확인 화면이 나옴'), { fatal: true });
      return text;
    } catch (e) {
      lastAt = Date.now();
      if (e.fatal || e.budget || attempt === 1) throw new Error(`${url}: ${e.message}`);
      await sleep(2000);
    }
  }
}
// robots.txt (User-agent: * 묶음)에서 쓰는 경로가 막혔는지
async function checkRobots(base, paths) {
  const txt = await get(`${base}/robots.txt`, { allow404: true });
  if (!txt || /<html/i.test(txt)) return;
  let on = false;
  const dis = [];
  for (const raw of txt.split(/\r?\n/)) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*/, '').trim());
    if (!m) continue;
    if (m[1].toLowerCase() === 'user-agent') on = m[2].trim() === '*' || /moanolja/i.test(m[2]);
    else if (on && m[1].toLowerCase() === 'disallow' && m[2].trim()) dis.push(m[2].trim());
  }
  const blocked = paths.filter((p) => dis.some((d) => p.startsWith(d.replace(/\*.*$/, ''))));
  if (blocked.length) throw new Error(`${base} robots.txt가 ${blocked.join(', ')} 수집을 막고 있어 멈춤`);
}

/* ---------- 둘리뮤지엄 교육 목록·상세 ---------- */
const eduList = (page) => `${BASE}/html/sub05/sub05_0501.php?cate2=&searchField=&searchText=&only_ing=&page=${page}`;
const eduView = (idx) => `${BASE}/html/sub05/sub05_0501_view.php?idx=${idx}`;
function parseEduList(html) {
  const start = html.indexOf('<div class="row gallery_body">');
  if (start < 0) throw new Error('교육 목록 영역(div.gallery_body)을 찾지 못함 — 화면 구조가 바뀐 듯');
  const stop = html.indexOf('<!-- //board_body -->', start);
  const body = html.slice(start, stop > start ? stop : undefined);
  const last = Math.max(1, ...[...html.matchAll(/[?&]page=(\d+)/g)].map((m) => +m[1]));
  const cards = body.split('<div class="col-md-4">').slice(1).map((c) => {
    const p = (label) => clean((new RegExp(`<p>\\s*${label}\\s*:([\\s\\S]*?)<\\/p>`).exec(c) || [])[1]);
    const when = dates(p('교육기간'));
    const apply = dates(p('신청기간'));
    return {
      idx: (/sub05_0501_view\.php\?idx=(\d+)/.exec(c) || [])[1] || null,
      category: clean((/<div class="category"[^>]*>([\s\S]*?)<\/div>/.exec(c) || [])[1]) || null,
      title: clean((/<p class="subject">([\s\S]*?)<\/p>/.exec(c) || [])[1]),
      start: when.start,
      end: when.end,
      applyStart: apply.start,
      applyEnd: apply.end,
      target: p('대상') || null,
      recruit: p('선착순'),
      status: clean((/<div class="info-status[^"]*">([\s\S]*?)<\/div>/.exec(c) || [])[1]) || null
    };
  });
  return { cards, last };
}
function parseEduView(html) {
  const s = html.indexOf('<div class="content-txt">');
  if (s < 0) throw new Error('교육 상세(div.content-txt)를 찾지 못함 — 화면 구조가 바뀐 듯');
  const e = html.indexOf('<!-- //교육 상세 정보 -->', s);
  const box = html.slice(s, e > s ? e : s + 5000);
  const f = {};
  for (const m of box.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) f[clean(m[1])] = clean(m[2]);
  if (!('교육명' in f) || !('교육기간' in f)) throw new Error('교육 상세에 교육명·교육기간 칸이 없음');
  const status = clean((/<div class="[^"]*btn-status2[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(box) || [])[1]) || null;
  const bi = html.indexOf('bt-content', e > s ? e : s);
  const body = bi > -1 ? html.slice(html.indexOf('>', bi) + 1, html.indexOf('<!-- //board_body -->', bi)) : '';
  return { f, status, lines: toLines(body) };
}
// "선착순 70 / 70", "21 / 20 ( 대기 : 1명 )" → 방식·신청·정원
function recruit(s) {
  const t = String(s || '');
  const pair = /(\d+)\s*\/\s*(\d+)/.exec(t);
  const method = (/^\s*([가-힣]+)\s*\d/.exec(t) || [])[1] || null;
  const one = /(\d+)\s*명/.exec(t);
  return pair ? { applied: +pair[1], capacity: +pair[2], method } : { applied: null, capacity: one ? +one[1] : null, method };
}

/* ---------- 도봉문화재단 둘리뮤지엄 탭 ---------- */
const fdnList = `${DBFAC}/front/supportManageReq/supportManageListPage.do?miv_pageNo=1&miv_pageSize=50&mode=V&searchkey=NAME&search_gb=All&search_gb2=09&searchType=title&searchtxt=`;
const fdnView = (seq, gubun) => `${DBFAC}/front/supportManageReq/supportManageView.do?mode=V&seq=${seq}&gubun=${gubun}`;
function parseFdnList(html) {
  const total = /<p class="postNum">\s*TOTAL\s*<span>\s*([\d,]+)\s*<\/span>/.exec(html);
  const start = html.indexOf('<div class="culProUlWrap">');
  if (!total || start < 0) throw new Error('재단 목록 영역(p.postNum / div.culProUlWrap)을 찾지 못함 — 화면 구조가 바뀐 듯');
  const body = html.slice(start, html.indexOf('paging_area', start) > start ? html.indexOf('paging_area', start) : undefined);
  const items = body.split(/<li>(?=[\s\S]{0,400}?supportManageViewPage)/).slice(1).map((li) => {
    const m = /supportManageViewPage\('(\d+)'\s*,\s*'(\d+)'\)/.exec(li);
    const d = dates(clean((/<span class="programDate">([\s\S]*?)<\/span>/.exec(li) || [])[1]));
    return { seq: m ? m[1] : null, gubun: m ? m[2] : null, start: d.start, end: d.end };
  });
  if (+total[1].replace(/,/g, '') > 0 && !items.length) throw new Error('재단 둘리뮤지엄 탭에 글이 있다는데 항목을 못 읽음');
  return items;
}
function parseFdnView(html) {
  const info = html.indexOf('<div class="programInfo">');
  const tEnd = html.indexOf('</table>', info);
  if (info < 0 || tEnd < 0 || !/<table class="boardViewTable">/.test(html.slice(info, tEnd))) throw new Error('재단 상세 표(table.boardViewTable)를 찾지 못함');
  const title = clean((/<h4>([\s\S]*?)<\/h4>/.exec(html.slice(info, tEnd)) || [])[1]);
  const f = {};
  for (const m of html.slice(info, tEnd).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/g)) f[clean(m[1])] = clean(m[2]);
  if (!('기간' in f) || !('대상' in f)) throw new Error('재단 상세 표에 기간·대상 칸이 없음');
  const ci = html.indexOf('<div class="boardViewConP">', tEnd);
  const nav = ci > -1 ? html.indexOf('boardNavTable', ci) : -1;
  return { title, f, lines: ci > -1 ? toLines(html.slice(ci, nav > ci ? nav : ci + 60000)) : [] };
}
const blank = (s) => (String(s || '').replace(/[\s~명원]/g, '') ? String(s).trim() : null);

/* ---------- 실행 ---------- */
async function main() {
  const t0 = Date.now();
  const out = arg('out') ? path.resolve(arg('out')) : DEFAULT_OUT;
  const today = arg('today') || kstToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today 형식이 YYYY-MM-DD가 아님: ${today}`);
  const until = addDays(today, WINDOW_DAYS);
  const inWindow = (s, e) => { const last = e || s; return !!last && last >= today && (!s || s <= until); };

  await checkRobots(BASE, ['/html/sub05/']);
  await checkRobots(DBFAC, ['/front/supportManageReq/']);

  // 1) 교육 목록 (최신부터, 진행 중인 카드가 없는 쪽에서 멈춤)
  const programs = [];
  let cardsSeen = 0;
  let eduDetails = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { cards, last } = parseEduList(await get(eduList(page)));
    if (page === 1 && !cards.length) throw new Error('교육 전체 목록 첫 쪽에 카드가 하나도 없음 — 화면 구조가 바뀐 듯');
    if (cards.some((c) => !c.idx)) throw new Error('교육 목록에서 idx 없는 카드 — 마크업이 바뀐 듯');
    const undated = cards.filter((c) => !c.start).length;
    if (undated > cards.length * 0.3) throw new Error(`교육 목록 날짜를 못 읽은 카드가 많음 (${undated}/${cards.length})`);
    cardsSeen += cards.length;
    let running = 0;
    for (const c of cards) {
      if ((c.end || c.start || '') >= today) running++;
      if (!inWindow(c.start, c.end) || !isKidTarget(c.target, ageTags(c.target, +(c.start || today).slice(0, 4)))) continue;
      const v = parseEduView(await get(eduView(c.idx)));
      eduDetails++;
      const when = dates(v.f['교육기간']);
      const apply = dates(v.f['접수기간']);
      const target = v.f['모집대상'] || c.target;
      const tags = ageTags(target, +(when.start || today).slice(0, 4));
      if (!inWindow(when.start, when.end) || !isKidTarget(target, tags)) continue;
      const r = recruit(v.f['모집인원'] || `선착순 ${c.recruit}`);
      const money = feeOf(v.f['참가비']);
      programs.push({
        title: v.f['교육명'] || c.title,
        facility: FACILITY.name,
        category: c.category,
        target,
        ageTags: tags,
        programStart: when.start,
        programEnd: when.end,
        schedule: null,
        sessions: sessionsOf(v.lines.join('\n'), when.start, when.end),
        applyStart: apply.start,
        applyEnd: apply.end,
        applyMethod: r.method,
        capacity: r.capacity,
        applied: r.applied,
        fee: money.fee,
        feeText: money.feeText,
        statusText: v.status || c.status,
        url: eduView(c.idx),
        description: describe(v.lines, v.f['교육명'] || c.title)
      });
    }
    if (!running || page >= last) break;
  }

  // 2) 도봉문화재단 둘리뮤지엄 탭 (전시 등)
  const items = parseFdnList(await get(fdnList));
  const words = (s) => new Set((String(s).match(/[가-힣A-Za-z0-9]{2,}/g) || []).filter((w) => !/^(?:교육|공연|행사|전시|체험|모집|안내|개최|둘리뮤지엄|20\d\d년?)$/.test(w)));
  let fdnDetails = 0;
  for (const it of items) {
    if (!inWindow(it.start, it.end)) continue;
    if (Date.now() - t0 > DEADLINE) throw new Error('시간 상한(170초)을 넘김');
    const v = parseFdnView(await get(fdnView(it.seq, it.gubun)));
    fdnDetails++;
    const when = dates(v.f['기간']);
    const place = v.f['장소'] || '';
    const category = blank(v.f['구분']);
    const target = blank(v.f['대상']);
    const tags = ageTags(target, +(when.start || today).slice(0, 4));
    if (!inWindow(when.start, when.end) || !/둘리뮤지엄/.test(place)) continue; // 도봉구 밖 순회전·연계 행사는 뺀다
    if (category !== '전시' && !isKidTarget(target, tags)) continue;
    // 교육 목록[1]에 같은 프로그램이 있으면 그쪽을 남긴다
    const W = words(v.title);
    if (programs.some((p) => p.programStart === when.start && [...words(p.title)].filter((w) => W.has(w)).length >= Math.max(1, W.size * 0.5))) continue;
    const base = blank(v.f['기본비용']);
    const won = /^([\d,]+)\s*원/.exec(base || '');
    const cap = /(\d+)\s*명/.exec(v.f['모집인원'] || '');
    const apply = dates(v.f['접수기간']);
    programs.push({
      title: v.title,
      facility: FACILITY.name,
      category,
      target,
      ageTags: tags,
      programStart: when.start,
      programEnd: when.end,
      schedule: blank(v.f['시간']),
      sessions: sessionsOf(v.lines.join('\n'), when.start, when.end),
      applyStart: apply.start,
      applyEnd: apply.end,
      applyMethod: null,
      capacity: cap ? +cap[1] : null,
      applied: null,
      fee: won ? +won[1].replace(/,/g, '') : null,
      feeText: base,
      statusText: null,
      url: fdnView(it.seq, it.gubun),
      description: describe(v.lines, v.title)
    });
  }

  const data = {
    source: 'dooly',
    sourceName: '둘리뮤지엄',
    sourceUrl: BASE,
    listUrl: `${BASE}/html/sub05/sub05_0501.php`,
    collectedAt: today,
    howToCollect: HOW_TO,
    facilities: [{ ...FACILITY }],
    programs
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // 임시 파일에 다 쓴 뒤 바꿔 끼운다 (중간에 끊겨도 반쪽 파일이 남지 않게)
  fs.writeFileSync(`${out}.tmp`, JSON.stringify(data, null, 1) + '\n');
  fs.renameSync(`${out}.tmp`, out);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[dooly] ${today} 기준 ${programs.length}건 (교육 카드 ${cardsSeen}장 → 상세 ${eduDetails}건, 재단 둘리뮤지엄 탭 상세 ${fdnDetails}건) 요청 ${requests}회 ${sec}초 → ${path.relative(ROOT, out)}`);
}

module.exports = { parseEduList, parseEduView, parseFdnList, parseFdnView, recruit, dates, ageTags, isKidTarget, describe, clean };

if (require.main === module) {
  main().catch((e) => { console.error(`[dooly] 실패: ${e.message}`); process.exit(1); });
}
