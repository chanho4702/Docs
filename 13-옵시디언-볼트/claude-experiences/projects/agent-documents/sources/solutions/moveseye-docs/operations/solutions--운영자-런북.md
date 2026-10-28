---
title: MovesEye 로컬·검증 Runbook
doc_type: runbook
audience: [개발 운영자, 시스템 관리자]
status: review
owner: MovesEye 팀
baseline: 2026-08-05
source_of_truth: application.yml + build scripts + FE package.json
reviewed_at: 2026-08-05
review_cycle: monthly
deployment_scope: local and verification only
---

# MovesEye 로컬·검증 Runbook

## 1. 목적과 원칙

로컬·검증 환경에서 서비스를 기동하고, 장애가 났을 때 원인 구간을 좁히는 기본 절차다. **production 배포·백업·복구에는 사용할 수 없다.** [Production Runbook](solutions--%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98-%EB%9F%B0%EB%B6%81.md)은 owner와 실제 절차가 미확정된 실행 불가 `draft`다.

- 비밀값을 command history, 문서, screenshot, log에 남기지 않는다.
- shared dev DB를 대상으로 destructive sync나 migration 실험을 하지 않는다.
- HTTP 200만으로 성공을 판정하지 않고 response envelope와 실제 반영을 확인한다.
- BE 기동 전 port·DB·Redis·Zabbix 연결 대상을 명시적으로 확인한다.

## 2. 서비스 의존성

```text
Browser
  └─ FE Vite (:5173, 사용 중이면 5174/5175로 증가)
       └─ Spring app (:3000)
            ├─ PostgreSQL
            ├─ Redis
            ├─ Zabbix JSON-RPC
            ├─ AWS API (해당 메뉴)
            └─ SMTP (메일 기능)
```

## 3. 백엔드 사전 점검

- JDK 17과 `JAVA_HOME`
- PostgreSQL 접속 정보와 schema 대상
- Redis host/port
- 충분히 긴 `JWT_SECRET`
- Zabbix API URL과 관리 계정
- FE origin이 `CORS_ALLOWED_ORIGINS`에 포함됨
- local HTTP라면 cookie `Secure` 설정이 local 정책과 일치함

`.env` 파일은 Spring이 자동으로 읽지 않는다. 환경변수는 승인된 secret 주입 방식으로 현재 process에 제공한다. 저장소의 예제 값이나 공유 문서에서 credential을 복사하지 않는다.

## 4. 백엔드 빌드·검증·기동

`C:\solutions\moveseye-be-spring`에서 실행한다.

```powershell
.\gradlew.bat test
.\gradlew.bat build
.\gradlew.bat bootRun
```

`test`와 `build`는 exit code 0이어야 다음 단계로 간다. 실패하면 기동하지 않고 첫 실패 test 또는 compile error를 해결한다. `bootRun`은 `Started` log와 port 3000 bind를 확인하고, application startup 실패나 Flyway error가 있으면 FE를 기동하지 않는다.

dev profile을 사용할 때는 대상 DB와 Zabbix가 sandbox인지 확인한 뒤 `SPRING_PROFILES_ACTIVE=dev`를 환경변수로 주입한다.

```powershell
$env:SPRING_PROFILES_ACTIVE = 'dev'
.\gradlew.bat bootRun
```

명령이 두 번 제시된 것은 일반 기동과 dev profile 기동 중 하나를 선택하라는 뜻이다. 두 process를 동시에 띄우지 않는다.

기동 확인:

- dev Swagger UI: `http://localhost:3000/api`
- dev OpenAPI JSON: `http://localhost:3000/v3/api-docs`
- 운영 기본값은 Springdoc disabled다.

dev profile에서는 `/v3/api-docs`가 HTTP 200이고 JSON 최상위에 `openapi`와 `paths`가 있어야 한다. 404면 dev profile·Springdoc 설정을 먼저 확인하고 smoke test를 중단한다.

