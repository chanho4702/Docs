# Holiday·Role·Level·Skill 카탈로그 입력 검증 설계서

## 1. 개요 / 영향 범위

직접 `invoke()` 호출은 Backoffice 화면의 `required`, `min/max` 속성을 거치지 않는다. 현재 create는 단순 truthy 검사만 하고, update는 이름/날짜 변경 여부를 클라이언트 플래그(`isNameChanged`, `isDateChanged`)에 의존한다. 따라서 공백 문자열, 잘못된 날짜, `NaN`/범위 밖 `workRatio`, 과도한 텍스트, 변경 플래그 조작으로 인한 중복이 저장될 수 있다.

- 백엔드: `PublicHolidayService`, `RoleService`, `LevelService`, `SkillService`, 공용 validator 및 `ErrorCodes`.
- Resolver: 함수명·권한·`guardedDefine` 등록은 변경하지 않는다. `add…Bulk`도 같은 direct-invoke 경로이므로 공용 validator를 통과시킨다.
- 프론트: 새 페이지, route, query key, DB/KVS schema, migration은 없다. 기존 mutation의 일반 오류 처리로 서버 오류가 노출된다. 특정 오류별 i18n 안내는 선택 보완이며 본 작업의 필수 조건은 아니다.
- 데이터: 저장 레코드 구조와 기존 success DTO를 그대로 유지한다. 기존 KVS 행을 일괄 정규화·삭제하지 않는다.

## 2. 경계면 계약 (가장 중요)

권한 매핑은 현행을 유지한다. 실패는 `guardedDefine`의 기존 오류 wrapper를 통해 `{ success: false, error: { code, message } }`가 되며, 성공 shape는 아래와 같이 **변경하지 않는다**.

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 호출 |
|---|---|---|---|
| `addPublicHoliday` | `{name, holidayDate, workRatio}` | `{ success: true, data: { id, name, holidayDate, workRatio } }` | `usePublicHolidayRegistrationModal` |
| `updatePublicHoliday` | `{id, name, holidayDate, workRatio, isDateChanged?}` | `{ success: true, data: { id, name, holidayDate, workRatio } }` | `usePublicHolidayEditModal` |
| `addRole` / `updateRole` | `{name, description}` / `{id, name, description, isNameChanged?}` | 현행 각각 `{ data: { id, roleData } }`, `{ success: true, data: { id, data } }` | Role 등록/수정 modal |
| `addLevel` / `updateLevel` | Role과 동일 + `salaryMin`, `salaryMax`, `salaryRepresentative` | 현행 DTO 유지. salary band 검증은 `LEVEL_SALARY_BAND_INVALID` 유지 | Level 등록/수정 modal |
| `addSkill` / `updateSkill` | `{name, category?, description?}` / `{id, name, category?, description?, isNameChanged?}` | 현행 각각 `{ data: { id, skillData } }`, `{ success: true, data: { id, data } }` | Skill 등록/수정 modal |
| `addRoleBulk` / `addLevelBulk` / `addSkillBulk` | `{items: Array<…>}` | `{ success: true, data: { added, skipped } }` | 각 Quick Add modal |

`isNameChanged`/`isDateChanged`는 하위 호환을 위해 입력에서 허용하되, 서버는 이를 판정 근거로 사용하지 않는다. 저장 전의 정규화 결과와 현재 행의 값 또는 `id` self-exclusion을 기준으로 중복을 검사한다.

## 3. 백엔드 설계

### 3.1 공용 validator

`src/resolver/backoffice/CatalogInputValidator.js`를 추가한다. 서비스별로 흩어져 있는 truthy 검사를 대체하는 순수 함수만 둔다. KVS 접근·권한 확인·캐시 무효화는 이 모듈에 넣지 않는다.

공통 텍스트 정책:

| 필드 | 규칙 | 저장값 |
|---|---|---|
| `name` (4개 카탈로그) | string만 허용, 앞뒤 공백 제거 후 비어 있으면 required 오류, 최대 120자 | trim한 문자열 |
| `description` (Role/Level/Skill) | 누락은 기존처럼 빈 값으로 허용, string만 허용, 최대 1,000자 | trim하지 않고 원문 유지. 빈 값은 KVS 저장 시 기존 빌더 규칙을 따른다. |
| `category` (Skill) | 누락은 허용, string만 허용, 최대 120자 | trim한 문자열. 빈 값은 속성 생략 (`buildSkillEntity`) |

