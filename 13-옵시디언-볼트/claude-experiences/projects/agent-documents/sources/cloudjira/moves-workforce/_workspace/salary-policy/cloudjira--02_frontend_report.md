# 급여 정책 (Salary Policy) — 프론트엔드 구현 리포트 · **RFC-163 Phase B (P0+P1)**

작성: frontend-engineer / 2026-08-03
설계서: `_workspace/salary-policy/01_architect_design.md` (r3)
**단일 진실:** `_workspace/salary-policy/02_backend_report.md` §2 (설계서와 충돌 시 백엔드 리포트 우선)
작업 위치: `C:\CloudJira\moves-workforce-rfc-163` (worktree, 브랜치 `RFC-163`)

---

## 0. 요약

| 항목 | 결과 |
|------|------|
| 범위 | §11 Phase B **B1~B10 · B14 · B15** (P0+P1). **B11·B12(P2) 미착수, B13 폐기분 미착수** |
| 백엔드(`src/`) 변경 | **0건** (git status 상 `src/` 는 backend-engineer 산출물 그대로) |
| `npm test` (프로젝트 표준 = `jest`, `jest.config.js`) | **62 suites / 1061 tests 전부 통과, 실패 0** |
| `npx react-scripts test` (리더 지정 baseline 커맨드) | 60 suites 중 **1 suite 실패 / 1036 tests 전부 통과** — 실패는 **baseline 그대로**(`workListQuery.test.js`) |
| **baseline 대비 신규 실패** | **0건** (baseline: 1 suite 실패 / 1003 tests 통과 → 현재: 동일 1 suite 실패 / 1036 tests 통과) |
| `npm run build` | **성공** (prebuild merge 포함). 번들 예산 통과 `gzip 271,495 B / 1,625,293 B` |
| i18n merge | **실행함** (`npm run merge` 수동 1회 + build prebuild 자동). ko-KR/en-US 에 신규 키 17종 전부 반영 확인 |
| 백엔드 §2 와 다르게 소비한 부분 | **없음.** 단 §6 에 "설계서와 다르게 구현한 3건"(전부 프론트 내부 결정)을 명시 |

---

## 1. 신규 파일

| 파일 | 역할 | 작업 |
|------|------|------|
| `static/ui/src/hooks/useSalaryPolicy.js` | 정책 단일 소스 훅 + `coerceSalaryPolicy` 순수 함수 | B1 |
| `static/ui/src/components/salary/SalaryCell.jsx` | **급여 표시의 유일한 구현부** | B2 |
| `static/ui/src/components/salary/SalaryField.jsx` | **급여 입력의 유일한 구현부** + `SalaryPolicyNotice` | B2 |
| `static/ui/src/backoffice/page/setting/SalaryPolicySetting.jsx` | 설정 '급여 정책' 카드 + 확인 다이얼로그 | B3 |
| `static/ui/src/backoffice/page/level/salaryBand.js` | 밴드 입력 정규화·검증·중앙값 (순수) | B4 |
| `static/ui/src/backoffice/page/level/modal/LevelBandFields.jsx` | 밴드 3필드 (등록/수정 모달 공용, 자체 정책 판정) | B4 |
| `static/ui/src/backoffice/page/level/LevelPolicyNotice.jsx` | INDIVIDUAL 안내 1줄 | B4 |
| `static/ui/src/pages/portfolio/utils/costMaskedReason.js` | `costMaskedReason` → 문구 키 매핑 (포트폴리오·팀 분석 공용) | B15 |
| `static/ui/src/components/salary/__test__/salaryRenderGuard.test.js` | 정적 검사 | B10 |
| `static/ui/src/components/salary/__test__/salaryPolicyContract.test.js` | 순수 계약 단위 테스트 (추가) | B10+ |

## 2. 수정 파일

`SettingPage.jsx` · `useLevelList.js` · `LevelPage.jsx` · `LevelRegistrationModal.jsx` · `useLevelRegistrationModal.js` ·
`LevelEditModal.jsx` · `useLevelEditModal.js` · `UserListPaging.jsx` · `UserEditModal.jsx` · `useUserEditModal.js` ·
`UserRegistrationModal.jsx` · `SalaryManagementPage.jsx` · `SummaryPanel.jsx` · `AddChartModal.jsx` ·
`PortfolioDashboardPage.jsx` · `sections/ComparisonTabs.jsx` · `teamAnalytics/TeamAnalyticsTab.jsx` ·
`teamAnalytics/hooks/useTeamAnalyticsData.js` · `teamAnalytics/charts/TeamCompareBar.jsx` ·
`utils/queryKey/projectKeys.js` · `teamAnalytics/__test__/teamAnalyticsI18n.test.js`

