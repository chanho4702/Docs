# 워크로그 승인 잠금 및 프로퍼티 검증 가이드

기준일: 2026-10-14 · 현재 소스 기준 · 아래 예시는 실사이트 조회 결과가 아님

**같은 worklogId로 Jira 기록, Approval 승인 이력, 작성자 프로퍼티, Workforce 표시를 대조합니다. 프로퍼티에 APPROVED가 보이는 것만으로 잠금이나 서명 검증에 합격한 것은 아닙니다.**

## 1 시험 준비

시험 프로젝트와 작성자 A, 팀장 B, 다른 팀 사용자 C를 준비합니다. 사이트·환경·두 앱 배포/설치 버전, 시험 일시, 시간대, 이슈 ID/key, A/B accountId를 기록합니다. 원본 이력 확인용 기록과 삭제 시험용 기록은 분리합니다.

1. Workforce 연동과 신뢰 키, Approval의 수신 검증 상태를 확인합니다.
2. A의 팀·기본 승인자가 B인지 확인합니다. 팀장 본인 승인 허용은 현재 구현의 예외이므로 고객 정책과 맞는지 별도 판정합니다.
3. 마감 전 기간에서 2시간 기록을 만들고 worklogId와 요청 ID를 적습니다. 직접 REST 차단 시험은 승인 전 정상 호출부터 확인합니다.
4. 통제 설정·readiness와 진단 결과를 저장합니다. 공개 범위 제한을 사용할 경우 실제 프로젝트에서 앱 전용 역할 제한이 작동해야 합니다.
5. 기본 UI·Approval·Workforce·REST·자동화를 각각 시험 대상으로 기록합니다. 이번 가이드 자체는 시험 실행 결과지가 아닙니다.

## 2 브라우저에서 실제 값 조회

Jira에 로그인한 브라우저에서 사이트 주소 뒤에 다음 경로를 붙여 새 탭으로 엽니다. 중괄호는 실제 값으로 바꾸고 accountId는 URL 인코딩합니다. 프로퍼티 응답은 대체로 `{ "key": "...", "value": ... }`이며 **저장 데이터는 value 아래**입니다.

| 확인 대상 | GET 경로 |
|---|---|
| 로그인 계정 | `/rest/api/3/myself` → `accountId` |
| 기록 ID | `/rest/api/3/issue/{issueKey}/worklog` → `worklogs[].id` (목록 페이지 확인) |
| 팀·팀장 | `/rest/api/3/user/properties/movesRms.org?accountId={A}` |
| 프로젝트 연동 정책 | `/rest/api/3/project/{projectId}/properties/movesRms.policy` |
| 이슈 작성 기간·승인 설정 | `/rest/api/3/issue/{issueKey}/properties/movesRms.issue` |
| 프로젝트 통제 규칙 | `/rest/api/3/project/{projectId}/properties/movesApproval.ctl` |
| 이슈 통제 규칙 | `/rest/api/3/issue/{issueKey}/properties/movesApproval.ctl` |
| 월별 건별 승인 결과 | `/rest/api/3/user/properties/movesApproval.cert.2026-10?accountId={A}` |
| 기간별 타임시트 승인·잠금 | `/rest/api/3/user/properties/movesApproval.2026?accountId={A}` |
| Workforce 작성 출처 | `/rest/api/3/issue/{issueKey}/worklog/{worklogId}/properties/movesRms.origin` |
| Approval 작성 출처 | `/rest/api/3/issue/{issueKey}/worklog/{worklogId}/properties/movesApproval.origin` |
| 앱 통제 작업 식별자 | `/rest/api/3/issue/{issueKey}/worklog/{worklogId}/properties/movesApproval.op` |
| Jira 원본·공개 범위 | `/rest/api/3/issue/{issueKey}/worklog/{worklogId}` → `timeSpentSeconds`, `started`, `visibility` |

**월별 승인 결과는 팀장 B가 아니라 작성자 A의 사용자 프로퍼티에 있습니다.** 날짜는 실제 시험 월로 바꿉니다. 이슈별 통제 프로퍼티가 없으면 프로젝트 문서와 적용 범위를 함께 확인합니다. 조건에 따라 게시하지 않는 문서도 있으므로 404를 승인 실패로 단정하지 않습니다.

