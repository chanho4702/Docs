# GPU 모니터링 P1 — FE(S3) 검증 기록 (ZM-78)

작성: Claude(fe-engineer) · 2026-10-08 · 워크트리 `C:\worktrees\zm-78-fe`(브랜치 ZM-78, master `dfb0442` 기준) · **미커밋**

입력: [features/premium/gpu-monitoring/contract_gpu-monitoring.md](solutions--contract_gpu-monitoring.md)(IMPLEMENTED / 런타임 미검증) · [impl_gpu-s2-api.md](solutions--impl_gpu-s2-api.md) §8 · 설계 `devdesign_gpu-monitoring-p1.md` §11·§12 · `devdesign_gpu-collection-paths.md` §6.4·§11.2.
범위 밖: 설치 가이드 화면(계약 §11, S2.5 — 라우트·자리만), 클러스터 화면(수집 경로 §13.4).

## 1. 계약 ↔ FE 타입 대조

정본 대조 순서: 계약 문서 §3~§8 → BE DTO record(`C:\worktrees\zm-78-be\...\premium\gpu\**Dto.java`) → `src/types/gpu.ts`. **불일치 0건.**

| 계약 | BE DTO | FE 타입 | 결과 |
|---|---|---|---|
| `GpuValue` 7필드(value·textValue·unit·observedAt·status·reasonCode·expectedHeartbeatSeconds) | `GpuValueDto` | `TGpuValue` | 일치(nullable 동일) |
| `GpuRow` 16필드 + metrics 16키(점 표기) | `GpuRowDto` | `TGpuRow` + `TGpuMetricKey` | 일치 |
| `collectionProfile` 4값 · `capabilityTier` 2값 | String | 리터럴 유니온 | 일치 |
| 목록 payload(scope·collectionSummary·page·total·rows·totals{4 count + 3 aggregate + activeGpuEventCount}) | `GpuListPayloadDto` | `TGpuListPayload` | 일치 |
| 상세 payload(device·generatedAt·cachedAt·completeness·sourceErrorCode·metadata{migMode 4값}·coverage{capabilityTier…}·retention) | `GpuDetailPayloadDto`·`GpuMetadataDto`·`GpuCoverageDto` | `TGpuDetailPayload` | 일치 |
| 시계열 payload(id·requested/effective·series[]{…invalidPointCount: number\|null…points·gaps}) | `GpuSeriesPayloadDto` | `TGpuSeriesPayload` | 일치(`invalidPointCount` null 허용) |
| 진단 payload(completeness·collectionProfile·detectedProfiles·devices[].discoveryState·adminDetails.diagnostics[]) | `GpuDiagnosticsPayloadDto` | `TGpuDiagnosticsPayload` | 일치(초안 `items[]` 아님) |
| 오류 7종 errorCode | `ErrorCode.GPU_*` | `GPU_ERROR_CODE` | 일치 |
| 경로 `GET /gpu/devices`·`/devices/detail`·`/devices/series`·`/hosts/diagnostics` | `@RequestMapping("/gpu")` | `gpu.api.ts` | 일치 |
| 권한 `monitoring/gpuMonitoring` → `permissions.gpuMonitoring.view` | `DmovePermissions` | `DmovePermissionsKey.GPU_MONITORING = "gpuMonitoring"` | 일치 |

게이트: `npm run typecheck:contract` 통과 — 픽스처 `src/__tests__/fixtures/gpuContractSample.ts`가 계약 타입으로 박혀 있다(계약 §9 예시 OK 0·UNSUPPORTED·STALE_CACHE·오류 봉투 4종 포함).

**FE 요청사항**(차단 아님, 계약서 `## 🔄 FE 요청사항`에 기록): FE-R1 모델 후보 facet · FE-R2 GPU 호스트 후보 EP.

## 2. 구현 요약 — 판단이 들어간 곳

