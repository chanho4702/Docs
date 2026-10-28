# 자원관리(Resource Management) — 프론트엔드 구현 리포트

> 작성 2026-07-08 · 브랜치 develop · 입력 SSOT = `01_architect_design.md §4~7` + `02_backend_report.md`(실제 응답 shape)
> **backend 실제 shape(02_backend_report.md)에 invoke 소비 경로를 1:1 맞춤. result.data vs result.content 구분 준수.**

---

## 1. 소비한 응답 shape ↔ 접근 경로 (경계면 1:1 대조)

| resolver | 접근 경로 | 소비 위치 | 비고 |
|---|---|---|---|
| `getSkillList` | `res.data`(배열) | `useSkillList`, `useSkillCategoryOptions`, `SkillMultiSelect`, `useSkillQuickAddModal` | CRUD 컨벤션 = `data` |
| `findSkillById` | `res.data.skillData` `{name,category,description}` | `useSkillEditModal` | |
| `addSkill` | `res.success` 분기 / 에러 `res.error.code`(`SKILL_NAME_DUPLICATED`/`SKILL_NAME_REQUIRED`) | `useSkillRegistrationModal` | category = `formData.category?.value ?? ''` |
| `updateSkill` | `res.success` / `res.error.code==='SKILL_NAME_DUPLICATED'` | `useSkillEditModal` | `isNameChanged` 전송 |
| `deleteSkill` | 성공 `res.success`(data 없음) / 사용중 `res.error.code==='CAN_NOT_DELETE'` | `useSkillEditModal` | |
| `addSkillBulk` | `res.data.{added,skipped}` | `useSkillQuickAddModal` | items에 프리셋 그룹 `category` 주입 |
| `getResourceOverview` | **`res.content`** `{people,bands,lastAggregatedAt,aggregateStatus}` | `useResourceOverview` | 조립 조회 = `content` |
| `getProjectSkillMatch` | **`res.content`** `{projectName,requiredSkills,candidates}` | `useProjectSkillMatch` | 조립 조회 = `content` |
| `getUserSkills` | `res.data.skillIds` | `UserSkillEditModal` | |
| `setUserSkills` | `res.success` | `UserSkillEditModal` | invalidate `userSkills(id)`+`overview()` |
| `getProjectSkills` | `res.data.skillIds` | `RequiredSkillEditor` | |
| `setProjectSkills` | `res.success` | `RequiredSkillEditor` | invalidate `projectSkills(pid)`+`projectMatch(pid)` |
| `getActiveProjects`(재사용) | **`res.rows`** `[{project_id,project_name}]` | `ProjectMatchTab` | responseWrapper 가 `{success, rows}` 로 spread(실제 shape 확인함) |

**null 가드(백엔드 계약 준수):**
- `util` → `UtilBadge`에서 `util == null ? t('resource.util.none') : Math.round(util*100)+'%'` (무가드 `.toFixed()` 없음).
- `avatarUrls` → `p.avatarUrls?.['24x24']` (UserAvatar).
- `roleName`/`levelName` → `?? '-'`.
- `matchedSkills`/`missingSkills` → `(c.x ?? []).length` 가드, `{id,name}`만 사용(category 없음).
- category/description 빈문자열(`''`) 정상 표시.

---

## 2. 구현 파일

### 2.1 백오피스 스킬 페이지 (`static/ui/src/backoffice/page/skill/`) — role 1:1 복제 + category
- `SkillPage.jsx` (canRead/canWrite `SKILL_MANAGEMENT`, 미열람 시 `NoPermissionPage`)
- `SkillList.jsx` / `useSkillList.js` (컬럼: 스킬명·직군·설명·작업)
- `modal/regist/SkillRegistrationModal.jsx` + `useSkillRegistrationModal.js`
- `modal/edit/SkillEditModal.jsx` + `useSkillEditModal.js`
- `modal/quickAdd/SkillQuickAddModal.jsx` + `useSkillQuickAddModal.js` (직군별 탭·프리셋)
- `preset/skillPresets.js` (설계 §2.6 데이터 그대로, 8직군)
- `useSkillCategoryOptions.js` (기존 category ∪ 프리셋 category → CreatableSelect 옵션)
- **직군(category)**: 등록/수정 모달에 `@atlaskit/select`의 `CreatableSelect`(기존값+프리셋값 셀렉트 + 자유입력).

### 2.2 자원현황 페이지 (`static/ui/src/pages/resource/`)
- `ResourcePage.jsx` (canRead `RESOURCE_MANAGEMENT` 게이트, Atlaskit Tabs 로컬 2탭)
- `SkillMultiSelect.jsx` (공용, category로 group 지은 `Select isMulti`; value/onChange = skillId 배열)
- `StatusBadge.jsx`(공용 경량 배지 — 아래 3.2 참고)
- `overview/`:
  - `ResourceOverviewTab.jsx` (요약카운트·집계시각·stale·클라이언트필터·테이블·모달 조립)
  - `useResourceOverview.js`, `ResourceFilters.jsx`(스킬/직무/등급/투입가능토글)
  - `ResourceOverviewTable.jsx`(CommonTable), `UtilBadge.jsx`, `SkillTags.jsx`(+`SkillChip`), `UserSkillEditModal.jsx`
