# Frontend 구현 보고서

## 점검 결과

- 이 resolver들의 실제 응답 envelope는 `ResponseWrapper`의 `{ success, ...serviceResult }`이다.
- 따라서 backend report의 성공 DTO는 `result.content`가 아니라 기존처럼 최상위 `result.data`에 있다. Holiday/Role/Level/Skill create·update·bulk의 `res.success` 분기와 `res.data` 소비는 모두 실제 계약과 일치한다.
- create/update는 성공 DTO를 화면에서 추가로 소비하지 않고 성공 Toast 및 목록 invalidation만 수행한다. bulk는 `res.data.added`와 `res.data.skipped`를 소비하며 backend DTO와 일치한다.

## 보정

- `catalogErrorMessage`를 추가했다.
- 새 서버 검증 코드 `CATALOG_*`, `HOLIDAY_*`, `*_NOT_FOUND`는 `LogicalError.message`가 코드 문자열이므로 raw code가 Toast에 노출되지 않도록 기존 번역 `gantt.saveFailed`로 변환했다.
- 기존 중복 오류의 개별 안내와 삭제 오류 처리는 변경하지 않았다.
- 신규 번역 키가 없으므로 `locales/kr|en` 및 사용자 변경인 `locales/ko-KR.json`, `locales/en-US.json`은 수정하거나 merge하지 않았다.

## 변경 파일

- `static/ui/src/backoffice/page/catalogErrorMessage.js`
- Holiday/Role/Level/Skill 등록·수정·빠른 추가 mutation 훅 11개
- `static/ui/src/backoffice/page/__test__/catalogErrorMessage.test.js`

## 검증

- `npm test -- --runInBand src/backoffice/page/__test__/catalogErrorMessage.test.js`: 1 suite, 10 tests 통과
- `npm test -- --runInBand`: 100 suites, 1,659 tests 통과
- `CI=true npm run build:app`: 통과. 기존 Browserslist 및 dependency source-map 경고만 발생
- `npm run bundle:check`: 통과 (`gzipBytes` 436,067 / budget 950,000)
- `npm run build`는 prebuild의 locale merge가 사용자 변경 root locale을 다시 생성하므로 실행하지 않았다. 대신 merge를 제외한 CI 컴파일 및 bundle budget 검증을 수행했다.