| # | 결정 | 이유 |
|---|---|---|
| F1 | `gpu.api.ts`가 실패 봉투를 `GpuApiError extends ApiEnvelopeError`로 던진다 | `useDmoveQuery`의 `ApiEnvelopeError`는 `data`를 버린다 → `GPU_SOURCE_UNAVAILABLE.data.sourceErrorCode`를 보여 줄 수 없음. 하위 클래스라 "비즈니스 오류 재시도 안 함"·`resolveApiError` 그대로 통함 |
| F2 | snapshotId는 **page>1에서만** 보내고 쿼리 키에 넣지 않는다(ref) | 키에 넣으면 응답마다 키가 바뀌어 같은 화면을 두 번 조회. 필터·정렬 변경은 page 지움 = 새 스냅샷 |
| F3 | 30초 자동 갱신은 **page 1에서만** | 2쪽 이상에서 새 스냅샷을 섞으면 행이 빠지거나 겹친다. 그 페이지에서 60초가 지나면 다음 이동이 `GPU_SNAPSHOT_EXPIRED` → id 버리고 page 1(계약대로) |
| F4 | 상세 기간: URL `range`(1h·6h·24h·7d·30d, 기본 1h) 또는 고정 `from`/`to`(ms). 둘 다 있으면 고정 우선 | 설계 §11은 `from&to`만 적었지만 상대 기간을 URL에 박으면 공유 링크가 과거에 고정된다. 상대 기간은 30초마다 "지금"을 밀고(탭 숨김이면 멈춤), 고정 기간은 갱신하지 않는다 |
| F5 | 시계열 두 요청: 2×2 주 차트 6지표 한 번 + 추가 지표(clock·PCIe)는 **현재값이 OK/STALE인 것만** 두 번째 요청 | 계약 상한 8지표. 미지원 추가 지표는 그리지 않고 `coverage.unsupportedCount` + "수집 진단 보기" 링크 |
| F6 | RAW gap은 가운데 null 점을 끼워 선을 끊는다 + markArea 음영. `CURRENT_BUCKET_INCOMPLETE`는 "집계 중"으로 다른 색 | RAW gap은 앞뒤 원시 점 사이라 그대로 두면 선이 gap을 가로지른다 |
| F7 | TREND `boundaryPartial` 버킷은 x를 effectiveFrom으로 당기고 속 빈 점 + 툴팁에 원래 시각·"경계 구간" | impl 메모 §8 "x축은 effective 창으로 자르고 툴팁에 원래 시간" |
| F8 | 목록 0건(필터 없음) 빈 상태 판정 순서: configured>0 → NO_DATA, unknown만 → SOURCE_ERROR, unconfigured>0 → NOT_CONFIGURED, 그 외 NO_GPU | `collectionSummary` 네 칸은 서로 배타(D7). 템플릿이 하나도 없는 설치본은 NOT_CONFIGURED(설치 안내 링크 → `/gpu-monitoring/setup` 자리) |
| F9 | 최신 관측 GPU 카드 = currentCount + partialCount(보조줄에 4분할) | "최신값이 하나라도 있는 GPU". PARTIAL은 미지원 지표가 있는 정상 장비도 포함(계약 §3) |
| F10 | 메뉴·모바일·검색·라우트 4곳에 `gpuMonitoring.view` 축 추가(항목 신설 없음, ⚙·관리 콘솔엔 GPU 없음) | 설계 §12 "런타임 무조건 허용 fallback 금지". 🔴 V72 백필 전 저장 역할의 일반 사용자는 GPU 메뉴가 사라진다(의도) |

## 3. 변경 파일

신규
- `src/types/gpu.ts` · `src/services/gpu.api.ts` · `src/hooks/useGpu.ts` · `src/constants/gpu.ts` · `src/lib/echarts/gpuSeries.ts`
- `src/pages/gpu-monitoring/GpuDetailPage.tsx` · `GpuSetupPage.tsx`(준비 중 자리)
- `src/pages/gpu-monitoring/components/` `GpuEmptyState.tsx` · `GpuValueCell.tsx` · `GpuStatusTags.tsx` · `GpuSeriesChart.tsx` · `GpuDiagnosticsTab.tsx`
- `src/pages/gpu-monitoring/shared/gpuDisplay.ts`
- 테스트 `src/__tests__/` `gpuContract.test.tsx` · `GpuMonitoringPage.test.tsx` · `GpuDetailPage.test.tsx` · `gpuRoutes.test.ts` · `fixtures/gpuContractSample.ts`

수정
- `src/pages/gpu-monitoring/GpuMonitoring.tsx`(준비 중 → 목록 화면)
- `src/routes/routes.tsx`(GPU 블록에 상세·설치 자식 + 3개 모두 `permissionKey=GPU_MONITORING` + `FeatureGate`)
- `src/constants/routes.ts`(`PATH_GPU_MONITORING.detail`·`.setup`, `gpuDetailPath`)
- `src/constants/queryKey.ts`(`GPU_QUERY_KEY`) · `src/constants/breadcrumbSegments.ts`(detail·setup 라벨)
- `src/enums/user-roles.ts`(`GPU_MONITORING = "gpuMonitoring"`)
- `src/layouts/app/SideNav.tsx`·`MobileSideNav.tsx`(`show: canViewGpu`) · `src/constants/navSearchEntries.ts`(`permission`)
- `src/locales/kr.json`·`en.json`(루트 `gpuMonitoring` 역할 편집 라벨 + `gpu.*` 네임스페이스)
- `src/__tests__/SideNavPermissions.test.tsx`·`GlobalSearch.test.tsx`(픽스처에 gpuMonitoring 권한 + 권한 없으면 숨김 케이스 1개씩)

## 4. 테스트 수치

