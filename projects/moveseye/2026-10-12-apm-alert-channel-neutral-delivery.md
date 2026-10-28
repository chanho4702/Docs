---
type: project
tags: [moveseye, apm, alert, zabbix, outbox, delivery, codex]
created: 2026-10-10
updated: 2026-10-19
status: active
---

# 2026-10-10~ — APM 알람 전송 계층 채널 중립화: 독자 창구는 대기, 그 외 전부 (단위 1~7 진행)

- 프로젝트: [[moveseye]] · 선행 [[2026-10-08-apm-alert-atomicity]] · [[2026-10-10-apm-incidents-menu]] · [[2026-10-01-apm-domain-review-sweep]](09-30 "APM 알람 자빅스 분리" 원결정) · 기능 지도 [[apm-수집과-운영]]
- 상태: 브랜치 `apm-alert-history` **미푸시·master 미병합**. 단위 1 `7bb657b` · 2·3 `d989497` · 4 `3015cd7` · 5a-1 `68dc81b`(V79) · 5a-2 `09c5261` · 5b `2e5af81`(V80) · 6a `0c7ee42` · **7 `bad215d`(10-19)**. 남은 순서: **6b 대조 → 8 DEAD 회복(BE+FE) → Zabbix clock 역전 실측 → BE+FE 함께 병합**.
- 정본: 설계 `_workspace/features/apm/alerts/apm-alert-delivery-redesign-20261010.md` · 단위 5·6 설계 `apm-alert-unit5-6-design-20261011.md` §11 · 검수 `reviews/review_apm-alert-unit{1-history,23,4-dispatcher,5a1,5a2,5b,6a,6b,7}-*.md` · 계약 `features/apm/alerts/contract_apm-alert-channels.md`·`features/apm/alerts/contract_apm-alert-zabbix-apply.md` · 메모리 `apm-alert-channel-decision-2026-10-10`

## 사용자 결정 (10-10 원문 요지)
"자빅스에서 서빙하는 알람 창구 이외에도 우리만의 독자적인 창구가 필요하긴 해. 그 창구를 만드는 건 이제 대기하고 그 이외의 것들은 전부 하면 됨. 딱 알림 시스템만 만들면 전부 가능하도록."
1. **독자 알림 창구(메일·웹훅 실제 발송) = 대기.** 그 외 전부: 순위 11 2차(outbox·커밋 뒤 전송·멱등 키·재시도), B1~B3(요청 걸림 알람 재설계 — 판정 트랜잭션과 외부 I/O 분리), 판정 경로의 Zabbix I/O 제거. 목표 = **채널 중립 전송 계층**(outbox 행에 channel, Zabbix가 첫 sink) — 독자 창구는 sink 하나 추가로 끝나야 한다.
2. **알람 이력 보존(B안)**: 규칙·서비스 삭제 시 `apm_alert_event`를 CASCADE로 지우지 않는다. FK 정책 변경 + 규칙·서비스 표시값 스냅샷 열.
3. (10-12) **자동 `item.delete` 금지** — 정리는 `item.update {itemid, status:1}`(비활성화)만, 태그 미전송. 수동 정리는 가이드 `guides/ops_apm-alert-item-cleanup.md`만(API·화면 없음). 5b는 비활성 우리 아이템 재활성화 후 재사용 필수. **배포 전 옛 정리 큐(`apm_zbx_cleanup`) 0건 확인 = 배포 차단 조건.**

## 합본 전 필수(코덱스 조건)
단위 8 DEAD 회복 창구(resync는 DEAD RPUSH를 안 살림, 보류 -1 5분 초과 = `NEUTRALIZE_TIMEOUT` DEAD 포함) · 단위 7 1초 장부 in-tx 제거(✅ 10-19) · 6b 대조. 미실측: Zabbix가 트리거 켤 때 마지막 값 즉시 판정 여부. 공유 아이템 -1 생략 위험은 백로그(최근 성공 push 시각).

## 함정
- 🔴 **Flyway out-of-order**: master에 V81(ZM-155)이 먼저 들어가 브랜치 V76~V80이 out-of-order(설정 없음) → 병합 시 번호 재부여 여부 결정 필요. 번호 경합 이력: V72·73 GPU, V74·75 알람, V76~V80 이 브랜치, V81 ZM-155, V82~ DB 모니터링 예약.
- IT는 Docker DB `dmove-postgres-dev74`(5434) + `IT_DB_URL=jdbc:postgresql://localhost:5434/`. 병합 직전 `premium.apm.*` 회귀는 나눠 실행(OOM 이력 — BE·FE 테스트 동시 실행 금지).
- 설계 시 Zabbix 전용 가정(push 함수 직접 호출)을 판정 경로에 남기지 말 것.

## 관련
[[2026-10-08-apm-alert-atomicity]] · [[2026-10-10-apm-incidents-menu]] · [[2026-10-12-apm-daily-users-ip-hash]](같은 날 보류 질문) · [[2026-09-23-apm-p5-realtime]](요청 걸림 장부 STUCK_REQUEST) · [[shared-it-db-worktree-collision]]
