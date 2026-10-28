# 검수 요청 — ZM-152 화면 자기설명 BE 계약 연동(FE)

- 요청: Claude · 2026-09-28
- 검수 대상: FE `moveseyee_fe` 워크트리 **`C:\worktrees\zm-152-fe`**(브랜치 `ZM-152-fe`, master `105c8bf` 기준) — **미커밋 변경**(`git -C C:\worktrees\zm-152-fe diff` + 신규 2파일)
- 🔴 BE 무수정. BE 변경은 `C:\worktrees\zm-152-be`(별도 검수 [`review_zm-152-be-self-explain.md`](%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-152-%ED%99%94%EB%A9%B4-%EC%9E%90%EA%B8%B0%EC%84%A4%EB%AA%85-BE-%EC%9A%94%EC%B2%AD-8%EA%B1%B4.md)) — :3000 미반영
- 계약: `_workspace/contract_zm-152-self-explain-be.md`(코덱스 v1 R1~R4 반영본) · 작업 보고: `_workspace/reports/zm-152_fe-contract-integration.md` · 선행 FE: `reports/zm-152_screen-self-explaining.md` §5

## 범위

| 층 | 변경 |
|---|---|
| 계약 타입 | `src/types/apm.ts` — 새 필드 전부 **옵셔널**(구 BE 호환). 신규 `TApmServiceDrops*`·`TApmRetentionSettings`(+ `*VisibleDays` 옵셔널)·`APM_RUNTIME_ABSENT_REASON`·`APM_SLO_UNKNOWN_REASON` |
| API·훅 | `apm.api.ts` `getServiceDrops`·`getRetentionSettings` · `useApm.ts` `useApmRetentionSettings`(staleTime 10분, 포커스 재조회 끔)·`useApmServiceDrops`(1분) · 쿼리 키 2 · staleTime 상수 2 |
| 보존 공급 | 🆕 `shared/ApmRetentionContext.tsx` — Provider가 APM 라우트 루트(`routes.tsx:528~536`)에서 **한 번** 조회(`apm.view` + APM 라이선스일 때만), 컨텍스트 기본값 = 상수 폴백 |
| 순수 판정 | `shared/apmRetention.ts` — `apmRetentionDaysFrom`(`:105`, `*VisibleDays` → 없으면 min(버킷, 본체)) · scope 3종 추가 · `apmRetentionState`에 `oldestAvailableMs`(`:332`)·`metricsAvailable`(`:339`)·`days` · `apmResolvedStep`은 **승격 상수** / `shared/apmEmptyReason.ts` — 이유 3종(`no_ingest`·`not_ingestible`·`not_received`), 합계·시계열 판정에 `requests`·`received`·`activeRequestsLastSeenMs`, `apmRuntimeSlotEmptyReason`(`:169`) / `slo/apmSloDisplay.ts` `apmSloSliReason`(`:338`) |
| 공용 부품 | `ApmEmptyReason.tsx` — 경로표(`:24`, `collector_status` 추가) · `supplement` 슬롯(부품은 조회 안 함) / `ApmRetentionNotice.tsx` — `oldestAvailableMs` prop, 서버 일수로 보존표 치환, mismatch 한 줄(`:85`) / 🆕 `ApmServiceDropsLine.tsx` |
| 화면 | 런타임 탭(`MissingSlotReason` `:88`) · 서비스 개요 registry(`:151`·`:202`·`:214`) · 인스턴스 탭(`:88`)·small multiple · 서비스 목록(`:152`) · 개요(`:144`) · SLO(`:209`, 툴팁 합침) · 트레이스/예외/DB/외부 호출/서비스 맵 배너 |
| i18n | kr/en **맨 위 `apm` 블록에 삽입**(재직렬화 없음) — 기존 줄 변경은 `retention.table` 1줄(일수 치환형) |
| 테스트·픽스처 | 10 스위트 수정 + 픽스처 5 — BE 워크트리 최신 표본 JSON에 맞춤 |

