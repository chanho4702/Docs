너는 Forge Jira 앱 moves-workforce(이 디렉터리, 브랜치 RFC-220)의 독립 코드 검토자(3차, 최종). **결함만** 찾아라. 없으면 "결함 없음"이라고만. 발견 시 P1/P2/P3·근거 파일:행·재현 순서를 한국어로. 파일은 네가 직접 읽어라(읽기 전용, 테스트 실행 불가 가정).

## 배경
연동 모드 워크로그 asApp 읽기 전환(F1·F2·F3) — 설계 `_workspace/rfc220-review/04_fix_design.md`, 구현 보고 `_workspace/rfc220-review/05_fix_report.md`(§00 "검토 반영 2차", §0 "검토 반영 1차"). 2차 검토(네가 낸 P1 1·P2 4)의 반영: `PrincipalResolver.workforceRegistered`(users 행 기준, 조회 실패 false) 만으로 앱 자격 판정; cert.query 쌍은 현재 행 쌍 → 보충 쌍(12개월 상한) 순, 한도 시 `truncated`; 삭제 승인분 이슈는 `id IN` 1회 보충; 드로어는 프론트 표시 id(`worklogIds`)를 받아 `worklog/list` 직접 판정 + `truncated`; `/field` 오류는 `APP_FIELD_UNAVAILABLE` 로 멈추고 캐시 안 함.
변경 범위: `git diff -- src static/ui/src AGENTS.md` + 새 파일(src/permission/*ReadAuthority.js, src/api/jira/issue/AppReadScope.js, src/resolver/approvalLink/IssueIndex.js, 테스트들).

## 검토 질문
1. 2차 지적 5건이 **실제로** 막혔는가(각 재현 순서를 새 코드에 대입). 특히 `workforceRegistered` 가 모든 앱 자격 경로(진척도·원가·대시보드·관계 그래프·협업·내 작업·드로어·이슈 분석)에서 유일한 근거인지, 어느 경로가 `isUser`·`projectScope` 로 우회하는지.
2. 새로 생긴 결함: 드로어의 `worklogIds` 직접 읽기가 **다른 이슈·다른 프로젝트의 id** 를 받아도 막는가(이슈 일치 검사의 위치·asApp 응답 대조)? 프론트가 보낸 id 수 상한은?
3. `truncated` 플래그가 approvalBasis·응답에 실릴 때 프론트 계약(기존 키 유지)과 캐시 키(조회자·truncated 포함?)가 맞는가. truncated 응답이 캐시되어 다음 조회자에게도 잘린 결과를 주는가?
4. 보충 쌍 12개월 상한으로 **12개월 이전 삭제 승인분**이 사라지는 화면(원가·연간 보고서)이 있는가 — 설계 의도상 허용 가능한지, 아니면 기간 필터로 걸러야 하는지.
5. `APP_FIELD_UNAVAILABLE` 이 연동 OFF 경로에서도 던져지는가(OFF 는 앱 필드가 필요 없을 수 있다) — OFF 회귀.
6. 응답 shape·오류 코드 프론트 매핑(`JQL_INPUT_INVALID`·`APP_FIELD_UNAVAILABLE` 문구 kr·en), merge 된 번역 파일 갱신.
7. 그 밖의 회귀.
