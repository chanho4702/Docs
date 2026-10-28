---
name: forge-backend-dev
description: "Moves RMS Forge 백엔드 구현 스킬. guardedDefine·PermissionMap 등록, principal 데이터 범위, 커스텀 에러, Forge SQL/KVS와 Jira API 계약을 적용한다. backend-engineer가 resolver·서비스·DB 구현에 사용한다."
---

# Forge Backend Dev — 백엔드 구현

## 시작 조건

1. 루트 `AGENTS.md`, `CLAUDE.md`, 작업 계약과 파일 소유권을 먼저 읽는다.
2. 기존 `_workspace/<feature>/01_architect_design.md`와 관련 Controller/Service/Query 실제 소스를 읽는다. 작은 수정에 설계서가 없으면 현재 계약과 변경 범위의 간결한 기록으로 대체한다.
3. 소유한 파일만 수정하고 다른 작업자의 변경을 되돌리지 않는다.
4. 설계와 소스가 다르면 요구사항·생산자·소비자를 대조해 계약부터 조율한다.
   실제 구현을 자동으로 우선하거나 프론트가 임의로 맞추도록 넘기지 않는다.

## 계층과 등록

`src/index.js → Controller → Service → (Repository) → DB` 계층을 따른다.
도메인은 `src/resolver/<도메인>/`, 일부 기존 도메인은 `.jsx` 확장자를 사용한다.

```js
import { guardedDefine } from '../../permission/permissionGuard';
import { getTeamMemberCandidatesService } from './ProjectTeamService';

export function registerProjectTeamController(resolver) {
    guardedDefine(resolver, 'getTeamMemberCandidates', ({ payload, principal }) =>
        getTeamMemberCandidatesService(payload, principal));
}
```

- 신규 컨트롤러는 `src/index.js`의 `CONTROLLER_REGISTRARS` 배열에만 추가한다.
  별도 등록 목록·추가 호출을 복제하지 않는다.
- 신규 resolver는 `src/permission/PermissionMap.js`에 정책을 반드시 선언한다.
  미선언 함수는 deny-by-default로 `PERMISSION_UNMAPPED` 오류가 발생한다.
- `guardedDefine`이 가드와 `responseWrapper`를 합성하므로 래퍼를 중복 적용하지 않는다.
- 기존 컨트롤러 등록 함수의 export 이름을 확인한다. 모두 같은 명명 규칙인 것은 아니다.

## 응답과 에러 계약

- 성공은 `{ success: true, ...result }`, 실패는
  `{ success: false, error: { name, code, message, cause } }`이다.
- Service 반환값과 resolver 응답을 구분한다. `content`·`rows`·배열 위치는 확정 계약을 따른다.
- 계약 변경 함수명으로 `src/`를 검색해 직접 import하는 다른 Service·큐·트리거를 갱신한다.
- `src/error/`의 `LogicalError`, `SqlError`, `PermissionError`, `ProjectScopeError` 등과
  `src/utils/errors/ErrorCodes.js`의 정의를 확인한 뒤 적절한 오류를 throw한다.
- 실패를 정상 빈 데이터로 바꾸거나 소비자가 실패 응답의 content에 접근하도록 만들지 않는다.

## 호출 권한과 데이터 범위

- 가드는 호출 가능 여부를 검사한다. 재무·인사 서비스에는 `principal`을 전달하고 응답을 좁힌다.
- `principal` 누락은 fail-close 한다. 무인 배치는 필요한 경우 명시적 `SYSTEM_PRINCIPAL`을 쓴다.
- SELF에서는 payload의 사용자 ID를 신뢰하지 않는다. `context.accountId`를 서비스와 Query까지
  전달해 UPDATE/DELETE의 ID 조건과 함께 실제 소유자 조건에 넣는다. 컨텍스트 누락도 거부한다.
- `detail`/`inherited` 프로젝트 범위 사용자는 projectId 누락·타 프로젝트 모두 거부한다.
  목록 범위는 서비스에서 필터링하고, 프로젝트 컨텍스트가 없는 함수에 `detail`을 붙이지 않는다.
