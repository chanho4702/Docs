# ZM-157 작업 보고 — 사용자 권한 로직 결함 수정 (BE·FE·AI)

- 작성일: 2026-09-17 · 범위: **BE + FE + AI 서버**
- 상태: **커밋 완료(미푸시)** — BE `a2709d6`·`769c3b0` · FE `06e1c8f`·`defc930`·`7f89a0c` · AI `1e8d2c1`·`9219f83`·`959ebf5` (브랜치 `ZM-157`, 푸시는 사용자 직접)
- 위치(브랜치 전부 `ZM-157`, 다른 세션과 겹치지 않도록 격리 워크트리)

  | 레포 | 워크트리 | 기준 커밋 | 변경 |
  |---|---|---|---|
  | BE `moveseye-be-spring` | `C:/worktrees/zm-157-be` | master `200c936` | 53파일 수정 · 14파일 신규 · +1,757 / −201 |
  | FE `moveseyee_fe` | `C:/worktrees/zm-157-fe` | master `3b096c4` | 48파일 수정 · 12파일 신규 · 1파일 삭제 · +1,549 / −543 |
  | AI `moveseye-ai` | `C:/worktrees/zm-157-ai` | main `8f0994f` | 27파일 수정 · 10파일 신규 · +454 / −111 |

- 문서 지도: [`../INDEX_zm-157-permission.md`](../00-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84/%EA%B6%8C%ED%95%9C-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-157%29.md) · 이어서 하기: [`../planning/tasks_zm-157-후속.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/ZM-157-%EC%9D%B4%EC%96%B4%EC%84%9C-%ED%95%98%EA%B8%B0-%EC%9D%B8%EC%88%98%EC%9D%B8%EA%B3%84.md)
- 관련 문서
  - 권한 ↔ API 매핑 계약서: [`../contract_zm-157-permission-enforcement.md`](../06-API-%EA%B3%84%EC%95%BD/ZM-157-%EA%B3%84%EC%95%BD-%EC%97%AD%ED%95%A0-%EA%B6%8C%ED%95%9C%28%EC%97%AD%ED%95%A0-%ED%8E%B8%EC%A7%91-%ED%99%94%EB%A9%B4%29-BE-%EA%B0%95%EC%A0%9C-%EB%A7%A4%ED%95%91%ED%91%9C.md)
  - Codex 검수 기록(1~5차): [`../reviews/review_zm-157-permission.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-157-%EA%B6%8C%ED%95%9C-%EB%A1%9C%EC%A7%81-%EA%B2%B0%ED%95%A8-%EC%88%98%EC%A0%95-%28BE-FE-AI%29.md)

---

## 1. 무엇이 문제였나

**한 줄 요약: API가 "로그인한 사용자가 역할에서 허락받은 범위"를 확인하지 않고 실행됐다.** FE는 메뉴만 숨겼고, BE가 검사하던 역할 권한은 APM·AWS 두 개뿐이었다.

| 분류 | 결함 | 심각도 |
|---|---|---|
| 권한 상승 | `PUT /users/my-profile`이 관리자용 요청 형식을 공유 → 일반 사용자가 `userRoleId`로 **자기 역할을 올림**(Zabbix 연동 계정은 Zabbix Super admin까지) | 🔴 |
| 과도한 자격 | Zabbix 미연동 일반 계정이 Zabbix를 **슈퍼어드민 토큰**으로 호출(문제 확인·억제, 전 호스트 조회) | 🔴 |
| 과도한 자격 | 지리 맵 좌표 편집이 누구에게나 슈퍼어드민 토큰으로 Zabbix 호스트 정보 수정 허용 | 🟠 |
| 권한 미검사 | 역할 편집의 모니터링·이벤트 "보기/편집" 칸을 BE가 검사하지 않음 → 주소 직접 호출·AI/MCP 툴로 우회 | 🔴 |
| 객체 접근(IDOR) | 호스트 위젯·이벤트 통계가 사용자가 **볼 수 없는 호스트**의 데이터를 조회·수정 | 🔴 |
| 오대상 수정 | `PATCH /users/update-email`이 Zabbix id(null)로 조회해 **남의 계정 이메일 변경** → 비밀번호 찾기로 탈취 가능 | 🔴 |
| 계정 탈취 | 시드 admin 이메일이 누구나 열람 가능한 공개 메일함(`admin-dmove@yopmail.com`) + 인증 완료 → 비밀번호 찾기로 admin 탈취 | 🔴 |
| 회수 미반영 | 비밀번호 변경·비활성화·권한 회수 후에도 다른 기기의 refresh 토큰, MCP 토큰(최대 24시간)이 계속 유효. 비활성 사용자가 MCP 토큰으로 **스스로 재활성화** 가능 | 🔴 |
| FE 잔존 | 로그아웃 없이 다른 계정으로 로그인하면 **이전 계정의 관리자 권한·화면 데이터·AI 대화**가 남음. 관리자 판정 기준이 FE 3개·BE 1개로 불일치 | 🟠 |
| AI | 외부 MCP 클라이언트가 **사람 확인 없이 삭제 툴** 실행 가능, 알림 요약 캐시를 관리자끼리 공유, 확인 카드 대상 이름으로 승인자 속이기 가능 | 🟠 |

