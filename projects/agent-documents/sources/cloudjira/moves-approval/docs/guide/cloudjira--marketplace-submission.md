# Marketplace 제출 문안 — Moves Approval for Confluence

> 작성 2026-10-20 · 기준 커밋 `f4cbd7c` · 질문 목록은 Atlassian 문서(developer.atlassian.com/platform/marketplace/security-privacy-tab/) 기준
> 폼에 붙여 넣을 문안은 영어, 판단 근거·확인할 점은 한국어 메모(▸)로 달았다.
> `[대괄호]` 는 회사 정보로 채울 자리다.

---

## 1. Privacy & Security 탭

### 1-1. Data storage and processing

**Does your app store End-User Data outside Atlassian products and services (excluding logs)?**
→ **No**

**Does your app process End-User Data outside Atlassian products and services or the end-user's browser (excluding logs)?**
→ **No**

▸ 승인 데이터는 Forge SQL·KVS 에만 있고 외부 서버가 없다. Sentry 는 아래 1-2 참고 — manifest 에 `inScopeEUD: false` 로 선언했고, 보내는 내용(예외 타입·스택·브라우저/OS 종류)은 End-User Data 가 아니라는 판단이다.
▸ **전제 조건:** Sentry 프로젝트 설정에서 **Security & Privacy → "Prevent Storing of IP Addresses"** 와 **Data Scrubber** 를 켜 둘 것. SDK 는 `sendDefaultPii: false` 에 user 필드를 지우지만, 서버 쪽 IP 저장은 프로젝트 설정으로 막아야 "No" 가 확실해진다.

**Does your app log End-User Data?**
→ **No**

> Server logs (Forge platform logs, retained within Atlassian) contain error codes and technical identifiers only. The app never logs names, email addresses, page titles or content, rejection reasons, or other user-entered text.

▸ 실제 코드: `executeQuery` 는 파라미터를 버리고, 오류 로그는 메시지 문자열만 남긴다(`AGENTS.md` 보안 규칙). 스페이스 키가 로그에 남는 곳이 한 군데(`SettingsRepository` 정책 파싱 실패) 있다 — 고객이 이를 EUD 로 볼 여지가 걱정되면 "Yes" + 위 문장으로 답해도 된다.

**Does your app process and/or store End-User Data in logs outside Atlassian products and services?**
→ **No**

### 1-2. Integrations and third parties

**Does your app expose any remote REST APIs for integration with other tools?**
→ **No**

**Does your app share End-User Data with third parties (e.g., sub-processors)?**
→ **No**

▸ 보수적으로 공개하고 싶으면 "Yes" 로 바꾸고 아래를 넣는다(이 경우 1-1 의 process 질문도 Yes 로 맞춰야 일관된다).

> Sentry (Functional Software, Inc.) — sentry.io — United States — Error diagnostics for the app's browser screens: unhandled error type, message, stack trace, app environment, and browser/OS type. No account IDs, names, emails, page URLs, titles, content, cookies, headers, console logs, or navigation history are sent.

**Does your app share logs that include End-User Data with third parties?**
→ **No**

**Does this app define customer-managed egress at runtime?** — Atlassian 자동 기입(답하지 않음)

### 1-3. Data residency, retention, and protection

**Does your app support data residency options?**
→ **Yes, app stores data exclusively within Atlassian products that support residency (including Forge platform)**

▸ 근거: 저장소가 Forge SQL·KVS 뿐이고, 배포 시 Forge 가 "Runs on Atlassian 대상"으로 판정했다(2026-10-20 development 배포 6.0.0). production 배포 후에도 같은 판정인지 developer console 에서 확인할 것.

**Does your app support migration of in-scope End-User Data between residency locations?**
→ **Yes**

▸ Forge 호스팅 저장소는 플랫폼이 사이트 realm 이동을 처리한다. 확신이 없으면 developer console 의 data residency 항목을 확인한 뒤 답한다.

**Does your app store End-User Data after a customer uninstalls it?**
→ **No**

> All app data is held in Forge hosted storage. After uninstallation it is handled under the Atlassian Forge platform's data retention and deletion policy; the partner keeps no copy.