- 급여·원가는 `CostAccess.canReadCost(principal)`와 `SalaryVisibility`를 함께 적용한다.
  일반 resource DTO에 `salary`를 넣지 않고 비용은 `PROJECT_COST` 전용 경로로 제공한다.
- 인력 명부는 `TeamAnalyticsScope.resolveTeamAnalyticsScope(principal)`을 단일 출처로 사용한다.
- 동일 데이터를 내주는 형제 resolver를 전수 검색해 같은 범위를 적용한다.
- 읽기·쓰기 검증을 공용 함수로 묶어 조회가 거부하는 대상의 저장이 통과하지 않게 한다.
- 권한 세트 직접 배정·팀 상속은 `PermissionAssignment.assertCanAssignPermissionSet`을 따른다.

## DB 계약

- MySQL은 `src/rdb/query/` Query 클래스와 `QueryBuilder.js`를 재사용한다.
  스키마 변경은 `src/rdb/schema/ddl/`과 `ddl/index.js`, migration 경로를 확인한다.
- DML 결과는 `CommonQuery.executeQuery`의 `rowsAffected` alias로 판정한다.
  raw Forge SQL mock은 `{ rows: { affectedRows: 1 } }` 형태를 재현한다.
  Query 계층 mock은 실제 반환 계약에 맞는 alias도 제공하며 영향 행 0건을 검증한다.
- Forge SQL은 FK/cascade를 보장하지 않고 트랜잭션을 지원하지 않는다.
  관계 삭제는 기존 순차·멱등 처리 패턴을 따른다.
- KVS는 `src/nosql/query/CustomEntityManager.js`를 사용한다.
  새 속성은 `manifest.yml` schema를 먼저 변경하고 저장 경로 사용 전에 배포한다.
- 선택 필드의 빈 문자열은 속성 자체를 생략한다. `value || ''`로 저장하지 않는다.
- `findAll()`은 100건 상한이며 자동으로 다음 페이지를 읽지 않는다.
  전량 조회는 `findAllPaged(indexName, pageLimit, maxItems)`와 `truncated` 처리를 사용한다.
  목록과 이름 중복 판정은 같은 상한 상수를 공유한다.

## Jira와 성능

- `src/api/jira/`와 `src/api/jira/util/RequestJiaJson.js`의 기존 클라이언트를 사용한다.
- Jira product REST는 `asUser()` 기본이다. `asApp()`은 `CLAUDE.md`의 플랫폼 예외에 한하며
  필요한 product permission 검증을 확인하고 실제 필요한 scope만 추가한다.
- 커스텀 필드 조회는 `fieldsByKeys: true`, 이슈 프로퍼티는 전용 공용 읽기·merge 경로를 따른다.
- 다건 워크로그는 기능별 페처 + `p-limit`, Resource/MM 분석은 프로젝트 단위 조회 + KVS 캐시를 따른다.
  공통 페치 변경은 영향 소비자를 확인하고 무관한 회귀를 만들지 않는다.
- 대용량 업로드는 `src/queue/consumer.js` 패턴으로 작업 ID를 반환하고 최종 결과는 폴링한다.
- 라이선스는 명시적 INACTIVE만 차단하고 UNAVAILABLE은 통과시킨다.
  License API 200인데 활성 라이선스가 없으면 INACTIVE다. 원문·민감정보를 로그로 노출하지 않는다.

## 검증과 보고

- [공통 검증 기준](../feature-harness/references/verification.md)의 필수 실행·증거 규칙을 따른다.
- 등록·응답 계약·권한 범위·SELF 소유자·SQL/KVS 경계의 변경 관련 회귀를 확인한다.
- `_workspace/<feature>/02_backend_report.md`에 수정 파일, 등록 함수, 실제 성공·실패 shape,
  내부 소비자 영향, 권한 처리, 검증 결과와 미검증 사항을 기록한다.
- 계약 변경은 설계와 소비자 작업에 반영되도록 조율한 후 인계한다.
