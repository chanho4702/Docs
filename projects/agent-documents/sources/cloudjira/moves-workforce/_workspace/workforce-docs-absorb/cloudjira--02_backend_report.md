# 02 Backend Report — Moves Workforce Docs 흡수 (백엔드·manifest)

> 작성 2026-09-30 · 범위: 설계서 §2, §3.1·§3.2, §5, §13 Backend(B-1~B-5, B-7). B-6(선택, `ResourceCatalog`)은 하지 않음.
> git commit 하지 않음.

## 1. 변경 파일

| 파일 | 구분 | 내용 |
|---|---|---|
| `manifest.yml` | 수정 | `app.compatibility`, `settings` attributes 2개, `jira:entityProperty` 항목 1개, 스코프 `search:confluence` (§2 전문 그대로, 주석 포함) |
| `src/resolver/backoffice/setting/SettingDefaults.js` | 수정 | `docCategories`(기본 5개, freeze), `docStaleDays: 90` |
| `src/resolver/backoffice/setting/DocSettingValidator.js` | **신규** | 순수 함수 `validateDocCategories`, `validateDocStaleDays` + 상수 4개 |
| `src/resolver/backoffice/setting/SettingService.js` | 수정 | `updateSettingService` 입력 2개·검증(`findById` 전)·병합 |
| `src/utils/errors/ErrorCodes.js` | 수정 | `SETTING_DOC_*` 5개(기존 `SETTING_*` 블록 아래) |
| `src/resolver/backoffice/setting/__test__/DocSettingValidator.test.js` | **신규** | 검증기 단위 테스트 |
| `src/resolver/backoffice/setting/__test__/SettingService.test.js` | 수정(추가) | 문서 필드 describe 블록 추가 |
| `test/settings/docSettingsManifest.contract.test.js` | **신규** | manifest 선언 계약(두 속성 타입 + `DEFAULT_SETTINGS` 전 키 선언 여부) |

**변경 없음(확인):** `SettingController.js`, `PermissionMap.js`(`getSettingData: 'PUBLIC'`, `updateSetting: W('SETTINGS')` L191-192 그대로), `src/index.js`, `test/permission/permissionMap.contract.test.js`. 새 resolver 없음.

## 2. resolver 응답 shape (실제 코드 기준)

컨트롤러: `guardedDefine(resolver, 'getSettingData', () => getSettingDataService())`, `guardedDefine(resolver, 'updateSetting', ({ payload }) => updateSettingService(payload))` — 가드가 `{ success: true, ...result }` 로 감싼다.

### `getSettingData` (PUBLIC, 입력 없음)

서비스 코드: `return {...DEFAULT_SETTINGS, ...(saved ?? {})};` → 응답:

```
{ success: true, currency, hourRate, utilizationUnderBand, utilizationOverBand, utilizationRedBand,
  scopeTodoAmberRatio, scopeTodoRedRatio, progressThreshold, salaryPolicy,
  docCategories: [{ name: string, required: boolean }], docStaleDays: number,
  ...(저장된 그 밖의 속성 — 예: monthRate, monthMode, monthVals) }
```

- **기본값 병합 확인(코드):** `getSettingDataService` 는 `DEFAULT_SETTINGS` 를 먼저 펼치고 저장값을 덮는다. `DEFAULT_SETTINGS` 에 `docCategories`·`docStaleDays` 를 넣었으므로 레코드가 없거나(`saved` null) 옛 레코드에 두 속성이 없어도 **두 필드가 항상 실린다**. 저장값이 있으면 저장값이 이긴다. 테스트로 확인(아래 §5).
- 기본값: `docCategories = [{name:'기획',required:false},{name:'설계',required:false},{name:'회의록',required:false},{name:'산출물',required:false},{name:'기타',required:false}]`, `docStaleDays = 90`.

### `updateSetting` (W('SETTINGS'), 부분 갱신)

