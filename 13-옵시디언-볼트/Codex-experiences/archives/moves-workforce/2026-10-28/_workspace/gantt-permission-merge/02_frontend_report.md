# 간트 권한 통합 (PROJECT_GANTT → PROJECT) — 프론트엔드 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **입력**: `01_backend_report.md` (백엔드가 간트 resolver 10종을 `PROJECT_GANTT` → `PROJECT` 로 재매핑, 카탈로그 키는 존치)
- **목표 상태**: PROJECT read 면 간트/트리 조회, PROJECT write 면 편집.
- **검증**: `npm test` → **16 suites / 202 tests 통과** · `npm run build` → 신규 경고 0(기존 node_modules 소스맵 3건만)

---

## 1. 전환한 파일:라인 목록

`static/ui/src` 전역 `PROJECT_GANTT` grep → **live 게이트 4파일 + 백오피스 필터 1파일**. locales 는 유지(§3).

### 프론트 권한 게이트 (canRead/canWrite 전환)
| 파일:라인 | 변경 전 | 변경 후 |
|---|---|---|
| `pages/projectDetail/work/ProjectWorkPanel.jsx:32` | `canRead('PROJECT_GANTT')` | `canRead('PROJECT')` |
| `pages/projectDetail/work/ProjectTreeView.jsx:85` | `canWrite('PROJECT_GANTT')` | `canWrite('PROJECT')` |
| `pages/projectDetail/gantt/GanttPage.jsx:48` | `canRead('PROJECT_GANTT')` | `canRead('PROJECT')` |
| `pages/projectDetail/gantt/GanttPage.jsx:49` | `canWrite('PROJECT_GANTT')` | `canWrite('PROJECT')` |

관련 docblock/주석도 함께 갱신(`ProjectWorkPanel:26-27`, `GanttPage:40-42`, `ProjectTreeView:85`, `ProjectDetailTabs.jsx:13-14`). `ProjectDetailTabs.jsx` 는 **주석만** 있었고 실제 게이트는 없었다(뷰 전환 게이트는 `ProjectWorkPanel` 이 소유).

### 백오피스 권한 UI — PROJECT_GANTT 토글 숨김
| 파일:라인 | 변경 |
|---|---|
| `hooks/usePermissionCatalog.js:27, 40` | `HIDDEN_CATALOG_KEYS = new Set(['PROJECT_GANTT'])` 추가, `PAGES` 조립 시 `resources.filter(r => !HIDDEN_CATALOG_KEYS.has(r.key))` |

- **숨기는 위치**: `usePermissionCatalog` 훅이 서버 카탈로그(`getPermissionCatalog`)를 `PAGES`/`PAGE_LIST` 로 어댑팅하는 **단일 choke point**다. 권한 등록/수정 모달과 목록 뷰가 전부 이 훅을 통하므로 여기서 한 번 걸러내면 세 화면 모두에서 토글이 사라진다.
- **방식**: 카탈로그 **데이터 삭제가 아니라 프론트 UI 필터**. 서버는 `PROJECT_GANTT` 를 계속 카탈로그/`userPermissionCheck` 에 내려주고(fail-close 안전), 프론트는 백오피스 토글에서만 감춘다.
- `PROJECT_GANTT` 는 `WORKFORCE` 섹션(DASHBOARD/REPORT/KANBAN/PROJECT/PROJECT_COST/RESOURCE_MANAGEMENT 와 동석)이라 필터 후에도 **섹션이 비지 않는다** → 빈 섹션 렌더 문제 없음.

---

## 2. 서버 fail-close 정합 대조 (게이트별)

UI 가 열리는데 서버가 거부하는 조합이 없어야 한다. 백엔드 매핑표(§3)와 게이트별 대조:

| UI 게이트 | 소비 resolver | 서버 매핑 | 정합 |
|---|---|---|---|
| `ProjectWorkPanel` 트리/간트 뷰 노출 = `canRead('PROJECT')` | `getProjectGanttData` | `R('PROJECT','detail')` | ✅ read↔read |
| `GanttPage` 조회 = `canRead('PROJECT')` | `getProjectGanttData` | `R('PROJECT','detail')` | ✅ |
| `GanttPage` 편집(일정 드래그·M3 링크/부모) = `canWrite('PROJECT')` | `updateGanttSchedule`/`setGanttParent`/`setGanttLink` 등 9종 | `W('PROJECT','inherited')` | ✅ write↔write |
| `ProjectTreeView` 편집(연관 관계 편집 포함) = `canWrite('PROJECT')` | 동일 write 9종(간트와 같은 mutation 훅 재사용) | `W('PROJECT','inherited')` | ✅ |