## 의도 (선택한 설계 · 버린 대안)
- **보존 일수를 컨텍스트로 공급**: 판정 함수는 순수하게 두고 `days`를 인자로 받는다. 버린 대안 ① 공용 부품(`ApmRetentionNotice`·`ApmChartCard`) 안에서 훅 직접 호출 — 이 부품을 렌더하는 테스트 수십 개가 `@/hooks/useApm`을 부분 mock하고 QueryClient가 없어 전부 깨진다 ② 모듈 전역 변수 — 계정 전환·테스트 격리가 안 된다. 컨텍스트 기본값이 상수라 Provider 밖(홈 위젯·테스트)에서도 종전과 같다.
- **`ApmEmptyReason`은 조회하지 않는다**(`supplement` 슬롯): 처음엔 `serviceUid` prop으로 부품 안에서 폐기 요약을 불렀는데, 부품 import만으로 `axiosInstance`(`import.meta.env`)가 끌려와 이 부품을 쓰는 스위트가 로딩 단계에서 깨졌다(`ApmSelfExplain` 실측). 조회 부품(`ApmServiceDropsLine`)을 호출처가 넣게 바꿨다.
- **`undefined` ≠ `null`**: 구 BE(키 없음)는 종전 판정, 신 BE의 `null`은 답으로 쓴다. 섞으면 구 BE에서 모든 서비스가 "옵션 필요"가 된다.
- **승격 = 상수, 안내 = 유효값**: `apmResolvedStep`·인스턴스 축은 `promotionDays`(BE `ApmResolution`과 같은 자), "보존 밖" 안내는 표별 유효 일수. 예외·DB는 `*VisibleDays`(R2·R3). 둘이 다르면 `mismatch` 한 줄.
- **서버 경계에도 1시간 여유**: FE 창 시작은 서버 "지금"보다 요청 지연만큼 앞선다 — 여유 없이는 트레이스 7일 프리셋 같은 창마다 헛경고. 버린 대안: 서버 `nowMs`로 FE 창을 보정 — 툴바 창 자체를 바꾸는 일이라 범위 밖.
- **SLO 툴팁 합침**: 칸의 이유를 공용 팝오버 대신 평문 라벨로 적고 설명은 기존 측정 툴팁에 넣었다(선행 §6-5 두 개 동시 표시 해소). data-reason은 서버 코드(`NO_REQUESTS` 등).
- **폐기 요약은 서비스 단위**: 슬롯→메트릭 이름 표(BE `RuntimeSlotMap`)를 FE에 복제하지 않았다(또 하나의 사본). 계약서 FE 요청 R-FE2(선택).
- **`NOT_RECEIVED` → 설치 가이드만**(지시문 기준). 계약 §1 본문은 "설치 가이드 + 폐기 사유"라 적는다 — 허용목록 안 슬롯은 허용목록 폐기가 없어서 지시문을 따랐다. 판단 필요 시 `ACTIONS` 한 줄.

