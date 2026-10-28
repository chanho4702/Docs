# 트리 상세 "연관 관계" 개편 — 프론트 구현 리포트

- 작업일: 2026-07-23
- 범위: **프론트 전용**(백엔드 신규 0, `src/` 수정 0). 기존 resolver `setGanttParent` / `setGanttLink` 재사용.
- 대상 화면: 프로젝트 상세 > 작업 관리 > 트리 뷰 > 우측 상세 패널의 "연관 관계" 섹션

---

## 1. 변경 파일

| 파일 | 구분 | 내용 |
|------|------|------|
| `static/ui/src/pages/projectDetail/work/relationSource.js` | 신규 | 중복 제거·출처 판정 **순수 로직**(렌더 무관, jest 대상) |
| `static/ui/src/pages/projectDetail/work/relationSource.test.js` | 신규 | 위 순수함수 유닛테스트(19 케이스) |
| `static/ui/src/pages/projectDetail/work/TreeLinkModal.jsx` | 신규 | 선후행 링크 추가 모달(방향 + 이슈 선택) |
| `static/ui/src/pages/projectDetail/work/TreeDetailPanel.jsx` | 수정 | `RelationSection` 전면 개편(출처 표기 + 편집 UI), `RelationGroup`/`RelationRow` 삭제 버튼 지원 |
| `static/ui/src/pages/projectDetail/work/ProjectTreeView.jsx` | 수정 | `useSetLink` 배선 + `TreeLinkModal` 마운트 + `onAddLink`/`onRemoveLink` 전달 |
| `static/ui/src/pages/projectDetail/work/useIssueRelations.js` | 수정(하위호환) | 링크 항목에 `typeName`·`linkId` **추가**(additive) |
| `locales/kr/projectDetail.json`, `locales/en/projectDetail.json` | 수정 | 신규 i18n 키 25개(`work.tree.detail.*`, `work.tree.detail.link.*`) |
| `locales/ko-KR.json`, `locales/en-US.json` | 생성물 | `npm run merge` 산출물(직접 편집 없음) |

**원본 수정 없음(회귀 차단 대상)**: `gantt/useGanttData.js`, `gantt/useGanttMutations.js`, `gantt/GanttChart.jsx`, `gantt/GanttParentModal.jsx`, `gantt/ganttAdapter.js`, `src/resolver/gantt/*`
→ `git diff --stat -- static/ui/src/pages/projectDetail/gantt` = **빈 결과**로 확인.

---

## 2. 문제 1 — 같은 링크 이중 렌더 제거

### 원인(코드 확정)
- 백엔드 `GanttMapper.buildLinksFromIssueLinks`: `fields.issuelinks` 중 `type.name === 'Blocks'` 만 간선(links)으로 뽑는다.
- 프론트 `useIssueRelations`: `fields.issuelinks` 를 **전부** `links` 로 내려준다(필터 없음).
→ Blocks 링크 1건이 "Jira 연결"(blocks / is blocked by)과 "선후행"에 각각 렌더됐다.

### 제거 방식
`relationSource.js`
```js
// ⚠️ 백엔드 GanttMapper.BLOCKS_TYPE_NAME 과 값이 일치해야 한다(백엔드 import 금지 → 값만 복제)
export const BLOCKS_LINK_TYPE_NAME = 'Blocks';
export const isBlocksLink = (link) => link?.typeName === BLOCKS_LINK_TYPE_NAME;
export const excludeBlocksLinks = (links) => links.filter((l) => !isBlocksLink(l));
```
- **타입명(`type.name`)으로만 판정.** `relation`(= `type.outward`/`type.inward` = 'blocks' / 'is blocked by')은 방향별 표시 문구라 로케일·커스텀 타입에서 깨지므로 필터 기준으로 쓰지 않는다.
- 이를 위해 `useIssueRelations` 를 **additive 확장**: 링크 항목에 `typeName`(+`linkId`) 추가. 기존 필드(`relation`,`key`,`summary`,`statusCategory`,`iconUrl`)·반환 shape 불변.
  - 소비처 전수 확인(grep `useIssueRelations`): **`TreeDetailPanel.jsx` 단 1곳** → 하위호환 리스크 없음.
