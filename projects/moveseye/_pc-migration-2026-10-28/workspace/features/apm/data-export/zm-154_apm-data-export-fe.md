# ZM-154 작업 보고 — APM 데이터 기간 지정 내보내기 FE

- 작성일: 2026-09-22 · 범위: **FE**(F1~F5, F7~F9. F6 제외 — 지시대로)
- 상태(09-22): ✅ **FE master 병합 `39ece8e`**(미푸시, master `739ae89` 위로 rebase) · 워크트리·브랜치 정리됨
- 병합 전 확인: `typecheck:contract` 0 · `tsc` 0 · eslint 0 · jest 내보내기 2개 + 인접 2개 스위트 89건 통과
- 픽스처 `collecting` 누락은 다른 세션 `739ae89`가 먼저 고쳐 이 커밋에서는 뺐다(중복 키 방지)
- 🔴 남은 것: F6(지시대로 제외) · **브라우저** 실제 다운로드 확인(파일 저장 대화상자·`saveAs` 경로). BE EP 자체는 09-22 curl로 실측 통과(아래 §4.1)
- 09-22 재확인(세션 장애 후 인수): master `39ece8e` 실물·파일 15개 존재·jest 3스위트 57건·`typecheck:contract` 0·`tsc` 0 재실행 통과
- `node_modules`는 `C:\solutions\moveseyee_fe\node_modules` 정션(설치 안 함)
- 근거: 계약 [`./contract_apm-data-export.md`](contract_apm-data-export.md) · BE 보고 [`zm-154_apm-data-export.md`](zm-154_apm-data-export.md) §3
- BE 코드: 작업 중 `C:/worktrees/zm-154-be`가 사라졌다(BE master `b2c564a`로 병합·정리된 것으로 보임). 이후 대조는 **`moveseye-be-spring` master**에서 했다.

---

## 1. 바꾼 파일 (수정 9 · 신규 6 = 15)

### 수정
| 파일 | 내용 |
|---|---|
| `src/types/apm.ts` | `TApmExportDataset`·`TApmExportFormat`·`TApmExportParams`·`TApmExportServiceRef`·`TApmExportPlan`·`APM_EXPORT_ERROR_CODE`·`TApmExportTooLargeData` (끝에 추가) |
| `src/services/apm.api.ts` | `getExportPlan`(envelope 그대로 반환 — 2겹째는 useDmoveQuery) · `downloadExport`(blob, `application/json`이면 `ApmExportError` throw) · `ApmExportError`(ApiEnvelopeError + `data`) · `APM_EXPORT_DOWNLOAD_TIMEOUT_MS`(10분) |
| `src/hooks/useApm.ts` | `useApmExportPlan(dataset, params, {enabled})` — 폴링 없음, 파라미터 전부 키에 |
| `src/constants/queryKey.ts` | `APM_QUERY_KEYS.EXPORT_PLAN` |
| `src/locales/kr.json` · `en.json` | `apm.export.*` 블록 55줄씩 **줄 단위 삽입**(`"apm": {` 바로 다음 줄, 기존 줄 변경 0) |
| `services/detail/tabs/ApmServiceOverviewTab.tsx` | F3 — 대시보드 툴바 `toolbarLeading` 슬롯에 "RED 내보내기"(`red-series`, service=현재 uid) |
| `services/detail/tabs/ApmServiceTransactionsTab.tsx` | F4 — 상단 "총 N개" 옆에 "엔드포인트 내보내기"(`endpoints`, service=현재 uid) |
| `errors/components/ApmErrorExplorer.tsx` | F5 — 검색창 줄 오른쪽에 "예외 그룹 내보내기"(`error-groups`, 서비스 필터·검색어 전달). **에러 메뉴와 서비스 상세 › 에러 탭이 이 컴포넌트를 공유**하므로 한 곳 수정으로 두 화면에 붙었다(에러 탭은 서비스 고정) |

### 신규
| 파일 | 내용 |
|---|---|
| `pages/application-monitoring/shared/apmExport.ts` | 형식·해상도 선택지, 데이터셋별 지원 여부(해상도=red-series, 원문=error-groups), `apmExportErrorMessage`(F7 오류 문구) |
| `pages/application-monitoring/shared/components/ApmExportButton.tsx` | 공용 버튼. 누른 순간 `useApmTimeRange()`의 from/to를 **고정**해 모달에 넘김 |
| `pages/application-monitoring/shared/components/ApmExportModal.tsx` | antd Modal. 형식(CSV 기본/JSONL)·gzip·해상도(red-series만)·원문(관리자 + error-groups만, 체크 시 경고) → 계획 표시(기간·해상도+승격 태그·행 수/상한·대상 서비스·파일 이름·notes) → `allowed=false`/계획 오류/재조회 중이면 내려받기 비활성 → `saveAs(blob, plan.filename)`. F8 안내(빈 칸 뜻·CSV `'` 접두·CSV 끝 표지·JSONL `_end`·기본 마스킹) |
| `src/__tests__/fixtures/apmExportContractSample.ts` | 계획 DTO 샘플 3종(`: TApmExportPlan`) + TOO_LARGE envelope — 계약 게이트 대상 |
| `src/__tests__/apmExportApi.test.ts` | api 계층 9건 |
| `src/__tests__/ApmExportButton.test.tsx` | 버튼·모달 8건 |

