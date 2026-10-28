# MovesEye 설치·배포 가이드

| 항목 | 내용 |
|---|---|
| 대상 독자 | 시스템 관리자, 인프라 엔지니어, 설치 담당자 |
| 문서 상태 | review |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-11 |
| 최종 검토 | 2026-08-11 |
| 검토 주기 | monthly |
| 정본 위치 | moveseye-be-spring/Dockerfile + application.yml + moveseyee_fe/package.json |
| 적용 범위 | source-derived procedure; production deployment unverified |

# MovesEye 설치·배포 가이드

> 이 문서는 **새 환경에 제품을 설치**하는 절차다. 이미 설치된 환경의 기동·검증은 **로컬·검증 Runbook**, 설치 후 제품 설정은 **관리자 가이드**를 본다.
>
> ⚠️ 이 절차는 소스(Dockerfile·빌드 스크립트·설정 파일)에서 도출한 것이며, **실제 production 배포로 검증되지 않았다.** **Production Runbook**이 `current`로 승격되기 전까지 운영 환경 적용은 담당자 검토를 거친다.

## 1. 시스템 구성

```text
                    ┌─────────────────┐
   Browser ────────▶│  FE (정적 번들)   │  Nginx 등 웹서버
                    └────────┬────────┘
                             │ HTTP/HTTPS
                    ┌────────▼────────┐
                    │ Spring app      │  :3000
                    │ (moveseye-be)   │
                    └───┬───┬───┬──┬──┘
              ┌─────────┘   │   │  └──────────┐
    ┌─────────▼──┐  ┌───────▼─┐ │      ┌──────▼─────┐
    │ PostgreSQL │  │  Redis  │ │      │   SMTP     │
    └────────────┘  └─────────┘ │      └────────────┘
                    ┌───────────▼────┐  ┌────────────┐
                    │ Zabbix JSON-RPC│  │  AWS API   │
                    └────────────────┘  └────────────┘
```

**FE는 정적 번들**이다. 빌드 결과를 웹서버가 서빙하고, API 호출만 BE로 간다. BE는 단일 Spring Boot 프로세스다.

## 2. 사전 요구사항

### 2-1. 필수 구성요소

| 구성요소 | 버전 | 비고 |
|---|---|---|
| JDK | **17** | 빌드·실행 모두. 상위 버전 미검증 |
| Node.js | 18 이상 | FE 빌드 시에만 필요 |
| PostgreSQL | 13 이상 권장 | jsonb 사용 |
| Redis | 6 이상 | 세션·Zabbix 인증 캐시 |
| Zabbix | JSON-RPC 지원 버전 | **필수 연동 대상** |

> 🔴 **JDK 17을 명시적으로 지정한다.** 시스템 전역 `JAVA_HOME`이 다른 버전(특히 JDK 8)을 가리키는 환경이 흔하다. 빌드가 알 수 없는 오류로 실패하면 가장 먼저 `java -version`을 확인한다.

### 2-2. 선택 구성요소

| 구성요소 | 필요한 경우 |
|---|---|
| SMTP 서버 | 비밀번호 재설정·메일 발송 |
| AWS 자격증명 | 클라우드 인프라(EC2·VPC) 모니터링 |
| Docker | 컨테이너 배포 시 |

### 2-3. 준비할 것

- [ ] Zabbix **전용 API 계정** (사람과 공유하지 않는 계정)
- [ ] 빈 PostgreSQL 데이터베이스와 접속 계정
- [ ] 충분히 긴 무작위 `JWT_SECRET`
- [ ] 서비스 도메인 또는 접속 URL (CORS·쿠키 설정에 필요)
- [ ] 제품 라이선스 키

## 3. 데이터베이스 준비

빈 데이터베이스만 만들면 된다. **스키마를 수동으로 만들지 않는다** — Flyway가 기동 시 `V1`부터 최신까지 자동 적용한다(현재 최신 `V20`).

```sql
CREATE DATABASE moveseye;
CREATE USER moveseye_app WITH PASSWORD '<강한 비밀번호>';
GRANT ALL PRIVILEGES ON DATABASE moveseye TO moveseye_app;
```

> Hibernate의 `ddl-auto`는 `none`이다. 애플리케이션은 스키마를 절대 자동 변경하지 않으며, 모든 스키마 변경은 Flyway 마이그레이션을 거친다. 이 정책을 끄지 않는다.

## 4. 환경변수 레퍼런스

`.env` 파일을 Spring이 자동으로 읽지 **않는다.** OS 환경변수 또는 컨테이너 환경변수로 프로세스에 주입해야 한다.

### 4-1. 필수

