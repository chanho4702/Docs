# 이슈 연결 Gantt — 전수 감사 리포트 (04_full_audit)

- 날짜: 2026-07-02 / 브랜치 RFC-134 (전부 커밋 전)
- 범위: 백엔드(`src/resolver/gantt/*`, `IssueApi`, `RequestJiaJson`) + 프론트(`static/ui/.../gantt/*`) 전체 로직
- 실행 결과: 백엔드 `npx jest src/resolver/gantt` → **38 pass / 2 suites**. 프론트 `CI=false npm run build` → **exit 0 (성공)**.
- 분류: **FAIL**(버그 확실) / **WARN**(잠재 위험·개선) / **PASS**(검증 통과) / **미검증**(런타임 확인 필요)

핵심 결론: 최근 변경(링크 방향 스왑·placeholder 막대·resize)의 **경계면 정합성은 코드+테스트로 일관됨(PASS)**. 링크 방향 write/read/index/remove/캐시패치 전 경로가 논리적으로 정합함을 아래 §PASS-1에서 증명. 확실한 결함은 **설계문서(GANTT.md)와 코드의 방향 기술 불일치 1건(FAIL)**. 나머지는 SVAR 실페이로드/실배포 의존 항목.

---

## FAIL

### F-1. GANTT.md 링크 write 방향 기술이 코드와 반대 (문서 결함)
- 문서: `src/resolver/gantt/GANTT.md:51` — "add=`createIssueLink(outward=source, inward=target)`", `GANTT.md:62-71` — "SVAR가 정방향으로 줌(swap 안 함)... 방향: SVAR payload는 source=선행, target=후행 정방향 그대로 → **swap 하지 않는다**".
- 코드: `src/resolver/gantt/GanttService.js:250` — `createIssueLink({ outwardKey: target, inwardKey: source, ... })` (= **swap 되어 있음**). 근거 주석은 `GanttService.js:247-249`에 실측 기반으로 정확히 기재됨.
- 문제: 문서 §3/§4는 "백엔드가 outward=source"라고 서술하나 실제 백엔드는 outward=target. `GANTT.md:71`의 "swap 하지 않는다"는 **프론트 add-link payload**(정방향 그대로 넘김)에 대한 서술로는 맞지만, 문서 §3(line 51)의 백엔드 write 기술은 명백히 stale. 유지보수자가 문서를 믿고 write 방향을 "고치면" 새로고침 후 방향이 역전되는 회귀를 재도입하게 됨(HANDOFF에 여러 번 뒤집힌 이력 있음).
- 수정: `GANTT.md:51`을 "add=`createIssueLink(outward=target, inward=source)` — 이 인스턴스 read 라운드트립이 inward↔outward를 뒤집어 돌려주므로 저장을 스왑해야 새로고침 후 source→target 유지(실측 2026-07-01, `GanttService.js:247-249`)"로 갱신. §4의 흐름도 주석도 동일 반영.

---

## WARN

### W-1. 네이티브 Jira 링크의 의미가 간트 화살표와 반대로 저장됨
- 위치: `GanttService.js:250` (`outwardKey:target, inwardKey:source`).
- 내용: 스왑 저장의 부작용으로 Jira에는 "**target** blocks **source**"로 기록된다(target이 outward=blocks 측). 간트 화살표(source→target = 선행→후행)는 화면상 정방향이지만, **Jira 이슈 상세 화면**에서는 source 이슈에 "is blocked by target", target 이슈에 "blocks source"로 표시 → 사람이 읽으면 "target이 먼저"라는 **반대 의미**로 보인다.
- 영향: HANDOFF/GANTT.md의 R1 목표("Jira 이슈 화면에 blocks/is blocked by 자동 연동")가 의미상 역으로 노출. 간트만 쓰면 무해하나, Jira 네이티브 링크 UI와 병행 사용 시 혼란.
- 판단: 간트 방향 보존과 Jira 의미 정합은 이 인스턴스의 read 라운드트립 특성상 **동시 만족 불가**(둘 중 하나를 택해야 함). 현재는 간트 방향을 택함. **의도된 트레이드오프임을 GANTT.md에 명시** 권고. (근본 해소는 read가 왜 뒤집히는지 규명 후 read 매핑을 교정하고 write 스왑을 제거하는 것 — 배포 리스크 있어 별도 과제.)

