# 권한관리 고도화 (permission-hardening) — 프론트엔드 구현 리포트

작성: frontend-engineer | 2026-07-03 | 근거: `01_architect_design.md`(SSOT) + `02_backend_report.md`(실제 응답 shape)
대상 브랜치: RFC-134 | 커밋: 미수행(지시대로)

> 소비한 `invoke().content` 접근 경로는 **02_backend_report의 실제 shape에 글자 그대로** 맞췄다. 아래 §2에 접근 경로를 명시한다.

---

## 0. 결과 요약

- **`npm test` (react-scripts, CI=true): 6 suites / 58 tests 전부 PASS.** 기존 테스트 무회귀. (프론트에는 이번 기능 전용 단위 테스트 없음 — 로직은 계약 소비/UI 중심)
- **`npm run build`: 성공(Compiled with warnings).** 경고는 전부 기존 node_modules 소스맵 파싱 경고(@atlaskit/analytics-next-stable-react-context, marklassian) — 내 코드 원인 아님. 신규/변경 파일에서 컴파일 에러 0.
- i18n: `locales/kr`·`locales/en`에 키 추가 후 **`npm run merge` 실행 완료** → `ko-KR.json`/`en-US.json` 재생성 확인(desc 14키 포함 전량 존재).

---

## 1. 변경/신규 파일 전체 목록

### 신규 (4)
| 파일 | 역할 |
|---|---|
| `static/ui/src/hooks/usePermissionCatalog.js` | `getPermissionCatalog` 소비 훅. 구 `getPages(t)`와 동일한 어댑터 shape(`{PAGES, PAGE_LIST, isLoading}`) 반환 → 소비부 수정 최소화 |
| `static/ui/src/utils/permissionError.js` | 가드 거부 `error.code` 분기 유틸(`isPermissionDenied`/`isProjectScopeDenied`/`showPermissionDeniedToast`, `PERMISSION_ERROR_CODES`) |
| `static/ui/src/backoffice/page/permission/modal/ProjectScopeField.jsx` | ④ projectScope 토글(Atlaskit Toggle, ON=MEMBER_ONLY) + 도움말 문구. `isDisabled`로 Admin/Member(edit:false) 비활성 |
| `_workspace/permission-hardening/02_frontend_report.md` | 본 리포트 |

### 삭제 (1)
| 파일 | 사유 |
|---|---|
| `static/ui/src/constants/pages.jsx` | `PAGE_IDS`/`getPages` 제거(설계 §7-B). 7개 소비부를 카탈로그 훅으로 전환 완료 후 삭제 |

### 수정 (12)
| 파일 | 변경 |
|---|---|
| `static/ui/src/stores/usePermissionStore.js` | **fail-close 전환**: `res.pages` 직소비(PAGE_IDS 의존 제거). `projectScope` 저장 + `getProjectScope()` 셀렉터 추가. catch/미정의 키는 `?? false`로 전부 false. `canRead/canWrite` 시그니처 불변(27개 호출부 무수정) |
| `static/ui/src/utils/queryKey/backofficeKeys.js` | `permissionCatalog: () => ["permission","catalog"]` 추가(팩토리 규칙 준수) |
| `static/ui/src/backoffice/page/permission/modal/usePermission.js` | `usePageData()`를 `usePermissionCatalog()` 어댑터로 교체(+`isLoading` 노출). `useSectionHeaderCheckbox` 옵셔널 체이닝 방어 |
| `static/ui/src/backoffice/page/permission/usePermissionList.js` | `getPages(t)` → `usePermissionCatalog()` PAGES |
| `.../permission/modal/regist/usePermissionRegistrationModal.js` | 카탈로그 훅 연동, `projectScope` 상태, backfill 이펙트(async 카탈로그 대응), 거부 토스트, `addPermission` payload에 `projectScope` |
| `.../permission/modal/regist/PermissionRegistrationModal.jsx` | 카탈로그/로딩 스피너, read/write 의미 도움말, 행별 descriptionKey 설명, ProjectScopeField, 옵셔널 체이닝 |
| `.../permission/modal/edit/usePermissionEditModal.js` | `projectScope`/`editable`(data.edit) 상태, isDirty에 scope 반영, `updatePermission` payload에 `projectScope`, 거부 토스트(update/delete) |
| `.../permission/modal/edit/PermissionEditModal.jsx` | 카탈로그/로딩, 도움말, 행별 설명, ProjectScopeField(`isDisabled={!editable}`) |
| `.../user/modal/regist/UserRegistrationModal.jsx` | `getPages` → `usePermissionCatalog()` PAGES(권한 요약 툴팁 소스) |
| `.../user/modal/edit/UserEditModal.jsx` | 동일 |
| `static/ui/src/constants/tabs.js` | `projectDetailTabs(...canReadCost)` 인자 추가, 비용 탭 `canRender: () => canReadCost` |
| `static/ui/src/components/tabs/ProjectDetailTabs.jsx` | `canReadCost = canRead('PROJECT_COST')` 추가·전달 |
| `static/ui/src/pages/projectDetail/ProjectDetailPage.jsx` | ④ 비소속 상세 접근 게이트: `findProjectById` 조회 → `PERMISSION_PROJECT_SCOPE_DENIED` 시 EmptyState + 목록 복귀 버튼 |

