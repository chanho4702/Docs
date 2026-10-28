# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 현행화 기준: **2026-08-10 / 소스 `03857aa`(2026-08-10)**
> 제품 문서(`Moves_Workforce_*.md`)는 별도 기준선을 가진다 — `README.md` 「문서 기준선」 참조.

## 프로젝트 개요

Atlassian Jira Cloud용 Forge 앱 (Moves RMS). 프로젝트 인력·팀 관리, 워크로그 추적, MD/MM·가동률·진척도·비용 분석, 간트.
브랜치: `RFC-NNN`, 개발 통합: `develop`, 메인: `master`

## 기술 스택

- **런타임**: Forge (`nodejs22.x`, arm64, 256MB) — `manifest.yml`의 `runtime.name`이 단일 진실
- **프론트엔드**: React 18, React Router 7 (MemoryRouter), Zustand 5, TanStack Query 5
- **UI**: Atlaskit (Jira 공식 디자인시스템) + `@compiled/react`
- **차트/시각화**: ECharts(`echarts-for-react`), FullCalendar 6, `@xyflow/react`(상태 플로우), `react-grid-layout`(대시보드), `react-kanban-kit`(칸반), `@svar-ui/react-gantt`(간트 — MIT. GPL인 `wx-react-gantt`는 사용 금지)
- **마크다운/ADF**: `@mdxeditor/editor`, `marklassian`, `adf-to-md`
- **유틸**: `dayjs`, `moment-timezone`, `p-limit`(동시성 제한)
- **DB**: Forge SQL (MySQL/TiDB) + Forge KVS (NoSQL)
- **빌드**: CRA + **craco**(`craco start` / `craco build`, 설정은 `static/ui/craco.config.js`), 빌드 뒤 `bundle:check` 게이트가 이어 붙는다 | **테스트**: jest(프론트도 `react-scripts test`가 아니라 jest 직접, 화면 테스트는 `@testing-library/react` 14 + `jest-dom` 5 — jest 27 호환 고정) | **모니터링**: Sentry | **i18n**: `@forge/bridge`
- **백엔드 의존성**: `@forge/api`, `@forge/sql`, `@forge/kvs`, `@forge/events`, `@forge/resolver`, `exceljs`(엑셀 업로드)

## 주요 커맨드

```bash
# 백엔드 테스트 (루트) — jest
npm test

# 프론트엔드 개발 서버
cd static/ui && npm start

# 프론트엔드 테스트
cd static/ui && npm test

# 프론트엔드 빌드 (prebuild에서 자동으로 번역 merge 실행)
# build = build:app(craco build) + bundle:check(번들 예산 게이트 — 초과해도 경고만)
cd static/ui && npm run build
# CI와 동일 조건으로 확인하려면: CI=true npm run build   ← 로컬만 통과하고 CI가 깨지는 것을 막는다

# 번역 파일 병합 — 실제 스크립트: locales/script/merge.js
cd static/ui && npm run merge

# Forge 배포 (manifest.yml 기준)
forge deploy
forge tunnel   # 로컬 개발용 터널
```

## 번역(i18n) 규칙

**`locales/en-US.json`, `locales/ko-KR.json` 직접 수정 금지.**

번역 추가 시:
1. `locales/kr/{기능}.json` + `locales/en/{기능}.json` 에 번역 키/값 추가 (파일명은 기능 단위. `locales/script/*.json`은 빈 스텁이라 거기 넣으면 merge에 반영되지 않음)
2. `cd static/ui && npm run merge` 실행 (`locales/script/merge.js`) → `locales/kr/*.json` + `locales/en/*.json` → `ko-KR.json` / `en-US.json` 생성

UI에서 번역 사용: `useI18nStore`의 `t()` 함수 (`static/ui/src/stores/useI18nStore.js`)

## 백엔드 아키텍처

### 계층 구조
```
src/index.js  →  Controller  →  Service  →  (Repository)  →  DB
```

도메인별로 `src/resolver/{도메인}/` 아래에 묶여 있음.

| 분류 | 도메인 디렉토리 |
|------|----------------|
| 프로젝트 | `project`, `projectIssue`, `projectDashboard`, `projectCalendar`, `projectProgress`, `projectCost`, `projectTeam`, `projectSubscription` |
| 분석 | `issueAnalysis`, `resourceAnalysis`, `teamAnalytics`, `portfolioDashboard` |
| 개인 | `myWork`, `mySchedule`, `myPage` |
| 자원 | `resourceManagement`, `workAssignment` |
| 기타 | `gantt`, `storage`, `scheduler`, `license`, `utils` |
| 백오피스 | `backoffice/{user,role,level,team,skill,permission,setting,projectStatus,publicHoliday}` |

- `XxxController.js` — resolver 함수 등록 (`registerXxxController(resolver)` export)
- `XxxService.js` — 비즈니스 로직
- `XxxRepository.js` — DB 접근 (선택적, 없는 도메인은 Service에서 `src/rdb/query/` 직접 사용)
- 일부 도메인은 `.jsx` 확장자 사용 (`myWork`, `mySchedule`)

