---
tags: [moveseye, deployment, docker, apache, cors, flyway, assets, incident]
updated: 2026-08-07
---

# 2026-08-07 — 사내 VM 배포 복구·인증 프록시·MovesEye 전용 자산 seed

## 요약

사내 VM 3대에 배포한 MovesEye의 Spring Boot 부팅 실패부터 Docker 포트, Flyway baseline, FE CORS·쿠키·Apache reverse proxy 문제를 순서대로 진단했다. Flyway PostgreSQL 호환 문제는 코드 수정·커밋·push까지 완료했고, 운영 DB에는 Zabbix와 무관한 MovesEye 전용 데모 자산 12건을 넣었다. Apache proxy의 SELinux 차단과 브라우저 로그인 최종 E2E는 해결 명령 및 구성 방향까지 확인했지만 최종 성공 응답은 아직 기록되지 않았다.

## 운영 구성

| 역할 | 주소 | 구성 |
|---|---|---|
| FE | `10.230.0.90:80` | Apache, React 정적 빌드, SPA fallback, `/api` reverse proxy |
| BE | `10.230.0.91:80` | Docker `moves-be-spring`, host `80` → container `3000` |
| DB/Cache | `10.230.0.92` | PostgreSQL 16.14 `dmovedb`, Redis |

접속 비밀번호와 토큰은 이 Vault에 기록하지 않는다. 대화 중 전달된 운영 자격증명은 작업 후 별도 채널에서 교체하는 것이 안전하다.

## 1. Spring Boot 재시작 루프

### JWT 시크릿 부팅 가드

최초 부팅 실패의 마지막 원인은 `JwtTokenProvider`의 `JWT_SECRET must be at least 32 bytes (256-bit) for HS256`였다. `--restart always` 컨테이너는 애플리케이션이 종료 코드 1로 내려가자 계속 재시작했고, 이때 포트 연결 거부가 네트워크 문제처럼 보였다.

- 해결 원칙: 운영 secret을 32바이트 이상의 강한 랜덤 값으로 교체한다.
- Docker env는 컨테이너 생성 시 고정되므로 `.env`만 바꾼 뒤 `docker restart`하는 것으로는 부족할 수 있다. 기존 컨테이너를 제거하고 같은 `--env-file`·포트 옵션으로 재생성해야 한다.
- 중지된 컨테이너도 이름을 점유하므로 동일한 `--name moves-be-spring`을 쓰려면 기존 컨테이너를 먼저 제거해야 한다.

### Docker 포트 해석

최종 포트 매핑은 `0.0.0.0:80->3000/tcp`였다. 따라서 BE VM host에서 확인할 주소는 `http://127.0.0.1:80`이고, `curl localhost:3000`은 실패하는 것이 정상이다. `3000`은 컨테이너 내부 포트다.

## 2. Flyway baseline의 PostgreSQL 버전 불일치

`V1__baseline.sql`은 PostgreSQL 18.4 `pg_dump` 산출물이었고, 운영 PostgreSQL 16이 PG17부터 지원되는 `SET transaction_timeout = 0`을 인식하지 못해 SQLSTATE `42704`로 중단됐다.

- V1에서 해당 `SET` 문을 제거했다. 기본값이 이미 `0`이므로 PG17+ 동작에도 영향이 없다.
- `bootJar`와 JAR 내부 migration 확인, 격리 DB Flyway smoke test를 통과했다.
- 커밋·push: `3596398 #ZM-100 [FIX] Flyway V1 PostgreSQL 구버전 호환`
- 상세 원인과 교훈: [[projects/moveseye/2026-08-07-flyway-pg-compat|2026-08-07-flyway-pg-compat]]

재시도 중 `type "create_by_platform_enum" already exists`도 관찰됐다. 이는 DB에 해당 type이 이미 존재하는 상태에서 baseline의 `CREATE TYPE`이 다시 실행됐음을 뜻한다. 이전 migration 시도 또는 수동 반영 중 어느 경로로 생겼는지는 증거가 없으며, 사용자가 Flyway 문제 해결을 확인했다. 운영에서 어떤 객체/`flyway_schema_history` 정리를 수행했는지도 이 세션에 남지 않았으므로 구체 조치를 추정해 기록하지 않는다.

## 3. FE 라우팅·CORS·로그인 쿠키

### 확인된 현상

