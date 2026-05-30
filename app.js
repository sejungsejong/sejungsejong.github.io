import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { config } from './config.js';
import { assetUrl, rewriteAssetsDeep, rewriteAssetsInDOM } from './asset-url.js';

// 배포(github.io) 모드면 config 안 'assets/...' 전부 Release URL 로 변환
rewriteAssetsDeep(config);

// ============================================================
//  BGM / SFX 매니저
//   - BGM: 한 트랙만 재생 (cross-fade in/out). 같은 키 재호출 → no-op
//   - SFX: one-shot, 여러 개 동시 가능
//   - 브라우저 autoplay 정책 — 첫 사용자 클릭(standby) 이후부터 재생 가능
// ============================================================
const BGM_ASSETS = {
  'lobby':        'assets/bgm/lobby.mp3',
  'a-note':       'assets/bgm/a-note.mp3',
  'a-immersive':  'assets/bgm/a-immersive.mp3',
  'b-dark':       'assets/bgm/b-dark.mp3',
  'b-light':      'assets/bgm/b-light.mp3',
};
const SFX_ASSETS = {
  'portal': 'assets/bgm/portal.mp3',
  'click':  'assets/bgm/click.wav',
  'camera': 'assets/bgm/camera.wav',
};
// 배포 모드에서 Release URL 로 재라우팅 (assetUrl 가 local 모드면 no-op)
rewriteAssetsDeep(BGM_ASSETS);
rewriteAssetsDeep(SFX_ASSETS);
const BGM = {
  current: null,
  currentKey: null,
  vol: 0.5,
  fadeMs: 500,
  cache: new Map(),     // key → Audio (재사용 — 두 번째 재생 빠르게)
  play(key) {
    if (this.currentKey === key) return;
    this.stop();
    const src = BGM_ASSETS[key];
    if (!src) return;
    let audio = this.cache.get(key);
    if (!audio) {
      audio = new Audio(src);
      audio.loop = true;
      audio.preload = 'auto';
      audio.addEventListener('error', () => console.warn('[BGM] error:', key, audio.error));
      this.cache.set(key, audio);
    }
    try { audio.currentTime = 0; } catch {}
    audio.volume = 0;
    const p = audio.play();
    if (p && p.catch) p.catch((err) => console.warn('[BGM] play failed:', key, err));
    console.log('[BGM] play', key);
    this.current = audio;
    this.currentKey = key;
    this._fade(audio, 0, this.vol);
  },
  stop() {
    if (!this.current) return;
    const a = this.current;
    this.current = null;
    this.currentKey = null;
    // cache 된 audio 는 src 비우지 않고 pause 만 — 다음 재생 시 빠르게 복귀
    this._fade(a, a.volume, 0, () => { try { a.pause(); } catch {} });
  },
  _fade(audio, from, to, onDone) {
    const startedAt = performance.now();
    const dur = this.fadeMs;
    const tick = (t) => {
      const k = Math.min(1, (t - startedAt) / dur);
      audio.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(tick);
      else if (onDone) onDone();
    };
    requestAnimationFrame(tick);
  },
};
function playSFX(key, vol = 0.7) {
  const src = SFX_ASSETS[key];
  if (!src) return;
  const a = new Audio(src);
  a.volume = vol;
  a.play().catch(() => {});
}

// ============================================================
//  Apply config values to DOM / CSS variables
// ============================================================
function applyConfig() {
  const root = document.documentElement;

  // Background
  document.body.style.background = config.background;
  root.style.setProperty('--bg', config.background);

  // Physical screen dimensions → CSS variables
  // (좌·중앙위·우 = panelWidth × topRowH, 중앙아래 = panelWidth × bottomRowH)
  const lay = config.layout || {};
  const pw  = +lay.panelWidth || 1920;
  const th  = +lay.topRowH    || 1200;
  const bh  = +lay.bottomRowH || 1920;
  root.style.setProperty('--panel-w',   pw);
  root.style.setProperty('--top-h',     th);
  root.style.setProperty('--bot-h',     bh);
  root.style.setProperty('--scene-w',   pw * 3);
  root.style.setProperty('--scene-h',   th + bh);
  root.style.setProperty('--grid-rows', `${th}fr ${bh}fr`);

  // Helper: null/숫자/문자열 → 유효 CSS 크기 값(또는 null)
  const asSize = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') return v + 'px';
    return String(v);
  };

  // (Legacy) Center-top image + detail overlay — 현재 hall 뷰는 canvas 만 두므로
  // 해당 DOM 이 있을 때만 적용. config.center 가 의미 있는 다른 모드가 생길 때 대비 가드.
  const ctImg = document.getElementById('center-top-img');
  if (ctImg && config.center && config.center.top) {
    ctImg.src = config.center.top.image;
    const topWrap = document.querySelector('.center-image-wrap');
    if (topWrap) {
      const topW = asSize(config.center.top.width);
      const topH = asSize(config.center.top.height);
      if (topW) topWrap.style.width  = topW;
      if (topH) topWrap.style.height = topH;
    }
    const d = config.center.top.detail;
    const dt = document.getElementById('detail-title');
    const dd = document.getElementById('detail-desc');
    const ul = document.getElementById('detail-items');
    const tagsEl = document.getElementById('detail-tags');
    if (dt && d) dt.textContent = d.title;
    if (dd && d) dd.textContent = d.description;
    if (ul && d && d.items) {
      ul.innerHTML = '';
      d.items.forEach((it) => {
        const li = document.createElement('li');
        li.textContent = it;
        ul.appendChild(li);
      });
    }
    if (tagsEl && d && d.tags) {
      tagsEl.innerHTML = '';
      d.tags.forEach((t) => {
        const span = document.createElement('span');
        span.classList.add('tag');
        span.textContent = t;
        tagsEl.appendChild(span);
      });
    }
  }

  // Helper: set <img> src + optional size on an element by id
  const setImg = (id, cfg) => {
    const el = document.getElementById(id);
    if (!el || !cfg) return;
    if (cfg.src) el.src = cfg.src;
    const w = asSize(cfg.width);
    const h = asSize(cfg.height);
    if (w) el.style.width  = w;
    if (h) el.style.height = h;
    if (w || h) { el.style.maxWidth = 'none'; el.style.maxHeight = 'none'; }
  };

  // Standby screen — images, sizes, background, rotate speed
  if (config.standby) {
    const sb = config.standby;
    const standbyEl = document.getElementById('standby');
    if (sb.background) standbyEl.style.background = sb.background;
    setImg('standby-1', sb.image1);
    setImg('standby-2', sb.image2);
    setImg('standby-3', sb.image3);
    if (sb.image2 && sb.image2.rotateSeconds) {
      document.getElementById('standby-2').style.animationDuration =
        sb.image2.rotateSeconds + 's';
    }
  }

  // Landing Space — wall(s) / front content / floor / background
  if (config.landingSpace) {
    const ls = config.landingSpace;
    const lsEl = document.getElementById('landing-space');
    if (ls.background) lsEl.style.background = ls.background;
    // Same wall image is reused on left, right, and center-top back-wall
    setImg('ls-wall-left',  ls.wall);
    setImg('ls-wall-right', ls.wall);
    setImg('ls-wall-front', ls.wall);
    setImg('ls-front', ls.front);
    setImg('ls-floor', ls.floor);
  }

  // Exhibition Space (landing) — wall(s) / floor / per-scene background
  if (config.landing) {
    const lg = config.landing;
    const landingEl = document.getElementById('landing');
    if (lg.background) landingEl.style.background = lg.background;
    // walls: { left, center, right } 가 있으면 각자 적용. 없으면 lg.wall 공통 사용 (호환).
    if (lg.walls) {
      setImg('landing-wall-left',   { src: lg.walls.left });
      setImg('landing-wall-center', { src: lg.walls.center });
      setImg('landing-wall-right',  { src: lg.walls.right });
    } else if (lg.wall) {
      setImg('landing-wall-left',   lg.wall);
      setImg('landing-wall-right',  lg.wall);
      setImg('landing-wall-center', lg.wall);
    }
    setImg('landing-floor',       lg.floor);
  }
}

// ============================================================
//  STANDBY → LANDING transition (click anywhere to enter)
// ============================================================
function initStandby() {
  const standby = document.getElementById('standby');
  if (!standby) return;
  // "정면 화면" = 중앙 위 패널 위에 마우스가 들어오는 즉시 전환
  const front = standby.querySelector('.standby-center-top');
  if (!front) return;

  // "정면 화면" 클릭 → 랜딩 진입
  front.addEventListener('click', () => {
    standby.classList.add('hidden');
    showLandingSpace();
  }, { once: true });
}

// ============================================================
//  LANDING SPACE — 짧은 전환 화면
//  순서: 대기상태 → 랜딩공간(N초) → 전시로비(landing)
//  landing 은 처음에 .hidden 으로 숨겨져 있다가 여기서 풀어준다.
// ============================================================
function showLandingSpace() {
  const ls = document.getElementById('landing-space');
  const landing = document.getElementById('landing');
  if (!ls) return;
  BGM.play('lobby');
  const minDuration = (config.landingSpace && config.landingSpace.duration) || 5000;

  // 랜딩 마운트 — 벽/객체는 .scene-ready 가 켜질 때 한 번에 노출
  if (landing) {
    landing.classList.remove('hidden', 'scene-ready');
    landing.classList.add('active');
  }
  ls.classList.add('visible');

  // 2 초 후 벽+객체 동시에 노출 (fade 없이 즉시) — 랜딩공간 흰 화면 이 가려주므로 시각적으로 안 보임,
  //  실제 decode 는 이때 끝나 있어서 landing-space fade-out 시 한 번에 보임
  setTimeout(() => {
    if (landing) landing.classList.add('scene-ready');
  }, 2000);

  const t0 = Date.now();
  preloadLobbyAssets().then(() => {
    const elapsed = Date.now() - t0;
    const wait = Math.max(0, minDuration - elapsed);
    setTimeout(() => {
      ls.classList.remove('visible');
      setTimeout(() => { ls.style.display = 'none'; }, 700);
      // 로비 노출되는 시점에 B 전환 비디오 백그라운드 preload — 사용자가 해태 누르기 전에 캐시 채움
      preloadHallTransitionVideos();
    }, wait);
  });
}

function preloadLobbyAssets() {
  const lg = config.landing || {};
  const urls = [];
  if (lg.walls) {
    if (lg.walls.left)   urls.push(lg.walls.left);
    if (lg.walls.center) urls.push(lg.walls.center);
    if (lg.walls.right)  urls.push(lg.walls.right);
  } else if (lg.wall) {
    const w = typeof lg.wall === 'string' ? lg.wall : (lg.wall.src);
    if (w) urls.push(w);
  }
  if (lg.floor) {
    const f = typeof lg.floor === 'string' ? lg.floor : (lg.floor.src);
    if (f) urls.push(f);
  }
  ['left', 'center', 'right'].forEach((k) => {
    (lg[k] || []).forEach((it) => { if (it && it.src) urls.push(it.src); });
  });
  return Promise.all(urls.map(preloadImage));
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload  = () => resolve();
    im.onerror = () => resolve();   // 실패해도 차단하지 않음
    im.src = src;
  });
}

// 대기/랜딩스페이스/전시로비 자산을 boot 시 사전 decode — 페이드 인 중 이미지가 그려지는 현상 차단
function preloadEarlyAssets() {
  const urls = [];
  const ls = config.landingSpace || {};
  if (ls.wall)  urls.push(typeof ls.wall === 'string' ? ls.wall : ls.wall.src);
  if (ls.front) urls.push(typeof ls.front === 'string' ? ls.front : ls.front.src);
  if (ls.floor) urls.push(typeof ls.floor === 'string' ? ls.floor : ls.floor.src);
  const lg = config.landing || {};
  if (lg.walls) {
    if (lg.walls.left)   urls.push(lg.walls.left);
    if (lg.walls.center) urls.push(lg.walls.center);
    if (lg.walls.right)  urls.push(lg.walls.right);
  } else if (lg.wall) {
    urls.push(typeof lg.wall === 'string' ? lg.wall : lg.wall.src);
  }
  if (lg.floor) urls.push(typeof lg.floor === 'string' ? lg.floor : lg.floor.src);
  ['left', 'center', 'right'].forEach((k) => {
    (lg[k] || []).forEach((it) => { if (it && it.src) urls.push(it.src); });
  });
  urls.filter(Boolean).forEach((src) => {
    const im = new Image();
    if (im.decode) { im.src = src; im.decode().catch(() => {}); }
    else { im.src = src; }
  });
}

// ============================================================
//  Exhibition Space items (built from config) — 4-panel split
//  - 좌·우: 호버 시 "준비 중" 알림이 작품 뒤에서 잠깐 떴다 사라짐
//  - 중앙 위: 호버 dwell 후 메인 뷰로 진입
// ============================================================
function buildLanding() {
  const lg = config.landing || {};
  const alertText = lg.alertText || '해당 공간은 아직 준비 중입니다';

  const buildPanel = (containerId, items) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const panel = container.parentElement;   // .landing-panel
    container.innerHTML = '';
    // wall 위에 떠야 하는 alert 는 panel 의 직접 자식 (각 panel 마다 단일 alert 공유)
    if (panel && !panel.querySelector(':scope > .landing-art-alert')) {
      const a = document.createElement('div');
      a.classList.add('landing-art-alert');
      a.textContent = alertText;
      panel.appendChild(a);
    }
    (items || []).forEach((it) => {
      const wrap = document.createElement('div');
      wrap.classList.add('landing-art-wrap');
      if (it.hall && config.halls && config.halls[it.hall]) {
        wrap.classList.add('is-link');
        wrap.dataset.hall = it.hall;
      }
      const img = document.createElement('img');
      img.classList.add('landing-art');
      img.src = it.src;
      img.alt = '';
      if (it.activeSrc) {
        img.dataset.inactiveSrc = it.src;
        img.dataset.activeSrc   = it.activeSrc;
      }
      wrap.appendChild(img);
      container.appendChild(wrap);
    });
  };

  buildPanel('landing-items-left',   lg.left);
  buildPanel('landing-items-center', lg.center);
  buildPanel('landing-items-right',  lg.right);
}

