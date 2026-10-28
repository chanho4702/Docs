# MovesEye 개발 설계 — Network Maps (네트워크 아키텍처 작도)

> 작성일: 2026-07-13 · 대상: `moveseye-be-spring` + `moveseyee_fe`
> 선행 문서: `apply_design_assets-cost-maps.md` §3.1(Phase 3 개요) · `demo_analysis_assets-cost-maps.md` §3.1(데모 관찰)
> 이번 세션 = **설계 문서만**. 구현은 승인 후 fullstack-feature 파이프라인.

## 확정 방향 (2026-07-13 사용자 결정)

| 항목 | 결정 |
|---|---|
| 제품 성격 | **draw.io 스타일 네트워크 아키텍처 작도 도구** — 모니터링 뷰가 아니라 에디터가 본체. 아키텍처(다이어그램)를 생성하고 캔버스에서 호스트 배치·연결·박스·라벨·포트·노드유형·이모지로 그린다 |
| 맵 원천 | **자체 맵 빌더** (Zabbix sysmap 동기화 안 함 — Zabbix 맵과 무관한 독립 저장) |
| 1차 범위 | **에디터 포함** (작도가 기능의 본체이므로 조회 전용 1차는 성립 안 함) + 상태 오버레이 가볍게 |
| 상태 오버레이 | **1차 포함(경량)** — 호스트 노드에 가용성 상태 점 + 오픈 Problem 수 뱃지. 기존 host/problem 조회 재사용 |
| 편집 권한 | **모든 인증 사용자 편집** (⚠️ 기존 "변경성=관리자 전용" 규칙의 **의도된 예외** — 다이어그램은 문서 성격. created_by/updated_by 기록) |
| 캔버스 기술 | **React Flow (`@xyflow/react` v12)** 신규 의존성 — 노드-엣지 에디터 전용 라이브러리(드래그 배치·커스텀 노드·그룹·핸들). MIT, npm 번들이라 폐쇄망 OK. ECharts graph는 조회용이라 에디터에 부적합 |
| 메뉴 위치 | 자산 관리 > 지도 > **네트워크 맵** 슬롯을 신규 화면으로 교체 (현재 임시 배정된 `MapViewList`(/asset/mapview)는 슬롯 반납 — 거취는 §8 미확정) |

---

## 1. 개념 모델

```
아키텍처(network_architecture) 1 ─── 1 diagram_json (React Flow 문서)
                                          ├─ nodes[]: host | shape | group
                                          ├─ edges[]: 연결(라벨·포트 표기)
                                          └─ viewport: {x,y,zoom}
```

- **아키텍처** = 이름·설명을 가진 다이어그램 1장. 목록에서 생성 → 캔버스에서 작도 → 저장.
- **노드 3종**:
  - `host` — Zabbix 호스트 연결 노드. `hostid` 보유, 라벨=호스트명(수정 가능), **상태 오버레이 대상**.
  - `shape` — 일반 도형 노드. `nodeType`(server/database/cloud/network/security/etc — 자산 device_type 6종과 값 공유) + **이모지 아이콘**(선택) + 자유 라벨.
  - `group` — 박스 컨테이너(React Flow parent 노드). 라벨 지정, 자식 노드 포함(예: "DMZ", "Data Platform").
- **엣지** = 노드 간 연결. 자유 라벨 + **포트 표기**(sourcePort/targetPort 문자열, 예: "443", "eth0") — 엣지 양끝 라벨로 렌더.

## 2. 저장 모델 — Flyway `V7__network_architecture.sql`

**diagram-as-document 채택**: 자유 작도 도구는 노드/엣지 구조가 React Flow 직렬화와 1:1이고 개별 노드를 SQL로 질의할 일이 없다 → 정규화(node/link 테이블) 대신 **jsonb 문서 1개**. (개요 문서의 `network_map_node/link` 3테이블 안은 자체 빌더+문서형으로 대체)

```sql
CREATE TABLE IF NOT EXISTS network_architecture (
  id             serial PRIMARY KEY,
  name           varchar NOT NULL,
  description    varchar,
  diagram_json   jsonb   NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  linked_hostids jsonb   NOT NULL DEFAULT '[]'::jsonb,  -- host 노드의 hostid 배열 캐시(저장 시 서버가 diagram에서 추출) — live 오버레이·목록 카운트용
  is_main        boolean NOT NULL DEFAULT false,
  created_by     varchar,                                -- 사용자 식별(이 코드베이스 사용자 식별 관례 따름)
  updated_by     varchar,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_network_architecture_main ON network_architecture (is_main) WHERE is_main = true;  -- main은 최대 1개
```

