# audit-retention-sync — 백엔드 보고서 (1회차)

작성 2026-10-11 · 기준 HEAD `01e7441` · 설계 메모 `01_design_notes.md`
검증: `npx jest --runInBand` **142 suites / 2,185 tests 통과**(착수 전 135 / 2,069) · `forge lint` **No issues found** · 커밋·배포 안 함.
설계와 불변식의 충돌 없음.

## 1. 마이그레이션

| 번호 | 이름 | 내용 |
|---|---|---|
| v060 | `v060_create_worklog_control_log` | 통제 판단·조치 이력(append-only) 신규 테이블. 인덱스 인라인(`ix_wctlog_occurred (occurred_at, event_id)`, `ix_wctlog_worklog (worklog_id, occurred_at)`). 신규 테이블 = major(`--approve MAJOR_VERSION_RULE`) |

칼럼 추가 없음. 인덱스 전용 마이그레이션 없음(신규 테이블 하나라 "칼럼·테이블이 인덱스보다 앞" 조건 그대로). DDL: `src/rdb/schema/ddl/worklogControl.sql.js` `CREATE_WORKLOG_CONTROL_LOG_TABLE`.

## 2. resolver 목록 (3단계 등록 완료 — 계약 테스트 통과)

| resolver | 신규/변경 | 권한 | 컨트롤러 |
|---|---|---|---|
| `acknowledgeForeignWorklog` | 신규 | `{admin:true}` | `WorklogControlController` |
| `clearForeignWorklog` | 변경(입력 `reason` 필수) | 무변경 | 〃 |
| `listForeignWorklogs` | 가산(`review`) | 무변경 | 〃 |
| `listWorklogHistory` | 가산(`includeControl`·`controlActions`) | 무변경 | `WorklogHistoryController` |
| `getRecordRetentionOverview` · `exportExpiredRecords` · `confirmRecordExport` · `purgeExportedRecords` · `downloadRecords` | 신규 5 | `{admin:true}` | 신규 `src/resolver/retention/RecordRetentionController.js`(`CONTROLLER_REGISTRARS` 끝에 `registerRecordRetentionController`) |
| `getWorklogHistoryRetention` 외 이력 보관 3 | 의미 변경: **일반분만**(wf_linked≠1). 응답에 `kind:'WORKLOG_HISTORY'` 가산 | 무변경 | 기존 |
| `getApprovalSettings`/`saveApprovalSettings` | 정책 키 3 가산 | 무변경 | 기존 |

공통 응답 `{success:true, content}`. 아래 shape 은 전부 `content`.

## 3. 실제 응답 shape

### 3.1 `clearForeignWorklog`
입력 `{ worklogId: string, reason: string }` — reason 은 NFC·trim 뒤 1~500자.
```js
{ worklogId: '501', state: 'CLEARED', eventId: '<uuid>' }
```
에러: `INVALID_TARGET` cause `{field:'reason'}`(상태 변경 전), `WORKLOG_NOT_FOUND`(열람 불가 포함), `WORKLOG_CONTROL_CONFLICT`, `STORAGE_NOT_READY`(원장 또는 **이력 테이블 미준비 — 상태 변경 전에 거절**), `WORKLOG_CONTROL_STORAGE`(CAS 는 성공했으나 이력 기록 실패 — 재시도하면 같은 상태 재기록이 새 이벤트로 사유를 남긴다).

### 3.2 `acknowledgeForeignWorklog` (신규)
입력 `{ worklogId, reason }`. 상태 변경 없음(원장 rev 그대로), 이력 행만.
```js
{ worklogId: '501', state: 'FLAGGED' /* 현재 foreign_state 그대로 */, eventId: '<uuid>', acknowledgedAt: 1791000000000 }
```
에러: `INVALID_TARGET{field:'reason'}`, `WORKLOG_NOT_FOUND`(행 없음·foreign_state 없음·열람 불가), `STORAGE_NOT_READY`(원장), `WORKLOG_CONTROL_STORAGE`(이력 기록 실패·이력 테이블 없음).
같은 사람·같은 사유·같은 원장 판(rev)이면 같은 eventId(재전송 = 한 행).

