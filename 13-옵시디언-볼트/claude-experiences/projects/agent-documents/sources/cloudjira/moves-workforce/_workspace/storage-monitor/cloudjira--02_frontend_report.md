# 02 Frontend Report — 저장공간 관리

> 작성: frontend-engineer
> 작성일: 2026-07-02
> 작업 위치(코드): 워크트리 `C:\CloudJira\moves-workforce-rfc151\` (브랜치 RFC-151)
> 입력: `_workspace/storage-monitor/DESIGN.md` §4 프론트 설계·§6 i18n·§10 frontend 체크리스트 + `02_backend_report.md` §1 응답 shape
> 리더 확정 반영: 이름 "저장공간 관리"(en "Storage Management"), "시스템" 그룹 신설, 테이블 렌더 = 공통 `CommonTable`

---

## 1. 소비하는 백엔드 응답 shape (계약 일치 확인)

- resolver: `invoke('getStorageUsage')` (입력 없음)
- 소비 경로: **`res.content`** (중첩) — `res` 최상위엔 `success`만. backend report §1 / DESIGN §2-B와 글자 그대로 일치.

```
res.content = {
  limitBytes, totalBytes, totalRows, usedPercent,
  tables: [{ name, dataBytes, rows }],   // dataBytes DESC 정렬 완료(backend)
  generatedAt
}
```

- `useStorageUsage.js`: `if (!res?.success || !res.content) throw new Error(res?.error?.code || 'STORAGE_USAGE_QUERY_FAILED')` → React Query `isError` 경로.
- 게이지: `usedPercent`/`totalBytes`/`limitBytes` 소비, 막대 폭 `min(usedPercent,100)`, 숫자는 실제값 표기(100 초과 대비).
- 테이블: `tables[].name` / `formatBytes(dataBytes)` / `rows.toLocaleString()`. 재정렬 안 함(백엔드 정렬 신뢰), 컬럼 정렬 UX는 `sortKey`(실제 바이트/행수)로 제공.
- **임계치 판정은 프론트 단일 정의**(`storageConstants.js` 80/90) — 서버 응답에 임계치 없음(이중 정의 없음).

> 계약 이탈 없음. shape 모호/불일치 없음.

## 2. 신규/수정 파일 (전부 워크트리 `moves-workforce-rfc151`)

### 신규 (`static/ui/src/backoffice/page/storage/`)
| 파일 | 내용 |
|------|------|
| `storageConstants.js` | `STORAGE_THRESHOLDS {WARNING:80,CRITICAL:90}` + `levelOf(p)` |
| `useStorageUsage.js` | `useQuery` + `invoke('getStorageUsage')`, `res.content` 소비, staleTime 60s |
| `StorageUsageGauge.jsx` | 수평 막대 게이지(레벨별 색) + `StatusLozenge`(레벨 배지) + `InfoTip`(추정치 고지) + warning/critical `SectionMessage` |
| `StorageTableList.jsx` | `CommonTable`(테이블명/데이터 크기/행수), `sortKey`로 실제값 정렬, 빈 상태 메시지 |
| `StoragePage.jsx` | 권한 게이트(`canRead('STORAGE_MONITORING')`) + 로딩(Spinner)/에러(SectionMessage) + 게이지·리스트 조립 |

### 신규 (공통 유틸)
| 파일 | 내용 |
|------|------|
| `static/ui/src/utils/format/formatBytes.js` | bytes → KiB/MiB/GiB/TiB (이진 1024) |

### 수정
| 파일 | 변경 |
|------|------|
| `static/ui/src/constants/pages.jsx` | `PAGE_IDS`에 `"STORAGE_MONITORING"` + `getPages` SETTINGS 섹션에 항목(label `common.pages.storage`) |
| `static/ui/src/utils/queryKey/backofficeKeys.js` | `storageUsage: () => ["storage","usage"]` 팩토리 추가 |
| `static/ui/src/App.jsx` | `import StoragePage` + `<Route path="/backoffice/storage" element={<StoragePage/>} />` |
| `static/ui/src/components/dropdown/BackofficeDropdown.jsx` | "시스템" 그룹 신설(`common.backoffice.systemSetting.group`) + 항목(`isReadable("STORAGE_MONITORING")` 게이트, `DatabaseIcon`) |
| `locales/kr/common.json`·`locales/en/common.json` | `backoffice.systemSetting.{group,storage.title,storage.description}` + `pages.storage`(en엔 누락됐던 `pages.public`도 함께 보강) |

### 신규 (i18n)
| 파일 | 내용 |
|------|------|
| `locales/kr/storage.json`·`locales/en/storage.json` | `page/noPermission/gauge/level/warn/notice/table/error` 전 키. `page.title` = "저장공간 관리"/"Storage Management"(리더 확정) |

## 3. 쿼리키 / 권한 / 규약 준수
- 쿼리키: `backofficeKeys.storageUsage()` 팩토리로만 사용(인라인 배열 0건).
- 권한 게이트: 페이지 `canRead('STORAGE_MONITORING')`, 메뉴 `isReadable('STORAGE_MONITORING')` — `PortfolioDashboard`/타 백오피스와 동일 패턴.
- `ko-KR.json`/`en-US.json` 직접 수정 안 함 — kr/en 소스만 수정 후 merge.

## 4. i18n merge 여부
- `cd static/ui && npm run merge` **실행 완료**. 생성물 검증:
  - `ko-KR.json`: `storage.page.title`="저장공간 관리", `common.backoffice.systemSetting.storage.title`="저장공간 관리", `common.pages.storage`="저장공간 관리" 확인.
  - `en-US.json`: `storage.page.title`="Storage Management", `common.backoffice.systemSetting.group`="System", `common.pages.storage`="Storage Management" 확인.

## 5. 빌드 결과
- 명령: `$env:CI='false'; npm --prefix ...\static\ui run build`
- 결과: **성공** ("The build folder is ready to be deployed."). 에러 없음(번들 크기 권고 경고만 — 기존과 동일, 신규 코드 무관).

## 6. 주의 / 인계 (verifier)
- 3개 경로 UI 처리 확인 대상: 정상(게이지+리스트), 빈 결과(`tables:[]` → 게이지 0% + 테이블 empty 메시지), 쿼리 실패(`isError` → SectionMessage error), 권한 없음(`canRead=false` → warning).
- 기존 설치 Member 노출(§7.3 (A) 수용)은 backend/권한 시드 이슈 — 프론트는 `canRead` 게이트만 신뢰(정상 동작).
- `formatBytes`는 이진 단위(1024). `limitBytes`=1 GiB 표기 = "1.0 GiB".

---

## 7. 후속 확장 — 프로젝트별 사용량 + 테이블 설명 컬럼 (additive, 2026-07-03)

> 작업 위치: **메인 트리** `C:\CloudJira\moves-workforce\` (RFC-134, RFC-151 머지 완료). 워크트리 삭제됨.
> 소비 계약: backend report §5-1 — 기존 `content` 필드 무변경 + `projects`/`unassignedBytes` 2필드 additive.

### 7-1. 소비 shape (계약 일치)
- `content.projects: [{ projectId, name, estimatedBytes, rows }]` — estimatedBytes DESC(backend 정렬). 프론트 재정렬 없음.
- `content.unassignedBytes: number` — 공통 영역. 실패 시에도 항상 존재(`projects:[]` / `unassignedBytes=totalBytes` 폴백) → 안전 소비.
- 비중% = `estimatedBytes / totalBytes * 100`(소수1, totalBytes=0 방어 → '0').

### 7-2. 신규/수정 파일 (메인 트리)
| 파일 | 변경 |
|------|------|
| `static/ui/src/backoffice/page/storage/StorageProjectList.jsx` | **신규** — 프로젝트명/추정 크기/비중%/행수, 마지막 "공통 영역(프로젝트 무관)" 행(unassignedBytes, 행수 '-'), `projects:[]`면 empty 안내. `InfoTip`로 추정치 고지. `CommonTable` 사용 |
| `static/ui/src/backoffice/page/storage/StorageTableList.jsx` | 수정 — "설명" 컬럼 추가(`storage.tableDesc.<테이블명>` 조회, 미존재 키면 '-') |
| `static/ui/src/backoffice/page/storage/StoragePage.jsx` | 수정 — 게이지 아래·테이블별 상세 위에 `<StorageProjectList data={data} />` 삽입 |
| `locales/kr/storage.json`·`locales/en/storage.json` | 수정 — `project.*`(신규 섹션) + `table.col.desc` + `tableDesc.*`(8개 테이블 설명) 키 추가 |

### 7-3. i18n merge 여부
- `cd static/ui && npm run merge` **실행 완료**. 생성물 검증: `ko-KR.json` `storage.project.title`="프로젝트별 사용량", `storage.tableDesc.portfolio_project_snapshot`="전사 대시보드 스냅샷(배치 누적)"; `en-US.json` `storage.project.common`="Shared (not project-scoped)", `storage.table.col.desc`="Description" 확인.

### 7-4. 빌드 결과
- `$env:CI='false'; npm --prefix ...\static\ui run build` → **성공** ("The build folder is ready to be deployed.", warnings only — 신규 코드 무관).

### 7-5. 주의
- 테이블 설명은 `storage.tableDesc.<name>` 키가 있는 8개 테이블만 노출, 그 외는 '-'(Forge i18n `t()`가 미존재 키를 키 문자열로 반환 → `v===key` 가드로 '-' 대체).
- "공통 영역" 행은 정렬 UX에서 하단 유지를 지향(`sortKey:-1`)하나 DynamicTable 정렬 방향에 따라 위치 변동 가능 — 데이터 성격상 허용.
