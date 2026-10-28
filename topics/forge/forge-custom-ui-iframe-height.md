# Forge Custom UI iframe 높이 — body 기본 margin 이 측정에서 빠져 하단이 잘린다

- 날짜: 2026-10-13
- 프로젝트: [[moves-approval-jira]] (Jira 이슈 화면 issueContext·issueActivity)
- 관련: [[forge-inter-app-integration]] · [[2026-08-20-gantt-bottom-gap-refix]]

## 증상
Jira 이슈 우측 "Moves Approval" 칸과 작업 로그 탭의 **마지막 줄이 8px 정도 잘려** 보인다. 섹션이 통째로 사라지는 게 아니라 반 줄만 잘린다.

## 원인
Forge 는 Custom UI iframe 에 `iframeResizer.contentWindow.min.js` 를 주입해 **body 의 내용 높이**로 iframe 높이를 맞춘다. 엔트리 HTML 에 reset CSS 가 없어 브라우저 기본 `body { margin: 8px }` 가 살아 있었고, 이 margin 은 측정에 들어가지 않는다. 내용은 8px 아래로 밀려 그리는데 iframe 은 margin 만큼 짧게 잡혀 바닥이 잘린다.
- 실측: 수정 전 326px → 수정 후 342px(=margin 상·하 16px).
- 전역 페이지(AppShell)는 `appShell.css` 가 margin 0 을 걸어 멀쩡했고, AppShell 을 안 쓰는 이슈·작업 로그·모달 엔트리만 걸렸다.

## 해결
- `static/ui/src/app/base.css` 에 `html, body { margin:0; padding:0 }` 를 두고 **공용 mount** 에서 import — 엔트리마다 붙이면 하나가 빠진다.
- 바깥 여백은 엔트리의 `Box padding="space.100"` 으로 준다. padding 은 body 내용 안쪽이라 측정에 포함되고, Jira 패널의 가로 정렬(chevron 기준)도 그대로다.

## 교훈
- "하단이 조금 잘린다"는 거의 항상 **측정 밖의 간격**(body margin, 마지막 자식의 margin-bottom collapse)이다. 섹션이 통째로 없으면 비동기 로드 후 재측정 문제를 의심한다.
- Forge iframe 은 크로스오리진이라 안쪽 DOM 을 못 읽는다. 바깥에서 `iframe.getBoundingClientRect().height` 를 수정 전후로 비교하면 원인을 수치로 확정할 수 있다.
- `forge tunnel` 은 **build 산출물**을 서빙한다 — CSS 한 줄 고쳐도 `npm run build` 뒤에 새로고침해야 반영된다.
- 로그인 세션은 브라우저 프로필에 묶인다. Claude in Chrome 이 다른 기기(macOS)에 붙어 있으면 비로그인 화면만 나온다 → `list_connected_browsers` 로 확인하고 Windows 쪽을 고른다.
