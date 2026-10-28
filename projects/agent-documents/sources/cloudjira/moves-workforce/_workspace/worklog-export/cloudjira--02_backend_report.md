# 02 — 백엔드 구현 리포트 (worklog-export)

작성: backend-engineer / 2026-08-26
담당 범위: 설계서 §0, §3(3-1~3-7), §9-A, §11-A
기준 소스: `develop` @ `dbe669f`

> **resolver 0개.** 이 기능의 백엔드 작업은 권한 카탈로그 키 1개 + SEED_VERSION bump + 번역 4줄이 전부다.
> `static/ui/` 아래는 **한 파일도 건드리지 않았다.** `npm run merge` 도 실행하지 않았다(프론트 담당).

---

## 1. 변경 파일 목록 (경로:라인)

| # | 파일 | 라인 | 변경 |
|---|------|------|------|
| 1 | `src/permission/ResourceCatalog.js` | **56~57** (신규 2줄) | `CATALOG` 에 `WORKLOG_EXPORT` 엔트리 추가 — `RESOURCE_MANAGEMENT`(L54~55) 바로 다음, WORKFORCE 섹션 마지막 |
| 2 | `src/trigger/onInstall.js` | **8**(주석 신규), **9**(값 변경) | `SEED_VERSION = 9` → `10` + 주석 1줄 |
| 3 | `locales/kr/common.json` | **99** (신규 1줄) | `pages.worklogExport` |
| 4 | `locales/en/common.json` | **99** (신규 1줄) | `pages.worklogExport` |
| 5 | `locales/kr/permission.json` | **87** (신규 1줄) | `desc.WORKLOG_EXPORT` |
| 6 | `locales/en/permission.json` | **87** (신규 1줄) | `desc.WORKLOG_EXPORT` |
| 7 | `src/permission/__test__/WorklogExportCatalog.test.js` | 신규 파일 (68줄) | §3-7 계약 테스트 |

**변경하지 않은 파일 (설계 지시대로):**
- `src/seed/SeedData.js` — 무변경. 프리셋 `grant()` 에 `WORKLOG_EXPORT` 개별 분기를 **넣지 않았다** (§3-6 "Team Lead와 Team Member 차이는 RESOURCE_MANAGEMENT 하나" 테스트 보존)
- `src/permission/PermissionMap.js` — 무변경 (resolver 없음, §3-5)
- `src/index.js` — 무변경 (컨트롤러 없음)
- `manifest.yml` — 무변경 (KVS 엔티티·resolver·scope 추가 없음)
- `locales/ko-KR.json`, `locales/en-US.json` — **직접 수정 금지 규칙 준수**. merge 미실행

> ⚠ 번역 소스 경로 주의: locales 는 `static/ui/locales/` 가 **아니라 리포지토리 루트 `locales/`** 다(실제 확인). 설계서 §9-A 의 상대 표기(`locales/kr/common.json`)가 곧 루트 기준 경로다.

---

## 2. 카탈로그 엔트리 — 실제 코드 (`src/permission/ResourceCatalog.js:56-57`)

```js
    { key: 'RESOURCE_MANAGEMENT', section: 'WORKFORCE', labelKey: 'common.pages.resource', descriptionKey: 'permission.desc.RESOURCE_MANAGEMENT',
        covers: ['자원관리 현황/적합도(/resource)'], admin: t, member: ff, defaultForNew: ff },
    { key: 'WORKLOG_EXPORT', section: 'WORKFORCE', labelKey: 'common.pages.worklogExport', descriptionKey: 'permission.desc.WORKLOG_EXPORT',
        covers: ['워크로그 추출(/worklog-export) — Jira 전체 워크로그 CSV 다운로드'], admin: t, member: ff, defaultForNew: ff },
```

설계서 §3-1 코드와 **글자 그대로 일치**한다. `migrateFrom` 은 지정하지 않았다(자동 권한 확대 금지).

전개된 값:
- `admin: t` = `{ read: true, write: true }`
- `member: ff` = `{ read: false, write: false }`
- `defaultForNew: ff` = `{ read: false, write: false }`

**카탈로그 키 개수: 17 → 18.** (`RESOURCE_KEYS.length === 18`)

### `src/trigger/onInstall.js:5-9` 실제 코드

```js
// 8 — 팀 도입 P0: 카탈로그에 TEAM_MANAGEMENT 추가(시드 Admin/Member 재생성 + 커스텀 세트 키 보충)
// 9 — 대표 역할 권한 세트 4종(PM/PMO/Team Lead/Team Member) 제공. **최초 1회만 생성**되며
//     이미 제공한 뒤에는 관리자가 지웠어도 되살아나지 않는다(addPresetPermissionSeed 원장 참조).
// 10 — 워크로그 추출: 카탈로그에 WORKLOG_EXPORT 추가(시드 Admin/Member 재생성 + 커스텀 세트 키 보충)
export const SEED_VERSION = 10;
```

---

