// ============================================================
//  Portfolio Config
//  여기서 모든 레이아웃/리소스/텍스트를 편집하세요.
//  값을 바꾸고 페이지를 새로고침하면 즉시 반영됩니다.
// ============================================================

export const config = {

  // ── 페이지 배경 (레터박스 색) ───────────────────────────────
  //  각 씬은 자체 background 가 있어 이 값은 aspect-lock 의 빈 영역
  //  (위/아래 또는 좌/우 띠)에서만 보임. 검정으로 두면 깔끔.
  background: '#000',

  // ── 대기 화면 (페이지 진입 시 가장 먼저 표시) ──────────────
  //  - 4분할(좌·우·중앙위·중앙아래) 구조 그대로
  //  - image1 : 중앙 위 패널의 정중앙 (가로 배너용)
  //  - image2 : 중앙 아래 패널의 정중앙 (느리게 반시계 360° 회전)
  //  - image3 : 중앙 아래 패널의 정중앙 (고정, image2 위에 겹쳐짐)
  //  width/height: null → 기본값, 숫자 → px, 문자열 → CSS 단위 그대로
  standby: {
    background: '#000',
    image1: { src: 'assets/standby/1.png', width: '60%',  height: null },
    image2: { src: 'assets/standby/2.png', width: '40vmin', height: '40vmin', rotateSeconds: 24 },
    image3: { src: 'assets/standby/3.png', width: '13vmin', height: '13vmin' },
  },

  // ── 랜딩 공간 (대기→전시로비 사이의 짧은 전환 화면) ────────
  //  - 4분할 구조 유지 (좌·우·중앙위·중앙아래)
  //  - wall  : 좌·우·중앙 위 패널 배경(벽)을 채움
  //  - front : 중앙 위 패널의 wall 위에 겹치는 컨텐츠
  //  - floor : 중앙 아래 패널 배경(바닥)을 채움
  //  - duration : 자동 전환까지 머무는 시간(ms)
  landingSpace: {
    background: '#FFFFFF',
    duration: 5000,   // 3s → 5s (사용자 요청: 2초 연장)
    wall:  { src: 'assets/landing-space/5_walls.png' },
    front: { src: 'assets/landing-space/4.png', width: '40%', height: null },
    floor: { src: 'assets/landing-space/5_floor.png' },
  },

  // ── 물리 화면 치수 (실제 설치 시 디스플레이 픽셀) ───────────
  //  - 좌·중앙위·우  : panelWidth × topRowH       (예: 1920×1200, 16:10)
  //  - 중앙 아래(바닥): panelWidth × bottomRowH    (예: 1920×1920, 1:1)
  //  - 4 패널은 L 자형으로 배치 (좌우 패널은 위쪽에만, 바닥은 가운데 컬럼 아래)
  //  - 페이지는 이 비율을 유지한 채 뷰포트 안에 fit-and-letterbox 됨
  //    → 어떤 모니터에서 띄워도 각 패널의 가로세로 비율이 깨지지 않음
  layout: {
    panelWidth: 1920,   // 모든 패널의 가로 (px) — 좌·우·중앙(위/아래) 동일
    topRowH:    1200,   // 좌·중앙위·우 패널의 세로 (px) — 1920×1200 (16:10)
    bottomRowH: 1200,   // 중앙 아래(바닥) 패널의 세로 (px) — 1920×1200 (16:10)
  },

  // ── 전시 공간 (4분할: 좌·우는 작품 3점씩, 중앙위는 진입 가능 작품 3점) ──
  //  - 벽/바닥은 랜딩 공간과 동일
  //  - 각 패널 안에서 작품은 좌→우 순으로 등간격 배치
  //  - target: 'main' → 호버 dwell 후 메인 뷰로 진입
  //  - target 없음     → 호버 시 작품 뒤로 "준비 중" 알림이 떴다가 사라짐
  landing: {
    background: '#FFFFFF',
    hoverMs: 800,                                // (현재 click 기반이라 사용 안 함, 호환용)
    alertText: '해당 공간은 아직 준비 중입니다',
    alertMs:   1500,                             // 알림이 떠 있는 시간(ms)
    // 좌·정면·우 갤러리 벽 (각 3개 아치형 액자 포함) + 바닥
    walls: {
      left:   'assets/lobby/wall-left.png',
      center: 'assets/lobby/wall-front.png',
      right:  'assets/lobby/wall-right.png',
    },
    floor: { src: 'assets/lobby/floor.png' },
    // 자산 매핑 — source_images/로비/작품사진 순서대로 좌→중앙→우 (좌→우):
    //   비활성1 ~ 비활성7 = 미구현 placeholder (드론/스피커/주전자/스피커/꽃/욕실/베개)
    //   활성1 = 토르소(꽃다발), 활성2 = 빨간 해태
    //   활성1·2 자리는 중앙의 중앙(=A 토르소) / 좌(=B 해태)
    //   (비활성 7 + 활성 2 = 9 자리, 1대1 매핑)
    left: [
      { src: 'assets/lobby/work-inactive-1.png' },   // 좌1 = 비활성1 (드론)
      { src: 'assets/lobby/work-inactive-2.png' },   // 좌2 = 비활성2 (검정 스피커)
      { src: 'assets/lobby/work-inactive-3.png' },   // 좌3 = 비활성3 (주전자)
    ],
    center: [
      { src: 'assets/lobby/work-active-2.png', hall: 'B' },   // 중1 = 활성2 (해태)  — 호버 시 백라이팅
      { src: 'assets/lobby/work-active-1.png', hall: 'A' },   // 중2 = 활성1 (토르소) — 호버 시 백라이팅
      { src: 'assets/lobby/work-inactive-4.png' },           // 중3 = 비활성4 (갈색 스피커, 미구현)
    ],
    right: [
      { src: 'assets/lobby/work-inactive-5.png' },   // 우1 = 비활성5 (보라 꽃)
      { src: 'assets/lobby/work-inactive-6.png' },   // 우2 = 비활성6 (욕실)
      { src: 'assets/lobby/work-inactive-7.png' },   // 우3 = 비활성7 (베개)
    ],
  },

  // ── 좌측 패널: 3D 뷰어 ─────────────────────────────────────
  // type: 'builtin' = 내장 토러스 노트, 'model' = .glb/.gltf 로드
  left3D: {
    type: 'model',                              // 'builtin' | 'model'
    model: 'assets/models/troso_white.glb',   // type === 'model' 일 때 사용
  },

  // ── 중앙 패널 (위/아래 2분할) ──────────────────────────────
  //  width / height 값 규칙:
  //    null           → 기본값 사용 (top: 90% / 90%, bottom: 100% / 100%)
  //    숫자 (예: 600) → 해당 값을 px 로 고정
  //    문자열         → '%' / 'px' / 'vw' 등 CSS 단위 그대로 적용 (예: '80%')
  center: {
    // 위쪽: 이미지 + 세부 정보 오버레이
    top: {
      image: 'assets/center/main.jpg',
      width:  null,   // 이미지 박스 너비 (container 기준)
      height: null,   // 이미지 박스 높이
      detail: {
        title: 'Project Overview',
        description: 'High-performance API Gateway built with Go and gRPC.',
        items: [
          'Throughput: 50k req/s',
          'Latency p99: 12ms',
          'Stack: Go, Redis, PostgreSQL',
          'Architecture: Microservices',
        ],
        tags: ['Go', 'gRPC', 'Docker', 'K8s'],
      },
    },
    // 아래: 추가 이미지 한 장
    bottom: {
      image:  'assets/center/bottom.jpg',
      width:  null,   // 이미지 너비
      height: null,   // 이미지 높이
    },
  },

  // ── 우측 패널: 카드 캐러셀 (현재 미사용 — A관/B관/C관 진입 시 우측은 hall 설정으로 대체)
  carousel: [
    { img: 'assets/gallery/1.jpg', title: 'Development',   desc: 'Clean code & architecture' },
    { img: 'assets/gallery/2.jpg', title: 'Infrastructure',desc: 'Cloud-native deployment' },
    { img: 'assets/gallery/3.jpg', title: 'Analytics',     desc: 'Data-driven decisions' },
    { img: 'assets/gallery/4.jpg', title: 'Code Review',   desc: 'Quality assurance process' },
    { img: 'assets/gallery/5.jpg', title: 'Collaboration', desc: 'Team workflow & tools' },
    { img: 'assets/gallery/6.jpg', title: 'Monitoring',    desc: 'Observability stack' },
    { img: 'assets/gallery/7.jpg', title: 'API Design',    desc: 'RESTful & GraphQL' },
    { img: 'assets/gallery/8.jpg', title: 'Security',      desc: 'Zero-trust architecture' },
  ],

  // ── 작품관 (전시공간 → 중앙 위 작품을 호버해서 진입) ──────────
  //  - 각 hall 키는 lobby.center 의 항목 hall 속성과 매칭됨
  //  - 현재 A 만 구현. B / C 는 추후 디자인 후 채워넣으면 됨.
  halls: {
    A: {
      background: '#FFFFFF',
      // 진입 안내 (4 panel 사용방법) — 진입 시 화면 전체에 50% dim + 각 영역에 alert.
      //  어디 한 번 탭 → 전체 dim + 모든 alert 사라지고 사용자 인터랙션 시작.
      entryGuide: {
        left:        '좌우를 터치하여 슬라이드해보세요',
        centerTop:   '작품을 터치해보세요',
        rightSlides: '좌우를 터치하여 슬라이드해보세요',
        // rightExit: 사용자 요청에 따라 제거 — 로비 나가기 영역에는 caption 없음
        rightSplit:  true,
      },
      // 좌 패널 — 사진 슬라이더. 슬라이드 자산 안에 + 마크가 이미 그려져 있고,
      //  popups 배열의 좌표(% 기반)에 invisible 클릭존 → 클릭 시 popupImage 모달.
      left: {
        slides: [
          { image: 'assets/works/A/note/slide-1.png', popups: [
            { x: '33%', y: '21%', popupImage: 'assets/works/A/note/popup/popup-1-1.png', popupSide: 'left' },   // 좌측 + → popup 좌측
            { x: '67%', y: '58%', popupImage: 'assets/works/A/note/popup/popup-1-2.png' },
          ]},
          { image: 'assets/works/A/note/slide-2.png', popups: [
            { x: '33%', y: '72%', popupImage: 'assets/works/A/note/popup/popup-2-1.png', popupSide: 'left' },   // 좌측 + → popup 좌측
          ]},
          { image: 'assets/works/A/note/slide-3.png', popups: [
            { x: '65%', y: '47%', popupImage: 'assets/works/A/note/popup/popup-3-1.png' },
            { x: '40%', y: '70%', popupImage: 'assets/works/A/note/popup/popup-3-2.png' },
          ]},
          { image: 'assets/works/A/note/slide-4-base.png', popups: [
            { x: '67%', y: '35%', colorVariation: true },
          ]},
        ],
      },
      centerTop: {
        type: 'model',
        model: 'assets/models/troso_white.glb',
        ui: {
          image: 'assets/halls/A/ui/main.png',
          x: '50%',
          y: '78%',
          size: '22%',
        },
      },
      // 중앙 아래 — 정적 이미지 (토르소 바닥)
      centerBottom: {
        image: 'assets/works/A/note/floor.png',
      },
      // 우 패널 — 5:2 split. 좌(5) = 작가노트존 (bg + header + 카드 슬라이드), 우(2) = exit
      right: {
        split: '5:2',
        bg:     'assets/works/A/note/note-bg.png',
        header: 'assets/works/A/note/note-fixed.png',
        slides: {
          items: [
            { image: 'assets/works/A/note/note-1.png' },
            { image: 'assets/works/A/note/note-2.png' },
            { image: 'assets/works/A/note/note-3.png' },
            { image: 'assets/works/A/note/note-4.png', onClickImmersive: true },   // 클릭 → 이머시브 진입
          ],
        },
        toggle: {
          image: 'assets/works/A/note/lobby-exit.png',
          label: '로비로 나가기',
          alwaysOverlay: false,
        },
      },

      // 좌 슬라이드 popups 는 left.slides[N].popups 에 정의 — 진입 시 자동 핫스팟 생성.
      //  자산 안에 + 마크가 이미 그려져 있어 추가 + 버튼 표시 없음 (invisible 클릭존만).
      hotspots: [],

      // ── 토르소 이머시브 공간 (sub-mode) ─────────────────────
      //  trigger: 우측 슬라이드 4(note-4.png, XR Zone) 클릭 → 이머시브 4 패널 swap
      //  exit: 우 패널 toggle(exit-btn) 클릭 → returnToLobby
      immersive: {
        background: '#000',
        immersiveMode: true,    // 우 패널 단일 컬럼 + exit gradient overlay 활성화
        left:        { image: 'assets/works/A/immersive/left.png' },
        centerTop:   { type: 'image', image: 'assets/works/A/immersive/front.png' },
        centerBottom:{ image: 'assets/works/A/immersive/floor.png' },
        right: {
          image: 'assets/works/A/immersive/right.png',
          // immersive 모드 — 자산 이미지 없이 label 만, CSS 가 gradient 오버레이로 처리
          toggle: { label: '로비로 나가기' },
        },
        hotspots: [
          // 좌 패널: popup-1(좌 — 여성 몸체 옆) → popup 하단(몸 쪽). popup-3(우)
          { panel: 'left',      x: '19%', y: '23%', popupImage: 'assets/works/A/immersive/popup/popup-1.png', invisible: true, popupSide: 'bottom' },
          { panel: 'left',      x: '55%', y: '47%', popupImage: 'assets/works/A/immersive/popup/popup-3.png', invisible: true },
          // 중앙 패널: popup-2(좌측 중앙/하단) → 좌측, popup-4(우상) → 기본 우측
          { panel: 'centerTop', x: '37%', y: '48%', popupImage: 'assets/works/A/immersive/popup/popup-2.png', invisible: true, popupSide: 'left' },
          { panel: 'centerTop', x: '57%', y: '24%', popupImage: 'assets/works/A/immersive/popup/popup-4.png', invisible: true },
          // 우 패널: popup-5 → 좌측
          { panel: 'right',     x: '42%', y: '33%', popupImage: 'assets/works/A/immersive/popup/popup-5.png', invisible: true, popupSide: 'left' },
        ],
      },
    },
    // ── 작품 B관 (해태/소화전) — 새 가이드 v2 ────────────────
    //  단계 1: 어두운 배경 정적 4패널만 임시 반영. 단계 5/6/7 에서 3페이즈로 재설계
    //   (어두운배경 → 4분할 mp4 전환 → 밝은배경 + 카드 팝업)
    B: {
      background: '#000',
      bubbleStyle: 'dark',
      // 로비에서 해태(활성2) 클릭 → hall 들어가는 전환 영상.
      //  4 패널 동시 재생 (정면 mp4 에 BGM 포함, 나머지 muted).
      //  영상 끝나면 fade-out 하고 어두운배경 정적 화면(아래 패널들)으로 진입.
      transition: {
        left:  'assets/works/B/transition/left.mp4',
        front: 'assets/works/B/transition/front.mp4',
        right: 'assets/works/B/transition/right.mp4',
        floor: 'assets/works/B/transition/floor.mp4',
      },
      left: {
        image: 'assets/works/B/dark/left.png',
        // 초기 fade hint 제거 — 사용자 요청: 해태 밑 자산의 안내만으로 충분
      },
      centerTop: {
        type: 'image',
        image: 'assets/works/B/dark/front.png',
        // 초기 fade hint 제거
      },
      centerBottom: {
        image: 'assets/works/B/dark/floor.png',
      },
      right: {
        split: '5:2',
        seamless: true,
        image: 'assets/works/B/dark/right.png',
        toggle: {
          image: 'assets/works/B/dark/right.png',
          label: '로비로\n나가기',
          alwaysOverlay: true,
          returnAfterHoverMs: 2000,
        },
      },
      // 어두운배경(default) 에선 + 핫스팟 없음.
      //  중앙위(정면 해태) 클릭 → 밝은배경 phase 로 swap + 아래 lightPhase.hotspots 노출.
      hotspots: [],
      lightPhase: {
        left:   'assets/works/B/light/left.png',
        front:  'assets/works/B/light/front.png',
        right:  'assets/works/B/light/right.png',
        floor:  'assets/works/B/light/floor.png',
        // 밝은배경 활성화 후 + 버튼 — 자산 안에 이미 + 가 그려져 있음 (invisible 핫스팟).
        //  popupSide: 'right' → + 우측에 popup / 'left' → + 좌측에. 사용자 요청 매핑.
        hotspots: [
          { panel: 'centerTop', x: '15%', y: '48%', popupImage: 'assets/works/B/light/popup/popup-1.png', invisible: true, popupSide: 'right' },
          { panel: 'right',     x: '52%', y: '65%', popupImage: 'assets/works/B/light/popup/popup-2.png', invisible: true, popupSide: 'left' },
        ],
      },
    },
    // 작품 C관 — 새 가이드 v2 에서 삭제됨 (제거됨)
  },
};
