# API 계약 — 호스트 그룹 상세 "호스트 목록"(Top Hosts) 헬스체크 3종 추가

작성: be-engineer · 날짜: 2026-06-18
대상: `getGroupTopHosts` 응답 DTO(`HostStatusDto`) 확장 (신규 엔드포인트 아님, 기존 응답에 3필드 추가)

---

## 1. 엔드포인트

| 항목 | 값 |
|------|----|
| 메서드 | `GET` |
| 경로 | `/hosts/:groupid/top-hosts` (전역 prefix 없음) |
| 컨트롤러 | `src/host/host.controller.ts` → `getGroupTopHosts()` |
| 서비스 | `src/host/host.service.ts` → `getGroupTopHosts()` |
| 가드 | `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()` |
| 필수 헤더 | `x-visitor-id` (JwtAuthGuard 세션 검증용), `Authorization: Bearer <token>` |
| Path param | `groupid: string` (호스트 그룹 ID) |

### Query (`GroupTopHostsReqDto`) — 변경 없음
- `offset: number`, `limit: number` (페이지네이션)
- `sortBy?: 'health' | 'severity' | 'alerts' | 'name'` (기본 `health`)
- `sortDirection?: 'ASC' | 'DESC'` (기본 ASC = 가장 위험한 호스트가 위)

> 이번 변경에서 정렬(sortTopHosts)은 건드리지 않음. 신규 3필드는 정렬 대상 아님.

---

## 2. 응답 shape

### 2.1 전송(transport) 형태 — 서버가 내려보내는 raw 본문

```jsonc
{
  "status": "success",      // ApiStatus.SUCCESS
  "code": 200,
  "errorCode": null,
  "message": null,
  "data": {                 // PaginationResponseDto<HostStatusDto>
    "items": [ HostStatusDto, ... ],
    "total": 42             // 필터/정렬 후 전체 호스트 수 (slice 이전 기준)
  }
}
```

- 에러도 대부분 HTTP 200. 본문 `status`로 구분(`success`/`error`). (Unauthorized/Forbidden만 실제 상태코드)
- 빈 그룹: `data = { items: [], total: 0 }`.

### 2.2 FE 소비자가 최종적으로 받는 형태 (useDmoveQuery 언랩 깊이 반영)

axios 인터셉터 + `useDmoveQuery`가 2겹(`response.data` → `.data`)을 벗기므로,
**FE 컴포넌트/훅이 직접 받는 값은 `data` 내부 payload**:

```ts
// useDmoveQuery 소비 결과 = PaginationResponseDto<HostStatusDto>
{
  items: HostStatusDto[];
  total: number;
}
```

즉 FE는 `result.items` / `result.total`을 바로 쓴다 (`result.data.data` 아님).

### 2.3 `HostStatusDto` 항목 shape (★ 신규 3필드 포함)

```ts
interface HostStatusDto {
  hostid: string;            // Zabbix host id
  name: string;              // 호스트 표시 이름
  available: boolean;        // (기존·불변) 인터페이스 중 하나라도 available=1이면 true, 없으면 false(dead)
  status: string;            // (기존·불변) 'OK' | 'NOT_CLASSIFIED' | 'INFORMATION' | 'WARNING' | 'AVERAGE' | 'HIGH' | 'DISASTER'
  healthValue: number;       // (기존·불변) OK/INFO=100, WARNING=70, AVERAGE=40, HIGH=20, DISASTER=0, dead=0
  activeAlarmCount: number;  // (기존·불변) 활성 problem 수

  // ── 신규 3필드 (모두 동일 union) ──
  agentHealth: HealthState;      // ★ 신규
  icmpHealth: HealthState;       // ★ 신규
  interfaceHealth: HealthState;  // ★ 신규
}

// 신규 union 타입 (3필드 공통)
type HealthState = 'available' | 'unavailable' | 'unknown';
```

