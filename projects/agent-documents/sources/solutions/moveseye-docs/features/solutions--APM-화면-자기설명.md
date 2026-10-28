---
title: APM 화면 자기설명 — 빈 값 이유·보존 안내·지표 뜻 (ZM-152)
doc_type: feature
audience: [개발, QA, 운영, 기획]
status: review
owner: MovesEye 팀
baseline: 2026-09-28
source_of_truth: moveseye-be-spring `premium/apm/core/batch/retention/ApmRetentionDays`·`ApmRetentionPolicy`·`ApmRetentionJob`, `premium/apm/collector/setting/ApmSettingController`·`ApmRetentionDto`, `premium/apm/collector/ingest/drop/ApmServiceDropTally`·`ApmIngestDropStatRecorder`, `premium/apm/collector/drops/ApmServiceDropSummaryService`·`ApmServiceDropSummaryDto`, `premium/apm/collector/ingest/status/ApmIngestStatusController`, `premium/apm/service/runtime/RuntimeSlotMap`, `premium/apm/core/metric/ApmMetricStore`·`ApmResolution`, `premium/apm/slo/ApmSloCalculator`; moveseyee_fe `pages/application-monitoring/shared/apmRetention.ts`·`apmEmptyReason.ts`·`ApmRetentionContext.tsx`·`useApmMetricGuide.tsx`, `shared/components/ApmEmptyReason.tsx`·`ApmRetentionNotice.tsx`·`ApmMetricTerm.tsx`·`ApmServiceDropsLine.tsx`, `services/runtimeSlots.ts`, `types/apm.ts`; 계약서 `C:/solutions/_workspace/features/apm/self-explain/contract_zm-152-self-explain-be.md`
reviewed_at: 2026-09-28
review_cycle: event-driven
deployment_scope: source
be_commit: 43570e6 (master, 기준 3f731d5)
fe_commit: e7e9e8f (master, 기준 105c8bf; FE 선행 커밋 2c58efb 포함)
latest_flyway: 없음 — 이 기능은 DB 스키마를 바꾸지 않는다
qa_evidence: BE 단위 4,188건 통과(IT 끔) · APM 패키지 IT 포함 2,098/2,100(실패 2는 환경성 플레이크) · FE jest 26스위트 599/601(실패 2는 master 기존 `apmHelpContent`) · Codex 검수 BE v2 승인·FE v4 승인 · 런타임 미검증
---

# APM 화면 자기설명 — 빈 값 이유·보존 안내·지표 뜻

> **이 문서로 답할 수 있는 질문**
> - APM 화면의 빈 카드·`—`·빈 차트는 각각 무엇을 뜻하고, 어떤 근거로 그 이유를 고르는가?
> - "요청 없음"과 "수신 없음"과 "에이전트 옵션 필요"는 어떻게 갈리는가? 구 BE에 붙여도 화면이 서는가?
> - 보존 기간 안내는 어디서 오는 값이며, 운영자가 `apm_retention` 잡 옵션을 바꾸면 화면이 따라오는가?
> - 새로 생긴 API 2개와 기존 응답에 늘어난 필드는 무엇이고, 누가 볼 수 있는가?
> - 서비스별 폐기 요약이 "0건"이라고 할 때 그 숫자를 얼마나 믿어야 하는가?

> 한 줄 요약 — **APM 화면이 비어 있을 때 화면 스스로 "왜 비었는지"와 "어디까지 데이터가 남아 있는지"를 말한다.** FE 선행 작업(2026-09-21)이 화면 부품과 판정 규칙을 만들었고, BE 8건(2026-09-28)이 FE가 추정하던 근거를 서버 값으로 바꿨다. 새 필드는 전부 옵셔널이라 구 BE에 붙여도 선행 작업의 판정으로 돌아간다. (Jira **ZM-152**)
>
> 🔴 **배포 상태** — BE·FE 모두 master에 커밋됐다(미푸시). BE는 `:3000` 재기동 전이라 **런타임·브라우저 실측은 하지 않았다.** 이 문서의 `현재`는 **master 소스에 구현됨**을 뜻한다.

이 문서는 내부 독자(개발·QA·운영)를 위한 것이다. 사용자 안내는 [애플리케이션 모니터링 화면 가이드](../guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md)·[수집기 설치](../guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%88%98%EC%A7%91%EA%B8%B0-%EC%84%A4%EC%B9%98.md)에 있다. 명세의 배경(실사용에서 막힌 지점 7개)은 `C:/solutions/_workspace/features/apm/backlog/backlog_apm-comprehension-and-ai.md` §1-1·§1-3·§1-5①이 정본이다.

## 1. 사용자 목표와 범위

- 해결하는 문제: APM 화면은 "에이전트가 지표를 안 보냄", "요청이 없어 못 잼", "보존 기간이 지나 지워짐", "허용목록 밖이라 버려짐"이 **똑같이 빈 카드**로 보였다. 판정 재료(계측 미제공 분류, 폐기 통계, SLO UNKNOWN)는 BE에 있었는데 화면이 말하지 않았다. 보존 일수는 FE 상수가 BE 상수의 사본이라 운영에서 잡 옵션을 바꾸면 안내가 틀렸다. 지표 이름(액티브 요청, p95, 오류율)의 뜻을 화면에서 찾을 수 없었다.
- 주 사용자: 온보딩 중인 APM 사용자(에이전트를 막 붙인 사람), 보존 기간을 조정하는 운영자, "데이터가 안 와요"를 진단하는 지원 담당자.
- 포함:
  - 빈 값의 이유 6종 + 런타임 슬롯 부재 사유 2종을 공용 부품 하나(`ApmEmptyReason`)로 화면 9곳에 표시
  - 보존 판정을 차트 머리 배지·화면 위 배너로 표시(`ApmRetentionNotice`), 판정 근거는 서버 값 우선
  - 지표 한 줄 뜻을 StatCard 8장·표 머리 12칸에 표시(`useApmMetricGuide`·`ApmMetricTerm`)
  - BE: 새 EP 2개(`GET /apm/settings/retention`, `GET /apm/ingest/drops/by-service`)와 기존 응답 필드 추가 6건
  - `apm_retention` 잡 옵션 해석의 단일 정본화(`ApmRetentionDays`) — 잡과 조회 EP가 같은 값을 본다
- 제외(선행 보고 §3 "남은 것"과 FE 연동 보고 §5-7):
  - 빈 값 이유 미적용: 트랜잭션 탭의 선택 엔드포인트 RED 3차트, 개요 히트맵·Top5, Apdex 게이지 null, 응답시간 분포 히트맵, 배포 전후 비교 카드, 실시간 패널, 홈 위젯 3종, RUM·합성 감시·메시징 화면, SLO 상세의 SLI, 리포트
  - 보존 안내 미적용: 트랜잭션 탭 차트, 개요(5분+1분 혼합), RUM, 메시징, 수집기 상태 탭(자체 각주 유지), SLO 스냅샷(400일)
  - 홈 위젯 `GET /apm/widgets/traffic-totals`에는 `requests`·`received`를 싣지 않았다
  - 폐기 사유 링크는 수집기 **상태 탭까지**만 간다(폐기 표로 스크롤·사유 필터 없음)
  - 슬롯 단위 폐기 확정("이 슬롯의 메트릭이 버려졌다") — 서비스 단위 요약만 붙였다(§10 R-FE2)

