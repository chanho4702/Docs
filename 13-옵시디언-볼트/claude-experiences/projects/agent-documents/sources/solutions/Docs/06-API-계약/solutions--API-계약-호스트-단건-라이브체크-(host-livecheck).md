# API 계약 — 호스트 단건 라이브체크 (host livecheck)

> 단일 진실 원천(SSOT). FE는 이 문서를 기준으로 services/types/hooks를 작성한다.
> BE: `moveseye-be-spring` (Spring 단일). 산출일 2026-06-25.

## 엔드포인트

| 항목 | 값 |
|------|-----|
| 메서드 | `GET` |
| 경로 | `/hosts/{hostid}/livecheck` |
| 용도 | 호스트 그룹 상세 > "호스트 목록" 탭의 행별 헬스체크 버튼 호출 (단건/행 단위) |
| 인증 | Bearer 토큰 (`@SecurityRequirement(name="bearer")`) + `x-visitor-id` 헤더 (`@VisitorIdCheck`) — 기존 `/hosts/**` 와 동일 |
| 권한 | `@Roles`/`@RolesGuarded` 없음 (기존 host 컨트롤러와 동일, 일반 인증 사용자) |

- 경로 충돌: `/{hostid}/livecheck` 는 2-segment 라 1-segment `GET /hosts/{groupid}` 와 충돌하지 않음
  (`/{hostid}/collected-info`, `/{groupid}/disk/current` 와 동일 구조). 경로명 그대로 `livecheck` 사용(`live-check` 아님).

## 요청

- Path variable: `hostid` (string) — Zabbix host id.
- Query/Body: 없음.

## 응답

표준 래퍼(`ApiResult`)로 감싸지며, 성공 시 `status:"success"`, `code:200`, `syncTime` 주입.
**FE는 useDmoveQuery 2겹 언랩으로 아래 `data` payload를 직접 수신**한다([[fe-usedmovequery-unwrap]] 전제).

### payload shape (= `data`)

```jsonc
{
  "hostid": "10652",
  "ip": "10.220.0.70",            // string | null  — ping 대상 IP. 못 찾으면 null
  "ping": {                        // BE 직접 ICMP ping (자빅스 비의존)
    "state": "alive",             // "alive" | "dead" | "unknown"
    "rttMs": 1.2                   // number | (생략)  — 파싱 가능할 때만. 미파싱/실패 시 키 생략(undefined)
  },
  "agent": {                       // 자빅스 host.get type=1(Agent) 인터페이스 available 종합
    "state": "available"          // "available" | "unavailable" | "unknown"
  },
  "checkedAt": "2026-06-25T07:12:33.123Z"   // string (UTC, ms 포함)
}
```

### 필드 타입표

| 필드 | 타입 | 설명 |
|------|------|------|
| `hostid` | `string` | 조회한 Zabbix host id |
| `ip` | `string \| null` | ping 대상 IP. agent(type=1) ip 우선 → main 인터페이스 ip → 첫 인터페이스 ip. 없으면 `null` |
| `ping.state` | `"alive" \| "dead" \| "unknown"` | BE 직접 ping 결과. unknown = ping 시도 불가(IP 없음/형식 불일치/실행 오류) |
| `ping.rttMs` | `number \| undefined` | 왕복 ms. **optional** — 파싱 실패 시 JSON 키 생략(NON_NULL). state 판정 근거 아님 |
| `agent.state` | `"available" \| "unavailable" \| "unknown"` | 자빅스 agent 인터페이스 available 종합 |
| `checkedAt` | `string` | 체크 시각, UTC ISO `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` |

> 주의: `ping`/`agent` 객체 자체는 항상 존재. `ping.rttMs`만 optional(생략 가능).

## 상태값 enum 의미

### ping.state (BE 직접 ICMP)
- `alive` — ping exit code 0 (응답 성공).
- `dead` — ping 비0 exit / 프로세스 타임아웃.
- `unknown` — ping 시도 불가: `ip`가 null이거나 IPv4/IPv6 형식 검증 실패, 또는 ping 실행 자체 실패(바이너리 부재/권한).

### agent.state (Zabbix interface available)
- `available` — type=1 인터페이스 중 하나라도 `available=1`.
- `unavailable` — type=1 인터페이스가 있으나 전부 비가용이고 그중 하나라도 `available=2`.
- `unknown` — type=1(Agent) 인터페이스가 없거나, 있어도 전부 `available=0`(2도 없음).

