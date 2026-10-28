# 경계면 정합성 정적 풀스캔 — auth · user · setting · admin · cloud-infra

- 기준: Spring 정본(`moveseye-be-spring`). FE: `moveseyee_fe`. 참조: Nest(`moveseye-be`) 교차확인.
- 언랩 규약: axios 인터셉터 `response.data`(1겹) + `useDmoveQuery` `envelope.data`(1겹) = payload 2겹 언랩. useDmoveQuery 소비자는 payload 직접 수신. mutation(직접 await) 소비자는 1겹만 벗겨져 `ApiResult`(`{status,code,data,message}`) 수신 → `.data`에서 payload를 꺼내야 함.
- 검증 범위: auth.api / setting.api / user-roles.api / cloud-infra / server-location.api / asset.api + 대응 타입.

---

## 🔴 CRITICAL

### C-1. `/assets` 도메인 전체 BE 미구현 (CONFIRMED)
- 증상: `asset.api.ts`의 9개 함수 전부가 존재하지 않는 BE 엔드포인트를 호출한다. 런타임 404.
  - FE: `moveseyee_fe/src/services/asset.api.ts:37,41,67,72,77,82,87,92,97` — `/assets`, `/assets/{id}`, `/assets/custom`, `/assets/custom/{id}`
  - BE: `/assets` RequestMapping이 Spring 컨트롤러 전수에 **없음**(RequestMapping grep 결과 auth/users/settings/cloud-infras/admin/admin/users/event/host/interface/session만 존재). Nest에도 `@Controller('assets')` **없음**.
- 실사용(도달 가능): 
  - `moveseyee_fe/src/pages/asset/AssetList.tsx:200,223,259,270,281,573,575,615,632,648` (목록/상세/생성/수정/삭제/엑셀업로드 전부)
  - `moveseyee_fe/src/pages/asset/MapViewList.tsx:106,128,135`
  - `moveseyee_fe/src/pages/dashboards/Default.tsx:30,37,45,53` — **메인 대시보드 위젯 4+개**가 `getAssetList` 호출
- 근거: `asset.ts` 상단 주석·CLAUDE.md "asset은 과거 BE 미구현 이력". 자산 페이지는 "구현 중"이나 서비스 레이어·메인 대시보드가 이미 미구현 EP에 배선됨.
- 재현: 자산 메뉴 진입 또는 대시보드 로드 → `/assets*` 404 → 목록/카운트 위젯 로딩 실패.
- 수정 제안: be-engineer가 Spring에 `AssetController`(`/assets`, `/assets/custom`) + 서비스/DTO 구현. 미구현이면 FE 자산·대시보드 자산위젯을 feature-flag로 가드.

### C-2. `/server-locations` 도메인 전체 BE 미구현 (CONFIRMED)
- 증상: `server-location.api.ts`의 5개 함수(getList/getDetail/create/update/remove) 전부 존재하지 않는 EP 호출. 런타임 404.
  - FE: `moveseyee_fe/src/services/server-location.api.ts:25,30,35,40,45` — `/server-locations`, `/server-locations/{id}`
  - BE: `/server-locations` 컨트롤러가 Spring·Nest 어디에도 **없음**(`ServerLocation` 심볼 grep 0건, `@Controller('server-locations')` 0건).
- 실사용(도달 가능):
  - `moveseyee_fe/src/pages/asset/ServerLocationList.tsx:55,68,83,97` — CRUD 전체
  - `moveseyee_fe/src/pages/asset/MapViewList.tsx:120`, `AssetList.tsx:215`(`limit:9999` 위치목록), `dashboards/Default.tsx`
- 재현: 서버위치 관리 화면 CRUD, 맵뷰/자산목록의 위치 셀렉트, 대시보드 → 404.
- 수정 제안: be-engineer가 `ServerLocationController` + `server_location` 테이블(마이그레이션 V5) 구현, 또는 FE 가드.

---

## 🟠 HIGH — 인가(@Roles) 무력화

### H-1. SettingController `@Roles(SUPER_ADMIN)` 미작동 → 자격증명 EP가 전 인증사용자에 개방 (PLAUSIBLE, 원본 계약 보존 부작용)
- 증상: `SettingController`는 클래스에 `@Roles(UserRole.SUPER_ADMIN)`를 달았으나 **`@RolesGuarded` 마커가 없다**(`SettingController.java:26-31`). CLAUDE.md 주의 #2 규약상 `RolesInterceptor`는 `@RolesGuarded`가 있는 컨트롤러에서만 `@Roles`를 검사 → 여기선 **조용히 무시**된다.
- 영향: `GET/POST /settings/zabbix`, `GET/POST /settings/cloud-infra`가 인증만 되면 비관리자도 호출 가능. 응답에 `value.zabbix_password` / cloud `password`(자격증명)가 포함(`SettingResponseDto.value`) → 권한 없는 사용자에게 노출.
- 근거: 원본 Nest `setting.controller`도 RolesGuard 미적용이라 `@Roles` 데코레이션이 장식이었음 → Spring이 1:1 보존. 즉 **의도적 보존이나 실제 인가 공백은 실재**.
- 판단: 계약 보존이 목적이면 유지가 맞지만, 보안상 문서화 필요. "정상화" 시 원본 대비 회귀 위험이므로 be-engineer와 정책 확인 권고.