### 1.1 빈 값의 이유와 붙는 자리

FE `shared/apmEmptyReason.ts`의 `APM_EMPTY_REASON` 8종이 정본이다. 문구는 `apm.empty_reason.<reason>.label/body`(kr/en).

| 이유 코드 | 화면 라벨 | 뜻 | 붙는 화면 | 해결 경로(부품이 제안) |
|---|---|---|---|---|
| `no_data` | 데이터 없음 | 요청은 있었는데 그 값만 없다(경계 혼재 등), 또는 이 창에서만 끊김 | 개요 StatCard 4 · 서비스 합계 4 · 서비스 RED 시계열 4 · 서비스 목록 3칸 | 없음 |
| `no_requests` | 요청 없음 | 창 안에 처리한 요청이 0건이라 잴 대상이 없다(0%·0ms가 아님) | 위와 같음 + SLO 목록 SLI(`NO_REQUESTS`) | 없음 |
| `no_ingest` | 수신 없음 | 창 안에 이 서비스의 **어떤 메트릭도** 한 행 안 들어왔다 | 개요 StatCard 4 · 서비스 합계 4 · 서비스 RED 시계열 · 서비스 목록 3칸 | 수집기 상태 |
| `agent_option` | 에이전트 옵션 필요 | 액티브 요청을 **한 번도 보낸 적이 없다**(실험 지표라 기본 꺼짐) | 개요 StatCard 액티브 · 서비스 합계 액티브 · 액티브 요청 차트 | 설치 가이드 |
| `retention` | 보존 기간 밖 | 창 전체가 보존 경계보다 앞이다 — 다른 모든 이유보다 먼저 | 위 전부 + 런타임 카드·빈 탭 · 인스턴스 칸·small multiple · SLO(`OUT_OF_RETENTION`) | 없음(기간을 최근으로) |
| `not_instrumented` | 수신되지 않은 지표 | 런타임이 보통 보내는 슬롯이 없는데 **이유를 못 가름**(구 BE 폴백 전용) | 런타임 탭 카드 | 설치 가이드 + 폐기 사유 |
| `not_ingestible` | 아직 수집 대상이 아닌 지표 | 서버 `absentSlots[slot] = "NOT_INGESTIBLE"` — 허용목록 밖, 에이전트 설정으로 못 고침 | 런타임 탭 카드 | 폐기 사유 + 서비스 폐기 요약 한 줄 |
| `not_received` | 수신되지 않은 지표 | 서버 `absentSlots[slot] = "NOT_RECEIVED"` — 저장은 되는데 이 창에 안 왔다 | 런타임 탭 카드 | 설치 가이드 + 폐기 사유 + 서비스 폐기 요약 |

런타임 `NOT_INGESTIBLE`/`NOT_RECEIVED`는 BE 응답의 코드이고, 화면 이유 `not_ingestible`/`not_received`는 그 코드를 `apmRuntimeSlotEmptyReason`이 1:1로 옮긴 것이다. 보존 밖 창도 BE는 `NOT_RECEIVED`로 답하므로(세 번째 코드 없음), 창 전체가 보존 밖이면 FE의 보존 판정이 먼저 이긴다.

### 1.2 보존 안내가 붙는 자리

| 자리 | 표시 | 판정 축 |
|---|---|---|
| 서비스 개요 시계열 4장 · 런타임 카드 | 머리 배지 — 승격(`5분 단위`), 일부 밖, 전체 밖, `gap` | 승격은 **응답 `step`** 기준, 밖 여부는 유효 일수 |
| 인스턴스 탭 | 배너 + 빈 숫자 칸 배지 + small multiple 빈 사유 | 행의 `metricsAvailable`(신 BE) → 없으면 창 **시작** 기준 계산 |
| 트레이스 탐색(메뉴·서비스 탭·트랜잭션 산점도 공통) · 예외 · DB · 외부 호출 · 서비스 맵 | 화면 위 배너(일부/전체 밖일 때만) | 응답 `oldestAvailableMs`(신 BE) → 없으면 표별 일수 계산 |
| 모든 배지·배너 툴팁 | 보존 표 한 줄(`apm.retention.table`, 일수는 서버 값 치환) | `GET /apm/settings/retention` |

### 1.3 지표 한 줄 뜻

`apm.metric_guide.<key>`(11개)를 `useApmMetricGuide`가 읽는다. `i18n.exists`가 false면 아무것도 그리지 않는다.

| 자리 | 지표 |
|---|---|
| 개요 StatCard 4 · 서비스 개요 탭 합계 4 | 초당 요청 · 오류율 · p95 · 액티브 요청 — 뜻이 먼저, 기존 모집단 안내가 뒤 |
| 서비스 목록 표 머리 | 초당 요청 · 오류율 · p95 · 인스턴스 |
| 트랜잭션 엔드포인트 표 머리 | 요청 수 · 초당 요청 · p50 · p95 · 오류율 |
| 인스턴스 표 머리 | 초당 요청 · p95 · 오류율 |

p99·응답시간·Apdex·가용성 문구는 로케일에 있지만 **붙인 자리가 없다**(다음 확장 대상).

## 2. 현재 상태

`부분` — 소스 구현·단위 테스트·정적 검수는 끝났고 master에 병합됐다. 런타임 실측(BE 재기동 후 curl로 새 필드 확인, 브라우저에서 .NET 서비스 런타임 탭·옵션 끈 앱의 액티브 요청·보존 줄인 설치본의 `mismatch` 줄·수신 끊긴 서비스 목록)은 하지 않았다.

| 영역 | 상태 | 근거 |
|---|---|---|
| 빈 값 이유 공용 부품·판정 함수(FE) | 현재 | `apmEmptyReason.ts`·`ApmEmptyReason.tsx`, `apmEmptyReason.test.ts`·`ApmSelfExplain.test.tsx` |
| 보존 판정·안내(FE) | 현재 | `apmRetention.ts`·`ApmRetentionNotice.tsx`·`ApmRetentionContext.tsx`, `apmRetention.test.ts` |
| 지표 뜻(FE) | 현재 | `useApmMetricGuide.tsx`·`ApmMetricTerm.tsx` |
| 유효 보존 EP·정규화(BE) | 현재 | `ApmRetentionDays`·`ApmRetentionPolicy`·`ApmSettingController`, `ApmRetentionPolicyTest`·`ApmRetentionNormalizationTest` |
| 보존 경계 `oldestAvailableMs`(BE) | 현재 | 컨트롤러 5개·DTO 7개, `ApmReadAccessMvcTest` |
| 런타임 부재 사유·액티브 관측·수신 여부·인스턴스 가능(BE) | 현재 | `RuntimeSlotMapAbsentTest`·`ApmSeriesSelfExplainTest`·`ApmServiceSelfExplainTest`·`ApmOverviewTotalsSelfExplainTest` |
| SLO `unknownReason`(BE) | 현재 | `ApmSloCalculator.unknownReason`, `ApmSloUnknownReasonTest` |
| 서비스별 폐기 요약(BE) | 부분 | 메모리 카운터(재기동 리셋·서버 한 대·메트릭만) — 설계상 한계, §5.3 |
| 런타임 실측 | 계획 | BE `:3000` 재기동 후 |
| 홈 위젯·트랜잭션 탭·RUM 등 미적용 자리 | 계획 | §1 제외 목록 |

