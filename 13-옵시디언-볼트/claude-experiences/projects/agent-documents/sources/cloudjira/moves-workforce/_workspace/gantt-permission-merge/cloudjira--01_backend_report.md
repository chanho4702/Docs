# 간트 권한 통합 (PROJECT_GANTT → PROJECT) — 백엔드 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **사용자 결정**: 간트 권한(`PROJECT_GANTT`)을 별도 관리하지 않고 프로젝트 상세 권한(`PROJECT`)으로 통합한다.
  목표 상태 = "**PROJECT write 있으면 프로젝트 내(간트/트리 포함) 편집 가능, 없으면 편집 불가**".
- **범위**: 백엔드 권한 매핑만. 프론트 게이트(`canRead/canWrite('PROJECT_GANTT')`)는 **건드리지 않음**(프론트 에이전트 별도 처리).
- **테스트**: `npm test` → **16 suites / 305 tests 전부 통과** (권한 계약 신규 2건 포함).

---

## 1. `PROJECT_GANTT` 전역 참조 전수 목록 (변경 전)

`grep -rn "PROJECT_GANTT"` (node_modules 제외) 결과 — **8파일**.

### 백엔드 (이번 작업 대상)
| 파일 | 라인 | 참조 | 조치 |
|---|---|---|---|
| `src/permission/PermissionMap.js` | 185 | `getProjectGanttData: R('PROJECT_GANTT','detail')` | → `R('PROJECT','detail')` |
| `src/permission/PermissionMap.js` | 186 | `updateGanttSchedule: W('PROJECT_GANTT','inherited')` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 187 | `setGanttParent` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 188 | `setGanttLink` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 189 | `createGanttFolder` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 190 | `renameGanttFolder` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 191 | `moveGanttFolder` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 192 | `deleteGanttFolder` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 193 | `setGanttIssueFolder` | → `W('PROJECT','inherited')` |
| `src/permission/PermissionMap.js` | 194 | `setGanttFolderLink` | → `W('PROJECT','inherited')` |
| `src/permission/ResourceCatalog.js` | 11, 45 | 카탈로그 키 등재(주석 + 엔트리) | **키 존치**, 주석에 미사용 전환 명시(§2) |

### 프론트 / i18n (건드리지 않음 — 프론트 에이전트 담당)
| 파일 | 참조 성격 |
|---|---|
| `static/ui/src/pages/projectDetail/work/ProjectTreeView.jsx` | `canWrite('PROJECT_GANTT')` 프론트 게이트 |
| `static/ui/src/pages/projectDetail/work/ProjectWorkPanel.jsx` | 프론트 게이트 |
| `static/ui/src/components/tabs/ProjectDetailTabs.jsx` | 탭 `canRender` |
| `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx` | 프론트 게이트 |
| `locales/kr/permission.json` / `locales/en/permission.json` | `permission.desc.PROJECT_GANTT` 라벨 |

> ⚠️ 프론트가 아직 `canRead/canWrite('PROJECT_GANTT')` 를 참조하는 동안 카탈로그 키를 제거하면 `userPermissionCheck` 응답에서 그 키가 빠져 **fail-close 로 간트가 막힌다**. 이것이 §2 결정의 핵심 근거다.

---

## 2. 카탈로그/시드 영향 조사 및 결정

### 결정: **`ResourceCatalog` 의 `PROJECT_GANTT` 키를 제거하지 않고 존치(미사용 처리)한다.**

### 조사 내용
`ResourceCatalog.CATALOG` 는 프로젝트의 권한 단일 소스로, 아래 4가지가 전부 여기서 파생된다:
1. 시드 Admin/Member 세트 생성 (`getSeedPages`, onInstall)
2. 커스텀 세트 마이그레이션 (`mergeSetPages`)
3. `userPermissionCheck` 응답 병합
4. `getPermissionCatalog` 응답 (백오피스 권한 UI 노출)

`PROJECT_GANTT` 는 카탈로그 14키 중 하나(`admin:{t}, member:{rf}, defaultForNew:{ff}, migrateFrom:'PROJECT'`)로, 기존 설치 사이트의 KVS 권한 세트에 `pageId:'PROJECT_GANTT'` 값이 저장돼 있다.

### 제거 vs 존치 영향 비교

| | **키 제거** | **키 존치(채택)** |
|---|---|---|
| 서버 가드 | 어차피 참조 0 (PermissionMap 전부 PROJECT) | 동일 — 참조 0 |
| `userPermissionCheck` 응답 | PROJECT_GANTT 빠짐 → 프론트 `canRead('PROJECT_GANTT')` 잔존분이 **fail-close 로 false** → 간트 즉시 차단 | 응답에 계속 포함 → 프론트 잔존 게이트가 정상 동작(간트 안 막힘) |
| 기존 KVS 저장값 | `mergeSetPages` 가 고아 키를 자동 드롭(안전) — 하지만 응답 완전성이 깨져 프론트가 깨짐 | 저장값 그대로 유지, 어떤 가드도 안 읽어 **무해(inert)** |
| SEED_VERSION 마이그레이션 | 카탈로그 14→13 → 시드/마이그레이션 재생성 검토 필요 | **불필요** (카탈로그 불변) |
| 백오피스 권한 UI | 간트 토글 사라짐(목표엔 부합) | 간트 토글 잔존(미사용, 약간 혼란) |
| 동시성 안전 | 프론트 에이전트가 아직 작업 중이라 **깨질 위험** | **안전** |

