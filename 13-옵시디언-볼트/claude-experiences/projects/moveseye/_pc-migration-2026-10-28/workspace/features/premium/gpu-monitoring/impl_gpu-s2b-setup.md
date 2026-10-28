# GPU S2.5 — 설치 안내·연동 방식 선택 BE API (ZM-78)

작성: Claude(be-engineer) · 2026-10-08 · 워크트리 `C:\worktrees\zm-78-be`(브랜치 `ZM-78`) · **미커밋**

요구(사용자 10-08): "설치 가이드랑 자빅스 버전 체크 및 어떤 방식으로 연동해서 볼건지 선택할 수 있게 해야 함".
계약: [features/premium/gpu-monitoring/contract_gpu-monitoring.md §11](contract_gpu-monitoring.md) — **IMPLEMENTED / 런타임 미검증**.

## 1. 변경 파일

### 신규 `src/main/java/com/dmove/moveseye/premium/gpu/setup/`
| 파일 | 역할 |
|---|---|
| `GpuSetupController` | REST 4개(`/gpu/setup/overview` · `PUT /selection` · `/presets/{id}/files/{name}` · `/hosts`) |
| `GpuSetupService` | 개요 조립·선택 저장·파일·호스트 현황 |
| `GpuSetupZabbixReader` | 버전(HealthPort, 5분)·템플릿(template.get×2, 60초)·호스트(host.get) |
| `GpuCollectionPath` | 방식 4종 enum — 프리셋 경로는 카탈로그 `Preset`을 가리킴, requirements·recommended |
| `GpuPathAvailability` | 가용성 순수 함수(카탈로그 `zabbixMajors` 주도) |
| `GpuPresetInstallJudge` · `GpuTemplateRow` | 설치 상태 4종 판정 |
| `GpuPresetFiles` | 카탈로그 → 내려받기 파일 목록·종류·Content-Type·LF 대상 |
| `ZabbixVersion` | 버전 파싱·비교 |
| `GpuSetting` · `GpuSettingRepository` | `gpu_setting` 단일 행 + upsert 한 문장 |
| DTO | `GpuSetupOverviewDto` · `GpuSetupHostsPayloadDto` · `GpuSetupSelectionReqDto` · `GpuSetupSelectionResultDto` |

### 수정
- `premium/gpu/GpuAccessChecker.java` — `requireAdmin(user)` 추가(userRole 축, 거부 = 200 + 403 `errorCode:FORBIDDEN`).

### Flyway
- `V73__gpu_setting.sql` — `gpu_setting(id PK CHECK id=1, selected_path varchar(40), selected_by, selected_at timestamptz)` + 시드 1행, `IF NOT EXISTS`·`ON CONFLICT DO NOTHING`. 번호 재확인: 이 워크트리 V72가 최신, 다른 워크트리(`apm-c05-followup`)는 V71만 — V73 비어 있음. 🔴 병합 직전 다시 `ls db/migration`.

### 테스트 `src/test/java/com/dmove/moveseye/premium/gpu/setup/`
`GpuSetupRulesTest`(13) · `GpuSetupServiceTest`(9) · `GpuSetupZabbixReaderTest`(5) · `GpuSetupAccessTest`(1) · `GpuSetupControllerIT`(4).

읽기만 한 곳: `zabbix-presets/**` · `common/zabbixpreset/**` · `engine-zabbix/**`.

## 2. 결정