## 5. 프론트엔드 빌드·기동

`C:\solutions\moveseyee_fe`에서 실행한다.

```powershell
npm ci
npm run build
npm run lint
npm test
npm run dev
```

`npm ci`, build, lint, Jest는 모두 exit code 0이어야 한다. 하나라도 실패하면 `npm run dev`로 넘어가지 않는다. 마지막 `npm run dev`는 blocking process이므로 검증 명령 뒤에 실행한다. 로컬 연결은 FE `.env`의 `VITE_API_URL=http://localhost:3000`을 기준으로 하되, 실제 환경 설정과 repository package-manager 정책을 우선한다. Vite는 기본 port가 사용 중이면 다음 port로 증가할 수 있으므로, 실제 terminal 출력과 BE CORS allowlist를 함께 확인한다. 종료할 때는 각 foreground process에서 `Ctrl+C`를 사용하고 port가 해제됐는지 확인한다.

## 6. 시작 순서

1. PostgreSQL과 Redis가 준비됐는지 확인한다.
2. Zabbix API endpoint가 대상 환경과 일치하는지 확인한다.
3. Spring app을 기동하고 Flyway 결과를 확인한다.
4. dev OpenAPI 또는 인증 endpoint로 BE를 확인한다.
5. FE를 기동하고 실제 port를 확인한다.
6. 로그인 → 홈 → Host Group → Host detail → Problem 순으로 smoke test한다.

이 smoke test는 유효 계정, 최소 1개 Host Group과 Host, 확인할 수 있는 metric이 있다는 전제다. 빈 sandbox라면 먼저 승인된 test Host를 등록하고, active Problem이 없을 때는 Problem 빈 상태가 오류 없이 표시되는지를 기대 결과로 삼는다.

## 7. 장애 구간 좁히기

| 증상 | 확인 | 조치·중단 조건 | escalation |
|---|---|---|---|
| BE가 시작되지 않음 | JDK 17 → env placeholder → DB → Flyway → Redis → port 3000 | 첫 startup error에서 중단하고 target DB/환경변수를 교정한다. Flyway 오류를 우회 기동하지 않는다. | BE owner |
| FE에서 network error | `VITE_API_URL` → BE port → CORS origin → TLS/cookie | 실제 Vite port와 allowlist를 맞춘다. CORS를 wildcard로 낮추지 않는다. | FE owner, CORS면 BE owner |
| 401 반복 | access expiry → refresh cookie 저장/전송 → Redis session → 서버 시간 | refresh response와 cookie 속성을 기록하고 반복 retry를 중단한다. local session만 폐기한 뒤 재로그인한다. | Auth owner |
| body는 error인데 HTTP 200 | `ApiResult.status/code/errorCode/message` | 성공 처리하지 말고 `errorCode` 기준으로 원인을 분류한다. 실제 반영 전 다음 작업을 중단한다. | 해당 domain owner |
| Zabbix 전체 조회 실패 | Setting URL → 전용 계정 → JSON-RPC error → Redis auth cache | write 작업을 중단하고 endpoint·account를 검증한다. 해결 목적으로 권한을 임의 확대하지 않는다. | Zabbix owner + BE owner |
| 특정 host/metric만 실패 | Host 권한 → Item key → value type → History/Trend 기간 | 같은 Host의 원천 Item을 비교한다. 데이터 없음과 0을 구분하고 임의 fallback을 넣지 않는다. | Monitoring owner |
| migration 실패 | 적용 DB → `flyway_schema_history` → checksum → quoted identifier | 기동을 중단한다. 적용 migration을 수정하지 말고 전용 DB에서 forward-fix를 검증한다. | DB owner + BE owner |
| scheduler가 멈춤 | enabled/cron → thread pool → run log → 이전 실행 heartbeat | 중복 수동 실행을 금지한다. 필요하면 해당 job을 비활성화하고 마지막 run evidence를 보존한다. | Scheduler owner |
| bulk upload가 끝나지 않음 | current job → status/heartbeat → expiry → active unique constraint | 새 upload를 제출하지 않는다. stale 판정과 cleanup은 승인된 절차로만 수행한다. | Cost owner + DB owner |