| 명령 | 결과 |
|---|---|
| `npx jest src/__tests__/gpuContract.test.tsx` | 22 / 22 |
| `npx jest src/__tests__/GpuMonitoringPage.test.tsx` | 19 / 19 |
| `npx jest src/__tests__/GpuDetailPage.test.tsx` | 11 / 11 |
| `npx jest src/__tests__/gpuRoutes.test.ts` | 12 / 12 |
| GPU 4종 + `SideNavPermissions` + `GlobalSearch` 합산 | **107 / 107** |
| 인접 회귀(`zm157PermissionUi`·`zm157RolePermissionInert`·`userRolesPermissionsApi`·`cloudCostRedirect`·`NetworkMapRouteMove`·`licenseGateWatcher`·`aiMonitorLabels`) | 97 / 97 |
| `licenseGate`·`zm157PageAccess`·`AdminConsoleNav` | 통과 |
| `apmRoutes.test.tsx` | 35 / 38 — 🔴 실패 3건은 **master(`707bf84`)에서도 동일 실패**(ApmServiceDetailPage `useApmRefresh`의 QueryClient 부재, GPU 무관) |
| `npx tsc -p tsconfig.json --noEmit` | 통과 |
| `npm run typecheck:contract` | 통과 |
| ESLint(변경·신규 파일) | 경고 0 |

테스트가 잡은 실제 결함 1건: 로케일 생성 스크립트가 하위 객체의 `reason`·`action` 키까지 사유 맵으로 덮어 `gpu.diag.reason`·`gpu.diag.action`이 객체가 됨(진단 표 머리가 키 원문으로 나올 뻔) → `gpuRoutes`의 "코드가 쓰는 정적 키 전부 문자열" 검사가 잡아 수정.

검증 축 대응(과제 요구)
- 계약 §9 픽스처 렌더(OK 0·UNSUPPORTED·STALE_CACHE·오류 봉투): `gpuContract`·`GpuMonitoringPage`
- 빈 상태 7종 분기: `gpuContract`(판정 함수) + 목록·상세 화면(NOT_CONFIGURED·SOURCE_ERROR·NO_PERMISSION·FEATURE_LOCKED·UNSUPPORTED·NO_DATA)
- 정렬/필터 → query 반영·allowlist·page 지움: `GpuMonitoringPage`
- `GPU_SNAPSHOT_EXPIRED` 재조회(page 2 → page 지움 / page 1 → refetch) + 훅 수준 snapshotId 규칙: 둘 다
- 차트 null 버킷·gap 끊기·markArea·경계 버킷·툴팁: `gpuContract`
- 라우트·진입점·i18n: `gpuRoutes`

## 5. 런타임 미검증 (dev BE·실 GPU 필요)

| # | 항목 | 왜 못 했나 |
|---|---|---|
| U1 | 실제 HTTP 봉투를 화면이 그대로 소비하는지(언랩 2겹·ms 단위) | dev Zabbix에 프리셋 템플릿 없음(계약 §10 미체크 항목과 같음) |
| U2 | 차트 실렌더(ECharts) — 음영·끊김·속 빈 점이 눈으로 맞는지, 다크모드 색 | jest는 옵션 객체만 검사. 헤드리스 CDP 확인 필요 |
| U3 | 30초 갱신·탭 숨김 중단·상세 상대 기간 밀림 | 타이머 동작은 코드 리뷰만 |
| U4 | `GPU_SCOPE_TOO_LARGE` 첫 화면 → 그룹 선택 회복 동선 | 허용 호스트 200 초과 환경 없음 |
| U5 | 권한 회수·V72 백필 후 메뉴/검색/라우트 일치, 일반 사용자 진단의 `adminDetails` null | 역할 편집 실조작 미수행 |
| U6 | 필터 셀렉트(호스트 그룹·호스트 무한 스크롤) 라벨 복구 — 호스트 그룹은 `selectedId` 되짚기, 호스트 이름은 현재 행에서 | 실데이터 필요 |
| U7 | 브라우저 뒤로 가기로 목록 필터·페이지 복구(상세 "목록으로"는 history idx>0이면 `navigate(-1)`) | 수동 확인 필요 |

---

## 6. 설치 가이드 (S3b, 2026-10-08)

범위: `/gpu-monitoring/setup` 단계형 한 페이지(Zabbix 확인 → 연동 방식 선택 → 설치 안내 → 확인), 계약 §11 4개 EP 연동. 목록 상단 "설치 가이드" 버튼 추가(빈 상태 NOT_CONFIGURED의 "설치 안내" 링크는 S3 그대로).

### 6.1 계약 §11 ↔ FE 타입 대조

| 계약 | FE 타입(`src/types/gpu.ts`) | BE DTO | 결과 |
|---|---|---|---|
| §11.1 overview 전 필드(zabbix·selection·paths·installStatus·presets·official·guideContext 12값) | `TGpuSetupOverview` 외 | `GpuSetupOverviewDto` | 일치(필드명·nullable) |
| §11.2 selection 요청/응답 | `saveSetupSelection(path)` · `TGpuSetupSelectionResult` | `GpuSetupSelectionReqDto`·`ResultDto` | 일치 |
| §11.3 파일 | `downloadSetupFile(downloadPath)` — `downloadPath` 그대로, blob, `application/json`이면 봉투 오류 | `GpuSetupController` | 일치 |
| §11.4 hosts | `TGpuSetupHostsPayload` · `TGpuSetupHostsParams` | `GpuSetupHostsPayloadDto` | 일치 |

