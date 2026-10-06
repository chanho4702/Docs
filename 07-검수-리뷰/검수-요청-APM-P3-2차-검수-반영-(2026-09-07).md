# 검수 요청 — APM P3 2차 검수 반영 (2026-09-07)

**범위**: `moveseye-be-spring`(master, 기준 `dba4386`) BE 단독. FE·엔진 서버·QA 인프라 무수정.
**요청**: 코덱스 2차 검수 `reviews/review_apm-p3-w2_codex.md`의 **#1~#10 + 마무리 지적 2건** 반영.

- 계약 정본 갱신: `_workspace/contract_apm-p3.md` §3·§4·§5 + §7(구현 상태·불안한 지점).
- 전체 `:test` **2830 green**(직전 2802, +28) · skip 0. `:engine-zabbix:test` 125(무변경).
- 커밋·푸시하지 않았다.

> ⚠️ **이 파일에 있던 "P3 2차 물결 구현" 요청서 본문을 덮어썼다**(도구 오사용, 2026-09-07 14:43).
> 그 내용의 정본은 남아 있다 — 범위·파일 목록·설계서와 다른 점은
> `contract_apm-p3.md` §7 "P3 2차 물결"·§7.1, 불안한 지점 13항목은 §7.2 "2차 물결"이고,
> 코덱스 검수 `review_apm-p3-w2_codex.md`가 그 요청서를 인용하며 답하고 있다.
> 아래는 **그 요청에 대한 검수 지적을 반영한 후속 라운드** 문서다.

---

## § 반영 — 지적별 방식

### #1 🔴 쓰기 payload에서 `post_type` 제거

`ApmSyntheticZabbixMapper.toStepParams`가 모든 단계에 `post_type`을 실었다.
**Zabbix 7.0 `httptest.create`/`update`의 단계 입력 스키마에 그 필드가 없다** —
`CHttpTest.php` 310행·501행의 `steps.fields`에는 `posts`(`API_HTTP_POST`)만 있다.
없는 파라미터는 `-32602`라 **생성과 `steps`를 포함한 수정이 전부 거절**된다.

제거했다. 형식은 `posts`의 **타입**으로만 전달한다 — RAW는 문자열, FORM은 `[{name,value}]` 배열.
판정은 **값 → 선언** 순서다(`isRawBody`): `postsRaw`가 왔으면 RAW가 확실하고, 없을 때만
`postType` 선언을 본다. 반대로 하면 "형식만 바꾸고 본문은 안 보낸" 요청에서 배열이 와야 할 자리에
빈 문자열이 가 Zabbix가 형식을 RAW로 바꿔 버린다. 둘 다 없으면 `posts` 키 자체를 안 보낸다(=유지).

### #2 🔴 읽기 매핑 RAW=0 / FORM=1

`defines.inc.php`: `ZBX_POSTTYPE_RAW = 0` · `ZBX_POSTTYPE_FORM = 1`. 코드가 반대였다.

`postTypeName(code)`를 지우고 **`postTypeOf(posts, postTypeCode)`**로 바꿨다 —
🔴 **`posts`의 실제 타입이 정본**이다(List→FORM, String→RAW). 값 자체가 형식을 말해 주므로
상수 방향을 다시 뒤집어 읽을 여지가 없다. `post_type`은 `selectSteps`에 `posts`가 빠진 조회의
**보조**로만 쓰고, 그때의 방향은 정본대로다.

테스트: `ApmSyntheticZabbixMapperTest`
- `rawTest()` 기준 데이터를 Zabbix 정본으로 고쳤다 — **RAW 단계의 `post_type`을 1→0**,
  FORM 단계를 0→1. (지적하신 `:239`의 `post_type=1`=RAW 정답 고정이 여기서 왔다.)
- `postTypeIsNeverWritten` — 단계 params·시나리오 전체 params 양쪽에 `post_type`이 없음.
- `postTypeIsReadFromPostsShape` — 타입만으로 판정 + `post_type` 보조 경로.
- `postsSurviveReadWriteRoundTrip` — **실제 응답 형태로 RAW·FORM 각각 읽어 그대로 되돌려
  보냈을 때 본문이 보존되는지**. 매핑이 반대면 FORM은 빈 문자열, RAW는 빈 배열이 되어 실패한다.
- `absentBodyKeepsExistingPosts` — 본문 미전송 = 유지.

### #3 🔴 결과 아이템 축에 `hostid` 유지

`ApmSyntheticItemCatalog.ItemKey`를 `(hostId, metric, scenario, step)`으로 바꾸고
`parse(hostId, key)`로 서명을 바꿨다(호출자가 `hostid`를 버릴 수 없게 강제).
`ScenarioRef(hostId, scenario)` 레코드를 새로 만들어 `ResultContext`의 세 Map,
`refsOf`, `mergeStep`, `outcomeOf`를 전부 그 축으로 옮겼다.

