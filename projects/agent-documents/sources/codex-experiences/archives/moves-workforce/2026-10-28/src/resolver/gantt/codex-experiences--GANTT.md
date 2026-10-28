# 이슈 연결 Gantt — 설계/구조 문서

프로젝트 상세 **작업관리 탭의 간트 뷰**에 대한 데이터 모델·흐름·주요 결정을 관리하는 문서.
코드: 백엔드 `src/resolver/gantt/`, 프론트 `static/ui/src/pages/projectDetail/gantt/`.

> 현행화 기준: 2026-08-10 / 소스 `f6e521c`
> **트리 뷰와 뷰 전환 셸은 별도 문서**: `static/ui/src/pages/projectDetail/work/WORK_VIEWS.md`
> (트리는 이 문서의 데이터·mutation·모달을 그대로 재사용한다 — 백엔드가 따로 없다)

---

## 1. 개요

프로젝트 이슈를 간트 차트로 시각화하고, 일정/관계를 편집한다.
- **라이브러리**: `@svar-ui/react-gantt` (MIT). ⚠️ `wx-react-gantt`(GPL) 금지.
- **읽기**: 프로젝트 이슈 1패스 페치 → Task/Link 조립 + 폴더 레이어(앱 DB) 병합.
- **쓰기**: 일정 드래그 / 부모-자식(계층) / 선후행(의존) / 폴더 / 그리드 인라인 편집.

### 위치와 셸

간트는 독립 탭이 아니라 **작업관리 탭의 세 뷰 중 하나**다(2026-07-22 재편: `[목록 | 트리 | 간트]`).
`ProjectWorkPanel`이 셸로서 ① `React.lazy` + Suspense 경계 ② 담당자·상태·프로젝트 필터 소유(트리와 공유)를 담당한다.
`GanttPage`는 `filter` prop 미주입 시 로컬 state 로 동작 — 셸 밖 단독 사용 하위호환. 자세한 계약은 `WORK_VIEWS.md` §1.

### 권한 (2026-07-23 통합)

`PROJECT_GANTT` 카탈로그 키를 쓰지 않고 **`PROJECT`로 통합**했다(미사용 키는 남겨둠).

| 대상 | 판정 |
|------|------|
| 조회 `getProjectGanttData` | `R('PROJECT','detail')` — 프론트 `canRead('PROJECT')` |
| 쓰기 resolver 9종 | `W('PROJECT','inherited')` — 프론트 `canWrite('PROJECT')` |

프론트는 `canWrite`로 편집 UI 노출을 1차 가드하고, 서버 `guardedDefine` + `PermissionMap`이 최종 판정이다.
추가로 **Jira 자체 권한**(Edit/Schedule/Assign/Link Issues)은 mutation 훅이 `fetchJiraProjectPermissions`로 사전 확인해 **확정 거부(false)만** 차단한다(미확인 `null`은 통과 — fail-open 이 아니라 "판정 불가는 서버에 맡긴다").

---

## 2. 두 가지 "관계" — 저장 방식이 다르다 (핵심)

| 관계 | 의미 | UI 표현 | 저장 방식 | API / 필드 |
|------|------|---------|-----------|-----------|
| **선후행(의존)** — 이슈↔이슈 | A가 끝나야 B 시작 | 막대 사이 화살표 | **Jira 네이티브 이슈 링크** | `POST/DELETE /rest/api/3/issueLink`, 타입 **"Blocks"**, read `fields=issuelinks` |
| **선후행(의존)** — 폴더 포함(2026-07-07) | 폴더가 한쪽 이상 끝점 | 막대 사이 화살표 | **앱 DB (Forge SQL)** | `gantt_folder_link` 테이블, resolver `setGanttFolderLink`, read `content.folderLinks` |
| **계층(부모-자식)** | 하위 이슈(구성) | 좌측 트리 들여쓰기 | **이슈 엔티티 프로퍼티** | `movesRms.wbsParent` (+ Jira 네이티브 `parent` 폴백) |
| **폴더 소속/중첩** | 앱 전용 묶음 | 폴더 노드 아래 | **앱 DB (Forge SQL)** | `gantt_folder`, `gantt_folder_issue` |

