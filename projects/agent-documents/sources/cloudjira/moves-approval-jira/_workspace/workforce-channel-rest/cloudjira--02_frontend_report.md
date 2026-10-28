# 프론트 보고서 — workforce-channel-rest (승인 앱 `static/ui`)

> 2026-10-19 · frontend-engineer · 1차
> 입력: `01_architect_design.md` §2.4·§2.7·§7.1·§8·§14 frontend·§15, `02_backend_report.md` §3·§4·§15 반영(실제 shape 우선)
> 배포·커밋 없음. `docs/` 미커밋 변경은 건드리지 않음. 엔트리 추가 없음(3곳 수정 불필요).

## 1. 결과

| 검사 | 결과 |
|---|---|
| `npm run merge` | 통과 — `locales\ko-KR.json`·`locales\en-US.json` 생성(두 언어 키 집합 일치) |
| `npm run test:ui -- --runInBand` | **93 suites / 849 tests 전부 통과** (165.9s) |
| `npm run build:ui` | 성공 — "Compiled with warnings" 는 기존 node_modules source map 경고 3건(`@atlaskit/analytics-next-stable-react-context`·`marklassian`)뿐, 이번 변경 경고 없음 |
| 삭제 resolver 호출 grep | `static/ui/src` 운영 코드 0건(테스트의 "부르지 않음" 단언만 남음) |

## 2. 변경 파일

| 파일 | 변경 |
|---|---|
| `static/ui/src/features/settings/WorkforceLinkSettings.jsx` | 전면 재작성. 연결 섹션(상태 배지·연결한 사람/시각·상대 버전·마지막 정상 통신·최근 실패 code·내 코드 만료 시각, "연결 필요"·"연결 확인 필요"·"해제됨" 안내, 코드 만들기/복사/만료, 붙여넣기/연결, 연결 확인, 연결 관리 details(다시 연결·주소 바꾸기·해제 확인 모달)), 서명 키 섹션, 최근 통신 실패 표. 게시 통계·재게시·수신 검증·조직 조회 API 섹션 삭제. 단독 모드 접기 동작 유지 |
| `static/ui/src/features/settings/workforceLinkModel.js` | 전면 재작성 — `channelViewOf`·`channelAppearance`·`isPairedView`·`needsPairing`·`expiryOf`·`failureCodeKey`·`opKey`·`pairErrorOf`·`normalizePairingCode`·`PAIR_ERROR_CODES`(12) |
| `static/ui/src/features/settings/WorkforceTeamsSection.jsx` | 원천 문구(`organizationApi.signedSource`) → 원천 칩 `workforce.teams.source`("워크포스 연결"), 주석 |
| `static/ui/src/features/settings/featureStateModel.js` | `workforceLinkLineOf` 를 `channel.status==='PAIRED'`·`pairedAt` 로(옛 `certPublish.linkedAt` 없음). 현재 화면 미사용 함수지만 shape 정합 |
| `static/ui/src/utils/queryKey/approvalKeys.js` | `workforceKeys.organizationApi*` 4개 삭제(미커밋 hunk 흡수), `settingsKeys.workforceLink` 주석 갱신 |
| `static/ui/src/features/settings/WorkforceOrganizationApiSection.jsx` + `__test__/WorkforceOrganizationApiSection.test.jsx` | **삭제**(rm, 스테이징 안 함) |
| 테스트 | `WorkforceLinkSettings.test.jsx` 재작성, `workforceLinkModel.test.js` 모델 부분 재작성(타임시트 부분 유지), `WorkforceTeamsSection.test.jsx` 1건 추가, `featureStateModel.test.js` shape 갱신, `linkedModeI18n.test.js` REMOVED_KEYS 6개 추가 |
| `locales/{kr,en}/workforce.json` | `channel.*` 신설, `signing`·`failures`·`notice`·`enabled`·`teams.hint` 재작성, `teams.source` 추가. 삭제: `status`·`crypto`·`trustedPeers`·`storage`·`cloudId`·`publish`·`inbound`·`typ`·`code`·`republish`·`organizationApi`·`enabled.offHint` |
| `locales/{kr,en}/error.json` | 새 코드 12개 추가, `WORKFORCE_API_*` 8개 삭제(백엔드 ErrorCodes 에서 삭제됨) |
| `locales/{kr,en}/policy.json` | 감사 action `pair/codeCreated`·`pair/accepted`·`pair/rotated`·`pair/unpaired`·`pair/completed`·`pair/peerRotated`·`pair/peerUnpaired` 문구, `features.workforce.state.WAITING` 문구 |
| `locales/{kr,en}/worklog.json` | `tab.linkUnavailable` 문구(아래 §5) |
| `locales/{kr,en}/worklogCert.json` | `workforce.*`(인증 시간 게시 문구 6개) 삭제 — 옛 게시 섹션 전용이었음 |