테스트
- `ApmSyntheticItemCatalogTest.hostIdIsPartOfTheKey` — 키 문자열이 **완전히 같고 hostid만 다른**
  두 아이템이 서로 다른 키·다른 `ScenarioRef`임을 못 박는다.
- `ApmSyntheticServiceTest.sameNameOnTwoHostsStaysSeparate` — **회귀 사례**. 서울(전부 성공)·
  도쿄(전부 실패)가 같은 이름 `checkout`이고, `value_type`이 같아 **한 번의 `history.get`으로
  두 아이템의 점이 섞여 온다**(실제 거동 그대로). 축을 잃으면 한쪽이 다른 쪽을 덮는다.

### #4 `web.test.error`의 history 타입

문서 정본(web monitoring items): 시나리오의 "Last error message"는 **Character**다 → `history=1`.
`HISTORY_TEXT=4`로 물으면 Zabbix가 **오류 없이 빈 배열**을 주고 실패 사유가 통째로 사라진다.

두 가지를 다 했다.
1. 카탈로그에 `HISTORY_CHARACTER = 1` 신설 + `defaultHistoryType(metric)` 도입.
2. 🔴 **아이템의 실제 `value_type`을 우선한다** — `resultItems`가 `item.get` output에
   `value_type`을 추가로 읽고, `history(...)`가 **타입별로 호출을 나눈다**(`history.get`의
   `history` 파라미터는 한 번에 하나다). 정상 설치본은 타입이 하나라 호출 수가 늘지 않는다.
   템플릿을 손댄 설치본에서도 조용히 0건이 되지 않는다.

테스트: `errorItemIsCharacterNotText`(카탈로그 표 + `HISTORY_TEXT`가 아님을 명시) ·
`ApmSyntheticServiceTest.errorHistoryIsQueriedAsCharacter`(**mock이 요청받은 `history` 값을
아이템별로 기록**해 `102 → 1`, `100 → 3`을 검증).

### #5 🔴 이력 절단

세 갈래로 나눠 고쳤다.

**(a) 끝까지 읽는다.** `pagedHistory`가 `limit`을 **명시적으로** 주고(2만) 커서를 앞으로 밀며
반복한다. 커서는 offset이 아니라 **마지막으로 본 초**이고, 그 초를 **포함**해 다시 요청한 뒤
`(itemid, ms)`로 중복을 지운다 — 배제하면 같은 초에 걸친 다른 아이템의 점을 영영 못 본다.
⚠️ 그 대가로 **같은 아이템이 같은 초에 두 값**을 가지면 하나가 사라진다(Zabbix history의 `ns`를
우리가 안 들고 있다). `web.test.*`는 최소 주기가 1초라 실사용에서 생기지 않는다.

**(b) 최신 상태는 이력이 아니라 `lastvalue`/`lastclock`.** `resultItems`가 `item.get` output에
둘을 추가로 읽고, `outcomeOf`가 `lastStatus`·`lastCheckedAtMs`·`lastFailedStepNo`를 거기서 만든다.
⚠️ **한계**: `CItem::get`이 그 값을 `Manager::History()->getLastValues(..., HISTORY_PERIOD)`로
채우므로 "Max history display period"(기본 24h)보다 오래된 마지막 값은 `lastclock='0'`으로 온다.
그때만 **이력의 마지막 점으로 폴백**한다(`lastValueFallsBackToHistoryTail`).

**(c) 절단을 모든 계열에 전파.** `HistorySeries(points, truncated)`로 반환값을 바꿔
`truncated`가 fail·error·time·bps·code **전부**의 OR가 되게 했다(예전에는 단계 계열의 점 수만 셌다).
`ApmSyntheticCalendarDto`에도 `truncated`를 신설했다(그쪽에는 아예 없었다).

**API 절단 vs 수집 누락 구분** — 계약에 갈라 적었다(§3.3-13, §3.4 표):
`truncated`는 "창/일수를 줄이세요", `coveragePct`·`stale`은 "Zabbix 시나리오·프록시를 점검하세요".

테스트: `historyIsPagedAndTruncationIsReported` — 한 초에 페이지 크기를 넘는 점이 몰려 커서가
전진하지 못하는 상황을 만들고, **`limit`이 명시적으로 전달됐는지까지** 단언한다.

### #6 🔴 늦게 도착한 장시간 배치

실제 경계는 문서가 적었던 "하루"가 아니라 **약 15분**이었다(워터마크 + `LOOKBACK_BUCKETS` 2).

`ApmJobRollupStep`의 WHERE를 두 갈래로 바꿨다: ① 시작이 창 안(기존) **또는**
② `start_ts + duration`이 창에 걸침(신설). 스캔 하한은 `from - 7일`(=`apm_span` 보존)이다.
멱등 저장은 이미 있던 `UNIQUE(trace_id, span_id)` + 대입 UPSERT가 그대로 맡는다.