다른 사용자의 사용자 프로퍼티 조회에는 Jira 관리자 권한이 필요할 수 있습니다. 앱 전용 공개 범위로 제한된 워크로그는 일반 사용자뿐 아니라 제한 역할 밖의 관리자에게도 직접 조회되지 않을 수 있습니다. 이 경우 공개 범위를 풀지 말고 앱의 권한 있는 상세·진단으로 원본 존재를 확인합니다. [사용자 프로퍼티 API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-properties/), [워크로그 프로퍼티 API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklog-properties/)

## 3 어떤 값이 있어야 하는가

### 팀과 이슈 설정

| 프로퍼티 | 확인할 값 | 의미 |
|---|---|---|
| `movesRms.org` | `teamKey`, `teamName`, `leaderKeys`, `leads[].memberKeys`, `rev` | 팀원 A의 승인자 후보에 B가 연결되는지, B의 팀원 범위에 A가 있는지 확인 |
| `movesRms.policy` | `values`, `locks`, `ctl`, `rev` | 적용 정책과 고정 항목. `ctl`은 `ALL_ISSUES` 또는 `NONE` |
| `movesRms.issue` | `s`, `e` | 작성 가능 시작·종료 날짜, 예: `2026-10-01`, `2026-10-31` |
| 같은 문서 | `wa.autoRequest`, `wa.lockApproved`, `wa.closeDays` | 예: `true`, `true`, `5`. 자동 요청·승인분 잠금·마감 유예일. `closeDays:0`은 자동 마감 없음 |
| 같은 문서 | `pa`, `fl`, `by`, `rev` | 사전 승인 설정, 결재선, 설정자, 개정. 사전 승인과 작성 후 승인을 혼동하지 않음 |

위 값은 서명된 문서 본문 필드입니다. 실제 응답의 봉투 구조를 확인해 읽고, 키·서명·사이트·대상·revision 검증 결과도 앱에서 함께 확인합니다.

### 통제 규칙 movesApproval.ctl

`value`에 `kid`, `iat`, `sig`와 다음 값이 함께 들어갑니다. `kid`는 키 식별자, `iat`는 발행 시각, `sig`는 서명입니다. 값이 존재하는 것과 서명 유효 판정은 다릅니다.

| 경로 | 확인 내용 |
|---|---|
| `value.ch` | 현재 게시값은 `APP`. 이 값만으로 Workforce 입력 불가라고 판단하지 않음 |
| `value.wr` | 최신 Workforce 저장 판정용 규칙. 없거나 만료·불량이면 저장하지 않고 Approval로 연결하는지 확인 |
| `value.tz` | 정책 시간대, 예: `Asia/Seoul` |
| `value.vs`, `value.vt` | 공개 범위 적용 정책과 대상 역할/그룹. 실제 워크로그 visibility와 별도 확인 |
| `value.wr.v`, `value.wr.exp` | 규칙 버전과 만료 시각(epoch ms) |
| `value.wr.acd`, `value.wr.ls` | 자동 마감 일수와 제출 기간 잠금 여부 |
| `value.wr.r` | `pd` 과거일 제한, `fa` 미래일 허용, `cw/ew/xw` 생성/수정/삭제 기간, `dm/wm` 일/주 시간 상한(초) |
| `value.wr.va`, `value.wr.pq` | 위반 처리 `WARN/BLOCK`, 사전 승인 필요 여부 |
| `value.wr.cr` | `[시작epoch ms, 종료epoch ms, "C" 또는 "R"]` 배열. C=마감, R=재개방 |
| `value.wr.hz`, `value.wr.ix`, `value.wr.ixa` | 판정 가능 기간 하한, 이슈 예외 목록, 예외 전체를 처리할 수 없다는 표식 |

**이슈 설정의 `movesRms.issue.wa`는 유효하지만 통제 문서의 옛 `movesApproval.ctl.wa`는 최신 게시에서 제거됐습니다.** 최신 구현은 `wr`를 사용합니다. 문서 상단의 오래된 주석보다 `WorklogControlCtl.bodyFor`와 `writeRulesOf`의 실제 반환값을 기준으로 합니다.

### 월별 승인 결과 movesApproval.cert.2026-10

`value.v`는 `2`, `value.kind`는 `movesApproval.certification`, `value.accountId`는 A, `value.periodKey`는 `2026-10`입니다. 서명된 `value.entry` 안에 인증 합계와 건별 승인 목록이 있습니다.

실제 소스가 만드는 `value.entry.approval.entries[]`는 다음 순서의 배열입니다.

