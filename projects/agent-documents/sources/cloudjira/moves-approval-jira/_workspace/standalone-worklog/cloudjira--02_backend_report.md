# 02 backend report — standalone-worklog (서버, 요구 1–5)

> 2026-10-21 · 1회차 · backend-engineer. 커밋·forge·docs·static/ui·locales 손대지 않음.

## 재작업 기록

- **2회차 (2026-10-21, 리더 결정 반영)**: 리더가 D1 을 연동 모드와 같게 바꿨다. 단독 모드에서도 **명부 LEAD 이면 위 단계 팀장이 있어도 본인 지정·결재를 허용**한다.
  팀원은 계속 거부하고, 조회가 실패해도 거부한다. 기본 승인자(미지정 수동 요청·자동 요청)는 그대로 위 단계 팀장이 우선이고, 위 단계 팀장이 없을 때만 본인이다.
  코드(`eligibility.js`·`selfApproval.js`·`WorklogRequestService.selfApproval`)는 리더가 직접 고쳤다. 나는 그 규칙에 맞춰 테스트·describe 이름만 고쳤다(코드 동작은 그대로).
  자동 요청은 위 단계 팀장이 있으면 `selfApproval` 을 부르지 않는다(LEAD 팀 SQL 생략).
  1회차 맨 위에 적었던 "D1 문구 불일치" 항목은 이 결정으로 해소됐다.

## 바뀐 파일

| 파일 | 내용 |
|---|---|
| `src/domain/worklogCertification/eligibility.js` | `worklogSelfApprovalOf` 에 단독 분기 추가(인자 `isRosterTeamLead`·`rosterKnown`, 생략 시 거부), 사유 상수 `SelfApprovalReason`. 연동 분기는 그대로 |
| `src/resolver/worklogCertification/selfApproval.js` (신규) | `resolveWorklogSelfApproval` — 판정 재료 수집을 한 곳에서. 연동: `workforce.identityOf`. 단독: `teamScope.ledTeams`(LEAD 팀) 하나. 예외가 나면 `ROSTER_UNAVAILABLE`(거부) |
| `src/resolver/worklogCertification/WorklogRequestService.js` | `selfApproval` 을 위 helper 로 교체(자동 요청은 위 단계 팀장이 없을 때만 판정), `rosterIdentity` 신설·`identity` 단독 분기, 트리거 경로 `createRequest` 가 null 이면 `STORAGE_NOT_READY` |
| `src/resolver/approval/target/WorklogCertificationTargetAdapter.js` | `beforeDecide` 자기 결정 검사를 같은 helper 로 교체. 단독이면 `TeamScope`(지연 require, 주입 `teams`)를 쓴다 |
| 테스트 | `eligibility.test.js`(재작성 + 단독 3건), `selfApproval.test.js`(신규 5건), `WorklogRequestService.test.js`(D1 9건·D2 4건, fixture 에 `led`·`memberTeam`), `WorklogCertification.test.js`(단독 자기 결정 1건), `ApprovalRepository.test.js`(시스템 요청 알림 1건) |

SQL 마이그레이션 없음 · manifest 변경 없음 · 새 resolver 없음(PermissionMap·CONTROLLER_REGISTRARS 변경 없음) · asApp 새 호출 없음.

## 자기 승인 판정표

판정 원천: `worklogSelfApprovalOf` (순수) ← `resolveWorklogSelfApproval` (재료). 후보(`candidates`/`get`)·수동 요청(`create`, 저장 시 `approverId` 포함)·자동 요청(`requestAutomatically`, 트리거·리컨실)·결정(`beforeDecide`) 모두 이 함수를 쓴다.

| 모드 | 조건 | allowed | reason |
|---|---|---|---|
| LINKED | 미연결 이슈 | false | `ISSUE_NOT_LINKED` |
| LINKED | 연결 이슈, Workforce 팀장 아님(또는 STALE·조회 실패) | false | `NOT_WORKFORCE_TEAM_LEAD` |
| LINKED | 연결 이슈, 서명 검증·신선한 Workforce 팀장 (상위 팀장 유무 무관) | **true** | null |
| STANDALONE | 명부 조회 실패(ledTeams 예외·명부 없음) | false | `ROSTER_UNAVAILABLE` |
| STANDALONE | 활성 팀 LEAD 아님(팀원·무소속, 팀장이 없어도) | false | `NOT_ROSTER_TEAM_LEAD` |
| STANDALONE | 활성 팀 LEAD (위 단계 팀장 유무 무관 — 연동과 같음) | **true** | null |

STANDALONE = `ChannelState.isLinked()` 가 false (스위치 끔, **또는 스위치 켬 + 미페어링 = 연결 대기, D3**). 정책 해석기와 `WorkforceOrgSource` 가 이미 같은 판정을 쓴다.
`reason` 은 지금 응답에 싣지 않는다(서버 내부). 화면은 `selfApprovalAllowed` boolean 만 받는다.