locales: `kr|en` × `setting.json · level.json · user.json · salary.json · cost.json · portfolio.json · teamAnalytics.json` (14개)
+ merge 산출물 `ko-KR.json` / `en-US.json` (직접 수정 아님 — `npm run merge` 생성물)

> ⚠ `costGating.js` · `teamMetrics.js` · `teamAnalyticsFields.js` · 포트폴리오 위젯의 `?? 0` 10여 지점은 **한 글자도 건드리지 않았다**(§7-6(c)(d) 지시).

---

## 3. 소비한 응답 shape — **백엔드 리포트 §2 글자 그대로**

### 3-1. `getSettingData` → `useSalaryPolicy.js`
```js
{ success:true, currency, hourRate, …, salaryPolicy: 'INDIVIDUAL' | 'LEVEL_BAND' }
```
- `const { success, ...setting } = result;` 후 `setting.salaryPolicy` 소비. 루트 직접 접근(`content` 아님) — `responseWrapper` spread 계약 준수.
- 쿼리키는 **기존 `settingKeys.detail()` 재사용**(신규 팩토리 0개, 추가 네트워크 0).
- 🔴 **프론트 fail-close**: `isLoading || isError || !data` → `policy = null` → 금액을 그리지 않는다. `INDIVIDUAL` 낙관 폴백 없음.

### 3-2. `updateSetting` → `SalaryPolicySetting.jsx`
```js
// 입력 : { salaryPolicy: 'INDIVIDUAL'|'LEVEL_BAND' }   ← 이 필드만 보낸다(부분 갱신)
// 응답 : { success:true, content:{ settings:{ …전체 settings, salaryPolicy } } }
```
- `res.content.settings` → `onSettingsUpdated(savedSettings)` → `SettingPage.reflectSavedSettings` → `queryClient.setQueryData(settingKeys.detail(), next)`.

### 3-3. `getLevelList` → `useLevelList.js` / `SalaryPolicySetting.jsx`
```js
{ success:true, data:[ { id, name, description,
    salaryMin: number|null, salaryMax: number|null, salaryRepresentative: number|null } ] }
```
- **미설정이 `null` 로 정규화돼 온다**는 계약을 그대로 믿는다 → `undefined` 분기 없음.
- 밴드 미설정 등급 수 = `salaryMin === null && salaryMax === null && salaryRepresentative === null` 인 행 수. 조회 실패 시 **경고 미표시**(graceful degrade, 저장은 막지 않음).

### 3-4. `findLevelById` → `useLevelEditModal.js`
```js
{ success:true, data:{ id, levelData:{ name, description, salaryMin, salaryMax, salaryRepresentative } } }
```
- `res.data.levelData` 소비(기존 경로 유지). `toBandInput()` 으로 폼 문자열화 — **`|| ''` 를 쓰지 않아 `0` 이 빈칸이 되지 않는다.**

### 3-5. `addLevel` / `updateLevel` → 밴드 입력 규약 준수
```js
// addLevel   : { name, description, salaryMin, salaryMax, salaryRepresentative }
// updateLevel: { id, name, description, isNameChanged, salaryMin, salaryMax, salaryRepresentative }
```
- 미입력은 **`''`**(빈 문자열)로 **항상 3키를 싣는다** — 서버 `toBandAttribute()` 가 속성을 생략하고, `set()` 전체 치환이라 **빈 값 전송 = 밴드 해제**.
- `undefined` 는 만들지 않는다(JSON 에서 키가 사라져 "미전달"이 되고, 그러면 서버의 중앙값 폴백이 의도치 않게 발동할 수 있다).
- 대표값 자동채움은 **"비어 있을 때만"** + `[중앙값 계산]` 버튼(§3-3 규칙 그대로). 서버 폴백은 별개로 계속 동작한다.
- `error.code === 'LEVEL_SALARY_BAND_INVALID'` 를 두 모달 모두에서 분기 처리.

### 3-6. `getUserListWithPaging` → `UserListPaging.jsx`
```js
// INDIVIDUAL: { success:true, salaryPolicy:'INDIVIDUAL', content:[ { …, salary:number|null } ], page:{…} }
// LEVEL_BAND: { success:true, salaryPolicy:'LEVEL_BAND', content:[ { …, levelBand:{min,max}|null } ], page:{…} }
```
- 셀: `<SalaryCell amount={row.salary} band={row.levelBand} policy={data?.salaryPolicy} />`
- 🔴 **`row.salary ?? 0` 도, 기존의 `row.salary ? … : '-'` 도 쓰지 않는다**(후자는 `0`원을 `-` 로 만드는 별개 결함이었다 — 이번에 함께 해소).
- 헤더 라벨만 `user.table.header.salary` ↔ `.salaryBand` 로 분기.

