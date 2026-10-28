# API 계약서 — 디스커버리 (네트워크 + LLD)

> **산출 기준**: BE 커밋 `ab7c84c`(2026-08-13, ZM-93) 소스 역산 + 설계서 `devdesign_discovery.md` v2.
> 계약서가 BE 단계에서 산출되지 않아 **2026-08-18에 코드에서 역산**했다. Swagger(`/v3/api-docs`)와
> 어긋나면 **소스가 정본**이다.
>
> 선례 계약: `features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md` · `features/zabbix-config/trigger-mgmt/contract_trigger-mgmt.md` (같은 규약을 따른다)

---

## 0. 공통 규약

| 항목 | 값 |
|---|---|
| baseURL | `/api/v1` (FE `axiosInstance`가 접두 처리 — 서비스 코드에는 `zabbix-manage/...`만 적는다) |
| 인증 | HttpOnly 쿠키(`accessToken`) + `x-visitor-id` 헤더 — 공통 인스턴스가 주입 |
| 권한 | **전 EP 관리자 전용**(`AdminAccessChecker.requireAdmin` — userRole이 ADMIN ∪ SUPER_ADMIN) |
| 권한 거부 | **HTTP 200** + body `code: 403` (원본 계약 보존 — 상태코드로 나오지 않는다) |
| 업무 에러 | **HTTP 200** + body `code: "<ERROR_CODE>"` |
| 응답 봉투 | `ApiResult<T>` → axios 인터셉터가 1겹, `useDmoveQuery`가 2겹째 언랩 → **훅의 `data`는 payload 직접 수신** |
| 목록 봉투 | `PagedListDto<T>` = `{ items, total, limit, offset }` |
| 로컬 저장 | **없음**. Zabbix가 정본 · **Flyway 0건** |

**2026-08-18 쓰기 추가됨.** 조회 8 + 쓰기 8 = 총 16 EP. 쓰기는 §3(네트워크)·§4(LLD) 참조.
(이 문서의 첫 판은 조회만 있던 시점에 쓰였다 — "조회 전용" 서술은 모두 걷어냈다.)

🔴 **쓰기의 두 함정** — 둘 다 "안 보낸 것이 지워지는" 종류다:
1. **네트워크의 `checks`는 전체 교체다.** `drule.update`가 dchecks를 통째로 갈아치우므로
   일부만 보내면 나머지 검사가 사라진다. 유지할 검사는 `dcheckid`와 함께 반드시 함께 싣는다.
2. **LLD의 배열 필드는 생략=유지, 빈 값=삭제다.** 폼이 `overrides`를 다루지 않으면서 빈 배열을
   보내면 사용자가 만든 오버라이드가 조용히 사라진다.

---

## 1. LLD 규칙 — `/zabbix-manage/discovery-rules`

화면: 호스트/템플릿 상세 > `디스커버리` 탭 (`DiscoveryManagementTab`).

### 1-1. GET `/zabbix-manage/discovery-rules` — 목록

**쿼리 파라미터**

| 이름 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `hostid` | string | ▲ | `templateid`와 **동시 지정 시 우선** |
| `templateid` | string | ▲ | |
| `search` | string | | 규칙명 부분검색. blank=무시 |
| `status` | number | | 0=활성, 1=비활성. null=전체 |
| `limit` | number | | 기본 20, **1~200 클램프** |
| `offset` | number | | 기본 0 |

🔴 **`hostid` 또는 `templateid` 중 하나는 반드시** 보내야 한다. 둘 다 없으면
`code: "LLD_TARGET_REQUIRED"`. 실측 LLD 규칙이 **1,721건**이라 전체 조회를 열지 않았다.

**응답** `PagedListDto<ManagedLldRule>`

```ts
{
  itemid: string;            // LLD 규칙 ID (Zabbix에서 LLD 규칙은 아이템 계열 → itemid)
  name: string;
  key: string;               // ⚠️ Zabbix 원본은 key_ 이지만 응답 필드명은 key
  type: number | null;       // 0=Zabbix agent, 2=trapper, 18=dependent …
  delay: string;             // "1h"
  status: number | null;     // 0=활성, 1=비활성
  state: number | null;      // 0=정상, 1=수집 실패
  error: string;             // 정상이면 빈 문자열
  createdItemCount: number | null;
  inherited: boolean;        // 템플릿 상속본 → 수정 불가
  sourceTemplateId: string | null;
}
```

🔴 **`createdItemCount`는 템플릿 스코프에서 `null`이다.** 템플릿 규칙의 생성물은 상속받은
호스트들에 흩어져 있어 한 숫자로 말할 수 없다. **0으로 표시하면 "아무것도 안 만든다"는 거짓말이 된다** —
FE는 `null`을 `-` 또는 "호스트별"로 렌더하고 **`?? 0`으로 채우지 말 것.**

