// 사용법: node scripts/lookup-areas.js <Edge 또는 Chrome 실행 파일 경로>
// 기관 수집 결과(data/raw/*.json, data/raw/<구 코드>/*.json)의 시설 중 동(area)이 비어 있는 곳을
// 주소정보누리집(juso.go.kr)에서 찾아 도로명주소 괄호 속 법정동과 지번 주소를 data/raw/areas.lookup.json에 저장한다.
// 시설 주소는 잘 바뀌지 않으므로 새 시설이 생겼을 때만 손으로 돌린다 (자동 갱신에서는 저장된 결과만 쓴다).
// (playwright-core 필요: npm i -D playwright-core)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(RAW, 'areas.lookup.json');
global.window = {};
require(path.join(ROOT, 'data', 'geo.js'));
const GU_OF = Object.fromEntries(window.KIDS_GEO.seoul.gu.map((g) => [g.code, g.name]));

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { results: [] };
const done = new Map(prev.results.map((r) => [r.address, r]));

// 처음 모은 도봉구 자료는 data/raw/ 바로 아래, 자동 수집은 data/raw/<구 코드>/
const files = [
  ...fs.readdirSync(RAW).filter((f) => f.endsWith('.json') && !f.endsWith('.lookup.json') && f !== 'seoul-api.json').map((f) => ({ file: path.join(RAW, f), gu: '도봉구' })),
  ...fs.readdirSync(RAW).filter((d) => GU_OF[d] && fs.statSync(path.join(RAW, d)).isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(RAW, d)).filter((f) => f.endsWith('.json')).map((f) => ({ file: path.join(RAW, d, f), gu: GU_OF[d] })))
];
const targets = [];
files.forEach(({ file, gu }) => {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  (raw.facilities || []).forEach((f) => {
    const known = done.get(f.address);
    if (!f.area && f.address && f.address.includes(gu) && !(known && known.area) && !targets.some((t) => t.address === f.address)) targets.push({ name: f.name, address: f.address, gu });
  });
});

// 검색어: 우편번호·층수·괄호 뒤 설명을 떼고 "<구> 도로명 번호"만 남김
const keywordOf = (addr, gu) => {
  const m = addr.replace(/\s+/g, ' ').match(/([가-힣0-9]+(?:로|길)(?:\s?\d+[가-힣]?길)?)\s?(\d+(?:-\d+)?)/);
  return m ? `${gu} ${m[1].replace(/\s/g, '')} ${m[2]}` : null;
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[2] });
  const page = await browser.newPage();
  for (const t of targets) {
    const kw = keywordOf(t.address, t.gu);
    const result = { name: t.name, address: t.address, gu: t.gu, keyword: kw, roadAddress: null, jibun: null, area: null };
    if (kw) {
      await page.goto('https://www.juso.go.kr/', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      const input = page.locator('input[type="text"], input[type="search"]').first();
      await input.fill(kw);
      await input.press('Enter');
      await page.waitForTimeout(3000);
      const lines = (await page.evaluate(() => document.body.innerText)).split('\n').map((s) => s.trim()).filter(Boolean);
      const total = lines.find((s) => /검색결과 총 \d+건/.test(s)) || '';
      // 결과가 여러 건이면 "<구> <도로명> <번호>"가 정확히 같은 것만 고른다
      const [, road, no] = kw.split(' ');
      const exact = new RegExp(`${t.gu} ${road} ${no}(?: \\(|$)`);
      const hits = [];
      lines.forEach((s, i) => {
        if (s === '도로명주소' && exact.test(lines[i + 1] || '')) {
          const ji = lines.indexOf('지번', i);
          hits.push({ road: lines[i + 1], jibun: ji > -1 ? lines[ji + 1] : null });
        }
      });
      if (hits.length === 1) {
        result.roadAddress = hits[0].road;
        result.jibun = hits[0].jibun;
        // 법정동 (예: 창동, 상계동) — 구별 지도 권역 이름과 같다
        const m = (result.roadAddress.match(/\(([가-힣]+동)[,)]/) || [])[1] || ((result.jibun || '').match(new RegExp(`${t.gu} ([가-힣]+동) `)) || [])[1];
        result.area = m || null;
      } else {
        result.note = `${total} 정확히 일치 ${hits.length}건`;
      }
    }
    done.set(t.address, result);
    console.log(t.gu, t.name, '|', kw, '=>', result.roadAddress || result.note, '|', result.area);
    await page.waitForTimeout(1000);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ source: '주소정보누리집 (https://www.juso.go.kr) 도로명주소 검색', checkedAt: new Date().toISOString().slice(0, 10), results: [...done.values()] }, null, 1));
})();
