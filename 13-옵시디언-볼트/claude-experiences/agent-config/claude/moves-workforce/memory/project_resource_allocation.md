---
name: project-resource-allocation
description: "프로젝트 인력 배정 현황 — /resource '배정 현황' 탭, ECharts graph(N:M) 프로젝트↔담당자 관계도, 중복배정 시각화. 풀스택+검증 완료, E2E 미수행"
metadata: 
  node_type: memory
  type: project
  originSessionId: a587f605-d035-4a3d-91ab-1468d30891a7
  modified: 2026-07-21T08:36:03.455Z
---

프로젝트 인력 배정 현황 그래프. 2026-07-21 풀스택 구현+통합검증 통과, **E2E 미수행**. `_workspace/resource-allocation/`. [[project-resource-profile]]·[[project-resource-management]]와 같은 /resource 도메인.

## 목적·형태
- 각 프로젝트에 누가 어떤 역할로 배정됐는지 + **중복 배정(여러 프로젝트 동시)** 파악.
- **ECharts graph(관계도, N:M)** — tree(1:N) 아님(사용자가 N:M 명시). `layout:'none'` 이분배치: 좌 프로젝트 / 우 담당자. 담당자 노드 = 아바타 image symbol + 이름. 중복(assignedCount≥2) = 노드 크게+빨강테두리+(n). 엣지색 = projectId 해시→16색 팔레트(DMOVE 틸 #21ADAD 포함, 필터 순서 무관 안정). 호버 tooltip+`emphasis:focus:'adjacency'`. 노드 클릭 → ResourceProfileDrawer 재사용.
- 위치: /resource **3번째 탭 "배정 현황"**(ResourcePage.jsx 로컬 Tabs).
- 상단 필터 2종(클라이언트): 진행 상태 다중선택(기본 활성만) + 프로젝트 다중선택. 종료 포함은 includeClosed 토글로 서버 재조회.

## 경계면 계약
`getResourceAllocationGraph({includeClosed?})` → `res.content: { projects[], members[], links[], generatedAt }`.
- projects[]: projectId/projectName/statusKey/statusName/statusColor/endDate/closed/memberCount
- members[]: accountId/displayName/avatarUrl/**assignedCount**/util/utilBand
- links[]: projectId/accountId/roleKey/roleName
- ECharts 노드 id = `p:${projectId}`/`m:${accountId}`, 엣지 source/target 동일 규칙. 클라이언트 필터가 프로젝트→링크→멤버 순차 축소해 **엣지 dangling 원천 차단**.

## 재사용·성능
- **단일 SQL**: `ProjectUsersQuery.FIND_ALL_ALLOCATIONS`(활성)/`_WITH_CLOSED`(종료 포함), project_users⋈project INNER JOIN → 배정≥1 프로젝트만 등장. N+1 없음.
- `userMap`(bulk 아바타/이름), `getProjectStatusListService`(res.rows statusColor), `getRollupMeta().utilizationPeople`(util 1회 read), `classifyUtilBand` 재사용. buildPeopleContext 전체는 미호출(경량).
- **`isProjectClosed` 재사용 시 이름 충돌 주의**: ResourceManagementService에 로컬 `isProjectClosed`(status+name+date 객체인자)가 이미 있어, ResourceMatch.js export 순수함수는 `isProjectClosedByEndDate` alias로 import.
- 권한 `RESOURCE_MANAGEMENT` 재사용 + PermissionMap 1키. DDL 마이그레이션 없음.

## 배포 전 확인 (미검증)
- **ECharts `image://` 아바타의 Forge iframe CSP 로드 가부** — `new Image()` 사전 프로브로 성공분만 image:// 승격, 실패는 circle+이니셜 폴백(항상 동작). 실제 로드는 배포 후 E2E 확인.

## 잔여 사소사항(실패 아님)
ResourcePage 주석 stale(탭 2→3), 미참조 i18n 키 2개(node.overload/filter.allProject).