ℹ️ `total`은 **필터 적용 후 전체 건수**이고 페이징은 BE가 메모리에서 자른다(Zabbix가 offset을 안 준다).

### 1-2. GET `/zabbix-manage/discovery-rules/{itemid}` — 상세

**응답** `ManagedLldRuleDetail`

```ts
{
  itemid: string; hostid: string; name: string; key: string;
  type: number | null; delay: string;
  status: number | null; state: number | null; error: string;
  description: string;
  lifetime: string;                 // "7d" — 사라진 리소스 삭제까지
  lifetimeType: number | null;      // 0=기간 후 삭제, 1=삭제 안 함, 2=즉시
  enabledLifetime: string;          // 사라진 리소스 비활성까지
  enabledLifetimeType: number | null; // 0=기간 후 비활성, 1=비활성 안 함, 2=즉시
  filter: Record<string, unknown> | null;   // {evaltype, formula, eval_formula, conditions[]}
  lldMacroPaths: Record<string, unknown>[]; // [{lld_macro, path}]
  overrides: Record<string, unknown>[];
  preprocessing: Record<string, unknown>[];
  inherited: boolean; sourceTemplateId: string | null;
  raw: Record<string, unknown>;     // Zabbix 원본 응답 전체
}
```

⚠️ **`raw`는 수정 왕복용이다.** 폼이 다루지 않는 필드를 되돌려 보낼 때 쓴다 — 다만 §4-2의
"생략=유지" 규칙 덕에 **대개는 그냥 생략하는 편이 안전하다**(raw를 통째로 되보내면 읽기 전용
필드까지 실려 Zabbix가 거부할 수 있다).
`lifetime` 4필드는 **함께 움직인다** — 기간 하나로 표현되지 않으니 한 칸에 합쳐 쓰지 말 것.

**에러**: 없는 ID → `code: "LLD_RULE_NOT_FOUND"`

### 1-3. GET `/zabbix-manage/discovery-rules/{itemid}/prototypes` — 프로토타입 4종

**응답** `LldPrototype[]` (배열 직접 — 페이징 없음)

```ts
{
  kind: "ITEM" | "TRIGGER" | "GRAPH" | "HOST";
  id: string;                 // 종류별 ID(itemid/triggerid/graphid/hostid)를 정규화
  name: string;               // 트리거는 description
  summary: string | null;     // 아이템=key_, 트리거=expression, 호스트=host, 그래프=null
  status: number | null;      // 0=활성, 1=비활성. 그래프 프로토타입엔 없어 null
  discover: number | null;    // 0=발견 시 생성, 1=생성 안 함
}
```

ℹ️ 넷을 **한 배열**로 주는 것은 의도다. 종류별로 쪼개면 FE가 테이블을 넷 만들어야 한다 —
`kind`로 그룹핑해 한 테이블에 렌더한다.

### 1-4. GET `/zabbix-manage/discovery-rules/{itemid}/discovered` — 실제 생성 아이템

| 쿼리 | 기본 | 비고 |
|---|---|---|
| `limit` | 50 | 1~200 클램프 |
| `offset` | 0 | |

**응답** `PagedListDto<Zabbix item raw>` — 원본 맵이 그대로 온다(정규화 없음):

```ts
{ itemid: string; name: string; key_: string; status: string; state: string;
  discoveryRule: { itemid: string } }
```

⚠️ **여기만 `key_`(언더스코어)다.** 1-1/1-2는 `key`로 정규화되지만 이 EP는 Zabbix 원본을
그대로 싣는다. 숫자 필드도 **문자열**("0")로 온다.

**에러**: `LLD_RULE_NOT_FOUND`

---

## 2. 네트워크 디스커버리 — `/zabbix-manage/network-discovery`

화면: Zabbix 관리 > **네트워크 디스커버리**(신규 최상위 메뉴).

### 2-1. GET `/rules` — 목록

| 쿼리 | 기본 | 비고 |
|---|---|---|
| `limit` | 20 | 1~200 클램프 |
| `offset` | 0 | |

**응답** `PagedListDto<NetworkDiscoveryRule>`

