---
title: APM 커스텀 지표 허용목록 — 폐기 통계에서 받기·규칙 관리·서비스당 상한 (ZM-155)
doc_type: feature
audience: [개발, QA, 운영, 기획]
status: review
owner: MovesEye 팀
baseline: 2026-10-19
source_of_truth: moveseye-be-spring `premium/apm/collector/custommetric/**`(`ApmCustomMetricRuleService`·`ApmCustomMetricNamePolicy`·DTO 3종)·`premium/apm/collector/ApmCustomMetricRuleController`·`premium/apm/collector/ingest/custom/ApmCustomMetricGate`·`premium/apm/collector/ingest/store/MetricIngestor`·`MetricIngestPipeline`·`premium/apm/collector/ingest/drop/ApmDropReason`·`premium/apm/core/domain/ApmCustomMetricRule`·`premium/apm/service/ApmServiceCustomMetricController`·`premium/apm/service/red/ApmCustomMetricSeriesService`·`core/batch/retention/ApmRetentionJob`(단계 `customMetricSeats`)·`db/migration/V81__apm_custom_metric_rule.sql`, moveseyee_fe `hooks/useApmCustomMetrics.ts`·`pages/application-monitoring/collectors/apmCustomMetricDisplay.ts`·`collectors/components/ApmDropCustomRuleCell.tsx`·`ApmCustomMetricRegisterModal.tsx`·`collectors/tabs/ApmCollectorCustomMetricsTab.tsx`·`collectors/components/ApmTokenIssueDrawer.tsx`·`services/customMetricSeries.ts`·`services/detail/tabs/ApmServiceCustomMetricsTab.tsx`·`types/apm.ts`·`services/apm.api.ts`, 계약 `C:/solutions/_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md`(v1.3, §7~§9), 설계 `C:/solutions/_workspace/features/apm/metric-allowlist/devdesign_apm-metric-allowlist-extension.md`(§8 결정 Q1~Q9)
reviewed_at: 2026-10-19
review_cycle: event-driven
deployment_scope: source
be_commit: a9080eb (master ff, 2026-10-19, 미푸시)
fe_commit: 258d747 (master ff, 2026-10-19, 미푸시)
latest_flyway: V81 (`V81__apm_custom_metric_rule.sql` — 테이블 2개 + 인덱스 1개, 기존 테이블 DDL 무변경. 다른 브랜치가 V76~V80 점유 중 — 병합 때 번호 충돌 재확인)
qa_evidence: BE 커스텀 지표 단위 81건·관련 기존 단위 통과, IT `ApmCustomMetricIT` 7·`ApmRetentionJobIT` 12·`ApmRollupJobIT` 10·`ApmMetricIngestAtomicityIT` 16 = 45/45(실 PG 5433), APM·라이선스·OTel 단위 회귀 2,271건 실패 0. FE tsc·`typecheck:contract`·eslint 0, jest 대상 13스위트 402/402. Codex 검수 BE v1 10건→v5 승인·FE v1 5건→v5 승인. 런타임(BE 기동·브라우저·다중 노드)은 미실시
---

# APM 커스텀 지표 허용목록 — 폐기 통계에서 받기·규칙 관리·서비스당 상한

> **이 문서로 답할 수 있는 질문** — 수집기 상태 화면의 폐기 사유 `NOT_ALLOWLISTED` 행에 생긴 "받기"는 무엇을 하고, 왜 이름을 직접 입력하는 칸은 없는가? 규칙을 켜면 데이터는 어디에 어떤 모양으로 저장되고, 롤업·보존·콜드 아카이브는 왜 코드 수정 없이 따라오는가? 상한 네 가지(규칙 20·서비스당 시계열 50·이름 127자·접힘 경고)는 각각 어디서 걸리고 넘으면 무엇이 되는가? "자리 원장"은 왜 규칙과 수명이 다르고, 규칙을 지워도 7일 동안 남는가? 규칙 조회가 실패하면 왜 60초 뒤 커스텀 지표를 전부 버리는가(fail-closed)? 같은 이름을 지우고 다시 만들면 종류·그래프는 어떻게 되는가? 서비스 상세 커스텀 지표 탭의 빈 칸이 "등록 전"·"보존 밖"·"미수신" 중 무엇인지 FE는 어떻게 가르는가? `APM_CUSTOM_METRIC_*` 오류 8종·폐기 사유 2종이 보이면 운영자는 무엇을 확인하는가?

> 한 줄 요약 — **수집기가 받아 주는 메트릭 이름은 자바 상수 표(`ApmMetricAllowlist`)에 박혀 있어, 고객이 자기 지표를 보내면 `NOT_ALLOWLISTED`로 버려졌고 열어 줄 길은 코드 수정·재배포뿐이었다. 이 기능은 관리자가 폐기 통계 표에서 그 이름을 골라 "받기"로 등록하면 다음 배치부터 기존 1분 테이블에 서비스·인스턴스별 합계 한 줄로 저장하고, 서비스당 50개 자리를 DB 원장으로 전역에 묶어 카디널리티 폭주를 막는다.** 1차는 이름만(차원 없음)이다. (Jira **ZM-155**)
>
> 🔴 **배포 상태** — 두 레포 모두 master에 ff 병합됐다(BE `a9080eb`·FE `258d747`, 2026-10-19). **2026-10-19 기준 로컬 master에만 있다(미푸시)**. 이 문서의 표에서 `현재`는 **master 소스에 구현됨**을 뜻하며, 어떤 런타임에서도 실측하지 않았다(§9). dev BE(:3000)는 이 코드 이전 상태이고 dev DB에 V81이 적용되지 않았다(재기동 시 자동 적용).

이 문서는 내부 독자(개발·QA·운영)를 위한 것이다. 사용자 안내 문구는 FE 로케일 `apm.collectors.custom_metrics.*`·`apm.service.custom_metrics.*`(kr/en)가 정본이다. 설계 결정의 상세 근거는 `_workspace/features/apm/metric-allowlist/devdesign_apm-metric-allowlist-extension.md` §4(상한)·§8(결정 Q1~Q9)에 있다.

## 1. 사용자 목표와 범위

- 해결하는 문제: 폐기 통계(`GET /apm/ingest/drops`)는 `NOT_ALLOWLISTED` 행을 보여 주며 스스로 "허용목록 확장 근거를 찾는 창구"라고 말했지만, 제품 안에 **확장 수단이 없었다**. 한편 허용목록을 그냥 열면 BE 게이트를 둔 이유(카디널리티 폭주로 1m 테이블·롤업·메모리 캐시가 커지는 것)가 사라진다. 그래서 "여는 절차"와 "상한"을 한 묶음으로 만들었다.

- 주 사용자: **APM 편집 권한자**(`apm.edit` — 역할의 `applicationMonitoring/apm` edit 칸, 관리자 역할은 권한 JSON과 무관하게 통과). 규칙 목록·받기·켜기/끄기·경고 해제·삭제가 전부 `apm.edit`. 서비스 상세의 커스텀 지표 탭은 `apm.view`(그 안의 "받기" 링크만 `apm.edit`). 🔴 역할 축(`useIsUserRoleAdmin`)으로 가르지 않는다 — 위임 계정이 막힌다(FE `useApmPermissions` 정본 주석).

- 착수 조건으로 확정한 결정 9개(2026-10-13, 설계 §8 ✅):

  | Q | 결정 | 근거 |
  |---|---|---|
  | Q1 | **이름만 — 차원 없음 고정.** 수신 속성을 버리고 서비스·인스턴스별 합계 1줄(`dims={}`) | 차원 선택 UX(§5 "가장 어려운 지점")와 후보 관측 기록(S1)을 2차로. 공수 절반·UX 위험 0·가치 절반 |
  | Q2 | 상한 L1 규칙 20 · **L5 서비스당 커스텀 시계열 50**(원안 200 → 50) · L8 접힘 50%/1h | 원안 200이면 최악 약 5.9GB/일(추정). 차원이 없어 L2(차원 키)·L4(규칙×서비스 조합)는 1차 무의미 |
  | Q3 | **기존 `apm_metric_1m`에 저장**(전용 테이블 기각) | 롤업 SQL이 이름과 무관해 1m에 들어오면 5m/1h 롤업·보존·콜드 아카이브(ZM-156)에 추가 코드 없이 합류 |
  | Q4 | 히스토그램 **1차 제외**(GAUGE·SUM만) | 서비스·SDK마다 경계가 다르면 롤업에서 `bounds_id`가 갈려 백분위를 합칠 수 없다 |
  | Q5 | 이름 **직접 입력 경로 없음** — 폐기 통계 `NOT_ALLOWLISTED` 행에서만 받기 | 오타 방어. 서버가 최근 7일 관측을 다시 확인 |
  | Q6 | 후보 관측 표본 값 — 1차 해당 없음 | Q1 |
  | Q7 | 공통 감사 체계 선행 안 함 — ZM-154·156처럼 **로그 기반**(`[APM-ALLOWLIST]`) | 공통 감사 테이블이 코드에 없다. 이력 테이블도 만들지 않음 |
  | Q8 | 수집기 yaml **자동 포함** — 규칙 저장 시 설정 생성의 `filter/metrics` 추가 정규식 기본값에 들어가고, 화면이 "다시 받아 배포" 안내 | 서버는 고객 yaml을 볼 수 없어 판정이 아니라 권고 |
  | Q9 | 다중 노드 전파 지연 **30초**(규칙 스냅샷 TTL) 수용 | 그 사이 노드마다 저장 여부가 다를 수 있다 |

