# 02 프론트 보고서 — worklog-certification-model

작성: 2026-10-10 · frontend-engineer · 입력 `01_architect_design.md`(§7·§8·§11) + `02_backend_report.md`(응답 shape 기준)
회차: 1회차(최초 구현). `src/` 는 읽기만 했다(동시 작업 중인 감사 백엔드와 충돌 없음).

## 결과 요약

| 항목 | 결과 |
|---|---|
| `npm run merge` | 통과 — `ko-KR.json`·`en-US.json` 생성(두 언어 키 집합 일치) |
| `npm run test:ui -- --runInBand` | **52 suites / 440 tests 전부 통과** (신규 2 suites: `certPure.test.js`·`TeamCertification.test.jsx`, 기존 3개 갱신) |
| `npm run build:ui` | **통과** (Compiled with warnings — node_modules 소스맵·react-select CSS 경고만, 기존과 동일. 1회차에서 `react-hooks/exhaustive-deps` 규칙 미정의로 실패 → 해당 eslint-disable 주석 제거 후 통과) |
| 엔트리 3곳(craco ENTRIES·public html·manifest) | **무변경** |
| 커밋·배포 | 하지 않음 |
| 에러 코드 ↔ `error.json` | `ErrorCodes` 전체 값이 kr/en 양쪽에 있음(node 로 대조, 누락 0) |

## 1. 소비하는 resolver 와 접근 경로

`invokeApproval` 이 `content` 를 벗겨 주므로 모두 1단 접근이다.

| resolver | 소비 위치 | 쓰는 필드 |
|---|---|---|
| `getCertificationMatrix` | `worklogCert/TeamCertificationPage` → `CertMatrixTable` | `periodKey·period·timeZone·unit·teams[]·coverage.mirror·rows[](accountId, displayName, avatarUrl, teamKey, certifiedSeconds, certifiedCount, claimedCount, uncertifiedCount, mismatchCount, deletedCount, selfCertifiedCount, lastCertifiedAt)·summary{total,fullyCertified,withMismatch,withUncertified}` |
| `listMemberCertifications` | `MemberCertificationPanel` → `CertificationListView` | `displayName·periodKey·timeZone·unit·deletedHandling·thresholds·items[]·deleted[]·hiddenCount·setDigest·totals·history{enabled,truncated}` |
| `listOwnCertifications` | `OwnCertificationPanel` → `CertificationListView` | 위와 같음 + `selfCert{eligible,reason}` |
| `certifyWorklogs` | `CertifyBar` → `certifyRunner` | 요청 `{accountId, periodKey, mode, batchKey, setDigest?(MONTH만), items:[{worklogId, fp:=row.currentFp, lastSeq:=row.summary.lastSeq}], pin?}` / 응답 `results[]·remaining[]·monthTotals` |
| `certifyOwnWorklogs` | 같은 `CertifyBar` (fnName 만 다름) | 요청에 `accountId` 를 **싣지 않는다** |
| `getTimesheetContext` | `InboxPage`(기존 쿼리 재사용) | `isTeamLead`(탭 노출) · `certification.selfCertEligible`("내 워크로그" 탭) |
| `getMyTimesheet` | `MyTimesheetPage` → `MyCertificationSummary` | `certification{certifiedSeconds, counts, byWorklog}` + 기존 `live.entries`·`live.issues` |
| `getIssueWorklogs` | `WorklogTab` | `worklogs[].certification{state, selfCertified}` (null 이면 배지 없음) |
| `getTimesheetWorklogHistory` | `TimesheetHistorySection` → `WorklogSummaryTable mode="review"` | `worklogs[](worklogId, issueId, issue, submitted, summary, certification)` |
| `getWorkforceLinkStatus` | `WorkforceLinkSettings` 의 `CertPublishRow` | `certPublish{state, pending, failed, published, lastPublishedAt}` |
| `getApprovalSettings`/`saveApprovalSettings` | `settings/WorklogCertSettings` | 5키만 patch(`certificationUnit·deletedCertifiedHandling·certSignalLateDays·certSignalNearCloseHours·certSignalGrowthPercent`) |
| `getMyPinStatus` | `CertifyBar` | `required` |
| `getWorklogHistory` | `WorklogSummaryTable` 펼침(기존 `WorklogHistoryPanel` 재사용) | 기존 |

## 2. 화면

