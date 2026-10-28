# ✅ 사용자 확정 결정 (2026-07-22, 구현 기준)
- **삭제 정책**: 허용 + 미분류 폴백(태그 잔존, 데이터 파괴 0). 삭제 전 "사용 중 N건" 경고. 비활성화도 허용.
- **기본 6종 보호**: is_system=true → code 변경·삭제 금지, **라벨/색/순서만 수정 허용**. 사용자 추가분은 전체 수정/삭제 가능. 미분류는 시스템 필수.
- **다국어**: DB `name` + `name_en` 2컬럼(i18n 키 폐기, 사용자 추가분도 다국어).
- **색**: AntD preset 색만(아이콘 제외).
- **쓰기 검증**: device-type PATCH를 DB 목록 code 화이트리스트로 교체.
- **FE 통합**: 이번에 전 사용처(~20파일) 일괄(상수 3개 수렴 → useDeviceClassifications 훅으로 대체).
- 실행: 하네스 be→fe→QA, fable5. 미커밋 유지.

---

# 설계: 기기분류(Device Classification) 설정 관리

> 작성 2026-07-22 · be-engineer · **설계 문서 — 코드 변경 없음**
> 요구: 고정 enum 6종(EDeviceType)이던 기기분류를 **우리 DB 관리 목록(CRUD)** 으로 전환.
> 설정 > 기기분류 관리 화면에서 추가/수정/삭제하고, 그 목록이 호스트/자산 분류 드롭다운·색·라벨에 반영.

## 0. 현황 요약 (조사 결과)

| 축 | 현재 상태 |
|---|---|
| 진실 저장소 | 호스트의 분류 = Zabbix `device_type` **태그 값**(host-classification-tags 기능). 우리 DB엔 분류 마스터 없음 |
| BE 유효값 | `DeviceTypeResolver.DEVICE_TYPES` 정적 리스트 6종(`server/network/security/database/hardware/notClassified`). 태그가 정확히 1개 & 유효값일 때만 인정, 그 외 `notClassified` 폴백 |
| BE 사용처 | `HostService`(그룹 상세 device-type 요약), `HostManageService`(목록 파생 + `validateDeviceType` 화이트리스트 + 태그 merge), `AssetDerivation`/`AssetSyncService`(자산 스냅샷 파생), `ZabbixHostService` |
| BE 검증 | `PATCH /hosts/manage/device-type` 및 호스트 생성/수정의 deviceType → `validateDeviceType`이 6종 외 `INVALID_DEVICE_TYPE`(400) |
| FE 옵션 | `ASSET_DEVICE_TYPE_OPTIONS`(constants/asset.ts, value+labelKey) = `HOST_DEVICE_TYPE_OPTIONS`(constants/host-manage.ts가 re-export) |
| FE 색 | `DEVICE_TYPE_COLOR`(HostTab.tsx, AntD Tag color 6종: blue/geekblue/volcano/purple/gold/default) — HostInfoTab과 공유 |
| FE 타입 | `EDeviceType`(enums/host-monitoring.ts), `TAssetDeviceType`(types/asset.ts 문자열 union) |
| FE 사용처 | 18~20파일: host-management 3(HostTab/HostFormDrawer/HostInfoTab), asset 3(AssetListPage/AssetDetailPage/AssetFormModal), HostGroupDetail, HostDetailModal, types 3, constants 2, enums 2, 테스트 5, locales 2 |
| 설정 화면 선례 | `pages/setting/ReportManagement.tsx`(+components), SideNav setting children에 `show: isSuperRole`, BE는 `AdminAccessChecker.requireAdmin` 패턴(`/admin/reports`) |
| Flyway | 최신 **V12**(zabbix_change_log) → 신규는 **V13** |
| 계약 유리한 점 | 그룹 상세 요약 `HostGroupDeviceTypeResDto`는 이미 `{device_type, number_of_hosts, all_host_names}` **리스트 shape** → 분류가 동적으로 늘어도 응답 구조 변화 없음 |

---

## 1. 데이터 모델 — 신규 테이블 `device_classification` (Flyway V13)

