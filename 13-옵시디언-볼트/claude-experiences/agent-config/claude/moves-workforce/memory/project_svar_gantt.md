---
name: project-svar-gantt
description: 이슈 연결 Gantt(projectDetail/gantt) — SVAR 라이브러리 선택·크래시 함정·구현 상태
metadata: 
  node_type: memory
  type: project
  originSessionId: 71a134cd-7919-4fa0-b1ff-9260a09da4bc
  modified: 2026-08-20T06:56:01.625Z
---

프로젝트 상세 신규 **간트 탭**(`static/ui/src/pages/projectDetail/gantt/`, 백엔드 `src/resolver/gantt/`). WBS 트리 + 선후행 의존성, 관계는 Jira 커스텀필드(`wbsParentField` string, `predecessorsField` object)에 저장(Jira 3단계 계층 한계 회피). 워크스페이스 `_workspace/issue-link-gantt/`.

**Gantt 라이브러리 = `@svar-ui/react-gantt` (v2.4+, MIT, React18 OK).** ⚠️ 구 패키지 **`wx-react-gantt@1.3.1`은 GPLv3** → 상업 클로즈드소스 앱에 쓰면 안 됨(처음 이걸 깔았다가 교체). gantt-task-react는 임의깊이 트리 미지원이라 탈락.

**크래시 함정(둘 다 라이브러리 버전 무관, 소스 확인으로 잡음):**
- `Cannot read properties of null (reading 'forEach')` in `toArray` → SVAR는 `open===true`인 노드만 자식(`data`)으로 재귀하는데 leaf의 data는 null. **`open:true`는 자식 있는 summary에만** 줄 것(모든 task에 주면 leaf에서 크래시). ⚠️ 변형(2026-07-02): 프론트 필터로 **부분집합**을 넘길 땐 백엔드 type='summary' 를 믿으면 안 됨 — 필터로 자식이 전부 걸러진 summary 가 open:true 로 남아 동일 크래시. toSvarTasks 가 부분집합 기준으로 자식 보유를 재판정해 자식 없는 summary 는 'task' 강등.
- 날짜 없는 이슈는 fake 날짜 말고 **`unscheduled:true` + `<Gantt unscheduledTasks>`** 로.
- **자식 없는 summary 는 start/end 필수** — `Summary tasks must have start and end dates if they have no subtasks` throw(앱 전체 크래시). 빈 폴더(2026-07-02 실측): 가시 자식 0 인 summary 노드엔 임시 날짜(placeholderStart+1일)를 강제 부여하고 막대는 CSS(visibility:hidden)로 숨김.
- scale `format` 문자열 토큰("MMMM yyyy")은 **리터럴로 출력됨** → format을 **함수**로 줄 것.
- 빈 tasks 배열도 크래시 → 마운트 가드.

**좌측 그리드 컬럼은 작업관리 UI(`MyIssueTable.jsx`) 컴포넌트 재사용**: `ProjectComponent`·`IssueComponent`(키+타입아이콘)·`StatusComponent`(색배지)·`UserAvatar`·`AvatarStack`(코워커). 제목 컬럼 제거, 시작일=plain text. SVAR `columns[].cell`은 React FC(`{row}`로 task). cellHeight=44.

**추가 함정:** ① scale `format`은 **함수**로(문자열 토큰 "MMMM yyyy"는 리터럴 출력). ② 일정 편집은 **낙관적 업데이트+실패 롤백**(onSettled 전체재조회 jank 제거). `drag-task`=가로 일자(M2 동작), `move-task`=세로 reorder(M3, intercept 차단). ③ **CSP/CDN**: `all.css`(cdn.svar.dev @import)+react-core 런타임 `<link>` 주입이 Forge CSP 차단 → `style.css`로 바꾸고 **patch-package로 react-core CDN URL 무효화**+wx-icons 폰트 자체호스팅(`gantt/fonts/`, postinstall:patch-package). echarts를 package.json에 명시(prune 방지).

