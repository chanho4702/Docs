## 판정

**조건부 승인**

JPQL의 `openOnly`·`serviceId` 분기, 최신순 안정 정렬, `total` 계산, `apm.view` 권한 완화 자체는 타당합니다. 다만 다음 세 항목은 병합 전에 결정·반영해야 합니다.

## 🔴 필수

1. 임의 `offset`이 잘못 적용됩니다.

   - 근거: [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:296)의 `PageRequest.of(skip / size, size)`는 `limit=20, offset=25`를 실제 `offset=20`으로 내림합니다.
   - `PagedListDto`에는 요청값 `offset=25`를 반환하므로 응답 메타데이터와 실제 항목도 불일치합니다.
   - “FE가 limit 배수만 보낸다”는 공개 API의 `offset` 계약을 제한하는 근거가 되지 않습니다.
   - 수정안: 저장소에 이미 있는 [OffsetBasedPageRequest.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/common/response/OffsetBasedPageRequest.java:12)를 사용하십시오.
     `events.search(..., new OffsetBasedPageRequest(skip, size))`
   - `limit=20, offset=25`가 정확히 26번째 행부터 반환하는 테스트를 추가해야 합니다. 같은 결함이 `ApmStuckRequestQueryService`에도 있으므로 별도 후속 수정이 필요합니다.

2. 전 서비스 기간 조회를 위한 `fired_at` 선두 인덱스가 필요합니다.

   - 근거: [V38__apm_p1.sql](C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V38__apm_p1.sql:402)에 있는 인덱스는 `(service_id, fired_at)`입니다. `serviceId=null`인 전체 서비스 조회에서는 `fired_at`이 두 번째 열이므로 일반적인 범위 스캔용 선두 인덱스가 아닙니다.
   - [V74__apm_alert_event_open_unique.sql](C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V74__apm_alert_event_open_unique.sql:49)은 `(rule_id, service_id) WHERE resolved_at IS NULL`인 유일성 인덱스라 `open=false`의 `fired_at` 범위 조회를 지원하지 않습니다. `open=true`에서도 최신순 정렬용 인덱스는 아닙니다.
   - [ApmAlertEvent.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEvent.java:40)에 따르면 설계상 보존은 400일이지만 현재 삭제 호출처가 없어 실제로는 무기한 누적됩니다.
   - 추정: 5분 평가마다 상태가 닫힘/재발화를 반복하는 최악의 경우 한 규칙·서비스 쌍당 400일에 최대 약 115,200행이며, 100개 쌍이면 약 1,152만 행입니다. 실제 발화량은 이보다 낮을 가능성이 크지만 자동 갱신 화면을 순차 스캔에 의존시키기는 어렵습니다.
   - 수정안: 현재 최고 버전이 V74이므로 새 V75+ 마이그레이션을 추가하십시오.

     ```sql
     CREATE INDEX IF NOT EXISTS apm_alert_event_fired_id_idx
         ON apm_alert_event (fired_at DESC, id DESC);
     ```

   - `openOnly=false/serviceId=null` 및 `openOnly=true`를 실제 바인딩한 `EXPLAIN (ANALYZE, BUFFERS)`로 계획을 확인해야 합니다. 파라미터 OR 때문에 안정적으로 인덱스를 고르지 못하면 `searchHistory`와 `searchOpen` 쿼리를 분리하는 편이 안전합니다.

3. “삭제된 규칙·서비스의 이력” 계약을 확정해야 합니다.

   - DTO 조립 자체는 [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1449)에서 규칙·서비스가 없을 때 `ruleUid`, `kind`, `thresholdUnit`, `serviceUid`, `serviceName`을 모두 null로 안전하게 처리합니다.
   - 그러나 [V38__apm_p1.sql](C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V38__apm_p1.sql:390)의 두 FK가 모두 `ON DELETE CASCADE`이므로 정상적인 삭제에서는 참조만 빠지는 것이 아니라 이벤트 행 자체가 사라집니다. [ApmAlertEventDto.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertEventDto.java:25)의 “규칙이나 서비스가 먼저 지워지면 필드가 null”이라는 설명과 실제 스키마가 다릅니다.
   - 수정안은 둘 중 하나를 명시적으로 선택해야 합니다.
     - 삭제 시 이력도 삭제하는 정책이면 DTO·계약 문서의 null 설명과 “400일 이력” 범위를 바로잡습니다.
     - 장애 이력을 보존해야 한다면 새 마이그레이션으로 FK 정책과 nullable 여부를 바꾸고, `ruleUid/kind/thresholdUnit/serviceUid/serviceName` 스냅샷을 이벤트에 보존해야 합니다. 이 경우 `findAllById`에 null ID를 넘기지 않도록 조립 코드도 수정해야 합니다.

## 🟡 권장

- [ApmAlertEventRepository.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEventRepository.java:93): JPQL 분기는 정확합니다.
  - `openOnly=false`: 시간 창 적용, 열림·닫힘 모두 포함.
  - `openOnly=true`: 시간 창 무시, `resolvedAt IS NULL`만 포함.
  - `serviceId=null`: 서비스 행과 수집기 축 `service_id IS NULL`을 모두 포함.
  - 다만 OR 파라미터 쿼리는 데이터 규모에서 실행 계획을 반드시 실측해야 합니다.

- [ApmAlertEventRepository.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEventRepository.java:96): `firedAt DESC, id DESC`라 동률까지 안정적으로 정렬됩니다. `Page#getTotalElements()` 사용도 맞습니다.

