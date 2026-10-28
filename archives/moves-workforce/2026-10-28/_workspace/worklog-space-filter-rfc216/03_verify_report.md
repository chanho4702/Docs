# RFC-216 통합 검수

검수 기준: 2026-09-30. 시작 HEAD `9f8aaf5`, 검수 중 HEAD `af708ced8dd36c67bd4549e38df3989138a5d1d1`. 후자는 타 세션의 간트/트리 커밋이며 보존했다. 검수자는 앱 코드를 수정하지 않았고 이 보고서만 작성한다. 이전 협업 모드 hardening 변경과 미추적 PPT/custom-scopes/LeaderTeamBackfill은 이번 RFC 소유 범위가 아니다.

검증 후 리더가 사용자 승인에 따라 RFC-216 소유 14개 파일만 커밋했다: `afa4bd4`. 커밋 후 staged는 비어 있고 이전 협업 변경·기타 미추적 파일은 보존했다. 푸시·배포는 하지 않았다.

## 현재 판정

**통과.** 권한·서버 필터·저장 계약이 요구사항과 일치한다. 확인된 F1~F5의 수정 소스와 실제 Form/useAsync 회귀를 대조했고 남은 차단 결함은 확인되지 않았다. 마지막 변경을 포함한 frontend 전체 2,210건, CI app/panel 빌드, Forge lint 명령이 통과했다. Backend 전체 1,965건은 변경 없는 소스의 직전 실행 증거를 재사용한다. 실제 Jira E2E와 Forge의 일부 권한 lint는 아래와 같이 미검증이다.

## 생산자·소비자 계약

| 경계 | 확인한 소스 | 판정·근거 |
|---|---|---|
| 스페이스 후보 | `useWorklogSpaceOptions.js` → `utils/jiraApi/requestJira.js` | 기존 사용자 bridge 호출로 `getProjects`, `action=browse`, `status=['live']`, `maxResults=100`, `orderBy=name`을 전달한다. 실제 offset·종료 여부를 검사하여 모든 페이지를 수집하고 key 중복을 제거한다. 실패 envelope·누락된 values·무진행 응답을 부분 성공으로 바꾸지 않는다. |
| 후보 캐시 | `utils/queryKey/jiraKeys.js` → 후보 훅 → `WorklogIssuePicker.jsx` | `['jiraWorklogSpaces', accountId]` 전용 키, 60초 staleTime, 생성 모달이 열리고 accountId가 있을 때만 활성화한다. 기존 추출 화면의 `projectSearch(query)`와 shape·사용자 캐시가 분리된다. |
| 이슈 검색 범위 | `worklogIssueSearch.js` → `searchIssueWithJQL` → Picker | RMS 연결·담당자/공동 작업자 OR 괄호·선택 RMS 조건을 보존하고 `AND project IN (...)`을 서버에 전달한다. 복수 스페이스는 OR, 빈 선택은 해당 조건만 생략한다. 공용 `quoteJqlValue`로 문자열을 escape한다. 받은 이슈를 클라이언트에서 다시 필터링하지 않는다. |
| 검색 응답 | 같은 helper → Picker → Form issueKey | 기존 `fields=['*all']`, `properties=['movesRms']`, `fieldsByKeys=true`, `maxResults=100`과 `{label,value:issue.id,issue}` 옵션을 유지한다. 실패 envelope·잘못된 issues shape는 정상 0건과 구분한다. |
| Form·선택 상태 | `WorklogModal.jsx:104,266,504` → Picker | 필터 변경은 Field 값과 selectedIssue를 함께 비운다. 제출 전 두 ID의 유효성·동일성을 확인하여 미선택이나 불일치 상태에서 권한 조회·저장을 하지 않는다. Form 전체를 재마운트하지 않아 시간·날짜·코멘트는 유지한다. 기본 이슈 옵션은 issue별 useMemo로 안정화했다. |
| 생성·편집 소비자 | `pages/myWork/WorklogPage.jsx:575`, `pages/projectDetail/calender/ProjectCalender.jsx:413` | 첫 화면의 RMS ID 배열과 두 번째 화면의 단일 ID를 모두 정규화한다. 실제 worklog_id 존재 여부를 Picker에 직접 전달해 편집 첫 렌더부터 후보 조회·이슈 변경을 막는다. 생성의 초기 issue만으로는 편집으로 취급하지 않는다. |
| 저장·무효화 | `WorklogModal.jsx:307,329,346`, `components/worklog/worklogWrite.js`, 두 호출 화면 | create/update/delete payload에 스페이스를 추가하지 않았다. WORK_ON_ISSUES/EDIT_OWN_WORKLOGS/DELETE_OWN_WORKLOGS 사전 확인과 최종 Jira 인가를 유지한다. ADF·기간 생성/롤백·기존 calendar/myWork 무효화도 변경하지 않았다. |
| 공용 필터 | `components/filter/ProjectFilterDropdown.jsx` → 큐·트리·간트·맵·새 Picker | 기존 4개 소비자는 옵션 prop을 생략하여 기존 assignment 문구·활성 동작이 유지된다. 새 소비자만 worklog labelKeys를 전달한다. disabled는 trigger·검색·전체 해제·개별 toggle에 반영하며 click handler에도 guard가 있다. |
| i18n | `locales/{kr,en}/worklog.json` 및 `ko-KR.json`, `en-US.json` | 두 언어 모두 필터 라벨 3개와 조회 실패 2개를 추가했다. `{n}`을 기존 tFormat으로 치환한다. retry·empty·required는 기존 키를 재사용한다. 생성 파일의 변경은 해당 5개 키뿐이다. |

