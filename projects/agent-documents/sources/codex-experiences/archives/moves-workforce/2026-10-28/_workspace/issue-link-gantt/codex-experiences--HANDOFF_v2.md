# 이슈 연결 Gantt v2 — 세션 핸드오프 (2026-07-01)

> 브랜치 RFC-134, **전부 커밋 전**. 이전 핸드오프(`HANDOFF.md`, 6-30)는 M1~M3 커스텀필드 버전. 본 문서가 최신.

## ★ 다음 세션 즉시 참고 (2026-07-01 세션2 종료 시점, 컨텍스트 한계로 인계)

**모든 변경은 코드 반영 + 프론트 빌드 통과 상태. 사용자 배포/최종 육안확인은 미완.** 새 세션은 아래부터:

1. **링크 방향 = 해결 확정(추가 코드변경 불요).** 근거: SVAR gantt-store 기하 소스 확인 — `e2s = source.end→target.start`(호출 `Zs(link, byId(link.source), byId(link.target))`). read 로그 `[GANTT read links] ARS-11->ARS-10` = 의도 방향. `buildLinksFromIssueLinks`(inward/outward) 정상(dedup 후 단일 간선). 사용자 `결과.png`의 "뒤로 도는" 모양은 (a) swap 제거 前 만든 **옛 역방향 링크 잔존**(삭제 필요) 또는 (b) **일정 문제**(ARS-11 선행이 04-29 종료인데 ARS-10 후행이 04-15 시작 → FS 화살표가 뒤로 돔). → 옛 링크 삭제 후 새 링크로 재확인, 깔끔하려면 후행 시작일을 선행 종료 이후로.
2. **진단 로그 2개 제거 필요**(확인 끝나면): `useGanttData.js` 의 `console.log('[GANTT read links]'...)`, `GanttChart.jsx` add-link intercept 의 `console.log('[GANTT add-link raw]'...)`. (move-task 진단 로그도 필요없어지면 제거.)
3. **트리 아코디언(원하는 그리드.png = ▾/▸ 토글+들여쓰기)** = G-3 로 이미 수정(첫 컬럼 `id:'text'` + open 상태 유지). **배포 후 상위(부모) 지정하면** 그 이슈가 접기/펼치기 부모로 나타남. 지금 평면인 건 부모관계 미설정 탓. → 배포+부모지정 육안확인만 남음.
4. **좌측 그리드-차트 리사이저(구분선)**: gridWidth 방식이 SVAR에서 안 먹어 revert함. 진짜 필요하면 SVAR 내부 grid DOM 폭 직접 조작(리스크) 필요 — 현재 보류.
5. **배포 필요**: 백엔드(네이티브 링크·readOnly write·계층) + 프론트 전부. `forge deploy`. Node v24 "Premature close" 시 nvm 22.22([[project_forge_node_premature_close]]).
6. 그 뒤 **커밋**(사용자). 미커밋 파일은 §4(+ 신규 GanttScheduleModal/GanttParentModal, GANTT.md). `CALCULATION.md`는 간트 무관 제외.

**세션2 신규/추가 파일**: `src/resolver/gantt/GANTT.md`(설계문서), `static/ui/.../GanttScheduleModal.jsx`(R4), `GanttParentModal.jsx`(E-2). 수정: IssueApi/RequestJiaJson/GanttService/GanttMapper/GanttController/ErrorCodes(백), GanttChart/GanttPage/ganttAdapter/useGanttMutations/useGanttData/index.js/gantt.css + locales/kr·en/gantt.json(프).

## 0. 한 줄 요약
M3(관계 편집) 배포 실사용에서 "선이 안 나옴/이상함/느림" 3연속 버그를 잡는 중.
**의존(선후행) 링크를 Jira 커스텀필드 → 네이티브 이슈 링크("Blocks")로 전환**했고, 방향 뒤집힘·깜빡임·속도까지 순차 수정. **배포 후 최종 확인 대기.** 계층(부모-자식)은 커스텀필드(wbsParentField) 임의깊이+순환방지 유지.

## 1. 이번 세션에 한 수정 (전부 커밋 전, 코드에 반영됨)

