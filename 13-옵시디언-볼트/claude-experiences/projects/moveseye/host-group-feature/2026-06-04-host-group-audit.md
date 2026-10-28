---
type: project
tags: [project, moveseye, dmove, fullstack, nestjs, react, host-group, monitoring, audit, bug, data-integrity, contract-mismatch]
created: 2026-06-04
updated: 2026-06-04
status: active
---

# MovesEye — 모니터링 탭 호스트 그룹(하위 그룹) 기능 풀스택 진단 (2026-06-04)

> 모니터링 탭의 **호스트 그룹(=하위 그룹)** 기능을 FE/BE 양쪽에서 추적한 기록.
> "하위 그룹"의 실체 = Zabbix 평면 호스트 그룹 + 호스트의 `device_type` 태그 기반 분류(nested group 미사용).
> 서비스 개요는 [[moveseye-overview]], BE 전반 진단은 [[2026-06-02-be-codebase-audit]], 동기화는 [[2026-06-02-zabbix-sync-audit]] 참고.
> 이 노트의 가치 = **확실한 버그 4건 + 성능/설계 2건 + 분류 일관성 4건 + 계약 불일치 2건**을 우선순위까지 정리.

## 대상 파일

| 레이어 | 파일 |
|--------|------|
| BE 컨트롤러 | `moveseye-be/src/host/host.controller.ts` (`@Controller('hosts')`) |
| BE 서비스(핵심) | `moveseye-be/src/host/host.service.ts` (집계·분류 헬퍼 집중) |
| BE 엔티티 | `moveseye-be/src/database/models/host-group.entity.ts` (평면 구조, nested 없음) |
| BE Zabbix | `moveseye-be/src/zabbix/services/zabbix-host-group.service.ts` |
| FE 목록 | `moveseyee_fe/src/pages/monitoring/host-group/HostGroup.tsx` |
| FE 상세 | `moveseyee_fe/src/pages/monitoring/host-group/HostGroupDetail.tsx` |
| FE 카드 | `moveseyee_fe/src/components/host-group/HostGroupServiceCard/HostGroupServiceCard.tsx` |
| FE 훅 | `moveseyee_fe/src/hooks/useHostStatusCount.tsx`, `InfiniteScrollList.tsx` |
| FE 타입/API | `types/host-monitoring.ts`, `services/host-monitoring.api.ts` |

---

## 화면 구조

| 경로 | 화면 | 역할 |
|------|------|------|
| `/monitoring/host-group` | 그룹 목록(무한스크롤 카드) | 그룹별 안전도·상태·서버/네트워크 수 |
| `/monitoring/host-group/:id` | 그룹 상세 | 요약 + `device_type`별 호스트 집계 테이블 |
| `/monitoring/server-monitoring`·`/network-monitoring` | 그룹 필터 진입 | 카드의 서버/네트워크 클릭 시 group 필터로 이동 |

**"하위 그룹"의 실체:** Zabbix 슬래시(`/`) nested group은 **사용 안 함**. 평면 호스트 그룹 + 호스트 `device_type` 태그(server/network/security/database/hardware/notClassified)로 그룹 내부를 분류.

## 데이터 흐름

**목록**
```
InfiniteScrollList → GET hosts/hostgroups (limit/offset)
  → hostService.getHostGroup()
     → zabbix hostgroup.get (전체 그룹)
     → 각 그룹마다 host.get + problem.get (Promise.all)  ← N+1
     → calculateAlerts / getCategoryCountsFromTags / statusCounts
     → 전체 계산 후 .slice(offset, offset+limit)            ← slice-after-full-compute
  → HostGroupServiceCard 렌더
```

**상세**
```
GET hosts/:groupid              → getHostGroupDetail (안전도/카테고리수/상태/recentlyViewedHosts)
GET hosts/device-type/:groupid  → getDeviceTypeSummary (태그별 집계 테이블)
```

---

## 🔴 확실한 버그

### B1. `getCategory()`가 `await` 없이 호출 → 카테고리가 `Promise`로 채워짐
`host.service.ts:162` (`getHostItems` 내부)
```ts
private async getCategory(host) { ... }   // async 불필요(내부는 동기 getDeviceTypeFromTags만 호출)
category: this.getCategory(host),         // ← await 누락 → Promise 객체가 들어감
```
`getHostGroupDetail`의 `categorizedHosts`는 `acc[host.category]`로 그룹화 → key가 `[object Promise]`.
**→ 응답 `recentlyViewedHosts`가 카테고리별로 정상 분류되지 않음.**
조치: `getCategory`를 동기로 바꾸거나 `await Promise.all(...)`로 매핑.

### B2. 상세 화면 device_type 테이블 `total`이 항상 0
`HostGroupDetail.tsx:229`
```tsx
<DmoveTable dataSource={dataType?.items} total={data?.total ?? 0} />
```
`total`을 `dataType`(device-type 응답)이 아니라 `data`(그룹 요약 응답)에서 읽음. 그런데 `getHostGroupDetail` 응답엔 `total` 필드가 없음(FE 타입 `THostGroupMonitoringDetail.total`만 선언, BE 미전송).
**→ 페이지네이션 total이 항상 0/undefined.** 올바른 소스는 `dataType?.total`.