> 다른 세션의 대용량 감사(`_workspace/analysis/audit_scale-5000-hosts.md`)의 보안 항목 S1(미연동 계정 슈퍼어드민 토큰)·S2(그룹 추이 캐시 사용자 무구분)·S3(관리 목록 슈퍼어드민 토큰)도 여기서 함께 처리했다. S3은 해당 API가 전부 관리자 전용이라 변경 없음으로 판정.

## 2. 무엇을 고쳤나

### 2.1 BE — "BE가 모든 API에서 직접 확인한다"

**권한 칸 강제** (상세 매핑은 계약서 2장)
- 모니터링(호스트 그룹·서버·네트워크)·이벤트 API에 `DmovePermissionChecker` 적용: 조회=`view`, 쓰기=`edit`.
  - 호스트 상세는 "서버 또는 네트워크 중 하나"(`requireAnyView`), 문제 확인 저장은 `byTemplate.edit`.
  - **호스트 공용 차트(위젯) 쓰기는 `edit` 필요** → 기본 역할에서는 관리자만 편집(사용자 확인 완료).
- 홈·전역 검색·알림 벨·SSE·`/hosts/server`·`/hosts/detail`·`/event/problems`처럼 여러 화면이 함께 쓰는 API는 막으면 사이드바·홈이 통째로 깨져 **미적용**(데이터 범위는 Zabbix 역할에 의존).
- 역할에 있지만 화면이 없거나 이미 관리자 전용인 칸(리포트·알림·맵·설정·사용자 관리)은 "사용처 없음/체크박스 무효"로 계약서에 기록.
- 판정기는 같은 요청 안에서만 캐시(요청 간 캐시 없음 → 역할 변경 즉시 반영), 역할 id 한 컬럼만 조회.

**대상 접근 검사**
- `HostVisibilityChecker`: 위젯 API 5개 전부, 사용자 토큰으로 그 호스트를 볼 수 있는지 확인(못 보면 200+403).
- `/event/stats`: 목록·벨과 같은 "보이는 사건" 집합으로만 집계. 태그 권한 감지가 실패하면 **제한 있음으로 간주**.
- 그룹 자원·알림 추이 캐시 키에 사용자 구분 추가(S2).

**자격 증명·계정**
- `PUT /users/my-profile` 전용 `UpdateMyProfileDto`(역할·그룹·username·상태 변경 불가), 비밀번호·이메일 변경은 **현재 비밀번호 필수**, 본인 수정은 계정 상태를 바꾸지 않음.
- `update-email`은 로그인 사용자 id로 조회 + 현재 비밀번호 필수.
- Zabbix 미연동 계정: `CallerContext.unlinked()` + `ErrorKind.FORBIDDEN`(proto 7), 토큰 없는 Zabbix 호출은 `ZabbixClient`에서 200+403. 관리자 판정은 BE 전체 `ADMIN ∪ SUPER_ADMIN`으로 통일.
- 지리 맵 좌표 편집 관리자 전용.
- 시드 admin: 반복 마이그레이션 `R__clear_seed_admin_public_mailbox.sql` — 공개 주소 그대로인 행만 이메일 NULL·미인증, 그 계정의 미사용 OTP 폐기. **버전 번호가 아니라서 ZM-151(V60)과 병합 순서 무관.**
- OTP: 검증·재설정을 사용자 행 잠금 아래 **조건부 상태 전환**(재설정은 1회 소비·`RESET_PASSWORD` OTP만), 이메일 없는 계정 거부, 이메일 변경 시 미사용 OTP 무효화. 이메일 인증은 OTP 전환~비밀번호 발급을 한 트랜잭션으로.

