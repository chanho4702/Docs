# RFC-216 프론트엔드 구현 보고서

기준: 2026-09-30, 시작 HEAD `9f8aaf5`, `00_input/requirement.md`와 `01_architect_design.md` 및 리더의 최종 재시도 계약. 기존 협업 모드 변경·타 작업자 파일은 보존했다. 커밋·푸시·배포·설치는 하지 않았다.

## 1. 결과와 변경 범위

워크로그 생성의 이슈 선택에 Jira 스페이스 다중 필터를 추가했다. 기본/선택 해제는 전체, 복수 선택은 OR이며 Jira 검색 전에 JQL 조건으로 적용한다. 초기 이슈가 있는 생성에서도 사용할 수 있고, 실제 워크로그 편집에는 노출하지 않는다.

| 파일 | 변경 |
|---|---|
| `static/ui/src/pages/myWork/modal/WorklogModal.jsx` | 기존 issueKey Field 안에 전용 Picker 연결, 선택 없음/선택 ID 불일치 제출 차단, 열림 상태 변경 시 선택 상태 초기화, defaultIssueOption 참조 안정화 |
| `static/ui/src/pages/myWork/modal/WorklogIssuePicker.jsx` | 스페이스 필터·이슈 검색·오류·재시도, 실제 Form submitting 구독, 필터/범위/모달 세대 경계와 늦은 응답 차단 |
| `static/ui/src/pages/myWork/modal/worklogIssueSearch.js` | 기존 JQL 조건을 유지하는 검색 helper, 공용 quoteJqlValue 재사용, 실패 envelope/잘못된 응답 shape 검사 |
| `static/ui/src/pages/myWork/modal/useWorklogSpaceOptions.js` | 사용자 스페이스 전체 페이지 조회, key 중복 제거·offset/무진행 검증, 전용 Query 캐시 |
| `static/ui/src/components/filter/ProjectFilterDropdown.jsx` | optional labelKeys/isDisabled 확장. 기본 라벨·다중 선택 의미 유지 |
| `static/ui/src/utils/queryKey/jiraKeys.js` | `worklogSpaces(accountId)` 목적별 키 추가 |

새 담당 테스트는 `worklogIssueSearch.test.jsx`, `WorklogIssuePicker.test.jsx`, `ProjectFilterDropdown.test.jsx`다. `WorklogModalSpaceFilter.test.jsx`는 리더가 작성했으며 본 작업자는 수정하지 않았다.

모달 소비자는 `WorklogPage`(RMS ID 배열)와 `ProjectCalender`(단일 RMS ID)로 동일하다. 공용 필터 기존 소비자 4곳인 큐·트리·간트·맵은 기본 props를 유지하며 수정하지 않았다.

## 2. 조회·응답·권한 계약

- 스페이스: 기존 `executeRequest('getProjects', {action:'browse',status:['live'],maxResults:100,orderBy:'name',startAt})`를 사용한다. 실제 생성이 열린 경우에만 사용자 자격으로 호출한다.
- `{values,startAt,isLast}`를 검증하고 마지막 페이지까지 순차 조회한다. key 중복을 제거하며 offset 불일치, 비배열, 비정상 key, 계속된다는 빈 페이지, 신규 후보가 전혀 없는 반복 페이지는 오류다. 마지막 페이지 반복도 성공으로 인정하지 않는다. 부분 후보를 전체 성공으로 노출하지 않는다.
- 후보 성공 형상은 `[{value:key,label:name(key),avatarUrl}]`이다. 정상 빈 배열과 오류를 구분한다. Promise reject·실패 envelope를 처리하고 오류 메시지와 재시도를 제공한다.
- 이슈: 기존 RMS 연결 조건, 선택된 RMS 프로젝트 범위, `(movesRmsCoworkers = currentUser() OR assignee = currentUser())`를 유지한다. 스페이스는 `AND project IN (...)`으로 교집합 적용한다.
- 단일/배열 RMS ID를 지원한다. key 정렬·중복 제거와 기존 공용 JQL quote helper를 사용한다. 검색어 의미는 유지하면서 따옴표·백슬래시를 escape한다.
- 이슈 요청의 `fields:['*all']`, `properties:['movesRms']`, `fieldsByKeys:true`, `maxResults:100` 및 `{label,value:issue.id,issue}` 옵션 형상을 유지한다. 이슈 전량 수집이나 새로운 페이지 UI는 추가하지 않았다.
- backend resolver·PermissionMap·manifest·저장 payload는 변경하지 않았다. 기존 사용자 자격 조회와 Jira WORK_ON_ISSUES/EDIT_OWN_WORKLOGS 사전 검사 및 최종 Jira 인가를 유지한다.

## 3. 상태·캐시·실패 처리

