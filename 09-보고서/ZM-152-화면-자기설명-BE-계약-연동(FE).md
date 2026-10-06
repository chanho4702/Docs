# ZM-152 화면 자기설명 — BE 계약 연동(FE)

> 작성 2026-09-28 · FE `moveseyee_fe` 워크트리 **`C:\worktrees\zm-152-fe`**(브랜치 `ZM-152-fe`, master `105c8bf` 기준) · 🔴 **미커밋**(승인 대기)
> 계약 정본: [`../contract_zm-152-self-explain-be.md`](../06-API-%EA%B3%84%EC%95%BD/%EA%B3%84%EC%95%BD-ZM-152-%ED%99%94%EB%A9%B4-%EC%9E%90%EA%B8%B0%EC%84%A4%EB%AA%85-BE-%EC%9A%94%EC%B2%AD-8%EA%B1%B4-%28%EB%B9%88-%EA%B0%92-%EC%9D%B4%EC%9C%A0-%EB%B3%B4%EC%A1%B4-%EA%B2%BD%EA%B3%84-%ED%8F%90%EA%B8%B0-%EC%84%9C%EB%B9%84%EC%8A%A4-%EC%B6%95%29.md)(코덱스 v1 R1~R4 반영본까지 소비) · FE 선행: [`zm-152_screen-self-explaining.md`](ZM-152-%ED%99%94%EB%A9%B4%EC%9D%B4-%EC%8A%A4%EC%8A%A4%EB%A1%9C-%EC%84%A4%EB%AA%85%ED%95%98%EA%B2%8C-%EB%B9%88-%EA%B0%92-%EC%9D%B4%EC%9C%A0-%EB%B3%B4%EC%A1%B4-%EC%95%88%EB%82%B4-%EC%A7%80%ED%91%9C-%EB%9C%BB.md) §5 · BE 보고: [`zm-152_be-self-explain.md`](ZM-152-%ED%99%94%EB%A9%B4-%EC%9E%90%EA%B8%B0%EC%84%A4%EB%AA%85-BE-%EC%9A%94%EC%B2%AD-8%EA%B1%B4-%EA%B5%AC%ED%98%84-%EB%B3%B4%EA%B3%A0.md)
> 검수 인계: [`../reviews/review_zm-152-fe-contract-integration.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-152-%ED%99%94%EB%A9%B4-%EC%9E%90%EA%B8%B0%EC%84%A4%EB%AA%85-BE-%EA%B3%84%EC%95%BD-%EC%97%B0%EB%8F%99%28FE%29.md)
> BE는 `C:\worktrees\zm-152-be` 미커밋 · :3000 미반영 → **브라우저 실측 미실시**

## 0. 한 줄 요약

선행 작업(§5)에서 FE가 추정으로 하던 8곳을 서버 값으로 바꿨다. 새 필드는 전부 **옵셔널**이고 판정 함수는 "서버값 우선 → 없으면 종전 계산"이다. `undefined`(구 BE)와 `null`(신 BE가 "없다"고 답함)을 따로 다룬다. 유효 보존 일수는 APM 라우트 루트의 Provider가 **한 번** 읽고, 기본값이 상수 폴백이라 Provider 밖·응답 전·실패에서도 화면이 그대로 선다.

## 1. 항목별 전(FE 추정) → 후(서버값)

| # | 자리 | 전(FE 추정) | 후(서버값) | 폴백(필드 없음 = 구 BE) |
|---|---|---|---|---|
| 1 | 런타임 '계측 미제공' 카드 | 두 갈래를 못 가름 → 설치 가이드 + 폐기 사유 두 경로 | `absentSlots[slot]`: `NOT_INGESTIBLE` → "아직 수집 대상이 아닌 지표" + **폐기 사유(수집기 상태)만** + "이 서비스의 폐기 n건" 한 줄 / `NOT_RECEIVED` → "수신되지 않은 지표" + **설치 가이드만** | `absentSlots` 없음·그 슬롯 키 없음 → 종전 `not_instrumented`(두 경로) |
| 2 | 액티브 요청(서비스 합계·차트) | 요청이 있을 때만 "옵션 필요", 0건 창은 "요청 없음" | `activeRequestsLastSeenMs === null` → 요청 0건 창에서도 **"에이전트 옵션 필요"** / 값 있음 + 요청 0 → "요청 없음" / 값 있음 + 요청 > 0 → "데이터 없음"(이 창만 끊김) | 키 없음 → 종전 판정. 🔴 엔드포인트·인스턴스 시계열은 늘 `null`이라 **서비스 RED 응답의 값만** 넘긴다 |
| 3 | 보존 안내 전부(배지·배너·툴팁 보존표) | `apmRetention.ts` 상수 | `GET /apm/settings/retention` → `TApmRetentionDays`(Provider, staleTime 10분·포커스 재조회 끔). 승격 예측·인스턴스 축 = `promotionDays`, "데이터가 남아 있나" = 표별 유효 일수. 예외·DB = **`*VisibleDays`**(min(버킷, 본체)). `resolutions[].mismatch` → 지표·인스턴스 안내에 "운영 보존 설정이 차트 해상도를 바꾸는 기준보다 짧습니다" 한 줄 | 응답 전·실패·권한/라이선스 없음 → 상수. 필드 하나가 없으면 **그 필드만** 상수. `*VisibleDays` 없으면 같은 규칙 min(버킷, 본체) |
| 4 | 트레이스(3곳)·예외·DB·외부 호출·서비스 맵 배너 | 창 시작과 상수로 계산 | 응답 `oldestAvailableMs`가 경계: `from < 경계 − 1시간` → 일부 밖, `to <= 경계` → 전체 밖. 트레이스는 목록 → 산점도 순(표를 숨긴 자리는 목록을 안 부른다) | `null`(그 EP는 계산 안 함)·키 없음·응답 전 → 일수 계산 |
| 5 | 런타임 `NOT_INGESTIBLE` 카드 · 서비스 개요 합계 4장 이유 팝오버 | 수집기 상태 링크(권한 없으면 "관리 권한자에게 요청") | "이 서비스의 폐기 {n}건(서버 기동 {시각} 이후) — 주요 사유: {상위 2개}" 한 줄 + ⓘ 툴팁(재기동 시 0부터·서버 한 대·서비스가 정해진 메트릭 폐기만·상한 초과/행 잘림). **`apm.view` EP라 권한 분기 없음** — "관리 권한자에게 요청"은 수집기 링크 자리에만 남았다 | 조회 실패·로딩 → 그 줄만 안 그린다(이유 문구는 그대로) |
| 6 | 서비스 목록 3칸 · 서비스 합계 4장 · 서비스 차트 · 개요 StatCard 4장 | `rps == null`이면 모두 "요청 없음" | `received === false` → **"수신 없음"**(새 이유 `no_ingest`, 경로 = 수집기 상태) / `received && requests == 0` → "요청 없음" / `requests > 0`인데 값만 없음 → "데이터 없음"(요청 없음이라고 적지 않음) | 키 없음 → 종전 "요청 없음" |
| 7 | SLO 목록 SLI 칸 | `requests == 0`일 때만 "요청 없음"(공용 팝오버 + 측정 툴팁 **이중**) | `unknownReason` 3종 → "요청 없음"·"측정 불가"·"보존 기간 밖", 모르는 코드 → "판정 불가". 🔴 이유 설명을 **SLI 칸 툴팁 하나**에 측정 건수와 합쳤다(§6-5 겹침 해소). 서버 코드를 요청 수로 덮어쓰지 않는다(R4: 잘린 창의 0건 = `OUT_OF_RETENTION`) | 키 없음 → 요청 0건만 "요청 없음", 나머지 `—` · `null` → `—`(요청 수로 추측 안 함) |
| 8 | 인스턴스 탭 배너·빈 칸 배지·small multiple | `apmRetentionState(instance)`로 창 시작 흉내 | `rows[0].metricsAvailable`(boolean)이 판정 그 자체 — false면 최근 창이어도 안내, true면 오래된 창이어도 조용 | 행 없음·키 없음 → 종전 계산 |

## 2. 바꾼 파일

### 신규 2
| 파일 | 내용 |
|---|---|
| `src/pages/application-monitoring/shared/ApmRetentionContext.tsx` | `ApmRetentionProvider`(조회 1회, `apm.view` + APM 라이선스일 때만) · `useApmRetentionDays()`(컨텍스트, 기본값 = 상수 폴백) |
| `src/pages/application-monitoring/shared/components/ApmServiceDropsLine.tsx` | 서비스별 폐기 요약 한 줄 + 한계 툴팁 · `apmTopDropReasons`(사유 합산 상위 n) |

### 수정 — 앱 23
| 파일 | 내용 |
|---|---|
| `src/types/apm.ts` | 옵셔널 추가: 서비스 행 `requests`·`received` / 상세 `activeRequestsLastSeenMs` / 인스턴스 `metricsAvailable` / RED `activeRequestsObserved`·`activeRequestsLastSeenMs` / 런타임 `absentSlots`(+ `APM_RUNTIME_ABSENT_REASON`) / 개요 totals `requests`·`received` / 트레이스 목록·산점도·예외·DB·외부 의존·집계 시계열·서비스 맵 `oldestAvailableMs` / SLO `unknownReason`(+ `APM_SLO_UNKNOWN_REASON`). 신규 타입 `TApmServiceDrops*`·`TApmRetentionSettings`(`*VisibleDays` 옵셔널)·`TApmRetentionResolution` |
| `src/services/apm.api.ts` | `getServiceDrops`·`getRetentionSettings`(axiosInstance 경유) |
| `src/hooks/useApm.ts` | `useApmRetentionSettings`(staleTime 10분) · `useApmServiceDrops`(staleTime 1분) |
| `src/constants/apm.ts` · `src/constants/queryKey.ts` | staleTime 상수 2 · 쿼리 키 2 |
| `src/routes/routes.tsx` | APM 루트 레이아웃을 `ApmRetentionProvider`로 감쌈 |
| `shared/apmRetention.ts` | `TApmRetentionDays`·`APM_RETENTION_DAYS_FALLBACK`·`apmRetentionDaysFrom`·`apmRetentionScopeDays`·`apmRetentionMismatch` · scope 3종 추가(`service_map`·`db_query`·`dependency`, 옛 `rollup`은 셋 중 최솟값) · `apmResolvedStep`/`apmRetentionState`에 `days`·`oldestAvailableMs`·`metricsAvailable` |
| `shared/apmEmptyReason.ts` | 이유 3종 추가(`no_ingest`·`not_ingestible`·`not_received`) · `apmTotalsEmptyReason`/`apmSeriesEmptyReason`에 `requests`·`received`·`activeRequestsLastSeenMs` · `apmRuntimeSlotEmptyReason` |
| `shared/components/ApmEmptyReason.tsx` | 새 이유의 해결 경로(`collector_status` 추가) · `supplement` 슬롯(🔴 이 부품은 조회하지 않는다 — 조회 부품은 호출처가 넣는다) |
| `shared/components/ApmRetentionNotice.tsx` | `oldestAvailableMs` prop · 서버 일수 · 보존표 문구 치환 · mismatch 한 줄 |
| `services/detail/tabs/ApmServiceRuntimeTab.tsx` | 카드별 부재 사유 · `NOT_INGESTIBLE`만 폐기 요약 |
| `services/detail/widgets/registry.tsx` | 합계·시계열 이유에 서버값, 합계 팝오버에 폐기 요약(보존 밖 제외) |
| `services/detail/tabs/ApmServiceInstancesTab.tsx` · `services/components/ApmInstanceSeriesCard.tsx` | `metricsAvailable` 판정 · small multiple에 전달 |
| `services/ApmServiceListPage.tsx` · `overview/ApmOverviewPage.tsx` | `received`·`requests` |
| `slo/apmSloDisplay.ts` · `slo/ApmSloPage.tsx` | `apmSloSliReason` · 사유 3종 문구 · 툴팁 합침 |
| `traces/components/ApmTraceExplorer.tsx` · `errors/…/ApmErrorExplorer.tsx` · `db/…/ApmDbExplorer.tsx` · `dependencies/…/ApmDependencyExplorer.tsx` · `service-map/ApmServiceMapPage.tsx` | 배너에 `oldestAvailableMs`, 집계 3종은 표별 scope |
| `src/locales/kr.json` · `en.json` | **맨 위 `apm` 블록에 텍스트 삽입**(재직렬화 없음): `empty_reason`에 3종 + `action.collector_status`, `slo_unknown_reason`(4), `service_drops`(5 + 사유 2), `retention.table`을 일수 치환형으로, `retention.mismatch`. 기존 줄 변경은 `retention.table` 1줄뿐 |

### 수정 — 테스트·픽스처 15
`apmRetention` · `apmEmptyReason` · `ApmSelfExplain` · `ApmServiceRuntimeTab` · `ApmServiceInstancesTab` · `ApmServiceListPage` · `ApmSloPage` · `ApmOverviewPage` · `ApmServiceDetailPage` · `apmAggScreens` + 픽스처 `apmContractSample`·`apmTraceContractSample`·`apmMapContractSample`·`apmSloContractSample`·`apmDeploymentContractSample`

합계 **42파일**(수정 40 · 신규 2), `git diff --shortstat`: +2,232 / −142.

## 3. 폴백 규칙(정리)

1. **키 없음(`undefined`) = 구 BE** → 선행 작업의 판정 그대로. **`null` = 신 BE의 답**(예: `activeRequestsLastSeenMs:null` = "7일 안에 안 보냄", `unknownReason:null` = "UNKNOWN 아님", `oldestAvailableMs:null` = "이 EP는 계산 안 함 → 일수 계산").
2. 보존 일수: Provider 응답 전·실패·권한/라이선스 없음·Provider 밖(홈·테스트) → `APM_RETENTION_DAYS_FALLBACK`(상수). 응답에서 빠진 필드만 상수. 🔴 0 이하 분기는 **두지 않았다**(BE가 항상 1 이상으로 정규화 — 계약 §3 R1).
3. 서버 경계(`oldestAvailableMs`)에도 1시간 여유를 둔다 — FE 창 시작이 서버 "지금"보다 요청 지연만큼 앞서 프리셋마다 헛경고가 뜨는 것을 막는다(인스턴스는 종전대로 여유 없음).
4. 판정 우선순위(합계·시계열): 보존 밖(전체) → 수신 없음 → (액티브) 옵션 필요 → 요청 없음 → 데이터 없음.
5. 폐기 요약 줄: 실패·로딩이면 줄만 없다. 보존 밖·`not_instrumented`(구 BE)에는 붙이지 않는다.

## 4. 테스트 결과(실행)

| 실행 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 0 |
| `npm run typecheck:contract` | ✅ 0(픽스처를 BE 워크트리 최신 표본 JSON에 맞춤 — `runtime.json`의 JVM `absentSlots`에 공통 프로세스 슬롯 2개 추가분, `deployment-new-errors.json`의 `oldestAvailableMs:null`, 계약 §3 `*VisibleDays` 포함) |
| `npx eslint <바꾼 .ts/.tsx 40개> --max-warnings 0` | ✅ 0 |
| `npx jest <25 스위트> -w 2` | **571 통과 / 2 실패 / 573** — 실패 2건은 `apmHelpContent.test.ts`의 **master 기존 실패**(아래) · 이번 작업 대상 스위트는 전부 통과 |
| 고아 jest 워커 | 없음(`node.exe` 중 jest 명령줄 0) |
| 전체 jest · 브라우저 실측 | 하지 않음(지시 · :3000에 BE 변경 없음) |

스위트별(통과/전체): `apmRetention` 32/32 · `apmEmptyReason` 25/25 · `ApmSelfExplain` 23/23 · `ApmServiceRuntimeTab` 21/21 · `ApmServiceInstancesTab` 19/19 · `ApmServiceListPage` 24/24 · `ApmSloPage` 32/32 · `ApmOverviewPage` 28/28 · `ApmServiceDetailPage` 42/42 · `apmAggScreens` 24/24 · `ApmChartCard` 11/11 · `ApmServiceTransactionsTab` 20/20 · `apmRoutes` 40/40(Provider 배선 포함) · `apmTraceScreens` 19/19 · `apmHooks` 14/14 · `apmSloDisplay` 30/30 · `apmCollectorDisplay` 35/35 · `apmDeployments` 36/36 · `ApmHelp` 8/8 · `apmDashboardCatalog` 7/7 · `ApmHomeWidgets` 20/20 · traces 3종 47/47 · `apmHelpContent` 14/16.

새로 넣은 케이스(요지): 순수 함수 — 서버값 우선/폴백 각각, `undefined`≠`null`, `*VisibleDays`와 min 폴백, 승격=상수·안내=유효값 분리, 경계 여유, `metricsAvailable` 우선 · 화면 — 런타임 3사유·권한 없는 폐기 줄·조회 실패, 인스턴스 서버 true/false·small multiple 전달, 목록·개요·상세 `no_ingest`·구 BE, SLO 3코드·모르는 코드·R4·툴팁 합침, DB 배너 서버 경계.

🔴 `apmHelpContent` 2건은 이 작업과 무관한 **master 기존 실패**다: ZM-122 커밋(`7db36a2`)이 `ApmAlertStuckTab.tsx`에 `helpKey="alert_stuck_table"`을 붙였는데 테스트의 `WIDGET_KEYS` 목록에는 없다(`git show master:…` 로 확인, 두 파일 모두 이 작업에서 손대지 않음).

## 5. 미해결 · 판단 필요

1. **브라우저 실측 미실시** — BE가 :3000에 없다. 확인 거리: .NET 서비스 런타임 탭(허용목록 밖 카드·폐기 줄), 액티브 요청 옵션을 끈 앱으로 요청 0건 창, 보존을 줄인 설치본의 mismatch 한 줄, 수신이 끊긴 서비스 목록.
2. 액티브 요청 "옵션 필요"의 근거(`activeRequestsLastSeenMs`)는 **지금 기준 최근 7일**이다. 7일 넘게 요청 자체가 끊긴 서비스를 **과거 창**으로 보면 요청이 있던 창에서도 "옵션 필요"가 뜰 수 있다(현재 창이면 `received:false`가 먼저 이긴다). 드문 경우라 그대로 뒀다.
3. `nowMs`(서버 지금)는 쓰지 않았다 — 서버 경계는 `oldestAvailableMs`가 이미 서버 시계로 오고, 폴백 계산은 종전처럼 브라우저 시계다.
4. 슬롯 단위 폐기 확정(“이 슬롯의 메트릭이 버려졌다”)은 하지 않았다 — BE 슬롯→메트릭 표를 FE에 복제해야 해서다. 서비스 단위 요약만 붙이고 계약서 `🔄 FE 요청사항` R-FE2(선택)로 남겼다.
5. BE 표본 `service-detail.json`의 `activeRequests: 3.0` + `activeRequestsLastSeenMs: null` 모순 → R-FE1. FE 픽스처는 표본 그대로 옮기고 주석으로 밝혔다.
6. 판정 우선 해석: 지시문은 `NOT_RECEIVED` → 설치 가이드만, 계약 §1은 "설치 가이드 + 폐기 사유"라 적는다. 허용목록 안 슬롯은 `NOT_ALLOWLISTED`로 버려지지 않으므로 지시문대로 설치 가이드만 뒀다(폐기 사유를 다시 붙이려면 `ApmEmptyReason.tsx` `ACTIONS` 한 줄).
7. 안 덮은 자리(선행 §3 "남은 것"과 같음): SLO 상세의 SLI, 홈 위젯(`traffic-totals`에 `requests`/`received` 없음), 트랜잭션 탭 선택 엔드포인트 차트, RUM·메시징 보존 배너.
8. 커밋 미실시 — 선별 add 필요(`git add -A` 금지). 커밋 메시지 초안: `#ZM-152 [FEAT] 화면 자기설명 BE 연동 — 런타임 부재 사유·액티브 요청 관측·유효 보존 일수(Provider)·보존 경계·서비스별 폐기 요약·수신 없음·SLO UNKNOWN 사유·인스턴스 지표 가능 -2026-09-28`

---

## 6. 코덱스 반영(v1, 2026-09-28)

원문 [`../reviews/review_zm-152-fe-contract-integration_codex.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-152-FE-%EA%B3%84%EC%95%BD-%EC%97%B0%EB%8F%99-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 판정 "수정 후 재검수" → **10건 전부 반영**(표·위치는 인계서 "검수 결과(코덱스 v1)" 절).

| # | 바뀐 동작 |
|---|---|
| R1 | 런타임 카드 표시: 신 BE는 `absentSlots`가 정본(`{}` = 부재 없음, 부재 맵에 없는 슬롯은 FE가 기대해도 안 세움, `unknown`은 서버 그대로). 구 BE만 FE 대응표. ⚠️ 풀·"알려진 런타임의 `expected` 밖" 카드는 **숨기는 방향으로만** 억제 — BE가 JVM에도 공통 프로세스·풀 슬롯을 부재로 싣기 때문(없으면 모든 JVM에 결함 카드 2~3장) |
| R2 | `NOT_RECEIVED` = 설치 가이드 + 폐기 사유 + 서비스 폐기 요약(계약 §1). 위 §5-6의 "지시문 해석"은 폐기 — 계약을 따른다 |
| R3 | 서버 경계 C: `whole` = `to <= C`(여유 없음), `partial` = `from < C − 5분`(결정 2026-09-28). 1시간 여유는 브라우저 시계 폴백에만 |
| R4 | 보존 배너 문구: "보존이 보장되지 않아 일부 또는 전부가 없을 수 있음"(파티션이 하루 덜 지워져 경계 이전 행이 남을 수 있다) |
| R5 | 새 판정 `gap` — 운영 보존 < 승격 기준인 해상도로 답했고 창이 그 유효 경계 앞에서 시작하면, 보존 밖·승격이 없어도 "앞부분이 비어 있을 수 있음" 배지·배너. 기본 설정에서는 뜨지 않는다 |
| R6 | 서버 시각 오프셋 `clockOffsetMs` = 응답 `nowMs` − 수신 시각(`dataUpdatedAt`). 폴백 경계·승격 예측은 `Date.now()+offset` |
| R7 | SLO `OUT_OF_RETENTION`: "기간의 일부 또는 전부가 보존 범위 밖이라 전체 SLO 기간을 판단할 수 없음" |
| R8 | `TApmServiceDrops.source: "PROCESS_MEMORY"` · `rows[].signal: "METRIC"` 리터럴 |
| R9 | 경계 테스트 `C-1ms/C/C+1ms`·`to=C` 교체, 런타임 `undefined`/`{}`/키 존재 분리 |
| R10 | 🆕 `apmSelfExplainHooks.test.tsx` — 진짜 `useDmoveQuery`로 언랩·키·staleTime·포커스·enabled 고정 |

바꾼 파일(이번 반영): `apmRetention.ts` · `ApmRetentionContext.tsx` · `ApmRetentionNotice.tsx` · `ApmEmptyReason.tsx` · `services/runtimeSlots.ts`(신규 편입) · `ApmServiceRuntimeTab.tsx` · `types/apm.ts` · `kr.json`·`en.json` · 테스트 `apmRetention`·`ApmServiceRuntimeTab`·`ApmSelfExplain`·🆕`apmSelfExplainHooks`. 누적 **44파일**(수정 41 · 신규 3), +2,560 / −155(추적 파일 기준).

검증: `tsc` 0 · `typecheck:contract` 0 · eslint 42개 0 · jest `-w 2` **26 스위트 596/598**(실패 2 = `apmHelpContent` master 기존) · 고아 워커 0.

🔴 R3의 부작용(추정, 실측 필요): 서버 경계는 **서버 "지금"** 기준이고 FE 창 시작은 요청 **전** 브라우저 시각이라, 보존 일수와 같은 길이의 프리셋(트레이스 7일·DB/서비스 맵/외부 호출 30일·예외 90일)은 `from`이 경계보다 요청 지연 + 시계 차만큼 앞선다 → **프리셋을 고를 때마다 "일부 밖" 배너**가 뜰 수 있다. 선행 작업에서 1시간 여유로 막던 경우다. 후보: ① 프리셋 시작을 몇 분 늦추기(FE) ② BE가 경계에 여유를 두고 내려주기 ③ 서버 경계에만 짧은 여유(예: 5분) — 계약 해석 결정 필요.

➡️ **결정 2026-09-28**: 위 ③안 채택 — 서버 경계의 `partial`에만 5분 여유(`APM_RETENTION_SERVER_GRACE_MS`), `whole`은 여유 없음. 반영·테스트 완료.

### 6-2. 코덱스 v2 반영(2026-09-28)

원문 [`../reviews/review_zm-152-fe-contract-integration-v2_codex.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-152-FE-%EA%B3%84%EC%95%BD-%EC%97%B0%EB%8F%99-v2-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) — R2·R3(5분 여유 타당)·R6~R10 닫힘, 남은 3건 반영.

| # | 바뀐 동작 |
|---|---|
| R1(부분→완료) | 런타임 억제를 **명시 목록**(`APM_RUNTIME_SUPPRESSED_ABSENT`)으로 좁힘: 커넥션 풀(모든 런타임) · JVM 공통 프로세스 슬롯 · JVM 밖 non_heap 카드. 그 외는 서버 `absentSlots` 그대로 — Python memoryUsed(heap 카드)·cpu, .NET classCount 카드가 선다. non_heap 항목은 코덱스 목록 밖 추가(없으면 .NET/Python에 없는 차원 카드가 선다) |
| N1 | 빈 값 이유 `retention.body`(kr/en)도 "보존이 보장되지 않아 일부 또는 전부가 없을 수 있음"으로(배너와 같은 원칙) |
| N2 | 인스턴스 탭이 `gap`을 소비 — 배너(`apm-instances-retention-gap`)와 빈 숫자 칸 배지. 창 전체 밖 안내는 종전대로 expired만 |

검증: `tsc` 0 · `typecheck:contract` 0 · eslint 0 · jest `-w 2` **26 스위트 599/601**(실패 2 = `apmHelpContent` master 기존) · 고아 워커 0. 누적 **44파일**(수정 41 · 신규 3).

### 6-3. 코덱스 v3 반영(2026-09-28)

N1·N2 닫힘, 새 결함 0. R1 잔여(비-JVM non_heap 억제) → **카드 정의 범위**로 이동: `TApmRuntimeCard.families?` 추가, non_heap 카드는 `families: [JVM]`. 억제 목록은 커넥션 풀 + JVM 공통 프로세스 슬롯 두 종류만 남았다. 비-JVM의 `memoryUsed` 부재는 heap 카드 한 장, JVM은 heap·non_heap 두 장. 검증: tsc·typecheck:contract·eslint 0, jest 3 스위트 80/80. 누적 44파일(수정 41 · 신규 3) 변동 없음.
