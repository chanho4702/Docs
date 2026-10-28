---
name: forge-sql-select-list-subquery-rejected
description: "Forge SQL은 SELECT 목록 안의 EXISTS(… = ?) 상관 서브쿼리를 'Unknown SQL execution error'로 거부(2026-09-30 운영 실측). 바인딩은 WHERE 절의 기존 형태로, 조회를 나눠서 앱에서 합칠 것"
metadata:
  node_type: memory
  type: project
  originSessionId: 09c47656-08b2-49ec-8804-446d6dba94d0
  modified: 2026-09-30T07:54:53.087Z
---

협업 모드 판정 쿼리 `SELECT p.collab_mode, …, EXISTS(SELECT 1 FROM projectusers pu WHERE pu.project_id = p.project_id AND pu.account_id = ?) AS is_member FROM project p WHERE p.project_id = UUID_TO_BIN(?)` 이 운영(moves-rms)에서 **"Unknown SQL execution error"** 로 실패했다(2026-09-30). 컬럼 부재라면 `Unknown column '…'`이 그대로 오므로(PortfolioSnapshotRepository 전례) 이건 쿼리 형태 거부다. 테스트는 mock이라 못 잡았다([[feedback-test-fixes-wrong-assumption]]).

해결: 상태 조회(`FIND_COLLAB_STATE`)와 참여 조회(`FIND_COLLAB_MEMBERSHIP`, `WHERE project_id = UUID_TO_BIN(?) AND account_id = ? LIMIT 1`) 2개로 나눠 저장소에서 합쳤다. 두 형태 모두 이 앱에서 이미 쓰던 것.

관련: `LIMIT ?` 바인딩 불가([[project-forge-field-key-suffix]]에 기록).

**Why:** Forge SQL 프록시가 서버측 prepared statement로 넘기기 전에 문을 검사하는 듯, 바인딩 위치·서브쿼리 형태에 문서화되지 않은 제약이 있다.
**How to apply:** 새 SQL은 **이 앱에서 이미 운영 통과한 문 형태**만 쓴다(WHERE 절 바인딩, 단순 JOIN). 새로운 형태가 꼭 필요하면 배포 후 실측 항목으로 올리고, 실패 로그는 `e.cause.message`를 찍어야 이유가 보인다(SqlError.message는 쿼리·인자뿐).
