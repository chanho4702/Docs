# 설정 값 서버 검증 P1 설계서

## 1. 결론과 최소 범위

`guardedDefine`는 설정 mutation 호출 권한만 확인한다. 현재 `updateSetting`은 `progressThreshold`와 `salaryPolicy`만 검증하므로, Custom UI의 `min`/`max`와 `parseBand`를 우회한 `invoke()` 요청이 잘못된 값을 KVS `settings` 단일 레코드에 영구 저장할 수 있다. 특히 `hourRate: -1`, `utilizationRedBand: NaN`, 밴드 순서 역전, 지원하지 않는 `currency`가 가능하다.

또한 `addPermission`/`updatePermission`/`updatePermissionScope`는 UI가 만든 `pages`를 신뢰하고, 허용되지 않은 `projectScope`를 `normalizeScope()`가 `ALL`로 바꾼다. 직접 호출로 잘못된 scope를 보내면 권한 범위가 넓어질 수 있으므로, 이 mutation 경계에서는 **기본값 보정이 아니라 거부**해야 한다.

P1 최소 구현은 위 두 경계만 보강한다. Role/Level/Skill/Status의 문자열 정규화, Holiday 날짜·비율 검증, update 대상 존재 확인은 같은 성격의 후속 항목이지만 이번 P1에 섞지 않는다. Project status graph 무결성은 별도 P1 작업의 소유 범위다.

영향 범위:

| 계층 | 수정 범위 |
|---|---|
| Backend | `SettingService`, `PermissionService`, `ErrorCodes` 및 해당 단위 테스트 |
| Frontend | 정상 요청/성공 응답 계약이 유지되므로 기능 변경 없음. 서버 error code를 현재 일반 오류 toast로 표시한다. |
| DB/KVS | 스키마/manifest/migration 변경 없음. 기존 `settings`와 `permission` 레코드 형식을 유지한다. |
| i18n | 신규 사용자 노출 문구 없음. 기존 공통 실패 toast를 사용한다. |

## 2. 전수 조사 결과

| mutation 군 | 현재 서버 검증 | 직접 호출 위험 | 이번 P1 |
|---|---|---|---|
| `updateSetting` | `salaryPolicy` enum, `progressThreshold` finite 0..100만 검증 | 임의 통화, 음수/무한/문자 `hourRate`, 역전·비정상 utilization/scope ratio가 분석·MD/MM 계산에 전파 | 포함 |
| `addPermission`, `updatePermission` | 시드 set 잠금·중복 이름은 일부 처리 | 임의 `pages` shape/알 수 없는 resource, `write:true`인데 `read:false`, invalid scope → `ALL` 보정 | 포함 |
| `updatePermissionScope` | Admin 불변만 처리 | invalid scope → `ALL` 보정 | 포함 |
| Role/Level/Skill add/update/bulk | name truthiness, Level salary band | 공백/비문자 name, update의 존재하지 않는 ID 저장 가능 | 후속 |
| Public holiday add/update | name/date 존재, 날짜 중복 | ISO 날짜 아닌 값, `workRatio` 범위·finite 검증 없음, update 대상 존재 확인 없음 | 후속 |
| Project status add/update/delete/link | 이름/중복, link graph 검증 | 이름·color·대상 ID 입력 계약 일부 미검증. graph 자체는 별도 P1 | 별도 작업 |
| Team add/update/assign | name/tree/depth/leader 등 서버 검증 | 이번 감사 대상의 UI-only numeric setting 문제와 무관 | 제외 |

## 3. 경계면 계약

resolver 함수명과 성공 응답 shape는 변경하지 않는다. 실패는 `responseWrapper`가 기존처럼 `{ success:false, error:{ name, code, message, cause } }`로 직렬화한다.