### 3-7. `findUserByAccountId` → `useUserEditModal.js` / `UserEditModal.jsx`
```js
// INDIVIDUAL: { success:true, salaryPolicy:'INDIVIDUAL', …, salary:number|null, roleKey, levelKey, permissionKey, teamKey, teamName }
// LEVEL_BAND: { success:true, salaryPolicy:'LEVEL_BAND',  …, levelBand:{min,max}|null   ← salary 키 없음
```
- `userData.salaryPolicy` 를 `useSalaryPolicy(responsePolicy)` 에 넘겨 **응답 쪽 우선**(설정 캐시 stale 방어).
- 기존 `salary: userData.salary != null ? String(userData.salary) : ''` 는 그대로 — LEVEL_BAND 에서 키가 없으면 `''` 이라 `isDirty` 오탐이 없다.

### 3-8. `updateUser` → `useUserEditModal.js`
```js
// INDIVIDUAL: { success:true, content:{ droppedFields:[] } }
// LEVEL_BAND: salary 를 실제로 보냈을 때만 { content:{ droppedFields:['salary'] } }
```
- 🔴 **LEVEL_BAND 에서는 `salary` 키를 아예 보내지 않는다**(조건부 스프레드). 이유는 §6-2 참조.

### 3-9. `getProjectSalaryList` → `SalaryManagementPage.jsx`
```js
// INDIVIDUAL
{ success:true,
  rows:[ { project_member_id, account_id, role_key, level_key,
           salary, salary_type, annual_salary, effective_salary, total_count } ],
  meta:{ projectMonths, salaryPolicy:'INDIVIDUAL', unpricedMemberCount } }
// LEVEL_BAND
{ success:true,
  rows:[ { project_member_id, account_id, role_key, level_key,
           level_band:{min,max,representative}|null, effective_salary, total_count } ],
  meta:{ projectMonths, salaryPolicy:'LEVEL_BAND', unpricedMemberCount } }
```
- `data.rows` / `data.meta.*` 루트 직접 접근(`content` 아님) — 기존 코드와 동일.
- 정책 원천으로 **`meta.salaryPolicy`** 를 훅에 주입.
- LEVEL_BAND: 연봉·계산모드·투입급여 **3열 제거** + 등급밴드 1열 추가. `updateProjectMemberSalary` 는 **호출 경로 자체가 없다**(InlineEdit 미렌더).
- 🔴 `meta.unpricedMemberCount` 는 **`number|null`**(§3 D-3) → `typeof === 'number' && > 0` 일 때만 경고. `?? 0` 없음.

### 3-10. `getSummaryData` → `SummaryPanel.jsx`
```js
// INDIVIDUAL: { success:true, project_id, project_name, start_date, end_date, total_member_count, total_salary }
// LEVEL_BAND: { …, total_salary 키 자체가 없음 }
```
- 판정: `hasTotalSalary = isLoading || (data != null && data.total_salary !== undefined)`
- **`:39` 의 KpiTile 자체를 렌더하지 않는다** + 그리드 컬럼 수를 3→2 로 줄여 빈 칸이 남지 않게 했다.
- 로딩 중에는 아직 모르므로 기존 `"..."` 타일을 유지한다(깜빡임 대신 정직한 미확정 표시).

### 3-11. `getPortfolioDashboard` → `PortfolioDashboardPage.jsx` / `ComparisonTabs.jsx` / teamAnalytics (B15)
```js
{ success:true, …, ...(costMasked ? {} : { salaryBuckets }),
  costMasked:boolean,
  costMaskedReason:'NONE'|'PERMISSION'|'SNAPSHOT_STALE_POLICY',   // 항상 존재
  salaryPolicy:'INDIVIDUAL'|'LEVEL_BAND', … }
```
- **마스킹 동작은 무수정** — `isCostMasked(data)` 와 `costGating.js` 를 그대로 쓴다.
- `costMaskedReason` 은 **문구만** 가른다:
  - Cost 탭: `'SNAPSHOT_STALE_POLICY'` → `portfolio.cost.staleSnapshot` + **재집계 CTA**(`SectionMessageAction`), 그 외 → 기존 `portfolio.cost.masked`(무변경)
  - 팀 분석 비교 막대 notes: `teamAnalytics.costMaskedStale` ↔ 기존 `teamAnalytics.costMasked`