## 3. 데이터 원천과 소유권

### 3.1 판정 근거의 원천

| 데이터 | 원천 | 읽기 | 쓰기 | cache/동기화 |
|---|---|---|---|---|
| 유효 보존 일수 | `scheduler_setting`(job_key `apm_retention`)의 `options` JSON | `ApmRetentionPolicy`가 JDBC로 1행(`select options::text …`) | 설정 › 스케줄러(잡 옵션) — 이 기능은 쓰지 않음 | BE 60초 캐시(`ApmRetentionPolicy.TTL`), FE Provider staleTime 10분·포커스 재조회 끔 |
| 승격 판정 상수 | `ApmResolution`(M1 7일 · M5 30일 · H1 400일) | 시계열 조회의 해상도 선택 | 코드 상수(바꾸지 않았다) | 응답 `resolutions[].promotionDays`로 노출 |
| 보존 경계 `oldestAvailableMs` | `서버 지금 − 유효 일수 × 24h`(`ApmRetentionDays.oldestAvailableMs`) | 컨트롤러가 응답 마지막에 `retention.attach` | — | 서버 시계 기준 |
| 창 안 요청 수·수신 여부 | `apm_metric_1m/5m/1h`(조회 창이 고른 해상도 표) | `ApmMetricStore.servicesWithData`(VALUES × EXISTS 한 질의) | 수집 경로 | 없음(호출마다) |
| 액티브 요청 마지막 관측 | `apm_metric_1m`의 `http.server.active_requests` 최근 7일 `max(bucket_start)` | `ApmMetricStore.activeRequestsLastSeenMs` | 수집 경로 | 없음. 기준 7일 = `ApmResolution.M1` 상수 |
| 런타임 슬롯 부재 사유 | `RuntimeSlotMap.Binding.ingestible`(허용목록 `ApmMetricAllowlist`와 일치를 테스트가 고정) | `RuntimeSlotMap.absentReasons(family, present)` | 코드 상수 | — |
| 서비스별 폐기 수 | **프로세스 메모리** `ApmServiceDropTally`(`ApmIngestDropStatRecorder` 안) | `ApmServiceDropSummaryService` | 수집 경로의 `recordForService` 6곳 | 재기동 시 0. DB에 쓰지 않는다 |
| SLO UNKNOWN 사유 | `ApmSloCalculator.measureBatch`의 `Measured`(보존 잘림 포함) | `unknownReason(status, measured)` | — | — |
| 인스턴스 지표 가능 여부 | `ApmResolution.choose(from, to, 60) == M1` | `ApmServiceQueryService`가 행마다 실음 | — | — |
| 지표 뜻·이유 문구 | FE `locales/kr.json`·`en.json`의 `apm.metric_guide.*`·`apm.empty_reason.*`·`apm.retention.*`·`apm.slo_unknown_reason.*`·`apm.service_drops.*` | i18n | FE 소스 | — |

### 3.2 서버값 우선 → 구 BE 폴백 규칙

FE 판정 함수는 새 필드를 전부 옵셔널로 받고, **키가 없을 때만** 선행 작업(2c58efb)의 계산으로 돌아간다. 세 값을 구분한다.

| 값 | 뜻 | 예 |
|---|---|---|
| `undefined`(키 없음) | **구 BE** — 서버가 이 사실을 모른다 → 종전 판정 | `activeRequestsLastSeenMs` 없음 → 요청이 있으면 옵션 필요, 없으면 요청 없음 |
| `null` | **신 BE의 답** — "없다"가 사실이다 | `activeRequestsLastSeenMs: null` = 7일 안에 한 번도 안 보냄 → 요청 0건 창에서도 옵션 필요 · `oldestAvailableMs: null` = 이 EP는 경계를 계산하지 않음 → 일수 계산 · `unknownReason: null` = UNKNOWN 아님 |
| `false` | 신 BE의 부정 답 | `received: false` = 수신 없음 · `metricsAvailable: false` = 인스턴스 축 없음 |

구분하는 이유: `null`과 `undefined`를 섞으면 구 BE에 붙였을 때 모든 서비스가 "옵션 필요"가 되고, `metricsAvailable`을 falsy로 다루면 구 BE에서 모든 인스턴스 표가 "보존 밖"이 된다.

보존 일수는 APM 라우트 루트의 `ApmRetentionProvider`가 **한 번** 읽어 컨텍스트로 나눠 준다. 컨텍스트 기본값이 상수 폴백(`APM_RETENTION_DAYS_FALLBACK`)이라 Provider 밖(홈 위젯·테스트), 응답 전, 실패, 권한·라이선스 없음에서도 판정 함수가 멈추지 않는다. 응답에서 **빠진 필드만** 상수로 돌아간다(`apmRetentionDaysFrom`).

## 4. 사용자 흐름

### 4.1 정상 흐름(신 BE)

1. APM 메뉴 진입 → Provider가 `GET /apm/settings/retention`을 1회 호출(`apm.view` + APM 라이선스일 때만). 응답 `nowMs`와 수신 시각(`dataUpdatedAt`)의 차를 `clockOffsetMs`로 저장.
2. 화면이 자기 데이터를 조회한다. 값이 있으면 이유를 만들지 않는다.
3. 값이 null이면 판정 우선순위(합계·시계열): **보존 밖(창 전체) → 수신 없음 → (액티브) 옵션 필요 → 요청 없음 → 데이터 없음**. 부품은 라벨 + 본문 + 해결 경로 링크를 그린다.
4. 런타임 탭은 서버 `absentSlots`가 정본이다. `{}`는 부재 없음, 키가 있으면 사유 카드, 부재 맵에 없고 값도 없으면 카드를 세우지 않는다. `NOT_INGESTIBLE`·`NOT_RECEIVED` 카드에는 `GET /apm/ingest/drops/by-service?serviceUid=`로 "이 서비스의 폐기 n건(서버 기동 시각 이후) — 주요 사유 상위 2개" 한 줄과 한계 툴팁이 붙는다.
5. 보존 배너·배지는 `oldestAvailableMs`(트레이스·집계·맵) 또는 `metricsAvailable`(인스턴스) 또는 응답 `step`(시계열 승격)으로 판정한다.

### 4.2 권한 없음