```sql
-- V13__device_classification.sql (멱등 — 공유 dev DB 고려)
CREATE TABLE IF NOT EXISTS device_classification (
    id          bigserial PRIMARY KEY,
    code        varchar(64)  NOT NULL UNIQUE,   -- Zabbix device_type 태그 값과 1:1. 생성 후 불변
    name        varchar(100) NOT NULL,          -- 표시 라벨(KR 기준 기본)
    name_en     varchar(100),                   -- EN 라벨(옵션, null이면 name 폴백) — 열린결정 (c)
    color       varchar(32)  NOT NULL DEFAULT 'default',  -- AntD Tag preset명 또는 #hex
    sort_order  integer      NOT NULL DEFAULT 0,
    is_system   boolean      NOT NULL DEFAULT false,      -- 기본 6종 보호 플래그
    active      boolean      NOT NULL DEFAULT true,       -- false = 드롭다운 비노출(soft 비활성)
    created_at  timestamp    NOT NULL DEFAULT now(),
    updated_at  timestamp    NOT NULL DEFAULT now()
);

-- 기존 6종 seed (현행 색/라벨/순서 그대로 — ON CONFLICT (code) DO NOTHING 멱등)
INSERT INTO device_classification (code, name, name_en, color, sort_order, is_system) VALUES
  ('server',        '서버',     'Server',         'blue',     10, true),
  ('network',       '네트워크', 'Network',        'geekblue', 20, true),
  ('security',      '보안',     'Security',       'volcano',  30, true),
  ('database',      '데이터베이스', 'Database',   'purple',   40, true),
  ('hardware',      '하드웨어', 'Hardware',       'gold',     50, true),
  ('notClassified', '미분류',   'Not classified', 'default',  60, true)
ON CONFLICT (code) DO NOTHING;
```

설계 포인트:
- **code가 진실**: Zabbix 태그에는 code만 저장. 이 테이블은 code의 메타(라벨/색/노출/순서)만 관리.
- **`notClassified`도 행으로 보유**: 라벨/색/순서를 함께 관리하기 위함. 단, 시맨틱은 유지 — 태그로 **저장되지 않는** 폴백 센티널(기존 `isRealDeviceType` 로직 그대로). 삭제·비활성 불가(is_system + 서비스단 추가 보호).
- **code 규칙**: `^[a-z][a-zA-Z0-9_-]{0,63}$` (Resolver가 lowercase 비교하므로 소문자 시작 강제, `notClassified`만 예외 seed). 생성 후 **수정 불가**(기존 호스트 태그와의 정합 파괴 방지 — 라벨만 바꾸면 됨).
- 다국어: DB name(+name_en) 방식 채택안. 기존 labelKey i18n은 seed 시점에 값으로 흡수. → 열린결정 (c).
- JPA: 일반 컬럼뿐이라 특수 매핑 불필요. `ReportRetentionSetting` 엔티티 패턴(단순 @Entity) 준용.

## 2. device_type 태그와의 관계 (정합 모델)

- 호스트: 지금처럼 Zabbix `device_type` 태그 1개에 code 저장(폼 round-trip으로 타 태그 보존 — 기존 규칙 유지).
- 파생(읽기): `DeviceTypeResolver`의 "정확히 1개 & 유효값" 규칙 유지하되, **유효값 집합을 정적 6종 → DB active code 집합**으로 교체.
  - 구현: `DeviceClassificationRegistry`(신규 서비스) — active code Set을 인메모리 캐시(TTL 60s + CRUD 시 즉시 evict). `DeviceTypeResolver.resolve(values, Set<String> validCodes)`로 시그니처 확장(정적 유틸 유지, 호출부 4곳에서 registry 주입). 테이블이 비어있으면(마이그레이션 전 등) 기존 6종 정적 리스트 폴백.
