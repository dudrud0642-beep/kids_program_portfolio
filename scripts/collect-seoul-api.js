// 사용법: node scripts/collect-seoul-api.js <인증키>     (또는 환경변수 SEOUL_API_KEY)
// 서울 열린데이터광장 "공공서비스예약 정보" API에서 서울 25개 구의 아이 프로그램을 받아
// data/raw/seoul-api.json 에 구별로 저장한다.
//  - 문화체험 ListPublicReservationCulture, 교육강좌 ListPublicReservationEducation
//  - 인증키: data.seoul.go.kr 회원가입 → 인증키 신청(무료). "sample" 키는 한 번에 5건까지만 받아진다
//  - 서울시 공공서비스예약 웹사이트는 자동 접속을 막아 두었으므로 사이트를 긁지 않고 이 공식 API만 쓴다
const fs = require('fs');
const path = require('path');

const KEY = process.argv[2] || process.env.SEOUL_API_KEY;
if (!KEY) { console.error('인증키가 필요해요: node scripts/collect-seoul-api.js <인증키>'); process.exit(1); }
const ROOT = path.resolve(__dirname, '..');
// 견본 키로 시험할 때는 프로젝트가 아닌 임시 폴더에 쓴다
const OUT = KEY === 'sample' ? path.join(require('os').tmpdir(), 'seoul-api.sample.json') : path.join(ROOT, 'data', 'raw', 'seoul-api.json');
const SERVICES = ['ListPublicReservationCulture', 'ListPublicReservationEducation'];
const PAGE = KEY === 'sample' ? 5 : 1000; // API 한 번에 최대 1000건
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 대상 문구로 아이·가족 프로그램만 고른다 (원문 대상 문구는 그대로 남긴다)
const KID_WORDS = /어린이|아동|유아|영아|초등|가족|아이|자녀|개월|미취학|유치원|어린이집|보호자\s*동반|(?:^|[^0-9])(?:[1-9]|1[0-3])\s*세/;
const ADULT_ONLY = /^(?:\s*)(?:성인|어르신|노인|시니어|청년|대학생|중학생|고등학생|청소년)(?:\s|\(|$)/;
function ageTags(target) {
  const t = target || '';
  const tags = new Set();
  if (/영아|\d+\s*개월|(?:^|[^0-9])[0-2]\s*세/.test(t)) tags.add('infant');
  if (/유아|미취학|유치원|어린이집|(?:^|[^0-9])[3-7]\s*세/.test(t)) tags.add('preschool');
  if (/초등|어린이|아동|(?:^|[^0-9])(?:[8-9]|1[0-3])\s*세/.test(t)) {
    if (!/고학년|[4-6]\s*학년\s*(?:이상|~)/.test(t) || /저학년|[1-3]\s*학년/.test(t)) tags.add('elem-low');
    if (!/저학년/.test(t) || /고학년|[4-6]\s*학년/.test(t)) tags.add('elem-high');
  }
  if (/가족|부모|보호자|자녀/.test(t)) tags.add('family');
  return [...tags];
}
const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const time = (s) => (typeof s === 'string' && /\d{2}:\d{2}/.test(s) ? s.slice(11, 16) : null);
// HTML 기호(&#39; &quot; &amp; …)를 글자로
const ENTITY = { nbsp: ' ', lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", middot: '·', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', rarr: '→' };
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? ' ');
const clean = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// 상세 글에서 공통 안내문(1·2번)을 빼고 "3. 상세내용"부터 앞부분만
function summary(dtl) {
  const t = clean(dtl);
  const i = t.indexOf('3. 상세내용');
  const body = (i >= 0 ? t.slice(i + 7) : t).replace(/4\.\s*주의사항.*$/, '').trim();
  return body ? body.slice(0, 300) + (body.length > 300 ? '…' : '') : null;
}

function toProgram(r) {
  const target = clean(r.USETGTINFO);
  const vmin = r.V_MIN && r.V_MIN !== '00:00' ? r.V_MIN : null;
  const vmax = r.V_MAX && r.V_MAX !== '00:00' ? r.V_MAX : null;
  const applyTime = time(r.RCPTBGNDT) && time(r.RCPTBGNDT) !== '00:00' ? `${r.RCPTBGNDT.slice(5, 10).replace('-', '/')} ${time(r.RCPTBGNDT)}부터` : null;
  return {
    svcId: r.SVCID,
    title: clean(r.SVCNM),
    facility: clean(r.PLACENM),
    category: [r.MAXCLASSNM, r.MINCLASSNM].filter(Boolean).join(' > '),
    target,
    ageTags: ageTags(target),
    programStart: day(r.SVCOPNBGNDT),
    programEnd: day(r.SVCOPNENDDT),
    schedule: vmin ? `${vmin}${vmax ? `~${vmax}` : ''}` : null,
    sessions: null,
    applyStart: day(r.RCPTBGNDT),
    applyEnd: day(r.RCPTENDDT),
    applyMethod: ['온라인 예약 (서울시 공공서비스예약)', applyTime].filter(Boolean).join(' · '),
    capacity: null,
    applied: null,
    fee: r.PAYATNM === '무료' ? 0 : null,
    feeText: r.PAYATNM || null,
    statusText: r.SVCSTATNM || null,
    url: r.SVCURL || null,
    image: r.IMGURL || null,
    tel: r.TELNO || null,
    x: Number(r.X) || null,
    y: Number(r.Y) || null,
    description: summary(r.DTLCONT)
  };
}

(async () => {
  const rows = [];
  for (const svc of SERVICES) {
    for (let start = 1; ; start += PAGE) {
      const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(KEY)}/json/${svc}/${start}/${start + PAGE - 1}/`;
      const res = await fetch(url);
      const json = await res.json();
      const body = json[svc];
      if (!body) { console.error(svc, JSON.stringify(json.RESULT || json)); break; }
      rows.push(...body.row.map((r) => ({ ...r, _svc: svc })));
      console.log(`${svc} ${start}~${start + body.row.length - 1} / ${body.list_total_count}`);
      if (KEY === 'sample' || start + PAGE > body.list_total_count) break;
      await sleep(300);
    }
  }
  const byGu = {};
  let kids = 0;
  for (const r of rows) {
    const target = (r.USETGTINFO || '').trim();
    if (!KID_WORDS.test(target) || ADULT_ONLY.test(target)) continue;
    const gu = (r.AREANM || '').trim();
    if (!/구$/.test(gu)) continue; // 서울 밖(고양시 등)·지역 없음은 뺀다
    const g = byGu[gu] || (byGu[gu] = { facilities: [], programs: [] });
    const p = toProgram(r);
    if (g.programs.some((x) => x.svcId === p.svcId)) continue;
    g.programs.push(p);
    if (p.facility && !g.facilities.some((f) => f.name === p.facility)) g.facilities.push({ name: p.facility, x: p.x, y: p.y, tel: p.tel });
    kids++;
  }
  const out = {
    source: 'seoul-api',
    sourceName: '서울시 공공서비스예약 (서울 열린데이터광장 API)',
    sourceUrl: 'https://yeyak.seoul.go.kr',
    apiUrl: 'https://data.seoul.go.kr',
    collectedAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
    total: rows.length,
    byGu
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`전체 ${rows.length}건 중 아이·가족 ${kids}건 → ${OUT}`);
  Object.entries(byGu).sort((a, b) => b[1].programs.length - a[1].programs.length)
    .forEach(([gu, g]) => console.log(`  ${gu} ${g.programs.length}건 · 장소 ${g.facilities.length}곳`));
})().catch((e) => { console.error(e.message); process.exit(1); });