> 공용 컴포넌트 위치는 보고서 §3의 가칭 `components/apm/` 대신 APM 공용 폴더 `pages/application-monitoring/shared/components/`에 뒀다(기존 APM 공용 컴포넌트가 전부 그곳에 있다). 메뉴·라우트는 건드리지 않았다.

---

## 2. 붙인 화면

| # | 화면 | 버튼 | 데이터셋 · 전달값 |
|---|---|---|---|
| F3 | 서비스 상세 › 개요 탭 | 위젯 툴바 편집 버튼 왼쪽 | `red-series` · service=uid |
| F4 | 서비스 상세 › 트랜잭션 탭 | 상단 오른쪽(총 개수 옆) | `endpoints` · service=uid |
| F5 | 에러 분석(메뉴) | 검색창 줄 오른쪽 | `error-groups` · service=툴바 서비스 필터(없으면 전체) · q=검색어 |
| F5 | 서비스 상세 › 에러 탭 | 같은 자리(검색창은 원래 숨김) | `error-groups` · service=uid 고정 |
| F6 | APM 개요 전체 서비스 | **하지 않음**(지시) | — |

---

## 3. 계약과의 차이 · 판단한 것

| # | 항목 | 내용 |
|---|---|---|
| 1 | 계약 = 코드 | 계획 DTO 필드·열 순서·오류 코드·파라미터를 BE master 코드와 대조 — **차이 없음**. `fromAt/toAt`는 `ApmTimeRange.toIso`(Instant 포맷)라 계약대로 UTC |
| 2 | 원문 체크 노출 범위 | 계약은 `rawText`를 모든 데이터셋에서 받지만, 글자 원문이 실리는 열은 `error-groups`의 `sampleStack`뿐이라 **관리자 + error-groups**에서만 보인다 |
| 3 | 엔드포인트 필터 | ~~트랜잭션 탭의 검색어·메서드 필터는 파일에 실리지 않는다~~ → **2026-09-28 정정: 계약 v2에서 `q`·`method`가 추가되어 표와 같은 조건으로 파일에 실린다**(FE 후속 보고 [`zm-154_fe-followup.md`](zm-154_fe-followup.md) "v2 연동" 절). 파일은 페이지·정렬 없이 route→method 순 전량 |
| 4 | 에러 목록 정렬·env | 파일은 정렬·페이지·env 필터를 받지 않는다(계약에 없음). 파일 순서는 기간 안 발생 수 내림차순 |
| 5 | `notes` 언어 | BE가 한국어로만 준다(계약 §3 "그대로 보여 줘도 된다"). 영어 화면에서도 notes는 한국어로 보인다. 그 밖의 문구는 전부 i18n |
| 6 | 다운로드 timeout | 공통 axios 1분 → 이 요청만 10분(`TEN_MINUTES`). 20만 행 스트림이 1분을 넘을 수 있어서 |
| 7 | 창 고정 | 버튼을 누른 순간의 `useApmTimeRange()` from/to를 모달이 끝까지 쓴다(자동 새로고침으로 상대 구간이 흘러도 계획과 파일이 같은 창) |
| 8 | 선택 초기화 | 모달은 열릴 때만 마운트 — 닫으면 형식·해상도·**원문 체크**가 초기화된다(다음 번에 모르고 원문을 받는 것 방지) |

🔄 FE 요청사항(계약서)에 남길 필수 항목은 **없다**. #3은 요구가 생기면 제안할 후보.

---

## 4. 검증 결과

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | ✅ 0 |
| `npx eslint`(바꾼·새 파일 13개) | ✅ 0 |
| `npm run typecheck:contract` | ⚠️ **2건 — 전부 기존 오류(이번 변경 무관)**: `apmContractSample.ts:152`·`apmRumContractSample.ts:188`에 `TApmServiceRow.collecting` 누락. ZM-122 `fa594eb`/`7fcd6f0`(서비스별 수집 중지)이 타입에 필드를 더하고 픽스처를 안 고친 것. 새 `apmExportContractSample.ts`는 오류 0. 다른 세션 영역이라 손대지 않았다 |
| `npx jest` 신규 2개 | ✅ 17/17 (api 9 · 모달 8) |
| `npx jest` 영향 화면 3개(`ApmServiceTransactionsTab`·`ApmServiceDetailPage`·`apmAggScreens`) + api | ✅ 4 스위트 86/86 |
| `apmRoutes.test.tsx` | 메뉴·라우트 미변경이라 생략 |

### 4.1 BE 런타임 실측 (09-22, 재기동 없이 — 실행 중인 :3000이 병합본 포함: 클래스 09:38 빌드 · 프로세스 10:26 기동 · 병합 09:25)