### H-2. UserController `@Roles(SUPER_ADMIN)` 전량 미작동 (PLAUSIBLE, 동일 메커니즘)
- 증상: `UserController`도 `@RolesGuarded` 없음(`UserController.java:68-73`) → 모든 메서드의 `@Roles(SUPER_ADMIN)`(roles/users CRUD, host-group CRUD, zabbix 조회 등 약 25개)가 **무시**된다. 인증된 일반 사용자도 사용자 생성/삭제·역할 변경 가능.
- 근거: 원본 `user.controller`도 RolesGuard 미적용(CLAUDE.md 주의 #2, 2026-06-10 사이드바 이슈 이력). `/users/role/permission`이 admin(roleid=null)에게도 열려야 사이드바가 뜨는 구조라 의도적. → **의도적이나 인가 공백 실재**.
- 판단: H-1과 함께 "원본 보존 vs 실인가" 정책 결정 필요. 신규로 막으려면 `AdminAccessChecker.requireAdmin` 패턴(userRole 기준)을 개별 EP에 적용(전역 RolesInterceptor는 건드리지 말 것 — 회귀).

---

## 🟡 MEDIUM

### M-1. Admin 컨트롤러 always-deny + FE 미사용 (도달불가/깨진 EP) (CONFIRMED)
- 증상: `AdminUserController`(`/admin/users`, `/admin/users/zabbix-users`)와 `AdminUsrgrpController`(`/admin/usrgrps`, `/admin/roles`)는 `@RolesGuarded`+`@Roles(ADMIN)` 적용(`AdminUserController.java:34-35`, `AdminUsrgrpController.java:29-30`). CLAUDE.md 🔴 주의 #2대로 admin 계정은 zabbix 미연동 → JWT `roleid`=null → `"ADMIN".equals(null)=false`로 **항상 거부**(HTTP200 body `code:403`).
- 추가: FE는 이 EP들을 **호출하지 않는다**(`/admin/*` grep 결과 `/admin/reports`만 사용; 사용자·권한 관리 화면은 `/users/**`로 대체). → 사실상 도달불가 + 호출 시 깨지는 dead 엔드포인트.
- 판단: FE 영향 없음(현재). 향후 이 EP를 FE가 쓰려면 `AdminAccessChecker.requireAdmin`(userRole 기준)로 전환 필요.

### M-2. `setting.api.updateZabbixInfoDetail` 반환 타입 거짓 (PLAUSIBLE)
- 증상: FE `updateZabbixInfoDetail`가 `Promise<TZabbixInfo>`(flat `{zabbix_user, zabbix_password,...}`)로 타이핑(`setting.api.ts:50-54`). 그러나 BE `POST /settings/zabbix`는 `ApiResult<SettingResponseDto>` 반환 → 1겹 언랩 후 실제 값은 `{id,type,value,createdAt,updatedAt,expiredTime}`(SettingResponseDto). shape 불일치.
- 영향: 반환값을 실제로 소비하지 않으면 무해하나 타입이 거짓. 같은 파일의 다른 함수는 `TResponse<...>`를 쓰는데 이 함수만 flat DTO. 소비 시 `zabbix_user` 등 접근하면 undefined.
- 수정 제안: `Promise<TResponse<TZabbixInfoDetails>>`로 정정(fe-engineer).

---

## 🟢 LOW

### L-1. cloud-infra `TCloudInfraInfoResponse.expiredTime: string` 이나 BE는 항상 null
- BE `SettingResponseDto.expiredTime`은 항상 `null`(생성자에서 세팅 안 함, `@JsonInclude(ALWAYS)`; SettingResponseDto.java:29-30). FE `types/setting.ts:53` `expiredTime: string`. 만료시간 표시 UI가 있으면 항상 빈 값. (원본도 동일 — 계약 보존)

### L-2. cloud-infra 목록 응답에 `total` 누락
- BE `getVpcs`/`getEc2s`/`getRegions`는 `Map.of("items", ...)`만 반환(`AwsServiceImpl.java:149,202,255`; regions는 `{items}`). FE `TResponseList<T>`는 `total: number`(비옵셔널) 기대(`dataResponse.ts:30`). 페이지네이션 total 미제공 → 카운트/페이지 표시가 undefined. (EC2 대시보드 `{items:{ec2ByRegion...}}` shape는 FE `{items:TEc2Dashboard}`와 **일치 — 무결**.)

### L-3. `setting.api` zabbix-info 경로는 user 스코프 사용(정상)
- `getZabbixInfo`/`updateZabbixInfo`가 `/users/zabbix-info/{id}`(`setting.api.ts:16-32`) → `UserController.getZabbixUserInfo`/`updateZabbixUserInfo`(`UserController.java:334,342`)로 정상 매핑. 경로/메서드 일치. 특이사항 아님(기록용).

---

## 무결 확인(오탐 방지 기록)
- auth: 경로/메서드 전부 일치. `login`/`verify`/`forgot-password`/`resend`/`reset-password`/`logout` 매핑 OK. `OtpType`(VERIFY_EMAIL/RESET_PASSWORD) = FE `ResendVerifyType` 값 일치. `ForgotPasswordDto{username, onlyCheckExisted:Boolean}` = FE `TForgotPassword` 일치. login/verify 응답은 BE가 User 엔티티 전체를 주고 FE가 subset(TProfile/token)만 읽음 → 정상.
- 403→200 보존 규약: `ApiResult.error(...,403)` + GlobalExceptionHandler로 유지됨(CLAUDE.md #1). FE 인터셉터는 401만 세션만료 처리(`axiosInstance.ts:70`), 200+code403은 성공 파이프 통과 → 소비처에서 code 확인 필요하나 이는 원본 계약(별도 리스크 아님).
- 인증 헤더: 인터셉터가 Bearer + `x-visitor-id`(localStorage) 자동 주입(`axiosInstance.ts:40-48`). BulkAPI도 동일(`asset.api.ts:15-21`). 보호 EP(@VisitorIdCheck) 충족.