### 왜 이렇게 나눴나 (결정 근거)
- **선후행 = 네이티브 링크**: 원래 커스텀 필드(`predecessorsField`, object)에 저장했으나 그 필드가 `readOnly: true`라 표준 API로 write 불가(`400 "Field does not support update"`) → 선이 저장/표시 안 됨. 네이티브 이슈 링크로 전환해 **표준 API(asUser) 정상 write + Jira 이슈 화면 자동 연동**. (`predecessorsField`는 미사용 존치 — manifest 제거는 배포 파괴 위험.)
- **계층 = 앱 저장**: Jira 네이티브 계층은 Epic>Story>Sub-task **3레벨 + 인접 레벨만** 허용이라 임의 깊이 불가. **3단계 이상 자유 중첩**을 위해 앱이 따로 관리한다. 순환은 앱에서 방어(`detectTreeCycle`).
- **계층 저장소 이전(앱 커스텀 필드 → 이슈 프로퍼티)**: 원래 `wbsParentField`(readOnly 앱 커스텀 필드, `PUT /app/field/{id}/value`)였으나 **팀 관리형 프로젝트에서는 Forge 커스텀 필드가 `fields` 응답에서 통째로 빠진다**. `movesRms` 이슈 엔티티 프로퍼티로 이전해 회사/팀 관리형 모두 커버한다.
  - read: `GanttMapper`가 `issue.properties.movesRms.wbsParent`에서 직접(빈 문자열 → null 정규화)
  - write: `mergeIssueProperty(issueKey, { wbsParent })` — **read-merge-write** 로 `coworkers` 등 다른 키 보존. `writeIssueProperty`는 전체 교체라 기존 값을 날린다.
  - 프로퍼티 API 는 `asApp`(프로퍼티 write 권한이 앱 컨텍스트) — [[feedback_no_asapp]]의 예외 항목.

---

## 3. 데이터 계약 (경계면)

### 읽기: `getProjectGanttData({ projectId })`
→ `{ content: { tasks:[Task], links:[Link], meta, folders, folderIssues, folderLinks } }`

- **Task**: `{ id, key, issueId, summary, start, end, type, issueType, issueTypeIcon, project, jiraParent, wbsParent, effectiveParent, progress, progressPercent, originalEstimateSeconds, assignee, statusKey, statusCategory, coworkers }`
  - `effectiveParent = wbsParent ?? jiraParent ?? null` (페치 집합에 있는 것만; §6 병합)
  - `type`: 자식 있으면 `summary`, start==end면 `milestone`, 그 외 `task`
  - `issueId` = 숫자 Jira id(string). **협업자 write 전용** — 없으면 협업자 편집을 스킵한다.
  - `originalEstimateSeconds`/`progressPercent` = 그리드 "계획 작업량(MD)"·"처리율" 컬럼용. MD 환산은 `설정.hourRate`(기본 8) 기준.
- **meta**: `{ total, fetchedAt, projectStart, projectEnd }` — 프로젝트 시작/종료는 마커·placeholder 위치용 best-effort(조회 실패해도 본 데이터 무영향).
- **folders**: `[{ id, name, parentFolderId, sortOrder }]` (id=plain UUID, 루트 `parentFolderId=null`)
- **folderIssues**: `{ [issueKey]: folderId }` — **직접 소속만**(소속 없는 이슈는 키 자체가 없음)
- **Link**: `{ id:'source->target', source, target, type:'FS', lag:0 }`
  - `source`=선행(predecessor), `target`=후행(successor)
  - ⚠️ 네이티브 링크는 관계타입(FS/SS/…)·lag를 저장 못함 → **type='FS'/lag=0 은 표시용 고정값**
