## 판정

**재설계 필요** — 수정 A는 타당하지만, 첫 페이지 timeout의 커서 보존 규칙이 모순되고 수정 B의 활성화 경계 보장과 오류 응답 계약을 바로잡아야 한다.

## 앞선 지적 해소 확인

| 지적 | 판단 | 근거 |
|---|---|---|
| 1차 🔴4 커서·완료 증명 | **부분 해소**. 서명·채널·세대·고정 hwm은 적절하다. VERIFY 폐지는 아래 조건으로 가능하다. | `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:872`, `:881`, `:899` |
| 1차 🔴5 timeout | **부분 해소**. SQLSTATE·cause chain·페이지 rollback·집계 제외는 명확해졌다. 첫 페이지 커서는 모순이 남는다. | 같은 파일 `:882`, `:904`, `:905` |
| 2차 🔴5 세대 | **설계상 해소**. 시각 대신 false→true마다 증가하는 bigint를 사용한다. | 같은 파일 `:867`, `:868` |
| 2차 🔴6 원시 구간 페이지 | **설계상 해소**. actionable 행이 없어도 구간 경계로 전진한다. | 같은 파일 `:891`, `:897` |
| 2차 🔴7 bootstrap 전 해소 | **정상 배포 조건에서 해소**. 수정 A가 FIRED 없는 실제 해소에도 짝을 만든다. 빈 없는 노드는 여전히 제한적으로만 보충한다. | 같은 파일 `:854`, `:860` |
| 2차 🔴8 첫 페이지 effective cursor | **미해소**. 첫 트랜잭션 실패 시 폐기한다는 규칙과 timeout 시 반환한다는 규칙이 충돌한다. | 같은 파일 `:882`, `:905`, `:936` |

## 🔴 필수

1. **커서 초기화와 첫 페이지 실패의 관계를 하나로 확정해야 한다.**

   §17.3은 첫 페이지 트랜잭션에서 `{gen, after=0, hwm}`을 정하지만, 그 트랜잭션이 커밋 전에 실패하면 값을 버리고 `nextCursor=null`이라고 한다. 첫 페이지 statement timeout도 바로 이 경우다. 반면 §17.5와 테스트는 유효 커서를 반환하도록 요구한다.

   권장안은 **초기 커서 확보를 별도 짧은 트랜잭션으로 커밋한 뒤**, 첫 보충 페이지를 실행하는 것이다. 또는 읽어서 확정한 커서를 페이지 rollback 뒤에도 보존하도록 명시해야 한다. 어느 방식이든 초기화 자체의 실패와 보충 페이지 timeout을 구분해야 한다. 활성화는 이미 커밋된 뒤집기 결과를 사용할 수 있지만, cursor 없는 `reconcile`에는 별도 규칙이 필요하다.

   근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:882`, `:883`, `:905`, `:936`

2. **수정 B를 정확한 활성화 커밋 경계로 설명하면 안 된다.**

   `max(id)`는 **그 SELECT에서 보이는 최대 id**다. 빈 없는 노드는 공유 advisory에 참여하지 않으므로 다음 경쟁이 가능하다.

   - 활성화 트랜잭션이 `hwm=99`를 읽는다.
   - 빈 없는 노드가 이벤트 100을 열고 닫은 결과를 커밋한다.
   - 그 뒤 활성화 트랜잭션이 커밋한다.
   - 재조정은 `100 > 99`이므로 짝을 만든다.

   따라서 “hwm 뒤 id는 켠 뒤에 커밋된 이벤트”라는 설명은 **활성화 커밋 기준으로는 틀리며**, 켜기 전에 커밋된 닫힌 이벤트까지 보충할 수 있는 창이 있다. 이는 코드 구조에 근거한 경쟁 시나리오이며 실행 검증은 하지 않았다.

   반대 방향의 한계도 있다. 낮은 id를 먼저 할당한 트랜잭션이 높은 id보다 늦게 커밋할 수 있으므로, `id ≤ activation_event_hwm`이 활성화 전 커밋을 뜻하지 않는다. §17.1은 이 낮은 id 사례를 이미 인정했지만, **과소 보충뿐 아니라 경계 창의 과잉 보충도** 계약에 포함해야 한다.

   수정 B를 제한적인 복구로 유지할 수는 있다. 다만 보장 기준을 “hwm 조회 snapshot”으로 명시하고, `complete`도 **고정 범위 스캔 완료**로 한정해야 한다.

   근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:861`, `:862`, `:864`, `:897`  
   코드: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:50`, `:72`  
   코드: `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventTransitions.java:59`

3. **CURSOR_INVALID의 실제 HTTP 응답을 기존 계약에 맞춰야 한다.**

   §17.3은 **HTTP 400**을 명시하지만 계약과 전역 처리기는 비즈니스 오류를 **HTTP 200 + body `code:400`**으로 반환한다. 새 오류 코드도 같은 규약을 따라야 한다. 실제 HTTP 400을 의도한다면 별도의 계약 변경이므로 “추가만”이라는 설명과 양립하지 않는다.

   근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:873`, `:915`  
   계약: `C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:14`  
   코드: `src/main/java/com/dmove/moveseye/common/exception/GlobalExceptionHandler.java:37`, `:43`