- ⚠️ 계약 표에 없는 사유 코드 `PRESET_FORMAT_MISSING`이 BE DTO 설명에 있음 → i18n에 넣어 둠(차단 아님). `ZABBIX_VERSION_BELOW_{x_y}`는 숫자를 뽑아 한 문구로 처리(6.0 형식 추가에도 그대로 맞음).
- ⚠️ `paths[].requirements`의 경로별 실제 조합은 계약에 없어 픽스처는 추정값이다(화면은 코드 → 문구 매핑만 하므로 조합이 달라도 동작은 같다. 모르는 코드는 원문 칩).
- 선택 거부의 `data.reasonCode`를 읽도록 `GpuApiError`에 `reasonCode` 필드를 더했다(기존 `sourceErrorCode`와 같은 방식, 하위 호환).

### 6.2 판단이 들어간 곳

| # | 판단 | 근거 |
|---|---|---|
| G1 | 비관리자는 1·2단계만(카드 읽기 전용), 3·4단계는 "관리자 전용" 안내로 막음. `installStatus=HIDDEN`이면 역할 상태와 무관하게 비관리자로 본다 | 과제 "1·2단계 읽기만", BE D4 |
| G2 | 추천 규칙: 설치 불가 → 추천 없음 / 서버→GPU 접속 불가 → 액티브만 / 그 외 BE `recommended`(DCGM)부터, 불가면 DCGM→공식→패시브→액티브 순 / UNKNOWN은 막지 않음 | 설계 §5, 실측(공인→사설 망은 액티브만), 계약 §11.2 |
| G3 | 안내 단계 문구는 FE i18n, 명령 값은 `guideContext`·카탈로그 파일 이름·사용자가 고친 입력(서버 주소·Hostname)만. 비어 있으면 `<ZABBIX_SERVER_IP>`·`<ZABBIX_HOST_NAME>` 자리표시 | 과제 지시, BE D14 |
| G4 | FE가 쥔 상수 2개: 컨테이너 내부 포트 9400(호스트 쪽만 BE 값), 지표 목록 파일 위치 `/etc/dcgm-exporter`(파일 머리 주석의 사용 예) | dcgm-exporter 기본값 — BE `guideContext`에 없음 |
| G5 | 단계·환경 답·에이전트 종류는 URL(`?step=&install=&reach=&agent=`), 서버 주소·Hostname 입력은 화면 상태(새로고침 시 BE 기본값으로) | 공유·복구 대상은 단계까지 |
| G6 | 새로고침 = overview·hosts 쿼리 접두사 무효화. 자동 갱신 없음 | 과제 |

### 6.3 변경 파일

- 신규: `src/pages/gpu-monitoring/shared/gpuSetup.ts`(추천·사유 키·파일 고르기·안내 단계) · `components/setup/GpuSetup{Zabbix,Path,Guide,Hosts}Step.tsx` · `gpu-setup.scss` · `src/__tests__/GpuSetupPage.test.tsx` · `gpuSetupContract.test.ts` · `fixtures/gpuSetupContractSample.ts`
- 수정: `GpuSetupPage.tsx`(자리 → 본 화면) · `GpuMonitoring.tsx`(상단 "설치 가이드" 버튼) · `types/gpu.ts` · `services/gpu.api.ts`(EP 4 + `GpuApiError.reasonCode`) · `hooks/useGpu.ts`(훅 3) · `constants/gpu.ts` · `constants/queryKey.ts` · `constants/routes.ts`·`routes/routes.tsx`(주석만) · `locales/kr.json`·`en.json`(`gpu.setup.*` 교체, `coming_soon` 제거)

### 6.4 테스트 수치

| 명령 | 결과 |
|---|---|
| `npx jest src/__tests__/GpuSetupPage.test.tsx` | 25 / 25 |
| `npx jest src/__tests__/gpuSetupContract.test.ts` | 33 / 33 |
| GPU 6종(`gpuContract`·`gpuRoutes`·`gpuSetupContract`·`GpuMonitoringPage`·`GpuDetailPage`·`GpuSetupPage`) + `GlobalSearch`·`SideNavPermissions`·`ApmGuideText` | **171 / 171** (9 스위트) |
| `npx tsc -p tsconfig.json --noEmit` | 통과 |
| `npm run typecheck:contract` | 통과(새 픽스처 포함) |
| ESLint(변경·신규 파일) | 경고 0 |

검증 축: 7.0.6 공식 불가 사유 표시 · 7.4.15 전부 가용 · 조회 실패 전부 UNKNOWN(그래도 선택 가능) · 선택 PUT 호출과 성공 시 3단계 이동·거부 사유 문구 · 불가 카드 비활성 · 내려받기(`downloadPath` 그대로, blob 저장, JSON 봉투 오류) · 비관리자 숨김(BE HIDDEN 우선) · `?step=` 복구(모르는 값은 1단계) · 서버 주소 편집이 명령에 반영 · 액티브 Hostname 쉼표 정리.

