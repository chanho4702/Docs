# APM 전체 검토 보고 — 코드 기반 · 코덱스 3 + 자체 감사 3 병렬 (2026-09-28)

> 요청: "apm 전체 검토 후 보고 — 코덱스랑 병렬 실행하고 코드 기반 분석". 읽기 전용, 코드 수정 0.
> 방법: 코덱스 `gpt-5.6-sol`(high) 3회(BE 수집·코어·알람·배치 / BE 라이브·트레이스·SLO·합성·RUM / FE 전체) + 자체 감사 3회(BE 권한·보안 전수 / BE 데이터 경로·배치 / FE 정합·품질). 코덱스 🔴는 전건 **코드로 재확인**해 등급을 확정했다(하향·반려 포함, §4).
> 🔒 **상태(2026-09-28): 조치 미착수 — 사용자 결정 "지금 당장 안 한다".** 착수 시 §5a 순서(회복력 병합 → 🔴1·2·6·4 → 🔴3·5)와 마이그레이션 번호 V69+를 따른다.
> 원문: 코덱스 `scratchpad/codex_out_apm_{be1,be2,fe}.md`(세션 임시), 자체 감사는 이 문서 §3에 요약.

## 1. 규모 (코드 기준)

| 영역 | 수치 |
|---|---|
| BE APM Java / 컨트롤러 / 핸들러 | 373 / 31 / 131 |
| BE 엔티티 / 리포지토리 / 배치 잡 | 18 / 18 / 10(+`@Scheduled` 2) |
| BE APM 마이그레이션 / 최신 | 23 / V67 |
| BE APM 테스트 파일 / 케이스 | 168 / 1,727 |
| FE APM 파일 / 테스트 파일 / 케이스 | 212 / 80 / ≈1,570 |
| FE API 함수 / 훅 / 쿼리 키 / 로케일 키(kr=en) | 97 / 104 / 82 / 2,248 |
| 자바 확장 클래스 / AI 툴 | 10 / 11 |

검증 정본(안내서 13): 미검증 13항목(아파치 SSE 버퍼링·다중 BE·P5 실 BE 연결·비-JVM 런타임·실 메시징 스팬·대량 백필 등), 열린 결정 15, 정본 불일치 18.

## 2. 결론 한 줄

**조건부** — 권한·계약·i18n·화면 정합은 견고하나(누락 0), **수신 dedup·1m 적재의 비원자성**과 **합법 설정이 기동을 죽이는 충돌** 둘은 배포 전 고쳐야 한다. 나머지는 운영 규모가 커질 때 아픈 항목이다.

## 3. 교차 판정 결함 목록

발견자: Ⓒ 코덱스 · Ⓐ 자체 감사 · ✔ 코드 재확인.

### 🔴 배포 전 (6)