입력: 기존 필드 + `docCategories?: [{ name, required }]`, `docStaleDays?: number`. `undefined`/`null` 이면 그 필드는 건드리지 않음(저장값 보존).

```
{ success: true, content: { settings: { ...getSettingData 의 필드 전부(success 제외) } } }
```

- `content.settings.docCategories` 는 **검증기가 돌려준 정규화 값**(이름 trim, `required === true` 만 true, 모르는 속성 버림). 입력 대소문자는 유지.
- `docStaleDays` 는 입력 그대로(정수 검증 통과 값).
- 빈 배열 `docCategories: []` 는 허용·저장된다.

### 실패

기존 가드 직렬화 그대로: `{ success: false, error: { name: 'LogicalError', code, message, cause } }`.

| code | 조건 | message (영어) |
|---|---|---|
| `SETTING_DOC_CATEGORY_LIST_INVALID` | `docCategories` 가 배열 아님 | `docCategories must be an array` |
| `SETTING_DOC_CATEGORY_TOO_MANY` | 31개 이상 | `docCategories must have at most 30 items` |
| `SETTING_DOC_CATEGORY_NAME_INVALID` | 항목이 객체 아님/`name` 비문자열/trim 뒤 0자 또는 31자 이상 | `docCategories[].name must be a string of 1 to 30 characters` |
| `SETTING_DOC_CATEGORY_DUPLICATED` | trim·소문자 기준 중복 | `docCategories[].name must be unique (case-insensitive)` |
| `SETTING_DOC_STALE_DAYS_INVALID` | `Number.isInteger` 아님(문자열 `'90'` 포함) 또는 1~3650 밖 | `docStaleDays must be an integer between 1 and 3650` |

검증 순서: 기존 currency → hourRate → salaryPolicy → progressThreshold 다음에 docCategories → docStaleDays, 전부 `findById` **전**. 둘 다 잘못이면 `docCategories` 오류가 먼저 난다.

## 3. manifest 변경 전문

```yaml
# modules.jira:entityProperty — moves-rms-entity-property 다음
    # 문서 연결 정보 — 이슈 프로퍼티 `movesDocs`(계약: pages/projectDetail/documents/DOCUMENTS.md §2).
    # 별칭은 옛 애드온과 같은 이름을 그대로 쓴다(애드온은 등록·배포된 적이 없어 충돌할 설치가 없다).
    - key: moves-docs-entity-property
      entityType: "issue"
      propertyKey: movesDocs
      values:
        - path: pageIds
          type: string
          searchAlias: movesDocsPageId
        - path: categories
          type: string
          searchAlias: movesDocsCategory
        - path: count
          type: number
          searchAlias: movesDocsCount

# app — licensing 다음, storage 앞
  # 다중 제품 호환 — Jira 필수, Confluence 선택(문서 탭의 문서 연결·검색·상태 확인에만 쓴다).
  # ⚠ Preview 기능이고 **한 번 켜면 되돌릴 수 없다**. 제품 소유자 결정(2026-09-30, requirement.md).
  #   Confluence 가 없는 사이트에서도 앱은 그대로 동작하고, 문서 탭만 읽기 폴백으로 내려간다.
  compatibility:
    jira:
      required: true
    confluence:
      required: false

# app.storage.entities[settings].attributes — salaryPolicy 다음
          # 문서 탭(Moves Workforce Docs 흡수) — 분류 목록 [{ name: string(1~30), required: boolean }], 최대 30개.
          # 미설정 설치는 DEFAULT_SETTINGS 병합으로 기본 5개(KVS 백필 불필요).
          # ⚠ updateSettingService 는 DEFAULT_SETTINGS 전체를 펼쳐 저장하므로, 이 선언이 빠진 채 배포되면
          #   **급여 정책 등 모든 설정 저장이 422** 로 깨진다. 코드와 같은 배포에 반드시 포함.
          docCategories:
            type: any
          # 오래된 문서 기준일(1~3650 정수, 기본 90)
          docStaleDays:
            type: integer

# permissions.scopes — manage:jira-configuration 다음(기존 "보드 구독" 주석 앞)
    # 문서 탭 — Confluence 호출은 `/wiki/rest/api/search` 하나뿐(문서 검색·id 조회·스페이스 목록·가용성 확인).
    #   다른 Confluence 주소를 쓰려면 이 목록부터 늘려야 한다(= 또 한 번의 메이저 버전).
    #   classic 스코프라 기존 classic 세트와 섞여도 배포 거부 위험(granular 혼용)이 없다.
    - search:confluence
```

