# API 계약 (증분) — 그룹 리포트 호스트별 자원 사용률 (group-report / hosts)

작성: be-engineer / 2026-06-22
베이스: `contract_group-report.md` (그 계약을 **상속**하며, 여기 명시된 부분만 추가/변경)
대상: fe-engineer, integration-qa, functional-qa
구현: NestJS(`moveseye-be`) + Spring(`moveseye-be-spring`) **양쪽 1:1 동일 계약**

> 이 문서는 기존 group-report 계약에 **`hosts` 배열을 추가**하는 증분이다.
> 경로/쿼리/인증/에러코드/envelope/날짜포맷/목록=상세 동일shape/FE 2겹 언랩 규약은 **모두 기존 그대로**.
> 변경된 건 리포트 객체(`GroupReportResDto`)에 필드 1개(`hosts`)가 늘어난 것뿐이다.

---

## 0. 변경 요약 (한눈에)

| 항목 | 변경 |
|---|---|
| 경로 `GET /hosts/{groupid}/reports` | 동일. 응답 각 원소에 `hosts` 추가 |
| 경로 `GET /hosts/{groupid}/reports/detail` | 동일. 응답에 `hosts` 추가 |
| 쿼리 파라미터 | **변경 없음** |
| 인증/권한/에러코드 | **변경 없음** |
| 리포트 객체 | `resource`/`alerts` 사이에 `hosts: ReportHostResource[]` 추가 |
| 기존 `resource`(그룹 전체 집계) | **그대로 유지** (전체 요약) |

목록·상세 **둘 다** `hosts` 포함(기존처럼 동일 shape).

---

## 1. 추가 필드 — `hosts`

리포트 객체(`GroupReportResDto`)에 아래 필드가 **추가**된다. 직렬화 순서는 `resource` 다음, `alerts` 앞.

```jsonc
{
  "periodType": "WEEK",
  "periodStart": "2026-06-08",
  "periodEnd": "2026-06-14",
  "hostCount": 12,
  "resource": { /* ReportResource — 그룹 전체 요약. 기존 그대로 */ },
  "hosts": [                                  // ★ 신규: 호스트별 자원 사용률 배열
    {
      "hostid": "10084",                      // string — Zabbix host id
      "hostName": "web-prod-01",              // string — 호스트 표시 이름
      "resource": {                           // ReportResource 재사용(그룹 resource와 동일 구조)
        "cpu":     { "avg": 42.31, "max": 88.0, "min": 5.12 },  // ReportMetricSummary | null
        "memory":  { "avg": 60.5,  "max": 91.2, "min": 30.0 },  // | null
        "disk":    null,                                          // 이 호스트가 disk item 미수집 → null
        "traffic": null                                          // | null
      }
    }
  ],
  "alerts": { /* ReportAlerts — 기존 그대로 */ }
}
```

### 1.1 `hosts[]` 원소 = `ReportHostResource`
| 필드 | 타입 | 설명 |
|---|---|---|
| `hostid` | string | Zabbix host id. **드롭다운 value 로 사용 권장** |
| `hostName` | string | 호스트 표시 이름. **드롭다운 label 로 사용 권장** |
| `resource` | `ReportResource` | 호스트별 자원 요약. **그룹 `resource`와 완전히 동일한 4키 구조** |

### 1.2 `hosts[].resource` = `ReportResource` (재사용)
- 그룹 집계 `resource`와 **같은 타입**. 4키(`cpu`/`memory`/`disk`/`traffic`) **항상 존재**.
- 각 키는 `ReportMetricSummary`(`{avg, max, min}`, 소수 2자리) 또는 **`null`**.
  - 해당 호스트가 그 metric의 Zabbix item을 수집하지 않으면 그 metric은 `null`.
- ⚠️ **그룹 resource와 의미 차이 한 가지**: 그룹 traffic은 "호스트 합산"이지만,
  호스트별 traffic은 그 호스트 단독 값(합산 대상이 자기 하나). avg/max/min 의미는 동일.

