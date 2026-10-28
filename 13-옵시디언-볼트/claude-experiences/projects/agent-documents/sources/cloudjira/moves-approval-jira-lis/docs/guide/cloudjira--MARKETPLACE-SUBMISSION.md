# Marketplace 제출 준비표

기준일: 2026-10-06. 한·영 문서 원본 작성과 실제 출시·심사 제출은 별도 상태다. 아래는 내부 제출 준비표이며 공개 고객 문서로 게시하지 않는다.

## 현재 상태

| 항목 | 상태·다음 작업 |
| --- | --- |
| 한·영 가이드 | 14주제씩 작성, 문서 홈·상호 언어 링크 포함 |
| 심사 재현 안내 | R01~R14 작성. 실환경 결과 미기록 |
| 앱 등록 | `manifest.yml`에 독립 Jira app ID `1bd06760-bb28-4180-a231-23e9029c7ea7` 반영. Developer Space·등록 소유자·출시 배포 환경은 Developer Console에서 최종 대조 |
| 설치·배포 | 이 작업에서 실행하지 않음. 출시 후보 버전·환경·사이트와 설치 링크 확정 필요 |
| 스크린샷 | 촬영 목록 준비, 실제 파일 없음 |
| 공개 문서 | URL 미확정·미게시. 로그인 없는 접근과 링크 검증 필요 |
| 지원·개인정보·EULA | 조직의 공개 확정 URL과 지원 책임자 연결 필요 |
| Privacy & Security | 현재 manifest·실제 배포 설정·공급자 운영 정책 기준으로 응답 확정 필요 |
| Forge 배포 설정 | 유료 앱. `manifest.yml` `app.licensing.enabled: true`(2026-10-07). 차단은 resolver(`assertLicenseAllowed`)+엔트리(`LicenseGate`) 두 겹, 명시적 INACTIVE 만. production 사이트에서 비활성 라이선스 안내 화면·설정 배너·평가판 만료 배너 실측 필요 |
| 지원 범위 | company-managed 재현, team-managed·Preview 모듈은 실환경 검증 후 확정 |
| 선택 연동 | Workforce의 실제 지원 버전·키 배포·표시 검증 필요 |

## 제출할 연결 정보

담당자가 다음 값을 확정해서 리스팅과 심사 티켓에 연결한다. 값이 없다고 가상의 URL·계정을 만들지 않는다.

| 필드 | 연결 대상 |
| --- | --- |
| 제품명 | Moves Approval for Jira |
| 문서 홈 | 영어 `en/00-index.md` 공개 URL, 한국어 전환 링크 |
| 지원 | 공급자 지원 페이지 또는 포털·담당자·지원 정책 |
| 개인정보·약관 | 승인된 공급자 Privacy Policy·EULA/Terms 공개 URL |
| 설치 안내 | `en/02-installation.md` 공개 URL |
| 심사 안내 | `en/13-marketplace-review-guide.md` 공개 URL |
| 심사 환경 | 사이트·설치 링크·버전·프로젝트·계정 역할, 자격 증명은 비공개 전달 |
| 제품 이미지 | 검증한 출시 환경의 로고·대표 화면·한영 화면 |

## 리스팅 설명 초안

**한국어:** Jira Cloud에서 이슈 검토, 저장된 워크로그의 사후 인증, 타임시트 제출, 상태 전환과 필드 변경의 승인을 관리하세요. 결재선·팀장 검토·업무함·결정 이력으로 승인 업무를 추적합니다. 상태 전환 강제는 워크플로 validator 설정이 필요하며, 선택적인 워크로그 입력안 사전 승인·기간 잠금·필드 변경 통제의 적용 범위는 가이드를 확인하세요. Workforce 연동은 양쪽 호환 버전과 서명 키 준비 후 검증해야 합니다.

**English:** Manage issue reviews, post-entry certification of stored worklogs, timesheet submissions, transition approvals and governed field changes in Jira Cloud. Track approval lines, team-lead reviews, inbox tasks and decision history. Transition enforcement requires workflow validator configuration. See the guide for the optional worklog draft pre-approval mode, period-lock and field-governance boundaries. Workforce integration requires compatible releases and signing keys on both sides, followed by verification.

## 제출 전 확인

- [ ] 독립 Jira app ID·출시 버전·과금 설정 확정, Confluence 앱과 구분
- [ ] 리스팅 URL 확정 후 `static/ui/src/features/license/licenseConstants.js` 의 `MARKETPLACE_URL`(현재 제품명 검색 링크)을 리스팅 주소로 교체
- [ ] 백엔드·UI 테스트 → UI 빌드 → forge lint → 출시 후보 사이트 검증 기록
- [ ] R01~R12·R14 실계정 재현, R13은 연동을 리스팅에 포함하면 검증
- [ ] 한·영 스크린샷·개인정보 마스킹·실제 모듈 진입 확인
- [ ] 공개 문서·지원·법적 정책 URL 익명 접근 및 상호 링크 확인
- [ ] manifest 권한과 Privacy & Security 응답·배포 설정 일치
- [ ] 지원 프로젝트 유형·Preview 제한·다른 시간 추적 제공자 영향 명시
- [ ] 설치/업그레이드·비활성 라이선스·제거 흐름 검증
- [ ] 문서 준비 완료와 심사 제출 가능 상태를 구분해 기록

## 작성 근거

2026-10-06 모델 변경: 신규 상태 전환 승인은 요청자 offline impersonation으로 자동 적용하며 승인과 Jira 적용 결과를 분리한다. 기존 LEGACY_MANUAL은 수동 전환을 유지한다. UNKNOWN에는 재POST 없이 변경 이력 대조와 수동 확인을 사용한다. 워크로그 기본 인증은 Jira 원본 저장 이후 fingerprint를 승인하고 수정·삭제 관찰 시 무효화한다. WORKLOG_CREATE는 선택적인 고통제 승인 후 본인 등록 모드이며 자동 생성하지 않는다. 타임시트와 사후 인증은 별도 절차다.

심사 증빙에는 actor 보존·impersonation 동의/접근 제한·REST validator 재진입·Forge SQL v039–v041 migration·5분 schedule·native/REST 입력 경계의 실측 결과가 필요하다. 현재 구현 및 테스트 통과를 live 검증 완료로 표기하지 않는다. read:jira-work/write:jira-work의 impersonation 허용과 설치 업그레이드를 개인정보/권한 설명에 반영한다. 한영 06/07/09/11/12/13 가이드의 추가 시나리오를 함께 사용한다.

`CLAUDE.md`, `manifest.yml`, `locales/{kr,en}`, `src/resolver/settings/SettingsRepository.js`, `src/resolver/retention/RetentionService.js`, `src/permission/AppAccess.js`, 각 `_workspace/*/{03_verify_report,04_spike_todo}.md`를 사용했다. 작업 트리에는 기존 미커밋 구현 변경이 있으므로 문서 기준을 Git HEAD·운영 배포 버전과 동일하다고 간주하지 않는다.

현재 심사 안내의 확인 근거: [App approval guidelines](https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/), [Create your Marketplace listing and link your Forge app](https://developer.atlassian.com/platform/marketplace/onboarding-hub/launch/create-your-marketplace-listing-and-link-your-forge-app/), [Time tracking provider](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-time-tracking-provider/). 제출 직전에 변경 여부를 다시 확인한다.
