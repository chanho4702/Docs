---
tags: [moveseye, ai-assistant, resilience, architecture]
updated: 2026-08-24
---

# MovesEye AI 안정성 개선 Phase 1

> 2026-08-24 결정: 코드 수준의 멀티노드 안전장치는 완료로 본다. nginx 게이트웨이(로드밸런싱·SSE timeout·IP/연결 제한), 운영 Redis(영속화·백업·장애 대응), artifact S3/MinIO 전환, 2개 AI 노드 실배포 검증은 **배포 단계 작업으로 보류**한다. 당장 기능 개발을 막는 항목은 아니다.

`moveseye-ai`의 채팅 실행 경로를 운영 환경에 맞게 보강한다.

## 한 줄 요약

`moveseye-ai`는 LLM이 운영 데이터를 직접 다루지 않고, 사용자 권한을 보존한 채 기존 `moveseye-be-spring` API를 호출하는 AI 업무 게이트웨이다. 멀티노드 배포에서는 모든 노드가 Redis의 공유 상태를 사용해야 한다.

## 현재 요청 흐름

```text
사용자 → FE 채팅 → moveseye-ai → moveseye-be-spring → Zabbix / DB
                         │
                         └→ LLM: 도구 선택·결과 해석·SSE 답변 생성
```

1. FE가 Cookie/Bearer와 `x-visitor-id`를 AI 서버에 보낸다.
2. AI 서버는 BE `my-profile`로 로그인 사용자와 권한을 확인한다.
3. LLM은 정해진 `AiTool`만 선택한다. 임의 SQL, 임의 URL, Zabbix 직접 호출은 불가능하다.
4. 도구는 같은 인증 정보를 BE로 전달한다. 최종 RBAC·라이선스·감사 로그 판단은 BE가 한다.
5. READ는 즉시 실행하고, WRITE/DESTRUCTIVE는 내부 채팅에서 사용자 승인 뒤에만 실행한다.

## MCP의 역할

MCP는 Claude Desktop·Cursor 같은 외부 AI가 `/mcp`의 도구를 호출하도록 하는 연결 방식이다. 백엔드 소스코드를 수정하는 기능이 아니다.

```text
외부 AI → MCP OAuth 토큰 → moveseye-ai 도구 → 기존 BE API → Zabbix / DB
```

- MCP 토큰은 MovesEye 계정과 READ/READ_WRITE 권한에 연결된다.
- 외부 AI는 `zabbix_list_hosts`, `zabbix_set_host_status` 등 공개된 도구만 호출한다.
- WRITE는 MCP 권한과 BE의 기존 권한 검사를 모두 통과해야 한다.
- 내부 채팅의 승인 카드는 FE가 제공하지만, 외부 MCP에서는 클라이언트가 사용자 확인 UX를 제공하고 서버가 권한으로 최종 차단한다.

## 멀티노드에서 생기는 문제

AI 서버가 A/B 두 대라면 서버 메모리는 공유되지 않는다.

```text
서버 A: 대화 101 처리 중 / 승인 123 대기 중
서버 B: 위 상태를 알 수 없음
```

이 상태로 요청이 분산되면 같은 대화가 중복 실행되거나, A가 만든 승인 카드를 B가 승인하지 못할 수 있다. 대화 이력도 서로 덮어쓸 수 있다.

## 결정: Redis를 공유 상태 저장소로 사용

BE가 사용하는 `REDIS_HOST`, `REDIS_PORT`를 AI 서버도 사용한다. Gateway의 sticky session에 의존하지 않는다.

| 상태 | 저장 위치 | 이유 |
|---|---|---|
| 대화 이력·사용량 | PostgreSQL | 영속 정본, 조회·감사 가능 |
| 대화 실행 잠금 | Redis | 노드 간 빠른 배타 실행 |
| 승인 대기 | Redis | 어떤 노드에서도 승인·취소 가능 |
| OAuth 임시 코드/동의 | Redis | 짧은 TTL, 노드 간 공유 |
| XLSX 본문 | 향후 S3/MinIO | 노드 로컬 디스크 문제 제거 |

