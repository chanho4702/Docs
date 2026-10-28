# APM 런타임(행위) 검증 — 2026-10-10

- 환경: BE :3000(Spring dev, DB 5433/dmove, Flyway v75 — 기동 로그 `Successfully applied 5 migrations … now at version v75`), FE Vite :5173, OTel Collector :4318(pid 5764, token=4로 BE에 송신 중).
- 대상 커밋: BE `b61d33e`·`3de55ec`·`1c094a1`·`fd4fcfb`·`9a35de1`·`ab78f4f` / FE `cbadb3e`·`707bf84`·`a1e258e`·`26795a4`·(GPU `1432ce3`·`c24ef50`).
- 방법: API는 Node fetch(쿠키 + `x-visitor-id`), 화면은 헤드리스 Chrome CDP(`_tools/headless-shot/cdp-shot.mjs`에 네트워크 응답 body `code` 수집을 붙인 사본)로 DOM 단언. 스크린샷은 SLO 캘린더 시각 판정 2장만.
- 계정: 임시 계정 2개를 DB에 만들어 쓰고 **삭제 완료**.
  - `qa_tmp_view`(id 141, 역할 19 "User role" — `apm.view=true, edit=false`)
  - `qa_tmp_edit`(id 142, 임시 역할 24 `QA_TMP_APM_EDIT` — 19 복제 + `apm.edit=true`)
  - 정리: `user` 141·142, `role` 24 삭제, 남은 `qa_tmp%`는 0건. admin 로그인은 하지 않음.
  - 두 계정 모두 **Zabbix 미연동 DMOVE 계정**이라 Zabbix 경유 EP(`/event/bells`, `/hosts/*`, `/gpu/devices`)는 200+`code:403 FORBIDDEN`이 나온다. ZM-157의 미연동 사용자 설계대로 동작한 것이며, 대상 기능의 결함은 아니다.
- 데이터 상황: `apm_alert_event` 16건이 **모두 닫힘**(열린 행 0건, 마지막 발화 2026-09-23). `apm_stuck_request`는 최근 0건. 트레이스·에러 그룹은 10-08까지 있음(env는 `local` 한 종류). SLO 7개는 전부 HIDDEN 서비스라 오늘 요청 0건.

## 요약

| # | 항목 | 판정 |
|---|---|---|
| 1 | 장애 및 에러 메뉴 | **통과**(세부 1건은 데이터가 없어 확인 불가, 🟡 관찰 1건) |
| 2 | 알람 원자성 1차(V74) | **통과** |
| 3 | env 필터·행 선택·수동 갱신·내보내기 env | **통과**(외부 호출 행 선택은 미실시) |
| 4 | 서버 trace 관측 시각 창 | **통과**(실제 OTLP 송신) |
| 5 | SLO·커버리지 보강 | 데이터가 없어 **확인 불가** + 🟡 **dev 전용 예외 1건 발견** |
| 6 | GPU 메뉴 | **통과**(렌더만, 데이터 경로는 미연동 계정이라 확인 불가) |

---

## 1. 장애 및 에러 메뉴 (BE `b61d33e`, FE `cbadb3e`)

