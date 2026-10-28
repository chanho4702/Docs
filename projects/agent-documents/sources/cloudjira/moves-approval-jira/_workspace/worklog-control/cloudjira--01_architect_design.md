# worklog-control 설계서 — 워크로그 통제권 이관 (앱이 수정·삭제를 쥔다)

> 작성: feature-architect · 2026-10-10 초판 → 같은 날 **2판**(codex 독립 검토 `codex-review.md` 반영, 변경 이력 참조)
> 입력: `00_input/requirement.md` + 사용자 추가 지시 U-A·U-B·U-C + 사용자 방침 "일단 다 구현해 보고 실측으로 확인 — **위험 모드는 기본 OFF, 실측 관문 통과 후 스위치로 켠다**".
> 기준 트리: 승인 앱 `b2532b0`(인증·감사 커밋됨, 마지막 마이그레이션 `v056_index_approval_event_delegate`), 워크포스 브랜치 `RFC-220` `4788a77`(인증 문서 수신).
> 기준 코드(읽기만 함): `src/resolver/worklog/*`, `src/resolver/timesheet/{PeriodLockService,WorklogCollector}.js`, `src/domain/timesheet/lock.js`, `src/domain/worklogPolicy/{catalog,merge,mutation}.js`, `src/resolver/worklogPolicy/*`, `src/resolver/worklogCert/WorklogCertService.js`(`certifyFor` 의 `fetchWorklogsByIdAsUser`·`issueVisibility`), `src/domain/worklogCertification/{state,fingerprint}.js`, `src/resolver/worklogHistory/WorklogHistoryRecorder.js`, `src/resolver/worklogApproval/WorklogApprovalService.js`, `src/resolver/workforce/{WorkforceLinkRepository,WorkforcePublisher}.js`, `src/integration/workforce/contract.js`, `src/api/jira/RequestJira.js`, `src/permission/*`, `src/resolver/settings/SettingsRepository.js`, `src/trigger/{runSweep,sweepJobs,runSweepJob,onWorklogChanged}.js`, `manifest.yml`, `static/ui/src/features/worklog/*`, `static/ui/src/features/settings/*`. 워크포스: `src/api/jira/worklog/CollabWorklogFetcher.js`(`isUnrestrictedWorklog`), `static/ui/src/components/worklog/worklogWrite.js`(프론트 직접 POST), `src/resolver/approvalLink/ApprovalCertReader.js`, `src/resolver/gantt/GanttMapper.js`, `manifest.yml`.
> 근거 등급: **문서**(공식 REST v3 OpenAPI·Forge 문서·Atlassian KB, 2026-10-10, 실측 전) / **미검증**(§10 V·G 번호) / **코드**(리포 확인).

### 입력 변경 (요구서 이후)

| # | 지시 | 반영 |
|---|---|---|
| U-A | 권한 스킴 회수는 무리 → **visibility 를 앱 전용으로** 안을 1순위 | §0. 권한 회수는 선택지로 남김 |
| U-B | 워크포스 이슈 탭으로도 입력 | §0.4 — 탭은 UI 창구일 뿐 다른 경로를 못 닫는다 |
| U-C | 워크포스는 연동 모드에서 asApp 으로 읽고 **본인 작성분만** 보여 준다 | §4.7, §12 WF-7 |
| codex | P0 2건·P1 7건·P2 2건·S4/S5/S8 | 2판 전반. 대응표 §0.6 |
| 방침 | 전부 구현, 위험 모드 기본 OFF, 실측 관문 기록이 있어야 스위치 저장(서버 강제) | §0.5 단계·스위치, §10 |

### 입력과 실제 코드의 차이

| 입력 표현 | 실제 | 반영 |
|---|---|---|
| 인증 잠금 상태 | `worklogCert/*`(`worklog_cert.state`). `worklogCertification/*` 는 동결된 옛 요청형 | 잠금 = `CERTIFIED`·`MISMATCH` |
| 워크포스 `rms.pm`/`rms.policy` 에 프로젝트 기간 | 없음(`rms.pm={pmKeys,rev}`, `rms.policy={rev,values,locks}`). 워크포스 프로젝트 ≠ Jira 프로젝트 | 기간 창 = 이슈 Start~Due 만(Q123) |
| 워크포스가 `rms.policy`/`rms.pm` 게시 | **게시 코드 없음**(RFC-220 에도 수신 계약만) | 통제용 연동 판정은 워크포스 WF-9 전까지 false |
| 워크포스 탭 쓰기 | 프론트에서 Jira 로 **직접 POST**(asUser, `worklogWrite.js`) — 서버 증명 없음 | P0-1: 워크포스 백엔드 서명 출처(§4.4) |
| 워크포스 협업 수집 | `isUnrestrictedWorklog` 로 **visibility 있는 워크로그를 제외** | WF-7: 승인 앱 통제분 증명 조건이 있어야 포함 |
| 인증 실행 | `certifyFor` 가 실행 직전 `fetchWorklogsByIdAsUser` 로 재조회 + `issueVisibility`(asUser permissions/check) | 숨김 대응 수집기로 교체(§4.7) — 열람 재확인은 보존 |
| Forge 제거 훅 | **`preUninstall` 모듈이 있다**(55초, 실패해도 제거 진행 — 문서, codex 확인) | 보조 정리 수단으로 추가(§4.9). 주 경로는 수동 해제 |
| 큐 helper | `pushSweepJobs` 는 `{job, round, cloudIdHint}` 만 싣는다. consumer 는 최대 3회 이어달리기 후 "다음 날 일일 작업" 전제 | 이벤트성 작업은 **DB 행이 작업 원장**, 큐는 깨우기만(§4.8) |
| 유휴 SQL | 미연동 27·연동 38(`idleSqlBudget.test.js`, b2532b0) | 불변 단언 |

---

## 열린 질문

제품 결정만. 답이 없으면 **기본 가정**으로 구현한다. 번호는 `QUESTIONS.md` 다음(Q119~).

| # | 질문 | 선택지 | 기본 가정 | 근거 |
|---|---|---|---|---|
| Q119 | 잠금 수단 활성 단계 | Phase A 만 / B / C / D | **구현은 A~D 전부, 기본은 A**(스위치 OFF). B~D 는 관문 기록 후 관리자가 켠다 | 사용자 방침 |
| Q120 | visibility 대상 | (a) 시스템 역할 `atlassian-addons-project-access` (b) 고객 그룹(앱 계정 + 복구 관리자) (c) 전용 프로젝트 역할 | **(a)** 기본, (b)(c)는 정책으로 선택 가능하되 해당 관문(G-GROUP) 기록 필요 | (a) 고객 설정 0, 단 복구 불가. (b)(c) 복구 가능하지만 앱 계정 등록 가능성 미검증 |
| Q121 | 연동 이슈 입력 창구 | (A) 워크포스 탭 — **작성만** 워크포스, 수정·삭제는 승인 앱으로 넘김 (B) 승인 앱 탭 단일 | **(A)** | §0.4. 수정·삭제 권위는 승인 앱 하나(P0-2) |
| Q122 | 숨긴 워크로그를 본인 외에 누가 보나 | (a) 본인만 (b) + 현재 팀장(인증 화면) (c) 이슈 열람자 전원 | **(b)** — 이슈 탭·워크포스 탭은 본인만, 승인 앱 인증 화면·타임시트 결재 상세는 TeamScope + 조회자 이슈 열람 재확인. 설명은 기존 규칙대로 작성자에게만 | U-C. 팀장 인증은 숨긴 건을 못 보면 성립하지 않는다 |
| Q123 | 기간 창 바깥 경계에 워크포스 프로젝트 기간 | (a) 이슈 Start~Due 만 (b) 계약 추가 | **(a)** | 계약에 없음 |
| Q124 | 다른 경로 생성분 처리 | OFF / FLAG / DELETE | **FLAG**. DELETE 는 Phase D 관문 + 양 앱 출처 증명 가동 시에만 저장 가능 | P0-1 |
| Q125 | 확정분을 고쳐야 할 때 | (a) 범위 밖(타임시트 반려·재제출, 인증은 팀장 재인증 흐름만) (b) 건별 해제 | **(a)** + 관리자 전체 해제만 | |
| Q126 | 통제용 연동 판정 단위 | (a) 이슈 단위 신호(`I:{issueId}`) + 프로젝트 신호 중 "전 이슈 연동" 명시분 (b) 감사처럼 작성자 OR 프로젝트 | **(a)** | 감사 판정(만료 무시·넓히는 쪽)과 분리(P1-5) |
| Q127 | 불변식 8 예외(asApp 결과 반환) | 승인/거부 | **사람 승인 필요.** 미승인이면 Phase B~D 저장 거부(서버) | CLAUDE.md 불변식 변경 |
| Q128 | 원래부터 visibility 가 제한된 워크로그(`SKIPPED_RESTRICTED`) | (a) 통제 제외 + FLAG(통제 회피 가능 경로로 표시) (b) 덮어써 통제 | **(a)** | 덮어쓰면 원래 공개 범위를 앱이 바꾼다. 대신 연동 이슈에서 이 상태는 감사 표에 "통제 회피" 로 보인다 |
| Q129 | Phase A 의 우리 화면 신규 규칙(승인 확정분 잠금 정책 무관, 기간 창) 기본 | 켬/끔 | **승인·인증 잠금은 켬**(요구 §1-2 확정), **기간 창은 정책 OFF 기본** | 요구서 |

---

## 0. 잠금 수단 결정

### 0.1 문서로 확인한 사실 (2026-10-10)

| # | 사실 | 출처 |
|---|---|---|
| F1 | 작성 POST = Browse + Work on issues. visibility 멤버십 조건 없음 | OpenAPI Add worklog |
| F2 | PUT = Browse + Edit own/all + **"If the worklog has visibility restrictions, belongs to the group or has the role"** | Update worklog |
| F3 | DELETE = Browse + Delete own/all + 같은 멤버십 조건 | Delete / Bulk delete |
| F4 | GET·`worklog/list` 도 멤버십 조건. **작성자 예외 없음.** Edit/Delete all 이 멤버십을 대체한다는 문구 없음 | Get worklog(s) |
| F5 | `visibility={type:'group'|'role', identifier, value}` | 스키마 Visibility |
| F6 | `author`·`updateAuthor` readOnly | 스키마 Worklog |
| F7 | `overrideEditableFlag` 는 Administer Jira 를 가진 앱만 | 파라미터 |
| F8 | 권한 키 `WORK_ON_ISSUES`·`EDIT_OWN/ALL_WORKLOGS`·`DELETE_OWN/ALL_WORKLOGS` | OpenAPI |
| F9 | `mypermissions` 권한 요구 없음, 호출 주체 기준 | Get my permissions |
| F10 | `project/{id}/permissionscheme` = Administer Jira 또는 Administer projects, classic scope `read:jira-work`(codex 확인) | Get assigned permission scheme |
| F11 | `atlassian-addons-project-access` = Jira 관리 시스템 역할, 설치 시 모든 권한에 추가, 멤버 수정 불가. **KB 는 Connect 로만 기술** | Atlassian KB |
| F12 | Start date 는 사용자 지정 datepicker, id 가 사이트마다 다름. `/field` 결과는 호출자 접근 프로젝트 영향 | 커뮤니티·Get fields |
| F13 | `worklog/list` 와 issue worklog GET 은 `expand=properties` 지원. POST/PUT 본문에 `properties` 가능 | OpenAPI |
| F14 | Forge `preUninstall` 트리거 — 55초, 실패해도 제거 계속 | Forge manifest reference(codex) |
| F15 | Forge Queue `delayInSeconds` 최대 900초 | Async events API(codex) |
| F16 | `jira:actionValidator` 는 `workItemTypeChanged` 만 지원 — 워크로그 생성 hook 없음 | Forge manifest reference(codex) |

### 0.2 안 비교 (요구별 — codex 권고 형식)

| 안 | 연동 이슈를 등록부터 우리 화면으로 통제 | 이슈 기간 밖 CRUD 금지 | 미연동 확정분 수정·삭제 금지 | 미연동 미확정분 자유 | 고객 권한 변경 |
|---|---|---|---|---|---|
| **H: 연동 전부 + 미연동 확정분 visibility** (Phase C) | **부분** — 외부 생성, POST→제한 PUT 공백, 제한 실패·닫힌 이슈·원래 제한분(skip) 존재 | **부분** — 우리·워크포스 쓰기 경로의 사전 검사 + 제한 후 Jira 경로 차단. 제한 전 공백 동안은 사후 감지 | **부분** — 제한 성공 이후 차단, 결정~큐 처리 공백 | 대체로 충족 | 회수 불필요, 앱 역할 권한 확인 필요 |
| **확정분만 visibility + FLAG** (Phase B) | 미충족 | 우리 화면에서만 | 제한 성공 이후 충족 | 충족 | 불필요 |
| **권한 회수 + 앱 대행** (선택지 `PERMISSION_SCHEME`) | 수정·삭제 가능, 외부 생성 남음 | 앱 경유분 적용 | 충족 가능 | **Jira 경로까지 자유여야 하면 미충족** | 필요(Edit/Delete own **과 사용자에게 남은 Edit/Delete all** 모두 확인) |
| **감지 + 인증 제외만** (Phase A) | 미충족 | 사후 감지 | 미충족(변경 후 무효화만) | 충족 | 불필요 |

