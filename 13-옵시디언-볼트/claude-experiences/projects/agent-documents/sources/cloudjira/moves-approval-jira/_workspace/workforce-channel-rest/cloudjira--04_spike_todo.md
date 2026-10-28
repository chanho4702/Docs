# 플랫폼 실측 목록 — workforce-channel-rest

> 설계서 `01_architect_design.md` §10 과 같은 목록. 스파이크 앱 `C:\CloudJira\spikes\app-channel\{callee,caller}` 를 확장해 측정한다(제품 앱은 건드리지 않는다).
> P0 = 설계를 바꿀 수 있는 것(이행 P2 전에 필수), P1 = 상한·문구 조정.

| # | 우선 | 항목 | 설계 의존 | 확인 방법 | 실패하면 |
|---|---|---|---|---|---|
| S1 | P0 | production 환경 webtrigger URL 도메인 | egress 선언, `peerUrl` 정규식 | 스파이크 앱 production 배포 → `webTrigger.getUrl` 값 | 도메인에 맞춰 egress·정규식 수정(설계 변경 없음) |
| S2 | P0 | webtrigger 핸들러 안 `api.asUser(accountId)` offline impersonation | R2 재확인(write.judge·issue.control ROWS·cert BADGE) | callee manifest `read:jira-work: {allowImpersonation: true}` → 핸들러에서 `asUser(id).requestJira(POST /rest/api/3/permissions/check)` — 권한 있는 계정·없는 계정·비활성 계정 | R2 를 asApp `user/viewissue/search`(이슈당 1)로 후퇴, `issue.control` 묶음 상한 100→20 |
| S2b | P0 | 권한 없는 **활성** 계정에 asApp `user/permission/search`·`user/viewissue/search` 가 `[]` 를 주는가 | R2 거부 판정·오류 코드(`ACTOR_NO_ACCESS` vs `ACTOR_PERMISSION_UNVERIFIED`) | 개발 사이트에 프로젝트 권한 없는 활성 계정 생성 후 호출 | 설계는 "정확히 `[actor]` 일 때만 허용"이라 판정은 fail-close 유지, 코드 매핑만 조정 |
| S2c | P1 | `user/permission/search` 의 `permissions` 콤마 목록 = "모두 가진 사용자"? | write.judge 호출 수(1 vs 3) | 권한 일부만 가진 계정으로 조회 | 권한마다 1회(최대 3회) 유지 |
| S3 | P0 | webtrigger context 의 `license`(유료 설치) | 수신 10단계 | staging 유료 설치에서 context 출력 | 마지막 resolver 호출이 본 license 상태를 KVS 에 두고 채널이 읽기 |
| S4 | P0 | `forge eligibility` 실격 사유 | D4 범위 | 두 앱 브랜치 빌드에서 실행 | 다른 사유가 있으면 보고 |
| S7 | P0 | major 업그레이드·`install --upgrade`·재설치 후 URL 유지 | 페어링 유지 | 스파이크 재설치·업그레이드 후 옛 URL 호출 | 재설치 시 자동 `REVOKED` 표시 + 재연결 안내 |
| S13 | P0 | 고객이 major 동의 전 구판에 머무는 구간 | 혼합 버전(§12) | staging 설치를 구판으로 두고 상대 앱만 신판 | 결정상 이중 운행 없음(Q1) — 배너·안내 문구와 "연결 필요" 동작만 조정 |
| S6 | P1 | 호출 한도·동시성·응답 5MB·fetch 지연 P95(콜드) | timeout 8초, 묶음 상한 | caller 에서 동시 20·연속 100, 1MB/4MB 응답 | 묶음 상한·timeout 조정 |
| S8 | P1 | `GET /rest/api/3/user?accountId` asApp — 비활성·비소속 계정 응답 | R1 | 개발 사이트 비활성 계정 | R1 을 impersonation `/myself` 로 대체 |
| S11 | P1 | `getUrl(key, true)` 뒤 옛 URL 생존, `deleteUrl` 직후 404 | rekey 순서 | 스파이크 | rekey 를 "새 URL 확인 → 옛 URL 삭제" 2단계 유지(이미 설계) |
| S12 | P1 | webtrigger 함수에서 `kvs.getSecret` | peerUrl 저장 | 스파이크 | 일반 `kvs.get` 저장(URL 은 서명 없이는 무력) |
| S10 | 후속(Q4) | apiRoute 핸들러 `asUser()` = 토큰 주인? | 외부 API 권한 재사용 | callee route 에서 `/rest/api/3/myself` asUser | `asUserOffline(principal.accountId)` |
| S5 | 선택 | HMAC webtrigger(`--readSecretKey`) | 플랫폼 인증 한 겹 추가 가능성 | 스파이크 | 무시(서명으로 충분) |
| S9 | 선택 | Forge KVS TTL | 영속 nonce 필요해질 때 | 문서·스파이크 | 지금 설계는 영속 nonce 없음 |

