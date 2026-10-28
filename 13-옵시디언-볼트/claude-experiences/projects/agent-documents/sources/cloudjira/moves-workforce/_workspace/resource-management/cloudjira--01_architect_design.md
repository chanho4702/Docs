# 자원관리(Resource Management) 페이지 설계서

> 단일 진실 원천(SSOT). backend-engineer / frontend-engineer / integration-verifier 는 이 문서, 특히 **§4 경계면 계약 표**를 기준으로 작업한다. 계약 변경 시 양쪽에 통지.
> 작성일 2026-07-08 · 기준 브랜치 develop · 요구사항 `00_input/requirement.md`

---

## 1. 기능 개요 + 화면 구성

### 1.1 목적 (요구사항 재확인)
1. **부하/투입가능 판단** — 각 인력의 현재 실적 가동률(부하)을 보고 신규 프로젝트 투입 가능 여부 판단.
2. **스킬 적합도 판단** — 인력 보유 스킬 ↔ 프로젝트 요구 스킬 매칭으로 적합 인력 추천.

### 1.2 4대 설계 결정 → 구현 매핑
| 결정 | 구현 |
|------|------|
| ① 스킬 마스터 + 사용자 태그(다대다) + 백오피스 등록 + 직군 프리셋 | KVS `skill` 엔티티(마스터) + SQL `user_skills` 매핑 + `/backoffice/skill` + 프론트 `skillPresets.js` 퀵애드 |
| ② 부하 = 기존 실적 가동률 재사용 | `getRollupMeta().utilizationPeople [{accountId, util}]` **KVS 캐시 읽기 재사용** (신규 페치 없음) |
| ③ 프로젝트 요구스킬 자동 매칭 | SQL `project_skills` + `getProjectSkillMatch` 커버리지/점수 산출 |
| ④ 자원현황 = 최상위 `/resource`, 스킬관리 = 백오피스 | App 라우트 + Sidebar mainItems / backofficeItems |

### 1.3 화면 구성

#### A. 자원현황 뷰 `/resource` (ResourcePage) — 최상위 메뉴 "자원관리"
로컬 탭 2개(Atlaskit `@atlaskit/tabs`, tabs.js 상수 불필요 — 페이지 내부 상태):

- **탭 1 · 인력 현황(Overview)**
  - 전사 인력 풀 테이블: 이름/아바타 · 직무(role) · 등급(level) · **가동률(부하) 배지** · **투입가능 배지** · 보유 스킬 태그.
  - 필터: 스킬 다중선택 · 직무 · 등급 · 투입가능만 보기 토글. (클라이언트 필터/정렬)
  - 상단 요약: 총 인원, 여유/적정/과부하 인원 카운트(가동률 band 기준), 마지막 집계 시각(lastAggregatedAt) + stale 안내.
  - 행 액션: "스킬 편집"(canWrite('RESOURCE_MANAGEMENT')) → UserSkillEditModal (스킬 다중선택 저장).
- **탭 2 · 프로젝트 적합도(Match)**
  - 프로젝트 선택 셀렉트(활성 프로젝트).
  - 선택 프로젝트 **요구스킬 편집기**(canWrite('PROJECT')) — 스킬 다중선택 저장.
  - **후보 인력 랭킹 테이블**: 커버리지(%) 내림차순 · 부하 오름차순 정렬, 매칭 스킬/부족 스킬 칩, 가동률 배지. 커버리지 도넛/게이지(선택).

#### B. 스킬 관리 `/backoffice/skill` (SkillPage) — role/level 백오피스 1:1 복제
- SkillList(테이블: 이름 · 직군(category) · 설명 · 편집/삭제).
- 우상단: "직군 프리셋 추가"(QuickAdd) + "스킬 추가"(등록 모달). role 페이지 버튼 배치 그대로.
- 등록/수정 모달에 **직군(category)** 필드 포함(기존 category 값 + 프리셋 category 로 구성된 셀렉트 + 자유입력).

### 1.4 영향 범위 요약
- **백엔드**: 신규 도메인 `backoffice/skill/`(마스터 CRUD) + `resourceManagement/`(현황·매칭·태그). resolver 12종. 가동률·활성프로젝트는 기존 서비스 재사용.
- **프론트**: 신규 페이지 2개(ResourcePage, SkillPage) + 컴포넌트/모달, 쿼리키 팩토리 2곳, 라우트 2개, 사이드바 2항목.
- **DB**: KVS 신규 엔티티 `skill`(manifest 선언) + SQL 신규 테이블 2개(`user_skills`, `project_skills`). 마이그레이션 v010/v011.
- **i18n**: `locales/kr·en/resource.json`, `locales/kr·en/skill.json` 신규.
- **권한**: 카탈로그 2키 추가(`RESOURCE_MANAGEMENT`, `SKILL_MANAGEMENT`) + PermissionMap 12매핑 + SEED_VERSION 7.

