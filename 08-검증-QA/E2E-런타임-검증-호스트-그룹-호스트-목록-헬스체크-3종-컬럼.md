# E2E 런타임 검증 — 호스트 그룹 "호스트 목록" 헬스체크 3종 컬럼

검증자: functional-qa · 날짜: 2026-06-18
대상: `getGroupTopHosts` (GET `/hosts/:groupid/top-hosts`) 응답 + FE 호스트 목록 탭 배지 렌더
계약: `_workspace/contract_host-healthcheck.md` · 정적검증(PASS): `_workspace/verification/qa_host-healthcheck.md`

---

## 종합 결과: 조건부 PASS (NestJS) + 1건 누락 (Spring)

| # | 시나리오 | 결과 |
|---|---------|------|
| 0 | 인증 흐름 (토큰 없음/visitor-id 없음/정상) | **PASS** |
| 1 | BE 응답 실호출 — 3필드 존재·값 도메인 (NestJS) | **PASS** |
| 2 | 화면 렌더 — 3컬럼 표시 / 기존 단일 "가용" 컬럼 제거 | **PASS** |
| 3 | 값-배지 매핑 (available→green / unavailable→red / unknown→default) | **PASS (6/6 교차검증)** |
| 4 | 엣지/무회귀 — 빈 그룹·페이지네이션·정렬·기존 컬럼 | **PASS** |
| ⚠ | **Spring BE(moveseye-be-spring)에 3필드 미구현** | **FAIL (be 책임)** |

---

## ⚠ 가장 중요한 발견: 실행 중인 BE가 Spring이고 3필드가 없었음

검증 시작 시 포트 3000에 떠 있던 프로세스는 **NestJS가 아니라 Spring Boot**
(`moveseye-be-spring`, `java.exe` PID 35260)였다.

- 이 Spring BE에 `GET /hosts/2/top-hosts`를 호출하면 **40개 호스트 전부에서
  `agentHealth`/`icmpHealth`/`interfaceHealth` 필드가 응답에 아예 없었다**
  (값이 `unknown`인 게 아니라 키 자체가 missing).
- 원인: 헬스체크 3필드는 **NestJS 소스에만 구현**되어 있고
  (`moveseye-be/src/host/host.service.ts:554-561`, `dto/responses/host-status.dto.ts:48/57/67`),
  **Spring 소스(`moveseye-be-spring/src/main/java`)에는 0건** (grep 결과 미존재).
- MEMORY 정책("새 BE 기능은 Nest+Spring 양쪽 동시 반영")이 이번 변경에서 지켜지지 않았다.

→ FE가 프로덕션/현재 기동 환경에서 Spring을 바라보면 3 컬럼이 전부 "없음(N/A)"으로만
   표시되어 기능이 무력화된다. **be-engineer가 Spring 쪽에 동일 로직을 포팅해야 함.**

검증을 위해 Spring을 중지하고 NestJS(`npm run start:dev`, 포트 3000)를 기동하여
이하 시나리오 1~4를 수행했다.

---

## 시나리오 0 — 인증 흐름 (PASS)
재현: `node` 직접 HTTP 호출 (`.e2e_token`의 admin 토큰 + `x-visitor-id`)
- 토큰 없음 → `401 INVALID_TOKEN`
- `x-visitor-id` 헤더 없음 → `401 Missing x-visitor-id header`
- 토큰 + visitor-id → `200`
계약 §1(필수 헤더 `x-visitor-id` + Bearer) 일치.

## 시나리오 1 — BE 응답 실호출 (NestJS, PASS)
재현: `GET /hosts/{groupid}/top-hosts?offset=0&limit=100`
증거: `_workspace/e2e-hc-be-group2.json`

- **group 2 (Linux servers, 40 hosts)**: 3필드 모두 존재(missing NONE), 모든 값이
  `available|unavailable|unknown` 3종 내(out-of-domain NONE).
  - 관측 분포:
    - `agentHealth`    : unavailable 33 / available 6 / unknown 1
    - `icmpHealth`     : unknown 36 / available 4
    - `interfaceHealth`: unknown 39 / unavailable 1
- **group 7 (Hypervisors, 4 hosts)**: agentHealth unknown 3 / unavailable 1, icmp·interface 모두 unknown. 도메인 정상.
- **group 20 (Databases, 빈 그룹)**: `{ items: [], total: 0 }` (계약 §2.1 일치).