**세션·토큰 회수**
- refresh 토큰을 **사용자 세대 + 로그인 계열**로 관리. 발급·회전·세션 복원을 Redis Lua로 원자 처리.
  - 비밀번호 변경·재설정·이메일 인증 발급·비활성화(개별·그룹·동기화)·삭제 → 세대 증가로 전 기기 폐기. 본인 비밀번호 변경은 현재 기기만 재발급(`Set-Cookie`).
  - 로그아웃은 해당 계열만 폐기, 실패한 로그인 정리는 그 계열·그 세션만(compare-and-delete).
- 로그인·비밀번호 변경·재설정·이메일 인증·사용자 수정·이메일 변경을 **사용자 행 `FOR UPDATE`로 직렬화**(로그인 잠금 대기 5초 초과 시 `FAILED_TO_ACQUIRE_LOCK`).
- MCP 토큰: 요청마다 DB로 상태·역할·MCP 권한 재확인(비활성·역할 변경 401, 회수 403, 쓰기→읽기 강등은 쓰기만 차단).
- Zabbix 미연동 계정 로그아웃은 원격 Zabbix 로그아웃 생략·쿠키 만료 보장.

### 2.2 FE — "BE와 같은 기준으로 보여 준다"
- 관리자 판정을 `isAdminUserRole`(userRole ∈ ADMIN·SUPER_ADMIN) 하나로 통일(`useIsSuperRole` 삭제). 사이드바·모바일·⚙설정·전역 검색·라우트 5개 진입점이 같은 기준.
- 이벤트 메뉴·검색에 `byHost.view`, APM 수집기·알람 규칙 라우트는 `edit` 축, 검색은 권한 응답 전 권한 필요 항목 제외.
- **세션 전환**(`switchClientSession`): 로그인·계정 변경 시 조회 캐시·AI 대화·진행 중 스트림 정리, 세션 식별자로 늦은 응답·이전 세션 쓰기 요청 차단.
- **역할·권한을 브라우저에 저장하지 않음** — 이번 세션 서버 응답만 사용. 조회 실패 시 스피너 대신 오류+재시도, 401/403 거부 후에는 새 성공 전까지 캐시 불신.
- 권한 거부 대응: 차트 편집(서버/네트워크 edit), 지리 맵 좌표 편집(관리자), 알림 벨의 문제 상세 이동(byHost), 조회 403 안내(경로당 1회).
- 차트 저장: 권한 거부를 실패로 처리·입력 보존, 드래그/리사이즈 완료 시에만 저장, 저장 직렬화, 부분 성공 재시도 시 남은 항목만.
- AI: 채팅 링크 http/https만, 확인 카드 대상 표·등급·입력값을 실시간·기록 재생 모두 표시, 턴당 카드 한도 안내.
- 로그인 상태에서 `/sign-in`(변형 경로 포함) 진입 차단, 리다이렉트는 내부 경로만.

### 2.3 AI 서버
- MCP 삭제 툴 **기본 차단**(`ai.mcp.allow-destructive=false`), 켜도 write 권한 + 호출당 대상 1개.
- **입력 기반 위험도**(`effectiveTier`): `zabbix_unlink_templates clear=true`(아이템·트리거·이력 삭제)도 삭제 작업으로 판정. 전 툴의 위험 파라미터 분류 테스트.
- MCP 툴 주석 정정(쓰기 = destructive·non-idempotent).
- 알림 요약 캐시 사용자별 분리(`V7__ai_insight_owner.sql`, 기존 캐시 삭제).
- 확인 카드: 요약과 대상 목록 분리, 대상 이름 정화(제어·방향·제로폭 문자 제거), 턴당 5장 상한, 기록에 `tier`·`targets`·`input` 저장.
- MCP 호출 중 BE 401 → 인증 캐시 즉시 폐기(폐기 세대로 재삽입 경합 차단) → 다음 요청 재인증.
- dev 프로필의 확인 게이트 우회 엔드포인트 기본값 off.

