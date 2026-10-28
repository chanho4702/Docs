---
tags: [moveseye, maps, geo-maps, design, spec, confluence]
created: 2026-07-15
updated: 2026-07-15
source: https://dmove.atlassian.net/wiki/spaces/ZM/pages/37252792342/01-3.+Maps+Geo+Maps
---

# 01-3. Maps: Geo Maps (맵 뷰: 지리 맵)

> 출처: [Confluence – 01-3. Maps: Geo Maps](https://dmove.atlassian.net/wiki/spaces/ZM/pages/37252792342/01-3.+Maps+Geo+Maps)
> 스페이스: MovesEye (ZM) · 작성자: Kollin · 최종 수정: 2026-07-13
> 관련: [[projects/moveseye/moveseye|moveseye]] · [[projects/moveseye/2026-07-13-network-maps|2026-07-13-network-maps]](2D 네트워크 맵) · [[projects/moveseye/assets-design-spec|assets-design-spec]](Maps는 Assets 좌표 기반)

---

## ⚠️ 미확정 항목 (확정 시 반영 필요)

| # | 항목 | 원본 표기 | 위치 |
| --- | --- | --- | --- |
| 1 | 한 화면 최대 표시 호스트 수 **M** | 값 미정 | [맵 배치 관련 §3](#3-화면에-표시될-호스트의-정보) |
| 2 | 좌표 데이터 없는 호스트 처리(특히 Host group 단위 추가) | "논의 필요" — 현재는 좌표 없으면 추가 불가 전제 | [맵 배치 관련 §4](#4-좌표-지정) |

> 이미지(기획 컷·다이어그램·화면 스크린샷 등 약 12개)는 Confluence 미디어 blob 링크라 텍스트만 이관됨. 캡션은 본문에 반영되어 있으며, 실제 이미지 삽입은 미처리(브라우저 캡처 필요).

---

## 배경

기존 Zabbix Map(네트워크 모니터링 맵)의 기능을 기반으로 확장한다.

- **Network Maps:** 호스트의 네트워크 맵을 2D로 시각적으로 표현
- **Geo Maps:** 모니터링할 호스트 위치를 지도 위에 시각적으로 표현
- 데모: <https://moveseye-demo.vercel.app/maps/geo> → Geo Maps **완료**

### 사용한 Map 관련 오픈소스

| 구분 | 리소스 | 라이센스 | 비고 |
| --- | --- | --- | --- |
| 지도 리소스 | [OpenFreeMap](https://openfreemap.org/) | [LICENSE](https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md) | |
| 렌더링 | [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) | [LICENSE](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt) | MapBox 유료화 이전 오픈소스 버전 |

---

## Geo Maps (지리 맵, 3D)

- 기존 기획 대비 **건물(3D 건물 오브젝트)은 없애기로 함**
- 화면 구성: **지도 + 핀 + 연결선 + 정보** 형태
- 참고 레퍼런스
  - [ManageEngine – Google Maps](https://www.manageengine.com/network-monitoring/help/google-maps.html)
  - [Zabbix 7.4 – Geomap widget](https://www.zabbix.com/documentation/7.4/en/manual/web_interface/frontend_sections/dashboards/widgets/geomap)

### 개요

- 상위 기획( `dmove.atlassian.net/wiki/x/OgCedAg` ) 기반
  - 자산 간의 연관 관계를 **3D 형태의 Map 뷰**로 볼 수 있어야 한다.
  - = Geo Map / Location Map 위에 자산을 배치하고 상태·관계를 보는 기능
- **Geo maps** = 물리적/지리적 위치를 나타낼 때 사용. **위치를 먼저 본다.**
  - **Topology Maps** = **관계를 먼저 본다.**

#### 렌더링과 관련하여 합의된 사항

- 지리 기반 정보를 사용하되, 3D 오브젝트를 다량 사용하는 것은 지양한다.
- 위치 정보 및 연관 정보는 **위도·경도 기반**으로 표시 → 3D 맵처럼 보이도록 조정
  - 자산 표시 형태: **Pin(핀) 📍**
- 사용자가 등록한 요소(호스트, 호스트 그룹) + 장애 상황(Problem)만 표시
  - 호스트 그룹은 '그룹' 단위 배치를 지원하지 않고, **'호스트 그룹 내의 호스트' 형태의 배치만** 지원한다.
- 목적: **'위치에 따라 문제가 다르게 나타나는가?'** 를 확인 (어느 지역/사이트에서 이상이 발생했는지 빠르게 감지)
- 지도에 표시된 호스트는 **문제 심각도(severity) 별로 필터링**할 수 있다.

---

## ➡️ Clustering Map (클러스터링 맵)

- Geo Maps 화면 전환 시 표시되는 **최초 화면**으로, Cluster 상세(Geo Map)로 이동하는 **진입점** 역할.
  - Clustering Map의 Cluster 중 하나 선택 → Cluster 상세(Geo Map) 진입
- 데이터 포함 관계: **Clustering Map ⊂ Clusters ⊂ 좌표에 포함된 Host들**
- Clustering Map에 표시되는 Cluster 정보
  - **숫자:** Cluster 내 Host의 개수
    - 표시 위치: Cluster 내 Host 좌표들의 **중앙 값**
  - **연결선:** 'Host 1개의 좌표'와 '숫자 표시 위치'를 연결

---

## 맵 배치 관련

### 1. 맵 배치 요소

- Geo Map에서는 **트리거(Trigger) 배치를 지원하지 않고, 호스트(Host) 및 호스트 그룹(Host group) 배치만 지원**한다.
  - 트리거 대신 호스트에 연결된 **'문제(Problem)' 정보**를 표시한다.
    - 문제도 맵에 직접 표시하지 않고, 호스트에 **문제 발생 아이콘만 1차로 표시** → 호스트 선택 시 문제 상세 확인.
  - 호스트 그룹 자체를 배치하는 것은 지원하지 않으며, **'호스트 그룹 내 호스트'를 배치하는 형태만** 지원.
- 좌표 Pin(핀)에는 뱃지로 **'Problem 발생 여부'와 'Host 개수'** 를 표시한다.
  - **우측 상단:** Problem 발생 여부 / **우측 하단:** Host 개수

### 2. 다중 배치

- 하나의 맵에는 여러 개의 요소(호스트)를 함께 배치할 수 있다.

### 3. 화면에 표시될 호스트의 정보

- 첫 진입 화면에서는 **Clustering Map**을 표시한다.
  - Cluster는 각 호스트들의 **중앙값**을 계산하여 위치시킨다.
- 한 화면에는 최대 **M개**의 호스트를 표시할 수 있다. `⚠️ 미확정: M 값 미정`
- 호스트는 좌표에 **Pin(📍) + 호스트 이름**을 함께 표기한다.
  - 좌표에 동일 호스트가 여러 개면 이름을 **목록**으로 표시.
  - Pin 클릭 시 우측 사이드 영역에 요약된 호스트 정보 표시.
    - 동일 좌표에 호스트 2개 이상: 요약 정보를 **구분선과 함께 목록**으로 표시.
    - 동일 좌표에 호스트 **10개 이상**이면 목록에 **페이지네이션** 적용.

### 4. 좌표 지정

- 배치된 호스트의 좌표 값은 **연관 자산(Asset) 좌표 값**으로 지정된다.
- **좌표 데이터가 없는 경우 → 논의 필요:** 단순 추가 시 좌표값 동시 입력은 가능하나, Host group 단위 추가 시 UI 처리가 곤란. `⚠️ 미확정`
  - 현재 기획은 **자산에 좌표 값이 없으면 추가되지 않는 것을 전제**로 작성.
- 동일 좌표 간 2개 이상의 연결 관계가 생성되어도 **연결선은 1개만** 표시.

### 5. 호스트 그룹(Host groups) 배치

- Geo Maps에서는 **'호스트 그룹 내 호스트'를 배치하는 형태만** 지원한다.

### 6. 화면 표시 레이어 레벨 (오른쪽으로 갈수록 위)

```
Pin(핀)(Hosts, Host groups) < Links < Problems
요소(호스트, 호스트 그룹)     < 연결선 < 장애
```

---

## 사용 흐름

### Clustering Map → 생성/상세 → 편집 화면 진입

1. 좌측 메뉴 바 **[Maps > Geo Maps]** 선택 → '클러스터링 맵 화면' 진입.
2. **생성 화면 진입**
   - [클러스터 생성] 버튼 → '신규 클러스터 생성 화면' 진입.
   - 아무것도 배치되지 않은 빈 지도 표시.
3. **편집 화면 진입**
   - '클러스터링 맵 화면'에서 조회할 클러스터 선택 → 상세 화면 이동.
   - [클러스터 편집] 버튼 → '클러스터 편집 화면' 진입.
   - 해당 클러스터 정보를 유지한 채 편집 화면으로 전환.
4. 생성/편집 화면 내부 **[요소 추가]** 버튼으로 요소 추가.

### Cluster 생성/편집

1. 생성/편집 화면 내부 **[요소 추가]** 버튼으로 요소 추가.
2. [요소 추가] 시 지도 위에 Host가 추가된다.
   - Host group 추가 시 그룹 내 **모든 호스트**가 추가된다.
   - 단, **자산에 좌표 값이 없는 호스트는 Cluster에 추가 불가**.
3. Network Map과 달리, 별도로 정보를 추가할 필요가 없다.
4. **[연결 추가]** 버튼 후 호스트 2개를 순서대로 선택 → 연결 관계 형성.
   - 좌표 Pin 선택 시 호스트 선택 팝업(목록) 표시.
   - **먼저 선택된 호스트 → 후에 선택된 호스트** 방향으로 연결.
   - 동일 좌표 간 2개 이상 연결 생성돼도 **연결선 1개만** 표시.

> 참고: draft / preview = 저장되기 전의 데이터

---

## 화면 예시

### Clustering Map 화면

1. **주요 영역**
   - Clustering Map: Cluster 표시, 지도 이동 및 확대(+)/축소(-)
   - Cluster scope: Cluster 목록, 검색 창, 심각도
   - Create cluster 버튼
2. **표시 정보**
   - Cluster에 포함된 Host 수
   - Cluster 내 열린 Problem의 **최고 심각도**(색상 구분)
3. **주요 상호작용**
   - 지도 위 Cluster 선택 → Cluster Detail 화면 전환
   - Create cluster 선택 → Cluster 생성 화면 전환
4. **화면 상태**
   - 처음 진입: 전체 Cluster 목록 표시
   - 저장된 Cluster 없음: 빈 목록과 지도 표시
   - 검색 시: 조건에 맞는 Cluster만 표시
   - 목록 로딩 중: 로딩 상태 표시

### Cluster Detail (상세) 화면

1. **주요 영역**
   - Cluster 이름·설명, Edit cluster 버튼, Set as main map 토글
   - Host가 표시된 지도 (Severity 필터, Display 필터, 확대/축소 버튼)
2. **표시 정보**
   - **지도**
     - Pin(핀): 위치(좌표), Problem Severity 색상 차등, Problem 발생 여부 뱃지, 동일 좌표 내 호스트 수 뱃지
     - Link: host–host 간 연결
   - **상세 팝업**
     - Problems 탭: Problem 명, 심각도, 상태 / Problem Detail 바로가기
     - Hosts 탭: Host 명, 상태, Host group / Host Detail 바로가기
     - Assets 탭: 연결된 Host 명, 좌표 정보 / Asset Detail 바로가기
   - **Link:** 상태(색상), Pin 및 호스트 간 연결
3. **주요 상호작용**
   - 지도 이동·확대·축소로 전체/특정 구간 탐색
   - Severity/Display 필터 선택 → 일치 Pin과 양 endpoint가 모두 보이는 Link만 표시
   - 상세 팝업에서 Problem/Host/Asset 상세 화면 이동
   - Edit 선택 → 현재 Cluster 편집 화면 이동
4. **화면 상태**
   - 기본 탐색: 전체 Pin·Link 표시
   - Pin 선택: 선택 Pin 강조 + 상세 팝업(Problem/Host/Asset)
   - Severity/Display 필터 적용: 불일치 Pin, endpoint 숨겨진 Link 제외
   - Pin 없음: 빈 지도 표시
   - 로딩 중: 로딩 상태 표시

### Cluster 생성/편집 화면

1. **주요 영역**
   - Cluster settings: Name, Description
   - Element palette: Host / Host group 탭(후보 목록), 검색창
   - 지도: Pin, Pin 간 Link 연결
     - 배치: Link, Clear(신규 배치 초기화)
     - 화면 조정: 확대(+)/축소(-), Fit / Reset
2. **표시 정보**
   - Map settings: Name, Description
   - Canvas: Width, Height
     - Elements: Canvas 내 위치, element type, label, Severity 색상 차등, Problem overlay(Problem 여부)
     - Link: 상태, 방향, label
   - Inspector
     - Element: label, 좌표(canvas 내 (x,y)), Host group 표시 방식, Delete 버튼
     - Link: 유형, 방향, 상태, 라벨, 출처, 영향 Problem
3. **주요 상호작용**
   - Cluster 이름·설명 입력/수정
   - Element 유형 탭 선택 → 후보 검색 → Host/Host group 지도 추가
   - Link mode에서 source→target 호스트 순서 선택으로 Link 생성
   - 지도 확대·축소, Fit/Reset view로 보기 범위 조정
   - 호스트 삭제 시 연결된 Link도 함께 제거
   - Save: 변경된 Cluster 설정·Element·Link 저장
   - Cancel/Back: 저장 없이 이전 화면 복귀
4. **화면 상태**
   - Create 초기: 빈 지도 + Cluster settings
   - Edit 초기: 저장 구성 표시 + 편집 허용
   - Pin 선택: 선택 핀 강조 + 좌표 상세 팝업
   - Link mode: 배치 Pin 2개 이상이면 Link 버튼 활성화
     - 핀 선택 → 호스트 선택 팝업(핀 내부 호스트)
     - source 선택 후 target 선택 단계 전환
     - Host 2개 미만이면 Link mode 비활성화
     - 동일 endpoint 조합이면 새 Link 미생성
   - 저장 완료: 저장된 Cluster Detail로 이동, 반영 구성 표시
   - 로딩 중: 로딩 상태 표시

---

## 기능 요구사항

### Clustering Map

| 요구사항 | 입력 | 조건 | 결과 |
| --- | --- | --- | --- |
| 사용자는 Geo Map 목록을 Clustering Map 형태로 조회할 수 있다. | - | 기본 진입 또는 선택된 scope | 클러스터 단위의 지도 요약을 표시한다. |
| 각 cluster는 포함된 Host 수를 표시해야 한다. | cluster ID | cluster에 Host 존재 | 해당 cluster의 Host count를 표시한다. |
| 각 cluster는 최고 severity(심각도)를 계산해 색으로 표시한다. | cluster 내 Problem severity, Host 상태 | cluster에 상태 데이터 존재 | cluster pin 색상 또는 badge에 최고 severity를 반영한다. |
| 사용자는 cluster를 선택해 해당 cluster에 대한 Geo map(Cluster Detail)을 조회할 수 있다. | cluster ID | cluster에 데이터 존재 | 선택한 cluster에 포함된 location pin만 표시하는 Geo Maps 범위로 전환한다. |
| 사용자는 clustering map으로 되돌아올 수 있다. | - | cluster 선택 상태 | 전체 cluster pin 표시 상태로 돌아간다. |
| 사용자는 지도를 확대/축소/이동을 할 수 있다. | - | - | 지도 viewport가 변경된다. |
| 사용자는 Create Cluster를 통해 신규 Cluster를 추가할 수 있다. | - | - | 신규 Cluster 추가 화면으로 이동한다. |

### Cluster Detail (Geo Map) / Host pin

| 요구사항 | 입력 | 조건 | 결과 |
| --- | --- | --- | --- |
| 시스템은 Host의 연결 Asset 좌표로 Pin을 생성한다. | Host.linkedAssetId | Asset 좌표 유효 | Host를 해당 좌표 pin에 포함한다. |
| 시스템은 같은 좌표의 Host를 하나의 Pin으로 집계한다. | latitude, longitude (위도 및 경도) | 동일 좌표 Host 2개 이상 | Host 수와 최고 심각도를 표시한다. |
| pin 색상은 해당 좌표의 최고 severity를 반영한다. | Problems, Host 상태 | location에 상태 정보 존재 | severity 색상으로 pin을 표시한다. |
| Problem 탭은 추가된 Host에 대한 Problem 목록을 표시해야 한다. | Host ID | 관련 Problem 존재 | severity, Problem title, 연관 Host명, Possible cause 요약을 표시한다. |
| Host 탭은 추가된 Host에 대한 Host 목록을 표시해야 한다. | Host ID | 관련 Host 존재 | Host명, Host group, health state를 표시한다. |
| Host 탭은 추가된 Host에 대한 Asset 목록을 표시해야 한다. | Host ID | 관련 Asset 존재 | Asset명, 연관 Host명을 표시한다. |
| 사용자는 Host 상세 팝업을 통해 관련 상세 정보로 이동할 수 있다. | Host/Problem/Asset ID | 관련 객체 존재 | 대상 Detail 화면으로 이동한다. |
| 사용자는 severity(심각도)를 필터링하여 표시 범위를 좁힐 수 있다. | severity | - | 필터 조건에 맞는 pin과 요약 정보를 표시한다. |
| 사용자는 지도를 확대/축소/이동을 할 수 있다. | - | - | 지도 viewport가 변경된다. |
| 사용자는 Edit Cluster를 통해 현재 Cluster를 편집할 수 있다. | Cluster ID | - | 현재 지도 표시 정보와 viewport를 유지한 상태로 편집 UI로 전환된다. |

### Cluster Create/Edit

| 요구사항 | 입력 | 조건 | 결과 |
| --- | --- | --- | --- |
| 사용자는 Cluster 이름과 설명을 입력하거나 수정할 수 있다. | name, description | - | 변경값을 Draft Cluster에 반영한다. |
| 시스템은 Element Palette에서 Host와 Host group 탭에서 선택 가능한 소스를 표시해야 한다. | 검색어, Host group ID | - | Host 목록과 Hostgroup 목록을 Source Palette에 표시한다. |
| 사용자는 Element Palette에서 Host 또는 Host group을 검색할 수 있다. | 검색어 | Host 또는 Host group 존재 | 검색 조건과 일치하는 후보만 표시한다. |
| 사용자는 개별 Host를 Cluster 구성원으로 추가할 수 있다. | Host ID | Host 존재 | 선택 Host를 Pending Host에 추가하고 Preview를 갱신한다. |
| 사용자가 Host group을 추가하면, Host group이 아닌 Host 형태로 배치된다. | Host group ID | Host group과 멤버 Host 존재 | 선택 시점의 멤버 Host를 추가하고 Host group 자체는 저장하지 않는다. |
| 동일 Cluster 내에는 동일한 Host를 2개 이상 배치할 수 없다. | - | 동일 Host를 중복 배치한 경우 | 하나의 Host만 배치하고 2개 이상 배치하지 않는다. |
| 시스템은 선택 Host의 연결 Asset 좌표를 기반으로 Host들을 그룹핑하고, 이를 Pin(핀)으로 표시해야 한다. | Host ID, Asset 좌표 | 유효한 Asset 좌표 존재 | 단일·동일 좌표 집계 pin과 Host 수를 지도에 표시한다. |
| Asset에 좌표 정보가 없는 Host는 Cluster에 추가될 수 없다. 사용자는 사유를 확인할 수 있어야 한다. (알림 팝업 등) | Host ID | Asset 내 좌표 정보 누락 혹은 오류 | Host 추가에 실패하고, 실패 사유를 표시해야 한다. |
| 사용자는 선택 Cluster의 설정과 포함 Host를 저장할 수 있다. | Cluster ID, 변경 정보 | - | Cluster와 Host 관계를 갱신하고 Cluster Detail을 갱신한다. |
| 사용자는 변경을 저장하지 않고 Create/Edit Panel을 닫을 수 있다. | - | - | Draft 변경을 버리고 Panel을 닫은 뒤 이전 Cluster와 viewport를 복원한다. |
