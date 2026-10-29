---
name: zm-157-permission-fix
description: "권한 로직 전면 수정 ZM-157 — 세 레포 커밋·병합 완료(미푸시), IT·dev·MCP 실측 전부 통과(09-21). 배포 후 전원 1회 재로그인+MCP 재연결"
metadata: 
  node_type: memory
  type: project
  originSessionId: c08871b1-97b3-4b6f-a713-8188a598a5af
  modified: 2026-09-21T04:02:37.062Z
---

🔵 **문서 지도: `_workspace/features/auth-license/zm-157-permission/INDEX_zm-157-permission.md`** (정본·증거·경험 전체 목록과 읽는 순서) · **이어서 할 일·함정·후속 과제: `_workspace/features/auth-license/zm-157-permission/tasks_zm-157-후속.md`** (다음 세션은 이 둘부터)

2026-09-16 사용자 요청 "권한 로직 검토" → 3갈래 검토(BE 코어·BE 역할관리·FE+AI) → 이슈 **ZM-157** 발급. 사용자 지시: "다른 세션 작업이랑 안겹치게" → master 작업 트리는 타 세션 미커밋 변경이 있어 **격리 워크트리** `C:/worktrees/zm-157-be`(BE master 200c936 기준)·`zm-157-fe`(3b096c4)·`zm-157-ai`(main 8f0994f), 브랜치 전부 `ZM-157`.

**사용자 원칙(09-17):** "결국엔 우리가 지정한 권한 안에서 로그인한 사용자가 작업을 할 수 있어야 함" → 역할 편집의 권한 칸을 BE가 실제로 강제(지금까지 APM·awsResources만 강제, 나머지는 FE 메뉴만 숨김).

**직접 수정·검증 완료(BE, 485 테스트 통과):**
- H1 `PUT /users/my-profile`이 관리자용 UpdateUserDto 공유 → userRoleId로 자기 권한 상승(연동 계정은 Zabbix Super admin까지). `UpdateMyProfileDto` 분리, 비번·이메일 변경은 currentPassword 필수. FE는 이 API를 호출하지 않음(AI는 GET만).
- H2 본인 수정은 status를 ACTIVE로 되돌리지 않음. 🔴 관리자 `PUT /users/{id}`의 ACTIVE 재설정은 **유일한 재활성화 경로**라 유지.
- H3 `update-email`이 zabbixUserid(null)로 조회 → 남의 계정 수정. id 조회로.
- 코어 H2 `CallerContexts.from`이 Zabbix 미연동 비관리자를 SYSTEM(슈퍼어드민 토큰)으로 보냄 → `CallerContext.unlinked()` + `ErrorKind.FORBIDDEN`(proto 7) → 200+403. 🔴 from()에서 바로 던지면 자산 상세·홈 요약이 통째로 깨짐, 401로 막으면 FE가 로그아웃시킴.

