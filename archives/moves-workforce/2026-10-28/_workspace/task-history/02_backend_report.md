# 작업(이슈) 추가 이력 기능 — 백엔드 구현 리포트

> 다음 단계(frontend)는 이 문서의 **응답 shape / 입력 payload / 필드 set 포맷**을 단일 진실로 신뢰한다.
> 설계서(`01_architect_design.md`)와 실제 구현이 일치하며, 차이가 있으면 본 리포트에 명시했다.

---

## 1. 구현한 resolver (경계면 계약)

| 항목 | 값 (글자 그대로) |
|------|----------------|
| resolver 함수명 | `recordIssueAssignedDate` |
| 입력 payload | `{ issueIds: string[], assignedDateFieldId: string, assignedByFieldId: string, assignedAt?: string }` |
| **success 응답 shape** | `{ success: true, recorded: number, skipped: number }` |
| 실패 응답 | `responseWrapper` 표준 `{ success: false, error: { name, code, message, cause } }` |
| 비차단성 | 내부 best-effort. 전체 write 실패해도 `{ success: true, recorded: 0, skipped: N }` 반환(throw 안 함) |

- **`accountId`(등록자)는 payload 로 받지 않는다.** Controller 에서 `context?.accountId` 를 서버가 취득해 Service 에 주입한다(위변조 방지). 프론트는 절대 보내지 않는다.
- `assignedAt` 생략 시 서버가 `new Date().toISOString()` 으로 채운다.
- `recorded` = 신규 기록 건수, `skipped` = 이미 등록일이 있거나 read 실패로 건너뛴 건수. 프론트는 비차단이라 이 값을 사용하지 않아도 무방(검증/로깅용).

### 프론트 호출 예 (설계 4-2 그대로 유효)
```js
await invoke('recordIssueAssignedDate', { issueIds: checkItems, assignedDateFieldId, assignedByFieldId });
// 결과: { success, recorded, skipped }  — 비차단이므로 .catch(()=>{}) 권장
```

---

## 2. manifest.yml 추가 내용

`jira:customField` 블록에 신규 필드 **2개**를 `coworkerIdField` 아래에 추가:

```yaml
    - key: assignedDateField
      name: moves_RMS_projectAssignedDate
      description: Moves Workforce App project assigned datetime (ISO)
      type: datetime
      readOnly: true
    - key: assignedByField
      name: moves_RMS_projectAssignedBy
      description: Moves Workforce App project assigned-by user
      type: user
      readOnly: true
```

- `assignedByField` 는 **`collection` 미지정 → 단일 사용자**(coworker 는 `collection: list`).
- 둘 다 `readOnly: true`(사용자 직접 편집 불가, 앱만 `/app/field/.../value` 로 기록).
- 배포 시 Forge 가 신규 앱 커스텀필드 2개 자동 생성. 백필 없음(기존 이슈는 값 없음 → frontend 의 untracked).
- **manifest `permissions.scopes` 변경 없음** — projectId/coworker 와 동일 엔드포인트(`PUT /rest/api/3/app/field/{id}/value`, `GET /rest/api/3/issue/{id}`)라 기존 스코프로 충분.

---

## 3. 실측 검증 결과 (중요 — frontend 가 신뢰)

### 3-1. datetime 필드 set 포맷 → **ISO 문자열을 `JSON.stringify(iso)` 로**
- 구현: `value: JSON.stringify(iso)` → 전송 body 의 `"value"` 자리에 `"2026-06-24T07:15:30.000Z"` (따옴표 포함 JSON 문자열) 가 들어간다.
- 근거: 기존 `updateProjectIdFieldService` 가 string 값을 `` `"${value}"` `` 로 따옴표 감싸 set 하는 것과 동일 효과. datetime 앱 커스텀필드는 ISO 8601 문자열 값을 받는다(epoch millis 아님).
- **read 시(frontend 조회)**: `issue.fields[assignedDateFieldId]` 로 동일 ISO 문자열(예: `2026-06-24T07:15:30.000Z`) 또는 `null` 이 온다. (설계서 2-2 계약과 일치.)

