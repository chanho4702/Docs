# RFC-220 브랜치 검토

- 기준: `develop...RFC-220`, 검토 HEAD `9e7117262402911df2a794afe26e410aa228985f`, develop `48615e84ab769603b8f79bb573b5d0612ec01f56`.
- 판정: **수정 필요 — 재현된 결함 3건**. 제품 소스 수정·커밋·배포는 하지 않았다.
- 사용자가 이미 수정한 외부 API 문서와 미추적 파일은 보존했다. 기존 미추적 `LeaderTeamBackfill.test.js`는 전체 백엔드 테스트 실행에 포함됐다.

## 실패: 확정된 결함

### F1 · P1 · 진척도에서 숨긴 승인 공수 누락

- 위치: `src/resolver/projectProgress/ProjectProgressService.js:64`, 동일 호출 `:218`, 실적 치환 `:81`.
- `getResourceProjectWorklogs({ projectId, onBasis })`는 `includeHidden=false` 기본값으로 읽는다. 승인 앱이 숨긴 기록은 Jira asUser 목록에 없으며, 이후 `withApprovedActual`이 Jira 기존 합계를 이 누락된 목록으로 치환한다.
- 기대: 허용된 숨김 승인분을 포함한 실적. 실제 재현: 승인된 1시간이 있는 프로젝트의 `actualTotalMd`가 기대 `0.1` 대신 `0`.
- 수정 방향: 전체 프로젝트 기간과 허용 범위를 명시해 숨김 승인 집계를 보충하고, 캐시 적중·미적중 호출을 함께 수정한다. 옵션 하나만 켜지 말고 복원에 필요한 날짜와 조회자 범위도 전달해야 한다.

### F2 · P1 · 협업 대시보드에 개인 Jira 권한 필터 재적용

- 위치: `src/api/jira/worklog/CollabWorklogFetcher.js:226`.
- 협업 권한으로 asApp 조회한 행을 일반 `applyWorklogApproval`에 넘긴다. 이 함수는 조회자의 asUser `permissions/check`와 `worklog/list`를 다시 적용한다. RMS 협업 읽기가 허용됐지만 Jira Browse 권한이 없는 참여자는 정상 공개 행까지 잃는다.
- 실제 재현: 협업 페처가 가져온 공개 워크로그 1건이 승인 처리 후 0건이 된다. 히트맵·사용자별 시계열 집계가 영향을 받는다.
- 수정 방향: `CollabCalendarService`/`CollabIssueWorklogService`의 협업 전용 판정 흐름과 맞추되, 승인 앱 hidden id 대조와 집계 전용 제한을 유지한다.
- 형제 경로 정적 확인: `src/resolver/projectDashboard/RelationGraphService.js:304`도 협업 이슈 조회 후 기본 asUser인 `getResourceProjectWorklogs`로 실적을 덮어쓴다. 같은 수정 범위에 포함해야 한다. 이 형제 경로는 별도 실행 재현 없이 소스 대조한 결과다.

### F3 · P2 · 내 작업에서 숨긴 기록만 있는 이슈 제거

- 위치: `src/resolver/myWork/MyWorkService.jsx:79`, 동일 패턴 `:191`.
- `processIssue`/`processMyIssue`가 가시 워크로그 없는 이슈를 null로 만들고, `filter(Boolean)`이 숨김 복원 전에 제거한다. `withIssueApproval`은 남은 이슈로만 issueIds를 만들어 원래 이슈의 숨긴 본인 기록을 복원할 수 없다.
- 기대: 조회 범위의 숨긴 본인 승인 기록도 표시. 실제: 내 캘린더와 프로젝트 기록 두 서비스 모두 기대 1건 대신 0건.
- 수정 방향: 원래 검색된 이슈 ID와 빈 워크로그 컨테이너를 승인 처리까지 보존하고 복원 후 빈 결과를 걸러낸다.

## 재현 근거

`reproduce.case.js`는 실제 MyWorkService, ProjectProgressService, ApprovalCertReader, CollabWorklogFetcher를 연결한다. Jira·KVS·승인 채널 등 외부 경계만 대체한다. 올바른 issueIds와 날짜를 직접 전달한 대조군은 숨긴 본인 1시간 복원에 성공한다.

