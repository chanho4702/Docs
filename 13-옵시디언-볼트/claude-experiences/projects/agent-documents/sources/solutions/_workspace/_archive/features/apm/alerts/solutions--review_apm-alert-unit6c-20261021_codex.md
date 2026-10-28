## 판정

**승인** — §17.10의 핵심 설계가 구현됐으며, 승인 차단 결함은 확인되지 않았다. 남은 검증·진단 보완은 🟡로 분류한다.

정적 검수 결과다. 파일 수정·테스트 실행은 하지 않았으며, 요청서의 통과·뮤테이션 결과는 독립 재검증하지 않았다.

## 🔴 필수

없음.

## 🟡 권장

1. **timeout 테스트가 증명하는 범위를 보강한다.** 실패 주입 위치가 페이지의 쓰기 전이므로, 현재 테스트는 timeout 분류·커서 보존을 확인하지만 **FIRED INSERT 이후 실패해도 해당 페이지 전체가 rollback되는지**는 직접 검증하지 않는다. 또한 첫 페이지 timeout은 `activate` 경로이며, 별도 초기화 트랜잭션을 사용하는 cursor 없는 `reconcile`의 첫 페이지 timeout도 추가하면 좋다.  
   근거: [AlertChannelActivation.java:419](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:419), [ApmAlertNotificationDispatchIT.java:1415](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:1415), [동일 파일:1459](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:1459).

2. **이어하기·늦은 커밋 테스트의 주장을 좁히거나 검증을 강화한다.** `scanned`는 actionable 이벤트 수이므로, 완료한 앞 구간을 다시 읽어도 이미 FIRED가 있으면 증가하지 않는다. 따라서 `scanned` 합만으로 “앞부분을 다시 보지 않는다”를 증명하지 못한다. 늦은 누락 테스트도 실제 미커밋 행의 후발 commit 대신 기존 통지 삭제로 상황을 모사한다. 페이지 경계·횟수 확인과 별도 연결의 늦은 commit 시나리오를 권장한다.  
   근거: [AlertChannelActivation.java:522](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:522), [ApmAlertNotificationDispatchIT.java:1477](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:1477), [동일 파일:1612](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:1612).

3. **timeout으로 끝난 페이지의 시도도 `lockAttempts`에 포함한다.** 현재는 성공해서 반환된 `Attempted`만 더하므로, timeout 페이지와 그 앞의 잠금 재시도가 집계에서 빠진다. 커서·데이터 정합성에는 영향 없는 진단값 결함이다.  
   근거: [AlertChannelActivation.java:440](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:440), [동일 파일:452](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:452).

4. **코드 주석도 계약의 제한적 보충 표현으로 맞춘다.** “함께 보내는 쪽으로만 어긋난다”, “배포 완료 뒤 한 번 부르면 맞는다”는 짝 자체의 누락 가능성을 충분히 설명하지 않는다. 계약은 과잉·과소 보충과 새 스캔의 한계를 이미 명시했다.  
   근거: [AlertChannelActivation.java:43](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:43), [동일 파일:204](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:204), [contract_apm-alert-channels.md:87](C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:87).

## 🟢 확인된 것

- **초기 커서 확정과 페이지 처리가 분리됐다.** 활성화의 뒤집기 결과 또는 별도 초기화 트랜잭션이 확정한 `{generation, after, hwm}`을 사용한다. 페이지 성공 뒤에만 진행 지점과 집계를 갱신한다.  
  근거: [AlertChannelActivation.java:172](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:172), [동일 파일:227](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:227), [동일 파일:452](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:452).

- **수정 A·B가 구현됐다.** 해소 경로는 기존 FIRED와 `newf RETURNING`을 합쳐 단일 CTE에서 짝을 만들고, 기존 DEAD·SKIPPED FIRED를 되살리지 않는다. 페이지는 원시 id 경계와 세 가지 actionable 조건을 사용한다.  
  근거: [ApmAlertNotificationOutbox.java:89](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:89), [AlertChannelActivation.java:478](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:478).

- **잠금·트랜잭션 구조에서 새로운 교착 순환은 확인되지 않았다.** 전이는 이벤트→공유 advisory, 페이지는 배타 try-lock→이벤트 KEY SHARE NOWAIT를 유지한다. 실제 해소와 outbox 적재는 같은 트랜잭션이다. 정적 판단이다.  
  근거: [AlertChannelActivation.java:497](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:497), [동일 파일:535](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:535), [ApmAlertEventTransitions.java:48](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventTransitions.java:48).