**✅ 해결(2026-06-30): 프로젝트 시작/종료/오늘 세로 표식 = 커스텀 오버레이.** SVAR **`markers`(세로선)는 PRO 유료 전용**이고 무료 빌드(`@svar-ui/react-gantt@2.7.1`)에는 marker 렌더 JS가 번들에서 빠져 있다(가격 페이지의 "vertical markers 무료" 표기는 실물과 불일치). 확정 근거: gantt-store `index.js`에서 `markers` config는 타임라인 범위(`_start/_end`) 계산 입력으로만 쓰이고(`out:["_start","_end"]`), `_markers`를 채우는 코드·`wx-marker` DOM 렌더 JS가 무료 `dist/index.es.js`에 부재. → **PRO 크랙(금지, 라이선스 위반) 대신 차트 위 커스텀 세로선 오버레이로 우회**. 핵심: SVAR task 막대 `$x` 계산식을 역추적해 동일 함수로 마커 픽셀 계산 → `contentX = round(_scales.diff(markerDate, _scales.start, _scales.lengthUnit) * cellWidth)` (init(api)의 api.getState로 `_scales` 접근). 같은 입력→같은 출력이라 막대와 픽셀 정합 구조적 보장, 줌/월일수 보정은 내부 diff가 처리. 오버레이 DOM: `.wx-chart`(가로스크롤러)·`.wx-scale`(헤더) getBoundingClientRect 측정 → 그리드 오른쪽+헤더 아래만 덮고, `.wx-chart` scroll에서 translateX로 추종, ResizeObserver 재계산, pointer-events:none. **동작 확인됨.** highlightTime(주말/공휴일 강조)은 무료지만 week 줌(`unit:'day'|'hour'` 한정)에선 미적용이라 폴백 한계. 상세: `_workspace/issue-link-gantt/HANDOFF.md`.

**진척율(progress) 막대는 읽기전용이어야 함:** SVAR가 `.wx-progress-marker`(드래그 핸들)를 노출 → 끌면 무의미한 일정 write-back+토스트 발생. `gantt.css`에 `.wx-progress-marker{display:none!important}` + update-task 핸들러에 "start/end/duration 무변경(progress-only) 이벤트 write-back 스킵" 가드. 일정 드래그 성공 토스트는 노이즈라 제거(낙관적 업데이트, onError 실패 토스트만 유지).

**M3 관계 편집(2026-06-30 구현·검증 완료, FAIL 0):** `setGanttParent({projectId,issueKey,parentKey})`→`{content:{issueKey,parentKey,effectiveParent}}`(parentKey=null=WBS override 해제, 루트 강제 아님·jiraParent 폴백), `setGanttLink({projectId,op:'add'|'remove',source,target,type:'FS',lag:0})`→`{content:{target,predecessors:[Link]}}`(Link=read와 1:1 `{id:'source->target',source,target,type,lag}`). 사이클 검증 = `GanttValidationService.js` 순수함수 `detectTreeCycle`/`detectDagCycle`(LogicalError throw, jest +13). ErrorCodes 3종(`GANTT_CYCLE_DETECTED`/`SELF_REFERENCE`/`CROSS_PROJECT_REF`) 활성→토스트 `gantt.error.cycle/selfRef/crossProject`. **object write 게이트 방어**: `GanttService.js` 상단 `PREDECESSORS_AS_STRING=false`(기본 object)+`serializePredecessors()` 단일 경유 → deploy roundtrip 실패 시 상수+manifest type만 string 절체(나머지 무변경). **SVAR 인터랙션 배선**: `GanttChart.jsx init`에서 add-link/delete-link/move-task/indent-task intercept를 editable 분기로 — **항상 return false(로컬 변형 차단)+editable시 payload로 의도추출→mutate→invalidate**(낙관적 미적용=서버권위, 사이클 등 무효상태 화면 미표시). delete-link id='source->target' 파싱(어댑터 parseLinkId), move-task mode(child/before·after/up·down/inProgress)로 newParent 산출. 훅 `useSetParent`/`useSetLink`(성공토스트 없음, R3 정책). 루트 jest 125/125·프론트 58/58·빌드 통과.