### W-2. move-task → 부모 재지정 매핑이 미검증 SVAR 페이로드에 의존 (의도치 않은 부모 해제 위험)
- 위치: `GanttChart.jsx:482-527`, 특히 `500-506`.
- 내용: `mode==='before'|'after'`일 때 `newParent = api.getTask(target)?.parent ?? null`로 부모를 산출하고 `resolved=true`로 확정한다. SVAR move-task의 `target`/`mode` 실제 구조가 가정과 다르면(`api.getTask(target)`가 undefined) `newParent=null`이 되고, 현재 부모가 있는 이슈면 `newParent(null) !== curNorm` → `setParent({parentKey:null})`로 **부모가 해제**된다.
- 근거: HANDOFF §E-1이 "드래그 드롭 하위 진입 = 배포 후 payload 확인 필요(미완)"로 명시, `GanttChart.jsx:485`에 진단 `console.log('[GANTT move-task RAW]')`가 아직 남아있음 = 아직 검증 단계.
- 수정 권고: payload 검증 완료 전까지 move-task는 `mode==='child'`(target을 부모로)만 처리하고 before/after는 스킵(no-op). 또는 `api.getTask(target)`가 유효할 때만 resolved=true. 명시적 "상위 지정" 모달(GanttParentModal, E-2)이 이미 확실 경로로 존재하므로 드래그 경로는 보수적으로.

### W-3. 진단용 console.log 잔존 (프로덕션 유입)
- 위치: `GanttChart.jsx:485` — `console.log('[GANTT move-task RAW]', JSON.stringify(payload))`. HANDOFF §2가 "확인 끝나면 제거"로 지시한 로그.
- 참고(간트 외, 스코프 파일): `src/api/jira/issue/IssueApi.js:243,251` — `console.log(url)` / `console.log(result)` (getProjectIssuesByUser, 기존 코드). 간트 무관이나 동일 파일이라 병기.
- 수정: 배포 검증 후 W-2와 함께 제거.

### W-4. 미일정 milestone(단일일) 막대 드래그 시 종료일 +1일 off-by-one 가능
- 위치: `ganttAdapter.js:34-36`(`diffDays = Math.max(1, ...)`), `144`(milestone duration=1), `extractScheduleChange` `ganttAdapter.js:192-201`(`due = formatISODate(eventTask.end)`).
- 메커니즘: start==end 이슈는 type='milestone'로 duration이 1로 강제된다. SVAR 내부 end = start + duration(=start+1일). 이 막대를 드래그하면 update-task의 `ev.task.end = 새start+1일` → 백엔드로 `due = 새start+1`이 저장되어 원래 단일일(start==due) 의미가 깨지고, 재조회 시 milestone→2일 task로 전환된다. (다일 task는 `duration=round((end-start)/DAY)`라 end→due가 정확히 라운드트립되어 무해 — 오차는 max(1) 클램프가 적용되는 0일짜리에서만 발생.)
- 판단: SVAR가 milestone의 update-task에서 end를 start로 주는지 start+1로 주는지는 라이브러리 실동작 확인 필요(→ 아래 미검증-3과 연동). 확인 후 오차가 재현되면, milestone/단일일 write-back에서 `due = start`로 보정하거나 duration 대신 원본 start를 due로 사용.

### W-5. 관계 편집 1건마다 프로젝트 전체 이슈 재페치 (성능)
- 위치: `GanttService.js:136-150`(`fetchGanttGraph`) → `setGanttParent`/`setGanttLink`가 매 호출마다 실행. `IssueApi.js:341-377` 페이저(maxResults=100 + nextPageToken 루프).
- 내용: 부모/링크 편집 1회 = 사이클 검증용 프로젝트 이슈 전량 페치(100건당 1 API 호출). 대규모 프로젝트에서 편집 지연 누적. 공통 경로 미수정·전용 페처 재사용(격리)은 준수(PASS).
- 참고: GANTT.md §7·HANDOFF §3-1(6)에 이미 "필요 시 클라 캐시 선검증" 개선안으로 기록된 알려진 항목. 즉시 결함 아님.

### W-6. 상위 지정 모달의 부모 후보가 필터-가시 이슈로 제한
- 위치: `GanttPage.jsx:102`(필터된 `filtered`→`svarTasks`) → `GanttChart.jsx:746` `tasks={tasks}`(=필터된 svarTasks) → `GanttParentModal.jsx:30-65`.
- 내용: 담당자/상태 필터가 걸리면 GanttParentModal의 부모 후보 목록과 자손 제외 계산이 **필터로 숨겨진 이슈를 누락**한다. 숨겨진 자손을 부모로 선택할 여지가 생기나, 서버 `detectTreeCycle`가 최종 차단(사용자에겐 실패 토스트). 데이터 무결성은 안전, UX만 불완전.
- 수정 권고: 부모 후보는 필터 무관 전체 `tasks`(계약 tasks)를 별도로 넘기거나, 필터 적용 중엔 안내.