정리 할 일(기존 GUIDE §5): OAuth 앱 `spike-app-channel-3lo` client secret 재발급·삭제, 스파이크 앱 제거, `.token.json` 삭제 — 측정이 끝난 뒤.

## 실측 결과 (2026-10-19, 리더, 스파이크 callee `spike-p0` webtrigger, tom-chkim-dev development)

| # | 결과 | 설계 영향 |
|---|---|---|
| S2 | **부분 실패.** webtrigger 안 `api.asUser(accountId)` 는 **그 사용자가 이 앱에 동의(consent)한 적이 있을 때만** 동작. 동의한 사용자: `/issue/{key}` 200(1.2s)·`/mypermissions` 200(0.9s)·`POST /permissions/check`(본인, accountId 없이) 200(0.6s). **동의 안 한 활성 사용자: 401 `MISSING_USER_CONSENT`**, 비활성: 401 `MISSING_OR_INELIGIBLE_USER`, 없는 계정: 401 `MISSING_OR_INELIGIBLE_USER`. `/myself` 는 동의 사용자도 `NEEDS_AUTHENTICATION_ERR`(read:me 류 scope 부재 추정). `asApp` + `POST /permissions/check`(accountId 지정) 은 **403** "Only Jira administrators and Connect apps" | R2 를 impersonation 에 의존하면 안 된다(워크포스만 쓰는 사용자는 승인 앱 동의가 없을 수 있음) |
| S2 후퇴안 | `asApp` `GET /rest/api/3/user/viewissue/search?issueKey=&accountId=` 와 `GET /rest/api/3/user/permission/search?permissions=WORK_ON_ISSUES&issueKey=&accountId=` 모두 200(0.4~0.6s). 권한 있으면 `[그 계정]`, 비활성은 `[]`. **동의 여부와 무관.** 권한 없는 활성 계정 → `[]` 인지는 미측정(해당 계정 없음) | R2 기본 = asApp permission/search(이슈당 1회). impersonation 은 "동의 있으면 묶음 확인" 최적화로만 |
| S7 | major 업그레이드(scope 변경) + `install --upgrade` 후 옛 webtrigger URL **200 유지**. 재설치(uninstall→install)는 미측정 | 페어링 유지 |
| S8 | `asApp` `/user?accountId` 200(0.6s), `active` 필드 제공(비활성 false) | R1 그대로 |
| S11 | `getUrl(key, true)` → 새 URL, **옛 URL 계속 200**. `deleteUrl(old)` 직후 옛 URL **404**, 새 URL 200 | rekey 2단계 설계 맞음 |
| S12 | webtrigger 함수에서 `kvs.setSecret`/`getSecret` 동작 | peerUrl·키를 secret 으로 저장 가능 |
| 기타 | webtrigger 함수에는 `timeoutSeconds` 지정 불가(lint 오류: consumer·scheduledTrigger 만) | 긴 작업은 큐로 넘기는 설계 유지 |

## 백엔드 구현 뒤 추가 미검증 (2026-10-19, backend-engineer — 승인 앱 구현 기준)

