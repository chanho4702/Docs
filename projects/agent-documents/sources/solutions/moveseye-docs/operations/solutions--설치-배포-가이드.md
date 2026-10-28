---
title: MovesEye 설치·배포 가이드
doc_type: runbook
audience: [시스템 관리자, 인프라 엔지니어, 설치 담당자]
status: review
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: moveseye-be-spring/Dockerfile + application.yml + moveseyee_fe/package.json
reviewed_at: 2026-08-11
review_cycle: monthly
deployment_scope: source-derived procedure; production deployment unverified
---

# MovesEye 설치·배포 가이드

> 이 문서는 **새 환경에 제품을 설치**하는 절차다. 이미 설치된 환경의 기동·검증은 [로컬·검증 Runbook](solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md), 설치 후 제품 설정은 [관리자 가이드](../guides/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)를 본다.
>
> ⚠️ 이 절차는 소스(Dockerfile·빌드 스크립트·설정 파일)에서 도출한 것이며, **실제 production 배포로 검증되지 않았다.** [Production Runbook](solutions--%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98-%EB%9F%B0%EB%B6%81.md)이 `current`로 승격되기 전까지 운영 환경 적용은 담당자 검토를 거친다.

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
| PostgreSQL | **15 이상(필수)** | jsonb 사용. V74(APM 알람 이벤트 유일성, 2026-10-08)이 `NULLS NOT DISTINCT` 부분 인덱스를 쓰므로 15 미만에서는 마이그레이션이 실패한다 |
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

> **Flyway 추가 사항(2026-09-17 소스 기준, 위 `V20` 표기는 갱신 전 값이다)**
> - BE에는 버전 번호 없는 **반복 마이그레이션** `R__clear_seed_admin_public_mailbox.sql`(ZM-157, 배포 전)이 있다. 모든 버전 마이그레이션 뒤에 실행되며, 기본 `admin` 계정의 이메일이 초기 시드값 그대로일 때만 비운다. `flyway_schema_history`에 `version`이 빈 행으로 남는다.
> - AI 서버는 같은 DB에 **별도 이력 테이블** `flyway_schema_history_ai`로 `ai_` 테이블을 관리한다(최신 `V7`, 배포 전). BE Flyway와 충돌하지 않는다.

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
| `APM_LIVE_SPANS_ENABLED` | APM 실시간 관제(요청 관제·X-View) 서버 스위치. **기본 `false`**. 켜는 절차 네 가지는 관리자 가이드 §8-1 — 이 변수 하나만 켜면 동작하지 않는다 |
| `APM_LIVE_MAX_HEAP_MB` | 실시간 관제가 쓸 서버 메모리 예산(기본 384). 컨테이너 힙이 768MiB 미만일 때만 줄인다. 예산을 넘는 설정이면 기동 실패 메시지가 조정 방법을 알려 준다 |
| `APM_LIVE_STREAM_MAX_ACTIVE` / `APM_LIVE_STREAM_MAX_WAITING` / `APM_LIVE_STREAM_PER_USER` | APM 실시간 관제 동시 시청 상한(기본 40 / 10 / 4). 초과는 화면에 "대기 n번째"로 표시되고 대기열도 차면 15초 뒤 자동 재시도한다. 숫자를 올리기 전에 프록시(아파치) 동시 연결 한도를 먼저 본다 — 장기 연결이 그 수만큼 worker를 점유한다. `PER_USER`는 `MAX_ACTIVE`를 넘을 수 없다(기동 실패) |
| `APM_LIVE_STREAM_MAX_SNAPSHOTS` / `APM_LIVE_STREAM_QUEUE_MIB` / `APM_LIVE_STREAM_WRITE_TIMEOUT_MS` | 같은 기능의 세부 상한(기본 2 / 8 / 2000). 지원 담당자 안내 없이는 기본값 유지 |
| `ARCHIVE_ALLOWED_ROOTS` | 데이터 아카이빙(보존 기간이 끝나기 전 데이터를 파일로 보관)이 쓸 수 있는 디렉터리 루트(절대 경로, 쉼표로 여러 개). **비우면 아카이빙 기능이 켜지지 않는다**(기본 비어 있음). 컨테이너 배포는 반드시 볼륨을 마운트한 경로를 넣는다 — §5-1 "데이터 아카이빙 볼륨" |

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
  -e ARCHIVE_ALLOWED_ROOTS=/data/archive \
  -v /data/moveseye-archive:/data/archive \
  moveseye-be:latest
