# 검수 요청: /hosts/hostgroup-problems 경량 스캔 전환 (2026-08-24)

> BE `moveseye-be-spring` 워킹트리(미커밋), 브랜치 `ZM-79` / 선행: `c60f0ad`·`8038bfa`(이벤트 이력 재설계, `review_event-history-redesign.md` 재검수 "커밋 가능")

## 범위

그룹별 현황 패널 API(`GET /hosts/hostgroup-problems`)가 30일 5.5초, 90일 Zabbix 500이던 것을
이벤트 이력과 같은 처방(경량 출력)으로 전환. 변경 파일 3개:

| 파일 | 변경 |
|---|---|
| `engine-api/.../AlertHistoryQuery.java` | 팩토리 `ofWindowEntitiesForScan(range, limit)` 신설 — 경량 출력 + 엔티티 조인 + onsetOnly. `lightOutput` javadoc 완화(entities 조합 허용 — 비용 지배항은 extend 필드) |
| `src/.../host/HostService.java` | `getProblemsByHostGroup`의 `ofGroupWindow(null, range, true)`(extend 전량+조인) → `ofWindowEntitiesForScan(range, 50_000)`. `GROUP_PROBLEM_SCAN_LIMIT=50_000` 신설 |
| `src/test/.../HostGroupProblemScanTest.java` | 신규 — 그룹별 집계 정합(다중 그룹 소속 호스트 양쪽 카운트) + 질의 형태(경량·조인·조치X·상한) 검증 |

## 의도

- 이 EP는 **집계 전용**(사건별 심각도 + 걸린 호스트만 필요) — 상세 필드(extend)가 전혀 필요 없다.
  이력 화면과 달리 하이드레이션 단계 자체가 불필요.
- 호스트 귀속 때문에 `selectHosts` 조인은 유지 — **직접 Zabbix 측정으로 조인이 싸다는 것을 확인**:
  30일 3,915건 light 0.22초 vs light+selectHosts 0.34초, 90일 22,832건 light+조인 1.00초(6MB).
  비용 지배항은 extend 필드였다.
- 버린 대안: 그룹별 N콜(30콜 RTT 누적) / objectid→trigger 2단 조회(어댑터 수술 필요, 조인이 싸서 불필요).

## 중점 확인 요청 (불안한 지점)

1. 🟡 `ofGroupWindow`를 쓰는 다른 소비자 3곳(리포트 알람 집계 `ReportService:195`, 그룹 상세 `HostService:1120`)은
   **의도적으로 미전환** — 각자 응답 소비 형태가 달라 이번 범위 밖. 이 판단이 맞는지.
2. 🟡 `GROUP_PROBLEM_SCAN_LIMIT=50_000` — 도달하면 집계가 하한값이 되는데(조용한 절단과 같은 성격)
   주석으로만 남김. 관측(로그) 없이 괜찮은지.
3. 🟡 `lightOutput` + `includeEntities` 조합 허용으로 javadoc 원칙을 완화 — 계약 의미가 흐려지지 않는지.
4. 🟢 keyword/정렬/페이지네이션은 기존 그대로(집계 후 메모리) — 로직 무변경.

## 검증 현황

- ✅ 전 모듈 테스트 1110/1110 green
- ✅ dev 실측(깨끗한 재빌드 후): 30일 5.5초 → **0.55~0.90초**(집계 합 3,677 동일), 90일 500 → **1.96초·17,521건**
- ⚠️ 측정 중 교훈: 중간에 8.4초·500이 재현됐는데 **깨진 런타임**(테스트/기동 경합으로 증분 빌드 오염,
  `NoClassDefFoundError: HostInclude`) 탓이었다 — clean 재빌드 후 정상. 코드 문제 아님.
- ℹ️ 부수 관찰: 이력 화면(`show=HISTORY`)은 90일 창에서 상한 20,000에 걸림(실제 22,832) — 기본 창이
  30일이라 실사용 영향 낮고, 문서화된 폭주 방지 상한. 별도 판단 대상.

## 검수 결과

### 1. `ofGroupWindow`의 다른 소비자 영향 — 🟢

새 factory만 `HostService.getProblemsByHostGroup`에서 사용한다([HostService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:382)~390). 기존 `ofGroupWindow`의 리포트 소비자는 엔티티 이름으로 Top host를 집계해야 하므로 계속 `includeEntities=true`([ReportService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/report/ReportService.java:195)~213)를 쓰고, 그룹 상세의 alert-trend 버킷 집계는 계속 조인 없이 `false`([HostService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:1127)~1137)를 쓴다. 기존 factory의 구현도 변경되지 않았다([AlertHistoryQuery.java](C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/alert/AlertHistoryQuery.java:124)~127).

### 2. `GROUP_PROBLEM_SCAN_LIMIT=50_000`의 무표시 절단 — 🔴

집계 API의 기존 의미는 기간 내 발생 사건 전체 집계였으나, 새 호출은 50,000건에서 멈춘다([HostService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:382)~400). 어댑터는 `clock DESC` 뒤에 그대로 `limit`을 전달하므로([ZabbixAlertAdapter.java](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/ZabbixAlertAdapter.java:424)~429) 상한 초과 시 오래된 사건이 조용히 빠지고 각 그룹·severity 합계가 실제값보다 작아진다. 코드 주석의 “하한값” 표기([HostService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:362)~365)와 테스트의 limit 전달 확인([HostGroupProblemScanTest.java](C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/host/HostGroupProblemScanTest.java:101)~109)만으로는 소비자나 운영자가 절단을 알 수 없다. 전체를 페이지/구간 분할해 집계하거나, 최소한 응답 계약에 절단 여부를 명시해야 한다. 관측 로그만으로는 응답 값의 과소계산을 해결하지 못한다.

