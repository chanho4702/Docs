# cloud-infra-permission 런타임 QA

검증일: 2026-08-24  
범위: `_workspace/contract_cloud-infra-permission.md`의 현재 사용자 권한 조회와 AWS 리소스 접근 제어

## 결과

**부분 통과, 런타임 재검증 필요.** 구현 소스와 대상 단위 테스트는 통과했다. 그러나 이미 실행 중인 Spring 개발 서버(:3000)는 새 `GET /users/me/permissions`를 반영하지 않은 상태라 해당 계약과 일반 Role의 실제 HTTP 200 + `code:403` 흐름을 끝까지 검증할 수 없었다. QA는 공유 프로세스를 재기동하지 않았다.

## 실행 증거

| 항목 | 재현/실제 결과 | 판정 |
|---|---|---|
| 미인증 차단 | `GET /users/me/permissions`, `GET /cloud-infras/status` 모두 HTTP 401 | 통과 |
| 관리자 세션 | `POST /auth/login`에 `admin/<마스킹>`, `x-visitor-id: qa-cloud-infra-permission-20260824`로 로그인 성공(HTTP 200, `accessToken` HttpOnly cookie 수령) | 통과 |
| 관리자 AWS 상태 조회 | 동일 세션의 `GET /cloud-infras/status` → HTTP 200, `{"status":"success","code":200,"data":{"state":"ready","source":"SETTING","settingPresent":true}}` | 통과 |
| visitor 세션 불일치 | 위 access cookie + 다른 `x-visitor-id`로 status 요청 → HTTP 401, `INVALID_TOKEN` | 통과 |
| 현재 사용자 권한 API | 동일한 유효 관리자 세션의 `GET /users/me/permissions` → **HTTP 404** | 실패(실행 서버 stale) |
| 일반 Role 거부 | 일반 사용자 세션/역할 변경 없이 검증해야 하나, 공유 dev DB 변경은 QA 범위를 벗어나 수행하지 않음. `DmovePermissionCheckerTest`의 fail-closed 케이스로 대체 | 런타임 미검증 |
| AWS 미설정 gate | 현재 환경은 `/status`가 `state: ready`, `source: SETTING`이라 미설정 상태를 만들 수 없음. 권한 체크가 `credentials.requireConfigured()`보다 먼저 실행되는 것은 소스에서 확인 | 런타임 미검증 |

## 대체 검증

### BE

다음 명령이 통과했다.

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :test --tests 'com.dmove.moveseye.auth.security.DmovePermissionCheckerTest' --rerun-tasks --no-daemon --console=plain
```

`build/test-results/test/TEST-com.dmove.moveseye.auth.security.DmovePermissionCheckerTest.xml` 기준 3건 성공:

- 일반 Role의 `cloudInfraMonitoring.awsResources.view=true` 허용
- feature/Role 누락 또는 `view=false` fail-closed 거부
- `ADMIN`/`SUPER_ADMIN`의 기본 허용 및 template 반환

### FE

```powershell
yarn test userRolesPermissionsApi --runInBand
```

1 suite / 1 test 통과. `/users/me/permissions` 호출 계약을 확인했다.

`yarn build`는 이 환경에서 Vite transform 단계 이후 약 31초에 셸 실행이 종료되어 완료 여부를 확정하지 못했다. 실행 중인 FE(:5173, 2026-08-21 기동)는 `/`, `/sign-in` 모두 HTTP 404여서 브라우저 경로 검증에 사용할 수 없었다. 공유 FE 프로세스는 재기동하지 않았다.

## 재검증 절차

새 구현을 반영한 BE/FE를 기동한 뒤 아래를 재실행한다.

1. 일반 Role(`awsResources.view=false`)로 로그인 → `/users/me/permissions` payload에서 feature `view:false` 확인 → 6개 `/cloud-infras/*` API가 HTTP 200 + body `code:403`인지 확인.
2. 해당 Role의 feature를 `true`로 저장 → 재로그인 없이 permission query invalidation 후 메뉴/직접 URL이 노출되는지 확인.
3. 관리자 로그인 → `/users/me/permissions`에 `awsResources.view:true` 확인 → `/cloud-infras/status` 200 확인.
4. AWS 설정을 갖추지 않은 격리 프로파일에서 허용 사용자의 resources API가 기존 `CLOUD_NOT_CONFIGURED` gate를 반환하고, 미허용 사용자는 AWS 설정 상태를 알기 전에 403으로 차단되는지 확인.

## 결론

현재 소스와 단위 수준의 권한 분기, 관리자 세션의 status 통과, 인증/visitor 보호는 확인됐다. 다만 실행 중인 서버의 `/users/me/permissions` 404는 배포 전 반드시 해소해야 하는 blocker이며, 일반 Role의 실제 403 envelope와 FE 직접 URL 흐름은 새 프로세스에서 재검증해야 한다.
