---
name: home-widget-dashboard
description: "홈 위젯 대시보드 — 2026-08-18 설계+BE+FE+QA(정적·E2E·재검증) 완료·**커밋 완료 2026-08-19**(BE `82227e1`·FE `0e2f94c`, #ZM-110, 미푸시). 사용자별 home_widget V23·EP 7·HealthPort·위젯 14종·시스템 3종 pinned. QA 교훈 6건"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8a13f89c-0a1f-450a-9769-57fd8f277eeb
  modified: 2026-08-18T09:58:39.591Z
---

2026-08-18 홈(`/home`)을 **사용자별 커스텀 위젯 대시보드**로 개편(고정 랜딩 [[home-landing-page]] 대체). 설계 `_workspace/devdesign_home-widgets.md`, 계약 `features/home/home-widgets/contract_home-widgets.md`, QA `qa_home-widgets.md`·`e2e_home-widgets.md`. 경험 노트 `claude-experiences/projects/moveseye/2026-08-18-home-widget-dashboard.md`.

**구현(커밋 완료 2026-08-19: BE ZM-79 브랜치 `82227e1` · FE master `0e2f94c` + FIX `51705c2`(폴링 시 스켈레톤: 조회 시각을 쿼리 키에서 제거·keepPreviousData), 티켓 #ZM-110, 미푸시)**
- BE(ZM-79): `home_widget`(**V23**, user_id FK) + `/home/widgets` 목록(0건이면 기본 세트 시드)·POST·PATCH layout·PATCH {id}·DELETE(pinned 거부)·POST reset + `/home/system-status`(users/dataSources/infrastructure/schedulers(admin만), Redis 30초). engine-api `engine/port/HealthPort` + engine-zabbix `ZabbixHealthAdapter`(`apiinfo.version`), `RedisClientService.scanCount/ping`, `UserRepository.countByStatus/countByUserRoleIn`, ErrorCode WIDGET_PINNED/DUPLICATE/TYPE_INVALID/ADMIN_ONLY. 1021 green.
- FE(master): `pages/home/widgets/**`(registry·Grid(RGL v2)·Shell·AddModal·ConfigModal·위젯 14종), `useHomeWidgets`·`useHomeSystemStatus`·`useIsUserRoleAdmin`, `constants/homeWidgets.ts`, i18n `home.widget.*`, `PageHeader`(/home이면 숨김)·`useBreadcrumbs`(home 세그먼트 제거). tsc 0·eslint 0·jest green.
- 결정: 스코프 사용자별 · 시스템 3종(라이선스·사용자·데이터소스) pinned=삭제만 불가 · AWS는 설정 유무만(실호출 X) · 카탈로그 정본은 BE enum, 크기 정본은 FE 상수(둘 다 동일값 유지).

**🔴 교훈(QA에서만 드러남)**
- `/event/problems`·`/hosts/hostgroup-problems`는 **from/to 없으면 epoch 0 창 → 항상 0건**(DateRangeFilterDto 원시 long). 알람은 from=0(전부), 호스트그룹은 **30일 창 고정**(Zabbix가 90일·연초 창은 500).
- `occurrenceTime` 정렬은 **ASC가 최신순**(Nest `(b-a)*direction` 1:1 보존) — BE 안 고치고 소비자가 ASC 전송.
- RGL 기본 높이는 `38h-8`px(rowHeight 30·margin 8) 실측으로만; **편집 진입 시 vertical compact가 배치를 덮어쓰므로 시드는 행별 동일 높이·오른쪽 빈칸 없이**.
- 🔴 **폴링 훅의 쿼리 키에 시각을 넣지 말 것** — 키가 바뀌면 새 쿼리라 isLoading→스켈레톤 깜빡임. 시각은 queryFn 안에서, 키는 [KEY, limit] 고정.
- 관리자 판정 축: FE `useIsSuperRole`(Zabbix 역할 포함) ≠ BE `AdminAccessChecker`(userRole) → BE 축 기능은 `useIsUserRoleAdmin`.
- :3000은 다른 세션과 공유·bootRun 중 `gradlew test`는 클래스 갈림. BE `ErrorCode.java`·FE `locales`엔 타 세션 hunk 혼재 → hunk 단위 스테이징.

**잔여**: 비관리자 런타임 시나리오 SKIP(dev USER 계정 로그인 불가) · 커밋 승인 대기 · 2차 후보(새로고침 주기 UI·공유 대시보드·시계열 위젯).