// ============================================================
//  LANDING → MAIN VIEW transition
// ============================================================
function initLanding() {
  const lg = config.landing || {};
  const alertMs = lg.alertMs || 1500;

  const wraps = document.querySelectorAll('.landing-art-wrap');

  // panel 별 단일 alert 의 표시 타이머 — 패널마다 따로 추적
  const panelAlertTimer = new WeakMap();

  wraps.forEach((wrap) => {
    const hallKey  = wrap.dataset.hall || null;
    const hasHall  = hallKey && config.halls && config.halls[hallKey];
    const img      = wrap.querySelector('.landing-art');
    const activeSrc   = img && img.dataset.activeSrc;
    const inactiveSrc = img && img.dataset.inactiveSrc;

    wrap.addEventListener('pointerenter', () => {
      if (!hasHall) return;
      wrap.classList.add('art-glow');
      if (img && activeSrc) img.src = activeSrc;
    });
    wrap.addEventListener('pointerleave', () => {
      if (!hasHall) return;
      wrap.classList.remove('art-glow');
      if (img && inactiveSrc) img.src = inactiveSrc;
    });

    wrap.addEventListener('click', () => {
      if (hasHall) {
        enterHall(hallKey);
        return;
      }
      // 비활성 — 패널의 단일 alert 를 작품 위쪽에 띄움
      const panelEl = wrap.closest('.landing-panel');
      if (!panelEl) return;
      const alertEl = panelEl.querySelector(':scope > .landing-art-alert');
      if (!alertEl) return;
      const wRect = wrap.getBoundingClientRect();
      const pRect = panelEl.getBoundingClientRect();
      const cx = wRect.left + wRect.width  / 2 - pRect.left;
      const cy = wRect.top  + wRect.height / 2 - pRect.top;   // 작품 정 중앙
      alertEl.style.left = cx + 'px';
      alertEl.style.top  = cy + 'px';
      alertEl.classList.add('show');
      clearTimeout(panelAlertTimer.get(panelEl));
      panelAlertTimer.set(panelEl, setTimeout(() => alertEl.classList.remove('show'), alertMs));
    });
  });
}

// ============================================================
//  GLOBAL POINTER POSITION TRACKER (+ EMA 스무딩)
//  - 터치/마우스 모든 입력의 마지막 좌표를 항상 보관.
//  - 터치는 손가락이 정지하면 pointermove 가 안 오므로 pointerover/pointerdown 도 갱신용으로 들음.
//  - _lastPointer*  : 원시 좌표 (event.clientX/Y 그대로)
//  - _smoothPointer*: EMA 스무딩된 좌표 — IR/터치 장비 노이즈 (몇 px 떨림) 완화
//                     threshold 비교 (landing arm 80px, C advance 60px) 에 사용
//  - 용도: 화면 전환 직후 "사용자가 같은 위치에 손이 있는지" 판단해서 자동 트리거 차단,
//          노이즈로 인한 잘못된 dwell/threshold 트리거 방지
// ============================================================
let _lastPointerX = 0, _lastPointerY = 0;
let _smoothPointerX = 0, _smoothPointerY = 0;
let _smoothInitialized = false;
const POINTER_SMOOTH_ALPHA = 0.35;   // 0 = 완전 스무딩 (반응 없음) ~ 1 = no smoothing
['pointermove', 'pointerover', 'pointerdown'].forEach((evt) => {
  window.addEventListener(evt, (e) => {
    if (typeof e.clientX !== 'number') return;
    _lastPointerX = e.clientX;
    _lastPointerY = e.clientY;
    if (!_smoothInitialized) {
      _smoothPointerX = e.clientX;
      _smoothPointerY = e.clientY;
      _smoothInitialized = true;
    } else {
      _smoothPointerX = _smoothPointerX * (1 - POINTER_SMOOTH_ALPHA) + e.clientX * POINTER_SMOOTH_ALPHA;
      _smoothPointerY = _smoothPointerY * (1 - POINTER_SMOOTH_ALPHA) + e.clientY * POINTER_SMOOTH_ALPHA;
    }
  }, { passive: true, capture: true });
});

// 우클릭 메뉴 / 더블클릭 줌 만 차단 (메뉴는 click 기반으로 동작하므로 일반 click 은 통과).
['dblclick', 'contextmenu', 'auxclick'].forEach((evt) => {
  window.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true });
});

// ============================================================
//  HALL ENTRY / EXIT
// ============================================================
let currentHall = null;
let _hallEnteredAt = 0;            // 진입 직후 중복 click 방지 게이트
let _bPhase = 'dark';              // B관 phase: 'dark' → 정면 클릭 → 'light' (자산 + 핫스팟 swap)

function enterHall(key) {
  const hall = config.halls && config.halls[key];
  if (!hall) return;
  currentHall = key;
  _hallEnteredAt = Date.now();     // 이후 ~500ms 의 center-top click 은 무시 (잔여 이벤트 차단)
  _immersiveOn = false;            // 이전 세션 잔여 immersive 플래그 정리

  // BGM/SFX 진입 신호 — A: 포탈 SFX + a-note BGM. B: 전환 영상에 사운드 포함 → BGM 은 영상 끝난 뒤에 시작 (아래 transition onDone 에서)
  if (key === 'A') {
    playSFX('portal');
    BGM.play('a-note');
  } else if (key === 'B') {
    BGM.stop();   // 현재 BGM(lobby) 정리, transition 사운드 가 깔끔하게 들리게
  }

  const landing  = document.getElementById('landing');
  const mainView = document.getElementById('main-view');

  applyHallConfig(hall);

  // glb-ui 는 A관 전용 — 다른 hall 진입 시 항상 닫고 V 상태 초기화
  if (window._closeHallUI) window._closeHallUI();
  _uiState.selectedBg = null;
  _uiState.selectedMaterial = null;
  document.querySelectorAll('.glb-color.active').forEach((d) => d.classList.remove('active'));

  // A관: 중앙위 패널 기본 배경 = bg-black + 고정문구/UI 표시
  if (key === 'A') {
    preloadAllBgs();   // 5종 bg 미리 캐싱 — 클릭 시 깜빡임 차단
    applyBgImage(assetUrl('assets/works/A/bg/bg-black.png'));
    const caption = document.getElementById('glb-caption');
    if (caption) caption.style.display = '';
    const glbUi = document.getElementById('glb-ui');
    if (glbUi) glbUi.style.display = '';
  } else {
    // 다른 hall 에서는 A관 전용 자산 숨김
    const panel = document.getElementById('center-top');
    if (panel) panel.style.backgroundImage = '';
    const caption = document.getElementById('glb-caption');
    if (caption) caption.style.display = 'none';
    const glbUi = document.getElementById('glb-ui');
    if (glbUi) glbUi.style.display = 'none';
  }

  // B관 phase 는 항상 dark 로 시작
  if (key === 'B') _bPhase = 'dark';

  // 진입 전환 영상 (예: B관 4 panel mp4) — 한 번에 보이게 + 깜빡임 차단을 위한 흐름:
  //  1) transition fade-in 즉시: mainView visible + landing hidden 미리 토글 (transition 오버레이가 둘 다 가림)
  //  2) transition 동안 hall 자산 preload (이미지 decode 끝까지 보장)
  //  3) 비디오 ended AND 자산 preload 둘 다 끝나면 → transition fade-out → mainView 한 번에 노출
  if (hall.transition) {
    landing.classList.add('hidden');
    mainView.classList.add('visible');
    init3DViewer();
    startHallSlides(hall);
    playHallTransition(hall.transition, hall, () => {
      // B 전환 영상 종료 — dark BGM 시작 (영상 사운드와 겹침 없이 자연스럽게)
      if (key === 'B') BGM.play('b-dark');
      if (hall.storytelling) runStorytelling(hall, () => showHallHints(hall));
      else showHallHints(hall);
    });
    return;
  }

  landing.classList.add('hidden');
  mainView.classList.add('visible');

  // 3D viewer (헬멧 GLB) 초기화 — center-top 의 canvas 기준
  init3DViewer();
  // 슬라이더 위치 리셋 + 말풍선 hide
  startHallSlides(hall);

  // C관: storytelling 페이즈가 있으면 immersive 위에 비디오 오버레이로 먼저 재생.
  //  storytelling 종료 후 onDone → immersive hint 표시.
  if (hall.storytelling) {
    runStorytelling(hall, () => showHallHints(hall));
  } else {
    showHallHints(hall);
  }
}

// 4 패널 mp4 동시 재생.
//  - fade-in: 빠르게 (0.2s) — 그 동안만 transition 아래 mainView 가 일부 노출되니 짧게.
//  - fade-out: 느리게 (0.9s) — mainView 가 한 번에 보이는 cross-fade 시간 확보.
//  - 비디오 ended AND hall 자산 preload 둘 다 끝나면 finish() — panel 들이 순차로
//    그려지는 게 아니라 한 번에 노출.
function playHallTransition(t, hall, onDone) {
  const overlay = document.getElementById('hall-transition');
  if (!overlay) { onDone && onDone(); return; }
  const setSrc = (id, src) => {
    const v = document.getElementById(id);
    if (!v || !src) return null;
    v.src = src;
    v.currentTime = 0;
    v.style.visibility = '';   // 이전 hide 잔존 제거
    const panel = v.closest('.ht-panel');
    if (panel) panel.style.background = '';   // 이전 transparent 잔존 제거
    return v;
  };
  // 새 진입 — overlay 검정 bg 복원
  overlay.style.background = '';
  const vids = [
    setSrc('ht-left',  t.left),
    setSrc('ht-front', t.front),
    setSrc('ht-right', t.right),
    setSrc('ht-floor', t.floor),
  ].filter(Boolean);
  if (vids.length === 0) { onDone && onDone(); return; }

  // fade-in 빠르게 — 그 동안 노출되는 짧은 frame 만 깜빡 가능성 최소화
  overlay.style.transition = 'opacity 0.2s ease';
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');

  // 비디오 ended — FIRST 가 끝나면 즉시 resolve.
  //  4개 panel 길이 똑같지만 브라우저 jitter 로 100ms+ 차이 → 한 장씩 freeze 되어 보이는 현상 차단.
  //  첫 ended 시점에 나머지 panel 도 함께 pause + fade-out 시작.
  const videoEndedP = new Promise((resolve) => {
    vids.forEach((v) => v.addEventListener('ended', () => resolve(), { once: true }));
    setTimeout(resolve, 20000);
  });
  // hall 자산 preload (image decode 보장) — 17초 동안 끝나야 함
  const hallPreloadP = preloadHallAssets(hall);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (onDone) onDone();
    // 모든 비디오 + 패널 동시 hide — jitter 차단
    vids.forEach((v) => {
      try { v.pause(); } catch {}
      try { v.style.visibility = 'hidden'; } catch {}
    });
    overlay.querySelectorAll('.ht-panel').forEach((p) => { p.style.background = 'transparent'; });
    // overlay 검정 bg 제거 → mainView(dark phase) 가 즉시 보이게
    overlay.style.background = 'transparent';
    // fade-out 짧게 (0.18s) — 검정 시간 거의 없음
    overlay.style.transition = 'opacity 0.18s ease';
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  };
  Promise.all([videoEndedP, hallPreloadP]).then(finish);

  // 4 비디오 모두 첫 frame 디코딩 완료될 때까지 visibility:hidden → 그 뒤 동시 show.
  //  play() Promise 해결 시점 + rAF 한 프레임 후가 첫 frame 페인트된 시점.
  vids.forEach((v) => { v.style.visibility = 'hidden'; });
  const playPromises = vids.map((v) => {
    const p = v.play();
    if (p && p.catch) p.catch((err) => console.warn('[transition] play failed:', err));
    return p && p.then ? p.catch(() => {}) : Promise.resolve();
  });
  Promise.all(playPromises).then(() => {
    // 첫 frame 페인트 보장 — 추가 rAF 2번 후 visibility 복구 (4 video 한 frame 에 동시 노출)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      vids.forEach((v) => { v.style.visibility = ''; });
    }));
  });
}

// B 전환 mp4 4개 미리 fetch — 사용자가 lobby 머무는 동안 백그라운드로 캐시.
//  클릭 시점엔 canplay 즉시, 4 panel 시작 시점 차이 최소화.
let _bTransitionPreloaded = false;
function preloadHallTransitionVideos() {
  if (_bTransitionPreloaded) return;
  _bTransitionPreloaded = true;
  const B = config.halls && config.halls.B;
  if (!B || !B.transition) return;
  ['left', 'front', 'right', 'floor'].forEach((k) => {
    const url = B.transition[k];
    if (!url) return;
    // fetch 로 실제 다운로드 시작 → 브라우저 캐시에 저장. <video src> 가 같은 URL 쓰면 cache hit.
    fetch(url, { mode: 'cors', credentials: 'omit' }).catch(() => {});
  });
}

