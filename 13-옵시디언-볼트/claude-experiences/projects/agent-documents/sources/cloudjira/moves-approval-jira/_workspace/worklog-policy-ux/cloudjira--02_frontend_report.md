# 02 프론트 보고서 — 워크로그 정책 화면 정리 (worklog-policy-ux)

작성: 2026-10-12 frontend-engineer · 1회차 · 입력 `01_architect_design.md`(요구 겸함). feature-selection 프론트 회차와 같이 구현.
백엔드 변경 없음. resolver·쿼리키·저장 payload 무변경. git add/commit/push 없음.

## 1. 소비 resolver (무변경)
| resolver | 화면 | 비고 |
|---|---|---|
| `getApprovalSettings` / `saveApprovalSettings` | 타임시트 > 정책 폼 | 새로 patch 에 `createWindowDays`·`editWindowDays`·`deleteWindowDays`·`approvalMode` 포함(서버 `normalizeSettingsPatch` 가 이미 받음: 0~3650 정수, `CERTIFICATION|PREAPPROVAL`) |
| `getProjectWorklogPolicy` / `saveProjectWorklogPolicy` | 프로젝트 정책 모달의 패널 | payload `{ projectId, expectedRevision, override }` 그대로 |
| `getIssueWorklogPolicy` / `saveIssueWorklogPolicy` | 이슈 범위 패널 | 그대로 |
| `refreshWorkforcePolicies` | 패널 "워크포스 정책 다시 받기" | 결과를 `refreshResultLine` 평문 한 줄로 |
| `getWorklogPolicyDiagnostics` | 정책 진단(지원용) | **details 를 펼칠 때만** 조회 |
| `getWorklogPolicyCatalog` | — | **이제 프론트가 부르지 않는다**(사이트 계층 패널 제거). 쿼리키 `worklogPolicyKeys.catalog` 와 resolver 는 남겨 둠 |

## 2. 바뀐 파일
| 파일 | 변경 |
|---|---|
| `static/ui/src/features/settings/TimesheetPolicySettings.jsx` | `WorklogPolicyPanel scope="site"` 섹션 제거(`ts-worklog-policy-section` 없음). `TIMESHEET_POLICY_KEYS`·DEFAULTS·NUMBER_RANGES·`toTimesheetPatch` 에 4키. 새 하위 섹션 `ts-window-section`(기록·수정·삭제 가능 일수 + 삭제 도움말), `ts-approval-mode-section`(Select + 도움말). lockSubmitted 도움말. 진단은 폼 아래 `<details data-testid="ts-worklog-policy-diagnostics">`(기본 접힘, 펼칠 때만 렌더·조회) |
| `static/ui/src/features/worklogPolicy/WorklogPolicyPanel.jsx` | project/issue 전용으로 재작성. 머리(제목 "이 프로젝트(이슈)에서 다르게 적용할 항목" + `hierarchyShort` + "자세히" details 에 hierarchy·lockNotice·retentionNotice·preapprovalFloor·refreshHelp). authority STALE/EXPIRED/INVALID 경고는 본문 SectionMessage warning. 행: 라벨 · 지금 적용되는 값 + 출처 칩 · 여기서 바꾸기(체크 + 입력, 단위 분/일). 워크포스 고정(allowTighten 아님)은 체크박스 대신 로젠지 + "바꿀 수 없습니다". 리비전·출처별 상태·상속 여부·무시된 설정·사이트 전용 항목은 `<details data-testid="worklog-policy-support">` "상태 정보(지원용)". 초 단위 키는 분으로 보여 주고 저장 시 ×60 |
| `static/ui/src/features/worklogPolicy/WorklogPolicySummary.jsx` | 제목 "이 이슈에 적용되는 기록 규칙", 제한이 걸린 항목만(+출처 칩), 없으면 "제한 없음 · 사이트 기본값", `writeNotice` 는 "자세히" details, 경고(authorityWarn)·잠금 만료 안내는 본문. `policyValueText` 가 초→분·일 단위·선택값 번역. `PolicySourceChip`·`isRestrictive` export |
| `static/ui/src/features/worklogPolicy/policyFields.js` | `sitePolicyPatch` 삭제(소비처 없음) |
| `static/ui/src/features/worklogPolicy/WorklogPolicy.test.jsx` | site 테스트 2건 삭제 → project 범위·분 변환·행 구조·경고/details·다시 받기 결과·policyValueText·요약 테스트 6건. `fireEvent.change` 헬퍼를 네이티브 setter + input 이벤트로(React 값 추적기 통과) |
| `static/ui/src/features/settings/__test__/TimesheetPolicySettings.test.jsx` (신규) | 사이트 패널 미렌더, 새 섹션·도움말, 진단 details 접힘(펼칠 때만 렌더), 새 4키 patch, toTimesheetPatch 기본값 |
| `locales/kr|en/timesheet.json` | 라벨 교정(§1.1 — limits·dailyMax·weeklyMax·futureDate·backdate·lockSubmitted·unit.WEEK·exceptionGroup·action.*) + 신규 `settings.windowSection`·`createWindowDays`·`editWindowDays`·`deleteWindowDays`·`deleteWindowHelp`·`approvalModeSection`·`approvalMode.{label,CERTIFICATION,PREAPPROVAL}`·`approvalModeHelp` |
| `locales/kr|en/worklogPolicy.json` | §4 값 교정 전부 + 신규 `hierarchyShort`·`authorityWarn.*`·`supportInfo`·`siteOnlyList`·`diagnosticsSupport`·`refreshResultLine`·`noLimits`·`overrideHere`·`effectiveNow` + 추가 `unit.minutes|days`·`value.EXTRA_STEP`. **삭제** `scope.site`·`override`·`effective`(쓰는 곳 없어짐) |

