# 코덱스 검수 결과 — APM P3 2차 (2026-09-07, BE 1498082)

**판정: 수정 필요.** 합성 감시 생성·단계 수정 실패, 결과 오표시, 배치 실행 누락을 확인했습니다.  
검수 대상은 `e386e61..1498082`이며, 아래 라인은 `1498082` 기준입니다. 파일 수정·테스트 실행은 하지 않았습니다.  
엔진 경계, view/edit 분리, 롤업 트랜잭션·워터마크·대입 UPSERT, 파티션·보존 편입은 정적 검토상 규약을 지킵니다.

| # | 심각도 | 파일:라인 | 문제 | 왜 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 P1 | [ApmSyntheticZabbixMapper.java:277](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticZabbixMapper.java:277) | 모든 단계에 쓰기 불가 필드 `post_type` 전송 | Zabbix 7.0 create/update의 단계 입력 스키마에는 `post_type`이 없습니다. `posts`의 문자열/배열 타입으로 구분합니다. 따라서 생성과 `steps`를 포함한 수정이 `-32602`로 거절됩니다. [공식 검증 코드](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHttpTest.php) | 쓰기 파라미터에서 `post_type` 제거. RAW는 문자열, FORM은 name/value 배열로 전송. |
| 2 | 🔴 P1 | [ApmSyntheticZabbixMapper.java:95](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticZabbixMapper.java:95) | RAW/FORM 코드가 반대여서 본문 round-trip 손상 | 실제는 RAW=0, FORM=1인데 역으로 해석합니다. RAW 문자열은 빈 FORM Map으로, FORM 배열은 문자열로 읽힙니다. #1만 수정해도 기존 시나리오 저장 시 본문이 손상됩니다. [공식 상수](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/defines.inc.php) | 읽기 매핑을 바로잡고 실제 응답 형태로 RAW·FORM 각각 읽기→수정 payload 보존 검증. |
| 3 | 🔴 P1 | [ApmSyntheticService.java:879](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticService.java:879) | 다른 호스트의 동명 시나리오 결과가 충돌 | `hostid`를 조회하고도 버리고, `(metric, scenario, step)`만 Map 키로 사용합니다. 이후 상태 집계도 시나리오 이름만 사용하므로 A 호스트 장애가 B 호스트 정상값으로 덮일 수 있습니다. | 아이템 식별·그룹화·상태 조회 전체에 `hostid`를 유지. 동명 시나리오가 있는 두 호스트 회귀 사례 추가. |
| 4 | 🟡 P2 | [ApmSyntheticItemCatalog.java:78](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticItemCatalog.java:78) | `web.test.error`를 `history=4`로 조회 | 실제 아이템 타입은 **Character**, 즉 `history=1`입니다. 정상적인 오류 이력이 있어도 빈 결과가 되어 원문·실패 원인 분류가 사라집니다. [공식 아이템 규칙](https://www.zabbix.com/documentation/7.0/en/manual/web_monitoring/items) | 해당 history 타입을 1로 수정하거나 아이템의 실제 `value_type` 사용. mock에서도 history 타입 검증. |
| 5 | 🔴 P1 | [ApmSyntheticService.java:900](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticService.java:900), [394](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticService.java:394) | 조회 상한으로 최근 이력이 잘려도 정상 통계처럼 반환 | ASC 조회에 공통 기본 상한 100,000건이 적용됩니다. 1분 주기 70개 시나리오의 24시간 실패 아이템만으로 상한을 넘습니다. 오래된 점만 남아 최신 상태·가용성이 왜곡됩니다. `truncated` 계산에는 fail/error 점이 빠지고, 캘린더에는 절단 정보가 없습니다. | 시간창 분할/페이지 처리, 최신 상태 별도 조회, 모든 계열의 절단 여부 전파. API 절단과 실제 수집 누락을 구분. |
| 6 | 🔴 P1 | [ApmJobRollupStep.java:85](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/job/rollup/ApmJobRollupStep.java:85) | 완료 후 도착하는 장시간 배치 실행이 영구 누락 | 스팬은 종료 후 들어오지만 `start_ts`가 최근 재처리 창에 있어야 집계됩니다. 다른 트래픽으로 워터마크가 전진하는 환경에서 **30분짜리 잡도** 완료 시 시작 버킷이 창 밖입니다. 문서의 “하루보다 긴 배치”에 한정되지 않습니다. | 완료·수신 시각을 기준으로 발견하고 `(trace_id, span_id)`로 멱등 저장하는 경로 마련. 완료 후 늦게 도착하는 사례 검증. |
| 7 | 🟡 P2 | [ApmMessagingRollupStep.java:248](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/messaging/rollup/ApmMessagingRollupStep.java:248) | 무관한 PRODUCER도 소비 지연 표본으로 채택 | 링크/부모 ID와 `kind=PRODUCER`만 확인하고, 발행 측 메시징 시스템·목적지·발행 문맥은 확인하지 않습니다. 다른 비동기 작업에 대한 인과 링크도 해당 큐의 지연으로 집계될 수 있습니다. | 유효한 메시지 발행 관계를 확인하고, 대응이 불명확하면 미측정 처리. 무관한 링크·부모 음성 사례 추가. |
| 8 | 🟡 P2 | [ApmMessagingQueryService.java:200](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/messaging/ApmMessagingQueryService.java:200) | 10초 초과 지연의 p95가 큰 폭으로 과소 표시 | 기존 percentile 함수는 `+∞` 버킷에서 마지막 경계인 10초를 반환합니다. 예를 들어 1초 1건·60초 99건이면 10초가 관측 min/max 안에 있어 보정되지 않습니다. 계약의 “max를 이용한 근사”가 이 경우 작동하지 않습니다. | 지연 전용 격자 또는 상한 초과 플래그/하한값 표현 도입. 혼합 분포로 검증. |
| 9 | 🟡 P2 | [ApmSyntheticService.java:1021](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticService.java:1021) | 유효한 매크로 주기를 읽고도 수정 요청에서 거절 | Zabbix는 `delay`에 사용자 매크로를 허용합니다. 기존 `{$INTERVAL}`을 `delayRaw` 그대로 되돌리면 초 변환에 실패하여 수정이 차단됩니다. [공식 객체 계약](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/object) | 표시용 초 변환과 쓰기 유효성 검사를 분리하고 매크로 원문 보존. |
| 10 | 🟡 P2 | [ApmSyntheticService.java:809](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticService.java:809) | 프록시 그룹 호스트를 서버 직접 감시로 오표시 | `proxyid=0`만으로 서버 감시를 확정합니다. 코드도 `monitored_by=2` 구성의 오분류를 인정합니다. 지역 비교에서 다른 관측 위치를 서버로 합칩니다. | `monitored_by`·`proxy_groupid`로 분기. 그룹 상세 미지원이어도 “그룹/확인 불가”로 표시. |

**불안 4건 판정**

1. **실 Zabbix round-trip — 부적합.** #1·#2로 현재 쓰기 계약이 성립하지 않습니다. `httpstepid` 전달 경로와 기본 `web.test.*` 키 형태는 맞지만, ID 전달만으로 이력 유지까지 검증된 것은 아닙니다. 한글·쉼표·인용부호를 포함한 이름과 단계 수정 전후 아이템 ID·이력 보존은 미검증입니다. 일반 파라미터 오류는 기존 `ApiError(code:400)` 경로를 따르지만, 잘못된 `httpstepid`의 “No permissions” 응답은 기존 클라이언트에서 401로 오인될 여지가 남습니다. 정상 삭제 후 바인딩 정리는 있으나, 원격 삭제 성공 후 DB 실패에 대한 재시도 복구는 보장하지 않습니다.

2. **롤업 트랜잭션 확대 — 구조상 적합, 검출력 보완 필요.** 여섯 단계와 워터마크가 같은 트랜잭션에 있고 예외를 삼키지 않습니다. 메시징의 값 대입·lag 초기화 후 재계산, 배치의 자연키 UPSERT도 맞습니다. 다만 새 단계 실패를 주입하여 기존 네 집계와 워터마크까지 롤백되는지 확인하는 테스트는 부족합니다. 장애 영향 범위 확대는 수용 가능한 설계 선택이지만 #6의 늦은 도착 누락과는 별개입니다.

3. **소비 지연 근사·lookback·격자 — 조건부 부적합.** 첫 링크만 선택하는 근사는 명시돼 있으나 #7·#8은 추가 보정이 필요합니다. 또한 lookback은 소비 시각이 아니라 **처리 창 시작−1시간**이므로 처리 창 크기에 따라 같은 표본의 포함 여부가 달라집니다. 개별 소비 기준 시간 제한을 두고, 미측정 비율과 상한 초과 여부를 응답에 드러내야 합니다.

4. **허용목록 비소급·프록시 그룹 — 분리 판정.** `job.*`, `messaging.operation.type`, 구 `messaging.destination` 별칭 편입과 새 키 우선 처리는 적합합니다. 이미 버려진 속성이 복원되지 않는 비소급성도 정상적인 한계입니다. 반면 프록시 그룹을 서버로 확정하는 #10은 오표시입니다. 참고로 `proxies()`에서는 `monitored_by`를 이미 요청하므로 “미조회”라는 설명도 경로 전체에 일관되지 않습니다.

엔진 계약은 Zabbix 전용 영역에 있으며 raw 전달을 유지합니다. app의 `engine-zabbix` 컴파일 의존은 추가되지 않았고, 수정·삭제 대상을 식별자로 지정하여 D9~D11 경계도 지킵니다. 권한 축과 메시징 파티션·보존, 배치 보존 편입에서도 새 결함은 발견하지 못했습니다.

**다음 커밋 전 반드시 고칠 것**

- **#1·#2·#3·#5·#6 해결.** 쓰기 실패·본문 손상·호스트 간 결과 혼합·최근 이력 절단·실행 누락은 차단 사유입니다.
- **#4 수정**, #7·#8·#10의 오표시를 제거하거나 미측정·상한 초과·미지원 상태로 명확히 반환하고, #9의 매크로 round-trip을 보존하십시오.
- 가용성의 관측값 분모는 유지하되 **수집 공백과 마지막 관측의 신선도**를 별도로 표시하십시오. 현재는 23시간 전 성공 한 점만 있어도 `OK·100%`가 가능합니다.
- 테스트의 기준 데이터를 바로잡으십시오. 현재 [MapperTest.java:239](/C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/synthetic/ApmSyntheticZabbixMapperTest.java:239)는 잘못된 `post_type=1`을 RAW 정답으로 고정합니다. 실제 Zabbix 응답·허용 payload, history 타입·절단, 늦게 도착한 잡, 무관한 PRODUCER, 지연 혼합 분포, 신규 단계 실패 시 전체 롤백을 검출해야 합니다. 요청서의 green 건수는 작성자 보고이며 이번 검수에서는 재실행하지 않았습니다.
