---
type: reference
tags: [moveseye, zabbix, api, json-rpc, reference, dmove, backend]
created: 2026-06-09
updated: 2026-06-09
source: "Zabbix 7.0 공식 매뉴얼 (manual/api) — 2026-06-09 스캔"
---

# Zabbix JSON-RPC API 레퍼런스 (MovesEye 관점)

> MovesEye BE(`moveseye-be`)가 프록시·가공하는 **Zabbix JSON-RPC API**의 개발자용 레퍼런스.
> 넥센 운영 버전 기준 **Zabbix 7.0 LTS** 문서(`manual/api`)를 스캔해 정리.
> 이 노트는 *어떤 메서드를 어떻게 호출하나*에 집중한다. 인증 구현 실체는 [[topics/zabbix/zabbix-api-auth|zabbix-api-auth]], 운영/UI·객체모델은 [[projects/moveseye/zabbix-admin-manual-nexen|zabbix-admin-manual-nexen]], 동기화 실무 함정은 [[projects/moveseye/2026-06-02-zabbix-sync-audit|2026-06-02-zabbix-sync-audit]] 참고.
> 관련: [[projects/moveseye/moveseye-overview|moveseye-overview]] · [[topics/zabbix/zabbix-agent-item-keys|zabbix-agent-item-keys]]

---

## 1. 요청/응답 기본 구조 (JSON-RPC 2.0)

```json
{
  "jsonrpc": "2.0",
  "method": "object.action",
  "params": { /* 메서드별 파라미터 */ },
  "id": 1
}
```

| 필드 | 의미 |
|------|------|
| `jsonrpc` | 항상 `"2.0"` |
| `method` | `object.action` 패턴 (예: `host.get`, `item.create`) |
| `params` | 메서드별 입력 |
| `id` | 요청 식별자 |

**성공 응답**은 `result`, **실패 응답**은 `error`(`code`/`message`/`data`)를 담는다. → BE의 `sendRequest` 단일 진입점에서 `error` 분기 처리 필수 ([[topics/zabbix/zabbix-api-auth|zabbix-api-auth]]).

```json
{ "jsonrpc": "2.0", "error": { "code": -32602, "message": "Invalid params.", "data": "..." }, "id": 1 }
```

---

## 2. 인증

두 가지 방식:
1. **`user.login`** (레거시): 자격증명으로 sessionid 토큰 발급 → 이후 요청의 `auth` 속성(또는 헤더)에 실어 보냄.
   - MovesEye는 이 방식. `authToken = sessionid`, `getSuperAdminToken` → Redis `ZABBIX::Super_Admin` 캐시 → 없으면 재로그인. 상세: [[topics/zabbix/zabbix-api-auth|zabbix-api-auth]].
2. **API Token** (권장, 6.0+): 프론트/Token API로 발급한 토큰을 HTTP 헤더로 전달.
   ```
   Authorization: Bearer <API_TOKEN>
   ```
   - 헤더는 대소문자 무시. CORS 요청에서 Authorization 헤더 지원은 **7.0.7부터**.

> 💡 향후 MovesEye가 sessionid 캐시 만료 핸들링을 단순화하고 싶다면 Bearer API Token 전환이 후보. (장기 토큰 → Redis 세션 관리 부담 감소)

---

## 3. `*.get` 공통 파라미터 (가장 많이 씀)

| 파라미터 | 용도 |
|---------|------|
| `output` | 가져올 필드 배열. 성능 위해 **항상 필요한 필드만** 지정 (`"extend"`는 전체) |
| `filter` | **정확 일치** 조건 (예: `{"host": "Zabbix server"}`) |
| `search` | 패턴 매칭(대소문자 무시, `%` 와일드카드, `searchWildcardsEnabled`) |
| `sortfield` / `sortorder` | 정렬 필드 / `ASC`·`DESC` |
| `limit` | 최대 반환 개수 (대용량 조회 시 필수) |
| `countOutput` | 데이터 대신 **개수만** 반환 (페이징 total 계산에 유용) |
| `select<X>` | 연관 객체 서브쿼리(예: `selectInterfaces`, `selectTags`) — N+1 회피의 핵심 |