- **folderLinks**(2026-07-07): Link 와 동형. **폴더가 한쪽 이상 끝점인 선후행 링크**(앱 DB `gantt_folder_link`).
  - 끝점 = 네임스페이스 문자열: `folder:<uuid>` | 이슈 key (SVAR 노드 id 와 동일 — 렌더 조인키).
  - **스왑 없음(정방향 저장/읽기)** — §3 링크 write 스왑은 Jira issueLink 라운드트립 전용, 앱 DB 무관.
  - best-effort: SELECT 실패(마이그레이션 미적용) 시 `folderLinks:[]` 폴백(무회귀).

### 쓰기 — resolver 10종 (`GanttController`, 전부 `W('PROJECT','inherited')`)

| resolver | 입력 | 응답 |
|----------|------|------|
| `updateGanttSchedule` | `{ projectId, issueKey, start, due }` | `{ content:{ issueKey, start, due } }` |
| `setGanttParent` | `{ projectId, issueKey, parentKey }` (null=해제) | `{ content:{ issueKey, parentKey, effectiveParent } }` |
| `setGanttLink` | `{ projectId, op:'add'\|'remove', source, target }` | `{ content:{ target, predecessors:[Link] } }` |
| `createGanttFolder` | `{ projectId, name, parentFolderId }` | `{ content:{ folder:{ id, name, parentFolderId, sortOrder } } }` |
| `renameGanttFolder` | `{ projectId, folderId, name }` | `{ content:{ folderId, name } }` |
| `moveGanttFolder` | `{ projectId, folderId, parentFolderId }` (null=루트) | `{ content:{ folderId, parentFolderId } }` |
| `deleteGanttFolder` | `{ projectId, folderId }` | `{ content:{ folderId, reparentedTo, movedIssueKeys, movedFolderIds } }` |
| `setGanttIssueFolder` | `{ projectId, issueKey, folderId }` (null=해제) | `{ content:{ issueKey, folderId } }` |
| `setGanttFolderLink` | `{ projectId, op:'add'\|'remove', source, target }` (끝점 ≥1개 `folder:` 필수) | `{ content:{ op, source, target, link:Link } }` |

- **일정 write** = 표준 필드(`customfield_10015`=시작, `duedate`=종료) → `PUT /issue` (asUser)
- **부모 write** = 이슈 프로퍼티 `movesRms.wbsParent` → `mergeIssueProperty`(read-merge-write, asApp). §2 참조.
  ⚠️ 과거 `PUT /rest/api/3/app/field/{id}/value`(readOnly 앱필드) 경로는 폐기됐다 — 팀 관리형 미지원 때문. 새 코드에서 이 경로로 wbsParent 를 쓰지 말 것.
- **폴더 write** = 전부 앱 DB(Forge SQL), **Jira write 0**. 이름 120자 제한(DDL `VARCHAR(120)` 동기), 형제 `sortOrder = max+1`, 모든 쿼리 `project_id` 스코프.
  - **삭제는 승계**(이슈 절대 삭제 금지): 자식 이슈·하위폴더를 삭제 폴더의 **부모로 재소속**(부모가 없으면 이슈는 소속 해제, 하위폴더는 루트로). TiDB 트랜잭션 미지원 → 순차 멱등 UPDATE/DELETE 조합(재실행 안전).
  - 단, 그 폴더가 끝점인 **폴더 링크는 승계 없이 삭제**한다(§6).
- **링크 write** = 네이티브 issueLink. add=`createIssueLink(outward=target, inward=source)` — ⚠️ **outward/inward 스왑 저장**(GanttService.js:247-250 주석 참조). 이 인스턴스의 read 라운드트립이 inward↔outward를 뒤집어 돌려주는 실측 동작(2026-07-01 배포 검증) 때문에, write를 뒤집어 넣어야 read(`buildLinksFromIssueLinks`)가 다시 `{source, target}` 정방향으로 복원한다. outward=source로 "고치면" 새로고침 시 방향 역전이 재발한다. remove=source/target로 linkId 역조회 후 `deleteIssueLink`(인덱스가 read와 동일 로직에서 파생되므로 스왑과 무관하게 정합).

