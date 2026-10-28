# 워크로그 정책 계층 설계

> 상태: 구현 계약 확정안 · 2026-10-06  
> 입력: `00_input/requirement.md`  
> 근거 구현: `SettingsRepository`, `SettingsService`, `WorklogService`, `PeriodLockService`, `TimesheetService`, `WorklogCollector`, `WorkforceInbound`, `WorkforceLinkRepository`, `WorklogApprovalPolicy`, `WorklogCertification*`, `ProjectSettings`, `WorklogDialog`  
> 이 문서는 설계 산출물이다. 소스 수정·테스트·빌드·배포는 수행하지 않았다.

## 열린 제품 질문과 보수적 기본안

구현을 막는 질문은 없다. 다음 기본안을 계약으로 사용하되, 제품 결정이 바뀌면 registry 값만 바꿀 수 있게 한다.

1. Workforce가 잠근 키는 Jira project/issue에서 **완화할 수 없다**. `strictness`를 정의할 수 있는 키는 더 엄격한 값만 허용하고, 방향을 객관적으로 정할 수 없는 키는 어떤 local override도 금지한다.
2. 만료된 Workforce 정책은 24시간의 stale grace 동안 마지막 검증본을 적용한다. grace가 끝나면 잠금 키와 관련된 쓰기는 `WORKLOG_POLICY_AUTHORITY_UNAVAILABLE`로 fail-close하고, 표시·조회는 마지막 검증본을 `EXPIRED` 경고와 함께 보여 준다. 잠금이 없는 키는 site/local fallback을 사용한다.
3. `timesheetTimezone`, `approvalUnit`만 기간 경계를 정의하므로 site scope 전용으로 유지한다. 자동 마감 일수와 제출 잠금은 project/issue에서 더 엄격하게 만들 수 있고, worklog별 mutation에 적용한다. 명시적 기간 close row와 제출 period key는 site의 unit/timezone으로 계속 계산한다.
4. daily/weekly limit는 worklog별 정책을 먼저 구한 뒤, 한 timesheet 내에서 적용 대상 worklog들의 가장 엄격한 limit를 사용한다. `0`은 기존 의미와 호환되게 unlimited로 해석한다. 위반 상세에는 어떤 project/issue 정책이 limit를 정했는지 표시한다.
5. 기존 `worklog_approval_policy.required=true`는 strict preapproval의 기존 권위 데이터로 계속 인정한다. 새 계층의 `approvalMode`가 더 엄격한 `PREAPPROVAL`을 요구하면 기존 policy/flow가 준비돼 있어야 하며, 없으면 생성 경로를 fail-close한다. `CERTIFICATION`은 현행 사후 인증 모델의 기본값이다.

## 1. 개요와 영향 범위

정책은 전체 객체를 덮는 방식이 아니라 **키별 sparse override**로 합성한다. 정상 우선순위는 다음과 같다.

```text
SITE_DEFAULT
  -> WORKFORCE_PROJECT (+ 같은 권위의 optional WORKFORCE_ISSUE constraint)
  -> JIRA_PROJECT
  -> JIRA_ISSUE
  -> EFFECTIVE_POLICY
```

Workforce issue 문서는 별도 계층으로 local 우선순위를 바꾸지 않는다. 해당 issue에만 적용되는 Workforce project 권위의 constraint로 취급하고, Workforce project 단계 안에서 project 문서 뒤에 합성한다. 따라서 요구한 `site < Workforce project < Jira project < Jira issue`는 그대로 유지된다.

영향 범위는 다음과 같다.

- domain: 정책 catalog, sparse override 정규화, strictness 비교, 키별 merge/provenance, stale 판정
- backend: 정책 조회·저장·batch resolve, Workforce 문서 검증/캐시, WorklogService·TimesheetService·history/certification 경계 연결
- SQL: issue override 테이블 1개, project config revision 컬럼 1개
- Jira: 기존 `asUser()` property read 및 issue/project permission API만 사용. 신규 `asApp()` write/read 없음
- frontend: 사이트/프로젝트/이슈 정책 편집과 출처·잠금 표시, worklog mutation 전 고지, Workforce 상태 진단
- i18n: 한국어·영어 동시 추가
- manifest: 신규 resolver는 기존 function에서 등록하므로 scope/module 추가 없음. issue 설정 화면을 새 module로 만들지 않고 기존 issue activity/worklog surface에 편집 UI를 배치한다.

## 2. 정책 catalog와 merge 계약

### 2.1 canonical key

