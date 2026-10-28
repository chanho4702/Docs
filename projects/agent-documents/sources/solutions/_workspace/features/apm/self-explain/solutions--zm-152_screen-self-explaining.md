# ZM-152 화면이 스스로 설명하게 — 빈 값 이유·보존 안내·지표 뜻

> 작성 2026-09-16 · 갱신 2026-09-22 · FE(`moveseyee_fe`, master) · ✅ **완료 — FE master `2c58efb`(09-21, 미푸시)** · BE 무수정
> 🔴 커밋 경위: 다른 커밋(ZM-122)이 이 작업의 일부 파일·번역 줄을 먼저 가져가, master가 미추적 모듈을 import해 새 체크아웃 빌드가 깨져 있었다 — `2c58efb`가 그 모듈까지 담아 해소. 남은 것: §BE 요청 8건(별도 과제)
> 명세 정본: `planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md` §I2 · 배경: `features/apm/backlog/backlog_apm-comprehension-and-ai.md` §1-1·1-3·1-5①

## 0. 한 줄 요약

빈 값의 이유를 공용 부품 하나(`ApmEmptyReason`)로 모아 화면 9곳에 붙였고, 보존 판정(`apmRetention`, BE `ApmResolution.choose`의 거울)을 차트 배지·화면 배너로 드러냈으며, 지표 한 줄 뜻(`apm.metric_guide.*`)을 StatCard 8장과 표 머리 12칸에 붙였다. 조사 중에 **인스턴스 탭 보존 안내가 BE와 다른 기준(창 길이)으로 판정하던 결함**을 찾아 BE와 같은 기준(창 시작)으로 고쳤다.

## 1. 조사 — BE가 이미 내려주는 것

| 재료 | 어디서 | 화면이 쓸 수 있는 것 | 한계 |
|---|---|---|---|
| 창 합계 null 규칙 | `ApmOverviewQueryService.snapshot`·`ApmServiceQueryService` | `requests == 0`이면 `rps`·`errorRatePct`가 null. `activeRequests`는 **표본 0개일 때만** null(보내기만 하면 한가해도 0) | "요청 0건"과 "아무것도 안 옴"이 같은 null |
| RED 시계열 | `GET /apm/services/{uid}/red-series` | 빈 칸도 점을 채운다(`requests=0` + 지연 null). 응답 `step`이 요청과 다르면 **보존 승격** | 액티브 요청이 "안 오는 지표"인지 표시 없음 |
| 해상도·보존 | `ApmResolution`(1m=7일·5m=30일·1h=400일) | **창 시작** 기준으로 승격, 1h에서 멈춤. 인스턴스 표는 `choose(from,to,60)==M1`일 때만 값 | 보존 일수는 응답에 없다(BE도 잡 옵션의 사본) |
| 런타임 | `GET /apm/services/{uid}/runtime` | 없는 슬롯은 **키 자체가 없다**, `family`·`step` | 슬롯이 왜 없는지(허용목록 밖 / 미수신) 없음. BE 표(`RuntimeSlotMap`)는 비-JVM 슬롯을 전부 `ingestible=false`로 들고 있지만 응답에 안 실린다 |
| 수신 확인 | `GET /apm/ingest/recent` | 토큰별 최근 60초 배치·저장·폐기 수 | 서비스 단위가 아니다, 인스턴스 로컬 |
| 폐기 통계 | `GET /apm/ingest/drops` | 사유×메트릭×신호, 누적 | 서비스 축 없음(`routeOverflow` 제외), **조회까지 `apm.edit`** |
| SLO | `GET /apm/slos` | `sliPct` null + `requests` + `measured` + `status=UNKNOWN` | UNKNOWN의 사유 코드 없음 |

→ FE만으로 가를 수 있는 것: 요청 없음 / 액티브 요청 에이전트 옵션(요청은 있는데 그 값만 null) / 보존 밖·승격 / 계측 미제공(두 갈래 합친 채로). **허용목록 폐기를 카드 단위로 확정하는 것은 FE만으로 불가** → §5.

## 2. 무엇을 바꿨나 (파일별)

