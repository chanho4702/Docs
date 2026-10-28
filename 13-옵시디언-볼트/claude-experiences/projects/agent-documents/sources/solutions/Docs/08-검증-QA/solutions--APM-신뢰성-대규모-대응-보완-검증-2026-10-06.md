# APM 신뢰성·대규모 대응 보완 검증 — 2026-10-06

후속 기록: 사용자 문서화·커밋 지시로 BE `e55948c`(29개 파일), 문서 `b72b392`(보완 보고서)를 커밋했다. 아래 시험은 해당 소스에 대해 이미 수행한 결과이며 문서화 단계에서 소스 변경은 없었다. 기존 Controller diff와 문서 저장소 staged 변경은 해시로 보존을 확인했다. push·배포 없음. 근거: [커밋 확인](verification/apm-20261006-commit-result.json).

범위: BE 작업 트리의 메트릭 원자성, SSE 송신 작업 큐, 시계열 조회 상한, RUM Web Vitals 재시도. BE HEAD `3637c77`, FE HEAD `9dfcbe8` 이후 로컬 변경이다. 사용자 승인으로 `COLLAB.md`는 SOLO-CODEX이며, BE의 기존 Controller import 변경은 보존했다. FE 소스 변경 없음.

## 실행 결과

| 검증 | 결과 | 근거·범위 |
|---|---|---|
| Java 선별 회귀 최종 집계 | **521개·63개 클래스, 실패·오류·skip 0** | 보존한 실행의 클래스별 가장 최신 XML. 전체 프로젝트 테스트 아님 |
| SSE | 147개 통과 | 위 합계에 포함. 기본40/10·확장120/30·최대500/200 합성 fan-out, 느린 연결·대기 timeout·재연결, 기존 Servlet 송신 시험 |
| 저장소 최종 실행 | 86개 통과 | 위 합계에 포함. PostgreSQL 원자성11개 포함 |
| 조회·RUM·아키텍처 최종 실행 | 135개 통과 | 위 합계에 포함. 과대 격자 거절·400일 보존·오류 계약·RUM 기존 저장·권한·아키텍처 |
| Node RUM snippet | 25개 통과 | VM의 SDK/시간/HTTP 대역으로 재시도·영구 오류·예산·동의·종료·페이지 전환 검사 |
| 실제 Chromium HTTP | 4개 통과 | Edge headless, 실제 fetch·HTTP 수신기. 503 동일 본문, 429 Retry-After, 401 무재시도, 동의 철회. OTel SDK는 대역 |
| JAR 빌드 | 성공 | JDK17, `gradlew.bat :bootJar --max-workers=1`, 20초 |
| 작업 트리 검사 | 통과 | `git diff --check`; 기존 ApmCollectorController 변경 보존; FE clean |

실행 그룹 수를 최종 521개에 다시 더하지 않는다. 최종 집계는 [JSON](verification/apm-20261006-final-summary.json), 원본은 [SSE](verification/apm-20261006-stream-tests/summary.json), [저장소](verification/apm-20261006-ingest-tests/final-store-run/), [조회·RUM](verification/apm-20261006-query-rum-tests/summary.json), [브라우저](verification/apm-20261006-rum-browser.json)에 있다.

## 발견·수정·재검증

메트릭 저장을 한 트랜잭션에 묶는 과정에서 독립 검수가 새 bounds 역순 잠금과 route 워밍 SQL 예외 은폐를 지적했다. bounds 선등록 순서를 통일하고 실제 PostgreSQL 실패를 삼키지 않게 수정했다. warmed 표시도 조회 성공 뒤로 옮겼다. 두 경로의 실제 DB 회귀가 최종 11개 원자성 시험에 포함되어 통과했다.

기존 bounds mock 두 건의 중복 조회 회귀는 선등록 결과를 배치 Map으로 재사용해 해결했다. 기존 StoreIT의 token 삭제 전 미배출 통계로 생긴 FK 간섭은 fixture가 삭제 전에 flush하도록 정리했다. 해당 store군 최종 86개가 모두 통과했다.