- `apm.view`가 없으면 Provider가 조회하지 않는다(요청이 body 403으로 쌓이는 것을 막는다) → 상수 폴백으로 안내한다.
- `apm.edit`이 없으면 해결 경로 링크(설치 가이드·수집기 상태·폐기 사유는 모두 수집기 화면이라 조회까지 `apm.edit`) 대신 "수집기 설정 확인은 APM 관리 권한이 있는 사용자에게 요청하세요"(`apm.empty_reason.action.need_edit`)를 보여 준다. 폐기 요약 한 줄은 `apm.view` EP라 **권한 분기 없이** 보인다.

### 4.3 빈 데이터

이 기능 전체가 빈 데이터 흐름이다. 추가로:

- 인스턴스가 하나도 없으면 `metricsAvailable`을 실을 행이 없다 → 종전 계산.
- 폐기가 없는 서비스에 `serviceUid`를 주면 `total: 0` 한 줄이 온다 → "이 서비스의 폐기 0건(서버 기동 … 이후)".
- `GET /apm/ingest/drops/by-service`를 `serviceUid` 없이 부르면 폐기가 있는 서비스만 `total` 내림차순(최대 200개, 서비스당 행 50개). FE는 서비스 지정 호출만 쓴다.

### 4.4 외부 시스템 오류

- 보존 EP: `scheduler_setting` 행이 없거나 읽기에 실패하면 **기본값 + `configured: false`**로 200을 준다(DB 순간 장애가 차트 전체를 죽이지 않게). FE는 `configured`와 무관하게 값을 쓴다 — 그 값이 잡이 실제로 쓰는 값이다.
- 보존 EP 호출 자체가 실패하면 상수 폴백, `clockOffsetMs`는 0.
- 폐기 요약 EP가 실패·로딩이면 **그 한 줄만** 빠진다(이유 문구는 그대로).
- 없는 `serviceUid` → HTTP 200 + body `code: 404`(`APM_SERVICE_NOT_FOUND`). UUID 형식이 아니면 스프링 바인딩 실패(`GlobalExceptionHandler`).

## 5. API 계약

라이선스 `Feature.APM`, 헤더 `x-visitor-id`, 인증 쿠키 — 기존 APM EP와 같다. 원칙은 **응답 필드 추가만**: 기존 필드의 이름·타입·null 규칙·의미는 바뀌지 않았고, 바뀐 record마다 이전 시그니처의 호환 생성자를 남겼다. 상세 DTO는 계약서 `features/apm/self-explain/contract_zm-152-self-explain-be.md`와 코드가 정본이며, 계약 표본은 BE `src/test/resources/apm/contract/*.json` 14개와 FE `src/__tests__/fixtures/apm*ContractSample.ts`다(`npm run typecheck:contract`가 대조).

### 5.1 새 엔드포인트

| Method | Path | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| GET | `/apm/settings/retention` | 없음 | `ApmRetentionDto` — `configured`·`nowMs`·표별 일수 19+3·`resolutions[3]` | `apm.view`(`requireRead`). 같은 컨트롤러의 `GET /apm/settings`는 여전히 `apm.edit` |
| GET | `/apm/ingest/drops/by-service` | `serviceUid`(UUID, 선택) | `ApmServiceDropSummaryDto` — `source`·`countingSinceMs`·`overflowCount`·`services[]` | `apm.view`(`requireRead`). 기존 `GET /apm/ingest/drops`는 여전히 `apm.edit` |

`GET /apm/settings/retention` 응답 필드(전부 int 일수, 항상 1 이상):

| 필드 | 기본값 | 대상 |
|---|---|---|
| `configured` | — | false = 잡 행 없음/읽기 실패 → 아래가 기본값 |
| `nowMs` | — | 서버 기준 지금(요청마다 `System.currentTimeMillis()`) |
| `m1Days` · `m5Days` · `h1Days` | 7 · 30 · 400 | `apm_metric_1m`(인스턴스 축 유일) · `_5m` · `_1h` |
| `spanDays` · `traceSummaryDays` | 7 · 7 | 트레이스 상세·워터폴 · 목록·산점도 |
| `serviceEdge5mDays` · `dbQuery5mDays` · `dependency5mDays` · `messaging5mDays` | 30 | 서비스 맵 · DB 쿼리 · 외부 의존 · 메시징 5분 집계 |
| `errorGroup1hDays` · `errorGroupDays` · `dbQueryGroupDays` | 90 | 예외 발생 수 버킷 · 예외 그룹 본체 · DB 쿼리 그룹 본체 |
| `errorGroupVisibleDays` | 90 | `min(errorGroup1hDays, errorGroupDays)` — 예외 화면이 실제로 보는 일수 |
| `dbQueryVisibleDays` | 30 | `min(dbQuery5mDays, dbQueryGroupDays)` |
| `sloSnapshotDays` · `deploymentDays` · `stuckRequestDays` · `dropStatDays` | 400 · 400 · 90 · 30 | SLO 캘린더 · 배포 이력 · 요청 걸림 장부 · 폐기 통계 DB 행 |
| `rum5mDays` · `rumSpanDays` · `rumErrorGroupDays` | 30 · 7 · 90 | RUM — 옵션이 없어 코드 상수 노출 |
| `resolutions[].step` / `promotionDays` / `effectiveDays` / `instanceAxis` / `mismatch` | 60·300·3600 / 7·30·400 / =m1·m5·h1 / 60만 true / false | `mismatch = promotionDays > effectiveDays` |

### 5.2 기존 응답에 추가된 필드

| EP | 필드 | 타입 | null 규칙 | 권한 |
|---|---|---|---|---|
| `GET /apm/services/{uid}/runtime` | `absentSlots` | `Record<slot, "NOT_INGESTIBLE" \| "NOT_RECEIVED">` | 키는 항상 있음(없을 때 `{}`). `slots`와 키가 겹치지 않음. `family=unknown`이면 공통 `processCpuPct`·`processMemoryBytes`만 | view |
| `GET /apm/services/{uid}/red-series` | `activeRequestsObserved` | boolean | 서비스 전체 RED에만 값. 엔드포인트·인스턴스 시계열은 `null` | view |
| 〃 | `activeRequestsLastSeenMs` | number(ms) | `null` = 최근 7일 안에 안 보냄. 엔드포인트·인스턴스 시계열은 늘 `null` | view |
| `GET /apm/services/{uid}` | `activeRequestsLastSeenMs` | number(ms) | `null` = 7일 안에 안 보냄 | view |
| 〃 | `requests` · `received` | number · boolean | 없음(0·false 포함) | view |
| 〃 `instances[]` · `GET /apm/services/{uid}/instances` 행 | `metricsAvailable` | boolean | 없음. 한 응답의 모든 행이 같은 값 | view |
| `GET /apm/services/overview`의 `services[]` | `requests` · `received` | number · boolean | 없음 | view |
| `GET /apm/overview`의 `totals` | `requests` · `received` | number\|null · boolean\|null | 대상 서비스가 없으면 `null`. `totals.prev`에는 없음 | view |
| `GET /apm/traces` · `/apm/traces/scatter` | `oldestAvailableMs` | number(ms) | 항상 값(`traceSummaryDays`) | view |
| `GET /apm/errors` · `/apm/errors/{groupId}/series` | `oldestAvailableMs` | number(ms) | 항상 값(`errorGroupVisibleDays`) | view |
| `GET /apm/db/queries` · `/apm/db/queries/{groupId}/series` | `oldestAvailableMs` | number(ms) | 항상 값(`dbQueryVisibleDays`) | view |
| `GET /apm/dependencies` · `/apm/dependencies/series` | `oldestAvailableMs` | number(ms) | 항상 값(`dependency5mDays`) | view |
| `GET /apm/service-map` | `oldestAvailableMs` | number(ms) | 항상 값(`serviceEdge5mDays`) | view |
| 같은 DTO를 쓰는 다른 EP(예: `GET /apm/deployments/{id}/new-errors`의 `ApmErrorGroupsDto`) | `oldestAvailableMs` | — | `null` = 계산하지 않음 | — |
| `GET /apm/slos` 행 · `GET /apm/slos/{uid}`의 `row` · SLO 생성·수정 응답 | `unknownReason` | `"NO_REQUESTS" \| "NOT_MEASURABLE" \| "OUT_OF_RETENTION"` | `status != "UNKNOWN"`이면 `null`. SLO 시계열·캘린더 칸에는 없음 | view |

