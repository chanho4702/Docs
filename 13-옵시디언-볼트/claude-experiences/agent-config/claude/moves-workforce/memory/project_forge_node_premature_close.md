---
name: forge-node-premature-close
description: "forge deploy \"Premature close\" 에러는 Node v24/v22.23 버그 → nvm으로 22.22.0 전환해 회피"
metadata: 
  node_type: memory
  type: project
  originSessionId: cb7daf45-706c-4c84-9ee6-092bfb148318
---

`forge deploy` 중 `Invalid response body ... wrapper.<...>.js: Premature close` 에러는 네트워크 문제가 아니라 **로컬 Node의 fetch(undici) 계층 버그**다. Atlassian 개발자 커뮤니티 스레드(100869, ECO-1586)에서 Node v22.23.0의 알려진 버그로 확인됐고, v24 최신 라인에서도 같은 증상이 난다. `--no-verify`로는 안 풀린다(린트만 건너뜀).

**해결(2026-06-22 적용):** nvm-windows로 Node를 `22.22.0`으로 다운그레이드해 회피.
- nvm-windows 1.2.2 설치(`winget install CoreyButler.NVMforWindows`). 설치 시 기존 공식 설치본(`C:\Program Files\nodejs`)을 흡수함.
- 활성 Node 심링크는 `C:\nvm4w\nodejs`(고정, 버전 바꿔도 타깃만 변경). forge CLI는 `%APPDATA%\npm`에 있어 Node 전환과 무관하게 유지.
- 함정: nvm 설치 후 User PATH에 `%NVM_HOME%`/`%NVM_SYMLINK%` 미확장 토큰이 들어가 새 셸에서 node를 못 찾을 수 있음 → 절대경로(`C:\Users\DMOVE\AppData\Local\nvm`, `C:\nvm4w\nodejs`)로 박아서 해결. 환경변수 변경 후엔 터미널 완전 재시작 필요.
- 버전 전환: `nvm use 22.22.0` / `nvm use 24.12.0` (관리자 권한 필요할 수 있음).

Forge 런타임이 Node 24인 것(manifest)은 클라우드 실행 런타임이라 로컬 CLI Node 버전과 무관하다.
