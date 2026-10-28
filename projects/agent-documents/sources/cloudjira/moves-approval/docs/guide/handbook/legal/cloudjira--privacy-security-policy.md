# Moves Approval for Confluence — Privacy & Security Policy

**Effective date:** October 22, 2026  
**Operator:** Dmove  
**Contact:** support@dmove.kr · https://dmove-addons.atlassian.net/servicedesk/customer/portal/1

This policy applies only to **Moves Approval for Confluence Cloud**. It explains what the app processes, why it is processed, where it is stored, how long it is retained, and how to contact us about privacy or security.

## 1. Data the app processes

Moves Approval stores the following data to provide approval workflows and audit records:

- page ID, title, version, and area identifier or hash;
- Atlassian account IDs of requesters, approvers, delegates, Cc recipients, and administrators;
- approval steps, status, deadlines, timestamps, decisions, review notes, and rejection or withdrawal reasons;
- in-app notifications and approval roles;
- signature images, salted PIN hashes, PIN failure counts, and delegation periods and notes; and
- app settings, enabled spaces, approval lines and groups, access lists, retention settings, and settings change logs.

The app reads names, email addresses, and profile pictures from Atlassian for display and does not copy them into its approval database. It may read page content when checking a version or approval area and when calculating a certificate fingerprint, but it does not retain page bodies. Plain-text PINs are never stored.

## 2. Purpose and use

The data is used to create and route approval requests, enforce approval order and permissions, record decisions, show history and notifications, support delegation and signatures, create customer-requested exports and certificates, and operate administrator settings. We do not sell customer data or use it for advertising.

User actions run with the user's Confluence permissions. Lists and details are restricted to pages the user can view. Background processing may use app permissions where no user context exists, but content read that way is used only for a hash or state decision and is not returned to another user.

## 3. Storage, subprocessors, and international transfer

Approval data and settings are stored in Atlassian Forge SQL and Key-Value Store. Moves Approval does not connect to a customer-operated server and does not send approval records or page content outside Atlassian Forge.

For unhandled errors in app screens, Moves Approval may send limited diagnostic data to **Sentry in the United States**: error type, message, stack trace, and browser and operating-system type. It does not send Atlassian account IDs, names, email addresses, page URLs, titles or bodies, approval notes or reasons, cookies, console logs, or click history. Sentry receives this data only to diagnose and improve app reliability.

Atlassian provides the hosting and security controls for Forge storage. Access to app data is limited through backend resolvers and Confluence permission checks.

## 4. Retention and deletion

- Finished approval records default to a three-year retention period. Administrators may choose forever or 1, 3, 5, or 10 years. An administrator must export and confirm the covered range before deletion; open requests are excluded.
- In-app notifications are removed after 180 days, and settings change logs after one year.
- Users can change or remove their signatures, PINs, and delegations.
- The app reports stored account IDs to Atlassian's Personal data reporting API every seven days. When Atlassian reports that an account is closed, the app deletes that account's signature, PIN, delegation, and received notifications and removes it from approver and settings-administrator lists. Account IDs in approval and audit records remain subject to the configured retention policy.
- Certificate PDFs are generated for download and are not retained by the app. Files downloaded by customers are controlled by the customer after download.
- Data remaining after uninstall follows Atlassian Forge platform retention and recovery policies; uninstall does not mean that every record is immediately erased.

## 5. Confluence changes and customer responsibility

At a requester's direction, the app can insert a stamp box into a page. If an administrator enables Confluence comment notifications, the acting user can create an @mention comment. These page elements and comments may remain in Confluence after the app is removed and are governed by the customer's Confluence permissions and retention settings.

Customers are responsible for the people they appoint as approvers and administrators, the information entered in notes and reasons, access to exported Excel or PDF files, and the retention, sharing, and disposal of downloaded files.

## 6. Requests and contact

Users can manage their signature, PIN, and delegation in the app. Individual approval decisions are organizational audit records and cannot be edited or deleted by an individual user. For access, correction, deletion, security, or privacy questions, contact the site administrator or Dmove at support@dmove.kr or through the service desk above. We may need the site URL, app version, and relevant request identifier to investigate, but do not send passwords, PINs, API tokens, or unrelated confidential content.

## 7. Policy changes

We may update this policy when the app, subprocessors, or legal requirements change. The effective date will be updated on this page. Material changes will also be announced through the applicable release notes or product documentation.

---

# Moves Approval for Confluence — 개인정보 및 보안 정책

**시행일:** 2026년 10월 22일  
**운영 주체:** Dmove  
**문의:** support@dmove.kr · https://dmove-addons.atlassian.net/servicedesk/customer/portal/1

본 정책은 **Moves Approval for Confluence Cloud**에만 적용됩니다. 앱이 처리하는 데이터, 처리 목적, 저장 위치, 보관 기간, 개인정보·보안 문의 방법을 설명합니다.

## 1. 앱이 처리하는 데이터

Moves Approval은 결재 절차와 감사 기록을 제공하기 위해 다음 데이터를 저장합니다.

- 페이지 ID, 제목, 버전, 영역 식별자 또는 해시
- 요청자, 결재자, 대리 결재자, 참조자, 관리자의 Atlassian account ID
- 결재 단계, 상태, 마감, 시각, 결정, 검토 메모, 반려·회수 사유
- 앱 내 알림과 결재 역할
- 서명 이미지, salt 처리된 PIN 해시, PIN 실패 횟수, 위임 기간과 메모
- 앱 설정, 적용 스페이스, 결재선·그룹, 접근 목록, 보관 설정, 설정 변경 이력

