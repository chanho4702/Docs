# 02 프론트 보고 — 워크포스(moves-workforce) · workforce-channel-rest

> 작성 2026-10-19 · frontend-engineer(워크포스 담당) · 1회차
> 대상 리포 `C:\CloudJira\moves-workforce`(작업 트리). 커밋·스테이징·배포·`forge` 명령 없음. 기존 미추적 파일(pptx·png·`custom-scopes.yaml`·`LeaderTeamBackfill.test.js` 등) 손대지 않음.
> 기준: 설계 §7.2·§8·§15, **실제 shape = `02_backend_workforce_report.md` §4.1·§4.2·'§15 반영'**(설계와 다르면 보고서를 따름).

## 결과 요약

| 항목 | 결과 |
|---|---|
| UI 테스트 `static/ui: npx jest --runInBand` | **170 suites / 2,733 tests 전부 통과** |
| UI 빌드 `CI=true npm run build` | 통과(경고는 기존 node_modules source map 3건뿐), `bundle:check` withinBudget true(gzip 496,295 / 950,000) |
| 백엔드 `src/domain/approvalLink` 시험 | 2 suites / 90 tests 통과(writeChannel 주석만 바뀜) |
| `npm run merge` | 실행 — `locales/ko-KR.json`·`en-US.json` 다시 생성 |
| 철거된 resolver 호출 | 프론트 `invoke('…')` 이름 전체를 `PermissionMap` 키와 대조 → 남은 미등록은 `getApprovalLinkDiagnostics`·`publishApprovalLinkSignals` 2개뿐이었고 둘 다 제거. 동적 이름(`invoke(name)`) 7곳은 모두 기존 등록 resolver |

## 1. 변경 파일

| 경로 | 내용 |
|---|---|
| `static/ui/src/backoffice/page/setting/ApprovalLinkCard.jsx` | **재작성.** 상태 배지(미연결/코드 대기 중/연결됨/연결 해제됨/연결 확인 필요) + 연결한 사람(이름 조회)·시각·승인 앱 버전, 스위치 ON·미연결 "연결 필요" 경고, 스위치 OFF 안내, 서명 키 없음 경고. [연결 코드 만들기](연결 중이면 "새 연결 코드 만들기") → 읽기 전용 코드 칸 + 복사 + 남은 분(15초 tick, 만료 시 코드 감추고 "새로 만들기"), 서버 `pendingExp` 만 있을 때(새로 고침 뒤) 남은 분 안내. [연결 코드 붙여넣기] textarea(공백·줄바꿈 제거) + [연결]. [연결 확인](ping — 지연·버전, 승인 앱 스위치 OFF 경고). 고급("연결 관리" details): [주소 바꾸기] → 상대 무응답(`PAIR_PEER_UNREACHABLE`)이면 강제 확인 모달 → `force:true`, [연결 해제] 확인 모달(peerNotified false 면 상대에서도 해제 안내), [옛 연동 데이터 정리](아래 §2). 상태 조회는 react-query, 동작 뒤 상태 키 무효화 |
| `…/setting/approvalLinkDiag.js` | **재작성**(같은 파일명 — 옛 진단 판정 함수 삭제). 순수 함수: `linkStateOf`(PAIRED+lastErrorCode → UNAVAILABLE), `minutesLeft`, `errorOf`(code·`cause.peerCode`), `errorKeyOf`, `normalizeCode`, `runPropertyCleanup` |
| `…/setting/EtcSetting.jsx` | 카드 위치 주석만 |
| `static/ui/src/utils/queryKey/backofficeKeys.js` | `approvalLinkStatus: () => ["approvalLink","status"]` 추가 |
| `static/ui/src/components/worklog/approvalHandoff.js` | 머리 주석을 채널 판정 기준으로. **새 DENY code 5개** 문구·거부 분류(`WORKLOG_POLICY_BLOCKED`·`WORKLOG_CONTROL_CONFLICT`·`WORKLOG_NOT_FOUND`·`WORKLOG_INVALID_INPUT`·`ACTOR_NO_ACCESS`) — 전에는 일반 "저장 실패" 문구 + "승인 앱에서 열기" 없음으로 떨어졌다. 넘김 사유(`cause.reason`) 반영: 일시 장애(`APPROVAL_UNAVAILABLE`·`ACTOR_PERMISSION_UNVERIFIED`·`WORKLOG_CONTROL_STORAGE`·`WORKLOG_POLICY_AUTHORITY_UNAVAILABLE`·`LINKED_SETTING_PERSIST_FAILED`) → "확인 불가" 문구(Q3), 작성 넘김의 `PREAPPROVAL_REQUIRED` → 사전 승인 안내, 나머지 → 기존 넘김 문구. 반환에 `reason` 추가. 서버 `cause` 가 `''`(responseWrapper 기본값)여도 안전 |
| `…/worklog/worklogMoveGuard.js` | 드래그 이동이 일시 장애로 넘김되면 "승인 앱에서 옮기세요" 안내 대신 확인 불가 오류 토스트 |
| `…/worklog/worklogWrite.js` | `createWorklog` 주석의 옛 `movesRms.origin` 서명 설명 → `write.judge` 설명(코드 무변경) |
| `src/domain/approvalLink/writeChannel.js` + `static/ui/src/components/worklog/writeChannel.js` | **두 사본 함께** 머리 주석만 재작성(옛 통제 문서·writeGate·`wr`·`ch` 설명 → `issue.control` 답 → ctl 입력 대응표). 바이트 동일(`cmp` + UI 대조 시험 통과), 판정 코드 무변경 |
| `locales/{kr,en}/setting.json` | `setting.approvalLink.*` 전면 교체(옛 진단·게시 키 삭제) |
| `locales/{kr,en}/issuePanel.json` | `issuePanel.approval.unavailable`·`create.preapproval`·`error.{policyBlocked,controlConflict,notFound,noAccess,invalidInput}` 추가, `create.unconfirmed` 문구를 "설정 > 승인 앱과 연결에서 상태 확인"으로 갱신 |
| `locales/ko-KR.json`·`en-US.json` | merge 생성물 |
| 시험 | `__test__/approvalLinkDiag.test.js` 재작성(15), **신규** `__test__/ApprovalLinkCard.test.jsx`(18), `components/worklog/__test__/approvalHandoff.test.js` 추가(11), `pages/myWork/modal/__test__/WorklogModalSpaceFilter.test.jsx` DEFER 1건 → 사유별 3건 |