```text
[worklogId, status, requestId, approvedBy, approvedAt,
 origin, fingerprint, approvedSeconds, started, closeAt]
```

2시간 승인 건의 **설명용 예시**입니다. 시각·식별자·지문은 실제 응답과 대조하며 이 예시를 PUT하지 않습니다.

```json
["24586", "APPROVED", "<요청 UUID>", "<팀장 B accountId>", 1791939600000,
 "WORKFORCE", "<실제 지문>", 7200, 1791853200000, null]
```

| 확인값 | 합격 기준 |
|---|---|
| 배열 0~4번 | 동일 worklogId, `APPROVED`, 동일 요청 ID, 실제 승인자 B, 승인 시각 |
| 배열 5번 | 입력 출처. Workforce 정상 출처 예시는 `WORKFORCE`; Approval은 `APP` |
| 배열 7번 | 승인된 시간 `7200`초. 승인 전 상태에서는 같은 칸에 현재 스냅샷 시간이 들어갈 수 있으므로 반드시 status와 같이 해석 |
| 배열 8~9번 | 작업 시작 시각, 해당 기록의 마감 시각. `null`인 마감을 임의로 월말로 해석하지 않음 |
| `entry.w` | 인증 건별 `[worklogId, 집계초, 선택적 flags]`; flags는 변경=1, 삭제=2, 본인 인증=4 비트 |
| `entry.cs/cn/mn/dn` | 인증 시간 합계/건수/변경 불일치 건수/삭제 건수 |
| `entry.wt`, `entry.approval.truncated` | true이면 목록이 잘림. 목록에 없는 기록을 미승인 또는 승인으로 단정하지 않음 |

게시에는 큐·재시도가 있어 지연될 수 있습니다. 승인 원장 결정 시각과 프로퍼티 `updatedAt`을 각각 기록하고 게시 성공 후 대조합니다. 지연 중에도 Approval 서버의 잠금은 유지돼야 합니다.

### 기간 결과와 실제 잠금

`movesApproval.2026`은 `value.periods["2026-10"]` 등 기간 키별로 `st`(기간 상태), `cl`(마감 여부), `lk`(잠금 사유), `rq`(요청 ID), `ps/pe`(기간 경계), `at`(결정 시각)를 싣습니다. 주 단위 정책이면 `2026-W42` 같은 키를 사용합니다. 건별 승인만 했고 기간 제출·마감 이력이 없다면 이 문서가 없을 수 있습니다.

공개 범위 제한의 기본 적용 형태는 워크로그 본문의 다음 값입니다. **별도 프로퍼티가 아닙니다.** 다른 대상 그룹/역할을 설정했다면 설정값과 대조합니다.

```json
{"visibility":{"type":"role","value":"atlassian-addons-project-access"}}
```

`movesApproval.origin`과 `movesApproval.op`의 값은 `{"op":"<UUID>"}`입니다. origin은 작성 의도, op는 통제 작업과 연결하는 식별자이며 승인 상태가 아닙니다. Approval DB의 대응 행까지 일치해야 합니다. Workforce origin은 별도 서명 봉투이며 `body`에 `cloudId`, `issueId`, `authorId`, `op`, `started`, `seconds`, `iat`, `exp`가 들어갑니다.

## 4 필수 수용 시험

