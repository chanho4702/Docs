# 백로그 — APM 전체 검토(2026-09-28) 조치 목록

- 근거 정본: [`../reports/report_apm-full-review-2026-09-28.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/APM-%EC%A0%84%EC%B2%B4-%EA%B2%80%ED%86%A0-%EB%B3%B4%EA%B3%A0-%EC%BD%94%EB%93%9C-%EA%B8%B0%EB%B0%98-%EC%BD%94%EB%8D%B1%EC%8A%A4-3-%EC%9E%90%EC%B2%B4-%EA%B0%90%EC%82%AC-3-%EB%B3%91%EB%A0%AC-%282026-09-28%29.md) (코덱스 3 + 자체 감사 3, 코드 재확인, 코덱스 재검증 §5a)
- 상태: **미착수 — 사용자 결정(09-28) "지금 당장 안 한다"**. 이 문서는 나중에 꺼낼 목록이다.
- 🔴 착수 조건: **다른 세션의 수집 회복력 작업(ZM-122 워크트리, `devdesign_apm-ingest-resilience.md` v2)이 master에 병합된 뒤**. 겹치는 파일 3(`ApmOtlpController`·`LiveSpanStreamService`·`ApmAlertEvaluationService`), 마이그레이션은 그쪽이 V68을 쓰므로 여기 DDL은 **V69+**.
- 이슈 이름은 커밋 관례 `[TYPE] 제목`.

## A. 배포 전 (🔴 6) — 묶음 2개로 등록

| 순위 | # | 이슈 이름 | 공수 | 의존 | 근거 |
|---|---|---|---|---|---|
| 1 | A1 | `[FIX] OTLP 메트릭 적재 멱등 — 영수증 선점 + 1m 적재 단일 트랜잭션` | 1~2일 | 회복력 병합 뒤 | 보고서 🔴1·2 |
| 2 | A2 | `[FIX] 실시간 관제 SSE writer 풀을 동시 시청 상한에서 산정` | 0.5일 | 회복력 병합 뒤(같은 클래스) | 🔴6 |
| 3 | A3 | `[FIX] 열린 알람 이벤트 부분 UNIQUE(V69+) — 1초 감시기·5분 평가기 중복 차단` | 0.5일 | 회복력 병합 뒤(같은 클래스·V번호) | 🔴4 |
| 4 | A4 | `[FIX] app.apm.live.max-services 상한 단일화(200) + 기동 메시지` | 0.5일 | 없음 — 지금 가능 | 🔴3 |
| 5 | A5 | `[FEAT] apm_alert_event 보존 단계·옵션 키 추가` | 0.5일 | 없음 — 지금 가능(DDL 없음) | 🔴5 |

### A1 상세 — 영수증 선점 + 단일 트랜잭션

- 최소 설계(코덱스 동의): 파싱·파티션 준비는 트랜잭션 밖 → **한 트랜잭션에서** `INSERT INTO apm_otlp_receipt … ON CONFLICT DO NOTHING` 선점 → 행이 생겼을 때만 1m UPSERT + `nullifyConflicted` → 커밋. 실패하면 영수증·적재 함께 롤백, 동시 동일 본문은 UNIQUE 경합 뒤 하나만 실행.
- 🔴 하지 말 것: "별도 트랜잭션 선점 → 실패 시 삭제"(crash·삭제 실패 시 두 번째 요청이 200을 받아 유실) · "요청 id 방식"(OTLP 표준 id 부재).
- 트레이스·RUM은 이미 안전(트레이스 advisory lock+논리 dedup 한 트랜잭션, RUM 영수증+UPSERT 한 트랜잭션) — 손대지 않는다. 트레이스 drop 통계만 재전송 시 재증가(🟡).
- 회복력 설계서와 맞출 것: 그쪽 §0 "영수증 멱등이라 이미 안전"은 메트릭에 틀림, `:111` "timeout 초과 요청은 재시도로 회복"은 메트릭 부분 커밋 시 이중 가산 → 두 문구 정정.
- 테스트: 동시 동일 본문 2건 → 1m 값 1배 · 배치 도중 실패 → 503 뒤 재전송해도 1배 · 영수증 실패 → 503(200 아님).

### A2 상세 — writer 풀

- `LiveSpanStreamService` writer `ThreadPoolExecutor(4,4, queue 100)` 고정. `max-active+max-waiting`(최대 700)에서 산정하거나 `ApmLiveStreamProperties` compact ctor에서 교차 검증(초과 시 기동 실패). `RejectedExecutionException → close(c)` 경로에 테스트.

### A3 상세 — 열린 이벤트 UNIQUE

- `CREATE UNIQUE INDEX … ON apm_alert_event (rule_id, service_id) WHERE resolved_at IS NULL`(서비스 NULL=전역은 `COALESCE(service_id, 0)`). `ApmStuckRequestLedger.fire`·`ApmAlertEvaluationService` 열기 경로를 `ON CONFLICT DO NOTHING` 또는 예외 흡수로.

## B. 운영 규모에서 아픈 것 (🟠 14) — 필요해질 때

| # | 이슈 이름 | 공수 | 근거 |
|---|---|---|---|
| B1 | `[FIX] 메트릭 부분 실패 폐기 사유 RESOLVER_FAILURE 분리(UNKNOWN_SERVICE 오계상)` | 0.5일 | 🟠7 |
| B2 | `[FIX] 서비스 삭제 시 FK 없는 파생 표 정리(span·summary·edge·dependency·messaging·1h/5m 고아)` | 1~2일 | 🟠8 |
| B3 | `[IMPROVE] 롤업 late-arrival 재계산 창 + 보존 일수 상수→options 단일화(RUM 옵션 포함)` | 2일 | 🟠9·10 |
| B4 | `[PERF] P5 SSE tick 잠금 밖 직렬화·1초 예산 계측 / P1.5 SSE view별 1회 계산` | 3~5일 | 🟠11 |
| B5 | `[PERF] 1m 파티션 bucket_start 인덱스·BRIN + 롤업 EXPLAIN·부하 시험` | 2일 + 실측 | 🟠12 |
| B6 | `[FIX] 파티션 캐시 무효화·DDL을 수신 스레드 밖으로` | 1일 | 🟠13 |
| B7 | `[IMPROVE] 알람 평가 트랜잭션에서 Zabbix I/O 분리·부분 실패 표기·mixed histogram UNKNOWN·THEIRS 바인딩별` | 2일 | 🟠14 |
| B8 | `[PERF] STUCK 감시기 잠금 밖 DB/Zabbix I/O + observedAt 정리` | 1일 | 🟠15 |
| B9 | `[PERF] 트레이스 목록 keyset 페이지·service_ids GIN·route trigram·scatter 비용 상한` | 2일 | 🟠16 |
| B10 | `[FIX] 합성 결과 기간 상한 + Zabbix 삭제↔binding reconciliation` | 1일 | 🟠17 |
| B11 | `[IMPROVE] RUM rps·일 예산 재시작 내성(DB/Redis 카운터)` | 1일 | 🟠18(설치형 1노드라 후순위) |
| B12 | `[FIX] SQL 마스킹 16KB 초과 자유 텍스트 UNMASKABLE 처리(손으로 고친 yaml 방어)` | 0.5일 | 🟠19 |
| B13 | `[IMPROVE] keepRawSql 켜기를 관리자 축으로 + 처리 중 요청 currentOp 원문 게이트` | 0.5일 | 🟠20 |

## C. 개선 (🟡) — 묶어서

- BE: 영수증 키 signal 추가(V69+) · `ApmIngestDropStatRecorder` flush 정렬 · STUCK 조회 skip/size 오차 · SSE 라이선스 재검사 · `package-info` 위반 아키텍처 테스트 · 계약 문서 낡음 5곳(`contract_apm.md` 알람 권한, P5 `live`·`arenaPressure`·`patterns`·`nodeId`, P4 `ttfbP75Ms`) · 수신 컨트롤러 주석 표 · `ApmReceiveToken.tokenHash @JsonIgnore` · `/apm/live/stream` MCP 401 경로.
- FE: 막대 null→0 4곳(Top 카드 2·합성 비교·차트 표 합계) · `useApmEdgeSeries`/`useApmInstallGuide` enabled · APM 라우트 lazy import · ECharts ARIA·무대 키보드 · 수집기 토큰 폴링 탭별 · Transactions/Instances 차트 옵션 memo · 메시징/잡 서버 페이지네이션 · 계약 픽스처 3종(`TApmStuckRequestsRes`·`TApmLiveStreamStatsDto`·`TApmLiveActiveRequestsDto`) · `Table`/`Select` 래퍼 · `-`/`—` 통일 · 주석 수치 drift · 픽스처 `as unknown as` 11곳.
- 정책 결정 필요: 스파크라인 null→0 유지 여부.

## 착수 전 확인

1. 회복력 작업(ZM-122 워크트리) 병합 여부와 그쪽이 쓴 마이그레이션 최종 번호.
2. A1은 dev DB 5433 도커에서 동시 요청·중간 실패 IT로 검증(`IT_DB_URL`, `:cleanTest`).
3. A2는 09-23 설정 승격(`2339a2d`)과 짝 — `ApmLiveStreamPropertiesTest`에 교차 검증 케이스 추가.
