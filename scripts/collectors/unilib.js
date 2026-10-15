// 사용법: node scripts/collectors/unilib.js [--out <파일>] [--today YYYY-MM-DD] [--prev <지난 결과>] [--full]
// 도봉구통합도서관(unilib.dobong.kr)의 독서문화프로그램(edusat)·문화교실(edusat2)에서
// 아이·가족 대상 프로그램을 모아 data/raw/11100/unilib.json 에 쓴다.
//  - 서버가 그린 HTML(UTF-8)을 로그인·쿠키 없이 GET으로만 읽는다. robots.txt는 매번 먼저 확인
//  - 도서관별 목록(20건씩)에서 날짜·대상으로 먼저 거르고, 남은 것만 상세를 읽는다
//  - 지난 결과(기본: --out에서 .tmp를 뗀 파일 → data/raw/11100/unilib.json)와 목록 값이 같은 프로그램은
//    상세를 다시 읽지 않는다 (--full이면 모두 읽음)
//  - 화면 구조가 바뀌었거나 접속이 안 되면 파일을 쓰지 않고 exit 1
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'raw', '11100', 'unilib.json');
const BASE = 'https://www.unilib.dobong.kr';
const UA = 'MoaNolja/1.0 (+https://dudrud0642-beep.github.io/kids_program_portfolio/)';
const TIMEOUT = 20000;
const GAP = 1000; // 요청 사이 최소 1초
const MAX_REQUESTS = 120;
const DEADLINE = 170e3; // 3분 안에 끝낸다 (넘으면 남은 상세는 목록 값만 쓴다)
const WINDOW_DAYS = 90;
const MIN_PAGES = 2; // 도서관마다 최소 두 쪽은 본다
const MAX_PAGES = 8;

// 목록 sh_ct_idx 코드 (화면 순서). 8=공립작은도서관(“공립작은도서관 > 이름”), 77=통합사업(장소는 강의실 칸)
const LIBS = [
  { ct: 2, name: '도봉문화정보도서관', edusat2: true },
  { ct: 3, name: '도봉아이나라도서관', edusat2: true },
  { ct: 4, name: '학마을도서관' },
  { ct: 5, name: '도봉기적의도서관' },
  { ct: 76, name: '쌍문채움도서관' },
  { ct: 84, name: '원당마을한옥도서관' },
  { ct: 7, name: '둘리도서관' },
  { ct: 83, name: '김근태기념도서관' },
  { ct: 8, name: '공립작은도서관' },
  { ct: 77, name: '통합사업' }
];
const SYSTEMS = { edusat: '독서문화프로그램', edusat2: '문화교실' };

// 시설 주소: 찾아오시는길(/contents.do?idx=450…485), 작은도서관 안내(/contents.do?idx=398…416),
// 도봉구청 야외도서관은 프로그램 본문의 "(마들로 656 도봉구청)" 표기
const FACILITIES = [
  { name: '도봉문화정보도서관', address: '(01485) 서울시 도봉구 덕릉로 315', area: null, url: `${BASE}/contents.do?idx=450` },
  { name: '도봉아이나라도서관', address: '(01411) 서울 도봉구 노해로 69길 151', area: null, url: `${BASE}/contents.do?idx=455` },
  { name: '학마을도서관', address: '(01359) 서울 도봉구 시루봉로 128', area: null, url: `${BASE}/contents.do?idx=460` },
  { name: '도봉기적의도서관', address: '(01320) 서울 도봉구 마들로 797', area: null, url: `${BASE}/contents.do?idx=465` },
  { name: '쌍문채움도서관', address: '(01450) 서울 도봉구 우이천로 340', area: null, url: `${BASE}/contents.do?idx=470` },
  { name: '원당마을한옥도서관', address: '(01360) 서울 도봉구 해등로32가길 17', area: null, url: `${BASE}/contents.do?idx=475` },
  { name: '둘리도서관', address: '(01376) 서울 도봉구 시루봉로1길 6', area: null, url: `${BASE}/contents.do?idx=480` },
  { name: '김근태기념도서관', address: '(01301) 서울 도봉구 도봉산길 14', area: null, url: `${BASE}/contents.do?idx=485` },
  { name: '무수골도서관', address: '(01305) 서울 도봉구 도봉로175길 10, 3층', area: null, url: `${BASE}/contents.do?idx=400` },
  { name: '도봉구청 야외도서관', address: '마들로 656 도봉구청', area: null, url: null }
];

