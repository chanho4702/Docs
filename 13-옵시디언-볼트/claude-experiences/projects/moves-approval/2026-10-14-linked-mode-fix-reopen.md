---
type: project
tags: [project, moves-approval-jira, moves-workforce, forge, integration]
created: 2026-10-14
updated: 2026-10-14
status: active
---

# 2026-10-14 연동 모드 보정 · 워크포스 입력 재개 · B 단계 가동

## 개요
- **목적**: ARS-14 실측에서 드러난 패널 중복·팀장 본인 결재 불가를 고치고, 워크포스 앱 내부 입력을 안전하게 다시 열고, 승인분 수정 차단(B 단계)을 개발 사이트에서 가동.
- **저장소**: `C:\CloudJira\moves-approval-jira`(승인 앱) + `C:\CloudJira\moves-workforce`(워크포스). 작업 폴더 `_workspace/linked-mode-fix`, `_workspace/workforce-input-reopen`, `_workspace/worklog-approval-history-columns`.

## 핵심 결정 (Decisions)
- **워크포스 Jira 이슈 패널 제거** — 입력 창구는 승인 앱 이슈 화면 + 워크포스 앱 내부 둘. "진입점 하나"(10-13)의 진짜 뜻은 "Jira 패널에서만 하지 말자"였다. 전날 결정(승인 앱 하나로)은 오해.
- **팀장 본인 결재 허용** — 팀장은 위 팀장, 없으면 가장 가까운 조상 팀장, 끝까지 없으면 본인. 상위 팀장 범위에 하위 팀장 포함(결재선·열람 대칭).
- **W-8a 는 본인 org 문서 asUser 경로** — 워크포스가 본인 `movesRms.org` 에 팀 구조를 채운다. 앱의 타 사용자 프로퍼티 쓰기(G1 미검증)는 피함. 대가: 그 사람이 워크포스를 열어야 갱신.
- **워크포스 입력 재개 = ctl `wr` 규칙 메모 + 두 리포 바이트 동일 판정 파일 + DEFER** — 앱 간 직접 호출이 없으니 승인 앱이 병합 결과를 서명해 게시하고, 워크포스는 같은 파일로 판정. 못 판정하면 저장 안 하고 넘김. `wa` 는 삭제(구판 우회 경로 폐쇄).
- **개발 사이트 B 단계는 사람 확인을 메모로 PASS** — 운영 전 재확인 항목으로 남김.

## 겪은 문제 & 해결 (Troubleshooting)
- **ctl 이 하루 늦게 게시** — `scanCtl` 이 일일 스윕에서만 돌고 24h 워터마크. 연동 신호 최초 VERIFIED 훅에서 즉시 게시(요청당 3건 상한, 요청 범위 카운터 — 모듈 전역 금지).
- **순환 import** — Publisher → PolicyResolver → Authority → Hooks. 훅에서 지연 `require`.
- **"tom" 검색 안 됨** — 작성자 본인은 후보에서 제외되는 규칙. 다른 이름은 됨. 보고 문구만으로 단정하지 말고 다른 입력으로 재현.
- **Forge 동의 화면 두 가지** — "grant access on your behalf"는 `allowImpersonation` 앱의 사용자 1회 동의(정상). "You don't have access… only the owner"는 **개발자 콘솔 배포 상태 Not sharing(기여자만)** 때문. 환경(development)이 아니라 배포 상태 문제. 유료(licensing)는 설치 링크 공유 불가 → 기여자 추가 또는 Marketplace. 처음에 "staging 올리면 된다"고 잘못 답했다가 정정.
- **승인 모달이 안 닫힘** — 워크로그 결정 응답에 필드 변경 전용 `apply:null` 이 섞여 모달이 "적용 결과 안내" 분기로 빠짐. 서버는 적용 엔진 종류만 키를 싣고, 모달도 종류로 가드.
- **API 입력이 "워크포스"로 보임** — 출처 배지는 "Jira", 옆의 "워크포스" 는 연결 범위 배지. 문구를 "Jira 직접 입력(REST·자동화·다른 앱)" / "워크포스 연결 대상"으로.
- **Bash 안의 node -e 에 백틱** — 더블쿼트 문자열의 백틱이 명령 치환됨. 스크립트는 quoted heredoc 으로 파일에 쓴 뒤 실행.
- **브라우저 라벨이 바뀜** — Windows Chrome 이 어제는 Browser 1, 오늘은 Browser 2. osPlatform·deviceId 로 고른다.

## 교훈 (Lessons)
- 사용자 보고("검색이 안 됨", "워크포스로 표시됨")는 **같은 화면을 다른 입력으로** 재현한 뒤 원인을 나눈다. 오늘 둘 다 로직이 아니라 규칙·문구였다.
- 설계 에이전트가 "요구서 전제와 코드가 다른 곳"을 먼저 보고하게 하면(F-1~F-4) 잘못된 전제로 구현하는 것을 막는다.
- 두 앱이 같은 판정을 내야 하면 **파일 바이트 동일 + 원본 쪽 대조 테스트**가 가장 싸다. `.gitattributes eol=lf` 없으면 autocrlf 로 갈린다.
- 통제 관문(실측 필수) 설계는 켤 때 비용이 크지만, 켜고 나서 "왜 안 숨겨지나"를 설정 화면만으로 설명할 수 있게 해 준다.

## 관련 노트
- [[2026-10-13-linked-mode-ux]] · [[2026-10-02-jira-approval-design]] · [[2026-10-13-stradvision-response]]
