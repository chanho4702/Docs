# 검수 요청 — GPU 모니터링 P1 (ZM-78) + Zabbix 7.2+ 인증 수정

작성: Claude · 2026-10-08 · 상태: **검수 완료·전건 반영 / 커밋 ZM-78: BE `22318f0`·`5dc84ee`·`c574215`, FE `183b5c3`·`66042bf` (master 미병합·미푸시) / 런타임 검증 완료(BE 7.0.6·7.4.15, FE 7.4.15)**(워크트리 `C:\worktrees\zm-78-be`·`C:\worktrees\zm-78-fe`, 브랜치 `ZM-78`, master 기준 BE `fd4fcfb`·FE `dfb0442`)

## 범위

한 줄: NVIDIA GPU 모니터링 1차 — 수집 경로 3종(공식 플러그인·DCGM HTTP·nvidia-smi 패시브/액티브)을 같은 화면으로, 설치 가이드(버전 확인·방식 선택)까지. 부수로 **BE가 Zabbix 7.2 이상과 통신 불가였던 결함** 수정.

| 증분 | 파일(요약) | 인계 문서 |
|---|---|---|
| S1 엔진 | `engine-api/.../engine/model/gpu/*`, `port/GpuInventoryPort`, `model/metric/{MetricDomain,SeriesResult,SeriesQuality*}`, `engine.proto` · `engine-zabbix/.../zabbix/gpu/*`, `metric/{ItemKeyParser,ZabbixMetricCatalog,ZabbixMetricAdapter}` · `license/integration/LicenseGuardedGpuInventoryPort` + 라이선스 테스트 3종 | `features/premium/gpu-monitoring/impl_gpu-s1-engine.md`(1~7차 갱신) |
| 프리셋 템플릿 | `src/main/resources/zabbix-presets/{gpu-dcgm-http,gpu-nvidia-smi,gpu-nvidia-smi-active}/`, `common/zabbixpreset/ZabbixPresetCatalog` | `features/premium/gpu-monitoring/impl_gpu-presets.md` |
| S2 API | `premium/gpu/**`(목록·상세·시계열·진단, 캐시·권한), `DmovePermissions`·`DmovePermissionKey`, **V72**(권한 백필), `ErrorCode` GPU 7종 | `features/premium/gpu-monitoring/impl_gpu-s2-api.md` |
| S2.5 설치 가이드 | `premium/gpu/setup/**`, **V73**(`gpu_setting`) | `features/premium/gpu-monitoring/impl_gpu-s2b-setup.md` |
| **[FIX] Zabbix 인증** | `engine-zabbix/.../client/ZabbixClient`(+`ZabbixClientAuthTransportTest`, `ZabbixClientBoundedReadTest` 기대값) | 아래 §의도 |
| 샌드박스 | `application.yml` 프로필 그룹 dev70/dev74, `application-dev74-db.yml`, `_tools/run_be_3000_dev.ps1 -Profile` | — |
| FE S3 | `types/gpu.ts`·`services/gpu.api.ts`·`hooks/useGpu.ts`·`lib/echarts/gpuSeries.ts`·`pages/gpu-monitoring/**`·routes·nav·i18n·권한 | `features/premium/gpu-monitoring/qa_gpu-monitoring-fe.md` |
| FE S3b 설치 가이드 | `pages/gpu-monitoring/GpuSetupPage.tsx`·`components/setup/*`·`shared/gpuSetup.ts`·`gpu-setup.scss`, types/api/hooks/i18n 확장 | `features/premium/gpu-monitoring/qa_gpu-monitoring-fe.md` §6 |

설계 정본: `features/premium/gpu-monitoring/devdesign_gpu-collection-paths.md` v1.0(수집 경로·프리셋·클러스터), `features/premium/gpu-monitoring/devdesign_gpu-monitoring-p1.md`(값 상태·집계·시계열), 계약 `features/premium/gpu-monitoring/contract_gpu-monitoring.md`(IMPLEMENTED, §11 설치 가이드 포함). 실측 `features/premium/gpu-monitoring/gpu-p1-source-profile.md` §1~§10, 런타임 `features/premium/gpu-monitoring/e2e_gpu-monitoring-runtime.md`.

**검수 제외**: 같은 브랜치에 다른 세션 커밋 없음(워크트리 신규). master와의 차이는 전부 이 작업분.

## 의도 (선택한 설계와 버린 대안)

