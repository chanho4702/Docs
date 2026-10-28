---
type: project
tags: [project, forge, jira, rms]
created: 2026-05-30
updated: 2026-08-10
status: active
---

# Moves RMS (moves-workforce)

> Atlassian Jira Cloud용 **Forge 앱**. 프로젝트 인력 관리, 워크로그 추적, MM(Man-Month) 분석.
> 로컬 경로: `C:\CloudJira\moves-workforce` · 브랜치 `RFC-NNN`, 메인 `master`

## 개요
- **목적**: 프로젝트 인력(Resource) 분석, 워크로그 기반 공수 추적, MM/가동률 산출, 진척도 관리.
- **기술 스택**: Forge (`nodejs22.x`, arm64, 256MB) / React 18 · Zustand 5 · TanStack Query 5 · Atlaskit / Forge SQL(MySQL) + Forge KVS(NoSQL) / ECharts·ApexCharts·FullCalendar / `p-limit` 동시성 제한.
- **아키텍처**: `index.js → Controller → Service → (Repository) → DB`. 도메인별 `src/resolver/{도메인}/`. resolver는 `guardedDefine`으로 등록(권한 가드가 `responseWrapper`를 흡수) + `CONTROLLER_REGISTRARS` 단일 목록.
- **상세 코드 가이드**: 프로젝트 내 `CLAUDE.md` 참조 (이 노트는 경험·결정 기록용).
- **설계 Q&A**: [[moves-workforce-design-qa]] — 현재 구현이 어떤 구조이고 왜 그 방식인지 36문항(도메인별, 쉬운 설명). 시스템 이해는 여기부터.

## 핵심 결정 (Decisions)
- **MM 계산 재설계**: 달력 비례식 → **1MM = 그 달 실제 근무일(평일−공휴일)** 자동 산출. 관리자 수동 입력 제거. → [[2026-05-27-mm-redesign]]
- **MM과 가동률 분리 (Option A)**: MM=절대공수(`totalMd/월1MM`), 가동률=상대(`totalMd/effectiveMd`). 같은 값에 두 이름 붙이던 근본 오류 해소.
- **진척도 3층 분리**: 공수(소진율) ≠ 완성(진척) ≠ 일정(달력). 절대 한 숫자로 합치지 않음. → [[2026-05-29-progress-page]]
- **워크로그 성능**: 인원 단위 조회 → **프로젝트 단위 1회 + KVS 캐시 + 프론트 슬라이스**. 전용 병렬 페처로 blast-radius 차단. → [[forge-worklog-performance]]
- **계산식 SSOT**: 백엔드 값을 프론트가 우선 사용, 프론트는 폴백만. 동일 계산식 이중 구현 drift 제거.
- **전사 대시보드 = 배치 스냅샷 + 프론트 재집계**: 전 프로젝트 across는 온디맨드 집계 금지(256MB) → Scheduled Trigger 배치가 **프로젝트별 raw 스냅샷** 적재, 조회는 스냅샷만. 프로젝트 필터·분포·합산·누적은 프론트가 재집계. **풀스택 구현 완료(배포 대기)**. → [[2026-06-01-portfolio-dashboard]] · [[2026-06-02-portfolio-implementation]]
- **간트 관계 저장 이원화**: 선후행(의존)=Jira **네이티브 이슈 링크**("Blocks", asUser 표준 API·이슈화면 연동), 계층(부모-자식)=앱 커스텀필드 `wbsParentField`(임의 깊이, 네이티브 3레벨 한계 회피)+순환 앱 방어. readOnly 앱필드는 `PUT /issue` 불가 → app/field/value(asApp)가 유일 예외. → [[2026-07-02-issue-link-gantt]] · [[forge-readonly-appfield-write]]
- **가동률은 글로벌 지표(기간 합집합 분모)**: 프론트 `Σ실투입/Σ가용` 재집계는 매트릭스 조직(인원 기간중첩 다중 프로젝트)에서 분모 이중계상 → 과소. **기간 합집합처럼 스칼라 합으로 복원 불가능한 집계는 배치(원본 접근 시점)에서 계산**해야 함. → [[2026-06-02-portfolio-implementation]]

## 타임라인 (작업 기록)