### 신규 (6 + 테스트 3)
| 파일 | 내용 |
|---|---|
| `shared/apmRetention.ts` | 보존 일수 상수, `apmResolvedStep`(BE `choose` 거울), `apmRetentionState({scope, from, to, requestedStep, responseStep})` → `{expired:{cutoffMs, whole}, promoted:{fromStep,toStep,fromDays}}` 또는 null. scope 5종(metric·instance·trace·rollup·error_group). 프리셋 경계 헛경고 방지 여유 1시간(인스턴스는 BE처럼 여유 없음) |
| `shared/apmEmptyReason.ts` | 이유 5종(`no_data`·`no_requests`·`agent_option`·`retention`·`not_instrumented`)과 판정 함수 3개(`apmTotalsEmptyReason`·`apmSeriesEmptyReason`·`apmRetentionEmptyReason`) |
| `shared/components/ApmEmptyReason.tsx` | 이유 표시 공용 부품. `block`(빈 카드 본문) / `inline`(숫자 자리, hover로 설명·경로). 해결 경로: 에이전트 옵션 → 설치 가이드 탭, 계측 미제공 → 설치 가이드 + 수집기 상태(폐기 사유). **`apm.edit`이 없으면 링크 대신 "관리 권한자에게 요청"** |
| `shared/components/ApmRetentionNotice.tsx` | 보존 안내. `badge`(차트 머리) / `banner`(화면 위). 전체 밖·일부 밖·인스턴스·승격을 다른 문구로. 판정 null이면 아무것도 안 그림 |
| `shared/useApmMetricGuide.tsx` | 지표 한 줄 뜻 훅. `page_guide.<key>.summary`와 같은 규칙(`i18n.exists`가 false면 안 그림). `hint(metric, extra)` = StatCard용(뜻이 먼저, 모집단 안내가 뒤) |
| `shared/components/ApmMetricTerm.tsx` | 표 머리용 — 점선 밑줄 + 툴팁 |
| `__tests__/apmRetention.test.ts`·`apmEmptyReason.test.ts`·`ApmSelfExplain.test.tsx` | 순수 함수·공용 부품 |

### 수정 (14 + 로케일 2 + 테스트 7)
| 파일 | 내용 |
|---|---|
| `shared/components/ApmChartCard.tsx` | prop 2개 추가: `emptyReason`(비었을 때 이유), `retention`(머리 배지 + 창 전체 보존 밖이면 자동으로 이유). 안 주면 종전과 동일 |
| `overview/ApmOverviewPage.tsx` | StatCard 4종: null이면 `—` 대신 이유(요청 없음 / 에이전트 옵션 / 보존 밖), 힌트 = 지표 뜻 + 모집단 안내. 조회 실패 시에는 이유를 만들지 않음 |
| `services/detail/widgets/registry.tsx` | 합계 4장(같은 규칙 + 뜻 힌트), 시계열 4장(요청수·오류율·응답시간·액티브 요청)에 `emptyReason`·`retention`(응답 `step` 기준 승격 배지) |
| `services/detail/tabs/ApmServiceRuntimeTab.tsx` | '계측 미제공' 카드에 해결 경로 두 개, 창 전체 보존 밖이면 '계측 미제공' 대신 '보존 기간 밖'(빈 탭 전체도 동일), 카드 머리 보존 배지 |
| `services/detail/tabs/ApmServiceInstancesTab.tsx` | 🔴 **판정 기준 수정**(창 길이 → 창 시작), 보존 밖일 때 빈 숫자 칸에 배지, 표 머리 3칸 뜻 툴팁 |
| `services/components/ApmInstanceSeriesCard.tsx` | 인스턴스 small multiple 빈 카드에 보존 사유 |
| `services/detail/tabs/ApmServiceTransactionsTab.tsx` | 엔드포인트 표 머리 5칸 뜻 툴팁 |
| `services/ApmServiceListPage.tsx` | 표 머리 4칸 뜻 툴팁, 계측된 서비스인데 요청 0건이면 세 칸 "요청 없음"(계측 없는 서비스는 종전 `—`) |
| `slo/ApmSloPage.tsx` | SLI가 null이고 요청 0건이면 "요청 없음" |
| `errors/…/ApmErrorExplorer.tsx` | 보존 배너(예외 그룹 90일) |
| `db/…/ApmDbExplorer.tsx`·`dependencies/…/ApmDependencyExplorer.tsx`·`service-map/ApmServiceMapPage.tsx` | 보존 배너(5분 집계 30일) |
| `traces/components/ApmTraceExplorer.tsx` | 보존 배너(트레이스 7일) — 트레이스 메뉴·서비스 트레이스 탭·트랜잭션 산점도 공통 |
| `locales/kr.json`·`en.json` | `apm.metric_guide.*`(11) · `apm.empty_reason.*`(5 + 경로 3) · `apm.retention.*`(8 + 단위 3) 추가, `apm.instances.window_limit(_hint)`를 창 시작 기준 문구로 교체. **파일 맨 위 `apm` 블록에 텍스트 삽입**(기존에 들여쓰기 불규칙 구간이 있어 통째 재직렬화하면 무관한 줄이 바뀐다) |
| 테스트 7개 | `ApmChartCard`·`ApmOverviewPage`·`ApmServiceDetailPage`·`ApmServiceInstancesTab`·`ApmServiceRuntimeTab`·`ApmServiceListPage`·`ApmSloPage`에 케이스 추가. 인스턴스·런타임 테스트는 **고정 과거 날짜 → 지금 기준 상대 시각**으로 변경(보존 판정이 "지금"과 비교하므로 고정 날짜는 날이 지나면 뜻이 바뀐다) |

