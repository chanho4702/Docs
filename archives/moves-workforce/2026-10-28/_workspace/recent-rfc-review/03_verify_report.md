# RFC-176 · RFC-171 · RFC-163 통합 코드·설계 검증 리포트

- 검토일: 2026-08-04
- 검토 기준 HEAD: `3f0e73a`
- 범위:
  - RFC-176 commit `ea5ef4a` — 팀 분석 필터·차트 및 배정 관계도
  - RFC-171 commits `eaaf08d`, `a59371c` + 현재 working-tree 후속 변경 — 프로젝트 구독
  - RFC-163 commit `1cfc9bf` + 현재 급여 밴드 cache 후속 변경 — 급여 정책
- 방식: 설계 문서 ↔ resolver/service/repository ↔ SQL/KVS/Jira API ↔ frontend query/consumer ↔ 테스트를 양방향 교차 검토
- 최종 판정: **세 RFC 모두 실패, production 배포 차단 권고**

## 1. 전체 결론

총 **45건**을 기록했다.

| RFC | 판정 | P0 | P1 | P2 | P3 | 합계 |
|---|---:|---:|---:|---:|---:|---:|
| RFC-176 | 실패 | 0 | 5 | 6 | 2 | 13 |
| RFC-171 | 실패 | 2 | 7 | 9 | 3 | 21 |
| RFC-163 | 실패 | 2 | 6 | 2 | 1 | 11 |
| **전체** | **배포 차단** | **4** | **18** | **17** | **6** | **45** |

가장 먼저 막아야 할 문제는 다음 네 건이다.

1. RFC-171 preview가 source 접근 권한을 확인하지 않고 `asApp` Jira search 결과의 issue key·summary를 사용자에게 노출한다.
2. RFC-171 source-level PK가 겹치는 source의 같은 issue를 보호하지 못해 두 RMS 프로젝트가 비결정적으로 app field를 덮어쓴다.
3. RFC-163 `getSummaryData`가 `PROJECT_COST` 없이도 `INDIVIDUAL` 정책의 `total_salary`를 반환한다.
4. RFC-163 정책 전환 뒤 이미 cache된 개인 금액이 다른 브라우저와 active 화면에 계속 표시된다.

테스트는 backend **65 suites / 1,057 tests**, frontend **64 suites / 1,074 tests**가 모두 통과했다. 그러나 현재 테스트 doubles는 KVS eventual consistency, 여러 QueryClient, SQL/Forge payload 한도, opaque cursor의 invocation 간 재사용, 동시 write, schema upgrade 선후관계를 모델링하지 않는다. 따라서 이번 결과는 “단위 계약은 안정적이지만 운영 경계가 안전하지 않다”로 해석해야 한다.

## 2. 사용자가 제보한 급여 밴드 즉시 반영 문제

### 2.1 확인된 직접 원인

RFC-163 원본의 `LevelPage` mutation 성공 경로는 `backofficeKeys.levels()`만 무효화했다. 하지만 급여 밴드는 다음 별도 cache의 응답 또는 계산 결과에도 들어간다.

- 인력 관리: `userKeys.all`
- 프로젝트 급여: `projectKeys.salaryAll()`
- 프로젝트 비용: `projectKeys.costAll()`
- 프로젝트 요약: `projectKeys.summaryAll()`
- portfolio/team analytics: `portfolioKeys.dashboard()`
- dashboard salary item: `getChartDataById` 계열

따라서 최초 증상인 “급여 밴드 저장 후 인력 관리의 급여 범위가 그대로이고 새로고침해야 바뀜”은 query-key dependency 누락으로 설명된다.

현재 working tree의 미커밋 `salaryBandInvalidation.js`는 앞의 첫 다섯 prefix를 묶어 무효화하므로 기존보다 방향은 맞다. 다만 다음 이유로 **완전한 수정으로 판정할 수 없다**.