| 검증 | 판정 | 근거 |
|---|---|---|
| 사이드바 위치 | 통과 | `.ant-menu-item` 순서 `… Trace Explorer → Incidents & Errors → Synthetic Monitoring …`, `<a href="/application-monitoring/incidents">Incidents & Errors</a>` |
| 탭 3개·기본 alerts | 통과 | `/application-monitoring/incidents` 진입 시 탭 `Alerts*`, `Stuck Requests`, `Error Analysis` |
| "열린 것만" 기본 켬 → `open=true` | 통과 | 스위치 `aria-checked=true`, 안내문(`apm-alert-events-open-hint`) 있음, 요청 `GET /apm/alert-events?from=…&to=…&open=true&limit=…&offset=0` → `code 200` |
| 끄면 URL `open=0`·요청에 open 없음·스트립 표시 | 통과 | 클릭 뒤 URL `?limit=10&open=0&offset=0`, 요청 `GET /apm/alert-events?from=…&to=…&limit=10&offset=0`(open 없음), `apm-alert-events-strip` 있음, 빈 문구 "No alerts fired in this window." |
| 다시 켬 | 통과 | URL `open=1`, 스위치 true, 스트립 없음(react-query 캐시라 재요청 없음) |
| `open=true`가 from/to를 무시 | **확인 불가** | DB에 열린 행이 0건(`select count(*) … where resolved_at is null` → 0)이라 "창 밖 열린 행"을 만들 수 없다. 대신 `open=true`는 창 유무와 무관하게 total=0, `open` 없이 30일 창은 total=16, 1시간 창은 0으로 일관됨 |
| `apm.view`만 가진 계정 → `/apm/alert-events` 200 | 통과 | `qa_tmp_view`: `GET /apm/alert-events?open=true…` → HTTP 200 `code 200`, `items/total/limit/offset` |
| 같은 계정 → `/apm/alert-rules` 403 | 통과 | HTTP 200 + `{"code":403,"errorCode":"FORBIDDEN","message":"APM 설정을 변경할 권한이 없습니다."}`. edit 계정은 `code 200`, 7건 |
| 비배수 offset API | 통과 | `offset=5&limit=20` → items 11(total 16): 임의 offset을 그대로 적용함 |
| 비배수 offset 딥링크 `?tab=alerts&open=0&offset=25&limit=20` | 통과 | URL이 `…&offset=20&limit=20`으로 바뀜, 요청은 `GET /apm/alert-events?…&limit=20&offset=20` 한 번 |
| 옛 주소 `/setting/apm/alert-rules?tab=events`(view 계정) | 통과 | → `/application-monitoring/incidents?tab=alerts…`, 알람 탭 활성, 권한 거부 화면 없음 |
| 옛 주소 `/application-monitoring/alert-rules?tab=stuck`(2단) | 통과 | → `/application-monitoring/incidents?tab=stuck…`, 요청 `GET /apm/stuck-requests?…` `code 200` |
| 옛 주소 `/application-monitoring/errors?x=1` | 통과 | → `/application-monitoring/incidents?tab=errors&x=1…`, `GET /apm/errors?…` `code 200` |
| 콘솔 알람 규칙 2탭 | 통과 | edit 계정 `/setting/apm/alert-rules` → 탭 `Rules*`, `Zabbix status`(2개) |
| 개요 "최근 알람" 링크 `open=0` | 통과 | `[data-testid=apm-overview-alerts-all]` href = `/application-monitoring/incidents?tab=alerts&open=0` |
| 홈 위젯 더보기 `open=0` | 통과(정적) | `ApmAlertsWidget.tsx:46 moreTo = apmAlertEventsPath()` → `routes.ts:246-250`가 항상 `open=0`을 붙임. 임시 계정 홈에는 APM 위젯이 없어 화면 확인은 못 함 |
| 요청 걸림 탭 렌더 | 통과 | 빈 문구 "No requests exceeded the threshold in this window.", `code 200` |

### 🟡 관찰 1-A — 첫 진입에서 `limit`이 10으로 바뀌고 요청이 두 번 나감
- 재현: `limit` 없이 `/application-monitoring/incidents`(또는 `?tab=stuck`)로 들어간다.
- 실제: `GET /apm/alert-events?…&limit=20&offset=0` 뒤에 곧바로 `…&limit=10&offset=0`이 한 번 더 나가고, URL은 `?offset=0&limit=10`이 된다. 걸림 탭도 같다(`stuck-requests` limit 20 → 10).
- 같은 원인으로, 옛 주소 리다이렉트에 `offset`만 있고 `limit`이 없으면 offset이 사라진다. 예: `/setting/apm/alert-rules?tab=stuck&serviceUid=abc&offset=40` → 요청 `limit=20&offset=40` 다음 `limit=10&offset=0`. 설계서 §2.1의 "쿼리 유지: offset"이 실제로는 1페이지로 돌아간다.
- 원인으로 보이는 곳: `src/components/Table/DmoveTable.tsx:144-163`. `hasQuery`일 때 `offset`과 `limit`이 **둘 다** 있어야 상태를 맞추고, 아니면 `onFilter({current:1,pageSize:10})`로 덮어쓴다. 그래서 탭의 `DEFAULT_PAGE_SIZE = 20`(`ApmAlertEventsTab.tsx:36`, `ApmAlertStuckTab.tsx:27`)은 첫 요청 한 번에만 쓰인다.
- 영향: 기능은 동작한다. 요청이 한 번 더 나가고, 기본 페이지 크기가 의도(20)와 다르며, offset만 담은 딥링크가 1페이지로 돌아간다. 공용 컴포넌트의 기존 동작이라 이번 커밋만의 회귀는 아니다.

