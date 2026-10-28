# 워크로그 가시성(visibility) 기반 잠금 — 검증 기록과 구현 방안

> 작성 2026-10-08 · 대상 Jira Cloud REST v3 `PUT /rest/api/3/issue/{issueIdOrKey}/worklog/{id}`
> 관련: `WORKLOG_GOVERNANCE_ANALYSIS.md` §3.3(기간 마감) — 당시 "잠금 사전 차단은 어떤 구조든 불가"로 결론 냈던 항목을 이 문서가 뒤집는다.

## 1. 한 줄 결론

**된다.** 앱이 앱 자격(asApp)으로 워크로그에 `atlassian-addons-project-access` 역할 가시성을 걸면, 그 순간부터 사람은 Jira UI·REST 어디서도 그 워크로그를 **보지도, 고치지도, 지우지도, 풀지도 못한다.** 사이트 관리자도 예외가 아니다. 풀 수 있는 주체는 앱뿐이다.

| 질문 | 답 |
|------|----|
| 가시성이 조회만 막나, 수정·삭제도 막나 | **수정·삭제·해제까지 막는다** (API 문서 명시 + 실측) |
| 사람이 같은 가시성을 걸거나 풀 수 있나 | 못 한다. 역할 비구성원은 400, 앱 역할은 시스템 역할이라 관리자도 명단에 못 들어간다 |
| 그러면 누가 걸고 푸나 | 앱(asApp)만 |
| Postman으로 재현되나 | 앱 역할로는 **안 된다**(그게 정상). 본인이 속한 일반 역할로 걸고 역할 밖 계정으로 확인하면 같은 동작을 볼 수 있다 |

## 2. 근거 — API 문서 원문

OpenAPI 스펙(`swagger-v3.v3.json`)의 GET·PUT·DELETE 세 엔드포인트 **모두**에 같은 권한 조건이 들어 있다.

> If the worklog has visibility restrictions, belongs to the group or has the role visibility is restricted to.

PUT에는 `Edit all worklogs` 조건과 **별도로** 이 줄이 있다. 즉 전체 편집 권한이 있어도 가시성 역할 구성원이 아니면 수정이 거부된다. `visibility` 스키마는 `{ type: "group" | "role", value, identifier }`, 생성·수정 모두 선택 필드. 해제 방법은 문서에 없고 `"visibility": null` PUT이 통용되는 방법이다(구성원 자격으로 200 확인).

## 3. 검증 — 무엇을 어떻게 했고 무엇이 나왔나

### 3.1 실측 결과

| # | 사이트 / 대상 | 요청 | 응답 | 의미 |
|---|---------------|------|------|------|
| 1 | dmove / DS-12 (회사 관리형, 본인=프로젝트 관리자·`Edit all worklogs` 보유, 앱 역할 비구성원) | `POST worklog` + `visibility: role atlassian-addons-project-access` | **400** `commentLevel: 현재 이 프로젝트 역할의 구성원이 아닙니다` | 비구성원은 생성 시에도 못 건다 |
| 2 | tom-chkim-dev / WORK-16 (본인=사이트 관리자) | 기존 워크로그에 같은 `PUT` | **400** 동일 메시지 | 사이트 관리자도 동일. 설정자 자격은 "역할 명단에 있는가"만 본다 |
| 3 | tom-chkim-dev / 프로젝트 역할 10003 | `POST /project/{id}/role/10003 {user:[나]}` | **400** `system role … cannot be changed by users (including admins)` | **앱 역할 명단은 관리자도 못 바꾼다.** 사람이 우회할 길이 없다 |
| 4 | tom-chkim-dev / 그룹 생성 후 그룹 가시성 | `PUT visibility: group wl-visibility-probe` | **400** `GROUP_VISIBILITY_SETTING_NOT_ENABLED` | Jira 기본 설정("코멘트 가시성 = 프로젝트 역할만")에서 그룹 경로는 닫혀 있다. 역할 경로만 쓸 것 |
| 5 | tom-chkim-dev / `Administrators` 역할로 시도 | `PUT visibility: role Administrators` | **400** 비구성원 | 사이트 관리자여도 프로젝트 역할 **명단**에 없으면 비구성원. 무료 플랜은 명단 편집도 불가(`Jira Software 무료 플랜… 역할 작업자를 업데이트할 수 없습니다`) |
| 6 | dmove / RFC-218 (팀 관리형) | `PUT visibility: role Administrators` | **400** `역할 ID: Administrators 가 존재하지 않습니다` | 팀 관리형 역할 이름은 `Administrator`·`Member`·`Viewer`(단수). 프로젝트별 `GET /project/{key}/role`로 이름을 잡아야 한다 |
| 7 | dmove / RFC-218 | `PUT visibility: role Administrator` (본인이 구성원) | **200**, 응답에 `visibility` 포함 | 구성원이면 걸린다. **본인에게는 계속 보인다**(구성원이므로). 숨김은 역할 밖 계정에서만 관측된다 |
| 8 | 전역 역할 목록 `GET /rest/api/3/role` | — | `atlassian-addons-project-access`가 **3개**(10003·10009·10079) | 전역 목록으로 id를 고르면 틀린다. 반드시 `GET /project/{key}/role`의 URL에서 id를 취한다 |
| 9 | tom-chkim-dev / WORK 프로젝트 앱 역할 actors | `GET /project/10201/role/10003` | Moves Workforce 외 Tempo·Automation·Slack 등 설치된 앱 전부 | "앱만 본다"는 정확히는 **"설치된 앱들만 본다"** |

