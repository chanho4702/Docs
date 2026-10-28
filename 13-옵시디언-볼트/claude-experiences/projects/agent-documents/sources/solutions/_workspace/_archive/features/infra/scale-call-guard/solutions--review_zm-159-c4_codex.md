# ZM-159 C4 구현 검수 — Codex (gpt-5.6-sol)

## 0. 판정

**❌ 커밋 보류**

- 검수 범위: `HEAD 6f638e1` 대비 미커밋 변경 33항목(수정 30, 신규 3).
- 24개 구현의 126개 호출 지점을 전수 대조한 결과, **이전 메서드 문자열과 새 `ZabbixMethod.rpcName`의 불일치는 없다.**
- 이전에 사용하던 고유 메서드 111개와 이넘 111개의 집합도 정확히 일치한다.
- 다만 `listByIds`가 특정 설정에서 전역 `max-total-rows`를 우회하는 🔴 결함이 있어 현재 상태로는 커밋할 수 없다.
- 사용자 지시에 따라 빌드·테스트는 실행하지 않았다. 요청서에 기재된 `218 tests passed` 등은 독립적으로 재검증하지 않았다.

## 1. 중점 확인 1~6

### 1. 이넘 전환의 동작 불변

**✅ 정상. 유효한 호출의 JSON-RPC 메서드 이름은 전부 동일하다.**

- 24개 구현, 126개 호출 지점을 HEAD와 순서대로 비교했다.
- 문자열과 동적 LLD 확장을 합친 고유 메서드는 111개이며, 이넘의 `rpcName` 111개와 양방향 차집합이 없다.
- `ZabbixApiTemplate`은 `ZabbixMethod`만 받고 전송 직전에 `rpcName()`으로 되돌린다: [ZabbixApiTemplate.java:48](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplate.java:48), [ZabbixApiTemplate.java:82](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixApiTemplate.java:82).
- 전송 계층은 이전과 같이 해당 문자열을 JSON-RPC `method`에 넣는다: [ZabbixClient.java:135](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:135).
- 특수 호출도 일치한다.
  - `apiinfo.version`: [ZabbixHealthAdapter.java:73](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/health/ZabbixHealthAdapter.java:73)
  - `script.getscriptsbyhosts`: [ZabbixScriptServiceImpl.java:26](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/script/ZabbixScriptServiceImpl.java:26)
  - `usermacro.*global`: [ZabbixUserMacroServiceImpl.java:44](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/usermacro/ZabbixUserMacroServiceImpl.java:44)
- LLD 동적 호출은 이전의 `kind + "prototype.…"` 식을 그대로 `ZabbixMethod.of(...)`로 감쌌다: [ZabbixLldServiceImpl.java:73](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/lld/ZabbixLldServiceImpl.java:73), [ZabbixLldServiceImpl.java:78](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/lld/ZabbixLldServiceImpl.java:78), [ZabbixLldServiceImpl.java:83](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/lld/ZabbixLldServiceImpl.java:83). 유효한 `item/trigger/graph/host × create/update/delete` 12개가 모두 이넘에 있다: [ZabbixMethod.java:53](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:53).
- 등록되지 않은 `kind`는 이제 Zabbix까지 전송되지 않고 애플리케이션에서 선제 거부된다: [ZabbixMethod.java:196](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:196). 실제 호출자는 네 종류로 제한하므로 정상 동작에는 영향이 없다: [ZabbixLldService.java:53](C:/worktrees/zm-159-be/engine-api/src/main/java/com/dmove/moveseye/zabbix/lld/ZabbixLldService.java:53), [ZabbixLldPrototypeManageService.java:477](C:/worktrees/zm-159-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixLldPrototypeManageService.java:477).

### 2. `ZabbixMethod.Access` 분류

**✅ 공식 조사표와 일치한다.**

이넘 111개, JSON 111개, 사람용 Markdown 111개를 `method/access/url` 기준으로 대조했으며 불일치는 없었다.

요청된 경계 메서드도 모두 정확하다.