### (A) readOnly 앱필드 write 버그 → app/field/value 엔드포인트
- 증상: `[UPDATE ISSUE FIELDS] 400 "Field does not support update 'customfield_10382'"`.
- 원인: `wbsParentField`/`predecessorsField` 는 `readOnly:true` → 표준 `PUT /issue` 로 write 불가.
- 수정: `IssueApi.updateAppCustomFieldValue({fieldIdOrKey,issueId,value})` 신규 = `PUT /rest/api/3/app/field/{id}/value` (asApp, 숫자 issueIds). `GanttService.setGanttParent` 가 이걸로 wbsParent write. `fetchGanttGraph` 에 `keyToId` 맵 추가. → 메모리 [[project_forge_readonly_field_write]].

### (B) 의존 링크 = Jira 네이티브 이슈 링크로 전환 (사용자 결정)
- `predecessorsField`(readOnly object, write 불가) 폐기 → 네이티브 issueLink "Blocks".
- 방향: 선행(source) **blocks** 후행(target) → `createIssueLink({outwardKey:source, inwardKey:target})`.
- 파일:
  - `RequestJiaJson.js`: `postJiraJson`/`deleteJira` 헬퍼 신규.
  - `IssueApi.js`: `createIssueLink`/`deleteIssueLink`/`getIssueLinkTypes` 신규, `getProjectGanttIssues` 에 `issuelinks` fields 추가·`predecessorsFieldId` 파라미터 제거.
  - `GanttMapper.js`: `parsePredecessors` 폐기 → `buildLinksFromIssueLinks`/`indexIssueLinkIds`/`BLOCKS_TYPE_NAME`. links 를 issuelinks 에서 조립. **read 방향 검증 완료(정상)**.
  - `GanttService.js`: `serializePredecessors` 제거, `setGanttLink` 네이티브 create/delete 재구현, `fetchGanttGraph` 에 `linkIdIndex`(source->target→Jira linkId 역조회, remove 용).
- 응답 shape·프론트 계약 **무변경**(Link `{id,source,target,type:'FS',lag:0}`, type/lag 표시용 고정 — 네이티브는 관계타입 미저장).
- manifest `predecessorsField` 는 **미사용 존치**(제거는 배포 파괴 위험). `getAppFieldIds` 는 여전히 해석하나 gantt 미사용.

### (C) 링크 방향 — swap 넣었다가 제거(정정)
- 최초 증상: a2→b1 드래그가 b2→a1(역방향)로 저장. → add-link intercept 에 source/target **swap** 추가.
- **그러나 swap 후 오히려 역방향**(onSuccess-patch 로 깜빡임 제거해 서버데이터만 보니 명확해짐).
- 결론: **SVAR add-link payload 는 원래 정방향(source=선행, target=후행)을 준다.** 최초 "no-swap 역방향" 관측은 네이티브 링크 배포 전 옛 번들이었을 가능성. → **swap 제거**(현재 `source=link.source; target=link.target`). 미사용 `SVAR_TO_LINK_TYPE` import 제거됨.
- ⚠️ 과거 세션에 뒤집혀 저장된 기존 링크는 삭제 후 재생성해야 정방향.
- ⚠️ **배포 후 재확인 필수** — 방향 판단이 배포 타이밍 때문에 여러 번 뒤집혔으니, forge deploy 후 a2→b1 드래그가 정방향인지 반드시 확인.

### (D) 선 뜨는 속도/깜빡임 → useSetLink 서버응답 캐시패치
- 종전: invalidate 후 전체 재조회 → 느림. 낙관적(onMutate 즉시)으로 바꿨더니 → SVAR 내부 역방향 링크(곧 취소됨)와 우리 정방향이 찰나에 겹쳐 "역→정" 깜빡임.
- 최종 수정: `useGanttMutations.useSetLink` = **낙관적 미사용 + onSuccess 로 서버응답(predecessors)으로 해당 target 링크만 부분 패치**(전체 재조회 X). SVAR 내부 역방향 취소된 뒤 반영 → 깜빡임 없음, 전체 재페치 제거로 종전보다 빠름.