탭 정리(창구 하나로)는 위 어느 열도 바꾸지 못한다 — UI 창구일 뿐 REST·모바일·자동화·다른 앱 경로는 그대로다. 작성 원천 차단은 어느 안도 못 한다(F16, timeTrackingProvider 는 기본 UI 교체만 보장).

### 0.3 visibility 부작용

| # | 부작용 | 대책 |
|---|---|---|
| a | 작성자·팀장이 Jira 화면·검색·리포트에서 못 봄 | 본인: 승인 앱 탭·워크포스 탭이 asApp + 작성자 일치(U-C). 팀장: 승인 앱 인증 화면(§4.7). Jira 기본 작업 로그 탭은 우리가 제공자면 원래 숨김. **JQL·가젯·기본 리포트·내보내기의 결과는 단정하지 않는다** — G-AGG 실측 후 안내 문구 확정 |
| b | 워크포스 asUser 수집에서 사라짐 | WF-7. 협업 수집기의 `isUnrestrictedWorklog` 제외는 **승인 앱이 통제한 기록이라는 증명**(서명 통제 목록 또는 우리 visibility 대상 일치 + 승인 앱 통제 문서)이 있을 때만 해제. 집계 반환도 워크포스의 기존 원가·팀 범위 인가를 그대로 거친다(한 명짜리 합계 = 개인 상세) |
| c | `timespent` 등 이슈 집계·다른 앱 | G-AGG 실측. 앱 역할을 공유하는 다른 앱은 계속 접근(앱 역할은 "앱들 전용") |
| d | 앱 제거·라이선스 만료 시 고아 | 수동 전체 해제(주 경로) + `preUninstall` 보조 + 라이선스 INACTIVE 에서도 상태·해제 resolver 허용. 해제 실패 재개·대상 변경 이력·앱 권한 상실 시 안내(§4.9) |
| e | 미연동 미확정 | 건드리지 않음 |
| f | 원래 제한된 워크로그 | 통제 제외 + FLAG `SKIPPED_RESTRICTED`(Q128) — 작성자가 자기 그룹으로 제한해 만들면 통제 회피 경로가 되므로 감사 표에 노출 |
| g | `updateAuthor` 가 앱으로 바뀜 | 인증 지문 무영향(`certFingerprintOf` = id·issue·author·started·seconds). 이력 귀속은 op id 로(§4.3) |
| h | 제한 공백 | 우리 화면 작성은 같은 호출에서 제한. G-POST 에서 POST 에 제한 visibility 를 직접 실을 수 있으면 공백 0 |
| i | 닫힌 이슈 | 제한 실패 `NOT_EDITABLE` — 통제 불가로 표시, 우리 화면 잠금은 유지 |

### 0.4 입력 창구 — 승인 앱 탭 vs 워크포스 탭 (U-B, P0-2)

**결정(Q121 A)**: 연동 이슈에서
- **작성**은 워크포스 탭 허용. 단 워크포스 **백엔드 resolver** 가 서명한 출처 의도를 POST 본문 프로퍼티로 함께 싣는다(§4.4 P0-1).
- **수정·삭제의 허가와 실행은 승인 앱 한 곳.** 승인 앱이 **현재 DB 상태**(인증·타임시트·통제 행·정책)로만 판정한다. 워크포스는 서명 문서로 허가를 판단하는 두 번째 asApp 실행기를 **두지 않는다**.
- 워크포스 탭의 수정·삭제 버튼 → **승인 앱 화면으로 넘긴다.** Forge 앱 사이에는 resolver 직접 호출이 없다(DESIGN.md §4 — 외부 호출(web trigger 등)은 egress 라 Runs on Atlassian 을 잃고 호출자 인증도 따로 만들어야 한다). 그래서 UI 넘김만 남는다:
  1. **같은 이슈의 승인 앱 작업 로그 탭** — 우리가 시간 추적 제공자일 때 같은 이슈 화면에 이미 있다. 워크포스 탭은 "작업 로그 탭에서 수정하세요" 안내 + 해당 행 id 를 표시(탭 간 자동 포커스는 불가 — 행 강조는 승인 앱 탭이 `?wl=` 없이 최근 본인 행 순으로 보여 주는 것으로 대체).
  2. 제공자가 아닐 때 — **승인 앱 전역 페이지 경로로 이동**: `router.navigate` 로 `/jira/apps/{approvalAppId}/{envId}/worklog/{issueId}/{worklogId}` (전역 페이지 `approval-inbox` 의 하위 경로). 앱 id·env id 는 승인 앱이 서명 게시하는 `movesApproval.ctl` 의 `ui.globalPagePath` 로 알린다(서명 검증 실패면 링크를 숨기고 안내 문구만). 하위 경로 라우팅·다른 앱 전역 페이지 이동은 **미검증 G-HANDOFF**.
- 판정이 승인 앱 한 곳이므로, 워크포스 탭의 사전 표시(잠금 배지 등)는 표시용이다. 서명 문서가 낡아도 실행 허가로 이어지지 않는다(인증 `w` 1,000건 절단·`wt=true` 문제 소멸).

### 0.5 단계·스위치 (서버 강제)

| Phase | 내용 | 스위치(정책) | 저장 조건(서버) |
|---|---|---|---|
| **A** | 실측 진단 도구 + 우리 화면 쓰기 경로 재설계(검사 순서·승인/인증 잠금·기간 창) + 다른 경로 입력 **FLAG** + 출처 증명(승인 앱) | `worklogDateWindow`(OFF 기본), `foreignWorklogAction`(FLAG 기본) | 기간 창 ON = 관문 G-FIELD PASS + Start date 매핑 확정 |
| **B** | 확정분(타임시트 APPROVED·인증 CERTIFIED/MISMATCH)만 visibility 제한 | `worklogVisibilityScope=CONFIRMED_ONLY` | G-ROLE·G-BLOCK·G-PRESERVE·G-AGG·G-RECOVER PASS + Q127 승인 |
| **C** | 연동 이슈 전체 visibility(작성 즉시) | `worklogVisibilityScope=LINKED_ALL` | B 조건 + G-POST + G-WF(워크포스 앱 접근·WF-7 배포 신호) + G-LINK |
| **D** | 다른 경로 생성분 자동 DELETE | `foreignWorklogAction=DELETE` | G-ORIGIN·G-DELETE PASS + 승인 앱·워크포스 양쪽 출처 증명 가동(워크포스 능력 신호 `wlorigin`) + 확인 입력 |
| (선택) | 권한 스킴 회수 방식 | `worklogLockMethod=PERMISSION_SCHEME` | G-SCHEME PASS(점검 표에서 사용자 Edit own/all·Delete own/all 보유자 없음) |

관문 결과는 사이트별로 기록된다(§2.1 `recordWorklogControlGate`, 자동 진단은 그 사이트에서 실행). 개발 사이트 결과가 운영 사이트를 열지 않는다 — 운영에서도 관리자가 시험 이슈를 지정해 자동 진단을 돌리고 수동 항목을 확인 기록해야 한다. 관문 기록에는 앱 버전(`app.version` 은 Forge context 의 environment·version)을 함께 남기고, **major 버전이 바뀌면 재확인 필요** 표시(저장 거부는 아님).

### 0.6 codex 지적 대응표

| 지적 | 대응 위치 |
|---|---|
| P0-1 워크포스 정상 입력 FOREIGN 오탐 | §4.4 서명 출처(op id 원자 결속), DELETE 저장 조건 |
| P0-2 서명 문서로 쓰기 허가 | §0.4 — 수정·삭제는 승인 앱 현재 DB 만, 워크포스 실행기 없음 |
| P1 asApp 보충 범위 | §4.7 6조건, `listForeignWorklogs` 행 단위 가시성 |
| P1 제한 PUT 값 덮어쓰기 | §4.6 visibility 만 PUT(G-PRESERVE) + 실패 시 비교·재시도 규칙 |
| P1 Jira 성공·SQL 실패 | §4.6 `APPLYING` 선기록 + 조정 작업 |
| P1 영속 재개 | §4.8 DB 원장 + KVS 표식 + 일일 스윕 조건부 push |
| P1 전환 순서·기존 데이터 | §4.10 |
| P1 통제용 연동 판정 | §3.1 `controlLinkOf`(만료·해제·범위) — 감사용과 분리 |
| P1 Start date fail-open, 인증 실행 asUser | §3.2·§4.2 거부, §4.7 숨김 대응 수집기 |
| P2 행위자 추정 | §4.3 op id 대조, 불확실하면 미상 |
| P2 `movesApproval.ctl` 계약 | §6.3 |
| S4 재확인 | §4.5 S4 |
| S5 스냅샷 | §4.5 S5 — "참고 사본", 복원 아님 |
| S8 원자 상한 | §4.5 S8 — SQL 조건부 UPDATE |
| NONE 이면 감지도 꺼짐 / OFF 면 제한까지 꺼짐 | §4.4 — 통제 적용과 외부 입력 처리 분리 |
| V4 기준 "403" 고정 금지 | §10 — 기준은 "실제 불변" |

---

## 1. 개요·영향 범위

| 영역 | 변경 |
|---|---|
| 도메인(순수) | 신규 `src/domain/worklogControl/{rules,window,origin,foreign,visibility,gates}.js`. 가산 `domain/timesheet/lock.js`(`lockApproved`), `domain/worklogPolicy/catalog.js`(`worklogDateWindow`), `domain/timesheet/worklogHistory.js`(source `CONTROL`). 승인 엔진 무변경 |
| resolver | 신규 9(§2.1). 가산: 워크로그 5종, 설정 저장 |
| 서비스 | 신규 `src/resolver/worklogControl/*`(§4.1). 변경: `WorklogService`, `PeriodLockService`, `WorklogApprovalService.apply`(출처 프로퍼티·결속), `WorklogHistoryRecorder`(op 귀속), `WorklogCertService`·`WorklogCollector`(숨김 대응 수집), 타임시트 결정·인증 후 hook, `WorkforcePublisher`(ctl 문서), `WorklogPolicyAuthority`(연동 신호 변화 hook), `ResponseWrapper`(라이선스 예외 2) |
| 스키마 | 신규 3 테이블 v057~v059 |
| 트리거·스윕 | 새 스케줄 없음. `onWorklogChanged` 분기, 큐 작업 `worklog-control`(payload), `runSweep` 조건부 push(KVS 표식 — SQL 0), **manifest `preUninstall` 모듈 1개 추가**(§4.9) |
| 엔트리 | 추가 없음. `inbox` 엔트리에 하위 경로 `worklog/{issueId}/{worklogId}`(넘김 받는 화면), `settings` 에 통제 화면 |
| i18n | 신규 `worklogControl.json`, 가산 `worklog`·`policy`·`error`·`notification`·`worklogHistory` |
| 워크포스 | 수신: `workforce_inbound`(통제용 판정 — 만료·해제 반영). 송신: `movesApproval.ctl`(프로젝트 프로퍼티). 신규 수신 계약 `rms.wlorigin`(워크로그 프로퍼티 `movesRms.origin`) 검증. 워크포스 작업 §12 |
| 문서 | AGENTS asApp 5번(§6.2), CLAUDE.md 불변식 8 예외(Q127), DESIGN.md §2.0 갱신(§11) |

### 1.1 대상과 scopeKey

결재 요청 없음. 통제 단위 = 워크로그 1건(`worklog_control.worklog_id` PK). 출처 의도 = op id(UUID) 1건(`worklog_control_intent.op_id` PK) — **op id 하나가 워크로그 하나에만 결속**(원자 CAS).

---

## 2. 경계면 계약

