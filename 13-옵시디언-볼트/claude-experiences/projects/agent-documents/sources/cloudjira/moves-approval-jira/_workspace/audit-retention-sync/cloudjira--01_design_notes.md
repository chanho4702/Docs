# audit-retention-sync — 백엔드 설계 메모 (별도 설계 단계 없음)

작성 2026-10-11 · 기준 HEAD `01e7441` · 마지막 마이그레이션 v059 · 근거 `00_input/requirement.md`(Q131~Q135)

## 1. 테이블·마이그레이션

| 번호 | 이름 | 내용 |
|---|---|---|
| v060 | `v060_create_worklog_control_log` | 통제 판단·조치 이력(append-only). 신규 테이블이라 인덱스 인라인(v057~v059 와 같은 관례). 인덱스 전용 마이그레이션 없음 |

```sql
CREATE TABLE IF NOT EXISTS worklog_control_log (
  event_id       CHAR(36)     NOT NULL,   -- deterministicEventId('wctl:'+worklogId, action, actor, discriminator) — 불변식 6
  worklog_id     VARCHAR(20)  NOT NULL,
  issue_id       VARCHAR(20)  NOT NULL,
  project_id     VARCHAR(20)  NULL,
  author_account VARCHAR(128) NOT NULL,
  actor_account  VARCHAR(128) NULL,       -- 관리자 판단만. 앱 조치는 NULL(행위자 없음)
  action         VARCHAR(24)  NOT NULL,
  reason_code    VARCHAR(24)  NULL,       -- foreign_reason / vis_reason / 'GONE' 등 코드
  note           VARCHAR(500) NULL,       -- 관리자가 입력한 사유(사람 입력 원문 — 로그에 남기지 않는다)
  detail_json    VARCHAR(255) NULL,       -- {fp(참고 사본 지문), gen, from}
  wf_linked      TINYINT(1)   NULL,       -- 기록 당시 통제 행 linked
  occurred_at    TIMESTAMP    NOT NULL,
  PRIMARY KEY (event_id),
  INDEX ix_wctlog_occurred (occurred_at, event_id),
  INDEX ix_wctlog_worklog (worklog_id, occurred_at)
)
```
- 이 테이블에 UPDATE 문은 없다. DELETE 는 보관 정리(내보내기 확정 범위) 하나뿐(계약 테스트).
- 행 크기 ≈ 200B. 다른 경로 입력이 드문 사이트에서 연 수천 행 수준.

기존 테이블 칼럼 변경 없음. `worklog_history` 일반/연결 구분은 기존 `wf_linked`(v052) 로 한다.

## 2. 통제 이력 기록 지점 (R1)

`WorklogControlRepository.change()`·`insertIgnore()` 성공 직후 순수 함수 `controlEventsOf({before, patch, audit})` 가
전이를 분류 → `WorklogControlJournal.append()`(INSERT IGNORE, 실패는 삼킨다 — 트리거 규칙). 관리자 판단은 서비스가
`audit:{actorId, note}` 를 넘기고 기록 실패를 `WORKLOG_CONTROL_STORAGE` 로 올린다(사유가 남지 않은 판단을 성공으로 답하지 않는다 — 재시도는 같은 상태 재기록).

| action | 전이 | actor |
|---|---|---|
| `FOREIGN_FLAGGED` | foreign → FLAGGED (null·RECHECK·CLEARED 에서) | — |
| `DELETE_SCHEDULED` | → DELETE_PENDING | — |
| `DELETE_DOWNGRADED` | DELETE_PENDING·DELETING·UNKNOWN → FLAGGED (reason CHANGED·CAP·…) | — |
| `FOREIGN_DELETED` | → DELETED (detail.fp = 참고 사본 지문) | — |
| `FOREIGN_GONE` | → CLEARED (앱, 삭제 전 사라짐) | — |
| `FOREIGN_CLEARED` | → CLEARED (관리자 해제, 사유 필수) | 관리자 |
| `FOREIGN_ACKNOWLEDGED` | 상태 변경 없음(관리자 확인, 사유 필수) | 관리자 |
| `HIDE_APPLIED` | vis → RESTRICTED (reason LINKED·APPROVED·CERTIFIED) | — |
| `HIDE_RELEASED` | vis → RELEASED | — |
| `HIDE_RELEASE_SKIPPED` | vis → RELEASED_FOREIGN | — |