## 3. 사용자·운영에 보이는 변화

| 변화 | 대상 | 비고 |
|---|---|---|
| 🔴 **배포 직후 전원 1회 재로그인** | 모든 사용자 | 계열 없는 기존 refresh 토큰 거부(최대 30분 뒤). **배포 공지 필요** |
| 일반 사용자는 호스트 상세 **차트 추가·편집·삭제·배치 변경 불가** | 기본 역할의 일반 사용자 | 역할에서 서버/네트워크 모니터링 `edit`을 켜면 가능. 사용자 결정(09-17) |
| 지리 맵 좌표 편집은 관리자만 | 비관리자 | |
| 역할에서 끈 모니터링·이벤트 기능은 API도 403 | 해당 역할 사용자 | AI 어시스턴트·MCP 툴도 동일 |
| 비밀번호 변경·재설정·비활성화 시 **다른 기기 로그아웃** | 해당 사용자 | |
| Zabbix 미연동 일반 계정은 Zabbix 경유 화면이 403 | 미연동 비관리자 | 자산·비용·맵 등 MovesEye 자체 기능은 그대로 |
| 새로고침 직후 메뉴가 서버 응답 후 표시 | 전원 | 역할·권한을 브라우저에 저장하지 않음 |
| MCP에서 삭제 툴 4종 + `clear=true` 템플릿 해제 차단 | 외부 MCP 클라이언트 | 설정으로 허용 가능 |
| 알림 요약 캐시 초기화 | AI 알림 인텔리전스 | [지금 분석]으로 재생성 |
| 🔴 **dev DB admin 이메일이 다음 BE 기동 때 비워짐** | dev 환경 | 이후 dev admin은 비밀번호 찾기 불가 |

## 4. 검증

| 항목 | 결과 |
|---|---|
| BE 단위 테스트 | 루트 `*Test` **3,283건 통과**(마지막 전체 실행), 이후 수정분 인증·사용자 132건 재실행 통과. `:engine-zabbix:test` 126건 통과. **IT 미실행**(공유 DB) |
| BE 실측 | Redis Lua(발급·회전·세션 복원·삭제) 로컬 Redis 격리 키 실측, 통계 SQL·R__ 마이그레이션·`FOR UPDATE` 대기는 dev DB에서 읽기 전용/ROLLBACK 실측 |
| FE | 관련 jest **753건 중 750건 통과**(실패 3건은 기존: `apmRoutes` 2건 — master `2e1ae38` 병합 시 해소, `AiAssistantPage` 1건). tsc·계약 타입검사는 환경 1건(`@dagrejs/dagre` 미설치)만, eslint 57파일 통과 |
| AI | 전체 **165건 통과** |
| 음성 대조 | 주요 수정(세션 전환·위젯 저장·잠금 직렬화·거부 기록 등)은 코드를 되돌리면 테스트가 실패함을 확인 |
| Codex 검수 | 5회(1차 전체 → 2·3차 반영분 → 4·5차 좁은 확인). 🔴 누계 BE 12·FE 5·AI 1건 전부 반영. **최종: AI·FE 머지 가능, BE 5차 🟡 1건 반영 완료** |

**검증하지 못한 것**
- **런타임 전부**: BE·AI 기동, 역할별 403 실측, 로그인·refresh·로그아웃·MCP 흐름, FE 브라우저 동작, `vite build`.
- BE IT(`FlywayMigrationSmokeIT`의 R__ 단언 포함), 실제 JPA 트랜잭션에서의 `FOR UPDATE`·`set_config` 합류, AI V7의 실제 DB 적용.