**새 컨트롤러 추가 시**: `src/index.js`의 **`CONTROLLER_REGISTRARS` 배열에만** 추가한다. 권한 계약 테스트(`test/permission/permissionMap.contract.test.js`)가 이 배열을 import 해 등록 함수명을 수집하므로 목록을 두 곳에 복제하지 않는다.
(주의: 대부분 `registerXxxController` 네이밍이나 `ProjectStatusController`는 `projectStatusController`, Sentry는 `SentryConfig`로 일관성 없음)

### 권한 가드 + 응답 표준화 — `guardedDefine`

resolver 등록은 `guardedDefine`을 쓴다. 이 함수가 `responseWrapper`를 내부로 흡수하므로 **`resolver.define` + `responseWrapper` 조합은 신규 코드에서 사용하지 않는다.**

```js
// src/permission/permissionGuard.js
import { guardedDefine } from '../../permission/permissionGuard';

export function registerProjectTeamController(resolver) {
    guardedDefine(resolver, 'getProjectTeams', ({ payload }) => getProjectTeamsService(payload));

    // 가드 통과 후 req.principal 이 부착된다
    guardedDefine(resolver, 'getTeamMemberCandidates', ({ payload, principal }) =>
        getTeamMemberCandidatesService(payload, principal));
}
```

- `src/permission/PermissionMap.js` — **미선언 함수는 원천 거부(deny-by-default)**. 신규 resolver 함수는 여기 등록이 필수이며, 빠뜨리면 런타임에서 `PERMISSION_UNMAPPED`로 죽는다.
- 스코프/정책 모듈: `PrincipalResolver`, `ProjectScope`(`ALL | MEMBER_ONLY | TEAM_ONLY`), `ResourceCatalog`, `CostAccess`(`PROJECT_COST` 분리), `SalaryVisibility`, `TeamAnalyticsScope`, `TeamLeadFieldPolicy`

**⚠ 가드 통과 = 데이터 범위 확정이 아니다.** 가드는 "이 함수를 부를 수 있나"만 본다. 재무·인사 데이터를 내주는 resolver는 `principal`을 서비스까지 전달해 **응답 내용을 따로 좁혀야** 한다. 실제로 밟은 것들:
- 급여·원가는 정책(`SalaryVisibility`)과 **별개로** `CostAccess.canReadCost(principal)`를 함께 요구한다. 정책만 보면 기본값(INDIVIDUAL) 설치가 전부 열린다.
- 인력 명부는 `TeamAnalyticsScope.resolveTeamAnalyticsScope(principal)` 단일 출처를 따른다. 시드 `Team Lead` 프리셋이 `RESOURCE_MANAGEMENT read`를 가지므로 스코프를 안 보면 팀장이 전사 명부를 본다.
- **한 화면만 막으면 형제 resolver로 우회된다.** 같은 데이터를 내주는 경로를 전부 찾아 같은 판정을 통과시킬 것 (인력 명부는 5개였다).
- 읽기에만 있고 쓰기에 없는 검증을 조심할 것. 검증은 **공용 함수로 뽑아** 두 경로가 같은 것을 보게 한다 (`assertTeamInProjectScope` 전례).
- `principal` 누락은 **fail-close** 여야 한다 — 컨트롤러가 전달을 빠뜨려도 조용히 열리지 않게. `scopedProjectIds(undefined)`는 `[]`(0건)이다(RFC-198). 사용자 컨텍스트가 없는 배치는 `SYSTEM_PRINCIPAL`을 **명시적으로** 넘긴다.
- `project: 'detail' | 'inherited'` resolver는 스코프 사용자에게 `projectId`/`project_id`가 **필수**다(없으면 거부, RFC-198). 프로젝트 컨텍스트가 없는 resolver를 `detail`로 선언하면 항상 거부되므로 `'none'`으로 둔다.
- 권한 세트 **배정**(사용자 편집·팀 세트·팀 이동)은 `PermissionAssignment.assertCanAssignPermissionSet`을 통과해야 한다 — 배정자는 자기 권한을 넘는 세트를 줄 수 없다(Jira admin·`PERMISSION_MANAGEMENT write`만 상한 없음). 직접 배정과 팀 상속 경로가 같은 판정을 쓴다.
- 응답 형태는 종전과 동일:
  - 성공 `{ success: true, ...result }`
  - 실패 `{ success: false, error: { name, code, message, cause } }`

### 에러 처리
- 커스텀 에러 클래스: `src/error/` (`CustomEntityError`, `ForgeAPIError`, `LogicalError`, `SqlError`, `PermissionError`, `ProjectScopeError`)
- 에러 코드 정의: `src/utils/errors/ErrorCodes.js`
- 이 에러들을 throw하면 가드/래퍼가 `{ success:false, error }` 형태로 직렬화