미커밋 D5 프론트 변경(`WorkforceLinkSettings.jsx` 의 조직 API 섹션 import·렌더, `WorkforceOrganizationApiSection.jsx`, 그 테스트, `approvalKeys` 의 2줄, `locales/*/workforce.json` `organizationApi.*` 2줄)은 이번 재작성에 모두 흡수·삭제됐다.

## 3. 소비한 resolver·shape (백엔드 보고서 §3 그대로)

| resolver | payload | 소비 필드 | 화면 |
|---|---|---|---|
| `getWorkforceLinkStatus` | `{}` | `enabled`, `channel.{status, pairedAt, pairedBy, peerVersion, lastOkAt, lastErrorCode, pendingExp}`, `signer.{ready, kid, fingerprint}`, `recentFailures[].{op, code, lastAt, hitCount}` | 연결·서명 키·최근 실패 |
| `createWorkforcePairingCode` | `{}` | `code`, `exp` | 코드 칸·복사·만료 |
| `acceptWorkforcePairingCode` | `{ code }`(공백·줄바꿈 제거) | 성공만 확인(`status`·`pairedAt` 은 상태 재조회로 반영) | 붙여넣기 |
| `rotateWorkforceChannelUrl` | `{}` / 상대 실패 뒤 `{ force: true }` | `peerConfirmed` | 주소 바꾸기 |
| `unpairWorkforce` | `{}` | `peerNotified` | 해제(확인 모달) |
| `pingWorkforce` | `{}` | `latencyMs`, `peerVersion` | 연결 확인 |
| `listWorkforceTeams` | `{}` | 기존 그대로(`enabled`, `teams`, `truncated`, `refreshCandidates`) — `source`·`page` 는 읽지 않음 | 설정 > 타임시트 > 팀 |

- 화면 상태 `UNAVAILABLE` 은 백엔드 §3.1 대로 `status==='PAIRED' && lastErrorCode` 로 판단(서버 값 아님). `OP_UNKNOWN` 이면 "워크포스 업데이트" 안내를 덧붙임.
- `pairedBy` 이름은 `useUserNames`(→ `resolveUsers`, asUser).
- 코드 원문은 `useMutation` 결과(컴포넌트 수명)에만 두고 쿼리 캐시·로그에 넣지 않음. 화면을 떠나면 사라짐(설계 §2.4 "코드 자체가 비밀").
- 연결 상태가 바뀌는 동작(만들기·붙여넣기·확인·주소·해제·새로 고침) 뒤 무효화: `settingsKeys.workforceLink()`, `settingsKeys.audit()`, `settingsKeys.worklogApprovalIdentity()`, `workforceKeys.all`, `worklogControlKeys.all`.
- 오류는 전부 `error.code` 분기. `PAIR_PEER_REJECTED` 는 `cause.peerCode`, `PAIR_PEER_UNREACHABLE` 은 `cause.reason` 을 덧붙여 표시.
- 버튼 차단: `enabled !== true` → `channel.disabledHint`(서버 `LINK_DISABLED` 와 같은 조건), `signer.ready !== true` → `channel.signerHint`.