### 3.2 아직 실측 못 한 것 (앱 자격이 있어야 가능)

사람 자격으로는 앱 역할 가시성을 못 걸기 때문에, 아래는 앱 코드(asApp)로 잠근 뒤에만 확인된다. 첫 dev 배포에서 반드시 본다.

1. 잠긴 뒤 **작성자 본인**의 `GET/PUT/DELETE` 응답 코드 (문서상 거부, 404 예상)
2. 잠긴 워크로그가 이슈 `timespent`·`timetracking` 합계에 **포함되는지** — 포함되면 Jira 화면에 합계만 보이고 내역은 없는 상태라 사용자 안내가 필요하고, 빠지면 Jira 시간 추적 수치가 우리 앱과 어긋난다
3. `GET /rest/api/3/worklog/updated`·`deleted`(동기화 스윕)에 잠긴 건이 실리는지 (호출 자격별)
4. 워크로그 이벤트 트리거 페이로드에 `visibility`가 실리는지

### 3.3 Postman으로 직접 확인하는 절차 (사람 자격)

```
# 준비
GET /rest/api/3/myself                                  → 내 accountId
GET /rest/api/3/project/{KEY}/role                      → 역할 이름·id (전역 /role 쓰지 말 것)
GET /rest/api/3/project/{KEY}/role/{roleId}             → actors 에 내가 있는 역할 찾기

# 내가 구성원인 역할로 잠금 (계정 A)
PUT /rest/api/3/issue/{KEY}/worklog/{WL}
{"visibility":{"type":"role","value":"<내가 속한 역할 이름>"}}       → 200

# 역할 밖 계정으로 확인 (계정 B, Basic 인증 교체) — B 가 작성자면 가장 정확
GET    /rest/api/3/issue/{KEY}/worklog/{WL}                           → 404 기대
PUT    /rest/api/3/issue/{KEY}/worklog/{WL} {"timeSpentSeconds":120}  → 404 기대
PUT    /rest/api/3/issue/{KEY}/worklog/{WL} {"visibility":null}       → 404 기대
DELETE /rest/api/3/issue/{KEY}/worklog/{WL}                           → 404 기대
GET    /rest/api/3/issue/{KEY}/worklog                                → 목록에 없음
GET    /rest/api/3/issue/{KEY}?fields=timespent,worklog               → 합계 포함 여부 기록

# 원복 (계정 A)
PUT /rest/api/3/issue/{KEY}/worklog/{WL} {"visibility":null}          → 200
```

주의: 인증은 **Basic(이메일:API 토큰)**. Bearer는 OAuth 2.0 토큰 전용이라 API 토큰에 쓰면 익명 처리돼 `Issue does not exist or you do not have permission` 404가 난다.

## 4. 구현 방안

### 4.1 잠금·해제 함수 (asApp 한 줄)

