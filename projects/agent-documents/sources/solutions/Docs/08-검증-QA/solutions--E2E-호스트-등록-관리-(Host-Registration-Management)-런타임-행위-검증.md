# E2E — 호스트 등록 관리 (Host Registration Management) 런타임 행위 검증

- 검증자: functional-qa (실기동·실호출·화면 동작 — 정적 shape 아님)
- 일자: 2026-07-18
- 대상: BE `_worktrees/hostreg-be`(3eedbc6, :3002) · FE `_worktrees/hostreg-fe`(d9c4224, Vite :5174) · 격리 도커 Postgres(dmove-postgres-test, :5433, Flyway V1~V11)
- 기준 문서: `devdesign_host-registration.md`(§6-5), `contract_host-registration.md`
- 인증: HttpOnly 쿠키(accessToken Path=/, refreshToken Path=/auth), admin/<마스킹>(V10 시드, userRole=ADMIN)
- 실 Zabbix: dmove.co.kr(7.0.6), 테스트 호스트/그룹은 `dmove-qa-` prefix

## 종합 판정: PASS (9/10 시나리오 통과, S10은 환경 제약으로 미검증)

버그(동작 결함) 0건. 정적 QA HIGH-1(그룹 ID축) 수정이 런타임에서 재확인됨.

---

## 기동/환경

- BE: dev 프로필 YAML(`cors.allowed-origins: *` 미인용 YAML 오류 + 빈 MAIL_PORT)을 피하려 **dev 프로필 미활성 + env 오버라이드**로 우회 — `DB_PORT=5433`, `COOKIE_SECURE=false`, `CORS_ALLOWED_ORIGINS`(5173~5177,3000), `SPRINGDOC_ENABLED=true`, `PORT=3002`, `JWT_SECRET`은 32바이트 미만인 워크트리 값 대신 main `.env`의 강한 값 주입(미달 시 부팅 실패). `Started MoveseyeApplication`, Flyway 12 migrations validated, HikariPool→5433 확인.
- FE: `.env.local`의 `VITE_API_URL`을 `:3002`로 설정. Vite가 5173 점유로 **5174**로 auto-increment → 실 청취 포트 5174 사용. `/sign-in` 200.
- 미인증 `GET /hosts/manage` → **401**(유일하게 실제 상태코드). admin 쿠키 로그인 후 통과 확인.

---

## 시나리오별 판정

| # | 시나리오 | 판정 | 증거 |
|---|----------|------|------|
| 1 | admin 로그인 → 설정>호스트 등록 관리 진입(라우트 가드) | **PASS** | 로그인 성공 토스트, `/setting/host-management`(adminOnly) 렌더, Hosts/Host Groups 탭·기존 Zabbix server 행 표시 |
| 2 | 호스트 등록(즉석 그룹 1 + 기존 그룹 1 + Agent IF + 템플릿 1 + 서버 모니터링) | **PASS** | "Host 'dmove-qa-hostreg-01' has been registered". 실 Zabbix hostid=10683 생성, 즉석 그룹 `dmove-qa-grp-e2e`=Zabbix groupid 22 생성 |
| 3 | 등록 직후 livecheck 자동 호출 → ping/agent 표시 | **PASS** | 결과 스텝에 Connectivity Check(Ping=Dead, Agent=N/A) 자동 표시. livecheck 응답 `{ping.state:dead, agent.state:unavailable}`(폴링 후). 트러블슈팅 알림은 `agent.state==="unavailable"`일 때만 노출 — 생성 순간 agent=unknown(N/A)이라 미노출이 로직상 정상 |
| 4 | 목록 반영(그룹/IP:Port/템플릿 수/상태) | **PASS** | 목록에 dmove-qa-hostreg-01: Groups[dmove-qa-grp-e2e, Linux servers], 10.20.30.99:10050, Templates 1, Status enabled, Total 2 items |
| 5 | 자산 자동 생성(syncOne) | **PASS** | `GET /assets?keyword=dmove-qa` → asset id=77, source=zabbix, zabbixHostid=10683, groupNames=[dmove-qa-grp-e2e, Linux servers], coverage=monitored, linkedHostName=dmove-qa-hostreg-01 |
| 6 | 수정(표시명 변경 + 템플릿 제거 Unlink vs Unlink-and-clear 분기 + 인라인 경고) | **PASS** | 프리필 그룹이 **라벨로 표시**(HIGH-1 축 정합 재확인). 템플릿 제거 시 Unlink/Unlink-and-clear 라디오 노출, clear 선택 시 경고 "…permanently deleted from the host: Linux by Zabbix agent". 저장 후 host.get: name=`dmove-qa-hostreg-01-renamed`, host=`dmove-qa-hostreg-01`, templates=[](clear 반영) |
| 7 | 상태 변경(목록 스위치 비활성화) | **PASS** | 스위치 true→false, 토스트 "The host status has been changed", host.get status="1" |
| 8 | 삭제(confirmName 불일치→버튼 비활성, 정확 입력→삭제) | **PASS** | 모달 "Delete permanently" 초기 disabled, 오입력 "wrong-name"→disabled 유지, 정확 입력→enabled. 삭제 후 토스트 "The host has been deleted", 목록·Zabbix에서 소멸(total 0) |
| 9 | 감사 로그(host_change_log) | **PASS** | 격리 DB에 4행: CREATE/UPDATE/DISABLE/DELETE 전부 actor=admin, hostid=10683 |
| 10 | 권한 경계(비admin→403) | **미검증(환경 제약)** | 아래 상세 |

