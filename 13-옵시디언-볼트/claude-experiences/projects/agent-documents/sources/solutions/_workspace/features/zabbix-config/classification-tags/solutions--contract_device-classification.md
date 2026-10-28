# API 계약: 기기분류(Device Classification) 설정 관리

> 산출 2026-07-22 · be-engineer · BE 구현 완료(빌드/테스트 그린) 기준
> BE: `moveseye-be-spring` — 컨트롤러 `setting/classification/DeviceClassificationController.java`
> 설계 정본: `_workspace/features/zabbix-config/classification-tags/design_device-classification.md` (사용자 확정 결정 반영)

## 0. 공통

- Base path: **`/settings/device-classifications`**
- 응답 래퍼: 전 EP `ApiResult<T>` — 성공 `{status:"SUCCESS", code:200, data:<T>, syncTime:...}`.
- 권한: **GET 목록 = 인증 사용자 전원**(라벨/색 lookup용). **그 외 전부 관리자 전용**
  (`AdminAccessChecker.requireAdmin` — userRole ADMIN/SUPER_ADMIN). 거부는 **HTTP 200 + body `code:403`**(기존 거동 보존). 미인증은 401.
- `@VisitorIdCheck` 적용(전 EP) — 타 화면과 동일하게 JWT 쿠키/visitorId 필요.
- 에러는 HTTP 400 + body `{status:"ERROR", code:400, message:"<에러코드>", errorCode:"<에러코드>"}` (GlobalExceptionHandler 관례).

## 1. DTO

### DeviceClassificationDto (응답 공용)
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | number | PK |
| `code` | string | Zabbix `device_type` 태그 값과 1:1. **생성 후 불변** |
| `name` | string | 표시 라벨(KR) |
| `nameEn` | string \| null | EN 라벨. **null이면 FE가 name 폴백** |
| `color` | string | AntD Tag preset명 (`blue`/`geekblue`/…/`default`) |
| `sortOrder` | number | 표시 순서(오름차순) |
| `isSystem` | boolean | 기본(시스템) 분류 — true면 code 변경·삭제·active 변경 불가. **JSON 키 `isSystem` 그대로**(record라 is-접두 탈락 없음) |
| `active` | boolean | false = 드롭다운 비노출 + 쓰기 화이트리스트 제외 |
| `updatedAt` | string | `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` (UTC 전제 관례) |

## 2. 엔드포인트

### 2.1 `GET /settings/device-classifications` — 목록 (인증 전원)
- Query: `activeOnly` (boolean, 기본 false) — true면 active 행만(드롭다운/옵션용).
- 응답: `ApiResult<DeviceClassificationDto[]>` — `sortOrder` asc(동순위 id asc).
- **빈 테이블(V13 미적용 환경)이면 빈 배열** — 에러 아님. FE는 이때 정적 6종 폴백 유지(설계 §4.5).

### 2.2 `POST /settings/device-classifications` — 생성 (admin)
- 요청 body:
  ```json
  { "code": "storage", "name": "스토리지", "nameEn": "Storage", "color": "cyan", "sortOrder": 70, "active": true }
  ```
  - `code` 필수, 규칙 `^[a-z][a-zA-Z0-9_-]{0,63}$`(소문자 시작). `name` 필수(≤100).
  - `nameEn` 옵션(null 허용), `color` 옵션(기본 `"default"`), `sortOrder` 옵션(기본 = 현재 max+10), `active` 옵션(기본 true).
- 응답: `ApiResult<DeviceClassificationDto>` (isSystem=false 고정).
- 에러: `DEVICE_CLASSIFICATION_INVALID_CODE`(패턴 위반), `DEVICE_CLASSIFICATION_DUPLICATE_CODE`(**대소문자 무시** 중복).