1. portfolio dashboard와 dashboard salary chart prefix가 빠져 있다.
2. 같은 브라우저의 TanStack Query만 갱신하며 다른 브라우저/사용자 session에는 전파되지 않는다.
3. level 저장 후 다시 읽는 `entity().query().getMany()`는 eventually consistent다. 즉 즉시 refetch가 변경 전 band를 반환하고 그 값을 다시 5분 cache할 수 있다.
4. ProjectCost KVS cache와 portfolio SQL snapshot은 policy enum만 비교한다. policy가 계속 `LEVEL_BAND`인 상태에서 대표값만 바꾸면 이전 계산 basis를 정상 cache로 재사용한다.
5. mutation response가 저장된 level DTO를 반환하지만 parent success handler가 이를 이용한 `setQueryData`를 하지 않는다.

### 2.2 권장 정합성 계약

- 현재 화면의 level/user DTO는 mutation response를 정본으로 `setQueryData`한 뒤 관련 prefix를 invalidate한다.
- 계산 정본에는 `salaryBasisVersion` 또는 canonical band fingerprint를 도입하고 ProjectCost cache와 portfolio snapshot에 함께 저장한다.
- 계산에 실제 필요한 level만 `entity().get(levelKey)`로 strict-consistent 조회하거나, strict-consistent 단일 salary catalog/version key를 둔다.
- 정책 전환과 band basis 변경을 구분한다. 둘 모두 revision을 올리되 민감정보 revocation은 현재 policy가 확인될 때까지 fail-close한다.
- “즉시”의 제품 SLA를 정하고, 다른 session에는 version polling 또는 이에 준하는 갱신 메커니즘을 사용한다.

