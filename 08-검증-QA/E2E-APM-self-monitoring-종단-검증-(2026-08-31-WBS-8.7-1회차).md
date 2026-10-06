# E2E — APM self-monitoring 종단 검증 (2026-08-31, WBS 8.7 1회차)

- 구성: `moveseye-be-spring` **현재 트리 jar 사본**(:3001, dev 프로필, **빈 DB `dmove_apm`** → Flyway V1~V41 자동 적용) + `-javaagent 2.31.1`(delta 선호) → `otelcol-contrib 0.159.0`(정본 템플릿 `collector-template.yaml` 치환본, tail_sampling·file_storage 포함) → **BE 자기 자신의 `POST /apm/otlp/v1/metrics`**. 라이선스: 발급 도구로 만든 PREMIUM 30일 키(`selfmon`) 등록. 스크립트: scratchpad `r1/e2e_selfmon.py`(일회성).
- 결론: **수신 → 자동 등록 → 1m 적재 → 조회 API가 실데이터로 응답하는 P1 파이프라인이 종단으로 성립.** 트래픽 약 90요청·2분 후 확인.

## 확인된 것
| 단계 | 결과 |
|---|---|
| 라이선스 등록 `POST /settings/license` | 200, `features: [APM, DB_MONITORING, GPU_MONITORING]`, state EXPIRING(30일 키·유예 0) |
| 토큰 발급 `POST /apm/receive-tokens` | 원문 1회 응답 + `endpoint: /apm/otlp`, 목록 DTO에는 해시·원문 없음 |
| Collector 기동(템플릿 치환본) | 정상. traces/logs는 BE가 200 + `SIGNAL_NOT_SUPPORTED` 드롭 카운트(21) — exporter 폐기 없음 |
| `apm_service` | `moveseye-be / dev / ACTIVE` 1행 자동 등록, `apm_instance` 1 |
| `apm_collector` | `eca362d6…` 0.159.0, queue 0 — 자기 메트릭 resource로 수집기 분류 ✅(서비스로 등록되지 않음) |
| `apm_metric_1m` | 17개 메트릭(HTTP·active_requests·HikariCP 풀·db operation·JVM) + 수집기 센티널 103행. `http.server.request.duration` 행에 dims canonical JSON·hist_counts 15칸·bounds_id 1·exemplar_trace_id ✅ |
| 드롭 통계 | `NOT_ALLOWLISTED`(body.size·used_after_last_gc·cpu.time·class.loaded/unloaded), `CUMULATIVE_FIRST_SKIPPED`(otelcol 누적 카운터 첫 관측), `SIGNAL_NOT_SUPPORTED` — 전부 의도된 사유 |
| 영수증 dedup | 10행 |
| `GET /apm/services/overview` | status **DEGRADED** — `오류율 10.1% > 5.0%`. 🔴 **진짜 결함 검출**: 새 DB에 Zabbix 설정이 없어 `GET /hosts/manage/{hostid}`가 **500**을 8회 냈고(status_class 5xx) APM이 그대로 잡았다. 404(`/**` 9건)는 설계대로 오류에 안 들어감 |
| `GET .../red-series` | step 60, 빈 버킷은 `requests:0`·지연 null |
| `GET .../endpoints` | 14 route, p50/p95/p99 계산(`/auth/login` p95 4875ms — bcrypt+콜드), `/apm/otlp/v1/*` 자기 수신 route도 보임 |
| `GET .../runtime?family=jvm` | slots.memoryUsed(heap) 시계열 존재(2분치) |
| `GET .../availability` | 6칸 — 마지막 칸 DEGRADED |
| `GET /apm/overview` | summary/totals/heatmap 정상, `prev` null(전일 없음) |
| `GET /apm/ingest/recent?tokenId=1` | `received:true, batches 17, points 277, dropped 51` |
| `GET /apm/alert-rules` | V41 시드 전역 규칙 2개(ERROR_RATE 5% · P95 2000ms), bindings 0 |
| `GET /apm/alert-rules/zabbix-status` | `reachable:false, error:"URI is not absolute"` — 새 DB에 Zabbix 설정이 없어서 정상 동작(진단 배지 경로 확인) |

