# 요구사항 — 작업관리 탭 「작업 추가」 뷰별 제공 + 목록 그룹 하단 추가 + 맵 Bitbucket(커밋) 연동 제거 (2026-09-30)

## 배경
- 「작업 추가」(기존 Jira 이슈를 검색해 이 프로젝트에 연결하는 `IssueAddModal`)는 지금 **목록 뷰 상단**(`ProjectIssuePanel`)에만 있다. 트리·간트·맵에서는 추가할 수 없다.
- 목록은 Jira 프로젝트(스페이스) 단위 그룹으로 펼쳐 보는데, 그룹 안에서 그 스페이스의 이슈를 바로 추가할 수 없다.
- 이슈 맵 드로어의 「커밋」 탭과 카드의 커밋 아이콘은 Jira 비공개 API(`/rest/dev-status/…`)를 쓰는데 Forge에서 401이라 동작하지 않는다(2026-09-02 실측, Bitbucket OAuth 별도 RFC로 미뤄 둔 것). 제품 소유자 결정: **제거**.

## 확정 사항 (제품 소유자, 2026-09-30)
1. **4개 뷰 모두에서 작업 추가**: 목록·트리·간트·맵 뷰에서 같은 `IssueAddModal`을 열 수 있다. 버튼은 뷰 전환 셸(`ProjectWorkPanel`)에 한 번 두는 것을 우선 검토(뷰마다 복제하지 않음). 추가 뒤에는 **현재 뷰가 쓰는 데이터**가 새로 고쳐져야 한다(목록: 요약·그룹 키, 트리·간트·맵: 간트 데이터 키).
2. **목록 그룹 하단 추가**: 그룹(스페이스)을 펼쳤을 때 테이블 하단에 「이 프로젝트에 작업 추가」 버튼. 누르면 `IssueAddModal`이 **그 Jira 프로젝트로 고정된 검색**(`project = KEY`)으로 열린다 — 스페이스 선택은 잠그거나 숨긴다. 추가 뒤 그 그룹이 새로 고쳐진다.
3. **맵의 커밋 연동 제거**: 드로어 「커밋」 탭, 카드 커밋 아이콘·클릭 동작, `MapCommitTab.jsx`, `useIssueDevStatus.js`, `parseDevStatusCommits.js`(+테스트), `requestJira.js`의 dev-status 요청 항목, 관련 번역 키. 워크로그 탭은 그대로.

## 지킬 것
- 쓰기 동작 권한은 지금과 같은 `PROJECT write`(`canEdit`).
- `IssueAddModal`의 연결 로직(`updateProjectIdField` → `recordIssueAssignedDate`)은 바꾸지 않는다. 검색 범위 고정 인자만 추가.
- 백엔드 변경 없음.
- 번역은 `locales/kr|en/*.json` + merge.
- 문서: `pages/projectDetail/work/WORK_VIEWS.md`에 반영, 이슈 맵 관련 설명에서 커밋 항목 삭제.

## 하지 않는 것
- 새 Jira 이슈 **생성**(연결만 한다 — 기존 모달 그대로).
- Bitbucket OAuth 연동 대안 구현.
