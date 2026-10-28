---
name: commit-requires-approval
description: moveseye 커밋 전에 반드시 사용자 승인을 받는다 (2026-08-05 지시)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3aaf312a-fba1-490e-896f-5007bff0ffcf
  modified: 2026-08-24T00:38:33.652Z
---

커밋하기 전에 **무엇을 어떤 메시지로 커밋할지 사용자에게 보여주고 승인을 받는다.** 승인 없이 커밋하지 않는다.

**Why:** 2026-08-05 직접 지시("커밋할때 나한테 검사 받아"). 배경 사건 둘 —
(1) `git add -A`로 코덱스가 만든 통합 테스트 5개 + `build.gradle.kts`가 내 커밋에 딸려 들어가 남의 작업이 내 메시지로 묻힐 뻔했다(되돌려 분리함).
(2) 티켓 번호를 `#ZM-99`로 잘못 붙이고 FE는 `feat(cost):` conventional 형식을 써서 레포 관례(`#ZM-XX [TYPE] 제목 -YYYY-MM-DD`)를 벗어났다 — 7+7건을 filter-branch로 재작성해야 했다.

**How to apply:**
- 커밋 직전에 **대상 파일 목록 + 메시지 초안**을 제시하고 답을 기다린다.
- `git add -A` 대신 **내가 만진 경로만 명시적으로** 스테이징한다. 남이 남긴 미커밋 파일을 쓸어담지 않는다.
- 메시지는 레포 관례 `#ZM-XX [FEATURE|FIX|DOCS|TEST|CHANGE|REFACTOR] 제목 -YYYY-MM-DD`. 티켓 번호가 불확실하면 **묻는다**.
- 커밋 트레일러 금지는 그대로다([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--no-coauthored-by-trailer|no-coauthored-by-trailer]]).

🔴 **파일 단위 `git add`로도 남의 작업이 딸려간다** — 2026-08-18 실제로 겪었다. 내가 한 줄 고친
`SideNav.tsx`·`kr.json`에 다른 세션의 미커밋 변경(NAV 팔레트 테마, severity 문구 삭제)이 **같은 파일
안에** 있었다. **스테이징 전에 `git diff <파일>`로 그 파일의 변경이 전부 내 것인지 확인한다.**

섞여 있으면 **hunk 선택 스테이징**으로 내 것만 담는다(`git add -p`는 이 환경에서 대화형이라 못 쓴다):
1. `git diff -U3 --no-color -- <파일> | grep -n "^@@"` 로 hunk 경계를 보고 내 hunk 번호를 고른다.
2. 헤더(`diff --git`~`+++`) + 고른 hunk만 이어붙인 패치를 만들어 `git apply --cached <패치>`.
3. **검증이 핵심**: `git diff --cached <파일>`로 남의 식별자(예: `NAV.`)가 0건인지 세고, JSON이면
   `git show :<파일>`을 파싱해 유효성까지 본다. 커밋 후 `git diff <파일>`로 남의 변경이 **워킹트리에
   그대로 남았는지** 확인한다.

⚠️ 이때 쓰는 node 스크립트에서 **`/tmp` 경로를 쓰지 말 것** — Windows node가 `C:\tmp`로 해석해 ENOENT다.
스크래치패드 절대경로를 인자로 넘긴다.

🔴 **2026-08-24 재발**: 다른 세션이 FE에 conventional 형식(feat/fix/refactor(scope):)으로 9건 커밋(08-21~22).
미푸시라 로컬 재작성으로 수습 — 티켓은 사용자 확인(커버리지·내비=ZM-87, AI=ZM-112) 후 푸시.
**수습 레시피**: 워킹트리가 dirty(타 세션 WIP 포함)면 rebase/filter-branch 대신 **`git commit-tree` 체인 재구성**
(rev-list --reverse로 oldest→newest, 트리·author/committer env 보존, 매핑 없는 커밋은 원본 메시지 유지)
→ `git update-ref refs/heads/master <new> <old>` — 워킹트리·인덱스 무접촉. 끝나면 `git diff <old> master`가
빈 것(IDENTICAL TREE)을 확인하고 푸시한다. 한글 메시지는 bash 히어독 UTF-8로 안전.

🔴 **2026-08-24 지시: 푸시 금지 — 커밋까지만 하고 push는 사용자가 직접 한다.**
"푸시해도 됨" 같은 명시 지시가 그 건에 한해 있을 때만 예외. 기본은 커밋 후 "푸시는 직접 해주세요"로 보고.

**타입 태그(2026-09-02 지시)**: 기능 커밋은 `[FEAT]`가 아니라 **`[FEATURE]`**로 쓴다(수정은 `[FIX]`). ZM-132 첫 커밋은 filter-branch로 `[FEATURE]`로 재작성 후 푸시함.
- **`moveseye-docs`(제품 문서 레포)는 우리가 커밋하지 않는다**(2026-09-17 "문서는 우리 커밋안했는데"). 문서는 편집만 하고, 커밋 제안도 하지 않는다 — 코드 레포(BE·FE·AI·워크트리)만 커밋 대상.
- 09-17 "아니 잠만 너 커밋좀해라": 사용자는 작업 단위가 끝났는데 커밋이 늦어지는 것을 싫어한다 → 단위가 끝나면 **바로 파일 목록+메시지를 한 번에 제시**하고, 승인되면 즉시 커밋. 질문을 여러 번 나눠 하지 않는다.