- **삭제/비활성 시 정합**: 코드가 목록에서 빠지면 해당 태그를 단 호스트는 다음 조회부터 자동으로 `notClassified`로 **읽힘**(태그는 남음 = 데이터 파괴 없음, 복구 = 코드 재등록). 자산 스냅샷(asset.device_type)은 다음 동기화 때 갱신 — 삭제 직후 자산 화면에 잠깐 stale 라벨 가능(§7 리스크).
- 요약: **쓰기 검증은 강하게(화이트리스트), 읽기는 관대하게(폴백)** — 마이그레이션 없이 안전.

## 3. BE API (신규 컨트롤러 `SettingDeviceClassificationController`, `com.dmove.moveseye.setting` 하위 제안)

경로 base: **`/settings/device-classifications`** (기존 `/settings/zabbix` 네임스페이스와 정합).
권한: **조회 GET = 인증 사용자 전원**(모니터링/자산 화면의 라벨·색 lookup에 일반 사용자도 필요), **변경 EP = `AdminAccessChecker.requireAdmin`**(HostManage/ReportManagement 선례 — `@RolesGuarded` 금지, 거부는 HTTP 200 + body code:403 보존).

| 메서드·경로 | 설명 | 요청 | 응답 |
|---|---|---|---|
| `GET /settings/device-classifications` | 전체 목록(설정 화면·FE 옵션 공용). `?activeOnly=true`면 active만 | — | `ApiResult<List<DeviceClassificationDto>>` |
| `POST /settings/device-classifications` | 생성 (admin) | `{code, name, nameEn?, color, sortOrder?}` | `ApiResult<DeviceClassificationDto>` |
| `PUT /settings/device-classifications/{id}` | 수정 (admin). code는 불변, is_system 행은 name/nameEn/color/sortOrder/active만( notClassified는 active 불변) | `{name, nameEn?, color, sortOrder?, active}` | `ApiResult<DeviceClassificationDto>` |
| `DELETE /settings/device-classifications/{id}` | 삭제 (admin). is_system 거부. 사용 중 정책 → 열린결정 (a) | — | `ApiResult<{deleted: boolean, affectedHosts: number}>` |
| `PUT /settings/device-classifications/order` | 정렬 일괄 저장 (admin) | `{ids: number[]}` (표시 순서대로) | `ApiResult<List<DeviceClassificationDto>>` |

`DeviceClassificationDto` (springdoc `@Schema` 부착):
```
id: number, code: string, name: string, nameEn: string|null,
color: string, sortOrder: number, isSystem: boolean, active: boolean, updatedAt: string(ISO)
```

에러코드(신규 ErrorCode): `DEVICE_CLASSIFICATION_NOT_FOUND`, `DEVICE_CLASSIFICATION_DUPLICATE_CODE`, `DEVICE_CLASSIFICATION_SYSTEM_PROTECTED`, `DEVICE_CLASSIFICATION_IN_USE`(정책 (a)가 차단일 때), 기존 `INVALID_DEVICE_TYPE` 재사용.

기존 EP 변경(계약 shape 불변, 검증 집합만 동적화):
- `PATCH /hosts/manage/device-type` + 호스트 생성/수정 `deviceType`: `validateDeviceType`이 registry의 active code 집합으로 검증(→ 열린결정 (e), 권장: 적용). 응답/필드 변화 없음.
- `GET /hosts/{groupid}/device-type`(그룹 요약): 순회 축을 정적 6종 → active 목록(sort_order 순)으로. 응답이 원래 리스트 shape라 **FE 계약 파괴 없음**(항목 수만 가변).
- 사용 중 카운트: DELETE 시점에만 `host.get`(tags filter `device_type=code`) 1회 호출해 count 산출(목록 GET에 상시 포함하지 않음 — Zabbix 부하 회피).

감사로그: 분류 CRUD는 우리 DB 설정 변경이므로 zabbix_change_log(V12) 축과 별개 — 1차에서는 감사로그 없이 가고, 필요 시 후속(열린결정 아님, 범위 제외 명시).

## 4. FE 통합 계획 (최소 침습)

**핵심 아이디어: 소비 지점은 이미 3개 상수(`HOST_DEVICE_TYPE_OPTIONS`/`DEVICE_TYPE_COLOR`/`DEVICE_TYPE_LABEL_KEY`)로 수렴돼 있다 → 이 3개를 훅 산출물로 대체하면 화면 20파일 대부분은 무수정 또는 소폭 수정.**