> icmp/interface가 대부분 `unknown`인 것은 **코드 버그가 아니라 데이터 상태**다.
> 실제 Zabbix 환경에서 대부분 호스트에 `icmpping` item과 SNMP/IPMI/JMX 인터페이스가
> 없기 때문이며, agent/icmp/interface 각 3종 값이 실제 호스트에서 모두 관측됨으로써
> 매핑 로직이 정상 작동함을 확인했다(아래 시나리오 3).

## 시나리오 2 — 화면 렌더 (PASS)
재현: `node e2e_hc_runner.cjs` · 증거: `e2e-hc-01-group2-hostlist.png`
- 활성 탭: "Host List"(=top-hosts, 계약상 "호스트 목록").
- 컬럼 헤더 순서:
  `No | Host name | Status | Agent | Server (ICMP) | Interface | Health score | Active Alarms`
- **신규 3컬럼(Agent / Server (ICMP) / Interface)이 Status와 Health score 사이에 표시됨.**
- **기존 단일 "가용(Available)" 컬럼은 헤더에 존재하지 않음 → 정상 대체 확인.**
- 각 행에 3개 배지 렌더됨.

## 시나리오 3 — 값-배지 매핑 (PASS, 6/6 교차검증)
재현: `node e2e_hc_lastpage.cjs` (마지막 페이지에 정상 호스트 집중) · 증거: `e2e-hc-05-green-badges.png`
FE 매핑(`HostGroupTopHosts.tsx:54-75`): available→green/"가용"(EN Up), unavailable→red/"비가용"(EN Down), unknown→default(회색)/"없음"(EN N/A).
BE JSON 값과 화면 배지 색/라벨 자동 대조 결과:

| 호스트 | BE (agent/icmp/iface) | 화면 배지 | 일치 |
|--------|----------------------|----------|------|
| 10.220.0.131 ... | unknown / available / unavailable | N/A[default] / Up[green] / Down[red] | ✓ |
| node2 | unavailable / available / unknown | Down[red] / Up[green] / N/A[default] | ✓ |
| 10.220.0.92_test_1 | available / unknown / unknown | Up[green] / N/A[default] / N/A[default] | ✓ |
| 10.220.0.52 | available / unknown / unknown | Up[green] / N/A / N/A | ✓ |
| 10.220.0.92 | available / available / unknown | Up[green] / Up[green] / N/A | ✓ |
| zabbix-server | available / available / unknown | Up[green] / Up[green] / N/A | ✓ |

3색·3라벨 모두 화면에 출현했고 BE 값과 1:1 일치(6/6 PASS).

## 시나리오 4 — 엣지/무회귀 (PASS)
재현: `node e2e_hc_runner.cjs` · 증거: `e2e-hc-02-group2-page2.png`, `e2e-hc-03-group2-sorted.png`, `e2e-hc-04-empty-group20.png`
- **빈 그룹(20)**: 헤더 8컬럼 그대로, 0행, "No data" 빈 상태. 테이블 깨짐 없음.
- **페이지네이션**: 40 hosts → page1 10행 / page2 10행, `offset=10&limit=10` 요청 정상.
- **정렬**: sortable 컬럼 4개(Host name/Status/Health score/Active Alarms)만 정렬 가능,
  헬스 3컬럼은 `sorter:false`라 정렬 비대상 — 계약 §1("신규 3필드는 정렬 대상 아님")과 일치.
  health 헤더 클릭 시 `sortBy=health&sortDirection=ASC↔DESC` 토글, 데이터 재요청 정상.
- 기존 컬럼(호스트명/상태/건강값/활성알람) 값 정상 렌더.

---

## 동작 버그 / 라우팅

| 항목 | 주체 | 내용 | 재현 |
|------|------|------|------|
| Spring BE 3필드 미구현 | **be-engineer** | `moveseye-be-spring`의 `top-hosts` 응답에 agentHealth/icmpHealth/interfaceHealth 없음. NestJS에만 구현됨. | Spring 기동(3000) 후 `GET /hosts/2/top-hosts` → items[].agentHealth 등 키 부재 |