### 채택 근거 (안전한 쪽)
1. **fail-close 안전**: 프론트가 `canRead/canWrite('PROJECT_GANTT')` 를 제거하기 전까지 `userPermissionCheck` 가 이 키를 계속 내려줘야 간트가 안 막힌다. 두 에이전트가 동시 작업 중이라 배포 순서를 보장할 수 없다 → 키를 내리는 순간 어느 배포에서 간트가 죽을 수 있다.
2. **마이그레이션 0**: 카탈로그가 불변이므로 `SEED_VERSION` 증가·KVS 리셰이핑·기존 세트 재마이그레이션이 전부 불필요하다. 리스크 표면이 없다.
3. **저장값 무해성 확인**: 서버 가드(`isSatisfied`)는 `PERMISSION_MAP` 의 grants 가 지정한 리소스만 조회한다. PermissionMap 에서 `PROJECT_GANTT` 를 전부 없앴으므로 KVS 에 남은 `PROJECT_GANTT` 값은 **어떤 가드도 읽지 않는 죽은 데이터**다(무해).
4. **되돌리기 쉬움**: 존치는 순수 additive-safe. 프론트가 잔존 게이트를 모두 `PROJECT` 로 옮긴 뒤, 카탈로그 키 제거 + (원하면) `SEED_VERSION` 정리를 **한 번의 조율된 후속 작업**으로 처리하면 된다. `mergeSetPages` 가 이미 고아 키를 우아하게 드롭하므로 그때도 데이터 마이그레이션은 실질 불필요.

### 존치의 유일한 단점과 처리
백오피스 권한 UI 에 간트 토글이 남아 사용자가 켜고 끌 수 있으나 **아무 효과가 없다**. → `ResourceCatalog.js` 주석에 "미사용 전환(2026-07-23)" 을 명시했고, 계약 테스트로 "어떤 가드도 PROJECT_GANTT 를 참조하지 않음" 을 고정했다. 토글 제거는 프론트 정리 완료 후 후속 조율 항목으로 남긴다.

---

## 3. resolver → 권한 매핑 전/후 표 (프론트 전달용)

| resolver | 종류 | **변경 전** | **변경 후** |
|---|---|---|---|
| `getProjectGanttData` | 읽기 | `R('PROJECT_GANTT','detail')` | `R('PROJECT','detail')` |
| `updateGanttSchedule` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `setGanttParent` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `setGanttLink` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `createGanttFolder` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `renameGanttFolder` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `moveGanttFolder` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `deleteGanttFolder` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `setGanttIssueFolder` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |
| `setGanttFolderLink` | 쓰기 | `W('PROJECT_GANTT','inherited')` | `W('PROJECT','inherited')` |

- 읽기 scope `detail`, 쓰기 scope `inherited` 는 **변경 없음** — 리소스 키만 `PROJECT_GANTT` → `PROJECT` 로 교체.
- `R('PROJECT','detail')` 는 `findProjectById` 등 기존 프로젝트 상세 읽기 관례와 동일 스코프 수준.
- `W('PROJECT','inherited')` 는 `insertProjectusers`/`updateIssueCoworkers` 등 기존 프로젝트 자식키 쓰기와 동일.

### 프론트가 알아야 할 것
- **간트 편집 게이트는 이제 `canWrite('PROJECT')`, 조회 게이트는 `canRead('PROJECT')`** 로 전환하면 서버 가드와 정합된다.
- 서버는 `PROJECT_GANTT` 를 더 이상 판정에 쓰지 않는다. 프론트가 `canRead/canWrite('PROJECT_GANTT')` 를 계속 호출해도 **당장은** 동작한다(카탈로그 키 존치 → `userPermissionCheck` 가 값을 내려줌). 다만 그 값은 실제 서버 판정과 무관해질 수 있으므로(관리자가 PROJECT write 만 주고 GANTT 를 껐다면 UI 는 막지만 서버는 허용), 프론트 게이트를 **`PROJECT` 로 옮기는 것이 정합**이다.

---

## 4. 변경 파일

| 파일 | 변경 |
|---|---|
| `src/permission/PermissionMap.js` | 간트 10종 리소스 키 `PROJECT_GANTT` → `PROJECT` (scope 불변). 결정 주석 추가 |
| `src/permission/ResourceCatalog.js` | `PROJECT_GANTT` 엔트리 **존치**, 주석에 미사용 전환 근거 명시 (기능 변경 0) |
| `test/permission/permissionMap.contract.test.js` | 신규 계약 2건: "PROJECT_GANTT 를 어떤 grant 도 참조하지 않음", "간트 10종이 PROJECT 로 매핑됨" |

**무변경(제약 준수)**: 프론트 4파일 + locales 2파일 손대지 않음. GanttController resolver 등록 이름 불변 → 계약 테스트(등록↔매핑) 자동 통과. manifest/DDL/시드/SEED_VERSION 불변.

---

## 5. fail-close 원칙 확인

- 매핑이 빠진 간트 resolver **없음** — 10종 전부 `PROJECT` 로 재매핑, 계약 테스트 "(1) 등록된 모든 함수는 매핑돼 있다" 통과.
- `PROJECT` 는 `ResourceCatalog` 유효 키 → 구조 유효성 테스트 통과.
- deny-by-default 유지: 매핑 없는 함수는 `guardedDefine` 이 자동 거부(`PERMISSION_UNMAPPED`). 이번 변경으로 새로 미매핑된 함수 없음.

---

## 6. `npm test` 결과

```
Test Suites: 16 passed, 16 total
Tests:       305 passed, 305 total
```
- `permissionMap.contract.test.js` 6건 통과(신규 2건 포함).
- 나머지(work-assignment 등) 회귀 없음.
