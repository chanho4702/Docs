## Purpose and access

Define job levels and, under level-band salary policy, the annual salary bands used for cost estimates. Level management read opens the screen; write permits adding, editing, deleting, quick add, and band changes. Monetary band fields follow the applicable Cost or Level management access. A readable level-name list does not guarantee access to band amounts.

People management and Settings readers can also obtain level choices for their forms and missing-band checks.

## Register levels

Use Add level for a name, description, and band. Quick add provides schemes such as Junior/Senior, G1–G5, Korean job grades, and bands. The table displays level, description, salary range, and the representative value used in calculation.

> **[Image insertion point · additional capture needed]** Level list and add dialog with lower bound, upper bound, representative value, and midpoint calculation. Use fictitious amounts.

## Salary-band rules

| Field | Rule |
|---|---|
| Lower and upper bounds | Non-negative; the lower bound cannot exceed the upper bound |
| Representative value | Used in annualized cost calculation. An empty value can use the midpoint when both valid bounds exist |

Calculate midpoint fills the representative value. A representative value outside the range triggers a warning but can be saved. Under individual salary policy, bands are not used; the screen provides a settings link.

## Missing prices

If no valid representative value or midpoint can be determined under level-band policy, the person's calculated cost is zero and is treated as unpriced. Review missing-band warnings when changing policy and the unpriced-member indicator in cost views. This does not mean the person's work is free.

Levels are used by People management, project members and cost calculations, dashboard distributions, and resource filters.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Levels connect personnel definitions to level-based costs. Salary bands are annual amounts; do not enter monthly pay or abbreviated monetary units.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Add Level / name / description | Register an organizational level. Levels remain usable under Per person, but their bands are not the cost basis. | Check the policy notice/list. Entering a band does not itself switch salary policy. |
| Min / Max | Enter nonnegative numbers with min ≤ max. Empty means unset/cleared, different from zero. | Enter whole amounts in the currency’s base unit. Decimal points, minus signs, and letters are stripped during entry; verify the displayed number and amount hint. A minimum above the maximum blocks saving. |
| Representative / Use midpoint | The representative annual amount is used for cost. With no representative and valid min/max, the midpoint is filled. | An out-of-range representative warns but can still be saved; verify that it is intentional. |
| Quick Add / Edit / Delete | Add selected career-stage presets or edit/delete existing levels. Existing presets are skipped. | Deleting an in-use level can be blocked. Before clearing amounts, check affected costs/missing-basis warnings. |



<!-- control-reference:end -->

