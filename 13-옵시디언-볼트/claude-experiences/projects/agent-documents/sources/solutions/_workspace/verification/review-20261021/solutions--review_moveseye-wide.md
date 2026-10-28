# MovesEye 전반 검수 — 2026-10-21

기준: Spring BE `a9080eb`, FE `258d747`, AI `6eef23c`의 현재 작업 트리. 앞선 ZM-155 커스텀 메트릭 지적은 별도 보고서이며 아래 8건에 중복 산입하지 않았다.

검수 모드 `SOLO-CLAUDE` 유지. 구현·설정·DB·서버 기동 변경 없음. BE/FE의 기존 `CLAUDE.md` 변경 및 AI의 기존 설정·문서 변경을 보존했다. 검수 산출물과 경험 노트만 작성했다.

## 전체 판단

우선순위는 새 기능보다 **공통 요청의 완료 보장, 외부 시스템 자격 증명의 소유권, 집계 정확성, 실패 응답의 일관된 처리**다. GPU·라이선스·아카이브 경로에는 기존 검수로 마련한 방어가 상당히 있으나 공통 기반과 오래된 인증 경로에 다른 기능까지 영향을 주는 문제가 남아 있다.

범위는 주요 영역을 횡단한 코드 검수다. 모든 파일·모든 API·실환경의 완전 검증을 뜻하지 않는다. 아래 표에서 실제로 본 범위와 제한을 구분한다.

| 영역 | 확인한 경계 | 결과·제한 |
|---|---|---|
| 공통 FE 요청 | axios 중복 취소·refresh·signal·query envelope·세션 epoch | R1 재현, refresh timeout 개선 필요 |
| 로그인·권한 | SecurityConfig, JWT 필터/파싱, OTP, 권한 checker, 토큰 재발급 | R2·R5·R7. 실제 인증 서버에 요청하지 않음 |
| 인프라·Zabbix | 토큰 어댑터, 호스트 관리 서비스/훅, 이벤트 controller의 edit/view 판정 | R2. 모든 RPC·관리 API 전수 검증은 아님 |
| 홈·대시보드 | 사용자별 위젯 조회·수정·삭제 키 | userId/dashboardKey 소유권 검사 확인 |
| GPU | snapshotId 바인딩, 권한별 캐시, stale fallback, RAW/TREND·gap·상한 | 확인 구간에서 새 확정 결함 없음. 실제 GPU 데이터 미조회 |
| 클라우드 | 설정 저장, 비용 페이지 수집→upsert→조회, 자산 동기화 실패 리전 처리 | R3·R4. AWS 호출 없음 |
| 자산·비용 | CloudAssetSyncService, 감가상각 계산기 핵심 경로 | 실패 리전 missing 처리 방어 확인. 비용 기능 전체 수식 검증은 아님 |
| 맵 | NetworkArchitecture/GeoCluster controller와 감사 필드 경로 | 인증 사용자 공동 편집은 명시적 설계. 임의로 권한 결함 판정하지 않음 |
| 리포트·아카이브 | 관리 controller, 다운로드·검증·삭제·감사 행위자 | R6. 파일 삭제/다운로드 실실행 없음 |
| APM | 알람 평가·이벤트 전이·외부 push, export 헤더 | 긴 DB 트랜잭션 개선 필요. export 응답 자체의 expose 헤더 확인 |
| 스케줄러 | lease 획득/반납·실행·종료·라이선스 차단 | 30분 TTL 초과 시 중첩 가능, 개선사항으로 분리 |
| 라이선스 | 메트릭 포트 데코레이터·실행단 게이트 | 읽은 메서드의 guard 확인. 모든 포트 우회 경로 전수 검사 아님 |
| AI | AuthPreflight·ChatController 진입부·PendingActionGate 소유자/CAS | BE 인증 재사용·승인 소유자 검증 확인. LLM·MCP 전체 검증 아님 |
| 빌드·배포 | FE GitLab CI, BE Dockerfile | R8. 실제 CI 실행·이미지 빌드 없음 |

## 문제점

### R1 · 높음 · 중복 요청의 첫 호출이 영구 대기한다 — GET뿐 아니라 POST도 해당

