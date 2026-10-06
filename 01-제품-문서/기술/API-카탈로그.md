---
title: MovesEye API 카탈로그
doc_type: technical
audience: [백엔드 개발자, 프론트엔드 개발자, 연동 담당자]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: moveseye-be-spring Controller/DTO + dev OpenAPI(/v3/api-docs)
reviewed_at: 2026-08-11
review_cycle: monthly
---

# MovesEye API 카탈로그

> **정본은 코드와 OpenAPI다.** 이 문서는 도메인 지도와 **개별 엔드포인트 문서에 드러나지 않는 계약 규칙**을 설명한다. 정확한 요청·응답 스키마는 dev 환경의 `/v3/api-docs`(Swagger UI `/api`)에서 확인한다. 운영에서는 Springdoc이 꺼져 있다.
>
> 기준: 2026-08-11 소스, 컨트롤러 32개.

## 1. 반드시 먼저 읽을 공통 계약

### 1-1. HTTP 200이 성공이 아니다

> 🔴 **가장 중요한 규칙.** 응답은 `ApiResult` 봉투로 감싸지며, **실패도 HTTP 200으로 내려올 수 있다.** HTTP 상태 코드만 보고 성공 처리하면 조용히 잘못된 동작을 한다.

```json
{
  "status": "SUCCESS | ERROR",
  "code": 200,
  "errorCode": "…",
  "message": "…",
  "data": { }
}
```

성공 판정은 **`status` 필드**로 한다. 오류 분류는 `errorCode`로 한다. `null` 필드는 응답에서 생략된다(`NON_NULL`).

이 설계는 NestJS 시절의 계약을 Spring으로 옮기면서 의도적으로 보존한 것이다. 클라이언트를 깨뜨리지 않기 위한 선택이며, 임의로 바꾸지 않는다.

### 1-2. syncTime

일부 응답은 봉투에 `syncTime`을 실어 **데이터의 신선도**를 알린다. 화면은 이 값으로 "언제 기준 데이터인지"를 표시한다. 값이 오래됐다면 수집·동기화 쪽을 의심한다.

### 1-3. 이중 언랩 주의 (FE)

FE는 axios 인터셉터와 `useDmoveQuery`가 **봉투를 두 겹 벗긴다.** 훅 소비자는 `data.data`가 아니라 **payload를 직접** 받는다. 테스트 목도 payload를 직접 주입해야 한다. 여기서 한 겹 더 벗기면 `undefined`가 된다.

### 1-4. 인증

| 요소 | 방식 |
|---|---|
| 액세스 토큰 | `Authorization: Bearer <token>` |
| 리프레시 | **HttpOnly 쿠키** |
| 세션 검증 | `x-visitor-id` 헤더 ↔ Redis 세션 대조 |

> `x-visitor-id`는 선택 헤더처럼 선언돼 있지만 **실질적으로 필요하다.** 인터셉터가 이 값과 Redis 세션을 대조한다. 직접 API를 호출해 테스트할 때 이 헤더를 빠뜨리면 인증이 통과하지 않는 경우가 있다.

리프레시가 쿠키 기반이므로 크로스 도메인 배포에서는 `COOKIE_SECURE`·`COOKIE_SAME_SITE`가 맞아야 로그인 상태가 유지된다.

### 1-5. 권한 검증

기능 권한과 호스트 그룹 데이터 범위를 **서버에서 다시 검증**한다. FE의 메뉴 숨김은 편의일 뿐 보안 경계가 아니다. 권한 없는 호스트 그룹은 목록뿐 아니라 **집계 수치에서도 제외**되어야 한다.

**ZM-157(2026-09-17, 소스 기준·미배포)의 판정 위치와 응답:**

