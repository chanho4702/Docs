---
type: topic
tags: [topic, claude-code, vite, refactor, verification, lesson]
created: 2026-09-14
updated: 2026-09-14
---

# 정적 검사 3종이 다 통과해도 앱이 안 뜰 수 있다 — scss·asset 상대 import

> 2026-09-14 moveseye FE, 사이드 패널(ResizableDrawer) 공통화 리팩터링 중 겪은 회귀.

## 무슨 일이 있었나
- 핸들 CSS를 담고 있던 `pages/zabbix-management/discovery/style.scss`를 컴포넌트 동반 SCSS로 옮기고 **원본을 삭제**했다.
- 삭제 전 `grep "./style.scss"`로 같은 폴더 안의 import 4건만 지웠다.
- `tsc --noEmit`·`eslint`·관련 jest 17 스위트가 **전부 통과**해 커밋했다.
- 다음 작업에서 헤드리스 캡처를 하니 Vite 오버레이 — `alert-management/ActionFormDrawer.tsx`·`MediaTypeFormDrawer.tsx`가 `../discovery/style.scss`로 **상대경로 import**하고 있었다. 앱 전체가 안 떴다.

## 왜 놓쳤나
- **tsc는 `.scss` import를 검사하지 않는다**(타입 선언이 `declare module "*.scss"`로 뭉뚱그려져 있어 경로 존재를 안 본다).
- eslint `import/no-unresolved`가 없거나 scss를 제외한다.
- jest는 scss를 moduleNameMapper로 스텁해 경로가 틀려도 통과한다.
- 즉 **번들러(Vite)만이 asset 경로를 검증**한다 — 실기동 없이는 못 잡는다.

## 다음부터
1. scss·이미지·json 같은 **asset 파일을 지우거나 옮기기 전**, 파일명만으로 전체를 훑는다: `grep -rn "style.scss" src` (경로 접두 없이). 상대경로(`../`)와 alias(`@/`) 둘 다 걸린다.
2. 리팩터링 마무리 검증에 **Vite 실기동 1회**를 넣는다. Chrome MCP가 localhost를 못 열면 `_tools/headless-shot/cdp-shot.mjs`로 대체(로그인 쿠키는 만료가 짧아 캡처 직전에 재발급).
3. "tsc·eslint·jest 그린"을 "동작함"으로 보고하지 않는다. 정적 3종은 **타입·문법·격리 단위**를 보증할 뿐이다.

관련: [[claude-code-basics]] · moveseye 메모리 `resizable-drawer-common`