### 2.1 신규 resolver

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getWorklogControlStatus` | `{admin:true}` (라이선스 INACTIVE 허용) | `{}` | `{settings:{visibilityScope, lockMethod, foreignAction, foreignScope, target:{type, value|identifier}, startDateField:{fieldId|null, verified:boolean, verifiedAt|null}, dateWindowOn}, state:{generation, since, deleteSince, releasing:boolean, invariantApproved:boolean, workforceOriginCapable:boolean}, gates:{[gateId]:{result:'PASS'|'FAIL'|'NONE', at, by, mode:'AUTO'|'MANUAL', appVersion, note|null}}, allowed:{CONFIRMED_ONLY:boolean, LINKED_ALL:boolean, DELETE:boolean, PERMISSION_SCHEME:boolean, dateWindow:boolean}, blockers:{[switch]:string[]} /*부족한 관문 id*/, counts:{applying, restricted, pending, failed, unknown, skippedRestricted, notEditable, releasing, released, flagged, deletePending, deleted}, deletesToday, deleteDailyMax}` | `STORAGE_NOT_READY` | 설정 > 타임시트 > 워크로그 통제 |
| `runWorklogControlDiagnostic` | `{admin:true}` | `{gateId, issueId /*관리자가 지정한 시험 이슈*/, closedIssueId?}` | `{gateId, result:'PASS'|'FAIL', steps:[{key, expected, observed, ok}], recorded:boolean}` — 자동 항목(§10 표 "자동")만. 시험 워크로그를 만들고 끝나면 지운다(남으면 `leftovers:[worklogId]`) | `INVALID_TARGET`(자동 대상 아님·이슈 열람 불가), `WORKLOG_CONTROL_DIAG_BUSY` | 같은 화면 "실측 진단" |
| `recordWorklogControlGate` | `{admin:true}` | `{gateId, result:'PASS'|'FAIL', note /*≤500자, 확인 방법·증적*/}` — 수동 항목 | `{gateId, result, at}` | `INVALID_TARGET`(자동 전용 관문에 수동 기록) | 같음 |
| `getWorklogControlReadiness` | `{admin:true}` | `{cursor?}` (대상 = 앱 사용 프로젝트 ∪ 통제용 연동 프로젝트, 20개씩) | `{items:[{projectId, projectKey, name, style, app:{browse, workOn, editAll, deleteAll}, scheme:{readable, schemeId, addonRole:{editAll, deleteAll}, userHolders:{editOwn:[…], editAll:[…], deleteOwn:[…], deleteAll:[…]}}, verdict}], nextCursor}` | `JIRA_API_FAILED` | 점검 표 |
| `releaseWorklogControl` | `{admin:true}` (INACTIVE 허용) | `{confirm:'RELEASE'}` | `{generation, pending}` — 세대 증가, 신규 제한 중지, 해제 작업 시작 | `INVALID_TARGET` | 해제 |
| `retryWorklogControl` | `{admin:true}` | `{}` | `{queued}` — FAILED·UNKNOWN 재대조 | — | 같음 |
| `listForeignWorklogs` | `{admin:true}` | `{state?, cursor?, limit≤50}` | `{items:[{worklogId, issueId, issueKey, authorAccountId, started, seconds, state, reason, detectedAt, actedAt, linked}], hiddenCount, users, nextCursor}` — **조회자 asUser 이슈 열람으로 행 자체를 거른다**(키만 가리지 않음), 숨긴 수는 `hiddenCount`(감사 화면과 같은 방식) | `STORAGE_NOT_READY` | 다른 경로 입력 표 |
| `clearForeignWorklog` | `{admin:true}` | `{worklogId}` | `{worklogId, state:'CLEARED'}` — 세대 증가로 대기 중 삭제 무효 | `WORKLOG_NOT_FOUND`(열람 불가 포함), `WORKLOG_CONTROL_CONFLICT` | 같음 |
| `getWorklogHandoff` | `{issue:'view', issueIdKey:'issueId', appAccess:false}` | `{issueId, worklogId}` | `{issueId, worklogId, worklog:WorklogView}` — 워크포스 탭에서 넘어온 수정·삭제 화면용. 내부는 `getWorklogEditorContext` 와 같은 판정 | `WORKLOG_NOT_FOUND`, `WORKLOG_NOT_OWNER` | 업무함 엔트리 `worklog/…` 경로 |

### 2.2 변경 resolver (가산 — 기존 필드 의미 유지, `canEdit`/`canDelete` 산식만 서버가 바꾼다)

| resolver | 응답 가산 | 에러 가산 |
|---|---|---|
| `getIssueWorklogs` | `control:{visibilityScope, linked, channel:'APP'|'WORKFORCE', dateWindow:DateWindow|null}`; `WorklogView` 에 `blocked`, `controlled:{state}`, `foreign:{state, reason}`, `via:'USER'|'APP'`; 본인 숨김분 합류(§4.7); `removedForeign`(본인, 이 이슈, ≤20) | `WORKLOG_WINDOW_UNRESOLVED`(창 ON 인데 필드·값 미해결 — 목록은 주고 `control.dateWindow.status` 로) |
| `getWorklogEditorContext` | `control`, `worklog.blocked` | — |
| `createWorklog` | `worklog.controlled`, `origin:{opId}` 미노출(서버 전용 — 응답에 싣지 않는다) | `WORKLOG_OUTSIDE_ISSUE_WINDOW`, `WORKLOG_WINDOW_UNRESOLVED`, `WORKLOG_CONTROL_STORAGE` |
| `updateWorklog`/`deleteWorklog` | 같음 | `WORKLOG_OUTSIDE_ISSUE_WINDOW`, `WORKLOG_WINDOW_UNRESOLVED`, `WORKLOG_CERTIFIED_LOCKED`, `WORKLOG_PERIOD_LOCKED`(`PERIOD_APPROVED` 정책 무관), `WORKLOG_FOREIGN_LOCKED`, `WORKLOG_CONTROL_UNAVAILABLE`, `WORKLOG_CONTROL_STORAGE`, `WORKLOG_CONTROL_CONFLICT` |
| `saveApprovalSettings` | — | `WORKLOG_CONTROL_GATE_REQUIRED`(cause `{switch, missing:[gateId]}`), `WORKLOG_CONTROL_INVARIANT_PENDING`, `WORKLOG_CONTROL_DELETE_CONFIRM`, `WORKLOG_CONTROL_RELEASE_RUNNING`(해제 중 B~D 켜기) |

`DateWindow = {status:'OK'|'NO_FIELD'|'FIELD_UNVERIFIED'|'READ_FAILED'|'INVALID', start|null, end|null, timeZone, fieldId}` — `OK` 이고 start·end 가 정상적으로 **비어 있음**을 읽었을 때만 그쪽 경계 없음. 그 밖 상태에서 창 ON 이면 쓰기 거부(fail-close).
`blocked.code` ∈ `NOT_OWNER`·`OUTSIDE_WINDOW`·`WINDOW_UNRESOLVED`·`CERTIFIED`·`PERIOD_CLOSED`·`PERIOD_SUBMITTED`·`PERIOD_APPROVED`·`FOREIGN_PENDING`·`NO_JIRA_PERMISSION`·`CONTROL_UNAVAILABLE`·`CONTROL_BUSY`.

### 2.3 에러 코드 (`ErrorCodes` + `error.json` kr/en)

`WORKLOG_OUTSIDE_ISSUE_WINDOW`(cause `{which, start, end}`), `WORKLOG_WINDOW_UNRESOLVED`(cause `{status}`), `WORKLOG_CERTIFIED_LOCKED`(cause `{state}`), `WORKLOG_FOREIGN_LOCKED`, `WORKLOG_CONTROL_UNAVAILABLE`(cause `{status}`), `WORKLOG_CONTROL_STORAGE`, `WORKLOG_CONTROL_CONFLICT`, `WORKLOG_CONTROL_RELEASE_RUNNING`, `WORKLOG_CONTROL_INVARIANT_PENDING`, `WORKLOG_CONTROL_DELETE_CONFIRM`, `WORKLOG_CONTROL_GATE_REQUIRED`, `WORKLOG_CONTROL_DIAG_BUSY`.

### 2.4 형제 resolver 범위 (불변식 7 · 불변식 8 예외 6조건)

asApp 결과를 사용자에게 돌려주는 모든 경로는 다음을 **전부** 만족한다(codex 4번):
1. 호출자는 resolver context 의 `principal.accountId`.
2. 후보는 SQL 소유자 조건(`author_account = ?` 또는 TeamScope 로 좁힌 대상자)으로 먼저 줄이고, **asApp 응답의 author·worklogId·issueId 를 다시 대조**한다.
3. 반환 행 전부에 **조회자 asUser 이슈 열람 재확인**(`filterVisibleIssues`/`issueVisibility`) — 이슈 탭은 가드 `issue:view` 로 충족.
4. **우리 통제로 가려진 워크로그만**: `worklog_control.vis_state ∈ {RESTRICTED, APPLYING, UNKNOWN}` 이고 현재 visibility 가 우리 대상과 일치. 원래부터 제한된 워크로그는 asApp 으로 보충하지 않는다.
5. 설명(코멘트)은 기존 규칙대로 **작성자 본인에게만**. 팀장 응답은 시간·일자·이슈만.
6. count·합계·내보내기·캐시에도 같은 범위. 캐시 키에 조회자 포함.

| 경로 | 범위 |
|---|---|
| `getIssueWorklogs`·`getWorklogHandoff`·편집 컨텍스트·수정·삭제 | 본인 작성분만 |
| 내 타임시트(`collectMine`)·본인 인증 | 본인 |
| 팀장 인증 화면·인증 실행·타임시트 결재 상세 | `TeamScope.leads` + 조건 3 |
| `listForeignWorklogs` | 관리자 + 조건 3(행 제외·hiddenCount) |
| `getWorklogHistory` | 무변경(DB, eligibleOf) |

### 2.5 프론트 호출 대응

| 화면 | 호출 | 분기 |
|---|---|---|
| 작업 로그 탭 | `getIssueWorklogs` | `blocked` → 본인 행 버튼 비활성 + 툴팁. `channel==='WORKFORCE'` → 작성 안내(수정·삭제는 여기서 그대로) |
| 다이얼로그 | `getWorklogEditorContext`, 쓰기 | `dateWindow.status!=='OK'` 이고 창 ON → 저장 비활성 + 사유 |
| 넘김 화면(inbox `worklog/…`) | `getWorklogHandoff`, 쓰기 | 같은 다이얼로그 재사용 |
| 설정 | §2.1 | §7.3 |

---

## 3. 도메인 (순수 — now·timeZone 인자)

### 3.1 `rules.js`

```js
export const VisibilityScope = { OFF, CONFIRMED_ONLY, LINKED_ALL };
export const LockMethod = { NONE, PERMISSION_SCHEME };
export const ForeignAction = { OFF, FLAG, DELETE };

/** 통제용 연동 판정(감사용 linkedOf 와 별개 — P1-5).
 *  issueRow: rms.policy I:{issueId}, projectRow: rms.policy P:{projectId}. 각 {status, body, ...}.
 *  - VERIFIED 이고 classifyAuthorityCache ∈ {FRESH, STALE} 이어야 '새 통제'의 근거가 된다(EXPIRED·INVALID 는 아님).
 *  - 프로젝트 신호는 body.ctl === 'ALL_ISSUES' 일 때만 그 프로젝트 전 이슈를 연동으로 본다(WF-9 계약 추가). 없으면 이슈 신호만.
 *  - body.ctl === 'NONE'(명시 해제)면 false.
 *  반환 {linked, basis:'ISSUE'|'PROJECT'|null, freshness} */
controlLinkOf({ issueRow, projectRow, now })

/** 기존 통제 유지 판정 — 만료만으로 해제하지 않는다(명시 해제 신호·관리자 해제만). */
keepControlled({ row, link })

judgeMutation({ op, mine, linked, dateWindowOn, window, started, previousStarted, certState, lock, foreignState, controlBusy, timeZone })
judgeCreate({ linked, dateWindowOn, window, started, lock, timeZone })
executorOf({ lockMethod, visState })     // RESTRICTED/APPLYING/UNKNOWN 또는 PERMISSION_SCHEME → 'APP'
/** 실행 시점마다 최신 상태로 다시 계산(P1-4) */
shouldRestrict({ scope, generation, rowGeneration, linked, approved, certified, originalVisibility, releasing })
  → 'RESTRICT' | 'RELEASE' | 'SKIP_RESTRICTED' | 'NONE'
```

### 3.2 `window.js`

```js
/** fieldState: {fieldId, verified}. read: {ok, startRaw, dueRaw} | {ok:false}
 *  status: NO_FIELD(매핑 없음) / FIELD_UNVERIFIED / READ_FAILED / INVALID(형식 오류·start>end) / OK */
dateWindowOf({ fieldState, read }) → DateWindow
inWindow({ started, window, timeZone }) → { inside }   // status!=='OK' 면 호출부가 먼저 거부
```
경계 포함. 수정은 이전·새 started 둘 다, 삭제는 이전 started.

### 3.3 `origin.js` (P0-1)

```js
/** 우리 화면·사전 승인 적용: 프로퍼티 movesApproval.origin = {op}. op 는 서버 생성 UUID, 응답에 싣지 않는다. */
appOriginProperty(opId)
/** 워크포스: 프로퍼티 movesRms.origin = 서명 봉투 {v:1, typ:'rms.wlorigin', iss:'moves-workforce', kid, sig,
 *   body:{cloudId, issueId, authorId, op, started, seconds, iat, exp}} — exp-iat ≤ 900초 */
verifyWorkforceOrigin({ envelope, cloudId, worklog:{issueId, authorId, created, started, seconds}, signer, now })
  → { ok:true, op, valuesMatch } | { ok:false, code:'SIG'|'CLOUD'|'ENT'|'AUTHOR'|'TIME'|'MALFORMED' }
