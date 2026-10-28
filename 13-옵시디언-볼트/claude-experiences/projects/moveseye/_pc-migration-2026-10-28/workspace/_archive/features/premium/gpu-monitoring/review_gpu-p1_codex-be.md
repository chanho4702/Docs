## 검수 결과 — BE

**판정: 조건부 승인** — 🔴 차단 결함은 없지만, `detectedProfiles`, V72 JSON 내성, REMOVED 계약은 merge 전 수정하거나 설계·계약에서 명시적으로 제외 승인해야 합니다.

### 🔴 목록

없음.

### 🟡 목록

1. **다중 프로필인데 `detectedProfiles`에는 선택된 프로필 하나만 반환됩니다.**

   - 위치: [ZabbixGpuInventoryAdapter.java:710](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/gpu/ZabbixGpuInventoryAdapter.java:710), [ZabbixGpuInventoryAdapter.java:753](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/gpu/ZabbixGpuInventoryAdapter.java:753), [GpuHostInventory.java:54](/C:/worktrees/zm-78-be/engine-api/src/main/java/com/dmove/moveseye/engine/model/gpu/GpuHostInventory.java:54)
   - 근거: `chooseProfile()`은 모든 `candidates`를 계산하지만 선택된 프로필만 반환합니다. 이후 7인자 호환 생성자를 사용하여 `detectedProfiles`가 선택 프로필 하나로 기본화됩니다.
   - 재현: DCGM preset과 공식 NVML template이 함께 연결된 호스트에서 `MULTIPLE_PROFILES`는 나오지만 `detectedProfiles`는 `[MOVESEYE_DCGM_HTTP_V1]`만 반환됩니다. 제공된 런타임 실측에서도 확인됩니다.
   - 수정: 선택 프로필과 전체 후보를 함께 반환하는 구조체를 만들고 8인자 생성자로 전달하십시오. `multipleProfiles()` 테스트에 전체 배열 assertion을 추가해야 합니다.

2. **설계상 P1 필수인 REMOVED 24시간 기억 캐시가 구현되지 않았습니다.**

   - 위치: [GpuSnapshotService.java:151](/C:/worktrees/zm-78-be/src/main/java/com/dmove/moveseye/premium/gpu/snapshot/GpuSnapshotService.java:151)
   - 근거: 성공한 새 스냅샷을 이전 완전 스냅샷과 비교하지 않고 그대로 조립합니다. `LAST_PREFIX`는 소스 실패 시 `STALE_CACHE` 대체용일 뿐, 성공한 발견 결과에서 사라진 GPU를 REMOVED로 병합하지 않습니다. 이는 `devdesign_gpu-monitoring-p1.md §6`과 다르며 구현 인계서에서도 D3 미구현으로 기록되어 있습니다.
   - 재현: GPU A가 존재하는 성공 스냅샷 이후 LLD item까지 삭제된 성공 스냅샷을 반환하면 A가 즉시 사라지고 상세·시계열은 `GPU_NOT_FOUND`가 됩니다.
   - 수정: 성공한 발견끼리만 비교하는 최근 발견 캐시를 추가하여 사라진 GPU를 최대 24시간 `REMOVED`로 유지하십시오. 소스 실패 시에는 REMOVED로 전환하면 안 됩니다. 미구현을 유지하려면 P1 설계와 계약에서 명시적으로 제외해야 합니다.

3. **Zabbix 7.2+의 `status=1, ts_delete=0` LLD 유실 항목을 PRESENT로 오판합니다.**

   - 위치: [ZabbixGpuItem.java:50](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/gpu/model/ZabbixGpuItem.java:50), [ZabbixGpuInventoryAdapter.java:127](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/gpu/ZabbixGpuInventoryAdapter.java:127), [ZabbixGpuInventoryAdapter.java:886](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/gpu/ZabbixGpuInventoryAdapter.java:886)
   - 근거: 교차 버전 공통 필드만 요청하면서 `status`를 버렸고, `lost()`는 `ts_delete > 0`만 검사합니다. 삭제 보류가 “삭제 안 함”이거나 아직 삭제 예정 시각이 잡히지 않은 유실 항목은 계속 PRESENT입니다.
   - 재현: 7.4 응답의 `itemDiscovery={status:"1", ts_delete:"0"}`를 넣으면 `lost()==false`이고 `alive=true`가 됩니다.
   - 수정: 서버 capability에 따라 7.2+에서 `status`를 요청하거나, `selectItemDiscovery:"extend"`가 7.0/7.4 모두에서 안전한지 실측 후 사용하십시오. `status=1/ts_delete=0`과 “삭제 안 함” fixture가 필요합니다.