| 항목 | 규칙 |
|---|---|
| 기능 권한 판정 | 컨트롤러 첫머리에서 `DmovePermissionChecker.requireView`·`requireEdit`·`requireAnyView`·`requireAnyEdit`. 키는 `DmovePermissionKey`. 적용 대상은 모니터링(`/hosts/**` 일부, `/host/{id}/**`, `/interface/**`, `/session/**`)·이벤트(`/event/**` 일부), 기존 APM·클라우드 |
| 관리자 | `userRole ∈ {ADMIN, SUPER_ADMIN}`은 역할 판정을 건너뛴다(`AdminAccessChecker`와 같은 집합) |
| 대상 호스트 | `/host/{id}/widgets…` 5개 API는 기능 권한 뒤에 `HostVisibilityChecker`로 호스트 가시성을 확인한다 |
| 미적용(공유 EP) | `/home/**`, `/hosts/hostgroups`, `/hosts/server`, `/hosts/detail/{hostid}`, `/hosts/search`, `/event/problems`, `/hosts/hostgroup-problems`, `/event/bells`, `/event/isRead`, `/event/stream`, `/users/my-profile`(GET), `/users/me/permissions`, `/users/role/permission`, `/auth/**` |
| 권한 거부 | **HTTP 200** + `code: 403`(`ForbiddenError`). 미연동 비관리자의 Zabbix 경유 요청은 `errorCode: FORBIDDEN` |
| 인증 실패 | 실제 **HTTP 401**. refresh 세대 불일치·계열 폐기·계열 없는 기존 토큰, MCP 토큰의 계정 비활성·사용자 유형 변경이 여기에 해당 |
| 관리자 전용 추가 | `PATCH /geo-clusters/host-coordinate` |

엔드포인트별 매핑과 새로 403·401이 날 수 있는 목록은 [권한 강제와 세션 회수 §5·§10](../%EA%B8%B0%EB%8A%A5/%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md)과 계약서 `C:\solutions\_workspace\contract_zm-157-permission-enforcement.md`가 정본이다.

### 1-6. 라이선스 게이트

라이선스 판정은 **인증 뒤**에 놓인다. 앞에 두면 401 리프레시 흐름이 라이선스 잠금 화면으로 잘못 표시된다. 만료 시 읽기는 유지하고 쓰기를 차단하는 단계적 정책을 따른다([관리자 가이드 §7](../%EA%B0%80%EC%9D%B4%EB%93%9C/%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)).

## 2. 도메인 지도

| 도메인 | 베이스 경로 | 주요 컨트롤러 |
|---|---|---|
| 인증 | `/auth` | AuthController |
| 세션 | `/session` | SessionController |
| 홈 | `/home` | HomeController |
| 호스트·그룹 모니터링 | `/hosts`, `/host` | HostController, HostEventController |
| 리소스 메트릭 | `/host` 하위 | CpuController, MemoryController, DiskController, NetworkController, InterfaceController, ResponseTimeController, ItemsController, WidgetsController |
| 이벤트·알람 | `/event` | EventController |
| 자산 | `/assets` | AssetController |
| 비용·감가상각 | `/costs` | CostController |
| 네트워크 맵 | `/network-architectures` | NetworkArchitectureController |
| 지리 맵 | `/geo-clusters` | GeoClusterController |
| 클라우드(AWS) | `/cloud-infras` | CloudInfraController |
| Zabbix 호스트 관리 | `/hosts/manage` | HostManageController |
| Zabbix 아이템 | `/zabbix-manage/items` | ZabbixItemManageController |
| Zabbix 트리거 | `/zabbix-manage/triggers` | ZabbixTriggerManageController |
| Zabbix 템플릿 | `/zabbix-manage` | ZabbixTemplateManageController, ZabbixTemplateGroupManageController |
| Zabbix 사용자 | `/admin/users` | AdminUserController, AdminUsrgrpController |
| 사용자·권한 | `/users` | UserController |
| 설정 | `/settings` | SettingController |
| 장비 분류 | `/settings/device-classifications` | DeviceClassificationController |
| 스케줄러 | `/settings/schedulers` | SchedulerSettingController |
| 라이선스 | `/features`, `/settings/license` | LicenseController |
| 리포트 관리 | `/admin/reports` | ReportManagementController |

## 3. 도메인별 계약

### 3-1. 인증 `/auth`