- 후보 키는 `jiraKeys.worklogSpaces(accountId)`, staleTime 60초다. 기존 `projectSearch(query)`의 다른 shape/범위나 다른 사용자 캐시와 혼용하지 않는다. 후보는 저장으로 바뀌지 않으므로 새 mutation 무효화는 없다.
- 이슈는 기존 AsyncSelect 캐시를 유지한다. RMS 범위·사용자·열림/편집 상태·스페이스 Set·재시도 세대를 key에 반영하여 내부 옵션 캐시를 분리한다.
- 요청의 활성 여부와 기본 목록 실패 기록은 key 문자열이 아니라 전환마다 새로 만든 객체 token으로 판별한다. RMS A→B→A처럼 같은 문자열로 돌아와도 첫 A의 지연 응답이나 이미 기록된 실패는 새 A에서 재사용하지 않는다.
- 필터 변경 시 Form의 `fieldProps.onChange(null)`과 `selectedIssue`를 함께 해제한다. 동일한 Set 적용은 no-op다. 날짜·시간·코멘트·기간 설정은 건드리지 않는다.
- 제출은 선택 ID와 현재 이슈가 일치해야 진행한다. 실제 Form submitting 중 필터와 이슈 선택이 잠기며 handler에서도 변경을 막는다.
- 이전 defaultIssueOption은 매 렌더 JSX 객체를 새로 만들었다. 실제 Atlaskit Field의 기본값 비교에서 React owner 순환 참조 오류가 발생하여 `useMemo([issue])`로 안정화했다.
- 실제 설치된 AsyncSelect의 cache-hit 분기는 진행 중 요청을 취소하지 않는다. 따라서 Promise-return 방식 대신 callback 방식의 loadOptions를 사용하며 오래된 검색의 성공/실패는 callback 자체를 호출하지 않는다. 빈 배열을 반환해 현재 캐시를 덮는 경합도 피한다.
- 기본 목록은 검색 결과와 별도로 처리한다. 늦은 기본 목록 실패를 현재 검색 중에는 숨기되, 검색어가 비거나 나중에 지워지면 같은 범위의 실패와 재시도를 표시한다. 범위가 다른 실패 기록은 재사용하지 않는다.
- 최종 합의: 이슈 검색 재시도는 선택 스페이스를 유지하고 검색어를 비워 기본 목록을 재조회한다. 검색어를 유지한 채 재마운트하면 필터된 결과가 defaultOptions가 되어 이후 clear와 맞지 않는 실제 라이브러리 동작을 방지한다.

## 4. 번역과 공유 파일

사용한 신규 키는 `worklog.modal.spaceFilter.{label,all,selected}` 및 `worklog.error.{spaceLoadFailed,issueLoadFailed}`다. 재시도·필수 오류·빈 후보 문구는 기존 키를 재사용한다.

두 언어 원본과 merge/generated는 리더 소유다. 본 작업자는 번역 원본·생성물을 수정하거나 merge를 실행하지 않았다. 전체 CI 빌드의 merge 결과는 리더의 최종 검증 보고서에서 확정한다.

## 5. 검증

최종 앱 소스 및 대상 테스트 수정 후 다음 명령을 `C:\CloudJira\moves-workforce\static\ui`에서 실행했다.

```powershell
npm test -- --runInBand --silent --runTestsByPath src/pages/myWork/modal/__test__/worklogIssueSearch.test.jsx src/pages/myWork/modal/__test__/WorklogIssuePicker.test.jsx src/components/filter/__test__/ProjectFilterDropdown.test.jsx src/pages/myWork/modal/__test__/WorklogModalSpaceFilter.test.jsx src/pages/myWork/modal/__test__/worklogTimeRange.test.js src/pages/myWork/modal/__test__/commentLoadState.test.js src/components/worklog/__test__/worklogWrite.test.js src/components/worklog/__test__/useWorklogComment.test.js src/components/worklog/__test__/adfLossy.test.js
```

**통과: 9 suites / 143 tests, exit 0.** RMS A→B→A 후속 보정까지 적용한 최종 실행 증거: PTY `77596`, 마지막 출력 chunk `626e2c`, 9.159초. 파일 로그는 별도로 생성하지 않았다. 대상 diff의 `git diff --check`도 exit 0이다.

주요 회귀:

- 전체/단일/복수/해제 JQL, RMS 범위·담당자 OR 보존, 문자열 escape, 이슈 100건 유지.
- 후보 다중 페이지/중복/마지막 페이지, 잘못된 shape·offset 정체·반복, 마지막 페이지 실패 후 처음부터 재시도, 취소, 정상 빈 목록, 사용자별 캐시 분리.
- 실제 Atlaskit Form에서 초기 이슈 유지→필터 변경→선택 해제→미선택 제출 차단→새 이슈 저장, 날짜·시간·코멘트 보존, 편집과 모달 재진입.
- 실제 설치된 useAsync hook에서 스페이스 지연 성공/실패, 캐시 A→B pending→캐시 A 복귀 뒤 B 성공/실패, 실패→재시도→검색→clear, 기본 목록 실패와 clear의 두 가지 순서, RMS 범위 변경, RMS A→B→A 순환 후 이전 성공·실패·실패기록 차단, 언마운트와 재진입.
- 저장 중 선택 잠금, 공용 필터 기존 라벨·선택/해제·override, 기존 시간·ADF 손실 보호·워크로그 write 회귀.

전체 frontend/backend 테스트·CI 빌드·Forge lint는 리더 소유로 본 작업자가 중복 실행하지 않았다. 실제 Jira 설치 브라우저 동작은 미검증이다. 기능상 제한은 기존과 같은 이슈 검색 첫 100건이며, 스페이스 후보만 전량 조회한다.