| resolver | 입력 계약(변경 후) | 성공 응답 | 실패 code |
|---|---|---|---|
| `updateSetting` | 전달된 각 값만 partial update. `currency`는 `KRW|USD|JPY|EUR|GBP`; `hourRate`는 finite number, `0.5..24`, 0.5 단위; 세 utilization 값은 finite number이고 `0 <= under < over < red`; scope ratio가 전달되면 finite number이고 `0 <= amber < red <= 1`; `progressThreshold`는 기존 `0..100`; `salaryPolicy`는 기존 enum | `{ success:true, content:{ settings: Settings } }` | `SETTING_CURRENCY_INVALID`, `SETTING_HOUR_RATE_INVALID`, `SETTING_UTILIZATION_BAND_INVALID`, `SETTING_SCOPE_TODO_RATIO_INVALID` 및 기존 codes |
| `addPermission` | non-empty trimmed `name`; `projectScope`는 정확히 `ALL|MEMBER_ONLY|TEAM_ONLY`; `pages`는 catalog resource별 정확히 1개, boolean `read/write`, `write => read` | 기존 `{ success:true }` | `PERMISSION_NAME_REQUIRED`, `PERMISSION_SCOPE_INVALID`, `PERMISSION_PAGES_INVALID` |
| `updatePermission` | 위 name/pages/scope 규칙 + 기존 set 존재/seed immutability | 기존 `{ success:true }` | 동일 + 기존 `PERMISSION_SET_NOT_FOUND`, `PERMISSION_SEED_IMMUTABLE` |
| `updatePermissionScope` | 정확히 허용된 scope만 수용. 조회 응답/legacy read에서의 `normalizeScope` fallback은 유지 | 기존 `{ success:true }` | `PERMISSION_SCOPE_INVALID` + 기존 Admin immutable/not found |

`Settings` DTO는 기존 필드 모두를 보존한다. 서버는 유효한 partial payload만 이전 값과 병합하므로, 한 설정 카드가 다른 카드의 값을 덮어쓰지 않는다.

## 4. 백엔드 설계와 파일별 책임

### `src/resolver/backoffice/setting/SettingService.js`

- `VALID_CURRENCIES`를 UI 상수 복사가 아닌 backend 상수로 선언한다. Forge backend는 frontend import에 의존하지 않는다.
- `assertFiniteNumber`, `assertHourRate`, `assertUtilizationBands`, `assertScopeTodoRatios`를 이 파일 private helper로 둔다. 공용화가 필요한 다른 mutation이 아직 없으므로 validator 모듈을 새로 만들지 않는다.
- 값이 `undefined`/`null`인 partial 필드는 기존 동작대로 건드리지 않는다. 값이 전달된 경우에는 coercion하지 않고 `typeof value === 'number' && Number.isFinite(value)`만 허용한다. 문자열 숫자도 거부한다.
- utilization 세 값 중 하나라도 전달되면, 저장 직전의 병합값 전체로 순서 관계를 검증한다. 이 방식은 카드별 partial update에도 역전 상태를 만들지 않는다.
- `scopeTodoAmberRatio`/`scopeTodoRedRatio` 역시 병합값 전체로 `0 <= amber < red <= 1`을 검사한다. 현재 UI 노출 여부와 무관하게 저장 가능한 모든 settings field를 보호한다.
- `hourRate`는 UI가 snap하는 규칙과 같게 `Math.round(value * 2) === value * 2`를 요구한다. UI의 input `min=1`과 implementation clamp `0.5`가 충돌하므로, 실제 저장 규약인 `0.5..24`를 단일 기준으로 고정한다.

### `src/resolver/backoffice/permission/PermissionService.js`

- `ResourceCatalog`에서 `RESOURCE_KEYS`를 이미 import하고 있으므로, mutation 전용 `assertProjectScope`와 `normalizePermissionPages`를 private helper로 추가한다.
- 조회·기존 데이터 호환을 위한 `normalizeScope()` 사용은 유지한다. mutation에서는 `normalizeScope`를 호출하지 않고 허용 목록 포함 여부를 먼저 검사한다.
- `pages`는 배열이어야 하며 `RESOURCE_KEYS` 각각이 한 번만 존재해야 한다. unknown/missing/duplicate key, `value`가 아닌 값, boolean 아닌 `read/write`, `write:true && read:false`는 모두 `PERMISSION_PAGES_INVALID`로 거부한다.
- 저장하는 pages는 `RESOURCE_KEYS` 순서로 재구성한다. payload 순서나 추가 속성은 저장하지 않는다.
- name은 `String`이 아닌 값을 거부하고 trim한 값으로 중복 확인·저장한다. 빈 값은 `PERMISSION_NAME_REQUIRED`로 거부한다.
- `updatePermissionScope`는 검증 뒤 기존 record를 spread해 저장하여 현재의 name/pages/edit 보존 계약을 유지한다.

