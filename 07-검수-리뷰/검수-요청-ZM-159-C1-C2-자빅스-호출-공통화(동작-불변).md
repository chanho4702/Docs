# 검수 요청 — ZM-159 C1·C2 자빅스 호출 공통화(동작 불변)

- 요청: Claude · 2026-09-17 · 워크트리 `C:/worktrees/zm-159-be`(브랜치 `ZM-159`, 기준 master `8df357d`, **미커밋**)
- 설계: `_workspace/designs/devdesign_zm-159-scale-call-guard.md` v1 §0.2·§0.7(C1·C2)·§0.8 · 설계 검수 `reviews/review_zm-159_codex-r1.md`

## 범위
엔진 모듈(`engine-zabbix`)의 모든 서비스 구현이 `ZabbixClient`를 직접 부르던 것을 공통 유틸 `ZabbixApiTemplate`로 옮겼다. **조회 정책(분할·상한·완전성)은 바꾸지 않았다** — 그건 C3부터.

| 구분 | 파일 |
|---|---|
| 신규 | `client/ZabbixApiTemplate.java`(raw·call·list·object·count·firstId·exec + 정적 parseCount·firstId) · `client/ZabbixParams.java`(롬복 빌더, 깊은 복사, 키 순서 보존 — 이번 커밋에선 테스트만 사용) · `lombok.config`(stopBubbling·addLombokGeneratedAnnotation) |
| 이행 | **22개** `*ServiceImpl`(요청서 초판의 "24개"는 오기 — 코덱스 R7) + `ZabbixHealthAdapter`·`ZabbixHistoryPushImpl` — 필드 `ZabbixClient zabbixClient`→`ZabbixApiTemplate api`, 복사 헬퍼(`toList` 5·`firstId` 8·`callRawList` 2·`firstHostId` 1·`ZabbixItemServiceImpl.parseCount`) 삭제, 미사용 `ObjectMapper` 필드·import 삭제, `ZabbixHealthAdapter` 수동 생성자→`@RequiredArgsConstructor` |
| 테스트 | 신규 `ZabbixApiTemplateTest`(16)·`ZabbixParamsTest`(6)·`ZabbixClientAccessTest`(1, client 패키지 밖 코드의 `ZabbixClient` 참조 금지 — 주석 제외). 기존 7개 테스트의 생성부를 `new ZabbixApiTemplate(client, mapper)` 경유로 수정(`@InjectMocks`→`@BeforeEach` 생성) |

## 의도
- 변환 규칙: `toList(callRaw)`→`list` / `parseCount(callRaw)`→`count` / `firstId(callRaw,k)`→`firstId(..,k)` / 결과 미사용 문장→`exec` / 나머지→`raw`. 인라인 "raw→isArray→convertValue(List<Map>)"→`list`, "isObject→Map"→`object`, `*.create`의 `ids[0]` 삼항→`firstId`.
- **의도적으로 `raw`로 남긴 곳**: `event.get`/`problem.get` countOutput(`result.asLong(0)` — `parseCount`와 공백·비숫자 경계가 달라 동작 불변 원칙상 유지) · `user.login`·`user.get`(role 정규화) · `history.get`/`trend.get` 파싱 · `history.push`(행별 결과) · `apiinfo.version` · `host.get`(ZabbixHost 수동 매핑) · `usergroup.get` tag_filters 판정.
- 기존 수동 생성자의 일괄 롬복 치환은 하지 않았다(r1 Q5). 헬스 어댑터만 단순 대입 생성자라 치환.
- 커밋은 둘로 나눌 예정: **C1** = client 신규 2 + 단순 이행 + 해당 테스트 / **C2** = 특수 호출부(health·history push·user·history/trend) + 접근 금지 테스트 + lombok.config. 파일이 겹치지 않는다.

