# API 계약 — 네트워크 맵(Network Maps / 네트워크 아키텍처 작도)

> 대상: `moveseye-be-spring` (Spring Boot 3.3) · 패키지 `com.dmove.moveseye.networkmap`
> 기준: **실제 구현 코드가 진실**(NetworkArchitectureController + service + dto 5종 + NetworkDiagramValidator + domain 2종 + Flyway V7). 설계서(`devdesign_network-maps.md`, 2026-07-13 확정)는 방향성.
> 소비자: api-contract-sync · fe-engineer(`moveseyee_fe` — `services/networkMap.api.ts`·`types/networkMap.ts`·`hooks/useNetworkMap.ts` 신규 예정)

## 개정 이력
| 버전 | 날짜 | 변경 |
|---|---|---|
| v1 | 2026-07-13 | 최초 산출(1차 — CRUD + main 지정 + live 오버레이 7개 EP). diagram-as-document(jsonb), 낙관적 잠금, hostid 서버 재추출, 물리 삭제. |

---

## 0. 공통 응답 규약 (전 엔드포인트)

모든 응답은 `ApiResult<T>`로 래핑되며 **성공/실패 모두 HTTP 200**(단, 미인증 401만 실제 상태코드). 기존 FE 계약 보존 규칙이다.

### 성공 envelope
```jsonc
{ "status": "success", "code": 200, "data": <T>, "syncTime": "..." }
```
- `message`/`errorCode`는 성공 시 생략(NON_NULL 래퍼). `syncTime`은 전역 인터셉터 주입(문자열/null), `data`와 별개.

### 비즈니스 에러 envelope (HTTP 200)
```jsonc
{ "status": "error", "code": 400, "errorCode": "NETMAP_XXX", "message": "NETMAP_XXX" }
```
- 이 도메인은 **권한 거부(requireAdmin)가 없다** — 전 EP 인증 사용자면 통과. 따라서 `code:403`은 발생하지 않는다.
- **미인증**: JWT 필터/`@VisitorIdCheck` 단계에서 **HTTP 401** 선행(컨트롤러 코드 도달 전).
- **@NotBlank 검증 실패**(생성 시 name 누락): Spring validation → HTTP 200 + `code:400` + 검증 메시지(`errorCode` 없음).

### Pagination envelope (목록의 `data`)
```jsonc
{ "items": [ <item>... ], "total": <number> }   // limit/offset 필드 없음. 1차는 전체 조회라 total = items.length.
```