| 메서드 | 분류 | 근거 |
|---|---|---|
| `script.getscriptsbyhosts` | READ | [JSON:2128](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:2128), [이넘:129](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:129) |
| `event.acknowledge` | WRITE | [JSON:534](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:534), [이넘:74](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:74) |
| `script.execute` | WRITE | [JSON:2108](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:2108), [이넘:128](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:128) |
| `task.create` | WRITE | [JSON:2147](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:2147), [이넘:70](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:70) |
| `token.generate` | WRITE | [JSON:2454](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:2454), [이넘:158](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:158) |
| `history.push` | WRITE | [JSON:773](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:773), [이넘:79](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:79) |
| `user.login/logout` | AUTH | [JSON:2873](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:2873), [JSON:2892](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:2892), [이넘:146](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:146) |
| `apiinfo.version` | INFO | [JSON:135](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:135), [이넘:38](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixMethod.java:38) |

보호 층의 READ 강제도 모든 진입점에 적용된다: [ZabbixQueryExecutor.java:112](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:112), [ZabbixQueryExecutor.java:148](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:148), [ZabbixQueryExecutor.java:292](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:292), [ZabbixQueryExecutor.java:515](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:515).

### 3. `ZabbixMethodTest`의 버전 상승 감지

**⚠️ 핵심 대조는 되지만, 현재 상태로는 “상수와 조사표만 교체”하는 버전 상승이 불가능하다.**

정상인 부분:

- `DOCS_VERSION`으로 리소스 파일명을 조립하므로 새 조사표가 없으면 실패한다: [ZabbixMethodTest.java:29](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:29).
- JSON 내부 버전도 대조한다: [ZabbixMethodTest.java:39](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:39).
- 모든 이넘의 존재·`verified`·성격·URL을 대조한다: [ZabbixMethodTest.java:45](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:45).
- 조사표에만 남은 메서드도 검출한다: [ZabbixMethodTest.java:58](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:58).

문제:

- 링크 형태 테스트가 버전 `7.0`을 직접 박아 두었다: [ZabbixMethodTest.java:77](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:77). `DOCS_VERSION`과 새 JSON만 `7.2` 등으로 바꾸면 이 테스트가 잘못 실패한다.

### 4. `listByIds` 보유 행 상한

**❌ 기본 설정에서는 보수적으로 동작하지만, 전역 `max-total-rows`가 `max-held-rows`보다 작은 설정에서는 전역 예산을 우회한다.**

현재 구현은 호출자 `maxTotalRows`가 없으면 무조건 `maxHeldRows`를 요청별 override로 넣는다: [ZabbixQueryExecutor.java:70](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:70).

그러나 `Budget`은 override가 들어오면 전역 `limits.getMaxTotalRows()`를 사용하지 않는다: [ZabbixQueryExecutor.java:546](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:546).

따라서 예를 들어:

- `max-total-rows=1,000`
- `max-held-rows=10,000`
- 호출자 override 없음

이면 종전 전역 예산 1,000 대신 10,000을 사용한다. “받은 행 예산을 좁힌다”가 아니라 설정에 따라 예산을 넓힌다. 현재 테스트도 `max-held-rows`만 확인하고 더 낮은 전역 예산과의 관계는 확인하지 않는다: [ZabbixQueryExecutorTest.java:809](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java:809).

### 5. 16MiB 기본값의 정상 경로 회귀 위험

**⚠️ 실제 응답이 16MiB를 넘는지는 정적 검수만으로 확정할 수 없지만, 정상적인 무제한 전체 조회 경로가 존재하므로 위험 없음으로 판정할 수 없다.**

- 기본 상한은 16MiB다: [ZabbixCallLimits.java:41](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:41).
- 초과 응답은 전송 계층에서 즉시 실패한다: [ZabbixClient.java:246](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:246).
- 자산 전체 동기화는 `host.get`에 `selectInventory=extend`, interfaces, tags를 붙이고 `limit`이나 ID 청크 없이 전체 호스트를 조회한다: [AssetSyncService.java:87](C:/worktrees/zm-159-be/src/main/java/com/dmove/moveseye/asset/AssetSyncService.java:87), [AssetSyncService.java:234](C:/worktrees/zm-159-be/src/main/java/com/dmove/moveseye/asset/AssetSyncService.java:234).
- 호스트 5천 대라면 호스트당 평균 약 **3.28KiB**만 넘어도 16MiB를 초과한다. `selectInventory=extend`를 포함하므로 현실적인 회귀 후보이다.
- 런타임 Dockerfile에는 명시적인 `-Xmx`나 `MaxRAMPercentage`가 없다: [Dockerfile:23](C:/worktrees/zm-159-be/Dockerfile:23).

