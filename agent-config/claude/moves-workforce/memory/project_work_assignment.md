---
name: project-work-assignment
description: "작업 배정 탭(프로젝트상세>인력>작업 배정) — 이중 스코프 배정 판단+실행, 2026-07-22 풀스택 완료·E2E 미수행"
metadata: 
  node_type: memory
  type: project
  originSessionId: 35720d32-8d4e-4067-b8e3-328e76056529
  modified: 2026-07-23T05:25:57.074Z
---

프로젝트 상세 > **인력** 부모탭 > 세 번째 서브탭 `작업 배정`(`projectAssignment`). 팀장이 "누구에게 배정할지" 판단하고 그 자리에서 실행. 2026-07-22 설계·구현·검증 완료, 산출물 `_workspace/work-assignment/`.

## 존재 이유 (기존 화면과의 축 차이)
- `projectDetail/user` = 누가 계약돼 있나(부하 개념 없음) / `analysisReport/resource` = MM을 얼마나 썼나(사후) / `/resource` = 전사 여유(프로젝트 컨텍스트 없음).
- 이 화면만이 **프로젝트 내 부하 ↔ 전사 부하를 한 행에 나란히** 놓는다. 목표는 "이 프로젝트만 보면 여유 있는데 밖에서 과부하" 탐지.

## 핵심 설계 판정
- **프로젝트 내 부하 산출 = 가능**. JQL 술어 `moves_RMS_projectId = "<단일 uuid>"`로 스코프를 확정하므로 응답 필드로 되나눌 필요가 없고, 따라서 앱 필드를 `fields`로 요청하지 않아 [[project-forge-field-key-fieldsbykeys]] 함정을 아예 회피한다. 마이페이지가 불가였던 건 여러 프로젝트를 OR로 묶어 조회해 되나누기가 필요했기 때문 — 경로가 다르다. (`src/` 전역에 `fieldsByKeys` 사용 0건 = 백엔드에서 앱 커스텀필드를 fields로 요청하는 경로는 전부 잠재 버그)
- **프로젝트 내 실시간 가동률 = 산출 불가**(재시도 금지). 워크로그 전량 페치+공휴일/연차 차감이 필요. 대안으로 `portfolio_project_snapshot.members_json[].utilization`(일 배치 유래)을 집계시각과 함께 참고값 표기. 프로젝트 스코프의 신뢰 지표는 건수/작업량/완수율뿐.
- **후보 모집단** = project_users 기본 + 전사 풀 온디맨드 토글(resolver 분리). 탭 진입마다 전사 배치를 도는 건 저빈도 액션에 상시 비용.
- **전사 배치는 `ResourceLoadFetcher` 무수정 재사용**, 프로젝트 패스만 신규 격리 [[feedback-worklog-fetch-isolation]].

## 경계면 (resolver 3종, 전부 `content` 래핑)
`getWorkAssignmentBoard`(PROJECT read) / `getWorkAssignmentPool`(RESOURCE_MANAGEMENT read) / `assignWorkItem`(PROJECT write). 신규 권한 카탈로그 키 없음, manifest 변경 없음.

- `assignWorkItem` payload에 **projectId 필수**(없으면 권한 스코프 검증 무력화).
- `assigneeAccountId`: **undefined(미변경) ≠ null(해제)**. `coworkerAccountIds`는 **전체 교체 시맨틱**.
- write 후 `search/jql` 금지 [[project-jira-search-index-lag]] → 단건 GET으로 `{item, previous}` 반환, 프론트는 `setQueryData`+`patchAssignmentCache` 순수함수만. `invalidateQueries` 금지, `refetchOnWindowFocus:false`.
- assignee write는 `as:'user'` [[feedback-no-asapp]], coworker는 기존 `mergeIssueProperty` 헬퍼 재사용(app 컨텍스트 = 기존 정책 유지, 신규 asApp 도입 아님).