4. **V72는 `features`가 배열이 아닌 monitoring 모듈에서 Flyway migration 전체가 실패합니다.**

   - 위치: [V72__add_gpu_monitoring_permission.sql:69](/C:/worktrees/zm-78-be/src/main/resources/db/migration/V72__add_gpu_monitoring_permission.sql:69), [V72__add_gpu_monitoring_permission.sql:73](/C:/worktrees/zm-78-be/src/main/resources/db/migration/V72__add_gpu_monitoring_permission.sql:73), [V72__add_gpu_monitoring_permission.sql:100](/C:/worktrees/zm-78-be/src/main/resources/db/migration/V72__add_gpu_monitoring_permission.sql:100)
   - 근거: 최상위 `dmove_permission` 형태는 정규화하지만, `features`에 `{}`, 문자열 또는 JSON `null`이 들어간 경우 `jsonb_array_elements()`가 예외를 냅니다. 현재 IT는 누락·빈 배열·중복 모듈만 검사합니다.
   - 재현: `dmove_permission='[{"module":"monitoring","features":{}}]'::jsonb`인 역할에 V72를 실행하면 `cannot extract elements from an object`가 발생합니다.
   - 수정: 모든 `features` 접근을 `CASE WHEN jsonb_typeof(...)= 'array' THEN ... ELSE '[]'::jsonb END`로 정규화하고 object/string/JSON-null IT를 추가하십시오.

5. **인증 버전 probe는 “URL당 1회”와 Zabbix 호출 계측·예산 계약을 완전히 지키지 않습니다.**

   - 위치: [ZabbixClient.java:123](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:123), [ZabbixClient.java:242](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:242)
   - 근거:
     - `apiinfo.version`은 `doCallRaw()`를 직접 호출하여 `ZabbixCallMetrics.record()`에 별도 RPC로 기록되지 않습니다.
     - `ZabbixQueryExecutor`의 논리 호출 예산에도 포함되지 않습니다.
     - `get → probe → put`이 atomic하지 않아 최초 동시 요청 수만큼 probe가 중복될 수 있습니다.
   - 재현: 빈 캐시 상태에서 같은 URL로 인증 요청을 병렬 실행하면 복수의 `apiinfo.version` 호출이 가능합니다. 메트릭에는 원래 메서드 호출만 기록됩니다.
   - 수정: URL별 single-flight version resolver를 두고 probe도 실제 RPC로 별도 계측하십시오. 논리 조회 예산에서 제외할지 포함할지도 명시해야 합니다.

6. **기록된 “Zabbix URL 미설정 fresh install” 문제는 P1 설치 가이드 관점에서 범위 밖으로 보기 어렵습니다.**

   - 위치: [JwtAuthFilter.java:54](/C:/worktrees/zm-78-be/src/main/java/com/dmove/moveseye/auth/security/JwtAuthFilter.java:54), [JwtAuthFilter.java:101](/C:/worktrees/zm-78-be/src/main/java/com/dmove/moveseye/auth/security/JwtAuthFilter.java:101), [ZabbixClient.java:166](/C:/worktrees/zm-78-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:166)
   - 근거: admin 요청마다 filter가 `getSuperAdminToken()`을 호출하지만 filter는 `ApiError`를 잡지 않습니다. URL 미설정 오류를 NPE에서 명시적 `ApiError`로 바꿨을 뿐, filter 밖으로 빠져 error dispatch와 라이선스 오류로 가려지는 흐름은 남습니다.
   - 재현: Zabbix URL과 캐시된 admin token이 없는 상태에서 admin JWT로 보호 API를 호출합니다.
   - 수정: JWT 인증과 Zabbix session 해석을 분리하고, Zabbix token은 실제 Zabbix 의존 EP에서 lazy resolution하는 방향이 안전합니다. 최소한 P1 배포 전 “URL 사전 설정 필수” 운영 전제와 후속 티켓이 필요합니다.

### 🟢·의견

