// 사용법: node scripts/collect-seoul-api.js [--out <파일>]          (인증키: 환경변수 SEOUL_API_KEY)
//         node scripts/collect-seoul-api.js --csv <OA-20497 CSV> [--out <파일>]   (인증키 없이, 내려받은 CSV로)
// 서울 열린데이터광장 "서울시 공공서비스예약 정보"에서 서울 25개 구의 아이·가족 프로그램 원문 행을 모아
// data/raw/seoul-api.json 에 저장한다 (화면용으로 바꾸는 건 scripts/build-regions.js·build-data.js).
//  - API: 문화체험 ListPublicReservationCulture, 교육강좌 ListPublicReservationEducation (한 번에 1000건)
//  - 인증키: data.seoul.go.kr → 인증키 신청(무료). GitHub에서는 저장소 Secrets의 SEOUL_API_KEY
//  - 서울시 공공서비스예약 웹사이트는 자동 접속을 막아 두었으므로 사이트를 긁지 않고 이 공식 자료만 쓴다
//  - 실패하면 파일을 쓰지 않고 종료 코드 1 → 이전 자료를 그대로 쓴다
const fs = require('fs');
const path = require('path');
const { ROOT, kstToday } = require('./lib/common');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : null; };
const OUT = arg('out') || path.join(ROOT, 'data', 'raw', 'seoul-api.json');
const CSV = arg('csv');
const KEY = (process.env.SEOUL_API_KEY || '').trim(); // 붙여 넣을 때 섞인 앞뒤 공백·줄바꿈은 뗀다
const SERVICES = ['ListPublicReservationCulture', 'ListPublicReservationEducation'];
const PAGE = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 대상 문구로 아이·가족 프로그램만 고른다 (원문 대상 문구는 그대로 남긴다)
const KID_WORDS = /어린이|아동|유아|영아|초등|가족|아이|자녀|개월|미취학|유치원|어린이집|보호자\s*동반/;
const FIELDS = ['SVCID', 'MAXCLASSNM', 'MINCLASSNM', 'SVCSTATNM', 'SVCNM', 'PAYATNM', 'PLACENM', 'USETGTINFO', 'SVCURL', 'X', 'Y',
  'SVCOPNBGNDT', 'SVCOPNENDDT', 'RCPTBGNDT', 'RCPTENDDT', 'AREANM', 'IMGURL', 'DTLCONT', 'TELNO', 'V_MIN', 'V_MAX'];
// CSV 열 이름 → API 항목 이름 (CSV에는 상세 설명이 없다)
const CSV_COLS = { 서비스ID: 'SVCID', 대분류명: 'MAXCLASSNM', 소분류명: 'MINCLASSNM', 서비스상태: 'SVCSTATNM', 서비스명: 'SVCNM', 결제방법: 'PAYATNM',
  장소명: 'PLACENM', 서비스대상: 'USETGTINFO', 바로가기URL: 'SVCURL', 장소X좌표: 'X', 장소Y좌표: 'Y', 서비스개시시작일시: 'SVCOPNBGNDT',
  서비스개시종료일시: 'SVCOPNENDDT', 접수시작일시: 'RCPTBGNDT', 접수종료일시: 'RCPTENDDT', 지역명: 'AREANM', 이미지주소: 'IMGURL',
  연락처: 'TELNO', 서비스이용시작시간: 'V_MIN', 서비스이용종료시간: 'V_MAX' };

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

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length >= head.length).map((r) => Object.fromEntries(head.map((h, i) => [CSV_COLS[h] || h, (r[i] || '').trim()])));
}

async function fromApi() {
  if (!KEY) throw new Error('인증키가 없어요 (환경변수 SEOUL_API_KEY)');
  const rows = [];
  for (const svc of SERVICES) {
    for (let start = 1; ; start += PAGE) {
      const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(KEY)}/json/${svc}/${start}/${start + PAGE - 1}/`;
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`${svc} HTTP ${res.status}`);
      // 오류(인증키가 틀림 등)는 json을 달라고 해도 XML로 온다: <RESULT><CODE>INFO-100</CODE><MESSAGE>…</MESSAGE></RESULT>
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        const code = (text.match(/<CODE>([^<]*)<\/CODE>/) || [])[1] || '?';
        const msg = (text.match(/<MESSAGE><!\[CDATA\[([\s\S]*?)\]\]><\/MESSAGE>/) || text.match(/<MESSAGE>([^<]*)<\/MESSAGE>/) || [])[1] || text.slice(0, 120);
        throw new Error(`${svc} ${code} ${msg.trim()}`);
      }
      const json = JSON.parse(text);
      const body = json[svc];
      if (!body || !Array.isArray(body.row)) throw new Error(`${svc} ${JSON.stringify(json.RESULT || json).slice(0, 200)}`);
      rows.push(...body.row);
      console.log(`${svc} ${start}~${start + body.row.length - 1} / ${body.list_total_count}`);
      if (start + PAGE > body.list_total_count) break;
      await sleep(500);
    }
  }
  return rows;
}

function fromCsv(file) {
  const buf = fs.readFileSync(file);
  const text = (() => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('euc-kr').decode(buf); } })();
  return parseCSV(text.replace(/^﻿/, '')).filter((r) => ['교육강좌', '문화체험'].includes(r.MAXCLASSNM));
}

(async () => {
  const all = CSV ? fromCsv(CSV) : await fromApi();
  // 이상한 응답(행이 너무 적음)이면 이전 자료를 지키려고 실패로 끝낸다
  if (all.length < 200) throw new Error(`받은 행이 ${all.length}건뿐이에요`);
  const seen = new Set();
  const rows = [];
  for (const r of all) {
    if (!KID_WORDS.test(r.USETGTINFO || '') || seen.has(r.SVCID)) continue;
    seen.add(r.SVCID);
    const row = Object.fromEntries(FIELDS.map((k) => [k, typeof r[k] === 'string' ? r[k].trim() : r[k] ?? '']));
    row.DTLCONT = summary(r.DTLCONT);
    rows.push(row);
  }
  const out = {
    source: 'seoul-api',
    sourceName: '서울시 공공서비스예약 (서울 열린데이터광장)',
    sourceUrl: 'https://yeyak.seoul.go.kr',
    dataUrl: 'https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do',
    method: CSV ? 'csv' : 'api',
    collectedAt: CSV ? new Date(fs.statSync(CSV).mtime.getTime() + 9 * 3600e3).toISOString().slice(0, 10) : kstToday(),
    total: all.length,
    rows
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`전체 ${all.length}건 중 아이·가족 ${rows.length}건 → ${path.relative(ROOT, OUT)}`);
})().catch((e) => { console.error('공공서비스예약 수집 실패:', e.message); process.exit(1); });
