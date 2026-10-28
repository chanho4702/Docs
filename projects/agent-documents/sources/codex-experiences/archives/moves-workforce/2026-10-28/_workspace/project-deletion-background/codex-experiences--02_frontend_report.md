# 02 프론트엔드 구현 리포트 — 프로젝트 삭제 백그라운드화 (2026-10-06)

설계서 §4 + `02_backend_report.md` §2·3 기준. 신규 쿼리 키 없음(React Query 미사용, 타이머+invoke 패턴 유지). 커밋 안 함.

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `static/ui/src/pages/project/projectDeletionState.js` | `PREPARING_STATUSES`·`BACKGROUND_STATUSES`, `deletionTickAction`(advance/poll/null), `isDeletionDelayed`(진행 중 + `PROJECT_DELETION_JIRA_HTTP_(429\|5xx)`), `fetchDeletionStatus`(invoke `getProjectDeletionStatus` → `readDeletionResult`, 브리지 예외는 `deletionFailure`) |
| `static/ui/src/pages/project/useProjectDeletionLoop.js` (신규) | 목록·칸반 공용 루프 훅. advance 2.5s / poll 5s, 폴 12회째마다 advance 1회(kick), 폴 결과 completed → `setDeletion(null)` + `onCompleted`, 그 외 `setDeletion(next)` + `reportDeletionFailure`. `close()` = 닫은 projectId 를 가리고(늦은 응답이 모달을 다시 열지 않음) + `invalidateProjectViews`. `track()` = 새 삭제/재진입 직전 가림 해제 |
| `static/ui/src/pages/project/ProjectDeletionStatusModal.jsx` | 모든 상태에서 닫기(푸터 「닫기」 상시, `Modal onClose` 상시). 준비 단계 `preparingHint`, 백그라운드 `backgroundHint`, UNLINKING 이면 `issueProgress`(unlinked/discovered), 진행 중 지연이면 `delayed` 한 줄(에러 블록 아님). 재시도 버튼은 정지 상태 + `retryable` 일 때만(기존) |
| `static/ui/src/pages/project/ProjectList.jsx` | 기존 2.5s 고정 루프 제거 → 공용 훅. 완료 처리 `completeDeletion`(토스트 + invalidate)을 mutation·폴링 공용. 프로젝트명 옆 `deletion_state === 'DELETING'` 배지. 드로어 삭제 버튼이 DELETING 이면 확인 없이 `track` + `deleteProject` |
| `static/ui/src/pages/project/ProjectDetailDrawer.jsx` | DELETING 이면 삭제 버튼 라벨 `project.delete.resume` |
| `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx` | `scheduleProjectDeletionContinuation`·`ACTIVE_DELETION_STATUSES` 제거 → 공용 훅. 이어 하기·재시도·kick 은 `resume: true` 로 호출. `handleDeleteCard` 가 DELETING 이면 확인 모달 없이 이어 가기 |
| `static/ui/src/pages/projectKanban/useKanbanMutations.js` | `deleteCardMutation.onMutate` 가 `resume` 이면 낙관 제거 생략(`{}` 반환 → 롤백 `setQueryData(undefined)` 는 RQ v5 에서 무동작). 완료 처리 `completeCardDeletion`(토스트 + invalidate) 을 반환해 폴링 완료와 공유 |
| `static/ui/src/pages/projectKanban/KanbanCard.jsx` | DELETING 배지, 메뉴 라벨 `project.delete.resume`(danger 톤 해제) |
| `locales/kr/project.json`, `locales/en/project.json` | 설계 §6 의 6키 |
| 테스트 | 신규 `pages/project/__test__/useProjectDeletionLoop.test.js`(6), `projectDeletionFlow.test.jsx`(+1: 백그라운드 닫기·지연 안내·resume 시 카드 유지), `ProjectListStatus.test.jsx`(+1 배지, primitives mock 에 Inline), `ProjectKanbanBoard.test.js`(삭제된 스케줄러 테스트 제거 — 훅 테스트로 이동) |

## 2. 소비하는 응답 shape

- `invoke('deleteProject', { project_id })`, `invoke('getProjectDeletionStatus', { project_id })` → `result.success` 분기, `result.content.deletion` (기존 `readDeletionResult` 검증 그대로: projectId 일치·status enum·retryable boolean·completed ⇔ COMPLETED).
- 사용 필드: `status`(루프 분기·문구), `completed`, `retryable`, `lastError.code/stage`(정지 상태 에러 블록, 진행 중엔 지연 안내만), `blockedIssueCount`, `issueCounts.unlinked`·`issueCounts.discovered`(UNLINKING 진행 건수), `attempt`(Sentry 보고).
- 목록 행 `deletion_state`(ProjectQuery FINDALL), 칸반 카드 `deletionState`(buildData) — 기존 필드.
- 계약 불일치 없음.

## 3. i18n

6키 추가(`project.delete.progress.{preparingHint,backgroundHint,issueProgress,delayed}`, `project.delete.{deletingBadge,resume}`) 후 **`npm run merge` 실행**, `ko-KR.json`·`en-US.json` 에 반영 확인. 직접 수정 없음.

## 4. 테스트 / 빌드

- `cd static/ui && npm test`: **Test Suites 159 passed / Tests 2592 passed**.
- `CI=true npm run build`: 성공(경고 없음), bundle:check main 491,522B gzip(예산 내), panel 329,459B(예산 내).

## 5. 참고

- 폴 12회 카운터는 훅 인스턴스 단위이며 `track()` 시 0으로 초기화.
- 닫은 뒤에도 진행 중이던 요청의 실패 토스트는 뜰 수 있다(모달만 다시 열리지 않음).
- 실화면(E2E) 미확인.