| key | 기존 값과 매핑 | scope | 값/기본 | strictness와 잠금 |
|---|---|---|---|---|
| `pastDateMaxDays` | `timesheetBackdateMaxDays` | site/project/issue | integer `0..3650`; 기존 의미대로 `0`은 검사 비활성 | 양수 중 작은 값이 엄격, 양수는 0보다 엄격 |
| `futureDateAllowed` | `!timesheetFutureDateCheck` | site/project/issue | boolean | `false`가 엄격 |
| `dailyMaxSeconds` | `timesheetDailyMaxMinutes * 60` | site/project/issue | integer; `0` unlimited | 양수 중 작은 값이 엄격, 양수는 0보다 엄격 |
| `weeklyMaxSeconds` | `timesheetWeeklyMaxHours * 3600` | site/project/issue | integer; `0` unlimited | 위와 같음 |
| `approvalUnit` | 동일 | site only | `WEEK|MONTH` | 비교 불가, Workforce lock 대상 아님 |
| `timeZone` | `timesheetTimezone` | site only | IANA zone | 비교 불가 |
| `periodAutoCloseDays` | `timesheetAutoCloseDays` | site/project/issue | integer; `0` disabled | 양수 중 작은 값이 엄격, 양수는 0보다 엄격 |
| `lockSubmittedPeriod` | `timesheetLockSubmitted` | site/project/issue | boolean | `true`가 엄격 |
| `createWindowDays` | 신규 | site/project/issue | integer; `0` unlimited | 양수 중 작은 값이 엄격 |
| `editWindowDays` | 신규 | site/project/issue | integer; `0` unlimited | 위와 같음 |
| `deleteWindowDays` | 신규 | site/project/issue | integer; `0` unlimited | 위와 같음 |
| `violationAction` | `timesheetViolationAction` | site/project/issue | `WARN|BLOCK` | `BLOCK`가 엄격. 기존 `EXTRA_STEP`은 읽을 때 `BLOCK`으로 정규화하되 원본 설정은 자동 재작성하지 않음 |
| `approvalMode` | 기존 `worklog_approval_policy.required`와 연동 | site/project/issue | `CERTIFICATION|PREAPPROVAL` | `PREAPPROVAL`이 엄격 |
| `historyEnabled` | `worklogHistoryEnabled` | site/project/issue | boolean | `true`가 감사 측면에서 엄격 |
| `historyKeepComment` | `worklogHistoryKeepComment` | site/project/issue | boolean, 기본 false | 비교 불가. Workforce lock이면 local override 금지 |
| `historyRetentionMonths` | `worklogHistoryRetentionMonths` | site/project/issue | integer `1..120` | 비교 불가. 개인정보 최소화와 감사 보존 중 단일 엄격 방향을 정의하지 않음 |

`inherit`은 JSON에 키가 없는 상태다. `null`, 빈 문자열, `undefined`를 명시 값으로 저장하지 않는다. 저장 시 unknown key는 거부한다. 기존 project JSON의 다른 approval 설정은 보존하고 이 catalog에 속한 키만 교체한다.

### 2.2 키별 결과 shape

모든 resolve 결과는 다음 형태다.

```js
{
  key: 'editWindowDays',
  value: 14,
  source: 'JIRA_ISSUE',
  sourceRevision: 'issue:10002:7',
  inherited: false,
  lock: {
    locked: true,
    authority: 'WORKFORCE_PROJECT',
    sourceRevision: 'wf-project:10000:42',
    allowTighten: true
  },
  ignored: [
    { source: 'JIRA_PROJECT', revision: 'project:10000:3', reason: 'RELAXES_LOCK' }
  ]
}
```

`source`는 최종 값을 제공한 층이다. 더 엄격한 local 값이 Workforce floor 위에서 채택되면 `source`는 local이고 `lock.authority`는 유지된다. 감사 시 값의 출처와 제약의 출처를 둘 다 알 수 있다.

### 2.3 pure domain 함수

신규 `src/domain/worklogPolicy/`에 다음 순수 함수를 둔다. SQL/Jira/clock 호출을 넣지 않고 `now`를 인자로 받는다.

```js
normalizeOverride(raw, catalog) -> { ok, value, errors[] }
strictnessOf(key, value) -> comparable | null
compareStrictness(key, a, b) -> -1 | 0 | 1 | null
mergePolicy({ site, workforceProject, workforceIssue, jiraProject, jiraIssue, now })
  -> { values, keys, authorityState, warnings }
classifyAuthorityCache({ row, now, staleGraceMs })
  -> FRESH | STALE | EXPIRED | ABSENT | INVALID
aggregateTimesheetPolicy({ entries, resolvedByIssue })
  -> { limits, sources, conflicts }
policyDigest(canonicalSparseObject) -> `sha256:<hex>`
```

