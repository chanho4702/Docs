# 이슈 연결 Gantt — 세션 핸드오프 (2026-06-30)

> 다음 세션에서 이어가기 위한 현재 상태 스냅샷. 브랜치 RFC-134, **전부 커밋 전**.
> 마지막 빌드: `static/ui/build` = **main.2d2f4cda.js (13:48)** — 사용자 미확인(아래 "지금 막힌 것").

## 0. 한 줄 요약
프로젝트 상세 신규 **Gantt 탭** 풀스택 구현. M1(읽기 트리+의존성 화살표)+M2(일정 드래그 write-back)+작업관리 UI 컬럼 미러링까지 동작 확인됨. **마지막 미해결: 프로젝트 시작/종료/오늘 표식(마커)** — SVAR markers 미렌더라 highlightTime(컬럼 배경)으로 교체, 사용자 확인 대기.

## 1. 라이브러리 / 빌드 인프라 (중요)
- **`@svar-ui/react-gantt@2.7.1` (MIT)** 사용. ~~`wx-react-gantt@1.3.1`(GPLv3)~~ 제거.
- CSS는 **`@svar-ui/react-gantt/style.css`** (CDN 참조 0). `all.css`는 cdn.svar.dev 폰트 @import라 금지.
- **CSP 자체호스팅**: react-core가 런타임에 `<link href="cdn.svar.dev/.../wx-icons.css">` 주입 → **patch-package**로 무효화(`patches/@svar-ui+react-core+2.6.0.patch`, `package.json`에 `postinstall: patch-package`). wx-icons 폰트는 `static/ui/src/pages/projectDetail/gantt/fonts/`(woff2/woff/css)에 자체 호스팅. 최종 번들 cdn.svar.dev 참조 0 확인.
- `echarts`를 package.json deps에 명시(미선언이라 SVAR 설치 시 prune되던 사고 방지).

## 2. 백엔드 (`src/resolver/gantt/`, 전부 as='user')
- resolver 2개만 등록: `getProjectGanttData`(read), `updateGanttSchedule`(M2 일정 write-back). **M3 미구현**(setGanttParent/setGanttLink).
- `GanttMapper.normalizeIssue` 반환 Task: id/key/summary/start/end/type/issueType/**issueTypeIcon**/**project{id,key,name,avatarUrl}**/jiraParent/wbsParent/effectiveParent/progress/assignee{accountId,displayName,**avatarUrl**}/statusKey/**statusCategory{key,name,colorName}**/**coworkers[]**.
- `meta`: total/fetchedAt/**projectStart/projectEnd**(project 테이블 start_date/end_date, `findProjectByIdRepository`, best-effort).
- 페처 `IssueApi.getProjectGanttIssues`: fields에 project+coworker+issuetype+statusCategory 포함, 1패스(nextPageToken), 공통 경로 미수정(격리).
- 커스텀필드(manifest): `wbsParentField`(string), `predecessorsField`(object) readOnly — **M3에서 deploy roundtrip 검증 게이트 필요**(object set/get 실증).
- 테스트: 루트 `npm test` 통과(GanttMapper 23 케이스 포함). assignee shape에 avatarUrl 추가로 테스트 1건 갱신함.

## 3. 프론트 (`static/ui/src/pages/projectDetail/gantt/`)
- 파일: GanttPage / GanttChart / ganttAdapter / useGanttData / useGanttMutations / GanttToolbar / gantt.css / fonts/.
- **컬럼 = 작업관리 UI(MyIssueTable) 컴포넌트 재사용**: 프로젝트(`ProjectComponent`)·이슈(`IssueComponent` 키+타입아이콘)·상태(`StatusComponent` 색배지)·담당자(`UserAvatar`)·협업자(`AvatarStack`)·시작일(**plain text**, DateTag 뺌)·기간. **제목 컬럼 제거**(오른쪽 막대에 나옴). SVAR `columns[].cell`=React FC(`{row}`=task).
- 어댑터 핵심 함정 수정(전부 SVAR 소스 확인):
  - **`open:true`는 summary에만** — leaf의 data=null인데 toArray가 open===true면 자식 재귀 → `null.forEach` 크래시(라이브러리 버전 무관).
  - 날짜 없는 이슈 = **`unscheduled:true`** + `<Gantt unscheduledTasks>`.
  - 빈 tasks 마운트 가드.
- 스케일 상단 날짜: **format을 함수로** 줘야 함(문자열 토큰 "MMMM yyyy"는 리터럴로 출력됨). 한국어 로케일(`2026년 6월`/`26주`).
- 일정 편집: `useUpdateSchedule` = **낙관적 업데이트 + 실패 롤백**(onSettled 전체재조회 jank 제거). `move-task`(세로 reorder)=M3라 intercept 차단, `drag-task`(가로 일자)=M2 동작.
- 진행도: svar task `progress`(0~100, timetracking 처리율) 전달 → 막대 채움 표시.
- cellHeight=44(아바타 수용), 타임라인 `start`/`end`를 tasks+마커 범위로 명시.

## 4. ⚠️ 지금 막힌 것 (다음 세션 1순위)
**프로젝트 시작/종료/오늘 표식이 안 보임.**
- SVAR **`markers` prop이 이 환경에서 렌더 안 됨** — 오늘 마커(화면 정중앙·유효날짜)까지 안 떠서 확정. prop이 store까지 안 가거나 렌더 조건 미충족(minified라 정확 지점 못 짚음). 데이터(meta.projectStart='2026-03-30', projectEnd='2026-08-28')는 정상 확인됨.
- → **`highlightTime`으로 교체**(해당 날짜 컬럼 배경 칠: 오늘=파랑/시작=초록/종료=빨강, 반투명). highlightTime은 store 전달·셀 적용을 소스로 확인(주말/공휴일 강조 경로). **빌드 main.2d2f4cda.js, 사용자 미확인.**
- **다음 액션**: 이 빌드 deploy 후 "오늘 파란 띠" 보이는지 확인.
  - 보이면 → 완료(시작/종료는 스크롤하면 양끝).
  - 안 보이면 → **차트 위 커스텀 오버레이**(date→pixel 직접 계산, 완전 자체제어)로 전환. SVAR markers/highlightTime 둘 다 실패 시 최후수단.

## 5. 잔여 (후속)
- M3: 관계 편집(WBS 부모·선후행 화살표 생성/삭제 → predecessorsField object write-back) + 사이클 검증. **object 필드 deploy roundtrip 게이트 선행**.
- #1: 윈도우/증분 로딩(이번달 1차 → 상/하단 더보기로 이전·이후, 백엔드 날짜윈도우 페치). 가장 큼, architect부터.
- 전체 **커밋 정리**(현재 working tree에 백엔드+프론트+manifest+patches+fonts+locales 다수 미커밋).
- verifier 리포트/워크스페이스 산출물 최신화(설계서 §11 단계 대비).

## 6. 배포 메모
- 백엔드 변경 포함 → **`forge deploy`** 필요(프론트만 아님). Node v24 "Premature close" 뜨면 nvm 22.22 전환([[project_forge_node_premature_close]]).
- 빌드는 `cd static/ui && npm run build` (prebuild에서 i18n merge 자동).