`WorklogIssuePicker.jsx`, `useWorklogSpaceOptions.js`, `worklogIssueSearch.js`의 상대 경로 기준은 `static/ui/src/pages/myWork/modal/`이다.

## 권한·데이터 범위

- 새 resolver·PermissionMap·principal·SQL/KVS·manifest·scope 변경이 없다. 따라서 SELF SQL owner, 급여/비용, 팀 명부 범위의 신규 경로는 이번 변경에 해당하지 않는다.
- Jira 후보 및 검색·저장은 기존 `@forge/bridge.requestJira` 사용자 자격이다. asApp 우회나 후보의 이슈 생성 권한 목록 전환이 없다.
- 스페이스 필터는 기존 이슈 범위와의 교집합이다. 후보 목록은 사용자가 Browse할 수 있는 live 프로젝트이므로, RMS 범위에 할당 이슈가 없는 후보를 선택하면 정상 빈 결과일 수 있다.
- 후보 조회 오류나 빈 결과로 기존 선택 Set을 자동 해제하지 않는다. 옵션 표시 오류를 이유로 검색 범위를 넓히지 않는다.
- 사용자·무권한·관리자별 실제 Jira 응답과 저장 거부는 실사이트에서 실행하지 않았다. UI 조건과 사용자 REST 호출 계약 확인을 실제 권한 실험으로 대체하지 않는다.

## 발견·수정 추적

### F1. 초기 이슈의 Form 기본값 순환 참조 — 수정 확인

실제 WorklogModal과 Atlaskit Form을 함께 렌더한 리더의 첫 통합 테스트에서 기본 옵션의 JSX label이 매 렌더 새 객체가 되어 Field의 JSON 기본값 비교가 순환 참조 오류를 냈다. `WorklogModal.jsx:104`의 기본 옵션을 issue별 useMemo로 고정한 뒤 같은 실제 Form 테스트 3건이 통과했다. 가짜 Form으로 검증을 우회하지 않았다.

### F2. 캐시 적중 뒤 늦은 다른 검색의 옵션 덮어쓰기 — 수정 확인

최초 검수 당시 `WorklogIssuePicker.jsx:58`의 Promise loader는 성공 결과에 requestKey만 확인했다. 설치된 `@atlaskit/react-select/dist/es2019/use-async.js:79`의 cache hit 분기는 이전 `lastRequest`를 무효화하지 않는다. 따라서 `A 검색 완료 → B 검색 중 → A 캐시 적중 → B 완료`에서 현재 A의 옵션이 B로 바뀌었다. 늦은 실패도 library의 rejection callback을 통해 현재 옵션을 비울 수 있다. 오류 메시지에만 sequence guard를 적용하거나 stale 결과를 빈 배열로 반환하는 것만으로는 충분하지 않다.

검수자가 jsdom + testing-library renderHook으로 설치된 실제 useAsync를 실행한 최소 재현 결과: `cached A before late B: [{"value":"A"}]`, `cached A after late B: [{"value":"B"}]`. 작업 디렉토리 `static/ui`, Node stdin 스크립트, exit 0, chunk `0c637c`. 파일을 만들거나 앱 소스를 변경하지 않았다. 성공/실패 양쪽의 stale callback 소비 차단과 실제 useAsync 회귀를 구현 담당자·리더에게 요청했다.