미추적으로 새로 생긴 파일은 `static/ui/src/backoffice/page/setting/__test__/ApprovalLinkCard.test.jsx` 하나다(커밋 때 함께 add 필요).

## 2. 소비하는 shape (백엔드 보고 그대로)

| resolver | 소비 칸 |
|---|---|
| `getApprovalLinkStatus` | `enabled`, `channel.{status, pairedAt, pairedBy, peerVersion, lastErrorCode, pendingExp}`, `signer.ready` (`peerOps`·`lastOkAt`·`kid`·`fingerprint`·`trustedApprovalKids` 미표시) |
| `createApprovalPairingCode` | `code`, `exp` / 오류 `SIGNER_NOT_READY`·`LINK_DISABLED`·`CLOUD_ID_UNAVAILABLE` |
| `acceptApprovalPairingCode({code})` | 성공만 확인 후 상태 재조회 / 오류 `PAIR_*` 9종·`SIGNER_NOT_READY`·`ACTOR_REQUIRED`, `PAIR_PEER_REJECTED` 는 `cause.peerCode` 가 `PAIR_EXPIRED`·`PAIR_PIN_MISMATCH`·`PAIR_ALREADY_PAIRED`·`PAIR_URL_INVALID` 면 그 문구, 그 밖은 일반 거부 문구 |
| `pingApproval` | `latencyMs`, `peerVersion`, `peerLinkEnabled` / 오류 `NOT_PAIRED`·`PAIR_PEER_UNREACHABLE` |
| `rotateApprovalChannelUrl({force?})` | `peerConfirmed`(false = 우리 쪽 REVOKED → 재연결 안내) / `PAIR_PEER_UNREACHABLE` 이면 force 확인 모달 |
| `unpairApproval` | `peerNotified` |
| `cleanupApprovalLinkProperties({cursor?})` | `phase`, `scanned`, `migrated`, `removed`, `failed`, `nextCursor`, `migrationDone`. 규칙: `nextCursor` 가 null 이 될 때까지 이어 부르고, **MIGRATE 끝 페이지에서 `migrationDone:true` 면 커서 없이 처음부터 한 번 더**(CLEANUP). 다시 시작은 1회만, 상한 200쪽, 중간 실패는 누계와 오류를 보이고 멈춤. 이관만 끝나고 삭제가 안 끝난 경우 "한 번 더 실행" 안내 |
| `createIssueWorklog`·`updateIssueWorklog`·`deleteIssueWorklog` 오류 | `error.code`(DENY 그대로 또는 `WORKLOG_CREATE/EDIT_HANDOFF_REQUIRED`·`WORKLOG_LINK_UNCONFIRMED`), `error.cause.{path, reason}` |
| `getIssueWorklogControl` | 기존대로 `writeChannel`·`gated`·`linked`·`control.globalPagePath` 만(옛 `vs·dw·sf·tz·ch·rx` 소비처 없음 — grep 확인) |

