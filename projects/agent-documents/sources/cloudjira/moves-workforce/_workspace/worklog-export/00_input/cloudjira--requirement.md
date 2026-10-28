# 요구사항 — Jira 전체 워크로그 CSV 추출 (worklog-export)

작성일: 2026-08-26 / 결정: 사이드바 최상위 메뉴 (A안)

## 배경·성격
- 앱(Moves RMS)에 등록된 프로젝트·인력에 국한하지 않고 **Jira 전체**의 워크로그를 필터 조건으로 검색해 CSV로 추출하는 **Jira 유틸리티**.
- RMS 도메인 스코프(`TeamAnalyticsScope`, project_users 명부)를 적용하지 않는다. 데이터 경계는 **Jira 자체 권한**(프론트 `requestJira` = asUser)이다.
- 앱이 정하는 것은 "이 메뉴를 누구에게 보여줄지"뿐 → 새 권한 카탈로그 키 `WORKLOG_EXPORT`.

## 범위
1. **사이드바** `static/ui/src/layout/Sidebar.jsx` `mainItems`에 「워크로그 추출」 항목 추가 (Resource 아래), `permission: 'WORKLOG_EXPORT'`.
2. **권한 카탈로그** `src/permission/ResourceCatalog.js`에 `WORKLOG_EXPORT` 키 추가(section WORKFORCE 또는 적절한 섹션), `src/seed/SeedData.js` 프리셋(Admin read=true, Member 기본값은 설계에서 결정), `SEED_VERSION`(현재 9, `src/trigger/onInstall.js`) 상향, 백오피스 권한 화면(`backoffice/page/permission`)에 자동 반영되는지 확인. 기존 설치의 마이그레이션 경로(`migrateFrom` 등) 확인.
3. **라우트** `/worklog-export` (`App.jsx`, lazy), 페이지 `static/ui/src/pages/worklogExport/`.
4. **데이터 수집 — 프론트 전용** (`@forge/bridge` `requestJira`, 기존 `utils/jiraApi/requestJira.js` `executeRequest` 재사용). 백엔드 resolver 없음(25초 제한 회피).
   - `POST /rest/api/3/search/jql` — JQL: `project in (...)` / `worklogAuthor in (...)` / `worklogDate >= ... AND worklogDate <= ...` / 추가 JQL(선택). nextPageToken 페이징. fields는 최소(summary, project).
   - 이슈별 `GET /rest/api/3/issue/{key}/worklog` (startAt/maxResults 페이징).
   - **워크로그 단위 재필터** — JQL은 이슈를 거르므로 기간·작성자 조건을 워크로그 `started`/`author.accountId`로 다시 적용.
   - 동시성 제한(p-limit 급, 프론트 자체 구현 또는 기존 유틸) + 진행률(이슈 n/N).
5. **필터 UI**: Jira 프로젝트 선택(`GET /rest/api/3/project/search` — 앱 미등록 프로젝트 포함), 작성자 선택(`GET /rest/api/3/user/search` 또는 `user/picker`), 기간(필수), 추가 JQL(선택). **앱 명부 기반 프로젝트/인력 셀렉터 재사용 금지.**
6. **결과 미리보기** `components/table/CommonTable` + 요약(건수·총시간) + CSV 다운로드 버튼.
7. **CSV**: UTF-8 BOM, 컬럼 = 이슈키, 요약, 프로젝트키, 작성자(displayName), 작성자 accountId, 시작일시(started, ISO 또는 로컬), 소요시간(초), 소요시간(시간), 코멘트(ADF→플레인 텍스트), 워크로그ID. Blob → `<a download>`. 기존 `utils/downloadExcelUtil.js`는 xlsx base64 전용이므로 CSV 유틸을 별도 추가.
8. **i18n**: `locales/kr/worklogExport.json` + `locales/en/worklogExport.json` → `npm run merge`.
9. **UI 규약**: 스피너 금지, `components/skeleton/Skeleton.jsx`, `components/layout/PageContainer.jsx`/`PageHeader.jsx`, Atlaskit.

## 비범위
- 백엔드 resolver/DB/KVS 저장 없음.
- xlsx 출력 없음(CSV만).
- 스케줄 추출 없음.

## 참고 전례
- 마이페이지 워크로그 엑셀: `static/ui/src/pages/myPage/sections/MyWorklogPanel.jsx` (개인 범위, 백엔드 exceljs)
- 프론트 Jira 직접 호출: `static/ui/src/utils/jiraApi/`, `pages/myWork/utils/useMyWorklogList.js`
- 사이드바 권한 게이팅: `layout/Sidebar.jsx:52` (`permission` 키 → `usePermissionStore.permissions[key].read`)
