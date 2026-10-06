# QA — 그룹 리포트 호스트별 자원 사용률(hosts[]) 경계면 정합성 (증분)

검증자: integration-qa / 2026-06-22
방식: 정적 shape 교차 대조 (앱 미기동) + FE `tsc --noEmit`
진실원천: `_workspace/contract_group-report-hosts.md` (베이스: `contract_group-report.md`, 이전 PASS: `qa_group-report.md`)
런타임 행위(드롭다운 전환·재집계 실제 동작 등)는 functional-qa 담당 — 이 보고서 범위 밖.

## 종합 판정: **PASS (불일치 0건)**

`hosts[]` 증분의 계약 ↔ Nest ↔ Spring ↔ FE(타입/api/hook/컴포넌트) 경계면이 전부 일치한다.
필드명/타입/옵셔널/정렬/null 보존/래퍼 깊이/목록=상세/Nest↔Spring 1:1 모두 PASS.
FE `npx tsc --noEmit` **에러 0건(EXIT=0)**. 차단성·경미 불일치 없음. 참고 관찰 2건만 기록.

---

## 1. 응답 shape — `hosts[]` (4곳 1:1) — PASS

| 필드 | 계약 | Nest `ReportHostResource` | Spring `HostResource` | FE `THostReport` |
|---|---|---|---|---|
| `hostid` | string | `hostid: string` (entity.ts:53-54) | `String hostid` (HostGroupReportJson.java:30) | `hostid: string` (host-monitoring.ts:420) |
| `hostName` | string | `hostName: string` (entity.ts:56-57) | `String hostName` (java:30) | `hostName: string` (ts:421) |
| `resource` | `ReportResource` | `ReportResource` (entity.ts:59-64) | `Resource` (java:30) | `TReportResource` (ts:422) |

- 필드명 오타·drift 없음. 3필드 동일 순서.
- **직렬화 순서** `...resource, hosts, alerts`:
  - Nest `GroupReportResDto` 필드 선언 순서 `periodType→periodStart→periodEnd→hostCount→resource→hosts→alerts` (group-report.dto.ts:19-49) ✅
  - Spring record 컴포넌트 순서 동일 (`GroupReportResDto.java:14-21`) ✅ (record 직렬화는 선언 순서 보존)
  - FE `TGroupReport`도 동일 순서(ts:426-434) — 표시 무관하나 일관.

## 2. `hosts[].resource` = 그룹 `resource`와 동일 `ReportResource` 재사용 — PASS

- **Nest**: 그룹 resource와 호스트 resource **동일 클래스 `ReportResource`** 재사용. 별도 타입 분기 없음.
  - 그룹: `resource: ReportResource` (entity.ts:137 / dto.ts:35)
  - 호스트: `ReportHostResource.resource: ReportResource` (entity.ts:64) — 같은 클래스.
  - computeReport 조립도 4키 cpu/memory/disk/traffic 동일 키로 `perHost[hostId] ?? null` (report.service.ts:326-331).
- **Spring**: 그룹·호스트 모두 동일 record `Resource` 재사용 (HostGroupReportJson.java:22, HostResource java:30).
  - computeReport: `new Resource(cpu.perHost().get(...), memory..., disk..., traffic...)` (ReportService.java:271-275) — 4키 동일.
  - **`@JsonInclude(ALWAYS)`가 `Resource` record에 1회 선언**(java:21)되어 그룹·호스트 양쪽 resource 모두 null 4키 보존. 호스트별 resource에 별도 어노테이션 누락 없음(같은 타입이라 자동 적용). ✅
- **FE**: `THostReport.resource: TReportResource` — 그룹과 동일 타입 재사용(ts:422). `TReportResource`는 4키 각 `TReportMetricSummary | null` (ts:391-396).
- **null 4키 보존 검증**:
  - Nest: 객체 리터럴에 4키를 항상 명시(`?? null`)하므로 jsonb 저장·직렬화 시 키 누락 불가 (report.service.ts:326-331).
  - Spring: `@JsonInclude(ALWAYS)`로 null 키도 직렬화 (java:21).
  - → 계약 §1.2/§1.4 "4키 항상 존재" 양쪽 보장. ✅

## 3. 정렬 계약 (cpu.avg desc → hostName asc, cpu null 맨 뒤) — PASS

