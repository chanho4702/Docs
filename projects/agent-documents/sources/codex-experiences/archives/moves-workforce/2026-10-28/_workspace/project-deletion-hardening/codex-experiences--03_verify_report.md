# 프로젝트 삭제 통합 검증

검토 기준: 2026-09-22, `C:\CloudJira\moves-workforce`, HEAD `7e9abefddea4f50098db4e4024914b7ef7201e62` 위 현재 미커밋 구현. 기존 미커밋 변경을 포함해 실제 생산자·소비자를 대조했다. 검증 담당은 본 보고서만 작성하고 제품 소스는 변경하지 않았다. `integration-verify` 스킬과 루트 AGENTS/CLAUDE 규칙을 적용했다.

## 통과

- **권한·범위:** ProjectController의 두 삭제 resolver는 실제 `guardedDefine` 등록을 유지한다. PermissionMap의 PROJECT read/write를 통과한 뒤 서비스의 공통 `assertDeletionAccess`에서 정상 scope 또는 저장된 최초 요청자+현재 write를 재검사한다. payload의 principal은 신뢰하지 않는다. principal 누락은 거부한다. MEMBER_ONLY/TEAM_ONLY 소속 삭제 뒤 원 요청자 복구, 타인 및 write 회수 차단이 실제 controller→guard→service 테스트에 포함된다. 급여·인력 DTO 신규 노출은 없다.
- **페이지 발견:** IssueApi의 첫/다음 페이지 route가 분리되어 토큰 값만 보간된다. 실제 Forge route 테스트가 URL query decoding을 검증한다. 페이지 최대 100건 upsert 뒤 cursor/DONE을 저장하며 15초 deadline 이후 저장된 cursor로 이어간다. 잘못된 응답과 정지 cursor는 완료로 오인하지 않는다.
- **이동·접근:** 검색 결과가 남아 있어도 mutation 전 직접 probe를 우선한다. MOVED/UNLINKED/MISSING이면 property/field 쓰기를 생략한다. 사용자에게 보이는데 app GET이 404인 경우 차단한다. team-managed GET 필드 누락은 numeric reconcileIssues 검색으로 보완한다. 연결 이슈에는 asUser 접근 장벽을 유지하며 property 삭제 뒤 field 쓰기 전에 다시 소속을 확인한다.
- **재개·완료:** SQL 단계별 DONE과 deadline을 사용한다. parent 삭제 후 캐시 경고도 lease 안에서 복구한다. lease 획득 뒤 최신 작업을 재조회하고 완료 tombstone을 보존하므로 응답 유실 후 같은 ID 재호출·상태 조회가 가능하다. 작업 소유자·cursor·lease는 공개 DTO에서 제외한다.
- **프론트 계약:** ProjectList/useKanbanMutations 모두 공통 DTO 검증을 사용한다. envelope 실패, bridge reject, 다른 projectId, malformed 상태는 FAILED로 남겨 자동 continuation을 중단한다. COMPLETED는 모달을 닫고 목록·칸반·요약 쿼리를 기존 팩토리 기반 helper로 무효화한다. 칸반 미완료/실패는 카드 낙관적 제거를 복구한다. 오류 코드·중단 단계·접근 불가 건수와 번역된 원인/조치를 제공하며 raw message/cause는 렌더링하지 않는다.
- **SQL 자식 재생성 방지:** 12개 INSERT/UPSERT entry에 parent ACTIVE predicate가 같은 SQL 안에 있다. projectusers 바인딩 추가 위치와 dashboard filter 유무 바인딩, snapshot 두 shape, bulk team/skill/layout 입력을 대조했다. `assertActiveProjectWrite`는 0행일 때 parent 상태를 확인하므로 ACTIVE의 동일 값 UPSERT는 정상이다. dashboard layout 실제 service는 모든 행에 같은 project_id를 바인딩하여 서로 다른 프로젝트의 부분 필터링을 만들지 않는다. dashboard 저장 반환 raw→공통 alias 변경은 add 소비자가 반환을 사용하지 않고 layout 소비자가 rowsAffected를 사용하는 계약에 맞는다.
- **오류 분류 후속 수정:** 검토 중 property DELETE의 `ISSUE_PROPERTY_DELETE_403/429`가 일반 UNLINK_FAILED로 축약되는 누락을 발견했다. 백엔드 담당이 prefix를 허용하고 실제 property 실패 403/429에서 원문 없이 HTTP 코드만 반환하는 회귀를 추가했다.
- **Claude 검토 후속:** property HTTP 분류 외 테이블 미생성 스킵과 불안정한 continuation effect 의존성이 보고되었다. SQL 삭제는 readiness probe를 우회하는 삭제 전용 함수를 사용하고 직접 DELETE의 명시적 missing-table만 0행 성공으로 처리한다. 일반 SQL 실패는 전파한다. ProjectList 타이머는 mutation 반환 객체 대신 안정적인 mutate/isPending을 의존한다.
- **Sentry 관측 구현:** 목록/칸반의 실패 DTO와 bridge 오류가 `reportDeletionFailure`로 전달된다. 허용된 code/stage/status/attempt와 고정 resolver만 전송하며 projectId는 메모리 중복 억제 키에만 사용한다. 일반 권한 거부/대상 부재는 제외한다. 60초 TTL, 최대 20개 제한과 capture 예외 격리로 반복 전송·관측 장애를 제한한다. `beforeSend`가 삭제 이벤트를 새 객체로 구성하여 SDK의 user/request/breadcrumb/extra/contexts/exception을 제거하고 `sendDefaultPii=false`가 적용된다. 원문 SQL/Jira 오류는 보내지 않는다. reporter와 hook/modal 19건 targeted 통과 로그를 확인했다.