## 2. 알람 원자성 1차 (BE `3de55ec`, V74)

| 검증 | 판정 | 근거 |
|---|---|---|
| 부분 UNIQUE 인덱스 | 통과 | `pg_indexes`: `apm_alert_event_open_uq … USING btree (rule_id, service_id) NULLS NOT DISTINCT WHERE (resolved_at IS NULL)`. V75 `apm_alert_event_fired_id_idx (fired_at DESC, id DESC)`도 있음 |
| 열린 이벤트 중복 0건 | 통과 | `select rule_id, service_id, count(*) from apm_alert_event where resolved_at is null group by 1,2 having count(*)>1` → 0행. 열린 행 자체가 0건 |
| STUCK 감시기 오류·`stalledForMs` 경고 | 통과 | `be-dev-3000.log`에 "요청 걸림 감시기가 …ms째 멈춰 있다"(`ApmAlertEvaluationService:300`) 로그 0건. `apm_alert_evaluate`는 22:39·22:44·22:49·22:54에 5분 주기로 정상 완료(`done in 2.7~9.0s, rules=7 targets=6`) |

## 3. env 필터·행 선택·수동 갱신 (BE `1c094a1`, FE `707bf84`)

| 검증 | 판정 | 근거 |
|---|---|---|
| BE env 모집단 | 통과 | `/apm/traces?env=local` total 34,988 / `env=prod` total 0. `/apm/errors?env=local` total 42 / `env=prod` 0 |
| 트레이스: env 변경 시 요청에 env가 실리고 서비스·offset이 리셋됨 | 통과 | 시작 `?preset=7d&trService=<uid>&offset=20&limit=10`, 툴바 env에서 `local` 선택 → URL `?preset=7d&limit=10&env=local&offset=0`(`trService` 제거), 요청 `GET /apm/traces?…&env=local&…&offset=0`, `GET /apm/services/overview?…&env=local` |
| 에러 탭(incidents): env 변경 시 리셋 | 통과 | 시작 `?tab=errors&preset=30d&errService=<uid>` → `local` 선택 → URL `…&env=local&offset=0`(`errService` 제거), 요청 `GET /apm/errors?…&env=local&sort=count…`(service 없음) |
| 수동 갱신(↻) | 통과 | `?env=local` 트레이스에서 `apm-toolbar-refresh-now`를 클릭하자 `GET /apm/services/overview?…&env=local`, `GET /apm/traces?…&env=local…`가 다시 나감 |
| 내보내기 계획 env 반영 | 통과(API) | `/apm/exports/error-groups/plan?…&env=local` → `"env":"local"`, `planToken:"v2.…"`, rows 42 / `env=prod` → rows 0 / `env=prod&service=<local 서비스>` → `code 400 APM_EXPORT_INVALID "선택한 서비스가 환경 'prod'에 속하지 않습니다."`. 화면에서는 내보내기 모달이 뜨는 것까지만 확인했고, 계획 요청 캡처는 타이밍 탓에 못 잡음 |
| 외부 호출 `(serviceUid,target)` 행 선택 | 미실시 | 시간 관계상 실행하지 않음 |

참고: 헤드리스 dev 환경에서 APM 화면은 첫 요청까지 20~40초가 걸렸다. API 자체는 200~900ms다. Vite dev 콜드 로드 때문으로 보며 결함으로 보지 않았다.

## 4. 서버 trace 관측 시각 창 (BE `fd4fcfb`)

