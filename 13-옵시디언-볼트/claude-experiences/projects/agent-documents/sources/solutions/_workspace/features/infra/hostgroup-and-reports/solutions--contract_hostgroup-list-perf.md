# Contract: Host Group 목록 API 성능 개선 (N+1 + 캐싱)

- 기능: `GET hosts/hostgroups` (`ZabbixHostController.getAllHosts` → `HostService.getHostGroup`)
- 작업 유형: **내부 성능 개선** (응답 계약 불변)
- 작성일: 2026-06-04 / 담당: be-engineer

---

## 1. 변경 파일 목록

| 파일 | 변경 요약 |
|------|----------|
| `src/host/host.service.ts` | `getHostGroup` 재작성. N+1 제거 + Redis 캐싱. `RedisClientService` 주입 추가. private 메서드 3종 신규(`buildHostGroupCacheKey`, `aggregateHostGroups`, `buildHostGroupItem`). `HostGroupDto` import 추가. |
| `src/common/constants/constants.ts` | `HostGroupCache` 상수 추가 (`PREFIX`, `TTL_SECONDS`). |
| `src/host/host.service.spec.ts` | `RedisClientService` mock + `getTriggers` mock 추가. `getHostGroup` describe(3 케이스) 추가. |

### 핵심 diff 요약 (host.service.ts)

- **Before**: `hostgroup.get` 후 `groups.map(async ...)` 안에서 그룹마다
  `zabbixHostService.get(groupids: group.groupid)` + `zabbixProblemService.get(groupids: group.groupid)`
  를 `Promise.all`로 호출 → 그룹 N개 = Zabbix 2N회. 마지막에 전체 집계 후 `.slice`.
- **After**:
  1. `getHostGroup` = 캐시 조회 → miss 시 `aggregateHostGroups` 호출 후 캐시 set → 캐시 배열에서 `.slice`.
  2. `aggregateHostGroups`:
     - `hostgroup.get` 1회 (groups 목록)
     - `host.get({ groupids: [모든 groupId], selectGroups: ['groupid'], selectTags: 'extend' })` 1회 → host의 `groups`로 그룹별 분배(`hostsByGroup`).
     - `problem.get({ groupids: [모든 groupId], output: 'extend' })` 1회.
     - `trigger.get({ triggerids, selectHosts: ['hostid'] })` 1회 → problem.objectid(trigger) → host → group 매핑으로 그룹별 분배(`problemsByGroup`).
  3. `buildHostGroupItem`: 기존 인라인 집계 로직을 그대로 추출 — totalHosts, categoryCounts(spread), safetyPercentage, alerts, statusCounts 동일 산출.

---

## 2. 응답 shape 불변 확인 — **FE 변경 불필요**

엔드포인트·요청 파라미터·응답 구조 모두 동일.

- 응답: `ApiResult<HostGroupResDto>` 그대로.
- `HostGroupResDto`: `{ items: HostGroupDto[], total: number, selectedItem: HostGroupDto }` 그대로.
- 각 item 필드: `id, name, totalHosts, server/network/security/application/hardware/database/notClassified(categoryCounts spread), safetyPercentage, alerts{normal,warning,critical}, statusCounts` — **순서·키·타입 모두 동일**.
- `statusCounts` shape: 대문자 `HostStatus` 키 + `{ totalEvents, uniqueHostCount }` (직전 작업 결과) **유지**. `buildHostGroupItem`이 기존 인라인 코드를 그대로 옮긴 것이라 byte-for-byte 동일.
- 페이지네이션 동작 동일: `items = processedGroups.slice(offset, offset+limit)`, `total = processedGroups.length`, `selectedItem = find(id === selectedId)`.

→ FE(`HostMonitoringService.getListHostGroups`, `HostGroup.tsx`, `InfiniteScrollList.tsx`, 타입 `THostGroupDashboard`/`TStatusCounts`) **수정 불필요**.

---

## 3. 캐시 규칙

- 상수: `HostGroupCache` (`src/common/constants/constants.ts`)
  - `PREFIX = 'HOST_GROUP_LIST'`
  - `TTL_SECONDS = 180` (FE refetchInterval 3분 = 180s와 정합. 캐시가 한 refetch 주기보다 더 오래된 데이터를 주지 않도록 동일값으로 상한).