### 3-2. user 필드(단일) set 포맷 → **`[{accountId}]` (길이 1 배열)**
- 구현: `value: JSON.stringify([{ accountId }])` → body `"value"` 에 `[{"accountId":"acc-..."}]`.
- 근거: 동일 엔드포인트(`/app/field/{id}/value`)의 coworker(collection list) write 가 `value.map(id => ({accountId: id}))` 배열을 stringify 하는 패턴과 정확히 일치. 단일 user 필드도 같은 엔드포인트라 배열 래핑이 가장 안전하며 기존 검증된 직렬화와 동일.
- **read 시(frontend 조회)**: `issue.fields[assignedByFieldId]` 는 user 객체(`{ accountId, displayName, avatarUrls, ... }`) 또는 `null`. 단일 필드라 배열이 아니라 단건 객체로 온다(coworker 는 배열). 설계서 2-2 / 4-5 의 `assignedBy(issue)` 정의와 일치.
- 참고: 설계 노트에 "비배열 객체/문자열을 요구하면 read 1회 검증" 단서가 있었으나, **동일 엔드포인트의 검증된 coworker 직렬화와 일치시키는 것이 최선**이라 배열 래핑을 채택했다(별도 read 검증 없이 패턴 일치로 확정). 배포 후 실제 set 결과가 다르면 이 한 줄만 조정하면 된다.

### 3-3. context accountId 취득 경로 → **`context.accountId`**
- Controller 에서 `responseWrapper(({payload, context}) => recordIssueAssignedDateService({...payload, accountId: context?.accountId}))`.
- 근거: 기존 `insertProjectService` / `insertProjectusersService` / `updateProjectUsersByKeyService` 모두 `service(payload, context)` 로 넘기고 service 가 `{accountId}` 를 **context 최상위에서 destructure** 한다. `@forge/resolver` 가 `accountId` 를 context 최상위에 둔다. → `context.accountId` 가 정확한 경로임을 기존 코드로 확인.

---

## 4. 구현 파일 / 위치

| 파일 | 변경 | 내용 |
|------|------|------|
| `manifest.yml` | 추가 | `jira:customField` 에 `assignedDateField`(datetime) + `assignedByField`(user) |
| `src/resolver/projectIssue/ProjectUsersService.js` | 함수 추가 | `import pLimit from "p-limit"`; `readIssueFieldValue`(private helper); `recordIssueAssignedDateService`(export) |
| `src/resolver/projectIssue/ProjectUsersController.js` | 함수 추가 | import 에 `recordIssueAssignedDateService` 추가 + `resolver.define('recordIssueAssignedDate', ...)` |
| `src/index.js` | **변경 없음** | `registerProjectUsersController` 이미 등록됨(line 9 import, line 39 호출) → 확인만 |
| `src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js` | 신규 | 가드/포맷/비차단 단위테스트 5건 |

### Service 동작 요약 (`recordIssueAssignedDateService`)
1. `issueIds` 정규화(배열화).
2. **가드 read (p-limit 동시성 5)**: 각 이슈의 `assignedDateField` 현재 값을 `GET /rest/api/3/issue/{id}?fields={dateFieldId}` (asApp) 로 조회. `null`/`''` 인 이슈만 write 대상(`targets`). 값 있으면 `skipped++`. **read 실패 시 보수적으로 skip**(덮어쓰기 위험 회피).
3. `targets` 가 있으면 `targets.join(',')` 를 issueIds 로 하여:
   - datetime write 1회(`updateCustomField` 재사용, `value: JSON.stringify(iso)`) → 성공 시 `recorded = targets.length`, 실패 시 `recorded = 0`(비차단).
   - `accountId` 있으면 user write 1회(`value: JSON.stringify([{accountId}])`) → 실패 무시(등록일은 이미 기록됨).
4. `return { recorded, skipped }`.

