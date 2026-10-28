---
tags: [moveseye, feature, maps, fullstack, zabbix-inventory]
updated: 2026-08-10
---

# 2026-07-15~29 — 지리 맵(Geo Maps): 구현 → 좌표 편집 → 결함 12건

기획서([[projects/moveseye/geo-maps-design-spec|geo-maps-design-spec]]) 기반 구현을 07-15에 마치고(경계면 QA 불일치 0), 07-28에 **좌표 편집을 당겨서 도입**하며 검토에서 나온 결함 12건을 함께 해소했다. BE `38ae4d4` / FE `8261d7a` — 커밋·푸시 완료(2026-07-29).

## 구조

- **Cluster = 저장 문서**([[projects/moveseye/2026-07-13-network-maps|2026-07-13-network-maps]]의 V7 jsonb 문서형을 복제) — `V8__geo_cluster.sql`, `diagram_json`에 hosts/links/viewport.
- **좌표는 문서에 저장하지 않는다(D1)** — 원천은 Zabbix 인벤토리 `location_lat`/`location_lon`이고, 자산 스냅샷을 거쳐 `GeoCoordinateResolver`가 해석한다.
- 지도 엔진 MapLibre GL + OpenFreeMap(3D 지양, 위경도 Pin). 화면 3종: Clustering(진입) / Detail / Editor.
- API 10개. 라이브 오버레이(`/live`)는 네트워크 맵 패턴 재사용.

## 좌표 편집 (2026-07-28 개정)

| # | 결정 |
|---|---|
| D4 | **편집도 원천에 쓴다** — `host.update`로 Zabbix 인벤토리를 갱신하고 `syncOne`으로 자산 스냅샷 즉시 반영. 문서 오버라이드는 "지도에선 A, 자산 화면에선 B"가 되므로 기각 → D1 불변 |
| D5 | **좌표 없는 호스트도 배치 가능** — 팔레트 사전 차단을 풀고, 배치 대기 상태에서 지도 클릭/직접 입력으로 좌표 부여 |
| D6 | 진입점 3개 — 핀 드래그(단일 핀만) / Inspector 위경도 입력 / 배치 대기 부여 |

구현상 요점: EP #10 `PATCH /geo-clusters/host-coordinate`는 **`HostManageService.updateInventoryLocation`에 위임**한다(호스트 도메인의 쓰기 경로·감사 로그·자산 동기화를 재사용). 외부 HTTP 왕복이 있어 `@Transactional`은 붙이지 않음. 저장은 소수 6자리 반올림 + `BigDecimal.toPlainString`(지수표기 금지). `inventory_mode` disabled(-1)는 manual(0)로 전환하며 저장.

## 함께 해소한 결함 12건 (등급순 요약)

- **HIGH** — `getLive` 호스트별 알람 조회 N+1 → `HostLiveAggregator` 배치 1회(응답 shape 불변) / 저장된 viewport 복원 불가(**자식 지도 생성 effect가 부모보다 먼저 실행**) → 렌더 중 계산 / 미저장 이탈 경고 부재 → `beforeunload`+모달.
- **MED** — 🔴 **클러스터 잠김**: 좌표를 잃은 배치 호스트는 핀이 없어 제거도 못 하는데 저장은 계속 실패 → 배너에 "위치 지정 / 전부 제거" / 🔴 `"NaN"` 좌표가 **범위 비교를 통과**해 centroid를 오염 → 유한성 검사 선행 / 후보 무제한 조회 → LIMIT 500 + `asset.linked_hostid` 인덱스(V14) + LIKE 메타문자 이스케이프 / 같은 hostid에 자산이 둘이면 좌표 해석이 비결정적 → 좌표 보유 자산 우선 + dedup / 삭제·이름 수정 UI 부재 / 지도 로드 실패 무음 → `map.on("error")` + 배너 / 핀 상세 페이지네이션 리셋 누락·마커 매 렌더 재생성.
- **LOW** — zoom 0(전 세계 뷰)이 기본값에 덮이던 문제 → **무효값만 보정**하도록 계약 변경(테스트 동반 수정).

## 교훈

- **NaN은 범위 비교를 통과한다** (`NaN < -90`도 `NaN > 90`도 false) — 좌표·수치 가드는 유한성 검사가 먼저다.
- **자식 컴포넌트의 effect가 부모보다 먼저 실행된다** — "부모가 세팅해 둘 것"을 전제한 초기화는 effect에 두면 안 된다.
- 편집 대상의 **삭제 경로가 없으면 저장이 영구히 막힌다**(클러스터 잠김) — 유효성 실패에는 언제나 탈출구를 붙일 것.
- 좌표 상태를 ref→state로 승격 — 좌표만 바뀌어도 핀이 다시 그려져야 한다.
- 3단 경로(목록→상세→편집)는 `replacePathBreadcrumb` 필수.

## ⚠️ 열린 항목

- **배포 전 자산 동기화 1회 필수** — dev DB는 `asset.linked_hostid`가 전부 NULL이라 팔레트 후보가 0건으로 보인다(기능 문제 아님).

관련: [[projects/moveseye/geo-maps-design-spec|geo-maps-design-spec]], [[projects/moveseye/2026-07-13-network-maps|2026-07-13-network-maps]], [[projects/moveseye/2026-07-08-assets-management|2026-07-08-assets-management]], [[projects/moveseye/2026-07-18-host-registration|2026-07-18-host-registration]]

## 2026-08-10 — 운영 demo cluster seed

기존 asset의 KR·JP·SG·AU 좌표 snapshot만 재사용해 지리 cluster 3개를 만들었다. asset/Zabbix 원천 수정 없이 홈·상세 MapLibre 핀과 링크를 브라우저에서 확인했다. 상세 데이터와 검증·회수 절차는 [[projects/moveseye/2026-08-10-demo-map-seed|2026-08-10-demo-map-seed]] 참조.