- 포함:
  - **BE 규칙·관리 API**: `apm_custom_metric_rule`(V81) · EP 6개 `/apm/custom-metrics/rules*`(목록·등록·enable·disable·clear-warning·삭제) · 등록 판정 함수(`ApmCustomMetricNamePolicy`) 하나를 등록 API와 폐기 표 힌트(`rows[].customRule`)가 공유 · 예산 산식(`budget`) · 수집기 패턴(`collector`).
  - **BE 수신 관문**(`ApmCustomMetricGate`): 내장 허용목록 `find()`가 **비었을 때만** 들어가는 분기. 규칙 스냅샷(30초 TTL, 60초 fail-closed) → 자리 판정(DB 원장 `apm_custom_metric_admission`, 서비스당 50, 초과는 `__other__`로 접어 저장) → 종류 확정(첫 수신 종류, 다른 종류는 폐기) → 접힘 경고(L8, 저장은 계속).
  - **BE 조회 EP** `GET /apm/services/{uid}/custom-metrics` — 등록된 규칙 이름만, red-series와 같은 해상도 선택·보존 승격·포인트 예산, `overflow`(접힌 몫)는 count만.
  - **BE 부수 반영**: 폐기 사유 2종(`CUSTOM_SERIES_OVERFLOW`·`CUSTOM_KIND_UNSUPPORTED`) · `config-defaults.processors.filterMetricsExtra` · 설치 가이드 `customMetrics` + 조건부 안내 1줄 · 보존 배치 단계 `customMetricSeats`(7일 지난 자리 정리) · 오류 코드 8종.
  - **화면**(FE): 수집기 상태 탭 폐기 표의 **조치 칸**(받기 버튼·막힘 사유 툴팁·'잘림' 표시·확인 모달 — 예산 +1 재계산·수집기 재생성 안내) / 수집기 화면 **5번째 탭 "커스텀 지표 규칙"**(`?tab=custom_metrics` — 상태·스위치·경고 해제·삭제·n/20·예산·상한 요약·`seatServices`·`valueKind`) / 설치 가이드 탭 **재생성 배너** / 토큰 발급 창 **정규식 기본값 자동 채움**(dirty면 덮지 않음) / 서비스 상세 **커스텀 지표 탭**(`?tab=custom_metrics` — 카드·보존/해상도 배지·`__other__` 건수만·빈 이유 세 가지).
- 제외:
  - **차원 선택·후보 관측(S1)·표본 값**(Q1·Q6) — 2차. 규칙 테이블에 `dim_keys`·`max_series`·`kind` 컬럼이 없다(차원이 오면 새 V로 더한다).
  - **히스토그램**(Q4) — `CUSTOM_KIND_UNSUPPORTED`로 기록하고 버린다(상한 소비 없음).
  - **이름 직접 입력**(Q5) · **이력 테이블·이력 화면**(Q7) · **규칙별 접힘 비율·최근 7일 행 수**(이름으로 1m 7일 파티션 전체를 훑어야 해서 2차 — 계약 §8) · **`CUSTOM_SERIES_OVERFLOW`의 서비스별 분해**(1차는 사실상 발생하지 않아 보류).
  - **실시간 링버퍼**에 커스텀 지표를 넣지 않는다(SEEN 신호 포함) — 커스텀만 보내는 인스턴스는 실시간 기대 인스턴스 추정에서 빠진다.
  - **새 메뉴·라우트·전역 검색 항목 없음** — 수집기 화면(`apm-collectors`, 관리 콘솔 edit 축)의 하위 탭이라 진입점 5곳(사이드바·모바일·관리 콘솔·전역 검색·라우트) 모두 변경 없음.

## 2. 현재 상태

`부분` — 소스 구현·단위/IT·정적 검수(Codex BE v5·FE v5 승인)는 끝났고 master에 병합됐다. **런타임 실측은 0건**이다 — BE를 이 코드로 기동한 적이 없고(dev DB V81 미적용), 브라우저로 받기 → 규칙 탭 → 서비스 탭 → 발급 yaml에 정규식 포함까지의 흐름과 다중 노드 자리 경합은 미검증이다.

| 영역 | 상태 | 근거 |
|---|---|---|
| BE 규칙 테이블·관리 EP 6개·등록 판정·예산 | 현재 | `a9080eb`, `ApmCustomMetricRuleServiceTest` 12·`ApmCustomMetricNamePolicyTest` 23·`ApmCustomMetricApiMvcTest` 3 |
| BE 수신 관문(스냅샷·fail-closed·자리 원장·종류·접힘 경고·세대 검사) | 현재 | `ApmCustomMetricGateTest` 25·`MetricIngestorCustomMetricTest` 8·`ApmCustomMetricIT` 7 |
| BE 기존 수신 경로 불변 | 현재 | `MetricIngestorCustomMetricTest$BuiltinUnchanged`(R1 실측 페이로드 행 전 필드 문자열 동일·`IngestStats` 동일, 허용목록 밖 이름을 전부 열어도 내장 행 동일) |
| BE 롤업·보존·아카이브 자동 합류 | 현재 | `ApmRollupJobIT.customMetricRollsUpWithoutExtraCode`(규칙 2행+`__other__` 1행 → 5m·1h 합 12·`__other__` 3, 실 PG) · 보존·아카이브는 테이블 단위라 코드 확인만 |
| BE 조회 EP(`ceil(created_at)` 하한·자리 종류 우선·`overflow`) | 현재 | `ApmCustomMetricSeriesServiceTest` 4 |
| BE 수집기 설정 `filterMetricsExtra`·설치 가이드 안내 | 현재 | `ApmCustomMetricCollectorSyncTest` 3 |
| BE Codex 5회 반영(fail-closed 경계·DB 원장·배치 단위 락·캐시 커밋 후 게시·세대 검사) | 현재 | `features/apm/metric-allowlist/review_zm-155-be-metric-allowlist.md` v1~v5 |
| FE 조치 칸·확인 모달·규칙 탭·서비스 탭·재생성 배너·정규식 기본값 | 현재 | `258d747`, `apmCustomMetricDisplay.test.ts`·`ApmServiceCustomMetricsTab.test.tsx`·`apmCustomMetricHooks.test.tsx`·`ApmCollectorTokensTab.test.tsx` |
| FE Codex 5회 반영(값 종류 안내·`MIXED`·음수 축·dirty 보호·빈 이유 우선순위) | 현재 | `features/apm/metric-allowlist/review_zm-155-fe-metric-allowlist.md` v1~v5 |
| dev DB V81 적용·BE 재기동 | 계획 | 재기동은 사용자 지시 시에만 |
| 런타임 실측(받기→규칙→서비스 탭→yaml, 다중 노드 50/51 경계, fail-closed 60초) | 계획 | §9 미검증 |
| 차원 선택·후보 관측·히스토그램·규칙별 행 수·서비스별 overflow 분해 | 보류 | §10 |

## 3. 데이터 원천과 소유권