```

**데이터 아카이빙 볼륨(`-v … :/data/archive`).** 데이터 아카이빙은 보존 기간이 끝나 지워지기 직전의 데이터를 ZIP 파일로 떨군다. 그 파일은 **컨테이너 밖 볼륨**에 있어야 한다 — 마운트 없이 기능을 켜면 컨테이너를 다시 만들 때마다(=매 배포) 아카이브 파일이 전부 사라진다. 그래서 `ARCHIVE_ALLOWED_ROOTS`는 **마운트 지점과 같은 값**으로 짝지어 넣는다. 관리 화면(설정 › 데이터 아카이빙)에서는 이 루트 **아래**의 경로만 고를 수 있고, 저장할 때 실제로 파일을 써 보는 검사를 통과해야 한다. `ARCHIVE_ALLOWED_ROOTS`를 비워 두면 기능 자체가 꺼진 상태로 유지되며(기본), 이때 보존 정리 동작은 예전과 같다. NAS·NFS를 쓰려면 호스트 OS에서 마운트한 경로를 같은 방식으로 볼륨으로 넘긴다(원격 스토리지 SDK는 쓰지 않는다). 아카이브 디렉터리는 §9 백업 대상에 넣는다.

> **컨테이너는 UTC로 고정 실행된다**(`-Duser.timezone=UTC`). 날짜 처리가 UTC 전제이므로 이 설정을 바꾸지 않는다. 화면 표기 시각과 서버 시각이 다르게 보이면 이 때문이며, 정상이다.

**JVM 옵션(메모리 등)은 env 파일의 `BE_JAVA_OPTS`로 바꾼다.**

| 변수 | 기본값 | 설명 |
|---|---|---|
| `BE_JAVA_OPTS` | `-XX:MaxRAMPercentage=75.0` | BE JVM에 넘길 옵션. 기본값은 힙을 컨테이너 메모리의 75%로 둔다(설정이 없으면 JVM 기본 25%라 대용량 조회에 부족하다) |

- **BE 전용 이름이다.** env 파일(`/home/.env`)을 AI 서버와 함께 쓰므로, JVM이 자동으로 읽는 `JAVA_TOOL_OPTIONS`를 쓰면 AI 컨테이너에도 같이 적용된다.
- `--env-file`에는 **따옴표 없이** 적는다(따옴표가 값에 그대로 들어간다). 예: `BE_JAVA_OPTS=-XX:MaxRAMPercentage=60.0 -XX:+ExitOnOutOfMemoryError`
- 빈 값(`BE_JAVA_OPTS=`)이면 추가 옵션 없이 JVM 기본값으로 실행된다.
- 컨테이너 메모리 제한(`docker run --memory`)이 없으면 퍼센트 설정은 **호스트 전체 메모리** 기준으로 계산된다. 한 서버에 BE와 AI를 함께 띄운다면 컨테이너마다 메모리 제한을 주거나 퍼센트를 낮춘다.
- `-Duser.timezone`은 `BE_JAVA_OPTS`로 바꿔도 적용되지 않는다(UTC 고정이 뒤에 붙는다).
- 자빅스 호출 상한(`zabbix.call.*`)은 JVM 옵션이 아니라 일반 설정이다 — 필요하면 `ZABBIX_CALL_MAX_RESPONSE_BYTES`처럼 환경 변수로 준다.

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

### 5-4. AI 서버와 MCP 연동 (선택)

AI 어시스턴트와 외부 AI 앱 연결(MCP)은 별도 프로세스 `moveseye-ai`(기본 포트 3100)가 제공한다. AI 서버가 없어도 제품의 나머지 기능은 동작한다. 상세 절차와 프록시 예시는 moveseye-ai `README.md`의 "설치형 배포" 절과 [MCP 연결 가이드 2부](../guides/solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md)를 따른다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3100` | AI 서버 포트 |
| `BE_BASE_URL` | `http://localhost:3000` | BE 주소 |
| `DB_HOST`·`DB_PORT`·`DB_NAME`·`DB_USER`·`DB_PASS` | — | BE와 같은 PostgreSQL |
| `REDIS_HOST`·`REDIS_PORT` | `localhost`·`6379` | BE와 같은 Redis |
| `INTERNAL_API_TOKEN` | 비움 | **BE와 같은 값**. 무작위 긴 값으로 생성하고 문서·로그에 남기지 않는다 |
| `AI_PUBLIC_URL`·`FE_PUBLIC_URL` | 비움 | 프록시가 `X-Forwarded-*`를 넘기지 않거나 FE가 다른 오리진일 때만 |
| `AI_MCP_ENABLED` | `false` | MCP 연동 켜기 |
| `AI_MCP_DYNAMIC_REGISTRATION` | `true` | 외부 앱의 동적 클라이언트 등록 허용 |
| `AI_MCP_ACCESS_TTL` / `AI_MCP_REFRESH_TTL_DAYS` | `3600` / `30` | 외부 앱 접속 토큰(초) / 연결 수명(일) |
| `AI_MCP_ALLOW_DESTRUCTIVE` / `AI_MCP_MAX_DESTRUCTIVE_TARGETS` | `false` / `1` | MCP의 삭제 등급 도구 허용·대상 수 상한(ZM-157, 배포 전) |
| `AI_DEV_TOOLS_ENDPOINT` | `false` | dev 프로필 전용 도구 직접 실행. 운영에서 켜지 않는다 |

