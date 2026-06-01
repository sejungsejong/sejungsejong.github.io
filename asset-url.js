// ============================================================
//  자산 URL 라우터
//  - 로컬(개발): 모든 'assets/...' 를 그대로 (server.py 가 portfolio/ 를 서빙)
//  - 배포(github.io): 큰 자산(>1MB, 76개) 만 GitHub Release 에 flat-name 으로 업로드
//    되어 있고, 코드는 release URL 로 가리킴. 작은 자산(85개, 13.7MB) 은 repo 안에 그대로.
//
//  Release flat-name 규칙: 'assets/path/to/file.ext' → 'assets__path__to__file.ext'
//  (디렉토리 슬래시 → '__'. GitHub Release 는 디렉토리 구조 안 받음.)
//
//  이 파일은 자동 생성됨 — RELEASE_ASSETS 갱신 시 scripts/gen-asset-list 재실행.
// ============================================================

// 배포 시 코드에서 가리킬 Release 다운로드 URL prefix.
//  Releases 페이지에서 태그 v1 으로 자산 업로드 한 경우의 URL.
//  태그 바꾸려면 BASE 의 .../download/v1/ 부분만 수정.
const RELEASE_BASE = 'https://github.com/sejungsejong/sejungsejong.github.io/releases/download/v1/';

// 어떤 자산이 Release 에 있는지 — 이 Set 에 들어있는 경로만 RELEASE_BASE 로 라우팅.
//  나머지는 repo 안 상대경로 그대로.
export const RELEASE_ASSETS = new Set([
  'assets/bgm/a-immersive.mp3',
  'assets/bgm/a-note.mp3',
  'assets/bgm/b-dark.mp3',
  'assets/bgm/b-light.mp3',
  'assets/bgm/haetae-dark.mp3',
  'assets/bgm/haetae-light.mp3',
  'assets/bgm/lobby.mp3',
  'assets/bgm/torso-immersive.mp3',
  'assets/bgm/torso-note.mp3',
  'assets/halls/C/storytelling/1.mp4',
  'assets/halls/C/storytelling/3.mp4',
  'assets/lobby/floor.png',
  'assets/lobby/wall-front.png',
  'assets/lobby/wall-left.png',
  'assets/lobby/wall-right.png',
  'assets/models/DamagedHelmet.glb',
  // troso GLB 는 Draco 압축으로 repo 에 직접 commit (CORS 위해)
  'assets/works/A/immersive/floor.png',
  'assets/works/A/immersive/front.png',
  'assets/works/A/immersive/left.png',
  'assets/works/A/immersive/right.png',
  'assets/works/A/note/detail-1.png',
  'assets/works/A/note/detail-2.png',
  'assets/works/A/note/detail-4-color-1.png',
  'assets/works/A/note/detail-4-color-2.png',
  'assets/works/A/note/detail-4-color-3.png',
  'assets/works/A/note/detail-4-color-4.png',
  'assets/works/A/note/detail-4.png',
  'assets/works/A/note/floor.png',
  'assets/works/A/note/slide-1.png',
  'assets/works/A/note/slide-2.png',
  'assets/works/A/note/slide-4-base.png',
  'assets/works/A/note/slide-4-color-1.png',
  'assets/works/A/note/slide-4-color-2.png',
  'assets/works/A/note/slide-4-color-3.png',
  'assets/works/A/note/slide-4-color-4.png',
  'assets/works/B/dark/floor.png',
  'assets/works/B/dark/front.png',
  'assets/works/B/dark/left.png',
  'assets/works/B/dark/right.png',
  'assets/works/B/light/floor.png',
  'assets/works/B/light/front.png',
  'assets/works/B/light/left.png',
  'assets/works/B/light/right.png',
  'assets/works/B/transition/floor.mp4',
  'assets/works/B/transition/front.mp4',
  'assets/works/B/transition/left.mp4',
  'assets/works/B/transition/right.mp4',
]);

// 배포 도메인 감지 — github.io / pages.dev 등 외부 호스팅 → Release URL 라우팅.
//  로컬 dev (localhost / 127.0.0.1 / file://) → repo 상대경로 그대로.
const IS_DEPLOY = typeof location !== 'undefined' && (
  location.hostname.endsWith('github.io') ||
  location.hostname.endsWith('pages.dev')
);

// path 가 RELEASE_ASSETS 에 있으면 Release URL, 아니면 그대로.
export function assetUrl(path) {
  if (!path || typeof path !== 'string') return path;
  if (!path.startsWith('assets/')) return path;
  if (!IS_DEPLOY) return path;
  if (!RELEASE_ASSETS.has(path)) return path;
  return RELEASE_BASE + path.replace(/\//g, '__');
}

// 객체 안의 모든 'assets/...' 문자열을 assetUrl 로 재귀 변환 (config 통째로 처리)
export function rewriteAssetsDeep(obj) {
  if (!obj) return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (typeof v === 'string') obj[i] = assetUrl(v);
      else if (v && typeof v === 'object') rewriteAssetsDeep(v);
    }
  } else if (typeof obj === 'object') {
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === 'string') obj[k] = assetUrl(v);
      else if (v && typeof v === 'object') rewriteAssetsDeep(v);
    }
  }
}

// HTML 안 [src], [data-image], [data-glb], [data-detail4] 등 정적 속성 일괄 재라우팅
export function rewriteAssetsInDOM(root = document) {
  const attrs = ['src', 'data-image', 'data-glb', 'data-detail4', 'data-bg', 'data-popup'];
  attrs.forEach((attr) => {
    root.querySelectorAll(`[${attr}^="assets/"]`).forEach((el) => {
      const v = el.getAttribute(attr);
      const next = assetUrl(v);
      if (next !== v) el.setAttribute(attr, next);
    });
  });
}