공식 문서상 KVS/Custom Entity query는 eventually consistent이고 `get`은 strictly consistent하다. query invalidation은 active query를 refetch하게 할 뿐, 저장소가 최신 값을 반환한다는 보장은 아니다. [Forge KVS consistency](https://developer.atlassian.com/platform/forge/storage-reference/kvs/), [Custom Entity query](https://developer.atlassian.com/platform/forge/storage-reference/entities-api-query/), [TanStack Query invalidation](https://tanstack.com/query/latest/docs/react/guides/query-invalidation)

## 3. RFC별 핵심 판정

### 3.1 RFC-176 — 팀 분석·배정 관계도

상세 보고서: [rfc-176-review.md](./rfc-176-review.md)

#### P1

1. **선택 팀의 모집단 불일치**  
   KPI와 롤업은 전체 subtree 누적값을 사용하지만 비교·구성·프로젝트 스택은 선택 team direct scope로 다시 집계한다. 같은 화면에서 공수·참여 인원·조직 인원의 분모가 달라진다.

2. **배정 mutation 뒤 관계도 stale cache**  
   인력 단건 추가·삭제·팀 일괄 배정 성공 시 board/pool만 invalidate하고 `resourceKeys.allocation`은 invalidate하지 않는다. 관계도는 최대 5분 이상 이전 `projectusers` 상태를 표시한다.

3. **팀 분석의 전 프로젝트 대형 payload overfetch**  
   `PortfolioSnapshotQuery.SELECT_ALL`이 LIMIT 없이 모든 프로젝트의 `members_json`, `monthly_effort_json`, `weekly_effort_json`을 읽고 parse한 뒤 권한 scope를 적용한다. 팀 분석에는 월·주 추이가 불필요하다.

4. **관계도 15개 cap의 backend 보호 실패**  
   SQL은 전체 프로젝트×인력 행을 읽고 전체 Forge response를 만든다. 15개 cap은 그 후 browser에서 적용되므로 SQL 4MiB/5초와 invocation response 한도를 막지 못한다.

5. **프로젝트 membership 동시 중복**  
   `projectusers`는 임의 UUID PK와 일반 index만 있고 `(project_id, account_id)` UNIQUE가 없다. `NOT EXISTS` check-then-insert는 동시 요청에서 중복 행을 막지 못한다.

#### P2/P3 요약

- `Not Done`, `Incomplete`, `Unfinished`를 종료 상태로 판정하는 부분 문자열 정규식
- 최종 설계보다 넓은 `getTeamAnalyticsScope` resolver grant
- metric의 `missing[field]`를 KPI/롤업이 무시해 부분합을 완전한 값처럼 표시
- 설계상 7개 비교 축 중 4개만 노출
- unknown team을 unassigned로 오표기하거나 UUID를 노출
- 팀 전체 배정을 단일 invoke/INSERT로 보내며 상한과 chunk 부재
- 새 control의 label/pressed/expanded 접근성 상태 누락
- 최종 설계 문서에 폐기된 gate·trend·동시성 보장 잔존

#### 긍정 확인

- resolver 이름과 frontend unwrap shape는 일치한다.
- server visibility scope는 최초 집계 전에 적용되어 비가시 팀이 재등장하지 않는다.
- 관계도 user meta는 distinct account bulk 조회이며 per-user Jira N+1은 없다.
- graph tooltip은 untrusted text를 escape한다.

### 3.2 RFC-171 — 프로젝트 구독

상세 보고서: [rfc-171-review.md](./rfc-171-review.md)

#### P0

1. **preview confused-deputy**  
   `previewSubscriptionMatchesService`가 `assertSourceAccessible` 없이 count 3회와 sample search를 `asApp`으로 실행한다. restricted source의 issue key·summary·type과 count가 노출될 수 있다.

2. **issue-level first-wins가 원자적이지 않음**  
   SPACE와 BOARD, 서로 다른 BOARD는 같은 issue를 포함할 수 있다. 두 worker가 동시에 `IS EMPTY`를 읽고 unconditional app-field PUT을 하면 마지막 write가 이긴다. source PK는 이 충돌을 막지 못한다.

#### P1

1. `FIND_SWEEP_BATCH` SELECT에 `baseline_at`이 빠져 scheduled reconcile에서 `backfill:false`의 과거 issue 제외가 무력화된다.
2. 2,000건 cap/예산 종료 시 partial APPLY 후 opaque `nextPageToken`을 저장한다. 결과집합이 줄어든 다음 invocation에서 같은 token을 쓰면 남은 issue를 건너뛸 수 있다.
3. BOARD list/meta/configuration 호출에 필요한 Jira Software granular scope가 manifest에 없다.
4. scheduled/manual sweep에 lease와 generation-conditional commit이 없어 duplicate trigger, update/delete 중 old runner가 낡은 규칙으로 write할 수 있다.
5. create INSERT 후 최대 20초/60 request의 backfill SCAN을 일반 25초 resolver에서 실행한다. 저장은 성공했지만 client는 timeout을 받는 반쪽 성공이 가능하다.
6. queue push partial acceptance/실패를 처리하지 않고 RUNNING job을 TTL 없이 먼저 저장해 영구 고아 job과 일부 누락이 가능하다.
7. update는 source access를 재검증하지 않고 BOARD create도 background가 실제 사용하는 configuration/filter의 app access를 끝까지 검증하지 않는다.

#### P2/P3와 효율 문제

- manual sync의 `content.status:'ERROR'`를 UI가 성공 toast로 먼저 표시
- 429 `Retry-After`를 버리고 고정 60초 retry 사용
- Jira PUT·SQL counter·KVS done marker 비원자성, 완료 확인의 O(B²) KVS read
- 편입 완료 뒤 ProjectCost/Progress backend KVS cache 무효화와 bounded job polling 부재
- preview가 `backfill` 상태를 query key/payload에서 제외
- JQL parse/count/sample 장애를 유효/0건으로 fail-open
- 프로젝트당 10개 제한의 COUNT→INSERT race와 project delete의 비원자적 다단계 cleanup
- source cursor를 UI가 버리고 첫 100 SPACE/50 BOARD만 표시
- 구독 목록 1 SQL 후 최대 10개 source별 Jira meta N+1 burst
- project 전환 뒤 `forcedSpaceKeys` 잔존, BOARD chip 무반응, issue type editor 누락
- 404/403/429/5xx 상태 의미 축약
- quoted string의 `order by`까지 잘라내는 regex
- 긴 JQL을 GET URL로 전송

#### 긍정 확인

- 같은 source의 중복 owner는 `(source_type, source_id)` PK가 막는다.
- JQL 생성 규칙은 공통 builder로 모여 있다.
- push 50 events, app-field 50 issue batch, APPLY `p-limit(2)`는 명시된 구현 상한에 맞는다.
- resolver 등록, PermissionMap 이름, response envelope, frontend invoke가 일치한다.

### 3.3 RFC-163 — 급여 정책

상세 보고서: [rfc-163-review.md](./rfc-163-review.md)

#### P0

1. **`getSummaryData`의 개인 급여 노출**  
   `DASHBOARD read`만으로 resolver를 호출할 수 있고, `INDIVIDUAL`이면 `PROJECT_COST` 확인 없이 `SUM(projectusers.salary)`를 반환한다. 1인 프로젝트에서는 합계가 곧 개인 금액이다.

2. **정책 전환 후 cache된 개인 금액 revocation 실패**  
   다른 browser/session에는 invalidation이 전달되지 않는다. 현재 browser도 settings 10분, user 3분, portfolio/chart 5분 cache가 응답 자체의 old policy를 우선해 계속 raw 금액을 렌더할 수 있다.

#### P1

1. enum 손상·오타·미래 값 등 정확한 `LEVEL_BAND` 외 모든 값을 `INDIVIDUAL`로 normalize해 fail-open한다.
2. band 값 변경이 ProjectCost cache와 portfolio snapshot identity에 포함되지 않고 eventual list query가 이전 값을 다시 cache할 수 있다.
3. level 목록이 `.limit(100)` 한 page에서 조용히 잘려 이후 level의 비용이 0/unpriced로 계산된다.
4. 급여 관리의 `unpricedMemberCount`가 프로젝트 전체가 아니라 현재 10개 page만 센다.
5. representative만 있거나 min/max가 일부만 있는 partial band, 범위 밖 representative를 저장할 수 있어 표시 범위와 비용 계산이 모순된다.
6. `salary_policy` column migration 전에 새 code가 실행될 수 있는 upgrade compatibility window가 있다.

#### P2/P3

- portfolio/team analytics snapshot에 `unpricedMemberCount`와 completeness가 없어 band 누락으로 생긴 0원을 정상 비용처럼 표시
- Custom Entity 32-bit integer 범위를 넘는 급여 금액에 대한 제품 계약·domain error 부재
- SETTINGS read-only 사용자에게 정책 변경 UI가 활성화

#### 긍정 확인

- 새 호출에 대해 LEVEL_BAND일 때 user 목록/상세/Excel, project salary, chart, portfolio raw salary를 제거하는 server gate가 구현돼 있다.
- portfolio aggregation은 salary policy context를 project loop 밖에서 한 번만 읽고 concurrency를 제한한다.
- SQL UPSERT column/placeholder/bind shape가 일치한다.
- 추가 query key는 factory를 사용한다.

## 4. RFC 간 상호작용

| 변경 원천 | 영향 소비자 | 현재 문제 |
|---|---|---|
| RFC-163 level band 수정 | RFC-176 portfolio/team cost | portfolio query invalidation과 snapshot basis version이 없어 이전 비용을 정상값으로 표시 |
| RFC-163 policy 전환 | RFC-176 team analytics | 공유 `portfolioKeys.dashboard()`의 cached individual salary가 다른 session에서 계속 소비될 수 있음 |
| RFC-171 issue 자동 편입 | RFC-163 project cost/progress | frontend query만 invalidate하며 backend 10분 KVS cache는 남음 |
| RFC-171 issue 자동 편입 | RFC-176 resource/analytics | Jira enhanced search의 eventual consistency와 snapshot 갱신 지연으로 화면별 프로젝트 귀속 시점이 갈림 |
| RFC-176 team bulk assignment | RFC-163 salary/cost, RFC-176 graph | membership UNIQUE 부재로 동시 중복 시 인원·공수·급여가 함께 부풀 수 있음 |
| RFC-176 portfolio reuse | RFC-163 privacy/basis | 권한 masking은 응답 후 수행되고 SQL에서는 raw salary JSON을 전량 읽음 |

공통 원인은 cache dependency와 데이터 무결성을 UI 또는 application-level 관례로만 유지하고 DB/storage identity에 넣지 않은 것이다. 다음 세 정본이 필요하다.

1. issue ownership: issue별 atomic claim/owner
2. project membership: `(project_id, account_id)` UNIQUE
3. salary calculation basis: strict-consistent `salaryBasisVersion`

## 5. DB·KVS·Jira API 효율성 판정

### 과도하거나 위험한 경로

| 경로 | 비용/한도 위험 | 판정 |
|---|---|---|
| RFC-176 team analytics | 전 project snapshot + 대형 JSON 3종, LIMIT 없음 | P1 |
| RFC-176 allocation graph | 전체 projectusers 조회 뒤 client에서 15개 cap | P1 |
| RFC-176 bulk team assignment | team 전체를 단일 invoke/INSERT | P2 |
| RFC-171 create backfill | 일반 resolver에서 최대 60 Jira search/20초 | P1 |
| RFC-171 preview | 입력 변화당 parse 1 + count 3 + sample 1 수준, 일부 동시 실행 | P2 |
| RFC-171 source search | debounce/min length 없이 입력 문자열마다 Jira+SQL query | P2 |
| RFC-171 subscription list | 1 SQL + source별 Jira meta 최대 10개 동시 burst | P2 |
| RFC-171 job completion | batch 완료 때 전체 marker 재조회로 O(B²) KVS reads | P2 |
| RFC-163 level catalog | eventual query 1 page/100건, cursor 무시 | P1 correctness |
| RFC-163 ProjectCost/portfolio | band revision 없이 10분 KVS cache/SQL snapshot 재사용 | P1 correctness |

### 적절한 경로

- RFC-176 관계도 Jira user meta는 distinct account bulk 조회다.
- RFC-176 팀 metadata/settings/status/role 조회는 병렬화되어 있다.
- RFC-171 app-field PUT 50개 chunk와 `p-limit(2)`는 무제한 fan-out이 아니다.
- RFC-163 salary policy context는 portfolio aggregation batch마다 1회만 읽는다.
- RFC-163 snapshot `salary_policy`에 별도 index를 만들지 않은 결정은 현재 filter/order 패턴상 타당하다.

Forge SQL은 SELECT 5초, DML 10초, response 4MiB, query memory 16MiB 등의 한도를 가지며 호출당 한 statement만 지원한다. 일반 invocation은 25초이고 async/scheduled 장기 실행은 manifest 설정 안에서 사용해야 한다. [Forge SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/), [Forge invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/), [Forge platform quotas](https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/)

## 6. 공식 문서 적합성

| 공식 계약 | 관련 구현 | 판정 |
|---|---|---|
| 사용자 대신 product API를 호출할 때 `asUser` 우선, `asApp` 응답 노출 전 권한 검증 | RFC-171 preview `asApp` search | 실패 |
| Jira 429에서 `Retry-After`, backoff/jitter 처리 | RFC-171 app-field retry | 실패 |
| Async events는 at-least-once이며 partial push/retry를 처리 | RFC-171 job/consumer | 실패 |
| Scheduled trigger는 app error retry가 없고 duplicate invocation 가능 | RFC-171 reconcile lease 없음 | 실패 |
| KVS query는 eventually consistent, `get`은 strictly consistent | RFC-163 band 재조회/계산 | 설계 누락 |
| Custom Entity query page 최대 100, cursor 순회 | RFC-163 level list | 실패 |
| TanStack prefix invalidation은 stale 처리와 active refetch | current salary helper/subscription keys | API 사용 자체는 통과, 정합성 보장으로는 불충분 |
| SQL/Invocation payload와 runtime 한도 | RFC-176 전량 JSON, RFC-171 sync scan | 실패 |
| Jira Software endpoint별 granular scope | RFC-171 BOARD API | manifest 미충족 |
| Enhanced JQL search는 즉시 read-after-write를 항상 보장하지 않음 | RFC-171 편입 후 조회/재조정 | 보완 필요 |

관련 공식 문서:

- [Forge shared responsibility model](https://developer.atlassian.com/platform/forge/shared-responsibility-model/)
- [Forge authorize API](https://developer.atlassian.com/platform/forge/runtime-reference/authorize-api/)
- [Async Events API](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/)
- [Async event error handling](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api-error-handling/)
- [Async event limits](https://developer.atlassian.com/platform/forge/limits-async-events/)
- [Scheduled trigger](https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/)
- [Jira rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- [Jira enhanced search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Jira Software scopes](https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-jsw/)

## 7. 실행 검증

### 통과

- Backend: `npm test -- --runInBand`
  - 65 suites, 1,057 tests 통과
- Frontend: `static/ui`에서 `npm test -- --runInBand`
  - 64 suites, 1,074 tests, snapshot 1개 통과
- Frontend production compile: `npm run build:app` 통과
- Bundle budget: 통과
  - main gzip 273,115B / budget 1,625,293B
- `git diff --check`: whitespace error 없음

실패 경로 테스트가 의도적으로 출력한 `console.error` 외 Jest 실패는 없었다. build에는 기존 Atlaskit source-map 누락/CSS order warning이 있었으나 compile과 budget은 통과했다.

### 미검증

- 전체 `npm run build`: 다른 검토 실행에서는 124초 timeout이었다. `prebuild` locale merge가 현재 사용자의 dirty merged locale과 겹치므로 최종 release build는 clean/reviewed tree에서 다시 실행해야 한다.
- `forge lint`: app root에서 120초 동안 출력 없이 timeout되어 통과로 간주하지 않았다.
- development tenant deploy/install/upgrade 및 browser E2E
- restricted Jira source, private board/filter, issue security의 live 권한 조합
- KVS write 직후 stale duration과 101개 이상 Custom Entity cursor E2E
- SQL 4MiB/5초 실제 임계 row 수와 `EXPLAIN`
- duplicate scheduled invocation, concurrent membership/ownership race
- v014→v015 schema upgrade 순서와 migration failure recovery

## 8. 명시적으로 남기는 애매한 항목

확인되지 않은 내용을 결함으로 단정하거나 묵시적으로 통과시키지 않았다.

1. **KVS eventual-consistency 지연 시간**  
   공식 문서는 지연 상한을 보장하지 않는다. invalidate 직후 얼마나 오래 old band가 보이는지는 tenant E2E로 계측해야 한다.

2. **RFC-163 정책 변경의 “즉시” SLA**  
   같은 browser active 화면, focus 복귀, 다른 session 중 어느 범위를 몇 초 안에 은닉해야 하는지 제품 계약이 없다. 민감정보이므로 현재 검토는 unknown/loading도 숨기는 fail-close를 권고한다.

3. **salary band catalog 최대 개수와 금액 상한**  
   level을 100개 미만으로 제한할지 cursor로 전량 지원할지, 32-bit integer를 제품 한도로 인정할지 결정이 없다.

4. **RFC-171 구독 해제 후 기존 issue app field 처리**  
   현재는 의도적으로 field를 지우지 않는다. 같은 source를 다른 RMS 프로젝트가 다시 구독할 때 기존 issue가 옛 owner에 남는 것이 제품 정책인지, 재편입해야 하는지 결정이 필요하다.

5. **product event payload completeness**  
   실제 `avi:jira:created:issue` payload에 `fields.created`와 subtask 정보가 항상 포함되는지 live capture하지 않았다. 없을 때 match로 진행하는 현재 정책은 확인 후 fail-close/defer 여부를 정해야 한다.

6. **app-field PUT의 50 issue batch**  
   공식 endpoint 문서에서 명시적 issueIds 최대 개수를 확인하지 못했다. 현재 50은 보수적 구현값이며 live smoke test가 필요하다.

7. **subscription sweep index 실행 계획**  
   `ORDER BY last_synced_at IS NULL DESC, last_synced_at ASC`가 `idx_subscription_sweep`를 효율적으로 쓰는지 실제 `EXPLAIN`/Forge SQL slow metrics 확인이 필요하다.

8. **RFC-176 team 선택 의미**  
   “선택 team direct only”인지 “선택 team subtree 포함”인지 문구와 컴포넌트 동작이 갈린다. 제품 결정을 먼저 한 뒤 모든 KPI/차트를 한 모집단으로 통일해야 한다.

9. **실제 규모 임계값**  
   SQL/Forge 한도 위반 가능 경로는 코드상 확정이지만 실패가 시작되는 project/member/team 수는 tenant 데이터 크기에 따라 달라 load test가 필요하다.

10. **동시성 race의 실제 재현 빈도**  
    UNIQUE/CAS/lease가 없어 가능한 상태는 확정이지만 production 발생 빈도는 관측되지 않았다. 빈도가 낮아도 데이터 무결성 invariant는 DB/ledger에서 보장해야 한다.

## 9. 수정 우선순위

### 1단계 — 즉시 보안·무결성 차단

1. RFC-171 preview를 source gate + `asUser` search로 변경한다.
2. issue-level atomic claim/ownership ledger로 overlapping source의 first-wins를 보장한다.
3. RFC-163 summary 응답에 `PROJECT_COST` gate를 추가한다.
4. 현재 policy와 response policy의 fail-closed 교집합으로 cached 개인 금액을 즉시 숨긴다.
5. `projectusers(project_id, account_id)` UNIQUE를 migration으로 추가한다.

### 2단계 — 재개·cache 정합성

1. subscription에 lease, expected generation, cross-invocation cursor 규약을 추가한다.
2. backfill scan과 manual sync를 async job으로 옮기고 partial push/stale job recovery를 구현한다.
3. `salaryBasisVersion`과 strict-consistent band source를 도입한다.
4. subscription APPLY 완료 시 project cost/progress backend KVS cache와 frontend query를 함께 갱신한다.

### 3단계 — 용량·효율

1. team analytics 전용 bounded projection/aggregation endpoint를 만든다.
2. allocation graph filter/cap을 backend SQL에 내리고 cursor pagination을 적용한다.
3. source list infinite pagination, subscription meta bounded concurrency/cache, preview/source input debounce를 적용한다.
4. level pagination과 project-wide unpriced count를 구현한다.

### 4단계 — 의미·UX·운영

1. team selection 모집단, salary partial band, unsubscribe lifecycle 정책을 확정한다.
2. metric missing/completeness, unknown team, manual sync partial failure를 UI에 명시한다.
3. schema two-phase migration/readiness와 BOARD scope upgrade 절차를 검증한다.
4. 접근성, i18n 오류, 문서 drift를 정리한다.

## 10. 결론

이번 세 RFC는 기능의 기본 wiring과 단위 테스트가 잘 갖춰져 있지만, production 안정성을 좌우하는 권한·동시성·저장소 일관성·용량 경계가 설계에서 충분히 모델링되지 않았다. 특히 현재 급여 밴드 query-key 후속 수정은 제보된 화면 cache 문제의 일부만 해결하며, KVS eventual consistency와 server cache/snapshot revision을 함께 해결해야 “저장 즉시 모든 관련 화면이 같은 값”이라는 계약을 만족한다.

P0 4건과 P1 18건을 해소하고 위에 명시한 live/migration/concurrency 검증을 다시 통과하기 전까지 세 RFC를 production-ready로 승인하지 않는다.
