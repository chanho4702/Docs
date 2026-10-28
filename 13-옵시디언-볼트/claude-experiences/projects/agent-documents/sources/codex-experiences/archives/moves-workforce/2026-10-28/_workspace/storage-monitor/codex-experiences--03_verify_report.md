# 03 Verify Report — 저장공간 관리 (Storage Monitoring)

> 작성: integration-verifier
> 작성일: 2026-07-02
> 검증 대상: 워크트리 `C:\CloudJira\moves-workforce-rfc151\` (브랜치 RFC-151)
> 기준: `_workspace/storage-monitor/DESIGN.md` §2 경계면 계약(단일 진실) + 02_backend/frontend_report
> 결론: **전 항목 통과. 실패(P0/P1) 없음.** 미검증 1건(P0 information_schema 실측 — 런타임 배포 검증 필요, 코드상 graceful).

---

## 종합 결과

| 분류 | 건수 |
|------|------|
| 통과 | 8/8 검증 항목 |
| 실패 | 0 |
| 미검증 | 1 (P0 information_schema 런타임 실측 — 리더 지시로 배포 검증 갈음) |

- `npx jest src/resolver/storage`: **7 passed**
- 루트 전체 `npx jest`: **6 suites / 91 tests passed**
- 프론트 빌드(`CI=false ... run build`): **성공** ("The build folder is ready to be deployed.")
- 워크트리 오염: **의도 파일만 변경**. 메인 트리 무수정.

---

## 1. 경계면 교차 (응답 shape) — 통과

생산자 `StorageService.getStorageUsageService`(StorageService.js:38-47) ↔ 소비자 `useStorageUsage`(useStorageUsage.js:15-19) 글자 단위 대조.

| 필드 | 생산(Service) | 소비(Front) | 판정 |
|------|--------------|-------------|------|
| 래핑 | `return { content: {...} }` → responseWrapper가 `{success:true, content}` | `res.content` 소비 (`!res.content` 방어) | ✓ |
| limitBytes/totalBytes/totalRows/usedPercent | 최상위 number | 게이지에서 그대로 소비(Gauge.jsx:29-31) | ✓ |
| tables[].name/dataBytes/rows | `{name, dataBytes, rows}` (Service:24-28) | TableList `tbl.name/dataBytes/rows`(TableList.jsx:24-34) | ✓ |
| generatedAt | `new Date().toISOString()` | 미소비(v1 표시 안 함, 계약상 허용) | ✓ |

- SQL alias `name/data_bytes/rows_est`(StorageQuery.js:14-16) → Service `r.name/r.data_bytes/r.rows_est`(Service:24-27) 정확히 매핑. snake→camel 변환 일치.
- `executeQuery`는 `{rows}` 반환, Repository `result?.rows ?? []`(StorageRepository.js:11) 정확히 unwrap.
- 실패 경로: Service가 `SqlError(STORAGE_USAGE_QUERY_FAILED,...)` 재-throw(Service:20) → responseWrapper `{success:false,error}` → Front `res.success===false` 분기 `throw new Error(res.error.code)`(useStorageUsage:16-17) → React Query `isError` → SectionMessage(error). 3면 일치.

## 2. 계산 정합 — 통과

- `usedPercent = Math.round((totalBytes/limitBytes)*1000)/10`(Service:34-35) = DESIGN §2-B `round(*100,1)`와 수학적 동치. 테스트로 68.4 실측 확인.
- `limitBytes=0` 방어 → `usedPercent=0`(Service:34). resolveLimitBytes는 `>0`만 통과(storageConstants.js:23)라 실제 0 불가하나 이중 방어 존재.
- tables 정렬: SQL `ORDER BY data_bytes DESC` + Service `.sort((a,b)=>b.dataBytes-a.dataBytes)`(Service:29) 이중. 테스트에서 오름차순 입력→내림차순 출력 검증.
- Σ 합산: `totalBytes/totalRows = reduce`(Service:31-32). 테스트 734556160 / 101712 확인.
- 프론트 게이지 clamp: `barWidth = Math.min(usedPercent,100)`(Gauge.jsx:35), 숫자 표기는 실제값 `({usedPercent}%)`(Gauge.jsx:50). 100 초과 대비 정확.
- 임계치 단일 정의: `STORAGE_THRESHOLDS={WARNING:80,CRITICAL:90}`(storageConstants.js:5, 프론트 전용). 서버 응답에 임계치 미포함(Service 반환 객체 확인). 이중 정의 없음.

## 3. 권한 3면 일관성 — 통과

- SeedData: Admin `STORAGE_MONITORING {read:true,write:true}`(SeedData.js:44), Member `{read:false,write:false}`(SeedData.js:64).
- PermissionService 미등록 fallback: `{read:false,write:false}`(PermissionService.js:147).
- 프론트: `PAGE_IDS`에 `"STORAGE_MONITORING"`(pages.jsx:41) + 페이지 게이트 `canRead('STORAGE_MONITORING')`(StoragePage.jsx:13) + 메뉴 `isReadable("STORAGE_MONITORING")`(BackofficeDropdown.jsx:101).
- 3면(시드/fallback/프론트) 문자열·의미 일치.
- **알려진 한계(DESIGN §7.3 (A) 수용 — 실패 아님):** 기존 설치는 시드 멱등(`if existing continue`)으로 `STORAGE_MONITORING`이 권한 응답에 없음 → usePermissionStore fallback이 미등록 pageId를 `{read:true}` 처리 → 기존 설치 Member 노출 가능. 리더 (A) 수용 확정(읽기 전용·저민감). 신규 설치는 Member=false 정상.

## 4. 등록 배선 — 통과

- `src/index.js:27` import + `:58` `registerStorageController(resolver)` 호출.
- Controller `resolver.define('getStorageUsage', responseWrapper(...))`(StorageController.js:9-12) — invoke fnName 일치.
- App.jsx:25 import + :88 `<Route path="/backoffice/storage" element={<StoragePage/>}/>`.
- BackofficeDropdown.jsx:101-112 "시스템" 그룹 + 항목(DatabaseIcon import:11 확인).
- backofficeKeys.storageUsage `() => ["storage","usage"]`(backofficeKeys.js:15). 인라인 쿼리키 **0건**(useStorageUsage가 팩토리만 사용).

## 5. i18n — 통과

- `locales/kr/storage.json`·`en/storage.json` 신규 — 소비 키 전부 존재:
  page.title/description, noPermission, gauge.title/of, level.normal/warning/critical, warn.warning/critical, notice.estimate, table.title/col.name/col.size/col.rows/empty, error.title/description. **누락 0건.**
- `common.json` kr/en: `backoffice.systemSetting.{group,storage.title,storage.description}` + `pages.storage` 존재(kr:81/137, en:81/137).
- merge 산출 반영 확인: `ko-KR.json`/`en-US.json` 모두 `storage` 네임스페이스(line 1523) + `common.backoffice.systemSetting.storage`(line 211) + `common.pages.storage`(line 153) 존재. ko-KR="저장공간 관리", en-US="Storage Management".
- ko-KR/en-US 직접 수정 아님(kr/en 소스 → merge 경로 준수). 제목 "저장공간 관리" 확인(리더 확정: en="Storage Management").

## 6. 에러/빈 경로 — 통과

- SQL 실패: `STORAGE_USAGE_QUERY_FAILED` → `isError` → `SectionMessage(error)` title/description(StoragePage.jsx:33-37). 테스트로 재-throw 검증.
- tables 빈 배열: Service `tables:[], 전부 0`(테스트 확인) → 게이지 0%/normal + CommonTable `emptyMessage={t('storage.table.empty')}`(TableList.jsx:46) → `emptyView` 렌더(CommonTable.jsx:32-34).
- 권한 없음: `!canRead` → `SectionMessage(warning) noPermission`(StoragePage.jsx:16-23).

## 7. 실행 검증 — 통과

```
npx jest src/resolver/storage → 7 passed
npx jest (전체)                → 6 suites / 91 passed
프론트 빌드                     → 성공 (번들 크기 권고 경고만, 기존과 동일·신규 무관)
```

## 8. 워크트리 오염 — 통과

`git -C ...rfc151 status --short`: 변경 파일이 DESIGN §1 영향 범위와 정확히 일치(수정 12 + 신규 5디렉토리/2 locale). build 폴더는 gitignore. 메인 트리(`moves-workforce`)는 기존 gantt 작업(.gitignore/GANTT.md/CALCULATION.md)만 존재 — 본 검증이 손대지 않음.

---

## 미검증 (추측 통과 금지)

| # | 항목 | 사유 | 위험/완화 |
|---|------|------|-----------|
| P0 | Forge SQL(TiDB)에서 `information_schema.tables`+`DATABASE()` 실제 조회 허용 여부 | 런타임(forge tunnel) 미수행 — 리더 지시로 배포 검증 갈음 | 조회 불가 시 `executeQuery`→SqlError→`STORAGE_USAGE_QUERY_FAILED`→`isError` SectionMessage로 **graceful degrade**(크래시 아님). 기능 성립 자체는 배포 후 실측 필요. |

## 참고(경미, 조치 불필요)

- 게이지 한도 표기 `formatBytes(1073741824)="1.0 GiB"` — DESIGN 예시 "1 GiB"와 소수 표기만 상이. digits=1 유틸 일관 동작이라 계약 위반 아님.