결정적 id discriminator: change = `{createdAt}:{rev+1}`, insert = `ins:{createdAt}`, 확인 = `ack:{rev}:{sha(note)}`.
통제 스위치·관문은 이미 `approval_settings_audit`(area `worklogControl`)에 있다 → 이력에 다시 쓰지 않고 화면이 링크.

## 3. resolver 계약

공통 `{success:true, content}`. 신규·변경 전부 `{admin:true}`.

| resolver | 신규/변경 | 입력 | 응답(content) | 에러 |
|---|---|---|---|---|
| `clearForeignWorklog` | 변경 | `{worklogId, reason}` reason 1~500자 필수 | `{worklogId, state:'CLEARED', eventId}` | `INVALID_TARGET{field:'reason'}`, 기존 + `WORKLOG_CONTROL_STORAGE` |
| `acknowledgeForeignWorklog` | 신규 | `{worklogId, reason}` | `{worklogId, state, eventId, acknowledgedAt}` | `INVALID_TARGET{field:'reason'}`, `WORKLOG_NOT_FOUND`, `STORAGE_NOT_READY`, `WORKLOG_CONTROL_STORAGE` |
| `listForeignWorklogs` | 가산 | — | items[].`review: {action, at, by, note}|null` | — |
| `listWorklogHistory` | 가산 | `includeControl?:boolean`, `controlActions?:ControlAction[]` | items[].`rowType:'HISTORY'|'CONTROL'`, CONTROL 행 shape §보고서. includeControl 이면 cursor 는 합성 불투명 문자열 | `INVALID_TARGET{field}` |
| `getRecordRetentionOverview` | 신규 | `{}` | `{kinds: RecordRetentionSummary[]}` | — |
| `exportExpiredRecords` | 신규 | `{kind, sessionId?, cursor?, cutoff?}` | kind 별 페이지 + `{sessionId, cutoff, nextCursor}` | `INVALID_TARGET{field:'kind'|'cursor'}`, `RETENTION_EXPORT_REQUIRED`, `STORAGE_NOT_READY` |
| `confirmRecordExport` | 신규 | `{kind, sessionId}` | `RecordRetentionSummary` | `RETENTION_EXPORT_REQUIRED` |
| `purgeExportedRecords` | 신규 | `{kind}` | `{deleted, remaining}` | `RETENTION_EXPORT_REQUIRED`, `STORAGE_NOT_READY` |
| `downloadRecords` | 신규 | `{kind, from, to, cursor?}` | kind 별 페이지(세션 없음) + `{nextCursor}` | `INVALID_TARGET{field}` |

kind = `APPROVAL` · `WORKLOG_HISTORY`(일반 = wf_linked 아님) · `WORKLOG_HISTORY_LINKED` · `CERTIFICATION`(묶음 단위) · `CONTROL_LOG`.
기존 결재·이력 보관 resolver 9개는 그대로(이력 4개는 이제 일반분만 다룬다 — R2).

## 4. 정책 키 (SettingsRepository 세 곳 + SettingsService 정규화기)

| 키 | 기본 | 선택지 | 비고 |
|---|---|---|---|
| `worklogHistoryLinkedRetentionMonths` | 36 | 0·12·24·36·60 (0=무기한) | 연결 판정 = 행의 `wf_linked=1`(기록 당시) |
| `certificationRetentionYears` | 0 | 0·3·5·7·10 | 1년 없음 — 작년 문서 재게시 범위(올해·작년)와 겹치면 원가가 바뀐다 |
| `worklogControlLogRetentionYears` | 0 | 0·1·3·5·7·10 | |

GLOBAL_ONLY. 기존 `worklogHistoryRetentionMonths`(12) 는 일반분.

## 5. 보관 일반화 (R3)

- `ExportSessionRepository` 무변경 재사용(kind 칼럼 VARCHAR(32)). 새 kind: `WORKLOG_HISTORY_LINKED`·`CERTIFICATION`·`CONTROL_LOG`.
- 이력: `WorklogHistoryRetentionService` 를 변형 인자(`linked:false|true`)로 두 인스턴스. 리포지토리 `countExpired·pageExpired·findExpiredByIds` 에 `linked` 술어. 칼럼 미준비면 일반 = 전부, 연결 = 없음.
  옛 일반 세션의 연결 행은 술어로 SKIPPED(연결분이 일반 기간으로 지워지지 않는다).