- 자바스크립트 `string.length` 기준을 사용한다. 정규식으로 한글/영문을 제한하지 않아 기존 다국어 명칭을 막지 않는다.
- 이름의 내부 공백, 대소문자 차이는 보존한다. 중복 기준을 새로 case-insensitive로 바꾸면 이미 존재하는 `Dev`/`dev` 데이터의 의미가 달라지므로 이번 범위에서 하지 않는다.
- 이름은 정규화(trim) 후 기존 `findByWherePaged('name', normalizedName, …)`로 검사하고 `key !== id`만 중복으로 본다. 따라서 update가 자기 자신을 중복으로 오인하지 않는다.
- `id`는 non-empty string인지 먼저 검사한다. 미존재 update를 새 KVS 항목으로 만드는 현재 `set()` upsert 위험을 막기 위해, 각 update는 `findById(id)` 후 없으면 기존 `*_NOT_FOUND`를 반환한다. 삭제의 기존 계약은 변경하지 않는다.

Holiday 전용 정책:

| 필드 | 규칙 | 오류 |
|---|---|---|
| `holidayDate` | `YYYY-MM-DD` ASCII 형식이며 실제 달력 날짜여야 함. `Date` 자동 보정(예: 2월 31일)은 허용하지 않음 | `HOLIDAY_DATE_INVALID` |
| `workRatio` | number type, `Number.isFinite(value)`, `0 <= value <= 1`. 문자열 숫자·`NaN`·Infinity는 거부 | `HOLIDAY_WORK_RATIO_INVALID` |

`workRatio`는 UI의 `step=0.1`을 서버 정책으로 강제하지 않는다. 기존 float 데이터와 일 단위 환산의 소수 표현을 보존하기 위해 범위만 강제한다.

### 3.2 서비스별 적용 순서

1. `addPublicHolidayService`, `addRoleService`, `addLevelService`, `addSkillService`는 payload 정규화/검증 후 중복 검사, KVS save, dictionary invalidate 순서를 유지한다.
2. 네 update 서비스는 `id`와 모든 저장 필드를 검증하고 대상 행 존재를 확인한 뒤, 변경 플래그와 무관하게 정규화한 unique field로 중복 검사를 실행한다.
3. Level은 공용 text validator 다음에 기존 `buildBandAttributes()`를 그대로 호출한다. salary band의 숫자/상하한 정책을 별도·중복 구현하지 않는다.
4. Role/Level/Skill bulk는 각 item을 같은 validator로 정규화한 뒤 `addCatalogItemsBulk`에 전달한다. 하나라도 형식 오류면 전체 요청을 오류로 끝내고 부분 저장하지 않는다. 유효하지만 이미 존재하는 이름은 현행대로 `skipped`에 집계한다.
5. `addCatalogItemsBulk` 내부에서도 정규화된 `name`을 기준으로 request 내부 중복을 판정한다. 이 함수는 Role/Level/Skill에만 쓰이므로 Holiday에는 적용하지 않는다.

### 3.3 오류 계약

`src/utils/errors/ErrorCodes.js`에 아래 코드를 추가한다. 기존 `*_NAME_REQUIRED`, `*_NAME_DUPLICATED`, `HOLIDAY_DATE_DUPLICATED`, `*_NOT_FOUND`, `LEVEL_SALARY_BAND_INVALID`는 그대로 재사용한다.

| 상황 | 새 ErrorCode |
|---|---|
| Role/Level/Skill/Holiday 이름이 string이 아니거나 120자 초과 | `CATALOG_NAME_INVALID` |
| Role/Level/Skill description이 string이 아니거나 1,000자 초과 | `CATALOG_DESCRIPTION_INVALID` |
| Skill category가 string이 아니거나 120자 초과 | `SKILL_CATEGORY_INVALID` |
| Holiday 날짜 형식·실제 날짜 위반 | `HOLIDAY_DATE_INVALID` |
| Holiday workRatio 타입·유한값·범위 위반 | `HOLIDAY_WORK_RATIO_INVALID` |
| update의 id 누락/비문자열 | 각 도메인의 기존 `*_NOT_FOUND`로 fail-close |

프론트는 현재 duplicate와 level salary-band의 전용 toast를 유지한다. 새 코드는 공통 fallback(`res.error.message`)으로 표시되므로 i18n 키를 추가하지 않아도 응답 계약은 성립한다. 필요하면 후속 UX 작업에서 코드별 번역 toast를 추가한다.

### 3.4 대상 파일

- 추가: `src/resolver/backoffice/CatalogInputValidator.js`
- 수정: `src/resolver/backoffice/publicHoliday/PublicHolidayService.js`
- 수정: `src/resolver/backoffice/role/RoleService.js`
- 수정: `src/resolver/backoffice/level/LevelService.js`
- 수정: `src/resolver/backoffice/skill/SkillService.js`
- 수정: `src/resolver/backoffice/CatalogBulkService.js`
- 수정: `src/utils/errors/ErrorCodes.js`
- 수정/추가 테스트: `src/resolver/backoffice/__test__/CatalogInputValidation.test.js`, 기존 `CatalogBulk.test.js`, 필요 시 각 도메인 인접 test.

