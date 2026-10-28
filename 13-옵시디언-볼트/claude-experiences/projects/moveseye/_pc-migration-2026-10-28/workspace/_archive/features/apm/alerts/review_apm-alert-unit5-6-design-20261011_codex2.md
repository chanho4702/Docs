## 판정

**조건부 진행**

§8로 1차 🔴1·5·6은 해소됐습니다. 🔴2·3은 모델 방향은 맞지만 동시성의 선형화 규칙이 부족하고, 🔴4는 실행 구조는 맞아졌으나 lease 검증식이 실제 HTTP 상한을 모두 반영하지 않습니다.

핵심 구조를 다시 설계할 필요는 없으며, 아래 세 가지를 §8에 명문화한 뒤 구현에 착수할 수 있습니다.

## 🔴 필수

### 1. `resource_key`의 단일 실행은 현재 SQL 조건만으로 보장되지 않는다

[§8.3](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:257)은 “동일 resource에 PROCESSING 행이 있으면 claim하지 않는다”고 하지만, 두 worker가 서로 다른 PENDING 행을 동시에 claim하면 둘 다 상대의 미커밋 PROCESSING을 보지 못할 수 있습니다.

예를 들면:

1. worker A가 `PUSH_CURRENT`, worker B가 `STAT`을 각각 잠급니다.
2. 두 트랜잭션 모두 아직 같은 resource의 PROCESSING 행을 관측하지 못합니다.
3. 둘 다 PROCESSING으로 커밋하고 RPC를 병행합니다.

그러면 resource sequencer가 무너지고, `PUSH_CURRENT`와 disable/enable이 다시 경쟁하므로 R1 창이 완전히 닫히지 않습니다.

설계에 다음 중 하나를 반드시 추가해야 합니다.

- `resource_key`별 별도 lease 행을 원자적으로 claim하는 resource-lock 테이블
- 또는 `status='PROCESSING'`에 대한 `resource_key` partial UNIQUE와 충돌 재시도
- lifecycle enqueue/supersede와 worker claim이 같은 resource 직렬화 지점을 사용한다는 규칙
- 명령별 resource 매핑표. 특히 `DELETE_TRIGGER`의 binding 축과 `DELETE_ITEM`의 item 축 관계를 명시

두 worker가 같은 resource의 `PUSH_CURRENT`·`STAT` 또는 `PROVISION`을 동시에 claim하는 IT가 필요합니다.

### 2. 후발 dependency는 이미 PROCESSING인 `DELETE_ITEM`을 소급 차단하지 못한다

[§8.2](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:251)는 claim 시 선행 행 존재 여부만 검사합니다. 다음 순서는 여전히 가능합니다.

1. `DELETE_ITEM`이 선행 명령 없음으로 claim됩니다.
2. 다른 삭제 트랜잭션이 새 `DELETE_TRIGGER`와 dependency를 추가합니다.
3. 이미 claim된 `DELETE_ITEM`이 item을 먼저 삭제합니다.

“새 삭제가 붙으면 의존 행만 추가”한다는 규칙은 PROCESSING claim을 취소하지 못합니다. generation을 올려도 외부 삭제 RPC가 이미 실행된 뒤라면 물리 순서는 복구되지 않습니다.

다음을 확정해야 합니다.

- dependency 추가와 successor generation 증가는 같은 트랜잭션
- `DELETE_ITEM` 외부 부작용 직전 token·generation·dependency를 재검증
- PROCESSING 이후 추가된 predecessor를 어떻게 선형화할지 명시  
  - claim 이전 커밋된 predecessor만 선행으로 본다든지,
  - resource epoch/sequence로 predecessor 집합을 동결한다든지
- 후발 predecessor가 post-linearization으로 분류된다면, item 선삭제·trigger 없음도 안전한 성공이라는 Zabbix 실측 근거 필요
- 이 경쟁을 재현하는 latch IT 추가

### 3. lease 기동 검증식에 실제 단일 RPC 상한 전체를 반영해야 한다

