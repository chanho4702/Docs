# Phase A: 런타임 확증 — 정적 감사 결함후보 5건 (BE 정본 Spring 실기동)

- 실행일: 2026-07-01
- 검증자: functional-qa (런타임 행위)
- BE 정본: `moveseye-be-spring` 사전빌드 jar(`build/libs/moveseye-be-0.0.1.jar`, 2026-06-25 17:29, disk 폴백+livecheck 포함)를 **:3001**로 기동(성공). `.env` export + `SPRING_FLYWAY_ENABLED=false` + `PORT/SERVER_PORT=3001`.
- 기동 로그: `_spring3001_out.log` — `Started MoveseyeApplication ... Tomcat started on port 3001`.
- 인증: FE(:5173) 실 로그인(admin/<마스킹>)으로 per-user Zabbix 세션을 Redis에 확립 후 그 accessToken(cookie)+x-visitor-id로 :3001 호출. (자체 민팅한 admin JWT는 `getSuperAdminToken()`이 공유 Redis의 stale `ZABBIX::Super_Admin` 세션을 반환→ 전 zabbix EP가 `INVALID_TOKEN(401)`. Redis 직접 삭제는 정책상 차단되어 실 로그인 경로로 우회.)

## ⚠️ 환경 관련 중대 정정/한계 (판정 해석의 전제)
1. **:3000 = Nest 가 아니라 Spring 이다.** :3000 프로세스는 java(jdk-17)이며 Spring 전용 라우트 `/host/{id}/disk/detail`에 정상 응답(`_workspace/.spring3000_pid`=10828, `_run_spring_jar_3000.ps1` 존재). **실 Nest(`moveseye-be`)는 미기동.** 따라서 "Nest(:3000) vs Spring(:3001)" 런타임 대조는 **불가**였고, Nest 거동은 **소스 근거**로만 판정한다(아래 #1/#2).
2. **dev Zabbix 데이터가 idle + history 무보존.** 13개 대상 호스트의 cpu/memory/network/response-time **현재값이 대부분 0**이고, cpu·memory·network·disk **line-charts(history) 전부 7일 창에서 0포인트**. → 시계열·부하 의존 항목(#3 line-charts, #4 interface status, #5 nonzero 배율)은 런타임 실측 격리가 제한됨. shape/로직은 확인 가능.
3. 대상 호스트 13개(전부 서버, 10.220.0.x): 10703,10697,10639,10737,10730,10695,10698,10731,10676,10688,10719,10732,10696. (`rtverify_serverlist.json`)

---

## #1 [Critical] response-time/summary 배열 누락 — **CONFIRMED (런타임 라이브 크래시)**

- 판정: **CONFIRMED**. Spring이 `data`를 **단일 객체**로 반환 → FE `tlData.map()`가 실제로 TypeError로 화면 크래시.
- 런타임 원 응답 (Spring :3001 **및** :3000 동일):
  `GET /host/10703/response-time/summary`
  → `{"status":"success","code":200,"data":{"responseTime":{"max":0,"avg":0},"packageLoss":{"max":0,"avg":0}},"syncTime":"..."}`
  → 언랩 후 `data` = **object** `{responseTime,packageLoss}` (배열 아님). 13개 호스트 전부 동일.
- Nest 소스(참조, 미기동): `moveseye-be/src/host/response-time/response-time.controller.ts` `return new ApiResult<...>().success([result]);` → **배열 `[result]`**. 즉 소스상 shape divergence는 실재(Nest=배열, Spring=객체).
- FE 소비: `services/host-monitoring.api.ts:232` `getDetailHostResTL` → `GET .../response-time/summary`. `pages/monitoring/network-monitoring/ResponseTLDetail.tsx:37,52,54` `tlData.map(...)`.
- **FE 라이브 재현(:5173, BE=:3000 Spring):** `GET /monitoring/network-monitoring/10639/response-time` →
  - console/pageerror: `TypeError: tlData.map is not a function at ResponseTLDetail.tsx:52`
  - 화면: 에러바운더리 "Oops! ... The page you tried to open has the following error: tlData.map is not a function"
  - 증거: `runtimeverify_resptime.png`, `rtverify_fe_screens.json`
- 핵심: :3000이 이미 Spring이므로 이 크래시는 **미래 위험이 아니라 현재 실장애**. (실 Nest로 붙이면 배열이라 통과.)
- repro: `node C:\solutions\_workspace\rtverify_fe_screens.cjs` (로그인+3화면), `node rtverify_disk_deep.cjs`(원 JSON), `rtverify_main_result.json`.

## #2 [High] session/history 래핑 누락 — **shape CONFIRMED(소스/DTO) / 런타임 행위 미확인(세션 데이터 0)**

- 판정: shape divergence는 **CONFIRMED**(Nest 소스가 시리즈 래핑, Spring은 평면 포인트). 다만 런타임 세션 데이터가 없어 **행위(차트 파손) 재현은 미확인**.
- 런타임 원 응답(Spring :3001): `GET /session/{id}/history?from&to`(1h·7d 창, 호스트 10695/10696/10703/10639/10697) → 전부 `{"data":[]}` (빈 배열).
- Nest 소스(참조): `moveseye-be/src/host/network/session.controller.ts:77-78` `const responseData = [{ data: result, type: '' }]; ...success(responseData);` → **`[{data:[...],type:''}]` 시리즈 래핑**.
- Spring DTO: `SessionController.java:42` `ApiResult<List<HistoryPointDto>>`, `HistoryPointDto=record(String timestamp, Object value)` → **평면 `[{timestamp,value}]`**.
- FE 소비: `getChartSession`→`useSessionsChart`→`useHandelChartAction.ts:52` `data?.map(item => parseDataChart(item.data, ...))` (원소의 `item.data`/`item.type` 참조).
- 런타임 행위: `GET /monitoring/network-monitoring/10639/sessions` → **console 에러 0, 크래시 없음**(세션 데이터 `[]`라 map 대상 없음 → 빈 차트 렌더). `runtimeverify_sessions.png`. → 데이터가 있었다면 Spring 평면 원소에서 `item.data`=undefined가 되었을 것이나, 현 환경에선 재현 불가.
- 결론: 계약(shape) 결함 실재(CONFIRMED), 런타임 파손은 세션 데이터 부재로 미시연.

## #3 [Medium] 디스크 line-charts dependent 폴백 없음 — **정적 CONFIRMED / 런타임 미확인(history 전무)**

- 판정: 코드상 결함 **CONFIRMED**(line-charts에 dependent 폴백 부재). 런타임 격리는 **미확인**(환경상 모든 line-charts가 빈값이라 dependent 원인만 분리 불가).
- 정적 근거: `DiskService.getLineChart()`는 `resolveKey()`로 **구형 정확키만** 조회 — USAGE/UTILIZATION→`vfs.fs.size[{partition},pused]`, FREE_INODES→`vfs.fs.inode[{partition},pfree]` 등(`DiskService.java:466-484`, `ZabbixItemKey.java:53-57`). `item.get`은 `filterKey`(정확일치)+`hostids`이며 `items.isEmpty()`면 빈 데이터 반환(`:427-446`). **`getDetail`/`getGroupCurrent`에는 있는 dependent→size 폴백(`buildFilesystems`, `:70-73,111-129`)이 line-charts엔 없음.** → `vfs.fs.dependent.size[...]`만 있는 호스트는 line-charts가 빈다.
- 런타임 관찰(Spring :3001):
  - dependent 호스트 10695(“10.220.0.92_test_1”): `/disk/detail` fs=2, `/`의 bytes.pused=**7.22%**, inodes 존재 → 디스크 실데이터 있음. 그러나 `/disk/line-charts?types=USAGE,FREE_INODES,TOTAL_SPACE,USED_SPACE&partition=/`(1h·7d) → **전 타입 0포인트**.
  - dependent 호스트 10696: detail `/` pused=**58.67%** but line-charts 0포인트.
  - size-fallback 호스트 10698(Windows B:, pused 64.15%)도 line-charts 0포인트.
- 한계: **cpu/memory/network line-charts도 전 호스트 0포인트**(`rtverify_history_check.cjs`) → 이 dev 환경은 history 자체가 비어, "dependent라서 빈 것"과 "history 무보존이라 빈 것"을 런타임으로 구분 불가. detail(현재 lastvalue)은 정상이라 대조는 되나 결정적 격리는 아님.
- 결론: 정적으로 폴백 부재 확정, 런타임은 환경 제약으로 미확인(정적 CONFIRMED + 정황증거).

## #4 [Medium] 인터페이스 total 과대집계/adminDown 이중계수 — **정적 CONFIRMED / 런타임 미확인(대상 호스트에 인터페이스 status item 없음)**

- 판정: 로직 결함 **CONFIRMED**(정적). 런타임 실측은 **미확인**(대상 13호스트 전부 total/up/down/adminDown=0).
- 정적 근거: `InterfaceService.getInterfaceStatusSummary()` (`InterfaceService.java:43-55`):
  - `up` = IFOPERSTATUS==1 개수, `down` = IFOPERSTATUS==2 개수 (같은 oper 계열 → 상호배타).
  - `adminDown` = **IFADMINSSTATUS==2** 개수 (별개 admin 계열).
  - admin-down 인터페이스는 통상 oper=2(down)도 가짐 → **`down`과 `adminDown`에 동시 계수(이중)**.
  - `total = ifDiscovery!=0 ? discovery : up+down+adminDown`(`:54`). 폴백 total은 admin-down 수만큼 **과대**. discovery total이 있어도 `up+down+adminDown > total`(실 인터페이스수) 가능.
- 런타임: `GET /interface/{id}/interface/status` 13호스트 전부 `{"total":0,"up":0,"down":0,"adminDown":0}`. (이 서버들엔 net.if.discovery/ifOperStatus/ifAdminStatus item 미수집 — 스위치/라우터가 아님.) → 과대집계 실측 미시연.
- 참고: 같은 호스트 `network/summary`엔 인터페이스(eno1/ens18 등)가 보이나 interface/status용 item 계열은 없음.
- 결론: 이중계수 로직 확정(CONFIRMED, 정적), 런타임은 적합 호스트 부재로 미확인.

## #5 [Medium] 네트워크 요약 라벨 1000배 — **로직 CONFIRMED / 런타임 배율 미시연(idle 값 0)**

- 판정: 메커니즘 **CONFIRMED**(BE raw bps + FE ÷1000 없이 "Kbps" 라벨). 런타임 nonzero 배율은 **미시연**(idle라 값 0).
- 런타임(Spring :3001): `GET /host/{id}/network/summary` → `[{iface, in:{currentUsage,avgUsage,maxUsage,minUsage}, out:{...}}]`. 필드는 **원시 숫자(bps), 단위/환산 없음**. 값은 전부 0(idle). (10639 등 `in.currentUsage:0`.)
- FE 정적: `utils/index.ts:161-162` NETWORK 헤더단위 `"Kbps"`, `:173` 본문단위 `"K"`, `:895-896` 헤더값 `data.in/out.currentUsage.toFixed(2)`(**환산 없음**). formatBitrate(SI1000)/UnitData.BPS 미사용.
- 귀결: BE가 5,000,000 bps를 주면 FE는 "5000000.00 Kbps"로 표기(정상=~4882 Kbps/5 Mbps) → **1000배 과대라벨**. (Nest·Spring 공통 BE raw bps, Spring 회귀 아님 — FE 표시 결함.)
- 결론: 로직 확정(CONFIRMED), 실측 배율은 idle 데이터로 미시연.

---

## 종합
| # | 항목 | 판정 |
|---|------|------|
| 1 | response-time/summary 객체→FE map 크래시 | **CONFIRMED (라이브 크래시)** |
| 2 | session/history 평면 vs 시리즈 래핑 | shape CONFIRMED(소스/DTO) · 런타임 행위 미확인(세션0) |
| 3 | disk line-charts dependent 폴백 부재 | 정적 CONFIRMED · 런타임 미확인(history 전무) |
| 4 | interface total adminDown 이중계수 | 정적 CONFIRMED · 런타임 미확인(status item 없음) |
| 5 | network 요약 Kbps 1000배 라벨 | 로직 CONFIRMED · 런타임 배율 미시연(idle 0) |

## 산출/증거 파일 (모두 C:\solutions\_workspace\)
- `scan_runtime-verify.md`(본 문서), `rtverify_main_result.json`, `rtverify_serverlist.json`, `rtverify_fe_screens.json`
- 스크린샷: `runtimeverify_resptime.png`(#1 크래시), `runtimeverify_sessions.png`(#2), `runtimeverify_intfstatus.png`(#4)
- 러너: `rtverify_login_list.cjs`, `rtverify_main.cjs`, `rtverify_disk_deep.cjs`, `rtverify_history_check.cjs`, `rtverify_fe_screens.cjs`
- 기동 스크립트/로그: `_run_spring_3001.ps1`, `_spring3001_out.log`