넘김 경로 확인: 수정·삭제 넘김은 화면이 `control.globalPagePath` + `{issueId}/{worklogId}`, 새 작성 넘김은 서버 `cause.path`(승인 앱 `timeZone` 으로 만든 `…/{issueId}/new/{date}/{HHmm-HHmm}`) 또는 화면 `createHandoffPath`(폼 입력 날짜·시각). 모두 `/jira/apps/` 접두 검사 후에만 연다. fail-close: 창구 BLOCKED·`WORKLOG_LINK_UNCONFIRMED`·일시 장애 넘김 모두 저장하지 않고 안내 + (경로 있으면) 승인 앱 열기.

## 3. 추가·변경 i18n 키 (kr/en 같은 키)

- `setting.approvalLink.`: `title`, `description`, `status.{UNPAIRED,PENDING,PAIRED,REVOKED,UNAVAILABLE}`, `statusFailed`, `pairedBy`, `unavailable`, `needsPairing`, `switchOff`, `createCode`, `recreateCode`, `codeLabel`, `copy`, `copied`, `copyFailed`, `codeHint`, `codeExpired`, `pendingHint`, `pasteCode`, `pastePlaceholder`, `connect`, `connected`, `ping`, `pingOk`, `peerLinkDisabled`, `advanced`, `rotateHint`, `rotate`, `rotated`, `rotatedUnconfirmed`, `forceRotate`, `forceRotateConfirm`, `unpair`, `unpairConfirm`, `unpaired`, `unpairedPeerUnknown`, `cleanup`, `cleanupHint`, `cleanupRunning`, `cleanupDone`, `cleanupAgain`, `peerError.{PAIR_EXPIRED,PAIR_PIN_MISMATCH,PAIR_ALREADY_PAIRED,PAIR_URL_INVALID}`, `error.{SIGNER_NOT_READY,LINK_DISABLED,CLOUD_ID_UNAVAILABLE,ACTOR_REQUIRED,NOT_PAIRED,INVALID_TARGET,PAIR_CODE_MALFORMED,PAIR_CODE_UNTRUSTED,PAIR_ENV_MISMATCH,PAIR_SITE_MISMATCH,PAIR_EXPIRED,PAIR_URL_INVALID,PAIR_PEER_UNREACHABLE,PAIR_PEER_REJECTED,UNKNOWN}`
- 삭제: `setting.approvalLink.{issuePlaceholder, run, publish, publishRunning, publishDone, recordHint, verdict.*, check.*, error.APPROVAL_LINK_*}`
- `issuePanel.approval.`: `unavailable`, `create.preapproval`, `error.{policyBlocked, controlConflict, notFound, noAccess, invalidInput}` 추가, `create.unconfirmed` 문구 변경
- 문구 중괄호는 워크포스 `tFormat` 규약(`{name}` 한 겹)