| 항목 | Nest (report.service.ts:334-338) | Spring (ReportService.java:278-283) |
|---|---|---|
| 1차 cpu.avg 내림차순 | `bv - av` (b−a = desc) | `Double.compare(bv, av)` (b,a = desc) |
| cpu null → 맨 뒤 | `a.resource.cpu?.avg ?? -Infinity` | `cpu()!=null ? cpu().avg() : Double.NEGATIVE_INFINITY` |
| 2차 hostName 오름차순 | `\|\| a.hostName.localeCompare(b.hostName)` | `cmp!=0 ? cmp : a.hostName().compareTo(b.hostName())` |

- BE가 정렬해서 보내고 **FE는 받은 순서 그대로 사용**:
  - `hostOptions`는 `hosts.map(...)`만 수행, 재정렬 없음 (HostGroupReport.tsx:76-82).
  - `hosts = selectedReport?.hosts ?? []`도 그대로 사용 (tsx:65).
  - ✅ FE 임의 재정렬 없음.
- ⚠️ 경미 관찰(불일치 아님): Nest는 `localeCompare`(로케일 인지), Spring은 `String.compareTo`(코드포인트). 순수 ASCII 호스트명은 결과 동일하나, 비ASCII/대소문자 혼재 호스트명에서 2차 정렬 tie-break 순서가 미세하게 갈릴 수 있음. 1차 키(cpu.avg)가 사실상 유니크해 실무 영향 거의 없고, 계약은 "결정적"만 요구하므로 **PASS**. (참고 §관찰 1)

## 4. null / 빈 정책 — PASS

- **빈 그룹 `hosts: []` 보장**:
  - Nest: `hostIds.map(...)` → 빈 그룹이면 빈 배열(report.service.ts:322), entity 기본 보존. ✅
  - Spring: `for (hostId : hostIds)` → 빈 그룹이면 빈 List (ReportService.java:269-277). ✅
- **구버전 스냅샷 graceful — 항상 배열로 FE 도달**:
  - lazy 재집계: `isLegacySnapshot`(hosts NULL) → computeReport+upsert (Nest 401-409 / Spring 338-340). 빈 배열([])은 정상값이라 재집계 제외(Nest:425-427 / Spring:351-353). ✅
  - 최종 방어선(재집계 후에도 NULL 잔존 시): Nest `toDto`에서 `hosts: entity.hosts ?? []` (report.service.ts:449), Spring `GroupReportResDto.from`에서 `e.getHosts() != null ? e.getHosts() : List.of()` (GroupReportResDto.java:31). ✅
  - → **응답 계약상 FE는 항상 `hosts` 배열을 수신**. null 도달 불가.
- **FE 가드**:
  - `hosts = selectedReport?.hosts ?? []` — selectedReport undefined/hosts 누락 모두 방어 (tsx:65).
  - 미선택/없는 hostid → "전체"(`ALL_HOSTS_VALUE`) 폴백, useEffect로 crash 방지 (tsx:68-73).
  - `displayedResource`: 전체면 `selectedReport?.resource`, 개별이면 `hosts.find(...)?.resource` — `?.` 가드 (tsx:85-88).
  - 개별 호스트 resource의 metric null: `HostGroupReportResource`가 `resource ? resource[metric] : null` + `!!record.summary`/`value !== null` 가드 후 no_data 표기(HostGroupReportResource.tsx:31-43). 그룹 resource와 **동일 컴포넌트 재사용** — 계약 §5 "표시 컴포넌트 1개 재사용" 충족. ✅
  - Excel export도 `displayedResource` 사용 + `summary ?` 분기 (HostGroupReport.tsx:129-144). ✅

## 5. 언랩 깊이 / 경로·쿼리 무변경 — PASS

- `hosts`는 `data` payload 내부 필드. 추가 언랩 없음:
  - api 함수 `getGroupReports`는 `API.get('${hostsUrl}/${groupId}/reports')` → `Promise<TResponse<TGroupReport[]>>` (host-monitoring.api.ts:303-314). 경로/쿼리(`periodType`,`limit`) **무변경**.
  - hook `useGroupReport`: `const reports = data ?? []`, `data`는 payload `TGroupReport[]` 직접 수신(2겹 언랩 규약 준수, useGroupReport.ts:43). `hosts`는 그 안 필드 — `.data` 추가 언랩 없음. ✅ ([[fe-usedmovequery-unwrap]] 규약 그대로)
  - 컴포넌트는 `selectedReport.hosts`로 접근(이미 언랩된 객체의 필드). ✅
