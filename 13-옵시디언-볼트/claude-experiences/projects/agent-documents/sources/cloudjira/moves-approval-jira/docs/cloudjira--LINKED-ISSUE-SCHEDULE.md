# 연동 이슈 작성 기간·사전 승인 (linked-issue-schedule)

> 작성 2026-10-13 · 대상: 승인 앱(이 리포, 브랜치 `linked-issue-schedule`)과 워크포스(`moves-workforce`, 브랜치 `RFC-220`)
> 상세 설계와 검증 기록: `_workspace/linked-issue-schedule/01_architect_design.md`, `02~07_codex_*.md`
> 사용자 결정: `_workspace/QUESTIONS.md` Q139

## 1. 한 줄 요약

워크포스와 연동된 사이트에서는 **작업마다 "언제부터 언제까지 시간을 쓸 수 있는지"와 "사전 승인이 필요한지"를 워크포스 팀장이 정하고**, 시간을 쓰거나 고칠 때 이 값을 지키는지는 **승인 앱이 판단**합니다. 시간 입력 화면도 연동된 작업은 승인 앱 한 곳으로 모았습니다.

## 2. 왜 바꿨나

- 이슈별 정책을 승인 앱 안에서 "사이트 → 프로젝트 → 이슈" 3단으로 상속하게 만들었더니 너무 복잡했습니다.
- 연동된 작업의 시간은 워크포스 화면에서도 쓸 수 있었는데, 그 경로는 승인 앱의 기간 잠금·시간 상한·사전 승인 검사를 거치지 않았습니다(구멍).
- 작업을 실제로 관리하는 사람은 워크포스 팀장입니다. 작업 목록을 보면서 정하는 게 가장 자연스럽습니다.

## 3. 누가 무엇을 하나

| 누구 | 어디서 | 무엇을 |
|---|---|---|
| 워크포스 팀장 | 워크포스 작업관리 → **"승인 설정"** 보기 | 작업별 작성 기간(시작일~종료일), 사전 승인(필요 / 불필요 / 기본 따름). 여러 작업을 골라 한 번에 적용 |
| 승인 앱 | 서버 | 서명 확인 → 저장 → 작성·수정·삭제·사전 승인 요청·타임시트 제출 때 판정 |
| 작업자 | 승인 앱 작업 로그 탭(연동 작업은 워크포스식 화면) | 날짜·시작~종료 시각으로 기록. 워크포스에서 기록하려 하면 승인 앱 화면으로 넘어감 |
| 승인 앱 관리자 | 승인 앱 설정 → 워크포스 연동 | 연동 켜기, 작성 창구 "승인 앱" 선택 |
| 워크포스 관리자 | 워크포스 설정 | "승인 앱 연동" 스위치 켜기 |

- **팀장만 고칠 수 있습니다.** 워크포스 관리자라도 그 프로젝트를 맡은 팀의 **직속** 팀장이 아니면 저장이 거부됩니다(`ISSUE_SETTING_NOT_TEAM_LEAD`). 보기는 작업관리를 볼 수 있는 사람 모두 가능합니다.
- 팀장이 기간을 정하지 않은 작업은 지금처럼 동작합니다("이슈 기간 창" 스위치가 켜져 있으면 Jira 시작일~기한).

## 4. 어떻게 전달되나

```
워크포스 팀장 저장
   └─ 워크포스가 값에 서명 → 이슈 프로퍼티 movesRms.issue (rms.issue)
                         → 프로젝트 프로퍼티 movesRms.kb (rms.kb: 하루 근무 시간·공휴일, KPI 환산용)
승인 앱
   ├─ 이슈를 열거나 쓰기·제출할 때 서명 문서를 다시 읽음(asUser 이슈 조회에 얹어서 추가 호출 없음)
   ├─ 서명·대상(사이트·프로젝트·이슈)·rev 확인 → 자기 DB(workforce_inbound)에 저장, 바뀐 값은 감사 기록
   └─ approval.ctl 에 작성 창구(ch: APP | WORKFORCE)와 받을 수 있는 문서 목록(rx)을 게시
워크포스
   └─ 연동 대상 작업에서 새 기록 → ch 가 APP 이면 승인 앱 새 작성 화면으로 넘김
```