**승인 앱과 용어 맞춤**(승인 앱 `locales/kr/workforce.json` `channel.*` 작성분 대조): 상태 5종·"연결 코드 만들기/붙여넣기·연결·연결 확인·주소 바꾸기·연결 해제·연결 관리"·해제 확인 문구는 상대 앱 이름만 바꿔 같게. 제목은 승인 앱 "워크포스와 연결" ↔ 워크포스 "승인 앱과 연결". 서로 붙여넣을 위치 안내는 승인 앱 문구 "워크포스 설정 > 승인 앱 연동"(= 워크포스 기본 설정의 `issueApprovalSetting.linkMode.title` 제목) ↔ 워크포스 문구 "승인 앱 설정 > 워크포스 연동"(승인 앱 `policy.json` 메뉴명).

## 4. 설계와 다른 점

1. **파일명 유지** — 설계는 `approvalLinkDiag.js` 재작성. 진단이 없어졌지만 새 파일을 만들지 않고 같은 이름에 연결 모델 순수 함수를 넣었다(미추적 파일 최소화).
2. **"확인 필요(UNAVAILABLE)" 판정은 화면 계산** — 서버 status 는 4종뿐이라 `PAIRED ∧ lastErrorCode != null` 을 UNAVAILABLE 로 본다(서버가 성공 호출에서 lastErrorCode 를 지우는 것을 `ChannelState.js` 에서 확인). 원문 code 를 괄호로 보인다(승인 앱처럼 `failure.*` 라벨 표는 두지 않음 — 워크포스 lastErrorCode 값 집합이 보고서에 없음).
3. **`peerOutdated` 안내 없음** — 설계 §8 키는 있지만 판정 기준(필요 ops 목록)이 계약에 없어 넣지 않았다.
4. `recentFailures` 표 없음 — 워크포스 status 응답에 그 칸이 없다.
5. 강제 주소 바꾸기 문구 — 워크포스 백엔드는 force + 무응답이면 **자기 상태를 REVOKED** 로 바꾼다(보고서 §4.1). 그래서 워크포스 문구는 "연결이 끊어지고 다시 연결해야 함"이고, 승인 앱 쪽 문구("확인하지 못했습니다. 연결 확인이 실패하면 다시 연결")와 뜻이 다르다 — 두 앱 백엔드 동작이 같은지 검증 단계에서 대조 필요.

## 5. 백엔드 요청 / 확인 필요

- 없음(차단 요청 없음). 참고로 아래는 검증 단계 확인 거리:
  - `IssueApprovalSettingTable.jsx` 의 `state === 'UNVERIFIED'` 필터·배지는 백엔드가 더 이상 내지 않는 값이라 죽은 선택지다(동작 해 없음, 이번 범위 밖이라 남김).
  - `write.judge` 가 넘김 사유로 `ISSUE_UNRESOLVED`·`LIMIT_NEEDS_TOTAL`·`APP_EXECUTION_REQUIRED` 를 줄 때는 기본 넘김 문구("이 이슈의 워크로그는 승인 앱에서 기록합니다")로 보인다 — 사유별 문구가 더 필요하면 결정 필요.

## 6. 미검증

| 항목 | 내용 |
|---|---|
| 실제 페어링 왕복 | 개발 사이트에서 양쪽 코드 만들기·붙여넣기·ping·주소 바꾸기·해제 실측 전(배포 금지 범위). 백엔드 미검증 S1·W-a·W-f 와 같이 확인 |
| 클립보드 | Forge Custom UI iframe 에서 `navigator.clipboard.writeText` 허용 여부 미실측 — 실패하면 "직접 선택해 복사" 안내(코드 칸은 읽기 전용 textarea 라 선택 가능). 기존 `CopyPageLinkButton` 이 같은 API 를 쓴다 |
| 정리 실행 시간 | 페이지당 서버 시간(이슈 100건 × 4 DELETE)에 따라 resolver 25초 한도 근접 여부 미측정 |
| 연결한 사람 이름 | `pairedBy` 를 `/user/bulk` 로 조회 — 비활성 사용자는 accountId 원문 표시 |

---

## 검증 1차 수정 (2회차, 2026-10-19 — `03_verify_report.md` F10 프론트 몫 + 백엔드 '검증 1차 수정' 대응)