OOM 방어 목적은 타당하지만, 64→16MiB 변경은 실측 없이 안전하다고 단정할 수 없다.

### 6. 조사표 JSON의 테스트 리소스 배치

**✅ 적절하다.**

- 파일은 약 97.4KiB이며 `src/test/resources`에만 있어 프로덕션 소스나 런타임 로직을 오염시키지 않는다.
- 버전·조사일·공통 파라미터 출처가 포함되어 있다: [api-reference-7.0.json:1](C:/worktrees/zm-159-be/engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json:1).
- 테스트가 classpath 리소스로 직접 읽어 오프라인·재현 가능한 검증을 수행한다: [ZabbixMethodTest.java:29](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:29).
- 사람용 조사표와 JSON은 111개 `method/access/url`이 모두 일치한다: [zabbix-api-7.0-methods.md:1](C:/solutions/_workspace/features/platform/zabbix-api-reference/zabbix-api-7.0-methods.md:1).

## 2. 메서드 이름 전수 대조 (불일치만 표, 없으면 확인 범위)

**불일치 없음.**

대조 결과:

- 24개 구현
- 126개 호출 지점
- 고유 메서드 111개
- 이전 문자열 집합 = 새 이넘 `rpcName` 집합
- 현재 프로덕션 코드에 `api.raw/list/call/object/count/firstId/exec("…")` 형태의 문자열 호출 잔존 없음

| 확인 파일 | 호출 수 | 확인 파일 | 호출 수 |
|---|---:|---|---:|
| [ZabbixEventServiceImpl.java:24](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/event/ZabbixEventServiceImpl.java:24) | 3 | [ZabbixProblemServiceImpl.java:27](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alert/problem/ZabbixProblemServiceImpl.java:27) | 4 |
| [ZabbixActionServiceImpl.java:24](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/alertaction/ZabbixActionServiceImpl.java:24) | 5 | [ZabbixDiscoveryServiceImpl.java:26](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/discovery/ZabbixDiscoveryServiceImpl.java:26) | 7 |
| [ZabbixHealthAdapter.java:73](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/health/ZabbixHealthAdapter.java:73) | 1 | [ZabbixHostServiceImpl.java:33](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/host/ZabbixHostServiceImpl.java:33) | 11 |
| [ZabbixHostGroupServiceImpl.java:36](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/hostgroup/ZabbixHostGroupServiceImpl.java:36) | 6 | [ZabbixHttpTestServiceImpl.java:30](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/httptest/ZabbixHttpTestServiceImpl.java:30) | 4 |
| [ZabbixRoleServiceImpl.java:38](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/role/ZabbixRoleServiceImpl.java:38) | 5 | [ZabbixTokenServiceImpl.java:40](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/token/ZabbixTokenServiceImpl.java:40) | 4 |
| [ZabbixUserServiceImpl.java:82](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/user/ZabbixUserServiceImpl.java:82) | 9 | [ZabbixUserGroupServiceImpl.java:37](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/identity/userGroup/ZabbixUserGroupServiceImpl.java:37) | 5 |
| [ZabbixItemServiceImpl.java:72](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/item/ZabbixItemServiceImpl.java:72) | 6 | [ZabbixLldServiceImpl.java:25](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/lld/ZabbixLldServiceImpl.java:25) | 14 |
| [ZabbixMaintenanceServiceImpl.java:19](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/maintenance/ZabbixMaintenanceServiceImpl.java:19) | 4 | [ZabbixMediaTypeServiceImpl.java:24](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/mediatype/ZabbixMediaTypeServiceImpl.java:24) | 5 |
| [ZabbixProxyServiceImpl.java:25](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/proxy/ZabbixProxyServiceImpl.java:25) | 1 | [ZabbixScriptServiceImpl.java:19](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/script/ZabbixScriptServiceImpl.java:19) | 6 |
| [ZabbixTemplateServiceImpl.java:31](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/template/ZabbixTemplateServiceImpl.java:31) | 10 | [ZabbixHistoryPushImpl.java:50](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryPushImpl.java:50) | 1 |
| [ZabbixHistoryServiceImpl.java:50](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:50) | 2 | [ZabbixTrendServiceImpl.java:31](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/trend/ZabbixTrendServiceImpl.java:31) | 1 |
| [ZabbixTriggerServiceImpl.java:21](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/trigger/ZabbixTriggerServiceImpl.java:21) | 5 | [ZabbixUserMacroServiceImpl.java:22](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/usermacro/ZabbixUserMacroServiceImpl.java:22) | 7 |

