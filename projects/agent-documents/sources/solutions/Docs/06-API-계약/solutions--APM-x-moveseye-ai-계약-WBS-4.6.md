# APM × moveseye-ai 계약 — WBS 4.6 (2026-09-07, 구현 완료 · P3 QA A1~A8 반영 · **P3 화면·툴 3종 추가** · 실 LLM 대화 미검증)

> `moveseye-ai`가 APM을 어떻게 읽는지의 정본. 툴 **11**(P1·P2 8 + P3 3) + `screens.json` **16화면 + 설정 축 1**(APM 리포트) + 원인 브리핑 프롬프트 + '/' 명령 **5**. **BE 무수정**(설계 `designs/devdesign_apm.md` §8.4 그대로 — 전부 기존 읽기 EP의 프록시). BE 계약은 `contract_apm-read-api.md`(§1·2·8·10·11)·`contract_apm.md` §2, P3는 `contract_apm-p3.md`(§1 SLO · §3 합성 · §5 배치 · §8 리포트)를 그대로 따르며, 이 문서는 그 위에 얹는 **AI 쪽 규약**만 적는다.
>
> **2026-09-07 P3 반영(해설서 점검에서 발견)**: `screens.json`에 P3 화면이 없었다 — 서비스 상세 탭 `synthetics` 누락, SLO 목록/상세·합성 감시 목록/상세·메시징·배치·APM 리포트 미등록, P3 EP를 읽는 툴 0. 이번에 화면 6(+탭 1)·툴 3(`apm_slo_status`·`apm_synthetics`·`apm_jobs`)·명령 1(`/apm SLO`)·프롬프트 분기 한 줄을 더했다. **메시징(`/apm/messaging/*`) 툴은 아직 없다**(화면 howto에 명시) · APM 리포트(`/admin/reports/apm/**`)는 관리자 축이라 툴 없음(굳은 값은 라이브 툴로 대신하지 못함을 howto에 명시).

## 0. 먼저 알아야 할 다섯 가지 (🔴)