### 3.3 `listForeignWorklogs` 가산
`items[].review: { action: 'FOREIGN_CLEARED'|'FOREIGN_ACKNOWLEDGED', at: number, by: accountId, note: string } | null` — 마지막 관리자 판단. `users` 에 `by` 계정 포함. 이력 테이블 없음·읽기 실패면 `null`.

### 3.4 `listWorklogHistory` 가산
입력 가산: `includeControl?: boolean`(기본 false), `controlActions?: ControlAction[]`(통제 행만 거른다. `kinds`·`sources` 는 이력 행에만 적용).
- `includeControl:false` → **기존 응답 그대로**(rowType 없음, 커서 형식 그대로).
- `includeControl:true` → 이력·통제 행을 시각 내림차순(같은 시각은 이력 먼저)으로 합친 페이지. `nextCursor` 는 **합성 불투명 문자열**(base64url JSON) — 이 모드에서는 기존 `'changedAt|worklogId|seq'` 커서를 받지 않는다(`INVALID_TARGET{field:'cursor'}`).
```js
{
  items: Array<
    | { rowType: 'HISTORY', ...HistoryItem /* 기존 그대로 */ }
    | {
        rowType: 'CONTROL',
        eventId: string,                 // uuid, React key
        worklogId: string, issueId: string, projectId: string|null,
        issue: { visible: true, issueKey: string|null, summary: string|null, projectKey: string|null },
        authorAccountId: string,         // 워크로그 작성자
        actorAccountId: string|null,     // 관리자 판단만(해제·확인). 앱 조치는 null
        action: ControlAction,
        reasonCode: string|null,         // foreign_reason(NONE·REUSED·INVALID·PRE_RESTRICTED·CAP·CHANGED) / vis_reason(LINKED·APPROVED·CERTIFIED) / 'GONE'
        note: string|null,               // 관리자 입력 사유(관리자 전용 resolver 라 원문)
        detail: { fp?: string /*참고 사본 지문 16hex*/, gen?: number, from?: string /*이전 상태*/, state?: string /*확인 당시 상태*/ } | null,
        workforceLinked: boolean|null,   // 기록 당시 통제 행 linked
        occurredAt: number,
      }>,
  hiddenCount: number,                   // 두 종류 합산(열람 불가 이슈 행 제외 수)
  nextCursor: string|null,
  users: UserMap,
}
```
`ControlAction` = `FOREIGN_FLAGGED` · `DELETE_SCHEDULED` · `DELETE_DOWNGRADED` · `FOREIGN_DELETED` · `FOREIGN_GONE` · `FOREIGN_CLEARED` · `FOREIGN_ACKNOWLEDGED` · `HIDE_APPLIED` · `HIDE_RELEASED` · `HIDE_RELEASE_SKIPPED`.
에러 가산: `INVALID_TARGET` cause `{field:'includeControl'|'controlActions'|'cursor'}`.
통제 스위치·관문은 이력에 쓰지 않는다 — 화면은 설정 감사(`listSettingsAudit`, area `worklogControl`)로 링크.

### 3.5 기록 보관 (`kind` ∈ `APPROVAL` · `WORKLOG_HISTORY` · `WORKLOG_HISTORY_LINKED` · `CERTIFICATION` · `CONTROL_LOG`)
모르는 kind → `INVALID_TARGET{field:'kind'}`.

`getRecordRetentionOverview` 입력 `{}` (조회 시점 COUNT, 스케줄 없음)
```js
{ kinds: [ {
  kind, unit: 'YEAR'|'MONTH', value: number /*0=무기한*/, options: number[], cutoff: number|null,
  expiredCount: number, oldestAt: number|null, purgeableCount: number /*상한*/, lastExport: {sessionId,cutoff,at,count,by}|null,
  exportRequired: boolean,   // expiredCount - purgeableCount > 0 — "기간 지난 기록 N건 — 내려받기 필요"
} ] }   // 순서 = APPROVAL, WORKLOG_HISTORY, WORKLOG_HISTORY_LINKED, CERTIFICATION, CONTROL_LOG
```
unit: APPROVAL·CERTIFICATION·CONTROL_LOG = YEAR, 이력 둘 = MONTH. 보관 기간 변경은 기존대로(결재 `setRetentionYears`, 나머지는 `saveApprovalSettings` 정책 키 — §4).