- 캐시 키: `HOST_GROUP_LIST:<sha256(authToken + '::' + JSON.stringify(filter))>`
  - **권한 분리**: 키에 `authToken`을 섞어 해시 → 사용자별 Zabbix 가시성 범위가 다르면 키가 달라짐 → **권한 누수 방지**. token을 그대로 키에 넣지 않고 sha256으로 해시(키 길이 고정 + 토큰 평문 비노출).
  - **filter 분리**: 동일 사용자라도 filter가 다르면 다른 키.
- 캐시 대상: **slice 이전의 전체 집계 배열(`processedGroups: HostGroupDto[]`)**. offset/limit slice는 캐시 배열에서 수행 → 무한스크롤 페이지 전환마다 재계산/재호출 0.
- 무효화: 명시적 `del` 없음. TTL(180s) 만료로만 갱신(짧은 TTL 전략). 빈 결과(`[]`)도 동일하게 캐싱.

---

## 4. Zabbix 호출 횟수 변화

| | hostgroup.get | host.get | problem.get | trigger.get | 합계 |
|---|---|---|---|---|---|
| **Before** | 1 | N | N | 0 | **1 + 2N** |
| **After (cache miss)** | 1 | 1 | 1 | 1 | **4 (상수)** |
| **After (cache hit)** | 0 | 0 | 0 | 0 | **0** |

그룹 N개 기준 2N → 4. 캐시 히트 시 0. (problem→group 매핑을 위해 trigger.get 1회를 추가했으나 여전히 상수.)

---

## 5. N+1 축소에서 보수적으로 남긴 부분 + 이유

- **problem → group 매핑에 trigger.get 1회 추가**: `problem.get`은 응답에 groupid를 포함하지 않는다. 기존 per-group `problem.get(groupids)`는 Zabbix가 trigger→host→group 기준으로 필터링한 결과였다. 메모리 분배로 같은 정확도를 보존하려면 `problem.objectid(triggerid) → trigger.hosts → host.groups` 경로를 재현해야 하므로 `trigger.get(selectHosts:['hostid'])` 1회를 추가했다. 이는 이미 코드베이스의 `getStatusCounts`/`fetchAlertsMap`/`getHostStatuses`가 쓰는 검증된 패턴이다. 그래도 N에 무관한 상수 호출.
- **멀티그룹 호스트/트리거**: host가 여러 그룹에 속하면 각 그룹에 동일 host/problem이 분배된다(`hostsByGroup`/`problemsByGroup` 모두 set push). 이는 Zabbix가 per-group 호출에서 동일 host/problem을 각 그룹 결과에 포함시키는 동작과 일치한다.
- **statusCounts.uniqueHostCount의 기존 quirk 보존**: 기존 코드의 `uniqueHosts`는 `event.hostName`(= `formatRecentEvents`에서 problem `event.name`, 즉 problem 이름) 기준 Set이다(실제 호스트명이 아님). `buildHostGroupItem`에서 이 로직을 그대로 옮겨 동작을 변경하지 않았다. 정확성 보존이 목표이므로 의도적으로 손대지 않음(별도 버그픽스 범위 밖).

---

## 6. 검증 결과

- `npx tsc --noEmit -p tsconfig.json`: host 관련 에러 **0**. 전체 에러 2건은 모두 사전 존재하던 `src/common/services/logger.service.spec.ts`의 `setLogLevel` 무관 에러(이번 변경과 무관).
- `npx jest src/host/host.service.spec.ts`: **7/7 통과** (기존 4 + 신규 3).
  - happy: 상수회 호출(getHostGroups 1, get 1, problem.get 1, getTriggers 1) + 그룹별 host/category/alert 분배 정확.
  - empty: 그룹 0개면 host/problem/trigger 미호출, 빈 목록 + 빈 결과도 캐싱.
  - cache hit: 두 번째 호출 시 Zabbix 전부 미호출, 캐시 배열에서 slice.

---

## 7. FE / QA 확인 사항

- **FE 변경 불필요**: 엔드포인트/요청/응답 계약 완전 불변. 기존 FE 코드 그대로 동작.
- **QA 확인 포인트**:
  1. 동일 사용자 무한스크롤(offset 증가) 시 첫 페이지 이후 응답 지연 감소(캐시 히트) — 정상.
  2. 두 사용자(서로 다른 Zabbix 권한)가 동시 조회 시 서로의 집계 결과가 섞이지 않음(키에 authToken 해시 포함) — 권한 누수 회귀 테스트.
  3. filter를 바꾸면 다른 결과가 나오는지(키에 filter 포함).
  4. 데이터 변경 후 최대 180초 내 반영(TTL). 즉시 반영이 필요한 시나리오가 있다면 보고.