| 항목 | 결과 |
|---|---|
| UI 테스트 `npx jest --runInBand` | **170 suites / 2,737 tests 전부 통과**(1회차 2,733 → +4) |
| UI 빌드 `CI=true npm run build` | exit 0, `bundle:check` withinBudget true(gzip 496,337 / 950,000) |
| `npm run merge` | 실행 |

### 항목별

| 지적·변경 | 수정 | 파일 | 시험 |
|---|---|---|---|
| **F10** 설정 표 `UNVERIFIED` 죽은 선택지 | 필터 선택지 `ALL·SET·NONE` 만(`STATE_FILTERS`), 상태 배지의 UNVERIFIED 분기 삭제, `stateMode.UNVERIFIED` 키 kr/en 삭제. 백엔드는 옛 번들이 보내도 0건으로 답함(백엔드 보고) | `pages/projectDetail/issue/IssueApprovalSettingTable.jsx`, `locales/{kr,en}/issueApprovalSetting.json` | `IssueApprovalSettingTable.test.jsx` — 행을 SET/NONE 으로, 선택지가 정확히 `['ALL','SET','NONE']` |
| **F10** 낡은 property 주석·문구 | 주석: 결재선 열·일괄 저장(`rx`·"결재선 목록 게시" → `capabilities.fl`·`flows.list`·`wa` 조건), `writeChannelView`("통제 문서" → 승인 앱 `issue.control` 답), `ProjectWorkPanel`. 문구: `issueApprovalSetting.kbStale`("연동 신호 다시 게시" → 승인 앱이 하루 안에 다시 읽음), `linkMode.description`(승인 앱 문서 → '승인 앱과 연결'), `recommend` | `IssueApprovalSettingTable.jsx`, `approvalBulk.js`, `components/worklog/writeChannelView.js`, `pages/projectDetail/work/ProjectWorkPanel.jsx`, `__test__/issueApprovalView.test.jsx`(케이스 이름만), `locales/{kr,en}/issueApprovalSetting.json` | — |
| **F6** 승인 앱 서명 `LINK_DISABLED` | 쓰기 넘김 사유 `LINK_DISABLED` → `issuePanel.approval.peerLinkDisabled`(승인 앱 쪽 연동 꺼짐 — 다시 시도로 안 풀림, 관리자 안내). 연결 카드: 거부·무응답(`PAIR_PEER_REJECTED`·`PAIR_PEER_UNREACHABLE`)의 `cause.peerCode=LINK_DISABLED` → `peerError.LINK_DISABLED`. 상태의 `lastErrorCode=LINK_DISABLED` → "연결 확인 필요" 문구 안에 `lastError.LINK_DISABLED` 설명 | `components/worklog/approvalHandoff.js`, `backoffice/page/setting/{approvalLinkDiag.js, ApprovalLinkCard.jsx}` | `approvalHandoff.test.js`, `approvalLinkDiag.test.js`(`failureKeyOf`·`lastErrorKeyOf`) |
| **F6** 승인 앱 서명 `RATE_LIMITED` | 쓰기 넘김 사유 `RATE_LIMITED` 를 일시 장애(`UNAVAILABLE_REASONS`)로 → "확인 불가, 잠시 뒤 다시". 연결 카드 `peerError.RATE_LIMITED`(1분 뒤 다시), `lastError.RATE_LIMITED` | 같은 파일 | `approvalHandoff.test.js`, `ApprovalLinkCard.test.jsx`(ping RATE_LIMITED) |
| **F2** `issue.control` 행 `link:'UNVERIFIED'` | 화면 변경 불필요 확인 — 서버가 `NOT_LINKED('UNVERIFIED')` → `writeChannelOf` BLOCKED(스위치 무관)로 내려 주고, 화면은 서버 `writeChannel` 만 믿는다(`resolveWriteChannel`). BLOCKED 면 작성 버튼 막고 `issuePanel.approval.create.unconfirmed`(1회차에 "설정 > 승인 앱과 연결 확인" 문구로 갱신)·수정 행 `blocked.row` + 다시 시도. 쓰기 실행 시 `WORKLOG_LINK_UNCONFIRMED` 도 같은 문구 | — | 기존 `writeChannel.test.js` `P1-3 UNVERIFIED → BLOCKED`(OFF 스위치 포함) |

