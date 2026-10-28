# 화면 이미지 배치 계획

21개 화면 주제, 한·영 42개 삽입 위치입니다. 실제 캡처와 Confluence 첨부는 아직 완료되지 않았습니다. 각 언어 문서의 같은 절에 해당 언어의 실제 제품 화면을 넣습니다. 정확한 파일명은 image-plan.json에 있습니다.

화면 배율 100%, 너비 1440px 이상을 권장합니다. 주변 메뉴와 절 제목을 포함하고, 작은 글자가 읽히도록 긴 화면은 여러 장으로 나눕니다. 테스트 계정·테스트 문서를 사용합니다.

| ID | 문서 | 위치 | 한·영 설명·대체 텍스트 | 준비와 캡처 범위 |
| --- | --- | --- | --- | --- |
| 01-page-status | 소개와 핵심 개념 | 화면은 어디에 있나요 | 페이지 제목 아래 승인 상태와 본문 결재란 / Approval status below the page title and the stamp box | 2단계 중 첫 단계 완료. 제목·byline·결재란을 함께 캡처. |
| 02-workflow | 소개와 핵심 개념 | 요청은 이렇게 흘러갑니다 | 단계별 승인 진행과 결정 이력 / Approval progress and decision history | 현재 단계와 승인 순서표를 함께 캡처. |
| 03-install | 설치와 첫 설정 | 설치 | Confluence Cloud에 Moves Approval 설치 / Installing Moves Approval on Confluence Cloud | 실제 설치 화면의 앱 이름·대상 제품·권한 안내. 공개 전 설치라면 비공개 설치임을 명시. |
| 04-entry | 설치와 첫 설정 | 설치 확인 | 앱 메뉴에서 승인 업무함 열기 / Opening the approval inbox from the Apps menu | 앱 메뉴를 펼치고 Moves Approval 항목과 상단 탐색 포함. |
| 05-request | 요청자 가이드 | 페이지 승인 요청하기 | 승인 단계·마감·참조·메모를 정하는 요청 창 / Request dialog with approval steps, deadline, Cc, and note | 요청자 A·승인자 B/C로 2단계 구성. 자동 결재란 체크박스까지 포함. |
| 06-region | 요청자 가이드 | 영역(일부 내용) 승인 요청하기 | 문서 일부에 적용된 승인 영역 / An approval area inside a page | 게시된 영역의 본문·요청 버튼·결재란과 영역 밖 내용 일부를 포함. |
| 07-resubmit | 요청자 가이드 | 요청 이후 페이지를 고쳤다면 | 요청 버전과 현재 버전의 차이 및 다시 상신 / Requested and current versions, and resubmission | 요청 후 페이지 편집. 버전 안내·변경 보기·다시 상신 버튼 포함. |
| 08-inbox | 승인자 가이드 | 승인 업무함 | 내 차례 목록의 필터·마감·내보내기 / My turn with filters, deadlines, and export | 처리 가능한 요청 2건 이상. 필터·열 제목·마감 배지·내보내기 포함. |
| 09-decision | 승인자 가이드 | 승인하기 | 요청 확인 후 승인 또는 반려 / Reviewing a request before approval or rejection | 현재 차례인 승인자 계정. 요청 메모·진행·승인/반려 버튼 포함. |
| 10-bulk | 승인자 가이드 | 여러 건 한꺼번에 승인하기 | 일괄 승인 대상 선택과 결과 / Bulk approval selection and results | 요청 2건 선택 화면과 처리 후 성공·실패 건수를 두 장으로 배치. |
| 11-signature | 승인자 가이드 | 내 서명과 서명 PIN | 내 서명 등록과 PIN 설정 / My signature and PIN settings | 가상 서명 사용. 등록 방식·PIN 상태 포함. 실제 PIN 숫자 노출 금지. |
| 12-delegation | 승인자 가이드 | 결재 위임 (자리를 비울 때) | 대리인과 위임 기간 지정 / Delegate and delegation dates | 위임 정책 활성화 후 대리인·시작일·종료일·저장/해제 포함. |
| 13-stamps | 참조자·열람자 가이드 | 문서의 결재란 읽기 | 결재란의 단계·도장·결재자·날짜 / Steps, stamps, approvers, and dates | 승인과 대기가 함께 보이는 테스트 결재란. 도장·이름이 잘리지 않게 캡처. |
| 14-certificate | 참조자·열람자 가이드 | 결재 증명서 PDF 받기 | 종료된 요청의 증명서와 문서 지문 / Certificate and fingerprint for a finished request | 테스트 요청의 실제 PDF. 버전·결재란·요청 ID·SHA-256 영역 포함. |
| 15-policy | 관리자 가이드 | 전역 정책 | 전역 정책의 마감·알림·서명·접근 제한 / Global deadline, notification, signature, and access policies | 관리자 정책 탭. 긴 화면은 마감/알림과 서명/보안으로 분리. |
| 16-spaces | 관리자 가이드 | 적용 스페이스 | 적용 스페이스와 개별 정책 / Enabled spaces and space policy | 스페이스 목록과 정책 편집. 전역 상속과 재정의를 함께 표시. |
| 17-lines | 관리자 가이드 | 결재선 | 다단계 결재선과 필요한 승인 수 / Approval steps and required approval counts | 결재선 이름·단계·승인 수·적용 스페이스·저장 포함. |
| 18-groups | 관리자 가이드 | 승인 그룹 | 승인 그룹 구성과 통과 조건 / Approval group members and passing rule | 직접 구성 테스트 그룹. 유형·구성원·전원/1인 승인 포함. |
| 19-access | 관리자 가이드 | 승인자 | 승인자 명부와 등록 사용자 관리 / Approver list and registered users | 테스트 사용자만 표시. 검색·추가·저장 위치 포함. |
| 20-audit | 관리자 가이드 | 변경 이력 | 설정 변경 시각·사용자·영역·동작 / Time, user, area, and action in the change log | 테스트 정책 변경 후 해당 이력과 표 머리글 캡처. |
| 21-retention | 관리자 가이드 | 데이터 관리 | 저장 공간과 보관 기간·내보내기 / Storage, retention period, and export | 사용량·보관 기간·내보내기·삭제 버튼 상태 포함. 운영 기록을 삭제하지 않음. |

## 첨부 후 확인

1. 해당 언어의 실제 파일을 첨부하고 표시된 위치에 삽입합니다.
2. 파일명·언어·버튼 문구·대체 텍스트를 확인합니다.
3. 삽입 위치 안내 블록을 제거하고 게시합니다.
4. 게시된 페이지 본문에서 이미지가 보이는지 확인한 뒤 완료로 기록합니다.
