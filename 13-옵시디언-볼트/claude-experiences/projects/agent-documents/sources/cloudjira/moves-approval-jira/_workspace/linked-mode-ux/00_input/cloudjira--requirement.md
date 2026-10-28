# linked-mode-ux — 워크포스 연동 모드 UX 통합 (요구)

- 작성: 2026-10-13 · 리더(Claude) · 사용자 결정 6건을 한 묶음으로
- 리포: 승인 앱 `C:\CloudJira\moves-approval-jira`, 워크포스 `C:\CloudJira\moves-workforce`
- 선행 설계: `_workspace/workforce-link/01_architect_design.md`(서명 계약·org 게시·§4.7), `_workspace/worklog-control/01_architect_design.md`(채널·HANDOFF·Q121·불변식 8 예외), `_workspace/worklog-policy-ux/01_architect_design.md`(정책 패널), `_workspace/operating-mode/01_architect_design.md`(연동 판정 단일화), `_workspace/settings-restructure/01_architect_design.md`(설정 묶음)

## 배경 — 사용자가 본 문제 (2026-10-13)

1. "워크포스랑 어프로벌 동시 사용 시 워크로그 쌓는 진입점이 하나였으면 좋겠다." 지금은 연동 이슈 = 작성은 워크포스·수정·삭제는 승인 앱, 비연동 이슈 = 전부 승인 앱. 화면이 양쪽에 다 뜨고 서로 "저쪽에서 하세요" 안내만 띄운다.
2. "연동 시 결재권자가 동기화되고 어프로벌에도 표시됐으면." 판정은 이미 `WorkforceOrgSource.forSubject` → `TimesheetRouting` 1단계로 동기화됨. **표시**가 없다(팀 탭은 명부만, 내 타임시트는 '워크포스' 배지와 팀명뿐).
3. "'이 이슈에서 다르게 적용할 항목'을 Jira 이슈에 붙이면 안 된다 — 관리자가 설정할 항목. 설명도 직관적이지 않다."
4. "연동 모드일 때 워크포스 작업 관리 하단에 결재 관련·이슈 상세 정책 메뉴." 워크포스 `ProjectWorkPanel` 의 '승인 설정' 보기(`IssueApprovalSettingTable`, 계약 `TYP.RMS_ISSUE` 본문 `s/e/pa`)가 이미 있으나 작성 기간·사전 승인 두 항목뿐.
5. "메뉴·사용자별 권한 — 일반 사용자는 요청·내 승인 이력, 관리자는 이력·승인 관리. 구분이 되어 있나?" 반만: 팀장 탭만 가려지고 '관리 > 설정'은 전원에게 보임(서버만 거부), 일반 사용자 이력은 세 곳에 흩어짐, 관리자 승인 관리 화면 없음.
6. 이슈 화면 하단 잘림 — **이미 수정**(`static/ui/src/app/base.css`, 커밋 전). 설계 범위 밖, 변경 이력에만 기록.

## 사용자 결정

- **① 쓰기 창구는 승인 앱으로 통일** ("그치 통일하는 게 맞을듯"). 연동 모드에서 작성·수정·삭제 전부 승인 앱이 맡는다.
- ②~⑤는 리더 권장안대로 진행.

## 요구

### ① 워크로그 쓰기 창구 통일 (양쪽 리포)
- 연동 모드(`isWorkforceLinkEnabled()`)에서 연동 이슈의 **작성**도 승인 앱이 맡는다. 승인 앱 `WorklogControlContext.channel` 의 `'WORKFORCE'` 분기(연동 이슈 작성 차단, Q121 A)를 걷어 내고 항상 `'APP'`. 프론트의 `channelWorkforce` 안내·`LINKED` 상태 분기 정리.
- 워크포스 작성 폼 4곳(마이워크 `WorklogModal`, `WorklogPage`, 캘린더 `worklogDrop`, 이슈 패널 `PanelWorklogForm`)은 연동 모드에서 **"승인 앱에서 기록" 버튼**(기존 HANDOFF 경로 `control.globalPagePath + issueId/new` 재사용)으로 교체. 워크포스 `createChannelOf` 의 `DIRECT`(ch === 'WORKFORCE') 경로는 연동 모드에서 사라진다.
- `movesRms.origin` 서명 봉투(WF-12): 승인 앱이 직접 쓰면 "워크포스 정상 입력" 증거가 필요 없어진다. 봉투·`WF_ORIGIN_CAPABILITY` 게이트·`wlorigin.js` 의 잔존 필요성(기존 데이터 호환, 통제 Phase 게이트)을 설계에서 판정.
- 단독 모드(연동 꺼짐)는 변경 없음. 승인 앱을 안 깐 워크포스 단독은 지금처럼 워크포스가 직접 POST.
- 워크포스 **읽기**(마이워크·캘린더·대시보드·원가의 워크로그 조회·숨김 본인 기록 WF-7)는 유지.