- `diagram_json`은 서버가 **구조 검증**(nodes/edges 배열 존재, 노드 type ∈ {host,shape,group}, host 노드는 hostid 필수) 후 저장. 크기 상한(예: 1MB) 초과 시 에러.
- `linked_hostids`는 클라이언트 입력을 믿지 않고 **서버가 diagram_json에서 재추출**해 저장(파생 캐시).
- 물리 삭제 채택(자산과 달리 동기화 부활 우려 없음). 실수 방지는 FE 확인 모달로.

## 3. API — `networkmap/` 패키지 (신규 7개)

| # | EP | 권한 | 응답 요지 |
|---|---|---|---|
| 1 | `GET /network-architectures` | U | 목록: id·name·description·nodeCount·edgeCount·isMain·updatedAt·updatedBy (+ `problemCount`는 목록에선 미포함 — live는 상세 전용, 목록 부하 방지) |
| 2 | `POST /network-architectures` | U | 생성 {name, description} → 빈 다이어그램. 응답 = 상세 |
| 3 | `GET /network-architectures/{id}` | U | 상세: 목록 필드 + `diagramJson` 전체 |
| 4 | `PATCH /network-architectures/{id}` | U | name/description/diagramJson 부분 수정. **낙관적 잠금**: 요청에 `baseUpdatedAt` 포함, 서버 updated_at과 불일치 시 `NETMAP_CONFLICT` 에러(모든 사용자 편집 가능 → 동시 편집 덮어쓰기 방지) |
| 5 | `DELETE /network-architectures/{id}` | U | 물리 삭제 |
| 6 | `PATCH /network-architectures/{id}/main` | U | Set as main — 트랜잭션 내 기존 main 해제 후 지정 |
| 7 | `GET /network-architectures/{id}/live` | U | `linked_hostids` 기반 상태 오버레이: `[{hostid, available, openProblemCount, worstSeverity}]`. 자산 상세 resolveLive 패턴 재사용(**트랜잭션 밖에서 Zabbix 호출** — 2026-07-13 분리 교훈 준수). 호스트 0개면 빈 배열 |

- 공통: `@VisitorIdCheck` + Bearer(기존 관례). **requireAdmin 미적용**(확정 예외) — created_by/updated_by에 요청 사용자 기록.
- 호스트 선택기는 **기존 hosts 목록 API 재사용**(신규 EP 없음).
- 에러코드: `NETMAP_NOT_FOUND` / `NETMAP_CONFLICT` / `NETMAP_INVALID_DIAGRAM` / `NETMAP_TOO_LARGE` / `NETMAP_DUPLICATE_NAME`(이름 유니크는 미강제, 중복 시 경고만 — 미확정 §8).

## 4. FE — `pages/asset/networkmap/`

**신규 의존성**: `@xyflow/react` (React Flow v12). 설치 확인됨: 미설치 → 추가 필요. echarts/maplibre는 이 기능에 사용 안 함.

### 4.1 라우트·메뉴
- `/asset/network-map` — 아키텍처 목록 (`NetworkMapListPage`)
- `/asset/network-map/:id` — 캔버스 에디터 (`NetworkMapEditorPage`)
- SideNav "네트워크 맵" 항목의 대상 경로를 `/asset/mapview` → `/asset/network-map`으로 교체 (MobileSideNav 동일). `/asset/mapview` 라우트 자체는 존치(§8 거취 확정까지 URL 직접 접근 허용).

### 4.2 목록 페이지
- 헤더: 제목 + [아키텍처 생성](이름·설명 모달). 
- 테이블(DmoveTable): 이름(→에디터) · 설명 · 노드/연결 수("N nodes / M links") · Main 뱃지 · 수정일시 · 수정자 · 삭제 버튼(확인 모달).
- main 아키텍처는 목록 최상단 고정(대시보드가 없으므로 "main" = 목록 기본 진입 강조로 정의).