1. `services/device-classification.api.ts` — `getList(activeOnly?)`, `create`, `update`, `remove`, `reorder`.
2. `hooks/useDeviceClassifications.ts` — `useDmoveQuery`(queryKey `DEVICE_CLASSIFICATION_QUERY_KEY.LIST`, `staleTime` 길게 예: 10분, 설정 화면 mutation 시 invalidate). 반환:
   ```ts
   { items, options /* {value, label} — sort_order 순, active만 */,
     colorOf(code), labelOf(code) /* 미지 코드는 notClassified 행으로 폴백 */ }
   ```
3. 라벨: DB name/nameEn을 현재 언어(redux language)로 선택 — 기존 labelKey i18n 소비부는 `labelOf()`로 교체.
4. 전환 대상(1차 필수): HostTab(색·라벨·필터), HostFormDrawer(Select 옵션), HostInfoTab(색·라벨), AssetFormModal(Select), AssetListPage(필터·라벨), AssetDetailPage(라벨), HostGroupDetail(요약은 BE 응답 순서 따르므로 라벨·색만), HostDetailModal.
5. 존치: `EDeviceType` enum + 정적 상수는 **삭제하지 않고** "seed 기본값 + API 로딩 전/실패 시 폴백"으로 강등(주석 명시). `TAssetDeviceType` union은 `string`으로 완화(동적 코드 수용) — 타입 별칭 유지해 diff 최소화.
6. 테스트: 기존 5개 테스트에 `useDeviceClassifications` mock(정적 6종 반환) 추가 → 기존 어서션 유지.

## 5. 설정 화면 — "기기분류 관리"

- `pages/setting/DeviceClassificationManagement.tsx` (+ `components/ClassificationFormModal.tsx`) — ReportManagement 구조 준용.
- 목록 테이블(DmoveTable): 순서(↑/↓ 버튼 → reorder EP), code, 라벨(KR/EN), 색 미리보기(Tag), 시스템 여부, 활성 토글, 수정/삭제 액션. is_system 행은 삭제 버튼 비활성(+수정 모달에서 code readonly).
- 생성/수정 모달: code(생성 시만), name, nameEn, 색 선택(AntD preset 색 팔레트 Select — ColorPicker 자유 hex는 열린결정 (d)), active.
- 삭제: 확인 모달에 `affectedHosts` 수 표기("이 분류를 사용 중인 호스트 N대는 미분류로 표시됩니다" — 정책 (a)에 따라 문구/차단 분기).
- 라우트: `PATH_SETTING.deviceClassification` + routes.tsx PageWrapper(권한키는 ReportManagement와 동일 축), SideNav setting children에 `show: isSuperRole`로 등록.
- i18n: 화면 크롬 문자열(제목/버튼/컬럼)은 기존대로 en.json/kr.json — **분류 라벨 자체만 DB**.

## 6. 열린 결정 (사용자 리뷰 필요)

