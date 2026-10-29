---
name: project-code-quality-audit
description: "로직 비대화·중복 감사(평가서 v1.1)의 단계별 진행 상태와, 검증 결과 \"하지 않기로\" 확정한 항목들"
metadata: 
  node_type: memory
  type: project
  originSessionId: de9ef910-1bf1-4ae9-a908-9900200986c3
  modified: 2026-08-06T07:21:58.030Z
---

로직 비대화·중복·효율 감사. 문서 2종: `_workspace/logic-bloat-audit/03_verify_report.md`(기술)와 `Moves_Workforce_코드_품질_평가서.md`(평가서 v1.1). 초판 지적을 실물 코드로 전수 재검증해 등급·범위를 조정한 것이 v1.1이다.

**1단계 완료(2026-08-06, 커밋 `06cab7a`)** — P0(다건 worklog rollback 삭제결과 미확인 → 허위 "모두 취소" 안내) + query key 팩토리 2개 + UserService null guard + 급여 histogram step=0 + debug log 5건 제거. backend 1,086 / frontend 1,087 전체 통과, `CI=true npm run build` 통과(main gzip 895,040B). **배포·E2E 미수행.**

**2단계 완료(2026-08-06, 커밋 `9ca8de4`)** — quick-add 3벌 → `src/resolver/backoffice/CatalogBulkService.js`, 이슈 pagination 3벌 → `src/api/jira/issue/ProjectIssuesFetcher.js`, workday 동기화 테스트 추가. backend 1,093 / frontend 1,108 통과. **배포·E2E 미수행.**
- ⚠ `fetchAllProjectIssues`를 IssueApi.js가 **아닌** 별도 파일에 둔 이유: 소비 서비스 테스트가 IssueApi 모듈 전체를 mock해 `as:'app'` 전달을 검증하는데, 같은 모듈에 두면 그 검증이 함께 mock돼 무력해진다.
- 프론트 jest에서 백엔드 순수 모듈 직접 import는 `static/ui/jest.config.js`의 인라인 babel 설정 덕에 동작한다(`.babelrc`는 static/ui 밖에 적용 안 됨).

**남은 단계**: 3단계(GanttChart/WorklogModal/AssignmentBoard/UserService 분리 — 전체 일정의 8할이고 배포 후 육안 확인이 병목), 4단계(dead endpoint 제거·미사용 dep 8종·bundle 예산 항목 확충).

**하지 않기로 확정한 것** (착수하면 순수 비용):
- 공휴일 query 통합 — staleTime은 observer별 옵션이고 cache는 key 단위 공유라 화면 간 값 불일치가 구조적으로 불가능
- workday.js 물리적 코드 공유 — CRA/Forge 빌드 경계를 뚫는 비용이 132줄의 유지 비용을 초과. [[project-ci-build-lazy]] 참조
- worklog pagination(B계열) 통합 — 기능별 전용 페처 격리가 이 저장소의 명시 정책 [[feedback-worklog-fetch-isolation]]
- bundle budget 기준값 조정 — 이미 갱신 완료된 것을 초판이 구버전으로 오독한 것

`react-apexcharts`는 import 0건인데 CLAUDE.md 기술 스택에 남아 있다(정정 대상).