**Gantt 편집 권한: ~~seed 미등록(2026-06-30)~~ → 2026-07-06 확정 반영.** 권한 고도화([[permission-hardening]])로 `PROJECT_GANTT`가 카탈로그/시드 정식 등재(migrateFrom PROJECT). **write 권한 없으면 간트 완전 읽기 전용 — 삼중 게이트**: ① SVAR 네이티브 `readonly` prop — **무료 빌드에서도 동작함을 dist로 검증**(막대/링크/그리드 드래그·리사이즈·인라인에디터 포인터 핸들러가 `if(!readonly)` 게이트, 트리 펼침 `open-task`·선택·스크롤은 가드 밖이라 읽기 유지) ② intercept(update-task 등) false ③ 핸들러 진입점 canWrite 가드(낙관적 setQueryData 자체 미실행). 툴바에 "조회 전용" 뱃지(인라인 span, @atlaskit/lozenge 미설치).

**v2 배포 후 수정(2026-07-01):** 배포 실사용에서 M3 관계편집이 안 됨 → 두 근본 원인 수정.
- ① **readOnly 앱필드 write 불가**: `wbsParentField`/`predecessorsField`(둘 다 readOnly)는 `PUT /issue`로 못 씀("Field does not support update"). → 계층(부모)은 `updateAppCustomFieldValue`(app/field/value, asApp) 사용. 상세 [[project_forge_readonly_field_write]].
- ② **선후행 링크를 Jira 네이티브 이슈 링크로 전환**(사용자 결정): `predecessorsField` 폐기 → 네이티브 issueLink "Blocks"(선행 outward-blocks 후행, asUser `POST/DELETE /issueLink`, read `fields=issuelinks`). read 조립 `GanttMapper.buildLinksFromIssueLinks`, 삭제용 linkId 역조회 `indexIssueLinkIds`. `setGanttLink` 응답 shape·프론트 계약 무변경(type FS/lag0 표시용 고정, 네이티브는 관계타입 미저장). manifest predecessorsField는 미사용 존치(제거는 배포파괴 위험).
- ③ **링크 방향(2026-07-02 최종 확정)**: 프론트는 swap 없음(SVAR add-link payload = source선행/target후행 그대로). **백엔드 write 만 스왑** — `createIssueLink({outwardKey:target, inwardKey:source})`. 이 인스턴스의 이슈링크 read 라운드트립이 inward↔outward 를 뒤집어 돌려주는 실측 동작 때문(문서와 반대, 배포+육안 검증 완료). outward=source 로 "정상화"하면 새로고침 시 역전 재발. 삭제 인덱스(indexIssueLinkIds)는 read 와 동일 로직 파생이라 스왑과 무관하게 정합(2026-07-02 감사 증명). 트레이드오프: Jira 이슈 화면 "blocks" 표기는 간트 의도와 반대로 보임(의도된 선택, GANTT.md §6).
- ④ 프론트 Sentry(`index.js`)가 `consoleLoggingIntegration` levels 전체(log/warn/error)를 전송 → 콘솔 노이즈(CSP data:text/css 등)가 폭주해 Sentry 429. levels를 ["error"]로 축소. ~~CSP `data:text/css,`는 무해~~ → **오판이었음**: react-grid CSS 미로드 사고의 흔적(세션3 참조).
- 계층 깊이 결정: **커스텀필드(wbsParentField) 기반 임의 깊이 + 순환방지(detectTreeCycle)** 유지(네이티브 parent 3레벨 제약 회피). 상세 설계 `_workspace/issue-link-gantt/01_architect_design_v2_native.md`.

