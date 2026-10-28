# ZM-159 설계·감사 검수 — Codex r1

## 0. 판정 (착수 가능 여부 한 줄)

**필수 수정 8건 후 착수. 공통 유틸화 방향은 타당하지만, 현재 설계만으로는 호출 크기 제한과 결과 완전성을 보장하지 못한다.**

2026-09-17 읽기 전용 검수다. 파일 생성·수정, 빌드·테스트·서버 기동은 수행하지 않았다. BE 정본과 ZM-159 워크트리의 HEAD는 모두 `8df357d1`이다. 아래 실행 시간·메모리 사용량·장애 발생 빈도는 실측하지 않았으며, 계산이나 실행 조건에 의존하는 부분은 **추정**으로 구분했다. 권한 문제의 수정은 ZM-157 범위로 취급한다.

## 1. 감사 판정 검증 (표: ID | 판정 | 근거 파일:라인 | 정정/메모)

‘맞음’은 핵심 결함이 코드로 확인됐다는 의미이며, 감사 문서의 모든 예상 수치까지 확인했다는 뜻은 아니다.

| ID | 판정 | 근거 파일:라인 | 정정/메모 |
|---|---|---|---|
| H1 = C5 = B1 | **맞음** | [ZabbixTrendServiceImpl:23](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/trend/ZabbixTrendServiceImpl.java:23), [ResourceTrendQuery:85](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/common/metric/ResourceTrendQuery.java:85) | 전체 itemids·기간을 한 번에 전달하며 `limit`이 없다. 디스크·트래픽의 불필요한 서브키는 trend 수신 후 제거한다. **9천만 행은 모든 대상에 해당 아이템과 720개 버킷이 존재한다는 조건부 계산**이다. |
| H2 | **맞음** | [AlertHistoryQuery:118](C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/alert/AlertHistoryQuery.java:118), [ZabbixAlertAdapter:563](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/ZabbixAlertAdapter.java:563), [ReportService:195](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/report/ReportService.java:195) | `limit=0`을 Zabbix에 보내는 것이 아니라 **limit 자체를 생략**하여 무제한 조회한다. `extend`는 맞지만 `selectHosts`는 호출별로 다르다. 리포트는 켜고, 그룹 추이의 전량 집계는 끈다. 3천만 건은 해당 그룹에 전체 이벤트가 속하는 등의 가정이 필요하다. |
| H3 | **맞음** | [HostService:397](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:397) | 경량 출력이어도 기간 전체를 `List<Alert>`로 받은 다음 경고·집계한다. 페이징은 **집계 결과인 그룹 목록**에만 적용된다. 8GB는 코드 주석에 남은 과거 수치의 선형 외삽이며 이번 검수의 실측값이 아니다. |
| H4 | **맞음** | [HostService:536](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:536), [HostService:561](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:561), [HostService:664](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:664) | event 전량 조회, 중복 제거 없는 triggerids, recoveryIds 일괄 조회, 상세 목록 무페이징이 확인된다. 다만 ‘수백만 건 × 3콜’은 응답 행 수가 세 번 동일하다는 뜻으로 읽으면 틀리다. 중복 triggerids는 특히 **요청 본문**을 불필요하게 키운다. |
| H5 | **맞음** | [NetworkArchitectureService:157](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/networkmap/NetworkArchitectureService.java:157) | 호스트마다 `problemAgg(ctx, List.of(hostid))`를 순차 호출한다. 500콜은 성립하지만 50~150초는 왕복 지연을 가정한 **추정**이다. |
| H6 | **맞음** | [NetworkService:199](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/network/NetworkService.java:199), [NetworkService:225](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/network/NetworkService.java:225) | 타입×인터페이스마다 단일 메트릭 조회를 반복한다. 4타입·100인터페이스·아이템 정상 해석이면 약 800 RPC 계산은 타당하다. **48시간 이상은 history 대신 trend**를 사용하며, 1,200콜은 폴백 등 추가 조건에 의존한다. |
| H7 = B2 | **맞음** | [InterfaceService:107](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/hostinterface/InterfaceService.java:107), [ZabbixMetricAdapter:154](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapter.java:154), [ZabbixHistoryServiceImpl:38](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:38) | RAW 고정이며 value_type별 조회 전체에 기본 10만 건·clock ASC가 적용된다. 초과하면 최근 구간과 경계 시각의 일부 포트가 빠질 수 있다. 로그 경고는 있지만 호출 결과에 완전성 정보는 없다. |
| E1 | **맞음** | [EventService:494](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventService.java:494), [EventService:750](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventService.java:750), [EventProblemRepository:79](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/repository/EventProblemRepository.java:79) | 요청 기간의 사본을 엔티티로 모두 적재한 뒤 열린 상태·권한·검색 등을 거른다. **항상 30일은 아니고 요청 기간에 따른다.** 1,500만 행이나 요청 1회 OOM은 적재량·힙에 의존하는 추정이다. |
| E2 | **과장** | [EventSyncService:172](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:172), [EventSyncService:182](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:182), [EventSyncService:203](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:203) | 알람×사용자 행렬을 메모리에 생성하는 문제는 맞다. 다만 대상은 **내부 계정으로 매핑되는 Zabbix 사용자**이며 동시 접속자 수와 같지 않다. DB에는 신규·읽음 변경분만 쓴다. ‘매 5분 200만 객체’는 조건부로 맞지만, 이를 ‘하루 1억 신규 행’으로 연결할 근거는 부족하다. |
| E3 | **맞음** | [EventService:233](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventService.java:233), [EventService:248](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventService.java:248) | 최대 2만 발생 이벤트를 조회한 뒤 후속 필터·집계·페이지 구성을 한다. 잘림 메타데이터가 없다. 제한 전 필터와 제한 후 필터가 섞여 있어 단순히 정확한 전체 총계만 추가해서 해결할 수도 없다. |
| X1 | **맞음** | [OverviewCallExecutor:30](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/overview/OverviewCallExecutor.java:30), [ZabbixOverviewService:134](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/overview/ZabbixOverviewService.java:134), [ItemOverviewAggregator:51](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/overview/ItemOverviewAggregator.java:51), [AlertOverviewAggregator:56](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/overview/AlertOverviewAggregator.java:56) | **같은 풀에 부모·자식 제출이 실제 존재한다.** 작업 배치 순서에 따라 교착 조건이 성립한다. 다만 ‘관리자 3명 동시 진입이면 반드시 발생’은 정정해야 한다. 아래 조건 설명 참조. |
| X2 | **맞음** | [incrementalChartData.ts:20](C:/solutions/moveseyee_fe/src/hooks/chart/incrementalChartData.ts:20), [useHandelChartAction.ts:78](C:/solutions/moveseyee_fe/src/hooks/chart/useHandelChartAction.ts:78) | `type`만으로 합쳐 같은 시각의 다른 iface 값은 덮어쓰고, 다른 시각의 값은 섞는다. **범례 문제는 별도 원인**이다. legend에는 `type`, series.name에는 `type - iface`를 사용하므로 병합 파일만 고쳐서는 끝나지 않는다. |
| X4 | **맞음** | [ListHostGroupsTool:51](C:/solutions/moveseye-ai/src/main/java/com/dmove/moveseyeai/tool/host/ListHostGroupsTool.java:51), [BasePageDto:14](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/common/response/BasePageDto.java:14), [HostService:1410](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:1410), [HostService:1455](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:1455) | BE 기본 첫 10건만 받아 AI에서 검색한다. 목록의 알람 필드는 실제 집계가 아니라 0으로 채워져 있다. |
| X5 | **과장** | [GetGroupOverviewTool:63](C:/solutions/moveseye-ai/src/main/java/com/dmove/moveseyeai/tool/host/GetGroupOverviewTool.java:63), [GetGroupOverviewTool:105](C:/solutions/moveseye-ai/src/main/java/com/dmove/moveseyeai/tool/host/GetGroupOverviewTool.java:105), [HostService:1090](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:1090) | 상위 10개 호스트 시리즈의 표본을 그룹 대표 통계처럼 처리하는 오류는 맞다. 다만 모든 입력에서 과대 보고된다고 단정할 수 없다. 초 단위 now가 달라지면 캐시 키가 달라지지만 **같은 초의 동일 요청까지 항상 미스인 것은 아니다.** |
| X6 | **과장** | [AwsReadOnlyGateway:153](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/client/AwsReadOnlyGateway.java:153), [CloudSnapshotService:194](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/CloudSnapshotService.java:194), [AwsServiceImpl:898](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java:898) | 100개 초과 ID를 한 요청에 넣는 결함은 맞다. EC2 목록·스냅샷의 해당 리전 작업 실패로 이어질 수 있다. **그 리전의 모든 AWS 기능이 실패하는 것은 아니다.** 단일 인스턴스 조회 등은 별도 경로다. |
| C1 | **과장** | [application.yml:46](C:/solutions/moveseye-be-spring/src/main/resources/application.yml:46), [build.gradle.kts:44](C:/solutions/moveseye-be-spring/build.gradle.kts:44) | 저장소 설정에서 Hikari 풀 크기 지정은 발견하지 못했다. 외부 설정이 없으면 기본 10이지만 **운영 실효값은 미확인**이다. 동시 사용자 200명이라는 사실만으로 풀 10이 결함이거나 20이 해결책이라고 판정할 수 없다. |
| B6 = E14 | **과장** | [ZabbixUserServiceImpl:39](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/user/ZabbixUserServiceImpl.java:39), [RedisZabbixSessionStore:33](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/spi/RedisZabbixSessionStore.java:33), [RedisClientService:51](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/common/service/RedisClientService.java:51) | **60초는 Redis 캐시 TTL이며 Zabbix 세션 자체의 만료시간이 아니다.** 캐시 미스의 동시 로그인 방지와 이전 서비스 계정 세션의 자동 logout이 없는 것은 맞다. 일반 `logout()` 메서드 자체는 존재한다. |
| 기존 T-A | **맞음** | [EventSyncService:139](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:139), [EventSyncService:327](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:327), [EventSyncService:359](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:359) | 상한 밖 신규 알람 누락·미갱신 장기 장애 삭제 위험은 맞다. 그러나 **되짚기는 이미 ZM-145의 복합 커서로 전진**하므로 같은 500건 때문에 뒤쪽이 영구히 막힌다는 설명은 현재 코드와 다르다. 해소 판정도 복구 이벤트를 확인하므로 상한 도달 시 무조건 되짚기를 끌 필요는 없다. |