### i18n 소스 (4 — merge 소스)
`locales/kr/common.json`, `locales/en/common.json`, `locales/kr/permission.json`, `locales/en/permission.json` (§4)

---

## 2. 소비한 응답 shape (접근 경로 글자 그대로)

| resolver | 소비 위치 | 접근 경로 |
|---|---|---|
| `userPermissionCheck` | `usePermissionStore.loadPermissions` | `res.pages` (배열, `page.pageId`/`page.value.read`/`page.value.write`), `res.isUser`, **`res.projectScope`** (`?? 'ALL'`) |
| `getPermissionCatalog` | `usePermissionCatalog` | **`res.sections`** → `section.sectionId`/`section.sectionLabelKey`/`section.resources[].key`/`.labelKey`/**`.descriptionKey`** |
| `findPermissionById` | `usePermissionEditModal` | `res.pages`, `res.name`, `res.edit`, **`res.projectScope`**(`?? 'ALL'`) |
| `findProjectById` | `ProjectDetailPage`(스코프 게이트) | invoke 결과 `res` → `res.error.code === 'PERMISSION_PROJECT_SCOPE_DENIED'` 판정(`utils/permissionError.isProjectScopeDenied`) |
| `addPermission`(payload) | `usePermissionRegistrationModal` | `{ name, projectScope, pages:[{pageId,value:{read,write}}] }` |
| `updatePermission`(payload) | `usePermissionEditModal` | `{ id, name, pages, isNameChanged, projectScope }` |
| 가드 거부(공통) | mutation onSuccess / `utils/permissionError` | `res.error.code` (name 아님) — `PERMISSION_DENIED`/`UNMAPPED`/`PRINCIPAL_UNRESOLVED` → 토스트, `PERMISSION_PROJECT_SCOPE_DENIED` → EmptyState |

- **pages 완전성**: 백엔드가 카탈로그 14키 전체를 항상 내려주므로, store는 응답을 그대로 신뢰(더는 PAGE_IDS로 빈칸 보완 안 함). `WORKLOG` 없음 확인 — store가 키 목록을 응답에서 파생하므로 자동 정합.
- **descriptionKey 확장**(backend 리더 승인): `resources[].descriptionKey`를 `t()`로 각 권한 행 설명에 렌더.

### 계약 관찰 사항(리더 판단용)
- 계약과 **불일치 없음**. 02_backend_report §2 shape과 프론트 접근 경로 1:1 일치.
- `getPermissionList`/`userPermissionCheck`의 신규 `projectScope`는 하위호환(모달이 findPermissionById로 초기화하므로 list의 scope는 미사용 — 무시 안전).

---

## 3. UI 문구(설명 충실화 — 사용자 특별 요청 반영)

권한 설정 화면이 스스로 설명되도록 다음을 추가(모두 i18n):
- **행별 설명**: 등록/수정 모달 매트릭스 각 권한 행에 `descriptionKey` 기반 보조 텍스트(subtlest) 노출. 예) PROJECT_COST = "프로젝트 상세의 비용 탭. 인건비·단가 등 재무 민감정보를 열람합니다. 민감 정보이므로 기본값은 비공개입니다."
- **read/write 의미**: 매트릭스 상단 `permission.rw.help` = "읽기(Read)는 화면 조회 권한, 쓰기(Write)는 생성·수정·삭제 권한입니다…". 컬럼 라벨도 `permission.column.read/write`로 i18n화.
- **projectScope 토글 도움말**: `ProjectScopeField`에 현재 선택별 도움말(allHelp/memberOnlyHelp) + 전체 설명(`scope.description`) = "…소속 프로젝트만 켜면 목록·칸반·대시보드·리포트가 소속 기준 필터, Jira 관리자는 항상 전체".
- **접근 불가 안내**: 비소속 상세 진입 시 EmptyState(`projectScopeDeniedTitle`/`projectScopeDenied`) + "프로젝트 목록으로 돌아가기" 버튼.

---

## 4. i18n 키 추가 + merge

**추가 위치**: `locales/kr/*`·`locales/en/*` (ko-KR/en-US 직접 수정 안 함). **`npm run merge` 실행 완료.**

- `common.json`: `sections.workforce`, `sections.settings`, `pages.gantt`, `pages.cost` (그 외 pages 키는 기존 재사용)
- `permission.json`:
  - 에러/스코프(설계 §8): `error.denied`, `error.unmapped`, `toast.deniedTitle`, `scope.label`, `scope.all`, `scope.memberOnly`, `scope.description`, `error.projectScopeDenied`, `error.projectScopeDeniedTitle`
  - 추가 UI 보조: `column.read/write`, `rw.help`, `scope.toggleLabel`, `scope.allHelp`, `scope.memberOnlyHelp`, `error.projectScopeReturnList`
  - **desc.* 14키**(descriptionKey): DASHBOARD/REPORT/KANBAN/PROJECT/PROJECT_GANTT/PROJECT_COST/SETTINGS/USER_MANAGEMENT/ROLE_MANAGEMENT/LEVEL_MANAGEMENT/PERMISSION_MANAGEMENT/PROJECT_STATUS_MANAGEMENT/PUBLIC_HOLIDAY_MANAGEMENT/STORAGE_MONITORING
- merge 산출물 검증: `ko-KR.json`/`en-US.json`에서 위 키 + desc 14키 전량 존재 확인.
- 부수 수정: 등록 모달의 최소권한 경고가 존재하지 않던 `permission.alert` → 실제 키 `permission.modal.alert`로 교정(기존 잠재 버그).

---

## 5. 테스트/빌드 결과 원문

```
# npm test (CI=true)
Test Suites: 6 passed, 6 total
Tests:       58 passed, 58 total

# npm run build
Compiled with warnings.  (node_modules 소스맵 경고만 — 코드 에러 0)
The build folder is ready to be deployed.
```

---

## 6. 검증자(integration-verifier) 확인 권장 포인트

1. `usePermissionStore` fail-close: 미등록 사용자/빈 pages/invoke 실패가 canRead·canWrite에서 전부 false인지.
2. `usePermissionCatalog` 어댑터가 `res.sections[].resources[].{key,labelKey,descriptionKey}`를 정확히 매핑하는지(라벨/설명 t() 렌더).
3. add/update payload의 `projectScope`가 토글값과 일치, 편집 진입 시 `findPermissionById.projectScope`로 초기화되는지.
4. 비용 탭: Member(PROJECT_COST read=false) 비노출 — behavior change 의도대로.
5. `ProjectDetailPage` 스코프 게이트: `findProjectById`가 `PERMISSION_PROJECT_SCOPE_DENIED` 반환 시 EmptyState 렌더(공통 게이트, 개별 탭 쿼리도 동일 코드로 실패하나 페이지 레벨에서 선차단).
6. 카탈로그 async화에 따른 모달 초기 렌더(빈 PAGE_LIST) 로딩 스피너/backfill 정상 동작.

---

## 7. 시드 scope 토글 완화 (사용자 결정 — 백엔드 후속 변경 대응)

백엔드가 "시드 세트(edit:false)도 projectScope 토글만 편집 가능(Admin 제외)"으로 변경됨에 따라 프론트를 맞춤.

### 소비한 신규 shape (backend 확정)
| resolver | 소비 위치 | 접근 경로 / 처리 |
|---|---|---|
| `updatePermissionScope`(신규) | `usePermissionEditModal.scopeMutation` | payload `{ id, projectScope }` → 성공 `res.success===true` |
| Admin 세트 거부 | 동 onSuccess 분기 | `res.error.code === 'PERMISSION_SCOPE_ADMIN_IMMUTABLE'` → `permission.error.scopeAdminImmutable` 토스트 + scope 롤백 |
| `findPermissionById` | 기존 소비 유지 | `res.name`(=== 'Admin' 판정), `res.edit`(name/pages 잠금 판정), `res.projectScope`(초기값) |

### 변경 파일 (이번 후속분)
| 파일 | 변경 |
|---|---|
| `.../permission/modal/edit/usePermissionEditModal.js` | `isAdminSet`(name==='Admin') 상태 추가. 신규 `scopeMutation`(updatePermissionScope) + 목록/상세 쿼리 invalidate + store reload. `handleSubmit` 저장 경로 분기(**editable→updatePermission / !editable→updatePermissionScope**). 시드 열람 시 "편집 불가" 자동 토스트 제거 |
| `.../permission/modal/edit/PermissionEditModal.jsx` | ProjectScopeField `isDisabled={isAdminSet}`(Admin만 잠금) + 세트별 `noteKey`. name/pages(및 delete) 잠금 = `pagesDisabled=!editable`를 name Textfield·6개 Checkbox·삭제 버튼에 전파 |
| `.../permission/modal/ProjectScopeField.jsx` | `noteKey` prop 추가(세트 유형별 안내 문구 렌더) |
| `.../permission/usePermissionList.js` | `handleEdit`에서 `!editable` 조기 리턴 제거 → **시드 세트도 편집 모달 오픈 가능**(canWrite 게이트는 유지) |
| `utils/permissionError.js` | `PERMISSION_ERROR_CODES.SCOPE_ADMIN_IMMUTABLE` 추가 |
| `locales/kr·en/permission.json` | `scope.adminNote`, `scope.seedNote`, `error.scopeAdminImmutable` 추가 → **merge 실행 완료** |

### 활성화/잠금 규칙 (최종)
- **Admin 세트**: name/pages 잠금 + **scope 토글도 잠금**(비활성) + `scope.adminNote`("항상 전체 프로젝트 조회, 변경 불가"). 저장 버튼은 isDirty=false로 비활성.
- **시드 비-Admin(Member 등, edit:false)**: name/pages·삭제 잠금, **scope 토글 활성** + `scope.seedNote`("기본 세트는 페이지 권한 수정 불가, 조회 범위는 설정 가능"). 저장 시 `updatePermissionScope`.
- **커스텀 세트(edit:true)**: 전부 편집 가능. 저장 시 기존 `updatePermission`.
- 방어: 서버가 Admin scope 변경을 `PERMISSION_SCOPE_ADMIN_IMMUTABLE`로 거부하면 토스트 + 원복(프론트 판정은 UX 보조, 실제 차단은 서버).

### i18n 키(후속 추가)
`permission.scope.adminNote`, `permission.scope.seedNote`, `permission.error.scopeAdminImmutable` (kr+en) — merge 반영 확인.

### 테스트/빌드 (후속 재실행)
```
npm test (CI=true):  6 suites / 58 tests PASS
npm run build:       Compiled with warnings (node_modules 소스맵 경고만, 코드 에러 0)
```

---

## 8. 간트 읽기 전용 게이트 (E2E 피드백 — `canWrite('PROJECT_GANTT')===false` 완전 읽기전용)

**문제**: write 권한이 없어도 SVAR 간트의 편집 **제스처 자체는 동작**(막대 드래그·리사이즈·링크 연결·그리드 행 드래그)해, 낙관적 업데이트로 화면이 바뀌었다가 서버 가드 거부로 튕기는 혼란스러운 UX. (invoke/서버 write 는 이미 차단되어 값 반영은 안 됨.)

### 원인 분석 (실코드 기준)
- 기존에도 `init(api)` 의 `intercept('add-link'|'delete-link'|'move-task')` 는 항상 `return false`(로컬 적용 차단, 서버 권위), `intercept('update-task', ()=>editable)` 로 커밋은 게이트돼 있었다. GanttPage 의 **모든 mutation 핸들러**(handleScheduleChange/handleSetParent/handleAddLink/handleRemoveLink/handleUpdate*/폴더 CRUD/handleSetIssueFolder)도 `if(!canWrite) return` 로 invoke·낙관적(onMutate) 진입을 이미 막고 있었다.
- **누락분 = 제스처 자체**: SVAR 무료 빌드가 막대/링크/행 드래그 포인터 핸들러를 계속 렌더 → intercept 는 드래그 **종료 시점**에만 false 를 돌려주므로, 드래그 중 프리뷰가 움직였다가 스냅백.