- 위치: `moveseyee_fe/src/services/axiosInstance.ts:136`, `:138`, `:201`.
- 요청 키가 method+URL+params뿐이다. 같은 키의 이전 요청을 취소하고 오류 처리에서 `new Promise(() => {})`를 반환한다. 두 번째 요청의 결과를 첫 번째 Promise에 연결하는 코드가 없다.
- 조건: 서로 다른 queryKey/화면 소비자가 같은 URL을 동시에 조회하거나, 동일 생성 API로 서로 다른 본문을 연속 전송한다.
- 영향: 첫 query/mutation은 성공도 실패도 하지 않는다. 뒤 요청 성공 후에도 spinner·버튼 pending 상태가 풀리지 않을 수 있다. 쓰기는 요청 취소가 서버 작업 롤백을 보장하지 않아 처리 결과도 모호해진다.
- **실제 모듈 재현**: 네트워크 adapter만 대체. GET 및 본문 A/B가 다른 POST 모두 `firstAborted=true`, 두 번째 `fulfilled`, 첫 번째는 뒤 응답 이후에도 `pending`. 코드상 이 Promise에는 resolve/reject 경로가 없다.
- 권고: 중복 GET을 공유하려면 같은 Promise를 반환한다. 취소라면 명시적으로 reject하여 호출자가 회복하게 한다. 쓰기는 URL 기반 자동 취소에서 제외하고 작업별 동시성·멱등 정책을 둔다.

### R2 · 높음 · 로그인·갱신이 외부 연동용 Zabbix API 토큰까지 삭제한다

- 위치: `auth/AuthService.java:128`, `:177`, `:336`; `engine-zabbix/.../ZabbixTokenServiceImpl.java:52`.
- Zabbix 연결 사용자의 login/refresh는 `buildPayload → storeApiTokenToRedis → deleteAllTokensByUserId`를 호출한다.
- 삭제 구현은 `userids`로 해당 사용자의 모든 tokenid를 조회하고 전부 `TOKEN_DELETE`한다. DMOVE가 만든 토큰인지, Redis에 저장한 기존 tokenid인지 필터가 없다.
- 조건: 같은 Zabbix 사용자가 MovesEye 외 자동화·스크립트용 토큰을 갖고 있다.
- 영향: MovesEye 로그인/세션 갱신 때문에 다른 연동 자격 증명이 폐기된다. 동시 재발급은 서로 방금 만든 토큰까지 지울 수 있다.
- 확인: 코드 경로. 파괴적인 실제 token.delete는 실행하지 않았다.
- 권고: MovesEye 소유의 단일 토큰만 추적·교체하고, 유효 토큰은 재사용한다. login·refresh·필터 복구 모두 동일한 직렬화 경로를 사용해야 한다. 외부 토큰 보존 테스트가 필요하다.

### R3 · 높음 · 같은 날짜가 여러 비용 페이지에 나오면 일별 TOTAL이 마지막 페이지 값으로 덮인다

- 위치: `aws/client/AwsReadOnlyGateway.java:333`; `aws/CloudCostSyncService.java:67`, `:81`; `aws/repository/CloudCostDailyRepository.java`의 upsert.
- gateway는 각 페이지의 `resultsByTime`을 리스트에 이어 붙인다. sync는 각 ResultByTime마다 total을 0으로 초기화해 그 날짜 TOTAL을 upsert한다. 충돌 처리는 덧셈이 아니라 `amount=EXCLUDED.amount`다.
- 재현 조건: 동일 날짜의 첫 페이지 서비스 A 비용 10, 다음 페이지 서비스 B 비용 20. 서비스 행은 A=10/B=20인데 TOTAL은 30이 아닌 20이 된다.
- 추가: 페이지 상한에 걸린 부분 결과도 저장하고, 조회 `CloudCostQueryService`는 `collection.state=ok`를 반환한다. 불완전 합계가 정상값처럼 보일 수 있다.
- 확인: 코드/SQL 경로 추적. AWS 실제 페이지 응답 재현은 하지 않았다. 기존 단위 테스트는 1페이지·1날짜 사례만 확인한다.
- 권고: 모든 페이지를 날짜×서비스로 병합한 뒤 날짜 TOTAL을 한 번만 산출한다. truncated 상태를 저장·노출하고 완전 결과와 구분한다. 동일 날짜 2페이지 및 잘린 페이지 테스트를 추가한다.

