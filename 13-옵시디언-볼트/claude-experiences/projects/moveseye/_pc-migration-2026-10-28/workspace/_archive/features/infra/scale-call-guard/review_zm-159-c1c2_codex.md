# ZM-159 C1·C2 구현 검수 — Codex

## 0. 판정 (커밋 가능 / 수정 후 커밋 / 재작업)

**수정 후 커밋.** 최초 C1·C2 변경의 호출부에서는 요청·반환·예외 의미의 차이를 발견하지 못했다. 접근 금지 검사와 회귀 테스트는 보완이 필요하다. **검수 중 추가된 C3 변경은 C1·C2에서 분리해야 한다.**

- 기준: `master`와 워크트리 HEAD 모두 `8df357d1b45f323d011cdb1a7333f6a57119029a`.
- 최초 변경: **37파일**. 호출부는 요청서의 “24개 서비스 + health + push”가 아니라 **22개 서비스 + health + push = 24파일**, 변경된 호출 지점은 **126개**다.
- 마지막 `status` 확인: **43파일**. 검수 중 `ZabbixClient` 수정과 C3 신규 파일 5개가 추가됐다. 최초 37파일의 diff는 마지막 대조에서도 동일했다.
- 파일 생성·수정, 빌드·테스트는 수행하지 않았다. 요청서의 **148건·AuthorizationContractIT 11건 통과는 구현자 보고**이며, 검수 도중 추가된 C3까지 검증했다는 근거로 사용할 수 없다.

## 1. 중점 확인 1~6

| 번호 | 판정 | 근거 |
|---|---|---|
| **1. 동작 불변** | **최초 C1·C2 호출부는 정적 대조상 동일. 현재 변경 전체는 불변 아님.** | [ZabbixApiTemplate.java:45](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplate.java:45)의 `raw/call`은 인자를 그대로 위임한다. `object`의 객체 검사·빈 맵 반환(:60), `firstId`의 배열 첫 원소 처리(:104), `parseCount`의 `trim→Long.parseLong→실패 시 0`(:92)은 삭제된 기존 코드와 같다. 반면 추가된 [ZabbixClient.java:183](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:183)은 응답 바이트 제한을 도입했다. |
| **2. `exec` 오변환** | **추가 누락 없음.** | `exec` **46곳**은 모두 기존에 반환값을 사용하지 않던 호출이다. 반환값을 사용하던 경로의 결과 폐기도 발견하지 못했다. 문제였던 [ZabbixUserGroupServiceImpl.java:47](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/userGroup/ZabbixUserGroupServiceImpl.java:47)은 `api.raw` 결과를 `groups`에 받아 판정한다. 나머지는 `list` 29·`raw` 12·`object` 3·`call` 14·`count` 6·`firstId` 16곳이다. |
| **3. 목 객체 경로** | **기존 7개 테스트의 주입 경로 보존. 다만 검증 범위는 제한적.** | [ZabbixItemServiceImplTest.java:32](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/item/ZabbixItemServiceImplTest.java:32)의 같은 Client·ObjectMapper 목을 실제 Template에 전달한다. 기존 두 테스트는 `getByListKey→api.call→client.call`만 실행하므로 ObjectMapper 목은 이전처럼 사용되지 않는다. `getRaw` 변환까지 검증하는 테스트는 아니다. user는 같은 실제 mapper를 서비스와 Template에 전달하고, history·health·push는 `raw` 경로라 추가 mapper가 결과에 관여하지 않는다. |
| **4. 깊은 복사·equals** | **Map/List/Object[] 범위의 청크 교체에는 적합. 포괄적인 깊은 복사 보장은 불충분.** | [ZabbixParams.java:162](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixParams.java:162)는 Map→LinkedHashMap, Collection→ArrayList, Object[]→List로 재귀 복사한다. 입력 순서·JSON 요소를 보존하면서 사본을 수정할 수 있다. 그러나 primitive 배열·가변 JsonNode·기타 가변 객체는 :176에서 원본 참조를 반환한다. `@EqualsAndHashCode`(:28)는 현재 내용 비교에는 맞지만, 가변 빌더이므로 변경 후 hashCode가 달라진다. 캐시 키·HashSet 원소로 쓰는 용도에는 부적절하다. |
| **5. Lombok 설정** | **명백한 컴파일 부작용은 발견하지 못함. 커버리지 수치는 달라질 수 있음.** | [lombok.config:2](C:/worktrees/zm-159-be/lombok.config:2)는 저장소 루트에서 상속을 차단하고 생성 코드 annotation만 켠다. 확인한 상위 `C:/worktrees`, `C:/`에는 상속받을 설정이 없었다. [engine-zabbix/build.gradle.kts:44](C:/worktrees/zm-159-be/engine-zabbix/build.gradle.kts:44)에 Lombok·annotationProcessor가 이미 있다. Generated를 제외하는 분석 도구에서는 생성 메서드가 집계에서 빠져 전후 커버리지의 분모가 달라질 수 있다. 저장소 Gradle 파일에서는 JaCoCo 설정을 찾지 못했으므로 실제 보고서 영향은 미확인이다. |
| **6. 주석 제거 정규식** | **오탐·누락 모두 가능. 수정 필요.** | [ZabbixClientAccessTest.java:25](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixClientAccessTest.java:25)는 문자열·문자 리터럴·text block을 구분하지 않는다. URL의 `//` 뒤 실제 코드를 삭제할 수 있고, 문자열 `"ZabbixClient"` 자체는 코드 참조로 오탐한다. 일반 필드 삽입 변이 하나로 이 경계를 검증할 수 없다. |