// hall 의 4 panel 자산을 preload (image decode 끝까지 보장 → mainView 한 번에 노출 보장)
function preloadHallAssets(hall) {
  if (!hall) return Promise.resolve();
  const urls = [];
  const collect = (obj) => {
    if (!obj) return;
    if (typeof obj === 'string') { urls.push(obj); return; }
    if (obj.image) urls.push(obj.image);
    if (obj.bg) urls.push(obj.bg);
    if (obj.header) urls.push(obj.header);
    if (obj.exit && obj.exit.image) urls.push(obj.exit.image);
    if (obj.slides && Array.isArray(obj.slides.items)) {
      obj.slides.items.forEach((it) => { if (it && it.image) urls.push(it.image); });
    }
    if (Array.isArray(obj.slides)) {
      obj.slides.forEach((it) => { if (it && it.image) urls.push(it.image); });
    }
  };
  collect(hall.left);
  collect(hall.centerTop);
  collect(hall.centerBottom);
  collect(hall.right);
  // lightPhase 도 같이 (B관 dark → light swap 시 또 깜빡임 안 나게)
  if (hall.lightPhase) {
    ['left', 'front', 'right', 'floor'].forEach((k) => {
      if (hall.lightPhase[k]) urls.push(hall.lightPhase[k]);
    });
    (hall.lightPhase.hotspots || []).forEach((h) => { if (h.popupImage) urls.push(h.popupImage); });
  }
  return Promise.all(urls.map(preloadImage));
}

function returnToLobby() {
  const landing  = document.getElementById('landing');
  const mainView = document.getElementById('main-view');
  // 나갈 때 — A / 이머시브 에서 나오면 포탈 SFX (B 도 동일 처리)
  if (currentHall === 'A' || _immersiveOn || currentHall === 'B') {
    playSFX('portal');
  }
  BGM.play('lobby');
  mainView.classList.remove('visible');
  landing.classList.remove('hidden');
  stopHallSlides();
  // 다음 관람자를 위해 색상/배경 원복 + 서브 UI 닫기
  resetMaterialColor();
  resetBackgroundColor();
  closeAllSubUIs();
  hideHallPopup();
  hideEntryGuide();
  _bPhase = 'dark';
  _immersiveOn = false;
  currentHall = null;
}

// ============================================================
//  A관 이머시브 공간 (sub-mode) — 우 슬라이드 4 클릭 → 4 패널 swap
//   - 자산: assets/works/A/immersive/{left,front,right,floor}.png
//   - 5 popup: 좌 2(1,3) / 정면 2(2,4) / 우 1(5)
//   - exit: 우 패널 toggle = 로비로 나가기
// ============================================================
let _immersiveOn = false;
function enterImmersiveA() {
  const hall = config.halls && config.halls.A;
  if (!hall || !hall.immersive) return;
  if (_immersiveOn) return;
  _immersiveOn = true;

  playSFX('portal');
  BGM.play('a-immersive');

  // 잔여 UI 정리
  document.querySelectorAll('.color-variation.show').forEach((c) => c.classList.remove('show'));
  if (window._closeHallUI) window._closeHallUI();
  hideHallPopup();
  hideEntryGuide();
  const caption = document.getElementById('glb-caption');
  if (caption) caption.style.display = 'none';
  const glbUi = document.getElementById('glb-ui');
  if (glbUi) glbUi.style.display = 'none';

  // 검정 오버레이로 swap 순간 가림 — 흰 panel-bg 깜빡임 + 패널별 시차 노출 차단
  const cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;opacity:0;transition:opacity 0.18s ease;pointer-events:none';
  document.body.appendChild(cover);
  requestAnimationFrame(() => { cover.style.opacity = '1'; });

  // 4 panel 자산 preload (decode 끝까지)
  const im = hall.immersive;
  const srcs = [
    im.left && im.left.image,
    im.centerTop && im.centerTop.image,
    im.centerBottom && im.centerBottom.image,
    im.right && im.right.image,
  ].filter(Boolean);
  const decodes = srcs.map((src) => {
    const i = new Image();
    i.src = src;
    return i.decode ? i.decode().catch(() => {}) : new Promise((r) => { i.onload = r; i.onerror = r; });
  });

  // 검정 fade-in 끝난 뒤(180ms) + decode 끝난 뒤 swap → 한 프레임 후 검정 fade-out
  Promise.all([Promise.all(decodes), new Promise((r) => setTimeout(r, 180))]).then(() => {
    requestAnimationFrame(() => {
      applyHallConfig(im);
      const panel = document.getElementById('center-top');
      if (panel) panel.style.backgroundImage = '';
      requestAnimationFrame(() => {
        cover.style.opacity = '0';
        setTimeout(() => cover.remove(), 250);
      });
    });
  });
}

function exitImmersiveA() {
  if (!_immersiveOn) return;
  _immersiveOn = false;
  // 원래 A 작가노트 모드로 복원
  const hall = config.halls && config.halls.A;
  if (hall) {
    applyHallConfig(hall);
    applyBgImage(assetUrl('assets/works/A/bg/bg-black.png'));
    const caption = document.getElementById('glb-caption');
    if (caption) caption.style.display = '';
    const glbUi = document.getElementById('glb-ui');
    if (glbUi) glbUi.style.display = '';
  }
}

function applyHallConfig(hall) {
  const mainView = document.getElementById('main-view');
  if (hall.background) mainView.style.background = hall.background;

  // 말풍선 스타일 (light=흰색 / dark=검정 반투명) — 패널 모드와 무관하게 hall 전체 결정
  const bubble = document.getElementById('hall-bubble');
  if (bubble) {
    if (hall.bubbleStyle === 'dark') bubble.classList.add('dark');
    else bubble.classList.remove('dark');
  }

  // 좌 패널 — image(정적) 또는 slides(슬라이더). 둘 중 하나만 사용.
  if (hall.left) {
    const hintEl = document.getElementById('hall-hint-left');
    if (hintEl) hintEl.textContent = hall.left.hint || '';
    if (hall.left.image) {
      buildHallStaticPanel('hall-left', 'hall-left-static', hall.left.image);
    } else {
      clearHallStaticPanel('hall-left', 'hall-left-static');
      buildHallLeftSlides(hall.left.slides || []);
    }
  }

  // 중앙 위 — image(정적) 또는 model(GLB). 정적이면 canvas/UI 숨김
  if (hall.centerTop) {
    const hi = document.getElementById('hall-hint-center');
    if (hi) hi.textContent = hall.centerTop.hint || '';

    const isImageMode = hall.centerTop.type === 'image' || (!!hall.centerTop.image && !hall.centerTop.model);
    setCenterTopMode(isImageMode ? 'image' : 'model', hall.centerTop.image);

    // SVG UI — image 모드일 땐 메뉴/액션 의미 없음. model 모드에서만 크기 적용.
    const ui = hall.centerTop.ui;
    const uiEl = document.getElementById('hall-ui');
    if (uiEl && !isImageMode) {
      const sz = ui && ui.size;
      const sizeStr = sz == null ? '22%'
        : (typeof sz === 'number' ? sz + '%' : sz);
      uiEl.style.setProperty('--hall-ui-size', sizeStr);
    }
  }

  // 중앙 아래 — 바닥 이미지
  if (hall.centerBottom && hall.centerBottom.image) {
    document.getElementById('center-bottom-img').src = hall.centerBottom.image;
  }

  // 우측 토글 — 단일 이미지 + 호버 라벨 (호버 시 brightness 만 적용)
  //   toggle.alwaysOverlay = true 면 평소에도 검정 반투명 + 라벨 노출 (호버 시 더 진하게)
  if (hall.right && hall.right.toggle) {
    const t = hall.right.toggle;
    const img = document.getElementById('hall-toggle-img');
    const lbl = document.getElementById('hall-toggle-label');
    const wrap = document.getElementById('hall-right-toggle');
    if (img) img.src = t.image || t.default || '';
    if (lbl) lbl.textContent = t.label || '';
    if (wrap) wrap.classList.toggle('always-overlay', !!t.alwaysOverlay);
  }

  // 우 패널 5:2 — seamless 모드: 같은 회화가 두 영역에 걸쳐 한 장처럼 이어 보이게
  //   .hall-right.seamless 가 회색 띠 제거 + 좌(5)/우(2) 이미지를 같은 스케일로 배치
  const rightWrap = document.getElementById('hall-right');
  if (rightWrap) rightWrap.classList.toggle('seamless', !!(hall.right && hall.right.seamless));

  // immersive 모드 — 우 패널 단일 컬럼 + gradient exit overlay
  if (rightWrap) rightWrap.classList.toggle('immersive', !!hall.immersiveMode);

  // 우 패널 layout 분기:
  //  - layout-note (A관): bg + header + 카드 슬라이드 + exit 버튼 (단일 모니터 1면)
  //  - 기본(B관): 5:2 split — slides(좌5) + toggle(우2)
  const isLayoutNote = !!(hall.right && hall.right.bg);
  if (rightWrap) rightWrap.classList.toggle('layout-note', isLayoutNote);

  if (isLayoutNote) {
    // A관 — 작가노트존 자산 (bg/header). exit 는 hall.right.toggle 이 hall-toggle-img 로 적용 (위쪽 분기).
    const r = hall.right;
    const setImgSrc = (id, src) => {
      const el = document.getElementById(id);
      if (el && src) el.src = src;
    };
    setImgSrc('hall-right-bg', r.bg);
    setImgSrc('hall-right-header', r.header);
    clearHallStaticPanel('hall-right-slides', 'hall-right-static');
    buildHallNoteSlides((r.slides && r.slides.items) || []);
  } else if (hall.right && hall.right.image) {
    buildHallStaticPanel('hall-right-slides', 'hall-right-static', hall.right.image);
    const track = document.getElementById('hall-slide-track');
    if (track) track.innerHTML = '';
  } else if (hall.right && hall.right.slides) {
    clearHallStaticPanel('hall-right-slides', 'hall-right-static');
    const items = hall.right.slides.items
      || (hall.right.slides.sources || []).map((src) => ({ image: src }));
    buildHallSlides(items);
  }

  // 핫스팟(+버튼) 배치 — 빌드된 슬라이드/패널 위에 분배
  // hall.hotspots(글로벌) + left.slides[N].popups(슬라이드별 invisible 클릭존) 둘 다 등록
  const computedHotspots = [...(hall.hotspots || [])];
  if (hall.left && Array.isArray(hall.left.slides)) {
    hall.left.slides.forEach((s, idx) => {
      (s.popups || []).forEach((p) => {
        computedHotspots.push({
          panel: 'left',
          slide: idx,
          x: p.x,
          y: p.y,
          popupImage: p.popupImage,
          colorVariation: p.colorVariation,   // slide-4: HTML color variation 카드 toggle
          invisible: true,    // 자산 안에 +가 이미 그려져 있어 추가 마크 안 그림
        });
      });
    });
  }
  placeHallHotspots(computedHotspots);
}

// 정적 이미지 패널 — 슬라이드 트랙을 비우고 단일 이미지(div 래퍼 + img)로 채움
//  - 핫스팟이 자식으로 들어가야 하므로 <img> 가 아닌 <div> 래퍼를 만들고 그 안에 <img> 배치
//  - 같은 컨테이너 안의 슬라이드 트랙은 비워둠 (재진입 시 찌꺼기 방지)
function buildHallStaticPanel(containerId, staticElId, src) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let wrap = document.getElementById(staticElId);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = staticElId;
    wrap.className = 'hall-static-img';
    const img = document.createElement('img');
    img.alt = '';
    wrap.appendChild(img);
    container.appendChild(wrap);
  }
  const img = wrap.querySelector('img');
  if (img) img.src = src;
  const track = container.querySelector('.hall-left-track, .hall-slide-track');
  if (track) track.innerHTML = '';
}
function clearHallStaticPanel(containerId, staticElId) {
  const el = document.getElementById(staticElId);
  if (el) el.remove();
}

// B관 phase 전환 — 어두운배경 정면(해태) 클릭 → 밝은배경 자산 swap + lightPhase.hotspots 노출.
//  centerTop 패널 click 만 트리거. 핫스팟/하위 UI/팝업 안 으로 가는 click 은 무시.
function initBPhaseSwap() {
  const centerTop = document.getElementById('center-top');
  if (!centerTop) return;
  // 해태 ROI — 자산 좌표 기준 약 x 35~65%, y 35~85% (정면 패널 1920×1200, 자산 비율 일치)
  const HAETAE_ROI = { x0: 0.35, x1: 0.65, y0: 0.35, y1: 0.85 };
  centerTop.addEventListener('click', (e) => {
    if (currentHall !== 'B') return;
    if (_bPhase !== 'dark') return;
    if (Date.now() - _hallEnteredAt < 500) return;   // 진입 직후 잔여 이벤트 차단
    if (e.target && (
      (e.target.closest && e.target.closest('.hall-hotspot')) ||
      (e.target.closest && e.target.closest('.hall-ui')) ||
      (e.target.closest && e.target.closest('.hall-sub-ui')) ||
      (e.target.closest && e.target.closest('.hall-popup'))
    )) return;
    // 해태 영역만 트리거 — 패널 어디든이 아니라 해태(석상) 위 클릭에만
    const r = centerTop.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top)  / r.height;
    if (px < HAETAE_ROI.x0 || px > HAETAE_ROI.x1 || py < HAETAE_ROI.y0 || py > HAETAE_ROI.y1) return;
    activateBLightPhase();
  });
}

function activateBLightPhase() {
  const hall = config.halls && config.halls.B;
  const lp = hall && hall.lightPhase;
  if (!lp) return;
  _bPhase = 'light';
  BGM.play('b-light');   // dark → light BGM 전환 (cross-fade)

  // 4 자산 모두 decode 끝나야 swap — 한 프레임에 한 번에 전환 (panel 하나씩 깜빡임 방지)
  const srcs = [lp.left, lp.front, lp.right, lp.floor].filter(Boolean);
  const decodes = srcs.map((src) => {
    const im = new Image();
    im.src = src;
    return im.decode ? im.decode().catch(() => {}) : new Promise((r) => { im.onload = r; im.onerror = r; });
  });
  Promise.all(decodes).then(() => {
    requestAnimationFrame(() => {
      if (lp.left)  buildHallStaticPanel('hall-left', 'hall-left-static', lp.left);
      if (lp.front) setCenterTopMode('image', lp.front);
      if (lp.right) {
        buildHallStaticPanel('hall-right-slides', 'hall-right-static', lp.right);
        const toggleImg = document.getElementById('hall-toggle-img');
        if (toggleImg) toggleImg.src = lp.right;
      }
      if (lp.floor) {
        const cbImg = document.getElementById('center-bottom-img');
        if (cbImg) cbImg.src = lp.floor;
      }
      placeHallHotspots(lp.hotspots || []);
    });
  });
}