| # | 지시/설계 | 실제 | 이유 |
|---|---|---|---|
| D1 | 공식 `major.minor ≥ 7.2` | **7.2.1 이상** | 실측 §1·§5: 공식 플러그인 통신 규약 6.4.0은 7.2.1부터. 7.2.0을 AVAILABLE로 주면 안내대로 해도 안 붙는다. reasonCode는 지시대로 `ZABBIX_VERSION_BELOW_7_2` |
| D2 | 프리셋 경로 `≥ 7.0` | 카탈로그 `zabbixMajors` 중 **서버 이하인 형식이 하나라도** 있으면 AVAILABLE, 사유는 `ZABBIX_VERSION_BELOW_{최저 형식}` 자동 생성 | 카탈로그 주도. 6.0 파일이 추가되면 코드 수정 없이 반영. 덤으로 `recommendedTemplateFormat`(가져올 수 있는 가장 높은 형식) |
| D3 | 응답 모양 | 지시 DTO + **추가 필드** `installStatus`(AVAILABLE/HIDDEN/SOURCE_ERROR) · `paths[].recommendedTemplateFormat` · `presets[].templateHost` · `files[].downloadPath` · `guideContext`(12개 값) | 비관리자 숨김과 Zabbix 실패를 `installed:null`(=미설치)과 구분할 수 없어서. 파일 URL은 FE가 조립하지 않게 |
| D4 | 비관리자 "상세 숨김" | presets[].installed·official = null, `guideContext.zabbixServerHost` = null, **template.get을 아예 부르지 않음** | 설치 상태·서버 주소는 설정 정보다(S2 `canViewAdminDetails`와 같은 축) |
| D5 | 관리자 판정 | `GpuAccessChecker.requireAdmin` 신설(내부는 `AdminAccessChecker.isAdmin`) | `AdminAccessChecker.requireAdmin`은 errorCode 없는 403을 낸다 — GPU 화면 안에서 `FORBIDDEN` 한 갈래로 분기하게 맞췄다. 축은 동일(userRole) |
| D6 | "관리자 CallerContext로 1회" | 템플릿·호스트 조회는 **서비스 계정 토큰**(`ZabbixUserService.getSuperAdminToken`, `ZabbixTemplateManageService` 선례) · template.get **2회**(태그 Exists + 기술명 필터)를 한 캐시로 | Zabbix의 `tags`와 `filter`는 AND라 한 번에 "태그 있음 OR 동명"을 못 묻는다. 60초 캐시라 부하는 분당 2회 |
| D7 | Zabbix 접근 계층 | engine-api `zabbix/` 계약(`ZabbixTemplateService`·`ZabbixHostService`) 직접 사용 | 설치 안내는 그 자체가 Zabbix 템플릿 도우미 — 중립 포트로 감쌀 대상이 아님. 금지된 engine-zabbix 구현 참조는 없다(빌드가 강제) |
| D8 | 버전 캐시 5분 | 성공만 캐시, 실패는 저장 안 함 | Zabbix가 살아나면 다음 요청이 바로 보게. 실패 시 매 요청 HealthPort(4초 예산)를 부르지만 관리자 화면 진입 빈도라 수용 |
| D9 | 선택 거부 | UNAVAILABLE만 거부(`GPU_BAD_QUERY` + `data.reasonCode`), **UNKNOWN은 허용** | 버전을 일시적으로 못 읽는다고 설정을 막지 않는다 |
| D10 | 파일 다운로드 경로 조작 | 카탈로그 목록에 **정확히 같은 이름**만, 실패는 `GPU_NOT_FOUND`(404) | 요청 문자열을 경로에 잇지 않는다. 템플릿 이름은 메이저별로 `{id}-zabbix{major}.yaml`(원본이 전부 `template.yaml`이라) |
| D11 | `.sh` LF | `.sh` **와 `.conf`** 모두 CRLF→LF | conf 값 끝 `\r`도 리눅스 에이전트에서 깨진다 |
| D12 | hosts 범위 | 후보(linkedOnly=GPU 템플릿 직접 연결 / 검색=이름, 상한 1000) → `InventoryPort.listHosts`(호출자 자격) 교집합 → 페이지 → `host.get` 상세 | 허용 범위 교집합 지시. `resolveScope`(200 상한)는 설치 화면엔 부적합해 쓰지 않음. 상세는 `output: extend` — `active_available`은 6.4+ 전용이라 명시하면 6.0에서 파라미터 오류 |
| D13 | `detectedProfile` | **연결 템플릿 기준**, 어댑터 우선순위(DCGM > NVML > SMI) | 아이템 수준 판정은 진단 EP의 몫. 프리셋→프로필 매핑을 app에 둠(요청 Q1) |
| D14 | 안내 단계 | BE는 주지 않음(FE i18n). 환경 값만 `guideContext` | 지시대로. `zabbixServerHost`는 API URL 호스트라 트래퍼 주소와 다를 수 있음 — FE는 편집 가능한 기본값으로 |