| 데이터 | 원천 | 읽기 | 쓰기 | cache/동기화 |
|---|---|---|---|---|
| 규칙(이름당 1행) | `apm_custom_metric_rule`(V81). 상태는 enum이 아니라 컬럼 조합 — `enabled=false`→`DISABLED`, `enabled ∧ warned_at IS NOT NULL`→`WARN`, 그 밖→`ACTIVE` | `ApmCustomMetricRuleService`(관리 EP) · `ApmCustomMetricGate`(30초마다 스냅샷) · 조회 EP · 수집기 설정·설치 가이드(켜진 규칙의 정규식) | `ApmCustomMetricRuleService`만(등록·enable·disable·clear-warning·삭제, 전부 `apm.edit`). 경고 기록은 관문이 조건부 UPDATE(`where id=? and updated_at=? and enabled and warned_at is null` — `updated_at`이 낙관적 CAS 버전 축) | 관문 스냅샷 TTL 30초(`REFRESH_TTL`) → 다중 노드 전파 최대 30초(Q9). 🔴 조회 실패가 **마지막 성공 + 60초**(`FAIL_CLOSED_AFTER`)를 넘기면 스냅샷을 비운다(fail-closed) — 그동안 커스텀 지표는 `NOT_ALLOWLISTED`. 재시도 5초 간격, 복구 시 INFO |
| 자리 원장(서비스×이름당 1행) | `apm_custom_metric_admission`(V81) — `value_kind NOT NULL`·`rule_id`(규칙 세대)·`first_admitted_at`·`last_seen_at`, PK `(service_id, metric_name)`, `last_seen_at` 인덱스 | 관문 `prepareBatch`(배치마다 서비스 ID **오름차순**으로 `pg_advisory_xact_lock` → 살아 있는 자리 조회 1 → 다중 행 `INSERT … ON CONFLICT` 1 = 서비스당 ≤3문장) · 캐시 적중은 `pg_advisory_xact_lock_shared` + 원장·규칙 세대 조회 1문장(`verifyCached`) · 규칙 목록 `seatServices`·`valueKind` 요약 · 조회 EP 종류 | 관문만(새 자리 배정·`last_seen_at` touch는 1시간마다, 같은 세대·종류 일치일 때만) · 보존 배치 `customMetricSeats`가 `last_seen_at < now − 7일` 행 삭제 | 🔴 **DB 원장이 정본** — 노드 메모리는 60초짜리 힌트(`SEAT_CACHE_TTL`, 서비스 512 LRU). 캐시는 **커밋된 결과만**(`afterCompletion(COMMITTED)`에 게시, 롤백이면 비움). 처음 보는 이름·만료 근접 자리·세대 불일치는 반드시 원장에 다시 묻는다. 🔴 규칙과 수명이 다르다 — 규칙을 지워도 자리는 마지막 관측 뒤 7일(`SEAT_RETENTION`) 남아 "지우고 다른 이름 등록"으로 50을 우회할 수 없다 |
| 지표 데이터 | 기존 `apm_metric_1m`(Q3) — `metric = 규칙 이름`, `dims = {}`, 인스턴스 축은 그대로. 접힌 몫은 `metric = "__other__"`(`OVERFLOW_METRIC`) 한 줄 | 조회 EP(`ApmCustomMetricSeriesService`)·롤업·보존·콜드 아카이브(전부 이름 무관) | `MetricIngestor.toCustomRow` — 규칙 저장 시 파티션 준비 필터에 활성 규칙 포함 | 롤업 5m/1h는 `group by service_id, metric, dims_hash`라 추가 코드 없음. 🔴 `__other__`는 단위가 다른 지표가 섞여 **count만 의미**(`valueKind: "MIXED"`) |
| 칸 정렬 | 1m 적재 `ApmMetric1mStore.bucketOf`·롤업 `ApmRollupService.floor`·red-series `floorTo`·조회 EP 하한 `ceil(created_at)` | 모두 **서버 기본 시간대(`ZoneId.systemDefault()`) 벽시계 기준**(epoch 아님) | — | 🔴 30·45분 오프셋 TZ 서버에서는 1h 칸이 epoch와 어긋난다 → **FE는 칸 경계를 직접 계산하지 않고 응답 `points[].ts`를 쓴다**(계약 §4). BE를 epoch로 바꾸지 않은 이유: 저장 버킷 자체가 서버 시간대라 조회 EP만 바꾸면 하한과 실제 칸이 어긋난다 |
| 폐기 통계 | 기존 메모리 → 10초 묶음 저장(`ApmIngestDropQueryService`) | 폐기 표 `rows[].customRule`(등록 가능 여부·막힘 사유·규칙 id/상태)·`metricNameTruncated` · 등록 API의 "최근 7일 관측" 확인(Q5) | 관문이 새 사유 2종을 센다. `CUSTOM_SERIES_OVERFLOW`는 저장 이름 `<metric>@svc:<id>`, 응답에서는 접미를 떼고 합친다 | 🔴 처음 들어온 이름은 최대 10초 뒤에 등록 가능해진다. 규칙이 켜지는 순간 그 이름의 `NOT_ALLOWLISTED` 카운터는 멈추지만 누적 행은 남는다(`RULE_EXISTS`) |
| 접힘 감시 표(L8) | 관문 메모리 — 규칙별 1분 창(수신 시각 기준), 전체 상한 10,000(`MAX_FOLD_WATCH`), 1시간 미사용 만료, 스냅샷 교체 때 없는 이름·세대 바뀐 이름 정리 | 관문만 | 관문만 | 🔴 **노드 표본**이다(전역 집계 없음) — 그래서 정지가 아니라 경고(R5). 키가 규칙 이름이라 실제 크기 ≤ 20 |
| 수집기 설정·설치 가이드 | `ApmSetting` 키 `KEY_CUSTOM_METRIC_RULES_CHANGED_AT`(규칙 변경 워터마크 — 자동 경고는 밀지 않는다) | `config-defaults.processors.filterMetricsExtra`(켜진 규칙의 `^이름$` 정규식) · `install-guide.customMetrics{patterns, rulesChangedAtMs, regenerationRequired}` + `notices` 끝 INFO `custom-metric-rules-changed` | 규칙 서비스(사람의 변경마다) | `regenerationRequired`는 **권고**("규칙이 바뀐 적이 있다") — 서버는 고객 yaml을 볼 수 없다. FE 발급 창은 열림마다 1회 `processors.filterMetrics.extra` 기본값으로 채우고, 사용자가 행을 손댔으면(dirty) 늦은 응답이 덮지 않는다 |
| 감사 이력 | 애플리케이션 로그 `[APM-ALLOWLIST] action=… user=… id=… metric=… status=…` WARN 1줄(값 캡처 후 `afterCommit`에서만) | — | 규칙 서비스(등록·켜기·끄기·해제·삭제) · 관문(`warn-decided` 판정/`warn` 기록 2줄, actor `system`) | 테이블 없음(Q7). 이름·사용자는 `LogSafe`로 제어 문자 이스케이프 |

### 3.1 V81 — 테이블 2개 + 인덱스 1개(추가만, 멱등)

| 테이블 | 역할 | 핵심 제약 |
|---|---|---|
| `apm_custom_metric_rule` | 규칙 원본. `metric_name`(128)·`enabled`·`warned_at`·`warn_reason`·`created_by/at`·`updated_by/at` | `UNIQUE(metric_name)`. 🔴 시각 컬럼에 `DEFAULT now()` 없음(V30 교훈 — 서버가 채운다). `id bigserial`이라 **새 세대가 항상 더 크다**(세대 비교의 근거) |
| `apm_custom_metric_admission` | 서비스당 시계열 상한(L5)의 전역·영속 원장 — 어느 서비스가 어느 이름으로 자리를 차지했나, 그 시계열의 종류, 어느 규칙 세대인가 | PK `(service_id, metric_name)`, `value_kind NOT NULL`, `rule_id NOT NULL`. 인덱스 `last_seen_at`(보존 정리용. 수신 판정은 PK 선두) |

롤백 SQL: `DROP TABLE IF EXISTS apm_custom_metric_admission, apm_custom_metric_rule;`(기존 테이블 DDL 무변경). `apm_metric_1m`에 이미 저장된 커스텀 행은 보존 정리가 지운다.

### 3.2 상한 4종 — 어디서 걸리고 넘으면 무엇이 되나