| # | 결함 | 근거 | 발견 | 조치(규모) |
|---|---|---|---|---|
| 1 | **OTLP 영수증 dedup 비원자**. `isDuplicate → 적재 → REQUIRES_NEW record` 세 단계가 분리돼 같은 본문 둘이 동시에 오면 둘 다 적재된다(TOCTOU). `record`가 `saveAndFlush` 예외를 삼키는 경로에서는 영수증 없이 200이 나갈 수 있다 — 단 REQUIRES_NEW 커밋 예외는 프록시 밖에서 다시 던져져 503이 될 수 있어 "항상 200"은 과장(코덱스 재검증, 추정). 동시 동일 본문은 Collector 소비자 10개가 **다른** 항목을 소비하므로 겹친 timeout 재시도·큐 복제에서만 — 가능성 낮음 | `ApmOtlpController.java:404-433`, `ApmOtlpReceiptService.java:53-84`, `V38:150-160` | ⒸⒶ✔ | **한 트랜잭션에서 영수증 `INSERT … ON CONFLICT DO NOTHING` 선점 → 신규일 때만 1m UPSERT·후속 UPDATE**(실패 시 둘 다 롤백, 동시 요청은 UNIQUE 경합 뒤 하나만). 별도 트랜잭션 선점→실패 시 삭제는 crash·삭제 실패 시 두 번째 요청이 200을 받는 유실 함정, 요청 id 방식은 OTLP 표준 id 부재. M |
| 2 | **1m 적재 트랜잭션 없음** — `JdbcTemplate` 자동 커밋, `batchUpdate` 뒤 `nullifyConflicted` 별도 배치. 앞 작업 커밋 후 뒤 작업 실패(또는 배치 일부 반영) → 503 → 재전송이 **덧셈 UPSERT**로 이중 가산. 🔴 이건 #1과 무관하게 **사후 영수증 구조 자체**가 못 막는다 — 부분 실패 요청은 예외로 `record`에 도달하지 않아 영수증이 없고, 재시도는 정상 동작이다(코덱스 재검증). 트레이스(advisory lock+논리 dedup, 한 트랜잭션)·RUM(영수증+UPSERT 한 트랜잭션)은 안전. 트레이스 drop 통계만 재전송 시 재증가 | `ApmMetric1mStore.java:339-424`(주석 자체가 인정), `MetricIngestor.java:164-170` | ⒸⒶ✔ | #1의 선점형 단일 트랜잭션이 함께 해결. M |
| 3 | **`app.apm.live.max-services` 상한 충돌** — 프로퍼티는 `@Max(2000)`, `LiveSpanRing`은 1~200 아니면 생성자 예외 → 201~2000은 합법 설정인데 기동 실패 | `ApmLiveProperties.java:95`, `LiveSpanRing.java:147` | Ⓒ✔ | 상한을 한 곳으로(200) + 기동 메시지. S |
| 4 | **열린 알람 이벤트 중복** — STUCK 1초 감시기(`fire`)와 5분 평가기가 각각 `findOpen → save`, DB에 (rule, service, 열림) UNIQUE 없음 | `ApmStuckRequestLedger.java:110-119`, `ApmAlertEvaluationService.java:249-258`, `V38:388-402` | Ⓒ✔ | 부분 UNIQUE `(rule_id, service_id) WHERE resolved_at IS NULL` + ON CONFLICT. S |
| 5 | **`apm_alert_event` 보존 없음** — `deleteByFiredAtBefore` 호출처 0, 설계 400일 미구현 → 무한 누적 | `ApmAlertEvent.java:40-44`, retention 단계 목록 | Ⓐ✔ | `apm_retention` 옵션 키 + 단계 추가. S |
| 6 | **SSE writer 풀 4/큐 100 고정 vs `max-active` 최대 500** — 동시 pump가 105를 넘으면 `RejectedExecutionException`으로 연결을 닫는다. 09-23 설정 승격이 이 경로를 열었다 | `LiveSpanStreamService.java:101-102, 501`, `ApmLiveStreamProperties.java:34` | Ⓒ✔ | writer·큐 크기를 `max-active+max-waiting`에서 산정하거나 교차 검증(기동 실패). S |

### 🟠 운영 규모에서 아픈 것 (14)

