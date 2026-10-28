## 판정

**조건부 승인**

페이지 offset·Swagger·인덱스 관련 2차 지적은 제대로 반영됐습니다. 다만 CASCADE 정정 문구에 실제로 존재하지 않는 “해소 push”가 남아 있어 문서 정합성 수정이 필요합니다.

## 🔴 필수

- 삭제 전 `resolveOpenEvents()`가 “해소 push를 태운다”는 설명은 실제 코드와 다릅니다.

  [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:548)의 `resolveOpenEvents()`는 `event.resolve(now)`와 `events.saveAll(open)`만 수행합니다. `pushUnmeasurableForAll()`, `bridge.pushUnmeasurable()` 등 Zabbix push 호출은 없습니다. 이후 `rules.delete(rule)`가 실행되면 V38의 FK CASCADE로 이벤트 행도 삭제됩니다. Zabbix 측 동작은 recovery push가 아니라 `bridge.removeObjects*()`를 통한 트리거·아이템 삭제입니다.

  따라서 다음 4곳의 CASCADE 설명 자체는 정확하지만, “먼저 닫는 이유가 해소 push”라는 취지는 정확하지 않습니다.

  - [ApmAlertRuleController.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/ApmAlertRuleController.java:164)
  - [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:565)
  - [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:603)
  - [ApmAlertService.java](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:811)

  최소 조치는 “해소 push” 표현을 삭제하고, `resolveOpenEvents()`가 로컬 `resolved_at` 갱신·건수 집계만 수행하며 그 행은 곧 CASCADE 삭제된다는 실제 동작으로 설명을 맞추는 것입니다. 실제 recovery push가 의도였다면 주석 수정이 아니라 구현·테스트 보완이 필요합니다.

## 🟡 권장

- stuck repository IT 미추가는 **병합 차단 사유가 아닙니다**. 현재 JPQL은 `openOnly=true`일 때 기간 조건을 우회하도록 명확히 변경됐고, Controller의 `@param open`과 `@Operation`도 같은 계약을 설명합니다.
- 다만 오래된 열린 행과 오래된 닫힌 행을 함께 심는 PostgreSQL IT가 없으므로, 향후 쿼리 수정 시 의미가 퇴행할 여지는 남습니다. 후속 테스트로 추가하는 것을 권장합니다.

## 🟢 참고

- `ApmAlertEventSearchIT.arbitraryOffsetIsExact`는 옛 코드에서 반드시 실패합니다. 창 안 정렬 결과가 `recentOpen`, `recentClosed`, `third`일 때 옛 `PageRequest.of(1 / 2, 2)`는 offset `0`이어서 1·2번째 행을 반환하지만, 테스트는 2·3번째인 `recentClosed`, `third`를 요구합니다.
- `ApmStuckRequestQueryServiceTest.arbitraryOffsetReachesRepository`도 옛 코드에서 반드시 실패합니다. `PageRequest.of(25 / 20, 20)`의 실제 offset은 `20`이지만 테스트는 repository에 전달된 `Pageable.getOffset()==25`를 단언합니다.
- 인덱스 테스트는 `"(fired_at DESC, id DESC)"` 연속 문자열을 검사하므로 열 순서를 고정합니다.
- V75 및 repository 주석은 V74 부분 인덱스를 “후보”로 낮추고 실제 선택은 규모 데이터의 `EXPLAIN` 전에는 보장하지 않는다고 명시해 적절합니다.
- 읽기 전용 조건에 따라 테스트는 재실행하지 않았으며, 위 실패 여부는 테스트 데이터·정렬·`PageRequest` 계산을 코드에 대입해 확인했습니다.