### DB 접근 패턴
- **MySQL**: `src/rdb/query/` 의 Query 클래스 사용 — `CommonQuery`, `ProjectQuery`, `ProjectDashboard`, `ProjectUsersQuery`, `ProjectTeamQuery`, `ProjectSubscriptionQuery`, `PortfolioSnapshotQuery`, `GanttFolderQuery`, `SkillMappingQuery`, `UserQuery`, `UserSchedule`. 쿼리 조립은 `QueryBuilder.js`
- **NoSQL (KVS)**: `src/nosql/query/CustomEntityManager.js` 사용
- Storage 엔티티(role, level, team, skill, permission, status, status_link, settings, holiday, job, job_batch, job_fail 등)는 KVS, 프로젝트/사용자/워크로그/구독 데이터는 MySQL
- 스키마/마이그레이션: `src/rdb/schema/` (`ddl/`, `migrate.js`, `isDBReady.js`) — DDL은 `ddl/index.js`에 등록
- **Forge SQL(TiDB) 제약**: FK 미강제, `ON DELETE CASCADE` 무효, 트랜잭션 미지원 → cascade 삭제는 앱 레벨 순차 멱등 DELETE로 구현
- KVS는 **빈 문자열 저장을 거부**한다. 선택 필드는 `|| ''` 대신 속성 자체를 생략할 것
- KVS 엔티티에 새 속성을 추가하면 `manifest.yml`의 attributes 선언을 먼저 바꾸고 `forge deploy` 해야 한다 (아니면 저장 시 422)
- **`findAll()`은 100건 하드캡**이고 커서를 버린다 — 초과분이 **조용히** 잘린다. 전량이 필요한 곳(목록 조회, 이름 중복 판정 등)은 `findAllPaged(indexName, pageLimit, maxItems)`를 쓴다. 목록과 중복 판정이 다른 상한을 쓰면 "목록엔 없는데 저장은 거부"가 생기므로 상한은 상수로 공유할 것 (스킬 프리셋이 133개라 실제로 밟았다)

### Jira API
- **이슈 공수 Custom field value function(asApp 플랫폼 예외, 2026-10-13)**: `src/customField/effortValues.js`의 `plannedHours`·`recordedHours`·`effortProgress`는 `issue/bulkfetch`에서 `timeoriginalestimate`·`timespent`·`project`와 `movesRmsLink` 표시 표식만 읽는다. 입력 이슈를 100건씩, 최대 1,000건 조회하며 워크로그 원문과 승인 문서는 읽지 않는다. 공식 value function은 asUser를 지원하지 않고 결과를 모든 이슈 열람자에게 공유·저장하므로 사용자별 판정은 없다. 표식은 표시용이며 권한 근거가 아니다. 계획·기록은 시간, 진행률은 기록/계획×100(완료율 아님, 100% 초과 가능)이다. 승인 확정 통계와 구분하며 이슈 조회 때 갱신되므로 JQL·REST는 마지막 조회값일 수 있다. 새 DB·트리거·배치는 없다.
- `src/api/jira/` 아래 `UserApi`, `IssueApi`, `WorklogApi`, `TimeTrackingApi`
- `@forge/api`의 `requestJira()` 사용, `src/api/jira/util/RequestJiaJson.js`로 표준화
- **`asUser()`가 기본**. `asApp()`은 아키텍처 문서에 열거된 플랫폼 예외에만 사용한다 (마켓플레이스 심사 부담)
- **승인 앱 연동(asApp ⑦·⑧, 2026-10-19 채널 전환)**: 엔티티 프로퍼티 교환은 없다. 승인 앱과는 페어링된 dynamic webtrigger + Ed25519 봉투(공유 `src/integration/channel/*`, 승인 앱 원본과 바이트 동일)로만 주고받고, 요청에는 resolver context 의 사람(actor)이 서명돼 실린다(`ActorScope` — payload 의 사람 id 금지). 인증·원가는 승인 앱 `cert.query`, 통제·숨김 기록은 `issue.control`(hidden id), 쓰기는 `write.judge`→asUser 저장→`write.commit`(판정 불가면 넘김 — fail-close), 결재선은 `flows.list`. 승인 앱이 묻는 팀 구조·연결·작성 기간·환산 기준은 `org.get`·`link.resolve`·`kb.get` 핸들러가 워크포스 SQL·KVS 로 답한다. 팀장 이슈 설정 원장은 KVS `approvalLink:issueSetting:{issueId}`. 상세 규칙은 `AGENTS.md` ⑦·⑧
- **연동 모드 프로젝트 워크로그 = 앱 자격 읽기(asApp ⑨, 2026-10-28 RFC-220 검토 F1·F2·F3)**: `approvalLinkMode === 'ON'` 이면 진척도·원가·인력 분석·대시보드·관계 그래프·프로젝트/협업 캘린더·이슈 분석·내 작업의 워크로그를 asApp 으로 읽는다(`src/permission/WorklogReadAuthority.js`, 판정 `applyWorklogApproval` `readAs:'app'`). 범위는 워크포스 가드(프로젝트 스코프·팀장·협업)가 정하고 Jira Browse 로 다시 좁히지 않는다. 숨김 행은 승인 앱 `issue.control`(AGGREGATE) hidden 에 있는 것 + (그 밖의 제한 행은) 조회자 asUser `worklog/list` 가 돌려준 것만. 이슈 키 경로는 `link.resolve` 와 같은 연결 판정(`IssueWorklogReadAuthority`)을 통과해야 앱 자격. 행 범위는 기존 화면 그대로(본인 필터가 있던 화면만 selfOnly). 연동 OFF 는 기존 asUser 그대로. 상세 `AGENTS.md` ⑨
- **채널 asApp 사용처**: `/user?accountId`(서명 actor 활성 확인), `search/jql`(link.resolve 연결 판정), 숨긴 본인 기록 `GET issue/{id}/worklog`(승인 앱이 답한 hidden id 만, 불변식 8 예외 ①~⑥), 원가 보충 `worklog/list`(숫자 집계만, 연동 OFF·asUser 읽기 경로에서만), 옛 프로퍼티 정리 DELETE. 서명 키·페어링이 없으면 채널 호출 0. Runs on Atlassian 자격은 포기했다(dynamic webtrigger·egress, 사용자 결정 D4)
- 커스텀 필드 조회 시 `fieldsByKeys: true` 필수 — `getCustomFieldId`가 Forge key를 반환하므로 `false`면 앱 필드가 조용히 누락된다
- **협업 모드(asApp ⑥)**: 켜진 프로젝트에서 참여 인원의 작업관리·캘린더·대시보드 **조회**만 앱 자격이다. 판정은 `src/permission/CollabAccess.js` 하나뿐 — 새 화면에 적용할 때 자체 판정을 만들지 말 것. 서버 판정형 resolver(간트·대시보드)는 `resolveCollabReadAuthority` 결과를 전용 페처의 `as` 로만 넘기고, **쓰기 검증(`fetchGanttGraph`·`assertIssueIdsInProject`·`areIssuesAccessible`)은 항상 본인 자격**으로 둔다. 앱 자격 결과를 캐시할 때는 본인 자격 캐시와 **키를 분리**한다(`WorklogService` KVS 키는 사용자 구분이 없다). 협업 전용 resolver 는 JQL 문자열을 받지 않고 `CollabJqlBuilder` 만 쓴다. 프론트는 `hooks/useProjectReadAuthority.js` 가 분기의 단일 출처이며, 페처 훅 한 곳에서 경로를 고르고 쿼리 키에 `'app'` 구분을 넣는다(payload 에 `collabMode`·`readAuthority`·`jql` 를 싣지 않는다)