▸ 플랫폼이 언인스톨 후 일정 기간 보관하는 것은 앱의 보관이 아니다. 폼이 "플랫폼 보관 포함"으로 읽히면 Yes + Forge 정책의 기간을 적는다(현재 Forge 문서에서 기간을 확인할 것).

**Does your app allow customers to request a custom End-User Data retention period?**
→ **Yes**

> Administrators set the retention period for finished approval records in the app (forever, 1, 3, 5, or 10 years; 3 years by default). Records past the period are exported to Excel and then deleted by the administrator. In-app notifications are deleted after 180 days and the settings change log after one year.

**Does your app use privacy enhancing technologies (PETs)?**
→ **Yes**

> Pseudonymization: users are stored only as Atlassian account IDs; names, emails, and avatars are never stored and are resolved from Confluence at display time. Signature PINs are stored only as salted PBKDF2 hashes. Personal data of closed accounts (signatures, PINs, delegations, notifications) is erased through the Personal data reporting API.

### 1-4. Privacy and legal

**Is your company a GDPR "data controller" for this app?**
→ **No**

**Is your company a GDPR "data processor" for this app?**
→ **No**

▸ 회사가 고객 데이터를 받거나 다루는 서버가 없다(Atlassian 이 Forge 저장소를 운영). 지원 요청으로 고객이 보내는 자료를 처리하는 것은 앱이 아니라 지원 채널의 문제다. 법무 판단이 다르면 그쪽을 따른다.

**Is your company a CCPA "business" for this app?** → **No**
**Is your company a CCPA "service provider" for this app?** → **No**

**Does your app have a Data Processing Agreement (DPA) for customers?**
→ **No** (데이터 처리자가 아니므로. DPA 를 준비하면 링크를 넣는다)

**Does your app transfer EEA residents' End-User Data outside the EEA?**
→ **No**

▸ Sentry 를 EUD 공유로 답했다면 이 질문도 Yes + 전송 근거(SCC 등)를 넣어야 한다. 1-2 를 No 로 두는 것이 일관된다.

**Privacy policy link** → `[회사 개인정보처리방침 URL]`

▸ 방침에 들어가야 할 것: 운영 주체·연락처, 앱이 저장하는 데이터(08 문서 표), 보관 기간, 계정 폐쇄 시 삭제, Sentry(미국) 오류 진단, 권리 요청 절차.

### 1-5. Security

**Security contact email** → `[security@회사도메인]`
**Security policy** → `[보안 정책 URL]` (없으면 비워 둔다)
**CAIQ Lite completed?** → **No** (작성하면 링크)

**Does your app use full disk encryption at rest for End-User Data stored outside Atlassian or the user's browser?**
→ **No** — 외부에 저장하는 EUD 가 없다. 폼이 N/A 를 허용하지 않으면 No 를 고르고 아래를 덧붙인다.

> The app stores no End-User Data outside Atlassian; all data is in Forge hosted storage, which Atlassian encrypts at rest.

**Does your app access Atlassian PATs, user account passwords, or another shared secret?**
→ **No**

▸ 서명 PIN 은 앱 자체의 확인 수단이고 Atlassian 비밀번호가 아니다. 원문은 저장하지 않는다(PBKDF2 해시).

### 1-6. Integration permissions and compliance

**Justification for the scopes requested by the app:**

> - `read:page:confluence`, `read:content-details:confluence`, `read:confluence-content.summary` — read title and version of pages under approval, receive page-updated events (this event requires the classic scope), and compute region content hashes and certificate fingerprints.
> - `write:page:confluence` — insert the approval stamp box macro at the top of a page, with the requester's permissions, only when the requester chooses it.
> - `read:space:confluence` — choose enabled spaces and show space names.
> - `read:content.permission:confluence` — check whether users and approvers can view or edit a page.
> - `read:user:confluence` — search approvers and Cc recipients, and show names.
> - `read:group:confluence` — resolve Confluence groups and members for approval groups.
> - `read:comment:confluence`, `write:comment:confluence` — post optional @mention comments so Confluence's own notifications reach the people involved.
> - `storage:app` — store app data in Forge storage.
> - `report:personal-data` — report stored account IDs through the Personal data reporting API and erase personal data of closed accounts.

**Does your app have any compliance certifications?** → **No**

---

## 2. 심사자 안내 (Review / testing instructions)