## 3. 경계면 — 기존 resolver 응답에 새 키가 나타나는 방식 (§2-B 실측 확인)

**두 resolver 모두 코드 무변경**이다. 카탈로그 파생이라 응답이 자동으로 1항목 늘어난다.

### 3-A. `userPermissionCheck` (PUBLIC)

`PermissionService.userPermissionCheckService` → `resolvePrincipal()` → `mergeSetPages()`(카탈로그 전 키 순회) 경로.
프론트가 받는 실제 shape (`result.content`):

```js
{
  isUser: true,
  name: '홍길동',
  projectScope: 'ALL',
  pages: [
    { pageId: 'DASHBOARD',           value: { read: true,  write: true  } },
    { pageId: 'REPORT',              value: { read: true,  write: true  } },
    { pageId: 'KANBAN',              value: { read: true,  write: true  } },
    { pageId: 'PROJECT',             value: { read: true,  write: true  } },
    { pageId: 'PROJECT_GANTT',       value: { read: true,  write: true  } },
    { pageId: 'PROJECT_COST',        value: { read: true,  write: true  } },
    { pageId: 'RESOURCE_MANAGEMENT', value: { read: true,  write: true  } },
    { pageId: 'WORKLOG_EXPORT',      value: { read: true,  write: true  } },   // ★ 신규 (Admin 기준값)
    // … SETTINGS 섹션 10키 …
  ],                                  // 총 18항목 (기존 17 + 1)
  team: { teamKey, teamName, isTeamLead, leadingTeamKeys, permissionSource, teamAnalyticsScope }
}
```

- **항목 위치**: `RESOURCE_MANAGEMENT` **바로 다음, 8번째**. 순서는 `CATALOG` 정의 순서 그대로다.
- **값 결정 규칙**: 저장된 세트에 `WORKLOG_EXPORT` 가 있으면 그 값, 없으면 `defaultForNew` = `{read:false, write:false}` (fail-close). `accountId` 부재 시엔 전 키 `{read:false,write:false}`.
- **프론트 소비**: `usePermissionStore.permissions['WORKLOG_EXPORT'].read` → `Sidebar` 게이팅. **프론트 코드 수정 없이 키가 도착한다.**

### 3-B. `getPermissionCatalog` (PUBLIC)

`getCatalogSections()` 파생. `sections[0]`(= `WORKFORCE`) 의 `resources` 배열 **마지막 항목**으로 다음이 추가된다:

```js
{
  key: 'WORKLOG_EXPORT',
  labelKey: 'common.pages.worklogExport',
  descriptionKey: 'permission.desc.WORKLOG_EXPORT'
}
```

- `WORKFORCE.resources` 길이 7 → **8**.
- `usePermissionCatalog.js` 의 `HIDDEN_CATALOG_KEYS`(현재 `PROJECT_GANTT` 만)에 해당하지 않으므로 **백오피스 권한 화면에 read/write 토글이 코드 수정 없이 노출**된다.
- 번역 키 2개를 이번에 추가했으므로(§4) 라벨·설명이 빈 문자열로 뜨지 않는다. 단 **`npm run merge` 실행 전에는 `ko-KR.json`/`en-US.json` 에 반영되지 않는다** — merge 는 프론트 담당(§11-B 마지막 단계).

---

## 4. i18n — 추가한 실제 값

```jsonc
// locales/kr/common.json  →  pages
"worklogExport": "워크로그 추출"

// locales/en/common.json  →  pages
"worklogExport": "Worklog Export"

// locales/kr/permission.json  →  desc
"WORKLOG_EXPORT": "워크로그 추출(Jira 전체). 기간·프로젝트·작성자로 워크로그를 검색해 CSV로 내려받습니다. 조회 범위는 Jira 자체 권한을 따릅니다."

// locales/en/permission.json  →  desc
"WORKLOG_EXPORT": "Worklog export (all of Jira). Search worklogs by period, project, and author and download them as CSV. Visible data follows the user's own Jira permissions."
```

설계서 §9-A 문구 그대로다. 4개 JSON 모두 파싱 검증 완료(신규 테스트가 실제로 읽는다).

> 🔴 **frontend-engineer 에게**: 마지막에 `cd static/ui && npm run merge` 를 돌릴 때 위 4키가 함께 병합된다. merge 를 빠뜨리면 백오피스 권한 화면에서 `common.pages.worklogExport` 라벨이 키 문자열 그대로 노출된다.

---

## 5. 신규 테스트 — `src/permission/__test__/WorklogExportCatalog.test.js`

5개 케이스 (§3-7 항목 전부 + i18n 키 존재):