### `src/utils/errors/ErrorCodes.js`

신규 code 7개만 추가한다: `SETTING_CURRENCY_INVALID`, `SETTING_HOUR_RATE_INVALID`, `SETTING_UTILIZATION_BAND_INVALID`, `SETTING_SCOPE_TODO_RATIO_INVALID`, `PERMISSION_NAME_REQUIRED`, `PERMISSION_SCOPE_INVALID`, `PERMISSION_PAGES_INVALID`.

새 resolver, `src/index.js` registrar, `PermissionMap`, manifest 변경은 없다.

## 5. 프론트엔드 설계

프론트 코드 변경은 하지 않는다.

- EtcSetting의 입력 제약과 서버 제약을 동기화할 필요가 있지만, 정상 UI 경로는 이미 범위 내 값을 보내며 서버 성공 DTO도 동일하다.
- 기존 mutation handlers는 `res.success === false`에서 공통 오류 toast를 표시한다. 이번 P1은 validation code별 신규 문구를 요구하지 않는다.
- Permission modal은 catalog에서 완전한 pages를 만들어 보내므로 새 strict shape와 호환된다.

## 6. 테스트 계획

### `src/resolver/backoffice/setting/__test__/SettingService.test.js`

1. 유효한 전체 settings partial update가 `{content:{settings}}`를 보존하는지 확인한다.
2. currency: unknown, 공백, number을 각각 reject하고 `findById/save`가 호출되지 않는지 확인한다.
3. hourRate: `0.5`, `24`, `8.5`는 허용; `0`, `24.5`, `8.25`, `NaN`, `Infinity`, 문자열은 reject한다.
4. utilization: 경계값과 정상 순서 허용, 같음·역전·음수·non-finite reject. 한 field만 보낸 경우 기존 settings와 합쳐 검증하는 case를 포함한다.
5. scope todo ratio: 정상 순서 및 invalid/역전/경계 reject를 확인한다.
6. 모든 신규 reject는 read/write 전에 발생하는지 확인한다.

### `src/resolver/backoffice/permission/__test__/PermissionService.test.js` (신규 또는 기존 suite 확장)

1. 정상 catalog 전체 pages와 `TEAM_ONLY`가 저장되는지 확인한다.
2. invalid scope가 `ALL`로 저장되지 않고 `PERMISSION_SCOPE_INVALID`로 reject되는지 add/update/scope 전용 mutation 각각 확인한다.
3. pages의 unknown/missing/duplicate key, non-boolean, write-only 형태를 각각 reject하고 save하지 않는지 확인한다.
4. name 공백/비문자 reject, trim한 이름의 중복 판정을 확인한다.
5. `updatePermissionScope`가 pages/name/edit를 변경하지 않는 기존 계약을 회귀 검증한다.
6. Admin·seed set immutability 및 not-found 기존 tests가 있으면 그대로 통과시킨다.

실행: `npm test -- --runInBand -- SettingService PermissionService` 후 구현 작업자가 변경 범위 전체 backend test 및 `forge lint`를 실행한다. 프론트 소스 변경이 없으므로 frontend build는 이 작업의 필수 게이트가 아니다.

## 7. 구현 체크리스트

- [ ] `ErrorCodes`에 7개 code 추가
- [ ] `SettingService`에서 partial 병합 후 strict validation
- [ ] `PermissionService`에서 mutation 전용 strict scope/pages/name normalization
- [ ] settings와 permission service tests 추가
- [ ] 기존 resolver 성공 shape, read fallback, seed immutability regression 확인
- [ ] README를 stage/수정하지 않음
