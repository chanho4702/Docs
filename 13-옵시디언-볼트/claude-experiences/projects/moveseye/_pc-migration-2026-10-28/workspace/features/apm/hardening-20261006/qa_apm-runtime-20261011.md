# APM 런타임(행위) 재검증 — 2026-10-11 (밀린 항목)

- 환경: dev BE :3000(기동 중인 것 그대로, 재기동 없음), FE Vite :5173(master, `76e8c56` 포함 — 작업 트리의 `DmoveTable.tsx`에 `defaultPageSize` 반영 확인), DB 도커 5433/dmove.
- 방법: 직전 보고(`qa_apm-runtime-20261010.md`)와 같다. API는 Node fetch(쿠키 + `x-visitor-id`), 화면은 헤드리스 Chrome CDP(scratchpad `shot.mjs`)로 DOM 단언과 네트워크 요청을 수집했다. 스크린샷은 0장이다(SLO 캘린더는 canvas 픽셀 수로 판정).
- 계정: 임시 계정 `qa_tmp_view`(user id **143**, 역할 19 "User role", `apm.view=true`, Zabbix 미연동)를 DB에 만들어 썼다. admin 로그인은 하지 않았다.
- 정리(전부 완료): `home_widget` id 168 삭제, `user` 143 삭제, 임시 알람 `apm_alert_event` id 17 삭제. 확인 결과 `qa_tmp%` 0건, 열린 알람 0건, `max(id)`=16.

## 요약

| # | 항목 | 판정 |
|---|---|---|
| 1a | SLO 상세 — "Heatmap must use with visualMap" 예외 없음, 캘린더 렌더 | **통과** |
| 1b | 공용 표 — limit 없는 진입(알람·요청 걸림), 자산 목록 회귀 | **통과**(🟡 자산 목록 이중 요청은 기존 동작) |
| 2 | `/apm/alert-events?open=true`가 from/to를 무시 | **통과**(API·화면 모두, 배치 영향 없음) |
| 3 | 홈 APM 알람 위젯 "더보기" `open=0` | **통과**(화면) |
| 4 | 외부 호출 행 선택 `depSelService`와 env 변경 시 리셋 | **통과** |
| 5 | GPU 데이터 경로(Zabbix 연동 계정 `/gpu/devices`) | **확인 불가** |

---

## 1a. SLO 캘린더 예외 (FE `76e8c56`)

| 검증 | 판정 | 근거 |
|---|---|---|
| 콘솔 예외 없음 | 통과 | `/application-monitoring/slo/068dffa9-cbbe-4d8e-8e56-80a6d24bf3e2`를 열었을 때 CDP `Runtime.exceptionThrown`이 0건이었다. 콘솔 error는 앱 전역 경고(`key` prop spread, antd static message, Router future flag)뿐이고 `Heatmap must use with visualMap`은 나오지 않았다. 직전 QA에서는 이 화면을 열 때마다 예외가 났다 |
| 캘린더 렌더 | 통과 | `[data-testid=apm-slo-calendar] canvas` 1314×200, 칠해진 표본 픽셀 20,144개, 색 84종. 제목 "AI 서버 가용성 7일". 요청 `GET /apm/slos/{uid}`, `/series?...&step=60` 모두 `code 200` |

## 1b. 공용 표 limit 없는 진입 (FE `76e8c56`)

| 검증 | 판정 | 근거 |
|---|---|---|
| `/application-monitoring/incidents?tab=alerts&open=0` | 통과 | URL이 `?tab=alerts&open=0&offset=0&limit=20`로 채워졌다. `/apm/alert-events` 요청은 **1번**(`…&limit=20&offset=0`)만 나갔다. 직전에는 limit 20 다음에 10으로 한 번 더 나갔다 |
| `?tab=stuck&offset=40` | 통과 | URL이 `?tab=stuck&offset=40&limit=20`로 바뀌었고, 요청은 `GET /apm/stuck-requests?…&limit=20&offset=40` 1번이었다. 1페이지(offset 0)로 돌아가는 요청은 없었다 |
| 자산 목록 `/asset/list`(limit 없음) 회귀 | 통과 | URL `?offset=0&limit=10`, 행 10개, 활성 페이지 "1", 페이지 크기 "10 / page"로 예전과 같았다 |
| 자산 목록 `/asset/list?offset=20`(참고) | 통과(의도된 변화) | URL `?offset=20&limit=10`, 활성 페이지 "3". 예전에는 1페이지로 돌아갔다. 커밋 설명("offset만 있는 주소는 그 페이지 유지")과 같다 |