🔴 **그 스캔을 가능하게 하는 것이 `V54__apm_job_late_arrival.sql`** — `apm_span`에
`WHERE kind='INTERNAL' AND parent_span_id IS NULL` 부분 인덱스. 인덱스 없이 7일치를 5분마다
순차 훑는 것은 불가능하다. 파티션 부모에 만들어 기존·미래 파티션에 딸려 간다.

테스트(IT, 실 PG): `longRunningJobIsFoundByCompletionTime`(90분 잡, 시작이 창 90분 앞) ·
`completionPathIsIdempotentWithStartPath`(두 경로 동시 적중 → 한 줄) ·
`completedBeforeWindowIsNotCollected`(완료 경로가 창을 무한히 넓히지 않음).

### #7 소비 지연 — 짝 확인

`rollupLag`의 조인이 `kind='PRODUCER'`만 봤다. 셋을 더 요구한다:
발행 쪽 `messaging.system`이 있을 것 · 소비 쪽과 같을 것 · 정규화된 목적지가 같고
`__unnamed__`가 아닐 것. 목적지 정규화는 **소비 쪽과 같은 식**(`DESTINATION_EXPR`)을 별칭만
바꿔 쓴다 — 다르면 조인이 아무 행도 못 찾고 지연이 조용히 비어 버린다.

테스트(IT): 무관한 PRODUCER(`messaging.system` 없음) · 다른 목적지 · 다른 시스템 ·
양쪽 `__unnamed__` — 네 음성 사례 전부 `lag_count = 0`.

### #8 10초 초과 지연 p95

지적하신 분석이 맞다. `+∞` 버킷에 걸린 p95는 마지막 유한 경계(10초)로 나오는데, 그 값이
관측 `min`·`max` 사이에 있으면 **클램프가 아무 일도 하지 않는다** — 계약이 적었던
"max를 이용한 근사"는 이 경우 성립하지 않았다.

전용 격자는 채택하지 않았다(저장 스키마·배포 전후 데이터 혼재를 건드린다). 대신
**하한임을 명시**한다: `ApmPercentiles.exceedsTopBound(counts, bounds, p)` 신설 →
`ApmSpanLatency.p95ExceedsTopBound` → 응답 `lagP95OverCap`. 화면은 `10초+`로 그리고
`lagMaxMs`로 크기를 가늠한다(§4.3-6).

**lookback**: 채택 조건을 처리 창 시작이 아니라 **개별 소비 시각**(`p.start_ts BETWEEN
c.start_ts - 1h AND c.start_ts`)으로 바꿨다. 파티션 프루닝용 범위 술어는 남겨 두었다.
**미측정 비율**은 `lagUnmeasuredPct`로 응답에 노출한다.

테스트: `ApmPercentilesTest.p95StuckAtTopBoundIsReportedAsLowerBound`(지적하신 1초 1건 · 60초
99건 분포 그대로 — p95가 10000ms로 나오고 클램프가 안 걸리는 것까지 단언) + 대조군 ·
`ApmMessagingRollupIT.lookbackIsRelativeToEachConsume`(창을 3시간으로 넓혀도 표본이 안 늘어남).

### #9 `delay` 사용자 매크로

표시 환산(`delaySeconds`, 매크로면 `null`)과 쓰기 검증(`isWritableDelay` 신설)을 갈랐다.
검증 기준은 Zabbix 규칙 그대로 — **매크로면 통과**, 아니면 1초~1일(`CHttpTest.php`의
`API_TIME_UNIT | API_ALLOW_USER_MACRO`, `'in' => '1:'.SEC_PER_DAY`).
`toParams`는 원문을 그대로 싣는다.

테스트: `writableDelayAllowsMacros` · `macroDelayIsPassedThroughVerbatim` ·
`ApmSyntheticServiceTest.macroDelayDoesNotBlockUpdate`(update params 캡처).

### #10 `monitored_by` · `proxy_groupid`