```ts
{
  druleid: string;
  name: string;
  proxyid: string;             // "0"=서버가 직접 스캔, 그 외=프록시 ID
  iprange: string;             // 원문 ("192.168.0.1-254", "10.0.0.0/16")
  ipCount: number | null;      // BE가 파싱해 계산한 스캔 대상 수. 파싱 실패 시 null
  delay: string;
  concurrencyMax: number | null; // 0=무제한, 1=하나씩, 그 외=동시 실행 수
  status: number | null;       // 0=활성, 1=비활성
  error: string;               // 규칙 실행 오류. 정상이면 빈 문자열
  checkTypes: string[];        // ["Zabbix agent", "ICMP ping"] — dcheck.type 표시명, 중복 제거
  linkedActionCount: number;   // 이 규칙(조건 18) 또는 그 검사(조건 8)에 걸린 액션 수
  globalActionCount: number;   // 범위 조건이 없어 모든 규칙에 적용되는 액션 수
  hostCreatingCount: number;   // 위 액션 중 호스트를 생성하는 것(operationtype 2·4·6)
  checks?: NetworkDiscoveryCheck[] | null;  // 🔴 상세(§2-2)에서만 채워진다. 목록에서는 null
}
```

🔴 **`ipCount`가 null이면 "0"이 아니라 "계산 불가"다.** 추측해 채우지 말고 `-`로 표시한다.

🔴 **액션 수는 세 값을 함께 보여줘야 뜻이 통한다.**
`linkedActionCount`만 0으로 보이면 사용자는 "액션이 없다"고 읽지만, `globalActionCount`가
1 이상이면 **전역 액션이 이 규칙에도 적용된다**. 반대로 둘 다 있어도 `hostCreatingCount`가 0이면
**호스트는 안 생긴다** — 이 화면의 존재 이유가 "규칙 만들었는데 호스트가 안 생긴다"를 막는 것이다.

⚠️ **액션 조회가 실패하면 세 카운트가 모두 0으로 온다**(BE가 목록을 살리려고 액션 실패를 삼킨다).
0을 "액션 없음"이라고 단정적으로 쓰지 말 것.

### 2-2. GET `/rules/{druleid}` — 상세

응답은 목록 행과 **동일한 `NetworkDiscoveryRule`**(별도 상세 DTO 없음). 단 하나가 다르다 —
**`checks`가 여기서만 채워진다**:

```ts
{
  dcheckid: string;   // 🔴 수정 시 이 값을 되돌려 보내야 같은 검사로 이어진다
  type: number | null; key: string | null; ports: string | null;
  uniq: boolean;
  hostSource: number | null;  // 1=DNS, 2=IP, 3=수집값
  nameSource: number | null;  // 0=호스트명과 동일, 1=DNS, 2=IP, 3=수집값
  allowRedirect: boolean | null;
  snmpCommunity: string | null;
  snmpv3Contextname: string | null; snmpv3Securityname: string | null;
  snmpv3Securitylevel: number | null; snmpv3Authprotocol: number | null;
  snmpv3Privprotocol: number | null;
}
```

🔴 **`checks`는 목록(§2-1)에서 `null`이다.** 규칙 수만큼 검사 배열이 딸려 나가는 것을 막기 위해서다 —
수정 폼은 목록 행이 아니라 **상세를 다시 불러** 검사를 채워야 한다.

🔴 **SNMPv3 암호(`snmpv3_authpassphrase`·`snmpv3_privpassphrase`)는 응답에 없다.** 조회로 비밀값을
흘리지 않는다는 원칙이며, 그 대가로 **SNMPv3 검사가 있는 규칙을 수정할 때는 암호를 다시 입력해야
한다**(dchecks가 전체 교체라 빈 값이 그대로 저장된다) — 화면이 그 사실을 알려야 한다.

**에러**: `DISCOVERY_RULE_NOT_FOUND`

### 2-3. GET `/rules/{druleid}/discovered` — 발견된 장비

**응답** `Zabbix dhost raw[]` (배열 직접, 페이징 없음)

```ts
{ dhostid: string; druleid: string; status: string; lastup: string; lastdown: string;
  dservices: { dserviceid, dcheckid, type, key_, value, port, status, ip, dns, ... }[] }
```

🔴 **여기 목록에 있다고 호스트로 등록된 것이 아니다.** 발견 ≠ 등록이고, 등록은 액션이 한다.
화면 문구가 이걸 흐리면 안 된다.

⚠️ `status`/`lastup`/`lastdown`은 **문자열 epoch 초**다. `0`이면 "없음"(변환하면 1970년이 뜬다).

**에러**: `DISCOVERY_RULE_NOT_FOUND`

### 2-4. GET `/rules/{druleid}/actions` — 연결된 액션 (읽기 전용)

**응답** `Zabbix action raw[]` (배열 직접)

```ts
{ actionid: string; name: string; status: string; eventsource: string;
  filter: { evaltype, formula, conditions: [{conditiontype, operator, value, formulaid}] };
  operations: [{operationtype, ...}] }
```

연결 판정은 BE가 한다(FE 재계산 금지):

```
conditiontype 18 (디스커버리 규칙)  value == druleid            → 연결
conditiontype 19 (디스커버리 검사)  value ∈ 이 규칙의 dcheckid   → 연결
18·19 조건이 전혀 없음                                         → 전역(모든 규칙에 적용)
```

