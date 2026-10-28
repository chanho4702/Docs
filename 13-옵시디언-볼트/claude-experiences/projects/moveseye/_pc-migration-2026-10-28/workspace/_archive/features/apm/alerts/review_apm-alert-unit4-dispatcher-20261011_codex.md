## 판정

**반려**

claim·lease·CAS와 일반 전송 순서는 대체로 정확하지만, `discard`와 활성화·전송 중 claim의 경합으로 통지 유실 또는 영구 `PENDING`이 생길 수 있습니다. 아래 두 건은 단위 4에서 수정해야 하며 단위 5~8로 이관할 수 없습니다.

## 🔴 필수

1. `discard`의 비활성 상태 확인과 실제 폐기가 원자적이지 않습니다.

   현재는 `isActive()`를 먼저 조회한 뒤 별도 SQL로 `discard()`합니다. 두 작업 사이에 다른 노드가 `activate()`하면 다음 순서가 가능합니다.

   1. 노드 A: `isActive=false` 확인
   2. 노드 B: advisory lock 획득 → `enabled=true` → bootstrap FIRED 커밋
   3. 노드 A: 활성 채널의 모든 PENDING을 `SKIPPED`

   이 경우 활성화는 성공했지만 기존 backlog와 bootstrap 통지가 유실됩니다. `discard` SQL에는 채널 상태 조건도, 활성화가 사용하는 advisory lock도 없습니다. [ApmAlertNotificationAdmin.java:124](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationAdmin.java:124), [ApmAlertNotificationStore.java:289](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:289), [AlertChannelActivation.java:183](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:183)

   `discard`가 활성화·비활성화·reconcile과 같은 advisory lock을 잡은 하나의 `REQUIRES_NEW` 트랜잭션에서 `enabled=false`를 재검증하고 폐기해야 합니다. `deactivate → discard`와 `activate ↔ discard` 다중 노드 경합 IT도 필요합니다.

2. 유효한 `PROCESSING`이 남은 상태에서 `discard`가 성공하여 상태기계가 다시 살아납니다.

   `discard()`는 PENDING과 리스가 만료된 PROCESSING만 `SKIPPED`로 바꾸고, 유효한 PROCESSING은 그대로 둡니다. 이후 외부 전송 결과가 돌아오면 다음 문제가 생깁니다.

   - RETRY 결과: `markRetry()`가 폐기 완료 뒤 행을 다시 `PENDING`으로 만듭니다. 채널이 비활성 상태이면 자동 claim·sweep 대상도 아니므로 다음 관리 명령 전까지 영구 정체합니다.
   - FIRED 전송 성공: FIRED는 `SENT`가 되지만, 함께 있던 RESOLVED는 폐기 과정에서 `SKIPPED`될 수 있습니다. 외부 채널에는 열린 알람만 남고 해소가 유실됩니다.
   - FAILED 결과: 폐기 완료 뒤 `DEAD`로 돌아와 “폐기 완료” 응답과 실제 상태가 달라집니다.

   [ApmAlertNotificationStore.java:181](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:181), [ApmAlertNotificationStore.java:194](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:194), [ApmAlertNotificationStore.java:289](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:289)

   일반 PENDING을 버리는 것은 명시적 폐기일 수 있지만, 폐기 완료 후 PROCESSING 결과가 다시 큐를 만드는 것은 의도된 손실 범위를 넘어섭니다. 다음 정책을 명시해야 합니다.

   - 유효한 PROCESSING이 있으면 `APM_ALERT_CHANNEL_BUSY`로 폐기를 거부하고 재시도시키거나,
   - claim generation/폐기 epoch로 결과 CAS를 무효화하고 후속 보상 정책을 둡니다.
   - FIRED가 이미 `SENT`인 쌍의 RESOLVED는 원칙적으로 폐기하지 않고 전달해야 합니다. 강제 포기가 필요하면 외부에 열린 알람이 남는다는 별도 `force` 계약이어야 합니다. 이는 이전 검수의 “FIRED SENT면 RESOLVED 전달” 정책과도 일치합니다. [이전 검수:98](/C:/solutions/_workspace/_archive/features/apm/alerts/review_apm-alert-unit23-20261011_codex.md:98)

   느린 채널을 latch로 잡아 둔 상태에서 `deactivate → discard → SENT/RETRY`를 각각 재현하는 IT가 필요합니다. 현재 폐기 테스트는 claim 중 경합을 다루지 않습니다. [ApmAlertNotificationDispatchIT.java:379](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:379)