## 중점 확인 요청
1. **동작 불변** — 옮기기 전과 요청(method·params 인스턴스·auth)과 반환값(null·빈 배열·객체·스칼라·예외)이 정말 같은가. 특히 `object()`로 바꾼 `event.acknowledge`·`script.execute`·`script.getscriptsbyhosts`, `firstId`로 바꾼 httptest·maintenance·script `create`, `count`로 바꾼 action·discovery·lld·mediatype·trigger·item.
2. 기계 변환 스크립트가 **대입문의 연속 줄을 `exec`로 바꾼 사고**가 1건 있었다(`ZabbixUserGroupServiceImpl.hasProblemTagFilters`, 컴파일로 발견·수정). 같은 부류의 누락(결과를 쓰는데 `exec`인 곳, 반대로 반환값을 버리는 곳)이 더 없는가.
3. `@InjectMocks`를 수동 생성으로 바꾼 테스트에서 **목 객체가 실제로 쓰이는 경로**가 바뀌지 않았나(`ZabbixItemServiceImplTest`는 ObjectMapper가 목이다).
4. `ZabbixParams`의 깊은 복사가 `List.of`/`Map.of`를 가변 컬렉션으로 바꾸는 것 · `Object[]`를 List로 바꾸는 것이 이후 청크 치환에 문제가 없는가. `@EqualsAndHashCode`가 적절한가.
5. `lombok.addLombokGeneratedAnnotation=true`가 커버리지·기존 빌드에 부작용이 없는가.
6. `ZabbixClientAccessTest`의 주석 제거 정규식이 문자열 리터럴 안의 `//`(URL 등)로 오탐·누락을 낼 수 있는가.

## 검증 현황
- ✅ `:engine-zabbix:test` **148 통과**(신규 23 포함) · ✅ 앱 모듈 `compileJava`·`compileTestJava` 통과 · ✅ `AuthorizationContractIT` 11 통과(전체 스프링 컨텍스트 기동 — `ZabbixApiTemplate` 빈 주입 확인)
- ✅ 변이 1건: client 밖에 `ZabbixClient` 필드를 둔 파일을 넣으면 `ZabbixClientAccessTest` 실패 확인 후 원복
- ❌ **미실시**: 앱 모듈 전체 `:test`(3,600여 건 — 공유 IT DB 충돌 위험으로 유휴 시 별도 실행 예정) · 실 자빅스 런타임 호출

## 검수 결과
(Codex 기록 — 별도 파일 `review_zm-159-c1c2_codex.md`, 판정 **수정 후 커밋**. 호출부 126곳 대조 결과 의미 변경 없음)

## 반영 기록 (Claude, 2026-09-17)

- [x] **R1 C3 분리** — 커밋 manifest를 파일 단위로 확정했다(작업 트리 45파일 = C1 24 + C2 14 + C3 7, 누락·중복 0). 코덱스 권고대로 객체 결과 호출부(Event·Script)는 C2로 옮겼다.
  master 기준 임시 워크트리에 **C1만** 적용 → `:engine-zabbix:test` 149 통과·앱 `compileJava`/`compileTestJava` 통과 / **C1+C2** 적용 → 엔진 162 통과·앱 컴파일 통과·`AuthorizationContractIT` 11 통과. C3는 별도 검수 요청(`review_zm-159-c3.md`).
- [x] **R2 접근 금지 검사** — 소스 정규식을 버리고 **컴파일된 클래스 상수 풀**(UTF8 항목의 내부 이름·디스크립터)로 검사한다. 대조군 고정: URL 문자열 뒤 실제 필드 참조(양성)·주석/문자열/점 표기/text block(음성)·템플릿 자신(양성). 변이: main에 `String url = "https://example"; ZabbixClient client;` → 실패 확인, 문자열·주석만 있는 클래스 → 통과(오탐 없음).
- [x] **R3 깊은 복사 계약** — 허용 타입 명시(null·문자열·숫자·불리언·문자·열거형·Map·Collection·배열(원시형 포함→목록)·JsonNode(deepCopy)), 그 밖의 가변 값은 `IllegalArgumentException`. `get()`도 사본. `@EqualsAndHashCode` 제거. 테스트는 값을 바꿔 끼우지 않고 원본/사본 양방향 중첩 수정으로 교체, 변이(목록 얕은 복사) 검출 확인.
- [x] **R4 서비스 호출부 고정** — `ZabbixServiceCallContractTest` 신설: count 6곳(메서드·params 인스턴스·토큰·" 12 "/비숫자/배열 파싱), `event.getCount`(countOutput 추가·정렬 제거·호출자 맵 불변·종전 `asLong(0)`), `event.acknowledge`·`script.execute`(객체/그 외), `script.getscriptsbyhosts`(hostids 1개 스칼라·복수 목록), `script.create`·`maintenance.create`(ID 필드·빈 배열·필드 없음·null).
- [x] **R5** — C3 테스트의 `MockEnvironment`(spring-test 없음)·템플릿 목 NPE는 검수 도중 이미 수정(StandardEnvironment + 실제 템플릿·목 클라이언트).
- [x] **R6** — C3에서 처리: 시간 창 지연 생성, RPC 직후 시간 예산 재검사, `Long.MAX_VALUE` 경계. 테스트 3건 추가.
- [x] **R7** — 요청서 서비스 개수 정정, 설계 §0.2의 `list(TypeReference)` 삭제(=`call`로 대체).
- 테스트 공백 중 이번에 **넣지 않은 것**(이유): Java null과 `NullNode`·배열 안 null 등 변환 세부 — 기존 복사 헬퍼와 **같은 코드**(`isArray`·`convertValue`)라 동작 불변은 코드 동일성으로 보장된다고 판단. user.login 응답 모양·health timeout은 기존 테스트가 이미 다룬다.