> ⚠️ MovesEye 호스트 그룹 목록의 N+1은 `select*` 서브쿼리로 한 번에 당겨오면 줄일 수 있다 ([[projects/moveseye/host-group-feature/2026-06-04-host-group-audit|2026-06-04-host-group-audit]], [[projects/moveseye/2026-06-02-zabbix-sync-audit|2026-06-02-zabbix-sync-audit]]).

---

## 4. `host.get` — 모니터링 대상 조회

**주요 필터**: `groupids`, `hostids`, `templateids`, `itemids`, `triggerids`, `monitored_hosts`(모니터링 중만), `with_items`, `with_triggers`, `with_monitored_triggers`, `with_monitored_items`.

**서브쿼리(select)**: `selectHostGroups`/`selectGroups`, `selectInterfaces`, `selectItems`, `selectTriggers`, `selectInventory`, `selectTags`, `selectParentTemplates`, `selectMacros`.

**host 객체 주요 필드**:

| 필드 | 의미 |
|------|------|
| `hostid` | 고유 ID |
| `host` | 내부 호스트명 (agent `Hostname`과 일치) |
| `name` | 표시명(visible name) |
| `status` | **0=모니터링 중, 1=모니터링 안 함** |
| `proxyid` | 할당 프록시 (넥센: mahok/cp/yp) |
| `inventory_mode` | 자산 모드 (넥센은 Automatic) |

> ⚠️ **7.0 가용성(availability) 함정**: 호스트의 `available` 단일 필드는 6.0+에서 폐지/의미변경되어 **인터페이스 단위(`interface.available`)** 로 이동했다. "호스트가 살아있나"를 판단하려면 `selectInterfaces`로 인터페이스별 available을 봐야 한다. 호스트 상태 해석 로직 점검 시 핵심 ([[projects/moveseye/2026-06-02-zabbix-sync-audit|2026-06-02-zabbix-sync-audit]] · 호스트 상태 해석).

---

## 5. `history.get` — 시계열 원시 데이터 ⚠️ 최대 함정

**`history` 파라미터 = 값의 데이터 타입.** 이걸 안 맞추면 **빈 결과**가 온다.

| 값 | 타입 |
|----|------|
| 0 | Numeric float (소수) |
| 1 | Character |
| 2 | Log |
| **3** | **Numeric unsigned (기본값!)** |
| 4 | Text |
| 5 | Binary |

> 🚨 **기본값이 3(unsigned int)** 이다. CPU 사용률·응답시간 같은 **float 메트릭을 조회하면서 `"history": 0`을 명시하지 않으면 빈 배열**이 온다. MovesEye에서 차트가 비는 흔한 원인 1순위. → item의 `value_type`을 먼저 확인하고 그 값을 `history`에 그대로 넣어야 한다.

**주요 파라미터**: `itemids`(필수), `time_from`/`time_till`(Unix timestamp, `time_from ≤ clock ≤ time_till`), `sortfield`(`itemid`/`clock`/`ns`), `sortorder`, `limit`, `output`.

**거동 주의**:
- **Housekeeper**가 보관기간 지난 데이터를 삭제 → 과거 데이터는 사라질 수 있음. 장기 추세는 `trend.get` 사용.
- 권한 인식: 사용자 역할 권한에 따라 필터링된(혹은 빈) 결과.

```json
{ "itemids": "23296", "history": 0, "time_from": 1609459200, "time_till": 1609545600,
  "sortfield": "clock", "sortorder": "DESC", "limit": 100, "output": "extend" }
```

