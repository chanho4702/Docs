---
name: dev-runtime-startup
description: "moveseye 로컬 런타임 기동 실전 정보 — JDK17 지정, dev 프로필 5433 도커 DB, DB별 admin 비밀번호 상이, x-visitor-id 필수, .env 두 벌의 암호화 키 불일치 함정, 기동 스크립트 위치"
metadata: 
  node_type: memory
  type: reference
  originSessionId: e6f25a36-2040-4f52-8e9d-456cda98493f
  modified: 2026-08-12T07:41:57.052Z
---

2026-07-27 P1 런타임 검증 세션에서 실측한 기동 절차와 함정.

**BE 기동**
- `$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"` **매번 지정 필수** — 이 PC 전역 JAVA_HOME은 `corretto-1.8.0_472`라 Gradle이 "requires JVM 17"로 거부한다.
- `.env`(`C:\solutions\moveseye-be\.env`)를 현재 셸에 export 후 같은 세션에서 `.\gradlew.bat bootRun`. Vault는 안 쓴다(2026-08-06 결정) — 연동이 주석 처리돼 있어 `.env` export가 **유일한** 경로다([[vault-secrets-management]]).
- `SPRING_PROFILES_ACTIVE=dev` → 5433 도커 DB(`dmove-postgres-test`). 미지정 시 5432 실 dev DB.

**🔴 `.env`가 두 벌이고 암호화 키가 서로 다르다 (2026-08-20 실측)**
`C:\solutions\moveseye-be\.env`(구 Nest)와 `C:\solutions\moveseye-be-spring\.env` 46개 키 중
**`CREDENTIAL_ENCRYPTION_KEY`·`JWT_SECRET` 두 개만** 값이 다르다. 어느 쪽을 export하고 띄우느냐에 따라
DB에 저장된 자격증명(LLM API 키·Zabbix 비밀번호)이 `AEADBadTagException: Tag mismatch` → HTTP 500으로 깨진다.
**Spring이 쓰던 정본은 `moveseye-be-spring/.env`** 쪽이다. 기동 스크립트를 그쪽으로 맞춰 두었다:
`_workspace/_run_be_3000_dev.ps1`(BE :3000 dev) · `_workspace/_run_ai_3100_dev.ps1`(AI :3100 dev).
⚠️ AI 서버 기동 시 **`PORT`를 3100으로 덮어써야 한다** — BE `.env`에 `PORT=3000`이 들어 있어 그대로면 포트 충돌로 죽는다.

**DB별 차이 (혼동 주의)**
| | 5432 실 dev DB | 5433 도커 dev DB |
|---|---|---|
| admin 비밀번호 | `<dev-admin-pw>` (구 initDefaultAdmin 계정) | `<dev-db-pw>` (V10 시드) |
| Zabbix Setting | `10.220.0.109` — 호스트 **1대**, 전파 hostCount 전부 0 | `dmove.co.kr` — 호스트 **76대** |
- 5432의 admin은 V10 시드가 `WHERE NOT EXISTS`라 **건너뛴** 선재 계정(해시 `$2b$` vs 시드 `$2a$`). Flyway는 양쪽 다 V13까지 적용됨.
- 전파/렌즈 검증은 데이터가 필요하므로 **dev 프로필(5433)** 을 쓸 것 — 실 dev DB를 수정할 이유가 없다.

**API 직접 호출**
- 로그인 외 모든 EP에 **`x-visitor-id` 헤더 필수**(없으면 401 "Missing x-visitor-id header"). 임의 문자열 가능.
- 인증은 HttpOnly 쿠키(`curl -c/-b` 쿠키 jar 사용).

**FE 기동**
- `npm run dev`는 IPv6(`::1`)에만 바인딩 → `127.0.0.1:5173` 연결 실패. `npm run dev -- --host 0.0.0.0`으로 양쪽 바인딩.