---

## 2. DB / 스토리지 설계

### 2.1 KVS 엔티티 `skill` (스킬 마스터) — role/level 패턴
`manifest.yml` `app.storage.entities` 에 **추가**(속성 미선언 시 저장 422):

```yaml
      - name: skill
        attributes:
          id:
            type: string
          name:
            type: string
          category:
            type: string
          description:
            type: string
        indexes:
          - name
          - category
```
- id 형식: `skill-{uuid}` (role `role-{uuid}` 동일).
- `category` = 직군 문자열(예: `IT/개발`, `디자인`). **별도 category 엔티티 미도입** — role/level 의 단순 KVS 사전 일관성 유지. 직군 목록은 "기존 스킬의 distinct category ∪ 프리셋 category" 로 프론트에서 구성. (확장 여지: 필요 시 `skill_category` 엔티티 분리 — §9 리스크.)
- **주의**: 이 attributes 변경은 `forge deploy` 로 스키마 반영 필요(KVS Entity Manifest Schema 교훈).

### 2.2 SQL `user_skills` (사용자-스킬 다대다) — 신규
저장소 결정 = **Forge SQL**. 근거:
- users 가 SQL 이므로 조인 자연스러움(현황 뷰에서 users ⋈ user_skills 대량 조회).
- N(사용자)×M(스킬) 카디널리티는 KVS(값 240KiB·엔티티 20종 제한)보다 관계 테이블이 적합.
- 스킬 마스터(사전)만 KVS 유지(소량·name 인덱스·백오피스 CRUD 패리티).

```js
// src/rdb/schema/ddl/skillMapping.sql.js
export const CREATE_USER_SKILLS_TABLE = `
    CREATE TABLE IF NOT EXISTS user_skills (
        account_id   VARCHAR(100) NOT NULL,
        skill_id     VARCHAR(50)  NOT NULL,
        proficiency  TINYINT NULL,            -- 확장용(현재 미사용, NULL=보유). §2.5
        created_id   VARCHAR(100),
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, skill_id),
        INDEX (skill_id)
    );
`;
```
- skill_id → KVS `skill.id` 문자열 참조(FK 불가). users 참조도 FK **의존 안 함**(TiDB FK/CASCADE 미강제 교훈) → 삭제는 앱 레벨 멱등 DELETE.
- set 시맨틱: `DELETE ... WHERE account_id=?` → 선택 skillIds bulk INSERT (idempotent 전체교체).

### 2.3 SQL `project_skills` (프로젝트 요구스킬) — 신규
```js
export const CREATE_PROJECT_SKILLS_TABLE = `
    CREATE TABLE IF NOT EXISTS project_skills (
        project_id   BINARY(16)  NOT NULL,
        skill_id     VARCHAR(50) NOT NULL,
        weight       TINYINT NULL,            -- 확장용 가중치(현재 미사용). §2.5
        created_id   VARCHAR(100),
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, skill_id),
        INDEX (skill_id)
    );
`;
```
- project_id 는 기존 `project` 와 동일 `BINARY(16)` (UUID_TO_BIN/BIN_TO_UUID). set 시맨틱 동일.
- 프로젝트 삭제 cascade: 앱 레벨 `DELETE FROM project_skills WHERE project_id=UUID_TO_BIN(?)` 를 기존 프로젝트 삭제 흐름에 추가(Forge SQL No FK Cascade 교훈). → §7 백엔드 작업.

### 2.4 마이그레이션 등록
- `src/rdb/schema/ddl/index.js` 에 `export { CREATE_USER_SKILLS_TABLE, CREATE_PROJECT_SKILLS_TABLE } from './skillMapping.sql';`
- `src/rdb/schema/migrate.js`:
  ```js
  .enqueue('v010_create_user_skills_table', CREATE_USER_SKILLS_TABLE)
  .enqueue('v011_create_project_skills_table', CREATE_PROJECT_SKILLS_TABLE)
  ```
- onInstall/`init-db` 스케줄 트리거가 멱등 실행(신규 테이블 즉시 생성).

### 2.5 숙련도(proficiency) 정책
- **기본 = 보유 여부(binary)**. `proficiency`/`weight` 컬럼은 스키마에만 예비(현재 NULL), 매칭 로직은 **보유 여부만** 사용.
- 확장 시(1~5 숙련도): 가중 커버리지 = `Σ proficiency(matched) / Σ maxProficiency(required)`. 스키마 재마이그레이션 불요(컬럼 존재).