### R4 · 중간 · 클라우드 설정 저장이 실패해도 성공 메시지가 나온다

- 위치: `services/setting.api.ts:84`; `pages/setting/CloudInfraInfo.tsx:162`, `:193`.
- 서버 `GlobalExceptionHandler`는 ApiError를 HTTP 200+실패 envelope으로 반환한다. `updateCloudInfraInformation`은 envelope 검사 없이 resolve한다. 화면은 await 뒤 캐시 무효화·시크릿 입력 삭제·성공 메시지를 수행한다.
- **실제 서비스 함수 재현**: `{status:'error',code:400,errorCode:'SETTING_PASSWORD_REQUIRED'}`를 반환하도록 adapter를 설정하니 Promise가 fulfilled였다.
- 영향: 권한 회수·서버 검증 실패·라이선스 거부 등을 성공으로 오인할 수 있다. 시크릿 입력까지 비워져 다시 입력해야 할 수 있다.
- 권고: 인접한 Zabbix/LLM 설정처럼 공통 `isFailureEnvelope` 검사 후 reject한다. 화면의 성공 메시지/입력 초기화가 실패 시 실행되지 않는 테스트가 필요하다.

### R5 · 중간 · Zabbix 토큰 락은 첫 실패 뒤 재획득해도 사용·반납하지 않는다

- 위치: `auth/security/JwtAuthFilter.java:142–158`; `common/redis/RedisClientService.java:197`.
- 첫 획득 실패 후 `isLocked=true`가 된다. 다음 반복에서 acquireLock이 성공해도 `lockValue != null && !isLocked`가 false여서 재발급·finally release를 모두 건너뛴다.
- 조건: 다른 요청이 락을 잡았다가 재발급에 실패하고 반납한 뒤, 대기 요청이 락을 새로 획득한다.
- 영향: 대기 요청이 복구할 기회를 버리고 락을 TTL까지 잡아 둔다. 반복 지연 뒤 인증 실패로 끝날 수 있다.
- 확인: 제어 흐름 추적. Redis 경합 실측 없음.
- 권고: 이번 반복의 lockValue 소유 여부만 기준으로 처리하고, 획득한 락은 모든 경로에서 반납한다. acquire 결과 `[null, 성공]`과 캐시 미복구 조건을 테스트한다.

### R6 · 중간 · 아카이브 삭제 감사 기록에 실제 행위자가 남지 않는다

- 위치: `archive/ArchiveFileService.java:240`, `:336`, `:345`; `auth/security/JwtTokenProvider.java:126` 부근.
- 표준 JWT 생성/파싱은 username을 채우지 않는다. archive의 actorOf는 `user.getUsername()`만 읽고 null이면 `?`를 반환한다. 이 값이 감사 로그와 `ledger.markDeleted`에 전달된다.
- 영향: 관리자 A/B가 삭제한 기록이 모두 `?`가 되어 사후 추적이 어렵다.
- 확인: principal 생성→controller→감사 경로. 실제 삭제는 하지 않았다.
- 권고: 이미 존재하는 `ActorResolver`를 재사용하고 userId도 감사 기록에 남긴다. username 없는 정상 JWT principal로 테스트한다.

### R7 · 중간 · 서로 다른 사용자에게 같은 OTP 코드가 발급되면 정상 코드도 거절될 수 있다

- 위치: `user/OtpService.java:34`; `auth/AuthService.java:284`.
- OTP 조회가 code/type/status/expiry만으로 `findFirst`한다. 사용자 소유권은 조회 뒤에 검사한다.
- 조건: 유효기간이 겹치는 같은 6자리 코드가 사용자 A/B에게 발급된다. B 요청에서 A의 행을 먼저 찾으면 소유권 검사로 거절하고 B 행을 다시 찾지 않는다.
- 영향: 올바른 이메일 코드·토큰을 보냈는데도 검증/재설정 실패. 소유권 대조가 있으므로 이것을 계정 탈취로 분류하지 않는다.
- 확인: 쿼리와 소유권 검사 순서. 실제 메일·OTP 발급 없음.
- 권고: username으로 사용자부터 확정하고 `userId+code+type+status+expiry`로 조회한다. 사용자 두 명의 동일 코드 fixture로 검증한다.

### R8 · 중간 · FE 배포가 CI가 검증한 커밋과 다른 코드를 빌드할 수 있다

