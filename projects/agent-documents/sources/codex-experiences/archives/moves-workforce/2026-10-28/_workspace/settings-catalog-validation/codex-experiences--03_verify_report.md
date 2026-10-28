# Holiday·Role·Level·Skill 입력 검증 통합 검증

검증일: 2026-09-01

## 통과

### 1. Resolver ↔ Frontend 응답 계약

- 생산자: [ResponseWrapper.js](../../src/utils/ResponseWrapper.js)는 서비스 결과를 최상위에 spread하여 `{ success, data }` envelope를 만든다.
- 생산자: Holiday/Role/Level/Skill create·update 서비스는 기존의 `data` DTO를 유지한다. bulk도 `{ data: { added, skipped } }`를 유지한다.
- 소비자: 등록·수정 modal은 `res.success` 실패 분기 후 성공 DTO를 추가 소비하지 않는다. Quick Add 3개는 모두 `res.data.added`, `res.data.skipped`를 읽는다.
- 결론: 설계서의 “`res.content`가 아니라 최상위 `res.data`” 계약과 실제 생산자·소비자가 일치한다.

### 2. 서버 입력 검증 및 update fail-close

- 생산자: [CatalogInputValidator.js](../../src/resolver/backoffice/CatalogInputValidator.js)는 name/description/category, 실존 holiday date, finite `workRatio`를 검증한다.
- 생산자: 각 update 서비스는 ID 형식과 `findById(id)` 존재를 먼저 확인하고, 클라이언트의 `isNameChanged`/`isDateChanged` 값과 무관하게 정규화한 고유 필드를 검사한다.
- 회귀 증거: [CatalogInputValidation.test.js:79](../../src/resolver/backoffice/__test__/CatalogInputValidation.test.js:79) self-exclusion, [같은 파일:85](../../src/resolver/backoffice/__test__/CatalogInputValidation.test.js:85) 없는 대상 fail-close가 통과했다.

### 3. Bulk malformed-item 원자성

- 생산자: [CatalogBulkService.js:28](../../src/resolver/backoffice/CatalogBulkService.js:28)에서 모든 item을 `map(normalizeItem)`으로 선검증한 뒤, [같은 파일:42](../../src/resolver/backoffice/CatalogBulkService.js:42)에서만 save한다.
- 회귀 증거: [CatalogInputValidation.test.js:96](../../src/resolver/backoffice/__test__/CatalogInputValidation.test.js:96)은 malformed item 하나가 있으면 `mockSave` 0회임을 확인한다. request 내부 정규화 중복도 added 1/skipped 1로 결정적이다.
- 결론: 이번 범위의 malformed 입력에 대해서는 partial write가 없다. 저장소 자체가 중간에 실패하는 경우의 트랜잭션 보장은 기존 Forge KVS 특성상 별도 범위이며 이번 설계 대상이 아니다.

### 4. Raw error masking

- 생산자: 새로운 검증 실패는 `responseWrapper`를 거쳐 `{ success:false, error:{code,message} }`가 된다.
- 소비자: [catalogErrorMessage.js:13](../../static/ui/src/backoffice/page/catalogErrorMessage.js:13)은 새 `CATALOG_*`, `HOLIDAY_*`, `*_NOT_FOUND` 코드를 generic translated message로 변환한다.
- 소비자: 11개 create/update/bulk mutation이 이 helper를 사용한다. 기존 duplicate와 level salary-band의 전용 안내는 유지된다.
- 회귀 증거: `catalogErrorMessage.test.js` 10 cases 통과.

### 5. 실행 검증

| 검증 | 결과 |
| --- | --- |
| `npm test -- --runInBand` | 통과 — 110 suites, 1,488 tests |
| `static/ui npm test -- --runInBand` | 통과 — 100 suites, 1,659 tests |
| `forge lint` | 통과 — No issues found |
| `git diff --check` | 통과 |

`forge lint`는 Forge CLI outdated 및 PermissionLinter `Unknown product` 경고가 있었으나 exit 0이며, lint 결과는 `No issues found`다.

## 실패

없음.

## 미검증

### Frontend production build

- `static/ui/package.json`의 `build`는 `prebuild: npm run merge`를 실행하여 root `locales/ko-KR.json`, `locales/en-US.json`을 재생성한다.
- 두 파일은 작업자 외 사용자 변경으로 dirty 상태라 이 검증 단계에서는 `npm run build`를 실행하지 않았다.
- Frontend 담당자의 `CI=true npm run build:app` 및 `npm run bundle:check` 통과 보고는 확인했으나, 이번 verifier가 재실행한 결과는 아니다.

## 범위 외 기존 UX 메모

- [useLevelEditModal.js:84](../../static/ui/src/backoffice/page/level/modal/edit/useLevelEditModal.js:84)는 `NAME_DUPLICATED`를 확인하지만 서버는 `LEVEL_NAME_DUPLICATED`를 반환한다. 설계서 4절에 이미 기재된 기존 코드 불일치이며, 이번 구현은 generic fallback을 유지하도록 명시돼 있어 신규 회귀나 이번 범위의 실패로 분류하지 않았다. 전용 duplicate toast를 목표로 하는 후속 UX 작업에서 맞춰야 한다.