필수 테스트 표:

- sparse override에서 미지정 키 상속
- 잠긴 값을 완화하면 무시, 강화하면 채택+lock 유지
- 비교 불가 잠금 키의 local override 거부
- `0=unlimited`인 limit/window comparator
- Workforce issue constraint가 다른 issue에 새지 않음
- 동일 revision 다른 body는 rollback/equivocation으로 거부
- expiry 전/24시간 grace/그 이후 분기
- project JSON의 unknown 기존 키 보존
- site-only 키가 project/issue 입력에 오면 거부
- aggregation이 가장 엄격한 daily/weekly limit와 출처를 반환

## 3. 경계면 계약

모든 controller는 `{content: ...}`를 반환하고 공통 wrapper가 `{success:true,...}`/`{success:false,error}`를 만든다. 이름은 반드시 `guardedDefine` + `PermissionMap` + `CONTROLLER_REGISTRARS` 세 곳에 동시에 등록한다.

| resolver | 권한 축 | 입력 | success `content` | 주요 오류 | 소비 UI |
|---|---|---|---|---|---|
| `getWorklogPolicyCatalog` | `{admin:true}` | 없음 | `{catalog, site, siteRevision}` | `STORAGE_NOT_READY` | 사이트 설정 |
| `getProjectWorklogPolicy` | `{project:'admin',projectIdKey:'projectId'}` | `{projectId}` | `{projectId, override, overrideRevision, workforce, effective}` | `INVALID_TARGET`, `STORAGE_NOT_READY` | ProjectSettings modal |
| `saveProjectWorklogPolicy` | `{project:'admin',projectIdKey:'projectId'}` | `{projectId, expectedRevision, override}` | 위와 동일 | `POLICY_CONFLICT`, `POLICY_LOCKED`, `POLICY_INVALID` | ProjectSettings modal |
| `getIssueWorklogPolicy` | `{issue:'view',issueIdKey:'issueId',appAccess:false}` | `{issueId}` | `{issueId,projectId,override,overrideRevision,effective,canAdmin}` | `INVALID_TARGET`, `STORAGE_NOT_READY` | issue/worklog 화면 |
| `saveIssueWorklogPolicy` | `{project:'admin',projectIdKey:'projectId'}` | `{projectId,issueId,expectedRevision,override}` | 위와 동일 | `PERMISSION_DENIED`, `PROJECT_ISSUE_MISMATCH`, `POLICY_CONFLICT`, `POLICY_LOCKED` | issue 정책 편집 |
| `resolveWorklogPolicies` | `SELF` | `{items:[{issueId}]}` 최대 100 | `{items:[{issueId,projectId,effective}], deniedIssueIds, diagnostics}` | `TOO_MANY_TARGETS`, `STORAGE_NOT_READY` | timesheet/admin preview |
| `refreshWorkforcePolicies` | `{project:'admin',projectIdKey:'projectId'}` | `{projectId,issueIds?:[]}` 최대 100 | `{checked,updated,unchanged,failed,items}` | `PROJECT_ISSUE_MISMATCH`, `WORKFORCE_KEYRING_UNAVAILABLE` | Workforce/Project 설정 |
| `getWorklogPolicyDiagnostics` | `{admin:true}` | `{since?,limit?}` | cache 상태 및 집계 `{resolved,cacheHit,sqlQueries,jiraCalls,skips,failures}` | `STORAGE_NOT_READY` | Workforce 진단 |

`saveIssueWorklogPolicy`는 payload의 `projectId`로 guard를 통과한 뒤 service가 `loadIssue(issueId)`로 실제 project를 읽어 반드시 일치시킨다. `resolveWorklogPolicies`는 각 issue를 `/rest/api/3/permissions/check` 일괄 경로로 다시 좁히며, 빈 issue 목록을 `whereIn`으로 넘기지 않는다.

Worklog mutation 응답에는 별도 resolve 호출을 강요하지 않고 다음을 포함한다.

```js
{
  policy: {
    revision: 'ep:sha256:...',
    notices: [{code:'EDIT_WINDOW', severity:'BLOCK', vars:{days:14}, source:'WORKFORCE_PROJECT'}],
    approvalMode: 'CERTIFICATION'
  }
}
```

서버가 최종 판정한다. 클라이언트 고지는 편의 기능이며 stale UI로 우회할 수 없다.

## 4. Backend 구조와 실행 경계

### 4.1 컴포넌트