## 3. 요청 (직접 고치지 않음)

| # | 대상 | 요청 | 왜 | 지금 |
|---|---|---|---|---|
| Q1 | `common/zabbixpreset/ZabbixPresetCatalog` | `Preset`에 `collectionProfile()`(engine-api `GpuCollectionProfile`) 추가 | 프리셋→프로필 매핑이 app `GpuSetupService.profileOf`의 switch와 어댑터 두 곳에 흩어짐 | switch에 3종 하드코딩, 모르는 프리셋 UNKNOWN |
| Q2 | `engine-zabbix/.../gpu/ZabbixGpuInventoryAdapter.chooseProfile` | 태그 값 `gpu-nvidia-smi-active`를 `MOVESEYE_NVIDIA_SMI_V1`로 인식(가능하면 카탈로그 `findById` 기반으로) | 🔴 지금 상수 비교(`PRESET_NVIDIA_SMI`)라 액티브 변형 호스트는 태그로 판정되지 않고 `UNKNOWN_PRESET` 진단 + 아이템 키 접두사로만 UNKNOWN 프로필이 된다 → 목록 capabilityTier·진단이 틀어짐 | 미반영(이 S2.5 범위 밖) |
| Q3 | 프리셋 에이전트 | (a) 액티브 변형 YAML의 `moveseye_preset_version` 태그·카탈로그 버전 일치 확인 (b) 6.0 export 추가 시 카탈로그 `zabbixMajors`에 `"6.0"`만 넣으면 설치 안내가 자동 반영됨을 공유 | — | `GpuSetupServiceTest.download`가 카탈로그 전 파일의 클래스패스 존재를 검사(누락 시 빨개짐) |
| Q4 | `ZabbixClient`(부모 작업 중) | 7.2+ `Authorization: Bearer` 수정이 들어가야 7.4 서버에서 이 API의 template.get·host.get이 동작 | 실측 §7 | 버전 조회(apiinfo.version)는 무인증이라 지금도 동작 |
| Q5 | (선택) 제품 버전 | `moveseye_preset_min_product` vs 현재 제품 버전 짝 확인(설계 §15.3) | 템플릿 줄에 `minProductTag`는 이미 읽어 둠 | 판정 미구현 — 제품 버전 상수 출처가 정해지면 `GpuPresetInstallJudge`에 한 줄 |

## 4. 테스트 수치

- 대상 실행 `:test --tests "com.dmove.moveseye.premium.gpu.*"`(S2 전체 + S2.5): **95 / 실패 0**. 이 중 S2.5 = 단위 **28** + IT **4**(실 DB, V73 적용 확인).
  - 가용성: 7.0.6 · 7.4.15 · 6.0.30 · 조회 실패 · 응답 해석 불가 · 7.2.0/7.2.1 경계 · 권장 형식
  - 설치 상태: INSTALLED · OUTDATED · NEWER_THAN_PRODUCT · TAG_MISSING · 버전 태그 없음 · 태그 우선·연결 수 우선
  - 파일: 카탈로그 전 파일 클래스패스 존재·LF · 경로 조작 8종 거부 · 모르는 프리셋
  - 선택: 저장·UNAVAILABLE 거부·모르는 값·null 본문·UNKNOWN 허용 · DB에 남은 모르는 값
  - 권한: 비관리자 overview HIDDEN(template.get 미호출) · PUT/파일 403 봉투(IT) · requireAdmin 단위
  - 호스트: 교집합·인터페이스·연결·프로필 우선순위·빈 템플릿·Zabbix 실패 → 503