- `open=true` 의미는 `/stuck-requests`와 맞추는 편이 낫습니다. 현재 진행 중인 요청이 시간 창보다 오래 지속되면 stuck 화면에서도 사라질 수 있습니다. 1초 감시기의 `LOST` 정리는 발생 가능성을 낮출 뿐 의미적 보장은 아닙니다. 후속으로 stuck 쿼리도 열린 행은 창을 무시하거나, UI/API에서 “창 내 미해소”라는 다른 의미를 명시하십시오.

- [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1451): 열린 여러 행의 `durationSec` 계산 시 `LocalDateTime.now()`를 행마다 호출합니다. 페이지 조립 전에 기준 시각을 한 번 잡으면 동일 응답 내 지속시간 기준이 일관됩니다.

## 🟢 참고

- 권한 완화는 기존 원칙과 충돌하지 않습니다. [ApmAccessChecker.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmAccessChecker.java:116)는 “관리 화면 데이터”를 `edit` 축으로 설명합니다. 반면 발화 이력은 관측 장부입니다.
- 이벤트 DTO의 `value`, `kind`, `thresholdUnit`, `ruleUid`는 비밀값이 아닙니다. `ruleUid`로 수정 API를 호출해도 `edit` 검사가 다시 적용됩니다. `value`는 관측값이며 임계 자체는 포함되지 않습니다.
- 더구나 `apm.view` 사용자는 기존 [ApmAlertRuleController.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/ApmAlertRuleController.java:281)의 서비스별 적용 규칙 API를 통해 실제 `threshold`까지 볼 수 있습니다. 이번 변경이 새로 임계 정책을 누설한다고 보기는 어렵습니다.
- 컨트롤러 클래스 자체에 이미 [ApmAlertRuleController.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/ApmAlertRuleController.java:83) `@VisitorIdCheck`가 적용되어 있습니다. `/stuck-requests`의 메서드 단위 annotation은 중복입니다. `/alert-events`에 다시 붙일 필요가 없습니다.
- 09-30 결정과 충돌하지 않습니다. 변경 범위에 outbox, 독자 알림 채널, 신규 Zabbix bridge 동작은 없으며 기존 `zbxEventId` 응답만 유지합니다.
- `git diff --check`는 이상이 없었습니다. 파일은 수정하지 않았습니다.

## §3 질문 답

1. **`alert-events open=true`의 창 무시는 타당합니다.** 현재 장애 상태를 묻는 조회라 발화 시각 때문에 숨기면 안 됩니다. 다만 같은 “열린 것만” 명칭을 쓰는 stuck가 창을 유지하는 것은 일관성이 부족합니다. 장기 진행 요청도 숨을 수 있으므로 stuck 역시 창 무시로 맞추거나 명칭을 분리하는 것을 권장합니다.

2. **`/alert-events`의 `apm.view` 전환을 승인합니다.** 이벤트 DTO는 운영 관측 정보이며 직접적인 비밀이나 수정 권한을 제공하지 않습니다. 서비스별 적용 규칙 API가 이미 view 사용자에게 실제 임계를 내리므로 새로운 정책 누출도 아닙니다.

3. **JPQL boolean/null 분기는 맞지만 인덱스는 불충분합니다.** `(service_id, fired_at)`는 전체 서비스 기간 조회에 필요한 `fired_at` 선두 인덱스가 아닙니다. V75+ 인덱스가 필요하며, OR 파라미터 쿼리는 실제 실행 계획 확인이 필요합니다.

4. **`PageRequest.of(skip/size, size)` 절삭은 승인할 수 없습니다.** FE 관례와 무관하게 API가 임의 offset을 받습니다. 기존 `OffsetBasedPageRequest`로 교체해야 합니다.

5. **추가 `@VisitorIdCheck`는 필요 없습니다.** 클래스 레벨에서 이미 `/alert-events`를 포함한 모든 메서드에 적용됩니다. stuck의 메서드 annotation이 중복입니다.

## 테스트 공백

- `limit=20, offset=25` 같은 비배수 offset 검증이 없으며 현재 실패합니다.
- 동일 `firedAt` 두 행의 `id DESC` 동률 정렬 테스트가 없습니다.
- 실제 존재하는 서비스 A/B를 심어 서비스 필터가 다른 서비스 및 수집기 축을 제외하는 테스트가 없습니다.
- `from`·`to` 경계값의 포함 여부와 `from > to` 동작 테스트가 없습니다.
- 서비스 계층의 기본 7일, limit 기본값·상한 500, 음수 offset 보정 테스트가 없습니다.
- 규칙·서비스가 hydration 사이에 삭제되는 경합 또는 삭제 정책 자체를 검증하는 테스트가 없습니다.
- `ApmAlertRuleMvcTest`는 standalone MockMvc라 실제 `VisitorIdCheckInterceptor` 적용을 검증하지 않습니다. 클래스 annotation 존재 여부를 별도 통합 테스트로 고정하는 것이 안전합니다.
- 신규 인덱스 존재 여부와 대표 쿼리 실행 계획 검증이 없습니다.
- 요청서에 적힌 `ApmAlertRuleMvcTest`, PG IT 3/3 및 기존 store IT 6/6 결과는 확인했지만, 읽기 전용 요구에 따라 이번 검수에서 테스트를 재실행하지는 않았습니다.