---

## 4. 편집 흐름

### 4-1. 선 연결(선후행)

```
[드래그 A끝→B시작]
  └ SVAR add-link 이벤트 → GanttChart intercept
       payload.link = { source:A, target:B }   ← SVAR가 정방향으로 줌(swap 안 함)
       → onAddLink({ source:A, target:B, type:'FS' })
       → return false (SVAR 자체 로컬 렌더 차단, 렌더는 우리 데이터로 통제)
  └ GanttPage.handleAddLink → setLink.mutate({ op:'add', source:A, target:B })
       ├ onMutate(낙관적): 캐시 content.links 에 {id:'A->B',source:A,target:B,type:'FS'} 즉시 추가
       │                  → 화살표 즉시 렌더 (+ 롤백용 prev 스냅샷)
       ├ mutationFn: invoke('setGanttLink') → 백엔드 사이클검증(detectDagCycle) → POST issueLink
       │             (백엔드가 outward=target/inward=source 로 스왑 저장 — §3 링크 write 참조)
       ├ onSuccess: 서버 응답 predecessors 로 해당 target 링크 재조정(방향 동일 → 무변화, 전체 재조회 X)
       └ onError: prev 로 롤백(사이클 등 거부 시 선 사라짐) + 에러 토스트
```

- **방향**: **프론트는 swap 하지 않는다** — SVAR payload(`source=선행, target=후행`)를 그대로 서버 계약으로 전달하고, 캐시(onMutate/onSuccess)도 같은 `{source, target}` shape 이다. 스왑은 오직 **백엔드 write 의 Jira 저장 표현**(outward/inward)에만 존재하며 계약 shape 에는 드러나지 않는다(§3).
- **삭제**: SVAR delete-link 이벤트 → link.id('source->target') 파싱 → `setGanttLink({op:'remove'})`.
- **폴더 분기**: add/delete-link 인터셉트에서 끝점의 `folder:` 접두를 보고 이슈 경로(`setGanttLink`) / 폴더 경로(`setGanttFolderLink`)로 갈린다.

### 4-2. 좌측 그리드 인라인 편집

좌측 그리드 컬럼: 이슈 · 상태 · 담당자 · 협업자 · 시작일 · 기간 · 계획 작업량(MD) · 처리율 (+ `canWrite`면 상위 지정 액션).
셀 단위 편집은 `GanttGridEditCells.jsx`, write 는 아래 훅.

| 편집 | 훅 | 경로 | 비고 |
|------|----|------|------|
| 담당자 | `useUpdateAssignee` | `assignIssue` (Jira 직접, asUser) | Assign Issues 권한 확정 거부만 차단 |
| 협업자 | `useUpdateCoworkers` | `invoke('updateProjectIdField')` | **숫자 `issueId` 필수**. 값이 없으면 write 스킵 |
| 계획 작업량(MD) | `useUpdatePlannedMd` | `updateIssue` `fields.timetracking` | MD→시간 환산 = `md × hourRate` |
| 일정 | `useUpdateSchedule` | `PUT /issue` | 막대 드래그/리사이즈·모달 공용 |

- **timetracking 은 remaining 동봉 필수**: `originalEstimate`만 보내면 Jira 검증 400. 기존 remaining 을 단건 GET 해서 `buildTimetrackingPayload`로 함께 보낸다(Task 계약에 remaining 이 없어 GET 1회 발생).
- **시간 추적 가용 여부를 사전 판정하지 않는다** — editmeta 샘플 판정이 오탐이었다. 실제 400 을 `isTimeTrackingUnsupportedError`로 잡아 안내로 매핑한다(시도 기반이라 오탐 없음).
- 진척율(progress) 막대 드래그 핸들은 비활성이고 progress-only 이벤트는 write 를 스킵한다.

