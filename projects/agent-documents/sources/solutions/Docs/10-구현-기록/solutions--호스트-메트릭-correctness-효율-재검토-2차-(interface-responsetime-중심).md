# 호스트 메트릭 correctness/효율 재검토 2차 (interface·responsetime 중심)

작성일: 2026-07-02
대상: `moveseye-be-spring` host/hostinterface(InterfaceService), host/responsetime(ResponseTimeService) — 주 대상
      host/cpu(CpuService), host/disk(DiskService), host/network(NetworkService) — correctness 버그 관점 재확인
검증: `.\gradlew.bat build --console=plain` (JDK17) → **BUILD SUCCESSFUL** (test 포함). 코드 변경 없음(무변경 baseline 그린).
원칙: API 계약 1:1 보존. 원본 Nest(`C:\solutions\moveseye-be\src\host\...`) 대조.
결론 요약: **적용한 correctness 수정 0건 / 효율 개선 0건 / 신규 버그 확정 0건.**
1차 패스(ZM-82 interface total, memory swap pused)에서 실질 버그가 이미 정리되어, 이번 범위에서는
새로 고칠 correctness 버그를 찾지 못했다(주 대상 2종은 Nest와 바이트 단위로 정합).

---

## (A) 적용한 correctness 수정
**없음(0건).** 아래 대조 결과 주 대상·보조 대상 모두 원본과 정합하여 수정할 것이 없었다.

### 대조 상세 (버그 없음 확인)
1. **InterfaceService.getInterfaceStatusSummary** — up/down/adminDown 카운트, total 산출(discovery LLD 배열 →
   ifNumber → up+down 폴백)이 모두 Nest와 일치. total 관련 결함은 ZM-82에서 이미 수정 완료(재검토 제외 대상).
   키 상수값(`ifNumber`/`ifOperStatus`/`ifAdminStatus`/`net.if.discovery`) Nest와 동일 확인.
2. **InterfaceService.getInterfaceLineCharts** — UP/DOWN(ifOperStatus 1/2), ADMIN_DOWN(ifAdminStatus=2)
   timestamp 카운트, history=UNSIGNED, itemid→key 매핑 로직 모두 Nest 1:1.
3. **ResponseTimeService.getSummary** — icmppingsec/icmppingloss itemid 매칭(exact `key.equals`, Nest `===` 동일),
   history=FLOAT, avg=sum/max(size,1), max=max().orElse(0)(Nest `Math.max(...,0)`) 모두 정합.
   SummaryDto(max, avg) 생성자 인자 순서도 올바름(max←max, avg←avg).
4. **ResponseTimeService.getLineChart** — filterKey(exact) + items[0].itemid history 조회, 빈 결과 시 빈 data 반환 — Nest 동일.
5. **CpuService.getSummary** — <1h history / >1h trend 분기, avg=(min|max null → null) 가드, JOWAIT/IOWAIT 동일 키 매핑 — Nest 정합.
6. **DiskService.getSummary** — usagePercentage=`used!=0&&total!=0?(used/total)*100:0` (Nest `used&&total?...:0`와 동치,
   totalSpace는 Math.max(1,...)라 항상 양수) — 정합.

### 캐스팅 안전성 확인
- 모든 서비스의 `((Number) historyPoint.value())` 캐스팅은 안전. `ZabbixHistoryServiceImpl`가 history 타입이
  FLOAT/UNSIGNED일 때 value를 `Double`로 정규화(52행) → interface(UNSIGNED)/responsetime(FLOAT) 모두 Number.

---

## (B) 적용한 효율 개선
**없음(0건).**
- Interface·ResponseTime의 history.get은 이미 itemid 일괄 1회 조회(N+1 없음).
- Network의 history.get N+1은 1차 패스에서 이미 제거됨(be_metric-refactor.md B1).
- getByListKey의 키별 개별 item.get(N회)은 원본 getByListKey 거동 그대로(Zabbix search OR로 단일화하면
  중복/시맨틱 변동 위험) → 보존.

---

## (C) 보류/제안 (애매·위험 — 미적용)
1. **ResponseTimeService.getLineCharts 병렬화** — Nest는 `Promise.all`(병렬), Spring은 `.stream().map()`(순차).
   type 2개(response/packet loss)×(item.get+history.get)=최대 4콜. parallelStream 전환은 출력 불변이나
   이득 미미·공유 authToken 컨텍스트 복잡도 증가 → 제안만.
2. **ResponseTimeService.getSummary 빈 itemids 가드** — ping item이 0개면 `history.get(itemids=[])` 호출.
   현재 출력은 0/0으로 정상이나 Zabbix가 빈 itemids에 예외 시 error→success로 에러 시맨틱이 바뀔 소지.
   출력 불변 early-return이지만 안전 위해 미적용(1차 패스 D2와 동일 판단).

## (D) 미수정 버그 후보
**신규 없음.** 기존 문서화된 quirk(변경 금지 대상)만 재확인:
- Disk RW_IOPS/RW_BPS 항상 /1 (의도 보존, 코드 주석).
- Memory resolveUsagePercentage pused=0 폴백 (원본 `||` 충실 포팅, 문서화됨).
- Network.lastValue의 findFirst NPE 극단케이스 (계약 차이로 로컬 보존, 코드 주석).
- Memory swap usagePercentage — 1차에서 system.swap.size[,pused]로 정정 완료(이번 재검토 제외).

---

## 검증 로그
- `.\gradlew.bat build --console=plain` (JAVA_HOME=jdk-17): **BUILD SUCCESSFUL** (compile/test/check 포함).
- 코드 변경 없음 → 출력이 바뀌는 수정 0건. 실행 중 :3000 프로세스 미접촉.