- `WorklogPolicyCatalog`: key metadata와 validator/comparator
- `WorklogPolicyRepository`: site snapshot, project batch, issue batch, Workforce cache batch
- `WorklogPolicyAuthority`: 서명 문서 검증과 `workforce_inbound` CAS 저장
- `WorklogPolicyResolver`: invocation 단위 memo, batch preload, pure merge 호출
- `WorklogPolicyService`: resolver 입력 검증, 권한 후속 확인, save CAS, diagnostics
- `WorklogPolicyController`: resolver 등록만 담당

`SettingsRepository.getEffectivePolicy(projectId)`는 다른 approval 기능이 계속 사용한다. worklog 계층은 새 resolver를 사용하며 기존 메서드의 의미를 몰래 바꾸지 않는다.

### 4.2 mutation 연결

`WorklogService.create/update/delete`는 다음 순서를 지킨다.

1. 기존 `loadIssue`/`loadOwn`으로 실제 issue/project/author를 확인한다.
2. 실제 context로 `WorklogPolicyResolver.resolveOne()`을 invocation당 한 번 호출한다.
3. 날짜/window/period lock/limit/approval mode를 모두 Jira POST/PUT/DELETE 전에 판정한다.
4. 차단이면 Jira write 0회로 종료한다.
5. 허용이면 기존 asUser gateway를 1회 호출한다.
6. history/certification observer에 동일 effective revision을 넘긴다.

`PREAPPROVAL`이면 create는 기존 immutable draft 승인 경로를 사용하며 direct Jira create를 막는다. `CERTIFICATION`이면 worklog를 즉시 기록하고 certification은 `UNVERIFIED`에서 시작한다. update/delete가 VERIFIED fingerprint를 바꾸면 기존 certification observer가 `CHANGED_AFTER_VERIFICATION`으로 무효화한다.

### 4.3 기간 잠금과 timesheet

`approvalUnit`, `timeZone`은 site-only다. `periodAutoCloseDays`, `lockSubmittedPeriod`는 worklog별 effective policy를 사용한다. `PeriodLockService`는 site unit/timezone으로 period key와 명시적 close row를 읽고, 대상 worklog의 effective 자동 마감 일수·제출 잠금 여부를 `judge`에 주입한다. `TimesheetService.computeLive`는 `WorklogCollector`가 이미 제공하는 issue/project map으로 모든 고유 issue 정책을 한 번 batch resolve하고 각 entry에 연결한다.

- daily/weekly limit: 해당 timesheet entry 중 가장 엄격한 effective 값
- future/backdate: entry별 effective 값으로 violation 생성
- `violationAction`: 위반을 만든 entry들의 가장 엄격한 action
- history/certification mode: entry별 정책
- 제출 snapshot: effective policy digest와 `{issueId,projectId,key,value,source,revision}` 최소 근거를 저장한다. 전체 설명/comment는 저장하지 않는다.

기간 승인 자체의 단일 상태와 명시적 close row는 site scope로 유지한다. 하위 scope의 자동 마감/제출 잠금은 해당 issue worklog mutation만 더 일찍 막으며, 전체 기간 상태를 CLOSED로 승격시키지 않는다. UI는 “이 이슈 정책으로 잠김”과 “전체 기간 잠김”을 구분한다.

### 4.4 history 및 scheduled job early-exit

- `historyEnabled=false`이고 `worklog_policy_feature_index`에 enable 행이 없으면 hourly sweep은 lease/Jira 호출 전 종료한다.
- project/issue/Workforce에서 history를 켜는 save/refresh가 있을 때 아래 feature index를 같은 repository 경계에서 갱신한다. index는 실행 대상 후보를 좁히는 힌트이고, 최종 수집 여부는 effective policy를 다시 해석해 결정한다.
- 대상 project/issue override와 Workforce cached policy가 하나도 없으면 기존 global fast path를 사용한다.
- five-minute Workforce publish job은 inbound policy refresh를 맡지 않는다. 사용자 context 없는 job에서 새 `asApp()` read를 만들지 않는다.
- refresh는 project admin의 명시 resolver와 설정 화면 진입 시 asUser background refresh로 수행한다. mutation 경로는 SQL 검증 캐시만 읽고 entity property를 직접 읽지 않는다.

## 5. 저장 구조와 migration

### 5.1 기존 데이터 호환