## 프론트엔드 아키텍처

### 라우팅 (`static/ui/src/App.jsx`)
Forge `view.createHistory()` 를 `router/ForgeHistoryRouter.jsx` 로 React Router 에 꽂는다(2026-08-26) — 경로가 Jira URL 해시(`#!/project/3`)에 실려 **새로고침 복원·뒤로가기·딥링크 공유**가 된다. Forge 밖(테스트·로컬)에서는 `MemoryRouter` 폴백. 앱 로드 시 i18n 초기화 + 권한 로드 + history 준비 후 렌더링.
```
/                          → /myWork 로 리다이렉트
/myWork                    → WorklogPage (기본 진입)
/dashboard                 → PortfolioDashboardPage (전사 통합 대시보드)
/project                   → MainPage  (탭: 프로젝트 목록 + 칸반)
/project/:id               → ProjectDetailPage
/resource                  → ResourcePage (인력현황 / 프로젝트배정 / 팀 분석)
/my-page                   → MyPage (개인 대시보드)
/backoffice/users          → UserPage
/backoffice/team           → TeamPage
/backoffice/skill          → SkillPage
/backoffice/role           → RolePage
/backoffice/level          → LevelPage
/backoffice/project-status → ProjectStatusPage
/backoffice/setting        → SettingPage
/backoffice/permission     → PermissionSettingPage
/backoffice/public-holiday → PublicHolidayPage
/backoffice/storage        → StoragePage (DB 사용량 모니터링)
```

탭 구성은 `static/ui/src/constants/tabs.js`에 정의 (`mainPageTabs`, `projectDetailTabs`). 권한에 따라 `canRender`로 탭 노출 제어.

### 코드 스플리팅 주의 (2026-08-05 재도입)
탭 컴포넌트는 `React.lazy`로 분할돼 있다. **각 컨테이너의 첫 탭은 정적**으로 두고, lazy 탭은 반드시 `CommonTab.jsx`의 Suspense 경계 아래에 있어야 한다. 경계 없이 suspend 하면 React error #426이 난다 (2026-08-04에 lazy를 전면 원복했던 원인). 루트 `index.js`가 `ReactDOM.render`(legacy)라 `startTransition`·`isPending`은 무효이므로, #426은 Suspense 경계로만 막는다.