// 중앙 위 모드 전환 — 'model'(GLB) 또는 'image'(정적). 정적이면 캔버스/UI 숨김
function setCenterTopMode(mode, imageSrc) {
  const panel = document.getElementById('center-top');
  if (!panel) return;
  const canvas = document.getElementById('three-canvas');
  const glbZone = document.getElementById('hall-glb-zone');
  const ui = document.getElementById('hall-ui');

  let wrap = document.getElementById('center-top-static');
  if (mode === 'image') {
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'center-top-static';
      wrap.className = 'hall-static-img';
      const img = document.createElement('img');
      img.alt = '';
      wrap.appendChild(img);
      panel.appendChild(wrap);
    }
    if (imageSrc) wrap.querySelector('img').src = imageSrc;
    if (canvas)  canvas.style.display = 'none';
    if (glbZone) glbZone.style.display = 'none';
    if (ui)      ui.style.display = 'none';
  } else {
    if (wrap) wrap.remove();
    if (canvas)  canvas.style.display = '';
    if (glbZone) glbZone.style.display = '';
    if (ui)      ui.style.display = '';
  }
}

// ============================================================
//  HALL — 우측 작가노트 슬라이드 (우→좌 끊김없는 가로 마퀴)
// ============================================================

// 우측 작가노트 슬라이드 — 큰 숫자 + 제목 + 본문 + 사진(또는 placeholder), 3세트 복제
function buildHallSlides(items) {
  const track = document.getElementById('hall-slide-track');
  if (!track) return;
  track.innerHTML = '';
  if (!items || items.length === 0) return;
  track.style.width = '';
  track.style.transform = 'translateX(0)';
  track.style.transition = 'none';
  for (let copy = 0; copy < 3; copy++) {
    items.forEach((it) => {
      const slide = document.createElement('div');
      slide.classList.add('hall-slide');
      const photoHtml = it.image
        ? `<img src="${it.image}" alt="">`
        : `<div class="hall-slide-photo-placeholder">${(it.placeholder || '준비중').replace(/\n/g, '<br>')}</div>`;
      slide.innerHTML = `
        <div class="hall-slide-photo">${photoHtml}</div>
        <div class="hall-slide-text">
          <h3 class="hall-slide-title">${it.title || ''}</h3>
          <p class="hall-slide-body">${(it.body || '').replace(/\n/g, '<br>')}</p>
        </div>
      `;
      track.appendChild(slide);
    });
  }
}

// layout-note 전용 — 카드형 자산 1장만 풀-블리드. 3세트 복제(끊김없는 마퀴용).
function buildHallNoteSlides(items) {
  const track = document.getElementById('hall-slide-track');
  if (!track) return;
  track.innerHTML = '';
  if (!items || items.length === 0) return;
  track.style.width = '';
  track.style.transform = 'translateX(0)';
  track.style.transition = 'none';
  for (let copy = 0; copy < 3; copy++) {
    items.forEach((it, idx) => {
      const slide = document.createElement('div');
      slide.classList.add('hall-slide');
      slide.dataset.idx = String(idx);
      if (it.onClickImmersive) slide.dataset.immersive = '1';
      slide.innerHTML = `<img class="hall-slide-image" src="${it.image || ''}" alt="">`;
      track.appendChild(slide);
    });
  }
  // 이머시브 트리거 — 슬라이드 중앙 50% (25~75%) 클릭 시 enterImmersiveA.
  //  양 끝(0~25%, 75~100%) 은 clickHalves(prev/next) 양보.
  track.querySelectorAll('.hall-slide[data-immersive]').forEach((s) => {
    s.addEventListener('click', (e) => {
      const r = s.getBoundingClientRect();
      const xRatio = (e.clientX - r.left) / r.width;
      if (xRatio < 0.25 || xRatio > 0.75) return;
      e.stopPropagation();
      enterImmersiveA();
    }, true);
  });
}

// 좌측 사진 슬라이드 — 정방형, 사진만 (핫스팟은 placeHallHotspots 가 별도 배치)
function buildHallLeftSlides(slides) {
  const track = document.getElementById('hall-left-track');
  if (!track) return;
  track.innerHTML = '';
  if (!slides || slides.length === 0) return;
  track.style.width = '';
  track.style.transform = 'translateX(0)';
  track.style.transition = 'none';
  for (let copy = 0; copy < 3; copy++) {
    slides.forEach((s, idx) => {
      const slide = document.createElement('div');
      slide.classList.add('hall-left-slide');
      slide.dataset.idx = String(idx);
      slide.innerHTML = `<img src="${s.image}" alt="">`;
      // 슬라이드 4 (idx 3) — 색상 variation 카드 overlay 삽입 (4 동그라미 + 흰 체크).
      //  data-color-index: 1..4 → slide-4-color-N.png 매핑
      //  파(2) / 빨(1) / 청록(3) / 노(4) 순으로 표시 — 사용자 명시 매핑
      if (idx === 3) {
        slide.insertAdjacentHTML('beforeend', `
          <div class="color-variation" data-variation>
            <button class="cv-close" data-close aria-label="닫기"></button>
            <div class="cv-label">Color Variation</div>
            <div class="cv-dots">
              <button class="cv-dot" data-color-index="2" style="--c:#1f4ea0" aria-label="파랑"></button>
              <button class="cv-dot" data-color-index="1" style="--c:#b02a2a" aria-label="빨강"></button>
              <button class="cv-dot" data-color-index="3" style="--c:#317c89" aria-label="청록"></button>
              <button class="cv-dot" data-color-index="4" style="--c:#e9b528" aria-label="노랑"></button>
            </div>
          </div>
        `);
      }
      track.appendChild(slide);
    });
  }
  // 색상 variation 동그라미 클릭 핸들러 attach — 3세트 복제 동기화
  initLeftSlide4Variation();
}

// 색상 동그라미 클릭 → 좌 slide 4 자산 swap 만. (GLB 는 중앙 UI 의 작품색상 stage 에서 별도 제어)
function initLeftSlide4Variation() {
  const dots = document.querySelectorAll('.color-variation .cv-dot');
  if (dots.length === 0) return;
  dots.forEach((dot) => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const ci = +dot.dataset.colorIndex;
      const detail4Map = {
        1: assetUrl('assets/works/A/note/slide-4-color-1.png'),
        2: assetUrl('assets/works/A/note/slide-4-color-2.png'),
        3: assetUrl('assets/works/A/note/slide-4-color-3.png'),
        4: assetUrl('assets/works/A/note/slide-4-color-4.png'),
      };
      const detail4 = detail4Map[ci];
      if (detail4) updateLeftSlide4(detail4);
      // 모든 복제본의 동그라미 active 동기화 (좌 슬라이드 안 카드만 — 중앙 UI 와 무관)
      document.querySelectorAll('.color-variation .cv-dot').forEach((d) => {
        d.classList.toggle('active', +d.dataset.colorIndex === ci);
      });
    });
  });
  // 닫기(+) 버튼 — 카드 닫기
  document.querySelectorAll('.color-variation .cv-close').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.color-variation');
      if (card) card.classList.remove('show');
    });
  });
}

// 핫스팟 배치 — config.halls.<key>.hotspots 를 받아 적절한 패널/슬라이드에 +버튼 삽입
//  panel : 'left' | 'right' | 'centerTop' | 'centerBottom'
//  slide : (left/right 일 때) 슬라이드 인덱스 (0-base)
//  x, y  : 지칭 지점 좌표 (% 또는 'NNpx' 등 CSS 단위)
//  size  : 버튼 직경 px (기본 28)
//  message : 클릭 시 말풍선에 표시할 텍스트
function placeHallHotspots(hotspots) {
  // 우선 기존 핫스팟 정리 (다른 hall 진입 시 잔존 방지)
  document.querySelectorAll('.hall-hotspot').forEach((el) => el.remove());
  if (!hotspots || hotspots.length === 0) return;

  // seamless 모드 (B관 우 패널) — 이미지가 5/7+2/7 두 셀에 걸쳐 그려짐.
  //  hall-right-static 안에서 x % 는 5/7 영역만 커버 → 실제 이미지의 x % 와 어긋남.
  //  보정: x % → x % × 7/5 (단, ≤ 100%) → static 안에서 visual 위치 일치.
  const rightWrap = document.getElementById('hall-right');
  const seamless = rightWrap && rightWrap.classList.contains('seamless');

  hotspots.forEach((h) => {
    const targets = findHotspotTargets(h);
    targets.forEach((tgt) => {
      const btn = document.createElement('div');
      btn.classList.add('hall-hotspot');
      if (h.invisible) btn.classList.add('hall-hotspot-invisible');
      // seamless + right panel 일 때만 x 보정
      let xVal = h.x;
      if (seamless && h.panel === 'right' && typeof xVal === 'string' && xVal.endsWith('%')) {
        const n = parseFloat(xVal);
        if (n <= 71.4) xVal = (n * 1.4).toFixed(2) + '%';
        // n > 71.4 인 경우는 toggle 영역에 그려진 + (350% width 자산) 인데 현재 케이스 아님
      }
      btn.style.left = (typeof xVal === 'number') ? xVal + '%' : (xVal || '50%');
      btn.style.top  = (typeof h.y === 'number') ? h.y + '%' : (h.y || '50%');
      btn.dataset.message = h.message || '';
      if (h.popupImage) btn.dataset.popupImage = h.popupImage;
      if (h.colorVariation) btn.dataset.colorVariation = '1';
      if (h.popupSide) btn.dataset.popupSide = h.popupSide;
      btn.setAttribute('aria-label', h.message || h.popupImage || h.colorVariation ? '자세히 보기' : '');
      tgt.appendChild(btn);
    });
  });
}

function findHotspotTargets(h) {
  // 정적 이미지 패널이 활성화된 경우 우선 — 단일 타겟(이미지 컨테이너) 반환
  //   B관처럼 left/right 가 슬라이드가 아니라 정적 이미지일 때 적용됨
  const staticIdMap = {
    left:         'hall-left-static',
    right:        'hall-right-static',
    centerTop:    'center-top-static',
  };
  const sid = staticIdMap[h.panel];
  if (sid) {
    const sel = document.getElementById(sid);
    if (sel) return [sel];
  }

  // left/right 슬라이더는 3세트 복제됨 → 같은 슬라이드 인덱스의 모든 복제본에 +버튼 추가
  if (h.panel === 'left' || h.panel === 'right') {
    const trackId = h.panel === 'left' ? 'hall-left-track' : 'hall-slide-track';
    const slideClass = h.panel === 'left' ? '.hall-left-slide' : '.hall-slide';
    const track = document.getElementById(trackId);
    if (!track) return [];
    const all = track.querySelectorAll(slideClass);
    const N = Math.max(1, Math.floor(all.length / 3));
    const idx = h.slide || 0;
    if (idx < 0 || idx >= N) return [];
    const targets = [];
    for (let copy = 0; copy < 3; copy++) {
      const s = all[copy * N + idx];
      if (s) targets.push(s);
    }
    return targets;
  }
  // centerTop / centerBottom 등 정적 패널(이미지 모드 아닐 때) 은 해당 패널 자체에 직접 추가
  const idMap = {
    centerTop:    'center-top',
    centerBottom: 'center-bottom',
  };
  const id = idMap[h.panel];
  if (!id) return [];
  const el = document.getElementById(id);
  return el ? [el] : [];
}

function startHallSlides(/* hall */) {
  // 사용자가 직접 드래그. 진입 시 좌·우 슬라이더 초기 위치 + 말풍선 hide + UI close.
  resetAllHallSliders();
  hideHallBubble();
  if (window._closeHallUI) window._closeHallUI();
}

// ============================================================
//  HALL — 진입 hint (가운데 떴다 페이드아웃)
//  좌측: 텍스트 알약 / 중앙위: 이미지
// ============================================================
function showHallHints(hall) {
  // 새 entryGuide (4 panel 안내 + 50% dim) 가 있으면 그것만 사용 — 기존 단일 hint 비활성
  if (hall.entryGuide) {
    showEntryGuide(hall.entryGuide);
    return;
  }
  // 폴백 — 기존 단일 hint (좌/중앙)
  const showOne = (elId, ms) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove('fade-out');
    requestAnimationFrame(() => {
      el.classList.add('show');
      setTimeout(() => {
        el.classList.add('fade-out');
        setTimeout(() => {
          el.classList.remove('show');
          el.classList.remove('fade-out');
        }, 800);
      }, ms);
    });
  };
  if (hall.left && hall.left.hint) showOne('hall-hint-left', hall.left.hintMs || 2200);
  if (hall.centerTop && hall.centerTop.hint) showOne('hall-hint-center', hall.centerTop.hintMs || 2200);
}

