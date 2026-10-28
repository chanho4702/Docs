# APM P4 RUM·K8s FE 검수 (Claude)

- 대상: git worktree `C:\solutions\moveseyee_fe-p4`, 브랜치 `p4-rum-fe`, 기준 master `5b0d3ce`. 미커밋 신규 13 · 수정 24.
- 구현: 코덱스(gpt-6-astra xhigh). 검수: Claude. **검수 중 worktree 코드는 수정하지 않았다**(변이 실험 3건은 스냅샷 복사본으로 md5 일치 원복).
- 정본: `_workspace/features/apm/core/contract_apm-p4.md`(BE 검수 반영본), BE 표본 `moveseye-be-spring`(master `6af7c46`) `src/test/resources/apm/contract/rum-*.json`, WBS `features/apm/core/devdesign_apm-screens-wbs.md` §3.18.
- 코덱스 산출: `_workspace/_archive/features/apm/core/review_apm-p4-fe_codex-memo.md`, `scratchpad/codex-p4/out_fe.md`.

## 요약 3줄

1. 계약 준수·언랩 깊이·토큰 원문 수명·URL 상태·도움말 전수·null≠0 규약은 **전부 지켜졌고**, 테스트 검출력도 실측으로 확인했다(변이 3건 3건 검출). 정적 게이트(`tsc`, `typecheck:contract`, eslint) 전부 green, 관련 9 스위트 248/248.
2. 다만 신규 공용 부품 `ApmRumTable`이 APM 규약(명시 columns → `DmoveTable`)을 벗어나 **Zabbix 시대의 `useTableColumns`를 경유**하면서, RUM 표의 **모든 숫자 열이 문자열 정렬**되고(`[9,1000,20,3,150] → [1000,150,20,3,9]`) 모든 열에 `ellipsis: true`가 강제된다. 이것 하나가 병합 전 필수 수정이다.
3. 그 밖에 계약이 준 `Vital.goodThreshold/poorThreshold/unit`을 안 읽고 FE 상수로 등급 색을 칠하는 점(같은 카드 안에서 분포와 태그가 갈릴 수 있음), 브라우저 스팬 색이 ERROR·크리티컬 패스를 덮어쓰는 점, 영구 빈 TTFB 열이 남았다. 코덱스 자진 신고 3건(TTFB 열·p75 추이·계약 요청)은 전부 **타당**하며 계약 §🔄에 옮겨 적었다.

---

## 지적 사항

