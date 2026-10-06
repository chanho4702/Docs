요약: A22·A23·A24·A25·A26은 코드와 계약이 대체로 일치하며 닫혔습니다.  
A28은 장기 조회의 최근 30분에서 HTTP `DEGRADED` 판정이 `UP`으로 바뀌는 결함이 남아 있습니다.  
테스트는 실행하지 않았으며, A27/A29의 `afterCommit` 테스트는 실제 지연 실행·롤백을 충분히 검증하지 못합니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | [ApmAvailabilityService.java](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/status/ApmAvailabilityService.java:175) | 승격 조회의 최근 30분 보정이 `receivedCells`만 M1으로 합치고, HTTP `serviceCells`는 상위 롤업(`res`)만 읽는다. | 장기 창의 꼬리에 수신은 있으나 오류율/p95가 임계를 넘으면, `http`이 비어 `statusOf()`가 `UP`을 반환한다. 즉 실제 `DEGRADED`가 `UP`으로 표시된다. | M1 꼬리의 HTTP 집계도 같은 원점(cell index)으로 합치도록 `serviceCells`에 origin/from 분리 조회를 추가하고, M5/H1 꼬리의 오류율·p95 `DEGRADED` 회귀 테스트를 추가. |
| 2 | 🟡 | [ApmServiceDeleteTest.java](C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/service/list/ApmServiceDeleteTest.java:52) | “커밋 후” 테스트가 트랜잭션 동기화 없이 `delete()`를 호출한다. | 이 경로는 `isSynchronizationActive()==false`인 즉시 실행 폴백만 검증한다. 실제 트랜잭션에서는 커밋 전 `clearCache()`가 호출되지 않고 롤백 시에도 호출되지 않아야 하는 핵심을 못 잡는다. | `TransactionSynchronizationManager`를 사용해 커밋 전/커밋 후/롤백 세 경우를 검증. 비트랜잭션 폴백 테스트는 별도로 유지. |
| 3 | 🟡 | [ApmSettingServiceTest.java](C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingServiceTest.java:157) | A29 롤백 테스트는 저장소 mock의 변경을 실제로 롤백하지 않는다. | 동기화 훅 등록과 캐시 유지 자체는 검증하지만, DB 값이 되돌아간 뒤 stale cache가 남지 않는 실제 트랜잭션 조합은 검증하지 못한다. | 가능하면 Spring transaction/DB 기반 테스트로 rollback 후 DB·캐시 값을 함께 검증. 최소한 현재 mock 테스트의 한계를 명시. |
| 4 | 🟡 | [_workspace/contract_apm-read-api.md](../06-API-%EA%B3%84%EC%95%BD/APM-%EC%9D%BD%EA%B8%B0-API-%EA%B3%84%EC%95%BD-P1-%282026-08-31-%EC%98%A4%EC%BC%80%EC%8A%A4%ED%8A%B8%EB%A0%88%EC%9D%B4%ED%84%B0-%ED%99%95%EC%A0%95%EB%B3%B8%29.md) | 문서는 `availability24hPct`가 `STALE·DOWN` 외 비율이며 availability 시계열에서 파생된다고 적지만, 구현은 M1 수신 여부만으로 별도 계산한다. | 수집기가 조용한 `UNKNOWN`도 수신 없음으로 분자를 잃는다. 또한 A28의 `status` 생략 칸과 “시계열에서 파생” 문구도 구현과 맞지 않는다. | 계약을 실제 정의로 정정하거나, 의도한 정의가 문서라면 `pct24h()` 구현을 변경. 이번 커밋에서는 적어도 계약의 계산 정의를 명확히 확정해야 한다. |

### 요청서 §2 항목별 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| A22 | 닫힘 | `forService()`와 `targetsOf()`가 활성 서비스별 규칙만 전역을 덮는 동일 술어를 사용한다. evaluate·sync·resync는 모두 `targetsOf()` 경유다. preview는 저장 규칙의 적용 대상을 계산하는 기능이 아니라 요청값 시뮬레이션이라 같은 술어 적용 대상이 아니다. |
| A23 | 닫힘 | 개요의 `recentAlerts`가 `ApmAlertKinds.toWire()` 및 `unitOf()`를 적용하고 표본·단위 테스트도 갱신됐다. |
| A24 | 닫힘 | `unit=s`에서 `pool_s`를 선택하고, 적재 family label·`isCanonical()`·`isMillis()` 경로가 분리되어 기존 `pool_ms` 벡터와 섞이지 않는다. |
| A25 | 닫힘 | `hashBare()`로 APM 저장 경로를 명시화했고, `matches()`는 64/71자 형식을 모두 상수시간 비교한다. |
| A26 | 닫힘 | 컨트롤러가 독립 `from`/`to`를 전달하며, 한쪽 경계만 있을 때 기본 1시간 창을 만들지 않는다. |
| A27 | 미흡 | 구현의 비트랜잭션 폴백은 안전하지만, 테스트가 실제 `afterCommit` 지연·롤백을 검증하지 않는다. |
| A28 | 미흡 | 보존 승격·`status` 생략·수신 꼬리 보정은 구현됐으나, HTTP `DEGRADED` 판정의 꼬리 보정이 빠졌다. 가용성 % 계약 문구도 구현과 불일치한다. |
| A29 | 미흡 | `afterCommit` 분기와 응답의 DB 행 기반 조립은 맞지만, 롤백 테스트가 실제 저장소 롤백을 재현하지 않는다. |

커밋 전 반드시 고쳐야 할 것:

- [ ] A28: 최근 30분 M1 보정에 HTTP 집계까지 포함해 `DEGRADED → UP` 오판을 제거.
- [ ] A28: 장기 창 꼬리에서 오류율 또는 p95가 임계를 넘는 회귀 테스트 추가.
- [ ] A27: 실제 트랜잭션의 커밋 전·커밋 후·롤백 캐시 무효화 테스트 추가.
- [ ] 계약의 `availability24hPct` 계산 정의를 코드와 일치시키기.