- site: 기존 KVS 값을 그대로 site default로 읽는다. 새로운 site 키만 기본값을 추가한다.
- Jira project: 기존 `approval_project_config.policy_json`을 변환 작업 없이 sparse override로 읽는다. catalog 키 이외 JSON 필드는 보존한다.
- preapproval: `worklog_approval_policy`/binding/entry를 유지한다.
- certification: `worklog_certification`/request를 유지한다.
- Workforce verified cache: 기존 `workforce_inbound`를 재사용한다.

### 5.2 migration

현재 migration head는 `v041_create_worklog_certification_request`다. 구현 시작 전에 head를 다시 확인하고, 아직 비어 있으면 다음 이름을 사용한다. 최초 배포 뒤 이름을 바꾸지 않는다.

```sql
-- v042_alter_approval_project_config_policy_rev
ALTER TABLE approval_project_config
  ADD COLUMN policy_rev INT NOT NULL DEFAULT 1;

-- v043_create_worklog_policy_issue_override
CREATE TABLE worklog_policy_issue_override (
  issue_id      VARCHAR(32)  NOT NULL,
  project_id    VARCHAR(32)  NOT NULL,
  policy_json   MEDIUMTEXT   NOT NULL,
  rev           INT          NOT NULL DEFAULT 1,
  updated_at    TIMESTAMP    NOT NULL,
  updated_by    VARCHAR(128) NOT NULL,
  PRIMARY KEY (issue_id),
  INDEX ix_wl_policy_issue_project (project_id, issue_id)
);

-- v044_create_worklog_policy_feature_index
CREATE TABLE worklog_policy_feature_index (
  feature_key   VARCHAR(32) NOT NULL,
  scope_kind    VARCHAR(16) NOT NULL,
  scope_id      VARCHAR(32) NOT NULL,
  enabled       TINYINT(1)  NOT NULL,
  source_rev    VARCHAR(96) NOT NULL,
  updated_at    TIMESTAMP   NOT NULL,
  PRIMARY KEY (feature_key, scope_kind, scope_id),
  INDEX ix_wl_policy_feature_enabled (feature_key, enabled, scope_kind, scope_id)
);
```

모든 신규 table/column 접근 전 `isTableReady('worklog_policy_issue_override')`, `isTableReady('worklog_policy_feature_index')`, `isColumnReady('approval_project_config','policy_rev')`를 확인한다. rollout 중 project column이 아직 없으면 read revision을 `legacy:<updatedAt>:<digest>`로 만들되 저장은 `STORAGE_NOT_READY`로 막는다. issue table 미준비도 read는 empty override, write는 막는다. feature index 미준비 시 sweep은 대상이 없다고 가정하지 않고 기존 site 정책 경로만 실행하며 관리자에게 `INDEX_NOT_READY`를 노출한다.

CAS update:

```sql
UPDATE worklog_policy_issue_override
SET policy_json=?, updated_at=?, updated_by=?, rev=rev+1
WHERE issue_id=? AND project_id=? AND rev=?;

UPDATE approval_project_config
SET policy_json=?, updated_at=?, updated_by=?, policy_rev=policy_rev+1
WHERE project_id=? AND policy_rev=?;
```

조건부 UPDATE 결과가 0이면 `POLICY_CONFLICT`다. 신규 issue 행은 `INSERT IGNORE`, 충돌 시 재조회한다. site KVS는 numeric CAS를 제공하지 않으므로 canonical site policy digest를 `siteRevision`으로 반환하고 저장 직전 다시 비교한다. 기존 `saveApprovalSettings`의 동시 쓰기 한계는 유지하되 이 설계에서 더 약하게 만들지 않는다.

### 5.3 Workforce cache key

기존 `workforce_inbound`에 다음 행을 저장한다.

- `typ='rms.policy'`
- project: `entity_id='P:<projectId>'`
- issue: `entity_id='I:<issueId>'`
- `src_rev`: 발행 revision
- `rev`: local cache CAS revision
- `body_json`: 검증된 canonical body만 저장
- `last_result`: 최근 후보 검증 결과

`typ VARCHAR(16)`, `entity_id VARCHAR(128)`, `src_rev BIGINT` 범위 안이므로 table ALTER는 필요 없다. 목록 resolve는 `findInboundMany` 형태의 단일 `IN (...)` 조회를 사용한다.

## 6. Workforce signed contract

현재 sender와 public keyring은 실측 완료로 간주하지 않는다. 실제 적용 전 양쪽 저장소 fixture를 맞춰야 한다. 계약은 기존 envelope v1을 확장하되 새 typ을 명시적으로 등록한다.