### (E) Sentry 429 폭주
- 원인: `static/ui/src/index.js` `consoleLoggingIntegration({levels:["log","warn","error"]})` 가 모든 콘솔을 Sentry 전송 → CSP 노이즈 반복으로 429.
- 수정: levels `["error"]` 로 축소. (CSP `data:text/css,` 는 무해한 빈 스타일시트, 유료 아님 — 미해결로 둠, cosmetic.)

## 2. 테스트/빌드 상태
- 루트 `npm test`: **125~127 통과**(GanttMapper issuelinks 기반으로 갱신됨, GanttValidationService 순수함수 13).
- 프론트 `CI=false npm run build`: **통과**(gantt/svar 에러 0).

## 3. 전체 작업 목록 (사용자 지시 순차 + 상태)

### A. M3 관계 편집 검증·수정 (초기)
- [x] A-1 M3 통합 검증 이어가기 (경계면 정합·테스트·FAIL 0)
- [x] A-2 검증 결과 수정 (코드 FAIL 없음, deploy 게이트만 잔존이었음)

### B. 네이티브 전환 4대 요구사항
- [x] B-0 네이티브 전환 설계 (architect, `01_architect_design_v2_native.md`)
- [x] **R1** 선후행(의존) = Jira 네이티브 이슈 링크("Blocks") — predecessorsField 폐기
- [x] **R2** 이슈 계층 3단계+ (선후행 아님) — 커스텀필드 wbsParentField 임의 깊이
- [x] **R3** 계층=하위이슈 + 좌측 아코디언 트리
- [x] **R4** 미일정 이슈 일정 편집 — 완료(`GanttScheduleModal.jsx`, "시작일" 컬럼 "일정 설정" 버튼→모달→M2 재사용, i18n merge, 빌드✅). 배포 검증 대기.

### C. 배포 실사용 버그 수정 체인
- [x] C-1 선 안 나옴("Field does not support update") → readOnly 앱필드 app/field/value 엔드포인트
- [x] C-2 선 방향 역방향 → add-link swap 넣었다 제거(정정)
- [x] C-3 선 느림 → 낙관적 업데이트
- [x] C-4 재역방향 → swap 완전 제거로 정방향 확정
- [x] C-5 낙관적 재적용 → onMutate 즉시 + onSuccess 재조정 + onError 롤백
- [x] C-6 Sentry 429 폭주 → console 전송 error로 축소

### D. 문서·마무리
- [x] D-1 세션 핸드오프(본 문서)
- [x] D-2 설계/구조 문서 `src/resolver/gantt/GANTT.md`
- [x] D-3 커밋 메시지 추천

### E. 하위 이슈(WBS 부모) 지정 개선
- [ ] E-1 드래그 드롭이 하위로 안 들어감 → SVAR move-task payload 실구조 진단(임시 console.log) 후 매핑 교정. (add-link 처럼 payload 가정과 다를 가능성)
- [~] E-2 **명시적 "상위 지정" 방식**(버튼→모달 부모 선택, `@atlaskit/select`, "최상위 해제" 포함) — 🔄 frontend-engineer 구현 중. setGanttParent 재사용.

### F. 회귀/기타
- [x] F-1 **그리드↔차트 리사이저** — 커스텀(gridWidth 제어) 시도했으나 **이 SVAR 무료빌드가 `gridWidth` prop 을 무시**(그리드 안 줄고 핸들이 중앙에 떠 클릭 방해) → **revert**(작업 G에서 제거). 이 빌드에서 그리드폭 리사이저는 보류(진짜 하려면 SVAR 내부 DOM 조작 필요 — 리스크). 사용자 현재 우선순위 아님.
- [x] F-2 **토스트 알림화** — `components/feedback/ToastFlags.js`: `AutoDismissFlag`(8초+X+무한쌓임) → 일반 `Flag` + **2.5초 자동제거 + 최신 3개까지만**(MAX_VISIBLE). 앱 전역 적용. 빌드✅.