## 8. 데이터 보호

- `SYNC_ENABLED`의 기본값이 false인 이유는 Zabbix에 없는 로컬 사용자를 제거할 수 있는 파괴적 동기화이기 때문이다.
- 수동 sync도 대상 Zabbix와 DB snapshot을 확인한 뒤 실행한다.
- Flyway를 끄거나 baseline을 바꾸기 전에 실제 적용 이력을 백업한다.
- 자산 삭제는 원천과 `excluded` semantics를 확인하고, 물리 삭제를 우회 경로로 사용하지 않는다.
- Zabbix update의 tags·template link처럼 배열 전체 교체가 가능한 필드는 현재값을 보존해 보낸다.
- [Credential 보호 정책](solutions--%EC%8B%9C%ED%81%AC%EB%A6%BF-%EB%B3%B4%ED%98%B8-%EC%A0%95%EC%B1%85.md)이 `current`로 승격되기 전에는 production credential을 등록하거나 log로 출력하지 않는다.

## 9. 배포 전 최소 검증

- [ ] BE unit/integration test와 build 통과
- [ ] FE Jest, lint, build 통과
- [ ] 빈 DB 또는 전용 검증 DB에서 Flyway V1→latest 통과
- [ ] 로그인·refresh·logout smoke test
- [ ] 권한이 다른 2개 계정으로 Host Group 범위 검증
- [ ] 실제 Zabbix 기반 Host/metric/Problem 조회
- [ ] 변경 기능의 `_workspace/contract_*.md`와 runtime 응답 일치
- [ ] 로그·artifact에 secret/개인정보가 없음
- [ ] `releases/릴리스-노트.md`와 영향 문서 갱신

## 10. 복구와 보고

장애 보고에는 시간, 환경, 영향 사용자, 실패 구간, correlation 가능한 request 정보, 최근 변경, 우회책을 포함한다. credential과 원본 개인정보는 제거한다. schema 또는 데이터 변경을 되돌릴 때는 코드 rollback과 DB forward-fix 순서를 별도로 검토한다.

## 11. ZM-157 권한·세션 변경 배포 주의

> 상태: 세 레포 `ZM-157` 브랜치 커밋(BE `a2709d6`, FE `06e1c8f`, AI `1e8d2c1`). 미병합·미배포·런타임 미검증이다. 설계는 [권한 강제와 세션 회수](../features/solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md), 결정은 [ADR-0002](../decisions/solutions--ADR-0002-%EC%97%AD%ED%95%A0-%EA%B6%8C%ED%95%9C-BE-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%EC%84%B8%EB%8C%80.md)를 본다.

### 11.1 병합 순서

| 항목 | 조치 | 상태 |
|---|---|---|
| BE 기준 커밋 | `200c936` 이후 master가 진행됐다. 병합 전에 리베이스하고 BE 단위 테스트를 다시 돌린다 | 계획 |
| ZM-159(Zabbix 호출 공통 유틸화) | `ZabbixClient`·`HostService`·`EventService` 충돌이 예상된다. 어느 쪽을 먼저 병합하든 뒤의 브랜치에서 미연동 계정 거부(`ZabbixClient`), 그룹 추이 캐시 키의 사용자 구분(`HostService`), 이벤트 가시성(`EventService.visibleEventIds`)이 살아 있는지 확인한다 | 계획 |
| ZM-151(Flyway V60) | ZM-157은 버전 번호 없는 반복 마이그레이션(R__)이라 병합 순서와 무관하다 | 현재 |
| FE | 기준 `3b096c4`. master `2e1ae38` 병합 시 기존 jest 실패 `apmRoutes` 2건이 해소된다 | 계획 |