## 발견 사항 (검수·후속)
1. **가용성 시계열이 서비스 등록 전 구간을 `STALE`로 채운다**(`availability` 6칸 중 앞 5칸). `availability24hPct`는 `firstSeenAt` 이후만 분모로 세지만 시계열 점은 그 전도 STALE → FE 스트립이 "등록 전"을 "끊김"으로 보인다. 점을 `null`/생략 또는 status `NONE`으로. (query 계층)
2. **자기 수신 route(`/apm/otlp/v1/*`)가 서비스 지표에 섞인다** — self-monitoring 특유. 고객 환경에선 무관하지만 데모용으론 필터 옵션(설정 `exclude_routes`) 후보.
3. `GET /apm/collectors`는 검증 시점에 미구현(404) — 진행 중(WBS 0.11 EP).
4. `/settings/license` GET은 존재하지 않는 EP(`/settings/license/features`가 정본) — 스크립트 오류, 제품 무관.
5. 미검증: 롤업 잡(5분 주기 — 관찰 시간 부족)·알람 평가 잡(5분)·Zabbix 바인딩(설정 없는 DB)·FE 브라우저 렌더. 다음 회차에 :3001을 30분 이상 두고 5m/1h·`apm_alert_event`·바인딩(Zabbix 설정 입력 후)을 본다.

## 2회차 (같은 날, +15분 — 배치 잡·Zabbix 브리지)
| 항목 | 결과 |
|---|---|
| `apm_rollup`(5분) | 14:36 첫 실행 `5m=0`(닫힌 버킷 없음) → 14:41 **`5m=59 1h=0`** — LAG 2분·워터마크 동작 |
| `apm_alert_evaluate`(5분) | 14:36: Zabbix 설정 없음 → `대상 2건 전부 Zabbix 프로비저닝 실패` **예외로 던짐**(#14 규약) + 그래도 우리 이벤트 `ERROR_RATE 8.26%` 발화 기록. Zabbix 설정 행을 `dmove_apm`에 넣은 뒤 14:41: **호스트·그룹 `MovesEye APM`(인터페이스 없음, 태그 owner)·트래퍼 아이템 2(`apm.error_rate[uid]` %, `apm.p95_latency[uid]` ms)·트리거 2(priority 4/3, manual_close, 태그 owner/apm_service/apm_kind/apm_uid) 실 생성**, `push(ok=0 wait=2)` = 캐시 동기화 대기(R10 계약 ②) · 이벤트 해소(트래픽 종료). 14:46: `push(ok=2 wait=0)`, `cache_ready=true`, Zabbix `lastvalue` 0 / 209.29ms |
| 데모 Zabbix 잔존물 | 호스트 10757·그룹 54·아이템 91835/91836·트리거 41514/41515 — **self-monitoring 지속용으로 남겨 둠**. 정리하려면 `host.delete 10757` + 그룹 삭제 |
| 발견 | `apm_alert_evaluate`가 프로비저닝 전부 실패 시 예외를 던지는 것은 규약대로지만, **우리 이벤트 기록은 예외 전에 끝나** 화면엔 발화가 보인다 — 의도된 분리(배달 실패 ≠ 판정 실패). 검수에서 확인 |

## 3회차 (16:38 — 코덱스 지적 반영본 jar 재기동)
| 항목 | 결과 |
|---|---|
| 스트리밍 본문 상한(8MB/gzip 2MB)·소유 태그 검증·액션 조건 `value2/value` 정정 반영 jar(16:37) | :3001 재기동 22초, Collector 재접속 |
| `apm_alert_evaluate` 16:43 | `push(ok=2 wait=0 fail=0) provFail=0` — **기존 우리 호스트(10757, `owner:moveseye-apm`)를 소유 태그 검증 통과로 재사용**, 바인딩 error 없음. 수정 에이전트의 불안 #3(`host.get selectTags`가 태그를 돌려주는지)은 실서버로 해소 |
| 수집기 화면 API(16:50) | `POST /apm/collector-config`(tokenId 1, windows) → `text/yaml`·`no-store`·`X-Apm-Token-Placeholder` → **`otelcol-contrib validate` 통과**(keepRawSql=false: transform/sql 포함 / true: 제거 + `X-Apm-Warning: raw-sql`) · `GET /apm/install-guide?os=windows&stack=java` 단계 6/3/4·env 6·notices 5 · `GET /apm/collectors` 실 수집기 1행(UP, 0.159.0) |