| # | 결함 | 근거 | 발견 |
|---|---|---|---|
| 7 | 메트릭 **부분 실패 200**(설계상 의도 — 저장된 몫 이중 계상 방지)이지만 잃은 포인트가 폐기 사유 `UNKNOWN_SERVICE`로 오계상 → 화면이 "미등록"으로 오독 | `MetricIngestor.java:178-190, 235-236, 288` | Ⓐ✔ |
| 8 | 서비스 삭제 CASCADE 공백 — `apm_span`·`trace_summary`·`service_edge_5m`·`dependency_5m`·`messaging_5m`·`metric_*`는 FK 없음, `error_group_1h`/`db_query_group_5m` 고아 → 삭제된 서비스가 트레이스 목록·맵에 잔존 | `ApmServiceQueryService.java:536-553`, `V44` | ⒸⒶ |
| 9 | 롤업 LAG 2분 뒤 도착한 1m은 5m/1h에 영영 미반영(장기 조회·SLO 단차); 신호별 LAG·lookback 제각각(메트릭 2분/없음, 트레이스 3분/10분, RUM 없음) | `ApmRollupService.java:73-95`, `ApmTraceRollupService.java:115-139` | ⒸⒶ |
| 10 | 보존 일수 **사본 불일치** — `ApmResolution`(7/30/400)·트레이스 7·SLO 30이 상수, options를 바꾸면 holdWatermark·승격 경계가 갈림; RUM은 옵션 자체 없음(30/7/90 상수) | `ApmResolution.java:27-33`, `ApmRetentionService.java:46-54` | ⒸⒶ |
| 11 | P5 SSE `tick()` 전체가 한 monitor 안(snapshot·복사·view별 직렬화·배포), 1초 안에 끝난다는 상한 없음; P1.5 SSE는 **연결마다** `tick()` 재계산+`findAllById`(40연결=40번) | `LiveSpanStreamService.java:237-370`, `ApmLiveStreamController.java:277-302` | Ⓒ |
| 12 | 규모: 200서비스×64인스턴스 가정에서 1m 행 수·롤업 예산이 설계 기준(1만 행/분)의 **~100배**(추정). 1m 파티션에 `bucket_start` 선행 인덱스·BRIN 없음 → 5m 롤업이 그날 파티션 seq scan | `V38:229-233`, `ApmRollupService.java:98-108` | ⒶⒸ |
| 13 | 파티션 캐시 프로세스 로컬·DDL이 수신 스레드에서 auto-commit; 선생성 2일 연속 실패면 자정 수신이 DDL 경합에 매달림 | `ApmPartitionService.java:114-173` | Ⓐ |
| 14 | 알람 평가 `@Transactional` 안에서 Zabbix HTTP; 부분 push/provisioning 실패는 WARN 뒤 배치 성공; mixed histogram은 관측 최대 family 하나만; THEIRS는 첫 binding 값을 전역화; UNKNOWN이면 열린 이벤트 유지(측정 불가와 알람 구분 필요) | `ApmAlertEvaluationService.java:185-295`, `ApmAlertEvaluator.java:225-266`, `ApmAlertService.java:818-872` | Ⓒ |
| 15 | STUCK 감시기 전역 `synchronized` 안에서 DB 저장+Zabbix push; 제거된 서비스 `observedAt` 미정리 | `ApmStuckRequestMonitor.java:120-233` | Ⓒ |
| 16 | 트레이스 목록 `offset` 무상한, `involved ANY(service_ids)`·route leading-wildcard `ILIKE` 인덱스 없음, scatter lateral 600회 | `ApmTraceQueryService.java:138-350` | Ⓒ |
| 17 | 합성 결과 `from/to` 기간 상한 없음(series마다 25×20,000 history 선조회); Zabbix 삭제 뒤 binding 삭제 실패 시 고아, 주기 reconciliation 없음 | `ApmSyntheticService.java:89-116, 343-379` | Ⓒ |
| 18 | RUM 상한(rps·일 예산)이 프로세스 메모리 → 재시작으로 우회, 공개 토큰의 Origin 위조 가능. 설치형 1노드라 실익은 재시작 우회만 | `RumRateLimiter.java:12-75` | Ⓒ(🔴→🟠 하향) |
| 19 | SQL 마스킹: 16,384자 초과 자유 텍스트는 `looksLikeSql=false`로 원문 통과 후 4,096자 절단. 단 **Collector 템플릿이 `truncate_all(attributes, 4096)`을 먼저** 적용해 우리 yaml로는 도달 불가 — 손으로 고친 yaml에서만 | `ApmSqlMasker.java:118-120`, `ApmSpanAttrAllowlist.java:131-135` | Ⓒ(🔴→🟠 하향)✔ |
| 20 | 권한 심층: `keepRawSql` 켜기(수집 활성화)가 `apm.edit`인데 원문 열람은 관리자 — 낮은 권한이 민감정보 수집을 켤 수 있음; 처리 중 요청 `currentOp`/`path`는 확장 마스킹에만 의존(원문 게이트 없음) | `ApmSettingController.java:104-135`, `ApmStuckRequestDto.java:14-16` | ⒸⒶ |

### 🟡 개선 (발췌)