- **모르는 값·부재는 기존(권한) 문구로 폴백** — 구버전 응답에서 "재집계하세요"라고 잘못 안내하지 않기 위해서다.
- 권한 경로에는 **재집계 버튼을 두지 않는다**(재집계로 풀리지 않는 문제에 잘못된 행동을 유도하게 된다).

### 3-12. `getChartData` / `getChartDataById` (`data_type:'salary'`) → `AddChartModal.jsx`
- 서버가 `{denied:true, reason:'SALARY_POLICY_LEVEL_BAND'}` 로 막으므로, 프론트는 **만들 수 없는 위젯을 고르지 못하게**만 한다:
  `allowSalaryWidget = canReadCost && !isLevelBand` → `TEMPLATES`/`DATA_TYPES` 필터.
- 정책 미확정이면 `isLevelBand === false` → **기존 동작(권한만 판정) 유지**(위젯 목록이 깜빡이지 않게).

---

## 4. UI/UX — "UI UX 더럽지 않게" (사용자 명시 요구) 이행 내역

| 요구 | 이행 |
|---|---|
| 정책 분기를 2개 컴포넌트에 몰아넣기 | `SalaryCell`/`SalaryField` 가 **유일한 구현부**. **호출부에 `if (isLevelBand)` 가 0줄**이다. 안내 문구도 `SalaryPolicyNotice`·`LevelPolicyNotice`·`LevelBandFields` 가 **스스로 판정**해 호출부는 무조건 렌더만 한다 |
| 로딩 중 금액 금지 | `policy === null` → `SalaryCell` 이 **스켈레톤**(회색 바)만 그린다. `SalaryField` 는 비활성. 낙관 폴백 없음 |
| 등급 밴드 컬럼 INDIVIDUAL 에서 **숨김** | `useLevelList` 가 컬럼을 아예 만들지 않는다(비활성 아님) + `LevelPolicyNotice` 가 **얇은 subtle 1줄**로 "왜 안 보이나"를 해소. 배너(`SectionMessage`)를 쓰지 않은 이유: 대다수 조직이 INDIVIDUAL 로 상주하므로 경고 톤이면 매일 보이는 노이즈가 된다 |
| 정책 전환 확인 다이얼로그 필수 | Atlaskit `ModalDialog` 기반 기존 공용 `ConfirmModal` 재사용(`window.confirm` **미사용**). 문구가 **전환 방향별로 다르고**, 캐시 지연 안내를 subtle 한 두 번째 줄로 병기 |
| 정책 선택 UI | `@atlaskit/radio` 가 **미설치**라 라디오 대신 **선택형 옵션 카드 2장**(라디오 인디케이터 + 라벨 + 설명)을 Atlaskit 토큰으로 구성. `role="radio"` / `aria-checked` 부여. 신규 의존성 0 |
| 급여 관리 탭 LEVEL_BAND | 읽기 전용 밴드 뷰 + 상단 안내 1줄 + `unpricedMemberCount` 경고 + InfoTip 산식 분기 |

---

## 5. i18n

**추가 위치:** `locales/kr/*.json` · `locales/en/*.json` (양쪽). `locales/script/*.json` 은 빈 스텁이라 **사용하지 않았다.**
**`ko-KR.json` / `en-US.json` 직접 수정 없음** — merge 산출물로만 갱신했다.

| 파일 | 추가 키 |
|---|---|
| `setting.json` | `salaryPolicy.{title, description, option.*, levelBand.desc, individual.desc, link.level, warn.missingBand, confirm.*}` |
| `level.json` | `table.header.{salaryBand, representative}`, `modal.field.*`, `modal.placeholder.*`, `modal.validation.*`, `policy.{individualNotice, goSetting}` |
| `user.json` | `table.header.salaryBand`, `policy.levelBandNotice` |
| `salary.json` | `table.levelBand`, `meta.helpLevelBand`, `policy.levelBandNotice`, `warn.{noBand, unpriced, unpricedIndividual}` |
| `cost.json` | `warn.{unpriced, unpricedIndividual}`, `salaryPolicy.{levelBand, individual, basis}` |
| `portfolio.json` | `cost.staleSnapshot` (기존 `cost.masked` **무변경**) |
| `teamAnalytics.json` | `costMaskedStale` (기존 `costMasked` **무변경**) |

**merge 실행:** `cd static/ui && npm run merge` **실행함**(수동 1회) + `npm run build` 의 prebuild 로 재실행됨.
산출물에 신규 키 17종이 kr/en 양쪽에 존재함을 스크립트로 확인했다.

