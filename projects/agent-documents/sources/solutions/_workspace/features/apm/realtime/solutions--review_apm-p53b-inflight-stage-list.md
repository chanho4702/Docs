# 검수 요청 — APM P5.3b 진행 중 요청: 자바 확장 추적기 → BE 1초 수집·목록 → FE 요청 흐름 무대(동전 개체·깔때기·원판 연동)

- 요청: Claude · 2026-09-23 · 사용자 "코덱스한테도 지금까지 코드 점검좀 해주고 효율성이랑 문제검토하라그래"
- 검수 등급: 코덱스 `gpt-5.6-sol`(high), 읽기 전용. 레포 3곳을 따로 돌린다(FE·BE·확장).
- 티켓 **#ZM-122**. 커밋은 전부 **미푸시**.

## 범위

### 1) 자바 확장 `C:\solutions\moveseye-otel-extension\` (git 아님, jar 0.2.0 → `C:\ProgramData\moveseye\otel\`)
`src/main/java/com/dmove/moveseye/otel/active/` 전부 + `src/test/java/...` 전부, `build.gradle.kts`, `README.md`.
- `ActiveRequestTracker` — `AtomicReferenceArray<Token>` 추적기. 슬롯 소유권은 객체 동일성 CAS, PROBE 64 + 전체 훑기 + 1ms 백오프, 상한 = 배열 크기. 요청 경로에서 **문자열을 만들지 않는다**(rawPath·opAttributes 참조만). `oldest(nowNanos, n)` 힙 선별.
- `ActiveRequestOperationMetrics` — HTTP_SERVER 리스너. 제외 경로(SSE 스트림 3개 기본) → `EXCLUDED` 토큰. flowStarted/flowEnded(오류 우선, 느림=slow-threshold-millis 2000).
- `ActiveRequestChildOperationMetrics` — DB_CLIENT/HTTP_CLIENT/RPC_CLIENT 자식 리스너. 토큰에 `opKind`·`opAttributes` 참조만 두고, onEnd에서 같은 op일 때만 지움. `describe()`는 스냅샷이 상위 N건에만 호출.
- `ActiveRequestMetricsAgentListener` — `afterAgent`에서 게이지 5+2 등록, `*_recent` 차분, 전용 1초 `SdkMeterProvider`(`DedicatedActiveRequestMeter`, 리플렉션으로 resource/config), 목록은 로그 레코드 한 줄(`moveseye.kind=active_requests`, 본문 `[{t,s,m,p,e,a,o,d}]`, listSize 기본 30·최대 100).
- `ActiveRequestState` — 옵션(exclude-paths·slow-threshold·detailed-counters), flow LongAdder 4개.

### 2) BE `moveseye-be-spring` master `81bdceb`..`779a8b7`(5커밋, 14파일)
- `overview/live/LiveRuntimeMetrics.java` — `ActiveAge`·`AgeHistory`(120초 원형버퍼 + flow, CARRY_SECONDS 1)·`ActiveList`/`ActiveEntry`·`recordActiveList`·`mergedActiveList`, 상한 `ACTIVE_LIST_MAX 100 / PER_INSTANCE 40 / WIRE 20`.
- `overview/live/LiveBuffer.java` — `offerActiveList(serviceId, instanceId, list[, now])`.
- `collector/ingest/store/MetricIngestor.java` — `collectActiveAge`(확장 메트릭 허용목록, 저장 우회, 저장 0이어도 링에 전달).
- `collector/ingest/live/ActiveRequestListIngestor.java`(신규) — OTLP LOGS 분기에서 확장 로그 가로채기, MAX_ITEMS 40, MAX_BODY_CHARS 256KB. `ApmOtlpController` 필드 주입(required=false).
- `overview/live/spans/LiveSpanRuntimePayload.java` — `activeAge`·`activeAgeSeries{endSecond,perSecond,flow}`·`activeList{...,wireLimit,items[{t,s,m,p,e,a,i,o,d}]}` 스트림 직렬화(서비스당 20건).
- `overview/live/ApmLiveActiveRequestsDto.java`(신규)·`ApmLiveSnapshotService.activeRequests`·`ApmLiveStreamController` `GET /apm/live/active-requests?serviceId=`(전체 100건, 드로어가 2초 폴링).
- 테스트: `LiveRuntimeMetricsTest`·`MetricIngestorTest`·`LiveSpanRuntimeStreamTest`·`ActiveRequestListIngestorTest`.