### 11.2 배포 전 체크리스트

- [ ] **전원 1회 재로그인 공지** — 배포 직후 기존 로그인은 access 토큰 만료(기본 30분) 뒤 refresh가 401이 되어 로그인 화면으로 간다. 롤백해도 새 형식 토큰으로는 다시 한 번 재로그인이 필요할 수 있다(확인 안 됨).
- [ ] **권한 변경 공지** — 기본 역할 일반 사용자의 호스트 상세 차트 편집 불가, 지리 맵 좌표 편집 관리자 전용, 역할에서 끈 기능의 API·AI 차단.
- [ ] **관리자 이메일** — 기본 `admin` 계정 이메일이 초기 시드값 그대로인 설치본은 기동 시 이메일이 비워진다. 관리자에게 실제 주소 등록을 안내한다.
- [ ] **AI 서버 V7** — 구버전 AI 서버 프로세스를 **모두 내린 뒤** 새 버전을 기동한다. 롤링·블루그린 병행 금지. 롤백 SQL과 절차는 moveseye-ai `README.md`의 "DB 마이그레이션 배포 주의 — V7" 절이다(코드만 되돌리면 요약 저장이 실패한다). 이 절은 아직 `ZM-157` 브랜치(`C:\worktrees\zm-157-ai\README.md`)에만 있다.
- [ ] **Redis 구성 확인** — 세션 처리 Lua가 여러 키를 한 번에 다룬다. 단일 Redis(비클러스터) 전제이며 Redis Cluster는 검증하지 않았다.
- [ ] **런타임 스모크** — 역할이 다른 두 계정으로 로그인·refresh·로그아웃, 비밀번호 변경 후 다른 브라우저 로그아웃, 일반 계정의 차트 편집 버튼 부재, MCP 권한 회수 즉시 반영을 확인한다. 현재 미수행이다.

### 11.3 Flyway 동작

| 마이그레이션 | 동작 | 상태 |
|---|---|---|
| BE `R__clear_seed_admin_public_mailbox.sql` | 모든 버전 마이그레이션 뒤에 실행된다. `username = 'admin'`이고 이메일이 초기 시드값 그대로인 행만 이메일 NULL·미인증으로 바꾸고, 같은 문장에서 그 행의 미사용 OTP(ACTIVE·VERIFIED)를 DEACTIVE로 바꾼다. 멱등이다. 파일 내용이 바뀌면 checksum 변경으로 다음 기동에 다시 실행된다 | 현재 |
| AI `V7__ai_insight_owner.sql` | `ai_insight` 유니크 키에 `owner_key`를 더하고 기존 공유 캐시 행을 지운다 | 현재 |

`flyway_schema_history`에서 R__는 `version`이 NULL인 행으로 남는다. 최신 버전 번호를 셀 때는 `version is not null`로 한정한다.

### 11.4 Redis 키

접두어 정본은 BE `common/constants/AppConfig`다. 값에 토큰이 들어가므로 키 목록을 조회할 때 값을 로그·문서에 남기지 않는다.

| 키 | 내용 | TTL |
|---|---|---|
| `REFRESH_TOKEN:<token>` | refresh 토큰 데이터. `generation`·`family` 필드 추가 | refresh 수명(기본 8시간) |
| `REFRESH_GEN:<userId>` | 사용자 세대(정수) | **없음** |
| `REFRESH_FAMILY_REVOKED:<family>` | 로그아웃한 계열 표식 | refresh 수명 |
| `REFRESH_CONSUMED:<token>` | 회전으로 소비된 토큰의 계열 | 600초 |
| `REFRESH_SESSION_FAMILY:<userId>` | 현재 로그인 세션을 세운 계열 | refresh 수명. 세션 삭제 시 함께 삭제 |
| `USER_LOGIN_KEY_<userId>` | 로그인 세션(기존 키). 발급·회전 시 Lua가 함께 쓴다 | refresh 수명 |

