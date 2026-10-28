# 설계 — 작업 로그 테이블 재구성 + 상세 모달 (worklog-table, 프론트 전용)

작성: 2026-10-12 리더. 사용자 원문: "작업 로그 테이블 구조 좀 바꾸자. 작성자·시작·소요·기간·작업 컬럼을 두고, 작업 버튼 누르면 해당 워크로그 상세 정보를 보고, 그 모달에서 삭제·수정 가능해야 하고, 변경 이력은 탭으로."
요구서는 이 문서가 겸한다. 백엔드 변경 없음 — 기존 resolver(`getIssueWorklogs`·`getWorklogEditorContext`·`updateWorklog`·`deleteWorklog`·`getWorklogHistory`) 그대로.
가정(리더): "기간" 열 = 그 워크로그가 속한 **승인 기간**(`periodKey`, 월/주)과 그 기간의 잠금·인증·통제 상태 배지. 다른 뜻이면 열 하나만 바꾸면 된다.

## 1. 테이블 (`features/worklog/WorklogTab.jsx`)

| 열 key | 헤더(kr) | 내용 | width |
|---|---|---|---|
| `author` | 작성자 | 아바타 + 이름(기존) | 22 |
| `started` | 시작 | `formatStarted`(기존) | 22 |
| `timeSpent` | 소요 | `formatDuration`(기존) | 10 |
| `period` | 기간 | `periodKey`(예 `2026-10`, 주 단위면 `2026-W41`) + 상태 배지들(기존 `state` 열 내용: `LockBadge`·`ControlBadges`·`CertStateBadge`·공개 제한 Lozenge). periodKey 가 null 이면 '—' | 24 |
| `actions` | 작업 | 버튼 하나 **"상세"**(`worklog.tab.open`, testId `worklog-open-{id}`) → 상세 모달. 변경 이력이 있으면 버튼 옆 작은 카운트 배지(`history.changeCount`, 기존 `historyButtonOf` 재사용) | 14 |

- **설명(comment) 열 제거** — 상세 모달에서 본다. 행 높이가 한 줄로 고정된다.
- 행 내 **수정·삭제 버튼과 인라인 이력 펼침(`expanded`·`WorklogHistoryPanel`) 제거** — 전부 모달로. `DeleteConfirm` 도 탭에서 제거(모달 안으로).
- 탭 상단의 "작업 시간 기록" 버튼·워크포스 채널 안내·입력 가능 기간·정책 알림·삭제된 타 경로 입력 사본 섹션은 **그대로**.
- 열 리사이즈·고정 폭·더 보기·빈 상태·1,000건 안내 그대로.

## 2. 상세 모달 — 새 mode `detail`

### 2.1 열기
- 기존 방식 그대로 `new Modal({ resource: 'main/worklog', context: { mode: 'detail', issueId, worklogId }, onClose: refresh })`(탭 iframe 안 모달은 높이가 잘리므로 Forge Modal 을 쓴다 — 기존 `openDialog` 와 동일 경로).
- `worklogContext.js` `MODES` 에 `'detail'` 추가, `resolveWorklogView` 가 `{ kind:'dialog', mode:'detail', worklogId }` 를 돌려준다.
- `entries/worklog.jsx`: `mode === 'detail'` 이면 `WorklogDetailModal`(lazy, `importWithReloadOnce`) 렌더.

### 2.2 `features/worklog/WorklogDetailModal.jsx` (신규)
- 데이터: `getWorklogEditorContext { issueId, worklogId }`(기존 — `worklog`·`policy`·`control`·권한·`blocked` 포함) + `getWorklogHistory`(이력 탭이 열릴 때만).
- 머리: 제목 "작업 로그 · {issueKey}", 아래 `SettingsRows` 형식 요약 — 작성자(아바타) / 시작 / 소요 / 기간(periodKey + 배지들).
- **Tabs** (`@atlaskit/tabs`, id `worklog-detail-tabs`):
  1. **상세** (`worklog.detail.tab.detail`): 설명 전문(pre-wrap), 잠금·통제 사유 전문(`lockReasonText`/`blockedText` — 배지 툴팁에만 있던 문장을 여기선 본문으로), 적용 정책 요약(`WorklogPolicySummary operation="edit"`), 인증 상태 한 줄.
  2. **변경 이력 (n)** (`worklog.detail.tab.history`, n = `history.changeCount`): `WorklogHistoryPanel` 의 목록 부분. 패널을 `embedded` prop 으로 확장해 테두리·닫기 버튼 없이 목록만 그린다(기존 `WorklogHistoryList` 그대로). 이력 비활성/권한 없음(`history` null)이면 탭은 보이되 안내 한 줄.
