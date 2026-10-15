// 사용법: node scripts/update.js [--all] [--only 11100/family,11110/childcare] [--today YYYY-MM-DD]
// 매일 아침 GitHub Actions(.github/workflows/update-data.yml)가 돌리는 자동 갱신 순서
//  1) 서울시 공공서비스예약 API (매일) — 인증키는 환경변수 SEOUL_API_KEY
//  2) 기관 사이트 수집기 scripts/collectors/* (월·목, --all이면 오늘도)
//     실패한 출처는 어제 자료를 그대로 두고 실패로 기록한다
//  3) 화면용 파일 만들기: build-regions.js(24개 구 + 도봉구 공공예약 몫) → build-data.js(도봉구)
//  4) 출처별 상태를 data/status.js에 쓴다 (데이터 출처 페이지·맨 위 수집 표시에서 씀)
// 실패한 출처가 있으면 GITHUB_OUTPUT에 failed=…를 남긴다 → 워크플로가 커밋 뒤 실패로 표시해 메일이 간다
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, kstNow, kstToday, readDataFile } = require('./lib/common');

const ALL = process.argv.includes('--all') || process.env.COLLECT_ALL === '1';
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : null; };
const TODAY = arg('today') || kstToday();
const ONLY = arg('only') ? arg('only').split(',') : null; // 손으로 돌릴 때 일부 기관만
const NOW = kstNow();
const KEY = process.env.SEOUL_API_KEY || '';
const STATUS_FILE = path.join(ROOT, 'data', 'status.js');

// 기관 사이트 수집기 — 키는 data/raw/<구 코드>/<파일 이름>
const COLLECTORS = [
  { key: '11100/unilib', name: '도봉구통합도서관', script: 'unilib.js' },
  { key: '11100/dbfac', name: '도봉문화재단', script: 'dbfac.js' },
  { key: '11100/dooly', name: '둘리뮤지엄', script: 'dooly.js' },
  { key: '11100/family', name: '도봉구 가족센터', script: 'familynet.js', args: ['--center', 'dobong', '--gu', '도봉구'] },
  { key: '11110/childcare', name: '노원구육아종합지원센터', script: 'nowon-childcare.js' },
  { key: '11110/family', name: '노원구가족센터', script: 'familynet.js', args: ['--center', 'nowon', '--gu', '노원구'] }
];
// 기관 사이트는 월·목 (한국 시간) — 접수 상태는 화면에서 날짜로 매일 다시 계산되므로 주 2회로 충분
const dow = new Date(`${TODAY}T12:00:00+09:00`).getUTCDay();
const INSTITUTION_DAY = ALL || dow === 1 || dow === 4;

const prev = fs.existsSync(STATUS_FILE) ? readDataFile(STATUS_FILE) : { sources: {} };
const sources = prev.sources || {};
const failed = [];
// 오류 글에 인증키가 섞이지 않게
const tidy = (s) => String(s || '').split(KEY || '\u0000').join('***').trim().split('\n').filter(Boolean).slice(-2).join(' / ').slice(0, 300);

function run(script, args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 5 * 60e3, env: { ...process.env, ...env }
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  return { ok: r.status === 0, error: r.error ? r.error.message : tidy(r.stderr || r.stdout) };
}
function record(key, name, schedule, ok, count, error) {
  const s = sources[key] || {};
  sources[key] = { name, schedule, ok, lastAttempt: NOW, lastSuccess: ok ? NOW : s.lastSuccess || null, count: ok ? count : s.count ?? null, error: ok ? null : error };
  if (!ok) failed.push(name);
}
// 결과 파일을 임시로 받은 뒤, 제대로 된 JSON일 때만 바꿔 넣는다
function collectTo(target, script, args, env) {
  const tmp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try { fs.unlinkSync(tmp); } catch (e) { /* 없음 */ }
  const r = run(script, [...args, '--out', tmp], env);
  if (!r.ok) return { ...r, count: null };
  try {
    const data = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    const list = data.programs || data.rows;
    if (!Array.isArray(list)) throw new Error('프로그램 목록이 없어요');
    fs.renameSync(tmp, target);
    return { ok: true, count: list.length };
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (x) { /* 없음 */ }
    return { ok: false, error: e.message, count: null };
  }
}

// 1) 공공서비스예약
console.log(`\n== ${TODAY} 공공서비스예약 API`);
if (KEY) {
  const r = collectTo(path.join(ROOT, 'data', 'raw', 'seoul-api.json'), 'collect-seoul-api.js', []);
  record('seoul-api', '서울시 공공서비스예약', 'daily', r.ok, r.count, r.error);
} else {
  // 인증키를 아직 등록하지 않은 것은 고장이 아니므로 실패 메일을 보내지 않고, 이전 자료임만 기록한다
  console.log('인증키(SEOUL_API_KEY)가 없어 건너뜀 — 이전 자료를 씀');
  const s = sources['seoul-api'] || {};
  sources['seoul-api'] = { name: '서울시 공공서비스예약', schedule: 'daily', ok: s.ok ?? null, lastAttempt: NOW, lastSuccess: s.lastSuccess || null, count: s.count ?? null, error: null, waiting: '인증키 등록 전' };
}

// 2) 기관 사이트
console.log(`\n== 기관 사이트 ${INSTITUTION_DAY ? '수집' : '쉬는 날 (월·목에 모음)'}`);
if (INSTITUTION_DAY) {
  for (const c of COLLECTORS) {
    if (!fs.existsSync(path.join(ROOT, 'scripts', 'collectors', c.script)) || (ONLY && !ONLY.includes(c.key))) continue;
    console.log(`\n-- ${c.name}`);
    const r = collectTo(path.join(ROOT, 'data', 'raw', `${c.key}.json`), path.join('collectors', c.script), [...(c.args || []), '--today', TODAY]);
    record(c.key, c.name, 'twice-weekly', r.ok, r.count, r.error);
  }
}

// 3) 화면용 파일
console.log('\n== 화면용 파일 만들기');
if (fs.existsSync(path.join(ROOT, 'data', 'raw', 'seoul-api.json'))) {
  const r = run('build-regions.js', ['--today', TODAY]);
  if (!r.ok) failed.push('build-regions');
}
const b = run('build-data.js', ['--today', TODAY]);
if (!b.ok) failed.push('build-data');

// 4) 상태
fs.writeFileSync(STATUS_FILE, `/* 자동 생성: scripts/update.js — 출처별 마지막 수집 결과 */\nwindow.KIDS_STATUS = ${JSON.stringify({ updatedAt: NOW, sources }, null, 1)};\n`);
console.log(`\n상태 → data/status.js${failed.length ? ` · 실패: ${failed.join(', ')}` : ' · 모두 정상'}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed.join(', ')}\n`);