/** 출처 판정 — properties 와 우리 intent·결속 결과로 */
originOf({ props, appIntent /*op 로 찾은 행*/, wfVerdict, bound /*op 가 이미 다른 워크로그에 결속*/ })
  → 'APP' | 'WORKFORCE' | 'APP_CHANGED' | 'WF_CHANGED' | 'REUSED' | 'INVALID' | 'NONE'
```
- `valuesMatch=false`(서명은 맞는데 started·seconds 가 다름 — 생성 직후 수정) → `WF_CHANGED`: 출처는 증명됨, FLAG 대상도 아님(정상 입력 + 이후 변경은 기존 감지 몫).
- 같은 op 가 이미 다른 워크로그에 결속 → `REUSED` → FLAG(삭제 금지).
- 프로퍼티가 있는데 검증 실패 → `INVALID` → FLAG(삭제 금지).
- **DELETE 후보는 `NONE` 뿐.**

### 3.4 `foreign.js`

```js
foreignDecision({ action, scope, linked, origin, created, controlSince, deleteSince, authorAccountType,
                  pendingApplyMatch, storageOk, workforceOriginCapable, gatesOk })
  → { act:'IGNORE'|'FLAG'|'DELETE_PENDING', reason }
/** S4 실행 직전 재확인 */
deleteRecheck({ row, generation, settings, current, detectedFp, certRow, lock, origin, linked })
  → { proceed:true } | { proceed:false, downgrade:'FLAG'|'CLEARED'|'GONE', reason }
```

### 3.5 `visibility.js`

`ADDON_ROLE`, `targetVisibility(setting)`, `isOurRestriction(visibility, target)`, `originalOf(visibility)`.

### 3.6 `gates.js`

```js
GATES = { G_ROLE, G_BLOCK, G_POST, G_PRESERVE, G_AGG, G_RECOVER, G_FIELD, G_LINK, G_WF, G_ORIGIN, G_DELETE, G_GROUP, G_TEAM_MANAGED, G_SCHEME, G_HANDOFF }
REQUIRED = { CONFIRMED_ONLY:[G_ROLE,G_BLOCK,G_PRESERVE,G_AGG,G_RECOVER], LINKED_ALL:[...CONFIRMED_ONLY, G_POST, G_WF, G_LINK],
             DELETE:[G_ORIGIN, G_DELETE], PERMISSION_SCHEME:[G_SCHEME], dateWindow:[G_FIELD], groupTarget:[G_GROUP] }
missingGates(switchKey, recorded) → gateId[]
```

### 3.7 가산

- `lock.js` `evaluateWorklogLock({..., lockApproved=false})` — 호출부는 항상 true.
- `catalog.js` `worklogDateWindow:{type:'boolean', default:false, strict:'true'}`(워크포스 사본 WF-11 이 먼저 알아야 `rms.policy` 로 보낼 수 있다 — 승인 앱 선배포).
- `worklogHistory.js` source `CONTROL`.

### 3.8 테스트 케이스

- `controlLinkOf`: 이슈 FRESH→true / EXPIRED→false / 프로젝트 신호 `ctl` 없음→false / `ALL_ISSUES`→true / `NONE`→false. `keepControlled`: EXPIRED 여도 유지, `NONE` 이면 해제.
- `judgeMutation` 순서(남의 것이면 다른 검사 결과 비노출), 창 상태 5종(`OK` 외 전부 WINDOW_UNRESOLVED), CERTIFIED/MISMATCH, PERIOD_APPROVED(lockSubmitted=false), FOREIGN_PENDING, controlBusy(APPLYING).
- `originOf`: APP / WORKFORCE / WF_CHANGED / REUSED / INVALID(서명·cloud·이슈·작성자·시각 각각) / NONE.
- `foreignDecision`: DELETE 인데 origin≠NONE → FLAG, `workforceOriginCapable=false` 이고 연동 이슈 → FLAG, gatesOk=false → FLAG, 비사람 작성자 → FLAG, 소급 → FLAG, 사전 승인 적용 일치 → IGNORE.
- `deleteRecheck`: 세대 바뀜·설정 OFF·인증됨·제출/승인 기간·지문 변경·출처 프로퍼티 생김·연동 해제 → 각 강등.
- `shouldRestrict`: 세대 불일치 → NONE(옛 큐 무효), releasing → RELEASE, 인증 해제·반려 후 LINKED_ALL 이면 여전히 RESTRICT(연동이므로).
- `missingGates` 전 스위치.

---

## 4. 백엔드

### 4.1 파일 배치

```
src/resolver/worklogControl/
  WorklogControlController.js     guardedDefine 9
  WorklogControlService.js        상태·해제·재시도·다른 경로 목록·관문 기록
  WorklogControlRepository.js     worklog_control / _intent / _counter (CAS rev+1, isTableReady)
  WorklogControlGateway.js        asApp 전용(사유 집합 고정)
  WorklogControlWorker.js         큐 작업: restrict / release / foreign-recheck / foreign-delete / reconcile / backfill
  WorklogControlDetector.js       트리거 분기
  WorklogControlDiagnostics.js    자동 관문 시험
  WorklogControlReadiness.js      점검
  ControlLinkJudge.js             통제용 연동 판정(workforce_inbound 읽기)
  StartDateField.js               매핑·검증
  HiddenAwareCollector.js         숨김 대응 수집(§4.7)
```

### 4.2 쓰기 경로 — 검사 순서

작성 = asUser. 수정·삭제 = `executorOf`(통제 중이거나 `PERMISSION_SCHEME` 이면 asApp). 서버 판정이 유일한 관문.

**update / delete**

| # | 단계 | 실패 코드 |
|---|---|---|
| 1 | principal·payload 검증 | 기존 |
| 2 | 정책(effective) + 통제 설정·세대(KVS) | — |
| 3 | 현재 값: asUser GET → 404 이고 통제 행(이 issueId·`vis_state ∈ {RESTRICTED, APPLYING, UNKNOWN}`)이 있을 때만 asApp GET(`worklog-control-read`) | `WORKLOG_NOT_FOUND` |
| 4 | 이슈 일치 | `WORKLOG_NOT_FOUND` |
| 5 | 본인 작성분(Jira 응답 author 와 principal) | `WORKLOG_NOT_OWNER` |
| 6 | 통제 작업 중(`APPLYING`) → 잠시 거부 / `DELETE_PENDING` → 수정 거부(삭제 허용) | `WORKLOG_CONTROL_CONFLICT` / `WORKLOG_FOREIGN_LOCKED` |
| 7 | 통제용 연동 + 기간 창(창 ON 이면 `status!=='OK'` 거부, 이전·새 started) | `WORKLOG_WINDOW_UNRESOLVED` / `WORKLOG_OUTSIDE_ISSUE_WINDOW` |
| 8 | 인증 잠금(CERTIFIED·MISMATCH) | `WORKLOG_CERTIFIED_LOCKED` |
| 9 | 기간 잠금(`lockApproved:true`) | `WORKLOG_PERIOD_LOCKED` |
| 10 | 정책 검사 | `WORKLOG_POLICY_BLOCKED` |
| 11 | asApp 이면 **op id 발급 + 통제 행 claim**(`last_app_op_id`·actor·op·at, `WHERE rev=? AND vis_state=?`) | `WORKLOG_CONTROL_STORAGE`·`CONFLICT` |
| 12 | 쓰기. asApp PUT 은 `properties:[{key:'movesApproval.op', value:{op}}]` 동봉, visibility 는 보내지 않는다(보존 — G-PRESERVE 로 확인, 실패 시 현재 우리 visibility 명시). `notifyUsers=false` | 403/400/404 → asApp 이면 `WORKLOG_CONTROL_UNAVAILABLE`(cause status), asUser 면 기존 |
| 13 | 결과 기록(`last_app_result=OK`), 이력 APP | 실패해도 응답은 성공 — 조정 작업이 op 프로퍼티로 귀속 |
| 14 | 응답 | |

**create** (승인 앱 탭·넘김 화면)

| # | 단계 | 실패 코드 |
|---|---|---|
| 1~2 | 같음 | |
| 3 | 통제용 연동 + 기간 창(새 started) | 위와 같음 |
| 4 | 기간 잠금·정책·사전 승인 모드 | 기존 |
| 5 | **intent INSERT**(op_id, source APP, author, issue, started, seconds) — 테이블 준비돼 있으면 항상. 실패 시: 연동 이슈 ∧ `LINKED_ALL` → 거부(fail-close), 그 밖 계속(출처 미증명 = FLAG 뿐) | `WORKLOG_CONTROL_STORAGE` |
| 6 | asUser POST, 본문 `properties:[movesApproval.origin {op}]` (+ G-POST PASS 면 visibility 동봉) | 기존 |
| 7 | 결속: `UPDATE intent SET worklog_id=? WHERE op_id=? AND worklog_id IS NULL` + 통제 행 INSERT(origin APP) | (실패 시 감지가 프로퍼티 op 로 결속) |
| 8 | `LINKED_ALL` ∧ 연동이고 6에서 visibility 를 못 실었으면 → 같은 호출에서 제한(§4.6) | 응답 `controlled.state` |
| 9 | 이력 APP | |

`WorklogApprovalService.apply` 도 5~8 동일(기존 `moves.approval.worklog` 프로퍼티 옆에 `movesApproval.origin`).

### 4.3 감사 행위자 (P2)

- 우리 화면: `recordAppWrite`(actor = principal).
- 트리거가 먼저 온 경우: 이벤트 처리 시 `worklog/list?expand=properties` 의 `movesApproval.op.op` 가 통제 행 `last_app_op_id` 와 **같을 때만** actor = `last_app_actor`, source APP. 다르거나 없으면 updateAuthor(앱 계정이면 "앱 계정", 사람 아님) — 추정하지 않는다.
- 삭제 이벤트: 통제 행에 `last_app_op='DELETE'` 이고 `last_app_result='OK'`(우리 DELETE 가 성공 응답을 받음)일 때만 귀속. 그 외 행위자 미상(기존 U1).
- 제한·해제·외부 삭제: source `CONTROL`, actor null.

### 4.4 다른 경로 생성 감지 — 통제 적용과 외부 입력 처리 분리

`onWorklogChanged` 의 새 블록(독립 try, throw 금지). **두 기능을 따로 켠다**:

```
created 이벤트:
  s = KVS(visibilityScope, foreignAction, foreignScope, generation, since)        // SQL 0
  if s.visibilityScope==='OFF' && s.foreignAction==='OFF' → return               // 둘 다 꺼짐: SQL 0, Jira 0
  cur = prefetched(expand=properties 로 확장) ?? asApp worklog/list?expand=properties   (worklog-control-trigger)
  if cur.created < s.since → return
  origin = originOf(...)  — APP: intent op 로 CAS 결속 / WORKFORCE: 서명 검증 + intent INSERT(source WF, worklog_id) — op_id PK 라 재사용은 실패 → REUSED
  [통제 적용] if visibilityScope==='LINKED_ALL' && controlLinkOf(...).linked → 통제 행 upsert(APPLYING 원장) + 큐 깨우기   // 출처와 무관 — 외부 생성분도 제한
  [외부 처리] if foreignAction!=='OFF' && origin ∉ {APP, WORKFORCE, APP_CHANGED, WF_CHANGED}:
        origin==='NONE' 이고 이벤트가 빠르면(created 후 <90초) → 큐 foreign-recheck(지연 90초) — 승인 앱 결속 지연 대비
        else foreignDecision → FLAG / DELETE_PENDING
