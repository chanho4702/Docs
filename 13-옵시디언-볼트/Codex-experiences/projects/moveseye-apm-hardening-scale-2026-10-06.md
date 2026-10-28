---
tags: [moveseye, apm, scalability]
updated: 2026-10-06
---

# APM 보완·대규모 대응 분석 정본

경험 정본: `C:/Users/DMOVE/claude-experiences/projects/moveseye/2026-10-06-apm-hardening-scale.md`.
구현·검증 정본: `C:/solutions/moveseye-docs/overview/apm-scale-readiness.md`.

사용자 구현 승인으로 SOLO-CODEX 전환. 메트릭 원자성·SSE 송신 큐·조회 상한·RUM 유한 재시도를 보완하고, 다중 BE와 실제 목표 규모 복합 부하의 미완료 범위를 구분했다. 상세 교훈은 공유 Vault에만 보관한다.

후속 문서화·커밋 완료: BE `e55948c`, 문서 `b72b392`. 기존 별도 수정·staged rename 보존, push·배포 없음.

후속 전반 감사: `C:/solutions/moveseye-docs/overview/apm-overall-assessment.md`. CUMULATIVE 의미 정확성과 과거 원문 열람 전환을 production 클래스로 재현하고 Claude 독립 의견을 반영했다. 현재 기능 평가와 23개 우선순위의 최신 정본이다. 새 교훈은 공유 Vault `projects/moveseye/2026-10-06-apm-overall-review.md`에 기록했다.

2026-10-06 순위 5~8 후속: durable dirty rollup·retention gate, trace 재분류 집계 교정, RUM timestamp/partition 경계, archive `CORRUPT` 격리와 source hold를 보강했다. BE `2f84b554`, FE `b8081cc`, 문서 `3f2a1de`. 현 BE 통합 선별 188개/14 class 통과, archive FE 84 Jest + tsc 통과. 세부 교훈은 공유 Vault `projects/moveseye/2026-10-06-apm-hardening-stage5-8.md` 참조.

열린 정확성 경계: watermark는 completeness가 아니다. dirty/blocked/legacy 상태를 SLO·availability·export가 반영하기 전 stage5는 end-to-end 미완료다. 서버 trace timestamp guard도 미완료이며, 실제 목표 부하·다중 노드·browser E2E로 규모/HA 지원을 증명하지 않았다. Cold archive 시험 날짜는 DB tombstone을 지우지 말고 각 테스트마다 `retired_before` 뒤의 새로운 retention 대상일을 배정한다.
