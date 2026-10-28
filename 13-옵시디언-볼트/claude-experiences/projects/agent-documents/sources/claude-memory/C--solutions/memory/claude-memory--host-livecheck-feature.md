---
name: host-livecheck-feature
description: "호스트 목록 탭 헬스체크 버튼 — ping(BE 직접 OS ping)+agent(자빅스 interface available) 두 지표 독립 확인. GET /hosts/{hostid}/livecheck(Spring)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 24772a55-f055-4453-ba69-5b1df138b19f
---

호스트 그룹 상세 "호스트 목록" 탭(`HostGroupTopHosts`)의 행별 **헬스체크 버튼**. "서버가 살아있는가"를 **두 지표로 독립 확인**한다(에이전트가 꺼져도 서버 자체는 살아있을 수 있어 각자 봐야 함). 기존 agent/icmp/interface 3배지 컬럼을 제거하고 도입.

**왜 이 방식인가 (설계 근거 — 재조사 방지):**
- **ping(서버 생존) = BE가 대상 IP로 직접 OS ping**. 자빅스 `icmpping` item은 이 환경 group2 40대 중 **4대만** 수집돼 자빅스로는 커버 불가. 직접 쏘면 40대 전부 실시간 확인(대상망 10.220.0.x에 BE가 닿음을 실측 확인). alive ~1.1초 / dead ~4.8초(타임아웃)로 구분 실증.
- **agent(에이전트 생존) = 자빅스 `host.get selectInterfaces` type=1(Agent) `available`**. agent 포트(10050) **직접 두드리기는 폐기** — 자빅스 agent가 보안상 `Server` IP 제한을 둬, 실제 살아있는 호스트(.92)인데 우리 쪽 TCP 연결은 거부돼 오판하기 때문. interface available은 39/40대 커버.

**BE(Spring 단일, `GET /hosts/{hostid}/livecheck`):** `LiveCheckService`+`OsPingExecutor`+`IpValidator`. host.get으로 대상 IP(agent ip→main ip→첫 ip)+agent available 산출, IP 형식 검증 후 `ProcessBuilder`로 OS ping 직접 실행(Windows `ping -n 2 -w 2000`, Linux `ping -c 2 -W 2`, exit0=alive, waitFor 4s 타임아웃→dead, 쉘 미경유 인자배열로 주입 방지). 응답 `{hostid, ip, ping:{state:alive|dead|unknown, rttMs?}, agent:{state:available|unavailable|unknown}, checkedAt}`. `PingResultDto`는 `@JsonInclude(NON_NULL)`로 rttMs null 시 키 생략.
- ⚠️ **ping 출력 charset**: `Charset.defaultCharset()`로 읽어야 함(한글 Windows는 CP949 `시간=1ms` — UTF-8 하드코딩이면 rtt 정규식 매칭 실패해 rttMs=null. state는 exit code 기반이라 무관). 정규식은 `(?:time|시간)` 양쪽 매칭.
- ⚠️ **운영 리눅스**: `ping` 바이너리·ICMP 권한 필요(부재 시 `ping.state=unknown`). 단건(버튼 1행) 설계 — 동시 호출은 FE가 행 단위로.
- 기존 `top-hosts`의 agentHealth/icmpHealth/interfaceHealth 필드는 **불변**(계약 보존, FE가 컬럼만 교체).

**FE(`moveseyee_fe`):** `HostGroupTopHosts` 컬럼 = `… / status / [health_check 버튼] / [ping] / [agent] / health_value / …`. `HostLiveCheckCell.tsx`가 3 export(`HostLiveCheckButtonCell`/`HostPingResultCell`/`HostAgentResultCell`)+공통 훅 `useHostLiveCheck(hostId, requested)`. 부모가 `requestedHostIds: Set<hostid>`로 행별 enabled 관리, 세 셀이 동일 `queryKey([HOST_LIVE_CHECK, hostId])` 구독 → **캐시 공유로 호출 1회**, ping/agent 컬럼이 같은 결과를 나눠 표시. 색: alive/available green, dead/unavailable red, unknown default. 조회 전 `-`, 버튼 loading, 실패 시 컬럼별 failed.

**산출물:** 계약 `_workspace/features/infra/host-checks/contract_host-livecheck.md`, 검증 `_workspace/e2e_host-livecheck.md`, 진단 `_workspace/diag_healthcheck-items.{cjs,result.json}`(소스 커버리지 4/8/39).

**Why:** ping/agent 어느 한쪽으로 통일하려는 유혹을 막기 위함 — 둘은 서로 대체 불가(agent 꺼짐 vs 네트워크 막힘)이고, 이 환경 데이터/보안 제약상 ping=직접·agent=자빅스가 각각 최적. 관련 디스크 계열 비대칭은 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--disk-detail-item-family-fallback|disk-detail-item-family-fallback]], FE 언랩 깊이는 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-usedmovequery-unwrap|fe-usedmovequery-unwrap]].

**How to apply:** 이 기능 확장 시 — ping은 BE 직접(자빅스 icmpping 의존 금지), agent는 자빅스 interface available(포트 probe 금지). ping 출력 charset 회귀 주의. UI 런타임 확인은 `:3000`을 livecheck 포함 최신 jar로 재기동해야([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-dual-maintenance|be-dual-maintenance]] FE가 아직 :3000 Nest 연결).