## 2. 호출부 대조 결과 (표: 파일 | 메서드 | 판정 | 근거)

**최초 C1·C2의 24파일·126개 호출 지점에서 의미 변경은 없음.** 아래 목록은 RPC method, params 생성·전달 방식, auth, 호출 순서·생략 조건, 반환 변환, 예외 처리의 대조 범위다.

`동일`은 해당 호출부의 C1·C2 치환에 대한 판정이다. **현재 워크트리에서는 마지막 행의 C3 전송 변경이 이 호출들에 공통 적용된다.**

| 파일 | 메서드 | 판정 | 근거 |
|---|---|---|---|
| [ZabbixEventServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/event/ZabbixEventServiceImpl.java:20) | `get`, `getCount`, `acknowledge` | 동일 | :23·32·38. output 기본값·count 정렬 제거 유지. count는 `asLong(0)`, acknowledge는 객체만 Map 변환. |
| [ZabbixProblemServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/problem/ZabbixProblemServiceImpl.java:23) | `get`, `getCount`, `getCountRaw`, `getRaw` | 동일 | :26·35·43·51. typed 반환과 raw 목록의 서로 다른 null 처리, 두 count의 `asLong(0)` 유지. |
| [ZabbixActionServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alertaction/ZabbixActionServiceImpl.java:22) | `getRaw`, `countRaw`, `create`, `update`, `delete` | 동일 | :23·28·33·38·46. `actionids`, 기존 parseCount, null/빈 삭제 생략 유지. |
| [ZabbixDiscoveryServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/discovery/ZabbixDiscoveryServiceImpl.java:24) | `getRulesRaw`, `countRulesRaw`, `createRule`, `updateRule`, `deleteRules`, `getDiscoveredHostsRaw`, `getDiscoveredServicesRaw` | 동일 | :25·30·35·40·48·53·58. `drule/dhost/dservice` method와 `druleids` 보존. |
| [ZabbixHealthAdapter.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/health/ZabbixHealthAdapter.java:57) | `check` | 동일 | :72. `apiinfo.version`, 빈 배열, null auth 유지. :74 이후 timeout·interrupt·DOWN 변환 보존. 생성자는 기존 두 필드 대입과 동일. |
| [ZabbixHostServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/host/ZabbixHostServiceImpl.java:31) | `getRaw`, `getEventsRaw`, `getTriggersRaw`, `getHostGroupsRaw`, `createHost`, `updateHost`, `massAddHost`, `massRemoveHost`, `deleteHost`, `getEvents`, `get` | 동일 | :32·37·42·47·52·57·62·67·75·88·109. 네 목록 헬퍼, `hostids`, typed event 반환·host 수동 매핑 유지. |
| [ZabbixHostGroupServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/hostgroup/ZabbixHostGroupServiceImpl.java:25) | `getZabbixHostGroupList`, `createHostGroup`, `updateHostGroup`, `deleteHostGroups` | 동일 | :35·42·48·60·64·73. 생성 후 massadd, update 후 조건부 massupdate 순서 유지. 기존 `groupids().get(0)`의 예외 경계도 유지. |
| [ZabbixHttpTestServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/httptest/ZabbixHttpTestServiceImpl.java:28) | `getRaw`, `create`, `update`, `delete` | 동일 | :29·34·39·49. `httptestids[0]`, 비배열 결과·ID 누락 처리, 삭제 생략 조건 보존. |
| [ZabbixRoleServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/role/ZabbixRoleServiceImpl.java:23) | `getZabbixRole`, `createRole`, `updateRole`, `deleteRole`, `getZabbixRoleList` | 동일 | :37·47·58·63·75. typed 변환 및 삭제 시 별도 빈 목록 방어를 두지 않던 기존 동작 유지. |
| [ZabbixTokenServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/token/ZabbixTokenServiceImpl.java:30) | `generateToken`, `deleteAllTokensByUserId` | 동일 | :39·43·56·63. create→generate, get→조건부 delete 순서·배열 params·후처리 유지. |
| [ZabbixUserServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/user/ZabbixUserServiceImpl.java:75) | `loginInternal` 및 로그인·관리자 토큰 경로, `logout`, `fetchUsers` 및 사용자 조회 경로, `getUsersRaw`, `updateUserRaw`, `adminChangePassword`, `createUser`, `updateUser`, `deleteUser` | 동일 | :81·100·142·178·183·198·224·256·265. 로그인 null auth, logout 빈 배열, role 정규화 후 변환, 관리자 토큰 선택·입력 예외 보존. |
| [ZabbixUserGroupServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/userGroup/ZabbixUserGroupServiceImpl.java:27) | `getZabbixUserGroupList`, `hasProblemTagFilters`, `createUserGroup`, `updateUserGroup`, `deleteUserGroup` | 동일 | :36·48·76·98·103. tag_filters 결과 사용, typed 생성 응답·첫 ID 접근 유지. |
| [ZabbixItemServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/item/ZabbixItemServiceImpl.java:22) | `get`·`getByListKey`의 `getInternal`, `getRaw`, `countRaw`, `createItem`, `updateItem`, `deleteItems` | 동일 | :71·80·85·90·95·103. 검색 키·searchByAny, `itemids`, parseCount 구현 동일. 삭제된 public parseCount의 저장소 내 참조도 남지 않았다. |
| [ZabbixLldServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/lld/ZabbixLldServiceImpl.java:23) | `getRulesRaw`, `countRulesRaw`, `createRule`, `updateRule`, `deleteRules`, `getItemPrototypesRaw`, `getTriggerPrototypesRaw`, `getGraphPrototypesRaw`, `getHostPrototypesRaw`, `createPrototype`, `updatePrototype`, `deletePrototypes`, `getGraphsRaw`, `executeNow` | 동일 | :24·29·34·39·47·52·57·62·67·73·78·86·91·96. 동적 `kind+"prototype.*"`·`kind+"ids"`와 task.create 배열 본문·`taskids` 유지. |
| [ZabbixMaintenanceServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/maintenance/ZabbixMaintenanceServiceImpl.java:17) | `getRaw`, `create`, `update`, `delete` | 동일 | :18·23·28·36. `maintenanceids` 및 기존 삼항식의 null·배열 경계 보존. |
| [ZabbixMediaTypeServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/mediatype/ZabbixMediaTypeServiceImpl.java:22) | `getRaw`, `countRaw`, `create`, `update`, `delete` | 동일 | :23·28·33·38·46. `mediatypeids`, count 파싱·삭제 조건 보존. |
| [ZabbixProxyServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/proxy/ZabbixProxyServiceImpl.java:20) | `getProxies` | 동일 | :24. output 두 필드와 name 정렬, 목록 변환 유지. |
| [ZabbixScriptServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/script/ZabbixScriptServiceImpl.java:17) | `getRaw`, `getScriptsByHosts`, `create`, `update`, `delete`, `execute` | 동일 | :18·25·30·35·43·48. hostids 1개면 scalar, 그 외 List를 `hostid`에 넣는 기존 형식 유지. 두 객체 결과·`scriptids` 처리 동일. |
| [ZabbixTemplateServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/template/ZabbixTemplateServiceImpl.java:20) | `getTemplates`, `getRaw`, `createTemplate`, `updateTemplate`, `deleteTemplates`, `getTemplateGroups`, `getRawTemplateGroups`, `createTemplateGroup`, `updateTemplateGroup`, `deleteTemplateGroups` | 동일 | :30·37·42·47·55·69·74·79·84·92. 검색·limit 조건, `templateids`와 `groupids`, 삭제 생략 보존. |
| [ZabbixHistoryPushImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryPushImpl.java:39) | `push` | 동일 | :49. 행별 params 생성·입력 검증 후 raw 호출, 요청 수를 전달하는 기존 parse 유지. |
| [ZabbixHistoryServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:34) | `getHistoryByItemids`, `getRange` | 동일 | :49·85. 기본/명시 limit·정렬·시간 필드 유지. 숫자형 변환과 `getRange`의 `asDouble(0)` 차이, 잘못된 clock의 예외도 유지. |
| [ZabbixTrendServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/trend/ZabbixTrendServiceImpl.java:23) | `getTrendByItemids` | 동일 | :30. limit·sortfield 추가 없음. 시간·min/max/avg 파싱 보존. |
| [ZabbixTriggerServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/trigger/ZabbixTriggerServiceImpl.java:19) | `getRaw`, `countRaw`, `createTrigger`, `updateTrigger`, `deleteTriggers` | 동일 | :20·25·30·35·43. `triggerids`, 기존 Item parseCount 의미·삭제 조건 보존. |
| [ZabbixUserMacroServiceImpl.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/usermacro/ZabbixUserMacroServiceImpl.java:20) | `getRaw`, `create`, `update`, `delete`, `createGlobal`, `updateGlobal`, `deleteGlobal` | 동일 | :21·26·31·39·44·49·57. host/global method 구분, `hostmacroids/globalmacroids`, 삭제 조건 유지. |
| **추가 C3:** [ZabbixClient.java](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:129) | `doCallRaw`, 신규 `readBounded` | **반환·예외 의미 변경** | `retrieve().body(JsonNode.class)`→`exchange/readTree`. 응답 상한 초과 시 새 ApiError(:183), HTTP 오류 본문 64KiB 절단·예외 재생성(:173), 새 설정 검증·빈 의존성 추가. |