## 🟡 권장

1. `reconcile`은 advisory lock 획득 후 무제한 이력 스캔을 수행합니다.

   60초 제한은 잠금 획득 재시도에만 적용되고, 잠금을 잡은 뒤 수행되는 이벤트 조회·두 번의 INSERT에는 행 수·statement timeout 제한이 없습니다. 그동안 모든 전이는 공유 advisory lock에서 대기합니다. [AlertChannelActivation.java:208](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:208), [AlertChannelActivation.java:246](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:246)

   페이지·상한·진행 cursor 또는 statement timeout을 두고, 각 페이지 사이에 잠금을 반환하는 방식을 권장합니다. 단위 6에서 평가 트랜잭션만 짧아져도 reconcile 자체의 장시간 독점은 해결되지 않습니다.

2. 다중 노드 리스는 애플리케이션 로컬 시각에 의존합니다.

   claim과 만료 비교에 호출 노드가 전달한 `LocalDateTime`을 사용합니다. 노드 시계가 크게 어긋나면 즉시 재claim에 의한 중복 전송이나 과도하게 긴 PROCESSING이 가능합니다. 이는 시계 오차가 있다는 전제의 **추정 위험**입니다. DB 시각을 리스의 정본으로 사용하거나, 최소한 clock-skew 허용치와 채널 timeout을 검증해야 합니다. [ApmAlertNotificationStore.java:100](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:100)

3. `batchSize × 채널 timeout < lease`는 주석뿐입니다.

   실제 채널이 추가될 때 timeout이 리스보다 길면 한 전송이 진행 중인 동안 다른 노드가 재claim하여 병렬 중복 전송과 조기 DEAD를 만들 수 있습니다. 채널별 timeout 계약, lease 연장 또는 동시 전송 제한이 필요합니다. [ApmAlertNotifyProperties.java:14](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotifyProperties.java:14)

4. REST의 “없는 채널” 오류 계약이 명령마다 다릅니다.

   `activate`·`reconcile`은 `APM_ALERT_CHANNEL_NOT_FOUND`지만, `deactivate`는 `changed=false`, `discard`·`retry-dead`는 0건 성공입니다. 제거된 빈의 잔여 큐를 관리할 필요는 있으므로, “registry·state·outbox 모두 없는 키”와 “빈만 제거된 기존 키”를 구분해 계약화하는 편이 안전합니다. [ApmAlertNotificationAdmin.java:88](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationAdmin.java:88), [ApmAlertNotificationAdmin.java:98](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationAdmin.java:98)

5. REST 테스트가 권한과 오류 계약 전체를 고정하지 않습니다.

   `apm.edit`의 7개 경로 거부는 확인하지만, 성공 응답은 일부 경로만 검사하며 오류 코드 5종 중 2종만 확인합니다. 또한 standalone MockMvc라 `@RequiresFeature(Feature.APM)` 인터셉터는 검증하지 않습니다. [ApmAlertChannelMvcTest.java:46](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/ApmAlertChannelMvcTest.java:46), [ApmAlertChannelMvcTest.java:87](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/ApmAlertChannelMvcTest.java:87)

6. 운영 지표 설명과 실제 노출이 맞지 않습니다.

   `lastDispatch()`가 있지만 REST DTO나 controller에서 노출되지 않아 “관리 상태 API”라는 주석과 다릅니다. 구조화 로그는 초기 단계에는 가능하지만 노드별 누적량·채널별 LOST/DEAD·리스 초과를 집계하기 어렵습니다. [ApmAlertNotificationAdmin.java:82](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationAdmin.java:82)

   또한 stale 경고는 `created_at`을 사용하므로 정상적인 최대 60분 백오프도 30분 기본 임계부터 정체로 경고할 수 있습니다. queue age와 “도래했지만 미처리된 due lag”를 분리하는 편이 좋습니다.

## 단위 5~8 이관 목록

- **단위 5**
  - 규칙 CRUD·프로비저닝·삭제의 Zabbix durable 수명주기 명령
  - trigger→item 의존 순서와 외부 성공/DB 롤백 고아 방지

- **단위 6**
  - 평가 트랜잭션에서 Zabbix I/O 분리
  - 같은 회차의 한 바인딩 실패가 다른 이벤트 전이를 롤백하지 않도록 분리
  - reconcile의 페이지 처리·시간 상한·진행 상태를 함께 완성
  - 활성화/reconcile 대기 시간과 실제 전이 지연을 운영 지표로 노출