- `typeName` 이 없는 항목(구버전 캐시 등)은 판정 불가 → **보수적으로 남긴다**(사라지는 것보다 낫다).

### 정보 유실 방지(추가 발견 → 보완)
백엔드는 간트 links 를 만들 때 **페치 집합 밖(다른 프로젝트/dangling) Blocks 를 제외**한다(`buildTasksAndLinks` §3).
Blocks 를 "Jira 연결"에서 무조건 빼면 그런 링크가 **화면에서 통째로 사라진다** → `pickOutOfScopeBlocks()` 로
간트 links 에 없는 Blocks 만 골라 선후행 블록 하단에 "조회 범위 밖 선후행"으로 **읽기 전용** 표시(삭제 버튼 없음, 안내문 부착).

---

## 3. 문제 2 — 출처 판정 규칙

### 규칙 요약
| 관계 | 저장소 | 표기 |
|------|--------|------|
| 상위 — `wbsParent` | 앱 이슈 프로퍼티 `movesRms.wbsParent` | **워크포스에서 지정** (Jira 상위를 override) |
| 상위 — Jira `parent` | Jira 표준 필드 | **Jira에서 정의** |
| 선후행(Blocks) | Jira 네이티브 이슈 링크 **하나뿐** | 출처 구분 **불가** → "Jira 이슈 링크(Blocks)로 저장됨"만 1회 안내 |
| 하위 지정(`wbsChildren`) / 폴더 소속 | 앱 전용 | 워크포스 배지 |
| 그 외 Jira 링크(relates to / duplicates / clones …) | Jira | Jira 배지 |

### 상위 판정 (`resolveParentOrigin`, 순수함수)
입력: `{ wbsParentKey (node.wbsParent), effectiveParentKey (SVAR node.parent 가 이슈일 때), jiraParent (Jira 조회 결과) }`

```
isWbsApplied = wbsParentKey && effectiveParentKey === wbsParentKey
├ true  → source='workforce', effectiveKey=wbsParentKey
│         isOverridden = jiraParentKey 존재 && jiraParentKey !== wbsParentKey   ← 가려진 Jira 상위 노출
└ false → source = jiraParentKey ? 'jira' : null   (override 해제 시 Jira 폴백 = useGanttMutations §D-4 계약)
          isWbsUnapplied = !!wbsParentKey          (지정은 있으나 대상이 조회 범위 밖/필터 → 트리 미적용)
          isOutOfView    = jiraParentKey 존재 && effectiveParentKey !== jiraParentKey
```

### 화면 표기
- **실제 적용 중인 상위** + 출처 배지(`워크포스에서 지정` / `Jira에서 정의`) + 이슈 행
- override 중이면 그 아래 **"워크포스 지정으로 가려진 Jira 상위"** 를 흐리게(muted) 함께 표시 + 안내
  ("상위 지정을 해제하면 Jira 상위로 돌아갑니다")
- 워크포스 지정이 조회 범위 밖이라 적용 안 된 경우 그 사실을 명시
- 선후행 블록에는 배지 대신 **정직한 안내 1줄**: "선후행은 Jira 이슈 링크(Blocks)로 저장됩니다 — 간트에서 그렸는지 Jira에서 만들었는지는 구분되지 않습니다."

---

## 4. 문제 3 — 편집 기능(신규 개발 없이 기존 훅 재사용)

| 기능 | 재사용 훅/resolver | 호출 경로 |
|------|-------------------|-----------|
| 상위 재지정/해제 | `useSetParent` → `setGanttParent` | 상위 블록 "변경" → `onEditParent(node)` → `ProjectTreeView.setParentModal` → **`GanttParentModal` 재사용**(해제 버튼 내장) → `submitParent` → `setParent.mutate({ issueKey, parentKey })` |
| 선후행 추가 | `useSetLink` → `setGanttLink` | 선후행 블록 "연결 추가" → `TreeLinkModal` → `submitAddLink` → `setLink.mutate({ op:'add', source, target, type:'FS', lag:0 })` |
| 선후행 삭제 | `useSetLink` | 선/후행 행의 × → `onRemoveLink({source,target})` → `setLink.mutate({ op:'remove', ... })` |

