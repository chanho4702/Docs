---
name: forge-backend-dev
description: "Moves RMS Forge 백엔드를 구현하는 스킬. resolver/Controller/Service/Repository 계층, responseWrapper 응답 표준화, 커스텀 에러, Forge SQL(MySQL)/KVS 접근, Jira API 호출 패턴을 제공한다. backend-engineer 에이전트가 사용. 백엔드/resolver/서비스/DB 구현 시 사용."
---

# Forge Backend Dev — 백엔드 구현 패턴

설계서의 경계면 계약을 지키며 `src/index.js → Controller → Service → (Repository) → DB` 계층을 구현하는 절차.

## 구현 절차

1. 설계서(`_workspace/<feature>/01_architect_design.md`)의 경계면 계약·백엔드 설계를 읽는다
2. 도메인 디렉토리 `src/resolver/{도메인}/`에 Controller/Service/(Repository) 작성
3. resolver 함수를 `responseWrapper`로 감싼다
4. **`src/index.js`에 컨트롤러 등록 함수 호출을 추가**(빠뜨리면 함수가 동작 안 함)
5. `npm test`(루트, jest) 통과 확인
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

## 응답 표준화 (responseWrapper)

```js
// src/utils/ResponseWrapper.js
resolver.define('funcName', responseWrapper(async (req) => {
    // 성공: 반환 → { success: true, ...result } 로 직렬화
    // 실패: 커스텀 에러 throw → { success: false, error: { name, code, message, cause } }
    return { content: { items, total } }; // 설계서 계약과 정확히 일치시킬 것
}));
```
프론트는 `result.content`로 접근하므로, 계약 표의 응답 shape을 **글자 그대로** 맞춘다.

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

## Jira API

- `src/api/jira/`(`UserApi`, `IssueApi`, `WorklogApi`, `TimeTrackingApi`)
- `@forge/api`의 `requestJira()`, 표준화 `src/api/jira/util/RequestJiaJson.js`

## 성능 규칙 (지킬 것)

- 워크로그 다건 조회: **공통 페치 경로 수정 금지**. 기능별 전용 병렬 페처를 만들고 `p-limit`로 동시성 제한
- Resource/MM 분석: 프로젝트 단위 1회 페치 + KVS 캐시. Forge SQL 적재 배제

## 큐 기반 업로드

대용량 사용자 업로드는 `@forge/events` 큐 사용(`src/queue/consumer.js`). 즉시 응답에는 작업 ID만, 최종 결과는 폴링으로 전달(프론트 `JobPollingManager.jsx`).

## 체크리스트

- [ ] resolver 함수가 `responseWrapper`로 감싸짐
- [ ] 응답 shape이 설계서 계약과 정확히 일치
- [ ] `src/index.js`에 컨트롤러 등록 추가됨
- [ ] 에러는 커스텀 클래스 + ErrorCodes
- [ ] DB 저장소 선택이 올바름(MySQL vs KVS)
- [ ] `npm test` 통과, 결과를 리포트에 기록
