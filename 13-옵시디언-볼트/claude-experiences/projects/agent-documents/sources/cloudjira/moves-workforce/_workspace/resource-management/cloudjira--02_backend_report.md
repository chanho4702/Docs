# 자원관리(Resource Management) — 백엔드 구현 리포트

> 작성 2026-07-08 · 브랜치 develop · 입력 SSOT = `01_architect_design.md §4 경계면 계약 표`
> **frontend-engineer 는 아래 "실제 응답 shape"을 글자 그대로 소비하라.** 설계 §4 계약과 100% 일치하게 구현했다(이탈 없음).

---

## 1. 등록 위치 (invoke 가능 함수 12종)

- `src/index.js` : `registerSkillController(resolver)` + `registerResourceManagementController(resolver)` 등록 완료.
- 컨트롤러는 전부 `guardedDefine` 사용(deny-by-default). PermissionMap 12매핑 추가 → 계약테스트 통과.
- 모든 함수는 `guardedDefine → responseWrapper` 로 `{ success, ...서비스반환 }` 직렬화됨.

---

## 2. 스킬 마스터 (SkillController) — 실제 응답 shape

파일: `src/resolver/backoffice/skill/SkillController.js`, `SkillService.js` (RoleService 1:1 복제 + `category` 필드).
KVS 엔티티 `skill` (id 형식 `skill-{uuid}`).

| resolver | 입력 | 실제 invoke 결과 (성공) |
|---|---|---|
| `getSkillList` | — | `{ success:true, data:[ { id, name, category, description } ] }` |
| `findSkillById` | `{ id }` | `{ success:true, data:{ id, skillData:{ name, category, description } } }` |
| `addSkill` | `{ name, category, description }` | `{ success:true, data:{ id, skillData:{ name, category, description } } }` |
| `updateSkill` | `{ id, name, category, description, isNameChanged }` | `{ success:true, data:{ id, data:{ name, category, description } } }` |
| `deleteSkill` | `{ id }` | 성공 `{ success:true }` (data 없음) · 사용중 `{ success:false, error:{ code:'CAN_NOT_DELETE', ... } }` |
| `addSkillBulk` | `{ items:[ { name, category, description } ] }` | `{ success:true, data:{ added, skipped } }` |

에러:
- `addSkill` 이름 없음 → `error.code = 'SKILL_NAME_REQUIRED'`
- 이름 중복(`addSkill`/`updateSkill` isNameChanged) → `error.code = 'SKILL_NAME_DUPLICATED'`
- `deleteSkill` 사용중(user_skills+project_skills 참조>0) → `error.code = 'CAN_NOT_DELETE'`
- (SKILL_NOT_FOUND 는 getSkillList/findSkillById 내부 방어용)

주의: `category`/`description` 은 미입력 시 서버가 `''`(빈 문자열)로 저장/반환한다(null 아님).

---

## 3. 자원관리 (ResourceManagementController) — 실제 응답 shape

파일: `src/resolver/resourceManagement/ResourceManagementController.js`, `ResourceManagementService.js`, `ResourceMatch.js`.

### 3.1 `getResourceOverview` (입력 없음)
```
{ success:true, content:{
    people:[ {
        accountId, displayName, avatarUrls, roleKey, roleName,
        levelKey, levelName, salary, util, utilBand, available,
        skills:[ { id, name, category } ]
    } ],
    bands:{ under, over, red },
    lastAggregatedAt,      // ISO string | null
    aggregateStatus        // 'OK'|'PARTIAL'|'EMPTY' | null
} }
```
- `util`: number **또는 null**(rollup 미산출/미참여). 프론트는 반드시 null 가드(`util?.toFixed()` 금지).
- `utilBand`: `'idle'|'normal'|'over'|'red'|'unknown'`. util=null → `'unknown'`.
- `available`: boolean. `utilBand ∈ {idle, unknown}` 이면 true.
- `avatarUrls`: Jira 사용자 avatarUrls 객체 또는 **null**(userMap 미해석 시).
- `roleName`/`levelName`: 미해석 시 **null**.
- `salary`: users.salary 값 또는 null.
- `bands`: settings(`utilizationUnderBand/OverBand/RedBand`) 값, 폴백 `{under:0.7, over:1.1, red:1.3}`.

