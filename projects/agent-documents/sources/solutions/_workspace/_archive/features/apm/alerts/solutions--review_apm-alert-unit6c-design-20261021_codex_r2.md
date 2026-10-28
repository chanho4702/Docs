## 판정

**진행** — §17.10 v2로 앞선 필수 지적은 설계상 해소됐다. 수정 B는 명시된 제한적 복구로 수용할 수 있으며, 남은 문구·검증 보완은 진행을 막지 않는다.

정적 검토 결과다. 파일 수정·테스트 실행은 하지 않았다. 아래 `features/` 경로는 `C:/solutions/_workspace/`, `src/` 경로는 지정 워크트리 기준이다.

## 앞선 지적 해소 확인

| 지적 | 판단 | 근거 |
|---|---|---|
| 6b 1차 🔴4 커서·완료 증명 | **해소**. 서명·채널·정수 세대·고정 hwm을 결속하고, 완료를 고정 구간 스캔 완료로 한정했다. VERIFY 폐지도 아래 조건에서 타당하다. | `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:881`, 같은 파일 `:972` |
| 6b 1차 🔴5·2차 🔴8 첫 페이지 57014 | **해소**. 초기 커서를 별도 트랜잭션에서 확정하므로 첫 보충 페이지 rollback 뒤에도 반환할 수 있다. 초기화 실패와 페이지 timeout도 구분했다. | 같은 파일 `:959`, `:961`, `:963`, `:991` |
| 6b 2차 🔴5 세대 | **해소**. false→true마다 bigint 세대를 증가시키므로 같은 millisecond의 재활성화도 구분한다. | 같은 파일 `:867`, `:868` |
| 6b 2차 🔴6 원시 구간 페이지 | **해소**. actionable 여부와 독립적으로 구간 끝을 정하고, 성공한 페이지는 누락 0건이어도 전진한다. | 같은 파일 `:891`, `:897` |
| 6b 2차 🔴7 bootstrap 전 해소 | **정상 배포 조건에서 해소**. 수정 A가 실제 해소 트랜잭션에서 빠진 FIRED와 RESOLVED를 함께 만든다. | 같은 파일 `:854`, `:983` |
| 6c 1차 🔴1 초기 커서 원자성 | **해소**. 초기화와 보충 페이지를 분리했다. | 같은 파일 `:961`, `:964` |
| 6c 1차 🔴2 활성화 경계 과장 | **해소**. hwm 조회 snapshot과 활성화 commit을 구분하고 과잉·과소 보충을 인정했다. | 같은 파일 `:967`, `:969`, `:970` |
| 6c 1차 🔴3 오류 응답 | **해소**. HTTP 200 + body `code:400`으로 확정했다. | 같은 파일 `:975`, `src/main/java/com/dmove/moveseye/common/exception/GlobalExceptionHandler.java:43` |
| 6c 1차 🔴4 채널 키 인코딩 | **해소**. 채널을 마지막 필드로 두고 제한 분할하므로 `a\|b`도 보존한다. | `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:979` |

6c 1차 🟡도 **설계상 반영됐다**. 디스패처 예외 조건은 `:987`, 새 스캔과 이어하기 구분은 `:972`, 해당 채널 기준 빈 부재는 `:973`, 경쟁·폐기·재시도 검증은 `:993`, `:994`, `:995`, `:996`, 57014 정책과 반복 timeout 한계는 `:988`에 반영됐다. 새 스캔의 복구 범위에는 아래 문구 보완이 남는다.

## 🔴 필수

**새로운 필수 설계 결함은 확인되지 않았다.**

이는 §17.10이 앞선 설명을 대체한다는 선언을 적용한 판단이다. 현재 코드의 부분 반영 상태에 대한 구현 승인이나 테스트 통과 판정은 아니다.  
근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:957`

## 🟡 권장

1. **늦은 커밋 테스트에서 두 hwm을 구별한다.**

   `:999`의 “커서 없는 새 스캔이 채운다”는 모든 낮은 id에 성립하지 않는다. 닫힌·FIRED 없는 이벤트라면 다음처럼 나뉜다.

   | 조건 | 새 스캔의 결과 |
   |---|---|
   | `activation_event_hwm < id ≤ 이전 스캔 hwm` | 수정 B로 보충 가능 |
   | `id ≤ activation_event_hwm` | 새 스캔도 계속 제외 |
   | 열린 이벤트 또는 기존 FIRED가 있는 닫힌 이벤트 | 다른 보충 조건으로 처리 가능 |

   테스트를 이 경우들로 나누는 편이 정확하다. 본문은 이미 과소 보충을 인정하므로 알고리즘 재설계 사유는 아니다.  
   근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:893`, 같은 파일 `:895`, `:970`, `:999`