기본 승인자 규칙(두 모드 공통, 변경 없음): 위 단계 팀장이 있으면 그 사람들만, 없고 자기 승인이 허용되면 본인, 둘 다 아니면 없음 → `needsApprover:true` / 자동 요청 `NEEDS_APPROVER`.
후보 목록에 본인은 `selfApprovalAllowed` 가 true 일 때만 들어간다. 그래서 위 단계 팀장 B 가 있는 팀장은 기본 승인자가 `[B]` 이지만, 후보에 본인도 있고 본인을 직접 지정할 수 있다.

## resolver 응답 shape (화면이 쓸 것)

### `getWorklogApprovalIdentity` (SELF, 변경)

연동 모드(VERIFIED·NONE 등)는 **변경 없음**. 단독 모드(연결 대기 포함)는 아래와 같다. 키 집합은 연동 응답과 같다.

```json
{
  "status": "ROSTER",
  "team": { "teamKey": "t1", "displayName": "개발팀" },
  "leaders": [{ "accountId": "L", "displayName": "L 이름", "avatarUrl": null }],
  "isWorkforceTeamLead": false,
  "ledTeams": [{ "teamKey": "t1", "displayName": "개발팀" }],
  "selfApprovalAllowed": false
}
```

- `team`: 내가 MEMBER 인 활성 팀. 그런 팀이 없고 내가 LEAD 인 팀이 있으면 첫 LEAD 팀. 둘 다 없으면 `null`.
- `leaders`: 기본 승인자 = `upperLeadsOf`(내가 MEMBER 인 팀의 LEAD, 본인 제외). 표시 정보를 못 읽은 사람은 빠진다(연동 응답과 같다).
- `ledTeams`: 내가 LEAD 인 활성 팀.
- `selfApprovalAllowed`: 위 판정표 D1.
- `isWorkforceTeamLead`: 단독은 항상 false.
- 명부 조회 실패: `{"status":"ROSTER_UNAVAILABLE","team":null,"leaders":[],"isWorkforceTeamLead":false,"ledTeams":[],"selfApprovalAllowed":false}` (resolver 는 성공으로 응답한다).
- 화면 주의: 지금 `WorklogApprovalModeContext` 는 `status==='VERIFIED'` 일 때만 팀·팀장을 보여 주고 `linked && !pending` 일 때만 조회한다. 단독에서도 보여 주려면 조회 조건을 풀고 `'ROSTER'` 도 표시 대상으로 해야 한다.
- 팀원인데 `leaders` 가 비었고 `selfApprovalAllowed:false` 이면 "기본 승인자 없음 → 저장 시 승인자 선택"으로 안내하면 된다.

### `getWorklogCertification` (`get`) / `listWorklogApprovalCandidates` (`candidates`) — 키 변경 없음

`selfApprovalAllowed`·`defaultApproverIds`·`approvers`(=users)·`needsApprover`·`scope:{mode,eligible,reason}` 의 키는 그대로다. 단독 모드에서 값이 D1 판정을 따르도록 바뀌었을 뿐이다.
단독 최상위 팀장: `selfApprovalAllowed:true, defaultApproverIds:[본인], needsApprover:false`, 후보 `users` 에 본인이 포함된다.

### 저장 응답 `approval` (createWorklog) — 키 변경 없음

`approverId` 를 주면 `create` 경로, 주지 않으면 `requestAutomatically` 경로를 탄다. `NEEDS_APPROVER` 를 받은 뒤 승인자를 골라 다시 요청하는 흐름은 기존 `requestWorklogApproval`(create) 로 하면 된다.

## 요구 3 — 팀 수 (변경 없음, 이미 있음)

`getFeatureOverview` (`{admin:true}`) 가 이미 활성 팀 수를 준다. KVS 1회 + SQL COUNT 최대 2회(그중 팀 COUNT 1회), 실패한 값만 null.

```json
{ "projects": { "configured": false, "enabledCount": null }, "teams": { "enabledCount": 0 } }
```

`teams.enabledCount === 0` 이면 "팀 0개" 경고를 띄우면 된다(`null` = 모름 → 경고하지 않음). 새 SQL·새 키를 만들지 않았다. resolver 경로라 유휴 SQL 예산에는 영향이 없다.
"기본 승인자 미정 기록 수"는 새 집계 쿼리가 필요해서 만들지 않았다(**보류**). 사용자 한 명 기준 미정 여부는 identity 응답(`leaders` 빈 배열 ∧ `selfApprovalAllowed:false`)으로 알 수 있다.

## 요구 4 — 트리거 재요청 알림 (확인함, 누락 없음)

