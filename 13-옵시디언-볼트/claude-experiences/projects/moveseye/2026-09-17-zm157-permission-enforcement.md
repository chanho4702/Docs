---
tags: [moveseye, security, authorization, session, concurrency, codex-review, zm-157]
created: 2026-09-17
updated: 2026-09-21
status: done   # 세 레포 커밋·병합 완료(미푸시) · IT·dev·MCP 런타임 검증 전부 통과 · FE 브라우저와 배포만 남음
---

# ZM-157 권한 로직 전면 수정 — "API가 역할 권한을 확인하지 않았다"

> 사용자 요청 "우리 권한 로직 한번 검토해 줄래?"에서 시작해 사흘(09-16~18) 동안 BE·FE·AI 세 레포를 고치고 Codex 검수 5회(본 작업)+8회(후속)를 거쳐 커밋·master 병합·dev 실측까지 간 작업.
> 📍 **문서 지도: `_workspace/features/auth-license/zm-157-permission/INDEX_zm-157-permission.md`** — 아래 링크를 포함한 전체 목록과 읽는 순서가 거기 있다.
> 정본 문서는 여기 복사하지 않는다 — 최종 보고서 `C:\solutions\_workspace\features\auth-license\zm-157-permission\zm-157_permission-fix.md`, 매핑 계약서 `_workspace/features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`, 검수 기록 `_workspace/features/auth-license/zm-157-permission/review_zm-157-permission.md`, 제품 문서 `moveseye-docs/features/권한-강제와-세션-회수.md`·`decisions/ADR-0002-역할-권한-BE-강제와-세션-세대.md`.

## 개요
- **문제 한 줄**: 역할 편집 화면의 권한 칸은 FE 메뉴만 숨겼고, BE가 실제로 검사하던 칸은 APM·AWS 두 개뿐이었다. 그 밖에 API가 사용자보다 센 자격으로 돌거나(슈퍼어드민 토큰), 엉뚱한 대상을 고치거나, 권한을 거둬도 토큰이 살아 있었다.
- **사용자 원칙(09-17)**: "결국엔 우리가 지정한 권한 안에서 로그인한 사용자가 작업을 할 수 있어야 함."
- **커밋**(브랜치 `ZM-157`, 전부 미푸시): BE `a2709d6`→`769c3b0`→master `6dc8e2e` · FE `06e1c8f`→`defc930`→`7f89a0c`→master `4bc2c73` · AI `1e8d2c1`→`9219f83`→`959ebf5`(main 미병합).
- **격리**: 세 레포 master 작업 트리에 다른 세션의 미커밋 변경이 있어 `C:/worktrees/zm-157-{be,fe,ai}`에서만 작업.

## 발견한 결함 (범주)
| 범주 | 대표 사례 |
|---|---|
| 권한 칸 미검사 | 모니터링·이벤트 view/edit를 BE가 안 봄 → 주소 직접 호출·AI/MCP 툴로 우회 |
| 권한 상승 | 본인 프로필 수정 API가 관리자용 DTO를 공유 → 역할 id를 실어 자기 권한 상승 |
| 과도한 자격 | Zabbix 미연동 일반 계정 → 헬퍼가 "userid 없음 = SYSTEM"으로 보내 슈퍼어드민 토큰 사용 |
| 객체 접근(IDOR) | 호스트 위젯·이벤트 통계가 호출자의 호스트 가시성을 안 봄 |
| 오대상 | 이메일 변경이 null 외부 id로 조회 → Spring Data가 `IS NULL`로 바꿔 **남의 행**을 집음 |
| 계정 탈취 | 시드 admin 이메일이 공개 메일함 + 인증 완료 |
| 회수 미반영 | 비번 변경·비활성화 후에도 refresh·MCP 토큰 유효, 비활성 사용자가 MCP로 **자기 재활성화** |
| FE 잔존 | 로그아웃 없이 계정 전환 시 이전 계정 권한·데이터·AI 대화 잔존, 관리자 판정 기준이 FE 3개·BE 1개 |
| AI | MCP 삭제 툴이 사람 확인 없이 실행, `clear=true` 템플릿 해제가 WRITE 등급이라 차단 우회 |