| 파일 | 내용 |
|---|---|
| `static/ui/src/features/worklogCert/TeamCertificationPage.jsx` | 업무함 view `teamCertification`(lazy, `importWithReloadOnce`). 월 PeriodPicker(주 키 URL 은 버림) · 팀 선택 · 요약 · coverage 안내 · 매트릭스 · 펼침 한 명. 탭 "팀원/내 워크로그"는 `selfCertEligible` 일 때만 렌더 |
| `CertMatrixTable.jsx` | CommonTable. 행 클릭/Enter = 펼침. `coverage.mirror=false` 면 기록·미인증 칸 "—"+툴팁 |
| `MemberCertificationPanel.jsx` / `OwnCertificationPanel.jsx` | 쿼리·무효화 담당. 본문은 공용 `CertificationListView` |
| `CertificationListView.jsx` | 합계(기록 vs 인증) · 이력 꺼짐/잘림 안내 · CertifyBar · 필터 · 판단 요약 표 · 숨김 N건 · 인증 후 삭제 표 |
| `WorklogSummaryTable.jsx` | **공용**(certify/review). 이슈 · 작업일(정책 TZ) · 처음→현재/제출(`firstIsBaseline` 이면 `*`+툴팁) · 수정 N회 · 인증값 · 상태 · 신호 · 이력 펼침 |
| `CertifyBar.jsx` | ENTRY = 체크 선택 인증, MONTH = "이 달 전체 인증(N건)"(필터 무관 certifiable 전부 + setDigest). 인라인 확인(건수·시간·신호·승격 건수) + PIN 1회 → 실행기. 결과 요약·건별 실패 문구·"다음 일일 동기화" 안내 |
| `certifyRunner.js` | CHUNK 100 순차, `remaining` 이어 보내기(같은 PIN), **호출마다 새 batchKey**, code 없는 에러(브리지·네트워크)만 같은 키로 1회 재시도, 진전 없으면 중단, 묶음 에러는 `partial` 달고 throw — `decideTimesheets` 실행기와 같은 계약 |
| `CertStateBadge.jsx`·`SignalBadges.jsx`·`CertFilterBar.jsx`·`certFormat.js` | 본인 서명은 모든 화면에서 "인증됨(본인)"+툴팁. 신호 툴팁에 정책 기준값 |
| `MyCertificationSummary.jsx` | 내 타임시트 "인증 현황" — 배지만(인증 버튼 없음). 인증 시간·건수 + live 항목별 배지 표 |
| `features/worklog/WorklogTab.jsx` | 상태 칸에 `CertStateBadge`. 옛 "사후 인증" 버튼·패널 호출 제거 |
| `features/worklog/WorklogCertificationPanel.jsx` | 읽기 전용(결재선 선택·요청 버튼·`createWorklogCertification` 호출 제거). ApprovalDetail 의 옛 요청 표시용 |
| `features/worklogHistory/TimesheetHistorySection.jsx` | `data.worklogs` 가 있으면 `WorklogSummaryTable mode="review"` 를 사건 목록 위에 |
| `features/settings/WorklogCertSettings.jsx` | 설정 > 타임시트에 섹션 추가(정책 폼 다음). 단위·삭제 처리·신호 기준 3 |
| `features/settings/WorkforceLinkSettings.jsx` | 게시 카드에 "인증 시간 게시" 줄. `NOT_LINKED` = "연결 대기" + 안내, 항상 "다음 일일 동기화" 문구 |
| `features/inbox/InboxPage.jsx`·`inboxUrl.js` | `CERT_VIEWS=['teamCertification']`, 아이콘 `status-verified`, 팀장만(`TEAM_LEAD_TABS`), 새로 고침 시 `worklogCertKeys.all` 무효화, `parseCertSearch` |

## 3. 쿼리키·무효화

`utils/queryKey/approvalKeys.js` 에 `worklogCertKeys{all, matrix(teamKey, periodKey), member(accountId, periodKey), own(periodKey)}` (설계 §7.3 그대로).
- 인증 성공(부분 성공 포함) → `worklogCertKeys.all` + `timesheetKeys.all`.
- `WORKLOG_CERT_UNIT_MISMATCH` → 같은 두 키(새 단위로 다시 그림).
- `WORKLOG_CERT_SELF_DENIED`(본인 경로) → `timesheetKeys.context()`(탭 재판정) + `worklogCertKeys.all`.
- 설정 저장 → `settingsKeys.policy()` setQueryData + `worklogCertKeys.all` + `timesheetKeys.all`.
- `WorklogTab` 의 `worklogCertificationKeys.all` 무효화는 패널 호출이 없어져 제거.

## 4. 추가 i18n 키

- 신규 namespace `locales/{kr,en}/worklogCert.json` — 설계 §8 표 전부 + 화면에 필요한 가산 키:
  `title·empty·deleted·legacyNotice`, `matrix.summary`, `member.historyOff·historyTruncated·deletedTitle·deletedZero`, `filter.label`, `signalHint.*`(7), `action.certify·selectHint·history`, `confirm.upgrade`, `result.syncNote`, `mine.certifiedTime`, `settings.description·signals`, `workforce.notLinkedLabel·dailySync`.