| # | 결정 | 옵션 | 권장안 |
|---|---|---|---|
| (a) | **사용 중 분류 삭제 정책** | ① 차단(IN_USE 에러, 호스트 0대일 때만 삭제) ② 허용(해당 호스트는 읽기 시 미분류 폴백, 태그는 잔존) ③ 삭제 대신 비활성(active=false)만 허용 | **② + 비활성 우선 안내**. 폴백 모델이라 데이터 파괴가 없고, ①은 대량 호스트 재분류를 강제해 운영 부담. UI에서 "비활성을 먼저 고려하라" 안내 |
| (b) | **기본 6종(is_system) 수정/삭제 범위** | ① 완전 잠금 ② 라벨·색·순서만 수정 허용, 삭제·code 변경 금지 ③ 전부 허용 | **②** (notClassified는 추가로 active 불변). 시스템 코드는 BE Resolver 폴백·기존 화면 의미와 얽혀 삭제 위험이 큼 |
| (c) | **다국어 라벨** | ① DB name 단일(단일어) ② name+name_en 2컬럼 ③ 기존 i18n labelKey 유지+커스텀만 name | **②**. 앱이 EN/KR 이중 언어인데 ①은 언어 전환 시 어색, ③은 이원 체계라 복잡. nullable name_en로 부담 최소 |
| (d) | **색 필드 범위 (+아이콘)** | ① AntD Tag preset명만(select) ② 자유 hex(ColorPicker) ③ 색+아이콘까지 | **①**. 기존 화면 전부 AntD Tag 기반이라 preset이 다크/라이트 테마 정합 보장. 아이콘은 사용처가 없어 제외 |
| (e) | **device-type 쓰기 화이트리스트를 DB 목록으로 교체** | ① 교체(active 코드만 허용) ② 기존 6종 고정 유지(신규 코드는 쓰기 불가) | **①**. 안 하면 커스텀 분류를 만들어도 호스트에 지정 불가 — 기능의 존재 의의. 검증 실패 응답(INVALID_DEVICE_TYPE, 400)은 동일 유지 |
| (f) | **FE 통합 범위** | ① 이번에 전 사용처(host-management + asset + 모니터링 + 모달) 일괄 ② 호스트 관리 우선, asset/모니터링은 후속 | **①**. 소비 지점이 상수 3개로 수렴돼 있어 일괄 전환 비용이 낮고, ②는 화면 간 라벨/색 불일치(같은 코드가 다른 라벨) 노출 |

## 7. 작업 분해 & 리스크

**BE (be-engineer)** — ①V13 마이그레이션+엔티티+리포지토리 ②Registry(캐시)+Resolver 시그니처 확장+호출부 4곳 교체 ③CRUD 컨트롤러/서비스/DTO+ErrorCode ④validateDeviceType·그룹 요약 동적화 ⑤테스트(JUnit5+Mockito: CRUD happy/보호규칙/IN_USE·폴백 resolve/빈 테이블 폴백) ⑥`_workspace/contract_device-classification.md` 산출.

**FE (fe-engineer)** — ①api+타입+queryKey+훅 ②상수 3개 소비부 훅 전환(§4 목록) ③설정 화면+라우트+메뉴+i18n ④기존 테스트 mock 보강+신규 화면 테스트.

**QA** — integration-qa: 계약 파일 ↔ FE 타입/훅 대조(특히 nameEn null, 그룹 요약 가변 리스트). functional-qa: 커스텀 분류 생성→호스트 지정→목록/상세/자산/그룹 요약 반영→비활성→드롭다운 소실+기존 호스트 미분류 폴백→재활성 복구 흐름.

**리스크**:
1. **고정 enum→동적 전환 회귀**: 사용처가 넓다(BE 4모듈, FE 20파일). 완화 — 읽기 폴백(미지 코드=notClassified) + 빈 테이블 시 정적 6종 폴백 + FE 훅 로딩 전 정적 폴백. shape 변화 EP 0개.
2. **자산 스냅샷 stale**: asset.device_type은 동기화 시점 파생 — 분류 삭제/비활성 직후 자산 화면 라벨이 한 동기화 주기 동안 옛 값. 완화 — labelOf 폴백이 미지 코드를 미분류로 표기하므로 라벨 깨짐은 없음(카운트만 일시 불일치).
3. **마이그레이션 seed 정합**: seed 색·순서를 현행 FE 상수와 그대로 일치시켜야 배포 직후 시각 변화 0. V13은 `IF NOT EXISTS`+`ON CONFLICT DO NOTHING` 멱등(공유 dev DB). 기적용 V1~V12 불가침.
4. **Registry 캐시 정합**: 다중 인스턴스 배포 시 TTL(60s) 내 코드 집합 불일치 가능 — 현 운영은 단일 인스턴스라 수용, 필요 시 Redis pub/sub 후속.
5. **GET 권한**: 목록 GET을 전원 공개로 여는 것이 신규 노출면 — 분류 메타는 민감정보 아님(라벨/색), 변경 EP만 admin 잠금.
