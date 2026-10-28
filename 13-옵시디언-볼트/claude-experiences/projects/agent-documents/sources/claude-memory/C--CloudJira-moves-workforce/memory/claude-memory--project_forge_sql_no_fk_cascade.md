---
name: project-forge-sql-no-fk-cascade
description: Forge SQL(TiDB)은 FK를 강제하지 않고 ON DELETE CASCADE도 무효 — cascade 삭제는 앱 로직 필수
metadata: 
  node_type: memory
  type: project
  originSessionId: 71a134cd-7919-4fa0-b1ff-9260a09da4bc
---

Forge SQL은 **TiDB 기반**이라 외래키(FK)를 **강제하지 않는다**. FK는 인덱스 역할만 하고 참조 무결성을 보장하지 않으며, **`ON DELETE CASCADE`도 작동하지 않는다**("DELETE operations will not be cascaded"). Atlassian 공식 권고: 참조 무결성·cascade 삭제는 **반드시 애플리케이션 로직에서** 처리하라.

**Why:** 부모 행 삭제 시 자식 테이블이 고아로 남는 증상은 FK 미강제 때문이다(FK가 강제됐다면 자식 있는 부모 삭제가 *실패*했을 것). DDL에 `ON DELETE CASCADE`를 추가하는 건 엔진이 무시하므로 효과 0 + 기존 설치본 ALTER 리스크만 추가.

**How to apply:** 부모 행을 지우는 모든 삭제 로직은 자식 → 부모 FK 안전 순서로 **앱 레벨에서 명시적 순차 DELETE**를 작성한다. Forge SQL은 트랜잭션도 미지원이므로(`@forge/sql`에 transaction/sequence export 없음), 각 DELETE를 `WHERE 부모키` 기반 멱등 쿼리로 만들어 부분 실패 시 재시도로 복구 가능하게 한다.

사례: 프로젝트 삭제 cascade 보완([[project_context]]). `deleteProjectService`가 projectusers → project_dashboard → portfolio_project_snapshot → project 순으로 순차 삭제 + `ProjectProgress:{pid}`/`ProjectCost:{pid}` KVS best-effort 무효화. 워크스페이스: `_workspace/project-delete-cascade/`.

출처: https://developer.atlassian.com/platform/forge/limits-sql/ , https://developer.atlassian.com/platform/forge/storage-reference/sql/