- 설계 키 구조 변경(leaf ↔ 객체 충돌 회피): `settings.unit` → `settings.unit.label`, `settings.deleted` → `settings.deleted.label`.
- `locales/{kr,en}/error.json` 신규 8개: `WORKLOG_CERT_STALE·DELETED·OUT_OF_PERIOD·SUBJECT_MISMATCH·SELF_DENIED·UNIT_MISMATCH·BATCH_CONFLICT·CONFLICT`.
- `UPPER_LEAD_UNKNOWN`·`UPPER_LEAD_EXISTS`·`NOT_TEAM_LEAD` 는 에러 코드가 아니라 `SELF_DENIED.cause.reason`/`selfCert.reason` 이라 `worklogCert.own.denied.*` 로 번역. `TEAM_LEAD_AXIS`(팀장 경로)는 일반 `error.WORKLOG_CERT_SELF_DENIED`.
- 반영 지연 문구는 모두 "다음 일일 동기화"(`result.syncNote`·`workforce.dailySync`).
- 옛 `worklogCertification.json` 은 삭제하지 않음(설계 §8 마지막 줄).

## 5. 설계와 다른 점

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| F1 | 하위 탭 URL `tab=team\|own` | **`cert=own`**(없으면 팀원) | `tab` 은 이미 업무함 view 파라미터다. 같은 이름을 쓰면 view 가 바뀐다 |
| F2 | 확인 대화상자 | 인라인 확인 박스(모달 아님) | 업무함은 전체 페이지 iframe — 모달 높이 되먹임 함정을 피하고 BulkDecideBar 와 같은 흐름 |
| F3 | 매트릭스 "확인(승격)" 버튼 | 펼침 목록에서 승격 대상(본인 서명 CERTIFIED + `certifiable`)을 일반 인증과 같이 선택·전체 인증, 확인 단계에 승격 건수, 결과에 `upgraded` 건수 | 서버가 `certifiable` 로 이미 승격 가능 여부를 준다. 별도 버튼은 같은 호출의 중복 진입점 |
| F4 | 내 타임시트 "항목 표에 배지" | 기존 표는 이슈별 합계라 건별 배지를 붙일 수 없어 `live.entries` 로 **건별 인증 표**를 따로 그림 | 응답에 `live.entries`(worklogId·issueId·started·seconds)가 있다 |
| F5 | i18n `settings.unit`/`settings.deleted` 가 leaf 이면서 하위 키 보유 | `.label` 로 분리 | merge 의 중첩 구조에서 같은 경로가 문자열·객체를 겸할 수 없다 |
| F6 | `workforce.selfSeconds` | 키만 추가, 화면 미사용 | 백엔드 `certPublish` 에 본인 서명 초가 없다(아래 백엔드 요청 B2) |

## 6. 백엔드 요청(임의 가공하지 않은 것)

| # | 내용 |
|---|---|
| B1 | `listMemberCertifications.totals` 에 `certifiedCount` 가 없다 — 화면은 `items` 중 `state==='CERTIFIED'` 건수로 센다(인증 후 삭제·숨김 건은 빠짐). 정확한 수를 원하면 가산 필드 필요 |
| B2 | 설계 §8 `workforce.selfSeconds`(본인 서명분 초)를 그릴 원천이 `getWorkforceLinkStatus.certPublish` 에 없다. 필요하면 가산 |
| B3 | `certPublish.state` 가 `PublishState.*` 중 프론트 `PUBLISH_STATES` 밖 값이면 공용 "알 수 없음" 문구로 보인다. 현재 알려진 값 외에 `NOT_LINKED` 만 따로 처리 |
| B4 | 매트릭스에 `claimedSeconds` 가 오지만 설계 칸에 없어 쓰지 않았다(필요하면 "기록 시간" 칸 추가 가능) |

## 7. 테스트 변경

- 신규 `features/worklogCert/__test__/certPure.test.js` — 실행기(CHUNK·새 키·같은 PIN·remaining·code 없는 에러만 같은 키 재시도·partial·진전 없음 중단), certFormat(지문/lastSeq 되돌림·필터·본인 서명 문구·사유 키·uuid v4 폴백), inboxUrl(`teamCertification`·`cert=own`).
- 신규 `TeamCertification.test.jsx` — 매트릭스→펼침→월 인증(PIN·setDigest·certifiable 만), 건별 선택 인증·STALE 문구, own 탭 본인 resolver(accountId 없음), `eligible=false` 사유·버튼 숨김, `selfCertEligible=false` 면 own 무시, 주 키 버림, `MyCertificationSummary` 배지.
- 갱신 `worklog/__test__/WorklogTab.test.jsx` — 옛 "선택한 원본만 조회" 테스트를 "배지만, 옛 버튼·조회 없음"으로 교체.
- 갱신 `transition/TransitionApplyCertification.test.jsx` — 옛 요청 테스트를 "stale canRequest 여도 읽기 전용"으로 교체.
- 갱신 `worklogHistory/__test__/WorklogHistoryList.test.jsx` — CommonTable 목(empty-state·dynamic-table·checkbox) 추가 + review 요약 표 테스트.
- 갱신 `timesheet/__test__/RejectAndSnapshot.test.jsx` — `WorklogSummaryTable` 목 1줄(이 테스트는 스냅샷 섹션이 대상).