### 방식 — SVAR 네이티브 `readonly` (제스처 원천 차단)
- 무료 빌드 dist 검증 결과 `readonly` 는 실효 prop: 막대(`Vn`)·링크(`_n`)·그리드 테이블(`Dn`)에 스레드되고, 드래그/리사이즈/행-reorder/인라인 에디터(show-editor) 포인터 핸들러가 **`if(!readonly)`** 로 게이트됨. 반면 `open-task`(트리 펼침/접기)·`select-task`·스크롤은 readonly 가드 **밖** → 읽기 조작 유지 확인.
- **`GanttChart.jsx`: `<Gantt readonly={!editable}>` 추가**(editable = canWrite). 이것이 1차(제스처 차단).

### 차단한 인터랙션 (readonly=true 시)
| 인터랙션 | 차단 방식 |
|---|---|
| 막대 드래그/리사이즈(일정 변경) | `readonly`(제스처) + `intercept('update-task',()=>editable)`(커밋) + `handleScheduleChange` canWrite |
| 링크(선후행) 생성/삭제 | `readonly`(연결 핸들 미동작) + `intercept('add-link'/'delete-link')` false + `handleAddLink`/`handleRemoveLink` canWrite |
| 그리드 행 드래그 → 상위/폴더 지정·폴더 이동 | `readonly`(행 드래그 핸들러 `if(!e)`) + `intercept('move-task')` false + `handleSetParent`/`handleMoveFolder`/`handleSetIssueFolder` canWrite |
| 인라인 셀 편집(담당자/협업자/시작일/기간/계획MD) | 셀이 이미 `editable=false` 시 읽기표시 + `readonly`(show-editor 차단) + 저장 핸들러 canWrite |
| 상위 지정/폴더 액션 컬럼·드롭다운 | `columns` useMemo 가 `editable` 일 때만 setParent 컬럼 렌더(무권한 미표시) |
| 폴더 생성/이름변경/이동/삭제, 이슈-폴더 지정 | 툴바 "폴더 추가" 버튼 `canWrite` 게이트 + 모든 폴더 mutation 핸들러 canWrite |
| indent 핫키 | `intercept('indent-task', ()=>false)` 항상 차단(기존) |

