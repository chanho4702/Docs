# 권한 작업군 문서 지도 (`ZM-157`)

> 갱신: 2026-09-19. 사용자 권한 로직 전면 수정(ZM-157)과 후속 1차의 **모든 문서가 어디 있고 뭘 담는지** 한 장으로.
> 새 문서가 생기면 여기에 한 줄 추가한다.

## 0. 어디부터 읽나

| 상황 | 먼저 볼 것 |
|---|---|
| **이어서 작업한다** | [`features/auth-license/zm-157-permission/tasks_zm-157-후속.md`](tasks_zm-157-후속.md) — 현재 커밋 상태·남은 순서·함정·후속 과제 |
| 무엇을 왜 고쳤는지 알고 싶다 | [`features/auth-license/zm-157-permission/zm-157_permission-fix.md`](zm-157_permission-fix.md) — 최종 보고서(1~10장) |
| 어떤 권한이 어떤 API를 막는지 | [`features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`](contract_zm-157-permission-enforcement.md) — 매핑표 |
| 배포한다 | [`features/auth-license/zm-157-permission/zm-157_배포-공지-초안.md`](zm-157_배포-공지-초안.md) + 제품 문서 운영자 런북 §11 |
| 제품이 지금 어떻게 동작하나(팀 공유) | `moveseye-docs/features/권한-강제와-세션-회수.md` |

## 1. 층 구조 (문서-운영규칙의 3층)

- **정본** = `moveseye-docs/` — 현재 제품이 어떻게 동작하는가(팀 공유·인수인계용). 🔴 **이 레포는 우리가 커밋하지 않는다**(사용자 지시 09-17) — 편집만 하고 커밋은 문서 담당 작업에서.
- **증거** = `_workspace/` — 왜 그렇게 결정했나, 검수·실측 기록(판단 근거 복원용)
- **경험** = 옵시디언 `claude-experiences/` — 교훈만(정본 링크로 연결)

## 2. 정본 (moveseye-docs) — 21개 파일이 ZM-157을 언급

| 구분 | 문서 | 역할 |
|---|---|---|
| 기능 | `features/권한-강제와-세션-회수.md` | **개요 한 장** — 권한 모델·BE 강제 규칙·세션/토큰 회수·새 403/401 응답·운영 주의 |
| 결정 | `decisions/ADR-0002-역할-권한-BE-강제와-세션-세대.md` | 채택안 7가지와 버린 대안(공유 EP 예외·401 대신 200+403·세대/계열·R__ 등) |
| 사용자 | `guides/사용자-가이드.md`, `guides/pages/모니터링/서버-모니터링.md`·`네트워크-모니터링.md`, `guides/pages/자산-관리/지리-맵.md`, `guides/pages/설정/마이-페이지.md` | 권한이 없을 때 보이는 것, 차트·좌표 편집 조건, 비밀번호 변경 시 다른 기기 로그아웃 |
| 관리자 | `guides/관리자-가이드.md` | 역할 체크박스가 실제로 막는 것, 계정 활성/비활성, MCP 권한, admin 이메일 등록 |
| MCP | `guides/MCP-연결-가이드.md`, `guides/pages/설정/연결된-앱.md` | 사용자편(앱별 연결 절차·문제 해결)·관리자편(활성화·프록시·삭제 작업 설정) |
| 지원 | `guides/문제-해결.md`, `guides/자주-묻는-질문.md` | 증상별 안내(메뉴 안 보임·재로그인·차트 편집 버튼 없음·잠금 대기 등) |
| 운영 | `operations/운영자-런북.md`(§11), `operations/설치-배포-가이드.md`, `operations/프로덕션-런북.md` | 배포 체크리스트·Redis 키·마이그레이션·MCP 설정 |
| 기준선 | `releases/릴리스-노트.md`, `reference/문서-인벤토리.md`, `reference/용어집.md` | 미배포 항목·문서 목록·용어(세션 세대·로그인 계열·미연동 계정 등) |
| 기술 | `technical/API-카탈로그.md`, `technical/아키텍처.md` | 인증·권한 절 보완 |

## 3. 증거 (_workspace)