### 1.3 정렬 (계약 확정)
- `hosts`는 **`resource.cpu.avg` 내림차순**으로 정렬한다.
- 동률이거나 `cpu`가 `null`인 호스트는 **`hostName` 오름차순(localeCompare)** 으로 2차 정렬.
- `cpu == null` 호스트는 **맨 뒤**로 간다(`-Infinity` 취급).
- 결정적(deterministic) 정렬 — Nest/Spring 동일.

> ⚠️ **기존 contract 초안의 "hostName asc 권장"에서 변경됨.** 구현은 **cpu.avg desc → hostName asc**로 확정.
> FE가 드롭다운에서 자체 정렬(예: 이름순)을 원하면 클라이언트에서 재정렬해도 무방.

### 1.4 빈 그룹 / null 보존
- **빈 그룹**(호스트 0개): `hosts: []` (빈 배열). `null` 아님.
- 호스트별 `resource`의 4키는 항상 직렬화된다. **`null` 키도 누락 없이** 내려간다.
  - Spring: `@JsonInclude(ALWAYS)`로 null 4키 보존(`HostGroupReportJson.Resource`). Nest는 기본 보존.

---

## 2. 저장 전략 + 구버전 스냅샷 호환 정책 (확정)

### 2.1 저장 — 신규 jsonb 컬럼 `hosts`
- `host_group_report` 테이블에 **신규 jsonb 컬럼 `hosts`** 추가(기존 `resource`/`alerts` jsonb 옆에).
  - `{group, hosts}` 래핑 방식이 아니라 **독립 컬럼**으로 택했다 → 기존 `resource` 컬럼/구조 무변경.