admin(dev 5433) 쿠키 + `x-visitor-id`로 curl. FE가 기대하는 계약이 실제로 그렇게 나오는지 확인한 것:

| 확인 | 결과 |
|---|---|
| 계획 EP `red-series` 7일 | 200 · `stepSeconds=300`(자동) · `rows=8068` · `allowed=true` · 대상 서비스 4개 · `notes` 한국어 2줄 |
| 계획 `step=60` 10일(보존 7일 밖) | `stepSeconds=300`·`requestedStepSeconds=60`·`stepEscalated=true` — 승격 태그 근거 |
| 다운로드 CSV 7일 | 200 `text/csv;charset=UTF-8` · `Content-Disposition: attachment; filename=…csv` · **첫 3바이트 `EF BB BF`(BOM)** · 8,069줄(헤더+8,068) · coverage 분포 DATA 1,653 / NO_DATA 6,407 / PARTIAL 4 / NOT_ROLLED_UP 4 · NO_DATA 행은 수치 칸 전부 빈 칸 |
| 다운로드 JSONL gzip | 200 `application/gzip` · 매직 `1F 8B` · 첫 줄 `_meta`(schemaVersion 1) · 끝 줄 `{"_end":{"rows":0,"truncated":false}}` |
| 실패 = JSON envelope | `from>to` → **HTTP 200** + `application/json` + `errorCode=APM_EXPORT_INVALID`(계획·파일 EP 동일) · 모르는 dataset → `APM_EXPORT_INVALID` · `endpoints` service 누락 → JSON. FE `downloadExport`의 `blob.type.includes("application/json")` 분기가 정확히 이 모양을 받는다 |
| 동시 실행 상한 | 7일·step=60 다운로드 3건 동시 → 2건 CSV, **1건 `429 APM_EXPORT_BUSY`**(HTTP 200 + body code 429) |
| 원문 | 관리자 `rawText=true` 계획 → `rawText=true` 반영(에러 그룹 7일 `rows=18`, `countFromMs` 시간 단위) |
| `Access-Control-Expose-Headers` | `Content-Disposition, X-Apm-Export-*` 노출 — 교차 오리진에서도 파일 이름 헤더를 읽을 수 있다(FE는 계획의 `filename`을 쓰므로 의존하지 않음) |

미확인: 비관리자 계정(원문 체크 미노출·403)은 계정이 없어 못 봤다 · 브라우저 `saveAs` 실제 저장 · 20만 행급 소요 시간.

테스트가 검증하는 것:
- api: 계획은 envelope 그대로(과다 언랩 방지)·빈 파라미터 제거 / blob·gzip은 파일로 통과 / **blob이 `application/json`이면 `ApmExportError`(errorCode·data 보존)** / JSON 파싱 실패도 오류 / 오류 문구 매핑(TOO_LARGE 보간·data 없을 때 폴백·BUSY·INVALID·403은 공통 판정)
- 모달: 누르기 전 계획 조회 없음 → 화면 창·service로 계획 조회 → 파일 이름·행 수·notes 표시 → 내려받기 → `saveAs(blob, plan.filename)` + 계획과 **같은 파라미터**로 다운로드 / `allowed=false` → 비활성·사유·승격 태그·전체 서비스 / 형식 바꾸면 재계획 + JSONL 안내 / 다운로드 TOO_LARGE 문구 / 계획 INVALID 오류 표시·비활성·endpoints엔 해상도 없음 / **비관리자는 원문 체크 없음·rawText=false** / **관리자는 기본 false → 체크 시 경고 + rawText=true 재계획** / 관리자라도 red-series엔 원문 체크 없음

---

## 5. 남은 것

1. 🔴 **런타임 미확인** — BE를 띄우지 않았다(사용자 규칙). 브라우저에서 확인할 것: 실제 파일 저장(CSV BOM·gzip 그대로 저장), 교차 오리진 배포에서 blob 응답의 `Content-Type` 판정, 큰 파일(수만 행) 내려받기 시간, 비관리자 계정에서 원문 체크 미노출.
2. `typecheck:contract` 기존 2건(`collecting` 누락) — ZM-122 담당 세션이 픽스처에 `collecting`(+`collectionPausedAt` 등 같이 추가된 필드가 있으면 그것도) 채우면 0이 된다.
3. ~~계약 차이 #3(엔드포인트 검색어·메서드 필터 미반영)~~ — 2026-09-28 계약 v2로 해소(FE 후속 보고 "v2 연동").
4. F6(APM 개요 전체 서비스 RED) — 보류(지시).
5. 커밋 — 사용자 승인 대기. 제안: `#ZM-154 [FEAT] APM 데이터 기간 지정 내보내기 FE — 계획 조회·파일 내려받기 모달(서비스 개요·트랜잭션·에러) -2026-09-22` (15개 파일, `git add -A` 금지 — 워크트리에 `node_modules` 정션이 있다).