### 2.6 프리셋 시드 구조
- role/level 과 동일하게 **프론트 퀵애드 프리셋**으로 제공(설치 시드 아님 — role/level 도 install seed 없음, `runSeed` 미포함 확인). `static/ui/src/backoffice/page/skill/preset/skillPresets.js`:
  ```js
  export const SKILL_PRESETS = [
    { category: 'IT/개발',   items: [ {name:'React'},{name:'Node.js'},{name:'Spring'},{name:'AWS'},{name:'TypeScript'},{name:'Kubernetes'},{name:'Python'},{name:'Java'} ] },
    { category: '데이터/AI', items: [ {name:'SQL'},{name:'TensorFlow'},{name:'PyTorch'},{name:'Spark'},{name:'Data Modeling'} ] },
    { category: 'QA/인프라', items: [ {name:'Cypress'},{name:'Selenium'},{name:'Terraform'},{name:'CI/CD'} ] },
    { category: '디자인',    items: [ {name:'Figma'},{name:'Photoshop'},{name:'Illustrator'},{name:'Prototyping'} ] },
    { category: '기획/PM',   items: [ {name:'Jira'},{name:'Confluence'},{name:'요구사항분석'},{name:'로드맵'} ] },
    { category: '마케팅',    items: [ {name:'GA4'},{name:'SEO'},{name:'퍼포먼스마케팅'},{name:'콘텐츠'} ] },
    { category: '영업',      items: [ {name:'B2B Sales'},{name:'CRM'},{name:'제안서'} ] },
    { category: '경영/인사', items: [ {name:'재무분석'},{name:'HR'},{name:'채용'} ] },
  ];
  ```
- QuickAdd 모달 → `addSkillBulk({ items:[{name, category, description}] })` (category 는 프리셋 그룹 key 주입). role QuickAdd 와 동일 UX.
- (대안: onInstall 설치 시드 — §9. 이번 범위는 프론트 프리셋으로 role/level 패턴 준수.)

---

## 3. 백엔드 설계

### 3.1 신규 도메인 · 파일
```
src/resolver/backoffice/skill/
  SkillController.js     registerSkillController(resolver)   ← index.js 등록
  SkillService.js        마스터 CRUD (RoleService 복제)
src/resolver/resourceManagement/
  ResourceManagementController.js  registerResourceManagementController(resolver)  ← index.js 등록
  ResourceManagementService.js     현황 조립 / 매칭 / 태그 set·get
  ResourceMatch.js                 순수함수: computeCoverage / classifyUtilBand / rankCandidates (jest 대상)
src/rdb/query/
  SkillMappingQuery.js   user_skills / project_skills SQL 문자열
src/rdb/schema/ddl/skillMapping.sql.js
```

### 3.2 SkillService (RoleService 1:1, category 추가)
`ENTITY='skill'`. `addSkill/updateSkill/getSkillList/findSkillById/addSkillBulk` 는 RoleService 그대로 + `category` 필드 저장/반환. `deleteSkill` 은 **사용 중 가드**: `SkillMappingQuery.COUNT_USES_BY_SKILL`(user_skills + project_skills) > 0 → `LogicalError(CAN_NOT_DELETE)` (role 의 findUserWithRole 가드와 동일 개념).

### 3.3 ResourceManagementService

**(a) getResourceOverviewService(principal)** — 인력 현황 조립 (1회 조립, N+1 회피)
1. `findUsersRepository({})` → 전 users(account_id, role_key, level_key, salary). (필터 null → 전체)
2. 병렬:
   - `userMap(rows)`(기존 UserService.userMap 재사용) → accountId→{displayName,avatarUrls}
   - `getRoleListService()` / `getLevelListService()` → 이름 맵
   - `SkillMappingQuery.SELECT_SKILLS_BY_ACCOUNTS`(account_id IN …) 1쿼리 → JS group by account
   - `getSkillListService()` → skillId→{name,category} 사전
   - `getRollupMeta()` → `utilizationPeople [{accountId,util}]` → accountId→util 맵 **(부하 재사용 핵심 — 신규 워크로그 페치 없음)**
   - `getSettingDataService()` → under/over/red band
3. 각 user 조립: util(없으면 null), `utilBand=classifyUtilBand(util,bands)`, `available = utilBand ∈ {idle,unknown}`, skills 배열.
4. 반환 `{ content: { people:[…], bands, lastAggregatedAt, aggregateStatus } }`.
> 성능: 가동률은 KVS rollup 1회 read(일 배치 산출값). 워크로그 재페치·공통 경로 수정 **없음** (요구사항 재사용 원칙·하네스 교훈 준수).

**(b) getProjectSkillMatchService({ projectId })** — 적합도
1. `SkillMappingQuery.SELECT_SKILL_IDS_BY_PROJECT(projectId)` → requiredIds.
2. 전 인력 현황 = getResourceOverviewService 내부 조립 재사용(동일 조립 함수 분리 호출).
3. 각 인력: `computeCoverage(requiredIds, ownedIds)` → { matched, coverage, missing }, `score=round(coverage*100)`.
4. `rankCandidates`: coverage desc → util asc(덜 부하) → displayName asc.
5. 반환 `{ content: { projectId, projectName, requiredSkills:[…], candidates:[…] } }`. requiredIds 비면 candidates 는 coverage=0 전원(부하순).