| # | 검증 |
|---|------|
| 1 | `CATALOG` 에 `WORKLOG_EXPORT` 존재 + `section === 'WORKFORCE'` + `RESOURCE_KEYS` 포함 |
| 2 | `getSeedPages('admin')` → `{read:true,write:true}` / `getSeedPages('member')` → `{read:false,write:false}` |
| 3 | `getDefaultForNew()` → `{read:false,write:false}` + **`getMigrateSource('WORKLOG_EXPORT') === null`** (자동 권한 확대 금지 회귀 방지) |
| 4 | `getCatalogSections()` WORKFORCE `resources` 에 `{key,labelKey,descriptionKey}` 3필드가 실린다 |
| 5 | `labelKey`/`descriptionKey` 가 `locales/kr`·`locales/en` 소스 JSON에 실제 존재 (§9-A 누락 방지) |

---

## 6. 테스트 결과 (루트 `npm test` / jest)

```
Test Suites: 86 passed, 86 total
Tests:       1372 passed, 1372 total
Snapshots:   0 total
Time:        36.609 s
```

**실패 0건.** 로그에 보이는 `console.error [LICENSE] …503` 출력은 `LicenseGuard.test.js` 가 의도적으로 상류 장애를 mock 하는 정상 케이스이며 실패가 아니다.

설계서 §3-6 이 지목한 위험 테스트 개별 재실행:

```
PASS test/permission/userPermissionCheck.test.js
PASS src/seed/__test__/PresetPermissionSeed.test.js
Tests: 36 passed, 36 total
```

- `PresetPermissionSeed.test.js` **"Team Lead 와 Team Member 의 차이는 RESOURCE_MANAGEMENT 하나다"** → 통과. 프리셋 `grant()` 에 개별 분기를 넣지 않아 두 프리셋 모두 `WORKLOG_EXPORT` = RO 로 동일, `diff === ['RESOURCE_MANAGEMENT']` 유지.
- `userPermissionCheck.test.js` `toHaveLength(RESOURCE_KEYS.length)` → 파생값이라 17→18 자동 추종, 통과.
- `test/permission/permissionMap.contract.test.js` → 통과. `PERMISSION_MAP` 은 무변경이고, 계약 테스트는 "카탈로그 키가 전부 grant 에 쓰였는가"를 검사하지 않으므로 `WORKLOG_EXPORT` 가 어떤 grant 에도 없어도 무해(§3-5 분석대로).

---

## 7. 계약 이탈 — **없음**

설계서 §3-1 코드, §3-2 값, §9-A 문구를 글자 그대로 구현했다. frontend-engineer 가 맞춰야 할 접점은 **문자열 `'WORKLOG_EXPORT'` 하나**이며, `usePermissionStore` 에서 다음과 같이 도착한다:

```js
usePermissionStore.getState().permissions['WORKLOG_EXPORT']  // { read: boolean, write: boolean }
canRead('WORKLOG_EXPORT')                                     // Sidebar / 페이지 진입 방어
```

---

## 8. 🔴 릴리스 노트 기재 문구 (§3-4 마이그레이션 비대칭)

아래 문장을 **릴리스 노트에 반드시 포함**한다. 코드로 고치지 않기로 확정된 의도적 동작이다.

> **[워크로그 추출] 기존 설치에서는 관리자(Admin)만 메뉴가 보입니다.**
> 이번 버전에서 새 권한 `워크로그 추출(WORKLOG_EXPORT)` 이 추가되었습니다.
> 새 권한은 기존 권한에서 자동으로 승계되지 않으며(대량 데이터 반출 성격이라 기본값을 닫아 두었습니다), 업그레이드 시 **Admin 권한 세트에만 읽기/쓰기가 부여**됩니다.
> 기존에 사용 중이던 **PM / PMO / Team Lead / Team Member 권한 세트를 포함한 모든 기존 세트는 읽기 = 꺼짐** 상태로 유지됩니다. 이는 조직이 직접 조정한 권한 값이 업그레이드마다 초기화되지 않도록 하는 기존 설계에 따른 것입니다.
> 다른 구성원에게 열어 주려면 관리자가 **백오피스 → 권한 관리**에서 해당 권한 세트의 `워크로그 추출` 읽기를 켜 주세요.
> (신규 설치에서는 PM / PMO / Team Lead / Team Member 프리셋이 처음부터 읽기 권한을 갖습니다.)

**요약 (내부용):**
| 설치 유형 | Admin | Member | PM/PMO/TeamLead/TeamMember | 커스텀 세트 |
|-----------|-------|--------|---------------------------|------------|
| 신규 설치 | rw | 닫힘 | **read=true** (PM 은 rw) | 해당 없음 |
| 기존 설치(업그레이드) | rw | 닫힘 | **read=false** ⚠ | read=false |

---

## 9. 배포 시 유의

- `SEED_VERSION` 을 10으로 올렸으므로 **`forge deploy` + 앱 업그레이드(install trigger 실행) 후에야** 기존 사이트의 권한 세트에 새 키가 보충된다. 배포 전에는 `mergeSetPages()` 가 런타임에서 `defaultForNew`(닫힘)를 덧입혀 응답 완전성은 유지되므로, 마이그레이션 지연으로 화면이 깨지지는 않는다.
- `manifest.yml` 무변경 → KVS attributes 422 위험 없음.
