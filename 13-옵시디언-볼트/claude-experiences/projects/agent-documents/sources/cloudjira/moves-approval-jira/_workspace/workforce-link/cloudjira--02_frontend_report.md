# workforce-link 프론트 보고서 (Phase 4)

> 작성: frontend-engineer · 2026-10-03 · autopilot 무인 회차
> 입력: `02_backend_report.md`(실제 shape — §7 차이는 구현 우선), `01_architect_design.md` §7·§8·§11.2, `00_input/requirement.md`.
> forge·git 명령 실행 없음. `src/`·`manifest.yml` 무변경. 신규 엔트리 없음(엔트리 3곳 변경 없음).

## 결과 요약

| 명령 | 결과 |
|---|---|
| `npm run merge` | exit 0 — `ko-KR.json`·`en-US.json` 생성, kr/en 키 집합 차이 0 |
| `npm run test:ui -- --runInBand` | **20 suites / 160 tests 통과** (기준선 17 / 140 + 신규 3 suites / 20 tests) |
| `npm run build:ui` | exit 0, `Compiled with warnings` — 전부 node_modules(기준선과 같은 3건: @atlaskit source map ENOENT 2, @atlaskit/react-select postcss-calc 1). 우리 소스 ESLint 경고 0 |
| `npm test -- --runInBand`(백엔드, 무변경 확인) | **55 suites / 709 tests 통과** |

## 1. 변경 파일

| 구분 | 경로 |
|---|---|
| 신규 화면 | `static/ui/src/features/settings/WorkforceLinkSettings.jsx` |
| 신규 순수 | `static/ui/src/features/settings/workforceLinkModel.js` |
| 신규 컴포넌트 | `static/ui/src/features/timesheet/RoutingSourceBadge.jsx` |
| 변경 | `features/settings/SettingsPage.jsx`(탭 `workforce` — 셸 nav·패널 Tabs 두 목록 모두), `utils/queryKey/approvalKeys.js`(`settingsKeys.workforceLink()`), `features/timesheet/timesheetFormat.js`(`violationText` 워크포스 5종, `extraStepNoticeKey`, `submitDoneKey`, `teamLabel`), `features/timesheet/MyTimesheetPage.jsx`(원천 배지·PM 예외 안내·완료 문구), `features/timesheet/SubmitBar.jsx`(빈 팀 이름 대체), `features/timesheet/TimesheetSnapshotSection.jsx`(제출 당시 원천·예외 단계), `features/timesheet/TeamTimesheetPage.jsx`(팀 선택기·팀 열 출처 표시) |
| 테스트 신규 | `features/settings/__test__/WorkforceLinkSettings.test.jsx`(7), `features/settings/__test__/workforceLinkModel.test.js`(9 — i18n 계약 포함), `features/timesheet/__test__/WorkforceTimesheet.test.jsx`(4) |
| 테스트 수정 | `features/timesheet/__test__/RejectAndSnapshot.test.jsx` — `@atlaskit/lozenge` 목 1줄 추가(상세 스냅샷이 배지를 그리게 되면서 primitives 목과 실물 Lozenge 가 충돌) |
| i18n | `locales/{kr,en}/workforce.json`(신규 ns), `locales/{kr,en}/timesheet.json`, `locales/{kr,en}/error.json`, `locales/{kr,en}/policy.json` |

## 2. 소비한 resolver·필드 (전부 `invokeApproval` 경유 — `content` 를 벗긴 값)

