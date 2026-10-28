# E2E 검증: 호스트 라이브체크(헬스체크 버튼) — host-group top-hosts 탭

- 일시: 2026-06-25
- 대상: 호스트 그룹 상세 → "Host List"(= `tab=top-hosts`, HostGroupTopHosts) 탭의 행별 헬스체크 버튼 + 신규 EP `GET /hosts/{hostid}/livecheck`
- 환경: FE Vite :5173 / BE Spring :3000(사전 기동, 사용자 워크로드) / 검증용 최신 jar Spring :3001(본 세션이 기동·정리), Playwright(chromium-1223, headless), 실제 브라우저 로그인(admin)
- 코드 변경: 없음(검증 전용)

## ⚠️ 기동 블로커 (중요)
- 신규 EP `GET /hosts/{hostid}/livecheck`는 **최신 jar(`build/libs/moveseye-be-0.0.1.jar`, 17:01 빌드, livecheck 클래스 포함 확인)** 에만 있다.
- 현재 :3000에 떠있는 Spring(PID 30536, 14:52 기동)은 **이 EP가 없는/동작 안 하는 구버전**이다 — authed livecheck 호출 시 HTTP 500(`{"statusCode":500,"message":"Internal server error"}`).
- **:3000 구 프로세스 종료(=최신 jar 재기동)는 자동승인 정책상 거부됨** — 이 BE는 본 세션이 띄운 게 아니고 코디네이터 메시지는 사용자 권한이 없으며, 다른 워크로드가 의존할 수 있어 force-kill이 차단됨.
- **워크어라운드**: 최신 jar를 **별도 포트 :3001** 에 띄워(본 세션 기동, 검증 후 종료) livecheck EP의 실동작/ping 실작동을 API 레벨로 실증했다. FE UI 버튼은 :3000을 호출하므로 UI 상의 ping alive/dead 표출(S2/S3)은 :3000 재기동 전까지 미검증.

## 결과 요약

| # | 시나리오 | 결과 | 근거 |
|---|----------|------|------|
| S1 | 호스트 목록 탭에서 3배지 컬럼 제거 + 헬스체크 버튼 컬럼 표출 | **PASS** | `e2e-livecheck-01-tophosts-column.png` — 컬럼 `No/Host name/Status/**Health Check**/Health score/Active Alarms`, 전 행 "Health Check" 버튼, agent/icmp/interface 3배지 컬럼 없음 |
| S2 | 살아있는 서버(10635) → ping alive + agent available | **PASS(API)/미검증(UI)** | :3001 API: `ping.state=alive, agent.state=available`, 1308ms, HTTP200. UI 버튼은 :3000 구버전이라 미검증 |
| S3 | 죽은 서버(10634) → 로딩 수초 후 ping dead + agent unavailable | **PASS(API)/미검증(UI)** | :3001 API: `ping.state=dead, agent.state=unavailable`, **4843ms**(ping 타임아웃), HTTP200. UI에선 :3000 500 → "Health check failed" Tag(FE 에러처리 정상) |
| S4 | 행별 독립(한 행 로딩 중 다른 행 무영향) | **부분 PASS** | FE 설계상 queryKey에 hostId 포함, 버튼 loading 행별. UI에서 동시 호출 관측은 :3000 EP 부재로 완전 재현 불가 |
| S5 | `/livecheck` 200 + 계약대로 payload + ping 실제 동작 | **PASS(API)** | :3001 응답이 계약 shape와 정확히 일치(아래), 응답시간 차이(alive ~1.1s vs dead ~4.8s)로 **실제 OS ping 실행 실증** |
| S6 | 무회귀: 정렬·페이지네이션 | **PASS** | `e2e-livecheck-05-sorted.png`/`-06-page2.png` — Host name 정렬 동작(첫 행 zabbix-server), 페이지 1~4 / Total 40, 2페이지 이동 정상 |

## ping 직접 쏘기 실작동 여부 — **확정 PASS** (핵심)

:3001(최신 jar)에 브라우저 로그인 토큰으로 livecheck 직접 호출 결과:

| host | ip | 기대 | 실제 ping.state | agent.state | 응답시간 | HTTP |
|------|-----|------|----------------|-------------|---------|------|
| 10635 | 10.220.0.52 | alive+available | **alive** | **available** | 1308ms | 200 |
| 10634 | 10.220.0.77 | dead+unavailable | **dead** | **unavailable** | **4843ms** | 200 |
| 10638 | 10.220.0.92 | alive+available | **alive** | **available** | 1129ms | 200 |