**세션2 추가(2026-07-01, 배포/육안확인 미완):**
- **트리 아코디언(▾/▸ 토글+들여쓰기)**: SVAR는 트리 토글/들여쓰기를 **첫 컬럼 중 `id==='text'` 인 것에만** 자동 부여(dist 소스 `findIndex(c=>c.id==='text')`). 컬럼 id 가 달라 토글이 아예 안 나왔음 → **이슈(첫) 컬럼 id 를 `'text'` 로** 지정해 해결. 접기유지: `openStateRef`+`api.on('open-task')` 로 사용자 토글 기록해 재조회 시 open 덮어씀(leaf 미변경). 부모 지정돼야 트리 생김.
- **SVAR 링크 기하(방향 디버깅 종결 근거)**: gantt-store dist — `e2s = source.end→target.start`, 화살표는 target. 호출 `updateLink(link, byId(link.source), byId(link.target))`. 즉 우리 Link {source=선행,target=후행}+type FS(→e2s) 가 정방향으로 그려짐이 확정. add-link/read 로그도 동일 방향(ARS-11→ARS-10) 확인 → **방향 버그 없음**. "뒤로 도는" 모양은 옛 역방향 링크 잔존 or 후행 시작<선행 종료(일정) 탓.
- **R4 미일정 일정편집**: `GanttScheduleModal.jsx` — "시작일" 컬럼 미일정행 "일정 설정" 버튼→모달(DatePicker)→`updateGanttSchedule`(M2) 재사용.
- **E-2 상위 지정**: `GanttParentModal.jsx` — `@atlaskit/select` 부모 선택(자기+자손 제외, "최상위" 옵션)→`setGanttParent` 재사용. 좌측 "상위 지정" 컬럼(canWrite시).
- **막대 hover 툴팁**: `GanttBarTooltip` — SVAR `<Tooltip>` 은 wx-tooltip 스타일이 CSP차단 all.css 에만 있어 불가 → host mousemove 위임+`[data-task-id]` 감지 커스텀 툴팁. (프로젝트 컬럼 제거하며 메타를 여기로.)
- **토스트 알림화**: `components/feedback/ToastFlags.js` — AutoDismissFlag(8초+X+무한쌓임)→ 일반 Flag+2.5초 자동제거+최신 3개(MAX_VISIBLE). 앱 전역.
- ~~그리드-차트 리사이저 보류~~ → 2026-07-02 해결(아래).
- 진단 로그: add-link/read-links 제거됨(2026-07-02). move-task RAW 만 E-1 진단용 잔존.

