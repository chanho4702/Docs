# 02 프론트 보고서 — 작업 로그 테이블 재구성 + 상세 모달 (worklog-table)

작성: 2026-10-12 frontend-engineer. 백엔드·manifest·엔트리 3곳(craco ENTRIES·public html·manifest resources) 변경 없음.
소비 resolver(기존 그대로): `getIssueWorklogs`, `getWorklogEditorContext`, `updateWorklog`(WorklogForm 경유), `deleteWorklog`, `getWorklogHistory`. 쿼리키 추가 없음(`worklogKeys.issue/editor`, `worklogHistoryKeys.worklog` 재사용).

## 1. 바뀐 파일

| 파일 | 내용 |
|---|---|
| `static/ui/src/features/worklog/WorklogTab.jsx` | 열 5개(작성자 22 / 시작 22 / 소요 10 / 기간 24 / 작업 14). 설명 열·상태 열·행 내 수정/삭제·인라인 이력 펼침·`DeleteConfirm`·삭제 mutation 제거. "상세" 버튼(`worklog-open-{id}`) → `Modal({resource:'main/worklog', context:{mode:'detail', worklogId, worklog(행 스냅숏), timeZone, issueId, issueKey}})`. 이력 카운트 표식(`worklog-history-count-{id}`, `historyButtonOf` 재사용). 모달 onClose payload 의 `policyNotices` 를 탭 상단 안내로. `pages` useMemo(기존 exhaustive-deps 경고 제거) |
| `static/ui/src/features/worklog/WorklogPeriodCell.jsx` (신규) | 기간 칸 — `formatPeriod(periodKey)` + LockBadge·ControlBadges·CertStateBadge·공개 제한. periodKey null 이면 '—'. 탭·모달 공용 |
| `static/ui/src/features/worklog/WorklogDetailModal.jsx` (신규) | 상세 모달. 머리(제목 "작업 로그 · KEY") + `SettingsRows` 요약 4항목 + `@atlaskit/tabs`(`worklog-detail-tabs`: 상세 / 변경 이력 (n)) + 바닥(닫기 · 수정 · 삭제). 수정은 같은 모달 안에서 `WorklogForm mode="edit"`(+ "상세로" 버튼) → 저장 후 상세 복귀. 삭제는 `DeleteConfirm` → `deleteWorklog` → `view.close({deleted, changed, policyNotices})`. 순수 함수 `reasonTextsOf` export |
| `static/ui/src/features/worklog/worklogContext.js` | `MODES` 에 `detail`. detail 이면 `{mode:'detail', worklogId, worklog, timeZone}` 반환. worklogId 없는 detail 은 create 로(기존 edit 규칙과 동일) |
| `static/ui/src/entries/worklog.jsx` | `mode==='detail'` → `WorklogDetailModal`(lazy, `importWithReloadOnce`) |
| `static/ui/src/features/worklog/rowActions.jsx` | `RowAction` 에 `appearance`·`spacing` 선택 prop(기본값 기존과 동일) — 모달 바닥 버튼 크기 |
| `static/ui/src/features/worklogHistory/WorklogHistoryPanel.jsx` | `embedded` prop — 테두리·제목·접기 버튼 없이 목록만 |
| `static/ui/src/components/settings/SettingsRows.jsx` + `settingsRows.css`(신규) · `app/appShell.css` | `.settings-rows` 격자 규칙을 컴포넌트가 직접 불러오는 CSS 로 옮김(AppShell 밖 iframe 인 작업 로그 모달에서도 2열 격자). appShell.css 에서 같은 규칙 제거(중복 방지, 결과 동일) |
| `locales/{kr,en}/worklog.json` | 추가 `column.period`·`column.actions`·`tab.open`·`detail.*`(title, tab.detail, tab.history, tab.historyNone, backToDetail, historyUnavailable, lockReason, comment, noComment, policy, certification, notCertified). `column.timeSpent` kr "소요 시간"→"소요". **삭제** `column.comment`(소비처 0 — grep 확인) |
| 테스트 | `__test__/WorklogTab.test.jsx`(재작성), `__test__/WorklogDetailModal.test.jsx`(신규 11), `__test__/worklogPure.test.js`(detail 모드 2) |

