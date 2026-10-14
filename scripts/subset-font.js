// 사용법: node scripts/subset-font.js   (필요 패키지: subset-font)
// 로고·제목용 글꼴(Cafe24 숑숑)에서 이 사이트가 실제로 쓰는 글자만 남겨 fonts/moa-point.woff2를 만든다.
// 원본 713KB → 수십 KB. 제목에 새 글자가 생기면 아래 TEXTS에 넣고 다시 실행한다.
// 빠진 글자가 있어도 화면은 깨지지 않고 그 글자만 기본 글꼴(Pretendard)로 보인다.
// 라이선스: Cafe24 글꼴은 수정·재배포 가능, 수정본에는 SIL OFL 1.1 적용 → fonts/OFL.txt
const fs = require('fs');
const path = require('path');
const subsetFont = require('subset-font');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/Cafe24Syongsyong.woff';
const OUT = path.join(ROOT, 'fonts', 'moa-point.woff2');

// 이 글꼴로 보이는 글자: 로고, 페이지 제목, 지역 추가 창 제목, 서울 25개 구 이름
global.window = {};
require(path.join(ROOT, 'data', 'geo.js'));
const guNames = (window.KIDS_GEO.seoul.gu || []).map((g) => g.name);
const TEXTS = [
  '모아놀자',
  '아이랑 프로그램',
  '저장한 프로그램', '이번 주 일정', '무료 프로그램', '데이터 출처',
  '지역 추가',
  ...guNames
];
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const chars = [...new Set([...TEXTS.join(''), ...ASCII])].join('');

(async () => {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`원본 글꼴을 받지 못했어요: ${res.status}`);
  const source = Buffer.from(await res.arrayBuffer());
  const subset = await subsetFont(source, chars, { targetFormat: 'woff2' });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, subset);
  const hangul = [...chars].filter((c) => /[가-힣]/.test(c)).length;
  console.log(`글자 ${[...chars].length}개 (한글 ${hangul}개) · ${(source.length / 1024).toFixed(0)}KB → ${(subset.length / 1024).toFixed(1)}KB · ${path.relative(ROOT, OUT)}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