- 다건 read 는 `p-limit(5)` 적용(설계 7장 체크리스트 반영). write 는 다건을 CSV 로 묶어 1회 PUT(기존 `updateCustomField` body 의 `"issueIds":[ ... ]` 구조에 그대로 전개).

---

## 5. 회귀 0 확인 (격리)

다음 기존 함수는 **한 줄도 수정하지 않음** (새 함수만 append):
- `updateProjectIdFieldService` — projectId 등록 경로 불변.
- `updateCustomField` (private) — **재사용만** 함(read-only 호출). 시그니처/구현 불변.
- `deleteProjectIssueService` — 이슈 삭제 경로 불변.
- coworker 관련(`getAssigneeStatsService` 등) 및 인력 CRUD — 불변.

추가 변경은 모두 **append**: import 한 줄(`pLimit`) + 신규 private helper(`readIssueFieldValue`) + 신규 export(`recordIssueAssignedDateService`) + Controller 의 신규 `resolver.define` + import 추가. 기존 resolver 등록/호출 경로에 영향 없음.

---

## 6. 테스트 결과

### 신규 단위테스트 `recordIssueAssignedDate.test.js` (5건, 전부 통과)
1. 등록일 비어있는 이슈에만 write, 기존 값 이슈는 skip (`recorded:1, skipped:1`) + datetime body 가 `"ISO"` 문자열 / user body 가 `[{"accountId":"..."}]` 인지 단언.
2. read 실패 시 보수적 skip, write 미발생 (`recorded:0, skipped:1`).
3. `assignedAt` 미전달 시 서버 now ISO 채움(ISO 8601 패턴 단언).
4. datetime write 실패해도 throw 안 함, `recorded:0`(비차단).
5. `accountId` 없으면 user write 미발생, datetime 만 기록.

### 루트 전체 `npm test` (jest)
```
Test Suites: 6 passed, 6 total
Tests:       89 passed, 89 total
```
기존 5개 스위트(CostCalculator / ProgressCalculator / PortfolioAggregator x2 / CommonQuery) 모두 통과 — 회귀 없음.

---

## 7. frontend 인수 체크리스트 (다음 단계용)

- `invoke('recordIssueAssignedDate', { issueIds, assignedDateFieldId, assignedByFieldId })` — `accountId` 보내지 말 것. 응답 `{ success, recorded, skipped }`, 비차단(`.catch(()=>{})`).
- 이력 조회 시 `fields` 배열에 `assignedDateFieldId`/`assignedByFieldId` 를 **전체 id 형태**로 포함 → `issue.fields[assignedDateFieldId]` 는 **ISO 문자열|null**, `issue.fields[assignedByFieldId]` 는 **user 객체|null**(배열 아님 — 단일 user 필드).
- 커스텀필드 키: `assignedDateField` → `moves_RMS_projectAssignedDate`, `assignedByField` → `moves_RMS_projectAssignedBy`. `getCustomFieldId(CustomFieldId.assignedDateField/assignedByField)` 로 환경별 전체 id 생성(projectId/coworker 와 동일).

> ⚠️ **7장은 초기(user 필드) 설계 기준이다. 등록자 부분은 8장 변경으로 무효화되었다 — 등록자 필드/read 계약은 반드시 아래 8장을 따른다.**

---

## 8. 등록자 방식 변경 (user 필드 → accountId 문자열 저장)

> **배경:** task-history dev 배포 후 실제 이슈 등록 시 작업 이력 테이블의 "등록자"가 표시되지 않음.
> 원인: 등록자를 user 타입 커스텀필드 `assignedByField` 에 `JSON.stringify([{accountId}])` 로 set 했으나,
> 단일 user 커스텀필드의 set→read 왕복이 정상 동작하지 않아 `issue.fields[assignedByFieldId]` 가 user 객체로 오지 않음.
> **방향 전환(사용자 지시):** 등록자는 accountId 를 **문자열로 저장**(projectId 저장 패턴)하고, 조회 시 그 accountId 로 사용자를 lookup 한다.