2. **“열림·해소를 함께 보내는 쪽으로만 어긋난다”를 명확히 고친다.**

   과소 보충도 있으므로 “보충할 때는 짝으로 보내지만, 일부 이벤트는 짝 자체가 누락될 수 있다”가 정확하다. **해소 단독 생성 방지와 보충 완전성은 별개**다.  
   근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:970`, 같은 파일 `:971`

3. **4바이트 문자 키 테스트를 현재 Registry 길이 규칙에 맞춘다.**

   Java `String.length()`는 UTF-16 단위이므로 보충 문자 32개는 길이 64로 거부된다. Registry를 통과하는 통합 테스트는 보충 문자 16개 등으로 구성하고, 128바이트 사례는 cursor codec의 보수적 상한 검증으로 구별하면 된다. 512자 상한 자체에는 문제가 없다.  
   근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:980`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelRegistry.java:38`

4. **페이지 크기와 timeout을 절대적인 트랜잭션 비용 상한으로 표현하지 않는다.**

   원시 구간 경계는 적절하지만, READ COMMITTED에서 경계 조회 뒤 낮은 id가 커밋되면 후속 구간 조회의 가시 행 수가 달라질 수 있다. 특히 advisory에 참여하지 않는 노드가 있는 배포 창에서는 “항상 정확히 pageSize행 이하”가 엄밀한 보장은 아니다. 또한 `statement_timeout`은 각 SQL 문장에 적용되므로 페이지 전체가 반드시 5초 안에 끝난다는 뜻도 아니다. **정적 추론이며 실행 검증하지 않았다.**  
   근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:890`, 같은 파일 `:891`, `:892`, `:898`

## 🟢 확인된 것

- **수정 A의 단일 CTE는 정확하다.** 기존 FIRED와 `newf RETURNING`을 합쳐 RESOLVED를 만들므로, 같은 문장의 새 FIRED가 일반 테이블 스캔에는 보이지 않는 문제를 피한다. 활성 채널 집합도 같은 snapshot을 사용한다. 전이의 flush와 outbox는 같은 트랜잭션에 속한다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:89`, 같은 파일 `:108`, `:113`, `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventTransitions.java:48`, 같은 파일 `:97`

- **활성화·bootstrap·해소 사이에 새 교착 순환은 확인되지 않았다.** 해소는 이벤트→공유 advisory, bootstrap은 배타 try-lock→이벤트 KEY SHARE NOWAIT를 유지한다. 따라서 역순 경합 시 페이지가 기다리지 않고 rollback·재시도한다. 일시정지는 상태 표시 뒤 배타 장벽을 통과하므로 단일 CTE의 짝도 함께 완료된 뒤 종료된다. **정적 판단이다.**  
  근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:949`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:201`, 같은 파일 `:390`, `:424`

- **폐기·재시도 의미와 양립한다.** 기존 DEAD·SKIPPED FIRED는 INSERT로 되살리지 않는다. 새 PENDING 짝에는 기존 일반·강제 폐기 규칙이 적용되고, 단건 retry는 기존처럼 짝의 DEAD·SKIPPED를 함께 되살린다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:99`, 같은 파일 `:102`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:244`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:369`, 같은 파일 `:380`

- **전송 순서는 notification id보다 FIRED 상태 조건이 보장한다.** SENT 또는 결과 불명 DEAD 뒤에 RESOLVED를 허용하고, SKIPPED·확실한 미전송 DEAD의 RESOLVED는 SKIPPED로 정리한다. 이미 닫힌 이벤트에서 만든 FIRED도 payload의 해소 필드는 null이다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:147`, 같은 파일 `:191`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertNotification.java:116`

- **수정 B는 commit 순서를 복원하지 않는다.** 높은 id가 먼저 commit될 수 있고, hwm SELECT와 활성화 commit 사이에도 이벤트가 commit될 수 있다. v2는 이를 과소·과잉 보충으로 인정했다. 모든 노드에 해당 채널과 수정 A가 배포된 정상 경로에서는 늦은 커밋도 전이 outbox가 담당한다.  
  근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:864`, 같은 파일 `:968`, `:969`, `:970`

- **57014 처리와 원시 구간 전진은 타당하다.** timeout 페이지 전체 rollback·집계 제외·직전 커서 보존이 일관된다. 일반 사용자 취소는 별도로 전파한다. 반복 timeout 시 자동 전진을 보장하지 않는다는 한계도 명시했다.  
  근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:904`, 같은 파일 `:905`, `:906`, `:988`

## §17.9 판단

1. **VERIFY 폐지: 찬성.** 모든 쓰기 노드에 해당 채널과 수정 A가 배포됐다면 커서 아래의 후발 해소는 전이 트랜잭션이 처리한다. 빈 없는 노드가 계속 쓰는 동안에는 VERIFY 한 번도 완전성을 증명하지 못한다. `complete`를 고정 구간 스캔 완료로 제한한 v2와 양립한다.  
   근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:899`, 같은 파일 `:972`, `:983`

2. **수정 B의 한계 수용: 찬성.** 정상 배포 전제와 롤링 배포 중 최선 노력이라는 범위에서 수용 가능하다. `resolved_db_at`만 추가해도 기록 시점과 commit 순서는 같아지지 않으므로 정확한 활성화 경계를 자동으로 얻지는 못한다. 정확한 경계가 요구되면 별도의 직렬화·전이 기록 설계가 필요하다.  
   근거: `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:953`, 같은 파일 `:968`, `:971`

3. **수정 A의 대량 해소 비용: 수용 가능.** 배열 전달과 단일 CTE는 유지할 수 있다. 추가 비용은 빠진 FIRED의 INSERT·인덱스·FK·WAL이며, 공유 잠금끼리는 직접 차단하지 않지만 활성화·폐기의 배타 잠금 대기는 길어질 수 있다. “항상 두 배”보다는 이벤트 수×활성 채널 수×FIRED 누락 비율로 측정하는 편이 정확하다. 성능은 미검증이다.  
   근거: `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:78`, 같은 파일 `:94`, `:104`, `features/apm/alerts/apm-alert-unit5-6-design-20261011.md:983`