> ⚠ 설계서 §9-5 에는 `salary.warn.unpriced` 만 있었으나, `unpricedMemberCount` 의 **의미가 모드별로 다르다**는 §6-3 의 지시("프론트 문구만 분기")를 지키려면 INDIVIDUAL 용 문구가 필요해 **`unpricedIndividual` 을 추가**했다(`cost.json` 도 동일). 설계서 키는 그대로 두고 형제 키만 늘렸다.

---

## 6. 설계서·백엔드 리포트와 다르게 구현한 부분 (3건) — 전부 프론트 내부 판단

> **백엔드 §2 계약을 다르게 소비한 것은 0건이다.** 아래는 전부 프론트 구현 방식에 관한 결정이다.

### 6-1. `salaryRenderGuard.test.js` 의 금지 패턴을 **좁혔다** (B10)

| 설계서 §7-4 초안 | 실제 |
|---|---|
| `/\brow\.salary\b/`, `/\beditValues\.salary\b/`, `/formatNumber\([^)]*salary/i` 금지 | **직접 렌더**(`formatNumber(...salary...)`, `x.salary.toLocaleString`)와 **`?? 0` / `\|\| 0`** 만 금지 + "세 영역이 `components/salary` 를 실제로 import 한다"는 **양성 단언** 추가 |

**이유:** 초안의 두 패턴은 **정상 경로까지 위반으로 만든다.**
- `UserEditModal` 은 `editValues.salary` 를 **`<SalaryField>` 에 넘긴다** — 그게 바로 의도한 깔때기다.
- `SalaryManagementPage` 는 INDIVIDUAL 투입급여 InlineEdit 의 **비교/기본값**으로 `row.salary` 를 읽는다(렌더가 아니다). LEVEL_BAND 에서는 그 컬럼 자체가 없다.

`teamScopeLeak.test.js:211-215` 가 기록한 실패(초안의 넓은 범위가 정상 소비처를 전부 위반으로 만들어 테스트가 무력화된 사건)를 그대로 반복하게 되므로, **실제 사고 유형 두 가지**(직접 그리기 / 0 으로 채우기)로 좁혔다. 차용 관례(`collectJs`, **대상 0건 방어**)는 그대로 지켰다.

### 6-2. LEVEL_BAND 에서 `updateUser` 에 `salary` 를 **아예 보내지 않는다**

설계서 §10-2 는 "`null` 로 넘기면 NULL 로 날아가니 서버가 `undefined` 로 만들어야 한다"까지만 다뤘고, 백엔드는 그대로 구현했다(§2-2 `droppedFields:['salary']`).
그런데 **프론트가 salary 를 보내면** 서버가 드롭 → `droppedFields:['salary']` → 기존 `notifyDroppedFields(toast, t, res)` 가 **"필드가 저장되지 않았습니다" 에러 토스트**를 띄운다. 그 안전망은 팀장 allowlist 경로용이지 정책 경로용이 아니라, 사용자가 **입력한 적도 없는 필드로 실패 토스트가 뜨는 거짓 경보**가 된다.
→ 조건부 스프레드로 키 자체를 만들지 않는다. `droppedFields` 는 `[]` 가 되고 DB 의 기존 연봉도 그대로 보존된다(D3 되돌리기 불변).

### 6-3. `PortfolioTsrSignalTable` 에는 `costMaskedReason` 을 **전달하지 않았다**

설계서 §7-6(e) 는 `ComparisonTabs`·`PortfolioTsrSignalTable` 양쪽 전달을 적었으나, 신호등 테이블은 **문구를 렌더하지 않고 컬럼만 제거**한다(`signalTableColumnKeys(costMasked)`). 소비처 없는 prop 은 다음 사람에게 "여기서도 뭔가 갈리나?"라는 오해를 만든다.
→ 실제 문구가 있는 `ComparisonTabs` 에만 전달했다. 신호등 동작은 무변경이다.

---

## 7. 부수 변경 2건 (필요해서 한 것 — 숨기지 않고 명시)

### 7-1. `projectKeys` 에 prefix 팩토리 3개 추가
`costAll()` / `salaryAll()` / `summaryAll()`.
정책 전환 시 **전 프로젝트** 캐시를 버려야 하는데 `cost(undefined)` 는 `['projectCost', undefined]` 라 prefix 매칭이 되지 않는다. 설계서 §7-7 의 인라인 `['projectCost']` 는 **`queryKeyContract.test.js`(RFC-173 계약)가 금지**하는 패턴이라 팩토리로 만들었다. `salary`/`summary` 는 정책에 따라 응답 shape 이 바뀌므로 함께 무효화 대상에 넣었다.

