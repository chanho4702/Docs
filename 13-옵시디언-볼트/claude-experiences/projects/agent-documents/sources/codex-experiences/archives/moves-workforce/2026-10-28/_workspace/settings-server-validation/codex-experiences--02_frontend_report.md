# 설정 서버 검증 P1 frontend F2 보정 보고서

## 변경 내용

- `permission/modal/usePermission.js`에 권한 선택 공통 helper를 추가했다.
  - write 활성화 시 해당 page의 read를 함께 활성화한다.
  - read 비활성화 시 해당 page의 write를 함께 비활성화한다.
- 등록 및 수정 모달의 개별 page, section, 전체 checkbox handler가 모두 같은 helper를 사용하도록 변경했다.
- 기존 `addPermission` / `updatePermission`의 invoke DTO와 `result.content` 소비 경로는 변경하지 않았다.

## 테스트

- `npm test -- --runInBand src/backoffice/page/permission/modal/__test__/permissionSelection.test.js`
  - PASS: 1 suite, 3 tests
- `git diff --check`
  - PASS
- `npm run build`
  - 실행했으며, 보고서 작성 시점에 `craco build`가 진행 중이다. 종료 결과는 리더가 확인한다.

## i18n

- 문구나 번역 키를 추가하지 않아 merge는 실행하지 않았다.
