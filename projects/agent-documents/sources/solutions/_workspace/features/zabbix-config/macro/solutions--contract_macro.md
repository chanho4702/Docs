# API 계약서 — 사용자 매크로 관리 (전역 + 호스트/템플릿)

> **산출 기준**: BE 소스(`zabbixadmin/ZabbixMacroManageController` · `ZabbixMacroManageService`, 2026-08-19) + Zabbix 7.0.6 실측.
> 선례 계약: `features/zabbix-ops/alert-actions-media/contract_alert-management.md` (같은 규약). Swagger와 어긋나면 소스가 정본.

베이스 `/zabbix-manage/macros`. **전 EP 관리자 전용**(거부 = HTTP 200 + body code 403). 에러는 200 + body `code`(§4).
Flyway 변경 없음. Zabbix `usermacro.*` 래핑 — 로컬 저장 없음, 서비스 계정 토큰.

**이 계층이 Zabbix에 얹는 것**(래핑 원칙):
- 🔴 **상속 계산** — API에 없다(Zabbix UI "상속 및 호스트 매크로" 탭은 프론트 계산). §2-1.
- 이름 형식 사전 검증 · 같은 소유자 안 중복 이름 거부(이름 붙여서)
- 비밀(type=1) 값 유지 규칙 · automatic 매크로 수정 시 수동 전환 동봉 · 남의 hostmacroid 삭제 차단

---

## 0. 공통 shape

```ts
ManagedMacro {
  id: string;            // globalmacroid | hostmacroid
  hostid: string|null;   // 소유 호스트/템플릿. 전역=null
  macro: string;         // {$NAME} | {$NAME:context} | {$NAME:regex:"..."}
  value: string|null;    // 🔴 type=1(비밀)이면 null — Zabbix가 키 자체를 안 준다
  type: 0|1|2;           // 텍스트 | 비밀 | Vault
  description: string;
  automatic: boolean;    // 디스커버리가 만든 매크로
  source: "HOST"|"TEMPLATE"|"GLOBAL";
  sourceId: string|null; sourceName: string|null;   // TEMPLATE일 때 정의한 템플릿
  level: number;         // 소유 0, 직접 링크 템플릿 1, 그 부모 2…, 전역 -1
  effective: boolean;    // 같은 이름 중 이 호스트에서 실제 적용되는 것인가
}
MacroUpsertReq { macro?: string; value?: string; type?: number; description?: string }
MacroDeleteReq { ids: string[] }   → 응답 { ids: string[]; count: number }
```

---

## 1. 전역 — `/global`

| EP | 동작 |
|---|---|
| `GET /global` | `usermacro.get globalmacro:true` → `ManagedMacro[]` 이름순(source=GLOBAL, level=-1, effective=true) |
| `POST /global` | `usermacro.createglobal`. **macro 필수**. type 기본 0, value 기본 "". 중복 → `MACRO_DUPLICATE: {$NAME}` |
| `PUT /global/{globalmacroid}` | `usermacro.updateglobal` **부분**. 보낸 필드만. 이름 바꾸면 중복 검사 |
| `DELETE /global` | `usermacro.deleteglobal` ids |

🔴 **비밀 값 유지 규칙(PUT 공통)**: 현재 type=1이고 새 type도 1(또는 미지정)일 때 `value`가 없거나 `""`이면 **value를 보내지 않는다(유지)**.
비밀 → 텍스트(type 0)로 바꾸면서 `""`을 주면 그땐 빈 값으로 저장한다(지우기 의도). FE 폼은 이 경우 값을 필수로 만든다.

---

## 2. 호스트/템플릿 — `/hosts/{hostid}` (hostid에 **templateid도 된다** — Zabbix는 템플릿도 호스트)

### 2-1. GET `/hosts/{hostid}` — 소유 + 상속 + 전역 한 응답

```ts
HostMacroView { hostid; name; kind: "HOST"|"TEMPLATE"; own: ManagedMacro[]; inherited: ManagedMacro[]; global: ManagedMacro[] }
```

kind 판정: `host.get hostids` → 없으면 `template.get templateids` → 없으면 `MACRO_OWNER_NOT_FOUND`.

