---
type: project
tags: [moveseye, apm, alert, postgresql, concurrency, flyway, codex]
created: 2026-10-08
updated: 2026-10-08
status: done
---

# 2026-10-08 — APM 알람 이벤트 원자성 1차 (순위 11): 중복 정리 + 부분 UNIQUE + lock-free 스냅샷

- 프로젝트: [[moveseye]] · 선행 [[2026-10-07-apm-remaining-work-priorities]] · 후속 [[2026-10-12-apm-alert-channel-neutral-delivery]] · 기능 지도 [[apm-수집과-운영]]
- 커밋: BE `3de55ec` `#ZM-122 [FIX] APM 알람 이벤트 원자성 1차(순위 11)` — master ff 병합(미푸시), Flyway **V74** `V74__apm_alert_event_open_unique.sql`. 코덱스 3차 승인.
- 정본: 설계 `_workspace/features/apm/alerts/apm-alert-atomicity-20261008.md` §5·§6 · 검수 `features/apm/alerts/review_apm-alert-atomicity-20261008.md` · 메모리 `apm-alert-atomicity-decisions`

## 사용자 결정
1. **범위는 1차만** — 중복 정리 + 부분 UNIQUE, `ON CONFLICT` 열기(JdbcTemplate store), STUCK 측정 기반 전이는 1초 monitor만, ⑧a lock-free 스냅샷(JVM `synchronized` ↔ PG 트랜잭션 교차 교착 회피), `alarmed` 재조정, APC-25 `observedAt`, 실 PG 동시성 IT. **outbox(커밋 뒤 Zabbix worker·멱등 키)는 2차** — 09-30 "APM 알람 자빅스 분리" 결정의 일부라 독자 알림 지시 전 착수 금지.
2. **중복 loser = DELETE** — 정본은 최초 발화 행(`fired_at asc, id asc`), 정본의 `zbx_eventid`가 null이면 loser에서 보강 후 삭제.
3. **PostgreSQL ≥ 15 전제** — `NULLS NOT DISTINCT` 부분 UNIQUE 하나. PG는 우리가 설치하므로 설치 가이드에 최소 버전 명시가 조건("권장대로 포스트그래스도 우리가 깔거라 최소 버전 명시만").

## 함정
- UNIQUE만 먼저 넣으면 evaluator 트랜잭션 ↔ monitor `synchronized` 교차 교착(코덱스 확인) — 스냅샷을 락 밖으로 빼는 ⑧a가 세트.
- 🔴 **Flyway 번호 경합**: V71로 두면 같은 날 GPU 세션(V72·V73)과 공유 테스트 DB에서 "적용 안 된 과거 번호" 검증 실패 → V74. V75는 장애 메뉴가 사용 → 이후 세션은 V76부터. 공유 IT DB(`moveseye_it`)는 두 세션이 동시에 돌리면 서로 `Validate failed`를 만든다 — 코드 결함으로 오인 금지([[shared-it-db-worktree-collision]]).
- docs(PostgreSQL 15 명시)는 다른 세션의 한글 파일명 재편 커밋에 묻어간다.

## 교훈
**APM 알람 쪽 작업을 잡기 전에 09-30 분리 결정([[2026-10-01-apm-domain-review-sweep]])부터 대조할 것** — 순위 11 범위를 잡을 때 그 결정을 놓쳐 사용자가 지적했다. 결정을 안 남기면 다음 세션이 "최신 행 정본·resolved_at=now()" 초안대로 구현할 위험이 있어 메모리에 결정 3개를 그대로 적었다.

## 관련
[[2026-10-12-apm-alert-channel-neutral-delivery]] · [[2026-10-10-apm-incidents-menu]] · [[concurrent-upsert-lock-order]] · [[2026-09-28-apm-metric1m-deadlock]]