- `match/`:
  - `ProjectMatchTab.jsx`(활성프로젝트 select), `useProjectSkillMatch.js`
  - `RequiredSkillEditor.jsx`(canWrite `PROJECT`), `CandidateRankTable.jsx`(랭킹/커버리지/매칭·부족 칩)

### 2.3 쿼리키 (팩토리)
- `utils/queryKey/backofficeKeys.js`: `skills: () => ["skills"]`, `findSkills: (id) => ["findSkill", id]` 추가.
- `utils/queryKey/resourceKeys.js`(신규): `all/overview()/userSkills(id)/projectSkills(id)/projectMatch(id)` + `activeProjects()`(활성프로젝트 셀렉트 캐시). 설계 §5.3 그대로 + activeProjects 1개 추가.
- **인라인 키 배열 없음**(전부 팩토리 경유).

### 2.4 라우팅 / 네비
- `App.jsx`: `/resource → ResourcePage`, `/backoffice/skill → SkillPage` 라우트 2개 추가.
- `layout/Sidebar.jsx`(실제 파일명 확인 — `Sidebar.jsx`): mainItems에 `자원관리`(PeopleGroupIcon, perm `RESOURCE_MANAGEMENT`), backofficeItems에 `스킬`(TagIcon, perm `SKILL_MANAGEMENT`) 추가. 기존 `.filter(isReadable)` 권한 게이트 그대로 적용.

### 2.5 권한 게이트 (설계 §5.5)
- `/resource`: `canRead('RESOURCE_MANAGEMENT')` 아니면 `NoPermissionPage`.
- 스킬 편집 버튼/모달 노출: `canWrite('RESOURCE_MANAGEMENT')`.
- 요구스킬 편집(저장 버튼·select 활성): `canWrite('PROJECT')`.
- `/backoffice/skill`: `canRead/canWrite('SKILL_MANAGEMENT')`(RolePage 패턴).

---

## 3. 설계 대비 조정 사항 (경계면 무관, UI 라이브러리 가용성)

### 3.1 없음(경계면 계약) — data/content/rows 접근 100% 계약 일치.

### 3.2 미설치 Atlaskit 패키지 대체 (빌드 검증으로 확인)
- `@atlaskit/tag`, `@atlaskit/lozenge` **미설치**(이 프로젝트는 커스텀 lozenge 컴포넌트 사용). 최초 빌드에서 `Module not found` 확인 → 자체 경량 컴포넌트로 대체:
  - `SkillChip`(SkillTags 내): 스킬 칩(대소문자 보존, neutral/matched/missing 톤).
  - `StatusBadge`: utilBand·투입가능·커버리지 배지(success/info/warning/danger/neutral). DMOVE 팔레트 존중하되 상태색은 의미색 우선(과부하=danger/red, 여유=success/green).
- 사이드바 스킬 아이콘: 설계의 `bookmark`은 아이콘 미존재 → 존재하는 `@atlaskit/icon/core/tag`로 대체(자원=people-group 설계대로).

### 3.3 클라이언트 필터 규칙 명시
- 스킬 다중선택 필터 = **AND**(선택 스킬을 모두 보유한 인력만 통과). 직무/등급 = 정확일치, 투입가능토글 = `available===true`.
- 요약 카운트(전체 풀 기준): idle = utilBand `idle`+`unknown`(둘 다 투입가능), normal = `normal`, over = `over`+`red`.

---

## 4. i18n

### 4.1 추가 파일/키 (locales/kr·en, 직접수정 금지 규칙 준수)
- 신규: `locales/kr/resource.json`+`locales/en/resource.json`, `locales/kr/skill.json`+`locales/en/skill.json` (설계 §6.1/§6.2 키 전부 + 화면 구현에 필요한 보조 키: filter.role/level/all, available.yes/no, userSkill.title/placeholder, match.candidates/noProject/placeholder/save.success 등).
- 기존 수정:
  - `common.json`(kr/en): `pages.skill`, `pages.resource`, `backoffice.workforceSetting.skill.title`.
  - `permission.json`(kr/en): `desc.RESOURCE_MANAGEMENT`, `desc.SKILL_MANAGEMENT` (ResourceCatalog descriptionKey 대응 — 설계 §6.3에 `common.json` 항목으로 표기됐으나 키 네임스페이스가 `permission.desc.*`라 permission.json에 배치).
- **하드코딩 문자열 없음** — 사이드바/탭/배지/버튼 전부 `t()`. (단, QuickAdd 탭 라벨은 직군 데이터값 `preset.category` 직접 표기 — role 프리셋의 industry i18n과 달리 skill category는 저장되는 데이터값 자체이므로 의도적.)

