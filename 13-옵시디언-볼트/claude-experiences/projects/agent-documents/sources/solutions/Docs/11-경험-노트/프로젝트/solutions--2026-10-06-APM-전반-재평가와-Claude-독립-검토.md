---
tags: [moveseye, apm, review, data-correctness]
updated: 2026-10-06
---

# APM 전반 재평가와 Claude 독립 검토

정본: `C:/solutions/moveseye-docs/overview/apm-overall-assessment.md`. BE `e55948c`, FE `9dfcbe8`. 구현 변경 없이 전반 감사·합성 재현·Claude 소스 검토를 진행했다.

- 이전 저장 원자성·SSE·조회 상한·RUM 재시도 보완은 유효하지만 측정 의미를 보증하지 않는다. 실제 normalizer/tracker에서 CUMULATIVE 차원 축약 후 차분(12→112), 역순 도착(30→150), 동일 길이 bounds 변경(count1/버킷합10), 독립 tracker 교차 수신(전체증가50/산출80)을 재현했다. DELTA에는 해당 차분 문제가 없으며 고객 피해·DB/HTTP 전체 재현은 미확인이다.
- 현재 저장 설정 `keepRawSql=false`를 과거 행도 이미 마스킹됐다는 증거로 삼으면 안 된다. ON→OFF 정책 전환 후 USER에게 합성 과거 SQL 원문이 반환되는 production policy 경로를 직접 재현했다. export는 이미 이 문제를 피하고 있어 화면 정책과 불변식이 달랐다.
- 사용자 요청으로 실제 Claude Code CLI를 읽기 도구만 허용해 독립 검토했다. Claude가 지적한 trace env 누락 가능성을 FE→hook→BE로 확인했다. 반면 근거 없는 ‘수십 서비스 사용 가능’·‘늦은 누적값 폐기는 무손실’ 단정은 평가에 채택하지 않았다.
- RUM sessions는 UI가 ‘버킷 세션 합’과 기간 고유 세션 아님을 명시한다. BE 합산만 보고 버그로 판정한 후보를 FE 계약 대조 후 제외했다.
- 교훈: 정상 요청·단일 상태의 회귀 수보다 원시계열 신원, 입력 순서, 설정 전환, 분류 변경, 과거 재정산의 기준 모델 검증이 중요하다. 코멘트와 기존 테스트가 잘못된 가정을 고정할 수 있다.
- 알람은 기존 독자 알림 체계와 함께 개선하는 결정 유지. 23개 우선순위와 완료 기준은 정본에만 보관한다. 제품 코드 수정·새 배포 없음.

관련: [[projects/moveseye/moveseye|moveseye]] · [[projects/moveseye/2026-10-06-apm-hardening-scale|2026-10-06-apm-hardening-scale]] · [[projects/moveseye/2026-10-01-apm-domain-review-sweep|2026-10-01-apm-domain-review-sweep]]