### 2.3 `PUT /settings/device-classifications/{id}` — 수정 (admin)
- 요청 body (code 필드 자체가 없음 — 불변):
  ```json
  { "name": "서버", "nameEn": "Server", "color": "blue", "sortOrder": 10, "active": true }
  ```
  - `name` 필수. 나머지 null이면 **미변경**. `nameEn`은 빈 문자열이면 null로 저장.
- is_system 행: name/nameEn/color/sortOrder만 허용. **active를 현재값과 다르게 보내면 `DEVICE_CLASSIFICATION_SYSTEM_PROTECTED`**(같은 값이면 통과). 커스텀 행은 active 포함 전체 수정.
- 응답: `ApiResult<DeviceClassificationDto>`.
- 에러: `DEVICE_CLASSIFICATION_NOT_FOUND`, `DEVICE_CLASSIFICATION_SYSTEM_PROTECTED`.

### 2.4 `DELETE /settings/device-classifications/{id}` — 삭제 (admin)
- is_system(기본 5종+`notClassified`) → `DEVICE_CLASSIFICATION_SYSTEM_PROTECTED`.
- **사용 중이어도 삭제 허용**(확정 결정) — 호스트 태그는 잔존, 이후 읽기에서 `notClassified` 폴백(데이터 파괴 0, 복구=코드 재등록).
- 응답: `ApiResult<{ deleted: boolean, affectedHosts: number }>` — affectedHosts는 삭제 시점 Zabbix host.get(device_type=code 완전일치) 집계. **집계 실패 시 0**(삭제는 진행, 비치명).
- 에러: `DEVICE_CLASSIFICATION_NOT_FOUND`.

### 2.5 `GET /settings/device-classifications/{id}/usage` — 사용 현황 (admin)
- **삭제 확인 모달용**("사용 중 N건" 경고를 삭제 전에 표시하기 위한 EP — 확정 결정 UX 지원, 설계 §3 표에는 없던 추가분).
- 응답: `ApiResult<{ code: string, affectedHosts: number }>` (집계 실패 시 0).
- 에러: `DEVICE_CLASSIFICATION_NOT_FOUND`.

### 2.6 `PUT /settings/device-classifications/order` — 정렬 일괄 저장 (admin)
- 요청: `{ "ids": [2, 1, 3, ...] }` — 표시 순서대로. `ids` 필수(비어있으면 400 validation).
- 동작: 나열 순서대로 sortOrder를 10 간격 재부여. **요청에 없는 행은 기존 순서 유지**. 미존재 id가 섞이면 전체 거부.
- 응답: `ApiResult<DeviceClassificationDto[]>` — 재정렬된 전체 목록(sortOrder asc).
- 에러: `DEVICE_CLASSIFICATION_NOT_FOUND`.
- ⚠️ 경로 리터럴 `order`가 `{id}` 패턴보다 우선 매칭(스프링 규칙) — FE는 그냥 `/order`로 호출하면 됨.

## 3. 에러코드 (신규 4종)

| errorCode | 발생 |
|---|---|
| `DEVICE_CLASSIFICATION_NOT_FOUND` | 수정/삭제/usage/reorder의 미존재 id |
| `DEVICE_CLASSIFICATION_DUPLICATE_CODE` | 생성 시 code 중복(대소문자 무시) |
| `DEVICE_CLASSIFICATION_SYSTEM_PROTECTED` | is_system 행 삭제, is_system 행 active 변경 시도 |
| `DEVICE_CLASSIFICATION_INVALID_CODE` | code 패턴(`^[a-z][a-zA-Z0-9_-]{0,63}$`) 위반 |

기존 재사용: `INVALID_DEVICE_TYPE`(아래 §5), 권한 거부는 body `code:403`("Access Denied").

## 4. Seed (V13, FE 대조용 — 배포 직후 시각 변화 0)

