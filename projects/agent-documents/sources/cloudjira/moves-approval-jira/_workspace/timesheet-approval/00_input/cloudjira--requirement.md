# timesheet-approval — 사용자×기간 타임시트 승인 (단독 모드)

> 로드맵 2번. 근거: `docs/DESIGN.md` §2.2(흐름), §3(단독 모드), §5(제한선), §8(데이터 모델·용량), §4.3(사용자×기간 단위).
> 리포 `C:\CloudJira\moves-approval-jira`. 선행: core-port 완료(2026-10-03, `_workspace/core-port/03_verify_report.md`).
> 기준선 테스트: 백엔드 26 suites / 215 tests, UI 8 suites / 58 tests 통과.

## 목표

워크포스 없이 동작하는 **타임시트 승인**. 대상 = (사용자 accountId, 기간 periodKey).
사용자가 기간을 제출 → 제출 시점 워크로그 스냅샷 확정 → 팀장(→선택적 2단계) 결재 → 승인 후 변경 감지.

## 해야 할 것 (DESIGN 인용)

1. **대상 종류 TIMESHEET** — `TargetKind.TIMESHEET`, `scopeKey = TIMESHEET:{accountId}:{periodKey}`(scopeKey.js 예약 형식 그대로, 불변식 1). 대상 어댑터 레지스트리에 `TimesheetTargetAdapter` 추가.
2. **기간 키 (순수)** — `src/domain/timesheet/`. 정책 `approvalUnit` = `MONTH`(기본) | `WEEK`. periodKey `'2026-10'` | `'2026-W40'`(ISO 주). **타임존을 인자로**(불변식 3), `now` 주입. 기간 → [시작, 끝) 경계 계산, 워크로그 started → periodKey.
3. **스냅샷·지문 (순수)** — 제출 시점 워크로그 `{id, issueId, started, timeSpentSeconds}` 묶음 → 정렬 후 결정적 contentHash. 저장은 DESIGN §8 권장안대로 **요청 행 안 압축 JSON**(별도 snapshot 테이블 없음) — 설계에서 확정.
4. **제출** — 본인 기간 워크로그 수집(asUser 로 읽을 수 있는 범위 — 수집 경로와 한계를 설계에서 확정: JQL `worklogAuthor = currentUser() AND worklogDate ...` + 이슈별 worklog 조회 등), 결재선 해석, 요청 생성. 0건 기간 제출 허용 여부는 정책값으로.
5. **결재선 해석기(단독 모드)** — 팀·팀장 = Jira 그룹 매핑 또는 앱 명부(Confluence 판 명부/승인 그룹 이식분 활용). 2단계(PM) 는 선택. 권한 축 `{teamLead:true}` 의 판정 원천을 설계에서 확정한다.
6. **팀장 화면 데이터** — 팀 × 기간 매트릭스(행 = 팀원, 상태: 미제출·제출·승인·반려·승인 후 변경), **일괄 승인(PIN 1회)**, 반려(사유). 팀장은 **자기 팀원만**(불변식 7). 형제 resolver(목록·내보내기·상세) 전부 같은 범위 함수.
7. **승인 후 변경 감지** — 트리거 `avi:jira:{created,updated,deleted}:worklog` + 누락 보정 스윕(`/rest/api/3/worklog/updated`·`/deleted` since, watermark·예산·커서). 승인된 기간 hash 불일치 → `CHANGED_AFTER_APPROVAL`(재제출 요구 + 알림). 트리거는 throw 금지, asApp 읽기 결과를 사용자에게 반환하지 않음(AGENTS.md asApp 1번).
8. **자체 제한선 (DESIGN §5 중 승인 앱 판정분)** — 일 최대·주 최대 시간, 미래 일자, 소급 N일 초과. 위반 시 정책: 경고 / 예외 승인 단계 추가(normalizeSteps 에 단계 추가, 상태 머신 무변경) / 제출 거부. `approval_violation` 테이블 또는 요청 행 JSON — 설계에서 확정.
9. **프론트** — `jira:globalPage` 안에 "내 타임시트"(기간 선택·워크로그 요약·제출·상태) + "팀 타임시트"(팀장 매트릭스·일괄 승인·반려) 탭. 업무함·상세 모달에서 TIMESHEET 대상 표시. 설정(adminPage)에 approvalUnit·타임존 기준·제한선·팀 매핑 정책.
10. **i18n** — kr/en 동시, `npm run merge`.

## core-port 에서 넘어온 권고 (함께 반영)

- **R2** 증명서 대상 이름 — 타임시트는 프로젝트가 없다. 대상 표시를 "사용자 이름 + 기간"으로 하는 방식 확정.
- **R3** `src/permission/JiraPermission.js:59-69` invocation 캐시 누락(권한 API 2회 호출) — 백엔드 회차에 수정.

## 완료 기준

- `npm run merge`, `npm test -- --runInBand`, `npm run test:ui -- --runInBand`, `npm run build:ui` 통과
- resolver 3단계 계약 테스트 통과, 신규 마이그레이션은 `vNNN_` 추가(기존 이름 변경 금지)
- 불변식 1~10 위반 없음 — 특히 1(dedupe), 3(타임존·now 주입), 7(팀장 범위), 8(asApp 한정)
- 수용 기준 문장: **"워크로그는 사전 차단되지 않는다. 승인 후 변경은 감지·재승인으로 다룬다(차단은 period-lock 기능)."**

## 범위 밖

- 기간 잠금·`jira:timeTrackingProvider`·대체 Log work 화면 → `period-lock`
- 워크포스 팀/팀장/계획 연동·서명·프로퍼티 게시 → `workforce-link`
- 워크로그 자동 되돌리기(asApp 쓰기)
- 휴가 승인

## 기본 가정 (제품 결정 미회신 — 답이 오면 바뀜)

- 기본 단위 월(확정, CLAUDE.md 2026-10-03). 반려 흐름: 반려 → 사용자가 수정 후 재제출(새 요청). 편집 차단 수준: 이번 기능은 감지만.
