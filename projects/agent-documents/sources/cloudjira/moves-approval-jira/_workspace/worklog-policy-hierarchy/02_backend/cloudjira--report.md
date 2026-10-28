# 백엔드 실제 구현 계약

## 구현 범위

- sparse catalog와 `SITE_DEFAULT → WORKFORCE_PROJECT → WORKFORCE_ISSUE → JIRA_PROJECT → JIRA_ISSUE` merge를 구현했다. absent는 상속, null/unknown/site-only 입력은 거부한다. 각 key는 `value`, `source`, `sourceRevision`, `inherited`, `lock`, `ignored`를 제공한다. `effective.revision`은 opaque digest다.
- Workforce lock의 비교 가능한 key는 authoritative floor보다 강화하는 local override를 허용한다. project에서 강화한 값보다 issue 값이 느슨하더라도 Workforce floor를 지키면 허용한다. 비교 불가능한 comment 정책 lock은 같은 값을 포함한 local override를 거부한다.
- 사이트 KVS와 프로젝트 `policy_json`을 그대로 읽는다. 분 단위 daily/weekly alias는 초로 변환한다. 새 프로젝트 저장은 관련 key만 치환하고 다른 approval 정책 및 unknown JSON을 보존한다. 기존 설정 저장도 unknown JSON 보존과 `policy_rev` CAS를 사용한다.
- Worklog create/edit/delete는 작성일·원래 작성일 기준 window·시간 상한·기간 잠금·approvalMode를 판정한다. PREAPPROVAL direct create는 거절하며 승인된 draft의 apply도 window/시간 상한/기간 잠금을 재검사한다. 기존 UNKNOWN 무재POST 계약을 변경하지 않았다.
- Timesheet는 고유 issue를 batch resolve하여 daily/weekly limit 중 가장 엄격한 값을 적용하고 항목별 날짜 규칙을 판정한다. 증거는 별도 `policy_evidence`에 저장하고 detail에서 `policyEvidence`로 반환한다. 기존 site `EXTRA_STEP`은 action을 scope override하지 않았을 때 유지한다. 새 catalog의 action은 WARN/BLOCK이다.
- 인증 요청/조회는 effective approvalMode를 확인한다. PREAPPROVAL에서는 새 certification 요청을 거부하며 이전 VERIFIED 변경 무효화·기존 진행 중 결정은 보존한다. APP history에는 이미 계산한 effective 정책을 전달하며 native/REST/sweep는 batch resolve한다. scope별 historyEnabled/historyKeepComment를 사용하고 기존 certification 추적은 history off와 별개로 유지한다.

## Resolver API와 프론트 계약

새 controller는 기존과 같은 `{content: 결과}` envelope를 사용한다. `guardedDefine`, PermissionMap, CONTROLLER_REGISTRARS를 모두 등록했다.

| resolver | 입력 | 실제 결과 / 권한 |
|---|---|---|
| getWorklogPolicyCatalog | 없음 | `{catalog,site,siteRevision}` / site admin |
| getProjectWorklogPolicy | `{projectId}` | `{projectId,override,overrideRevision,workforce,effective}` / project admin |
| saveProjectWorklogPolicy | `{projectId,expectedRevision,override}` | 위와 동일 / project admin |
| getIssueWorklogPolicy | `{issueId}` | `{issueId,projectId,override,overrideRevision,effective,canAdmin}` / issue view |
| saveIssueWorklogPolicy | `{projectId,issueId,expectedRevision,override}` | 위와 동일 / project admin + 실제 asUser issue project 일치 검사 |
| resolveWorklogPolicies | `{items:[{issueId}]}` 최대 100 | `{items:[{issueId,projectId,effective}],deniedIssueIds,diagnostics}` / SELF + batch issue browse 좁힘 |
| refreshWorkforcePolicies | `{projectId,issueIds?:[]}` 최대 100 | `{checked,updated,unchanged,failed,items}` / project admin + issue 실제 project 일치 검사 |
| getWorklogPolicyDiagnostics | 없음 (`since`/`limit` 미사용) | cache status/result 집계, features, 현재 응답 카운터 / site admin |

`override`에는 명시적으로 저장한 key만 포함한다. 상속으로 되돌릴 때 해당 key를 제거한 전체 sparse override를 보내야 한다. `expectedRevision`은 0 이상 정수이며 빈 신규 scope는 0이다. 프로젝트 v042 미적용 상태의 legacy revision은 문자열이므로 저장을 비활성화하고 migration 완료를 안내해야 한다. 프로젝트/이슈 저장은 충돌 시 POLICY_CONFLICT, 잘못된 정책은 POLICY_INVALID, lock 침해는 POLICY_LOCKED다. issue가 다른 프로젝트로 이동했다면 기존 override는 적용하지 않는다. 이전 프로젝트에 연결된 override row의 저장은 CAS project predicate 때문에 충돌한다. 이동 후 row 재귀속 기능은 이번 범위에 넣지 않았다.

