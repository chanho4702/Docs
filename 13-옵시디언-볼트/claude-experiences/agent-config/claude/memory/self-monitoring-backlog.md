---
name: self-monitoring-backlog
description: "무브스아이 자체 점검(셀프 APM) 페이지 — 나중에 할 것으로 보류(2026-09-14 사용자 결정). 기술 실증은 이미 완료 상태"
metadata:
  type: project
---

2026-09-14 사용자 결정: **자체 점검 페이지(우리 BE에 OTel 달아 자기 APM으로 관측)는 백로그로 보류** — 티켓 미발급.

- **기술 실증은 이미 끝나 있음**: 2026-08-31 APM 셀프모니터링 E2E(`_workspace/features/apm/core/e2e_apm-selfmonitoring.md`) — BE+javaagent → otelcol → 자기 수신부 종단 성립, HTTP·HikariCP·JVM 수집, 실결함(오류율 10.1% DEGRADED)까지 실검출. 남은 건 기술이 아니라 **채택 결정**.
- 착수 시 단계: ① 로그로만 있는 계측(`[zabbix-calls]` 호출량·event_sync stale·SSE 연결 수·풀 포화)을 OTel 커스텀 메트릭으로 노출(계측이 ZabbixClient 관문 한 곳이라 쉬움) → ② 셀프 수집 설정 옵트인 상시화 → ③ 전용 화면 또는 기존 APM 화면에서 `moveseye-be` 서비스 보기.
- 🔴 주의: **관측의 관측** — 셀프 페이지는 성능·내부 상태용, 생사 최후 감시는 자빅스(외부)로 역할 분담해 팔 것 · 온프렘에 Collector 상주 +1(설치 번들 공백 [[architecture-onprem-scaleout-audit]]와 겹침) · APM=PREMIUM이라 "셀프 점검은 라이선스 없이 기본 제공?" 정책 결정 필요.
- 관련: [[zabbix-load-relief]](ZM-129 계측이 로그뿐이라는 우려점이 발단) [[apm-implementation-progress]]

## 2026-09-15 로컬 셀프 APM 상시 기동 경로 마련(구현 아님, 개발 편의)
- BE `build.gradle.kts` 끝에 **옵트인 훅**: `OTEL_JAVAAGENT_JAR` 환경변수가 있을 때만 bootRun JVM에 `-javaagent` 부착(미설정이면 무변화). 🔴 `JAVA_TOOL_OPTIONS`로 달지 말 것 — Gradle 데몬까지 계측돼 `unknown_service` 유령 서비스가 생긴다.
- 기동 스크립트 `_tools/run_be_3000_dev_apm.ps1`(기존 `run_be_3000_dev.ps1` + OTEL_* 6개, 서비스명 `moveseye-be`/env `local`, export 10초).
- 로컬 Collector: 서비스 `otelcol` = `C:\moveseye-collector\otelcol-contrib.exe` + `C:\ProgramData\moveseye\config.yaml`(endpoint localhost:3000, keepRawSql **켜짐** — 로컬 한정). javaagent 2.31.1 = `C:\ProgramData\moveseye\otel\opentelemetry-javaagent.jar`.
- 실측: 재기동 후 2분 내 `apm_service` `moveseye-be/local ACTIVE UP`, 스팬 27·지표 16k 전송, 실패 0. build.gradle.kts 변경은 **미커밋**.