| 문서 | 담는 것 |
|---|---|
| [`features/auth-license/zm-157-permission/zm-157_permission-fix.md`](zm-157_permission-fix.md) | **최종 보고서** — 1~5장 본 작업(문제·수정·사용자 영향·검증·후속), 6장 커밋 계획, 7장 추가 작업(AI 문구·MCP 안내), 8장 후속 1차, 9장 master 반영, 10장 dev 런타임 검증 |
| [`features/auth-license/zm-157-permission/zm-157_배포-공지-초안.md`](zm-157_배포-공지-초안.md) | 사용자·관리자 공지문, 배포 전/순서/후 체크리스트, 롤백 |
| [`features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`](contract_zm-157-permission-enforcement.md) | **권한 칸 ↔ 화면 ↔ API 매핑표**, 판정 규칙, 새로 403/401이 나는 EP 목록, FE 요청사항 |
| [`features/auth-license/zm-157-permission/contract_zm-157-followups.md`](contract_zm-157-followups.md) | 후속 1차 계약(A1~A5·B1~B4) + BE 구현 결과 + 검수 1~8차 반영 기록 + 경로별 잠금 전수 표 |
| [`features/auth-license/zm-157-permission/review_zm-157-permission.md`](review_zm-157-permission.md) | 본 작업 Codex 검수 **5차** 왕복 전문(지적·반영·최종 판정) |
| [`features/auth-license/zm-157-permission/review_zm-157-followups.md`](review_zm-157-followups.md) | 후속 Codex 검수 **8차** 왕복 전문(동기화 경합이 한 겹씩 드러난 기록) |
| [`features/auth-license/zm-157-permission/tasks_zm-157-후속.md`](tasks_zm-157-후속.md) | **이어서 하기 정본** — 상태·순서·다른 브랜치 얽힘·후속 11건·함정 |
| [`features/auth-license/zm-157-permission/e2e_zm-157-mcp.md`](e2e_zm-157-mcp.md) | **MCP 런타임 실측**(09-21) — 인가·툴·차단·회수·잠금 12항목, `GETDEL` 비호환 수정, 남은 차이 |
| [`features/infra/scale-call-guard/audit_scale-5000-hosts.md`](../../infra/scale-call-guard/audit_scale-5000-hosts.md) | (다른 세션) 대용량 감사 — 보안 S1·S2·S3이 ZM-157로 이관됨 |

## 4. 경험 (옵시디언)

| 노트 | 담는 것 |
|---|---|
| `projects/moveseye/2026-09-17-zm157-permission-enforcement.md` | 결함 범주·핵심 결정·검수 회차별로 드러난 경합·교훈·열린 항목 |
| `topics/backend/session-auth-hardening.md` | 재사용 지식 — 세션·인증 강화 패턴 + **회수 경합 2단계**(세대·계열·행 잠금·조건부 전환) |
| `projects/moveseye/moveseye.md` | 프로젝트 허브의 결정·타임라인·열린 항목에 한 줄씩 |

## 5. 코드 위치 (브랜치 `ZM-157`, 미푸시)

| 레포 | 커밋 | 핵심 파일 |
|---|---|---|
| BE | `a2709d6` → `769c3b0` → master 병합 `6dc8e2e` | `auth/security/DmovePermissionChecker`·`DmovePermissionKey`·`McpAccessInterceptor`, `auth/RedisRefreshTokenStore`(Lua), `user/UserService`·`MembershipLock`·`LockedGroupIdentity`, `host/HostVisibilityChecker`·`HostGroupVisibilityChecker`, `zabbixadmin/sync/ZabbixSyncServiceImpl`, `db/migration/V61__user_status_locked.sql`·`R__clear_seed_admin_public_mailbox.sql` |
| FE | `06e1c8f` → `defc930` → `7f89a0c` → master 병합 `4bc2c73` | `utils/permissions`·`session`·`sessionEpoch`, `routes/pageAccess`·`PageWrapper`, `pages/setting/MyPage`, `components/user-roles/UserStatusAction`, `components/ai/McpConnectGuide` |
| AI | `1e8d2c1` → `9219f83` → `959ebf5`(**main 미병합**) | `mcp/McpServerConfig`·`McpTokenValidator`, `mcp/oauth/*`(세대), `tool/ConfirmCard`·`AiTool`, `db/migration/V7`·`V8` |

## 6. 상태 요약 (2026-09-21)

- BE·FE는 master 병합 완료, AI도 `main` 병합 완료(`959ebf5`). **세 레포 모두 미푸시**.
- 검증: BE 단위 3,713 + IT 429 · FE 관련 300 · AI 194 · dev `:3002` 런타임 실측 · **MCP 전 구간 실측 통과(09-21)**. FE 브라우저만 미검증.
- 09-21 MCP 실측에서 `GETDEL`(Redis 6.2+) 비호환을 찾아 Lua로 고쳤다 — **AI 미커밋**.
- 🔴 열린 위험: ZM-151의 `V60` 재번호 필요 · FE master가 ZM-152 미커밋 파일 7개로 깨져 있음 · 배포 시 전원 재로그인·MCP 재연결 공지.