### 상태 관리 (Zustand Stores)
`static/ui/src/stores/`
- `useI18nStore`: `t(key)` 번역 함수, `init()` 초기화
- `usePermissionStore`: `canRead(pageId)`, `canWrite(pageId)` 권한 체크, 백오피스 페이지 접근 제어
- `useLicenseStore` + `licenseDecision.js`: 라이선스 상태. **차단은 명시적 INACTIVE 하나뿐**이다 — 판정 불가(UNAVAILABLE)는 통과시킨다. 백엔드 `assertLicenseAllowed`가 `responseWrapper`로 모든 resolver를 감싸므로, 판정 불가를 차단으로 다루면 상류 5xx 한 번이 앱 전면 정지가 된다. 프론트·백엔드가 **같은 경계**여야 "서버는 응답하는데 화면만 가이드 페이지"가 안 생긴다
- `useJobStore`: 엑셀 업로드 작업 ID 추적 (localStorage, TTL 24h)

### 서버 상태 (React Query)
쿼리 키는 팩토리 함수로 관리: `static/ui/src/utils/queryKey/`
`userKeys`, `projectKeys`, `backofficeKeys`, `portfolioKeys`, `resourceKeys`, `teamAnalyticsKeys`, `assignmentKeys`, `myWorkKeys`, `myPageKeys`, `jiraKeys`, `logicalAuditKeys`, `movesDocsKeys`, `confluenceKeys`
```js
userKeys.all           // ["users"]
userKeys.list(params)  // ["users", "list", params]
projectKeys.kanban()   // ["kanban"]
```
**새 쿼리 키는 반드시 `queryKey/` 아래 팩토리 함수로 정의.** `queryKeyContract.test.js`가 계약을 검사한다.

### 공용 UI 지점 (RFC-178, 2026-08-05)
새 화면은 아래를 먼저 확인하고 재사용한다. 스피너는 전면 제거됐고 로딩은 스켈레톤으로 표현한다.

| 용도 | 위치 |
|------|------|
| 페이지 셸/헤더 | `components/layout/PageContainer.jsx`, `PageHeader.jsx` |
| 대시보드 그리드 | `components/layout/BentoGrid.jsx` |
| 로딩 표현 | `components/skeleton/Skeleton.jsx`, `components/table/skeletonRows.js` |
| 테이블 | `components/table/` (`CommonTable`, `PagingTable`, `CursorPagingTable`, `TreeTable`) |
| 카드/전체화면 | `components/card/` (`Card`, `CardFullscreen`, `Summary`) |
| 차트 공통 | `components/chart/` (`ChartTableToggle`, `ViewToggleButtons`, `EmptyState`, `expandContext`) |
| 차트 색상 | `constants/chartPalette.js` |

### 프론트엔드 Jira 직접 호출
일부 화면은 백엔드 resolver를 거치지 않고 `static/ui/src/utils/jiraApi/`에서 `@forge/bridge`의 `requestJira`로 Jira REST를 직접 호출 (JQL 생성기 `jqlMaker` 포함).
커스텀 필드 write 직후 `search`/`jql` 재조회는 인덱스 지연으로 옛 값이 오므로, invalidate 대신 서버 응답으로 캐시를 패치한다.

### Forge Bridge 호출
```js
import { invoke } from '@forge/bridge';
const result = await invoke('resolverFunctionName', { ...params });
// content를 사용하는 응답 예시. 실제 필드와 중첩은 해당 resolver 계약을 확인한다.
// result: { success, content, error }
```

## 주요 페이지 구조 (`static/ui/src/pages/`)

- `myWork/` — 내 워크로그 페이지 (기본 진입, `/myWork`)
- `myPage/` — 개인 대시보드 (`/my-page`)
- `portfolio/` — 전사 통합 대시보드 (`/dashboard`)
- `resource/` — 자원관리 (`/resource`, 인력현황·프로젝트배정·팀 분석)
- `project/` — 프로젝트 목록 (`/project` 탭)
- `projectKanban/` — 칸반 보드 (`/project` 탭, `ProjectKanbanBoard`)
- `license/`, `nonPermission/` — 라이선스 만료·권한 없음 화면
- `projectDetail/` — 프로젝트 상세 (`/project/:id`), `ProjectDetailTabs` 기반 탭:
  - `dashboard/` — 대시보드 (`react-grid-layout`)
  - `user/` — 프로젝트 인력 (하위: 인력 / 급여 `salary/` / 작업 배정 `assignment/`)
  - `work/` — 작업관리 (목록 | 트리 | 간트 뷰 전환, `gantt/` 포함)
  - `progress/` — 진척도
  - `cost/` — 비용
  - `calender/` — 프로젝트 캘린더 (FullCalendar)
  - `issue/` — 프로젝트 이슈
  - `taskHistory/` — 작업 이력
  - `analysisReport/issue|resource|team/` — 이슈·인력·팀 분석 리포트
  - `documents/` — 문서 (Confluence 문서 연결·분류·해제 + [문서 | 작업 | 현황] `?view=` 전환, 백엔드 없음)