시계열 EP(red-series 등, 승격이 있는 곳)에는 `oldestAvailableMs`를 싣지 않았다 — 거기는 응답 `step`이 승격 신호다.

### 5.3 `GET /apm/ingest/drops/by-service`의 한계 — 화면 문구에 반영됨

| 한계 | 응답에서 드러내는 방법 | FE 표시 |
|---|---|---|
| **프로세스 메모리 카운터** — 서버 재기동 시 0부터 | `source: "PROCESS_MEMORY"`, `countingSinceMs`·`countingSince`(= 서버 기동) | "서버 기동 {시각} 이후" + 툴팁 `apm.service_drops.limits` |
| **인스턴스 로컬** — 서버 한 대가 받은 것만 | — | 툴팁 |
| **서비스가 정해진 메트릭 폐기만** — `NOT_ALLOWLISTED`·`ROUTE_OVERFLOW`·`CUMULATIVE_FIRST_SKIPPED`(`MetricIngestor`)·`REBUCKETED`·`RAW_BOUNDS`·`BOUNDS_CONFLICT`(`ApmMetric1mStore`). 귀속 실패·승인 대기·거절·신호 미지원·트레이스 폐기(속성 허용목록·원문 SQL)는 없음 → 관리 권한의 `/drops` | `rows[].signal`은 항상 `"METRIC"` | 툴팁 |
| 키(서비스×사유×메트릭×신호) 상한 **10,000**(`ApmServiceDropTally.MAX_KEYS`) — 넘으면 새 키는 `overflowCount`로만 | `overflowCount` | `apm.service_drops.overflow` |
| 서비스당 행 50개(`MAX_ROWS_PER_SERVICE`)·서비스 200개(`MAX_SERVICES`) | `services[].truncated` | `apm.service_drops.truncated` |
| `total`은 사유 단위가 섞인 합(변형 사유 `REBUCKETED`·`RAW_BOUNDS`도 포함) | — | 주요 사유 상위 2개를 함께 적는다 |

DB 테이블은 만들지 않았다(지시). 영속 서비스 축이 필요해지면 `apm_ingest_drop_stat`에 `service_id` 열(자연키 변경) 또는 별도 테이블 — §10 열린 항목.

## 6. 상태·동시성·실패

- 상태 전이: 조회 전용 기능이라 도메인 상태 전이는 없다. 판정 상태만 있다 — 보존 `TApmRetentionState = { expired{cutoffMs, whole}, promoted{fromStep, toStep, fromDays}, gap{cutoffMs, step, effectiveDays} }`, 우선순위 **보존 밖 > gap > 승격**.
- idempotency: 모든 EP가 GET이다. 보존 EP는 같은 60초 안에서 같은 값을 준다(`nowMs`만 요청마다 새로 찍힌다).
- 동시 실행: `ApmServiceDropTally`는 수신 스레드 경합 아래 동작한다 — 새 키는 `AtomicInteger` CAS로 자리를 예약(실패 = overflow), 카운트는 `LongAdder`, `lastSeen`은 `accumulateAndGet(max)`라 뒤로 가지 않는다. 16스레드 × 새 키 1,000 경합 테스트가 키 수 ≤ 10,000·건수 보존을 고정한다.
- retry/timeout: 보존 EP는 BE 60초 캐시·FE staleTime 10분(포커스 재조회 끔). 폐기 요약은 FE staleTime 1분. 둘 다 폴링하지 않는다.
- partial failure: §4.4.

### 6.1 보존 일수 정규화

`ApmRetentionDays.from(setting)`의 `opt()`가 **0 이하 값을 기본값으로 바꾼다**(양수는 그대로). 잡(`ApmRetentionJob.run`)과 조회 EP·`oldestAvailableMs`가 같은 함수를 거치므로 **배치 삭제 인자와 화면 안내가 같은 양수만 본다**. 응답의 모든 일수는 항상 1 이상이라 FE는 0 이하 분기를 두지 않았다.

이전에는 원값이 그대로 배치 삭제 인자로 갔다 — `raw1mDays=0`이면 오늘 자정 이전 파티션이, 음수면 미래 시각 기준이라 오늘 데이터까지 지워질 수 있었다(이번 추출로 드러난 잠재 결함, Codex R1). 정규화로 바뀌는 것은 0·음수 설정 설치본뿐이고 그 경우 이전보다 **덜** 지운다.

### 6.2 min(자식, 부모) 경계

예외·DB 쿼리는 본체(`apm_error_group`·`apm_db_query_group`)가 마지막 관측 후 N일 지나면 **자식 버킷까지 함께** 지워진다. 그래서 화면이 실제로 볼 수 있는 일수는 버킷 보존과 본체 보존 중 **짧은 쪽**이다(`errorGroupVisibleDays`·`dbQueryVisibleDays`). 외부 의존(`apm_dependency_5m`)·서비스 맵(`apm_service_edge_5m`)은 본체 테이블·연쇄 삭제가 없어 파티션 보존 하나만 본다(`ApmRetentionService` 전 단계 점검 완료). FE는 `*VisibleDays`가 없으면 같은 규칙(min)으로 계산한다.

### 6.3 SLO `OUT_OF_RETENTION` 우선

`ApmSloCalculator.unknownReason(status, window)`의 판정 순서(코드 기준):

1. `status != UNKNOWN` → `null`
2. `window == null`(측정 없음) → `NOT_MEASURABLE`
3. `window.retentionClipped()`(창 시작이 유효 `rollup1hDays` 경계 밖이라 측정이 잘림) → `OUT_OF_RETENTION` — **요청 수보다 먼저**. 잘린 창의 0건은 "요청 없음"이 아니라 "못 읽음"이다
4. 요청 창은 있는데 잰 구간이 비었으면(`measuredToMs <= measuredFromMs`) → `OUT_OF_RETENTION`
5. `requests == 0` → `NO_REQUESTS`
6. 그 밖(`requests > 0`인데 `measured == 0` — LATENCY 히스토그램 경계 혼재·누락) → `NOT_MEASURABLE`

