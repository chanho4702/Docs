---
name: project-resource-profile
description: "자원관리 페이지 개선 — 인력 360도 드로어(진행중작업/부하/경험) + Overview 테이블 재구성(완수율/할당이슈/참여프로젝트). 풀스택+검증 완료, E2E 미수행"
metadata: 
  node_type: memory
  type: project
  originSessionId: a587f605-d035-4a3d-91ab-1468d30891a7
  modified: 2026-07-21T08:58:42.050Z
---

자원관리(`/resource`) 페이지 인력 중심 개선. 2026-07-21 풀스택 구현+통합검증 통과, **E2E 미수행**. `_workspace/resource-profile/`. [[project-resource-management]] 확장.

## 3라운드 구성
- **v1 (인력 360도 드로어)**: Overview 로우 클릭 → 슬라이드 패널(@atlaskit/drawer 미설치라 커스텀 우측 패널). 3섹션 = 진행중 작업 이슈목록 + 부하(가동율·건수·남은작업) + 경험(스킬·프로젝트 참여이력). resolver 신규 `getResourceProfile`(온디맨드)·`getResourceLoadSummary`(배치), `getProjectSkillMatch` 강화(candidate 부하 2필드).
- **v2 (Overview 테이블 재구성)**: 컬럼 = 인력·직무·등급·가동율·**할당이슈(할일/진행/완료)**·**참여프로젝트수**·**완수율**. 스킬/편집/available 컬럼 제거(스킬은 드로어로 이관), available 배지 폐기. `getResourceLoadSummary` 확장(all-status).
- **v3 (완수율 → 작업량 3값)**: 완수율 % 하나로는 실작업량 감이 안 온다는 피드백 → Overview 컬럼을 **작업량**(신규 `WorkloadCell`)으로: 진행바 + **총 할당/처리/남은 3값**. 총 할당 = spent+remaining(프론트 계산), 진행도 = completionRate. **백엔드 변경 없음(표현만)**. 단위는 **MD로 통일**(초/(hourRate*3600)) — 드로어에 h/MD 혼용이 있어(타 세션이 InProgressIssueList를 MD로 바꿈) LoadSummaryCards까지 MD 정합화. hourRate는 getSettingData 1회 조회.

## 핵심 설계 결정
- **완수율 = Σspent / (Σspent + Σremaining)** (0~1|null). original estimate 분모 아님(미입력 흔해 왜곡·>100%). 값은 이슈 `timetracking.timeSpentSeconds`(Jira 워크로그 자동집계) — **워크로그 개별 페치 없음** ([[feedback-worklog-fetch-isolation]] 준수).
- **남은작업량 균등 분할**: 이슈 남은작업량 ÷ 참여자 수(assignee+coworkers). 9MD 3명 → 각 3MD. **건수는 분할 안 함**(관여 건수). 완수율은 분자·분모 동일 n 상쇄로 분할 무관·값 불변.
- **Done 이슈 볼륨 한정**: JQL `(statusCategory != Done OR updated >= "-26w")` — 열린 이슈 전부 + Done은 최근 26주만(전원 배치 볼륨 억제, "최근 6개월 완수율"=velocity). 상수 `LOAD_DONE_WINDOW='-26w'`.
- **coworker 검색**: manifest `jira:entityProperty` searchAlias `movesRmsCoworkers` — 커스텀필드 id 조회 없이 항상 사용(팀관리형 포함 [[project-team-managed-field-gap]]).
- **statusCategory.key** = new(할일)/indeterminate(진행)/done(완료). 코드베이스 실측 확정.
- **참여 프로젝트 수** = project_users 활성(end_date 미종료) distinct 카운트. 종료판정=end_date(status 엔티티에 종료 플래그 없음).
- **회귀 방지 핵심**: 기존 In-Progress 페처 2종(`fetchInProgressLoadByAccounts`/`fetchInProgressIssuesForAccount`) **불변**, Overview 배치는 신규 `fetchAssignedLoadByAccounts`(all-status)로 분리 → Match·드로어 목록 무회귀.

## 경계면 계약
전부 `res.content`. `getResourceLoadSummary.content.load[]` = `{accountId, todoCount, inProgressCount, doneCount, projectCount, spentSeconds, remainingSeconds, completionRate}`. Controller/index/PermissionMap 변경 없음(v1에서 등록/매핑 완료, `RESOURCE_MANAGEMENT` 재사용). DDL 마이그레이션 없음(읽기 JOIN만).

## 배포 전 확인 (미검증, live Jira 필요)
- `updated >= "-26w"` 상대일자 JQL 실동작 → forge tunnel 1회 검증. 거부 시 `LOAD_DONE_WINDOW`만 절대일자 ISO로 교체.
- statusCategory.key 런타임 값, timetracking 자동집계 실형상.

## 환경 노이즈
루트 `npm test` 시 "22 failed suites"는 `.claude/worktrees/RFC-168/`(타 세션 worktree)를 루트 jest가 스캔한 것 — 실패 아님. 정리하려면 jest testPathIgnorePatterns에 `.claude/worktrees` 추가.
