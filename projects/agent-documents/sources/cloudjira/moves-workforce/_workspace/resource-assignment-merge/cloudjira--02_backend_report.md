# 자원관리 탭 재편 (resource-assignment-merge) — 백엔드 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **설계서**: `_workspace/resource-assignment-merge/01_architect_design.md` (§3-A 권한 변경표 / §7.1 백엔드 체크리스트)
- **범위**: **백엔드 변경은 `PermissionMap.js` grant OR 확장 3건뿐.** 신규 resolver·서비스·DB·manifest **0건**, 응답 shape·서비스 로직 **전부 무변경**.
- **테스트**: `npm test` → **16 suites / 315 tests 전부 통과** (권한 계약 신규 10건 포함, 기존 305 기준 회귀 0).

---

## 1. resolver → 권한 grant 전/후 표 (프론트 게이트가 미러링 — 글자 그대로)

`R(res, mode) = { grants:[{res, read}], project:mode }`
`W(res, mode) = { grants:[{res, write}], project:mode }`
`OR([[res,act],...], mode) = { grants:[{res,act},...], project:mode }` — grants 는 **OR 시맨틱**(하나만 충족해도 통과, `permissionGuard.isSatisfied`).

| resolver | **변경 전** | **변경 후** | 새로 열리는 대상 |
|---|---|---|---|
| `getActiveProjects` | `R('PROJECT','list')` | `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'list')` | 자원관리 read 보유·PROJECT read 미보유자가 활성 프로젝트 목록(셀렉터) 조회 |
| `getWorkAssignmentBoard` | `R('PROJECT','detail')` | `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'detail')` | 동일 사용자가 작업 큐/후보 board 조회 |
| `assignWorkItem` | `W('PROJECT','inherited')` | `OR([['PROJECT','write'],['RESOURCE_MANAGEMENT','write']], 'inherited')` | 자원관리 **write** 보유자가 배정 실행 |
| `getWorkAssignmentPool` | `R('RESOURCE_MANAGEMENT','detail')` | **무변경** | — |
| `setProjectSkills` | `W('PROJECT','detail')` | **무변경** | — (요구스킬 편집은 프로젝트 오너 권한 유지) |
| `getProjectSkills` | `OR([['RESOURCE_MANAGEMENT','read'],['PROJECT','read']])` | **무변경** (이미 OR) | — |

### 프론트 게이트 정합 (미러링 대상)
| 프론트 게이트 | 백엔드 grant |
|---|---|
| 셀렉터/board 조회 진입 = `canRead('RESOURCE_MANAGEMENT')`(ResourcePage) | `getActiveProjects`/`getWorkAssignmentBoard` 의 RESOURCE_MANAGEMENT read OR 로 서버 통과 |
| 배정 실행 = `canWrite('PROJECT') \|\| canWrite('RESOURCE_MANAGEMENT')` | `assignWorkItem` 의 PROJECT write OR RESOURCE_MANAGEMENT write |
| 요구 스킬 편집 = `canWrite('PROJECT')` | `setProjectSkills` = PROJECT write (무변경) |

> ⚠️ **read 가 아니라 write**: `assignWorkItem` 은 `RESOURCE_MANAGEMENT` **write** 로만 열린다. 조회 전용 자원관리자(read만)는 배정할 수 없다(최소 권한). 프론트도 `canWrite('RESOURCE_MANAGEMENT')` 로 미러링해야 정합.

---

## 2. 보안 무약화 확인 (설계서 §3-A 원칙)

| 항목 | 상태 |
|---|---|
| project mode | 세 키 모두 `'list'`/`'detail'`/`'inherited'` **그대로 유지** — `enforceProjectScope`(장벽 B)는 한 줄도 약해지지 않음. MEMBER_ONLY 비관리자의 비소속 프로젝트 접근은 read·write 모두 여전히 차단 |
| `permissionGuard.js` diff | **0** — 가드 로직 무변경. 이미 `grants.some(...)` OR 시맨틱 지원(`isSatisfied`, :28) |
| board 전사 컬럼/풀 노출 | 서비스가 `companyScopeVisible`(=RESOURCE_MANAGEMENT read)로 계속 **부분 마스킹** → OR 확장이 전사 지표 노출 범위를 넓히지 않음 |
| 프로젝트 상세 회귀 | 프로젝트 상세 작업 배정 탭 진입자는 애초 PROJECT read/write 보유자 → OR 의 첫 grant 로 이미 통과. 판정 불변 |
| write 최소 권한 | assign 은 RESOURCE_MANAGEMENT **write** 요구(read 아님). Jira `ASSIGN_ISSUES` 가 최종 판정(`as:'user'`) → 이중 방어 |

