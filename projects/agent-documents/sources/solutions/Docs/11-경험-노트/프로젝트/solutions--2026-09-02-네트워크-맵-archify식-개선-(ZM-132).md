# 2026-09-02 네트워크 맵 archify식 개선 (ZM-132)

**요청**: "https://github.com/tt-a1i/archify 처럼 네트워크 맵 개선". archify = JSON 스펙→정적 HTML/SVG 다이어그램 뷰어(Node CLI 스킬, 전역 설치됨). 편집기가 아니라 통째로 못 쓰고, **시각 언어와 뷰어 탐색 기능만 React Flow 에디터에 이식**. 3안 중 1(리스킨)+2(뷰 모드 탐색) 채택, 3(archify HTML 내보내기)은 사용자가 불필요.

**작업 방식**: 사용자 지시로 워크트리 `C:/worktrees/zm-132-fe`(`git worktree add ... -b ZM-132 HEAD`, `node_modules`는 `mklink /J`로 본체 공유, Vite `--port 5175`). FE 전용, BE 무수정, 저장 스키마 무변경.

## 한 것
- **리스킨**: 유형(nodeType)이 색을 결정하는 시맨틱 팔레트(light/dark 두 벌, `netmapTypeColors`)·이모지 글리프 칩+라벨+유형 태그 가로 배치·2px 테두리·선택은 바깥 링·미가용 호스트는 박스째 장애색·엣지가 화살표 마커를 자기 색으로 직접 그림·라벨 칩·다크 토큰(흰색 하드코딩 제거, RF 변수→팔레트, 미니맵 유형색).
- **뷰 모드 탐색**(`explore.ts` 순수 로직 + `ExploreContext` 오버레이): 검색/포커스(1홉 이웃)·Upstream/Downstream/Both 도달·Path(방향 우선→무방향)·**Impact**(장애 호스트 downstream, archify엔 없음)·범례(유형별 개수, 클릭 강조, 8개 초과 `+N`)·PNG/SVG 내보내기·전체화면·단축키(`/`·Esc·F·0·+/-)·trace 애니메이션(reduced-motion 존중).
- 검증: tsc·ESLint 0, 관련 jest 60+ green, 전체 209스위트 중 2건 실패는 main에서도 동일(선재). 헤드리스 Chrome 캡처로 라이트/다크·포커스·downstream·범례·impact·편집 모드 확인.

## 교훈
- 🔴 **React Flow 공용 화살표 마커는 `--xy-edge-stroke` 색 고정** → 색 지정 엣지에서 선은 파랗고 화살표는 회색. 엣지 컴포넌트 안에 `<defs><marker>`를 직접 두고 `markerEnd={url(#id)}`로 해결(EdgeProps의 marker는 있음/없음만 사용).
- 🔴 **내보내기 경계는 `useReactFlow().getNodesBounds`** — 그룹 자식은 부모 상대좌표라 standalone `getNodesBounds`는 RF가 경고(nodeLookup 필요).
- 🔴 **앱 다크 모드는 `prefers-color-scheme`이 아니라 헤더 토글(redux)** → 헤드리스 검증은 `.ant-switch` 클릭. 전환 직후 1.5초 캡처는 antd 전환 중이라 버튼이 검게 찍혀 오진할 뻔(5초 대기).
- **Chrome MCP 미연결 대체**: 헤드리스 Chrome `--remote-debugging-port` + `ws`로 CDP 직접(`cdp-shot.mjs`, scratchpad). 로그인은 curl 쿠키 jar(`#HttpOnly_` 접두 줄 파싱)→`Network.setCookie(domain=localhost)`+`localStorage.isAuthenticated=1`·`x-visitor-id`. BE base는 `http://localhost:3000`(`/api/v1` 없음), `POST /auth/login {username,password}`. Vite 첫 로드는 20초 기다려야 함(6초엔 흰 화면).
- 탐색 상태를 노드 data에 쓰면 dirty/undo가 오염된다 → 컨텍스트 오버레이(라이브 상태와 같은 패턴). 편집 모드에선 idle 강제.
- `elementsSelectable=false`여도 RF `onNodeClick`은 올라온다(실측). 문서 보장은 아님.
- 샘플 맵은 nodeType 칸에 설명문("서버 부하분산")을 넣어 범례가 18종 → 자유 유형은 접기 + 색은 server/host 축 폴백.
- 마스터 파일들이 이미 prettier --check 실패 상태라 전체 재포맷은 하지 않음(diff 노이즈).

## 이어서 — 지리 맵(ZM-135, 같은 날)
사용자 "지리맵에도 추가해줘" → ZM-135 워크트리(ZM-132 위 스택). 탐색 로직·패널·범례를 그대로 쓰고 어댑터(`geoExplore.ts`: hostid=노드, 첫 호스트그룹=유형)만 추가. 지도 반영은 핀 `dimmed/focused`(opacity·포커스 링)·링크 feature 속성 `dimmed/lit`→데이터드리븐 paint + 흰 점선 trace 레이어(`setPaintProperty` 60ms 타이머, reduced-motion 존중). PNG는 `preserveDrawingBuffer`+html-to-image(컨트롤·오버레이 클래스 제외).
- 🔴 **BE dev CORS 허용 오리진은 5173~5175뿐** — 5176으로 띄운 Vite에서 "Failed to fetch"·"Cluster not found"로 헤맴(쿠키 만료로 오진할 뻔). 워크트리 검증은 5175를 쓴다.
- 🔴 **html-to-image `skipFonts: true` 필수** — Pretendard 동적 서브셋(100여 woff2) 내장으로 수십 초. **file-saver에 data URL 문자열을 주면** 교차 오리진 판정→동기 XHR로 수 MB 재읽기 → Blob 변환 후 `saveAs(blob)`. 이 두 수정은 네트워크 맵 내보내기에도 적용(ZM-135 브랜치에 실림).
- 헤드리스 WebGL: `--disable-gpu` 대신 `--use-angle=swiftshader --enable-unsafe-swiftshader`. 로그인 쿠키는 리프레시 회전 탓에 한 번 쓴 뒤 만료될 수 있어 캡처 직전 재로그인.
- 단일 호스트 핀 클릭 = 포커스 + 기존 상세 드로어 동시(집계 핀은 드로어만) — UX 갈림은 검수에 위임.

관련: [[projects/moveseye/2026-07-13-network-maps|2026-07-13-network-maps]] · [[projects/moveseye/2026-07-29-geo-maps|2026-07-29-geo-maps]] · [[projects/moveseye/2026-08-20-design-system-and-help|2026-08-20-design-system-and-help]]