- 인증: 기록 단위 = 묶음(batch). 지문 = {batch, 그 묶음의 현재본 행, 그 묶음의 덮인 판}. 삭제 순서 log → cert(현재본이 그 묶음인 것) → batch(마지막, 재개 가능).
  게시 문서는 건드리지 않는다(재게시하면 과거 원가가 바뀐다).
- 통제 이력: 기록 단위 = 이벤트. 불변 행이라 지문은 행 그대로.
- 내려받기 전용(`downloadRecords`): 세션 없이 기간 [from,to) 키셋. 항목 모양은 그 kind 의 내보내기와 같다(같은 가림 규칙).
- 개요: 조회 시점 계산(COUNT). 스윕·스케줄 없음 → 유휴 SQL 0.

## 6. 인증 즉시 게시 (R4) — 큐 디바운스

```
touchCert(items, now)            // 기존 아웃박스 행 upsert(사용자×월 합쳐짐)
  └ certWake.wake(now)           // 던지지 않는다
       정책 workforceLinkEnabled=false → 끝 (KVS)
       서명 불가·키 없음 → 끝 (환경)
       KVS approval:workforce:certWake.until > now → 끝 (디바운스: 이미 예약된 작업이 이 touch 를 가져간다)
       repository.ready + hasAnyVerifiedInbound (SQL ≤1) — 미연결이면 끝(NOT_LINKED)
       push {job:'workforce-cert', delayInSeconds:45} → KVS until = now+45s
큐 consumer 'workforce-cert' → WorkforcePublisher.publishCertNow
       gate → PUBLISH_JOB 리스(일일 tick 과 배타) → 인증 문서 행만 배출(listDueCert) → 리스 해제
```
- 일일 목록(DAILY_JOBS)에 넣지 않는다 → 유휴 SQL 불변(27·38). 새 scheduledTrigger 0.
- 지연 큐(45초) 동안 같은 사용자×월 재인증은 아웃박스 행 하나로 합쳐 1회 PUT. 작업 시작 뒤 온 touch 는 until 이 지나 새 작업을 넣는다.

## 7. 계약 변경 (R5) — 바이트 계산

- `w` 항목은 그대로(2~3원소). 삭제 비트(2) 항목의 원래 이슈 id 는 **새 최상위 키 `di`**: `{"<worklogId>":"<issueId>"}`.
  튜플 4번째 원소가 바이트는 절반이지만, 옛 검증자(`item.length === 2||3`)가 문서 전체를 거부한다. `di` 는 옛 검증자가 "모르는 키"로 무시하므로
  두 리포 배포 순서와 무관하게 서명 검증이 산다.
- 최악(id 10자리·1,000건 전부 삭제·flag 6·초 5자리): w 23,000B + di 26,000B + 고정부 ≈ 49.6KB > 30,000 → **바이트 예산으로 w 를 자른다.**
  규칙: id 오름차순으로 넣다가 문서 전체가 `CERT_DOC_BYTE_BUDGET`(30,000 − 계정 id 128자·kid 최대 길이를 가정한 봉투) 를 넘기 직전에서 멈춤 + `wt:true`.
  `cs`·`cn`·`dn` 등 합계는 전체 기준 그대로. di 는 w 에 남은 삭제 항목만. 실제 수치는 보고서(테스트로 고정).
- validator: `di` 선택. 객체, 키·값 NUMERIC_ID, 키는 w 의 삭제 비트 항목에만, 개수 ≤ CERT_LIST_MAX.
- `contract.js` 도메인 import 제거: `parsePeriodKey` → 같은 규칙의 지역 함수 `isPeriodKey`, `normalizeOverride(b.values).ok` → 형태 검사(`values` 객체·원시값).
  정책 값 의미 검증은 수신 경로 `verifyPolicyEnvelope`(이미 `normalizeOverride` 를 한다)에 남아 있다. 워크포스 복사 대상 9 → 7.
- `vectors.json`: 인증 문서 벡터 1건 추가(삭제 항목 + di). 기존 벡터는 그대로(옛 문서도 검증돼야 한다).

## 8. ctx.linked 분리 (R6)

`contextFor` → `linked`(통제 연동: 판정된 연동만) / `windowLinked`(창 판정: 연동 ∨ 불명∧창ON). judgeCreate·judgeMutation 은 `windowLinked`,
`beginCreate`·`finishCreate` 의 strict 와 통제 행 `linked` 는 `linked`. `controlView` 는 `linked`(통제) + `linkUnavailable` 가산, `dateWindow` 는 `windowLinked` 기준.
