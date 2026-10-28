# GPU 2차 — 상세 위젯 대시보드 저장 API + 수집 방식 현황 API (ZM-78)

작성: Claude(be-engineer) · 2026-10-12 · 워크트리 `C:\worktrees\zm-78-be`(브랜치 `ZM-78`, 기준 `3680909`) · **미커밋**

요구(사용자 10-12): ① GPU 차트를 다른 모니터링 페이지의 커스텀 차트처럼 **위젯 대시보드**(추가·삭제·배치·크기, 사용자별 저장) ② **어떤 방법으로 수집하고 있는지** 목록·상세에 크게 + 수집 방식 현황 화면.
계약: [features/premium/gpu-monitoring/contract_gpu-monitoring.md](contract_gpu-monitoring.md) §3(행 필드 추가) · **§12** · **§13** — IMPLEMENTED / 런타임 미검증.

## 1. 변경 파일

### 신규 `premium/gpu/dashboard/`
| 파일 | 역할 |
|---|---|
| `GpuDashboardController` | `/gpu/dashboards/detail/widgets` GET·POST, `/layout` PATCH, `/{id}` PATCH·DELETE, `/reset` POST |
| `GpuDashboardWidgetType` | 위젯 타입 13종 정본 — kind(CURRENT·CHART·INFO)·기본 크기·기본 지표·허용 지표 |
| `GpuDashboardCatalog` | `WidgetCatalog` 구현 — 기본 세트 11종·config 검증 위임 |
| `GpuDashboardConfig` | 제목(100자·제어 문자)·config(차트 `metrics`만, 허용 지표·중복·빈 배열 거부) 검증 |

### 신규 `premium/gpu/collection/`
| 파일 | 역할 |
|---|---|
| `GpuCollectionController` | `GET /gpu/collection/hosts` (view 권한, 관리자 전용 아님) |
| `GpuCollectionService` | 스냅샷(수집 판정) + 템플릿 줄·페이지 호스트 상세(연결·에이전트) 합성, 요약·필터·정렬·페이지 |
| `GpuCollectionHostsPayloadDto` | 응답 DTO(Summary·HostRow·LinkedTemplate·DataStatusCounts·AgentAvailability) |

### 수정
| 파일 | 변경 |
|---|---|
| `home/DashboardKey` | `GPU_DETAIL`("gpu:detail")·`Kind.GPU_DETAIL` 추가 |
| `home/WidgetCatalog` | `default validateConfig(code, config)` 훅 추가(기본 통과 — 홈·APM 동작 불변) |
| `home/DashboardWidgetService` | create가 `catalog.validateConfig`를 거침, `update(user, key, catalog, id, dto)` 오버로드 추가(저장된 타입으로 검증, 소유 확인 먼저). 기존 4-인자 update는 그대로 |
| `premium/gpu/snapshot/GpuRowDto` | `detectedProfiles: List<String>`·`profileConflict: boolean` **끝에 추가**. conflict는 compact 생성자에서 파생 |
| `GpuSnapshotAssembler`·`GpuRemovedMemory`·`GpuValuePolicy` | 새 필드 채움(호스트 detectedProfiles 복사) |
| `premium/gpu/setup/GpuTemplateRow` | `name` 추가(+ 기존 6-인자 생성자 유지, `displayName()`) |
| `GpuSetupZabbixReader` | `toRow`가 template `name`을 담음, `str()` public |
| `GpuSetupService` | `gpuTemplateLinks`·`profileOf`·`interfaceType`·`availability` public(수집 현황 재사용) |
| `GpuPresetInstallJudge` | `versionStatus` public |

### 테스트
| 파일 | 건수 |
|---|---|
| `premium/gpu/dashboard/GpuDashboardCatalogTest` (신규) | 9 — 코드 고정·홈/APM 충돌 없음·차트 지표 ⊂ 시계열 12종·플래그·기본 세트·행 꽉 참·config/title 규칙 |
| `premium/gpu/dashboard/GpuDashboardApiMvcTest` (신규) | 11 — view 없음 403·view만으로 편집·시드(gpu:detail)·사용자 격리·타입 allowlist·중복·config 검증(create/update)·소유 확인 먼저·layout·delete·reset |
| `premium/gpu/collection/GpuCollectionServiceTest` (신규) | 9 — 방식·겹침·REMOVED 분리·요약 합·연결 템플릿 설치 상태·비관리자 templateId 숨김·템플릿 실패 허용·필터/정렬/페이지·빈 페이지 Zabbix 무호출·행 conflict 파생 |
| `premium/gpu/collection/GpuCollectionApiMvcTest` (신규) | 4 — 403·일반 사용자 허용(범위·admin=false)·관리자 플래그·파라미터/범위 오류 |
| `premium/gpu/GpuControllerIT` (+3) | 실제 웹 계층+실 DB: 행 새 필드·수집 현황 envelope/403·대시보드 DB 시드/초기화가 같은 사용자의 홈 위젯을 건드리지 않음 |
| `GpuFixtures` | 행 생성자 인자 추가 반영 |

**결과**: `:test --tests "*Gpu*" "*Dashboard*" "*HomeWidget*" "*LicenseArchitecture*"` 250건 실패 0 · `:engine-zabbix:test` 357건 실패 0 · 컴파일(main+test) 통과.
⚠️ 같은 워크트리에서 다른 세션이 `zabbixadmin/**`(MovesEyeManaged·preset)을 동시에 수정·테스트 중이었다 — 첫 실행이 `output.bin` 잠금으로 실패해 그 gradle 종료 후 재실행. 그 파일들은 이 작업과 무관(손대지 않음). 전체 `:test`는 돌리지 않았다.

## 2. Flyway