| # | 심각도 | 파일:라인 | 문제 | 왜 | 권고 |
|---|---|---|---|---|---|
| H1 | **HIGH** | `src/pages/application-monitoring/rum/components/ApmRumTable.tsx:15` (원인 `src/hooks/useTableColumns.ts:55`) | `useTableColumns`가 **모든 열**에 `sorter: stringSorter(dataIndex)`를 붙여, RUM 표의 숫자 열이 `String(a).localeCompare(String(b))`로 정렬된다 | 실측 `[9,1000,20,3,150].sort(stringSorter)` → `[1000,150,20,3,9]`. 사용자가 "PV 많은 페이지 / 느린 리소스"를 찾으려고 헤더를 누르면 **그럴듯하게 틀린 순위**를 얻는다. 오류도 경고도 없다. 영향: 페이지 그룹 표 `pv·sessions·jsErrorCount·lcpP75Ms·inpP75Ms·clsP75`, 리소스 표 `count·startMs·durationMs·bytes`, 오류 표 `count`, 토큰 표 `rps·bodyBytes·dailyLimit`. 덤으로 `ttfb`·`actions`·`k8sRestarts`처럼 dataIndex가 실재하지 않는 열에도 정렬 화살표가 붙는다 | `ApmRumTable`에서 `useTableColumns`를 제거하고, APM의 나머지 표 전부가 하는 대로 `t()`를 직접 적용한 columns를 `DmoveTable`에 넘긴다(APM 15여 개 표 중 `useTableColumns`를 쓰는 것은 이 파일 **하나뿐** — 규약 이탈이다). 정렬이 필요한 숫자 열에는 `(a,b)=>(a.x??-Infinity)-(b.x??-Infinity)`를 명시하고, 나머지 열은 `sorter`를 붙이지 않는다 |
| H2 | **HIGH**(브라우저 확인 필요) | 같은 곳 (`useTableColumns.ts:44` `ellipsis: true`) | 같은 훅이 모든 열에 `ellipsis: true`(= td에 `white-space:nowrap; overflow:hidden`)를 강제한다 | 토큰 표 `allowedOrigins` 열은 `whiteSpace:"pre-line"`으로 **여러 origin을 줄바꿈해 보여 주는 것이 존재 이유**인데(`ApmCollectorRumTab.tsx:165-172`) 부모가 nowrap/overflow hidden이 된다. 페이지 그룹 표 `path` 열도 `<Flex vertical>` 3단(링크+토큰+배지)이다. jsdom은 스타일을 적용하지 않으므로 **248개 테스트 전부 통과해도 이 증상은 안 잡힌다**(과거 [[fe-dmovetable-loading-spinner]]와 같은 계열) | H1과 같은 수정으로 함께 해소된다. 고치지 않을 거라면 origin·path 열에 `ellipsis:false`를 명시하고 브라우저 1회 확인 |
| M1 | MEDIUM | `src/pages/application-monitoring/rum/apmRumDisplay.ts:18`, `components/ApmRumVitalValue.tsx:18,24` | 계약이 응답마다 주는 `Vital.goodThreshold`/`poorThreshold`/`unit`을 **한 번도 읽지 않고** `APM_RUM_THRESHOLDS` 상수로 등급을 판정한다 | BE는 자기 임계로 `good/needs/poor` 관측 수를 세고, FE는 자기 상수로 p75 태그 색을 칠한다. 두 값이 갈라지는 날 **같은 카드 안에서 분포 막대는 "대부분 good", p75 태그는 "poor"** 가 되고 아무 신호도 안 뜬다. `threshold_hint` 툴팁도 서버 값이 아니라 상수를 읽어 준다. `unit` 역시 미사용이고 `name === "CLS"` 하드코딩으로 대체돼 있다 | Vital 카드/툴팁은 `vital.goodThreshold`·`vital.poorThreshold`·`vital.unit`을 쓰고, `APM_RUM_THRESHOLDS`는 임계를 안 주는 `PageRow` 전용 폴백으로 남긴다(상수 자체는 계약 표와 값이 일치함을 확인했다) |
| M2 | MEDIUM | `src/pages/application-monitoring/rum/ApmRumPage.tsx:117-121` | "TTFB p75" 열이 전 행 `—`이고, 사유는 `<span title=...>` 호버 툴팁 하나뿐 | 계약에 `PageRow.ttfbP75Ms`가 없다는 진단은 정확하다(→ 계약 §🔄 F1). 그러나 화면에는 "우리 사이트는 TTFB가 전부 미관측"으로 읽힌다. `title` 속성은 모바일·키보드에서 도달 불가라 사실상 아무도 못 본다 | 택1: (a) 계약이 필드를 줄 때까지 **열을 빼고** 상단 TTFB 카드로 안내, (b) 헤더에 `ApmHelp`나 Tag로 "전체 페이지 기준 상단 카드 참조"를 **눈에 보이게** 단다 |
| M3 | MEDIUM | `src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:99` | `if (apmIsBrowserSpan(span)) return palette.HEALTH.unknown;`이 `status==="ERROR"`·`criticalIds` 판정보다 **앞**에 있다 | `apmWaterfall.ts:149-156`에 🔴로 적힌 불변식은 "강조된 스팬 집합 == `criticalPath` 배열 == 그 Σ`selfMs` == `criticalPathMs`"다. 계약 §3은 Browser 행을 **포함해** critical path를 재계산하므로 브라우저 행이 크리티컬 패스에 오를 수 있고, 그때 화면 상단에 적힌 `criticalPathMs`와 강조 막대가 눈으로 안 맞는다. 실패한 브라우저 fetch(`status="ERROR"`)도 회색이 되어 정상처럼 보인다. 출처 구분은 이미 이름 옆 "브라우저" 라벨 + `data-browser`로 하고 있어 색까지 뺏을 이유가 없다 | 판정 순서를 `ERROR → critical → browser`로 내리거나, 회색 대신 테두리·패턴 등 별도 채널로 옮긴다. **테스트 공백**: 현재 브라우저 스팬 케이스는 UNSET·비크리티컬이라 순서를 강제하지 않는다 — 수정 시 "ERROR인 브라우저 스팬은 붉다" 케이스를 함께 추가 |
| M4 | MEDIUM | `ApmRumTable.tsx:24` (`showPagination={false}`) | 페이지 그룹 표를 페이지네이션 없이 전량 렌더한다 | 계약 상한이 **페이지 목록 500행**이다. 최악 500행 × (링크 + 보조 텍스트 + 배지 Flex + 태그 4개) DOM을 한 번에 그린다. 리소스·오류·토큰 표는 상한 50 이하라 무해 | 페이지 그룹 표만 `showPagination`을 기본값으로 두거나 상위 N + "전체 보기" |
| L1 | LOW | `types/apmRum.ts` / `types/apm.ts:150` | `k8sDeployment`가 타입·픽스처에 있으나 **화면 소비처 0** | 인스턴스 탭은 pod/node/namespace 3열만 그린다. 배포명이 파드 이름보다 묶음 단위로 유용하다 | 4번째 열로 추가하거나, 안 쓸 근거를 주석으로 |
| L2 | LOW | `constants/apmRum.ts:3` | `APM_RUM_VITALS`가 LCP/INP/CLS/TTFB 4개라 계약 `Vital.name`의 **FCP는 어디에도 표시되지 않는다**(`APM_RUM_THRESHOLDS`엔 FCP가 있다) | WBS §3.18이 4장만 요구한 것은 맞으나, BE가 FCP를 수집·집계해 보내는데 화면에 없으면 "수집되는 줄 몰랐다"가 된다 | 카드 5장으로 늘리거나(도움말 `rum_fcp` 1개 추가), 상수에서 FCP를 빼고 "미노출" 근거를 주석으로 |
| L3 | LOW | `src/__tests__/fixtures/apm-rum/rum-ingest-{traces,metrics}.json` | 어떤 테스트도 참조하지 않는다(`grep rum-ingest src/` = 0) | 수신 계약이라 FE 소비처가 없는 것이 정상이지만, 죽은 픽스처는 다음 사람에게 "여기 뭔가 검증되고 있다"는 착각을 준다 | 삭제하거나 "참고용 원문, 소비처 없음" 주석 |
| L4 | LOW | `src/pages/application-monitoring/planned/ApmRumPage.tsx` | 라우트가 `rum/ApmRumPage`로 옮겨가면서 고아 파일로 남았다 | `planned/`의 자리표시 화면이 참조 0으로 남음 | 삭제 |
| L5 | LOW | `src/__tests__/fixtures/apm-rum/*.json` | BE 원본과 **줄바꿈만 다르다**(BE 본 트리=CRLF, FE=LF). 내용은 전부 동일 | 코덱스 보고의 "BE JSON 원문 10개 byte 단위 동일성 확인"은 정확히는 "줄바꿈 정규화 후 동일"이다. 파생·편집은 없음을 검수가 재확인했다 | 보고 문구만 정정. 코드 변경 불필요 |
| L6 | LOW | `src/routes/routes.tsx:812` | `/rum/pages` 리다이렉트 라우트만 `PageWrapper`·`FeatureGate` 없이 등록됐다 | `<Navigate>`만 렌더하니 유출은 없다. 다만 `apmRoutes.test`의 "게이트 밖으로 샌 화면이 없다"는 `permissionKey` 개수 == `FeatureGate` 개수로 세는 방식이라, 둘 다 없는 이 라우트를 **애초에 세지 않는다** | 그대로 두되 "빵크럼 중간 세그먼트 링크용 리다이렉트, 게이트 카운트 대상 아님" 주석 |
| L7 | LOW | `ApmCollectorRumTab.tsx:324` vs `:380` | 같은 `empty_origins_note`(= 수신 중지 경고)를 발급 폼은 `type="info"`, origin 편집 폼은 `type="warning"`으로 띄운다 | 같은 위험을 같은 화면에서 다른 색으로 말한다 | 둘 다 `warning`으로 통일 |
| L8 | LOW | `apmRumDisplay.ts:23` | `toLocaleString(undefined, …)` — 구분자가 실행 환경 로케일을 따른다 | i18n 언어 전환과 무관하게 브라우저 로케일로 갈린다. 다른 APM 숫자 표시 유틸과 어긋날 수 있다 | 기존 APM 포매터와 일관되게 로케일을 명시하거나 공용 유틸 재사용 |

