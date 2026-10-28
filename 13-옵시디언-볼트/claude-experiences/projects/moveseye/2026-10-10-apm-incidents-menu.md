---
type: project
tags: [moveseye, apm, fe, alert, incidents, codex]
created: 2026-10-08
updated: 2026-10-10
status: done
---

# 2026-10-08~10 — APM "장애 및 에러" 메뉴 신설: 알람 이력·요청 걸림·에러 분석을 한 곳에

- 프로젝트: [[moveseye]] · 선행 [[2026-10-08-apm-alert-atomicity]] · 기능 지도 [[apm-조회와-분석]]
- 커밋(미푸시): BE `b61d33e`(master ff, 브랜치 `apm-incidents-menu`, Flyway **V75** `(fired_at DESC, id DESC)`), FE `cbadb3e`. 코덱스 BE 3회·FE 2회 승인. 브라우저 런타임 미검증.
- 정본: `_workspace/features/apm/alerts/apm-incidents-menu-20261008.md` · 검수 `reviews/review_apm-incidents-menu-{be,fe}-20261008.md` · 메모리 `apm-incidents-menu`

## 결정
사용자 "APM 메뉴 중에 장애 및 에러 탭으로 별도 관리" → 에러 분석 탭을 흡수 · 발화 이력 조회 권한을 `apm.view`로 완화 · 순위 11 1차와 함께.

## 구조
- 사이드바 `incidents`(`/application-monitoring/incidents`, 트레이스 다음) 탭 `alerts`(열린 것만 기본 켬 → `open=true`면 창 무시)·`stuck`(기본 끔)·`errors`. 이력 딥링크(개요·홈 위젯)는 `open=0`.
- 관리 콘솔 알람 규칙은 `rules`·`zabbix` 2탭. 옛 `?tab=events|stuck`은 **가드 밖** `ApmAlertLegacyTabRedirect`(콘솔 라우트가 edit 축이라), `/errors` → `incidents?tab=errors`.
- `useAlignedPagination`이 비배수 offset을 limit 경계로 내림(DmoveTable 페이지 번호 정합).
- BE: `/alert-events` `requireEdit → requireRead` + `open` + JPQL 페이징 + `OffsetBasedPageRequest`(알람·걸림 둘 다, `PageRequest.of(skip/size)` 내림 제거). `/stuck-requests` `open=true`도 창 무시로 통일.
- 09-30 분리 결정과 정합 — 독자 알림 채널(전송)은 이 작업에 없음.

## 🔴 제품 영향(결정 → 10-10 B안)
규칙·서비스 삭제 시 알람 이력이 **FK CASCADE로 함께 삭제**(V38부터, "400일 보존"은 부모 생존 동안만). → [[2026-10-12-apm-alert-channel-neutral-delivery]]에서 "이력 보존(B안): FK 정책 변경 + 표시값 스냅샷"으로 결정.

## 함정
FE 테스트가 비배수 offset 케이스에서 **동기 무한 렌더 루프** — mock이 매 렌더 새 `URLSearchParams`를 만들어 `DmoveTable` effect deps가 매번 바뀜 + 고아 jest 워커 26개·4.2GB → [[jest-mock-identity-render-loop]].

## 후속 권장(미반영)
stuck 리포지토리 IT(오래된 열린 행) · FE 다음 페이지 전환/limit 변경 테스트 · 규모 데이터 EXPLAIN.

## 관련
[[2026-10-08-apm-alert-atomicity]] · [[2026-10-01-apm-collectors-to-admin-console]] · [[2026-09-23-apm-p5-realtime]](요청 걸림 장부 출처)