## 4. 추가 i18n 키 (kr·en 동시)

- `workforce.channel.*` — `title`, `description`, `status.{label,UNPAIRED,PENDING,PAIRED,REVOKED,UNAVAILABLE}`, `needsPairing`, `unavailableHint`, `revokedHint`, `peerOutdated`, `pairedByLabel`, `pairedBy`, `unknown`, `peerVersion`, `peerVersionUnknown`, `lastOkAt`, `lastError`, `pendingLabel`, `pendingUntil`, `createCode`, `createHint`, `codeLabel`, `codeHint`, `codeSecret`, `codeExpired`, `copy`, `copied`, `copyFailed`, `pasteLabel`, `pastePlaceholder`, `connect`, `connected`, `refresh`, `ping`, `pingOk`, `advanced`, `repair`, `rotate`, `rotateHint`, `rotated`, `rotatedUnconfirmed`, `rotateForce`, `unpair`, `unpairConfirmTitle`, `unpairConfirm`, `unpaired`, `unpairedPeerMissed`, `disabledHint`, `signerHint`, `rejectedDetail`, `unreachableDetail`, `failure.*`(19 + UNKNOWN), `op.*`(15 작업)
- `workforce.signing.{state, ready, notReady, fingerprintHint}`, `workforce.failures.column.op`, `workforce.teams.source`
- `error.{PAIR_CODE_MALFORMED, PAIR_CODE_UNTRUSTED, PAIR_SITE_MISMATCH, PAIR_EXPIRED, PAIR_ENV_MISMATCH, PAIR_PEER_UNREACHABLE, PAIR_PEER_REJECTED, NOT_PAIRED, SIGNER_NOT_READY, LINK_DISABLED, CLOUD_ID_UNKNOWN, WORKFORCE_UNAVAILABLE}`
- `policy.audit.action.pair/*` 7개

**설계 §8 과 다른 점**: 오류 문구를 `workforce.channel.error.*` 가 아니라 **`error.json`** 에 두었다(스킬 규약 "`error.json` 키 = ErrorCodes 값", 화면 공통 `t('error.'+code)` 경로, `WorkforceTeamsSection` 의 `NOT_PAIRED`·`WORKFORCE_UNAVAILABLE` 도 같은 경로로 표시). 자리표시자는 이 리포 `tFormat` 규약대로 `{name}`(설계의 `{{name}}` 아님). `workforceLink.ping` 쿼리키는 추가하지 않았다 — ping 은 mutation 이라 캐시 키가 필요 없다(결과는 상태 재조회로 반영).

## 5. '확인 불가'(Q3 fail-close) 안내 점검

| 위치 | 이전 | 판단·조치 |
|---|---|---|
| 작업 로그 탭·기록 대화상자 `worklog.tab.linkUnavailable`(`control.linkUnavailable===true`) | "기간 창이 켜진 사이트에서는 확인될 때까지 작성이 막힐 수 있습니다" | **부정확해 고침.** 백엔드 `WorklogControlContext` 는 연동 불명(`link.unavailable`)이면 설정도 `settingUnresolved` 라 창 상태가 `READ_FAILED` → 날짜 창 켬 여부와 무관하게 쓰기 거부. 새 문구: "확인될 때까지 이 이슈의 기록 작성·수정은 막히고, 이미 승인·마감된 기록의 잠금은 그대로입니다." |
| 이슈 연동 설정 요약 `LinkedSettingSummary`(`settingUnresolved` → `error.LINKED_SETTING_PERSIST_FAILED`) | "워크포스 이슈 설정을 저장하지 못했습니다. 새로고침 후 다시 시도하세요." | 문구 유지(채널 실패 때도 "다시 시도"가 맞음). 단 원인이 "저장 실패"로 읽힐 수 있음 — §7 백엔드 요청 2 |
| 설정 > 워크포스 연동 | (없음) | `UNAVAILABLE` 배지 + `channel.unavailableHint`(쓰기 막힘·잠금 유지·연결 확인으로 재시도). 서버가 상태를 자동 REVOKED 로 바꾸지 않는 규칙(백엔드 §5-5)과 일치 |
| 설정 > 타임시트 > 팀 | `error.<code>` | `NOT_PAIRED`·`WORKFORCE_UNAVAILABLE` 문구 신설로 경고가 키 이름 대신 문장으로 보임 |