- 바닥 버튼(오른쪽): **수정** / **삭제** / 닫기. 활성 여부는 `rowActionsOf(worklog, t)`(기존) — 비활성이면 툴팁 사유(기존 `RowAction`).
  - **수정**: 모달 내용을 `WorklogForm mode="edit"`(기존, `WorklogDialog.jsx` export) 로 바꾼다(같은 모달 안에서 전환, 뒤로 가기 버튼 "상세로"). 저장 성공 → 상세로 돌아오며 쿼리 무효화(`worklogKeys`·`worklogHistoryKeys`), 상세 요약이 갱신된다.
  - **삭제**: 기존 `DeleteConfirm`(정책 안내 포함) → `deleteWorklog` → 성공 시 `view.close({ deleted: true })` → 탭의 onClose 가 목록을 다시 받는다.
- 닫기: `view.close()`. 수정 저장 후 닫아도 탭이 다시 받는다(기존 onClose 경로).

### 2.3 높이
- Forge Modal 은 Jira 가 크기를 정한다(기존 편집 모달과 같음). 탭 내용은 스크롤. `100vh` 금지(플랫폼 함정).

## 3. i18n (`worklog.json` kr/en)
- `column.period` 기간 / Period, `column.actions` 작업 / Actions, `tab.open` 상세 / Details.
- `detail.title` "작업 로그" / "Worklog", `detail.tab.detail` 상세 / Details, `detail.tab.history` "변경 이력 ({count})" / "History ({count})", `detail.tab.historyNone` "변경 이력" / "History", `detail.backToDetail` "상세로" / "Back to details", `detail.historyUnavailable` "변경 이력을 볼 수 없거나 수집하지 않습니다." / "History is not available or not collected.", `detail.lockReason` "잠금 사유" / "Lock reason", `detail.comment` 설명 / Description, `detail.noComment` "설명 없음" / "No description".
- `column.comment` 는 테이블에서 안 쓰면 제거(다른 소비처 grep 후).

## 4. 테스트
- `WorklogTab` 기존 테스트: 열 구성(5열·설명 없음), 행의 "상세" 버튼이 `Modal` 을 `mode:'detail'` 로 여는지, 수정·삭제 버튼·인라인 이력 없음.
- `worklogContext.test`: `detail` 모드 해석.
- `WorklogDetailModal.test.jsx`(신규): 요약 4항목, 탭 2개, 이력 탭 열 때만 `getWorklogHistory` 호출, 수정 전환·저장 후 상세 복귀, 삭제 확인 → `deleteWorklog` → `view.close`, `blocked` 면 버튼 비활성+사유.
- 기존 testId 중 `worklog-edit-*`·`worklog-delete-*`·`worklog-history-*` 는 모달로 옮겨 **같은 이름 유지**(`worklog-edit-{id}` 등) — 다른 테스트가 찾을 수 있다.

## 5. 함정
- 설명(comment)은 ADF 일 수 있다 — 기존 `adfPlain` 로 평문화(기존 탭이 하던 대로).
- 남의 워크로그: `blocked.code === 'NOT_OWNER'` 면 수정·삭제 버튼 자체를 숨긴다(기존 `rowActionsOf` 규칙). 상세·이력은 권한대로(서버가 history null 을 주면 안내).
- 모달 안에서 수정 폼으로 전환할 때 `WorklogForm` 이 `editor`(getWorklogEditorContext 결과)를 그대로 받는다 — 같은 쿼리키를 쓰면 재조회 없음.
