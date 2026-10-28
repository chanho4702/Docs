# v2 결정 사항 (2026-07-01, 사용자 확정)

## D-2 계층 깊이 → 커스텀 필드 기반 임의 깊이 + 순환 방지
- 계층(부모-자식)은 **`wbsParentField`(앱 커스텀필드)로 정의**, **임의 깊이(3단계 이상) 가능해야 함**.
- **순환 구조는 반드시 차단** → `detectTreeCycle`(기구현) 유지.
- Jira 네이티브 parent(3레벨 제약)는 read 폴백으로만(현행 effectiveParent = wbsParent ?? jiraParent 유지).
- ⇒ 계층은 **현행 로직 유지**. 유일한 문제였던 readOnly write는 `updateAppCustomFieldValue`(app/field/value, asApp)로 수정 완료(2026-07-01).

## D-1 선후행 링크 → Jira 네이티브 이슈 링크로 전환
- 의존(선후행)은 **`predecessorsField` 폐기 → Jira 네이티브 issueLink** 사용.
- 링크 타입 **"Blocks / is blocked by" 고정**(선행이 후행을 blocks). 추후 설정화는 별도.
- write asUser (`POST/DELETE /rest/api/3/issueLink`), read `fields=issuelinks`.
- `detectDagCycle`(기구현) 유지 — 네이티브 링크 그래프 기준.
- ⇒ 이게 "선 안 나옴"의 근본 해결책(readOnly object write 실패 회피).

## R4 미일정 편집 → updateGanttSchedule 재사용 + 진입점 추가 (프론트)

## 구현 범위 (이번 파이프라인)
1. **백엔드**: setGanttLink 를 네이티브 issueLink add/remove 로 재구현. getProjectGanttData read 를 issuelinks 기반 Link 조립으로 전환. predecessorsField 페치/파싱 제거(또는 미사용). 계층(setGanttParent/wbsParentField)은 write 수정본 유지.
2. **프론트**: 링크 계약 shape 동일 → 훅/intercept 최소 변경. R4 미일정 편집 진입점 추가.
3. **manifest**: predecessorsField 제거 여부 검토(read 미사용화 후). wbsParentField 유지.

상세 설계: `01_architect_design_v2_native.md` 참조.