- FE origin `http://10.230.0.90`에서 BE `http://10.230.0.91/auth/login`을 직접 호출하면 CORS preflight가 차단됐다.
- BE 컨테이너 env는 이후 `CORS_ALLOWED_ORIGINS=http://10.230.0.90`, `COOKIE_SECURE=false`로 확인됐다.
- 로그인 응답은 성공해도 다시 `/sign-in`으로 돌아갔고, BE에는 `INVALID_TOKEN`이 기록됐다.
- Apache에 `FallbackResource /index.html`을 적용한 뒤 `curl -I http://127.0.0.1/sign-in`은 `200 OK`였다. 브라우저 새로고침의 `Not Found` 문제는 SPA fallback 영역이다.

### 채택한 구성 방향

개발/사내 HTTP 환경에서는 FE와 BE를 브라우저 관점에서 same-origin으로 만드는 편이 CORS와 HttpOnly cookie 문제를 함께 단순화한다.

```apache
ProxyPreserveHost On
ProxyPass        /api/ http://10.230.0.91/
ProxyPassReverse /api/ http://10.230.0.91/
ProxyPassReverseCookiePath /auth /api/auth

<Directory "/var/www/html">
    AllowOverride None
    Require all granted
    FallbackResource /index.html
</Directory>
```

- FE 빌드 변수의 목표값은 `VITE_API_URL=/api`다. `VITE_*`는 build-time 변수이므로 Bitbucket 변수만 바꿔서는 기존 정적 JS가 바뀌지 않으며 반드시 다시 빌드·배포해야 한다.
- 브라우저는 `http://10.230.0.90/api/auth/login`을 호출하고 Apache가 BE의 `/auth/login`으로 전달한다.

### Apache 503의 직접 원인

FE VM에서 Apache proxy가 `503 Service Unavailable`을 반환했지만 FE→BE 일반 네트워크 장애는 아니었다. Apache error log에 다음 증거가 있었다.

- SELinux: `Enforcing`
- `httpd_can_network_connect --> off`
- `(13) Permission denied: AH00957 ... connect to 10.230.0.91:80`

따라서 영구 허용 명령은 `setsebool -P httpd_can_network_connect 1`이다. 이후 `getsebool`, `httpd -t`, `systemctl reload httpd`, `/api/auth/login` 재호출 순으로 확인해야 한다. 이 세션에는 해당 명령 적용 후의 최종 HTTP 응답과 브라우저 로그인·새로고침 성공 증거가 남지 않았다.

## 4. Zabbix event sync 오류 — 별도 장애

애플리케이션 부팅과 HTTP 제공은 성공했지만 `event_sync` scheduler는 Zabbix `user.get` 응답의 `role` shape 때문에 실패했다.

- Java 모델 기대값: `Map<String,Object>`
- 일부 Zabbix 사용자 응답: `role: []`
- 결과: Jackson `MismatchedInputException`, scheduler `ZABBIX_API_ERROR`

작업 종료 시 BE worktree에는 이 문제를 다루는 **미커밋 변경**이 남아 있다(수정 8파일 + 신규 테스트 2파일). 방향은 다음과 같다.

- 관계 정보가 필요 없는 event sync·alert actor·사용자 sync는 `getBasicUsersInfo()`로 조회해 `selectRole`·`selectUsrgrps`를 요청하지 않는다.
- 관계 조회가 필요한 경로는 `role: []`을 `null`, 단일 객체 배열을 객체로 정규화한다.
- 별도로 `SettingService`의 secret 병합을 설정 타입별 실제 키(`password`)로 한정하는 수정과 테스트도 미커밋 상태다.

이 변경은 오늘 배포 복구 커밋 `3596398`에 포함되지 않았고, 테스트·커밋·운영 재배포 완료로 간주하면 안 된다.

## 5. Zabbix 비연동 MovesEye 전용 데모 자산

운영 `dmovedb`의 `asset`이 0건인 것을 확인하고, 재실행 방지 guard가 있는 SQL로 데모 자산 12건을 생성했다.

- 전건 `source=custom`
- 전건 `zabbix_hostid=null`, `linked_hostid=null`
- 전건 `coverage=unmonitored`
- 서버·DB·네트워크·보안·스토리지·전원·사내설비·cloud VM과 여러 lifecycle/deployment 상태 포함
- 비용정보: `purchase_cost` 11건, `lease_cost` 1건, `cloud_data` 1건
- `asset_activity` created 이력 12건, actor `demo-seed-20260807`
- 구분자: 이름 접두사 `DEMO-ME-`, custom property `seedBatch=DEMO-ME-20260807`