**(c) 태그 set/get**
- `getUserSkillsService({accountId})` → `{ data:{ accountId, skillIds:[…] } }`
- `setUserSkillsService({accountId, skillIds})` → DELETE by account + bulk INSERT → `{ data:{ accountId, count } }`
- `getProjectSkillsService({projectId})` → `{ data:{ projectId, skillIds:[…] } }`
- `setProjectSkillsService({projectId, skillIds})` → DELETE by project + bulk INSERT → `{ data:{ projectId, count } }`

**(d) 프로젝트 셀렉트 옵션**: 기존 `getActiveProjects`(ProjectController, R PROJECT list) **재사용** — 신규 resolver 불필요. 프론트에서 활성 프로젝트 목록 호출.

### 3.4 ResourceMatch.js 순수함수 (jest)
```js
export const classifyUtilBand = (util, { under, over, red }) => {
  if (util == null) return 'unknown';        // 실적 없음 → 완전 여유로 취급
  if (util < under)  return 'idle';           // 여유(투입가능)
  if (util < over)   return 'normal';         // 적정
  if (util < red)    return 'over';           // 과부하 주의
  return 'red';                               // 심한 과부하(투입 비권장)
};
export const computeCoverage = (requiredIds=[], ownedIds=[]) => {
  const owned = new Set(ownedIds);
  const matched = requiredIds.filter(id => owned.has(id));
  const missing = requiredIds.filter(id => !owned.has(id));
  const coverage = requiredIds.length ? matched.length / requiredIds.length : 0;
  return { matchedIds: matched, missingIds: missing, coverage, matchedCount: matched.length, requiredCount: requiredIds.length };
};
export const rankCandidates = (cands=[]) =>
  [...cands].sort((a,b) => (b.coverage-a.coverage) || ((a.util??0)-(b.util??0)) || a.displayName.localeCompare(b.displayName));
```

### 3.5 에러 케이스 (ErrorCodes)
- `SKILL_NAME_REQUIRED` / `SKILL_NAME_DUPLICATED` / `SKILL_NOT_FOUND` (role 대응 신규 추가) — `src/utils/errors/ErrorCodes.js`.
- `CAN_NOT_DELETE`(기존) — 사용 중 스킬 삭제.
- projectId/accountId 필수 검증 → 기존 `LogicalError`.

### 3.6 src/index.js 등록
```js
import { registerSkillController } from "./resolver/backoffice/skill/SkillController";
import { registerResourceManagementController } from "./resolver/resourceManagement/ResourceManagementController";
// …
registerSkillController(resolver);
registerResourceManagementController(resolver);
```
> 컨트롤러는 `guardedDefine` 사용(deny-by-default). PermissionMap 매핑 누락 시 계약테스트 `test/permission/permissionMap.contract.test.js` 실패 → §6 매핑 필수.

---

## 4. ★경계면 계약 표 (핵심 · SSOT)★

> 응답은 `guardedDefine`→`responseWrapper` 로 `{ success:true, ...서비스반환 }` 직렬화. 아래 "응답 content"는 서비스 반환을 spread 한 **최종 invoke 결과**. 프론트: `const res = await invoke(fn, params)`.

### 4.1 스킬 마스터 (SkillController)
| resolver 함수 | 입력 | 응답 (success 시, 글자 그대로) | 프론트 훅/쿼리키 |
|---|---|---|---|
| `getSkillList` | — | `{ success, data:[ { id, name, category, description } ] }` | `useSkillList` / `backofficeKeys.skills()` |
| `findSkillById` | `{ id }` | `{ success, data:{ id, skillData:{ name, category, description } } }` | `backofficeKeys.findSkills(id)` |
| `addSkill` | `{ name, category, description }` | `{ success, data:{ id, skillData } }` | invalidate `backofficeKeys.skills()` |
| `updateSkill` | `{ id, name, category, description, isNameChanged }` | `{ success, data:{ id, data:{ name, category, description } } }` | invalidate `skills()` |
| `deleteSkill` | `{ id }` | `{ success }` (data 없음) · 사용중 → `{ success:false, error:{ code:'CAN_NOT_DELETE' } }` | invalidate `skills()` |
| `addSkillBulk` | `{ items:[ { name, category, description } ] }` | `{ success, data:{ added, skipped } }` | invalidate `skills()` |