AWS의 명시 ID 최대 100개와 HikariCP의 기본 풀 크기 10은 공식 자료로 확인했다. [AWS DescribeInstanceStatus](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInstanceStatus.html), [HikariCP 설정](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby)

**X1의 정확한 교착 조건**

통합 요청 하나는 같은 executor에 6개 부모 작업을 제출하며, 그중 `items`·`alerts`가 다시 같은 executor에 자식을 제출하고 `join()`한다. 통합 요청 3개의 해당 부모 6개가 모든 워커를 점유하고 자식 작업들이 큐에 남는 실행 순서라면, 자식을 실행할 워커가 없어 진행이 멈춘다.

캐시 적중이나 자식의 선행 실행으로 교착을 피하는 순서도 있으므로 **동시 요청 3개는 발생 가능한 조건이지 발생 보장이 아니다.** 사용자 3명이 필요한 것도 아니며 한 사용자의 병렬 요청으로도 가능하다. 큐에서 시작하지 못한 자식에는 Zabbix HTTP timeout이 도움이 되지 않는다.

## 2. 빠진 🔴

| 추가 ID | 지적 | 근거·영향 |
|---|---|---|
| N1 — 기존 E10 상향 | **아이템 관리 API는 페이지 크기 20이어도 전체 아이템을 먼저 조회한다.** | [ZabbixItemManageService:68](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixItemManageService.java:68)에서 host/template 필터는 선택 사항이고 Zabbix `limit`은 없다. `getRaw()` 이후 94행에서 페이징한다. [요청 DTO:10](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/dto/ManagedItemListReqDto.java:10)의 ‘서비스가 limit로 제한’이라는 설명도 원격 조회에는 해당하지 않는다. 목표 규모에서는 천만 아이템의 대형 응답이 가능한 경로로, 🟠보다 🔴가 타당하다. **ID가 없는 요청이므로 ID 청크만 도입해도 방어되지 않는다.** |
| N2 — 신규 | **네트워크 SUM이 timestamp 대신 배열 인덱스로 값을 더한다.** | [NetworkService:205](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/host/network/NetworkService.java:205). 첫 두 시리즈만 합산하며 서로 다른 시각의 점도 같은 인덱스면 더한다. 예를 들어 첫 시리즈가 10:00·10:01, 둘째가 10:01·10:02라면 10:00 값에 10:01 값을 더한다. 이는 정적 코드로 확인되는 오계산이며 X2 수정 후에도 남는다. SUM 대상·단위를 정하고 timestamp로 결합해야 한다. |
| N3 — T-A 확장 | **상한 미도달이어도 동기화 중단 후 미해소 알람이 삭제될 수 있다.** | [EventSyncService:327](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:327), [EventProblemRepository:39](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/repository/EventProblemRepository.java:39). 삭제 조건은 `updatedAt` 2일 경과이며 최근 완전 동기화 성공 여부를 확인하지 않는다. 더구나 [BuiltInJobs:114](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/scheduler/BuiltInJobs.java:114)는 cleanup을 라이선스 만료 중에도 실행한다. 따라서 **수집 실패·중단·라이선스 차단 동안 cleanup이 실행되는 조건**에서도 실제 열린 알람을 지울 수 있다. 상한 도달 플래그만으로는 보호가 부족하다. |