- **2026-08-06** — **코드 품질 감사 1·2단계 + 운영 결함 2건**: 롤백 삭제 결과 미확인(실패 상황에서만 "모두 취소되었습니다" 허위 안내)·null 참조·히스토그램 단일값·query key 인라인 수정 / quick-add bulk 3벌·이슈 수집 루프 3벌 통합 / 큐·스케줄 트리거 환경 판별 폴백(`getAppContext`)·전사 재집계 완료 폴링 감지. 3·4단계 대기, 배포·E2E 미수행 → [[2026-08-06-code-quality-audit]]
- **2026-08-05** — **UI 일관성 정리(RFC-178, P0~P3)**: 스켈레톤(스피너 전량 삭제)·BentoGrid·PageContainer/PageHeader·색 토큰 단일화(hex 899→422)·차트 팔레트 4벌→1벌·타이포 12단계→6단계·배지 동명이인 해소·EmptyState/CardFullscreen/ViewToggleButtons 공용화. 곁에서 ECharts 폭0 init 파이 미표시 버그 해소. 커밋 완료·육안 E2E 미수행 → [[2026-08-05-design-system-convergence]]
- **2026-08-05** — **코드 스플리팅 딜레마 해소**: 진짜 원인은 CSS 가 아니라 **번들 예산 게이트가 Build 를 죽여 Deploy 가 안 돌던 것**(스테이징에 lazy 구버전 잔류 = #426 의 정체). 게이트 경고 강등 + lazy 재도입(Suspense 경계를 `CommonTab` 한 곳으로, main -49%). `startTransition` 대책은 legacy `ReactDOM.render` 라 애초에 무효였음 → [[2026-08-04-code-splitting-tradeoff]]
- **2026-08-04** — **프로젝트 구독(RFC-171)**: 스페이스 구독 → 이슈 자동 편입(이벤트+시간별 리컨실+백필). 물리 태깅·`IS EMPTY` 술어·SCAN→APPLY·커서 폐기. **보드 제거로 이슈 소유권 경합 P0 구조적 해소**. 코덱스 검증 2회. development 배포 확인, 운영 배포 미수행 → [[2026-08-04-project-subscription]]
- **2026-08-03** — **논리 설계 전수 감사 + 권장 순서 보정**: SELF 일정 ownership·Forge SQL DML adapter·license 4-state fail-closed·salary DTO·polling wrapper·가동률 분모/미래 clamp·progressThreshold·문서 inventory를 정리. BE 768/FE 650/build/i18n PASS. deploy E2E·PermissionLinter·bundle/query-key debt는 잔여 → [[2026-08-03-logical-design-audit]]
- **2026-08-03** — **RFC-173 감사 후속 기술부채 하드닝**: `project_team` 비파괴 수렴·runtime query key 60→0·ScheduleModal i18n·page/tab lazy+main gzip budget·Sentry direct dependency. BE779/FE660/build/lint PASS, main gzip 1.73MB→271KB. Forge iframe/Jira E2E는 잔여 → [[2026-08-03-rfc-173-tech-debt-hardening]]
- **2026-08-03** — **팀 분석 확충(RFC-172·174~176)**: RFC-147 잔여(N3-1·InfoTip·P3-B) 마감 + 자원관리 **팀 분석 탭 신설**(차트 6종)·통합 대시보드 **팀 축 제거**·배정 관계도 **3레이어**(프로젝트→팀→담당자)·팀 일괄 배정. 설계는 외부 모델 검토 **5회**(지적 30여건 전부 실결함, 반박 0). 신규 resolver 1·권한키 0·차트빌더 0. FE1028/BE860 PASS. **배포 전 권한 감사 필수** → [[2026-08-03-team-analytics]]
- **2026-05-26** — Resource 분석 성능 개선 + 캘린더 워크로그 로딩 + 가용MD 정정 → [[2026-05-26-resource-perf]]
- **2026-05-27** — Man-Month(MM) 계산 전면 재설계 → [[2026-05-27-mm-redesign]]
- **2026-05-29** — 프로젝트 진척도(Progress) 페이지 설계·구현 → [[2026-05-29-progress-page]]
- **2026-06-01** — 전사 통합 대시보드(Portfolio Dashboard) **설계** → [[2026-06-01-portfolio-dashboard]]
- **2026-06-02** — 전사 대시보드 **설계검증(11건 교정) + 풀스택 구현 완료**(BE 41/41·FE 36/36, 배포 대기) → [[2026-06-02-portfolio-implementation]]
- **2026-06-11** — 분석 화면 5종+Portfolio **지표 논리 감사**(오류4·의심6) + 개선 적용(가동률 경과기간 분모·actualMm 동적·scopeBands 설정화·"계획 인건비" 용어·UX 4건). 검증 18통과/0실패 → [[2026-06-11-analysis-review]]
- **2026-06-29** — 프로젝트 삭제 **cascade 보완**(자식→부모 순차+멱등, Forge SQL FK 미강제 발견·89/89) + 포트폴리오 간트 **완성률 2-lane 오버레이**(일정 vs 진척, BE변경0). 둘 다 하네스 1패스 → [[2026-06-29-delete-cascade-gantt]]
- **2026-07-02** — 프로젝트 상세 **이슈 연결 간트 탭**(RFC-134/139, 6-25~7-01 작업 정리): SVAR 간트 + 일정/계층/선후행 편집. 선후행 커스텀필드→네이티브 이슈 링크 전환(readOnly write 불가가 발단), SVAR 함정 다수(markers PRO·CSP·id='text' 아코디언). 코드·테스트 완료, 커밋됨(6f2cb62~) → [[2026-07-02-issue-link-gantt]]
- **2026-07-02** — 간트 **폴더 레이어**(RFC-139 후속): 가상 폴더 노드(2테이블·resolver 5종·additive read)+드래그앤드롭 폴더 지정+낙관적 업데이트. 삭제=승계 멱등 순차·순환 이중방어·MD 가중 롤업. 검증 146/146·커밋됨(8f01391, 852d798). 행순서 드래그는 설계만 → [[2026-07-02-gantt-folder-layer]]
- **2026-07-02~03** — **저장공간 관리**(RFC-151, `/backoffice/storage`): information_schema 기반 사용량 게이지+80/90% 경고+테이블별 상세+프로젝트별 근사 배분. 신규 테이블 0. 검증 8/8·커밋됨(706eb8e, 8e86962). P0=TiDB information_schema 배포 실측 대기 → [[2026-07-03-storage-monitor]]
- **2026-07-06** — 프로젝트 전체 설명 **PPT 소스팩 + Genspark 프롬프트** 정리(제품 소개 16장 기본형, 청중별 변형) → [[2026-07-06-ppt-genspark-sourcepack]]
- **2026-07-06** — **권한관리 고도화**(7-03~06): 서버 가드(109 resolver 전수·deny-by-default+계약테스트)·fail-close·카탈로그 14키·projectScope(소속 프로젝트 제한, 시드 Member 토글 편집). 검증 루프가 보안구멍 3건 적발·봉쇄. 검증 9/9, **E2E·커밋 전** → [[2026-07-06-permission-hardening]]
- **2026-07-07** — **경쟁 우위 분석 보고서**: 우위 5개(보안 Forge 1순위·지표 정합성·엔드투엔드·권한 격리형 비용·간트 프레이밍 전환) + 메시지 우선순위 + PPT 보강 프롬프트(§5) → [[2026-07-07-competitive-advantage-report]]
- **2026-07-08** — **산출물 맵**(배포/도입 단계 표준 문서 세트): A.소개/영업·B.사용자문서·C.기술운영·D.규정계약 4묶음 + 공통 템플릿·용어집·FAQ 뼈대·착수순서. 기작성분(PPT·경쟁우위·권한) 링크 → [[2026-07-08-deliverables-map]]
- **2026-07-14** — **팀 관리형 프로젝트 필드 미할당 진단**: Forge 커스텀 필드는 write·JQL 인덱스는 되지만 팀 관리형에선 fields 응답에서 통째로 빠짐(DWEB-30 vs DS-4 실측). projectId(JQL 전용)만 동작, 코워커·작업이력(fields 읽기)은 불가. 해결 방향=이슈 프로퍼티 이전(PoC 선행) → [[2026-07-14-team-managed-field-gap]]
- **2026-07-14** — **entityProperty PoC 완료(전 항목 실측)**: tom-chkim-dev에 2단계 배포(webtrigger→+entityProperty)로 검증. 팀/회사 관리형 동일 동작·선언 전 값 일괄 인덱싱·반영 ~1s·in/is EMPTY 동작·properties 동봉 +6ms·32,768B 제한 실측·마이그레이션 리허설 성공. ⚠️ date 인덱스 write는 date-only만 → 설계 변경 2건 도출. clone·alias 충돌은 미실측 리스크 → [[2026-07-14-team-managed-poc]]
- **2026-07-14** — **팀 관리형 지원 본 구현**(하네스 1패스+간트 wbsParent 델타+마이그레이션 제거): movesRms 1키 프로퍼티 이전(코워커·등록일·등록자·간트계층), updateIssueCoworkers 신설, recordIssueAssignedDate 전환, 페처 6종 properties, JQL alias 4곳, getAppFieldIds/updateAppCustomFieldValue 삭제. 마이그레이션은 구현 후 사용자 결정으로 제거(사내 데이터 리셋 허용). 검증 누적 20통과/0실패·BE219/FE74. +덤: 간트 아이콘 depth 축소·소실 버그 수정(IssueComponent 16px 고정). E2E·배포·커밋 전 → [[2026-07-14-team-managed-implementation]]

- **2026-07-15** — **계획 MD "시간 추적 꺼짐" 오안내 수정**: 최초 입력만 되고 수정 시 알럿 뜨는 증상 → 실측으로 remaining 미동봉 400(`timetracking_remainingestimate`)을 가드가 오판한 것 확인. remaining 동봉(buildTimetrackingPayload)+가드 정밀화(`timetracking_*` 제외)+팀 관리형 안내 경로 정정(기능 토글→이슈 유형 필드 추가). FE 74 테스트·빌드 통과 → [[2026-07-15-timetracking-remaining-fix]]
- **2026-08-31** — **경쟁 분석 v2(딥 리서치)**: 마켓 앱 10종+독립형 4종+국내 PMS 6종을 REST 가격 API·벤더 문서로 실측. 직접 경쟁=ActivityTimeline·TeamBoard·**Be On Time(순수 Forge·RoA 배지, 추적 대상)**, 우리만=급여 환산 원가+가시성 정책+팀관리형 자동. 🔴 1차 문서 오류 3건(휴가 차감 있음·MD는 BigPicture도·AT 한국어 있음) 코드로 정정 → Confluence용 md `_workspace/competitive-analysis/` → [[2026-08-31-competitive-analysis-v2]]

## 교차 주제 (Topics)
- [[forge-i18n]] — Forge `t()` 치환 미지원, `locales/kr·en`이 merge 실제 소스.
- [[forge-worklog-performance]] — 워크로그 N+1, 캐시·병렬화, 공유 모듈 격리.
- [[forge-migration-lifecycle]] — 스키마 마이그레이션은 `scheduledTrigger`만 의존 금지, `onInstall`에서 선행 호출 + `upgraded:app` 구독.
- [[forge-sql-no-fk-cascade]] — Forge SQL(TiDB)은 FK 미강제·CASCADE 무작동·트랜잭션 부재 → cascade 삭제는 앱 레벨 자식→부모 순차 멱등 DELETE.
- [[forge-readonly-appfield-write]] — readOnly 앱 커스텀필드는 `PUT /issue` 불가("Field does not support update") → app/field/value(asApp·숫자 issueIds), 그 전에 네이티브 구조 대체 우선 검토.

## 열린 항목 (Open)
- ~~MM 분모 정의(#7): `÷가용MD` vs `÷표준월MD` 불일치~~ → **2026-05-27 MM 재설계로 해소 확인(2026-07-06 코드 실측)**: MM=`÷monthMm`(표준월 근무일)로 전 화면 통일(Resource 테이블/차트·Portfolio actualMm), 가용MD는 가동률 분모 전용. → [[2026-05-27-mm-redesign]]
- ~~`settings.progressThreshold` 시드/설정 UI 미추가~~ → **2026-08-03 해소**: manifest schema·seed·service validation·설정 UI를 `0..100 %p`, 기본값 `5` 계약으로 연결했다. → [[2026-08-03-logical-design-audit]]
- 일별 완성진척 추이·정밀 예측: 상태전이 이력/일별 처리율 데이터 부재.
- 초대형 프로젝트 KVS payload 한도 모니터링 (`issues[]` 캐시 미포함으로 회피 중).
- 전사 대시보드 **배포 전 실데이터 확인**: 워크로그 집계 정확도, `members_json` payload 크기, JSON 컬럼 드라이버 반환형, stale-lock·합집합 분모 E2E (~~actualMm=/20~~ → 2026-06-11 동적 분모로 해소). + scopeBands EMPTY 폴백·재집계 CTA 확인. → [[2026-06-11-analysis-review]]
- SettingPage에 `scopeTodoAmberRatio/RedRatio` 입력 폼 미추가 (시드/폴백으로 동작, 폼은 후속).
- ~~급여 별도 권한 분리~~ → 2026-07-06 `PROJECT_COST` 키 분리로 해소(시드 Member read=false). 서버 마스킹은 여전히 후속 후보. → [[2026-07-06-permission-hardening]]
- **권한 고도화 배포 후 E2E**: MEMBER_ONLY 실사용(목록 축소·비소속 상세 거부·비용 탭 숨김·시드 direct-invoke 차단) + manifest projectScope 반영 위해 `forge deploy` 선행. → [[2026-07-06-permission-hardening]]
- **간트 배포 최종확인**(~~커밋~~ → 07-02 완료): 링크 정방향/아코디언/일정설정/상위지정 육안, 진단 console.log 제거, E-1(드래그 하위 진입) 미해결, manifest `predecessorsField` 안전 제거 후속. → [[2026-07-02-issue-link-gantt]]
- **간트 행 순서 드래그**: 설계 완료·미구현(`_workspace/gantt-row-order/01_architect_design.md` — `gantt_issue_order`+밴드 일괄 정규화+bulk resolver). → [[2026-07-02-gantt-folder-layer]]
- **저장공간 관리 배포 실측(P0)**: TiDB에서 `information_schema.tables`+`DATABASE()` 조회 허용 여부 + 환경별 `STORAGE_LIMIT_BYTES` 주입 결정. 후속=추이 스냅샷·아카이빙·엑셀. → [[2026-07-03-storage-monitor]]
- **팀 관리형 지원 배포·E2E**: ~~PoC~~·~~본 구현~~·~~마이그레이션~~(사용자 결정으로 기능 제거 — 사내 데이터 리셋 허용, 재등록 갈음) → 2026-07-14 구현+검증 완료(커밋 전). 남은 것: ① `forge deploy` + **`forge install --upgrade`**(entityProperty 등록) ② E2E(팀 관리형 코워커/작업이력/간트 계층/myWork 협업자 검색 — 기존 데이터는 배포 직후 공란이 정상) ③ dev 테스트 이슈 6건(ASD·WORK) 정리 ④ 후속 RFC: 커스텀 필드 manifest 폐기 + getCoworkerFieldIdApi 잔재 청소. ⚠️ asApp 채택([[feedback_no_asapp]] 상충) 사용자 확인 필요 → [[2026-07-14-team-managed-implementation]]
- 🔴 **팀 분석 배포 전 권한 감사**: 팀 비교를 통합 대시보드→자원관리로 옮기면서 **`REPORT.read && !RESOURCE_MANAGEMENT.read` 인 모든 세트가 접근을 잃는다.** 시드 `Member`·`Team Member` 외에 **커스텀 세트**와 **팀 권한 상속자**(`permission_key IS NULL` + `team.permissionKey` + `nearestAncestorWith`)까지 운영 KVS 에서 산출해 담당자 승인을 받아야 한다. 승인 없이 배포 금지 → [[2026-08-03-team-analytics]]
- **코드 품질 감사 3·4단계**: 평가서 v1.1 기준 잔여. "하지 않기로" 확정한 4건은 사유와 함께 평가서에 남아 있다. → [[2026-08-06-code-quality-audit]]
- **번들 예산선 재점검**: `1,850,000` 은 실측 +5% **참고선**이며 게이트는 경고만 낸다(막지 않음). 늘어나는 것을 주기적으로 실측해야 한다. 로컬 검증은 반드시 `CI=true npm run build`. `ErrorBoundary` 부재로 `ChunkLoadError` 복구 수단은 여전히 없다. → [[2026-08-04-code-splitting-tradeoff]]
- **프로젝트 구독 잔여**: 같은 스페이스 **중복 구독 허용**(PK 를 `(project_id, source_type, source_id)` 로), 보류한 검증 지적(sweep lease·큐 부분 실패 복구·실패 prefix starvation), 운영 배포. → [[2026-08-04-project-subscription]]
- **팀 분석 P2·후속**: ① 기간별 공수 추이 — 배치 `monthly_effort_json` 이 **프로젝트 단위**라 팀 분해 불가, `members[].monthlyEffort` 추가 필요 ② 레이더(팀 프로필) — 완수 규모 산식·4축 정규화·리스크 역변환·null 축 계약 미정 ③ 전사 `project_team` 조회 resolver 부재로 "배정만 되고 투입 없는 팀" 미표시 → [[2026-08-03-team-analytics]]

## 하네스
- `feature-harness` 스킬 기반 에이전트 팀(설계→백엔드∥프론트→검증). 첫 실전(2026-05-29)에서 커스텀 agent_type/TeamCreate 미지원 → general-purpose 서브에이전트 파이프라인으로 폴백.
- 2026-06-11 런타임이 커스텀 subagent_type+SendMessage 지원 확인 → 직접 생성 방식으로 전환(첫 실전: analysis-review 파이프라인 완주). TeamCreate는 여전히 미지원. → [[harness-engineering]]
