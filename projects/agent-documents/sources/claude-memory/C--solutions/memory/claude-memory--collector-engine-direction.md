---
name: collector-engine-direction
description: "다중 데이터소스 전환 — **스텝 0~5 완료, 스텝 6(Prometheus)은 2026-07-28 사용자 결정으로 보류**. Phase 1 종료 상태(app→engine-zabbix 컴파일 차단됨). 2026-07-29 확인: ZM-87 전량 푸시 완료(패키지 정리 P1~P6·Dockerfile 포함). 재개 시 설계서의 '⏸ 스텝 6 착수 가이드' 섹션부터. 설계서 devdesign_collector-engine.md v2. 옵시디언 정리: projects/moveseye/2026-07-28-collector-engine-phase1.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: cd094fc1-7405-493d-8761-41d1f6d53427
  modified: 2026-07-29T06:07:46.314Z
---

2026-07-22 moveseye 방향 전환 확정: Zabbix 단일 → 다중 데이터소스(Zabbix+Prometheus+Datadog+Elastic, Grafana류). 사용자와 합의된 아키텍처:

- **논리 분리 지금**: 서비스↔수집 레이어를 capability 포트 4개(MetricPort/InventoryPort/AlertPort + ZabbixAdminPort=추상화 제외)로 분리, Gradle 멀티모듈(engine-api/engine-zabbix/app) in-process.
- **물리 분리(별도 엔진 서버+gRPC)는 유예**: 사용자가 처음 원했으나 논의 끝에 납득. 승격 조건 = 고객사 망 내 수집기 배치/폴링 부하/폴리글랏/팀 분리 중 하나 현실화. 계약은 proto 호환 규칙(Map 금지, .proto 정본 문서)으로 승격 비용 선지불.
- 실측 근거: 504파일 중 225개(45%) zabbix 참조, zabbix 패키지 밖 88파일이 hostid/itemid 사용. 병목 2개 = authToken 관통(모든 서비스 첫 파라미터), ZabbixClient→SettingRepository 의존.
- 관리 화면(zabbix/manage CRUD, trigger expression DSL)과 아이덴티티(Zabbix=IdP)는 **추상화 대상 아님** — Zabbix 전용 존치.
- 마이그레이션 스트랭글러 7스텝: 멀티모듈 골격→포트+매핑→A군 파일럿(memory→cpu)→A군 잔여→B군(HostService 2000줄 최후)→C·D 이동→Prometheus(둘째 소스, 추상화 실검증). Phase 1은 REST 불변·FE 무변경.
- 키 매핑 교훈들([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--disk-detail-item-family-fallback|disk-detail-item-family-fallback]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--swap-usage-pused-fix|swap-usage-pused-fix]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-traffic-bps-not-bytes|fe-traffic-bps-not-bytes]])은 engine-zabbix 매핑 테이블+테스트로 이관 예정.

**진행(2026-07-23): 스텝 0~3c 완료, A군(메트릭 읽기) 종결.** 전부 ZM-92 커밋 흐름(3c만 미커밋 상태로 사용자 커밋 대기였음). 전환됨: memory·cpu(2, 파일럿)·disk(3a, 배치조회+queryLatestFamily 신설)·network/interface(3b, history 배치+LatestValue.label)·responsetime/host-event 부분(3c, queryRecentText+TextSample 신설). 판정: ItemsService=전환보류(임의 itemid 패스스루, FE custom_item 위젯 유일 소비 — 캐노니컬 표현 불가), LiveCheck=대상 외(Item참조 0, B군). 매 스텝 실 Zabbix 전/후 응답 비교(3b 24/24·3c 70/70 byte-identical). 테스트 397→483. 잔존 레거시 소비자=HostService·ReportService(B군)+ItemsService뿐. 예외 이원화(신규=EngineException, 레거시 커널 스텝5 소멸). ⚠️value_type 유도가 원본 하드코딩 버그를 고침 — iostat/SNMP/LOG 실데이터 호스트 등장 시 재검증 항목(설계서 기록). 다음=스텝 4: InventoryPort/AlertPort를 실소비자(HostService 2000줄·LiveCheck getRaw) shape 보고 설계 + B군 갈아타기.