```js
// src/api/jira/worklog/WorklogLockApi.js
import api, { route } from '@forge/api';

export const LOCK_ROLE = 'atlassian-addons-project-access';

const setVisibility = (issueKey, worklogId, visibility) =>
    api.asApp().requestJira(
        route`/rest/api/3/issue/${issueKey}/worklog/${worklogId}?notifyUsers=false`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility }) },
    );

export const lockWorklog   = (issueKey, id) => setVisibility(issueKey, id, { type: 'role', value: LOCK_ROLE });
export const unlockWorklog = (issueKey, id) => setVisibility(issueKey, id, null);
```

- `asUser`로는 400이다. 반드시 `asApp`. 아키텍처 문서의 asApp 예외 목록에 **⑦ 워크로그 잠금·해제·잠긴 건 읽기/수정/삭제**로 추가한다.
- 기존 스코프 `write:jira-work`로 되므로 **스코프 추가·메이저 버전 없음.**
- 역할은 이름(`value`)으로 지정한다. id는 사이트마다 다르고 같은 이름이 여러 개다.

### 4.2 잠금 시점 (정책 선택)

| 정책 | 동작 | 맞는 요구 |
|------|------|-----------|
| **마감 시 잠금** (권장 1차) | 기간 마감·승인 시 대상 기간 워크로그를 조회해 일괄 `lockWorklog`. 평소에는 Jira에서 자유롭게 기록·수정 | 고객 요구 B-1 승인 후 차단 · B-2 기간 마감 |
| **기록 즉시 잠금** | 우리 앱에서 생성(asUser POST) 직후 응답 id로 `lockWorklog`. Jira UI에서 직접 기록한 건은 워크로그 생성 이벤트 트리거로 받아 잠금 | "우리 앱만 컨트롤" 완전 적용 |

어느 쪽이든 **새 워크로그 기록 자체는 못 막는다.** 가시성은 기존 건의 보호다. 즉시 잠금 정책이면 "기록은 되지만 1초 뒤 Jira에서 사라진다"가 사용자 경험이므로 안내가 필요하다.

### 4.2-1 생성 자체를 막을 수 있나 — 가시성으로는 불가

가시성은 기존 워크로그의 보호다. 생성을 막는 수단은 아래 셋뿐이며 전부 Jira 설정이거나 사후 처리다.

| 수단 | 효과 | 대가 |
|------|------|------|
| 권한 스킴에서 `Work on issues` 회수(고객 관리자) | 사람은 UI·REST 어디서도 못 만든다. 앱만 asApp으로 쓴다 | 작성자가 앱 계정이 된다(작성자 지정 불가). 실제 작성자는 워크로그 `properties`·우리 DB에 보관, `worklogAuthor` JQL·네이티브 리포트 포기. 팀 관리형은 역할 권한에서 "작업 기록" 해제 |
| 시간 추적 제공자 교체(`jira:timeTrackingProvider` 모듈) | 이슈 화면의 네이티브 "작업 기록" 입구가 우리 패널로 바뀐다 | UI 입구만. REST 생성은 그대로. 메이저 버전·관리자 재승인 |
| 워크로그 생성 이벤트 트리거로 즉시 잠금/삭제 | 생성 수 초 뒤 앱이 처리 | 사전 차단이 아니라 사후 처리. 인라인 오류 불가, 안내 필요 |

워크플로 상태 속성 `jira.permission.work.denied`는 상태별 차단이지만 앱까지 막히고 회사 관리형 전용이라 부적합.

**결론**: "우리 앱만 쓰기"를 끝까지 가면 권한 스킴 회수 + asApp 쓰기(작성자=앱). 작성자 신원을 지키려면 생성은 Jira에 두고 **생성 이벤트 즉시 잠금 + 수정·삭제는 앱 대행**이 현실적이다.

### 4.3 잠긴 뒤의 수정·삭제는 앱이 대행

사용자는 Jira에서 못 하므로 우리 화면에서 요청을 받아 resolver가 **정책 판정**(본인 여부·기간 열림·PM/관리자·승인 상태) 후 asApp으로 `PUT`/`DELETE` 한다. 이 판정이 잠금 정책의 본체이며 `guardedDefine` + `principal` 전달 규약을 그대로 따른다. 가드 통과 ≠ 범위 확정이므로 서비스에서 프로젝트 스코프를 다시 본다.

### 4.4 읽기 경로 전환 (가장 큰 작업)

잠긴 워크로그는 **asUser 조회에서 사라진다.** 마이워크·캘린더·대시보드·분석·협업 모드 페처가 전부 영향을 받는다.

