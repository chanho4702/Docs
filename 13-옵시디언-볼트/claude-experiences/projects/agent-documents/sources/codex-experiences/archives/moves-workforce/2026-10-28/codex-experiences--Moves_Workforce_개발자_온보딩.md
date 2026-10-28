# Moves Workforce — 개발 신입 온보딩 가이드

> Atlassian Jira Cloud용 Forge 앱 **Moves Workforce(Moves RMS)** 에 새로 합류한 개발자를 위한 안내서입니다.
> 제품의 정체성부터 기술 구조·코드 흐름·개발 워크플로우까지 다룹니다.
> 현행화 기준: **2026-08-06 / v1.3**

---

## 1. 이 제품이 뭔가

**Moves Workforce(Moves RMS)는 Atlassian Jira Cloud용 Forge 앱입니다.** 프로젝트 인력·팀·배정 관리, 워크로그 추적, MM 공수·인건비·진척 분석, Jira 소스 구독 자동 편입을 제공합니다.

엔지니어 관점에서 핵심은 이 한 줄입니다:

> **"Jira 이슈·워크로그를 프로젝트/팀 규칙으로 연결하고 → 공수·진척·인건비 지표로 가공해 → 운영·배정·분석 화면으로 제공하는 Forge 풀스택 앱."**

일반 웹 서비스와 다른 점은 **자체 서버가 없다는 것**입니다. 우리 백엔드 코드는 Atlassian의 **Forge** 플랫폼 위에서 실행됩니다(서버리스 함수처럼). 그래서 인프라(배포·런타임·인증)는 Forge가 관리하고, 우리는 비즈니스 로직과 UI에 집중합니다.

---

## 2. 기술 스택 한눈에

| 영역 | 스택 |
|---|---|
| **런타임** | Forge (`manifest.yml` 기준 Node.js 22, arm64, 256MB) — 서버리스 |
| **백엔드** | `@forge/resolver`, `@forge/api`, `@forge/sql`, `@forge/kvs`, `@forge/events` |
| **DB** | Forge SQL(MySQL) + Forge KVS(NoSQL) |
| **프론트** | React 18, React Router 7(MemoryRouter), Zustand 5, TanStack Query 5 |
| **UI** | Atlaskit(Jira 공식 디자인시스템) + `@compiled/react` |
| **시각화** | ECharts, ApexCharts, FullCalendar, `@xyflow/react`, `react-grid-layout`, `react-kanban-kit` |
| **빌드** | CRA(`react-scripts`) |
| **모니터링** | Sentry |
| **i18n** | `@forge/bridge` 기반 번역 로더 + locale merge |

> 익숙하지 않을 수 있는 건 **Forge**와 **Atlaskit** 정도입니다. 나머지는 일반적인 React 풀스택 스택이라 빠르게 적응할 수 있습니다.

> **UI governance:** 현재 앱은 `static/ui/build`을 사용하는 React + Atlaskit **Custom UI**다. 저장소 작업 지침의 UI Kit 전용 문구와 현행 구현은 충돌한다. 별도 migration RFC가 승인되기 전에는 기존 Custom UI 패턴을 유지하며, 신규 Forge app 생성 규칙과 이 기존 앱 유지보수 규칙을 혼동하지 않는다.

---

## 3. 전체 아키텍처 — 데이터는 어떻게 흐르나

```
[React UI]  ──invoke('funcName', params)──▶  [Resolver]
 @forge/bridge                                  │
     ▲                                          ▼
     │                              Controller → Service → (Repository) → DB
     │                                                          │
     └────────  { success, content, error }  ◀─────────────────┘
                                                          │
                                              Forge SQL(MySQL) / KVS
                                                   + Jira REST API
```

핵심은 **프론트와 백엔드가 `invoke`라는 단일 통로로만 통신**한다는 점입니다. REST 엔드포인트를 직접 만드는 게 아니라, 백엔드에 등록된 **resolver 함수 이름**을 호출합니다.

```js
// 프론트
import { invoke } from '@forge/bridge';
const result = await invoke('getProjectList', { ... });
// result: { success, content, error }
```

> 예외: 일부 화면은 백엔드를 거치지 않고 `static/ui/src/utils/jiraApi/`에서 `@forge/bridge`의 `requestJira`로 **Jira REST를 직접** 호출합니다(JQL 생성기 `jqlMaker` 포함).

---

## 4. 백엔드 구조

