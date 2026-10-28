# T1 — Forge SQL 스키마 v002~v007

## 배경

Confluence DC 승인 앱을 Forge(Cloud)로 옮기는 프로젝트다. 이 저장소는 이미 골격이 서 있고,
`approval_job_state` 한 테이블(v001)만 만들어져 있다. 나머지 6개 테이블을 추가한다.

**반드시 먼저 읽을 것**: 저장소 루트의 `CLAUDE.md`(아키텍처·불변식·플랫폼 함정)와 `AGENTS.md`(작업 규칙).
기존 `src/rdb/schema/ddl/approvalJobState.sql.js`와 `src/rdb/schema/migrate.js`의 형식을 그대로 따른다.

## 건드릴 파일 (이 목록 밖의 파일은 수정하지 말 것)

```
src/rdb/schema/ddl/approvalRequest.sql.js       (신규)
src/rdb/schema/ddl/approvalApprover.sql.js      (신규)
src/rdb/schema/ddl/approvalEvent.sql.js         (신규)
src/rdb/schema/ddl/approvalInbox.sql.js         (신규)
src/rdb/schema/ddl/approvalNotification.sql.js  (신규)
src/rdb/schema/ddl/approvalSpaceConfig.sql.js   (신규)
src/rdb/schema/ddl/index.js                     (re-export 추가)
src/rdb/schema/migrate.js                       (enqueue 추가)
src/rdb/schema/__test__/migrate.test.js         (신규)
```

## Forge SQL 제약 (어기면 배포가 죽는다)

- TiDB(MySQL 호환). **트랜잭션 없음. FK 없음(ON DELETE CASCADE 무효). 문장당 단일 쿼리만.**
- 테이블 최대 200개, prod 1GiB, 행 최대 6MiB, DDL 타임아웃 20초.
- **CREATE TABLE 1개 = `enqueue` 항목 1개.** 인덱스는 CREATE 안에 인라인으로 선언한다.
- `enqueue` 이름은 실행 여부 판정 키다. **배포 후 절대 변경 금지.** v001은 이미 배포됐으니 건드리지 말 것.
- 컬럼 추가는 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 별도 `vNNN_alter_*` 항목(멱등).

## 스키마

### v002 `approval_request` — aggregate 루트 + 파생 캐시

| 컬럼 | 타입 | 비고 |
|---|---|---|
| request_id | BINARY(16) | **PK** |
| commit_state | VARCHAR(8) NOT NULL DEFAULT 'DRAFT' | `DRAFT`\|`LIVE`\|`DEAD` — 생성 원자성의 커밋 지점 |
| resource_type | VARCHAR(16) NOT NULL | `PAGE`\|`CONTENT_REGION` |
| page_id | VARCHAR(64) NOT NULL | **Cloud content id는 문자열이다. bigint 쓰지 말 것** |
| region_id | VARCHAR(255) NULL | |
| region_hash | VARCHAR(80) NULL | `v2:` + sha256 hex |
| dedupe_key | VARCHAR(200) NOT NULL | **UNIQUE** |
| content_version | INT NOT NULL | |
| revision | INT NOT NULL | |
| minimum_approvals | INT NOT NULL | 표시·임포트용 파생값. **판정에 읽지 않는다** |
| step_count | INT NOT NULL | |
| status | VARCHAR(12) NOT NULL | |
| is_open | TINYINT(1) NOT NULL | = (status='PENDING') |
| current_step_order | INT NOT NULL DEFAULT 1 | 종료 시 step_count+1 |
| current_step_opened_at | TIMESTAMP NOT NULL | 독촉 타이머 기준 |
| expires_at | TIMESTAMP NULL | |
| created_at / updated_at | TIMESTAMP NOT NULL | |
| requester_key | VARCHAR(128) NULL | accountId |
| request_message | VARCHAR(500) NULL | |
| flow_id | VARCHAR(64) NULL | 2단계용, 지금 만든다 |
| prev_request_id | BINARY(16) NULL | 재승인 링크 |
| space_key | VARCHAR(255) NOT NULL | 비정규화 |
| page_title | VARCHAR(255) NOT NULL | 비정규화 스냅샷 |
| rev | INT NOT NULL DEFAULT 1 | **낙관적 락 버전** |
| deleted_at | TIMESTAMP NULL | soft delete |

인덱스: `UNIQUE(dedupe_key)` / `(is_open, expires_at)` / `(requester_key, is_open, updated_at)` /
`(page_id, resource_type, region_id)` / `(commit_state, created_at)`

`dedupe_key`가 하는 일: 열린 요청은 `open:<scopeKey>`, 종료되면 `closed:<uuid>`로 바꾼다.
**Forge에는 락이 없어서 이 UNIQUE 제약이 "대상당 열린 요청 하나"의 유일한 방어선이다.**

### v003 `approval_approver` — 결재선 + 결정 (진실의 원천)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| request_id | BINARY(16) | **PK(1)** |
| step_order | INT NOT NULL | **PK(2)** — 항상 ≥1 |
| actor_key | VARCHAR(128) NOT NULL | **PK(3)** |
| step_required | INT NOT NULL | 항상 ≥1 |
| decision_type | VARCHAR(8) NOT NULL DEFAULT 'PENDING' | `PENDING`\|`APPROVE`\|`REJECT` |
| decided_at | TIMESTAMP NULL | |
| via_group | VARCHAR(255) NULL | 요청 시점 그룹 스냅샷. **2단계 기능이지만 지금 만든다 — 사후 복원 불가** |

