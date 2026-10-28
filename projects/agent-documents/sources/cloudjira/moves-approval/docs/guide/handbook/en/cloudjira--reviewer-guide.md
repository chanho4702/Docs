# Marketplace reviewer walkthrough

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--reviewer-guide.md)

A reproducible path from installation to approval, permission checks, and record retention. The table contains expected results, not executed test evidence or an approval report.

## App and documentation

Moves Approval for Confluence provides sequential approval for Cloud pages or areas and records decisions against versions. Features include saved lines, groups, Cc, delegation, signature PINs, bulk approval, stamp boxes, and PDF certificates.

See [quick start](cloudjira--quick-start.md), [installation](cloudjira--installation.md), and [data and security](cloudjira--data-security.md). This is not documentation for a Jira or Confluence Data Center app.

![Approval inbox showing the review entry point and the main personal feature tabs](../assets/ma-05-inbox-2026-10-26.jpg)

*The deployed staging inbox shows My turn, In progress, My requests, Handled, Cc, Notifications, My signature, My delegation, and the Excel export entry point in one view.*

## Prepare the test

| Item | Preparation |
| --- | --- |
| Submitted version | Owner provides installation link, version, and access instructions. |
| Requester A | Edit permission on the test page. |
| Approvers B and C | View permission; also comment permission when testing comments. |
| Restricted user D | No view permission on that page. |
| Test pages | A page approval target and a page with an area macro. |
| Special records | Links, request IDs, and dates for overdue and past-retention test records. |

## Procedure and expected results

Use separate requests for terminal outcomes. Restore policy changes before the next scenario.

| Check | Action | Expected result |
| --- | --- | --- |
| Entry and installation | Open inbox, page dialog, settings | Views load; normal page editing still works. |
| Sequential approval | A requests B → C; both approve | C cannot decide early; final step completes approval. |
| Rejection and withdrawal | B rejects one request; A withdraws another | Terminal states, reasons, and actors are recorded. |
| Page changes | Edit during review, then resubmit | Editing alone does not end it; resubmission replaces it. |
| Area | Request area approval, then remove the macro | Separate target status; removal withdraws the area request. |
| Permission | D attempts list and detail access | Restricted page information is not exposed. |
| Deadline | Try a decision and new request on overdue test data | Decision refused; new request expires the old one. |
| PIN and delegation | Decide under required PIN and valid delegation | PIN checked; original and actual actors recorded. |
| Cc and notifications | Check creation, results, and comments | Cc cannot decide; comment failure does not undo a decision. |
| Bulk approval | Select several current-turn requests | Per-request success/failure counts shown. |
| Files | Download finished-request PDF and inbox Excel | Target version/request ID and list-export scope can be checked. |
| Cleanup | Export past-retention records, then delete | Only confirmed export scope deleted; open requests excluded. |
| Languages | Use Korean and English accounts | Equivalent functions and corresponding guides available. |
| License | Test inactive license in paid-release configuration | Every screen (including settings) and macro shows a purchase notice; all feature calls rejected. Area-macro content and byline status remain. |

Record the submitted version, date/time zone, roles, actual results, and screenshots. Do not change production record dates to prepare deadline or retention tests.

## Submission materials

- Verify every public documentation page and image while signed out.
- Put working support, operator, privacy-policy, and customer EULA URLs in the listing. In the version's **Links** section, select Atlassian's Standard Agreement or provide a counsel-reviewed custom EULA URL, and record which option was used. Do not submit drafts, internal URLs, or placeholders.
- Match the app name, description, Cloud product, pricing, trial, permissions, and images to the submitted version, and provide an install link and reviewer access steps.
- Complete the **Privacy & Security** tab so its storage, egress, PAT/shared-secret, scope-justification, and privacy-policy answers match this technical documentation.
- For a new app, complete app and partner security questionnaires, the one-time partner identity/business verification, automated vulnerability scanning, and Marketplace manual review. Fix and resubmit for any blocking Critical or applicable High finding.
- Attach the submitted version, site, account roles, execution time, actual results, and screenshots to the review ticket. Expected results in this guide are not execution evidence.

## Stop conditions before submission

Do not submit while any of these conditions remains:

- A documentation, image, support, privacy-policy, or EULA link requires login, returns an authorization error, or is missing.
- Listing copy or screenshots do not match the submitted app's menus, behavior, or permissions.
- Reviewer accounts cannot reproduce installation, settings, request, decision, and file-download paths.
- Privacy & Security answers conflict with Forge storage, Sentry egress, or requested scopes.
- Area macro, licensing, restricted-page, deadline, or retention scenarios hang or behave differently from the documentation.
- A security questionnaire, partner verification, vulnerability remediation, or requested review-ticket artifact is incomplete.

Check final requirements against [Atlassian app approval guidelines](https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/), the [new security approval workflow](https://developer.atlassian.com/platform/marketplace/app-approval-security-workflow/), [Privacy & Security tab guidance](https://developer.atlassian.com/platform/marketplace/security-privacy-tab/), and [data privacy guidelines](https://developer.atlassian.com/platform/marketplace/data-privacy-guidelines/). Publishing documentation alone does not complete app review or security certification.