- **모달 재사용 판단**: 상위 지정은 `GanttParentModal` 을 **그대로 재사용**(단일 값 선택 + 해제 버튼 = 요구사항 일치).
  선후행은 **방향(선행/후행)** 이라는 두 번째 입력이 필요해 재사용 불가 → `TreeLinkModal` 최소 신규.
  단 기존 모달 패턴을 그대로 따랐다: `BaseModal` + Atlaskit `Field`/`Select` + 이슈 타입 아이콘 옵션 라벨 + 자기 자신/폴더 제외.
- **후보 필터**: 자기 자신·폴더 노드·**이미 연결된 이슈**(방향 무관) 제외 → 중복 링크 생성 원천 차단.
- **검증은 서버 권위**: 사이클/self/교차프로젝트는 `GanttValidationService` 가 판단.
  프론트 중복 구현 없음 → 실패 시 `useGanttMutations.mapRelationError` 가 `gantt.error.cycle` / `selfRef` / `crossProject` 토스트로 표시하고 캐시를 롤백한다.
- 편집 진입점 재배치: 기존 "계층" 액션 블록(상위 지정 / 폴더 지정 버튼)은 **제거**하고, 각 관계 블록 헤더의 인라인 액션으로 옮겼다(문맥 일치, 버튼 중복 방지). 폴더 지정은 "소속 폴더" 블록 헤더로 이동.

---

## 5. 제약 준수 확인

| 제약 | 확인 |
|------|------|
| 인덱스 지연 — write 직후 `search/jql` 재조회 금지 | `invalidateQueries` **신규 추가 0건**. `useSetParent`/`useSetLink` 의 기존 경로(onMutate 낙관 패치 → onSuccess 서버 확정 응답으로 캐시 재조정 → onError 롤백)를 그대로 탄다. |
| 권한 게이트 | 편집 UI는 `TreeDetailPanel` 의 `canWrite` prop 게이팅. 이 값은 `ProjectTreeView` 의 `usePermissionStore.canWrite('PROJECT_GANTT')`. **`'PROJECT'` 대신 `'PROJECT_GANTT'` 를 쓴 이유**: 서버 가드가 `PermissionMap.js` 에서 `setGanttParent`/`setGanttLink` = `W('PROJECT_GANTT','inherited')` 로 정의돼 있어, `'PROJECT'` 로 게이팅하면 UI는 열리는데 서버가 거부하는 불일치가 생긴다(작업 관리 그룹 전체가 `PROJECT_GANTT` 게이트). 지시와 다른 키를 쓴 유일한 지점이라 명시해 둔다. |
| Jira 권한(Link/Edit Issues) 사전 검사 | `useSetLink` 내부 `fetchJiraProjectPermissions(...).canLinkIssues === false → JIRA_PERMISSION_DENIED` 동작 그대로 유지(훅 미수정). |
| 간트 회귀 금지 | gantt 디렉토리 **diff 0**. 트리와 간트가 같은 쿼리키 `ganttKeys.data(projectId)` 를 공유하므로 트리 편집이 간트에도 반영된다(§6). |
| i18n | `locales/kr|en/projectDetail.json` 에만 키 추가 → `cd static/ui && npm run merge` 실행 완료. `ko-KR.json`/`en-US.json` 직접 수정 없음. |

---

## 6. 간트 회귀(캐시 공유) 확인 — 코드 경로 추적

1. `ProjectTreeView` 와 `GanttPage` 모두 `useGanttData(project_id)` → 쿼리키 `ganttKeys.data(projectId)` **동일**.
2. 트리에서 `setLink.mutate(...)` → `useGanttMutations.useSetLink.onMutate` 가 `queryClient.setQueryData(ganttKeys.data(projectId), …content.links 갱신)`.
3. 같은 캐시를 구독하는 `GanttPage` 의 `useGanttData` 가 즉시 새 `links` 를 받아 `GanttChart` 화살표가 갱신된다.
4. 상위 지정도 동일(`content.tasks[].wbsParent/effectiveParent` 패치 → `toSvarTasks` 가 트리 중첩 재판정).
5. 트리에서 쓰는 mutation 인자 shape 은 `GanttPage.handleAddLink/handleRemoveLink/handleSetParent` 와 **글자 그대로 동일**(`{op,source,target,type,lag}` / `{issueKey,parentKey}`).
→ 간트 전용 코드 경로는 건드리지 않았고, 반영 방향은 양방향으로 동작한다. (실제 브라우저 E2E는 미수행 — 배포 후 확인 필요.)