### 🟡 관찰 1b-A: 자산 목록은 여전히 첫 진입에 요청이 두 번 나간다(기존 동작, 이번 회귀 아님)
- 재현: `/asset/list`로 들어간다.
- 실제: `GET /assets?offset=0&limit=20…`과 `GET /assets?offset=0&limit=10…`이 둘 다 나간다. `?offset=20`으로 들어가도 limit 20과 limit 10이 한 번씩 나간다.
- 원인: `src/pages/asset/AssetListPage.tsx:83`은 URL에 limit이 없으면 `20`으로 조회한다. 그런데 `DmoveTable`에는 `defaultPageSize`를 넘기지 않아 기본값 10으로 URL을 채운다. 이번 커밋이 장애 및 에러 두 탭에서 고친 것과 같은 종류다. `76e8c56` 이전에도 같은 경로(`onFilter({pageSize:10})`)로 두 번 나갔으므로 회귀는 아니다.
- 영향: 화면은 10건·1페이지로 정상이다. 불필요한 조회가 1회 더 나갈 뿐이다. 다른 목록 화면에도 같은 불일치가 있는지는 보지 않았다.

## 2. `/apm/alert-events?open=true`가 from/to를 무시하는지

임시 열린 알람 1건을 만들어 검증한 뒤 지웠다.

- 대상: 규칙 2(`P95_LATENCY`, 전 서비스 축) × 서비스 2(`moveseye-ai`, HIDDEN, 마지막 수신 09-23). 값이 없는 대상이라 평가 배치가 열기·해소를 하지 않는 조합으로 골랐다. 열린 행이 0건이어서 V74 부분 UNIQUE와 충돌하지 않았다.
- 생성(01:11:58 KST, 직전 평가 배치 01:11:42 직후):
  ```sql
  insert into apm_alert_event(rule_id,service_id,fired_at,resolved_at,value)
  values (2,2,(now() at time zone 'UTC') - interval '30 days',null,2500)
  returning id;   -- id = 17, fired_at = 2026-09-10 16:11:58.736338
  ```
- 삭제(01:16:01 KST): `delete from apm_alert_event where id=17;` → `DELETE 1`. 삭제 직전 행 상태는 `resolved_at` NULL, `zbx_eventid` NULL로 생성 때와 같았다.
- 배치 영향: **없음**. 행이 있던 01:11:58~01:16:01 사이에 `apm_alert_evaluate`가 실행되지 않았다(직전 01:11:42, 다음은 약 01:16:45 예정). 행이 RECOVERED로 닫히지 않았고 Zabbix 이벤트 id도 붙지 않았다.

| 검증 | 판정 | 근거 |
|---|---|---|
| `open=true` + 어제~지금 창 → 행이 나옴 | 통과 | `GET /apm/alert-events?open=true&from=<now-1d>&to=<now>&limit=20&offset=0` → `code 200`, total 1, `{"eventId":17,"kind":"P95_LATENCY","serviceName":"moveseye-ai","firedAt":"2026-09-10T16:11:58.736338","resolvedAt":null,"value":2500,"open":true,…}` |
| `open` 없이 같은 창 → 안 나옴 | 통과 | `GET /apm/alert-events?from=<now-1d>&to=<now>…` → total 0, items 0 |
| 대조: `open` 없이 31일 창 | 통과 | total 17(기존 16 + 임시 1), id 17이 포함됐다 |
| 화면: 알람 탭 기본("열린 것만") | 통과 | `/application-monitoring/incidents` → 스위치 `aria-checked=true`, 요청 `GET /apm/alert-events?from=<1h 창>&to=…&open=true&limit=20&offset=0`. 행 1개: `Latency p95 · moveseye-ai · 2500ms · 2026-09-10 16:11:58 · Open · 30d` |
| 화면: 스위치 끔(`open=0`) | 통과 | URL `?limit=20&open=0&offset=0`, 요청 `GET /apm/alert-events?from=<1h 창>&to=…&limit=20&offset=0`(open 없음). 행 0개, 빈 문구 "No alerts fired in this window.", 스트립 표시 |

참고: 처음 실행할 때는 표가 그려지자마자(로딩 직후 4초) DOM을 읽어 "No alerts are open right now."가 잡혔다. 20초 기다린 재실행과 그 다음 실행에서는 행이 보였다. 판정은 재실행 결과로 했다. 로딩 중 빈 문구가 잠깐 보이는지(antd 표의 로딩 겹침 여부)는 따로 확인하지 않았다.

## 3. 홈 위젯 "더보기" `open=0`

| 검증 | 판정 | 근거 |
|---|---|---|
| 위젯 더보기 href | 통과 | 임시 계정 143의 홈에 `home_widget`(id 168, `apm_alerts`, `dashboard_key=home`)을 DB로 직접 넣었다(admin 로그인을 피하려고). `/home` 렌더 후 앵커 `<a href="/application-monitoring/incidents?tab=alerts&open=0">More</a>`가 1개 있었다. `GET /home/widgets` → `code 200`. 위젯 목록은 비어 있었다(창 안에 발화한 알람 없음) |
| admin 홈에 APM 알람 위젯 있음 | 참고(DB) | `home_widget` user 110(admin)에 `apm_alerts`(id 138, pos 0,81)이 있다. admin으로 로그인하지는 않았다 |