`src/index.js`, 각 Controller, `PermissionMap.js`, `manifest.yml`은 수정하지 않는다. resolver 등록과 permission boundary는 이미 존재하며 KVS attribute도 현행 필드만 사용한다.

## 4. 프론트엔드 설계

이번 범위에서 필수 프론트 변경은 없다. 기존 modal은 create/update에 필요한 입력을 이미 보내고, `backofficeKeys`와 invalidate 흐름도 바뀌지 않는다.

- 서버가 trim한 결과를 저장하므로 성공 후 existing list refetch로 표기값이 정렬된다.
- 화면의 `required`, `min/max`은 즉시 피드백 용도로 유지하되 보안/무결성 경계로 취급하지 않는다.
- Role 및 Level update modal은 현재 duplicate 코드를 `NAME_DUPLICATED`으로 확인하지만 서버는 `ROLE_NAME_DUPLICATED`/`LEVEL_NAME_DUPLICATED`를 반환한다. 이는 이번 검증 정책과 별개인 기존 UX 불일치다. 최소 범위를 지키기 위해 generic fallback으로 동작하게 두며, 후속 UX에서 두 코드를 맞추는 것이 안전하다.

## 5. DB 설계 / 데이터 호환성

MySQL·KVS schema·migration은 없다.

- 기존 행은 읽기/목록에서 원본 그대로 반환한다. 배포 시 데이터 정제나 이름 재정렬을 하지 않는다.
- 새 create와 update만 정규화된 값으로 저장한다. legacy `description: ''`, Skill의 optional field 생략 규칙, Level salary band의 optional attribute 생략 규칙을 보존한다.
- update는 대상 존재를 확인하므로 잘못된 id가 새 레코드를 생성하던 upsert 경로를 차단한다.
- 기존에 정책 상한을 넘는 legacy 값은 단순 조회·삭제는 가능하다. 해당 행을 수정하려면 새 정책에 맞는 값으로 고쳐야 한다. 이는 손상/과대 데이터의 재저장을 막으면서 migration을 요구하지 않는 최소 호환 경계다.

## 6. i18n 키 목록

필수 추가 없음. 새 오류는 기존 common error fallback을 사용한다.

후속 UX를 수행한다면 generated `ko-KR.json`/`en-US.json`이 아니라 다음 소스에만 추가 후 `npm run merge`를 실행한다.

- `locales/kr/role.json`, `locales/en/role.json`: name format/length
- `locales/kr/level.json`, `locales/en/level.json`: name format/length
- `locales/kr/skill.json`, `locales/en/skill.json`: name/category/description format/length
- `locales/kr/publicHoliday.json`, `locales/en/publicHoliday.json`: invalid date/work ratio/name

## 7. 구현 작업 분해

### Backend

- [ ] 공용 validator와 도메인별 상수/정규화 결과를 구현한다.
- [ ] 4개 create/update에서 클라이언트 변경 플래그를 신뢰하지 않고 id 존재·self-exclusion 중복 검사를 수행한다.
- [ ] Holiday actual-date 및 finite range를 검증한다.
- [ ] Role/Level/Skill Quick Add에도 동일 validator를 적용해 invalid bulk의 partial write를 막는다.
- [ ] 새 ErrorCodes를 추가하고 기존 코드/성공 DTO/권한 등록을 보존한다.

### Frontend

- [ ] 코드 변경 없이 기존 generic error fallback이 새 오류를 표시하는지 확인한다.
- [ ] (선택) 전용 오류 toast를 추가한다면 locales source 파일을 변경하고 merge한다.

### 테스트

- [ ] 각 create: `undefined`, whitespace-only, non-string name, 121자 name, 정상 trim 저장, duplicate.
- [ ] 각 update: 대상 없음은 `*_NOT_FOUND`, 이름이 같아도 self-exclusion 성공, `isNameChanged/isDateChanged:false`인데 다른 기존 항목과 충돌하면 duplicate, 121자/잘못된 optional text 거부.
- [ ] Holiday: `2026-02-29`, `2026-13-01`, `2026-1-1`, number가 아닌 date, `NaN`, Infinity, `-0.01`, `1.01` 거부; `0`, `1`, 정상 소수 허용.
- [ ] Role/Level/Skill description 1,000자 허용·1,001자 거부; Skill category 120자 허용·121자 거부·빈 category attribute 생략 유지.
- [ ] Level: 유효 text + 기존 salary band 회귀, 잘못된 band가 기존 `LEVEL_SALARY_BAND_INVALID`인지 확인.
- [ ] Bulk: 정규화 후 request 내 duplicate skip, malformed item 하나면 save 0건, 기존 duplicate는 added/skipped 현행 집계 유지.
- [ ] 기존 `CatalogBulk`, `LevelSalaryBand` 및 전체 backend test를 실행한다.
