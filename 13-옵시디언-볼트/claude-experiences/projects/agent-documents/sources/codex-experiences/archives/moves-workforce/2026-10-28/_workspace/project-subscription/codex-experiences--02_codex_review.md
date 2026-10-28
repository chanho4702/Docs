# 코덱스(codex-cli 0.146.0) 설계서 검토 원문

> 대상: 01_architect_design.md v1 · 실행일 2026-08-03 · read-only 샌드박스
> 검토 관점: 사실오류/아키텍처/Forge제약/DB/경계면계약/보안/과설계·누락/보드실현성

검토 결과, **현재 설계 그대로는 구현 착수를 권장하지 않습니다.** 실제 코드는 변경하지 않았으며, 설계 문서·현행 코드·Atlassian 공식 제약만 대조했습니다.

## BLOCKER

### 1. 검색 결과를 변경하면서 `nextPageToken`을 재사용하면 이슈가 누락됩니다

- **문제:** `moves_RMS_projectId IS EMPTY` 결과를 페이지별로 태깅하면 결과 집합이 바뀌므로 다음 cursor가 일부 이슈를 건너뛸 수 있습니다.
- **근거:** 설계 [01_architect_design.md](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:209)는 검색과 태깅을 교차 수행하지만, 현행 pagination은 조회 중 결과를 변경하지 않습니다([IssueApi.js](C:/CloudJira/moves-workforce/src/api/jira/issue/IssueApi.js:399)).
- **수정:** 최대 2,000건은 `전체 issueId 수집 → 고정 목록 batch write` 순서로 처리하고, 대규모 backfill은 `SCAN → immutable batch 저장 → APPLY` 구조로 분리하십시오.

### 2. `backfill=false`가 첫 정합성 스윕에서 바로 무효화됩니다

- **문제:** 백필을 끈 구독도 첫 reconcile의 `updated >= -7d` 조건 때문에 최근 7일 이내 기존 이슈를 편입합니다.
- **근거:** backfill 선택은 [설계 350행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:350), reconcile 창은 [247행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:247)에 정의되어 있습니다.
- **수정:** 구독 시작 시점의 membership baseline과 `last_successful_watermark`를 저장하십시오. SPACE는 생성·project 이동을 구분하고, BOARD는 구독 전부터 조건에 맞던 이슈를 식별할 baseline 없이는 정확한 no-backfill을 보장할 수 없습니다.

### 3. “먼저 태깅한 프로젝트가 이긴다”는 원자적으로 보장되지 않습니다

- **문제:** event·reconcile·backfill·수동 추가가 동시에 `IS EMPTY`를 조회하면 모두 성공할 수 있고 최종 write가 이전 프로젝트 값을 덮습니다.
- **근거:** 설계는 JQL만으로 first-wins를 보장한다고 하지만([01_architect_design.md](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:632)), app-field PUT에는 compare-and-set이 없습니다.
- **수정:** `issue_id UNIQUE` claim 테이블이나 전역 단일 tagging queue를 도입하십시오. `CLAIMED → FIELD_WRITTEN` 상태와 재시도 복구를 정의하고, 실제 신규 claim만 counter에 반영해야 합니다.

### 4. 사용자 입력과 background `asApp` 조합이 confused-deputy 취약점을 만듭니다

- **문제:** 사용자가 추측한 source와 JQL 조각을 저장하면, 이후 background `asApp`이 사용자보다 넓은 범위의 이슈를 태깅할 수 있습니다.
- **근거:** 입력은 `sourceKey/sourceName/issueTypeIds`를 신뢰하지만([01_architect_design.md](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:332)), 검증은 `extraJql/sourceKey` 일부에 그칩니다([01_architect_design.md](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:500)).
- **수정:** `sourceName`은 서버에서 조회하고, create/update 시 source를 `asUser`로 권한 검증한 뒤 `asApp`에서도 접근 가능한지 확인하십시오. `projectId` UUID, issue type 숫자 ID, board ID, project key를 whitelist 방식으로 검증하고 완성된 JQL 전체를 검사해야 합니다.

### 5. BOARD 구현의 scope와 실효 JQL이 잘못되었습니다

