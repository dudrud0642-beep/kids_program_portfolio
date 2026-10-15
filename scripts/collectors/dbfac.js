// 사용법: node scripts/collectors/dbfac.js [--out <파일>] [--today YYYY-MM-DD]
// 도봉문화재단(dbfac.or.kr) 문화프로그램 게시판과 재단이 운영하는 평화문화진지 누리집(culturebunker.or.kr)에서
// 아이·가족 대상 프로그램을 모아 data/raw/11100/dbfac.json 에 쓴다.
//  - 둘 다 서버가 그린 HTML을 로그인·쿠키 없이 GET으로만 읽는다. robots.txt는 매번 먼저 확인
//  - 문화프로그램: 목록(200건 한 번에) → 날짜로 거른 것만 상세 표(구분·장소·기간·시간·대상…)를 읽는다
//  - 평화문화진지: 분류별 목록 첫 쪽의 글을 새 글부터 읽고, 본문의 "일시:", "대상:" 같은 항목 줄만 쓴다
//  - 포스터 이미지에만 있는 값(신청방법·요금·상태 등)은 읽지 않고 null로 둔다
//  - 화면 구조가 바뀌었거나 접속이 안 되면 파일을 쓰지 않고 exit 1
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'raw', '11100', 'dbfac.json');
const BASE = 'https://www.dbfac.or.kr';
const CB = 'https://culturebunker.or.kr';
const UA = 'MoaNolja/1.0 (+https://dudrud0642-beep.github.io/kids_program_portfolio/)';
const TIMEOUT = 20000;
const GAP = 1000; // 요청 사이 최소 1초
const MAX_REQUESTS = 120;
const DEADLINE = 170e3;
const WINDOW_DAYS = 90;
const LIST_SIZE = 200; // miv_pageSize는 서버가 그대로 받는다
const LIST_SLACK = 45; // 목록 날짜가 접수기간인 글도 있어 끝난 지 45일 안 된 것까지 상세를 본다
const CB_CATS = ['education', 'event', 'concert', 'exhibition'];
const CB_STOP = 3; // 평화문화진지: 지난 글이 이만큼 이어지면 그 분류는 그만 읽는다
// 다른 수집기가 맡는 시설 탭 (search_gb2): 09 둘리뮤지엄 → dooly.js, 08 구립도서관 → unilib.js
const OTHER_TABS = { '09': '둘리뮤지엄', '08': '구립도서관' };
const GUBUN = { '01': '공연', '02': '전시', '03': '행사', '04': '체험', '05': '교육' };

// 시설 주소: 문화공간 안내(/front/cultureplace/*.do)의 "기관 주소" 칸
const FACILITIES = [
  { name: '평화문화진지', address: '서울특별시 도봉구 마들로 932 평화문화진지', area: null, url: `${BASE}/front/cultureplace/culturebunker.do` },
  { name: '함석헌기념관', address: '서울특별시 도봉구 도봉로 123길 33-6 (쌍문동)', area: '쌍문동', url: `${BASE}/front/cultureplace/hamsokhon.do` },
  { name: '김수영문학관', address: '서울특별시 도봉구 해등로32길 80(방학동)', area: '방학동', url: `${BASE}/front/cultureplace/kimsuyoung.do` },
  { name: '간송옛집', address: '서울특별시 도봉구 시루봉로 149-18(방학동)', area: '방학동', url: `${BASE}/front/cultureplace/kansong.do` },
  { name: '마을극장 흰고무신', address: '서울시 도봉구 시루봉로 15마길 13', area: null, url: `${BASE}/front/cultureplace/rubbershoes.do` },
  { name: '청소년 예술공간 채움', address: '서울특별시 도봉구 도봉로 955 광역환승센터 1층', area: null, url: `${BASE}/front/cultureplace/youthart.do` },
  { name: '도봉구민회관 소공연장', address: null, area: null, url: null }
];