```json
{
  "v": 1,
  "typ": "rms.policy",
  "iss": "moves-workforce",
  "cloud": "<jira-cloud-id>",
  "ent": { "projectId": "10000", "issueId": "optional" },
  "iat": 1791260000000,
  "exp": 1791864800000,
  "kid": "wf-2026-01",
  "body": {
    "rev": 42,
    "values": { "editWindowDays": 14, "violationAction": "BLOCK" },
    "locks": { "editWindowDays": true, "violationAction": true }
  },
  "sig": "<base64url Ed25519 signature>"
}
```

검증 순서:

1. envelope version/typ/family와 canonical signature
2. `iss === 'moves-workforce'`, 허용 keyring의 `kid`
3. cloud id 일치
4. project 존재 및 실제 target 일치; issue 문서는 `loadIssue(issueId).projectId`까지 일치
5. `iat <= now + allowedSkew`, `exp > iat`, TTL 상한
6. safe integer revision, catalog key/value, lock key가 values에 포함됨
7. cached revision보다 큼. 같은 revision·같은 digest는 unchanged, 같은 revision·다른 digest는 `EQUIVOCATION`, 낮은 revision은 `STALE_REV`

후보가 실패하면 후보를 적용하지 않는다. 마지막 verified row는 별도로 지우지 않는다.

| 상태 | 판정 |
|---|---|
| verified 문서가 아직 유효 | 적용 |
| 새 후보 invalid, 기존 verified 유효 | 기존 적용 + 관리자 경고 |
| 기존 verified가 만료됐지만 24h grace 안 | 기존 적용 + `STALE` |
| grace 종료, locked key 관련 mutation | fail-close |
| grace 종료, unlocked key | Workforce 값 제외 후 site/local fallback |
| target mismatch/signature failure/no keyring | 후보 미적용, 상태와 해결 방법 노출 |

entity property는 서명 검증 전에는 후보 표시 외 판정에 쓰지 않는다. `refreshWorkforcePolicies`만 asUser로 읽고, 저장은 검증 후 SQL CAS로 한다. `asApp()` write는 없다.

## 7. 비용 상한과 batch 계획

### 7.1 invocation cache

`WorklogPolicyResolver`는 invocation-local cache를 가진다.

- site policy: 1회
- project rows: 고유 project ids를 최대 100개씩 1 SQL
- issue rows: 고유 issue ids를 최대 100개씩 1 SQL
- Workforce rows: project+issue entity ids를 최대 200개씩 1 SQL
- 동일 `(projectId,issueId,siteDigest,wfRev,projectRev,issueRev)` resolve: Map hit

목록의 row마다 Jira/entity property를 읽지 않는다. `WorklogCollector`가 이미 얻은 issue/project context를 재사용하고, 사용자 제공 context는 authority로 신뢰하지 않는다.

### 7.2 경계별 예산

| 경계 | Jira | SQL | early-exit |
|---|---:|---:|---|
| worklog create/update/delete | 기존 issue/worklog/access 호출 외 policy Jira 0 | site 1 + scope batch 최대 3; memo 시 감소 | override/Workforce row가 없으면 global fast path |
| issue worklog list/editor | 기존 호출 외 policy Jira 0 | resolve 1회 | 정책 기능 hard off면 기존 path |
| timesheet 최대 2000 worklog | 기존 collector 호출 재사용 | project 1 + issue chunk 최대 1~N + WF chunk 최대 1~N | 고유 issue 0, feature off, no override면 즉시 |
| policy batch resolver 최대 100 issue | permissions/check 일괄 1계열 | 최대 3~4 | 빈 목록 즉시, `whereIn` 호출 금지 |
| Workforce refresh | project property 1 + issue property 최대 100, 제한된 동시성 5 | cache batch read 1 + 변경 row만 CAS | revision/digest 동일이면 UPDATE 0 |

Forge 실행 시간 예산을 위해 timesheet에서 고유 issue가 100을 넘으면 SQL은 100개 chunk로 순차 처리하되 deadline/budget을 확인한다. 정책 resolve가 미완료되면 제한을 누락시키지 않고 `POLICY_RESOLUTION_INCOMPLETE`로 제출을 막는다. 단순 조회는 partial 표시와 warning을 허용한다.

diagnostics는 사용자 텍스트 없이 count만 기록/반환한다.

```js
{ contexts, uniqueProjects, uniqueIssues, cacheHits, sqlQueries, jiraCalls,
  workforceUpdated, workforceUnchanged, skipped: { featureOff, noOverride, noTargets, budget } }
```

## 8. Frontend와 사용자 고지

### 8.1 사이트 설정

