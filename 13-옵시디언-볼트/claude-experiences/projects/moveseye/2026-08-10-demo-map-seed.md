---
tags: [moveseye, network-map, geo-map, demo-data, postgresql, visual-qa]
updated: 2026-08-10
---

# 2026-08-10 — 운영 네트워크 맵·지리 맵 데모 데이터 seed

## 목표와 원칙

비어 있던 운영 `network_architecture`·`geo_cluster`에 실제 화면 품질을 확인할 수 있는 풍부한 데모 문서를 넣었다. 새 Zabbix host나 가짜 hostid를 만들지 않고, 기존 asset snapshot과 좌표만 읽어 사용했다. 앞서 만든 `DEMO-ME-*` custom 자산 12건의 `zabbix_hostid=null`, `linked_hostid=null` 조건도 유지했다.

재현 SQL은 `C:\solutions\_workspace\seed_moveseye_demo_maps_20260807.sql`이다. 파일·actor의 `20260807`은 요청을 시작한 날짜 식별자이고, 운영 반영과 최종 브라우저 QA는 2026-08-10에 완료했다.

## 생성 데이터

### 네트워크 맵 2개

1. **`DEMO-MAP-NET — MovesEye 운영 플랫폼`** — main
   - 28 nodes, 19 edges, 실제 host 9개 연결.
   - External → Edge Security → Application Platform → Data & State → Observability & Delivery의 5개 zone.
   - Fortigate, K8S, Proxmox, PostgreSQL/MySQL, Zabbix server/proxy는 실제 asset hostid를 사용해 live 상태와 problem badge가 보인다.
   - React+Apache, Spring API, Redis와 `DEMO-ME-NAS-01`·`DEMO-ME-SRV-BACKUP-01`은 설명용 shape로 구성.
   - 포트·프로토콜·색상·실선/점선·화살표·그룹 배경을 채워 draw.io식 편집 기능을 한 번에 확인할 수 있다.

2. **`DEMO-MAP-NET — DR 전환·백업 흐름`**
   - 13 nodes, 8 edges, linked host 0개.
   - 기존 MovesEye custom 자산만 shape로 사용해 Primary Seoul DC → Immutable Backup Vault → Cloud DR 흐름을 표현.
   - Zabbix 호출 없이 작도 문서 자체의 렌더·편집·저장을 검증하는 예시다.

### 지리 맵 3개

1. **`DEMO-MAP-GEO — APAC Cloud Backbone`** — main: KR·JP·SG·AU 4 hosts, 4 links.
2. **`DEMO-MAP-GEO — Northeast Asia Edge`**: KR·JP·SG 3 hosts, 3 links.
3. **`DEMO-MAP-GEO — Oceania DR Route`**: KR·SG·AU 3 hosts, 3 links.

좌표는 운영 asset의 기존 `zabbix_data.inventory.location_lat/location_lon`을 사용했다. 동일 host가 여러 관점의 cluster에 재사용되므로 총 배치는 10개지만 원천 host는 4개다. map 문서와 `linked_hostids`만 생성했으며 asset/Zabbix 좌표는 수정하지 않았다.

## 안전장치와 검증

- `DEMO-MAP-NET%` 또는 `DEMO-MAP-GEO%`가 하나라도 있으면 transaction 전체를 중단하는 중복 guard.
- 지리 map 반영 전 필수 host 4개의 asset·좌표 snapshot 존재 여부 확인.
- insert 후 문서 수(2+3), JSON 배열, node/edge/host/link 수, `linked_hostids` 길이를 transaction 안에서 검증.
- 격리 PostgreSQL 18 `moveseye_it`에 좌표 fixture 4건을 임시 생성해 동일 SQL 적용.
- backend validator 규칙과 같은 node type `{host,shape,group}`, hostid 필수, 좌표 존재, 문서 1MB 제한을 별도 SQL로 검증.
- 격리 검증 결과: network diagram 4.9KB/2.3KB, geo diagram 0.9~1.1KB. 테스트 map 5개와 fixture 4건은 검증 후 0건으로 원상복구.
- 운영 commit 후 별도 DB 세션에서 network 2개·41 nodes·27 links, geo 3개·10 host placements·10 links를 재집계.
- 기존 `DEMO-ME-*` custom 자산은 12/12 모두 Zabbix 비연동 상태를 유지.

## 브라우저 시각 QA

로그인된 실제 FE `http://10.230.0.90`에서 확인했다.

- 홈의 대표 네트워크 맵과 대표 지리 맵이 모두 렌더됐다.
- 네트워크 상세에서 5개 zone, 28 nodes, 19 edges, live problem badge, 포트 라벨, minimap을 확인했다.
- 최초 긴 제목이 3줄로 감겨 subtitle과 겹치는 문제를 발견해 `MOVESEYE · OPS CONTROL` 24px로 축약하고 seed/운영 값을 함께 수정했다.
- 지리 상세는 MapLibre tile과 live overlay가 합쳐지는 데 약 5초가 걸린 뒤 KR·JP·SG·AU 핀과 4개 경로가 표시됐다.
- network list 2개, geo list 3개 문서명을 모두 확인했고 browser console warning/error는 0건이었다.

