# 워크로그 정책 계층 통합 검증 보고서

## 결론

**PASS**. 계약·보안·통합 검토와 Claude Opus의 P1/P2 지적 재현을 마쳤고, 유효한 문제를 수정한 뒤 backend/UI/build/Forge lint를 모두 다시 통과했다. 배포·커밋은 수행하지 않았다.

## 독립 검증 결과

- 신규 resolver는 `guardedDefine`, `PERMISSION_MAP`, `CONTROLLER_REGISTRARS` 세 지점에 모두 등록돼 있다. `resolveWorklogPolicies`는 SELF 요청을 batch browse 권한으로 좁히며 client projectId를 신뢰하지 않는다.
- project/issue 정책 저장은 actor를 전달하고 `policy_rev`/`rev` CAS와 `rev=rev+1`을 사용한다. issue 이동 재귀속은 현재 Jira project를 asUser로 확인한 뒤 이전 projectId와 revision을 함께 predicate로 사용한다.
- `rms.policy`는 issuer/cloud/project/issue/time/TTL/kid/trustedKids/Ed25519/body/revision을 검증한 뒤에만 SQL verified cache로 들어간다. runtime은 entity property를 직접 판정하지 않는다. 낮은 rev와 같은 rev의 다른 본문은 거부하고 실패 후보는 마지막 verified body를 덮지 않는다.
- Workforce lock은 완화할 수 없고 비교 가능한 값만 강화할 수 있다. stale grace 뒤 unlocked 값은 fallback하고 locked 관련 mutation/submit은 fail-close한다. 조회와 Timesheet preview는 마지막 검증값과 경고를 반환한다.
- 신규 `asApp()` 경로와 manifest scope 확대는 없다. 신규 SQL 접근은 readiness를 확인하고 빈 `IN` 경로를 차단한다.
- site/Workforce project/Workforce issue/Jira project/Jira issue sparse merge, key별 source/revision/ignored/lock provenance, site-only unit/timezone/retention, legacy aliases를 확인했다.
- Worklog create/edit/delete, approved draft apply, certification/history, Timesheet batch resolution을 확인했다. delete는 delete window만 적용하며 create/edit 날짜 규칙을 잘못 적용하지 않는다.
- UI는 source/revision/lock/ignored/authority 상태와 한·영 고지를 표시하고 query-key factory를 사용한다. 문서와 locale은 WARN/BLOCK/legacy EXTRA_STEP의 실제 비용·차단 경계에 맞췄다.

## 수정한 결함

1. **프로젝트 enable 권한 우회**: 정책 저장으로 새 `approval_project_config` 행을 만들 때 `enabled=1`이던 두 경로를 `enabled=0`으로 변경했다. 프로젝트 관리자의 정책 편집이 사이트 관리자의 앱 사용 설정을 켜지 않는다.
2. **legacy 정책 lost update**: 기존 ProjectPolicy 저장 경로에서 hierarchy-only 키를 조회·삭제·저장 대상에서 분리했다. 같은 JSON row의 다른 키는 보존하고 server-side revision CAS가 동시 변경을 감지한다.
3. **EXTRA_STEP 호환**: site 원본이 `EXTRA_STEP`이고 scope action override가 없으면 worklog mutation에서는 WARN으로 유지한다. 업그레이드만으로 직접 기록이 BLOCK으로 바뀌지 않는다.
4. **PREAPPROVAL/WARN 비용**: PREAPPROVAL 직접 생성은 totals 조회 전에 종료한다. WARN/legacy EXTRA_STEP mutation은 Jira totals를 읽지 않고 Timesheet preview/submit에서 위반을 계산한다. BLOCK만 기록 전 totals를 읽어 차단한다.
5. **trigger KVS 범위**: policy resolver용 site loader를 catalog 관련 KVS 키 subset으로 분리해 event마다 전체 approval settings를 읽지 않는다.
6. **Timesheet action 오염**: 실제 violation을 만든 issue/limit source의 action만 합산한다. 위반이 없는 별도 BLOCK issue가 WARN violation을 BLOCK으로 승격하지 않는다.
7. **만료 잠금 preview**: editor/list에는 원래 throw 경로가 없어 Claude 표현 일부는 오탐이었다. 실제로 재현된 Timesheet preview의 `assertAuthority`를 read 경고로 바꾸고 `submitBlockedCode`를 반환하며, 실제 submit은 `enforceAuthority`로 계속 차단한다.
8. **delete 날짜 규칙**: 삭제에는 future/backdate 규칙을 적용하지 않고 `deleteWindowDays`만 적용한다.
9. **손상 JSON 격리**: project/issue `policy_json` 파싱 실패를 row 단위로 제외해 전체 batch resolve 및 certification observe가 중단되지 않게 했다.
10. **이슈 이동 재귀속**: 이동 전 override row를 현재 projectId로 갱신할 때 `WHERE issue_id + previous_project_id + rev` CAS를 사용한다. 새 프로젝트 관리 권한과 실제 이슈 project 확인 뒤에만 실행한다.

