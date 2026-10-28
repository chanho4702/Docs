- M1 · 필수 · src/pages/application-monitoring/services/customMetricSeries.ts:100; src/__tests__/apmCustomMetricDisplay.test.ts:264 · 등록 시각이 `from`보다 앞이지만 승격된 해상도의 동일 생성 칸 안에 창 전체가 들어간 경우를 `not_received`로 오판한다 · BE는 창 전체 격자를 `points`로 반환하므로, 짧은 과거 창이 5m/1h로 승격되면 모든 `points[].ts < ruleCreatedAtMs`이면서 `ruleCreatedAtMs < from`일 수 있다. 이는 다음 온전한 칸이 아직 창에 없다는 뜻인데 `created >= from` 조건 때문에 탈락하여 “미수신”과 설치 가이드가 노출된다. 기존 테스트의 `points: []`는 빈 칸도 점으로 주는 계약 §4 및 BE 응답 형태를 재현하지 못한다 · `points.length > 0`이고 `ts >= ruleCreatedAtMs`인 점이 없으면 `created >= from` 여부와 관계없이 `before_rule`로 판정하되, `to <= oldestAvailableMs`인 전체 보존 밖 판정은 우선 유지한다. 승격된 5m/1h 격자의 점이 모두 등록 시각 이전인 회귀 테스트를 추가한다.

epoch `ceil` 잔재: 이상 없음 — 실행 코드의 `Math.ceil(createdAt/step)`은 제거됐고, 현재 테스트도 서버가 준 `points[].ts`를 사용한다. 관련 문구는 제거 배경을 설명하는 주석뿐이다.

## 판정

수정 후 재검수

응답 `points[].ts`로 경계를 판정하는 방향 자체는 계약 §4와 일치한다.  
다만 승격된 짧은 과거 창에서 정상적인 등록 전 구간을 미수신으로 안내하는 회귀가 남았다.

확인하지 못한 것:

- 지시대로 빌드, TypeScript 검사, Jest 및 npm 명령은 실행하지 않았다.
- 브라우저와 실제 FE-BE 통합 동작은 실행 검증하지 않았다.
- 대상 신규 파일이 Git 기준 untracked라 v3→v4 변경만을 기계적으로 diff하지 못하고, v3 검수서·요청서와 현재 파일을 대조했다.
- 지시된 `C:\worktrees\COLLAB.md`가 없어 협업 상태 첫 줄은 확인하지 못했다.