측정 계획(`measureBatch`)은 유효 `rollup1hDays` 경계보다 앞 구간을 읽지 않고, 그 경우 행의 `measuredFromMs`가 경계로 당겨진다(기존 필드, 의미 불변 — "실제로 잰 구간의 시작"). 기본 보존 400일에서는 7·30일 창이 잘리지 않아 측정값이 이전과 같다. FE는 서버 코드를 요청 수로 덮어쓰지 않는다(잘린 창의 0건을 "요청 없음"이라 적지 않는다). 모르는 코드는 "판정 불가", `null`은 `—`.

### 6.4 서버 시각 오프셋

FE `clockOffsetMs = 응답 nowMs − 수신 시각(dataUpdatedAt)`. 폴백 경계·승격 예측은 `Date.now() + clockOffsetMs`로 계산해 사용자 PC 시계가 서버와 어긋나도 경계가 밀리지 않는다. 응답 없음·실패·권한 없음은 0. BE 60초 캐시는 일수만 캐시하고 `nowMs`는 요청마다 새로 찍힌다(코드 확인: `ApmSettingController.retention`이 `System.currentTimeMillis()`를 넘긴다).

### 6.5 서버 경계의 5분 여유(결정 2026-09-28)

서버 경계 C(`oldestAvailableMs`)가 있을 때:

| 판정 | 조건 | 여유 |
|---|---|---|
| `whole`(창 전체 밖) | `to <= C` | 없음 |
| `partial`(일부 밖) | `from < C − 5분`(`APM_RETENTION_SERVER_GRACE_MS`) | 5분 |
| 브라우저 시계 폴백 경계 | `from < cutoff − 1시간`(`APM_RETENTION_GRACE_MS`) | 1시간 |
| 인스턴스(`metricsAvailable` 또는 창 시작 계산) | BE `choose()`와 같음 | 없음 |

여유를 두는 이유: FE 창 시작은 요청 **전** 브라우저 시각이고 서버 경계는 서버 "지금" 기준이라, 보존 일수와 같은 길이의 프리셋(트레이스 7일·DB/맵/외부 호출 30일·예외 90일)은 `from`이 경계보다 요청 지연 + 시계 차만큼 앞선다. 여유 없이는 프리셋을 고를 때마다 "일부 밖" 배너가 떴다. 5분은 프리셋 정렬 오차(초 단위)를 흡수하면서 `from = C − 30분, to = C` 같은 진짜 `whole`을 놓치지 않는 값이다(Codex v2가 타당 판정).

### 6.6 `gap` 상태

운영 보존이 승격 기준보다 짧은 해상도(`resolutions[].mismatch = true`)로 답했고 창이 그 유효 경계 앞에서 시작하면, 보존 밖·승격이 없어도 "앞부분 비어 있을 수 있음" 배지·배너(`apm.retention.gap`·`badge_gap`)가 선다. 지표는 응답 `step` 단, 인스턴스는 1분 단을 본다. **기본 설정(`effective == promotion`)에서는 절대 뜨지 않는다**(테스트 고정). `gap`이 있으면 `mismatch` 한 줄은 중복이라 생략한다.

### 6.7 알려진 오판 가능성

- `received`는 조회 창이 고른 해상도 표에서 EXISTS로 본다. 5m·1h 표는 롤업 지연이 있어 **최근 몇 분만의 창**이 5m 이상으로 승격되면 드물게 `false`가 나올 수 있다(보통 창은 1m이라 해당 없음).
- 액티브 요청 "옵션 필요"의 근거(`activeRequestsLastSeenMs`)는 **지금 기준 최근 7일**이다. 7일 넘게 요청 자체가 끊긴 서비스를 **과거 창**으로 보면 요청이 있던 창에서도 "옵션 필요"가 뜰 수 있다(현재 창이면 `received: false`가 먼저 이긴다). 드문 경우라 그대로 뒀다.
- 런타임 부재는 보존 밖 창도 `NOT_RECEIVED`다. 창 전체 보존 밖은 FE 보존 판정이 먼저 이긴다.
- `oldestAvailableMs`는 **보수적 경계**다. 파티션 DROP은 하루 덜 지워서 실제로는 조금 더 오래된 행이 남아 있을 수 있다. 그래서 배너 문구는 "보존이 보장되지 않아 일부 또는 전부가 없을 수 있음(수집이 멈춘 것이 아님)"이다.
- 7일 프리셋의 인스턴스 안내: BE `choose(from, to, 60) == M1`은 창 **시작** 기준·여유 없음이라, 7일 프리셋은 시작이 ms 차이로 7일을 넘어 `metricsAvailable: false`가 된다. FE 선행 작업이 이 동작에 맞춰 안내를 띄우고 문구에 "'7일' 기간도 경계에 걸려 비어 보일 수 있으니 '24시간'이나 직접 지정한 기간을 쓰라"고 적었다. 판정 규칙은 바꾸지 않았다(§10 열린 항목).

## 7. 권한과 보안

- 기능 permission: `applicationMonitoring.apm`(`ApmAccessChecker`). 
  - **`apm.view`로 열리는 것**: 새 EP 2개(`/apm/settings/retention`, `/apm/ingest/drops/by-service`)와 기존 응답의 추가 필드 전부. 보존 안내와 폐기 요약은 모든 조회 화면이 쓰는 읽기 전용 사실이라 view로 열었다.
  - **`apm.edit`이 남는 것**: `GET /apm/settings`(마스킹·등록 모드가 같이 열리므로 넓히지 않았다), `GET /apm/ingest/drops`(전체 폐기 통계, 서비스를 모르는 폐기·트레이스 폐기 포함), `GET /apm/ingest/recent`, 수집기 화면 전체(FE 라우트 `apm.edit` 축). 그래서 FE 해결 경로 링크(설치 가이드·수집기 상태·폐기 사유)는 `canEdit`일 때만 링크이고, 아니면 "관리 권한자에게 요청" 문구다.
  - `ApmAdminAccessMvcTest`가 view 전용 사용자의 새 EP 통과·설정 값 403 유지·권한 없음 403을 고정한다.
- 데이터 범위: 폐기 요약은 `serviceUid`로 서비스 1개를 지정한다. 응답의 `serviceUid`·`displayName`은 view 사용자가 서비스 목록·상세 URL(`/apm/services/{uid}`)에서 이미 보는 값이라 새로 노출되는 식별자는 없다. `serviceUid` 없이 부르면 폐기가 있는 서비스 전부(최대 200)가 오는데, FE는 이 형태를 쓰지 않는다. 서비스 단위 가시성 필터(사용자별 서비스 제한)는 기존 APM EP와 같이 없다.
- 감사 로그: 없음(조회 전용).
- secret/개인정보: 폐기 요약의 `metricName`은 서비스 접미(`@svc:`)를 뗀 메트릭 이름이며 원문 SQL·속성 값은 담지 않는다. 보존 EP는 일수만 준다.

