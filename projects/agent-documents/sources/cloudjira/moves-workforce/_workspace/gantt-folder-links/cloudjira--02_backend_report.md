# R2 폴더 링크 백엔드 구현 리포트 (2026-07-07)

> 설계서 `01_architect_design.md` §10 Backend 체크리스트 전부 구현. 프론트는 이 리포트의 **응답 shape 을 글자 그대로** 소비하라.
> R1(뎁스 색상)은 프론트 전용 → 백엔드 작업 없음.

## 1. 구현한 resolver 함수 + 실제 응답 shape (글자 그대로)

프론트 수신 형태: `invoke('setGanttFolderLink', {...})` → `{ success, content|error }`.
(`guardedDefine` 내부 `responseWrapper` 가 서비스 반환 `{ content }` 를 `{ success:true, ...result }` 로 spread → 아래 shape.)

### 신규 쓰기 resolver — `setGanttFolderLink`

입력 파라미터:
```
{ projectId, op: 'add' | 'remove', source, target }
```
- `source`/`target` = 네임스페이스 끝점 문자열: `folder:<uuid>` | 이슈 key(예: `ARS-8`).
- 최소 1개 끝점이 `folder:` 접두여야 함. 둘 다 이슈면 `GANTT_FOLDER_LINK_INVALID`.

성공 응답 (add / remove 공통):
```json
{
  "success": true,
  "content": {
    "op": "add",
    "source": "folder:A",
    "target": "folder:B",
    "link": {
      "id": "folder:A->folder:B",
      "source": "folder:A",
      "target": "folder:B",
      "type": "FS",
      "lag": 0
    }
  }
}
```
- `link.id` = `` `${source}->${target}` `` (정방향, **스왑 없음**).
- `remove` 시 `op:"remove"` 이며 `link` 은 삭제된 링크 서술자(동일 shape). 프론트는 `op` 로 캐시 add/remove 판단.
- 예: 폴더↔이슈 `{ op:'add', source:'folder:A', target:'ARS-8' }` → `link.id = "folder:A->ARS-8"`.

실패 응답:
```json
{
  "success": false,
  "error": { "name": "LogicalError", "code": "<CODE>", "message": "...", "cause": "" }
}
```
`<CODE>` 목록 (프론트 `mapFolderLinkError` 가 매핑할 코드):
| code | 조건 |
|------|------|
| `GANTT_FOLDER_LINK_INVALID` | 둘 다 이슈(미스라우팅) / 잘못된 op / source·target 누락 |
| `GANTT_SELF_REFERENCE` | `source === target` (add·remove 공통, 가드 최우선) |
| `GANTT_FOLDER_NOT_FOUND` | `folder:` 끝점의 uuid 가 해당 프로젝트에 없음 / projectId 누락 |
| `GANTT_CROSS_PROJECT_REF` | 이슈 끝점이 프로젝트 페치집합 밖(add 시 순환검증 단계) |
| `GANTT_CYCLE_DETECTED` | 혼합 그래프(이슈 링크 ∪ 폴더 링크) DAG 순환(add 시) |

### 조회 확장 — `getProjectGanttData` (additive, 입력 무변경)

입력 `{ projectId, coworkerFieldId }` 그대로. 응답 `content` 에 **기존 키 전부 불변 + `folderLinks` 1키 추가**:
```json
{
  "success": true,
  "content": {
    "tasks": [ ... ],
    "links": [ ... ],
    "meta": { "total": 0, "fetchedAt": "...", "projectStart": null, "projectEnd": null },
    "folders": [ { "id": "...", "name": "...", "parentFolderId": null, "sortOrder": 0 } ],
    "folderIssues": { "<issueKey>": "<folderId>" },
    "folderLinks": [
      { "id": "folder:A->folder:B", "source": "folder:A", "target": "folder:B", "type": "FS", "lag": 0 }
    ]
  }
}
```
- `folderLinks[].source`/`target` = 네임스페이스 끝점 문자열. `id` = `source->target`. `type:'FS'`/`lag:0` 은 표시용 고정값.
- **best-effort**: 링크 SELECT 실패(마이그레이션 미적용)해도 `folderLinks: []` 폴백, 나머지 정상(무회귀). 기존 `safeFolderRows` 헬퍼 재사용.

## 2. 변경 파일 목록

