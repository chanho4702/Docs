# 02 백엔드 보고서 — operating-mode §8 (기본값 꺼짐 + 판정 단일화)

작성: 2026-10-12 backend-engineer · 회차 1 · 범위: 설계서 §8 만 (`static/ui`·`locales` 무변경)

## 결과 요약
- `DEFAULT_APPROVAL_SETTINGS.workforceLinkEnabled = false` (기본 꺼짐 — 연동은 관리자의 명시적 선택).
- 단일 판정 `SettingsRepository.isWorkforceLinkEnabled()` 추가, KVS 를 직접 읽던 소비처 5곳 전부 교체 → **미저장 = 꺼짐**.
- manifest·스키마·마이그레이션·KVS 키 집합 무변경. 유휴 SQL 은 늘지 않음(오히려 미저장 사이트의 워크포스 스윕 관문 SQL 1회가 0회로 줄어듦).
- `npx jest`(리포 루트): **152 suites / 2360 tests 전부 통과** (작업 전 기준선 151 / 2342).

## 판정 함수 (실제 시그니처)

```js
// src/resolver/settings/SettingsRepository.js
async isWorkforceLinkEnabled() {
  const value = await this.getValue(SETTINGS_KEYS.workforceLinkEnabled);
  return value === undefined || value === null ? DEFAULT_APPROVAL_SETTINGS.workforceLinkEnabled === true : value === true;
}
// → Promise<boolean>. 저장값이 정확히 true 일 때만 true. KVS 1회, SQL 0. KVS 실패는 KvsError(code 'UNKNOWN_ERROR') 로 던진다.
```

## 프론트와 공유할 실제 shape — `getApprovalSettings`

```js
// src/resolver/settings/SettingsService.js
async getApprovalSettings() {
  const [policy, approvalGroups] = await Promise.all([this.repository.getPolicy(), this.repository.getApprovalGroups()]);
  return { ...policy, workforceLinkEnabled: policy.workforceLinkEnabled === true, approvalGroups };
}
```
- 응답(guardedDefine 래핑 후): `{ success: true, ...정책키들, workforceLinkEnabled: boolean, approvalGroups: string[] }`.
- **`workforceLinkEnabled` 는 항상 boolean** 이다. 미저장 → `false`, null(수동 KVS 오염) → `false`, `true` 저장 → `true`.
- 프론트 `operatingModeOf` 는 `=== true` 로 판정하면 서버 판정과 정확히 같다(설계 §8.7). `!== false` 도 응답이 boolean 이라 결과는 같지만 `=== true` 로 맞추는 것을 권한다.

## 바뀐 파일

| 파일 | 변경 |
|---|---|
| `src/resolver/settings/SettingsRepository.js` | 기본값 `false` + 주석, `isWorkforceLinkEnabled()` 추가 |
| `src/resolver/settings/SettingsService.js` | relinking 판정 `!(await this.repository.isWorkforceLinkEnabled().catch(() => true))`, `getApprovalSettings` 의 `workforceLinkEnabled` boolean 정규화 |
| `src/resolver/workforce/WorkforceOrgSource.js` | `enabledLoader = () => settingsRepository.isWorkforceLinkEnabled()` (로직 이전, 불필요 import 제거) |
| `src/resolver/worklogControl/ControlLinkJudge.js` | `if (!(await settings.isWorkforceLinkEnabled())) return NOT_LINKED;` |
| `src/resolver/worklogControl/IssueSignalRefresher.js` | `if (!(await dep.settings.isWorkforceLinkEnabled())) return { refreshed: false, skipped: 'DISABLED' };` |
| `src/resolver/worklogHistory/WorklogHistoryRecorder.js` | `if (!(await this.settings.isWorkforceLinkEnabled())) return off;` |
| `src/resolver/workforce/WorkforceLinkService.js` | `:52` `!== false` → `=== true`, `:145` `=== false` → `!== true` |
| `src/resolver/workforce/WorkforceCertWake.js` | `:39` `=== false` → `!== true` |
| `src/resolver/workforce/WorkforcePublisher.js` | `:367`, `:389` `=== false` → `!== true` |
| 테스트 | 아래 "테스트" 절 |

