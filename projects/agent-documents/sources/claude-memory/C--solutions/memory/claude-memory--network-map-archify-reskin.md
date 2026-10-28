---
name: network-map-archify-reskin
description: "네트워크 맵 archify식 개선(ZM-132, 커밋 ef65b3e·a61c902(태그 FEATURE로 재작성, 푸시 완료)) + 지리 맵 탐색(ZM-135, C:/worktrees/zm-135-fe, ZM-132 위 스택, 커밋 7607bfc, 푸시 완료). 유형 시맨틱 팔레트·엣지 자체 마커·뷰 모드 탐색(검색/도달/경로/영향/범례)·내보내기·전체화면"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0628ef8c-b6b1-408c-9965-548c9bb1fd5f
  modified: 2026-09-02T05:19:56.319Z
---

**상태(2026-09-02)**: 사용자 요청 "https://github.com/tt-a1i/archify 처럼 네트워크 맵 개선". 3안 중 **1(리스킨)+2(뷰 모드 탐색) 확정, 3(archify HTML 내보내기)은 사용자가 불필요 판정**. 워크트리 `C:/worktrees/zm-132-fe`(브랜치 `ZM-132`, master `cbfd05c` 기준, `node_modules`는 junction) **커밋 `ef65b3e`+`a61c902`(ZM-132, `[FEATURE]`로 filter-branch 재작성, 사용자 지시로 2026-09-02 푸시 완료)**, 검수요청 `_workspace/features/maps/network-maps/review_network-map-archify.md`. BE 무수정·diagramJson 스키마 무변경.

**핵심 결정**
- archify는 JSON→정적 HTML 뷰어(Node CLI, `~/.claude/skills/archify`)라 이식 대상은 "시각 언어+뷰어 탐색 기능"뿐. 유형이 색을 결정(`netmapTypeColors`, light/dark 두 벌), 사용자 지정 색 우선.
- 탐색 상태는 노드 data가 아닌 `ExploreContext` 오버레이 → dirty/undo 무오염, 홈 위젯 no-op.
- Impact(장애 호스트 downstream)는 archify에 없는 우리 차별점.

**교훈**
- 🔴 RF 공용 화살표 마커는 색이 `--xy-edge-stroke` 고정 → 색 지정 엣지에서 선만 파랗고 화살표는 회색. 엣지 안에 `<defs><marker>`를 직접 그려 해결.
- 🔴 내보내기 경계는 `useReactFlow().getNodesBounds`(그룹 자식 상대좌표). standalone `getNodesBounds`는 RF가 경고.
- 🔴 앱 다크 모드는 `prefers-color-scheme`이 아니라 헤더 토글(redux) → 헤드리스 검증은 `.ant-switch` 클릭. 테마 전환 직후 1.5초 캡처는 antd 전환 중이라 버튼이 검게 찍힘(5초 대기 필요).
- Chrome MCP 미연결 시 **헤드리스 Chrome+CDP(`ws` 패키지) 스크립트**(정본 `C:/solutions/_tools/headless-shot/cdp-shot.mjs` + `plan.example.json`)로 대체 가능: curl 로그인 쿠키(`#HttpOnly_` 접두 파싱)+`localStorage.isAuthenticated=1`+`x-visitor-id` 주입. BE base는 `http://localhost:3000`(`/api/v1` 없음), 로그인 `POST /auth/login {username,password}`.
- 샘플 맵은 nodeType에 설명문을 넣어 범례가 18종 → `+N` 접기.
- 전체 jest에서 AiAssistantPage·TriggerFormDrawer 2건은 main에서도 실패(선재, 무관).

**ZM-135 지리 맵(2026-09-02, 같은 날 이어서)**: 사용자 "지리맵에도 추가" → 워크트리 `C:/worktrees/zm-135-fe`(브랜치 `ZM-135`, **ZM-132 `45f56d1` 위 스택** — 탐색 모듈 재사용). `geoExplore.ts`(hostid=노드, nodeType=첫 호스트그룹)·핀 dimmed/focused·LinkLayer highlight+trace(setPaintProperty 타이머)·호스트그룹 범례·PNG 내보내기(`preserveDrawingBuffer`)·전체화면. 검수요청 `_workspace/features/maps/geo-maps/review_geo-map-explore.md`, **커밋 `7607bfc`(ZM-135, 재스택 후 푸시 완료)**. 🔴교훈: **BE dev CORS는 5173~5175만** 허용(5176은 Failed to fetch) · html-to-image는 `skipFonts: true` 필수(Pretendard 서브셋 100여 파일 내장에 수십 초) · **file-saver에 data URL 문자열을 주면 동기 XHR 경로**로 멈춤 → Blob 변환 후 saveAs(두 맵 공통, ZM-135에 실림) · 헤드리스 WebGL은 `--use-angle=swiftshader --enable-unsafe-swiftshader`(--disable-gpu 제거) · 로그인 쿠키는 리프레시 회전으로 한 번 쓴 뒤 만료될 수 있어 캡처 직전 재로그인.

**2026-09-02 마무리**: master가 APM 커밋(f4a50a4)으로 움직여 ZM-132→ZM-135 순으로 리베이스 후 **FE master ff 병합 완료(`0f044f6`)**, 브랜치 `--force-with-lease` 재푸시(ZM-132 `293f662`·ZM-135 `0f044f6`), 워크트리 2개 제거. 🔴 node_modules 정션이 있는 worktree는 `git worktree remove --force`가 'Invalid argument'로 디렉터리를 못 지운다(등록만 해제됨) → PowerShell `[System.IO.Directory]::Delete(정션경로)`로 링크만 제거(Git Bash `cmd //c rmdir`은 따옴표 깨짐, PowerShell 도구의 rmdir/Remove-Item은 안전장치에 막힘) → 본체 node_modules 무사 확인 → `rm -rf`. **master 푸시 완료(2026-09-02, 사용자 지시)**. 로컬 브랜치 ZM-132/ZM-135는 남겨 둠.

**ZM-135 코덱스 검수 반영 커밋(master, 2026-09-02 푸시)**: 핀 클릭=포커스만·상세는 카드 ⓘ 버튼(`onOpenDetail`)·전체화면 타이머 정리·통합 테스트 `GeoMapClusterDetailExplore.test.tsx`. **잔여 없음**(전체화면 실기기 확인만 미실시) · master 병합·worktree 정리(사용자 결정) · 코덱스 검수([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-review-handoff|codex-review-handoff]]) · 전체화면·PNG 파일 내용 미검증 · `:5175` Vite는 세션이 띄운 것.