### 3) FE `moveseyee_fe` master `23ee6dc`..`87eacdf`(8커밋) + **미커밋 5파일**(동전 개체·깔때기·원판 연동)
- `realtime/ApmLiveFlowStage.tsx` — 캔버스 무대(rAF 루프). 서비스마다 한 줄: 깔때기 레일 5줄 → 동전 무리(개체, `reconcileApmLiveCoins`) → 나가는 레일. 붙잡기(`holdApmLiveTiers` 1.5초)+착지 동전, 등장/퇴장/색 전환/미끄러짐, 초당 유입·유출(최근 5초 평균), 공 상한 초당 8/서비스, `onDisplayTiers`(바뀔 때만 위로 알림 → 원판).
- `realtime/liveSpans/inflight.ts` — 빌더 전부(view/timeline/equalizer/flowStage/flowTotals/activeList/activeListFromDto) + `holdApmLiveTiers`·`reconcileApmLiveCoins`·`orderApmLiveCoins`.
- `realtime/ApmLiveInFlight.tsx`(원판 3개+요약, `shownTiers`와 스냅샷 중 큰 쪽), `ApmLiveInFlightCharts.tsx`, `ApmLiveInFlightList.tsx`(ResizableDrawer), `ApmLiveInFlightTable.tsx`, `ApmActiveTab.tsx`(연결·REST 우선·하단 표), `lib/echarts/apmInFlight.ts`, `types/apmLiveSpans.ts`·`types/apm.ts`(activeList·TApmLiveActiveRequestsDto), `services/apm.api.ts`(getLiveActiveRequests), `hooks/useApmLive.ts`(useApmLiveActiveRequests 2초), `hooks/useApmLiveSpans.ts`+`liveSpans/constants.ts`(IDLE_MS 0 — 유휴 끊김 없음, 사용자 결정), `apm-realtime.scss`, 로케일 `inflight.*`.
- 테스트: `realtime/__tests__/ApmActiveTab.test.tsx`(캔버스 getContext null 목), `apmLiveSpansInFlight.test.ts`(58건 통과).

## 의도
- 진행 중 요청을 **확장이 1초마다 찍는 분포·목록**으로 보고, BE는 저장하지 않고 메모리 링에만 둔다(영속성 안 함 — 사용자 결정).
- 대용량 방어: 확장 요청 경로 무할당, 인스턴스당 40건·서비스 100건·스트림 20건·본문 256KB, 드로어만 REST 전체.
- 무대는 "공 = 요청 하나"가 아니다(초당 8 상한). 동전은 스냅샷+붙잡기(1.5초)라 스냅샷 사이에 끝난 짧은 요청도 잠깐 보인다 — 원판·합계는 스냅샷과 동전 수 중 큰 쪽.

## 중점 확인 요청 (여기가 핵심)
1. **확장(고객 JVM 안)**: 핫패스 할당·락·예외 전파 0인가. `opAttributes` 참조 보관이 에이전트 `Attributes` 수명과 충돌하지 않나(스팬 종료 후 참조 유지 = 메모리 누수?). 토큰 배열 상한 초과 시 동작, 스레드 경합에서 슬롯 유실(ABA) 재검토. 전용 1초 MeterProvider가 에이전트 종료·리로드 때 정리되나. 리플렉션 실패 시 폴백.
2. **BE**: `AgeHistory` 원형버퍼의 초 경계·CARRY·인스턴스 합산이 정확한가(서비스별 endSecond 다름). `recordActiveList` 낡은 목록 거부·STALE 90초 퇴출. `ActiveRequestListIngestor` 파싱 방어(잘못된 JSON·거대 필드)와 OTLP LOGS 경로에서 다른 로그와 섞일 때 비용. 새 EP 권한(`requireRead`)·`@VisitorIdCheck`. 스트림 페이로드 크기(서비스 60개 × 20건 × 1초).
3. **FE 무대 효율**: rAF 프레임마다 `holdApmLiveTiers`·`reconcileApmLiveCoins`·`orderApmLiveCoins`(정렬)·그라디언트 생성이 서비스 20줄에서 부담인가. `Map` 참조(held/landed/coins/cluster)가 사라진 서비스에 대해 **영원히 남는** 누수. `onDisplayTiers` → `setState`가 rAF 안에서 불려 React 렌더를 유발하는 빈도. 탭 숨김/복귀 시 `dt` 100ms 클램프·공 폭주. `ballsRef` 600 상한.
4. **의미 정합**: 동전(붙잡기+착지)이 원판·합계까지 올라가는 것이 "실측값"과 어긋나는 오해 소지 — 문구/도움말에서 충분한가. `holdApmLiveTiers`의 승격(파랑→주황)이 실제 요청 이동과 다른 경우.
5. 놓친 케이스·회귀: IDLE_MS 0으로 스트림을 영원히 유지하는 것의 서버 비용, 드로어 REST 2초 폴링이 열린 채 방치될 때.