## 2. 설계와 다르게 한 점과 이유

1. **상세 모달 데이터 원천 — 탭 행 스냅숏을 context 로 넘긴다.** 설계는 `getWorklogEditorContext` 하나로 그리라 했으나, 이 resolver 는 `loadOwn` 으로 **본인 워크로그만** 연다(남의 것은 `WORKLOG_NOT_OWNER`). 또 응답 뷰에 `history`(카운트)·`certification` 이 없다. 백엔드 변경 금지라 → 탭이 이미 받은 행(WorklogView, 표시용)과 정책 타임존을 Modal context 로 넘기고, **본인 행일 때만** 편집 컨텍스트를 불러 최신 판정(canEdit/canDelete/blocked)·정책·수정 폼 재료로 덮어쓴다(이력 카운트·인증 배지는 스냅숏 값 유지). 남의 기록은 스냅숏만으로 그리고 수정·삭제 버튼이 없다(`rowActionsOf` NOT_OWNER 규칙). 스냅숏은 표시 전용이며 쓰기 판정은 서버가 다시 한다. → **백엔드 요청(선택)**: 남의 워크로그 상세 조회 resolver 가 생기면 스냅숏 전달을 없앨 수 있다.
2. **"기간" 열 해석** — 설계 가정 그대로 "워크로그가 속한 승인 기간(periodKey) + 잠금·통제·인증·공개 제한 배지". 단 표기는 원문 `2026-10` 이 아니라 대화상자·잠금 문장과 같은 `formatPeriod`(예 "2026년 10월", 주 단위 "2026년 41주")로 했다 — 같은 기간이 화면마다 다르게 보이지 않게.
3. **"상세" 버튼 라벨** — `worklog.tab.open` = "상세" / "Details"(설계 그대로). 열 머리는 "작업"(`worklog.column.actions`). 이력 카운트는 버튼이 아니라 버튼 옆 Lozenge 표식("수정 N회"/"이력", 기존 `worklogHistory.tab.*` 키).
4. **바닥 버튼 배치** — 프로젝트 공용 `ModalLayout` 규약(닫기는 왼쪽 끝, 실행은 오른쪽)을 따라 "닫기"를 왼쪽에, 수정(default)·삭제(danger)를 오른쪽에 뒀다(설계는 오른쪽에 셋).
5. **이력 탭 카운트** — `changeCount>0` 일 때만 "변경 이력 (n)", 0·null·이력 불가면 "변경 이력". 모달 안에서 수정 저장 직후에는 카운트가 낡았으므로 숫자를 뗀다(이력 쿼리는 무효화).
6. **삭제 후 정책 안내** — 예전엔 탭이 삭제를 직접 해 `result.policy.notices` 를 띄웠다. 이제 모달이 `view.close({policyNotices})` 로 넘기고 탭 onClose 가 받아 띄운다(퇴행 방지).
7. **상세 탭의 "적용 정책"** 은 편집 컨텍스트의 `policy` 가 있을 때만(본인 기록). 남의 기록은 정책 요약을 그리지 않는다.
8. **`.settings-rows` CSS 이동** — `SettingsRows` 재사용 지시를 따르되, 그 격자 CSS 가 AppShell(전역 페이지)에서만 로드돼 작업 로그 iframe 에서는 1열로 무너진다. 컴포넌트가 CSS 를 직접 import 하도록 옮겼다(설정 화면 결과 동일).

## 3. 테스트·빌드 (명령·수치)