1. **전부 READ·NEUTRAL.** APM은 데이터소스(Zabbix·Prometheus…)가 아니라 제품 기능이라 `source()`는 NEUTRAL — 모델에게 **항상 노출**되고, 라이선스 유무·권한은 BE가 판정한다(`FeatureInterceptor(APM)` + `ApmAccessChecker`). 툴은 그 거부를 **행동이 보이는 문구**로 바꾼다(§3).
2. **시간은 ms 에폭.** 다른 BE 축(`/host/**`·`/event/**`)은 초인데 APM만 ms다. 변환은 `ApmTimeWindow` 한 곳에서만 한다(`window:"1h"` 상대 창 또는 `from`/`to` 절대 창 → `from`·`to` ms).
3. **`null`은 0이 아니다.** 계약 §공통(백분위 null = 관측 없음/경계 혼재, 오류율 null = 요청 0건). compact 변환에서 **키를 남기고 값만 null**로 둔다(`AbstractApmTool.num()`). 결과마다 `note`에 그 규약을 한 줄 싣는다.
   **비영 값도 0이 되지 않는다**(코덱스 검수 #12, 2026-09-07). `num()`의 표시 반올림은 **단위별**이다 — 키 이름으로 고른다(`scaleFor`): `apdex*` 3자리 · `*Pct`/`*PctChange`/`*PointDiff`/`rps` 2자리 · `*Ms`/`*MsDiff`/`*_seconds` 1자리 · 그 외 2자리. 그 자리에서 0으로 접히는 비영 값은 **유효숫자 2자리로 물러선다**(`errorRatePct 0.004 → 0.004`, 이전엔 `0.04 → 0.0`·`apdex 0.99 → 1.0`·`apdexDiff -0.04 → 0.0`으로 작은 이상이 정상으로 바뀌었다). 추세 평균(`trend.*.firstHalfAvg/secondHalfAvg/max`)·트레이스 `selfTimeByService.selfMs`도 같은 `round()`를 쓴다. 정수는 그대로.
   **지수 표기는 나가지 않는다**(QA A8, 2026-09-07). 소수는 double이 아니라 `BigDecimal`(`AbstractApmTool.decimal`)로 싣는다 — double `0.000019`는 JSON에 `1.9E-5`로 나가 모델이 `1.9`로 오독한다. 유효숫자 2자리 폴백의 **표시 하한은 `0.000001`**(`MIN_ABS`): 그 아래 비영 값은 하한값(부호 유지)으로 올린다(어느 단위에서도 의미 없는 크기 — 0도 지수도 아닌 "있긴 한데 무시해도 되는 양"). 끝의 0은 지운다(`2400.0 → 2400`, `1.00 → 1`).
4. **서비스는 이름으로 들어온다.** `service` 인자가 UUID가 아니면 `GET /apm/services/overview?q=…&includeHidden=true`로 찾는다. 표시명·서비스명 **정확 일치 우선 → 부분 일치**. 🔴 후보가 둘 이상(같은 이름이 prod/dev)이면 **고르지 않고 후보를 돌려준다** — 첫 것을 잡으면 다른 환경을 진단한다.
5. **근사값을 근사라고 말하게 한다.** 트레이스 원천(에러 그룹·서비스 맵·트레이스)은 샘플링 통과분이고, 에러 그룹 `count`는 1시간 버킷 합이라 창보다 넓다(계약 §10 D1). 툴 결과의 `note`가 그 사실을 실어 모델이 "15분에 정확히 8건"이라고 단정하지 않게 한다.

## 1. 툴 표

| 툴 | 인자(전부 strict: 선택은 null 허용) | BE EP | 권한 | 응답(compact) |
|---|---|---|---|---|
| `apm_list_services` | `window`(기본 1h) · `from`/`to` · `env` · `q` · `status`(UP/DEGRADED/DOWN/STALE/UNKNOWN, 클라이언트 필터) · `includeHidden`(기본 false) · `limit`(1~50, 기본 30) | `GET /apm/services/overview?from&to&env&includeHidden&q` | view | `window` · `summary{total,up,degraded,down,stale,unknown}` + `summaryScope:"all"` · `filter{status,matched}`(status 필터 시) · `items[]{serviceUid,name,serviceName?,env,status,statusReason,hidden?,rps,errorRatePct,p50Ms,p95Ms,p99Ms,availability24hPct,apdex,activeRequests,instanceCount,versions≤5,runtimeFamily,lastSeenAt,instrumented(false만),owner}` · `shown/total` · `notes[]?` · `note` · `envs`. **정렬 = DOWN→DEGRADED→STALE→UNKNOWN→UP, 이름순**(화면 규약). 스파크 좌표는 싣지 않음. 🔴 `summary`는 BE 개요 원본 = **창 안 서비스 전부**의 분포이고 `status` 필터는 클라이언트 쪽이라 `items/shown/total`과 모집단이 다르다(QA A2) — `summaryScope:"all"`을 항상 싣고 필터 시 `filter{status,matched}`+`notes[]`("status=UP … 3 of 9; summary counts every service regardless of status")로 둘 다 명시한다 |
| `apm_service_status` | `service`(uid 또는 이름, 필수) · `window`(1h) · `from`/`to` | (`overview` 이름 해소) → `GET /apm/services/{uid}?from&to` | view | `service{uid,name,env,state,status,statusReason,runtimeFamily,tags,versions,firstSeenAt,lastSeenAt}` · `red{rps,errorRatePct,p50/p95/p99Ms,activeRequests,apdex,availability24hPct,apdexT_seconds,slowThresholdMs}` · `trend{p95Ms,errorRatePct,rps}` 각 `{firstHalfAvg,secondHalfAvg,max}`(24칸 스파크를 전반/후반으로 접음, null 칸은 평균에서 제외) · `host{hostName,hostNameOverride,zabbixHostId,note?}` · `instances[]≤20` + `instanceCount` · `alertRules[]{kind,threshold,thresholdUnit,windowMin,enabled,global,effective}` · `alertRulesNote`(규칙 0이면) |
| `apm_slow_endpoints` | `service`(필수) · `window` · `from`/`to` · `sort`(p95Ms 기본 / p99Ms / p50Ms / errorRatePct / requests / rps) · `q` · `limit`(1~50, 기본 10) | `GET /apm/services/{uid}/endpoints?from&to&sort&order=desc&limit&offset=0&q` | view | `items[]{endpoint:"GET /route",requests,rps,errorRatePct,p50/p95/p99Ms,folded?}` · `shown/total` · `foldedRoutes`+`foldedNote`(`otherRoutes`>0) · `sortedBy`. 🔴 허용 밖 `sort`는 BE에 가기 전에 입력 오류(BE `APM_INVALID_SORT` 400 예방) |
| `apm_error_groups` | `service`(선택) · `window` · `from`/`to` · `q` · `sort`(count 기본 / countTotal / lastSeenAt / firstSeenAt) · `limit`(기본 10) | `GET /apm/errors?from&to&service&q&sort&order=desc&limit&offset=0` | view | `items[]{groupId,serviceName,serviceUid,exceptionType,message(≤200),countInWindow,count90d,firstSeenAt,lastSeenAt,newInWindow,sampleTraceId?,topRoutes[]("route xN", `__unrouted__`→"(no route…)")}` · `emptyNote`(0건이면 "창 2h로 넓혀 보라 — 집계 지연 8분·1시간 버킷") · `note`(count 근사·샘플링·sampleTraceId 7일) |
| `apm_trace_lookup` | `traceId`(32 hex, 필수 — 대문자는 소문자로 정규화) | `GET /apm/traces/{traceId}` | view (+원문은 역할 축, BE가 마스킹) | `traceId,startedAt,durationMs,rootName,rootServiceUid,error,spanCount,spansReturned,sampledReason,services[]` · `dataQuality{rootMissing,cycleBroken,truncated}`(true인 것만) · `criticalPath[]≤20{serviceName,name,kind,status,depth,offsetMs,durationMs,selfMs}` + `criticalPathMs` · `errorSpans[]≤10`(+`attrs` 허용 키만: exception.type/message, error.type, http.response.status_code, http.route, url.path, db.system, db.query.text/summary, server.address/port, messaging.*, rpc.method, peer.service — `events[name=exception].attributes`도 흡수) + `errorSpanCount` · `slowestBySelfTime[]≤5` · `selfTimeByService[]≤10`. 🔴 스택트레이스·그 밖의 속성은 싣지 않는다(토큰) |
| `apm_service_map` | `service`(선택, 1홉 이웃) · `env` · `window`(1h, 최대 30d) · `from`/`to` · `limit`(엣지 1~50, 기본 30) | (`overview` 이름 해소) → `GET /apm/service-map?from&to&env&service` | view | `nodes{total,byKind{SERVICE,DB,HTTP,QUEUE},items[]≤50{label,kind,serviceUid,env,incoming,outgoing,instrumented(false만)}}` · `edges{total,shown,truncated?,items[]{from,to(라벨로 되돌림),toKind,requests,errors,errorRatePct,p50/p95/p99Ms,mixedBounds?,lowSample?}}`. **엣지 정렬 = 오류율 내림차순 → p95 내림차순** · `emptyNote`(노드 0) |
| `apm_deployments` | `service`(필수) · `window`(**30d** 기본, 최대 400d) · `from`/`to` · `deploymentId`(선택, 없으면 최신) · `compareMinutes`(5~1440, 기본 60) · `limit`(기본 10) | `GET /apm/services/{uid}/deployments?from&to&limit&offset=0` → `GET /apm/deployments/{id}/compare?window` → `GET /apm/deployments/{id}/new-errors?window&limit=5` | view | `items[]{id,version,detectedAt,source,rolloutPctRecorded,currentRolloutPct,currentInstances}` · `comparison{deploymentId,version,detectedAt,source,windowMinutes,before{…RedWindow},after{…},deltaAfterMinusBefore{rpsPctChange,errorRatePointDiff,p50/p95/p99MsDiff,p95PctChange,apdexDiff},afterComplete:false?+afterNote,note}` · `newErrorGroupsAfterDeploy[]≤5` + `newErrorGroupsTotal` · `emptyNote`(자동 감지가 못 잡는 셋 안내). 🔴 **판정(개선/악화) 없음** — 계약 §11.2 그대로. compare/new-errors 실패는 `unavailable[]`에 남기고 목록은 돌려준다. 🔴 **지정 `deploymentId`의 소속 검증**(코덱스 검수 #13): BE compare/new-errors는 배포 id만 받고 서비스를 묻지 않으므로, compare 응답의 `serviceUid`를 요청 서비스 uid와 대조해 다르면 **입력 오류**(`apm.deployment.wrong_service` — 소속 서비스·uid를 밝힘)로 끝낸다. `comparison.serviceUid`는 결과에 남긴다. compare가 실패했거나 `serviceUid`를 안 줘 소속을 못 확인한 지정 id는 new-errors를 부르지 않고 `unavailable[newErrors]`에 사유를 남긴다(목록에서 고른 최신 배포는 그 서비스 것이므로 검증 없이 진행) |
| `apm_collector_status` | `tokenId`(선택) · `dropsWindow`(**enum** 15m/1h/24h/7d, 기본 24h — `lastSeenAt` 필터. 스키마 enum과 검증이 같은 목록 `DROPS_WINDOWS`를 본다, QA A7 — 이전엔 `30m`·`2d`가 조용히 통과) | `GET /apm/collectors` → `GET /apm/receive-tokens` → `GET /apm/ingest/recent?tokenId` → `GET /apm/ingest/drops?tokenId&from` | **edit** | `summary{collectorsUp,collectorsStale,tokensActive,tokensRevoked}` · `collectors[]{id,tokenId,tokenLabel,version,status,lastSeenAt,queueSize,sendFailedTotal,samplingDroppedTotal}`(null 유지) · `tokens[]{id,label,kind,scopes,active,lastSeenAt,revokedAt}`(🔴 원문·해시 없음 — BE DTO에도 없다) · `last60s{received,lastReceivedAt,batches,storedPoints,droppedPoints,windowSeconds,serverStartedAt,note}` · `drops{lookbackMinutes,byReason{},top[]≤20,rowsTotal,routeOverflowByService[],note}` · `unavailable[]`(부분 실패) · `note`(진단 순서: 토큰→수집기→수신→폐기). 🔴 첫 호출(`/apm/collectors`)이 403이면 부분 결과 없이 edit 권한 안내로 끝난다(view만 가진 사용자엔 네 EP 전부 벽). 🔴 `drops`에 `to`를 채우지 않는다 — 계약 §8.2-1(누적 카운터에 `to`를 주면 표가 "최근 1시간"으로 접혀 보인다) |

| `apm_slo_status` **(P3)** | `service`(선택, uid/이름) · `slo`(선택 — sloUid **또는 이름**; 주면 상세+캘린더) · `status`(OK/WARN/BREACH/UNKNOWN, 클라이언트 필터) · `calendarDays`(1~30, 기본 14 — 의미 있는 범위라 클램프 안 함) · `limit`(기본 20). **시간 창 입력 없음**(SLO는 자기 롤링 창 7/30일) | `GET /apm/slos?service` → (slo 지정 시) `GET /apm/slos/{uid}`. 🔴 `slo`가 uid면 목록을 **안 부른다**(목록은 SLO 수 × 질의 3회, `contract_apm-p3.md` §7.2) — 단 `service`도 같이 오면 상세의 `serviceUid`와 대조해 다르면 입력 오류(`apm.slo.wrong_service`). 이름이면 목록에서 정확→부분 일치, 둘 이상이면 후보 반환(`apm.slo.ambiguous` — 같은 이름이 서비스마다 있을 수 있다) | view | 목록: `summary{total,breach,warn,unknown,ok,burningNow,alertEnabledButNotSynced}`+`summaryScope` · `items[]{sloUid,serviceUid,serviceName,name,sliKind,target(3자리),windowDays,latencyThresholdMs,enabled,status,burnCondition,sliPct(3자리),requests,measured,mixedBounds,good,errorBudgetTotal/Used(3자리),budgetRemainingPct(음수 그대로),burnRate{h1,m5,h6,m30},burnAlert{enabled,fastThreshold,slowThreshold,maxThreshold,zabbixSynced,zabbixError,warning?},windowFrom/To,measuredFrom/To,measurementLagMinutes?+Note(measuredTo가 windowTo보다 1분 이상 이르면),updatedAt}` **정렬 BREACH→WARN→UNKNOWN→OK** · `emptyNote`(SLO 0) · 상세: `slo{…}` + `calendar{daysAvailable,shown,days[]≤calendarDays(오름차순: day,sliPct,budgetRemainingPct,burn1h/6h,measured(=total),requests,mixedBounds?,today?,finalized:false?,staleDefinition?+definitionUsed{target,windowDays,latencyThresholdMs}),daysMeasuredUnderOlderDefinition,daysNotFinalized?,daysPartiallyMeasured?,note}`. 🔴 SLI·버짓·번 `null`은 "재지 못함"(요청 0건)·status UNKNOWN — 0%도 초록도 아님(§1.3-1) · 🔴 빈 날은 행이 없다(§1.3-5) — 채우지 않는다 · 🔴 과거 칸은 되계산 안 됨(§1.4) — `staleDefinition` 칸 수를 센다 |
| `apm_synthetics` **(P3)** | `service`(선택, 바인딩된 서비스) · `hostId`(선택) · `scenario`(선택 — httptestId **또는 이름**; 주면 상세+창 안 실패) · `status`(OK/FAILED/UNKNOWN, 클라이언트 필터) · `window`(**24h** 기본, 최대 30d — 상세에서만 쓰지만 검증은 항상) · `from`/`to` · `limit`(기본 20, 목록·실패 목록 공용) | `GET /apm/synthetics?service&hostId` → (scenario 지정 시) `GET /apm/synthetics/{id}` + `GET /apm/synthetics/{id}/results?from&to`(`safe` — 실패해도 상세는 돌려준다). 🔴 목록엔 창 파라미터를 보내지 않는다(가용성 24h·p95 60분은 서버 고정, `contract_apm-p3.md` §R-12). 이름 해소는 목록에서 정확→부분, 둘 이상이면 후보(`apm.synthetic.ambiguous` — 결과 축이 (호스트, 이름)이라 지역별 감시가 같은 이름을 쓴다) | view | 목록: `summary{total,failed,ok,unknown,stale,disabled,truncated?}` · `items[]{httptestId,name,hostName,hostId,locationName,monitoredBy,enabled,stepCount,firstUrl,intervalSec(매크로면 null),lastStatus,lastCheckedAt,lastFailedStepNo,lastReason{code,title,hint,raw≤200},availability24hPct,checks24h,expectedChecks24h,coveragePct,stale,staleSeconds,truncated?,p95Ms,p95WindowMinutes,boundServiceUid/Name/Label}` **정렬 FAILED→UNKNOWN→OK, 같은 상태에선 stale 먼저** · 상세: `scenario{…,httpPasswordSet(값 없음),steps[]{no,name,url,statusCodes,required,timeout,followRedirects,retrieveMode,postType?}}` + `inWindow{availabilityPct,checks,expectedChecks,coveragePct,p95Ms,stale,staleSeconds,truncated?,stepP95Ms[],failures[]≤limit{at,failedStepNo,failedStepName,reason},failuresTotal,failuresNote?}` + `window`. 🔴 `stale`/낮은 `coveragePct`=**수집 공백**(실패 아님) vs `truncated`=**조회 상한**(창 줄이기) — 문구를 가른다(§3.3-12·13) · 🔴 가용성 24h ≠ p95 60분(§3.3-5) — `p95WindowMinutes`를 행마다 싣는다 · 🔴 `proxyId=null`≠서버 — `monitoredBy`가 판정 축(§3.3-11) · 비밀값(httpPassword) 없음 |
| `apm_jobs` **(P3)** | `service`(선택 — uid/이름/**`__none__`**(지워진 서비스의 실행만, 이름 해소 없이 통과)) · `job`(선택 — `job.name` 값; 주면 실행 이력) · `status`(OK/ERROR/UNSET, job과 함께 서버 필터) · `window`(**24h** 기본, 최대 90d) · `from`/`to` · `limit`(기본 20) | `GET /apm/jobs?from&to&service` / (job 지정 시) `GET /apm/jobs/runs?name&from&to&status&service`. 🔴 뒤집힌 창은 BE가 조용히 1h로 접으므로(§4.1) `ApmTimeWindow`가 먼저 거절하고, 응답 `fromMs/toMs`가 요청과 1분 이상 다르면 `windowUsedByServer`+`notes[]`로 반향한다 | view | 표: `items[]{jobName,serviceUid,serviceName("(service deleted)"+`openWith:"service=__none__"` if null),runs,failures,successRatePct,avgMs,maxMs,lastDurationMs,lastRunAt,lastStatus,lastTraceId}`(BE 정렬 = 마지막 실행 최신순) · `summary{jobs,jobsWithFailures,jobsLastRunFailed,rowsOfDeletedServices?}` · `emptyNote`(🔴 계측 규약 §5.3 세 가지 — 루트 스팬·INTERNAL·`job.name` 속성·`setStatus(ERROR)` — "배치가 없다"가 아니라 "규약을 안 넣었다"로 읽게) · 이력: `job` · `items[]≤limit{startedAt,durationMs,status,errorMessage≤200,runRef,triggerKind,traceId,traceLinkable,serviceUid,serviceName}` · `summary{runs,errors,unset,traceExpired}` · `truncated`(2,000 상한)+`notes` · `filter{status,matched}` · `emptyNote`(🔴 **빈 배열 = 필터 0건**, "필터를 풀어라" — QA M-1) vs `APM_JOB_NOT_FOUND` explain(🔴 "창 안에 그 이름 없음, 창을 넓혀라") · `service` 없이 이력을 열면 "다른 서비스의 같은 이름이 섞인다" `notes`(QA M-2) |

공통: 결과 상단 `window{from,to,minutes}`(ISO — `apm_slo_status`만 없음). 목록 상한 `ai.limits.list-cap`(50). 실패는 `tool_result(is_error)` 문구.

**응답 안내 두 벌(QA A1, 2026-09-07)**: `note`(문자열)는 툴의 **고정 규약 문구**(null≠0·정렬·다음 툴), `notes[]`(배열)는 **이번 응답에만** 해당하는 안내 — `listEnvelope`의 절단("전체 9건 중 2건만 표시"), `limit` 클램프, status 필터 모집단. 이전엔 `out.put("note", …)`가 절단 안내를 덮어써 모델이 9개를 다 봤다고 믿었다(`apm_list_services`·`apm_slow_endpoints`·`apm_error_groups` 셋 다 같은 구조). 절단 안내는 `AbstractApmTool.merge()`가 `notes[]`로 옮기고, `note(out, …)`로 쌓는다 — **`notes`를 `put`으로 덮지 말 것.**

**`limit` 범위 밖은 클램프(QA A6)**: 1~50 밖(`limit:100`·`0`)은 입력 오류가 아니라 가장 가까운 경계로 접고 `notes[]`에 "limit 100 is outside 1-50; used 50."을 남긴다(오류로 돌려주면 모델이 다시 부르고 BE 1콜이 더 나간다). APM 5개 목록 툴(`AbstractApmTool.limit()`)만 — 다른 축 툴은 종전대로 `intInRange` 오류. `compareMinutes`·`sinceHours` 같은 **의미 있는 범위**는 클램프하지 않는다(창이 바뀌면 결과 뜻이 바뀐다).

**검증 순서(QA A4)**: 창·sort·limit 등 **입력 검증은 전부 이름 해소(`resolveServiceUid`, BE `overview` 1콜) 앞**에 둔다. 이전엔 이름 해소가 먼저라 잘못된 창(4케이스)에도 BE를 1콜 냈다. 5개 툴 모두 같은 순서: `ApmTimeWindow.of` → sort/limit → `resolveServiceUid` → BE.

## 2. 시간 창 규약 (`ApmTimeWindow`)

| 입력 | 해석 |
|---|---|
| `window: "15m" / "6h" / "24h" / "7d" / "2w"` | 지금 기준 상대 창. 단위 m·h·d·w(영문 변형 허용: min·hour·day·week) |
| `from` + `to` (둘 다) | 절대 창. `Instant.parse`(Z/오프셋) → 타임존 없으면 **서버 시간대**의 `LocalDateTime` → 날짜만(`yyyy-MM-dd`, 00:00). 공백 구분(`2026-09-01 09:00`)도 받는다 |
| 셋 다 없음 | 툴별 기본(목록·상세·엔드포인트·에러·맵 **1h**, 배포 **30d**) |
| `from`/`to` 한쪽만 · `from>=to` · 형식 오류 · 상한(90d/30d/400d) 초과 | 입력 오류(BE에 가지 않음). 🔴 뒤집힌 창을 BE가 EP마다 다르게 다뤄(기본 창으로 접거나 빈 표) 여기서 자른다 |

모델이 "최근 1시간"·"어제 오후 3시부터"를 인자로 옮기는 일은 시스템 프롬프트가 아니라 **스키마 설명**(`ApmTimeWindow.describe()`)이 담당한다 — 툴마다 문구가 갈리지 않게 한 상수.

## 3. 오류·권한 안내 (`AbstractApmTool.explain`)

BE 거부는 전부 `200 + body code`(401만 실제 상태)라 `BeProxyClient`가 `BeApiException(code, errorCode, message)`로 바꾼다. APM 툴은 그 위에 **사용자가 할 수 있는 행동**을 붙인다(ko/en `messages*.properties` `apm.*`).

| BE | 툴 문구(ko) | 근거 |
|---|---|---|
| `LICENSE_FEATURE_REQUIRED` / 402 | "APM은 이 설치본의 라이선스에 포함되어 있지 않습니다. 설정 > 라이선스…" | `FeatureNotLicensedException`(402 — 403과 화면이 다르다: 영업 문의 vs 관리자 요청) |
| `FORBIDDEN` / 403, 조회 툴 | BE 메시지 **한 번** + "역할 편집 > 애플리케이션 모니터링 > APM > **보기**를 켜야 합니다 — 관리자가 사용자 관리 화면에서". BE가 빈 문구면 errorCode(`FORBIDDEN`)로 자리를 채운다 | 계약 §10.5 (2026-09-03 DMOVE 권한 축, 기본 열림). 🔴 QA A3: 접두문 "APM 화면을 볼 권한이 없습니다"가 BE `ApmAccessChecker.DENIED_MESSAGE`와 글자까지 같아 같은 문장이 두 번 나갔다 → 접두문을 빼고 `{0}`(BE 문구)를 문장 맨 앞에 둔다 |
| `FORBIDDEN` / 403, `apm_collector_status` | BE 메시지 + "APM **편집** 권한이 필요합니다(수집기·토큰·수신 상태)…" | 관리 EP 26개는 GET이라도 `apm.edit`(계약 §10.5 "HTTP 메서드로 추측하지 말 것") — `requiresEdit()=true` |
| `APM_TRACE_NOT_FOUND` | "트레이스는 7일 보존·샘플링 통과분만 저장 — 만료됐거나 샘플로 남지 않은 요청일 가능성이 가장 큼(오타와 구분 불가). 에러/DB 그룹 예시 트레이스도 같은 이유로…" | 계약 §10.0-2·§10.2 `stored` |
| `APM_SERVICE_NOT_FOUND` | "그 uid의 서비스가 없다 → apm_list_services" | |
| `APM_SLO_NOT_FOUND` **(P3)** | "그 sloUid의 SLO 없음(형식 오류도 같은 코드) → apm_slo_status를 slo 없이" | `contract_apm-p3.md` §1.6 |
| `APM_SYNTHETIC_NOT_FOUND` **(P3)** | "그 httptestId 없음 — **Zabbix에서 지워졌을 수 있다** → apm_synthetics를 scenario 없이" | §3.5 (원천이 Zabbix라 우리 쪽 오타와 구분 불가) |
| `APM_JOB_NOT_FOUND` **(P3)** | "창 안에 그 이름의 실행 없음(**필터 0건과 다르다**) → 창 넓히기 / job 없이 목록 / job.name은 속성 값" | §5.5 + QA M-1(빈 배열은 필터 0건) |
| SLO/시나리오 이름 해소 0건 / 2건+ | `apm.slo.not_found_name`·`apm.slo.ambiguous`(service를 같이 주거나 sloUid) / `apm.synthetic.not_found_name`·`apm.synthetic.ambiguous`(httptestId나 hostId) | §0-4와 같은 원칙 — 고르지 않는다 |
| `apm.slo.wrong_service` | slo=uid와 service를 같이 줬는데 소속이 다르다 — 배포 id 소속 검증(코덱스 #13)과 같은 판단 | |
| 이름 해소 0건 / 2건+ | "일치하는 서비스 없음(숨긴 서비스는 includeHidden)" / "여러 개 — 어느 것인지 물어보세요: Order API [env=prod, uid=…], …" | §0-4 |
| 그 외 | BE 메시지 + `[errorCode]` (기존 툴과 동일) | |

시스템 프롬프트가 "권한/라이선스 안내는 **그대로 전달하고 재시도하지 말라**"고 못박는다(같은 실패 호출 반복 금지 규칙의 APM판).

### 3.1 🔴 403 안내 문구가 **도달하는 통로**(QA A5, 2026-09-07 — 코드 변경 없음)

- 채팅·dev 툴 통로(`/ai/conversations`·`/ai/tools`·`/ai/dev`)는 `AuthPreflight.requireAdmin`(ADMIN ∪ SUPER_ADMIN)이 **툴 실행 전에** 막는다. 그런데 BE `DmovePermissionChecker.isAdministrator`가 APM 권한 검사를 **통째로 우회시키는 집합이 정확히 같다**. 즉 채팅으로 툴을 실행할 수 있는 사람은 APM 403을 받을 수 없고, 403을 받을 사람은 툴 실행에 이르지 못한다(`AI_FORBIDDEN "관리자만 사용할 수 있습니다."`로 먼저 끝난다).
- 따라서 `apm.forbidden.view` / `apm.forbidden.edit` 문구가 실제로 나가는 통로는 **MCP(`mcp/McpAuthFilter`, `user.mcp_permission` 축) 전용**이다. 채팅은 관리자만이므로 채팅에서 이 문구를 보려고 애쓰지 말 것(QA에서 실측: 관리자를 `USER`로 낮추자 세 툴 모두 툴 실행 **전**에 `AI_FORBIDDEN`).
- 예외 경로 하나: "토큰 클레임은 USER/ADMIN인데 DB row가 바뀐 직후"(권한 변경 직후 기존 토큰) — 이때는 채팅에서도 BE 403이 툴까지 온다(QA 6-9로 확인). 그래서 문구는 유지한다.
- **관리자에게도 유용한가** — 검토 결과 **예**: MCP 클라이언트(Claude Desktop·Codex CLI 등)에서 APM 툴을 쓰는 일반 사용자가 403을 받으면 그 문구("역할 편집 > 애플리케이션 모니터링 > APM > 보기 — 관리자가 사용자 관리 화면에서")가 **관리자에게 무엇을 요청해야 하는지**를 그대로 말해 주고, 관리자가 그 요청을 받았을 때도 **어느 화면의 어느 스위치**인지가 문구에 있다. 채팅 게이트를 `apm.view`로 낮추는 안(QA 판단 재료 ②)은 설계 M6(채팅 관리자 전용)과 충돌하므로 **채택하지 않는다**.

## 4. screens.json — 16화면 + 설정 축 1 (P3 반영 2026-09-07)

| id | path | 노출 | tabs | tools |
|---|---|---|---|---|
| `apm-overview` | `/application-monitoring/overview` | 사이드바 | — | list_services · error_groups · service_map |
| `apm-services` | `/application-monitoring/services` | 사이드바 | — | list_services · service_status |
| `apm-service-detail` | `/application-monitoring/services/:serviceUid` | 목록에서 | **11** = FE `APM_SERVICE_TAB_READY`(overview·transactions·traces·errors·database·dependencies·runtime·instances·deployments·**synthetics**·settings; logs만 미개방이라 미등록) | 탭별: status / slow_endpoints / trace_lookup / error_groups+trace_lookup / trace_lookup(DB 툴 없음 명시) / service_map / status(런타임 툴 없음 명시) / status / deployments / **synthetics** / status+slo_status(SLO 링크) |
| `apm-service-map` | `/application-monitoring/service-map` | 사이드바 | — | service_map · list_services |
| `apm-traces` | `/application-monitoring/traces` | 사이드바 | — | trace_lookup · error_groups · list_services |
| `apm-trace-detail` | `/application-monitoring/traces/:traceId` | 목록에서 | waterfall · flame | trace_lookup |
| `apm-collectors` | `/application-monitoring/collectors` | 사이드바(**edit만**) | status · tokens · install · registration | collector_status |
| `apm-alert-rules` | `/application-monitoring/alert-rules` | **헤더 ⚙ 설정 메뉴**(edit) | rules · events · zabbix | check_notification_delivery · list_alert_actions(Zabbix 배달 경로 진단은 기존 툴) — APM 규칙 CRUD 툴은 없음 |
| `apm-errors` | `/application-monitoring/errors` | **비노출** — 전역 검색 / URL / 서비스 상세 에러 탭 | — | error_groups · trace_lookup |
| `apm-db-calls` | `/application-monitoring/db-calls` | **비노출** — 전역 검색 / URL / 서비스 상세 데이터베이스 탭 | — | trace_lookup(DB 그룹 툴 없음을 howto에 명시) |
| `apm-dependencies` | `/application-monitoring/dependencies` | **비노출** — 전역 검색 / URL / 서비스 상세 외부 호출 탭 | — | service_map |
| `apm-slo` **(P3)** | `/application-monitoring/slo` | **헤더 ⚙ 설정 메뉴**(view) / 전역 검색 / 서비스 상세 설정 탭 / 홈 위젯 / URL — howto "Not in the sidebar" | — | slo_status · list_services. CRUD는 `apm.edit`(PERM_EDIT_CRUD 문장) |
| `apm-slo-detail` **(P3)** | `/application-monitoring/slo/:sloUid` | SLO 목록에서 | — | slo_status |
| `apm-synthetics` **(P3)** | `/application-monitoring/synthetics` | **사이드바**(view; CRUD는 edit) | — | synthetics · list_services |
| `apm-synthetic-detail` **(P3)** | `/application-monitoring/synthetics/:httptestId` | 목록에서 | — | synthetics |
| `apm-messaging` **(P3)** | `/application-monitoring/messaging` | **비노출** — 개요 카드 / 전역 검색 / URL. 한 화면에 메시징·배치 두 절 | — | jobs(배치 절) · trace_lookup · list_services. **메시징 절 툴 없음을 howto에 명시** |
| `setting-apm-report` **(P3, 설정 축)** | `/setting/report-management/apm` | 리포트 관리 목록의 APM 행 / URL `?id=` · `?periodType=&periodStart=` | — | **없음**(굳은 값을 읽는 툴이 없다 — 라이브는 list_services·slo_status로 대신함을 howto에 명시). 🔴 **관리자 축**(`apm.view`만으론 못 봄, `contract_apm-p3.md` §8.6)을 howto에 명시. `setting-report-management`도 두 계열·`(type,id)` 키를 summary/howto에 반영 |

- 문구 원천은 FE `kr.json` `page_guide.apm_*`(18키) — 모델용 영어로 옮기고 `keywords`에 한국어 검색어를 넣었다(카탈로그 검색이 한국어는 keywords에만 걸린다).
- 권한 안내는 각 화면 `howto` 끝에 상수 문장(`PERM_VIEW` / `PERM_EDIT` — "역할 편집 > 애플리케이션 모니터링 > APM 보기/편집"). 비노출 3화면은 `howto`가 "Not in the sidebar: …"로 시작한다(테스트가 그 문장을 강제 — 메뉴에 없는 화면을 "메뉴에서 찾으세요"라고 안내하지 않게).
- 검증: `ScreenToolReferenceTest.apmScreensAndTabsMatchTheFrontendRoutes`(**16화면**·경로 해석(SLO/합성 목록↔상세 세그먼트 분리, 리포트 관리↔APM 리포트 하위 경로)·탭 키 순서 11·비노출 문구 5(에러·DB·외부 호출·**SLO·메시징**)·APM 리포트 관리자 문구·한국어 검색 5) + 기존 `everyToolNamedByAScreenOrTabActuallyExists`(툴 오타).
- 문구 원천 추가분: FE `kr.json` `page_guide.apm_slo`·`apm_slo_detail`·`apm_synthetics`·`apm_synthetic_detail`·`apm_service_synthetics`·`apm_messaging`·`setting_report_apm`·`setting_report` + `contract_apm-p3.md` §1.3·§3.3·§5.4·§8.4의 "FE가 지켜야 할 것"에서 사용자에게 닿는 것.

## 5. '/' 명령 — `commands.json` `apm` 그룹(guide 앞)

| id | 라벨(ko) | 템플릿(ko) | screens |
|---|---|---|---|
| `apm-status` | `/apm 상태` | "APM 서비스 전체 상태 요약해줘 — 느리거나 오류 나는 서비스, 수신 끊긴 서비스 위주로" | overview · services · service-map |
| `apm-root-cause` | `/apm 원인 <서비스>` | "{서비스} 서비스가 느리거나 오류가 나. 원인 브리핑해줘 — 상태, 느린 엔드포인트, 에러 그룹, 트레이스 1건, 최근 배포, 의존 대상 순으로" | service-detail · services · overview · errors · traces |
| `apm-deploy-impact` | 배포 영향 | "{서비스} 마지막 배포 전후로 오류율·p95가 어떻게 달라졌는지, 새로 생긴 오류가 있는지" | service-detail |
| `apm-ingest` | 수집 안 되는 원인 | "APM 데이터가 안 들어오는데 수집기·토큰·수신·폐기 순으로 어디가 문제인지" | collectors · services |

| `apm-slo` **(P3)** | `/apm SLO` | "SLO 현황 알려줘 — 위반·주의 중인 SLO, 남은 에러 버짓, 지금 번 레이트 넘긴 것 위주로" | slo · slo-detail · service-detail · overview |

`summarize-screen`("이 화면 요약")에 `apm-overview`·`apm-services`·`apm-service-detail`·`apm-service-map`·`apm-collectors` + **P3 `apm-slo`·`apm-synthetics`·`apm-messaging`**을 추가. 그룹 hint에 "SLO 버짓" 추가. 명령은 기존 규약대로 **입력창 문구 채우기**일 뿐 실행 분기가 아니다.

## 6. 원인 브리핑 프롬프트 (`SystemPrompt` "# APM" 절)

"서비스 X가 느려요/오류 나요/죽었어요"에 대한 고정 체인(조기 종료 허용):

1. `apm_service_status`(이름 가능) — 상태·근거, RED, 추세(후반 vs 전반), 인스턴스(STALE 하나? 버전 혼재?), 매칭 Zabbix 호스트
2. `apm_slow_endpoints`(p95 / 오류 호소면 errorRatePct) — **한 엔드포인트인가 전부인가**(전부 = 런타임·DB·의존, 하나 = 그 코드 경로)
3. `apm_error_groups` — 무엇이 던져지나, `newInWindow`, 어느 route
4. `apm_trace_lookup`(3의 `sampleTraceId` 1건) — 크리티컬 패스·자기 시간 최대 스팬이 범인을 이름 짓는다(DB·외부 HTTP·인프로세스)
5. `apm_deployments` — 직전 버전 변화? 전후 숫자를 나란히, "coincides with" 이상은 말하지 않는다
6. `apm_service_map`(서비스 중심) — 어느 하류가 오류/지연을 지고 있나; Zabbix 호스트 있으면 `get_host_metrics`로 CPU/메모리 포화

STALE/UNKNOWN 또는 서비스 부재 → **수집기 진단으로 분기**(`apm_collector_status`(edit): 수집기·토큰·폐기)하되 **앱/호스트 중단 가능성은 유지**한다 — STALE은 "데이터가 안 왔다"일 뿐이라 앱 중단·호스트 다운·네트워크 단절도 수집기 장애와 같은 그림이고, UNKNOWN은 BE 자체가 "앱 중단인지 수집 중단인지 모름"이라는 뜻이다. 매칭 Zabbix 호스트(`get_host_metrics`·문제)를 수집기와 나란히 보고, 어느 쪽도 확인되지 않으면 두 가능성을 미확인으로 함께 보고한다. **확인 전 원인 단정 금지**(코덱스 검수 #14 — 이전 문구 "수집 경로 문제, 앱 동작 아님"은 단정이었다).
**P3 분기 한 줄(2026-09-07)**: SLO/에러 버짓/번 레이트 질문 → `apm_slo_status`(null SLI = 측정 불가, 0% 아님 · 음수 버짓 = 초과) / "바깥에서 접속되나"·웹 시나리오 → `apm_synthetics`(stale = 수집 공백, 실패 아님 · 가용성 24h vs p95 60분) / 배치·스케줄 잡 → `apm_jobs`(UNSET ≠ 실패 · 빈 표 = 대개 `job.name` 규약 부재). 셋 다 위 체인의 단계가 **아니다** — 원인 브리핑 6단계는 그대로.
브리핑 형태: **무엇이(숫자·언제부터) → 어디서(엔드포인트/스팬/의존) → 근거 있는 방향 → 확인 못 한 것**. 샘플·1시간 버킷 값은 "약". APM `null`은 관측 없음(0 아님). 단위 ms·%·rps.

## 7. 검증

- **P3 반영 후(2026-09-07): 139 green / 0 skip / 0 fail** = 131 + `ApmP3ToolsTest` 8(SLO 목록 정렬·null·미동기 알람·측정 지연 / uid 상세=목록 생략+캘린더 압축·옛 정의 칸 / 이름 해소·모호·소속 불일치·검증 BE 0콜 / 합성 목록 정렬·null·프록시 그룹·stale / 상세 단계·창 실패·절단≠공백·비밀값 없음 / 이름 (호스트,이름) 모호·hostId·창 검증·404 Zabbix 안내 / 배치 (서비스,잡) 축·지워진 서비스·창 반향 / 이력 service·`__none__`·섞임 안내·**빈 배열≠404**·계측 규약 emptyNote·검증 0콜). 기존 `allApmToolsAreReadNeutralAndDescribeTheirPermission`은 11종으로, `ScreenToolReferenceTest`·`CommandCatalogTest`는 위 §4·§5대로 갱신.
- (P3 이전) `.\gradlew.bat test`(JDK17, `--stop` 금지) **131 green / 0 skip / 0 fail**(기존 105 + 신규 18: `ApmToolsTest` 16 · `ScreenToolReferenceTest` +1 · `CommandCatalogTest` +1; 2026-09-07 코덱스 #12~#14 반영으로 `ApmToolsTest` +4 = 단위별 반올림·비영 보존 / compare `serviceUid` 보존+소수 delta / 타 서비스 `deploymentId` 입력 오류 / 소속 미확인 시 new-errors 생략; **P3 QA A1~A8 반영으로 `ApmToolsTest` +4** = 절단 안내 보존+status 모집단 명시(A1·A2) / slow·errors 절단 안내(A1) / 검증 순서=BE 0콜(A4) / 고정 소수(A8), 기존 테스트에 A3 한 번 검사·A6 클램프·A7 enum 거절 추가).
- `ApmToolsTest`가 고정하는 것: EP·쿼리(ms 에폭, sort/order/limit/offset, `includeHidden`, drops에 `to` 없음) · 정렬(상태 나쁜 순 / 엣지 오류율→p95) · null 보존(STALE 서비스·접힌 route·안 온 수집기 메트릭) · 이름 해소(1건 통과·2건 후보 반환·0건 안내) · 스파크→추세(null 칸 제외) · 트레이스 요약(크리티컬 패스·events[exception] 흡수·허용 키 외 속성/스택 미포함·traceId 소문자 정규화) · 배포(최신 선택·compare/new-errors 체인·afterComplete false 안내·판정 없음·**지정 id 소속 검증**) · 표시 반올림(단위별 자릿수·비영 값 0 금지·추세 평균 동일) · 403 view/edit 문구 분기 · 402 라이선스 문구 · 그 외 오류 코드 그대로 · 8종 전부 READ/NEUTRAL/strict 스키마.
- **P3 툴 미검증(불안한 지점, 추가분)**: ⑥ P3 BE 응답 필드도 계약 TS 타입만 믿었다(표본 JSON `moveseye-be-spring/src/test/resources/apm/contract/slos.json`·`slo-detail.json`은 있으나 대조 안 함; 합성·배치 표본은 BE 요청 R-6 상태). 특히 `SloDetail.calendar[].total`(=측정 분모)을 `measured`로 옮긴 것, `SyntheticResults.steps[].points` 크기를 `points`로 센 것, `JobRuns.runs[].serviceName`이 지워진 서비스에서 `""`인 것. ⑦ `apm_synthetics` 상세는 3콜(목록 → 단건 → results)이라 MCP에서 느릴 수 있다 — 이름 해소 때문에 목록이 필요해 httptestId를 줘도 목록 1콜은 나간다(개선 여지: 숫자 id면 목록 생략). ⑧ `apm_jobs`의 `windowUsedByServer` 판정 기준 1분은 임의값 — BE가 창을 버킷 격자로 살짝 옮기면 매번 반향될 수 있다(그때는 문턱을 5분으로).
- **미검증(불안한 지점)**: ① 실 LLM 대화(프롬프트 체인이 실제로 그 순서로 도는지) — dev 프로필 `POST /ai/dev/tools/{name}`로 툴 단독 실측도 아직 안 했다(BE :3000에 APM 데이터가 있는 dev 환경 필요). ② BE 응답 필드는 계약 문서의 TS 타입을 믿었다(규약 "실제 응답으로 확인" 미이행) — 특히 `ServiceDetail.spark`가 상세에도 실리는지(계약상 `ServiceRow & …`라 실린다), `TraceDetail.spans[].events[].attributes` 키 이름, `Deployments.rows[].meta`. ③ 이름 해소가 `overview?q=`의 BE 부분 일치(표시명·서비스명·env)에 기대므로 env 이름이 검색어와 겹치면 후보가 늘어 "여러 개" 응답이 잦아질 수 있다. ④ `apm_collector_status`는 4콜이라 MCP 클라이언트에서 느릴 수 있다. ⑤ `README.md`의 "툴 (현재 61개)" 문구는 타 세션 수정 중이라 **건드리지 않았다** — 실제는 71개(CLAUDE.md에 반영).