> 💡 **history vs trend**: 단기 상세값은 `history.get`, 장기(시/일 집계 min/avg/max)는 `trend.get`. 대시보드 기간이 길면 trend로 전환해야 응답이 가볍다.

---

## 6. `problem.get` vs `event.get`

| | `problem.get` | `event.get` |
|---|---|---|
| 대상 | **현재 활성 문제** + 최근 해결(보관 윈도우 내) | 모든 이벤트 이력(과거 포함) |
| 용도 | "지금 문제 목록" 화면 | 이력/타임라인/통계 |

**problem 객체 주요 필드**: `eventid`(문제 ID), `objectid`(트리거 ID), `clock`/`ns`(발생 시각), `name`, `severity`(0~5), `acknowledged`, `suppressed`, `r_eventid`/`r_clock`(해결 이벤트·시각).

**주요 필터**: `eventids`, `groupids`, `hostids`, `objectids`, `severities`, `recent`(`true`면 최근 해결도 포함), `suppressed`, `acknowledged`, `time_from`/`time_till`, `tags`(name/value + operator).

**데이터 보강(select)**: `selectAcknowledges`(확인 이력·사용자·동작·심각도 변경), `selectTags`, `selectSuppressionData`(활성 maintenance·수동 억제).

> ⚠️ `severity` 0~5는 정수. MovesEye 안전도/장애분류는 이 정수를 다루는데, 일부 코드가 문자열로 혼용된 적 있음 ([[projects/moveseye/host-group-feature/2026-06-04-detail-and-safety-logic|2026-06-04-detail-and-safety-logic]] · severity 문자열 주의).
> ⚠️ `suppressed`(maintenance 등으로 숨김) 문제를 장애 집계에 넣을지 정책 결정 필요 — Problems 화면의 "Show suppressed" 옵션과 같은 맥락 ([[projects/moveseye/zabbix-admin-manual-nexen|zabbix-admin-manual-nexen]] §4).

---

## 7. MovesEye가 쓰는 그 외 메서드 (요약)

| 메서드 | 용도 | 메모 |
|--------|------|------|
| `item.get` | 아이템(수집항목) 조회 | `value_type` 확인 → history 타입 결정의 근거 |
| `trigger.get` | 트리거 조회 | `selectHosts`, `only_true`, `min_severity` |
| `trend.get` | 장기 집계(시간당 min/avg/max) | 장기 차트는 history 대신 이걸로 |
| `hostgroup.get` | 호스트 그룹 | 권한·트리 구성의 기준 단위 |
| `usergroup.get` | 사용자 그룹 | 권한 모델의 한 축 |
| `user.get` / `role.get` | 사용자·역할 | zabbix-sync 동기화 대상 |

> 🔑 **권한 모델**: Zabbix 권한은 「**호스트 그룹 ↔ 사용자 그룹**」 관계로 결정된다. MovesEye 접근제어(user ↔ user-group ↔ host-group)의 근간 ([[projects/moveseye/moveseye-overview|moveseye-overview]] · [[projects/moveseye/zabbix-admin-manual-nexen|zabbix-admin-manual-nexen]] §0).

---

## 8. MovesEye 개발 체크리스트 (이 문서의 실전 요약)

1. **float 차트가 비면** → `history.get`에 `"history": 0` 넣었는지부터 확인 (기본 3).
2. **호스트 살았나 판단** → 호스트 `available` 아니라 `selectInterfaces`의 인터페이스 available (7.0).
3. **장기 차트 느리면** → `history.get` → `trend.get` 전환.
4. **목록 N+1** → 개별 호출 대신 `select*` 서브쿼리로 묶기.
5. **total 페이징** → `countOutput: true` 별도 호출.
6. **severity는 정수(0~5)** → 문자열 혼용 금지.
7. **suppressed 문제** → 장애 집계 포함 여부 정책 명시.
8. **error 응답** → `result` 없고 `error` 옴. `sendRequest`에서 일괄 처리.