🔴 **2026-08-18 정정** — 처음엔 검사를 `8`로 판정했는데 **8은 "발견된 서비스 종류"**이고 검사는
`19`다. "Zabbix agent"가 서비스 종류·검사 종류 양쪽에서 9이고 실측 규칙의 `dcheckid`까지 9여서
값만 보고는 구분되지 않았다(Zabbix UI 확인으로 확정). 그 결과 **전역 액션이 특정 규칙에 걸린 것처럼**
표시되고 있었고, 테스트도 그 잘못된 전제를 함께 고정하고 있었다.

⚠️ 범위를 좁히는 조건은 **18·19 둘뿐**이다. 상태(10)·수신값(12)·서비스 종류(8)·IP(7) 등은
"어떤 장비에 반응할지"를 정할 뿐 어느 규칙인지는 좁히지 않는다 → 그것만 가진 액션은 전역이다.

**에러**: `DISCOVERY_RULE_NOT_FOUND`

---

### 2-5. GET `/rules/{druleid}/actions/all` — 디스커버리 액션 전부 + 이 규칙과의 관계 (2026-08-18)

규칙 폼 **액션 탭**의 체크박스용. 2-4가 "이 규칙에 걸린 것"만이면, 이건 eventsource=1 액션 **전부**에
관계 표식을 붙인다.

**응답** `Zabbix action raw[]` + `_linkage`

```ts
{ ...2-4와 동일 필드, _linkage: "EXPLICIT" | "GLOBAL" | "NONE" }
// EXPLICIT: 조건 18(=druleid) 또는 19(∈ dcheckid)로 이 규칙에 명시 연결 → 체크됨
// GLOBAL  : 18·19 조건 없음 → 모든 규칙에 적용, 체크박스 없이 표시만(해제 불가)
// NONE    : 다른 규칙에만 걸림 → 체크해서 연결 가능
```

**에러**: `DISCOVERY_RULE_NOT_FOUND`

### 2-6. PUT `/rules/{druleid}/actions` — 이 규칙에 연결할 액션 집합 (2026-08-18)

**요청** `{ actionIds: string[] }` — 체크된 것 **전체**(집합 교체). 빈 배열 = 명시 연결 전부 해제.

동작(액션별로 필요한 것만 `action.update` filter round-trip):
- 목록에 있고 미연결 → 조건 `{conditiontype:18, operator:0, value:druleid}` 추가
- 목록에 없고 연결됨 → 이 규칙의 18 조건만 제거(다른 규칙 18·19는 보존)
- GLOBAL 액션은 **손대지 않는다**(해제 개념이 없다)
- 이미 원하는 상태면 호출 없음

🔴 **`ACTION_UNLINK_MAKES_GLOBAL: {액션명}`** — 이 규칙 18이 유일한 범위 조건이면 해제 시 전역(모든 규칙)
액션이 되므로 **거부**한다. FE는 "삭제/비활성화하세요"로 안내(알림 관리 링크). `errorCode`·`message` 둘 다
`ACTION_UNLINK_MAKES_GLOBAL: 이름` 형태.

🔴 filter round-trip 시 `ActionFilterNormalizer`가 `conditionid`·`actionid`·`value2`(26 외)·`eval_formula`·
`formulaid`(evaltype≠3)를 벗긴다 — get 응답 그대로 되돌리면 -32602 "unexpected parameter value2"(실측).
알림 관리 액션 생성/수정(`/zabbix-manage/actions`)도 같은 정규화를 거친다.

**응답** 2-4와 동일(이 규칙에 연결된 액션 목록). **에러**: `DISCOVERY_RULE_NOT_FOUND` · `ACTION_UNLINK_MAKES_GLOBAL`

### 2-7. POST `/rules/{druleid}/actions/quick` — 표준 액션 빠른 생성 (2026-08-18)

**요청** `{ name: string; groupIds?: string[]; templateIds?: string[]; inventoryAuto?: boolean=true; enabled?: boolean=true }`

만드는 액션(실측 'Gabe_s VMs Linux discovery'와 같은 모양):
- 조건: `18=druleid` + `10=0`(디스커버리 상태 Up), evaltype 0
- 오퍼레이션: `2`(호스트 추가) + `4`(그룹, groupIds 있을 때만) + `6`(템플릿, templateIds 있을 때만) + `10`(인벤토리 자동, inventoryAuto)
- 빈 opgroup/optemplate은 Zabbix가 거부하므로 **비어 있으면 그 오퍼레이션 자체를 뺀다**

**응답** 2-4와 동일(새 액션은 EXPLICIT로 포함). **에러**: `DISCOVERY_RULE_NOT_FOUND` · `ACTION_CREATE_FAILED`

