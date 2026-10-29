---
name: forge-backend-dev
description: "Moves RMS Forge 백엔드를 구현하는 스킬. resolver/Controller/Service/Repository 계층, guardedDefine 권한 가드 + 응답 표준화, PermissionMap 등록, 커스텀 에러, Forge SQL(MySQL)/KVS 접근, Jira API 호출 패턴을 제공한다. backend-engineer 에이전트가 사용. 백엔드/resolver/서비스/DB 구현 시 사용."
---

# Forge Backend Dev — 백엔드 구현 패턴

설계서의 경계면 계약을 지키며 `src/index.js → Controller → Service → (Repository) → DB` 계층을 구현하는 절차.

## 구현 절차

1. 설계서(`_workspace/<feature>/01_architect_design.md`)의 경계면 계약·백엔드 설계를 읽는다
2. 도메인 디렉토리 `src/resolver/{도메인}/`에 Controller/Service/(Repository) 작성
3. resolver 함수를 **`guardedDefine`**으로 등록한다(아래 참조)
4. **`src/permission/PermissionMap.js`에 함수를 등록**한다 — 미선언은 원천 거부(deny-by-default)라 빠뜨리면 런타임에서 `PERMISSION_UNMAPPED`로 죽는다
5. **`src/index.js`의 `CONTROLLER_REGISTRARS` 배열에 등록 함수를 추가**(빠뜨리면 함수가 동작 안 함). 권한 계약 테스트가 이 배열을 import 하므로 목록을 두 곳에 복제하지 않는다
6. `npm test`(루트, jest) 통과 확인
6. `_workspace/<feature>/02_backend_report.md`에 구현 함수 + 실제 응답 shape 기록 → frontend-engineer에 통지

## 계층 패턴

```
src/resolver/{도메인}/
  XxxController.js   // registerXxxController(resolver) export — resolver.define 등록
  XxxService.js      // 비즈니스 로직
  XxxRepository.js   // DB 접근 (선택, 없으면 Service에서 src/rdb/query/ 직접 사용)
```
- 일부 도메인은 `.jsx` 확장자(`myWork`, `mySchedule`)
- 등록 함수 네이밍 비일관 주의: 대부분 `registerXxxController`, 단 `projectStatusController`, Sentry는 `SentryConfig`

## 등록 + 응답 표준화 (guardedDefine)

`guardedDefine`이 권한 가드와 `responseWrapper`를 함께 흡수한다.
**`resolver.define` + `responseWrapper` 조합은 신규 코드에서 쓰지 않는다.**

```js
// src/permission/permissionGuard.js
import { guardedDefine } from '../../permission/permissionGuard';

export function registerXxxController(resolver) {
    guardedDefine(resolver, 'funcName', ({ payload }) => xxxService(payload));

    // 가드 통과 후 principal 이 부착된다 — 범위를 좁혀야 하는 함수는 반드시 넘긴다
    guardedDefine(resolver, 'listPeople', ({ payload, principal }) =>
        listPeopleService(payload, principal));
}
```
- 성공: 반환 → `{ success: true, ...result }` / 실패: 커스텀 에러 throw → `{ success: false, error }`
- 프론트는 `result.content`로 접근하므로 계약 표의 응답 shape을 **글자 그대로** 맞춘다

## 권한 — 가드 통과는 데이터 범위 확정이 아니다

가드는 "이 함수를 부를 수 있나"만 본다. **재무·인사 데이터를 내주면 응답 내용을 따로 좁혀야 한다.**

- 급여·원가: 급여 정책(`SalaryVisibility`)과 **별개로** `CostAccess.canReadCost(principal)`를 함께 요구
- 인력 명부: `TeamAnalyticsScope.resolveTeamAnalyticsScope(principal)` 단일 출처
- **같은 데이터를 내주는 형제 resolver를 전부 찾아 같은 판정을 통과시킨다** — 한 화면만 막으면 우회된다
- 읽기에만 있고 쓰기에 없는 검증을 조심. 검증은 **공용 함수로 뽑아** 두 경로가 같은 것을 보게 한다
- `principal` 누락은 **fail-close** — 컨트롤러가 전달을 빠뜨려도 조용히 열리지 않아야 한다

## 에러 처리

- 커스텀 에러 클래스: `src/error/`(`CustomEntityError`, `ForgeAPIError`, `LogicalError`, `SqlError`)
- 에러 코드: `src/utils/errors/ErrorCodes.js`
- 이 에러를 throw하면 responseWrapper가 `{ success:false, error }`로 직렬화

## DB 접근

| 대상 | 방법 |
|------|------|
| MySQL | `src/rdb/query/`의 Query 클래스(`ProjectQuery`, `UserQuery`, `ProjectUsersQuery`, `ProjectDashboard`, `UserSchedule`, `CommonQuery`), 조립 `QueryBuilder.js` |
| KVS | `src/nosql/query/CustomEntityManager.js` |
| 스키마/마이그레이션 | `src/rdb/schema/`(`ddl/`, `migrate.js`, `isDBReady.js`) |

**KVS 함정**
- `findAll()`은 **100건 하드캡**이고 커서를 버려 초과분이 **조용히** 잘린다. 전량이 필요하면 `findAllPaged(indexName, pageLimit, maxItems)`를 쓰고, 목록 조회와 이름 중복 판정은 **같은 상한 상수를 공유**한다(갈리면 "목록엔 없는데 저장은 거부"가 생긴다)
- 빈 문자열 저장을 거부한다 — 선택 필드는 `|| ''` 대신 속성 자체를 생략
- 새 속성을 추가하면 `manifest.yml` attributes 선언을 먼저 바꾸고 `forge deploy`(아니면 422)
- Forge SQL(TiDB)은 FK·CASCADE·트랜잭션 미지원 → cascade 삭제는 앱 레벨 순차 멱등 DELETE

## Jira API

- `src/api/jira/`(`UserApi`, `IssueApi`, `WorklogApi`, `TimeTrackingApi`)
- `@forge/api`의 `requestJira()`, 표준화 `src/api/jira/util/RequestJiaJson.js`

## 성능 규칙 (지킬 것)

- 워크로그 다건 조회: **공통 페치 경로 수정 금지**. 기능별 전용 병렬 페처를 만들고 `p-limit`로 동시성 제한
- Resource/MM 분석: 프로젝트 단위 1회 페치 + KVS 캐시. Forge SQL 적재 배제

## 큐 기반 업로드

대용량 사용자 업로드는 `@forge/events` 큐 사용(`src/queue/consumer.js`). 즉시 응답에는 작업 ID만, 최종 결과는 폴링으로 전달(프론트 `JobPollingManager.jsx`).

## 체크리스트

- [ ] resolver 함수가 `guardedDefine`으로 등록됨 (`resolver.define`+`responseWrapper` 조합 아님)
- [ ] **`PermissionMap.js`에 등록됨** — 빠뜨리면 런타임 `PERMISSION_UNMAPPED`
- [ ] 응답 shape이 설계서 계약과 정확히 일치
- [ ] `src/index.js`의 `CONTROLLER_REGISTRARS` 배열에 추가됨
- [ ] 재무·인사 데이터를 내주면 `principal`을 서비스까지 전달해 범위를 좁혔고, **같은 데이터를 내주는 형제 resolver도 함께** 좁혔음
- [ ] 에러는 커스텀 클래스 + ErrorCodes
- [ ] DB 저장소 선택이 올바름(MySQL vs KVS). 전량 조회에 `findAll()`(100건 캡)을 쓰지 않았음
- [ ] `npm test` 통과, 결과를 리포트에 기록