| # | 상한 | 값 | 걸리는 때 | 초과 시 |
|---|---|---|---|---|
| L1 | 규칙 수(활성·꺼짐·경고 모두) | 20(`MAX_RULES`) | 등록 — advisory lock 안에서 `count()` | `APM_CUSTOM_METRIC_LIMIT`. 19개→20번째 허용, 20개→21번째 거절 |
| L5 | 서비스당 커스텀 시계열(인스턴스 축 제외) | 50(`DEFAULT_SERIES_LIMIT`) | 수신 — 배치 안 처음 보는 (서비스, 이름) | `__other__` 한 줄로 **접어서 저장**(손실 아님) + 사유 `CUSTOM_SERIES_OVERFLOW`. 🔴 DB 원장 기준 — 전 노드 공통·재기동 무관·규칙 교체 무관. 자리는 마지막 관측 뒤 7일 유지 |
| L6 | 이름 길이 | 127(등록) | 등록 | 129자↑ `NAME_INVALID`, **정확히 128자 `NAME_TRUNCATED`**(폐기 통계 기록기가 128자에서 자르므로 원래 128자인지 잘린 것인지 가를 수 없다 — R8). 폐기 표 행 `metricNameTruncated=true`면 '잘림' 표시 + 받기 비활성 |
| L8 | 접힘 **경고** | 접힘 비율 >50%가 60분(`WARN_SUSTAIN`) | 수신 — 규칙별 1분 창. 접힘 우세 분이 처음 나온 분 시작~최근 접힘 우세 분 끝 ≥ 60분이고 그 사이 ≤50% 분이 없으면. 트래픽 없는 분은 중립 | 규칙 `WARN`(`warned_at`·`warn_reason` "이 서버 노드 기준") — 🔴 **저장은 계속한다**. 해제는 사람만(`clear-warning`), 원인이 그대로면 60분 뒤 다시 경고(확인 모달이 그 사실을 말한다) |

⚠️ 1차(차원 없음)에서는 규칙 하나 = 서비스당 시계열 하나라 **L5(50) > L1(20)** — 평상시 접힘·경고는 일어나지 않는다. 걸리는 길은 7일 안에 규칙 삭제·다른 이름 재등록이 반복돼 한 서비스의 자리가 50을 넘을 때뿐이다. 2차(차원 선택)에서 본체가 되는 장치를 1차에 미리 깔아 둔 것이고, 화면은 상한·접힘·경고를 "있을 수 있는 상태"로 처리한다.

### 3.3 값 종류(`valueKind`)와 규칙 세대

- 종류는 **규칙이 아니라 자리(서비스×이름)에 있다**(N7). 첫 수신 종류(GAUGE·UPDOWN·COUNTER)로 트랜잭션 안 CAS(`value_kind is null`)로 확정하고, 다른 종류의 포인트는 `CUSTOM_KIND_UNSUPPORTED`(마지막 관측도 갱신하지 않음). 다른 노드가 먼저 정했으면 그 값이 이긴다. 히스토그램은 종류 확정 전에 거절된다.
- 자리에 **규칙 세대(`rule_id`)** 가 붙는다(v1.3). 같은 이름을 지우고 다시 만들면 새 세대(id가 더 큼)가 같은 자리를 **넘겨받으며 종류·첫 배정 시각을 새로 쓴다**. 옛 규칙 스냅샷을 든 노드(전파 창 30초)는 캐시 적중 경로에서도 원장·규칙 테이블의 지금 id와 비교해 **저장하지 못하고 `NOT_ALLOWLISTED`로 센다**(폐기 표에 잠깐 보일 수 있다). 규칙 재조회로 세대 변화를 알면 자리 캐시를 즉시 비운다.
- 조회 EP는 규칙 `created_at`이 든 칸을 버리고 **다음 완전한 칸부터**(ceil) 준다 — 그 칸에는 같은 이름 지난 세대의 값이 섞였을 수 있다. 1h 해상도면 등록 후 최대 1시간 비어 보인다.
- 규칙 목록의 `valueKind`는 살아 있는 자리(7일 안)의 요약 — 서비스마다 다르면 `MIXED`, 자리가 없으면 null. 조회 EP의 `valueKind`는 그 서비스 시계열의 자리 값(없으면 저장 행에서 추정). FE는 COUNTER→`sum`(증가량, 초당은 `sum/step`), GAUGE·UPDOWN→`avg`(음수 축 허용)로 그리고, 서비스끼리 종류가 다르면 "서비스마다 다름" 툴팁을 단다.

## 4. 사용자 흐름

### 4.1 받기 — 수집기 › 상태 탭 › 수집 사유 표

```text
1. 폐기 표의 reason=NOT_ALLOWLISTED ∧ signal=METRIC 행에만 customRule 객체가 실린다(그 밖은 null → 조치 칸 비움)
2. registrable=true → [받기] 버튼. false → 비활성 + blockedReason 툴팁:
   RULE_EXISTS(→ "규칙 있음" 링크로 규칙 탭) · NAME_INVALID · NAME_TRUNCATED('잘림') · BUILTIN · RESERVED(런타임 패밀리 접두)
   · NOT_RECENT(lastSeenAt이 7일 전) · LIMIT_REACHED(20개)
   apm.edit 없음 → 버튼 대신 "관리자에게 요청" 안내(방어용 — 수집기 화면 자체가 apm.edit 게이트)
3. [받기] → 확인 모달: 이름 · 저장 모양("서비스·인스턴스별 합계 1줄, 속성 없음") · 예산(budget에 activeRules+1을 넣어 서버 산식 재계산 —
   최악 하루 행 수·바이트, 1m 7일 바이트) · "수집기 설정을 다시 받아 배포해야 수집기 필터를 통과" · 상한 요약(limits)
4. 확인 → POST /apm/custom-metrics/rules {metricName: 행의 metricName 그대로(공백 정리 안 함)}
   성공 → 규칙·폐기 통계·설정 기본값·설치 가이드·시계열 쿼리 무효화, 행이 RULE_EXISTS로 바뀜(누적 행은 남는다)
   실패 → errorCode별 문구(§5.2). 등록 판정은 폐기 표 힌트와 같은 함수라 "버튼은 켜졌는데 서버가 거절"은 그 사이 상태가 바뀐 경우만
```

### 4.2 규칙 탭 — 수집기 › 커스텀 지표 규칙(`?tab=custom_metrics`)

| 요소 | 내용 | 확인 |
|---|---|---|
| 상한 줄 | `n/20` 규칙 · 서비스당 50 시계열 · 이름 127자 · 자리 7일 · 접힘 경고 50%/60분 · fail-closed 60초(`limits`에서) | — |
| 예산 카드 | `budget` — 켜진 규칙(**경고 포함**, DISABLED 제외) × 살아 있는 인스턴스 × 1,440 × 686B(최악치) | — |
| 행 | 이름 · 상태 배지(`ACTIVE`/`WARN`/`DISABLED`, `enabled` 스위치는 따로) · `valueKind`(`MIXED`면 "서비스마다 다름") · `seatServices`("저장 중" 서비스 수)/50 · 경고 시각·사유 · 등록자/시각 · 정규식 | — |
| 켜기/끄기 | `enable`/`disable`(멱등). 끄면 저장을 멈추고 그 이름은 다시 `NOT_ALLOWLISTED`로 센다(저장된 행은 남는다) | 없음 |
| 경고 해제 | `clear-warning` | 확인 모달 — "원인(서비스당 50 초과)이 그대로면 60분 뒤 다시 경고" |
| 삭제 | `DELETE` — 저장 중지만. 저장된 행은 보존 정리가 지운다(소급 삭제 없음). 🔴 서비스별 자리는 7일 남는다 | 확인 모달 — 자리 유지·같은 이름 재등록 시 새 세대 안내 |
| 재생성 배너 | `collector.regenerationRequired=true`면 탭 상단 경고 + 설치 가이드 탭 배너 + 서버 `notices` 끝 INFO(두 곳에 같은 사실 — 접힐 수 있는 목록 끝이라 FE가 위에 한 번 더) | — |

### 4.3 서비스 상세 › 커스텀 지표 탭(`?tab=custom_metrics`, `apm.view`)

`GET /apm/services/{uid}/custom-metrics?from&to&step` → 규칙마다 카드(등록 순, 꺼짐·경고 포함). 보존/해상도 배지는 ZM-152 `ApmRetentionContext`와 같은 규약. `overflow`는 "기타(여러 지표 합)" 카드로 **건수만**(값 축 숨김).

빈 카드의 이유는 세 가지를 **이 순서로** 가른다(`customMetricSeries.ts` `apmCustomMetricEmptyReason`, Codex FE v4·v5):