## 구현 완료

### 대화 실행 분산 잠금

`ConversationLock`은 대화 ID마다 Redis `SET NX` 잠금을 획득한다.

```text
대화 101 요청 → 서버 A가 lock:101 획득 → 처리
대화 101 요청 → 서버 B는 lock:101 획득 실패 → "처리 중" 반환

대화 202 요청 → 별도 lock:202 → A/B 어느 노드에서든 동시에 처리 가능
```

따라서 이 잠금은 사용자를 막는 것이 아니라 **같은 대화창의 메시지 순서가 섞이는 것만 막는다**. 서로 다른 사용자나 서로 다른 대화는 병렬 처리된다. 잠금에는 소유 토큰을 사용해 다른 노드의 잠금을 실수로 해제하지 않는다.

### 질문자 감사 로그

`ai_chat_request_audit` 테이블은 다음을 기록한다.

- 질문자 ID와 사용자명
- 대화 ID와 질문 원문
- 요청을 처리한 AI 노드 ID
- 시작/종료 시각, 처리 상태, 오류 코드

대화 transcript는 화면 재생과 LLM 이력용이고, 이 테이블은 운영 추적·감사용이다. 질문자 이름의 대화창 표시는 FE 연동 요청으로 분리했다.

### Redis 승인 대기

`PendingActionGate`는 `actionId`별 Redis Hash에 요청자와 상태를 저장한다. 상태는 `PENDING`, `APPROVED`, `CANCELLED`이며 TTL은 기본 5분이다. 승인·취소는 Lua 스크립트로 `PENDING`일 때만 원자적으로 전환한다.

```text
서버 A: 승인 카드 생성 → Redis action:123 = PENDING → 대기
서버 B: 사용자 승인 클릭 → Redis action:123 = APPROVED
서버 A: 상태 감지 → 실제 BE 변경 API 호출
```

Redis 상태를 읽을 수 없으면 변경을 실행하지 않는다(fail-closed). 기존 승인 취소 회귀 테스트를 통과했다.

### 실행량·연결 종료 보호

- Redis ZSET lease로 사용자당 동시 AI 실행을 기본 2개로 제한한다. 노드별 카운터가 아니라 모든 노드가 같은 제한을 공유한다.
- chat executor는 무제한 `cachedThreadPool` 대신 기본 작업자 20개·대기열 40개의 bounded executor를 사용한다. 포화 시 HTTP 429를 반환한다.
- SSE 연결이 timeout·오류·클라이언트 단절로 종료되면 실행 `Future`에 취소 신호를 보낸다. 승인 대기는 interrupt를 취소로 해석하므로 연결이 사라진 뒤 변경이 실행되지 않는다.
- 환경 변수: `AI_CHAT_MAX_CONCURRENCY`, `AI_CHAT_QUEUE_CAPACITY`, `AI_CHAT_MAX_CONCURRENT_PER_USER`, `AI_CHAT_LEASE_TTL`.

## 후속 구현 순서

1. OAuth `PendingAuthStore`의 임시 상태와 authorization code를 Redis로 이전한다.
2. bounded executor, 사용자별/전체 동시 실행 제한, SSE 연결 종료 취소를 추가한다.
3. Redis 기반 요청률·토큰·예산 제한을 적용한다.
4. artifact 본문을 S3/MinIO 같은 공용 객체 저장소로 이전한다.
5. Gateway/nginx에 `/ai/**` rate limit, SSE 연결 제한, 로드밸런싱을 적용한다.

## 로컬 실행 조건

```text
moveseye-be-spring :3000
moveseye-ai        :3100
Redis              :6379
```

AI IDE Run Configuration은 `SPRING_PROFILES_ACTIVE=dev`, `BE_BASE_URL=http://localhost:3000`, `REDIS_HOST=localhost`, `REDIS_PORT=6379`, `INTERNAL_API_TOKEN=<BE와 동일한 값>`을 사용한다. `PORT`가 3000으로 잡혀 있으면 AI 서버가 BE와 충돌하므로 제거하거나 3100으로 지정한다.