- 서명 키는 `docs/ops/WORKFORCE-LINK-SIGNING-KEYS.md` 의 그 키를 그대로 씁니다.
- Jira 프로퍼티는 편집 권한자 누구나 바꿀 수 있어서 믿지 않습니다. 서명이 맞아야만 씁니다(불변식 9).
- 계약 파일 7개(`contract.js` 등)는 두 리포에서 **바이트까지 같아야** 합니다. `.gitattributes` 로 줄끝을 LF 로 고정했고, 워크포스 `vectors.test.js` 가 지문과 원본을 대조합니다.

## 5. 판정 규칙

| 상황 | 결과 |
|---|---|
| 작성 기간 밖 날짜로 작성·수정·삭제 | 거부 |
| 사전 승인 "필요" | 바로 저장하지 않고 승인 요청으로 |
| 팀장 값과 Jira 프로젝트 설정이 다름 | 팀장 값을 따름(Q1) |
| Jira 에 걸린 문서와 승인 앱 저장본이 어긋남(동시 저장 등) | **두 값 중 더 엄한 쪽**(기간은 교집합, 사전 승인은 필요 우선). 더 높은 rev 를 정상으로 받을 때까지 풀리지 않음 |
| 설정을 저장하지 못함(감사·DB 실패) | 작성·수정·삭제·요청·제출 거부(`LINKED_SETTING_PERSIST_FAILED`), 화면은 경고만 |
| 타임시트 제출 | 대상 작업 설정을 그 자리에서 다시 읽고, 사전 승인 증거는 **승인 DB 기록과 대조**(워크로그에 붙은 표식은 믿지 않음). 못 읽으면 제출 거부(`TIMESHEET_LINKED_SETTING_UNRESOLVED`) |
| 워크포스에서 연동을 확인할 수 없음(문서 없음·서명 실패·신뢰 키 없음) | 직접 기록으로 돌아가지 않고 멈춤(`WORKLOG_LINK_UNCONFIRMED`). 명시적 `ch:'WORKFORCE'` 일 때만 워크포스가 직접 기록 |
| Jira 기본 Log work·REST·자동화로 들어온 기록 | 미리 막을 수는 없음. 작업 로그 탭에 위반 배지, 타임시트 제출 때 위반으로 표시. 지우거나 숨기지는 않음(Q17) |

## 6. 켜는 순서 (개발·스테이징 시험)

1. 두 앱에 서명 키가 들어가 있는지 확인(`WORKFORCE-LINK-SIGNING-KEYS.md`).
2. 승인 앱 설정 → 워크포스 연동 → **연동 켜기**, **작성 창구 = 승인 앱**.
3. 워크포스 설정 → **승인 앱 연동** 켜기.
4. 워크포스 작업관리 → 프로젝트 → **승인 설정** 보기에서 작업 몇 개에 기간·사전 승인 지정(팀장 계정).
5. 승인 앱 작업 로그 탭에서 확인: KPI 카드, 시작~종료 입력, 기간 밖 날짜 거부, 사전 승인 요청 전환.
6. 워크포스 이슈 패널에서 기록 → 승인 앱 화면으로 넘어가는지.
7. 팀장 아닌 계정·관리자 계정으로 저장이 막히는지.

## 7. 화면

- **워크포스 작업관리 "승인 설정"**: 작업 표 + 선택 바("N건 선택 · 승인 설정 일괄 적용"), 일괄 적용 모달. 저장자·저장 시각 표시.
- **승인 앱 작업 로그 탭(연동 작업)**: 위에 KPI 카드(계획 작업량·투입 공수 MM/MD·내 몫·진행률), 설정 요약(기간·사전 승인), 날짜·시작 시간~종료 시간·코멘트 입력(저장 뒤 날짜·시간 유지), 아래 최근 기록 표. 위반 기록에는 배지.
- **승인 앱 새 작성 경로**: 전역 페이지 `worklog/{issueId}/new/{date}` — 워크포스에서 넘어올 때와 시간 추적 제공자를 고르지 않은 사이트의 이슈 패널 "작업 시간 기록"에서 씀.
- 연동 안 된 작업의 화면은 지금 그대로입니다(Q12).

## 8. 보장하지 않는 것

- Jira 기본 화면·REST·자동화로 들어오는 기록을 **미리** 막지는 못합니다. 타임시트 제출 대조가 최종 보장입니다.
- 처음 읽는 이슈에 옛 서명 문서가 걸려 있으면 그 문서가 적용될 수 있습니다. 그 문서도 그 이슈에 대한 진짜 팀장 결정이었습니다.
- 저장 실패와 동시 저장과 옛 문서 재생이 한꺼번에 겹치면 잠시 제한이 느슨해질 수 있습니다(검증 6회차 잔여, 수용 — Q139).