| 변수 | 설명 |
|---|---|
| `DB_HOST` | PostgreSQL 호스트 |
| `DB_PORT` | PostgreSQL 포트 |
| `DB_NAME` | 데이터베이스명 |
| `DB_USER` | DB 계정 |
| `DB_PASS` | DB 비밀번호 |
| `JWT_SECRET` | 토큰 서명 키. **기본값·예제값을 그대로 쓰지 않는다** |
| `ZABBIX_API_URL` | Zabbix JSON-RPC 엔드포인트 |
| `ZABBIX_SADMIN_USERNAME` | Zabbix 전용 계정 |
| `ZABBIX_SADMIN_PASSWORD` | Zabbix 전용 계정 비밀번호 |

### 4-2. 네트워크·보안

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | BE 리스닝 포트 |
| `CORS_ALLOWED_ORIGINS` | — | FE origin. **와일드카드로 낮추지 않는다** |
| `COOKIE_SECURE` | — | HTTPS 환경에서 `true`. HTTP 로컬이면 `false` |
| `COOKIE_SAME_SITE` | — | 크로스 도메인 배포 시 조정 |
| `BASE_PATH` | — | 리버스 프록시 하위 경로 배포 시 |
| `FE_PATH_WEB` | — | 메일 링크 등에 쓰이는 FE 주소 |
| `JWT_ACCESS_EXPIRATION_SECONDS` | — | 액세스 토큰 수명 |
| `JWT_REFRESH_EXPIRATION_SECONDS` | — | 리프레시 토큰 수명 |

### 4-3. 인프라

| 변수 | 기본값 | 설명 |
|---|---|---|
| `REDIS_HOST` | `localhost` | |
| `REDIS_PORT` | `6379` | |
| `SCHEDULER_POOL_SIZE` | `4` | 배치 스레드 풀. 등록 배치는 7개 |
| `SPRINGDOC_ENABLED` | 운영 `false` | **운영에서 Swagger를 켜지 않는다** |

### 4-4. 선택 기능

| 변수 | 설명 |
|---|---|
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | SMTP. 기본 465(SMTPS) |
| `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` | 발신자 표기 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | 미설정 시 IAM 표준 자격증명 체인 사용 |
| `LENS_CAP` | 아이템·트리거 렌즈 조회 상한 |
| `SYNC_ENABLED` | **기본 `false` 유지 권장** — §7-2 |

### 4-5. 사용하지 않는 변수

`VAULT_ADDR`, `VAULT_TOKEN`은 설정 파일에 흔적이 남아 있으나 **Vault 연동은 채택하지 않기로 결정**됐고 관련 설정은 주석 처리돼 있다. 되살리지 않는다. 시크릿 정본은 OS 환경변수다.

## 5. 백엔드 설치

### 5-1. 방법 A — Docker (권장)

이미지에 멀티스테이지 빌드가 정의돼 있다.

```bash
cd moveseye-be-spring
docker build -t moveseye-be:latest .

docker run -d --name moveseye-be \
  -p 3000:3000 \
  -e DB_HOST=... -e DB_PORT=5432 -e DB_NAME=moveseye \
  -e DB_USER=... -e DB_PASS=... \
  -e JWT_SECRET=... \
  -e ZABBIX_API_URL=... \
  -e ZABBIX_SADMIN_USERNAME=... -e ZABBIX_SADMIN_PASSWORD=... \
  -e REDIS_HOST=... \
  -e CORS_ALLOWED_ORIGINS=https://moveseye.example.com \
  -e COOKIE_SECURE=true \
  moveseye-be:latest
```

> **컨테이너는 UTC로 고정 실행된다**(`-Duser.timezone=UTC`). 날짜 처리가 UTC 전제이므로 이 설정을 바꾸지 않는다. 화면 표기 시각과 서버 시각이 다르게 보이면 이 때문이며, 정상이다.

### 5-2. 방법 B — JAR 직접 실행

```bash
cd moveseye-be-spring
./gradlew bootJar          # Windows: .\gradlew.bat bootJar
java -Duser.timezone=UTC -jar build/libs/*.jar
```

`systemd` 서비스로 등록할 때도 `-Duser.timezone=UTC`와 환경변수 주입을 빠뜨리지 않는다.

### 5-3. 기동 확인

1. 로그에 `Started` 가 찍히고 3000 포트가 바인딩됐는가
2. Flyway가 `V1`~`V20`을 적용하고 오류가 없는가
3. **Flyway 오류가 있으면 우회 기동하지 않는다** — 스키마 불일치 상태로 운영하면 이후 데이터가 깨진다

## 6. 프론트엔드 설치

```bash
cd moveseyee_fe
npm ci
npm run build        # 산출물: dist/
```

빌드 전 API 주소를 환경에 맞게 설정한다(`VITE_API_URL`). 환경별 빌드 스크립트도 있다: `build:dev`, `build:qa`.

