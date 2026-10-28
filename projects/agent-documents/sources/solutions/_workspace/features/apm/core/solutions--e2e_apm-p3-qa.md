# APM P3 종단 런타임 QA — SLO · 홈 위젯 · 합성 감시 · 메시징/배치 · 리포트 · AI 툴 · 권한

> 🔁 **2회차(2026-09-08) 재검증 결과는 이 문서 맨 아래 [§7](#7-2회차-재검증-2026-09-08)에 있다.**
> 1차 결함 D1~D9 · M-1~M-4 · A1~A8은 **재검증 대상 전건 통과**했고, 새 결함 6건(D10~D13 · A9 · A10)이
> 나왔다. 아래 §0~§6은 **1차(2026-09-07) 시점의 기록**이며 그대로 둔다.

- 일시: 2026-09-07 17:14 ~ 18:2x (KST)
- 대상 BE: 사본 **`:3001`** — `moveseye-be-spring` **`19b5674`** 시점의 워킹트리로 `bootJar`(pid 42100, dev 프로필, DB **`dmove_apm`@5433** 도커)
- 대상 FE: Vite **`:5174`** — `moveseyee_fe` **`a830de3`** + 미커밋 34파일(다른 세션의 리포트 화면·차트 증분 작업). `VITE_API_URL=http://localhost:3001` 확인
- AI: `moveseye-ai` **`ce2d026`** — 사용자의 :3100은 :3000을 보므로 쓰지 않고 **:3101 별도 인스턴스**를 띄워 검증
- 계약: `_workspace/features/apm/core/contract_apm-p3.md`(§1~§8) · `_workspace/features/apm/core/contract_apm-p3-ai.md`
- 원칙: 판정은 **API 응답 + DB 실측 + Zabbix 실측 + DOM 어서션**. 🔴 **스크린샷 0장** — 차트가 실제로 그려졌는지는 캔버스 **픽셀 샘플링**(칠해진 픽셀 수·고유 색 수)으로 확인했다
- 🔴 사용자 자원 **무접촉**: `:3000`(pid 46172)·`:5173`(pid 38584)·`:3100`(pid 7948)·DB `dmove` 전부 QA 종료 시점까지 살아 있고 건드리지 않았다. **제품 소스 수정 0**
- 일회성 산출물: `%TEMP%\claude\C--solutions\73f0e76e-…\scratchpad\qa\p3\`
  (`run_be.py`·`api.sh`·`q.sh`·`zbx.sh`·`sweep_p3.py`·`items_snap.sh`·`lib.mjs`·`b0~b18*.mjs`·`sweep_{admin,A,B,C}.txt`·`be3001.log`·`msg/`·`ai/`)

## ⚠️ 빌드 기준에 대한 고지

지시대로 `git stash` 없이 **워킹트리 그대로** 빌드했다. jar에는 다른 세션의 미커밋 15파일
(`host/cpu`·`memory`·`network`의 증분 차트 쿼리 + `common/response/IncrementalChartQuery`)이 **포함돼 있다**.
APM 패키지와 겹치지 않아 이 QA의 판정에 영향은 없다고 보지만, 재현 시 같은 트리가 아니면 결과가 다를 수 있다.
또 **QA 진행 중 BE·FE HEAD가 `dcfc281`(APM 설치 가이드 문서 출처)로 전진**했다 — 내 jar은 그 커밋을 포함하지 않는다.

---

## 0. 요약표

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| **0. 기동** | | | |
| 0-1 | V49~V55 적용 | **PASS** | 기동 로그 86~93행 `Migrating … "49"`→`"55"` · `Successfully applied 7 migrations … now at version v55` · `Started MoveseyeApplication in 31.8s` |
| **1. SLO — API** | | | |
| 1-1 | 생성(AVAILABILITY 30일 / LATENCY 7일) | **PASS** | 둘 다 200. 산식 손검증 일치: `errorBudgetTotal=(1-0.999)×216,551=216.551`(반올림 없음) · `budgetRemainingPct=(216.551-10)/216.551×100=95.3821` · LATENCY `good/measured=215,911/216,551=99.70446` |
| 1-2 | `maxThreshold = 1/(1-목표)` | **PASS** | 목표 99.9 → **1000.0** · 목표 99 → **100.0** |
| 1-3 | 창 기반 기본 임계 | **PASS** | 30일 **14.4**(=0.02×30×24) · 7일 **3.36**(=0.02×7×24). `slowThreshold=threshold/2.4` (6.0 / 1.4) |
| 1-4 | 임계 상한 배타 거절 | **PASS** | 목표 99.9에 임계 1000 → `APM_ALERT_RULE_INVALID_THRESHOLD` |
| 1-5 | 임계 하한 — **1은 허용** | **PASS** | 1 → 200 · 0.5 → 400 |
| 1-6 | 검증 7종 | **PASS** | `INVALID_TARGET`(0·100) · `INVALID_WINDOW`(14) · `LATENCY_THRESHOLD_REQUIRED` · `KIND_UNSUPPORTED` · `NAME_REQUIRED` · `DUPLICATE`(**409**, 대소문자 무시) · `APM_SERVICE_NOT_FOUND`(잘못된 uuid 포함) |
| 1-7 | 🔴 `null`은 0이 아니다 | **PASS** | 요청 0건 서비스의 SLO → `sliPct/budgetRemainingPct/burn*` 전부 `null`, `status:"UNKNOWN"`, `burnCondition:"UNKNOWN"` |
| 1-8 | `measured` / `requests` / `mixedBounds` | **PASS** | 응답에 존재, 이 데이터셋에서는 `measured==requests`·`mixedBounds:false`(경계 혼재 케이스는 만들지 못함 — §4 미검증) |
| 1-9 | `measuredFromMs`/`ToMs` | **PASS** | `windowFromMs 1786177040700` vs `measuredFromMs 1786177200000` — 롤업 버킷 격자만큼 늦다 |
| 1-10 | 번 레이트 4개 + `burnCondition` | **PASS** | 임계 1.5에 `burn1h 2.55 · burn5m 1.72` → **FAST**. 30일 SLO는 전부 0 → `NONE` |
| 1-11 | PUT 부분 수정 · 불변 필드 | **PASS** | `serviceUid`·`sliKind` 변경 시도 무시 · `burnAlertThreshold` 미전송 시 1.5 유지 |
| 1-12 | 알람 화면에서 `SLO_BURN` 생성 거절 | **PASS** | `POST /apm/alert-rules {kind:SLO_BURN}` → 400 `APM_ALERT_RULE_SCOPE_INVALID` |
| **1b. SLO — Zabbix 실결선** | | | |
| 1b-1 | 아이템 `apm.slo_burn[<slo_uid>]` 실생성 | **PASS** | itemid 91967·91968·91969, 호스트 `MovesEye APM`(10758) |
| 1b-2 | 트리거 `>0` 실생성 | **PASS** | 41593~41595, expression `last(/MovesEye APM/apm.slo_burn[<uid>])>0` |
| 1b-3 | 🔴 **`history.push` 세 값 실관측** | **PASS** | 같은 회차(17:22:07)에 **`2.553485`(위반 · 발화한 FAST 줄의 1h 값과 소수 6자리까지 일치)** / **`0`(쟀고 정상)** / **`-1`(측정 불가)** |
| 1b-4 | 실제 발화 · `-1`은 발화 안 함 | **PASS** | 41593 **PROBLEM**(17:21:23) · `-1`·`0` 쪽은 OK 유지. 우리 DB `apm_alert_event` id 7 생성 |
| 1b-5 | 스냅샷 배치 수동 트리거 + 백필 | **PASS** | `POST /settings/schedulers/apm_slo_snapshot/run` → SLO당 **7일치**. 지난 날 `finalized=t`·`measured_until=다음 자정`, 오늘 `finalized=f` |
| 1b-6 | `staleDefinition` | **PASS** | 목표 99.9→99.5 변경 시 `def_version 1→2`, 지난 6칸이 `stale:true`+당시 목표 99.9 보존, 오늘 칸만 `false`+99.5 |
| 1b-7 | 캘린더 빈 날 = 행 없음 | **PASS** | 요청 0건 서비스 SLO는 오늘 칸 1개뿐이고 값이 전부 `null`(0 아님) |
| 1b-8 | 시리즈 — 단조 감소·빈 칸·해상도 승격 | **PASS** | 73점 `budgetRemainingPct` 단조 비증가(**음수 -1.01까지**), 요청 0 칸은 `sliPct:null`+`requests:0`으로 **점이 온다**, 30일 창에 `step=60` 요청 → **7200** 반환 |
| 1b-9 | 삭제 = 스냅샷 + Zabbix 동반 정리 | **PASS** | 삭제 전 스냅샷 7행 → 0행 · itemid 91970 소멸 · **고아 0**(아이템 수 = SLO 수) |
| 1b-10 | Zabbix 정리 큐(`apm_zbx_cleanup`) | **미검증** | 동기 경로가 매번 성공해 큐가 비어 있었다. Zabbix URL을 깨뜨려 강제 실패시키려 했으나 설정이 캐시돼 실패 유도 실패. **큐 없이도 누수 0**은 확인 |
| **2. 홈 위젯 3종** | | | |
| 2-1 | 카탈로그 등록(BE enum) | **PASS** | `HomeWidgetType` 21종, `apm_status`(6×8)·`apm_slow_services`(4×8)·`apm_alerts`(6×10), 전부 `pinned=false·unique=true·adminOnly=false` — 계약 표와 일치 |
| 2-2 | 기본 세트 제외 | **PASS** | 기본 레이아웃 12개에 apm_* 없음 |
| 2-3 | FE 사본 일치 + `apm.view` 게이팅 | **PASS** | `constants/homeWidgets.ts` 크기·unique 동일, `APM_HOME_WIDGET_TYPES`+`isHomeWidgetTypeVisible`로 카탈로그 노출까지 권한에 태움(계약의 선택지 ⚠️를 구현) · i18n kr/en 키 존재 |
| 2-4 | 3 EP 응답 | **PASS** | `windowMinutes:60` 서버 제공 · `errorTop`/`services`에서 못 재는 서비스 제외(잴 수 있는 1개만) · `sloRisks`에 WARN만 |
| 2-5 | 화면 렌더 | **PASS** | 세 카드 모두 실데이터. `전체:9 정상:3 수신끊김:6` / `moveseye-be 363ms` + "1위인데 정상일 수 있습니다" 문구 / `열림`·`버짓 위험 SLO … 67.8% · 2.86×` |
| 2-6 | 딥링크 | **PASS** | `/application-monitoring/overview` · `/services` · `/alert-rules?tab=events` · 서비스 `/services/{uid}` · SLO `/slo/{sloUid}`(실제 이동 확인) |
| 2-7 | `unique` 중복 거절 | **PASS** | 같은 타입 재추가 → `WIDGET_DUPLICATE` |
| 2-8 | `limit` 클램프 | **미검증** | 잴 수 있는 서비스가 1개뿐이라 0·21·999·-1이 전부 1행 — 클램프가 관측되지 않는다(`abc`는 `INVALID_DATA` 400) |
| **3. 합성 감시 — 실 Zabbix round-trip** 🔴 | | | |
| 3-1 | 생성(한글·쉼표 이름, 단계 2, RAW/FORM) | **PASS** | httptestId **23** 생성. `qa-apm-syn-한글, 쉼표 시나리오` |
| 3-2 | 🔴 `post_type` 미전송 · RAW/FORM 정합 | **PASS** | Zabbix 실측: RAW 단계 `posts`가 **문자열**(`{"a":1,"b":"한글"}`), FORM 단계가 **배열**(`[{name,value}…]`). `post_type`은 Zabbix가 스스로 0/1로 계산 |
| 3-3 | 결과 아이템 9개 생성 · 쉼표 이름 키 인용 | **PASS** | `web.test.time["qa-apm-syn-한글, 쉼표 시나리오",단계 하나 RAW,resp]` 등. `web.test.error`는 `value_type=1`(Character) |
| 3-4 | 🔴 **BE가 인용된 키를 제대로 읽는가**(R-8) | **PASS** | 쉼표 때문에 Zabbix가 키를 따옴표로 감쌌는데도 `checks24h:2` · `availability24hPct:0.0` · `p95Ms:86.747` · `staleSeconds:17`이 나온다 — **빈 차트 아님** |
| 3-5 | 🔴 **PUT round-trip → 아이템 id 동일**(R-7) | **PASS** | 상세를 그대로 되돌려 보내며 `retries`만 바꿈 → 9개 itemid **전부 동일**(`diff` 무차이) |
| 3-6 | 🔴 **반증 실험**: `httpStepId` 제거 | **PASS(계약 경고 실증)** | 200으로 통과하고 stepId 35·36 → **37·38**, 단계 아이템 6개 itemid 전부 교체 = **이력 끊김**. BE는 막지 않는다(§2 D9) |
| 3-7 | 🔴 **화면 Drawer round-trip** | **PASS** | 편집 Drawer → 저장 시 실제 PUT 본문에 `steps[].httpStepId:["37","38"]` 포함, `postType/postsRaw/postFields` 세트 유지, **아이템 id 불변** — R-7이 화면 경로로도 닫혔다 |
| 3-8 | `hostId` 수정 불가 | **PASS** | Drawer에서 `disabled`, API로 보내도 무시(호스트 10758 유지) |
| 3-9 | 검증 10종 | **PASS** | `NAME_REQUIRED`·`HOST_REQUIRED`·`STEPS_REQUIRED`(생성/전삭제 양쪽)·`STEP_INVALID`·`STEP_DUPLICATE`·`RETRIES_INVALID`(0·11)·`DELAY_INVALID`(`3일`·`0`·`2d`)·`NOT_FOUND` |
| 3-10 | 사용자 매크로 주기 통과 | **PASS** | `{$INTERVAL}` → 생성 200, `delaySec:null`·`expectedChecks24h:null`·`coveragePct:null`·**`stale:false`**("아직"과 "끊겼다"를 구분) |
| 3-11 | `monitoredBy` 분기 | **PASS** | 실 데이터에 `SERVER`(호스트 10·시나리오 14)·`PROXY`(67·8) 두 종류. 합 22 = 전체. `locationName`은 `Zabbix server`/`ZabbixProxyDemo`로 null 아님. **`PROXY_GROUP`은 이 Zabbix에 없어 미검증** |
| 3-12 | results / calendar / 실패 사유 | **PASS** | `STATUS_CODE_MISMATCH` + 한글 title/hint + **`raw` 원문 동반**(`response code "405" did not match …`). 실행 안 된 2단계는 `points:[]`·`p95Ms:null`. 캘린더 `coveredDays:1 < days:30` |
| 3-13 | `byProxy` 휴리스틱 | **PASS** | 첫 단계 URL이 같은 `dmove.co.kr health check`(PROXY)를 형제로 묶고 `self:true/false` 구분 |
| 3-14 | bind / unbind / 중복 / 오해제 | **PASS** | bind 200 · 다른 서비스에 bind → **409 `ALREADY_BOUND`** · 남의 서비스에서 unbind → **404 `BINDING_NOT_FOUND`** |
| 3-15 | 🔴 `orphaned:true` | **PASS** | Zabbix에서 시나리오를 직접 지운 뒤 조회 → `orphaned:true` + `name`부터 `p95Ms`까지 **전부 null**, `checks24h:0`, `stale:false` |
| 3-16 | 화면(목록·상세·서비스 탭) | **PASS** | 목록 25행 + testid가 **httptestId 축**(`apm-synthetic-link-23`) · 상세에 단계별 응답시간·응답 코드 타임라인·캘린더·형제 비교·실패 사유(원문 포함) · 서비스 상세 `합성 감시` 탭에 연결/해제 UI |
| 3-17 | 🔴 **원복** | **PASS** | httptest 22개(원래 수)·`qa-apm-syn-*` 0건·host 10758의 `web.test.*` 0건·`apm_synthetic_binding` 0행 |
| **4. 메시징 / 배치** (별도 에이전트, OTLP 직접 주입) | | | |
| 4-1 | 베이스라인 | **관찰** | 🔴 샘플 앱은 PRODUCER·CONSUMER 스팬을 **0건** 낸다(`apm_span` 202,871건 중 0). 두 화면은 100% 주입 데이터로만 검증됐다 |
| 4-2 | 🔴 롤업 잡 정정 | **관찰** | 메시징·배치 집계는 `apm_rollup`이 아니라 **`apm_trace_rollup`**(워터마크 `trace_rollup_watermark_5m`)에서 돈다 |
| 4-3 | destinations 축·건수·백분위 | **PASS** | (서비스,시스템,목적지,오퍼레이션) 4축. 혼합 표본 `p50/p95/p99 = 17.5 / 22.45 / 22.89`가 손계산과 소수점까지 일치 |
| 4-4 | 소비 지연 · 미측정 | **PASS** | `lagCount 8 < count 11` · `lagUnmeasuredPct 27.27` · `lagAvgMs 260.0`(=2080/8) · `lagMaxMs 520.0` |
| 4-5 | 🔴 `lagP95OverCap` | **PASS** | 실측 p95 60초가 상한 10초로 접힌 상황에서 `lagP95Ms:10000.0 · lagP95OverCap:true · lagMaxMs:60000.0` — 과소 추정을 신호로 알린다 |
| 4-6 | 🔴 링크 짝 검증(같은 큐·같은 시스템·시계 역전) | **PASS** | 다른 큐 링크·rabbitmq↔kafka·음수 지연 전부 **미측정**(0으로 접지 않음). 발행이 90분 전이면 lookback 밖이라 미측정 |
| 4-7 | 배치 `job.*` 규약 | **PASS** | 루트+INTERNAL+`job.name`만 수집(자식·SERVER 스팬은 무시), `runs/failures/successRatePct 66.67`, `avgMs 70000.0`, `maxMs 120000.0`, `lastRun*` 정확 |
| 4-8 | 🔴 늦은 도착(V54) | **PASS** | 시작이 창 밖 40분 전인 50분짜리 잡 수집됨(`avgMs 3,000,000`) · 완료까지 창 밖인 대조군은 미수집(무차별 긁기 아님) |
| 4-9 | `/runs` · `traceLinkable` · `truncated` | **PASS** | 최근순, `errorMessage "qa boom 42"` 추출, 8일 전 실행은 `traceLinkable:false`, 2,001행 주입 시 2,000 + `truncated:true` |
| 4-10 | 화면(메시징 표·간트) | **PASS** | 15행. `미측정 27.27%`·`표본 적음`·**`≥ 10,000ms`**(상한 배지) 렌더. 배치 표 3행 + 간트 캔버스 실제 페인트(고유색 56) |
| **5. 리포트** | | | |
| 5-1 | 목록 `type`·`title` 신설 | **PASS** | HOST_GROUP 행에도 `type`·`title` 부여. APM 데이터 0건일 때 기존과 동일한 목록(총 31) |
| 5-2 | lazy 백필 + 기간 정규화 | **PASS** | `periodType=WEEK&periodStart=2026-09-03`(주 중간) → `2026-08-31 ~ 2026-09-06`으로 정규화 후 **그 자리에서 생성·저장**(`apm_report_snapshot` 1행) |
| 5-3 | 빈 기간(월간 2026-08) | **PASS** | `serviceCount:0`, `totals` 전부 null, `previousTotals:null`·`totalsDelta:null`, `availabilityCellSeconds:3600` |
| 5-4 | 🔴 요청 0건 서비스 = null | **PASS** | `qa-direct`·`qa-oldsemconv`가 `errorRatePct/p50/p95/p99/apdex` 전부 `null`, `delta:null` |
| 5-5 | 오류 코드 4종 | **PASS** | `APM_REPORT_PERIOD_INVALID`(`DAY`·`2026-13-99`) · `REPORT_PERIOD_NOT_CLOSED`(진행 중 주) · `APM_REPORT_NOT_FOUND`(**호스트그룹 id 31로 불러도 여기로**) · `INVALID_DATA`(삭제 본문 공백) |
| 5-6 | `type` 필터 관대함 | **PASS** | `APM`·`apm`·`APM_WEEKLY` 동작, `APM_MONTHLY`+`periodType=WEEK` 모순은 0건, 모르는 값은 **필터 없음**으로 접음, `groupId`를 주면 APM 행 통째 제외 |
| 5-7 | 🔴 삭제 `ids`/`apmIds` 분리 | **PASS** | `{"apmIds":[2]}` → APM 2만 삭제, **HOST_GROUP 31 그대로**. 멱등(재요청 `deletedCount:0`), 없는 id 무시 |
| 5-8 | 리포트 관리 화면 | **PASS** | `종류` 컬럼(APM/호스트 그룹), APM 행의 `그룹` 칸 **공란**, `대상 수`가 `5 서비스` / `1 호스트`로 단위까지 갈림 |
| 5-9 | APM 리포트 상세 화면 | **PASS** | `?id=3` 딥링크, 각주 4줄(5분 판정·UTC 경계·재버킷·제외 서비스), `직전 기간 데이터가 없어 증감을 계산하지 않았습니다`, `해상도 조정됨` 배지, 서비스별 차트+표 |
| 5-10 | 배치 잡 수동 실행(주간·월간) | **PASS** | `POST /settings/schedulers/apm_report_{weekly,monthly}/run` → 로그 `APM 리포트 배치 완료 type=WEEK periods=2026-08-31=5 in 1344ms` · `type=MONTH periods=2026-08-01=0`. 🔴 `MAX_CATCHUP=3`은 **과거를 소급하는 것이 아니라** 직전 기간에서 **앞으로** 훑어 이미 닫힌 기간을 메운다(`ApmReportService.java:179-186`) — 오늘(월요일) 기준 열린 주가 하나뿐이라 1건이 정상 |
| 5-11 | 🔴 원복 | **PASS** | `apm_report_snapshot` 0행, 목록 총 31(HOST_GROUP만) |
| **6. AI 툴** (`:3101` 별도 인스턴스, dev 툴 EP 단독 호출) | | | |
| 6-1 | `apm_list_services` 숫자 = BE 숫자 | **PASS** | 절대창 `08:00Z~09:00Z`에서 9서비스 × 8지표 + instanceCount·status·versions **불일치 0**. `window:"6h"` 재검증도 불일치 0 |
| 6-2 | `apm_service_status` 숫자 = BE 숫자 | **PASS** | red 8지표 + `apdexT_seconds 0.5` + `slowThresholdMs 2000` + trend 3종(24칸 스파크) + instances 2 + alertRules 4 — 불일치 0 |
| 6-3 | `apm_collector_status`(admin) | **PASS** | collectors 3(UP1/STALE2)·tokens 6(active5/revoked1)·last60s(batches 23·stored 1111·dropped 367)·drops rowsTotal 86 = BE 86, byReason 6종·top20 **불일치 0** |
| 6-4 | 🔴 토큰 원문·해시 미노출 | **PASS** | 출력에 `tokenValue`/`hash`/`secret` 0건. BE DTO에도 없다 |
| 6-5 | 🔴 `drops`에 `to`를 안 붙인다 | **PASS** | 로그 실측 `/apm/ingest/drops?from=1788686029396` — `to` 없음(누적 카운터가 "최근 1시간"으로 접히는 것 방지) |
| 6-6 | 🔴 `null`이 0이 되지 않음 + 단위별 반올림 | **PASS** | `activeRequests 0.004353 → 0.0044` · `rps 0.004714 → 0.0047` · `apdex 0.9981 → 0.998`(1.0 아님) · 요청 0건 서비스는 전 지표 `null` |
| 6-7 | 🔴 시간 창 검증이 BE에 안 간다(§2) | **PASS** | 12케이스 중 8건을 입력 오류로 자름 → 마크 이후 BE 호출 **정확히 4건**(통과분과 일치). 날짜만·공백 구분 파싱도 정상 |
| 6-8 | 이름 해소(§0-4) | **PASS(부분)** | 1건·대소문자 무시·부분 일치 통과 / `"qa"`·`"svc"` → **후보 나열 + "어느 것인지 물어보세요"** / 0건·잘못된 uuid 안내. **정확>부분 우선순위는 데이터가 없어 미검증** |
| 6-9 | 403 안내 문구 view/edit 분기 | **PASS** | view 툴 → `apm.forbidden.view` · `apm_collector_status` → `apm.forbidden.edit`("APM \"편집\" 권한이…") |
| 6-10 | view-only에 **부분 결과 없음** | **PASS** | 첫 EP(`/apm/collectors`)에서 끊고 문자열 하나만 반환(collectors·tokens 전부 없음), BE 호출 1건에서 종료 |
| 6-11 | 정렬 순위 | **부분 PASS** | STALE 6(알파벳순) → UP 3. **DOWN·DEGRADED는 그 상태의 서비스가 없어 미검증** |
| 6-12 | `summary` ↔ `total` 모집단 | **FAIL** | status 필터 시 어긋난다(§AI A2) |
| 6-13 | 절단 안내 | **FAIL** | `limit=2`에서 `shown 2 / total 9`인데 절단 문구가 사라진다(§AI A1) |
| **7. 권한** | | | |
| 7-1 | ADMIN 기준선 | **PASS** | 27건 전부 200(비즈니스 4xx만) |
| 7-2 | USER `view=false, edit=false` | **PASS** | **27건 전부 200 + body `code:403`** |
| 7-3 | USER `view=true, edit=false` | **PASS** | 조회 **15건 200** / 쓰기 **8건 403**(SLO 3 · 합성 3 · bind/unbind 2) / **리포트 4건 403**(계약 §8.6 "apm.view만으로는 리포트를 볼 수 없다") |
| 7-4 | USER `view=true, edit=true` | **PASS** | APM 23건 200 · 리포트 4건은 여전히 403(관리자 축) |
| 7-5 | 🔴 원복 | **PASS** | `user` 행 diff 무차이(ADMIN·zabbix_role NULL) · `role` 0행 · Zabbix 역할 `QA-P3-PERM` 삭제 확인 |
| **8. P1/P2 회귀** | | | |
| 8-1 | 개요 · 서비스 · 트레이스 · 서비스 맵 | **PASS** | 전부 렌더(서비스 9행·트레이스 10행), 404 없음, APM 고유 콘솔 에러 0 |
| 8-2 | Live | **PASS** | `?live=1` — `연결됨`(SSE), 차트 4개(유입량·액티브·오류율), `지금 오류 나는 엔드포인트` 표 |
| 8-3 | 수집기 | **FAIL** | 렌더는 되나 **React 중복 키 에러**(§1 D5) |
| 8-4 | 서비스 상세 12탭 | **PASS** | `합성 감시`·`설정` 탭 신규 포함 12탭. 설정 탭의 SLO 카드·알람 규칙 표(`SLO 버짓 소진 1.5배/14.4배 · 이 서비스`) 정상 |
| 8-5 | 콘솔 에러 | **PASS(선재 제외)** | APM P3 화면 전부 **신규 에러 0**. 선재 4종만: React `key` spread · antd `message` static · `destroyInactiveTabPane` deprecated · `useForm not connected` |

**결함 총 23건** — 본체 9(MED 5 / LOW 3 / INFO 1) + 메시징·배치 6(MED 2 / LOW 2 / INFO 2) + AI 툴 8(MED 3 / LOW 4 / INFO 1).
**관찰 4건. 미검증 15건.**

---

## ✅ BE 반영 (2026-09-07, `moveseye-be-spring`)

**D1~D9 · M-1~M-6 전건 처리 완료** — 각 결함 항목 끝의 `→ 반영` 줄에 무엇을 어떻게 고쳤고
무엇을 일부러 안 고쳤는지 적었다. 계약은 `features/apm/core/contract_apm-p3.md`의 해당 절에 그 자리에서 반영했고,
한 장으로 훑는 목록은 **§9**(BE가 고친 것 / 🔴 FE가 해야 할 일 8가지 / 안 고친 것과 그 이유)다.
`features/apm/core/contract_apm.md` §7.7-5에는 D5의 rowKey 정정 박스를 넣었다.

| 갈래 | 항목 |
|---|---|
| **BE 코드 수정** | D1 · D2 · D3 · D4 · D6 · D7 · D9 · M-1 · M-2 · M-3 · M-4(V56) |
| **계약·주석만**(동작 유지가 옳다고 판단) | D5(서버는 이미 다 보낸다 — FE 몫) · D8 · M-5 · M-6 · 관찰 2·4 |
| **🔴 FE 작업이 남은 것** | D5(rowKey+시그널 컬럼) · D9(`isNew`) · M-1(문구 분기) · M-2(rowKey+`service`) · M-3(잘린 레인 배지) · D8(임계 입력 비활성화) · D4(각주) · 표본 JSON 동기화 → 계약 §9.2 |
| **AI 툴 결함 A1~A8** | 이번 범위 밖(`moveseye-ai` 레포) — 그대로 남는다 |

- 마이그레이션: **V56** 신설(`apm_job_run.service_id` FK → `ON DELETE SET NULL`). 기존 파일 무수정.
- 테스트: **2,969건 green**(직전 2,892 → **+77**). 신규 `ApmMissingParamMvcTest`·`ReportTimesTest`,
  기존 6개 클래스에 회귀 케이스 추가.
- ⚠️ **런타임 재검증은 안 했다** — 이 QA를 다시 돌려 D1~D9·M-1~M-4의 증상이 사라졌는지는 미확인이다.

---

## 1. 결함 목록

### 🔴 D1 [MED] 필수 쿼리 파라미터를 빠뜨리면 **HTTP 500**이 난다 — 계약 전역 규약 위반

- **현상** (세 EP에서 동일):
  ```
  GET /admin/reports/apm/detail?periodType=WEEK          → HTTP 500 {"statusCode":500,"message":"요청을 처리하지 못했습니다…"}
  GET /admin/reports/apm/detail?periodStart=2026-09-01    → HTTP 500 (같음)
  GET /apm/messaging/series?from=…&to=…  (destination 없음) → HTTP 500
  GET /apm/jobs/runs?from=…&to=…         (name 없음)        → HTTP 500
  ```
  계약은 각각 `APM_REPORT_PERIOD_INVALID`(400) · `APM_MESSAGING_DESTINATION_REQUIRED`(400)로 규정한다.
  **빈 문자열은 계약대로 400**이 나오므로 서비스 계층 가드는 정상이다 — Spring이 그 앞에서 던진다.
- **근본 원인**: `GlobalExceptionHandler.java`에 **`MissingServletRequestParameterException` 핸들러가 없다**.
  `MethodArgumentTypeMismatchException`(:195)·`BindException`(:206)·`HttpMessageNotReadableException`(:183)은
  다루면서 이것만 빠져 catch-all `handleUnknown`(:319)으로 떨어진다.
  ⚠️ `ApmReportController.java:110-116`의 `parsePeriodType`은 `raw == null`을 방어하고 주석에
  *"파싱 실패를 500으로 흘리지 않는다"*라고 적어 두었지만, `@RequestParam("periodType")`이
  `required=true`라 **그 null 가드는 도달하지 않는 죽은 코드**다.
- **왜 아픈가**: ① 응답 shape가 `{status,code,data}`가 아니라 `{statusCode,message}`라 FE `useDmoveQuery`가
  못 읽고 `errorCode`도 없어 분기 불가 ② `ERROR Unhandled exception` 스택트레이스가 로그에 쌓인다
  ③ 클라이언트 실수가 서버 장애로 계측된다.
- **재현**
  ```bash
  curl -s -b cookies.txt -H "x-visitor-id: qa-e2e" \
    "http://127.0.0.1:3001/admin/reports/apm/detail?periodType=WEEK" -w "\n%{http_code}\n"
  ```
- 전역 결함이라 P3 한정은 아니지만, **§4·§5·§8이 이 계약에서 `required` `@RequestParam`을 쓰는 첫 EP들**이다.
- **→ 반영(2026-09-07):** `GlobalExceptionHandler.handleMissingParam` 신설(200 + `code:400` + `INVALID_DATA`, 파라미터 이름을 메시지에 실음) **+** 세 EP의 파라미터를 `required=false`로 내려 **서비스 계층 가드가 계약 코드**(`APM_MESSAGING_DESTINATION_REQUIRED`·`APM_JOB_NOT_FOUND`·`APM_REPORT_PERIOD_INVALID`)를 내게 했다 — 전역 핸들러는 EP를 몰라 `INVALID_DATA`밖에 말할 수 없다. `ApmReportController`의 죽은 null 가드는 **되살아나** 실제로 그 코드를 낸다(`isBlank()`도 함께 본다). 테스트 `ApmMissingParamMvcTest`(5) + `GlobalExceptionHandlerTest`. 계약 §0·§4.1·§5.5·§8.7.

---

### 🔴 D2 [MED] `createdAt`이 **로컬 시각인데 `Z`를 달고** 나간다 — 목록이 9시간 미래를 보여 준다

- **현상**: 같은 리포트, 같은 응답 안에서 두 시각이 갈린다.
  ```
  GET /admin/reports/apm/3
    createdAt        = 2026-09-07T17:48:36.702Z     ← KST 시각에 Z를 붙였다
    body.generatedAt = 2026-09-07T08:48:36.702Z     ← 진짜 UTC (= 같은 순간)
  DB: apm_report_snapshot.created_at = 2026-09-07 17:48:36.702154  (서버 로컬 KST)
  ```
  FE는 `Z`를 믿고 +9를 해서 **리포트 관리 목록에 `2026-09-08 02:48:36`**(다음 날 새벽)으로 그린다.
  같은 리포트의 **상세 화면은 `계산 시각 2026-09-07 17:48:36`**(맞는 값) — 두 화면이 다른 시각을 말한다.
- **범위**: HOST_GROUP 행도 동일하다(`2026-09-07T03:00:34.683Z` ← 배치는 KST 03:00에 돌았고 목록엔 12:00으로 뜬다).
  즉 **선재 결함**이지만 계약 §8.3이 형식을 `"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"`로 못박아 APM 리포트가 그대로 물려받았다.
- **재현**: `./api.sh GET /admin/reports/apm/3` 의 `createdAt` ↔ `body.generatedAt` ↔ `./q.sh "select created_at from apm_report_snapshot"` 3자 비교.
- **판단 재료**: ① `createdAt`도 `generatedAt`처럼 UTC로 직렬화 ② 또는 `Z`를 떼고 "서버 로컬"임을 계약에 명시하고 FE가 로컬로 파싱. 어느 쪽이든 **두 계열을 함께** 고쳐야 한다.
- **→ 반영(2026-09-07):** ①을 택했다. `report/ReportTimes.toUtcIso` 신설, `ReportListItemDto.createdAt`·`ApmReportDetailDto.createdAt`을 `LocalDateTime`+`@JsonFormat` → **`String`**(같은 형식, 진짜 UTC)으로. 🔴 **두 계열을 함께** 고쳤다(한 목록에 섞여 나오므로). 🔴 전역으로는 안 고쳤다 — 이 패턴은 `BaseEntity` 포함 수십 곳의 NestJS 1:1 보존물이라 별도 과제다. 표본 JSON 3개 기대값 갱신. 테스트 `ReportTimesTest`(4, `generatedAt`과 같은 `Instant`인지까지 본다).

---

### 🔴 D3 [MED] SLO를 **끄면** Zabbix에 **열린 문제가 영구히 남는다** (삭제는 정상)

- **실측 순서**
  1. 번 알람이 켜진 SLO가 발화 → Zabbix 트리거 41593 `PROBLEM`, 우리 DB `apm_alert_event` id 7 열림.
  2. `PUT /apm/slos/{uid} {"enabled":false}` → 다음 평가 회차에서 그 SLO만 값 push가 **끊긴다**
     (다른 두 아이템은 18:10:39에 갱신, 이 아이템은 18:06:47에 멈춤). 고아 정리가 트리거를 **`status=1`(비활성)** 로 내린다.
  3. **우리 DB는 해소**된다 — `apm_alert_event.resolved_at = 18:10:39`.
  4. **그런데 Zabbix에는 열린 문제가 그대로 있다** — `problem.get` → `eventid 198864120 · APM SLO 소진 — moveseye-be / qa-p3 지연 7일 · 17:21:23`.
- **왜 영원한가**: 아이템에 마지막 양수(`2.731541`)가 남아 있고, 트리거가 비활성이라 **다시는 평가되지 않는다**.
  값이 더 들어오지도 않는다. 사람이 Zabbix에서 직접 닫지 않으면 이벤트/알림 화면에 계속 뜬다.
- **삭제 경로는 정상**: SLO를 지우면 아이템·트리거가 사라지고 문제도 함께 사라진다(실측 `problem.get` → `[]`).
- **계약과의 관계**: §1.5는 *"SLO를 끄면 5분 안에 조용해진다 — 고아 정리가 트리거를 내린다"*라고 적었다.
  **새 발화는 확실히 막힌다**(그 부분은 맞다). 다만 "조용해진다"가 **이미 울린 것까지 닫는다는 뜻은 아니었고**,
  실제로도 닫히지 않는다 — 그리고 우리 DB는 닫아서 **두 저장소가 어긋난다**.
- **판단 재료**: 트리거를 내리기 **전에** 해소 값(`0` 또는 `-1`)을 한 번 push하고 회복을 기다렸다가 내리면 양쪽이 맞는다.
- **재현**: SLO에 번 알람을 켜고 발화시킨 뒤 `enabled:false` → `./api.sh POST /settings/schedulers/apm_alert_evaluate/run` → `./zbx.sh problem.get '{"hostids":"10758","output":"extend"}'`
- **→ 반영(2026-09-07):** 판단 재료대로 **트리거를 내리기 전에 해소 값을 push**한다. 값은 `0`이 아니라 **`-1`**(`ApmAlertKind.VALUE_UNMEASURABLE`) — `0`은 "쟀고 정상"이라는 거짓 주장이고, 하필 장애 중에 대상에서 빠진 경우 Zabbix 최근 데이터에 "복구됨"으로 남아 사후 조사를 오도한다. 음수는 모든 kind의 트리거(`last(...)>N`, `N>=0`)를 거짓으로 만들면서 그래프에서 복구(0)와 눈으로 구분된다. 🔴 **두 경로 모두** 고쳤다 — `ApmAlertOrphanSweeper.sweep`(SLO 끄기가 타는 길)과 `ApmAlertService.applyEnabledState`(규칙 끄기, **같은 결함이 있었다**). 아이템 키의 uid 축은 새 `ApmAlertService.itemScopeUidOf`가 답한다(SLO_BURN만 uid가 SLO의 것이라 두 곳에 적으면 드리프트한다). 부수 효과: 되켤 때 **옛 장애 값으로 즉시 재발화하지 않는다**. 테스트 3건(`InOrder`로 push→비활성 순서·uid 미상시 건너뜀·이미 고아면 미반복). ⚠️ 미검증: 서버 설정 캐시와의 경합(같은 회차에 이어서 내려도 서버는 아직 켜진 트리거로 값을 본다고 보았다 — 놓쳐도 지금보다 나쁠 수 없다).

---

### 🔴 D4 [MED] 리포트 **전체 가용성이 서비스 단순 평균**이라 죽은 테스트 서비스 2개가 헤드라인을 56.63%로 끌어내린다

- **현상**: 주간 리포트 `totals.availabilityPct = 56.63`. 내역:

  | 서비스 | 요청 | 가용성 | 비고 |
  |---|---|---|---|
  | moveseye-be | 204,591 | 100.0 | |
  | qa-node | 13,907 | 83.13 | |
  | qa-python | 2,851 | 100.0 | |
  | qa-direct | **0** | **0.0** | 09-03 이후 조용 |
  | qa-oldsemconv | **0** | **0.0** | 09-02 이후 조용 |

  `(100 + 83.13 + 100 + 0 + 0) / 5 = 56.626` — **요청 가중이 아니라 산술 평균**이다
  (`ApmReportBuilder.java:542` `simpleAverage(availabilities)`).
- **왜 결함으로 보는가**: 계약 §8.5는 `totals.p95Ms`·`apdex`가 **요청 수 가중 평균**임을 명시해 두었는데
  `availabilityPct`의 규칙은 적지 않았다. 한 표에서 어떤 칸은 가중이고 어떤 칸은 아니면 읽는 사람이 알 길이 없다.
  게다가 화면(`APM 리포트` 상세 요약)이 그 숫자를 **`가용성 56.63 %`** 로 크게 띄운다 — 실제 트래픽의 99.9%가
  100% 가용이었던 주에.
- **부수 확인**(계약과 일치, 결함 아님): 요청 0건 서비스의 칸이 `UNKNOWN`이 아니라 **`STALE`** 로 판정된다
  (`ApmAvailabilityService` 실측: qa-direct 2016칸 전부 STALE). §8.5의 *"UNKNOWN은 분모에서 뺀다"* 안전장치는
  **수집기 자체가 조용할 때만** 작동하므로, 다른 서비스가 살아 있는 설치본에서 죽은 서비스는 언제나 0%로 센다.
- **재현**: `./api.sh GET "/admin/reports/apm/detail?periodType=WEEK&periodStart=2026-09-03"` 의 `body.totals.availabilityPct` ↔ `body.services[].availabilityPct`
- **→ 반영(2026-09-07):** `simpleAverage` → **요청 수 가중 평균**(`weightedAverageOf`, `p95`·`apdex`와 같은 규칙 — 요청 0건 서비스 제외). 비교 기간(`previousTotalsOf`)도 **같은 자**로 바꿨다(안 그러면 증감이 계산 방식 차이를 섞어 보여 준다). 🔴 조용히 빼지 않는다 — `notes.availabilityUnweightedServices`(신설)로 제외한 수를 함께 내보낸다. **서비스별 칸은 그대로 0%**다(거기서 0%는 사실이고 그래야 죽은 서비스를 발견한다). `errorRatePct`는 합계에서 직접 내므로(Σerrors/Σrequests) 이미 같은 축, `p95`·`apdex`는 원래 가중이었다. 테스트 2건. ⚠️ **2026-09-07 이전 스냅샷은 단순 평균 값이 굳어 있다**(그 본문에는 새 키도 없어 0으로 읽힌다) — 옛 리포트와 나란히 비교하지 말 것.

---

### 🔴 D5 [MED] 폐기 통계 표의 `rowKey`에 **`signal`이 빠져** 두 행이 같은 키를 갖고, 화면은 둘을 구분해 보여 주지 못한다

- **현상**: 수집기 화면에서 React 에러 — `Encountered two children with the same key, SIGNAL_NOT_SUPPORTED:`.
  표에는 이런 두 줄이 나란히 뜬다:
  ```
  미지원 신호(트레이스·로그)   —   87,502   방금
  미지원 신호(트레이스·로그)   —   18,396   5일 전
  ```
  사용자는 **무엇이 다른지 알 수 없다**.
- **실체**: DB는 축이 셋이다.
  ```
  reason               | signal | metric_name | sum
  SIGNAL_NOT_SUPPORTED | LOG    |             | 87,484
  SIGNAL_NOT_SUPPORTED | METRIC |             | 18,396
  ```
  BE는 `signal`을 **응답에 실어 준다**(`{"reason":"SIGNAL_NOT_SUPPORTED","metricName":null,"count":…,"signal":"LOG"}`).
- **근본 원인**(FE 두 곳):
  - `src/types/apm.ts:1087` `TApmDropRow`에 **`signal` 필드가 아예 없다** — BE가 준 축을 타입에서 버렸다.
  - `src/pages/application-monitoring/collectors/apmCollectorDisplay.ts:57-59`
    ```ts
    /** 표 rowKey — `(reason, metricName)`이 BE 자연키다(id가 응답에 없다). */
    export const apmDropRowKey = (row: TApmDropRow): string => `${row.reason}:${row.metricName ?? ""}`;
    ```
    주석의 전제가 틀렸다 — 자연키는 **`(reason, signal, metricName)`** 이다.
- **영향**: ① 콘솔 에러 ② 표에 `시그널` 컬럼이 없어 두 줄이 같은 줄로 보인다 ③ Ant Table의 선택·확장·가상 스크롤이
  rowKey에 의존하므로 중복 키에서 동작이 정의되지 않는다.
- **재현**: `./q.sh "select reason, coalesce(metric_name,'') mn, count(distinct signal) from apm_ingest_drop_stat group by 1,2 having count(distinct signal) > 1"` → 그 사유가 표에 두 줄로 보이는지 확인.
- **→ 반영(2026-09-07): 🔴 BE 수정 없음 — 서버는 세 축을 이미 다 실어 보낸다.** 계약에 rowKey 규약을 못 박았다: `features/apm/core/contract_apm.md` §7.7-5에 정정 박스(자연키 = `(reason, signal, metricName)`) + `ApmIngestDropsDto` 클래스/필드 javadoc. **FE 두 곳이 남았다** — `TApmDropRow`에 `signal` 추가 · `apmDropRowKey`에 signal 포함 · 🔴 **시그널 컬럼 노출**(키만 고치면 콘솔 에러는 사라지고 "같아 보이는 두 줄"은 남는다). 계약 §9.2-①.

---

### D6 [LOW] `String.formatted()` 연산자 우선순위 버그 — 사용자에게 **`%s`가 그대로** 나간다

- **현상**
  ```
  APM_SLO_INVALID_TARGET            "목표는 0보다 크고 100보다 작아야 한다(입력 %s). 100은 …"
  APM_ALERT_RULE_INVALID_THRESHOLD  "번 레이트 임계는 %s 이상이어야 한다(입력 %s) — 1배는 …"
  ```
- **원인**: `ApmSloService.java:645` · `:572` — `.formatted(...)`가 `+`로 이은 **마지막 문자열 리터럴에만** 붙는다.
  ```java
  // 645 — 잘못: formatted가 두 번째 리터럴에만 걸린다
  "목표는 0보다 크고 100보다 작아야 한다(입력 %s). 100은 오차 예산이 0이라 "
          + "버짓·번 레이트를 계산할 수 없다".formatted(target)
  // 577 — 올바른 예(같은 파일): 괄호로 전체를 묶었다
  ("목표 %s%%에서 가능한 최대 번 레이트는 %s다…" + "…").formatted(targetPct, max, threshold)
  ```
  `formatted`는 남는 인자를 조용히 버리므로 **컴파일·테스트가 잡지 못한다**.
- **재현**: `POST /apm/slos` 에 `"target":100` / `"burnAlertThreshold":0.5`
- **→ 반영(2026-09-07):** 두 곳 다 **문자열 전체를 괄호로 묶어** 고쳤다(`ApmSloService:645`·`:572`). 🔴 레포 전체를 정규식으로 훑어 같은 패턴이 **더 없음**을 확인했다(`"…%…" + "…".formatted(`). 테스트 `rejectionMessagesAreFullyFormatted` — `%s`가 없는 것만이 아니라 **인자가 실제로 박혔는지**(100·0.5)까지 본다.

---

### D7 [LOW] 리포트 EP의 403 본문에 **`errorCode`가 없고 메시지가 영어**다 — 계약 §8.7과 다르다

- **실측 대비**
  ```
  GET /admin/reports        (비관리자) → {"status":"error","code":403,"message":"Access Denied"}
  GET /apm/slos             (권한없음) → {"status":"error","code":403,"errorCode":"FORBIDDEN","message":"APM 화면을 볼 권한이 없습니다."}
  ```
- 계약 §8.7 표는 리포트 EP도 `FORBIDDEN`으로 적어 두었다. FE가 `errorCode === "FORBIDDEN"`으로 분기하면
  리포트 화면에서만 안 걸리고, 사용자에게는 한글 화면에 영어 문구가 뜬다.
- 선재(`AdminAccessChecker.requireAdmin` 공통)지만 **계약 문서와 실제가 어긋나 있는 것**이 이번 범위의 문제다.
- **→ 반영(2026-09-07):** `report/ReportAdminAccess.require` 신설 — 판정은 `AdminAccessChecker.isAdmin`으로 **똑같고**, 거부만 `ForbiddenError(한국어, ErrorCode.FORBIDDEN)`로 던진다. 적용은 **리포트 관리 6개 EP만**(목록·삭제·보존 조회/변경 + APM 단건/기간). 🔴 `AdminAccessChecker` 자체는 안 고쳤다 — 컨트롤러 40여 곳이 부르고 그 응답 문자열이 NestJS 1:1 보존 계약이라(CLAUDE.md §3 #1) 한 화면 때문에 전 관리 화면의 403을 바꾸지 않는다. `ForbiddenError`가 errorCode를 **선택**으로 받도록 이미 설계돼 있던 것(2026-09-02 P2 QA D11)이 그 근거다. 테스트 `ApmMissingParamMvcTest.reportForbiddenCarriesErrorCode`.

---

### D8 [LOW] `burnAlertEnabled:false`인데 `burnAlertThreshold`를 보내면 **조용히 버려진다**

- **현상**: `{"name":"th1", …, "burnAlertEnabled":false, "burnAlertThreshold":1}` → 200이고 응답 `burnAlert.threshold`는
  **기본값 14.4**. 그 뒤 목록·상세 어디에도 1은 남지 않는다.
- **원인**: 임계는 `apm_slo`가 아니라 `apm_alert_rule` 행에 산다(`apm_slo` 컬럼 12개에 번 관련 없음).
  알람을 끈 채 만들면 규칙 행이 없어 저장할 곳 자체가 없다.
- 계약 §1.2는 *"미지정이면 기존 값 유지, 없으면 14.4"*라고만 적어 **지정했는데 버려지는 경우**를 다루지 않는다.
  화면에서 "알람 끔 + 임계 미리 지정"을 허용하면 저장 후 값이 바뀌어 있다.
- **→ 반영(2026-09-07): 동작은 그대로 두고 계약에 명시했다**(400도, 저장도 아니다). 근거: ① FE는 알람을 끌 때 임계를 안 보낸다(계약 R-13) — 이 조합을 만드는 것은 손으로 API를 부르는 경우다 ② 값을 저장할 자리를 만들면 "꺼져 있는 알람의 임계"라는 두 번째 진실이 생겨 켤 때 어느 값을 쓸지가 또 갈린다 ③ 거절은 "알람은 나중에 켜고 임계만 미리"를 막는데 화면이 애초에 그 흐름을 허용하지 않는다. 계약 §1.2에 실측 예시와 함께 적었고 **FE 할 일**(스위치가 꺼지면 임계 입력도 비활성화)을 §9.2-⑥에 남겼다. ⚠️ 꺼진 채 범위 밖 값을 보내면 **여전히 400**이다(통과시키면 "이 값은 유효하다"는 신호가 되어 더 나쁘다).

---

### D9 [INFO] 합성 수정에서 `httpStepId`를 빼면 BE가 막지 않고 **이력이 조용히 끊긴다**(계약 경고를 실증)

- 계약 §3.3-1의 경고가 **사실임을 실험으로 확인**했다. 같은 본문에서 `httpStepId`만 제거해 PUT:
  ```
  before: 91977 web.test.time[…,단계 하나 RAW,resp]   after: 91983 (신규)
          91980 web.test.time[…,단계 둘 FORM,resp]           91986 (신규)
          … 단계 아이템 6개 전부 교체, Zabbix는 200
  ```
- 현재 FE는 규약을 지킨다(3-7 PASS). 다만 **파괴적인 동작을 클라이언트의 기억에만 의존**해 막고 있고,
  BE는 현재 단계를 알고 있으므로 이름으로 `httpStepId`를 되붙일 수 있다(판단 재료로만 남긴다).
- 참고: `apm_synthetic_binding.created_by`가 **빈 값**으로 저장된다(감사 컬럼으로 보이는데 채워지지 않는다).
- **→ 반영(2026-09-07): BE가 막는다.** `ApmSyntheticService.reconcileStepIds`(수정 경로, Zabbix 호출 **전**)가 셋으로 가른다 — ① id 있음 → 그대로 ② **id 없는데 이름이 같은 기존 단계가 있으면 그 id를 되붙인다**(QA가 실증한 파괴 시나리오가 정확히 이 모양이라 규약을 모르는 클라이언트도 구제된다) ③ 짝도 없고 `isNew:true`도 없으면 **400 `APM_SYNTHETIC_STEP_ID_REQUIRED`**(신설). 판정에 필요한 현재 단계 목록은 이미 하던 존재 확인(`fetchOne`)의 응답을 재사용해 **Zabbix 호출이 늘지 않는다**. 요청 DTO에 `isNew` 신설(🔴 `Boolean` 래퍼 — `boolean isNew`면 Jackson이 "is"를 떼어 JSON 키가 예약어 `new`가 된다). 테스트 5건. 🔴 **계약 변경이다** — 단계를 새로 추가하는 FE 경로가 `isNew:true`를 보내야 한다(§9.2-④). ⚠️ `created_by` 빈 값은 이번 범위 밖으로 남긴다.

---

## 2. 메시징 · 배치 전용 결함 (별도 에이전트 조사, OTLP 직접 주입)

> D1과 중복되는 항목(필수 파라미터 500)은 위로 합쳤다.

| # | 심각도 | 요지 | 근거 |
|---|---|---|---|
| M-1 | **MED** | `status` 필터가 0건이면 **"이 잡이 창에 없다"는 404**를 준다 | `?name=qa-hourly&status=ERROR` → `APM_JOB_NOT_FOUND "이 기간에 'qa-hourly' 실행 기록이 없습니다."` 인데 실행은 1건(성공) 있다. R-10에 따라 FE는 이걸 **"창을 넓혀 보라"**로 안내하는데, 넓혀도 영원히 안 나온다. `ApmJobQueryService.java:179-183` — 빈 결과 판정이 필터 **뒤**에 있다 |
| M-2 | **MED** | `/apm/jobs` 한 줄이 **서비스 여럿의 실행을 합치고** 서비스명은 "마지막 실행자"만 보여 준다 | `job.name=qa-nightly`를 두 서비스가 내자 한 줄 `{serviceName:"qa-other-svc", runs:4, failures:2, avgMs:54750}` — 4건 중 3건이 다른 서비스. `ApmJobQueryService.java:101` `group by job_name`, 서비스는 `rn=1` 행에서(:95,:106). 계약 §4.3-1이 **메시징에서는** 서비스를 축에 넣은 것과 반대이고 §5.2 타입엔 그 사실이 없다 |
| M-3 | LOW | 간트 절단이 **이름순 앞 잡이 예산을 다 먹는** 방식이라 레인이 통째로 사라진다 | `qa-bulk` 2,001건 주입 → `lanes:[qa-bulk]` 하나만, 나머지 4개 잡 전멸. 신호는 `truncated:true` 뿐. `ApmJobQueryService.java:218-223` `order by job_name, started_at limit 2000`. 메시징 목록은 `order by sum(count) desc`로 예측 가능한 절단 규칙을 일부러 뒀다 |
| M-4 | LOW | `apm_job_run.service_id` FK가 **`ON DELETE CASCADE`** 라 §5.2의 `serviceUid: string\|null` 경로가 없다 | 서비스를 지우면 90일 배치 이력이 함께 사라진다. `apm_messaging_5m`은 FK가 0개라 §4.2의 "지워진 서비스면 null, 집계는 남는다"가 진짜다 — **두 절이 같은 문장을 쓰는데 동작이 반대** |
| M-5 | INFO | `from >= to`를 조용히 `to − 1시간`으로 바꾼다 | `ApmTimeRange.of:62-64`. 응답이 실제 창을 반향하므로 FE가 감지는 가능 |
| M-6 | INFO | 구 semconv `messaging.destination` 폴백이 **죽은 분기**다 | `ApmSpanAttrAllowlist.java:206`이 적재 단계에서 이미 신 이름으로 개명하므로 롤업의 폴백은 실행되지 않는다(동작은 정상). `messaging.operation`(구 이름)은 개명되지 않아 폴백이 실제로 쓰인다 |

### → 반영 (2026-09-07)

| # | 무엇을 했나 |
|---|---|
| **M-1** | `ApmJobQueryService.runs`가 빈 결과를 404로 말하기 **전에** `existsInWindow`(필터 없는 `limit 1` 질의)로 한 번 더 확인한다. 잡이 있으면 **200 + 빈 목록**, 이름 자체가 창에 없을 때만 404. ⚠️ 추가 질의는 **필터가 걸려 있고 결과가 빈 경우에만** 돌고 인덱스(`job_name, started_at desc`)로 즉시 끝난다. 🔴 FE는 두 응답의 **안내 문구를 갈라야** 한다(404="창을 넓혀 보라" / 빈 배열="필터를 풀어 보라" — 계약 §5.5·§9.2-③). IT 1건 |
| **M-2** | 그룹 축을 `job_name` → **`(service_id, job_name)`** 으로. `row_number()` 파티션과 `group by`를 함께 바꿨고, 서비스는 "마지막 실행자"(`rn=1`)가 아니라 **그 줄의 것**이다. 🔴 같은 `jobName`이 여러 줄 나올 수 있어 **FE rowKey를 `(serviceUid, jobName)`으로** 바꿔야 한다. 드릴다운이 반쪽이 되지 않게 `/apm/jobs/runs`에 **`service` 파라미터(선택)를 신설**했다. IT 1건(4건 중 3건이 남의 실행이던 상황을 그대로 재현) |
| **M-3** | 절단을 **레인당 상한(최근 200개) → 전체 상한(2,000)** 2단으로. `lanes[].runs`·`failures`는 **절단 전 전체 수**(윈도 `count(*)`·`count(*) filter`)라 화면이 "50개 중 20개"를 말할 수 있고, `truncated`는 레인 하나라도 잘리면 참이다. ⚠️ **PG 문법 함정**: `count(*) filter (...)`를 괄호로 감싸면 `OVER`가 못 붙어 문법 오류다(실측으로 잡았다). IT 2건 |
| **M-4** | **계약이 아니라 동작을 고쳤다** — `V56`이 `apm_job_run.service_id`의 FK를 `CASCADE` → **`ON DELETE SET NULL`**(+ `NOT NULL` 해제). 근거: 배치 이력은 사건 기록이라 서비스를 지운 뒤에도 답이 있어야 하고, 다시 만들 수도 없다. 이로써 §4.2(메시징, FK 없음)와 §5.2(배치)가 **같은 문장에 같은 동작**이 된다. 조회·적재 코드는 무수정(`getLong`이 NULL에 0을 주고 `refs.get(0L)`이 null이라 이미 접혀 있었다). IT 2건(행이 남는지 + `confdeltype='n'`) |
| **M-5** | 동작 유지, `ApmTimeRange.of` 주석과 계약 §4.1에 명시 — 400을 주지 않는 이유(화면이 자동으로 붙이는 값이라 사용자가 못 고친다)와 **감지 경로**(응답의 `fromMs`/`toMs`가 실제 창을 반향하므로 축 라벨을 응답 값으로 그릴 것) |
| **M-6** | 주석 정정 — `DESTINATION_EXPR`의 구 이름 폴백은 **죽은 분기**(별칭이 적재에서 개명), `OPERATION_EXPR`의 것은 **살아 있다**(별칭 없음). 🔴 둘 다 **지우지 말 것**: 앞의 것은 별칭표가 이 표현식을 몰라 그 한 줄이 빠지면 증상이 "모든 큐가 익명 자리로 접히는 조용한 왜곡"이고, 뒤의 것은 지우면 이미 저장된 구 이름 행이 통째로 RECEIVE로 접힌다 |

---

## 2b. AI 툴 전용 결함 (`moveseye-ai` `ce2d026`, :3101 별도 인스턴스)

> **→ 반영(2026-09-07, 미커밋)**: A1(절단 안내 `notes[]` 누적 — slow·errors 동일 구조도 함께) · A2(`summaryScope:"all"`+`filter{status,matched}`+notes) · A3(BE 문구 한 번, 문장 앞) · A4(5툴 전부 창·sort·limit 검증 → 이름 해소 순) · A5(코드 무변경, 계약 §3.1에 "MCP 통로 전용·채팅은 관리자만" 명시) · A6(limit 클램프+notes, APM 목록 5툴) · A7(`dropsWindow` enum 15m/1h/24h/7d, 검증 동일 목록) · A8(`BigDecimal` 고정 소수, 하한 0.000001) · 기동 함정(`application-dev.yml` `${SERVER_PORT:${PORT:3100}}`). `ApmToolsTest` +4 → 131 green. 정본 `features/apm/core/contract_apm-p3-ai.md`.

> 세 툴의 **숫자는 BE와 전건 일치**한다(위 6-1~6-3). 아래는 그 위에 얹힌 표현·게이팅 문제다.

### 🔴 A5 [MED · 설계] §3에 공들여 쓴 **403 안내 문구가 채팅·dev 통로로는 도달할 수 없다**

- `AuthPreflight.requireAdmin`(`AuthPreflight.java:67-77`)이 요구하는 집합(ADMIN ∪ SUPER_ADMIN)과
  BE `DmovePermissionChecker.isAdministrator`(`:101-103`)가 **APM 권한을 통째로 우회시키는 집합**이 **정확히 같다**.
  즉 **AI를 쓸 수 있는 사람은 APM 권한 검사를 반드시 통과**하고, 통과하지 못하는 사람은 툴을 **실행조차 못 한다**.
- **실측**: admin을 `role='USER'`로 낮추자 세 툴 모두 툴 실행 **전에** `AI_FORBIDDEN "관리자만 사용할 수 있습니다."`로
  끝났다(같은 계정으로 BE를 직접 부르면 403 `FORBIDDEN`이 나온다). 관리자 게이트가 없는 통로는 `mcp/McpAuthFilter`뿐이다.
- 결과: 계약 §3의 `apm.forbidden.view` / `apm.forbidden.edit` 문구는 **MCP 클라이언트에서만** 나온다.
  (문구 자체가 옳게 갈리는 것은 "토큰 클레임은 USER, DB row는 ADMIN"인 실제 경로 — 권한 변경 직후 기존 토큰 —
  로 우회해 확인했다: 6-9 PASS.)
- 판단 재료: ① 문구를 유지하되 계약에 "MCP 전용"이라고 적는다 ② 채팅 게이트를 `apm.view`로 낮춘다 ③ 지금 그대로 둔다.

### A1 [MED] `apm_list_services`가 **절단 안내를 덮어써 잃는다**

- `{"limit":2}` → `shown 2 / total 9`인데 `note`에는 null 규약 문구만 남고
  `tool.list.truncated`("전체 9건 중 2건만 표시…")가 사라진다. 모델이 9개를 다 봤다고 믿을 수 있다.
- `ApmListServicesTool.java:91-94` — `listEnvelope`가 넣은 `note`를 `out.setAll(envelope)` 직후
  `out.put("note", …)`가 덮어쓴다. **APM 8툴 중 이 툴만** 해당한다.

### A2 [MED] `status` 필터를 걸면 `summary`(전체)와 `total`(필터 후)이 **다른 모집단**이 된다

- `{"status":"UP"}` → `shown 3 / total 3` 인데 같은 응답의 `summary {total 9, stale 6}`.
  모델은 "UP이 3개인데 STALE이 6개"로 읽는다. `ApmListServicesTool.java:73-75`(summary는 BE 응답 원본)
  vs `:91`(`rows.size()`), 그리고 `note`에 설명이 없다.

### A3 [LOW] view 403 문구가 BE 메시지를 **한 문장 그대로 두 번** 말한다

- 실제 출력: `APM 화면을 볼 권한이 없습니다(APM 화면을 볼 권한이 없습니다.). 역할 편집 > …`
- `messages.properties:177`의 접두문이 BE `ApmAccessChecker`의 `DENIED_MESSAGE`와 **글자까지 같다**.
  edit 쪽(`:178`)은 문구가 달라 문제없다.

### A4 [LOW] 이름 해소가 **창 검증보다 먼저**라 잘못된 창에도 BE를 1콜 부른다

- `ApmServiceStatusTool.java:52`(resolveServiceUid) → `:53`(`ApmTimeWindow.of`).
  창 오류 4케이스 전부 `/apm/services/overview?…&q=…`를 1콜씩 냈다(상세 EP는 안 간다 — §2의 핵심은 지켜짐).
  두 줄 순서만 바꾸면 사라진다.

### A6~A8 [LOW/INFO]

- **A6** `limit`이 1~50 밖이면 **클램프가 아니라 입력 오류**다(`limit:100` → 결과 대신 오류).
- **A7** `dropsWindow`가 스키마에 없는 값(`30m`·`2d`)도 조용히 받는다(`ApmTimeWindow.parseRelative` 그대로). 해롭지는 않다.
- **A8** 극소값이 지수 표기로 나간다(`activeRequests: 1.9E-5`) — 유효숫자는 살았지만 LLM이 `1.9`로 오독할 여지.

### ⚠️ 기동 함정 (제품 결함은 아니나 재현에 필요)

`application-dev.yml`이 `server.port: 3100`을 **하드코딩**한다(`${PORT:...}`가 아니다).
`PORT=3101`만 주면 3100으로 뜨려다 실패하므로 **`SERVER_PORT=3101`을 함께** 줘야 한다.

---

## 3. 관찰 (결함으로 올리지 않음)

> **→ 반영(2026-09-07):** 코드 한 줄로 닫히는 둘을 주석으로 고정했다 —
> **관찰 2**(롤업 배치 오인)는 `ApmMessagingRollupStep`·`ApmJobRollupStep` 클래스 javadoc에
> "이 스텝을 돌리는 배치는 `apm_rollup`이 **아니다** — `apm_trace_rollup`(워터마크
> `trace_rollup_watermark_5m`), 수동 실행은 `POST /settings/schedulers/apm_trace_rollup/run`",
> **관찰 4**(역할 연결 축)는 `DmovePermissionChecker.permissionsOf`에 "`user.zabbix_role`에는
> Zabbix `roleid`가 아니라 우리 `role` 테이블 id가 들어간다 — `refId`를 넣으면 권한이 빈 배열이
> 되어 'view=true인데 403'으로 보인다"를 달았다. 관찰 1·3은 코드가 아니다(샘플 앱의 계측 · 단일 세션 정책).


1. 🔴 **샘플 앱은 메시징·배치 스팬을 하나도 내지 않는다.** `apm_span` 202,871건 중 PRODUCER·CONSUMER **0**,
   `job.name` 보유 **0**. §4·§5는 **전부 손으로 만든 OTLP로만** 검증됐고, 실제 OTel 에이전트가 내는
   속성 이름·형태가 다를 가능성은 열려 있다(§7.2-2와 같은 성격의 위험).
2. **메시징·배치 집계는 `apm_rollup`이 아니라 `apm_trace_rollup`에서 돈다.** 지시문·문서가 `apm_rollup`을
   가리키면 아무리 돌려도 `apm_messaging_5m`/`apm_job_run`이 0행이라 "기능이 죽었다"로 오진하기 쉽다.
3. **같은 사용자의 다른 `x-visitor-id` 로그인이 기존 세션을 무효화한다.** 브라우저(`qa-p3-br`)를 열어 둔 채
   curl 세션(`qa-e2e`)으로 스윕을 돌리면 **전건 401**이 난다. 브라우저 탭을 `about:blank`로 보내면 즉시 정상.
   제품 의도(단일 세션)로 보이며 P3와 무관하지만, **QA 자동화에서 유령 실패를 만든다**.
4. **역할 연결 축**: `user.zabbix_role`에는 Zabbix roleid가 아니라 **`role` 테이블의 id**가 들어간다
   (`DmovePermissionChecker.permissionsOf` → `roleRepository.findById(user.getRefRole())`).
   `refId`를 넣으면 `my-profile.role`이 `null`이 되고 **권한이 전부 빈 배열**이 되어
   "view=true인데 403"으로 보인다(이번 QA에서 실제로 한 번 오진할 뻔했다).

---

## 4. 미검증 항목과 이유

| 항목 | 이유 |
|---|---|
| `apm_zbx_cleanup` 큐의 재시도 동작 | 동기 Zabbix 정리가 매번 성공해 큐에 행이 생기지 않았다. 설정의 URL을 깨서 강제 실패시키려 했으나 BE가 Zabbix 설정을 캐시해 즉시 반영되지 않았다. **누수 0**(아이템 수 = SLO 수)은 확인 |
| `mixedBounds: true` (SLO·시리즈·캘린더) | 히스토그램 경계가 갈린 데이터를 만들지 못했다. 필드는 전부 존재하고 `false`로 내려온다 |
| SLO 위젯 `limit` 클램프(1~50) | 잴 수 있는 서비스가 1개뿐이라 어떤 limit을 줘도 1행 — 클램프가 관측되지 않는다 |
| 합성 `monitoredBy = PROXY_GROUP` | dev Zabbix에 프록시 **그룹**이 없다. `SERVER`·`PROXY`만 실측 |
| 합성 `truncated: true` | 조회 상한에 닿을 만큼 긴 이력이 없다(내 시나리오는 41회 실행) |
| 리포트 `syntheticAvailabilityPct` · `syntheticUnavailable` | 합성 바인딩을 만든 시점이 리포트 기간(08-31~09-06) **뒤**라 전부 `null`/`0`. 기간 안에 바인딩된 시나리오를 만들려면 과거 이력이 필요 |
| 리포트 `previousTotals`·`totalsDelta`가 채워진 경우 | 직전 기간(08-24~08-30)에 APM 데이터가 없다(수집 시작이 08-31). 전부 `null` 경로만 확인 |
| 실 LLM 대화로 본 AI 툴 | dev 툴 EP 단독 호출만 했다(§2b) |
| AI 툴 정렬의 `DOWN`·`DEGRADED` 순위 | dev DB에 그 상태의 서비스가 없다(전부 UP/STALE) |
| AI 이름 해소의 **정확 일치 > 부분 일치** 우선순위 | "정확히 X이면서 다른 이름의 부분문자열"인 조합이 9개 서비스 중 없다. 데이터를 쓰지 않는다는 제약을 지켜 미검증 — 코드와 `ApmToolsTest`에만 보장이 있다 |
| AI `includeHidden`·`hidden`·`serviceName`·`owner`·`instrumented:false` | `state='HIDDEN'` 서비스 0건, 표시명≠서비스명 조합 0건. 파라미터 전달만 확인 |
| AI `unavailable[]`(부분 실패) · 402 라이선스 문구 | BE를 일부만 실패시키거나 라이선스 상태를 바꿔야 해 미시도 |
| 롤업 트랜잭션 롤백 결합(§7.2-7) | 예외 주입이 필요해 미실행 |

---

## 5. 환경 상태 (QA 종료 시점)

**건드리지 않음**
- Vite `:5173`(pid 38584) · AI `:3100`(pid 7948) · DB `dmove` — 전부 QA 종료 시점까지 살아 있다.
- 🔴 **`:3000`(pid 46172)은 QA 종료 시점에 내려가 있다.** 내가 종료한 프로세스는 **pid 26508 하나뿐**이고
  (이전 QA가 남긴 `:3001`의 `qa\perm\be.jar`), 그 `Stop-Process -Id 26508` 한 줄이 이 세션의 유일한 종료 명령이다.
  같은 시간대에 다른 세션이 BE를 `dcfc281`로 커밋하고 새 Gradle 데몬(pid 49988, 17:47 생성)을 띄운 것으로 보아
  **그쪽에서 재빌드하며 내린 것**으로 판단한다. 확인이 필요하면 그 세션에 물어볼 것.

**내가 띄운 것 (필요 없으면 종료해도 된다)**
- QA BE `:3001` — pid **42100**, 로그 `…\qa\p3\be3001.log`
- 헤드리스 Chrome CDP `:9224` — 프로필 `…\qa\p3\chromeprofile`
- AI 인스턴스 `:3101` — pid **2076**, 로그 `…\qa\p3\ai\ai3101.log`(BE는 :3001, DB는 `dmove_apm`을 본다)
- 기존에 돌던 Collector(pid 22576)·qa-node(42616)·qa-python(40752·38216)은 **그대로 유지**

**DB `dmove_apm` — 원복 확인**

| 테이블 | 상태 |
|---|---|
| `apm_slo` / `apm_slo_snapshot` | **0행** (QA용 SLO 3개 생성 후 전부 삭제) |
| `apm_synthetic_binding` | **0행** |
| `apm_report_snapshot` | **0행** (주간·월간 생성 후 `DELETE /admin/reports {apmIds}`로 제거) |
| `apm_alert_rule` | **2행** — 선재 전역 규칙(`ERROR_RATE`·`P95_LATENCY`)만 |
| `apm_zbx_cleanup` | 0행 |
| `role` | **0행**, `user`(admin) `role=ADMIN`·`zabbix_role=NULL` — 시작 시점과 `diff` 무차이 |
| 홈 위젯 | 12개, 시작 시점 레이아웃과 **완전 동일** |
| `setting`(ZABBIX) | url/username/password 원래 값 |

**DB에 남긴 것 (메시징·배치 검증 산물, 의도적)**
- `apm_service` 신규 4행: `qa-order-svc` · `qa-bill-svc` · `qa-batch-svc` · `qa-other-svc` (env `qa`)
- `apm_span` 55건(trace/span id 접두 `b0…`/`c0…`/`dd…`) — 7일 보존 배치가 지운다
- `apm_messaging_5m` 14행 · `apm_job_run` 7행
- 검증용 대량 INSERT(`qa-bulk` 2,001 + `qa-oldtrace` 1)는 **삭제 완료**
- `apm_setting.trace_rollup_watermark_5m`을 재처리 목적으로 3회 과거로 되돌렸다가 자연 위치로 복귀

**실 Zabbix (`dmove.co.kr`) — 원복 확인**

| 대상 | 상태 |
|---|---|
| 웹 시나리오 | **22개** (QA 시작 시점과 동일). `qa-apm-syn-*` **0건** |
| host `MovesEye APM`(10758)의 `web.test.*` 아이템 | **0개** |
| `apm.slo_burn[*]` 아이템 / `APM SLO 소진` 트리거 | **0개** |
| 열린 문제(host 10758) | **0건** |
| ⚠️ host 10758 아이템 수 | 32 → **38**. 늘어난 8개는 `apm.error_rate[…]`·`apm.p95_latency[…]` 각 4개로, **메시징·배치 검증용으로 주입된 서비스 4개**(`qa-order-svc`·`qa-bill-svc`·`qa-batch-svc`·`qa-other-svc`)에 대해 **전역 알람 규칙이 정상 동작하며 스스로 만든 것**이다(내가 만든 객체가 아니다). 그 서비스들을 `apm_service`에서 지우면 함께 정리된다 |
| Zabbix 역할 `QA-P3-PERM`(권한 QA) · `QA-APM-AI-P3`(AI QA, roleid 8) | 둘 다 삭제 완료 (`role.get` 와일드카드 재조회 `[]`) |

---

## 6. 🔴 이번 QA에서 가장 중요한 발견 셋

1. **SLO 번 알람이 실 Zabbix까지 끝까지 동작한다 — 세 값 규약을 한 회차에서 동시에 봤다.**
   같은 push 시각(17:22:07)에 `2.553485`(위반, FAST 줄의 1h 값과 소수 6자리 일치) · `0`(쟀고 정상) ·
   `-1`(측정 불가)이 각각의 아이템에 들어갔고, 트리거는 양수에서만 PROBLEM이 됐다. V53이 도입한 `-1`이
   *"수집이 끊겼는데 계속 타는 중으로 보이는"* 문제를 실제로 막는다는 것을 관측으로 확인했다.
   **다만 SLO를 끌 때 이미 열린 Zabbix 문제를 닫지 않는다(D3)** — 우리 DB만 닫혀 두 저장소가 어긋난다.

2. **합성 감시의 가장 무서운 두 시나리오가 둘 다 안전하다 — 그리고 안전한 이유가 서로 다르다.**
   ① 쉼표가 든 한글 시나리오 이름 때문에 Zabbix가 아이템 키를 따옴표로 감쌌는데도 BE가 값을 읽어 낸다
   (R-8이 걱정한 "빈 차트"가 아니다). ② `httpStepId` round-trip은 **화면 Drawer 저장 경로에서** 아이템 id가
   그대로임을 확인해 R-7을 닫았다. 반면 **BE는 `httpStepId`가 빠져도 막지 않는다** — 같은 본문에서 그 필드만
   빼자 아이템 6개가 전부 새 id로 갈렸다(D9). 지금의 안전은 FE가 규약을 지켜 주는 덕분이지 서버가 보장하는 것이 아니다.

3. **"필수 값을 안 보내면 500"이 세 EP에서 같은 원인으로 재현된다(D1).**
   `GlobalExceptionHandler`에 `MissingServletRequestParameterException` 핸들러가 없어서인데,
   `ApmReportController`는 그 상황을 방어하려고 null 가드까지 써 놓고도 **`@RequestParam`이 앞에서 던져 가드가
   죽은 코드**가 됐다. 응답 shape가 전역 규약을 벗어나 FE가 읽지도 분기하지도 못하고, 클라이언트 실수가
   서버 장애로 로그에 쌓인다. P3가 이 계약에서 `required` 쿼리 파라미터를 처음 쓴 자리라 지금 드러났다.

---

# §7. 2회차 재검증 (2026-09-08)

- 일시: 2026-09-08 10:13 ~ 12:0x (KST)
- 대상 BE: 사본 **`:3001`** — `moveseye-be-spring` **`5547cd0`**(3차 코덱스 반영) 시점의 **워킹트리 그대로** `bootJar`(pid **46548**, dev, DB `dmove_apm`@5433). Flyway `Current version 55 → v56` 실측(`apm job run service set null`), `Started MoveseyeApplication in 128s`
- 대상 FE: Vite **`:5174`**(pid 45308, 1회차부터 계속 살아 있음) — `moveseyee_fe` **`fd87470`**. dev 서버라 소스는 현 HEAD를 그대로 읽는다
- AI: `moveseye-ai` **`8f0994f`** 재빌드 → **`:3101`**(pid **28724**, `SERVER_PORT=3101`·`BE_BASE_URL=http://localhost:3001`·dev 툴 EP)
- 판정 원칙은 1회차와 같다 — **API 응답 + DB 실측 + 실 Zabbix 실측 + DOM 어서션**. **스크린샷 0장**
- 🔴 사용자 자원 무접촉: `:5173`(pid 38584) · `:3100`(pid 7948) · DB `dmove` 건드리지 않음. **제품 소스 수정 0**
- 일회성 산출물: `%TEMP%\claude\C--solutions\73f0e76e-…\scratchpad\qa\p3r2\`

## ⚠️ 빌드 기준 고지 (지시대로 워킹트리 그대로)

`git stash` 없이 빌드했다. jar에는 **타 세션의 미커밋 15파일**이 들어 있다 —
`host/cpu`·`host/memory`·`host/network`(컨트롤러·서비스·요청 DTO·테스트)와
`common/response/IncrementalChartQuery`·`IncrementalLineChartResDto`. APM 패키지와 겹치지 않아
이 QA 판정에는 영향이 없다고 본다. FE 워킹트리에도 같은 성격의 미커밋 9파일(증분 차트 훅)이 있다.
**별도 worktree `moveseye-be-spring-p4`(코덱스 P4)는 열지도 건드리지도 않았다.**
`bootJar`는 **1회 만에 성공**(1m51s)했고 재시도는 필요 없었다.

---

## 7.0 요약표

| # | 항목 | 1차 | 2차 | 근거 |
|---|------|-----|-----|------|
| **D1** | 필수 파라미터 누락 → 200+400+계약 errorCode | FAIL(500) | **PASS** | `periodType`만/`periodStart`만/둘 다 없음 → 셋 다 `APM_REPORT_PERIOD_INVALID` · `destination` 없음 → `APM_MESSAGING_DESTINATION_REQUIRED` · `name` 없음 → `APM_JOB_NOT_FOUND`("잡 이름이 필요합니다."). 빈 문자열도 같은 코드. HTTP는 전부 200 |
| **D2** | 리포트 `createdAt`이 진짜 UTC | FAIL | **PASS** | 같은 응답에서 `createdAt 2026-09-08T01:25:38.637Z` ↔ `body.generatedAt 2026-09-08T01:25:38.637369500Z` — **같은 순간**(서버 로컬 10:25 KST). 목록 화면의 HOST_GROUP 행도 `2026-09-07 03:00:34`(배치가 실제로 돈 KST 03:00)로 표시 — 두 계열이 함께 맞았다 |
| **D3** | SLO 끄기 → Zabbix 열린 문제도 닫힌다 | FAIL | **PASS** | 아래 §7.1 전문 |
| **D3b** | 규칙 끄기(`applyEnabledState`) 같은 경로 | 미검증 | **PASS** | §7.1 |
| **D3c** | `apm_zbx_cleanup` RESOLVE 큐 생성→소멸 | 미검증 | **PASS** | §7.1 |
| **D3d** | 공유 아이템(전역+서비스 규칙) `event.acknowledge` | — | **판정 불가** | 🔴 **D10 때문에 그 상태를 만들 수 없다** — §7.2 |
| **D4** | 리포트 가용성 요청 가중 + `notes.availabilityUnweightedServices` | FAIL(56.63) | **PASS** | `totals.availabilityPct 98.94` — 손검증 `(204591×100 + 13907×83.13 + 2851×100)/221349 = 98.9394` 일치. `availabilityUnweightedServices: 2`(요청 0건 qa-direct·qa-oldsemconv). 서비스별 칸은 그대로 0% |
| **D5** | 폐기 통계 표 중복 키 에러 0 + 시그널 열 | FAIL | **PASS** | 수집기 화면 헤더에 **`신호`** 열 신설, `미지원 신호(트레이스·로그)`가 `로그 99,653` / `메트릭 18,396` 두 줄로 **구분되어** 보인다. React 중복 키 에러 **0** |
| **D6** | `formatted` 인자 실제 치환 | FAIL(`%s`) | **PASS** | `"목표는 … (입력 100.0)"` · `"번 레이트 임계는 1.0 이상이어야 한다(입력 0.5)"` · `"목표 99.9%에서 … 최대 … 1000.0다 … 임계 1000.0는"` |
| **D7** | 리포트 EP 403에 `errorCode`+한국어 | FAIL | **PASS** | **6개 EP 전부** `{"code":403,"errorCode":"FORBIDDEN","message":"리포트 관리 화면을 볼 권한이 없습니다."}` (목록·APM 단건·기간·retention GET/PUT·삭제). 대조군 `/settings/schedulers`는 종전대로 `"Access Denied"`(의도대로 안 건드림) |
| **D8** | 꺼진 알람의 임계는 조용히 버린다(계약 명시) | — | **PASS(동작 유지)** | `burnAlertEnabled:false, threshold:1` → 200이고 응답 `14.4`. 범위 밖 `0.5`는 **여전히 400** — 계약 §1.2 서술과 일치 |
| **D9** | 합성 수정 `isNew` 규약 | INFO | **PASS(3갈래 전부)** | ① 새 단계+`isNew` 없음+이름도 새것 → **400 `APM_SYNTHETIC_STEP_ID_REQUIRED`**(한국어 안내문) ② `isNew:true` → 200, 기존 단계 id 40·41 유지 + 아이템 6개 **그대로**, 신규 3개만 추가 ③ 기존 단계에서 `httpStepId`만 제거(이름 동일) → **되붙이기 성공, 아이템 id `diff` 무차이** |
| **M-1** | status 필터 0건 = 200+빈 목록 | FAIL(404) | **PASS** | `?name=qa-hourly&status=ERROR` → `200 · runs: []`. 이름 자체가 없으면 여전히 404 |
| **M-2** | `/apm/jobs` (service, job) 축 | FAIL | **PASS** | `qa-nightly`가 **두 줄**(qa-other-svc 1/1, qa-batch-svc 3/1) — 1차의 "한 줄 4/2, 서비스는 마지막 실행자"가 사라졌다. `service` 파라미터로 드릴다운이 3건/1건으로 정확히 갈린다 |
| **M-3** | 간트 절단이 레인마다 | FAIL | **PASS** | 250건 잡 주입 → `lanes` **5개 전부 생존**, `qa-r2-bulk` `runs 250 · failures 25 · bars 200`(=레인 상한), `truncated:true`. bars는 **최근** 200개(00:51~04:10, 주입은 00:01~04:10) |
| **M-4** | `apm_job_run.service_id` FK | FAIL(CASCADE) | **PASS** | `confdeltype='n'` · `ON DELETE SET NULL` · `is_nullable=YES`. **종단 실측**: 한 행을 NULL로 만들자 `/apm/jobs`에 `serviceUid:null` 줄이 따로 서고 `service=__none__`으로 그 1건만 열린다(살아 있는 서비스의 3건과 안 섞임) |
| **M-5·M-6** | 계약·주석만 | — | **해당 없음** | 코드 변경이 없어 재검증 대상 아님 |
| **3차 #1** | `previousTotals` 실집계 · `slos` null | 미검증 | **PASS** | §7.3 |
| **3차 #4** | `notes.sloPeriodLocal`·`syntheticPeriodLocal`·`dailyPeriodZone` | — | **PASS** | `"2026-08-31~2026-09-06"` ×2 + `"Asia/Seoul"`. 화면 각주까지 확인 |
| **3차 #5** | `slos[].definitionChanged` | — | **PASS** | §7.3 |
| **3차 #6** | catch-up 마지막 저장 기간 기준 | — | **PASS** | §7.3 |
| **3차 #7** | lazy 백필 동시 요청 500 없음 | — | **PASS** | 같은 기간 4요청 동시 → **전부 200, 같은 id 16**, 행 1개, `DataIntegrityViolation` 로그 0 |
| **AI** | `apm_list_services` `notes[]`·`summaryScope` | FAIL(A1·A2) | **PASS** | §7.4 |
| **AI** | `apm_slo_status`·`apm_synthetics`·`apm_jobs` 실호출 | — | **PASS** | §7.4 |
| **AI A6** | limit 클램프 | FAIL(입력 오류) | **PASS** | `100→50` · `0→1` · `-3→1`, 각각 `notes`에 사유 |
| **AI A7** | `dropsWindow` enum 거절 | FAIL(조용히 수용) | **PASS** | `15m/1h/24h/7d` 통과, `30m`·`2d` → `"dropsWindow must be one of [15m, 1h, 24h, 7d]"` |
| **FE** | SLO 상세 도움말 OR 문구 | — | **PASS** | §7.5 |
| **FE** | 리포트 본문 각주·배지 | — | **PASS** | §7.5 |
| **FE** | 수집기 폐기 표 시그널 열 | FAIL | **PASS** | 위 D5 |
| **FE** | 설치 가이드 출처 링크 카드 | — | **PASS** | §7.5 |
| **FE** | 합성 Drawer 단계 추가 저장 | — | **PASS** | §7.5 |
| **FE** | 배치 이력 status 필터 문구 분기 | — | **PASS** | §7.5 |
| **회귀** | P1/P2 11화면 + Live | PASS | **PASS** | §7.6 — **APM 고유 신규 콘솔 에러 0**, 네트워크 실패 0 |
| **회귀** | 홈 위젯 3종 | PASS | **PASS** | §7.6 |

**1차 결함 23건 중 재검증 대상 전건 통과.** 새 결함 **6건**(MED 1 · LOW 2 · INFO 3) — D10~D13 · A9 · A10.
**판정 불가 1건**(D3d, 원인은 D10).

---

## 7.1 D3 — SLO 끄기·규칙 끄기 양쪽 실측 (실 Zabbix)

**준비**: `LATENCY 7일 / target 99.9 / latencyThresholdMs 1`(=거의 전부 위반)로 SLO를 만들어
`burnAlertEnabled:true, threshold:1.5`를 붙였다. 생성 응답이 `sliPct 2.6787 · burn1h 969.49 ·
burnCondition FAST · status BREACH · zabbixSynced true`.

**① SLO 끄기 (`ApmAlertOrphanSweeper` 경로)**

| 시점 | 관측 |
|---|---|
| 평가 1회차 | 아이템 `apm.slo_burn[86d6b0e0-…]`(92032) = **969.653368**, 트리거 41619 `status=0 value=1` |
| | Zabbix **열린 문제 1건** `eventid 199112262` · 우리 DB `apm_alert_event id=8` 열림 |
| `PUT {"enabled":false}` + 평가 | 아이템 = **`-1`** · 트리거 **`status=1 value=0`** |
| | 🔴 **Zabbix 열린 문제 = 0** (1차에서는 영원히 남았다) |
| | `apm_alert_event id=8 resolved_at=10:29:00` · 바인딩 `orphaned_at` 기록 |
| 로그 | `해소 확인 대기 — 트리거 41619를 큐에 넣었다(사유=고아 정리)` → `cleanup(try=1 ok=1 left=0)` → EventSync `1 resolved` |
| `apm_zbx_cleanup` | 조회 시점에는 **0행** — 같은 회차에 생성되고 성공으로 소멸했다(로그가 그 생애를 보여 준다) |

**② 규칙 끄기 (`ApmAlertService.applyEnabledState` 경로)** — 되켠 뒤 다시 발화시키고 이번엔 **규칙**을 껐다.

| 시점 | 관측 |
|---|---|
| 되켜기 + 평가 | `orphan(new=0 back=2 gone=0 fail=0)` — 바인딩 2개 복귀, 트리거 41619 `status=0 value=1` 재발화, 아이템 973.474471 |
| `PUT /apm/alert-rules/{uid} {"enabled":false}` | 아이템 = **`-1`** · 트리거 `status=1 value=0` · **열린 문제 0** · `apm_alert_event id=11 resolved_at` 기록 |
| `apm_zbx_cleanup` | 🔴 **행이 실제로 남았다** — `id=3 · object_kind=RESOLVE · zbx_id=41619 · reason='규칙 비활성화' · attempts=0` |
| 다음 평가 | 큐 **0행**(SLO 삭제로 트리거가 사라져 `resolveOpenProblems`가 "할 일 없음=true") |
| 로그 | `APM 알람 규칙 비활성화 — … 열린 이벤트 1건 해소(사유 RULE_DISABLED)` → `해소 확인 대기 … (사유=규칙 비활성화)` → `트리거 상태 변경 ok=1 fail=0 skip=0` |

**③ 삭제·복귀 누수 0**: SLO 삭제 후 `apm.slo_burn` 아이템 0개 · `APM SLO 소진` 트리거 0개 ·
`apm_alert_rule` 2행(선재 전역) · `apm_alert_rule_binding` **18행**(시작과 동일).

---

## 7.2 🔴 D10 [MED] — 전역 규칙과 **같은 kind**의 서비스별 규칙은 Zabbix 트리거를 **영영 만들지 못한다**

D3d(공유 아이템에서 `-1` 금지 + `event.acknowledge`)를 검증하려고 계약 `features/apm/core/contract_apm.md:1005`
*"서비스별 규칙이 전역을 덮을 때도 아이템은 유지하고 전역 트리거만 내린다"* 그대로 상태를 만들었다.
그러자 **덮기 자체가 실패**했다.

**재현**

```bash
# 전역 P95_LATENCY 임계를 100으로 낮춰 moveseye-be(p95 ~480ms)를 발화시킨다 → 트리거 41520 PROBLEM
./api.sh PUT /apm/alert-rules/00000000-0000-4000-8000-0000000000a2 '{"threshold":100}'
# 같은 서비스에 같은 kind의 서비스별 규칙을 만든다(= 전역을 덮는 정상 흐름)
./api.sh POST /apm/alert-rules '{"kind":"P95_LATENCY","serviceUid":"9c74ec1c-…","threshold":100,"windowMin":5,"enabled":true}'
```

**실측**

```
bindings: {"total":1,"synced":0,"pendingCache":0,"drift":0,"missing":1,
           "error":"Trigger \"APM p95 응답시간 — moveseye-be\" already exists on \"MovesEye APM\"."}
평가 로그: rules=4 targets=18 values=3 fired=1 push(ok=2 …) provFail=1     ← 매 회차 실패
아이템 91841 apm.p95_latency[9c74ec1c-…] lastvalue = -1                    ← 값이 더는 안 들어온다
```

- **원인**: 트리거 **description은 `(kind.displayName, scope.label)`** 뿐이다
  (`ZabbixAlertBridge.java:448`·`:473` — `"%s — %s".formatted(kind.displayName(), scope.label())`).
  규칙 식별자는 **태그에만** 있고(`findTrigger`가 `rule_uid`+`service` 태그로 찾는다) 이름에는 없다.
  Zabbix는 **한 호스트에서 트리거 description이 유일**해야 하므로, 같은 (kind, 서비스)에 대한 두 번째
  트리거는 항상 거절된다.
- **왜 영구인가**: 덮인 전역 바인딩은 설계상 **지우지 않고 내려 둔다**(`status=1`).
  그러니 그 이름은 계속 점유돼 있고, 서비스별 규칙은 5분마다 같은 오류로 재시도만 한다.
- **피해**: ① 그 (서비스, kind)의 Zabbix 알림이 **통째로 멈춘다**. 우리 DB에서는 `fired=1`로 발화가
  기록되지만 Zabbix로는 나가지 않는다 ② 고아 정리가 아이템에 `-1`을 밀어 두므로 되돌리기 전까지
  **Zabbix 최근 데이터도 "측정 불가"**다(실측 `lastvalue=-1`이 규칙을 지울 때까지 유지) ③ 화면은
  `zabbixSynced:false` 배지로 알리기는 하지만 원인 문구가 Zabbix 원문 영어다.
- **파생 — 3차 검수 #2가 실질적으로 도달 불가**: `itemHasOtherActiveConsumer`
  (`ZabbixAlertBridge.java:838`)는 **같은 `zbx_itemid`를 가진 다른 바인딩**을 찾는다. 그런데
  아이템 키가 `(kind, serviceUid)`(`SLO_BURN`은 `sloUid`)라 **아이템을 공유하려면 같은 kind·같은
  서비스의 규칙이 둘 다 프로비저닝돼야 하고, 그것이 바로 여기서 막히는 상태**다. 이번 실측에서도
  서비스별 바인딩의 `zbx_itemid`가 NULL이라 가드가 `false`를 돌려주고 `-1`이 그대로 나갔다.
  즉 **D3d와 `event.acknowledge` 경로는 이 결함을 고치기 전에는 런타임에서 만들 수 없다**
  (단위 테스트 `ZabbixAlertBridgeTest`에는 보장이 있다).
- **판단 재료**: description에 규칙을 가르는 조각을 넣는다(예: 서비스별이면 `— {서비스} (서비스 규칙)`).
  🔴 다만 **기존 트리거 이름이 바뀌면** 그 이름으로 만든 Zabbix 액션·미디어 조건이 어긋날 수 있어
  전역 트리거는 그대로 두고 **서비스별 것만** 접미를 붙이는 편이 안전하다.
- **정리**: 실험 뒤 서비스별 규칙 삭제 + 전역 임계 2000 복원 + 평가 1회 → `back=2`, 아이템 483.0357
  정상 복귀, 열린 문제 0 확인.
- **→ 반영(2026-09-08): §7.7의 D10 항목에 전문.** 요약 — 서비스별 규칙에만 접미
  `(서비스 규칙 <rule_uid 앞 8자>)`, 전역 이름은 불변, 옛 이름은 프로비저닝이 한 번 옮긴다
  (마이그레이션 없음), 회귀 테스트 5건. 🔴 **런타임 재현은 안 했다** — 이번 범위에서 `:3000`·`:3001`과
  dev DB 접촉이 금지였다. 다음 QA 회차에서 이 재현 스크립트를 그대로 다시 돌려야 닫힌다.

---

## 7.3 리포트 3차 반영분 — `previousTotals` 실집계 · `definitionChanged` · catch-up

> ⚠️ 이 절의 세 항목은 **dev DB에 없던 상태를 만들어야** 볼 수 있어 데이터를 심었다.
> 심은 것과 지운 것은 §7.7에 전부 적었고, 종료 시점에 **전부 원복**했다.

**① `previousTotals` 실집계 (3차 #1)** — 수집이 08-31에 시작해 비교 기간(08-24~08-30)이 비어 있었다.
`apm_metric_5m`·`apm_metric_1h`의 09-01~09-02치를 **-7일 시프트해 복제**(파티션 2일치 신설)하고
비교 기간에 배포 2건을 넣었다.

```
totals   {services 5, requests 221349, errors 930, errorRatePct 0.4202, p95Ms 49.44,
          apdex 1.0, availabilityPct 98.94, deployments 5, alerts 6, slos 1, slosMet 1}
previous {services 5, requests  69821, errors 929, errorRatePct 1.3305, p95Ms 79.48,
          apdex 1.0, availabilityPct null, deployments 2, alerts 0, slos null, slosMet null}
delta    {requestsPct 217.02, requestsAbs 151528, errorRatePoint -0.9103, p95Pct -37.8,
          availabilityPoint null, apdexDelta 0.0, deploymentsAbs 3, alertsAbs 6}
```

- 🔴 **`slos`·`slosMet`이 `previousTotals`에서만 `null`** — 3차 #1 그대로.
- 🔴 **총계 증감 = 서비스별 증감의 합** 손검증 전건 일치:
  `deploymentsAbs 3 = 0+3+0` · `alertsAbs 6 = 1+4+1` · `requestsAbs 151528 = 151528+0+0`.
  (1차에서 지적된 "없는 기간을 0으로 위장해 합계만 어긋나던" 증상이 사라졌다.)
- 합계 정합: `previous.requests 69821 = 53063 + 13907 + 2851` (서비스별 이전 창의 합).
- ⚠️ `previousTotals.availabilityPct`는 `null`이었다 — 심은 데이터로는 가용성 판정이 서지 않았기
  때문이고(요청은 잡히나 수신 연속성 칸이 비었다) **제품 결함이 아니라 내 시드의 한계**다.
  따라서 `availabilityPoint` 증감 경로는 여전히 미검증이다.

**② `slos[].definitionChanged` (3차 #5)** — 한 주 안에 정의가 갈린 상태를 만들었다:
SLO 생성 → 스냅샷 배치(09-01~09-08 `def_version 1`, target 99.9) → **09-05·09-06 행 삭제** →
`PUT {"target":99.5}` → 스냅샷 배치 재실행 → 그 두 날이 `def_version 2 · target 99.5`로 재생성.

```
day        def_version target finalized
2026-09-01 1  99.9 t   2026-09-04 1  99.9 t
2026-09-02 1  99.9 t   2026-09-05 2  99.5 t   ← 같은 주 안에서 갈렸다
2026-09-03 1  99.9 t   2026-09-06 2  99.5 t
```

리포트(WEEK 08-31~09-06):
`{"name":"qa-r2 정의변경","target":99.5,"sliPct":99.9948,"met":true,"budgetBurnedPct":1.04,"days":6,"definitionChanged":true}`
그리고 `totals.slos 1 / slosMet 1`. **화면에도 `기간 중 정의 변경` 배지가 뜬다**(§7.5).

**③ catch-up (3차 #6)** — 세 경우를 각각 확인했다.

| 저장 상태 | 결과 | 판정 |
|---|---|---|
| 마지막 저장 = **2026-08-31**(=방금 닫힌 주) | `periods=2026-08-31=5` 한 건, 행 수 그대로(upsert) | 문서대로 "빠진 기간이 없으면 방금 닫힌 기간을 다시 굳힌다" |
| **비어 있음** | `periods=2026-08-31=5` | 400일 소급하지 않는다(조회 백필의 몫) |
| 마지막 저장 = **2026-08-10**(손으로 심음) | 🔴 `periods=2026-08-17=0 2026-08-24=0 2026-08-31=5` — **오래된 것부터 3개**(`MAX_CATCHUP`) | **1차에서 지적한 "직전 한 주만 만들고 그 사이는 영영 빈다"가 해소됐다** |
| 월간 | `type=MONTH periods=2026-08-01=0` | 종전과 동일 |

**④ lazy 백필 동시성 (3차 #7)** — 스냅샷을 지우고 같은 기간을 **4요청 동시** 발사:
전부 `200`, 전부 **같은 `id 16`**, 테이블 1행, BE 로그에 `DataIntegrityViolation`·`Unhandled` 0건.

---

## 7.4 AI 툴 (`:3101`, `moveseye-ai` `8f0994f`)

**A1 절단 안내 보존 · A2 `summaryScope`/`filter` (둘 다 1차 FAIL → PASS)**

| 입력 | `shown/total` | `summaryScope` | `filter` | `notes[]` |
|---|---|---|---|---|
| (기본) | 9 / 9 | `all` | null | null |
| `limit:2` | 2 / 9 | `all` | null | `["전체 9건 중 2건만 표시. …"]` ← **덮어쓰기 사라짐** |
| `status:"UP"` | 3 / 3 | `all` | `{"status":"UP","matched":3}` | `["status=UP filter applied: items/shown/total count only UP services (3 of 9); summary counts every service in the window regardless of status."]` |
| `status:"UP", limit:1` | 1 / 3 | `all` | 〃 | **두 안내가 함께** 실린다 |
| `limit:100` | 9 / 9 | `all` | null | `["limit 100 is outside 1-50; used 50."]` |
| `limit:0` / `-3` | 1 / 9 | `all` | null | `["limit 0 is outside 1-50; used 1.", "전체 9건 중 1건만 표시. …"]` |

**A7** `dropsWindow`: `15m·1h·24h·7d`·미지정 통과 / `30m`·`2d` → `입력 오류: dropsWindow must be one of [15m, 1h, 24h, 7d]`.

**P3 신규 3툴 실호출 (각 1회)**

- `apm_slo_status` — `summary{total 2, ok 2, breach 0, burningNow 0, alertEnabledButNotSynced 0}` + `summaryScope:"all"`,
  항목마다 `burnRate{h1,m5,h6,m30}`·`burnAlert{fastThreshold,slowThreshold,maxThreshold,zabbixSynced}`·
  `windowFrom/To`·`measuredFrom/To`. 🔴 **BE `/apm/slos`와 숫자 대조 — 불일치 0**
  (`sliPct`·`budgetRemainingPct`·`errorBudgetTotal`·`good`·`requests`·`measured`·`mixedBounds`·
  `target`·`windowDays`·`status`·`burnCondition`·번 4개·알람 5필드). 반올림은 SLO 지표답게 **더 촘촘하다**
  (`sliPct` 99.98897714594926 → **99.989**, 2자리로 접었으면 99.99가 되어 99.9 목표 판정이 뒤집힌다).
  `maxThreshold`도 목표별로 정확(99.5→200 · 99.9→1000).
- `apm_synthetics` — `summary{total 22, failed 15, ok 7}` + 실 Zabbix 22개 시나리오. 실패 사유가
  `{code,title,hint,raw}` 4종 세트로 오고 `raw`에 Zabbix 원문(`response code "404" did not match …`).
  `monitoredBy` `SERVER`/`PROXY` 둘 다, `coveragePct 100`·`staleSeconds 7`.
- `apm_jobs` — **(service, job) 축 그대로**: `qa-nightly`가 `qa-other-svc`(1/1)와 `qa-batch-svc`(3/1)
  두 항목. `successRatePct 66.67`·`lastTraceId`까지 BE와 같다.

**A4 창 검증 선행** — `apm_synthetics`·`apm_jobs`는 `window:"99z"`·`"0m"`·`from:"not-a-date"`·
`limit:"abc"` 전부 **입력 오류로 자른다**(BE 0콜).

---

## 7.5 FE 화면 (헤드리스 Chrome CDP :9224, DOM 어서션)

| 화면 | 판정 | 근거(DOM 실측) |
|---|---|---|
| **SLO 상세 도움말 OR 문구** | **PASS** | 도움말 모달 본문: *"번 레이트 알람은 **두 줄 중 하나만 넘어도** 울립니다 — (1시간 > 임계 그리고 5분 > 임계) **또는** (6시간 > 임계÷2.4 그리고 30분 > 임계÷2.4)…"* · 옛 AND 문구(`1시간과 6시간이 각각의 임계를 모두 넘을 때만`) **잔존 0** |
| **리포트 본문 각주** | **PASS** | `전체 가용성은 요청 수로 가중한 평균입니다. … 서비스 2개는 합계에서 빠졌지만 아래 표에는 그대로 남아 …`(D4) · `SLO·합성 가용성은 로컬 일 단위로 집계합니다 — 실제 기간은 SLO 2026-08-31~2026-09-06, 합성 …(Asia/Seoul 날짜 기준)`(3차 #4) · 서비스 펼침 안에 `SLO 실제 기간 …(Asia/Seoul 날짜 기준) — 위 기간(UTC)과 뜻이 다릅니다.` · `기간이 끝난 뒤 처음 나타난 서비스 4개는 제외했습니다.` |
| **리포트 배지** | **PASS** | 서비스 행 펼침 → `달성 / qa-r2 정의변경 / 목표 99.5% / SLI 99.99 % / 예산 소진 1.04 % / 6일치 / **기간 중 정의 변경**` |
| **리포트 헤더 증감** | **PASS** | `가용성 98.94 % —`(증감 null이라 안 그린다) · `배포 5 ▲ 3` · `알람 6 ▲ 6` · `SLO 달성 1 / 1` |
| **리포트 관리 목록** | **PASS** | `종류` 열 APM/호스트 그룹 · APM 행의 `그룹` 칸 공란 · `대상 수` `5 서비스`/`1 호스트` · **생성 일시가 KST 실제 값**(D2) |
| **수집기 폐기 표** | **PASS** | 헤더 `사유 · **신호** · 메트릭 · 누적 건수 · 마지막 수신`, 두 `미지원 신호` 행이 `로그`/`메트릭`으로 갈린다. **중복 키 에러 0** |
| **설치 가이드 출처 링크** | **PASS** | 주의문마다 `근거 문서:` 카드 — testid `apm-doc-ref-otel-collector-tailsampling` 등 **21개**, 실제 `https://github.com/open-telemetry/…`·`https://opentelemetry.io/…`·`https://www.postgresql.org/…`로 연결 |
| **합성 Drawer 단계 추가** | **PASS** | 🔴 저장 시 실제 PUT 본문을 XHR 감청으로 포착: `steps[0] {"httpStepId":"43", …}` · `steps[1] {"isNew":true,"name":"단계 B 신규", …}` — **기존 단계는 id 유지, 새 단계만 `isNew`**(계약 §9.2-④). 저장 후 Zabbix 아이템: 단계 A의 3개 그대로 + 단계 B 3개 신규 |
| **배치 목록 (service, job) 축** | **PASS** | rowKey testid가 `apm-job-name-{serviceUid}:{jobName}` — `…c589fc00…:qa-nightly`와 `…0a7e6694…:qa-nightly`가 **따로**. 행 클릭 시 이력이 그 서비스의 3건만 |
| **배치 이력 status 필터 문구** | **PASS** | 성공 1건뿐인 잡에 `실패` 필터 → *"이 작업의 실행은 이 창에 있지만 지금 고른 상태 필터에는 하나도 걸리지 않습니다. **창을 넓혀도 나오지 않으니 필터를 풀어 보세요.**"* — M-1이 요구한 문구 분기 |
| **간트 레인 절단 배지** | **PASS** | 표 보기 전환 시 `qa-r2-bulk (실행 250회 중 실패 25회, **250개 중 200개 표시**)` — 다른 레인에는 그 문구가 없다. 카드 헤더에 `일부만 표시` |
| **콘솔 에러** | **PASS** | P3 화면 전부 **신규 0**. 선재 3종만(`key` spread · `useForm not connected` · antd `destroyInactiveTabPane`/`addonAfter` deprecated) |

---

## 7.6 회귀

**P1/P2 11화면 + Live** — 전부 렌더, 신규 콘솔 에러 0, `Network.loadingFailed` 0.

```
[개요] rows=0 canvas=1 echarts=1        [서비스] rows=9      [서비스 맵] ok
[트레이스] rows=10 echarts=1            [에러] rows=3        [DB] rows=10 echarts=1
[의존성] rows=2                          [합성 목록] rows=25  [알람 규칙] rows=2
[SLO 목록] rows=2                        [Live] rows=5 canvas=4 echarts=4
```

**홈 위젯 3종** — `apm_status`·`apm_slow_services`·`apm_alerts`를 추가해 실데이터 렌더 확인 후 **삭제·원복**.

- `APM 상태 요약` → `전체: 9 · 정상: 2 · 성능 저하: 1 · 중단: 0 · 수신 끊김: 6 · 확인 불가: 0`,
  testid `apm-status-widget-{total,up,degraded,down,stale,unknown}`
- `느린 서비스` → `moveseye-be 888 ms` + *"1위인데 정상일 수 있습니다"* 문구
- `APM 알람 · SLO 위험` → testid `apm-alerts-widget-12`·`apm-alerts-widget-9`
- `최근 60분 오류율 상위`는 *"오류율을 잴 수 있는 서비스가 없습니다(요청이 없으면 순위에 넣지 않습니다)"* —
  못 재는 것을 0으로 위장하지 않는다(1차 2-4와 동일)

⚠️ 회귀 중 **진짜 알람이 한 번 떴다**: 홈 위젯의 `현재 발생 알람`에 `APM p95 응답시간 — moveseye-be`
(11:22:44). 내 부하(동시 리포트 생성 등)로 moveseye-be p95가 **2345ms**로 튀어 전역 규칙(2000ms)이
정상 발화한 것이고, 표현식도 복원된 `{…}>2000`이었다. 값이 1730ms로 내려가자 **스스로 해소**
(Zabbix 열린 문제 0, `apm_alert_event.resolved_at` 기록). 제품 동작이 맞다.

---

## 7.7 새 결함 (D10~D13 · A9~A10)

### 🔴 D10 [MED] — §7.2 전문. 요약: 전역과 같은 kind의 서비스별 규칙은 트리거 이름 충돌로 **영구 미동기**

- **→ 반영(2026-09-08):** 트리거 이름을 **규칙 단위로 유일**하게 만들었다. `ZabbixAlertBridge.triggerDescription(rule, kind, scope)`가 이름을 조립하는 **유일한 곳**이 되고, 서비스별 규칙에만 접미 `(서비스 규칙 <rule_uid 앞 8자>)`가 붙는다. **전역 이름은 글자 하나 안 바꿨다** — 고객 액션·미디어 조건이 트리거 이름을 걸고 있을 수 있고, 돌고 있는 것의 이름을 바꾸면 "알람은 뜨는데 아무 연락이 없는" 최악의 고장이 된다. 서비스별 트리거는 이 결함 때문에 **애초에 만들어진 적이 없어** 잃을 것이 없다(위험이 한쪽에만 있다).
  - **표식만이 아니라 uid까지 넣은 이유**: 서비스별 규칙은 (kind, 서비스)당 하나라 표식 하나로도 유일하지만, `SLO_BURN`은 대상이 SLO이고 라벨이 `<서비스> / <SLO 이름>`이라 **SLO 이름이 겹치면 라벨도 겹친다**. 사람이 읽을 이름이므로 UUID 전체가 아니라 앞 8자만 쓴다.
  - **마이그레이션 불필요 — 근거**: 트리거를 **찾는** 축은 이름이 아니라 태그다(`findTrigger`의 `apm_uid`+`apm_service`). 옛 이름이 남아 있어도 기능은 멀쩡하고, 유일한 구멍은 "그 옛 이름이 전역이 쓸 이름을 점유"하는 것뿐이다. 그 구멍은 `alignLegacyDescription`이 닫는다 — **정확히 우리가 쓴 옛 이름일 때만** 새 형식으로 옮기고(사용자가 손수 고친 이름은 안 건드린다), 한 번 옮기면 그 뒤로는 아무 호출도 하지 않는다. 트리거 이름을 DB에 들고 있지도 않아 Flyway로 고칠 대상 자체가 없다.
  - **이름 갱신 경로**: `applyOurDefinition`(규칙 생성·수정·resync OURS·sync의 트리거 재생성)이 `description`을 우리 정의로 쓰므로 표시명이 바뀌면 그때 갱신된다 — 조립을 한 곳에서만 하므로 **자동으로 새 형식**이다. 드리프트 대조(`ApmAlertSyncService`)는 종전대로 **표현식만** 본다(이름은 사람이 고쳐도 되는 값이라 배지의 축이 아니다). 그 사실을 클래스 주석에 근거와 함께 적었다.
  - **회귀 테스트 5건**(`ZabbixAlertBridgeTest`): ① 전역+서비스 동일 kind 동시 프로비저닝 → `createTrigger` 2회, 이름이 서로 다르고 전역은 옛 이름 그대로 ② `triggerDescription` 단독(전역=접미 없음 / 서비스별=uid 8자) ③ 옛 이름은 **한 번만** 옮기고 두 번째 회차는 무호출(`updateTrigger`에 `triggerid`+`description`만 실린다 — 표현식·심각도는 배치 경로가 안 건드린다) ④ 사용자가 고친 이름은 무호출 ⑤ 이름 충돌 실패는 예외가 아니라 **바인딩 배지**로 남고 재시도에도 유지(`zabbixSynced:false`가 계속 서 있다).
  - ⚠️ **backoff는 넣지 않았다.** 영구 실패의 5분 재시도는 이 클래스의 기존 설계(실패는 배지로 남기고 다음 실행이 다시 시도)이며, 원인이 사라진 지금 별도 backoff를 넣으면 "고쳤는데 최대 N분 늦게 낫는" 새 지연이 생긴다. 노출은 `binding.error` + 상태 EP의 `missing`으로 종전대로 선다(테스트 ⑤).
  - **D3d 재확인**: `event.acknowledge` 경로의 단위 보장은 그대로다 — `sharedItemWithEnabledRuleIsDetected`(공유 아이템 참조 카운트) · `resolveRequestsCloseAndDefersCompletion`(트리거별 닫기 요청 후 완료를 미룬다) · `resolveSkipsForeignTrigger`(남의 트리거는 건드리지 않는다) 전건 통과. 🔴 **런타임 재현은 이번에도 안 했다**(:3000/:3001 금지 범위) — D10이 풀렸으니 다음 QA에서 그 상태를 실제로 만들 수 있다.

### D11 [LOW] `APM_REPORT_PERIOD_INVALID`의 `message`가 **에러 코드 이름 그대로** 나간다

```
GET /admin/reports/apm/detail?periodType=WEEK
→ {"status":"error","code":400,"errorCode":"APM_REPORT_PERIOD_INVALID","message":"APM_REPORT_PERIOD_INVALID"}
   (같은 배치의 다른 EP는 한국어다: "목적지(destination)가 필요합니다. 목록의 값을 그대로 보내 주세요.")
```

- 원인: `ApmReportController.java:140·145·152·157`이 `new ApiError(ErrorCode.…)`를 메시지 없이 던진다.
- FE에도 매핑이 없다(`grep APM_REPORT_PERIOD_INVALID src/` → 0건). 화면이 이 오류를 토스트로 띄우면
  **한글 화면에 대문자 상수**가 보인다.
- 실사용 도달성은 낮다(FE는 언제나 두 파라미터를 함께 보낸다) — 그래서 LOW다.
- **→ 반영(2026-09-08):** 네 자리 전부 한국어 메시지를 넘긴다(`ApmReportController.parsePeriodType`·`parsePeriodStart`). 🔴 원인은 **`ErrorCode`에 메시지 칸이 없다**는 것이다 — 이 레포의 `ErrorCode`는 코드 문자열만 들고 있고 `new ApiError(ErrorCode)`가 그 코드 이름을 그대로 `message`에 싣는다(같은 배치의 `APM_MESSAGING_DESTINATION_REQUIRED`는 처음부터 문구를 함께 넘기고 있었다 — 이 자리만 빠졌다). 그래서 "ErrorCode에 한글 메시지를 단다"가 아니라 **호출부가 문구를 넘기도록** 고쳤다(전자로 하면 40여 곳이 쓰는 공용 enum에 NestJS 1:1 보존 계약과 충돌하는 문자열이 생긴다).
  - 사유를 넷으로 가른다: 종류 누락 / 종류 오타 / 시작일 누락 / 시작일 형식. **받은 값을 되싣되 40자에서 자른다**(쿼리스트링은 길이 제한이 사실상 없어 그대로 실으면 에러 바디와 로그가 요청만큼 커진다).
  - `errorCode`는 그대로다 — FE가 분기하는 축은 그쪽이고 `message`는 사람이 읽는 칸이다. 기존 테스트 5건(`ApmMissingParamMvcTest`·`ApmReportSnapshotIT`)이 `errorCode`만 보고 있어 그대로 통과한다.

### D12 [LOW] 지워진 서비스 줄의 `serviceName`이 **빈 문자열**이라 표에 빈 칸이 남는다

```
GET /apm/jobs → {"jobName":"qa-nightly","serviceUid":null,"serviceName":"","runs":1,…}
```

- FE `ApmJobsSection.tsx:197-202`는 `serviceUid`가 없으면 `<Text>{value}</Text>` — 값이 `""`라 **빈 칸**.
- `__none__` 예약어를 둔 목적이 "지워진 서비스 줄을 1급 시민으로 다루는 것"인데, 정작 그 줄이
  **아무 라벨도 없어** 사용자는 왜 서비스명이 없는지 알 수 없다(`(삭제된 서비스)` 같은 표기가 필요하다).
- 계약 §5.2는 `serviceName: string`이라 타입 위반은 아니다 — 표기 규약이 비어 있다.
- **→ 반영(2026-09-08):** `ApmJobQueryService`의 두 자리(`list`의 Row · `runs`의 Run)에서 `ref == null ? "" : ref.label()` → `null`. **`serviceUid`와 축을 맞췄다** — 둘은 항상 함께 null이고, FE는 그 한 축만 보고 `(삭제된 서비스)`를 그리면 된다. 계약 §5.2 타입이 `string` → `string | null`로 **넓어졌고**(FE가 `string`으로 받고 있으면 타입 수정 필요), §5.6 예시와 M-4 절의 `""` 서술도 함께 고쳤다. FE 표기 규약(`serviceUid == null` → `(삭제된 서비스)`, 드릴다운은 `service=__none__`)을 계약에 명시했다.
  - ⚠️ **메시징(§4.3-1)의 `serviceName`은 그대로 `""`다.** QA가 지적한 화면이 잡이고, 같은 모양이라고 다른 EP의 응답까지 함께 바꾸면 그쪽 FE가 조용히 깨진다. 두 규약이 갈린 사실을 계약에 적었다.

### D13 [INFO] 배치 이력 각주가 **0건일 때도** 그대로 나온다

필터 결과가 0건인 화면에 `상태가 기록되지 않은 실행 **0건**이 있습니다 — 실패가 아니라 …`가 그대로 뜬다.
`ApmJobsSection.tsx:516-520`이 조건 없이 렌더한다. `실패` 필터에서는 UNSET이 나올 수 없으므로 특히 어색하다.

- **→ 반영(2026-09-08, BE 무수정):** 응답에는 **0을 그대로 둔다** — `0`과 "필드 없음"을 섞으면 *"셌고 없다"*와 *"못 셌다"*를 구분할 수 없게 된다. 숫자를 문장으로 바꾸는 것은 화면의 몫이라, 계약 §5.4에 **FE 규약**으로 못 박았다: 각주는 **`N > 0`일 때만** 렌더할 것, 같은 규칙을 0으로 나가는 다른 각주에도 적용할 것. 🔴 **FE 수정은 이 작업 범위 밖이다**(`ApmJobsSection.tsx`) — 계약만 갱신했다.

### A9 [INFO] AI `notes[]`가 **한국어와 영어를 섞는다**

같은 배열 안에서 `"전체 9건 중 2건만 표시. 더 좁히려면 search/필터를 쓰세요."`(한국어)와
`"status=UP filter applied: …"`·`"limit 100 is outside 1-50; used 50."`(영어)가 함께 나온다.
모델에게 가는 문자열이라 해롭지는 않으나, 사용자에게 그대로 인용될 여지가 있다.

### A10 [INFO] `apm_slo_status`는 시간 창 입력을 **조용히 무시**한다

`{"window":"99z"}`·`{"from":"not-a-date"}`·`{"window":"0m"}` 전부 정상 응답. 설계상 SLO는 자기
롤링 창을 쓰므로 스키마에 창 파라미터가 **없는** 것이 맞지만(클래스 주석에 명시), 같은 배치의
`apm_synthetics`·`apm_jobs`는 같은 입력을 거절한다. 모델이 *"지난주 SLO는?"* 을 물으며 창을 붙이면
**현재 값**이 아무 안내 없이 돌아간다 — `notes[]`에 "SLO는 자기 창을 쓴다" 한 줄이 있으면 닫힌다.

---

## 7.8 2회차 미검증 항목

| 항목 | 이유 |
|---|---|
| D3d — 공유 아이템에서 `-1` 금지 + `event.acknowledge(close)` | 🔴 **D10 때문에 그 상태를 만들 수 없었다**(§7.2). 아이템 공유는 "같은 kind·같은 서비스 규칙 둘 다 프로비저닝"이 유일한 경로이고 그것이 막혀 있었다. **→ 2026-09-08 D10 수정으로 막힘은 풀렸고 단위 보장은 재확인했지만**(§7.7 D10의 재확인 목록) **런타임 재현은 여전히 미실시** — 그 작업 범위에서 `:3000`·`:3001`·dev DB 접촉이 금지였다. **다음 회차의 첫 항목** |
| `previousTotals.availabilityPct` / `availabilityPoint` 증감 | 심은 비교 기간 데이터로는 가용성 판정 칸이 서지 않아 `null`만 확인 |
| 리포트 `syntheticAvailabilityPct`·`syntheticUnavailable` · 화면의 `합성 가용성 실제 기간` 각주 | 리포트 기간(08-31~09-06) 안에 바인딩된 합성 이력이 없다(1차와 같은 이유). 화면은 `연결된 합성 감시 없음`만 표시 |
| `mixedBounds: true` · 합성 `PROXY_GROUP` · 합성 `truncated` | 1차와 동일한 데이터 제약 |
| AI 실 LLM 대화 · `unavailable[]` 부분 실패 · 402 라이선스 문구 | dev 툴 EP 단독 호출만 |
| 권한 스윕 전체(§7 1차의 27건 × 4역할) | 이번 범위는 **D7만**이었다. `role='USER'` 강등으로 리포트 6 EP + 대조군만 확인하고 즉시 원복 |
| 간트 레인 라벨의 시각 배치 | 캔버스 렌더라 DOM으로 못 읽는다 — **표 보기 전환**으로 같은 정보를 텍스트로 확인했다(스크린샷 0장 원칙 유지) |

---

## 7.9 환경 상태 (2회차 종료 시점)

**건드리지 않음**

- Vite `:5173`(pid 38584) · AI `:3100`(pid 7948) · DB `dmove` — 살아 있고 무접촉.
- 🔴 **`:3000`(사용자 BE)은 이 세션 시작 시점에 이미 내려가 있었고**(1회차 문서 §5의 상태 그대로),
  내가 띄우지도 내리지도 않았다. 이 세션이 종료한 프로세스는 **pid 42100(1회차의 QA BE :3001)** 과
  **pid 2076(1회차의 QA AI :3101)** **둘뿐**이다.
- 코덱스 P4 worktree `C:\solutions\moveseye-be-spring-p4` — 열지 않았다.
- BE·FE 워킹트리의 타 세션 미커밋 파일 — **읽기만** 했고 `git stash`도 하지 않았다.

**내가 띄운 것 (필요 없으면 종료해도 된다)**

- QA BE `:3001` — pid **46548**, jar `…\qa\p3r2\be.jar`, 로그 `…\qa\p3r2\be3001.log`
- AI 인스턴스 `:3101` — pid **28724**, 로그 `…\qa\p3r2\ai\ai3101.log`
- 헤드리스 Chrome CDP `:9224`(pid 9488) — 1회차가 띄운 것을 그대로 재사용
- Collector(pid 22576)·샘플 앱은 손대지 않고 유지

**DB `dmove_apm` — 원복 확인**

| 테이블 | 시작 | 종료 | 비고 |
|---|---|---|---|
| `apm_slo` / `apm_slo_snapshot` | 0 / 0 | **0 / 0** | QA SLO 3개 생성 후 전부 삭제(검증 실패 케이스 4건은 애초에 생성되지 않았다) |
| `apm_report_snapshot` | 0 | **0** | 주간·월간·catch-up 산물 전부 삭제 |
| `apm_synthetic_binding` | 0 | **0** | |
| `apm_alert_rule` | 2 | **2** | 임계도 원값(ERROR_RATE 5.0 · P95_LATENCY **2000.0**) |
| `apm_alert_rule_binding` | 18 | **18** | 고아 표식 0 |
| `apm_zbx_cleanup` | 0 | **0** | RESOLVE 행이 생겼다가 정상 소멸 |
| `apm_job_run` | 7 | **7** | `qa-r2-bulk` 250행 삭제, `service_id` NULL 실험 복원 |
| `apm_deployment` | 6 | **6** | 시드 2행(`source='QA-SEED'`) 삭제 |
| `apm_metric_5m`·`_1h` (08-31 이전) | 0 | **0** | 시드 파티션 4개 `DROP TABLE`(`p20260825`·`p20260826` × 2) |
| `home_widget` | 12 | **12** | 좌표·크기·pinned까지 `diff` 무차이 |
| `user`(admin) | ADMIN | **ADMIN** | D7용 `role='USER'` 강등 2회 → 행 전체 `diff` 무차이 |
| `apm_alert_event` | 6 | **7** | ⚠️ 늘어난 1행은 **§7.6의 진짜 발화**(전역 P95 2000ms 초과, 해소 완료). 임계 100 실험이 만든 행은 삭제했다 |
| `apm_service` | 9 | **9** | |

**실 Zabbix (`dmove.co.kr`) — 원복 확인**

| 대상 | 상태 |
|---|---|
| 웹 시나리오 | **22개**(시작과 동일) · `qa-apm-syn-*` **0건** |
| host `MovesEye APM`(10758) 아이템 | **38개**(시작과 동일) · `web.test.*` **0** · `apm.slo_burn[*]` **0** |
| `APM SLO 소진` 트리거 | **0개** |
| 열린 문제(host 10758) | **0건** |
| 트리거 41520(전역 p95) | `status=0` · 표현식 `{…}>2000` 복원 · `value=0` |
| Zabbix 역할 | `User/Admin/Super admin/Guest/Dmove_Guest`만 — QA 역할 **0** |

---

## 7.10 🔴 2회차에서 가장 중요한 발견 셋

1. **1차 결함이 전부 실제로 닫혔다 — 특히 D3는 두 경로 모두.**
   SLO를 꺼도(`ApmAlertOrphanSweeper`), 규칙을 꺼도(`ApmAlertService.applyEnabledState`) 아이템에
   **`-1`이 먼저 들어가고** 트리거가 내려가며, **Zabbix의 열린 문제가 실제로 0이 된다**.
   1차에서 미검증으로 남았던 **`apm_zbx_cleanup` 큐도 이번엔 행이 실제로 생겼다가 소멸**했다
   (`RESOLVE · 41619 · 사유='규칙 비활성화'` → 다음 회차 `cleanup(try=1 ok=1 left=0)`).

2. **그런데 그 위에 얹힌 3차 검수 #2(공유 아이템 가드)는 런타임에서 도달할 수 없다 — D10 때문이다.**
   아이템을 공유하려면 "같은 kind·같은 서비스의 규칙 둘"이 필요한데, 그 조합은 **Zabbix 트리거
   description이 `(kind, 서비스)`뿐**이라 두 번째가 영원히 만들어지지 않는다
   (`Trigger "APM p95 응답시간 — moveseye-be" already exists`). 이건 가드 검증이 막히는 데서 끝나지
   않는다 — **계약이 정상 흐름이라 부르는 "서비스별 규칙으로 전역을 덮기"가 그 서비스의 Zabbix 알림을
   통째로 멈춘다**(우리 DB만 발화하고, 아이템은 `-1`로 굳는다). 이번 QA의 유일한 MED 신규 결함이다.

3. **catch-up과 `previousTotals`는 "없던 상태를 만들어야" 비로소 검증된다 — 그리고 만들어 보니 맞았다.**
   3차 검수가 고친 두 가지는 dev 데이터로는 전부 자명하게 통과하는 것처럼 보인다(리포트가 하나뿐이고
   비교 기간이 비어 있다). 마지막 저장 기간을 08-10으로 심자 `08-17 · 08-24 · 08-31` **셋을 오래된
   순으로** 메웠고(옛 코드라면 08-31 하나뿐), 비교 기간에 메트릭을 -7일 시프트해 넣자
   **총계 증감이 서비스별 증감의 합과 정확히 맞았다**(배포 3 = 0+3+0, 알람 6 = 1+4+1).
   반대로 그렇게 심어도 **가용성 증감 경로는 열리지 않았다** — 그건 아직 아무도 본 적이 없는 코드다.