C3 전송 변경의 영향은 다음과 같다.

- **요청 JSON 조립은 그대로다.** method·params·auth·id를 넣는 코드는 보존됐다.
- 기존에 처리하던 큰 응답이 이제 기본 **64MiB 초과 시 실패**한다. 일반 호출부는 예외를 받고, health는 기존 catch를 통해 DOWN으로 바꾼다.
- HTTP 오류 본문 절단과 예외 재생성이 추가돼 **기존 오류 메시지의 완전 보존을 보장하지 않는다.**
- HTTP message converter 대신 직접 `readTree`를 사용하므로 **Content-Type·charset·본문 파싱 오류 처리의 동일성은 별도 대조가 필요**하다.
- `ZabbixCallLimits` 설정이 잘못되면 호출 이전의 **애플리케이션 기동 단계에서 실패**하는 새 경로가 생긴다.

## 3. 결함 (🔴/🟡/🟢, 근거, 수정안)

**🔴 R1 — 현재 변경 전체에 C3가 섞여 C1·C2 수용 기준을 충족하지 않는다.**

[요청서:7](C:/solutions/_workspace/features/infra/scale-call-guard/review_zm-159-c1c2.md:7)은 조회 정책을 바꾸지 않는다고 명시하고, [설계:63](C:/solutions/_workspace/features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md:63)은 응답 바이트 제한을 C3에 배정한다. 그런데 현재 [ZabbixClient.java:183](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:183)에 제한이 적용돼 있다.