```
- 프로퍼티 읽기(타 앱 프로퍼티 포함)가 안 되면(G-ORIGIN 의 일부) 워크포스 출처를 증명할 수 없다 → `workforceOriginCapable=false` → 연동 이슈는 DELETE 불가(FLAG).
- FLAG 효과: 탭 배지, 인증 제외(`certifiable:false`, 사유 `FOREIGN`), 감사 표, 작성자 알림.
- `SKIPPED_RESTRICTED`(원래 제한)는 FLAG reason `PRE_RESTRICTED`.

### 4.5 DELETE 모드 안전장치

| # | 장치 | 구현 |
|---|---|---|
| S1 | 켤 때 확인 | `confirmDelete:'DELETE'` + 관문 G-ORIGIN·G-DELETE + 워크포스 연동 사이트면 `workforceOriginCapable`(검증된 `rms.org` 중 `cap` 에 `wlorigin`). 저장 시 `deleteSince` |
| S2 | 소급 금지 | `created < deleteSince` → FLAG |
| S3 | 유예 | DELETE_PENDING(세대 g) → 작성자·팀장 알림 → 큐 지연 600초(F15 범위). 관리자 해제·설정 변경은 세대 증가로 무효 |
| S4 | **실행 직전 재확인**(codex) | ① 통제 행 claim `UPDATE … SET foreign_state='DELETING', rev=rev+1 WHERE worklog_id=? AND foreign_state='DELETE_PENDING' AND foreign_gen=? AND rev=?` ② KVS 현재 설정: action=DELETE·scope·세대 일치 ③ asApp 재조회(expand=properties): 없음 → GONE / **감지 당시 지문(`detected_fp` = started·seconds·comment 지문·visibility 키)과 다름** → FLAG 강등(우리 visibility PUT 은 지문에 넣지 않는 visibility 키를 우리 대상과 비교해 구분) / 출처 프로퍼티가 생김 → FLAG ④ 현재 인증 행 없음, 그 기간 본인 타임시트 PENDING·APPROVED 아님, 마감 아님 ⑤ 여전히 연동(scope=LINKED) ⑥ 상한 확보(S8) — 하나라도 실패하면 삭제하지 않는다 |
| S5 | 참고 사본 | 삭제 전 `snapshot_json` = started·seconds·설명 ADF 원문(≤32KB, 넘으면 앞부분 + 절단 표시)·properties 키 목록·visibility. 화면 문구는 **"참고 사본 — 복원이 아니라 다시 입력"**. 새로 입력하면 새 워크로그 id 다. 작성자 본인에게만 노출 |
| S6 | 비사람 작성자 | `author.accountType!=='atlassian'` → FLAG |
| S7 | 사전 승인 적용 | APPLYING/UNKNOWN 일치 → IGNORE |
| S8 | **원자 상한** | `worklog_control_counter(day_key PK, deleted INT)` — `INSERT IGNORE` 후 `UPDATE … SET deleted=deleted+1 WHERE day_key=? AND deleted < ?`, affectedRows 1 일 때만 진행. 0 이면 FLAG 강등 + 관리자 알림(결정적 id `wctl:cap:{day}`) |
| S9 | 저장소 이상 | FLAG |
| S10 | 범위 | 기본 LINKED |
| S11 | 기록 | 이력 CONTROL/DELETED + 통제 행 DELETED. DELETE 응답 유실 → `UNKNOWN` → 조정 작업이 재조회(없으면 DELETED) — 재DELETE 하지 않는다 |

### 4.6 visibility 적용·해제 (P1-1·2)

원장 = `worklog_control` 행. 상태: `PENDING`(할 일) → `APPLYING`(claim, op id) → `RESTRICTED` / `FAILED` / `UNKNOWN`(Jira 결과 모름) / `NOT_EDITABLE` / `SKIPPED_RESTRICTED`, 해제는 `RELEASING` → `RELEASED`.

1. claim: `UPDATE … SET vis_state='APPLYING', op_id=?, rev=rev+1 WHERE worklog_id=? AND rev=? AND vis_state IN ('PENDING','FAILED','UNKNOWN')` — **Jira 호출 전에** 기록.
2. 실행 직전 `shouldRestrict` 최신 재계산(세대·연동·확정·해제 중). 아니면 행을 NONE/RELEASED 로.
3. PUT 본문: **visibility 만** `{visibility, properties:[movesApproval.op]}`, `adjustEstimate=leave`, `notifyUsers=false`. G-PRESERVE 가 "visibility 만 PUT 불가"로 나오면 후퇴 규칙: asApp GET(지문 f0) → 값 그대로 PUT → asApp GET(f1) → f1 이 우리 PUT 값과 다르거나 그 사이 `updated` 가 우리 op 가 아닌 변경으로 바뀌었으면 `CONFLICT` 표시 + 이력에 경합 기록(되돌림 가능성 경고) — 이 후퇴 모드에서는 Phase C 저장을 막는다(경합 창이 작성 직후에 몰린다).
4. 성공 → `RESTRICTED`. Jira 오류(400/403/404) → `FAILED`(last_error), 닫힌 이슈 → `NOT_EDITABLE`. 타임아웃·5xx·SQL 기록 실패 → 행은 `APPLYING` 으로 남는다.
5. **조정(reconcile)**: `APPLYING` 이 10분 넘은 행·`UNKNOWN` → asApp GET 해 실제 visibility 로 상태 확정(우리 대상이면 RESTRICTED, 아니면 PENDING 재시도 또는 NONE). 화면·해제 작업은 `RESTRICTED` 만이 아니라 **`APPLYING`·`UNKNOWN`·`FAILED` 도 대상**으로 센다.
6. 해제: `releasing=true` + 세대 증가 → 새 제한 claim 금지(2단계에서 세대 불일치) → `vis_state IN ('RESTRICTED','APPLYING','UNKNOWN','FAILED')` 전부를 키셋으로 GET → 우리 대상이면 `vis_orig_json` 으로 PUT(원래 없음 = visibility null) → RELEASED. 우리 대상이 아니면(그 사이 바뀜) 손대지 않고 `RELEASED_FOREIGN` 기록. **잔여 0 이 확인될 때까지 `releasing` 을 끄지 않고 스위치 OFF 완료를 보고하지 않는다.**
7. 제한 대상 변경(역할→그룹): 직접 바꾸지 않는다 — 해제 완료 후 새 대상으로 다시 켠다(서버가 `releasing` 중·잔여 있음이면 대상 변경 저장 거부).

### 4.7 숨김 대응 수집 (P1-7, 불변식 8 예외 6조건)

`HiddenAwareCollector` — 기존 asUser 결과에 **통제 숨김분**을 합친다. Phase B 이상일 때만 동작(그 전에는 SQL 0 추가).

| 호출부 | 바꾸는 것 | 합치는 규칙 |
|---|---|---|
| `WorklogService.getIssueWorklogs` | 본인 숨김분 | 조건 1~6, 이 이슈 |
| `WorklogCollector.collectMine`(내 타임시트·제출 스냅샷·제한선·본인 인증 목록) | `author_account=본인 ∧ 기간 안 started` 통제 행 → asApp `worklog/list`(≤1000/호출) | id 중복 제거 → 기간 필터 → **상한(이슈 200·워크로그 2000) 재적용** → `issues` 메타(asUser `issue/bulkfetch` — 열람 불가 이슈는 제외)·`createdAtById` 채움, `checksById`(워크포스 `rms.check` 는 asUser 프로퍼티 읽기라 숨김분은 못 읽음)는 `checksAvailable:false` 로 그 건만 표시 |
| `collectForAuthor`(팀장 펼침) | TeamScope 통과 대상자의 통제 행 | + 조회자 이슈 열람 재확인, 설명 제외 |
| `WorklogCertService.certifyFor` 의 `fetchWorklogsByIdAsUser` | 숨김분 id 는 asApp 로 대체 조회 | **기존 `issueVisibility`(asUser permissions/check) 재확인 보존**. MISMATCH 재인증·상위자 확인 경로 동일 |
| 타임시트 결재 상세(스냅샷 표) | 무변경(스냅샷은 DB) — 현재값 대조만 위 규칙 | |

### 4.8 영속 재개 (P1-3)

- **작업 원장은 SQL 행**(`worklog_control.vis_state`·`foreign_state`·`next_attempt_at`), 큐 이벤트는 "깨우기"일 뿐. 큐 payload = `{job:'worklog-control', op, cursor?, generation}` — `pushSweepJobs`·consumer 가 `payload` 를 그대로 넘기도록 확장(기존 작업은 무변경).
- 깨우기 실패·continuation 상한(3) 초과·실행 중단 → 원장은 남는다. 다음 기회:
  - 다음 관련 이벤트·화면 호출이 깨움(같은 KVS 표식 확인).
  - **일일 스윕**: `runSweep` 이 KVS `approval:worklogControl:pending`(작업 남음 표식, 시각)만 읽고(SQL 0) 있으면 `worklog-control` reconcile 작업을 push. 작업이 원장을 비우면 표식을 지운다. 표식이 없으면 **아무 SQL 도 없다** → 유휴 합계 불변.
- 중복 배달: claim CAS(`rev`) 로 한 번만 실행. 실행 중단: `APPLYING` 10분 경과분을 reconcile 이 처리.

### 4.9 해제·제거 (부작용 d)

- `releaseWorklogControl` = §4.6-6. 라이선스 INACTIVE 에서도 `getWorklogControlStatus`·`releaseWorklogControl` 허용(`ResponseWrapper` 예외 2 — AGENTS 라이선스 절에 사유 추가). 큐 consumer 는 원래 라이선스로 막지 않는다.
- **`preUninstall`**(F14): 55초 안에 잔여 행을 키셋으로 해제 시도(배치 병렬 5), 남으면 로그 — 보장 아님. manifest `trigger`/`preUninstall` 모듈 1개 추가(major 여부는 배포 시 확인).
- 앱 권한 상실(관리자가 앱 역할에서 Edit all 제거 등)·앱 접근 정책 차단: 해제 PUT 403 → `FAILED` 로 남고 설정 화면에 "앱 권한 복구 후 재시도" 안내 + 점검 표 링크.
- 원래 visibility 의 그룹이 삭제된 경우: 복원 PUT 400 → `vis_orig_json` 대신 null(전체 공개)로 복원할지 관리자 선택(기본: 그대로 FAILED + 목록 표시).

### 4.10 전환 순서·기존 데이터 (P1-4)

| 사건 | 처리 |
|---|---|
| B 켜기 | 세대 g+1, `since=now`. **backfill**: `worklog_cert` CERTIFIED·MISMATCH 전부 + 최근 24기간 APPROVED 타임시트 스냅샷 워크로그 → 통제 행 PENDING(키셋, 큐). 실행마다 `shouldRestrict` 재계산 |
| C 켜기 | B backfill + 통제용 연동 이슈의 기존 워크로그(이슈별 asApp 페이지 조회 — 연동 이슈 목록은 `workforce_inbound` I:·P:(ALL_ISSUES) 키셋 + 프로젝트는 JQL asUser 불가(사용자 없음) → asApp `search/jql`(사유 `worklog-control-backfill`) |
| 새 연동 신호(이슈·프로젝트 VERIFIED 로 바뀜) | `WorklogPolicyAuthority.refreshOne` 의 갱신 성공 지점에서 이슈/프로젝트 backfill 깨우기 |
| 연동 해제 신호(`ctl:'NONE'`) | 그 이슈 행 중 확정분이 아닌 것만 RELEASE |
| 타임시트 반려·재오픈 | 그 기간 행 `shouldRestrict` 재계산 — 인증됐거나 여전히 연동(C)이면 유지, 아니면 RELEASE |
| 인증 MISMATCH→재인증·DELETED | 행 유지(MISMATCH 도 잠금), DELETED 는 행 종료 |
| 옛 큐 도착 | payload 세대 ≠ 현재 → 무시 |
| 해제 중 B~D 켜기 | 저장 거부 `WORKLOG_CONTROL_RELEASE_RUNNING` |
| B→C, C→B | 세대 증가 + 재계산(C→B 는 비확정 연동분 RELEASE) |

### 4.11 정책 키 (`SettingsRepository` 세 곳 + `SettingsService`)

| 키 | 기본 | 검증 | 위치 |
|---|---|---|---|
| `worklogVisibilityScope` | `'OFF'` | OFF/CONFIRMED_ONLY/LINKED_ALL, 관문·Q127·해제 중 아님 | GLOBAL_ONLY |
| `worklogLockMethod` | `'NONE'` | NONE/PERMISSION_SCHEME, G-SCHEME | GLOBAL_ONLY |
| `foreignWorklogAction` | `'FLAG'` | OFF/FLAG/DELETE, DELETE 조건 S1 | GLOBAL_ONLY |
| `foreignWorklogScope` | `'LINKED'` | LINKED/ALL | GLOBAL_ONLY |
| `worklogControlTarget` | `''`(앱 역할) | `''` 또는 `group:{uuid}`·`role:{name}`, G-GROUP, 잔여 제한 0 일 때만 변경 | GLOBAL_ONLY |
| `issueStartDateField` | `''` | `''` 또는 `customfield_\d+` — 저장 시 관리자가 지정한 표본 이슈에서 asUser 로 값 읽기 성공해야 `verified` | GLOBAL_ONLY |
| `worklogDateWindow` | `false` | true 저장 = `issueStartDateField` verified + G-FIELD | **CATALOG**(사이트·프로젝트·이슈·워크포스 잠금). 프로젝트·이슈 덮어쓰기 저장에도 같은 조건 |

정책 아닌 상태 KVS `approval:worklogControl:state` = `{generation, since, deleteSince, releasing, invariantApproved}`, 관문 KVS `approval:worklogControl:gates`, 작업 표식 `approval:worklogControl:pending`. Start date 매핑은 이름 탐색을 **후보 제안**으로만 쓴다(자동 확정·캐시 공유 없음). 워크포스와 같은 필드·타임존을 쓰도록 `movesApproval.ctl` 로 알린다(워크포스 간트는 지금 `customfield_10015` 고정 — 다르면 WF-11 이 맞춘다).

### 4.12 불변식 대조

| # | 대조 |
|---|---|
| 1 | 해당 없음. op id 1:1 결속은 PK·CAS |
| 2 | 판정 원천 = 우리 DB. visibility·프로퍼티는 결과·운반 수단 |
| 3 | now·timeZone 인자 |
| 4 | 통제·intent·counter CAS `rev = rev + 1` |
| 6 | 알림 id `wctl:{worklogId}:{state}:{gen}` |
| 7 | §2.4 |
| 8 | 예외 6조건(§2.4), Q127 승인 전 B~D 저장 거부 |
| 9 | 연동은 VERIFIED+신선도, 워크포스 출처는 서명 검증 + op 1회성. 승인 앱 출처 프로퍼티는 DB intent 조회 키일 뿐 |

### 4.13 필수 테스트

- 계약: 검사 순서, 남의 것 → 하위 SQL 미호출 단언, 창 미해결 거부, asApp 경로는 통제 행 없으면 미호출, asApp 쓰기 전 claim, 이력 귀속 op 일치/불일치.
- 출처: 양 앱 정상 입력·동일 값 2건·빠른 수정·응답 유실(결속은 이벤트 프로퍼티로)·op 재사용·서명 실패.
- DELETE: S1~S11 각 1케이스 + 병렬 상한(조건부 UPDATE 경합 모의).
- 적용·해제: APPLYING 잔존 → reconcile, 세대 불일치 무시, 해제 잔여 있으면 완료 보고 안 함.
- 숨김 수집: 조건 1~6, 상한 재적용, 설명 비노출(팀장).
- 관문: 스위치별 저장 거부, 수동 기록.
- `idleSqlBudget.test.js`: 미연동 27·연동 38 **불변**, 표식 없을 때 runSweep 이 SQL 0 추가.
- PermissionMap 계약 9개.

---

## 5. 스키마·마이그레이션 (v056 다음)

`src/rdb/schema/ddl/worklogControl.sql.js`

```sql
-- v057_create_worklog_control — 워크로그 1건의 통제 원장
CREATE TABLE IF NOT EXISTS worklog_control (
    worklog_id         VARCHAR(20)  NOT NULL,
    issue_id           VARCHAR(20)  NOT NULL,
    project_id         VARCHAR(20)  NULL,
    author_account     VARCHAR(128) NOT NULL,
    origin             VARCHAR(16)  NOT NULL,   -- APP | WORKFORCE | APP_CHANGED | WF_CHANGED | REUSED | INVALID | NONE | BACKFILL
    linked             TINYINT(1)   NULL,
    generation         INT          NOT NULL,
    vis_state          VARCHAR(20)  NOT NULL,   -- NONE|PENDING|APPLYING|RESTRICTED|FAILED|UNKNOWN|NOT_EDITABLE|SKIPPED_RESTRICTED|RELEASING|RELEASED|RELEASED_FOREIGN
    vis_reason         VARCHAR(16)  NULL,       -- LINKED|APPROVED|CERTIFIED
    vis_orig_json      VARCHAR(512) NULL,
    vis_op_id          CHAR(36)     NULL,
    foreign_state      VARCHAR(16)  NULL,       -- FLAGGED|DELETE_PENDING|DELETING|DELETED|CLEARED|UNKNOWN
    foreign_reason     VARCHAR(24)  NULL,
    foreign_gen        INT          NULL,
    detected_fp        CHAR(16)     NULL,
    snapshot_json      TEXT         NULL,
    last_app_op_id     CHAR(36)     NULL,
    last_app_actor     VARCHAR(128) NULL,
    last_app_op        VARCHAR(8)   NULL,
    last_app_result    VARCHAR(8)   NULL,
    last_app_at        TIMESTAMP    NULL,
    jira_created       TIMESTAMP    NULL,
    detected_at        TIMESTAMP    NULL,
    acted_at           TIMESTAMP    NULL,
    next_attempt_at    TIMESTAMP    NULL,
    last_error         VARCHAR(32)  NULL,
    attempts           INT          NOT NULL DEFAULT 0,
    rev                INT          NOT NULL DEFAULT 1,
    created_at         TIMESTAMP    NOT NULL,
    updated_at         TIMESTAMP    NOT NULL,
    PRIMARY KEY (worklog_id),
    INDEX ix_wctl_issue_author (issue_id, author_account),
    INDEX ix_wctl_author_state (author_account, vis_state),
    INDEX ix_wctl_work (vis_state, next_attempt_at),
    INDEX ix_wctl_foreign (foreign_state, detected_at)
)

