// 사용법: node scripts/fetch-images.js
// 프로그램 상세 페이지에서 대표 이미지(포스터) 주소를 찾아 data/raw/images.lookup.json에 저장한다.
// 이미지 위치가 확실한 출처만 다룬다.
//  - 서울시 공공서비스예약: 상단 대표 이미지 (.img_box 안 첫 이미지)
//  - 도봉구통합도서관: 본문에 올린 포스터 (/data/userfiles/…)
// 이미지는 복사해 두지 않고 원래 주소를 그대로 쓴다 (저작권은 각 기관).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(RAW, 'images.lookup.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RULES = {
  yeyak: (html) => {
    // 'img_box'는 스크립트 틀 안에도 먼저 나오므로, 실제 업로드 경로(/cmsdata/) 이미지가 든 칸만 본다
    for (const box of html.split(/class="img_box"/).slice(1)) {
      const m = box.slice(0, 600).match(/<img[^>]+src="(\/cmsdata\/[^"]+)"/);
      if (m) return m[1];
    }
    return null;
  },
  unilib: (html) => {
    const m = html.match(/<img[^>]+src="(\/data\/userfiles\/[^"]+\.(?:jpe?g|png|gif))"/i);
    return m ? m[1] : null;
  }
};

(async () => {
  const results = [];
  for (const source of Object.keys(RULES)) {
    const file = path.join(RAW, `${source}.json`);
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const p of raw.programs) {
      if (!p.url) continue;
      let image = null;
      try {
        const res = await fetch(p.url, { headers: { 'User-Agent': UA } });
        const html = await res.text();
        const src = RULES[source](html);
        if (src) image = new URL(src, p.url).href;
      } catch (e) { /* 실패하면 이미지 없이 둔다 */ }
      results.push({ source, url: p.url, title: p.title, image });
      console.log(source, image ? 'O' : '-', p.title.slice(0, 40));
      await sleep(500);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), results }, null, 1));
  console.log(`images ${results.filter((r) => r.image).length} / ${results.length}`);
})();