▸ 제출 폼의 "Testing instructions" 또는 심사 티켓에 그대로 붙인다. 계정 정보는 문서가 아니라 티켓의 비공개 필드로 전달한다.

```text
Moves Approval for Confluence — reviewer instructions

WHAT THE APP DOES
Sequential approval for Confluence Cloud pages and for selected regions within a page.
Requesters pick approvers per step; approvers decide in an approval inbox. A stamp box
macro shows steps, approvers and stamps in the page. Finished approvals can be downloaded
as certificate PDFs. UI in English and Korean (follows the user's Confluence language).

ENTRY POINTS
- Below the page title (byline): "Moves Approval" item — shows status, opens the approval dialog.
- Page ••• menu: "Request approval".
- Apps menu / space sidebar: "Moves Approval" — approval inbox and Settings.
- Editor macros: "Moves Approval Region" (approve part of a page), "Moves Approval Stamps" (stamp box).

TEST ACCOUNTS (provided privately in the ticket)
- Admin: site admin (app settings).
- User A: requester, can edit the test page.
- User B, User C: approvers, can view the test page.
- User D: cannot view the test page (permission checks).
No external account, server, or configuration is needed.

SUGGESTED FLOW (about 15 minutes)
1. As A, open the test page → byline "Moves Approval" → request approval with
   step 1 = B, step 2 = C. Leave "Add a stamp box" checked.
   Expected: request created; a stamp box macro appears at the top of the page.
2. As C, open the inbox. Expected: not C's turn yet; C cannot approve.
3. As B, approve from the inbox. As C, approve.
   Expected: request APPROVED; stamps show in the stamp box and in the details dialog.
4. As A, request again; as B, reject with a reason.
   Expected: REJECTED with the reason in the audit timeline.
5. As A, request again, edit the page, then use "Resubmit for the new version".
   Expected: editing alone does not close the request; resubmission supersedes it.
6. As D, open the inbox and the request link.
   Expected: the page is not listed; details are denied.
7. Region approval: insert "Moves Approval Region" around some text, publish,
   request approval for that region. Deleting the macro later withdraws the request
   at the next daily check.
8. Finished request → details → "Approval certificate (PDF)".
   Inbox → "Export to Excel".
9. Admin → Settings: policies, enabled spaces, approval flows and groups,
   Data management (storage usage, record retention).

OPTIONAL FEATURES (enable in Settings → Policy)
- Signature + PIN: My signature tab → draw a signature, set a PIN; with "Require the signature PIN to confirm approvals and rejections"
  each decision asks for the PIN (5 failures lock it for 15 minutes).
- Delegation: My delegation tab → delegate to another user for a period; the delegate
  sees the delegator's pending items in the "My turn" tab and decides on their behalf.

NOTES FOR REVIEW
- Scheduled cleanup (deadline expiry, reminders, retention of notifications) runs once a day.
  Overdue requests already show as overdue and refuse decisions before that run.
- The app sends no email; notifications are in-app, plus optional @mention comments
  that Confluence delivers.
- Licensing: paid app (app.licensing.enabled). With an inactive license every screen shows a
  purchase notice and feature calls are refused (LICENSE_INACTIVE); region macro content and
  the byline status stay visible so customer content is never hidden.
- Egress: Sentry only, for unhandled browser-side errors (category analytics,
  inScopeEUD false); no customer data.
- Documentation: [Documentation URL]
- Support: [Support URL / email]
```

---

## 3. 제출 전에 채우거나 확인할 것

- [ ] Sentry 프로젝트: "Prevent Storing of IP Addresses"·Data Scrubber 켜기 (1-1 의 "No" 전제)
- [ ] `[대괄호]` 자리: 개인정보처리방침·보안 연락처·문서·지원 URL
- [ ] 1-4 GDPR/CCPA 답은 법무 확인
- [ ] 1-3 data residency·언인스톨 보관 기간은 production 배포 후 developer console 과 Forge 현행 문서로 확인
- [ ] 심사용 테스트 계정 A~D 와 테스트 페이지 준비(비밀번호는 티켓 비공개 필드로만)
- [ ] 문서 URL 의 가이드를 현재 내용으로 재게시(개인정보·미결제 문구가 바뀌었다)
