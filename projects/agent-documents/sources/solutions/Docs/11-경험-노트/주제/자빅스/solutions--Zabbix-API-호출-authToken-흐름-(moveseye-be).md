---
tags: [zabbix, nestjs, auth, redis, moveseye]
updated: 2026-06-09
---

# Zabbix API 호출 & authToken 흐름 (moveseye-be)

> 관련 프로젝트: [[projects/moveseye/moveseye|moveseye]] · [[projects/moveseye/moveseye-overview|moveseye-overview]]
> 호출하는 메서드별 레퍼런스(host.get·history.get·problem.get 등): [[projects/moveseye/zabbix-api-reference|zabbix-api-reference]]

## 1. API 호출 진입점 — 단 한 곳

실제 HTTP(JSON-RPC 2.0) 호출은 **`src/zabbix/services/zabbix.service.ts`** 하나에만 있다.

- 생성자에서 axios 인스턴스를 `configService.zabbixConfig.apiUrl` 기준으로 만든다.
- 핵심 메서드: `sendRequest<T, R>(method, params, authToken)`
  - 요청 body: `{ jsonrpc: '2.0', method, params, id: 1, auth: authToken }`
  - axios POST `''` (baseURL에 붙음)
  - 응답 `error` 처리, 토큰 오류 코드 `-32602` / `-32500` → `UnauthorizedException(INVALID_TOKEN)` 변환
  - 그 외 에러는 `ApiError(err.data)`

```typescript
const requestData = { jsonrpc: '2.0', method, params, id: 1, auth: authToken };
const response = await this.axiosInstance.post('', requestData);
if (response.data.error) throw response.data.error;
return response.data.result;
```

## 2. 도메인별 래퍼 서비스 (`src/zabbix/services/`)

각 Zabbix 객체별 서비스는 전부 `ZabbixService.sendRequest`를 호출하는 얇은 래퍼다.

| 서비스 | 주요 메서드 |
|---|---|
| `zabbix-host.service.ts` | `host.get`, `hostgroup.get`, `trigger.get`, `item.get` |
| `zabbix-host-group.service.ts` | 호스트 그룹 |
| `zabbix-item.service.ts` | item(메트릭) |
| `zabbix-history.service.ts` | history(실시간 값) |
| `zabbox-trend.service.ts` | trend(집계 값) ※ 파일명 오타 `zabbox` |
| `zabbix-event` / `zabbix-problem` / `zabbix-trigger` | 이벤트/문제/트리거 |
| `zabbix-user` / `zabbix-user-group` / `zabbix-role` | 사용자/그룹/역할 |
| `zabbix-token.service.ts` | 토큰 관리(token.create/generate/delete/update/get) |

> 규칙: 다른 모듈(host/event/aws 등)에서 직접 axios 호출 금지. 반드시 도메인 서비스 주입.
> `zabbix` 모듈은 `@Global()` → `imports` 없이 주입 가능.

## 3. authToken 출처 = Zabbix `user.login`의 sessionid

`sendRequest`에 넘기는 `authToken`은 결국 **Zabbix `user.login` 응답의 `sessionid`** 다.

### (A) Super Admin 토큰 — 가장 흔한 경로

`ZabbixUserService.getSuperAdminToken(set=false)` (`zabbix-user.service.ts:50`)

1. **Redis 캐시 확인** — 키 `ZABBIX::Super_Admin` (`KEY_CACHED_SADMIN`)
2. 캐시 없거나 `set=true` → 재로그인:
   - DB `Setting`(type=`ZABBIX`)에 username/password 있으면 그걸로
   - 없으면 `configService.zabbixConfig.sadminUsername/Password` (환경변수)
   - `login()` → `user.login` 호출 → `sessionid`를 authToken으로 획득
3. 결과를 다시 Redis에 캐싱 후 authToken 반환

```typescript
const authToken = await this.zabbixUserService.getSuperAdminToken();
```

사용처: `host-group.service.ts`, `user.service.ts`, `user-group.service.ts`,
`event-sync-service.ts`, `zabbix-sync.service.ts`, `setting.service.ts`, `auth.service.ts`, `jwt.strategy.ts`.

### (B) 로그인 사용자 토큰 — 요청 컨텍스트

`jwt.strategy.ts:30`에서 `payload.authToken = getSuperAdminToken()`로 채워져,
`TokenUserInfo.authToken` → `@CurrentUser()`로 컨트롤러/서비스까지 전달.
(현 구현은 이 경로도 결국 SuperAdmin 토큰을 사용)

### 예외

`user.login` / `user.logout` 호출 시엔 토큰 불필요 → `authToken = null` 전달.

## 핵심 요약

- 호출 진입점: **`zabbix.service.ts`의 `sendRequest` 단 하나**
- authToken = **Zabbix sessionid**, 보통 `getSuperAdminToken()`로 획득
- 캐시: **Redis `ZABBIX::Super_Admin`**
- 자격증명 출처 순서: **DB Setting(ZABBIX) → 환경변수(ConfigService)**