- **문제:** 제안된 scope로 board configuration을 호출할 수 없고, Kanban `subQuery`를 제외하면 실제 보드보다 넓은 이슈가 편입됩니다.
- **근거:** 설계 scope는 [554행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:554), 현재 scope는 [manifest.yml](C:/CloudJira/moves-workforce/manifest.yml:315)입니다. Board configuration에는 `read:board-scope.admin:jira-software`와 `read:project:jira`가 필요하며 응답에는 `subQuery`가 포함됩니다([Board REST API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/)).
- **수정:** `(filter.jql) AND (configuration.subQuery)`를 실효 규칙으로 사용하거나 공식 board issue 조회 API 사용을 우선 검토하십시오. JSW 미설치·private board·403·삭제된 filter를 별도 상태로 처리해야 합니다.

### 6. 시간별 reconcile의 최악 실행량이 단일 invocation 용량을 초과합니다

- **문제:** 200개 구독 × 2,000건이면 최대 약 12,000 Jira 요청이 한 invocation에 몰리며 `p-limit(2)`는 총량을 줄이지 못합니다.
- **근거:** 구독·이슈 cap은 [216행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:216), runtime은 [manifest.yml](C:/CloudJira/moves-workforce/manifest.yml:124)입니다. Jira는 `429`와 `Retry-After` 처리를 요구합니다([Jira rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)).
- **수정:** scheduled trigger는 오래된 구독 일부를 queue로 분배만 하고, consumer가 구독별 cursor·요청 수·남은 실행시간 budget을 두고 처리하게 하십시오. `Retry-After`, exponential backoff, jitter도 필수입니다.

## MAJOR

### 1. `updateCustomField` 재사용 전제가 실제 코드와 다릅니다

- **문제:** 해당 함수는 private이고 단일 `issueId`를 raw JSON 문자열에 삽입하므로 배열 공용 API로 import할 수 없습니다.
- **근거:** [ProjectUsersService.js](C:/CloudJira/moves-workforce/src/resolver/projectIssue/ProjectUsersService.js:248)의 구현과 안전한 `JSON.stringify({updates})` 선례인 [demoSeed.js](C:/CloudJira/moves-workforce/src/trigger/demoSeed.js:176)가 다릅니다.
- **수정:** app-field API를 공용 모듈로 추출하고 `{issueIds: number[], value}`를 `JSON.stringify`하십시오. 설계의 batch 50은 공식 문서에 명시된 상한이 아니므로 통합 테스트로 검증해야 합니다([App field values API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-custom-field-values--apps-/)).

### 2. `getSubscriptionSourceOptions`의 permission scope가 사실상 우회됩니다

- **문제:** `R('PROJECT','detail')`인데 입력에 `projectId`가 없어 project membership 검사가 실행되지 않습니다.
- **근거:** 입력 계약은 [설계 313행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:313), guard는 ID가 없으면 검사를 건너뜁니다([permissionGuard.js](C:/CloudJira/moves-workforce/src/permission/permissionGuard.js:39)).
- **수정:** resolver 입력과 query key에 `projectId`를 추가하거나 project-independent endpoint로 분리하십시오. guard도 detail mode에서 ID가 없으면 fail-close하도록 강화해야 합니다.

### 3. 7일 sliding window는 “정확성의 원천”이 될 수 없습니다

- **문제:** 장애나 권한 오류가 7일 이상 지속되면 누락 이슈가 영구적으로 복구되지 않습니다.
- **근거:** 정확성 주장과 고정 창은 [설계 64행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:64) 및 [247행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:247)에 있습니다.
- **수정:** 성공한 run에서만 전진하는 durable watermark, overlap window, continuation cursor와 저빈도 full audit를 조합하십시오.

### 4. 구독 변경·삭제와 queued backfill의 lifecycle이 없습니다

- **문제:** 구독이 비활성화·수정·삭제된 뒤에도 기존 queue event가 이전 규칙으로 이슈를 태깅할 수 있습니다.
- **근거:** 기존 consumer에는 고정 batch idempotency만 존재합니다([consumer.js](C:/CloudJira/moves-workforce/src/queue/consumer.js:19)).
- **수정:** payload에 `subscriptionId`와 `generation/version`을 넣고 매 batch 시작 시 존재·active·version을 재검증하십시오. 취소와 terminal 상태도 저장해야 합니다.

### 5. DB identity와 lifecycle이 불완전합니다