### 7-2. `teamAnalyticsI18n.test.js` 의 `EXTRA_FILES` 에 1줄 추가
`TeamCompareBar` 가 `t('teamAnalytics.costMasked')` **리터럴** 대신 `t(teamCostMaskedKey(reason))` 를 부르게 되면서, 그 키가 i18n 커버리지 스캔에서 사라졌다(테스트가 **조용히 1건 줄었다**). 키 리터럴이 이제 `pages/portfolio/utils/costMaskedReason.js` 에만 있으므로 그 파일을 스캔 대상에 넣어 커버리지를 복구했다(기존 단언은 한 줄도 약화하지 않았다).

---

## 8. 실행 결과

### 8-1. `cd static/ui && CI=true npx react-scripts test --watchAll=false` (리더 지정 baseline 커맨드)
```
Test Suites: 1 failed, 59 passed, 60 total
Tests:       1036 passed, 1036 total
```
- **실패 테스트 0건.** 실패한 1 suite 는 `src/pages/projectDetail/issue/workListQuery.test.js` — **baseline 그대로**이고 원인도 동일(`@forge/bridge` 가 CRA jest 설정에서 mock 되지 않아 import 시점에 throw). 범위 밖이라 손대지 않았다.
- **baseline 대비 신규 실패: 0건.** baseline 을 `git stash -u` 로 직접 재측정해 확인했다(`1 failed / 1003 passed / 58 suites`).
- 테스트 증가분 1003 → 1036 의 내역: 신규 `salaryRenderGuard` 6 + 신규 `salaryPolicyContract` 28 − `teamAnalyticsI18n` 의 사라진 키 1 + 복구·추가된 키 2 + (CRA/jest 수집 범위 차) 

### 8-2. `cd static/ui && CI=true npm test` (프로젝트 표준 커맨드 = `jest` + `jest.config.js`)
```
Test Suites: 62 passed, 62 total
Tests:       1061 passed, 1061 total
```
- **전부 통과, 실패 0.** `jest.config.js` 의 `moduleNameMapper('^@forge/bridge$')` 가 적용되어 `workListQuery.test.js` 도 통과한다.
- ⚠ **발견 사항(검증자 참고):** 두 커맨드는 **서로 다른 러너**다. `npm test` 는 `jest.config.js`(bridge mock 매핑 있음), `npx react-scripts test` 는 CRA 내장 jest 설정(**매핑 없음**)을 쓴다. baseline 의 1 suite 실패는 코드 결함이 아니라 **러너 선택의 부작용**이다.
- 이 때문에 신규 `salaryPolicyContract.test.js` 는 **파일 안에서 `jest.mock('@forge/bridge', …)` 를 직접** 건다 — 두 러너 모두에서 살아 있게.

### 8-3. `cd static/ui && npm run build`
```
prebuild → npm run merge (ko-KR.json / en-US.json 재생성)
Compiled with warnings.
bundle:check → {"gzipBytes":271495,"budgetBytes":1625293,"withinBudget":true}
```
- **성공.** 경고는 전부 **기존** 항목(@atlaskit 소스맵 누락, mini-css-extract 순서 충돌). 이번 변경으로 인한 **신규 eslint 경고 0건**.

---

## 9. integration-verifier 인계 노트

1. **다중 shape 재사용 지점 = `SalaryCell` 이다.** 넘어가는 조합은 정확히 4가지이며, `SalaryCell` 은 `band.min`/`band.max` **만** 읽고 `representative` 는 **읽지 않는다**(급여 관리 탭에만 있고 사용자 목록에는 없으므로):

   | 호출부 | props | 서버 필드 |
   |---|---|---|
   | `UserListPaging.jsx` | `amount={row.salary}` `band={row.levelBand}` `policy={data?.salaryPolicy}` | `salary:number\|null` / `levelBand:{min,max}\|null` |
   | `SalaryManagementPage.jsx` (밴드열) | `mode="band"` `band={row.level_band}` | `level_band:{min,max,representative}\|null` |
   | `SalaryManagementPage.jsx` (연봉/투입/유효) | `mode="plain"` `amount={row.annual_salary \| row.salary \| row.effective_salary}` | 숫자 |
   | `useLevelList.js` | `mode="band" band={{min:row.salaryMin, max:row.salaryMax}}` / `mode="plain" amount={row.salaryRepresentative}` | 평평한 숫자 3개 |

2. **`?? 0` 전수 확인 지점:** `SalaryCell`(금액/밴드) · `SummaryPanel`(`total_salary`) · `SalaryManagementPage`(`unpricedMemberCount`) · `useLevelEditModal`(`toBandInput`). 전부 명시 검사(`typeof === 'number'` / `!== undefined` / `=== null`)를 쓴다. `salaryRenderGuard.test.js` 가 3개 디렉터리에서 회귀를 막는다.