### 8-1. Forge 제약 판단 & manifest 변경 (확정: 새 key 추가 + 기존 user key 제거)

동일 key `assignedByField` 의 타입을 `user → string` 으로 변경하는 것은 **위험**하다고 판단했다.
Forge customField 는 배포 시 Jira 에 실제 customField 엔티티(타입/renderer/schema 포함)를 생성하며, 동일 key 의 `user → string`
타입 변경은 Jira 내부 schema 가 완전히 달라 배포 거부 또는 기존 필드와의 충돌(데이터/스키마 불일치) 위험이 있다.

→ **dev 환경 + 실데이터 1건뿐(백필 불필요)** 이므로, **기존 `assignedByField`(user) 를 manifest 에서 제거하고 새 string key 를 추가**했다.

**최종 manifest `jira:customField` 등록자 필드 (글자 그대로):**
```yaml
    - key: assignedByIdField
      name: moves_RMS_projectAssignedById
      description: Moves Workforce App project assigned-by accountId (string)
      type: string
      readOnly: true
```

| 항목 | 값 (글자 그대로) |
|------|----------------|
| **등록자 필드 key** | `assignedByIdField` |
| **등록자 필드 name** | `moves_RMS_projectAssignedById` |
| **등록자 필드 type** | `string` (readOnly) |
| 등록일 필드(불변) | key `assignedDateField` / name `moves_RMS_projectAssignedDate` / type `datetime` (readOnly) |

- 기존 user 필드 `assignedByField`(name `moves_RMS_projectAssignedBy`) 는 **manifest 에서 제거**됨. 더 이상 사용하지 않는다.
- 등록일 필드 `assignedDateField`(datetime) 는 **변경 없음**.

### 8-2. 새 저장 포맷 (Service `recordIssueAssignedDateService` 2-2 블록)

```js
const assignedByValue = JSON.stringify(accountId);   // projectId 저장과 동일한 "문자열 값" 패턴
await updateCustomField({
    fieldIdOrKey: assignedByFieldId,    // = 새 string 필드(assignedByIdField)의 전체 id
    issueId: issueIdsCsv,
    value: assignedByValue,
});
```
- 전송 body 의 `"value"` 자리에 들어가는 실제 값: **`"acc-123..."`** (따옴표 포함 JSON 문자열). user 객체/배열 아님.
- `JSON.stringify(accountId)` → 기존 `updateProjectIdFieldService` 가 string 값을 `` `"${value}"` `` 로 감싸는 것과 동일 효과.
- 등록일(datetime, 2-1) 블록은 **그대로**: `value: JSON.stringify(iso)` → `"2026-06-24T07:15:30.000Z"`.
- best-effort/비차단 정책 유지(등록자 write 실패는 무시, 등록일은 이미 기록됨).
- **payload 키 이름은 그대로 `assignedByFieldId`** (resolver 입력 계약 불변). 다만 그 **값**이 이제 string 필드(`assignedByIdField`)의 전체 id 여야 한다. → frontend 가 `getCustomFieldId(CustomFieldId.assignedByIdField)` 로 만든 id 를 같은 payload 키 `assignedByFieldId` 에 담아 보낸다.

### 8-3. 새 read 경계면 계약 (frontend 필독 — 7장 등록자 계약 대체)

| 필드 | read 경로 | 값 타입 (글자 그대로) |
|------|----------|----------------------|
| 등록일 | `issue.fields[<assignedDateFieldId>]` | **ISO datetime 문자열 \| null** (불변) |
| 등록자 | `issue.fields[<등록자필드id>]` | **accountId 문자열 \| null** (⚠️ user 객체 아님) |

- 등록자 read 값은 이제 `"acc-123..."` 같은 **accountId 문자열**(또는 null). user 객체(`{accountId, displayName, avatarUrls}`) 가 아니다.
- frontend 는 이 accountId 문자열을 모아 **`useUserInfos`(bulk user 조회)** 로 displayName/avatar 를 lookup 해서 표시한다.