### 날짜 직렬화
- `createdAt`·`updatedAt`은 `@JsonFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")` → 예 `"2026-07-13T05:13:45.076Z"`.
- ⚠️ `@CreationTimestamp`/`@UpdateTimestamp`(JVM 기본존) 생성 → **서버가 UTC일 때만** `'Z'` 표기와 값 일치(전역 UTC 전제, CLAUDE.md #4).
- ⚠️ **낙관적 잠금 핵심**: 응답의 `updatedAt` 문자열을 그대로 보관했다가 PATCH의 `baseUpdatedAt`으로 돌려보낸다(문자열 동등 비교). 파싱/재포맷하지 말 것 — 원본 문자열 그대로 왕복해야 안전하다.

---

## 1. 공유 타입 (중첩 DTO)

### NetworkDiagram (`diagramJson` — 상세/수정에서 노출·입력)
React Flow(`@xyflow/react` v12) 직렬화 문서. 서버는 **구조를 강제하지 않고 freeform으로 보존**한다(position/data/style 등 React Flow가 붙이는 임의 필드 손실 없이 round-trip).
```ts
type TNetworkDiagram = {
  nodes: TNetworkNode[];      // 필수 배열(수정 시 null/누락 → NETMAP_INVALID_DIAGRAM)
  edges: TNetworkEdge[];      // 필수 배열(동일)
  viewport?: { x: number; y: number; zoom: number } | Record<string, unknown>;  // 자유 형태(서버 무검증)
};

// 서버가 관여하는 최소 규약만 명시. 그 외 필드(position, width, height, style, parentId 등)는 자유 — 서버가 보존만.
type TNetworkNode = {
  id: string;
  type: "host" | "shape" | "group";   // ★ 이 3종만 허용(그 외 → NETMAP_INVALID_DIAGRAM)
  data?: {
    hostid?: string;                   // ★ type="host"면 필수(data.hostid 또는 top-level hostid). 없으면 INVALID_DIAGRAM
    label?: string;
    nodeType?: "server" | "database" | "cloud" | "network" | "security" | "etc";  // shape 노드 유형(자산 device_type과 값 공유)
    emoji?: string;                    // shape 노드 이모지(옵션)
    [k: string]: unknown;
  };
  position?: { x: number; y: number };
  [k: string]: unknown;                // React Flow 기타 필드 자유
};

type TNetworkEdge = {
  id: string;
  source: string;                      // 소스 노드 id
  target: string;                      // 타깃 노드 id
  label?: string;
  data?: { sourcePort?: string; targetPort?: string; [k: string]: unknown };  // 포트 표기
  [k: string]: unknown;
};
```
- ⚠️ **host 노드 hostid 위치**: 서버는 `node.data.hostid`(React Flow 관례)를 우선 보고, 없으면 top-level `node.hostid`를 폴백으로 읽는다. **FE는 `data.hostid`에 넣는 것을 권장**(폴백은 하위호환용).
- ⚠️ **type 값 대소문자 정확 일치**(`host`/`shape`/`group` 소문자). 공백은 trim 후 판정.

### NetworkLiveItem (`GET .../live` 응답 원소)
```ts
type TNetworkLiveItem = {
  hostid: string;
  available: "available" | "unavailable" | "unknown";  // 인터페이스 available 종합(1→available, 2→unavailable, 그 외→unknown)
  openProblemCount: number;                            // 오픈(recent) Problem 개수
  worstSeverity: string | null;                        // Zabbix severity "0"~"5" 중 최댓값(문자열). 문제 없으면 null
};
```

---

## 2. 엔드포인트

공통 헤더: `Authorization: Bearer <token>`, `x-visitor-id`(@VisitorIdCheck). prefix `/network-architectures`.
권한: **전 EP = U**(인증 사용자). ⚠️ 변경성 EP(생성/수정/삭제/main)에도 **관리자 체크 없음**(설계 확정 예외 — 다이어그램은 문서 성격). 요청 사용자는 `createdBy`/`updatedBy`에 기록.
- ⚠️ **actor 기록 방식(2026-07-13 QA 수정)**: JWT payload에는 username 클레임이 없어(admin은 `{id, userRole}`만) 서버가 **JWT `id`로 User를 조회해 실제 username**을 `created_by`/`updated_by`에 저장한다. 조회 실패 시 null(→ FE "Updated By"는 "-"). FE는 응답의 `createdBy`/`updatedBy` 문자열을 그대로 표시만 하면 된다.

| # | Method | Path | 권한 | 응답 data |
|---|---|---|---|---|
| 1 | GET | `/network-architectures` | U | `{ items: TListItem[], total }` |
| 2 | POST | `/network-architectures` | U | `TDetail` |
| 3 | GET | `/network-architectures/{id}` | U | `TDetail` |
| 4 | PATCH | `/network-architectures/{id}` | U | `TDetail` |
| 5 | DELETE | `/network-architectures/{id}` | U | `null` |
| 6 | PATCH | `/network-architectures/{id}/main` | U | `TDetail` |
| 7 | GET | `/network-architectures/{id}/live` | U | `TNetworkLiveItem[]` |

---

### 1) GET `/network-architectures` — 목록 · U
쿼리 파라미터 **없음**(1차는 필터/페이지네이션 없이 전체 조회). 정렬은 서버 고정: **main 최상단 → 최근 수정순**(`is_main DESC, updated_at DESC`).

`data`: `{ items: TNetworkListItem[], total: number }`
```ts
type TNetworkListItem = {
  id: number;
  name: string;
  description: string | null;
  nodeCount: number;      // diagram.nodes 길이(host+shape+group 합산)
  edgeCount: number;      // diagram.edges 길이
  isMain: boolean;        // 목록 기본 진입 강조(최대 1개)
  updatedAt: string;      // ISO
  updatedBy: string | null;
};
```
- `diagramJson` 본문·`linkedHostids`·live는 목록에 **미포함**(부하 방지) — 상세/ live EP에서만.

---

### 2) POST `/network-architectures` — 생성 · U
Body (`CreateNetworkArchitectureReqDto`):
```ts
type TCreateNetworkArchitectureReq = {
  name: string;              // 필수(@NotBlank). trim 후 저장. 이름 중복 허용(유니크 미강제)
  description?: string | null;
};
```
- 빈 다이어그램(`{nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}}`) + `linkedHostids=[]` + `isMain=false`로 생성. `createdBy=updatedBy=요청 username`.
- `data`: `TNetworkDetail`.
- 에러: name blank → @NotBlank code 400(errorCode 없음).

---

### 3) GET `/network-architectures/{id}` — 상세 · U
Path `id`(int). `data`: `TNetworkDetail`
```ts
type TNetworkDetail = {
  id: number;
  name: string;
  description: string | null;
  diagramJson: TNetworkDiagram;   // 전체 문서(nodes/edges/viewport)
  linkedHostids: string[];        // 서버 재추출 캐시(host 노드 hostid, 중복 제거·등장순)
  nodeCount: number;
  edgeCount: number;
  isMain: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;              // ISO
  updatedAt: string;              // ISO ★ 낙관적 잠금 baseUpdatedAt 원천
};
```
- 에러: 없는 id → `NETMAP_NOT_FOUND`.

---

### 4) PATCH `/network-architectures/{id}` — 수정 · U
Path `id`(int). Body (`UpdateNetworkArchitectureReqDto`, 전부 옵셔널 — null=미변경):
```ts
type TUpdateNetworkArchitectureReq = {
  name?: string | null;               // null=미변경
  description?: string | null;        // null=미변경(빈 문자열 ""로 비우기 가능)
  diagramJson?: TNetworkDiagram | null;  // 실리면 검증+교체. null/미포함=다이어그램·linkedHostids 보존
  baseUpdatedAt?: string | null;      // 낙관적 잠금 기준(직전 조회 updatedAt 문자열). null=검사 생략
};
```
**동작 순서**(서비스):
1. **낙관적 잠금**: `baseUpdatedAt`이 있고(non-blank) 서버 현재 `updatedAt`(동일 ISO 포맷)과 **문자열 불일치** → `NETMAP_CONFLICT`. null이면 검사 생략.
2. `name`/`description` 부분 반영.
3. `diagramJson`이 실리면: **크기 검증**(직렬화 > 1MB → `NETMAP_TOO_LARGE`) → **구조 검증**(nodes/edges 배열 존재, node.type ∈ {host,shape,group}, host 노드 hostid 필수 → 위반 시 `NETMAP_INVALID_DIAGRAM`) → 교체. **`linkedHostids`는 클라이언트 값 무시하고 서버가 diagram에서 재추출**(host 노드 hostid, 중복 제거).
4. `updatedBy=요청 username`, `updatedAt` 자동 갱신(@UpdateTimestamp).
- `data`: `TNetworkDetail`(갱신 후).
- 에러: `NETMAP_NOT_FOUND` · `NETMAP_CONFLICT` · `NETMAP_TOO_LARGE` · `NETMAP_INVALID_DIAGRAM`.
- ⚠️ 검증 순서상 **크기 초과가 구조 오류보다 먼저** 잡힌다(둘 다 위반 시 TOO_LARGE).

---

### 5) DELETE `/network-architectures/{id}` — 삭제 · U
Path `id`(int). **물리 삭제**(soft delete 아님). Body 없음.
- `data`: `null`(성공 envelope의 `data: null`).
- 에러: 없는 id → `NETMAP_NOT_FOUND`.

---

### 6) PATCH `/network-architectures/{id}/main` — main 지정 · U
Path `id`(int). Body 없음.
- 트랜잭션 내에서 **기존 main 전부 해제**(is_main=false) 후 대상 지정(부분 유니크 위반 방지 순서). 결과적으로 main은 항상 최대 1개.
- `updatedBy=요청 username`. `data`: `TNetworkDetail`(isMain=true).
- 에러: 없는 id → `NETMAP_NOT_FOUND`.
- 참고: **main 해제 전용 EP는 없다**(1차). 다른 아키텍처를 main으로 지정하면 이전 main이 자동 해제된다.

---

### 7) GET `/network-architectures/{id}/live` — 상태 오버레이 · U
Path `id`(int). `data`: `TNetworkLiveItem[]`
- `linkedHostids` 기반으로 각 host의 가용성 + 오픈 Problem 수 + worstSeverity를 조립.
- **호스트 0개(linkedHostids 빈 배열)면 `[]`**(Zabbix 미호출).
- Zabbix 호출은 **트랜잭션 밖**(외부 HTTP 왕복 동안 DB 커넥션 미점유 — asset getDetail 선례).
- **Zabbix 실패 시 에러 대신 안전한 폴백**: 해당 호스트를 `available:"unknown", openProblemCount:0, worstSeverity:null`로 채워 배열을 항상 반환(화면 마비 방지).
- ⚠️ 중복 배치된 같은 hostid는 live 배열에 **1건**만(hostid distinct). FE가 hostid로 캔버스의 모든 동일 노드에 일괄 매핑한다.
- 에러: 없는 id → `NETMAP_NOT_FOUND`.

---

## 3. 에러코드 요약 (전부 ApiError → HTTP 200 + code 400 + errorCode=문자열)

| errorCode | 발생 |
|---|---|
| `NETMAP_NOT_FOUND` | 존재하지 않는 id (3·4·5·6·7) |
| `NETMAP_CONFLICT` | PATCH의 baseUpdatedAt ≠ 서버 updatedAt (동시 편집 충돌) (4) |
| `NETMAP_INVALID_DIAGRAM` | diagram 구조 위반: nodes/edges 배열 누락, node.type ∉ {host,shape,group}, host 노드 hostid 없음 (4) |
| `NETMAP_TOO_LARGE` | diagramJson 직렬화 크기 > 1MB (4) |
| (검증) | 생성 시 name blank → @NotBlank **code 400 + errorCode 없음**(ApiError 아님) (2) |

- ⚠️ **`NETMAP_DUPLICATE_NAME`은 존재하지 않는다**(이름 유니크 미강제 확정 — 설계 §8-3). 중복 이름 생성/수정 모두 성공.
- ⚠️ 이 도메인은 **권한 거부(403) 없음** — 전 EP 인증 사용자 통과.

---

## 4. FE 반영 메모 & footgun

### footgun (반드시 인지)
1. **낙관적 잠금 = 문자열 왕복**: 상세/수정 응답의 `updatedAt`(ISO 문자열)을 **파싱하지 말고 원본 그대로** 보관했다가 다음 PATCH의 `baseUpdatedAt`으로 되돌린다. 서버는 자신의 `updatedAt`을 동일 포맷으로 만들어 **문자열 동등 비교**한다 — 밀리초/타임존을 건드리면 오탐 conflict가 난다. `baseUpdatedAt`을 아예 안 보내면(null) 잠금 검사가 생략되므로, 에디터 저장에서는 **항상 동봉**해야 동시 편집 보호가 걸린다.
   - ✅ **연속 저장 안전(2026-07-13 QA 수정)**: PATCH/main 응답의 `updatedAt`은 서버가 **즉시 flush 후 반환한 최신 DB 값**이라, 저장 성공 직후 그 값을 그대로 다음 `baseUpdatedAt`으로 재사용하면 **false conflict 없이 연속 저장**된다(이전엔 응답 updatedAt이 stale이라 두 번째 저장마다 NETMAP_CONFLICT가 났음 — 수정됨).
2. **`linkedHostids`는 서버 파생(읽기 전용)**: PATCH 바디에 linkedHostids를 넣어도 **무시**된다. 서버가 diagram의 host 노드에서 재추출(중복 제거·등장순)해 저장한다. FE는 응답의 linkedHostids를 신뢰만 하면 된다.
3. **host 노드 hostid는 `data.hostid`에**: React Flow 커스텀 노드 데이터는 `node.data`에 담기므로 hostid를 `node.data.hostid`에 넣는다(서버 우선 조회 위치). top-level `node.hostid`도 폴백 인식하지만 권장 아님.
4. **diagram 검증 = 부분적**: 서버는 node.type(3종)·host hostid·배열 존재·크기(1MB)만 본다. **position/edge source·target 유효성/그룹 parent 관계 등은 검증하지 않는다**(freeform 보존). 캔버스 정합성은 FE(React Flow) 책임.
5. **크기 우선 판정**: diagram이 1MB 초과이면서 구조도 잘못됐으면 `NETMAP_TOO_LARGE`가 먼저 난다(구조 에러가 가려질 수 있음).
6. **main 토글**: 별도 "main 해제" EP가 없다. 다른 아키텍처를 main 지정하면 이전 것이 자동 해제. 현재 main을 끄고 싶으면(전부 해제) 1차는 방법이 없다(2차 후보).
7. **DELETE는 물리 삭제**: 복원 불가. FE 확인 모달 필수(설계 §2).
8. **목록엔 페이지네이션/필터 파라미터 없음**: 1차는 전체 조회. `{items,total}` 형태만 유지(total = items.length).

### 소비 규약
- 성공 소비는 `useDmoveQuery` 언랩 2겹 후 `data` 직접 수신 — 목록은 `{items,total}`, 상세/생성/수정/main은 `TNetworkDetail`, live는 `TNetworkLiveItem[]`, 삭제는 `null`.
- 쿼리키는 자산·레거시와 분리된 신규 네임스페이스(`NETMAP_QUERY_KEY`) 사용(설계 §4.3, 2026-07-13 쿼리키 분리 교훈).
- live는 에디터 진입 시 1회 + 수동 [상태 새로고침](1차 폴링 없음). 실패해도 배열이 오므로(폴백) optional 처리보다 배열 순회로 안전.
- 변경성 EP(생성/수정/삭제/main)는 **모든 인증 사용자**가 호출 가능 — 관리자 뱃지/가드 불필요(자산과 다른 점).