3. **손대지 않은 것을 확인할 파일:** `pages/portfolio/utils/costGating.js` · `utils/team/teamMetrics.js` · `utils/team/teamAnalyticsFields.js` · 포트폴리오 위젯 `?? 0` 10여 지점 → `git diff --stat` 에 나타나지 않아야 한다(현재 나타나지 않는다).

4. **E2E 미수행.** 특히 다음은 배포 후 실물 확인이 필요하다:
   - 정책 전환 다이얼로그 → 저장 → 6개 캐시 invalidate 후 화면이 실제로 갈아엎히는지
   - LEVEL_BAND 전환 직후 포트폴리오/팀 분석에 `costMaskedReason:'SNAPSHOT_STALE_POLICY'` 문구 + 재집계 CTA 가 뜨고 **₩0 이 어디에도 그려지지 않는지**
   - 등급 밴드 저장(`manifest.yml` attribute 선언 필요 — `forge deploy` 선행. `forge tunnel` 은 스키마를 갱신하지 않는다)
   - `unpricedMemberCount` 가 `null` 인 레거시 캐시 구간에서 경고가 **뜨지 않는지**

---

# 개정 r2 — 검증 후속 (2026-08-03)

> 통합 검증(`03_verify_report.md`) 결과 리더가 재지시한 **F1(미구현 1건)** 을 반영했다.
> **위 §1~§9 의 기존 내용은 그대로 유효하다.** 아래는 그 뒤에 일어난 변경만 기록한다.

## r2-1. F1 — 비용 분석 탭 `unpricedMemberCount` 경고 구현 (P1)

**원인 재확인:** 설계서 §4-5 가 명시적으로 요구한 항목인데 **§11 Phase B 작업표에 항목이 없었다**(설계서 자체의 누락). 서버·i18n 은 이미 준비돼 있었고 소비처만 0줄이었다.

**변경 파일: `static/ui/src/pages/projectDetail/cost/CostPage.jsx` (1개)**

| 추가 | 내용 |
|---|---|
| 가격 미산정 경고 | 성공 본문 **최상단**(KPI 카드 위)에 `SectionMessage(appearance="warning")`. 급여 관리 탭과 **같은 패턴·같은 판정식** |
| 산정 기준 표기 | KPI 카드 `headerRight` 에 `CostPolicyBasis` — "인건비 산정 기준: 등급 기반 / 인원별" |

**소비한 shape (백엔드 §2-3 `getProjectCostSummary` 글자 그대로):**
```js
{ success:true, currency, project:{…}, rates, budget, evm,
  monthlyCost, plannedBudgetLine, byRole, byLevel, byTeam, byIssue,
  salaryPolicy: 'INDIVIDUAL'|'LEVEL_BAND',   // 항상 존재
  unpricedMemberCount: number | null }       // 항상 존재, ⚠ null 가능
```
- 루트 직접 접근(`content` 아님) — 이 화면의 기존 관례와 동일.
- 🔴 **`?? 0` 없음.** 판정은 `typeof unpriced === 'number' && unpriced > 0` — **`null`(레거시 캐시 = 집계 전)과 `0` 은 둘 다 미표시**다.
- 모드 판정은 `useSalaryPolicy(data?.salaryPolicy)` — **응답의 `salaryPolicy` 우선** 원칙 그대로(설정 캐시 stale 방어).
- 문구는 모드별로 갈린다: `cost.warn.unpriced`(LEVEL_BAND = 밴드 미설정) / `cost.warn.unpricedIndividual`(INDIVIDUAL = 연봉 미등록).

**i18n:** 신규 키 **0건** — r1 에서 이미 `locales/kr|en/cost.json` 에 5개(`warn.unpriced`, `warn.unpricedIndividual`, `salaryPolicy.{basis,levelBand,individual}`)를 넣어 뒀다. 따라서 **merge 재실행 불필요**(그래도 `npm run build` 의 prebuild 로 재실행됨). merge 산출물에 5개 전부 존재함을 재확인했다.

**죽은 키 0건:** 검증 리포트 §2 F1 이 "쓰지 않으면 키를 제거하라"고 한 `cost.salaryPolicy.*` 3종을 **실제로 소비**하도록 `CostPolicyBasis` 에 붙였다. 정책을 바꾸면 총 인건비·CPI·소진율이 전부 달라지므로, 기준을 화면에 적어 두지 않으면 "어제와 숫자가 다른데 이유를 모르겠다"가 된다. 정책 미확정(`policy === null`)이면 **아무 주장도 하지 않는다**(null 반환).