[§8.4](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:264)의 bounded executor와 3초 await는 올바릅니다. 호출 스레드가 RPC를 직접 하지 않으므로 30초 RPC와 3초 응답 예산도 양립합니다.

다만 현재 클라이언트에는 response timeout 30초 외에도 connect 10초와 pool wait 5초가 있습니다([ZabbixClient.java](/C:/worktrees/apm-c05-followup/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:90)). 따라서 `최대 호출 수 × 30초 < lease`는 일부 설정을 안전하다고 잘못 승인할 수 있습니다.

검증식은 최소한 다음 기준이어야 합니다.

`명령별 최대 호출 수 × (pool wait + connect + response) + DB/스케줄링 여유 < lease`

아울러 다음 실행 규칙도 필요합니다.

- claim은 executor 작업 안에서, 실제 실행 직전에 획득
- 3초 await 만료 시 `Future.cancel(true)` 금지
- bounded queue 포화·reject 시 명령은 PENDING으로 남기고 facade는 `queued` 응답
- heartbeat가 “RPC 사이 갱신”인지 별도 스레드의 30초 주기 갱신인지 명확화
- 최소 lease가 단일 RPC 최악 상한보다 큰지 별도 검증

## 🟡 권장

### 처리량·기아와 Zabbix 알림 지연

한 행씩 claim하는 것은 lease 안전성에는 유리하지만 worker 병렬도와 공정성 규칙이 없습니다. 추정: 기존 단일 drain thread를 유지하면 느린 PROVISION 하나가 관계없는 resource까지 지연시킬 수 있습니다.

다음을 정하는 편이 좋습니다.

- worker 수 기본값과 상한. 현재 Zabbix connection pool 기본 상한은 10이므로 executor도 이를 넘겨 pool wait를 만들지 않도록 설정
- `next_attempt_at, id` 기반 aging과 lifecycle/PUSH 간 공정성
- 한 resource의 연속 실행 제한 또는 resource round-robin
- 명령 종류별 `oldestDueLag`, `PUSH_CURRENT` fence 시간, resource별 backlog 계측
- 예상 최대 바인딩 수를 사용한 처리량 테스트

평가는 기본 5분 주기입니다([ApmAlertEvaluationService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:154)). backlog가 5분을 넘으면 `PUSH_CURRENT`가 최신 값으로 병합되어 양수→음수 사이의 양수가 Zabbix에 한 번도 전달되지 않을 수 있습니다.

따라서 “Zabbix는 현재 상태 projection이며 모든 FIRED edge 전달을 보장하지 않는다”를 계약으로 확정해야 합니다. Zabbix Action까지 반드시 발화해야 한다면 `PUSH_CURRENT`만으로는 부족하고 FIRED/RESOLVED edge를 durable 명령으로 분리해야 합니다.

### dependency 사이클·고아

FK `ON DELETE CASCADE`는 물리적인 고아 dependency는 막습니다. §8에 정의된 RPUSH→STAT→RCONF 및 DELETE_TRIGGER→DELETE_ITEM 방향 자체도 사이클을 만들지는 않습니다.

다만 향후 자동 dependency 추가에서 사이클이 생기면 모두 영구 대기합니다. 다음을 권장합니다.

- `CHECK(command_id <> predecessor_id)`
- 허용 edge 종류표 또는 command rank 기반 DAG 제한
- dependency 추가 시 cycle 검사
- 상태 API에 `blockedBy`, 최장 차단 시간 표시
- 취소·supersede 시 기존 edge를 같은 트랜잭션에서 제거·재구성

### V79 보수적 복원

[§8.5](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:270)의 “모든 기존 `DELETE_ITEM`이 모든 기존 `DELETE_TRIGGER`를 기다림”은 **조기 item 삭제를 막는 데이터 안전성 측면에서는 안전**합니다. V53의 기존 UNIQUE 제거도 적절합니다([V53](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V53__apm_slo_p3_review.sql:84)).