### 4.2 merge 실행 결과
- `cd static/ui && npm run merge` 실행 성공 → `ko-KR.json`/`en-US.json` 재생성.
- 반영 확인(생성물 직접 조회): `ko-KR.resource.nav=자원관리`, `ko-KR.skill.page.title=스킬 관리`, `ko-KR.common.pages.resource=자원관리`, `ko-KR.common.backoffice.workforceSetting.skill.title=스킬`, `ko-KR.permission.desc.SKILL_MANAGEMENT` 존재, `en-US.resource.tab.match=Project Fit`, `en-US.permission.desc.RESOURCE_MANAGEMENT` 존재. ✅
- 빌드 prebuild가 merge 재실행하므로 배포 시에도 자동 반영.

---

## 5. 테스트 / 빌드 결과

- `npm run build`(static/ui): **성공**. 최초 실패 원인(@atlaskit/tag·lozenge 미설치)은 3.2로 해결 후 재빌드 통과. 잔여 경고는 node_modules 소스맵 경고(analytics-next-stable-react-context, marklassian)뿐 — **신규 코드 관련 경고/에러 0**.
- `CI=true react-scripts test`(기존 프론트 유닛): **8 suites / 73 tests 전부 PASS**(신규 파일은 컴포넌트라 유닛테스트 미추가 — 매칭 순수함수는 backend jest에서 검증). 기존 테스트 회귀 없음.
- 환경: Windows PowerShell/Git Bash. ComSpec/NVM 이슈 없이 정상 실행.

---

## 6. verifier 유의 (교차검증 포인트)

1. **data vs content**: 스킬 CRUD + 태그 set/get = `res.data`, overview/match = `res.content`, getActiveProjects = `res.rows`. (§1 표)
2. **util null 가드** 전부 적용(UtilBadge/테이블). 무가드 `.toFixed()` 없음.
3. 가동률 재사용 경로는 백엔드 rollup 1회 read(프론트는 `getResourceOverview` 1콜만, 워크로그 재페치 없음).
4. 쿼리키 전부 팩토리 경유(backofficeKeys.skills/findSkills, resourceKeys.*).
5. i18n merge 반영 완료, 하드코딩 문자열 없음.
6. (백엔드 의존) `getResourceOverview`/스킬 저장은 `forge deploy`(skill KVS 엔티티·SEED_VERSION 7) 후 실동작 — E2E는 배포 환경에서.

---

## 7. 후속 개선 (2026-07-08, 순수 UI · 경계면 shape 불변)

> 프리셋 141개 확장에 따른 UX 개선. `getSkillList`(`res.data`) 소비만 활용, data/content/rows 접근 경로 변경 없음.

### 작업 1: "작업(액션)" 컬럼 헤더 표기
- **어느 테이블이 비어 있었나(실제 확인):** 인력 현황 테이블 `ResourceOverviewTable`의 액션 컬럼 헤더만 `content: ''`로 비어 있었음 → `t('resource.col.action')`로 채움. `i18n resource.col.action`(kr 작업 / en Action) 신규 추가.
- 백오피스 `SkillList`(`useSkillList`)는 이미 `skill.col.action`(작업)을 헤더로 렌더 중 → 변경 불필요(확인만). role 페이지와 동일 패턴.

### 작업 2: SkillMultiSelect 직군(category) 필터 (핵심)
- **구현 방식:** 공용 `SkillMultiSelect` 내부에 직군 필터 Select(단일)를 멀티셀렉트 **위**에 세로 스택으로 추가. 선택 직군의 스킬만 옵션 그룹으로 노출(필터=`null` 시 전체). 공용 컴포넌트에 넣어 **두 모달(UserSkillEditModal, RequiredSkillEditor)에 자동 반영**(둘 다 `showCategoryFilter` 기본값 true).
- **직군 목록:** `getSkillList` 결과의 **distinct category**(빈 값 제외, `localeCompare` 정렬) — 하드코딩 없음. 최상단에 "전체 직군"(value=null) 옵션.
- **선택 유지 불변식:** 선택된 스킬(value)은 `value` prop에서 파생하므로 필터가 옵션을 좁혀도 해제·소실되지 않음. 라벨은 `skillMap` 폴백으로 항상 표시.
- **레이아웃 보존:** 3번째 소비처 `ResourceFilters`(가로 필터 바)는 스택 레이아웃 방지를 위해 `showCategoryFilter={false}`로 명시(모달만 필터 노출). prop 제어로 구현.
- Atlaskit `Select`(isSearchable=false, spacing=compact, menuPortal zIndex) — 기존 스타일 일관.

### 추가 i18n 키 (kr·en → `npm run merge` 실행·반영 확인)
- `resource.col.action`(작업/Action), `resource.filter.category`(직군/Category), `resource.filter.allCategories`(전체 직군/All categories). ko-KR/en-US 생성물에 반영 확인 완료.

### 변경 파일
- `static/ui/src/pages/resource/SkillMultiSelect.jsx`(직군 필터 추가)
- `static/ui/src/pages/resource/overview/ResourceOverviewTable.jsx`(액션 헤더)
- `static/ui/src/pages/resource/overview/ResourceFilters.jsx`(showCategoryFilter=false)
- `locales/kr/resource.json`, `locales/en/resource.json`(키 3종) → merge로 `ko-KR.json`/`en-US.json` 갱신

### build 결과
- `npm run build`: **성공**("Compiled with warnings" = node_modules 소스맵 경고뿐, 신규/변경 코드 경고 0).