## 잡은 버그 (같은 함정 재발 주의)
**한 컴포넌트를 필드 집합이 다른 두 스코프에 재사용할 때 생기는 오표기.** `ScopeSplitCell`이 project/company 양쪽에 쓰이는데 `company` 객체에는 `assignedCount`가 없어(project 전용), 전사 스코프에서 항상 "할당 작업 없음"으로 표기됐다 — 과부하 인원을 여유롭다고 오판시키는, 이 화면이 막으려던 실패 모드 그 자체. 판별자를 `todo+inProgress+done` 합산으로 통일해 해결. **resolver↔프론트 대조만으로는 안 잡힌다**(양쪽 다 계약을 지켰음).

필드 집합: 공통 `util/todo·inProgress·doneCount/spent·remainingSeconds/completionRate` | project만 `assignedCount, utilSource` | company만 `utilBand, projectCount`.

## UX 개선 (2026-07-23, 사용자 피드백 반영)
- 좌우 **카드 2분할**(`components/card/Card` 재사용), 높이 `78vh`+`minHeight:480`으로 동기화. **Forge iframe에서 vh는 동작한다** — 이슈분석·인력분석 85vh, 트리뷰 80vh, 칸반 90vh 전례. `calc(100vh - Npx)`는 상단 크롬 높이(탭 줄바꿈·권한별 탭 수·번역 길이)가 가변이라 회피.
- 검색: 좌(이슈키·요약) / 우(이름·직무·등급), 200ms 디바운스, 세그먼트 카운트도 검색 결과 안에서 집계. 큐 기본 필터 = **`unassigned`**(전체는 데이터 폭주).
- **선택 해석은 반드시 `visibleQueue` 기준**(`resolveQueueSelection`). 필터 전 `queue`에서 찾으면 배정 후 좌측에서 사라진 항목이 우측에 선택 상태로 남는다 → 미배정 필터에선 선택 해제+다음 항목 자동선택, 전체 필터에선 유지. **필터를 코드로 강제 전환하지 않는다**(사용자가 고른 필터를 앱이 바꾸지 않음).
- 페이지 리셋은 `key` remount(`search|poolOpen`만) — 배정 캐시 패치 때는 remount 안 돼 보던 페이지 유지.
- 확인 모달은 대상을 `pending.item`으로 고정(백그라운드 갱신으로 선택이 바뀌어도 문구 불일치 없음).

## E2E 피드백 반영 (2026-07-23)
- **큐 = done 제외 전체 열린 이슈**(flags-only 폐지, 재배정 지원). `flags:[]` 유효, 정렬은 flags(지연→임박→미배정) 우선. `patchAssignmentCache`의 "flags 비면 제거" 로직도 함께 삭제됨.
- QueueItem additive: `projectKey`/`projectName`/`projectAvatarUrl(16x16)` — Jira 네이티브 project 필드라 fieldsByKeys 무관.
- **스페이스 필터 = 멀티선택 체크박스 드롭다운**(작업 관리 DropdownJql UI 패턴, 빈 Set=전체·OR). `components/filter/ProjectFilterDropdown` + `projectSpace.js`로 **공용 승격** — 작업 배정 큐와 작업 관리 트리·간트(ProjectWorkPanel 소유, tree↔gantt만 공유)가 같은 컴포넌트·같은 옵션 shape `{value,label,avatarUrl}` 사용.
- 간트 권한은 PROJECT로 통합됨 → [[project-work-views]] 참조.

## 상태
- 백엔드 301 테스트 / 프론트 136 테스트 통과, 빌드 성공(신규 코드 유래 경고 0), i18n kr/en 대칭·merge 반영.
- **E2E 미수행** (forge deploy 후 확인 필요).
- **커밋 시 주의**: 작업 트리에 선행 작업(작업탭 그룹 개편 [[project-work-views]], 마이페이지 v2)이 섞여 있고 `constants/tabs.js`는 두 작업이 겹친다 → hunk 단위 분리 커밋 필요.