---

## S10 미검증 사유 (버그 아님 — 환경/아키텍처 제약)

- 격리 DB에 로그인 가능한 비admin 계정 없음(ZABBIX 계정 Admin/guest는 password NULL 온보딩 모델).
- MovesEye 전용 비admin 계정(userRole=USER, `createInZabbix:false`, `zabbix_userid=null`)을 생성해 로그인은 성공했으나, 보호 EP 호출 시 **AdminAccessChecker(403) 도달 전 JwtAuthFilter에서 401(INVALID_TOKEN)로 거부**됨.
  - 원인: `JwtAuthFilter.resolveAuthToken`(JwtAuthFilter.java:97-138)은 비-ADMIN 사용자에 대해 Redis에서 **Zabbix API 토큰**을 확보(`storeApiTokenToRedis`)한다. MovesEye 전용 계정은 Zabbix 연동이 없어 토큰 확보 실패 → 예외 → INVALID_TOKEN. ADMIN은 super admin 토큰을 바로 써(line 98) 통과.
  - 즉 이 환경에서 403 경로 런타임 확인에는 **Zabbix 연동 비admin 계정**이 필요(실 Zabbix 사용자 생성 필요, 범위 밖).
- 403 admin-guard 자체는 integration-qa 정적 검증(PASS)에서 `AdminAccessChecker.requireAdmin`(userRole 기준) + FE `code===403` 분기로 확인됨. 런타임 body 확인만 미수행.

---

## 재현 명령(요지)

- BE 기동: `SPRING_PROFILES_ACTIVE` 미설정 + env(`DB_PORT=5433`,`COOKIE_SECURE=false`,`CORS_ALLOWED_ORIGINS=...`,`PORT=3002`,강한 `JWT_SECRET`) → `gradlew bootRun`(JAVA_HOME=jdk-17)
- FE 기동: `.env.local` `VITE_API_URL=http://localhost:3002` → `npm run dev`(실포트 5174)
- 로그인: `POST /auth/login {username:"admin",password:"<마스킹>"}` + `x-visitor-id` → Set-Cookie accessToken/refreshToken
- 화면 조작은 모두 FE(:5174) 경유, 값 어서션은 브라우저 fetch(withCredentials)·격리 DB SQL·실 Zabbix JSON-RPC로 교차 확인.

## 관찰(비결함)

- 목록의 Agent 컬럼은 생성 직후 캐시값(agentAvailable="0"/N/A)을 잠시 유지 — Zabbix 폴링 후 "2"(unavailable)로 갱신됨(livecheck는 실시간 조회라 unavailable 즉시 반영). React Query 캐시 특성, 결함 아님.
- 격리 DB에서 내 계정(dmove-qa-nonadmin)이 id=115를 받고 113·114가 그 사이 소비됨 → **다른 세션이 5433 컨테이너를 동시 사용 중**으로 추정(user `chanho`(114) 존치).

## 정리 상태

- 실 Zabbix: `dmove-qa-` 호스트·그룹 잔여물 **0건**(host.get=[], hostgroup.get=[] 직접 확인). 즉석 그룹(groupid 22)은 `DELETE /users/host-groups {ids:[8]}`로 로컬+Zabbix 삭제.
- 격리 DB: 테스트 비admin 계정(id=115) 삭제. asset id=77(dmove-qa-hostreg-01)은 **설계상 삭제 시 자산 스냅샷 보존** 동작을 검증한 산출물이라 존치(격리 DB는 재검증 위해 보존).
- 서버: BE(:3002)·FE(:5174) 종료. 도커 컨테이너(5433)는 **동시 사용 세션 보호 위해 stop 보류**(원 지시는 stop이나 다른 세션 파손 위험).
