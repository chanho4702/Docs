# 검수 요청 — 지리 맵 archify식 탐색 (ZM-135, FE 전용)

- 커밋 `0f044f6`(ZM-135, ZM-132 위 스택) — **FE master 병합·푸시 완료(2026-09-02)**, 워크트리 정리됨
- 배경: ZM-132(네트워크 맵 archify식 개선)의 뷰 모드 탐색을 지리 맵 클러스터 상세(`GeoMapClusterDetailPage`)에도 적용. 검수 원본 `review_network-map-archify.md`
- BE 무수정. 지리 맵 저장 문서(diagramJson) 무변경.

## 범위·의도
- **탐색 로직 재사용**: `geoExplore.ts`가 배치 호스트(좌표 해석된 것)+문서 링크를 `explore.ts`용 그래프로 변환(노드 id=hostid, `nodeType`=첫 호스트그룹, `subtitle`=그룹 목록). 상태 훅 `useNetmapExplorer`, 패널 `NetworkMapExplorerPanel`, 범례 `NetworkMapLegend`를 그대로 쓴다(패널에 `typeColor`, 범례에 `colorFor/labelFor/title` 주입 prop만 추가, 검색 인덱스에 `subtitle` 지원).
- **지도 반영**: 핀은 `createPinElement`에 `dimmed/focused`(흐림 0.25·선택색 테두리·포커스 링), 링크는 feature 속성 `dimmed/lit`→데이터드리븐 `line-opacity/width` + 강조 링크 위 흰 점선 `geomap-links-trace` 레이어를 `setPaintProperty` 타이머로 흘림(`prefers-reduced-motion` 존중, mock map은 건너뜀).
- **범례 = 호스트그룹**(첫 그룹 기준, 그룹 없음은 별도 묶음). 색은 그룹 이름 해시 → `CHART_SERIES` 고정 배정.
- **PNG 내보내기**: `MapCanvas`에 `preserveDrawingBuffer` prop(상세만 켬) → html-to-image로 지도 카드 래스터화(컨트롤·오버레이는 `geomap-export-exclude` 클래스로 제외). SVG 없음(WebGL 타일은 어차피 래스터).
- **프레젠테이션**: 페이지 루트 `requestFullscreen`, 좌측 필터 카드 숨김, `map.resize()`+fitBounds.
- 단축키 `/`·Esc·F·0·+/-. 핀 클릭(단일 호스트 핀)=포커스/경로 선택 + 기존 상세 드로어, 배경 클릭=해제(경로 모드 제외).
- 🔧 **ZM-132 파일 수정 2건이 이 브랜치에 실림**(내보내기 공통): `skipFonts: true`(Pretendard 동적 서브셋 100여 파일 내장으로 수십 초 걸리던 것) · data URL→**Blob 저장**(file-saver가 data URL 문자열을 교차 오리진으로 보고 동기 XHR로 다시 읽던 경로 회피). 실측: 지리 8초 내·네트워크 1.5초 내 저장 확인.

## 🔴 불안한 지점
1. **핀 클릭 = 포커스 + 드로어 동시 열림.** 단일 호스트 핀 클릭 시 기존 `PinDetailPanel`(오른쪽 Drawer)이 열리면서 지도 오른쪽을 덮는다. 탐색 UX상 거슬리면 "포커스만" 또는 "드로어만"으로 갈라야 한다(경로 모드에서는 드로어를 열지 않음).
2. **집계 핀(호스트 2개 이상, 같은 지점)은 탐색 대상이 아님** — 어느 호스트인지 모호해서 드로어만 연다. 검색으로는 개별 호스트 포커스 가능.
3. **범례가 첫 호스트그룹만 센다** — 여러 그룹에 속한 호스트는 한 그룹으로만 집계.
4. **trace 애니메이션은 `setTimeout` 60ms로 `setPaintProperty`** — 링크가 수백 개면 프레임마다 스타일 재평가. 하이라이트가 켜진 동안만 돌고 해제/언마운트에 정리하지만 실측은 11링크뿐.
5. `MapCanvas`의 `preserveDrawingBuffer`는 상세 화면만 true — 편집기/랜딩/홈 위젯은 그대로(성능 영향 없음). 내보내기 결과물 픽셀 내용은 미검증(파일 저장·크기 63자 blob URL까지만).
6. 전체화면 미검증(헤드리스 불가). 다크 모드는 오버레이·범례만 캡처 확인(지도 타일은 스타일 그대로).
7. `hostgroupColors`는 `getPalette()`를 호출 시점에 읽는다 — 테마 토글 후 다시 렌더될 때 갱신(상세 페이지는 `usePalette`로 리렌더되므로 반영됨, 홈 위젯은 미사용).