## 데이터 출처

- **agent**: Zabbix `host.get(hostids, selectInterfaces:[interfaceid,type,available,ip,main])` 의 `type=1` 인터페이스 `available`.
  - available 코드: `0`=unknown, `1`=available, `2`=unavailable. type `1`=Agent.
  - 직접 포트(10050) 두드리기는 자빅스 agent Server IP 제한으로 부정확함이 실측 확인 → 자빅스 값 사용.
- **ping**: BE 환경에서 대상 IP로 직접 OS ping 명령 실행(자빅스 의존 X — icmpping item이 40대 중 4대만 존재해 커버 불가).

## 에러

| 상황 | 응답 |
|------|------|
| 존재하지 않는 hostid (`host.get` 빈 결과) | `ApiError(HOST_NOT_FOUND)` → HTTP 200 + body `code:400`, `errorCode:"HOST_NOT_FOUND"` (CLAUDE.md 200 보존 규약) |
| ping 실패/타임아웃 | **에러 아님** — `ping.state = "dead"` 또는 `"unknown"` 으로 표현 |
| IP 형식 불일치/없음 | **에러 아님** — `ping.state = "unknown"`, `ip = null` |

## ping 구현 방식 (참고)

- OS ping 명령을 `ProcessBuilder`로 실행(쉘 미경유, 인자 배열). `InetAddress.isReachable()` 미사용(리눅스 TCP 폴백 부정확).
- OS 분기: Windows `ping -n 2 -w 2000 <ip>`, Linux/Unix `ping -c 2 -W 2 <ip>`.
- exit code 0=alive, 비0=dead. 프로세스 타임아웃 가드 `waitFor(4s)` 후 `destroyForcibly` → 타임아웃은 dead.
- rttMs 파싱: Windows `time=`/`시간=`, Linux `time=` per-reply, 폴백으로 요약줄 avg. 실패해도 무방.
- **보안**: 대상 IP는 `IpValidator`로 IPv4/IPv6 형식 검증 통과 시에만 ProcessBuilder 인자로 전달(명령 주입 방지). 형식 아니면 ping unknown.

## 운영 주의

- 운영 리눅스 환경에는 `ping` 바이너리와 ICMP 권한이 필요. 부재/권한 부족 시 `ping.state="unknown"`.
- dev Windows에서는 실측 가능(대상망 10.220.0.x 도달 확인됨).
- ping은 **단건(버튼 1행)** 설계. 부하/지연 관리를 위해 동시/일괄 ping은 FE가 행 단위로 호출.

## FE 연동 가이드

- 기존 `top-hosts`의 `agentHealth`/`icmpHealth`/`interfaceHealth` 필드는 **변경 없음**(별도 엔드포인트). FE는 헬스체크 버튼이 이 신규 EP를 행 단위로 호출하도록 추가.
- 버튼 클릭 시 1회 호출 → `ping.state`/`agent.state` 두 배지로 표시 권장.

## 변경 파일 (BE)

신규:
- `host/dto/PingState.java` — ping 상태 enum (alive/dead/unknown, @JsonValue 소문자).
- `host/dto/PingResultDto.java` — { state, rttMs(optional) }.
- `host/dto/AgentStateDto.java` — { state: HealthState }.
- `host/dto/HostLiveCheckResDto.java` — 최종 응답 payload.
- `host/livecheck/PingExecutor.java` — ping 실행 인터페이스(주입 가능).
- `host/livecheck/OsPingExecutor.java` — OS ping 구현(@Component, rtt 파싱 static).
- `host/livecheck/IpValidator.java` — IPv4/IPv6 형식 검증(명령 주입 방지).
- `host/livecheck/LiveCheckService.java` — host.get → ip 산출 + agent 상태 + ping 조립.

수정:
- `host/HostController.java` — `GET /{hostid}/livecheck` 매핑 + `LiveCheckService` 주입.

테스트(신규):
- `host/livecheck/IpValidatorTest.java`
- `host/livecheck/OsPingExecutorRttParseTest.java`
- `host/livecheck/LiveCheckServiceTest.java` (happy/unavailable/unknown/main-ip/invalid-ip/no-iface/host-not-found)

## 빌드/테스트 결과

- `gradlew build` (test 포함) BUILD SUCCESSFUL.
- 신규 단위 테스트 3개 클래스 통과.