-- v058_create_worklog_control_intent — 출처 op 1건(승인 앱 서버 생성 / 워크포스 서명 검증분)
CREATE TABLE IF NOT EXISTS worklog_control_intent (
    op_id           CHAR(36)     NOT NULL,
    source          VARCHAR(8)   NOT NULL,   -- APP | WF
    author_account  VARCHAR(128) NOT NULL,
    issue_id        VARCHAR(20)  NOT NULL,
    started_ms      BIGINT       NOT NULL,
    seconds         INT          NOT NULL,
    worklog_id      VARCHAR(20)  NULL,
    created_at      TIMESTAMP    NOT NULL,
    bound_at        TIMESTAMP    NULL,
    PRIMARY KEY (op_id),
    INDEX ix_wcti_author (author_account, created_at)
)

-- v059_create_worklog_control_counter — DELETE 일일 상한(원자 확보)
CREATE TABLE IF NOT EXISTS worklog_control_counter (
    day_key   CHAR(10) NOT NULL,
    deleted   INT      NOT NULL DEFAULT 0,
    PRIMARY KEY (day_key)
)
```

- 마이그레이션 이름은 첫 배포 후 변경 금지. 신규 테이블 → major(`--approve MAJOR_VERSION_RULE`).
- 출처 증거 보존(codex): intent 는 결속 후에도 **90일 보관**(지연·중복 이벤트가 다시 확인할 수 있게). 정리는 intent INSERT 때 인라인 `DELETE … WHERE author_account=? AND created_at < ? LIMIT 20`(유휴 0). 통제 행도 비연동·미확정 우리 작성분을 즉시 지우지 않는다 — `vis_state='NONE' ∧ foreign_state IS NULL` 행은 90일 뒤 같은 인라인 정리.
- 시각 칼럼은 `SqlTime`. 참조 전 `isTableReady()`.

---

## 6. Jira 연결

### 6.1 REST

| 호출 | 주체 | 사유 | 언제 |
|---|---|---|---|
| `GET issue/{id}/worklog/{wid}?expand=properties` | asUser → 통제분 asApp | `worklog-control-read` | 수정·삭제 |
| `POST worklog/list?expand=properties` | asApp | `worklog-control-read` / `-trigger` / `-reconcile` | 숨김 보충·감지·조정 |
| `PUT …/worklog/{wid}?adjustEstimate=auto&notifyUsers=false` | asApp | `worklog-control-edit` | 통제분 수정 |
| `DELETE …/worklog/{wid}?adjustEstimate=auto&notifyUsers=false` | asApp | `worklog-control-delete` | 통제분 삭제 |
| `PUT …?adjustEstimate=leave&notifyUsers=false` `{visibility, properties}` | asApp | `worklog-control-restrict` / `-release` | 적용·해제 |
| `DELETE …` | asApp | `worklog-control-foreign-delete` | Phase D |
| `GET issue/{id}/worklog?expand=properties` 페이지 / `POST search/jql` | asApp | `worklog-control-backfill` | C backfill |
| `GET mypermissions?projectId=` | asApp | `worklog-control-readiness` | 앱 자신 권한 |
| `GET project/{id}/permissionscheme?expand=permissions,projectRole,group` | asUser 관리자 | — | 점검 |
| `GET field`, `GET issue/{sample}?fields=…` | asUser 관리자 | — | Start date 매핑·검증 |
| `GET issue/{id}?fields=duedate,{field}` | asUser | — | 기간 창 |
| `PUT/DELETE project/{id}/properties/movesApproval.ctl` | asApp | `workforce-publish` | ctl 게시 |
| 진단 시험(POST/PUT/GET/DELETE 워크로그) | asUser 관리자 + asApp | `worklog-control-diagnostic` | 관문 자동 시험 |

scope 추가 없음(F10 — `read:jira-work`).

### 6.2 `AGENTS.md` asApp 허용 5번 — 문구 초안

> 5. **워크로그 통제(worklog-control)** — `WorklogControlGateway` 만 쓴다. 사유 `worklog-control-{read,edit,delete,restrict,release,foreign-delete,trigger,reconcile,backfill,readiness,diagnostic}`.
>    - 수정·삭제의 허가는 **승인 앱 현재 DB 상태로만** 판정한다(서명 문서·워크포스 판정으로 대신하지 않는다). 순서: 본인 작성분 → 통제 작업 중·다른 경로 처리 중 → 기간 창(미해결이면 거부) → 인증 잠금 → 기간 잠금(승인은 정책 무관) → 정책. 실행 전 통제 행에 op id·호출 사용자를 claim 하고, PUT 에 op 프로퍼티를 실어 이력 행위자를 op 일치로만 귀속한다.
>    - **asApp 조회 결과를 사용자에게 돌려주는 예외**(CLAUDE.md 불변식 8, Q127 승인 후 유효): 우리 통제로 가려진 워크로그 중 ① 작성자 = 호출자, 또는 ② `TeamScope.leads` 를 통과한 대상자의 것 — 둘 다 응답 author·worklogId·issueId 재대조 + 조회자 이슈 열람 재확인을 거치고, 설명은 작성자에게만, count·합계·캐시도 같은 범위. 원래부터 제한된 워크로그는 보충하지 않는다.
>    - 제한·해제 PUT 은 visibility(와 op 프로퍼티)만 보낸다. 다른 경로 입력 삭제는 출처 증명 부재(`NONE`)일 때만, 안전장치 S1~S11 을 모두 거친다.
>    - `mypermissions` 는 앱 자신의 권한만, 진단은 관리자가 지정한 시험 이슈에서만 쓴다.
>    (2026-10-10 worklog-control)

2번에 "통제 설정 문서(`movesApproval.ctl`, 프로젝트 프로퍼티)" 추가. 라이선스 절에 "통제 상태·해제 resolver 는 INACTIVE 에서도 허용 — 앱 제거 전 고아 방지" 추가.

### 6.3 `movesApproval.ctl` 게시 계약 (P2)

| 항목 | 값 |
|---|---|
| 대상 | 통제용 연동 프로젝트(이슈 단위 덮어쓰기 있는 이슈는 이슈 프로퍼티) |
| 본문 | `{v:1, typ:'approval.ctl', iss:'moves-approval', ent:{projectId[,issueId]}, cloudId, vs:'OFF'|'CONFIRMED_ONLY'|'LINKED_ALL', dw:boolean, sf:string|null, tz, vt:{type, value|identifier}, ui:{globalPagePath}, gen, rev, iat}` + sig. **표시·넘김용** — 워크포스는 이것으로 쓰기 허가를 판단하지 않는다 |
| 문서 종류 | `contract.js` `TYP.APPROVAL_CTL` + `DocKind.CTL` + 벡터. `WorkforcePublisher` 는 지금 사용자 문서만 알고 모르는 종류를 실패 처리하며 `putUserProperty` 를 쓴다 → **별도 게이트웨이 함수** `putProjectProperty`·`putIssueProperty`·삭제 |
| 원장 | `workforce_publish` 재사용: `account_id = 'P:{projectId}'` 또는 `'I:{issueId}'`(VARCHAR(128) 안), `doc_key = 'ctl'`. 일일 workforce 작업이 기존 pending 처리로 재게시(유휴 SQL 무변화 — 기존 작업 쿼리 그대로) |
| 시점 | 설정·덮어쓰기 저장 직후 touch + 동기 1회 시도. 초기 동기화 = 스위치 켤 때 연동 프로젝트 전체 touch. 연동 해제·스위치 OFF = 프로퍼티 DELETE(touch 로 표시) |
| 재게시 | 세대·rev 변경마다. 서명 키 교체(kid) 시 기존 `touchKidMismatch` 경로 |

---

## 7. 프론트

### 7.1 작업 로그 탭

- 본인 행: 수정·삭제 버튼 항상 그림, `canEdit/canDelete=false` 면 비활성 + `Tooltip`(`blockedText`). 남의 행은 숨김.
- 배지: `LockBadge`(사유 가산 CERTIFIED·OUTSIDE_WINDOW·WINDOW_UNRESOLVED), `ControlBadge`(RESTRICTED "앱 관리" / PENDING·APPLYING·UNKNOWN "관리 처리 중" / FAILED·NOT_EDITABLE "관리 실패"), `ForeignBadge`(reason 툴팁), `via==='APP'` 행 "숨김(본인만 보임)".
- `channel==='WORKFORCE'` → 작성은 워크포스 탭 안내(작성 버튼 숨김), 수정·삭제는 이 탭에서 유지.
- `dateWindow` 상태 줄: OK 면 "입력 가능 기간", 미해결이면 경고 + "관리자에게 문의".
- `removedForeign`: "다른 경로 입력으로 삭제됨 — 참고 사본" + "다시 입력(새 기록)".

### 7.2 다이얼로그·넘김 화면

- `windowPrecheck.js`(순수) — status·경계. DatePicker min/max.
- 에러 분기 `error.code` §2.3.
- 업무함 엔트리 하위 경로 `worklog/{issueId}/{worklogId}` → `WorklogHandoffPage`(다이얼로그 재사용, `getWorklogHandoff`). 라우팅은 기존 inbox 라우터 규칙.

### 7.3 설정 — `WorklogControlSettings.jsx` (타임시트 탭)

```
WorklogControlSettings
 ├ 단계 표(A/B/C/D·권한 스킴) — 스위치마다 상태 + 부족한 관문(blockers) + 저장 버튼 비활성 사유
 ├ 실측 진단(관문 표): 자동 → [시험 이슈 선택][실행] 결과 단계별 / 수동 → [통과][실패] + 메모(확인 방법·증적)
 ├ 기간 창: Start date 필드 후보 Select + 표본 이슈 검증 + 결과
 ├ 다른 경로 입력: 처리·범위, DELETE → 확인 모달("DELETE" 입력, 안전장치 목록)
 ├ 제한 대상(역할/그룹) — 잔여 제한 있으면 비활성
 ├ 프로젝트 점검 표(더 보기)
 ├ 현황(counts) + [재시도] + [통제 해제](RELEASE 입력, 진행률·잔여, 잔여 0 전에는 "완료" 표시 안 함)
 └ 다른 경로 입력 목록 + [오탐 해제] + hiddenCount 안내