### 3.2 `getProjectSkillMatch` (`{ projectId }`)
```
{ success:true, content:{
    projectId,
    projectName,           // string | null
    requiredSkills:[ { id, name, category } ],
    candidates:[ {
        accountId, displayName, avatarUrls, roleName, levelName,
        util, utilBand, available,
        coverage,          // 0~1 float
        score,             // Math.round(coverage*100)  (정수)
        matchedCount, requiredCount,
        matchedSkills:[ { id, name } ],   // category 없음(계약대로)
        missingSkills:[ { id, name } ]
    } ]
} }
```
- 정렬: coverage desc → util asc(util null=0 취급) → displayName asc (`rankCandidates`).
- 요구스킬 비었으면(`requiredSkills=[]`) 전원 coverage=0, 부하(util asc)순 반환.
- 미입력 projectId → `error.code='PROJECT_ID_REQUIRED'`.

### 3.3 스킬 태그 set/get
| resolver | 입력 | 실제 응답 |
|---|---|---|
| `getUserSkills` | `{ accountId }` | `{ success:true, data:{ accountId, skillIds:[ "skill-…" ] } }` |
| `setUserSkills` | `{ accountId, skillIds:[…] }` | `{ success:true, data:{ accountId, count } }` |
| `getProjectSkills` | `{ projectId }` | `{ success:true, data:{ projectId, skillIds:[…] } }` |
| `setProjectSkills` | `{ projectId, skillIds:[…] }` | `{ success:true, data:{ projectId, count } }` |

- set 시맨틱 = 전체 교체(DELETE by 부모키 → bulk INSERT). `count` = 저장된 스킬 수(중복/falsy 제거 후).
- `setUserSkills` 미입력 accountId → `error.code='USER_ID_REQUIRED'`; `setProjectSkills` 미입력 projectId → `'PROJECT_ID_REQUIRED'`.
- `createdId` 는 가드가 부착한 `req.principal.accountId` 로 채워진다.

---

## 4. 가동률(부하) 재사용 경로 — 검증 결과 (핵심)

**설계 §3.3(a) 준수 확인:** 신규 워크로그 페치·공통 페처 수정 **없음**.
- `ResourceManagementService.buildPeopleContext()` 는 `getRollupMeta()` (= `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js`, KVS 직접 키 `portfolioRollup:current`)를 **1회 read** 한다.
- rollup 실제 구조(확인함, `PortfolioAggregator.js:519~535`):
  ```
  { lastAggregatedAt, aggregateStatus, utilizationValues:[…],
    utilizationPeople:[ { accountId, util } ],   // ← 설계 §2 표기와 정확히 일치
    utilizationTotalPeople, problemIssues, aggregatingStartedAt }
  ```
  → 설계서가 가정한 `utilizationPeople [{accountId, util}]` 필드 shape이 **실제와 일치**한다(이탈 없음).
- rollup 이 null(최초 배치 전)이면 utilMap 비어 전원 util=null → utilBand='unknown' → available=true (설계 §9 가정대로 "실적없음=여유").
- `getResourceOverview`/`getProjectSkillMatch` 는 재집계를 트리거하지 않는다(REPORT write 미결합).

---

## 5. DB / 스키마 / 권한 변경

### 5.1 신규 SQL 테이블 2개 (마이그레이션 v010/v011)
- `src/rdb/schema/ddl/skillMapping.sql.js` : `CREATE_USER_SKILLS_TABLE`(user_skills), `CREATE_PROJECT_SKILLS_TABLE`(project_skills). proficiency/weight 컬럼은 예비(현재 NULL).
- `ddl/index.js` export 추가, `migrate.js` v010/v011 enqueue 추가.
- `src/rdb/query/SkillMappingQuery.js` : 8종.
  - 동적 IN/VALUES 는 **count 인자 팩토리 함수**로 제공: `SELECT_SKILLS_BY_ACCOUNTS(count)`, `INSERT_USER_SKILLS(count)`, `INSERT_PROJECT_SKILLS(count)`. 나머지 5종은 문자열 상수.
  - INSERT 파라미터 순서(행당): user = `[accountId, skillId, createdId]`, project = `[projectId, skillId, createdId]`(project_id 는 `UUID_TO_BIN(?)`).
  - `COUNT_USES_BY_SKILL` params = `[skillId, skillId]` → `{ total }`.