### B3. statusCounts 키 체계 혼재 (camelCase 초기값 vs 대문자 채움)
`host.service.ts:268~291`
```ts
const statusCounts = { notClassified:0, information:0, average:0, warning:0, disaster:0, high:0 };
// 루프에서 HostStatus enum(대문자)로 덮어씀: statusCounts['NOT_CLASSIFIED'] = { totalEvents, uniqueHostCount }
```
FE `useHostStatusCount`는 **대문자 키만** 읽음 → camelCase 초기값 6개는 죽은 데이터, 이벤트 없는 등급은 0이 아니라 `undefined → "-"`로 표시. FE 타입 `TStatusCounts`에도 camelCase 키 없음(응답 shape 불일치).

### B4. 카드 클릭 이벤트 경합 + 빈 링크
`HostGroupServiceCard.tsx`
- `extra={<Link to=""><PlusOutlined/></Link>}` → `to=""`는 기능 없이 현재 경로 재진입만 유발.
- `Card onClick`(그룹 상세 이동)과 내부 `MonitoringInfoBtn onClick`(server/network 이동)에 `stopPropagation` 없음 → 서버/네트워크 버튼 눌러도 **카드 onClick 동시 발화**, 라우팅 경합.

---

## 🟠 성능 / 설계

### P1. 목록 API의 N+1 + "전체 계산 후 slice"
`host.service.ts:234~306` — limit/offset과 무관하게 **모든 그룹**에 `host.get`+`problem.get`(그룹당 2회) 후 마지막에 `.slice`. 무한스크롤이 페이지 넘길 때마다 전체 재계산 → 그룹 50개면 매 스크롤마다 Zabbix 호출 약 100회. **Redis 캐싱 미적용**(CLAUDE.md 캐싱 패턴 위배).

### P2. `recentlyViewedHosts` 네이밍 오용
실제로는 "최근 본 호스트"가 아니라 그룹 내 카테고리별 전체 호스트 + CPU/MEM/Disk 사용률(`getHostItems`). 대형 그룹에서 전 호스트 item을 매번 조회.

---

## 🟡 분류 일관성

### C1. 카테고리 분류 규칙이 3곳에서 제각각
| 위치 | application 포함 | listType 검증 | 분류 근거 |
|------|:---:|:---:|------|
| `getCategoryCountsFromTags` (L192) | ✅ | ❌ | device_type 태그 1개 |
| `getDeviceTypeSummary` (L1500) | ❌ | ✅ | device_type 태그 1개 |
| `getCategory`/`getCategoryHost` (L103,135) | — | — | 태그 또는 `hostName.includes()` |
→ 요약 카운트(application 포함)와 테이블 집계(application 제외)의 모집단이 달라 합이 어긋날 수 있음.

### C2. `getCategoryHost`는 미사용 죽은 코드 (`host.service.ts:103`)
`hostName.includes('server')` 식 문자열 매칭, 현재 어디서도 호출 안 됨.

### C3. 안전도(safety) 기준 모호
`calculateAlerts`는 `severity < 2`(0=미분류,1=정보)를 전부 `normal`로 집계 → `safetyPercentage`에 INFORMATION이 정상으로 흡수. 반면 `formatRecentEvents`/`statusCounts`는 6등급. 두 분류 체계 공존.

### C4. device_type 태그가 정확히 1개일 때만 분류
0개·2개↑는 모두 `notClassified`. 정책 주석/문서 없음.

---

## 🔵 타입 계약 불일치 (FE ↔ BE)

### T1. `THostGroupDashboard` 필드 누락
BE는 `...categoryCounts`로 `security/database/application/hardware/notClassified`까지 전송하나 FE 타입은 `server/network`만 선언. (카드가 둘만 써서 표면화 안 됨, 계약은 어긋남)

### T2. `THostGroupMonitoringDetail.total`
FE에만 존재, BE 응답에 없음 → **B2의 직접 원인**.

---

## 우선 조치 권장순위

1. **B2** 테이블 total → `dataType?.total` (즉시, 영향 명확)
2. **B1** `getCategory` await/동기화 (상세 데이터 정확성)
3. **B4** stopPropagation + 빈 Link 제거 (UX)
4. **B3 / T1 / T2** 계약 동기화 (`api-contract-sync` 일괄)
5. **P1** 캐싱 또는 그룹 단위 페이징
6. **C1~C3** 분류 로직 단일 유틸로 통합

---

## 교훈 (재사용 포인트)

- **slice-after-full-compute 안티패턴**: 페이지네이션을 DB/외부 API 쿼리가 아니라 메모리에서 `.slice`로 처리하면, 무한스크롤과 결합 시 매 페이지가 전체를 재연산한다. moveseye는 Zabbix 호출이 그룹당 2회라 N×2로 증폭.
- **async 헬퍼 await 누락 → `[object Promise]` 키**: 동기로 충분한 함수를 async로 만들면 호출부 await 누락 버그를 부른다. 불필요한 async 제거가 예방책.
- **key 체계 혼재(camelCase 초기값 + enum 대문자 채움)**: 초기 객체와 실제 채움 키가 다르면 죽은 필드가 응답에 실려 FE 계약을 오염시킨다. enum을 SSOT로.
- **FE total 소스 오참조**: 요약 응답과 리스트 응답이 분리된 화면에서 `total`을 잘못된 쿼리 결과에서 읽는 흔한 실수.
