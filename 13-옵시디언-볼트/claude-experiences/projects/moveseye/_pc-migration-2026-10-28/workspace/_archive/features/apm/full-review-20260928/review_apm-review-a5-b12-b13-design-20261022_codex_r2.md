## 판정

**조건부 진행 — 1차 지적은 대부분 반영됐지만, 스택·`currentOp`·경로의 원문 통과 조건과 일괄 재시도 잠금 순서를 보완해야 합니다.**

정적 검수입니다. 파일 수정·빌드·테스트는 하지 않았습니다. HEAD는 `1a36632`지만, 검수 중 워크트리의 미커밋 변경이 늘어 master와 완전히 같지는 않았습니다. 아래 **확인**은 소스·설계의 사실이고, **추론**은 해당 설계 적용 시 예상되는 결과입니다.

## 🔴 필수

1. **B12: `at ` 접두만으로 긴 스택의 줄을 보존하면 원문이 통과합니다.**

   **확인:** [설계서:92](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:92)는 프레임 줄에 원문이 섞이지 않는다고 전제합니다. 그러나 현재 `isFrame()`은 공백 제거 후 `startsWith("at ")`만 검사합니다. [ApmSqlMasker.java:130](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:130)

   **추론:** 다음 줄을 앞에 두고 전체 길이를 16,384자보다 크게 만들면 이메일이 보존됩니다.

   ```text
   at com.x.Y(Y.java:42) SELECT 'kim@example.com' FROM users
   ```

   **설계 변경:** 프레임은 **줄 전체가 허용된 프레임 문법과 길이를 만족할 때만** 보존하세요. 나머지는 `UNMASKABLE`로 처리해야 합니다. 접두 위장·정상 프레임 뒤 SQL 덧붙이기·거대한 단일 줄을 테스트에 추가해야 합니다. 자유 텍스트의 초과 입력 처리는 해소됐지만, 스택 처리는 아직 조건부입니다.

2. **A5: `retryDead()`와의 통지 행 간 교착 가능성이 남습니다.**

   **확인:** [설계서:117](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:117)은 단건·일괄 재시도를 같은 잠금 방식으로 설명합니다. 실제로 단건 `retry()`는 `order by id for update`를 사용하지만, `retryDead()`는 `reset()`의 **정렬 없는 일괄 UPDATE**를 호출합니다. [단건:370](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:370), [일괄:386](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:386), [UPDATE:446](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:446)

   **추론:** 보존이 통지 `n1`을 잡고 `n2`를 기다리는 동안, 일괄 재시도가 `n2`를 잡고 `n1`을 기다릴 수 있습니다. 이벤트 잠금에서 기다리지 않는다는 사실만으로 **통지 행 사이의 순환 대기**까지 배제할 수는 없습니다.

   **설계 변경:** 일괄 재시도까지 동일한 통지 `id` 순으로 선잠금하거나, 보존의 통지 잠금을 `NOWAIT`로 취득하고 실패 시 묶음을 롤백·재시도하도록 확정하세요. 통지 두 개 이상을 역순으로 잡는 PG 동시성 테스트가 필요합니다. §5.3의 “순환 대기가 생기지 않는다”는 결론은 현재 코드로 입증되지 않습니다.

3. **B13: 미지원 `currentOp`를 RPC로 간주해 원문 반환하는 기본 분기가 남습니다.**

   **확인:** [설계서:100](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:100)은 DB·HTTP 외 값을 그대로 둡니다. 수신 코드는 `o`를 임의 문자열로 받아 길이만 제한하며, 종류를 검증하지 않습니다. [ActiveRequestListIngestor.java:147](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:147)

   **추론:** 다른 송신자가 `o="SELECT 'kim@example.com'"`을 보내면 DB·HTTP 분기에 들어가지 않아 적재·비관리자 REST·SSE 모두에서 그대로 남습니다. 1차 🔴2의 **판정 불가 값 방어**는 아직 충족하지 못합니다.

   **설계 변경:** `RPC`도 명시적으로 식별·검증하고, 알 수 없는 접두나 형식은 안전한 대체값으로 처리하세요. 정상 확장의 세 종류만 가정하려면 그 제약을 BE 수신 검증으로 강제해야 합니다.

4. **B13: percent-encoding된 경로는 추가한 이메일 규칙을 우회합니다.**

   **확인:** [설계서:101](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:101)은 실제 `@`와 특정 토큰 패턴만 검사합니다. 확장도 경로를 디코딩하지 않고 구간별로 검사합니다. [PathMasker.java:21](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/export/PathMasker.java:21)

   **추론:** `/users/kim%40example.com`은 `@`가 없고, 숫자·hex·UUID도 아니며, 해당 구간이 24자 미만이어서 그대로 통과합니다. 같은 규칙을 적재·조회·SSE에서 반복해도 결과는 같습니다.

   **설계 변경:** 구간별 percent-encoding 정규화 후 민감값을 판정하고, 잘못되거나 중첩된 인코딩의 처리도 명시하세요. `%40`, `%2540`, 인코딩된 구분자에 대한 반례 테스트가 필요합니다.

## 🟡 권장