---

## 3. 네트워크 디스커버리 쓰기 — `/zabbix-manage/network-discovery`

### 3-1. POST `/rules` — 생성

```ts
{
  name: string;            // 필수
  iprange: string;         // 필수. 쉼표·개행으로 여러 대역
  proxyid?: string;        // null·"0"=서버가 직접 스캔
  delay?: string;
  concurrencyMax?: number; // 0=무제한, 1=하나씩
  status?: number;         // 기본 0(활성)
  checks: DiscoveryCheck[];  // 필수, 최소 1개
}
```

`DiscoveryCheck` — 🔴 **고유성 기준·호스트명 출처·표시명 출처는 규칙이 아니라 여기 붙는다**
(7.0.27 실측: `uniq`/`host_source`/`name_source`가 dcheck 필드다). 규칙 레벨로 착각하면
폼이 값을 실을 곳을 잃는다.

```ts
{
  dcheckid?: string;   // 수정 시 기존 검사를 잇는 열쇠(없으면 새 검사로 생성)
  type: number;        // 필수. 9=Zabbix agent, 12=ICMP ping, 10/11/13=SNMP …
  key?: string;        // agent·SNMP 검사에서 필수 (BE가 key_ 로 번역)
  ports?: string;
  uniq?: boolean;      // 🔴 규칙 전체에서 하나만 true (BE가 1/0으로 번역)
  hostSource?: number; // 1=DNS, 2=IP, 3=이 검사의 수집값
  nameSource?: number; // 0=호스트명과 동일, 1=DNS, 2=IP, 3=수집값
  allowRedirect?: boolean;
  snmpCommunity?: string;
  snmpv3Contextname?: string; snmpv3Securityname?: string;
  snmpv3Securitylevel?: number; snmpv3Authprotocol?: number; snmpv3Authpassphrase?: string;
  snmpv3Privprotocol?: number; snmpv3Privpassphrase?: string;
}
```

**응답**: 생성 직후 재조회한 `NetworkDiscoveryRule`(§2-1과 동일 shape).

**에러**: `DISCOVERY_CHECKS_REQUIRED`(검사 0개) · `DISCOVERY_UNIQ_CONFLICT`(uniq 2개 이상) ·
`DISCOVERY_RULE_CREATE_FAILED`

⚠️ **규칙을 만들어도 호스트는 생기지 않는다** — 등록은 디스커버리 액션이 한다. 생성 직후 화면은
액션 연결 여부(§2-1의 세 카운트)를 함께 보여줘야 한다.

### 3-2. PUT `/rules/{druleid}` — 수정(부분)

필드는 3-1과 같고 전부 선택이다. null 필드는 건드리지 않는다.

🔴 **`checks`만은 예외 — 보내면 전체 교체다.** Zabbix `drule.update`가 dchecks를 통째로
갈아치우므로 하나만 고치려 해도 **나머지를 함께 보내지 않으면 사라진다**(호스트 태그와 같은 함정).
- 검사를 **건드리지 않으려면 필드를 생략**한다.
- 유지할 검사는 **`dcheckid`를 실어** 보낸다(없으면 지우고 새로 만든다).
- 빈 배열은 거부한다(`DISCOVERY_CHECKS_REQUIRED`) — 검사 없는 규칙은 존재할 수 없다.

**에러**: `DISCOVERY_RULE_NOT_FOUND` · `DISCOVERY_CHECKS_REQUIRED` · `DISCOVERY_UNIQ_CONFLICT`

### 3-3. PATCH `/rules/{druleid}/status` — 활성/비활성

요청 `{ enabled: boolean }` → 응답 `{ id: string, status: string }`(`"0"`=활성, `"1"`=비활성).

ℹ️ status만 담은 update라 **검사를 건드리지 않는다** — 토글에 폼 전체를 태우지 말 것.

### 3-4. DELETE `/rules` — 삭제(단건/다건)

요청 `{ druleIds: string[] }` → 응답 `{ ids: string[], count: number }`.

⚠️ **이미 등록된 호스트는 남는다.** 사라지는 것은 규칙과 발견 기록(dhost·dservice)이다 —
확인 문구가 이 둘을 섞으면 사용자가 "호스트가 지워진다"고 읽는다.

**에러**: `DISCOVERY_RULE_IDS_REQUIRED`

---

## 4. LLD 쓰기 — `/zabbix-manage/discovery-rules`

### 4-1. POST — 생성