지적하신 "`proxies()`에서는 이미 요청한다"가 맞고, 그것이 옛 주석("없는 필드로 host.get이
죽는다")과 일관되지 않았다. 같은 레포의 `HostManageService`·`HostSnapshotReader`도 이미
`monitored_by`를 요청하고 있어 그 우려는 성립하지 않는다(7.0 전용 제품).

`loadHostContext`·`proxies()` 양쪽 output에 `monitored_by`·`proxy_groupid`를 넣고
`Location(monitoredBy, proxyId, proxyGroupId)`으로 판정한다: 0=SERVER · 1=PROXY ·
2=PROXY_GROUP · 그 외/필드 없음=UNKNOWN(🔴 **서버로 접지 않는다**).
`monitored_by=1`인데 `proxyid`가 없는 모순도 UNKNOWN이다.
계약에 `monitoredBy`·`proxyGroupId`·`locationName`을 노출했고, 비교표·프록시 목록도 같은 축으로
묶는다(`locationKey`). 🔴 **그룹 이름은 모른다** — `proxygroup.get`을 엔진 계약에 넣지 않았고,
지적하신 대로 "프록시 그룹"으로만 표시한다.

테스트: `proxyGroupIsNotFoldedIntoServer`.

### 추가 ① 수집 공백·마지막 관측 신선도

분모 규약(관측된 실행 수)은 **그대로 두고**(안 돈 시간을 장애로 만들지 않는다) 신뢰도를 따로 낸다:
`expectedChecks24h`(86400/주기) · `coveragePct` · `staleSeconds` · `stale`(임계 = `max(주기×3, 300초)`).
캘린더의 `Day`에도 `expectedChecks`·`coveragePct`를 넣었다(하루 칸에서도 같은 착시가 생긴다).
🔴 한 번도 안 돈 시나리오는 `stale=false`다("아직"과 "끊겼다"는 다르다).

테스트: `staleCollectionIsSurfacedNextToAvailability` — 지적하신 **23시간 전 성공 한 점**
그대로. `OK · 100%`는 유지되고 `stale=true` · `coveragePct < 1%`가 함께 나온다.

### 추가 ② 새 롤업 단계 실패 → 전체 롤백

`ApmRollupTransactionRollbackIT`(신규, 실 PG). `@MockBean`으로 **새 두 단계**에 각각 예외를
주입하고 확인한다: 앞선 네 집계가 **0행** · **워터마크 미전진** · 다음 회차가 같은 창을 복구.
대조군(성공 경로)도 함께 둬 "롤백은 되는데 원래도 안 써졌던" 위양성을 막는다.

---

## 검증한 것 / 안 한 것

**검증했다**
- `:test` **2830 green · skip 0**(IT 5클래스가 실제로 도커 PG(5433)에 붙어 돌았다).
- **V54가 실 PG에서 적용된다** — IT DB는 매 실행 drop&create 후 V1부터 전량 적용되고,
  파티션 부모에 만든 부분 인덱스가 이후 `CREATE TABLE ... PARTITION OF`에 딸려 가는 것까지
  같은 실행에서 확인됐다(파티션을 만들고 INSERT하는 IT가 통과한다).
- Zabbix 정본 대조: `CHttpTest.php`(steps 입력 규칙·`delay` 규칙·`selectSteps`의 `post_type`) ·
  `defines.inc.php`(`ZBX_POSTTYPE_*`·`ZBX_MONITORED_BY_*`) · `CItem.php`(`OUTPUT_FIELDS`에
  `lastclock`/`lastvalue`/`value_type` 포함, `HISTORY_PERIOD` 제약) · web monitoring items 문서.

**안 했다**
- 🔴 **실 Zabbix round-trip 여전히 미검증.** 쓰기 계약은 소스 정본으로 확정했지만 실서버에서
  생성→수정→삭제를 돌려 보지 않았다. `httpstepid` 유지 시 **이력이 정말 보존되는가**,
  한글·쉼표가 든 이름의 실제 아이템 키 인용 형태는 아직 가정이다.
- 🔴 **V54 부분 인덱스의 쓰기 비용·생성 소요 미측정**(수신 경로 최다 INSERT 테이블).
- 🔴 **#7의 조인 술어(`attrs->>`)는 GIN `jsonb_path_ops`를 타지 못한다** — 표본이 큰 설치본의
  비용 미측정.
- ⚠️ `stale` 임계(주기×3, 최소 5분)는 근거 없는 상수다.
- ⚠️ FE 미착수(필드 8개 신설: `monitoredBy`·`proxyGroupId`·`locationName`·`expectedChecks24h`·
  `coveragePct`·`staleSeconds`·`stale`·`truncated`, 메시징 2개: `lagUnmeasuredPct`·`lagP95OverCap`).

## 특히 봐 주셨으면 하는 곳

1. **`isRawBody`의 판정 순서**(`ApmSyntheticZabbixMapper`) — "값 → 선언"이 맞는 방향인지.
   반대면 형식만 바꾼 요청에서 본문이 지워진다.
2. **`pagedHistory`의 커서 규약** — 초를 포함해 다시 읽고 `(itemid, ms)`로 dedupe한다.
   같은 초·같은 아이템의 두 점이 하나로 접히는 손실을 감수했다.
3. **`V54` 부분 인덱스 술어의 선택도** — 루트 `INTERNAL` 스팬이 정말 소수인지.
   작업 큐 워커처럼 그 조합이 흔한 계측이 있으면 전제가 무너진다.
4. **`lagP95OverCap`이 옳은 절충인지** — 전용 격자 대신 하한 표기를 택했다.