LLM 접속 정보(API 키 등)는 환경변수가 아니라 관리자 화면(⚙ 설정 > AI 어시스턴트 설정)에서 입력한다.

MCP를 켤 때의 필수 조건:

1. 공개 주소가 **https**다. claude.ai·Claude Desktop을 지원하려면 인터넷에서 접근 가능해야 한다.
2. 리버스 프록시가 `/mcp`·`/oauth/`·`/.well-known/`·`/ai/`를 AI 서버로 보내고, `X-Forwarded-Proto`·`X-Forwarded-Host`를 넘긴다.
3. 🔴 FE 동의 화면 `/oauth/consent`는 FE로 보낸다(`/oauth/`보다 긴 규칙). 빠뜨리면 동의 화면이 열리지 않는다([MCP 연결 가이드 §11](../guides/solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md)).
4. 사내 승인을 받은 뒤 사용자 관리에서 필요한 사용자에게만 MCP 권한을 준다.

🔴 AI 서버 `V7`이 포함된 버전으로 올릴 때는 구버전 AI 서버를 모두 내린 뒤 교체한다([로컬·검증 Runbook §11](solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md)).

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

**(ZM-157, 배포 전)** 반복 마이그레이션이 초기 관리자 계정의 시드 이메일을 비운다. 이메일이 없으면 비밀번호 찾기를 쓸 수 없으므로, 최초 로그인 후 관리자 계정에 실제로 받을 수 있는 이메일을 등록한다([관리자 가이드 §3-11](../guides/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)).

### 7-2. 파괴적 동기화 차단 확인

`SYNC_ENABLED`가 `false`인지 확인한다. `true`이면 Zabbix에 없는 로컬 사용자가 삭제될 수 있다.

### 7-3. 문서 노출 차단

운영에서 `SPRINGDOC_ENABLED`가 꺼져 있는지 확인한다. `/api`와 `/v3/api-docs`가 응답하면 안 된다.

### 7-4. 제품 초기 설정

[관리자 가이드 §2](../guides/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)의 도입 순서를 따른다. 특히 **자산 최초 동기화**를 빠뜨리면 지리 맵이 빈 것처럼 보인다.

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

#### 데이터 아카이빙(V69)을 되돌릴 때