### 4-3. 낙관 갱신 정책 (훅별로 다르다 — 이유가 있다)

| 훅 | 낙관 | 성공 후 | 왜 |
|----|------|---------|-----|
| `useUpdateSchedule` | 캐시 task 일정 패치 | 토스트만 | 막대 제자리 유지, 재조회 jank 제거 |
| `useSetParent` | 패치(**클라 사이클 가드**로 자기/자손 지정은 스킵) | **서버 확정 응답으로 부분 패치**, invalidate 금지 | 재조회가 옛 값을 박제하던 이력(§6) + 전체 재조회보다 빠름 |
| `useSetLink` | `content.links` add/remove | 서버 `predecessors`로 해당 target 재조정 | 방향이 같아 깜빡임 0 |
| `useSetFolderLink` | `content.folderLinks` 패치 | invalidate 금지 | 위와 동일 |
| `useUpdateAssignee` / `useUpdateCoworkers` / `useUpdatePlannedMd` | 필드 패치 | 토스트(+MD 는 progress 확정 패치), **invalidate 금지**(2026-08-12) | 셀 편집 1회당 최고비용 resolver 전량 재조회였다. 특히 협업자는 앱 커스텀필드 write 직후 JQL 재조회라 §6 위반. 낙관 패치를 서버 shape 으로 정규화(assignee/coworkers)하고, MD 는 write 하는 시간값에서 역산 + `progress` 를 `computeProgress` 와 같은 식으로 재계산(spent 는 remaining 조회용 단건 GET 재사용)해 안전망을 대체 |
| ↑ 세 훅의 롤백 | — | **필드 단위 롤백** | 전체 쿼리 스냅샷을 되돌리면 동시 편집된 **다른 셀의 성공 낙관값까지** 덮는다(invalidate 를 걷어낸 뒤로는 그 오염이 남는다). `onMutate` 는 "그 이슈의 그 필드"만 스냅샷한다 |
| 폴더 5종 | — | 일반 invalidate | 앱 DB 전용이라 인덱스 지연 없음 |

- 전부 `onError`에서 `prev` 스냅샷 롤백 + 에러 토스트.
- **성공 토스트 배칭**(`useGanttToastBatcher`, 2026-07-07): 드래그성 연발 성공 알림(`{ batch:'schedule'|'parent'|'link' }`)만 2.5초 모아 1건으로 flush 한다. 에러와 비배치 성공은 즉시 통과. 훅에는 원본 toast 대신 배처를 내려준다.

---

## 5. 검증 (순수 함수, `GanttValidationService.js`, jest 대상)

- `detectTreeCycle({ parentByKey, keySet, issueKey, parentKey })` — 부모 재지정 시 self/교차프로젝트/트리 순환 차단.
- `detectDagCycle({ links, keySet, source, target })` — 링크 add 시 self/교차프로젝트/DAG 순환 차단.
- `detectFolderCycle({ folders, folderId, parentFolderId })` (`GanttFolderValidationService.js`) — 폴더 중첩 이동 시 self/자손 순환 차단.
- 위반 시 `LogicalError` throw → `ErrorCodes`: `GANTT_SELF_REFERENCE` / `GANTT_CROSS_PROJECT_REF` / `GANTT_CYCLE_DETECTED` / `GANTT_FOLDER_CYCLE_DETECTED` / `GANTT_FOLDER_NOT_FOUND` / `GANTT_FOLDER_NAME_REQUIRED` / `GANTT_FOLDER_NAME_TOO_LONG` / `GANTT_FOLDER_LINK_INVALID` → 프론트 토스트(`gantt.error.*`).
- **서버가 최종 권위**다. 프론트(트리 DnD `resolveTreeDrop`, `useSetParent` 낙관 가드)의 사전 차단은 무효 상태의 순간 노출을 막기 위한 것이지 검증의 대체가 아니다 — 거부되면 롤백된다.