🔴 `REFRESH_GEN:*`을 지우거나 초기화하지 않는다. 세대가 0으로 돌아가면 그 사용자의 현재 토큰이 전부 불일치가 되어 로그아웃된다. 특정 사용자를 강제 로그아웃하려면 Redis를 직접 만지지 말고 관리자 화면에서 비밀번호 초기화나 비활성화를 한다.

### 11.5 증상별 확인

| 증상 | 확인 | 조치 |
|---|---|---|
| 배포 후 전원 로그인 화면으로 이동 | 배포 시각과 access 토큰 만료 시각 | 정상. 공지 여부 확인 |
| 로그인이 `FAILED_TO_ACQUIRE_LOCK` | 같은 사용자의 비밀번호 변경·사용자 수정이 진행 중인지, 그 경로의 Zabbix 호출 지연 | 사용자 재시도 안내. 잠금 대기 상한은 5초(`UserService.LOGIN_LOCK_TIMEOUT_MS`) |
| 특정 사용자만 계속 401 | `REFRESH_GEN:<userId>`가 최근 바뀌었는지(비밀번호 변경·비활성화 이력) | 재로그인 안내 |
| 이벤트 통계가 권한 거부 | Zabbix 연결 상태, 태그 필터 감지 실패 로그 | Zabbix 복구 후 재조회. 감지 실패 중에는 사용자 토큰 재검증 호출이 늘어난다 |
| 미연동 일반 계정이 Zabbix 화면에서 거부 | 계정의 Zabbix 연결 여부 | 정상. 필요하면 Zabbix 사용자와 연결한다 |
| MCP 클라이언트가 재인증 요구 | 계정 상태·사용자 유형·MCP 권한 변경 이력 | 정상. 사용자에게 재연결 안내 |

### 11.6 AI 서버 MCP 설정

| 환경변수 | 설정 키 | 기본값 | 의미 |
|---|---|---|---|
| `AI_MCP_ALLOW_DESTRUCTIVE` | `ai.mcp.allow-destructive` | `false` | 삭제 등급 툴(`zabbix_delete_host`·`zabbix_delete_items`·`zabbix_delete_triggers`·`exclude_asset`, `clear=true`인 `zabbix_unlink_templates`)을 MCP에 노출·허용 |
| `AI_MCP_MAX_DESTRUCTIVE_TARGETS` | `ai.mcp.max-destructive-targets` | `1` | 허용 시 호출 한 번의 대상 수 상한 |
| `AI_DEV_TOOLS_ENDPOINT` | dev 프로필 `tools-endpoint-enabled` | `false` | 모델 없이 툴을 직접 실행하는 dev 엔드포인트. 확인 게이트를 우회하므로 운영에서 켜지 않는다 |

`AI_MCP_ALLOW_DESTRUCTIVE=true`는 MCP 클라이언트 쪽 확인에만 의존하게 된다. 켜기 전에 변경 승인을 받는다.

MCP 연동 켜기(`AI_MCP_ENABLED`), 동적 클라이언트 등록, 토큰 수명, 리버스 프록시 경로, 사용자별 권한 부여, 점검 항목은 [MCP 연결 가이드 2부(관리자편)](../guides/solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md)가 정본이다. 🔴 README의 nginx 예시만 쓰면 FE 동의 화면(`/oauth/consent`)이 AI 서버로 가므로, 가이드 §11의 추가 규칙을 함께 넣는다.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 현재 Spring/FE 설정 기준 최초 작성 |
| 2026-09-17 | §11 신설 — ZM-157 병합 순서, 배포 전 체크리스트(재로그인 공지·AI V7 정지 후 교체·Redis 구성), R__·V7 동작, Redis 키, 증상별 확인, MCP 설정. 소스 기준·미배포 |
| 2026-09-17 | §11.6에서 MCP 연결 가이드 관리자편으로 연결, `/oauth/consent` 프록시 주의 추가 |