V69는 새 테이블 3개(`archive_file`·`archive_setting`·`apm_archive_hold`)와 기존 테이블 시드 2행(스케줄러 `apm_archive`, APM 알람 규칙 `ARCHIVE_HOLD`)을 더한다. V69 이전 버전으로 코드를 되돌리면 시드 2행이 "모르는 잡·알람 규칙"으로 남으므로 **시드부터 지우고 테이블을 역순으로** 지운다. 아카이브 원장이 사라지므로 먼저 `archive_file`을 백업하고, 디스크의 ZIP 파일은 지우지 않는다(감사 자료).

```sql
BEGIN;
DELETE FROM scheduler_run_log WHERE job_key = 'apm_archive';
DELETE FROM scheduler_lease   WHERE job_key = 'apm_archive';
DELETE FROM scheduler_setting WHERE job_key = 'apm_archive';
DELETE FROM apm_alert_rule    WHERE rule_uid = '00000000-0000-4000-8000-0000000000a4'::uuid;  -- 바인딩·이벤트는 CASCADE
DROP INDEX IF EXISTS uq_apm_archive_hold_open;
DROP TABLE IF EXISTS apm_archive_hold;
DROP TABLE IF EXISTS archive_setting;
DROP INDEX IF EXISTS uq_archive_file_running, uq_archive_file_source_expired, uq_archive_file_hold_expired,
                     uq_archive_file_ok, idx_archive_file_key, idx_archive_file_created;
DROP TABLE IF EXISTS archive_file;
DELETE FROM flyway_schema_history WHERE version = '69';
COMMIT;
```

- 알람 규칙을 지우기 전에, 아카이브를 켠 적이 있으면 알람 화면에서 `ARCHIVE_HOLD` 규칙을 먼저 삭제해 Zabbix 쪽 아이템·트리거를 정리하는 편이 깔끔하다.
- 같은 SQL이 `V69__archive_ledger_apm_cold_archive.sql` 머리 주석에도 있다.

## 9. 백업 대상

| 대상 | 내용 | 주기 권고 |
|---|---|---|
| **PostgreSQL** | 자산·비용·맵·사용자·권한·리포트·라이선스 등 제품 데이터 전체 | 일 1회 이상 |
| 환경변수·시크릿 | 접속 정보 | 변경 시 |
| 데이터 아카이브 디렉터리(`/data/moveseye-archive` 등) | 데이터 아카이빙이 만든 ZIP(보존 기간 지난 데이터의 유일한 사본). DB의 `archive_file`이 목록이다 | 일 1회 이상(새 파일만) |
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

- [관리자 가이드](../guides/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md) — 설치 후 제품 설정
- [로컬·검증 Runbook](solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md) — 기동·검증 절차
- [Production Runbook](solutions--%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98-%EB%9F%B0%EB%B6%81.md) — draft, 실행 금지
- [Credential 보호 정책](solutions--%EC%8B%9C%ED%81%AC%EB%A6%BF-%EB%B3%B4%ED%98%B8-%EC%A0%95%EC%B1%85.md) — draft
- [아키텍처](../technical/solutions--%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98.md)
- [문제 해결 가이드](../guides/solutions--%EB%AC%B8%EC%A0%9C-%ED%95%B4%EA%B2%B0.md)
- [MCP 연결 가이드](../guides/solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md) — AI 서버 MCP 켜기·프록시·권한

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-11 | 최초 작성. Dockerfile·환경변수 33종·Flyway V20·SPA 폴백 기준 |
| 2026-10-01 | §8 롤백에 V69(데이터 아카이빙) 되돌리기 SQL(코덱스 검수 R12) |
| 2026-10-01 | §4-4 `ARCHIVE_ALLOWED_ROOTS`, §5-1 docker run 예시에 데이터 아카이빙 볼륨(`-v`)·허용 루트와 설명 단락, §9 백업 대상에 아카이브 디렉터리 추가(ZM-156, 배포 전) |
| 2026-09-17 | §3 Flyway 추가 사항(R__·AI 이력 테이블), §5-4 AI 서버·MCP 연동 신설(환경변수·필수 조건·`/oauth/consent` 주의), §7-1 관리자 이메일 등록. 해당 절만 2026-09-17 소스로 확인(ZM-157 브랜치 포함, 배포 전) |