## 4. 외부 호출 행 선택 (순위 9~10, 계약 `features/apm/hardening-20261006/contract_apm-query-controls-20261006.md`)

| 검증 | 판정 | 근거 |
|---|---|---|
| 목록 | 통과 | `/application-monitoring/dependencies?preset=7d` → 행 10개(첫 행 `moveseye-be · dmove.co.kr · 31,973`), "Click a row to see that target's trend." 안내. 요청 `GET /apm/dependencies?from=…&to=…` `code 200` |
| 행 클릭 → URL `(depTarget, depSelService)` | 통과 | 2번째 행(`moveseye-be · 169.254.169.254`)을 클릭하자 URL이 `?preset=7d&depTarget=169.254.169.254&depSelService=7e90a7d5-70e1-4cde-a446-d518a8c16666`로 바뀌었다. throughput·latency 차트가 나타났고 no-selection 안내는 사라졌다 |
| series는 선택 행의 서비스 하나로 조회 | 통과 | `GET /apm/dependencies/series?from=…&to=…&service=7e90a7d5-…&target=169.254.169.254` `code 200`. 목록 필터(`depService`)가 없는데도 service가 실렸다(전 서비스 합산 아님) |
| env 변경 → 선택 리셋 | 통과 | 툴바 env에서 `local`을 고르자 URL이 `?preset=7d&env=local`로 바뀌었다(`depTarget`·`depSelService` 제거). 차트가 사라지고 no-selection 안내로 돌아갔다. 요청은 `GET /apm/dependencies?…&env=local`, `GET /apm/services/overview?…&env=local`. 약 25초 뒤 행 10개 |
| `env=local` 직접 진입 | 통과 | `?preset=7d&env=local` → 행 10개, 요청에 `env=local` |

🟡 관찰 4-A: env를 바꾼 직후(3초 시점)에는 행 0개에 "No external call was observed in this window."가 보였다. 25초 뒤에는 행 10개로 정상이었다. 첫 조회(dev 콜드)가 느린 동안 로딩 대신 빈 문구가 보였을 수 있다. 스피너가 함께 떴는지는 DOM으로 확인하지 않았다. 결함으로 판정하지 않았다.

## 5. GPU 데이터 경로

| 검증 | 판정 | 근거 |
|---|---|---|
| Zabbix 연동 계정의 `/gpu/devices` | **확인 불가** | 연동 계정은 `user.zabbix_userid`가 있어야 하는데 이 컬럼에 UNIQUE 제약(`user_zabbix_userid_key`)이 있다. 기존 Zabbix 사용자(2=guest)에 붙이려 하자 `duplicate key … (zabbix_userid)=(2)`로 거부됐다. 새로 연동하려면 원격 Zabbix(dmove.co.kr)에 사용자를 만들어야 하고, 로그인할 때마다 그 사용자의 API 토큰을 지우고 다시 발급한다(`AuthService.storeApiTokenToRedis`). 외부 시스템을 바꾸는 일이라 하지 않았다. 소유자를 모르는 Zabbix userid(예: Redis에만 남은 6)에 붙이는 것도 남의 토큰을 회전시킬 수 있어 하지 않았다. admin은 사용자 브라우저 세션을 끊으므로 쓰지 않았다 |
| 부수 효과 | 없음 | `qa_tmp_zbx` INSERT는 실패해 행이 생기지 않았다. 그 뒤의 로그인 시도는 `WRONG_USER_OR_PASSWORD`로 끝났다(계정 없음). Zabbix 호출은 일어나지 않았다 |

다음에 확인할 방법: 사용자가 admin 브라우저 세션을 잠시 비울 수 있을 때 admin(SUPER_ADMIN 토큰 경로)으로 `GET /gpu/devices?page=1&pageSize=25&sourceId=zabbix-default`를 호출한다. 또는 Zabbix 연동 실계정(예: chanho, zabbix_userid 3)의 사용자가 직접 화면을 연다.

## 공통 — 콘솔·로그
- 콘솔 error는 앱 전역의 기존 경고(`key` prop spread, antd static message, React Router future flag)와 장애 및 에러 화면의 `[antd: Tabs] destroyInactiveTabPane is deprecated`뿐이다. 예외(`exceptionThrown`)는 0건이다.
- `/event/bells`는 임시 계정이 Zabbix 미연동이라 `code 403`이다(ZM-157 설계대로, 직전 QA와 같음).

## 재현 도구(scratchpad, 일회성)
`C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\e05d80c9-f57f-4b0d-a549-a1c837b68a1b\scratchpad\` — `login.mjs`(로그인·쿠키 저장), `a2.mjs`(항목 2 API), `n1.mjs`(1a·1b), `n2.mjs`(3·4), `n3.mjs`(4 재실행), `n4.mjs`·`n5.mjs`(항목 2 화면), 결과 `r_n1~r_n5.json`. 실행은 `node gen.mjs view <시나리오> p.json && node shot.mjs p.json`.
