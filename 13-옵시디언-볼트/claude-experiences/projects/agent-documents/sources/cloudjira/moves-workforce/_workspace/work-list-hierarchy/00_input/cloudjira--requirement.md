# 요구사항 — 작업관리 목록 뷰 Jira 계층 펼치기

작성: 2026-09-07 / 리더(오케스트레이터)
슬러그: `work-list-hierarchy`

## 1. 사용자 원문

> 작업 관리 목록 페이지 개선이 필요한데, Jira에서 제공하는 구조와 동일하게 제공해줄 수 있나.
> 예: 에픽–작업–하위이슈 구조이면 에픽에서 펼치기를 누르면 작업이 나오고, 작업을 펼치면 하위이슈가 나오는 구조로.

## 2. 확정된 결정 (사용자 응답, 2026-09-07)

| # | 질문 | 확정 |
|---|------|------|
| D1 | 계층 노출 방식 | **그룹 카드 안 테이블 상단에 [계층 \| 평면] 토글**. 기본값 = 계층. 기존 평면 목록도 그대로 남긴다 |
| D2 | 미편입 자식 처리 | **이 프로젝트에 편입된 이슈만**(앱 커스텀필드 `projectId` = 현재 프로젝트). 미편입 하위 이슈는 숨긴다 → "보이는 행 = 편집 가능한 행" 유지 |

## 3. 대상 화면 (현재 구조)

경로: `/project/:id` → 작업관리 탭 → **목록** 뷰 (`?view=table`)

```
ProjectWorkPanel.jsx (뷰 전환 셸: 목록|트리|간트|맵)
  └ issue/ProjectIssuePanel.jsx        구독 배너 + ProjectFilter + 그룹 카드 목록
      └ issue/ProjectGroupCard.jsx     Jira 프로젝트(스페이스) 단위 카드
          └ issue/ProjectIssueTable.jsx  ← ★ 이번 개선 지점
              └ components/table/CursorPagingTable
```

현재 `ProjectIssueTable`:
- `useWorkListGroupPage` 로 **커서 페이징**(pageSize 20/50), JQL = `projectId = <id> AND project = <groupKey> [AND 필터]`
- 행: 체크박스 / 이슈키 / 요약 / 상태 / 담당자(인라인) / 협업자(인라인) / 시작일(인라인) / 기한(인라인) / 계획MD(인라인) / 진행률
- 선택 → 일괄 적용(`BulkApplyModal`) / 일괄 제외(`deleteProjectIssue`)
- 단건 편집은 재조회 없이 `patchGroupPage(queryKey, ...)` 로 해당 페이지 캐시 인덱스만 교체

## 4. 이번 요구의 본질적 난점 — 계층 × 커서 페이징

평면 커서 페이징(20건)에서는 부모와 자식이 서로 다른 페이지로 흩어져 계층을 만들 수 없다.
**계층 모드에서는 페이지 단위가 "이슈 20건"이 아니라 "최상위 이슈 20건 + 그 자손 전부"가 되어야 한다.**

### 리더가 제안하는 방향 (architect가 검증·확정할 것)

2단계 조회:

1. **골격(skeleton)**: 그룹의 전체 이슈를 가벼운 필드로 조회해 `parent` 체인만 파악
   - 이미 `fetchWorkListSummary`(`useWorkListQueries.js`)가 **전체 이슈를 `fields: ['project','status']` 로 nextPageToken 루프 조회**(MAX_ISSUES 2000 / MAX_PAGES 20)하고 있다.
   - 여기에 `parent`(+ 필요시 `issuetype`)를 **추가**하면 계층 골격을 **추가 네트워크 0회**로 얻을 수 있다. 이 재사용이 이 설계의 핵심.
   - 부모가 편입 집합 밖이면 **고아 → 루트로 승격**(트리 뷰 `buildWorkTree` 와 같은 규칙. 이 규칙을 재해석하지 말 것)
2. **상세(detail)**: 트리 순서로 나열한 뒤 최상위 N개(pageSize) 서브트리에 속한 이슈 키만 `key IN (...)` 로 상세 조회(`fields: *all`, `properties: movesRms`)
   - `key IN` 결과 순서는 보장되지 않으므로 클라이언트에서 트리 순서로 재배열
   - 키 개수가 크면 청크 분할 + 상한 필요
   - 펼치기/접기는 **네트워크 0회**여야 한다(서브트리를 이미 다 받아 둠)

## 5. 제약 · 반드시 지킬 것

- **백엔드 0줄 예상.** 이 화면은 프론트에서 `@forge/bridge requestJira` 로 Jira REST 를 직접 호출한다(`utils/jiraApi/`). 새 resolver·PermissionMap 변경이 필요해 보이면 먼저 리더에게 보고할 것.
- **기존 평면 모드는 동작·성능·캐시가 하나도 바뀌면 안 된다.** 토글이 평면이면 지금 코드 경로를 그대로 탄다.
- **인라인 편집 5종·일괄 적용·일괄 제외가 계층 모드에서도 동작해야 한다.** 단건 편집 후 캐시 패치(재조회 없음) 원칙 유지.
- 쿼리키는 `utils/queryKey/projectKeys.js` 의 `workListKeys` 팩토리에 추가한다(`queryKeyContract.test.js` 계약 검사 대상).
- 계층 조립·페이지 슬라이싱은 **순수 함수로 분리**해 jest 대상으로 만든다(기존 `workListQuery.js` / `buildWorkTree.js` 전례).
- i18n: `locales/kr|en/projectDetail.json` 에 키 추가 후 `cd static/ui && npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지.
- 트리 뷰(`work/ProjectTreeView`)의 계층은 **앱 계층**(wbsParent + 폴더)이고 이번 건은 **Jira 네이티브 parent 계층**이다. 서로 다른 축이므로 코드·규칙을 섞지 말 것. 단 `buildWorkTree`/`flattenTree` 의 *조립·평탄화 패턴*은 참고 가치가 있다.
- 필터가 걸린 상태에서 부모가 필터에 걸러지면 자식은 루트로 승격한다(자식이 통째로 사라지면 안 된다).
- 과설계 금지: 부모 체크 시 자식 자동 선택 같은 편의 기능은 이번 범위 밖(요청에 없음).

## 6. 완료 기준

1. 목록 뷰 그룹 카드에서 [계층|평면] 전환이 되고, 계층이 기본이다.
2. 계층 모드에서 에픽 → 작업 → 하위이슈가 부모 행의 펼침 토글로 단계적으로 열린다(펼침 시 추가 조회 없음).
3. 계층 모드에서도 인라인 편집 5종 + 일괄 적용 + 일괄 제외가 평면 모드와 동일하게 동작한다.
4. 계층이 없는(부모-자식 관계가 전혀 없는) 프로젝트에서도 평면과 사실상 같은 화면으로 보인다.
5. `cd static/ui && npm test` 통과, `CI=true npm run build` 통과.
