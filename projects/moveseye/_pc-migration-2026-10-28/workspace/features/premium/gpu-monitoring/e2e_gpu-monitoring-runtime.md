# GPU 모니터링 P1 — 런타임 검증 (실제 Zabbix·실제 GPU)

시작: 2026-10-08 · 대상: 워크트리 BE `C:\worktrees\zm-78-be`(:3002) · 응답 원문: `e2e_gpu-runtime-dev74-responses.json`
실장비: GPU-SERVER 10.220.0.13(RTX 5070) · 실측 기록: `gpu-p1-source-profile.md`

## 1. dev74 — Zabbix 7.4.15(10.220.0.82), DCGM 프리셋 + 공식 템플릿 동시 연결 ✅ (11:24)

| API | 결과 |
|---|---|
| `POST /settings/zabbix` | 저장 성공 — **ZabbixClient 헤더 인증 런타임 확인** |
| `GET /gpu/setup/overview` | version 7.4.15 · 경로 4종 AVAILABLE(DCGM 권장) · 프리셋 설치 상태(dcgm INSTALLED 연결1 / smi 미설치 / smi-active INSTALLED 연결0) · 공식 템플릿 10677 연결1 |
| `PUT /gpu/setup/selection` | DCGM_HTTP 저장, `affectsCollection=false` |
| `GET /gpu/setup/hosts` | GPU-Server: OFFICIAL+PRESET(dcgm) 연결, detectedProfile DCGM |
| `GET /gpu/setup/presets/…/files/…` | YAML 39,707B · 스크립트 LF · 경로 조작 400 |
| `GET /gpu/devices` | snapshot 1장 — scope host4/gpu1, configured1/unconfigured3, row: RTX 5070·`MOVESEYE_DCGM_HTTP_V1`·CURRENT·health UNKNOWN, 지표 OK 12종(활동률 100·VRAM 69.9%·62°C·227 W·clock 2842/13801·PCIe), UNSUPPORTED 4종(power.limit·performance.state·ecc×2) |
| `GET /gpu/devices/detail` | driver 615.71.09·pciBusId·serial null·coverage EXTENDED_DCGM 8/8·retention UNKNOWN·COMPLETE |
| `GET /gpu/devices/series` 1h AUTO | RAW 60점 × 4지표, gap 0, invalid 0 |
| `GET /gpu/devices/series` 7d AUTO | HOURLY_TREND 168점, gap 2(현재 시간 미완료 + 연결 전 구간) |
| `GET /gpu/hosts/diagnostics` | CONFIGURED · `MULTIPLE_PROFILES` · detectedProfiles [DCGM] · 장치 issue METRIC_ABSENT 4종 |
| 오류 경로 | 없는 GPU → GPU_NOT_FOUND(404 body), 모르는 소스 → GPU_SOURCE_UNSUPPORTED(400 body) |

런타임에서 잡혀 수정한 결함 3건(7.4 전용 필드·`[]` 역직렬화·Redis 공유)은 `gpu-p1-source-profile.md` §10.

알려진 공백(후속): `detectedProfiles`가 선택된 프로필 하나만 담김(후보 전체는 진단 문구에만) · retention 미해석(RETENTION_UNKNOWN) · health는 P1 설계대로 UNKNOWN.

## 2. dev70s — Zabbix 7.0.6(dmove.co.kr), nvidia-smi **액티브** 프리셋 ✅ (11:32)

샌드박스: DB 5435(`dmove-postgres-dev70s`) + Redis DB 2 — 공유 dev DB(5433)에 V72/V73을 적용하지 않기 위해 분리. Zabbix 설정 행은 5433에서 그대로 복사. 응답 원문 `e2e_gpu-runtime-dev70s-responses.json`.

| API | 결과 |
|---|---|
| `GET /gpu/setup/overview` | version **7.0.6** · OFFICIAL_PLUGIN **UNAVAILABLE `ZABBIX_VERSION_BELOW_7_2`** · 나머지 3종 AVAILABLE(DCGM 권장) · 공식 템플릿 없음 |
| `GET /gpu/setup/hosts` | GPU-SERVER(10760) PRESET dcgm → 프로필 DCGM / GPU-SERVER-SMI(10763) PRESET **gpu-nvidia-smi-active** → 프로필 `MOVESEYE_NVIDIA_SMI_V1`(액티브 태그 매핑 확인) |
| `GET /gpu/devices` | scope host **80**/gpu 1 · configured1/unconfigured78/unknown1(=10760 DCGM 미도달) · row: GPU-SERVER-SMI·RTX 5070·CURRENT · OK 12종(유휴: 활동률 0·VRAM 69.9%·40°C·6.84 W·P8·power.limit 250) · UNSUPPORTED 4종(pcie×2·ecc×2) |
| `GET /gpu/devices/detail` | coverage **CORE_TELEMETRY 5/5** · driver·pciBusId · serial null |
| series 1h / 7d | RAW 60점×4 / HOURLY_TREND 168점 gap 2 |
| diagnostics | CONFIGURED · detectedProfiles [NVIDIA_SMI] · pcie `NOT_PROVIDED_BY_PROFILE`, ecc `SOURCE_UNSUPPORTED` |
| 오류 경로 | GPU_NOT_FOUND / GPU_SOURCE_UNSUPPORTED |

발견: `performance.state`가 numericValue 8과 textValue `P8`을 동시에 실음(계약은 택일) → 어댑터에서 숫자 null로 정정.
런타임에서 잡힌 기존 결함 R6(새 설치 URL 미설정 NPE → LICENSE_REQUIRED 둔갑)은 `gpu-p1-source-profile.md` §10.