| 메서드·경로 | 용도 |
|---|---|
| `POST /auth/login` | 로그인. 리프레시 쿠키 발급 |
| `POST /auth/refresh` | 액세스 토큰 재발급 |
| `POST /auth/logout` | 세션 종료 |
| `POST /auth/forgot-password` | 재설정 메일 발송 |
| `POST /auth/resend` | 메일 재발송 |
| `POST /auth/reset-password` | 비밀번호 재설정 |
| `GET /auth/verify` | 토큰 검증 |

로그인·리프레시는 `x-visitor-id`를 함께 받는다.

**ZM-157(소스 기준·미배포)에서 바뀐 인증·계정 계약:**

| API | 변화 |
|---|---|
| `POST /auth/login` | 사용자 행 잠금 아래에서 판정한다. 잠금 대기 5초 초과 시 HTTP 200 + `errorCode: FAILED_TO_ACQUIRE_LOCK` |
| `POST /auth/refresh` | 토큰에 사용자 세대·로그인 계열이 있어야 한다. 계열 없는 기존 토큰, 세대 불일치, 로그아웃한 계열은 HTTP 401 |
| `POST /auth/logout` | 그 로그인 계열만 폐기한다. 미연동 계정은 원격 Zabbix 로그아웃을 부르지 않는다 |
| `/auth/verify-otp`, `/auth/reset-password` | 이메일 없는 계정은 `USER_NOT_HAS_EMAIL`. 소비·무효화된 OTP는 `OTP_NOT_EXIST_OR_EXPIRE`. 재설정은 `RESET_PASSWORD` 용도 OTP로만, 한 번만 가능 |
| `PUT /users/my-profile` | 본인 전용 요청 형식(`UpdateMyProfileDto`) — 역할·그룹·username·상태 변경 불가. 비밀번호·이메일 변경은 현재 비밀번호 필수. 비밀번호 변경 시 전 기기 폐기 후 응답에 `Set-Cookie: refreshToken`(Path=/auth)로 현재 기기만 재발급 |
| `PATCH /users/update-email` | 요청에 `currentPassword` 추가(비밀번호 보유 계정 필수, 틀리면 `CURRENT_PASSWORD_INCORRECT`) |
| MCP 토큰 요청 | 요청마다 계정 상태·사용자 유형·`mcp_permission` 재확인. 비활성·유형 변경은 401, 권한 회수·쓰기 강등은 200+403 |

### 3-2. 호스트·모니터링 `/hosts`

| 경로 | 용도 |
|---|---|
| `GET /hosts/hostgroups` | 호스트 그룹 목록 |
| `GET /hosts/server` | 서버 목록 |
| `GET /hosts/hosts-network` | 네트워크 장비 목록 |
| `GET /hosts/detail/{hostid}` | 호스트 상세 |
| `GET /hosts/{hostid}/collected-info` | 수집 정보 |
| `GET /hosts/{hostid}/livecheck` | 라이브 헬스체크 |
| `GET /hosts/{groupid}/resource-trend` | 그룹 리소스 추이 |
| `GET /hosts/{groupid}/alert-trend` | 그룹 알람 추이 |
| `GET /hosts/{groupid}/top-hosts` | 상위 호스트 |
| `GET /hosts/hostgroup-problems` | 그룹별 문제 집계 |

**라이브체크의 두 축은 성격이 다르다.** `ping`은 BE 서버가 직접 OS ping을 실행한 결과이고, `agent`는 Zabbix가 보고하는 인터페이스 가용성이다. Zabbix의 `icmpping` 아이템은 일부 호스트에만 있어서 직접 ping이 필요했다. 포트 probe 방식은 Zabbix 서버 제한 때문에 오판이 생겨 채택하지 않았다.

### 3-3. 메트릭 조회

CPU·메모리·디스크·네트워크·인터페이스·응답시간이 각각 컨트롤러로 나뉜다. 공통 규칙:

- **관측값 없음과 0을 구분한다.** 아이템이 없거나 수집이 안 되는 것과 실제 값 0은 다르다. 임의 폴백으로 메우지 않는다.
- **트래픽은 bps다.** `net.if.in/out`은 Zabbix가 bps 원값으로 준다. 바이트 포매터를 쓰면 약 940만 배 부풀려진다. 비트레이트 포매터(SI 1000 단위)를 쓴다.
- 디스크는 아이템 계열이 둘이다(`vfs.fs.size` / `vfs.fs.dependent`). 호스트에 따라 한쪽만 존재해 "차트엔 있는데 상세는 빈" 현상이 생겨서, 상세 조회에 계열 폴백이 들어 있다.

> 🔴 **폴백 체인은 응답 값을 바꿀 수 있다.** 과거 메모리 사용률에서 폴백 때문에 값이 달라진 사례가 있었다(0 → 11). 폴백 없는 전용 키를 쓰는 것이 원칙이고, 폴백을 추가할 때는 값 변화를 실측한다.

### 3-4. 이벤트 `/event`

| 경로 | 용도 |
|---|---|
| `GET /event/problems` | 활성 문제 목록 |
| `GET /event/problems/{id}` | 문제 상세 |
| `GET /event/{id}` | 이벤트 상세 |
| `GET /event/{id}/list-previous` | 이전 이벤트 |
| `PUT /event/{id}/acknowledge` | 인지 처리 |
| `GET /event/bells` | 알림 벨 |
| `PUT /event/isRead` | 읽음 처리 |

acknowledge는 **장애 해소가 아니라 인지 기록**이다. Problem과 Event는 다른 개념이므로 [용어집](../%EC%B0%B8%EA%B3%A0/%EC%9A%A9%EC%96%B4%EC%A7%91.md)을 확인한다.

> 알림 벨은 주기적으로 폴링한다. 세션 만료 시 이 폴링이 401을 반복해 무한 로딩처럼 보일 수 있다(알려진 이슈).

### 3-5. 자산 `/assets`

| 경로 | 용도 |
|---|---|
| `GET /assets` | 목록 |
| `GET /assets/summary` | 요약 |
| `GET /assets/{id}` | 상세 |
| `GET /assets/{id}/activities` | 변경 이력 |
| `PATCH /assets/{id}` | 수정 |
| `DELETE /assets/{id}` | soft delete(`excluded`) |
| `PATCH /assets/{id}/restore` | 복구 |
| `POST /assets/sync` | Zabbix 동기화 |

편집 소유권이 분리돼 있다 — Zabbix 원천 필드는 동기화가 덮어쓰고, MovesEye 소유 보강 필드만 영구 유지된다.

### 3-6. 비용 `/costs`

| 경로 | 용도 |
|---|---|
| `GET /costs/dashboard` | 비용 대시보드 |
| `GET /costs/hw` | HW 비용 목록 |
| `GET /costs/hw/incomplete` | 미입력 큐 |
| `GET /costs/hw/{assetId}/depreciation` | 감가상각 계산 결과 |
| `PATCH /costs/hw/{assetId}` | 비용 정보 수정 |
| `GET /costs/hw/template` | CSV 템플릿 |
| `POST /costs/hw/bulk-upload` | CSV 일괄 업로드(비동기) |
| `GET /costs/hw/bulk-upload/current` | 진행 중 작업 |
| `GET /costs/hw/bulk-upload/{jobId}` | 작업 상세 |

**업로드 계약의 함정:** 파일 상한은 10MB인데 요청 상한은 11MB다. 같게 두면 multipart 경계·헤더가 더해져 "정확히 10MB인 파일"이 요청 상한에 먼저 걸려 거부된다. 이 여유는 의도된 것이므로 같은 값으로 맞추지 않는다.

업로드는 **접수와 완료가 분리**된다. `POST` 성공은 접수일 뿐이며, 완료는 job 상태로 확인한다. 동시에 여러 작업이 돌지 않도록 활성 작업 유니크 제약이 있고, 멈춘 작업 판정을 위한 heartbeat가 있다(`V19`).

### 3-7. Zabbix 관리 계열