`TimesheetPolicySettings`를 “기간 정책”과 “워크로그 정책”으로 나눈다. site-only 키를 기간 정책에 두고, worklog 키는 catalog 기반 form으로 렌더링한다. `historyKeepComment`는 기본 false와 개인정보 영향을 한국어/영어로 명시한다.

### 8.2 프로젝트 설정

기존 `ProjectSettings`의 policy modal을 확장한다. 각 행은 다음을 표시한다.

- 현재 effective value
- 선택: `상속` 또는 `직접 설정`
- 출처 badge: 사이트 / Workforce 프로젝트 / Jira 프로젝트
- revision
- Workforce 자물쇠와 “더 엄격하게만 변경 가능” 또는 “이 항목은 변경 불가” 설명
- 저장 충돌 시 최신 값 다시 불러오기

기존 JSON 전체를 form state로 덮지 않고 catalog slice만 수정해 unknown 기존 키를 보존한다.

### 8.3 이슈/worklog 화면

`WorklogDialog`의 기존 approval notice를 policy notice로 확장한다. 저장 버튼 위에서 최소 다음을 항상 고지한다.

- 허용 날짜 범위와 create/edit/delete window
- daily/weekly limit
- 위반 시 경고/차단
- strict preapproval 또는 사후 certification 방식
- 기간 제출/마감 잠금
- 정책 출처 요약과 “자세히” 확장

차단 사유는 `error.code`와 `{templateKey,vars}`만 사용한다. 서버 사용자 텍스트를 그대로 렌더링하지 않는다. issue override 편집은 project admin에게만 보이고, 일반 사용자는 effective read-only view만 본다.

### 8.4 Workforce 진단

`WorkforceLinkSettings`에 policy cache card를 추가한다.

- keyring 준비 여부
- last verified/checked, revision, expiry
- FRESH/STALE/EXPIRED/INVALID/TARGET_MISMATCH
- 마지막 검증본 사용 여부
- “다시 확인” 동작과 해결 가이드

## 9. i18n namespace

한국어와 영어에 동시에 추가한다.

- `worklogPolicy.scope.site|workforceProject|jiraProject|jiraIssue`
- `worklogPolicy.inherit|explicit|locked|tightenOnly`
- `worklogPolicy.notice.createWindow|editWindow|deleteWindow|limit|approvalMode|periodLock`
- `worklogPolicy.authority.fresh|stale|expired|invalid|targetMismatch|keyringMissing`
- `worklogPolicy.error.conflict|locked|invalid|authorityUnavailable|resolutionIncomplete`
- 모든 catalog label/help

에러 변수에는 날짜, 일수, 시간, source enum만 넣고 comment/사용자 입력을 넣지 않는다.

## 10. 실패 모드

| 실패 | 쓰기 동작 | 조회/UI |
|---|---|---|
| policy SQL table 미준비 | fail-close | global fallback + 준비 중 표시 |
| project/issue CAS 충돌 | write 0, `POLICY_CONFLICT` | 최신 row 반환 가능 |
| invalid local JSON | 해당 scope 미적용, admin write 차단 | `INVALID_LOCAL_OVERRIDE` 표시 |
| Workforce signature/issuer/target 실패 | 후보 미적용 | 마지막 verified 상태와 오류 code |
| Workforce expired beyond grace + locked key | 관련 Jira write 0 | read-only last verified + urgent warning |
| permission check partial failure | 보이지 않는 것으로 처리 | denied/unknown id만 count |
| batch budget 소진 | submit/mutation fail-close | 조회 partial warning |
| history recorder 실패 | hot path는 기존 원칙대로 Jira write를 되돌리지 않음 | reconcile 대상으로 진단 |

## 11. 변경 파일과 단계별 구현

### Phase A — domain 및 저장소

- 신규 `src/domain/worklogPolicy/catalog.js`
- 신규 `src/domain/worklogPolicy/merge.js`
- 신규 `src/domain/worklogPolicy/authority.js`
- 신규 domain unit tests
- 신규 `src/rdb/schema/ddl/worklogPolicy.sql.js`: issue override와 feature index
- 수정 `src/rdb/schema/ddl/index.js`, `src/rdb/schema/migrate.js`, migration contract test
- 수정 `src/resolver/settings/SettingsRepository.js`: project revision, batch raw override 보존
- 신규 `src/resolver/worklogPolicy/WorklogPolicyRepository.js`

### Phase B — Workforce 계약과 cache

- 수정 `src/integration/workforce/contract.js`: `TYP.RMS_POLICY`, property key, target/body validator
- 수정 signature validator: issuer/expiry 검증을 rms.policy에 추가
- 신규/수정 `src/resolver/workforce/WorkforcePolicyAuthority.js`
- 수정 `WorkforceLinkRepository.findInboundMany` 재사용 및 policy stats
- fixture와 동일 revision/different digest/expiry/target mismatch tests