1. 워크로그를 읽는 페처를 asApp으로 전환 (`WorklogService` 포함 기능별 전용 페처). asApp 결과 캐시는 본인 자격 캐시와 **키를 분리**한다 (`WorklogService` KVS 키는 사용자 구분이 없다).
2. asApp 결과는 사용자가 Jira에서 볼 수 없는 이슈까지 포함할 수 있으므로, 내려주기 전에 기존 스코프 판정(`ProjectScope`, 협업 모드 `CollabAccess`)으로 한 번 더 거른다. 협업 모드의 "앱 자격 결과를 본인 자격 검증으로 닫는" 패턴과 동일.
3. `CollabWorklogFetcher.isUnrestrictedWorklog`는 `visibility`가 있으면 버린다. **우리 잠금 역할은 통과**시켜야 한다: `!log.visibility || (log.visibility.type === 'role' && log.visibility.value === LOCK_ROLE)`. 다른 역할·그룹 제한은 종전대로 버린다.
4. 프론트에서 `@forge/bridge requestJira`로 직접 워크로그를 읽는 경로(워크로그 추출 등)는 사용자 자격이라 잠긴 건이 빠진다. 해당 화면은 resolver 경유로 바꾸거나 "잠긴 건 제외"를 명시한다.

### 4.5 안전장치

- **전체 해제** 액션을 백오피스에 둔다. 앱을 제거하면 잠긴 워크로그를 **아무도** 못 보고 못 지운다(앱 역할 구성원이 사라지므로). 제거 전 반드시 실행하는 절차로 관리자 매뉴얼에 넣는다. Forge에는 API 호출이 가능한 제거 시점 훅이 없다.
- **다른 앱**: 같은 역할의 설치 앱(Tempo 등)은 잠긴 건을 본다. 사람 차단에는 영향 없음. 고객 안내 문구는 "일반 사용자에게 숨김"으로 쓴다.
- **잠금 대상 기록**: 어떤 워크로그를 언제 누가(정책) 잠갔는지 미러 테이블에 남긴다. 전체 해제·감사·`timespent` 보정의 기준이 된다.
- **멱등**: 이미 잠긴 건에 다시 `lock`을 보내도 200이므로 재시도에 안전하다. 429/5xx는 프로젝트 삭제 큐와 같은 재시도·지연 재투입 패턴을 쓴다.

### 4.6 배포 전 확인 순서

1. `WorklogLockApi` 추가 → dev 배포 → 테스트 이슈 워크로그 1건 `lock`
2. 작성자 계정으로 §3.3 B 절차 실행, `timespent` 포함 여부 기록 (§3.2 1·2 해소)
3. `unlock` → 200, 작성자에게 다시 보이는지 확인
4. 읽기 경로 전환 뒤 마이워크·캘린더·대시보드에서 잠긴 건이 **보이고**, 스코프 밖 사용자에게는 **안 보이는지** 확인

## 5. 작업 중 발생한 부수 사항 (정리 필요)

- **dmove / WORK-16 아님, tom-chkim-dev / WORK-16**: 검증 스크립트가 역할 추가 실패 뒤 멈추지 않고 진행돼 **워크로그 22578(작성자 Callie, 60초, 2026-05-26 생성)을 삭제**했다. 이슈 `timespent` 206100 → 206040. 작성자 계정이 아니라 원본 복원은 불가, 원래 `started` 값은 남아 있지 않다.
- **`moves-rms` dev 환경에 버전 7.0.0 배포됨**: 임시 웹트리거(`wl-visibility-probe`)가 포함돼 Runs on Atlassian 비적격 상태. 사이트 설치는 업그레이드하지 않아 tom-chkim-dev는 버전 6으로 동작 중. 로컬 소스는 원복 완료. 환경을 되돌리려면 원래 manifest로 `forge deploy -e moves-rms` 한 번 필요.
- **웹트리거 모듈 추가 = 메이저 버전**: `forge lint`가 "Change due to RoA trust signal loss"로 `MAJOR_VERSION_RULE` 승인을 요구했다. 제품에 웹트리거를 넣을 계획이 있으면 apiRoute와 같은 비용(메이저 + 고객 관리자 재승인)으로 본다.
- `custom-scopes.yaml`(apiRoute 조사용)과 이 문서는 모두 미추적 파일이다.