- **커서 보안과 오류 매핑이 설계에 부합한다.** 용도 분리 HMAC, 길이 제한, 상수 시간 서명 비교 후 필드 파싱, 채널·숫자 범위 검증과 페이지별 세대 검사가 있다. 오류는 `ApiError`를 통해 HTTP 200 + body `code:400`으로 처리된다.  
  근거: [AlertReconcileCursor.java:82](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertReconcileCursor.java:82), [동일 파일:95](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertReconcileCursor.java:95), [ApmAlertNotificationAdmin.java:107](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationAdmin.java:107), [GlobalExceptionHandler.java:43](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/common/exception/GlobalExceptionHandler.java:43).

- **57014를 무조건 삼키지 않는다.** cause chain에서 SQLSTATE와 `statement timeout` 메시지를 함께 검사하며, 사용자 취소는 전파한다. timeout 페이지는 rollback 후 직전 커서를 반환한다. 사용자 취소 테스트도 실제 57014와 분류 결과를 검사한다.  
  근거: [AlertChannelActivation.java:440](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:440), [동일 파일:595](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:595), [ApmAlertNotificationDispatchIT.java:1485](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:1485).

## 판단 요청 답

1. **설계 대비 누락·왜곡:** 승인 차단 수준은 발견하지 못했다. V88의 세대·활성화 hwm, 원시 구간, 이어하기, 세대 변경 중단, 수정 A·B가 반영됐다. 테스트의 증명 범위와 일부 주석·집계에는 위 🟡가 남는다.  
   근거: [V88__apm_alert_channel_generation.sql:14](C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V88__apm_alert_channel_generation.sql:14), [AlertChannelActivation.java:382](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:382).

2. **actionable SELECT에 별도 `LIMIT`이 없는 것:** 수용 가능하다. 앞선 원시 조회가 정한 `(after, end]`로 제한된다. 다만 READ COMMITTED의 늦은 commit 때문에 항상 `pageSize`행 이하라는 절대 보장은 아니며, 계약도 이를 인정한다. 후속 SELECT에 단순히 `LIMIT`만 추가하면 처리하지 않은 행을 두고 `after=end`로 전진할 위험이 있다.  
   근거: [AlertChannelActivation.java:479](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:479), [동일 파일:485](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:485), [계약:77](C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:77).

3. **CTE의 id 순서와 무해성:** 전송 순서는 FIRED 상태 조건으로 보장한다는 판단에 동의한다. 다만 **CTE 실행 순서 미정만으로 같은 신규 짝의 id 역전이 발생한다고 단정할 수는 없다.** 신규 RESOLVED는 `newf RETURNING`에 의존한다. 이는 코드와 [PostgreSQL의 RETURNING 통신 규칙](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-MODIFYING)에 근거한 정적 추론이다.  
   또한 “역전돼도 모든 경로에서 무해”라는 일반화는 피해야 한다. 역전된 짝을 허용한다면 retry의 id 순 잠금과 `dead()`의 FIRED→RESOLVED 잠금이 반대가 되어 교착 가능성이 생긴다. 현재 정상 생성 경로에서 그 역전 발생은 확인하지 못했으므로 필수 결함으로 분류하지 않았다.  
   근거: [ApmAlertNotificationOutbox.java:103](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:103), [ApmAlertNotificationStore.java:147](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:147), [동일 파일:315](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:315), [동일 파일:368](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:368).

4. **`@ConstructorBinding` + 보조 생성자:** 적절하다. 정규 생성자를 명시적으로 선택하고, 8인자 보조 생성자는 정규 생성자로 위임한다. `@ConfigurationPropertiesScan` 등록 방식도 [Spring Boot 3.3의 constructor binding 규칙](https://docs.spring.io/spring-boot/3.3/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.constructor-binding)에 부합한다. 실행 검증은 하지 않았다.  
   근거: [ApmAlertNotifyProperties.java:44](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotifyProperties.java:44), [동일 파일:58](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotifyProperties.java:58), [MoveseyeApplication.java:10](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/MoveseyeApplication.java:10).