## 검증 현황
- 통과: 확장 gradle test(추적기 9·목록·자식 op·벤치 옵트인), BE 격리 워크트리 테스트(위 4 클래스), FE `tsc`·`eslint 0`·jest 58/58, 헤드리스 캡처로 무대 표시 확인(대용량 방어 커밋 전 기준).
- 못 한 것: **최신 BE 코드·확장 jar로의 런타임 실측**(BE 재기동 대기 중), 실브라우저에서 동전 애니메이션 프레임 비용 측정, 서비스 20줄 이상 부하.

## 검수 결과
코덱스 `gpt-5.6-sol`(high) 2026-09-23 — 결과 파일 `review_apm-p53b-inflight-stage-list_codex-{ext,be,fe}.md`. 아래는 Claude 반영(같은 날).

### FE
- [x] 🔴 단계 승격 이중 집계 — `holdApmLiveTiers`(단계별) → `holdApmLiveCount`(총 건수 하나). 스냅샷보다 많은 몫은 1초 미만 칸의 **합성 동전**. 테스트 추가.
- [x] 🔴 합성 동전이 "현재 처리 중"으로 보임 — 합성 동전은 **옅은 점선(ghost)**으로 구분. 원판·합계는 사용자 결정(동전과 같은 숫자)대로 두되 `ApmLiveInFlight` 주석과 도움말에 "최근 1.5초 안에 들어왔거나 끝난 요청 포함"을 적음(`rt_inflight` detail 갱신은 아래 잔여).
- [x] 🔴 숨김 탭·일시정지 복귀 재생 — `resetMotion()`: `running` 전환·`visibilitychange`에 공·효과·착지를 버리고 `seenSecond`를 마지막 초로.
- [x] 🔴 ECharts 툴팁 HTML 주입 — `escapeHtml`(axisValue·seriesName·color).
- [x] 🟡 rAF 비용 — 동전 그라디언트 색별 캐시(translate/scale), 이름 자르기 캐시, 레일은 평행 구간 직선 1개 + 깔때기 8단.
- [x] 🟡 `onDisplayTiers` 렌더 폭주 — 250ms throttle.
- [x] 🟡 capacity·승격 — 윗단계부터 채움, 임의 하위 단계에서 승격(0→2), capacity 초과분 퇴장. 테스트 3건.
- [x] 🟡 길이 다른 시계열 — `length − series.length + index − shift`. 테스트.
- [x] 🟡 Map 누수 — stage 갱신마다 6개 Map prune, 관측 없는 rate 삭제.
- [x] 🟡 REST 폴링 — `visible && listTarget && at===null`. IDLE_MS 0(SSE 유지)은 사용자 결정이라 유지 — 서버 상한·관측 지표는 백로그.
- [x] 🟡 activeList 항목 방어 — 객체 아닌 항목 건너뜀(스트림·REST 둘 다). asOf 0 표시는 잔여.
- [ ] 🟡 애니메이션 회귀 테스트(fake rAF/Canvas) — 잔여(순수 함수 테스트만 추가).
- 추가(사용자 결정): "서비스별 지금 처리 중" 이퀄라이저 차트 제거(무대와 중복).