### 유지한 읽기 기능 (readonly 무관)
가로/세로 스크롤·grab-to-pan, 줌(일/주/월), 트리 펼침/접기(open-task), 행 선택, 막대 hover 툴팁, 마커 오버레이, 필터(담당자/상태).

### 이중(삼중) 게이트 지점
1. **제스처**: `<Gantt readonly={!editable}>` (신규).
2. **커밋(intercept)**: `update-task`=editable 게이트, `add-link`/`delete-link`/`move-task`/`indent-task`=false(기존 유지).
3. **invoke/낙관적**: GanttPage 의 모든 핸들러 `if(!canWrite) return` → `.mutate()` 미호출 = onMutate(setQueryData) 낙관적 패치 자체가 안 일어남(기존 유지, 요구 6 충족).

### 사용자 안내 (i18n)
- `GanttPage` 의 `gantt.readOnlyHint` SectionMessage 문구 보강("조회만 가능: 스크롤·확대/축소·펼치기").
- **`GanttToolbar` 에 "조회 전용" 뱃지 신규**(`!canWrite` 시, `gantt.readOnlyBadge`). 의존성 추가 없이 인라인 스타일 뱃지.

### 변경 파일 (이번 후속분)
| 파일 | 변경 |
|---|---|
| `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` | `<Gantt readonly={!editable}>` 추가 |
| `static/ui/src/pages/projectDetail/gantt/GanttToolbar.jsx` | `!canWrite` 시 "조회 전용" 뱃지 렌더 |
| `locales/kr·en/gantt.json` | `readOnlyBadge` 신규 + `readOnlyHint` 문구 보강 → **merge 실행 완료** |

### 테스트/빌드
```
npm test (CI=true):  6 suites / 58 tests PASS
npm run build:       Compiled with warnings (node_modules 소스맵 경고만, 코드 에러 0)
```