const HOW_TO = [
  '[1] 문화프로그램 목록(주 소스): GET https://www.dbfac.or.kr/front/supportManageReq/supportManageListPage.do?miv_pageNo={n}&miv_pageSize=200&mode=V&searchkey=NAME&search_gb=All&search_gb2=&searchType=title&searchtxt= (서버 렌더링 HTML, p.postNum "TOTAL N건"). miv_pageSize는 서버가 그대로 받아 200건을 한 번에 읽는다(정렬이 날짜순이 아니라 최근 글 200건 안에서 날짜로 거름, 200번째 글도 1년 안이면 다음 쪽까지). 항목: <a href="javascript:supportManageViewPage(\'{seq}\',\'{gubun}\')"> + span.programType + span.programTit + span.programDate("기간 YYYY-MM-DD ~ YYYY-MM-DD"). 목록 날짜가 접수기간인 글도 있어, 끝난 지 45일 안 된 글까지 상세를 읽고 상세의 기간으로 다시 거른다.',
  '[2] 시설 탭: search_gb2=09(둘리뮤지엄)·08(구립도서관) 목록을 따로 받아 그 글은 뺀다(둘리뮤지엄은 dooly.js, 도서관은 unilib.js가 맡음). 다른 탭 코드: 01 도봉문화재단, 06 평화문화진지, 11 서울청년센터 도봉, 03 김수영문학관, 04 함석헌기념관, 05 간송옛집, 12 마을극장 흰고무신, 13 청소년 예술공간 채움.',
  '[3] 상세: GET https://www.dbfac.or.kr/front/supportManageReq/supportManageView.do?mode=V&seq={seq}&gubun={gubun} (gubun 01 공연, 02 전시, 03 행사, 04 체험, 05 교육). div.programInfo h4(제목), table.boardViewTable의 th/td: 구분(category), 장소(facility — "함석헌기념관 유리온실"처럼 아는 시설 이름으로 시작하면 그 이름), 기간(YYYY.MM.DD ~ YYYY.MM.DD), 시간(schedule 그대로), 대상(target), 모집인원("N 명"→capacity), 접수기간, 기본비용("N 원"; "0 원"은 0), 부가비용. 빈 칸은 " 명", " ~ ", " 원"으로 나와 null. 본문 div.boardViewConP는 포스터 이미지만 있는 경우가 많다(예: seq=1360) — 글자가 있으면 "신청방법:"/"접수:" 줄을 applyMethod로, "참가비:"/"수강료:" 줄을 요금 칸이 비었을 때만 쓰고, 소개 문단을 description으로 쓴다. 이미지 속 글자(OCR)·이미지 파일 이름은 쓰지 않아 statusText·applied는 늘 null.',
  '[4] 평화문화진지(재단 운영, WordPress): 분류 목록 GET https://culturebunker.or.kr/archives/tax_program/{education|event|concert|exhibition} (쪽당 10건, 새 글부터; ul.program__list li a[href] + h2 제목). 상세 https://culturebunker.or.kr/archives/program/{slug} 의 div.view__detail--text (h2 제목 + 본문). REST API(/wp-json)는 보안 플러그인이 막아 쓰지 않는다. 분류마다 새 글부터 상세를 읽고, 지난(또는 날짜 없는) 글이 3개 이어지면 멈춘다. 본문의 항목 줄 중 처음 나오는 것만 쓴다: 일시/운영일시/일정/기간 → schedule·programStart/End, 대상/참여대상/관람대상/모집대상 → target, 신청방법/참여방법/접수 → applyMethod, 신청기간/접수기간 → applyStart/End, 참가비/참여비/관람료/수강료 또는 "전석 무료" 줄 → fee·feeText, 인원/모집인원 → capacity, "총 N회" → sessions. 여러 하위 프로그램을 나열한 글은 맨 앞(행사 전체) 항목만 쓴다. 연도 보정: "2026. 10. 10.(토) ~ 10. 31.(토)"처럼 끝 날짜에 연도가 없으면 앞 날짜의 연도를 이어받는다(끝이 앞보다 이르면 다음 해). 연도가 하나도 없는 일정("8/6 ~ 8/27", "10~11월")은 날짜를 null로 두고 그 글은 뺀다. 같은 프로그램이 재단 목록(시설 탭 06)에도 있으면 평화문화진지 글을 남긴다.',
  '[5] 공지사항 게시판(GET /front/board/boardContentsListPage.do?board_id=1, 목록은 POST /front/board/boardContentsList.do)은 형식 없는 글·포스터라 자동 수집에서 뺀다(꿈의극단처럼 공지에만 올라오는 모집은 수동 확인 필요).',
  '[6] 고르는 기준: 대상 글자에 아이·가족 대상이 드러난 것만(어린이·아동·유아·초등·N세·N개월·가족 등). "자유관람", "일반인 누구나", "주민", "방문객 누구나", "프로그램별 상이", 성인·청년·55세 이상 대상은 뺀다. 기간 끝 ≥ 오늘, 시작 ≤ 오늘+90일. ageTags는 대상 글자에서만(unilib.js와 같은 규칙: "36개월 이상"은 preschool부터, "N세 이상"은 초등까지, 가족·보호자·동반 → family).'
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
// 진짜 HTML 태그만 지운다 — 제목 속 "<동물원에 간 고양이>" 같은 꺾쇠 글자는 남긴다
const BLOCK = 'p|div|br|li|ul|ol|dl|dt|dd|tr|td|th|table|tbody|thead|h[1-6]|hr|section|article|blockquote|pre|center|figure|figcaption|caption';
const INLINE = 'a|abbr|b|i|u|s|em|strong|span|font|small|big|sub|sup|mark|del|ins|strike|label|img|wbr|o:p|input|button|iframe|colgroup|col|meta|link';
const BLOCK_RE = new RegExp(`<\\/?(?:${BLOCK})(?=[\\s/>])[^>]*>`, 'gi');
const INLINE_RE = new RegExp(`<\\/?(?:${INLINE})(?=[\\s/>])[^>]*>`, 'gi');
// 편집기가 "<K-라면과 구공탄>"을 태그로 바꿔 "<k-라면과 구공탄="">…</k-라면과>"가 된 경우를 되돌린다
const fixFakeTags = (s) => s.replace(/<\/[^>\s]*[가-힣][^>]*>/g, '').replace(/<([A-Za-z][^<>]*[가-힣][^<>]*?)=""\s*>/g, '<$1>');
const dropJunk = (s) => fixFakeTags(String(s || '').replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ''));
const ZW = /[\u200b\ufeff]/g;
// 한 줄 글자: 블록 태그는 띄어 쓰고, 단어 안 인라인 태그는 붙여서 지운다
const clean = (s) => decode(dropJunk(s).replace(BLOCK_RE, ' ').replace(INLINE_RE, '')).replace(ZW, '').replace(/\s+/g, ' ').trim();
// 본문을 줄 단위로
const toLines = (s) => decode(dropJunk(s).replace(/<(?:br|\/p|\/div|\/li|\/h\d|\/tr|\/dd|\/dt)\b[^>]*>/gi, '\n').replace(BLOCK_RE, '\n').replace(INLINE_RE, ''))
  .replace(ZW, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

/* ---------- 날짜 ---------- */
const validDate = (y, m, d) => { const t = new Date(Date.UTC(+y, +m - 1, +d)); return t.getUTCFullYear() === +y && t.getUTCMonth() === +m - 1 && t.getUTCDate() === +d; };
const mk = (y, m, d) => (validDate(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// "2026.10.22 ~ 2026.10.22", "2026. 10. 10.(토) ~ 10. 31.(토)", "2026년 10월 17일" → { start, end }
// 끝 날짜에 연도가 없으면 앞 날짜의 연도를 이어받는다 (끝이 앞보다 이르면 다음 해)
function dates(s) {
  const t = String(s || '');
  const full = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/.exec(t);
  if (!full) return { start: null, end: null };
  const start = mk(full[1], full[2], full[3]);
  const rest = t.slice(full.index + full[0].length);
  const tilde = /^\s*\.?\s*(?:\([^)]{1,4}\))?\s*[~∼～\-–]\s*/.exec(rest);
  if (!start || !tilde) return { start, end: start };
  const after = rest.slice(tilde[0].length);
  const m = /^(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\s*:)/.exec(after);
  if (!m) return { start, end: start };
  let end = mk(m[1] || full[1], m[2], m[3]);
  if (end && !m[1] && end < start) end = mk(+full[1] + 1, m[2], m[3]);
  return { start, end };
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
  // 표기 맞추기: "3~4학년" → "3학년~4학년", "7-10세" → "7세~10세", "2020~2021년생" → "2020년생~2021년생"
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
    // 다른 단서가 없을 때만 출생연도를 나이(세는나이)로 바꾼다
    add(/(\d{4})\s*년생/g, (m) => { const a = year - +m[1] + 1; return a >= 0 && a < 100 ? { lo: ageStage(a), hi: ageStage(a) } : null; });
  }
  toks.sort((a, b) => a.at - b.at);
  // "A ~ B" 는 범위로 합친다
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
      if (s.age >= 12) continue; // "12세 이상 관람가", "14세 이상 누구나"는 아이 대상이 아님
      hi = closedHi >= lo ? Math.min(closedHi, 3) : 3; // "36개월 이상 미취학"은 미취학까지
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
// 줄 앞 글머리표·이모지 ("- ", "★", "1. ", "ㅇ ", "🎫 ")
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

/* ---------- 본문 항목 줄 ("일시: …", "◆ 대상 : …", "🎫 전석 무료") ---------- */
const KEYS = {
  schedule: ['일시', '운영일시', '행사일시', '공연일시', '교육일시', '전시기간', '행사기간', '운영기간', '교육기간', '기간', '일정', '수업일정', '교육일정', '운영일정'],
  target: ['대상', '참여대상', '관람대상', '모집대상', '교육대상', '운영대상', '신청대상', '참가대상'],
  method: ['신청방법', '참여방법', '접수방법', '모집방법', '신청', '접수'],
  apply: ['신청기간', '접수기간', '모집기간'],
  fee: ['참가비', '참여비', '관람료', '수강료', '참가료', '체험비', '비용'],
  capacity: ['인원', '모집인원', '정원'],
  place: ['장소', '운영장소', '진행장소']
};
// 처음 나오는 항목 줄 묶음만 읽는다 — 항목 아닌 줄이 3줄 넘게 이어지면 그 뒤(하위 프로그램 소개 등)는 보지 않는다
function labels(lines) {
  const map = {};
  let started = false;
  let gap = 0;
  for (const raw of lines) {
    const l = raw.replace(BULLET, '');
    const m = /^([가-힣][가-힣 ]{0,9}?)\s*[:：]\s*(.+)$/.exec(l);
    if (!m) { if (started && ++gap > 2) break; continue; }
    started = true;
    gap = 0;
    const key = m[1].replace(/\s+/g, '');
    if (!(key in map)) map[key] = m[2].replace(TAIL, '').trim();
  }
  const pick = (k) => { for (const name of KEYS[k]) if (map[name]) return map[name]; return null; };
  const freeLine = lines.map((l) => l.replace(BULLET, '').replace(TAIL, '').trim()).find((l) => /^(?:전석|전액|참가비?\s*전액)?\s*무료(?:\s|$|\()/.test(l) && l.length <= 30);
  return { schedule: pick('schedule'), target: pick('target'), method: pick('method'), apply: pick('apply'), fee: pick('fee') || freeLine || null, capacity: pick('capacity'), place: pick('place') };
}
// 요금 글자 → 숫자 ("무료", "전석 무료" → 0, "3,000원" → 3000)
function feeOf(text) {
  const t = String(text || '').trim();
  if (!t) return { fee: null, feeText: null };
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

/* ---------- 재단 문화프로그램 ---------- */
const listUrl = (page, gb2 = '') => `${BASE}/front/supportManageReq/supportManageListPage.do?miv_pageNo=${page}&miv_pageSize=${LIST_SIZE}&mode=V&searchkey=NAME&search_gb=All&search_gb2=${gb2}&searchType=title&searchtxt=`;
const viewUrl = (seq, gubun) => `${BASE}/front/supportManageReq/supportManageView.do?mode=V&seq=${seq}&gubun=${gubun}`;
function parseList(html) {
  const total = /<p class="postNum">\s*TOTAL\s*<span>\s*([\d,]+)\s*<\/span>/.exec(html);
  const start = html.indexOf('<div class="culProUlWrap">');
  if (!total || start < 0) throw new Error('재단 목록 영역(p.postNum / div.culProUlWrap)을 찾지 못함 — 화면 구조가 바뀐 듯');
  const stop = html.indexOf('paging_area', start);
  const body = html.slice(start, stop > start ? stop : undefined);
  const items = body.split(/<li>(?=[\s\S]{0,400}?supportManageViewPage)/).slice(1).map((li) => {
    const m = /supportManageViewPage\('(\d+)'\s*,\s*'(\d+)'\)/.exec(li);
    const date = clean((/<span class="programDate">([\s\S]*?)<\/span>/.exec(li) || [])[1]);
    const d = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})?/.exec(date);
    return {
      seq: m ? m[1] : null,
      gubun: m ? m[2] : null,
      type: clean((/<span class="programType">([\s\S]*?)<\/span>/.exec(li) || [])[1]),
      title: clean((/<span class="programTit">([\s\S]*?)<\/span>/.exec(li) || [])[1]),
      start: d ? d[1] : null,
      end: d ? d[2] || d[1] : null
    };
  });
  return { total: +total[1].replace(/,/g, ''), items };
}
function parseView(html) {
  const info = html.indexOf('<div class="programInfo">');
  const tEnd = html.indexOf('</table>', info);
  if (info < 0 || tEnd < 0 || !/<table class="boardViewTable">/.test(html.slice(info, tEnd))) throw new Error('재단 상세 표(div.programInfo table.boardViewTable)를 찾지 못함');
  const title = clean((/<h4>([\s\S]*?)<\/h4>/.exec(html.slice(info, tEnd)) || [])[1]);
  const f = {};
  for (const m of html.slice(info, tEnd).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/g)) f[clean(m[1])] = clean(m[2]);
  if (!('기간' in f) || !('대상' in f)) throw new Error('재단 상세 표에 기간·대상 칸이 없음');
  const ci = html.indexOf('<div class="boardViewConP">', tEnd);
  let body = '';
  if (ci > -1) {
    const nav = html.indexOf('boardNavTable', ci);
    body = html.slice(ci, nav > ci ? nav : ci + 60000);
  }
  return { title, f, lines: toLines(body) };
}
const blank = (s) => { const t = String(s || '').replace(/[\s~명원]/g, ''); return t ? String(s).trim() : null; };

/* ---------- 평화문화진지 ---------- */
function parseCbList(html) {
  const start = html.indexOf('<ul class="program__list">');
  if (start < 0) throw new Error('평화문화진지 목록(ul.program__list)을 찾지 못함 — 화면 구조가 바뀐 듯');
  const body = html.slice(start, html.indexOf('</ul>', start));
  return [...body.matchAll(/<a href="(https:\/\/culturebunker\.or\.kr\/archives\/program\/[^"]+)">[\s\S]*?<h2>([\s\S]*?)<\/h2>/g)].map((m) => ({ url: m[1], title: clean(m[2]) }));
}
function parseCbView(html) {
  const s = html.indexOf('<div class="view__detail--text">');
  if (s < 0) throw new Error('평화문화진지 상세(div.view__detail--text)를 찾지 못함');
  const e = html.indexOf('<div class="list__view">', s);
  const v = html.slice(s, e > s ? e : undefined);
  const h2 = /<h2>([\s\S]*?)<\/h2>/.exec(v);
  if (!h2) throw new Error('평화문화진지 상세 제목(h2)을 찾지 못함');
  return { title: clean(h2[1]), lines: toLines(v.slice(h2.index + h2[0].length)) };
}
// 평화문화진지 글 한 건 → 프로그램
function cbProgram(url, v, category) {
  const L = labels(v.lines);
  const when = dates(L.schedule);
  const apply = dates(L.apply);
  const money = feeOf(L.fee);
  const cap = /(\d+)\s*명/.exec(L.capacity || '');
  return {
    title: v.title,
    facility: '평화문화진지',
    category,
    target: L.target,
    ageTags: ageTags(L.target, +(when.start || '2000').slice(0, 4)),
    programStart: when.start,
    programEnd: when.end,
    schedule: L.schedule,
    sessions: sessionsOf(`${L.schedule || ''}\n${v.lines.join('\n')}`, when.start, when.end),
    applyStart: apply.start,
    applyEnd: apply.end,
    applyMethod: L.method,
    capacity: cap ? +cap[1] : null,
    applied: null,
    fee: money.fee,
    feeText: money.feeText,
    statusText: null,
    url,
    description: describe(v.lines, v.title)
  };
}
const CB_CATEGORY = { education: '교육', event: '행사', concert: '공연', exhibition: '전시' };

/* ---------- 실행 ---------- */
async function main() {
  const t0 = Date.now();
  const out = arg('out') ? path.resolve(arg('out')) : DEFAULT_OUT;
  const today = arg('today') || kstToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today 형식이 YYYY-MM-DD가 아님: ${today}`);
  const until = addDays(today, WINDOW_DAYS);
  const slack = addDays(today, -LIST_SLACK);
  const inWindow = (s, e) => { const last = e || s; return !!last && last >= today && (!s || s <= until); };

  await checkRobots(BASE, ['/front/supportManageReq/']);
  await checkRobots(CB, ['/archives/']);

  // 1) 재단 목록 (200건씩, 200번째 글도 1년 안이면 다음 쪽)
  const items = [];
  for (let p = 1; p <= 3; p++) {
    const { total, items: page } = parseList(await get(listUrl(p)));
    if (total > 0 && p === 1 && !page.length) throw new Error(`재단 목록에 ${total}건이 있다는데 항목을 하나도 못 읽음 — 마크업이 바뀐 듯`);
    if (page.some((it) => !it.seq)) throw new Error('재단 목록에서 seq 없는 항목 — 마크업이 바뀐 듯');
    items.push(...page);
    const undated = page.filter((it) => !it.start).length;
    if (undated > page.length * 0.3) throw new Error(`재단 목록 날짜를 못 읽은 항목이 많음 (${undated}/${page.length})`);
    const oldest = page.map((it) => it.end || it.start).filter(Boolean).sort()[0];
    if (page.length < LIST_SIZE || p * LIST_SIZE >= total || !oldest || oldest < addDays(today, -365)) break;
  }
  // 2) 다른 수집기가 맡는 시설 탭
  const other = new Set();
  for (const gb2 of Object.keys(OTHER_TABS)) for (const it of parseList(await get(listUrl(1, gb2))).items) other.add(it.seq);
  const cands = items.filter((it) => !other.has(it.seq) && (it.end || it.start) >= slack && (!it.start || it.start <= until));

  // 3) 재단 상세
  const programs = [];
  const facilities = FACILITIES.map((f) => ({ ...f }));
  const facilityOf = (place) => {
    const p = String(place || '').trim();
    if (!p) return null;
    const known = facilities.find((f) => p.replace(/\s+/g, '').startsWith(f.name.replace(/\s+/g, '')));
    if (known) return known.name;
    facilities.push({ name: p, address: null, area: null, url: null });
    return p;
  };
  let details = 0;
  const fromFoundation = [];
  for (const it of cands) {
    if (Date.now() - t0 > DEADLINE) throw new Error('시간 상한(170초)을 넘김');
    const v = parseView(await get(viewUrl(it.seq, it.gubun)));
    details++;
    const when = dates(v.f['기간']);
    const target = blank(v.f['대상']);
    const tags = ageTags(target, +(when.start || today).slice(0, 4));
    if (!inWindow(when.start, when.end) || !isKidTarget(target, tags)) continue;
    const L = labels(v.lines);
    // 요금: 표의 기본비용("0 원"도 적힌 값) → 없으면 본문 "참가비:" 줄
    const base = blank(v.f['기본비용']);
    const extra = blank(v.f['부가비용']);
    const won = /^([\d,]+)\s*원/.exec(base || '');
    const money = won ? { fee: +won[1].replace(/,/g, ''), feeText: extra ? `${base} (부가비용 ${extra})` : base } : feeOf(base || L.fee);
    const cap = /(\d+)\s*명/.exec(v.f['모집인원'] || '');
    const apply = dates(v.f['접수기간']);
    fromFoundation.push({
      title: v.title || it.title,
      facility: facilityOf(v.f['장소']),
      category: blank(v.f['구분']) || GUBUN[it.gubun] || null,
      target,
      ageTags: tags,
      programStart: when.start,
      programEnd: when.end,
      schedule: blank(v.f['시간']),
      sessions: sessionsOf(v.lines.join('\n'), when.start, when.end),
      applyStart: apply.start,
      applyEnd: apply.end,
      applyMethod: L.method,
      capacity: cap ? +cap[1] : null,
      applied: null,
      fee: money.fee,
      feeText: money.feeText,
      statusText: null,
      url: viewUrl(it.seq, it.gubun),
      description: describe(v.lines, v.title)
    });
  }

  // 4) 평화문화진지 누리집
  const seen = new Map();
  const fromBunker = [];
  let cbPosts = 0;
  for (const cat of CB_CATS) {
    const posts = parseCbList(await get(`${CB}/archives/tax_program/${cat}`));
    if (!posts.length) throw new Error(`평화문화진지 ${cat} 목록에 글이 없음 — 마크업이 바뀐 듯`);
    let stale = 0;
    for (const post of posts) {
      if (stale >= CB_STOP || Date.now() - t0 > DEADLINE || requests >= MAX_REQUESTS - 2) break;
      let prog = seen.get(post.url);
      if (prog === undefined) {
        const v = parseCbView(await get(post.url));
        cbPosts++;
        prog = cbProgram(post.url, v, CB_CATEGORY[cat]);
        seen.set(post.url, prog);
        if (inWindow(prog.programStart, prog.programEnd) && isKidTarget(prog.target, prog.ageTags)) fromBunker.push(prog);
      }
      const last = prog.programEnd || prog.programStart;
      stale = last && last >= today ? 0 : stale + 1;
    }
  }

  // 5) 같은 프로그램이 재단 목록과 평화문화진지 양쪽에 있으면 평화문화진지 글을 남긴다
  const words = (s) => new Set((String(s).match(/[가-힣A-Za-z0-9]{2,}/g) || []).filter((w) => !/^(?:교육|공연|행사|전시|체험|모집|안내|참여자|프로그램|평화문화진지|20\d\d년?)$/.test(w)));
  const same = (a, b) => {
    if (a.programStart !== b.programStart) return false;
    const A = words(a.title), B = words(b.title);
    const common = [...A].filter((w) => B.has(w)).length;
    return common >= Math.max(1, Math.min(A.size, B.size) * 0.5);
  };
  for (const p of fromFoundation) if (!(p.facility === '평화문화진지' && fromBunker.some((q) => same(p, q)))) programs.push(p);
  programs.push(...fromBunker);

  const data = {
    source: 'dbfac',
    sourceName: '도봉문화재단',
    sourceUrl: BASE,
    listUrl: `${BASE}/front/supportManageReq/supportManageListPage.do`,
    collectedAt: today,
    howToCollect: HOW_TO,
    facilities,
    programs
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // 임시 파일에 다 쓴 뒤 바꿔 끼운다 (중간에 끊겨도 반쪽 파일이 남지 않게)
  fs.writeFileSync(`${out}.tmp`, JSON.stringify(data, null, 1) + '\n');
  fs.renameSync(`${out}.tmp`, out);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[dbfac] ${today} 기준 ${programs.length}건 (재단 목록 ${items.length}건 → 상세 ${details}건, 평화문화진지 글 ${cbPosts}건) 요청 ${requests}회 ${sec}초 → ${path.relative(ROOT, out)}`);
}

module.exports = { parseList, parseView, parseCbList, parseCbView, cbProgram, labels, dates, feeOf, ageTags, isKidTarget, describe, clean, toLines };

if (require.main === module) {
  main().catch((e) => { console.error(`[dbfac] 실패: ${e.message}`); process.exit(1); });
}