## 9. 코드 위치

**승인 앱**
| 역할 | 파일 |
|---|---|
| 계약(두 리포 동일) | `src/integration/workforce/contract.js`, `vectors.json` |
| 수신·저장·누적 | `src/resolver/workforce/LinkedIssueSettingSource.js`, `src/domain/linkedIssue/setting.js`, `WorkforceInbound.js`, `WorkforceLinkRepository.js` |
| 판정 연결 | `src/resolver/worklogControl/WorklogControlContext.js`(`windowEnforced`), `src/domain/worklogPolicy/merge.js`(`LINKED_ISSUE` 층), `src/resolver/worklogApproval/WorklogApprovalPolicy.js`·`WorklogApprovalService.js` |
| 제출 대조·위반 | `src/domain/linkedIssue/violation.js`, `src/resolver/timesheet/WorklogCollector.js`·`TimesheetService.js`, `WorklogControlDetector.js` |
| KPI·게시 | `src/domain/linkedIssue/kpi.js`·`workday.js`, `src/resolver/worklogControl/WorklogControlCtl.js`(커서 순회 — 기존 1,000건 한도 결함 수정) |
| 화면 | `static/ui/src/features/worklog/Linked*.jsx`, `WorklogCreateHandoffPage.jsx`, `WorklogTab.jsx`, 설정 `WorkforceLinkSettings.jsx`(작성 창구) |

**워크포스**
| 역할 | 파일 |
|---|---|
| 계약 | `src/integration/approval/contract.js`, `issueSetting.js`, `kbDoc.js`, `controlDoc.js` |
| 팀장 판정 | `src/permission/TeamLeadAuthority.js`, `PermissionMap.js`, `TeamLeadFieldPolicy.js`, `permissionGuard.js` |
| 설정 저장·게시 | `src/resolver/approvalLink/IssueApprovalSettingService.js`·`Controller.js`, `ApprovalLinkSignals.js` |
| 생성 넘김 | `src/resolver/approvalLink/IssueWorklogControlService.js`, UI `components/worklog/createChannel.js`, `panel/*` |
| 화면 | `pages/projectDetail/issue/IssueApprovalSettingTable.jsx`·`IssueApprovalBulkModal.jsx`, `backoffice/page/setting/EtcSetting.jsx`(스위치) |

## 10. 남은 일

| 단계 | 내용 | 조건 |
|---|---|---|
| 실측 G1~G12 | 다른 앱 프로퍼티 읽기, 다른 앱에서 넘어오기, `timespent` 와 숨긴 기록, 신·구 버전 조합 등(설계 §16) | 개발 사이트에서 사람이 확인 |
| A-7 | 승인 앱 "Jira 이슈 재정의" 제거(데이터는 보존·폐지 표시, 저장 API 삭제) | G4 통과 뒤 |
| W-8a / A-8b | 인원 구조 동기화 — 워크포스가 팀·팀장 문서를 게시하고, 연동 모드 결재선·팀장 범위가 이 구조만 씀. 팀장의 결재는 위 팀장, 위에 없으면 본인 결재(명부 모드도 허용, "본인 결재"로 표시 — Q16) | 실측 뒤 |
| 별도 작업 | 기간 일괄 입력을 승인 앱으로 옮기기(이번에는 연동 작업에서 첫 날만 넘김) | — |
| 병합 | 승인 앱 브랜치 `linked-issue-schedule` → master, 워크포스 RFC-220 → develop | 실측 뒤 |

## 11. 결정 기록 (Q139, 2026-10-12)

Q1 팀장 값 우선 · Q2 필요/불필요/기본 따름 · Q3 기간 미지정은 지금처럼 · Q4 모두 보기, 팀장만 편집 · Q5 워크포스 팀 없는 사람 제출 차단 · Q6 직속 결재 · Q7 워크포스 DB 저장 안 함 · Q8 일괄 입력은 다음 작업 · Q9 이슈 패널 기록 줄 · Q10 옛 이슈 재정의 보존·폐지 표시 · **Q11 앱 전용 일정 필드 설계 폐기** · Q12 연동 작업만 새 화면 · Q13 사전 승인 결재선은 기존 설정 · Q15 직속 팀장 · **Q16 명부 모드도 본인 결재 허용** · Q17 다른 경로 위반은 표시만 · Q18 워크포스 연동 스위치(기본 꺼짐)