별도로, **T-B의 제안대로 구현하면 신선도 판정이 깨지는 설계상 🔴**가 있다. 현재 `queryLatest()`는 `LatestValue.epoch`에 항상 `0L`을 넣는다. 상세는 §4에 적었다.

## 3. Q1~Q7 답변

| 질문 | 답변 | 이유·수정안 |
|---|---|---|
| **Q1. Template인가 Client인가** | **Template에 찬성, 책임 분리 보완** | `ZabbixClient`는 전송·인증 오류 매핑·연결 풀·계측을 유지하고, `ZabbixApiTemplate`이 변환·조회 정책·분할을 맡는 구성이 적절하다. 다만 요청/응답 **바이트 제한은 전송 계층에서도 집행**해야 한다. 직접 Client 접근은 Template 등 명시한 내부 경로로 제한하고 정적 검사로 유지한다. 모든 method에 동일한 자동 분할을 적용해서는 안 된다. |
| **Q2. 500개·1일 기본값** | **일괄 적용 반대, 메서드별 설정** | trend는 500 itemids×24시간이면 통상 12,000버킷으로 초기값 후보가 된다. 닫힌 끝점까지 포함하면 추가 버킷이 생길 수 있다. 반면 `item.get`의 hostids 500개는 가정상 **100만 아이템**, event 1일은 감사 가정상 **100만 이벤트**다. 입력 ID 수만으로 응답량을 제한할 수 없다. 호스트 단위 조회에는 결과 행 제한·커서·필드 제한을 함께 적용해야 한다. |
| **Q3. 잘림 A/B/C 선택** | **B에 찬성, Metric·Alert 양쪽 확장** | 요청 전체의 완전성은 개별 `Series`보다 결과 래퍼에 두는 편이 맞다. E3는 `MetricPort`가 아닌 `AlertPort.listHistory` 경로이므로 `SeriesResult`로 해결되지 않는다. `AlertHistoryResult` 또는 중립 공통 결과 타입도 필요하다. ThreadLocal 방식 C는 비동기·배치에서 누락 위험이 커 반대한다. |
| **Q4. S0와 S1을 같은 이슈에 둘 것인가** | **같은 상위 이슈는 가능, 구현·커밋은 분리** | 유틸 추출과 조회 의미 변경을 동시에 하면 회귀 원인을 분리하기 어렵다. 먼저 무동작 변경 추출을 검증하고, 다음 커밋부터 상한·분할을 적용한다. 26파일 전체 이행을 첫 보호 경로 구현의 선행 조건으로 만들 필요는 없다. |
| **Q5. Lombok 범위·설정** | **신규 코드 중심 찬성, 기존 생성자 일괄 치환 반대** | 단순 생성자·getter는 치환할 수 있지만 사용자 정의 초기화·주입 annotation·JSON 명명 규칙을 보존해야 한다. `lombok.config`는 BE 저장소 루트에 범위를 한정하고 `config.stopBubbling=true`, `lombok.addLombokGeneratedAnnotation=true` 정도를 권고한다. `copyableAnnotations`는 필요한 `@Qualifier` 등만 근거를 확인해 추가한다. 세부 함정은 §4 참조. |
| **Q6. 과장·오판·누락** | **핵심 위험은 대체로 맞음, 정정 필요** | 특히 E2의 객체 생성과 DB 쓰기량 구분, C1의 기본값과 운영 실효값 구분, B6의 캐시 TTL과 세션 만료 구분, X1의 조건부 발생, T-A의 기존 진행 커서를 반영해야 한다. 추가 🔴는 §2와 같다. |
| **Q7. S3 범위** | **재분류 권고** | H5·H6은 호출 방어와 밀접하지만 안전한 하위 배치 조회가 준비된 뒤 적용한다. X1·X2·X6은 독립 결함 수정으로 분리한다. S2 캐시 권한 수정은 사용자 지시대로 ZM-157로 넘긴다. C1 풀 증설은 별도 용량 검증 이슈다. T-A는 완전성 기반 삭제 보호까지 포함해야 하며, T-B는 epoch 선행 보완 없이 착수하면 안 된다. |

