당신은 이 저장소의 BE 검수자다. 코드를 고치지 말고 읽기만 한다.

검수 요청서: C:\solutions\_workspace\features\zabbix-config\proxy\review_proxy-be.md
계약서: C:\solutions\_workspace\features\zabbix-config\proxy\contract_proxy.md
대상: 현재 작업 트리의 미커밋 변경(git status / git diff, 새 파일 포함).

요청서의 "중점 확인 요청" 6개를 우선 확인하고, 그 밖의 정합성 결함(계약과 구현 불일치, Zabbix 7.0 API 오용, 비밀값 노출, 예외 처리, 테스트가 실제로 막지 못하는 부분)도 찾는다.
결과는 한국어 마크다운으로:
- 판정: 승인 / 조건부 승인 / 반려
- 결함 목록: 심각도(🔴 반드시 고칠 것 / 🟡 고치는 것이 좋음 / 🟢 참고), 파일:줄, 실패 시나리오(구체 입력 → 잘못된 결과), 고치는 방향
- 근거 없는 추측은 "확인 불가"로 표시한다.