## 확인한 위험

- 승인 대기·대화 busy·OAuth 임시 상태가 단일 인스턴스 메모리에 있어 수평 확장 전제와 맞지 않는다.
- 무제한 채팅 executor와 연결 종료 뒤 계속되는 LLM 실행이 스레드와 비용을 키울 수 있다.
- 사용량은 기록하지만 요청량과 비용을 실제로 제한하지 않는다.

## 단계적 결정

1. Phase 1: 단일 인스턴스에서 bounded executor, 사용자별 동시 실행 제한, SSE 연결 종료 취소를 적용한다.
2. Phase 2: LLM/BE의 timeout·circuit breaker 및 사용량 기반 quota를 추가한다.
3. Phase 3: 승인·busy·OAuth 임시 상태를 Redis로 이전한 뒤 다중 인스턴스를 허용한다.
4. Phase 4: artifact 본문을 공용 객체 저장소로 이전한다.

## 구현 범위

사용자 결정으로 단일 인스턴스 한정 개선이 아니라 멀티노드 전제를 적용한다. Redis를 공유 상태 저장소로 사용해 승인 대기·대화 실행 잠금·OAuth 임시 상태를 이전하고, 이후 공용 artifact 저장소와 gateway 정책을 연결한다.

## 진행 기록

- AI Assistant 전체 페이지의 URL 동기화를 보완했다. URL의 `?c=` 선택을 store에 적용하는 동안에는 기존 store 값이 URL을 다시 쓰지 않도록 하여, 서로 다른 대화 ID가 빠르게 왕복하던 루프를 제거했다.
- 사용자 transcript에는 `authorName`을 함께 저장하고, 대화 화면은 저장된 질문자 이름(기존 이력은 `나`)을 표시한다. 감사 로그와 대화 이력이 같은 질문자 정보를 제공한다.
- `AiAssistantPage` URL 동기화 회귀 테스트와 transcript 질문자 보존 테스트를 추가했고, FE Jest 대상 테스트 및 `build:dev`를 통과했다.
- Redis 카운터로 사용자별 분당 AI 턴 시작 횟수를 제한했다(기본 12회, `AI_CHAT_MAX_REQUESTS_PER_MINUTE`). 어느 노드에서 요청해도 합산되며 초과 시 HTTP 429 `AI_CHAT_RATE_LIMITED`를 반환한다.
- `moveseye-ai`에 Spring Data Redis와 `REDIS_HOST`/`REDIS_PORT` 설정을 추가했다.
- `ConversationLock`이 Redis `SET NX`와 소유 토큰 기반 해제로 동일 대화의 다중 노드 동시 실행을 차단한다.
- `compileJava compileTestJava` 통과. 다음 작업은 승인 대기(`PendingActionGate`)와 OAuth 임시 상태의 Redis 이전이다.

관련 기록: [[2026-08-19-ai-assistant-mcp]], [[2026-08-20-ai-usage-metering]]

## 배포 단계 재개 순서

1. nginx를 역방향 프록시·로드밸런서로 구성하고 `/ai/**`에 SSE timeout, 연결/IP rate limit을 적용한다.
2. Redis 운영 구성을 확정한다. AOF/RDB 영속화, 백업·복구 절차, 장애 시 AI 요청 처리 정책을 포함한다.
3. artifact 본문을 S3/MinIO 공용 저장소로 이전한다.
4. AI 노드 2개와 Redis 1개로 같은 대화·다른 대화·사용자별 제한·노드 종료 상황을 실측 검증한다.

## 현재 완료 상태 (2026-08-22)

초기 계획의 Redis 전환 항목(대화 잠금, busy 조회, 확인 대기, OAuth 임시 상태)은 완료됐다. 사용자별 동시 실행 lease, bounded executor, 연결 종료 취소, 분당 요청 제한까지 적용했다. 다음 인프라 작업은 코드 내부 상태가 아니라 배포 계층의 nginx SSE 시간 초과·연결 수·IP rate limit과 artifact의 S3/MinIO 공용 저장소 구성이다.
