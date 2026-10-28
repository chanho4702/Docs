---
name: apm-incidents-menu
description: "2026-10-08~10 APM 사이드바 '장애 및 에러' 메뉴 — 발화 이력·요청 걸림(콘솔 알람 규칙 화면에서 이동)+에러 분석 3탭, /alert-events 권한 edit→view·open(창 무시)·SQL 페이징·V75. ✅ BE b61d33e·FE cbadb3e 커밋(미푸시)"
metadata:
  node_type: memory
  type: project
  originSessionId: e05d80c9-f57f-4b0d-a549-a1c837b68a1b
  modified: 2026-10-10T12:42:55.574Z
---

2026-10-08 사용자 요청 "APM 메뉴 중에 장애 및 에러 탭으로 별도 관리" → 결정: 에러 분석 탭 흡수 · 발화 이력 조회 `apm.view`로 완화 · 순위 11 1차 커밋. **✅ 2026-10-10 커밋 완료(미푸시)**: BE `b61d33e`(master ff, 워크트리 브랜치 `apm-incidents-menu`), FE `cbadb3e`(master). 코덱스 BE 3회·FE 2회 검수 승인.

**구조**: 사이드바 `incidents`(`/application-monitoring/incidents`, 트레이스 다음) 탭 `alerts`(열린 것만 기본 켬 → `open=true` 창 무시, 끄면 `open=0`)·`stuck`(기본 끔, 켜면 창 무시)·`errors`. 이력 딥링크(개요·홈 위젯)는 `apmAlertEventsPath()`가 `open=0`. 관리 콘솔 알람 규칙은 `rules`·`zabbix` 2탭, 옛 `?tab=events|stuck`은 **가드 밖** `ApmAlertLegacyTabRedirect`(콘솔 라우트가 edit 축이라), `/errors`→`incidents?tab=errors`. `useAlignedPagination`이 비배수 offset을 limit 경계로 내림(DmoveTable 페이지 번호 정합). 09-30 분리 결정과 정합 — 독자 알림 채널(전송)은 이 작업에 없음.

**BE**: `/alert-events` `requireEdit→requireRead` + `open`(창 무시) + `ApmAlertEventRepository.search` JPQL 페이징 + V75 `(fired_at DESC, id DESC)` + `OffsetBasedPageRequest`(알람·걸림 둘 다, `PageRequest.of(skip/size)` 내림 제거). `/stuck-requests` `open=true`도 창 무시로 통일. 계약서 `features/apm/core/contract_apm.md` §6.6·제약 9, `features/apm/realtime/contract_apm-p5-live.md` stuck EP.

🔴 **제품 영향(사용자 결정 대기)**: 규칙·서비스 삭제 시 알람 이력 행이 **FK CASCADE로 함께 삭제**(V38부터, "400일 보존"은 부모 생존 동안만). 이력 보존하려면 FK 정책+규칙·서비스 표시값 스냅샷 — 백로그(설계서 §4).

후속 권장(미반영): stuck 리포지토리 IT(오래된 열린 행)·FE 다음 페이지 전환/limit 변경 테스트·규모 데이터 EXPLAIN 실측. 브라우저 런타임 미검증.

정본 `_workspace/features/apm/alerts/apm-incidents-menu-20261008.md`, 검수 `reviews/review_apm-incidents-menu-{be,fe}-20261008.md`(+_codex·2·3). 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-alert-atomicity-decisions|apm-alert-atomicity-decisions]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-jest-mock-searchparams-loop|fe-jest-mock-searchparams-loop]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--verify-all-nav-entry-points|verify-all-nav-entry-points]]