**우선순위(Zabbix 문서 "User macros" 그대로, 실측 확인)**: `own` → 1단 템플릿(**templateid 오름차순**) → 2단(부모 템플릿, ID순) → … → 전역.
같은 이름의 **첫 등장만 effective=true**. 이름 비교는 문자열 그대로(`{$X}`와 `{$X:"a"}`는 다른 이름 — 컨텍스트 폴백은 Zabbix 서버 런타임).
- `inherited` 정렬: level → templateid → 이름. `global` 정렬: 이름.
- 순환/깊이 폭주는 visited + 16단에서 끊는다.
- 실측(Zabbix server 10084): own 0 · inherited 36(1단 3템플릿) · global 3. 호스트에 같은 이름을 만들면 inherited 쪽이 즉시 effective=false(재정의 실측).

### 2-2. POST `/hosts/{hostid}` — 생성 (`usermacro.create` hostid 동봉)
상속받은 매크로와 **같은 이름으로 만들면 "재정의"**(호스트 값 우선). 같은 호스트 안 중복은 `MACRO_DUPLICATE`.

### 2-3. PUT `/hosts/{hostid}/{hostmacroid}` — 부분 수정 (`usermacro.update`)
🔴 현재 `automatic=1`(디스커버리 생성)이면 `automatic:0`을 함께 보낸다 — 수동 전환 없이는 Zabbix가 수정을 거부한다. ⚠️ dev 서버에 automatic 매크로가 0건이라 단위 테스트로만 고정.

### 2-4. DELETE `/hosts/{hostid}` — ids
🔴 **이 호스트 것이 아닌 hostmacroid가 하나라도 섞이면 전부 `MACRO_NOT_FOUND`**(남의 것을 조용히 지우지 않는다). 실측 확인.

---

## 3. 이름 검증

`^\{\$[A-Z0-9_.]+(:.+)?\}$` — 이름부는 **대문자·숫자·_·.** 만(Zabbix 문서), 컨텍스트는 자유(`{$IF.UTIL.MAX:"eth0"}` · `{$X:regex:"^eth"}`). 실패 → `MACRO_NAME_INVALID: 입력값`. FE도 같은 패턴으로 1차 검증.

---

## 4. 에러 코드

| code | 발생 |
|---|---|
| `403` | 관리자 아님 |
| `MACRO_NOT_FOUND` | 1-3 · 2-3 대상 없음 / 2-4에 남의 ID 섞임 |
| `MACRO_OWNER_NOT_FOUND` | 2-x hostid가 호스트/템플릿 어디에도 없음 |
| `MACRO_CREATE_FAILED` | create가 ID를 못 받음 |
| `MACRO_IDS_REQUIRED` | 삭제 빈 목록 |
| `MACRO_NAME_INVALID: 값` | §3 |
| `MACRO_DUPLICATE: {$NAME}` | 같은 소유자(전역/호스트) 안 같은 이름 |
| (Zabbix 원문) | 그 외 usermacro.* -32602 등은 message 그대로 |

---

## 5. FE 구현 노트

- 전역: `Zabbix 관리 > 매크로 관리`(`/zabbix-management/macro-management`, `GlobalMacroPage`). 클라이언트 키워드 필터.
- 호스트/템플릿: 드릴다운 **매크로 탭**(`CONTAINER_DETAIL_TABS.MACRO`, `HostMacroTab`) — 소유/상속/전역 세 카드, effective=false 흐림+"덮임", 상속·전역 행에 **재정의**(같은 이름 프리필로 소유 생성).
- 폼 `MacroFormDrawer` 공용: 비밀은 `Input.Password` + "비워 두면 유지", 비밀→텍스트 전환 시 값 필수, automatic 경고.
- 쿼리키 `MACRO_QUERY_KEY.GLOBAL_LIST/HOST_VIEW`. 전역 쓰기 → 두 키 모두 무효화(호스트 뷰 global 구간). 호스트/템플릿 쓰기 → HOST_VIEW 전체 무효화(템플릿 매크로는 링크 호스트들의 inherited에 실림).
- ⚠️ 잔여: 매크로를 **어디서 쓰는지**(아이템/트리거 참조 수)는 미제공 — Zabbix UI도 없다. 필요하면 item.get search key_/params로 후속.

## 🔄 FE 요청사항 (BE 후속)
- 없음