**없음.** 위젯은 홈 위젯 공용 테이블 `home_widget`(V23 + V58 `dashboard_key varchar(64)`)에 `dashboard_key='gpu:detail'`로 산다. V58 주석의 값 목록에 `gpu:detail`이 없지만 적용된 마이그레이션은 고치지 않는다 — 정본은 `DashboardKey` 클래스 주석에 추가했다. V76은 쓰지 않았다.

## 3. 결정

1. **스코프 키 `gpu:detail`, 사용자당 1벌** — GPU별 키를 두면 장치 교체·REMOVED마다 고아 배치가 생긴다. 그래서 APM 서비스 대시보드의 "uid 존재 확인 먼저" 단계가 필요 없다.
2. **쓰기도 view 권한** — APM이 `requireRead`로 대시보드 쓰기를 여는 것과 같은 판단(자기 배치는 관리 행위 아님). `gpuMonitoring.edit` 미사용.
3. **config 검증을 BE에서** — APM·홈은 config를 안 본다. GPU 차트는 config `metrics`가 그대로 `/gpu/devices/series?metrics=`로 가므로 허용 밖 지표를 저장하면 화면을 열 때마다 400. 공용 서비스에 `WidgetCatalog.validateConfig` default 훅을 두어 홈·APM 동작은 그대로. 거부 코드는 새 ErrorCode(engine-api 수정 필요) 대신 **`GPU_BAD_QUERY`** 재사용.
4. **모르는 config 키는 거부**(버리지 않음) — FE가 합의 없이 새 옵션을 저장하기 시작하면 바로 드러나게.
5. **`GpuRowDto.profileConflict`는 파생값** — compact 생성자에서 `detectedProfiles.size()>1`로 덮는다. 저장된 스냅샷(Redis, 최대 120초)이 새 필드 없이 읽혀도 `[]`/false로 안전.
6. **수집 현황 = 스냅샷 판정 + 템플릿 연결 둘 다** — 둘이 다를 수 있다(템플릿은 붙었는데 값 없음). method는 스냅샷(실제 읽은 프로필), linkedTemplates는 연결. Zabbix 추가 호출은 페이지당 `host.get` 1회(템플릿 줄은 기존 60초 캐시, 스냅샷은 목록과 같은 30초 캐시). 템플릿 쪽 실패는 오류가 아니라 `templateStatus=SOURCE_ERROR`.
7. **비관리자 숨김** — `templateId`만 null(설치 안내 hosts가 관리자 전용인 선과 맞춤). 템플릿 이름·버전·설치 상태는 보인다(사용자 요구가 "어떤 방법으로 수집하는지 확인"). 에이전트는 IP·DNS 없이 가용성만.
8. **`method` 필터 추가**(요청 명세 밖, 가산) — 요약 칸 클릭으로 그 방식 호스트만 보는 동선용. `CONFLICT`는 겹침만.
9. 범위 200 호스트 초과는 목록과 같은 `GPU_SCOPE_TOO_LARGE`(같은 `resolveScope`).

## 4. FE 메모

- **위젯 대시보드**: APM 대시보드와 같은 `HomeWidgetDto`·EP 모양이라 위젯 대시보드 컴포넌트와 편집 오버레이를 그대로 쓰면 된다. EP 접두만 `/gpu/dashboards/detail/widgets`. GPU 선택(hostId·gpuUuid)은 위젯 config가 아니라 **페이지 문맥**(URL)이다.
- **기본 배치**(12칸): y0 현재값 4장(3×4: 활동률·VRAM·온도·전력) → y4 활동률 차트·VRAM 차트(6×9) → y13 온도·전력(6×9) → y22 클럭·PCIe(6×9) → y31 수집 방식 카드(12×5). 기본 밖: `gpu_chart_memory_activity`(6×9, DCGM만), `gpu_diagnostics`(12×6).
- **타입별 지표**: 계약 §12 표. 현재값 카드는 `/gpu/devices/detail`의 `device.metrics`, 차트는 `/gpu/devices/series`. 차트 config `{metrics:[...]}` 생략 시 기본 지표(전력은 `power.draw`만, 한도선 `power.limit`은 사용자가 켬). 지원 안 되는 지표(현재값 status `UNSUPPORTED`/`NO_DATA`+ITEM_MISSING)면 위젯 안에 빈 상태 — 현행 "지원할 때만 그린다"를 위젯 단위로.
- 🔴 시계열 호출은 **보이는 차트 위젯 지표를 합쳐 8개씩 묶어서**(위젯마다 따로 부르면 기본 세트만으로 6회).
- **수집 방식 표시**: 목록 행·상세 `device`에 `detectedProfiles`·`profileConflict`가 생겼다 → `profileConflict=true`면 "수집 방식이 여러 개 겹침(값은 {collectionProfile}로 읽음)" 경고. `gpu_collection_info` 위젯은 상세 응답만으로 그린다.
- **수집 방식 현황 화면**: `GET /gpu/collection/hosts` — summary 카드(DCGM/공식/nvidia-smi/미확인/미설정 + 겹침) 클릭 → `method` 필터. 행: method 배지 + 겹침 경고 + 연결 템플릿(설치 상태 OUTDATED·TAG_MISSING 강조) + GPU 수·dataStatus 분포 + 마지막 수집 + 에이전트 상태. `templateStatus=SOURCE_ERROR`면 연결 칸 "확인 불가". 관리자만 templateId(설치 안내 링크용).

## 5. 남은 것

- 런타임 미검증(dev BE 재기동은 하지 않음 — 메인 레포 :3000 bootRun 중). 실데이터 확인은 dev74/dev70 프로필(GPU 시험 서버)에서.
- `DashboardWidgetService.updateLayout`은 w/h 범위 검증이 없다(홈·APM과 같음, 이번 범위 밖).