## 교훈

- 지리 맵 데모는 가짜 hostid를 만들기보다 **좌표가 이미 있는 asset snapshot을 재사용**해야 live 조회와 데이터 의미가 깨지지 않는다.
- map은 JSON 문서만 직접 넣어도 보이지만, `linked_hostids` 파생 cache가 diagram의 host 등장순·중복제거 결과와 맞아야 목록 집계·live overlay·좌표 해석이 정상이다.
- DB 구조 검증만으로는 텍스트 wrapping·viewport·지도 로드 지연을 잡지 못한다. 데이터 seed도 마지막에는 실제 홈·상세 화면을 봐야 한다.
- MapLibre 상세는 tile·live 상태·marker effect가 비동기로 합쳐지므로 최초 map 표시 직후의 빈 화면만 보고 실패로 판정하지 말고 marker 수 또는 잠시 뒤 화면을 확인한다.
- 운영 seed는 접두사, actor, 중복 guard, transaction, 사후 집계, 회수 기준을 한 파일에 같이 둔다.

## 후속 — 지리맵 링크 편집 진입 경로 복구

데모 링크의 `label`·`color`·`lineStyle`은 타입, Inspector, MapLibre 렌더러에는 이미 구현돼 있었지만 기존 선을 선택해 Inspector를 여는 상호작용이 빠져 있었다. 그래서 DB JSON을 직접 넣은 데모에서는 보이면서 사용자가 같은 결과를 UI로 만들 수 없는 기능 공백이 생겼다.

2026-08-10 후속 작업에서 편집기 `LinkLayer`에 14px 투명 hit area, pointer cursor, 선택 halo를 추가하고 클릭한 `linkId`를 `selectedLinkId`로 연결했다. 새 링크도 생성 직후 자동 선택한다. React 통합 테스트는 선 선택 → 라벨·색상·실선/점선 변경 → 저장 payload 왕복을, MapLibre 레이어 테스트는 hit-testing·배경 클릭 차단·읽기 전용 화면 비활성화를 검증한다.

교훈은 **데이터 계약·렌더링·편집 컨트롤이 존재해도 사용자가 대상 객체를 선택하는 진입 경로가 없으면 실제 기능이 아니라는 것**이다. 데모 데이터가 UI보다 앞서갈 때는 seed 적재 검증뿐 아니라 동일 상태를 UI로 재현할 수 있는지도 확인해야 한다.

## 후속 — 네트워크 맵 ㄷ자 링크 꺾임 간격 조절

같은 방향의 handle을 잇는 React Flow `getSmoothStepPath` 경로는 기본 `offset=20`으로 고정돼 있어, ㄷ자 링크가 노드나 다른 선과 겹칠 때 사용자가 높이를 조절할 수 없었다. 링크 `data.stepOffset`을 freeform diagram JSON에 영속하고, 꺾은선 Inspector에 8~400px 슬라이더·숫자 입력을 추가해 해결했다. 직선일 때는 컨트롤만 숨기고 값을 유지해 다시 꺾은선으로 전환하면 이전 간격을 복원한다.

기존 문서는 `stepOffset`이 없으므로 React Flow 기본과 같은 20px로 해석해 화면 drift를 막았다. 렌더러 전달값, Inspector 입력, 직선 조건부 노출, diagram serialize/deserialize 왕복을 테스트로 고정했으며 FE lint·TypeScript·production build를 통과했다.

교훈은 **라우팅 제어값을 별도 BE 컬럼으로 확장할 필요 없이 기존 freeform edge data에 넣되, 구 데이터의 라이브러리 기본값을 명시적으로 보존해야 한다는 것**이다. 직접 드래그 handle보다 Inspector 수치 제어를 먼저 제공하면 저장·복원·키보드 정밀 입력을 단순한 계약으로 안정적으로 지원할 수 있다.

## 회수 기준

삭제가 필요하면 먼저 두 접두사의 문서 5개를 조회해 확인한 뒤 사용자 승인 후 실행한다.

```sql
DELETE FROM network_architecture WHERE name LIKE 'DEMO-MAP-NET%';
DELETE FROM geo_cluster WHERE name LIKE 'DEMO-MAP-GEO%';
```

asset/Zabbix 원천을 수정하지 않았으므로 map 문서만 삭제하면 된다.

관련: [[moveseye]], [[2026-07-13-network-maps]], [[2026-07-29-geo-maps]], [[2026-07-08-assets-management]], [[2026-08-07-onprem-deployment-recovery]].
