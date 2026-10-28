# Moves Approval for Jira — 마켓플레이스 문서 원본

2026-10-05 작업 트리의 구현·번역을 기준으로 작성했다. Confluence Approval과 같은 한·영 파일 구조를 사용하며 파일 하나를 공개 페이지 하나로 게시할 수 있다. 제품 배포·실계정 검증·공개 게시 완료를 뜻하지 않는다.

| 주제 | 한국어 | English |
| --- | --- | --- |
| 문서 안내 | [00-index](ko/cloudjira--00-index.md) | [Documentation home](en/cloudjira--00-index.md) |
| 소개와 핵심 개념 | [01-overview](ko/cloudjira--01-overview.md) | [Overview](en/cloudjira--01-overview.md) |
| 설치와 첫 설정 | [02-installation](ko/cloudjira--02-installation.md) | [Installation](en/cloudjira--02-installation.md) |
| 요청자 | [03-requester-guide](ko/cloudjira--03-requester-guide.md) | [Requester guide](en/cloudjira--03-requester-guide.md) |
| 승인자·참조자 | [04-approver-guide](ko/cloudjira--04-approver-guide.md) | [Approver guide](en/cloudjira--04-approver-guide.md) |
| 타임시트·팀장 | [05-timesheet-guide](ko/cloudjira--05-timesheet-guide.md) | [Timesheet guide](en/cloudjira--05-timesheet-guide.md) |
| 워크로그 사전 승인·기간 잠금 | [06-worklog-period-lock](ko/cloudjira--06-worklog-period-lock.md) | [Worklog pre-approval and period locks](en/cloudjira--06-worklog-period-lock.md) |
| 상태 전환 승인 | [07-transition-approval](ko/cloudjira--07-transition-approval.md) | [Transition approval](en/cloudjira--07-transition-approval.md) |
| 필드 변경 승인 | [08-field-change-approval](ko/cloudjira--08-field-change-approval.md) | [Field change approval](en/cloudjira--08-field-change-approval.md) |
| 관리자 | [09-admin-guide](ko/cloudjira--09-admin-guide.md) | [Administrator guide](en/cloudjira--09-admin-guide.md) |
| Workforce 연동 | [10-workforce-integration](ko/cloudjira--10-workforce-integration.md) | [Workforce integration](en/cloudjira--10-workforce-integration.md) |
| 데이터·보안·개인정보 | [11-data-security-privacy](ko/cloudjira--11-data-security-privacy.md) | [Data, security and privacy](en/cloudjira--11-data-security-privacy.md) |
| FAQ·지원 | [12-faq-troubleshooting](ko/cloudjira--12-faq-troubleshooting.md) | [FAQ and troubleshooting](en/cloudjira--12-faq-troubleshooting.md) |
| 심사자 재현 안내 | [13-marketplace-review-guide](ko/cloudjira--13-marketplace-review-guide.md) | [Marketplace reviewer guide](en/cloudjira--13-marketplace-review-guide.md) |

## 게시 준비

- 고객 문서는 00~12, 심사 안내는 13이다. 실제 URL·심사 계정·출시 버전은 [제출 준비표](cloudjira--MARKETPLACE-SUBMISSION.md)에 확정한다.
- 공개 문서의 홈 URL은 로그인 없이 열려야 한다. 언어별 페이지를 연결하고 Markdown 상대 링크를 실제 공개 페이지 링크로 바꾼다.
- 화면 이름은 `locales/kr`, `locales/en`과 맞추되 Jira의 모듈 이름 `Request approval`, `Log work`, `Work log`는 현재 manifest의 영어 이름을 사용한다.
- 기본값은 `src/resolver/settings/SettingsRepository.js`, 보관은 `src/resolver/retention/RetentionService.js`가 근거다. 변경 시 두 언어를 함께 수정한다.
- 사용 방법은 작성했으나 스크린샷은 아직 없다. [촬영 목록](cloudjira--SCREENSHOT-PLAN.md)에 맞춰 출시 대상 환경에서 촬영한다. 미검증 기능은 실제 검증 뒤 지원 범위를 확정한다.
- 개인정보 처리방침·EULA·지원 URL은 조직의 확정본을 연결한다. 데이터 설명 문서를 법적 정책 문서로 대신 제출하지 않는다.

## 내용 검증

파일 쌍·상대 링크·기본값을 확인하고 독립 독자 검토를 수행한다. 제품 검증 순서는 `AGENTS.md`를 따른다. 이 문서 작업에서는 기존 구현 파일·앱 등록·배포·커밋을 변경하지 않는다.