| 검증 | 판정 | 근거 |
|---|---|---|
| 미래·과거 span 폐기와 사유 집계 | 통과 | Collector `:4318/v1/traces`로 OTLP JSON 1건을 보냄. 서비스 `qa-timewindow-probe`, span 2개(now+1일 / now−400일, status ERROR라 tail sampling을 통과). 응답 `200 {"partialSuccess":{}}`. BE 로그 22:51:18 `TraceIngestPipeline … 2개 … 시간창 밖 …(token=4, 사유=[TRACE_TIME_EXPIRED, TRACE_TIM…`, `ApmOtlpIngestDispatcher WARN … dropped=2`. `/apm/ingest/drops` → `TRACE_TIME_EXPIRED count 1`, `TRACE_TIME_FUTURE count 1`(signal TRACE). 검증 전에는 두 사유 모두 0행 |
| 서비스 등록·파티션 오염 없음 | 통과 | `select count(*) from apm_service where service_name like 'qa-%'` → 0 |
| 남은 흔적 | 참고 | 폐기 통계 2행(TRACE_TIME_EXPIRED·FUTURE 각 1건)이 dev DB에 누적 카운터로 남음. 지우지 않음 |

## 5. SLO·커버리지 보강 (BE `9a35de1`·`ab78f4f`, FE `a1e258e`·`26795a4`)

| 검증 | 판정 | 근거 |
|---|---|---|
| 캘린더 측정 불가 칸 별도 표시 | **확인 불가** | SLO 7개 전부 `calendar[].unknownReason`가 null이다. 측정 불가 날이 없어 화면 표시를 볼 수 없었다 |
| 오늘 칸 unknownReason | 확인 불가(데이터 없음) | 오늘 칸은 `{today:true, requests:0, unknownReason:null}`. 요청이 0건이라 NOT_MEASURABLE 경로를 타지 않는다 |
| 내보내기 경고 | 통과(부분) | error-groups 계획 `notes[0]` = "2026-10-10T11:50:00Z 이후 구간은 집계가 확정되지 않아 …", `incompleteFromMs` 있음 → FE `ApmExportModal.tsx:512`는 이를 warning으로 그린다(코드 확인). RED export의 `ROLLUP_INCOMPLETE`는 확인하지 않음 |
| SLO 상세 화면 렌더 | 통과 | `/application-monitoring/slo/{uid}`에 제목, `apm-slo-calendar`, 오늘 칸 테두리, 범례가 렌더됨(시각 확인 1장) |

### 🟡 발견 5-A — SLO 캘린더가 dev에서 매번 `Error: Heatmap must use with visualMap`을 던짐
- 재현: dev(Vite)에서 아무 SLO 상세(`/application-monitoring/slo/068dffa9-cbbe-4d8e-8e56-80a6d24bf3e2`)나 연다. CDP `Runtime.exceptionThrown` = `Error: Heatmap must use with visualMap at HeatmapView2.render`.
- 원인: `src/lib/echarts/apmSloCharts.ts`의 `buildApmSloCalendarOption`. `visualMap.seriesIndex: 0`(라인 167~)인데, `26795a4`에서 추가한 두 번째 `heatmap` series(측정 불가 칸, 라인 ~236)는 visualMap 대상이 아니다. ECharts 5.6 `HeatmapView.js:112-114`는 `NODE_ENV !== 'production'`일 때 visualMap이 없는 heatmap series를 만나면 throw한다. 측정 불가 칸이 0개여도 series가 있으므로 항상 던진다.
- 영향: production 빌드에서는 이 검사가 빠져 던지지 않는다. dev에서도 첫 series(값 칸)와 오늘 칸 테두리는 그려졌다(스크린샷). 다만 dev 콘솔이 매번 오염되고, 측정 불가 칸이 dev에서 그려지는지는 확인하지 못했다(데이터 없음). jest는 echarts 렌더를 거치지 않아 놓친 것으로 보인다.
- 수정 방향(참고): 두 번째 series를 `heatmap` 대신 `scatter`(symbol rect)나 `custom`으로 그리거나, 그 series 전용 `visualMap`(piecewise·고정 색, `show:false`)을 하나 더 둔다.