const HOW_TO = [
  '[1] 독서문화프로그램: 목록 GET https://www.unilib.dobong.kr/edusat/list.do?v_page={n}&sh_ct_idx={도서관}&v_search=&v_keyword=&sh_edu_gubun=&sh_target_code=&sh_status= (서버 렌더링 HTML, UTF-8, 쪽당 20건, 대체로 등록 순 최신부터). sh_ct_idx: 2 도봉문화정보도서관, 3 도봉아이나라도서관, 4 학마을도서관, 5 도봉기적의도서관, 76 쌍문채움도서관, 84 원당마을한옥도서관, 7 둘리도서관, 83 김근태기념도서관, 8 공립작은도서관(목록 표기 "공립작은도서관 > 작은도서관명"), 77 통합사업(장소는 상세의 강의실 칸). sh_ct_idx를 비우면 2번과 같은 결과라 도서관마다 따로 읽는다. 목록 항목(div.lesson li): p.cate(도서관), p.tit a(제목, view.do?edu_idx=), div.sm_box의 dt/dd(접수기간·운영기간·수강대상·모집인원), div.btn_box의 a/span.btn_sm(상태, 상세가 없을 때만 씀).',
  '[2] 쪽 넘기기: 도서관마다 최소 2쪽, 그 뒤로는 운영 중인(운영기간 끝 ≥ 오늘) 항목이 하나도 없는 쪽이 나오면 멈춘다(최대 8쪽). 1년짜리 동아리처럼 오래전에 올린 장기 프로그램은 대개 다른 운영 중 항목들 사이에 있어 이 규칙으로 잡힌다. sh_target_code(대상 구분)는 도서관마다 다르게 붙여 믿을 수 없어 쓰지 않는다.',
  '[3] 상세: GET /edusat/view.do?edu_idx={id} — div.table_bview 안 div.title(제목 + a/span.btn_sm 상태: 접수준비/접수중/대기접수/접수마감/기간종료/확인불가/방문접수 등), dl의 dt/dd: 강좌기간(programStart~End), 강좌시간(schedule 그대로), 접수기간(applyStart~End, 시각은 버림), 수강대상(target), 모집인원("{신청} / {정원} (선착순)" 또는 "{정원} 명 (방문접수)"; 괄호 안을 applyMethod로), 강의실, 참가비("무료"→0, "15,000원"→15000, 빈칸→null), 강사. 본문 div.content는 포스터 이미지가 많아 글자 줄만 쓴다: "[프로그램 소개]" 같은 소개 머리가 있으면 그 아래 문단, 없으면 일시·장소·문의·신청 안내를 뺀 첫 문단(300자 이내). sessions는 본문의 "총 N회/회차/차시" 또는 "N차시"(여러 날짜에 걸친 프로그램만).',
  '[4] 문화교실(유료 강좌, 도봉문화정보도서관 2·도봉아이나라도서관 3만): 목록 /edusat2/list.do?v_page={n}&sh_ct_idx={2|3}, 상세 /edusat2/view.do?edu_idx={id}. 마크업은 같고 강좌기간 칸에 시간이 붙어 있으며 모집인원 dd가 닫히지 않는다(</dl>까지 읽음).',
  '[4-1] 요청 줄이기: 목록의 제목·운영기간·접수기간·수강대상·정원·방식이 지난 결과 파일과 같으면 상세에만 있는 값(참가비·소개·회차·강의실·강좌시간)은 지난 값을 쓰고, 신청 인원(모집인원의 앞 숫자)과 상태는 목록에서 새로 읽는다. 목록과 상세의 상태·인원 표기는 같다(2026-10-15에 50건 비교). 첫 후보 하나는 늘 상세를 읽어 상세 화면 구조를 확인한다. 첫 수집(지난 파일 없음) 때는 약 95회, 그 뒤로는 새 글 수만큼만 상세를 읽는다.',
  '[5] 고르는 기준: 수강대상 글자에 아이·가족 대상이 드러난 것만(어린이·아동·유아·초등·N세·N개월·가족·보호자 등). "성인", "누구나", "12세 이상 관람가", 청소년만 대상은 뺀다. 대상 칸이 비어 있으면(예: 북스타트 택배서비스) 뺀다. 운영기간 끝 ≥ 오늘이고 시작이 오늘+90일 이내인 것. 개수 제한 없음. 같은 행사가 회차별로 따로 올라오면 회차마다 한 건.',
  '[6] ageTags는 수강대상 글자에서만: 영아·N개월(36개월 미만)·0~2세 infant, 유아·미취학·3~7세·36개월 이상 preschool, 초등 1~3학년·8~10세 elem-low, 초등 4~6학년·11~13세 elem-high, "초등학생"은 둘 다, "N세 이상"은 위로 초등까지(12세 이상은 일반 관람 등급으로 보고 뺌), 범위("7세~초등 2학년", "19개월~초등 1학년")는 사이 단계 모두, 출생연도("2020~2021년생")는 다른 단서가 없을 때만 나이로 환산. 가족·보호자·양육자·부모 동반은 family. "자녀를 둔 부모", "~양육자"처럼 어른만 참여하는 것은 parent 하나만. "어린이"만 적힌 경우는 태그 없이 둔다.',
  '[7] facility: 목록 p.cate의 도서관 이름. 작은도서관은 ">" 뒤 이름을 쓰고, 처음 보는 작은도서관이면 /contents.do?idx=394 메뉴에서 안내 페이지를 찾아 "주소" 칸을 읽는다. 통합사업은 강의실 칸(예: 도봉구청 야외도서관). 주소에 동 이름이 없어 area는 모두 null. 사이트 날짜는 모두 연도가 붙은 YYYY-MM-DD라 연도 보정 없음(없는 날짜 "2026-04-31" 같은 값은 null).'
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
// 진짜 HTML 태그만 지운다 — 제목 속 "<오싹오싹 …>", "<7회차: …>" 같은 꺾쇠 글자는 남긴다
const BLOCK = 'p|div|br|li|ul|ol|dl|dt|dd|tr|td|th|table|tbody|thead|h[1-6]|hr|section|article|blockquote|pre|center|figure|figcaption|caption';
const INLINE = 'a|abbr|b|i|u|s|em|strong|span|font|small|big|sub|sup|mark|del|ins|strike|label|img|wbr|o:p|input|button|iframe|colgroup|col|meta|link';
const BLOCK_RE = new RegExp(`<\\/?(?:${BLOCK})(?=[\\s/>])[^>]*>`, 'gi');
const INLINE_RE = new RegExp(`<\\/?(?:${INLINE})(?=[\\s/>])[^>]*>`, 'gi');
const dropJunk = (s) => String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
// 한 줄 글자: 블록 태그는 띄어 쓰고, 단어 안 인라인 태그는 붙여서 지운다
const clean = (s) => decode(dropJunk(s).replace(BLOCK_RE, ' ').replace(INLINE_RE, '')).replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim();
// 본문을 줄 단위로
const toLines = (s) => decode(dropJunk(s).replace(/<(?:br|\/p|\/div|\/li|\/h\d|\/tr|\/dd|\/dt)\b[^>]*>/gi, '\n').replace(BLOCK_RE, '\n').replace(INLINE_RE, ''))
  .replace(/[\u200b\ufeff]/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

/* ---------- 날짜 ---------- */
const validDate = (y, m, d) => { const t = new Date(Date.UTC(+y, +m - 1, +d)); return t.getUTCFullYear() === +y && t.getUTCMonth() === +m - 1 && t.getUTCDate() === +d; };
const ymd = (s) => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m && validDate(m[1], m[2], m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null; };
// "2026-10-07 10:00 ~ 2026-10-23 17:59" → [시작, 끝]
function range(s) {
  // 시작 날짜는 칸 맨 앞에 있어야 한다 (앞이 깨졌는데 끝 날짜를 시작으로 잘못 읽지 않게)
  const m = /^\s*(\d{4}-\d{2}-\d{2})(?:[^~]*~\s*(\d{4}-\d{2}-\d{2}))?/.exec(s || '');
  return { start: m ? ymd(m[1]) : null, end: m && m[2] ? ymd(m[2]) : null };
}
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/* ---------- 대상 → ageTags ---------- */
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
  // 표기 맞추기: "3~4학년" → "3학년~4학년", "7-10세" → "7세~10세", "2020~2021년생" → "2020년생~2021년생", "1,2학년"
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
    if (prev && prev.end > k.at) continue; // 겹친 표기(예: "초등 3학년"의 초등)
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
// 아이·가족 대상인지 (대상 글자만 본다)
const isKidTarget = (target, tags) => tags.length > 0 || KID_WORD.test(String(target || '').replace(/\d+\s*세\s*이상\s*관람가/, ''));

/* ---------- 본문 → 소개글·회차 ---------- */
// 소개 머리("[프로그램 소개]", "공연소개") — 그 아래 문단을 쓴다
const INTRO = /^[\[【<]?\s*(?:프로그램|공연|강연|행사|강좌|교육|전시|체험|작품)\s*소개\s*[\]】>]?\s*[:：]?\s*$/;
// "● 내용: …" 줄은 머리만 떼고 쓴다
const CONTENT_LABEL = /^(?:프로그램\s*)?(?:내용|소개)\s*[:：]\s*/;
// 항목 머리 줄: "[일시] …", "【잔여 회차 안내】", "장소 : …", "- 대 상: …"
const LABEL = /^[\[【][^\]】]{1,20}[\]】]|^[가-힣 ]{1,8}\s*[:：]/;
// 신청·문의·운영 안내 줄 (소개글로 쓰지 않는다)
const NOTICE = /문의|☎|\d{2,4}\s*[-)]\s*\d{3,4}\s*-\s*\d{4}|신청|접수|추가\s*모집|모집\s*(?:기간|인원|대상|일정|방법)|\d+\s*명\s*모집|아이디|비고|주차|취소|노쇼|페널티|불참|대기자|선착순|유의|안내사항|감면|결석|폐강|촬영|홍보|준비물|인증|회원|새로고침|전화번호|신분증|증빙|서류|지참|수령|수강료|참가비|재료비|교재비|변경될\s*수|변경되었|변경됩니다|지원을\s*받아|주최|주관|후원/;
// 줄 앞 글머리표·이모지 ("- ", "★", "1. ", "ㅇ ", "🎫 ")
const BULLET = /^(?:[-–—•·○●◎◆◇■□▶▷☞※*★☆♥♡◈▣▪✔✅✨\p{Extended_Pictographic}\p{Mn}\p{Me}\p{Cf}]+\s*|\d{1,2}[.)]\s+|ㅇ\s+)+/u;
const TAIL = /[\s\p{Extended_Pictographic}\p{Mn}\p{Me}\p{Cf}]+$/u;
const ENDS = /(?:[.!?~]|[다요죠네까])[\s!.~♥♡★☆)」』"'’”]*$/;
// 문장 중간에서 줄이 바뀐 곳(쉼표·"-는/-고/-며" 등으로 끝남)은 다음 줄과 붙인다
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
function describe(html, title) {
  const lines = sentences(toLines(html));
  const norm = (s) => s.replace(/[^가-힣A-Za-z0-9]/g, '');
  const tnorm = norm(title || '');
  const kind = (l) => { const m = BULLET.exec(l); return m ? (/\d/.test(m[0]) ? 'num' : [...m[0].trim()][0] || '') : ''; };
  const body = (l) => l.replace(BULLET, '').replace(CONTENT_LABEL, '').replace(TAIL, '').trim();
  const good = (l) => {
    if (/^[※*]/.test(l)) return false; // 참고 줄
    const s = body(l);
    if (s.length < 12 || /^[*=\-_~]{3,}/.test(s)) return false;
    if (/^[(\[【<「『][^)\]】>」』]*[)\]】>」』]$/.test(s)) return false; // 괄호로 둘러싼 머리·대상 되풀이
    if (!CONTENT_LABEL.test(l.replace(BULLET, '')) && LABEL.test(s)) return false;
    if (NOTICE.test(s)) return false;
    if (/\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}:\d{2}|오[전후]\s*\d{1,2}\s*시|^\d{1,2}\s*[/.]\s*\d{1,2}|^\d{4}\s*[.년]/.test(s)) return false; // 날짜·시간 줄
    const n = norm(s);
    if (tnorm && (tnorm.includes(n) || n.includes(tnorm))) return false; // 제목 되풀이
    return /[가-힣]{2}/.test(s);
  };
  // 같은 글머리표로 이어진 좋은 줄들을 한 문단으로
  const paras = [];
  let cur = null;
  lines.forEach((l, i) => {
    if (!good(l)) { cur = null; return; }
    if (!cur || cur.kind !== kind(l)) paras.push((cur = { kind: kind(l), at: i, lines: [] }));
    cur.lines.push(body(l));
  });
  const intro = lines.findIndex((l) => INTRO.test(l.replace(BULLET, '')));
  const done = (p) => ENDS.test(p.lines[p.lines.length - 1]) && !(p.lines.length === 1 && /\?[\s★☆!~]*$/.test(p.lines[0])); // 물음 한 줄짜리 머리는 건너뜀
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
// "총 5회", "총 12회차", "6차시" (하루짜리는 회차를 세지 않는다)
function sessionsOf(text, start, end) {
  if (!start || !end || start === end) return null;
  const t = String(text || '');
  const m = /총\s*(\d{1,2})\s*(?:회차|회|차시|강)(?![가-힣]*\s*(?:이상|결석))/.exec(t) || /(?:^|[\s,(/])(\d{1,2})\s*차시(?=\s*(?:강의|프로그램|과정|수업|$)|[),.\s]*$|\s*\/)/m.exec(t);
  const n = m ? +m[1] : null;
  return n && n > 1 && n <= 60 ? n : null;
}

