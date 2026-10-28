---
type: project
tags: [moveseye, apm, otel-collector, resilience, graceful-shutdown, backpressure, codex]
created: 2026-09-23
updated: 2026-09-28
status: active
---

# 2026-09-23~28 — APM 수집 회복력 (BE 재기동·Collector 큐) 설계 → ZM-122 구현 진행 중

- 프로젝트: [[projects/moveseye/moveseye|moveseye]] · 선행 [[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]] · 병행 [[projects/moveseye/2026-09-28-apm-full-review|2026-09-28-apm-full-review]](이 작업 병합 뒤 착수 조건)
- 상태: 🔴 **구현 진행 중, 커밋 전**(09-28). 워크트리 BE `C:/worktrees/zm-122-be`(브랜치 ZM-122, master `213d875` 기준, 36파일 +829/−78) · FE 본 트리 master 미커밋(10파일). 검수 의뢰서 `_workspace/reviews/review_apm-ingest-resilience_zm-122.md` 작성됨, 코덱스 검수·남은 실측(V1·V2·V4·V5·V7) → 커밋 승인 순.
- 정본: 설계 `_workspace/designs/devdesign_apm-ingest-resilience.md` v2(§0.1·§0.2 결정표 + §7 V0 실측) · 설계 검수 `review_apm-ingest-resilience-design_codex-r1.md`(8건)·`-r2.md`(7건) · 안내서 `guides/apm-handbook/12-operations.md` §7.2a

## 계기

사용자 질문 **"BE 재기동 중에 수집이 끊기나?"**. 답은 "분리·Kafka"가 아니라 **세부 5건이 실제 유실 경계**임을 코드·실측으로 확인한 것.

## 무엇을 (5건)

| # | 설계 | 변경 |
|---|---|---|
| ① | graceful shutdown | `server.shutdown=graceful`·phase 20s·스케줄러 await 10s. SSE 3곳은 **`ContextClosedEvent`**에서 lock 안 closing 플래그 → 기존 emitter 완료. `SchedulerManager` closing 가드 |
| ② | replay 폭주 방어 | 적재 컨트롤러 **Semaphore admission → 429 `APM_INGEST_BUSY` + `Retry-After: 2`**(`app.apm.otlp.max-concurrent` 기본 6, 1~64 기동 검증). 순서 415 → 413 → 429 → 본문 읽기 → 인증 → 적재 |
| ③ | 큐 넘침 가시화 | 알림 `COLLECTOR_FAILURE` SQL을 `(send_failed% OR enqueue_failed%) AND coalesce(exporter) NOT IN (라이브)`로 · **V68** `apm_collector.enqueue_failed_total` · 신호별 최신 큐(`latestQueueBySignal`, `data_type` dims) · 시계열 `enqueueFailed` |
| ④ | STALE 기동 유예 | `bootAt = getStartupDate`, 조건 `lastSeen < bootAt && minutes(bootAt, now) < threshold + intervalMin` → 판정 불가(`continue`). `evaluateAll(now, intervalMin)` 오버로드 |
| ⑤ | 큐 옵션 | 템플릿 `${QUEUE_SIZE}`(기본 10,000·1,000~200,000)·`${RETRY_MAX_ELAPSED}`(30분·5~1,440)·`num_consumers: 10`. DTO 3종에 `queueSize`·`retryMaxElapsedMin`. FE 폼 2칸·상태 탭 열(큐 넘침·신호별 큐)·locales kr/en |

테스트: collector+alert 962건 중 실패 1 = 선재 플레이크(`ApmMetric1mStoreIT` 폐기 통계 flush).

## 결정과 이유