### BE
- [x] 🔴 목록 인스턴스 무제한 누적 — `ACTIVE_LIST_MAX_INSTANCES=16`(서비스당), 목록 경로에서도 1초마다 STALE 회수, 넘치면 `truncated`.
- [x] 🔴 힙 예산 누락 — `ESTIMATED_HISTORY_BYTES`(64×6.2KB)·`ESTIMATED_LIST_BYTES`(16×40×700B)를 예산식에 포함, `DEFAULT_MAX_HEAP_MB` 192→384(`application.yml` 기본도). 테스트 갱신.
- [x] 🔴 문자열 무상한 — 수신기에서 traceId/spanId 32·method 16·path 512·op 200자, 목록당 64K자, total/limit clamp, 객체 아닌 항목 무시, `items>MAX_ITEMS`도 truncated.
- [x] 🟡 단건 REST가 전체 재계산 — `LiveBuffer.runtimeSnapshot(serviceId, now)` 추가, REST가 사용. (1초 감시기는 전체가 필요해 그대로.)
- [x] 🟡 미래 asOf — 2초 초과 미래 거부.
- [x] 🟡 asOf 병합 보정 — 기준=가장 새 asOf, 옛 목록 항목의 경과에 차이 가산. 테스트 갱신.
- [x] 🟡 혼합 로그 배치 비용 — 레코드마다 속성 Map 복사 제거(`hasKind` 선형 검색), 최신 레코드만 유지.
- [ ] 🟡 스트림 `live`가 모든 multipart 프레임에 반복 — 잔여(20건×512자 상한으로 서비스 60개 ≈ 0.6MB, 2MiB 안). 첫 part에만 싣는 것은 별도.
- [ ] 🟡 증분 시계열 합산(조회 시 120×인스턴스 재합산) — 잔여.
- [ ] 🟡 경계 테스트(65 인스턴스·2MiB 프레임·동시 수집/조회) — 일부만(인스턴스 상한·미래·회수).

### 확장
- [x] 🔴 목록 로그 크기 상한 — 필드 결합 전 자르기(method 16·raw path 512·describe 입력 200), 본문 64K자 bounded writer, hex 이스케이프.
- [x] 🟡 Token 참조 scrub — `release()`(op·rawPath null, slot −1)를 종료·TTL 양쪽에서.
- [x] 🟡 초기화 실패 시 요청 경로 — `ActiveRequestState.isActive()`(metric 등록 뒤 true, output harness 예외) 전에는 리스너가 즉시 반환.
- [x] 🟡 토큰 부분 공개 — 요청 정보를 생성자에서 채워 CAS 전에 완성. 빈 칸을 본 뒤에만 토큰 할당(포화 시 GC 증폭 완화).
- [x] 🟡 자식 작업 3-volatile — 불변 `Op`(kind·attributes·startNanos) 하나, Context에도 같은 객체, 동일성으로 해제.
- [x] 🟡 1초 콜백 3회 순회 — `snapshot(…, listSize)` 한 순회로 분포+상위 N건, `LIST_TOTAL`=snapshot.active.
- [x] 🟡 provider 훅 실패 — 즉시 shutdown. 언로드 미지원 명시.
- [x] 🟡 실패 카운터 — `listenerFailures` AtomicLong + try/catch.
- [x] 🟡 설정 파싱 — `list.size` 비숫자/음수→30, 0만 비활성, README 100. exclude 32개·200자 상한. `MAX_LIMIT` 100만→20만.
- [ ] 🟡 listener·생명주기 경합 테스트 — 잔여(release·목록 상한·설정 파싱 테스트만 추가).

검증: FE tsc·eslint 0·jest 263/263(realtime) · BE `:test` APM 패키지 172클래스 통과 · 확장 gradle test 19/19(벤치 skip), jar 재배치.

### 런타임 실측 (2026-09-23 오후)
BE 재시작(V67 적용) 뒤 임계를 1초로 낮추고 `livecheck`(≈1.2s) 4병렬 부하 → 장부 14행(ENDED, "그때 하던 일" 포함) → STUCK_REQUEST 이벤트 발화·해소 → Zabbix push 2회 → 화면 캡처 정상. 임계 60초 복원, 임시 계정 삭제.
발견·수정 2건(커밋 별도): ① 수집기 `redaction/pii`가 목록 본문 13자리 숫자를 가려 항목 있는 목록만 버려짐 → 확장 `a` 제거·BE `asOf−e` 계산·파싱 실패 DEBUG ② 이벤트 SSE 실제 경로 `/event/stream` 기본 제외 누락 → 추가.