`exportExpiredRecords` 입력 `{kind, sessionId?, cursor?, cutoff?}` — 응답은 `{kind, ...그 종류의 내보내기 페이지}`:
- APPROVAL: 기존 `exportExpiredApprovals` 와 같음 `{sessionId, cutoff, requests, approvers, events, nextCursor /*객체 {at,id}*/}`
- WORKLOG_HISTORY / WORKLOG_HISTORY_LINKED: 기존 `exportExpiredWorklogHistory` 와 같음 `{sessionId, cutoff, items: HistoryItem[], users, nextCursor}`(열람 불가 이슈는 가린 채 포함, Q73)
- CONTROL_LOG: `{sessionId, cutoff, items: ControlItem[] /*3.4 CONTROL 행, 단 열람 불가면 issue:{visible:false,…null}*/, users, nextCursor: string|null}`
- CERTIFICATION: `{sessionId, cutoff, batches: Array<CertBatchSummary & { items: Array<CertBatchItem & { issue: {visible, issueKey, summary, projectKey} }> }>, users, nextCursor: string|null}` — 묶음 25개/페이지. `CertBatchSummary`·`CertBatchItem` 은 audit-trail §2.4 그대로(감사 도메인 함수 재사용).
- `cursor` 는 응답의 `nextCursor` 를 그대로 되돌려 보낸다. CERTIFICATION·CONTROL_LOG 커서는 불투명 문자열(형식 밖 `INVALID_TARGET{field:'cursor'}`).
- 무기한(0)이면 `{kind, sessionId:null, cutoff:null, <빈 items 또는 batches>, users:{}, nextCursor:null}`.

`confirmRecordExport` `{kind, sessionId}` → 개요의 한 종류 요약(`exportRequired` 없음). `purgeExportedRecords` `{kind}` → `{deleted, remaining}`(remaining>0 이면 다시 부른다).
에러: `RETENTION_EXPORT_REQUIRED`(확정 없음·세션 만료·다른 관리자 세션), `STORAGE_NOT_READY`.

`downloadRecords` 입력 `{kind, from: number, to: number /*> from, 상한 없음*/, cursor?}` — 세션·삭제 허가 없음, 기간 무관:
- APPROVAL: `{kind, requests, approvers, events, hiddenCount /*열람 판정에서 뺀 요청 수*/, nextCursor: string|null}` — 끝난 요청 중 updated_at ∈ [from,to)
- WORKLOG_HISTORY: 일반+연결 **전부**(행마다 `workforceLinked`), WORKLOG_HISTORY_LINKED: 연결분만 — `{kind, items, users, nextCursor: 'changedAt|worklogId|seq'|null}`
- CERTIFICATION(묶음 created_at) / CONTROL_LOG(occurred_at): 내보내기와 같은 `batches`/`items` + `{kind, users, nextCursor}`
에러: `INVALID_TARGET{field:'from'|'to'|'cursor'|'kind'}`.

## 4. 정책 키 (SettingsRepository 세 곳 + SettingsService 정규화기, GLOBAL_ONLY)

| 키 | 기본 | 선택지 | KVS |
|---|---|---|---|
| `worklogHistoryLinkedRetentionMonths` | 36 | 0·12·24·36·60 | `approval:settings:worklogHistoryLinkedRetentionMonths` |
| `certificationRetentionYears` | 0 | 0·3·5·7·10 (1년 없음 — 작년 인증 문서 재게시 범위와 겹침) | `approval:settings:certificationRetentionYears` |
| `worklogControlLogRetentionYears` | 0 | 0·1·3·5·7·10 | `approval:settings:worklogControlLogRetentionYears` |

선택지 밖 값 → `INVALID_TARGET`(기존 정규화기 규칙). 마지막 내보내기 KVS: `approval:retention:worklogHistory:linked` · `approval:retention:certification` · `approval:retention:controlLog`. 설정 감사 action 가산: `historyLinkedExport`·`historyLinkedPurge`·`recordExport`·`recordPurge`(detail.kind).

## 5. 동작 요약