### 6.5 런타임 미검증

| # | 항목 | 왜 |
|---|---|---|
| S1 | 실제 BE(:3000)로 overview·PUT·파일·hosts 왕복(봉투 언랩·Content-Type 분기) | dev BE가 S2.5 코드로 떠 있지 않음(계약 상태 "런타임 미검증") |
| S2 | 내려받은 파일 이름·내용(브라우저 저장) | jsdom은 앵커 클릭만 확인 |
| S3 | 지표 목록 파일을 `-v … -f …`로 넘기는 DCGM 실행 명령 | 실측은 기본 목록 실행만 했다. 이미지 엔트리포인트가 인자를 dcgm-exporter로 넘기는지 실장비 확인 필요 |
| S4 | 다크모드·좁은 화면에서 카드 4장·명령 블록 줄바꿈 | 헤드리스 CDP 확인 필요 |
| S5 | 7.4 서버에서 overview의 template.get(BE Q4 Bearer 수정 의존) | BE 요청 사항 |

## 6. 검수 반영 — 코덱스 FE 검수 🟡 4건 (2026-10-08, 커밋 `183b5c3` 위, 미커밋)

출처: [review_gpu-p1_codex-fe.md](../../../_archive/features/premium/gpu-monitoring/solutions--review_gpu-p1_codex-fe.md). 설치 가이드 파일(`GpuSetupPage`·`components/setup/*`·`shared/gpuSetup.ts`·`gpu-setup.scss`·`types/gpu.ts` guideContext)은 병렬 작업 중이라 손대지 않았다.

| # | 지적 | 반영 | 파일 |
|---|---|---|---|
| 🟡1 | 추가 시계열(clock·PCIe)을 현재값 OK/STALE로만 노출 → ERROR·DISABLED·NO_DATA의 과거 이력이 숨음 | 판정을 `gpuMetricSupported()`로 교체: `status !== "UNSUPPORTED"` 이고 `reasonCode !== "NOT_PROVIDED_BY_PROFILE"`이면 그린다 | `shared/gpuDisplay.ts`, `GpuDetailPage.tsx` |
| 🟡2 | 복합 차트(VRAM used/free/total)에서 일부 계열 오류가 사라짐 | 차트를 그리되 `state`가 AVAILABLE이 아닌 계열마다 머리에 배지 `{계열명}: {상태}` + 툴팁 `{사유} ({코드})`. 색: ERROR 빨강, NO_DATA·PARTIAL 주의, UNSUPPORTED 중립. 그리지 못한 단일 계열 차트는 본문이 이미 이유를 말하므로 배지 생략 | `components/GpuSeriesChart.tsx` |
| 🟡3 | 상세 새로고침이 추가 차트를 다시 읽지 않음 | detail·primarySeries에 더해 extraSeries도 `refetch()`(추가 지표가 있을 때) | `GpuDetailPage.tsx` |
| 🟡4 | 진단 성공 응답의 COLLECTION_ERROR 빈 상태에 재시도 없음 | 빈 상태에 `onRetry` = 진단 `refetch()` 연결(SOURCE_ERROR로 접혀 재시도 버튼이 선다) | `components/GpuDiagnosticsTab.tsx` |

테스트(`GpuDetailPage.test.tsx`에 4건 추가): 현재값 ERROR인 clock 차트 렌더 + PCIe(프로필 미제공) 숨김 · used=AVAILABLE·free=ERROR 배지(정상 계열엔 없음) · 새로고침 3종 refetch · COLLECTION_ERROR 재시도 → 진단 refetch.

수치: `npx jest src/__tests__/Gpu* src/__tests__/gpu*` **6 스위트 129 / 129**(설치 가이드 스위트 포함 — 첫 실행에서 `gpuSetupContract`가 병렬 편집 도중이라 한 번 로드 실패했고, 재실행에서 통과) · `tsc --noEmit` 통과 · `typecheck:contract` 통과 · ESLint(변경 파일) 경고 0.

### 6.6 검수 반영 (코덱스 FE 검수 `_archive/features/premium/gpu-monitoring/review_gpu-p1_codex-fe.md`, 커밋 `183b5c3` 위, 미커밋)

| 항목 | 반영 |
|---|---|
| 🟡5 설치 명령의 FE 하드코딩 환경값 | `guideContext`에 optional 4필드(`dcgmPort`·`dcgmCountersDir`·`agentConfDir`·`agentScriptDir`)를 타입에 추가. 명령은 **이 값만** 끼우고, 없으면 `constants/gpu.ts`의 `GPU_SETUP_CONTRACT_DEFAULTS`(주석 "계약 §11 고정값": 9400 · `/etc/dcgm-exporter` · `/etc/zabbix/zabbix_agent2.d` · `/usr/local/bin`)를 쓴다. `gpuSetup.ts`의 `DCGM_CONTAINER_PORT`·`DCGM_COUNTERS_DIR` 상수 삭제. 에이전트 설정 파일 경로(`/etc/zabbix/zabbix_agent2.conf` 하드코딩)는 BE include 디렉터리에서 끌어낸다(`…/zabbix_agent2.d` → `…/zabbix_agent2.conf`, agentd도 같은 규칙) |
| 접근성 | 서버 주소·Hostname 입력을 `<label htmlFor>`로, 설명 문구를 `aria-describedby`로, 에이전트 종류 Segmented를 `aria-labelledby`로 연결 |
| 다크모드 | `gpu-setup.scss`의 `rgba()` 2곳 → 팔레트 정본 변수 `var(--surface-sunken)`(+ `var(--ink-primary)`)·`var(--surface-border-subtle)` |