---

## 6. 주요 함정 / 결정 (유지보수 주의)

- **SVAR markers(세로선)는 PRO 유료** → 무료 빌드엔 렌더 JS 부재. 프로젝트 시작/종료/오늘 표식은 **커스텀 오버레이**로 직접 그림(`GanttChart.jsx` computeOverlay).
- **CSP/CDN**: `all.css`(cdn.svar.dev @import)·react-core 런타임 `<link>` 주입이 Forge CSP 차단 → `style.css` + patch-package로 CDN URL 무효화 + wx-icons 폰트 자체호스팅(`gantt/fonts/`).
- **부모 막대 렌더 정책(사용자 결정 2026-07-02)**: "포함(롤업 요약막대, 초록)" 개념은 **Jira 네이티브 하위 이슈(jiraParent) 자식을 가진 부모에만** 적용. **앱 정의 WBS(wbsParent, 상위 지정) 부모는 트리 표시(들여쓰기+▾토글)만 하고 독립 task 막대(파랑, 자기 일정) 유지** — 각자 독립적 작업 단위로 인정. 판정은 `ganttAdapter.toSvarTasks` 가 자식의 연결 경로(wbsParent 경유 vs jiraParent 폴백)로 부모를 두 집합(anyParentSet/nativeParentSet)으로 나눠 수행(백엔드 type='summary' 는 무시하고 프론트 재판정). **WBS 부모에도 롤업을 적용할지는 추후 논의 항목**(§7).
- **write 직후 search 재조회 금지(인덱스 지연)**: `PUT /app/field/{id}/value` 는 즉시 저장되지만(직접 GET 은 새 값) **search/jql 인덱스 반영은 수 초~ 지연**된다. write 직후 invalidate→search 재조회하면 옛 값이 돌아와 staleTime 캐시로 박제 → "상위 지정해도 하위로 안 들어감" 버그의 실제 원인(2026-07-02 실측: direct GET=ZUNU-2, 간트 재조회=빈값). 해법: `useSetParent` 는 즉시 invalidate 대신 **서버 확정 응답(content)으로 캐시 부분 패치**(useSetLink 와 동일 패턴).
  wbsParent 가 이슈 프로퍼티(`movesRms`)로 이전된 뒤에도 **이 정책은 유지한다** — 확정 응답 패치가 재조회보다 빠르고, 불필요한 전체 재조회를 피한다. 원 함정(앱 커스텀필드 write 후 search 로 읽기)은 다른 화면에도 그대로 적용되는 일반 함정이다.
