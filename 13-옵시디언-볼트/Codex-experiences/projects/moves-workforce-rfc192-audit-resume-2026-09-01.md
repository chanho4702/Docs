# Moves Workforce RFC-192 감사 재개 지점 (2026-09-01)

## 중단 상태

사용자가 컴퓨터 종료를 위해 작업을 중단했다. 실행 중이던 Jira REST `asUser()` 기본화 backend 작업 에이전트는 구현 중단 직후 interrupt 했으며, 해당 작업에서 커밋된 변경은 없다.

워크트리에 남은 변경은 사용자 또는 환경 변경으로 보이는 아래 세 파일뿐이다. 재개 시 되돌리거나 커밋하지 않는다.

- `README.md`
- `locales/en-US.json`
- `locales/ko-KR.json`

## 완료 커밋

- `5f2464a` 설정·권한 값 서버 검증 강화
- `9011e86` Storage 프로젝트 사용량 귀속 보완
- `6fc4026` Kanban 프로젝트 삭제 batch 자동 재개
- `60d5b85` project_team orphan 정합성 보완

이전 RFC-192 수정 커밋도 모두 `#RFC-192 [FIX] … - 날짜` 규칙으로 정리됐다.

## 다음 재개 작업

1. `_workspace/jira-rest-asuser/01_architect_design.md`를 기준으로 Jira REST `asUser()` 기본화 backend 구현을 다시 시작한다.
   - RequestJiraJson 4종, IssueProperty 4종, TimeTracking, FieldApi authority/cache가 대상이다.
   - 문서화된 `asApp()` 예외(AppField value endpoint, deletion saga 접근성 barrier, subscription trigger/sweep, portfolio scheduled snapshot)는 유지한다.
2. 집중 테스트와 통합 검증 후 RFC-192 규칙으로 분리 커밋한다.
3. 실제 Jira development 환경 회귀 확인, 전체 test/frontend CI build/Forge lint를 수행한다.
4. 그 뒤 Claude에게 전체 변경 총평을 요청한다.

## 추가 후속 backlog

- 프로젝트 상태 graph P1-2: 상태 추가·삭제·초기 상태 및 SQL CAS 경쟁 조건
- Holiday·Role·Level·Skill catalog 입력 검증
- KVS 5,001건 경계 테스트
- v023 migration의 실제 Forge DB 적용 확인

## 재개 후 완료 (2026-09-01)

- `36207a6` Jira REST 사용자 권한 기본화: 사용자 mutation·개별 원문 경로는 `asUser()` 기본, background/deletion 경로만 명시적 `asApp()`으로 분리했다.
- `6523ce3` Dashboard 앱 권한 집계 경계 분리: 기존 raw-detail resolver는 `asUser()`로 유지하고, RMS principal/scope를 선검증하는 `getDashboardAggregate`만 `asApp()`으로 분리했다. 반환값은 Summary/status/metric allowlist DTO이며 raw Jira issue·비용·급여는 제외한다.
- `0021544` Dashboard scope·migration 회귀 검증 보정: `TeamAnalyticsScope` 단일 출처와 v019~v023 migration chain 검증을 복구했다.
- 전체 검증 통과: backend 108 suites/1,462 tests, frontend 98 suites/1,645 tests, `CI=true npm run build`, `forge lint`.

## 현재 남은 외부 검증

- 최신 커밋을 Jira development 환경에 deploy한 뒤, Jira Browse 권한이 없는 RMS Dashboard 권한 사용자의 aggregate 수치 표시·raw 이슈 비노출과 `asUser()` mutation 권한 거부를 실제로 확인해야 한다. deploy는 외부 환경 변경이므로 사용자 승인 후 실행한다.
- 워크로그 등록 불가 제보는 RFC-192 변경이 수동 등록 경로를 직접 수정하지 않았고 development logs에도 실패가 없어, 재현 시 화면 오류/브라우저 Jira 응답(400/403)을 받아 별도 진단해야 한다.
- Claude 총평은 연결된 Claude 실행 환경 또는 사용자의 승인·접근 정보가 필요하다.

## Development 배포·검증 상태 (2026-09-01)

- development 환경에 앱 version `4.9.0` 배포를 완료했다.
- KVS custom entity index는 모두 `ACTIVE`다.
- 전체 검증 통과: backend 108 suites/1,462 tests, frontend 98 suites/1,645 tests, CI frontend build, Forge lint.
- development 설치 중 `tom-chkim-dev.atlassian.net`은 `Up-to-date`다. `dmove-sandbox.atlassian.net`은 `Outdated app`이므로 그 사이트에서 실제 검증하려면 `forge install --upgrade`가 필요하다.
- 실제 Jira 권한 회귀는 브라우저 로그인 사용자 조합이 필요해 CLI만으로는 완료할 수 없다.