### Phase C — resolver와 권한

- 신규 `src/resolver/worklogPolicy/{WorklogPolicyController,WorklogPolicyService,WorklogPolicyResolver}.js`
- 수정 `src/permission/PermissionMap.js`
- 수정 `src/index.js`의 `CONTROLLER_REGISTRARS`
- contract test에서 모든 resolver mapping/registration 확인
- list resolver의 permissions/check scope 축소 test

### Phase D — enforcement

- 수정 `src/resolver/worklog/WorklogService.js`: 실제 issue context 후 1회 resolve, pre-write enforcement
- 수정 `src/resolver/timesheet/PeriodLockService.js`: site-only lock settings 명시
- 수정 `src/resolver/timesheet/TimesheetService.js`: batch resolve와 aggregate limits
- 수정 `src/resolver/timesheet/WorklogCollector.js`: 기존 issue/project map shape를 resolver 입력으로 재사용
- 수정 `WorklogApprovalPolicy`, `WorklogCertificationService`, `WorklogHistoryRecorder/Service`: effective mode/history policy 연결
- create/update/delete 4xx, locked relaxation, stale authority, partial batch tests

### Phase E — UI

- 수정 `static/ui/src/features/settings/TimesheetPolicySettings.jsx`
- 수정 `static/ui/src/features/settings/ProjectSettings.jsx` 및 policy modal
- 수정 `static/ui/src/features/settings/WorkforceLinkSettings.jsx`
- 수정 `static/ui/src/features/worklog/WorklogDialog.jsx`
- 신규 policy detail/read-only components는 먼저 `static/ui/src/components/` 공용 지점을 확인
- 수정 query key factory만 사용; 임의 배열 key 금지
- 한국어/영어 locale과 component tests

### Phase F — 운영 진단과 문서

- 기존 five-minute/hourly job에 hard-off/no-target early exit와 count diagnostics
- 관리자 가이드: 계층, 잠금, stale/expiry, Workforce keyring, 충돌 해결
- 사용자 가이드: 생성/수정/삭제 전 고지, preapproval/certification 차이
- Marketplace 한국어/영어 개인정보·데이터 흐름 문서에 signed cache와 history comment 기본 false 반영

## 12. 검증 계획

구현 완료 후 에이전트가 모두 종료된 다음 한 번만 실행한다.

```text
npm test -- --runInBand
npm run test:ui -- --runInBand
npm run build:ui
forge lint
```

의미 있는 통합 시나리오:

1. site 90일 → Workforce locked 30일 → Jira project 60일 → Jira issue 14일이면 effective 14일, project 60일은 ignored로 기록된다.
2. Workforce 비교 불가 잠금 키에 local override를 저장하면 Jira write/SQL write 모두 0이다.
3. 같은 issue 정책 rev로 두 관리자가 저장하면 한 명만 성공하고 다른 한 명은 conflict다.
4. 목록 100 issue resolve에서 entity property 호출 0, SQL batch 상한 준수, browse 권한 없는 issue 미반환이다.
5. signature 실패 후보가 유효한 verified cache를 덮지 않는다.
6. expiry grace 종료 후 locked createWindow 관련 create는 Jira POST 0이다.
7. `PREAPPROVAL` create는 direct Jira POST 0이고 기존 immutable draft 요청으로 간다. `CERTIFICATION` create는 Jira 기록 후 UNVERIFIED다.
8. 기존 `approval_project_config.policy_json`만 있는 설치에서 별도 data migration 없이 같은 override가 적용된다.

## 13. 실측 필요 항목

다음은 설계 가정이 아니라 배포 전 반드시 확인할 항목이다.

- moves-workforce sender가 `rms.policy` envelope, `iss`, `exp`, canonical signing을 실제로 발행하는지
- 배포 환경 public keyring에 sender `kid`가 존재하고 양쪽 fixture가 동일한지
- project/issue entity property의 실제 property key와 payload size가 계약 상한 안인지
- `/rest/api/3/permissions/check`가 현재 wrapper에서 최대 100 issue를 의도한 shape로 좁히는지
- `loadIssue`가 issue id와 project id를 안정적으로 제공하는지
- Forge SQL 배포 시 v042/v043/v044 번호가 다른 동시 작업과 충돌하지 않았는지

이 항목이 실패해도 서명 미검증 property를 판정에 사용하거나 `asApp()`으로 우회하지 않는다.
