---
name: apm-install-macos
description: "APM 수집기 설치 가이드·설정 생성기 macOS 지원(09-15, BE e14bcc0·FE 5823067 #ZM-122 커밋·미푸시) — Os.MACOS·LaunchDaemon 단계·/usr/local 경로·큐 기본값·다운로드 arch 선택·FE OS 토글"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ff0d0f4-3d9a-4217-ad4d-e7f0de3cf957
  modified: 2026-09-15T01:08:09.612Z
---

2026-09-15 사용자 결정("ㅇㅇ ㄱㄱ")으로 macOS를 설치 가이드 OS 축에 추가. BE 13파일·FE 6파일·계약서(features/apm/core/contract_apm-read-api.md) 수정 — BE `e14bcc0`·FE `5823067` #ZM-122 커밋(미푸시).

**Why:** 사용자 질문 "우리 오텔 맥은 지원 안해?" — enum이 WINDOWS·LINUX뿐이라 `os=macos`는 400이었다. Collector는 darwin 바이너리가 있고 앱 계측은 OS 무관이라 가이드·설정 생성기만 막고 있었다.

**How to apply:**
- BE `ApmInstallTarget.Os.MACOS`(별칭 mac·darwin·osx). 경로 상수 `MAC_*`(`/usr/local/{bin,etc/moveseye,var/moveseye/otelcol-queue,var/log/moveseye}`), LaunchDaemon `com.moveseye.otelcol` plist + `launchctl bootstrap system`. 🔴 데몬은 root로 돈다 → 설정 600·큐 700으로 잠금(전용 계정은 dscl이 번거로워 안 만듦).
- 다운로드는 명령이 `uname -m`으로 darwin_{arm64|amd64}를 고른다(`collectorArtifactUrl(base, "darwin_${ARCH}")`). `downloadUrl` 필드는 arm64 고정.
- 큐 기본값 `ApmCollectorProperties.QueueDir(linux, windows, macos)` 3필드 — 생성자 호출처 전부 3인자. yml `default-queue-dir.macos`. `config-defaults` 응답 `queueDir.macos` 가산.
- FE `APM_INSTALL_OS`에 macos, 픽스처 queueDir.macos 필수(`typecheck:contract`가 잡음), `ENV_FORMAT_LABEL.macos`.
- 🔴 BE 테스트는 bootRun(build/classes) 중이라 **격리 워크트리(`git worktree add … HEAD` + 변경 파일 복사)**에서 돌렸다 — 5클래스 189건 통과. 런타임(FE에서 macOS 탭 렌더)은 :3000 재기동 전이라 **미검증**.
- 🔴 Python 편집 스크립트를 heredoc으로 넘기면 `\\`가 접혀 자바 문자열 앵커가 안 맞는다 — 스크립트는 Write 도구로 파일에 쓰고 실행할 것. 관련 [[bash-heredoc-eats-backslash]] · [[apm-install-guide-readability]].
