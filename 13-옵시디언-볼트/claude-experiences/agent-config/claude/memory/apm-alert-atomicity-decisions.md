---
name: apm-alert-atomicity-decisions
description: "2026-10-08 사용자 결정 — APM 순위 11 알람 원자성은 1차(outbox 제외) 먼저, V71 중복 열린 이벤트는 최초 행 정본·여분 DELETE, PostgreSQL 최소 15 전제(설치 가이드에 명시)"
metadata:
  node_type: memory
  type: project
  originSessionId: e05d80c9-f57f-4b0d-a549-a1c837b68a1b
  modified: 2026-10-08T05:08:19.872Z
---

2026-10-08 사용자 결정("권장대로 포스트그래스도 우리가 깔거라 최소 버전 명시만해줘"):
1. **범위 1차 먼저** — V71 중복 정리+부분 UNIQUE, ON CONFLICT 열기(JdbcTemplate store), STUCK 측정 기반 전이는 1초 monitor만(evaluator는 liveKeys·provisioning·push 유지), ⑧a lock-free 스냅샷(JVM↔PG 교착 회피), ⑩ `alarmed` 재조정, APC-25 observedAt, 실 PG 동시성 IT. outbox(커밋 뒤 Zabbix worker·멱등 키)는 2차.
2. **V71 loser = DELETE** — 정본은 최초 발화 행(`fired_at asc, id asc`), 정본 `zbx_eventid` null이면 loser에서 보강 후 삭제. 사용자가 알람 id 외부 참조 없음을 전제.
3. **PostgreSQL ≥ 15 전제** — PG는 우리가 설치(dev/test는 18). `NULLS NOT DISTINCT` 부분 UNIQUE 인덱스 하나. 설치 가이드에 최소 버전 명시가 조건.

설계 정본 `_workspace/features/apm/alerts/apm-alert-atomicity-20261008.md` §5·§6, 코덱스 의견 `_archive/features/apm/alerts/review_apm-alert-atomicity-design-20261008_codex.md`.

🔴 **Flyway 번호**: 알람 원자성 마이그레이션은 **V74**(`V74__apm_alert_event_open_unique.sql`, 브랜치 `apm-alert-atomicity`). V72·V73은 같은 날 ZM-78(GPU) 세션이 사용 중 — V71로 두면 공유 테스트 DB에서 "적용 안 된 과거 번호"로 Flyway 검증 실패. **V75는 장애 메뉴 작업(`V75__apm_alert_event_fired_idx`, 브랜치 `apm-incidents-menu`)이 썼다 → 다른 세션은 V76부터**. 공유 테스트 DB(`moveseye_it`, 5433)는 JVM마다 drop/create라 두 세션이 동시에 IT를 돌리면 서로 컨텍스트 실패(`Validate failed`)를 만든다 — 코드 결함으로 오인하지 말고 단독 재실행.

✅ **1차 커밋 완료(2026-10-08)**: BE `3de55ec` `#ZM-122 [FIX] APM 알람 이벤트 원자성 1차(순위 11)` — master ff 병합(미푸시). 코덱스 3차 승인. **2차(커밋 뒤 Zabbix outbox·멱등 키)는 09-30 "APM 알람 자빅스 분리·독자 알림 채널" 작업의 일부 — 사용자 지시 전 착수 금지.** docs(PostgreSQL 15 명시, `operations/설치-배포-가이드.md`·`guides/자주-묻는-질문.md`)는 **미커밋** — moveseye-docs 트리가 다른 세션의 한글 파일명 재편(스테이지된 R 다수) 중이라 그 세션 커밋에 묻어간다.

🔴 **교훈**: APM 알람 쪽 작업을 잡기 전에 **09-30 분리 결정([[apm-domain-improvements-backlog]])부터 대조**할 것 — 순위 11 범위를 잡을 때 그 결정을 놓쳐 사용자가 지적했다.

**Why:** UNIQUE만 먼저 넣으면 evaluator 트랜잭션 ↔ monitor `synchronized` 교차 교착(코덱스 확인). 결정을 안 남기면 다음 세션이 "최신 행 정본·resolved_at=now()" 초안대로 구현할 위험.
**How to apply:** 구현 시 1차 완료 문구는 "단일 BE 기준 APC-01 해소". 다중 BE(순위 15) 도입 시 monitor 노드별 실행 문제는 별도. 관련 [[apm-remaining-work-2026-10-07]]