## 중점 확인 요청
1. 새 필드 전부 옵셔널이고, **키 없음 경로가 선행 작업의 판정과 한 글자도 다르지 않은가**(구 BE 회귀 0). 특히 `apmTotalsEmptyReason`의 `requests` 미지정 시 `rps` 기준 유지.
2. `activeRequestsLastSeenMs`를 **서비스 RED 응답에서만** 넘기는가(엔드포인트·인스턴스 시계열의 `null`이 "옵션 필요"로 새지 않는가) — `registry.tsx:151`, `ApmInstanceSeriesCard`는 넘기지 않음.
3. `apmRetentionState`의 경계 우선순위: 인스턴스 `metricsAvailable`(boolean) > `oldestAvailableMs`(숫자) > 일수 계산. `whole` 규칙(`to <= 경계`)과 여유(1시간, 인스턴스 없음)가 계약 §4·§8과 맞는가.
4. `apmRetentionDaysFrom`: 필드별 폴백·`*VisibleDays` 없을 때 min 규칙·`mismatchSteps` 추출. 🔴 0 이하 분기를 제거한 것(BE 정규화 전제, R1)이 적절한가.
5. Provider 조회 조건(`canView && allowsFeature("APM")`)·라우트 위치(APM 루트 레이아웃 바깥쪽)가 권한/라이선스 없는 사용자에게 요청을 내지 않는가. 라이선스 상태 로딩 중(`allowsFeature`가 잠정 true일 수 있음)에 한 번 나가는 것은 허용 범위인가.
6. 폐기 요약 줄: inline 팝오버에서 **열 때만** 조회되는가(AntD Popover 지연 마운트 전제) · 실패·로딩 시 줄만 빠지는가 · "관리 권한자에게 요청"이 링크 자리에만 남았는가.
7. SLO: 서버 코드를 요청 수로 덮어쓰지 않는가(R4 `OUT_OF_RETENTION` + 요청 0건) · 모르는 코드 → `UNKNOWN` 라벨 · `null` → `—`. SLO 상세의 측정 구간 표시(`ApmSloDetailPage.tsx:364`)는 `measuredFromMs`를 그대로 쓴다(R4로 당겨진 값이 그대로 보인다) — 확인만.
8. 픽스처가 BE 표본과 맞는가: `runtime.json`(JVM `absentSlots`, FE 파생 슬롯과 겹침 제거 + 공통 프로세스 2) · `service-detail.json`(`activeRequestsLastSeenMs:null` 모순 그대로 + 주석, R-FE1) · `deployment-new-errors.json` `oldestAvailableMs:null` · 트레이스/맵/SLO 값.
9. 로케일 kr/en 키 대칭 · 고객 문구에 검수번호·§·HTML 태그 없음 · `{{count}}` 대신 `{{total}}`(i18next 복수형 예약어 회피).
10. 기존 테스트 기대값을 바꾼 곳이 "신 BE 픽스처 때문에 구 BE 경로를 명시적으로 만든 것"인지(의미 변경 없음): 인스턴스 탭 계산 판정 스위트는 `LEGACY_ROWS`, 개요·목록·상세의 "요청 0건" 케이스는 `requests:0`을 명시, SLO data-reason은 서버 코드로.

## 검증 (Claude, 2026-09-28)
- `tsc --noEmit` 0 · `typecheck:contract` 0 · eslint(바꾼 `.ts/.tsx` 40개) 0
- jest `-w 2` **25 스위트 571/573** — 실패 2는 `apmHelpContent.test.ts`의 **master 기존 실패**(`alert_stuck_table` helpKey가 테스트 `WIDGET_KEYS`에 없음, ZM-122 `7db36a2`, 두 파일 모두 미수정). 이번 대상 스위트 전부 통과. 고아 워커 0
- ❌ **브라우저 실측 미실시**(:3000에 BE 변경 없음, :5173은 master 본체)

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정"으로 표시.
- 마지막에 중점 확인 1~10 각각 판정(충족/불충족/추정) 한 줄씩과 종합 판정(승인 / 수정 후 재검수).

## 검수 결과 요약
(코덱스 검수 후 기입)

---

## 검수 결과(코덱스 v1)