격리 DB에서 먼저 insert·검증·삭제한 뒤 운영에서 transaction commit했다. 운영 검증 집계는 `total=12`, `custom=12`, `no_zabbix_link=12`, `unmonitored=12`, `activity=12`였다.

- 재현 SQL: `C:\solutions\_workspace\seed_moveseye_custom_assets_20260807.sql`
- 상세 자산관리 기록: [[projects/moveseye/2026-07-08-assets-management|2026-07-08-assets-management]]
- 회수할 때는 먼저 `SELECT ... WHERE name LIKE 'DEMO-ME-%'`로 대상 12건을 확인하고, 사용자 승인 후 삭제한다. `asset_activity`는 FK cascade로 함께 정리된다.

## 검증 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| Flyway PG16 호환 수정 | 완료 | 빌드·격리 migration smoke test·commit/push |
| BE Docker host 80 → container 3000 | 확인 | `docker ps` 포트 매핑, 컨테이너 Up |
| SPA `/sign-in` fallback | 확인 | FE VM에서 `200 OK` |
| BE CORS env | 확인 | 컨테이너 env 출력 |
| Apache proxy 503 원인 | 확인 | SELinux boolean off + AH00957 permission denied |
| Apache SELinux 허용 후 proxy | 미확인 | 조치 후 재검증 출력 없음 |
| FE `VITE_API_URL=/api` 재빌드 | 미확인 | 최종 배포 산출물 확인 없음 |
| 로그인→새로고침 유지 E2E | 미확인 | 브라우저 성공 증거 없음 |
| event sync role shape 수정 | 진행 중 | 로컬 미커밋 변경, 테스트/배포 미확인 |
| custom asset seed | 완료 | 운영 12건·activity 12건 집계 |

## 교훈

1. `Restarting`·포트 거부는 네트워크보다 애플리케이션 마지막 `Caused by`부터 본다.
2. Docker host port와 container port를 구분한다. `80:3000`이면 host에서는 80으로 검사한다.
3. 최신 `pg_dump` baseline은 지원 최저 PostgreSQL에 실제 적용하는 smoke test가 필요하다.
4. React SPA 새로고침 404는 API router가 아니라 웹 서버 fallback 문제다.
5. CORS 설정만으로 HttpOnly cookie의 cross-site 문제까지 해결되지는 않는다. 사내 HTTP IP 배포에서는 same-origin reverse proxy가 단순하다. → [[topics/backend/session-auth-hardening|session-auth-hardening]]
6. Apache의 outbound proxy 503에서 `(13) Permission denied`가 보이면 방화벽뿐 아니라 SELinux boolean을 확인한다.
7. Vite 환경변수는 런타임 설정이 아니라 빌드 산출물에 주입된다.
8. 운영 seed는 식별 가능한 접두사·중복 guard·transaction·검증 집계·회수 기준을 함께 남겨야 한다.

## 다음 작업

- FE VM에서 `httpd_can_network_connect=on` 및 `/api/auth/login`이 더 이상 503이 아닌지 확인한다.
- FE 배포 JS가 `VITE_API_URL=/api`로 재빌드됐는지 확인하고 로그인→새로고침→보호 API 호출을 브라우저에서 검증한다.
- 미커밋 Zabbix `role` shape/기본 사용자 조회와 `SettingService` 변경을 전체 테스트한 뒤 별도 커밋·배포한다.
- 배포 후 `event_sync`가 최소 두 주기 연속 성공하는지 로그와 실행 이력으로 확인한다.
- 대화 중 사용된 운영 자격증명은 기록에서 제외하고 필요하면 교체한다.

관련: [[projects/moveseye/moveseye|moveseye]], [[projects/moveseye/2026-08-07-flyway-pg-compat|2026-08-07-flyway-pg-compat]], [[projects/moveseye/2026-07-08-assets-management|2026-07-08-assets-management]], [[projects/moveseye/2026-07-16-auth-hardening|2026-07-16-auth-hardening]], [[topics/backend/session-auth-hardening|session-auth-hardening]].