1. **저장·알람 정본은 Zabbix, 경로는 "프로필"로만 다르다.** 자체 수집 저장소(OTLP)·고객 Prometheus 읽기는 사용자 결정으로 배제(Zabbix만). 어댑터는 호스트 상속 태그 `moveseye_preset`(없으면 키 접두사 `nvml.`)로 프로필을 판정하고, 한 호스트에 둘이면 고정 우선순위(DCGM > 공식 > smi)로 하나만 쓰고 `MULTIPLE_PROFILES` 진단.
2. **포트는 하나(`GpuInventoryPort` 배치 스냅샷), 모델은 식별/관측으로 분리.** 코덱스 독립 제안의 "포트 2개 분리"는 Zabbix에서 식별·최신값이 같은 `item.get`으로 나오므로 채택하지 않음.
3. **값 상태를 보존하는 전용 모델**(`GpuObservation` status OK/STALE/DISABLED/UNSUPPORTED/NO_DATA/ERROR + reasonCode). 기존 `LatestValue.parseDoubleOrZero` 경로는 GPU 도메인에서 BAD_QUERY로 차단(0=유휴 오판 방지).
4. **시계열은 기존 `MetricPort.querySeriesResult` 재사용** + `SeriesResult.quality` 선택 목록 추가(기존 도메인은 빈 목록). 09-17 설계의 `querySeriesChecked` 신설안 폐기.
5. **프리셋 템플릿은 태그로 식별**(`moveseye_preset`·`_version`·`_min_product`), 세 템플릿의 dependent 키 통일(`moveseye.gpu.*`), 미지원은 전처리 CUSTOM_ERROR 문구 고정. 사용자 확정.
6. **Zabbix 인증**: 토큰은 `Authorization: Bearer` 기본, 본문 `auth`는 `apiinfo.version`으로 판정한 6.4 미만 서버에만(URL별 캐시). 대안 "설정값으로 방식 선택"은 고객 설치 부담이라 버림.
7. health는 P1에서 `UNKNOWN`+호스트 이벤트 링크(AlertPort에 trigger↔item 관계 없음, 이름 매칭 금지). 필수 지표는 수집 등급별(`CORE_TELEMETRY` 5 / `EXTENDED_DCGM` 8).

## 중점 확인 요청 (스스로 불안한 지점)

- [ ] **R-A 인증 전환의 회귀 범위**: `ZabbixClient`는 모든 Zabbix 호출이 지나는 단일 지점이다. 헤더 전환이 7.0.6(dev)·7.4.15에서 런타임 확인됐지만 **6.0 LTS는 실서버가 없어 테스트 스텁(버전 문자열)으로만** 확인. `apiinfo.version` 1회 추가 호출이 ZM-159 호출 예산·`ZabbixCallMetrics` 집계·`ZabbixHealthAdapter`와 충돌하지 않는지.
- [ ] **R-B 라이선스 경계**: 신규 포트가 `LicenseGuardedGpuInventoryPort`로만 주입되는지(`LicenseGuardedPortTest`·`LicenseArchitectureTest` 갱신분). `@RequiresFeature(GPU_MONITORING)`가 설치 가이드 4 EP에도 걸리는지 — 라이선스 커널 잔여 판정 12(실제 프리미엄 EP)가 여기서 닫힌다.
- [ ] **R-C 권한 백필 V72**: 저장된 역할 JSON 멱등 이관(`GpuPermissionBackfillIT`). 역할 수가 많거나 JSON 형태가 다른 설치본에서의 안전성. FE는 백필 전 메뉴를 숨기므로 **BE→FE 배포 순서**가 필요하다.
- [ ] **R-D 스냅샷 캐시 키**: `RedisCache.getOrLoad` 키에 principal·권한 fingerprint·scope가 다 들어가는지, STALE_CACHE 강등 시 totals null·health UNKNOWN 규칙.
- [ ] **R-E Zabbix 버전 호환 필드**: 런타임에서 7.0 전용 `lastcheck`·7.2+ 전용 `status`가 서로 거부됨을 겪고 공통 필드(`ts_delete`)만 쓰도록 바꿨다. 다른 `output`/`select*` 필드에 같은 함정이 남았는지(어댑터 상수 주석 참조).
- [ ] **R-F `[]` 역직렬화 격리**: 아이템 하나가 깨져도 청크를 살리는 경로가 "조용히 비는" 쪽으로 기울지 않는지(`PARSE_FAILED` 진단이 화면에 닿는지).
- [ ] **R-G 프리셋 YAML**: Zabbix 7.0 export 스키마 준수는 dev 7.0.6·7.4.15 **가져오기 성공**으로 확인. 6.0 형식 파일은 없음(카탈로그 `zabbixMajors`로 가용성 판정). JavaScript 전처리의 예외 경로(다중 매칭·MIG 줄 제외)가 실장비 1장에선 안 밟혔다.
- [ ] **R-H 설치 가이드 가용성 판정**: 공식 플러그인 7.2.1 기준, 나머지 7.0 기준이 카탈로그 주도인지. `guideContext.zabbixServerHost`가 API URL 호스트라 수신 주소(10051)와 다를 수 있음.
- [ ] **R-I 기존 결함 2건은 고치지 않고 기록만**: ① BE 재기동 직후 캐시된 Zabbix 세션으로 401(재로그인 후 정상) ② 새 설치에서 Zabbix URL 미설정 시 `JwtAuthFilter`→NPE→오류 디스패치가 `LICENSE_REQUIRED`로 둔갑(`ZabbixClient`에 명시 오류만 추가). 범위 밖 판단이 맞는지.