- **R1 기록 지점**: `WorklogControlRepository.change()`·`insertIgnore()` 의 CAS·삽입 **성공 뒤** `WorklogControlJournal.record` → 순수 `controlEventsOf`(`src/domain/worklogControl/journal.js`)가 분류. 운영 싱글턴만 journal 을 단다(단위 테스트 SQL 수 무변경). 앱 조치의 기록 실패는 삼킨다(트리거 규칙) — 그때 이력 한 줄이 빠질 수 있다(원장 상태는 맞다).
- 결정적 id: `deterministicEventId({requestId:'wctl:'+worklogId, eventType:action, actorKey, discriminator})`, discriminator = change `"{createdAt}:{rev+1}"`, 삽입 `"ins:{now}"`, 확인 `"ack:{createdAt}:{rev}:{sha(note)16}"`.
- 원장 90일 정리(`cleanupExpired`)와 무관하게 이력은 남는다. 이력 정리는 보관 경로(CONTROL_LOG)만.
- **R2**: 일반 = `wf_linked IS NULL OR wf_linked <> 1`, 연결 = `wf_linked = 1`. 칼럼(v052) 미준비면 일반 = 전부, 연결 = `1=0`. 옛 일반 세션에 든 연결 행은 정리 시 술어로 SKIPPED.
- **R3 인증 정리**: 묶음 단위, 지문 = {묶음, 그 묶음이 현재본인 인증 행, 덮인 판}. 삭제 순서 `worklog_cert_log` → `worklog_cert`((월, 대상자) 쌍 + batch_id) → `worklog_cert_batch`(마지막, `created_at < cutoff`). 게시 문서는 건드리지 않는다. 삭제 SQL 은 `src/resolver/retention/CertRetentionRepository.js` 에만 — `WorklogCertRepository` 의 "DELETE 없음" 계약 유지.
- **R4**: §6.
- **R6**: `contextFor` → `linked`(판정된 연동만) / `windowLinked`(연동 ∨ 불명∧창 ON). 판정(`judgeCreate`·`judgeMutation`)은 `windowLinked`, `beginCreate`·`finishCreate` strict·통제 행 linked 는 `linked`. `controlView`(= `getIssueWorklogs`·`getWorklogEditorContext` 의 `control`) 가산 `linkUnavailable: boolean`, **`control.linked` 의미 변경: 판정 불명이면 이제 false**(전에는 창 ON 이면 true). `dateWindow` 는 그대로 READ_FAILED 로 온다.

## 6. 인증 즉시 게시(R4) — 큐 디바운스

```
WorkforceOutbox.touchCert(items, now)       // 아웃박스 upsert 성공 뒤
  └ WorkforceCertWake.wake(now)             // 던지지 않는다
      policy.workforceLinkEnabled===false → 'DISABLED'        (KVS)
      서명 불가·키 없음                    → 'BLOCKED'         (환경)
      KVS approval:workforce:certWake.until > now → 'DEBOUNCED' (KVS)
      repository.ready ∧ hasAnyVerifiedInbound 아니면 → 'NOT_LINKED' (SQL ≤1)
      push {job:'workforce-cert', delayInSeconds:45} → KVS until = now+45s → 'QUEUED'
consumer 'workforce-cert' → WorkforcePublisher.publishCertNow({budgetMs})
      gate(관문) → PUBLISH_JOB 리스(일일 tick 과 배타; 못 잡으면 완료로 끝) → drain(certOnly: listDueCert) → 리스 해제
```
- 호출 지점: `touchCert` 를 쓰는 곳 전부 — 인증·재인증·본인 인증(`WorklogCertService` L707) + 관찰 전이 MISMATCH/DELETED(`WorklogCertObserver` L48, 트리거·화면). `touchCertYears`(정책 변경·연동 재개)는 일일 작업 몫(깨우지 않음).
- 같은 사용자×월 재인증은 아웃박스 행 하나(dirty_rev)로 합쳐 지연 창 뒤 1회 PUT. 작업 시작 뒤 touch 는 until 이 지나 새 작업을 넣는다.
- `SweepJob.WORKFORCE_CERT = 'workforce-cert'`, `EVENT_JOBS = [worklog-control, workforce-cert]` 신설. `DAILY_JOBS` 무변경. 새 scheduledTrigger 0, manifest 무변경(기존 `approval-sweep-queue` consumer 재사용).

## 7. 유휴 SQL