- 위치: `moveseyee_fe/.gitlab-ci.yml:11–16`.
- Runner checkout 대신 고정 서버 디렉터리로 이동하여 `git pull` 후 `git checkout $CI_COMMIT_BRANCH`를 실행한다. `CI_COMMIT_SHA`를 사용하지 않는다.
- 조건: 현재 checkout이 dev인데 qa 파이프라인이 실행되면 dev를 pull한 뒤 오래된 로컬 qa를 checkout할 수 있다. 같은 브랜치여도 파이프라인 생성 뒤 추가 커밋이 push되면 그 코드를 배포할 수 있다.
- 영향: 성공한 파이프라인/커밋과 실제 배포 산출물이 불일치한다. 고정 디렉터리에는 작업별 격리도 없다.
- 권고: Runner의 해당 SHA checkout으로 빌드하고 산출물을 배포한다. immutable artifact, 정확한 revision 표시, 배포 작업 직렬화가 필요하다. 현재 CI에는 test 실행도 없고 `yarn install`의 lockfile 고정 옵션도 없다.
- 확인: CI 정의. 실제 파이프라인 실행 여부/외부 배포 절차는 미확인.

## 설계·운영에서 아쉬운 점

1. **조회·쓰기의 실패 계약이 분산돼 있다.** query 훅은 envelope을 실패로 올리지만 mutation은 서비스·화면마다 다르다. 공통 unwrap을 명시적으로 적용하는 서비스 규약과 실패 contract 테스트를 우선한다. 전역 변경은 기존 errorCode 소비처를 조사한 뒤 단계적으로 한다.
2. **인증과 Zabbix 의존성이 강하다.** 사용자 JWT 인증 중 원격 토큰 확보를 수행한다. 일부 관리자 설정 실패는 완화됐지만 전체 구조는 남아 있다. MovesEye 네이티브 기능의 인증과 Zabbix 호출 시점의 자격 증명 확보를 분리하는 편이 장애 범위를 줄인다.
3. **refresh 요청의 대기 상한이 없다.** 기본 API에는 60초 timeout이 있지만 raw axios refresh에는 timeout이 없다. refresh가 끝나지 않으면 공유 refreshPromise를 기다리는 요청들이 함께 멈춘다. 위 R1과 별개의 복구 경로 개선이다.
4. **APM 알람 평가가 외부 HTTP와 긴 DB 트랜잭션을 묶는다.** 대상 수·외부 지연에 따라 락/커넥션 보유 시간이 늘어난다. DB 상태 기록과 외부 전송을 분리하고 재전송 가능한 outbox·멱등 키를 검토한다. 현재 구현의 의도된 한계이며 이번 실측 장애로 보고하지 않는다.
5. **스케줄러 lease의 정상 장기 실행 보호가 없다.** heartbeat 없는 30분 TTL이다. 실행이 TTL을 넘으면 다른 노드가 중첩 실행할 수 있다. 갱신과 fencing 또는 최대 실행시간 보장이 필요하다.
6. **좋은 방어가 전역 관행으로 이어지지 않는다.** ActorResolver가 있는데 아카이브는 별도 구현, 일부 설정은 unwrap이 있는데 클라우드는 누락이다. 주석·검수 이력보다 공통 경계와 정상/실패 행위 테스트가 재발 방지에 유효하다.

## 실행 검증

- `node _workspace/verification/review-20261021/reproduce-common-api.cjs`: 실제 axiosInstance/linkCallerSignal/setting.api 소스를 transpile하여 실행. 네트워크 및 UI 주변 의존성만 대체. GET·POST 영구 pending, cloud setting 실패 envelope resolve 확인. 서버 호출 없음.
- FE Jest: `axiosCallerSignal.test.ts`, `CloudInfraCollectionScope.test.tsx`, `zm157AuthSession.test.tsx` **3 suites / 42 tests 통과**(24.841초). 통과는 위 결함 부재를 뜻하지 않으며 현재 테스트의 경계 공백을 보여 준다.
- BE 전체 테스트·DB 통합 테스트·브라우저 E2E·멀티 노드 장애 주입·실제 CI 배포·실제 외부 연동 호출은 하지 않았다.

## 처리 순서