우선순위 판단(차단 아님, 계약 확정 시 재확인):
- `agentConfDir`(신규) > `agent2ConfDir`(기존 필드) > 계약 고정값. agentd는 기존 `agentdConfDir`.
- 스크립트 설치 경로는 기존 `smiScriptPath`(conf의 UserParameter가 가리키는 전체 경로)가 우선이고, 비어 있을 때만 `agentScriptDir` + 파일 이름. 두 값이 어긋나면 conf와 스크립트 위치가 갈라지기 때문이다.
- ⚠️ 계약 §11에는 아직 4필드와 고정값이 없다(코디네이터 안내: 반영 예정). 반영 시 필드명·기본값 대조 필요.

테스트: `npx jest src/__tests__/GpuSetup* src/__tests__/gpuSetup*` **61 / 61**(GpuSetupPage 26 = 접근성 1 추가, gpuSetupContract 35 = 환경값 있음/없음 2 추가) · `tsc` 통과 · `typecheck:contract` 통과 · ESLint(변경 파일) 경고 0.

---

## 7. 2차(위젯·수집 방식) — 2026-10-12

작성: Claude(fe-engineer) · 워크트리 `C:\worktrees\zm-78-fe`(브랜치 ZM-78, master `c24ef50` 기준) · **미커밋**
입력: 계약 §3(행 `detectedProfiles`·`profileConflict`)·**§12**·**§13** · [impl_gpu-s4-dashboard-collection.md](solutions--impl_gpu-s4-dashboard-collection.md) §4 · BE 소스 `zm-78-be/.../premium/gpu/{dashboard,collection}/`(읽기만).

### 7.1 계약 ↔ FE 타입 대조 — 불일치 0건

| 계약 | BE | FE | 결과 |
|---|---|---|---|
| §3 행 `detectedProfiles: CollectionProfile[]`·`profileConflict: boolean` | `GpuRowDto` 끝 2필드 | `TGpuRow` | 일치 |
| §12 `HomeWidget` 9필드, 6 EP `/gpu/dashboards/detail/widgets` | `GpuDashboardController`(홈 DTO 재사용) | `TGpuDetailWidget` · `services/gpuDashboard.api.ts`(공용 `createWidgetDashboardApi`) | 일치 |
| §12 위젯 13종·크기·기본 세트 11종 좌표·기본/허용 지표 | `GpuDashboardWidgetType` | `constants/gpuDashboardWidgets.ts`(사본) | 일치 — 테스트가 시드 좌표·크기·행 12칸·허용⊂시계열 12종을 대조 |
| §12 config: CHART `{metrics}`만, CURRENT·INFO `{}` | `GpuDashboardConfig` | `TGpuDetailWidgetConfig` · 설정 버튼은 고를 것이 2개 이상인 차트만 | 일치 |
| §13 `GET /gpu/collection/hosts?sourceId&hostGroupId&q&method&page&pageSize`, payload(summary 11칸·rows 14필드·linkedTemplates 7필드·agentAvailability) | `GpuCollectionController`·`GpuCollectionHostsPayloadDto` | `TGpuCollectionHostsParams`·`TGpuCollectionHostsPayload` | 일치 |

게이트: `typecheck:contract` 통과 — 새 픽스처 `src/__tests__/fixtures/gpuDashboardContractSample.ts`(기본 세트 11·13종 전부·§13 예시 + 액티브 smi·미설정 호스트·SOURCE_ERROR 변형), 기존 픽스처 행에 새 2필드(겹침 행 1개 포함).

⚠️ 계약 §12 문구 "기본 세트 차트 지표 합계 = 11종"은 FE 계산으로 **10종**(전력 차트 기본이 `power.draw`만이라 `power.limit` 제외). 묶음 수(2회)는 같다 — 계약 문구만 확인 요망.

### 7.2 판단이 들어간 곳