> 결정한 표현 형식: **문자열 union `'available' | 'unavailable' | 'unknown'`** (nullable 아님).
> 판단 근거가 없을 때는 `null`이 아니라 명시적으로 `'unknown'` 문자열을 반환한다.
> FE는 3가지 값 → 3색 배지(예: 초록/빨강/회색)로 직접 매핑 가능.

---

## 3. 신규 필드 의미 · Zabbix 출처

| 필드 | 출처 | 'available' | 'unavailable' | 'unknown' |
|------|------|-------------|---------------|-----------|
| `agentHealth` | host.get `selectInterfaces` 중 **type=1 (Agent)** 인터페이스의 `available` | agent 인터페이스 중 하나라도 `available='1'` | agent 인터페이스가 있으나 모두 비가용(`'2'`/`'0'`) | agent(type=1) 인터페이스가 **하나도 없음** |
| `interfaceHealth` | host.get `selectInterfaces` 중 **type ∈ {2 SNMP, 3 IPMI, 4 JMX}** 인터페이스의 `available` | 해당 type 중 하나라도 `available='1'` | 해당 type이 있으나 모두 비가용 | 해당 type 인터페이스가 **하나도 없음** |
| `icmpHealth` | **`item.get` key_=`icmpping`** 의 `lastvalue` (호스트 목록 전체 1회 배치 조회) | `lastvalue='1'` (alive) | `lastvalue!='1'` (예 `'0'`, down) | 호스트에 `icmpping` item 없음 |

세부 규칙:
- 인터페이스 type 코드: 1=Agent, 2=SNMP, 3=IPMI, 4=JMX. available 코드: 0=unknown, 1=available, 2=unavailable.
- `agentHealth`/`interfaceHealth`는 **추가 Zabbix 호출 없이** 기존 `host.get`의 `selectInterfaces`에 `'type'`만 추가해 산출.
- `icmpHealth`는 호스트 목록 전체에 대해 **`item.get` 1회 배치**로 조회(호스트별 개별 호출 없음). `icmppingsec`/`icmppingloss` 같은 유사 키는 정확히 `icmpping`만 인정해 제외.
- 한 호스트에 같은 분류의 인터페이스/아이템이 여러 개면 "하나라도 available이면 available"로 종합.
- 기존 `available`/`status`/`healthValue`/`activeAlarmCount` 산식과 값은 **하위호환을 위해 변경 없음**. (`available`은 여전히 type 무관 "하나라도 available=1" 판정)

---

## 4. 에러코드 / 권한

- 권한: 인증된 사용자(JwtAuthGuard). 역할 제한(`@Roles`) 별도 없음.
- 이 변경으로 신규 에러코드 추가 없음. 빈 그룹은 에러가 아니라 `{ items: [], total: 0 }`.

---

## 5. 변경 파일

| 파일 | 변경 |
|------|------|
| `src/host/dto/constant.ts` | `HealthState` enum, `ZABBIX_INTERFACE_TYPE`, `ZABBIX_INTERFACE_AVAILABLE_CODE`, `NON_AGENT_INTERFACE_TYPES`, `ICMP_PING_ITEM_KEY`, `ICMP_PING_ALIVE_VALUE` 상수 추가 |
| `src/host/dto/responses/host-status.dto.ts` | `agentHealth`/`icmpHealth`/`interfaceHealth: HealthState` 3필드 + `@ApiProperty({ enum: HealthState })` |
| `src/host/host.service.ts` | `getGroupTopHosts`: `selectInterfaces`에 `'type'` 추가, `icmpHealthByHost` 배치 조회, 3필드 매핑. 신규 private `resolveInterfaceHealth()`, `getIcmpHealthByHost()` |
| `src/host/host.service.spec.ts` | 헬스체크 13개 테스트 케이스 추가, 기존 mock 인터페이스에 `type`/`icmpping` 반영 |

---

## 6. 빌드 / 테스트 결과

- `npm run build` (nest build): **통과** (에러 없음)
- `npx jest src/host/host.service.spec.ts`: **48 passed / 48 total** (신규 헬스체크 13건 포함, 기존 케이스 무회귀)