수정 후 loader는 Promise를 반환하지 않는 callback 형식을 사용한다. 활성 scope·mounted·요청 sequence를 확인한 경우에만 callback을 호출하므로 늦은 성공과 실패 모두 현재 옵션을 바꾸지 않는다. `WorklogIssuePicker.test.jsx`는 설치된 실제 useAsync를 실행하며 cache A → B pending → cache A 이후 성공/실패 두 경로를 검증한다. 단순 DOM skin만 대체하고 AsyncSelect 캐시를 가짜 구현으로 우회하지 않았다.

### F3. 재시도 후 검색어 해제 시 잘못된 기본 목록 — 수정 확인

재시도 key remount 당시 검색어 `needle`을 유지하면 useAsync가 해당 검색 결과를 defaultOptions로 저장했다. 이후 검색어를 비워도 전체 기본 결과 대신 needle 결과가 남았다. 실제 hook 최소 재현에서 `remounted retry options`와 `cleared input options`가 모두 `[{"value":"needle"}]`였다. 작업 디렉토리 `static/ui`, Node stdin 스크립트, exit 0, chunk `41c639`. 리더가 승인한 대로 선택된 스페이스는 유지하고 재시도 시 검색어를 비우도록 수정했다. 회귀는 재시도 성공 후 다시 검색하고 검색어를 비웠을 때 올바른 기본 목록으로 복귀하는 경계까지 확인한다.

### F4. 검색어를 비운 상태의 기본 목록 오류 은폐 — 수정 확인

기본 목록 요청이 진행 중일 때 `A 검색 → 검색어 비우기 → 첫 기본 목록 실패`가 발생하면, callback loader의 sequence 판정이 실패 알림까지 버렸다. 빈 검색어가 현재 참조하는 기본 목록이 실패했는데 정상 빈 목록처럼 보이고 재시도도 없었다. 검수자가 실제 Picker 소스를 메모리에서 Babel 변환하고 설치된 실제 useAsync를 사용하여 재현했다. 작업 디렉토리 `static/ui`, Node stdin 스크립트, exit 0, chunk `4790a8`; `current input: ""`, `default failure alert shown: false`. 네트워크·주변 DOM만 stub했으며 파일은 변경하지 않았다. 현재 빈 입력이 필요로 하는 기본 목록 실패는 노출하고, 검색어 A를 유지 중인 상태의 무관한 기본 목록 실패는 숨기도록 담당자·리더에게 전달했다.

수정 후 activeInput과 실패한 기본 목록의 범위를 별도로 기억하여 검색 중에는 숨기고 빈 입력으로 돌아오면 실패와 retry를 표시한다. 실제 useAsync를 사용하는 테스트는 실패 전 clear와 실패 후 clear 두 순서를 모두 검증한다.

### F5. RMS 범위를 A→B→A로 복귀할 때 과거 기본 오류 재등장 — 수정 확인

F4 수정 뒤 RMS scope가 A→B→A로 바뀌면 requestKey 문자열이 다시 같아져, 최초 A의 지연된 기본 목록 실패가 새 A의 성공 화면에 오류를 표시했다. scope 단방향 전환에서는 발생하지 않는다. 실제 Picker 소스와 실제 useAsync의 최소 재현은 `new A success, alert: false` 다음 `old A failure after new A success, alert: true`였다. 작업 디렉토리 `static/ui`, Node stdin, exit 0, chunk `4aab68`. 데이터·저장 권한 확대는 없으나 현재 scope의 늦은 응답 차단 계약과 어긋난다. freeze 이후 확인하여 리더에게 먼저 보고했고, key 변경마다 고유 token을 만들어 callback이 identity를 검사하는 최소 수정 방향을 전달했다.

리더 승인 후 `WorklogIssuePicker.jsx:27`은 key 전환마다 고유 객체 token을 만든다. callback은 캡처한 token의 identity를 검사하고 기본 실패 기록도 동일 token으로 저장·비교한다. 따라서 다시 A로 돌아와 문자열이 같아져도 과거 A 요청·실패 기록을 재사용하지 않는다. 실제 useAsync 회귀 3개는 늦은 성공·실패와 이미 기록된 기본 실패의 재등장 금지를 각각 확인한다. 최종 코드 교차 검수를 완료했다.

## 실행 증거

전체 검증은 리더가 단독 실행하며 검수자는 같은 전체 명령을 중복 실행하지 않는다.

