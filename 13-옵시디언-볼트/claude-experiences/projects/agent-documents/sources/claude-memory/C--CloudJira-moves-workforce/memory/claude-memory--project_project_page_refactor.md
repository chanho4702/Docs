---
name: project-page-refactor
description: "프로젝트 관리 페이지(/project 목록+칸반) 리팩토링 — 감사 38건, P0 완료(권한=PROJECT write 통일, 상태 간헐 미표시 근본수정, StatusBadge 공용화), P1~P3 진행"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8038c85-a3dd-4b89-b6e3-9bd206fcdd5c
---

프로젝트 관리 페이지 리팩토링 (_workspace/project-page-refactor/, 2026-07-13~).

- **감사**: 38건(High 8/Mid 14/Low 16) — `00_audit.md`
- **P0 완료** (`01_p0_fix_report.md`): success 미체크 3곳, 권한 게이트 **PROJECT write 통일**(사용자 결정 — 칸반의 프로젝트 편집/삭제도 KANBAN 아닌 PROJECT write 기준), 삭제 확인 공용 `ConfirmModal` 신설, 칸반 컬럼추가 롤백 에러 rethrow
- **상태 간헐 미표시 근본원인**: invoke `{success:false}` resolve를 `Object.values({success,...rest})`로 소비 → 에러 객체가 상태 배열로 캐싱(5분 고착). 응답 `{rows:[...]}` 명시화 + 실패 throw(RQ 재시도)로 수정. **`{success,...rest}` 스프레드 계약은 이런 사고를 부른다 — 신규 resolver는 rows/list 명시 구조로**
- **StatusBadge 공용화**: `components/lozenge/StatusBadge.jsx` — 상태 색상 21종을 Atlaskit accent 토큰 쌍으로 매핑(다크모드 OK). 목록+Portfolio 공유. 상태 pill 새로 만들지 말고 이거 쓸 것
- **P1~P3 완료** (`02_p1p3_report.md`, 테스트 219+73 통과): `invalidateProjectViews`/`invalidateStatusViews` 공용 헬퍼(목록↔칸반 폴링 의존 제거), Pagination 제어형, 색 token() 치환, ProjectModal 상태도 StatusBadge, 목록 검색/액션 UI를 인력관리 패턴으로 정렬, 칸반 727→333줄(useKanbanMutations+ColumnHeader 분리), 데드코드 제거. E2E 미수행
- **시간추적 안내 오탐 폐기**: editmeta 샘플(첫 이슈) 기반 사전 판정은 이슈타입/상태별 차이로 오탐 2회 → 전면 제거, 실제 400 응답 기반(isTimeTrackingUnsupportedError)만 유지. **사전 휴리스틱보다 실제 응답 기반 판정 선호(사용자 피드백)**

관련: [[salary-management]], 반복 버그 클래스 = invoke/executeRequest success 미체크(거짓 성공 토스트) — 신규 mutation 작성 시 반드시 체크.