// 진입 사용방법 가이드 (4 panel alert + 50% dim) — 각 패널 영역을 탭하면 해당 영역만 dismiss.
function showEntryGuide(eg) {
  const overlay = document.getElementById('hall-entry-guide');
  if (!overlay) return;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt || ''; };
  set('heg-alert-left',          eg.left);
  set('heg-alert-center-top',    eg.centerTop);
  set('heg-alert-right-slides',  eg.rightSlides);
  set('heg-alert-right-exit',    eg.rightExit);
  // 새로 띄울 때 dismissed 상태 초기화
  overlay.querySelectorAll('.heg-cell.dismissed').forEach((c) => c.classList.remove('dismissed'));
  // 텍스트 없는 영역은 dim 자체 안 뜨게 (pre-dismiss)
  const preDismiss = (id, txt) => {
    const cell = document.querySelector(`.heg-cell[data-region="${id}"]`);
    if (cell && !txt) cell.classList.add('dismissed');
  };
  preDismiss('left',          eg.left);
  preDismiss('center-top',    eg.centerTop);
  preDismiss('right-slides',  eg.rightSlides);
  preDismiss('right-exit',    eg.rightExit);
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
}
function hideEntryGuide() {
  const overlay = document.getElementById('hall-entry-guide');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
}
function initEntryGuide() {
  const overlay = document.getElementById('hall-entry-guide');
  if (!overlay) return;
  // 각 영역 cell 만 개별 dismiss. center-bottom 은 dim 없음 → skip.
  overlay.querySelectorAll('.heg-cell[data-region]').forEach((cell) => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      cell.classList.add('dismissed');
      // 모든 영역이 dismissed 되면 overlay 자체도 숨김 (pointer-events 회수)
      const remaining = overlay.querySelectorAll('.heg-cell[data-region]:not(.dismissed)').length;
      if (remaining === 0) hideEntryGuide();
    });
  });
}

function stopHallSlides() {
  // no-op (드래그 핸들러는 boot 시 한 번 등록)
}

// ============================================================
//  HALL — Swipe-trigger 슬라이더 (좌·우 패널 공통)
//  - 큰 벽에 설치되는 시스템 → 사람이 손으로 좌/우로 쓸어내리는 제스처를 감지
//    하여 즉시 **다음/이전 슬라이드로 스냅 전환**. 이미지가 손가락을 따라가는
//    드래그-팔로우 방식이 아님.
//  - 가로 누적 이동량이 SWIPE_PX 를 넘으면 advance() 호출 → 트랙이 부드럽게
//    한 슬라이드 만큼 이동. COOLDOWN_MS 동안은 다음 제스처가 무시됨.
//  - 트랙은 3세트 복제 — 끝에서 다음으로 갈 때 phantom 위치로 슬라이드한 뒤
//    가운데 세트의 동일 슬라이드로 transition 없이 점프 → 무한 루프.
// ============================================================
const _sliders = {};

const SWIPE_PX        = 25;     // 이 픽셀 이상 한 방향으로 이동하면 swipe 인정
const COOLDOWN_MS     = 480;    // 두 번 연속 advance 사이 최소 간격
const TRANSITION_MS   = 420;
const TRANSITION_EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

function createHallSlider({ key, wrapId, trackId, slideSelector, clickHalves }) {
  const wrap  = document.getElementById(wrapId);
  const track = document.getElementById(trackId);
  if (!wrap || !track) return null;

  let currentIdx      = 0;
  let lastX           = null;
  let cumulativeDrag  = 0;
  let lastAdvanceTime = 0;

  const slideWidth = () => {
    const s = track.querySelector(slideSelector);
    return s ? s.offsetWidth : 0;
  };
  const slidesPerSet = () => Math.max(1, Math.floor(track.children.length / 3));
  const setWidth     = () => slidesPerSet() * slideWidth();

  function position(idx, smooth) {
    const w  = slideWidth();
    if (!w) return;
    const sw = setWidth();
    track.style.transition = smooth
      ? `transform ${TRANSITION_MS}ms ${TRANSITION_EASE}`
      : 'none';
    track.style.transform = `translateX(${-sw - idx * w}px)`;
  }

  function advance(direction) {
    const n  = slidesPerSet();
    const w  = slideWidth();
    const sw = setWidth();
    if (!w) return;
    // 슬라이드 전환 시 떠 있던 핫스팟 말풍선 닫기 — 이전 슬라이드의 본문이 다음 슬라이드 위에 붕 떠 있는 문제 차단
    hideHallBubble();
    const newIdx = ((currentIdx + direction) % n + n) % n;
    const wrapping =
      (direction > 0 && currentIdx === n - 1) ||
      (direction < 0 && currentIdx === 0);

    if (wrapping) {
      // 가운데 세트의 경계를 넘어 phantom 슬롯으로 부드럽게 이동
      const phantomIdx = direction > 0 ? n : -1;
      track.style.transition = `transform ${TRANSITION_MS}ms ${TRANSITION_EASE}`;
      track.style.transform = `translateX(${-sw - phantomIdx * w}px)`;
      // 전환 끝나면 transition 없이 가운데 세트의 newIdx 로 점프 → 시각적으로 동일
      setTimeout(() => {
        track.style.transition = 'none';
        track.style.transform = `translateX(${-sw - newIdx * w}px)`;
      }, TRANSITION_MS + 30);
    } else {
      track.style.transition = `transform ${TRANSITION_MS}ms ${TRANSITION_EASE}`;
      track.style.transform = `translateX(${-sw - newIdx * w}px)`;
    }

    currentIdx = newIdx;
  }

  if (clickHalves) {
    // 양 끝 25% 만 prev/next 트리거. 중간 50% 는 nav 안 함 (다른 인터랙션 양보 — 이머시브 트리거 등).
    wrap.addEventListener('click', (e) => {
      if (track.children.length === 0) return;
      if (e.target.closest && e.target.closest('.hall-hotspot, .color-variation')) return;
      const r = wrap.getBoundingClientRect();
      const xRatio = (e.clientX - r.left) / r.width;
      if (xRatio > 0.25 && xRatio < 0.75) return;   // 중간 50% — nav 비활성
      const dir = xRatio >= 0.75 ? +1 : -1;
      const now = Date.now();
      if (now - lastAdvanceTime < COOLDOWN_MS) return;
      advance(dir);
      lastAdvanceTime = now;
    });
  } else {
    // 드래그(터치 다운 → 좌/우 swipe) 기반 — 호버만으로는 동작하지 않음.
    //  핫스팟(+버튼) 위에서 시작된 down 은 드래그 시작 안 함 → pointer capture 가 click target 을
    //  wrap 으로 바꿔 핫스팟 click 핸들러가 안 터지던 문제 차단.
    wrap.addEventListener('pointerdown', (e) => {
      if (track.children.length === 0) return;
      // 핫스팟 / color variation 카드 위에서는 드래그 시작 안 함 — 클릭/dot 인터랙션 보존
      if (e.target.closest && e.target.closest('.hall-hotspot, .color-variation')) return;
      lastX = e.clientX;
      cumulativeDrag = 0;
      track.classList.add('dragging');
      try { wrap.setPointerCapture(e.pointerId); } catch {}
    });

    wrap.addEventListener('pointermove', (e) => {
      if (lastX === null) return;
      const delta = e.clientX - lastX;
      lastX = e.clientX;
      cumulativeDrag += delta;

      const now = Date.now();
      if (Math.abs(cumulativeDrag) > SWIPE_PX && now - lastAdvanceTime > COOLDOWN_MS) {
        const direction = cumulativeDrag < 0 ? +1 : -1;
        advance(direction);
        cumulativeDrag = 0;
        lastAdvanceTime = now;
      }
    });

    function endDrag() {
      if (lastX === null) return;
      lastX = null;
      cumulativeDrag = 0;
      track.classList.remove('dragging');
    }
    wrap.addEventListener('pointerup',     endDrag);
    wrap.addEventListener('pointercancel', endDrag);
    wrap.addEventListener('pointerleave',  endDrag);
  }

  const ctrl = {
    reset() {
      currentIdx       = 0;
      lastX            = null;
      cumulativeDrag   = 0;
      lastAdvanceTime  = 0;
      position(0, false);
    },
  };
  _sliders[key] = ctrl;
  return ctrl;
}

function initHallSlider() {
  createHallSlider({
    key:  'left',
    wrapId:  'hall-left-slides',
    trackId: 'hall-left-track',
    slideSelector: '.hall-left-slide',
    clickHalves: true,   // 좌/우 절반 클릭 으로 prev/next (드래그 대신)
  });
  createHallSlider({
    key:  'right',
    wrapId:  'hall-right-slides',
    trackId: 'hall-slide-track',
    slideSelector: '.hall-slide',
    clickHalves: true,
  });
  initHallBubble();
  initHallUI();
}

// ============================================================
//  HALL — 중앙 위 image-based GLB UI (4단 stage: main/bg/material/qr)
//   - center-top 의 GLB 영역(.hall-glb-zone) 바깥 클릭 → main stage spawn
//   - 색상 선택 → V 체크 표시, GLB / 배경 swap
//   - reset 카테고리 별로 V 해제 + 자산 원복
//   - 진입 직후 500ms 의 잔여 클릭은 무시
// ============================================================
const _uiState = {
  open: false,
  selectedBg: null,         // data-bg 값
  selectedMaterial: null,   // data-material 값
};

function initHallUI() {
  const centerTop = document.getElementById('center-top');
  const ui        = document.getElementById('glb-ui');
  const zone      = document.getElementById('hall-glb-zone');
  if (!centerTop || !ui) return;

  // center-top 클릭 → main stage spawn. 토르소 zone(중앙 원형 80%) 안은 회전 전용 → spawn 안 함
  centerTop.addEventListener('click', (e) => {
    if (Date.now() - _hallEnteredAt < 500) return;
    if (_uiState.open) return;
    if (e.target.closest && e.target.closest('.glb-ui')) return;
    if (e.target.closest && e.target.closest('.hall-hint-center')) return;
    if (e.target.closest && e.target.closest('.glb-caption')) return;

    // 좌표 기반 타원 zone — 패널 중앙 ~55% (토르소 본체 + 약간의 여유)
    const r = centerTop.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const nx = (cx - r.width  / 2) / (r.width  * 0.28);
    const ny = (cy - r.height / 2) / (r.height * 0.32);
    if (nx * nx + ny * ny <= 1) return;     // 타원 zone 내 → spawn 안 함 (토르소 영역)

    const x = (cx / r.width)  * 100;
    const y = (cy / r.height) * 100;
    ui.style.left = x + '%';
    ui.style.top  = y + '%';
    showStage('main');
    ui.classList.add('show');
    _uiState.open = true;
  });

  // 액션 버튼 (close / back / reset-* / download / capture / material / background / reset-all)
  ui.querySelectorAll('.glb-btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      // SFX — capture 는 카메라 사운드, download(QR 띄우기) 는 click, 나머지 UI 버튼도 click
      if (action === 'capture') playSFX('camera');
      else playSFX('click');
      handleHallUIAction(action);
    });
  });

  // 색상 버튼 — bg / material. 작품 색상(material)은 중앙 GLB 만 바꿈 — 좌측 슬라이드 4 와 독립.
  ui.querySelectorAll('.glb-color').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSFX('click');
      if (btn.dataset.bg) {
        applyBgImage(btn.dataset.image);
        _uiState.selectedBg = btn.dataset.bg;
        syncActiveDots('bg');
      } else if (btn.dataset.material) {
        const glb = btn.dataset.glb;
        if (glb && window._swapGLB) window._swapGLB(glb);
        _uiState.selectedMaterial = btn.dataset.material;
        syncActiveDots('material');
      }
    });
  });

  window._closeHallUI = hideUI;
  window._showStage = showStage;

  function hideUI() {
    ui.classList.remove('show');
    _uiState.open = false;
  }
}

function showStage(name) {
  const ui = document.getElementById('glb-ui');
  if (!ui) return;
  ui.querySelectorAll('.glb-stage').forEach((s) => {
    s.classList.toggle('active', s.dataset.stage === name);
  });
  // stage 들어갈 때 현재 선택 상태로 V 체크 동기화
  if (name === 'bg' || name === 'material') syncActiveDots(name);
}

function syncActiveDots(stage) {
  const sel = stage === 'bg' ? _uiState.selectedBg : _uiState.selectedMaterial;
  const attr = stage === 'bg' ? 'data-bg' : 'data-material';
  document.querySelectorAll(`.glb-stage[data-stage="${stage}"] .glb-color`).forEach((dot) => {
    dot.classList.toggle('active', dot.getAttribute(attr) === sel);
  });
}

// 배경 이미지 적용 — center-top 패널의 배경. preload 후 적용해 깜빡임(흰 화면) 방지
const _bgPreloadCache = new Map();
function applyBgImage(src) {
  if (!src) return;
  const panel = document.getElementById('center-top');
  if (!panel) return;
  const setBg = () => {
    panel.style.backgroundImage = `url(${src})`;
    panel.style.backgroundSize  = 'cover';
    panel.style.backgroundPosition = 'center';
  };
  if (_bgPreloadCache.has(src)) { setBg(); return; }
  const img = new Image();
  img.onload = () => { _bgPreloadCache.set(src, true); setBg(); };
  img.onerror = setBg;
  img.src = src;
}
// A관 진입 직후 모든 bg 변형 preload — 사용자 클릭 전에 캐시 채움
function preloadAllBgs() {
  ['black', 'blue', 'red', 'teal', 'purple'].forEach((c) => {
    const src = assetUrl(`assets/works/A/bg/bg-${c}.png`);
    if (_bgPreloadCache.has(src)) return;
    const img = new Image();
    img.onload = () => _bgPreloadCache.set(src, true);
    img.src = src;
  });
}

function handleHallUIAction(action) {
  switch (action) {
    case 'close':
      if (window._closeHallUI) window._closeHallUI();
      break;
    case 'back':
      showStage('main');
      break;
    case 'background':
      showStage('bg');
      break;
    case 'material':
      showStage('material');
      break;
    case 'capture':
      captureHallScreen();
      break;
    case 'download':
      captureAndShowQR();
      showStage('qr');
      break;
    case 'reset-bg':
      _uiState.selectedBg = null;
      applyBgImage(assetUrl('assets/works/A/bg/bg-black.png'));   // 기본값 = black
      syncActiveDots('bg');
      break;
    case 'reset-material':
      _uiState.selectedMaterial = null;
      if (window._swapGLB) window._swapGLB(assetUrl('assets/models/troso_white.glb'));
      syncActiveDots('material');
      break;
    case 'reset-all':
      _uiState.selectedBg = null;
      _uiState.selectedMaterial = null;
      applyBgImage(assetUrl('assets/works/A/bg/bg-black.png'));
      if (window._swapGLB) window._swapGLB(assetUrl('assets/models/troso_white.glb'));
      syncActiveDots('bg');
      syncActiveDots('material');
      break;
    default:
      console.log('[glb-ui] action 준비 중:', action);
      break;
  }
}

