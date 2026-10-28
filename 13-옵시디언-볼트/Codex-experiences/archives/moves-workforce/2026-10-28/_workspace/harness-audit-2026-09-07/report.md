# Moves RMS 하네스 감사·개선

2026-09-07, 작업 기준 HEAD `6ff54d3`와 당시 미커밋 변경을 기준으로 점검했다. 앱 권한·번역 등 기존 변경이 있었으며 하네스 작업에서 앱 소스를 수정하지 않았다. 필수 앱 검증은 그 변경을 포함한 현재 작업 트리를 대상으로 했다.

## 발견과 수정

| 우선순위 | 발견 | 개선 |
|---|---|---|
| P1 | 백엔드 스킬이 resolver.define + responseWrapper 직접 등록을 안내하고 권한 등록을 누락 | guardedDefine, CONTROLLER_REGISTRARS, PermissionMap을 설계·구현·검증에 연결 |
| P1 | UI 권한 대조만 있고 서비스 데이터 범위 검증이 빠짐 | principal fail-close, SELF SQL owner, CostAccess+SalaryVisibility, TeamAnalyticsScope, 형제 resolver·읽기/쓰기·배정 경로 점검 |
| P1 | 선행 실패 뒤 다음 단계 진행, 실제 구현을 무조건 계약보다 우선 | 의존 작업 보류와 원인 해결, 요구사항 기준으로 계약·구현·전체 소비자 동기화 |
| P2 | 실제 TOML/.agents 경로와 다른 파일 경로, 과거 호출 방식·모델 자동 적용 설명 | 실제 세션 collaboration 도구, 유휴 followup_task 재개, 지원 타입 확인과 모델 상속 |
| P2 | AGENTS 진입점 부재와 에이전트/스킬 규칙 복제 | AGENTS 포인터, 역할별 TOML 축약과 담당 스킬 직접 참조 |
| P2 | DB/Jira/라우팅/검증 규칙 노후화 | rowsAffected, KVS schema·상한·빈 값, asUser 기본, ForgeHistoryRouter, CI 빌드·Forge lint |
| P2 | 후속 요청에 작업 디렉토리 이동·전체 단계 재실행 가능 | 현재 코드와 상태 대조, 소유권·검증 증거 기록, 필요한 단계만 재개 |
| P2 | 파일 문법·연결 검사 부재 | 실제 TOML/YAML 파서·로컬 링크·스킬 연결·BOM 검사와 드라이런 시나리오 추가 |

기존 내부 Service 소비자 및 다중 shape 컴포넌트 회귀 교훈을 보존했다. 작업 범위별 캐시 무효화·권한 축, 라이선스 INACTIVE/UNAVAILABLE 경계도 보강했다. 에이전트·SKILL.md 본문은 총 677줄에서 575줄로 정리했으며 상세 검증·시나리오는 필요할 때 읽는 references에 두었다.

## 검증 증거

| 항목 | 결과 | 근거 |
|---|---|---|
| 구조 검사 | 통과 | 에이전트 4개·스킬 5개, TOML/YAML·연결·링크 |
| 손상 검출 | 통과 | 격리된 임시 복사본에서 BOM·깨진 링크·TOML 오류·중복 YAML 키·스킬 연결·진입점 누락 6종 검출 |
| skill-creator quick_validate | 5개 통과 | 공식 로컬 validator 실행, PyYAML은 감사 디렉토리에만 설치 |
| 독립 드라이런 | 통과 | [별도 평가](forward-check.md): 세 사례 및 기능 입력 8개/near-miss 8개 분류, 정답 시나리오 파일 미열람 |
| 백엔드 테스트 | 통과, 종료 코드 0 | [로그](backend-test.log): 112 suites, 1,511 tests |
| 프론트 테스트 | 통과, 종료 코드 0 | [로그](frontend-test.log): 108 suites, 1,743 tests, 1 snapshot |
| CI=true 프론트 빌드 | 통과, 종료 코드 0 | [로그](frontend-build.log): 번들 gzip 449,053 bytes / 예산 950,000 bytes |
| Forge lint | 종료 코드 0, 일부 미검증 | [로그](forge-lint.log): No issues found이나 PermissionLinter의 Unknown product 경고로 일부 인가 lint를 실행하지 못함 |
| 실제 Jira·브라우저 기능 실행 | 미검증 | 이번 범위는 하네스 감사이며 배포·설치하지 않음 |

구조 검사는 지침의 행동이나 실제 기능 구현 성공을 증명하지 않는다. 독립 평가는 읽기 전용 드라이런이며 전체 에이전트 기능 구현 실행과 구분한다. 앱 테스트 통과로 Forge PermissionLinter의 미검증 부분을 대신하지 않는다.

## 변경 파일

| 파일 | 상태 |
|---|---|
| `AGENTS.md` | 수정 |
| `CLAUDE.md` | 수정 |
| `.codex/agents/backend-engineer.toml` | 수정 |
| `.codex/agents/feature-architect.toml` | 수정 |
| `.codex/agents/frontend-engineer.toml` | 수정 |
| `.codex/agents/integration-verifier.toml` | 수정 |
| `.agents/skills/feature-design/SKILL.md` | 수정 |
| `.agents/skills/feature-harness/references/scenarios.md` | 추가 |
| `.agents/skills/feature-harness/references/verification.md` | 추가 |
| `.agents/skills/feature-harness/scripts/validate_harness.py` | 추가 |
| `.agents/skills/feature-harness/SKILL.md` | 수정 |
| `.agents/skills/forge-backend-dev/SKILL.md` | 수정 |
| `.agents/skills/forge-frontend-dev/SKILL.md` | 수정 |
| `.agents/skills/integration-verify/SKILL.md` | 수정 |

하네스와 CLAUDE.md는 기존 `.gitignore` 정책상 로컬 전용이다. 해당 정책을 바꾸거나 커밋·푸시하지 않았다. 원본은 `before/`, 전체 비교는 [changes.patch](changes.patch)에 보존했다. git에 보이는 이번 변경은 AGENTS.md 포인터이며, 그 외 기존 작업 변경과 구분해야 한다.

## 유지보수

앱 루트에서 `python -X utf8 .agents/skills/feature-harness/scripts/validate_harness.py`로 문법과 연결을 다시 검사할 수 있다. 지침 변경 뒤에는 스킬의 scenarios.md로 후속 수정·계약 이탈·선행 실패·설계 전용 판단도 확인한다.

Codex 파일 위치는 현재 세션의 실제 구성과 [공식 Subagents 문서](https://learn.chatgpt.com/docs/agent-configuration/subagents), [공식 Skills 문서](https://learn.chatgpt.com/docs/build-skills)를 함께 확인했다. 호출 도구 이름은 현재 세션에 노출된 스키마를 기준으로 작성했다.

별도 참고: 앱의 ResponseWrapper.js 일부 라이선스 주석이 오래됐지만 실제 LicenseGuard는 INACTIVE만 차단한다. 하네스에는 AGENTS와 실제 동작의 공통 계약을 반영했고 앱 주석은 이번 범위 밖으로 두었다.
