---
title: 홈 위젯 대시보드 — 고정 랜딩을 사용자별 커스텀 위젯 대시보드로
date: 2026-08-18
project: moveseye
tags: [moveseye, home, widget, react-grid-layout, health-port, fullstack, qa]
status: done (2026-08-19 커밋 — BE 82227e1 · FE 0e2f94c, #ZM-110)
---

# 홈 위젯 대시보드 (home-widgets)

**요청 한 줄:** "홈에 더 구체적인 데이터를, 커스텀 대시보드처럼 추가·삭제·등록 가능하게. 단 사용자·라이선스·데이터소스 연결 상태 같은 시스템 기본은 기본빵으로."

[[projects/moveseye/moveseye|moveseye]] 허브 · 선행 [[projects/moveseye/2026-07-22-zabbix-usability-menus|2026-07-22-zabbix-usability-menus]](홈 랜딩 신설) · 관련 [[projects/moveseye/2026-08-10-license-kernel-implementation|2026-08-10-license-kernel-implementation]](라이선스 상태 EP)

## 무엇을 만들었나

- **BE(ZM-79 브랜치, `82227e1`)**: `home_widget`(V23, 사용자별) + EP 7개(`/home/widgets` 목록·추가·layout·수정·삭제·reset + `/home/system-status`) + engine-api **`HealthPort`**(Zabbix `apiinfo.version` 실호출) + `RedisClientService.scanCount/ping` + `UserRepository.countByStatus/countByUserRoleIn`. 1021 테스트 green.
- **FE(master, `0e2f94c`)**: `pages/home/widgets/`(registry·Grid·Shell·AddModal·ConfigModal + 위젯 14종), `useHomeWidgets`/`useHomeSystemStatus`, `constants/homeWidgets.ts`, i18n `home.widget.*` 76키. tsc 0·eslint 0·jest 932 green.
- 산출물: `_workspace/devdesign_home-widgets.md` · `contract_home-widgets.md` · `qa_home-widgets.md` · `e2e_home-widgets.md`.

핵심 결정: 스코프=**사용자별**(홈은 개인 랜딩; 06-16 "공유·관리자만"은 전사 대시보드 맥락) · 기본 세트는 **첫 GET에 DB 시드**(가상 기본값은 첫 드래그에서 id가 없어 저장이 꼬임) · 시스템 3종 `pinned`(삭제만 불가) · 데이터소스 상태는 **실측만**(설정 화면의 `no_fake_connection` 설계 유지) · 헬스는 **중립 포트**로(다중 소스 방향과 정합, app→engine-zabbix 참조 금지가 빌드로 강제됨).

## 🔴 QA에서만 나온 것 (정적 QA·단위 테스트 전부 green이었다)

1. **기간 파라미터 없으면 0건** — 기존 EP `/event/problems`·`/hosts/hostgroup-problems`는 `DateRangeFilterDto`가 원시 `long`이라 `from/to` 미전송=epoch 0 창 → 항상 빈 목록. 07-20 홈도 같은 코드였는데 그때 E2E가 부분 완료라 안 드러났다. 같은 화면의 KPI(945)와 목록(0건)이 모순돼야 눈에 띈다. → 알람은 `from=0`(전부, 0.8초), 호스트그룹은 **30일 창 고정**(같은 EP가 Zabbix에서 90일·연초 창은 500).
2. **`occurrenceTime` 정렬은 ASC가 최신순** — 원본 Nest의 `(b-a)*direction`을 1:1 보존한 결과. 이벤트 화면 호환 때문에 BE는 그대로 두고 홈만 ASC. "1:1 보존"은 버그도 보존한다는 뜻 — 소비자가 늘면 그 자리에 주석이 필요하다.
3. **기본 높이는 실측으로만 정해진다** — rowHeight 30·margin 8이면 카드 `38h-8`px, 머리 39px. 설계서에 적은 4×5·6×6은 감이었고 12개 중 6개가 첫 진입부터 내부 스크롤. 5건 목록은 3줄 아이템이면 h=13, 2줄로 줄여 h=11.
4. **react-grid-layout은 편집 모드에 들어가는 순간 압축한다**(`compactType=vertical`) — 시드가 "이미 압축된 상태"가 아니면 첫 편집에서 좌표가 덮어써진다. 행마다 높이를 같게, 오른쪽을 비우지 않게 시드를 짜야 한다(맵 요약을 12칸 띠로 만든 이유).
5. **관리자 판정 축이 두 개** — FE `useIsSuperRole`(userRole ADMIN ∪ Zabbix Super admin) vs BE `AdminAccessChecker`(userRole ADMIN ∪ SUPER_ADMIN). BE가 userRole만 보는 기능은 FE도 같은 축(`useIsUserRoleAdmin` 신설)이어야 "카탈로그엔 보이는데 거부"가 안 난다.
6. **"홈 타이틀 중복"은 세 겹이었다** — 브레드크럼 루트 "홈" + 세그먼트 "home"→"홈" + 공용 `PageHeader`(마지막 브레드크럼 제목) + 페이지 자체 `<Title>`. 페이지 제목만 지우면 안 되고 `useBreadcrumbs`(home 세그먼트 제거)와 `PageHeader`(`/home`이면 null)까지.

## 운영 메모
- :3000은 다른 세션과 공유 — 이 세션에서 2회 재기동(V23·시드 반영). `gradlew test` 중 bootRun이 떠 있으면 build/classes가 갈려 실행 중 JVM이 깨진다([[dev-runtime-startup]] 함정 재확인).
- BE `ErrorCode.java`·FE `locales`는 다른 세션 hunk와 섞여 있었다 → **임시 인덱스(`GIT_INDEX_FILE`)로 HEAD에서 내 파일만 add + 내 hunk만 `apply --cached` → write-tree/commit-tree/update-ref**, 그 뒤 실제 인덱스는 내 경로만 `git reset --`(타 세션 스테이징 그대로 보존). `git commit -- <paths>`는 워킹트리째 올려서 공유 파일의 남의 hunk가 딸려간다.
- SKIP: 비관리자 시나리오(dev DB USER 계정 로그인 불가) — 시드 10개·`schedulers:null`·`WIDGET_ADMIN_ONLY`는 단위 테스트로만 검증.