### ② 결재자 표시 (승인 앱)
- 설정 > 타임시트 > 팀 탭: "워크포스에서 받은 팀" 읽기 전용 섹션 — 팀명·팀장·팀원·마지막 수신 시각·검증 상태(VERIFIED/STALE/NONE). 명부 팀과 겹치는 사람은 '워크포스 우선' 배지(= `overriddenSubjects`).
- 내 타임시트·타임시트 상세의 결재선에 **결재자 이름** 표시(지금은 출처 배지·팀명만).
- 원천은 `WorkforceOrgSource`(검증된 `movesRms.org`)뿐. 워크포스 DB 무증가, 불변식 9(검증 전 프로퍼티 불신), 불변식 7(관리자 화면도 가드 통과 ≠ 범위 — 팀 목록은 관리자 축, 사람 조회는 asUser 로 displayName).
- 관리자 팀 목록을 위해 "사이트의 모든 org 게시물"을 어떻게 모으는지(사용자 프로퍼티는 사용자별 — 열거 경로·호출량·캐시)는 설계에서 확정. 유휴 SQL 예산 유지.

### ③ 이슈 화면 정책 패널 이동 + 문구 (승인 앱)
- **원칙(사용자, 2026-10-13 추가): 이슈 화면(우측 칸·하단 패널·작업 로그 탭)에서 사용자가 하는 일은 네 가지뿐 — 워크로그 기록, 기록한 것 보기, 승인 요청, 이력 보기.** 이슈별 정책을 손보는 UI 는 이슈 화면에 두지 않는다. 정책은 관리자(단독: 승인 앱 설정) 또는 팀장(연동: 워크포스 작업 관리)이 설정 화면에서 건다.
- `WorklogTab` 하단 `<details data-testid="worklog-issue-policy">`(`WorklogPolicyPanel scope="issue"`) 제거. 작업자에게는 "지금 이 이슈에 적용되는 규칙" 요약 한 줄(기록 가능 일수·하루 상한 정도)만.
- 우측 "Moves Approval" 칸의 **"워크로그 승인 결재선" 선택**(`WorklogApprovalPolicyPanel` → `selectIssueWorklogApprovalFlow`)도 이슈별 정책 편집이므로 이슈 화면에서 제거. 이슈 화면에는 "이 이슈의 워크로그는 [결재선 이름]으로 승인됩니다" 읽기 전용 한 줄만. 선택은 단독 모드 = 프로젝트 설정(이슈 예외 목록의 한 열), 연동 모드 = ④ 워크포스 승인 설정 표. 선택이 없어 요청이 막히는 경우의 안내(누구에게 가서 설정하라)는 에러 코드로.
- 단독 모드: 승인 앱 프로젝트 설정 > 정책 탭에 "이슈 예외" 목록(이슈 키 골라 추가, 행별 재정의 편집·삭제). 기존 resolver(`getWorklogPolicy`/`saveWorklogPolicy` scope=issue, expectedRevision·override)는 재사용.
- 연동 모드: 이슈별 재정의 편집은 ④(워크포스)에서. 승인 앱 쪽은 읽기 전용 표시.
- `worklogPolicy.*` 문구 전면 재작성 — `hierarchy`·`lockNotice`·`retentionNotice`·`writeNotice`·`counterNotice`·`refreshHelp`·`authority.*` 의 내부 용어(FRESH/STALE, EXTRA_STEP, 원자적, rev, kid) 제거. 안내 2문장 이내. 진단·수신 상태는 관리자 설정의 "상태 정보(지원용)" details 로만.