1. **보존 밖** — 창 전체가 `oldestAvailableMs` 이전.
2. **규칙 등록 전 구간(등록 직후 포함)** — 응답에 `ts ≥ ruleCreatedAtMs`인 점이 없다. 점이 하나라도 있으면(서버는 빈 칸도 `count:0` 점으로 준다) 등록 시각과 창의 앞뒤와 무관하게 이것. 점이 아예 없으면 응답 `step`(승격 후 해상도)으로만 보정 — `창 끝 − 등록 시각 < step`이면 등록 직후, 아니면 3.
3. **미수신** — 등록 뒤 칸이 있는데 `received:false`. "수집기 설정을 다시 받아 배포했는지" 안내.

창이 등록 시각을 가로지르면 "등록 전 구간은 비어 있음" 각주. 🔴 FE는 칸 경계를 **직접 계산하지 않는다** — epoch `ceil`은 서버 시간대 정렬과 어긋날 수 있어 제거했다(§3 칸 정렬).

### 4.4 수집기 설정 — 발급 창·설치 가이드

토큰 발급 Drawer가 열릴 때 `config-defaults.processors.filterMetricsExtra`를 프로세서 패널의 `filter/metrics` 추가 목록 기본값으로 채워 생성 요청 `processors.filterMetrics.extra`에 싣는다(열림마다 1회, dirty면 덮지 않음). 전부 기본값이면 `processors`를 싣지 않는 기존 규칙은 그대로. 🔴 구현 중 잡은 결함: 프로세서 패널(Collapse)을 펼치지 않으면 Form.List가 등록되지 않아 값이 빠지고, 필드에서 채우면 Drawer 초기화(`resetFields`)가 같은 커밋에서 지웠다 → 패널 `forceRender` + 채우기를 초기화 효과 **뒤**로.

### 4.5 수신 — 배치마다(`MetricIngestPipeline` → `MetricIngestor`)

```text
0. 배치 전 스냅샷 갱신(30초 TTL). 실패 중이면 "마지막 성공 + 60초"를 먼저 보고 넘었으면 즉시 비운다(fail-closed)
1. 포인트마다 ApmMetricAllowlist.find(name) — 내장이면 종전 경로 그대로(관문을 거치지 않는다)
   비었을 때만 → 관문: 규칙 없음/꺼짐 → NOT_ALLOWLISTED · 히스토그램 → CUSTOM_KIND_UNSUPPORTED · 후보로 모은다
2. prepareBatch — 배치의 (서비스, 이름, 첫 종류)를 모아 서비스 ID 오름차순으로:
   캐시 적중(60초 안·모든 자리가 믿을 만함) → 공유 락 + 원장·규칙 세대 조회 1문장 → 세대 일치면 STORE/FOLD 판정
   그 밖 → 배타 락 1 + 살아 있는 자리 조회 1 + 다중 행 UPSERT 1(새 자리·touch 함께)
   살아 있는 자리 50 → 새 이름은 FOLD(__other__), 자리 세대가 스냅샷보다 새것 → NONE(NOT_ALLOWLISTED), 옛것 → 넘겨받기
3. 행 생성 — STORE: metric=이름·dims={} / FOLD: metric=__other__ + CUSTOM_SERIES_OVERFLOW(<이름>@svc:<id>) / 종류 불일치: CUSTOM_KIND_UNSUPPORTED
4. 커밋 → afterCompletion(COMMITTED)에 캐시 게시(롤백이면 비움) → finally에서 접힘 경고 판정분 조건부 UPDATE(버전 CAS)
```

### 4.6 권한 없음 · 빈 데이터 · 외부 오류

- `apm.edit` 없음: 규칙 EP 전부 HTTP 200 + body `code:403`. 조치 칸은 "관리자에게 요청", 규칙 탭은 수집기 화면 게이트에서 막힌다. `apm.view` 없음: 서비스 탭 자체가 없다. 라이선스 `Feature.APM` 없음: 기존 라이선스 계약의 403. 미인증은 실제 HTTP 401.
- 규칙 0개: 규칙 탭은 상한 줄·예산만, 서비스 탭은 빈 상태 + (`apm.edit`면) "수집기 상태에서 받기" 링크. 조회 EP `metrics: []`.
- 규칙 조회 DB 장애: 60초 뒤 커스텀 지표 전부 `NOT_ALLOWLISTED`(내장 무영향). 복구되면 다음 스냅샷부터 재개. 폐기 표에 `NOT_ALLOWLISTED`가 갑자기 늘면 이 경우를 의심한다.
- 자리 판정 DB 장애: 배치 트랜잭션이 던져 그 배치가 실패한다(기존 수신 원자성 그대로 — `ApmMetricIngestAtomicityIT` 16).
- `seatServices=0`인 규칙: 아직 어느 서비스도 저장하지 않았다 — 수집기 설정 재생성 전이거나 그 이름을 보내지 않는다.

## 5. API 계약

전 EP `@VisitorIdCheck`(헤더 `x-visitor-id` + 인증 쿠키), `@RequiresFeature(APM)`. 응답은 평소 envelope(`{status, code, data}`). 시각은 **epoch ms(Long)**. 상세 DTO는 계약서 §2~§6과 `types/apm.ts`·픽스처 `apmCustomMetricContractSample.ts`가 정본이다.

| Method | Path | 요청 | 응답 `data` | 권한 |
|---|---|---|---|---|
| GET | `/apm/custom-metrics/rules` | — | `{rules[], limits, budget, collector}` | `apm.edit` |
| POST | `/apm/custom-metrics/rules` | `{metricName}`(폐기 표 값 그대로) | `ApmCustomMetricRuleDto`(`status: ACTIVE`) | `apm.edit` |
| POST | `/apm/custom-metrics/rules/{id}/enable` · `/disable` | — | `ApmCustomMetricRuleDto`(멱등) | `apm.edit` |
| POST | `/apm/custom-metrics/rules/{id}/clear-warning` | — | `ApmCustomMetricRuleDto`(경고 아니면 멱등) | `apm.edit` |
| DELETE | `/apm/custom-metrics/rules/{id}` | — | `null` | `apm.edit` |
| GET | `/apm/services/{uid}/custom-metrics` | `from`·`to`(ms)·`step`(60·300·3600, 생략 시 창 길이로) | `{step, oldestAvailableMs, metrics[{name, status, ruleCreatedAtMs, received, valueKind, points[{ts,count,sum,avg,min,max}]}], overflow}` | `apm.view` |
| GET | `/apm/ingest/drops`(기존) | — | `rows[].customRule{registrable, blockedReason, ruleId, ruleStatus}`·`rows[].metricNameTruncated` **추가** | `apm.edit` |
| GET | `/apm/collectors/config-defaults`(기존) | — | `processors.filterMetricsExtra: string[]` **추가** | `apm.edit` |
| GET | `/apm/install-guide`(기존) | — | `customMetrics{patterns, rulesChangedAtMs, regenerationRequired}` **추가** + `notices` 끝 INFO 1줄 | `apm.edit` |

### 5.1 특이 계약

- `rules[].status`가 배지 정본, `enabled`는 스위치 값(WARN이면 true). 둘을 따로 그린다.
- `budget.activeRules` = **켜진 규칙 수(ACTIVE + WARN)** — WARN도 저장을 계속하기 때문. 필드 이름은 호환 때문에 그대로. 산식 `rowsPerDayMax = liveInstances × min(activeRules, 50) × 1440`, `bytesPerDayMax = × 686`, `bytesRaw1mMax = × raw1mDays`. 집계 실패 시 0(목록은 나간다).
- `collector.patterns`는 켜진(경고 포함) 규칙의 `^이름$`. `regenerationRequired`는 권고 — `rulesChangedAtMs` 이후에 받은 설정이면 무시해도 된다.
- 조회 EP `step`은 요청과 다를 수 있다(보존 승격). `points[]`는 빈 칸도 점이 있다(`count:0`, 나머지 null — 0은 측정값). `overflow`는 `status`·`ruleCreatedAtMs` null, `valueKind:"MIXED"`, 창에 데이터 없으면 null.
- 등록 판정 순서(앞에서 걸리면 끝): 문법(`^[A-Za-z][A-Za-z0-9_./-]*$`·129자↑·128자·내장/별칭/`otelcol*`/`moveseye.*`·런타임 패밀리 접두) → 중복 → 최근 7일 `NOT_ALLOWLISTED`·`METRIC` 관측 → 20개.

### 5.2 오류 코드(전부 HTTP 200 + body code)