## 5. 남은 위험·후속

**병합·배포 주의**
- **ZM-159**(`C:/worktrees/zm-159-be`, Zabbix 호출 공통 유틸화)가 `ZabbixClient`·`HostService`·`EventService`를 크게 바꿀 예정 → **병합 충돌 예상**.
- BE 기준 커밋(`200c936`) 이후 master가 `8df357d`로 진행됨 → 리베이스/병합 필요.
- AI V7은 **구버전 프로세스를 모두 내린 뒤 교체 배포**(병행 불가, 롤백 SQL은 AI README).
- 배포 공지: 전원 1회 재로그인, 일반 사용자 차트 편집 권한 변경.

**후속 이슈 후보**
1. 운영 Redis Lua·통계 SQL 자동 회귀 테스트(격리 Redis·PostgreSQL) — Codex 🟡.
2. 일반 사용자가 마이페이지에서 비밀번호를 못 바꿈(`PATCH /users/zabbix-info/{id}`가 관리자 전용) → FE를 `PUT /users/my-profile`(현재 비밀번호 필수)로 이전.
3. 사용자·역할 변경 **감사 로그** 부재.
4. 관리자 사용자 수정이 그룹 비활성 상태를 무시하고 ACTIVE로 되돌림(현재 유일한 재활성화 경로라 유지) → 상태 전용 API 신설.
5. 로그인 실패 제한에 IP 기준 없음, OTP·access 토큰 종류(`typ`) 미구분.
6. `/hosts/{groupid}/reports` 그룹 단위 가시성 필터, 공유 API(홈·검색·벨)의 권한 칸 적용 방식.
7. 역할 편집 화면에서 "사용처 없음·관리자 전용" 칸 비활성 표시.
8. MCP 일반 쓰기 툴(호스트 비활성화 등)의 서버 측 확인 게이트.
9. `UserService.markEmailVerified` — 운영 코드에서 더 이상 호출되지 않음(정리 여부 결정).
10. `closeProblem`·`delete_host_chart`를 삭제 등급으로 올릴지 결정(현재 일반 쓰기).

**환경 이슈(이번 작업과 무관, 확인 필요)**
- master FE `node_modules`가 손상(09-16 19:29 이후 `.bin`·`@babel`·`@ant-design` 없음) — FE 검증은 `zm-114-fe` node_modules 정션으로 수행.
- 이 PC에 09-15부터 otelcol(pid 5580)이 떠 있어 `ApmCollectorLiveRuntimeTest`가 간헐 실패.

## 6. 커밋 계획 (승인 대기)

레포별 1커밋, `git add`는 파일 지정(`-A` 금지), Co-Authored-By 트레일러 없음. 커밋 대상에서 제외: FE `node_modules` 정션.

- **BE** `#ZM-157 [FIX] 역할 권한을 BE에서 강제하고 세션·MCP·호스트 객체 접근을 즉시 차단 -2026-09-17` (본문에 권한·객체·세션·직렬화·자격·MCP·미연동·Geo·시드·S2 요약)
- **FE** `#ZM-157 [FIX] 권한 판정을 BE와 같은 기준으로 통일하고 계정 전환 시 이전 세션을 정리 -2026-09-17`
- **AI** `#ZM-157 [FIX] MCP 파괴 작업 기본 차단·입력 기반 위험도·요약 캐시 사용자 분리·확인 카드 위장 방지 -2026-09-17`

---

## 7. 추가 작업 (2026-09-17 오후 — AI `9219f83` · FE `defc930` 커밋, 미푸시)