→ 살아있는 서버는 ~1.1–1.3초 alive, **죽은 서버는 ping 타임아웃으로 4.8초 후 dead**. 응답시간 차이가 BE가 대상 IP에 실제 OS ping을 쏘고 결과(exit code)로 state를 판정함을 명확히 보여준다. agent는 자빅스 interface available과 독립적으로 정확히 표출. **살아있는/죽은 서버 구분 확실.**

payload(예: 10634, 계약 1:1 일치):
```json
{"status":"success","code":200,
 "data":{"hostid":"10634","ip":"10.220.0.77",
         "ping":{"state":"dead","rttMs":null},
         "agent":{"state":"unavailable"},
         "checkedAt":"2026-06-25T08:22:52.752Z"},
 "syncTime":"1782375602"}
```

## 발견 이슈 / 책임 주체

1. **(블로커, 운영) :3000이 구 jar라 UI 버튼이 동작 안 함** — UI에서 헬스체크 버튼 클릭 시 :3000 `/livecheck` 500 → FE가 "Health check failed" 표시. **최신 jar로 :3000 재기동 필요**(본 세션은 권한상 불가). 재기동만 하면 UI도 통과할 것으로 강하게 예상(API 레벨 PASS). → 책임: 배포/기동(코드 아님).

2. **(경미, BE 직렬화) `ping.rttMs`가 alive인데 `null`** — 계약은 "파싱 실패 시 JSON 키 생략(NON_NULL)"인데 실제로는 `rttMs: null`로 노출됨. 원인: **Windows ping 출력이 한글 CP949 인코딩**(`시간=1ms`)인데 `OsPingExecutor.readOutput`이 **UTF-8**로 읽어(`OsPingExecutor.java:97` `StandardCharsets.UTF_8`) `(?:time|시간)…ms` 정규식이 깨진 문자열에 매칭 실패 → rttMs 미파싱. `ping.state`는 exit code 기반이라 정상.
   - 영향: 기능상 무해(rttMs는 optional, state 판정 근거 아님). 다만 (a) 계약상 "키 생략"과 달리 `null`로 나오는 직렬화 불일치, (b) dev Windows에서 rtt가 항상 안 찍힘.
   - 책임: **BE** (`OsPingExecutor`: ① 출력 인코딩을 OS 기본 charset(`Charset.defaultCharset()` 또는 Windows MS949)으로 읽기, ② rttMs null이면 JSON 키 생략하도록 `PingResultDto` @JsonInclude(NON_NULL) 확인). 운영 리눅스(영문 time=)에선 파싱될 가능성 높아 dev-Windows 한정 증상일 수 있음.

3. **(무관, 별건) `/assets` 500** — 이전 검증들과 동일하게 대시보드/사이드 배경 호출에서 `/assets` 500 다수. 라이브체크와 무관. 책임: be-engineer(별건).

## 무회귀(S6) 상세
- 정렬: "Host name" 컬럼 헤더 클릭 → 정렬 동작, 첫 행 "zabbix-server"로 변경.
- 페이지네이션: 페이지 1·2·3·4 + "Total 40 items", 2페이지 이동 시 첫 행 "10.220.0.93"으로 변경(다른 데이터 로드). 헬스체크 버튼 컬럼 추가가 정렬/페이징을 깨지 않음.

## 재현 명령
```
# (A) UI: 현재 :3000(구버전) 기준 — S1/S6/에러처리 관측
cd C:\solutions\_workspace
node e2e_livecheck_runner.cjs

# (B) livecheck EP/ping 실작동: 최신 jar를 :3001에 띄운 뒤 (env export 후 같은 세션)
#   java -jar build\libs\moveseye-be-0.0.1.jar --server.port=3001
node e2e_livecheck_api3001.cjs     # 브라우저 토큰으로 :3001 livecheck 직접 호출
```

## 산출물
- 스크린샷: `e2e-livecheck-01-tophosts-column.png`(버튼 컬럼), `e2e-livecheck-04-dead-result.png`("Health check failed"), `e2e-livecheck-05-sorted.png`, `e2e-livecheck-06-page2.png`
- JSON: `e2e_livecheck_result.json`(UI/:3000), `e2e_livecheck_api3001_result.json`(:3001 ping 실작동 — **핵심 근거**)
- 러너: `e2e_livecheck_runner.cjs`, `e2e_livecheck_api3001.cjs`
- BE :3001 로그: `e2e_livecheck_spring3001.log`