NestJS 측 BE·FE·계약은 런타임 동작상 결함 없음. (shape 불일치 아님 → integration-qa 영역 아님. 구현 누락 = be 책임.)

---

## 증거 파일 (모두 `C:\solutions\_workspace\`)
- BE 응답: `e2e-hc-be-group2.json`
- 스크린샷: `e2e-hc-01-group2-hostlist.png`, `e2e-hc-02-group2-page2.png`, `e2e-hc-03-group2-sorted.png`, `e2e-hc-04-empty-group20.png`, `e2e-hc-05-green-badges.png`
- 러너: `e2e_hc_runner.cjs`, `e2e_hc_lastpage.cjs`
- 기동 로그: `.bootrun-nest.log`

---
---

# 라운드2: Spring BE(moveseye-be-spring, 포트 3000) 재검증

검증자: functional-qa · 날짜: 2026-06-18 · 대상 BE: **Spring Boot 3.3.5 (java, 신규 빌드)**
배경: 1차 라운드에서 Spring에 3필드가 아예 없어 FAIL → be-engineer가 Spring(`HostService`/`HostStatusDto`/신규 `HealthState` enum)에 포팅 완료 → 클로즈드 루프 마감 검증.

## 종합 결과: 전 시나리오 PASS (클로즈드 루프 마감)

| # | 시나리오 | 결과 |
|---|---------|------|
| 0 | 인증 흐름 (토큰 없음 / visitor-id 없음 / 정상) | **PASS** |
| 1 | BE 응답 — 3필드 **키 존재** + 값 도메인 (★ 1차 FAIL 핵심) | **PASS (missing=0)** |
| 2 | NestJS와 값 동등성 (분포 + 호스트별 1:1) | **PASS (40/40 동일)** |
| 3 | 화면 렌더 — 3컬럼 배지 + BE값 일치 | **PASS (60/60 셀)** |
| 4 | 엣지/무회귀 — 빈 그룹·페이지네이션·정렬 | **PASS** |

## 0. 환경 재기동 (필수 — 이전 바이너리 교체)
- 검증 시작 시 3000에 떠 있던 java(PID 34244)는 **포팅 전 바이너리(16:24 기동)** 였고 `GET /hosts/2/top-hosts`가 HTTP 500 → 중지.
- 신규 빌드(`build/classes` 16:33, 소스 16:32 이후)로 재기동. **`.env` export 시 CRLF(`\r`) 제거가 핵심**:
  CR을 안 떼면 jdbcUrl 정상 치환에도 `Driver claims to not accept jdbcUrl` / `Unable to determine Dialect` 로 DB 연결 실패(=이전 노트의 "`${DB_HOST}` 치환 실패"의 실제 원인).
  - 기동: `.env`(CR strip) + `JAVA_HOME=jdk-17` + `SPRING_FLYWAY_ENABLED=false` export 후 `gradlew.bat bootRun -x test`.
  - 로그: `.bootrun-spring2.log` → `Started MoveseyeApplication in 6.361 seconds`, `Tomcat started on port 3000`.
- 재로그인(`POST /auth/login`, admin/<마스킹>, `x-visitor-id`) → HTTP 200, 새 토큰 `.e2e_token` 갱신.

## 시나리오 0 — 인증 흐름 (PASS)
- 토큰 없음 → `401 {"status":"error","code":401,"message":"INVALID_TOKEN"}`
- `x-visitor-id` 없음 → `401 ... "Missing x-visitor-id header"`
- 토큰+visitor-id → `200`. 계약 §1(필수 헤더) 일치. (Spring도 401만 실제 상태코드 — 계약 준수.)

## 시나리오 1 — BE 응답 실호출 (PASS, 1차 FAIL 해소)
재현: `GET /hosts/{2,7,20}/top-hosts?offset=0&limit=100` · 증거: `e2e-hc-spring-group2.json`
- **group 2 (Linux servers, 40 hosts)**: 3필드 모두 **키 존재(missing=0)**, 값 전부 `available|unavailable|unknown` 3종 내(out-of-domain=0). firstItemKeys에 `agentHealth,icmpHealth,interfaceHealth` 포함.
  - Spring 관측 분포:
    - `agentHealth`    : unavailable 33 / available 6 / unknown 1
    - `icmpHealth`     : unknown 36 / available 4
    - `interfaceHealth`: unknown 39 / unavailable 1