| 항목 | 값 |
|---|---|
| 일일 트리거 | 무변경(마커 현재면 0, 다섯 작업 push) |
| 미연동 하루 합계 | **≤27 유지**(테스트 루프에서 이벤트 전용 `workforce-cert` 제외 — 일일 push 에 없음을 별도 단언) |
| 연동 workforce 작업 | ≤13 유지 → 합계 38 유지 |
| `workforce-cert` 를 누가 넣었더라도 미연동이면 | 관문 SQL ≤1, 리스·배출 없음(테스트) |
| 보관 개요·통제 이력 | 조회 시점만. 스윕·큐 작업 추가 없음 |
| 통제 이력 기록 | 통제 원장 전이가 있을 때만 INSERT 1(스위치 OFF 면 원장 전이도 없음) |

## 8. 계약 변경(R5) — 워크포스 에이전트용

### 8.1 변경 요약 (diff)
- `contract.js`
  - **import 0개**(자기완결). `parsePeriodKey` → 지역 `isPeriodKey`(export, 같은 규칙 — `contractSelfContained.test.js` 가 도메인 함수와 20 케이스 대조). `isoWeeksInYear` 지역 복제.
  - `TYP.RMS_POLICY` validator: `normalizeOverride(b.values).ok` → `policyValuesShape(b.values)`(객체, 키 `^[A-Za-z][A-Za-z0-9]{0,63}$` ≤64개, 값 boolean·유한 number·≤256자 string). 정책 값의 의미 검증은 승인 앱 수신 경로 `verifyPolicyEnvelope` 에 이미 있다(그 경로는 validateBody 를 쓰지 않는다). **워크포스가 생산 쪽에서 contract.validateBody 로 카탈로그 의미까지 검사하고 있었다면 그 검사는 이제 형태만이다 — 워크포스 자체 catalog 검사 유지 권장.**
  - 신규 `CERT_DELETED_ISSUES_KEY = 'di'`, validator `approval.cert` 에 `optional(b.di, certDeletedIssuesValid)`: 객체, 키·값 숫자 id 문자열, 키는 w 의 삭제 비트(2) 항목에만, 개수 ≤1000. 삭제 항목 전부를 요구하지 않음(없으면 모름).
  - `CERT_LIST_MAX` 주석에 바이트 예산 자르기 규칙 명시. 상수 값 무변경(`CONTRACT_VERSION`=1, `CERT_DOC_VERSION`=2).
- `certificationDoc.js`(복사 대상 아님): 삭제 항목에 `di` 생성(issueId 가 숫자 id 일 때만, 없으면 키 생략). 본문이 `CERT_DOC_BODY_BUDGET = 30,000 − 385(봉투 최악: 계정 128자·kid 16자·시각 13자리·sig 86) = 29,615B` 를 넘으면 id 오름차순 앞 n 건(이분 탐색 최대 n)만 + `wt:true`. 합계(cs·cn·mn·dn·sc·sn·wn)는 전체 기준.
- `vectors.json`: `signatures[]` 에 `approval.cert` 벡터 1건 **추가**(기존 cert 벡터 바로 뒤, 기존 8건 무변경 — 옛 문서(di 없음)도 검증돼야 하므로). 본문: 4건 중 `['10234601',7200,2]` 삭제 항목 + `di:{'10234601':'10051'}`, ent `{accountId:'5b10ac8d82e05b22cc7d4ef5', periodKey:'2026-10'}`, kid `ap-test-1`, iat `1791000000000`. 시험 키로 서명·메시지 hex 생성, `signature.test` 재생성·검증 통과. 형식 `JSON.stringify(…, null, 2)` + 원래 줄끝.

### 8.2 바이트 계산 (테스트로 고정)
| 경우 | 결과 |
|---|---|
| 기존 최악(1,000건, flag 6, di 없음) | < 24,500B (무변경) |
| di 최악(1,000건 전부 삭제, worklogId·issueId 10자리) | 항목 23B + di 26B ≈ 49B → **w 600건 + wt:true**, 문서 ≤ 30,000B |
| 위 + 봉투 최악(계정 128자·kid 16자) | ≤ 30,000B |
| 현실(월 150건, 삭제 몇 건) | ≈ 4KB, 자르기 없음 |
- `w` 튜플 4번째 원소안을 버린 이유: 옛 검증자(원소 2~3개만)가 문서 전체를 거부. `di` 최상위 키는 옛 검증자가 무시 → 두 리포 배포 순서와 무관.
- 워크포스 읽는 쪽 규칙(W2): `di[worklogId]` → 이슈 → 프로젝트로 "유지" 원가 반영. `wt:true` 이고 w 에 없는 워크로그는 "인증 여부 불명", 합계는 `cs`.