## 검증
- `tsc --noEmit` 0 · ESLint(--max-warnings 0) 0 · jest: 신규 `geomapExplore`(7)·`geomapPinElementExplore`(3)·`geomapLinkLayer`(+1) + 공유 컴포넌트/내보내기 스위트 green
- 런타임(헤드리스 Chrome+swiftshader WebGL, `:5175` 워크트리 Vite + `:3000` BE, 클러스터 5·호스트 13·링크 11): 뷰/포커스(카드·링·드로어)/Both 도달(trace 점선)/범례 클릭/영향 전파(13)/PNG 저장/다크 모드 캡처 — `scratchpad/geo_0*.png`
- 🔴 BE dev CORS 허용 오리진은 5173~5175뿐 — 5176으로 띄우면 "Failed to fetch"(원인 파악에 시간 씀)

## 변경 파일
- 신규: `geomaps/geoExplore.ts` · `geomaps/geoExport.ts` · 테스트 `geomapExplore.test.ts`·`geomapPinElementExplore.test.ts`
- 수정: `GeoMapClusterDetailPage.tsx`(배선) · `map/MapCanvas.tsx`(preserveDrawingBuffer) · `map/pinElement.ts`·`map/HostPinLayer.tsx`(dimmed/focused) · `map/LinkLayer.tsx`(highlight/trace) · `networkmap/explore.ts`(subtitle) · `networkmap/components/NetworkMapExplorerPanel.tsx`(typeColor·subtitle) · `networkmap/components/NetworkMapLegend.tsx`(colorFor/labelFor/title) · `networkmap/exportImage.ts`(skipFonts·Blob) · `locales/en.json`·`kr.json` · 테스트 `geomapLinkLayer.test.tsx`·`networkmapExportImage.test.ts`

## 코덱스 검수 결과(2026-09-02, `codex exec --sandbox read-only`, 대상 0f044f6) 및 반영
- 🔴 단일 호스트 핀 클릭이 탐색 포커스와 상세 드로어를 동시에 열어 지도를 가림 → **클릭은 포커스만**, 상세는 포커스 카드의 [상세 열기](ⓘ) 버튼(`NetworkMapExplorerPanel.onOpenDetail`)으로 분리. 같은 지점 여러 호스트 핀은 예전대로 드로어만. **반영**
- 🟡 `fullscreenchange` 50ms 타이머 미정리(제거된 지도에 resize/fitBounds 가능) → 타이머 보관·cleanup에서 clear, 콜백에서 `map.style` 확인. **반영**
- 🟡 통합 테스트 공백 → `GeoMapClusterDetailExplore.test.tsx`(핀 클릭=포커스만·카드 버튼으로 드로어·Esc 해제·`/` 검색 포커스·범례 그룹 강조·영향 전파 3건) + `geomapExport.test.ts`(컨트롤/오버레이 제외 필터·skipFonts·Blob 저장·미준비 거부 3건). **반영.** fullscreen 후 `map.resize()`는 jsdom에 fullscreen API가 없어 미검증.
- 🟢 확인 완료 5건(trace 타이머 정리·preserveDrawingBuffer 상세 한정·마커 재생성 조건·다크 모드 색 재계산·round-trip 무훼손).
