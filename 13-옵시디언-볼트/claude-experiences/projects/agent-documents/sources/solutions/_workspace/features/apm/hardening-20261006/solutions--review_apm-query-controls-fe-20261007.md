# 검수 요청 — APM 순위 9~10 FE: env 필터·외부 호출 행 선택·수동 갱신·내보내기 env 검증 (2026-10-07)

구현: Claude(`fe-engineer` 에이전트, SOLO-CLAUDE). 검수: Codex. 기준 FE master `dfb0442`(작업 트리 미커밋 30파일 +791/−75). BE 짝: 브랜치 `apm-query-controls`(코덱스 2차 승인, `review_apm-query-controls-be-20261007.md`).
계약: `_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md` "FE 선택·갱신"·"2026-10-07 구현 결정".

## 범위 (`src/` 아래)

- **타입·API·훅·상수**: `types/apm.ts`(각 Params·`TApmGroupScopeParams`·`TApmExportPlan.env?`), `services/apm.api.ts`(시그니처 타입), `hooks/useApm.ts`(쿼리 키에 env·상세/series에 service), `hooks/useApmTimeRange.ts`(`setEnv(next, resetKeys)`), `constants/apm.ts`(`normalizeApmEnv`, `APM_DEPENDENCY_PARAM.SELECTED_SERVICE="depSelService"`).
- **화면**: 트레이스(`useApmTraceFilters`·`ApmTracesPage`), 오류(`ApmErrorsPage`·`ApmErrorExplorer`·`ApmErrorGroupPanel`), DB(`ApmDbCallsPage`·`ApmDbExplorer`·`ApmDbQueryPanel`), 외부 호출(`ApmDependenciesPage`·`ApmDependencyExplorer`), `ApmOverviewPage`(RED 내보내기 env), `ApmServiceDetailPage`(갱신 키 보충), `ApmToolbar`(`envResetKeys`), 내보내기(`shared/apmExport.ts`·`ApmExportButton`·`ApmExportModal`).
- **i18n** kr/en: `apm.export.env_unsupported`, `apm.export.plan.env`, `apm.dependencies.unidentified_service`, `all_services_env` 문구 정정.
- **테스트**: 기존 7종 갱신 + 신규 `apmAggPagesWiring.test.tsx`. 관련 9스위트 210건 통과, 전체 jest 3,913 중 3,905 통과(실패 8건은 HEAD에서도 동일한 기존 실패: `apmHelpContent` 3·`apmRoutes` 3·`AiAssistantPage` 1·`TriggerFormDrawer` 1 — `git stash -u`로 대조). `tsc`·`typecheck:contract`·eslint 통과.

## 의도 — 선택과 버린 대안

1. **env를 싣는 범위**: 전역 화면만. 고정 서비스 탭(서비스 상세)은 env를 보내지 않는다(고정 service가 정본, 계약).
2. **쿼리 키의 env는 `normalizeApmEnv`(trim·소문자, 비면 null)** — 원문을 키에 넣으면 " PROD "와 prod가 캐시를 쪼갠다. 요청에는 원문 그대로(BE가 정규화).
3. **env 변경의 원자적 초기화**는 `setEnv(next, resetKeys)` 한 번의 `updateParams`. 페이지가 env 변경을 감지해 따로 `updateParams`하는 안은 렌더 스냅샷 때문에 뒤 호출이 앞을 덮어 버림.
4. **외부 호출 행 선택**은 `(serviceUid, target)` — `depSelService`+`depTarget` 한 번에 저장, series는 선택 행의 서비스 하나로만. **null UID 행**은 `depTarget`만 저장하고 series를 부르지 않으며 안내 문구(합산 대체 금지). 서비스 없이 target만 든 옛 링크는 "선택 없음"(목록 필터 `depService`로 추정하는 안은 계약 위반이라 버림). 목록 필터 서비스를 바꾸면 선택 행도 지운다.
5. **수동 갱신**은 `useApmRefresh`로 통일(목록·열린 상세·series), 내보내기 계획은 제외(클릭 시점 scope 유지).
6. **내보내기 응답 검증** `apmExportEnvUnsupported`(순수 함수): env를 보냈는데 `plan.env`가 없음/null/정규화 불일치면 다운로드 차단+경고. 계획 확정 뒤에만 판정(깜빡임 방지). env를 안 보냈으면 종전.
7. `all_services_env` 키 이름은 기존 테스트 참조 때문에 유지, 문구만 정정.

## 중점 확인 요청

- [ ] **BE JSON의 null 생략**: BE `ApmExportIT`에서 env 없는 요청의 `$.data.env`가 `doesNotExist`였다(Jackson NON_NULL). FE 판정은 "env를 보냈을 때만" 보므로 영향 없다고 보지만, 다른 경로(구 BE)에서 env를 보냈는데 키가 없는 경우를 "미지원"으로 막는 것이 맞는지.
- [ ] **`setEnv(next, resetKeys)` 시그니처 변경** — `useApmTimeRange` 소비자 전부 확인됐는지(툴바 외 호출처).
- [ ] **`depSelService` URL 키 추가** — 북마크·공유 링크 호환(옛 링크 = 선택 없음)과 서비스 상세 탭의 고정 uid 우선.
- [ ] **쿼리 키 정규화와 요청 원문 분리** — 같은 키인데 다른 원문 요청이 캐시를 공유하는 것이 정확한지(BE 정규화가 같으므로 응답 동일).
- [ ] **`ApmOverviewPage` RED 내보내기에 env** — 기존 테스트 기대값을 반전했다(env가 계획에 실림). 계약서 변경(세 데이터셋 env 적용)과 일치하는지.
- [ ] CRLF: `git stash`/`pop` 뒤 일부 파일 줄끝이 CRLF로 보일 수 있으나 diff는 실제 변경분만.