### 4.2 자원관리 (ResourceManagementController)
| resolver 함수 | 입력 | 응답 (success 시, 글자 그대로) | 프론트 훅/쿼리키 |
|---|---|---|---|
| `getResourceOverview` | — | `{ success, content:{ people:[ { accountId, displayName, avatarUrls, roleKey, roleName, levelKey, levelName, salary, util, utilBand, available, skills:[ { id, name, category } ] } ], bands:{ under, over, red }, lastAggregatedAt, aggregateStatus } }` | `useResourceOverview` / `resourceKeys.overview()` |
| `getProjectSkillMatch` | `{ projectId }` | `{ success, content:{ projectId, projectName, requiredSkills:[ { id, name, category } ], candidates:[ { accountId, displayName, avatarUrls, roleName, levelName, util, utilBand, available, coverage, score, matchedCount, requiredCount, matchedSkills:[ { id, name } ], missingSkills:[ { id, name } ] } ] } }` | `useProjectSkillMatch` / `resourceKeys.projectMatch(projectId)` |
| `getUserSkills` | `{ accountId }` | `{ success, data:{ accountId, skillIds:[ "skill-…" ] } }` | `resourceKeys.userSkills(accountId)` |
| `setUserSkills` | `{ accountId, skillIds:[…] }` | `{ success, data:{ accountId, count } }` | invalidate `userSkills(accountId)` + `overview()` |
| `getProjectSkills` | `{ projectId }` | `{ success, data:{ projectId, skillIds:[…] } }` | `resourceKeys.projectSkills(projectId)` |
| `setProjectSkills` | `{ projectId, skillIds:[…] }` | `{ success, data:{ projectId, count } }` | invalidate `projectSkills(pid)` + `projectMatch(pid)` |

**필드 계약 주의(프론트 소비 규칙)**
- `util`: number 또는 **null**(실적 없음). null 은 UI 에서 "데이터 없음/여유"로 표기. 절대 `util.toFixed()` 무가드 호출 금지.
- `utilBand`: `'idle'|'normal'|'over'|'red'|'unknown'` 문자열. 배지 색 매핑은 프론트 상수.
- `coverage`: 0~1 float. 표기 시 `Math.round(coverage*100)`(= score).
- `bands`: settings 값(폴백 under0.7/over1.1/red1.3). 요약 카운트/배지 임계 공용.

### 4.3 재사용(신규 아님)
| 기존 resolver | 용도 | 가드 |
|---|---|---|
| `getActiveProjects` | Match 탭 프로젝트 셀렉트 옵션 | R PROJECT list |
| `getSettingData` | (프론트 직접 불필요; 서버 내부 사용) | PUBLIC |

---

## 5. 프론트엔드 설계

### 5.1 컴포넌트 트리
```
pages/resource/
  ResourcePage.jsx              ── 로컬 Tabs(Overview / Match), canRead('RESOURCE_MANAGEMENT') 게이트
  overview/
    ResourceOverviewTab.jsx     ── useResourceOverview
    ResourceFilters.jsx         ── 스킬/직무/등급/투입가능 필터(클라이언트)
    ResourceOverviewTable.jsx   ── CommonTable 재사용
    UtilBadge.jsx               ── utilBand→색/라벨 (idle/normal/over/red/unknown)
    SkillTags.jsx               ── 스킬 칩 목록
    UserSkillEditModal.jsx      ── getUserSkills+setUserSkills, canWrite('RESOURCE_MANAGEMENT')
  match/
    ProjectMatchTab.jsx         ── 프로젝트 select(getActiveProjects)
    RequiredSkillEditor.jsx     ── getProjectSkills+setProjectSkills, canWrite('PROJECT')
    CandidateRankTable.jsx      ── useProjectSkillMatch, 커버리지/부족스킬/부하
backoffice/page/skill/          ── role 디렉토리 1:1 복제
  SkillPage.jsx / SkillList.jsx / useSkillList.js
  modal/regist|edit|quickAdd/(+use…) 
  preset/skillPresets.js
```
- 스킬 다중선택 UI: Atlaskit `Select isMulti` (getSkillList 옵션, category 로 group). UserSkillEditModal / RequiredSkillEditor 공용 `SkillMultiSelect.jsx`.

### 5.2 상태관리 (Zustand)
- **신규 스토어 없음.** 서버상태 = React Query. 권한 = 기존 `usePermissionStore.canRead/canWrite`. i18n = `useI18nStore.t`.

### 5.3 쿼리키 팩토리
`static/ui/src/utils/queryKey/backofficeKeys.js` 에 추가:
```js
  skills: () => ["skills"],
  findSkills: (skillId) => ["findSkill", skillId],
```
신규 `static/ui/src/utils/queryKey/resourceKeys.js`:
```js
export const resourceKeys = {
  all: ["resource"],
  overview: () => ["resource", "overview"],
  userSkills: (accountId) => ["resource", "userSkills", accountId],
  projectSkills: (projectId) => ["resource", "projectSkills", projectId],
  projectMatch: (projectId) => ["resource", "projectMatch", projectId],
};
```

### 5.4 라우팅 / 네비 추가 지점
- `App.jsx`:
  ```jsx
  import ResourcePage from "./pages/resource/ResourcePage";
  import SkillPage from "./backoffice/page/skill/SkillPage";
  <Route path="/resource" element={<ResourcePage />} />
  <Route path="/backoffice/skill" element={<SkillPage />} />
  ```
