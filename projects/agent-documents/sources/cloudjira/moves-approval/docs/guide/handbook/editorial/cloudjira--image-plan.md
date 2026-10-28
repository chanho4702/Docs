# 화면 캡처와 배치

22개 장면을 한·영 같은 위치에 배치합니다. 실제 캡처 11장, 본문 이미지 24곳을 준비했고 계획 항목 22곳은 촬영 완료, 0곳은 대기입니다. 본문은 이미지 없이도 절차를 수행할 수 있게 작성했습니다. 이 목록은 편집자용이며 고객 본문에 파일명·촬영 지시를 붙이지 않습니다.

## 공통 촬영 기준

- 같은 테스트 문서·요청·계정 역할로 언어별 캡처를 맞춥니다.
- 기본 배율 100%, 너비 1440px 이상. 조작 대상과 주변 제목을 포함하고 작은 글자는 잘라 확대합니다.
- PIN·토큰·실사용 서명을 노출하지 않습니다. 가상 계정과 테스트 문서를 씁니다.
- 요청 전, 처리 중, 완료 후 상태를 설명에 맞춰 구분합니다. 화면을 그려서 제품 캡처로 대신하지 않습니다.
- 한 박스에 여러 장면이 필요한 경우 두 장으로 나누되 같은 장면 ID로 관리합니다.
- Confluence에서는 본문 폭의 약 80~100%로 넣고, 캡션은 이미지 바로 아래에 둡니다.

| ID | 문서 | 필요한 화면·배치 | 파일명 |
| --- | --- | --- | --- |
| MA-05 | [inbox](../ko/cloudjira--inbox.md) | 상태 탭, 검색 필터, 문서 목록, 마감 배지와 Excel 내보내기가 있는 승인 업무함 | `../assets/ma-05-inbox-2026-10-26.jpg` / `../assets/ma-05-inbox-2026-10-26.jpg` |
| MA-06 | [decisions](../ko/cloudjira--decisions.md) | 요청 버전, 변경 경고, 세 단계 진행 상황, 감사 이력과 승인·반려 버튼이 있는 승인 상세 | `../assets/ma-06-approval-details.jpg` / `../assets/ma-06-approval-details.jpg` |
| MA-07 | [decisions](../ko/cloudjira--decisions.md) | 승인 업무함에서 두 요청을 선택하고 일괄 승인 버튼이 활성화된 화면 | `../assets/ma-07-bulk-approval.jpg` / `../assets/ma-07-bulk-approval.jpg` |
| MA-08 | [signature-pin](../ko/cloudjira--signature-pin.md) | 서명 그리기·업로드 기능, 자동 이름 미리보기와 미등록 PIN 입력 영역 | `../assets/ma-08-signature-pin.jpg` / `../assets/ma-08-signature-pin.jpg` |
| MA-09 | [delegation](../ko/cloudjira--delegation.md) | 대리인, 위임 기간과 메모를 설정하는 결재 위임 화면 | `../assets/ma-09-delegation.jpg` / `../assets/ma-09-delegation.jpg` |
| MA-10 | [history-resubmit](../ko/cloudjira--history-resubmit.md) | 요청 뒤 페이지가 변경되었다는 경고와 버전 비교, 새 버전 재상신 버튼 | `../assets/ma-10-version-resubmit.jpg` / `../assets/ma-10-version-resubmit.jpg` |
| MA-11 | [stamp-box](../ko/cloudjira--stamp-box.md) | 게시된 Confluence 페이지에 표시된 Moves 결재란 | `../assets/ma-11-stamp-box.jpg` / `../assets/ma-11-stamp-box.jpg` |
| MA-13 | [notifications](../ko/cloudjira--notifications.md) | 승인 업무함의 요청과 결과 알림 목록 | `../assets/ma-13-notifications.jpg` / `../assets/ma-13-notifications.jpg` |
| MA-19 | [admin-access](../ko/cloudjira--admin-access.md) | 승인자 명부의 빈 목록과 추가 버튼, 접근 정책 안내 | `../assets/ma-19-approvers.jpg` / `../assets/ma-19-approvers.jpg` |
| MA-19 | [admin-access](../ko/cloudjira--admin-access.md) | Moves Approval 설정 관리자를 지정하는 화면 | `../assets/ma-19-settings-admins.jpg` / `../assets/ma-19-approvers.jpg` |
| MA-20 | [admin-data](../ko/cloudjira--admin-data.md) | 데이터 관리의 저장 공간 사용량과 테이블별 예상 행 수 | `../assets/ma-20-data-management.jpg` / `../assets/ma-20-data-management.jpg` |

## 첨부 확인

원본 파일 확보 → 올바른 언어 페이지 첨부 → 표시 위치에 삽입 → 캡션·대체 텍스트 지정 → 게시된 본문에서 이미지 확인 순으로 진행합니다. 실제 그림이 들어간 항목만 image-plan.json 상태를 바꾸고 자리 표시를 제거합니다.
