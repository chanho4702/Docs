# 03 Verify Report — 간트 그리드 개선 (정렬 + 인라인 편집 + 계획 작업량/처리율)

검증일: 2026-07-02 · 검증자: integration-verifier · 범위: 플랜 Phase 1~3(additive 3필드 + CSS 정렬 + 인라인 편집 4종 + 신규 컬럼 2종)

결론: **실패(불일치) 0건.** 경계면 교차/가드/회귀/i18n 전 항목 통과. 테스트/빌드 통과. 수동(배포 후) 항목 3건은 미검증으로 명시.

---

## 통과 (PASS)

### 1. 경계면 교차 — Task shape ↔ 어댑터 ↔ 셀 ↔ 훅 (글자 단위 일치)
생산자→소비자 전 구간 필드명 일치 확인.

- **생산자** `GanttMapper.js:114` `issueId: issue.id ?? null` / `:137` `originalEstimateSeconds: f.timetracking?.originalEstimateSeconds ?? null` / `:139` `progressPercent: f.aggregateprogress?.percent ?? null`. `buildTasksAndLinks:203` spread 로 자동 통과.
- **passthrough** `ganttAdapter.js:131-133` svar 객체에 `issueId`/`originalEstimateSeconds`/`progressPercent` 그대로 전달. 기존 `assigneeObj/coworkers/startText/endText/duration/project/statusCategory` passthrough 무변경(:122-129).
- **소비** `GanttGridEditCells.jsx`: PlannedMdCell `row.originalEstimateSeconds`(:297) / ProgressCell `row.progressPercent`(:345) / CoworkerEditCell `row.issueId`(:147). 필드명 일치.
- **막대 progress(0~1) vs 그리드 progressPercent(0~100) 분리 준수**: 어댑터 svar.progress 는 `task.progress`(:112-113), ProgressCell 은 `progressPercent` — 혼동 없음.

### 2. write 경로 정합 (작업 관리 원본과 동일 shape)
- **useUpdateAssignee**(`useGanttMutations.js:252-257`) `executeRequest('assignIssue',{accountId:accountId||null},{issueIdOrKey:issueKey})` = `ProjectIssueTable.jsx:169` `assignIssue` 동일. issueKey=row.key(=issue.key) 사용 ✓.
- **useUpdateCoworkers**(:314-320) `invoke('updateProjectIdField',{issueId,value:accountIds[],customFieldId})` = `ProjectIssueTable.jsx:197` `updateCoworker` 동일. `issueId`=Task.issueId(=issue.id 숫자 string) ✓. `customFieldId`=`getQueryData(['coworkerFieldId'])` — `useGanttData.js:17-21` 이 채우는 동일 쿼리키 캐시 공유 ✓.
- **useUpdatePlannedMd**(:378-384) `originalEstimate = md>0?`${round(md*rate*10)/10}h`:'0h'` → `executeRequest('updateIssue',{fields:{timetracking:{originalEstimate}}},{issueIdOrKey})` = `ProjectIssueTable.jsx:203-208` `updatePlannedMD` 공식/포맷 글자 단위 동일 ✓.
- **시작일/기간 → useUpdateSchedule 재사용**: DurationEditCell(:278) due=start+(n-1)일(`parseISODate/formatISODate`), StartEditCell(:220) → `onScheduleChange({issueKey,start,due})` → `GanttPage.handleScheduleChange`(:129) → `updateSchedule.mutate`. 신규 write 없음 ✓.
- **Select 옵션 shape 정합**: isMulti onChange `list.map(v=>v?.value?.accountId)`(:132) = `ProjectIssueTable.jsx:260` 동일. 단일 `option?.value?.accountId`(:78) 동일. defaultValue=raw Jira user 배열(coworkers) / `toSelectUser`(단일)로 `ProjectIssueAssignSelect` defaultVal 파서(:98-103)와 호환 ✓.

### 3. 낙관 패치 정합 (content.tasks shape 보존)
- `patchTask`(:9-21) 는 `old.content.tasks[]` 를 `{...tk, ...patch}` 병합 — 다른 필드 보존. 캐시 = 원본 invoke 결과 `{success,content}` = `useGanttData` unwrap 대상과 동일 shape ✓.
- assignee 패치: `assignee` 만 교체(:280), coworkers 패치: `coworkers` 만 교체(issueId 매칭 :342), plannedMd: `originalEstimateSeconds` 만 교체(:398). 인접 필드 무손상.
- 3훅 전부 `onError` 롤백(ctx.prev)+`onSettled` invalidate(`ganttKeys.data`) 존재(:285-296, :350-360, :403-412) — shape 안전망 확보.

