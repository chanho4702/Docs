# Moves Workforce 협업 모드 현장 검수

날짜: 2026-09-30. 소스: `bad31d94a6b137c6baaf8bcb2433884978c4fad2`.

사용자는 협업 모드 비정상 동작의 검수를 요청했다. 앱 코드·배포·설치·DB는 변경하지 않았다.

## 확인한 증거

- `moves-rms` 환경 16:59 KST에 협업 판정 SQL 실패가 있었고, OFF 응답으로 숨겨졌다. 로그에 원인 예외가 없어 EXISTS 미지원으로 확정할 수 없다.
- 마지막 16:40 마이그레이션 이력에는 v025 협업 컬럼 추가가 없다. 마이그레이션은 hourly trigger와 install/upgrade, seed 버전 갱신 경로로만 실행한다. 배포와 스키마 준비를 구분해야 한다. DB 직접 조회는 미실시라 현 시점 컬럼 부재는 미확정이다.
- 17:00 배포 성공은 확인했지만 buildTag가 N/A여서 로컬 커밋 대응·실제 성공은 미검증이다. 이전 배포의 오류를 최신 배포의 실패로 단정하면 안 된다.
- 같은 사이트에 development와 moves-rms 환경 앱이 공존하고 프로젝트 연결 필드 중복 경고가 있다. 협업 JQL은 표시 이름을 사용한다. 실제 검색 오류는 재현하지 않았다.
- `useProjectReadAuthority`는 오류 여부 대신 캐시 data만 읽어 app을 선택한다. 실제 TanStack Query로 성공 후 재조회 실패 시 이전 app 데이터가 남는 것을 재현했다. 초기 실패만 확인하는 테스트로는 잡히지 않는다.

## 검증과 교훈

- 관련 backend 173건, frontend 39건 통과. 테스트는 SQL mock을 사용해 실제 스키마 준비를 보장하지 않는다.
- Forge lint exit 0이나 `PermissionLinter: Unknown product` 경고가 있어 권한 lint는 일부 미검증이다.
- 권한 판정 실패 시 user로 제한하더라도 설정의 정상 OFF와 조회 실패는 별도 상태여야 한다.
- 캐시 기반 권한 분기는 최초 실패와 성공 후 재조회 실패를 나누어 검증한다.
- 검수 보고서는 리포지토리 `_workspace/collab-mode/03_verify_report.md`의 현장 장애 추가 검수 절에 누적했다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-harness-audit-2026-09-07|moves-workforce-harness-audit-2026-09-07]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-subscription-sync-field-authority-2026-09-22|moves-workforce-subscription-sync-field-authority-2026-09-22]], [[projects/agent-documents/sources/codex-experiences/topics/codex-experiences--tanstack-query-cross-domain-invalidation|tanstack-query-cross-domain-invalidation]].

## 코드 효율성·로직 후속 질문

- 실제 `CollabWorklogFetcher` 모듈에 계속되는 검색 커서·100건 응답을 주입하면 1,000건에서 중단해도 `truncated:false`가 된다. 이슈 상한과 API 요청 예산 상한의 절단 플래그를 따로 확인해야 한다.
- 실제 `CollabCoverageService` 모듈에 현재 write=false, 과거 writer 응답 캐시를 주입하면 writer용 스페이스 키가 그대로 반환된다. 사용자 ID가 같아도 권한별로 응답이 달라지는 캐시는 권한 축 또는 반환 직전 재가공이 필요하다.
- coverage 최대 200요청, 워크로그 최대 300요청으로 유한하지만 첫 조회 비용과 동시 캐시 미스의 중복 비용은 별도 성능 검토 대상이다. 실제 운영 응답 시간은 미측정이다.
- 두 재현은 외부 의존성을 mock한 실제 코드 실행이며 앱 파일 수정 없이 수행했다.

## 승인 후 코드 보완