> `pages/projectDetail/cost` 는 `salaryRenderGuard.test.js` 의 `TARGET_DIRS` 에 **넣지 않았다.** 이 화면이 그리는 값은 개인 원시 급여가 아니라 **정책 파생 집계**이고(§5-3 #13), 설계서 §7-4 가 그런 영역을 의도적으로 검사 대상에서 제외했다(포트폴리오·팀 분석과 같은 근거 — 넓히면 정상 소비처가 오탐으로 잡혀 테스트가 무력화된다).

## r2-2. 권고(P2) 채택 — 정적 가드의 "JSX raw 보간" 갭 차단

검증 리포트 §1-8 ① 의 잔여 갭 2종 중 **1종을 막았고, 1종은 알려진 한계로 기록**한다.

| 갭 | 조치 |
|---|---|
| `<span>{row.salary}</span>` 처럼 `formatNumber` 없이 **JSX 로 직접 보간** | ✅ **차단.** 금지 패턴 4번째 규칙 추가 |
| `const v = row.salary; … formatNumber(v)` **변수 별칭** | ❌ **막지 않는다(알려진 갭).** 데이터 흐름 분석이 필요하다 |

추가한 규칙: `/(?<!=)\{\s*[A-Za-z_$][\w$]*\.\w*(?:salary\|Salary)\w*\s*\}/`

- **`(?<!=)` 가 핵심이다** — `amount={row.salary}` 같은 **prop 전달은 제외**한다. 그것이 바로 우리가 의도한 깔때기이고, 막으면 검증자가 인정한 "정상 경로 오탐" 문제(`teamScopeLeak.test.js:211-215` 선례)를 다시 만든다.
- 동작을 케이스 7종으로 직접 검증했다: `<span>{row.salary}</span>` · `<td>{ row.annual_salary }</td>` · `{data.totalSalary}` → **잡힘**, `amount={row.salary}` · `band={row.levelBand}` · `<SalaryCell amount={row.effective_salary} />` · `{row.name}` → **안 잡힘**.
- 대상 3개 디렉터리 **현재 히트 0건**(추가 시점 실측) — 오탐을 새로 만들지 않았다.
- 별칭 갭은 테스트 주석에도 "정적 검사로는 못 막는다"고 명시해, 다음 사람이 이 가드를 **완전한 방어로 오해하지 않게** 했다.

## r2-3. 재실행 결과

| 커맨드 | 결과 | baseline 대비 |
|---|---|---|
| `cd static/ui && CI=true npm test` (프로젝트 표준 = jest) | **62 suites / 1061 tests 전부 통과, 실패 0** | 변화 없음 |
| `cd static/ui && CI=true npx react-scripts test --watchAll=false` | **1 failed suite / 1036 tests 전부 통과** | **신규 실패 0건.** 실패 suite 는 여전히 `workListQuery.test.js`(baseline 동일, 원인 동일 — CRA jest 설정에 `@forge/bridge` mock 매핑 없음, 범위 밖) |
| `cd static/ui && npm run build` | **성공.** prebuild merge 포함, `gzip 271,496 B / 1,625,293 B` 예산 통과 | 신규 eslint 경고 **0건** |

테스트 수가 r1 과 동일한 이유: F1 은 **금지 패턴 1개 추가**(기존 `it.each` 3케이스 안에서 검사되므로 테스트 개수 불변)와 화면 코드 변경이라 신규 테스트 케이스가 늘지 않았다.

## r2-4. 미조치 항목 (의도적)

| 항목 | 사유 |
|---|---|
| **F2** (`getSummaryDataService` 의 `getSettingData` 중복 조회 · 내부 소비자 3곳) | **백엔드 건.** 리더 지시대로 `src/resolver/projectDashboard/` 와 `ProjectCostService.js` 근처는 **건드리지 않았다**(backend-engineer 동시 수정 중 — 충돌 회피) |
| **F3** (`package-lock.json` 잡음 24+/24−) | 내 작업 산출물이 아니다(설치를 실행한 적 없다). 리더/커밋 담당이 `git checkout ea5ef4a -- package-lock.json` 으로 처리할 사안 |
| `pages/projectDetail/cost` 를 정적 가드 대상에 추가 | 위 r2-1 각주 참조 — 파생 집계 영역이라 설계서 §7-4 의 의도적 제외 범위 |

## r2-5. `src/` 무변경 재확인

```
$ git status --porcelain static/ui/ locales/     ← 내 변경은 전부 이 두 경로 안
$ git diff --name-only -- src/                    ← r2 작업으로 인한 추가 변경 0건
```
r2 에서 수정한 파일은 **`CostPage.jsx` 1개 + `salaryRenderGuard.test.js` 1개**뿐이다.