| # | 우선 | 항목 | 구현이 기대는 것 | 확인 방법 | 실패하면 |
|---|---|---|---|---|---|
| S14 | **P0** | dynamic webtrigger **응답의 사용자 헤더** `x-moves-link-sig` 가 호출자 `fetch` 에 그대로 오는가 | ChannelServer 가 `headers: {'x-moves-link-sig': [sig]}` 로 응답, ChannelClient 가 `res.headers.get('x-moves-link-sig')` 로 읽어 검증. 요청 쪽 사용자 헤더는 실측 W1·W2 로 통과했지만 응답 쪽은 스파이크가 Content-Type 만 돌려줬다 | 스파이크 callee `wt` 가 `headers: {'x-test': ['1']}` 를 돌려주게 하고 caller `kick` 에서 `res.headers.get('x-test')` 출력 | 서명을 본문으로 옮긴다 — 응답 본문을 `{"sig":"…","body":"<원문 문자열>"}` 로 감싸는 판(envelope v2). 공유 파일 변경이라 두 리포 동시 |
| S15 | P0 | egress 와일드카드 `*.hello.atlassian-dev.net` 가 배포·설치에서 허용되는가 | manifest `permissions.external.fetch.backend` — `forge lint` 는 통과(오류 0, major 승인 1) | `forge deploy -e development` 후 페어링·ping | 워크포스 호스트를 정확히 적는다(`https://f8962f17-….hello.atlassian-dev.net`) |
| S16 | P1 | 채널 핸들러 안에서 다시 채널을 부르는 **중첩 호출** 지연 — write.judge 가 연결 캐시가 오래됐으면 워크포스에 link.resolve 를 묻는다(같은 actor) | 왕복 합계가 워크포스 쪽 호출 timeout(8초) 안. 캐시가 신선하면(1시간) 중첩 0 | 캐시를 비운 이슈로 워크포스에서 저장 → judge 지연 측정 | judge 에서 `refresh` 를 끄고 캐시만 쓰게(없으면 DEFER) |
| S17 | P1 | webtrigger 함수에서 `getAppContext()`(넘김 경로 `globalPagePathOf`) 가 값을 주는가 | `issue.control`·`write.judge` DEFER 의 `handoffPath` | sys.ping 응답에 임시로 실어 확인 | null 이면 워크포스가 링크 없이 안내만(설계상 허용) |
| S18 | P1 | `kvs.deleteSecret` 존재 + `webTrigger.deleteUrl` 뒤 `getUrl(key, true)` 로 새 URL | ChannelState.markRevoked, PairingService.unpair/selfUrl | 스파이크에서 해제 → 새 코드 발급 순서 | deleteSecret 없으면 setSecret(null), getUrl 이 옛 URL 을 주면 해제 때 URL 을 지우지 않는다 |
| S3 | P0 | (기존) webtrigger context 의 license | 구현은 `context.license` 가 있고 `isActive === false` 일 때만 402 — 없으면 통과(판정 불가 통과 규칙과 같다) | 기존 S3 방법 | 마지막 resolver 호출의 라이선스 판정을 KVS 에 두고 채널이 읽기 |
| S2b | P0 | (기존) 권한 없는 활성 계정의 permission/search 응답 | 구현: `[]` → `ACTOR_NO_ACCESS`(DENY), `[actor]` → 허용, 그 밖(다른 계정·여러 명·오류) → `ACTOR_PERMISSION_UNVERIFIED`(DEFER) | 기존 S2b 방법 | 코드 매핑만 조정 |
| S2c | P1 | (기존) 권한 콤마 목록 의미 | 구현: 권한마다 1회(write.judge 최대 3회 + bulkfetch 1) | 기존 S2c 방법 | 콤마 목록이 "모두 가짐"이면 1회로 줄인다(ActorVerifier.permitted 만 고침) |
| S14 | **통과** (리더 실측 2026-10-19) — dynamic webtrigger 응답의 사용자 헤더 `x-moves-link-sig` 가 caller fetch 와 curl 모두에 전달됨. 응답에 `x-ratelimit-limit/remaining/reset` 헤더도 있음(S6 참고) | 봉투 변경 불필요 |

