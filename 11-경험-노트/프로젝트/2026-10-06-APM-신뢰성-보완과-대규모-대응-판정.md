---
tags: [moveseye, apm, scalability, transaction, review]
updated: 2026-10-06
---

# APM 신뢰성 보완과 대규모 대응 판정

사용자가 APM 현재 구현·미흡 분석과 보완을 지시하고, Codex의 구현을 명시적으로 허용했다. `COLLAB.md`를 SOLO-CODEX로 전환했으며 BE의 기존 `ApmCollectorController.java` import 정리 변경은 보존했다. 추가로 대규모 시스템 대응 여부를 분석했다.

최종 동작·검증 결과 정본은 `C:/solutions/moveseye-docs/overview/apm-scale-readiness.md`다. 상세 증거는 `_workspace/analysis/apm-20261006-*.md`와 `_workspace/verification/apm-20261006-*`에 둔다.

## 이번 결정

- 1차 보완은 메트릭 영수증·적재 원자성, SSE 송신 작업 큐, 시계열 포인트 상한, RUM Web Vitals 유한 재시도다.
- 대규모 완비로 판정하지 않는다. 단일 BE 방어와 다중 BE 상태 공유·목표 규모 성능 보증을 구분한다. 기존 1,404만 행 SQL 적재 시험은 실제 수집+조회+관제 복합 부하 시험이 아니다.
- 알람 소유권·Zabbix 전송 분리는 기존 독자 알림 작업과 함께 처리한다는 결정을 유지한다. 이번 보완에 포함됐다고 안내하지 않는다.
- 공유 서버 재기동·운영 배포·push는 수행하지 않는다. 성공 응답 shape과 DB 스키마는 유지한다.

## 재사용할 교훈

후속 문서화·커밋(사용자 지시): BE `e55948c`에 코드·테스트 29개 파일, 문서 저장소 `b72b392`에 보완 보고서를 커밋했다. 문서는 파일별 변경·실패/성공 흐름·설정·적용/롤백·재검증을 담으며 독립 독자 검증을 통과했다. 기존 Controller 수정과 문서 저장소의 staged rename은 원본 diff 해시로 보존을 확인했다. push·배포는 하지 않았다.

1. **DB 트랜잭션만 추가해서 원자성이 완성되지는 않는다.** 누적형 직전값·bounds 캐시·live 링·통계 callback도 commit/rollback 경계에 맞춰야 한다.
2. 트랜잭션을 넓히면 **기존 metadata INSERT 순서가 새 교착 원인**이 된다. metric PK 정렬만으로 histogram bounds UNIQUE 잠금의 순서까지 보장되지 않는다. 실제 저장키를 별도 정렬하고 원본 관측순서는 보존한다.
3. PostgreSQL SQL 실패를 `catch → 빈 값`으로 삼키면 aborted transaction이 정상 결과처럼 끝날 수 있다. 특히 후속 적재가 없는 첫 CUMULATIVE 관측을 시험해야 한다. 캐시 warmed 플래그도 조회 성공 뒤에 설정해야 재시도가 살아난다.
4. 연결 상한과 작업 큐 상한은 함께 검증한다. 비동기 Servlet인데도 monitor를 잡은 fan-out 단계에서 writer가 대기하므로 정상 연결만으로 큐 거절이 가능하다.
5. 대형 조회의 위험은 DB 스캔뿐 아니라 **데이터가 없어도 만드는 빈 격자**다. 기간을 일괄 잘라 장기 집계를 깨기보다 실제 해상도 포인트를 계산해 할당 전에 막는다.
6. 브라우저 재시도는 본문을 그대로 유지하고 횟수·기간·직렬화 바이트를 제한한다. SDK 대역의 실제 Chromium HTTP 시험과 제품 BE 종단 시험을 구분한다.
7. 회귀 테스트를 저장소별로 동시에 실행하지 않는다. 같은 `moveseye_it` 재생성과 Java/Jest 메모리 경합 때문에 실패 원인을 오판할 수 있다.

관련: [[moveseye]] · [[2026-10-05-documentation-apm-overview]] · [[2026-10-01-apm-domain-review-sweep]] · [[concurrent-upsert-lock-order]] · [[shared-it-db-worktree-collision]]
