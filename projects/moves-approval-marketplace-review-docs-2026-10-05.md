# Moves Approval Marketplace 심사 문서 (2026-10-05)

## 결정과 교훈

- 기존 `docs/guide/ko`·`en` 사용자 가이드 9쌍에 `09-marketplace-review.md`를 추가해 총 10쌍으로 구성했다. 리스팅 문구, 기존 가이드 연결, 데이터·권한 설명, 14개 심사 시나리오, 제출 전 준비 체크리스트를 같은 구조로 작성했다.
- 심사 절차 문서와 실제 실행 증빙을 구분했다. 공개 문서 URL·지원 연락처·Privacy policy·EULA·가격·보안 설문 및 신원 검증은 확인된 값 없이 완료로 표시하지 않는다.
- 기존 개인정보 문서의 댓글 작성 권한이 실제 `CommentNotifier`와 달랐다. 양쪽 문서에서 앱 권한을 작업 수행자의 `asUser()` 권한으로 수정했다. manifest 주석이나 과거 설계 설명보다 실제 호출 코드를 우선 확인해야 한다.
- 독립 독자 검토에서 댓글 작성 가능 조건과 마감·보관 기간 경과 테스트 기록을 찾는 방법이 부족하다는 피드백을 받아 준비 절차를 보완했다. 테스트 데이터 위치·요청 식별자·날짜·보관 기간은 심사 티켓에 제공하도록 했다.
- 문서 상대 링크와 두 언어의 파일명 구성을 확인했다. 변경 범위는 문서이며 공개 게시·배포·커밋·푸시는 수행하지 않았다.

## 검증

- 백엔드 27개 suite·189개 test, UI 10개 suite·59개 test 통과.
- UI 빌드 성공. Atlaskit source map 누락·CSS minimizer 경고가 남았다.
- `forge lint`: `No issues found.` CLI 업데이트 안내는 있었으며 CLI를 변경하지 않았다.
- `git diff --check`, 신규 문서 인코딩·줄 끝 공백 검사 및 전체 가이드 상대 파일 링크 검사 통과.

## 관련 문서

- [[projects/moves-approval-customer-guide-2026-08-31]]
- [앱 심사 가이드](https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/)
- [심사 보안 절차](https://developer.atlassian.com/platform/marketplace/app-approval-security-workflow/)