| ID | 행동 | 합격 기준과 보관 증거 |
|---|---|---|
| T01 | A가 열린 기간에 2시간 생성, 3시간 수정, 다시 2시간 수정 | Jira·앱 시간이 일치. 변경 이력의 7200→10800→7200, 작업자·시각 확인 |
| T02 | A가 B에게 요청, B 승인 | 승인자·시각·작업일·7200초가 승인 상세와 월 프로퍼티에 일치 |
| T03 | B가 같은 팀 기록 여러 건 일괄 승인 | 건별 결정 이력, 성공·실패 건수 일치. 경합/권한 실패가 다른 건을 덮어쓰지 않음 |
| T04 | C 또는 비팀장 지정 결재자가 일괄 승인 시도 | 팀장 전용 요구라면 거부돼야 함. 현재 일반 bulkApprove는 지정 결재자 기준이므로 보완 후 재시험 필요 |
| T05 | 승인 직후 A가 앱·Workforce에서 수정/삭제 | 서버 거부. 게시 대기 중에도 Approval에서 수정 불가. 원본 및 확정 시간 불변 |
| T06 | 기간 마감 뒤 추가·수정·삭제·열린 기간으로 이동 | 전부 거부. 건별 승인 시험과 분리. 자동 마감 경계 직전/정각도 검사 |
| T07 | A의 Jira REST로 승인 기록 수정·삭제·visibility 해제 | 거부되고 원본 유지. 400/401/429/5xx는 차단 성공 아님. 404는 앱에서 존재 확인 후 해석 |
| T08 | A의 Jira REST·자동화로 마감 기간 신규 기록 생성 | 생성 전 차단 여부 확인. 생성 후 감지·숨김·삭제라면 ‘추가 사전 차단’ 요구 미충족으로 기록 |
| T09 | 별도 미승인 기록 생성→2회 수정→삭제 | CREATED/UPDATED/DELETED 이력과 UPDATED 2건 확인. 시스템 통제 이벤트와 사용자 수정 횟수 구분 |
| T10 | 다른 팀/이슈 열람권 없는 계정으로 이력 조회 | 본문·합계·내보내기에 권한 밖 자료가 노출되지 않음 |
| T11 | 시험 권한으로 승인 원본 외부 변경 | 확정 7200초 유지와 변경 관찰 확인. 원문이 실제로 바뀌었다면 강제 잠금 시험은 실패로 남김 |
| T12 | 감사 내보내기와 용량 확인 | 대상 기간·건수·결정자·시간 일치. 보호 원장은 정리되지 않음. 보존 기간 충족 여부 별도 산정 |

T07의 정확한 PUT/DELETE 본문과 공개 범위 해제 우회 시험은 [잠금 검증 절차](cloudjira--LOCK_VERIFICATION.md)의 직접 Jira 경로를 사용합니다. 그 문서의 권한 스킴 방식과 현재 개발 사이트의 공개 범위 제한 방식은 구분해 결과에 기록합니다. 운영 데이터로 삭제 시험을 하지 않습니다.

## 5 감사 원본 확인과 결과 기록

승인 상세·승인 관리·기록 화면에서 요청 ID와 worklogId로 대조하고 내보내기 파일을 보관합니다. SQL/KVS는 브라우저 Jira REST로 직접 조회할 수 없습니다. 프로퍼티에는 전체 변경 이력이나 모든 감사 정보가 들어 있지 않습니다.

개발 확인 시 `worklog_history`의 `worklog_id`, `seq`, `kind`, `actor_account`, `changed_at`, `observed_at`, `before_seconds`, `after_seconds`, `before_started`, `after_started`를 대조합니다. 저장상의 actor `=`는 작성자와 동일하다는 압축 표식이며 API는 실제 계정 ID로 풉니다. actor가 null이면 알 수 없는 행위자로 남깁니다. `seq` 자체를 수정 횟수로 쓰지 않고 UPDATED 건수를 확인합니다. 설명은 저장 정책에 따라 지문/일부/원문 범위가 달라집니다.

결과는 다음 형식으로 채웁니다. 미실행을 합격으로 표시하지 않습니다.

```text
시험 ID / 실행 시각 / 사이트·환경·버전 / 실제 실행 계정·역할
이슈 ID / worklogId / requestId / 설정 및 마감 시각
요청 경로 / HTTP 또는 resolver 오류 코드
변경 전후 값 / 승인 원장 / 프로퍼티 반영 시각 / 화면·파일 증거
판정: 합격·실패·미검증 / 담당자 / 재시험 항목
```

검증 완료는 **기능 동작 + 팀장 전용 권한 + 직접 경로 잠금 + 감사 증빙 + 보존 규모**를 모두 확인한 상태입니다. 현재 문서의 예시 값이나 기존 개발 사이트의 일부 확인만으로 고객 수용 완료를 선언하지 않습니다.

## 구현 근거

- 월 문서와 배열 순서: `src/integration/workforce/certificationDoc.js`, `src/resolver/workforce/WorkforcePublisher.js:368`
- 통제 규칙: `src/resolver/worklogControl/WorklogControlCtl.js`, `src/domain/worklogControl/writeRules.js`
- 출처·공개 범위: `src/domain/worklogControl/origin.js`, `src/domain/worklogControl/visibility.js`
- 일괄 승인 권한: `src/permission/PermissionMap.js:130`, `src/resolver/approval/ApprovalService.js:841`
- 변경 이력과 수정 횟수: `src/resolver/worklogHistory/WorklogHistoryRepository.js`