## 검증 현황

**통과**: 위 테스트·타입 검사. **못 한 것**: 실제 BE(브랜치 `apm-query-controls`)에 붙인 브라우저 런타임 — URL 전환·↻ 뒤 시간창 전진·열린 상세 동시 갱신·범위 밖 그룹 not-found·다른 env에 옛 planToken 거절. dev BE는 재기동하지 않았다.

## 검수 결과 1차 (Codex, 2026-10-07 — 전문 `review_apm-query-controls-fe-20261007_codex.md`)

판정 **보완 후 재검수** — 🔴1·🟡3. 적합: BE 파라미터 계약·export env/planToken·외부 호출 `(serviceUid,target)`·null UID·옛 링크·`setEnv` 원자성.

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | 🔴 | 개요·서비스 목록·서비스 맵이 여전히 `refetch()`만 — 시간창 전진 없음, 열린 `EDGE_SERIES` 미갱신 | [x] `useApmRefresh` 전환(개요 OVERVIEW·SERVICES / 목록 SERVICES / 맵 SERVICES·SERVICE_MAP·EDGE_SERIES — 엣지 패널은 같은 키의 활성 쿼리라 함께 갱신). 테스트: wiring(맵)·`ApmOverviewPage.test`·`ApmServiceListPage.test` |
| 2 | 🟡 | 서비스 맵 env 변경이 `mapService`·`mapEdge`를 안 지움 | [x] `envResetKeys={[APM_MAP_PARAM.SERVICE, APM_MAP_PARAM.EDGE]}` + 테스트 |
| 3 | 🟡 | FE `normalizeApmEnv`(trim·lower)가 BE 정본(NFC·Locale.ROOT·128자)과 달라 캐시 alias 가능(U+2003 등) | [x] `useApm.ts` 키 8곳 전부 요청 원문(`params.env ?? null`). `normalizeApmEnv`는 export 응답 대조에만 남기고 "BE 정본의 근사 — 어긋나면 차단 쪽으로만 틀린다" 주석. `apmHooks.test` 반전(`" PROD "`·`"prod "`는 `prod`와 다른 키) |
| 4 | 🟡 | 고정 서비스 상세로 URL env 유입(옵션 조회·서비스 전환·목록/개요 링크가 전체 query 보존) | [x] `utils/apmNavigation.apmServiceDetailSearch`(query에서 env 제거) — 상세 옵션 `{from,to}`만, 서비스 전환·목록/카드뷰·`ApmTopServicesCard`·**추가로** `ApmServiceHeatmapCard`·`ApmRecentAlertsCard`·`ApmLivePanel`·`ApmActiveTab.detailHref`(env를 일부러 복사하던 코드 제거)까지. 테스트: `ApmServiceDetailPage.test`·`apmNavigation.test`·`ApmLivePanel.test` |

반영 검증: tsc·`typecheck:contract`·관련 jest 통과, 전체 jest 3,921건 중 실패 8건 = HEAD 기존 실패(신규 0).

## 검수 결과 2차 (Codex, 2026-10-07 — 전문 `review_apm-query-controls-fe-20261007_codex2.md`)

**조건부 승인** — 🔴0·🟡1·🟢1. 1차 4건: 🔴1·🟡2 닫힘, 🟡3·🟡4 부분 닫힘(아래 2건). 상세의 서비스 전환 옵션이 전 환경이 된 것은 의도된 동작(계약 "고정 service 정본")으로 확인.

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | 🟡 | export env 대조 `normalizeApmEnv`(JS `trim`)가 `" prod"`(BE 보존)와 `"prod"`를 같다고 봐 **열리는 쪽**으로 틀림 — "차단 쪽으로만 틀린다"는 설명 불성립 | [x] `normalizeApmEnv`를 BE `ApmNaming.normalize` **이식**으로 교체: Java trim(U+0020 이하만)→NFC→소문자→128 UTF-16 절단. 주석 정정. 테스트 `apmExportEnv.test.ts`(U+2003 비대칭·NFC·128 경계·null/없음) |
| 2 | 🟢 | 상세 컨테이너가 원본 `searchParams`를 `ApmServiceOverviewTab`에 넘겨 Top5 엔드포인트 딥링크에 env 잔류 | [x] `search={apmServiceDetailSearch(searchParams)}` |

반영 검증: tsc·`typecheck:contract`·관련 jest 통과. 3차 검수는 생략(두 건 모두 코덱스가 권고한 그대로 반영, 단위 테스트로 고정).