---

## 규약 체크리스트

| 항목 | 판정 | 근거 |
|---|---|---|
| URL query state (useState 금지) | ✅ | `pageSearch`·`by`·`tokenId`·`timing` 전부 `useQueryParams`. 로컬 `useState`는 모달 열림/busy/발급원문 등 **데이터-결정이 아닌** 상태뿐. `ApmRumScreens.test`가 URL 왕복을 실제로 검증 |
| `ApmChartCard` helpKey 전수 | ✅ | 신규 카드 전부 `helpKey` 지정(타입이 필수). `apmHelpContent.test`의 위젯 목록 109→**120**, page_guide 24→**27**로 게이트 갱신 |
| `apm.chart_help` kr/en 대칭 | ✅ | `rum_{lcp,inp,cls,ttfb,pages,traffic,breakdown,timing,errors,p75,setup}` 11개 short·detail 양쪽 존재. `apmRumContract.test`가 `apm.rum`·`apm.help`·`apm.k8s` 키 집합 대칭까지 추가 검증. `apm.help.rum.*` 8개는 "무엇/기본값/언제/잘못 넣으면" **4줄 규약**을 테스트가 강제 |
| 차트↔표 전환 | ✅ | Vitals 4장·traffic·breakdown·timing이 `table` prop 제공. 전환 테스트 있음 |
| null을 0으로 그리지 않음 | ✅ | `apmRumNumber(0)="0"` / `(null)="—"`, `apmRumTrafficPoints`가 관측 공백에 `null` 점을 삽입, `apmRumShares`가 `mixedBounds`·`samples=0`에 `[null,null,null]`. 3건 전부 테스트가 잡는다(변이 실험으로 확인) |
| mixedBounds / rebucketed 배지 | ✅ | Vital 카드는 `ApmChartCard`의 공용 배지, 페이지 행은 `ApmRumNotice`. 문구는 기존 `apm.chart.*` 재사용(중복 문구 없음) |
| truncated 배지 | ✅ | 목록은 4개 응답을 OR로 묶어 표시, 상세는 `detail.truncated`. 계약 §7-9 요구 충족 |
| `useApmPermissions` view/edit 축 | ✅ | 조회 5훅 = `canView`, 토큰·스니펫 2훅 = `canEdit`(계약 §1 "RUM 관리(목록 포함)는 apm.edit"과 일치). 탭 컴포넌트가 `canEdit`이 아니면 `RumManagement` 자체를 **언마운트**해 발급 원문까지 폐기 — 테스트가 "권한 회수 후 도착한 발급 응답" 케이스로 검증 |
| `ApmQueryError` / `apmQueryLoading` | ✅ | 목록·토큰·상세·인스턴스에 배너. `enabled:false` 무한 스피너 회피: `ApmRumPageDetail.tsx:50`이 `canView && !!groupId &&`로 명시 방어, `ApmRumPage`는 `!canView` 조기 반환. `ApmServiceInstancesTab`의 `apmQueryLoading` 전환도 `serviceUid: string`(필수 prop)이라 안전 |
| DmoveTable loading prop | ✅ | `ApmRumTable`이 `loading`을 **필수 prop**으로 타입 강제 |
| 라우트 `permissionKey` | ✅ | 신규 상세가 `PageWrapper permissionKey` + `FeatureGate feature="APM"`. `apmRoutes`·`apmAdminGating` 카운트 17→18 동반 갱신 |
| SideNav / MobileSideNav `show: canViewApm` | ✅ | 양쪽 동일하게 `key:"rum"` + `canViewApm`. `apmRoutes.test`의 노출 목록도 6→7로 갱신 |
| `navSearchEntries` | ✅ | 기존 `apm-rum`(view 축) 유지 + 신규 `apm-rum-setup`(`?tab=rum`, **edit 축**). `apmAdminGating`이 edit 축 목록을 `["apm-alert-rules","apm-collectors","apm-rum-setup"]`로 고정 |
| page_guide 등록 | ✅ | `apm_rum`(exact) / `apm_rum_detail` / 수집기 `tabKeys.rum → apm_rum_setup` 3개. 자리표시 `apm_placeholder` 제거. 해석 순서(같은 path 길이 → 선언 순서 안정)까지 테스트가 검증 |
| breadcrumb 3단 경로 | ✅ | `replacePathBreadcrumb(..., index 4)` — `[홈, application-monitoring, rum, pages, groupId]`에서 4가 groupId로 정확. 중간 `pages` 세그먼트 라벨 override + `/rum/pages` 리다이렉트 라우트까지 갖춰 링크가 죽지 않는다 |
| locales 텍스트 삽입만 | ✅ | kr/en **각 189 삽입 / 0 삭제**(`git diff --numstat`), 삭제·수정 줄 0(`grep -c '^-[^-]'` = 0), 양쪽 파싱 OK·BOM 없음. 기존 비대칭 키(`discovery_management.*`·`bps_io` 등)는 선재분으로 이번 변경과 무관 |
| 언랩 깊이 | ✅ | 조회 = `API.get` 원본 반환(인터셉터 1겹 + `useDmoveQuery` 1겹), 쓰기 = `apmRum.api.ts:21`의 `unwrap`이 실패 envelope을 `ApiEnvelopeError`로 throw. 기존 `apm.api.ts` 주석 규약과 동일. `data.data` 과다 언랩 없음 |
| `typecheck:contract` | ✅ | 통과. `apmRumContractSample.ts`가 `include`에 실제로 걸리는 것을 확인(픽스처가 `: TApmRumPages` 등으로 타입 앵커됨 — [[fe-contract-fixture-gate]]의 허위 게이트 재발 아님) |
| 픽스처 = BE 표본 원본 | ✅ | BE 본 트리 `6af7c46`의 `rum-*.json` 9개 + `service-detail.json`과 **내용 동일**(`service-detail.json`은 바이트까지 동일, 나머지 9개는 CRLF↔LF만 차이 — L5). 파생·수정 없음 |
| Web Vitals 임계·good/needs/poor 분류 | ✅ | 상수(LCP 2500/4000 · INP 200/500 · CLS 0.1/0.25 · TTFB 800/1800 · FCP 1800/3000)가 계약 표와 일치. 경계 포함 규칙(`≤good`=good, `≤poor`=needs)도 일치하고 테스트가 5지표 × 6경계를 검증. **단 서버가 준 임계를 안 읽는 문제는 M1** |
| p75 null 규약 | ✅ | `mixedBounds`면 값 자체를 `null` 취급해 `—`, `exceedsTopBound`면 `≥ ` 접두. 실제 `0`은 `0 ms`로 표시(테스트 있음) |
| 토큰 원문 1회 노출 (캐시 우회) | ✅ | `createToken`은 mutation이 아닌 **직접 서비스 호출** → react-query 캐시 경유 없음. 테스트가 query cache·**mutation cache 길이 0**·localStorage 3곳을 실제 검사. 모달은 확인 체크 전 닫기 비활성, 닫으면 state 폐기. 목록·스니펫 응답에는 원문 없음(`tokenPlaceholder`만) |
| preflight/CORS 문구 | ✅ | `endpoint_hint`가 "tokenId는 URL, 원문은 Authorization 헤더"를 명시. `csp_note`가 "응답에는 MovesEye origin만, 실제 백엔드 origin은 직접 추가"(계약 R25)를 반영. origin 검증이 대소문자·`:443` 생략을 **정규화하지 않는다**는 계약을 코드 주석·테스트·도움말 3곳에서 지킨다 |
| 스니펫 endpoint·CSP·동의 훅 | ✅ | `installCommand`·`code`·`cspConnectSrc`·`propagateTraceHeaderCorsUrls`·`notices`·`references` 6필드 전부 렌더 + 복사 버튼. `consent_note`가 `consentGranted=false` 기본·철회 시 종료 함수를 안내. `ApmDocRefLinks` 재사용(`rel="noopener noreferrer"` 검증됨) |
| 트레이스 브라우저 스팬 | ⚠️ | 식별은 표시 이름이 아닌 **계약 속성** `attrs["rum.browser"]==="true"`로 정확(테스트 3케이스). `serviceUid=null` 허용. **색 우선순위만 M3** |
| 인스턴스 K8s 열·배지 | ✅ | 계약 필드명 정본 그대로(`k8sPod/k8sNode/k8sNamespace`, `containerRestartCount`, `restarted/oomKilled`, `restartedAt/oomKilledAt`). null은 `—`(0 아님), 최근/이력 구분 + 원 관측 시각 툴팁, 문구가 "실제 종료 시각이 아니다"·"5분 미만"(정확히 5분은 false)을 정확히 반영. **`k8sDeployment` 미표시만 L1** |
| 서비스 맵 BROWSER 노드 | ✅ | 계약 §3이 "추가하지 않았다"고 못박았고 FE도 만들지 않았다 — **미구현이 정답** |
| Collector `kubernetes` 옵션 | ✅ | 발급 Drawer·재생성 폼 양쪽에 체크박스 + 운영 역할 분리 notice(`config_notice`: DaemonSet 분리·단일 k8s_cluster·RBAC/CA/Downward API·TLS 검증 끄지 말 것). **끄면 키를 아예 안 싣는** 기존 `keepRawSql` 규약과 동일한 패턴 |