- **§1~3을 §5와 일치시키세요.** 현재 문서에는 머리 16,384자 검사, `applyToFreeText(currentOp)`, `path` 제외라는 폐기된 방안이 남아 있습니다. §5가 대체하는 범위를 명시하거나 본문을 갱신하는 편이 안전합니다.
- **배치 종료는 삭제 건수가 아닌 후보 소진으로 정의하세요.** 첫 묶음이 모두 PENDING이라 삭제가 0건이어도 뒤 후보를 계속 검사해야 합니다. `lastId`도 삭제된 마지막 행이 아니라 조회한 후보의 마지막 ID여야 합니다. [설계서:22](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:22), [설계서:109](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:109)
- **SQL 방언 한계를 명시하세요.** 작은따옴표 처리만으로 PostgreSQL dollar-quoted 문자열이나 비SQL DB 명령까지 가려지지는 않습니다. 확장은 `db.query.text`·`db.statement`를 DB 종류와 무관하게 설명에 넣습니다. 이번 범위에서 지원할 문법과 미지원 문법의 대체값을 정하는 것이 좋습니다. [ChildOperationDescription.java:38](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/export/ChildOperationDescription.java:38)

## 🟢 확인된 것

| 1차 필수 지적 | §5(v2) 판단 |
|---|---|
| 🔴1 초과 자유 텍스트 우회 | `applyToFreeText`의 무조건 `UNMASKABLE` 전환으로 해소. 스택 프레임 보존은 위 보완 필요 |
| 🔴2 `currentOp` 휴리스틱·절단 | DB 분기의 무조건 마스킹·닫히지 않은 작은따옴표 처리로 해당 반례 해소. 미지원 형식은 보완 필요 |
| 🔴3 삭제·재시도·재조정 경합 | 잠금 후 상태 재검증으로 PENDING 삭제 위험을 방어하는 방향은 타당. 일괄 재시도 교착 분석은 미완료 |
| 🔴4 설정 판정·저장 원자성 | advisory xact lock 안에서 DB 값 판정·저장하는 설계로 해소 |
| 🔴5 `path` 제외 | 적재·비관리자 REST·SSE 모두 포함해 방향은 해소. 인코딩 표현 보완 필요 |

추가로 다음은 코드와 일치합니다.

- 원문 열람은 저장 설정과 독립적인 관리자 역할 판정입니다. [ApmRawTextPolicy.java:44](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmRawTextPolicy.java:44)
- 토큰 발급은 트랜잭션 안에서 `generateForIssue()`를 호출하므로, 권한 예외를 전파하면 토큰 행도 롤백할 수 있습니다. [ApmReceiveTokenService.java:216](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenService.java:216)
- 재조정의 이벤트 `FOR KEY SHARE NOWAIT`와 보존의 `FOR UPDATE SKIP LOCKED` 조합은 실제 재조정 코드와 맞습니다. [AlertChannelActivation.java:505](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:505)
- `ForbiddenError(message, ErrorCode)` 선택은 기존 HTTP 200 + body `code:403` 계약에 맞습니다. 같은 값의 설정 쓰기를 생략하는 것도 감사 정보 보존에 적절합니다.

## 판단 요청 답

1. **`resolved_at` 기준 400일은 타당합니다.** 해소 직후 이력이 사라지는 문제를 피합니다. 400일 자체는 제품 정책 선택입니다. 미완료 통지 제외는 잠금 후 재검증까지 포함해야 하며, 일괄 재시도 교착은 추가 보완해야 합니다.

2. **머리 16,384자 방식은 폐기하는 것이 맞습니다.** §5.1의 자유 텍스트 `UNMASKABLE` 방식을 채택하세요. 스택 진단 정보는 접두가 아닌 전체 프레임 형식을 검증한 경우에만 남겨야 합니다.

3. **`core/security` 위치와 SSE 항상 마스킹에 동의합니다.** 실제 여러 메뉴가 소비하며 `core → trace` 의존도 피합니다. 일반적인 메뉴 간 직접 import 금지 ArchUnit 규칙은 확인되지 않았고, 특정 경계에 대한 규칙이 존재합니다. 공유 SSE payload를 만들 때 사본을 가리는 설계가 맞습니다. [CLAUDE.md:96](/C:/worktrees/apm-c05-followup/CLAUDE.md:96), [ApmArchiveGateArchTest.java:140](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/core/batch/archive/ApmArchiveGateArchTest.java:140)

4. **`path`도 서버 방어가 필요합니다.** 정상 확장은 쿼리스트링을 제거하지만, 경로 내 개인정보·다른 송신자·과거 저장값까지 보장하지 않습니다. §5.2의 적용 범위에 인코딩 정규화를 추가해야 합니다.

5. **`maskingReduced`까지 관리자 권한으로 묶는 것이 맞습니다.** 실제 대상은 `attributes/drop`·`redaction/pii` 기본 규칙 제외이며, `filterMetrics` 제외는 해당 플래그를 켜지 않습니다. 일반적인 메트릭 수집 조정까지 관리자 전용으로 넓히는 설계는 아닙니다. [ApmCollectorConfigGenerator.java:394](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigGenerator.java:394)
