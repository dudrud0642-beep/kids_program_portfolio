(function () {
  'use strict';

  const DATA = window.KIDS_DATA || { region: '도봉구', types: [], orgs: [], facilities: [], programs: [] };
  const GEO = window.KIDS_GEO;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const FAV_KEY = 'moa-favs-v1';
  const KID_KEY = 'moa-kid-v1';

  // 색 시안 비교용: 기본은 노랑, index.html?theme=purple / coral
  const THEME = new URLSearchParams(location.search).get('theme');
  if (['purple', 'coral'].includes(THEME)) document.documentElement.dataset.theme = THEME;
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const REGIONS_KEY = 'moa-regions-v1';
  const REGION_KEY = 'moa-region-v1';

  /* ---------- 아이콘 ---------- */
  const ICONS = {
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14a8 3 0 0 0 16 0V5"/><path d="M4 12a8 3 0 0 0 16 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14q3.5 3.2 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M9.5 10.5h5M9.5 13.5h3"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    route: '<path d="M3 11 21 3l-8 18-2-8-8-2Z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    sparkle: '<path d="M12 3.5 13.9 8.6 19 10.5l-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9Z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z"/>'
  };
  const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel) => document.querySelector(sel);

  /* ---------- 날짜 ---------- */
  const startOfDay = (d) => { const t = new Date(d); t.setHours(0, 0, 0, 0); return t; };
  const parseDate = (s) => { if (!s) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const t = new Date(d); t.setDate(t.getDate() + n); return t; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const TODAY = startOfDay(new Date());
  const diffDays = (a, b) => Math.round((a - b) / 86400000);
  const same = (a, b) => a && b && a.getTime() === b.getTime();
  const fmt = (d) => `${d.getFullYear() !== TODAY.getFullYear() ? d.getFullYear() + '.' : ''}${d.getMonth() + 1}.${d.getDate()}(${DOW[d.getDay()]})`;

  const WEEKEND = TODAY.getDay() === 0 ? [TODAY] : [addDays(TODAY, 6 - TODAY.getDay()), addDays(TODAY, 7 - TODAY.getDay())];
  const weekendLabel = WEEKEND.length === 1 ? fmt(WEEKEND[0]) : `${fmt(WEEKEND[0])}~${WEEKEND[1].getDate()}(${DOW[WEEKEND[1].getDay()]})`;

  // 일정 문구에서 요일 읽기 (못 읽으면 null)
  const DAY_IDX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  function parseDays(text) {
    if (!text) return null;
    const set = new Set();
    if (/매일/.test(text)) [0, 1, 2, 3, 4, 5, 6].forEach((d) => set.add(d));
    if (/주말/.test(text)) { set.add(6); set.add(0); }
    if (/평일/.test(text)) [1, 2, 3, 4, 5].forEach((d) => set.add(d));
    for (const m of text.matchAll(/([월화수목금토일])\s*[~\-–]\s*([월화수목금토일])(?![가-힣])/g)) {
      const order = [1, 2, 3, 4, 5, 6, 0];
      let i = order.indexOf(DAY_IDX[m[1]]);
      const j = order.indexOf(DAY_IDX[m[2]]);
      for (let k = 0; k < 7; k++) { set.add(order[i]); if (i === j) break; i = (i + 1) % 7; }
    }
    // "토요일", "(목 요일)", "(일,화,수,목,금,토 요일)"처럼 나열한 요일 모두
    for (const m of text.matchAll(/((?:[월화수목금토일]\s*[,·]\s*)*[월화수목금토일])\s?요일/g)) [...m[1]].forEach((c) => c in DAY_IDX && set.add(DAY_IDX[c]));
    for (const m of text.matchAll(/\(([월화수목금토일])\)/g)) set.add(DAY_IDX[m[1]]);
    for (const m of text.matchAll(/매주\s*((?:[월화수목금토일][\s,·/]*)+)/g)) [...m[1]].forEach((c) => c in DAY_IDX && set.add(DAY_IDX[c]));
    for (const m of text.matchAll(/(?:^|[\s,·/(])([월화수목금토일])(?=\s*\d{1,2}:\d{2})/g)) set.add(DAY_IDX[m[1]]);
    return set.size ? set : null;
  }

  // 일정 문구에 날짜가 직접 적혀 있으면 그 날짜만 (예: "10월 3, 10, 17일", "10/10, 10/24", "10일, 17일")
  function parseDates(text, start, end) {
    if (!text || !start) return null;
    const y = start.getFullYear();
    const D = '\\d{1,2}\\s*[./월]\\s*\\d{1,2}\\s*[.일]?(?:\\s*\\([^)]*\\))?';
    let t = text
      // "연휴(9월 27일 …)는 수업이 없습니다" 같은 휴강 안내는 진행 날짜가 아니므로 뺀다
      .split('/').filter((part) => !/없습니다|없음|제외|휴강|휴무|미운영/.test(part)).join('/')
      .replace(new RegExp(`(?:\\d{2,4}\\s*[.년]\\s*)?${D}\\s*[~–-]\\s*(?:\\d{2,4}\\s*[.년]\\s*)?${D}`, 'g'), ' ') // 기간 "9/6~11/29" 는 빼고
      .replace(/\d{1,2}:\d{2}/g, ' ');
    const out = new Set();
    const add = (m, d) => { const dt = new Date(y, m - 1, d); if (m >= 1 && m <= 12 && dt.getDate() === d) out.add(dt.getTime()); };
    for (const m of t.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})/g)) add(+m[1], +m[2]);
    t = t.replace(/(\d{1,2})\s*\/\s*(\d{1,2})/g, ' ');
    const parts = t.split(/(\d{1,2})\s*월/);
    for (let i = 1; i < parts.length; i += 2) {
      const run = parts[i + 1].match(/^[\s:]*((?:\d{1,2}\s*일?\s*[,·]\s*)*\d{1,2})\s*일/);
      if (run) run[1].split(/[,·]/).forEach((n) => add(+parts[i], parseInt(n, 10)));
    }
    if (!out.size && end && start.getMonth() === end.getMonth() && parts.length === 1) {
      const run = t.match(/((?:\d{1,2}\s*일\s*[,·]\s*)+\d{1,2})\s*일/);
      if (run) run[1].split(/[,·]/).forEach((n) => add(start.getMonth() + 1, parseInt(n, 10)));
    }
    return out.size ? out : null;
  }

  // 그날 진행하는지: 확실할 때만 true
  function occursOn(p, date) {
    if (!p._start) return false;
    const end = p._end || p._start;
    if (date < p._start || date > end) return false;
    if (same(p._start, end)) return true;
    if (p._dates) return p._dates.has(date.getTime());
    return p._days ? p._days.has(date.getDay()) : false;
  }

  /* ---------- 상태 ---------- */
  const STATUS = {
    closing: { label: '마감 임박', rank: 0 },
    open:    { label: '접수 중',   rank: 1 },
    wait:    { label: '대기 접수', rank: 2 },
    walkin:  { label: '자유 참여', rank: 3 },
    soon:    { label: '접수 예정', rank: 4 },
    unknown: { label: '기관 확인', rank: 5 },
    closed:  { label: '접수 마감', rank: 6 },
    ended:   { label: '종료',      rank: 7 }
  };
  const STATUS_GROUPS = {
    available: ['closing', 'open', 'wait', 'walkin'],
    closing: ['closing'],
    soon: ['soon'],
    closed: ['closed', 'ended']
  };
  const isClosed = (p) => STATUS_GROUPS.closed.includes(p._status);

  function computeStatus(p) {
    const st = p.statusText || '';
    if (p._end && p._end < TODAY) return 'ended';
    if (p._applyStart && TODAY < p._applyStart) return 'soon';
    if (p._applyEnd && TODAY > p._applyEnd) return 'closed';
    if (/예약\s*불가/.test(st)) return 'unknown'; // 예: "온라인 예약불가" → 전화·방문 접수일 수 있음
    if (/안내\s*중|일시\s*중지/.test(st)) return 'unknown'; // 공공예약 "안내중"(온라인 접수 없음)·"예약일시중지"
    if (/마감|종료|완료/.test(st) && !/임박|미종료/.test(st)) return 'closed';
    if (/대기/.test(st)) return 'wait';
    if (/예정|준비/.test(st) && !p._applyStart) return 'soon';
    if (p._applyEnd) return diffDays(p._applyEnd, TODAY) <= 2 ? 'closing' : 'open';
    if (/접수\s*중|신청\s*중|모집\s*중|신청\s*가능|예약\s*가능/.test(st)) return 'open';
    if (/현장|자유|신청\s*없이/.test(p.applyMethod || '')) return 'walkin';
    return 'unknown';
  }

  function dueText(p) {
    switch (p._status) {
      case 'closing': return { text: ['오늘 마감', '내일 마감', '모레 마감'][diffDays(p._applyEnd, TODAY)], urgent: true };
      case 'open': return { text: p._applyEnd ? `~${fmt(p._applyEnd)}` : '접수 중' };
      case 'soon': return { text: p._applyStart ? (diffDays(p._applyStart, TODAY) === 1 ? '내일부터' : `${fmt(p._applyStart)}부터`) : '접수 예정' };
      case 'wait': return { text: '대기 신청 가능' };
      case 'walkin': return { text: '신청 없이 참여' };
      case 'closed': return { text: p._applyEnd ? `${fmt(p._applyEnd)} 마감` : '접수 마감' };
      case 'ended': return { text: '진행 종료' };
      default: return { text: '기관에서 확인' };
    }
  }

  /* ---------- 데이터 준비 ---------- */
  // 탭 = 기관 유형 (모든 지역 공통 이름표)
  const ALL_TYPES = [
    { key: 'library', label: '도서관' }, { key: 'foundation', label: '문화재단' }, { key: 'public', label: '공공예약' },
    { key: 'childcare', label: '육아지원센터' }, { key: 'family', label: '가족센터' }, { key: 'youth', label: '청소년시설' }, { key: 'museum', label: '박물관' }
  ];
  const TYPE_LABEL = Object.fromEntries(ALL_TYPES.map((t) => [t.key, t.label]));

  // 비슷한 프로그램 추천용 주제 (제목·분류의 낱말로 나눈다)
  const TOPICS = [
    ['책·독서', /책|독서|문해|그림책|동화|낭독|북스타트|[Ss]tory|하브루타|디베이트|작가/],
    ['과학·메이커', /과학|메이커|코딩|로봇|AI|아두이노|드론|발명|실험|브레인/],
    ['만들기·미술', /만들기|미술|그리기|공예|아트|클레이|화관|북아트|드로잉|가랜드|키링|도예|스텐실|페인트/],
    ['공연·음악', /공연|음악|연극|서커스|뮤지컬|인형극|노래|악기|기타|드럼|극단/],
    ['몸놀이', /몸놀이|신체|체육|운동|댄스|요가|발레|스포츠|축구|줄넘기|놀이터|비트점프/],
    ['자연·숲', /숲|자연|가드닝|정원|생태|식물|산림|텃밭|씨드볼|허브|삽목|낙엽|단풍|열매|추수|논/],
    ['요리', /요리|쿠킹|베이킹|파티쉐|셰프|라면/]
  ];
  // 지역 데이터를 화면용으로 준비한다
  //  - 도봉구: data/programs.js (기관 11곳을 따로 모음)
  //  - 다른 구: data/regions/<코드>.js (서울시 공공서비스예약 공개 자료, 고를 때만 불러온다)
  const LOADED = {};     // 지역 이름 → 준비된 데이터
  const ALL_BY_ID = {};  // 불러온 모든 지역의 프로그램 (저장·공유 링크·상세에서 쓴다)
  function prepareRegion(raw, geo) {
    const orgs = Object.fromEntries((raw.orgs || []).map((o) => [o.key, o]));
    const facilities = raw.facilities || [];
    const collected = parseDate(raw.collectedAt);
    const programs = (raw.programs || []).map((p) => {
      const q = { ...p };
      q._region = raw.region;
      q._org = orgs[p.org] || {};
      q._fac = facilities.find((f) => f.org === p.org && f.name === p.facility) || null;
      q._collected = collected;
      q._type = q._org.type || 'public';
      q._start = parseDate(p.programStart);
      q._end = parseDate(p.programEnd);
      q._applyStart = parseDate(p.applyStart);
      q._applyEnd = parseDate(p.applyEnd);
      q._days = parseDays(p.schedule);
      q._dates = parseDates(p.schedule, q._start, q._end);
      q._status = computeStatus(q);
      q._weekend = WEEKEND.some((d) => occursOn(q, d));
      q._hay = [p.title, p.facility, p.target, p.category, q._org.name, TYPE_LABEL[q._type]].join(' ').toLowerCase();
      q._topics = TOPICS.filter(([, re]) => re.test(`${p.title} ${p.category || ''}`)).map(([k]) => k);
      return q;
    });
    programs.forEach((p) => { ALL_BY_ID[p.id] = p; });
    return {
      region: raw.region,
      scope: raw.scope || 'full', // public = 서울시 공공서비스예약만 모은 구
      orgs: raw.orgs || [],
      facilities,
      programs,
      byId: Object.fromEntries(programs.map((p) => [p.id, p])),
      collected,
      types: ALL_TYPES.filter((t) => programs.some((p) => p._type === t.key)),
      geo: geo || null
    };
  }
  LOADED[DATA.region] = prepareRegion(DATA, GEO && GEO.dobong);

  // 지금 고른 지역의 데이터 (useRegion으로 바꾼다)
  let CUR = null;
  let PROGRAMS = [];
  let BY_ID = {};
  let TYPES = [];
  let COLLECTED = null;
  let AREAS = [];
  function useRegion(name) {
    CUR = LOADED[name] || null;
    PROGRAMS = CUR ? CUR.programs : [];
    BY_ID = CUR ? CUR.byId : {};
    TYPES = CUR ? CUR.types : [];
    COLLECTED = CUR ? CUR.collected : null;
    AREAS = CUR && CUR.geo ? CUR.geo.areas : [];
  }

  // 다른 구 데이터 파일 목록 (data/regions/index.js)
  const REGION_INDEX = (window.KIDS_REGIONS && window.KIDS_REGIONS.list) || {};
  const regionCount = (name) => (LOADED[name] ? LOADED[name].programs.length : REGION_INDEX[name] ? REGION_INDEX[name].count : null);
  const CODE_TO_REGION = Object.fromEntries(Object.entries(REGION_INDEX).map(([name, r]) => [r.code, name]));
  // 프로그램 아이디로 지역 찾기: 다른 구는 "<구 코드>-번호", 도봉구는 기관 이름으로 시작
  const regionOfId = (id) => { const m = /^(\d{5})-/.exec(id || ''); return m ? CODE_TO_REGION[m[1]] || null : DATA.region; };
  const pendingRegion = {};
  function ensureRegion(name) {
    if (!name || LOADED[name]) return Promise.resolve(!!name);
    const info = REGION_INDEX[name];
    if (!info) return Promise.resolve(false);
    pendingRegion[name] = pendingRegion[name] || new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = `data/regions/${info.file}`;
      s.onload = () => {
        const raw = window.KIDS_REGION_DATA && window.KIDS_REGION_DATA[name];
        if (raw) { LOADED[name] = prepareRegion(raw, raw.geo); pruneFavs(name); }
        resolve(!!raw);
      };
      s.onerror = () => { delete pendingRegion[name]; resolve(false); };
      document.head.appendChild(s);
    });
    return pendingRegion[name];
  }

  const AGE_OPTIONS = [
    { key: 'infant', label: '영아 (0~2세)', short: '영아' },
    { key: 'preschool', label: '유아 (3~7세)', short: '유아' },
    { key: 'elem-low', label: '초등 1~3학년', short: '초등 저학년' },
    { key: 'elem-high', label: '초등 4~6학년', short: '초등 고학년' },
    { key: 'family', label: '가족 함께', short: '가족 함께' },
    { key: 'parent', label: '부모교육', short: '부모교육' }
  ];
  const STATUS_OPTIONS = [
    { key: 'all', label: '전체 상태' },
    { key: 'available', label: '신청 가능' },
    { key: 'closing', label: '마감 임박' },
    { key: 'soon', label: '접수 예정' },
    { key: 'closed', label: '마감' }
  ];
  const SEOUL = (GEO && GEO.seoul.gu) || [];

  /* ---------- 저장 (브라우저) ---------- */
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 못 해도 이번 방문 동안은 유지 */ } };

  // 저장한 프로그램: 여러 지역에 걸쳐 있으니 아이디를 그대로 두고, 지역을 불러올 때 없어진 것만 지운다
  const favs = new Set(load(FAV_KEY, []).filter((id) => typeof id === 'string'));
  function pruneFavs(region) {
    let changed = false;
    favs.forEach((id) => { if (regionOfId(id) === region && !LOADED[region].byId[id]) { favs.delete(id); changed = true; } });
    if (changed) save(FAV_KEY, [...favs]);
  }
  pruneFavs(DATA.region);
  const validGu = (name) => SEOUL.some((g) => g.name === name);
  // 내 관심 지역은 늘 가나다순
  const byName = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b, 'ko'));
  let regions = byName(load(REGIONS_KEY, [DATA.region]).filter(validGu));
  if (!regions.length) regions = [DATA.region];

  /* ---------- 상태 ---------- */
  const FILTER_DEFAULTS = { tab: 'all', status: 'all', free: false, area: null, day: null, weekend: false, q: '' };
  // 우리 아이 나이: 한 번 고르면 이 브라우저에 저장돼 대시보드 전체(요약·지도·목록·주간 일정·무료)에 적용
  const KID_OPTIONS = [
    { key: 'all', label: '나이 전체' },
    { key: 'infant', label: '영아 (0~2세)' },
    { key: 'preschool', label: '유아 (3~7세)' },
    { key: 'elem-low', label: '초등 1~3학년' },
    { key: 'elem-high', label: '초등 4~6학년' }
  ];
  const CHILD_TAGS = ['infant', 'preschool', 'elem-low', 'elem-high'];
  const state = {
    view: 'dashboard',
    region: regions.includes(load(REGION_KEY, '')) ? load(REGION_KEY, '') : regions[0],
    kid: KID_OPTIONS.some((o) => o.key === load(KID_KEY, 'all')) ? load(KID_KEY, 'all') : 'all',
    dayMode: 'deadline',
    sort: 'deadline',
    limit: 10,
    freeType: 'all',
    freeFolded: { closed: true },
    loading: null, // 데이터를 불러오는 중인 지역
    weekSavedOnly: false,
    ...FILTER_DEFAULTS
  };
  // 나이 표시가 따로 없는 "가족 누구나" 프로그램은 어느 나이를 골라도 보여 준다
  const kidOK = (p) => state.kid === 'all' || p.ageTags.includes(state.kid)
    || (p.ageTags.includes('family') && !p.ageTags.some((t) => CHILD_TAGS.includes(t)));
  const kidPrograms = () => PROGRAMS.filter(kidOK);
  const hasData = () => !!CUR && CUR.region === state.region && PROGRAMS.length > 0;
  const isLoading = () => state.loading === state.region;
  const pool = () => (hasData() ? kidPrograms() : []);

  function matches(p, ignore = {}) {
    if (!ignore.tab && state.tab !== 'all' && p._type !== state.tab) return false;
    if (state.status !== 'all' && !STATUS_GROUPS[state.status].includes(p._status)) return false;
    if (state.free && p.fee !== 0) return false;
    if (!ignore.area && state.area && p.area !== state.area) return false;
    if (!ignore.day && state.day) {
      const key = state.dayMode === 'deadline' ? p.applyEnd : p.programStart;
      if (key !== state.day) return false;
    }
    if (state.weekend && !p._weekend) return false;
    const q = state.q.trim().toLowerCase();
    if (q && !q.split(/\s+/).every((w) => p._hay.includes(w))) return false;
    return true;
  }

  const keyDate = (p) => {
    if (p._status === 'open' || p._status === 'closing') return p._applyEnd;
    if (p._status === 'soon') return p._applyStart || p._start;
    return p._start;
  };
  const byDate = (a, b) => (a ? a.getTime() : Infinity) - (b ? b.getTime() : Infinity);
  const SORTERS = {
    deadline: (a, b) => (STATUS[a._status].rank - STATUS[b._status].rank) || byDate(keyDate(a), keyDate(b)) || a.title.localeCompare(b.title, 'ko'),
    start: (a, b) => (isClosed(a) - isClosed(b)) || byDate(a._start, b._start) || a.title.localeCompare(b.title, 'ko'),
    title: (a, b) => a.title.localeCompare(b.title, 'ko')
  };

  /* ---------- 제목 다듬기 (화면 표시만, 원문은 그대로) ---------- */
  // 맨 앞 [말머리]는 작은 윗줄로 분리
  function splitTitle(t) {
    const m = t.match(/^\s*((?:\[[^\]]*\]\s*)+)(.*)$/);
    if (!m || !m[2].trim()) return { kicker: '', main: t.trim() };
    return { kicker: [...m[1].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1].trim()).join(' · '), main: m[2].trim().replace(/^[-–·*]+\s*/, '') }; // "[말머리] - 제목"의 '-'도 뗀다
  }
  // 괄호·따옴표로 묶인 구절은 한 덩어리로 (줄 길이보다 길면 그 안에서만 줄바꿈)
  // 괄호 묶음은 한 덩어리로. 둥근 괄호는 붙어 있는 앞 단어까지("단원(참여자)"),
  // 뒤에 붙은 문장부호도 함께("‘라면’:")
  const UNIT_RE = /(?:\S*?\([^)]*\)|〈[^〉>]*[〉>]|<[^>]*>|「[^」]*」|『[^』]*』|‘[^’]*’|'[^']*'|“[^”]*”|"[^"]*"|\{[^}]*\}|\[[^\]]*\])[^\s가-힣A-Za-z0-9]*/g;
  function unitize(raw) {
    const s = raw
      .replace(/(\S)\s*_\s*(?=\S)/g, '$1 · ') // "가든페스타_가을 화관" → "가든페스타 · 가을 화관" (밑줄은 구분 기호로만 쓰임)
      .replace(/ ([A-Za-z0-9]{1,2})(?= |$)/g, ' $1'); // "독서교실 A"처럼 짧은 꼬리는 앞 단어에 붙인다
    let out = '';
    let last = 0;
    for (const m of s.matchAll(UNIT_RE)) {
      out += esc(s.slice(last, m.index)) + `<span class="unit">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  // 원문 글 속 날짜·시각("2026-10-30 16:30", "10/18(토)")은 하이픈·빗금에서 끊기지 않게 묶는다
  const keepDates = (text) => esc(text).replace(/\d{4}-\d{1,2}-\d{1,2}(?:\s\d{1,2}:\d{2})?|\d{1,2}\/\d{1,2}(?:\([^)]*\))?|\d{1,2}:\d{2}\s?[~\-–]\s?\d{1,2}:\d{2}/g, (m) => `<span class="nw">${m}</span>`);

  /* ---------- 공통 조각 ---------- */
  const typeTag = (type, text) => `<span class="type-tag t-${type}">${esc(text ?? TYPE_LABEL[type] ?? '')}</span>`;
  const badge = (p) => `<span class="badge s-${p._status}">${STATUS[p._status].label}</span>`;
  function feeText(p) {
    if (p.fee === 0) return '<span class="fee-free">무료</span>';
    if (typeof p.fee === 'number') return `${p.fee.toLocaleString('ko-KR')}원`;
    return p.feeText ? esc(p.feeText) : '비용 기관 확인';
  }
  function dateText(p) {
    if (!p._start) return '일정 기관 확인';
    if (!p._end || same(p._start, p._end)) return fmt(p._start);
    const endTxt = p._end.getMonth() === p._start.getMonth() ? `${p._end.getDate()}(${DOW[p._end.getDay()]})` : fmt(p._end);
    return `${fmt(p._start)}~${endTxt}`;
  }
  const favLabel = (on) => `${icon('bookmark')}<span class="btn-label">${on ? '저장됨' : '저장'}</span>`;
  const favButton = (p) => {
    const on = favs.has(p.id);
    return `<button class="fav-btn" type="button" data-fav="${p.id}" aria-pressed="${on}" aria-label="${esc(p.title)} ${on ? '저장 취소' : '저장'}">${icon('bookmark')}</button>`;
  };

  function rowHTML(p, opts = {}) {
    const due = dueText(p);
    const t = splitTitle(p.title);
    return `
      <li class="prog${isClosed(p) ? ' is-closed' : ''}">
        <button class="prog-main" type="button" data-open="${p.id}">
          <span class="prog-status">${badge(p)}<span class="prog-due${due.urgent ? ' is-urgent' : ''}">${esc(due.text)}</span></span>
          <span class="prog-body">
            ${t.kicker ? `<span class="prog-kicker">${esc(t.kicker)}</span>` : ''}
            <span class="prog-title">${unitize(t.main)}</span>
            <span class="prog-meta">${typeTag(p._type)}${opts.region ? `<span class="prog-region">${esc(p._region)}</span>` : ''}${p.facility ? `<span>${esc(p.facility)}</span>` : ''}${p.target ? `<span>${esc(p.target)}</span>` : ''}</span>
          </span>
          <span class="prog-when"><b>${dateText(p)}</b><span>${feeText(p)}</span></span>
        </button>
        ${favButton(p)}
      </li>`;
  }

  function emptyHTML({ title, desc, action, iconName = 'inbox' }) {
    return `<li class="empty"><span class="empty-icon">${icon(iconName)}</span><p class="empty-title">${title}</p><p class="empty-desc desc">${desc}</p>${action || ''}</li>`;
  }

  /* ---------- 사이드바 ---------- */
  function renderRegions() {
    $('#region-list').innerHTML = regions.map((name) => {
      const current = name === state.region;
      const active = current && state.view === 'dashboard';
      const dataCount = regionCount(name);
      const tail = dataCount ? `<span class="region-count">${dataCount}</span>` : '<span class="region-soon">준비 중</span>';
      const del = regions.length > 1 ? `<button class="region-del" type="button" data-del-region="${esc(name)}" aria-label="${esc(name)} 목록에서 빼기">${icon('x')}</button>` : '';
      return `<li class="region-item${regions.length > 1 ? ' can-del' : ''}"><button class="side-item region-btn${current ? ' is-current' : ''}${active ? ' is-active' : ''}" type="button" data-region="${esc(name)}"${current ? ' aria-current="true"' : ''}><span class="region-dot" aria-hidden="true"></span><span class="side-text">${esc(name)}</span>${tail}</button>${del}</li>`;
    }).join('');
  }

  // 이번 주 = 오늘부터 이번 주 일요일까지
  const WEEK_DAYS = Array.from({ length: TODAY.getDay() === 0 ? 1 : 8 - TODAY.getDay() }, (_, i) => addDays(TODAY, i));
  const weekPrograms = () => kidPrograms().filter((p) => WEEK_DAYS.some((d) => occursOn(p, d)));

  function renderMenu() {
    document.querySelectorAll('.side-item[data-view]').forEach((el) => {
      const on = el.dataset.view === state.view;
      el.classList.toggle('is-active', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    $('#num-saved').textContent = favs.size;
    $('#num-week').textContent = weekPrograms().length;
    $('#num-free').textContent = kidPrograms().filter((p) => p.fee === 0).length;
  }

  /* ---------- 페이지 머리 ---------- */
  const VIEW_TITLE = { saved: '저장한 프로그램', week: '이번 주 일정', free: '무료 프로그램', sources: '데이터 출처' };
  function renderHead() {
    const region = state.region;
    const dash = state.view === 'dashboard';
    $('#page-eyebrow').hidden = !dash;
    $('#main').classList.toggle('is-dashboard', dash);
    if (dash) {
      $('#page-h1').innerHTML = `<span class="hl">${esc(region)}</span> 아이랑 프로그램`;
      const when = COLLECTED ? `${COLLECTED.getMonth() + 1}월 ${COLLECTED.getDate()}일` : '';
      $('#page-sub').innerHTML = isLoading()
        ? `${esc(region)} 프로그램을 <span class="nw">불러오고 있어요.</span>`
        : !hasData()
          ? `${esc(region)}는 아직 프로그램을 모으지 않았어요.`
          : CUR.scope === 'public'
            ? `서울시 공공서비스예약에 올라온 <span class="nw">${esc(region)} 프로그램이에요.</span> <span class="unit"><span class="nw">구 도서관·문화재단 소식은</span> <span class="nw">아직 준비 중이에요.</span></span>`
            : `흩어진 <span class="nw">구청·도서관·문화재단</span> 소식을 <span class="nw">한눈에 모았어요.</span> <span class="unit"><span class="nw">일정과 모집 상태는</span> <span class="nw">${when} 기관 공식 공지</span> 기준이에요.</span>`;
    } else {
      $('#page-h1').textContent = VIEW_TITLE[state.view];
      const w0 = WEEK_DAYS[0];
      const w1 = WEEK_DAYS[WEEK_DAYS.length - 1];
      $('#page-sub').innerHTML = {
        saved: '<span class="sent">북마크를 누른 프로그램이 <span class="nw">이 브라우저에 저장돼요.</span></span><span class="sent"><span class="nw">여러 지역 것을</span> <span class="nw">함께 보여 줘요.</span></span>',
        week: `<span class="nw">${fmt(w0)}${WEEK_DAYS.length > 1 ? `~${fmt(w1)}` : ''}</span> 진행하는 <span class="nw">${esc(region)} 프로그램이에요.</span> <span class="nw">날짜가 확실한 것만</span> 보여요.`,
        free: `참가비 없이 참여할 수 있는 <span class="nw">${esc(region)} 프로그램이에요.</span> <span class="nw">재료비나 입장료는</span> <span class="nw">따로 있을 수 있어요.</span>`,
        sources: '프로그램을 모아 온 기관과 <span class="nw">수집 방법이에요.</span>'
      }[state.view];
    }
    // 우리 아이 나이는 대시보드·무료·주간 일정에서 보이고, 검색은 대시보드에서만
    $('#page-tools').hidden = !['dashboard', 'free', 'week'].includes(state.view);
    $('#search-box').hidden = !dash;
    $('#kid').innerHTML = KID_OPTIONS.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
    $('#kid').value = state.kid;
    $('#kid-pill').classList.toggle('is-set', state.kid !== 'all');
    $('#collected').innerHTML = COLLECTED ? `${icon('refresh')}${fmt(COLLECTED)} 수집` : '';
    $('#collected').hidden = !COLLECTED || !hasData();
    document.title = `${dash ? region + ' 아이랑 프로그램' : VIEW_TITLE[state.view]} · 모아놀자`;
  }

  /* ---------- 요약 카드 ---------- */
  function renderKpis() {
    const all = pool();
    const total = all.length;
    const avail = all.filter((p) => STATUS_GROUPS.available.includes(p._status)).length;
    const closing = all.filter((p) => p._status === 'closing');
    const weekend = all.filter((p) => p._weekend);
    const free = all.filter((p) => p.fee === 0).length;
    const dash = (n) => (hasData() ? n : '–');

    const C = 2 * Math.PI * 16;
    // 기관 유형별로 나눈 링
    let offset = 0;
    const typeRing = `<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="ring-bg" cx="22" cy="22" r="16"/>${TYPES.map((t) => {
      const n = all.filter((p) => p._type === t.key).length;
      if (!n || !total) return '';
      const len = (C * n) / total;
      const seg = `<circle class="ring-seg t-${t.key}" cx="22" cy="22" r="16" stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-offset}"/>`;
      offset += len;
      return seg;
    }).join('')}</svg>`;
    const pct = total ? Math.round((avail / total) * 100) : 0;
    const freePct = total ? Math.round((free / total) * 100) : 0;
    const freeRing = `<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="ring-bg" cx="22" cy="22" r="16"/><circle class="ring-fg" cx="22" cy="22" r="16" stroke-dasharray="${(C * freePct) / 100} ${C}"/><text x="22" y="22">${freePct}%</text></svg>`;
    const ring = `<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="ring-bg" cx="22" cy="22" r="16"/><circle class="ring-fg" cx="22" cy="22" r="16" stroke-dasharray="${(C * pct) / 100} ${C}"/><text x="22" y="22">${pct}%</text></svg>`;
    const cols = (items) => {
      const max = Math.max(1, ...items.map((i) => i.n));
      return `<span class="minicols" aria-hidden="true">${items.map((i) => `<span class="minicol${i.n ? '' : ' is-zero'}"><b style="height:${Math.max(3, (i.n / max) * 26)}px"></b><span>${i.label}</span></span>`).join('')}</span>`;
    };
    const closingCols = cols([0, 1, 2].map((d) => ({ label: ['오늘', '내일', '모레'][d], n: closing.filter((p) => diffDays(p._applyEnd, TODAY) === d).length })));
    const weekendCols = cols(WEEKEND.map((d) => ({ label: DOW[d.getDay()], n: all.filter((p) => occursOn(p, d)).length })));

    const cards = [
      { key: 'available', cls: 'k-mint', icon: 'check', label: '지금 신청 가능', value: dash(avail), on: state.status === 'available',
        viz: hasData() ? ring : '', sub: hasData() ? '자유 참여·대기 포함' : '수집 전' },
      { key: 'closing', cls: 'k-coral', icon: 'clock', label: '3일 안에 마감', value: dash(closing.length), on: state.status === 'closing',
        viz: hasData() ? closingCols : '', sub: '서둘러 확인하세요' },
      { key: 'weekend', cls: 'k-purple', icon: 'calendar', label: '이번 주말 진행', value: dash(weekend.length), on: state.weekend,
        viz: hasData() ? weekendCols : '', sub: weekendLabel },
      { key: 'free', cls: 'k-sky', icon: 'ticket', label: '무료 프로그램', value: dash(free), on: state.free,
        viz: hasData() ? freeRing : '', sub: hasData() ? '참가비 0원 <span class="nw">(재료비 별도 있음)</span>' : '수집 전' }
    ];
    $('#kpis').innerHTML = cards.map((k) => `
      <button class="kpi ${k.cls}" type="button" data-kpi="${k.key}" aria-pressed="${k.on}" aria-controls="plist"${hasData() ? '' : ' disabled'}>
        ${k.on && hasData() ? '<span class="kpi-flag" aria-hidden="true">목록에 적용 중</span>' : ''}
        <span class="kpi-main">
          <span class="kpi-top"><span class="kpi-icon">${icon(k.icon)}</span>${k.label}</span>
          <span class="kpi-value">${k.value}${hasData() ? '<small>건</small>' : ''}</span>
          <span class="kpi-sub">${k.sub}</span>
        </span>
        <span class="kpi-viz">${k.viz}</span>
      </button>`).join('');
  }

  /* ---------- 지도 ---------- */
  function pathBBox(d) {
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < nums.length; i += 2) { x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]); y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function renderMap() {
    const wrap = $('#map');
    if (!GEO) { wrap.innerHTML = ''; return; }

    if (!hasData() || !CUR.geo) {
      const gu = SEOUL.find((g) => g.name === state.region);
      const b = pathBBox(gu.d);
      const pad = Math.max(b.w, b.h) * 0.08;
      wrap.innerHTML = `
        <div class="map-stage" style="--ratio:${(b.w + pad * 2) / (b.h + pad * 2)}">
          <svg viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" role="img" aria-label="${esc(state.region)} 지도"><path class="gu-shape" d="${gu.d}"/></svg>
        </div>
        <div class="map-empty"><span class="map-empty-badge">${isLoading() ? '불러오는 중' : '데이터 준비 중'}</span></div>`;
      $('#map-foot').textContent = isLoading() ? '지도를 불러오고 있어요.' : '이 지역은 아직 프로그램을 모으지 않았어요.';
      return;
    }

    const g = CUR.geo;
    const list = pool().filter((p) => matches(p, { area: true }));
    const counts = Object.fromEntries(AREAS.map((a) => [a.name, list.filter((p) => p.area === a.name).length]));
    const max = Math.max(1, ...Object.values(counts));
    const unknown = list.filter((p) => !p.area).length;

    // 말풍선: 권역이 6곳 이하면 모두, 더 많으면 프로그램이 있는 곳만 많은 순으로 6곳
    const labelAreas = AREAS.length <= 6 ? AREAS
      : AREAS.filter((a) => counts[a.name] > 0 || state.area === a.name).sort((a, b) => counts[b.name] - counts[a.name]).slice(0, 6);
    // 세로로 긴 구(도봉구 등): 지도는 왼쪽 60%, 말풍선은 오른쪽 바깥에 한 줄로 (화살표로 이음)
    // 가로로 넓은 구: 옆에 두면 지도가 너무 작아져서 지도는 카드 폭에 맞게 크게, 동별 숫자는 지도 아래 칩으로
    const tall = g.height / g.width >= 1.25;
    const labelX = g.width + 24;
    const vbW = Math.round(g.width / 0.6);
    const minGap = Math.min(100, (g.height - 40) / Math.max(1, labelAreas.length));
    const placed = [...labelAreas].sort((a, b) => a.cy - b.cy).map((a) => ({ ...a, ly: a.cy }));
    for (let i = 1; i < placed.length; i++) placed[i].ly = Math.max(placed[i].ly, placed[i - 1].ly + minGap);
    const over = placed.length ? placed[placed.length - 1].ly - (g.height - 30) : 0;
    if (over > 0) placed.forEach((a) => { a.ly -= over; });
    for (let i = placed.length - 2; i >= 0; i--) placed[i].ly = Math.min(placed[i].ly, placed[i + 1].ly - minGap);

    // 주색 단색 4단계 (많을수록 진하게) — 색은 CSS 변수(--map-1~4)에서 읽어 테마를 따른다
    const scale = ['--map-1', '--map-2', '--map-3', '--map-4'].map(cssVar);
    const fill = (n) => {
      if (!n) return '#eef1f6';
      const t = n / max;
      return t < 0.25 ? scale[0] : t < 0.5 ? scale[1] : t < 0.8 ? scale[2] : scale[3];
    };
    const groups = AREAS.map((a) => {
      const dongs = g.dongs.filter((d) => d.area === a.name);
      const dim = state.area && state.area !== a.name;
      return `<g class="map-area${dim ? ' is-dim' : ''}" data-area="${a.name}"><title>${a.name} (${a.dongs.join(', ')}) ${counts[a.name]}건</title>${dongs.map((d) => `<path class="map-dong" d="${d.d}" fill="${fill(counts[a.name])}" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
    }).join('');
    const label = (a, style) => {
      const n = counts[a.name];
      return `<button class="map-label${n ? '' : ' is-zero'}" type="button" data-area="${a.name}" aria-pressed="${state.area === a.name}"${style ? ` style="${style}"` : ''}>${a.name}<b>${n}</b></button>`;
    };
    const svgLabel = `role="img" aria-label="${esc(state.region)} 권역별 프로그램 수"`;
    if (tall) {
      const leads = placed.map((a) => `
        <polyline class="map-lead" points="${labelX - 6},${a.ly} ${g.width + 8},${a.ly} ${a.cx},${a.cy}" marker-end="url(#arrow)" vector-effect="non-scaling-stroke"/>`).join('');
      wrap.innerHTML = `
        <div class="map-stage" style="--ratio:${vbW / g.height}">
          <svg viewBox="0 0 ${vbW} ${g.height}" ${svgLabel}>
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="22" markerHeight="22" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#1b2437"/></marker></defs>
            ${groups}${leads}
          </svg>
          ${placed.map((a) => label(a, `left:${(labelX / vbW) * 100}%;top:${(a.ly / g.height) * 100}%`)).join('')}
        </div>`;
    } else {
      const chips = [...labelAreas].sort((a, b) => counts[b.name] - counts[a.name] || a.name.localeCompare(b.name, 'ko'));
      wrap.innerHTML = `
        <div class="map-flat">
          <svg viewBox="0 0 ${g.width} ${g.height}" ${svgLabel}>${groups}</svg>
          ${chips.length ? `<div class="map-chips">${chips.map((a) => label(a)).join('')}</div>` : ''}
        </div>`;
    }
    centerMap();
    // 색 단계 범례 + 안내
    const legend = `<span class="map-legend" aria-hidden="true"><span>적음</span>${scale.map((c) => `<i style="background:${c}"></i>`).join('')}<span>많음</span></span>`;
    $('#map-foot').innerHTML = legend + (unknown
      ? `<span class="map-note">장소 정보가 없는 <span class="nw">${unknown}건은</span> <span class="nw">지도에서 빠졌어요.</span></span>`
      : '<span class="map-note">숫자는 <span class="nw">지금 조건에 맞는</span> <span class="nw">프로그램 수예요.</span></span>');
  }

  // 지도 + 오른쪽 말풍선을 한 덩어리로 보고 카드 가운데에 오게 옮긴다
  function centerMap() {
    const stage = document.querySelector('#map .map-stage');
    if (!stage) return;
    stage.style.removeProperty('--shift');
    const s = stage.getBoundingClientRect();
    if (!s.width) return;
    const right = Math.max(s.right, ...[...stage.querySelectorAll('.map-label')].map((el) => el.getBoundingClientRect().right));
    stage.style.setProperty('--shift', `${-Math.round((right - s.right) / 2)}px`);
  }

  // 통계용 막대 (누를 수 없는 표시용) — 데이터 출처 화면
  function statBarsHTML(items) {
    const max = Math.max(1, ...items.map((i) => i.n));
    return items.map((i) => `
      <li class="stat-bar ${i.cls || ''}"><span class="bar-label">${i.label}</span><span class="bar-track"><span class="bar-fill" style="width:${(i.n / max) * 100}%"></span></span><span class="bar-num">${i.n}</span></li>`).join('');
  }

  /* ---------- 이번 주말 ---------- */
  function renderWeekend() {
    const rows = [];
    WEEKEND.forEach((d) => {
      pool().filter((p) => occursOn(p, d)).forEach((p) => rows.push({ p, d }));
    });
    rows.sort((a, b) => (a.d - b.d) || (firstTime(a.p) || '99').localeCompare(firstTime(b.p) || '99'));
    $('#weekend-note').textContent = hasData() ? weekendLabel : '';
    // 한 화면 대시보드에서는 카드 안에서 스크롤, 좁은 화면에서는 8건만 보이고 '모두 보기'로
    const limit = $('#main-wrap').clientWidth < 1040 ? 8 : 30;
    $('#weekend-list').innerHTML = rows.length
      ? rows.slice(0, limit).map(({ p, d }) => `
        <li><button class="mini-item" type="button" data-open="${p.id}">
          <span class="wk-day${d.getDay() === 0 ? ' is-sun' : ''}">${DOW[d.getDay()]}<small>${firstTime(p) || '시간 확인'}</small></span>
          <span><span class="mini-title" title="${esc(p.title)}">${esc(splitTitle(p.title).main)}</span><span class="mini-sub">${esc(p.facility || '')}</span></span>
        </button></li>`).join('')
        + (rows.length > limit ? `<li><button class="mini-more" type="button" data-kpi="weekend">이번 주말 ${new Set(rows.map((r) => r.p.id)).size}건 모두 보기</button></li>` : '')
      : `<li class="mini-empty">${hasData() ? '이번 주말에 진행하는 프로그램이 없어요.' : '수집 전이에요.'}</li>`;
  }

  /* ---------- 앞으로 2주 ---------- */
  function renderDays() {
    const list = pool().filter((p) => matches(p, { day: true }));
    const days = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i));
    const counts = days.map((d) => {
      const k = iso(d);
      return list.filter((p) => (state.dayMode === 'deadline' ? p.applyEnd : p.programStart) === k).length;
    });
    const max = Math.max(1, ...counts);
    document.querySelectorAll('[data-daymode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.daymode === state.dayMode)));
    $('#days').innerHTML = days.map((d, i) => {
      const n = counts[i];
      const k = iso(d);
      const on = state.day === k;
      // 건수가 있는 날은 진한 초록(흰 글자가 읽히는 명도) — 많을수록 더 진하게
      const heat = n ? mixPrimary(n / max) : '';
      const cls = ['day', n ? 'has-count' : 'is-empty', i === 0 ? 'is-today' : '', d.getDay() === 0 ? 'is-sun' : '', d.getDay() === 6 ? 'is-sat' : ''].join(' ');
      const what = state.dayMode === 'deadline' ? '접수 마감' : '진행 시작';
      return `<button class="${cls}" type="button" data-day="${k}" aria-pressed="${on}" aria-label="${fmt(d)} ${what} ${n}건"${n || on ? '' : ' disabled'} style="${heat ? `--heat:${heat}` : ''}">
        <span class="dw">${i === 0 ? '오늘' : DOW[d.getDay()]}</span><span class="dd">${d.getDate()}</span><span class="dc">${n}건</span></button>`;
    }).join('');
    $('#days-cap').innerHTML = state.dayMode === 'deadline'
      ? '숫자는 <span class="nw">그날 접수가 끝나는</span> 프로그램 수예요. <span class="nw">회색 칸은 0건이에요.</span>'
      : '숫자는 <span class="nw">그날 시작하는</span> 프로그램 수예요. <span class="nw">회색 칸은 0건이에요.</span>';
  }
  // 주색 단계(--heat-a → --heat-b) 사이를 비율만큼 섞는다. 글자색은 --on-primary
  function mixPrimary(t) {
    const a = cssVar('--heat-a').split(',').map(Number);
    const b = cssVar('--heat-b').split(',').map(Number);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, t)));
    return `rgb(${c.join(',')})`;
  }

  /* ---------- 목록 ---------- */
  function renderTabs() {
    // 데이터가 없는 지역에서는 탭·필터를 숨긴다. 기관 종류가 하나뿐인 구(공공예약만)는 탭도 숨긴다
    document.querySelector('.tabs-wrap').hidden = !hasData() || TYPES.length < 2;
    document.querySelector('.list-tools').hidden = !hasData();
    const list = pool().filter((p) => matches(p, { tab: true }));
    const tabs = [{ key: 'all', label: '전체' }, ...TYPES];
    $('#tabs').innerHTML = tabs.map((t) => {
      const on = t.key === state.tab;
      const n = t.key === 'all' ? list.length : list.filter((p) => p._type === t.key).length;
      return `<button class="tab" type="button" role="tab" data-tab="${t.key}" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-controls="plist">${t.label}<span class="tab-count">${n}</span></button>`;
    }).join('');
    updateTabFade();
  }

  function renderTools() {
    $('#f-status').innerHTML = STATUS_OPTIONS.map((s) => `<option value="${s.key}">${s.label}</option>`).join('');
    $('#f-status').value = state.status;
    $('#f-status').classList.toggle('is-set', state.status !== 'all');
    $('#f-sort').value = state.sort;

    // 위 요약 카드 중 어떤 것이 목록에 적용됐는지 목록 머리에도 같은 색으로 표시
    const scope = state.weekend ? { key: 'weekend', cls: 'k-purple', label: '이번 주말 진행' }
      : state.free ? { key: 'free', cls: 'k-sky', label: '무료 프로그램' }
      : state.status === 'available' ? { key: 'available', cls: 'k-mint', label: '지금 신청 가능' }
      : state.status === 'closing' ? { key: 'closing', cls: 'k-coral', label: '3일 안에 마감' }
      : null;
    $('#scope-chip').innerHTML = scope && hasData()
      ? `<button class="scope-chip ${scope.cls}" type="button" data-kpi="${scope.key}" aria-label="${scope.label} 조건 해제">${scope.label}${icon('x')}</button>`
      : '';

    const chips = [];
    if (state.area) chips.push({ key: 'area', label: `${state.area}` });
    if (state.day) chips.push({ key: 'day', label: `${fmt(parseDate(state.day))} ${state.dayMode === 'deadline' ? '접수 마감' : '진행 시작'}` });
    if (state.q.trim()) chips.push({ key: 'q', label: `‘${state.q.trim()}’ 검색` });
    const any = chips.length || state.tab !== 'all' || state.status !== 'all' || state.free || state.weekend;
    $('#active-filters').hidden = !any;
    $('#active-filters').innerHTML = chips.map((c) => `<button class="af" type="button" data-clear="${c.key}" aria-label="${esc(c.label)} 조건 지우기">${esc(c.label)}${icon('x')}</button>`).join('')
      + (any ? `<button class="af af-reset" type="button" data-action="reset">조건 모두 지우기</button>` : '');
  }

  function renderList() {
    const items = pool().filter((p) => matches(p)).sort(SORTERS[state.sort]);
    $('#list-count').textContent = hasData() ? `${items.length}건` : '';
    let html;
    if (isLoading()) {
      html = emptyHTML({ iconName: 'map', title: `${esc(state.region)} 프로그램을 불러오고 있어요`, desc: '잠시만 기다려 주세요.' });
    } else if (!hasData()) {
      html = emptyHTML({
        iconName: 'map',
        title: `${esc(state.region)}는 아직 준비 중이에요`,
        desc: `지금은 ${esc(DATA.region)} 프로그램부터 모으고 있어요.`,
        action: regions.includes(DATA.region) ? `<button class="btn btn-primary" type="button" data-region="${esc(DATA.region)}">${esc(DATA.region)} 보기</button>` : ''
      });
    } else if (!items.length) {
      html = emptyHTML({ title: '조건에 맞는 프로그램이 없어요', desc: '나이나 신청 상태 조건을 바꿔 보세요.', action: `<button class="btn btn-ghost" type="button" data-action="reset">조건 모두 지우기</button>` });
    } else {
      const paged = $('#main-wrap').clientWidth < 700;
      const shown = paged ? items.slice(0, state.limit) : items;
      html = shown.map(rowHTML).join('');
      if (paged && items.length > shown.length) {
        html += `<li><button class="btn btn-ghost more-btn" type="button" data-action="more">더 보기 (${items.length - shown.length}건 남음)</button></li>`;
      }
    }
    $('#plist').innerHTML = html;
  }

  function renderDashboard() {
    renderKpis();
    renderMap();
    renderWeekend();
    renderTabs();
    renderTools();
    renderList();
    renderDays();
  }

  /* ---------- 관심 목록 · 데이터 출처 ---------- */
  // 일정 문구의 첫 시각 (예: "16:30~17:20 (목 요일)" → 16:30)
  function firstTime(p) {
    const m = (p.schedule || '').match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
  }

  function renderWeek() {
    const grid = $('#week-grid');
    const savedInWeek = kidPrograms().filter((p) => favs.has(p.id) && WEEK_DAYS.some((d) => occursOn(p, d))).length;
    if (!savedInWeek) state.weekSavedOnly = false;
    $('#week-bar').innerHTML = `
      <p class="week-legend"><span class="week-legend-mark">${icon('bookmark')}</span>표시는 <span class="nw">내가 저장한 프로그램이에요.</span></p>
      <button class="chip" type="button" data-action="week-saved" aria-pressed="${state.weekSavedOnly}"${savedInWeek ? '' : ' disabled'}>저장한 것만 보기 <span class="chip-n">${savedInWeek}</span></button>`;
    grid.style.setProperty('--days', WEEK_DAYS.length);
    grid.innerHTML = WEEK_DAYS.map((d, i) => {
      const items = kidPrograms().filter((p) => occursOn(p, d) && (!state.weekSavedOnly || favs.has(p.id)))
        .sort((a, b) => (firstTime(a) || '99').localeCompare(firstTime(b) || '99') || a.title.localeCompare(b.title, 'ko'));
      const dow = d.getDay();
      return `
        <section class="card week-day${dow === 0 ? ' is-sun' : ''}${dow === 6 ? ' is-sat' : ''}" aria-label="${fmt(d)} 일정 ${items.length}건">
          <div class="week-head"><b>${d.getMonth() + 1}.${d.getDate()}</b><span>${DOW[dow]}요일</span>${i === 0 ? '<span class="today">오늘</span>' : ''}</div>
          <div class="week-list">${items.length ? items.map((p) => `
            <button class="week-item t-${p._type}${favs.has(p.id) ? ' is-saved' : ''}" type="button" data-open="${p.id}">
              <span class="week-meta">${firstTime(p) ? `<span class="week-time">${firstTime(p)}</span>` : ''}${p.facility ? `<span class="week-place">${esc(p.facility)}</span>` : ''}${favs.has(p.id) ? `<span class="week-saved" role="img" aria-label="저장함">${icon('bookmark')}</span>` : ''}</span>
              <span class="week-title">${unitize(splitTitle(p.title).main)}</span>
            </button>`).join('') : `<p class="week-none">${state.weekSavedOnly ? '저장한 프로그램이 없어요' : '진행하는 프로그램이 없어요'}</p>`}</div>
        </section>`;
    }).join('');
  }

  /* ---------- 무료 프로그램: 카드 격자 + 상태별 묶음 (끝난 것은 접어 둔다) ---------- */
  function cardHTML(p) {
    const due = dueText(p);
    const t = splitTitle(p.title);
    return `
      <li class="pcard${isClosed(p) ? ' is-closed' : ''}">
        <button class="pcard-main" type="button" data-open="${p.id}">
          <span class="pcard-top">${badge(p)}<span class="prog-due${due.urgent ? ' is-urgent' : ''}">${esc(due.text)}</span></span>
          <span class="pcard-title">${unitize(t.main)}</span>
          <span class="pcard-meta">${typeTag(p._type)}${p.facility ? `<span>${esc(p.facility)}</span>` : ''}</span>
          <span class="pcard-foot"><b>${dateText(p)}</b>${p.target ? `<span>${esc(p.target)}</span>` : ''}</span>
        </button>
        ${favButton(p)}
      </li>`;
  }

  function renderFree() {
    const all = kidPrograms().filter((p) => p.fee === 0);
    const list = all.filter((p) => state.freeType === 'all' || p._type === state.freeType);
    const types = [{ key: 'all', label: '전체' }, ...TYPES.filter((t) => all.some((p) => p._type === t.key))];
    $('#free-types').innerHTML = types.map((t) => {
      const n = t.key === 'all' ? all.length : all.filter((p) => p._type === t.key).length;
      return `<button class="chip" type="button" data-freetype="${t.key}" aria-pressed="${state.freeType === t.key}">${t.label}<span class="chip-n">${n}</span></button>`;
    }).join('');
    $('#free-count').textContent = `${list.length}건`;
    const groups = [
      { key: 'available', title: '지금 신청할 수 있어요', items: list.filter((p) => STATUS_GROUPS.available.includes(p._status)) },
      { key: 'soon', title: '곧 접수를 시작해요', items: list.filter((p) => p._status === 'soon') },
      { key: 'unknown', title: '접수 일정은 기관에서 확인해요', items: list.filter((p) => p._status === 'unknown') },
      { key: 'closed', title: '접수가 끝났어요', items: list.filter((p) => isClosed(p)) }
    ].filter((g) => g.items.length);
    $('#free-sections').innerHTML = groups.length
      ? groups.map((g) => {
          const folded = !!state.freeFolded[g.key];
          return `
            <section class="free-group${folded ? ' is-folded' : ''}" aria-label="${g.title} ${g.items.length}건">
              <div class="free-head">
                <h2>${g.title}</h2><span class="card-note">${g.items.length}건</span>
                <button class="fold-btn" type="button" data-fold="${g.key}" aria-expanded="${!folded}">${folded ? '펼쳐 보기' : '접기'}${icon(folded ? 'chevron-down' : 'chevron-up')}</button>
              </div>
              ${folded ? '' : `<ul class="pgrid">${g.items.sort(SORTERS.deadline).map(cardHTML).join('')}</ul>`}
            </section>`;
        }).join('')
      : `<ul class="pgrid">${emptyHTML({ iconName: 'ticket', title: '조건에 맞는 무료 프로그램이 없어요', desc: '우리 아이 나이나 기관을 바꿔 보세요.' })}</ul>`;
  }

  // 저장한 프로그램: 여러 지역에 걸쳐 있으면 필요한 지역 파일을 받은 뒤 함께 보여 준다
  function renderSaved() {
    const need = [...new Set([...favs].map(regionOfId))].filter((r) => r && !LOADED[r]);
    if (need.length) {
      $('#saved-list').innerHTML = emptyHTML({ iconName: 'bookmark', title: '저장한 프로그램을 불러오고 있어요', desc: '잠시만 기다려 주세요.' });
      Promise.all(need.map(ensureRegion)).then(() => { renderMenu(); if (state.view === 'saved') renderSaved(); });
      return;
    }
    const items = [...favs].map((id) => ALL_BY_ID[id]).filter(Boolean).sort(SORTERS.deadline);
    const manyRegions = new Set(items.map((p) => p._region)).size > 1;
    $('#saved-list').innerHTML = items.length
      ? items.map((p) => rowHTML(p, { region: manyRegions })).join('')
      : emptyHTML({ iconName: 'bookmark', title: '아직 저장한 프로그램이 없어요', desc: '목록에서 북마크를 누르면 여기에 모여요.', action: `<button class="btn btn-primary" type="button" data-view="dashboard">프로그램 보러 가기</button>` });
  }

  function renderSources() {
    // 분포 통계: 메인에서 빼고 이곳으로 (어떤 기관·나이대 프로그램이 많은지)
    $('#source-stats').innerHTML = PROGRAMS.length ? `
      <section class="card stat-card"><div class="card-head"><h2>기관별 프로그램</h2><span class="card-note">${PROGRAMS.length}건</span></div>
        <ul class="bars">${statBarsHTML(TYPES.map((t) => ({ label: t.label, cls: `t-${t.key}`, n: PROGRAMS.filter((p) => p._type === t.key).length })))}</ul></section>
      <section class="card stat-card"><div class="card-head"><h2>나이별 프로그램</h2><span class="card-note">겹쳐 셈</span></div>
        <ul class="bars">${statBarsHTML(AGE_OPTIONS.map((a) => ({ label: a.short, cls: 't-foundation', n: PROGRAMS.filter((p) => p.ageTags.includes(a.key)).length })))}</ul></section>` : '';
    $('#source-grid').innerHTML = (CUR ? CUR.orgs : []).map((o) => {
      const n = PROGRAMS.filter((p) => p.org === o.key).length;
      const facs = CUR.facilities.filter((f) => f.org === o.key);
      // 링크 글자는 도메인만 (긴 주소가 어색하게 끊기지 않게), 실제 링크는 전체 주소
      const host = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return url; } };
      const link = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text || host(url))}<span class="sr-only"> (새 창)</span></a>` : '확인 중');
      return `
        <article class="card source-card t-${o.type}">
          ${typeTag(o.type)}
          <h2>${esc(o.name)}</h2>
          <dl class="source-meta">
            <dt>모은 프로그램</dt><dd>${n}건</dd>
            <dt>수집 방식</dt><dd>${o.method === 'public' ? '<span class="method-public">서울시 공공서비스예약</span>' : '홈페이지 게시판'}</dd>
            <dt>홈페이지</dt><dd>${link(o.url)}</dd>
            ${o.listUrl ? `<dt>${o.key === 'seoul' ? '공개 자료' : '목록 주소'}</dt><dd>${link(o.listUrl, o.key === 'seoul' ? '열린데이터광장에서 보기' : '프로그램 목록 열기')}</dd>` : ''}
            ${o.note ? `<dt>참고</dt><dd>${esc(o.note)}</dd>` : ''}
          </dl>
          ${facs.length ? `<ul class="fac-list">${facs.map((f) => `<li><span>${esc(f.name)}</span>${f.area ? `<span class="tag">${esc(f.area)}</span>` : ''}</li>`).join('')}</ul>` : ''}
        </article>`;
    }).join('') || `<div class="card">${emptyHTML({ title: '아직 모은 데이터가 없어요', desc: '수집이 끝나면 여기에 기관 목록이 보여요.' }).replace(/<\/?li[^>]*>/g, '')}</div>`;
  }

  /* ---------- 주소(#)로 화면 기억: 새로고침·뒤로 가기·공유 링크 ---------- */
  // #free, #saved, #week, #sources = 각 페이지 / #program=아이디 = 대시보드에서 그 프로그램 상세 열기
  const VIEWS = ['dashboard', 'saved', 'week', 'free', 'sources'];
  function readHash() {
    let h = '';
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { /* 잘못된 주소는 대시보드로 */ }
    if (h.startsWith('program=')) return { view: 'dashboard', program: h.slice(8) };
    return { view: VIEWS.includes(h) ? h : 'dashboard' };
  }
  const pageUrl = (hash = '') => location.pathname + location.search + hash;
  function syncUrl() {
    if (readHash().view === state.view) return;
    try { history.pushState(null, '', pageUrl(state.view === 'dashboard' ? '' : `#${state.view}`)); } catch (e) { /* 주소를 못 바꿔도 화면은 바뀐다 */ }
  }

  function render() {
    syncUrl();
    renderRegions();
    renderMenu();
    renderHead();
    ['dashboard', 'saved', 'week', 'free', 'sources'].forEach((v) => { $(`#view-${v}`).hidden = v !== state.view; });
    if (state.view === 'dashboard') renderDashboard();
    if (state.view === 'saved') renderSaved();
    if (state.view === 'week') renderWeek();
    if (state.view === 'free') renderFree();
    if (state.view === 'sources') renderSources();
  }

  /* ---------- 공유하기 ---------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 아래 방법으로 */ }
    const back = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* 복사 실패 */ }
    ta.remove();
    if (back) back.focus();
    return ok;
  }
  // 공유 메뉴: 카카오톡(키를 넣고 배포했을 때) · 링크 복사 · 밴드 · 이메일 · (휴대폰) 다른 앱
  // 키가 없을 때 휴대폰은 바로 기기의 공유 창을 띄운다. 컴퓨터는 윈도 공유 창 대신 이 메뉴를 쓴다
  const CONFIG = window.MOA_CONFIG || {};
  const KAKAO_SDK = { src: 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js', integrity: 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy' };
  const isWeb = () => /^https?:$/.test(location.protocol);
  const kakaoOn = () => !!CONFIG.kakaoJsKey && isWeb();
  const touchDevice = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  let kakaoLoading = null;
  // 카카오 SDK(85KB)는 공유 메뉴를 처음 열 때만 받는다
  function loadKakao() {
    if (!kakaoOn()) return Promise.resolve(false);
    const ready = () => { if (!window.Kakao.isInitialized()) window.Kakao.init(CONFIG.kakaoJsKey); return true; };
    if (window.Kakao) return Promise.resolve(ready());
    kakaoLoading = kakaoLoading || new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = KAKAO_SDK.src;
      s.integrity = KAKAO_SDK.integrity;
      s.crossOrigin = 'anonymous';
      s.onload = () => { try { resolve(ready()); } catch (e) { resolve(false); } };
      s.onerror = () => { kakaoLoading = null; resolve(false); };
      document.head.appendChild(s);
    });
    return kakaoLoading;
  }
  function shareInfo(p) {
    const url = location.href.split('#')[0] + `#program=${encodeURIComponent(p.id)}`;
    const title = splitTitle(p.title).main;
    const line = [dateText(p), p.facility].filter(Boolean).join(' · ');
    return { url, title, line, text: `${title}\n${line}` };
  }
  async function shareProgram(p, btn) {
    if (!p) return;
    if (touchDevice() && navigator.share && !kakaoOn()) {
      const { url, title, text } = shareInfo(p);
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    toggleShareMenu(btn);
  }
  function toggleShareMenu(btn, force) {
    const menu = $('#share-menu');
    if (!menu || !btn) return;
    const open = force ?? menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { loadKakao(); menu.querySelector('[role="menuitem"]').focus(); }
  }
  const closeShareMenu = (focusBtn) => {
    const btn = document.querySelector('[data-share][aria-expanded="true"]');
    if (!btn) return false;
    toggleShareMenu(btn, false);
    if (focusBtn) btn.focus();
    return true;
  };
  function shareMenuHTML(p) {
    const item = (to, ic, label) => `<button class="share-item" type="button" role="menuitem" data-share-to="${to}:${p.id}">${icon(ic)}${label}</button>`;
    const note = !isWeb() ? '카카오톡·밴드 공유는 <span class="nw">사이트를 배포한 뒤</span> 열려요.'
      : !kakaoOn() ? '카톡방에는 링크를 복사해 <span class="nw">붙여 넣어 주세요.</span>' : '';
    return `<div class="share-menu" id="share-menu" role="menu" aria-label="공유할 곳" hidden>
        ${kakaoOn() ? item('kakao', 'chat', '카카오톡') : ''}
        ${item('copy', 'link', '링크 복사')}
        ${isWeb() ? item('band', 'users', '네이버 밴드') : ''}
        ${item('mail', 'mail', '이메일로 보내기')}
        ${touchDevice() && navigator.share ? item('more', 'share', '다른 앱으로 공유') : ''}
        ${note ? `<p class="share-note">${note}</p>` : ''}
      </div>`;
  }
  async function shareTo(to, p) {
    closeShareMenu(true);
    if (!p) return;
    const { url, title, line, text } = shareInfo(p);
    const enc = encodeURIComponent;
    if (to === 'kakao') {
      const link = { mobileWebUrl: url, webUrl: url };
      try {
        if (!window.Kakao || !window.Kakao.isInitialized()) throw new Error('not ready');
        window.Kakao.Share.sendDefault(p.image
          ? { objectType: 'feed', content: { title, description: line, imageUrl: p.image, link }, buttons: [{ title: '프로그램 보기', link }] }
          : { objectType: 'text', text: `[모아놀자] ${text}`, link, buttonTitle: '프로그램 보기' });
      } catch (e) {
        showToast('카카오톡을 열지 못했어요. 링크 복사로 보내 주세요');
      }
    }
    if (to === 'copy') {
      const ok = await copyText(`[모아놀자] ${text}\n${url}`);
      showToast(ok ? '링크를 복사했어요. 카톡이나 문자에 붙여 넣어 보내세요' : '복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요');
    }
    if (to === 'band') window.open(`https://band.us/plugin/share?body=${enc(`${text}\n${url}`)}&route=${enc(location.host)}`, '_blank', 'noopener');
    if (to === 'mail') location.href = `mailto:?subject=${enc(`[모아놀자] ${title}`)}&body=${enc(`${text}\n\n${url}`)}`;
    if (to === 'more' && navigator.share) { try { await navigator.share({ title, text, url }); } catch (e) { /* 닫음 */ } }
  }

  /* ---------- 비슷한 프로그램 ---------- */
  // 나이가 겹치는 것만 → 주제 같으면 +3, 같은 동네 +2, 같은 기관 종류 +1, 무료 +0.5.
  // 접수가 끝난 것·같은 프로그램의 다른 회차는 빼고, 같은 장소는 둘까지, 점수 높은 3개
  const AGE_SHORT = { infant: '영아', preschool: '유아', 'elem-low': '초등 저학년', 'elem-high': '초등 고학년', family: '가족' };
  const seriesKey = (p) => splitTitle(p.title).main.replace(/^\s*\([^)]*\)\s*/, '').slice(0, 6);
  function similarPrograms(p, n = 3) {
    const childAges = p.ageTags.filter((t) => CHILD_TAGS.includes(t));
    const series = seriesKey(p);
    const scored = ((LOADED[p._region] || {}).programs || []).filter(kidOK)
      .filter((q) => q.id !== p.id && !isClosed(q) && seriesKey(q) !== series)
      .map((q) => {
        const ages = childAges.length ? q.ageTags.filter((t) => childAges.includes(t))
          : (p.ageTags.includes('family') && q.ageTags.includes('family') ? ['family'] : []);
        const topics = q._topics.filter((t) => p._topics.includes(t));
        const near = !!q.area && q.area === p.area;
        const score = (topics.length ? 3 : 0) + (near ? 2 : 0) + (q._type === p._type ? 1 : 0) + (q.fee === 0 ? 0.5 : 0);
        return { q, ages, topics, near, score };
      })
      .filter((x) => x.ages.length && x.score >= 2)
      .sort((a, b) => b.score - a.score || (a.q._applyEnd || 9e15) - (b.q._applyEnd || 9e15));
    const out = [], seen = new Set(), perPlace = {};
    for (const x of scored) {
      const key = seriesKey(x.q);
      if (seen.has(key) || (perPlace[x.q.facility] || 0) >= 2) continue;
      seen.add(key);
      perPlace[x.q.facility] = (perPlace[x.q.facility] || 0) + 1;
      out.push(x);
      if (out.length === n) break;
    }
    return out;
  }
  function similarHTML(p) {
    const list = similarPrograms(p);
    if (!list.length) return '';
    const basis = state.kid !== 'all' ? KID_OPTIONS.find((o) => o.key === state.kid).label.replace(/\s*\(.*\)/, '') : '';
    const chips = (x) => [
      `<span class="w-age">${esc(AGE_SHORT[x.ages[0]])}${x.ages.length > 1 ? ' 외' : ''}</span>`,
      x.topics.length ? `<span>${esc(x.topics[0])}</span>` : '',
      x.near ? `<span>같은 동네 · ${esc(x.q.area)}</span>` : '',
      x.q.fee === 0 ? '<span>무료</span>' : ''
    ].join('');
    return `
      <section class="d-sim" aria-labelledby="d-sim-title">
        <h3 id="d-sim-title"><span class="d-sim-icon">${icon('sparkle')}</span>이런 프로그램도 있어요${basis ? `<small>${esc(basis)} 기준</small>` : ''}</h3>
        <ul>${list.map((x) => `
          <li><button class="sim-item" type="button" data-open="${x.q.id}">
            <span class="sim-top"><span class="sim-title">${unitize(splitTitle(x.q.title).main)}</span>${badge(x.q)}</span>
            <span class="sim-meta">${esc(x.q.facility)} · ${dateText(x.q)}</span>
            <span class="sim-why">${chips(x)}</span>
          </button></li>`).join('')}
        </ul>
      </section>`;
  }

  /* ---------- 상세 패널 ---------- */
  let lastFocus = null;

  function openDrawer(id) {
    const p = ALL_BY_ID[id];
    if (!p) return;
    const org = p._org;
    const fac = p._fac;
    const due = dueText(p);
    const rows = [];
    if (p.target) rows.push(['대상', esc(p.target)]);
    rows.push(['운영 기간', dateText(p) + (p.schedule ? `<span class="sub">${keepDates(p.schedule)}</span>` : '') + (p.sessions ? `<span class="sub">총 ${p.sessions}회</span>` : '')]);
    if (p.facility) {
      // 지도 앱 바로가기: 주소로 검색 (주소가 없으면 기관 이름으로)
      const q = encodeURIComponent(fac && fac.address ? fac.address : `${p._region} ${p.facility}`);
      const route = `<span class="d-route" aria-label="길찾기">`
        + `<a href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">${icon('route')}네이버 지도<span class="sr-only"> (새 창)</span></a>`
        + `<a href="https://map.kakao.com/link/search/${q}" target="_blank" rel="noopener">${icon('route')}카카오맵<span class="sr-only"> (새 창)</span></a></span>`;
      rows.push(['장소', esc(p.facility) + (fac && fac.address ? `<span class="sub">${esc(fac.address)}</span>` : '') + route]);
    }
    rows.push(['접수 기간', p._applyStart || p._applyEnd ? `${p._applyStart ? fmt(p._applyStart) : ''} ~ ${p._applyEnd ? fmt(p._applyEnd) : ''}` : '기관에서 확인']);
    if (p.applyMethod) rows.push(['신청 방법', esc(p.applyMethod)]);
    if (p.capacity) {
      let v = `${p.capacity}명 모집`;
      if (typeof p.applied === 'number' && p.applied <= p.capacity) {
        const pct = Math.round((p.applied / p.capacity) * 100);
        v = `${p.capacity}명 중 ${p.applied}명 신청<span class="sub">남은 자리 ${p.capacity - p.applied}명 (수집 시점)</span><div class="meter" role="img" aria-label="신청 ${pct}%"><span style="width:${pct}%"></span></div>`;
      } else if (typeof p.applied === 'number') {
        v = `${p.capacity}명 모집 · ${p.applied}명 신청<span class="sub">모집 인원보다 신청이 많아요 (수집 시점)</span>`;
      }
      rows.push(['모집 인원', v]);
    }
    rows.push(['비용', feeText(p) + (p.feeText && typeof p.fee === 'number' && p.feeText !== '무료' ? `<span class="sub">${esc(p.feeText)}</span>` : '')]);
    rows.push(['출처', esc(org.name || '')]);

    // 이미지 칸: 상세 페이지 대표 이미지가 있을 때만
    const media = p.image
      ? `<figure class="d-media t-${p._type}"><a href="${esc(p.image)}" target="_blank" rel="noopener" aria-label="이미지 원본 보기 (새 창)"><img src="${esc(p.image)}" alt="${esc(splitTitle(p.title).main)} 안내 이미지" referrerpolicy="no-referrer"></a><span class="d-media-zoom" aria-hidden="true">${icon('zoom')}원본 보기</span></figure>`
      : '';

    $('#drawer-org').innerHTML = typeTag(p._type, `${TYPE_LABEL[p._type] || ''} · ${org.name || ''}`);
    $('#drawer-body').innerHTML = `
      ${media}
      <div class="d-status">${badge(p)}<span class="${due.urgent ? 'is-urgent' : ''}">${esc(due.text)}</span></div>
      ${splitTitle(p.title).kicker ? `<p class="d-kicker">${esc(splitTitle(p.title).kicker)}</p>` : ''}
      <h2 id="drawer-title">${unitize(splitTitle(p.title).main)}</h2>
      ${p.category ? `<p class="d-place">${esc(p.category)}</p>` : ''}
      <dl class="d-info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${p.description ? `<section class="d-desc"><h3>기관 소개글</h3><p>${esc(p.description)}</p></section>` : ''}
      <p class="d-note">${icon('info')}<span><span class="sent">${p._collected ? `<span class="nw">${fmt(p._collected)}에</span> ` : ''}${p.org === 'seoul' ? '서울시 공개 자료에서' : '기관 사이트에서'} 모은 정보예요.</span><span class="sent">신청 전에 <span class="nw">원문을 꼭</span> 확인해 주세요.</span></span></p>
      ${similarHTML(p)}`;
    const on = favs.has(p.id);
    $('#drawer-foot').innerHTML = `
      <button class="btn btn-ghost" type="button" data-fav="${p.id}" aria-pressed="${on}">${favLabel(on)}</button>
      <div class="share-wrap">
        <button class="btn btn-ghost" type="button" data-share="${p.id}" aria-haspopup="menu" aria-expanded="false" aria-controls="share-menu">${icon('share')}<span class="btn-label">공유</span></button>
        ${shareMenuHTML(p)}
      </div>
      ${p.url ? `<a class="btn btn-primary" href="${esc(p.url)}" target="_blank" rel="noopener">기관 사이트에서 보기${icon('external')}<span class="sr-only"> (새 창)</span></a>` : '<span class="btn is-disabled">원문 주소 없음</span>'}`;

    // 이미지를 못 불러오면(주소 변경·차단) 이미지 칸을 없앤다
    const img = $('#drawer-body .d-media img');
    if (img) img.addEventListener('error', () => { img.closest('.d-media').remove(); }, { once: true });

    if ($('#drawer').hidden) lastFocus = document.activeElement;
    $('#drawer').hidden = false;
    $('#drawer-scrim').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#drawer-body').scrollTop = 0;
    $('#drawer .drawer-head .icon-btn').focus();
  }

  function closeDrawer(keepUrl) {
    if ($('#drawer').hidden) return;
    $('#drawer').hidden = true;
    $('#drawer-scrim').hidden = true;
    document.body.style.overflow = '';
    // 공유 링크(#program=)로 열었던 상세를 닫으면 주소에서도 지운다
    if (!keepUrl && readHash().program) { try { history.replaceState(null, '', pageUrl()); } catch (e) { /* 무시 */ } }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  /* ---------- 지역 추가·삭제 ---------- */
  function renderPicker() {
    const s = GEO.seoul;
    $('#picker-map').innerHTML = `
      <svg viewBox="0 0 ${s.width} ${s.height}" role="group" aria-label="서울 25개 구 지도">
        ${SEOUL.map((g) => {
          const added = regions.includes(g.name);
          const cls = ['pick-gu', added ? 'is-added' : ''].join(' ');
          return `<path class="${cls}" d="${g.d}" data-pick="${g.name}" tabindex="${added ? -1 : 0}" role="button" aria-label="${g.name} ${added ? '(추가됨)' : '추가'}"><title>${g.name} ${regionCount(g.name) ?? 0}건</title></path><text class="pick-name" x="${g.cx}" y="${g.cy}">${g.name === '중구' ? '중구' : g.name.replace(/구$/, '')}</text>`;
        }).join('')}
      </svg>`;
    $('#picker-list').innerHTML = SEOUL.map((g) => {
      const added = regions.includes(g.name);
      const n = regionCount(g.name);
      return `<button class="gu-chip" type="button" data-pick="${g.name}"${added ? ' disabled' : ''} aria-label="${g.name} 프로그램 ${n ?? 0}건${added ? ' (추가됨)' : ''}">${g.name}<span class="chip-n">${n ?? 0}</span></button>`;
    }).join('') + `
      <p class="picker-legend"><span><i style="background:var(--primary)"></i>추가한 지역</span><span><i style="background:#eef1f6"></i>추가할 수 있는 지역</span><span>숫자는 프로그램 수</span></p>`;
  }

  let modalFocus = null;
  function openRegionModal() {
    renderPicker();
    modalFocus = document.activeElement;
    $('#region-modal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#region-modal .icon-btn').focus();
  }
  function closeRegionModal() {
    if ($('#region-modal').hidden) return;
    $('#region-modal').hidden = true;
    document.body.style.overflow = '';
    if (modalFocus && document.contains(modalFocus)) modalFocus.focus();
  }

  function setRegion(name) {
    state.region = name;
    save(REGION_KEY, name);
    Object.assign(state, FILTER_DEFAULTS, { limit: 10 });
    $('#q').value = '';
    state.view = 'dashboard';
    showRegion();
  }

  // 고른 지역의 데이터를 쓰고 그린다. 아직 안 불러온 구는 파일을 받는 동안 "불러오는 중"을 보여 준다
  function showRegion() {
    const name = state.region;
    if (LOADED[name] || !REGION_INDEX[name]) {
      state.loading = null;
      useRegion(name);
      render();
      return;
    }
    state.loading = name;
    useRegion(null);
    render();
    ensureRegion(name).then(() => {
      if (state.region !== name) return;
      state.loading = null;
      useRegion(name);
      render();
    });
  }

  // 공유 링크·저장 목록에서 다른 지역 프로그램을 열 때: 그 지역 파일을 받은 뒤 상세를 연다
  function openProgram(id) {
    ensureRegion(regionOfId(id)).then(() => { if (ALL_BY_ID[id]) openDrawer(id); });
  }

  // 로고: 처음 화면으로 (기본 지역 · 걸러 둔 조건 모두 지움 · 맨 위로). 우리 아이 나이와 저장은 그대로
  function goHome() {
    closeDrawer();
    setRegion(regions.includes(DATA.region) ? DATA.region : regions[0]);
    const list = document.querySelector('#plist');
    if (list) list.scrollTop = 0;
    closeSidebarIfOverlay();
    window.scrollTo({ top: 0 });
  }

  function addRegion(name) {
    if (!validGu(name) || regions.includes(name)) return;
    regions = byName([...regions, name]);
    save(REGIONS_KEY, regions);
    closeRegionModal();
    setRegion(name);
    showToast(`${name}를 추가했어요`);
  }

  function removeRegion(name) {
    if (regions.length <= 1) return;
    regions = regions.filter((r) => r !== name);
    save(REGIONS_KEY, regions);
    if (state.region === name) setRegion(regions[0]); else render();
    showToast(`${name}를 목록에서 뺐어요`, {
      label: '되돌리기',
      run: () => { regions = byName([...regions, name]); save(REGIONS_KEY, regions); render(); }
    });
  }

  /* ---------- 알림 ---------- */
  let toastTimer = null;
  function showToast(text, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button" data-action="toast-undo">${action.label}</button>` : ''}`;
    el.hidden = false;
    el._action = action;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  /* ---------- 모바일 사이드바 ---------- */
  function setSidebar(open) {
    $('#sidebar').classList.toggle('is-open', open);
    $('#sidebar-scrim').hidden = !open;
    document.querySelector('[data-action="open-sidebar"]').setAttribute('aria-expanded', String(open));
    if (open) $('#sidebar .sidebar-close').focus();
  }
  const closeSidebarIfOverlay = () => { if (window.matchMedia('(max-width: 1199px)').matches) setSidebar(false); };

  /* ---------- 탭 가장자리 흐림 ---------- */
  function updateTabFade() {
    const el = $('#tabs');
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.parentElement.classList.toggle('fade-left', el.scrollLeft > 2);
    el.parentElement.classList.toggle('fade-right', max - el.scrollLeft > 2);
    el.classList.toggle('is-draggable', max > 2);
  }

  /* ---------- 관심 ---------- */
  function toggleFav(id) {
    if (favs.has(id)) favs.delete(id); else favs.add(id);
    save(FAV_KEY, [...favs]);
    $('#num-saved').textContent = favs.size;
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((el) => {
      const on = favs.has(id);
      el.setAttribute('aria-pressed', String(on));
      if (el.classList.contains('fav-btn')) el.setAttribute('aria-label', `${ALL_BY_ID[id].title} ${on ? '저장 취소' : '저장'}`);
      else el.innerHTML = favLabel(on);
    });
    if (state.view === 'saved') renderSaved();
    if (state.view === 'week') renderWeek();
  }

  /* ---------- 이벤트 ---------- */
  // 요약 카드 4개(신청 가능·마감 임박·이번 주말·무료) 가운데 지금 고른 것
  const currentKpi = () => (state.weekend ? 'weekend' : state.free ? 'free' : (['available', 'closing'].includes(state.status) ? state.status : 'all'));
  function applyKpi(next) {
    state.status = next === 'available' || next === 'closing' ? next : 'all';
    state.weekend = next === 'weekend';
    state.free = next === 'free';
  }

  const rerender = () => { state.limit = 10; renderDashboard(); renderRegions(); renderMenu(); };

  // 요약 카드를 누르면 목록이 바뀌었다는 걸 알리기: 목록 카드를 잠깐 강조하고,
  // 목록이 화면 밖이면(태블릿·모바일) 목록으로 스크롤
  function signalList() {
    const card = document.querySelector('.card-list');
    card.classList.remove('is-pulse');
    void card.offsetWidth;
    card.classList.add('is-pulse');
    const r = card.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.6 || r.top < 0) {
      const appbar = document.querySelector('.appbar');
      const offset = appbar && getComputedStyle(appbar).display !== 'none' ? appbar.offsetHeight + 8 : 12;
      window.scrollTo({ top: window.scrollY + r.top - offset, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    const hit = (sel) => t.closest(sel);
    let el;
    if (!hit('.share-wrap')) closeShareMenu();

    if ((el = hit('[data-fav]'))) { toggleFav(el.dataset.fav); return; }
    if ((el = hit('[data-del-region]'))) { removeRegion(el.dataset.delRegion); return; }
    if ((el = hit('[data-pick]'))) { addRegion(el.dataset.pick); return; }
    if ((el = hit('[data-region]'))) { setRegion(el.dataset.region); closeSidebarIfOverlay(); return; }
    if (hit('[data-region-home]')) { goHome(); return; }
    if ((el = hit('[data-fold]'))) { const k = el.dataset.fold; state.freeFolded[k] = !state.freeFolded[k]; renderFree(); return; }
    if ((el = hit('[data-freetype]'))) { state.freeType = el.dataset.freetype; renderFree(); return; }
    if ((el = hit('[data-share-to]'))) { const [to, id] = el.dataset.shareTo.split(':'); shareTo(to, ALL_BY_ID[id]); return; }
    if ((el = hit('[data-share]'))) { shareProgram(ALL_BY_ID[el.dataset.share], el); return; }

    if ((el = hit('[data-action]'))) {
      const a = el.dataset.action;
      if (a === 'close-drawer') closeDrawer();
      if (a === 'open-sidebar') setSidebar(true);
      if (a === 'close-sidebar') setSidebar(false);
      if (a === 'open-region-modal') { closeSidebarIfOverlay(); openRegionModal(); }
      if (a === 'close-region-modal') closeRegionModal();
      if (a === 'more') { state.limit += 10; renderList(); }
      if (a === 'week-saved') { state.weekSavedOnly = !state.weekSavedOnly; renderWeek(); }
      if (a === 'toast-undo') { const act = $('#toast')._action; $('#toast').hidden = true; if (act) act.run(); }
      if (a === 'reset') { Object.assign(state, FILTER_DEFAULTS); $('#q').value = ''; rerender(); }
      return;
    }

    if ((el = hit('[data-view]'))) { state.view = el.dataset.view; render(); closeSidebarIfOverlay(); window.scrollTo({ top: 0 }); return; }
    if ((el = hit('[data-open]'))) { openDrawer(el.dataset.open); return; }
    if ((el = hit('[data-tab]'))) { state.tab = el.dataset.tab; rerender(); return; }
    if ((el = hit('[data-area]'))) { state.area = state.area === el.dataset.area ? null : el.dataset.area; rerender(); return; }
    if ((el = hit('[data-day]'))) { state.day = state.day === el.dataset.day ? null : el.dataset.day; rerender(); return; }
    if ((el = hit('[data-daymode]'))) { state.dayMode = el.dataset.daymode; state.day = null; rerender(); return; }
    if ((el = hit('[data-clear]'))) {
      const k = el.dataset.clear;
      if (k === 'q') { state.q = ''; $('#q').value = ''; } else state[k] = FILTER_DEFAULTS[k];
      rerender();
      return;
    }
    if ((el = hit('[data-kpi]'))) {
      // 요약 카드 4개는 탭처럼 하나만 고른다. 고른 카드를 다시 누르면 전체로 돌아간다.
      const k = el.dataset.kpi;
      applyKpi(k === currentKpi() ? 'all' : k);
      rerender();
      signalList();
      return;
    }
  });

  // 지도·지역 지도는 키보드로도 고를 수 있게
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('path[data-pick]')) { e.preventDefault(); addRegion(e.target.dataset.pick); }
  });

  $('#q').addEventListener('input', (e) => { state.q = e.target.value; rerender(); });
  $('#kid').addEventListener('change', (e) => {
    state.kid = KID_OPTIONS.some((o) => o.key === e.target.value) ? e.target.value : 'all';
    save(KID_KEY, state.kid);
    state.limit = 10;
    render();
    const label = KID_OPTIONS.find((o) => o.key === state.kid).label;
    showToast(state.kid === 'all' ? '모든 나이의 프로그램을 보여 드려요' : `${label} 기준으로 보여 드려요. 다음에 와도 그대로예요`);
  });
  $('#f-status').addEventListener('change', (e) => { state.status = e.target.value; rerender(); });
  $('#f-sort').addEventListener('change', (e) => { state.sort = e.target.value in SORTERS ? e.target.value : 'deadline'; renderList(); });
  $('#tabs').addEventListener('scroll', updateTabFade, { passive: true });
  // 마우스 휠(세로)로도 탭을 옆으로 넘긴다
  $('#tabs').addEventListener('wheel', (e) => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
  // 마우스로 끌어서 옆으로 넘기기 (휴대폰은 원래 손가락으로 넘어간다). 끌었을 때는 탭이 눌리지 않게 한다
  function dragScroll(el) {
    let id = null, startX = 0, startLeft = 0, moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
      id = e.pointerId; startX = e.clientX; startLeft = el.scrollLeft; moved = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 6) return;
      if (!moved) { moved = true; el.setPointerCapture(id); el.classList.add('is-dragging'); }
      el.scrollLeft = startLeft - dx;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('is-dragging');
      if (!moved) return;
      const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', block, { capture: true }), 0);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dragstart', (e) => e.preventDefault());
  }
  dragScroll($('#tabs'));
  dragScroll($('#free-types'));

  // 뒤로·앞으로 가기: 주소에 맞는 화면으로
  window.addEventListener('popstate', () => {
    const r = readHash();
    closeDrawer(true);
    if (state.view !== r.view) { state.view = r.view; render(); window.scrollTo({ top: 0 }); }
    if (r.program) openProgram(r.program);
  });

  window.addEventListener('resize', () => { updateTabFade(); centerMap(); });

  $('#tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...document.querySelectorAll('#tabs .tab')];
    const i = tabs.findIndex((el) => el.dataset.tab === state.tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    e.preventDefault();
    state.tab = tabs[next].dataset.tab;
    rerender();
    const el = document.querySelector(`#tabs [data-tab="${state.tab}"]`);
    el.focus();
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  // Esc 닫기 + 열린 창 안에서만 Tab 이동
  document.addEventListener('keydown', (e) => {
    const openBox = !$('#drawer').hidden ? $('#drawer') : (!$('#region-modal').hidden ? $('#region-modal') : null);
    if (e.key === 'Escape') {
      if (closeShareMenu(true)) return;
      if (!$('#drawer').hidden) closeDrawer();
      else if (!$('#region-modal').hidden) closeRegionModal();
      else if ($('#sidebar').classList.contains('is-open')) setSidebar(false);
      return;
    }
    if (e.key === 'Tab' && openBox) {
      const f = [...openBox.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // 로고에 마우스를 올리면 굴러오는 애니메이션을 다시 보여 준다
  document.querySelectorAll('.brand-link').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      const mark = el.querySelector('.logo-mark');
      mark.classList.remove('is-playing');
      void mark.getBoundingClientRect();
      mark.classList.add('is-playing');
    });
  });

  /* ---------- 시작 ---------- */
  // 인트로는 index.html 맨 위의 작은 스크립트가 따로 맡는다 (데이터를 받기 전에 시작하도록)
  // 인트로가 보이는 동안 사이드바 로고는 움직이지 않게 (끝난 뒤 정지된 로고가 보인다)
  if (document.documentElement.classList.contains('intro-on')) document.querySelectorAll('.brand-link .logo-mark').forEach((m) => m.classList.remove('is-playing'));
  document.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  const first = readHash();
  state.view = first.view;
  showRegion();
  if (first.program) openProgram(first.program);
})();
