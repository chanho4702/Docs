# 호스트 메트릭 도메인 — MetricUtils 추출 & 로직 검토

작성일: 2026-07-02
대상: `moveseye-be-spring` host/cpu·memory·network·disk·hostinterface·responsetime + `common/util/MetricUtils`
검증: `.\gradlew.bat build --console=plain` (JDK17) → **BUILD SUCCESSFUL (test 포함)**. 변경 전/후 그린.
원칙: API 계약 1:1 보존. **출력이 바뀌는 수정은 0건**(적용한 것은 전부 응답 불변).

---

## (A) MetricUtils 추출 결과

`common/util/MetricUtils`는 이미 존재(bytesToMB/KB, min/max, lsblk, 정규식)했다. 여기에 서비스마다
**바이트-투-바이트 동일**하던 헬퍼 4종을 static 순수함수로 추가하고 호출부를 교체했다.

### 추출한 것 (파일: `common/util/MetricUtils.java`)
| 헬퍼 | 시그니처 | 교체된 서비스(로컬 제거) | 근거 |
|---|---|---|---|
| `parseDoubleOrZero` | `(String)→double` | Cpu, Memory, Network, Disk (4곳) | 4개 구현이 완전 동일(null→0 / NFE→0). |
| `nz` | `(Double)→double` | Memory, Network (2곳) | 동일(`v!=null?v:0`). |
| `findByKey` | `(List<ZabbixBasicItem>,String)→ZabbixBasicItem` | Cpu, Memory (2곳) | 동일(`filter(key.equals).findFirst().orElse(null)`). |
| `lastValue` | `(List<ZabbixBasicItem>,String)→String` | Cpu, Memory (2곳) | Cpu/Memory 구현 동일(findByKey 기반). |

- `MetricUtils`에 `import ...ZabbixTypes.ZabbixBasicItem` 1개 추가(패키지 순환 없음 — zabbix는 MetricUtils를 참조하지 않음).
- 단위테스트 추가: `MetricUtilsTest`에 parseDoubleOrZero/nz/findByKey/lastValue 경계값(null/빈문자/비숫자/0/음수/정상/미존재/빈목록) 4개 케이스.

### 통합하지 않은 것 (동작·형태 차이 → 계약 보존 위해 로컬 유지)
1. **Network.lastValue** — 구현이 `map(::lastvalue).findFirst()`라 매칭 item의 lastvalue가 null이면 `Stream.findFirst`가 **NPE**를 던진다(공용판은 graceful null 반환). 극단 케이스 동작 차이 = 계약 차이 → 로컬 보존 + 코드 주석 명시.
2. **Memory.avg vs ResponseTime.avg** — 출력은 모든 입력에서 동일하나(빈 리스트 0, 나머지 sum/size) Memory는 명시적 empty-guard가 있고 ResponseTime은 없다. 소스 형태가 달라(byte-identical 아님) 2개 파일에만 존재 → 통합 보류.
3. **ResponseTime.itemId** — key 일치 item의 **itemid** 반환(lastValue와 반환 대상이 다른 함수).
4. **ResponseTime.max** — `max().orElse(0)`, 단독.
5. **Disk.parseDoubleOrNull** — null 반환 변형(파싱 실패 시 0이 아닌 null), 단독.
6. **Interface.parseLongOrZero** — `(long)Double.parseDouble`, long 캐스팅 변형, 단독.

---

## (B) 적용한 효율 개선 (응답 불변)

1. **NetworkService.getSummary — Zabbix history.get N+1 제거**
   - 파일: `host/network/NetworkService.java`
   - 전: 매칭된 metric(iface×in/out)마다 `getHistoryByItemids(itemids=[단일])`를 **루프 안에서 1회씩** 호출(인터페이스 10개면 ~20회).
   - 후: 매칭 itemid를 모아 **history.get 1회** 호출 → 메모리에서 `itemid`별 그룹핑 후 동일 계산.
   - 응답 불변 확인: iface 등록 순서(networkMetrics 순회 순서), 값 empty 판정, current(lastValue 기반), min/max/avg 계산, in/out 슬롯 배치, emptySummary 폴백 모두 기존과 동일. itemid별 값 집합이 개별 조회와 같아 산출값 동일.