- **문제:** mutable project key를 PK 일부로 사용하고, `issue_type_ids VARCHAR(500)` CSV와 boolean 단독 index를 사용하며 RMS project 삭제 cascade가 빠져 있습니다.
- **근거:** DDL은 [설계 149행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:149), 현재 수동 cascade는 [ProjectService.js](C:/CloudJira/moves-workforce/src/resolver/project/ProjectService.js:91)에 있습니다.
- **수정:** PK는 immutable `source_id` 기반으로 구성하고 key/name은 snapshot으로 저장하십시오. issue type은 JSON/TEXT 또는 자식 테이블로 분리하고 `(is_active,last_synced_at)` scheduler index와 project 삭제 순서를 추가하십시오.

### 6. `TableReadiness` “등재” 절차는 실제 코드에 없습니다

- **문제:** `TableReadiness.js`는 테이블 목록 registry가 아니라 이름을 받아 probe하는 범용 helper입니다.
- **근거:** 설계는 등재를 요구하지만([01_architect_design.md](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:185)), 실제 구현은 [TableReadiness.js](C:/CloudJira/moves-workforce/src/rdb/schema/TableReadiness.js:42)입니다.
- **수정:** repository에 `PROJECT_SUBSCRIPTION_TABLE`과 `isProjectSubscriptionReady()`를 정의하고, read-safe/write-fail-close 경로를 만드십시오.

### 7. 기존 `job/job_batch` 모델은 cursor 재귀 backfill과 호환되지 않습니다

- **문제:** 현재 job 완료 판정은 생성 시 확정된 `totalBatches`를 전제로 하므로 페이지 수가 동적으로 늘어나는 backfill을 그대로 표현할 수 없습니다.
- **근거:** [consumer.js](C:/CloudJira/moves-workforce/src/queue/consumer.js:125)의 완료 판정이 고정 batch 수를 순회합니다.
- **수정:** 먼저 immutable batch 목록을 생성하거나, backfill 전용 run/cursor/progress 모델을 도입하십시오.

### 8. issue search 계약과 resolver envelope가 불완전합니다

- **문제:** `fields=` 빈 query는 현행 패턴이 아니며 `responseWrapper`가 자동으로 `content`를 생성한다는 전제도 틀립니다.
- **근거:** 현행 search는 `nextPageToken`과 명시적 `fields`를 사용합니다([IssueApi.js](C:/CloudJira/moves-workforce/src/api/jira/issue/IssueApi.js:400)); wrapper는 service 결과를 단순 spread합니다([ResponseWrapper.js](C:/CloudJira/moves-workforce/src/utils/ResponseWrapper.js:3)).
- **수정:** enhanced POST body에 `fields: []` 또는 검증된 최소 fields를 사용하고, 7개 service가 모두 `{content:{...}}`를 반환하도록 contract test를 추가하십시오.

### 9. Modal 탭 설계가 기존 단일 form 구조와 충돌합니다

- **문제:** `BaseModal`은 body 전체를 하나의 form과 footer로 감싸므로 두 탭에 별도 submit을 단순 추가할 수 없습니다.
- **근거:** [CommonModal.jsx](C:/CloudJira/moves-workforce/static/ui/src/components/modal/CommonModal.jsx:31)와 현재 사용부 [IssueAddModal.jsx](C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx:128)를 보면 단일 submit 구조입니다.
- **수정:** `activeTab`별 submit/footer를 상위에서 전환하거나 modal에 form-less mode를 추가하십시오. 읽기 권한만 있는 사용자의 구독 목록 진입도 modal open 조건과 분리해야 합니다.

### 10. frontend invalidation만으로는 즉시 정합성이 확보되지 않습니다

- **문제:** 진행률·비용의 backend KVS cache와 Jira search indexing이 남으므로 1.5초 지연 후 refetch는 최신 결과를 보장하지 않습니다.
- **근거:** backend cache는 [ProjectProgressService.js](C:/CloudJira/moves-workforce/src/resolver/projectProgress/ProjectProgressService.js:58), 고정 지연은 [설계 472행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:472)에 있습니다.
- **수정:** 관련 backend cache를 명시적으로 무효화하고, enhanced search의 `reconcileIssues` 또는 bounded polling으로 “반영 중” 상태를 처리하십시오([Issue search API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)).

