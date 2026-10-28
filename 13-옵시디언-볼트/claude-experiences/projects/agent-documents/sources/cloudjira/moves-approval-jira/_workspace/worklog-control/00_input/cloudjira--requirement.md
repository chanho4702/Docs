# worklog-control — 워크로그 통제권 이관 (우리 화면으로만 CRUD)

작성일: 2026-10-10. 근거: 사용자 요구(2026-10-10). 선행: period-lock(시간 추적 제공자), worklog-certification-model(인증), audit-trail(감사).

## 1. 사용자 요구 (원문 요지, 확정)

1. **워크포스 연동 이슈**: 워크로그가 등록된 시점부터 **통제권이 완전히 우리에게** 넘어온다. 입력·수정·삭제는 **우리 작업 로그 탭(issueActivity)·우리 화면으로만**. **특정 옵션이 켜지면 이슈 시작일~종료일 사이에만** 추가·수정·삭제 가능.
2. **워크포스 미연동**: 승인·인증되지 않은 워크로그는 CRUD 가능. **승인·인증된 워크로그는 사용자가 수정·삭제 못 한다**(앱이 통제).
3. "일단 다 구현해 보고 실측으로 확인한다."

## 2. 플랫폼 사실 (리더 확인, 2026-10-10 — 문서 근거)

- Jira 에는 워크로그 저장 **전** 앱이 거부할 hook 이 없다(validator 는 상태 전환만).
- 워크로그 작성자는 호출 주체다(API 로 작성자 지정 불가) → **작성은 asUser 필수**(asApp 작성 시 작성자가 앱).
- 권한 스킴에 "Work on work items"(작성), "Edit own / Edit all worklogs", "Delete own / Delete all worklogs" 가 **분리**돼 있다. 사용자에게서 **Edit own·Delete own 을 빼면** 모든 경로(웹·REST·모바일·자동화)에서 수정·삭제가 막힌다(정식 권한 판정).
- Jira Cloud 기본 권한 스킴에는 앱용 역할 `atlassian-addons-project-access` 가 있다 → 앱(asApp)이 Edit all·Delete all 을 가질 수 있다(실측 필요: 고객 스킴에 그 권한이 그 역할에 있는지).
- 워크플로 상태 속성 `jira.permission.work.denied` 등은 Cloud 문서에 있으나 REST 차단·팀 관리형 지원은 **문서 근거 없음**, "버그 가능" 경고, 전환 중 로그 작성 실패 버그(JRASERVER-70504). → 보조 수단(선택)으로만.
- 시간 추적 제공자 선택 시 기본 Log work 버튼·작업 로그 탭이 숨는다(UI 경로).

## 3. 설계 방향 (리더 권고 — 설계가 검토·확정)

- **수정·삭제 = asApp, 앱이 규칙 검사 후 실행.** 고객 관리자 설정: 사용자에게서 Edit own/Delete own 회수, 앱 역할에 Edit all/Delete all. 우리 화면의 수정·삭제 resolver 는 (본인 작성분 확인, 승인·인증 잠금, 연동 시 기간 창, 마감·잠금 기간) 검사 후 asApp 으로 PUT/DELETE. 감사 이력에는 행위자를 **호출 사용자**로 기록(source APP). AGENTS.md asApp 허용 목록 확장 필요(사유·범위·검사 순서 명시).
- **작성 = asUser**(작성자 보존). 우리 화면에서 기간 창·정책 사전 검사.
- **다른 경로로 새로 생긴 워크로그**(차단 불가): 감지 → 정책 `foreignWorklogAction`: FLAG(기본: 표시·인증 제외·감사) / DELETE(앱이 asApp 삭제 + 작성자·팀장 알림). 연동 이슈에만 적용 여부도 정책.
- **기간 창 옵션** `worklogDateWindow`(OFF 기본): 워크포스 연동 이슈에서 작업 날짜(started)가 [이슈 Start date, Due date] 밖이면 추가·수정·삭제 거부. 이슈 시작일 = Jira "Start date" 필드(워크포스 간트가 `customfield_10015` 사용 — **id 는 사이트마다 다를 수 있으니 이름/스키마로 탐색**), 종료일 = duedate. 바깥 경계로 워크포스 프로젝트 기간(워크포스 DB — 서명 프로퍼티 `rms.pm`/`rms.policy` 로 받을 수 있는지 확인, 없으면 계약 추가 항목으로). 빈 값이면 그쪽 제한 없음.
- **연동 판정**: audit-trail 설계의 "서명 검증된 워크포스 연결" 판정 재사용(불변식 9).
- **미연동 사이트**: 승인(타임시트 APPROVED)·인증(CERTIFIED) 워크로그는 우리 화면에서 수정·삭제 거부, Jira 경로는 권한 회수로 불가. 미승인은 자유.
- **수동 재오픈 방지 등 상태 속성 경로**는 선택 보조(가이드).
- 관리자 설정 화면에 **권한 스킴 점검**(현재 스킴이 사용자에게 Edit own/Delete own 을 주고 있는지, 앱 역할에 Edit all/Delete all 이 있는지 — `mypermissions`/`permissionscheme` 조회) + 설정 가이드.

## 4. 범위 밖

- 다른 경로 **작성** 원천 차단(플랫폼상 불가). 팀 관리형 프로젝트(권한 스킴 편집 불가) — 지원 범위 문서화.

## 5. 완료 기준

- asApp 쓰기 경로의 검사 순서·권한 범위 계약 테스트(본인 것만, 잠금·기간·마감 거부, 감사 기록).
- 유휴 SQL 추가 0(이벤트 경로만). 새 스케줄 없음.
- 미검증 목록: 앱 역할 Edit all/Delete all, asApp PUT 시 author 유지·updateAuthor=앱, asApp DELETE 이벤트 행위자, Start date 필드 탐색, 상태 속성 REST 차단.