/* ---------- 목록 한 쪽 ---------- */
function parseList(html) {
  const total = /<div class="board_total_left">[\s\S]*?<strong>\s*([\d,]+)\s*<\/strong>/.exec(html);
  const start = html.indexOf('<div class="lesson">');
  if (!total || start < 0) throw new Error('목록 영역(div.board_total / div.lesson)을 찾지 못함 — 화면 구조가 바뀐 듯');
  const stop = html.indexOf('<div class="board_paginate', start);
  const body = html.slice(start, stop > start ? stop : undefined);
  const items = body.split(/<li>(?=\s*<div class="(?:pro_img|cont)">)/).slice(1).map((li) => {
    const id = (/view\.do\?edu_idx=(\d+)/.exec(li) || [])[1] || null;
    const dl = {};
    for (const m of li.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) dl[clean(m[1])] = clean(m[2]);
    const btn = [...li.matchAll(/<(a|span)\b[^>]*class=["']btn_sm ([a-z_]+)["'][^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({ cls: m[2], text: clean(m[3]) }))
      .filter((b) => b.cls !== 'btn_check' && b.text !== '확인불가');
    return {
      id,
      cate: clean((/<p class="cate"[^>]*>([\s\S]*?)<\/p>/.exec(li) || [])[1]),
      title: clean((/<p class="tit">\s*<a\b[^>]*>([\s\S]*?)<\/a>/.exec(li) || [])[1]),
      apply: range(dl['접수기간']),
      run: range(dl['운영기간']),
      runText: dl['운영기간'] || '',
      target: dl['수강대상'] || '',
      recruit: dl['모집인원'] || '',
      status: btn.length ? btn[0].text.replace(/\s+/g, '') : null // "방문<br />접수" → "방문접수"
    };
  });
  return { total: +total[1].replace(/,/g, ''), items };
}

/* ---------- 상세 ---------- */
function parseDetail(html) {
  const start = html.indexOf('<div class="table_bview">');
  if (start < 0) throw new Error('상세 영역(div.table_bview)을 찾지 못함');
  const endMark = html.indexOf('<!-- //보기 테이블 -->', start);
  const v = html.slice(start, endMark > start ? endMark : html.indexOf('<div class="board_button', start));
  const head = /<div class="title">([\s\S]*?)<\/div>/.exec(v);
  if (!head) throw new Error('상세 제목(div.title)을 찾지 못함');
  // 상태 표시는 <a class="btn_sm …"> 또는 <span class='btn_sm …'>
  const LABEL_TAG = /<(a|span)\b[^>]*class=["']btn_sm[^"']*["'][^>]*>([\s\S]*?)<\/\1>/g;
  const label = [...head[1].matchAll(LABEL_TAG)].map((m) => clean(m[2])).filter(Boolean);
  const title = clean(head[1].replace(LABEL_TAG, ''));
  const f = {};
  for (const dl of v.split(/<dl\b[^>]*>/).slice(1)) {
    const dt = /<dt>([\s\S]*?)<\/dt>/.exec(dl);
    if (!dt) continue;
    const rest = dl.slice(dl.indexOf('</dt>') + 5);
    const dd = /<dd\b[^>]*>([\s\S]*?)(?:<\/dd>|<\/dl>|$)/.exec(rest);
    f[clean(dt[1])] = dd ? clean(dd[1]) : '';
  }
  if (!('강좌기간' in f) || !('수강대상' in f)) throw new Error('상세 항목(강좌기간·수강대상)을 찾지 못함');
  const ci = v.indexOf('<div class="content">');
  const content = ci > -1 ? v.slice(ci + 21).replace(/<\/div>\s*<\/div>\s*$/, '') : '';
  return { title, status: label[0] || null, f, content };
}

// 모집인원: "22 / 15 (선착순)", "30 명 (방문접수)", 목록은 "[선착순] 14/ 10 명"
function recruit(s) {
  const t = String(s || '');
  const method = (/\(([^)]+)\)/.exec(t) || /\[([^\]]+)\]/.exec(t) || [])[1] || null;
  const pair = /(\d+)\s*\/\s*(\d+)/.exec(t);
  if (pair) return { applied: +pair[1], capacity: +pair[2], method };
  const one = /(\d+)\s*명/.exec(t);
  return { applied: null, capacity: one ? +one[1] : null, method };
}
// 참가비: "무료" → 0, "15,000원(교구 대여비 …)" → 15000
function fee(s) {
  const t = String(s || '').trim();
  if (!t || t === '-') return { fee: null, feeText: null };
  if (/^무료/.test(t)) return { fee: 0, feeText: t };
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
async function checkRobots(paths) {
  const txt = await get(`${BASE}/robots.txt`, { allow404: true });
  if (!txt || /<html/i.test(txt)) return;
  let on = false;
  const dis = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    if (m[1].toLowerCase() === 'user-agent') on = m[2].trim() === '*' || /moanolja/i.test(m[2]);
    else if (on && m[1].toLowerCase() === 'disallow' && m[2].trim()) dis.push(m[2].trim());
  }
  const blocked = paths.filter((p) => dis.some((d) => p.startsWith(d.replace(/\*.*$/, ''))));
  if (blocked.length) throw new Error(`robots.txt가 ${blocked.join(', ')} 수집을 막고 있어 멈춤`);
}

/* ---------- 작은도서관 주소 (처음 보는 이름일 때만) ---------- */
let smallMenu = null;
async function smallLibrary(name) {
  const key = name.replace(/\s+/g, '');
  if (!smallMenu) {
    const html = await get(`${BASE}/contents.do?idx=394`);
    // 공립작은도서관 하위 메뉴(2026-10 기준 idx 398~416)만 쓴다
    smallMenu = [...html.matchAll(/href="\/contents\.do\?idx=(\d+)"[^>]*>([^<]+)<\/a>/g)]
      .map((m) => ({ idx: m[1], key: clean(m[2]).replace(/\s+/g, '') }))
      .filter((m) => +m.idx > 394 && +m.idx <= 420 && /도서관|등대|학교/.test(m.key));
  }
  const hit = smallMenu.find((m) => m.key === key) || smallMenu.find((m) => m.key.startsWith(key) || key.startsWith(m.key));
  if (!hit) return { name, address: null, area: null, url: null };
  const html = await get(`${BASE}/contents.do?idx=${hit.idx}`);
  const addr = /<dt>\s*주소\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/.exec(html);
  return { name, address: addr ? clean(addr[1]) || null : null, area: null, url: `${BASE}/contents.do?idx=${hit.idx}` };
}
// 주소를 못 읽어도 프로그램은 남긴다
const smallLibrarySafe = (name) => smallLibrary(name).catch((e) => { console.error(`[unilib] 작은도서관 주소 못 읽음: ${e.message}`); return { name, address: null, area: null, url: null }; });

/* ---------- 실행 ---------- */
async function main() {
  const t0 = Date.now();
  const out = arg('out') ? path.resolve(arg('out')) : DEFAULT_OUT;
  const today = arg('today') || kstToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today 형식이 YYYY-MM-DD가 아님: ${today}`);
  const until = addDays(today, WINDOW_DAYS);
  const year = +today.slice(0, 4);
  const inWindow = (s, e) => { const last = e || s; return !!last && last >= today && (!s || s <= until); };

  await checkRobots(['/edusat/', '/edusat2/', '/contents.do']);

  // 1) 목록: 도서관마다 쪽을 넘기며 후보를 모은다
  const cands = [];
  const seen = new Set();
  let pages = 0;
  let listed = 0;
  let badDates = 0;
  for (const [li, lib] of LIBS.entries()) {
    for (const sys of ['edusat', 'edusat2']) {
      if (sys === 'edusat2' && !lib.edusat2) continue;
      for (let p = 1; p <= MAX_PAGES; p++) {
        const qs = sys === 'edusat'
          ? `v_page=${p}&sh_ct_idx=${lib.ct}&v_search=&v_keyword=&sh_edu_gubun=&sh_target_code=&sh_status=`
          : `v_page=${p}&sh_ct_idx=${lib.ct}`;
        const { total, items } = parseList(await get(`${BASE}/${sys}/list.do?${qs}`));
        pages++;
        if (total > 0 && p === 1 && !items.length) throw new Error(`${lib.name} ${sys} 목록에 ${total}건이 있다는데 항목을 하나도 못 읽음 — 마크업이 바뀐 듯`);
        if (items.some((it) => !it.id)) throw new Error(`${lib.name} ${sys} 목록에서 edu_idx 없는 항목 — 마크업이 바뀐 듯`);
        listed += items.length;
        const undated = items.filter((it) => !it.run.start).length;
        if (undated > items.length * 0.3) throw new Error(`${lib.name} ${sys} 목록 ${p}쪽에서 운영기간 날짜를 못 읽은 항목이 많음 (${undated}/${items.length}) — 형식이 바뀐 듯`);
        badDates += undated;
        let running = 0;
        items.forEach((it, k) => {
          if ((it.run.end || it.run.start || '') >= today) running++;
          const key = `${sys}:${it.id}`;
          if (seen.has(key) || !inWindow(it.run.start, it.run.end)) return;
          if (!isKidTarget(it.target, ageTags(it.target, year))) return;
          seen.add(key);
          cands.push({ sys, lib, order: [li, sys === 'edusat' ? 0 : 1, p, k], item: it });
        });
        if (items.length < 20 || p * 20 >= total) break;
        if (p >= MIN_PAGES && !running) break;
      }
    }
  }
  if (!listed) throw new Error('목록에서 항목을 하나도 읽지 못함');
  if (badDates > listed * 0.3) throw new Error(`운영기간 날짜를 못 읽은 항목이 많음 (${badDates}/${listed}) — 형식이 바뀐 듯`);

  // 2) 상세: 남은 후보만 (요청·시간 상한에 걸리면 목록 값만 쓴다)
  cands.sort((a, b) => { for (let i = 0; i < 4; i++) if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i]; return 0; });
  const programs = [];
  const facilities = FACILITIES.map((f) => ({ ...f }));
  // 지난 결과 파일: 목록에서 보이는 값(제목·기간·대상·정원)이 그대로인 프로그램은
  // 상세에만 있는 값(요금·소개·회차·강의실)을 다시 쓰고 상세를 읽지 않는다 (--full이면 모두 다시 읽음)
  // 지난 결과: --prev, 없으면 --out에서 ".tmp"를 뗀 파일(scripts/update.js는 <파일>.tmp로 받는다), 그다음 기본 위치
  let prev = { programs: [], facilities: [] };
  const prevFile = arg('prev') ? path.resolve(arg('prev')) : [out.replace(/\.tmp$/, ''), DEFAULT_OUT].find((f) => f !== out && fs.existsSync(f)) || out;
  if (!process.argv.includes('--full') && fs.existsSync(prevFile)) {
    try { const j = JSON.parse(fs.readFileSync(prevFile, 'utf8')); if (j.source === 'unilib' && Array.isArray(j.programs)) prev = j; } catch { /* 깨진 파일은 없는 셈 친다 */ }
  }
  const prevBy = new Map(prev.programs.map((p) => [p.url, p]));
  const unchanged = (p, it, lr) => !!p && p.title === it.title && p.programStart === it.run.start && p.programEnd === it.run.end &&
    p.applyStart === it.apply.start && p.applyEnd === it.apply.end && (p.target || '') === it.target &&
    p.capacity === lr.capacity && (!lr.method || lr.method === p.applyMethod);
  const useFacility = async (name, small) => {
    const hit = facilities.find((f) => f.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
    if (hit) return hit.name;
    const old = (prev.facilities || []).find((f) => f.name === name && f.address);
    facilities.push(old ? { ...old } : small && Date.now() - t0 < DEADLINE && requests < MAX_REQUESTS - 2 ? await smallLibrarySafe(name) : { name, address: null, area: null, url: null });
    return name;
  };
  let details = 0;
  let reused = 0;
  let listOnly = 0;
  let failed = 0;
  for (const [n, c] of cands.entries()) {
    const url = `${BASE}/${c.sys}/view.do?edu_idx=${c.item.id}`;
    const lr = recruit(c.item.recruit);
    const old = prevBy.get(url);
    // 첫 후보는 늘 상세를 읽어 상세 화면 구조가 그대로인지 확인한다
    if (n > 0 && unchanged(old, c.item, lr)) {
      reused++;
      programs.push({
        ...old,
        facility: await useFacility(old.facility, c.lib.ct === 8),
        ageTags: ageTags(old.target, +(old.programStart || today).slice(0, 4)),
        applied: lr.applied,
        statusText: c.item.status || old.statusText
      });
      continue;
    }
    let d = null;
    if (requests < MAX_REQUESTS - 3 && Date.now() - t0 < DEADLINE) {
      let html = null;
      try { html = await get(url); } catch (e) {
        // 한두 건 접속 오류는 목록 값으로 두고, 많으면 멈춘다
        if (++failed > Math.max(3, cands.length * 0.2)) throw e;
        console.error(`[unilib] 상세 건너뜀: ${e.message}`);
      }
      if (html !== null) { d = parseDetail(html); details++; } else listOnly++;
    } else listOnly++;
    const it = c.item;
    const run = d ? range(d.f['강좌기간']) : it.run;
    const apply = d ? range(d.f['접수기간']) : it.apply;
    const target = (d ? d.f['수강대상'] : it.target) || null;
    const tags = ageTags(target, +(run.start || today).slice(0, 4));
    if (!inWindow(run.start, run.end) || !isKidTarget(target, tags)) continue;
    // 시설: 작은도서관은 ">" 뒤 이름, 통합사업은 강의실 칸
    let facility = it.cate.includes('>') ? it.cate.split('>').pop().trim() : it.cate || c.lib.name;
    if (c.lib.ct === 77 || facility === '공립작은도서관') facility = (d && d.f['강의실']) || facility;
    facility = await useFacility(facility, c.lib.ct === 8);
    const r = recruit(d ? d.f['모집인원'] : it.recruit);
    const money = d ? fee(d.f['참가비']) : { fee: null, feeText: null };
    const bodyText = d ? toLines(d.content).join('\n') : '';
    const schedule = d ? d.f['강좌시간'] || null : (/\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}\s*(.+)$/.exec(it.runText) || [])[1] || null;
    programs.push({
      title: (d && d.title) || it.title,
      facility,
      category: SYSTEMS[c.sys],
      target,
      ageTags: tags,
      programStart: run.start,
      programEnd: run.end,
      schedule,
      sessions: sessionsOf(`${(d && d.title) || it.title}\n${bodyText}`, run.start, run.end),
      applyStart: apply.start,
      applyEnd: apply.end,
      applyMethod: r.method,
      capacity: r.capacity,
      applied: r.applied,
      fee: money.fee,
      feeText: money.feeText,
      statusText: (d && d.status) || it.status,
      url,
      description: d ? describe(d.content, d.title) : null
    });
  }

  const data = {
    source: 'unilib',
    sourceName: '도봉구통합도서관',
    sourceUrl: BASE,
    listUrl: `${BASE}/contents.do?idx=107`,
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
  console.log(`[unilib] ${today} 기준 ${programs.length}건 (목록 ${pages}쪽 ${listed}항목 → 후보 ${cands.length}, 상세 ${details}, 지난 값 재사용 ${reused}${listOnly ? `, 상세 못 읽어 목록 값만 ${listOnly}` : ''}) 요청 ${requests}회 ${sec}초 → ${path.relative(ROOT, out)}`);
}

module.exports = { parseList, parseDetail, ageTags, isKidTarget, describe, sessionsOf, recruit, fee, clean, toLines, range };

if (require.main === module) {
  main().catch((e) => { console.error(`[unilib] 실패: ${e.message}`); process.exit(1); });
}
