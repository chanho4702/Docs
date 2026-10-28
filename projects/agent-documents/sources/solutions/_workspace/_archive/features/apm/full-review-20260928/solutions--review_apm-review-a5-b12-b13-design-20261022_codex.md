## 판정

**조건부 진행 — A5의 삭제 경합과 B12·B13의 원문 통과 경로를 설계에 보완한 뒤 구현해야 합니다.**

HEAD `1a36632` 기준 정적 검수입니다. 파일 수정·빌드·테스트 실행은 하지 않았습니다. 아래에서 **확인**은 코드 사실, **추론**은 설계 적용 시 예상되는 동작입니다.

## 🔴 필수

1. **B12: 앞 16,384자만 검사하는 방식으로는 우회를 막지 못합니다.**

   **확인:** SQL 판정은 `SELECT … FROM` 같은 키워드 쌍에 의존하고, 문자열 마스킹은 닫힌 작은따옴표를 요구합니다. 정책 적용 후 저장 길이를 자릅니다. 근거: [ApmSqlMasker.java:118](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:118), [문자열 정규식:41](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:41), [ApmSpanAttrAllowlist.java:318](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSpanAttrAllowlist.java:318).

   **추론:** `SELECT 'kim@example.com' /* 긴 주석 */ FROM users`에서 `FROM`이 절단 지점 뒤에 있으면, 잘린 머리는 SQL로 판정되지 않아 **앞부분 이메일도 그대로 남습니다**. 16,384자 경계를 가로지르는 긴 리터럴도 같은 문제가 있습니다. [설계서:45](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:45)의 “위험 위치가 저장 범위 밖”이라는 설명은 성립하지 않습니다.

   **변경:** 초과 입력은 백로그 원안대로 `UNMASKABLE`로 처리하거나, 잘린 키워드·미완성 리터럴에서도 원문을 반환하지 않는 처리를 설계해야 합니다. 짧고 닫힌 이메일 리터럴을 사용하는 위 반례도 테스트에 넣어야 합니다.

2. **B13: `currentOp`에 `applyToFreeText`만 적용하면 ‘항상 MASKED’여도 원문이 통과합니다.**

   **확인:** `SELECT 'kim@example.com'`처럼 `FROM` 없는 SQL은 기존 휴리스틱에 잡히지 않습니다. BE는 `currentOp`를 200자로 자르고, 정상 확장도 설명을 160자로 자릅니다. 근거: [ApmSqlPolicy.java:120](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:120), [ActiveRequestListIngestor.java:147](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:147), [ChildOperationDescription.java:83](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/export/ChildOperationDescription.java:83).

   **추론:** `DB postgresql SELECT 'kim@example.com'`이나 닫는 따옴표가 이미 잘린 SQL은 제안한 적재·REST·SSE 마스킹을 통과합니다.

   **변경:** DB 작업은 SQL 후보라는 전제로 처리하고, 미완성 리터럴·판정 불가 값은 안전한 대체값으로 바꿔야 합니다. HTTP 작업에는 URL 처리가 필요합니다. **적재 시 마스킹 후 절단**, **비관리자 조회·SSE에서도 이미 절단된 과거 값 방어**를 각각 명시해야 합니다.

3. **A5: `NOT EXISTS(PENDING, PROCESSING)`만으로 재시도·재조정과의 경합을 막을 수 없습니다.**

   **확인:** `DEAD·SKIPPED`는 수동 재시도로 `PENDING`으로 돌아갑니다. 재조정도 닫힌 이벤트에 새 통지를 만들 수 있으며, 이벤트 삭제는 통지를 CASCADE 삭제합니다. 근거: [ApmAlertNotificationStore.java:359](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:359), [reset:446](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:446), [AlertChannelActivation.java:521](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:521), [V84:30](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V84__apm_alert_notification.sql:30).

   **추론:** 삭제 문장이 종료 상태를 관측한 뒤 재시도가 `PENDING`을 커밋하면, 삭제가 새 대기 통지를 함께 지울 수 있습니다. 이벤트 행 잠금만으로 기존 통지의 상태 변경까지 막지는 못합니다.

   **변경:** 삭제·재시도·재조정 사이의 잠금 순서와 삭제 직전 재검증을 설계에 확정해야 합니다. PG IT도 정적인 상태별 테스트 외에 **재시도/통지 생성과 삭제의 동시 실행**을 포함해야 합니다.

4. **B13: ‘같은 값 재전송 허용’은 캐시가 아닌 DB 상태를 기준으로 원자적으로 판정해야 합니다.**

   **확인:** 기존 전이 계산은 `keepRawSql()`·`maskSql()`을 사용하고, 두 값은 30초 캐시에서 읽습니다. 쓰기는 그 뒤 별도로 수행합니다. 근거: [ApmSettingService.java:269](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:269), [캐시 조회:426](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:426), [ApmSettingController.java:117](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/setting/ApmSettingController.java:117).

   **추론:** 이 계산을 권한 가드로 재사용하면, 다른 노드에서 관리자가 원문 보관을 껐는데도 이전 `true`를 가진 노드가 비관리자의 `true` 요청을 재전송으로 오인해 다시 켤 수 있습니다. 캐시를 없애도 조회와 저장 사이의 동시 변경은 남습니다.

   **변경:** 관련 설정 행의 잠금 또는 조건부 갱신으로 **판정과 저장을 같은 원자적 연산**으로 묶고, 거부되면 다른 필드도 저장하지 않는 규칙을 명시해야 합니다.