// ============================================================
//  HALL — 서브 UI (배경색/재질색/QR)
//   - 메인 UI 아래에 같은 크기 원으로 등장
//   - 패널 밖으로 빠지면 위로 플립 + 좌우 클램프
//   - wedge dwell → 색상 적용 / 중앙 → 해당 속성만 초기화 / ← → 뒤로
// ============================================================
const SUB_DWELL_MS = 600;

function openSubUI(key) {
  // 다른 서브 UI 가 떠 있으면 정리
  ['bg', 'material', 'qr'].forEach((k) => {
    if (k !== key) {
      const el = document.getElementById('hall-sub-' + k);
      if (el) el.classList.remove('show');
    }
  });
  const sub = document.getElementById('hall-sub-' + key);
  const container = document.getElementById('center-top');
  const main = document.getElementById('hall-ui');
  if (!sub || !main || !container) return;
  positionSubUI(sub, main, container);
  sub.classList.add('show');
}

function closeAllSubUIs() {
  ['bg', 'material', 'qr'].forEach((k) => {
    const el = document.getElementById('hall-sub-' + k);
    if (el) el.classList.remove('show');
  });
}

function positionSubUI(subEl, mainEl, container) {
  const cRect = container.getBoundingClientRect();
  const mRect = mainEl.getBoundingClientRect();
  // sub 의 현재 크기 (CSS 의 width / aspect-ratio 로 결정됨)
  const subW = subEl.offsetWidth  || mRect.width;
  const subH = subEl.offsetHeight || mRect.height;
  const mainCx = (mRect.left + mRect.width / 2) - cRect.left;
  const mainTop = mRect.top - cRect.top;
  const mainBot = mRect.bottom - cRect.top;
  const gap = 14;

  // 기본: main 의 오른쪽 옆 (세로 중앙 정렬). main 이 좌측 영역에 있어 옆에 공간 있음.
  let cx = (mRect.right - cRect.left) + gap + subW / 2;
  let cy = (mRect.top   - cRect.top)  + mRect.height / 2;

  // 오른쪽으로 빠지면 main 의 왼쪽으로 플립
  if (cx + subW / 2 > cRect.width - 4) {
    cx = (mRect.left - cRect.left) - gap - subW / 2;
  }
  // 양옆 모두 안 들어가면 main 아래에 배치
  if (cx - subW / 2 < 4) {
    cx = mainCx;
    cy = mainBot + gap + subH / 2;
    // 아래도 빠지면 위로 플립
    if (cy + subH / 2 > cRect.height - 4) {
      cy = mainTop - gap - subH / 2;
    }
  }
  // 최종 세로 클램프
  if (cy - subH / 2 < 4) cy = subH / 2 + 4;
  if (cy + subH / 2 > cRect.height - 4) cy = cRect.height - subH / 2 - 4;

  subEl.style.left = cx + 'px';
  subEl.style.top  = cy + 'px';
}

function initSubUIs() {
  ['bg', 'material', 'qr'].forEach((key) => {
    const sub = document.getElementById('hall-sub-' + key);
    if (!sub) return;

    // 뒤로 버튼 — dwell 후 서브 UI 닫기 (메인은 그대로)
    const back = sub.querySelector('.hall-sub-back');
    if (back) attachDwell(back, () => sub.classList.remove('show'));

    // wedge / 중앙 reset — 클릭 후 액션
    sub.querySelectorAll('.hall-sub-wedge').forEach((w) => {
      attachDwell(w, () => {
        const color = w.dataset.color;
        console.log(`[sub-${key}] wedge click — color=${color}, glb=${w.dataset.glb || 'n/a'}`);
        if (key === 'bg') applyBackgroundColor(color);
        if (key === 'material') {
          // 색상별 GLB swap (회전 각도 유지)
          const glbPath = w.dataset.glb;
          if (glbPath && window._swapGLB) {
            window._swapGLB(glbPath);
          } else {
            console.warn('[material] no GLB path or _swapGLB unavailable — falling back to tint');
            applyMaterialColor(color);
          }
          // 좌 slide 4 이미지 동기화 — 3세트 복제(0/4/8 인덱스) 모두 교체
          const detail4 = w.dataset.detail4;
          if (detail4) updateLeftSlide4(detail4);
        }
      });
    });
    const reset = sub.querySelector('.hall-sub-reset');
    if (reset) {
      attachDwell(reset, () => {
        if (key === 'bg') resetBackgroundColor();
        if (key === 'material') resetMaterialColor();
      });
    }
  });
}

function attachDwell(el, onFire) {
  // 클릭 기반으로 전환 — 자기 sub-ui 가 .show 일 때만 click 활성
  el.addEventListener('click', (e) => {
    const sub = el.closest('.hall-sub-ui');
    if (sub && !sub.classList.contains('show')) return;
    e.stopPropagation();
    onFire();
  });
}

// ============================================================
//  HALL — 배경색 (center-top 패널만)
// ============================================================
let _bgOriginal = null;

function applyBackgroundColor(hex) {
  const panel = document.getElementById('center-top');
  if (!panel) return;
  if (_bgOriginal === null) _bgOriginal = panel.style.background || '';
  panel.style.background = hex;
}
function resetBackgroundColor() {
  const panel = document.getElementById('center-top');
  if (!panel) return;
  panel.style.background = (_bgOriginal !== null) ? _bgOriginal : '';
}

// ============================================================
//  HALL — GLB 머티리얼 색상 (틴트 = baseColorMap × material.color)
//   - 텍스처 디테일 유지 + 전체 톤만 바꿈
//   - 원본 색은 처음 로드 시 보관, 초기화 때 복원
// ============================================================
const _matOriginals = new Map();   // material → THREE.Color (clone)

// GLB swap 모드의 reset — 기본 GLB (config.left3D.model, 보통 white) 로 다시 swap
function resetMaterialColor() {
  // 좌 slide 4 기본 자산으로 복원 (A관)
  updateLeftSlide4(assetUrl('assets/works/A/note/slide-4-base.png'));
  if (window._swapGLB && config.left3D && config.left3D.model) {
    window._swapGLB(config.left3D.model);
    return;
  }
  // GLB swap 미사용 (= built-in 폴백 등) — 기존 틴트 복원 경로
  if (!window._glbRoot) return;
  window._glbRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (m && m.color && _matOriginals.has(m)) m.color.copy(_matOriginals.get(m));
    });
  });
}

// 좌 패널 slide 4 의 이미지 src 일괄 교체 (3세트 복제 모두)
//  A관 색상 변경 시 좌 디테일 노트 slide 4 가 detail-4-color-N.png 로 동기화.
function updateLeftSlide4(src) {
  if (!src) return;
  const track = document.getElementById('hall-left-track');
  if (!track) return;
  const slides = track.querySelectorAll('.hall-left-slide');
  // slidesPerSet = total/3 (3세트 복제). slide 4 = idx 3 in 0-base
  const n = slides.length;
  if (n === 0) return;
  const perSet = Math.max(1, Math.floor(n / 3));
  const slide4InSet = 3; // 0-base
  if (perSet <= slide4InSet) return;
  for (let copy = 0; copy < 3; copy++) {
    const idx = copy * perSet + slide4InSet;
    const slide = slides[idx];
    if (!slide) continue;
    const img = slide.querySelector('img');
    if (img) img.src = src;
  }
}

function rememberMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (m && m.color && !_matOriginals.has(m)) {
        _matOriginals.set(m, m.color.clone());
      }
    });
  });
}
// 틴트 fallback (data-glb 없는 wedge 또는 built-in 폴백 모드용)
function applyMaterialColor(hex) {
  if (!window._glbRoot) return;
  window._glbRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => { if (m && m.color) m.color.set(hex); });
  });
}

// ============================================================
//  HALL — 8시 다운로드 (캡처 + QR)
//   - 캡처 PNG 를 같은 origin 의 /captured_image/<세션>/<파일> 로 노출
//   - 그 URL 을 QR 로 만들어 서브 UI 에 표시
// ============================================================
async function captureAndShowQR() {
  // 캡처 → URL 생성 → glb-ui QR stage 의 중앙 이미지 영역에 QR 표시
  const path = await captureHallScreen({ flash: false });
  if (!path) return;

  const url = `${window.location.origin}/${path.replace(/^\/+/, '')}`;
  const imgEl = document.getElementById('glb-qr-image');
  if (imgEl && window.qrcode) {
    const qr = window.qrcode(0, 'L');
    qr.addData(url);
    qr.make();
    // data URL 로 변환해 <img> src 에 주입 (이미지 위 정렬)
    const svgTag = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const blob = new Blob([svgTag], { type: 'image/svg+xml' });
    imgEl.src = URL.createObjectURL(blob);
  }
  showStage('qr');
}

// ============================================================
//  HALL — 화면 캡처 (11시 버튼)
//   - main-view 를 html2canvas 로 캡처 → /capture POST → 서버가 PNG 저장
//   - 캡처 직전 짧은 플래시
// ============================================================
async function captureHallScreen({ flash: doFlash = true } = {}) {
  const flash = document.getElementById('hall-flash');
  if (doFlash && flash) {
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 180);
  }
  try {
    // 캡처 직전 GLB 강제 렌더 — 현재 회전 그대로 캔버스 버퍼에 들어가게
    if (window._forceRenderGLB) window._forceRenderGLB();

    // GLB 가 렌더되는 WebGL 캔버스 자체를 직접 toDataURL → GLB 영역만 캡처
    const glbCanvas = document.getElementById('three-canvas');
    if (!glbCanvas) {
      console.warn('three-canvas not found');
      return null;
    }
    const dataUrl = glbCanvas.toDataURL('image/png');

    const res = await fetch('/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    const json = await res.json().catch(() => ({}));
    console.log('[hall-ui] captured →', json.path || json);
    return json.path || null;
  } catch (err) {
    console.error('[hall-ui] capture failed:', err);
    return null;
  }
}

// 외부 (enterHall) 에서 좌·우 슬라이더 초기 위치 리셋용
function resetAllHallSliders() {
  Object.values(_sliders).forEach((s) => s.reset && s.reset());
}

// ============================================================
//  HALL — +버튼(핫스팟) 클릭 → 말풍선 표시
//  말풍선은 main-view 좌표계 기준으로 위치. 핫스팟이 속한 패널 외 다른
//  패널로 호버 이동하면 자동 hide.
// ============================================================
let _activeBubblePanel = null;

function initHallBubble() {
  const mainView = document.getElementById('main-view');
  const bubble   = document.getElementById('hall-bubble');
  const inner    = document.getElementById('hall-bubble-inner');
  if (!mainView || !bubble || !inner) return;

  // +버튼 클릭 → 말풍선 또는 이미지 팝업 표시 / 같은 +버튼 다시 클릭 → 닫기
  mainView.addEventListener('click', (e) => {
    const hs = e.target.closest('.hall-hotspot');
    if (!hs) return;
    e.stopPropagation();
    // slide-4: HTML color variation 카드 toggle (해당 슬라이드 안의 카드만 보이게)
    if (hs.dataset.colorVariation) {
      playSFX('click');
      const slideEl = hs.closest('.hall-left-slide');
      if (slideEl) {
        const card = slideEl.querySelector('.color-variation');
        // 다른 슬라이드들의 카드는 닫음 (3-set 복제본 + 다른 인덱스)
        document.querySelectorAll('.color-variation.show').forEach((c) => {
          if (c !== card) c.classList.remove('show');
        });
        if (card) {
          card.classList.toggle('show');
          // 카드 위치 — + 클릭 우측에. 우측으로 빠지면 좌측으로 flip. 슬라이드 안 clamp.
          if (card.classList.contains('show')) {
            const sr = slideEl.getBoundingClientRect();
            const hr = hs.getBoundingClientRect();
            const hsCx = (hr.left + hr.width  / 2) - sr.left;
            const hsCy = (hr.top  + hr.height / 2) - sr.top;
            // 카드 크기 측정 — 보이게 만든 직후 한 프레임 뒤 측정
            requestAnimationFrame(() => {
              const cw = card.offsetWidth;
              const ch = card.offsetHeight;
              let left = hsCx + hr.width / 2 + 14;   // + 우측
              let top  = hsCy - ch / 2;
              if (left + cw > sr.width - 8) left = hsCx - hr.width / 2 - 14 - cw;   // 우측 빠지면 좌로 flip
              if (left < 8) left = 8;
              if (top  < 8) top  = 8;
              if (top + ch > sr.height - 8) top = sr.height - ch - 8;
              card.style.left = (left / sr.width  * 100) + '%';
              card.style.top  = (top  / sr.height * 100) + '%';
              card.style.bottom = 'auto';
            });
          }
        }
      }
      return;
    }
    // 이미지 팝업 모달 — 핫스팟이 속한 panel 안에 클릭 좌표 근처로 배치 (boundary 처리)
    if (hs.dataset.popupImage) {
      playSFX('click');
      const hostPanel = hs.closest('.panel');
      showHallPopup(hs.dataset.popupImage, hostPanel || mainView, {
        clickX: e.clientX,
        clickY: e.clientY,
        side: hs.dataset.popupSide || 'right',
      });
      return;
    }
    // 기존 말풍선
    const wasActive = hs.classList.contains('active');
    document.querySelectorAll('.hall-hotspot.active').forEach((el) => el.classList.remove('active'));
    if (wasActive) {
      hideHallBubble();
      return;
    }
    const mvRect = mainView.getBoundingClientRect();
    const hsRect = hs.getBoundingClientRect();
    const cx = (hsRect.left + hsRect.width  / 2) - mvRect.left;
    const cy = (hsRect.top  + hsRect.height / 2) - mvRect.top;
    bubble.style.left = cx + 'px';
    bubble.style.top  = cy + 'px';
    inner.textContent = hs.dataset.message || '';
    bubble.classList.add('show');
    hs.classList.add('active');
    _activeBubblePanel = hs.closest('.panel');
  });
}