Worklog list/editor에는 `policy: effective`를 추가했다. mutation 응답의 `policy`는 `{revision,notices,approvalMode}`이며 notices는 `{code,severity,vars,source}`다. BLOCK은 Jira write 전에 WORKLOG_POLICY_BLOCKED로 거부한다. PREAPPROVAL은 WORKLOG_APPROVAL_REQUIRED로 기존 draft 요청 UI를 사용한다. WARN은 성공 응답에 notice가 포함된다. getWorklogCertification에는 `policy: effective`와 mode를 반영한 `canRequest`를 제공한다.

Worklog 목록의 history.enabled/count 조회에는 해당 effective historyEnabled를 전달한다. 별도 `getWorklogHistory`의 기존 enabled/since 메타데이터는 site collection 정보이며 반환되는 과거 rows는 history off에서도 열람할 수 있다. 현재 issue의 수집 on/off 표시에는 새 effective policy를 사용해야 한다.

### 보존 기간 제한 — 최종 root 결정 반영

`historyRetentionMonths`는 **site-only**다. 프로젝트·이슈·Workforce override 입력은 거부하며 UI에서 해당 scope 편집을 제공하면 안 된다. 수동 export→purge가 site cutoff를 사용하는 기존 계약을 유지하기 위한 제한이다. 기존 `worklogHistoryRetentionMonths=0`은 무기한으로 그대로 읽고 유지한다. 사이트 저장 UI/기존 normalizer는 기존 선택지 `[0,3,6,12,24,36]`를 사용한다. catalog의 type bound는 0..120이지만 새 사이트 저장 API를 추가한 것은 아니다.

## Workforce 검증과 캐시

`rms.policy` 및 `movesRms.policy`를 contract registry에 추가했다. 이 typ은 기존 implicit signing entry와 구분되는 다음 explicit envelope를 사용한다.

```js
{ v:1, typ:'rms.policy', iss:'moves-workforce', cloud:cloudId,
  ent:{projectId, issueId?}, iat:epochMs, exp:epochMs, kid,
  body:{rev, values:sparseOverride, locks:{key:boolean}}, sig }
```

서명 메시지는 UTF-8 `moves-link/policy/1\n` + sig를 제외한 envelope의 canonical JSON이다. 기존 WORKFORCE keyring/trustedKids/Ed25519 구현을 재사용한다. issuer/cloud/entity, 5분 미래 skew, 최대 30일 TTL, 만료, key.notAfter, signature, sparse 값과 lock key를 검증한다. 현재 기본 keyring은 비어 있으므로 실제 운영 수신은 신뢰할 Workforce 공개 키 및 환경 설정이 준비되어야 가능하다.

캐시는 `workforce_inbound(typ='rms.policy', entity_id='P:<id>'|'I:<id>')`에 canonical body를 저장하고 기존 rev CAS를 쓴다. 낮은 srcRev는 STALE_REV, 같은 rev의 다른 body/expiry는 EQUIVOCATION, 같은 문서는 UNCHANGED이며 inbound UPDATE를 하지 않는다. 실패 후보는 last verified body를 덮지 않고 lastResult/failCount만 기록한다. refresh는 asUser property GET만 수행하고 새 asApp 경로/manifest scope는 추가하지 않았다. runtime policy merge는 SQL cache만 읽는다.

expiry 전 FRESH, expiry 이후 24시간 STALE grace, 그 뒤 EXPIRED다. grace 이후 unlocked Workforce 값은 fallback하며 locked 값은 unavailable로 유지해 **해당 작업과 관련된 key**의 mutation을 거부한다. 프로젝트/이슈 target가 맞지 않는 cached row는 적용하지 않는다.

## Migration과 변경 파일

시작 시 head는 v041이었다. 배포하지 않았고 기존 migration 이름은 변경하지 않았다.

| 추가 migration | 내용 |
|---|---|
| v042_alter_approval_project_config_policy_rev | 프로젝트 policy_rev INT DEFAULT 1 |
| v043_create_worklog_policy_issue_override | issue/project/sparse JSON/rev/updatedBy |
| v044_create_worklog_policy_feature_index | history 활성 scope의 보수적 hint |
| v045_alter_timesheet_submission_policy_evidence | Timesheet proof MEDIUMTEXT |

v045는 기존 link_json 4000자 한도로 항목별 증거를 안전하게 담을 수 없어서 추가했다. fresh DDL도 동기화했다. 신규 테이블/column은 readiness를 확인하고 empty IN을 차단한다. CAS SET에 rev+1을 포함하고 actor는 context.accountId/principal에서 전달한다.

주요 변경 파일:

- `src/domain/worklogPolicy/{catalog,merge,mutation,authority}.js`, `__test__/WorklogPolicy.test.js`
- `src/resolver/worklogPolicy/{WorklogPolicyRepository,WorklogPolicyResolver,WorklogPolicyAuthority,WorklogPolicyService,WorklogPolicyController}.js`, `__test__/*`
- `src/rdb/schema/ddl/worklogPolicy.sql.js`, `approvalProjectConfig.sql.js`, `timesheet.sql.js`, `src/rdb/schema/migrate.js`, migration test
- `src/permission/PermissionMap.js`, `src/index.js`, `src/integration/workforce/contract.js`
- `src/resolver/settings/{SettingsRepository,SettingsService}.js`
- `src/resolver/worklog/WorklogService.js`, `src/resolver/worklogApproval/{WorklogApprovalPolicy,WorklogApprovalService}.js`
- `src/resolver/timesheet/{TimesheetService,TimesheetRepository,PeriodLockService}.js`
- `src/resolver/worklogHistory/{WorklogHistoryRecorder,WorklogHistoryService}.js`, recorder test
- `src/resolver/worklogCertification/{WorklogCertificationService,WorklogCertificationRepository}.js`
- `src/utils/errors/ErrorCodes.js`, `locales/{kr,en}/error.json`

## 최적화·진단·검증 한계

feature index는 source CAS와 별도 쓰기이므로 history=true hint를 먼저 기록하고 해제 시 positive hint를 지우지 않는다. 충돌/부분 실패가 history를 놓치는 false negative가 되지 않게 한 선택이다. 그래서 과거에 한 번 활성화했던 scope는 보수적 false positive로 sweep가 계속 동작할 수 있다. site=false + hint 없음 + tracked certification 없음이면 Jira read/lease write 전에 FEATURE_OFF로 종료한다. index 미준비는 conservative scan이다. scope별 실제 recording은 최종 effective로 재검사한다. inactive certification을 자동 정리하지 않았으므로 tracked row가 있는 설치는 sweep가 유지된다.

정책 resolve는 issue 100개 chunk당 scope SELECT 최대 3개이며 project가 chunk에 반복되면 다시 읽는다. scope SELECT 카운터는 readiness probe를 제외한다. cacheHits는 verified cache row preload 수다. diagnostics는 현재 응답 범위이며 persistent telemetry가 아니다. SELF resolve의 jiraCalls=2는 기본 browse/bulkfetch 경로의 호출 예산 표시로 partial 실패에서도 실제 물리 호출 수와 다를 수 있다. refresh는 5개 병렬·20초 예산으로 나머지를 BUDGET_DEFERRED로 반환한다. 시간 상한 판정을 위한 collectMine는 기존 Jira 사용자/검색/워크로그 조회를 사용하므로 write latency는 실측해야 한다.

정책 변경, 이슈 이동, 기간 잠금과 Jira POST를 하나의 transaction으로 고정하지 않는다. 검사와 POST 사이 외부 변경을 완전히 차단한다는 보장은 하지 않는다. 신규 cryptographic envelope를 상대 Workforce 구현과 함께 맞추고 실제 Forge SQL DDL·프로젝트 property 지원·키 provisioning을 사이트에서 확인해야 한다. Timesheet의 월 경계 partial week 합산은 기존 period 수집 범위를 유지한다. frontend/docs/build/Forge/전체 테스트/commit은 실행하지 않았다.

## 테스트

관련 backend/contract 테스트만 실행했다.

```text
npm.cmd test -- --runInBand --testPathPatterns="WorklogPolicy|WorklogService|WorklogApproval|WorklogHistory|WorklogCertification|Timesheet|Settings|migrate|permissionMap|workforce"
```

최종 결과: **46 suites / 673 tests 통과**, exit code 0, 27.302초. 로그는 `../backend-test.log`다. 추가 회귀는 sparse inheritance/null/site-only, lock floor, comment lock, expiry grace, mixed limit, original edit window, signature/issuer/entity/TTL/keyring, rollback/equivocation, empty IN, issue owner/project+rev CAS, missing table, unknown JSON 보존, invocation 범위, batch 비용, incomplete budget, moved issue 거절, expired/PREAPPROVAL 판정, sticky verified cache, unchanged UPDATE0, hard-off Jira0/lease0, proof INSERT placeholder와 migration fail-close를 다룬다. 실제 Forge 호출·native Jira UI 사전 차단·브라우저 UX는 이번 단계에서 실측하지 않았다.

## 경험 기록 제안

source CAS와 feature hint를 별도 테이블에 기록할 때 해제 경쟁으로 negative hint를 쓰면 source 활성화 후 hint가 0으로 남을 수 있다. 이번 구현은 positive hint 유지로 누락을 피했고 정확한 비활성화 최적화는 revision을 비교하는 정리 작업이 추가로 필요하다. Vault 외부 쓰기 권한은 요청하지 않았으며 root의 경험 기록 단계에서 반영할 수 있다.