- Nest 마이그레이션: `src/database/migrations/1781600000000-AddHostsToHostGroupReport.ts`
  (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS "hosts" jsonb;`, nullable, default 없음)
- Spring Flyway: **신규 `V4__host_group_report_hosts.sql`** 로 분리(★ V3 사후수정 → V4 신규로 정정).
  `ALTER TABLE host_group_report ADD COLUMN IF NOT EXISTS hosts jsonb;` (jsonb/nullable/default 없음 — Nest와 동일, 멱등).
  - ⚠️ **이전 초안은 V3 에 ADD COLUMN 을 사후 추가**했으나 이는 Flyway 안티패턴이라 정정했다:
    이미 V3(success) 가 적용된 dev DB 는 V3 를 재실행하지 않아 컬럼이 안 생기고,
    적용본을 고치면 checksum mismatch 로 `flyway validate` 가 깨진다.
    따라서 **V3 는 원래(hosts 없는) 상태로 원복**하고, hosts 추가는 **V4 로 신설**했다.
  - 공유 dev DB 에서는 Nest 마이그레이션이 같은 컬럼을 이미 추가했을 수 있으므로 `IF NOT EXISTS` 로 멱등 (V4 가 no-op 이어도 history 에 success 기록).
- 배치 cron(주/월) + lazy 백필 **양쪽 경로 모두** `hosts`를 채운다
  (`computeReport`가 `hosts`까지 생성 → 배치/lazy 공용 `upsertReport` 경유).

### 2.2 구버전 스냅샷 호환 — **lazy 재집계(자동 마이그레이션)**
dev DB에 `hosts` 없던 구버전 스냅샷(~40 rows)이 있다. 정책:

- 조회 시 저장본의 `hosts`가 **`NULL`**(구버전)이면 → **그 자리에서 재집계·재저장**(lazy migration).
  이후 조회는 채워진 값을 즉시 반환. 데이터 손실 없음.
- `hosts == []`(빈 배열)은 **빈 그룹의 정상값** → 재집계하지 않음(NULL과 명확히 구분).
- 최종 방어선: DTO 직렬화 시점에 `hosts`가 끝내 `NULL`이면 `[]`로 graceful 노출(클라이언트는 항상 배열 수신).
- Nest: `ReportService.ensureReport` → `isLegacySnapshot()`(hosts null/undefined) → `computeReport`+`upsert`.
- Spring: `ReportService.ensureReport` → `isLegacySnapshot()`(getHosts()==null) → `computeReport`+`upsertReport`.

> FE 영향: **없음**. 첫 조회 시 구버전이면 살짝 느릴 수 있음(재집계). 이후 즉시. (기존 lazy 백필과 동일 UX.)

---

## 3. 집계 로직 (참고, FE 직접 영향 없음)

- 기존 그룹 집계가 쓰던 trend 데이터를 **호스트 단위로 분해**해 재사용한다(리소스 추이 탭의 호스트별 시리즈 패턴).
- `summarizeMetric`이 한 번의 trend 수집에서 **그룹 요약 + 호스트별 요약을 동시 산출**한다.
  - 호스트별: 호스트의 타임버킷 대표 avg들의 평균, 버킷 max/min의 최대/최소.
  - 그룹: 기존 정책 유지(traffic=호스트 합, 그 외=호스트 평균; max/min은 호스트 최대/최소).
- 그룹의 **모든 호스트**가 `hosts`에 들어간다(해당 metric item이 없는 호스트도 포함, 그 metric만 null).

---

## 4. FE 타입 제안 (TypeScript) — 추가/변경분

기존 `GroupReport`/`ReportResource`/`ReportMetricSummary` 타입은 **그대로 재사용**. 아래만 추가:

```ts
// 신규 — 호스트별 자원 사용률 원소
export interface THostReport {
  hostid: string;
  hostName: string;
  resource: ReportResource;   // 기존 ReportResource 재사용(4키, 각 Summary | null)
}

// GroupReport 에 hosts 필드 추가 (★ 변경)
export interface GroupReport {
  periodType: ReportPeriodType;
  periodStart: string;        // YYYY-MM-DD
  periodEnd: string;          // YYYY-MM-DD
  hostCount: number;
  resource: ReportResource;   // 그룹 전체 요약 (기존)
  hosts: THostReport[];       // ★ 추가: 호스트별. 빈 그룹이면 []
  alerts: ReportAlerts;       // 기존
}

// GET /hosts/:groupid/reports        → GroupReport[]   (각 원소에 hosts 포함)
// GET /hosts/:groupid/reports/detail → GroupReport     (hosts 포함)
```

쿼리 파라미터 — **변경 없음**(기존 contract_group-report.md §5 그대로).

---

## 5. FE 주의점 — 드롭다운 연동

- **드롭다운 데이터 출처**: 리포트 응답의 `hosts[]`. 별도 API 호출 불필요.
  - option value = `hostid`, option label = `hostName`.
- **전체(그룹) ↔ 개별 호스트 전환 UX**:
  - "전체" 선택 → 최상위 `resource`(그룹 전체 요약)를 표시.
  - 특정 호스트 선택 → `hosts.find(h => h.hostid === selected).resource`를 표시.
  - 두 경우 모두 **같은 `ReportResource` shape**(4키, 각 `Summary | null`)라 표시 컴포넌트 1개로 재사용 가능.
- **빈 그룹**: `hosts === []` → 드롭다운에 "전체"만 노출(개별 호스트 없음). `hosts`는 항상 배열이니 `?.`/`?? []` 방어 불필요(단, 구버전 graceful로도 항상 배열 보장됨).
- **metric null 처리**: 호스트(또는 그룹) `resource.cpu` 등이 `null`일 수 있음 → "데이터 없음" UI 필요(기존 그룹 resource와 동일 규칙).
- **목록 vs 상세**: 둘 다 `hosts` 포함. 목록에서 받은 객체로 바로 드롭다운/표시를 채워도 되고, 상세를 다시 호출해도 동일.
- **2겹 언랩 규약 그대로**: `useDmoveQuery` 소비자는 `GroupReport`(또는 `GroupReport[]`)를 직접 수신. `hosts`는 그 안의 배열.

---

## 6. 변경 파일 (이 증분에서 건드린 것)

### Nest (`moveseye-be`) — 이전 세션에서 대부분 완료, 이번에 검증
- `src/database/models/host-group-report.entity.ts` — `ReportHostResource` 클래스 + 엔티티 `hosts` jsonb 컬럼
- `src/database/migrations/1781600000000-AddHostsToHostGroupReport.ts` — `hosts` 컬럼 추가
- `src/host/dto/responses/group-report.dto.ts` — DTO에 `hosts` 필드(@ApiProperty)
- `src/host/report/report.service.ts` — `summarizeMetric`이 group+perHost 반환, `computeReport`가 hosts 조립/정렬, `ensureReport` legacy lazy migration
- `src/host/report/report.service.spec.ts` — host breakdown/정렬 + legacy migration 테스트

### Spring (`moveseye-be-spring`) — 이번 세션에서 마무리
- `src/main/java/com/dmove/moveseye/domain/HostGroupReportJson.java` — `HostResource` record(이전 세션)
- `src/main/java/com/dmove/moveseye/domain/HostGroupReport.java` — 엔티티 `hosts` jsonb 컬럼(이전 세션)
- `src/main/java/com/dmove/moveseye/host/dto/GroupReportResDto.java` — record에 `hosts` 추가 + null→[] graceful (★이번)
- `src/main/java/com/dmove/moveseye/host/report/ReportService.java` — `MetricResult`(group+perHost), `summarizeMetric` 재구성, `computeReport` hosts 조립/정렬, `upsertReport` merge에 hosts, `ensureReport` legacy lazy migration (★이번)
- `src/main/resources/db/migration/V3__host_group_report.sql` — **hosts ADD COLUMN 원복**(Flyway 안티패턴 정정, V3 는 원래 DDL 만) (★정정)
- `src/main/resources/db/migration/V4__host_group_report_hosts.sql` — **신규**: `ALTER TABLE host_group_report ADD COLUMN IF NOT EXISTS hosts jsonb;` (★정정/신규)
- `src/test/java/com/dmove/moveseye/host/report/ReportServiceTest.java` — host breakdown/정렬 + legacy/fresh 분기 테스트 (★이번)

---

## 7. 검증 결과

- Nest: `npm run build` ✅, `npx tsc --noEmit` ✅, `report.service.spec.ts` **9/9 pass**, `host.service.spec.ts` **46/46 pass**.
- Spring: `gradlew build`(전체 테스트 포함) ✅ BUILD SUCCESSFUL, `ReportServiceTest` 신규 케이스 포함 pass.
- 양쪽 응답 shape/필드명/순서/직렬화(null 키 보존) 1:1 동일.

### 7.1 Flyway V3→V4 분리 정정 검증 (2026-06-22, be-engineer)
- `gradlew build -x test` ✅ BUILD SUCCESSFUL (JDK17).
- Spring 실기동(Flyway ON, PORT=3001)으로 V4 실적용 확인:
  - `Successfully validated 5 migrations` — 원복한 V3 가 dev DB 기록 checksum(2124735148)과 **일치**, mismatch 없음.
  - `Migrating schema "public" to version "4" ... Successfully applied 1 migration, now at version v4`.
  - `flyway_schema_history` 에 V4(checksum 869007765, success=t) 기록.
  - dev DB 의 `hosts` 컬럼은 Nest 가 선적용한 상태라 V4 는 `IF NOT EXISTS` no-op → 정상.
  - 앱 정상 기동(Tomcat 3001) 후 프로세스/Gradle 데몬 정리.
- 잔여 운영 권고: 이미 V3 만 적용된 다른 환경(스테이징/운영)에서도 V4 가 정상 추가 적용된다(IF NOT EXISTS 로 안전). dev DB history 에 대한 repair/파괴적 조치 불필요.
</content>
</invoke>