## 실패 및 검증 증거

최종 기준은 외부 커밋 `86abae4`와 이후 cursor 복구 working-tree diff다. 중간 SQL 계약 테스트 실패는 모두 보정되었으며 최종 전체 검증은 통과했다.

| 명령 / 작업 디렉터리 | 결과 | 증거·제한 |
| --- | --- | --- |
| `npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionService.test.js src/api/jira/issue/__test__/ProjectDeletionIssueApi.test.js src/resolver/project/__test__/ProjectDeletionRepository.test.js` / app root | 통과, 3 suites / 42 tests | BE 담당 실행 보고, 실제 추가 테스트 소스 대조. 종료 코드 수신 대기 |
| FE 삭제 flow·Board·mutations targeted / `static/ui` | 통과, 3 suites / 16 tests | `02_frontend_report.md` |
| `npm test -- --runInBand src/utils/__test__/reportDeletionFailure.test.js src/pages/projectKanban/__test__/projectDeletionFlow.test.jsx src/pages/projectKanban/__test__/ProjectKanbanBoard.test.js` / `static/ui` | 통과, 3 suites / 19 tests | `observability-tests.log`. 민감 scope 제거, TTL 상한, SDK throw와 실제 hook/modal 검증 |
| `npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionOptionalTables.test.js src/resolver/project/__test__/ProjectDeletionService.test.js src/resolver/projectTeam/__test__/ProjectTeamRepository.test.js` / app root | 통과, 3 suites / 49 tests | `02_backend_report.md` 최종 보완. missing-table와 일반 SQL 실패 분리 |
| `npm test -- --runInBand ActiveProjectWrite ChartFilterPersistence PortfolioSpacesPersistence ProjectTeamRepository PortfolioSnapshotSalaryPolicy GanttFolderService` / app root | 통과, 6 suites / 110 tests | `02_sql_fence_report.md`, 실제 12개 SQL 및 바인딩 회귀 소스 대조 |
| `npm test -- --runInBand` / `static/ui` | 통과, 114 suites / 1822 tests / 1 snapshot, exit 0 | `frontend-tests-final.log`, Sentry 추가 이후 최종 실행 |
| `CI=true npm run build` / `static/ui` | 빌드 및 bundle budget 통과, exit 0 | `frontend-build-final.log`, main gzip 477174 bytes, budget 950000 bytes |
| `npm test -- --runInBand` / app root | 통과, 116 suites / 1580 tests, exit 0 | `backend-tests-final.log`, cursor 복구까지 포함한 최종 실행 |
| `pwd` 후 `forge lint` / app root | exit 0, No issues found; 일부 검사 미검증 | `forge-lint.log`. PermissionLinter Unknown product 경고로 일부 권한 lint 미수행 |

## 미검증·남은 한계

- 실제 Jira 사이트에서 101건 이상 pagination, team-managed reconcile, Browse 권한 변화, 429, 실제 Forge SQL의 INSERT SELECT 동작은 실행하지 않았다. 단위 테스트·소스 대조를 live 검증으로 주장하지 않는다.
- 실제 Jira 이동과 probe/write 사이 원자성은 없다. 최초 검색의 인덱스 지연, 이미 실행 중인 SQL write commit 순서, lease 만료 후 살아 있는 실행의 side effect까지 완전 직렬화하지 않는다.
- app/user 모두 접근할 수 없는 404를 실제 삭제와 구별할 수 없다. Jira 쓰기는 하지 않지만 완료로 처리될 수 있다.
- 저장 cursor 요청의 HTTP400은 cursor를 PENDING/빈 값으로 재설정한 뒤 FAILED로 종료한다. 다음 수동 재시도에서 멱등 재발견한다. 신규 7개 경계 테스트와 최종 전체 backend에서 검증했다.
- 완료 tombstone 보존 정책은 없다. 새로고침으로 프론트 메모리 상태가 사라진 후 부모가 이미 삭제된 작업은 목록에서 재개할 진입점이 없다. 같은 모달/알려진 projectId 재호출 복구와 구분한다.
- ProjectList 자체 브라우저 렌더 E2E는 실행하지 않았다. 공통 helper와 소스 소비 계약을 대조했고 실제 hook+modal 테스트는 칸반 경로를 검증한다.
- 삭제 경로 Sentry 전송은 구현했지만 실제 Sentry DSN·네트워크·대시보드 수신은 검증하지 않았다. 전역 resolver 오류까지 자동 수집하는 변경은 아니다. 공통 ResponseWrapper의 SQL 오류 message/cause에는 query/params가 들어갈 수 있으므로 향후 reporter에도 원본 error 객체를 넘기면 안 된다. 프론트가 응답을 받지 못하거나 페이지가 종료된 뒤 발생한 백엔드 장애는 이 방식만으로 관측할 수 없다.

이 세션에서 커밋·푸시·배포·설치는 수행하지 않았다. 실행 중 외부에서 HEAD가 `86abae4`로 이동하여 수정 대부분이 포함됐으며 이를 보존했다. 이후 cursor 복구는 별도 미커밋 변경으로 남아 있다.