최초 광범위 ingest 실행에서 `LiveMetadataCacheIT.warmLiveEndpointHasZeroSqlQueriesAndNeverTouchesLastSeen`이 SQL 0 기대/4 실측으로 한 번 실패했다. 같은 테스트는 선별 재실행에서 통과했지만 전역 통계/백그라운드 실행 간섭의 최초 원인은 확정하지 못했다. 성공한 재실행만 보고 이 관측을 숨기지 않는다. 상세 이력은 [수신 검증](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--APM-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%88%98%EC%8B%A0-%EC%9B%90%EC%9E%90%EC%84%B1-%EA%B2%80%ED%86%A0-%EA%B0%9C%EC%84%A0-2026-10-06.md)을 따른다.

## 계약·독립 검수

- [통합 계약](../06-API-%EA%B3%84%EC%95%BD/solutions--APM-%EC%8B%A0%EB%A2%B0%EC%84%B1-%EA%B7%9C%EB%AA%A8-%EB%B0%A9%EC%96%B4-%EB%B3%B4%EC%99%84-%EA%B3%84%EC%95%BD-2026-10-06.md), [조회 제한 계약](../06-API-%EA%B3%84%EC%95%BD/solutions--APM-%EC%8B%9C%EA%B3%84%EC%97%B4-%EC%A1%B0%ED%9A%8C-%EC%9E%90%EC%9B%90-%EC%83%81%ED%95%9C-%EA%B3%84%EC%95%BD-2026-10-06.md): 정상 payload·URL·인증/권한 유지. 조회 상한 초과만 기존 HTTP200/body400 오류 경로로 추가.
- [수신 독립 검수](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--APM-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%9B%90%EC%9E%90%EC%A0%81-%EC%88%98%EC%8B%A0-%EB%8F%85%EB%A6%BD-%EA%B2%80%EC%88%98-2026-10-06.md): 수정 전 두 결함과 수정 확인, 남은 checkpoint·규모 한계.
- [SSE·RUM 독립 검수](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--APM-SSE-%EC%86%A1%EC%8B%A0-%EC%9A%A9%EB%9F%89-%EB%B6%84%EC%84%9D-%EB%B0%8F-%EB%B3%B4%EC%99%84-2026-10-06.md): 바이트/작업 큐 제한과 브라우저 종료·동의 계약 확인.
- 독립 독자 검증에서 규모 보장·배포 여부·잔여 과제·시험 대역의 구분을 확인하고, RUM 정리 함수와 조회 상한 적용 범위 표현을 보완했다.

## 보증하지 않는 범위

- 합성 700연결 시험은 최대 프레임·프록시·브라우저 렌더를 포함한 운영망 700명 성능 보증이 아니다.
- RUM 브라우저 시험은 실제 제품 BE·실제 OTel SDK·페이지 종료 전달 보장을 검증하지 않았다.
- 메트릭 영수증/DB 원자성은 보완했으나 누적형 checkpoint는 메모리다. 다중 BE 분산·재시작·DB commit 결과 불명 이후의 새 배치 차분 연속성은 잔여 과제다.
- 수천 서비스·대량 수집·조회·rollup·보존 동시 부하, HA, 운영 파일시스템의 아카이브 복구는 이번 시험 범위 밖이다.
- 공유 BE·FE 재기동, 운영 배포, commit·push는 하지 않았다. 설치 사양과 지원 규모를 확정하려면 목표 입력량을 정한 별도 종단 시험이 필요하다.

제품 설명 정본: [APM 대규모 운영 준비 상태](../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B0%9C%EC%9A%94/solutions--APM-%EA%B5%AC%ED%98%84-%EB%B3%B4%EC%99%84%EA%B3%BC-%EB%8C%80%EA%B7%9C%EB%AA%A8-%EC%9A%B4%EC%98%81-%EC%A4%80%EB%B9%84-%EC%83%81%ED%83%9C.md).