### W-7. useSetLink onSuccess의 target 링크 전량 교체가 서버 스냅샷 기준
- 위치: `useGanttMutations.js:198-207` ↔ `GanttService.js:275-285`.
- 내용: onSuccess가 `data.predecessors`(서버가 편집시점 read 스냅샷으로 계산한 target의 선행 전체)로 캐시의 target-incoming 링크를 통째 교체한다. 동일 target에 대한 동시/근접 편집이 있으면 서버 스냅샷에 안 잡힌 링크가 순간 유실될 수 있음(단일 사용자 편집에선 안전). 방향/shape는 read link와 1:1 동일이라 정합(PASS 부분).
- 수정 권고(선택): 우려되면 onSuccess를 부분 병합 대신 `invalidateQueries`로 단순화(속도-정합 트레이드오프).

---

## PASS

### PASS-1. 링크 방향 전 경로 정합 (write ↔ read ↔ index ↔ remove ↔ 캐시패치) — 증명됨
스왑 저장이 remove의 linkId 역조회를 깨는지가 최대 관심사였음. 코드-레벨로 정합 증명:
- write(`GanttService.js:250`): 사용자 의도 source=S, target=T → Jira에 outwardIssue=T, inwardIssue=S 링크 생성(= "T가 outward/blocks 측, S가 inward 측").
- read(`GanttMapper.js:17-30`)의 규칙(테스트 `GanttMapper.test.js:20-39`가 고정): 이슈 엔트리에 `outwardIssue=Y` → `{source:그이슈, target:Y}`, `inwardIssue=Z` → `{source:Z, target:그이슈}`.
- Jira 라운드트립: 링크가 각 이슈 issuelinks에 상대 이슈의 **역할명**으로 실림 → 이슈 T엔 `{inwardIssue:S}`, 이슈 S엔 `{outwardIssue:T}`. 두 엔트리 모두 read 규칙 적용 시 `{source:S, target:T}` 산출 → 의도와 일치, dedup 후 1건.
- index(`GanttMapper.js:39-54`)는 read와 **완전히 동일한 분기 로직**을 사용 → 동일 링크에 대해 키 `S->T` 생성. 따라서 remove(`GanttService.js:268` `linkIdIndex.get(\`${source}->${target}\`)`)는 read가 렌더한 링크와 항상 같은 키로 조회 → **miss/오삭제 없음**.
- onMutate/onSuccess 캐시패치(`useGanttMutations.js:179-207`)는 id=`source->target`, type:'FS', lag:0으로 read link와 1:1 동일 shape → SVAR 내부 렌더와 방향 일치(깜빡임 없음).
- 결론: read와 index가 **같은 소스(raw issuelinks)에서 같은 로직으로 파생**되므로 write 스왑 여부와 무관하게 상호 정합. remove/캐시/사이클검증 전부 read 방향 기준으로 일관.

### PASS-2. detectTreeCycle / detectDagCycle 로직
- self(`GanttValidationService.js:22,65`), 교차프로젝트(`29,72`), 사이클 정확. 트리는 parentKey에서 상향 추적 중 issueKey 재등장 검출(`38-50`), **기존 그래프의 사이클에 대한 visited 무한루프 가드(`47`)** 있음. DAG는 target→source 도달성 DFS(`90-104`), visited 가드 있음. parentKey=null(해제)는 즉시 통과(`20`). 검증 테스트 통과.

### PASS-3. buildTasksAndLinks 병합/type/dedup 경계조건
- effectiveParent = wbsParent ?? jiraParent ?? null + 페치집합 멤버십 검증(`GanttMapper.js:155-163`), dangling/교차 방어. type: summary(자식 보유) > milestone(start==end) > task(`166-177`). links: self/dangling/중복 제거(`181-194`). 테스트(effectiveParent 4·type 3·links 6)가 경계 커버.

### PASS-4. responseWrapper·에러코드·매핑
- 4개 resolver 전부 responseWrapper 래핑(`GanttController.js:14-30`). ErrorCodes에 GANTT_* 6종 정의(`ErrorCodes.js:45-52`). `mapRelationError`(`useGanttMutations.js:84-95`)가 cycle/selfRef/crossProject + default(saveFailed) 커버, updateSchedule은 dateRange 별도 매핑(`69-74`).