- 영수증 키에 signal 없음(다른 신호 EP로 같은 본문 → 중복 폐기, 발생 가능성 낮음) Ⓒ · UPSERT 잠금 순서가 `ApmIngestDropStatRecorder` flush에는 없음 Ⓐ · STUCK 조회 `skip/size` 페이지 변환 오차 Ⓒ · 라이선스 재검사가 연결 시점만(P1.5 최대 24h, P5 10분) Ⓒ · `package-info` 규칙 위반(`core.domain.ApmReportSnapshot → report` import, 순환 4쌍) Ⓒ · 계약 문서 낡음(`features/apm/core/contract_apm.md` 알람 "관리자"→`apm.edit`, P5 계약 `live={}`·`arenaPressure 누적`·`patterns`·`nodeId`, P4 `ttfbP75Ms`) Ⓒ · 수신 컨트롤러 클래스 주석 표 낡음(403·400·503 누락) Ⓐ · `ApmReceiveToken.tokenHash` 게터 `@JsonIgnore` 없음(현재 노출 EP 0) Ⓐ · `/apm/live/stream`에 MCP가 오면 D3 경로 재현(익명 401) Ⓐ.
- FE: 막대 차트 null→0 4곳(Top 카드 2·합성 비교·차트 표 합계) Ⓐ · `useApmEdgeSeries`/`useApmInstallGuide` `enabled` 필수값 미검사 Ⓐ · APM 라우트 전부 정적 import(비APM 초기 번들 증가) Ⓒ · ECharts canvas ARIA·무대 키보드 없음 Ⓒ · 수집기 페이지 토큰 폴링이 다른 탭에서도 Ⓒ · Transactions/Instances 차트 옵션 렌더마다 재생성+`notMerge` Ⓒ · 메시징/잡 전량 클라이언트 그룹화 Ⓒ · 신규 DTO 3종(`TApmStuckRequestsRes`·`TApmLiveStreamStatsDto`·`TApmLiveActiveRequestsDto`) 계약 픽스처 없음 Ⓒ · `Table`/`Select` 직접 사용 4곳, `-`/`—` 혼재 Ⓒ · 주석 수치 drift(사이드바 6→9, 화면 13→14) Ⓐ · 테스트 픽스처 `as unknown as` 11곳 ⒸⒶ.

### 🟢 확인된 것

- **권한·세션·라이선스 게이트 131 EP 전수 누락 0** — `requireRead` 78 · `requireEdit` 41 · 리포트 관리자 2 · SSE 2(세션 대조 직접). `@VisitorIdCheck` 누락 0. MCP는 전역 인터셉터가 `/apm` 전 경로를 컨트롤러 전에 403. 공개 EP 4종(OTLP·OTLP-live·RUM·배포 웹훅)의 인증이 문서와 일치. 토큰 원문은 발급 응답 2곳(no-store)에만. 원문 SQL/스택은 관리자만 (ⒶⒸ 양쪽 일치)
- FE: API↔타입 123종·훅 제네릭 불일치 0, 쓰기 22 함수 전부 `unwrapEnvelope`, 쿼리 키 충돌 0, 라우트 19 전부 `PageWrapper`+`FeatureGate`, 사이드바·모바일·⚙·검색·페이지 내부 edit 축 일치, kr/en `apm.*` 2,248=2,248 누락 0, `any` 0, 스냅샷 테스트 0, 핵심 훅·병합 테스트 존재 (ⒶⒸ)
- BE: 트레이스 적재 advisory lock+논리 dedup+요약 병합 한 트랜잭션, 트레이스 롤업 6단계 단일 트랜잭션·멱등, retention 단계 실패 시 마지막에 예외, 스케줄러 잡 10종 리스·규약 준수, SLO_BURN 생성 경로 제한, 힙 예산식 기동 거부 (ⒶⒸ)

## 4. 코덱스 지적 중 하향·반려 (코드 대조)

| 코덱스 | 판정 | 이유 |
|---|---|---|
| FE 🔴 스파크라인 null→0 | 🟡 정책 | 코드 주석·고객 문서가 "모양만 보는 칸, 유일한 예외"로 명시. 바꿀지는 결정 사항 |
| FE 🔴 합성 위치 비교 null→0 | 🟡(S 수정 권고) | 의도(막대에 "없음" 자리 없음, 표·각주가 대신 말함). 그래도 못 잰 형제 막대를 빼는 편이 낫다 |
| FE 🔴 SSE 인증 만료 재접속 probe 누락 | 🟡 | EventSource는 재접속 401을 받으면 CLOSED가 되어 probe가 돈다. CONNECTING 경로 **테스트 부재**만 유효 |
| BE2 🔴 RUM 상한 우회 | 🟠 | 설치형 1노드 전제(다중 노드는 승격 조건에 명시). 재시작 우회만 실효 |
| BE2 🔴 SQL 마스킹 16KB 우회 | 🟠 | Collector 템플릿 `truncate_all 4096`이 앞단. 손으로 고친 yaml에서만 도달 |

## 5. 조치 우선순위 (상위 12)