```powershell
npm.cmd test -- --runInBand --testMatch '**/_workspace/rfc220-review/*.case.js'
```

- 종료 코드 1: 대조군 1개 통과, 결함 재현 4개 실패(F3의 두 소비자 포함).
- 로그: `reproduce.log`.
- 기본 전체 테스트를 오염시키지 않도록 `.test.js`가 아닌 `.case.js`로 보관했다.

## 검토 범위

변경 목록 전체를 기능별로 분류하고 다음 실행 경계를 중심으로 생산자·소비자 코드를 대조했다. 삭제 파일·문서·이미지·발표 자료까지 런타임 검증했다고 해석하면 안 된다.

| 범위 | 확인한 내용 |
| --- | --- |
| 승인 채널 | ChannelServer/Client, PairingService, ChannelState/AtomicDoc, 서명 봉투·사이트·actor·op 검증, peer URL, 관리자 UI 응답과 오류 처리 |
| 승인 쓰기 | IssueWorklogControlService와 WorklogModal·이동/드래그 소비자, ALLOW/DENY/DEFER 분기, 승인 앱 넘김, 공용 writeChannel |
| 승인 읽기·집계 | ApprovalCertReader/ControlLookup, myWork/myPage/calendar/resource/cost/progress/dashboard/portfolio/collab 호출과 숨김 행·숫자 집계 경계 |
| 권한·데이터 | guardedDefine·PermissionMap·PrincipalResolver, TeamLeadAuthority·팀장 설정, 조직 외부 API, 원가 응답 경로, license 변경 |
| 설정·캐시 | 이슈 설정 KVS·페이지/일괄 저장, 설정 schema, epoch/notify, query key·무효화, 사전 데이터 캐시 변경 |
| UI·빌드 | 승인 상태/표시·집계 초, 실패 응답 처리, 설정 UI, 접근성 변경, 번역 merge, 패널 제거와 manifest/build/CI 참조 |
| 부가 기능 | custom effort value function, 프로젝트 연결·구독·삭제 알림, 외부 조직 API DTO·페이지 범위 |

권한 테스트의 자동화 결과와 소스 대조를 근거로 했으며, 실제 사이트의 사용자별 직접 invoke 테스트는 수행하지 않았다. 수정 범위 밖의 모든 resolver에 대해 새 권한 행렬을 실행한 것은 아니다.

## 자동화 검증

| 검사 | 결과 |
| --- | --- |
| 백엔드 `npm.cmd test -- --runInBand` | 통과: 187 suites, 2,616 tests. 같은 제품 소스 상태의 앞선 실행 결과 재사용 |
| 프론트 `CI=true npm.cmd test -- --runInBand --watchAll=false --silent` | 실패: 171 suites 통과·1 실패, 2,761 tests 통과·1 실패. `_workspace/rfc220-frontend-review.log` |
| 실패한 `kanbanPagination.test.jsx` 단독 재실행 | 17개 모두 통과. 브랜치에서 수정하지 않은 테스트이며 전체 실행 실패 원인은 미확정. 단독 통과로 전체 결과를 통과 처리하지 않음 |
| CI 빌드 | 통과: `CI=true npm.cmd run build`, 명시적으로 전달한 프로세스 종료 코드 0. gzip 496,970 / 예산 950,000 bytes. `_workspace/rfc220-build-verified.log` |
| `pwd` 후 `forge.cmd lint` | 네트워크 제한으로 최초 실패 후 승인된 재실행 종료 코드 0, `No issues found`. 단, `PermissionLinter: Unknown product`로 일부 권한 검사가 수행되지 않았으므로 제한적 통과 |

## 미검증·제한

- 실제 Jira/승인 앱 양쪽 설치에서 페어링·워크로그 쓰기·숨김·승인 후 화면 전환 E2E는 실행하지 않았다.
- 운영 webtrigger URL·운영 키·major upgrade 설치는 미검증이다. 배포하지 않았다.
- 프론트 전체 테스트의 단일 실패 원인은 추가 격리가 필요하다.
- BADGE 인증 캐시의 issueIds 축 누락 후보는 실제 현재 소비자가 STATS로 요청하는 점 때문에 확정된 런타임 결함 목록에서 제외했다.
- 보고서는 알려진 결함과 실행한 검증의 범위를 말하며, 결함이 더 없다는 보증이 아니다.