- `cd static/ui && CI=true npx jest --runInBand` → **Test Suites 80 passed / Tests 709 passed** (A·B 합산 최종). 병렬 실행(`CI=true npx jest`) 1회에서 `IssueApprovalSettings.test.jsx` 의 lazy 청크 대기(5s)가 부하로 1건 흔들렸고, 단독·runInBand 재실행은 통과 — 기존에 알려진 불안정(코드 무관).
- worklog 범위만: `CI=true npx jest src/features/worklog src/features/worklogHistory src/components` → 21 suites / 235 tests passed.
- `cd static/ui && CI=false npm run build` → 성공("Compiled with warnings" — node_modules 의 source map·postcss-calc 경고만, 우리 코드 eslint 경고 0).
- 리포 루트 `npm run merge` → 성공(kr/en 키 집합 일치, 고아 키 0).
- 백엔드 jest(프론트와 동시 실행 안 함): `npx jest` → 157 suites / 2460 tests passed(locales 를 읽는 transition 테스트 포함).

새 테스트(설계 §4 대응): 열 5개·설명 없음·행 내 수정/삭제/이력 없음 · "상세"가 `mode:'detail'` + 스냅숏·타임존으로 Modal · periodKey null → '—' · 모달 onClose 의 정책 안내 · `detail` 모드 해석 · 요약 4항목·탭 2개 · 이력 탭 열 때만 `getWorklogHistory`(embedded 라 접기 버튼 없음) · history null 안내 · 남의 기록은 편집 컨텍스트 미호출·버튼 없음 · blocked 면 비활성+사유(툴팁·상세 본문) · 수정 전환→저장→상세 복귀(새 값) · "상세로" · 삭제 확인→`deleteWorklog`→close payload · 삭제 거부 시 사유·재조회 · 스냅숏 없음+실패 시 에러. testId `worklog-edit-{id}`·`worklog-delete-{id}`(+`-reason`)·`worklog-history-{id}`(이력 탭) 는 모달로 옮겨 이름 유지.

## 4. 미검증 (실기기 필요)

- Forge Modal(`size:'medium'`)에서 요약 + 탭 + 바닥 버튼이 잘리지 않는지, 탭 전환 시 iframe 높이 재계산(긴 이력 목록 → 짧은 상세 탭으로 돌아올 때 높이 줄어드는지).
- 이력 탭 첫 로딩 스켈레톤 → 목록 전환 시 깜빡임·높이 점프.
- 모달 안 `DeleteConfirm`(Atlaskit 모달 중첩)이 Forge Modal iframe 안에서 정상 표시되는지(기존 P9 미검증과 같은 계열).
- Modal context 크기 — 행 스냅숏(설명 최대 4,000자 포함)을 context 로 넘기는 것이 bridge 제한에 걸리지 않는지.
- `view.close(payload)` 의 payload 가 탭 `onClose(payload)` 로 실제 전달되는지(정책 안내 표시 경로). 안 오면 안내만 빠지고 목록 재조회는 그대로.

## 5. 검증 지적 반영 (03_verify_report.md, 2026-10-12)

| # | 지적 | 수정 |
|---|---|---|
| 1 | 이슈 범위 워크로그 정책 진입점(`<details>` + `WorklogPolicyPanel`)이 사라짐 | `WorklogTab.jsx` "작업 로그" 하위 탭 안, **표 다음**에 접힌 `<details data-testid="worklog-issue-policy">` 로 복원. 펼칠 때만 `WorklogPolicyPanel scope="issue"`(lazy, `importWithReloadOnce`) 마운트. 원인: 작업 시작 전 작업 트리(하위 탭 도입 변경)에서 이미 빠져 있었고, 이번 회차에서 확인하지 못했다. "작업 로그 / 내 승인 요청" 하위 탭은 그대로 유지(승인 요청 쪽은 고를 때만 마운트) |
| 2 | 고아 키 `worklogHistory.tab.panelTitle` | kr/en 에서 삭제(인라인 이력 패널 제목 전용이었고 상세 모달 이력 탭은 `worklog.detail.tab.history*` 를 쓴다). 소비처 0 grep 확인 |

테스트 추가: `WorklogTab.test.jsx` — 정책 진입점이 표 다음에 있고 펼치기 전에는 패널을 그리지 않는다.
재검증: `cd static/ui && CI=true npx jest --runInBand` → **80 suites / 711 tests passed**. `CI=false npm run build` 성공(우리 코드 경고 0). 리포 루트 `npm run merge` 성공(kr/en 키 집합 일치).
