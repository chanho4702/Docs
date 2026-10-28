# core-port — Confluence 판 코어를 Jira 골격으로 이식

> 로드맵 1번. 근거: `docs/DESIGN.md` §6(재사용 지도), §7(모듈 매핑). 리포 `C:\CloudJira\moves-approval-jira`.
> 출발점: Confluence 판 `fa07591` 복사본. 기준선은 git 스테이징 영역(`git diff` = 이식 변경분).
> 기준선 테스트: 백엔드 27 suites / 188 tests 통과(2026-10-03).

## 목표

기능을 **추가하지 않고**, Confluence 에 묶인 부분을 걷어내 Jira 위에서 엔진이 돌 수 있는 골격을 만든다.
다음 기능(`timesheet-approval`)이 대상 어댑터만 붙이면 되는 상태가 완료다.

## 해야 할 것

1. **Confluence 전용 기능 제거** — 영역 매크로(`resolver/region`, `features/region`, `regionHash`), 결재란 매크로(`stamp` 엔트리·`StampBoxInserter`), byline(`trigger/bylineProperties`), 페이지 편집 트리거(`onPageUpdated`), 홈 피드(`feed` 엔트리), 매크로 엔트리, `CommentNotifier`(Confluence 코멘트). 제거에 딸린 테스트·i18n 네임스페이스(macro·banner·space 등)·ErrorCodes·정책 키도 함께 정리한다.
2. **Jira API 계층** — `src/api/confluence/` → `src/api/jira/RequestJira.js`(asUser 기본, asApp 사유 인자, 에러 본문 미노출). 이슈 열람 일괄 확인(`permissions/check`) 헬퍼, 사용자 검색·조회.
3. **권한 축 전환** — `{page:…}` → `{issue:'view'|'edit', issueIdKey}`, `{confluenceAdmin}` → `{jiraAdmin}`, 프로젝트 관리 `{project:'admin', projectIdKey}`. 목록 가시성 필터 `filterVisiblePages` → 이슈 기준. 계약 테스트 갱신.
4. **도메인** — `ResourceType` 에서 PAGE·CONTENT_REGION 을 걷고 Jira 대상을 받을 수 있게 한다. 다만 **TIMESHEET·ISSUE_TRANSITION 의 실제 규칙은 이번 범위 밖**(다음 기능). scopeKey 는 대상 종류를 확장 가능한 구조로.
5. **스키마** — Confluence 컬럼(page_id, space_key, content_version, region 등)과 스페이스 설정 테이블을 Jira 대응(issue_id/project_id 또는 범용 target 컬럼, 프로젝트 설정)으로 바꾼다. 아직 어떤 사이트에도 배포되지 않았으므로 **마이그레이션 v001 부터 재정리해도 된다**(이번이 마지막 기회 — 이후 이름 변경 금지).
6. **manifest** — Confluence 모듈을 걷고 Jira 골격: `jira:globalPage`(업무함), `jira:adminPage`(설정), `jira:projectSettingsPage`(프로젝트 설정 — 자리만), 스윕(하루 1회)·onInstall 트리거, sql. scope 는 최소(`read:jira-work`, `read:jira-user`, `storage:app`, 필요 시 `write:jira-work`). app id 는 `REPLACE-WITH-forge-register` 유지.
7. **프론트** — 엔트리를 inbox·settings·(projectSettings 자리) 로 정리, Confluence 링크(`PageLink`, 스페이스 이름 표시, 버전 diff 링크)를 이슈 링크·프로젝트 이름으로. 업무함·설정·위임·서명·알림·증명서는 살린다(대상 표시만 Jira 로).
8. **i18n** — 제거된 화면 키 삭제, Confluence 단어(페이지·스페이스)를 이슈·프로젝트로.

## 완료 기준

- `npm run merge`, `npm test -- --runInBand`, `npm run test:ui -- --runInBand`, `npm run build:ui` 모두 통과
- `grep -rni "confluence\|pageId\|spaceKey\|byline" src static/ui/src manifest.yml` 결과가 0 이거나, 남은 것마다 이유가 보고서에 있음
- 계약 테스트(resolver 3단계 대조) 통과
- 불변식 1~10 위반 없음

## 범위 밖

타임시트 규칙, 기간 잠금(timeTrackingProvider), 워크포스 연동, 이슈 전환 validator, 배포.