## 검증 현황

| 구분 | 통과 | 미검증 |
|---|---|---|
| 단위·IT | **app 전체 `:test` 4,719건 실패 0**(IT 포함, 다른 워크트리가 IT DB를 쓰지 않는 시간에 실행) · engine-zabbix **356**(GPU 77) · 프리셋 카탈로그 **44** · `ZabbixClientAuthTransportTest` 6 | — |
| 런타임 BE | **Zabbix 7.4.15**(dev74): 접속 저장(인증 수정)·설치 가이드 4 EP·목록·상세·시계열(1h RAW/7d TREND)·진단(`MULTIPLE_PROFILES`)·오류 경로 — DCGM 프리셋+공식 템플릿 동시 연결 호스트 · **Zabbix 7.0.6**(dev70s): 같은 항목, nvidia-smi 액티브 프리셋, 공식 경로 `ZABBIX_VERSION_BELOW_7_2` | 공식 플러그인 **단독** 프로필(7.4 호스트는 DCGM이 우선 선택됨) · 6.0 LTS · 다중 GPU·MIG·부하 · `detectedProfiles`가 선택 프로필만 담김 · retention 미해석 |
| 런타임 Zabbix | 7.0.6·7.4.15에 프리셋 가져오기 성공, 값 수신 확인(DCGM 24종·smi 20종), 미지원 문구 정확히 `MOVESEYE_GPU_*` | 7.0.6에서 DCGM HTTP(공인망→사설망 미도달, 환경 한계) |
| FE | jest S3 107 + S3b **171**(9 스위트), `tsc`·`typecheck:contract`·ESLint 통과, 계약 불일치 0 · **실 BE(dev74·7.4.15) 응답으로 헤드리스 CDP 확인**: 목록(카드 4·행 1·프로필 배지·VRAM bar) · 상세(현재 카드 4·차트 6개 RAW, 실제 추론 스파이크 렌더) · 설치 가이드 4단계(버전 7.4.15·방식 카드 4·환경 질문에 따라 권장 변경 `reach=no`→액티브·안내 명령 블록 12·프리셋 설치 배지·호스트 표) · 콘솔 오류는 기존 `GlobalSearch`의 key 경고뿐. 스크린샷 `_archive/screenshots/gpu-p1-20261008/` | 다크모드·30초 갱신·뒤로가기 복구·비관리자 화면·7.0.6 화면(API는 통과) |

### 런타임에서 잡혀 수정한 결함(실장비 덕에 잡힘)
R3 7.4 전용 필드 거부 · R4 `itemDiscovery: []` 역직렬화 · R5 dev70/dev74 Redis 공유로 세션 토큰 충돌(프로필 분리) · P-state 숫자+텍스트 동시 적재 → 텍스트만 — 상세 `features/premium/gpu-monitoring/gpu-p1-source-profile.md` §10, `e2e_gpu-monitoring-runtime.md`.

## 커밋(2026-10-08 승인·완료)

BE 2건(분리): ① `#ZM-78 [FIX] Zabbix 7.2+ 인증 — 토큰을 Authorization 헤더로, 본문 auth는 6.4 미만만(apiinfo.version 판정·캐시), URL 미설정 명시 오류 -2026-10-08` (`ZabbixClient` + 테스트 2파일) ② `#ZM-78 [FEAT] GPU 모니터링 P1 — 엔진 GPU 도메인·스냅샷 포트·Zabbix 어댑터(프로필 3종), 프리셋 템플릿 3종+카탈로그, REST 4종+설치 가이드 4종, 권한(V72)·gpu_setting(V73), dev70/dev74 프로필 -2026-10-08`. FE 1건: `#ZM-78 [FEAT] GPU 모니터링 화면 — 목록·상세·시계열·진단, 설치 가이드(버전 확인·연동 방식 선택), 권한·메뉴·i18n -2026-10-08`. 푸시는 사용자가.

## 검수 결과

### BE — 코덱스(gpt-5.6-sol high, 2026-10-08) : **조건부 승인, 🔴 0 · 🟡 6** — 원문 [review_gpu-p1_codex-be.md](../../../_archive/features/premium/gpu-monitoring/solutions--review_gpu-p1_codex-be.md)

