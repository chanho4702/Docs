## 판정

**조건부 승인**

구현상 `OffsetBasedPageRequest` 교체와 V75 인덱스는 올바릅니다. 다만 테스트 하나가 기존 결함을 검출하지 못하고, A안 및 stuck 조회의 문서 계약이 실제 동작과 아직 충돌합니다. 아래 필수 항목 반영 후 승인 가능합니다.

## 🔴 필수

1. `arbitraryOffsetIsExact`가 임의 offset을 검증하지 못합니다.

   [ApmAlertEventSearchIT.java](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertEventSearchIT.java:97)의 `limit=1, offset=1`은 배수 관계입니다. 기존 결함 코드 `PageRequest.of(skip / size, size)`도 정확히 offset 1을 사용하므로 테스트가 그대로 통과합니다.

   - `limit=2, offset=1`처럼 비배수 조합으로 바꿔야 합니다.
   - 요청 걸림도 [ApmStuckRequestQueryServiceTest.java](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/query/ApmStuckRequestQueryServiceTest.java:46)에서 `limit=20, offset=25` 호출 후 전달된 `Pageable.getOffset()==25`와 응답 메타 `offset==25`를 고정하는 것이 필요합니다.
   - 공통 `OffsetBasedPageRequestTest`가 25/20을 검증하지만, 각 서비스가 실제로 이 구현을 사용한다는 회귀까지는 막지 못합니다.

2. A안 문구 정정이 불완전합니다.

   A안 자체는 받아들일 수 있지만 다음 설명은 여전히 “규칙 삭제 후 이벤트가 남는다”고 주장하여 V38의 `ON DELETE CASCADE` 및 새 DTO·계약 문구와 정면으로 충돌합니다.

   - [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:565): 규칙 삭제 후 이벤트가 영원히 남는다는 설명
   - [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:602): 서비스 삭제와 달리 규칙 삭제는 이벤트를 남긴다는 설명
   - [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:810): 해소되지 않은 유령 이벤트가 남는다는 설명
   - [ApmAlertRuleController.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/ApmAlertRuleController.java:164)와 관련 테스트 표시명도 같은 전제를 사용합니다.

   `resolveOpenEvents()` 유지 여부와 별개로, 삭제가 커밋되면 해당 이벤트도 CASCADE 삭제된다는 사실에 맞춰 설명을 정리해야 합니다.

3. `/stuck-requests`의 OpenAPI 설명을 새 의미와 맞춰야 합니다.

   실제 쿼리와 계약서는 `open=true`일 때 창을 무시하지만, [ApmAlertRuleController.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/ApmAlertRuleController.java:328)의 `open` 설명 및 `@Operation`은 여전히 from/to가 최근 7일 창을 적용하는 것처럼 보입니다. Swagger에도 `open=true면 from/to 무시`를 명시해야 합니다.

## 🟡 권장

- stuck 변경의 알려진 호출처 부작용은 없습니다. BE 호출처는 해당 컨트롤러 한 곳이고, FE는 기본적으로 `open`을 보내지 않아 기존 기간 이력을 유지합니다. `open=1`일 때만 창 무시를 전제하며 화면 안내와 FE 테스트도 이미 그 의미를 고정합니다. 다만 오래된 열린 행과 닫힌 행을 심는 BE repository IT도 추가하면 경계가 완성됩니다.
- `tieBreaksById`는 동일 `firedAt`에서 더 큰 후삽입 ID가 먼저 오는 것을 실제로 검증하므로 의도를 고정합니다.
- `firedIndexExists`는 새 DB에 V75가 적용되고 두 DESC 열이 존재함을 검증합니다. 다만 `contains()` 두 개만으로는 다른 선두 열이 추가된 잘못된 인덱스도 통과할 수 있으므로 `(fired_at DESC, id DESC)`의 연속 순서를 검증하면 더 정확합니다.
- V75는 `open=false`의 범위·정렬과 정확히 맞습니다. `open=true`에서 V74 부분 인덱스가 실제 선택된다는 보장은 아직 없으므로, 소스의 “V74가 받는다”는 표현은 “인덱스 후보” 정도로 낮추는 편이 안전합니다.

## 🟢 참고

- 알람 이벤트와 요청 걸림 모두 `new OffsetBasedPageRequest(skip, size)`를 사용하며, `PagedListDto`도 동일한 `skip`을 반환합니다. 구현과 메타데이터는 일치합니다.
- V75 `(fired_at DESC, id DESC)`는 JPQL의 `ORDER BY firedAt DESC, id DESC`와 일치합니다.
- 로컬 `master`와 대상 워크트리의 기존 최고 migration은 V74입니다. 등록된 다른 worktree와 local Git refs까지 확인한 결과 V75는 대상 워크트리에만 있어 현재 번호 충돌은 없습니다. 병합 직전 최신 master 재확인은 필요합니다.
- 요청서에 기재된 206개 통과 결과는 확인했으며, 읽기 전용 조건에 따라 이번 검수에서는 테스트를 재실행하지 않았습니다.

## §7 답

1. 서비스 A/B 필터 IT·`from > to`·EXPLAIN은 이번 병합의 필수 조건은 아닙니다.

   - 실제 A/B 필터 IT는 권장합니다. 현재 테스트는 `serviceId=null`과 존재하지 않는 ID만 검증합니다.
   - 현재 `from > to`는 `firedAt >= from AND firedAt <= to`에 의해 빈 결과가 됩니다. 이를 오류로 거부한다는 제품 계약이 없으므로 별도 테스트가 필수는 아닙니다.
   - 수십 행 DB에서의 EXPLAIN은 순차 스캔이 정상일 수 있어 이번에 수행해도 규모 성능을 증명하지 못합니다. 대표 규모 데이터를 만든 뒤 `open=false/serviceId=null`, `open=true`, 그리고 PostgreSQL custom/generic plan을 나눠 확인하는 후속 성능 검증이 적절합니다.

2. **A안은 이번 변경에서 수용 가능하며 B안은 필수가 아닙니다.**

   V38부터 두 FK가 CASCADE였고 서비스 삭제 API도 이 파괴적 동작을 이미 명시합니다. 이번 변경이 새 데이터 손실을 도입한 것은 아니므로 조회 메뉴 작업에 FK·스냅샷 재설계를 함께 요구할 근거는 부족합니다.

   다만 사용자에게 다음 제품 영향을 명확히 보고해야 합니다.

   - 규칙 삭제 시 해당 규칙의 알람 이력이 즉시 모두 사라집니다.
   - 서비스 삭제 시 그 서비스의 규칙과 알람 이력이 모두 사라집니다.
   - 따라서 “400일 보존”은 부모 규칙·서비스가 유지되는 동안의 상한일 뿐입니다.
   - 종류·대상 변경도 삭제 후 재생성 방식이므로 운영 중 이력 단절이 실제로 발생할 수 있습니다.

   향후 “설정 삭제 후에도 장애 감사 이력을 보존한다”는 제품 요구가 확정되면 그때는 B안이 필수이며, FK 변경만이 아니라 규칙·서비스 표시값 스냅샷까지 함께 설계해야 합니다.
