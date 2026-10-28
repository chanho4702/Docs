# moveseye-be-spring 로직 검토 & 저위험 리팩토링 리뷰

작성일: 2026-07-02
대상: `C:\solutions\moveseye-be-spring` (Spring Boot 3.3, BE 정본)
검증: `.\gradlew.bat build --console=plain` (JDK17) — **BUILD SUCCESSFUL (test 포함)**, 변경 전/후 모두 그린.
원칙: API 계약 1:1 보존. 응답 shape·필드명·상태코드·경로·의도적 quirk(403→200, @RolesGuarded 범위, Boolean is-접두, Zabbix String 본문, self-invocation @Transactional, 직렬화 포맷) 불변.

전반 평가: **코드베이스가 매우 정결하다.** 대형 서비스(HostService 114KB, EventService, UserService, DiskService, AwsServiceImpl, ReportService 등)와 메트릭 서비스(Cpu/Memory/Network/Disk), 컨트롤러, 공통 유틸을 검토했으나 데드코드·미사용 멤버는 거의 없었다. NestJS→Spring 포팅 과정에서 정리가 잘 되어 있어 저위험 리팩토링 여지가 제한적이다.

---

## (A) 적용한 저위험 리팩토링 — 4건

동작/직렬화 계약 불변. 각 변경은 바이트 단위로 동일한 결과를 내거나(중복 제거), 컴파일 산출물에 영향 없음(미사용 import).

1. **미사용 import 제거 — ReportService.java**
   - 파일: `host/report/ReportService.java` (구 8행)
   - 내용: `import com.dmove.moveseye.domain.HostGroupReportJson;` 제거.
   - 근거: 외부 클래스 `HostGroupReportJson` 자체는 본문에서 참조되지 않는다. 실제 사용되는 중첩 타입(`Alerts`/`AlertTotals`/`HostResource`/`MetricSummary`/`Resource`/`TopHost`)은 각각 별도 import(9~14행)로 자립적으로 참조되어 외부 클래스 import가 불필요.

2. **미사용 import 제거 — UserGroupService.java**
   - 파일: `user/service/UserGroupService.java` (구 7행)
   - 내용: `import com.dmove.moveseye.common.response.SortDirection;` 제거.
   - 근거: 본문(88행)은 `query.getSortDirection().name()` 메서드 호출만 하고 `SortDirection` 타입명을 명시 참조하지 않는다. 메서드 반환 타입은 import 불요.

3. **파일 내 중복 메서드 제거 — EventService.java**
   - 파일: `event/EventService.java`
   - 내용: `strOrNull(Object)` 메서드 제거 + 유일 호출부(구 261행 `f.causeEventId = strOrNull(...)`)를 `str(...)`로 교체.
   - 근거: `str`와 `strOrNull`은 구현이 완전히 동일(`o == null ? null : String.valueOf(o)`). 나머지 60여 곳은 모두 `str`을 사용. 동작 동일, 명명 일관성 향상.

4. **파일 내 중복 로직 통합 — ReportManagementService.java**
   - 파일: `host/report/ReportManagementService.java` (`updateRetentionSetting`)
   - 내용: 인라인 `retentionRepository.findById(SINGLETON_ID).orElseGet(defaults)`를 기존 private 헬퍼 `loadOrDefault()` 호출로 대체.
   - 근거: `getRetentionSetting`/`runCleanup`은 이미 `loadOrDefault()`를 쓰는데 `updateRetentionSetting`만 동일 로직을 인라인 중복. 동일 결과, 단일 소스화.

---

## (B) 제안만 하고 보류한 항목 (광범위/저가치 — 사용자 확인 필요)