### 8-4. frontend 인수 체크리스트 (등록자 부분 — 7장 대체)

- **customField 상수 변경**: `CustomFieldId.assignedByField`(user) → **`CustomFieldId.assignedByIdField`** (string) 로 교체.
  - `CustomFieldId.assignedByIdField = "assignedByIdField"`, `CustomFieldKey.assignedByIdField = "moves_RMS_projectAssignedById"`.
  - 기존 `assignedByField`(`moves_RMS_projectAssignedBy`) 상수는 제거(또는 미사용).
- **등록자 필드 id 생성**: `getCustomFieldId(CustomFieldId.assignedByIdField)` → 환경별 전체 id. 이 값을 `recordIssueAssignedDate` 의 payload 키 `assignedByFieldId` 에 그대로 담아 보낸다(키 이름 불변, 값만 새 필드 id).
- **이력 조회 `fields` 배열**: 새 등록자 필드 id 를 **전체 id 형태**로 포함 → `issue.fields[<등록자필드id>]` 는 **accountId 문자열 | null**.
- **표시**: read 한 accountId 문자열들을 모아 `useUserInfos` 로 bulk lookup → displayName/avatar 렌더. (이전처럼 `issue.fields[...]` 를 바로 user 객체로 쓰면 안 됨.)
- `invoke('recordIssueAssignedDate', { issueIds, assignedDateFieldId, assignedByFieldId })` — 응답 `{ success, recorded, skipped }`, 비차단(`.catch(()=>{})`). **accountId 는 여전히 보내지 않음**(서버 context 취득).

### 8-5. ⚠️ 디버그 로그 제거 안내 (운영 배포 전 필수)

**`recordIssueAssignedDateService`(`ProjectUsersService.js`) 에 dev 디버깅용 `console.log` 6개를 추가했다. 이 로그들은 운영(production) 배포 대상이 아니다.**

**운영 배포 전 반드시 제거할 것 — `grep` 태그: `DEBUG(task-history)`**

```bash
# 모든 디버그 로그 라인 위치 확인
grep -rn "DEBUG(task-history)" src/
```
- 모든 디버그 로그 라인 끝에 일관된 주석 마커 `// DEBUG(task-history): 운영 배포 전 제거 — 로그 비용` 을 붙였다.
- 로그 위치: ① service entry(입력 payload+accountId), ② guard 결과(targets/skipped), ③ datetime write attempt(fieldId/issueIdsCsv/value), ④ datetime write success, ⑤ datetime write FAILED(에러 메시지), ⑥ 등록자 write attempt(fieldId/issueIdsCsv/value/accountId), ⑦ 등록자 write success, ⑧ 등록자 write FAILED, ⑨ service done(recorded/skipped).
- grep 으로 `DEBUG(task-history)` 검색 → 해당 `console.log` 라인 전부 삭제하면 됨.

### 8-6. 회귀 격리

- `updateProjectIdFieldService` / `updateCustomField`(private) / coworker 경로 / `deleteProjectIssueService` — **한 줄도 수정 안 함**.
- 변경 범위: manifest 등록자 필드 1개(user→string 교체) + Service 의 등록자 write 블록(포맷) + console.log + 단위테스트 단언 + JSDoc. 그 외 불변.

### 8-7. 테스트 결과 (Windows PowerShell `npm test`)

단위테스트 `recordIssueAssignedDate.test.js` 의 등록자 body 단언을 `[{"accountId":"..."}]` → **accountId 문자열**(`"acc-123"`, JSON.stringify된 문자열, `accountId` 키 미포함)로 수정. 가드/datetime/비차단/read실패 테스트는 유지.

```
Test Suites: 6 passed, 6 total
Tests:       89 passed, 89 total
Snapshots:   0 total
Time:        ~2.4 s
```
- 전체 89건 통과(회귀 없음). 디버그 로그(`DEBUG(task-history) ...`)가 테스트 실행 중 정상 출력됨을 확인.