- `layout/Sidebar.jsx` **mainItems** 에 추가(project 다음):
  ```js
  { key:'/resource', icon:<PeopleGroupIcon label="Resource"/>, label:t('resource.nav'), permission:'RESOURCE_MANAGEMENT' }
  ```
  **backofficeItems** 에 추가(level 근처):
  ```js
  { key:'/backoffice/skill', icon:<GoalIcon label="Skill"/>, label:t('common.backoffice.workforceSetting.skill.title'), permission:'SKILL_MANAGEMENT' }
  ```
  (아이콘: `@atlaskit/icon/core/people-group`, 스킬은 임의 — bookmark/tag 등.)
- `constants/tabs.js` 수정 **불필요**(ResourcePage 내부 로컬 탭).

### 5.5 권한 체크
- `/resource` 진입: `canRead('RESOURCE_MANAGEMENT')` 아니면 접근 차단(다른 백오피스 페이지 패턴 따름).
- 스킬 편집 버튼: `canWrite('RESOURCE_MANAGEMENT')`.
- 요구스킬 편집: `canWrite('PROJECT')`.
- `/backoffice/skill`: `canRead/canWrite('SKILL_MANAGEMENT')` (RolePage 패턴).

---

## 6. i18n 키 목록

> `locales/kr/{파일}.json` + `locales/en/{파일}.json` 추가 후 `cd static/ui && npm run merge`. ko-KR.json/en-US.json 직접수정 금지.

### 6.1 `resource.json`
| key | kr | en |
|---|---|---|
| `resource.nav` | 자원관리 | Resource |
| `resource.page.title` | 자원관리 | Resource Management |
| `resource.page.description` | 인력 부하와 스킬 적합도를 한눈에 | Workload & skill fit at a glance |
| `resource.tab.overview` | 인력 현황 | People |
| `resource.tab.match` | 프로젝트 적합도 | Project Fit |
| `resource.overview.summary.total` | 총 인원 | Total |
| `resource.overview.summary.idle` | 여유 | Available |
| `resource.overview.summary.normal` | 적정 | Balanced |
| `resource.overview.summary.over` | 과부하 | Overloaded |
| `resource.overview.lastAggregated` | 마지막 집계 | Last aggregated |
| `resource.overview.stale` | 집계 데이터가 오래되었습니다 | Aggregation data is stale |
| `resource.col.member` | 인력 | Member |
| `resource.col.role` | 직무 | Role |
| `resource.col.level` | 등급 | Level |
| `resource.col.util` | 가동률 | Utilization |
| `resource.col.available` | 투입가능 | Available |
| `resource.col.skills` | 보유 스킬 | Skills |
| `resource.filter.skill` | 스킬 | Skill |
| `resource.filter.availableOnly` | 투입가능만 | Available only |
| `resource.band.idle` | 여유 | Idle |
| `resource.band.normal` | 적정 | Normal |
| `resource.band.over` | 과부하 주의 | High |
| `resource.band.red` | 과부하 | Overloaded |
| `resource.band.unknown` | 실적없음 | No data |
| `resource.util.none` | 데이터 없음 | No data |
| `resource.userSkill.edit` | 스킬 편집 | Edit skills |
| `resource.userSkill.save.success` | 스킬을 저장했습니다 | Skills saved |
| `resource.match.selectProject` | 프로젝트 선택 | Select project |
| `resource.match.requiredSkills` | 요구 스킬 | Required skills |
| `resource.match.editRequired` | 요구 스킬 편집 | Edit required skills |
| `resource.match.coverage` | 적합도 | Coverage |
| `resource.match.matched` | 매칭 | Matched |
| `resource.match.missing` | 부족 스킬 | Missing |
| `resource.match.noRequired` | 요구 스킬을 먼저 정의하세요 | Define required skills first |
| `resource.match.rank` | 순위 | Rank |

### 6.2 `skill.json`
| key | kr | en |
|---|---|---|
| `skill.page.title` | 스킬 관리 | Skill Management |
| `skill.page.description` | 직군별 스킬 사전 정의 | Define the skill dictionary by category |
| `skill.col.name` | 스킬명 | Skill |
| `skill.col.category` | 직군 | Category |
| `skill.col.description` | 설명 | Description |
| `skill.button.addSkill` | 스킬 추가 | Add Skill |
| `skill.quickAdd.button.quickAdd` | 직군 프리셋 추가 | Add Preset |
| `skill.form.name` | 스킬명 | Skill name |
| `skill.form.category` | 직군 | Category |
| `skill.form.description` | 설명 | Description |
| `skill.error.nameRequired` | 스킬명을 입력하세요 | Skill name is required |
| `skill.error.nameDuplicated` | 이미 존재하는 스킬명입니다 | Skill name already exists |
| `skill.error.inUse` | 사용 중인 스킬은 삭제할 수 없습니다 | Cannot delete a skill in use |
| `skill.delete.confirm` | 이 스킬을 삭제할까요? | Delete this skill? |

