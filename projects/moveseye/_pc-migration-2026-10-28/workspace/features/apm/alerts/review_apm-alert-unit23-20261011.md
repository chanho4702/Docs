# 검수 요청 — 알람 재설계 단위 2(전이 단일화)+단위 3(V77 통지 outbox·채널 SPI) (2026-10-11)

- 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`(단위 1 `7bb657b` 위), 미커밋. diff `scratchpad/alert-unit23.diff`.
- 설계 `features/apm/alerts/apm-alert-delivery-redesign-20261010.md` §3.2·§6(🔴5·6·7)·§7. 사용자 결정: 독자 알림 창구는 발송 구현만 대기, 나머지 완성("창구만 꽂으면 되게").
- 단위 1과 같이 **단독 배포 금지**(단위 5·6과 함께 병합).

## 요지
- **단위 2** `ApmAlertEventTransitions`(MANDATORY 트랜잭션): `open`(OPENED일 때만 FIRED), `resolveOpen`/`resolveOpenOfRule`/`resolveOpenOfService`(사유별). 실제 전이는 열린 행 행잠금 재조회(`lockOpen*`)로 집계 — 동시 해소 시 뒤쪽은 0. `ApmAlertEvent @DynamicUpdate`(오래 든 엔티티의 전체 덮어쓰기 방지). 단일 경유는 바이트코드·소스 검사 테스트로 강제.
- **단위 3** V77 `apm_alert_notification`(UNIQUE(event,transition,channel), (status,next_attempt_at), CHECK 5종) + `apm_alert_channel_state`. 전이 트랜잭션에서 활성 채널마다 ON CONFLICT DO NOTHING, **FIRED 없는 채널엔 RESOLVED 금지**, 채널 0개면 잠금·쿼리 없음. SPI `AlertChannel/AlertChannelRegistry/DeliveryResult/AlertNotification`(스냅샷만으로 메시지, 멱등 키 `apm-alert:{eventId}:{transition}:{channel}`).
- **활성화** `AlertChannelActivation.activate`: 처음 켤 때 열린 이벤트 전부 FIRED bootstrap, **재활성화 시 꺼진 동안 닫힌 이벤트의 RESOLVED 보충**(범위 밖 추가). 전이=advisory 공유, 활성화=배타(대기 없이 시도)+이벤트 행 NOWAIT, 실패 시 자체 롤백·최대 60초 재시도 → 전이 경로는 활성화를 기다리지 않음. NOWAIT 55P03을 SQLState로 직접 판정(Spring 번역 누락 결함 IT로 발견·수정).
- 개요·홈 위젯 DTO에 `serviceDeleted`·`ruleDeleted`·`scope` 추가(SYSTEM 아님+서비스 삭제일 때만 serviceDeleted).

## 검증
- `ApmAlertNotificationIT` 18(전이별 1행·반복 0·멱등·채널 0개·FIRED 없는 RESOLVED 금지·롤백 동반·사유 6경로·CASCADE·CHECK·bootstrap·재활성화·동시성 4). 뮤테이션(공유 잠금·행잠금 재확인 제거) 3건 실패 확인. 격리 PG 5434 `premium.apm.*` **2,519 전부 통과**, build 통과.

## 의견 요청
1. 활성화의 잠금 역순(통지 잠금→이벤트 행)을 NOWAIT+재시도로 푼 설계의 정확성·기아 가능성.
2. 재활성화 RESOLVED 보충을 유지할지(오래된 해소 일괄 발송 위험은 단위 4에서 나이 필터?).
3. `@DynamicUpdate` 도입의 부작용(다른 경로가 전체 갱신에 기대던 곳).
4. 단위 4로 넘길 결정: 꺼진 채널의 PENDING(일시정지=PENDING 유지 권장?), DEAD·SKIPPED 재처리 관리 명령, 활성화 호출 주체.