### PASS-5. invoke 응답 소비 정합
- `useGanttData.js:34-47`: `result.success===true` 판정 + `unwrapGanttPayload`로 `result.content` 추출, success:false를 isError로 승격. `unwrapGanttPayload`(`ganttAdapter.js:73-81`)는 content 부재 시 안전 폴백(빈 배열) → 크래시 없음. 3개 mutation 모두 `result.success!==true` 시 throw + `err.cause=result.error`로 코드 전파(`useGanttMutations.js:32-36,121-125,170-174`).

### PASS-6. 백엔드 등록 / 쿼리키 팩토리 / 권한
- `src/index.js:27,58` registerGanttController import+호출. 쿼리키 `ganttKeys.data(projectId)` 팩토리 사용(인라인 배열 아님). 권한 canRead/canWrite('PROJECT_GANTT') 게이트(`GanttPage.jsx:22-23,110,116-127,170`), intercept의 editableRef 1차 가드 + 핸들러 canWrite 2차 가드 이중.

### PASS-7. i18n
- ko/en gantt.json에 신규 키 전부 존재 + **merge 반영 확인**(ko-KR.json/en-US.json에서 gantt.schedule.set/parent.*/tooltip.*/durationUnit/schedule.invalidRange 등 조회 성공, ko/en 병렬). ko-KR/en-US 직접 수정 아님(kr/en 소스에서 생성).

### PASS-8. placeholder 막대 + MutationObserver 무한루프 없음
- `GanttChart.jsx:252-284`: data-task-id의 ':' 접두 디코드(`263`) 후 `gantt-placeholder-bar` 토글. MutationObserver는 `childList/subtree`만 관측(`279`)하고 클래스 토글은 attribute 변경이라 **미관측 → 재진입 없음**(주석 근거 정확). rAF 30회 상한(`275`). StartCell '일정 설정' 버튼(`289-312`)·duration '-' 처리(`352-355`) 정합. placeholder는 start/end(원본 ISO) 공란 유지로 백엔드 무변경, 드래그 시에만 update-task write-back — 설계대로.

### PASS-9. 렌더 가드
- GanttChart 빈 tasks 시 `return null`(`666-668`)이 **모든 훅 이후**라 hook 순서 안전. summary만 open:true 부여(leaf null.forEach 크래시 회피, `ganttAdapter.js:134`). 오버레이 좌표계산 rAF 상한(`652` 60회).

---

## 미검증 (런타임/배포 확인 필요 — 코드로 통과 처리 불가)

1. **실 Jira 라운드트립 방향**: PASS-1은 코드+테스트+표준 Jira 표현으로 정합을 증명했으나, 이 인스턴스가 "read가 inward↔outward를 뒤집는다"는 실측 전제 위에 스왑이 얹혀 있음. `forge deploy` 후 a→b 드래그가 새로고침 후에도 a→b로 유지되는지 최종 육안 확인 필요(HANDOFF §C-4/§3-1(3) 동일 지시).
2. **SVAR move-task 실 payload**(`mode`/`target` 구조) — W-2의 부모 해제 위험 판정에 직결. `GanttChart.jsx:485` 로그로 1회 확인 후 매핑 확정.
3. **SVAR milestone update-task의 end 값**(start인지 start+1인지) — W-4 off-by-one 재현 여부 결정.
4. **W-1 의미 역전 수용 가능성** — 사용자가 Jira 네이티브 링크 UI를 병행 확인해 "역방향 blocks 표기"를 수용하는지.

---

## 요약 표

| 분류 | 수 | 항목 |
|------|----|------|
| FAIL | 1 | F-1(GANTT.md 방향 기술 stale) |
| WARN | 7 | W-1(Jira 의미 역전) W-2(move-task 부모해제 위험) W-3(진단로그 잔존) W-4(milestone off-by-one) W-5(편집당 전체페치) W-6(부모후보 필터제한) W-7(onSuccess 스냅샷) |
| PASS | 9 | 링크방향 전경로 정합·사이클검증·병합/type·responseWrapper·invoke소비·등록/쿼리키/권한·i18n·placeholder/MO·렌더가드 |
| 미검증 | 4 | 실 라운드트립 방향·move-task payload·milestone end·의미역전 수용 |

## 테스트/빌드 실행 결과
- `npx jest src/resolver/gantt`: **PASS 38/38** (GanttValidationService + GanttMapper, 2 suites, 1.6s).
- `CI=false npm run build`(static/ui): **exit 0, "build folder is ready"** (gantt/svar 에러 0, 번들 크기 경고만).