## 8. 운영

- 설정·환경변수: 새 환경변수 없음. 보존 일수는 `scheduler_setting`(job_key `apm_retention`)의 `options` JSON 19키(`raw1mDays`·`rollup5mDays`·`rollup1hDays`·`spanDays`·`traceSummaryDays`·`edge5mDays`·`errorGroup1hDays`·`dbQuery5mDays`·`dependency5mDays`·`messaging5mDays`·`errorGroupDays`·`dbQueryGroupDays`·`instanceIdleDays`·`dropStatDays`·`receiptDays`·`deploymentDays`·`sloSnapshotDays`·`jobRunDays`·`stuckRequestDays`)다. FE 스케줄러 카탈로그(`constants/scheduler.ts`)에 `apm_retention` 항목이 있다. 설정 › 스케줄러 화면에서 이 options JSON을 직접 편집할 수 있는지는 **미확인**.
- **잡 옵션과 화면 안내의 관계**: 잡이 실제로 지우는 값과 화면이 안내하는 값은 `ApmRetentionDays.from`이라는 **같은 해석**을 거친다. 옵션을 바꾸면 BE 캐시 60초 + FE staleTime 10분(또는 APM 재진입) 안에 안내가 따라온다. 옵션을 0 이하로 두면 잡·화면 모두 기본값으로 동작하고 WARN이 남는다. 단, 시계열 **승격 판정**(`ApmResolution` 7·30·400일)은 상수라 옵션을 바꿔도 따라오지 않는다 → 아래 `mismatch`.
- **`resolutions[].mismatch`의 의미**: `promotionDays > effectiveDays` — 예를 들어 `raw1mDays`를 3일로 줄이면 1분 표는 3일 뒤에 지워지는데 시계열은 7일까지 1분 해상도를 고집하므로, 4~7일 전 구간이 **승격 없이 빈 그래프**로 나온다. 화면은 `gap` 배지·배너와 `mismatch` 한 줄("운영 보존 설정이 차트 해상도를 바꾸는 기준보다 짧습니다")로 알린다. 운영에서 보존을 승격 기준보다 짧게 줄일 계획이면 `ApmResolution`을 유효 일수로 승격 판정하게 바꾸는 별도 결정이 필요하다(§10).
- metric/log: 
  - `ApmRetentionDays`가 0 이하 옵션을 만나면 `WARN "apm_retention 옵션 {key}={value}는 0 이하라 무시하고 기본값 {n}일을 쓴다 …"`를 **키=값 조합마다 프로세스 수명 동안 1회**(`WARNED` 정적 집합) 남긴다. 재기동하면 다시 1회.
  - 보존 EP의 `configured: false`가 계속 나오면 `scheduler_setting`에 `apm_retention` 행이 없거나 읽기가 실패하는 것이다. 별도 메트릭은 없다.
  - 폐기 요약 `overflowCount > 0`이면 서비스×사유×메트릭 키가 10,000을 넘은 것 — 메트릭 이름 카디널리티가 높은 설치본에서만 나온다.
- 장애 증상과 복구:
  - 보존 EP가 실패해도 화면은 상수 폴백으로 선다. 안내 일수가 실제와 다르면 옵션과 상수(7·30·400·7·30·90)의 차이를 의심한다.
  - 서버 재기동 직후 모든 서비스의 폐기 요약이 "0건(서버 기동 방금 이후)"이다 — 정상이며, 누적 폐기는 관리 권한의 `/drops`(DB, `dropStatDays` 보존)로 본다.
  - `servicesWithData`(서비스 목록 호출마다 1회)·`lastBucketOf`(상세·red-series 호출마다 1회) 질의는 인덱스 선두 `service_id`·역방향 스캔을 전제로 작성했으나 **운영 규모 EXPLAIN은 미실시**다. 목록 화면이 느려지면 이 두 질의를 먼저 본다.
- migration/rollback: Flyway 없음. 롤백은 코드만 되돌리면 된다 — 새 필드는 FE가 옵셔널로 받으므로 BE만 되돌려도 FE는 선행 작업 판정으로 동작한다. `ApmRetentionJob`은 옵션 파싱을 `ApmRetentionDays`로 옮겼을 뿐 양수 설정에서 삭제 범위가 같다(`ApmRetentionNormalizationTest#positiveValuesUnchanged`, `ApmRetentionJobIT` 12건).

## 9. 검증 근거

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위(BE) | `:test` 앱 전체, IT 끔(`IT_DB_URL` 무효 주소) | **4,188건 통과, 실패 0, skip 452**(IT) |
| 단위+IT(BE) | `:test --tests "com.dmove.moveseye.premium.apm.*"`, IT 포함(도커 5433) | **2,100건 중 2,098 통과**, IT 313건 전부 실행·통과. 실패 2 = `ApmCollectorLiveRuntimeTest`의 Windows 임시 디렉터리 정리(`collector.log` 잠금) — 단독 재실행 통과, 변경 범위와 무관 |
| 변이 확인(BE) | `ApmSloCalculator`의 보존 잘림(`clipped=false`)을 끄면 | `ApmSloUnknownReasonTest` 2건 실패 → 원복 후 통과 |
| 계약 표본 | BE `src/test/resources/apm/contract/*.json` 14개 갱신(새 키만), FE `npm run typecheck:contract` | 통과 |
| 정적(FE) | `npx tsc --noEmit`, eslint(바꾼 `.ts/.tsx` 42개, `--max-warnings 0`) | 0 |
| 단위(FE) | `npx jest` 관련 **26스위트** `-w 2` | **599/601** — 실패 2는 `apmHelpContent.test.ts`의 master 기존 실패(ZM-122 `7db36a2`가 `ApmAlertStuckTab`에 `helpKey="alert_stuck_table"`을 붙였는데 테스트 `WIDGET_KEYS`에 없음). 이번 대상 스위트 전부 통과, 고아 워커 0 |
| 훅 실경로(FE) | `apmSelfExplainHooks.test.tsx` 10건 — 진짜 `useDmoveQuery`로 언랩·쿼리 키 공유·staleTime·포커스·enabled·Provider 권한/라이선스 분기 | 통과 |
| 정적 검수 | Codex BE v1(필수 R1~R4·권장 R5~R6 반영) → **v2 승인** · FE v1(10건 반영) → v2(3건) → v3(1건) → **v4 승인** | 승인 |
| runtime | — | **미검증** — BE `:3000` 재기동 전. curl로 새 필드 확인, 브라우저 실측 모두 미실시 |

증거 원천:

- 계약서 `C:/solutions/_workspace/features/apm/self-explain/contract_zm-152-self-explain-be.md`
- FE 선행 보고 `C:/solutions/_workspace/features/apm/self-explain/zm-152_screen-self-explaining.md`
- BE 보고 `C:/solutions/_workspace/features/apm/self-explain/zm-152_be-self-explain.md`(§6 Codex 반영)
- FE 연동 보고 `C:/solutions/_workspace/features/apm/self-explain/zm-152_fe-contract-integration.md`(§6~§6-3)
- 검수 기록 `C:/solutions/_workspace/features/apm/self-explain/review_zm-152-be-self-explain.md`·`review_zm-152-fe-contract-integration.md`

## 10. 결정과 열린 항목

- 결정:
  - **서버 경계 `partial`에만 5분 여유, `whole`은 여유 없음**(2026-09-28, §6.5). 기각: ① FE 프리셋 시작을 몇 분 늦추기(툴바 창 자체를 바꾸는 일이라 범위 밖) ② BE가 경계에 여유를 두고 내려주기(경계의 뜻이 흐려짐).
  - **런타임 카드 억제 규칙 2종만**(Codex FE v2~v4): 커넥션 풀 `poolActive`·`poolWaitP95Ms`(모든 런타임 — DB 안 쓰는 서비스가 정상) · JVM `processCpuPct`·`processMemoryBytes`(같은 질문에 `cpuUtilizationPct`·heap이 답한다). 억제는 서버가 부재라고 한 것을 **숨기는 방향으로만** 작동한다. 기각: "알려진 런타임의 `expected` 밖 카드 전부 억제"(일반화 과다 — Python `memoryUsed`·.NET `classCount` 카드가 사라진다).
  - **non_heap 카드는 억제가 아니라 카드 범위**(`TApmRuntimeCard.families: [JVM]`): 비-JVM에서 non_heap은 없는 차원이라 `memoryUsed` 부재를 heap 카드 한 장으로 말한다. JVM은 heap·non_heap 두 장.
  - **승격 판정은 상수 유지, 안내는 유효값**: `ApmResolution`을 바꾸면 모든 시계열의 step이 달라지는 동작 변경이라 손대지 않고 `mismatch`·`gap`으로 드러낸다.
  - **`GET /apm/settings`를 view로 넓히지 않고 새 EP**: 넓히면 마스킹·등록 모드가 같이 열린다.
  - **폐기 서비스 축은 메모리 카운터**(지시): 기각 — `apm_ingest_drop_stat.metric_name`에 `@svc:` 접미를 전 사유로 확대(기존 `/drops` 행 키가 서비스 수만큼 쪼개져 관리 화면 의미가 바뀐다).
  - **`received`는 메트릭 표 EXISTS**: 기각 — 인스턴스 `lastSeenAt`(30일 미수신이면 지워져 과거 창에서 거짓 false).
  - **`ApmEmptyReason` 부품은 조회하지 않는다**(`supplement` 슬롯): 부품 안에서 `axiosInstance`를 끌어오면 이 부품을 쓰는 테스트 스위트가 로딩 단계에서 깨진다.
  - **보존 일수는 컨텍스트로 공급**: 기각 — 부품 안 훅 직접 호출(QueryClient 없는 테스트 수십 개가 깨짐), 모듈 전역 변수(계정 전환·테스트 격리 불가).
  - **`undefined` ≠ `null`**(§3.2).
- 기각 대안: 위 각 결정에 병기.
- 열린 항목:

| 항목 | 상태 |
|---|---|
| 런타임 실측(BE 재기동 후 curl 새 필드 확인, 브라우저: .NET 런타임 탭·옵션 끈 앱·보존 줄인 설치본·수신 끊긴 서비스) | 계획 |
| 계약서 `🔄 FE 요청사항` **R-FE1** — BE 표본 `service-detail.json`이 `activeRequests: 3.0`인데 `activeRequestsLastSeenMs: null`(실제 응답에서 나올 수 없는 조합). FE 픽스처는 표본 그대로 옮기고 주석으로 밝힘 | 계획(BE 표본 수정) |
| 계약서 **R-FE2**(선택) — 슬롯 단위 폐기 확정. `absentSlots` 값에 메트릭 이름을 싣거나 by-service 응답에 `slot`을 붙이는 방식 | 보류 |
| **7일 프리셋 인스턴스 안내**(선행 보고 §6-2) — 항상 뜬다. 후보 ① FE 7일 프리셋 시작을 몇 분 늦추기 ② BE `covers()`에 여유 폭 | 보류(결정 필요) |
| **5번 DB 영속화** — 재기동 초기화가 문제면 `apm_ingest_drop_stat`에 `service_id` 열(자연키 변경) 또는 별도 테이블 | 보류(결정 필요) |
| 홈 위젯 `traffic-totals`에 `requests`·`received` 적용 여부 | 보류 |
| `ApmResolution`을 유효 일수로 승격 판정(`mismatch`가 true인 설치본이 생기면) | 보류 |
| `servicesWithData`·`lastBucketOf` 운영 규모 EXPLAIN | 계획 |
| `agent_option` 문구가 액티브 요청을 직접 언급 — 다른 실험 지표가 생기면 일반화. .NET·Node·Python 에이전트 스위치는 실측 전이라 문구에 없음 | 보류 |
| `metric_guide`의 p99·응답시간·Apdex·가용성 문구를 붙일 자리(응답시간 범례·Apdex 게이지·가용성 띠) | 계획 |
| 미적용 화면(§1 제외 목록) | 계획 |
| 사용 안 하는 로케일 키 `apm.runtime.not_instrumented_hint` 정리 | 보류 |

- 관련 문서: [애플리케이션 모니터링 화면 가이드](../guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md), [수집기 설치](../guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%88%98%EC%A7%91%EA%B8%B0-%EC%84%A4%EC%B9%98.md), [스케줄러](../guides/pages/%EC%84%A4%EC%A0%95/solutions--%EC%8A%A4%EC%BC%80%EC%A4%84%EB%9F%AC.md), [FAQ §APM](../guides/solutions--%EC%9E%90%EC%A3%BC-%EB%AC%BB%EB%8A%94-%EC%A7%88%EB%AC%B8.md), [기능 문서 목록](solutions--README.md)
- Obsidian 관련 노트: `[[2026-09-22-zm151-156-backlog-sprint]]`(백로그 스프린트 ZM-151~156 — 화면 자기설명 FE 선행분 포함). BE 8건·FE 연동(09-28)에 대한 별도 노트는 작성 시점에 없음.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-21 | FE 선행 — 빈 값 이유 5종·보존 판정(`apmRetention.ts`, BE `ApmResolution.choose`의 거울)·지표 뜻 부품과 화면 9곳 적용. 인스턴스 탭 보존 판정 결함(창 길이 → 창 시작) 수정. FE `2c58efb` |
| 2026-09-28 | BE 8건(새 EP 2 + 응답 필드 추가 6, 보존 정규화·min 경계·SLO 보존 우선·카운터 동시성 Codex 반영) BE `43570e6` · FE 연동(서버값 우선·`undefined`≠`null` 폴백, Provider·서버 시각 오프셋, 5분 여유, `gap`, 이유 3종 추가, 런타임 억제 규칙) FE `e7e9e8f`. 이 문서 최초 작성 |
