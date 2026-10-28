---
type: session
tags: [moveseye, zabbix, spring, react, healthcheck, disk, echarts]
created: 2026-06-25
updated: 2026-06-25
status: done
---

# 2026-06-25 — 호스트 라이브체크 + 디스크 dependent 보강 + 커스텀차트 단위

> 서버 모니터링 커스텀 차트 후속 폴리싱 + 호스트 그룹 "호스트 목록" 탭에 헬스체크(라이브체크) 기능 풀스택 신설.
> BE는 Spring 정본(`moveseye-be-spring`) 단일. 산출물·검증은 `C:\solutions\_workspace/`.

## 한 일 (요약)
1. **디스크 사용률 `vfs.fs.dependent.size` 계열 보강** (FE 게이지/파이 + BE 추이/리포트/그룹표)
2. **커스텀 차트 데이터 단위 정리** (혼합 단위 선택 차단 + 단위 표기) + 툴팁 카드밖 표시 + 호스트그룹 테이블 너비
3. **호스트 라이브체크 헬스체크 버튼** (풀스택 신설 — 이 세션 메인)

---

## 1. 호스트 라이브체크 (헬스체크 버튼) — 풀스택 신설

호스트 그룹 상세 "호스트 목록" 탭(`HostGroupTopHosts`)에서 기존 agent/icmp/interface **3배지 컬럼을 제거**하고, 행별 **헬스체크 버튼**으로 "서버가 살아있는가"를 **두 지표 독립 확인**하게 함. (에이전트가 꺼져도 서버 자체는 살아있을 수 있어 각자 봐야 함.)

### 설계 근거 (핵심 — 데이터로 결정)
- **ping(서버 생존) = BE가 대상 IP로 직접 OS ping.** 자빅스 `icmpping` item은 group2 40대 중 **4대만** 수집 → 자빅스로는 커버 불가. 직접 쏘면 40대 전부 실시간(대상망 10.220.0.x에 BE가 닿음을 실측). alive ~1.1초 / dead ~4.8초(타임아웃)로 구분 실증.
- **agent(에이전트 생존) = 자빅스 `host.get selectInterfaces` type=1 `available`.** agent 포트(10050) **직접 두드리기는 폐기** — 자빅스 agent의 `Server` IP 제한 때문에, 실제 살아있는 호스트(.92)인데 우리 TCP 연결은 거부돼 "꺼짐"으로 오판. interface available은 39/40 커버.
- 소스 커버리지 진단: `_workspace/diag_healthcheck-items.{cjs,result.json}` (agent.ping 8 / icmpping 4 / agent-interface 39).

### 구현
- **BE** `GET /hosts/{hostid}/livecheck` (Spring): `LiveCheckService`+`OsPingExecutor`+`IpValidator`. IP 형식 검증 후 `ProcessBuilder`로 OS ping(Win `ping -n 2 -w 2000` / Linux `ping -c 2 -W 2`, exit0=alive, waitFor 4s→dead, 쉘 미경유). 응답 `{hostid, ip, ping:{state, rttMs?}, agent:{state}, checkedAt}`. `@JsonInclude(NON_NULL)`로 rttMs null 키 생략. 계약 `_workspace/contract_host-livecheck.md`.
- **FE**: 컬럼 `… / status / [헬스체크 버튼] / [Ping] / [Agent] / health_value / …`. `HostLiveCheckCell` 3 export(버튼/ping/agent) + 부모 `requestedHostIds: Set` enabled. 세 셀이 동일 `queryKey([HOST_LIVE_CHECK, hostId])` 구독 → **캐시 공유로 호출 1회**, ping/agent 컬럼이 같은 결과 나눠 표시.
- 검증 `_workspace/e2e_host-livecheck.md` — API 전부 PASS. (UI 최종은 :3000을 livecheck 포함 최신 jar로 재기동해야. FE가 아직 :3000 Nest 연결.)

### ⚠️ 함정
- **ping 출력 charset**: 한글 Windows ping은 CP949(`시간=1ms`). `OsPingExecutor`가 UTF-8 하드코딩이면 rtt 정규식 미스로 rttMs=null(state는 exit code라 무관). → `Charset.defaultCharset()`로 수정(양쪽 OS 호환). 정규식은 `(?:time|시간)`.
- 운영 리눅스는 `ping` 바이너리·ICMP 권한 필요(부재 시 unknown).

→ 메모리 `host-livecheck-feature` 에도 기록.

---

## 2. 디스크 사용률 `vfs.fs.dependent.size` 계열 보강