## 핵심 결정 (Decisions)
- **BE가 최종 판정, FE는 같은 기준으로 표시** — 매핑표(권한 칸 ↔ 화면 ↔ EP)를 계약서로 먼저 만들고 BE·FE가 그걸 따랐다.
- **공유 EP(홈·전역 검색·벨·SSE·`/hosts/server`·`/hosts/detail`·`/event/problems`)는 막지 않는다** — 막으면 사이드바·홈이 통째로 깨진다(06-10 사고 전례). 데이터 범위는 Zabbix 역할에 맡긴다.
- **미연동 비관리자는 401이 아니라 200+403** — 401은 FE가 재인증 후 로그아웃시킨다. 헬퍼에서 바로 던지면 Zabbix를 곁가지로만 쓰는 자산 상세·홈 요약이 통째로 죽는다 → `CallerContext.unlinked()`를 흘려 **토큰 해석 시점**에 `ErrorKind.FORBIDDEN`.
- **관리자 수정의 "고치면 ACTIVE" 동작은 유지** — 비활성 사용자를 되살리는 유일한 경로였다. 본인 경로만 끊었다.
- **호스트 공용 차트 쓰기 = edit** — 사용자 확인 후 "그대로 진행". 기본 역할의 일반 사용자는 편집 불가.
- **refresh 폐기 = 사용자 세대(INCR) + 로그인 계열(family)**, 발급·회전·세션 복원·삭제는 Redis Lua 원자 처리. 계열 없는 기존 토큰은 거부 → **배포 후 전원 1회 재로그인**.
- **계정 경로는 사용자 행 `SELECT id … FOR UPDATE`로 직렬화** — 로그인·비번 변경·재설정·이메일 인증·사용자 수정·이메일 변경. 세대 INCR은 커밋 전 잠금 아래. 로그인 잠금 대기 `SET LOCAL lock_timeout 5s`.
- **시드 데이터 교정은 반복 마이그레이션 `R__`** — V61로 만들었더니 미병합 ZM-151의 V60과 병합 순서에 따라 한쪽이 기동 불가(`outOfOrder=false`). V59_1도 반대 방향으로 같은 문제. 멱등 UPDATE + R__가 순서 무관.
- **MCP 파괴 작업 기본 차단 + 입력 기반 위험도** — 정적 tier만 보면 파라미터 하나로 등급을 넘는다.

## 겪은 문제 & 해결 (Troubleshooting)
- **Codex가 회차마다 한 층 더 깊은 경합을 찾았다** (🔴 누계 BE 12·FE 5·AI 1):
  1. 1차: 기능 결함(IDOR·통계 누출·검증 우회) + "시각 비교 폐기"의 같은 밀리초 경계·회전↔폐기 경합.
  2. 2차: 로그인이 폐기 **이후** 세대를 읽어 세션 부활 / 로그아웃↔회전 경합 / 태그 감지 fail-open / 발급된 OTP로 탈취.
  3. 3차: 활성 상태 조회와 세대 읽기 사이 경합(DB 커밋과 Redis 분리) / 무효화한 OTP가 진행 중 검증으로 **부활**(무조건 VERIFIED 덮어쓰기).
  4. 4차: 이메일 인증 후속 단계가 잠금 밖 → 폐기된 OTP로 비번 덮어씀 / 실패 로그인 정리가 남의 세션 삭제.
  5. 5차: 세션·계열 키를 따로 `DEL` → 그 사이 로그인이 끼면 정리가 세션을 못 찾음.
  → 결론은 "원자 단위를 키 하나가 아니라 **사용자 하나**로 잡아야 끝난다"(행 잠금 + 조건부 UPDATE + Lua).
- **`@ManyToMany(EAGER)` 엔티티에 `PESSIMISTIC_WRITE`가 안 된다** — 외부 조인에 FOR UPDATE를 PostgreSQL이 거부. `SELECT id FROM "user" WHERE id=? FOR UPDATE` 네이티브로 id만 잠그고, 이후 `findById`(READ COMMITTED 최신값).
- **Hibernate는 UPDATE를 커밋 직전에 내보낸다** — 쓰기 경로가 "조회 → 수정"이면 행 잠금이 세대 INCR보다 늦게 잡힌다. 쓰기 경로도 **맨 앞에서** `lockById`.
- **테스트가 결함을 고정하고 있었다** — `CallerContextsTest.user_blankZabbixUserid_isSystem`이 슈퍼어드민 토큰 누수를 "정상"으로 단언. `ConfirmCardGateTest`도 `doesNotContainKey("input")`으로 누락을 고정.
- **FE 격자 복원이 저장 루프를 만듦** — 재마운트 후 GridLayout이 빈 행을 압축해 `onLayoutChange`를 다른 배치로 호출 → 저장 → 거부 → 재조회 반복. 저장은 `onDragStop`/`onResizeStop`에서만.
- **공유 IT DB·환경 함정** — 좁힌 `--tests "…auth.*"`에 IT가 섞여 공유 `moveseye_it`을 drop&create함 → `*Test`로 한정. 로컬 otelcol(pid 5580)이 `ApmCollectorLiveRuntimeTest`와 충돌. master FE `node_modules` 손상 → 다른 워크트리 node_modules 정션으로 검증. 로컬 Redis는 도커가 아니라 `C:/Program Files/Redis/redis-cli.exe`.
- **에이전트가 스크립트로 파일을 쓰다 0바이트 사고** → 원문으로 복원, 이후 "한글 파일은 Edit/Write만" 지시. 매 회차 빈 파일 검사.
- **서브에이전트가 "테스트 완료 알림 대기"로 두 번 멈춤** → "알림 기다리지 말고 결과 XML을 직접 집계해 보고까지 끝내라"를 지시문에 넣어 해결.