- 사용자의 후속 진행 승인으로 코드와 회귀 테스트를 수정했다. 앞선 읽기 전용 검수와 구분하며, 배포·설치·DB 변경은 하지 않았다.
- SQL 판정 실패를 `UNAVAILABLE`/`COLLAB_ACCESS_UNAVAILABLE`로 분리했다. 서버 결정형 화면은 user로 제한하고, 전용 조회·coverage는 원문 SQL 없는 안전한 오류로 거부한다.
- app 성공 후 access 재조회 실패는 데이터 필드가 남더라도 user로 전환한다. QueryClient별 전환 메모, 동일키 종속 캐시 reset, 늦은 app 응답 취소, placeholder와 페이지 커서 초기화를 함께 적용했다.
- 실제 TanStack Query 경합 테스트에서 취소된 refetch Promise가 후속 refetch에 합류했다. user 응답을 해소하기 전에 취소된 요청 Promise만 기다리면 테스트가 교착하므로 해소 순서를 분리했다.
- 완성 coverage 응답 캐시는 reader/writer 축과 버전을 포함한다. 앱 검색에서 이미 확인된 프로젝트의 BROWSE를 재요청하지 않고, 미확인 구독/본인 전용 프로젝트는 별도 확인한다.
- 워크로그 1,000이슈 상한에 다음 커서가 남으면 절단을 표시하고, 기존 잘못된 집계 캐시를 피하도록 키를 v2로 올렸다. TTL과 요청 예산·동시성은 유지한다.
- 전역 in-flight Promise 공유는 사용자·사이트 컨텍스트 혼합 위험 때문에 도입하지 않았다. 총 요청 예산이 유한하다는 것과 실사용 응답 시간이 충분히 빠르다는 것은 다른 검증이다.
- backend 전체 144 suites / 1,965 tests, frontend 전체 131 suites / 2,099 tests / 1 snapshot 통과. CI 빌드·번역 merge·앱/패널 번들 검사도 exit 0이다. 외부 source map·Browserslist·merge 모듈 경고는 유지했다.
- 초기 Forge lint는 타 세션 빌드 중 index.html 부재로 exit 1이었다. 타 빌드 종료 후 최종 소스로 다시 빌드하고 lint하면 exit 0/No issues found. PermissionLinter의 Unknown product는 남아 일부 권한 검사는 미검증이다.
- 검증 중 타 세션이 기존 사용자 변경을 커밋해 최종 HEAD가 `2932ecbb4cc1502e57b5b50c48aca89119f2a0df`가 됐다. 이번 수정은 작업 트리에 남았고 본 작업은 커밋하지 않았다.
- 실행 보고서: `_workspace/collab-mode/runs/2026-09-30-hardening/`. 실제 사이트의 v025 적용 여부·단일 환경 설치·최종 동작은 별도 확인 대상이다.

## 2026-10-01 커밋 완료

- 사용자의 커밋 지시에 따라 협업 모드 수정·회귀 테스트 21파일만 `36a5266` (`[FIX] 협업 모드 권한 판정과 캐시 정합성 보완`)으로 커밋했다. 앞선 RFC-213~216 커밋과 별개로 남아 있던 변경임을 사용자에게 설명했다.
- 커밋 직전 backend 대상 5 suites/75 tests, frontend 대상 3 suites/43 tests를 재실행해 모두 통과했다. 대상 21파일의 테스트 전후 SHA256 일치와 staged 목록·diff --check를 확인했다. 이번 커밋 단계에서 앱 코드 추가 수정 및 전체 빌드 재실행은 하지 않았다.
- 커밋 후 tracked 변경과 staged 파일은 없다. 기존 미추적 PPT 3개, 조사용 `custom-scopes.yaml`, RFC-204 `LeaderTeamBackfill.test.js`는 포함하지 않고 보존했다. 푸시·배포는 수행하지 않았다.

## 2026-10-01 운영 스위치 비활성 읽기 전용 진단