이 환경은 디스크 사용률 % 아이템이 **두 계열로 공존하고 호스트 상호 배타적**: 구형 `vfs.fs.size[<mount>,pused]`(예 10635/38/47/52) ↔ 신형 `vfs.fs.dependent.size[<mount>,pused]`(예 10695/zabbix-server 10696).

- **검색 누락 발견**: 이전 진단들이 `search.key_='vfs.fs.dependent['`(대괄호 포함)로만 조회 → Zabbix search는 substring이라 `vfs.fs.dependent.size[`를 **부분문자열로 포함 안 해 통째로 누락**했었음. `'vfs.fs.dependent'`(대괄호 없이)로 재조회해 실재 확인(float %, trend 보유).
- **FE**: `dashboard-templates.ts` 게이지(`widget_disk_util`)·파이(`widget_disk_usage`)에 `vfs.fs.dependent.size` OR 추가. 게이지 커버리지 trend 4→6대. 검증: zabbix-server 게이지 58.96% 정상.
- **BE**: 사용률 처리가 `vfs.fs.size`에만 묶여 dependent-only 호스트 누락하던 비대칭 수정 — `MetricUtils.isDiskPusedKey` 정규식 `^vfs\.fs\.(dependent\.)?size\[...,pused\]$`, `HostService.resourceMetricItemKeys(disk)`·`ReportService` search에 `VFS_FS_DEPENDENT_SIZE` OR, `getHostItems`는 size 우선·dependent.size 폴백. (디스크 상세/현황 `DiskService`는 이미 dependent 1순위라 정상.) 산출물 `_workspace/be_disk-dependent-coverage.md`.

→ 메모리 `disk-detail-item-family-fallback` 갱신.

---

## 3. 커스텀 차트 단위 + 툴팁 + 테이블

- **단위 정리**(`CustomItemChartPreview`/`AddChartModal`): 기존 `unit:""` 하드코딩으로 축/툴팁/게이지 무단위였음. 신규 `utils/itemUnit.ts`로 units→UnitData 매핑. **"한 차트 = 한 단위" 강제**(custom 모드에서 첫 선택 아이템과 다른 단위 옵션 disabled). 게이지 `%` 표기+소수1자리. ⚠️ 트래픽 `net.if`=bps→`formatBitrate`(SI1000), 용량=bytes→`formatBytes`(IEC) 혼동 금지([[fe-traffic-bps-not-bytes]] 메모리).
- **툴팁 카드밖**: 위젯 카드 overflow에 잘리던 ECharts 툴팁을 `tooltip.appendToBody:true`로 `document.body` 렌더(시계열·파이). 공용 훅 `useHandelChartAction`은 미변경(타 화면 회귀 방지), `CustomItemChartPreview` 머지 지점에서만.
- **호스트그룹 테이블 너비**: `HostGroupTableView` 그룹명 컬럼 width 미지정→잔여공간 독식. `width:240` + ellipsis(훅 기본)로 당김.

---

## 교훈
1. **Zabbix `search`는 substring(LIKE)**. `vfs.fs.dependent[`로 검색하면 `vfs.fs.dependent.size[`가 안 잡힌다(`.size` 때문). 키 계열을 누락 없이 보려면 대괄호 없는 prefix로 넓게 조회 후 정확매칭. (디스크 dependent 누락의 근본 원인.)
2. **"살아있나"의 지표는 환경 데이터·보안 제약으로 갈린다**. ping은 자빅스 커버리지가 낮으면 BE 직접이 답, agent는 포트 probe가 Server 제한에 막혀 자빅스 값이 답. 통일하려는 유혹을 데이터로 기각.
3. **OS 명령 출력 charset**: 한글 Windows는 CP949. ProcessBuilder 출력 UTF-8 하드코딩 금물 → `Charset.defaultCharset()`.
4. **단위가 섞이는 차트는 입력에서 막아라**: 한 차트 한 단위를 select 단계에서 강제하면 표시 로직이 단순해진다.

## 열린 항목
- 🔴 **:3000 재기동 대기** — 라이브체크 포함 최신 jar(`moveseye-be-spring/build/libs/moveseye-be-0.0.1.jar`)로 사용자가 :3000 재기동해야 UI 동작(FE 아직 :3000 Nest 연결, [[be-dual-maintenance]]).
- ping 커버리지: 자빅스 icmpping은 4/40대뿐 — 직접 쏘기로 우회했으나, 전수 ICMP 모니터링을 원하면 자빅스 설정 별도.
- 운영(리눅스) ping 바이너리/권한 가정 — 배포 환경에서 1회 확인 필요.