**쓰기 계약의 원칙 두 가지:**

1. **대상은 식별자로만 지정한다.** 필터 조건으로 대량 대상을 지정하는 쓰기는 허용하지 않는다 — 필터가 의도보다 넓게 걸리면 되돌릴 수 없다.
2. **배열 필드는 전체 교체다.** tags, template link 등은 보낸 값으로 통째 대체된다. 부분 수정하려면 현재 값을 읽어 포함시킨다.

오류 매핑에 주의할 점이 있다. Zabbix의 `-32602`(파라미터 오류)는 **`create`/`update`에서만 400으로 매핑**한다. 과거 이를 401로 처리해 "인증 오류"로 오인시킨 회귀가 있었다.

부분 수정에서 clearable 필드는 **빈 문자열이 "값 지우기"** 를 뜻한다. 필드 미포함(변경 없음)과 빈 문자열(클리어)을 구분해 보낸다.

트리거 생성은 `hostid`를 넘기지 않는다 — expression의 `/host/key`가 대상을 결정한다.

### 3-8. 렌즈 조회의 페이지네이션

Zabbix API에는 offset이 없다. 그래서 렌즈 조회는 **ID만 먼저 조회 → 슬라이스 → 해당 페이지만 상세 하이드레이트** 방식으로 임의 페이지 이동을 구현했다. 페이지당 0.4~1.3초가 든다. `LENS_CAP`으로 상한을 조정할 수 있다.

### 3-9. 스케줄러 `/settings/schedulers`

job 목록·활성 토글·주기 변경·수동 실행·실행 로그 조회를 제공한다. `jobKey`는 코드의 잡 레지스트리와 1:1이며 DB `scheduler_setting.job_key`와 일치해야 한다. job 목록과 각 job의 성격은 [관리자 가이드 §5](../%EA%B0%80%EC%9D%B4%EB%93%9C/%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)에 있다.

### 3-10. 라이선스

| 경로 | 용도 |
|---|---|
| `GET /features` | 현재 활성 기능·라이선스 상태 |
| `POST /settings/license` (JSON) | 키 문자열 등록 |
| `POST /settings/license` (multipart) | 키 파일 등록 |
| `DELETE /settings/license` | 해제 |

키는 **RS256 서명 JWT**이며, 만료를 `exp`가 아니라 `durationDays`로 싣는다 — 유효 기간이 **등록 시점부터** 계산되기 때문이다. `jti`로 재사용을 막는다.

오류는 HTTP 상태가 아니라 **200 + 바디의 코드**로 전달한다(§1-1).

> 🔴 라이선스 클레임 상수(`LicenseClaims`·`Edition`·`Feature`·`LicenseType`)는 제품과 발급 도구(`moveseye-license-issuer`)에 **동일한 사본**으로 존재한다. 저장소가 분리돼 있어 코드를 공유하지 않는다. **한쪽만 고치면 "발급은 되는데 제품이 거부"** 하는 상태가 된다. 양쪽 `LicenseContractTest`가 이를 잡으므로 변경 시 두 테스트를 모두 돌린다.

## 4. 수집 엔진 포트 경계

제품은 **다중 데이터소스(Zabbix·Prometheus·Datadog·Elasticsearch)** 를 지향하며, 모니터링 읽기는 특정 소스를 직접 호출하지 않고 **capability port**를 거친다. 2026-08-11 현재 구현된 어댑터는 Zabbix 하나다.

```text
app ──(compile)──▶ engine-api ◀──(구현, runtimeOnly)── engine-zabbix
                   중립 계약 + 소스 전용 계약              (향후: prometheus, datadog, …)
```

`app`은 어댑터 모듈에 **컴파일 의존할 수 없다**(빌드가 강제). 새 데이터소스를 붙일 때 앱 코드를 고치지 않기 위한 구조다.

중립 계약과 전용 계약을 가르는 기준은 **"값이 답하는 질문이 무엇인가"** 다. 어느 데이터소스에서도 같은 질문에 답하는 값이면 중립, 특정 소스 개념에만 존재하는 값이면 전용이다.