`PRIMARY KEY (request_id, step_order, actor_key)` + `INDEX (actor_key, decision_type)`

이 PK가 곧 불변식이다: 승인자 행을 삭제-재삽입하지 않고 조건부 UPDATE로만 바꾸므로
동시 저장에도 남의 결정이 유실되지 않는다.

### v004 `approval_event` — append-only 감사

request_id BINARY(16) NOT NULL, event_id BINARY(16) **PK**, event_type VARCHAR(16) NOT NULL,
actor_key VARCHAR(128) NULL(결재선 주인), delegate_key VARCHAR(128) NULL(실제 클릭자),
occurred_at TIMESTAMP NOT NULL, reason VARCHAR(1000) NULL(**TEXT 아님**), content_version INT NULL.
`INDEX (request_id, occurred_at)`

### v005 `approval_inbox` — 업무함 투영

| 컬럼 | 타입 |
|---|---|
| actor_key | VARCHAR(128) **PK(1)** |
| request_id | BINARY(16) **PK(2)** |
| role | VARCHAR(12) **PK(3)** — `APPROVER`\|`REQUESTER`\|`CC`\|`DELEGATE` |
| step_order | INT NULL |
| my_turn / my_decided / acted_by_me | TINYINT(1) NOT NULL DEFAULT 0 |
| is_open | TINYINT(1) NOT NULL / status VARCHAR(12) NOT NULL |
| current_step_order | INT NOT NULL DEFAULT 1 |
| space_key VARCHAR(255) / page_id VARCHAR(64) / title_norm VARCHAR(120) | 미러·검색용 |
| requester_key VARCHAR(128) NULL / flow_id VARCHAR(64) NULL | |
| created_at / updated_at TIMESTAMP NOT NULL / expires_at TIMESTAMP NULL | |
| req_rev | INT NOT NULL — 정합성 리컨실 키 |

인덱스:
- `PRIMARY KEY (actor_key, request_id, role)`
- `INDEX ix_inbox_open (actor_key, role, is_open, updated_at, request_id)`
- `INDEX ix_inbox_turn (actor_key, my_turn, is_open, updated_at, request_id)`
- `INDEX ix_inbox_due (actor_key, is_open, expires_at)`
- `INDEX ix_inbox_recon (request_id, req_rev)`

**`role`을 PK에 넣는 이유**: CC/DELEGATE 행은 2단계에 생기지만, 나중에 PK를 바꾸려면
테이블을 재생성해야 한다. 값 도메인만 미리 예약해 둔다.

### v006 `approval_notification` — 앱 내 알림함

notification_id BINARY(16) **PK**, event_key VARCHAR(160) NOT NULL(**UUID뿐 아니라
`due-soon:<id>:<ms>` 같은 합성 키가 온다**), request_id BINARY(16) NOT NULL,
recipient_key VARCHAR(128) NOT NULL, channel VARCHAR(12) NOT NULL DEFAULT 'IN_APP',
kind VARCHAR(16) NOT NULL, created_at TIMESTAMP NOT NULL, read_at TIMESTAMP NULL.

- `UNIQUE uq_notif (event_key, recipient_key, channel)` ← 알림 중복을 제약으로 막는다(DC의 알려진 구멍)
- `INDEX (recipient_key, read_at, created_at)`
- `INDEX (created_at)`

**status/attempts/next_attempt_at/last_error/sent_at은 만들지 않는다.** 이메일 발송이 없어
재시도 상태기계가 통째로 불필요하다. `channel`은 UNIQUE에 참여하므로 지금 넣는다.

### v007 `approval_space_config`

space_key VARCHAR(255) **PK**, enabled TINYINT(1) NOT NULL DEFAULT 1,
updated_at TIMESTAMP NOT NULL, updated_by VARCHAR(128) NULL.

목록형 설정을 KVS에 두지 않는 이유: KVS `findAll()`은 100건 하드캡이라 스페이스가 100개를
넘는 사이트에서 **조용히 잘린다**.

## 테스트 (`src/rdb/schema/__test__/migrate.test.js`)

`@forge/sql`의 `migrationRunner`를 목으로 만들어 아래를 단언한다:

1. enqueue 이름이 `v001`~`v007` 순서로 빠짐없이 등록된다
2. **enqueue 이름에 중복이 없다** (이름이 실행 판정 키이므로 중복은 치명적)
3. 각 DDL 문자열에 세미콜론으로 구분된 복수 문장이 없다 (문장당 단일 쿼리 제약)
4. 모든 DDL이 `CREATE TABLE IF NOT EXISTS` 또는 `ALTER TABLE ... IF NOT EXISTS`로 시작한다(멱등)
5. `approval_request` DDL에 `UNIQUE` 제약과 `dedupe_key`가 들어 있다
6. `approval_notification` DDL에 `(event_key, recipient_key, channel)` UNIQUE가 들어 있다

## 완료 기준

- `npx jest --runInBand` 통과 (기존 31건 + 신규)
- `npx forge lint` 통과
- 기존 파일 중 `migrate.js`와 `ddl/index.js` 외에는 수정하지 않았을 것