- **UI 가 열리는데 서버가 막는 조합 없음.** 전환 전에는 오히려 반대 위험이 있었다 — 관리자가 PROJECT write 만 주고 GANTT 를 껐다면 서버는 이제 허용하는데 UI 는 (구 게이트로) 막았다. 전환으로 이 불일치가 해소된다.
- 반대 방향(서버는 막는데 UI 가 여는) 조합도 없다 — read/write 축과 리소스 키가 서버와 1:1 일치.

---

## 3. locales 처리 — **유지**(삭제 안 함)

`common.pages.gantt`(라벨), `permission.desc.PROJECT_GANTT`(설명) 두 키.

- **프론트 코드에서 직접 `t()` 로 참조하는 곳 0건**(grep 확인). 이 두 키는 오직 **서버 카탈로그의 `labelKey`/`descriptionKey` 문자열**을 통해 간접 참조된다.
- 백엔드가 카탈로그 엔트리를 **존치**(01_backend_report §2)했으므로 서버는 여전히 `labelKey:'common.pages.gantt'`, `descriptionKey:'permission.desc.PROJECT_GANTT'` 를 내려준다. 즉 **참조하는 데이터가 서버에 살아 있다** → "사용처가 남으면 유지" 원칙에 따라 삭제하지 않는다.
- 지금 삭제하면, 카탈로그 키 존치 상태에서 누군가 프론트 필터를 걷어내는 순간 라벨이 raw 키로 노출되는 잠재 버그가 된다. locale 정리는 **백엔드 카탈로그 키 제거와 함께** 하는 조율된 후속 작업으로 남긴다(백엔드 리포트 §2 의 후속 정리 항목과 동일 시점).
- **주의**: 간트 뷰 토글 라벨은 `projectDetail.work.view.gantt` 로 **다른 키**이며 `ProjectWorkPanel` 에서 계속 활발히 사용된다(무관).
- → locale 변경 없음 = **`npm run merge` 불필요**.

---

## 4. 뷰 노출 조건 변화 확인

- **새 동작**: 기존에 `PROJECT_GANTT` read 가 없어 트리/간트가 숨겨졌던 사용자도, 이제 `PROJECT` read 면 보인다. 프로젝트 상세에 진입한 사용자는 사실상 전부 `PROJECT` read 보유자이므로 트리/간트가 기본 노출된다(목표 상태와 일치).
- **`ProjectWorkPanel` "항목 하나면 토글 숨김" 로직**: `canReadGantt`(이제 `canRead('PROJECT')`)가 false 면 `items` 에 table 만 남아 `items.length > 1` 이 false → 토글 미노출. true 면 table/tree/gantt 3개 → 토글 노출. **새 조건에서도 자연 동작**한다. 현재 뷰가 선택 불가가 되면 첫 뷰로 되돌리는 effect(`:60-62`)도 그대로 유효.

---

## 5. 잔존 `PROJECT_GANTT` 참조 (의도된 것만)

live 게이트는 0건. 남은 참조는 전부 의도적이다:
- `usePermissionCatalog.js:27` — `HIDDEN_CATALOG_KEYS` 집합(백오피스 숨김 대상)
- 각 파일의 전환 근거 주석(`ProjectWorkPanel`/`GanttPage`/`ProjectTreeView`/`ProjectDetailTabs`)

`canRead('PROJECT_GANTT')` / `canWrite('PROJECT_GANTT')` 호출은 **코드베이스에 0건**(grep 확인).

---

## 6. 검증 결과

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **16 suites / 202 tests 통과** (회귀 0 — 권한 게이트 전환은 렌더 계층이라 기존 순수함수 테스트 불변) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, 신규 코드 유래 경고 0 |
| 공용 컴포넌트 | 수정 0건 |
| i18n | 변경 없음(§3) → merge 불필요 |

**변경 파일**: `pages/projectDetail/work/ProjectWorkPanel.jsx`, `pages/projectDetail/work/ProjectTreeView.jsx`, `pages/projectDetail/gantt/GanttPage.jsx`, `components/tabs/ProjectDetailTabs.jsx`(주석), `hooks/usePermissionCatalog.js`