### 4.1 계층

```
src/index.js → Controller → Service → (Repository) → DB
```

도메인별로 `src/resolver/{도메인}/` 아래에 묶여 있습니다.

- **`XxxController.js`** — resolver 함수 등록 (`registerXxxController(resolver)` export)
- **`XxxService.js`** — 비즈니스 로직
- **`XxxRepository.js`** — DB 접근 (선택적)

도메인 예: `project/`, `resourceAnalysis/`, `issueAnalysis/`, `projectProgress/`, `portfolioDashboard/`, `projectCost/`, `myWork/`, `backoffice/user/` …

> ⚠️ **새 컨트롤러를 만들면 반드시 `src/index.js`에 import + 등록 호출을 추가**해야 합니다(이 파일이 모든 resolver의 진입점). 네이밍은 일관성이 없으니 주의 — 대부분 `registerXxxController`지만 `projectStatusController`, `SentryConfig`처럼 예외도 있습니다.

### 4.2 등록 표준 — `guardedDefine` (권한 가드 + 응답 표준화)

**모든 resolver 함수는 `guardedDefine`으로 등록합니다** (2026-07 권한 고도화 이후 표준). 내부에서 **서버사이드 권한 가드**와 `responseWrapper` 응답 표준화가 함께 적용됩니다. 현재 중앙 registrar는 32개이며 팀 분석·프로젝트 구독까지 포함합니다. `getSentryDSN`도 이미 이 표준을 사용하므로 목록 밖 raw `resolver.define` 등록은 금지합니다. queue consumer·scheduled trigger처럼 resolver context가 없는 경로는 `getAppContext().environmentType`을 최종 폴백으로 사용해 실행 환경을 판별합니다.

```js
// src/permission/permissionGuard.js
guardedDefine(resolver, 'funcName', async (req) => {
    // 성공: { success: true, ...result }
    // 실패: { success: false, error: { name, code, message, cause } }
});
```

**새 resolver 추가 절차:**

1. Controller에서 `guardedDefine(resolver, '함수명', handler)` 등록
2. **`src/permission/PermissionMap.js`에 권한 매핑 추가** — `(리소스키, read|write)` 또는 `PUBLIC`(비민감 공용) / `SELF`(본인 데이터). `SELF` mutation은 controller에서 `context.accountId`를 강제하는 것에 더해 Repository SQL의 owner predicate까지 포함해야 한다
3. 매핑을 빠뜨리면 런타임은 **기본 거부**(`PERMISSION_UNMAPPED`)되고, **계약 테스트**(`test/permission/permissionMap.contract.test.js`)가 "등록 함수 ↔ 매핑" 1:1 불일치를 잡아 CI가 실패합니다

권한 키(리소스)의 목록·시드 기본값은 **`src/permission/ResourceCatalog.js`가 단일 소스**입니다 — 프론트에 PAGE 상수를 하드코딩하지 마세요(프론트는 `getPermissionCatalog` 응답을 소비). 프로젝트 데이터를 다루는 resolver는 매핑의 `project: 'list' | 'detail'` 모드에 따라 **프로젝트 조회 범위(projectScope)** 필터/소속 검증이 적용됩니다.

`projectScope`는 `ALL | MEMBER_ONLY | TEAM_ONLY`다. TEAM_ONLY scope team은 `(본인 소속 팀+후손) ∪ (본인이 리드하는 모든 팀+각 후손)`이며, 이 팀 소속 인원의 참여 프로젝트와 `project_team` 담당 프로젝트의 합집합이다. 유효 팀이 없거나 팀 인덱스 조회가 실패하면 빈 범위로 fail-close한다. 팀장 권한은 permission set이 아니라 `team.leaderAccountId`에서 파생되는 `teamLead` OR 축이며, `TeamLeadFieldPolicy` allowlist를 통과한 대상만 처리한다.

`ResourceCatalog`의 raw 카탈로그는 17키지만 `PROJECT_GANTT`는 compatibility용 dead key라 권한 관리 UI에서 숨긴다. Gantt 프론트와 서버 resolver는 모두 `PROJECT` read/write를 사용하므로 신규 Gantt 함수를 `PROJECT_GANTT`에 매핑하지 않는다. 실제 운영 설정 항목은 16개이며 `RESOURCE_MANAGEMENT`·`TEAM_MANAGEMENT`·`SKILL_MANAGEMENT`가 분리되어 있다.