**수정안:** §5의 C3 파일·변경을 C1·C2 커밋에서 제외한다. 최초 37파일의 검증 결과와 C3 검증 결과를 분리한다.

**🟡 R2 — 접근 금지 검사가 문자열 때문에 실제 참조를 놓치거나 오탐한다.**

근거: [ZabbixClientAccessTest.java:25](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixClientAccessTest.java:25), :49.

다음은 **실행하지 않은 정적 반례**다.

```java
String url = "https://example"; com.dmove.moveseye.zabbix.client.ZabbixClient client;
```

정규식이 `//`부터 줄 끝을 지워 실제 타입 참조를 놓친다. 반대로 `String label = "ZabbixClient";`는 타입 참조가 없어도 실패한다. 단, 정상 import가 다른 줄에 있으면 그 import로 검출될 수 있으므로 **모든 URL이 누락을 일으킨다는 뜻은 아니다.**

**수정안:** Java lexer/parser 또는 bytecode 의존성 검사로 변경한다. 소스 검사를 유지한다면 문자열·문자·text block·주석을 구분하고 각각의 오탐·누락 반례를 고정한다.

**🟡 R3 — 깊은 복사 계약의 허용 타입이 불명확하고, 리스트 복사 테스트가 약하다.**

[ZabbixParams.java:176](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixParams.java:176)은 처리하지 않는 가변 값을 그대로 공유한다. 예를 들어 `long[]`을 넣고 원본 배열을 수정하면 빌더와 기존 `toMap()` 결과까지 영향을 받는다.

