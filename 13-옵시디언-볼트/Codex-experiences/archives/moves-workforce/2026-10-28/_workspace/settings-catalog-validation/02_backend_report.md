# Backend 구현 보고서

## 구현 범위

- `CatalogInputValidator.js`를 추가하여 Holiday, Role, Level, Skill create/update/bulk 입력을 서버에서 정규화·검증합니다.
- update는 `id` 형식과 `findById(id)` 존재를 확인해 KVS `save()`의 upsert 경로를 차단합니다.
- 중복 검사는 클라이언트의 `isNameChanged`/`isDateChanged`와 무관하게, 정규화한 name/date 및 self-exclusion(`key !== id`)으로 수행합니다.
- Role/Level/Skill bulk는 모든 item을 저장 전 정규화하므로 하나라도 형식 오류이면 부분 저장하지 않습니다. 요청 내부의 정규화 후 중복은 기존처럼 `skipped`로 집계합니다.

## Resolver 응답 계약

기존 성공 DTO는 변경하지 않았습니다.

- `addPublicHoliday` / `updatePublicHoliday`: `{ data: { id, name, holidayDate, workRatio } }`
- `addRole`: `{ data: { id, roleData } }`, `updateRole`: `{ success: true, data: { id, data } }`
- `addLevel`: `{ data: { id, LevelData } }`, `updateLevel`: `{ data: { id, data } }`
- `addSkill`: `{ data: { id, skillData } }`, `updateSkill`: `{ success: true, data: { id, data } }`
- `addRoleBulk` / `addLevelBulk` / `addSkillBulk`: `{ data: { added, skipped } }`

오류는 기존 `LogicalError`와 wrapper 경로를 유지하며 새 code는 `CATALOG_NAME_INVALID`, `CATALOG_DESCRIPTION_INVALID`, `SKILL_CATEGORY_INVALID`, `HOLIDAY_DATE_INVALID`, `HOLIDAY_WORK_RATIO_INVALID`입니다. 빈 name은 호환성을 위해 기존 도메인별 `*_NAME_REQUIRED`, 빈/없는 update id 또는 미존재 대상은 `*_NOT_FOUND`입니다.

## 검증

`npm test -- --runInBand src/resolver/backoffice/__test__/CatalogInputValidation.test.js src/resolver/backoffice/__test__/CatalogBulk.test.js src/resolver/backoffice/level/__test__/LevelSalaryBand.test.js`

- Focused: 3 suites passed, 43 tests passed.
- Full backend: 110 suites passed, 1,487 tests passed.
