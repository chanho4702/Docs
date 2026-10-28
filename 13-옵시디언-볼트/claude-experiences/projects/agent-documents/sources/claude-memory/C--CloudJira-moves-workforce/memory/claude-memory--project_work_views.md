---
name: project-work-views
description: "프로젝트 상세 '작업 관리' 탭을 목록/트리/간트 뷰 전환 그룹으로 통합(2026-07-22), 작업 이력은 분석 리포트로 이동"
metadata: 
  node_type: memory
  type: project
  originSessionId: 88b5c286-ab83-43f2-ab97-462fd6af59d2
  modified: 2026-07-23T04:42:03.919Z
---

프로젝트 상세 탭 재편(2026-07-22, `_workspace/project-work-views/`). 프론트 전용, 백엔드 변경 0.

## 결정
- **작업 관리 탭 = 뷰 전환 그룹**: `[목록 | 트리 | 간트]`. 셋 다 같은 이슈 집합의 다른 표현이라 탭을 나누지 않는다.
  최상위 간트 탭은 제거됐다(그룹 안으로 흡수).
- **작업 이력은 그룹에 넣지 않고 분석 리포트로 이동.** 이슈 목록의 다른 뷰가 아니라 시간축 분석
  (번업·scope creep)이고, 필터도 전체 기준 유지가 의도된 설계라 뷰 전환에 섞으면 약속이 깨진다.
- 사용자는 처음 "드롭다운으로 묶을까?"를 물었고, 평가 후 **그룹 내 뷰 전환**으로 결정했다.

## 구현 원칙 (재작업 시 지킬 것)
- **트리는 간트 데이터/계층을 그대로 소비**: `useGanttData` + `toSvarTasks` 재사용, 계층 재해석 금지
  (이슈부모 > 폴더소속 > 루트 규칙은 ganttAdapter 소유). 두 뷰가 다른 트리를 그리면 안 된다. [[project-svar-gantt]]
- **트리 편집도 간트 것을 100% 재사용**(2차, 사용자 요청으로 읽기전용 → 편집 가능):
  mutation 훅 4종(schedule/parent/coworkers/plannedMd) + 폴더 5종 + 모달 6종 + `useGanttToastBatcher` 를
  그대로 호출한다. **트리 전용 write 로직 0줄** — 이래야 낙관 패치/토스트 배칭이 갈라지지 않는다. [[project-jira-search-index-lag]]
- **DnD 라우팅은 `resolveTreeDrop`(순수 함수)에 고정**, 규칙은 간트 move-task intercept와 의도적으로 동일.
  폴더→폴더=moveFolder, 이슈→폴더=setIssueFolder(+wbsParent 있으면 먼저 해제), 이슈→이슈=setParent, 루트드롭존 별도.
  규칙을 바꾸면 양쪽을 같이 바꿔야 한다(테스트 16건이 등가성 고정).
- 워크로그 조회는 프론트에서 `getIssueWorklogs`(requestJira 액션 기존재) 직접 호출 — 신규 resolver 0.
- **필터 공유는 tree↔gantt 만** (셸 `ProjectWorkPanel`이 담당자·상태 소유). 목록 뷰는 서버 JQL 기반이라 축이 달라 공유 안 함.
- **권한(2026-07-23 사용자 결정으로 통합)**: `PROJECT_GANTT` 분리 폐지 → **`PROJECT`로 일원화**. 서버 간트 resolver 10종
  R/W('PROJECT'), 프론트 게이트 4곳 전환(`ProjectWorkPanel`·`ProjectTreeView`·`GanttPage`×2). PROJECT read면 조회, write면 편집.
  **카탈로그의 PROJECT_GANTT 키는 존치(미사용)** — 지우면 fail-close로 즉시 차단되는 배포 순서 문제 + KVS 마이그레이션이 필요해서.
  백오피스 토글은 `usePermissionCatalog.js`의 `HIDDEN_CATALOG_KEYS`로 숨김(프론트 필터, 데이터 삭제 아님).
  locales의 PROJECT_GANTT 라벨도 유지(카탈로그가 간접 참조) — 카탈로그 키 제거와 함께 정리할 조율된 후속 작업.
  산출물 `_workspace/gantt-permission-merge/`. [[project-permission-hardening]]
- 트리 레이아웃 = **좌 구조 / 우 상세**(사용자 지정), 좌우 패널 높이 동일 고정(68vh)·내부 각자 스크롤.
  선택 노드가 필터로 사라지면 선택 해제. 상세 = 처리율 진행바 + 속성(담당자/시작일✎/기한✎/동료✎/계획MD✎ 인라인)
  + 계층 액션(상위지정/폴더지정) + 쌓인 워크로그.

## 3차 — 연관 관계 통합·편집 (2026-07-23, `_workspace/relation-edit/`)
- **간트 선후행 = Jira 네이티브 `Blocks` 링크 그 자체**다(앱 필드 저장 아님, readOnly 앱필드는 폐기됨).
  `GanttMapper.buildLinksFromIssueLinks`가 `fields.issuelinks`에서 `type.name==='Blocks'`만 간선으로 뽑는다.
  → `useIssueRelations`가 issuelinks를 전부 내리면서 **같은 링크가 "Jira 연결"과 "선후행"에 이중 표시**되던 버그를 제거.
  필터는 **타입명 기준**(방향 문구 `blocks`/`is blocked by`로 거르면 로케일·커스텀 타입에서 깨진다).
- **교차 프로젝트 Blocks 함정**: 백엔드는 페치 집합 밖 이슈와의 Blocks를 간트 links에서 제외한다.
  Blocks를 Jira 연결 목록에서 무조건 빼면 **다른 프로젝트와의 Blocks가 화면에서 통째로 사라진다**
  → 간트 links에 없는 Blocks만 "조회 범위 밖 선후행"으로 읽기전용 표시.
- **출처 표기**: 상위만 진짜 구분 가능하다. `wbsParent`(앱 저장)가 Jira `parent`를 **override**하고 해제 시 폴백(`effectiveParent`).
  적용 중인 상위 + 출처 배지 + 가려진 Jira 상위를 병기. **선후행은 저장소가 하나라 출처 구분 불가** — 구분되는 척하지 말 것.
- **권한은 `PROJECT_GANTT`**(`PROJECT` 아님). 서버가 `setGanttParent`/`setGanttLink`를 `W('PROJECT_GANTT','inherited')`로 가드하므로
  UI를 `PROJECT`로 게이팅하면 열리고 서버가 거부하는 불일치가 난다.
- 편집은 `GanttParentModal` 재사용 + `TreeLinkModal`(방향 입력 때문에 최소 신규), write는 `useSetParent`/`useSetLink` 그대로.

## 상태
- 구현+검증 완료: 프론트 101 테스트 통과(`buildWorkTree` 11 + `resolveTreeDrop` 16 신규), 빌드 성공, i18n 누락 0.
- 회귀 안전: `CommonTab`은 활성 탭을 로컬 state로만 관리(딥링크 없음) → 탭 재배치 무영향.
  `GanttPage`의 `filter` prop은 optional이라 단독 사용 하위호환.
- **E2E 미수행** — 폴더/WBS 있는 실프로젝트에서 트리 계층이 간트와 일치하는지 배포 후 확인 필요.