`dist/`를 웹서버에 배치한다. **SPA이므로 모든 경로를 `index.html`로 폴백**시켜야 한다. 없으면 새로고침이나 URL 직접 입력 시 404가 난다.

```nginx
server {
    listen 443 ssl;
    server_name moveseye.example.com;

    root /var/www/moveseye;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # SPA 폴백 (필수)
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

프록시를 쓰든 직접 호출하든 **BE의 `CORS_ALLOWED_ORIGINS`에 실제 접속 origin이 들어가야** 한다.

## 7. 설치 후 필수 조치

### 7-1. 초기 계정 비밀번호 변경

마이그레이션 `V10`이 초기 관리자 계정을 시드한다. **최초 로그인 직후 비밀번호를 변경한다.**

### 7-2. 파괴적 동기화 차단 확인

`SYNC_ENABLED`가 `false`인지 확인한다. `true`이면 Zabbix에 없는 로컬 사용자가 삭제될 수 있다.

### 7-3. 문서 노출 차단

운영에서 `SPRINGDOC_ENABLED`가 꺼져 있는지 확인한다. `/api`와 `/v3/api-docs`가 응답하면 안 된다.

### 7-4. 제품 초기 설정

**관리자 가이드 §2**의 도입 순서를 따른다. 특히 **자산 최초 동기화**를 빠뜨리면 지리 맵이 빈 것처럼 보인다.

## 8. 업그레이드

1. **DB를 백업한다.** Flyway 마이그레이션은 자동 롤백되지 않는다.
2. 릴리스 노트에서 새로 추가된 마이그레이션과 환경변수를 확인한다.
3. BE를 정지한다.
4. 새 이미지/JAR로 교체하고 기동한다 — Flyway가 신규 마이그레이션만 적용한다.
5. FE 번들을 교체한다. **브라우저 캐시 때문에 구 번들이 남을 수 있으므로** 강제 새로고침으로 확인한다.
6. 로그인 → 홈 → 호스트 그룹 → 호스트 상세 → 문제 목록 순으로 스모크 테스트한다.

> 🔴 **BE와 FE 버전을 섞어 배포하지 않는다.** API 계약이 바뀐 릴리스에서 한쪽만 올리면 화면이 빈 값을 그리거나 저장이 실패한다. 원인 파악이 어렵다.

### 롤백

코드 롤백과 DB 롤백은 **별개로 판단**한다. 이전 버전 JAR로 되돌려도 이미 적용된 마이그레이션은 남아 있다. 스키마 변경이 포함된 릴리스는 되돌리기보다 **전진 수정(forward-fix)** 을 우선 검토한다.

## 9. 백업 대상

| 대상 | 내용 | 주기 권고 |
|---|---|---|
| **PostgreSQL** | 자산·비용·맵·사용자·권한·리포트·라이선스 등 제품 데이터 전체 | 일 1회 이상 |
| 환경변수·시크릿 | 접속 정보 | 변경 시 |
| Zabbix | Zabbix 자체 백업 정책을 따름 | 별도 |

Redis는 세션·캐시라 백업 대상이 아니다. 유실되면 재로그인이 필요할 뿐이다.

**복원 절차는 실제로 한 번 시연해 보기 전까지 검증된 것이 아니다.** 도입 시 복원 리허설을 권고한다.

## 10. 설치 시 자주 막히는 지점

| 증상 | 원인·조치 |
|---|---|
| 빌드가 이유 없이 실패 | `JAVA_HOME`이 JDK 17이 아님 |
| BE 기동 즉시 종료 | 환경변수 플레이스홀더 미해석 → DB 접속 정보 확인 |
| Flyway 오류로 기동 실패 | 빈 DB가 아니거나 checksum 불일치. **우회 기동 금지** |
| 화면은 뜨는데 API가 전부 실패 | `CORS_ALLOWED_ORIGINS` 누락, 또는 `VITE_API_URL` 오설정 |
| 로그인은 되는데 새로고침하면 로그아웃 | HTTPS인데 `COOKIE_SECURE=false`, 또는 크로스 도메인인데 `SameSite` 미조정 |
| 새로고침 시 404 | Nginx SPA 폴백 누락(§6) |
| 전 화면에서 호스트가 안 보임 | Zabbix API URL·계정 오류 |
| 지리 맵 후보 0건 | 자산 최초 동기화 미실행 |
| 시각이 9시간 어긋나 보임 | UTC 고정 실행. 정상 동작 |

## 11. 관련 문서

- **관리자 가이드** — 설치 후 제품 설정
- **로컬·검증 Runbook** — 기동·검증 절차
- **Production Runbook** — draft, 실행 금지
- **Credential 보호 정책** — draft
- **아키텍처**
- **문제 해결 가이드**

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-11 | 최초 작성. Dockerfile·환경변수 33종·Flyway V20·SPA 폴백 기준 |