커스텀 에러(`src/error/`의 `CustomEntityError`, `ForgeAPIError`, `LogicalError`, `SqlError`, `PermissionError`, `ProjectScopeError`)를 throw하면 wrapper가 알아서 `{ success:false, error }`로 직렬화합니다. 에러 코드는 `src/utils/errors/ErrorCodes.js`에 정의됩니다.

> ⚠️ **KVS 엔티티에 새 필드를 저장하려면 `manifest.yml`의 `storage.entities` attributes에도 선언**해야 합니다 — 미선언 필드는 저장 시 422(semantic errors)로 거부됩니다. manifest 스키마 변경은 tunnel만으로 반영되지 않고 `forge deploy`가 필요합니다.

### 4.3 DB 두 종류

| 종류 | 무엇을 저장 | 어떻게 접근 |
|---|---|---|
| **MySQL** (Forge SQL) | 프로젝트·사용자·일정·스냅샷·간트·스킬·프로젝트팀·프로젝트 구독(13 table). 워크로그 원본은 저장하지 않음 | `src/rdb/query/`의 Query 클래스 + `QueryBuilder.js` |
| **KVS** (NoSQL) | role·team·level(급여 밴드)·permission·settings(급여정책)·holiday·job 등 12 Custom Entity + 캐시 | `src/nosql/query/CustomEntityManager.js` |

스키마/마이그레이션은 `src/rdb/schema/`(`ddl/`, `migrate.js`)에 있고, `runMigration`이 manifest에 등록되어 있습니다.

> ⚠️ `@forge/sql` DML raw 영향 행 수는 `result.rows.affectedRows`입니다. 공통 `executeQuery`가 이를 `rowsAffected` alias로 정규화하며, test mock도 `{rows:{affectedRows:1}}` 형태를 사용합니다. SELECT의 `rows` 배열과 혼동하지 마세요.

### 4.4 Jira API

`src/api/jira/` 아래 `UserApi`, `IssueApi`, `WorklogApi`, `TimeTrackingApi`가 있고, `@forge/api`의 `requestJira()`를 사용합니다.

> 💡 **중요한 관례: `asUser` 기본, `asApp` 명시적 예외.** 허용 경로는 사용자 context 없는 배치/queue/구독 trigger, app custom field write, `movesRms` issue property, License API self-query, 앱 설정 metadata 조회다. 구독 생성은 먼저 asUser로 소스 접근을 검증하고, 사용자 resolver의 asApp 호출은 앱 권한·project scope·대상 소속을 선검증해야 한다.

---

## 5. 프론트엔드 구조

### 5.1 라우팅 — `static/ui/src/App.jsx`

`MemoryRouter` 기반(브라우저 URL이 아니라 메모리 라우팅 — Forge iframe 특성). 앱 로드 시 **i18n 초기화 + 권한 로드**가 끝나야 화면을 그립니다.

```
/myWork                    → WorklogPage (기본 진입)
/my-page                   → MyPage (개인 대시보드 + 팀장 팀 분석)
/dashboard                 → 전사 통합 대시보드
/project                   → MainPage (목록 + 칸반)
/project/:id               → ProjectDetailPage (인력/급여/배정, 작업 목록/트리/간트, 팀·진척·비용 분석)
/resource                  → ResourcePage (인력/조직/팀 분석/프로젝트 배정)
/backoffice/*              → 운영 설정 페이지들
```

탭 구성은 `constants/tabs.js`, 권한별 노출은 `canRender`로 제어합니다.

### 5.2 상태 관리 — Zustand

- **`useI18nStore`** — `t(key)` 번역 함수, `init()` 초기화
- **`usePermissionStore`** — `canRead(키)` / `canWrite(키)` 권한 체크 + `getProjectScope()`. 서버 응답을 그대로 신뢰하며 미정의 키는 **false(fail-close)** — 프론트에 기본 허용 로직을 넣지 말 것
- **`useJobStore`** — 엑셀 업로드 작업 추적(localStorage, TTL 24h)

### 5.3 서버 상태 — TanStack Query

쿼리 키는 **반드시 `utils/queryKey/` 아래 팩토리 함수로** 정의합니다(직접 배열 작성 금지). 감사 기준 legacy 직접 배열이 남아 있으므로, 수정하는 파일에서는 해당 query/invalidation을 함께 factory로 이관합니다.