- **위젯 대시보드**: 홈·APM과 같은 공용 부품(`WidgetGrid`·`useWidgetDashboardEditor`·`WidgetDashboardToolbar`·`AddWidgetModal`·`WidgetShell`·`useDashboardWidgets`). 머리(모델·상태·호스트·UUID·**수집 방식**·메타데이터)와 기간 선택은 그 위에 고정. 그리드는 첫 렌더부터 마운트(로딩은 빈 상태 문구로) — RGL ref 함정 회피.
- **시계열 묶음**: 페이지가 보이는 차트 위젯의 지표를 합쳐 **이 GPU가 지원하는 것만**(`gpuMetricSupported`) 정본 순서로 8개씩 자른다. 지표가 12종뿐이라 최대 2묶음 → `useGpuDeviceSeries`를 **고정 2회** 호출(두 번째는 null이면 미조회). 기본 세트: PCIe 미지원 GPU 1회 / 지원 GPU 2회. 상세 응답 전에는 부르지 않는다(지원 판정이 필요해서 — 1차보다 첫 차트가 한 왕복 늦다).
- **차트 모양**: 서버 모니터링 `DmoveChart`는 재사용하지 않았다(본문 300px 고정·category 축 전제의 내보내기/표·URL 결합). 대신 같은 토큰으로 맞췄다 — 캔버스 글꼴·배경, 면적 0.15·부드러운 선, x·y 점선 격자, 하단 범례(roundRect 10px), 툴팁 배경·테두리·그림자, `dataZoom inside`. 카드 머리 아래 `GrapthIndicator`식 요약 줄(현재·평균·최소·최대). null 버킷·gap 음영·경계 버킷·계열별 상태 배지·RAW/TREND 배지는 유지.
- **수집 진단**: 하단 탭 → 사이드 패널(`ResizableDrawer`, URL `tab=diagnostics` 그대로) + 진단 위젯(기본 세트 밖). 이벤트 탭 → 머리의 "호스트 이벤트 보기" 링크.
- **수집 방식 표시**: 문장형 라벨 `DCGM Exporter (HTTP)`·`공식 플러그인 (Agent 2)`·`nvidia-smi (에이전트)`. 🔴 액티브/패시브는 **연결 템플릿에 액티브/패시브 프리셋 중 하나만 있을 때만**(현황 화면·수집 방식 위젯). 목록·상세 머리는 근거가 없어 "에이전트"로만. 겹침 = 경고 아이콘 + 툴팁("여러 수집 방식이 겹칩니다: …. 지금은 X 값을 사용합니다."), 상세는 Alert + 현황 링크.
- **수집 방식 위젯**은 연결 템플릿을 보이려고 `/gpu/collection/hosts?hostId={hostId}`(정확 일치, 10-12 코디네이터 지시 — BE 추가 중·계약 §13 갱신 예정)를 부른다(위젯이 없으면 미조회). 클라이언트 hostId 거르기는 방어용(파라미터를 모르는 구 BE는 범위 전체 1쪽을 돌려준다 → 그 호스트가 1쪽에 없으면 연결 템플릿이 "—"로 보인다).
- **현황 화면** `/gpu-monitoring/collection`: URL 정본(`hostGroupId·q·method·page·pageSize`, 모르는 method 버림). 요약 카드 6장(5방식 + 겹침) 클릭 = method 토글. 표 9열(호스트 → GPU 목록 `?hostId=`, 실제 방식(크게)+겹침, 감지 후보, 연결 템플릿(공식/프리셋·버전·설치 상태), GPU 수(+최근 제거), 데이터 상태 분포, 수집 상태(사유 툴팁), 마지막 수집, 에이전트 패시브/액티브). `templateStatus=SOURCE_ERROR`면 연결 템플릿 "확인 불가" + 안내, 방식 판정은 그대로.
- **진입점**: 라우트 상수·라우트(권한+라이선스 게이트)·브레드크럼·검색 항목 `gpu-collection`(상위 "GPU 모니터링"). 사이드바·모바일·⚙에는 **추가하지 않음**(테스트로 고정). GPU 목록 상단 버튼·설치 가이드 4단계·상세 Alert/위젯 "더보기"에서 진입.
- **목록**: GPU 열의 프로필 태그를 빼고 "수집 방식" 열을 따로 둠(표 가로 1200 → 1400).
- **i18n**: `gpu.method.*`·`gpu.dashboard.*`·`gpu.collection.*` 3개 하위 객체만, `gpu` 객체 맨 앞 한 지점에 텍스트 삽입(다른 에이전트의 zabbix 관리 키 변경과 충돌 없게 — 파일 전체 재직렬화 안 함). kr/en 키 집합 동일(테스트).

### 7.3 변경 파일

