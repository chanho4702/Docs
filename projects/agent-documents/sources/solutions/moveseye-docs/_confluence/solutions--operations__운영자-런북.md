# MovesEye 로컬·검증 Runbook

| 항목 | 내용 |
|---|---|
| 대상 독자 | 개발 운영자, 시스템 관리자 |
| 문서 상태 | review |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-05 |
| 최종 검토 | 2026-08-05 |
| 검토 주기 | monthly |
| 정본 위치 | application.yml + build scripts + FE package.json |
| 적용 범위 | local and verification only |

# MovesEye 로컬·검증 Runbook

## 1. 목적과 원칙

로컬·검증 환경에서 서비스를 기동하고, 장애가 났을 때 원인 구간을 좁히는 기본 절차다. **production 배포·백업·복구에는 사용할 수 없다.** **Production Runbook**은 owner와 실제 절차가 미확정된 실행 불가 `draft`다.

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
- **Credential 보호 정책**이 `current`로 승격되기 전에는 production credential을 등록하거나 log로 출력하지 않는다.

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

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 현재 Spring/FE 설정 기준 최초 작성 |
