# 코덱스 검수 결과 — APM P2 FE 1차 (2026-09-02, codex exec read-only, 대상 9495aa4)

검수 대상: `9495aa4` (`cbfd05c..HEAD`) 커밋만 확인했으며 워킹트리 변경은 제외했습니다.  
트리 조립·브러시 URL 갱신·플레임 병렬 자식 처리·selfMs 서비스 비율·§10 타입과 kr/en 추가 키는 대체로 계약에 부합합니다.  
테스트는 지시대로 실행하지 않았고, jsdom 테스트는 실제 레이아웃·가상 스크롤·ECharts `renderItem` 실행을 검증하지 않습니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | `src/pages/application-monitoring/traces/waterfall/apmWaterfall.ts:77` | `offsetMs === totalMs`인 0ms 스팬에서 `widthPct`를 최소폭으로 재강제한다. | `leftPct=100`, `widthPct=0.4`가 되어 막대가 워터폴 우측 밖으로 넘친다. “창 안에 자른다”는 주석·계약의 0ms 표시 의도와 반대다. 현 테스트는 `offset < total`만 검사해 놓친다. | 최소폭은 남은 폭이 있을 때만 적용하고, 끝점 스팬은 `leftPct`를 미세하게 당기거나 별도 마커로 렌더링하라. 정확히 끝점인 0ms 회귀 테스트를 추가하라. |
| 2 | 🔴 | `src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:180` | 가상화 계산 행 높이(28px)와 실제 행 높이가 어긋난다. | 기본 `content-box`에서 `height: 28px`와 `borderBottom: 1px`은 실제 29px이다. 120행 초과 시 padding/window는 28px 단위라 스크롤이 내려갈수록 행 위치가 누적 드리프트한다. `jsdom`은 레이아웃을 계산하지 않아 현재 테스트로 잡히지 않는다. | 행에 `boxSizing: "border-box"`를 명시하거나 높이 상수에 border를 포함하고, 브라우저/E2E에서 대량 행 스크롤 위치를 검증하라. |
| 3 | 🟡 | `src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:198` | 접기 토글이 키보드 접근 불가다. | WBS C7은 키보드를 요구하는데 토글은 `role="button"`이면서 `tabIndex={-1}`이고 Enter/Space handler가 없다. 행 선택만 키보드로 가능하며 트리 접기/펼치기는 불가능하다. | 실제 `<button>`으로 교체하거나 `tabIndex=0`, Enter/Space 처리 및 `aria-expanded`를 추가하라. |
| 4 | 🟡 | `src/__tests__/fixtures/apmTraceContractSample.ts:10` | 트레이스 픽스처가 BE payload가 아닌 계약 문장에서 파생됐다. | FE 타입과 픽스처를 함께 만든 구조라 null/필드명 drift를 실제로 탐지하지 못한다. `typecheck:contract`도 현재는 FE 내부 일관성만 확인한다. | §10.6 요청대로 BE의 `trace-list/scatter/detail/flame` 실제 JSON 표본을 제공받아 교체하라. |
| 5 | 🟡 | `src/__tests__/apmTraces.test.ts:279`, `src/__tests__/apmTraceScreens.test.tsx:69` | ECharts와 가상화의 실제 런타임 동작은 검증하지 않는다. | 산점도는 옵션 객체와 brush payload 변환만, 플레임은 `flattenApmFlame`만 검증한다. jsdom은 canvas/ECharts `renderItem`, brush 이벤트, 실제 DOM 행 높이를 실행·측정하지 못한다. | 브라우저 E2E로 0ms 점, brush→URL→목록 재조회, 병렬 플레임, 121행 이상 워터폴 스크롤을 확인하라. |
| 6 | 🟡 | `src/pages/application-monitoring/traces/ApmTracesPage.tsx:39` | §10.5의 ADMIN 메뉴 게이트가 여전히 없다. | 계약 §10.6에도 명시됐듯 USER는 APM 메뉴·진입점을 보지만 API에서 `200 + code:403`을 받는다. 이번 범위 밖이라는 판단은 문서화됐지만, 사용자 흐름은 계속 깨진다. | 별도 후속 커밋에서 SideNav·홈 위젯·전역 검색 진입점을 `useIsUserRoleAdmin` 축으로 정리하고 권한 테스트를 추가하라. |

다음 커밋 전 반드시 고칠 것:

- [ ] 워터폴 끝점 0ms 스팬의 우측 overflow를 제거하고 회귀 테스트 추가
- [ ] 가상 행의 실측 높이와 `APM_WATERFALL_ROW_HEIGHT`를 일치
- [ ] 접기 토글의 키보드 조작과 `aria-expanded` 지원
- [ ] 가능하면 BE 실제 트레이스 표본 JSON으로 파생 픽스처 교체