`LINK_DISABLED`·`RATE_LIMITED` 를 화면에서 받는 경로(백엔드 `ChannelClient` 확인): 서명된 오류는 `{ok:false, code}`(unavailable 아님)로 오므로 쓰기에서는 `judgeOrThrow` 가 넘김 `cause.reason = code`, ping·붙여넣기에서는 `PAIR_PEER_UNREACHABLE/REJECTED` 의 `cause.peerCode`, 상태에서는 `channel.lastErrorCode` 다. `issue.control` 이 이 code 로 실패하면 `ApprovalControlLookup` 이 UNVERIFIED(BLOCKED)로 접는다.

### 추가 i18n 키 (kr/en)
- `setting.approvalLink.peerError.{LINK_DISABLED, RATE_LIMITED}`, `setting.approvalLink.lastError.{LINK_DISABLED, RATE_LIMITED, PEER_TIMEOUT, PEER_UNREACHABLE, STALE_LINK}`
- `issuePanel.approval.peerLinkDisabled`
- 삭제 `issueApprovalSetting.stateMode.UNVERIFIED`, 문구 변경 `issueApprovalSetting.{kbStale, recommend, linkMode.description}`

### 남은 것
- `lastError.*` 설명은 알려진 5개 code 만. 그 밖 code 는 원문 표시.
- 실측 항목은 1회차 §6 그대로.

## 재검증 R4 대응 (3회차, 2026-10-19 — 미확인 주소 상한)

- 백엔드 shape: 비강제 `rotateApprovalChannelUrl` → `{success:false, error:{code:'PAIR_PEER_UNREACHABLE', cause:{reason:'ORPHAN_LIMIT', orphanCount}}}`.
- `approvalLinkDiag.errorOf` 가 `reason`·`orphanCount` 를 보존, `failureKeyOf` 가 `reason==='ORPHAN_LIMIT'` 면 `setting.approvalLink.error.ORPHAN_LIMIT`(kr/en, `{count}`) — "확인되지 않은 주소가 너무 많아({count}개) 일반 주소 바꾸기를 할 수 없습니다. 강제로 바꾸거나, 연결을 해제한 뒤 연결 코드로 다시 연결하세요." 카드는 그 문구와 함께 기존 강제 바꾸기 확인 모달을 연다(연결 해제 버튼은 같은 '연결 관리' 안에 있음).
- 시험 +2(`approvalLinkDiag.test.js` 1, `ApprovalLinkCard.test.jsx` 1). UI **170 suites / 2,739 tests 통과**, `CI=true npm run build` exit 0, bundle withinBudget.

## 재검증 2회차 R6 대응 (4회차, 2026-10-19 — 연결 상태 경쟁)

- `approvalLinkDiag.js`: `KNOWN_ERRORS` 에 `PAIR_STATE_CHANGED`, `STATE_CHANGED_CODES = PAIR_STATE_CHANGED·STORAGE_CONFLICT·CHANNEL_STATE_CONFLICT` 를 모두 `setting.approvalLink.error.PAIR_STATE_CHANGED` 문구로. 워크포스 백엔드 확인: 코드 만들기·붙여넣기는 `PAIR_STATE_CHANGED` 로 바꿔 던지지만, `rotate` 의 `setSelfUrls`·`revoke` 는 경쟁 시 저장소 code `STORAGE_CONFLICT` 를 그대로 던질 수 있다(워크포스 이름. 승인 앱 이름 `CHANNEL_STATE_CONFLICT` 도 같이 받음).
- kr "다른 화면에서 연결 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요." / en "The connection status was changed from another screen. Refresh and try again."
- 카드: 모든 동작은 끝나면 `backofficeKeys.approvalLinkStatus()` 를 무효화(1회차부터, 승인 앱과 같음)하고, 상태 경쟁 오류면 들고 있던 연결 코드도 지운다(무효일 수 있음).
- 시험 +4(`approvalLinkDiag.test.js` 1, `ApprovalLinkCard.test.jsx` 3 — 만들기·붙여넣기 무효화, rotate STORAGE_CONFLICT). UI **170 suites / 2,743 tests 통과**, `CI=true npm run build` exit 0, bundle withinBudget.