### 🟡 관찰 5-B — 데이터 없는 SLO에서 "창 전체가 롤업 지연"으로 표시됨
- `GET /apm/slos/47a8b074-…/series?from=D7&to=now` → `points:[]`, `incompleteFromMs` = 요청 from과 같은 값. 상세 화면은 "Measured window 2026.10.3 10:53:17 – 2026.10.3 10:53:17 · the last 10080 min is not in the budget yet (rollup lag)"로 표시한다.
- 대상 서비스(moveseye-ai 등)가 HIDDEN이고 최근 수신이 없는 경우다. "집계가 늦다"가 아니라 "데이터가 없다"인데 롤업 지연으로 안내된다. `ApmMetricCoverageReader`의 fail-closed 판정(커버리지 행 없음 → 미확정)이 그대로 문구로 나간 것으로 보인다. 의도된 것인지 BE 판단이 필요하다(`ApmSloService.series()` / FE `ApmSloDetailPage.tsx` measured-range 문구).

## 6. GPU 메뉴 (ZM-78)

| 검증 | 판정 | 근거 |
|---|---|---|
| 사이드바 노출 | 통과 | `.ant-menu-item`에 "GPU Monitoring" 있음(Database Monitoring 다음) |
| 목록 화면 렌더 | 통과 | `/gpu-monitoring`: 제목 "GPU Monitoring", 필터(Zabbix source, Host group, Host, Model, Data status), "Setup guide"·"Refresh" 버튼. React 예외 없음 |
| 데이터 경로 | 확인 불가 | `GET /gpu/devices?page=1&pageSize=25&sourceId=zabbix-default` → `code 403 FORBIDDEN`(임시 계정이 Zabbix 미연동). 화면에는 "You do not have permission to perform this action."이 나온다. 연동 계정이나 admin으로 다시 봐야 한다(admin 로그인은 사용자 세션을 끊어 하지 않음) |

## 공통 — 콘솔·서버 로그

- 모든 화면에서 반복된 것(대상 기능과 무관하게 앱 전역에서 나옴):
  - `A props object containing a "key" prop is being spread into JSX … {key, data-index, role, aria-selected, className, on…}`: 셀렉트·리스트 옵션 렌더 쪽 기존 경고로 보임
  - `[antd: message] Static function can not consume context`, React Router v7 future flag 경고
- 새 메뉴에서 나온 것: `[antd: Tabs] destroyInactiveTabPane is deprecated. Please use destroyOnHidden` — `ApmIncidentsPage.tsx`의 `<Tabs destroyInactiveTabPane>`(동작 영향 없음).
- 4xx/5xx: 대상 EP는 전부 HTTP 200 + `code 200`이었다. 예외는 의도한 거부(view 계정의 `/apm/alert-rules` 403)와 일부러 넣은 가짜 uid(`serviceUid=abc` → `code 400 APM_SERVICE_NOT_FOUND`, 화면 문구 "The requested item no longer exists…")뿐이다.
- BE 로그(범위 밖 참고):
  - `event_sync`가 `dmove.co.kr` Zabbix I/O 타임아웃으로 간헐 실패했다. 외부 네트워크 문제다.
  - 헤드리스 브라우저를 닫을 때마다(22:48:49, 22:51:00, 22:51:44, 22:53:49) `AccessDeniedException` + `Unable to handle the Spring Security Exception because the response is already committed` 스택이 찍혔다. 경로는 `AsyncContextImpl.setErrorState → StandardHostValve.custom → ApplicationDispatcher.include`로, 끊긴 SSE의 오류 페이지 include다. `SecurityConfig.java:89`에 `dispatcherTypeMatchers(ASYNC, ERROR).permitAll()`(09-29 `9b858be`)이 있는데도 재현된다. include 디스패치는 ERROR로 잡히지 않는 것으로 보인다. 기능 영향은 없고 로그 오염만 있다.

## 재현 도구(scratchpad, 일회성)
`C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\e05d80c9-f57f-4b0d-a549-a1c837b68a1b\scratchpad\` — `api.mjs`·`t.mjs`(API), `shot.mjs`(CDP + 네트워크 body code 수집), `gen.mjs`+`s1~s8.mjs`(화면 시나리오), `otlp.mjs`(span 2건 송신), 결과 `r1~r8.json`.
