# 요구사항: 간트 행 순서 드래그 (2026-07-02)

## 사용자 요구
간트 그리드에서 행(이슈+폴더)을 위아래 드래그해 **같은 부모/폴더 안에서 표시 순서를 변경**하고, 새로고침 후에도 유지.

## 현재 상태
- 행 순서 = 백엔드 조회 순서(search/jql 반환 순) 그대로 — 이슈에 순서 개념 없음
- 폴더는 `gantt_folder.sort_order` 존재하나 UI/정렬 반영 미완
- SVAR `move-task`(mode before/after) 이벤트는 GanttChart intercept 가 받고 있으나 같은 부모 재정렬은 스킵 중 (부모 변경만 처리, W-2 가드)

## 설계 결정 필요 (architect 가 확정)
1. **저장소**: (a) 통합 `gantt_node_order` 테이블(node_id = issueKey | folder uuid) vs (b) 이슈용 신규 테이블 + 폴더는 기존 sort_order 재사용 — 코드 경로 단일화 관점 검토
2. **순서 값 전략**: 소수점(midpoint) 삽입 vs 드래그 시 해당 형제 그룹 전체 일괄 정규화(bulk upsert) — ⚠️ 미정렬 형제의 조회 순서가 fetch 마다 안정적이지 않을 수 있어(midpoint 기준이 흔들림), **그룹 일괄 정규화가 안전**해 보임. 그룹 크기는 수십 개 수준이라 bulk 부담 낮음
3. **resolver 시그니처**: bulk 형(`reorderGanttNodes({projectId, orders:[{nodeId, sortOrder}]})` 단일) vs 노드별 — 프론트가 드래그 확정 시 형제 그룹 순서 전체를 보내는 흐름과의 정합
4. **read 확장**: getProjectGanttData 에 순서 정보 additive 전달(예: `nodeOrders: {nodeId: sortOrder}`) — tasks shape 동결 원칙 유지 (folderIssues 패턴)
5. **정렬 적용 지점**: ganttAdapter 에서 형제 그룹별 (sortOrder 있으면 그 순, 없으면 뒤에 fetch 순) — 폴더/이슈 혼합 그룹(폴더가 위? 혼합?) 표시 정책
6. **드래그 UX**: SVAR move-task before/after 를 reorder 의도로 매핑(로컬 적용은 기존처럼 차단 후 캐시 패치), inProgress 처리, 부모가 다른 곳으로의 드래그와의 구분(기존 W-2 가드 유지)

## 제약
- Jira write 없음(앱 DB 전용) → 캐시 패치 or 일반 invalidate 자유. 즉시 반영 원칙(폴더 mutation 패치 패턴)
- TiDB: FK/트랜잭션 없음 → bulk upsert 순차 멱등
- 프로젝트 삭제 cascade 편입
- 기존 간트 회귀 금지 (특히 move-task 의 부모 변경 경로, 필터/트리 함정)
- 저장 용량: 이슈수 비례 bounded — 문제 없음