백오피스 페이지는 별도로 `static/ui/src/backoffice/page/` 아래에 위치 (`user`, `team`, `skill`, `role`, `level`, `permission`, `setting`, `projectStatus`, `publicHoliday`, `storage`).

## Forge 앱 특이사항

- **manifest.yml**: Global Page, Custom Fields(projectId, coworkers, projectAssignedDate, projectAssignedById, wbsParent), Scheduled Trigger, SQL, Storage 정의
- **설치 트리거** (`src/trigger/onInstall.js`): SEED_VERSION 관리, KVS에 기본 데이터 초기화 (시드 값은 `src/seed/SeedData.js`)
- **스케줄 트리거**: `runPortfolioSnapshot`(전사 대시보드 스냅샷), `runSubscriptionReconcile`(프로젝트 구독 정합성 스윕, RFC-171)
- **큐 기반 업로드** (`src/queue/consumer.js`): 대용량 사용자 업로드는 `@forge/events` 큐 사용, 프론트는 `JobPollingManager.jsx`로 진행률 폴링
- **DB 마이그레이션**: `src/rdb/schema/migrate.js` → `runMigration` 함수 (manifest에 등록)
- **환경 분리**: dev/prod 앱이 한 사이트에 공존하면 같은 이름의 커스텀 필드가 2벌 생겨 JQL 이름 매칭이 모호해진다. 운영 사이트에는 단일 환경 앱만 설치할 것
- **팀 관리형 프로젝트**: Forge 커스텀 필드가 `fields` 응답에서 통째로 빠진다(write·JQL 인덱스는 동작). `projectId`는 커스텀 필드 그대로 쓰고, **`coworkers`·등록일·등록자·`wbsParent`는 이슈 엔티티 프로퍼티(`movesRms`)로 이전 완료**다(`manifest.yml`의 `jira:entityProperty`, `searchAlias`로 JQL 검색).
  - 읽기는 **반드시 `static/ui/src/utils/jiraApi/coworkerProperty.js`(프론트) / `src/api/jira/issue/IssuePropertyApi.js`(백엔드)만** 사용한다. `issue.properties` 인라인 접근 금지.
  - 쓰기는 `mergeIssueProperty`(read-merge-write)로 다른 키를 보존한다. `writeIssueProperty`는 전체 교체라 기존 값을 날린다.
  - `getCoworkerFieldIdApi`/`coworkerFieldId` 인자는 **호환 유지용이며 읽기에 쓰이지 않는다**(`IssueApi.js` 주석 참조). 새 코드에서 이 경로로 coworker를 읽지 말 것
- **다중 제품 호환**: `app.compatibility` = Jira 필수 + Confluence 선택(2026-09-30, **되돌릴 수 없음**). Confluence 가 없는 사이트에서도 앱은 동작하고 문서 탭만 읽기 폴백.
- **Confluence 스코프는 `search:confluence` 하나**다. 문서 탭의 Confluence 호출은 `/wiki/rest/api/search` 뿐(검색·id 조회·스페이스 목록·가용성). 다른 Confluence 주소를 쓰면 스코프 추가 = 메이저 버전 + 관리자 재승인.
- **문서 탭 규칙** (`pages/projectDetail/documents/`, 정본 `DOCUMENTS.md`):
  - 이슈 프로퍼티 `movesDocs` 는 읽기 `utils/jiraApi/movesDocsProperty.js`(`readPages`), 쓰기 `movesDocsWriter.js`(read-merge-write)만 거친다. 인라인 `issue.properties.movesDocs` 접근 금지. 계약에 `url` 없음 — 링크는 page id 로만 조립.
  - Jira·Confluence 를 **프론트에서 사용자 자격으로 직접** 부른다 → 서버 가드·`PermissionMap`·라이선스 판정이 닿지 않는다. 게이트는 화면에만 있다(읽기 `PROJECT read` + `findProjectById` 범위 판정 뒤 조회, 쓰기 `canWrite('PROJECT')`).
  - 호출 실행기는 `utils/requestCore.js` 기반(`movesDocsRequest.js`, `confluenceApi/requestConfluence.js`) — **실패를 던진다**. 기존 `requestJira.js` 의 `executeRequest`(실패 = 값)와 섞지 말 것(빈 본문 2xx 를 실패로 보고, 404 를 "없음"으로 못 본다).
  - 작업 없이 연결한 「프로젝트 문서」만 예외로 서버에 둔다 — KVS `ProjectDocs:{projectId}` + resolver `getProjectDocLinks`/`setProjectDocLinks`(PROJECT read/write·detail). 프론트는 이슈 키 자리에 `PROJECT_TARGET` 을 넣어 같은 병합 경로를 탄다.
  - 설정(분류·기준일)은 `settings` 엔티티 `docCategories`·`docStaleDays` — `getSettingData`/`updateSetting` 확장, 새 resolver 없음.