### ④ 워크포스 작업 관리 > 승인 설정 표 확장 (양쪽 리포, 계약 변경)
- `IssueApprovalSettingTable` 에 이슈별 상세 정책 키 추가: `createWindowDays`·`editWindowDays`·`deleteWindowDays`·`dailyMaxSeconds`·`weeklyMaxSeconds`·`futureDateAllowed`·`pastDateMaxDays`(승인 앱 `policyFields` 중 이슈 범위 허용 키와 일치). 결재 관련: `approvalMode` 선택, 이 프로젝트 PM·대상자 팀장 **읽기 전용** 표시.
- 서명 계약 `TYP.RMS_ISSUE` 본문 확장(`s/e/pa` + 정책 키). `validateBody`·`issueSettingPlan`·승인 앱 `verifyOwnIssueSetting` 소비·`WorklogPolicy` 해석기의 `WORKFORCE_ISSUE` 출처 반영. 버전 필드로 구판 문서 호환.
- 일괄 적용 모달도 같은 키. 직속 팀장만 편집(현행).
- 워크포스 DB 무증가 — 이슈 프로퍼티에만 실린다.

### ⑤ 메뉴·역할 재구성 (승인 앱)
- 공통 맥락 응답(`getTimesheetContext` 또는 새 `getPrincipalContext`)에 `isAdmin`(앱 관리자 명부 ∪ Jira 관리자, 서버 판정) 추가. 업무함 '관리' 묶음은 `isAdmin === true` 일 때만 렌더(서버 가드는 그대로).
- 일반 사용자 '내 이력' 탭: 처리한 건 + 내 요청 완료분 + 내 타임시트 제출·결정 이력을 한 화면(종류 칩·기간 필터). 기존 SELF 축 resolver 재사용, 새 resolver 는 필요 최소.
- 관리자 '승인 관리' 1차 메뉴: 전체 결재 현황(종류·상태·기간 필터, 건별 이슈 열람 권한으로 재범위 — 불변식 7)·개입(기존 jiraAdmin 축 resolver)·독촉. '기록' 1차 메뉴: 감사(결재·인증·설정·워크로그 변경)·보관·내보내기 — 설정 > 기록 묶음에서 꺼낸다(URL 읽기 호환 유지).
- 설정은 정책·결재 구성만 남긴다. `settingsNavigation` 그룹 재편, 기존 `section`·옛 `setting=` URL 호환 유지.

## 완료 기준
- 연동 모드 연동 이슈에서 워크포스 어느 화면에서도 워크로그 POST 가 나가지 않고(테스트로 고정), 승인 앱 Log work·탭·전역 페이지에서 작성·수정·삭제가 된다. 단독 모드 경로는 기존 테스트 그대로 녹색.
- 설정 > 팀 탭에 워크포스 팀이 보이고, 내 타임시트에 결재자 이름이 보인다. 워크포스 DB 스키마 무변경.
- 이슈 작업 로그 탭에 편집 가능한 정책 패널이 없다. 프로젝트 설정(단독)·워크포스 승인 설정 표(연동)에서 이슈 예외를 편집할 수 있다.
- 비관리자 업무함에 '관리' 묶음이 없고, 관리자에게 '승인 관리'·'기록' 메뉴가 있다. 계약 테스트(`permissionMap.contract`)·i18n merge·빌드 통과.
- 양쪽 리포 jest·빌드 통과. 유휴 SQL 쿼리 수 테스트 변동 없음.

## 범위 밖
- ⑥ 하단 잘림(완료). 외부 알림 채널. 워크포스 작업 관리 탭 자체의 재배치. 결재선 엔진 변경(단계 추가만 있던 현행 유지). Jira 네이티브·REST·자동화 경로 차단(기존 감지·재승인 유지).