- 결과 원문: [`review_zm-152-fe-contract-integration_codex.md`](%EA%B2%80%EC%88%98-ZM-152-FE-%EA%B3%84%EC%95%BD-%EC%97%B0%EB%8F%99-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 판정 **수정 후 재검수**(필수 R1·R3·R4·R6·R7 · 권장 R2·R5·R8·R9·R10)
- 반영: 2026-09-28 Claude, 같은 워크트리 `C:\worktrees\zm-152-fe` · **미커밋**(위치는 파일:줄) · **10건 전부 반영**(R1은 억제 규칙 하나를 남겼다 — 아래 설명)
- 누적 대상 **44개 파일**(수정 41 · 신규 3). 이번 반영에서 추가: `src/pages/application-monitoring/services/runtimeSlots.ts`(수정)·`src/__tests__/apmSelfExplainHooks.test.tsx`(신규)

| 번호 | 심각도 | 요지 | 상태 · 반영 위치 |
|---|---|---|---|
| R1 | 필수 | 신 BE `absentSlots`가 카드 표시를 정하지 않음 | [x] **계약보다 보수적 — 숨기는 방향만, 근거: JVM 표본이 프로세스·풀 슬롯을 미수신으로 실음.** `services/runtimeSlots.ts:191` `apmRuntimeCardStateFromServer` → `ApmServiceRuntimeTab.tsx:301`. `absentSlots === undefined`만 종전 `expected` 계산, `{}`는 "부재 없음"(결함 카드 0, 빈 상태 하나), 키가 있으면 사유 카드, 부재 맵에 없고 값도 없으면 표시 안 함(dotnet CPU 카드 사라짐), `family:"unknown"`은 서버 맵 그대로(공통 프로세스 2장 선다). ⚠️ **억제 둘은 남겼다**(`:202`): ① `expected: []`(커넥션 풀) ② 알려진 런타임에서 `expected`에 없는 카드. 근거: BE 표본 `runtime.json`이 **JVM에도** `processCpuPct`·`processMemoryBytes`·`pool*`를 `NOT_RECEIVED`로 싣는다 — 억제가 없으면 모든 JVM 서비스에 "프로세스 CPU/메모리 미수신"(같은 질문에 `cpuUtilizationPct`·heap이 답한다)과 "풀 미수신"(DB 안 쓰는 서비스가 정상) 결함 카드가 선다. 억제는 서버가 부재라고 한 것을 **숨기는 방향으로만** 작동하고, 서버가 기대하지 않은 카드를 세우는 일은 없다. 판단이 다르면 `:202` 한 줄 |
| R2 | 권장 | `NOT_RECEIVED`에 폐기 사유 경로 누락 | [x] `ApmEmptyReason.tsx:33` `["install_guide","drops"]`(계약 §1 순서), 런타임 카드 `ApmServiceRuntimeTab.tsx:116` — 미수신에도 `ApmServiceDropsLine` |
| R3 | 필수 | 서버 경계에도 1시간 여유를 뺌 | [x] `apmRetention.ts` `APM_RETENTION_SERVER_GRACE_MS`·`apmRetentionState` 서버 경계 분기 — **R3 여유 5분 — 결정 2026-09-28**: 서버 경계 C가 있으면 `whole`은 `to <= C`(여유 없음), `partial`은 `from < C − 5분`(프리셋 정렬 오차 흡수, 코덱스 사례 `from=C−30분, to=C`는 whole 유지). 1시간 여유는 브라우저 시계 폴백 경계에만. 테스트 `C−5분−1ms`(partial)·`C−4분`(null)·`C−4분~C`(whole) |
| R4 | 필수 | 보존 배너가 "데이터 없음" 단정 | [x] `kr.json:162~163`·`en.json` 같은 줄 — `whole`·`partial`을 "보존이 보장되지 않아 일부 또는 전부가 없을 수 있습니다(수집이 멈춘 것이 아님)"로 |
| R5 | 권장 | mismatch 안내가 다른 상태가 있을 때만 뜸 | [x] `apmRetention.ts:395` 새 상태 `gap`(답한 해상도 단의 유효 보존 < 승격 기준이고 창이 그 유효 경계 앞에서 시작) — expired·promoted 없이도 상태가 선다. 지표는 요청 step이 있을 때(응답 step 우선), 인스턴스는 1분 단. 표시 `ApmRetentionNotice.tsx:106`(kind `gap`, 문구 `apm.retention.gap`·`badge_gap`), gap이 있으면 mismatch 한 줄은 중복이라 생략(`:86`). 우선순위 보존 밖 > gap > 승격 |
| R6 | 필수 | 서버 `nowMs`를 버림 | [x] `apmRetention.ts:77` `clockOffsetMs`(서버 − 브라우저) · `:98` `apmRetentionNow` · `:165` `apmRetentionDaysFrom(settings, receivedAtMs)` · `ApmRetentionContext.tsx:31` 수신 시각 = react-query `dataUpdatedAt`. `apmRetentionState`·`apmResolvedStep`은 `nowMs` 미지정 시 `Date.now()+offset`. 응답 없음·실패·권한 없음은 0(로컬) |
| R7 | 필수 | SLO `OUT_OF_RETENTION` 문구 단정 | [x] `kr.json:141~144`·en — "SLO 기간의 일부 또는 전부가 지표 보존 범위 밖이라 전체 SLO 기간을 판단할 수 없습니다" |
| R8 | 권장 | `signal`·`source`가 string | [x] `types/apm.ts:1375` `signal: "METRIC"` · `:1401` `source: "PROCESS_MEMORY"`(BE `ApmServiceDropSummaryDto` `SOURCE_MEMORY`·계약 §5 허용값 확인). 픽스처 그대로 `typecheck:contract` 통과 |
| R9 | 권장 | 테스트가 잘못된 여유를 고정 | [x] `apmRetention.test.ts:342~` 서버 경계 `C-1ms/C/C+1ms`·`to=C`/`to=C+1ms`·폴백 여유 분리, R6 오프셋 2건, R5 gap 4건(`:429~`) · 런타임 `ApmServiceRuntimeTab.test.tsx:303~` `undefined`/`{}`/키 존재/unknown/JVM 억제/풀/non_heap 분리 |
| R10 | 권장 | 훅이 전부 mock | [x] 🆕 `src/__tests__/apmSelfExplainHooks.test.tsx` 10건 — axios 인스턴스만 대역, **진짜 `useDmoveQuery`**: 직접 payload(2겹 언랩), 쿼리 키·공유(한 번만 호출), staleTime 10분/1분, `refetchOnWindowFocus:false`, `enabled:false`·uid 없음, Provider의 권한/라이선스별 enabled·실패 폴백·Provider 둘 = 요청 하나·오프셋 |

검증(반영 후): `tsc` 0 · `typecheck:contract` 0 · eslint(바꾼 `.ts/.tsx` 42개) 0 · jest `-w 2` **26 스위트 596/598** — 실패 2는 종전과 같은 `apmHelpContent.test.ts` master 기존 실패(`alert_stuck_table`) · 고아 워커 0 · ❌ 브라우저·런타임 미실시

재검수 요청 중점
1. R1 억제 규칙(`runtimeSlots.ts:202`)이 계약 의도(서버 맵 정본)와 충돌하지 않는가 — 숨기는 방향만인지, `unknown`은 서버 그대로인지.
2. R3: 서버 경계 `partial` 여유 5분(결정 2026-09-28)이 프리셋 정렬 오차(초 단위)를 흡수하면서 `whole`(`to <= C`, 여유 없음)을 놓치지 않는가.
3. R5 gap이 RED·런타임 차트 배지에 새로 뜨는 조건이 운영 설정 변경 설치본에만 한정되는가(기본 설정에서는 `effective == promotion`이라 절대 안 뜬다 — 테스트 고정).
4. R6 수신 시각을 `dataUpdatedAt`으로 본 것 — BE 60초 캐시가 `nowMs`까지 캐시한다면 오프셋이 최대 1분 틀린다(보존 안내 정밀도에는 무의미).

---

## 검수 결과(코덱스 v2)

- 결과 원문: [`review_zm-152-fe-contract-integration-v2_codex.md`](%EA%B2%80%EC%88%98-ZM-152-FE-%EA%B3%84%EC%95%BD-%EC%97%B0%EB%8F%99-v2-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · R3 5분 여유 **타당** · R1 억제 규칙 **부당(일반화 과다)** → 명시 목록으로 좁힘
- 반영: 2026-09-28 Claude, 같은 워크트리 · **미커밋** · 남은 3건(R1 부분·N1·N2) 전부 반영. R4·R5의 "부분"은 N1·N2가 그 잔여다

| 번호 | 코덱스 v2 판정 | 상태 · 반영 위치 |
|---|---|---|
| R1 | 부분 | [x] 억제를 **명시 목록**으로 좁힘 — `services/runtimeSlots.ts:214` `APM_RUNTIME_SUPPRESSED_ABSENT`(① 커넥션 풀 `poolActive`·`poolWaitP95Ms` — 모든 런타임 ② JVM `processCpuPct`·`processMemoryBytes` ③ JVM 밖 `memoryUsed`의 non_heap 카드 — JVM 어휘), 판정 `:201`. 그 외는 서버 `absentSlots` 정본대로 선다(Python memoryUsed→heap 카드·cpu, .NET classCount 표시). ③은 코덱스 목록 밖 추가다: 일반화 규칙을 없애면 .NET/Python의 `memoryUsed` 부재에 heap과 non_heap 두 장이 서는데 non_heap은 그 런타임에 없는 차원이다(heap 카드 하나로 부재를 말한다). **계약보다 보수적 — 숨기는 방향만, 근거: JVM 표본이 프로세스·풀 슬롯을 미수신으로 실음** |
| R2 | 닫힘 | [x] |
| R3 | 닫힘(5분 여유 타당) | [x] |
| R4 | 부분 → N1 | [x] N1로 완료 |
| R5 | 부분 → N2 | [x] N2로 완료 |
| R6~R10 | 닫힘 | [x] |
| N1 | 필수 | [x] `kr.json:107`·`en.json:107` `apm.empty_reason.retention.body` — "보존이 보장되지 않아 일부 또는 전부가 없을 수 있습니다. 수집이 멈춘 것이 아닙니다"(배너와 같은 원칙) |
| N2 | 권장 | [x] `ApmServiceInstancesTab.tsx:103` `hasRetentionGap`(expired와 분리) → 빈 숫자 칸 배지 + `:287` `ApmRetentionNotice state={retention}` 배너(`apm-instances-retention-gap`). 창 전체 밖 안내(`window_limit`)는 종전 그대로 expired만 |

추가 테스트: 런타임 `ApmServiceRuntimeTab.test.tsx` — Python `memoryUsed`·`cpuUtilizationPct` NOT_INGESTIBLE → heap·cpu 카드 표시 / .NET `classCount` 표시 / (기존) JVM 프로세스 슬롯 숨김·풀 숨김·non_heap 숨김 · 인스턴스 `ApmServiceInstancesTab.test.tsx` — 1분 유효 3일·승격 7일 설정의 5일 창에서 gap 배너 + 빈 칸 배지 3, 창 전체 밖 안내 없음

---

## 검수 결과(코덱스 v3)

- 결과 원문: [`review_zm-152-fe-contract-integration-v3_codex.md`](%EA%B2%80%EC%88%98-ZM-152-FE-%EA%B3%84%EC%95%BD-%EC%97%B0%EB%8F%99-v3-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · N1·N2 닫힘 · 새 결함 0 · R1만 부분(비-JVM non_heap 억제가 허용 목록 밖)
- 반영: 2026-09-28 Claude, 같은 워크트리 · **미커밋**

| 번호 | 코덱스 v3 판정 | 상태 · 반영 위치 |
|---|---|---|
| R1 | 부분 | [x] 코덱스 권고대로 **억제가 아니라 카드 정의 범위**로 옮김 — 카드 타입에 `families?`(정의되는 런타임) 추가, non_heap 카드 `families: [JVM]`(`services/runtimeSlots.ts:90`), 서버 판정에서 범위 밖이면 skip(`:209`, 값이 오면 종전대로 그린다). 억제 목록 `APM_RUNTIME_SUPPRESSED_ABSENT`(`:220`)은 **허용된 두 종류만**: 커넥션 풀(`poolActive`·`poolWaitP95Ms`, 모든 런타임) · JVM 공통 프로세스(`processCpuPct`·`processMemoryBytes`). 테스트: 비-JVM `memoryUsed` 부재 → 메모리 카드 1장(heap)만 · JVM `memoryUsed` 부재 → heap·non_heap 두 장 유지 · 억제 목록이 정확히 네 슬롯(두 종류)인지 고정 |
| N1 | 닫힘 | [x] |
| N2 | 닫힘 | [x] |

검증: `tsc` 0 · `typecheck:contract` 0 · eslint(바꾼 3파일) 0 · jest `-w 2` 런타임 탭(대응표 포함)·서비스 상세·위젯 카탈로그 **3 스위트 80/80**

## 검수 결과(코덱스 v4) — 2026-09-28

- 대상: v3 잔여 R1(비-JVM non_heap 억제). 원문 `review_zm-152-fe-contract-integration-v4_codex.md`.
- R1 닫힘 — 억제 예외는 커넥션 풀 + JVM processCpuPct·processMemoryBytes만, `non_heap`은 `families:[JVM]` 카드 범위로 이동, 비-JVM 값 존재 렌더 유지. 새 결함 0.
- **판정: 승인.** 커밋은 사용자 승인 대기. 브라우저 실측 미실시(BE :3000에 152 코드 없음).
