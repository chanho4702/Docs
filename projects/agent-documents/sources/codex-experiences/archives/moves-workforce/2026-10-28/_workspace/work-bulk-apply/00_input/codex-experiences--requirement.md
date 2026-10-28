# 요구사항 — 작업관리 목록 뷰 일괄 적용 (2026-08-13)

## 사용자 요청 원문

> "작업 관리에서 일괄 적용 기능이 있으면 좋을거같아 가능할까? 시작일 기한 계획작업량 이거 컨트롤하기가 불편해"

사용자 확정 사항 (AskUserQuestion):
- **위치: 목록 뷰** (트리/간트 아님)
- **적용 방식: 같은 값으로 설정만** (상대 이동 "+N일" 미지원)

## 기능 정의

프로젝트 상세 > 작업관리 탭 > **목록 뷰**(`ProjectIssuePanel`/`ProjectIssueTable`)에서
체크박스로 선택한 이슈 N건에 **시작일 / 기한 / 계획 작업량(MD)** 을 같은 값으로 일괄 설정한다.

1. 목록 뷰에는 **행 체크박스가 이미 존재**한다(`checkItems` — 이슈 삭제/등록에 사용 중). 이를 재사용한다.
2. 선택이 1건 이상이면 "N건 선택 · 일괄 적용" 액션 노출 → 모달 오픈.
3. 모달 입력 3필드: 시작일(date), 기한(date), 계획 작업량(MD, number).
   - **입력한 필드만 적용, 비워둔 필드는 미변경.** 세 필드 모두 비어 있으면 실행 불가.
   - 시작일 > 기한 조합은 클라에서 차단(둘 다 입력된 경우만 비교).
4. 실행: **동시성 제한(3~5) 병렬**로 이슈별 적용. 진행 표시(스켈레톤/프로그레스 — 스피너 금지).
5. 완료 후 **건별 성공/실패 집계** 표시(예: "12건 성공 / 2건 실패"), 실패 건은 이슈 키 + 사유.
   부분 실패 시 성공분은 유지(롤백하지 않음), 실패분만 재시도 가능하면 가산점.

## 기술 제약 (반드시 준수)

- **기존 단건 write 경로 재사용, 신규 백엔드 최소화**:
  - 시작일/기한 → `updateGanttSchedule` resolver (간트 일정 편집이 쓰는 것,
    `invoke('updateGanttSchedule', { projectId, issueKey, start, due })`).
    단건 mutation은 사전에 `fetchJiraProjectPermissions`로 canEditIssues/canScheduleIssues 판정 —
    일괄에서는 프로젝트 단위 **1회만** 판정하면 된다(이슈가 같은 Jira 프로젝트가 아닐 수 있음에 유의 —
    목록 뷰는 구독 스페이스가 여럿일 수 있어 이슈 키 prefix 별 판정 필요 여부를 설계에서 확인).
  - 계획 MD → Jira timetracking 직접 write (`useUpdatePlannedMd`의 mutationFn 패턴:
    `getIssue(fields:timetracking)`로 remaining 조회 → `updateIssue`에 originalEstimate + remaining 동봉,
    `plannedHours(md, hourRate)` 역산, `buildTimetrackingPayload` 재사용).
    hourRate는 간트가 쓰는 설정값과 동일 출처를 쓸 것.
- **캐시 처리**:
  - 목록 뷰는 서버 JQL(search) 기반 — **write 직후 search 재조회 금지 규약**(인덱스 지연) 준수.
    invalidate 대신 적용 성공 건의 값을 목록 캐시에 직접 패치하거나, 최소한 지연 재조회 사유를 설계에 명시.
  - 트리/간트가 같은 이슈를 `ganttKeys.data` 캐시로 공유한다 — 일괄 적용 성공분을
    간트 캐시에도 패치할지(있으면), 아니면 자연 재조회에 맡길지 설계에서 결정하고 근거를 남길 것.
- **권한**: 화면 진입은 `canWrite('PROJECT')` 게이트. 백엔드는 기존 `updateGanttSchedule` 가드 그대로.
- **UI**: Atlaskit + RFC-178 공용 지점(모달은 기존 CommonModal 패턴, 스피너 금지·스켈레톤),
  진행/결과 표시는 과설계 금지([[feedback_avoid_overbuilding]]) — 모달 내 텍스트+바 수준이면 충분.
- **i18n**: `locales/kr/*.json` + `locales/en/*.json` 추가 후 `npm run merge`.
- 계획 MD 입력에 `Textfield type="number"` 사용 시 `onWheel={e => e.target.blur()}` (WORK_VIEWS.md §9).

## 범위 제외

- 상대 이동(+N일), 트리/간트 뷰의 일괄 적용, 담당자/협업자/상태 일괄 변경(이번 범위 아님).
- 신규 KVS/SQL 엔티티 없음. manifest 변경 없음(신규 스코프 불요 전제 — 벗어나면 설계에서 보고).

## 영향 범위 예상

- 프론트: `static/ui/src/pages/projectDetail/issue/`(목록 뷰), 신규 일괄 적용 모달 + 실행 훅, i18n.
- 백엔드: 원칙적으로 0(기존 resolver 재사용). 일괄 전용 resolver가 정말 필요하면 설계에서 근거 제시.
