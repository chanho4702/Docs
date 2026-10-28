# Settings server validation — backend report

## 구현 범위

- `SettingService.updateSettingService`
  - `currency`는 `KRW|USD|JPY|EUR|GBP`만 허용한다.
  - `hourRate`는 finite number, `0.5..24`, 0.5 단위만 허용한다.
  - utilization band와 scope todo ratio는 기존 레코드·기본값과 partial payload를 병합한 뒤 전체 순서 관계를 검증한다.
  - 성공 DTO는 기존과 동일하게 `{ content: { settings: Settings } }`이다.
- `PermissionService.addPermissionService`, `updatePermissionService`, `updatePermissionScopeService`
  - write mutation에서만 exact `ALL|MEMBER_ONLY|TEAM_ONLY` scope를 허용하며, invalid value의 `ALL` fallback을 제거했다.
  - name은 string·trimmed non-empty, pages는 `RESOURCE_KEYS` 전체를 정확히 한 번씩 포함하고 모든 `read/write`가 boolean이며 `write => read`여야 한다.
  - 저장 pages는 catalog 순서로 정규화한다. read/legacy 경로의 `normalizeScope()` 동작은 유지했다.
  - `updatePermission`은 client `isNameChanged`를 소비하지 않으며, 저장된 이름과 normalized 요청 이름을 서버에서 비교해 변경 시 항상 uniqueness를 검증한다.
  - 성공 DTO/resolver 등록/PermissionMap/frontend/i18n/DB 스키마는 변경하지 않았다.
- `ErrorCodes`에 설계서의 7개 validation code를 추가했다.

## 실패 계약

`responseWrapper`를 통과해 기존 `{ success:false, error:{ name, code, message, cause } }` shape로 반환된다.

- settings: `SETTING_CURRENCY_INVALID`, `SETTING_HOUR_RATE_INVALID`, `SETTING_UTILIZATION_BAND_INVALID`, `SETTING_SCOPE_TODO_RATIO_INVALID`
- permission: `PERMISSION_NAME_REQUIRED`, `PERMISSION_SCOPE_INVALID`, `PERMISSION_PAGES_INVALID`

## 검증 결과

`npm test -- --runInBand -- SettingService PermissionService`

- PASS: 3 suites, 20 tests
- 새 테스트: strict settings scalar/partial merge 및 permission catalog pages·scope fallback 차단, `isNameChanged:false` 중복 이름 우회 차단

`forge lint`

- PASS (exit code 0, output 없음)
