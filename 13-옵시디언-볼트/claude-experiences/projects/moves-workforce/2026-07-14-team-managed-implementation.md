---
tags: [moves-workforce, forge, jira, entity-property, team-managed, implementation]
created: 2026-07-14
updated: 2026-07-14
status: 구현+검증 완료 · E2E/배포 미수행 · 커밋 전
---

# 팀 관리형 지원 본 구현 — 코워커·등록일·등록자·간트계층 프로퍼티 이전

> [[2026-07-14-team-managed-field-gap|진단]] → [[2026-07-14-team-managed-poc|PoC]] → **본 구현** (feature-harness 1패스 + wbsParent 델타).
> 검증: 본검증 11 + 델타 5 통과 / 실패 0 / 미검증 1(E2E). 백엔드 219 · 프론트 74 테스트 통과, 빌드 성공.

## 무엇이 바뀌었나

- **저장소 이전**: `moves_RMS_coworkers`(user 필드)·`projectAssignedDate`·`projectAssignedById`·`wbsParent`(간트 계층, 사용자 추가 요청으로 델타 반영) → 이슈 프로퍼티 **`movesRms` 1키 객체** `{coworkers: accountId[], assignedAt: 'yyyy-MM-dd', assignedAtIso, assignedById, wbsParent}`.
- **manifest**: `jira:entityProperty`(alias `movesRmsCoworkers`/`movesRmsAssignedAt`/`movesRmsAssignedBy`) 추가. wbsParent는 JQL 불필요라 **미선언 path로 저장**(PoC로 무해 확인). PoC 블록(webtrigger·pocEntityProperty·movesRmsPoc)·`src/poc/` 제거. **커스텀 필드 선언은 유지**(파괴적 삭제 회피, 폐기는 후속 RFC).
- **신규 resolver**: `updateIssueCoworkers`(read-merge-write). `recordIssueAssignedDate`는 프로퍼티 전환(가드=prev.assignedAt — 팀 관리형 매번 덮어쓰기 부작용도 해소).
- **마이그레이션 배치는 구현 후 제거** — 사용자 결정(실 고객 0, 사내 데이터는 테스트 성격이라 리셋 허용). resolver/버튼/i18n/권한키 전부 제거(잔존 grep 0, 계약 테스트 통과). 기존 필드 데이터는 사이트에 남지만 앱이 더는 읽지 않음(재등록으로 갈음).
- **read 전환**: IssueApi 페처 6종 `&properties=movesRms` + 소비 서비스 전환. **표시 필요 지점만 bulk user resolve**(요청/페이지당 1회 — IssueAnalysis/Gantt/AssigneeStats/프론트 useUserInfos), 카운트-only(진척/비용/포트폴리오)는 resolve 생략. `getIssueAnalysisList.coworkers`·`Task.coworkers`는 **user객체 배열 유지**(백엔드 resolve 완결 → 프론트 무회귀).
- **JQL 치환 4곳**: `movesRmsCoworkers in (...)` / `= currentUser()` / `ORDER BY movesRmsAssignedAt DESC`. `moves_RMS_projectId` JQL은 무변경(JQL 전용이라 팀 관리형 OK).
- **간트**: `GanttMapper`가 프로퍼티에서 wbsParent read, `setGanttParent`가 `mergeIssueProperty`로 write(해제=null). `getAppFieldIds`·`updateAppCustomFieldValue` 삭제. 응답 계약 무변경 → 프론트 간트 무수정.

## 덤: 간트 아이콘 축소·소실 버그 수정 (동일 세션)

상위 지정으로 depth가 깊어질수록 이슈타입 아이콘이 점점 작아지다 사라지는 버그 —
공용 `IssueComponent`의 `<Image>`가 크기 미지정(Atlaskit Image 기본 `max-width:100%` 반응형)이라,
간트 트리 들여쓰기로 셀 가용 폭이 줄면 아이콘이 따라 줄어드는 구조였음. **16×16 고정 + `flex: 0 0 auto`**로 수정
(`static/ui/src/components/issue/IssueComponent.js`). 11개 화면 공용이나 원본 아이콘이 16px라 타 화면 시각 변화 없음.

## 교훈/발견

1. **설계 소비처 전수에도 구멍** — frontend 에이전트가 설계 목록에 없던 `MyIssueTable.jsx`(coworker 직접 표시)를 발견·수정. "백엔드가 fields에서 값을 빼면 프론트 어디가 공란이 되나"는 프론트 구현자가 실코드로 재검증해야 함.
2. **i18n 키는 merge.js의 `namespace=파일명` 규약** — 설계서의 플랫 키를 그대로 넣으면 이중 접두. 파일 내 중첩 구조로 넣어야 최종 키가 맞음(기존 [[forge-i18n]] 연장).
3. **간트도 같은 뿌리** — wbsParent(readOnly 필드+fields read)는 진단 때 놓친 4번째 피해자. 사용자 지적으로 델타 반영. "fields로 앱 필드를 읽는 모든 곳"이 팀 관리형 취약점.
4. asApp 채택(프로퍼티 write·마이그레이션 검색) — [[feedback_no_asapp]]와 상충, 근거: 기존 필드 write와 동등성 + 마이그레이션 전 프로젝트 완전성. **사용자 최종 확인 필요**로 보고에 명시.

## 남은 것 (배포 시)

1. `forge deploy` → **`forge install --upgrade`** (entityProperty 모듈 등록, PoC 실측상 upgrade 없인 미반영)
2. E2E: 팀 관리형에서 코워커 지정/표시·작업이력·간트 계층·myWork 협업자 검색 육안 확인. **배포 직후 기존 코워커/작업이력/간트 계층은 공란으로 시작**(마이그레이션 제거 결정에 따른 의도된 동작 — 재등록으로 갈음)
3. 후속: 커스텀 필드 manifest 폐기 RFC, `coworkerFieldId` 전달 인자·PortfolioAggregator의 getCoworkerFieldIdApi 호출 잔재 청소(무해, /field 1회 비용만)

산출물: `_workspace/team-managed-property/` (00_input·01_design·02_backend/frontend·03_verify)

## 커밋 준비 상태 (2026-07-14 세션 종료 시점)

- **본 기능**: 수정 22 + 신규 3 (`IssuePropertyApi.js`·`CoworkerResolver.js`·`coworkerProperty.js`), 삭제는 `src/poc/`(미추적이라 git 흔적 없음). locales(ko-KR/en-US)는 migration 키 추가→제거로 순변화 0.
- **별건 포함 주의**: `ProjectUsersService.js`/`ProjectIssueTable.jsx`/`IssueAddModal.jsx`에는 이전 세션의 디버그 로깅 수정이 섞여 있음(세션 시작 시점부터 M 상태). `.gitignore`·`GANTT.md`·`CALCULATION.md`도 이전 세션 잔류 — 본 기능 커밋과 분리 권장.
- **dev 환경 잔재**: development 앱에는 PoC 시점 버전(웹트리거 모듈+movesRmsPoc entityProperty)이 배포돼 있음 — 다음 `forge deploy -e development`가 자동 대체. 웹트리거 URL은 폐기 완료.
