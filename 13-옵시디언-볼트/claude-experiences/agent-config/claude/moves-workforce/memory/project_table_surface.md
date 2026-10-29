---
name: project-table-surface
description: RFC-184 공용 테이블 TableSurface — sortValue 정렬 계약·죽은 화살표 자동 제거·폭 동결·컬럼 리사이즈
metadata: 
  node_type: memory
  type: project
  originSessionId: caaab510-0d17-4c17-9fdb-ea3ab946dde4
  modified: 2026-08-12T05:48:09.412Z
---

공용 테이블 개선(#RFC-184, 커밋 f8366b3, 2026-08-12). `components/table/TableSurface.jsx`가 CommonTable/PagingTable/CursorPagingTable 3종의 코어(TreeTable은 별도 엔진, 범위 밖).

- **정렬 계약**: 행 셀에 `sortValue`(원본 숫자/문자, 결측은 `null` 명시)를 주면 실동작. DynamicTable이 셀 `key`를 정렬값으로 쓰는 특성의 어댑터 — `sortValue`/`sortKey`는 td 스프레드 전 strip됨. **한 컬럼에서 일부 행만 sortValue를 주면 전체가 문자열 정렬로 강등**되니 균일하게 줄 것.
- **죽은 화살표 자동 제거**: isSortable이어도 정렬값이 행마다 동일(컬럼 식별자 오용)이면 화살표를 자동으로 끔. 새 테이블에서 화살표가 안 보이면 sortValue 누락부터 의심.
- **폭 동결**: 첫 실데이터 렌더 때 계측→% 동결 + table-layout:fixed. 셀 겹침은 접기 우선→ellipsis 폴백, 편집 중 셀(focus-within)만 잘림 해제.
- **리사이즈**: 오버레이 핸들(히트 14px), 최소 48px, 더블클릭 리셋, gutter 보정(세로 스크롤바·컨테이너 폭 변화 추종).
- 공개 props 무변경 하위 호환 — 기존 호출부 60파일 무수정으로 통과.

관련: [[project-design-system-convergence]], [[project-resizable-panels]]