```
가이드 문구: VISIBILITY("고객 권한 변경 없음. 앱 역할에 Browse·Edit all·Delete all 필요. **앱 제거 전 통제 해제**. Jira 검색·리포트의 표시 차이는 진단 결과 참고"), PERMISSION_SCHEME("사용자 역할에서 Edit own·Delete own 회수 **그리고 사용자·그룹에 남은 Edit all·Delete all 도 확인**, Work on work items 유지, 앱 역할 Edit all·Delete all 확인, team-managed 미지원").

### 7.4 쿼리키

`worklogControl.status()`, `.readiness(cursor)`, `.foreign(state,cursor)`, `.handoff(issueId, worklogId)`. 저장·진단·해제 후 `status` 무효화.

### 7.5 재사용

`LockBadge`·`DeleteConfirm`·`SectionMessage`·`Lozenge`·`Tooltip`·`DynamicTableStateless`·기존 Confirm 모달 패턴·`WorklogDialog`.

---

## 8. i18n 키 (kr / en) — `npm run merge`

### 8.1 신규 `worklogControl.json`

| 키 | kr | en |
|---|---|---|
| `worklogControl.title` | 워크로그 통제 | Worklog control |
| `worklogControl.phase.A` / `B` / `C` / `D` / `scheme` | 기본 — 이 앱 화면 검사·다른 경로 표시 / 확정분 숨김 / 연동 이슈 전체 숨김 / 다른 경로 입력 자동 삭제 / 권한 스킴 방식 | Base — checks in this app, flag other paths / Hide confirmed entries / Hide all on linked issues / Auto-delete entries from other paths / Permission scheme method |
| `worklogControl.blockers` | 필요한 실측: {gates} | Required checks: {gates} |
| `worklogControl.gate.{G_ROLE…G_HANDOFF}` | 관문 이름(§10 표) | (영문 대응) |
| `worklogControl.gate.run` / `pass` / `fail` / `note` | 실행 / 통과로 기록 / 실패로 기록 / 확인 방법·증적 | Run / Record pass / Record fail / How verified |
| `worklogControl.gate.versionChanged` | 앱 버전이 바뀌어 다시 확인이 필요합니다 | App version changed — re-check recommended |
| `worklogControl.invariantPending` | 보안 검토 승인 전에는 켤 수 없습니다 | Unavailable until security review is approved |
| `worklogControl.foreign.*` | 처리 안 함 / 표시만(인증 제외) / 삭제(유예 후) / 연동 이슈만 / 모든 이슈 | Ignore / Flag only (excluded from certification) / Delete after grace / Linked issues only / All issues |
| `worklogControl.foreign.reason.{NONE,REUSED,INVALID,PRE_RESTRICTED,CAP,CHANGED}` | 출처 증명 없음 / 재사용된 출처 / 출처 검증 실패 / 원래 제한된 기록 / 일일 상한 / 감지 후 변경됨 | (영문 대응) |
| `worklogControl.delete.confirmBody` | 지금 이후 생성분 중 출처 증명이 전혀 없는 것만, 10분 유예와 알림 뒤 삭제합니다. 하루 {max}건을 넘으면 표시만 합니다. 삭제 전 참고 사본을 남기지만 복원은 아닙니다. 확인하려면 DELETE 를 입력하세요. | (영문 대응) |
| `worklogControl.startField.*` | 시작일 필드 / 표본 이슈로 확인 / 확인됨 / 확인 필요 | Start date field / Verify with sample issue / Verified / Needs verification |
| `worklogControl.counts.*` | 관리 중 / 처리 중 / 대기 / 실패 / 결과 불명 / 원래 제한됨 / 닫힌 이슈 / 해제 중 / 해제됨 / 표시됨 / 삭제 예정 / 삭제됨 | (영문 대응) |
| `worklogControl.release.confirm` | 앱이 숨긴 작업 로그를 원래 공개 범위로 되돌립니다. 앱 제거 전 반드시 실행하고, 남은 건수가 0 이 될 때까지 기다리세요. RELEASE 를 입력하세요. | (영문 대응) |
| `worklogControl.release.remaining` | 남은 {count}건 | {count} remaining |
| `worklogControl.guide.visibility` / `.permissionScheme` / `.sideEffects` | §7.3 | (영문 대응) |
| `worklogControl.hiddenCount` | 열람 권한이 없는 이슈의 {count}건은 표시하지 않았습니다 | {count} rows on issues you can't view are hidden |

### 8.2 가산

| 키 | kr |
|---|---|
| `worklog.lock.reason.CERTIFIED` | 인증된 작업 로그라 고칠 수 없습니다 |
| `worklog.lock.reason.OUTSIDE_WINDOW` | 이슈 기간({start}~{end}) 밖입니다 |
| `worklog.lock.reason.WINDOW_UNRESOLVED` | 이슈 기간을 확인할 수 없어 입력할 수 없습니다 |
| `worklog.blocked.{NOT_OWNER,FOREIGN_PENDING,NO_JIRA_PERMISSION,CONTROL_UNAVAILABLE,CONTROL_BUSY}` | 본인 기록만 / 삭제 예정 / Jira 권한 없음 / 앱 권한 부족 — 관리자 문의 / 처리 중 — 잠시 후 |
| `worklog.control.badge.{RESTRICTED,BUSY,FAILED}` · `worklog.via.app` | 앱 관리 / 관리 처리 중 / 관리 실패 · 숨김(본인만 보임) |
| `worklog.foreign.badge` | 다른 경로 입력 |
| `worklog.tab.{channelWorkforce,window,removedForeign,reenter,snapshotNote}` | 작성은 워크포스 탭에서 / 입력 가능 기간 {start}~{end} / 다른 경로 입력으로 삭제됨 / 다시 입력(새 기록) / 참고 사본 — 복원이 아닙니다 |
| `worklog.handoff.title` | 작업 로그 수정 |
| `error.*` §2.3 12개 | 각 문장 |
| `policy.worklogDateWindow` | 이슈 시작일~기한 안에서만 입력(워크포스 연동 이슈) |
| `notification.worklogControl.{foreignFlagged,foreignDeletePending,foreignDeleted,deleteCapReached,controlFailed}` | … |
| `worklogHistory.source.CONTROL` | 앱 통제 |

(en 은 같은 키로 대응 문장)

---

## 9. 용량·호출량

### 9.1 행·바이트 (200명, 실측 전)

| 테이블 | 연 행 | 바이트(인덱스 ×2) |
|---|---|---|
| `worklog_control` | 최악 150k(C, 전부 연동) + 우리 작성분 90일 보관분 | ≈260B × 150k × 2 ≈ **80MB/년** 최악 |
| `worklog_control_intent` | 90일 보관 ≈ 37k 상주 | ≈ 10MB |
| `worklog_control_counter` | 365 | 무시 |
| 스냅샷 | 상한 50/일 × ≤32KB | 현실 수 MB, 이론 상한 ≈ 580MB/년 → **스냅샷 보관 90일**(인라인 정리) |

### 9.2 호출량

| 경로 | Jira | SQL |
|---|---|---|
| 수정·삭제(통제분) | asUser GET 1(404) + asApp GET 1 + mypermissions 1 + asApp 쓰기 1 + 이슈 필드 ≤1 | 통제 1 + 연동 ≤2 + 인증 1 + 잠금 기존 + claim 1 + 결과 1 |
| 작성 | 기존 + 이슈 필드 ≤1 + (C) PUT 1 | intent 1 + 결속 2 + 인라인 정리 ≤1 |
| 이슈 탭(B 이상) | + asApp list ≤1 | + 1 |
| 내 타임시트(B 이상) | + asApp list ⌈숨김/1000⌉ + bulkfetch ≤1 | + 1 |
| 트리거 created(기능 ON) | prefetch 재사용(expand=properties 로 확장) 또는 asApp 1 | 1~3 |
| **visibility PUT 이 만드는 updated 이벤트** | 기존 이력·drift·cert 관찰 비용이 PUT 마다 1회 더 발생(이력 기록은 CONTROL 행 1) | 이력 2~3 |
| 큐 restrict 200건 | list 1 + PUT 200 | claim·결과 400 |
| 진단 1회 | ≤15 | ≤5 |

팀장 50명 인증(B): 5,000 PUT → 큐 25 실행 + updated 이벤트 5,000건의 이력 처리. 429 는 원장 `next_attempt_at` 지수 지연.

### 9.3 유휴 SQL

**추가 0**(정상 유휴 = 원장 비어 있고 표식 없음). 새 스케줄 없음, `DAILY_JOBS` 불변. `runSweep` 은 KVS 표식만 읽는다. 작업이 남은 날은 reconcile 작업의 SQL 이 생긴다(이벤트 비용으로 분류). 미연동 27·연동 38 불변을 테스트로 고정하고, 표식이 있는 경우의 SQL 상한(빈 원장 1회 조회 = 2)도 별도 단언.

---

## 10. 실측 관문 (codex "배포 전 필수 실측" 통합)

"배포 전" = **운영에서 해당 스위치를 켜기 전**. 시험 계정: 작성자 A, 다른 사용자 B, A 의 팀장 L, 다른 팀장 L2, Edit/Delete all 보유 관리자 M(**제한 대상 역할·그룹 멤버가 아님**을 별도 확인), 승인 앱·워크포스 앱 실제 계정. 판정 기준은 응답 코드가 아니라 **실제 기록 불변·실제 결과**.

자동 = `runWorklogControlDiagnostic` 이 관리자(=A·M 역할 겸용) asUser 와 승인 앱 asApp 으로 시험 이슈에서 수행·기록. 수동 = 사람이 하고 `recordWorklogControlGate` 로 기록.

| 관문 | V | 내용·통과 기준 | 자동 | 수동 | 필요한 스위치 |
|---|---|---|---|---|---|
| **G-ROLE** 제한 대상·앱 접근 | V1·V2·V11 | 관리자 asUser 로 시험 워크로그 생성 → 승인 앱 asApp 으로 제한 PUT → asApp GET·PUT(값 변경)·DELETE 각각 실제 반영 확인. asApp mypermissions 결과 기록. 역할 존재·scope 만으로 통과 금지 | 전부 | — | B·C |
| **G-BLOCK** 작성자·관리자 우회 차단 | V3·V4 | 제한분에 관리자 asUser(작성자 겸 M) GET·시간 변경 PUT·visibility 제거 PUT·다른 그룹으로 변경 PUT·DELETE → 기록 불변 | 관리자 계정 몫 | **일반 사용자 A·B 계정**, API 토큰 REST(curl), 모바일 앱, bulk delete·이슈 이동(사용 시) | B·C |
| **G-POST** 생성 직후 통제 | V7·V23 | asUser POST 에 제한 visibility 동봉 가능 여부(가능하면 author 보존·앱 접근 확인). 불가면 POST→PUT 사이 병렬 PUT·DELETE 를 넣어 공백 측정 → 결과를 "등록 즉시" 문구에 반영. 제공자 선택 후 직접 REST 생성 | POST 동봉·병렬 경합 | 제공자 설정 상태 REST 생성(토큰) | C |
| **G-PRESERVE** 값 보존·닫힌 이슈 | V5·V10·V17·V18 | 복잡한 ADF·properties·started·seconds·추정치 기록에 visibility 만 PUT → 해제 → 필드·author 보존, updateAuthor, 알림 off 수용. 동시에 다른 PUT 실행해 값 되돌림 없음. 닫힌 이슈 반복 | 전부(닫힌 이슈는 관리자 지정) | — | B·C (실패 시 후퇴 모드, C 금지) |
| **G-AGG** 화면·검색·집계 | V8·V22 | 제한 전후 `timespent·aggregatetimespent·timeestimate`, worklog 상세, 승인 앱 탭·내 타임시트·팀장 인증 조회·**인증 실행·재인증** 의 id·합계 대조 | 이슈 필드·승인 앱 경로 | JQL·대시보드·기본 리포트 화면 확인, 워크포스 본인 탭·원가·현황 | B·C |
| **G-RECOVER** 해제·라이선스·제거 | V15 | INACTIVE 조건에서 status·release 접근, 제한 직후 DB 기록 실패 주입·해제 중단 재개·옛 restrict 큐 도착 → 잔여 0 | 실패 주입(진단 모드 플래그)·재개 | INACTIVE 설치, `preUninstall`(별도 설치에서 실패·55초 초과), 대상 변경 | B·C |
| **G-FIELD** 기간 필드 | V13 | 동명 datepicker 두 개, 한글 표시, 프로젝트 context 차이, 호출자 권한 차이, 삭제된 필드, 빈 값, 역전 날짜 → 미해결은 거부, 양 앱 같은 경계·타임존 | 표본 이슈 값 읽기·상태 판정 | 다중 필드·context 구성, 워크포스 간트 대조 | 기간 창 |
| **G-LINK** 통제용 연동 | — | 신선/만료/해제 신호, 프로젝트 `ALL_ISSUES` 유무에 따른 판정 | 판정 함수(수신 캐시 시뮬레이션) | 워크포스 실제 게시(WF-9) | C |
| **G-WF** 워크포스 접근 | V16 | 워크포스 앱 계정으로 제한분 GET(본인 필터)·협업 집계 포함 조건·넘김 링크 | — | 워크포스 진단(WF-13) | C |
| **G-HANDOFF** 넘김 | — | 워크포스 탭 → 승인 앱 탭 안내 / 전역 페이지 하위 경로 이동 | — | 두 앱 설치 화면 | C(Q121 A) |
| **G-ORIGIN** 정상 출처 | V6·V24 | 양 앱 정상 입력, 동일 값 두 건, 빠른 수정, 응답 유실, 이벤트 중복·역순·지연, 사전 승인 APPLYING/UNKNOWN, 타 앱 프로퍼티 읽기(`expand=properties`) → **정상 기록 FOREIGN 0건** | 승인 앱 측 전부(이벤트 모의 포함) | 워크포스 탭 입력 | D |
| **G-DELETE** 자동 삭제 | V14 | 유예 중 인증·오탐 해제·설정 OFF, 50건 경계 병렬 실행, 삭제 응답 유실 → 정상 삭제 0, 상한 초과 0 | 전부(시험 이슈, 상한을 진단 모드에서 3으로) | — | D |
| **G-GROUP** 그룹·전용 역할 | V9 | 앱 계정 그룹·역할 등록, 복구 관리자 접근 | — | 관리 콘솔 | 대상 변경 |
| **G-TEAM-MANAGED** | V20 | team-managed 에서 제한·조회·수정·삭제·해제 전 과정 | 시험 이슈가 team-managed 면 자동 | — | 해당 프로젝트 포함 시(미통과면 그 프로젝트는 서버가 통제 제외) |
| **G-SCHEME** 권한 스킴 | V12·V21 | 점검 표에서 사용자 쪽 Edit/Delete own **및 all** 보유자 없음, 앱 역할 보유 | 점검 resolver | 관리자 스킴 편집 | PERMISSION_SCHEME |

**V 목록 밖 필수 검증**(자동 진단 + 계약 테스트에 포함):
- **인가 회귀**: 다른 사람 id·다른 이슈 id 주입, 이슈 열람 권한 회수, 팀장 변경, 다른 cloud 의 서명 출처, 원래 제한된 워크로그 → 상세·count·합계·관리자 목록 누출 0(계약 테스트 + 수동 1회).
- **서명 상태 최신성**: P0-2 로 쓰기 허가에서 서명 문서를 뺐으므로, 남는 검증은 "낡은 `ctl` 문서가 표시만 바꾸고 실행을 바꾸지 않음"(계약 테스트).
- **영속 재개와 비용**: 큐 push 실패·중복 배달·실행 중단·continuation 초과 후 재개, 정상 유휴 SQL 추가 0, 이벤트 있을 때 실제 SQL·Jira 호출 수 기록(진단 결과에 카운터).

---

## 11. 작업 분해

### 선행
- 인증·감사 커밋됨(b2532b0) — 충돌 없음. 번호 v057~.
- Q127 승인 전에도 전부 구현하되 B~D 저장은 서버 거부.

### backend
- [ ] 도메인 6 파일 + 가산 3 + 테스트(§3.8)
- [ ] DDL v057~v059 + migrate + index
- [ ] Repository(CAS·claim·인라인 정리), Gateway(사유 집합 고정 테스트)
- [ ] `ControlLinkJudge`(신선도·`ctl`·해제), `StartDateField`(후보·표본 검증)
- [ ] `WorklogService` 검사 순서·실행 주체·op claim·응답 가산, `getWorklogHandoff`
- [ ] 작성 출처: intent·`movesApproval.origin` 프로퍼티·결속(WorklogService·WorklogApprovalService)
- [ ] `verifyWorkforceOrigin` + 계약 `rms.wlorigin`(contract.js TYP·validator·벡터, 키링은 워크포스 family 재사용)
- [ ] 트리거 분기(통제 적용 / 외부 처리 분리), 이력 prefetch `expand=properties`
- [ ] Worker(restrict/release/reconcile/backfill/foreign-recheck/foreign-delete), 큐 payload 확장, `runSweep` KVS 표식 조건부 push
- [ ] DELETE S1~S11, counter
- [ ] `HiddenAwareCollector` + collectMine/collectForAuthor/certifyFor/getIssueWorklogs 연결(6조건)
- [ ] 이력 귀속(op 일치), source CONTROL
- [ ] 타임시트 결정·반려, 인증 후, 연동 신호 갱신 hook
- [ ] Readiness, Diagnostics(자동 관문 + 실패 주입 모드), Service/Controller, PermissionMap 9, CONTROLLER_REGISTRARS
- [ ] 정책 키 7 + 관문 기반 저장 검증 + 계약 테스트
- [ ] `movesApproval.ctl` 게시(별도 게이트웨이, publish 원장 재사용)
- [ ] `preUninstall` 모듈·핸들러, `ResponseWrapper` 라이선스 예외 2
- [ ] ErrorCodes 12 + error.json, 알림 템플릿 5
- [ ] `idleSqlBudget.test.js` 불변 + 표식 케이스
- [ ] 문서: AGENTS 5번·2번·라이선스 절, CLAUDE.md 불변식 8 예외(Q127 승인 후), DESIGN.md §2.0 갱신 — "권한 회수 대신 visibility 단계 활성(A 기본 → B 확정분 → C 연동 전체 → D 자동 삭제), 각 단계는 사이트별 실측 관문 기록 후. 통제분 수정·삭제는 승인 앱이 현재 DB 로 판정해 asApp 실행. 권한 회수는 선택지"

### frontend
- [ ] 탭(비활성+툴팁, 배지 4, 창구 안내, 기간 줄, 참고 사본)
- [ ] 다이얼로그 `windowPrecheck.js`·에러 분기, `WorklogHandoffPage`(inbox 하위 경로)
- [ ] `lockText.js` 사유·`blockedText`
- [ ] `WorklogControlSettings`(단계 표·진단·필드 검증·DELETE 모달·점검·현황·해제·목록)
- [ ] 쿼리키, i18n + merge
- [ ] UI 테스트: 비활성 사유, 창 미해결 저장 불가, blockers 표시, DELETE 확인, 해제 잔여 표시

### 순서
도메인 → 스키마 → 쓰기 경로(A) → 출처·FLAG(A) → 진단·설정(A) → B(숨김 수집·적용 원장·해제) → C(작성 즉시·backfill·ctl) → D(삭제). 각 단계는 코드 완료 후에도 스위치 OFF.

---

## 12. 워크포스 리포 작업 (이 하네스는 구현하지 않음)

| # | 작업 | 내용 | 의존 |
|---|---|---|---|
| WF-7 | **연동 모드 asApp 본인 워크로그 조회**(U-C) | 이슈 탭 워크로그 읽기를 백엔드 resolver asApp 으로. 반환 = `author.accountId === context.accountId`(서버) **이고** 승인 앱 통제분 증명(현재 visibility 가 승인 앱 `ctl` 의 `vt` 와 일치) — 원래 제한된 남의 범위 워크로그는 지금처럼 제외. 비연동이면 지금처럼 asUser. 협업 수집기 `isUnrestrictedWorklog` 는 같은 증명이 있을 때만 통과. 원가·현황 **집계**는 기존 원가·팀 범위 인가를 거친 뒤에만, 한 명·한 건 집계도 개인 상세로 취급 | 승인 앱 `ctl`, G-WF |
| WF-8 | **수정·삭제를 승인 앱으로 넘김**(P0-2) | 연동 이슈 탭의 수정·삭제 버튼 → 승인 앱 작업 로그 탭 안내, 제공자가 아니면 `ctl.ui.globalPagePath` 로 `router.navigate`. **워크포스 asApp 쓰기 실행기 없음**, 서명 문서로 허가 판단 없음 | G-HANDOFF |
| WF-9 | 연동 신호 게시 | 이슈 단위 `rms.policy`(`I:`) 와 프로젝트 `rms.policy`(`P:`) + `ctl:'ALL_ISSUES'|'NONE'`(신규 필드) + 만료 갱신, 연결 해제 시 `NONE` 게시 | 계약 추가(양 리포) |
| WF-10 | (Q123 b) 프로젝트 기간 | 후속 | WF-9 |
| WF-11 | 계약 사본 | CATALOG `worklogDateWindow`, `approval.ctl` TYP, `rms.wlorigin` TYP·벡터, 간트 Start date 필드를 `ctl.sf` 로 | 승인 앱 선배포 |
| WF-12 | **작성 출처 서명**(P0-1) | 연동 이슈 탭 작성을 **워크포스 백엔드 resolver** 경유: resolver 가 op(UUID)·issueId·authorId(=context)·started·seconds·iat·exp(≤15분)를 서명한 `movesRms.origin` 봉투를 만들고, 같은 resolver 가 asUser POST 본문 `properties` 에 실어 생성(프론트 직접 POST 제거). `rms.org.cap` 에 `wlorigin` 게시(능력 신호 — 승인 앱 DELETE 저장 조건) | WF-11 |
| WF-13 | 워크포스 진단 | G-WF 용 — 워크포스 앱 계정으로 제한분 GET, 협업 집계 포함 조건, 넘김 링크 확인 결과를 워크포스 관리자 화면에 표시 | — |

---

## 출처 (2026-10-10)

- Jira Cloud REST v3 OpenAPI(`swagger-v3.v3.json`) — Worklogs·Get worklogs·Get my permissions·Get assigned permission scheme·Get fields, 스키마 Worklog·Visibility
- [The atlassian-addons-project-access project role in Jira Cloud](https://support.atlassian.com/jira/kb/the-atlassian-addons-project-access-project-role-in-jira-cloud/)
- [Forge pre-uninstall trigger](https://developer.atlassian.com/platform/forge/manifest-reference/modules/pre-uninstall-trigger/), [Async events API](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/), [Jira time tracking provider](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-time-tracking-provider/), [Jira action validator](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-action-validator/), [Project role actors API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-role-actors/) — codex 검토가 확인한 문서
- Start date id 가변: [커뮤니티 1](https://community.developer.atlassian.com/t/how-to-easily-distinguish-start-date-fields-from-other-custom-fields/79102), [커뮤니티 2](https://community.developer.atlassian.com/t/confirm-variancy-of-jira-cloud-issue-field-keys-for-custom-fields/21134), [JRACLOUD-80746](https://jira.atlassian.com/browse/JRACLOUD-80746)

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-10 | 초판 — visibility 혼합안 권고, 창구 정리, 본인만 조회 | 사용자 지시 U-A·U-B·U-C |
| 2026-10-10 | **2판 — codex 검토 반영**: 출처 증명(op id·워크포스 서명 출처, DELETE 는 증명 부재일 때만)·수정·삭제 권위 단일화(워크포스 실행기 제거, UI 넘김)·적용 원장(APPLYING·reconcile·세대)·영속 재개(DB 원장+KVS 표식)·전환 순서·통제용 연동 판정 분리·Start date fail-close·숨김 대응 수집(인증 실행 포함)·op 기반 행위자 귀속·ctl 게시 계약·S4/S5/S8 보완·Phase A~D 스위치와 사이트별 실측 관문(서버 강제)·`preUninstall`. 계약 변경: 정책 키 `worklogLockMethod` 를 `worklogVisibilityScope`+`worklogLockMethod`(NONE/PERMISSION_SCHEME) 로 분리, `worklogControlGroupId`→`worklogControlTarget`, resolver 3 추가(`runWorklogControlDiagnostic`·`recordWorklogControlGate`·`getWorklogHandoff`), `listForeignWorklogs` 행 단위 가시성+`hiddenCount`, 에러 코드 3 추가, 테이블 1 추가(counter), 번호 v057~v059 확정 | codex-review.md, 사용자 방침(전부 구현·위험 모드 기본 OFF) |