```ts
{
  hostId: string;   // 필수. 호스트·템플릿 어느 쪽이든(Zabbix가 둘 다 hostid로 받는다)
  name: string;     // 필수
  key: string;      // 필수 (BE가 key_ 로 번역)
  type: number;     // 필수. 0=agent, 2=trapper, 7=agent active, 18=dependent …
  delay?: string;         // trapper·dependent에는 쓰지 않는다
  interfaceId?: string;   // agent·SNMP 등에서 필요
  masterItemId?: string;  // dependent(18)에서 필수
  status?: number; description?: string;
  lifetime?: string; lifetimeType?: number;
  enabledLifetime?: string; enabledLifetimeType?: number;
  filter?: object; lldMacroPaths?: object[]; overrides?: object[]; preprocessing?: object[];
  extra?: Record<string, unknown>;  // 수집 방식별 필드를 Zabbix 필드명 그대로
}
```

🔴 **`lifetime` 4필드는 함께 움직인다.** 기간(`lifetime`·`enabledLifetime`)은 각 type이
**0(기간 경과 후)일 때만** 유효하다 — 다른 type과 함께 보내면 Zabbix가 거부하므로
BE가 그때는 기간을 빼고 보낸다. 폼도 type이 0이 아닐 때 기간 입력을 비활성화할 것.

ℹ️ **`extra`는 아이템 계열 전 필드를 펼치지 않기 위한 통로다**(`url`·`posts`·`authtype`·
`snmp_oid` …). 이름 붙인 필드와 겹치면 **이름 붙인 쪽이 이긴다**.

**응답**: 생성 직후 재조회한 `ManagedLldRuleDetail`(§1-2와 동일).
**에러**: `LLD_RULE_CREATE_FAILED`

### 4-2. PUT `/{itemid}` — 수정(부분)

🔴 **배열/객체 필드는 생략=유지, 빈 값=삭제다.**
`filter`·`lldMacroPaths`·`overrides`·`preprocessing` 넷이 해당한다. 폼이 다루지 않는 필드는
**아예 보내지 않는다** — 편의로 빈 배열을 채우면 사용자가 만든 오버라이드가 조용히 사라진다.

⚠️ `description`은 클리어 가능 필드다 — 빈 문자열을 보내면 지워진다(생략은 유지).

**에러**: `LLD_RULE_NOT_FOUND` · **`LLD_RULE_INHERITED`**(템플릿 상속본은 호스트에서 수정 불가 —
화면은 이 코드를 보고 "정의처 템플릿에서 고치라"고 안내한다)

### 4-3. PATCH `/{itemid}/status` — 활성/비활성

요청 `{ enabled: boolean }` → 응답 `{ id, status }`.

⚠️ **상속본도 토글은 허용한다** — 호스트 쪽에서 끄는 것이 Zabbix 동작이라 막지 않는다.
수정(4-2)·삭제(4-4)만 상속본을 거부한다.

### 4-4. DELETE — 삭제(단건/다건)

요청 `{ itemIds: string[] }` → 응답 `{ ids, count }`.

🔴 **규칙을 지우면 그 규칙이 만든 아이템·트리거·그래프·호스트가 함께 사라진다.**
삭제 확인 화면은 반드시 `createdItemCount`를 함께 보여줄 것 — 규칙 하나가 아이템 수백 개를
데려가는 일이 흔하다.

⚠️ **상속본이 하나라도 섞이면 전체를 거부한다**(부분 삭제하지 않는다 — 무엇이 지워졌는지
알 수 없게 되기 때문).

**에러**: `LLD_RULE_IDS_REQUIRED` · `LLD_RULE_NOT_FOUND` · `LLD_RULE_INHERITED`

---

## 6. LLD 프로토타입 쓰기 — `/zabbix-manage/discovery-rules/{ruleid}/prototypes` (2026-08-19)

조회(§1-3 4종 한 배열)는 그대로. 쓰기는 종류별 경로(복수) — `items` · `triggers` · `graphs` · `hosts` ↔ Zabbix `{item|trigger|graph|host}prototype.*`.
전 EP 관리자 전용. 응답은 `LldPrototypeDto`(§1-3 행과 같은 모양). 실서버 4종 roundtrip + UI E2E 통과.