- **단위 7**
  - 1초 감시기의 명령/ack·generation·edge-aware 큐
  - 종료 drain과 다중 노드 소유권 범위 확인

- **단위 8**
  - FE 채널 상태·pause/discard/retry/reconcile 화면과 오류 코드 처리
  - `registered/enabled/active`, PENDING·PROCESSING·DEAD·SKIPPED, backlog age 표시
  - 단, BE REST 계약서 작성 자체는 단위 8로 미루지 말고 단위 4에서 확정해야 합니다.

## 🟢 참고

- 일반 claim은 `FOR UPDATE SKIP LOCKED`, PROCESSING lease, token CAS를 올바르게 조합했습니다. 같은 리스 동안 다중 노드가 한 행을 동시에 claim하지 않는 구조는 타당합니다. [ApmAlertNotificationStore.java:110](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:110)
- FIRED가 `SENT` 전인 동안 RESOLVED를 차단하고, FIRED `DEAD/SKIPPED` 시 RESOLVED를 건너뛰는 일반 경로는 정확합니다. retry와 retry-dead도 DEAD/SKIPPED 쌍을 함께 되살려 순서를 보존합니다.
- 활성화·reconcile은 배타 advisory lock과 이벤트 `NOWAIT` 재시도로 전이 경로와의 순환 교착을 피합니다. 일반 잠금 순서인 서비스→SLO→규칙→바인딩→이벤트→통지를 새로 역전하는 영구 교착은 발견하지 못했습니다.
- V78의 만료 PROCESSING·PENDING 생성 시각 부분 인덱스는 실제 조회 조건과 맞고, 동일 버전 충돌도 없습니다. [V78__apm_alert_notification_dispatch_idx.sql:13](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V78__apm_alert_notification_dispatch_idx.sql:13)
- 제공 diff는 현재 워크트리에 정확히 reverse-apply되며 `git diff --check`도 통과했습니다.
- 읽기 전용 조건에 따라 테스트는 재실행하지 않았습니다. 2,551건 중 기존 간헐 실패 1건이라는 결과는 요청서 기재 내용으로만 확인했습니다. 파일은 수정하지 않았습니다.

## 의견 요청 답

1. **attempts를 claim 때 세는 결정은 승인합니다.** claim 뒤 노드가 반복 사망하는 행도 유한하게 DEAD로 수렴해야 하기 때문입니다. 단, 이는 “외부 전송 호출 횟수”가 아니라 “전송 소유권 획득 횟수”임을 계약과 지표에 유지하고, crash 횟수도 별도 집계하는 편이 좋습니다.

2. **디스패처에는 라이선스 게이트를 두지 않는 편이 맞습니다.** 이미 커밋된 FIRED/RESOLVED는 외부 상태를 마무리할 durable 의무입니다. 평가 잡이 활성 라이선스를 요구하므로 만료 뒤 새로운 판정 생성은 이미 제한됩니다. 다만 현재 관리 controller도 `@RequiresFeature(APM)`라 라이선스 만료 중에는 계속 도는 디스패처를 API로 중지할 수 없습니다. status·deactivate·discard 같은 운영 안전 명령은 관리자 권한을 유지한 채 만료 중에도 허용할지 결정해야 합니다.

3. **pause 직후 이미 claim된 한 묶음이 더 전송되는 것은 허용할 수 있습니다.** 이는 at-least-once와 스냅샷 판정의 정상 결과입니다. 하지만 `discard`까지 성공한 뒤 PROCESSING 결과가 다시 PENDING/SENT/DEAD로 바뀌는 현재 동작은 허용할 수 없습니다. 위 🔴의 fence가 전제입니다.

4. **단위 6까지의 임시 허용은 “이 브랜치를 단독 배포하지 않는다”는 조건에서만 가능합니다.** 실제 채널 활성화 전에는 reconcile을 bounded 작업으로 바꿔야 합니다. 단위 6의 평가 트랜잭션 분할만으로는 reconcile의 전건 스캔과 배타 advisory lock 장기 보유가 해소되지 않습니다.

5. **REST 계약서는 단위 4에서 작성해야 합니다.** 우선 🔴의 discard 의미와 오류 계약을 확정한 뒤, 7개 endpoint의 요청·응답·권한·HTTP 200/body code·오류 코드 5종을 BE 계약으로 동결하십시오. 단위 8은 그 계약을 소비해 FE를 구현하는 시점이지, 계약을 처음 작성하는 시점이 아닙니다.