> 그 외 N+1 후보 점검: DiskService.getGroupCurrent는 이미 그룹 일괄 조회(각 1회)로 배치됨. ResponseTime.getSummary·Interface는 이미 itemid 일괄 1회. Cpu/Memory/Disk/ResponseTime의 getLineCharts는 타입별 키가 달라 배치 불가(인위적 통합은 로직 변경) → 손대지 않음.

---

## (C) 적용한 correctness 수정

**없음(0건).** 출력이 달라지는 수정은 계약 보존 및 FE(현재 :3000 Nest 연결) 정합을 위해 적용하지 않았다.
발견한 correctness 후보는 (D)/(E)에 기록.

---

## (D) 보류/제안 (동작 변경 우려 — 적용 안 함)

1. **MemoryService.resolveUsagePercentage `pused=0` 폴백** — `pusedValue != 0 ? pusedValue : (currentUsage/(total||1))*100`. 실제 사용률이 정확히 0%여도 계산값으로 폴백.
   - 판정: **버그 아닌 의도적 1:1 포팅.** 원본 NestJS `Number(pused) || ...` 의 falsy(0/"") 폴백을 정확히 재현. 코드 주석·기존 리뷰(be_refactor-review.md C2)에 문서화된 quirk → **건드리지 않음.**
   - 제안: pused=0을 "리터럴 0%"로 취급해야 하는지는 제품 확인 후 결정. 바꾸면 진짜 0% 케이스에서만 미세 변화(출력 변경이므로 별도 승인 필요).
2. **ResponseTimeService.getSummary 빈 itemids 가드** — ping item이 하나도 없으면 `itemIds=[]`인 채 `history.get(itemids=[])`를 호출(무제한/위험 질의 가능성). 현재 출력은 null-itemid 필터로 0/0 → early-return 가드는 **출력 불변**이지만, Zabbix가 빈 itemids에 예외를 던지는 경우 error→success로 **에러 시맨틱이 바뀔 수** 있어 미적용. 제안만.
3. **삼킨 예외** — Disk.resolveHostName(RuntimeException→null)/parseFilesystem(Exception→null)은 graceful degradation 의도. 에러 전파로 바꾸면 동작 변화 → 제안만.
4. **Memory.avg / ResponseTime.avg 통합** — 출력 동일하나 소스 형태 차이·2파일뿐 → 저가치 보류.
5. **Memory.getSummary(memory+swap), Cpu 등 독립 조회 병렬화** — 호출 2건 수준이라 이득 미미, 미적용.

---

## (E) 발견했으나 미수정한 버그 후보 (검토용)

1. **MemoryService.getSummarySwap의 usagePercentage가 memory pused 키 사용** — swap 요약인데 `resolveUsagePercentage`가 `VM_MEMORY_PUSED`(메모리용 pused)를 읽는다(searchKeys에도 SYSTEM_SWAP_SIZE + **VM_MEMORY_PUSED**를 넣음). swap 자체 pused가 아니어서 swap usagePercentage가 메모리 pused%로 나올 소지. **원본 포팅 충실성 확인 필요**하며 출력에 영향 → 미수정(원본 대조 후 결정 권장).
2. **resolveUsagePercentage pused=0** — (D)1 참조. 원본 `||` 충실 포팅으로 후보이나 확정 아님.
3. **DiskService RW_IOPS/RW_BPS 항상 /1** — 원본이 dividend를 잘못 인덱싱해 READ 값 그대로 나오던 버그를 **의도적으로 보존**(코드 주석 명시). 계약 보존 대상이라 미수정.

---

## 검증 로그
- `.\gradlew.bat build --console=plain` (JAVA_HOME=jdk-17): **BUILD SUCCESSFUL in 18s** (compileJava/test/check 포함).
- 신규 MetricUtilsTest 케이스 4개 포함 전체 테스트 그린.
- 실행 중 :3000 프로세스 미접촉.