| 검증 | 작업 디렉토리·명령 | 결과 |
|---|---|---|
| 번역 merge | app root, `npm run merge` | 리더 실행 exit 0, chunk `a551e4`. |
| 대상 회귀 9개 suite | `static/ui`, 아래 명령 | 담당자 최종 실행 exit 0, 9 suites / 143 tests, 9.159초, 세션 `77596`, chunk `626e2c`. 실제 Form 3건, 실제 useAsync 16건을 포함해 새 기능·공용 필터·기존 시간/ADF/write 경계를 확인했다. |
| Backend 전체 | app root, `npm test -- --runInBand` | 직전 RFC-213~215의 exit 0 / 144 suites / 1965 tests / 85.728초 결과 재사용. 리더가 당시 검증 후 src 전체 diff가 동일함을 확인했고, 이번 변경은 frontend·번역에 한정된다. 이번 RFC에서 backend 명령을 새로 실행한 것으로 표기하지 않는다. |
| Frontend 전체 | `static/ui`, `npm test -- --runInBand` | 리더 최종 exit 0, 140 suites / 2,210 tests / 1 snapshot, 59.155초, 세션 `42046`, chunk `be80b4`. 마지막 token 수정 포함. |
| CI 빌드 | `static/ui`, `CI=true npm run build` | 리더 최종 exit 0, 세션 `46266`, chunk `465800`. app gzip 491,294/950,000 bytes, panel 329,459/350,000 bytes로 양쪽 예산 통과. 기존 vendor source-map/Browserslist 경고만 남았다. |
| Forge lint | app root, `pwd` 확인 후 `forge lint` | 리더 최종 exit 0, `No issues found`, 세션 `91749`, chunk `ed5b86`. build 완료 후 순차 실행. 기존 `PermissionLinter: Unknown product` 및 CLI 13.4.0 업데이트 경고가 남았다. |
| 공백 검사 | app root, `git diff --check` | 최종 token 수정 뒤 exit 0, chunk `a506d6`. LF/CRLF 정규화 안내만 출력. |

대상 회귀의 실제 실행 명령:

```powershell
npm test -- --runInBand --silent --runTestsByPath src/pages/myWork/modal/__test__/worklogIssueSearch.test.jsx src/pages/myWork/modal/__test__/WorklogIssuePicker.test.jsx src/components/filter/__test__/ProjectFilterDropdown.test.jsx src/pages/myWork/modal/__test__/WorklogModalSpaceFilter.test.jsx src/pages/myWork/modal/__test__/worklogTimeRange.test.js src/pages/myWork/modal/__test__/commentLoadState.test.js src/components/worklog/__test__/worklogWrite.test.js src/components/worklog/__test__/useWorklogComment.test.js src/components/worklog/__test__/adfLossy.test.js
```

최종 이전에 실행된 전체 FE 2회(2,204건 / 2,207건)와 빌드는 진행 중 보완보다 앞선 중간 결과다. 마지막 token 수정 후 실행 결과를 최종 증거로 별도 기록하며, 이전 결과를 최종 소스의 통과로 혼용하지 않는다. 초기 실제 Form 3건의 수정 후 통과 증거는 chunk `02757a`였고, callback 방식으로 바뀐 이후에는 리더가 Select 스킨을 실제 callback 계약에 맞췄다. 최종 대상 회귀도 동일 실제 Form을 사용한다.

최종 frontend 전체/CI 빌드 전후 대상 14개 파일의 SHA256이 동일함을 리더가 확인했다. 검증 중간의 변경을 최종 결과에 섞지 않았으며, 빌드 완료 후 app root에서 Forge lint를 순차 실행해 통과했다.

## 미검증·범위 제한

- 실제 Jira 설치 환경의 브라우저 조작·사용자별 Browse/WORK_ON_ISSUES 권한·실제 페이지 응답·워크로그 저장 E2E는 실행하지 않았다.
- Forge lint 명령은 exit 0이지만 `PermissionLinter: Unknown product` 경고로 일부 권한 검사는 실행되지 않았다. 이번 RFC는 권한·scope·schema를 변경하지 않으며, 이 경고를 실제 권한 검증 통과로 간주하지 않는다.
- 이슈 검색은 기존 요청당 100건 제한을 유지하며 이번 변경은 이슈 전량 페이지 UI를 추가하지 않는다. 스페이스 후보만 마지막 페이지까지 수집한다.
- 후보 페이징 중 서버의 프로젝트 목록이 동시에 바뀌는 상황에 대한 Jira의 일관성 보장은 이번 클라이언트 변경 범위 밖이다.
- 배포·설치·푸시를 하지 않았다. RFC 커밋 `afa4bd4`는 사용자 승인 범위에서 리더가 수행했으며 검수자는 커밋하지 않았다.
