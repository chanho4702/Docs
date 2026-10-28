# 워크포스 API 팀 조회 임시 재개 설계

## 1. 개요·영향 범위

2026-10-14 제거한 수동 3LO 조직 API 연결을 관리자 조회 도구로 다시 연결한다. 보존 Controller/Service와 UI를 재사용한다. 승인 대상·scopeKey·서명 검증 명부에는 변경이 없다. 기존 고객 문서는 수정하지 않는다.

## 2. 경계면 계약

모든 resolver는 guardedDefine과 `{admin:true}`를 사용하고 성공 응답의 `content`를 아래와 같이 유지한다.

| resolver | 입력 | content | 오류 | 소비 화면 |
|---|---|---|---|---|
| getWorkforceOrganizationApiStatus | 없음 | configured, baseUrl, configuredBy, updatedAt, source, automaticTokenRefresh:false | WORKFORCE_API_STORAGE_FAILED | 워크포스 연동 |
| saveWorkforceOrganizationApiConnection | baseUrl, accessToken | 상태와 동일 | LINK_DISABLED, INVALID_URL, INVALID_TOKEN, STORAGE_FAILED | 연결 폼 |
| deleteWorkforceOrganizationApiConnection | 없음 | configured:false 및 상태 | STORAGE_FAILED | 연결 폼 |
| listWorkforceOrganizationApiTeams | offset(0~990, 10단위) | configured, source, teams, page, fetchedAt, configuredBy, approvalAuthorityChanged:false | LINK_DISABLED, INVALID_URL, INVALID_QUERY, AUTH_REQUIRED, UNAVAILABLE, INVALID_RESPONSE, STORAGE_FAILED | 팀 조회 |

오류 표의 축약 이름은 모두 `WORKFORCE_API_` 접두사다. 미연결 조회는 configured:false, teams:[], page:null이다. 토큰은 응답에 포함하지 않는다.

## 3. 도메인

순수 승인 도메인 변경 없음. 기존 validateOrganizationBaseUrl(value, cloudId)의 동일 사이트 HTTPS URL 제한을 유지한다. 기존 테스트의 URL·offset·민감 필드 제거·OFF 네트워크 차단·토큰 미반환 사례를 실행한다.

## 4. 백엔드

Controller registrar를 src/index.js에 복구하고 PermissionMap 네 항목을 관리자 권한으로 등록한다. Service의 secret 저장, redirect 차단, 고정 GET endpoint와 기존 오류 정규화를 유지한다. SQL·CAS·트리거·스윕 변경 없음.

## 5. 스키마·마이그레이션

추가 없음. 기존 KVS secret `approval:workforce:organizationApi`만 사용한다.

## 6. Jira 연결

manifest backend fetch egress에 `https://api.atlassian.com`을 추가한다. 새로운 Jira scope·apiRoute·function은 없다. Workforce의 `/v1/organization/teams`를 저장한 3LO 토큰으로 읽는다. asApp 예외를 추가하지 않는다. manifest 변경은 배포 시 설치 upgrade가 필요하다.

## 7. 프론트

WorkforceLinkSettings에서 workforceLinkEnabled === true일 때 기존 WorkforceOrganizationApiSection을 SettingsSection으로 감싼다. 기존 WorkforceTeamsSection은 그대로 유지한다. 상태/페이지는 기존 workforceKeys 팩토리, 무효화 prefix도 팩토리로 제공한다. 연결 OFF/미확인에서는 컴포넌트를 마운트하지 않는다.

## 8. i18n

kr/en workforce.organizationApi.title에 임시 도구임을 표시한다. notConnected는 현재 화면에 없는 “위 목록” 참조를 제거한다. 기존 조회 전용·권한 불변·토큰 소유자 범위·자동 갱신 미지원 안내를 유지한다.

## 9. 용량·호출량

API 한 페이지 GET 1회, 팀 10개, 팀별 100명, 전체 500명, 본문 512 KiB 상한. 신규 SQL 행과 연간 SQL 저장량 0. 유휴 추가 SQL 0, 새 스케줄 없음. 200명도 동일 페이지 상한을 적용한다.

## 10. 미검증

실제 3LO 토큰·설치된 Workforce route의 호출 성공은 운영 토큰이 있어야 확인할 수 있다. 로컬 테스트는 fetch 대역이다. egress 반영 후 설치 권한 및 Runs on Atlassian 자격은 별도 CLI 확인 대상이며 기존 자격을 단정하지 않는다.

## 11. 작업 분해

- Backend: registrar·권한·egress 복구, 비활성 주석 갱신, 관리자 권한 계약 테스트.
- Frontend: ON 조건 마운트, 임시 제목·미연결 문구, query key prefix 팩토리, ON/OFF 통합 회귀.
- 검증: 대상 테스트 후 모든 작업 완료 시 루트가 전체 backend/UI/build/lint/check:bundle을 수행한다. 빌드는 에이전트 실행 중 하지 않는다.