## 6. 테스트 (이번에 추가·재작성한 시험)

- `WorkforceLinkSettings.test.jsx`(33건, it.each 포함): 미연결·연결됨·확인 필요(STALE_LINK)·OP_UNKNOWN 업데이트 안내·PENDING 만료 행·REVOKED·서명 키 없음 차단 / 코드 만들기(코드 칸 읽기 전용·복사 API 호출·상태 재조회)·만료 코드 감춤·복사 실패 안내·만들기 오류 3종 / 연동 꺼짐 차단 / 붙여넣기 공백 제거·성공 후 비움·**오류 code 8종 문구**·거부 peerCode·도달 실패 reason·입력 시 오류 해제 / ping 성공·실패 / 주소 바꾸기 상대 실패 → force / **해제 확인 모달(취소 시 미호출, 확인 시 호출, 실패 시 모달 안 오류, peerNotified:false 안내)** / 토글·단독 접기. 모든 시험 뒤 삭제 resolver 5개 호출 0건 단언
- `workforceLinkModel.test.js`: 상태 판정·연결 필요·만료 올림·코드 정리·오류 detail·코드/작업 fallback, i18n 계약(상태 5·실패 20·작업 15·오류 12 두 언어, 오류 12개가 백엔드 `ErrorCodes.js` 에 있음, 감사 7, 삭제 키 부재, `WORKFORCE_API_*` 부재)
- `WorkforceTeamsSection.test.jsx`: 원천 칩, `NOT_PAIRED`·`WORKFORCE_UNAVAILABLE` 경고

## 7. 백엔드 요청 (임의 가공하지 않음) — 3건 모두 백엔드 반영, 소비는 §9

1. **복사·붙여넣기 뒤 상대 쪽 완료 감지 없음** — 내가 만든 코드를 워크포스가 붙여넣어 연결이 끝나도 화면은 [상태 새로 고침]·창 포커스 재조회로만 PAIRED 를 본다. 자동 갱신이 필요하면 PENDING 동안 짧은 폴링(예: 10초, 만료까지)을 프론트에서 넣을 수 있으나 `getWorkforceLinkStatus` 의 KVS·SQL 비용(최근 실패 SQL 1)을 백엔드가 확인해 줘야 한다. 지금은 넣지 않았다.
2. `settingUnresolved` 의 원인 구분 — 채널 실패(`unavailable`)와 진짜 저장 실패(`LINKED_SETTING_PERSIST_FAILED`)가 화면에서 같은 문구로 보인다. `getLinkedIssueOverview` 등에 `settingCode`(예: `WORKFORCE_UNAVAILABLE`)를 실어 주면 "워크포스 응답 없음" 으로 나눠 보일 수 있다.
3. `recentFailures` 에 방향(IN/OUT)이 없다 — `op` 만으로는 보낸 실패인지 받은 실패인지 일부(`change.notify`) 구분 불가. 표에는 작업 이름만 보인다.

## 8. 미검증

- 실제 Forge iframe 에서 `navigator.clipboard.writeText` 허용 여부(막히면 `execCommand('copy')` 대체 → 그것도 실패면 "직접 복사" 안내). jsdom 시험만 함.
- Atlaskit `TextArea` `ref` 전달(코드 칸 선택 후 복사 대체 경로) — 빌드는 통과, 실기 미확인.
- 개발 사이트에서 두 앱 실제 페어링(코드 600자 붙여넣기·만료·해제 알림) 화면 흐름 — 배포 금지 범위라 미실행.
- 워크포스 쪽 화면(`ApprovalLinkCard`)과 키 식별값 표시 형식 일치(우리 `fingerprintHint` 문구가 가정).