## 3. 덮은 범위와 남은 것

### (a) 빈 값의 이유

| 이유 | 덮은 곳 | 판정 근거 |
|---|---|---|
| 에이전트 옵션 필요 | 개요 StatCard 액티브 · 서비스 합계 액티브 · 서비스 액티브 요청 차트 | 요청은 있는데 액티브 요청만 null |
| 런타임이 낼 수 없는 지표 | 현행 유지(미표시, `runtimeSlots`의 `skip`) | — |
| 요청 없음 | 개요 StatCard 4 · 서비스 합계 4 · 서비스 오류율/응답시간/요청수/액티브 차트 · 서비스 목록 표 3칸 · SLO 목록 SLI | `rps` null / 시계열 `requests` 전부 0 / SLO `requests == 0` |
| 보존 기간 밖 | 위 전부(창 전체가 밖이면 우선) · 런타임 카드·빈 탭 · 인스턴스 칸·small multiple | `apmRetentionState` |
| 수집 단계 폐기 | 런타임 '계측 미제공' 카드(설치 가이드 + 폐기 사유 두 경로 함께) | 판정 불가 → 두 경로 안내 (§5-1) |

**남은 것**: 트랜잭션 탭의 선택 엔드포인트 RED 3차트, 개요 히트맵·Top5, Apdex 게이지 null, 응답시간 분포 히트맵, 배포 전후 비교 카드, 실시간 패널, 홈 위젯 3종, RUM·합성 감시·메시징 화면, SLO 상세, 리포트. 폐기 사유 링크는 수집기 **상태 탭까지**만 간다(폐기 표로 스크롤·사유 필터는 없음).

### (b) 보존 기간 안내

| 자리 | 표시 |
|---|---|
| 서비스 개요 시계열 4장 · 런타임 카드 | 머리 배지 — 승격(`5분 단위`)·일부 밖·전체 밖. 승격은 **응답 `step` 기준** |
| 인스턴스 탭 | 기존 배너(판정 기준 수정) + 빈 숫자 칸 배지 + small multiple 빈 사유 |
| 트레이스 탐색(3곳 공통) · 에러 · DB · 외부 호출 · 서비스 맵 | 화면 위 배너(일부/전체 밖일 때만) |
| 모든 배지·배너 툴팁 | 보존 표 한 줄(지표 1분 7일 · 5분 30일 · 1시간 400일 · 트레이스 7일 · 맵/DB/외부 30일 · 예외 90일) |

🔴 **인스턴스 판정 결함 수정**: 예전 조건 `to - from > 7일`은 BE(`choose(from, to, 60) == M1`, 창 **시작** 기준)와 달랐다. 그래서 ① "열흘 전의 하루" 같은 짧고 오래된 창에서 값이 비어도 안내가 없었고 ② **7일 프리셋**은 시작이 ms 차이로 7일을 넘어 BE가 이미 인스턴스 값을 비우는데 화면은 조용했다. 이제 둘 다 안내가 뜬다(②는 §6-2 판단 필요).