이름, 이메일 주소, 프로필 사진은 화면 표시에 필요할 때 Atlassian에서 조회하며 결재 데이터베이스에 복사해 저장하지 않습니다. 버전·결재 영역 확인과 증명서 지문 계산에 필요한 페이지 본문을 읽을 수 있지만 본문은 보관하지 않습니다. 평문 PIN은 저장하지 않습니다.

## 2. 처리 목적과 사용

데이터는 결재 요청 생성·전달, 순서와 권한 적용, 결정 기록, 이력·알림 표시, 위임·서명 지원, 고객이 요청한 내보내기·증명서 생성, 관리자 설정 운영에 사용합니다. 고객 데이터를 판매하거나 광고에 사용하지 않습니다.

사용자 작업은 해당 사용자의 Confluence 권한으로 실행됩니다. 목록과 상세는 사용자가 볼 수 있는 페이지로 제한됩니다. 사용자 컨텍스트가 없는 백그라운드 처리는 앱 권한으로 콘텐츠를 읽을 수 있지만, 이때 읽은 내용은 해시 또는 상태 판정에만 사용하며 다른 사용자에게 반환하지 않습니다.

## 3. 저장 위치, 하위 처리자, 국외 이전

결재 데이터와 설정은 Atlassian Forge SQL과 Key-Value Store에 저장됩니다. Moves Approval은 고객이 운영하는 서버에 연결하지 않으며 결재 기록이나 페이지 콘텐츠를 Atlassian Forge 외부로 보내지 않습니다.

앱 화면에서 처리되지 않은 오류가 발생하면 제한된 진단 정보인 오류 종류·메시지·스택 추적·브라우저 및 운영체제 종류를 **미국 리전의 Sentry**로 전송할 수 있습니다. Atlassian account ID, 이름, 이메일 주소, 페이지 URL·제목·본문, 결재 메모·사유, 쿠키, 콘솔 로그, 클릭 이력은 전송하지 않습니다. Sentry는 앱 신뢰성 진단과 개선에 필요한 범위에서만 이 정보를 처리합니다.

Atlassian이 Forge 저장소의 호스팅과 보안 통제를 제공합니다. 앱 데이터 접근은 백엔드 resolver와 Confluence 권한 검사를 통해 제한합니다.

## 4. 보관과 삭제

- 종료된 결재 기록의 기본 보관 기간은 3년입니다. 관리자는 무기한 또는 1·3·5·10년을 선택할 수 있습니다. 관리자가 대상 범위를 내보내고 확인한 뒤 삭제하며 진행 중 요청은 제외됩니다.
- 앱 내 알림은 180일 뒤, 설정 변경 이력은 1년 뒤 정리됩니다.
- 사용자는 자신의 서명, PIN, 위임을 변경하거나 삭제할 수 있습니다.
- 앱은 저장한 account ID를 7일마다 Atlassian Personal data reporting API에 보고합니다. Atlassian이 폐쇄된 계정이라고 알리면 해당 계정의 서명·PIN·위임·수신 알림을 삭제하고 결재자 및 설정 관리자 목록에서 제거합니다. 결재·감사 기록의 account ID는 설정된 보관 정책을 따릅니다.
- 증명서 PDF는 다운로드할 때 생성하며 앱에 사본을 보관하지 않습니다. 다운로드한 파일은 이후 고객이 관리합니다.
- 앱 제거 뒤 남아 있는 데이터는 Atlassian Forge 플랫폼의 보관·복구 정책을 따릅니다. 앱 제거가 모든 기록의 즉시 삭제를 뜻하지는 않습니다.

## 5. Confluence 변경과 고객 책임

요청자가 선택하면 앱이 페이지에 결재란을 삽입할 수 있습니다. 관리자가 Confluence 댓글 알림을 켜면 작업 사용자가 @mention 댓글을 만들 수 있습니다. 이러한 페이지 요소와 댓글은 앱 제거 뒤에도 Confluence에 남을 수 있으며 고객의 Confluence 권한과 보관 설정을 따릅니다.

고객은 결재자와 관리자 지정, 메모·사유에 입력하는 정보, 내보낸 Excel·PDF 파일의 접근, 다운로드한 파일의 보관·공유·폐기를 관리합니다.

## 6. 요청과 문의

사용자는 앱에서 서명, PIN, 위임을 관리할 수 있습니다. 개별 결재 결정은 조직의 감사 기록이므로 개인 사용자가 수정하거나 삭제할 수 없습니다. 열람·정정·삭제·보안·개인정보 관련 문의는 사이트 관리자 또는 support@dmove.kr, 위 서비스 데스크로 보내 주십시오. 조사에 사이트 URL, 앱 버전, 관련 요청 식별자가 필요할 수 있으나 비밀번호, PIN, API token 또는 관련 없는 기밀 내용은 보내지 마십시오.

## 7. 정책 변경

앱, 하위 처리자 또는 법적 요구사항이 바뀌면 본 정책을 변경할 수 있습니다. 변경 시 이 페이지의 시행일을 갱신합니다. 중요한 변경은 해당 릴리스 노트 또는 제품 문서에도 공지합니다.
