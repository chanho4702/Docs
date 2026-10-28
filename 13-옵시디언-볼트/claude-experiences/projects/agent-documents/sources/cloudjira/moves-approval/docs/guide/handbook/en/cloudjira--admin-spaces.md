# Enabled spaces and space policies

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--admin-spaces.md)

Choose spaces that allow new requests and define policy exceptions. For example, Legal can use a three-day deadline while other spaces follow the global default.

**Location:** Settings → **Enabled spaces**.

## Set the scope

1. Review the initial notice that approvals are available in all spaces.
2. Search by name or key and load more entries if needed. **Enabling the first space immediately restricts new requests in other spaces**, so decide the scope before changing a toggle.
3. Change the required space toggles individually. Each change is saved immediately; check the result and any error.
4. If an excluded space has open requests, review the warning and confirm its exclusion.

## Set an exception

Open **Edit policy** on a space row. Enable only the items you want to override, enter values, and save. Disabled items inherit global policy. Overriding the deadline alone leaves other request defaults inherited.

In the current version, **PIN requirements, delegation, and signature display** use global policy. Space overrides for these items do not change their runtime behavior.

| Item | Scope and action | Check |
| --- | --- | --- |
| Disable a space | Restricts new requests and area use there | Open requests are not closed automatically. |
| Disable an override | Restores global inheritance for that item | Check the displayed inherited value. |
| Access restriction / status labels | Global only | Cannot be set per space. |

After saving, open a new request on a test page in that space to inspect defaults. Users with the required page permission can still handle existing requests in the inbox after the space is excluded.