다만 unrelated trigger 하나가 DEAD가 되면 이관된 모든 item 삭제가 멈추는 전역 head-of-line이 생깁니다. 다음을 보완하면 좋습니다.

- 이관 행 수·생성 dependency 수를 migration 검증 결과로 출력
- `blocked by migrated DEAD` 운영 조회
- 가능한 행은 `service_id/slo_uid/rule_uid`로 좁게 복원하고, 불명확한 행만 전역 barrier 적용
- V53에서 논리 item key를 복원하지 못하는 행의 migration 전용 `resource_key` 및 이후 재적재 시 canonical re-key 규칙 명시

### 구현 단위 순서

현재 [§8.9](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:299)의 큰 순서는 맞습니다. 다음처럼 조금 조정하는 것을 권장합니다.

1. 단위 4 반려 해소와 V78 확정. 현재 2차 검수도 `반려` 상태입니다([unit4 검수](/C:/solutions/_workspace/_archive/features/apm/alerts/review_apm-alert-unit4-dispatcher-20261011_codex2.md:1)).
2. 5a-1에서 V79뿐 아니라 resource lease/partial UNIQUE, dependency DAG·선형화 규칙, `PUSH_CURRENT`를 포함한 최종 command CHECK까지 먼저 확정.
3. 5a-2 DELETE/RCONF와 동시 dependency 추가 IT.
4. 5b PROVISION/STAT/facade, 실제 HTTP 상한 기반 lease 검사, bounded executor.
5. 6a `PUSH_CURRENT` 전환과 resource claim 경쟁·처리량·알림 지연 테스트.
6. 단위 7의 1초 장부를 같은 sequencer로 전환.
7. 6b 두 대조 작업.
8. BE 계약 확정 후 FE 배지·폴링 반영.

V79 rename은 coordinated-stop 단일 배포 전제이므로 중간 커밋을 독립 배포해서는 안 됩니다.

## 🟢 참고

- DELETE 충돌 병합과 generation CAS는 1차 🔴1의 유실 창을 닫습니다.
- RCONF 경계와 삭제 exact identity는 1차 🔴6을 충분히 반영했습니다.
- V79의 전역 dependency는 안전성 우선 선택이며, 문제는 데이터 손상이 아니라 장기 차단 가능성입니다.
- 위 resource claim 원자성이 추가되면 5분 `PUSH_CURRENT`의 disable→enable 역전 창은 닫힙니다.
- 요청대로 파일 수정과 테스트 실행 없이 문서·코드만 읽어 검수했습니다.

## U1~U5 의견

- **U1 — 찬성, 단 🔴3 조건부입니다.** claim은 executor 내부에서 하고 호출자는 최대 3초만 기다려야 합니다. timeout이나 executor 포화 시 작업을 취소하지 말고 `queued`로 응답해야 합니다.

- **U2 — 포함에 찬성합니다.** `queued`뿐 아니라 lifecycle DEAD로 `PUSH_CURRENT`가 fence된 상태도 사용자가 구분할 수 있어야 합니다.

- **U3 — 찬성합니다.** `decisionCommitted`, `failedPhase`, `commandsPending` 구조화 필드는 메시지 문자열과 별도로 저장·조회되어야 합니다.

- **U4 — 명령 종류별 분리에 찬성합니다.** 다만 `STAT`은 실행 시 DB desired state를 다시 읽으므로, 라이선스 판정도 그 재조회 뒤에 수행해야 합니다. disable로 claim한 STAT이 그사이 enable로 바뀌었는데 라이선스 만료 상태라면 enable RPC를 실행해서는 안 됩니다.

- **U5 — 같은 배포에 묶는 것을 강하게 권장합니다.** 1초 장부가 직접 `history.push`를 유지하면 STUCK_REQUEST 경로는 resource sequencer 밖에 남습니다. 따라서 “Zabbix 쓰기 단일 레인”과 R1 해소를 최종 보장하려면 단위 7을 배포 게이트로 두는 편이 맞습니다.
