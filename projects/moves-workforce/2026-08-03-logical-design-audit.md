---
tags:
  - moves-workforce
  - logical-design
  - forge
  - audit
updated: 2026-08-03
---

# Moves Workforce 논리 설계 전수 감사

> 날짜: 2026-08-03  
> 프로젝트: [[moves-workforce]]  
> 연결: [[moves-workforce-overview]], [[moves-workforce-design-qa]], [[2026-07-06-permission-hardening]], [[2026-06-11-analysis-review]]

## 결론

최초 감사 판정은 FAIL이었다. backend/frontend 테스트와 production build가 모두 통과했지만 자동화 green과 운영 계약 준수는 같은 뜻이 아니었다. 당시 배포 차단 항목은 다음 세 가지였다.

1. `SELF` 일정 update/delete가 SQL `WHERE`에 `account_id`를 포함하지 않아 row ownership을 보장하지 않는다.
2. 설치된 `@forge/sql`의 DML 반환은 `result.rows.affectedRows`인데 다수 서비스와 mock이 `result.rowsAffected`를 사용한다.
3. 임시 라이선스 diagnostics resolver가 중앙 PermissionMap/responseWrapper/registrar contract를 의도적으로 우회하며, production license 부재·조회 실패도 fail-open이다.

프로젝트 상세 보고서: `C:\CloudJira\moves-workforce\_workspace\logical-design-audit\03_verify_report.md`

## 2026-08-03 후속 보정 결과

권장 순서인 문서 계약 확정 → backend 경계 보정 → frontend 소비 계약 보정 → 독립 통합 검증으로 수정했다. 최초 P0/P1 항목은 코드와 회귀 테스트 기준으로 해소됐다.

- SELF 일정 write: actor를 `context.accountId`로 고정하고 SQL owner predicate와 0행 not-found/forbidden 처리를 추가했다.
- Forge SQL DML: SDK raw `rows.affectedRows`를 공통 adapter의 `rowsAffected`로 정규화했다. user update repository의 adapter 우회도 최종 보정했다.
- License: 명시적 context `active/inactive`를 우선하고, license 부재는 `development/staging`만 허용한다. production은 License API fallback, unknown/context 실패는 `UNAVAILABLE` fail-closed다.
- 민감정보/응답 계약: 공용 resource DTO의 `salary` 제거, Sentry/job polling wrapper 소비를 실제 wire shape에 맞췄다.
- 일정/분석: calendar context 전달, resolved error rollback, overlap 조회, 미래 구간 clamp, 0 denominator `N/A`를 반영했다.
- 설정/문서: `progressThreshold` schema·seed·service·UI를 연결하고 architecture/ERD/핵심로직/onboarding/README를 현재 Custom UI 구현에 맞췄다.

최종 자동 검증은 backend 52 suites/768 tests, frontend 41 suites/650 tests와 snapshot 1건, production build, locale merge 및 ko/en 1,994 leaf parity를 통과했다. 다만 실제 development deploy/E2E, Forge PermissionLinter의 `Unknown product`, 전역 inline query key·하드코딩 UI, 1.72MB main bundle, `project_team` 다단계 write의 비트랜잭션 위험은 별도 잔여 작업이다. 따라서 코드 감사 핵심 항목은 해소됐지만 운영 출시 판정은 PARTIAL로 유지한다.

## 새로 확인한 교훈

### 1. SELF는 resolver 분류가 아니라 SQL row predicate까지 포함하는 계약이다

`PermissionMap`에 `SELF`를 선언하고 payload의 `account_id`를 context 값으로 덮어써도, update/delete 대상이 ID만으로 선택되면 타인 row를 바꿀 수 있다. SELF write의 최소 검증식은 다음과 같다.

- controller: actor는 항상 `context.accountId`
- repository: `WHERE resource_id = ? AND owner_account_id = ?`
- service: affected rows가 0이면 not-found/forbidden
- test: 타인의 실제 resource ID를 사용한 negative test