## S20 — KVS transaction 조건부 set(연결 상태 gen, 코덱스 검수 #2)
- 확인할 것: ① `kvs.transact().set('current', v, {entityName:'channel-state', conditions: Filter.and('gen', equalTo(g))})` 가 gen 불일치 때 실패하는가, 그때 오류 `code` ② 레코드가 없을 때 `gen notExists` 조건이 통과하는가 ③ manifest `app.storage.entities` 추가가 `forge deploy` 에서 major 승인을 요구하는가.
- 방법: 개발 사이트에서 연결 코드 만들기 → 다른 탭에서 해제를 거의 동시에 → 상태 화면이 REVOKED 로 남는지. `forge logs` 의 `[CHANNEL][state]` 경고·오류 코드 확인. 실패 시 대안: 상태 레코드를 gen 별 키(`FAIL_IF_EXISTS`)로 쓰는 방식(보고서 참조).
| S20 | **통과** (리더 실측 2026-10-19, 스파이크 callee 엔티티 `spike-state`) — `kvs.transact().set(key,{gen,body},{entityName,conditions})`: 첫 저장 `gen notExists` 성공, 두 번째 notExists·같은 gen 재사용·틀린 gen 모두 실패. 실패는 `ForgeKvsError` **`code: 'CONDITIONAL_CHECK_FAILED'`**("conditional check specified or optimistic locking"). 같은 gen 동시 2건 → 정확히 1건만 성공. 지연 50~400ms. 엔티티 추가 배포는 approval 1건을 요구(`--approve MAJOR_VERSION_RULE`로 통과) | 조건 실패는 다시 읽지 말고 이 code 로 바로 경쟁 판정 가능 |
| S21 | **주의** (리더 실측) — 엔티티 `integer` 속성은 **32비트 부호 정수**: 2147483647 저장 OK, 2147483648 은 `UNPROCESSABLE_ENTITY`(gen+1 로 2^31 이 되는 CAS 도 같은 오류). epoch ms(약 1.79e12)는 integer 칸에 못 넣는다 | gen·rev 는 작은 증가 정수로만. 시각은 body(any) 안에 |

## apiRoute 실측 (2026-10-20, 워크포스 moves-rms `GET /v1/organization/users`, 보고서 `06_apiroute_verification_report.md`)
| # | 결과 | 영향 |
|---|---|---|
| R10 | **통과** — 토큰 없음·가짜 토큰 401, 3LO 토큰(sns 포함) 200, 사이트 gateway 형·`api.atlassian.com/svc` 형 동일. 콜드 8.8~10.8초, 이후 1.9~2.7초 | 외부 연동 타임아웃 15초 이상 |
| R11 | **통과** — `sns` 없이 동의하면 동의 화면에 custom scope 항목 없음, 호출 403 `Missing: [read:organization:custom]`. 재동의가 기존 sns 토큰을 무효화하지 않음 | 고객 가이드: generator 의 Marketplace App URL 사용 |
| R12 | 문서와 일치 — refresh 회전 후 옛 refresh 가 한 번 더 200(스파이크 R4 재현). 공식 "Reuse interval" 기본 10분·미사용 90일 만료(OAuth 2.0 (3LO) apps — Jira) | 회전 결과 원자적 저장, 10분 구간에 기대지 않음 |
| R13 | 관찰 — generator URL 에 `offline_access` 없음, `accessible-resources` 빈 목록, 사이트 감사 로그에 App REST API 켜기 기록 없음 | 가이드·cloudId 는 설정값 |
| R14 | **보류**(사용자 "나중에") — 권한 없는 사용자(김찬호 `chanho9611`, Member 세트) 거부 403. 같은 계정으로 S2b(권한 없는 활성 actor 의 `permission/search`)도 측정 가능 | 단위 테스트로만 확인 |