**세션3(2026-07-02, 전부 배포·육안 확인 완료):**
- **⚠️ 최중요: react-grid CSS 미로드 사고** — 그리드 테이블(@svar-ui/react-grid) CSS 는 react-gantt/style.css 에 미포함(원래 CDN all.css 런타임 주입 → CSP 패치가 data:text/css 로 무력화). 그 결과 셀 position:relative 소실 → 컬럼 리사이즈 그립(.wx-grip)이 문서 왼쪽에 쌓여 동작 불능, 기본 구분선도 소실. tunnel 개발 땐 CDN 로드로 멀쩡 → 배포 후 조용히 깨짐("원래 되던 기능"의 정체). 콘솔 `data:text/css` CSP 노이즈 = 이 사고의 흔적(**무해 아님** — 세션2 ④ 의 "무해" 판단은 오판). 해결: `GanttChart.jsx` 에서 `@svar-ui/react-grid/style.css` 를 react-gantt CSS **앞에** 직접 import. 진단 결정타: iframe 콘솔(`$0.ownerDocument`)에서 `elementFromPoint` → `sidebar__nav`.
- **컬럼 폭 조절**: 위 CSS 복구로 네이티브 그립 동작. 그립 상시 가시화 CSS(회색 1px, hover 파랑 3px, 화살표 장식 숨김). 배선(resize-column→set-columns)은 무료빌드에 원래 완비.
- **그리드↔차트 스플리터**: 무료빌드도 스플리터(ft)가 항상 렌더되고 drag→exec('resize-grid')→gridWidth→flex-basis 로 완전 동작 — 4px 연회색이라 안 보였을 뿐. 가시화(hover 파랑)+히트영역 ±3px+중앙 접기버튼 숨김. (과거 F-1 실패는 gridWidth 를 <Gantt> prop 으로 넘겨서 — 받지 않는 prop이라 무시된 것.)
- **그리드 구분선(원하는 그리드.png)**: 헤더=컬럼 세로선+하단선, 바디=행 가로선만(셀 세로선 없음, 사용자 결정). 실 DOM: `.wx-header-wrapper`(주의: `.wx-header` 는 없음 — 라이브러리 CSS 의 죽은 규칙), `.wx-body .wx-row`. CSS 변수(--wx-table-*) 방식은 조상별 별칭 재계산 때문에 실패 → 직접 border+!important.
- **그리드 정렬 비활성**: gantt-store 가 미지정 컬럼에 `sort` 기본 true 주입(`sort:n.sort??!0`) → 헤더 클릭 시 순서 뒤틀림. 전 컬럼 `sort:false` 명시(사용자 결정).
- **미일정 placeholder 막대**: 미일정 leaf 를 unscheduled 영역 대신 **드래그 가능한 회색 점선 막대**(프로젝트 시작일 위치·3일, `placeholder:true`)로 렌더 → 드래그 시 M2 write-back 으로 실제 일정 저장. '일정 설정' 버튼(R4 모달)과 병행. 막대 스타일은 DOM 클래스 부착(data-task-id 는 `:` 접두 인코딩 — 역디코드 필수, 툴팁과 동일)+rAF+MutationObserver. 비분할 막대 배경은 `.wx-segment` 아닌 **막대 요소 자신**(.wx-task:not(.wx-split)).
- **전수 감사**(`_workspace/issue-link-gantt/04_full_audit_report.md`): FAIL 1(GANTT.md 방향 서술 오류→수정), WARN 7(W-2 move-task 부모해제 강행→조회실패시 스킵 가드 적용, W-3 로그 제거, 나머지 문서화/보류). 링크 스왑↔삭제 정합은 PASS 증명.
- 상세 인계: `_workspace/issue-link-gantt/HANDOFF_v2.md` ★섹션(세션2 기준 — 세션3 내용은 본 메모리와 GANTT.md 가 최신).

**세션4(2026-07-07, 하네스 파이프라인 — 검증 통과·E2E 미수행):** 폴더 개선 2건, 워크스페이스 `_workspace/gantt-folder-links/`.
- **폴더 뎁스별 색상**: `synthesizeFolderNodes` 가 parentFolderId 체인으로 `folderDepth`(1-base) 계산 → GanttChart DOM 후처리에 `gantt-folder-depth-{1|2|3}`(3+ 캡) 토글 → gantt.css 농도 그라데이션(행 배경 라이트/다크).
- **색상(같은 날 2차 결정으로 확정)**: DMOVE 틸([[dmove-brand-palette]])은 **폴더 레이어 전용** — 폴더 막대 depth1 300 #6FD3C6→depth2 100→depth3+ 50(글자·아이콘 900 다크 틸, 아이콘은 color="currentColor"로 .gantt-folder-name 라이트 700/다크 300 상속), 행 배경 틸 틴트. **이슈 막대는 전면 틸 적용했다가 사용자 요청으로 기존 색 원복**(task 블루 #4C9AFF/#0747A6, summary 그린, milestone 퍼플, 그립/스플리터 hover 블루). 마커(시작초록/종료빨강/오늘파랑)·placeholder 회색 유지.
- **폴더 링크(선후행)**: 폴더가 한쪽 이상 끝점인 링크 = **앱 DB `gantt_folder_link`**(마이그레이션 v009, 복합 PK 멱등), 이슈↔이슈만 네이티브 유지. 끝점은 네임스페이스 문자열(`folder:<uuid>`|이슈key) 그대로 저장. **스왑 없음(정방향)** — 스왑은 Jira issueLink 라운드트립 전용. resolver `setGanttFolderLink({op,source,target})`, read 는 `content.folderLinks`(별도 키 — 기존 links 오염 방지). 순환은 혼합 그래프(이슈∪폴더 링크)에서 detectDagCycle 무수정 재사용, containment(폴더계층/소속/WBS)는 의존 간선 아님. 프론트는 add/delete-link 인터셉트 `folder:` 접두 분기 + `useSetFolderLink` 낙관 패치(invalidate 금지). 폴더 삭제 시 끝점 링크 삭제, 프로젝트 cascade 에 folder_link 편입. 백엔드 jest 182·프론트 64·빌드 통과, 브라우저 E2E(드래그 왕복·순환 토스트·뎁스 색 렌더) 미수행.

