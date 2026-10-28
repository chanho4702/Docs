# Phase 2 통합 검토

2026-09-07. 최종 판정: **미검증 항목이 남아 완료 보류**.

## 코드 검토

- getProjectPeriodReport의 REPORT/detail 등록, 컨트롤러 principal 전달, 서비스의 principal/REPORT/프로젝트 범위 재검증을 확인했다.
- canReadCost 통과 후에만 급여 SQL과 정책 계산을 수행한다. 비용 없는 파생 응답만 viewer별 KVS 캐시에 저장하고, 비용은 캐시 hit에서도 현재 권한·정책으로 계산한다.
- Jira 검색 100건/cursor, fieldsByKeys, user 권한 고정, 20건 이후 실제 개수 기반 worklog 페이지 순회를 확인했다.
- 순수 계산 모듈은 공용 workday/leaveDeduction/ProgressCalculator를 import한다.
- 현재 명부·프로젝트 기간 대체, issues.approx, effectiveEndDate, nullable 비용 계약은 RESULT.md에 명시했다.

## 발견 결함과 조치

1. PeriodReportQuery의 deletion_status 오타: 실제 deletion_state로 수정했다.
2. author 없는 워크로그의 null accountId 정렬: String 비교와 표시명 fallback으로 수정하고 PeriodReportUnknownAuthor.test.js를 추가했다.

두 수정은 쓰기 도구 성공을 확인했으며 최종 읽기·실행 검증은 환경 장애로 하지 못했다.

## 검증 증거

- Phase 1 관련 3 suites / 33 tests 통과.
- PeriodIssueFetcher 12 tests 통과.
- 최종 npm.cmd test -- --runInBand는 orchestrator helper 0xc0000142(-1073741502)로 프로세스를 만들지 못했다.
- 서비스·repository·컨트롤러·순수 계산 최종 테스트, 전체 PermissionMap 계약, ResourceAnalysisDenominator 회귀, Forge lint, diff/보호 파일 해시 비교는 미검증이다.
- 실제 Jira/SQL/KVS, invoke 대용량 성능은 미검증이다.
- frontend/build/merge는 사용자 Phase 3 제외·locales 보호 요구에 따라 실행하지 않았다.

최종 응답 계약과 남은 작업은 [RESULT.md](codex-experiences--RESULT.md)에 있다.