| EP | 요청 | 비고 |
|---|---|---|
| `GET /{kind}/{id}` | — | Zabbix get 원본(select* 포함) — 편집 프리필. kind 단수/복수 다 받음 |
| `POST /items` · `PUT /items/{id}` | `{name,key,type,valueType,delay,units,description,interfaceId,masterItemId,status,discover}` | 🔴 **key에 `{#MACRO}` 없으면 `LLD_PROTOTYPE_MACRO_REQUIRED: 값`** — Zabbix는 만들어 주지만 발견마다 같은 키라 1개만 생긴다. BE가 ruleid·hostid 주입, 호스트 규칙이면 main agent 인터페이스 자동(템플릿 규칙은 안 붙임) |
| `POST /triggers` · `PUT /triggers/{id}` | `{description,expression,priority,recoveryMode,recoveryExpression,manualClose,comments,opdata,url,status,discover}` | 표현식 오류 → `TRIGGER_EXPRESSION_INVALID: 원문`(트리거 관리와 같은 코드). expression의 호스트는 **기술명** |
| `POST /graphs` · `PUT /graphs/{id}` | `{name,width,height,graphtype,discover,gitems:[{itemid,color,drawtype?,yaxisside?,sortorder?,calc_fnc?,type?}],extra?}` | gitems 0개 → `LLD_PROTOTYPE_GRAPH_ITEMS_REQUIRED`. 🔴 get의 `gitemid/graphid`는 BE가 벗긴다(round-trip 안전, 실측). 보내면 전체 교체 |
| `POST /hosts` · `PUT /hosts/{id}` | `{host,name,groupIds,groupPrototypes,templateIds,status,discover,inventoryMode,tags?,macros?,extra?}` | host에 `{#MACRO}` 필수 · groupIds 0개 → `LLD_PROTOTYPE_HOST_GROUP_REQUIRED`. BE가 groupLinks/groupPrototypes/templates 객체 배열로 변환. 배열은 전체 교체 |
| `DELETE /{kind}` `{ids}` | | 🔴 이 규칙의 것이 아닌 ID가 섞이면 전부 `LLD_PROTOTYPE_NOT_FOUND` |

에러: `LLD_RULE_NOT_FOUND` · `LLD_PROTOTYPE_KIND_INVALID: kind` · `LLD_PROTOTYPE_FIELDS_REQUIRED` · `LLD_PROTOTYPE_CREATE_FAILED` · `LLD_PROTOTYPE_IDS_REQUIRED` + 위 표.
⚠️ 상속 규칙(inherited)의 프로토타입은 Zabbix가 이름·키 수정을 거부 — FE는 상속 규칙 드로어에서 쓰기 버튼을 막는다(원본 템플릿에서 편집).

### 6-b. LLD 마무리(2026-08-19 오후)

| EP | 비고 |
|---|---|
| `POST /discovery-rules/{itemid}/execute` | **지금 실행** — `task.create [{type:6, request:{itemid}}]` → `{taskid}`. 비동기(1~2분 뒤 목록/상세 반영). 능동 에이전트·트래퍼 등은 Zabbix가 거부(원문). 감사 EXECUTE |
| `GET /discovery-rules/{itemid}/discovered/{triggers\|graphs\|hosts}` | 규칙이 만든 생성물. flags=4 객체의 `selectXDiscovery.parent_*id` ∈ 이 규칙의 프로토타입 ID로 판정(실측). 행 `{id,name,status?,…원본}`. 🔴 프로토타입 ID 조회 output은 **객체별 필드만**(hostprototype.get에 triggerid 넣으면 400 — 실측) |
| `PATCH …/prototypes/{kind}/{id}/status {enabled}` | item/trigger/host. 그래프는 `LLD_PROTOTYPE_KIND_INVALID` |
| 아이템 프로토타입 req 확장 | `history` `trends` `tags[{tag,value}]` `preprocessing[{type,params,error_handler,error_handler_params}]` `extra{유형별 원본: snmp_oid·url·request_method·headers·query_fields·posts·jmx_endpoint·params·timeout·username·password·authtype·publickey·privatekey·ipmi_sensor …}` — tags/preprocessing 보내면 전체 교체 |
| 트리거 프로토타입 req 확장 | `tags` · `dependencies: triggerid[]`(→ `[{triggerid}]`) · `extra` |
| 호스트 프로토타입 req 확장 | `customInterfaces 0\|1` · `interfaces[{type,main,useip,ip,dns,port,details?}]` · `macros[{macro,value,type,description}]` · `tags` — 🔴 get의 `interfaces` 읽기전용(available/error/errors_from/disable_until/interfaceid/hostid)·`macros`의 hostmacroid/hostid/automatic은 BE가 벗김(round-trip 실측 통과). details는 SNMP(type 2)에만 |

**FE**: `LldRuleDetailDrawer` 프로토타입 탭 — "프로토타입 추가" 드롭다운(4종) + 행 수정/삭제. 폼 `discovery/prototypes/{Item,Trigger,Graph,Host}PrototypeFormDrawer` (트리거 폼은 이 규칙의 아이템 프로토타입 키를 칩으로 → `last(/기술명/키)` 스니펫 삽입, 그래프 폼은 아이템 프로토타입에서 gitems 선택, 호스트 폼은 액션 옵션 EP(eventsource=1)의 hostGroups/templates 재사용). `DiscoveryManagementTab`에 `targetTech` prop 추가(호스트/템플릿 상세가 넘김).
- (6-b) 규칙 행 **지금 실행** 버튼(상속 규칙도 실행 가능) · 상세 드로어 "생성된 아이템" 탭 → 서브탭 아이템/트리거/그래프/호스트 · 프로토타입 상태 스위치(쓰기 가능 규칙에서) · 아이템 프로토타입 폼 탭 [기본(히스토리·트렌드) / 유형별 세부(Zabbix 원본 필드) / 태그 / 전처리(아이템 전처리 30종, `LldPreprocessingEditor types` prop)] · 트리거 폼 태그·의존성 · 호스트 폼 탭 [기본 / 인터페이스(상속·직접) / 매크로 / 태그]. 공용 `TagEditor`.