- `build -x test` 성공. `LicenseArchitectureTest` 8/0(A2: 새 컨트롤러 `@RequiresFeature` 보유).
- ⚠️ `FlywayMigrationSmokeIT` 1건 실패 — "파일 72개 vs 적용 73개": 공유 IT DB(`moveseye_it`)에 다른 워크트리의 **V71**이 적용돼 있어서다(이 브랜치엔 V71 파일이 없다). S2 기록 §7과 같은 원인, 이 변경의 회귀 아님. 같이 돌리면 그 테스트의 DB 재생성이 뒤 IT의 컨텍스트를 깨뜨리므로 GPU IT와 **따로** 돌릴 것.

## 5. FE(S3) 메모 — 화면 흐름

1. **버전 확인**: 진입 시 `GET /gpu/setup/overview`. `zabbix.reachable=false`면 상단 경고(버전 확인 불가)·경로 카드 전부 "확인 불가"(`UNKNOWN`)지만 선택은 막지 않는다. 버전 문자열 표시.
2. **방식 선택**: `paths[]` 4장 카드. `recommended` 배지(DCGM_HTTP), `availability=UNAVAILABLE`이면 비활성 + `reasonCode` i18n("Zabbix 7.2 이상 필요" 등). `requirements[]`를 체크리스트 칩으로. 현재 `selection.path` 강조. 관리자만 `PUT /gpu/setup/selection` — 저장 문구에 "수집 방식은 호스트별로 자동 판정되며 이 선택은 안내용"을 명시(`affectsCollection=false`).
   - 고르는 법 안내(설계 §5 결정 트리): 에이전트 설치 불가/서버→호스트 10050 막힘 → NVIDIA_SMI_ACTIVE, DCGM 가능 → DCGM_HTTP, 7.2.1+·Agent 2 → OFFICIAL_PLUGIN.
3. **단계 안내**(FE i18n, path별):
   - 파일: 선택 경로의 `presetId`로 `presets[]`를 찾아 `files[]` 다운로드 버튼(`downloadPath`, 관리자만). 템플릿은 `recommendedTemplateFormat`과 같은 `zabbixMajor` 파일을 기본으로. 응답이 `application/json`이면 오류 봉투.
   - 값 끼우기: `guideContext`(10051·9400·이미지 태그·패키지명·스크립트 경로·conf 디렉터리). `zabbixServerHost`는 **편집 가능한 입력의 기본값**(트래퍼 주소와 다를 수 있음).
   - 액티브: 에이전트 `ServerActive=<host>:10051`, `Hostname=<호스트 technicalName>`(여러 개 콤마) — 4단계 호스트 표의 `technicalName`을 복사 버튼으로.
   - DCGM·패시브·공식: 호스트 인터페이스 필수(`HOST_INTERFACE`) — 공인망 Zabbix ↔ 사설망 호스트면 프록시 권장 문구.
4. **설치 상태·호스트 확인**(관리자):
   - 프리셋 카드에 `installed.status` 배지: INSTALLED(정상) · OUTDATED(갱신 필요 — 새 파일로 다시 가져오기) · NEWER_THAN_PRODUCT(제품 업데이트 필요) · TAG_MISSING(태그 없는 사본 — 다시 가져오기) · null(미설치). `installStatus`가 HIDDEN이면 영역 자체를 숨기고, SOURCE_ERROR면 "Zabbix 조회 실패" + 재시도.
   - 공식 템플릿: `official.templateId` 유무·`linkedHostCount`.
   - `GET /gpu/setup/hosts`(기본 linkedOnly) 표: 호스트·인터페이스 가용(`available`)·액티브 상태·연결 템플릿·`detectedProfile`. 미연결 호스트를 찾을 땐 `linkedOnly=false&q=`. 행에서 "진단 보기" → 기존 `/gpu/hosts/diagnostics?hostId=`(GPU 수·프로필·사유).
- 권한: 비관리자는 1·2(읽기)만, 3의 다운로드·4는 숨김. PUT·파일·hosts의 거부는 body 403 `FORBIDDEN`.
- TS 타입은 계약 §11 그대로. 모든 null 키는 존재한다.
