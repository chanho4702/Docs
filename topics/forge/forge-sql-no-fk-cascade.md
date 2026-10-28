---
tags: [topic, forge, forge-sql, tidb, database, cascade]
created: 2026-06-29
updated: 2026-06-29
---

# Forge SQL — FK 미강제 · ON DELETE CASCADE 무작동 · 트랜잭션 부재

> Forge SQL은 **TiDB 기반**이다. MySQL 문법을 받지만 일반 MySQL이 보장하는 몇 가지를 **안 한다**. DB가 대신 해줄 거라 믿고 짠 삭제/정리 로직이 조용히 깨진다.

## 안 되는 것 (공식 확인)

1. **외래키(FK) 미강제** — FK를 정의해도 **인덱스 역할만** 하고 참조 무결성을 강제하지 않는다. 존재하지 않는 부모 키를 자식에 넣어도 막지 않으며(→ JOIN 결과가 비는 형태로 드러남), 부모 행을 지워도 자식이 막지 않는다.
2. **`ON DELETE CASCADE` 무작동** — "DELETE operations will not be cascaded". DDL에 cascade를 적어도 엔진이 무시한다.
3. **트랜잭션/시퀀스 실행 미지원** — `@forge/sql`의 `SqlClient`는 `prepare().bindParams().execute()` / `executeRaw` / `executeDDL`만 노출. `startTransaction`·`executeSequence`·`begin/commit` 류 export 없음(타입 정의 직접 확인). 멀티 statement(`;` 결합)도 거부.

출처: [Forge SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/) · [Forge SQL storage reference](https://developer.atlassian.com/platform/forge/storage-reference/sql/)

## 그래서 이렇게 한다

- **참조 무결성·cascade 삭제는 애플리케이션 로직으로.** 부모를 지우는 모든 경로에서 **자식 → 부모 FK 안전 순서**로 명시적 순차 DELETE를 작성한다. FK 없는 파생 테이블(스냅샷 등)도 빠뜨리지 말 것 — DDL을 전수 grep해 `project_id`/`REFERENCES <부모>` 참조 테이블을 모두 찾는다.
- **트랜잭션이 없으니 멱등으로 보완.** 각 DELETE를 `WHERE <부모키> = ?` 기반으로 만들면 부분 실패 후 재실행해도 0행 영향(무해)이라 **재시도로 완전 복구**되고, 자식을 먼저 지우는 순서 자체가 "부모 없는 자식(FK 고아)"을 원천 차단하는 안전장치가 된다.
- **best-effort 후처리는 try/catch로 격리.** KVS 캐시 무효화 등 부가 단계는 실패해도 본 흐름(이미 성공한 SQL 삭제)을 깨지 않게 감싸고 경고 로그만 남긴다(KVS는 TTL이 백업).

## 진단 신호

부모를 지웠는데 **삭제가 실패가 아니라 "성공했는데 자식 행/스냅샷이 남는"** 증상이면 → FK 미강제가 거의 확정. (FK가 강제되는 일반 MySQL이었다면 RESTRICT로 *삭제 자체가 실패*했을 것.) 증상의 방향이 엔진 동작을 역으로 알려준다.

## 사례
- [[2026-06-29-delete-cascade-gantt]] — 프로젝트 삭제 cascade 보완(projectusers·project_dashboard·portfolio_project_snapshot·project 순차 + 멱등 + KVS best-effort 무효화).

## 관련
- [[forge-migration-lifecycle]] — Forge SQL 스키마 마이그레이션 생명주기(onInstall 선행·upgraded:app)
- [[moves-workforce]] — 이 패턴이 적용된 Forge 앱