| 레포 | 변경 | 검증 |
|---|---|---|
| AI | 권한 거부 문구 고정 — BE의 일반 영문(`Access Denied`·`User not found`)은 `be.forbidden`(역할 편집 안내), MCP 인터셉터 영문은 `be.forbidden.mcp`(원문 포함, "조회+변경" 안내)로. 라이선스·기능별·미연동 안내 등 의미 있는 403 문구는 유지. README nginx 예시에 **`/oauth/consent`는 FE 화면**(SPA) 규칙 추가 — 기존 예시대로면 동의 화면이 AI 서버로 가서 열리지 않음 | AI 전체 168건 통과 |
| FE | 설정 › 연결된 앱에 **MCP 연결 안내**(`McpConnectGuide`): 내 MCP 권한 상태·연결 5단계·클라이언트별 탭(Claude Desktop/claude.ai·Claude Code·Cursor·VS Code, 실제 커넥터 주소 복사)·문제 해결·보안 안내, MCP 꺼진 설치본 안내, 화면 도움말 보강. 로그인 `FAILED_TO_ACQUIRE_LOCK`은 재시도 안내, **그 밖의 실패 envelope도 로그인 실패로**(예전엔 요청 제한 등이 성공으로 처리됨) | 관련 jest 348/350(기존 `apmRoutes` 2) · tsc·contract(환경 1) · eslint |
| 문서 | `moveseye-docs`: 기능 문서·ADR-0002 신설, 가이드·FAQ·문제 해결·운영/설치 문서·릴리스 노트·인벤토리·용어집 반영, **`guides/MCP-연결-가이드.md`**(사용자편·관리자편)·`guides/pages/설정/연결된-앱.md` 신설. 🔴 레포에 다른 작업의 미커밋 변경(파일명 한글화 등)이 섞여 있어 **커밋하지 않음** | 링크·0바이트 확인 |
| 경험 노트 | Obsidian `projects/moveseye/2026-09-17-zm157-permission-enforcement.md` 신설, `topics/backend/session-auth-hardening.md` 회수 경합 절 추가, 허브·INDEX 연결 | — |

**문서 작업 중 새로 드러난 후속 후보**
- 비밀번호를 바꿔도 연결된 앱(MCP) 토큰은 끊기지 않는다(현재 안내: 유출 의심 시 연결된 앱에서 끊기).
- 세션 Lua가 여러 키를 한 번에 다뤄 **단일 Redis 전제**(Cluster 미검증).
- `technical/API-카탈로그.md` §1-4의 access 토큰 전달 방식 표기(Bearer vs HttpOnly 쿠키) 재확인 필요.
- 동적 등록을 끈 설치본에서 클라이언트를 사전 등록하는 관리 화면이 없다.
- 설치 가이드 §3의 "최신 V20" 표기가 낡음.

---

## 8. 후속 과제 1차 (2026-09-17 승인 — BE `769c3b0` · FE `7f89a0c` · AI `959ebf5`, 미푸시)

