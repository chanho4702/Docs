---
tags: [moveseye, apm, review]
updated: 2026-10-20
---

# APM 커스텀 메트릭 후속 검수

관련: [[2026-10-19-zm155-apm-custom-metric-allowlist]], [[aggregation-null-vs-zero]]

BE a9080eb / FE 258d747의 수신→저장→조회→표시를 검토했다. 상세는 `C:/solutions/_workspace/features/apm/metric-allowlist/review_zm-155-followup-20261020.md`.

- 실제 FE 표시 함수 실행: COUNTER `{count:0,sum:0.2}` 및 `{count:0,sum:0}`가 null로 사라진다. BE는 count를 증가량 반올림으로 만든다. **관측 여부와 측정량을 같은 count로 표현하지 말 것.**
- 자리 원장은 7일에 만료되지만 롤업은 더 오래 남는다. 동일 규칙에서 새 kind를 허용한 뒤 현재 kind로 과거 전체를 해석하면 과거 차트가 바뀐다. **자원 제한 메타데이터와 측정 의미 메타데이터의 수명을 분리할 것.**
- 수신 Row에 unit이 있어도 실제 SQL 저장·DTO에서 빠지면 단위는 보존되지 않는다. 종류 일치만으로 같은 의미의 지표라고 판단할 수 없다.
- 구현 변경 없음. 전체 테스트·실 DB 시간 경과·브라우저 검증 미실시. 두 번째·세 번째 항목은 코드 경로 근거이며 실환경 재현과 구분한다.