## 9. 백엔드 반영 소비 (2회차, 2026-10-19 — `02_backend_report.md` '프론트 요청 반영')

### 결과
| 검사 | 결과 |
|---|---|
| `npm run merge` | 통과 |
| `npm run test:ui -- --runInBand` | **94 suites / 869 tests 전부 통과**(1회차 93/849 → +1 suite, +20 tests) |
| `npm run build:ui` | 성공 — 경고는 기존 node_modules source map 경고뿐 |

### (1) 코드 대기 중 폴링
- `WorkforceLinkSettings.jsx` `usePendingPoll`: 화면 상태가 `PENDING` 인 동안만 `setInterval` **10초**(`PENDING_POLL_MS`)로 `getWorkforceLinkStatus({ light: true })`. 결과가 PENDING 이 아니면(PAIRED·UNPAIRED·REVOKED) 멈추고 전체 상태(`payload {}`)와 연동 관련 키를 무효화해 다시 그린다. 시작부터 **30분**(`PENDING_POLL_MAX_MS`)이 지나면 멈춤. `document.visibilityState === 'hidden'` 인 틱은 건너뜀(창 비활성 동안 호출 0). 응답 대기 중 겹치기 방지, 실패는 다음 틱에 재시도(화면 상태 안 바꿈). 언마운트·상태 변경 시 정리.
- 판정은 순수 함수 `pendingPollStep({view, startedAt, now, visible}) → 'POLL'|'SKIP'|'STOP'`(`workforceLinkModel.js`).
- light 응답(`recentFailures: null`)은 화면 데이터로 쓰지 않는다 — 판정만 하고 화면은 전체 조회로 그린다. 전체 조회의 `recentFailures ?? []` 는 그대로.

### (2) `settingCode` 로 원인 구분
- 새 `features/worklog/settingUnresolvedModel.js`: `settingCodeKey`(WORKFORCE_UNAVAILABLE·LINKED_SETTING_PERSIST_FAILED·STORAGE_NOT_READY, 그 밖·없음 → UNKNOWN), `settingWarningKeyOf(source, {linkUnavailable})`(미해결일 때만, 연동 불명 안내가 이미 있고 원인이 WORKFORCE_UNAVAILABLE 이면 중복 생략), `linkedWarningGroups(warnings, live.issues)`(원인별 묶음 + 이슈 키).
- 소비 위치:
  | 응답 | 화면 |
  |---|---|
  | `getLinkedIssueOverview` `settingUnresolved`·`settingCode` | `WorklogTab`(control 블록이 없을 때 대체 원천) · `LinkedSettingSummary`(옛 고정 문구 `error.LINKED_SETTING_PERSIST_FAILED` 대체) |
  | `getIssueWorklogs`·`getWorklogEditorContext` `control.settingUnresolved`·`settingCode` | `WorklogTab` 경고 `worklog-setting-unresolved` · `WorklogDialog` 경고 `worklog-dialog-setting-unresolved` |
  | 내 타임시트 `linkedSettingWarnings[] {issueId?, code, settingCode?}` | `SubmitBar` — 원인별 경고 + 이슈 키(최대 10개 + 나머지 수). **이 배열은 지금까지 화면에 전혀 안 보였다**(신규 표시) |
- 새 키(kr·en): `worklog.settingUnresolved.{WORKFORCE_UNAVAILABLE, LINKED_SETTING_PERSIST_FAILED, STORAGE_NOT_READY, UNKNOWN}`, 그리고 빠져 있던 `error.TIMESHEET_LINKED_SETTING_UNRESOLVED`(제출 거부 코드인데 문구가 없어 키 이름이 보였음 — 함께 보강).

### (3) 최근 실패 방향
- 표 첫 열 "방향": `direction` `OUT` → `workforce.failures.direction.OUT`(보냄), `IN` → `...IN`(받음), 그 밖 `—`. 행 key 에 direction 포함. 새 키 `workforce.failures.column.direction`·`workforce.failures.direction.{OUT,IN}`.