| # | 지적 | 반영 |
|---|---|---|
| 🟡1 | `detectedProfiles`가 선택 프로필 하나만 | [x] 엔진: 후보 전체 우선순위 순(`[DCGM, NVML_PLUGIN]` 실측 fixture 테스트) |
| 🟡2 | REMOVED 24시간 기억 캐시 미구현(P1 §6) | [x] app: `GpuRemovedMemory`(Redis `gpu:seen:v1:{source}:{host}` 24h), 성공 발견끼리만 비교, 실패·UNKNOWN 시 전환 금지, 상세·진단은 REMOVED 행, 목록 제외(테스트 5) |
| 🟡3 | 7.2+ `status=1/ts_delete=0` 유실 항목 PRESENT 오판 | [x] 엔진: `"extend"` + `lost()=ts_delete>0 ∨ status==1`, 7.0 `lastcheck`로 discoveredAt 복구. 한계 유지: 7.0 "삭제 안 함" 설정은 PRESENT |
| 🟡4 | V72가 `features` 비배열 역할에서 실패 | [x] app: `jsonb_typeof` CASE 정규화, IT `{}`·문자열·null·재실행. 🔴 샌드박스 DB(5434·5435)는 V72 체크섬 변경 → `flyway repair` 또는 재생성 |
| 🟡5 | 인증 버전 probe — single-flight 아님·계측 누락·예산 미명시 | [x] 엔진: URL별 잠금 single-flight(동시 8요청→probe 1회 테스트), `callRaw` 경유 계측(`apiinfo.version×1`), 예산 제외 javadoc |
| 🟡6 | Zabbix URL 미설정 새 설치에서 필터가 요청을 죽임 | [x] app: `JwtAuthFilter` 설정 부재 `ApiError` → 토큰 없이 진행(WARN 1회), 인증 실패 401 유지. IT: URL 미설정에서 `/features`·라이선스 등록 성공. 전면 분리는 후속 티켓 |

R-A~R-I 답: A·E 조건부(→🟡5·🟡3), C 미통과(→🟡4), I 절반(→🟡6), 나머지 통과. 6.0 LTS 실서버·다중 GPU/MIG 런타임은 잔여 검증으로 유지.

### 반영 후 회귀: BE engine-zabbix **357**·app **4,727** 실패 0 / FE GPU 8스위트 **172** 통과·tsc·typecheck:contract OK (2026-10-08)

### FE — 코덱스(gpt-5.6-sol high, 2026-10-08) : **조건부 승인, 🔴 0 · 🟡 5 · 권고 2** — 원문 [review_gpu-p1_codex-fe.md](../../../_archive/features/premium/gpu-monitoring/solutions--review_gpu-p1_codex-fe.md)

| # | 지적 | 반영 |
|---|---|---|
| 🟡1 | clock·PCIe 차트 지원 판정을 현재값 OK/STALE로 해서 ERROR/DISABLED/NO_DATA 이력이 숨음 | [x] `gpuMetricSupported()` — UNSUPPORTED·NOT_PROVIDED_BY_PROFILE만 숨김(테스트) |
| 🟡2 | 복합 차트에서 일부 계열 ERROR가 안 보임 | [x] 비AVAILABLE 계열마다 머리 배지(`계열: 상태`)+사유 툴팁(테스트 used=AVAILABLE·free=ERROR) |
| 🟡3 | 상세 새로고침이 extraSeries 미갱신 | [x] detail·primary·extra 전부 refetch(테스트) |
| 🟡4 | 진단 COLLECTION_ERROR에 재시도 없음 | [x] 빈 상태에 재시도 → 진단 refetch(테스트) |
| 🟡5 | 설치 명령에 FE 하드코딩 환경값(9400·/etc/dcgm-exporter·agent conf 경로) | [x] BE `guideContext.dcgmPort/dcgmCountersDir/agentConfDir/agentScriptDir` + 계약 §11.1 고정값 표, FE는 그 값만(없으면 `GPU_SETUP_CONTRACT_DEFAULTS`). 우선순위: `agentConfDir`→기존 `agent2ConfDir`→기본값, 스크립트는 기존 `smiScriptPath` 우선 |
| 권고 | 입력 설명 label 연결 · scss rgba → 토큰 | [x] `label htmlFor`·`aria-describedby`·`aria-labelledby`, scss는 팔레트 정본 변수(`--surface-sunken`·`--surface-border-subtle`·`--ink-primary`) |

정적 검수 통과: 계약↔타입·언랩·빈 상태 7종·SNAPSHOT_EXPIRED·SCOPE_TOO_LARGE·gap/boundary·권한·메뉴 중복·i18n 384키 동수. 코덱스는 읽기 전용 샌드박스라 jest 독립 재실행 불가(EPERM) — 기록된 수치만 확인.