| resolver | 화면 | 읽는 필드 |
|---|---|---|
| `getWorkforceLinkStatus({})` | 설정 > 워크포스 연동 | `storageReady`, `crypto.{available,selfTest}`, `signing.{configured,kid,publicKeyFingerprint,inKeyring}`, `trustedPeerKids`, `cloudIdKnown`, `publish.{pending,failed,stalled,published,lastPublishedAt,lastError.{code,at},state}`, `inbound.{org,pm}.{verified,invalid,lastVerifiedAt}`, `inbound.check.lastSeenAt`, `recentFailures[].{direction,typ,entityId,code,count,lastAt}` (`enabled` 는 쓰지 않고 정책값으로 토글 — 아래 §4-4) |
| `republishWorkforceLink({scope})` | 〃 [실패분 재게시]·[전체 재게시] | `scope`, `resetCount`(FAILED 문구) |
| `getApprovalSettings` / `saveApprovalSettings({workforceLinkEnabled})` | 〃 토글 | `workforceLinkEnabled`(없으면 켬으로 봄 — 백엔드 `!== false` 와 같은 규칙). patch 는 이 키 하나만 |
| `resolveUsers({accountIds})` | 〃 최근 실패 표 | `items[].{accountId,displayName,avatarUrl}` |
| `getMyTimesheet` | 내 타임시트 | `routing.source`(배지), `routing.teamName`(빈 문자열 대체), `routing.extraStepSource`(제출 전 안내), `violations[]`(워크포스 5종 + `rawCode`) |
| `submitTimesheet` | 내 타임시트 완료 문구 | `extraStepSource` 우선, 없으면 기존 `extraStepAdded` |
| `getTimesheetDetail` | 상세 모달 스냅샷 | `routingSource`, `extraStepSource`(null 이면 미표시), `violations[]` |
| `getTeamTimesheetMatrix` | 팀 타임시트 | `teams[].{teamKey,displayName,source}` — `wf:` teamKey 는 파싱 없이 그대로 다시 보낸다 |

쿼리키: `settingsKeys.workforceLink()` 신설. 재게시 성공 → `workforceLink()`·`audit()` 무효화. 토글 저장 → `policy()` setQueryData + `workforceLink()`·`audit()` 무효화. 타임시트는 기존 `timesheetKeys` 그대로.
에러 분기: 전부 `error.code` → `error.<code>` 문구. 재게시는 `WORKFORCE_LINK_DISABLED` → `workforce.enabled.offHint`(토글 안내), `WORKFORCE_SIGNING_UNAVAILABLE` → `workforce.signing.unavailableHint`(상태 카드 안내)를 덧붙인다. 그 밖(`INVALID_TARGET`·`STORAGE_NOT_READY`)은 에러 문구만.

## 3. 화면 동작

- **설정 > 워크포스 연동**: 제목 + 수용 문장 → 연동 토글(+ 도움말) → `storageReady:false` 면 안내 → 연동 상태(서명 기능 / 서명 키 kid·지문 / **`inKeyring:false` 면 경고 SectionMessage** / 신뢰 kid / 사이트 정보) → 게시(상태 Lozenge, 게시됨·대기·실패·반복 실패, 마지막 게시·마지막 오류) → 재게시 버튼 2개(실패분은 `publish.failed===0` 이면 비활성) → 수신 검증(org·pm 검증/실패/마지막 검증, check 마지막 확인) → 최근 실패 표(`CommonTable`).
  - 최근 실패 대상: `rms.org` = accountId → 이름·아바타(`PersonAvatar`), `approval.timesheet` = `accountId/movesApproval.YYYY` → 이름 + 키, `*/…` → "전체 사용자 · 키", 그 밖(pm·check)은 원문.
  - 모르는 코드는 `workforce.code.UNKNOWN`, 모르는 typ 는 원문, 모르는 게시 상태는 UNKNOWN 문구로 떨어진다(화면이 깨지지 않음).
  - 재게시 결과는 SectionMessage(기존 설정 화면 관례 — 토스트 대신): FAILED = "실패한 N건을 다시 시도…", ALL = 예약 문구.
