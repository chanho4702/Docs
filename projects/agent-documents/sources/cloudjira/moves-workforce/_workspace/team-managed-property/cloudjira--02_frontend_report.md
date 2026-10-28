# 프론트엔드 구현 리포트 — 팀 관리형 프로젝트 지원(코워커·등록일·등록자 이슈 프로퍼티 이전)

- 날짜: 2026-07-14 · 브랜치: RFC-155
- 입력: `02_backend_report.md`(실제 응답 shape, 계약 우선) + `01_architect_design.md`(§2-3·§4·§5·§6·§8-2·§10 Frontend)
- 결과: 프론트 테스트 **8 suites / 74 tests 전부 통과**, `npm run build` **성공(신규 경고 0, 기존 source-map 경고만)**, `npm run merge` 실행 완료

---

## 1. 소비한 실제 응답 shape (backend 확정본과 글자 그대로 일치 확인)

| invoke | 프론트 전송 payload | 프론트가 읽는 경로 | 소비처 |
|---|---|---|---|
| `updateIssueCoworkers` | `{issueId: issue.id, accountIds: changeCoworker.current}` | `result.success` 분기 → 성공/실패 토스트 (content는 미사용, 직후 `searchByIssueId` 재조회) | ProjectIssueTable.updateCoworker |
| `recordIssueAssignedDate` | `{issueIds: checkItems}` (필드 id 인자 **제거**) | 비차단 — 응답 로깅만 | IssueAddModal.submit |
| `runFieldToPropertyMigration` | `{nextPageToken, pageSize:50}` | `result.success` → `result.content.{scanned,migrated,skipped,failed,nextPageToken,done}` 누적, `done`(=`!nextPageToken`)까지 반복 | MigrationSetting.runMigration |
| 검색 프로퍼티 | search POST body `properties:['movesRms']` / getIssue GET `properties:'movesRms'` | `issue.properties.movesRms.{coworkers,assignedAtIso,assignedById}` via 공통 유틸 | 전 소비처 |

- coworker read: `getIssueCoworkerIds(issue) = issue?.properties?.movesRms?.coworkers ?? []` (accountId[]) → **페이지/모달당 1회 bulk resolve**(`fetchBulkUsers` 또는 `useUserInfos`) → userMap. N+1 없음.
- `getIssueAnalysisList.coworkers` / `getProjectGanttData.Task.coworkers`는 백엔드가 user객체로 resolve 완결 → **해당 화면 프론트 무변경**(IssueAnalysisTable/useGanttData 손대지 않음).

---

## 2. 변경/신규 파일 목록

### 신규
- `static/ui/src/utils/jiraApi/coworkerProperty.js` — `MOVES_PROPERTY_KEY`, `getIssueCoworkerIds`, `getIssueAssignedAtIso`, `getIssueAssignedById`. 전 소비처가 이 유틸만 사용(인라인 접근 0).
- `static/ui/src/backoffice/page/setting/MigrationSetting.jsx` — 마이그레이션 트리거 카드(SETTINGS write 게이팅, nextPageToken 루프, 진행 카운터, done/실패 토스트).
- `locales/kr/migration.json` + `locales/en/migration.json` — 설계 §8-2 키.

