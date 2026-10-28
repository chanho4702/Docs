# 설정 값 서버 검증 P1 — 최종 통합 검증 결과

검증 기준: 설계(`01_architect_design.md`), backend/frontend 구현 보고, 현재 워킹 트리. 소스와 README는 수정하지 않았다.

## 통과

### 1. `updateSetting` 입력·응답 계약

- 생산자: `src/resolver/backoffice/setting/SettingController.js:12`가 `guardedDefine`로 등록하며, `SettingService.js:56-118`이 KVS 기존값과 `DEFAULT_SETTINGS`를 병합한 전체 상태에 strict 검증을 수행한다.
- 소비자: `static/ui/src/backoffice/page/setting/EtcSetting.jsx:65-78`, `SalaryPolicySetting.jsx:99-104`는 성공 시 `res.content.settings`를 소비한다.
- currency/rate/band/ratio/progress/salaryPolicy의 부분 갱신과 기존 `{ success, content: { settings } }` DTO가 일치한다.

### 2. Permission server mutation 계약

- `PermissionController.js:10,18,21`의 add/update/scope가 모두 `guardedDefine`이고, `src/index.js:65-66`, `src/permission/PermissionMap.js:175-177,186`과 resolver 이름·권한이 일치한다.
- `PermissionService.js:23-25,120-122,168,175-208`에서 모든 write 경로가 exact scope, catalog-complete pages, boolean read/write, `write => read`, trim name을 검사하며 catalog 순서로 저장한다.
- read/legacy 경로에는 `normalizeScope()` fallback이 유지되고 mutation에는 적용되지 않는다.

### 3. F1 보정 — 서버가 이름 변경 여부를 독립 판정

- `PermissionService.js:131-133`은 더 이상 payload의 `isNameChanged`를 신뢰하지 않고, 저장된 `existing.name`과 normalized 요청 name을 비교한 뒤 중복 검사를 수행한다.
- `PermissionService.test.js`의 direct-invoke 회귀 케이스는 `isNameChanged:false`와 중복 name을 보내도 `NAME_DUPLICATED`로 거부됨을 검증한다.

### 4. F2 보정 — UI와 strict `write => read` 경계 일치

- 공용 producer: `static/ui/src/backoffice/page/permission/modal/usePermission.js:65-86`.
  - write 활성화는 read도 활성화한다.
  - read 비활성화는 write도 비활성화한다.
- 등록 소비자: `regist/usePermissionRegistrationModal.js:45-55,80-90`.
- 수정 소비자: `edit/usePermissionEditModal.js:106-117,121-130`.
- 페이지·섹션·전체 토글이 하나의 helper를 써 동일한 invariant를 보장하고, backend `PermissionService.js:188-208`의 reject 계약과 일치한다.

### 5. 집중 자동 검증

- `npm test -- --runInBand -- SettingService PermissionService`: PASS — 3 suites, 21 tests.
- `static/ui`에서 `npm test -- --runInBand src/backoffice/page/permission/modal/__test__/permissionSelection.test.js`: PASS — 1 suite, 3 tests.
- `git diff --check`: PASS.

## 실패

- 없음.

## 미검증

- frontend build의 독립적인 종료 코드: 보고 시점에 `static/ui/build` 산출물은 2026-09-01 09:06에 갱신된 상태이나, 다른 실행 주체의 build 종료 로그는 이 검증 세션에서 확보하지 못했다. 따라서 build PASS로 판정하지 않았다.
- 실제 Forge KVS에 과거에 저장된 비정상 band/ratio가 있는 설치에서, 관련 없는 부분 설정 저장이 fail-close로 거부되는 런타임 사례는 fixture로 재현하지 않았다. 현재 구현의 병합 후 전체 검증은 설계와 일치한다.