- **react-grid CSS 는 별도 import 필수**: 그리드 테이블(@svar-ui/react-grid)의 CSS 는 `react-gantt/style.css` 에 **포함되지 않는다**(원래 런타임 CDN all.css 주입 → CSP 패치로 무력화). 미로드 시 셀 `position:relative` 부재로 컬럼 리사이즈 그립(.wx-grip)이 문서 왼쪽에 쌓이고 기본 구분선도 사라진다 — tunnel 개발 땐 CDN 이 로드돼 멀쩡하다가 배포 후 조용히 깨지는 함정(2026-07-02 발견). `GanttChart.jsx` 에서 `@svar-ui/react-grid/style.css` 를 react-gantt CSS **앞에** import(캐스케이드에서 gantt 오버라이드 우선). 콘솔의 `data:text/css` CSP 차단 노이즈가 이 패치의 흔적.
- **`open:true`는 summary(자식 보유)에만** — leaf에 주면 `null.forEach` 크래시. 빈 tasks도 마운트 가드.
- **scale `format`은 함수로** — 문자열 토큰("MMMM yyyy")은 리터럴 출력됨.
- **진척율 막대 드래그 핸들** 비활성(`.wx-progress-marker{display:none}`) + progress-only 이벤트 write 스킵.
- **asApp 최소화**([[feedback_no_asapp]]): 읽기/일정/링크는 asUser. 예외는 wbsParentField write(readOnly 앱필드는 app/field/value 엔드포인트가 asApp 필수).
- **협업 모드(아키텍처 §4.4 ⑥)**: `getProjectGanttData` 의 읽기 권한 주체는 서버가 `CollabAccess.resolveCollabReadAuthority` 로 정한다(켜짐+참여자만 `'app'`, 그 외·판정 실패는 `'user'`). `fetchGanttGraph` 는 쓰기 검증용이며 협업 모드와 무관하게 본인 자격이다 — `as` 를 넘기지 말 것.
- **낙관적 업데이트 + 방향**: 링크 낙관 반영은 프론트 낙관값·서버 read 링크가 같은 `{source, target}` 방향일 때만 깜빡임이 없다. 현재 구조(프론트 무스왑 + 백엔드 write 스왑 + read 복원)가 이 조건을 만족한다. 프론트에 swap 을 넣거나 백엔드 스왑을 "정상화"하면 "역→정" 깜빡임/새로고침 역전이 재발한다.
- **폴더 링크(2026-07-07)**: 폴더가 끝점인 선후행은 앱 DB(`gantt_folder_link`, 마이그레이션 v009). 순환 검증은 **혼합 그래프**(이슈 링크 ∪ 폴더 링크)에서 `detectDagCycle` 재사용 — 폴더 계층(parentFolderId)/소속(folderIssues)/WBS 는 의존 간선이 아니므로 판정 미포함("폴더↔자기 자손 이슈 링크" 허용, containment ≠ dependency). 폴더 삭제 시 그 폴더가 끝점인 링크는 승계 없이 삭제. 프론트는 add/delete-link 인터셉트에서 `folder:` 접두로 이슈/폴더 경로 분기, 캐시는 `content.folderLinks` 낙관 패치(invalidate 금지).
- **폴더 뎁스별 색상(2026-07-07)**: `synthesizeFolderNodes` 가 `folderDepth`(1-base) 계산 → GanttChart DOM 후처리가 막대·행에 `gantt-folder-depth-{1|2|3}` 토글(3+ 캡) → gantt.css 농도 그라데이션(depth1 진함 → depth3+ 연함, 라이트/다크).
- **색상(2026-07-07 사용자 확정)**: DMOVE 틸 팔레트(50 #E9F7F4 ~ 900 #103F3A)는 **폴더 레이어 전용** — 폴더 막대 depth1 300 → depth3+ 50(글자 900 다크 틸), 행 배경 틸 틴트. **이슈 막대는 기존 유지**(task 블루 #4C9AFF·채움 #0747A6, summary 그린 #00875A, milestone 퍼플 #6554C0, 그립/스플리터 hover 블루). 시작(초록)/종료(빨강)/오늘(파랑) 마커와 placeholder(회색 점선)도 유지.
- **빈 폴더(가시 자식 0)**: SVAR 는 자식 없는 `summary` 에 start/end 를 **강제**한다(없으면 앱 전체 크래시). 어댑터가 placeholder 날짜(1일)를 넣어 크래시를 막고, `folderEmpty` 플래그로 GanttChart 가 `gantt-folder-empty-bar` 클래스를 붙여 CSS 로 막대만 숨긴다(사용자 결정: 빈 폴더는 이름만). `open` 은 미부여(자식 0 → leaf 크래시 가드).
- **필터는 이슈에만 걸린다**: 폴더는 `tasks` 에 없는 합성 노드라 담당자/상태/프로젝트 필터가 폴더를 직접 거르지 않고, 폴더 기간·수행율·계획MD 합계는 **살아남은 자손 이슈로 어댑터가 재계산**한다. 폴더를 `tasks.find` 로 찾으려는 코드는 항상 실패한다.
- **dangling 방어**: 삭제된 folderId 를 가리키는 `folderIssues` 항목, 삭제된 노드를 끝점으로 가진 `folderLinks` 는 렌더 전에 존재하는 id 집합과 교차해 버린다(어댑터/`GanttPage`). 서버 정합성 sweep 에 의존하지 않는다.
- **트리 뷰와 규칙을 공유한다**: 드롭 라우팅(폴더/이슈/루트 조합)과 계층 판정은 간트와 트리가 **같은 의미**여야 한다. 어댑터(`toSvarTasks`)와 `resolveTreeDrop`(트리) 중 한쪽만 고치면 두 뷰가 어긋난다 — `WORK_VIEWS.md` §5 참조.
- **`BLOCKS_TYPE_NAME` 값 동기화**: 백엔드 `GanttMapper.BLOCKS_TYPE_NAME` ↔ 프론트 `relationSource.BLOCKS_LINK_TYPE_NAME`. 프론트가 백엔드 모듈을 import 하지 않아 값만 복제돼 있다. 한쪽만 바꾸면 트리 상세에서 선후행이 "Jira 연결"로 중복 렌더된다.
- **링크 스왑의 의도된 트레이드오프(W-1)**: 스왑 저장 때문에 **Jira 네이티브 이슈 화면의 "blocks/is blocked by" 표기는 간트 의도와 반대**로 보인다(예: 선행 이슈에 "is blocked by"가 표시). 간트 방향 보존과 Jira 화면 의미 정합은 이 인스턴스의 라운드트립 특성상 동시에 만족할 수 없어, **간트 방향 보존을 선택**했다(2026-07-02 감사 W-1). Jira 화면 표기가 문제되면 링크 타입 자체를 별도 커스텀 타입으로 바꾸는 방안을 검토할 것.

---

## 7. 남은 작업

- ~~R4~~ **(구현됨, 2026-07-01)**: 미일정 이슈 일정 편집 — ① "일정 설정" 버튼→`GanttScheduleModal`(DatePicker) ② **placeholder 막대 드래그**(회색 점선, 프로젝트 시작일 위치·기본 3일, `ganttAdapter` `placeholder:true` → 드래그 시 M2 write-back 으로 실제 일정 저장). 두 경로 모두 `updateGanttSchedule` 재사용.
- ~~부모(계층) 편집 속도~~ (해결 2026-07-02): `useSetParent` 는 서버 응답 캐시 부분패치로 전환(인덱스 지연 회피 겸용).
- **(추후 논의) WBS 부모 롤업 여부**: 현재 WBS(상위 지정) 부모는 독립 막대 — 자식 기간 롤업(포함 개념)을 WBS 에도 적용할지, 한다면 토글 옵션으로 줄지 논의 필요(2026-07-02 사용자: "추후 논의가 필요해서 기록").
- **setGanttLink 서버 지연**: 링크 1건당 사이클 검증용 이슈 전체 페치 1회 → 필요 시 클라 캐시로 선검증. (`setGanttFolderLink` add 는 이슈 그래프 + 폴더 2쿼리라 더 무겁다.)
- **manifest `predecessorsField` 제거**: 미사용 확정 후 안전 시점에.
- **편집 진입점 이원화(2026-07-22~)**: 같은 데이터를 간트 그리드/차트와 트리 상세 양쪽에서 편집한다. mutation·모달은 공유하지만 **UI 진입점 추가 시 양쪽을 함께 확인**해야 한다(한쪽에만 붙으면 사용자가 뷰를 바꿨을 때 기능이 사라진 것처럼 보인다).

---

## 8. 참고

- **트리 뷰·뷰 전환 셸**: `static/ui/src/pages/projectDetail/work/WORK_VIEWS.md`
- 상세 설계: `_workspace/issue-link-gantt/01_architect_design_v2_native.md`
- 세션 핸드오프: `_workspace/issue-link-gantt/HANDOFF_v2.md`
- 결정 기록: `_workspace/issue-link-gantt/00_input/decision_v2.md`