## 3. 결함

### 🔴 R1 — `listByIds`가 낮게 설정된 전역 행 예산을 우회

- **근거:** 호출자 override가 없으면 `maxHeldRows`를 override로 주입한다: [ZabbixQueryExecutor.java:70](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:70). `Budget`은 override가 있으면 전역 `maxTotalRows`를 무시한다: [ZabbixQueryExecutor.java:546](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:546).
- **영향:** 운영자가 `max-total-rows`를 10,000보다 낮게 조인 환경에서 안전 설정이 무시된다.
- **수정안:** 유효 예산을 다음과 같이 계산한다.
  - 호출자 값이 있으면 `min(callerMaxTotalRows, maxHeldRows)`
  - 호출자 값이 없으면 `min(limits.maxTotalRows, maxHeldRows)`
- **추가 테스트:** `max-total-rows=2`, `max-held-rows=3`, 호출자 override 없음에서 2행까지만 보유하는 반례를 추가한다.

### 🟡 R2 — 버전 상승 테스트에 `7.0`이 중복 하드코딩됨

- **근거:** [ZabbixMethodTest.java:80](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:80)
- **영향:** `DOCS_VERSION`과 새 조사표를 함께 교체해도 테스트 코드를 추가 수정해야 한다. “버전 한 곳”이라는 C4 목적과 충돌한다.
- **수정안:** 기대 URL을 `ZabbixMethod.DOCS_VERSION`으로 조립하거나, 이미 전 메서드 URL을 JSON과 비교하므로 해당 고정 문자열 검증을 제거한다.

### 🟡 R3 — 16MiB 기본값의 정상 전체 동기화 회귀 가능성

- **근거:** [ZabbixCallLimits.java:41](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:41), [AssetSyncService.java:234](C:/worktrees/zm-159-be/src/main/java/com/dmove/moveseye/asset/AssetSyncService.java:234)
- **영향:** 전체 `host.get + selectInventory=extend` 응답이 16MiB를 넘으면 자산 동기화 전체가 `ApiError`로 실패한다.
- **수정안:** 다음 중 하나를 커밋 전 결정한다.
  1. 5천 호스트 현실 데이터로 최대 응답과 피크 힙을 실측한 뒤 16MiB를 확정한다.
  2. `AssetSyncService.fetchHosts`를 ID 청크/소비형 순회로 전환한 뒤 기본값을 낮춘다.
  3. 실측 전에는 기본값 64MiB를 유지하고, 검증된 환경에서만 설정으로 16MiB를 적용한다.

### 🟢 R4 — 조사표 중복 행을 테스트가 검출하지 않음

- **근거:** 조사표를 `HashMap.put`으로 적재해 같은 `method`가 중복되면 마지막 항목만 남는다: [ZabbixMethodTest.java:26](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:26), [ZabbixMethodTest.java:36](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixMethodTest.java:36).
- **영향:** 111개를 모두 포함한 상태에서 중복 행이 추가된 잘못된 조사표도 통과할 수 있다.
- **수정안:** `methods`가 배열인지, 원본 배열 크기와 고유 메서드 수가 같은지 명시적으로 검증한다.

**커밋 가능 여부: 불가.** 최소한 🔴 R1 수정과 반례 테스트가 필요하다. R2도 C4의 핵심 목표인 버전 교체성을 직접 훼손하므로 같은 커밋에서 함께 수정하는 것이 타당하다.