---
type: project
tags: [moveseye, apm, review, audit, codex, backlog]
created: 2026-09-28
updated: 2026-09-28
status: backlog
---

# 2026-09-28 — APM 전체 검토 (코드 기반, 수정 0) → 🔴6 백로그 등록

- 프로젝트: [[projects/moveseye/moveseye|moveseye]] · 대상 = P1~P5 전 구간([[projects/moveseye/2026-08-31-apm-p1-implementation|2026-08-31-apm-p1-implementation]] → [[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]])
- 상태: 🔒 **조치 미착수, 사용자 결정 "지금 안 함"**. 정본 `_workspace/reports/report_apm-full-review-2026-09-28.md`(§5a 코덱스 재검증 포함) · 백로그 `planning/backlog_apm-full-review-2026-09-28.md`(A1~A5 배포 전 · B1~B13 · C). 공용 백로그 `tasks_backlog-2026-09-16.md` 근거 목록에 링크.
- 방식: 코덱스 3 + 자체 감사 3 **병렬**, 코드 기반. 결론 **조건부**.

## 🔴 6건

| # | 발견 | 최소 조치 |
|---|---|---|
| 1 | OTLP **영수증 dedup 비원자** + 기록 실패 삼킴(200) — 코덱스 재검증: "항상 200"은 과장(REQUIRES_NEW 커밋 예외는 503 가능), **TOCTOU는 확실** | A1: 한 트랜잭션에서 영수증 `INSERT ON CONFLICT` **선점** → 신규만 적재 |
| 2 | 1m 적재 **무트랜잭션**(재전송 이중 가산) — 인과 정정: 사후 영수증 구조 자체가 부분 실패 재시도를 못 막음(#1 무관) | A1과 함께 1m 단일 트랜잭션 |
| 3 | `max-services` `@Max 2000` vs `LiveSpanRing` 200 → 기동 충돌 | A4: 즉시 가능 |
| 4 | 열린 알람 이벤트 **UNIQUE 없음**(STUCK 1초 감시기 vs 5분 평가기 경합) | A3: V69+ |
| 5 | `apm_alert_event` 보존 없음 | A5: 즉시 가능 |
| 6 | **SSE writer 풀 4/큐 100 고정 vs max-active 500**(09-23 설정 승격이 연 것) | A2 |

- 누락 0: 권한 131 EP · FE 정합 · i18n.
- 코덱스가 🔴 5건 **하향**: 스파크 null→0 의도 · 합성 비교 의도 · SSE probe는 CLOSED로 동작 · RUM은 설치형 · SQL 16KB는 Collector truncate가 앞단.
- 미검증 13 · 열린 결정 15 · **정본 불일치 18**(안내서 13).

## 코덱스 재검증(§5a)에서 바뀐 판단

- "429·graceful([[projects/moveseye/2026-09-28-apm-ingest-resilience|2026-09-28-apm-ingest-resilience]])이 문제를 **악화**"는 **반대** — 429는 부작용 전에 반환한다.
- 겹치는 파일 3(`ApmOtlpController`·`LiveSpanStreamService`·`ApmAlertEvaluationService`) + V68 사용 중 → **DDL은 V69+**.
- 순서: 회복력 병합 → 1·2·6·4 → 3·5는 즉시 가능.

## 결정

- 사용자: **전체 검토 🔴6 조치는 지금 안 함**(백로그). 다른 세션의 회복력 작업(ZM-122 워크트리)이 먼저. 착수 시 보고서 §5a 순서·V69+ 준수.

## 교훈

- **자체 감사와 코덱스 감사를 병렬로 돌리고 서로 재검증**시키면 과장(#1 "항상 200")과 인과 오류(#2)가 걸러진다. 코덱스는 🔴 5건을 의도된 동작으로 하향시켰다 — 한쪽 결과만 믿었으면 조치 목록이 11건이었다.
- 같은 날 다른 세션이 같은 파일을 만지는 중이면 **감사 결과의 조치 순서에 "그 작업 병합 뒤"를 명시**해야 한다. 마이그레이션 번호도 예약(V69+).
- 정본 불일치 18건 중 13건이 안내서 — 큰 기능 뒤엔 코드 대비 문서 대조가 별도 작업이다([[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]] 09-28 고객 문서 재작성과 같은 결).

## 관련
[[projects/moveseye/2026-09-28-apm-ingest-resilience|2026-09-28-apm-ingest-resilience]] · [[projects/moveseye/2026-09-28-apm-metric1m-deadlock|2026-09-28-apm-metric1m-deadlock]] · [[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]] · [[projects/moveseye/2026-09-16-apm-observability-backlogs|2026-09-16-apm-observability-backlogs]] · 메모리 `apm-implementation-progress`(09-28 절)