| 순위 | 조치 | 규모 | 근거 § |
|---|---|---|---|
| P0 | 영수증 선점 + 1m 적재 멱등(#1·#2) | M | 3-🔴 |
| P0 | `max-services` 상한 단일화(#3) | S | 3-🔴 |
| P0 | writer 풀·큐를 `max-active+max-waiting`에서 산정/교차검증(#6) | S | 3-🔴 |
| P0 | 열린 알람 이벤트 부분 UNIQUE(#4) | S | 3-🔴 |
| P0 | `apm_alert_event` 보존 단계(#5) | S | 3-🔴 |
| P1 | 폐기 사유 `RESOLVER_FAILURE` 분리(#7) | S | 3-🟠 |
| P1 | 서비스 삭제 시 파생 표 정리 또는 고아 모델링(#8) | M | 3-🟠 |
| P1 | 롤업 late-arrival 재계산 창 + 보존 상수→options 단일화(#9·#10) | M | 3-🟠 |
| P1 | P5 tick 잠금 밖 직렬화·1초 예산 계측, P1.5 view별 1회 계산(#11) | L | 3-🟠 |
| P1 | 1m `bucket_start` 인덱스/BRIN + 롤업 EXPLAIN·부하 시험(#12) | M | 3-🟠 |
| P1 | 알람 평가 트랜잭션에서 Zabbix I/O 분리, 부분 실패 표기, mixed histogram UNKNOWN(#14) | M | 3-🟠 |
| P2 | FE 라우트 lazy import·ECharts ARIA·계약 픽스처 3종·null→0 막대 4곳 | M | 3-🟡 |

## 5a. 진행 중인 수집 회복력 작업(ZM-122 워크트리)과의 관계 — 코덱스 재검증(2026-09-28)

원문 `scratchpad/codex_out_resilience_vs_review.md`. 다른 세션이 `devdesign_apm-ingest-resilience.md` v2(graceful shutdown·admission 429·큐 넘침 알림·STALE 유예·큐 옵션)를 워크트리 `C:\worktrees\zm-122-be`(36파일 +829/−78, 미추적 `V68`)에서 구현 중이다.

| 내 판단 | 코덱스 | 정리 |
|---|---|---|
| 회복력 작업은 🔴1·2를 고치지 않는다 | 동의 | 설계 §3이 "적재+영수증 단일 트랜잭션"을 범위 밖으로 명시. §0 "영수증 멱등이라 이미 안전"은 **메트릭에는 틀리다** |
| 429·graceful이 이중 계상을 **더 자주** 드러낸다 | **반대** | 429는 본문 읽기·적재 전에 반환(DB 부작용 0)이고 동시 적재를 6으로 줄인다. graceful은 새로 끊는 게 아니라 20초 기다려 기존 강제 중단 창을 줄인다 → 설계 "부수 이득" 문구가 맞다. 단 설계서 `:111` "timeout 초과 요청은 재시도로 회복"은 메트릭이 부분 커밋됐으면 이중 가산이라 **문구 보정 필요** |
| 🔴6(writer 풀)만 같은 파일이고 나머지는 독립 | 부분 동의 | 겹치는 파일 셋: `ApmOtlpController`(admission ↔ 영수증 선점), `LiveSpanStreamService`(SSE 종료 훅 ↔ writer 풀), `ApmAlertEvaluationService`(STALE 유예 ↔ 열린 이벤트 UNIQUE 적용 경로). 마이그레이션은 ZM-122가 `V68`을 쓰므로 UNIQUE·보존 DDL은 **`V69+`**. `max-services`·`apm_alert_event` 보존은 겹치지 않음 |

**확정 순서**: ① 회복력 작업 병합 → ② 🔴1·2(선점형 단일 트랜잭션)·🔴6(writer 풀)·🔴4(열린 이벤트 UNIQUE, V69+) 연속 처리 → 🔴3(`max-services`)·🔴5(`apm_alert_event` 보존)는 지금 바로 가능. 회복력 설계서 `:111` 문구와 §0 전제("영수증 멱등")는 그 세션에 정정 요청.

## 6. 이 검토가 보지 않은 것

- 런타임 실측(빌드·테스트·기동 0회). 규모 수치는 코드 상수 기반 추정.
- 자바 확장(`moveseye-otel-extension`)·AI 툴(`moveseye-ai` apm_* 11)은 범위 밖.
- 다른 세션 미커밋 변경(FE 수집기 큐 옵션 10파일, BE `ApmMetric1mStore` 2파일)은 HEAD 기준이라 반영되지 않았다.