- **내 타임시트**: `routing.source==='WORKFORCE'` → 제목 줄에 "워크포스 팀" 배지. `routing.extraStepSource` 가 `WORKFORCE_PM`·`GROUP_AND_PM` 이면 위반 목록 아래 안내(제출 성공 후엔 내림). `GROUP` 은 기존 위반 제목("예외 승인 단계가 추가됩니다")이 이미 말하므로 추가 안내 없음(설계 §8.2). 결재 문구의 팀 이름이 빈 문자열이면 "워크포스 팀".
- **제출 완료**: `submitDoneKey` — PM 포함 원천이면 `timesheet.submit.doneExtra.<source>`, 아니면 기존 `doneExtraStep`/`done`(옛 응답 호환).
- **위반 문구**: `OVER_PLAN`·`OUT_OF_PERIOD`·`NOT_MEMBER`·`CHECK_MISSING` = `{date}: …(워크포스)`. `WORKFORCE_OTHER` 는 `rawCode` 가 문자열이면 `({rawCode})` 보간, **`null` 이면 `WORKFORCE_OTHER_NO_CODE`(코드 없는 문구)** — `{rawCode}` 자리표시나 "null" 이 화면에 새지 않음을 테스트로 단언.
- **상세 스냅샷**: `routingSource==='WORKFORCE'` 배지, PM 원천 안내. v024 이전 제출(null)은 아무것도 그리지 않는다.
- **팀 매트릭스**: 팀 선택기·팀 열 = `teamLabel` — 워크포스 팀은 `이름 · 워크포스`, 이름이 비면 "워크포스 팀". teamKey 는 그대로 payload 로.
- `workforce.checks` 는 사용자 화면에 표시하지 않는다(설계 §7 — 관리자 화면에서만 의미). `getTimesheetContext.myTeam/ledTeams.source` 는 현재 화면이 소비하지 않는다(기존에도 이 필드를 쓰는 화면 없음).

## 4. 백엔드 shape·설계와의 차이 (프론트 쪽 해석)

1. 설계 §8 의 자리표시는 `{{count}}` 였으나 리포 `tFormat` 은 **단일 중괄호 `{count}`** — 기존 관례대로 바꿨다. 위반 문구도 기존 형식(`{date}: …`)에 맞췄다.
2. `submitTimesheet.extraStepAdded` 가 PM 만 붙어도 true(백엔드 §7-1) → 완료 문구는 `extraStepSource` 를 먼저 본다. GROUP 이면 기존 문구 그대로.
3. `WORKFORCE_OTHER.rawCode: null`(백엔드 §7-3) → 코드 없는 별도 키 `timesheet.violation.WORKFORCE_OTHER_NO_CODE` 추가(설계에 없던 키).
4. 토글 상태는 `getWorkforceLinkStatus.enabled` 가 아니라 정책(`getApprovalSettings.workforceLinkEnabled`)에서 읽는다 — 저장 직후 `setQueryData` 로 즉시 반영되고 정책 화면 규약(설정값 원천 = 정책 조회)과 같다. 두 값은 같은 규칙(`!== false`)이라 어긋나지 않는다.
5. 워크포스 팀 `displayName`/`teamName` 이 `''` 일 수 있음(백엔드 §2.4) → 출처 이름으로 대체.
6. 설계 §8.1 에 없던 키 추가: `workforce.enabled.offHint`, `workforce.status.title`, `workforce.crypto.label`, `workforce.signing.{label,configured,inKeyring,unavailableHint}`, `workforce.trustedPeers.*`, `workforce.storage.notReady`, `workforce.cloudId.{label,known}`, `workforce.publish.state.label`, `workforce.inbound.{lastVerifiedAt,lastSeenAt}`, `workforce.never`, `workforce.failures.column.*`, `workforce.failures.allUsers`, `workforce.typ.approval.worklog`, `workforce.code.WRITE_DENIED`, `workforce.republish.doneFailed`, `timesheet.submit.doneExtra.{WORKFORCE_PM,GROUP_AND_PM}`, `policy.settings.tab.workforce`.
7. 백엔드 요청: **없음**(화면 요구를 전부 현재 shape 로 채웠다).

## 5. 추가한 i18n 키 (kr/en 동시)

- `workforce.json`(신규): 설계 §8.1 전 키 + §4-6 의 추가 키.
- `timesheet.json`: `violation.{OVER_PLAN,OUT_OF_PERIOD,NOT_MEMBER,WORKFORCE_OTHER,WORKFORCE_OTHER_NO_CODE,CHECK_MISSING}`, `routing.source.{WORKFORCE,ROSTER}`, `routing.extraStep.{WORKFORCE_PM,GROUP_AND_PM,pmStepName}`, `submit.doneExtra.{WORKFORCE_PM,GROUP_AND_PM}`.
- `error.json`: `WORKFORCE_LINK_DISABLED`, `WORKFORCE_SIGNING_UNAVAILABLE`(`ErrorCodes` 값과 일치).
- `policy.json`: `audit.area.workforceLink`, `audit.action.republish`, `settings.tab.workforce`.
- `workforceLinkModel.test.js` 의 "i18n 계약" 테스트가 화면이 고르는 키(코드 18·상태 7·typ 5·안내 2·에러 2·위반 6·원천·탭·감사)가 kr/en 양쪽 소스 JSON 에 있는지 대조한다.