## 열린 질문 (설계가 먼저 답할 것)
- Q1. `movesRms.origin` 봉투를 완전히 없앨 수 있나, 아니면 기존 데이터·통제 Phase 게이트 때문에 "읽기 호환만" 남기나.
- Q2. 관리자 팀 탭을 위한 org 게시물 열거 경로(사용자 프로퍼티 전수 조회 vs 워크포스가 사이트 단위 요약 문서를 추가 게시). 후자는 워크포스 변경·계약 추가.
- Q3. `TYP.RMS_ISSUE` 확장 시 구판(`s/e/pa` 만) 문서 호환 — 버전 필드 추가 vs 키 부재를 "미설정"으로 해석.
- Q4. '내 이력'·'승인 관리' 목록의 데이터 양 — 기존 업무함 목록 resolver 페이지네이션으로 충분한지, 새 인덱스 필요한지(SQL 추가 = major upgrade).

## 설계 열린 질문에 대한 답 (사용자, 2026-10-13)
- 전제: 승인 앱 master 를 `linked-issue-schedule`(3c9368f) 로 fast-forward 병합 — **승인**.
- Q142 결재선 선택(연동 모드) → **(a) 워크포스 승인 설정 표**(`approval.flows` 계약 추가, ④b 로 분리).
- Q146 W-8a(워크포스 org 팀 칸 게시) → **(a) 포함하지 않음**. ② 화면은 빈 상태 안내로 먼저, 데이터는 G1 실측 뒤.
- Q144 승인 관리의 타임시트 노출 → **(a) 기존 열람 규칙 유지**(관리자는 건수만).
- Q140·Q141·Q143·Q145·Q147·Q148 → 설계 기본안 그대로.

## 검토
- 설계 후 코덱스 독립 검토 1회(`_workspace/linked-mode-ux/codex-review.md`). 모델은 메모리 `codex-model-cost` 기준.

## 범위 축소 (사용자, 2026-10-13 — 구현 후 결정)
- **④ 팀장 승인 설정 표에는 이슈별 통제 항목만 둔다: 작성 기간(s/e)·사전 승인(pa)·결재선(fl).** 기록 규칙 7키(create/edit/deleteWindowDays·daily/weeklyMaxSeconds·futureDateAllowed·pastDateMaxDays)는 사이트 관리자 설정에만 남기고 팀장 표·계약(`rms.issue.pol`·`ISSUE_POLICY_KEYS`)·일괄 적용·승인 앱 소비("더 엄한 쪽" `stricterSetting base`·`linkedWithBase`·`polOpen`)에서 **전부 제거**한다.
- 이유: 워크로그는 일반 사용자가 쓰고 팀장은 결재한다. 하루 최대 시간 같은 근태 규칙을 팀장이 작업마다 정하는 것은 자연스럽지 않다. 이로써 "사이트 상한" 질문(팀장 값이 사이트보다 느슨할 때)은 사라진다 — 팀장이 사이트 규칙을 건드릴 일이 없다.
- Q-WF1(PM 표시): 워크포스에 프로젝트 PM 데이터가 없으므로 **담당자 팀장만 표시**(a). 
- 계약 `rx` 토큰 `rms.issue.v2` 는 `fl` 추가분만을 뜻하게 된다(이름 유지 가능 여부는 구현이 판단, 벡터 재생성).

## 수정 회차 1 리더 결정 (2026-10-13, 검증 D-1·F-4·코덱스 반영)
- D-1: 연동 스위치 OFF 라도 승인 앱 통제 문서가 걸린 이슈는 **작성도** 승인 앱으로 넘긴다(수정·삭제와 동일). 통제 문서 없는 OFF 이슈는 직접 작성.
- F-4: `listAllApprovals` 기간 필수는 서버가 강제.
- 코덱스 P1 "캐시된 DIRECT 로 PUT·DELETE": 워크포스 수정·삭제를 서버 resolver 경유로 옮겨 실행 시점에 재판정.
- 코덱스 P1 "예외 목록 프로젝트 재확인": 현재 meta.projectId 대조, 메타 없음은 제외.
- D-2 토큰 이름은 승인 앱 백엔드가 정하고 워크포스가 따른다.
- Q140 좁힘(리더, 프론트 회차 1 보고 반영): 연동 이슈에서 "편집 불가·삭제만"은 작성 기간·사전 승인·결재선(s/e/pa/fl)에만. **기록 규칙 예외(7키)는 연동 이슈라도 승인 앱 프로젝트 설정에서 편집·적용**(워크포스에 편집기가 없으므로). `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` 는 결재선 값 지정에만.
