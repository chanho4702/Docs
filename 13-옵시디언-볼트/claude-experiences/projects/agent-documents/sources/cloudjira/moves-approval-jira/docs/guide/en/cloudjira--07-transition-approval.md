# Status change approval availability

The current code contains status change approval services, automatic application, a workflow validator and a **Request status change approval** manifest entry. The server feature defaults to off.

However, the current basic approval settings screen provides only automatic worklog requests and automatic closing; it has no status-feature toggle. The project settings entry renders only worklog issue exceptions. **This is therefore not documented as a released feature that a regular administrator can fully configure through the UI.**

Confirm support in a version where the vendor has completed screen wiring, installation upgrade and live-account verification. Direct storage edits or hidden resolver calls are not installation instructions.

The server distinguishes approval completion from successful Jira application. Application uses requester permissions and does not resubmit unknown outcomes. These implementation details do not prove a successful transition in the deployed environment.

[Documentation home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--07-transition-approval.md)
