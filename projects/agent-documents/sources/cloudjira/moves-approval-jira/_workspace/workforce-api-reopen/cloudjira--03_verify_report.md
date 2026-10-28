# 검증 리포트

## 요약

대상 backend 25 tests, UI 22 tests 통과. 정적 경계면 불일치 없음. 전체 테스트·번들·Forge lint는 루트 실행 후 갱신한다.

## 경계면

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| getWorkforceOrganizationApiStatus | Controller service.status() → content, Service stateOf() | Section status.data.configured/baseUrl | 예 |
| saveWorkforceOrganizationApiConnection | Controller service.save(request) → content 상태 | Section save mutation 후 상태 재조회 | 예 |
| deleteWorkforceOrganizationApiConnection | Controller service.remove() → content 상태 | Section remove mutation 후 캐시 제거·재조회 | 예 |
| listWorkforceOrganizationApiTeams | Controller service.teams(request) → content teams/page | Section teams.data.teams/page.nextOffset | 예 |

파일은 src/resolver/workforce/WorkforceOrganizationApiController.js, WorkforceOrganizationApiService.js와 static/ui/src/features/settings/WorkforceOrganizationApiSection.jsx다. invokeApproval은 content를 한 번만 벗긴다.

## 정적 확인

- 네 resolver 모두 guardedDefine/PermissionMap/admin/registrar 등록 일치. 원래 서명 팀 resolver 권한은 그대로 유지한다.
- 외부 API 응답은 표시 전용이다. 승인/팀장 범위/원장/서명 검증 변경 없음.
- 기존 Service의 현재 사이트 URL·고정 GET·redirect 차단·secret 비노출·응답 필드 허용 목록을 유지했다.
- 오류 코드 여덟 개가 ErrorCodes와 kr/en error.json에 모두 존재한다. UI는 error.code로 분기한다.
- SQL·CAS·마이그레이션·스케줄·엔트리·asApp 변경 없음. 추가 유휴 SQL 0.
- API 화면은 연동 명시적 ON에서만 마운트한다. 캐시 key와 prefix는 팩토리로 제공한다.
- git diff --check 통과. 고객 문서 변경은 기존 작업으로 보존했다.

## 실행 결과

- backend 대상 테스트: 2 suites / 25 tests 통과.
- npm run merge: 통과.
- UI 대상 테스트: 3 suites / 22 tests 통과.
- 전체 backend/UI, build:ui, forge lint, check:bundle: 루트 검증 대기.

## 미검증

- 유효한 3LO 토큰을 통한 실제 Workforce 응답: 로컬은 대역이며 사이트 실측 필요.
- egress 반영 배포와 설치 upgrade, Runs on Atlassian 자격: 루트 후속 단계에서 판단. 기존 자격 유지 단정 없음.

## 전체 검증 완료 (2026-10-15)

- backend: 209 suites / 3,081 tests 통과.
- UI: 94 suites / 831 tests 통과.
- build:ui 및 check:bundle 통과.
- forge lint --approve MAJOR_VERSION_RULE: No issues found. 최초 lint의 구형 egress 문자열 경고는 address 객체로 수정했다. 외부 통신 권한 추가에 따른 major version 변경은 예상 사항이다.
- 배포·설치 갱신·실제 3LO 연결은 수행하지 않았다. 사이트 적용 시 development 배포와 major upgrade 설치가 필요하다.

## 폐기 (2026-10-15)
사용자 요청으로 이번 재개 변경을 모두 원복했다. 배포하지 않았으며 이전 비활성 상태를 유지한다. 위 구현·검증 기록은 폐기된 시도에 대한 이력이다.

## 재복구 (2026-10-15)

사용자가 원복 후 “야 복구하자”라고 요청하여 직전 임시 API 재개 변경 11개 파일을 동일하게 재적용했다. manifest egress는 검증된 `address: https://api.atlassian.com` 객체 형식이다. 기존 고객 문서 2개 변경은 보존했다.

backend 등록·관리자 권한·egress → frontend ON 조건 마운트·문구·query key·테스트 순서로 복구하고 정적 경계면을 재확인했다. 네 resolver의 생산자/소비자 계약과 기존 서명 승인 권위는 위 표와 동일하다. `npm run merge` 및 `git diff --check` 통과. 이번 재복구 이후 테스트·빌드·lint는 아직 실행하지 않았으며 루트가 다시 검증한다. 배포하지 않았다.

### 재복구 전체 검증 완료
Backend 209 suites / 3,081 tests, UI 94 suites / 831 tests 통과. build:ui, forge lint --approve MAJOR_VERSION_RULE, check:bundle 통과. 배포·실제 API 연결 미수행.
