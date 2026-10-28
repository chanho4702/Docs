# 검수 요청 — 네트워크 맵 archify식 개선 (ZM-132, FE 전용)

- 브랜치/워크트리: `C:/worktrees/zm-132-fe` (`ZM-132`, master `cbfd05c` 기준), **미커밋·미푸시**
- 참고 원본: https://github.com/tt-a1i/archify (JSON→정적 HTML 다이어그램 뷰어). 편집기가 아니라서 통째로 못 쓰고 **보기 좋은 점만 React Flow 에디터에 이식**
- BE 무수정. 저장 문서(diagramJson) 스키마 무변경 — 기존 맵은 그대로 열린다.

## 범위·의도

### 1. 리스킨(노드·엣지·그룹)
| 항목 | 전 | 후 |
|---|---|---|
| 노드 기본색 | 회색 테두리, 색은 사용자가 직접 지정 | **유형(nodeType)이 색을 결정** — client slate·network amber·server emerald·data violet·monitoring cyan·cicd orange·host(유형 없음) blue. 사용자 지정 `color`/`backgroundColor`가 있으면 그것이 우선 |
| 노드 레이아웃 | 이모지 위·라벨 아래 세로 | 이모지를 유형색 칩에 담아 왼쪽, 라벨+유형 태그(소문자 대문자 자간) 오른쪽 가로 |
| 테두리 | 1.5px | 2px, 선택은 테두리색 교체 대신 바깥 링 |
| 미가용 호스트 | 상태점만 빨강 | 테두리·배경도 장애색 |
| 엣지 | 회색 1.5px, 화살표는 RF 공용 마커(항상 회색) | 1.75px, **엣지가 자기 마커를 그림**(선 색과 동일), 라벨은 선 색을 따르는 칩 |
| 다크 모드 | 흰색 하드코딩 다수(`#fff`, 라벨 칩 `rgba(255,255,255,.82)`) | 서피스 토큰. RF 배경/컨트롤/미니맵 변수도 토큰에 매핑, 미니맵 노드는 유형색 |

### 2. 뷰 모드 탐색(편집 모드에선 전부 숨김)
- 캔버스 좌상단 패널: 노드 검색(`/`)·포커스 카드(라벨/유형/IP/라이브 상태/장애 수)·**Upstream/Downstream/Both** 도달 범위·**Path**(시작→끝 클릭, 방향 경로 우선·없으면 무방향)·**Impact**(미가용/장애 호스트의 downstream — archify에 없는 우리 것)·해제
- 좌하단 범례: 유형별 개수, 클릭=그 유형만 강조. 8개 초과는 `+N` 접기(샘플 맵은 자유 유형 18종)
- 상단바(뷰 모드): 내보내기 PNG/SVG(html-to-image, 뷰포트만 래스터화), 프레젠테이션(전체화면 F)
- 단축키: `/` 검색, `Esc` 해제, `F` 전체화면, `0` 전체 보기, `+`/`-` 줌
- 하이라이트 밖은 흐림(노드 0.22·엣지 0.12), 도달/경로/영향은 엣지 trace 애니메이션(`prefers-reduced-motion` 존중)
- 상태는 노드 data가 아니라 **컨텍스트 오버레이** → dirty/undo 오염 없음. 홈 위젯은 기본값(no-op)