## 3. 설계와 다르게 한 점 (이유)
1. **`WorklogPolicyPanel` 의 site 범위를 코드에서 없앴다.** 설계는 탭에서 빼라고만 했지만 다른 소비처가 없다(ProjectPolicyModal 은 project). 남기면 같은 키 이중 편집기가 다시 붙을 수 있고 `scope.site`·`sitePolicyPatch` 가 고아가 된다.
2. **설계가 말한 "WorklogTab 의 패널"은 실제로 마운트되지 않는다.** 이슈 범위 패널은 지금 어느 화면에도 붙어 있지 않고(테스트만), 쓰기 전 요약은 `WorklogDialog`·`DeleteConfirm` 에 있다 — 요약 변경이 그쪽에 적용된다.
3. **`policyValueText` 단위 변환을 공용 함수에 넣었다** → 제출 당시 정책 근거(`TimesheetSnapshotSection`)도 분·일로 보인다. 같은 라벨("하루 최대 기록 시간")에 초 숫자가 붙는 불일치를 막기 위해.
4. **추가 키**: 단위(`unit.minutes|days` — 입력칸 뒤 단위), `value.EXTRA_STEP`(선택값 번역 시 옛 사이트 값), 타임시트 폼의 `approvalMode.label`·`deleteWindowHelp`·`approvalModeHelp`(설계에 문구만 있고 키 이름 없음). `refreshResult` 값은 "마지막 수신 결과"로 바꿔 지원용 정보의 `workforce.lastResult` 라벨로 쓴다.
5. **`tightenOnly`·`noOverride` 값은 문장형**("더 엄격하게만 바꿀 수 있습니다"/"바꿀 수 없습니다") — §2.2 에서 행 오른쪽 한 줄 설명으로 쓰이므로 §4 의 짧은 형("더 엄격하게만"/"바꿀 수 없음")보다 자연스럽다.
6. **잠긴(완화 불가) 행도 입력칸은 비활성으로 남긴다** — 값이 무엇인지 보이고, 기존 테스트(`historyKeepComment` 입력 disabled)와 호환.
7. **진단은 펼칠 때만 조회**한다(설계는 접기만 명시). 접힌 채로 매 진입마다 진단 resolver 를 부를 이유가 없다(유휴 호출 절감).
8. **쓰기 전 요약은 경고가 있으면 SectionMessage 를 warning 으로** 바꾼다(그 외 information).
9. `preapprovalFloor` 는 패널 "자세히" 안으로, 사이트 폼에서는 `timesheet.settings.approvalModeHelp` 가 같은 뜻을 평문으로 전한다.

## 4. 테스트·빌드 결과
| 명령 | 결과 |
|---|---|
| `CI=true npx jest` (static/ui, 두 설계 합산) | **Test Suites 78 passed / 78, Tests 677 passed / 677** |
| `CI=true npx jest src/features/worklogPolicy src/features/worklog` | 179 passed |
| `CI=false npm run build` (static/ui) | 성공. 경고는 `node_modules` postcss-calc 1건(기존), 우리 코드 eslint 경고 0 |
| `npm run merge` (리포 루트) | 성공(ko-KR.json·en-US.json 생성) |
| 문구 키 대조 | `features/settings/__test__/featureSelectionI18n.test.js` 가 이 회차 파일의 키 kr/en 존재 + 삭제 키(`worklogPolicy.scope.site`·`override`·`effective`) 부재를 고정 |

## 5. 미검증 (실기기)
| 항목 | 확인 방법 |
|---|---|
| 프로젝트 정책 모달 안 행 레이아웃(flex-wrap 3칸)·좁은 폭 | 프로젝트 설정 > 정책 모달 |
| `<details>` 펼침이 Jira iframe 높이에 따라오는지(모달 하단 버튼) | 모달에서 "상태 정보(지원용)"·"자세히" 펼치기 |
| 출처 칩 토큰 색(discovery/neutral) 다크 모드 | 테마 전환 |
| 분 입력 → 저장 → 다시 열기 값 일치(×60 왕복) | 프로젝트에서 하루 최대 30분 저장 후 재조회 |
| 사이트 폼 새 4키 저장 → 작업 로그 대화상자 요약 반영 | 정책 저장 후 Log work 대화상자 |
