# contract_ai-invalidation — AI 툴 실행 → FE 캐시 무효화

산출: `moveseye-ai` (AI 서버가 계약의 주인) · 소비: `moveseyee_fe`
작성 2026-08-28.

AI가 툴로 데이터를 바꿔도 FE가 캐시를 들고 있어 화면이 그대로였다(F5를 눌러야 반영). AI 서버가 **무엇이 바뀌었는지**를 SSE에 실어 보내고, FE가 그 도메인의 쿼리를 버린다.

---

## 1. 전송 지점 — SSE `tool_result`

`POST /ai/conversations/{id}/messages` 스트림의 `tool_result` 이벤트에 **선택 필드** `invalidates`가 붙는다.

```jsonc
{
  "id": "call-3",
  "name": "update_asset_cost",
  "error": false,
  "elapsedMs": 412,
  "preview": "{\"assetId\":\"a-17\",...}",
  "invalidates": ["asset-cost", "assets"]   // ← 신규(선택)
}
```

| 규칙 | 값 |
|---|---|
| 타입 | `string[]` |
| 필드 유무 | **성공(`error:false`)한 쓰기 툴에만** 실린다. 실패한 툴·READ 툴에는 필드 자체가 없다 |
| 빈 배열 | 보내지 않는다(필드 생략) |
| 중복 | 없음, 순서 무의미 |

`GET /ai/conversations/{id}`의 `transcript`에 기록된 과거 `tool_result`에도 같은 필드가 들어 있다.
🔴 **FE는 대화 복원 시의 과거 이벤트로 무효화하지 않는다** — 라이브 스트림에서 방금 도착한 `tool_result`만 소비한다. 서버는 라이브/복원을 구분하지 않는다.

## 2. 도메인 토큰 사전 (10개 — 이 외의 값은 나가지 않는다)

정본: `tool/InvalidationDomains.java` (`InvalidationDomains.ALL`).

| 토큰 | 무엇이 바뀌었나 |
|---|---|
| `widgets` | 홈/호스트 대시보드 위젯·차트 구성 |
| `assets` | 자산 목록·상세 |
| `asset-cost` | 자산 비용(취득가액·감가상각) |
| `hosts` | 호스트 목록·상세·기기분류 |
| `zabbix-items` | Zabbix 아이템 |
| `zabbix-triggers` | Zabbix 트리거 |
| `zabbix-templates` | 템플릿 연결 |
| `alerts` | 알람·이벤트 |
| `maintenance` | 점검(Maintenance) 일정 |
| `notify` | 알림 설정(액션·미디어 타입·사용자 미디어) |

FE는 **모르는 토큰을 조용히 무시**한다(서버가 먼저 늘어나도 안전). 토큰을 추가할 때는 양쪽을 같이 고친다.

## 3. 툴 → 도메인 표

| 툴 | invalidates |
|---|---|
| `create_host_chart` · `update_host_chart` · `delete_host_chart` | `widgets` |
| `sync_assets` · `update_asset` | `assets` |
| `exclude_asset` | `assets` |
| `update_asset_cost` | `asset-cost`, `assets` |
| `acknowledge_problem` | `alerts` |
| `zabbix_create_host` · `zabbix_update_host` · `zabbix_set_host_status` · `zabbix_set_device_type` · `zabbix_delete_host` | `hosts` |
| `zabbix_create_item` · `zabbix_update_item` · `zabbix_set_item_status` · `zabbix_delete_items` | `zabbix-items` |
| `zabbix_create_trigger` · `zabbix_update_trigger` · `zabbix_set_trigger_status` · `zabbix_delete_triggers` | `zabbix-triggers` |
| `zabbix_link_templates` · `zabbix_unlink_templates` | `zabbix-templates`, `hosts` |
| `schedule_maintenance` · `cancel_maintenance` | `maintenance` |
| `create_alert_action` · `set_alert_action_status` · `set_media_type_status` · `set_user_notification` | `notify` |

READ 툴 전부는 빈 목록(필드 미전송). `InvalidationContractTest`가 "쓰기 툴인데 선언 없음"과 "사전에 없는 토큰"을 빌드에서 잡는다.

## 4. 권한 변경 (같은 릴리스)

설계 M6이 "관리자 전용"인데 서버는 로그인만 확인하고 있었다. 아래가 **관리자(ADMIN/SUPER_ADMIN) 전용**으로 올라갔다 — 일반 사용자는 **HTTP 403** + `code: "AI_FORBIDDEN"`("관리자만 사용할 수 있습니다."). BE와 달리 AI 서버는 실제 403 상태코드를 쓴다(기존 `/ai/llm/settings`·`/ai/insight`와 동일).

- `POST|GET /ai/conversations`, `GET|DELETE /ai/conversations/{id}`
- `POST /ai/conversations/{id}/messages`
- `POST /ai/actions/{id}/confirm` · `/cancel`
- `GET /ai/tools`
- `POST /ai/dev/tools/{name}` (dev 프로필 전용)

**바뀌지 않은 것**: `GET /ai/health`(인증 없음 — FE 메뉴 게이트 판정), `GET /ai/usage`(`scope=me`)·`/ai/usage/compact`(본인 사용량), `GET /ai/screens/resolve`·`/ai/commands`, `GET /ai/artifacts/{id}`(소유자 한정), MCP 계열 전부(`user.mcp_permission` 축).

## 🔄 FE 요청사항

없음(서버 단독 변경, 기존 필드 제거·변경 없음). FE는 `invalidates`를 소비하는 코드를 추가하면 된다.