### 4. 가드
- summary 시작일/기간 읽기전용: StartEditCell `row?.type==='summary'` 읽기(:188), DurationEditCell `isSummary` canEdit 제외(:246) ✓.
- 미일정 placeholder 기간 '-': `readText = isPlaceholder||duration==null ? '-'`(:243) ✓.
- editable=false 전체 읽기 뷰: 5개 편집 셀 모두 `if(!editable) return readView`(:66,116,168/188,248,302), ProgressCell 항상 읽기전용 ✓.
- 셀 stopPropagation: `CellWrap` onClick/onMouseDown stop(:32-38) + 버튼 onClick stopPropagation(:174,368) ✓.
- 값 무변경 시 write 스킵: Assignee(:90) / Coworker isSameArrayElements(:144) / Start(:219) / Duration(:275) / PlannedMd(:335) 전부 조건 가드 ✓.
- canWrite 2중 가드: `GanttPage` 핸들러(:150-162) + 셀 editable prop. 협업자는 `!p?.issueId` 스킵(:156) ✓.

### 5. 회귀
- 막대 드래그(M2 update-task :596-622), add-link/delete-link/move-task intercept(:480-586), setParent 모달(:216-219), 트리 토글 openStateRef(:234, :592-594), placeholder 막대 클래스 부착(:260-292), GanttBarTooltip passthrough(:40-114) — 전부 코드 경로 무변경. 신규 컬럼은 기간 뒤·setParent 앞 삽입(:394-395), 첫 컬럼 id='text'(트리 토글) 무변경 ✓.

### 6. i18n
- `locales/kr/gantt.json:30-31` `plannedMd`="계획 작업량"/`progress`="처리율", `locales/en/gantt.json:30-31` "Planned (MD)"/"Progress" ✓.
- merge 반영: `ko-KR.json:425-426` / `en-US.json:424-425` gantt.col 하위에 존재(값 일치) ✓. prebuild merge 가 build 에서 재실행되어도 산출 일치(빌드 통과).
- ko-KR/en-US 직접 수정 흔적 없음(merge 산출과 일치). `t('gantt.col.plannedMd')`/`t('gantt.col.progress')`(GanttChart:394-395) 참조 키 존재 ✓.

### 7. 테스트/빌드
- `npx jest src/resolver/gantt`: **PASS** — 2 suites, 38 tests. GanttMapper.test.js 에 3필드 매핑(:99,108,109)·null 폴백(:119-121) 단언 존재.
- `CI=false npm run build`: **PASS** — "The build folder is ready to be deployed." 컴파일 에러 없음. prebuild merge 성공.
- `IssueApi.js:349` fieldList 에 `aggregateprogress` 추가 확인(`timetracking` 기존 포함 :348) — 간트 전용 페처, 공통 경로 무영향 ✓.

### 8. gantt.css Phase 2 정렬 정적 검토
- `:197-199` 헤더 셀 `box-sizing:border-box !important` + `:200-202` 바디 셀(마지막 제외) `border-right:1px transparent` — 헤더 가시 구분선(1px, :161-163)과 바디 투명 1px 가 대칭 → 컬럼 우측 경계 x 정렬. box-sizing 통일로 border 폭이 양쪽 모두 내측 계산.
- 기존 그립(.wx-grip :166-180, 절대배치 별도요소)/헤더 하단선(:182-184)/바디 가로선(:186-188)/리사이저(:211-231)와 셀렉터 충돌 없음. "바디 세로선 없음" 디자인 유지 ✓.

---

## 미검증 (배포 후 수동 — 정적 분석 불가)
1. **헤더-바디 정렬 0px 실측**: CSS 규칙은 정합하나 실제 `getBoundingClientRect().right` 컬럼별 0px 여부는 브라우저 렌더 필요(플랜 Phase 2 검증 절차).
2. **DatePicker selectProps 포털 동작**: 설치 Atlaskit 버전에서 `menuPortalTarget` 미동작 시 시작일 편집이 그리드에 클리핑될 수 있음 → GanttScheduleModal 폴백 필요(플랜 리스크, 배포 후 관측).
3. **InlineEdit editView cellHeight 44 fit**: editView 가 44px 안에 안 들어가면 compact/48 조정 필요(플랜 리스크, 관측 대상).

## 참고 (비차단 노트, 수정 불요)
- **StartEditCell DatePicker 에 `maxDate` 미설정**(`GanttGridEditCells.jsx:200-207`): 작업 관리(`ProjectIssueTable.jsx:307` `maxDate={duedate}`)와 달리 상한이 없어 사용자가 종료일보다 늦은 시작일 선택 가능. 다만 백엔드 `updateGanttSchedule` 의 `GANTT_INVALID_DATE_RANGE` 검증 → `gantt.error.dateRange` 토스트 + 낙관 롤백으로 graceful 처리(크래시 없음). 요구 "start>due 가드"는 서버측+롤백으로 충족. UX 개선 여지만 있음(선택).
- **협업자 낙관 패치 user shape**: 선택 옵션 value(`{accountId,displayName,avatarUrls}`)를 coworkers 로 교체 — AvatarStack 이 읽는 raw Jira user 와 미세 차이 가능하나 `onSettled` invalidate 가 서버 확정값으로 정정(설계상 안전망, 문서화됨).