## 8. 실행 출력

```
npm run merge      → locales\ko-KR.json 생성 / locales\en-US.json 생성
npm run test:ui -- --runInBand → Test Suites: 52 passed, 52 total / Tests: 440 passed, 440 total
npm run build:ui   → Compiled with warnings.(node_modules 소스맵 ENOENT·react-select postcss-calc — 기존) / The build folder is ready to be deployed.
```

## 파일

신규: `static/ui/src/features/worklogCert/{TeamCertificationPage,CertMatrixTable,MemberCertificationPanel,OwnCertificationPanel,CertificationListView,WorklogSummaryTable,CertifyBar,CertFilterBar,CertStateBadge,SignalBadges,MyCertificationSummary}.jsx`, `{certFormat,certifyRunner}.js`, `__test__/{certPure.test.js,TeamCertification.test.jsx}` · `static/ui/src/features/settings/WorklogCertSettings.jsx` · `locales/{kr,en}/worklogCert.json`

수정: `static/ui/src/utils/queryKey/approvalKeys.js` · `features/inbox/{InboxPage.jsx,inboxUrl.js}` · `features/timesheet/MyTimesheetPage.jsx` · `features/worklog/{WorklogTab.jsx,WorklogCertificationPanel.jsx}` · `features/worklogHistory/TimesheetHistorySection.jsx` · `features/settings/{TimesheetSettings.jsx,WorkforceLinkSettings.jsx}` · `locales/{kr,en}/error.json` · 테스트 4개(위 §7)

## 2회차 (2026-10-10, 검증 실패 3 중 프론트 몫)

| # | 지적 | 수정 |
|---|---|---|
| B1 | `totals.certifiedCount`(백엔드 2회차 가산) 미소비 — 화면은 `items` 의 CERTIFIED 를 셌다 | `CertificationListView.jsx` 가 `Number(totals.certifiedCount ?? items.filter(CERTIFIED).length)` 로 서버 값을 쓴다(옛 응답 폴백). 숨김 건 포함이라 목록 수와 다를 수 있어 `worklogCert.member.hidden` 문구에 "위 인증 건수에는 포함됩니다"를 덧붙였다(kr/en) |
| B2 | `certPublish.selfSeconds·selfCount` 미소비 | `WorkforceLinkSettings.jsx` 의 `CertPublishRow` 에 `selfCount>0` 일 때 "본인 서명분 {time} · {count}건" 줄(testId `workforce-cert-self`). 연결 상태와 무관하게 보인다. 공용 파일 변경은 이 함수 안 한 블록 + `formatSeconds` import 1줄뿐 |

- i18n: `worklogCert.workforce.selfCount`(kr `{count}건` / en `{count} worklogs`) 추가, `member.hidden` 문구 갱신. `npm run merge` 통과.
- 테스트: `TeamCertification.test.jsx` 에 `CertificationListView` 2건(서버 certifiedCount 사용·숨김 안내 / 옛 응답 폴백), `WorkforceLinkSettings.test.jsx` 에 1건(본인 서명분 표시·미연결 대기 문구·0건이면 숨김).
- 실행 결과:
  - 인증·관련 suite(`worklogCert`·`WorkforceLinkSettings`·`WorklogHistoryList`·`inbox`·`worklog`·`timesheet`): **15 suites / 149 tests 통과**
  - 전체 `npm run test:ui -- --runInBand`: 51/52 suites, 441/443 tests. **실패 1 suite(`settings/__test__/WorklogHistorySettings.test.jsx` 2건)는 동시에 진행 중인 감사 화면 작업분**(`WorklogHistoryAuditSettings.jsx` 의 `auditErrorText` 미정의 등) — 이 회차 변경과 무관하고 손대지 않았다. 직전 실행에서 같이 실패하던 `worklogHistoryI18n.test.js` 는 그 에이전트 진행으로 이미 통과로 바뀌었다
  - `npm run build:ui`: 통과(Compiled with warnings — 기존 node_modules 경고만)
