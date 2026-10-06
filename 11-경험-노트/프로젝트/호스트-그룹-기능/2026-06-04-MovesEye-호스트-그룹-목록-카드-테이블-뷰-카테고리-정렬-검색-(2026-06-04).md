---
type: project
tags: [project, moveseye, host-group, fullstack, react, nestjs, table-view, sorting, search, feature, verified]
created: 2026-06-04
updated: 2026-06-04
status: done
---

# MovesEye — 호스트 그룹 목록: 카드/테이블 뷰 + 카테고리·정렬·검색 (2026-06-04)

> 호스트 그룹 목록 화면(`/monitoring/host-group`)을 카드뷰 단독 → **카드/테이블 전환 + 테이블에 카테고리 컬럼·정렬·검색**까지 확장한 풀스택 작업.
> 진단/구조는 [[2026-06-04-host-group-audit]], 버그픽스는 [[2026-06-04-bugfix]], 디렉터리 개요는 [[README]].
> 검증: **Playwright 런타임 PASS**(로그인→드라이브→스크린샷). BE/FE `tsc` 통과.

## 작업 1 — 카드/테이블 뷰 스위칭 (FE 단독, BE 무변경)

`HostGroup.tsx`를 **컨테이너**로 바꾸고 뷰를 분리:
- `HostGroupCardView.tsx` (신규) — 기존 무한스크롤 카드뷰(`InfiniteScrollList`) 로직 이동
- `HostGroupTableView.tsx` (신규) — `DmoveTable` 기반 테이블뷰
- 우상단 `Segmented`(카드/테이블), 뷰 상태는 **query param `?view=card|table`** (새로고침·공유 유지). `enums/common.ts`에 `QueryParamKeys.VIEW` + `EMonitoringView` 추가, i18n `card_view`/`table_view`.
- 데이터는 기존 `getListHostGroups` 재사용. 카드=무한스크롤(자체 pageParam), 테이블=`DmoveTable` 페이지네이션(`offset/limit` query param). BE `getHostGroup`이 이미 `slice` 지원이라 **BE 무변경**.

## 작업 2 — 테이블 카테고리 컬럼 + 정렬 + 검색 (풀스택)

### BE
| 파일 | 변경 |
|------|------|
| `common/classes/search-filter.base.dto.ts` | `SearchObjectDto`에 `sortBy?: string` 추가(정렬 키 수신). `IsString` import 추가 |
| `host/host.service.ts` `getHostGroup` | 전체 집계 후 **그룹명 keyword 검색 → 서버사이드 정렬 → slice**. `total`도 필터 결과 기준. 패턴은 `getServers`/`getDeviceTypeSummary`와 동일(`SortDirection`, `localeCompare`/숫자 비교) |

> `BasePageDto`엔 `limit/offset/sortDirection`만 있고 **`sortBy`가 없다** → `SearchObjectDto`(공용)에 옵셔널 추가. `getServers`는 `SearchHostDto`에서 `sortBy`를 받던 것.

### FE
| 파일 | 변경 |
|------|------|
| `types/host-monitoring.ts` | `THostGroupDashboard`에 `security/database/application/hardware/notClassified` 추가 → **[[2026-06-04-host-group-audit\|T1]] 계약 불일치 해소** (BE가 `...categoryCounts`로 이미 보내던 필드) |
| `pages/.../HostGroupTableView.tsx` | 카테고리 6컬럼(server/network/security/database/hardware/notClassified) + 전 컬럼 `sorter:true`(서버사이드) + `DmoveTableFilter` 검색창 |

### 데이터 흐름 (정렬·검색)
```
컬럼 클릭 → DmoveTable onChange → sortBy(dataIndex)·sortDirection → query param
검색 입력 → DmoveTableFilter(KeywordSearchInput) → keyword → query param
  → useQueryParams.stringParams → getListHostGroups(string)
  → BE getHostGroup: keyword 필터 → sortBy 정렬 → offset/limit slice
```
- dataIndex를 BE processedGroup 키와 1:1 일치시킴(name/totalHosts/server/network/security/database/hardware/notClassified/safetyPercentage) → 컬럼 정렬이 그대로 BE 정렬 키가 됨.

## 검증 (Playwright PASS)
- 헤더 9개 렌더: Host group·Total hosts·Server·Network·Security·Database·Hardware·Not classified·Safety
- 정렬: Total hosts 클릭 → `sortDirection=DESC` 1행=46(최대) → 토글 `ASC` 1행=0(최소)
- 검색: `keyword=server` → 7행(전부 이름에 server 포함)
- 증거 스크린샷: `_workspace/t2-sort.png` 등

## 교훈
- **`DmoveTable scroll={{x, y:0}}`의 `y:0` 함정**: 본문을 높이 0으로 접어 **행이 화면에서 사라짐**. DOM엔 행이 있어 Playwright `locator.count()`는 통과 → **셀렉터 카운트만 믿으면 못 잡는 시각 버그**. 스크린샷 확인이 결정적. 해결: `scroll` prop 제거(DmoveTable 기본 `{x:1000}`).
- **서버사이드 정렬/검색 = "전체 집계 후 filter→sort→slice"**: moveseye는 페이지네이션을 메모리 slice로 처리하므로, 정렬/검색을 slice 이전에 전체에 적용해야 정확. `getServers`·`getDeviceTypeSummary`에 이미 있는 패턴을 재사용.
- **컬럼 dataIndex ↔ BE 정렬 키 일치**가 서버사이드 정렬의 핵심 계약.

## 상태 / 후속
- ✅ 런타임 검증 완료. **커밋은 미실시**(버그픽스 `663155e`만 커밋, 본 작업은 uncommitted).
- 변경 파일: BE 2(`search-filter.base.dto.ts`·`host.service.ts`), FE 6(`types/host-monitoring.ts`·`HostGroup.tsx`·`HostGroupCardView.tsx`·`HostGroupTableView.tsx`·`enums/common.ts`·`locales/{kr,en}.json`)
- 후속 후보: 상태칩(6등급) 컬럼/상태 필터, 카드↔테이블 전환 시 잔존 `offset/limit` query param 정리, [[2026-06-04-host-group-audit|P1]](N+1·캐싱)는 여전히 보류.

## 후속 (2026-06-09) — 테이블 Safety 컬럼 제거
- `HostGroupTableView.tsx`에서 **Safety(안정성) 컬럼 제거** → 테이블 8컬럼(Host group/Total hosts/Server/Network/Security/Database/Hardware/Not classified). 미사용된 `ProgressBar`·`roundPercentage` import도 정리.
- BE 응답 `safetyPercentage`·`THostGroupDashboard.safetyPercentage` 타입은 유지(카드뷰 등 타 사용처 가능성) → BE 무변경, 테이블에서만 미표시.