**하단 잘림 근본 원인(2026-08-12 해결):** SVAR 테마(WillowDark 등)가 차트를 `.wx-theme` div로 감싸는데 SVAR CSS에 이 래퍼의 높이 규칙이 **하나도 없다** → `.wx-gantt{height:100%}`가 auto로 무너져 간트가 콘텐츠 높이로 커짐 → 내부 세로 스크롤 사망 + 마지막 행이 가로 스크롤바 두께만큼 항상 잘림(도달 불가) + sticky 헤더가 페이지 상단에 붙음. 해결: `gantt.css`에 `.gantt-svar-host > .wx-theme{height:100%}` 한 줄. **호스트 높이 계산(GanttChart.jsx의 HOST_BOTTOM_*)은 이 CSS 규칙에 의존** — 규칙이 없으면 계산값이 전부 무시된다. 하단 여백은 margin 48(체감 72) + reserve 자동 파생(104) 구조로 margin과 reserve가 따로 놀면 안 됨.

**하단 밀착 재발(2026-08-20 해결):** 위 8-12 fix에도 "간트가 페이지 바닥에 딱 붙는" 증상 재발 — 실측(화면 디버그 오버레이)으로 `.wx-theme` 래퍼가 **두 겹**임을 확인(`<Willow>` 한 겹 + `<Gantt>` 내부 한 겹, v2.7.1). 바깥 래퍼만 100%를 받아 383px, 안쪽 래퍼는 auto→1684px로 콘텐츠 높이 성장 → 호스트를 뚫고 넘침. **넘친(overflow) 자손에는 호스트 margin-bottom이 안 먹으므로** 스크롤 끝 = 간트 바닥 = 페이지 바닥(여백 0). 해결: 선택자를 `.gantt-svar-host > .wx-theme, .gantt-svar-host > .wx-theme > .wx-theme` 두 단으로 확장. 진단 교훈: Forge iframe은 크로스오리진이라 브라우저 확장 콘솔/JS로 내부 DOM 접근 불가 → **화면에 fixed 디버그 오버레이를 그려 스크린샷으로 읽는** 방법이 유효(forge tunnel은 static/ui/build 산출물을 서빙하므로 수정 확인엔 `npm run build` 필요).

**구현 상태(2026-06-30):** M1+M2+M3+작업관리 컬럼+마커 오버레이 전부 동작·검증 완료(FAIL 0). R1(마커 오버레이)/R2/R3 완결. **전부 커밋 전**(백엔드+프론트+manifest+patches+fonts+locales). 남은 deploy/E2E 게이트: predecessorsField object roundtrip, SVAR 이벤트 payload 실형태(add-link.link.type/delete-link.id/move-task)·api.getLink·getTask 실재. 후속 기능: 윈도우/증분 로딩(architect부터), 커밋 정리. [[feedback_no_asapp]] 준수(전부 as='user'). 배포는 forge deploy([[project_forge_node_premature_close]] 주의).