또한 [ZabbixParamsTest.java:98](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixParamsTest.java:98)는 복사한 리스트를 먼저 교체한 다음 원본을 수정한다. :113도 리스트 내부 수정 대신 값 전체를 교체한다. **리스트 재귀 복사를 제거한 잘못된 구현을 충분히 검출하지 못한다.**

**수정안:** 지원 타입을 명시·검증하거나 primitive 배열·JsonNode까지 복사한다. 값을 교체하지 않은 상태에서 원본과 반환 사본의 중첩 리스트·맵을 각각 수정해 독립성을 검증한다.

**🟡 R4 — C1·C2의 실제 호출부를 고정하는 테스트가 부족하다.**

[ZabbixApiTemplateTest.java:55](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplateTest.java:55)의 인자 보존 검사는 Template의 `list("host.get", …)` 한 경로다. 서비스가 잘못된 method·ID 필드·auth를 선택해도 공통 유틸 테스트만으로는 검출할 수 없다.

**수정안:** 특히 요청서가 지정한 event/script 객체 반환, maintenance/script 생성 ID, 6개 count 호출부에 서비스→실제 Template→캡처 Client 검사를 추가한다.

**🟡 R5 — 추가된 C3 테스트에는 의존성과 목 구성 문제가 있다.**

- [ZabbixQueryExecutorTest.java:31](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java:31)은 `MockEnvironment`를 import하지만, 확인한 [engine-zabbix/build.gradle.kts:51](C:/worktrees/zm-159-be/engine-zabbix/build.gradle.kts:51)에는 `spring-test` 의존성이 없다. **테스트 컴파일 실패 예상이며, 실행 확인은 하지 않았다.** 루트 앱의 test 의존성이 하위 모듈에 자동 적용되지는 않는다.
- 같은 테스트 :114에서 Template 전체를 목으로 만들고 :116에서 `toMapList`만 실제 메서드를 호출한다. :232의 `listMapsByIds`는 이 메서드에 도달하지만, 목 내부 `objectMapper`는 초기화되지 않아 **NPE 경로가 생긴다.**