---

## 3. 변경 파일

| 파일 | 변경 |
|---|---|
| `src/permission/PermissionMap.js` | grant OR 확장 3건 (`getActiveProjects`·`getWorkAssignmentBoard`·`assignWorkItem`). 결정 주석 추가. 나머지 무변경 |
| `test/permission/permissionMap.contract.test.js` | OR 확장 고정 계약 10건 추가 (§4) |

**무변경(제약 준수)**: 프론트·i18n·서비스·DB·manifest 손대지 않음. `OR` 헬퍼는 PermissionMap 에 이미 존재(`getRoleList` 등)라 신규 도입 없음. resolver 등록 이름 불변 → 등록↔매핑 대조 테스트 자동 통과.

---

## 4. 추가한 계약 테스트 (10건)

`permissionMap.contract.test.js` 에 `describe('PermissionMap — resource-assignment-merge grant OR 확장')` 추가:

**매핑 값 고정 (5)**
- `getActiveProjects` = OR[PROJECT read, RESOURCE_MANAGEMENT read], project=list
- `getWorkAssignmentBoard` = OR[PROJECT read, RESOURCE_MANAGEMENT read], project=detail
- `assignWorkItem` = OR[PROJECT write, RESOURCE_MANAGEMENT write], project=inherited **+ RESOURCE_MANAGEMENT read 로는 안 열림**
- `getWorkAssignmentPool` 무변경(RESOURCE_MANAGEMENT read 단일)
- `setProjectSkills` 무변경(PROJECT write 단일)

**`isSatisfied` OR 통과/차단 (§7.1 B3 — 5)**
- 자원관리 read 보유·PROJECT 미보유 → board/getActiveProjects **통과**
- 자원관리 read만 → assignWorkItem **차단**(write 필요)
- 자원관리 write 보유 → assignWorkItem **통과**
- 권한 전무 → 3키 모두 차단
- admin 전권 바이패스

---

## 5. `npm test` 결과

```
Test Suites: 16 passed, 16 total
Tests:       315 passed, 315 total
```
- `permissionMap.contract.test.js` 16건 통과(신규 10건 포함).
- 기존 305 → 315, work-assignment/gantt 등 회귀 0.

---

## 6. 프론트 전달 요약 (핵심)

1. **셀렉터·board 는 자원관리 read 로 서버 통과** — 통합 탭 진입자(`canRead('RESOURCE_MANAGEMENT')`)가 PROJECT read 없어도 `getActiveProjects`/`getWorkAssignmentBoard` 가 `PERMISSION_DENIED` 를 내지 않는다.
2. **배정 버튼 게이트 = `canWrite('PROJECT') || canWrite('RESOURCE_MANAGEMENT')`** — 백엔드 `assignWorkItem` OR 와 대칭. `RESOURCE_MANAGEMENT` 는 **write** 로만 열리니 read 로 미러링하면 프론트가 버튼을 보여줘도 서버가 거부한다(주의).
3. **응답 shape 전부 무변경** — work-assignment `02_backend_report.md` §1 계약(§7 반영분 포함: `projectKey`/`projectName`/`projectAvatarUrl`, flags 빈 배열 가능) 그대로. `content` 래핑, `candidates[].company` null 가능, `project.util` 대개 null, `assignWorkItem` payload 에 `projectId` 필수, assign 경로 invalidate 금지 — 통합 탭 전환으로 바뀌지 않음.
4. **projectScope 불변** — MEMBER_ONLY 자원관리자는 소속 프로젝트만 보게 된다(안전한 축소). 비소속을 보려면 권한 데이터에서 projectScope=ALL 로 설정(코드로 열지 않음).