**진행(2026-07-27): 스텝 4a 커밋·푸시 완료, 4b(home) 진행 중 미커밋.**
- **4a(커밋됨)**: `3bb9e9c` InventoryPort(listHosts)·AlertPort(countActive) 계약 + 모델 7종(InventoryHost/HostQuery/HostNetworkInterface/InterfaceKind/Availability/AlertQuery/AlertSeverity) + ZabbixInventoryAdapter·ZabbixAlertAdapter + 레지스트리 2포트 해석 + **LiveCheckService 전환**(host.get raw Map→listHosts, authToken→CallerContext). 🔴교훈: 4a는 **테스트 미갱신 상태로 푸시됨**(LiveCheckServiceTest·ZabbixDataSourceRegistryTest 컴파일 실패 → 전 스위트 실행 불가) → `0cc29d3` FIX로 복구. 프로덕션 코드는 정상이었음. **앞으로 포트 전환 커밋 전 반드시 `gradlew test` 확인**.
- **4b(미커밋, 작업 중)**: `HomeService.safeAlarm` → `AlertPort.countActive` 전환 + `HomeServiceTest` mock 교체 완료. 응답 계약 보존 확인(severityCounts 키 "0".."5" = AlertSeverity.ordinal, Zabbix 코드와 항등). ⚠️HomeService는 **전이 상태** — infra/map/recentReports는 하위 미전환 서비스(HostService·GeoClusterService·ReportManagementService)에 authToken을 계속 넘김.
- **다음 착수점**: `HostEventService`(259줄). getStatusCounts(7×countBySeverities)·getCount는 countActive로 가능하나, **getInfo의 problem 목록 조회는 AlertPort에 메서드 없음** → `listActive` + `Alert` 모델(eventid/clock/rClock/severity/name — ZabbixProblem shape 참조) 신설 필요. 그 뒤 geomap/networkmap/asset → report → HostService(2000줄, 최후·분할).
- B군 실측 소비자(2026-07-27 grep): ZabbixHostService=16파일(asset·event·geomap·disk·host·manage·report·networkmap·classification·usergroup·zabbix/manage), ZabbixProblemService=8파일(asset·event·geomap·**home(전환됨)**·host-event·host·networkmap). zabbix/manage/*는 C군(스텝 5) 소관이라 제외.
- 환경 교훈: 전역 `JAVA_HOME`이 corretto-1.8이라 gradle이 거부 → **`$env:JAVA_HOME="C:\Program Files\Java\jdk-17"` 매번 지정 필요**.

**진행(2026-07-27 후반): 4c 대거 진척 — 커밋 6개 미푸시(ZM-87 ahead 6).**
- **완료**: 4c-1 맵(geo/network, `HostLiveAggregator`로 중복 통합) · 4c-2 asset 라이브(`HostQuery.include` 신설) · **4c-3 판정 ADR D9**(AssetSyncService=추상화 제외, Zabbix 미러링) · 4c-4a~e HostService 부분 전환 · 4c-5a `AlertQuery.nativeIds` · 4c-5b **`AlertRule` 신설**(getEventBells 파일럿).
- ✅ **`Alert.resolvedAtMillis` 실검증 완료**(4b부터 3스텝 미검증이던 항목) — `EventService.getREventsMap`→`/event/{id}/list-previous`에서 미해소 폴백+해소 7건 동시 확인. 예측을 두 번 틀렸던 이유: **"recent=true로 조회"와 "해소 시각을 응답에 낸다"는 다른 조건**.
- 🟢 **핵심 설계 판단 2개**: ①트리거 2단 조회(problem.get→trigger.get)를 **어댑터가 흡수**해 트리거 포트 불필요(`Alert.entities`) ②트리거 사용처가 둘로 갈려(목록용 이름/활성여부 vs `getTriggerDetail`의 Zabbix DSL) **`AlertRule` 5필드로 얇게** 신설, DSL은 스텝 5로 분리.
- 🔴 **기기분류 판정이 3변종**(레지스트리 검증 / 정확일치 / contains 부분일치) — 통일하면 응답이 바뀌어(§D7) 각각 그대로 이관 + "통일하지 말 것" 주석. **포트 전환 후 별도 과제**.
- 🔴 **`HostService.detail`은 전환 불가에 가까움** — 응답에 Zabbix 원시 Map(`interfaces`/`groups`)을 그대로 실어 보냄. 중립화 시 필드 손실 + 코드값 역변환 필요.
- **테스트 493→516**, 매 단계 실 Zabbix 전/후 비교(전부 identical, 차이는 실시간 메트릭뿐).

**4c-5c 완료(2026-07-27, 커밋 `d318fd8` 미푸시 — ahead 7): 포트 최초의 쓰기.**
- **모델 4종**: `AlertActionKind`(조치 9종, Zabbix 비트합을 계약에서 제거하고 `Set`으로) · `AlertAction`(조치 1건) · `AlertActor`(조치자 — 🔴`NamedEntity` 재사용 안 함, 그건 `EntityRef`=모니터링 대상 축이고 사용자는 다른 축) · `AlertAckCommand`. `Alert.actions`+`AlertQuery.includeActions` 옵트인.
- 🟢 **ADR D10 신설(쓰기 계약 원칙, 이후 모든 쓰기에 적용)**: ①대상은 **식별자 목록으로만**(필터로 쓰기 금지 — 소스가 필터를 다르게 해석하면 의도치 않은 대상까지 바뀜) ②명령은 서술적, 인코딩은 어댑터 ③capability 게이팅 ④읽기 포트와 안 쪼갬(같은 화면이라 ctx 2벌 방지) ⑤부분 성공 계약 없음(반환값 없음).
- 🔴 **`PROBLEM_CREATED`/`RESOLVED`는 조치가 아니다** — 생명주기 사건이라 모델에서 빼고 소비자가 시각 필드로 합성. 넣었으면 "조치자 없는 조치"가 계약에 박힘.
- 🔴 **응답 배열 순서가 계약이었다**: 기존 `getActions(int)`의 if 순서(CLOSE_PROBLEM 먼저)가 그대로 응답 `actions` 배열 — 비트순도 enum 선언순도 아님. 중립 enum 순서에 기대면 §D7 위반 → 서비스 `toActionKeys`로 명시 고정. **중립 모델을 써도 순서는 위임 못 함.**
- `getAllRelatedTriggers`→`AlertQuery.relatedTo`(2단 조회 어댑터 흡수). ⚠️`activeOnly` 신설 필요했음 — "활성으로 조회했는데 없으면 404"가 화면 계약이라 조회 범위가 응답을 바꾼다.
- 4c-5b 전이 상태 해소: `getStatusCounts`→`countActive`+`excludeSuppressed`. **`getEventBells`에서 레거시 Map 완전 소멸**(`getEventProblems`는 목록이 아직 Map → 4c-5d).
- ⚠️ **필터 추가 시 `toParams`(Map)와 `ProblemGetParams`(타입) 양쪽 동시 반영** — 한쪽만 넣으면 같은 질의가 경로에 따라 다르게 동작.
- ⚠️ **삼항 타입 승격**: `cond ? 0 : millis/1000L`이 `0`을 `0L`로 승격 → JSON-RPC 페이로드 타입이 원본과 달라짐. if/else 분리.
- **516→536 green**, 런타임 11그룹 전부 identical(심각도 변경 조치의 조치자 "Admin"·`HIGH→DISASTER`·해소 알람·problemCount·statusCounts 6변형). ✅`select_acknowledges`→`selectAcknowledges` 통일 무해 확인.
- 🔴 **쓰기 경로 런타임 미검증**(사용자 결정) — 실 Zabbix ack 이력은 삭제 불가라 되돌릴 수 없음. 페이로드는 단위 테스트가 원본과 1:1 고정.
- ℹ️ **proto drift 6스텝 밀렸던 것 전부 해소**(4c-4b~5b 누락분). **스텝 종료 체크리스트에 proto 갱신 넣을 것.** 선재 이슈 발견: proto enum 값 `SYSTEM`이 `MetricDomain`/`CallerRole` 중복 → proto3 패키지 스코프라 codegen 시 충돌, 스텝 6 전 해소 필요.
**4c-5d 완료(2026-07-27, 커밋 `bc438cc` 미푸시 — ahead 8): 알람 목록·이력 전환.**
- **`AlertHistoryQuery`+`listHistory` 신설** — 이력은 활성 알람 필터의 변형이 아니라 **다른 질의**(problem.get vs event.get)라 `AlertQuery`(13필드)에 안 붙이고 타입을 나눔. 정렬은 옵션이 아니라 **최신순으로 계약 고정**(열어두면 소스별 지원 차이가 샌다).
- **`Alert` 3필드 추가, 전부 Zabbix 마법값 정규화**: `suppressed`(Boolean nullable — "억제 아님"과 "개념 없음"은 다름) · `causeNativeId`("0"→null) · `recoveryNativeId`("0"→null).
- 🔴 **`recoveryNativeId`가 필요했던 이유**: 이력 조회에 알람+복구 사건이 함께 오는데, `resolved`/`resolvedAtMillis`로는 복구 사건을 식별 못 한다(복구 사건 자체는 미해소로 보임). **세 필드가 같은 축의 서로 다른 사실.**
- ⚠️ `causeEventId="0"`은 **응답에서 복원**(모델은 null) — 소스 표기 복원은 표현 계층의 일(4c-5c의 PROBLEM_CREATED 합성과 같은 원칙).
- ✅ **실증: `trigger.get`의 `time_from`/`time_till`은 Zabbix가 무시한다**(정식 파라미터는 `lastChangeSince/Till`). 시간창 4종(1·7·30·90일) 건수 완전 일치(17/42/74/88)로 확인 — 어댑터가 재현 안 해도 안전.
- `filter{status:0}` → `rule.enabled` 필터로 재현(**응답 건수 변동 지점**). 규칙 못 찾은 경우(`rule==null`)도 제외해야 원본과 같다.
- 🔴 **런타임에서만 잡힌 NPE**: `Integer x = a==null ? 0 : (b ? null : (int)expr)` — 중첩 삼항에서 int와 Integer가 만나 **양쪽 언박싱** → 안쪽 null이면 터짐. 컴파일·테스트 통과하고 90일 조회에서만 500. **단위 테스트가 조합을 못 덮으면 런타임 채집이 유일한 그물.**
- ⚠️ `suppress_until`의 "필드 없음"→0, "0"(무기한)→null로 **직관과 반대**(원본 `!"0".equals(문자열)` 탓). getEventAcknowledges는 또 조건이 달라 **셋 다 통일 금지**.
- ℹ️ `selectSuppressionData`는 요청만 하고 안 쓰던 것 → 전환하며 자연 소멸(4c-5b의 selectAcknowledges와 같은 패턴).
- 소멸: `ZabbixUserService` 의존 + 죽은 헬퍼 6종(buildUserMap·getActions·isResolved·resolutionTimeOrPending·mapGroups·parseDouble).
- **536→547 green**, 런타임 **19그룹 전부 identical**(시간창4·억제·심각도·키워드·정렬2·페이징·그룹3·이력7·회귀3).
**4c-5e 완료(2026-07-27, 커밋 `5391043` 미푸시 — ahead 9): 알람 도메인(B군) 포트 전환 종결.**
- **계약 4필드**: `Alert.acknowledged`(🔴actions에서 유도 안 함 — UNACK로 취소 가능해 이력 되감기 필요하고 소스가 최종 상태를 안다. **파생 가능해도 소스가 권위 있게 주면 싣는다**) · `Alert.suppressedUntilMillis`(⚠️`AlertAction.suppressUntilMillis`=조치 시 *요청한* 만료와 다름, 이쪽은 **현재 유효한** 억제) · `AlertRule.manualCloseAllowed` · `InventoryHost.enabled`(4c-4d가 지목했던 필드 → 4c-4f도 열림).
- 🟢 **ADR D11 신설 — 4c-5b의 오분류를 뒤집었다**: `manual_close`를 expression과 **같은 문장에서 봐서** Zabbix DSL로 묶었었다. **값이 어디서 오는지(같은 trigger.get)가 아니라 그 값이 답하는 질문으로 갈라야 한다** — 4c-5c가 `CLOSE_PROBLEM`을 중립 조치로 넣은 이상 그 허용 여부도 같은 축. 스텝 5 이관 목록은 항목마다 "다른 소스에 같은 질문이 있나"를 개별로 물을 것.
- 스텝 5 확정: `expression`·`recovery_expression`·`eventGeneration`·`state`·`opdata`·`comments`. `getEventTriggerDetail`·`getTriggerDetail` 2곳이 EventService의 마지막 Zabbix 의존.
- ⚠️ **`Map.of()`는 `get(null)`에서 NPE**(HashMap과 다름) — 규칙 미요청 경로에서 objectid 부재 시 터지던 결함. 런타임에선 output=extend가 가려서 안 보였고 **테스트 스텁이 드러냄**. 빈 `Map.of()` 기본값 쓰는 자리마다 키 null 확인.
- `getHostActiveAlarmCounts`는 `resolveHostStatuses`와 **완전히 같은 질의**였다(4c-4c `byEntitiesWithOwner`) → 재사용. HostService trigger 조회 2→1곳.
- **547→557 green**, 런타임 9그룹 identical. ✅**`manualCloseAllowed` 실검증**: 87개 알람 훑어 `manualClose=true` 14건 발견→6건 채집. **값이 전부 false인 채 identical을 받았다면 증거가 없었을 것**(4c-5a 예측 실패 교훈 적용).
- 🔴 **미검증(데이터 부재)**: dev 환경에 비활성 호스트 0·억제 0·확인된 알람 0·원인 있는 알람 0·형제 2건이상 0 → `enabled=false`·`suppressedUntilMillis`·`acknowledged=true`·`causeNativeId`는 **단위 테스트로만** 덮임. 그래서 테스트가 없던 `ZabbixInventoryAdapter`에 신설.
- ℹ️ `canConvertToCause` 이론적 차이 수용: 원본은 필드 부재 시 true(`!"0".equals(null)`), 새 코드는 false. extend가 항상 필드를 줘 실응답 동일(14건 일치).
**4c-4f 완료(2026-07-28, 커밋 `5d91c66` 미푸시 — ahead 10): 서버·네트워크 목록 전환.**
- **소스가 하던 일 둘이 app으로**: ①이름 정렬(포트는 정렬을 계약에 안 둠 — 소스별 지원 차이) ②기기분류 태그 필터(`HostInclude.TAGS`로 받아 app 판정, 4c-4a 선례 — app 필터가 "정확히 1개"라 더 엄격해서 결과 동일).
- 🔴 **런타임 비교가 잡은 정렬 버그**: Zabbix는 **대소문자를 구분하는 코드포인트 순**이다(`Haley` H=72 < `gab-ubu-ans_2` g=103). `CASE_INSENSITIVE_ORDER`로 짰다가 순서 뒤집힘으로 발견. **단위 테스트는 내가 믿는 규칙만 확인한다 — 소스의 실제 규칙은 실데이터가 알려준다.**
- **`InventoryHost.osName`+`HostInclude.OS` 신설, §D9 경계 명시**: D9는 "inventory를 **통째로** 싣지 말라"이지 "inventory 이름이 붙으면 전부 금지"가 아니다. 실소비자가 읽는 한 필드는 §D2 스코프 절제대로 증분 추가.
- ⚠️ **4c-4d 표 정정**: `getHostNetwork`를 "호스트 status 필요"로 분류했으나 **output에 요청만 하고 응답에서 안 쓴다**(응답의 status는 알람 상태). **요청 파라미터가 아니라 소비 지점을 봐야 한다.**
- ⚠️ 응답의 `host`(기술명) 필드는 **원래부터 항상 null**이었다(output에 미요청). 계약 보존 위해 명시적 null.
- ℹ️ 미사용 요청이 또 드러남: `dns`·`port`·`useip`·`details`·`model`(4c-5b selectAcknowledges·4c-5d selectSuppressionData에 이은 3번째).
- 덤: `getHostGroupDetail` 그룹 알람 전환 → **HostService에서 `ZabbixProblemService` 소멸**.
- **557→566 green**, 런타임 13그룹에서 식별자·이름·OS·정렬·건수·statusCounts 전부 일치, 차이는 **실시간 메트릭뿐**.
- **HostService Zabbix 직접 호출 16→13곳.** 남은 성격: 아이템 lastvalue 9곳(**A군/MetricPort 성격, 카탈로그 확장 필요한 별도 트랙**) · 이벤트 이력 3곳(시간창 기준 — `listHistory`는 규칙 기준이라 다른 질의) · `detail`(⛔raw 노출) · `getCollectedInfo`(⛔**스텝5 판정 신규** — templates·items 메타는 Zabbix 구성 개념).
**4c-4g 완료(2026-07-28, 커밋 `d2b0962` 미푸시 — ahead 11): 아이템 조회 전환.**
- 전환 3곳(icmpHealth·networkMetrics·hostItems) + 카탈로그 4항목(`PING:alive`·`SYSTEM:hw.session.num`·`SYSTEM:proc.num`·`MEMORY:size.pused`).
- 🔴 **폴백 체인이 응답을 바꾼 첫 사례**: `MEMORY:pused` 체인이 legacy 키뿐인 호스트에서 실값을 찾아 **`memoryUsage 0→11`**. 스텝 2 회고가 "그때 재평가"로 남긴 항목이 실제로 왔다. **재평가 결론=§D7 준수** — "값이 더 정확해지는 것"도 Phase 1엔 계약 변경이고, 리팩터링 커밋에 값 변경을 섞으면 추적 불가. 폴백 **없는** `MEMORY:size.pused` 신설로 해결.
- 🟢 **카탈로그에 "같은 값의 두 해석"을 나란히**: `pused`(체인="아무 키로든")와 `size.pused`(정확="이 키만")는 중복이 아니라 **다른 질문**. 폴백은 편의이지 항상 옳은 기본값이 아니다.
- ⚠️ `DISK:fs.pused`는 `{partition}` 차원이라 **family 금지, 정확 키(partition=/)로** 조회해야 한다 — 그래야 폴백이 **호스트별**로 판정돼(`BatchResolver`) 원본과 일치.
- 🔴 `getHostItems.cpuUsage`는 원본이 키 불일치(`load[percpu]` 조회 → `system.cpu.util`로 꺼냄)로 **항상 0** → 조회 안 하고 0 유지(§D7).
- ℹ️ `PING:alive`는 **filter(정확일치) 필수** — search면 icmppingsec/loss가 섞인다. 원본의 방어 코드가 계약 정확성으로 대체됨.
- ⚠️ `getHostNetworkMetrics`가 1콜→6콜(포트에 다중 메트릭 배치 없음). 대상이 수 대라 수용, 큰 소비자 생기면 어댑터 배치 필요.
- **566 green**, 런타임 6그룹 중 topHosts 완전 identical·나머지는 실시간 메트릭뿐.
- **HostService Zabbix 직접 호출 13→10 메서드**(아이템 9→6곳).

**남은 작업 실측(2026-07-28)**: app에서 Zabbix 직접 참조 13파일 —
🟡전환대상: HostService(21호출, 아이템6+이벤트이력3+기타) · HostManageService는 C군 · HostGroupService(8) · ReportService(4) · EventSyncService(4) · DiskService(2) · DeviceClassification(2)
⬜이동만(스텝5): HostManageService(19, C군 호스트CRUD) · AdminUsrgrpService(3, D군 아이덴티티)
⛔판정완료: AssetSyncService(D9) · EventService(D11 트리거DSL) · ItemsService(§D2 itemid 패스스루)
**읽기 경로 전환은 약 8할 지점.**
**4c-4h 완료(2026-07-28, 커밋 `e08e442` 미푸시 — ahead 12): 두 서비스 완전 정리.**
- **파일 단위로 Zabbix 서비스 호출 0을 만든 첫 스텝**: `DiskService`(그룹호스트·호스트명→InventoryPort) · `DeviceClassificationService`(태그 카운트→InventoryPort TAGS).
- `getSuperAdminToken()` → `CallerContext.system()`(§D3) — 설정 화면의 시스템 조회라 호출자 권한과 무관.
- 🟢 **`HostGroupService`=C군 판정(스텝5)**: 8곳 중 6곳이 그룹 CRUD(§D2 관리화면). 읽기 1곳(`listHosts`)도 응답 DTO(`HostResponseDto`)가 **`ZabbixHost`를 생성자로 직접 받고 기술명·model을 노출** — 포트 모델에 없는 2필드. **읽기만 떼면 파일이 두 세계에 걸쳐** 함께 이동이 일관.
- ⚠️ `DiskService`에 `HistoryPoint`(Zabbix 모델)는 남음 — 라인차트 응답 DTO 구성요소(§스텝2 회고 알려진 항목). **서비스 호출과 모델 타입은 다른 축**이라 "완전 정리" 기준은 서비스 호출.
- **566 green**. app의 Zabbix 직접 참조 **13→11파일**.
**4c-4i 완료(2026-07-28, 커밋 `6784778` 미푸시 — ahead 13): 배치 동기화 전환.**
- **`AlertQuery.limit` 신설 — 페이지네이션이 아니라 안전장치**. 4b가 "페이지네이션 없음(전량→app 슬라이스)"으로 정했지만 그건 **순서가 의미 있는 목록** 이야기고, 배치는 상한 자체가 목적이다(app에서 자르면 소스가 전부 보내야 해 의미 없음).
- 🔴 **DB에 쓰는 값도 §D7 대상이다**: `event_problems`가 Zabbix 표기 `r_event_id="0"`·`r_clock=0`을 저장해 왔고 **기존 행과 섞인다** → 모델의 null 정규화를 되돌림(4c-5d causeEventId 선례). **"응답 불변"의 응답에 영속 데이터도 포함.**
- ⚠️ **런타임 전/후 비교가 불가능한 첫 전환**(스케줄러 배치라 REST 응답 없음) → **단위 테스트가 유일한 그물**(4c-5e ZabbixInventoryAdapter와 같은 상황). DB 기록값·질의 옵션 고정.
- 사용자 목록은 D군 유지 — "이벤트 × 전 사용자" 읽음상태에 계정 전체가 필요(조치자만으론 부족).
- report 계열: `ReportManagementService`·`ReportSchedule` 그룹 조회 → `listGroups`. Schedule은 미전환 `ReportService`가 authToken을 요구해 토큰 유지.
- ⚠️ **테스트 함정**: `anyString()`은 **null을 매칭 안 한다**. `getSuperAdminToken()` 미stub → 토큰 null → 사용자 조회 stub 미적용 → 배치 미실행. 실패가 원인에서 두 단계 떨어져 나타남.
- **570 green**. app의 Zabbix 직접 참조 **11→8파일**.

**4c-4j 완료(2026-07-28, 커밋 `c583b12` 미푸시 — ahead 14): 기존 계약으로 되는 마지막 잔여.**
- **전환 2곳**: `ReportService.computeReport`(그룹 호스트 목록→`listHosts`) · `HostService.getHostNetwork`(인터페이스 개수→`queryLatestFamily`, 이 메서드에서 authToken 소멸).
- 🟢 **"값이 아니라 건수가 답"인 첫 계열 조회** — 아이템 값을 하나도 안 쓰고 개수만 센다. `listDimensions`가 자연스러워 보이나 **호스트당 1콜**이라 `queryLatestFamily`(전 호스트 1콜)가 원본 콜 수와 일치. **계열 조회는 값을 안 쓰는 소비자에게도 옳은 도구.**
- 🔴 **카탈로그 `NETWORK:if.in.perif.family` 신설 — 프리픽스의 `[` 하나가 계약**: 기존 `if.in.family`(search "net.if.in")는 파라미터 없는 `net.if.in`까지 걸려 **개수가 +1** 된다. 4c-4g `pused`/`size.pused`와 같은 패턴.
- ⚠️ **`ReportService`는 ctx+authToken 둘 다 받는 전이 상태**(4b HomeService와 같은 형태) — 난제 3이 풀려야 해소.
- 🔴 **캐시/스냅샷 낀 경로의 런타임 비교 함정**: 리포트는 저장본이 있으면 재계산을 안 해, 비우지 않으면 after가 before의 스냅샷을 반환해 **전환 경로를 안 탄 채 identical**이 나온다. **"같은 코드가 실행됐는가"를 먼저 보장할 것**(양쪽 truncate 후 40호스트 재집계 확인).
- **570→573 green**, 런타임 8그룹 중 리포트3종·그룹별 네트워크·home identical, 차이는 실시간 메트릭뿐. ✅인터페이스 8건 전/후 일치(값 있는 실검증). ℹ️proto 갱신 없음(engine-api 무변경).
- **HostService Zabbix 직접 호출 10→9 메서드**, app 참조 8파일 유지.

**4c-4k 완료(2026-07-28, 커밋 `0e8094c`+`f8a4959` 미푸시 — ahead 16): 계열 트렌드 신설, 공통 난제 3 해소.**
- **계약 2종 신설**: `MetricPort.queryTrendFamily`(=`queryLatestFamily`의 트렌드 대응물) · `ChainMode(FALLBACK|UNION)`. 전환 2곳(`getGroupResourceTrend`·`summarizeMetric`)은 `ResourceTrendQuery`(app 공용, 4c-1 HostLiveAggregator 선례)로 통합 — **집계 수식은 서로 달라 각 서비스에 남김**.
- 🔴 **UNION이 필요한 이유**: 폴백은 "1차 패턴이 **전 엔티티에서** 비었을 때"만 넘어가서, dev에 `vfs.fs.size` 27키·`vfs.fs.dependent.size` 32키가 **공존**하는 그룹에서 2차 철자만 가진 호스트가 **통째로 누락**된다. ⚠️UNION은 **중복 제거 안 함**(원본 concat과 1:1) → 패턴 상호 배타성이 등록 조건.
- 🔴 **정규식→dims 이관은 실 키 집합을 먼저 훑어서 살았다**: `net.if.in.discards[…]`·`net.if.in.errors[…]`가 **실재**해, 추측한 규칙(`sub==null`)이었으면 100건이 트래픽에 섞였다. **프리픽스에 `[`를 넣는 것**이 그 경계(4c-4j 인터페이스 개수와 같은 이유). 동치 검증 트래픽 51/51×2·디스크 17/17.
- 🟢 **cpu·memory는 계열이 아니라 "정확 키 여러 개"였다** — 원본이 search 후 `itemKeys.contains`로 exact match했다. 넷 다 계열로 보고 시작했다가 원본 필터를 읽고 갈렸다. ⚠️memory는 `size.pused`(정확)이지 `pused`(체인) 아님.
- 성능: `queryTrend`의 trend.get을 셀당 1콜→전체 1콜 배치(호스트40×메트릭2=80콜 될 자리).
- **573→584 green**. 런타임: **리포트 완전 identical**, 자원 추이는 **구조 전건 동일**(시리즈 수·순서·이름·포인트 수·타임스탬프 불일치 0), 값 17576개 중 114개(0.65%)가 **최대 상대오차 2.5e-16**.
- ⚠️ **그 차이는 부동소수점 누적 순서**(`+=`는 결합법칙 불성립). **리포트가 identical인 건 `round(v*100)/100`이 잔차를 흡수해서**고 추이는 raw double을 그대로 실어 드러났다. 누적 순서를 계약에 넣는 게 더 나쁘다고 보고 수용.
- 🔴 **캐시 낀 경로 비교 함정 2번째**(4c-4j 리포트 스냅샷에 이어): 자원 추이는 Redis 60초 캐시라 after가 before 캐시를 돌려줄 수 있다 → `_4k_flush.mjs`로 매 실행 전 삭제. **"같은 코드가 실행됐는가"를 먼저 보장할 것.**
- **HostService 9→8 메서드**, ReportService는 `summarizeAlerts` 1곳만 남음.
- ⚠️ **"app의 Zabbix 참조 8파일"은 전환 추적 대상(B·C군)만 센 숫자다**(2026-07-28 정정). app 전체는 **16파일**이고 나머지 8개는 처음부터 스코프 밖인 D군(아이덴티티·세션): UserService(23)·UserGroupService(7)·AuthService(5)·AdminUserService(4)·JwtAuthFilter·SettingService·EventSyncService·ReportSchedule(4c-4l에서 소멸). 전부 스텝 5 이동 대상.

**4c-4l 완료(2026-07-28, 커밋 `7892090`+`f9f521f` 미푸시 — ahead 2, 그 이전은 원격에 올라감): 이벤트 이력 계약, ReportService 완전 전환.**
- **`AlertHistoryQuery` 확장**(타입을 또 나누지 않음): `ruleNativeId` nullable + `groupIds`·`range`·`includeEntities`·`onsetOnly`. 4c-5d의 분리 기준(problem.get vs event.get)을 적용하면 이번 4곳은 **같은 질의의 다른 필터 축**이다.
- 🔴 **제약을 풀 때는 그 제약이 겸하던 역할을 먼저 찾아라**: 필수였던 `ruleNativeId`가 "무제한 이력 스캔 방지"를 겸하고 있었다 → **`ruleNativeId` 또는 `range` 중 하나 필수**로 대체(생성자 강제).
- 🟢 **`includeEntities`는 성능 옵트인** — 원본이 집계용/목록용 event.get을 **분리 호출**한 이유("기간 내 전체 이벤트에 selectHosts 걸면 매우 느림")가 계약에 없으면 전환하며 **조용히 사라진다**.
- 🟢 **`Alert.entities`: `EntityRef`→`NamedEntity`** — 어댑터가 소스에서 받은 이름을 `.map(NamedEntity::ref)`로 **버리고 있었다**. ⚠️`listActive`의 트리거 2단 조회 경로는 selectHosts에 name을 **안 더함**(name=null): 그 소비자는 belongsTo만 쓰므로 요청을 바꿀 이유가 없다(§D7·§D2).
- ✅ **원본 3변종이 동치임을 소스 문서로 확인**: `event.get`의 `source`/`object` **기본값이 둘 다 0**이라 파라미터 유무가 무관 → 계약에 안 옮김. 실제 축은 `value=1` 하나뿐(`onsetOnly`). 4c-4d 기기분류 3변종과 달리 **통일해도 안전한 변종**이었다.
- 🔴 **정렬 계약이 동점 순서를 뒤집었다(런타임 비교가 검출)**: `listHistory`는 최신순 고정인데 원본은 무정렬(≈발생 오름차순). 건수·집합은 같고 **Top 호스트 동점 그룹 순서**만 뒤집힘(stable sort + LinkedHashMap 삽입 순서). → 계약 유지하고 **소비자가 역순 순회**로 복원. **정렬 계약이 있는 포트에서도 소비자가 순서를 명시해야 한다**(4c-5c 연장).
- **584→586 green**, 런타임 **리포트 3종 identical**(1차에서 위 순서 뒤집힘 검출 → 수정 후 2차 해소), 나머지는 실시간 메트릭뿐.
- 🟢 **`ReportService` 파일 단위 완결**(Zabbix 0·authToken 0). `ReportSchedule`의 `getSuperAdminToken()`도 소멸.

**4c-4m 완료(2026-07-28, 커밋 `db26d44` 미푸시): 이력 소비자 3/4 종결.**
- `getGroupAlertTrend`(event.get 2회→`listHistory` 2회) · `getProblemsByHostGroup`(hostgroup.get+event.get→`listGroups(allWithHosts)`+`listHistory`).
- 🟢 **계약을 한 번 제대로 만들면 다음 소비자는 싸다** — 새 계약 없이(모델 1건만) 두 메서드 이동, 런타임 **차이 0건**.
- 🟢 **4c-4l의 `includeEntities`가 바로 다음 스텝에서 실사용**됐다(집계용 false / 목록용 limit+true). **원본을 읽고 만든 옵션이라 맞아떨어졌다.**
- 🟢 `InventoryGroup.hosts`→`NamedEntity`. ℹ️`GroupQuery.includeHosts`는 4c-4b 신설 후 **소비자가 없어** selectHosts에 name 추가가 §D7 위험 0이었다.
- ⚠️ `getProblemsByHostGroup`은 **그룹 제약 없는** 이력 질의(전 그룹 가로지름) — 4c-4l이 안전장치를 "규칙 **또는** 시간창"으로 정의한 게 유효했다(그룹까지 필수였으면 막혔다).
- 소멸: `extractHostName`·`parseIntSafe`. **586 green**, 런타임 6그룹 identical(알림추이 3시간창×4그룹·문제요약 5변형·회귀2).
- 🔴 **`getHostGroupDetailProblems`는 보류 판정 후보**: ①`Alert.tags` 신설 필요 ②`opdata`는 **4c-5e(D11)가 Zabbix 전용 확정** — 판정을 다시 열어야 함 ③호스트 IP는 이벤트가 아니라 `host.get(selectInterfaces)`에서 옴. **하나가 기존 판정을 뒤집는 일**이라 단독 스텝으로.

**4c-4n 완료(2026-07-28, 커밋 `d0bff20` 미푸시): 서버 목록 사용률 전환 + 인터페이스 보류 판정(ADR D12).**
- **`fetchHostItemsMap` 전환**: 아이템 키 Map → `HostUsage` 레코드. 정확 키 4종은 `queryLatest` 1콜, 트래픽은 계열+`sub=bytes`(4c-4k 방식). 콜 6→3. **소비자에서 키 문자열 소멸**.
- 🔴 **`DISK:fs.root.size.pused` 신설** — 기존 `fs.root.pused`는 폴백 체인이라 dependent 계열만 가진 호스트(zabbix-server)의 diskUsage가 **0→실값**으로 바뀐다. 4c-4g `MEMORY:pused` 재판. **"같은 값의 두 해석" 패턴 3번째 사용**.
- ⚠️ **트래픽은 조회 유지 — 4c-4g cpuUsage와 다르다**: 둘 다 "항상 0"이지만 cpuUsage는 **키가 어긋나 논리적으로** 0이었고, 이쪽은 **데이터가 있으면 값이 생기는** 자리다. **"항상 0"이 같아도 이유가 다르면 처리가 다르다.**
- **586 green**, 런타임 9그룹에서 **실시간 필드(cpu/mem/responseTime) 제외 차이 0건**(disk·proc·트래픽·정렬5·페이징·그룹필터 전부 일치).
- 🟠 **ADR D12 — 인터페이스 상세/그래프 2곳 보류(조건부, ⛔ 아님)**: ①Zabbix `item.interfaceid`(폴링 인터페이스 바인딩)는 Prom/Datadog에 대응물 없음 ②응답 DTO의 `interfaceId`가 Zabbix id이고 FE가 그래프 URL 키로 씀 — 축 바꾸면 계약 변경 ③**dev에서 아예 동작 안 함**(실측: `ifOperStatus`·`ifAdminStatus`·`ifDescr`·`[pps]`·`net.if.errors`·`[,bytes]`·`[,packets]` 정확 키 **전부 0건**, 실제 키는 `net.if.status[ifOperStatus.2]`·`net.if.speed["{GUID}"]` 형태 → 상세는 빈 응답, 그래프는 항상 WIDGET_NOT_FOUND). **원본의 substring search ↔ 정확 키 조회 불일치(선재 결함)** 때문에 중립화 자체가 응답을 바꾼다. 재개 조건 2개를 설계서에 기록.

**스텝 5 완료(2026-07-28, 커밋 `1ce2abd`+`ff9fcf9` 미푸시): Zabbix 계약 이동 + 컴파일 의존 차단.**
- 🟢 **패키지명 유지 + 모듈만 이동 → import 변경 0건**(git이 48개 전부 `rename (100%)`). 추정은 "하위 스텝 4개"였는데 실제로는 **이동 2번**으로 끝났다. **"어디에 두느냐"와 "뭐라 부르느냐"는 다른 결정이고, 후자를 안 건드리면 전자는 공짜에 가깝다.**
- 구조: `engine-api/engine/`(중립 계약) · `engine-api/zabbix/`(Zabbix 전용 48개, 추상화 없음) · `engine-api/common/exception/`(레거시 커널) · `engine-zabbix`(구현 28개).
- 🔴 **§D8 판정을 뒤집었다**: 예외 커널을 "HttpStatus 결합이라 engine-api 불가"로 뒀는데, app 30여 파일이 써서 **커널이 engine-zabbix에 있는 한 차단 불가**였다. (a)engine-api에 spring-web 추가(enum 하나, 계약 변화 0) vs (b)HttpStatus→int(**403→HTTP 200 보존 로직** 건드림). (a) 채택. **원칙이 목표를 막으면 원칙의 비용을 재본다.**
- ✅ **차단 실효성을 증명**: runtimeOnly로 내리니 app 프로덕션이 **무수정 컴파일**(=구현 참조 0건 증거) → 이어서 engine-zabbix 타입 참조 프로브를 넣어 빌드가 깨지는 것까지 확인 후 제거. **"차단했다"는 컴파일 성공이 아니라 의도한 것이 깨지는지로 증명한다.**
- ℹ️ 테스트는 `testImplementation` 유지(카탈로그 커버리지 교차검증). 막을 대상은 프로덕션 코드.
- ⚠️ 후속: `ZabbixItemKey`가 `HostService` 1곳(보류된 인터페이스 경로)에 잔존. `zabbix/manage`(61파일)·`zabbix/sync`는 app 존치 — REST/JPA 레이어라 engine 모듈 불가이고 이제 계약만 참조하므로 기준 충족.
- **586 green.**

**⏸ 스텝 6(Prometheus) 보류 — 2026-07-28 사용자 결정("지금은 연결 안 함"). Phase 1은 여기서 종료.**
상세 착수 가이드는 설계서 `⏸ 스텝 6 착수 가이드` 섹션. 요점만:
- 🔴 **목적은 "연결"이 아니라 "검증"이다** — 리스크 표가 "정규화 모델의 Zabbix 오염(1개 소스만 보고 설계)"의 완화책으로 이 스텝을 잡았고 **"모델 수정 예산 확보"**가 함께 적혀 있다. **계약이 깨질 것을 전제한 단계**이며, 깨지면 Zabbix 어댑터도 같이 고쳐야 한다.
- **세 덩어리로 쪼개고 ①만 먼저**: ①Prometheus 어댑터(포트 3개) ②레지스트리 DB화+`/datasources` ③FE 소스선택·capability 게이팅. **①에서 계약이 깨지면 ②③은 다시 짜야 하므로 순서가 중요**. ③은 **Phase 1 내내 없던 FE 작업**이 처음 생기는 지점.
- **포트별 전망(가설)**: 🟢`MetricPort`(PromQL로 대응) · 🔴**`InventoryPort`가 가장 위험**(Prometheus엔 호스트 인벤토리 개념 없음 — `up`의 instance/job 라벨 정도, interfaces·osName·enabled·tags 대응 애매) · 🟡`AlertPort`(Alertmanager는 별도 API, ack↔silence로 개념 다름 — §D10 쓰기 계약이 시험됨) · ⛔zabbix 전용은 capability로 꺼지는지 확인이 검증 항목.
- **선결**: ①proto enum `SYSTEM` 중복(`MetricDomain`=8/`CallerRole`=1) 해소 — proto3 패키지 스코프 충돌 ②로컬 docker Prometheus+node_exporter ③`Alert.tags` 신설은 여기서 다루면 자연스럽다(태그=Prom 라벨·Datadog 태그 대응).
- ⚠️ **검증 방식이 스텝 1~5와 다르다**: Phase 1은 "REST 응답 불변"(§D7)이 기준이라 런타임 전/후 비교가 그물이었지만, 스텝 6은 "새 소스에서 화면이 성립하는가"라 전/후 비교가 성립하지 않는다 → Zabbix 경로 **무회귀**와 Prometheus 경로 **신규 검증**을 분리할 것.

**🚩 지금 상태(2026-07-29 확인): Phase 1 완결 + 전량 푸시 완료.** 스텝 5 이후 패키지 구조 정리 P1~P6(`705f0cb`~`d0c9057`)과 Dockerfile 멀티모듈 복구(`3a36194`)까지 origin/ZM-87에 반영됨 → [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-package-structure|be-package-structure]]. 그 뒤 브랜치는 지리맵(`38ae4d4`)·스케줄러 옵션화로 이어짐.

**(참고) B군 읽기 전환 종결 상태:**
🟢 **B군 읽기 전환은 사실상 종결됐다.** `HostService` 잔여 5메서드는 전부 판정 완료/보류다 —
⛔`detail`(raw Map 노출)·⛔`getCollectedInfo`(스텝5) · 🟠인터페이스 2곳(D12) · `getHostGroupDetailProblems`(판정 후보).
**다음은 스텝 5**(C·D군 이동): HostManage 19 · HostGroup 8 · UserService 23 · UserGroup 7 · Auth 5 · AdminUser 4 · AdminUsrgrp 3 · JwtAuthFilter · SettingService · EventSyncService + 레거시 예외 커널 제거 + app→engine-zabbix 컴파일 의존 차단.
- ✅ **이벤트 이력 3곳은 4c-4m에서 종결**. 남은 `getHostGroupDetailProblems`는 위 보류 판정 후보.
- ✅ 인터페이스 2곳·`fetchHostItemsMap`은 4c-4n에서 처리(전자는 보류 판정 D12, 후자는 전환).
- 🔴 **공통 난제 1 — 이벤트 이력 질의가 없다**(4~5곳이 `getEventsRaw` 사용). 4c-5d의 `AlertHistoryQuery`는 **`ruleNativeId` 필수(규칙 기준)**라 안 맞음 — 이들은 **시간창+그룹/호스트 기준**. (a)완화(ruleNativeId nullable+entities/groupIds/range) vs (b)별도 타입. ⚠️(a)면 "무제한 스캔 방지"가 풀려 limit 필수화 등 대체 안전장치 필요.
- 🔴 **공통 난제 2 — `LatestValue`에 `nativeId`(itemid) 없다**(`Series`엔 있음). 인터페이스 계열 2곳이 itemid로 history를 재조회. 필드 추가는 작지만 소비자가 itemid 조회를 이어가 목적이 반만 달성 — 어댑터가 history까지 묶는 게 나은지 함께 판단.
- ✅ **공통 난제 3(계열 트렌드) — 4c-4k에서 해소**(`queryTrendFamily`+`ChainMode`).
- ⚠️ `fetchHostItemsMap`은 **키 문자열을 Map 키로 쓰고 `contains("bytes")` 패턴 매칭** — 중립화 시 재구성 필요.
- **착수 순서**: ③**이벤트 이력 질의 설계 후 4곳** — `summarizeAlerts`부터 하면 ReportService가 완전 전환(authToken 소멸)되는 **가장 짧은 완결선** → ④인터페이스 2곳(난제 2; 4c-4k처럼 **어댑터가 계열+history를 묶는** 방향이 유력) → ⑤`getHostGroupDetailProblems`(최대, opdata 얽힘 — 보류 판정 후보) → `fetchHostItemsMap`은 dims 이관 전 **실 키 집합 대조 선행**
- 그 뒤 **스텝 5**: HostManage 19·HostGroup 8·AdminUsrgrp 3 이동 + 레거시 예외 커널 제거 + app→engine-zabbix 컴파일 의존 차단.
- **작업 환경 재사용**: `_workspace`에 채집 인프라 있음 — `_5c_run.ps1`(JAR을 dev프로필 :3099로 기동) · `_4j_collect.mjs`(채집 템플릿) · `_4j_diff.py`(전/후 비교). before/after JAR은 `git stash push -u` → bootJar → stash pop → bootJar 순으로 만든다. ⚠️**서버는 `Start-Process -WindowStyle Hidden`으로 띄울 것** — PowerShell `Start-Job`은 툴 호출이 끝나면 프로세스째 죽는다. 로그가 UTF-16이라 grep이 안 먹으니 기동 대기는 `curl` 폴링으로.

**Why:** 책임 분리 목적은 모듈 경계로 달성되고, 서버 분리는 지금 규모(1인 운영)에선 proto 계약·배포 2벌·부분 장애 처리 비용만 추가하기 때문.
**How to apply:** 새 BE 기능에서 Zabbix 직접 호출 추가하지 말고 포트 경유 여부 확인. 설계 정본은 `C:\solutions\_workspace\devdesign_collector-engine.md`. Elastic은 메트릭 소스가 아니라 로그 신규 도메인(별도 설계 예정).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

수집 엔진 방향 확정 — 2026-07-22 다중 데이터소스(Zabbix+Prom+Datadog+Elastic) 전환 확정. 포트4개(Metric/Inventory/Alert+ZabbixAdmin제외) in-process 멀티모듈 지금, gRPC 엔진서버 분리는 유예(승격조건 명시). 설계서 _workspace/devdesign_collector-engine.md, 스트랭글러 7스텝(파일럿 memory→cpu, HostService 2000줄 최후), Phase1 REST불변·FE무변경. **07-29: Phase1 전량 푸시 완료(패키지 정리·Dockerfile 포함). 07-28: 4a~4c-4i 완료(app의 Zabbix참조 8파일). 4c-5c=포트 첫 쓰기(AlertAckCommand)+ADR D10 쓰기 계약 원칙(대상은 식별자만·필터 금지). 4c-5d=알람 목록·이력 전환+listHistory 신설, Alert에 억제/원인/복구 3필드(Zabbix "0" 정규화). 547 green·런타임 19그룹 identical. 교훈: 중첩 삼항 int/Integer 언박싱 NPE는 런타임 채집으로만 잡힘, trigger.get의 time_from은 Zabbix가 무시(실증). 4c-5e=알람 상세 전환+ADR D11(중립/Zabbix전용 경계는 "값이 답하는 질문"으로 가른다 — manual_close를 스텝5에서 되찾음). 557 green. 교훈: Map.of()는 get(null)에 NPE. 4c-4f=서버·네트워크 목록 전환+osName(§D9는 "통째로 싣지 말라"이지 필드 단위 금지 아님). 566 green. 🔴Zabbix 정렬은 대소문자 구분 코드포인트 순 — 런타임 비교로만 잡힘. 4c-4g=아이템조회 전환+카탈로그4항목. 🔴폴백체인이 응답 바꾼 첫 사례(memoryUsage 0→11) → §D7 지켜 폴백없는 MEMORY:size.pused 신설. 566 green. 4c-4h=Disk·기기분류 파일단위 완전정리+HostGroupService C군 판정. 4c-4i=EventSync배치 전환+AlertQuery.limit(상한≠페이지네이션). 🔴DB에 쓰는 값도 §D7 대상(event_problems의 "0" 표기 복원). 570 green. 다음=HostService잔여·ReportService → 스텝5**