### 수정
- `static/ui/src/constants/customField.js` — `MovesAlias` 상수 추가(`coworkers/assignedAt/assignedBy`).
- `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx` (핵심) — 모듈 상단 top-level `await coworkerId` **제거**, `resolveCoworkerUserMap`(페이지 1회 bulk), `userMap` state, fetchPage/searchByIssueId param에 properties 추가, coworker 셀 표시/편집/onConfirm을 accountId·userMap 기반으로, `updateCoworker`를 `invoke('updateIssueCoworkers', {issueId, accountIds})`로 전환.
- `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.js` — `assignedAt/assignedBy`를 프로퍼티 유틸 기반으로, `normalizeIssue`/`transformTaskHistory` 시그니처에서 필드 id 인자 제거.
- `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.test.js` — mkIssue를 `properties.movesRms` shape로 전면 갱신 + `properties:{}` 안전 케이스 추가(9 tests 통과).
- `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryPage.jsx` — `assignedDateFieldId/assignedByFieldId` useQuery + `fieldsReady` 게이팅 제거, 집계쿼리 fields=`['timetracking']`+`properties:['movesRms']`, `transformTaskHistory(issues,{hourRate})`.
- `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx` — props에서 필드 id 제거, fields 슬림+`properties:['movesRms']`, ORDER BY `movesRmsAssignedAt DESC`(MovesAlias), normalizeIssue 인자 정리.
- `static/ui/src/pages/myWork/modal/WorklogModal.jsx` — coworker를 `getIssueCoworkerIds`+`useUserInfos`로, JQL `movesRmsCoworkers = currentUser()`(MovesAlias), promiseOptions에 `properties:['movesRms']`.
- `static/ui/src/utils/jiraApi/issue/getJqlIssue.js` — `moves_RMS_coworkers in (...)` → `movesRmsCoworkers in (...)`(MovesAlias). projectId JQL 무변경.
- `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx` — recordIssueAssignedDate 호출에서 `assignedDateFieldId/assignedByFieldId` 조달·인자 제거. projectId 등록(updateProjectIdField) 무변경.
- `static/ui/src/backoffice/page/setting/SettingPage.jsx` — `<MigrationSetting/>` 추가.
- **[설계 §9 목록 외 추가]** `static/ui/src/pages/myWork/table/MyIssueTable.jsx` — 아래 §4 참조.

---

## 3. i18n merge 실행 여부
- `locales/kr/migration.json`·`locales/en/migration.json` 추가 후 `cd static/ui && npm run merge` **실행 완료**. `ko-KR.json`/`en-US.json`에 `migration.field2property.*` 반영 확인. ko-KR/en-US 직접 수정 없음.
- **키 구조 주의(설계와 표기 차이)**: merge.js는 `namespace = 파일명`으로 감싸므로, 설계 §8-2의 플랫 키 `"migration.field2property.title"`를 파일에 그대로 넣으면 이중 접두(`migration.migration.field2property.title`)가 되어 resolve 실패한다. 실제 동작하는 구조는 `migration.json` 안에서 `field2property` 아래에 `title/description/...`를 **중첩**하는 것 → 최종 키 `migration.field2property.title`로 정확히 매칭(기존 taskHistory.json 등과 동일 패턴). UI에서는 `t('migration.field2property.*')`/`tFormat`로 사용.

---

## 4. 설계와 달라진 점 (사유)

1. **[§9 목록 외 추가 수정] `MyIssueTable.jsx`** — 설계 §6 read경로표 #7은 myWork 계열을 "프론트 무변경"으로 표기했으나, `MyIssueTable.jsx`(line 117)가 coworker를 `issue.fields[coworkerFieldId]`로 **직접 표시**하는 소비처였다. 백엔드가 `getProjectIssuesByUser`를 프로퍼티로 전환(fields에 coworker 없음, `issue.properties.movesRms.coworkers`만 동봉)했으므로, 미수정 시 **내 작업 테이블의 코워커 컬럼이 전부 공란으로 회귀**한다. 따라서 WorklogModal과 동일 패턴(`getIssueCoworkerIds`+`useUserInfos`, 페이지 1회 bulk)으로 수정했다. `useMyWorklogList`의 `coworkerFieldId` 반환은 그대로 두되 MyIssueTable에서 미사용. → CLAUDE.md "내부 소비자 누락 방지" 취지 반영. **검증자 확인 요망 항목.**
2. **`WorklogModal`의 `coworkerFieldId` prop 잔존** — WorklogPage가 계속 전달하나 모달 내부에서 미사용(프로퍼티 경로로 대체). prop 시그니처 자체는 유지해 WorklogPage 무변경(회귀 최소화). unused-var 린트 없음(로컬 변수 아님).
3. **i18n 키 중첩 구조** — §3 참조(플랫→중첩). 설계 의도 키(`migration.field2property.*`)는 그대로, 파일 내부 구조만 merge 규약에 맞춤.
4. **coworker userMap resolve 방식** — ProjectIssueTable은 imperative createRow라 `fetchBulkUsers`로 직접 map을 만들어 createRow에 인자 주입(페이지 1회). WorklogModal/MyIssueTable은 선언형이라 `useUserInfos`(bulk+staleTime 10m 캐시) 사용. 둘 다 요청/페이지당 1 bulk로 N+1 없음(설계 §2-3 준수).