## 커밋 manifest (확정, 2026-09-17)

### C1
```
main/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplate.java
main/java/com/dmove/moveseye/zabbix/client/ZabbixParams.java
main/java/com/dmove/moveseye/zabbix/alert/problem/ZabbixProblemServiceImpl.java
main/java/com/dmove/moveseye/zabbix/alertaction/ZabbixActionServiceImpl.java
main/java/com/dmove/moveseye/zabbix/discovery/ZabbixDiscoveryServiceImpl.java
main/java/com/dmove/moveseye/zabbix/host/ZabbixHostServiceImpl.java
main/java/com/dmove/moveseye/zabbix/hostgroup/ZabbixHostGroupServiceImpl.java
main/java/com/dmove/moveseye/zabbix/httptest/ZabbixHttpTestServiceImpl.java
main/java/com/dmove/moveseye/zabbix/identity/role/ZabbixRoleServiceImpl.java
main/java/com/dmove/moveseye/zabbix/identity/token/ZabbixTokenServiceImpl.java
main/java/com/dmove/moveseye/zabbix/identity/userGroup/ZabbixUserGroupServiceImpl.java
main/java/com/dmove/moveseye/zabbix/item/ZabbixItemServiceImpl.java
main/java/com/dmove/moveseye/zabbix/lld/ZabbixLldServiceImpl.java
main/java/com/dmove/moveseye/zabbix/maintenance/ZabbixMaintenanceServiceImpl.java
main/java/com/dmove/moveseye/zabbix/mediatype/ZabbixMediaTypeServiceImpl.java
main/java/com/dmove/moveseye/zabbix/proxy/ZabbixProxyServiceImpl.java
main/java/com/dmove/moveseye/zabbix/template/ZabbixTemplateServiceImpl.java
main/java/com/dmove/moveseye/zabbix/trigger/ZabbixTriggerServiceImpl.java
main/java/com/dmove/moveseye/zabbix/usermacro/ZabbixUserMacroServiceImpl.java
test/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplateTest.java
test/java/com/dmove/moveseye/zabbix/client/ZabbixParamsTest.java
test/java/com/dmove/moveseye/zabbix/httptest/ZabbixHttpTestServiceImplTest.java
test/java/com/dmove/moveseye/zabbix/identity/userGroup/ZabbixUserGroupTagFilterTest.java
test/java/com/dmove/moveseye/zabbix/item/ZabbixItemServiceImplTest.java
```
### C2
```
main/java/com/dmove/moveseye/zabbix/alert/event/ZabbixEventServiceImpl.java
main/java/com/dmove/moveseye/zabbix/script/ZabbixScriptServiceImpl.java
main/java/com/dmove/moveseye/zabbix/health/ZabbixHealthAdapter.java
main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryPushImpl.java
main/java/com/dmove/moveseye/zabbix/identity/user/ZabbixUserServiceImpl.java
main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java
main/java/com/dmove/moveseye/zabbix/timeseries/trend/ZabbixTrendServiceImpl.java
test/java/com/dmove/moveseye/zabbix/health/ZabbixHealthAdapterTest.java
test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryPushImplTest.java
test/java/com/dmove/moveseye/zabbix/identity/user/ZabbixUserServiceImplTest.java
test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImplTest.java
test/java/com/dmove/moveseye/zabbix/client/ZabbixClientAccessTest.java
test/java/com/dmove/moveseye/zabbix/client/ZabbixServiceCallContractTest.java
lombok.config
```
### C3
```
main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java
main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java
main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java
main/java/com/dmove/moveseye/zabbix/client/ZabbixScanResult.java
main/java/com/dmove/moveseye/zabbix/client/ZabbixScanStopReason.java
test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java
test/java/com/dmove/moveseye/zabbix/client/ZabbixClientBoundedReadTest.java
```