---

## 5. 에러 코드

| code | HTTP | 발생 |
|---|---|---|
| `403` | 200 | 관리자 아님 (전 EP) |
| `LLD_TARGET_REQUIRED` | 200 | 1-1에서 hostid·templateid 둘 다 없음 |
| `LLD_RULE_NOT_FOUND` | 200 | 1-2 · 1-4 · 4-2 · 4-3 · 4-4 대상 없음 |
| `LLD_RULE_CREATE_FAILED` | 200 | 4-1이 ID를 못 받음 |
| `LLD_RULE_IDS_REQUIRED` | 200 | 4-4 빈 목록 |
| `LLD_RULE_INHERITED` | 200 | 4-2 · 4-4에 템플릿 상속본 (상태 토글 4-3은 허용) |
| `DISCOVERY_RULE_NOT_FOUND` | 200 | 2-2 · 2-3 · 2-4 · 3-2 · 3-3 대상 없음 |
| `DISCOVERY_RULE_CREATE_FAILED` | 200 | 3-1이 ID를 못 받음 |
| `DISCOVERY_RULE_IDS_REQUIRED` | 200 | 3-4 빈 목록 |
| `DISCOVERY_CHECKS_REQUIRED` | 200 | 3-1 · 3-2 검사 0개 |
| `DISCOVERY_UNIQ_CONFLICT` | 200 | 3-1 · 3-2 uniq가 2개 이상 |
| `ACTION_UNLINK_MAKES_GLOBAL: 이름` | 200 | 2-6 해제하면 범위 조건이 0개가 되는 액션 |
| `ACTION_CREATE_FAILED` | 200 | 2-7이 ID를 못 받음 |

---

## 6. FE 구현 노트

- **쿼리 키 분리**: `DISCOVERY_QUERY_KEY`를 새로 만든다. 같은 API를 다른 페이지가 쓰더라도 키를
  공유하지 않는 것이 이 레포 규칙이다.
- **탭 props 규약 승계**: LLD 탭은 아이템·트리거 탭과 같이 `scope`(`CONFIG_SCOPE.HOST|TEMPLATE`) ·
  `targetId` · `targetName`을 상세 페이지에서 주입받는다. 상세 페이지는 무변경(placeholder만 교체).
- **쓰기 폼의 왕복 규칙**: 네트워크는 검사 목록 **전체**를 항상 왕복시킨다(§3-2). LLD는 반대로
  폼이 다루지 않는 배열 필드를 **보내지 않는다**(§4-2). 같은 화면군인데 규칙이 반대라 헷갈리기 쉽다 —
  "Zabbix가 어느 쪽을 전체 교체로 취급하는가"가 갈림길이다.
- **URL 상태**: 목록 필터·페이지는 URL 쿼리로 둔다. `App.tsx`의 `CSSTransition`이 navigate마다
  서브트리를 리마운트하므로 로컬 `useState`에 두면 값이 날아간다(memory: `fe-page-remount-on-navigate`).
- **에러 판정**: 조회는 `useDmoveQuery`가 언랩하며, 업무 에러는 200+code로 오므로
  `unwrapEnvelope`(`zabbix-item-template.api`) 재사용 — 트리거 관리와 동일 모델.
- **`DmoveTable`에 `loading`을 반드시 넘긴다**(안 넘기면 무한 스피너 — memory: `fe-dmovetable-loading-spinner`).

## 🔄 FE 요청사항 (BE 후속)

1. ~~쓰기 EP 전량 미구현~~ ✅ **해소(2026-08-18)** — 네트워크·LLD 모두 create/update/delete/status
   구현 완료(§3·§4). 액션(action.*) 쓰기는 여전히 범위 밖이다(Zabbix에서도 별도 메뉴).
2. **`ARCHIVED`에서 `zabbixadmin` 조회가 실시간으로 나간다** — `LiveQueryGuard`가 엔진 포트
   데코레이터에만 걸려 있고 `zabbixadmin/`에는 사용처가 0건이다. 디스커버리만의 문제가 아니라
   아이템·템플릿·트리거 관리가 모두 라이선스 실시간 차단을 우회한다(설계서 §6 별건, Codex 검수 C-6).
