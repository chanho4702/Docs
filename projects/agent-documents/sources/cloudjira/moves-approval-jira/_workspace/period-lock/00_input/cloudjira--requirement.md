# period-lock — 기간 잠금 (시간 추적 제공자 + 대체 Log work + 기간 마감)

> 로드맵 3번. 근거: `docs/DESIGN.md` §2.0(입력 통제 3층), §2 표 ②행, §2.2 마지막 줄(`period_close`), §5 "마감 후 변경", §7(모듈), §8(`approval_period_close`).
> CLAUDE.md 확정 결정(2026-10-03): **"기간 잠금 — `jira:timeTrackingProvider` 로 Jira 기본 Log work 를 우리 화면으로 대체 + 나머지 경로는 감지·재승인"**.
> 리포 `C:\CloudJira\moves-approval-jira`. 선행: core-port·timesheet-approval 완료(2026-10-03, 각 `03_verify_report.md`).
> 기준선 테스트: 백엔드 39 suites / 414 tests, UI 12 suites / 86 tests 통과.

## 목표

DESIGN §2.0 의 2층("언제 쓰나")을 만든다. 관리자가 우리 앱을 시간 추적 제공자로 고르면 Jira 기본 "Log work" 버튼·작업 로그 탭이 숨겨지고,
사용자는 **우리 화면**으로 워크로그를 입력·수정·삭제한다. 우리 화면은 **잠긴 기간**(마감됨 또는 승인됨/제출됨 — 설계에서 확정)의 입력을 거부한다.
우리 화면을 거치지 않은 변경(REST·자동화·모바일·가져오기, 또는 제공자 미선택 사이트)은 3층(timesheet-approval 의 감지·재승인)이 받는다.

## 해야 할 것

1. **잠금 판정 (순수)** — `src/domain/timesheet/` 에 "이 accountId 의 이 started 시각 워크로그를 지금 쓸 수 있나" 판정 함수. 입력: 워크로그 started(+이전 started — 수정으로 기간을 옮기는 경우 양쪽 기간 모두), 타임존, now, 마감 목록, 해당 기간의 타임시트 상태. 출력: `{allowed, reasonCode}`. `Date.now()` 금지(불변식 3). 기간 키는 timesheet-approval 의 `period.js` 재사용.
2. **기간 마감(`period_close`)** — 관리자(또는 설계가 정한 권한 축)가 기간을 마감/재개방. DESIGN §8 `approval_period_close (scope, period_key, closed_at, closed_by)`. scope 는 사이트 전체 / 팀 / 프로젝트 중 무엇을 지원할지 설계에서 확정(기본 가정: 사이트 전체만). 자동 마감(기간 종료 후 N일, 정책값) 여부도 설계에서 — 스윕 재사용. 마감·재개방은 감사 이벤트(결정적 id) 기록. 신규 테이블은 `vNNN_` 마이그레이션 추가(v022~), `isTableReady()` 프로브.
3. **마감 후 변경 감지** — DESIGN §5 "마감 후 변경 → 플래그 + 재승인". timesheet-approval 의 `TimesheetDriftService`·`CHANGED_AFTER_APPROVAL`·`ExpiryReason.CONTENT_CHANGED` 를 재사용·확장해서, 마감된 기간에 우리 화면 밖에서 생긴 변경을 플래그·알림한다. 미제출 기간이 마감 후 바뀐 경우의 상태를 설계에서 정한다.
4. **시간 추적 제공자 모듈** — manifest `jira:timeTrackingProvider`(Preview). 대체 UI 는 `jira:issueAction`(Log work 진입) + `jira:issueActivity`(작업 로그 탭) — 정확한 모듈 키·필수 속성·display condition(`timeTrackingProviderEnabled`)은 공식 문서 기준으로 설계하고, 확인 못 한 것은 `미검증`. 엔트리 추가는 3곳(craco ENTRIES, `static/ui/public/<key>.html`, manifest `resources[].entry`).
5. **워크로그 CRUD resolver (asUser)** — 이슈별 내 워크로그 목록, 생성·수정·삭제. **모두 `asUser()`**(불변식 8 — 작성자가 본인으로 남아야 한다). 쓰기 전에 서버가 1번 잠금 판정을 다시 한다(프론트 판정은 표시용). 권한 축은 `{issue:'view'|'edit', issueIdKey}` 중 설계가 고르고, Jira 자체의 "Work on work items"·"Edit own worklogs" 판정은 Jira REST 응답(403)을 코드로 매핑한다. 남의 워크로그 수정·삭제(Edit all worklogs 권한자)를 지원할지 설계에서 — 기본 가정: 본인 것만.
   - 우리 화면으로 쓴 워크로그도 트리거(`avi:jira:*:worklog`)가 다시 본다. 잠기지 않은 기간의 정상 쓰기가 drift 로 잘못 플래그되지 않아야 한다(제출 전 기간은 원래 drift 대상이 아님 — 확인).
   - 남은 시간 추정(remaining estimate) 조정 옵션(`adjustEstimate`) 지원 범위는 설계에서. 기본 가정: Jira 기본값(auto)만.