### 3. `lightOutput + includeEntities` 계약과 실제 소비 필드 — 🟢

새 factory는 `lightOutput=true`, `includeEntities=true`, `includeActions=false`, `onsetOnly=true`를 정확히 구성한다([AlertHistoryQuery.java](C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/alert/AlertHistoryQuery.java:150)~153). 어댑터는 경량 필드에 `severity`를 포함하고([ZabbixAlertAdapter.java](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/ZabbixAlertAdapter.java:71)~72), `selectHosts(hostid,name)`를 추가한다([ZabbixAlertAdapter.java](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/ZabbixAlertAdapter.java:417)~435). 실제 집계는 `event.entities()`의 host id와 `event.severity()`만 사용한다([HostService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:395)~403) — 누락된 Alert 필드는 없다. javadoc의 조합 허용 설명도 구현과 일치한다([AlertHistoryQuery.java](C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/alert/AlertHistoryQuery.java:49)~53).

### 4. keyword·정렬·페이지 및 메모리 동작 — 🟢

정렬, keyword 필터, total 산출, `skip/limit` 페이지 처리는 기존과 동일한 위치·순서로 남아 있다([HostService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:420)~436). 새 경량 Alert가 이 경로에서 필요한 필드를 바꾸지 않으므로 해당 동작의 회귀는 확인되지 않았다. 입력 건수는 오히려 50,000으로 제한돼 기존 무제한 결과보다 메모리 상한은 생긴다(단, 그 정확성 문제는 2번과 같음).

### 추가 확인

`HostGroupProblemScanTest`는 다중 그룹 소속 호스트의 중복 귀속 및 새 query 플래그를 검증한다([HostGroupProblemScanTest.java](C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/host/HostGroupProblemScanTest.java:71)~109). 다만 상한 도달 시의 절단 의미는 검증하지 않는다. 대상 테스트 실행은 Gradle wrapper가 배포본을 내려받는 단계에서 sandbox 네트워크 권한 거부로 실행하지 못했다.

종합: 수정 필요

## 반영 내역 (Claude, 2026-08-24)

- [x] **🔴 #2 상한 절단** — `GROUP_PROBLEM_SCAN_LIMIT=50_000` 제거, 무제한(limit=0)으로 전환.
  근거: 이 응답의 계약은 "기간 내 전체 집계"이고 종전 구현도 무제한이었다 — 폭주의 원인은 건수가
  아니라 extend 출력 무게(경량 22,832건 = 1.0초·6MB 직접 실측). 대신 100,000건 이상이면 warn 로그
  (`GROUP_PROBLEM_SCAN_WARN_THRESHOLD`)로 운영 신호만 남긴다. 테스트도 `limit=0` 검증으로 갱신.
- 참고: HostService에 `@Slf4j` 추가(기존 로거 부재).

## 재검수 결과 (Codex)

### 1. 🔴 #2 상한 절단 해소 — 🟢

`getProblemsByHostGroup`가 `ofWindowEntitiesForScan(..., 0)`을 호출하도록 바뀌어 50,000건 상한은 제거됐다. 어댑터는 `query.limit() > 0`일 때만 Zabbix `event.get` 요청에 `limit`을 넣으므로, `0`은 Zabbix 측의 `limit` 미지정(무제한)으로 처리된다. 따라서 기간 내 모든 발생 이벤트가 집계 루프에 들어가며, 종전 `ofGroupWindow(..., true)`의 전량 집계 계약과 동일하게 복원된다. 100,000건 warn은 결과를 자르지 않는 순수 운영 신호다.

### 2. 무제한 복원의 부작용 — 🟢

무제한 자체는 종전 구현에도 이미 존재했으므로 cardinality·메모리의 상한 부재가 새로 늘어난 것은 아니다. 새 경로는 동일한 `selectHosts`를 유지하되 `extend` 대신 경량 이벤트 필드만 받아 전송량과 Zabbix 직렬화 부담을 줄인다. 반환된 `Alert` 목록 전체를 메모리에 보관하는 구조는 그대로지만, 이는 정확한 전체 집계에 필요한 종전 비용이며 warn으로 대량 창을 관측할 수 있다. warn은 조회 완료 후 발생하므로 보호 장치는 아니지만, 계약을 훼손하지 않는다는 이번 목적에는 적절하다.

### 3. 회귀 테스트 — 🟢

`HostGroupProblemScanTest`는 다중 그룹 귀속 집계값과 함께 새 질의의 `lightOutput`, `includeEntities`, `includeActions`, `onsetOnly`, 그리고 `limit == 0`을 검증한다. 서비스에서 유한 상한이 재도입되면 이 테스트가 실패한다. 또한 기존 `ZabbixAlertAdapterTest.listHistoryWithoutCursor`는 `limit=0`일 때 Zabbix 요청에 `limit` 키를 보내지 않음을 검증하므로 어댑터 의미도 고정돼 있다. 실제 Gradle 실행은 이 sandbox에서 Gradle 9.2.1 배포본 다운로드가 네트워크 차단되어 수행하지 못했다.

종합: 커밋 가능

---
**최종(2026-08-24)**: 재검수 "커밋 가능" → 커밋 `5b845fe`(사용자가 병행 세션 커밋 충돌 정리 후 확정, 미푸시).
