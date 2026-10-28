# 워크로그 정책 계층 최종 리뷰

## 1. Verdict: **FAIL**

릴리스를 막는 P1이 3건 있습니다. 하나는 권한 경계 우회, 하나는 정책이 아무 표시 없이 덮어써지는 문제, 하나는 기존 사이트의 동작이 업그레이드만으로 바뀌는 문제입니다. 서명 검증, Workforce 잠금 merge, 리졸버 3종 등록은 대체로 견고합니다. 정적 리뷰만 했고 테스트는 직접 실행하지 않았습니다.

## 2. Findings

### P0

없음

### P1

#### P1-1. 프로젝트 관리자가 워크로그 정책을 저장하면 그 프로젝트의 앱 사용이 함께 켜짐

- `src/resolver/worklogPolicy/WorklogPolicyRepository.js`에서 신규 행을 `enabled=1`로 넣지만, 이 resolver는 프로젝트 관리자도 호출할 수 있습니다. 앱 사용 여부 변경은 사이트 관리자 전용입니다.
- 프로젝트 범위가 구성된 사이트에서 프로젝트 관리자가 처음 정책을 저장하면 해당 프로젝트의 validator, 이력 수집, 사전 승인이 사이트 관리자 승인 없이 켜집니다.
- 신규 행은 `enabled=0`으로 넣고 legacy 저장 경로도 동일하게 맞춰야 합니다.

#### P1-2. legacy 프로젝트 정책 저장이 새 워크로그 키를 revision 확인 없이 지우거나 되돌림

- `SettingsRepository.js`의 legacy 저장이 새 catalog 키까지 치환하며, 클라이언트 revision이 아닌 방금 읽은 서버 revision으로 CAS합니다.
- 같은 모달이나 다른 관리자가 새 워크로그 정책을 저장한 뒤 legacy 저장을 누르면 엄격 정책이 오류 없이 되돌아가는 lost update가 생깁니다.
- legacy 저장 대상에서 새 catalog 키를 제외하고 클라이언트 `policy_rev` CAS를 적용해야 합니다.

#### P1-3. 기존 `timesheetViolationAction=EXTRA_STEP` 사이트에서 업그레이드 즉시 워크로그 쓰기가 막힘

- catalog가 `EXTRA_STEP`을 `BLOCK`으로 정규화해 WorklogService mutation에도 적용합니다. 기존 타임시트 경로는 `EXTRA_STEP`을 보존합니다.
- 설정 변경 없이 업그레이드한 사이트에서 미래 날짜 또는 상한 초과 기록이 기존 예외 승인 대신 쓰기 시점에 차단됩니다.
- 원본 site 값이 `EXTRA_STEP`이고 action에 scope override가 없으면 mutation severity를 `WARN`으로 유지해야 합니다.

### P2

1. 기본 daily/weekly 상한 때문에 모든 생성·수정에서 Jira 집계를 합니다. `WARN`이면 타임시트 단계로 미루고 실제 mutation 차단이 가능한 `BLOCK`일 때만 수집해야 합니다.
2. 네이티브 워크로그 이벤트마다 trigger cache 없이 전체 site KVS를 읽습니다. history 관련 키만 읽거나 global fast path가 필요합니다.
3. 타임시트에서 위반 없는 BLOCK 항목도 전체 action을 BLOCK으로 만듭니다. 실제 violation을 만든 entry 정책만 집계해야 합니다.
4. Workforce 잠금 만료 시 미리보기와 editor context까지 throw합니다. 조회는 마지막 검증본과 경고를 반환하고 제출·mutation 경계만 차단해야 합니다.
5. delete에도 미래·과거 작성 날짜 규칙이 적용됩니다. 삭제는 `deleteWindowDays`만 적용해야 합니다.
6. 손상된 project `policy_json`이 전체 resolve를 실패시켜 certification observe가 빠질 수 있습니다. 행 단위 invalid 상태로 무시하고 observe는 유지해야 합니다.
7. 다른 프로젝트로 이동한 이슈의 override는 CAS가 영구 충돌합니다. 기존 revision으로 새 프로젝트에 재귀속해야 합니다.

## 3. 확인된 강점

- issuer/cloud/target/kid/skew/TTL/notAfter/Ed25519/catalog/lock 순서의 서명 검증이 정확합니다.
- 낮은 revision과 같은 revision의 다른 digest를 거부하며 실패 후보가 마지막 검증본을 덮지 않습니다.
- 런타임 merge는 SQL의 `VERIFIED` cache만 사용합니다.
- 잠금 완화 거부, 비교 불가 키 거부, 더 엄격한 local 값 허용, 저장 시 잠금 검증이 갖춰졌습니다.
- 신규 resolver 8종이 `guardedDefine`, `PermissionMap`, `CONTROLLER_REGISTRARS`에 모두 등록됐습니다.
- 빈 `IN`, SQL readiness, `rev=rev+1` CAS, legacy revision 저장 차단을 갖췄습니다.
- PREAPPROVAL 직접 생성은 Jira POST 전에 막고 apply 시 정책을 재검사합니다.
- 한국어와 영어 locale/error code가 함께 추가됐습니다.

## 4. 남은 외부 검증 항목

- moves-workforce sender의 실제 `rms.policy` envelope/canonical signature와 운영 keyring의 `kid`를 확인해야 합니다.
- Forge SQL에서 v042/v045 `ADD COLUMN IF NOT EXISTS`와 migration 번호 충돌 여부를 배포 환경에서 확인해야 합니다.
- trigger/sweep의 실제 KVS·SQL 호출 수와 mutation latency를 `forge logs`로 측정해야 합니다.
- Jira native/REST/automation 워크로그는 앱에서 사전 차단되지 않으므로 문서 고지를 확인해야 합니다.