**남은 것**: 트랜잭션 탭 차트, 개요(5분+1분 혼합이라 판정 규칙이 다름), RUM(5분 표 보존 확인 필요), 메시징(트레이스 롤업), 수집기 상태 탭(기존 자체 각주 유지), SLO 스냅샷(400일).

### (c) 지표 한 줄 뜻

| 자리 | 지표 |
|---|---|
| 개요 StatCard 4 | 초당 요청·오류율·p95·액티브 요청 — 뜻이 먼저, 기존 모집단 안내가 뒤 |
| 서비스 개요 탭 합계 4 | 같은 4종 |
| 서비스 목록 표 머리 | 초당 요청·오류율·p95·인스턴스 |
| 트랜잭션 엔드포인트 표 머리 | 요청 수·초당 요청·p50·p95·오류율 |
| 인스턴스 표 머리 | 초당 요청·p95·오류율 |

서비스 개요 탭의 차트 카드는 이미 제목 옆 `?`(`apm.chart_help.<key>.short`)가 한 줄 뜻을 말하고 있어 건드리지 않았다. `metric_guide`에 p99·응답시간·Apdex·가용성 문구는 넣어 두었지만 **아직 붙인 자리가 없다**(다음 확장 대상: 응답시간 범례·Apdex 게이지·가용성 띠).

## 4. 검증

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 |
| `npm run typecheck:contract` | ✅ 통과 |
| `npx eslint <바꾼 ts/tsx> --max-warnings 0` | ✅ 통과 |
| `npx jest` (대상 19개 스위트만, `-w 2`) | ✅ **324/324 통과** — ApmChartCard · ApmOverviewPage · ApmServiceDetailPage · ApmServiceInstancesTab · ApmServiceRuntimeTab · ApmServiceListPage · ApmServiceTransactionsTab · ApmSloPage · apmAggScreens · apmHelpContent · apmRetention(신규) · apmEmptyReason(신규) · ApmSelfExplain(신규) · traces/__tests__ 3개 · ApmHelp · apmDashboardCatalog · ApmHomeWidgets + PageHeaderDescription 5/5 |
| 고아 jest 워커 | 없음(실행 후 확인) |
| 전체 jest | 실행하지 않음(지시) |
| 브라우저 실측 | **하지 않음** — BE(:3000) 무접촉 지시. 다음 확인 거리: 로컬 BE에서 액티브 요청 옵션을 끈 앱으로 개요·서비스 탭 문구, 10일 전 1일 창으로 인스턴스 탭, 31일 이상 사용자 지정 창으로 서비스 맵 배너 |
| prettier | 적용하지 않음 — 바꾼 파일의 **HEAD 원본부터** `prettier --check`를 통과하지 못한다(프로젝트 관행이 아님). `--write`를 돌리면 무관한 서식 diff가 대량으로 생긴다 |

## 5. 🔴 BE 변경이 필요한 항목 (FE만으로 판정 불가한 빈 값 사유)

이번 작업에서 BE는 고치지 않았다.

