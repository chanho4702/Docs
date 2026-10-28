# T2 — 영역 본문 해시 `v2:` (ADF 정규화)

## 배경

Confluence DC 승인 앱의 Forge(Cloud) 이식 프로젝트다.

DC에는 **영역(게시글) 결재**가 있다. 페이지 본문의 일부를 매크로로 감싸 그 부분만 결재를 건다.
페이지가 편집되면 **그 영역 본문이 실제로 바뀐 경우에만** 결재를 만료시켜야 한다 —
같은 페이지의 다른 문단을 고쳤다고 남의 결재가 만료되면 안 된다.

DC는 storage XHTML을 정규화해 `v1:` + SHA-256으로 해시했다. Cloud는 본문이 **ADF(JSON)**라
정규화 규칙을 처음부터 다시 정의해야 한다. 그것이 이 작업이다.

**반드시 먼저 읽을 것**: 저장소 루트의 `CLAUDE.md`, `AGENTS.md`.
그리고 원본 DC 구현: `C:\Onpremise\confluence-approval-dc\approval-confluence9\src\main\java\kr\dmove\confluence\approval\c9\macro\ApprovalRegionSupport.java`
(읽기 전용. 정규화 항목의 **의도**를 참고하되 XHTML 규칙을 그대로 옮기지 말 것 — 대상이 다르다.)

## 건드릴 파일 (이 목록 밖의 파일은 수정하지 말 것)

```
src/domain/approval/regionHash.js            (신규)
src/domain/approval/__test__/regionHash.test.js  (신규)
```

## 요구사항

`hashRegionBody(adfNode)` → `'v2:' + sha256hex(canonicalJSON(normalized))`

순수 함수다. `Date.now()`·난수·전역 상태를 쓰지 않는다(`CLAUDE.md` 불변식 3).
`crypto`의 `createHash`를 쓴다(같은 저장소의 `src/domain/approval/scopeKey.js` 참고).

### 제거할 것 — 편집과 무관하게 흔들리는 값

| 대상 | 왜 |
|---|---|
| 모든 노드의 `attrs.localId` | 버전마다 재발급된다 |
| `attrs` 중 `__`로 시작하는 키 전부 (`__autoSize`, `__fileName`, `__fileSize`, `__fileMimeType`, `__displayType`, `__external`, `__contextId` …) | ADF에서 `__` 접두는 파생·하이드레이션 값이다 |
| `media.attrs.occurrenceKey` | 붙여넣기·재렌더마다 새로 생성된다 |
| `mention.attrs`의 `text`, `accessLevel` (→ `id`만 유지) | 표시명이 바뀌면 해시가 흔들린다 |
| `inlineCard`/`blockCard`/`embedCard`의 `attrs.data` (→ `url`만 유지) | 스마트링크 resolve 캐시다 |
| `marks: []` (빈 배열) | 있으나 없으나 같다 |
| 최상위 `doc` 래퍼의 `version` | 문서 버전 메타다 |

### 유지할 것 — 사용자가 실제로 바꾼 것

`media.width`/`height`(리사이즈), `tableCell.attrs.colwidth`, `date.timestamp`,
`status.text`/`color`, `panel.panelType`.

### 정규화 규칙

1. **인접 text 노드 병합** — mark 집합이 같은 연속 text 노드를 하나로 합친다.
   편집 중 같은 문장이 임의로 쪼개졌다 합쳐진다.
2. **marks 정렬** — `type` 사전순. 적용 순서가 달라도 같은 결과여야 한다.
3. **공백**:
   - `codeBlock` 하위, 그리고 `code` mark가 붙은 text → **원문 보존**
   - 그 외 text → `\r\n`→`\n`, 연속 공백/탭/개행 → 스페이스 1개, 블록 경계 trim
4. **빈 문단 제거** — `content`가 비었거나 없는 `paragraph`를 없앤다.
5. **캐노니컬 직렬화** — 객체 키를 사전순으로 정렬해 JSON.stringify. 직렬화기마다 키 순서가 다르다.

### 여러 영역

같은 `regionId`를 가진 노드가 2개 이상이면 각 정규화 문자열을 `\u0000`으로 join한 뒤 해시한다.
(DC와 같은 방식. 중복 자체는 상위에서 경고로 처리한다.)

### 규칙 버전

- `hashRegionBody`는 항상 `v2:` 접두를 붙인다.
- **비교 함수 `isRegionChanged(savedHash, currentHash)`를 함께 제공한다.**
  저장된 해시가 `v2:`로 시작하지 않으면 **비교하지 않고 "변경됨"으로 답한다**(안전 후퇴).
  잘못 유지해서 낡은 본문에 승인이 남는 것보다, 안전하게 만료시키는 편이 낫다.

## 테스트 (`__test__/regionHash.test.js`)

최소한 아래를 덮는다:

1. 같은 ADF를 두 번 해시하면 같다 (순수성)
2. `localId`만 다른 두 ADF의 해시가 **같다**
3. `__fileSize` 등 `__` 접두 attr만 다르면 해시가 **같다**
4. `media.occurrenceKey`만 다르면 **같다**
5. mention의 `text`가 달라도 `id`가 같으면 **같다**
6. marks 순서만 다르면 **같다**
7. 인접 text 분할만 다르면 **같다** (`["ab"]` vs `["a","b"]`)
8. 객체 키 순서만 다르면 **같다**
9. **실제 본문 글자가 바뀌면 다르다**
10. `media.width`가 바뀌면 **다르다** (사용자가 리사이즈한 것)
11. codeBlock 안의 들여쓰기가 바뀌면 **다르다** (원문 보존)
12. 일반 문단의 연속 공백 차이는 **같다**
13. `isRegionChanged('v1:...', 'v2:...')` → true (안전 후퇴)
14. `isRegionChanged(null, 'v2:...')` → true

## 완료 기준

- `npx jest --runInBand` 통과 (기존 31건 + 신규)
- 다른 파일을 수정하지 않았을 것
- 함수에 부작용이 없을 것(같은 입력 2회 호출 → 동일 결과를 테스트로 못 박을 것)