1. R2 외부 토큰 보존, R1 Promise 완료 보장 — 영향 범위가 가장 넓다.
2. R3 비용 합계, R4 실패 표시, 기존 2026-10-20 커스텀 메트릭 정확성 지적.
3. R5 인증 복구, R6 감사 추적, R7 OTP 충돌, R8 배포 revision 고정.
4. 경계 테스트 보강 후 인증 의존 분리·알람 트랜잭션·배치 lease 개선.

## 처리 현황

| 항목 | 상태 | 내용 | 검증 |
|---|---|---|---|
| R2 | ✅ 2026-10-23 | `deleteAllTokensByUserId` → `deleteMovesEyeTokens(admin, userid, replacedTokenid, keepTokenid)`. 이름이 `DMOVE:{userid}:`인 토큰 중 **바꾼 이전 토큰(Redis에 있던 tokenid)과 이미 만료된 것만** 지운다. 외부 토큰·동시 발급된 다른 세션의 유효 토큰·방금 만든 토큰은 남긴다. 순서를 "발급 → Redis 저장 → 정리"로 바꾸고 정리 실패는 로그만 남기고 로그인을 막지 않는다. | `ZabbixTokenServiceImplTest` 2건(외부·접두어 경계 `DMOVE:70:`·동시 발급 보존), `AuthServiceTest` 27건(순서·정리 실패 허용). auth·user·zabbix·zabbixadmin 패키지 + engine-zabbix 107 suites/917 tests 통과. 실제 Zabbix token.delete는 실행하지 않음 |
| R1 | ✅ 2026-10-23 | 중복 GET은 끊겨도 **대체 요청의 결과(성공·실패)를 그대로 받는다**(대체 요청이 또 밀리면 마지막 요청까지 이어짐). 쓰기(POST/PUT/PATCH/DELETE)는 자동 중복 취소 대상에서 제외. 대체 없는 고아 취소·호출부 취소는 reject. 키에 `returnHeaders` 구분 추가, 맵 정리는 자기 항목만. | `axiosCallerSignal.test.ts` 신규 4건(대체 결과 수신·실패 전파·3연쇄·쓰기 비취소), 위 재현 스크립트 GET `fulfilled`·POST 첫 요청 비취소. FE 전체 319 suites/4366 tests 통과, tsc·eslint 통과 |
| R3 | ✅ 2026-10-23 | 전 페이지를 날짜×서비스로 모은 뒤 날짜 TOTAL 1회 산출(같은 날짜·서비스 중복은 뒤 값). 페이지 상한에 잘리면 **마지막 날짜는 쓰지 않고**(서비스 일부만 왔을 수 있음) 이전 값을 둔다. 잘림 상태는 Redis `CLOUD_COST_SYNC_STATUS`(만료 없음)에 남기고, 조회는 `collection.state=partial`·`reason=COST_PAGES_TRUNCATED`·`incompleteFrom`. Redis가 비거나 못 읽으면 ok. FE 실청구액 카드가 경고 표시. 🔴 DB 마이그레이션 없음(V90은 DB 모니터링 몫) | BE `CloudCostSyncServiceTest`(2페이지 동일 날짜 TOTAL=30·잘린 실행), `CloudCostQueryServiceTest`(partial·상태 읽기 실패 시 ok), aws 패키지 25 suites/144 tests. FE `CloudBillingCardTruncated.test.tsx` 3건 |
| R4 | ✅ 2026-10-23 | `updateCloudInfraInformation`이 실패 envelope이면 `ApiEnvelopeError`로 reject → 화면 catch가 실패 안내, 시크릿 입력 유지 | `settingCloudInfraApi.test.ts` 2건, 재현 스크립트 `cloudSetting.promise=rejected`. FE 전체 321 suites/4371 tests, tsc·contract typecheck·eslint 통과 |
| R5 | ✅ 2026-10-25 | `isLocked` 플래그 제거 — **이번 반복에서 잡은 락**이면 갱신하고 finally에서 반드시 반납. 락을 잡은 뒤 Redis를 다시 보고, 기다리는 사이 다른 요청이 이미 갱신했으면 재발급하지 않음(재발급은 R2로 이전 토큰을 지우므로 남이 방금 받은 토큰을 무효화하게 된다) | `JwtAuthFilterTokenLockTest` 3건(첫 실패 뒤 획득 시 갱신·반납 / 이미 갱신된 토큰 재사용 / 갱신 실패에도 반납). 수정 전 코드로는 3건 중 2건 실패 확인. Redis 실경합은 미실측 |
| R6 | ✅ 2026-10-25 | `actorOf`가 `ActorResolver`로 id→username을 찾고, 못 찾으면 `user#id`, 미인증만 `?`. 원장 `deleted_by`·설정 `updated_by`는 표시명, 감사 로그는 `이름(id=N)`. 일괄 삭제는 행위자를 한 번만 해석 | `ArchiveFileServiceTest` 신규 2건(username 없는 principal → 원장에 `alice` / 사용자 없음 → `user#9`). archive·apm.archive 패키지(ApmColdArchiveIT 포함) 113 tests 통과. 실제 파일 삭제는 테스트용 임시 파일만 |
| R7 | ✅ 2026-10-25 | 사용자를 먼저 확정하고 `userId+code+type+status+expiry`로 조회(`findFirstByUserIdAndCode…`). 없는 사용자도 `OTP_NOT_EXIST_OR_EXPIRE`(예전엔 남의 코드가 맞으면 `OTP_WRONG`이라 username 존재가 드러날 수 있었다). 소유자 검사는 방어로 유지. FE는 두 코드를 같은 처리 | `OtpSharedCodeIT`(실DB: 두 사용자에게 같은 코드 → 나중 사용자가 자기 코드로 통과, 남의 행 유지), `AuthServiceTest` 27건. auth·user·archive·config·common 62 suites/456 tests 통과 |
| R8 | ✅ 2026-10-26 | 미사용 `.gitlab-ci.yml` 삭제(FE `a5a6ff6`). Bitbucket 배포 개선(배포 전 테스트·원자 교체·동시 실행 방지)은 사용자 결정으로 보류 — 필요성 낮음, 사고 나면 복사 실패 대비부터 | — |