6. **프론트** — 이슈 화면 Log work 대화상자(시간·시작일시·설명), 작업 로그 탭(목록·수정·삭제, 잠긴 기간 항목은 잠금 배지·버튼 비활성 + 사유), 관리자 설정(adminPage)에 기간 마감 관리(목록·마감·재개방·자동 마감 정책)와 **제공자 선택 안내**(Jira 관리 > 시간 추적에서 우리 앱 선택, Tempo 와 공존 불가 고지, 미선택 시 2층이 없다는 고지). 업무함 "내 타임시트"에 마감 상태 표시.
7. **i18n** — kr/en 동시, `npm run merge`. 서버는 문구를 만들지 않는다(에러 코드·`{templateKey, vars}`).

## 재사용 기반 (timesheet-approval 산출물)

- 기간 키·경계(`src/domain/timesheet/period.js` 등), 정책 `approvalUnit`·`timesheetTimezone`
- `TimesheetDriftService`, `CHANGED_AFTER_APPROVAL`(부속 행의 기간 상태, APPROVED 유지), `ExpiryReason.CONTENT_CHANGED`
- 워크로그 트리거·누락 보정 스윕(watermark·예산·커서, F1 수정분), `WorklogCollector`
- 팀 범위 `TeamScope`·`TimesheetAccess`(팀장 판정 원천 `timesheet_team_member` role LEAD)
- 설계서: `_workspace/timesheet-approval/01_architect_design.md`, 실제 shape: `02_backend_report.md`, 검증: `03_verify_report.md`

## 완료 기준

- `npm run merge`, `npm test -- --runInBand`, `npm run test:ui -- --runInBand`, `npm run build:ui` 통과
- resolver 3단계 계약 테스트 통과, 신규 마이그레이션은 v022 부터 추가(기존 이름 변경 금지)
- 불변식 1~10 위반 없음 — 특히 3(now·타임존 주입), 7(형제 resolver 범위), 8(워크로그 쓰기는 asUser), 9(엔티티 프로퍼티로 잠금 판정 금지)
- 수용 기준 문장(화면·문서에 그대로): **"기간 잠금은 이 앱이 시간 추적 제공자로 선택된 사이트의 Jira 화면 입력만 막는다. REST·자동화·모바일 등 다른 경로의 변경은 감지해 다시 승인받는다."** (문구는 설계에서 다듬되 의미 유지)

## 범위 밖

- 워크포스 쪽 워크로그 입력 화면의 잠금 연동 → `workforce-link`
- 워크로그 자동 되돌리기(asApp 쓰기)
- 권한 스킴(1층) 자동 변경 — 고객 관리자 작업, 가이드 문구만
- 이슈 전환 승인 → `transition-approval`

## 기본 가정 (제품 결정 미회신 — 답이 오면 바뀜. QUESTIONS Q16~ 로 올린다)

- 잠금 대상 기간: 마감된 기간 + 제출(PENDING)·승인(APPROVED)된 본인 기간. 반려·만료 기간은 열림.
- 마감 scope: 사이트 전체만. 자동 마감: 끔(정책값으로 기간 종료 후 N일 켤 수 있게).
- 재개방 권한: 앱 관리자(`{admin:true}`). 재개방 시 그 기간 승인 상태는 유지.
- 남의 워크로그 편집: 지원 안 함(본인 것만). `adjustEstimate`: auto 만.
