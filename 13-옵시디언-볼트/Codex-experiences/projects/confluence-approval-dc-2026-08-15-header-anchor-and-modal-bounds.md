# Confluence Approval DC header anchor and modal bounds

2026-08-15: The Confluence 9 `system.header/left` renderer does not reliably retain a web-item `linkId`. Header-menu JavaScript therefore resolves the entry anchor by its id, the anchor `styleClass`, or `li.styleClass > a` before attaching the popover.

The approval request modal applies `box-sizing: border-box` and `max-width: 100%` to inputs, selects, and the request message textarea. This prevents the message field from extending beyond its parent container.

Validation: Maven package for `approval-domain` and `approval-confluence9` passed, with 54 domain and 112 Confluence 9 tests.