**수정안:** 필요한 모듈 테스트 의존성을 추가하고, 실제 Template에 가짜 Client·실제 ObjectMapper를 연결한다. 이 수정은 C3에 포함한다.

**🟡 R6 — 추가 C3의 시간 예산이 모든 작업을 제한하지 못한다.**

[ZabbixQueryExecutor.java:164](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:164)는 첫 예산 검사 전에 모든 시간 창을 목록으로 만든다(:347). 긴 기간·작은 창에서는 RPC 이전의 메모리·시간 사용량이 제한되지 않는다. 또한 :438의 deadline 검사는 다음 호출 직전에만 이루어져, **마지막 RPC가 deadline을 넘겨 끝나도 `complete=true`로 반환할 수 있다.**

**수정안:** 시간 창을 순차 생성하고, RPC 반환 후·완료 판정 전에도 시간 예산을 검사한다. 실제 실행 시간을 제한하려면 남은 예산과 RPC timeout의 연결도 필요하다. C3에서 처리할 사항이다.

**🟢 R7 — 문서·사용 계약 정리.**

- [요청서:12](C:/solutions/_workspace/features/infra/scale-call-guard/review_zm-159-c1c2.md:12)의 서비스 개수를 **22개 + health + push**로 정정한다.
- `ZabbixParams`는 가변 빌더이며 `get()`은 내부 참조를 노출한다. hash 기반 키로 사용하지 않는다는 계약을 남기거나 불필요한 `@EqualsAndHashCode`를 제거한다.
- [설계:22](C:/solutions/_workspace/features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md:22)의 `list(TypeReference)`는 현재 구현에 없다. `call(TypeReference<T>)`로 대체한 결정이라면 문서를 맞춘다. 현재 호출부의 기능 결함은 아니다.

## 4. 테스트 공백

기존 테스트는 **무의미해진 것이 아니다.** httptest의 실제 params 전달·ID 추출, user role 정규화, history 기본 limit, tag filter 판정, push의 행별 실패·인덱스 정렬은 실제 Template을 거쳐 계속 검증한다. 다만 **전체 동작 불변을 고정했다고 보기에는 부족하다.**

| 영역 | 빠진 경계·필요한 검증 |
|---|---|
| 실제 서비스 인자 | `event.acknowledge`, `script.execute/getscriptsbyhosts`, maintenance/script create, 6개 count의 method·params·auth·ID 필드. script의 hostids 0·1·복수도 포함. |
| null·변환 | Java null과 `NullNode` 구분, 빈 실제 배열·객체, 배열 안의 null·스칼라, Map/List 변환 실패. 현재 [Template 테스트:78](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplateTest.java:78)는 일부 shape만 다룬다. |
| 숫자·ID | count의 소수·boolean·빈 문자열·long overflow, firstId의 숫자·null·객체 첫 원소. event/problem의 `asLong(0)`를 공통 parseCount로 바꾸면 안 되는 경계도 고정해야 한다. |
| 예외 | [Template 테스트:169](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplateTest.java:169)는 exec의 ApiError **타입만** 검사한다. 원본 예외 인스턴스·코드·메시지 보존과 다른 helper의 예외 전파는 빠져 있다. |
| 특수 호출 | user.login의 객체·문자열·null 응답, history/trend의 실제 행 파싱·잘못된 clock, health timeout·interrupt·빈 배열 params. |
| 깊은 복사 | 원본/사본 양방향 중첩 수정, `Object[]`의 중첩 값, 지원하지 않는 가변 타입, 반복 `toMap()` 간 독립성. |
| 접근 금지 | URL 뒤 실제 참조, 문자열 안의 타입명, `/*…*/` 문자열, escape·text block. |
| 추가 C3 | 실제 HTTP 응답의 상한 직전·정확히 상한·초과, Content-Length 유무, HTTP 오류 메시지·Content-Type·charset, 마지막 RPC의 deadline 초과. 새 Executor 테스트는 Client를 우회하므로 전송 변경을 검증하지 않는다. |