사용자 결정: 범위 = 계정·보안 소형 묶음 + 권한 모델 마무리 + **개별 비활성화 표시(B4) 이번 포함** / 이슈는 ZM-157 계속 / AI 툴 등급(closeProblem·delete_host_chart)은 현행 유지.
계약서 [`../contract_zm-157-followups.md`](../06-API-%EA%B3%84%EC%95%BD/ZM-157-%ED%9B%84%EC%86%8D-%EA%B3%84%EC%95%BD-%EA%B3%84%EC%A0%95-%EB%B3%B4%EC%95%88-%EC%86%8C%ED%98%95-%EB%AC%B6%EC%9D%8C-%EA%B6%8C%ED%95%9C-%EB%AA%A8%EB%8D%B8-%EB%A7%88%EB%AC%B4%EB%A6%AC.md) · 검수 [`../reviews/review_zm-157-followups.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-157-%ED%9B%84%EC%86%8D%28%EA%B3%84%EC%A0%95-%EB%B3%B4%EC%95%88-%EC%86%8C%ED%98%95-%EB%AC%B6%EC%9D%8C-%EA%B6%8C%ED%95%9C-%EB%AA%A8%EB%8D%B8-%EB%A7%88%EB%AC%B4%EB%A6%AC%29.md)(Codex 8차).

| 항목 | 내용 |
|---|---|
| A1 MCP 회수 | 비밀번호 변경·재설정·비활성화·삭제가 MCP 연결까지 끊는다(토큰 `gen` 클레임, 동의 시점 세대 고정, AI V8). 일시 장애(잠금 초과·BE 호출 실패)는 연결 보존 + 503 |
| A2 마이페이지 | 모든 사용자가 조회·저장·비밀번호 변경. 이메일 없는 계정(시드 admin)도 등록 가능 |
| A3 토큰 종류 | access/otp/mcp 구분 — 옛 토큰·재설정 메일 링크 무효 |
| A4 IP 제한 | 로그인 실패 IP 15분 50회, 비밀번호 찾기·재전송 IP 15분 20회 |
| A5 | 미사용 `markEmailVerified` 제거 |
| B1 | 역할 편집의 효과 없는 칸 잠금(값 보존) |
| B2 | 그룹 리포트 가시성 필터 |
| B3 | `PATCH /users/{id}/status` + FE 활성/비활성. 관리자 수정·역할 삭제의 자동 ACTIVE 복원 제거 |
| B4 | `V61 user.status_locked` — 그룹 활성화·Zabbix 동기화가 개별 비활성화를 되살리지 않는다 |
| 동기화 | 원격 조회를 트랜잭션 밖으로, 단일 트랜잭션 원자성 유지, 명시 사용자 잠금 없이 조건부 UPDATE, 소속 쓰기 경로와 advisory lock 공유, 잠금 후 외부 식별자 대조(`ZABBIX_SYNC_CONFLICT`) |

**검증**: BE `*Test` 3,374 + IT `ZabbixSyncStatusLockIT` 20/20 · FE 관련 266 · AI 194. 런타임·브라우저 미검증.

**추가 동작 변화(공지 대상)**
- MCP 1회 재연결(V8이 기존 연결 폐기), 배포 전 발송된 비밀번호 재설정 링크 무효.
- 그룹을 활성화해도 **다른 비활성 그룹에 속한 사용자**는 활성화되지 않는다(동기화 규칙에 맞춤).
- 동기화 중 로컬 그룹·호스트 그룹이 바뀌면 `ZABBIX_SYNC_CONFLICT`로 중단 — 다음 동기화가 맞춘다.
- 🔴 배포 순서: **BE 선배포 직후 AI**(새 BE는 구 AI의 MCP 발급을 전부 거부). 🔴 병합 순서: **ZM-151(V60) → ZM-157(V61)**.

**이번 범위에서 남긴 후속**
1. 동기화를 Zabbix id 기준 upsert로 — 지금은 매 회차 그룹 id를 다시 매겨, 화면이 들고 있던 id가 다른 그룹을 가리킬 수 있다(현재는 잠금 후 대조로 중단만).
2. 동기화 부분 실패를 응답에 노출(현재 로그만).
3. 운영 Redis Lua·통계 SQL 자동 회귀 테스트.
4. 감사 로그, MCP 일반 쓰기 툴의 서버 측 확인 게이트, 사용자 목록 `role.type` 판정 잔재 등 5장 목록.

---

## 9. master 반영 (2026-09-18)

| 레포 | 병합 | 결과 |
|---|---|---|
| BE | `master`(`ba452df`, ZM-159 전체 + ZM-122 V60 포함) → `ZM-157` = `6dc8e2e` | **충돌 없음**. 마이그레이션은 master V60(`apm_service_collecting`) 다음에 우리 V61(`user_status_locked`)로 자연 정렬 |
| FE | `master`(`43c3256`) → `ZM-157` = `4bc2c73` | **충돌 없음** |
| AI | `main`(`8f0994f`) — 앞선 커밋 없음 | 병합 불필요 |

- **BE 병합 후 수정 1건**: ZM-159가 알림 추이 집계를 `listHistory` → `countHistory`(건수 질의)로 바꿔, S2 캐시 격리 테스트(`HostGroupMonitoringTest.alertTrendCacheIsolatedPerPrincipal`)가 옛 축만 흘려 실패 → 두 축 모두 ctx별로 흘리도록 대역 보강(`countMatching`). 캐시 격리 검증 의도는 그대로.
- **BE 테스트(병합 후)**: `*Test` **3,713 green**, IT 미실행.
- **FE 테스트(병합 후)**: 관련 18 스위트 **300 green** — 기존 실패였던 `apmRoutes` 2건은 master 병합으로 해소.
- ✅ **ZM-151 V60 재번호 완료(09-21)**: `V64__cloud_vpc_snapshot_dedup.sql`로 옮겨 BE master에 병합(`3741f37`). 빈 DB에서 V60→V64 순서 적용을 IT로 확인.
- 🔴 **FE master HEAD가 깨져 있다(우리 작업과 무관)**: master 커밋이 **커밋되지 않은 파일 7개**(`shared/apmEmptyReason.ts`·`apmRetention.ts`·`components/ApmEmptyReason.tsx`·`ApmMetricTerm.tsx`·`ApmRetentionNotice.tsx`·`useApmMetricGuide.tsx` 등, 다른 세션 ZM-152 작업 트리에 미커밋)를 import한다 → 새로 받은 트리에서 `tsc`·해당 화면 테스트(`ApmServiceListPage`)가 "Cannot find module"로 실패. 그 세션이 커밋해야 해소된다. 계약 타입검사의 `collecting` 누락 2건도 같은 원인(master가 타입에 필드를 추가했고 픽스처는 미커밋).

---

## 10. dev 런타임 검증 (2026-09-18, 사용자 승인 후 실행)

- 방식: 사용자가 쓰는 :3000·:3100은 건드리지 않고 **워크트리 BE를 :3002로 기동**(dev 프로필, 같은 dev DB `dmove`). AI는 미병합이라 기동하지 않음.
- **BE 통합 테스트(IT) 전체: 35클래스 429건 통과**(다른 테스트 워커 없음 확인 후 1회). 이번에 처음 검증된 것: `FlywayMigrationSmokeIT`(R__ 포함), `AuthorizationContractIT`, `ZabbixSyncStatusLockIT`.
  - 🔴 셸 함정: `--tests "*IT"`는 Windows에서 `.git`으로 전개된다(대소문자 무시 glob) → `--tests "com.dmove.moveseye.*IT"`로.
- **마이그레이션 실적용**: `V61 user status locked` + 반복 마이그레이션 `clear seed admin public mailbox` 정상 적용. dev DB admin 이메일이 NULL·미인증으로 바뀜(의도된 동작, 이후 dev admin은 비밀번호 찾기 불가 — 관리자 이메일 등록 필요).

| 확인 항목 | 결과 |
|---|---|
| 권한 상승(`PUT /users/my-profile`에 `userRoleId`·`userGroupIds`) | 무시됨 — DB `zabbix_role` 불변 |
| 현재 비밀번호 없이 이메일·비밀번호 변경, `PATCH /users/update-email` | 모두 `CURRENT_PASSWORD_INCORRECT` |
| `PATCH /users/{id}/status` 자기 자신 | `CANNOT_CHANGE_OWN_STATUS` |
| 상태 API INACTIVE → ACTIVE | `status_locked` t → f 확인(dev 데이터 원복) |
| 사용자 목록 응답 | `userRole`·`statusLocked` 포함 |
| `GET /users/my-profile` | `lastName` 포함(FE 마이페이지 전환 전제) |
| **Zabbix 미연동 일반 계정**의 `/hosts/hostgroups`·`/hosts/server`·`/event/stats` | **200 + code 403 FORBIDDEN**("Zabbix 계정이 연결되지 않은…") — 401 아님(FE 로그아웃 유발 없음) |
| 미연동 계정의 `/hosts/{groupid}/reports` | 200 + 403 "이 호스트 그룹에 접근할 권한이 없습니다" |
| 관리자 전용(`/users`, `/users/roles`, 상태 API)에 일반 사용자 | 403 Access Denied |
| 편집 권한 없는 사용자의 위젯 쓰기(`POST /host/{id}/widgets`) | 403 Access Denied |

- 검증용 계정(`zm157check`, 역할 19)은 생성 → 확인 → **삭제 완료**. dev 데이터 변경은 admin 이메일(마이그레이션 의도분) 외 없음.
- 미검증으로 남은 것: **MCP 전 구간**(AI 미병합 — 옛 AI + 새 BE는 발급 거부가 정상), 로그인 IP 제한(공용 IP 15분 잠금 위험으로 생략), 토큰 `typ` 거부(옛 토큰 확보 불가), FE 브라우저 화면.