`settings` `indexes` 변경 없음.

## 4. 설계와 다른 점 / 보충

- 설계와 다른 구현 없음. 응답 shape 은 §3.1 표 그대로.
- 보충 1: `SettingDefaults.js` 에 F7 경고 주석 1줄 추가(manifest 선언이 같은 배포여야 함).
- 보충 2: manifest 계약 테스트를 **`DEFAULT_SETTINGS` 의 모든 키가 `settings` attributes 에 선언돼 있는지**로 일반화했다(F7 재발 방지 — 앞으로 기본값에 키를 추가하고 manifest 를 빠뜨리면 이 테스트가 깨진다). 기존 설정 키 9개도 전부 통과함을 확인.
- 참고(코드 확인): `SeedData.addSettingSeed` 는 `{...DEFAULT_SETTINGS, ...exists}` 로 저장하므로, 다음 시드 실행 때 기존 설치에도 문서 기본값이 KVS 에 기록된다(백필 코드 추가 없이). 이 경로도 manifest 선언이 같은 배포여야 422 가 안 난다.
- B-6(`ResourceCatalog` `PROJECT.covers`)은 선택 항목이고 응답에 영향이 없어 하지 않았다.

## 5. 테스트 결과

- 집중 실행 `npx jest src/resolver/backoffice/setting test/settings`: **7 스위트 통과, 99 테스트 통과**.
- 루트 `npm test` 전체: **Test Suites: 132 passed, 132 total / Tests: 1840 passed, 1840 total**. 실패 없음. 권한 계약 테스트(`permissionMap.contract.test.js`) 무변화로 통과.

추가한 테스트:
- `DocSettingValidator.test.js`: 기본값 통과·정규화(trim, `required` 는 `true` 만 — `'true'`·`1` 은 false, 모르는 속성 버림, 대소문자 유지), 빈 배열 허용, 이름 0자/공백/31자 거부·30자 허용, 항목 형식 위반 4종, 대소문자·공백 무시 중복, 30개 허용/31개 거부, 비배열 5종, 기준일 위반 9종(`0,-1,3651,1.5,'90',null,undefined,NaN,Infinity`)·허용 `1,90,3650`.
- `SettingService.test.js` 추가 블록: 옛 레코드 read 시 기본값 보충, 저장값 우선, 두 필드 부분 갱신 + 정규화 저장 + 다른 필드 보존(`save` 인자·반환 `content.settings` 정확 비교), `[]` 저장, 다른 필드만 보낼 때 문서 설정 보존, `null` = 미전달, 레코드 없는 설치에서 문서 기본값 함께 기록, 잘못된 값 7종이 `findById`·`save` 미호출로 거부.
- `test/settings/docSettingsManifest.contract.test.js`: 두 속성 타입 선언, `DEFAULT_SETTINGS` 전 키 선언.

## 6. 확인하지 못한 것

- `forge lint` / `forge deploy` 미실행 — `compatibility` 블록(Preview)·`search:confluence` 스코프·새 `jira:entityProperty` 가 Forge 검증을 통과하는지는 배포 시 확인 필요(설계서 W1, P2, P5).
- KVS `type: any` 에 객체 배열·**빈 배열** 저장 가능 여부(설계서 W2) — mock 테스트로는 검증 불가, 실배포 실측 필요.
- 실제 저장 시 422 가 안 나는지는 manifest 배포 후에만 확인된다(테스트는 선언 존재만 본다).