추가로 최초 독립 검토에서 PREAPPROVAL direct create가 기본 daily/weekly 상한 때문에 거절 전에 `collectMine`을 호출하던 문제를 먼저 수정했고 회귀를 추가했다.

## Claude 리뷰 처리

원문은 [`../05_claude_review.md`](../05_claude_review.md)에 보존했다. 리뷰 당시 verdict는 FAIL(P0 0/P1 3/P2 7)이었다. P1 세 건과 P2 여섯 건은 그대로 재현되어 수정했다. P2의 “editor context throw”는 editor/list 코드에는 `assertAuthority`가 없어 그 표현은 오탐이었지만, 동일한 read/write 경계 문제가 Timesheet preview에 있어 수정 범위를 그 경로에 적용했다.

## 회귀와 전체 검증

- 관련 회귀: 5 suites / 67 tests PASS, 이후 확장 관련 검증 6 suites / 80 tests PASS.
- `npm.cmd test -- --runInBand`: **100 suites / 1,396 tests PASS**.
- `npm.cmd run test:ui -- --runInBand`: **46 suites / 382 tests PASS**.
- `npm.cmd run build:ui`: 성공. Atlaskit dependency의 기존 missing source-map 2건과 `postcss-calc` 경고만 있으며 bundle 생성은 완료됐다.
- `C:\Claude\forge.cmd lint`: **No issues found**. CLI 13.4.0 업데이트 안내만 출력됐다.
- `git diff --check`: whitespace error 없음. Windows LF→CRLF 안내만 출력됐다.

## 남은 실환경 검증

- 실제 Workforce sender의 `rms.policy` canonical envelope, 운영 keyring/kid provisioning.
- Forge SQL v042–v045 적용과 Jira project/issue property payload/latency.
- trigger/sweep의 실제 KVS·SQL·Jira 호출량과 BLOCK mutation latency.
- 앱 밖 native/REST/automation 워크로그 사전 차단 범위. 문서에는 이 한계를 고지했다.

## 2026-10-07 개발 환경 배포 확인

- `forge deploy --non-interactive -e development`: 성공. 버전 `2.2.0` 배포, Runs on Atlassian 프로그램 적격 안내를 받음.
- `forge install --upgrade --site tom-chkim-dev.atlassian.net --product jira -e development --non-interactive`: 성공. Jira 사이트가 최신 버전임을 확인.
- `forge logs -e development --since 15m -n 100`: 조회 성공. 최근 `five-minute-sweep`의 Workforce publisher가 두 차례 실행됐으며 `KEY_NOT_CONFIGURED` 상태를 반환했다. 발행·실패는 0건이고 migration/runtime 오류는 해당 로그에 나타나지 않았다.
- Forge SQL migration은 resolver 호출 시 지연 적용되는 구조이므로, 현재 로그만으로 v042~v045 적용을 확정하지 않는다. 개발 사이트에서 정책 화면과 worklog 경로를 열어 readiness/migration 응답을 확인해야 한다.
- 설치 목록 명령은 sandbox 네트워크의 `EACCES`로 실패했다. upgrade 명령의 성공 응답으로 설치 버전은 확인했다.