### G. 컬럼 정리·막대 툴팁·아코디언 (완료, 빌드✅ / 배포 검증 대기)
- [x] G-0 실패한 gridWidth 리사이저 revert(Gantt prop/핸들/state/css/i18n 전부 제거, 잔존 0)
- [x] G-1 **"프로젝트" 컬럼 제거**(ProjectCell/ProjectComponent import 정리)
- [x] G-2 **막대 hover 툴팁** — 신규 `GanttBarTooltip`(host mousemove 위임 → `[data-task-id]` 막대 감지 → 커스텀 툴팁 div). SVAR `<Tooltip>` 는 wx-tooltip 스타일이 CSP 차단 all.css 에만 있어 불가라 커스텀. 표시: 프로젝트/이슈키/요약/상태/담당/협업수/일정/기간.
- [x] G-3 **아코디언 ▸토글** — 원인 소스확정: SVAR 는 트리 토글/들여쓰기를 **`id==='text'` 컬럼에만** 부여. 우리 컬럼 id 가 project/key 라 아무 데도 안 붙었음(커스텀 cell 억제 아님). **해결: 이슈(첫) 컬럼 id 를 `'text'` 로 변경**. + 접기 유지: `openStateRef` + `api.on('open-task')` 로 사용자 토글 기록해 재조회 시 open 덮어씀(leaf 미변경). effectiveParent 데이터 경로는 정상(백엔드 불요). **육안 미확인 — 배포 후 실제 접기/펼치기 확인 필요.**

## 3-1. 앞으로 남은 작업 (순차)

1. [~] **E-2 상위 지정 명시 방식** — frontend-engineer 결과 검토(모달·경계면 onSetParent·빌드).
2. [ ] **E-1 드래그 드롭 하위 진입 수정** — 배포 후 드래그 1회 → 콘솔 `[GANTT move-task RAW]` payload 확인 → mode/target 매핑 교정.
3. [ ] **배포 검증(`forge deploy`)** — 한 번에 확인:
   - 선 그으면 **즉시 + 정방향 + 깜빡임 없음**(C-3/C-5).
   - Jira 이슈 화면에 "blocks/is blocked by" 표시(R1).
   - 미일정 이슈 "일정 설정"→막대 전환(R4).
   - **"상위 지정" 버튼→모달로 하위 넣기 동작**(E-2), 드래그 payload 로그 확인(E-1).
   - 기존 뒤집힌 링크는 삭제 후 재생성.
   - Node v24 "Premature close" 뜨면 nvm 22.22 전환([[project_forge_node_premature_close]]).
4. [ ] **커밋**(사용자 직접) — 미커밋 파일은 §4. `CALCULATION.md`(간트 무관)는 제외.
5. [ ] (선택) **부모(계층) 편집 속도** — `useSetParent` invalidate → 낙관/부분패치.
6. [ ] (선택) **setGanttLink 서버 지연** — 사이클 검증용 이슈 전체 페치 1회 → 클라 캐시 선검증.
7. [ ] (후속) **manifest predecessorsField 제거** — 미사용 확정 후 안전 시점에(배포 파괴 위험 검토).

## 4. 미커밋 파일 (git status, 2026-07-01)
```
M .gitignore
M src/api/jira/issue/IssueApi.js
M src/api/jira/util/RequestJiaJson.js
M src/resolver/gantt/GanttController.js
M src/resolver/gantt/GanttMapper.js
M src/resolver/gantt/GanttService.js
M src/resolver/gantt/__test__/GanttMapper.test.js
M src/utils/errors/ErrorCodes.js
M static/ui/src/index.js
M static/ui/src/pages/projectDetail/gantt/GanttChart.jsx
M static/ui/src/pages/projectDetail/gantt/GanttPage.jsx
M static/ui/src/pages/projectDetail/gantt/ganttAdapter.js
M static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
?? src/resolver/gantt/GanttValidationService.js
?? src/resolver/gantt/__test__/GanttValidationService.test.js
```
(주의: `?? src/resolver/projectProgress/CALCULATION.md` 는 별개 작업 — 간트 무관.)

## 5. 관련 문서/메모리
- 설계: `_workspace/issue-link-gantt/01_architect_design_v2_native.md`, 결정: `00_input/decision_v2.md`, 요구: `00_input/requirement_v2_native.md`
- 검증: `03_verify_report.md`(M3 섹션), 백엔드리포트: `02_backend_report_v2.md`
- 메모리: [[project_svar_gantt]](2026-07-01 업데이트), [[project_forge_readonly_field_write]], [[feedback_no_asapp]], [[project_forge_node_premature_close]]
