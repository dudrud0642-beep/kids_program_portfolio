// 사용법: node scripts/lookup-areas.js <Edge 또는 Chrome 실행 파일 경로>
// data/raw/*.json의 시설 중 동(area)이 비어 있는 곳을 주소정보누리집(juso.go.kr)에서 찾아
// 도로명주소 괄호 속 법정동과 지번 주소를 data/raw/areas.lookup.json에 저장한다.
// (playwright-core 필요: npm i -D playwright-core)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(RAW, 'areas.lookup.json');
const AREAS = ['쌍문동', '방학동', '창동', '도봉동'];

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { results: [] };
const done = new Map(prev.results.map((r) => [r.address, r]));

const targets = [];
fs.readdirSync(RAW).filter((f) => f.endsWith('.json') && f !== 'areas.lookup.json').forEach((file) => {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));
  (raw.facilities || []).forEach((f) => {
    const known = done.get(f.address);
    if (!f.area && f.address && !(known && known.area) && !targets.some((t) => t.address === f.address)) targets.push({ name: f.name, address: f.address });
  });
});

// 검색어: 우편번호·층수·괄호 뒤 설명을 떼고 "도봉구 도로명 번호"만 남김
const keywordOf = (addr) => {
  const m = addr.replace(/\s+/g, ' ').match(/([가-힣0-9]+(?:로|길)(?:\s?\d+[가-힣]?길)?)\s?(\d+(?:-\d+)?)/);
  return m ? `도봉구 ${m[1].replace(/\s/g, '')} ${m[2]}` : null;
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[2] });
  const page = await browser.newPage();
  for (const t of targets) {
    const kw = keywordOf(t.address);
    const result = { name: t.name, address: t.address, keyword: kw, roadAddress: null, jibun: null, area: null };
    if (kw) {
      await page.goto('https://www.juso.go.kr/', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      const input = page.locator('input[type="text"], input[type="search"]').first();
      await input.fill(kw);
      await input.press('Enter');
      await page.waitForTimeout(3000);
      const lines = (await page.evaluate(() => document.body.innerText)).split('\n').map((s) => s.trim()).filter(Boolean);
      const total = lines.find((s) => /검색결과 총 \d+건/.test(s)) || '';
      // 결과가 여러 건이면 "도봉구 <도로명> <번호>"가 정확히 같은 것만 고른다
      const [, road, no] = kw.split(' ');
      const exact = new RegExp(`도봉구 ${road} ${no}(?: \\(|$)`);
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
        const m = (result.roadAddress.match(/\(([가-힣]+동)[,)]/) || [])[1] || ((result.jibun || '').match(/도봉구 ([가-힣]+동) /) || [])[1];
        result.area = AREAS.includes(m) ? m : null;
      } else {
        result.note = `${total} 정확히 일치 ${hits.length}건`;
      }
    }
    done.set(t.address, result);
    console.log(t.name, '|', kw, '=>', result.roadAddress || result.note, '|', result.area);
    await page.waitForTimeout(1000);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ source: '주소정보누리집 (https://www.juso.go.kr) 도로명주소 검색', checkedAt: new Date().toISOString().slice(0, 10), results: [...done.values()] }, null, 1));
})();
