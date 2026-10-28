# 계약 — APM 알람 Zabbix 반영 상태(queued) (알람 재설계 단위 5b, 2026-10-12)

> BE 정본: `moveseye-be-spring` 워크트리 `C:\worktrees\apm-c05-followup`(브랜치 `apm-alert-history`, 미커밋). 설계 `features/apm/alerts/apm-alert-unit5-6-design-20261011.md` §3.3·§12.
> **전부 추가 필드**(기존 필드·형식·상태코드 무변경). FE 반영은 단위 8(설계 U2 — 같은 병합 묶음).

## 배경
규칙 생성·수정·끄기·켜기·resync는 이제 **DB 저장 + Zabbix 반영 명령 적재 후 커밋**하고, Zabbix 반영은 커밋 뒤 명령 워커가 한다. 화면 쓰기는 커밋 뒤 최대 3초 반영을 기다리고, 넘으면 "반영 중"으로 즉시 답한다. 옛 FE는 `queued`를 몰라 예약 바인딩(객체 아직 없음)을 `missing`이 아닌 칸에서 놓치므로 배지 반영이 필요하다.

## 1. `ApmAlertBindingSummaryDto` (규칙 목록·서비스별 규칙·쓰기 응답의 `bindings`)
| 필드 | 타입 | 뜻 |
|---|---|---|
| `queued` | int | 🆕 Zabbix 반영 명령이 대기·실행 중인 대상 수. **missing에 세지 않는다** |
| `commandFailed` | int | 🆕 `missing` 중 반영 명령이 영구 실패(DEAD — 이름·키 충돌 등 사람이 풀어야 함)인 수 |
| `missing` | int | (의미 확장) 객체 없음 + 명령 DEAD |
| `inFlight` | int | 🆕(단위 8) 대기·실행 중 명령이 있는 대상 수 — **칸과 무관**(drift·missing 칸이어도 센다). FE 폴링 조건 |
| `error` | string? | (의미 확장) 바인딩 고유 사유(NOT_SUPPORTED·push 실패)가 없으면 반영 명령의 마지막 오류 원문 |
| `orphaned` | int | 🆕(2026-10-22) 평가 대상에서 빠진 대상 수(서비스 숨김·서비스별 규칙 끄기, `orphaned_at`). 값을 보내지 않으니 대기가 아니다. 이 바인딩의 옛 오류는 `error`에 올리지 않는다 |
| `awaitingValue` | int | 🆕(2026-10-22) 객체를 만든 지 10분이 지났는데 첫 값이 한 번도 안 들어간 대상 수 — 보낼 데이터가 없다. 기다려도 안 낫는다(`pendingCache`와 구분) |

- 칸 배정 우선순위(한 바인딩 = 한 칸): `missing`(DEAD 포함) > `drift` > `queued` > `missing`(객체 없음) > `orphaned` > `pendingCache`(만든 지 10분 안)/`awaitingValue`(10분 지남) > `synced`.
- 불변식: `total = synced + pendingCache + drift + missing + queued + orphaned + awaitingValue`.
- FE 배지: `awaitingValue`가 있으면 '보낼 데이터 없음'(회색, 'Zabbix 준비 중' 뒤), 모든 대상이 `orphaned`일 때만 '평가 제외' — 일부만 빠졌으면 나머지 상태를 보이고 툴팁에 적는다. 'pendingCache' 문구는 2026-10-22부터 'Zabbix 준비 중'.

## 2. `ApmAlertRuleDto.zabbixApply` — 쓰기 응답(POST `/apm/alert-rules`, PUT `/apm/alert-rules/{uid}`, POST `/apm/alert-rules/{uid}/resync`)에만, 그 외 EP는 `null`
| 필드 | 타입 | 뜻 |
|---|---|---|
| `state` | `"APPLIED"`\|`"QUEUED"`\|`"FAILED"` | APPLIED = 3초 안에 남은 명령 없음 · QUEUED = 3초 초과 또는 실행 풀 포화(백그라운드 계속) · FAILED = 반영 명령 영구 실패(`bindings.error`) |
| `pendingCommands` | int | 응답 시점에 남은 반영 명령 수 |
| `rejected` | boolean | 실행 풀이 가득 차 즉시 실행을 못 맡겼다(명령은 대기 — 주기 실행이 가져간다) |

## 3. `ApmAlertZabbixStatusDto` (GET `/apm/alert-rules/zabbix-status`)
| 필드 | 타입 | 뜻 |
|---|---|---|
| `bindingQueued` | int | 🆕 반영 중 바인딩 수. 불변식 `bindingTotal = bindingSynced + bindingPendingCache + bindingDrift + bindingMissing + bindingQueued + bindingOrphaned + bindingAwaitingValue` |
| `bindingOrphaned` | int | 🆕(2026-10-22) 평가 대상에서 빠진 바인딩 수 |
| `bindingAwaitingValue` | int | 🆕(2026-10-22) 만든 지 10분 지나도 첫 값이 없는 바인딩 수 |
| `commands` | `{pending:long, processing:long, dead:long, oldestDueLagSec:long?, blocked:long, blockedByDead:long, longestBlockedSec:long?}` | 🆕 명령 장부 집계(뒤 3개는 단위 8 추가) |

