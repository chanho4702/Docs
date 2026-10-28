---
name: user-manual-v3
description: "사용자 매뉴얼 v3.0(2026-09-28) — 폴더판이 정본, 단일 파일은 build-single.js 생성물, 권한은 화면 항목명 「 」 표기, 그림 49장 캡처 계획만 있고 캡처는 미수행"
metadata:
  node_type: memory
  type: project
  originSessionId: ecc34641-a909-4506-9fd1-b8fe204bbdef
  modified: 2026-09-28T07:32:20.341Z
---

사용자 매뉴얼은 `Moves_Workforce_사용자_매뉴얼/`(폴더판, 32페이지)이 **정본**이고 `Moves_Workforce_사용자_매뉴얼.md`는 `node _workspace/user-manual/build-single.js`로 만드는 **생성물**이다(직접 편집 금지). 링크·앵커·그림 참조 검사는 `check-links.js`. 2026-09-28 v3.0으로 08-11 이후 기능(워크로그 추출 9장, Jira 이슈 패널 10장, 맵 보기, 일괄 적용, 구독 스페이스 전용, 캘린더 이슈 모드, RFC-204 팀장=소속 등)을 전부 반영했고, 권한 표기는 내부 키 대신 **권한 관리 화면의 항목명**(「비용」, 소속 프로젝트만)을 쓴다 — 대조표는 7.8 한 곳뿐.

**Why:** 매뉴얼이 두 벌(단일/폴더)로 갈려 08-20 수정이 한쪽에만 들어갔고, 고객 자료에 내부 키를 쓰지 말라는 지시([[no-internal-jargon]])가 있었다.

**How to apply:** 기능이 바뀌면 폴더판 페이지를 고치고 → `check-links.js` → `build-single.js` → `publish-confluence.js`(dmove-addons MW 스페이스, 페이지 ID 는 `pages.json`, 토큰은 env `CONFLUENCE_EMAIL/TOKEN`, 첫 실제 발행 전) 순서. 문체는 이모지·부제 제목·"인사이트/기억하세요"류 금지(`tone-pass.js`가 규칙 목록). 새 그림은 본문 `![그림 N-M …](./images/파일.png)` + 캡션 + `images/README.md` 한 줄. **그림 49장은 아직 캡처 전**(계획서만 있음, 스테이징 데모 시드 필요). 관리자 매뉴얼·FAQ·릴리스노트는 08-20 기준으로 남아 있다. RFC-204가 롤백되면 7.3/7.2/부록 A의 팀장 규칙을 되돌릴 것. 경험 노트: [[projects/moves-workforce/2026-09-28-user-manual-v3|2026-09-28-user-manual-v3]].

**v3.1(2026-10-04):** 5.6 문서 관리(Confluence 문서 연결, Jira 필수/Confluence 선택 안내) 추가 — 마켓플레이스 심사에서 "Confluence에 설치했는데 Jira에서 어떻게 쓰나" 질문이 계기. 심사 회신용 영문/한글 가이드는 `_workspace/marketplace-review/`. 그림 5-17·5-18 추가(캡처 전).
