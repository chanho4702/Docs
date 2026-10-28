---
name: forge-backend-dev
description: "moves-approval-jira 백엔드 구현 규약 — 순수 도메인, resolver 3단계 등록, Forge SQL 마이그레이션·CAS Repository·SqlTime, Jira REST(asUser 기본, route 인코딩), 워크로그 트리거·스윕, manifest. backend-engineer 가 도메인·resolver·DB·트리거·Jira 호출을 구현·수정할 때 반드시 사용. '백엔드만 다시', 테스트 실패 수정에도 사용."
---

# Forge Backend Dev — 이 리포의 백엔드 규약

Jira REST·모듈 세부는 `references/jira-platform.md` 를 필요할 때 읽는다.

## 계층

```
src/domain/**           순수 함수. SQL·fetch·Date.now() 금지. __test__ 에 단위 테스트
src/resolver/<도메인>/   XxxController(guardedDefine) · XxxService(조립·부작용) · XxxRepository(SQL)
src/api/jira/           Jira REST 단일 지점 (asUser 기본)
src/trigger/            얇은 어댑터 — 서비스로 위임, 절대 throw 하지 않음
src/rdb/schema/         ddl/*.sql.js + migrate.js (enqueue 순서 = 적용 순서)
```

## resolver 3단계 (하나라도 빠지면 런타임에서만 죽는다)

1. Controller: `guardedDefine(resolver, 'fnName', handler)` — 권한 가드 + 응답 래핑을 함께 한다. `resolver.define` 을 직접 쓰지 않는다.
2. `src/permission/PermissionMap.js` 에 권한 축 선언 (미선언 = `PERMISSION_UNMAPPED`)
3. `src/index.js` `CONTROLLER_REGISTRARS` 에 등록
→ `test/permission/permissionMap.contract.test.js` 가 대조한다. 새 resolver 를 넣었으면 이 테스트가 통과해야 한다.

`SELF` mutation 은 `context.accountId` 를 SQL 의 소유자 조건까지 내려보낸다. 클라이언트가 보낸 accountId 를 믿지 않는다.

## 도메인

- `now`, 타임존, 정책은 인자. 기간 키(`2026-10`, `2026-W40`)는 사용자 타임존 기준으로 계산하는 순수 함수다.
- 입력을 in-place 로 바꾸지 않는다. 결과는 `changes` 같은 계약 객체로 돌려 Repository 가 바인딩만 하게 한다(`src/domain/approval/transitions.js` 참조).
- 감사 이벤트 id 는 `deterministicEventId` 로 만든다. 재시도에도 같은 id.

## SQL (Forge SQL = TiDB)

- 트랜잭션·FK 없음, 문장당 단일 쿼리. 동시성은 CAS: `UPDATE … SET …, rev = rev + 1 WHERE id=? AND rev=?` → affectedRows 0 이면 재로드·재계산·재시도.
- 남의 결정 보호: 결재자 행은 `WHERE decision_type='PENDING'` 조건부 UPDATE. 삭제-재삽입 금지.
- 열린 요청 하나: `dedupe_key` UNIQUE(`open:<scopeKey>`), 종료 시 `closed:<requestId>` 로 비켜 준다.
- 시각 컬럼은 `SqlTime` 으로 문자열 변환해 바인딩한다(TiDB 는 숫자→TIMESTAMP 변환 불가).
- `ON DUPLICATE KEY UPDATE` 는 갱신 시 affectedRows 2.
- 새 테이블을 읽기 전 `isTableReady()` 프로브. `whereIn` 에 빈 배열이 가는 경로는 가드(빈 배열 = 결과 없음, fail-open 금지).
- 마이그레이션: `vNNN_create_*` / `vNNN_alter_*`(`ADD COLUMN IF NOT EXISTS`). 번호는 기존 최댓값 다음.

## Jira 호출

- `src/api/jira/RequestJira.js` 하나로 모은다(Confluence 판 `RequestConfluence.js` 구조를 그대로 따른다). 기본은 `asUser()`. `asApp()` 은 사유 인자를 받고 `AGENTS.md` 허용 목록 안에서만.
- `route` 는 보간값을 인코딩한다 — 쿼리스트링을 통째로 보간하지 말고 키·값을 각각 보간하거나 strings 배열을 만든다.
- 에러 본문을 message 에 싣지 않는다(이슈·워크로그 내용이 로그로 샌다). 상태 코드만.
- 다건은 일괄 API: 워크로그 `POST /rest/api/3/worklog/list`, 권한 `POST /rest/api/3/permissions/check`, 이슈 검색 `POST /rest/api/3/search/jql`. 남은 병렬은 동시성 상한을 둔다.

## 트리거·스윕

- 트리거는 throw 하지 않는다. 실패는 다음 스윕이 메운다(재시도 중복 알림 방지).
- 라이선스로 트리거를 막지 않는다. 알림 생성만 막는다.
- 스윕은 예산(시간·호출 수)을 두고, 못 끝내면 커서를 남긴다. 끝까지 못 갔으면 watermark 를 전진시키지 않는다. 주기는 하루 1회가 기본(비용 결정, Confluence 판 2026-10-03).

## 에러

`src/error/` 클래스(LogicalError·PermissionError·ConcurrencyError·SqlError·…)를 throw, 코드는 `src/utils/errors/ErrorCodes.js`. 새 코드는 `locales/{kr,en}/error.json` 에도 같은 키로 추가한다(frontend 담당이지만 누락되면 보고서에 적는다).

## 검증

```
npm run merge
npm test -- --runInBand
```
`forge lint`·`forge deploy` 는 실행하지 않는다(리더 몫). 보고서에 실제 응답 shape 을 코드 그대로 적는다.