1. **[cross-cutting] 메트릭 헬퍼 중복** — 보류 사유: 여러 파일 걸침(적용 금지 대상)
   - `parseDoubleOrZero(String)`, `nz(Double)`, `lastValue(items,key)`, `findByKey(items,key)`가 `host/cpu/CpuService`, `host/memory/MemoryService`, `host/network/NetworkService`, `host/disk/DiskService`에 거의 동일 구현으로 반복.
   - 제안: `common/util/MetricUtils`(또는 신규 `ZabbixItemUtils`)로 추출. 시그니처가 `ZabbixBasicItem`에 의존하므로 위치·가시성 결정 필요. 다수 파일 편집 → 회귀 위험 있어 별도 승인 시 진행 권장.

2. **[동일 파일 구조 중복, 위험] MemorySummary 산출** — 보류 사유: 미묘한 차이로 리스크
   - `MemoryService.getSummaryMemory`와 `getSummarySwap`가 near-identical 구조. 다만 item 조회가 `get` vs `getByListKey`로 다르고 키/타입이 달라 헬퍼 추출 시 파라미터화가 필요. 잘못 통합하면 응답 값이 바뀔 수 있어 보류.

3. **[저가치 정리]**
   - `auth/service/AuthService.java` import 순서: `com.auth0.jwt.interfaces.DecodedJWT`(27행)가 dmove import 사이에 끼어 있음. 기능 무관 정렬 이슈 — 개별 import 방침엔 부합하나 순서만 어긋남. 코스메틱이라 미적용.
   - `common/util/MetricUtils.java`: `import java.util.List`가 있는데 `parseLsblkOutput` 내부는 `java.util.List`/`java.util.ArrayList`/`java.util.Arrays`를 FQCN으로 사용(혼용). 일관성만의 문제라 미적용.

---

## (C) 발견한 잠복 버그 후보 (동작 변경 우려로 미적용 — 검토용 기록)

모두 **원본 동작 보존**을 위해 그대로 두었다. 실제 버그인지 확인 후 별도 결정 필요.

1. **[원본 quirk, 코드 주석 존재] 로그인 세션 TTL 단위 의심** — `auth/service/AuthService.java` login()
   - `redisClientService.set(key, visitorId, 60L*60*24*1000)` — 주석에 "약 1000일, 단위 의심되나 그대로 유지"라고 명시됨. 초 단위라면 ~1000일. 원본 NestJS 값 보존 중. 세션 만료 정책 재검토 여지.

2. **[원본 `||` 의미 보존] pused=0 폴백** — `host/memory/MemoryService.java` resolveUsagePercentage()
   - `pusedValue != 0 ? pusedValue : (currentUsage/(total||1))*100`. 실제 사용률이 정확히 0%인 경우에도 계산값으로 폴백. 원본 `Number(pused) || ...` 의미를 그대로 옮긴 것으로 의도적. 극단 케이스(진짜 0%)에서만 미세 차이.

3. **[대량 삼킨 예외 — 대부분 의도적]**
   - `aws/AwsServiceImpl` region 팬아웃(`vpcsForRegion`/`instancesForRegion`/`runParallel`)은 개별 실패를 로그 후 skip/null 수집. 원본의 region 루프 skip 거동 보존 — 의도적. 다만 자격증명 오류 등도 조용히 삼켜 "빈 목록"으로 보일 수 있음(운영 시 로그 확인 필요).
   - 이 외 서비스들의 `catch (Exception) { log.warn(...); return fallback }` 패턴은 graceful degradation 의도로 판단, 변경 안 함.

> 위 3건은 **버그 확정이 아니라 후보**이며, 모두 원본 계약/동작 보존 원칙에 따라 손대지 않았다.

---

## 검증 로그
- 변경 전 baseline: `build` BUILD SUCCESSFUL (test 포함).
- 변경 후: `build` BUILD SUCCESSFUL in 26s (test 포함), 컴파일/테스트 그린.
- 미사용 import/private 메서드 전수 휴리스틱 스캔 수행 → 실사용 확인(메서드 참조 `this::x`, `TypeReference<Record>` 등은 오탐 처리). 순수 미사용은 위 2건뿐.