### 추가·수정 시험
- `WorkforceLinkSettings.test.jsx` 폴링 3건(가짜 setInterval·Date): 10초 전엔 0회·10초에 `{light:true}` 1회, PAIRED 되면 멈추고 전체 재조회·이후 0회 / 창 숨김이면 0회·30분 뒤 멈춤(≤180회) / 연결됨이면 폴링 없음. 실패 표 방향 열 단언.
- `workforceLinkModel.test.js`: `pendingPollStep`, 방향 키 두 언어.
- `settingUnresolvedModel.test.js`(신규 5건), `LinkedSettingSummary.test.jsx` 6건, `WorklogTab.test.jsx` 4건(원인 3종 + 중복 생략), `MyTimesheetPage.test.jsx` 1건(원인별 묶음·이슈 키·UNKNOWN).

### 미검증(추가)
- 실기에서 Forge iframe 의 `visibilityState` 가 탭 전환 시 `hidden` 이 되는지(상위 Jira 페이지 탭 전환이 iframe 문서에 전달되는지).

## 10. 검증 1차 수정 (3회차, 2026-10-19 — `03_verify_report.md` F1·F8·F10 프론트 몫, `02_backend_report.md` '검증 1차 수정')

### 결과
| 검사 | 결과 |
|---|---|
| `npm run merge` | 통과 |
| `npm run test:ui -- --runInBand` | **94 suites / 871 tests 전부 통과** |
| `npm run build:ui` | 성공 — 경고는 기존 node_modules source map 경고뿐 |

### 반영
| 항목 | 소비한 shape | 화면 |
|---|---|---|
| F1 강제 주소 바꾸기 | `rotateWorkforceChannelUrl` → `{ rotated, peerConfirmed, status: 'PAIRED'\|'REVOKED' }` | "워크포스 확인 없이 바꾸기"는 이제 **확인 모달**(`workforce-rotate-force-confirm`)을 거친다. 본문 `channel.rotateForceConfirm` = "워크포스가 새 주소를 확인하지 못해 지금 연결이 해제되고, 연결 코드로 다시 연결해야 합니다"(워크포스 `setting.approvalLink.forceRotateConfirm` 과 같은 뜻). 모달 안 실패는 모달 안 오류. 결과 판정 `rotateResultOf`: `status==='REVOKED'` 또는 `peerConfirmed!==true` → 경고 `channel.rotatedRevoked`("연결이 해제됐습니다. 연결 코드로 다시 연결하세요"), 그 밖 성공 `channel.rotated`. 옛 `channel.rotatedUnconfirmed`("연결 확인이 실패하면 다시 연결" — 조건이 오지 않던 문구) **삭제** |
| REVOKED 사유 | `getWorkforceLinkStatus.channel.revokedReason: 'ROTATED_WITHOUT_PEER'\|null` | `revokedHintKey` — `ROTATED_WITHOUT_PEER` → `channel.revokedReason.ROTATED_WITHOUT_PEER`, null·모르는 값 → 기존 `channel.revokedHint`. 해제됨이면 연결 관리 영역 대신 코드 만들기·붙여넣기가 바로 보인다(기존 동작) |
| F8 서명된 `PAIR_EXPIRED` | `acceptWorkforcePairingCode` 오류 `PAIR_PEER_REJECTED` `cause.peerCode` | `peerErrorKey` — 아는 peerCode(`PAIR_EXPIRED`·`PAIR_PIN_MISMATCH`·`PAIR_ALREADY_PAIRED`·`PAIR_URL_INVALID`·`LINK_DISABLED`·`ACTOR_INACTIVE`)는 문장(`channel.peerError.*`, 워크포스 `peerError` 와 같은 뜻), 모르는 값은 기존처럼 code 원문(`rejectedDetail`) |
| F7 `REQUEST_INVALID` | 송신 전 형식 오류(내부 code) | `error.REQUEST_INVALID`·`channel.failure.REQUEST_INVALID` 문구(kr/en). 연결 관리에선 `PAIR_PEER_UNREACHABLE` 의 `cause.reason` 으로도 보인다 |
| F10 낡은 주석 | — | `features/timesheet/RoutingSourceBadge.jsx`(`movesRms.org` 서명 → 워크포스 연결 `org.get`), `features/worklogControl/CapabilityRefresh.jsx`(cap wlorigin·사용자 프로퍼티 → 능력 = 연결 여부). `static/ui/src` 운영 코드에 `movesRms`·`movesApproval.`·"재게시"·"프로퍼티" 남은 곳 0(grep) |