### 8.3 복사 대상 — 9개 → 7개
`period.js`·`catalog.js` 는 더 이상 복사 대상이 아니다(워크포스 `vectors.test.js` 의 `SYNCED` 에서 두 줄 제거). 워크포스 경로 `src/integration/approval/<이름>` ← 승인 앱 `src/integration/workforce/<이름>`.

| 파일 | 변경 | sha256 (LF 정규화 — 워크포스 대조 기준) | sha256 (작업 사본 원바이트) | 바이트 |
|---|---|---|---|---|
| `contract.js` | **변경** | `529f1194cdcf974b6cad84eeca377a2fb5e16b6d179d07e4038dec6d88cb414b` | `7b14a88b34852afa9bb87c78be541a4a068a0f39d559c396f4e6b30d6eda6203` | 17,029 |
| `vectors.json` | **변경** | `40b440208a135263c5a3b113bdc77ff0c7853a5a47a4341b75335c69ffa0957f` | `9a4346d7d2b7fb7c12096474eaf10466e93aaab4bc5b69a0f8e8362c108b4ef8` | 15,425 |
| `base64url.js` | 무변경 | `c6828cb1b19d7424d6e4739dcfc71b7529d9bd99a3c0c98a7ad568f285b9c963` | `571640ce…3d38` | 1,021 |
| `canonical.js` | 무변경 | `3ed7940b119d630b379e8b8df0d292478cd239f7c52d268308b3ad1fcefeaa3a` | `3f28bee2…4dda` | 2,656 |
| `ed25519.js` | 무변경 | `bdb61df904594d9c58e9f9735a92a503613208fee37cd73250acd91278d6e3ae` | `8fbe15b6…ed9f` | 1,577 |
| `keyring.js` | 무변경 | `bc68218cb41e79249907af1d525ee5dc6dc1e895771c6974af44ba64fecb5609` | `bc120bae…62f1` | 2,544 |
| `signature.js` | 무변경 | `97827437690e9886de557f11a0d1e28038c1f4d33ecee06cc61b828512054e0a` | `7f5a38aa…abbd` | 6,481 |

(바이트 수는 작업 사본 그대로. 해시는 이 보고서 작성 시점 — 리더 커밋 전 다시 대조 권장.)

## 9. AGENTS.md 문구 초안 (리더 반영용 — 이 에이전트는 AGENTS 를 고치지 않았다)

asApp 허용 2번 끝에 덧붙임:
> 게시 PUT·대조 GET 은 **큐 작업에서만** 한다 — 일일 `workforce` 작업과, 인증·재인증·관찰 전이 직후 `WorkforceCertWake` 가 넣는 이벤트성 `workforce-cert` 작업(`WorkforcePublisher.publishCertNow`, 인증 문서 행만, 일일 tick 과 같은 리스). resolver·트리거는 아웃박스 touch 와 깨우기(KVS 표식·큐 push)만 하고 Jira 를 부르지 않는다. 깨우기는 정책 꺼짐·서명 불가·미연결(검증 수신 없음)이면 아무것도 넣지 않고, 지연 45초 창 안의 반복 인증은 한 번으로 합친다(2026-10-11 audit-retention-sync, Q134 가).

트리거·스케줄 절, `worklog-control 큐 작업은 일일 목록에 없다` 문장 뒤:
> `workforce-cert` 큐 작업도 일일 목록에 없다(`EVENT_JOBS`) — 인증 이벤트로만 들어온다. 인증 없는 날 실행 0·SQL 0. 유휴 합계(27·38)에 들어가지 않는다.

보안 절에 한 줄:
> 통제 판단·조치 이력(`worklog_control_log`)은 append-only — UPDATE 없음, DELETE 는 보관 정리(내보내기 확정 범위) 하나. 관리자 해제·확인은 사유 필수이고 사유 원문은 로그에 남기지 않는다.

## 10. 프론트 참고 (이 단계에서 static/ui·locales 는 손대지 않음)

