> **2026-10-06 재작성:** 최신 고객 문서는 [새 한·영 가이드](handbook/cloudjira--README.md)와 [시각 미리보기](handbook/preview/index.html)를 사용합니다. 아래 목록과 기존 confluence 폴더는 이전 편집본입니다.

# Moves Approval for Confluence — Documentation

Marketplace 공식 문서 원본입니다. 한국어와 영어 문서는 같은 구조·같은 파일명을 씁니다. 한쪽을 고치면 다른 쪽도 함께 고칩니다.
This is the source of the official Marketplace documentation. Korean and English share the same structure and file names — when you change one, change the other.

| # | 한국어 | English | 대상 / Audience |
| --- | --- | --- | --- |
| 0 | [문서 안내](ko/cloudjira--00-index.md) | [Documentation home](en/cloudjira--00-index.md) | 모두 / Everyone |
| 1 | [소개와 핵심 개념](ko/cloudjira--01-overview.md) | [Overview and key concepts](en/cloudjira--01-overview.md) | 모두 / Everyone |
| 2 | [설치와 첫 설정](ko/cloudjira--02-installation.md) | [Installation and first-time setup](en/cloudjira--02-installation.md) | 사이트 관리자 / Site administrators |
| 3 | [요청자 가이드](ko/cloudjira--03-requester-guide.md) | [Requester guide](en/cloudjira--03-requester-guide.md) | 페이지 편집자 / Page editors |
| 4 | [승인자 가이드](ko/cloudjira--04-approver-guide.md) | [Approver guide](en/cloudjira--04-approver-guide.md) | 승인자·대리인 / Approvers and delegates |
| 5 | [참조자·열람자 가이드](ko/cloudjira--05-cc-and-viewer-guide.md) | [Cc recipient and viewer guide](en/cloudjira--05-cc-and-viewer-guide.md) | 참조자·페이지 열람자 / Cc recipients and readers |
| 6 | [관리자 가이드](ko/cloudjira--06-admin-guide.md) | [Administrator guide](en/cloudjira--06-admin-guide.md) | Confluence 관리자·설정 관리자 / Admins |
| 7 | [FAQ와 문제 해결](ko/cloudjira--07-faq-troubleshooting.md) | [FAQ and troubleshooting](en/cloudjira--07-faq-troubleshooting.md) | 모두 / Everyone |
| 8 | [데이터·보안·개인정보](ko/cloudjira--08-data-security-privacy.md) | [Data, security, and privacy](en/cloudjira--08-data-security-privacy.md) | 관리자·보안 검토자 / Admins and security reviewers |
| 9 | [Marketplace 심사 안내](ko/cloudjira--09-marketplace-review.md) | [Marketplace review guide](en/cloudjira--09-marketplace-review.md) | 심사자·제출 담당자 / Reviewers and submission owners |

## 작성 규칙 / Writing rules

- 화면 문구는 `locales/kr/*.json`, `locales/en/*.json` 의 실제 값과 **글자 그대로** 맞춥니다. UI 문구를 바꾸면 이 문서도 고칩니다.
  Quote UI labels exactly as they appear in `locales/en/*.json` and `locales/kr/*.json`. When a label changes, update these documents.
- 정책 기본값은 `src/resolver/settings/SettingsRepository.js` 의 `DEFAULT_APPROVAL_SETTINGS` 와 맞춥니다.
  Policy defaults must match `DEFAULT_APPROVAL_SETTINGS` in `src/resolver/settings/SettingsRepository.js`.
- 내부 구현(테이블 이름, resolver 이름, 코드 식별자)은 고객 문서에 쓰지 않습니다.
  Do not expose internals (table names, resolver names, code identifiers) in customer documents.
- Confluence 에 게시할 때는 파일 하나를 페이지 하나로 만듭니다.
  When publishing to Confluence, create one page per file.