## 교훈 (Lessons)
- **권한 감사의 첫 질문은 "BE가 이 칸을 실제로 보는가"** — 역할 편집 화면에 체크박스가 있다는 것은 아무것도 보장하지 않는다. 칸 → 화면 → EP 매핑표를 먼저 그리면 "사용처 없음·체크박스 무효" 칸까지 드러난다. (moves-workforce의 [[2026-09-03-permission-audit-rfc198]]와 같은 결론: 구멍은 가드 바깥에 있다.)
- **"본인용"과 "관리자용" 요청 형식은 절대 공유하지 않는다** — mass assignment가 곧 권한 상승이다.
- **"없으면 SYSTEM" 같은 편의 폴백은 전제가 바뀌는 순간 권한 상승이 된다** — 헬퍼 주석이 "필터가 401을 낸다"를 전제했지만 필터가 이미 바뀌어 있었다. 폴백의 전제를 코드로 재확인할 것.
- **null 인자 파생 쿼리(`findFirstByX(null)`)는 `IS NULL`** — 본인 식별은 항상 PK로.
- **회수(revocation)는 발급보다 어렵다** — 세대·계열·잠금·조건부 전환을 한 트랜잭션 경계로 설계하지 않으면 경합이 계속 나온다. 인증 흐름 수정에는 **경합 순서를 고정한 테스트**(latch/잠금 대역)와 "수정 한 줄을 빼면 실패하는지" 음성 대조를 붙인다.
- **검수는 좁혀 가며 반복한다** — 1차 전체 → 2·3차 반영분 → 4·5차 특정 파일. 매 회차 "후속 가능 여부"를 적게 해야 끝이 난다.
- **사용자 결정이 필요한 동작 변화는 바로 묻는다** — 차트 편집 차단, 재로그인, 시드 교정 방식.

## 열린 항목

> 🔵 **이어서 하기 정본: `_workspace/features/auth-license/zm-157-permission/tasks_zm-157-후속.md`**(`C:\solutions` 아래) — 현재 커밋 상태·남은 순서(푸시→AI 병합→MCP 검증→FE 브라우저→배포)·다른 브랜치 얽힘(ZM-151 V60 재번호, FE master 미커밋 파일)·후속 10건·함정(IT glob `.git`, :3002 기동, 경합 5원칙)이 전부 여기 있다.

- **09-18 진행**: BE·FE는 master 병합 완료(`6dc8e2e`·`4bc2c73`, ZM-159와 충돌 없었음).
- **09-21 진행**: AI도 `main` 병합 완료(`959ebf5`) + MCP 실측 중 찾은 결함 수정 커밋(`a42eca0`). **세 레포 전부 미푸시.**
- **검증 완료**: IT 35클래스 429 green, dev `:3002` 실측, **MCP 전 구간 12항목 실측**(`_workspace/features/auth-license/zm-157-permission/e2e_zm-157-mcp.md`). 남은 미검증 = FE 브라우저, 로그인 IP 제한, 옛 토큰 `typ` 거부.

### 09-21 MCP 실측에서 배운 것 🔴

- **런타임에서만 드러나는 호환성 결함이 있었다.** `PendingAuthStore`가 쓰던 `getAndDelete()`는 Redis **6.2+** 전용 `GETDEL`이다. 개발 PC Redis가 3.0.504라 동의 승인이 전부 500이었다. 단위·통합 테스트는 이 계층을 모킹하거나 최신 Redis를 가정해 전부 green이었다 — **설치형 제품에서 "내 PC에서 되는 명령"은 근거가 아니다.** Lua(`EVAL`은 2.6+)로 바꾸면 원자성은 그대로다.
- **회수 시점과 표시 시점은 다르다.** 세대 불일치는 *다음 토큰 교환·refresh* 때 판정되므로, 비밀번호 변경 직후 "연결된 앱" 목록에는 이미 죽은 연결이 잠시 남는다. 쓸 수는 없으니 보안 문제는 아니지만, 공지에 "즉시 사라진다"고 쓰면 거짓이 된다.
- **검증 계정은 따로 만든다.** 계정당 세션 1개라 admin으로 검증하면 사용자 브라우저와 세션을 서로 밀어내 OAuth 동의가 401로 죽는다.
- 배포 공지: 전원 1회 재로그인·MCP 재연결·재설정 링크 재요청·일반 사용자 차트 편집 차단. 배포 순서 BE→즉시 AI→FE. 초안 `_workspace/features/auth-license/zm-157-permission/zm-157_배포-공지-초안.md`.
- 후속 과제 10건은 인수인계 문서 4장(1순위 = 동기화를 Zabbix id 기준 upsert로).

## 관련 노트
- [[moveseye]] · [[2026-07-16-auth-hardening]] · [[session-auth-hardening]] · [[2026-08-24-cloud-infra-permission]] · [[2026-08-19-ai-assistant-mcp]] · [[2026-09-02-apm-p2-traces]] · [[test-false-safety-nets]] · [[2026-09-03-permission-audit-rfc198]]