- **승인 앱 채널(webtrigger) 안에는 사용자 세션이 없다** (2026-10-20 dev 실측): `asUser()` 호출은 던진다. 채널 핸들러가 기존 guarded resolver·서비스를 재사용하면 가드의 Jira 관리자 판정(`/mypermissions`)·이름 조회(`/user/bulk`)에서 깨진다 → 채널 경로(`currentVia() === 'APPROVAL_CHANNEL'`)는 워크포스 권한 세트만으로 판정하고 이름은 비운다(`PrincipalResolver`·`UserService.userMap`). `runWithActor` 의 안쪽 scope 는 같은 actor 면 바깥 채널 표시를 물려받는다(`ActorScope`). 채널로 새 서비스를 열 때는 그 안의 asUser 호출부터 찾을 것.
- **KVS `batchGet` 은 없는 키를 `failedKeys`(`code:'KEY_NOT_FOUND'`)로 준다** — 그것만 "없음"으로 보고 나머지 실패는 던진다(`IssueSettingStore.readMany`). 테스트 가짜 저장소도 같은 모양으로.

## 외부 조회 API

고객용 연결 가이드(앱 REST API 켜기·OAuth 앱·동의·토큰·호출·오류): `docs/external-api/README.md`.

## 도메인 상세 문서

- `src/resolver/gantt/GANTT.md` — 간트 데이터 모델·폴더 계층·저장 방식
- `static/ui/src/pages/projectDetail/work/WORK_VIEWS.md` — 작업관리 뷰 전환 셸(목록/트리/간트)·트리 뷰 (백엔드 없음, 간트 데이터·mutation 재사용)
- `static/ui/src/pages/projectDetail/documents/DOCUMENTS.md` — 문서 탭(Confluence 문서 연결·분류·현황), 이슈 프로퍼티 `movesDocs` 계약, Confluence 호출 규칙
- `src/resolver/projectProgress/CALCULATION.md` — 진척도 산식
- 제품/설계 문서 세트는 리포지토리 루트의 `Moves_Workforce_*.md` (git 미추적)

## 하네스: 기능 설계·개발·검증

**실행 지침:** [AGENTS.md](cloudjira--AGENTS.md)의 하네스 진입점과 [feature-harness](_agents/skills/feature-harness/cloudjira--SKILL.md)를 따른다. 역할·호출·후속 재개·검증 규칙은 스킬에서 관리하며, 아래 이력은 당시 변경 기록이다.

