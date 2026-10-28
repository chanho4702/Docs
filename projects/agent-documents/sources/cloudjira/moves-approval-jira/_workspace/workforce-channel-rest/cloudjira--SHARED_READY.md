# 공유 채널 파일 — 확정본 (승인 앱 원본)

> 원본: `C:\CloudJira\moves-approval-jira\src\integration\channel\` · 복사 대상: `C:\CloudJira\moves-workforce\src\integration\channel\`
> **디렉터리 전체를 바이트 그대로 복사**한다(`__test__` 포함). 줄바꿈 LF — 워크포스 `.gitattributes` 에 `src/integration/channel/** text eol=lf` 추가.
> 동일성은 `__test__/sharedHash.test.js` 가 강제한다(해시 + 옆 리포가 있으면 바이트 대조). 워크포스에서 고치지 말고, 바꿀 일이 있으면 승인 앱 담당에게 요청.

## 판 3 — 2026-10-19 (현재 — 이 표로 복사·대조)

검증 1차(03_verify_report F2·F7·F9). 봉투 형식·서명 규칙·시험 벡터는 그대로. 바뀐 파일: **ops.js · __test__/pairingOps.test.js · __test__/sharedHash.test.js**(rpcVectors.json 은 재생성했지만 바이트 동일).

| 파일 | sha256 |
|---|---|
| `base64url.js` | `8f5d5d6a05bc05a436640e73b64241994e347cf4e265da4e000c9df2ab4abb87` |
| `canonical.js` | `49461d79e171c3dc01c085f3db8905c1fbe6b902d1c78639b945a4bb95b87358` |
| `ed25519.js` | `cb1446f21631b77635b5f3384cf929e585f160e84cae2733e9b777142e3f99c3` |
| `envelope.js` | `447c71c6b537ae3adf0161b82fcc80ece5dd8adb29d3111f11896e79428884d0` |
| `keyring.js` | `3df89e952c691f98ab90274cbe3b97428bed3c0b0f689ecb93838028f49de77d` |
| `ops.js` | `9a59ab6c044105f0f5ff983fd14f9fcf8bbfce71e42854733dccf488c69ab8c2` ← 바뀜 |
| `pairingCode.js` | `4360316801ba3f0dcbf2bc249ec0a77d821d70de09628f2787327e81a6fa760c` |
| `peerUrl.js` | `d91fe6b6eaf5282a005849e2e139ff5976adeda5139b67dd544a7433b9d1a8cd` |
| `rpcVectors.json` | `3168e730d9f133518bc424c69f2ae9ed1e3c22bf2c66ae68cf624b08b82947e0` |
| `__test__/envelope.test.js` | `dc31e3513d92ab9cd90b0cc869fd701c242aadd43ea3f16eb89fb5a15276c046` |
| `__test__/pairingOps.test.js` | `9d30f3a0742cd60a6f6323fa526abe5eed923613b55a7f21f67f5c3e41e14b79` ← 바뀜 |
| `__test__/rpcVectors.gen.js` | `e44621a9f9c8b7f208a10b9b778709f99139efd76dec9689275588dc7407ebbe` |
| `__test__/sharedHash.test.js` | `3f5a033154fc12645fa3b2ab7db2bf96d83b4a9a8278e48c19df4c5285502678` ← 바뀜 |

### 판 3 변경 요약 (ops.js)

1. **`issue.control` 행 `link: 'UNVERIFIED'`**(선택) — 승인 앱이 그 이슈의 연결 여부를 확인하지 못했다(워크포스 응답 없음·통신 실패·캐시 없음). 이때 `linked` 는 늘 false 이지만 **"연결 아님"이 아니다** — 워크포스는 넘김/차단으로 다룬다(fail-close, F2). `linked:true` 와 함께 오면 검증기가 거부한다.
2. **`issue.control` 행 `basis: 'ISSUE' | 'PROJECT'`**(선택, linked 일 때) — 승인 앱이 본 연결 근거. PROJECT = 무필터 SPACE 구독 프로젝트라서 연결(앱 필드 백필 전 이슈도 연결이다 — 워크포스 `creationTarget` 이 이 값으로도 소속을 본다).
3. **SYSTEM 사유 `control-change`** — 워크포스가 받는 `change.notify` 에 추가. 승인 앱의 사람 없는 CONTROL·FLOWS 알림(기간 재개방 작업·통제 워커)이 이 사유로 온다(F9 — `period-autoclose` 오독 제거). 매핑: CERT→`cert-observe`, PERIOD→`period-autoclose`, CONTROL·FLOWS→`control-change`.
4. **`actorViolation` 의 범위 검사가 예외를 삼킨다**(F7) — SYSTEM `org.get`/`link.resolve` 에 필수 칸이 없으면 TypeError → INTERNAL(재시도)이 아니라 `MALFORMED`. 칸은 맞는데 범위가 넓으면 `ACTOR_NOT_ALLOWED`(그대로). `systemData` 검사도 같은 규칙. 서버 쪽은 `actorViolation` 이 `MALFORMED` 를 돌려주면 그 코드로 서명 응답하면 된다(승인 앱 ChannelServer 는 그대로 전달).
5. `CONTRACT_REVISION = 3`. 내부 `run` 을 함수 선언으로(호이스팅).

### 워크포스가 같이 맞출 것(승인 앱 쪽 판정과 대칭)
- 승인 앱이 받는 `pair.complete` 에서 대기 코드 불일치·만료는 이제 **서명 `PAIR_EXPIRED`**(F8) — 워크포스와 같은 코드.
- 서명 없는 `STALE_LINK`·`NOT_PAIRED` 로 상태를 바꾸지 않기(§15.2, 이미 공지).
- 해제 뒤 자기 URL 재발급(S18) — 승인 앱 규칙: 해제 때 `deleteUrl` 하면 `selfUrlDeleted` 표식, 다음 연결 코드에서 `getUrl(key, true)`(forceCreate). 워크포스도 같게(보고서 "검증 1차 수정" S18 대조).

## 판 2 — 2026-10-19 (대체됨)

설계 §15.1 ①~④ + `basis`. 봉투 형식(`PROTO = 1`)·서명 규칙은 그대로, **작업 계약만** 바뀌었다. 바뀐 파일 4개(ops.js·rpcVectors.json·pairingOps.test.js·rpcVectors.gen.js) + sharedHash.test.js.

| 파일 | sha256 |
|---|---|
| `base64url.js` | `8f5d5d6a05bc05a436640e73b64241994e347cf4e265da4e000c9df2ab4abb87` |
| `canonical.js` | `49461d79e171c3dc01c085f3db8905c1fbe6b902d1c78639b945a4bb95b87358` |
| `ed25519.js` | `cb1446f21631b77635b5f3384cf929e585f160e84cae2733e9b777142e3f99c3` |
| `envelope.js` | `447c71c6b537ae3adf0161b82fcc80ece5dd8adb29d3111f11896e79428884d0` |
| `keyring.js` | `3df89e952c691f98ab90274cbe3b97428bed3c0b0f689ecb93838028f49de77d` |
| `ops.js` | `46ae4396ab07d3687e1462b3bfc06407ba3c4689abc2955da0e34c7170dc2002` ← 바뀜 |
| `pairingCode.js` | `4360316801ba3f0dcbf2bc249ec0a77d821d70de09628f2787327e81a6fa760c` |
| `peerUrl.js` | `d91fe6b6eaf5282a005849e2e139ff5976adeda5139b67dd544a7433b9d1a8cd` |
| `rpcVectors.json` | `3168e730d9f133518bc424c69f2ae9ed1e3c22bf2c66ae68cf624b08b82947e0` ← 바뀜 |
| `__test__/envelope.test.js` | `dc31e3513d92ab9cd90b0cc869fd701c242aadd43ea3f16eb89fb5a15276c046` |
| `__test__/pairingOps.test.js` | `10bb0501427bde259309a5b41cf457e470eef5e6b7e1e9f43e627c5a3fbb3f9e` ← 바뀜 |
| `__test__/rpcVectors.gen.js` | `e44621a9f9c8b7f208a10b9b778709f99139efd76dec9689275588dc7407ebbe` ← 바뀜 |
| `__test__/sharedHash.test.js` | `69a3f74b4df1d10cc20238090729b535f1180808435c117ccd84041b27193a6f` ← 바뀜 |

### 판 2 변경 요약 (ops.js)

1. **`cert.query` SYSTEM `portfolio-batch`** — `SystemReason.PORTFOLIO_BATCH`. 새 칸 `systemData(data)`: SYSTEM 이면 `purpose === 'STATS'` 일 때만 통과(COST·BADGE + SYSTEM 은 `ACTOR_NOT_ALLOWED`). pairs ≤50 그대로. 시작자 accountId 를 알면 USER 로 보낼 것(§15.1 ①).
2. **`link-withdraw` → `link-change`**(`SystemReason.LINK_CHANGE`) — 연결 생성·해제 공통. 옛 이름은 이제 거부된다(별칭 없음).
3. **`issue.control` 응답**: 최상위 `globalPagePath: string|null`, 행 `timeZone: string|null`(IANA ≤64, 그 이슈의 승인 앱 기간 시간대), 행 `handoffPath` 는 null 이거나 **`globalPagePath` 로 시작**(승인 앱은 `${globalPagePath}${issueId}/new`). 워크포스는 그 뒤에 `/{date}/{HHmm-HHmm}` 를 붙이고, `write.judge` 요청의 `timeZone` 은 이 값을 쓴다.
4. **팀장 설정 `wa`**(선택) — `settingWaValid`: `{autoRequest: boolean, lockApproved: true, closeDays: 0..90 정수}`, 닫힌 키. `link.resolve`·`change.notify{SETTING}` 의 설정 본문에 실린다.
5. **`link.resolve` 행 `basis`**(선택) — `'ISSUE' | 'PROJECT'`(무필터 SPACE 구독 프로젝트). 없으면 ISSUE 로 읽는다.
6. `CONTRACT_REVISION = 2` 상수 추가(정보용).
7. 시험 벡터: 요청 4번(`cert.query` SYSTEM portfolio-batch STATS) 추가 — 1~3번·응답·연결 코드 벡터는 그대로.

## 판 1 — 2026-10-19 (대체됨)

| 파일 | sha256 |
|---|---|
| `base64url.js` | `8f5d5d6a05bc05a436640e73b64241994e347cf4e265da4e000c9df2ab4abb87` |
| `canonical.js` | `49461d79e171c3dc01c085f3db8905c1fbe6b902d1c78639b945a4bb95b87358` |
| `ed25519.js` | `cb1446f21631b77635b5f3384cf929e585f160e84cae2733e9b777142e3f99c3` |
| `envelope.js` | `447c71c6b537ae3adf0161b82fcc80ece5dd8adb29d3111f11896e79428884d0` |
| `keyring.js` | `3df89e952c691f98ab90274cbe3b97428bed3c0b0f689ecb93838028f49de77d` |
| `ops.js` | `347da390a8c10b5f18879c745cabdeb6c1bdc149a7bc7c6e99696c297a22bf3c` |
| `pairingCode.js` | `4360316801ba3f0dcbf2bc249ec0a77d821d70de09628f2787327e81a6fa760c` |
| `peerUrl.js` | `d91fe6b6eaf5282a005849e2e139ff5976adeda5139b67dd544a7433b9d1a8cd` |
| `rpcVectors.json` | `331a79b428d7d602903c6d4dfe4cdf528967d8e5cd73af78d31078fc3bb172fa` |
| `__test__/envelope.test.js` | `dc31e3513d92ab9cd90b0cc869fd701c242aadd43ea3f16eb89fb5a15276c046` |
| `__test__/pairingOps.test.js` | `2ae3166db90240fe31d02249fb494e69f28fea9ba00d3259dc6bf0f80a92aa92` |
| `__test__/rpcVectors.gen.js` | `5d1e6f47af2c1879f934b2972fb2f57450e267ccd1b08de5971a5b56e12dbdb1` |
| `__test__/sharedHash.test.js` | `ec0d4a320dbe99b6291f4719dcee958dac1123723ab530ad6a1fe2ab7c83e101` |

## 쓰는 법 요약 (워크포스 담당용)

- **보내기**: `buildRequest({linkId, op, from:'workforce', cloudId, kid, iat, nonce, actor, idem?, data, signer})` → `{body, sig, env}`. `POST peerUrl`, 헤더 `x-moves-link-sig: sig`, `Content-Type: application/json`, 본문 `body` 그대로, `redirect:'manual'`. 응답은 `verifyResponse({rawBody, sig: 응답헤더 x-moves-link-sig, sent: env, now, trusted: 승인 앱 신뢰 kid Set, impl: nodeEd25519})` → `{ok:true, result:{ok, data|error}}` 일 때만 쓴다. 서명 없는 응답은 `unsignedErrorCodeOf(body)` 로 힌트 코드만.
- **받기**: `verifyRequest({rawBody: event.body, sig: event.headers['x-moves-link-sig'][0], self:'workforce', now, cloudId, trusted, impl})` (수신 1~7단계, CPU 만). `OP_UNKNOWN` 은 `env` 를 같이 줘서 서명 응답이 가능하다. 이어서 nonce LRU → 페어링 상태 → 라이선스 → `actorViolation(self, op, actor, data)` → `validateRequestData(self, op, data)` 순. 응답은 `buildResponse({request: env, kid, iat, ok, data|error, signer})`, 실패 1~9단계는 `minimalErrorBody(code)` + `HTTP_OF[code]`.
- **연결 코드**: `buildPairingCode(payload, signer)` / `parsePairingCode(code, {self, now, cloudId, env, trusted, impl})`. `env` 는 자기 서명 kid 의 `envOfKid(자기계열, kid)`. pin 은 `sha256Hex(pin)` 만 저장.
- **URL**: 받은 상대 URL 은 `isPeerUrl(url, 'approval')` 통과분만 저장·호출.
- `actor` 는 `{type:'USER', accountId}` (resolver context `principal.accountId` 만) 또는 `{type:'SYSTEM', reason, subject?}` — 워크포스가 보낼 SYSTEM 사유는 `change.notify` 의 `link-change`·`team-batch`, `cert.query`(STATS) 의 `portfolio-batch`(판 2). 승인 앱이 보내는 것은 `cert-observe`·`period-autoclose`·`control-change`(판 3)·`auto-request-author`·`worklog-event-issue`.
- 목록 입력(accountIds·issueIds·pairs 등)은 **중복이 있으면 요청 스키마가 거부**한다 — 보내기 전에 중복 제거.
- 응답 `data` 형태는 `ops.js` 의 `OPS[받는앱][op].response` 가 검증한다. 워크포스가 내는 응답(org.get·org.teams·link.resolve·kb.get)도 이 형태를 통과해야 승인 앱이 쓴다 — `orgBodyValid`·`settingBodyValid`·`kbBodyValid` 를 응답 만들기 전 자체 점검에 쓰면 된다.

## 주의 — 미검증 전송 전제 (04_spike_todo.md S14, P0)

응답 서명을 **응답 헤더** `x-moves-link-sig` 로 싣는다(`ChannelServer` → `headers: {'x-moves-link-sig': [sig]}`, 호출자는 `res.headers.get(...)`).
요청 쪽 사용자 헤더는 실측 W1·W2 로 통과했지만, dynamic webtrigger 가 **응답** 사용자 헤더를 호출자까지 그대로 전하는지는 실측 전이다.
안 되면 봉투 판 2(응답 본문 `{"sig":"…","body":"<원문>"}`)로 바꾼다 — 공유 파일 변경이라 두 리포가 같은 날 바뀐다. 워크포스 쪽 서버도 같은 헤더 방식으로 구현해 두면 된다.

판 1 확인(2026-10-19): 워크포스 리포 13개 파일이 판 1 해시와 같았다. **S14 는 리더 실측 통과**(응답 사용자 헤더 전달됨) — 헤더 방식 유지.

## 변경 이력

| 판 | 날짜 | 바뀐 파일 | 이유 |
|---|---|---|---|
| 1 | 2026-10-19 | 전부(신규) | 최초 확정 |
| 2 | 2026-10-19 | ops.js·rpcVectors.json·pairingOps.test.js·rpcVectors.gen.js·sharedHash.test.js | 설계 §15.1 — portfolio-batch(STATS), link-change, issue.control globalPagePath·timeZone·handoffPath 규칙, 설정 wa, link.resolve basis |
| 3 | 2026-10-19 | ops.js·pairingOps.test.js·sharedHash.test.js | 검증 1차 F2(issue.control link:UNVERIFIED·basis)·F7(범위 검사 예외 → MALFORMED)·F9(SYSTEM control-change) |

## 재검증 1회차 메모 (2026-10-19) — 공유 파일 무변경, 판 3 그대로

해시 표는 바뀌지 않았다(복사할 것 없음). 두 앱 코드가 같은 규칙을 지키도록 맞출 운영 규칙만 적는다.

1. **`RATE_LIMITED` 는 재시도 불가** — 보내는 쪽 서버는 `retryable:false` 로 서명하고, 받는 쪽 클라이언트는 상대가 `true` 로 서명해도 곧바로 재시도하지 않는다. 공유 `RETRYABLE` 에는 원래 없다(판 3 그대로). 워크포스 할 일: `ChannelServer.js:164` `signedError(RATE_LIMITED, true)` → `false`, 클라이언트도 같은 무시 규칙.
2. **미확인 URL(`orphanUrls`) 상한 10 = 비강제 주소 바꾸기 거부** — 10개가 쌓였으면 새 URL 을 만들기 **전에** `PAIR_PEER_UNREACHABLE`(reason `ORPHAN_LIMIT`)로 거부. 강제·해제·성공은 언제나 허용되고 목록 전부를 지운다. 상태 저장은 목록을 **자르지 않는다**(`slice(-10)` 제거). 워크포스 할 일: `ChannelState.js:72,81` 의 `slice(-10)` 제거 + rotate 앞 상한 검사.
3. **해제는 URL 마다 따로** — 한 URL 삭제 실패가 다른 URL 결과를 버리지 않는다. `selfUrlDeleted` = 지금 URL 을 지웠거나 지금 URL 이 없음. 못 지운 URL 은 `orphanUrls` 로 남기고 다음 연결(`markPaired`/`savePaired`)이 이어받는다(워크포스는 이미 이 방식). 강제 REVOKED 때 `selfUrl` = 새 URL(워크포스 방식 채택).

## 상태 전이 규칙 (2026-10-19, 코덱스 검수 #2·#3) — 두 앱 공통, 공유 파일 무변경(판 3 그대로)

키 이름·gen 의미는 아래와 **글자 그대로** 같게 한다. 승인 앱 구현: `src/resolver/channel/ChannelState.js`.

| 대상 | 저장소·키 | 값 | 쓰는 규칙 |
|---|---|---|---|
| 연결 상태 | Forge **사용자 지정 엔티티 `channel-state`**, 키 `current` (manifest `app.storage.entities`: `gen: integer`, `body: any`) | `{gen, body}` — body = `{status, linkId, peerApp, pairedAt, pairedBy, peerActor, peerProto, peerOps, selfUrl, orphanUrls, selfUrlDeleted, revokedAt, revokedBy, revokedReason, pending}` | **모든 전이**(연결 코드 만들기·pair/complete 수신·코드 붙여넣기 완료·rotate·unpair·상대 해제·URL 기록·selfUrlDeleted 해제)는 `kvs.transact().set('current', {gen: g+1, body}, {entityName:'channel-state', conditions: new Filter().and('gen', FilterConditions.equalTo(g))}).execute()` — 읽은 gen 과 같을 때만, gen+1. 레코드가 없으면 조건 `gen notExists`, 저장 gen = 1 |
| 미사용 연결 코드 | 위 body 의 `pending` = `{linkId, pinHash, exp, createdBy, createdAt, selfUrl}` \| null (**별도 키 아님**) | — | 코드 만들기 = pending 설정 전이. PAIRED 전이(어느 경로든)와 **모든 해제**(로컬·상대·강제 rotate)는 같은 전이에서 `pending: null`. pair.complete 는 레코드를 읽고(gen) pending 을 검사한 뒤 **그 gen 으로** PAIRED 전이 — 실패하면 서명 `PAIR_EXPIRED` |
| 성공·실패 표시 | 일반 키 **`channel:outcome:{linkId}`** | `{lastOkAt, lastErrorCode, lastErrorAt, peerVersion, peerProto, peerOps}` | 호출이 실제로 쓴 연결의 linkId 키에만 쓴다. **연결 상태(엔티티)는 절대 쓰지 않는다.** 읽을 때는 현재 body.linkId 의 키만 — 다른 linkId 의 기록은 버린다(=무시) |
| 상대 URL | secret **`channel:peerUrl:{linkId}`** | URL 문자열 | linkId 별. 해제 때 그 linkId 의 secret 삭제. sys.rekey 는 env.linkId 의 키만 |

조건 실패 처리: transaction 오류 `code === 'CONDITIONAL_CHECK_FAILED'`(S20 실측 통과 2026-10-19 — 같은 gen 동시 2건 중 1건만 성공)면 곧바로 **경쟁**(`CHANNEL_STATE_CONFLICT`). 그 밖의 오류만 다시 읽어 gen 이 바뀌었으면 경쟁, 아니면 원래 오류. 경쟁 시 — 해제(로컬·상대)·URL 기록·selfUrlDeleted 해제는 다시 읽어 최대 3회(해제)·2회 재시도, 코드 만들기·코드 붙여넣기 완료는 재시도 없이 화면 오류(승인 앱 `PAIR_STATE_CHANGED`), pair.complete 수신은 `PAIR_EXPIRED`. 상대 해제(sys.unpair)·rotate 결과 기록은 **body.linkId 가 그 요청의 linkId 와 같을 때만** 전이(그새 새 연결이면 건드리지 않는다).

확인한 API(@forge/kvs 2.0.4 `out/interfaces/transaction.d.ts`): `transact().set(key, value, {entityName, conditions?: Filter})` · `check` · `delete` · `execute()`. **조건(conditions)은 엔티티에만** 걸린다 — 일반 키에는 조건부 set 이 없다(`kvs.set` 옵션은 `keyPolicy: 'FAIL_IF_EXISTS'|'OVERRIDE'` 뿐). 그래서 엔티티를 쓴다. S20 실측 통과(리더, 2026-10-19): 엔티티 조건부 transaction 동작, 조건 실패 code `CONDITIONAL_CHECK_FAILED`.
옛 키(`approval:channel:state`·`approval:channel:pending`·`approval:channel:peerUrl`)는 읽지 않는다 — 채널 판은 아직 배포 전이라 옮길 값이 없다(개발 사이트 스파이크 값은 재페어링).

## S20 실측 (리더)
조건부 transaction 은 실제 Forge 에서 동작. 조건 실패 = ForgeKvsError code CONDITIONAL_CHECK_FAILED. 두 앱 모두 이 code 로 경쟁을 판정하라(다시 읽기는 보조).

S21: entity integer 는 32비트(2^31 이상 UNPROCESSABLE_ENTITY). gen/rev 는 작은 증가 정수만, epoch ms 는 body 안에.