**런타임 확인(2026-10-26, BE 재기동 후 dev 5433)** — R5: Zabbix 연동 계정 토큰을 Redis에서 지우고 동시 요청 8건 → 전부 200, 새 토큰 저장, 락 키 남지 않음. R7: 없는 사용자·있는 사용자 틀린 코드 모두 `OTP_NOT_EXIST_OR_EXPIRE`로 같은 응답, 이메일 있는 계정에 코드를 넣으면 통과(OTP 토큰 발급·해당 OTP만 VERIFIED). 이메일 없는 계정은 조회 뒤 `USER_NOT_HAS_EMAIL`(기존 가드). R3(AWS 실청구)은 유료 API라 실호출 확인 안 함. 시험 중 바꾼 값(임시 비밀번호·OTP 행·시도 횟수 키)은 원복.

BE 전체 테스트 OOM(2026-10-25 해소, `04d03af`): 원인은 ArchUnit 구조 테스트 4개가 운영 클래스 그래프를 각자 static으로 붙든 것(+ Spring 테스트 컨텍스트 캐시 32개). `support/ProductionClasses`로 한 벌 공유 + `spring.test.context.cache.maxSize=4`. 그 뒤 드러난 순서 의존: `ApmStuckRequestLedgerIT`의 풀 포화 시험이 남긴 4초짜리 작업 때문에 다음 `ApmAlertDeletePathIT`가 drain 거절로 5건 실패(master에서도 재현) → `FakeZabbixIT`가 시작 전 워커 풀이 빌 때까지 대기. 최종 전체 실행: app 523 suites/5407 tests 중 1 실패(`ApmStuckRequestLedgerIT.latencyMatrixWithFiveSecondZabbix` — 전체 실행에서만 a의 마지막 값이 0, 단독은 통과; 기존 타이밍 의심), engine-zabbix 43/359 통과.

참고(기존 문제, 이번 수정과 무관): BE 전체 테스트를 IT 포함으로 돌리면 master(`7c86e5d`)에서도 210개 클래스 부근에서 테스트 JVM `OutOfMemoryError`로 중단된다(힙 2g로도 동일). `premium.apm.alert.evaluate` 패키지를 묶어 돌릴 때 `ApmStuckRequestLedgerIT.latencyMatrixWithFiveSecondZabbix`가 1회 실패했으나 단독 실행은 master·수정본 모두 14/14 통과(타이밍 의존 의심).
