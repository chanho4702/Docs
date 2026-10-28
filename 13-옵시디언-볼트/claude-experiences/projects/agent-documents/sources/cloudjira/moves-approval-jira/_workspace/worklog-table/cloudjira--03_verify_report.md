# 검증 리포트 (회차 1) — worklog-table

검증: 2026-10-12 integration-verifier. 기준 = `01_architect_design.md`(계약) + 실제 소스. 보고서 수치는 직접 다시 실행해 확인했다.
범위 판정: 설계서 작성(16:58) 이후 수정된 파일만 이번 작업분으로 봤다(`find -newer`). `src/`·manifest·craco·public·`approvalKeys.js` 는 그 이후 수정 0건.

## 요약  통과 14 / 실패 2 / 미검증 6

## 실패

1. **[static/ui/src/features/worklog/WorklogTab.jsx:258-292] 보고되지 않은 변경 — 이슈 범위 작업 로그 정책 패널 제거 + "작업 로그 / 내 승인 요청" 하위 탭 신설** (담당: frontend, 리더 확인 필요)
   - HEAD `WorklogTab.jsx:308` 에 있던 `<details><summary>{worklogPolicy.scope.issue}</summary><WorklogPolicyPanel issueId …/></details>` 가 없어졌다. 이제 이슈 범위 `WorklogPolicyPanel`(`scope='issue'`) 를 그리는 화면이 0곳(`ProjectPolicyModal` 의 project 범위만 남음) → 이슈별 워크로그 정책 재정의 UI 진입점이 사라졌다. `saveIssueWorklogPolicy` resolver 는 백엔드에 그대로 있다.
   - `Tabs id="worklog-sections-{issueId}"`(`worklog.tab.section.*`, testId `worklog-section-*`)로 `WorklogApprovalPolicyPanel`·`MyWorklogApprovals` 를 두 번째 하위 탭으로 옮겼다.
   - 설계 §1 은 "탭 상단 … 정책 알림 … 섹션은 **그대로**"였고, 02 보고서·선행 작업 보고서 어디에도 이 두 변경이 없다(`grep -rn "worklog-section\|tab.section" _workspace` 결과 0건). 테스트(`WorklogTab.test.jsx:129`)는 있다.
   - 재현: `git diff HEAD -- static/ui/src/features/worklog/WorklogTab.jsx` 의 `-<details onToggle=…WorklogPolicyPanel…` 줄과 `+<Tabs id={\`worklog-sections-…` 블록.
   - 고치는 방법: 의도한 것(예: linked-issue-schedule 설계 §이슈 범위 폐지 선반영)이면 02 보고서에 변경·근거를 적고, `worklogPolicy.scope.issue` 키·`WorklogPolicyPanel` 의 issue 분기를 정리할지 결정한다. 의도가 아니면 `<details>` 패널을 복원한다.

2. **[locales/kr/worklogHistory.json:7 · locales/en/worklogHistory.json] 고아 키 `worklogHistory.tab.panelTitle`** (담당: frontend)
   - 유일한 소비처였던 탭의 인라인 이력 패널 제목(HEAD `WorklogTab.jsx`)이 제거돼 이제 비테스트 소스 소비처 0. 보고서의 "고아 키 0"과 다르다.
   - 재현: `grep -rF "worklogHistory.tab.panelTitle" static/ui/src src --include=*.js --include=*.jsx | grep -v __test__` → 0건.
   - 고치는 방법: kr/en 에서 키 삭제 후 `npm run merge`(i18n 대조 테스트에 있으면 같이 뺀다).

## 미검증
- Forge Modal(medium)에서 요약 + 탭 + 바닥 버튼 잘림 여부, 탭 전환 시 iframe 높이 재계산 — 실기기 필요.
- 모달 안 `DeleteConfirm`(Atlaskit 모달 중첩) 표시 — 실기기.
- Modal context 크기(행 스냅숏, 설명 최대 4,000자) bridge 한도 — 실기기.
- `view.close(payload)` → 탭 `onClose(payload)` 실제 전달(정책 안내 경로). 단위 테스트는 목으로 통과. 안 오면 안내만 빠지고 재조회는 됨 — 실기기.
- `.settings-rows` CSS 이동 전 규칙과의 동일성 — 원래 규칙(`settings-design` 회차 추가분)이 미커밋이라 HEAD 에 없어 바이트 대조 불가. 클래스 참조 대조는 통과(아래).
- 상세 모달 제목 중복 — Forge Modal 머리 `worklog.detail.title`("작업 로그") + 본문 Heading "작업 로그 · KEY" 가 둘 다 보일 것으로 추정(실기기 확인, 결함 아님).

## 통과

### 경계면 표
| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| getIssueWorklogs | `WorklogService.js:130-150` `viewOf` → `{…base, mine, periodKey, lock, canEdit, canDelete}` + 통제 시 `blocked/controlled/foreign/via`, 남의 행은 `blocked:{code:'NOT_OWNER'}`·통제 상태 null | `WorklogTab.jsx` 행 전체를 스냅숏으로 `Modal context.worklog` 에 그대로 전달, `WorklogPeriodCell` 은 `periodKey`·`lock`·`blocked`·`certification`·`visibilityRestricted` | O |
| getWorklogEditorContext | `WorklogService.js:400-434` `{issueId, policy?, timeZone, worklog(viewOf)|null, control?…}` — `loadOwn` 이라 본인 것만 | `WorklogDetailModal.jsx` `editor.worklog`·`editor.policy`·`editor.timeZone`, `enabled: … && ownCandidate(snapshot.mine===true)` | O |
| deleteWorklog | 서버 판정(기존) | `WorklogDetailModal.jsx` `{issueId, worklogId}` 만 전송, 결과 `result.policy.notices` → `view.close({deleted, changed, policyNotices})` | O |
| updateWorklog | 기존 | `WorklogForm mode="edit"`(기존 컴포넌트, `editor` 그대로) | O |
| getWorklogHistory | 기존 | `WorklogHistoryPanel embedded` — 이력 탭이 선택됐을 때만 마운트(`tab === HISTORY_TAB`) | O |