### `grep -rn "workforceLinkEnabled" src --include=*.js | grep -v __test__`

```
src/resolver/settings/SettingsRepository.js:44:  workforceLinkEnabled: 'approval:settings:workforceLinkEnabled',
src/resolver/settings/SettingsRepository.js:119:  workforceLinkEnabled: false,
src/resolver/settings/SettingsRepository.js:178:  'workforceLinkEnabled',
src/resolver/settings/SettingsRepository.js:276:    const value = await this.getValue(SETTINGS_KEYS.workforceLinkEnabled);
src/resolver/settings/SettingsRepository.js:277:    return value === undefined || value === null ? DEFAULT_APPROVAL_SETTINGS.workforceLinkEnabled === true : value === true;
src/resolver/settings/SettingsService.js:28: * workforceLinkEnabled 는 false→true 일 때만(다시 켜면 전량 재게시, Q37).
src/resolver/settings/SettingsService.js:133:    workforceLinkEnabled: booleanValue,
src/resolver/settings/SettingsService.js:231:    return { ...policy, workforceLinkEnabled: policy.workforceLinkEnabled === true, approvalGroups };
src/resolver/settings/SettingsService.js:244:    const relinking = this.outbox && policyPatch.workforceLinkEnabled === true
src/resolver/workforce/WorkforceCertWake.js:39:      if (policy?.workforceLinkEnabled !== true) return 'DISABLED';
src/resolver/workforce/WorkforceLinkService.js:52:    const enabled = policy?.workforceLinkEnabled === true;
src/resolver/workforce/WorkforceLinkService.js:145:    if (policy?.workforceLinkEnabled !== true) throw fail(ErrorCodes.WORKFORCE_LINK_DISABLED);
src/resolver/workforce/WorkforcePublisher.js:367:    if (policy?.workforceLinkEnabled !== true) return PublishState.DISABLED;
src/resolver/workforce/WorkforcePublisher.js:389:    if (policy?.workforceLinkEnabled !== true) return { state: PublishState.DISABLED };
```
`getValue(SETTINGS_KEYS.workforceLinkEnabled)` 직접 호출은 `SettingsRepository.js:276`(판정 함수 내부) **한 곳뿐**이다. 나머지는 `getPolicy()`(기본값 적용된 정책 객체)를 `=== true` 로 읽는다.

## 설계와 다르게 한 점

1. **정책 객체의 `=== false` 도 `!== true` 로 바꿈** (WorkforceCertWake:39, WorkforceLinkService:145, WorkforcePublisher:367·389). 설계 §8.4 는 `!== false` → `=== true` 만 지시했으나, `=== false` 를 남기면 정책 객체에 값이 없거나 null 일 때 "켬"으로 해석돼 판정 함수(미저장=꺼짐)와 의미가 갈린다. 실제 `getPolicy()` 는 항상 boolean 을 주므로 운영 동작은 같고, 기본값 정책(`{}`)으로 돌던 테스트 픽스처에 `workforceLinkEnabled: true` 를 명시했다.
2. **`getApprovalSettings` 에서 `workforceLinkEnabled` 를 boolean 으로 정규화.** `getPolicy` 는 `undefined` 만 기본값으로 바꾸므로, 수동으로 null 이 저장된 경우 null 이 새어 나갈 수 있었다. 완료 기준 "응답에 항상 boolean" 을 코드로 보장.
3. **relinking 조회 실패 시 재게시하지 않음** (`.catch(() => true)`). 기존 `.catch(() => undefined) === false` 와 같은 동작(실패 = relinking 아님)을 유지했다. 저장 자체는 진행된다.

## 테스트