새 키(kr·en): `workforce.channel.{rotateForceTitle, rotateForceConfirm, rotatedRevoked, revokedReason.ROTATED_WITHOUT_PEER, peerError.{6}, failure.REQUEST_INVALID}`, `error.REQUEST_INVALID`. 삭제: `workforce.channel.rotatedUnconfirmed`.

### 시험
- `WorkforceLinkSettings.test.jsx`: 강제 바꾸기 — 버튼은 모달만 열고(호출 1회 유지), 취소면 미호출, 확인하면 `{force:true}` → 재조회된 REVOKED + 사유별 안내·코드 만들기 노출 / 성공(PAIRED) 문구, 강제 실패는 모달 안 오류 / 해제됨 사유 null → 일반 안내 / 붙여넣기 거부 peerCode `PAIR_PIN_MISMATCH`·`PAIR_EXPIRED` 문장, 모르는 값은 원문.
- `workforceLinkModel.test.js`: `rotateResultOf`(status 없는 옛 응답 포함)·`revokedHintKey`·`peerErrorKey`·`REQUEST_INVALID`, 새 키 두 언어, `rotatedUnconfirmed` 부재.

## 11. 재검증 1회차 수정 (4회차, 2026-10-19 — `03_verify_report.md` '재검증 1회차' R2, R3 문구 확인)

### 결과
| 검사 | 결과 |
|---|---|
| `npm run merge` | 통과 |
| `npm run test:ui -- --runInBand` | **94 suites / 872 tests 전부 통과** |
| `npm run build:ui` | 성공 — 경고는 기존 node_modules source map 경고뿐 |

### 반영
- **R2 `LINK_DISABLED`**(워크포스 쪽 연동 스위치 꺼짐 → 서명된 거절): `workforceLinkModel.js` `KNOWN_FAILURES` 에 추가 → 연결 섹션 "최근 통신 실패" 행과 최근 실패 표가 `failure.UNKNOWN` 대신 `channel.failure.LINK_DISABLED`("워크포스 쪽 연동이 꺼져 있음 — 워크포스 관리자에게 문의"). `lastErrorCode === 'LINK_DISABLED'` 면 "연결 확인 필요" 안내 안에 `channel.peerLinkDisabled`(원인 + 워크포스 관리자에게 문의 + **72시간을 넘기면 연동 이슈 기록 작성·수정이 막힐 수 있음**, 잠금 유지) 한 단락(`workforce-peer-link-disabled`).
- **`channel.unavailableHint` 정정**: "확인될 때까지 막힘"만 말하던 것을 백엔드 실제 동작(`LINK_EXP_MS`·`ORG_STALE_MS` = 72시간)에 맞춰 "받아 둔 연동 정보로 최대 72시간 동작, 그 뒤나 받아 둔 정보가 없는 이슈는 막힘"으로.
- **`RATE_LIMITED`**: 문구는 1회차부터 있었다(`channel.failure.RATE_LIMITED`). R3(재시도 비대칭, 백엔드 몫)에 맞춰 "요청이 너무 많음 — 잠시 뒤 다시 시도"로 다듬었다.
- 키(kr·en): 추가 `workforce.channel.failure.LINK_DISABLED`, `workforce.channel.peerLinkDisabled` / 변경 `workforce.channel.failure.RATE_LIMITED`, `workforce.channel.unavailableHint`.