- **group 7 (Hypervisors, 4 hosts)**: agentHealth unknown 3 / unavailable 1, icmp·interface 모두 unknown 4. 도메인 정상.
- **group 20 (빈 그룹)**: `{ items: [], total: 0 }` (계약 §2.1 일치).
- JSON 키/값: `HealthState`는 `@JsonValue`로 소문자 `available/unavailable/unknown` 직렬화 — 계약 §2.3 철자 일치.

> 1차에서 키 자체가 missing이던 게 이번엔 missing=0 → **포팅 성공, 합격 기준 충족.**

## 시나리오 2 — NestJS 동등성 (PASS, 완전 동일)
- **분포 동등**: group2 3필드 분포가 NestJS 1차 관측치(agent unavailable33/available6/unknown1, icmp unknown36/available4, iface unknown39/unavailable1)와 **완전 일치**.
- **호스트별 1:1**: NestJS 캡처(`e2e-hc-be-group2.json`) ↔ Spring(`e2e-hc-spring-group2.json`) 40 호스트를 hostid 기준 대조 → **matched(3필드 동일)=40 / diffs=0 / onlyInSpring=0**.
  Zabbix 상태 변동조차 없이 모든 호스트가 동일값. (데이터 unknown 다수는 코드 버그 아님 — 실 Zabbix에 icmpping item/SNMP·IPMI·JMX 인터페이스가 대부분 없기 때문, 1차 결론과 동일.)

## 시나리오 3 — 화면 렌더 + 값-배지 (PASS, 60/60)
재현: `node e2e_hc_spring_runner.cjs` (FE 5173 → BE 3000=Spring) · 증거: `e2e-hc-spring-01-group2-hostlist.png`, `e2e-hc-spring-05-lastpage-badges.png`
- 활성 탭 "Host List", 헤더 8컬럼: `No | Host name | Status | Agent | Server (ICMP) | Interface | Health score | Active Alarms`. 신규 3컬럼이 Status~Health score 사이 표시, 기존 단일 "가용" 컬럼 없음.
- FE 매핑(available→green/Up, unavailable→red/Down, unknown→default/N/A) 기준 BE값-배지 자동 대조: **page1 30셀 + lastPage 30셀 = checked 60 / pass 60 / fail 0.**
- 3색·3라벨 모두 화면 출현: red/Down 14, default/N/A 36, green/Up 10.
- 스크린샷 육안 확인: Agent 컬럼 빨강 "Down", Server(ICMP)/Interface 회색 "N/A"가 Spring 응답값과 일치해 렌더됨.

## 시나리오 4 — 엣지/무회귀 (PASS)
증거: `e2e-hc-spring-02-group2-page2.png`, `e2e-hc-spring-03-group2-sorted.png`, `e2e-hc-spring-04-empty-group20.png`
- **빈 그룹(20)**: 헤더 8컬럼 유지, 0행, "No data" 빈 상태. 테이블 깨짐 없음.
- **페이지네이션**: 40 hosts → page1 10행 / page2 10행 (4페이지). 정상.
- **정렬**: sortable 컬럼 4개(Host name/Status/Health score/Active Alarms)만 정렬 가능, 헬스 3컬럼은 정렬 비대상 — 계약 §1 일치.

## 동작 버그 / 라우팅
- **없음.** 1차 Spring FAIL(3필드 키 부재)은 be-engineer 포팅으로 해소되어 **클로즈드 루프 마감.** shape/값/화면 모두 NestJS와 동등.

## 환경 원복
- Spring(신규 빌드)을 **3000에 정상 기동 상태로 유지**(원래 운영 상태 = Spring). FE 5173/5174는 기존 기동분 재사용(중지 안 함).

## 증거 파일 (라운드2, 모두 `C:\solutions\_workspace\`)
- BE 응답: `e2e-hc-spring-group2.json`
- 스크린샷: `e2e-hc-spring-01-group2-hostlist.png`, `e2e-hc-spring-02-group2-page2.png`, `e2e-hc-spring-03-group2-sorted.png`, `e2e-hc-spring-04-empty-group20.png`, `e2e-hc-spring-05-lastpage-badges.png`
- 러너: `e2e_hc_spring_runner.cjs`
- 기동 로그: `.bootrun-spring2.log`