### 6.3 `common.json`(기존) 추가 키
| key | kr | en |
|---|---|---|
| `common.backoffice.workforceSetting.skill.title` | 스킬 | Skill |
| `common.pages.skill` | 스킬 관리 | Skill Management |
| `common.pages.resource` | 자원관리 | Resource Management |
| `permission.desc.SKILL_MANAGEMENT` | 백오피스 스킬 사전 관리 | Manage skill dictionary |
| `permission.desc.RESOURCE_MANAGEMENT` | 자원관리(부하·스킬 적합도) | Resource management (load & fit) |

---

## 7. 권한 키 설계 (permission-hardening)

### 7.1 ResourceCatalog.js 카탈로그 추가 (정의 순서 = 노출 순서)
- **WORKFORCE 섹션** (KANBAN/PROJECT 인접):
  ```js
  { key:'RESOURCE_MANAGEMENT', section:'WORKFORCE', labelKey:'common.pages.resource', descriptionKey:'permission.desc.RESOURCE_MANAGEMENT',
    covers:['자원관리 현황/적합도(/resource)'], admin:t, member:ff, defaultForNew:ff },
  ```
- **SETTINGS 섹션** (ROLE/LEVEL 인접):
  ```js
  { key:'SKILL_MANAGEMENT', section:'SETTINGS', labelKey:'common.pages.skill', descriptionKey:'permission.desc.SKILL_MANAGEMENT',
    covers:['백오피스 스킬 관리(/backoffice/skill)'], admin:t, member:ff, defaultForNew:ff },
  ```
> 신규 키는 `migrateFrom` 없음 → 시드 Admin 자동 부여(getSeedPages 파생), Member/커스텀 세트는 `defaultForNew=none`. 기존 사용자 회귀 없음. **SEED_VERSION 6→7** 로 올려 addPermissionSeed/migratePermissionSets 재실행(`onInstall.js`, `SeedData.js`). manifest 변경과 함께 `forge deploy`.

### 7.2 PermissionMap.js 매핑 (12종, deny-by-default·계약테스트 대상)
```js
// ── Skill (SkillController, 6) ──
addSkill:      W('SKILL_MANAGEMENT'),
updateSkill:   W('SKILL_MANAGEMENT'),
deleteSkill:   W('SKILL_MANAGEMENT'),
addSkillBulk:  W('SKILL_MANAGEMENT'),
findSkillById: R('SKILL_MANAGEMENT'),
getSkillList:  OR([['SKILL_MANAGEMENT','read'],['RESOURCE_MANAGEMENT','read'],['USER_MANAGEMENT','read']]),

// ── ResourceManagement (ResourceManagementController, 6) ──
getResourceOverview:  R('RESOURCE_MANAGEMENT'),
getProjectSkillMatch: R('RESOURCE_MANAGEMENT'),
getUserSkills:        OR([['RESOURCE_MANAGEMENT','read'],['USER_MANAGEMENT','read']]),
setUserSkills:        W('RESOURCE_MANAGEMENT'),
getProjectSkills:     OR([['RESOURCE_MANAGEMENT','read'],['PROJECT','read']]),
setProjectSkills:     W('PROJECT','detail'),   // 프로젝트 요구스킬 = 프로젝트-스코프 write
```
> `getResourceOverview`/`getProjectSkillMatch` 는 전사 자원 뷰(project='none') — RESOURCE_MANAGEMENT 권한자(관리자/PM)만 접근하므로 프로젝트 스코프 미적용(설계 의도). `setProjectSkills` 만 `detail` 스코프로 프로젝트 소속 검증.

---

## 8. 구현 순서 + 작업 분해

### 8.1 순서(의존성)
1. **DB/스키마/manifest/권한 기반** → 2. **백엔드 resolver** → 3. **프론트** → 4. **검증**.
   (manifest skill 엔티티 + SEED_VERSION + DDL 은 백엔드 착수 전 확정, `forge deploy` 필요.)