### A. 상세 모달 권한·데이터 경계
- ① 남의 행: `ownCandidate=false` → 편집 컨텍스트 미호출, `rowActionsOf` 가 통제 응답이면 `NOT_OWNER → {edit:null, delete:null}`, 비통제면 서버 `canEdit/canDelete=false` → null → `RowAction` 이 `null` 반환(렌더 안 함). 테스트 `WorklogDetailModal.test.jsx:191`. **통과**
- ② 쓰기: `deleteWorklog`/`updateWorklog` 페이로드는 id 뿐, 스냅숏 값은 판정에 안 쓴다. 본인 행도 편집 컨텍스트가 오기 전(`ready=false`)엔 `gate()` 로 비활성. 활성 판정은 fresh `editor.worklog`(서버) 기준(`mergeView` 는 fresh 위에 `history`·`certification` 만 얹음). **통과**
- ③ 민감 정보: 스냅숏은 서버가 준 행 객체 그대로(프론트 가공·추가 필드 없음). 남의 행은 서버가 통제·인증 상태를 싣지 않으며(`viewOf` `!mine` 분기), 모달도 덧붙이지 않는다. `reasonTextsOf` 는 NOT_OWNER 를 사유로 쓰지 않음(`:303` 테스트). **통과**
- ④ 이력 탭 열 때만 `getWorklogHistory`(`:165` 테스트), `history` null 이면 호출 없이 안내(`:182`). **통과**
- ⑤ 삭제 후 `onClose({deleted:true, changed:true, policyNotices})` → `entries/worklog.jsx` `view.close(payload)` → 탭 `onClose(payload)` 가 `policyNotices` 배열이면 표시 + `refresh()`. 삭제 실패 시 닫지 않고 사유 표시·재조회(`:270`). **통과**(실전달은 미검증)

### B. 테이블 계약
- 5열 `author 22 / started 22 / timeSpent 10 / period 24 / actions 14`, 설명·상태 열 없음, 행 내 수정·삭제·인라인 이력·`DeleteConfirm` 없음. **통과**
- testId: HEAD 대비 삭제된 literal 은 `worklog-edit/delete/history/cert-${worklog.worklogId}` 뿐이고 모달에 `worklog-edit-${worklogId}`·`worklog-delete-${worklogId}`(+`-reason`)·`worklog-history-${worklogId}`(이력 탭)·`worklog-cert-${worklogId}`(탭은 `certTestId` prop) 로 같은 이름 유지. 그 밖의 삭제(`workforce-*` 10개)는 이번 작업 이전 수정분(`WorkforceLinkSettings.jsx`, 설계 시각 이전 mtime). **통과**
- `worklogContext.js`: `MODES` 에 `detail`, `modalContextOf` 가 MODES 로 거르므로 `mode: worklogId ? modal.mode : 'create'` 는 항상 유효값. detail+worklogId 일 때만 `worklog`(객체 아니면 null)·`timeZone`. 테스트 `worklogPure.test.js:139,155`. **통과**
- `entries/worklog.jsx`: detail 은 lazy `importWithReloadOnce`. **통과**
- `WorklogHistoryPanel embedded`: 테두리·제목·접기 버튼 생략, 기본 동작 불변(타임시트 소비처 그대로). **통과**
- `RowAction` `appearance`·`spacing` 기본값이 HEAD 값과 동일. **통과**
- 높이: `100vh` 사용 없음. **통과**

### F. 범위
- `src/`·manifest·craco ENTRIES·public html 무변경, 쿼리키 추가 없음(`approvalKeys.js` 이번 작업 시각 이후 미수정), resolver 호출 집합 HEAD 대비 증가는 `getFeatureOverview`(feature-selection 선행분) 하나. **통과** (단, 실패 1 의 미보고 변경 제외)
- `.settings-rows`: 정의는 `components/settings/settingsRows.css` 한 곳, `appShell.css` 에 잔존 규칙 없음(중복 없음), 클래스 참조(`settings-rows`·`settings-rows-label`·`settings-rows-value`)는 `SettingsRows.jsx` 한 곳뿐이고 CSS 와 일치. 빌드 산출 CSS 에 그리드 `minmax(140px,200px) minmax(0,1fr)`·≤760px 1열 규칙 존재. `.settings-section`·`.settings-form` 규칙은 `appShell.css:95-99` 에 그대로. **통과**

## 실행 결과
| 명령 | 결과 |
|---|---|
| `static/ui: CI=true npx jest --runInBand` | 80 suites / 709 tests passed, EXIT 0 |
| 루트 `npx jest`(UI 종료 후 단독) | 157 suites / 2460 tests passed, EXIT 0 |
| 루트 `npm run merge` | 성공 |
| `static/ui: CI=false npm run build` | 성공, "Compiled with warnings" — node_modules source map 2건·`@atlaskit/react-select` postcss-calc 1건뿐, 우리 코드 경고 0 |
| `npm run check:bundle` | `[bundle-check] OK` |