- **SSE를 `ContextClosedEvent`에서 닫는 이유**: Boot 3.3 graceful lifecycle은 phase `MAX−1024`로 **먼저** 멈추며 활성 요청 0을 기다린다. `@PreDestroy`는 그 뒤라 거기서만 닫으면 SSE가 활성 요청으로 남아 **매 재기동이 20초를 채운다.** 등록·종료를 같은 lock으로 — 플래그만 보면 "검사 직후 종료 훅 순회 → 그 뒤 등록" 창에 emitter가 남는다(코덱스 r2 S1). `complete()`는 lock 밖에서(onCompletion 재진입).
- **admission을 인증 앞에**: 본문(최대 2MB gzip)을 읽고 풀기 전에 거절해야 메모리를 안 쓴다. 429는 exporter 재시도 대상이라 폐기가 아니라 지연 — 단 30분 재시도 예산을 쓴다.
- **🔴 `sizer: bytes`·`max_elapsed_time 0` 폐기안 재론 금지** — 논리 크기≠디스크, 신호별 ×3, `2048×2^20` int 오버플로, 큐 메트릭 단위 파급(r1 R4·R5) / 독 배치가 소비자를 영구 점유.
- **유예 폭 = 임계 + 주기**: 스케줄러 `initialDelay = period`라 임계만 보면 기본값(5·5)에서 첫 회차가 이미 경계 밖(r2 S7). 감지 최대 지연 ≈ 임계 + 2×주기.
- **큐 넘침을 별도 kind로 나누지 않음** — 고객 규칙 호환. 원인 분리는 화면 열이 맡고 Zabbix 이벤트에는 합계만.
- 버린 대안: 마지막 평가 시각 저장(정밀하지만 상태 필요) · 큐 디렉터리 삭제 절차(손실).

## V0 실측 (§7) — 설계 가정이 뒤집힌 곳

- 트레이스 적재 p99 3.6s(정상)/8.5s(회복 폭주) · 배치당 디스크 ≈240KB · 조회 API p95 200ms대 유지.
- 🔴 기본 샘플링 1,000 SERVER/초에서 **0.25배치/초**(5,000 = 5.5h) — 설계 F2 "10분대"는 **과대**. 회복 소진 1.2배치/초.
- V6 validate 9조합 PASS. 남은 실측: V1·V2(새 jar admission)·V4(넘침 알림)·V5(SSE+Ctrl+C 종료 시간)·V7.
- 하네스: scratchpad `v0/`(run_be.ps1 :3002·gen.mjs·sproxy.mjs :4402·qsample.sh·**ctrlc.ps1**). 격리 BE :3002 = DB dmove_apm@5433·Redis DB 5, 토큰 label `v0-ingest-resilience`.

## 함정·교훈

- 🔴 Windows에서 Spring graceful 검증은 `ctrlc.ps1`(AttachConsole+GenerateConsoleCtrlEvent) — Stop-Process는 graceful을 타지 않는다.
- 🔴 gradle `--tests` 필터는 `:test`로(루트에서 주면 `engine-zabbix`가 "No tests found"로 BUILD FAILED).
- 🔴 `ApmCollectorConfigOptionsDto` 필드 추가 시 테스트 생성자 호출 12곳+ 일괄 보정([[projects/moveseye/2026-09-15-apm-install-guide-and-fe-polish|2026-09-15-apm-install-guide-and-fe-polish]]의 P4 D1 규칙 재확인).
- 파이썬 패치 스크립트에 Java 텍스트블록(`"""`)을 넣을 때 파이썬 구분자는 `'''` · heredoc 안 백슬래시 경로는 JSON을 깨뜨림(슬래시 사용).
- 코덱스 read-only 샌드박스 오류 시 근거를 본문에 첨부 → [[topics/claude/codex-exec-operations|codex-exec-operations]].
- 이 작업이 `ApmOtlpController`·`LiveSpanStreamService`·`ApmAlertEvaluationService`·V68을 쓰므로 [[projects/moveseye/2026-09-28-apm-full-review|2026-09-28-apm-full-review]]의 조치는 **이 병합 뒤 V69+**로 순서를 잡았다.

## 관련
[[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]] · [[projects/moveseye/2026-09-28-apm-full-review|2026-09-28-apm-full-review]] · [[projects/moveseye/2026-09-28-apm-metric1m-deadlock|2026-09-28-apm-metric1m-deadlock]] · [[topics/backend/otel-collector-pitfalls|otel-collector-pitfalls]] · 메모리 `apm-ingest-resilience-design`