- 경로/쿼리파라미터 이번 증분에서 무변경(계약 §0 명시와 정합). ✅

## 6. 목록 = 상세 동일 shape (둘 다 `hosts` 포함) — PASS

- **Nest**: 목록 `getReports`·상세 `getReportDetail` 모두 동일 `toDto` 경유 (report.service.ts:478, 494 부근) → 양쪽 `hosts` 포함. ✅
- **Spring**: 목록 `getReports`·상세 `getReportDetail` 모두 `GroupReportResDto.from(report)` 경유(ReportService.java:365, 379) → 동일 record(hosts 포함). ✅
- FE 타입 1개(`TGroupReport`)로 목록/상세 공용 — `THostReport[]` 포함. ✅

## 7. Nest ↔ Spring 1:1 (필드명/순서/타입/직렬화/저장/마이그레이션) — PASS

- **shape**: §1~2대로 hostid/hostName/resource 필드명·순서·타입 동일. null 키 보존(Nest 명시 리터럴 / Spring `@JsonInclude(ALWAYS)`)까지 동치.
- **정렬**: §3대로 동일 알고리즘.
- **저장(jsonb `hosts` 컬럼)**:
  - Nest 엔티티: `@Column({ type: 'jsonb', name: 'hosts', nullable: true }) hosts: ReportHostResource[] | null` (entity.ts:150-152).
  - Spring 엔티티: `@JdbcTypeCode(SqlTypes.JSON) @Column(name="hosts") List<HostResource> hosts` (HostGroupReport.java:72-74). nullable(NOT NULL 미지정) — 동치.
- **마이그레이션**:
  - Nest `1781600000000-AddHostsToHostGroupReport.ts`: `ALTER TABLE "host_group_report" ADD COLUMN IF NOT EXISTS "hosts" jsonb;` (nullable). ✅
  - Spring Flyway `V3__host_group_report.sql:21`: `ALTER TABLE host_group_report ADD COLUMN IF NOT EXISTS hosts jsonb;` (멱등). ✅
  - 동일 DDL(컬럼명 `hosts`, jsonb, nullable). ✅
- **lazy migration / upsert merge에 hosts 포함**: Nest upsert는 엔티티 통째(report.hosts 포함, report.service.ts:356-360), Spring merge builder에 `.hosts(report.getHosts())` 명시(ReportService.java:313). ✅
- 판정: 두 BE 모두 계약과 일치. 어느 쪽이 정답인지 가릴 사안 없음.

## 8. FE 타입체크 — PASS

- `npx tsc --noEmit` → **EXIT=0, 에러 0건**. 리포트 관련 파일(types/host-monitoring.ts, host-monitoring.api.ts, useGroupReport.ts, HostGroupReport*.tsx) 무에러.

---

## 참고 관찰 (불일치 아님, 조치 불요)

1. **2차 정렬 tie-break 로케일 차이**: Nest `localeCompare` vs Spring `compareTo`(코드포인트). 1차 키 cpu.avg가 사실상 유니크해 동률 발생 드물고, 발생해도 ASCII 호스트명은 결과 동일. 계약은 "결정적"만 요구 → 무해. 완전 일치를 원하면 Spring을 `Collator`/`String.CASE_INSENSITIVE_ORDER`로 맞출 수 있으나 권고 아님.

2. **useGroupReport 타입 파라미터 표기**(useGroupReport.ts:30): `useDmoveQuery<TResponse<TGroupReport[]>>` 선언이나 useDmoveQuery는 payload 직접 반환 → `useDmoveQuery<TGroupReport[]>`가 의미상 더 정확. `TResponse<T>=T&{...}` intersection이라 배열로 취급돼 `.map/.find/.some` 정상 → 런타임·타입 모두 무해. 기존 *.api 함수 관행과 동일하므로 유지 무방(이전 qa_group-report.md 관찰 1과 동일 건).

---

## 책임 주체별 수정 권고

없음. be-engineer / fe-engineer 양측 조치 불요. `hosts[]` 증분 경계면 정합성 클로즈드 루프 종료.
(참고 관찰 1·2는 선택적 cosmetic이며 차단성/경미 버그 아님 — 라우팅 불필요.)