// 이미지 팝업 모달 — hostEl(panel) 의 자식으로 옮겨 panel 안에만 표시.
//  opts.clickX/Y 가 있으면 클릭 좌표 근처에 배치 + panel 안으로 boundary 클램프.
//  없으면 panel 가운데 (B관 light phase 등).
function showHallPopup(src, hostEl, opts) {
  const popup = document.getElementById('hall-popup');
  const img   = document.getElementById('hall-popup-img');
  if (!popup || !img) return;
  img.src = src;
  if (hostEl && popup.parentElement !== hostEl) hostEl.appendChild(popup);
  // 클릭 좌표 모드 — popup 자체는 dim 없이 이미지만 클릭 근처에. dim 끔.
  if (opts && opts.clickX != null && opts.clickY != null && hostEl) {
    popup.classList.add('no-dim');
    // 이미지 로드 끝나야 사이즈 측정 가능 — onload 시 위치 보정
    const place = () => {
      const pr = hostEl.getBoundingClientRect();
      const cx = opts.clickX - pr.left;
      const cy = opts.clickY - pr.top;
      // 자연 사이즈 → panel 안에서의 표시 사이즈 (작게 — + 옆에 contextual 한 카드 톤)
      const maxW = pr.width  * 0.30;
      const maxH = pr.height * 0.40;
      img.style.maxWidth  = maxW + 'px';
      img.style.maxHeight = maxH + 'px';
      const iw = img.offsetWidth  || maxW;
      const ih = img.offsetHeight || maxH;
      // 기본 우측, opts.side === 'left' 면 강제 좌측
      const wantLeft = opts.side === 'left';
      let left = wantLeft ? cx - iw - 18 : cx + 18;
      let top  = cy - ih / 2;
      // 강제 방향에서 넘치면 반대로 flip
      if (!wantLeft && left + iw > pr.width - 8) left = cx - iw - 18;
      if (wantLeft  && left < 8)                 left = cx + 18;
      if (left < 8) left = 8;
      if (left + iw > pr.width - 8) left = pr.width - iw - 8;
      if (top  < 8) top  = 8;
      if (top + ih > pr.height - 8) top = pr.height - ih - 8;
      img.style.position = 'absolute';
      img.style.left = left + 'px';
      img.style.top  = top  + 'px';
    };
    if (img.complete) place();
    else img.onload = place;
  } else {
    popup.classList.remove('no-dim');
    img.style.position = '';
    img.style.left = '';
    img.style.top  = '';
    img.style.maxWidth = '';
    img.style.maxHeight = '';
  }
  popup.classList.add('show');
  popup.setAttribute('aria-hidden', 'false');
}
function hideHallPopup() {
  const popup = document.getElementById('hall-popup');
  if (!popup) return;
  popup.classList.remove('show');
  popup.setAttribute('aria-hidden', 'true');
}
function initHallPopup() {
  const popup = document.getElementById('hall-popup');
  if (!popup) return;
  popup.addEventListener('click', () => hideHallPopup());
}

function hideHallBubble() {
  const bubble = document.getElementById('hall-bubble');
  if (bubble) bubble.classList.remove('show');
  document.querySelectorAll('.hall-hotspot.active').forEach((el) => el.classList.remove('active'));
  _activeBubblePanel = null;
}

// ============================================================
//  HALL — C관 STORYTELLING (단일 mp4 → 4분할, 4 패널 동기 재생)
//  - immersive 레이아웃 위에 캔버스 5개를 오버레이 (left / centerTop / centerBottom
//    / right-5 / right-2). 단일 hidden <video> 가 사운드 포함 재생되고 raf 루프에서
//    각 캔버스에 해당 사분면을 drawImage. 우(5/2) 영역은 TR 사분면을 5:2 로 다시 잘라
//    seamless 하게 이어 보이게.
//  - video.ended → advanceReady=true. 이후 좌/중앙위/우(5) 호버 dwell(짧게) 로 다음 영상.
//    마지막 영상까지 끝나면 endStorytelling() → 캔버스 제거, immersive 노출.
//  - 우(2) 토글 dwell → storytelling 건너뛰고 즉시 immersive (initHallToggleReturn 가
//    _cStory 활성 시 endStorytelling 으로 분기).
//  - 2x2 매핑: TL=left, TR=right(5+2), BL=centerTop, BR=centerBottom.
//    (실제 mp4 사분면 매핑이 다르면 splitMode 추가 분기로 조정 가능)
// ============================================================
let _cStory = null;

function runStorytelling(hall, onDone) {
  const story = hall.storytelling;
  if (!story || !Array.isArray(story.videos) || story.videos.length === 0) {
    onDone && onDone();
    return;
  }

  // 진행 중 hotspot/hint 가리기 위한 클래스
  document.getElementById('main-view').classList.add('story-mode');

  // 우측 토글 라벨을 storytelling 용으로 임시 교체.
  //  always-overlay 클래스도 임시로 떼서 .story-mode 의 overlay 톤이 깔끔히 적용되게.
  const lbl = document.getElementById('hall-toggle-label');
  if (lbl) lbl.textContent = story.skipLabel || '이머시브 공간으로\n바로 가기';
  const tgWrap = document.getElementById('hall-right-toggle');
  const hadAlwaysOverlay = tgWrap && tgWrap.classList.contains('always-overlay');
  if (tgWrap) tgWrap.classList.remove('always-overlay');

  // hidden <video> — 사운드 포함 재생, 4 캔버스가 여기서 frame 을 sample
  const v = document.createElement('video');
  v.playsInline = true;
  v.preload = 'auto';
  v.muted = false;
  v.style.position = 'fixed';
  v.style.left = v.style.top = '-10px';
  v.style.width = v.style.height = '1px';
  v.style.opacity = '0';
  v.style.pointerEvents = 'none';
  document.body.appendChild(v);

  // 5 개 캔버스 오버레이 — 각 패널의 자식으로 삽입
  const canvases = {
    left:         injectStoryCanvas(document.getElementById('hall-left')),
    centerTop:    injectStoryCanvas(document.getElementById('center-top')),
    centerBottom: injectStoryCanvas(document.getElementById('center-bottom')),
    right5:       injectStoryCanvas(document.getElementById('hall-right-slides')),
    right2:       injectStoryCanvas(document.getElementById('hall-right-toggle')),
  };

  _cStory = {
    hall, story, video: v, canvases,
    idx: 0, advanceReady: false,
    raf: 0, advanceTimer: null,
    hadAlwaysOverlay,
    // (click 기반으로 전환 — lastTrigger / activeAdvancePanel 필드 더 이상 사용 안 함)
    onDone,
  };

  v.addEventListener('ended', onStoryVideoEnded);
  v.addEventListener('loadeddata', resizeStoryCanvases);
  window.addEventListener('resize', resizeStoryCanvases);

  // 좌 / 중앙위 / 우(5) 클릭 → 영상이 끝났으면(advanceReady) 다음 영상으로 진입
  ['hall-left', 'center-top', 'hall-right-slides'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', onAdvanceClick);
  });

  // 진입 hint (가운데에 짧게)
  if (story.hint) showStoryHint(story.hint, story.hintMs || 2800);

  resizeStoryCanvases();
  loadStoryVideo(0);
  drawStoryLoop();
}

function injectStoryCanvas(parent) {
  if (!parent) return null;
  const cv = document.createElement('canvas');
  cv.className = 'hall-c-canvas';
  parent.appendChild(cv);
  return cv;
}

function resizeStoryCanvases() {
  if (!_cStory) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // perf cap
  Object.values(_cStory.canvases).forEach((cv) => {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    cv.width  = Math.max(1, Math.round(r.width  * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
  });
}

function loadStoryVideo(idx) {
  if (!_cStory) return;
  _cStory.idx = idx;
  _cStory.advanceReady = false;
  const v = _cStory.video;
  const src = _cStory.story.videos[idx].src;
  v.src = src;
  // 음성 포함 재생 시도. 자동재생 차단되면 muted 로 폴백 (lobby hover 가 user-gesture
  // 로 인정되는 경우가 대부분이라 보통 그대로 재생됨)
  const tryPlay = () => v.play().catch(() => {
    v.muted = true;
    v.play().catch(() => {});
  });
  if (v.readyState >= 1) tryPlay();
  else v.addEventListener('loadedmetadata', tryPlay, { once: true });
}

function onStoryVideoEnded() {
  if (!_cStory) return;
  _cStory.advanceReady = true;
  // click 기반 — 영상 끝 후 사용자가 advance 패널 클릭해야 다음으로
}

function doStoryAdvance() {
  if (!_cStory || !_cStory.advanceReady) return;
  const next = _cStory.idx + 1;
  if (next >= _cStory.story.videos.length) endStorytelling();
  else loadStoryVideo(next);
}

function drawStoryLoop() {
  if (!_cStory) return;
  const v = _cStory.video;
  if (v && v.readyState >= 2 && v.videoWidth) {
    const VW = v.videoWidth, VH = v.videoHeight;

    // L자형 공간 매핑: 영상 한 장이 (좌+중앙위+우 윗줄) + (중앙아래) 전체 영역에
    // 픽셀 단위로 이어지도록 슬라이스. 각 패널은 자기 위치(layout px)에 해당하는
    // 비율만큼 영상에서 잘라내 표시.
    //
    // 레이아웃 좌표(layout px):
    //   LEFT       x=[0,        panelW],     y=[0,    topH]
    //   CTOP       x=[panelW,   2*panelW],   y=[0,    topH]
    //   RIGHT 5/7  x=[2*panelW, 2*panelW+r5W], y=[0,  topH]
    //   RIGHT 2/7  x=[2*panelW+r5W, 3*panelW], y=[0,  topH]
    //   CBOT       x=[panelW,   2*panelW],   y=[topH, topH+botH]
    //  (양쪽 아래 코너는 letterbox 라 영상에 매핑하지 않아도 손실 영역 없음)
    const lay = (config && config.layout) || {};
    const panelW = +lay.panelWidth || 1920;
    const topH   = +lay.topRowH    || 1200;
    const botH   = +lay.bottomRowH || 1920;
    const totalW = panelW * 3;
    const totalH = topH + botH;
    const r5W    = panelW * 5 / 7;

    const mapSrc = (lx, ly, lw, lh) => [
      VW * (lx / totalW), VH * (ly / totalH),
      VW * (lw / totalW), VH * (lh / totalH),
    ];
    const draw = (cv, src) => {
      if (!cv || cv.width === 0) return;
      const ctx = cv.getContext('2d');
      try { ctx.drawImage(v, src[0], src[1], src[2], src[3], 0, 0, cv.width, cv.height); } catch {}
    };
    const c = _cStory.canvases;
    draw(c.left,         mapSrc(0,                0,    panelW,        topH));
    draw(c.centerTop,    mapSrc(panelW,           0,    panelW,        topH));
    draw(c.right5,       mapSrc(2*panelW,         0,    r5W,           topH));
    draw(c.right2,       mapSrc(2*panelW + r5W,   0,    panelW - r5W,  topH));
    draw(c.centerBottom, mapSrc(panelW,           topH, panelW,        botH));
  }
  _cStory.raf = requestAnimationFrame(drawStoryLoop);
}

function onAdvanceClick(e) {
  if (!_cStory) return;
  // hall-list-ui / sub-ui / hint 클릭은 무시 (이들은 자체 핸들러로 동작)
  if (e.target.closest && e.target.closest('.hall-ui')) return;
  if (e.target.closest && e.target.closest('.hall-sub-ui')) return;
  if (e.target.closest && e.target.closest('.hall-hint-center')) return;
  doStoryAdvance();
}

function endStorytelling() {
  if (!_cStory) return;
  cancelAnimationFrame(_cStory.raf);
  const v = _cStory.video;
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
  v.removeEventListener('ended', onStoryVideoEnded);
  v.removeEventListener('loadeddata', resizeStoryCanvases);
  window.removeEventListener('resize', resizeStoryCanvases);
  v.remove();
  Object.values(_cStory.canvases).forEach((cv) => cv && cv.remove());
  ['hall-left', 'center-top', 'hall-right-slides'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.removeEventListener('click', onAdvanceClick);
  });
  document.getElementById('main-view').classList.remove('story-mode');
  // 토글 라벨/클래스 복원 (immersive 용)
  const hall = _cStory.hall;
  const lbl = document.getElementById('hall-toggle-label');
  if (lbl && hall.right && hall.right.toggle) {
    lbl.textContent = hall.right.toggle.label || '';
  }
  const tgWrap = document.getElementById('hall-right-toggle');
  if (tgWrap && _cStory.hadAlwaysOverlay) tgWrap.classList.add('always-overlay');
  const onDone = _cStory.onDone;
  _cStory = null;
  if (onDone) onDone();
}

function showStoryHint(text, ms) {
  // 중앙위 hint 엘리먼트 재사용 (기존 .hall-hint 트랜지션 그대로)
  const el = document.getElementById('hall-hint-center');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('fade-out');
  requestAnimationFrame(() => {
    el.classList.add('show');
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => {
        el.classList.remove('show');
        el.classList.remove('fade-out');
      }, 800);
    }, ms);
  });
}

// ============================================================
//  HALL — 우측 토글: 클릭 시 로비로 복귀 (C storytelling 모드면 immersive 로 skip)
// ============================================================
function initHallToggleReturn() {
  const toggle = document.getElementById('hall-right-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (_cStory) { endStorytelling(); return; }
      returnToLobby();
    });
  }
  // layout-note (A관) 의 별도 나가기 버튼
  const exitBtn = document.getElementById('hall-right-exit');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      returnToLobby();
    });
  }
}

