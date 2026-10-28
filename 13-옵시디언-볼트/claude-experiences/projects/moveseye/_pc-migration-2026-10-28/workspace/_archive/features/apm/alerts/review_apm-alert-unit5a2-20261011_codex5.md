## 판정

**승인**

4차 🔴인 tag lost update는 충분히 해소됐습니다. `item.update`가 `itemid`와 `status`만 전송하므로 외부 태그를 덮거나 제거된 owner 태그를 복구하지 않습니다. Zabbix 7.0도 전달하지 않은 속성은 유지한다고 명시합니다. [Zabbix 7.0 item.update 문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/item/update)

단위 5a-2 승인 판정이며, 합의대로 이 브랜치의 단독 배포를 승인하는 것은 아닙니다.

## 🔴 필수

없음.

## 🟡 권장

없음.

## 이관 목록

신규 없음. 이미 합의된 5b·6a 항목은 반복하지 않습니다.

## 🟢 참고

- 실제 갱신 payload는 `itemid`, `status`만 포함합니다. [ZabbixAlertBridge.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1431)
- 외부 태그 추가·변경 보존과 owner 제거 후 비복구가 각각 경합 테스트로 고정됐습니다. [ApmZbxCommandExecutionIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:493), [동일 파일](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:513)
- 자동 경로에 `item.delete`나 `tags` 갱신은 남아 있지 않습니다. owner 제거 경합에서 일어날 수 있는 동작도 되돌릴 수 있는 비활성화뿐이며, 태그 복구·객체 삭제는 없습니다.
- 운영 가이드는 정리 대상을 호스트·owner·비활성·참조 없음으로 한정하고, 삭제 직전 trigger 재조회와 0건이 아닐 때 중단하도록 정정됐습니다. [운영 가이드](/C:/solutions/_workspace/guides/ops_apm-alert-item-cleanup.md:16), [삭제 직전 재확인](/C:/solutions/_workspace/guides/ops_apm-alert-item-cleanup.md:71)
- r4→r5 변경은 태그 전체 교체 제거, 이에 따른 판별·가이드·경합 테스트 갱신으로 제한됩니다. 정확 식별, ID 화해와 잠금 순서, 선형화 재검증, 결과 CAS, 리스, 워커, 삭제 경로 선적재에는 새 결함이 발견되지 않았습니다.
- 요청서의 ExecutionIT 30건·DeletePathIT 8건·BridgeTest 및 m12 결과는 변경을 충분히 겨냥합니다. 읽기 전용 조건 때문에 테스트·뮤테이션은 재실행하지 않았습니다.

## 의견 요청 답

1~4는 이전 답으로 갈음합니다. 이번 5차 변경으로 기존 답을 수정할 사유는 없습니다.
