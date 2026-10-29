---
name: project-demo-seed
description: "데모 데이터 시더(웹트리거+scripts/demo-seed) — staging 시연 데이터 생성/삭제 체계, 2026-07-20 시딩 완료"
metadata: 
  node_type: memory
  type: project
  originSessionId: efede7bc-4e5a-48b5-b294-174a67255935
  modified: 2026-07-21T02:05:22.345Z
---

시연용 데모 데이터 시더 (2026-07-20 구축·실행 완료, dmove-staging).

- **2단 구성**: ① 외부 `scripts/demo-seed/seed.js`(check|jira|app|all|cleanup --yes) — Jira 프로젝트 MWD(company-managed)·이슈 60·상태전이·워크로그 676건을 **계정별 API 토큰으로 author 분산** 생성. ② 임시 웹트리거 `demo-seed-trigger`(`src/trigger/demoSeed.js`, manifest 등록) — 앱 DB(project/users/projectusers/user_schedule)+KVS role/level+readOnly 필드 `moves_RMS_projectId`/coworker 태깅(asApp app/field/value). 인증 `x-demo-secret: moves-demo-seed-2026`.
- **드라마틱 플랜**(`plan.js`, RNG 시드 20260720 고정): ERP 소강기→최근 4주 크런치(주 20h→280h 스파이크), 과부하 1명(accounts[1])·저조 1명(accounts[2]), 모바일 예산 1.2억<인건비(초과 연출), overdue 이슈 12건, [DEMO] 프로젝트 4개(진행2·완료1·예정1).
- **제약 근거**: 워크로그 author는 API 호출자 고정(지정 불가)→계정 수=시연 인력 수. readOnly Forge 필드는 외부 REST로 못 씀→웹트리거 필수. 팀 관리형 Jira 프로젝트 금지([[project-team-managed-field-gap]]).
- **enrich 단계**(all에 포함, 단독 재실행 가능·멱등): 시작일=`customfield_10015`("시작 날짜", 코드 하드코딩), 계획 작업량=`timetracking.originalEstimate`, 등록이력·coworker=이슈 프로퍼티 `movesRms{assignedAt(date-only), assignedAtIso, assignedById, coworkers}` — RFC-158 이후 coworker/등록이력은 커스텀필드가 아니라 **프로퍼티에서 read**(구 coworker 필드 태깅은 무효). 편차 연출: ERP 완료=계획<실적(초과), 데이터플랫폼=계획 준수.
- **beautify 단계**(all에 포함): ① 포털 착수 연출(이슈 3건 In Progress+최근 5영업일 워크로그) ② 간트 폴더 레이어=웹트리거 `seed-gantt` 액션(gantt_folder/폴더이슈매핑/폴더링크, 이름 기준 멱등) ③ WBS 계층=movesRms.wbsParent **머지**(GET 후 PUT — 등록이력 덮어쓰기 금지) ④ 이슈 선후행=Blocks 링크. **⚠️ 링크 방향 함정**: 이슈링크 read 라운드트립이 inward↔outward 반전(GanttService.js:280 실측 규약) → 선행→후행 유지하려면 `POST issueLink {outward: 후행, inward: 선행}` 로 저장. IssueApi.createIssueLink 주석(outward=선행)은 낡은 설명이니 믿지 말 것.
- **대시보드 함정 2**: ① 통합 대시보드 집계 대상 = `start_date<=오늘<=end_date` "기간 활성"만(ProjectRepository.getActiveProjectsRepository) — 데모 프로젝트 기간은 오늘 포함 필수. ② 앱 프로젝트 삭제 시 `portfolio_project_snapshot` 유령행 잔존(SELECT_ALL은 project 조인 없음) → 웹트리거 `refresh-dashboard` 액션(고아 스냅샷 삭제+집계 큐 push), `snapshot-status`로 완료 확인.
- **crisis 단계**(all에 포함): 모바일 앱 리뉴얼을 좌초 위기로 연출 — ① 종료일 오늘+7(경과율↑) ② Done 3건 In Progress 역전이(완료 2건만) ③ 최근 3주 워크로그 삭제(투입 정체, 작성자 토큰 DELETE) ④ 미완료 기한 20~60일 초과 ⑤ 미완료 계획공수=실적×4(min40h)로 확대 → 완성 36%·경과 94%·격차 −58pp·risk 58(4개 중 압도적 1위). 웹트리거 `update-project`(이름 기준 기간/예산/상태 COALESCE 수정) 사용.
- **대시보드 지표 공식**(portfolioDashboard, ProgressCalculator): 완성률=Σ(진행률×계획공수)/Σ계획공수 **공수가중**(진행중=min(실적/계획,1), done=1, todo=0) → 이슈카운트 완성률과 다름. 경과율=경과영업일/전체영업일. **격차(diffPercentPoint)=(완성률−경과율)×100**, **risk=max(0,−격차)**, 격차≤−5%p면 '지연(빨강)'. completion_rate/schedule_rate는 0~1 스케일(round2). ⚠️ `portfolio_project_snapshot.aggregated_at`은 INSERT시만 찍히고 UPDATE(재집계)로 안 바뀜 → 갱신확인은 지표값으로(웹트리거 `snapshot-status`가 완성/경과/격차/이슈/risk 반환).
- **gitignore**: `/scripts/demo-seed/` 전체 + `/src/trigger/demoSeed.js` 제외. manifest.yml 의 webtrigger 선언(hunk)은 추적 파일이라 커밋 시 수동 제외 필요.
- **재실행**: rax@dmove.kr 토큰 401로 7명만 시딩됨. 토큰 교체 후 `cleanup --yes`→`all` 재실행하면 8명 구성. `config.local.json`/`state.local.json`은 gitignore(토큰 포함).
- **정리 시**: 시연 후 manifest의 webtrigger/demoSeed function + `src/trigger/demoSeed.js` 제거 대상. staging엔 RFC-155 작업본이 배포됨(v4).