### 8.2 backend 체크리스트
- [ ] `manifest.yml` storage.entities 에 `skill` 엔티티 추가(id/name/category/description, index name·category).
- [ ] `src/rdb/schema/ddl/skillMapping.sql.js` 작성 + `ddl/index.js` export + `migrate.js` v010/v011 enqueue.
- [ ] `src/rdb/query/SkillMappingQuery.js`: SELECT_SKILLS_BY_ACCOUNTS / SELECT_SKILL_IDS_BY_ACCOUNT / DELETE_USER_SKILLS_BY_ACCOUNT / INSERT_USER_SKILLS / SELECT_SKILL_IDS_BY_PROJECT / DELETE_PROJECT_SKILLS_BY_PROJECT / INSERT_PROJECT_SKILLS / COUNT_USES_BY_SKILL.
- [ ] `backoffice/skill/SkillService.js` + `SkillController.js`(guardedDefine 6종).
- [ ] `resourceManagement/ResourceManagementService.js` + `ResourceManagementController.js`(6종) + `ResourceMatch.js`(순수함수).
- [ ] `ErrorCodes.js`: SKILL_NAME_REQUIRED/DUPLICATED/NOT_FOUND.
- [ ] `ResourceCatalog.js` 2키 + `PermissionMap.js` 12매핑 + `SEED_VERSION=7`.
- [ ] 프로젝트 삭제 흐름에 `DELETE FROM project_skills WHERE project_id=…` 추가(cascade).
- [ ] `src/index.js` 2 컨트롤러 등록.
- [ ] jest: ResourceMatch(computeCoverage/classifyUtilBand/rankCandidates) + permissionMap.contract 통과.

### 8.3 frontend 체크리스트
- [ ] `backoffice/page/skill/` role 복제(SkillPage/List/useSkillList/modals/skillPresets) — category 필드 반영.
- [ ] `pages/resource/` ResourcePage + Overview/Match 하위 + SkillMultiSelect/UtilBadge/SkillTags.
- [ ] `utils/queryKey/backofficeKeys.js` skills/findSkills 추가 + `resourceKeys.js` 신규.
- [ ] `App.jsx` 라우트 2개, `Sidebar.jsx` main/backoffice 항목 2개.
- [ ] i18n: `locales/kr·en/resource.json`·`skill.json` 신규 + common 키 추가 → `npm run merge`.
- [ ] invoke 소비 shape 을 §4 표와 1:1 대조(util null 가드).

### 8.4 verify 체크리스트 (integration-verifier)
- [ ] §4 표 ↔ 백엔드 반환 ↔ 프론트 invoke 소비 교차검증(특히 data vs content, util null).
- [ ] PermissionMap 계약테스트(등록집합=맵키집합), 미매핑 resolver 없음.
- [ ] 가동률 재사용 경로가 rollup read 인지(신규 워크로그 페치·공통 페처 수정 없음) 확인.
- [ ] merge 후 ko-KR/en-US 에 신규 키 반영, 하드코딩 문자열 없음.

---

## 9. 리스크 / 가정

- **[가정] 부하 데이터 원천 = 일 배치 rollup(getRollupMeta.utilizationPeople).** `/resource` 는 재집계를 트리거하지 않음(REPORT write 결합 회피). 최신성은 lastAggregatedAt 표기 + stale 안내로 처리. → 최초 배치 전에는 util=null(전원 "실적없음/여유"). **가장 보수적·저비용 해석**(요구사항 "기존 실적 가동률 재사용" + 하네스 "1회 페치+KVS 캐시" 준수).
- **[가정] util 없는 인력(활성 프로젝트 미참여/워크로그 없음) = 여유(투입가능).** utilBand='unknown'→available=true.
- **[가정] 직군(category)는 skill 속성**(별도 엔티티 없음). 직군 CRUD 는 스킬 등록/수정 시 category 지정으로 갈음. 대량 직군 재명명 요구 시 `skill_category` 엔티티 분리 필요(확장).
- **[가정] 프리셋 = 프론트 퀵애드**(role/level 과 동일, install seed 아님). 설치 즉시 기본 스킬을 원하면 onInstall 시드로 승격 가능(SeedData 에 addSkillSeed 추가 + SEED_VERSION) — 이번 범위 밖.
- **[리스크] getResourceOverview 의 getBulkJiraUsersApi 전체 사용자 조회** — 사용자 수 대량 시 응답/메모리 부담. 기존 user list(userMap) 패턴과 동일 수준이나, 필요 시 서버 페이징/스킬·직무 서버필터로 확장(현재는 워크포스 규모 bounded 가정, 클라이언트 필터).
- **[리스크] skill 삭제 후 잔존 매핑** — deleteSkill 은 사용중 가드로 차단하므로 고아 매핑 미발생. 단 KVS/SQL 원자성 없음 → 가드 우회 경로 없도록 유지.
- **[결정 근거] user_skills/project_skills = SQL, skill 마스터 = KVS.** users/project 가 SQL이라 조인·다대다 카디널리티에 SQL 적합, 소량 사전은 KVS로 role/level 패리티 유지.
- **[의존] manifest attributes 변경·SEED_VERSION 반영은 `forge deploy` 필수**(KVS 스키마·시드). 마이그레이션은 onInstall/init-db 멱등 실행.
- **[준수] Jira API asApp 지양**(userMap/getBulkJiraUsersApi 기존 사용자 컨텍스트 경로 재사용), 커밋 Co-Authored-By 금지.