- `0`은 정상 유휴 값으로 보존되고, 빈 문자열·`NaN`·`Infinity`·sentinel은 상태값으로 분리됩니다. `parseDoubleOrZero` GPU 우회도 확인했습니다.
- 라이선스 경계는 `@Primary LicenseGuardedGpuInventoryPort`와 raw adapter 단일 qualifier로 닫혀 있고, 모니터링 4 EP와 setup 4 EP 모두 `@RequiresFeature(GPU_MONITORING)` 적용입니다.
- 캐시는 `sourceId + principalKey + 허용 host 집합 fingerprint`로 묶이며, 권한 판정이 캐시보다 먼저입니다. `STALE_CACHE`의 OK→STALE, 숫자 집계 null/0, health UNKNOWN도 계약과 일치합니다.
- 아이템별 역직렬화 격리는 정상입니다. 귀속 가능한 깨진 item은 해당 GPU·metric의 `PARSE_FAILED`로 노출되고 나머지 묶음은 유지됩니다.
- 프리셋 JavaScript의 UUID별 분리, 동일 UUID·동일 metric 중복의 `MOVESEYE_GPU_AMBIGUOUS`, `GPU_I_ID`가 있는 MIG 행 제외 로직은 일관됩니다. 다만 실제 다중 GPU/MIG 장비 검증은 아직 없으므로 잔여 검증 항목입니다.
- 6.0 LTS는 stub이 “header + body auth” 모양만 검증합니다. 실서버 smoke test 전에는 완전한 회귀 검증으로 볼 수 없습니다.
- 실제 작업 트리는 미커밋 상태가 아니라 **clean**입니다. 검수 범위는 `fd4fcfb..5dc84ee`의 두 커밋, 122파일 `+18,980/-31`로 잡았습니다.
- 현재 읽기 전용 환경에서는 Gradle wrapper가 `.gradle/...zip.lck`를 만들지 못해 재실행이 차단됐습니다. 기존 결과 XML에서는 `ZabbixClientAuthTransportTest` 6건, `ZabbixGpuInventoryAdapterTest` 39건, `GpuControllerIT` 8건이 실패 0으로 확인됩니다.

### R-A~R-I 답변

- **R-A — 조건부 통과.** 7.0/7.4의 header-only 경로와 6.0 body-auth 분기는 코드상 맞습니다. `ZabbixHealthAdapter`의 무인증 probe와 재귀 충돌은 없습니다. 다만 health probe와 version cache는 공유되지 않으며, 숨은 probe가 호출 계측·예산에서 빠지고 동시 single-flight도 아닙니다. 6.0 실서버 검증도 남았습니다.
- **R-B — 통과.** 신규 포트는 license decorator를 통해 주입되고 raw qualifier 우회 소비자는 없습니다. GPU 모니터링 4 EP와 설치 가이드 4 EP 모두 feature gate 적용입니다.
- **R-C — 미통과.** 정상 배열·모듈 누락·중복 모듈·비정상 boolean·재실행 멱등성은 처리하지만 `features` 자체가 비배열인 설치본은 migration을 중단시킵니다. BE V72 적용 후 FE 배포 순서도 유지해야 합니다.
- **R-D — 통과.** principal·role·Zabbix userid·caller role과 허용 host fingerprint가 모두 키·snapshot 바인딩에 들어갑니다. 권한 회수 후 host 집합이 바뀌면 과거 snapshot을 재사용할 수 없습니다.
- **R-E — 조건부 미통과.** 다른 `output`·`select*` 필드는 7.0/7.4 공통 범위로 확인됩니다. 하지만 공통 필드만 사용한 대가로 7.2+ `status=1/ts_delete=0` REMOVED 판정이 손실됩니다.
- **R-F — 통과.** `itemDiscovery: []`는 null로 정규화되고, 개별 변환 실패는 묶음 전체를 버리지 않습니다. `hostid/key_` 자체가 깨져 귀속 불가능한 원소는 호스트 진단으로 연결할 수 없다는 한계만 있습니다.
- **R-G — 통과, 잔여 실장비 검증 있음.** 제공된 실측상 7.0.6/7.4.15 import 성공이며 6.0은 catalog상 unavailable입니다. 다중 GPU·중복·MIG 처리는 논리적으로 맞지만 실제 다중 GPU/MIG 런타임은 미검증입니다.
- **R-H — 통과.** 공식 플러그인은 7.2.1 이상, 프리셋은 catalog `zabbixMajors` 기반입니다. `guideContext.zabbixServerHost`는 API URL host이므로 trapper 주소와 다를 수 있으며, 현재 계약대로 편집 가능한 기본값으로만 사용해야 합니다.
- **R-I — 절반만 범위 밖 판단이 타당합니다.** 재기동 후 캐시된 Zabbix session 401은 기존 session lifecycle 문제이므로 별도 과제가 맞습니다. 반면 URL 미설정 fresh install은 설치·설정 화면 접근을 막을 수 있어 P1 setup 흐름의 운영 전제입니다. 수정하지 않는다면 최소한 릴리스 전제와 후속 티켓으로 명시해야 합니다.