명령: 리포 루트 `npx jest` → `Test Suites: 152 passed, 152 total` / `Tests: 2360 passed, 2360 total` (기준선 151 / 2342, +1 suite, +18 tests).

신규·갱신(설계 §8.6):
- 신규 `src/resolver/settings/__test__/SettingsWorkforceLink.test.js` — 기본값 false; `isWorkforceLinkEnabled` 미저장·null·true·false·`"true"` 5건(KVS 1회 호출 단언); KVS 실패 시 throw; `getPolicy` 미저장 → false; `getApprovalSettings` undefined/null/true/false → boolean 4건.
- `IssueSignalRefresher.test.js` — 실제 `SettingsRepository`(빈 store)로 **미저장 → IssueSignalRefresher DISABLED(SQL·Jira 0)**, **미저장 → ControlLinkJudge linked:false(신호·refresh 0)** 각 1건. 기존 더블 `{ getValue }` → `{ isWorkforceLinkEnabled }`.
- `WorklogHistoryRecorderScope.test.js` — 더블의 `isWorkforceLinkEnabled` 를 실제 저장소 함수에 위임, **미저장 → 신호 SQL 0·wf_linked=false·LINKED_ONLY 범위 밖** 1건.
- `TimesheetWorkforce.test.js` — **미저장 → true 저장도 전량 재게시 touch** 1건, 이전값 조회 실패 시 재게시 안 함 1건, 기존 더블에 `isWorkforceLinkEnabled` 추가.
- `WorkforceCertWake.test.js` — 기본 policy 픽스처 `{}` → `{ workforceLinkEnabled: true }`.
- `idleSqlBudget.test.js` — 연동 설치를 흉내 내는 4개 테스트에 KVS `workforceLinkEnabled=true` 명시, **미저장이면 워크포스 스윕 관문 SQL 없이 정리 1회만** 1건 추가. 하루 합계 상한(미연동 27·연동 38) 그대로 통과.
- 정책 기본값 ↔ KVS 키 맵 계약 테스트(`SettingsPolicyKeys.test.js`) 무변경 통과(키 집합 불변).

## 기존 개발 사이트 영향 (배포 시 반드시 공지)

- `workforceLinkEnabled` 를 **한 번도 저장하지 않은 사이트**(기본값 true 로 연동이 돌던 곳)는 배포 직후 **단독 모드**가 된다: TeamScope 워크포스 원천 null, ControlLinkJudge NOT_LINKED, 이슈 신호 갱신 DISABLED, 이력 wf_linked=false, 게시·인증 즉시 게시 DISABLED, `WorkforceLinkService` 전량 재게시 요청은 `WORKFORCE_LINK_DISABLED`.
- 관리자가 워크포스 연동 페이지에서 **다시 켜야** 한다. 켜는 저장은 "미저장 → true" 도 relinking 으로 보고 현재·이전 연도 전량 재게시를 건다(신규 테스트로 고정).
- `true` 를 명시 저장한 사이트는 영향 없음. 저장값은 지우지 않는다.
- tom-chkim-dev 의 현재 KVS 값은 확인하지 않았다(`forge` 미실행) — 리더가 배포 전후 설정 화면에서 확인 필요.

## 미검증
- 없음(플랫폼 동작 변경 없음). 배포·`forge` 명령은 실행하지 않았다.

## 발견 (범위 밖, 손대지 않음)
- 작업 중 `src/integration/workforce/keyring.js` 가 **내 작업과 무관하게** 수정돼 있다(git status 시작 스냅숏엔 없었음): `KEYRING` 의 APPROVAL·WORKFORCE 에 dev 공개키 `ap-dev-1`·`wf-dev-1` 추가. 다른 작업분으로 보고 건드리지 않았다. 리더 확인 필요.
- 리포에 ESLint flat config(`eslint.config.*`)가 없어 `npx eslint` 가 실행되지 않는다(ESLint 10). 린트는 확인 못 했다.
