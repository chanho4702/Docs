---
tags: [moveseye, apm, ux, review, competitors]
updated: 2026-10-01
---

# APM 화면 구성과 UI UX 평가

사용자가 APM 각 페이지와 경쟁사 대비 UI·UX 평가를 요청했다. Codex가 `SOLO-CLAUDE` 검수 모드에서 실제 개발 화면과 FE 구현을 확인했다. 제품 코드 수정·설정 저장·서버 재기동은 하지 않았다.

- 결과: `C:/solutions/_workspace/apm-ux-review-20261001/review.md`와 캡처 37개, 페이지 텍스트·이동 URL·요청 기록 JSON.
- 휴리스틱 종합 약 6.5/10. 기능 범위는 넓지만 첫 화면의 정보 우선순위·메뉴 가독성·조사 맥락 유지·빈 상태에 개선 여지가 크다. 사용자 실험/경쟁사 실측 점수는 아니다.
- 확정 관찰: 트레이스 `지금 새로고침`은 `/apm/services/overview`만 재조회. 개요→서비스 상세는 `preset=6h&env=local` 유지, 사이드바→트레이스는 초기화.
- 오류 0%가 오류 Top 5에 빨간 막대로 표시. 개요에 미연결 단계 카드 3개, 상세에 `로그 4단계`, SLO에 `계약 위반` 문구가 남음. 합성 상세 선택 1시간 가용성에 `가용성(24h)` 라벨 재사용.
- UX 제안: 사이드바 중첩 축소, 헤더·KPI 높이 압축, 기본 관제에 문제 요청 우선, SQL·트랜잭션 상세를 옆 패널로, 상세 기술 설명 접기, 공통 기간·환경 유지.
- RUM(1시간/30일)·메시징·배포는 빈 데이터여서 채워진 분석 UX는 미검증. 트레이스 산점도/합성 목록 초기 빈 화면은 추가 대기 뒤 정상 표시됨. 초기 캡처만으로 누락 버그라 단정하지 말 것.
- 경쟁사 공식 근거: Datadog 서비스 문맥·옆 패널, Dynatrace 문제·영향·기간 비교, New Relic 문제·배포 요약, JENNIFER 실시간 관제, WhaTap 히트맵 선택→트레이스 흐름. 기능 동등성/성능 우열을 주장하지 않음.
- 독자 APM 알림은 [[projects/moveseye/2026-10-01-apm-domain-review-sweep|2026-10-01-apm-domain-review-sweep]]의 기존 사용자 결정대로 후속 지시 대기. 이번 제안은 구현 승인이나 정책 변경이 아니다.

관련: [[projects/moveseye/moveseye|moveseye]] · [[projects/moveseye/2026-09-15-apm-install-guide-and-fe-polish|2026-09-15-apm-install-guide-and-fe-polish]] · [[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]]