### 4.3 에디터 페이지 (핵심)
```
┌──────────┬──────────────────────────────┬───────────┐
│ 팔레트    │  React Flow 캔버스             │ 속성 패널  │
│ ─ 호스트  │  (미니맵·줌·스냅그리드·         │ (선택 요소 │
│   검색목록 │   배경 dot, fitView)          │  편집)     │
│ ─ 도형    │                              │           │
│   6유형   │                              │           │
│ ─ 박스    │                              │           │
└──────────┴──────────────────────────────┴───────────┘
  상단바: ‹ 목록 · 아키텍처명(인라인 수정) · dirty 표시 · [상태 새로고침] [Set as main] [저장]
```
- **팔레트(좌)**: ① 호스트 패널 — 구성(위→아래): **검색 입력 → 호스트 그룹 선택(필터, 전체 기본·clear 가능·검색과 AND) → 호스트 목록** (2026-07-13 사용자 피드백 — 그룹 필터는 필수 요소, 기존 호스트그룹 API 재사용). 기존 hosts API로 검색·목록, 드래그(또는 클릭 추가)로 캔버스에 host 노드 배치. 이미 배치된 호스트는 표시(중복 배치 허용 여부 §8). ② 도형 노드 6유형 버튼(server/database/cloud/network/security/etc — 아이콘+라벨). ③ 그룹 박스.
- **커스텀 노드 3종**:
  - HostNode: 호스트명 + 상태 점(available: green/red/gray) + Problem 수 뱃지 + IP(있으면). **+ 도형 유형(6유형)·이모지 지정 가능**(2026-07-13 사용자 피드백 — 유형·이모지는 ShapeNode 전유물이 아니라 호스트 노드에도 적용, 렌더에 반영). 
  - ShapeNode: 이모지(이모지 피커로 선택, 미선택 시 유형 기본 아이콘) + 라벨 + 유형 태그.
  - GroupNode: React Flow parent/child로 구현(리사이즈 가능, 라벨 좌상단). 자식 드래그 인/아웃.
- **엣지**: 기본 bezier/smoothstep, 클릭 선택 → 속성 패널에서 라벨·sourcePort·targetPort 입력. 포트는 엣지 양끝에 소형 라벨 렌더. **엣지·포트 라벨은 그룹 박스보다 항상 위 레이어**(그룹=최하층 배경 컨테이너 — 2026-07-13 피드백).
- **색상 지정**(2026-07-13 추가): 노드(3종 전부)·엣지에 색상 지정 — 속성 패널의 경량 프리셋 스와치(또는 AntD ColorPicker). `data.color`로 직렬화(round-trip 포함). 미지정=기본 스타일. host 노드 상태점·Problem 뱃지의 모니터링 의미색과 분리 유지.
- **프리셋 카탈로그**(2026-07-13 확장, 사용자 지정 목록): 단순 이모지 그리드 대신 **카테고리별 emoji+라벨 프리셋**(클라이언트 5종 User/Admin/PC/Mobile/Browser는 팔레트 도형에도 노출 · 네트워크 10종 Internet~WAF · 서버/플랫폼 9종 · 데이터 8종 · 모니터링 5종 · CI/CD 5종). 선택 시 이모지 적용 + 라벨 비었으면 프리셋명 자동. 제품명 라벨은 i18n 제외(고유명사), 카테고리 헤더만 kr/en.
- **그룹 박스 스타일**(2026-07-13 피드백): 기본 검정 테두리 금지 — 색 지정 시 테두리·배경 틴트·라벨·리사이저까지 지정색 연동, 미지정 시 중립 회색. 라벨은 캔버스 더블클릭 인라인 편집.
- **자유 텍스트 요소**(2026-07-13 추가): draw.io식 순수 텍스트 노드 — **BE 검증기(type 3종 고정) 때문에 type="shape"+`data.variant="text"`로 구현**(테두리·배경·이모지 없음, 더블클릭 편집, 크기 소/중/대, data.color 적용).
- **도형 리사이즈**(2026-07-13 추가): shape 노드도 NodeResizer로 크기 조절(그룹 전유물 아님), width/height 직렬화 보존. 리사이즈 dirty 판정은 `resizing:true`일 때만(초기 측정 오탐 제외).
- **뷰/편집 모드 분리**(2026-07-13 추가): 에디터 기본 = **읽기전용 뷰 모드**(팬/줌만, 팔레트·속성 패널 숨김) → 상단 [편집]으로 편집 모드 진입([저장][Set as main]은 편집 모드 전용). 모드 전환 시 로컬 변경·dirty 유지.
- **속성 패널(우)**: 선택 요소별 동적 — 노드(라벨/유형/이모지/삭제), host 노드(+ 연결 호스트 정보, live 상태, [호스트 상세 열기] 링크), 엣지(라벨/포트/삭제), 미선택 시 아키텍처 정보(이름/설명 편집).
- **저장**: 수동 [저장] 버튼(dirty 추적, 이탈 시 확인). `PATCH`에 `baseUpdatedAt` 동봉 → `NETMAP_CONFLICT` 수신 시 "다른 사용자가 수정함" 안내(덮어쓰기/새로고침 선택). 자동저장·undo/redo는 2차.
- **상태 오버레이**: 에디터 진입 시 `GET .../live` 1회 + [상태 새로고침] 버튼(1차 폴링 없음). react-query 별도 쿼리키(`NETMAP_QUERY_KEY` 네임스페이스 — 자산·레거시와 분리, 2026-07-13 쿼리키 분리 교훈).
- i18n en/kr 신규 키(`network_map.*`), 기존 device_type 라벨 키 재사용.