## 4. SLO `burnAlert.zabbixSyncing` (GET `/apm/slos`·`/apm/slos/{uid}`의 `burnAlert`)
| 필드 | 타입 | 뜻 |
|---|---|---|
| `zabbixSyncing` | boolean | 🆕 번 레이트 규칙의 Zabbix 반영 명령이 대기·실행 중(DEAD 아님) |

## 5. FE 권고(단위 8)
- `apmAlertSyncState` 우선순위 missing > drift > queued > pending > synced, "Zabbix 반영 중" 배지.
- 쓰기 응답 `zabbixApply.state=QUEUED` 또는 `bindings.queued>0`이면 5초 폴링(목록 재조회)으로 해소 확인. `FAILED`는 `bindings.error` 원문을 보여 준다.
- 계약 픽스처: `apm/contract/slos.json`·`slo-detail.json`에 `zabbixSyncing:false` 추가됨(BE 표본) — FE 픽스처 사본도 맞출 것.

## 6. 반영 명령 장부(단위 8, 2026-10-20) — 설계 §16·§16.9
전부 `apm.edit`, 200 + body code. 🔴 세 EP 모두 `@LicenseExempt` + "APM 보유 이력" 자체 판정(만료·보관에서도 열린다, 보유 이력 없음·NONE·INVALID는 거부). 되살린 명령의 실행은 실행기의 라이선스 검사(DEFERRED)를 그대로 받는다.

### 6.1 `GET /apm/alert-rules/zabbix-commands?status=DEAD|BLOCKED&limit=50&offset=0`
응답 `ApmZbxCommandPageDto{items, total, limit, offset, stats}` — `stats`는 §3 `commands`와 같은 모양(DB 장부만, Zabbix 호출 없음). limit 상한 200, id 오름차순.

행 `ApmZbxCommandRowDto`:
| 필드 | 타입 | 뜻 |
|---|---|---|
| `id`·`command`·`status` | long·string·string | |
| `reason` | `NOT_OWNED`\|`NEUTRALIZE_TIMEOUT`\|`UNIDENTIFIED`\|`MANUAL_CLOSE`\|`INVALID_COMMAND`\|`OTHER`\|null | DEAD 사유 코드(BLOCKED 행은 null) |
| `lastError` | string? | 원문(2000자 절단) |
| `attempts`·`generation` | int | generation은 확인 완료 요청에 되돌려 보낸다 |
| `createdAt`·`updatedAt` | datetime | |
| `target` | `{ruleUid?, ruleKind?, ruleExists, scopeUid?, scopeName?, kind?, bindingId?, bindingExists, zbxIds[], host?, itemKey?}` | 규칙·바인딩 조인 실패 시 명령 스냅샷으로 채움 |
| `waiting` | `{count, commands[≤5]{id,command,status}}` | 직접 후속(PUSH_CURRENT 제외) |
| `blockedBy` | `[{id,command,status,reason?}]` | BLOCKED 목록에서만 |
| `fencedPushes` | int | 직접 후속 PUSH_CURRENT 수 |
| `retryable`·`acknowledgeable` | boolean | DEAD · DEAD+UNIDENTIFIED |

### 6.2 `POST /apm/alert-rules/zabbix-commands/{id}/retry`
응답 `{retried:boolean, reason?:NOT_FOUND|NOT_DEAD|LANE_CHANGED, status?:string}`. DEAD → PENDING(attempts 0, last_error 유지, generation 불변, RESOLVE_PUSH 보류 카운터 초기화), 커밋 뒤 워커 깨우기. 멱등.

### 6.3 `POST /apm/alert-rules/zabbix-commands/{id}/acknowledge` body `{note, expectedGeneration}`
note 필수(공백 → `APM_ALERT_COMMAND_NOTE_REQUIRED`). 응답 `{acknowledged:boolean, reason?:NOT_FOUND|NOT_DEAD|NOT_UNIDENTIFIED|GENERATION_CHANGED, released:[id], stillBlocked:[id]}`. DEAD+UNIDENTIFIED이고 generation이 같을 때만 행 삭제(되돌릴 수 없음), `[AUDIT]` WARN(사용자 id·행 요약·메모)은 커밋 뒤.

## 🔄 FE 요청사항
(없음 — 단위 8 FE는 워크트리 `apm-alert-history-fe`에서 반영: queued·inFlight 배지·쓰기 응답 QUEUED 폴링·SLO syncing·Zabbix 탭 반영 명령 카드·만료 fallback)