```js
userKeys.all            // ["users"]
userKeys.list(params)   // ["users", "list", params]
projectKeys.kanban()    // ["kanban"]
```

급여정책이나 등급 밴드처럼 여러 화면의 응답 shape를 바꾸는 변경은 단일 키만 무효화하면 안 됩니다. `salaryBandInvalidation.js`처럼 관련 prefix(levels/users/project salary/cost/summary)를 한 헬퍼에 모아 mutation 성공 경로에서 공유합니다.

---

## 6. i18n 규칙 ⚠️ (신입이 가장 자주 실수하는 부분)

**`locales/en-US.json`, `locales/ko-KR.json`을 직접 수정하면 안 됩니다.** 이 둘은 빌드 산출물입니다.

번역 추가 절차:

1. `locales/kr/{기능}.json` + `locales/en/{기능}.json`에 키/값 추가
   - ⚠️ `locales/script/*.json`은 **빈 스텁**이라 거기 넣으면 merge에 반영 안 됨
2. `cd static/ui && npm run merge` 실행 → `ko-KR.json` / `en-US.json` 자동 생성

UI에서는 `useI18nStore`의 `t()` 함수로 사용합니다.

---

## 7. Forge 앱 특이사항

- **`manifest.yml`** — Global Page, Custom Fields(`projectId`, `coworker`), Scheduled Trigger, SQL, Storage 정의. 앱의 권한·모듈 선언서이자 단일 진실.
- **설치 트리거** (`src/trigger/onInstall.js`) — `SEED_VERSION` 관리, KVS에 기본 데이터 시드(`src/seed/SeedData.js`)
- **큐 기반 작업** (`src/queue/consumer.js`) — 사용자 업로드·포트폴리오 집계·구독 백필을 `@forge/events`로 처리. 구독 batch는 실행 직전 generation/isActive/소유 프로젝트를 재검증
- **스케줄 배치** — `portfolioSnapshot`(일일 전사 스냅샷), `subscriptionReconcile`(시간별 구독 정합성)
- **이슈 생성 trigger** (`src/trigger/onIssueCreated.js`) — 스페이스 구독의 빠른 경로. 판정 불가 조건은 defer하며 오류를 throw하지 않고 리컨실이 복구
- **급여정책 경계** — `SalaryPolicy.js`(순수 규칙), `SalaryPolicyContext.js`(I/O), `SalaryVisibility.js`(표시 fail-close), `EffectiveSalary.js`(계산)로 역할 분리

---

## 8. 주요 커맨드

```bash
npm test                          # 백엔드 테스트(jest, 루트)
cd static/ui && npm start         # 프론트 개발 서버
cd static/ui && npm test          # 프론트 테스트
cd static/ui && npm run build     # 프론트 빌드(prebuild에서 번역 merge 자동 실행)
cd static/ui && npm run merge     # 번역 병합
forge lint                        # manifest/Forge 정적 검증
forge deploy --non-interactive --e development  # 개발 환경 배포
forge tunnel                      # 로컬 개발용 터널
```

---

## 9. 도메인 핵심 개념 (코드 곳곳에 등장)

| 용어 | 뜻 |
|---|---|
| **워크로그** | 이슈에 기록하는 작업 시간 — 거의 모든 분석의 원천 데이터 |
| **MD (Man-Day)** | 1 MD = 한 사람이 하루(기본 8h) 일하는 양 |
| **MM (Man-Month)** | 인월. 월 단위 투입량 |
| **가동률** | 실제 일한 양(MD) ÷ 일할 수 있었던 양(근무일 − 연차·공휴일) |
| **완성/공수/일정 진척** | "얼마나 끝났나 / 일했나 / 시간이 흘렀나" — **절대 한 숫자로 합치지 않는 것이 핵심 철학** |
| **동료(coworker)** | 담당자와 별개의 협업자. 이슈 단위 커스텀 필드 |
| **팀 / 담당 팀** | 현재 사용자 소속(`users.team_key`) / 프로젝트 계획 책임(`project_team`). 자동 동기화하지 않음 |
| **프로젝트 구독** | 스페이스/보드 규칙을 저장하고 이슈를 물리 태깅. 이벤트는 속도, 리컨실은 정확성 |
| **급여 정책** | `INDIVIDUAL` 또는 `LEVEL_BAND`. 정책에 따라 계산 원천과 API 응답 shape가 달라짐 |