---

## 검증 실행 기록

| 검증 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npm run typecheck:contract` | 통과 |
| `npx eslint --max-warnings=0` (신규 11파일) | 0 error / 0 warning |
| `npx jest --silent --maxWorkers=2` 관련 9 스위트 | **248 / 248 통과** (코덱스 보고와 일치) |
| 전체 1회 | 아래 "전체 실행" 참조 |
| BE 표본 대조 | `moveseye-be-spring` master `6af7c46` 원본 10개와 내용 동일(CRLF 정규화 후 md5 일치) |
| locale insert-only | kr/en 각 189 삽입 · 0 삭제 · 재직렬화 흔적 없음 |

### 변이 실험(검출력) — 3건 3건 검출

| 변이 | 대상 | 결과 |
|---|---|---|
| B1 | `apmRumShares`에서 `vital.mixedBounds` 가드 제거 | ❌→검출 (`RUM Vitals와 null 규약 › 관측 수를 %로…`) |
| B2 | `apmRumTrafficPoints`의 관측 공백 `null` 삽입 제거 | ❌→검출 (`RUM 관측 공백 › 없는 버킷은 null로 끊고…`) |
| B3 | `useApmRum`의 `enabled: canView && …`에서 `canView` 제거(4훅) | ❌→검출 (`RUM 조회 화면 › 보기 권한이 없으면 조회를 시작하지 않는다`) |

원복은 사전 캡처 스냅샷 복사로 수행했고 3파일 모두 md5 일치 확인(`git checkout`·`stash`·`restore` 미사용).

**검출력 공백으로 확인된 것**: (a) H1/H2 정렬·ellipsis는 jsdom이 스타일·정렬 상호작용을 재현하지 않아 248개 테스트로 잡히지 않는다. (b) M3은 브라우저 스팬 표본이 UNSET·비크리티컬이라 색 우선순위를 강제하지 않는다.

---

## 코덱스 자진 신고 판정

| 신고 | 판정 |
|---|---|
| TTFB 열 미완료(계약 미제공) | **타당.** 계약 `PageRow`에 `ttfbP75Ms`가 없는 것이 사실이며 전체 페이지 TTFB를 행마다 복제하지 않은 판단이 옳다. 다만 영구 빈 열을 남긴 처리 방식은 M2로 별도 지적 |
| p75 추이 미완료(계약 미제공) | **타당.** `Detail.series`의 `Point`가 `ts/pv/sessions`뿐이라 그릴 수 없다. 창 전체 p75를 시계열로 복제하지 않았고, 그 사실을 `rum_p75` 도움말에 "전체 기간 p75를 시계열 점으로 복제하지 않습니다"로 명시한 것은 좋은 처리 |
| 계약 요청 3건을 정본 대신 메모에 기록 | **지시 준수로 타당**(worktree 밖 쓰기 금지). 검수자가 계약 §🔄에 옮겨 적었다 — 표본 보완 요청(F4)까지 4건으로 정리했고, 특히 `rum-snippet.json` 부재로 **스니펫 DTO 9필드가 계약 게이트에 전혀 안 걸린 유일한 조회 DTO**라는 점을 근거로 보강했다 |

---

## 병합 전 반드시 고칠 것 (코덱스 지시문)

> 아래 2건만 고치면 병합 가능하다. M1~M4·L1~L8은 후속 물결로 미뤄도 된다(단 M1·M3은 다음 물결에서 반드시 처리).

**1. `ApmRumTable`을 APM 표 규약으로 되돌린다 (H1 + H2)**

- 대상: `src/pages/application-monitoring/rum/components/ApmRumTable.tsx`
- `useTableColumns` 사용을 제거한다. 이 훅은 Zabbix 목록 화면용이라 **모든 열에** `sorter: stringSorter(dataIndex)`와 `ellipsis: true`를 자동으로 붙인다. APM의 다른 표 15여 개는 전부 `t()`를 직접 적용한 columns를 `DmoveTable`에 바로 넘긴다 — RUM만 예외다.
- 호출부 4곳(`ApmRumPage`의 페이지 그룹 표, `ApmRumPageDetail`의 리소스 표·오류 표, `ApmCollectorRumTab`의 토큰 표)의 `title`을 i18n **키 문자열**에서 `t(...)` 호출로 바꾸고, `key`만 있고 `dataIndex`가 없는 열에는 `dataIndex`를 명시한다.
- 정렬이 필요한 숫자 열(`pv`·`sessions`·`jsErrorCount`·p75 3종·`count`·`startMs`·`durationMs`·`bytes`)에는 숫자 비교 `sorter`를 직접 단다. null은 항상 끝으로 보낸다. 렌더 전용 열(`ttfb`·`k8sRestarts`·`actions`)에는 `sorter`를 달지 않는다.
- 토큰 표 `allowedOrigins` 열과 페이지 그룹 표 `path` 열은 다행 콘텐츠이므로 `ellipsis`를 켜지 않는다.
- 회귀 테스트 2개를 추가한다: (a) 페이지 그룹 표에서 PV 오름차순 정렬 시 `9`가 `1000`보다 앞에 온다, (b) 토큰 표의 origin 셀에 origin 2개가 모두 보인다.
- 수정 후 브라우저에서 RUM 목록·수집기 RUM 탭 2화면을 한 번 열어 셀 잘림을 확인한다(jsdom으로는 안 잡힌다).

**2. 브라우저 스팬 색이 ERROR·크리티컬 패스를 덮지 않게 한다 (M3)**

- 대상: `src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx` `barColor`
- `apmIsBrowserSpan` 분기를 `status === "ERROR"`·`criticalIds.has(...)` **뒤로** 내린다. 브라우저 출처는 이미 이름 옆 "브라우저" 라벨과 `data-browser` 속성으로 구분되므로 색을 뺏을 필요가 없다.
- `apmWaterfall.ts:149-156`의 불변식 주석("강조된 스팬 == criticalPath == Σself == criticalPathMs")이 시각적으로 유지되는지 확인한다.
- 회귀 테스트를 추가한다: `status:"ERROR"`이고 `attrs["rum.browser"]="true"`인 스팬의 막대가 `HEALTH.critical`이다 / 크리티컬 패스에 오른 브라우저 스팬이 `CHART_SERIES[1]`이다.