## MINOR

### 1. `extraJql` 문법 검증만으로 실행 문맥 차이를 막지 못합니다

- **문제:** `currentUser()` 같은 함수는 preview의 `asUser`와 background `asApp`에서 결과가 달라질 수 있습니다.
- **근거:** `/jql/parse`는 현재 실행 문맥에서 검증합니다([JQL API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-jql/)).
- **수정:** context-dependent 함수 허용 정책을 정하고 조립된 전체 JQL을 user/app 양쪽 문맥에서 검증하십시오.

### 2. source options pagination 계약이 없습니다

- **문제:** Jira project·board 목록은 paginated인데 resolver 응답에 cursor와 `isLast`가 없습니다.
- **근거:** 응답 계약은 [설계 315행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:315)입니다.
- **수정:** `cursor/maxResults` 입력과 `nextCursor/isLast/total` 응답을 추가하십시오.

### 3. query key 정규화가 부족합니다

- **문제:** issue type 순서·중복과 `extraJql` 공백 차이가 동일 규칙을 서로 다른 cache entry로 만듭니다.
- **근거:** 현행 계층형 factory는 [projectKeys.js](C:/CloudJira/moves-workforce/static/ui/src/utils/queryKey/projectKeys.js:41)입니다.
- **수정:** `scope(projectId) → list/sources/preview` 계층을 사용하고 공통 `normalizeSubscriptionRule()`을 정의하십시오.

### 4. backend `p-limit`이 직접 의존성으로 선언되어 있지 않습니다

- **문제:** transitive dependency에 기대면 package-lock 변경 시 backend build가 깨질 수 있습니다.
- **근거:** root [package.json](../../../../../../cloudjira/moves-workforce/package.json)에는 직접 선언이 없습니다.
- **수정:** backend에서 새로 사용한다면 root package에 직접 추가하고 프로젝트 package manager로 설치하십시오.

### 5. 통계 컬럼의 의미가 모호합니다

- **문제:** `tagged_count`가 현재 소속 수인지 누적 편입 수인지 정의되지 않아 삭제·이동·중복 retry 후 값이 신뢰하기 어렵습니다.
- **근거:** 누적 갱신은 [설계 248행](C:/CloudJira/moves-workforce/_workspace/project-subscription/01_architect_design.md:248)에 있습니다.
- **수정:** `lifetime_tagged_count`, `last_run_tagged_count`, `current_claim_count`를 분리하거나 최소한 의미와 재계산 방식을 명시하십시오.

## 잘한 부분

- 물리 태깅을 유지해 `moves_RMS_projectId`에 의존하는 다수의 기존 JQL 경로를 수정하지 않는 선택은 타당합니다.
- read-only custom field를 app-field PUT으로 갱신하는 방향과 기존 `write:app-data:jira` scope 사용은 맞습니다.
- `CONTROLLER_REGISTRARS`, `PermissionMap` deny-by-default, query-key factory, i18n merge 패턴을 따르려는 방향은 현행 구조와 일치합니다.
- `BINARY(16)`, composite PK, migration chain 끝에 v015 추가, FK에 의존하지 않는 수동 cascade 방향은 Forge SQL 제약에 적합합니다. Forge SQL은 FK를 지원하지 않고 API 호출당 한 statement만 허용합니다([Forge SQL](https://developer.atlassian.com/platform/forge/storage-reference/sql/), [SQL query policy](https://developer.atlassian.com/platform/forge/storage-reference/sql-query-policy/)).
- event를 저지연 경로, reconcile을 복구 경로로 나누는 2단계 철학 자체는 좋습니다. 문제는 현재 cursor·baseline·ownership 설계로는 reconcile이 정확성의 원천이 되지 못한다는 점입니다.

## 이 설계대로 구현을 시작해도 되는가

**아니요.** 최소한 mutable pagination, `backfill=false`의 정확한 의미와 baseline, 원자적 ownership, `asApp` 보안 경계, BOARD scope·`subQuery`, invocation fan-out을 먼저 수정한 뒤 설계를 재검토해야 합니다. 이 여섯 항목을 확정하지 않고 backend와 frontend 구현을 병렬 시작하면 누락·오편입·권한 초과·소유권 덮어쓰기 문제가 구조적으로 남습니다.