신규: `src/constants/gpuDashboardWidgets.ts` · `src/services/gpuDashboard.api.ts` · `src/hooks/useGpuDashboard.ts` · `src/pages/gpu-monitoring/GpuCollectionPage.tsx` · `gpu-monitoring.scss` · `components/GpuCollectionMethod.tsx` · `components/GpuLinkedTemplates.tsx` · `detail/GpuDetailDashboardContext.tsx` · `detail/GpuDetailDashboardPanel.tsx` · `detail/GpuChartConfigModal.tsx` · `detail/widgets/registry.tsx` · 테스트 `GpuCollectionPage.test.tsx`·`gpuDashboardContract.test.ts`·`fixtures/gpuDashboardContractSample.ts`
수정: `types/gpu.ts` · `services/gpu.api.ts` · `hooks/useGpu.ts` · `constants/{gpu,routes,breadcrumbSegments,navSearchEntries,queryKey}.ts` · `routes/routes.tsx` · `lib/echarts/gpuSeries.ts` · `pages/gpu-monitoring/{GpuDetailPage,GpuMonitoring}.tsx` · `components/GpuSeriesChart.tsx`(본문·배지 분리) · `components/setup/GpuSetupHostsStep.tsx` · `shared/gpuDisplay.ts` · `locales/{kr,en}.json`(`gpu.*`만) · 테스트 `GpuDetailPage`(재작성)·`GpuMonitoringPage`·`gpuRoutes`·`GpuSetupPage`·`GlobalSearch`·`fixtures/gpuContractSample.ts`
삭제: `constants/gpu.ts`의 `GPU_PRIMARY_CHARTS`·`GPU_EXTRA_CHARTS`(위젯 카탈로그로 대체)

### 7.4 테스트 수치

| 명령 | 결과 |
|---|---|
| `GpuDetailPage`(재작성: 레지스트리 13종·기본 세트=시드·묶음 1회/2회·config 반영·편집 추가/중복 비활성/초기화/삭제/지표 설정·머리 수집 방식·겹침 Alert·수집 방식 위젯·새로고침 전부·1차 회귀) | 33 / 33 |
| `GpuCollectionPage`(신규: 요약 카드 수·클릭 필터/해제·URL→파라미터·호스트 링크·방식/겹침/후보/템플릿·액티브 smi·미설정·SOURCE_ERROR·범위 초과·403) | 10 / 10 |
| `gpuDashboardContract`(신규: 6 EP 경로·config 거부 throw·카탈로그 사본·지표 해석·§13 EP·라벨·요약 통계) | 9 / 9 |
| `GpuMonitoringPage`(+3: 수집 방식 열·겹침 툴팁·현황 버튼) | 22 / 22 |
| `gpuRoutes`(+2: 수집 현황 라우트·검색·사이드바 미추가) | 14 / 14 |
| `gpuContract` · `GpuSetupPage`(+현황 링크 단언) · `gpuSetupContract` | 22 · 26 · 35 |
| `GlobalSearch`(검색어 `gpu_monitoring`이 이제 2건 — 목록+현황, 둘 다 잠김으로 단언 갱신) · `SideNavPermissions` | 13 · 30 |
| GPU 관련 합산 | **214 / 214** |
| 전체 `npx jest` | 4,164 중 실패 8 = master 기존 실패(apmRoutes 3·apmHelpContent 3·AiAssistantPage 1·TriggerFormDrawer 1)만 |
| `tsc -p tsconfig.json --noEmit` · `typecheck:contract` | 통과 · 통과 |
| ESLint(변경·신규 파일) | 경고 0 |

### 7.5 런타임 미검증

| # | 항목 |
|---|---|
| V1 | 실 BE에서 `gpu:detail` 시드·배치 저장·초기화가 홈/APM 위젯과 섞이지 않는지(BE IT는 통과) |
| V2 | RGL 실렌더 — 차트 위젯 리사이즈 시 캔버스가 셀을 따라가는지, 6×9 셀에서 요약 줄+차트+범례가 넘치지 않는지, 다크모드 |
| V3 | `dataZoom inside` 휠 확대가 대시보드 세로 스크롤과 부딪히는지(서버 모니터링 상세와 같은 동작이지만 위젯이 여러 장) |
| V4 | 현황 화면 실데이터 — 겹친 호스트·OUTDATED/TAG_MISSING 템플릿·액티브 에이전트(Zabbix 6.4+)·`templateStatus=SOURCE_ERROR` |
| V5 | BE `hostId` 파라미터 반영 후 실제 요청이 그 호스트 한 줄만 받는지(BE 반영 전에는 무시돼 범위 1쪽이 온다) |

### 7.6 런타임 지적 반영 — 불러오는 중 빈 상태 문구(10-12, 헤드리스 dev74)

증상: 현황 화면이 첫 로딩 중에 요약 카드 없이 "No hosts are in GPU collection scope."·"0 hosts"를 띄움(antd Table은 loading이어도 dataSource가 비면 emptyText를 스피너 밑에 그린다).
수정: `shared/useGpuLoadingState.ts`(첫 로딩·placeholder로 필터 변경 조회 중·새로고침 버튼 재조회 = loading, 30초 자동 갱신은 제외) → 표 `loading`, 빈 상태 문구·페이지 합계·범위 문구는 **성공 응답이 있고 불러오는 중이 아닐 때만**, 요약 카드는 스켈레톤. 같은 패턴이던 GPU 목록(필터 결과 없음·총 0개·요약 카드 사라짐)과 상세 수집 방식 위젯(응답 전 "—")도 같이 고침.
테스트: 현황 +4 · 목록 +2 · 상세 +1 — GPU 관련 8묶음 158/158, `tsc`·`typecheck:contract` 통과, ESLint 0.