리스트 API가 다른 사용자의 resource ID를 정상 반환하는지도 공격 경로 분석에 포함해야 한다.

### 2. SDK 결과 shape mock이 실제 타입과 다르면 전체 테스트가 false-green이 된다

공통 adapter가 SDK 원본 결과를 그대로 반환하면서 서비스마다 convenience alias를 추정하면 계약이 분산된다. SDK 경계에서 한 번 정규화하고, 적어도 하나의 contract test는 설치된 package 타입과 동일한 raw shape를 사용해야 한다.

이번 사례에서는 `{ rowsAffected: 1 }` mock이 다수 존재해 708개의 backend test가 모두 통과해도 0행 분기와 카운트가 runtime에서 깨질 수 있었다.

### 3. 단일 registrar/PermissionMap 규칙은 직접 resolver.define을 금지해야 완성된다

계약 테스트가 `CONTROLLER_REGISTRARS`만 순회하면 목록 밖에서 직접 등록한 resolver를 보지 못한다. “임시 진단”도 production handler에 포함되는 순간 동일한 보안 경계를 따라야 한다. 예외를 허용하려면 별도 manifest/runtime function, 관리자 권한, 만료 기한 같은 명시적 통제가 필요하다.

### 4. 설계 문서는 수치가 아니라 자동 추출 가능한 inventory를 기준으로 갱신한다

최초 감사 시점의 기존 문서는 controller 26, SQL 11 table, KVS 11 entity라고 적었지만 실제 inventory는 registrar 30(+diagnostic 1), SQL 12, KVS 12였다. 팀 관리 RFC-147, `project_team`, `users.team_key`, `salary_type`, `TEAM_ONLY`도 ERD/architecture에서 누락돼 있었다. 후속 보정에서 diagnostics를 제거하고 문서 inventory를 현재 코드에 맞췄다.

문서의 controller/table/entity 수는 수동 상수로 유지하지 말고 CI에서 inventory를 생성하거나, 최소한 release checklist에서 code/manifest/migration과 대조해야 한다.

### 5. 지표의 0 denominator를 0.1 같은 가짜 값으로 치환하지 않는다

가동률에서 유효 가용일 0을 0.1로 강제하면 계산은 계속되지만 의미가 바뀐다. `null/N/A`와 “계산 불가 이유”를 응답 계약으로 표현해야 한다. 미래 날짜도 backend에서 `min(endDate, today)`로 clamp해야 UI 우회를 막을 수 있다.

## 함께 발견한 후속 항목 (최초 감사 시점)

- ~~`getResourceOverview`가 비용 권한 없이 `salary` 반환~~ → 해소
- ~~calendar 탭이 필수 `context` 없이 컴포넌트를 렌더링하여 drag update 실패~~ → 해소
- ~~job polling이 `{success,...}` wrapper를 검사하지 않아 오류 응답을 완료 상태로 오인~~ → 해소
- ~~내 일정 조회가 overlap이 아니라 시작일 `BETWEEN`만 사용~~ → 해소
- ~~`progressThreshold`가 문서에는 설정값이나 schema/service/seed에는 없음~~ → 해소
- 직접 배열 query key 57건·직접 invalidate 13건, 일부 하드코딩 UI 잔존
- main bundle gzip 1.72MB, bundle budget 부재
- 프로젝트 지침의 Vault 경로(`Codex-experiences`)와 실제 경로(`claude-experiences`) 불일치
- UI Kit 전용 지침과 현재 Custom UI architecture가 충돌

## 최초 검증 기록

- backend Jest: 42 suites, 708 tests PASS
- frontend Jest: 33 suites, 588 tests PASS, snapshot 1 PASS
- frontend production build: PASS with warnings, main JS gzip 1.72MB
- Forge lint: `No issues found`, 단 PermissionLinter `Unknown product`로 부분 미검증
- ko/en locale leaf: 1,976 / 1,976, parity PASS
