---
tags: [project, moves-workforce, gantt, svar, forge-sql, folder]
created: 2026-07-06
updated: 2026-07-06
---

# 2026-07-02 — 간트 폴더 레이어 + 드래그앤드롭 폴더 지정 (RFC-139)

> [[2026-07-02-issue-link-gantt]]의 후속. 간트 트리에 **이슈가 아닌 "폴더" 노드**(가상 그룹핑 레이어)를 추가해 이슈를 임의 깊이 폴더로 묶고, 드래그앤드롭으로 폴더에 지정할 수 있게 했다. 낙관적 업데이트 적용까지 포함. 커밋 완료(8f01391, 852d798 — 2026-07-02). 산출물: `_workspace/gantt-folder-layer/`. 행 순서 드래그는 **설계만 완료·미구현**(`_workspace/gantt-row-order/01_architect_design.md`).

---

## 구조

- **DB**: 신규 2테이블 `gantt_folder`(id/name VARCHAR(120)/parent_folder_id/sort_order) + `gantt_folder_issue`(이슈→폴더 매핑). 마이그레이션 v007/v008. 프로젝트 삭제 cascade에 folder_issue → folder 순(자식 먼저)으로 편입 — [[forge-sql-no-fk-cascade]] 원칙 그대로.
- **백엔드**: `GanttFolderService/Repository/Query/ValidationService` 신설. resolver 5종 추가(`createGanttFolder`/`renameGanttFolder`/`moveGanttFolder`/`deleteGanttFolder`/`setGanttIssueFolder`) — 기존 `registerGanttController`에 define만 추가, index.js 무변경. read(`getProjectGanttData`)는 **additive 확장**: `content.folders[]` + `content.folderIssues{}` (기존 tasks shape 동결).
- **프론트**: `ganttAdapter.js`가 폴더를 SVAR 노드로 합성해 이슈 트리와 병합. 5종 mutation 훅(`useGanttFolderMutations.js`)은 응답 미소비 + invalidate. 852d798에서 **낙관적 업데이트**(useGanttMutations) + **막대/행 드래그로 폴더 지정** 추가.

## 핵심 설계·구현 포인트

1. **폴더 삭제 = 승계(reparent), 삭제 아님** — 폴더 삭제 시 소속 이슈/하위폴더를 상위(루트면 매핑 DELETE)로 승계 후 폴더 DELETE. 스냅샷 → 이슈 승계 → 하위폴더 승계 → 폴더 삭제의 **WHERE 기반 멱등 순차** — 트랜잭션 없는 Forge SQL에서 중간 실패해도 재실행 안전(cascade 삭제와 동일 패턴).
2. **순환 방어 이중화** — 백엔드 `detectFolderCycle`(self + 부모 체인 추적 + visited로 손상 그래프 무한루프 차단), 프론트 어댑터도 guard set·`collectFolderDescendants` 방문 체크로 dangling/순환 데이터를 자연 배제. 서버 데이터가 손상돼도 화면이 안 죽는다.
3. **SVAR `open` 함정 재적용** — 폴더 노드도 `open`은 렌더 가능한 자식(직속 이슈 OR 하위폴더)이 있을 때만 부여. 빈 폴더에 open 주면 leaf-open 크래시(`null.forEach`) 재발 — [[2026-07-02-issue-link-gantt]]에서 배운 함정의 폴더판.
4. **폴더 롤업** — 기간=하위 leaf min~max, 수행율=**MD 가중 평균** `round(Σ(pct×w)/Σw)`, w=originalEstimate를 MD로 환산(없으면 w=1 = "1MD 등가" 폴백). 초 단위로 뒀다면 MD 없는 leaf가 과소가중 — 가중치 단위 선택이 정확성 포인트. compute cache로 subtree leaf 1회 계산.
5. **폴더 노드는 이슈 편집 4경로에서 전부 가드** — add-link/delete-link/move-task/update-task에서 `isFolderId`면 skip, 부모 지정 모달 후보에서도 제외. 폴더는 Jira 이슈가 아니므로 이슈용 편집 경로에 흘러들면 안 됨.
6. **이슈 부모 우선순위** — effectiveParent(wbs 계층, idSet 내) > folderIssues(존재하는 폴더만) > 루트. 계층 필드와 폴더 매핑이 공존할 때의 단일 규칙.

## 검증 (03_verify_report)

실패 0. 경계면 5 resolver + read 확장 글자 단위 일치, 신설 에러코드 `GANTT_FOLDER_NAME_TOO_LONG` 전 구간(정의→throw→매핑→i18n→merge) 정합, jest 146/146 PASS, 프론트 빌드 성공. 쿼리키 신규 없음(`ganttKeys.data` 재사용).

## 행 순서 드래그 — 설계만 (미구현)

`_workspace/gantt-row-order/01_architect_design.md` (2026-07-02). 확정 결정: 이슈용 신규 `gantt_issue_order` + 폴더는 기존 `sort_order` 재사용(통합 테이블 배제), midpoint 대신 **형제 밴드 0..n-1 일괄 정규화**(fetch 순서 불안정으로 midpoint 기준점이 흔들림), bulk 단일 resolver `reorderGanttNodes`, read는 additive `content.issueOrders{}`, 그룹 내 **폴더 밴드 상단·이슈 밴드 하단** 분리(두 정수 공간 불교차). 구현 착수 시 이 설계서 그대로.

## 교훈

- **"가상 노드" 레이어는 additive 확장 + 어댑터 합성**이 안전하다 — 기존 read 계약(tasks shape)을 동결하고 별도 필드(folders/folderIssues)로 실어 프론트 어댑터에서 병합하면, 기존 소비 코드 회귀가 구조적으로 0이 된다(folderIssues 선례 → row-order 설계도 동일 패턴 채택).
- 트랜잭션 없는 DB에서 다단계 구조 변경(삭제 승계)은 **스냅샷 먼저 + WHERE 멱등 순차**가 표준 답.
- 롤업 가중 평균은 **가중치 단위**(초 vs MD)까지 설계서에 못 박아야 한다 — 폴백 값("1MD 등가")과 단위가 어긋나면 조용히 왜곡된다.