## 🔴 불안한 지점(검수 부탁)
1. **`ShapeNode` 레이아웃이 세로→가로로 바뀌어** 저장된 맵의 노드 `width/height`에 따라 라벨이 잘릴 수 있다(ellipsis 처리). 샘플 맵 7번은 문제없었으나 좁고 높은 노드를 만든 맵이 있으면 확인 필요.
2. **`PortEdge`가 RF 공용 마커를 버리고 `<defs><marker>`를 엣지 안에 렌더** — `markerStart/markerEnd` prop은 "있음/없음"으로만 쓴다. 저장값(`{type:"arrowclosed"}`)은 그대로 왕복. RF 버전 업 시 EdgeProps의 marker 형태가 바뀌면 화살표가 사라질 수 있음.
3. **`onNodeClick`이 뷰 모드에서만 배선** — `elementsSelectable=false`인데도 RF가 클릭을 올려주는 것을 실측(35노드 샘플)으로 확인. 문서상 보장은 아님.
4. **내보내기는 `useReactFlow().getNodesBounds`**로 경계 계산(그룹 자식 상대좌표 때문. standalone은 RF가 경고). PNG 생성 자체는 헤드리스에서 클릭해 예외 없음까지만 확인, **파일 내용은 미검증**.
5. 프레젠테이션은 `requestFullscreen` — 헤드리스에서 검증 불가(**미검증**). `fullscreenchange` 후 50ms 뒤 fitView.
6. 범례/유형색은 `nodeType` 문자열 그대로 키로 쓴다. 샘플 맵처럼 nodeType에 설명문("서버 부하분산")을 넣은 맵은 범례가 노이즈 → `+N` 접기로 완화만 했고, 자유 유형은 전부 server(초록)/host(파랑) 축으로 폴백.
7. `useNetmapExplorer`의 `focusNode` 등은 `useCallback`이지만 반환 객체 `explorer` 자체는 매 렌더 새 객체 → 단축키 effect가 렌더마다 재등록된다(성능 문제는 아니나 깔끔하진 않음).

## 검증
- `tsc --noEmit` 0 · ESLint(--max-warnings 0) 0 · 관련 jest 6스위트 60+ green
- 전체 jest 2회: 209스위트 중 **2개 실패(AiAssistantPage·TriggerFormDrawer) — main 체크아웃에서도 동일하게 실패, 이번 변경과 무관**(첫 회차엔 3개, waitFor 타임아웃 플레이크 포함)
- 런타임(헤드리스 Chrome+CDP, `:5175` 워크트리 Vite + `:3000` BE, 샘플 맵 id 7·35노드): 뷰/포커스/downstream/범례/impact/편집 모드/다크 모드 캡처 — 스크린샷은 scratchpad(`light_0*.png`·`dark_0*.png`)
- **미검증**: 전체화면, PNG/SVG 파일 내용, 실제 마우스 드래그 편집(정적 렌더만), Chrome MCP 미연결로 사람 눈 검토 없음

## 변경 파일
- 신규: `explore.ts`(순수 로직) · `exploreContext.tsx` · `useNetmapExplorer.ts` · `exportImage.ts` · `components/NetworkMapExplorerPanel.tsx` · `components/NetworkMapLegend.tsx` · 테스트 4개
- 수정: `constants/networkMap.ts`(유형 팔레트) · `nodes/content.tsx`·`PortEdge.tsx`·`HostNode.tsx`·`ShapeNode.tsx`·`GroupNode.tsx` · `NetworkMapEditorPage.tsx`·`NetworkMapTopBar.tsx`·`NetworkMapPalette.tsx`·`NetworkMapPropertyPanel.tsx`(흰색 하드코딩 제거) · `locales/en.json`·`kr.json` · `__tests__/NetworkMapNodes.test.tsx`

## 코덱스 검수 결과(2026-09-02, `codex exec --sandbox read-only`) 및 반영
- 🔴 아이콘 전용 버튼(도달 3·경로·해제)에 accessible name 없음 → `aria-label` 추가. **반영**
- 🟡 검색 입력 안에서 Esc가 blur만 하고 탐색을 안 풀었음 → Esc=탐색 해제+blur, 검색어는 패널이 비움. **반영**
- 🟡 `explorer` 반환 객체가 렌더마다 새로 생성돼 전역 keydown 재등록 → 반환 객체 `useMemo`(빈 pathOrder도 고정 배열), effect 의존성은 `explorer.clear`로 축소. **반영**
- 🟡 테스트 공백 → `networkmapPortEdgeMarker.test.tsx`(문자열/객체 marker 모두 자체 마커·선 색·강조/흐림 5건), `networkmapViewModeNodeClick.test.tsx`(실제 React Flow에서 `elementsSelectable=false`여도 onNodeClick 도달, ResizeObserver 스텁). **반영.** 실제 DOM PNG/SVG 내용 검증은 jsdom에서 래스터화가 안 돼 **미반영(한계로 남김)**.
- 🟢 확인 완료 4건(내보내기 경계·오버레이 무오염·marker round-trip·다크 토큰).
- 코덱스 sandbox는 jest 실행 불가(EPERM) — 테스트는 Claude 측에서 실행.