**범위:** 신규 기능과 후속 수정은 영향 범위에 필요한 단계만 실행한다. 설명·일반 문서 편집·하네스 감사는 기능 구현 파이프라인 대상이 아니다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-09-07 | 현재 Codex TOML·스킬 경로와 협업 도구 반영, 에이전트 지침 축약, 권한·저장소·CI 검증 보강, 재개 상태·실패 의존성·구조 검사 추가 | AGENTS.md, .codex/agents, .agents/skills | 과거 이력에 기록된 규칙이 현재 파일에 누락되어 있었음. 실제 파일을 기준으로 복구하고 연결 검증 도입 |
| 2026-05-29 | 초기 구성 (에이전트 4 + 스킬 5) | 전체 | - |
| 2026-05-29 | i18n 경로 정정 (locales/kr·en이 실제 merge 소스, script는 빈 스텁) | skills/forge-frontend-dev | 진척도 페이지 구현 중 merge.js 실확인 |
| 2026-05-29 | 런타임 폴백 명시 (커스텀 agent_type·TeamCreate 미지원 시 general-purpose 서브에이전트 파이프라인) | skills/feature-harness | 첫 실전 가동에서 팀 모드 불가 확인 |
| 2026-05-30 | 순차 파이프라인을 주 경로로 승격(팀 모드는 옵션 강등), Phase 4 병렬성 정리(backend→frontend 순서 강제), 협업 프로토콜 순차 우선 재작성 | feature-harness + 에이전트 4 | 폴백이 사실상 주 경로라 문서·실행 일치시킴 |
| 2026-05-30 | 작업 디렉토리 기능별 서브디렉토리화 `_workspace/<feature>/` (기존 progress-page 마이그레이션) | 전체 | 다기능 동시 작업 시 _workspace 충돌 방지 |
| 2026-05-30 | settings.local.json 정리 (일회성 탐색 명령 제거, 재사용 패턴만 유지) | settings.local.json | allow 리스트 노이즈 제거 |
| 2026-06-11 | i18n 소스 경로 전면 동기화 (`locales/script` → `locales/kr`·`locales/en`) | CLAUDE.md i18n 규칙, 에이전트 3(architect/frontend/verifier), 스킬 3(feature-design/forge-frontend-dev/integration-verify) | 하네스 감사에서 script/*.json이 2바이트 빈 스텁임을 확인 (merge.js는 kr/en만 읽음), 5-29 정정이 forge-frontend-dev 한 곳에만 반영돼 있었음 |
| 2026-06-11 | feature-design SKILL.md frontmatter 깨짐 수정 (`/---` → `---`) | skills/feature-design | frontmatter 미파싱으로 스킬 description이 노출되지 않던 버그 |
| 2026-06-11 | 런타임 갱신 반영: 커스텀 subagent_type 직접 생성 + SendMessage 재호출(컨텍스트 유지) 채택, general-purpose+Read 우회 폐기 | skills/feature-harness | 런타임이 커스텀 에이전트 타입 4종과 SendMessage를 지원함을 확인 (TeamCreate는 여전히 미지원 → 순차 파이프라인 유지) |
| 2026-07-13 | 경계면 교차 비교에 "서비스 내부 소비자" 항목 추가 — 응답 계약 변경 시 함수명 `src/` 전역 grep으로 백엔드 내부 import/호출 지점 전수 확인 | skills/integration-verify | 프로젝트 페이지 P0에서 getProjectStatusListService 계약을 `{rows}`로 바꾸며 PortfolioDashboardService 내부 호출(배열 `.map`)을 누락 → 통합 대시보드 로딩 다운 회귀. resolver↔프론트만 보던 검증의 사각지대 확인 |
| 2026-07-22 | 경계면 교차 비교에 "다중 shape 재사용 컴포넌트" 항목 추가 — 한 컴포넌트에 2종 이상 객체를 넘기는 지점을 찾아 참조 필드 전체를 각 shape의 생산 코드와 대조 | skills/integration-verify | 작업 배정 화면에서 `ScopeSplitCell`이 `candidate.project`·`candidate.company` 양쪽에 재사용되는데 `assignedCount`가 project 전용이라 전사 스코프가 항상 "할당 작업 없음"으로 오표기. **양쪽 다 계약을 지켜서** resolver↔프론트 축 검증으로는 안 잡혔고, `?? 0`이 결함을 에러 없이 삼켰음 |
| 2026-08-10 | CLAUDE.md 전면 현행화 — 런타임 22.x 정정, 라우트 6개·resolver 도메인·쿼리키·페이지 구조 보강, `guardedDefine`/`PermissionMap` 등록 규약과 RFC-178 공용 UI 지점·코드 스플리팅 주의 추가 | CLAUDE.md | 7-23 이후 미갱신으로 실제 코드와 어긋남(문서 최신화 점검에서 확인) |
| 2026-08-10 | 백엔드 등록 패턴 정정(`responseWrapper` → `guardedDefine`) + `PermissionMap` 등록 단계 신설, 「가드 통과 ≠ 데이터 범위 확정」 규약과 KVS `findAll()` 100건 하드캡 추가 | skills/forge-backend-dev, agents/backend-engineer | 스킬이 **폐기된 패턴을 가르치고 있었고** `PermissionMap` 등록이 통째로 빠져 있었다 — 그대로 따르면 신규 resolver가 런타임에 `PERMISSION_UNMAPPED`로 죽는다 |
| 2026-08-10 | 경계면 교차 비교에 「동일 데이터 다중 경로」·「읽기↔쓰기 검증 대칭」 2행 추가 + 권한 회귀 교훈 블록 | skills/integration-verify, agents/integration-verifier | 실배포 전 감사에서 확인: 인력 명부를 한 resolver만 좁혔더니 같은 `buildPeopleContext()`를 쓰는 형제 4개로 그대로 우회됐고(화면은 막혔지만 `invoke` 직접 호출은 뚫림), 읽기가 거부하는 teamKey를 쓰기가 통과시켰으며, 급여 게이팅이 정책 기본값(INDIVIDUAL)에서는 열려 있었다 |
| 2026-10-28 | 연동 모드 프로젝트 워크로그 읽기를 앱 자격으로 전환(RFC-220 검토 F1 진척도 승인분 누락·F2 협업 집계 Browse 재필터·F3 내 작업 숨긴 본인 기록 이슈 탈락) — `resolveWorklogReadAuthority`, `applyWorklogApproval` `readAs:'app'`(asUser 재확인 없음·AGGREGATE hidden 만·`cert.query` STATS 1회), 호출자 전환, 협업 행 경로의 Q127 "본인 것만" 대체, AGENTS ⑨ 신설. 보강: 이슈 키 경로 연결 판정(`IssueWorklogReadAuthority`, `link.resolve` 판정 몸통 `createIssueLinkResolver` 로 추출), 내 작업 표·이슈 목록 selfOnly 제거, 제한 행 asUser fallback | src/permission·approvalLink·호출 서비스 13곳, AGENTS.md ⑦·⑧·⑨·사후 승인 집계 예외 | 사용자 결정 "워크포스에서는 승인 여부와 관계없이 워크포스 권한으로 볼 수 있어야 한다. 앱 권한으로 보여 주면 된다" — 설계 `_workspace/rfc220-review/04_fix_design.md` |