## 3. 종합
두 Zabbix(7.0.6·7.4.15) × 두 프리셋 경로(nvidia-smi 액티브·DCGM HTTP) + 공식 템플릿 동시 연결 케이스까지 **실제 GPU 데이터로 API 4종 + 설치 가이드 API 4종 통과**. 미검증: FE 화면 런타임(별도), 공식 플러그인 단독 프로필(7.4 호스트는 DCGM이 우선 선택됨 — 프리셋을 떼고 확인 필요), MIG·다중 GPU·부하 시험.

## 4. FE 화면 (워크트리 vite :5174 → BE dev74 :3002, 헤드리스 CDP, 11:50~11:58) ✅

| 화면 | 확인 |
|---|---|
| 목록 `/gpu-monitoring/` | 마지막 갱신·설치 가이드 버튼·필터 줄·카드 4(발견 1/최신 1/이벤트 —/전력 7.4 W)·행 1(RTX 5070·DCGM 배지·0 %·8.3/11.9 GiB bar·37 °C·Current·Health unknown·호스트 이벤트 링크) |
| 상세 `/detail?…&range=1h` | 헤더(모델·Current·Health unknown·DCGM·호스트 링크·UUID 복사)·현재 카드 4·기간 선택·차트 6(활동률/VRAM used·free·total/온도/전력/clock/PCIe, RAW 배지) — 11:20~11:30 추론 스파이크(100 %·227 W·60 °C) 실데이터 렌더 |
| 설치 가이드 `?step=zabbix` | 버전 7.4.15·Connected·확인 시각·Next |
| `?step=path` | 환경 질문 2개(자동 버전 포함 3)·권장 DCGM·"선택은 안내용" 문구·방식 카드 4(전부 가용). `&reach=no`면 권장이 **nvidia-smi 액티브**로 바뀌고 프록시 안내 |
| `?step=guide` | 선택 DCGM·Zabbix 서버 주소(수정 가능)·프리셋 배지(설치됨·연결 1)·"서버가 GPU 서버에 도달해야 함" 경고·단계 명령 블록 12·파일 내려받기 2 |
| `?step=verify` | 호스트 표(GPU-Server·AGENT 10.220.0.13:10050·Available·공식+DCGM 템플릿·프로필 DCGM)·GPU 목록 이동 |

콘솔: GPU 코드 기인 오류 0(기존 `GlobalSearch` key 경고·React Router future flag만). 미확인: 다크모드·30초 자동 갱신·뒤로가기 복구·비관리자 화면·7.0.6 데이터 화면.

## 5. master 병합 후 회귀 (2026-10-10, BE `3680909`·FE `c24ef50`)

| 대상 | 결과 |
|---|---|
| BE clean `:engine-zabbix:test :test` | engine-zabbix **357**·app **4,764** — 실패 0 (APM V74·V75 포함) |
| FE 전체 jest | 4,093 중 4,084 통과. 실패 9건 = 8건은 GPU 병합 **이전** master `cbadb3e`에서도 동일 실패(apmRoutes 3·apmHelpContent 3·AiAssistantPage 1·TriggerFormDrawer 1), 1건(AiMonitorAccountsTab)은 전체 동시 실행 부하 시간 초과·단독 통과 |
| FE tsc·typecheck:contract·build | 통과 |
| Flyway | 로컬 DB 어디에도 V74/V75 미적용(공유 dev 5433은 V69까지, IT DB는 70·72·73) → V72/V73 번호 유지로 정상 순서 적용. 푸시는 V74/V75와 함께 |

## 6. 2차 런타임 (2026-10-12, 워크트리 BE dev74 :3002 → Zabbix 7.4.15, FE :5174)

| 대상 | 결과 |
|---|---|
| `GET /gpu/devices` 행 | GPU-Server: `collectionProfile=MOVESEYE_DCGM_HTTP_V1`, `detectedProfiles=[DCGM, NVML_PLUGIN]`, `profileConflict=true` |
| `GET /gpu/collection/hosts` | summary host4/dcgm1/official0/smi0/notConfigured3/conflict1, GPU-Server 연결 템플릿 OFFICIAL "Nvidia by Zabbix agent 2" + PRESET "MovesEye GPU by DCGM (HTTP)" 1.0 INSTALLED · `hostId` 정확 일치 1건 · 범위 밖 0건 · `method=CONFLICT` 1건 |
| `GET /gpu/dashboards/detail/widgets` | 기본 11종(현재값 4·차트 6·수집 방식) · 잘못된 타입 `WIDGET_TYPE_INVALID` 400 |
| MovesEye 관리 마커 | 템플릿 검색 "MovesEye" → 2건 `CURRENT`·presetName 표시명 / `/hosts/manage` GPU-Server 연결 템플릿에 `gpu-dcgm-http` 마커 / 템플릿 그룹 탭에 "MovesEye managed" 배지 |
| 화면 | 상세: 위젯 11개·차트 6(서버 모니터링형 현재/평균/최소/최대 요약)·수집 방식 헤더·충돌 경고 Alert · 목록: "수집 방식" 열+충돌 아이콘 · 수집 현황: 요약 카드 6·표 5행. 🔴 수집 현황 로딩 중 빈 상태 문구 노출 → 수정 중 |
스크린샷 `_archive/screenshots/gpu-p2-20261012/`.