// ============================================================
//  LEFT PANEL — 3D Viewer
//  - builtin : torus knot
//  - model   : load .glb / .gltf file
// ============================================================
let viewerInitialized = false;

function init3DViewer() {
  if (viewerInitialized) return;
  viewerInitialized = true;

  const canvas = document.getElementById('three-canvas');
  const panel = canvas.parentElement;

  // preserveDrawingBuffer: html2canvas / toDataURL 가 GLB canvas 내용을 가져갈 수 있게
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(panel.clientWidth, panel.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, panel.clientWidth / panel.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 5);

  // PBR environment for reflections on metallic materials
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Lights
  scene.add(new THREE.AmbientLight(0x404060, 1.2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 5, 5);
  scene.add(dirLight);
  const pointLight = new THREE.PointLight(0x6c63ff, 3, 20);
  pointLight.position.set(-3, 2, 3);
  scene.add(pointLight);

  // The object that will rotate (replaced if a model loads)
  let target = new THREE.Group();
  scene.add(target);

  function buildBuiltin() {
    const geometry = new THREE.TorusKnotGeometry(1, 0.35, 200, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6c63ff, metalness: 0.7, roughness: 0.2,
      emissive: 0x1a1a3e, emissiveIntensity: 0.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    target.add(mesh);

    const wireMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0x6c63ff, wireframe: true, transparent: true, opacity: 0.06,
    }));
    target.add(wireMesh);
  }

  // 첫 GLB 로 결정된 fit transform 을 저장해서 다른 색 GLB 에도 같은 값 적용
  //  → 색마다 메시 bbox 가 미세하게 달라도 시각적 위치/스케일이 일정하게 유지됨
  let _fitCache = null;   // { scale, cx, cy, cz }
  function fitToView(obj, opts = {}) {
    const reuse = !opts.recompute && _fitCache;
    obj.position.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.updateMatrixWorld(true);

    let scale, cx, cy, cz;
    if (reuse) {
      ({ scale, cx, cy, cz } = _fitCache);
    } else {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const sizeLen = size.length();
      if (sizeLen <= 0) return;
      // 3.5 = 화면을 채우는 비율
      scale = 3.5 / sizeLen;
      cx = center.x; cy = center.y; cz = center.z;
      _fitCache = { scale, cx, cy, cz };
      console.log(`[GLB] fit calibrated: scale=${scale.toFixed(5)}, center=(${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})`);
    }

    obj.scale.setScalar(scale);
    // scale 을 먼저 적용한 뒤 center*scale 만큼 빼야 모델 중심이 원점에 옴
    obj.position.x = -cx * scale;
    obj.position.y = -cy * scale;
    obj.position.z = -cz * scale;
  }

  // 현재 target 의 자식으로 들어가 있는 GLB scene (swap 시 떼어내기 위해 추적)
  let currentGlbChild = null;
  // 같은 GLB 를 다시 선택하면 재로드 안 하도록 캐시 (path → gltf.scene). clone 안 함 —
  //  swap 시 항상 이전 자식을 target.remove 하고 새 scene 을 add 하므로 한 번에 한 군데에만 붙음.
  const glbCache = new Map();
  const glbLoader = new GLTFLoader();

  // target.rotation 은 그대로 두고 자식만 swap → 회전 각도 자연스럽게 이어짐
  function applyGlbScene(scene) {
    if (currentGlbChild === scene) return;          // 이미 같은 scene 이 붙어 있으면 no-op
    if (currentGlbChild) target.remove(currentGlbChild);
    target.add(scene);
    currentGlbChild = scene;
    fitToView(scene);
    // 머티리얼 강건성: 양면 렌더 (back-face cull 로 인해 보이지 않는 케이스 차단) +
    //  진단 로그 (mesh 개수 / 첫 mesh material 정보)
    let meshCount = 0, firstMatInfo = null;
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      meshCount++;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (!m) return;
        m.side = THREE.DoubleSide;
        m.transparent = false;     // 투명 플래그가 의도치 않게 켜져 있으면 강제 off
        m.opacity = 1;
        m.depthWrite = true;
        m.needsUpdate = true;
        if (!firstMatInfo) {
          firstMatInfo = {
            type: m.type,
            color: m.color && m.color.getHexString(),
            map: !!m.map,
            transparent: m.transparent,
            opacity: m.opacity,
          };
        }
      });
    });
    console.log(`[GLB] applied: meshes=${meshCount}, firstMat=`, firstMatInfo);
    window._glbRoot = scene;
    rememberMaterials(scene);
  }

  window._swapGLB = function(modelPath) {
    if (!modelPath) return;
    if (glbCache.has(modelPath)) {
      console.log('[GLB] cache hit:', modelPath);
      applyGlbScene(glbCache.get(modelPath));
      return;
    }
    console.log('[GLB] loading:', modelPath);
    const t0 = performance.now();
    glbLoader.load(
      modelPath,
      (gltf) => {
        const ms = (performance.now() - t0).toFixed(0);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        console.log(`[GLB] loaded ${modelPath} in ${ms}ms, raw bbox size:`, size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
        glbCache.set(modelPath, gltf.scene);
        applyGlbScene(gltf.scene);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const pct = ((xhr.loaded / xhr.total) * 100).toFixed(0);
          if (pct % 25 === 0) console.log(`[GLB] ${modelPath} ${pct}% (${(xhr.loaded/1024/1024).toFixed(1)}MB)`);
        }
      },
      (err) => console.warn('[GLB] load 실패:', modelPath, err),
    );
  };

  if (config.left3D.type === 'model' && config.left3D.model) {
    window._swapGLB(config.left3D.model);
  } else {
    buildBuiltin();
    window._glbRoot = target;
    rememberMaterials(target);
  }

  // 터치 기반 360 회전 — 패널 중심 기준 포인터 방향으로 회전. 누르고 있는 동안 계속 회전.
  //  - 좌측 누르면 좌로(-Y), 우측 누르면 우로(+Y)
  //  - 위쪽 누르면 위로(-X 틸트), 아래쪽 누르면 아래로(+X 틸트)
  //  - 중심에서 멀수록 빠르게. (정규화 -1~1, max ~ 0.05 rad/frame)
  const MAX_ROT_SPEED = 0.05;
  let pointerActive = false;
  let pointerNX = 0;          // -1 ~ 1 (좌 ↔ 우)
  let pointerNY = 0;          // -1 ~ 1 (상 ↔ 하)

  function updatePointer(e) {
    const rect = panel.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;    // 0~1
    const y = (e.clientY - rect.top)  / rect.height;   // 0~1
    pointerNX = (x - 0.5) * 2;                          // -1~1
    pointerNY = (y - 0.5) * 2;                          // -1~1
  }
  panel.addEventListener('pointerdown', (e) => {
    // 회전은 토르소 zone(중앙 ~55% 타원) 안에서만.
    if (e.target.closest('.hall-hotspot, .hall-popup, .color-variation, .glb-ui')) return;
    const r = panel.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const nx = (cx - r.width  / 2) / (r.width  * 0.28);
    const ny = (cy - r.height / 2) / (r.height * 0.32);
    if (nx * nx + ny * ny > 1) return;   // zone 밖 → 회전 안 시작
    pointerActive = true;
    updatePointer(e);
    panel.setPointerCapture(e.pointerId);
  });
  panel.addEventListener('pointermove', (e) => {
    if (!pointerActive) return;
    updatePointer(e);
  });
  const endPointer = (e) => {
    if (!pointerActive) return;
    pointerActive = false;
    try { panel.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  panel.addEventListener('pointerup',     endPointer);
  panel.addEventListener('pointercancel', endPointer);
  panel.addEventListener('pointerleave',  endPointer);

  function animate() {
    requestAnimationFrame(animate);
    // canvas 가 숨겨졌으면(=A관 아니거나 image 모드) WebGL 렌더 스킵 — 백그라운드 CPU/GPU 부하 차단
    if (canvas.style.display === 'none' || canvas.offsetParent === null) return;
    if (pointerActive) {
      target.rotation.y += pointerNX * MAX_ROT_SPEED;
      target.rotation.x += pointerNY * MAX_ROT_SPEED;
      const lim = Math.PI / 2;
      if (target.rotation.x >  lim) target.rotation.x =  lim;
      if (target.rotation.x < -lim) target.rotation.x = -lim;
    }
    const s = 1 + Math.sin(Date.now() * 0.001) * 0.02;
    target.scale.setScalar(s * (target.userData.baseScale || 1));
    renderer.render(scene, camera);
  }
  animate();

  // 캡처 직전 강제 렌더 콜 (preserveDrawingBuffer 와 함께 — 현재 회전 그대로 박제)
  window._forceRenderGLB = () => renderer.render(scene, camera);

  const ro = new ResizeObserver(() => {
    renderer.setSize(panel.clientWidth, panel.clientHeight);
    camera.aspect = panel.clientWidth / panel.clientHeight;
    camera.updateProjectionMatrix();
  });
  ro.observe(panel);
}

// ============================================================
//  CENTER PANEL — Parallax tilt
// ============================================================
function initCenterParallax() {
  const wrap = document.querySelector('.center-image-wrap');
  if (!wrap) return;

  wrap.addEventListener('pointermove', (e) => {
    const rect = wrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    wrap.style.transform = `perspective(800px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
  });

  wrap.addEventListener('pointerleave', () => {
    wrap.style.transform = 'perspective(800px) rotateY(0) rotateX(0)';
    wrap.style.transition = 'transform 0.5s ease';
  });

  wrap.addEventListener('pointerenter', () => {
    wrap.style.transition = 'transform 0.1s ease';
  });
}

// ============================================================
//  RIGHT PANEL — Infinite circular stacked card carousel
// ============================================================
function initCarousel() {
  const track = document.getElementById('carousel-track');
  const wrap = document.getElementById('carousel-wrap');
  if (!track || !wrap) return;   // hall 구조에서는 carousel DOM 없음

  const cardsData = config.carousel;

  // Triple the cards for seamless infinite scroll
  const allCards = [...cardsData, ...cardsData, ...cardsData];

  function createCardEl(c, index) {
    const card = document.createElement('div');
    card.classList.add('mini-card');
    card.style.zIndex = allCards.length - index;
    card.innerHTML = `
      <img src="${c.img}" alt="${c.title}">
      <div class="mini-card-body">
        <h4>${c.title}</h4>
        <p>${c.desc}</p>
      </div>
    `;
    return card;
  }

  allCards.forEach((c, i) => {
    track.appendChild(createCardEl(c, i));
  });

  const CARD_HEIGHT = 210;
  const singleSetHeight = cardsData.length * CARD_HEIGHT;

  let offset = -singleSetHeight;
  track.style.transform = `translateY(${offset}px)`;
  track.style.transition = 'none';

  let lastY = null;
  let velocity = 0;
  let rafId = null;

  function wrapOffset() {
    if (offset < -singleSetHeight * 2) {
      offset += singleSetHeight;
      track.style.transition = 'none';
      track.style.transform = `translateY(${offset}px)`;
    }
    if (offset > 0) {
      offset -= singleSetHeight;
      track.style.transition = 'none';
      track.style.transform = `translateY(${offset}px)`;
    }
  }

  function applyOffset(smooth) {
    track.style.transition = smooth ? 'transform 0.15s ease-out' : 'none';
    track.style.transform = `translateY(${offset}px)`;
    wrapOffset();
  }

  function momentumLoop() {
    if (Math.abs(velocity) < 0.3) {
      velocity = 0;
      return;
    }
    velocity *= 0.92;
    offset += velocity;
    applyOffset(false);
    rafId = requestAnimationFrame(momentumLoop);
  }

  wrap.addEventListener('pointermove', (e) => {
    if (lastY === null) {
      lastY = e.clientY;
      return;
    }
    const delta = e.clientY - lastY;
    lastY = e.clientY;
    velocity = delta * 2;
    offset += delta * 2;
    applyOffset(false);
  });

  wrap.addEventListener('pointerleave', () => {
    lastY = null;
    if (Math.abs(velocity) > 1) {
      cancelAnimationFrame(rafId);
      momentumLoop();
    }
  });

  wrap.addEventListener('pointerenter', () => {
    lastY = null;
    velocity = 0;
    cancelAnimationFrame(rafId);
  });
}

// ============================================================
//  Boot
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // 배포 모드면 HTML 안 [src], [data-image], [data-glb] 등 정적 자산 속성 일괄 Release URL 로 변환
  rewriteAssetsInDOM();
  applyConfig();
  preloadEarlyAssets();
  initStandby();
  buildLanding();
  initLanding();
  initHallToggleReturn();
  initHallSlider();
  initSubUIs();
  initHallPopup();
  initBPhaseSwap();
  initEntryGuide();
  // initCenterParallax / initCarousel: 현재 hall 구조에서 미사용 (DOM 없음 → 안전 무해)
  initCenterParallax();
  initCarousel();

  // 개발용 단축 라우팅 — URL hash 로 특정 씬에 바로 진입
  //  #lobby  : standby/landing-space 스킵해서 로비 바로
  //  #hallA  : 로비 거쳐 A관 진입
  //  #hallB  : 로비 거쳐 B관 진입
  const hash = location.hash.toLowerCase();
  if (hash === '#lobby' || hash === '#halla' || hash === '#hallb') {
    const sb = document.getElementById('standby');
    const ls = document.getElementById('landing-space');
    const lg = document.getElementById('landing');
    if (sb) sb.classList.add('hidden');
    if (ls) { ls.classList.remove('visible'); ls.style.display = 'none'; }
    if (lg) { lg.classList.remove('hidden'); lg.classList.add('active'); }
    if (hash === '#halla') setTimeout(() => enterHall('A'), 100);
    if (hash === '#hallb') setTimeout(() => enterHall('B'), 100);
  }
});