## 6. 테스트

| 스위트 | 수 | 다루는 것 |
|---|---|---|
| `WorkforceLinkSettings.test.jsx` | 7 | `inKeyring:false` 경고·kid·지문·상태·수용 문장 / 최근 실패 이름 해석(`resolveUsers` 정렬 id)·전체 사용자·원문·UNKNOWN / 미준비·키 없음·서명 불가·cloudId 모름이 에러가 아닌 상태로 표시, 실패 0건이면 실패분 버튼 비활성 / FAILED 재게시 payload·resetCount 문구·상태 재조회 / 에러 2종 + 그 밖 코드 분기 / 토글이 `{workforceLinkEnabled:false}` 만 보내고 상태 재조회 / 정책 키 없으면 켬 |
| `workforceLinkModel.test.js` | 9 | 대상 해석·accountId 수집·모르는 코드 대체·재게시 문구·서명 가능 판정·**i18n 계약** / 워크포스 위반 문구(rawCode null)·예외 단계 키·완료 문구 키·팀 이름 |
| `WorkforceTimesheet.test.jsx` | 4 | 내 타임시트 배지·PM 안내·빈 팀 이름·위반 문구 / 명부·GROUP 이면 배지·안내 없음 / 제출 결과 `GROUP_AND_PM` 완료 문구 / 상세 스냅샷 원천 표시·null 미표시 |

## 미검증

`04_spike_todo.md` 에 **W22~W26** 으로 추가했다.

| # | 요약 |
|---|---|
| W22 | 새 탭이 adminPage 셸 nav·업무함 설정 패널 두 곳에 뜨는지, 비관리자 `PERMISSION_DENIED` 표시 |
| W23 | 최근 실패 accountId 이름 해석(`resolveUsers`)이 관리자 iframe 에서 되는지 |
| W24 | 실제 워크포스 팀 이름이 빈 문자열로 오는 경우의 표시 |
| W25 | 제출 후 상세 `routingSource`·`extraStepSource` 가 실제로 채워져 배지가 보이는지(W17 의 화면 확인) |
| W26 | `getWorkforceLinkStatus` 탭 진입 응답 시간(운영 크기) |

## 열린 질문

| # | 질문 | 선택지 | 현재 구현(권장) |
|---|---|---|---|
| F1 | 재게시 버튼을 연동 꺼짐·서명 불가 상태에서 미리 막을까 | (a) 실패분만 `failed===0` 일 때 비활성, 나머지는 서버 에러 코드로 안내 (b) `publish.state!=='OK'` 면 둘 다 비활성 | **(a)** — 판정 원천을 서버 하나로 두고, 에러 시 어디를 고칠지(토글/상태 카드) 안내한다 |
| F2 | 워크포스 위반의 출처 표시 방식 | (a) 문구 접미 "(워크포스)" (b) 별도 Lozenge 태그 | **(a)** — `ViolationList` 구조를 바꾸지 않고, 엑셀·알림 등 문자열 경로에서도 출처가 남는다 |
| F3 | 팀 매트릭스 엑셀의 팀 열에 "· 워크포스" 접미 | (a) 화면과 같게 포함 (b) 이름만 | **(a)** — 화면과 내보내기가 같은 `teamNames` 맵을 쓴다. 고객 정산 양식과 충돌하면 (b) |
| F4 | 사용자 화면에 `workforce.checks`(점검 검증 상태) 표시 | 표시 안 함 / VERIFIED·PARTIAL 만 표시 | **표시 안 함**(설계 §7). 사용자가 할 수 있는 조치가 없다 |

## 재작업 회차

| 회차 | 날짜 | 내용 |
|---|---|---|
| 1 | 2026-10-03 | 초판 |