### 4.4 테스트
- 목록 페이지 렌더/생성/삭제, 에디터 직렬화 round-trip(diagram→저장 payload→복원), 커스텀 노드 렌더(상태 점/뱃지), conflict 에러 분기. React Flow 캔버스 자체 상호작용은 jsdom 한계 → 로직 단위(스토어/변환 함수) 위주 + functional-qa 런타임 검증으로 보완.

## 5. 구현 단계 (승인 후 fullstack-feature)

| P | 담당 | 내용 |
|---|---|---|
| 1 | be-engineer | V7 + 도메인/서비스/컨트롤러/DTO + diagram 검증·hostids 추출·낙관적 잠금·main 유일성 + live(트랜잭션 밖 Zabbix) + 단위테스트 → 계약서 `features/maps/network-maps/contract_network-maps.md` 산출 |
| 2 | api-contract-sync | 계약 ↔ FE 타입 대조 |
| 3 | fe-engineer | `@xyflow/react` 도입 + 목록/에디터 페이지 + 커스텀 노드/엣지 + 팔레트/속성 패널 + 오버레이 + 라우트/메뉴 교체 + i18n + 테스트 |
| 4 | integration-qa → functional-qa | 경계면 대조 → dev 런타임: 작도→저장→재로드 round-trip, 동시편집 conflict, live 오버레이(실 Zabbix), main 지정 |

난이도: FE **상**(에디터), BE **중하**(문서형 CRUD + live 재사용).

## 6. 기존 규약 준수 체크리스트
- Flyway V7 신규(기존 V1~V6 미수정) · jsonb `@JdbcTypeCode(SqlTypes.JSON)` · 403→200 envelope · `@VisitorIdCheck`
- Zabbix 호출은 트랜잭션 밖(2026-07-13 AssetSync/getDetail 분리 패턴)
- offset 페이징 필요 시 `OffsetBasedPageRequest` 사용(목록이 커지면 — 1차는 아키텍처 수가 적어 전체 조회도 가능, be-engineer 판단)
- FE 언랩 깊이(payload 직접) · `useTableColumns` title 관례 · `npx jest` · i18n kr/en 동시

## 7. 2차 로드맵 (이번 미구현, 기록만)
- undo/redo · 자동저장 · 버전 이력(스냅샷) · PNG/이미지 export · 엣지 스타일(색/점선/방향 화살표 커스텀) · 노드 복사/붙여넣기 · Zabbix sysmap import(원클릭 초안 생성) · Problem 발생 엣지/경로 강조(데모의 severity 오버레이 고도화) · 템플릿(자주 쓰는 구성 프리셋)

## 8. 미확정 → ✅ 전건 확정 (2026-07-13 사용자 결정)
| # | 항목 | 확정 |
|---|---|---|
| 1 | `MapViewList`(/asset/mapview) 거취 | **Geo Maps로 흡수**. 이번 1차 구현에서는 메뉴 노출 제거(네트워크 맵 슬롯이 신규로 교체되면 자연 이탈)하되 `/asset/mapview` 라우트는 존치(URL 직접 접근 허용). 실제 흡수(Mapbox→MapLibre 재작성 + 클러스터 스코프 통합)는 Geo Maps 단계(apply_design §3.2)에서 수행 |
| 2 | 같은 호스트의 중복 배치 | **허용** — live는 hostid 기준으로 모든 배치 노드에 일괄 적용 |
| 3 | 아키텍처 이름 중복 | **유니크 미강제** (`NETMAP_DUPLICATE_NAME` 에러코드 불필요 — §3 에러코드에서 제외) |
| 4 | 이모지 피커 | **경량** — 큐레이션된 후보 30~50개 그리드(신규 피커 라이브러리 금지) |
| 5 | 다이어그램 크기 상한 | **1MB** |