### 5.2 KVS 엔티티 `skill` (manifest)
- `manifest.yml` `app.storage.entities` 에 `skill`(id/name/category/description, indexes: name·category) 추가. **⚠️ forge deploy 필요**(스키마 반영 안 하면 저장 시 422).

### 5.3 권한 (permission-hardening)
- `ResourceCatalog.js`: `RESOURCE_MANAGEMENT`(WORKFORCE 섹션), `SKILL_MANAGEMENT`(SETTINGS 섹션) 2키 추가. 둘 다 admin=rw, member=none, defaultForNew=none. migrateFrom 없음 → 기존 사용자 회귀 없음(Admin 자동 부여).
- `PermissionMap.js`: Skill 6 + ResourceManagement 6 매핑 추가. `setProjectSkills` 만 `W('PROJECT','detail')`(프로젝트 스코프 검증), 나머지는 project='none'.
- `SEED_VERSION` 6→**7** (`src/trigger/onInstall.js`). → 재설치/업그레이드 시 addPermissionSeed/migratePermissionSets 재실행.
- `ErrorCodes.js`: `SKILL_NAME_REQUIRED`/`SKILL_NAME_DUPLICATED`/`SKILL_NOT_FOUND` 추가.

### 5.4 프로젝트 삭제 cascade
- `ProjectRepository.deleteProjectSkillsByProjectRepository` 추가 → `deleteProjectService` 흐름에 `DELETE FROM project_skills WHERE project_id=UUID_TO_BIN(?)` 삽입(project 부모 삭제 직전, 멱등). TiDB FK 미강제 교훈 반영.

---

## 6. 테스트 결과

`npx jest` (루트) — **13 suites / 194 tests 전부 PASS**.
- 신규 `src/resolver/resourceManagement/__test__/ResourceMatch.test.js` (16 assertions): classifyUtilBand 경계값 / computeCoverage(0·부분·완전·보유없음) / rankCandidates(정렬 규칙·null util·불변성).
- `test/permission/permissionMap.contract.test.js`: 신규 2컨트롤러를 등록집합에 추가 → 등록집합 ↔ 맵키집합 대조 통과(미매핑/고아 없음), 카탈로그 키 유효성 통과.
- StorageService.test.js 의 console.error 출력은 fallback 경로 로깅(의도된 테스트), 실패 아님.

---

## 7. forge deploy 필요 사항 (배포 담당 인지)

1. **manifest.yml `skill` 엔티티 추가** → `forge deploy` 필수(KVS 스키마). 미배포 시 addSkill 저장 422.
2. **SEED_VERSION 7** → 배포 후 재설치/업그레이드 시 권한 시드/마이그레이션(v010/v011 테이블 포함) 자동 재실행(onInstall 멱등).
3. SQL 테이블은 onInstall/init-db 멱등 마이그레이션으로 생성(별도 수동 작업 불요).

---

## 8. frontend 소비 체크리스트 (요약)

- CRUD(스킬 마스터 + 태그 set/get)는 `result.data`, 조립 조회(overview/match)는 `result.content` 로 접근(컨벤션 분리).
- `util` null 가드 필수. `utilBand` 5종 문자열 → 배지 색은 프론트 상수.
- `coverage` 0~1 → 표기 `score`(이미 정수) 사용 권장.
- `matchedSkills`/`missingSkills` 는 `{id,name}` (category 없음). `requiredSkills`/`skills` 는 `{id,name,category}`.
- 활성 프로젝트 셀렉트는 기존 `getActiveProjects` 재사용(신규 resolver 없음).
