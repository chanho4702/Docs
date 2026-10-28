# ZM-157 MCP 런타임 검증 (실측)

- 실행: 2026-09-21 · 문서 지도: [`./INDEX_zm-157-permission.md`](INDEX_zm-157-permission.md)
- 환경: BE `:3002`(ZM-157 코드, dev 프로필 → 도커 PG 5433, V61 + `R__` 적용) · AI `:3101`(ZM-157 코드, `AI_MCP_ENABLED=true`, `BE_BASE_URL=http://localhost:3002`, V7·V8 적용)
  - 🔴 AI는 기동 스크립트가 BE `.env`를 읽어 `DB_PORT=5432`가 들어가므로 **로컬 PostgreSQL 18.4**를 썼다(BE dev는 도커 5433). AI 자체 DB라 기능엔 영향 없지만, `ai_oauth_grant`를 조회할 땐 5432를 봐야 한다.
- 검증 계정: `zm157mcp`(id 135, 역할 19, Zabbix 미연동, `mcp_permission=READ_WRITE`) — **검증 후 삭제 완료**.
  - admin으로 하지 않은 이유: 계정당 세션 1개라 사용자 브라우저와 서로 밀어내 동의 호출이 `be-rejected-401`이 된다.
- 스크립트: 스크래치패드 `mcpverify/`(`mcplib.py`·`flow.py`·`tools*.py`·`revoke.py`·`after.py`·`deactivate.py`·`exchange.py`)

## 1. 결과 요약

| # | 항목 | 결과 |
|---|---|---|
| 1 | 무인증 `/mcp` | `401` + `WWW-Authenticate: Bearer resource_metadata="…"` · 메타데이터 2종 응답 |
| 2 | 동적 등록 → authorize(PKCE S256) | `201` → `302 http://localhost:5173/oauth/consent?rid=…` |
| 3 | 동의 조회·승인 → 코드 → 토큰 교환 | 전부 200. 연결에 **`generation` 저장 확인**(첫 연결 `0`, 비밀번호 변경 뒤 새 연결 `1`·`2`) |
| 4 | `tools/list` | **71개** 노출. `delete_host`·`zabbix_delete_hosts` 등 DESTRUCTIVE는 목록에 없고 직접 호출도 `Unknown tool` |
| 5 | 권한 없는 읽기 툴 | `zabbix_list_hosts` → "역할에서 이 기능이 허용되지 않았습니다 — … 역할 편집에서 권한을 켜 달라고 요청하세요" |
| 6 | Zabbix 미연동 사용자 | `list_problems` → "Zabbix 계정이 연결되지 않은 사용자는 …[FORBIDDEN]" (`CallerContexts.unlinked()` 경로) |
| 7 | 권한 불필요한 읽기 | `get_system_status` → 정상 데이터 |
| 8 | 입력 기반 위험도 | `zabbix_unlink_templates` `clear=false` → 실행(BE 권한 거부) · **`clear=true` → 차단**: "되돌릴 수 없는 작업이라 MCP 연결로는 실행할 수 없습니다" |
| 9 | 비밀번호 변경 회수 | 다음 툴 호출에서 안내 문구 → 그 다음 요청 **`401` + `WWW-Authenticate`** · refresh → `invalid_grant` "connection was revoked (account password change…)" · DB `revoked_at` 설정됨 |
| 10 | 계정 비활성화 회수 | `initialize`부터 즉시 `401 invalid_token` |
| 11 | 잠금 초과(사용자 행 `FOR NO KEY UPDATE` 유지) | 로그인 → `200` + `code 400 FAILED_TO_ACQUIRE_LOCK` · 토큰 교환 → **`503 temporarily_unavailable`**, 연결·코드 보존 |
| 12 | 코드 복원(D5) | 잠금 해제 후 **같은 인가 코드로 재교환 성공(200)** |

## 2. 검증 중 고친 것 — `GETDEL` 비호환 🔴

- 증상: 동의 승인이 `500 AI_INTERNAL`. AI 로그 `ERR unknown command 'GETDEL'` → `PendingAuthStore.take()`의 `opsForValue().getAndDelete()`.
- 원인: **`GETDEL`은 Redis 6.2+**. 이 PC의 Redis는 **3.0.504(Windows)**. 설치형 제품이라 고객사 Redis도 구버전일 수 있고, 그 환경에서는 **MCP 연결이 전부 실패**한다.
- 조치: Lua(`GET` 후 `DEL`)로 교체 — `EVAL`은 2.6+이고 스크립트는 단일 원자 단위라 "한 번만 소비" 보장은 같다.
- 전수 확인: AI·BE에 다른 6.2+ 전용 명령(`GETEX`·`COPY`·`SMISMEMBER`·`ZRANGESTORE`·`LMPOP` 등)은 없다. BE의 Lua 6종은 전부 2.6 호환 명령(`GET`/`SET EX`/`DEL`/`INCR`/`EXISTS`/`TTL`/`EXPIRE`/`cjson`).

## 3. 남은 차이 — 연결 목록은 "다음 사용 시점"에 정리된다 🟡

- 연결 폐기(`revoked_at`) 표시는 **토큰 교환·refresh를 시도할 때** 일어난다. access token만 거부된 상태(비밀번호 변경·비활성화 직후)에서는 `GET /ai/mcp/grants`에 **폐기 대상 연결이 아직 보인다**.
- 실제로 쓸 수 없으므로 보안 문제는 아니지만, 인수인계 문서의 검증 항목("연결된 앱 목록에서 사라짐")은 **다음 사용 시점**이라는 단서가 필요하다.
- 선택지: ① 공지 문구를 보정한다 ② `myGrants` 조회에서 BE 세대를 1회 읽어 불일치 연결을 폐기·제외한다(BE 호출 1회 추가). → **후속 과제로 올림**(`features/auth-license/zm-157-permission/tasks_zm-157-후속.md` 4장).

## 4. 부수 확인

- `delete_host_chart`는 MCP에 **노출된다** — WRITE 등급 유지(사용자 결정 09-17, 후속 과제 9번). 위험 어휘 툴 중 유일한 노출이며 의도된 상태다.
- 인가 흐름 자체는 BE 세션 쿠키에 의존하므로, 같은 계정으로 다른 곳에서 로그인하면 동의 호출이 401이 된다(제품 결함 아님).