**🔴 bootRun 중 gradlew test 금지 (2026-07-27 실측)**
- 서버가 떠 있는 동안 테스트를 돌리면 `build/classes`가 재컴파일돼 실행 중 JVM이 Lombok 생성 내부 클래스를 못 찾는다: `NoClassDefFoundError: ItemGetParams$ItemGetParamsBuilder`. **HTTP 500이 나서 코드 회귀로 오인하기 쉽다.**
- 순서: **테스트 먼저 → 그다음 기동**. 재기동 시 이전 프로세스 kill 안 하면 `Port 3000 was already in use`.

**전/후 응답 비교 절차**(REST 불변 검증 루틴)
- `git stash push -u` → 재기동 → before 채집 → `git stash pop` → 재기동 → after 채집 → `json.tool --sort-keys` diff.
- 실시간 값이라 diff에 늘 뜨는 필드: `cpuUsage`·`memoryUsage`·`diskUsage`·`lastCheck`·알람 총계. **같은 코드로 2~3회 반복 호출해 변동하면 회귀 아님**으로 판정.
- Redis 캐시 EP(`/home/summary`, TTL 60s)는 채집 전 `redis-cli DEL "HOME_SUMMARY:1"`.

**✅ 해소(2026-08-12 실측): Chrome MCP 탭에서 localhost 로드 정상**
- `http://localhost:5173` 직접 로드·조작·스크린샷 전부 동작(라이선스 판정 19 브라우저 검증을 이 경로로 완주). 과거 LAN IP 우회(CORS 허용 목록 문제 동반)는 더 이상 필요 없다.
- 과거(2026-07-27) 확장 제어 탭에서만 error page가 뜨던 증상은 원인 미규명인 채 사라짐 — 재발하면 그때 에러 코드부터 확보.
- 이 제약 때문에 미뤄졌던 [[propagation-lens-feature]]·[[zabbix-config-drilldown-restructure]]·[[trigger-management-feature]]·[[home-landing-page]]의 화면 렌더 검증이 이제 가능해졌다(여전히 미실시).

**🔴 BE 기동 스크립트 정본 = `C:\solutions\_tools
un_be_3000_dev.ps1` (2026-09-15)** — `moveseye-be-spring/.env`를 **`Get-Content -Encoding UTF8`**로 읽어 Process env에 싣고 `gradlew.bat bootRun -x test --no-daemon`. 두 함정 실측:
- 5.1 기본 ANSI(cp949)로 읽으면 한글로 끝나는 주석의 마지막 바이트가 뒤 LF를 삼켜 다음 줄(`JWT_SECRET=…`)이 주석에 합쳐진다 → `JWT_SECRET must be at least 32 bytes`로 기동 실패. 주석이 한 줄만 바뀌어도 터진다.
- 이미 떠 있는 Gradle 데몬을 재사용하면 이 셸의 env가 데몬으로 안 넘어갈 수 있다 → `--no-daemon`.
- 기존 프로세스 종료: java.exe 중 CommandLine에 `bootRun` 또는 `spring.profiles.active=dev`(worktrees 제외) 둘 다 kill. 기동 ~150초. 로그는 scratchpad `be3000.log`.

**2026-10-02 추가** — IDE(IntelliJ)가 띄운 BE는 `-javaagent:C:\ProgramData\moveseye\otel\opentelemetry-javaagent.jar` + 확장 jar를 달고 `build/classes` 클래스패스로 돈다. 스크립트로 같은 구성을 띄우려면 `_tools/run_be_3000_dev_apm.ps1`(OTEL 환경변수 포함)인데 `--no-daemon`이 빠져 있어 데몬 재사용 시 .env가 안 넘어갈 수 있다 → 래퍼로 덧붙여 썼다. 기동 ~40초(컴파일 별도). 아카이브 기능은 `ARCHIVE_ALLOWED_ROOTS` 없으면 켜지지 않으니 실측 때만 env로 준다.