### 4-1. 포트

| 포트 | 담당 |
|---|---|
| `MetricPort` | 시계열·최신값·트렌드 |
| `InventoryPort` | 호스트·그룹·인터페이스 |
| `AlertPort` | 알람 조회·이력·인지 처리 |

포트 시그니처에 **인증 토큰이 관통하지 않는다.** 토큰 획득·갱신은 어댑터 내부 책임이며, 서비스 레이어는 어느 소스가 응답했는지 알지 못한다.

### 4-2. capability

`DataSourceRegistry`가 소스와 능력을 관리한다.

| capability | 의미 |
|---|---|
| `METRICS` | 시계열 메트릭 조회 |
| `INVENTORY` | 감시 대상 목록·속성 |
| `ALERTS` | 알람·이벤트 조회 |
| `ALERT_ACK` | 알람 인지 처리 |
| `LOGS` | 로그 조회 (로그 도메인, 계획) |
| `ZABBIX_ADMIN` | Zabbix 전용 대상 관리 |

미지 소스는 `NOT_FOUND`, 미구현 포트는 `UNSUPPORTED`로 응답한다. Phase 1은 소스 1개(`zabbix-default`)를 하드와이어했고, Phase 2에서 datasource 테이블과 소스 조회 엔드포인트가 추가되면 **FE가 capability로 메뉴를 게이팅**한다.

### 4-3. 쓰기 계약 원칙

포트를 통한 쓰기(예: 알람 인지)는 **명령은 서술적으로, 대상은 명시적 식별자로** 표현한다. 필터 조건으로 대량 대상을 지정하는 쓰기는 허용하지 않는다 — 필터가 의도보다 넓게 걸리면 되돌릴 수 없다.

### 4-4. 어댑터를 추가할 때

새 소스를 붙이는 작업은 다음으로 한정된다. 서비스·컨트롤러·FE는 원칙적으로 손대지 않는다.

1. 어댑터 모듈 신설, `engine-api` 포트 구현
2. 소스 고유 식별자·메트릭 키를 중립 모델로 번역하는 카탈로그 작성
3. 레지스트리에 소스와 capability 등록
4. 기존 화면이 그대로 동작하는지 런타임 동등성 확인

**폴백 체인을 임의로 넣지 않는다.** 값이 없을 때 다른 키로 대체하면 응답 값 자체가 바뀔 수 있다(§3-3 참조).

## 5. 클라이언트 구현 시 체크리스트

- [ ] `status` 필드로 성공을 판정하는가 (HTTP 200 아님)
- [ ] `errorCode`로 오류를 분류하는가
- [ ] `Authorization` + `x-visitor-id`를 보내는가
- [ ] 리프레시 쿠키가 전송되도록 credentials 설정이 됐는가
- [ ] 빈 값과 0을 구분해 표시하는가
- [ ] 트래픽 단위에 비트레이트 포매터를 쓰는가
- [ ] 비동기 작업(업로드·동기화)의 접수와 완료를 구분하는가
- [ ] Zabbix 쓰기에서 배열 필드의 현재 값을 보존하는가

## 6. 관련 문서

- [아키텍처](%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98.md)
- [데이터 모델](%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md)
- [관리자 가이드](../%EA%B0%80%EC%9D%B4%EB%93%9C/%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)
- [용어집](../%EC%B0%B8%EA%B3%A0/%EC%9A%A9%EC%96%B4%EC%A7%91.md)
- 진행 중 계약: `C:\solutions\_workspace\contract_*.md`

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-11 | 최초 작성. 컨트롤러 32개 도메인 지도, ApiResult 200-오류 규약, 도메인별 특이 계약 정리 |
| 2026-08-11 | 수집 엔진 포트 경계(§4) 확장 — 포트 3종·capability 6종·쓰기 원칙·어댑터 추가 절차 |
| 2026-09-17 | §1-5 권한 판정 위치·공유 EP·403/401 구분, §3-1 인증·계정 계약 변화 추가(ZM-157, 소스 기준·미배포) |