Lombok 설정의 상속 범위와 annotation 복사 기능은 공식 설명에 따른다. [Lombok configuration](https://projectlombok.org/features/configuration), [생성자 annotation](https://projectlombok.org/features/constructor)

## 4. 설계 추가 지적 (🔴/🟡/🟢, 근거)

**🔴 4-1. 현재 네 클래스의 API만으로는 전체 호출부를 옮기기에 부족하다.**

[설계:51](C:/solutions/_workspace/features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md:51)의 메서드들은 `List`를 반환하지만, 67행은 `ZabbixListResult`를 반환한다고 설명한다. **동일한 메서드 시그니처로 두 계약을 동시에 제공할 수 없다.** 호환용 `list()`와 메타데이터를 보존하는 신규 메서드를 명확히 나눠야 한다.

| 필요한 보완 | 현재 코드의 사례·이유 |
|---|---|
| 일반 결과 변환 `<T> T call(..., TypeReference<T>)` 또는 동등한 기능 | `user.login`은 사용자 객체, `role.create`·`token.create`는 ID 목록을 가진 객체다. `firstId()`만으로는 결과 계약을 모두 보존하지 못한다. |
| 정책을 통과하는 `JsonNode` 반환/전용 decoder | [ZabbixHistoryPushImpl:49](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryPushImpl.java:49)는 객체 내부 `data[]`의 **행별 성공·실패와 요청 순서**를 보존한다. `exec()`로 바꾸면 실패 정보가 사라진다. |
| 객체형 Map·스칼라·키 보존 응답 지원 | [ZabbixScriptServiceImpl:31](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/script/ZabbixScriptServiceImpl.java:31)의 `getscriptsbyhosts`, 63행의 `script.execute`는 객체형 결과다. [ZabbixHealthAdapter:73](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/health/ZabbixHealthAdapter.java:73)의 `apiinfo.version`은 문자열이다. `preservekeys` 응답도 배열로 단정하면 안 된다. |
| `get` 이외의 연산 지원과 분할 정책 구분 | `host.massadd/massremove`, `event.acknowledge`, `task.create`, `token.generate`, `history.push`, `script.execute`, 로그인·logout이 있다. `Object params`와 `exec`는 일부를 담을 수 있지만 **재시도·부분 성공·분할 가능성까지 정의된 것은 아니다.** |
| typed 분할 결과와 소비형 순회 API | 현재 청크·기간 메서드는 `List<Map<...>>`만 반환한다. typed 변환 경로와 `scan(..., pageConsumer)`/누적기 등이 필요하다. H3의 스트리밍 누적을 전체 `List` 반환만으로 구현할 수 없다. |

`ZabbixParams`에는 최소한 기존 Map 복제, 임의 키 설정·제거, `output="extend"`와 필드 배열, `select*`, `sortfield/sortorder`, `countOutput`, `searchByAny` 등 기존 파라미터를 손실 없이 표현하는 수단이 필요하다.

**특히 `putIfNotEmpty("hostids", empty)`의 의미를 분리해야 한다.** 선택 필터가 없다는 의미와, 대상 계산 결과가 0개라는 의미는 다르다. 후자는 원격 호출 0회로 종료해야 한다. 필터를 생략하고 전체를 조회해서는 안 된다.

**🔴 4-2. ‘ID 청크×기간 창’은 응답 크기 보장이 아니다.**

현재 [ZabbixClient:123](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:123)는 응답 전체를 `JsonNode`로 만든다. 그 뒤 rows 수를 확인해도 이미 발생한 메모리 사용을 막지 못한다.

설계에는 다음 세 종류의 제한을 구분해야 한다.

- **개별 RPC:** ID 수, 요청 바이트, 반환 행 수, 응답 바이트, 허용 `select*` 확장.
- **논리 조회 전체:** 총 수신 행·보유 행·RPC 수·전체 처리 시간.
- **서비스 전체:** 동시 실행·대기 요청 수와 과부하 시 처리 정책.

`host.get limit=500`이라도 각 호스트에 `selectItems`가 붙으면 내부 아이템 수는 제한되지 않는다. 분할 결과를 전부 합치면 H1의 9천만 행이 여러 번에 나뉘어 **결국 같은 메모리에 쌓인다.**

따라서 `ZabbixCallLimits`에 적힌 네 값만으로는 부족하다. §4에만 등장하는 `history-total-limit`도 정식 설정·적용 위치·중단 결과를 정의해야 한다. 응답 바이트 제한으로 BE를 보호하더라도 Zabbix가 대형 응답을 생성하는 부하까지 없어지는 것은 아니므로, 조회 스코프와 출력 제한도 필요하다.

**🔴 4-3. ID 분할은 결과 집합이 겹칠 수 있다.**

설계의 **“id 분할은 겹침 없음”은 틀림**이다.

- 중복 입력 ID를 우선 제거해야 한다.
- `eventids`처럼 결과의 고유 ID를 나누는 경우는 배타적으로 만들 수 있다.
- `hostids`·`groupids`는 조회 필터다. 다중 호스트 트리거의 이벤트나 다중 그룹 호스트는 서로 다른 청크에서 재등장할 수 있다.
- 따라서 목록은 결과 고유 키로 병합하고, **`countChunked` 단순 합산은 결과 집합이 배타적임을 보장하는 경우에만** 허용해야 한다. 스칼라 count를 받은 뒤에는 중복을 제거할 수 없다.

기존 [ZabbixAlertAdapter:148](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/ZabbixAlertAdapter.java:148)의 objectids 합산은 알람의 objectid가 하나라는 근거가 있다. 이를 다른 ID 축으로 일반화하면 안 된다.

또한 청크 순서대로 이어 붙이는 것은 **전역 정렬 보장**이 아니다. 전역 상위 N개가 계약이라면 정렬 기준·동점 기준·전체 limit을 기준으로 병합해야 한다.

**🔴 4-4. 기간 경계·커서·정렬을 실행 가능한 규칙으로 확정해야 한다.**

Zabbix 7.0의 `time_from`과 `time_till`은 양 끝을 포함한다. 따라서 내부 `[a,b)`는 초 단위 API에 **`time_from=a, time_till=b-1`**로 전달해야 한다. 마지막 창만 원래 `to`를 포함한다. `from>to`, `from==to`, 창 크기 0 이하, 덧셈 overflow도 정의해야 한다. [event.get](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/event/get), [trend.get](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trend/get)

기간만 계속 나누는 방식은 **같은 1초에 limit 이상의 행이 있는 경우** 더 이상 전진할 수 없다.

- 이벤트는 `eventid` 정렬·커서를 사용하고, inclusive 경계에서는 마지막 ID의 다음 값부터 진행한다. ID 증가는 정수 범위를 고려해야 한다.
- history는 같은 초의 여러 샘플을 보존하려면 `(itemid, clock, ns)`를 다뤄야 한다. 현재 [HistoryService:55](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:55)는 `ns`를 버린다. 중복 제거를 `(itemid, clock)`만으로 수행하면 정상 샘플을 잃는다.
- 해당 API가 필요한 커서를 지원하지 않으면 ID 추가 분할 또는 명시적 불완전 결과로 종료해야 한다. 같은 요청을 무한 재시도하면 안 된다.

Zabbix history의 정렬 필드는 `itemid`, `clock`, `ns`다. 반면 `trend.get`에는 일반적인 `sortfield` 파라미터가 문서화되어 있지 않으므로 공통 유틸이 무조건 추가하면 안 된다. [history.get](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/history/get)

**🟡 4-5. trend의 정시 버킷 가정은 대체로 맞지만, 안전성 설명이 부족하다.**

trend가 숫자형 데이터의 시간별 집계라는 전제는 타당하다. 그러나 다음은 별개다.

- 내부 창 경계를 정시에 맞추더라도 **원래 요청의 시작·끝을 임의로 확대해서는 안 된다.**
- 현재 시간대 데이터는 메모리의 trend cache에 남거나 나중에 DB에 반영될 수 있다. ‘빈 결과’가 곧 해당 시간대의 확정적 무데이터는 아니다.
- 순차 조회 전체가 하나의 시점에 고정된 snapshot은 아니다.
- 정렬과 중복 처리 키는 명시해야 하며, 현재 시간 버킷을 영구 캐시하면 안 된다.

Zabbix 공식 설명도 이전 시간대 trend가 다음 시간대에 flush되며 표시 지연이 생길 수 있음을 명시한다. [History and trends](https://www.zabbix.com/documentation/7.0/en/manual/config/items/history_and_trends)

**🔴 4-6. `size >= limit`은 ‘잘림 확정’이 아니라 ‘상한 도달’이다.**

| 상황 | 현재 규칙의 문제 |
|---|---|
| 실제 결과가 정확히 limit개 | **거짓 양성**: 빠진 행이 없어도 truncated=true |
| 꽉 찬 페이지 다음 페이지까지 모두 읽음 | 페이지별 OR를 유지하면 최종 완전 결과도 truncated=true |
| Zabbix 반환 후 변환·필터·중복 제거를 거친 size로 검사 | **거짓 음성 가능**: 원격 상한에 닿았어도 최종 size는 작음 |
| 전체 행·시간·호출 예산 초과 또는 중간 청크 실패 | 각 청크가 limit 미만이어도 전체는 불완전 |
| 무제한을 뜻하는 limit 0을 그대로 비교 | 빈 결과도 `0 >= 0`으로 상한 도달 처리 |
| 의도적인 최신 N건 조회 | 정상적인 top-N 계약과 불완전 수집을 혼동 |

내부에서는 `capReached`와 최종 `complete`를 분리하는 편이 안전하다. 필요한 경우 `limit+1` 조회로 추가 행의 존재를 확인하되, 이것도 **전체 순회 완료 여부나 부분 실패**를 대신하지는 못한다.

최소한 `complete`, 사유, 요청/실제 처리 범위가 필요하다. E3의 전체 총계를 확정하지 못했다면 부분 집합 크기를 정확한 total처럼 내려주면 안 된다.

**🔴 4-7. 잘림 전달은 포트부터 FE까지 이어져야 한다.**

E3는 [AlertPort 위임:65](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/license/integration/LicenseGuardedAlertPort.java:65), H7은 [MetricPort 위임:60](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/license/integration/LicenseGuardedMetricPort.java:60) 경로다. 중립 결과 계약은 `engine-api`에 두고 Zabbix 내부 타입을 app에 노출하지 않아야 한다.

기존 List 메서드가 새 메서드에 위임한 뒤 rows만 꺼내면 잘림은 계속 사라진다. **새로 상한을 적용하는 소비자는 함께 이행하거나, 불완전 시 명시적으로 실패**해야 한다.

또한 FE [useIncrementalChartData:115](C:/solutions/moveseyee_fe/src/hooks/chart/useIncrementalChartData.ts:115)는 `coverage==="COMPLETE"`만 병합하고 이후 커서를 전진시킨다. 기존 COMPLETE·`nextKnownThrough`·`hasMore`와 새 완전성 정보의 관계를 정의하지 않으면 누락 구간을 완료 처리하거나 부분 결과를 계속 버릴 수 있다.

**🔴 4-8. T-B의 `LatestValue.epoch` 활용에는 선행 수정이 필요하다.**

[ZabbixMetricAdapter:191](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapter.java:191)는 epoch를 **항상 `0L`**로 만든다. `ITEM_OUTPUT`에는 `lastclock`이 없고 [ZabbixBasicItem:8](C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/zabbix/item/model/ZabbixBasicItem.java:8)에도 해당 필드가 없다.

따라서 티켓의 권고를 그대로 적용하면 모든 후보가 오래된 데이터로 판정된다. 다음을 선행 조건으로 넣어야 한다.

- 선택한 CPU 아이템의 실제 `lastclock` 조회·모델 매핑.
- CPU 키 폴백, 미수집·비활성·unsupported·timestamp 부재의 판정.
- CPU 신선도와 메모리 등 후속 품질 게이트의 관계.
- 후보 ID 제한과 선택 메트릭 조회를 모두 적용하여 전체 아이템 조회 제거.

티켓의 ‘목록 표시만 바뀌고 시계열 결과는 같다’ 역시 현재 코드만으로 보장되지 않는다.

**🟡 4-9. Lombok·Spring Boot·Jackson의 적용 조건**

- `@Value @Builder`에서는 Builder가 요구하는 package-private 전체 인자 생성자가 우선한다. 기존 public 생성자 호출과 호환된다고 가정하면 안 된다. [Lombok @Value](https://projectlombok.org/features/Value)
- `@Value`는 필드 참조를 final로 만들 뿐, `Map` 등 내부 객체까지 깊게 불변으로 만들지 않는다.
- `@Singular`의 복수형 메서드는 **교체가 아니라 추가**다. `rows(a).rows(b)`는 누적되며, 생성된 목록은 수정 불가다. null 컬렉션 처리와 대량 결과의 추가 복사 비용도 고려해야 한다. 필드 초기값을 Builder에서 유지하려면 해당 경우 `@Builder.Default`가 필요하다. [Lombok @Builder](https://projectlombok.org/features/Builder)
- 내부 결과가 직렬화만 필요하면 `@Jacksonized`가 필수는 아니다. Jackson 2로 역직렬화하거나 Redis에서 복원한다면 `@Jacksonized` 또는 명시적 creator를 사용한다. `@Value @Builder`만으로 Builder 역직렬화가 설정되지는 않는다. [Lombok @Jacksonized](https://projectlombok.org/features/experimental/Jacksonized)
- `@ConfigurationProperties`+`@Data`의 JavaBean 바인딩은 가능하다. 현재 [MoveseyeApplication:10](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/MoveseyeApplication.java:10)에 scan도 있다. 그러나 `@Validated`만 붙이고 제약 annotation을 생략하면 양수 검증이 생기지 않는다. `@Min`/`@Positive`, 상한 간 관계 검증, 중첩 설정의 `@Valid`가 필요하다. [Spring Boot 3.3 설정 검증](https://docs.spring.io/spring-boot/3.3/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.validation)
- 수동 생성자 치환 시 `@Qualifier`·Spring `@Value` 및 초기화 로직을 점검해야 한다. 특히 [ZabbixClient:39](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:39)는 설정 주입과 HTTP client 구성을 수행하는 생성자다.
- 기존 boolean JSON 키는 [CLAUDE.md:266](C:/solutions/moveseye-be-spring/CLAUDE.md:266)의 `isXxx` 함정을 재확인한다. `truncated` 자체는 문제가 없지만 기존 getter를 일괄 치환하면 다른 DTO가 변할 수 있다.

**🟡 4-10. §4 사이드 이펙트 표에 추가할 항목**

| 빠진 영향 | 필요한 대응 |
|---|---|
| 한 논리 조회의 전체 시간이 수십·수백 RPC로 늘어남 | 개별 HTTP timeout 외 전체 deadline·취소·최대 호출 수 정의 |
| 풀 10이 같아도 대기 작업·보유 결과가 증가 | 대기열과 논리 요청 동시 실행 수 제한. ‘순차이므로 부하 불변’ 표현 정정 |
| 분할 도중 실패·세션 만료·호스트/아이템 삭제 | 재시도 범위, 부분 결과, 캐시 저장 여부 명시 |
| 쓰기 분할의 부분 성공 | 자동 분할 대상에서 제외하거나 별도 재개·결과 계약 마련. 전체 재시도 금지 |
| 큰 목록에 `@Singular`·Map·JsonNode가 중복 존재 | 전체 보유량 제한 및 소비형 누적 경로 도입 |
| 청크별 평균·상위 N을 합쳐 전역 결과가 달라짐 | 원래 집계의 분모·가중치·동점 순서 보존 |
| 트래픽 정밀 조회의 의미 축소 | 현재 허용하는 `sub=null`과 비블랙리스트 sub까지 검토. `bytes`만 조회한다고 단정하지 않음 |
| FALLBACK 적용 범위 변화 | [fetchFamilyItems:368](C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapter.java:368)는 현재 전체 host 집합 기준 첫 히트를 선택한다. 청크마다 폴백하면 결과가 달라질 수 있음 |
| H5를 ‘원격 1콜’로 표기 | `problemAggByHost`는 상위 배치 호출 하나지만 소유 호스트를 위한 trigger 조회도 필요하다. 실제 RPC 수와 O(H×A) 집계 비용을 별도로 표시 |
| H6 배치화 시 RAW/trend 전환 회귀 | `AdaptiveSeriesQuery`의 48시간 전환 유지. RAW `querySeries`로 단순 치환하지 않음 |
| X1에 timeout만 추가 | 기다리던 부모가 응답을 끝내도 제출 작업이 계속 남을 수 있음. 중첩 blocking 제거·실제 작업 취소·bounded queue 검토 |
| T-A에서 cleanup 전체 중단 | 해소 30일 보존 정리와 위험한 미해소 stale 정리를 분리. 후자에 완전 동기화 증거 적용 |

**🟢 유지할 설계 방향**

공통 호출부를 `engine-zabbix`에 두는 것, 기존 record 유지, 청크를 기본 순차 처리하는 것, 요청 계약 보존 검증, 잘림을 명시적 결과로 전달하는 방향은 적절하다.

## 5. 필수 수정 목록 (착수 전)

아래 **8건은 착수 전에 설계·티켓에서 확정할 사항**이다. 구현이나 테스트 실행을 이번 읽기 전용 검수에서 요구하는 것은 아니다.

1. **보장할 상한을 정의한다.** RPC별 ID·행·바이트 제한과 논리 조회 전체의 행·호출 수·시간 예산을 구분한다. ID 없는 조회와 `selectItems` 등 중첩 확장도 방어 대상에 포함한다. N1을 적용 대상에 추가한다.
2. **공통 API를 완성한다.** `List`와 `ZabbixListResult`의 반환형 모순을 없애고 객체·스칼라·특수 decoder·typed 분할·소비형 순회를 정의한다. 읽기 자동 분할과 쓰기 정책, 빈 대상과 필터 생략을 구분한다.
3. **분할·병합 규칙을 명시한다.** inclusive 시간 경계, ID별 배타성, 결과 dedup, 전역 정렬·limit, 이벤트 커서, history 동일 초·ns 처리와 전진 불가 종료 규칙을 적는다.
4. **완전성 계약을 양쪽 포트와 소비자까지 연결한다.** Metric·Alert 결과, LicenseGuarded 위임, REST DTO, 캐시, FE 표시·증분 커서를 포함한다. 상한 도달과 실제 불완전성을 구분하고 부분 total의 의미를 정한다.
5. **T-A의 삭제 보호를 다시 설계한다.** 상한 도달뿐 아니라 실패·중단·재시작을 포함한다. 완전 순회와 DB 반영이 끝난 시점의 증거를 cleanup이 안전하게 확인하도록 한다. 기존 되짚기 커서를 유지하고 무조건 중단 방침은 재검토한다.
6. **T-B의 epoch 선행 조건을 추가한다.** `lastclock` 조회·매핑과 CPU 신선도 정책을 명시한다. 현재 epoch=0인 API를 그대로 사용하지 않는다.
7. **범위와 적용 순서를 정리한다.** 무동작 변경 S0와 보호 정책 S1을 분리한다. S2 권한 캐시는 ZM-157로 이동하고, X1·X2·X6·DB 풀 조정은 독립 변경으로 관리한다. 기존 생성자의 일괄 Lombok 치환은 제외한다.
8. **수용 기준을 보강한다.** 중복 host/group 결과, 동일 초 대량 history, 정확히 limit개, limit+1개, 중간 청크 실패, 전체 예산 초과, 다중 요청 교착, invalid 설정, T-A 수집 중단, T-B timestamp, X2 범례·N2 SUM을 검증 계획에 넣는다. 단순히 5,000개 ID를 넣고 호출 횟수만 확인해서는 부족하다.

## 6. 권장 커밋·이슈 분할

| 순서 | 권장 변경 단위 | 완료 기준 |
|---|---|---|
| 1 | 공통 Template·Params 추출, 단순 호출부 소규모 이행 | 요청 params·토큰·응답 변환·예외 의미 보존. 보호 정책 변경 없음 |
| 2 | 특수 호출부 이행 및 직접 Client 접근 제한 | 로그인·객체 결과·history.push 행별 오류·관리 쓰기 계약 보존 |
| 3 | 조회 정책·설정 검증·분할·소비형 순회 기반 | 메서드별 제한과 경계·전진·중복 규칙 확정 |
| 4 | `engine-api` 완전성 계약과 위임·응답 경로 | Metric·Alert 모두 전달 가능. FE 소비 계약 준비 |
| 5 | H1·B3: 아이템 탐색 축소와 trend 분할·누적 | 결과 동치 및 전체 보유량 제한 |
| 6 | H7·E3: RAW/history 보호와 불완전 표시 | 차트·총계·증분 커서가 부분 결과를 정상 완료로 취급하지 않음 |
| 7 | H2~H4·N1: 집계·목록별 조회 방식 변경 | 집계는 유계 누적/적절한 count, 상세는 제한·페이징. 전체 리스트 재적재 제거 |
| 8 | H5·H6 배치화 | 하위 RPC 상한 유지, AdaptiveSeriesQuery·응답 순서 보존 |
| 별도 | T-A | 삭제 보호 응급 조치와 problem 커서 수집을 분리 |
| 별도 | T-B | freshness 계약 선행 보완 후 후보 호스트의 선택 메트릭 조회 |
| 별도 | X1 | 중첩 executor 교착 제거 |
| 별도 | X2·N2 | FE 시리즈 식별자·범례와 BE SUM 정확성 수정 |
| 별도 | X6 | AWS 100개 ID 분할 및 실패 범위 처리 |
| 후속 | E1·E2·C1·B6·AI 정확성·APM | 각각 DB 조회, 읽음 모델, 풀 용량, 세션 수명주기, AI, APM 이슈로 관리 |

T-A의 `problem.get` eventid 정렬·범위 조회는 Zabbix 7.0 공식 API에 존재한다. 따라서 티켓의 ‘지원 여부 미확인’은 **문서상 지원 확인, 대상 설치본 회귀 검증 필요**로 정정할 수 있다. [problem.get](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/problem/get)

S0 검증은 요청 본문만 같다고 끝내지 말고 **응답 shape·null/빈 값·오류 처리·특수 응답 정규화**까지 포함해야 한다. 각 커밋은 검증 가능한 완결 단위로 구성하되, 이번 ZM-159 완료가 전체 목표 규모의 수용 검증 완료를 의미하지는 않도록 E1·E2 등 후속 이슈와 구분해야 한다.