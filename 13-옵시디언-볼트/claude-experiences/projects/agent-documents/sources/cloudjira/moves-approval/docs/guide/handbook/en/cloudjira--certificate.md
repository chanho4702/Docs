# Approval certificate PDF

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--certificate.md)

Keep a finished request's target version, approval line, and decision history as a PDF. Anyone who can view the page can download it. Open requests have no certificate button.

## Download a certificate

1. Open a finished request from the page or inbox.
2. Verify the request ID, status, and target version currently shown. Expanding **Approval history by version** does not change the PDF target to an earlier request.
3. Select **Approval certificate (PDF)** beside the dialog title.
4. Open the downloaded file and verify the page, request ID, version, decisions, and issue time.

## Read the PDF

| Content | How to use it |
| --- | --- |
| Page and request | Identify the target, requester, time, and note. |
| Target and current versions | Check whether approval applies to the current page. |
| Stamps and history | Review decision makers, times, delegation, and reasons. |
| Document fingerprint | SHA-256 of the target version's body. Area approvals also use the full page body. |
| Issue information | Check the issuer, issue time, and request ID. |

## Limits to understand

If the target version cannot be read, the PDF is issued without a fingerprint. Check for that condition even when download succeeds. The main PDF content is rendered as images, limiting search and copying. The request ID and fingerprint are also included as text in page footers and document properties.

The fingerprint helps identify content. The certificate alone does not establish a separate security certification or legally qualified electronic signature. Downloaded files contain names and reasons; keep them in your organization's records location.

## Troubleshooting

If the button is missing, check finished status and page permission. Retry a failed download. For repeated failure, include the request ID, time, and error message in a [support request](cloudjira--faq.md).