C3를 제외한 C1·C2 검증에는 새 보호 정책 테스트를 섞을 필요가 없다. 우선 **변경한 호출부의 기존 계약**을 고정해야 한다.

## 5. 커밋 분할 의견

[요청서:19](C:/solutions/_workspace/features/infra/scale-call-guard/review_zm-159-c1c2.md:19)는 범주만 제시하고, 정확한 파일별 manifest는 제공하지 않는다. 다음은 **그 설명을 파일 단위로 해석한 배정안**이다.

| 커밋 | 파일 목록 |
|---|---|
| **C1 — 26파일** | 신규 `ZabbixApiTemplate.java`, `ZabbixParams.java`; 서비스 구현 **Event, Problem, Action, Discovery, Host, HostGroup, HttpTest, Role, Token, UserGroup, Item, Lld, Maintenance, MediaType, Proxy, Script, Template, Trigger, UserMacro**의 19파일; 신규 `ZabbixApiTemplateTest.java`, `ZabbixParamsTest.java`; 수정 `ZabbixHttpTestServiceImplTest.java`, `ZabbixUserGroupTagFilterTest.java`, `ZabbixItemServiceImplTest.java`. 서비스 파일의 정확한 경로는 §2 표와 같다. |
| **C2 — 11파일** | `ZabbixHealthAdapter.java`, `ZabbixHistoryPushImpl.java`, `ZabbixUserServiceImpl.java`, `ZabbixHistoryServiceImpl.java`, `ZabbixTrendServiceImpl.java`; 대응 수정 테스트 `ZabbixHealthAdapterTest.java`, `ZabbixHistoryPushImplTest.java`, `ZabbixUserServiceImplTest.java`, `ZabbixHistoryServiceImplTest.java`; 신규 `ZabbixClientAccessTest.java`, 루트 `lombok.config`. |
| **C3로 분리 — 마지막 확인 시 6파일** | `ZabbixClient.java` 수정; 신규 `ZabbixCallLimits.java`, `ZabbixQueryExecutor.java`, `ZabbixScanResult.java`, `ZabbixScanStopReason.java`, `ZabbixQueryExecutorTest.java`. |

위 C1·C2 목록은 **중복 없이 최초 37파일을 모두 포함한다.**

다만 [설계 §0.7:62](C:/solutions/_workspace/features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md:62)는 **객체 결과 호출을 C2**에 배정한다. 설계대로 나누려면 **Event·Script 서비스 파일 전체를 C2로 옮겨 C1 24파일 / C2 13파일**로 구성하는 편이 명확하다. 같은 파일을 메서드별로 두 커밋에 나누면 “파일이 겹치지 않는다”는 설명과 달라진다.

컴파일 가능성은 다음과 같이 판단한다.

- **master + C1: 가능 추정.** Template·Params와 기존 Lombok 의존성이 함께 있고, 삭제되는 Item parseCount를 사용하던 5개 서비스도 같은 C1에서 이행한다. 생성자가 바뀌는 기존 테스트도 함께 포함된다.
- **C1 + C2: 가능 추정.** 나머지 생성자 호출 테스트가 같이 이행되고, 직접 접근 금지 검사는 전체 이행이 끝난 C2에서 도입된다.
- **C2만 master에 적용: 불가.** C1에서 추가하는 Template에 의존한다. 두 커밋의 독립성은 **순차 적용 시 각 단계가 컴파일 가능한지**로 해석해야 한다.
- **현재 워크트리 전체:** C3가 추가됐으므로 기존 통과 보고를 그대로 적용할 수 없다. 특히 R5의 테스트 의존성·목 구성을 먼저 보완해야 한다.

**커밋 조건:** C3 분리, R2 접근 검사 수정, R3·R4의 계약 및 테스트 보완, 실제 C1/C2 파일 manifest 확정 후 각 단계의 검증 결과를 별도로 기록한다.