- 신규 에러 코드 **없음**(`ErrorCodes` 무변경). 기존 `INVALID_TARGET` 의 cause.field 에 `reason`·`includeControl`·`controlActions`·`kind`·`from`·`to` 가 새로 온다.
- 번역 필요(프론트 몫): ControlAction 10종 라벨, 기록 종류 5종, 정책 키 3종, 재게시 문구("다음 일일 동기화" → "인증 시 수 분 내, 그 외 일일"), `linkUnavailable` 안내.
- `getIssueWorklogs` 의 `control.linked` 가 판정 불명일 때 false 로 바뀐다(§5 R6) — 화면이 이 값으로 "연동" 배지를 띄우고 있었다면 `linkUnavailable` 를 함께 볼 것.
- 감사 > 워크로그 변경 탭은 `includeControl:true` 로 부르고 `rowType` 으로 행 종류 구분, 엑셀도 같은 호출 반복(합성 커서).

## 11. 미검증

| # | 항목 | 확인 방법 |
|---|---|---|
| U1 | Forge 큐 `delayInSeconds:45` 가 실제로 그보다 일찍 배달되지 않는가(디바운스 정확성 전제) | 개발 사이트에서 인증 2회(10초 간격) → `forge logs` 의 `[WF][publish][cert-now]` 1회, 사용자 프로퍼티 `movesApproval.cert.YYYY-MM` 의 `updatedAt` 1회 갱신 확인 |
| U2 | 인증 → 워크포스 반영 지연(목표 수 분) | 같은 시나리오에서 인증 시각 ↔ 프로퍼티 updatedAt 차이 |
| U3 | TiDB `DELETE … WHERE period_key=? AND author_account=? AND batch_id=UUID_TO_BIN(?)` 가 ix_wcert_period_author 를 타는가 | `EXPLAIN` (Forge SQL 콘솔 없으면 소량 데이터로 시간 관찰) |
| U4 | `worklog_control_log` CREATE(인라인 인덱스 2) 적용 | 배포 후 첫 resolver 호출 뒤 `getRecordRetentionOverview` 의 CONTROL_LOG 가 STORAGE 에러 없이 0 |
| U5 | 관리자 해제의 이력 행이 실제로 남는가(운영 싱글턴 journal 배선) | 해제 후 `listWorklogHistory({includeControl:true})` 에 `FOREIGN_CLEARED` + note |

`04_spike_todo.md` 는 만들지 않았다(위 표로 갈음 — 리더가 필요하면 옮긴다).

## 발견 (범위 밖, 고치지 않음)

1. `docs/DESIGN.md` 수정·`docs/APP-MANAGED-WORKLOG-DESIGN.md`·`docs/WORKLOG-IDENTITY-PROPERTIES-DESIGN.md` 미추적 파일이 작업 트리에 있다 — 이 에이전트 변경 아님(다른 에이전트 작업으로 보임). 커밋 시 경로 특정 필요.
2. 저장소 루트에 ESLint 설정(eslint.config.*)이 없어 `npx eslint` 가 실행되지 않는다(forge lint 는 통과).
3. 인증 보관 정리로 현재본 인증 행을 지우면 그 워크로그는 "미인증"이 되어 통제 재계산(CERTIFIED 사유 숨김) 대상에서 빠질 수 있다 — 무기한 기본·최소 3년이라 실무 영향은 작지만, 통제 B 이상 켠 사이트에서 오래된 확정분을 정리할 때는 기간 마감(잠금)이 함께 있어야 한다.

## 변경 파일