| `errorCode` | body `code` | 뜻 | 운영자가 보는 곳 |
|---|---|---|---|
| `APM_CUSTOM_METRIC_NAME_INVALID` | 400 | 빈 이름·129자 이상·문법 밖 | 폐기 표 힌트 `NAME_INVALID` |
| `APM_CUSTOM_METRIC_NAME_TRUNCATED` | 400 | 정확히 128자 — 잘린 이름일 수 있어 등록 거절 | 힌트 `NAME_TRUNCATED` + 행 '잘림'. 수집기 쪽에서 이름을 줄여야 한다 |
| `APM_CUSTOM_METRIC_BUILTIN` | 400 | 내장 허용목록·구 별칭·`otelcol*`·`moveseye.*` | 힌트 `BUILTIN`. 내장이면 이미 받고 있다 — 다른 사유를 본다 |
| `APM_CUSTOM_METRIC_RESERVED` | 400 | 런타임 탭 패밀리 접두(`jvm.`·`dotnet.`·`process.runtime.dotnet.`·`nodejs.`·`v8js.`·`process.runtime.cpython.`·`python.`·`go.`) | 힌트 `RESERVED`. 런타임 탭이 차원 없는 행을 자기 슬롯 규약으로 오독하고 패밀리 투표를 뒤집으므로 막는다(ZM-152 정합). 런타임 탭 `not_ingestible` 안내("제품 팀에 전달")가 여전히 맞다 |
| `APM_CUSTOM_METRIC_NOT_OBSERVED` | 400 | 최근 7일 폐기 통계에 없음 | 힌트 `NOT_RECENT`. 10초 묶음 저장 지연 가능 |
| `APM_CUSTOM_METRIC_DUPLICATE` | 409 | 같은 이름 규칙 존재 | 힌트 `RULE_EXISTS` → 규칙 탭 |
| `APM_CUSTOM_METRIC_LIMIT` | 400 | 규칙 20개 | 힌트 `LIMIT_REACHED`. 안 쓰는 규칙 삭제 |
| `APM_CUSTOM_METRIC_NOT_FOUND` | 404 | 없는 id(enable·disable·clear-warning·삭제) | 목록 새로고침 |

폐기 사유(폐기 표·`/apm/ingest/drops/by-service`에 자동 합산):

| 사유 | 손실 | 뜻 |
|---|---|---|
| `CUSTOM_SERIES_OVERFLOW` | **아님**(접혀서 저장) | 서비스당 50 자리 초과. 어느 서비스인지는 1차 응답에 없다 |
| `CUSTOM_KIND_UNSUPPORTED` | 손실 | 히스토그램, 또는 자리에 확정된 종류와 다른 종류 |

## 6. 상태·동시성·실패

- 상태 전이(규칙): `ACTIVE ⇄ DISABLED`(enable/disable) · `ACTIVE → WARN`(관문, 버전 CAS) · `WARN → ACTIVE`(clear-warning, `updated_at` 갱신 — 해제 전에 계산돼 아직 기록 안 된 경고는 버려진다) · `WARN → DISABLED`(disable) · 삭제(행 제거, 자리는 남음).
- 상태 전이(자리): 없음 → 배정(종류·세대·첫 시각) → touch(1시간마다, 같은 세대·종류일 때만) → 7일 미관측 → 보존 배치 삭제. 세대 이관 = 같은 행을 새 `rule_id`·종류·첫 시각으로 덮음.
- idempotency: enable/disable/clear-warning 멱등. 등록은 `UNIQUE(metric_name)` + 중복 판정. 자리 UPSERT는 `ON CONFLICT`. 경고 기록은 조건부 UPDATE라 중복 기록 없음.
- 동시 실행:
  - 등록 상한(L1)은 `pg_advisory_xact_lock` 안에서 셈 — 두 관리자가 동시에 20번째를 만들면 하나만 성공.
  - 자리 판정은 배치마다 서비스 ID **오름차순** 락(교착 방지 — IT `crossOrderedBatchesDoNotDeadlock`: [1,2]·[2,1] 동시 → 둘 다 완료). 공유 락을 배타로 **승격하지 않는다**(두 배치가 같이 올리면 교착) — 확인이 실패한 이름은 이번 배치에서 접거나 캐시를 비우고 다음 배치가 배타 경로로 다시 판정.
  - 🔴 advisory lock·행 잠금은 JVM 모니터 밖에서 잡는다(모니터↔PG 잠금 교착 방지).
  - 같은 서비스의 **새 이름**이 동시에 오는 배치끼리는 서비스 락으로 직렬화된다(이후는 캐시).
  - 사람의 저장(켜기/끄기/해제)은 전체 컬럼 UPDATE라 같은 순간 기록된 시스템 경고를 덮을 수 있다 — 사람의 결정이 이기는 쪽이라 수용.
- retry/timeout: 규칙 스냅샷 실패 재시도 5초, 60초 뒤 fail-closed. 자리 판정 실패는 배치 실패(수집기가 재전송). 다중 노드 전파 30초.
- partial failure: 배치 안 일부 이름만 판정 실패 → 그 이름은 NONE/FOLD, 나머지는 저장. 캐시는 커밋 뒤에만 게시되므로 롤백된 자리가 다른 노드의 자리를 가로채지 않는다(IT `rolledBackSeatIsNotCached`: 50번째 롤백 → 다른 노드가 50번째 → 롤백 노드는 원장에 다시 묻고 접는다).

### 6.1 기존 수신 경로 불변 — 증명 방식

커스텀 분기는 `ApmMetricAllowlist.find()`가 **비었을 때만** 들어간다. 정적 `find()`와 11개 소비처는 무수정. 등록 판정이 내장 이름·별칭·`otelcol`을 거부하므로 순서 역전도 불가(이중 방어). 새 협력자는 `@Autowired(required=false)` 세터 주입이라 기존 테스트 조립이 그대로 선다. `MetricIngestorCustomMetricTest$BuiltinUnchanged`: R1 실측 페이로드(앱 31종 + 수집기 자기 메트릭)를 관문 없는 조립과 무관한 규칙이 있는 조립에 넣어 **행 전 필드(배열 포함)를 문자열로 펼쳐 순서까지 동일**, `IngestStats` 재귀 비교 동일. 픽스처의 허용목록 밖 이름을 전부 규칙으로 열어도 내장 지표 행·내장 쪽 사유 카운트 동일.

### 6.2 fail-closed 목록

| 상황 | 동작 |
|---|---|
| 규칙 조회 실패가 마지막 성공 + 60초 초과 | 스냅샷 비움 → 커스텀 전부 `NOT_ALLOWLISTED`(내장 무영향) |
| 한 번도 규칙을 못 읽음 | 처음부터 빈 스냅샷 |
| 자리 세대가 스냅샷보다 새것(옛 노드) | `NONE` → `NOT_ALLOWLISTED`(저장 금지) |
| 규칙이 지워졌거나 지금 id ≠ 스냅샷 id(캐시 적중 경로 포함) | 같음 — 넘겨받기 **전에도** 차단 |
| 캐시의 어느 자리라도 만료 근접 | "가득 차서 접는다" 판단을 캐시로 하지 않고 원장에 묻는다 |
| 종류 불일치 | 저장·touch 모두 안 함 → `CUSTOM_KIND_UNSUPPORTED` |

### 6.3 비용(원장 SQL 수)

| 경우 | 문장 |
|---|---|
| 처음 보는 서비스·캐시 만료 | 2~3(배타 락·조회·필요 시 UPSERT) |
| 캐시 적중(60초 안) | **2**(공유 락·세대 확인 조회) — v3의 0에서 바뀜, 세대 정확성의 대가(P1) |
| 서비스 N개 cold | 3N(선형, 단위 테스트 규칙 20 × 서비스 3 = 9) |

기동 시 전 서비스 preload는 하지 않는다(의도적 편차) — 배치가 서비스 단위로 한 번에 로드하므로 cold start도 서비스당 3문장이고, preload는 오지 않을 서비스까지 읽는다.

## 7. 권한과 보안