**09-17 커밋 완료(미푸시, 브랜치 ZM-157) — BE `a2709d6`·FE `06e1c8f`·AI `1e8d2c1`:** 최종 보고서 `_workspace/features/auth-license/zm-157-permission/zm-157_permission-fix.md` · 검수 기록 `_workspace/features/auth-license/zm-157-permission/review_zm-157-permission.md`(Codex 5회, 🔴 누계 BE12·FE5·AI1 전부 반영, 최종 AI·FE 머지 가능·BE 🟡까지 반영) · 매핑 계약서 `_workspace/features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`. BE *Test 3,283·FE jest 750/753(기존 3)·AI 165. 런타임·IT 전부 미검증.
- 🔴 **배포 직후 전원 1회 재로그인**(refresh에 계열 도입, 계열 없는 기존 토큰 거부) — 배포 공지 필요.
- 🔴 사용자 결정(09-17): 호스트 공용 위젯 쓰기 = 서버/네트워크 edit → 일반 사용자 차트 편집 차단.
- 🔴 시드 admin 메일 제거는 **반복 마이그레이션 R__**(V61 폐기) — ZM-151 V60과 순서 무관. dev DB admin은 다음 BE 기동 때 이메일 NULL.
- 🔴 공유 EP(홈·검색·벨·SSE·`/hosts/server`·`/hosts/detail`·`/event/problems`)는 미적용 — 막으면 사이드바·홈 붕괴.
- 🔴 동시성 설계: refresh = 사용자 세대(INCR)+로그인 계열, Redis Lua 원자 처리 · 로그인/비번/OTP/이메일 변경 = 사용자 행 `SELECT id … FOR UPDATE`(EAGER 조인에 FOR UPDATE 불가라 id만) + `SET LOCAL lock_timeout 5s` · OTP는 조건부 UPDATE. Codex가 회차마다 더 깊은 경합을 찾았음 — 인증 흐름 수정 시 경합 순서 테스트 필수.
- 🔴 미연동 비관리자: `CallerContext.unlinked()`+`ErrorKind.FORBIDDEN`(proto 7)→200+403. 401로 막으면 FE가 로그아웃시킴, from()에서 던지면 네이티브 화면 붕괴.
- 🔴 FE는 역할·권한을 persist하지 않음(이번 세션 서버 응답만), 세션 epoch로 이전 세션 응답·쓰기 차단.
- 병합 주의: ZM-159(`zm-159-be`)가 ZabbixClient·HostService·EventService 대폭 변경 예정 → 충돌 예상. BE 기준 200c936 → master 8df357d.
- 환경: master FE node_modules 손상(09-16 19:29) — 검증은 zm-114-fe 정션. 로컬 Redis는 `C:/Program Files/Redis/redis-cli.exe`(도커 아님). 이 PC otelcol pid 5580이 ApmCollectorLiveRuntimeTest 간섭.
- 코덱스 실행: `codex exec --skip-git-repo-check --sandbox read-only -m gpt-6-astra -c model_reasoning_effort='"xhigh"' -C <워크트리> -o <결과> - < 프롬프트`(BE·FE·AI 병렬, 회차별로 범위를 좁힘).
- 추가 커밋(09-17 오후): AI `9219f83` 권한 거부 문구 고정(일반 영문 403만 be.forbidden/be.forbidden.mcp로, 라이선스 등 의미 있는 403은 유지)+README nginx `location = /oauth/consent`(FE SPA — 기존 예시면 동의 화면이 AI로 감) · FE `defc930` 연결된 앱 MCP 연결 안내(`McpConnectGuide`)+로그인 FAILED_TO_ACQUIRE_LOCK·기타 실패 envelope을 실패로(예전엔 성공 처리).
- 문서: moveseye-docs에 기능 문서·ADR-0002·`guides/MCP-연결-가이드.md`·`guides/pages/설정/연결된-앱.md` 등 반영 — 🔴 레포에 타 작업 미커밋(파일명 한글화) 섞여 **커밋 안 함**. 옵시디언 노트 `2026-09-17-zm157-permission-enforcement`.
- **후속 1차 완료(09-17 승인, 미푸시)** BE `769c3b0`·FE `7f89a0c`·AI `959ebf5`: MCP 연결 회수(토큰 gen·동의 시점 세대·AI V8)·마이페이지 전 사용자·토큰 typ 구분·IP 기준 제한·그룹 리포트 가시성·`PATCH /users/{id}/status`·개별 비활성화 표시(V61 `status_locked`)·역할 편집 무효 칸 잠금·Zabbix 동기화 재구성(원격 조회 밖·단일 트랜잭션·조건부 UPDATE·advisory lock·외부 식별자 대조). 계약 `features/auth-license/zm-157-permission/contract_zm-157-followups.md`, 검수 `features/auth-license/zm-157-permission/review_zm-157-followups.md`(Codex 8차).
- 🔴 동기화 경합은 검수 회차마다 한 겹씩 나왔다(잠금 보유로 로그인 집단 차단 → 영속성 캐시 → 외곽 트랜잭션 제거의 원자성 회귀 → 지문 직후 경합 → 로컬 id 재사용 → 1차 캐시 대조 무력화). 교훈: **잠금 전 값은 값으로 복사, 잠금 후 값은 캐시 우회(열 조회), 판정은 쓰는 순간의 DB 상태로.** 근본 원인(동기화가 그룹 id를 매번 새로 매김)은 후속.
- **09-18 검증 완료**: BE·FE master 병합(6dc8e2e·4bc2c73, 충돌 0) · IT 35클래스 429 green · dev :3002 런타임 실측(미연동 계정 200+403·권한 상승 차단·상태 API·목록 userRole/statusLocked·마이그레이션 실적용, 검증 계정 생성 후 삭제). 🔴 `--tests "*IT"`는 Windows에서 `.git`으로 전개 → `com.dmove.moveseye.*IT`. 🔴 dev admin 이메일은 R__로 비워짐(비밀번호 찾기 불가 — 등록 필요). AI는 main 작업 트리 미커밋 5파일과 겹쳐 병합 보류, MCP 런타임 미검증.
- **09-21 MCP 런타임 검증 완료** — AI `main` 병합됨(959ebf5) + 실측 중 찾은 결함 수정 커밋 `a42eca0`. 결과 정본 `_workspace/features/auth-license/zm-157-permission/e2e_zm-157-mcp.md`(12항목: 인가·세대 고정·툴 71개·삭제 차단·`clear=true` 차단·비번/비활성화 회수·잠금 503·코드 복원 전부 통과). AI 테스트 194 green. 검증 계정 `zm157mcp` 삭제·`:3002`/`:3101` 종료·AI는 새 코드로 `:3100` 복귀(health ready).
  - 🔴 **`GETDEL`은 Redis 6.2+ 전용** — `PendingAuthStore`가 쓰던 `getAndDelete()`가 이 PC Redis 3.0.504에서 `unknown command`로 동의 승인 500. Lua(`EVAL`은 2.6+)로 교체. **설치형이라 고객사 Redis 버전을 가정하지 말 것**, 테스트는 이 계층을 모킹해 전부 green이었다.
  - 🟡 연결 폐기 표시는 *다음 토큰 교환·refresh* 시점 → 비번 변경 직후 "연결된 앱" 목록에 죽은 연결이 잠시 남는다(후속 11번). 공지에 "즉시 사라진다"고 쓰지 말 것.
  - 🔴 MCP 검증은 **전용 계정**으로 — 계정당 세션 1개라 admin을 쓰면 사용자 브라우저와 서로 밀어내 동의가 401. BE 로그인은 `/auth/login`, 마이프로필 저장은 **PUT** `/users/my-profile`, 사용자 삭제는 `DELETE /users {userIds:[...]}`.
  - AI 기동 스크립트가 BE `.env`를 읽어 `DB_PORT=5432`가 들어간다 → AI는 로컬 PG, BE dev는 도커 5433. `ai_oauth_grant` 조회는 5432.
- 후속 11건은 인수인계 4장(마이페이지 비번 변경 불가·감사 로그·Lua/SQL 자동 회귀·연결 목록 폐기 반영 등).

**미결:** M5(관리자 수정이 그룹 비활성 무시)·감사 로그 부재(M8)·로그인 IP 제한·OTP typ 구분은 이번 범위 밖으로 둠. 커밋은 승인 후([[commit-requires-approval]]), 트레일러 금지([[no-coauthored-by-trailer]]).

관련: [[user-management-restructure]] · [[verify-all-nav-entry-points]] · [[ai-assistant-design]]