4. **커서가 현재 허용된 채널 키를 손실 없이 표현해야 한다.**

   payload는 `channel|gen|after|hwm`인데 현재 채널 키 검증은 공백·길이만 검사한다. `a|b`도 유효한 키이므로 발급한 커서가 “필드 4개” 검증을 통과하지 못한다. 채널 필드 인코딩, 길이 접두어 또는 JSON 등으로 표현을 확정해야 한다.

   근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:872`, `:878`  
   코드: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelRegistry.java:38`

## 🟡 권장

- **디스패처 순서 설명을 실제 SQL에 맞춘다.** FIRED는 SENT 외에 `DEAD && delivery_uncertain`이어도 RESOLVED 전송을 허용한다. 확실히 미전송인 DEAD와 SKIPPED는 RESOLVED를 SKIPPED로 만든다. §17.1의 “SENT 전에는 claim하지 않는다”는 정상 경로 설명으로 한정한다.  
  근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:856`, `:858`  
  코드: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:147`, `:191`

- **이어하기와 새 스캔을 구분한다.** 페이지가 지난 뒤 낮은 id가 커밋되거나 빈 없는 노드가 뒤늦게 닫으면, 기존 커서 이어하기는 그 구간을 재방문하지 않는다. 보충하려면 cursor 없이 새 스캔을 시작해야 한다. 계약의 “배포 완료 뒤 한 번 재조정하면 복구” 표현도 실제 한계에 맞춘다.  
  근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:899`  
  계약: `C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:40`

- **빈 부재는 해당 채널 기준으로 설명한다.** registry가 비어 있지 않아도 해당 채널 빈이 없으면 그 채널 통지는 적재되지 않는다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:58`, `:83`

- **경쟁 검증 항목을 보강한다.** 수정 A의 두 INSERT 사이 일시정지, 짝 생성 후 일반·강제 폐기, 확실한 DEAD·불명 DEAD, 단건 짝 재시도를 포함한다. 현재 §17.7은 bootstrap 경쟁과 SKIPPED만 구체적으로 다룬다.  
  근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:919`, `:939`

- **57014 선례 설명을 정정한다.** cause chain 탐색은 선례와 같지만, `statement timeout` 메시지까지 검사하는 조건은 이번에 강화한 정책이다. 원시 구간의 유한 전진 역시 페이지가 성공할 때 성립하며, 같은 페이지가 반복 timeout이면 자동 진행은 보장되지 않는다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:643`  
  설계: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:898`, `:904`

## 🟢 확인된 것

- **수정 A는 기존 상태 의미와 양립한다.** 기존 FIRED의 DEAD·SKIPPED를 되살리지 않고, 없는 행만 INSERT하면 폐기 의사를 보존한다. 단건 retry는 기존처럼 짝의 DEAD·SKIPPED를 함께 되살린다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:359`, `:380`  
  설계: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:858`

- **짝은 해소와 같은 트랜잭션에서 원자적으로 커밋된다.** 디스패처의 순서 보장은 id 순서보다 FIRED 상태 조건에서 나온다. 이미 닫힌 이벤트로 만든 FIRED도 payload에서는 해소 필드를 제외한다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventTransitions.java:48`, `:97`  
  코드: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertNotification.java:116`

- **기존 잠금 구조를 유지하면 새 교착 순환은 확인되지 않는다.** 해소의 이벤트→공유 advisory와 페이지의 배타 try-lock→이벤트 NOWAIT 조합은 유지된다. 일시정지는 상태 표시 후 배타 장벽을 통과하며, 폐기는 활성 상태·진행 중 전송을 재검사한다. 이는 정적 검토 판단이다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:201`, `:244`, `:390`

- 목적 분리 HMAC·상수 시간 비교·정수 세대·빈 테이블 hwm=0·원시 구간 전진은 적절하다. V88 추가도 현재 V83~V87 번호에 맞는다. 파일 수정과 테스트 실행은 하지 않았다.  
  근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:850`, `:867`, `:872`, `:884`

## §17.9 판단

1. **VERIFY 폐지: 조건부 찬성.** 모든 노드에 해당 채널과 수정 A가 배포됐다면 후발 해소는 전이 트랜잭션이 처리하므로 두 번째 스캔이 필요하지 않다. 빈 없는 노드가 계속 쓰는 동안에는 VERIFY 한 번도 완전성을 증명하지 못한다. 수정 B의 제한과 `complete`의 범위를 정확히 정의하는 것이 필요하다.  
   근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:859`, `:899`

2. **수정 B의 한계 수용: 현재 문구 그대로는 반대, 범위 정정 후 조건부 수용.** 모든 노드 배포 후 활성화라는 전제를 지키고, 롤링 배포 중 보충을 제한적인 복구로 명시하면 수용 가능하다. 완전한 활성화 경계 복원이 요구된다면 추가 설계가 필요하다. `resolved_db_at`만 추가해도 트랜잭션의 기록 시점과 커밋 순서는 달라질 수 있으므로, 같은 DB 시계를 쓴다는 이유만으로 해결되지는 않는다.  
   근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:863`, `:864`, `:953`

3. **수정 A의 대량 해소 비용: 수용 가능.** 배열 파라미터 두 문장이면 bind 수 문제를 유지해서 피하고, 공유 잠금끼리는 직접 막지 않는다. 다만 새 FIRED마다 INSERT·인덱스·FK·WAL 비용이 추가되고 그동안 부모·이벤트 잠금도 유지된다. 비용이 두 배라고 단정하기보다 이벤트 수×활성 채널 수 기준으로 측정하면 된다. 성능은 이번에 검증하지 않았다.  
   근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:66`  
   설계: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:954`