- 기능 permission: 규칙 관리 EP 6개 `apm.edit`(`ApmAccessChecker.requireEdit`), 조회 EP `apm.view`(`requireRead`). 관리자 역할은 권한 JSON 무관 통과. FE도 같은 축(`useApmPermissions().canEdit`). 라이선스 `Feature.APM` 필수.
- 데이터 범위: 규칙은 전역(서비스 구분 없음). 조회 EP는 서비스 uid 단위. 자리 원장은 서비스 id 단위.
- 감사 로그: `[APM-ALLOWLIST]` WARN — 등록·켜기·끄기·해제·삭제(`user`), 접힘 경고 판정/기록(`actor=system`). 커밋 뒤에만 출력. 이름·사용자는 `LogSafe` 이스케이프. 🔴 이력 테이블·화면 없음(Q7).
- secret/개인정보: 1차는 차원을 버리므로 속성 값(개인정보 가능)이 저장되지 않는다. 메트릭 이름은 수집기가 보낸 원문이며 128자에서 잘려 폐기 통계에 남는다. 폐기 통계 메모리 카운터는 ZM-152와 같은 특성(재기동 시 0부터, 노드 단위).
- 입력 검증: 이름 문법 정규식 + 길이 + 내장/예약 접두 거절. 폐기 표 값 그대로 보내는 규약이라 공백 정리 안 함(수신 원문과 일치해야 저장된다).

## 8. 운영

- 설정·환경변수: 없음. 상한·TTL은 전부 코드 상수(`MAX_RULES` 20·`DEFAULT_SERIES_LIMIT` 50·`REFRESH_TTL` 30초·`FAIL_CLOSED_AFTER` 60초·`SEAT_CACHE_TTL` 60초·`SEAT_RETENTION` 7일·`WARN_SUSTAIN` 60분·`MAX_FOLD_WATCH` 10,000·`MAX_TRACKED_SERVICES` 512·`TOUCH_EVERY` 1시간)이고 응답 `limits`로 화면에 내려간다. 🔴 자리 유지 7일은 1m 원시 보존 기본값과 같은 상수이지 보존 설정을 따라가지 않는다 — 1m 보존을 7일보다 짧게 바꾸면 자리가 데이터보다 오래 남는다(무해), 길게 바꾸면 조회 EP의 종류 추정이 저장 행 폴백으로 간다.
- metric/log: `[APM-ALLOWLIST]` 로그 · 폐기 통계 사유 `CUSTOM_SERIES_OVERFLOW`·`CUSTOM_KIND_UNSUPPORTED`·`NOT_ALLOWLISTED` · 규칙 `WARN` 상태 · `seatServices`. 보존 잡 요약에 단계 `customMetricSeats=N`.
- 장애 증상과 복구:
  - 규칙을 켰는데 `seatServices=0`·서비스 탭 "미수신" → 수집기 설정을 다시 받아 배포했는지(`regenerationRequired`). 수집기 `filter/metrics` 추가 정규식에 이름이 있어야 수집기를 통과한다.
  - 폐기 표 `NOT_ALLOWLISTED`가 규칙 있는 이름에 갑자기 쌓임 → ① 규칙 조회 DB 장애(fail-closed, 로그 WARN "fail-closed") ② 재등록 직후 옛 노드 전파 창(30초, 저절로 해소) ③ 규칙을 끈 상태.
  - `CUSTOM_KIND_UNSUPPORTED` → 히스토그램을 보내고 있거나, 같은 이름을 서비스가 다른 종류로 보낸다(자리 종류는 첫 수신으로 고정 — 바꾸려면 규칙 삭제 후 7일 뒤 재등록, 또는 다른 이름).
  - `WARN` 규칙 → 1차에서는 7일 안 규칙 삭제·재등록 반복이 원인. 해제 전 원인을 없애지 않으면 60분 뒤 재경고.
  - 다중 노드에서 노드마다 저장 여부가 다름 → 30초 전파 창. 30초 넘게 지속되면 그 노드의 규칙 조회 실패를 의심.
- migration/rollback: V81 추가만(테이블 2 + 인덱스 1). 롤백은 두 테이블 DROP — 코드도 함께 되돌려야 한다(옛 코드는 테이블을 모르므로 테이블만 남는 롤백은 무해). `apm_metric_1m`의 커스텀 행·`__other__` 행은 보존 정리가 지운다. 🔴 다른 브랜치가 V76~V80을 점유 중(2026-10-13 확인) — 그쪽이 먼저 병합되면 번호 충돌 재확인.
- 수집기 쪽: 규칙은 서버 저장만 바꾼다. 수집기가 그 이름을 서버로 보내지 않으면(기본 필터가 떨어뜨림) 아무 일도 없다 — 그래서 Q8 자동 포함 + 재생성 안내가 짝으로 있다.

## 9. 검증 근거

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위(BE) | `ApmCustomMetricGateTest` 25(50/51 경계·fail-closed 60초 정확(45초 감지→60초 열림·60.001초 닫힘)·재시도 5초·감시 표 정리·버전 바뀐 판정 폐기·락 순서 30·5·17→5·17·30·배치 ≤3문장(cold 3→적중 2→만료 2)·종류 불일치 touch 0·`cachedOldNodeStopsAfterReRegistration`·`generationChangeClearsSeatCache`) · `MetricIngestorCustomMetricTest` 8(+`BuiltinUnchanged`) · `ApmCustomMetricNamePolicyTest` 23 · `ApmCustomMetricRuleServiceTest` 12 · `ApmCustomMetricCollectorSyncTest` 3 · `ApmIngestDropCustomRuleHintTest` 2 · `ApmCustomMetricSeriesServiceTest` 4 · `ApmCustomMetricApiMvcTest` 3(권한) | 커스텀 지표 단위 **81/81**. 관련 기존 단위(`MetricIngestorTest`·`MetricIngestPipelineTest`·`ApmIngestDropQueryServiceTest`·`ApmCollectorApiMvcTest`·`ApmInstallGuideServiceTest`·`ApmMetricAllowlistTest`·`ApmBatchJobTest`) 통과 |
| IT(BE, 실 PG 5433 `moveseye_it`) | `ApmCustomMetricIT` **7건** — 등록→수신 저장 / `durableAdmissionBoundary`(50번째 STORE·51번째 FOLD, 새 관문 인스턴스(재기동)에서도 FOLD·기존 이름 STORE, 규칙 교체도 FOLD, 7일 지난 자리 비우면 새 이름 STORE) / `expiredCacheDoesNotBypassLedger`(만료 자리를 다른 노드가 가져가면 옛 노드는 캐시 수명 뒤 접는다) / `crossOrderedBatchesDoNotDeadlock` + 보존 정리 / `warningCasIsVersioned`(CAS 1행·해제 뒤 0행·꺼짐 0행) / `rolledBackSeatIsNotCached` / `oldSnapshotNodeCannotWriteNewGeneration`(실제 캐시를 가진 옛 노드가 재등록 직후·넘겨받기 직후 모두 `NONE`, 수신 경로에서 `NOT_ALLOWLISTED` 1·저장 0·자리 종류 COUNTER 유지) · `ApmRollupJobIT` 10(+`customMetricRollsUpWithoutExtraCode`) · `ApmRetentionJobIT` 12 · `ApmMetricIngestAtomicityIT` 16 | **45/45, skip 0**(다른 gradle worker 없음 확인 후 1회) |
| 회귀(BE) | APM·라이선스·OTel 단위(`premium.apm.*Test`·`license.*Test`·`otel.*Test`) | **2,271건 실패 0**(v1 시점 플래키 `ApmCollectorLiveRuntimeTest`는 master 기준선에서도 실패하는 환경성 — 최종 회차는 통과) |
| 정적(FE) | `npx tsc --noEmit` · `npm run typecheck:contract`(픽스처 `apmCustomMetricContractSample.ts` — BE DTO 규칙 12필드·limits 11·budget 9·collector 3·series Metric 6·Point 6·drops Row 2 전 필드 대조) · `eslint --max-warnings 0`(바꾼·새 29개) | 0 |
| 단위(FE) | `apmCustomMetricDisplay.test.ts`(받기 칸 판정·막힘 문구·예산 +1·빈 이유 우선순위 보존 밖→등록 직후→미수신·1분 등록·1시간 승격·창이 칸 안→등록 직후·점 없는 응답 step 보정 3) · `ApmServiceCustomMetricsTab.test.tsx` · `apmCustomMetricHooks.test.tsx`(쓰기 성공 시 무효화) · `ApmCollectorTokensTab.test.tsx`("패널을 펼치지 않아도 정규식이 실린다"·dirty면 늦은 응답이 덮지 않음 2) · `ApmCollectorsPage`·`apmCollectorDisplay`·`apmHelpContent`(위젯 134→137·화면 31→33)·`apmRoutes`(열린 탭 11→12)·`ApmServiceDetailPage`(11→12)·`AdminConsoleNav`·`apmCollectorHooks`·`ApmServiceRuntimeTab`·`PageHeaderDescription` | 대상 13스위트 **402/402**, 고아 jest 워커 0 |
| 정적 검수(Codex, gpt-5.6-sol high) | BE v1 R1~R10(fail-open 스냅샷·L5 노드 메모리·감시 표 무한·경고 CAS 없음·자동 정지→경고·재등록 데이터 섞임·종류 미고정·128자·감사 로그 커밋 전·IT 부재) → v2 N1~N9(fail-closed 경계·캐시 우회·배치당 SQL·락 순서·종류를 자리로·`ceil`·보존 단계) → v3 M1~M3(커밋 후 캐시 게시·종류 일치 touch·7일 종류 질의)+N2·N3·N7 부분 → v4 P1(옛 노드 캐시 적중 세대 검사) → **v5 승인(새 결함 0)**. FE v1 R1~R5 → v2 N1~N3 → v3 승인 → v4 M1(승격 해상도 등록 칸 안 창 전체 → 미수신 오판) → **v5 승인** | 전건 반영. 왕복 BE 5회·FE 5회 |
| 병합 후 | master ff 병합본 BE `compileJava`·`compileTestJava` 성공, FE tsc·`typecheck:contract` 0. 병합 전 `git apply --check`로 다른 세션 변경과 충돌 없음 확인 | 통과 |
| runtime | — | **미실시** — BE를 이 코드로 기동한 적 없음(:3000은 이전 코드, dev DB V81 미적용), 브라우저 0건, 다중 노드 실측 0건(IT는 한 JVM의 두 관문 인스턴스·두 트랜잭션으로 흉내) |