| # | 요청 | 왜 필요한가 | 지금 FE가 하는 것 |
|---|---|---|---|
| 1 | **런타임 응답에 슬롯별 부재 사유** — 예: `absentSlots: { threads: "NOT_INGESTIBLE" \| "NOT_RECEIVED" }` | BE `RuntimeSlotMap.Binding.ingestible`이 이미 사실을 들고 있다(비-JVM 슬롯은 전부 허용목록 밖). 응답에 안 실려 FE는 "허용목록에서 버려짐"과 "에이전트가 안 보냄"을 못 가른다 | 두 경로(설치 가이드 + 폐기 사유)를 함께 안내 |
| 2 | **"이 서비스가 이 지표를 한 번이라도 보냈나" 신호** — 예: 상세/red-series에 `activeRequestsObserved: boolean`(또는 관측 메트릭 이름 목록) | 요청이 0건인 창에서는 "요청 없음"과 "에이전트 옵션 필요"를 못 가른다(둘 다 null) | 요청이 있을 때만 옵션 필요로 판정, 없으면 "요청 없음" |
| 3 | **유효 보존 일수 노출** — `GET /apm/settings` 또는 조회 응답에 `retention`(1m/5m/1h/span/rollup/errorGroup) | FE 보존 상수는 BE 사본(`ApmResolution`)의 사본이다. 운영에서 `apm_retention` 잡 옵션을 바꾸면 화면 안내가 틀린다(BE 분석 A17과 같은 문제) | `apmRetention.ts` 상수 |
| 4 | **집계·트레이스·예외 조회 응답에 `oldestAvailableMs`**(또는 `truncatedBefore`) | 이 EP들은 승격이 없어 창 앞부분이 조용히 빈다. 경계 시각을 서버가 주면 FE 계산이 필요 없다 | 창 시작과 상수로 계산 |
| 5 | **폐기 통계의 서비스 축** + `apm.view` 수준의 요약 조회 | 서비스 화면에서 "이 서비스의 지표 X가 버려졌다"를 말하려면 서비스별 행이 필요하다. 또 폐기 EP는 조회까지 `apm.edit`이라 읽기 전용 사용자는 사유를 볼 수 없다 | 수집기 상태 탭 링크(권한 없으면 "관리 권한자에게 요청") |
| 6 | **"요청 0건"과 "수신 없음" 구분** — 합계 응답에 `requests`(0 포함) 또는 `received: boolean` | 지금은 둘 다 `rps: null`이다. 요청이 없던 것인지 수집이 끊긴 것인지를 합계 카드만으로 못 가른다(상태 배지 STALE이 일부 대신한다) | 둘 다 "요청 없음" |
| 7 | **SLO UNKNOWN 사유 코드** — `unknownReason: NO_REQUESTS \| NOT_MEASURABLE \| OUT_OF_RETENTION` | `requests > 0`인데 `measured == 0`(경계 혼재 등)인 UNKNOWN은 FE가 사유를 적지 못한다 | `requests == 0`일 때만 "요청 없음" |
| 8 | 인스턴스 표 응답에 `metricsAvailable: false`(해상도에 인스턴스 축 없음) | FE가 `choose()` 규칙을 흉내 내고 있다 | `apmRetentionState(instance)` |

## 6. 미해결·판단 필요

1. **보존 상수 이중 사본** — BE `ApmResolution`(잡 옵션의 사본) → FE `apmRetention.ts`(그 사본). §5-3 전까지는 세 곳을 같이 바꿔야 한다.
2. **7일 프리셋에서 인스턴스 안내가 항상 뜬다.** BE 동작(시작이 ms 차이로 7일을 넘어 인스턴스 값을 비움)과 일치시킨 결과다. 문구에 "'7일' 기간도 경계에 걸려 비어 보일 수 있으니 '24시간'이나 직접 지정한 기간을 쓰라"고 적었다. 근본 해결 후보: ① FE 7일 프리셋 시작을 몇 분 늦추기 ② BE `covers()`에 여유 폭. 결정 필요.
3. **`agent_option` 문구가 액티브 요청을 직접 언급한다.** 지금 이 이유를 쓰는 지표가 액티브 요청뿐이라 구체적으로 썼다. 다른 실험 지표가 생기면 문구를 일반화하거나 지표별 문구로 나눈다. .NET·Node·Python 에이전트의 스위치는 실측 전이라 문구에 넣지 않았다(백로그 1-2 잔여와 같은 이유).
4. **`apm.runtime.not_instrumented_hint` 키**는 더 이상 화면에서 쓰지 않는다(공용 이유 문구로 대체). 삭제하지 않고 남겨 두었다.
5. SLO 목록 SLI 칸은 기존 툴팁(측정 건수) 안에 이유 팝오버가 겹친다 — 두 개가 함께 뜬다. 거슬리면 SLI 칸의 이유를 툴팁 문구로 합친다.
6. **다른 세션의 미커밋 변경이 같은 트리에 있다**: `src/pages/setting/CloudInfraInfo.tsx`, `src/types/setting.ts`, `src/__tests__/CloudInfraCollectionScope.test.tsx`. 작업 시작 시점에는 트리가 깨끗했고, 이 작업과 무관하다(손대지 않음). 커밋할 때 **선별 add**가 필요하다.
7. 브라우저 실측 미실시(§4).