| code | name(KR) | nameEn | color | sortOrder | isSystem |
|---|---|---|---|---|---|
| `server` | 서버 | Server | `blue` | 10 | true |
| `network` | 네트워크 | Network | `geekblue` | 20 | true |
| `security` | 보안 | Security | `volcano` | 30 | true |
| `database` | 데이터베이스 | Database | `purple` | 40 | true |
| `hardware` | 하드웨어 | Hardware | `gold` | 50 | true |
| `notClassified` | **분류되지 않음** | Not classified | `default` | 60 | true |

- 색/순서 = FE `DEVICE_TYPE_COLOR`(HostTab.tsx) / `ASSET_DEVICE_TYPE_OPTIONS` 순서와 1:1.
- ⚠️ **notClassified KR은 설계 초안의 '미분류'가 아니라 '분류되지 않음'** — 현행 FE가 실제 렌더하는 값은 루트 i18n 키 `not_classified`(kr.json 1571행 "분류되지 않음")이므로, 시각 변화 0 원칙에 따라 현행 렌더값으로 seed했다. FE 훅 전환 시 라벨 출처가 i18n→DB로 바뀌어도 표시 문자열이 동일하다.
- `notClassified`는 **태그로 저장되지 않는 폴백 센티널**(기존 시맨틱 유지) — 행은 라벨/색/순서 관리용.

## 5. 기존 EP 파급 (shape 불변, 검증/순회 축만 동적화)

- **`PATCH /hosts/manage/device-type`** + 호스트 생성/수정 `deviceType`: 화이트리스트가 정적 6종 → **레지스트리의 active code 집합**으로 교체. 미등록/비활성 code는 기존과 동일하게 `INVALID_DEVICE_TYPE`(400). 요청/응답 shape 변화 없음. → **커스텀 분류를 호스트에 지정 가능해짐.**
- **`GET /hosts/device-type/{groupid}`**(그룹 요약): 순회 축이 정적 6종 → active 목록(sortOrder 순). 응답은 원래 리스트 shape(`{device_type, number_of_hosts, all_host_names}[]`)라 **항목 수만 가변** — FE는 배열 길이를 6으로 가정하면 안 됨.
- 자산 동기화/호스트 목록의 `deviceType` 파생: 유효 code 집합이 동적 — **미지/삭제/비활성 code는 `notClassified`로 읽힘**(읽기 관대, 태그 잔존).

## 6. 폴백 동작 (FE가 알아야 할 것)

1. **BE 레지스트리**: `device_classification` 테이블이 비었거나 조회 실패 시 정적 6종으로 폴백 — V13 미적용 환경에서도 모든 기존 EP가 기존 거동 그대로. 캐시 TTL 60s + CRUD 시 즉시 evict(관리 화면 저장 → 최대 60s 내 전 파생 반영, 단일 인스턴스에선 즉시).
2. **GET 목록이 빈 배열**이면 FE는 정적 6종 상수 폴백 유지(기존 상수를 "seed 기본값+로딩 전/실패 폴백"으로 강등 — 설계 §4.5).
3. **분류 삭제/비활성 직후**: 자산 스냅샷(asset.device_type)은 다음 동기화까지 옛 code가 남을 수 있음 — FE `labelOf()`가 미지 code를 notClassified 행으로 폴백 표기하면 라벨 깨짐 없음(설계 §7 리스크 2).
4. `nameEn`이 null이면 name(KR) 폴백은 **FE 책임**.

## 7. FE 구현 힌트

- 서비스: `getList(activeOnly?)` / `create` / `update(id)` / `remove(id)` / `usage(id)` / `reorder(ids)`.
- 삭제 흐름: `GET {id}/usage` → 확인 모달("사용 중 호스트 N대는 미분류로 표시됩니다") → `DELETE {id}`.
- is_system 행 UI: 삭제 버튼 비활성, code readonly, **active 토글도 비활성**(변경 시도하면 SYSTEM_PROTECTED).
- 색은 AntD preset명 문자열 그대로 `<Tag color={...}>`에 사용 가능.