미검증 항목:

- 브라우저: 폐기 표 조치 칸 → 받기 모달 → 규칙 탭 행 → 서비스 상세 탭 카드 → 발급 창 yaml에 `^이름$` 포함 → 수집기 재배포 뒤 `seatServices` 증가·"미수신" 해소.
- 실 다중 노드에서 50/51 경계·재등록 전파 창(30초)·fail-closed 60초.
- 재등록 커밋과 옛 노드 확인 조회 사이의 ms 단위 창(READ COMMITTED 한 문장 안) — 이론상 남음, 실측 불가.
- 30분 오프셋 TZ 서버에서 1h 칸 정렬(FE가 `points[].ts`를 쓰므로 어긋남이 화면에 안 보여야 함).
- dev DB V81 적용(재기동 전).

증거 원천: 계약 `_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md`(v1~v1.3, §7~§9) · 보고 `features/apm/metric-allowlist/zm-155_be-metric-allowlist.md`(§3 상한·§4 불변 증거·§8 설계와 달라진 점·§10~§13 Codex 반영)·`zm-155_fe-metric-allowlist.md`(§4 구현 중 잡은 결함·§8~§10 Codex 반영)·설계 보고 `zm-155_apm-metric-allowlist-extension.md` · 검수 `features/apm/metric-allowlist/review_zm-155-be-metric-allowlist.md`(v1~v5)·`review_zm-155-fe-metric-allowlist.md`(v1~v5) · 사용자 결정 `features/apm/metric-allowlist/devdesign_apm-metric-allowlist-extension.md` §8.

## 10. 결정과 열린 항목

- 결정:
  - 설계 §8 Q1~Q9(§1 표). 특히 **이름만(차원 없음)** · **L5 50** · **같은 테이블** · **직접 입력 없음** · **로그 감사**.
  - Codex 반영으로 설계에서 바뀐 것: **자동 정지 → 경고(WARN)**(한 노드의 접힘 표본으로 전역 규칙을 멈추지 않는다 — 시계열 수 자체는 원장이 전역 50에 묶으므로 정지가 막는 위험이 남지 않는다) · **L5 노드 메모리 → DB 원장** · **종류를 규칙에서 자리로** · **자리에 규칙 세대** · **캐시 적중도 세대 확인(0문장 → 2문장)** · 128자 등록 거절 · 조회 하한 `ceil` · `CUSTOM_KIND_UNSUPPORTED` 추가 · `CUSTOM_RULE_SUSPENDED`·`resume` 삭제.
  - 런타임 패밀리 접두 이름 등록 거부(`RESERVED`) — 설계에 없던 금지(ZM-152 런타임 탭 정합). 대가: `collector.custommetric → service.runtime` 정적 참조 1줄(기존 방향과 같음).
  - 접힘 대상은 차원 값이 아니라 **지표 이름을 `__other__`로**(1차는 차원이 없어서). 상태 변경은 PATCH 하나가 아니라 동사 EP(enable/disable/clear-warning).
  - L5·L8은 `apm_setting` 키가 아니라 코드 상수(1차는 닿지 않는 상한이라 화면 노출 없이, 응답 `limits`로만).
  - 칸 정렬은 BE 서버 시간대 유지, FE는 `points[].ts`만 사용(epoch `ceil` 제거).
  - FE 권한은 `apm.edit`(지시서의 역할 축 대신 — 위임 계정 차단 방지).
- 기각 대안:
  - 전용 테이블(②안) — 디스크·메모리를 격리하지 못하면서 롤업·보존·아카이브·조회 네 군데를 더 고친다.
  - 초과분 폐기 / 먼저 온 것 교체(LRU) — 합계가 깨진다. 접기는 route 상한에서 검증된 방식.
  - 자동 정지 — 노드 표본으로 전역 정책을 멈춘다(위).
  - 기동 시 전 서비스 preload — 오지 않을 서비스까지 읽는다.
  - 공유 락 → 배타 승격 — 교착.
  - 조회 EP를 epoch 정렬로 — 저장 버킷과 어긋난다.
- 열린 항목:
  - 2차: 차원 선택 UX + 후보 관측 기록(S1) + 표본 값 스위치 + 규칙×서비스 조합 상한(L4). 그때 접힘 비율의 **전역 집계**(분 단위 공유 테이블)가 선행돼야 경고를 정지로 올릴 수 있다.
  - 규칙별 접힘 비율·받아 준 시계열 수·최근 7일 행 수(설계 §5.3 4단계) — 이름으로 세면 전 서비스 7일 파티션을 훑는다. 롤업 단계에서 이름별 일 집계를 따로 쌓는 쪽.
  - `CUSTOM_SERIES_OVERFLOW`의 서비스별 분해 필드(`routeOverflow`처럼).
  - 자리 유지 7일을 보존 설정에 연동할지.
  - 다중 노드 실측 · 브라우저 실측 · dev DB V81(§9).
  - Flyway V81 번호 — 다른 브랜치(V76~V80)가 먼저 병합되면 충돌 재확인.
  - 128자를 넘던 원래 이름의 잘린 값은 등록을 막았지만, 수집기 쪽에서 이름을 줄이라는 안내는 툴팁 한 줄뿐.
- Obsidian 관련 노트: `zm-151-156-backlog-sprint`(결정 경위·"일단 하자" 오독 교훈), `apm-cold-archive-decisions`(같은 결정 틀 Q7 로그 감사), `apm-domain-improvements-backlog`, `apm-comprehension-backlog`(빈 값 이유 표시가 AI보다 먼저), `codex-model-choice`.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 | 설계 초안 `devdesign_apm-metric-allowlist-extension.md`(472줄) — 문제(확장 수단 부재)·저장 위치 ①/②·상한 8종·접기·차원 선택 UX·후보 관측·미결 Q1~Q9 |
| 2026-10-13 | 보류 전제의 폐기 표 힌트(FE `821344b`) → 같은 날 사용자 "155 하자"로 구현 착수. 결정 Q1~Q9(이름만·L5 50·같은 테이블·히스토그램 제외·직접 입력 없음·로그 감사·yaml 자동 포함·TTL 30초). BE(V81·규칙 EP 6·관문·조회 EP·수집기 반영) + Codex BE v1 R1~R10 → v2 N1~N9 → v3 M1~M3 → v4 P1 → v5 승인. FE(조치 칸·모달·규칙 탭·서비스 탭·재생성 배너·정규식 기본값) + 계약 v1.1·v1.2·v1.3 + Codex FE v1 R1~R5 → v2 N1~N3 → v3 승인 → v4 M1 → v5 승인. 칸 정렬 서버 TZ 확정·FE `points[].ts` 전환 |
| 2026-10-19 | 사용자 승인 후 커밋·master ff 병합 BE `a9080eb`·FE `258d747`(미푸시), 워크트리·브랜치 정리, 병합본 컴파일·tsc·contract 0. 이 문서 최초 작성(소스 기준, 런타임 미실시) |