---

## 7. 소비하는 백엔드 응답 shape (경계면)

신규 resolver 없음. 기존 계약을 그대로 소비한다.

- `invoke('getProjectGanttData', { projectId, coworkerFieldId })`
  → `result.content = { tasks:[Task], links:[{ id, source, target, type, lag }], meta, folders, folderIssues, folderLinks }`
  (`useGanttData` 경유 — 접근 경로 무변경)
- `invoke('setGanttParent', { projectId, issueKey, parentKey })` → `result.content = { issueKey, parentKey, effectiveParent }`
- `invoke('setGanttLink', { projectId, op, source, target, type, lag })` → `result.content = { target, predecessors:[Link] }`
- Jira 직접 호출: `executeRequest('getIssue', { fields:'parent,subtasks,issuelinks' }, { issueIdOrKey })` (`useIssueRelations`)

`result.success` 분기·`result.content` 접근은 모두 기존 훅 내부에 있고 이번에 바꾸지 않았다.

---

## 8. i18n

- 추가 위치: `locales/kr/projectDetail.json` / `locales/en/projectDetail.json` 의 `work.tree.detail` (및 `work.tree.detail.link`)
- 추가 키(25): `parentSection`, `parentEdit`, `parentByWorkforce`, `parentByJira`, `parentNone`, `parentOverridden`, `parentOverriddenHint`, `parentOutOfView`, `parentWbsUnapplied`, `dependencies`, `jiraLinks`, `folderNone`,
  `link.{add, remove, none, storedNote, title, save, direction, dirPredecessor, dirSuccessor, selectIssue, required, storedHint, outOfScope, outOfScopeHint}`
- **`cd static/ui && npm run merge` 실행 완료** → `ko-KR.json`/`en-US.json` 반영 확인(키 샘플 조회로 검증).

---

## 9. 검증 결과

| 항목 | 결과 |
|------|------|
| `npx jest` (static/ui 전체) | **16 suites / 196 tests 전부 통과** (신규 `relationSource.test.js` 19 케이스 포함) |
| `npm run build` | **Compiled with warnings** — 경고는 기존 node_modules source-map 파싱(@atlaskit, marklassian) 뿐, 코드 경고/에러 0 |
| `npm run merge` | 실행 완료, 산출물에 신규 키 반영 확인 |
| gantt 원본 무수정 | `git diff --stat -- static/ui/src/pages/projectDetail/gantt` → 빈 결과 |

유닛테스트 커버 내용:
- Blocks 상수가 백엔드 `BLOCKS_TYPE_NAME` 과 같은 값('Blocks')
- 타입명 판정(문구 'blocks' 를 가진 커스텀 타입은 선후행 아님)
- Blocks 가 "Jira 연결" 목록에서 빠지고 relates/duplicates 만 남음
- `typeName` 부재 시 보수적 유지 / 비배열 입력 방어
- 조회 범위 밖 Blocks 만 골라내기(이미 표시 중인 상대 제외)
- 상위: 워크포스 override 적용 / override 아님(같은 이슈) / Jira 폴백 / 해제 후 폴백 / wbs 미적용 / Jira 상위 화면 밖 / 상위 없음

---

## 10. 미수행·후속

- **E2E 미수행**: 실제 Jira 사이트에서 (a) 트리에서 선후행 추가 → 간트 화살표 즉시 반영, (b) 상위 override/해제 시 배지 전환, (c) 서버 사이클 거부 토스트 + 롤백 확인 필요.
- `work.tree.detail.hierarchy` 키는 "계층" 액션 블록 제거로 **미사용** 상태가 됐다(파일에는 남겨 둠 — 삭제는 별도 정리 시).
