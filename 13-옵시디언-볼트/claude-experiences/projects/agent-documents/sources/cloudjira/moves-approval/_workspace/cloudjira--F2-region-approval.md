# F2 — 영역(게시글) 결재 매크로

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 이 기능이 하는 일

페이지 본문의 **일부만** 감싸 결재를 건다. 한 페이지에 여러 개를 걸 수 있고, 각 영역은 독립이다.
같은 페이지의 다른 문단을 고쳐도 내 영역 결재는 만료되지 않아야 한다 — 그게 이 기능의 존재 이유다.

## 건드릴 파일

```
static/ui/src/entries/macro.jsx                 (교체)
static/ui/src/features/region/**                (신규)
src/resolver/region/RegionService.js            (신규)
src/resolver/region/RegionController.js         (신규)
src/resolver/region/__test__/RegionService.test.js (신규)
locales/{kr,en}/macro.json                      (키 추가)
src/permission/PermissionMap.js                 (자기 항목만)
src/index.js                                    (자기 registrar 만)
```

**이미 있으니 다시 만들지 말 것**: `src/domain/approval/regionHash.js`(ADF 정규화 + `v2:` 해시,
`isRegionChanged` 포함), `src/resolver/approval/ApprovalRepository.js`.

## 영역 key — `localId` 를 쓰지 않는다

`localId` 는 draft/edit 전이와 버전마다 재발급된다는 보고가 있다. 사실이면 **페이지를 한 번
편집할 때마다 영역 key 가 바뀌어 결재 이력이 조용히 끊긴다.**

대신 UUID 를 발급해 매크로 파라미터 `regionId` 에 기입한다 — 파라미터는 본문 ADF 의 일부라
버전과 함께 보존되고 Confluence 가 재작성하지 않는다.

```
import { updateMacro, getMacroContent } from '@forge/confluence-bridge';
```
`updateMacro({ data: JSON.stringify(adf) })` 는 매크로 ADF **전체**를 받는다.
`getMacroContent()` 로 현재 내용을 읽어 `attrs.parameters` 만 덧쓴다. **편집 모드에서만 동작한다.**

| 상황 | 동작 |
|---|---|
| 편집 모드 + regionId 없음 | 발급 후 즉시 기입 |
| 뷰 모드 + regionId 없음 | **결재 차단** + "이 영역은 한 번 편집·저장해야 결재를 걸 수 있습니다" 안내 |
| 같은 페이지에 regionId 중복(복사·붙여넣기) | 뷰: 경고 + 양쪽 결재 차단 / 편집 진입 시 **뒤쪽만** 재발급 |

**순서(ordinal) 폴백을 쓰지 않는다.** 앞에 문단 하나만 추가돼도 순서가 밀려 이력이 조용히
다른 영역에 붙는다. 조용한 오염보다 명시적 차단이 낫다.

## resolver

### `getRegionApproval({ pageId, regionId })` — `{page:'view'}`
F1 의 `getPageApproval` 과 **같은 shape** 를 돌려준다(화면이 같은 컴포넌트를 쓴다).
추가로 `regionHashMatches: boolean` 을 넣는다 — 저장된 해시와 현재 본문 해시 비교 결과.

### `createRegionApproval({ pageId, regionId, regionHash, steps, expiresAt?, requestMessage? })` — `{page:'edit'}`
⚠ 상신 시점의 `regionHash` 가 서버가 다시 계산한 값과 다르면 **`REGION_CHANGED` 로 거절**한다.
상신하는 사이 남이 그 영역을 고쳤다는 뜻이다.

## UI (`entries/macro.jsx`)

매크로는 페이지당 여러 개가 뜬다. **배너와 같은 예산 제약**이 걸린다 — 무거운 컴포넌트 정적 import 금지.
인라인은 상태 Lozenge + 단계 + 액션 버튼까지. 폼·상세는 `Modal` 로 뺀다(F1 의 modal 엔트리 재사용).

⚠ bodied 매크로의 본문은 호스트가 중첩 iframe 으로 렌더한다. **본문 영역에 우리 스타일을 덮지 않는다.**

⚠ 매크로 iframe 은 자동 리사이즈되지 않을 수 있다.
`setMacroViewportHeight(height)`(`@forge/confluence-bridge`)로 내용 높이에 맞춰 조정하되,
호출 실패는 삼키고 기본 높이로 둔다.

## 테스트
1. 뷰 모드에서 regionId 가 없으면 결재를 차단하고 안내를 띄운다
2. `createRegionApproval` 이 해시 불일치를 `REGION_CHANGED` 로 거절한다
3. 중복 regionId 를 감지하면 경고를 띄우고 결재를 막는다
4. `getRegionApproval` 이 F1 과 같은 shape 를 돌려준다(키 집합 대조)