계산 로직은 `ProgressCalculator.js`, `CostCalculator.js`, `EffectiveSalary.js`, `SalaryPolicy.js`, `PortfolioAggregator.js`, `static/ui/src/utils/team/teamMetrics.js`, `src/utils/workday.js`에 모여 있습니다. 구독은 `ProjectSubscriptionService.js` → `SubscriptionJqlBuilder.js` → `SubscriptionSweeper.js` 순으로 읽으세요.

---

## 10. 처음 코드를 파악하는 추천 순서

1. **`manifest.yml`** — 앱이 어떤 모듈·권한·필드를 쓰는지 전체 그림
2. **`src/index.js`** — 백엔드 진입점, 어떤 도메인이 있는지
3. **`static/ui/src/App.jsx`** — 프론트 라우팅·초기화 흐름
4. 관심 기능 하나를 골라 **프론트 페이지 → `invoke` 호출 → Controller → Service → DB**까지 한 줄로 따라가 보기
5. `__test__/` 의 계산기 테스트로 도메인 규칙 확인
6. 팀/구독/급여 변경이라면 각각 `TeamAnalyticsScope.js`, `projectSubscription/`, `SalaryVisibility.js`의 경계 테스트 확인

### 10.1 보안·계약 수정 시 필수 확인

- 일정 `SELF` update/delete는 `schedule_id + context.accountId` SQL 조건 및 0행 negative test를 갖는다.
- 일반 자원 DTO에는 `salary`가 없고 비용 resolver만 `PROJECT_COST`를 요구한다.
- `LEVEL_BAND` 표시 응답에는 개인 salary 키가 없어야 한다. 표시 정책 조회 실패는 숨김, 계산 정책 조회 실패는 오류 전파다.
- 프로젝트 구독 resolver 7종은 모두 `payload.projectId`를 받아 detail scope를 강제한다. 소스 전역 PK와 소유 프로젝트를 서비스에서도 다시 확인한다.
- 구독 스윕은 한 invocation 안에서 SCAN→APPLY 순서를 지키고 완주 전 watermark를 전진시키지 않는다. 단, 부분 APPLY 뒤 cursor 재개는 `IS EMPTY` 후보 집합이 축소돼 미조회 이슈를 건너뛸 위험이 있는 known limitation이다. 재개 cursor 회귀 테스트와 구현 수정 전에는 시간별 리컨실을 무누락 보장으로 설명하지 않는다.
- job polling은 `success`를 먼저 보고 `content.job`을 읽으며 transient 오류에 server job을 삭제하지 않는다.
- 가동률은 미래를 분모에서 제외하고 분모 0을 `null`/`N/A`로 표현한다.
- 명시적인 context license의 active/inactive를 환경보다 우선한다. license 부재는 development/staging에서만 허용한다.
- **차단은 `INACTIVE` 하나뿐이다(2026-08-10).** 판정 불가(`UNAVAILABLE`)는 통과 — 이 가드가 모든 resolver를 감싸므로 상류 장애를 차단으로 다루면 앱이 통째로 멈춘다. 다만 License API가 200으로 응답했는데 활성 라이선스가 없으면 그건 판정 불가가 아니라 `INACTIVE`다(과금 우회 방지). 프론트 `licenseDecision.js`도 같은 경계를 쓴다.
- 상세 계약은 `_workspace/logical-design-audit/01_architect_design.md`를 따른다.

> 💡 새 기능을 풀스택으로 개발할 때는 프로젝트에 **`feature-harness` 스킬**(설계→백엔드→프론트→검증 파이프라인)이 준비돼 있습니다. 팀에 합류하면 안내받게 됩니다.

---

## 더 보기

- **「Moves Workforce 사용자 매뉴얼」** — 화면별 기능 사용법(기획·QA 관점에도 유용)
- **「Moves Workforce 관리자 매뉴얼」** — 설치·권한·운영
- **`CLAUDE.md`** — 코드베이스 작업 시 따라야 할 상세 규칙(이 문서의 원천)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| v1.1 | 2026-08-03 | 권한·팀·SQL/KVS·license 경계 현행화 |
| v1.2 | 2026-08-04 | 32 registrar·SQL 13종·자원/팀 분석·구독 pipeline·급여정책·캐시 무효화 온보딩 반영 |
| v1.3 | 2026-08-06 | queue/scheduled 환경 판별 폴백·공유 bulk/이슈 수집 모듈·근무일 동기화 테스트 반영 |