- 사용자는 확인창 버튼이 아니라 협업 모드 스위치 자체가 비활성이라고 확인했다. 현재 UI 조건은 `!canWrite || access.isLoading || access.isError || mutation.isPending || confirming`이다. coverage 조회는 켜기 확인창 이후라 최초 스위치 비활성의 직접 원인이 아니다.
- `forge environments list`에서 production 최종 배포가 2026-10-01 06:16:22 UTC(15:16 KST)이며, `forge install list`에서 production은 dmove.atlassian.net 및 dmove-lnk.atlassian.net 두 사이트에 설치되어 있다. 종전 moves-rms 환경 진단을 운영 production 진단으로 혼동하지 않는다.
- `forge logs -e production --since 2h -n 250` 및 invocation `c318967c-a777-4831-b928-99a24981f467` 조회에서 06:19:22 UTC에 `v025_alter_project_add_collab_mode`가 처음 적용된 로그를 확인했다. verbose에 app version 4.21.0, function runMigration이 표시된다. 로그 출력에 사이트 매핑이 없어 어느 설치의 완료인지 확정하지 않았다. 다른 설치의 최근 마이그레이션 기록은 05:49 UTC의 v024까지이며, 이 기록만으로 현재 컬럼 부재를 확정하지 않는다.
- 사용자에게 화면 안내 문구(설정 조회 실패/수정 권한 없음)와 해당 운영 사이트를 요청했다. resolver 실패는 responseWrapper의 오류 응답으로 반환되므로 콘솔 로그가 없다고 정상 조회를 단정할 수 없다. 원인 확정에는 해당 브라우저의 getProjectCollabAccess 응답 또는 UI 문구가 필요하다.
- 후속 URL로 대상이 `dmove.atlassian.net`의 production 환경(`a113feab-5a3d-4900-89cd-9f6d832e2632`)임을 확인했다. 외부 페이지 조회는 접근 실패했고 연결된 Chrome/Edge 디버깅 endpoint도 확인되지 않아 실제 로그인 화면·응답은 읽지 못했다. 프로젝트 수정 필드와 협업 스위치는 같은 `canWrite("PROJECT")` 값을 쓰므로 다른 필드가 편집 가능하다면 공통 쓰기 권한 부재보다는 협업 설정 조회 상태를 먼저 확인한다.
- 읽기 전용 명령만 실행했고 코드·배포·설치·DB·권한은 변경하지 않았다. 동시 진행 중인 RFC-208 문서 기능의 dirty/staged 변경도 보존했다.

## 2026-10-01 팀 관리형 지원 범위 확인

- 팀 관리형 대응이 전혀 없는 것은 아니다. `CLAUDE.md` 및 `IssuePropertyApi`/`CoworkerResolver`에 공동작업자·등록 정보의 `movesRms` 이슈 프로퍼티 대응이 있고, projectId 검색은 기존 커스텀 필드 JQL을 사용한다.
- 협업 토글은 RMS의 `PROJECT.write`, 협업 설정 조회 상태, 저장/확인 진행 상태로 잠긴다. 설정 조회는 RMS SQL을 읽으며 연결된 Jira 프로젝트의 관리 유형이나 Browse 권한을 조회하지 않는다. 따라서 팀 관리형이라는 사실만으로 이번 토글 비활성 원인을 확정할 수 없다.
- 협업 coverage는 공통 검색과 `mypermissions(BROWSE_PROJECTS)` 결과를 사용한다. 관련 코드·테스트·검증 기록에서 팀 관리형의 Open/Limited/Private 및 역할별 이슈 제한을 별도로 실측한 증빙은 확인되지 않았다. 범용 API 사용 자체가 팀 관리형 미지원이라는 뜻은 아니지만 완전 검증으로 보고할 수 없다.
- 실제 공백: `locales/kr/collab.json:40` 및 영문 `coverage.adminHint`가 모든 유형에 앱 역할의 Browse 권한 설정을 안내한다. 팀 관리형의 Access/역할 기반 접근 제한과 회사 관리형의 권한 스킴을 구분하지 않으므로 일괄 해결책으로 안내하면 안 된다.
- 공식 근거: [팀 관리형 접근 관리](https://support.atlassian.com/jira-software-cloud/docs/manage-how-people-access-your-team-managed-project/), [팀 관리형 작업 역할 제한](https://support.atlassian.com/jira-software-cloud/docs/create-a-work-item-and-a-subtask/). 원인 설명만 요청된 단계라 앱 코드는 변경하지 않았다.