- 경로: `WorklogControlDetector.handle` → `requestAutomatically({raw,projectId})` (request 없음) → `submit` → `requestRepo.createRequest({..., systemRequested:true})`.
- `ApprovalRepository.createRequestLive` 는 LIVE 커밋 뒤에 `steps[0].approverKeys ∪ cc` 에게 `approval_notification`(IN_APP, kind REQUESTED) 행을 넣는다. `systemRequested` 와 상관없다. 수동 경로(`engine.createForTarget`)도 같은 저장소 함수를 부르므로 두 경로의 알림이 같다.
- 워크로그 어댑터에는 `notifyExternal`(Jira 코멘트) 훅이 없다. 그래서 수동 경로도 외부 알림이 없고, 두 경로가 비대칭이 아니다.
- 고정 테스트: `ApprovalRepository.test.js` "시스템 요청(트리거 자동 접수, systemRequested)도 1단계 결재자에게 앱 내 알림 행을 넣는다", `WorklogRequestService.test.js` "자동 접수(트리거 경로) ... createRequest 가 넣는다".
- 함께 고친 것: 테이블 미준비면 `createRequest` 가 `null` 을 돌려주는데, 그동안 `result.requestId` 에서 TypeError 가 났다 → 이제 `STORAGE_NOT_READY`(리컨실이 다시 시도). 테스트 1건.

## 요구 5 — 저장 시 승인자 지정 (확인함)

`WorklogService.createWorklog` 가 `payload.approverId` 를 받으면 `worklogRequests.create(...)` 로 간다. 단독 모드에서 이 경로의 검사:
1. 작성자 본인 기록인지 확인(`WORKLOG_NOT_OWNER`), 승인 범위(단독은 항상 eligible), 정상 입력 증명(`WORKLOG_ORIGIN_UNPROVEN`), 기간 잠금, 이미 승인된 기록인지.
2. 자기 지정: D1 판정(위 표). 팀장은 위 단계 팀장이 있어도 허용되고, 팀원은 `INVALID_APPROVER_CONFIGURATION` 으로 거부된다. 테스트로 고정.
3. 이슈 열람: `targetAdapter.userCanView(target, selected)` 가 false 면 `APPROVER_NO_ACCESS`. 테스트로 고정.
4. `engine.assertApproversAllowed(..., {skipRegistry:true})`: 결재자 명부 밖 사용자도 허용한다. 후보 목록이 디렉터리 검색 결과를 포함하는 것과 같은 범위다(기존 설계 그대로, "팀장이 없어도 직접 고른 승인자" 테스트).
5. 결정 시점에도 `beforeDecide` 가 같은 D1 판정을 다시 한다. 요청 뒤 팀이 바뀌면 자기 결정은 `APPROVER_NOT_ELIGIBLE` 이 된다.

참고: "후보 범위"는 명부 팀장으로 제한하지 않는다. 이슈를 볼 수 있는 사람이면 누구든 지정할 수 있다(기존 동작).

## 새 오류 코드·i18n

새 오류 코드 없음. 화면이 다뤄야 할 새 **상태 값**:
- identity `status: 'ROSTER'` — 표시 대상(연동의 VERIFIED 와 같게).
- identity `status: 'ROSTER_UNAVAILABLE'` — "팀 명부를 읽지 못함" 안내용 문구 키가 필요하다(예: `worklogApprovalFlow.settings.identity.rosterUnavailable`, kr·en).
- 단독용 `selfAllowed`·`selfDenied` 문구는 "Workforce 팀장" 표현을 빼야 한다. 단독 거부 사유는 "팀장 아님"(또는 명부 조회 실패)뿐이고 응답에 사유를 싣지 않으므로 문구 하나로 충분하다.

## 테스트

- `npx jest` (리포 루트): 2회차 **Test Suites 200 passed · Tests 3,009 passed** (기준 2,986 → +23, 실패 0. 1회차는 3,010). 계약 테스트(permissionMap·featureGateScope)와 `idleSqlBudget.test.js` 도 통과.
- 유휴 SQL: 스케줄 경로 변경 없음. 이벤트가 있을 때 단독 모드 자동 요청에서 위 단계 팀장이 비어 있는 경우에만 `findLeadScope` 가 1~2 SQL 더 나간다(무팀장 팀원·최상위 팀장 기록만 해당). identity 조회는 명부 SQL 3~5회(memberTeam·upperLeads·leadScope, resolver 경로).

## 미검증

- 실제 사이트에서의 동작(단독 모드 팀장 본인 결재 화면 흐름, 업무함 알림 표시)은 배포 뒤 확인해야 한다. forge 를 실행하지 않았다.
- `loadUsers` 가 표시 정보를 돌려주지 않은 팀장은 `leaders` 에서 빠진다(연동 응답과 같은 정책). 화면에 "기본 승인자 없음"으로 보일 수 있다.

## 발견 (범위 밖, 고치지 않음)

- `ApprovalRepository.createRequestLive` 의 앱 내 알림 삽입에 라이선스 확인이 없다(`createNotificationsBestEffort` 만 확인한다). 수동·자동 두 경로가 똑같이 이렇다. "알림 생성만 막는다" 규칙과 맞는지 확인이 필요하다.
- identity 의 `rosterIdentity` 는 `memberTeamOf` 와 `upperLeadsOf` 가 같은 `findMemberTeam` 을 각각 부른다(SQL 중복 1~2회). TeamScope 단일 출처를 지키려고 그대로 두었다.