신규: `src/domain/worklogControl/journal.js`, `src/domain/retention/recordRetention.js`, `src/resolver/worklogControl/{WorklogControlJournal,WorklogControlLogRepository}.js`, `src/resolver/retention/{RecordRetentionService,RecordRetentionController,CertRetentionRepository}.js`, `src/resolver/workforce/WorkforceCertWake.js`, 테스트 7(`journal.test`, `WorklogControlJournal.test`, `WorklogHistoryControlMerge.test`, `WorklogHistoryLinkedRetention.test`, `RecordRetentionService.test`, `WorkforceCertWake.test`, `contractSelfContained.test`).
변경: `src/index.js`, `src/permission/PermissionMap.js`, `src/rdb/schema/{migrate.js,ddl/worklogControl.sql.js}`, `src/integration/workforce/{contract.js,certificationDoc.js,vectors.json}`, `src/resolver/settings/{SettingsRepository,SettingsService}.js`, `src/resolver/retention/{RetentionRepository,RetentionService}.js`, `src/resolver/worklogHistory/{WorklogHistoryRepository,WorklogHistoryRetentionService,WorklogHistoryService}.js`, `src/resolver/worklogControl/{WorklogControlContext,WorklogControlController,WorklogControlRepository,WorklogControlService}.js`, `src/resolver/worklog/WorklogService.js`, `src/resolver/workforce/{WorkforceLinkRepository,WorkforceOutbox,WorkforcePublisher}.js`, `src/trigger/sweepJobs.js`, 기존 테스트 7(기대값 가산·인자 갱신).

---

# 2회차 (2026-10-11) — 리스 경합 시 인증 즉시 게시 재시도

근거: 통합 검증 관찰(`03_verify_report.md`) — 일일 workforce 작업이 게시 리스(`wf-publish`)를 쥔 동안 들어온 인증은 `workforce-cert` 가 리스를 못 잡아 다음 일일 동기화로 밀렸다.

## 변경
- `WorkforcePublisher.publishCertNow({budgetMs, retried})` — 관문(정책·서명·미연결)·인증 테이블 준비를 통과한 뒤 **리스 획득에 실패하면**, `retried` 가 아닐 때만 `requeueCert(now)`:
  `push {job:'workforce-cert', delayInSeconds: CERT_LEASE_RETRY_SECONDS, payload:{retry:1}}` → KVS `approval:workforce:certWake.until = now + 지연`(디바운스 표식 유지·연장 — 그 사이 인증은 새 작업을 넣지 않고 이 재시도가 함께 가져간다).
  응답 summary 에 `retryQueued: boolean` 가산. push 실패는 던지지 않고 `retryQueued:false`.
- `CERT_LEASE_RETRY_SECONDS = 270`(리스 상한 4분 + 여유 30초, 큐 지연 상한 900 이하). 리스 행의 남은 시간을 읽는 SQL 대신 상한을 쓴다.
- 무한 재시도 금지: 재시도 회차(`payload.retry===1` → 실행기가 `retried:true`)가 또 밀리면 더 넣지 않는다 — 그때는 일일 작업이 잇는다(행은 아웃박스에 pending 으로 남는다).
- 미연결·정책 OFF·서명 불가는 관문에서 끝나 재시도도 0. 일일 목록·스케줄 무변경.
- `sweepJobs` 실행기: `[SweepJob.WORKFORCE_CERT]` 가 `payload?.retry === 1` 을 `retried` 로 넘긴다(consumer 는 원래 payload 를 그대로 전달).

## 유휴 SQL
무변경 — 재시도는 인증 이벤트 → 큐 작업 → 리스 경합일 때만 생긴다. `idleSqlBudget.test.js`(미연동 27·연동 38, `workforce-cert` 미연동 관문 ≤1) 통과.

## 테스트 (`WorkforceCertWake.test.js` +5)
리스 경합 → 지연 재삽입(payload·지연·표식 연장) / 재시도 회차는 다시 넣지 않음 / 미연결·정책 OFF 는 재시도 0·리스 시도 0 / 실행기의 payload.retry → retried 전달 / push 실패 무예외.

## 검증
`npx jest --runInBand` **142 suites / 2,189 tests 통과** · `forge lint` No issues found.

## 변경 파일
`src/resolver/workforce/WorkforcePublisher.js`, `src/trigger/sweepJobs.js`, `src/resolver/workforce/__test__/WorkforceCertWake.test.js`. 계약 파일(§8) 무변경 — sha256 그대로.

## 미검증 가산
U6 리스 경합 재시도: 일일 workforce 작업 실행 중(리스 4분 안)에 인증 → `forge logs` 에 `[WF][publish][cert-now]` `leased:false, retryQueued:true` 뒤 약 4.5분 후 `leased:true` 1회, 프로퍼티 updatedAt 갱신 확인.

## AGENTS 문구 초안 보강(§9 첫 문단 끝)
> 리스 경합으로 못 내보내면 리스 상한 뒤로 한 번만 다시 넣는다(payload retry:1, 무한 재시도 없음).