5. **B13: `path`를 제외한 채 원문 방어 완료로 처리하면 안 됩니다.**

   **확인:** 정상 확장은 쿼리스트링을 제거하지만, 숫자·긴 hex 형태가 아닌 경로 구간은 남깁니다. BE는 받은 `p`를 길이만 제한하고, 장부와 SSE에 그대로 전달합니다. 근거: [PathMasker.java:21](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/export/PathMasker.java:21), [구간 처리:30](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/export/PathMasker.java:30), [ActiveRequestListIngestor.java:145](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:145), [LiveSpanRuntimePayload.java:55](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:55).

   **추론:** 정상 확장에서도 `/users/kim@example.com`은 남고, 다른 송신자가 보낸 `/reset?token=secret`도 현재 BE에서는 통과합니다.

   **변경:** BE의 쿼리 제거·경로 정규화와 과거 장부의 비관리자 응답 처리 정책을 포함해야 합니다. 확장 마스킹을 신뢰한다는 설명만으로는 B12와 동일한 서버 방어 기준을 충족하지 못합니다.

## 🟡 권장

- **배치 트랜잭션을 구체화하세요.** `TransactionTemplate` 사용만으로 묶음별 독립 커밋이 보장되지는 않습니다. 외부 트랜잭션 유무·전파 방식·회차 동안 고정할 cutoff·삭제 순서를 명시하는 편이 좋습니다. 근거: [설계서:22](/C:/solutions/_workspace/features/apm/full-review-20260928/devdesign_apm-review-a5-b12-b13-20261022.md:22).

- **값이 같은 설정은 쓰기를 생략하세요.** 현재는 같은 값도 `updatedBy`를 덮어씁니다. 비관리자 재전송을 허용하면 “원문 보관을 켠 관리자”의 식별 정보가 바뀔 수 있습니다. 근거: [ApmSettingService.java:272](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:272).

- **403 예외 생성 방식을 명시하세요.** `ApiError(ErrorCode)`의 기본 상태는 400입니다. `ForbiddenError(message, code)` 또는 명시적인 `HttpStatus.FORBIDDEN`을 사용해야 요구한 envelope가 됩니다. 근거: [ApiError.java:16](/C:/worktrees/apm-c05-followup/engine-api/src/main/java/com/dmove/moveseye/common/exception/ApiError.java:16), [ForbiddenError.java:35](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/common/exception/ForbiddenError.java:35).

## 🟢 확인된 것

- A5 보존 단계는 현재 없으며, 기존 `deleteByFiredAtBefore`를 그대로 사용하면 열린 이벤트도 삭제 대상이 됩니다. 새 조건부 삭제가 필요하다는 방향은 맞습니다. [ApmAlertEventRepository.java:148](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEventRepository.java:148)
- 원문 열람 자격은 `userRole`의 `ADMIN·SUPER_ADMIN` 기준이며, 저장 설정과 독립적으로 판정합니다. 같은 권한 축을 사용하는 방향은 맞습니다. [ApmAccessChecker.java:187](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmAccessChecker.java:187), [ApmRawTextPolicy.java:44](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmRawTextPolicy.java:44)
- 토큰 동시 발급 경로도 `generateForIssue`를 호출합니다. 여기에 권한을 전달해야 하며, 현재 발급 메서드에는 트랜잭션이 있어 생성 거부를 전체 롤백으로 연결할 수 있습니다. [ApmReceiveTokenService.java:216](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenService.java:216)
- HTTP 200 + body `code:403`은 기존 예외 처리 계약과 맞습니다. [GlobalExceptionHandler.java:144](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/common/exception/GlobalExceptionHandler.java:144)

## 판단 요청 답

1. **`resolved_at` 기준 400일: 타당합니다.** 오래 열린 장애도 해소 후 보존 기간을 확보합니다. 400일 자체는 기존 장기 보존과 맞춘 정책 선택입니다. 미완료 통지 제외는 **claim 단독에는 적절하지만 재시도·재조정까지 포함하면 불충분**합니다.

2. **머리 16,384자 방식: 채택하지 않는 편이 좋습니다.** 키워드 쌍과 리터럴 경계가 잘려 원문이 남습니다. 우선 `UNMASKABLE`로 닫고, 진단 정보 보존은 프레임 등 안전하게 분리할 수 있는 부분에 한정하는 것을 권합니다.

3. **직접 import를 막는 일반적인 메뉴 간 ArchUnit 규칙은 현재 확인되지 않았습니다.** `collector → trace`를 곧바로 빌드 위반이라고 판단할 근거는 없습니다. 다만 이제 여러 메뉴가 사용하는 원문 정책이므로 `core`의 공통 정책으로 승격하는 편이 타당합니다. `core → trace` 의존을 만들면 안 됩니다. **SSE 항상 마스킹은 맞으며**, 공유 원본 버퍼를 변경하지 않고 직렬화할 값을 가려야 합니다. 근거: [CLAUDE.md:96](/C:/worktrees/apm-c05-followup/CLAUDE.md:96), [ApmArchiveGateArchTest.java:140](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/core/batch/archive/ApmArchiveGateArchTest.java:140), [공유 snapshot:461](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java:461).

4. **`path`도 서버 측 방어가 필요합니다.** 정상 확장은 쿼리스트링을 제거한다는 점은 확인됐습니다. 그러나 경로 내 개인정보와 다른 송신자의 입력, 과거 저장값은 별도 처리해야 합니다.

5. **`maskingReduced`까지 관리자 축으로 묶는 것이 맞습니다.** 실제 대상은 `attributes/drop`·`redaction/pii` 기본 규칙의 제외입니다. `filterMetrics` 제외는 이 플래그를 켜지 않으므로 일반적인 수집 범위 조정까지 관리자 전용으로 넓히지는 않습니다. 근거: [ApmCollectorConfigGenerator.java:394](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigGenerator.java:394), [filterMetrics 처리:419](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigGenerator.java:419).