| 파일 | 변경 |
|------|------|
| `src/rdb/schema/ddl/ganttFolder.sql.js` | `CREATE_GANTT_FOLDER_LINK_TABLE` export 추가(§4-1) |
| `src/rdb/schema/ddl/index.js` | `CREATE_GANTT_FOLDER_LINK_TABLE` re-export 추가 |
| `src/rdb/schema/migrate.js` | import + `.enqueue('v009_create_gantt_folder_link_table', ...)` |
| `src/rdb/query/GanttFolderQuery.js` | SQL 상수 5종 추가(FIND/INSERT(ON DUP)/DELETE/DELETE_OF_ENDPOINT/DELETE_BY_PROJECT) |
| `src/resolver/gantt/GanttFolderRepository.js` | 링크 래퍼 5종 추가 |
| `src/resolver/gantt/GanttService.js` | `fetchGanttGraph` export 승격 + `getProjectGanttData` folderLinks 병렬 SELECT·조립 |
| `src/resolver/gantt/GanttFolderService.js` | `setGanttFolderLink` 신규 + `deleteGanttFolder` 링크정리 1스텝 + `isFolderRef`/`stripFolderRef` 헬퍼 |
| `src/resolver/gantt/GanttController.js` | `setGanttFolderLink` guardedDefine 등록 |
| `src/permission/PermissionMap.js` | `setGanttFolderLink: W('PROJECT_GANTT','inherited')` |
| `src/utils/errors/ErrorCodes.js` | `GANTT_FOLDER_LINK_INVALID` 추가 |
| `src/resolver/project/ProjectService.js` | cascade 에 `deleteGanttFolderLinksByProjectRepository`(folder_issue/folder 보다 먼저) |
| `src/resolver/gantt/__test__/GanttFolderService.test.js` | mock 확장 + `setGanttFolderLink` 13케이스 + delete 링크정리 검증 |
| `src/resolver/gantt/__test__/GanttValidationService.test.js` | `detectDagCycle` 혼합 그래프 5케이스 |

- `GanttValidationService.js`(`detectDagCycle`) **무수정** — 혼합 입력(폴더 노드 포함 keySet/links) 그대로 수용 확인.
- `src/index.js` **무변경** — 신규 컨트롤러 없음(기존 `registerGanttController` 에 1종 추가).
- `manifest.yml` **무변경** — `runMigration`·`sql` 이미 등록.

## 3. 마이그레이션 버전

- **v009** (`v009_create_gantt_folder_link_table`). 기존 체인 v001~v008 확인 후 다음 번호. 설계서 명시(v009)와 일치.
- 테이블 `gantt_folder_link`: PK 복합 `(project_id, source_ref, target_ref)`, `source_ref`/`target_ref` VARCHAR(64), INDEX 3종. FK/CASCADE 미선언(TiDB 제약 — 앱 코드로 무결성).

## 4. npm test 결과 (루트, jest)

```
Test Suites: 12 passed, 12 total
Tests:       182 passed, 182 total
```
- 전부 통과. 신규 스위트 포함(`GanttFolderService.test.js`, `GanttValidationService.test.js`).
- `permissionMap.contract.test.js` 통과 — 등록집합 ↔ 맵키집합 정합(`setGanttFolderLink` 양쪽 반영).
- (StorageService 테스트의 `console.error` 는 의도된 fallback 케이스 로그이며 실패 아님.)

커버 케이스: add 폴더↔폴더/폴더↔이슈/이슈↔폴더 성공, 멱등(중복 add), `GANTT_FOLDER_LINK_INVALID`(둘 다 이슈·잘못된 op), `GANTT_SELF_REFERENCE`, `GANTT_FOLDER_NOT_FOUND`, `GANTT_CROSS_PROJECT_REF`, `GANTT_CYCLE_DETECTED`(혼합 순환), remove 멱등·self 가드, deleteGanttFolder 링크정리 호출, detectDagCycle 혼합 그래프(정상/순환/교차/self).

## 5. 설계 이탈 사항

**없음.** 설계서 §2~§4·§10 계약 그대로 구현. 응답 shape·에러코드·끝점 네임스페이스 규약·스왑 금지·혼합 순환 정책·cascade 순서 모두 준수.

참고(설계와 무관한 사실 기록): 설계서 §9 는 "기존 146 tests" 로 적었으나 현재 리포지토리 기준 총 182 tests(신규 포함) 통과. 회귀 없음.

## 6. 프론트 배선 주의점 (계약 요약)

- 훅: `useSetFolderLink` → `invoke('setGanttFolderLink', { projectId, op, source, target })`.
- 낙관 패치 대상: `content.folderLinks` (invalidate 금지, 앱 DB 즉시 일관).
- `op` 로 캐시 add/remove. add 멱등 처리(중복 source/target 존재 시 no-op) 는 프론트에서도 방어(설계 §6-6).
- 성공 토스트: 기존 `gantt.toast.linkAdded`/`linkRemoved` 재사용. 신규 i18n 키는 `gantt.error.folderLinkInvalid`(kr/en) 1종만(프론트 담당).
- 끝점 문자열은 SVAR 폴더 노드 id(`folder:<uuid>`)·이슈 key 와 동일 조인키 → 별도 변환 불요.
