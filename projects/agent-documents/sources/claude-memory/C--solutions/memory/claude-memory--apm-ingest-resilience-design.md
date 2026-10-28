---
name: apm-ingest-resilience-design
description: "APM 수집 회복력(BE 재기동·Collector 큐) — 설계 v2 확정 후 ZM-122로 구현 진행 중(BE 5건 코드 완료·FE 패치 완료·실측 V0/V6 완료, 커밋 전)"
metadata:
  node_type: memory
  type: project
  originSessionId: 3cff8a36-87a7-4a4a-a085-030cfd4d0cfe
  modified: 2026-10-12T06:30:27.650Z
---

2026-09-23 설계(코덱스 r1 8건·r2 7건 반영, 정본 `_workspace/features/apm/ingest-resilience/devdesign_apm-ingest-resilience.md` v2 + §7 V0 실측) → **2026-09-28 ZM-122로 구현 착수, 09-29 커밋 완료**(BE `78cd40b` master ff 병합·워크트리 정리 완료 · FE `ed4df58` master). 워크트리 BE `C:/worktrees/zm-122-be`(브랜치 ZM-122, master `213d875` 기준). FE는 본 트리 master에서 직접 수정(미커밋).

**구현 상태(09-28)**: BE ① graceful shutdown(application.yml)+SSE 3곳 `ContextClosedEvent`+lock 직렬화+`SchedulerManager` closing 가드 ② 적재 admission Semaphore→429(`app.apm.otlp.max-concurrent` 기본 6, 인증 전·본문 읽기 전) ③ `enqueue_failed` 알림 합산(SQL 괄호·coalesce·라이브 제외)+V68 `enqueue_failed_total`+신호별 최신 큐(`latestQueueBySignal`, `data_type` dims)+시계열 `enqueueFailed` ④ STALE 기동 유예(`bootAt=getStartupDate`, `< threshold+intervalMin`, `evaluateAll(now,intervalMin)`) ⑤ 큐 옵션 `queueSize`(기본 10,000, 1,000~200,000)·`retryMaxElapsedMin`(30, 5~1,440), 템플릿 `${QUEUE_SIZE}`/`${RETRY_MAX_ELAPSED}`/`num_consumers: 10`. 테스트: collector+alert 962건 중 실패 1 = 선재 플레이크(`ApmMetric1mStoreIT` 폐기 통계 flush). FE: 타입·상수·폼 2칸·상태 탭 열(큐 넘침·신호별 큐)·locales kr/en·테스트 2개 수정(jest 확인 중). 안내서 `apm-handbook/12-operations.md` §7.2a 신설.

**V0 실측(§7)**: 트레이스 적재 p99 3.6s(정상)/8.5s(회복 폭주) · 배치당 디스크 ≈240KB · 기본 샘플링 1,000 SERVER/초에서 0.25배치/초(5,000 = 5.5h — 설계 F2 "10분대"는 과대) · 회복 소진 1.2배치/초 · 조회 API p95 200ms대 유지. V6 validate 9조합 PASS. **실측 전부 통과(09-28)**: V5 graceful complete 4.25s(SSE 붙잡지 않음) · V1 5분 정지 큐 64/41/64 · V2 admission 6으로 소진 108s·p99 7.1s·429 14% → 기본 6 확정 · V4/V4b 큐 넘침 → 행 enqueueFailedTotal·신호별 큐·시계열·알림 SQL 합 419,003 · V7 큐 보존. 🔴 Windows 콘솔 Ctrl+C는 JVM에 안 닿음 → JMX Admin MBean(SPRING_APPLICATION_ADMIN_ENABLED + JAVA_TOOL_OPTIONS jmxremote 9902) + shutdown.jsh로 graceful 유발 · PowerShell $Pid는 읽기 전용 · 누적 카운터 첫 표본은 1m 증분 행을 못 만든다(엔티티 누계엔 남음) · Collector 실행 파일명이 사용자 서비스와 같으니 kill은 명령줄 scratchpad 경로로만(col_kill_mine.ps1) · 격리 BE 재기동 후 세션 401 → 재로그인 필요. 하네스 scratchpad `v0/`(run_be.ps1 :3002·gen.mjs·sproxy.mjs :4402·qsample.sh·ctrlc.ps1). 격리 BE :3002 = DB dmove_apm@5433·Redis DB 5, 토큰 label `v0-ingest-resilience`.

**Why**: 사용자 질문(재기동 중 수집 끊기나)→분리·Kafka 대신 세부 5건이 실제 유실 경계임을 코드·실측으로 확인.

**How to apply**: 🔴 `sizer: bytes`·`max_elapsed_time 0` 폐기안 재론 금지 · 파이썬 패치 스크립트에 Java 텍스트블록(`"""`) 넣을 때 파이썬 구분자 `'''` 사용 · 코덱스 read-only 샌드박스 오류 시 근거 본문 첨부 · heredoc 안 백슬래시 경로는 JSON을 깨뜨림(슬래시 사용) · `ApmCollectorConfigOptionsDto` 필드 추가 시 테스트 생성자 호출 12곳+ 일괄 보정 필요 · gradle `--tests`는 `:test`로(engine-zabbix 모듈이 "No tests found"로 실패) · 🔴 Windows에서 `ctrlc.ps1`(AttachConsole+GenerateConsoleCtrlEvent)은 JVM이 무시했다 — graceful 검증은 JMX `shutdown.jsh`로. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-implementation-progress|apm-implementation-progress]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-model-choice|codex-model-choice]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]].

인계서: `_workspace/features/apm/ingest-resilience/review_apm-ingest-resilience_zm-122.md`