### 시험
- `WorkforceLinkSettings.test.jsx` 1건: `lastErrorCode:'LINK_DISABLED'` → 전용 안내 단락, 최근 실패 행·표에 전용 문구, UNKNOWN 없음.
- `workforceLinkModel.test.js`: `failureCodeKey('LINK_DISABLED'|'RATE_LIMITED')`. 두 언어 키 존재는 기존 `FAILURE_CODES` 전수 대조가 함께 강제.

## 12. 백엔드 R4 — 미확인 주소 상한(ORPHAN_LIMIT) (5회차, 2026-10-19)

- 결과: `merge` 통과, `test:ui` **94 suites / 873 tests 통과**, `build:ui` 성공(기존 source map 경고뿐).
- 비강제 `rotateWorkforceChannelUrl` 이 `PAIR_PEER_UNREACHABLE` + `cause.reason:'ORPHAN_LIMIT'` 이면 `isOrphanLimit`(`workforceLinkModel.js`) → 원인 code 원문 대신 `workforce.channel.orphanLimit`("확인되지 않은 주소가 너무 많아 일반 바꾸기를 할 수 없습니다. 강제로 바꾸거나 연결을 해제한 뒤 다시 연결") kr/en. 강제 바꾸기 버튼(확인 모달)과 연결 해제는 그대로 열려 있다.
- 시험: 화면 1건(안내 문구·강제 버튼·해제 버튼 노출, 강제 확인 시 `{force:true}`), 모델 판정 4건 + 두 언어 키.

## 13. `PAIR_STATE_CHANGED` (6회차, 2026-10-19)

- 결과: `merge` 통과, `test:ui` **94 suites / 876 tests 통과**, `build:ui` 성공(기존 source map 경고뿐).
- `error.PAIR_STATE_CHANGED` kr "다른 화면에서 연결 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요." / en "The connection state was changed on another screen. Refresh and try again."
- 연결 코드 만들기·붙여넣기 실패가 이 코드면(`isStateChanged`) 오류 문구를 보이면서 연결 상태 관련 쿼리(`settingsKeys.workforceLink` 외 연동 키)를 무효화해 다시 받는다. 다른 오류는 무효화하지 않는다. `PAIR_ERROR_CODES` 13개(ErrorCodes·두 언어 대조 시험 포함).
- 시험: 만들기·붙여넣기 각 1건(문구 + 상태 재조회), PAIR_EXPIRED 는 재조회 없음 1건, 모델 판정 2건.

## 14. `CHANNEL_STATE_CONFLICT` (7회차, 2026-10-19)

- 백엔드 확인: `PairingService` 는 만들기·붙여넣기 경로만 `conflictOr` 로 `PAIR_STATE_CHANGED` 로 감싼다. `rotate`(URL 기록·`markRevoked`)·`unpair`(`markRevoked`)는 감싸지 않아 `ChannelStateConflict.code = 'CHANNEL_STATE_CONFLICT'` 가 `ResponseWrapper`(`code: e.code`)로 **그대로 응답에 나간다** → 프론트 처리 필요.
- `error.CHANNEL_STATE_CONFLICT` kr "다른 화면에서 연결 상태가 동시에 바뀌었습니다. 새로 고친 뒤 다시 시도하세요." / en 대응.
- `isStateChanged` 가 `STATE_CHANGED_CODES = ['PAIR_STATE_CHANGED', 'CHANNEL_STATE_CONFLICT']` 를 본다 → 만들기·붙여넣기 실패 시 상태 쿼리 무효화. 주소 바꾸기·해제는 원래 `onSettled` 에서 성공·실패 모두 무효화하므로 같은 처리가 이미 된다(해제는 모달 안 오류, 주소 바꾸기는 강제 버튼을 열지 않음).
- 결과: `merge` 통과, `test:ui` **94 suites / 878 tests 통과**, `build:ui` 성공(기존 source map 경고뿐). 시험: 붙여넣기 1건, 해제·주소 바꾸기 1건(문구 + 상태 재조회 + 강제 버튼 미노출), 모델 판정·두 언어 키.