그 외 모든 항목은 설계서대로 구현. `moves_RMS_projectId` JQL·`updateProjectIdField`(projectId)·projectId 등록/삭제 경로 무변경. JQL alias 치환 4곳(getProjectIssuesByUser는 백엔드, getJqlIssue·WorklogModal·TaskHistoryTable은 프론트) 완료.

---

## 5. 테스트 / 빌드 결과
```
cd static/ui && CI=true react-scripts test --watchAll=false
Test Suites: 8 passed, 8 total
Tests:       74 passed, 74 total   (taskHistory.transform 9 tests 포함)

cd static/ui && npm run build
Compiled with warnings.  (경고는 node_modules source-map 파싱뿐 — 신규 코드 경고 0)
The build folder is ready to be deployed.

cd static/ui && npm run merge   → ko-KR/en-US 에 migration.field2property.* 반영 확인
```

---

## 7. 마이그레이션 UI 제거 (2026-07-14 후속 — 사용자 결정: 사내 데이터 리셋 허용)

사이트 데이터는 건드리지 않고(코드 제거만) 마이그레이션 트리거 UI를 프론트에서 완전 제거했다.

**제거/변경 파일**
- 삭제: `static/ui/src/backoffice/page/setting/MigrationSetting.jsx`
- 삭제: `locales/kr/migration.json`, `locales/en/migration.json`
- 수정: `static/ui/src/backoffice/page/setting/SettingPage.jsx` — `MigrationSetting` import·렌더(`<MigrationSetting/>`) 제거

**검증**
- `cd static/ui && npm run merge` 재실행 → `ko-KR.json`/`en-US.json`에서 `migration` 네임스페이스(`migration.field2property.*`) **사라짐 확인**(`k.migration === undefined`, `e.migration === undefined`). ko-KR/en-US 직접 수정 없음(merge로만).
- 전역 grep `runFieldToPropertyMigration|MigrationSetting|field2property` over `static/ui` → **잔존 0건**.
- 테스트: `npm test -- --watchAll=false` → **8 suites / 74 tests 전부 통과**.
- 빌드: `npm run build` → **성공**(Compiled with warnings — node_modules source-map 경고뿐, 신규 코드 경고 0).

**미변경(본 기능 코드 보존 확인)**: `updateIssueCoworkers` 호출, coworker/등록정보 프로퍼티 read 경로(`coworkerProperty.js` + 전 소비처), JQL alias(`MovesAlias`), `recordIssueAssignedDate` 등 팀 관리형 지원 코드는 일절 손대지 않음. 백엔드 resolver(`runFieldToPropertyMigration`)는 백엔드 소관이라 본 프론트 작업 범위 밖(존치).

---

## 6. 검증자(integration-verifier) 주의 포인트
- 경계면 일치: `updateIssueCoworkers` payload `{issueId, accountIds}` ↔ 백엔드, `recordIssueAssignedDate` `{issueIds}`(필드 id 없음) ↔ 백엔드 무시 계약, `runFieldToPropertyMigration` `result.content.done/nextPageToken` 루프.
- coworker read 잔존 grep: 프론트에서 `issue.fields[coworkerId]`/`fields[coworkerFieldId]` 표시 소비 0건 목표 — ProjectIssueTable/MyIssueTable/WorklogModal 전환 확인(MyIssueTable 포함 여부 §4-1).
- 프로퍼티 param: search POST body `properties:['movesRms']`(배열), 단건 GET `properties:'movesRms'`(문자열) — 각각 Jira POST/GET 규약.
- N+1: coworker resolve가 페이지/모달당 1 bulk인지(루프 내 호출 0).
```
