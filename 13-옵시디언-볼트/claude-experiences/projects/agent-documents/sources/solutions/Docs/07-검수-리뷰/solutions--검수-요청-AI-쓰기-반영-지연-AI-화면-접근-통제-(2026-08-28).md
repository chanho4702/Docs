# 검수 요청 — AI 쓰기 반영 지연 · AI 화면 접근 통제 (2026-08-28)

작성: Claude / 상태: **미커밋**, 런타임 미검증
관련 레포: `moveseye-ai`, `moveseyee_fe` (BE `moveseye-be-spring`은 무수정)

---

## 1. 무엇을 고쳤나

사용자 신고는 둘이었다.

1. **"AI로 차트 생성하면 바로 안 생기고 페이지 리로드해야 생겨"**
2. **"AI 페이지 비활성화일 때 URL로 접근된다"**

조사 중 신고에 없던 것 하나가 더 나왔다 — **AI 채팅 API가 관리자 여부를 확인하지 않는다.**

### 1-1. 원인 (확정)

| # | 증상 | 원인 |
|---|---|---|
| A | AI가 만든 차트가 F5 전까지 안 보임 | `moveseyee_fe/src/stores/aiChatStore.ts`에 `invalidateQueries`가 **한 줄도 없다**. AI가 무엇을 바꾸든 react-query 캐시가 그대로다. 차트만이 아니라 **모든 쓰기 툴**이 같은 증상. 커스텀 차트 탭이 `destroyInactiveTabPane`이라 탭을 벗어났다 오면 보이는 것이 "리로드하면 보인다"의 정체 |
| B | 비활성 상태에서 URL 직접 진입 | `/ai-assistant`·`/ai-assistant/alert-intelligence` 라우트에 헬스 가드가 없다. 잠금은 사이드바 메뉴에만 걸려 있었다. (참고: `/monitoring/ai-account-usage`는 라우트 자체를 조건부 등록해 이미 막혀 있다 — 어시스턴트 쪽만 빠져 있었다) |
| C | **(신규)** 비관리자가 API 직접 호출로 AI 채팅 사용 가능 | `chat/api/ChatController.java`가 전 엔드포인트에서 `auth.require()`(로그인만)를 썼다. 설계서 §M6은 "**관리자만** 노출"로 확정돼 있고 FE도 그렇게 만들어져 있는데 서버가 강제하지 않았다 |
| D | **(신규)** 권한 거부가 흔적을 안 남김 | `AuthPreflight`·`AdminAccessChecker`·`McpAccessInterceptor` 모두 거부 시 로그 없이 예외만 던진다. 누가 잠긴 화면을 두드렸는지 알 방법이 없었다 |
| E | **(신규)** 관리자 판정 축 불일치 | FE는 `isSuperRole`(userRole ADMIN **또는** Zabbix role.type SUPER_ADMIN), 서버는 `userRole`만. C를 고치는 순간 Zabbix Super admin + userRole USER 계정에서 "메뉴는 보이는데 서버가 403"이 된다. 2026-08-18 홈 위젯 QA F1과 같은 계열 |

### 1-2. 조치

**A — 무효화 힌트 계약 신설** (계약서: `_workspace/contract_ai-invalidation.md`)

- `AiTool.invalidates()` default 메서드. 쓰기 툴이 자기가 바꾼 **화면 도메인**을 선언한다.
- 토큰 사전 10개(`InvalidationDomains`): `widgets` `assets` `asset-cost` `hosts` `zabbix-items` `zabbix-triggers` `zabbix-templates` `alerts` `maintenance` `notify`
- `AiToolCallbacks`가 **성공한 툴에만** SSE `tool_result.invalidates`로 실어 보낸다.
- FE `constants/aiInvalidation.ts`가 토큰 → 쿼리 키 prefix로 풀고, `aiChatStore`가 **실시간 이벤트에서만** 무효화한다.
- 쓰기 툴 29개 전부 선언(지시 25 + 삭제 계열 4를 BE 에이전트가 추가 발견).
- `InvalidationContractTest`가 미선언·오타·READ 오염을 빌드에서 잡는다.

**B — 진입 가드**: `components/ai/AiAssistantGate.tsx` 신설(`CloudInfraGate` 패턴). 미설정이면 설정 안내 + 버튼, 서버 불통이면 재시도. 사용자가 "메뉴는 잠겼는데 왜 열렸나"를 묻지 않도록 경위 한 줄 포함.

**C — 서버 강제**: `ChatController` 8개 엔드포인트 + `DevToolController` 1개를 `requireAdmin`으로. `/ai/health`는 인증 없이 유지(FE 진입점 판정이 이 값에 달려 있다).

**D — 기록**: `AuthPreflight`에 접두사 `AI-ACCESS-DENIED` WARN 로그. 자격 증명 값은 남기지 않는다.

**E — 축 정합**: AI 계열 진입점 전부를 `userRole` 축으로 통일. 라우트 3개(`/ai-assistant`, `/ai-assistant/alert-intelligence`, `/setting/ai`) `adminOnly`→`userRoleAdminOnly`, FAB·SideNav·MobileSideNav·SettingsMenu·navSearchEntries.

---

## 2. 검증한 것 / 안 한 것

**했다**
- `moveseye-ai` `./gradlew test` — 98 passed / 0 failed (기존 97 + 계약 테스트 1)
- `moveseyee_fe` `npx tsc --noEmit` — 오류 0
- FE AI 관련 스위트 — 33 passed (무효화 9 + 게이트 5 + 스토어 12 + 버튼 7)
- 토큰 사전 10개가 서버 상수와 FE 매핑 키에서 **문자 단위로 일치**함을 대조

**안 했다 — 여기가 검수의 초점**
- 🔴 **런타임 전량 미검증.** :3100은 이 변경 **이전 빌드**로 떠 있다(사용자 소유 프로세스라 재기동하지 않았다). AI가 실제로 차트를 만들고 화면이 즉시 갱신되는지 **한 번도 보지 못했다.**
- 🔴 게이트 발동 미검증. 현재 AI가 `ready`라 미설정·불통 화면을 실제로 띄워 보지 못했다.
- 🔴 403 승격의 실제 동작 미검증. AI 서버는 BE와 달리 **진짜 HTTP 403**을 쓰는데, 비관리자 계정으로 채팅에 들어갔을 때 화면이 어떻게 보이는지 확인하지 않았다. SSE는 `fetch`라 axios 인터셉터를 타지 않는 점도 함께 봐야 한다.

---

## 3. 불안한 지점 (우선순위 순)

1. **E의 노출 축 축소가 실사용자를 끊을 수 있다.** Zabbix Super admin이면서 userRole이 USER인 계정이 실제로 AI를 쓰고 있었다면 이번 변경으로 메뉴가 사라진다. 서버가 어차피 403을 주므로 "보이는데 실패"보다는 낫다는 판단이지만, **그런 계정이 실제로 있는지는 확인하지 않았다.** dev DB 조회 한 번이면 갈린다.
2. **연쇄 무효화를 좁게 잡았다.** `zabbix_delete_host`는 `hosts`만 선언했다(자산 목록에도 영향 가능). `acknowledge_problem`은 홈 위젯 알람 카운트에 걸리지만 `widgets`를 넣지 않았다 — 넣으면 위젯 전체가 무효화돼 과잉이라 판단.
3. **`hosts` 토큰의 무효화 범위가 넓다** — 13개 prefix. 전부 무과금(Zabbix 경유)이지만 AI가 호스트 하나 고칠 때마다 열려 있는 모니터링 화면이 재조회된다.
4. **`DevToolController` 승격은 지시 밖의 판단이다.** dev에서 비관리자 계정으로 툴을 돌리던 절차가 있었다면 막힌다.
5. **`GET /ai/tools`를 잠갔다.** 소비처는 챗봇 안 도움말(`AiCapabilityGuide`)뿐이고 그 화면이 관리자 전용임을 확인했지만, MCP 클라이언트가 이 EP를 쓴다면 영향이 있다(코드상 별개 축으로 보인다).
6. **FE 전체 테스트에 실패 2건이 남아 있다** — `AiAssistantPage`(mid-turn URL 반영), `TriggerFormDrawer`(API 에러 메시지). **선재 실패**로 판단했다(작업 트리에 다른 세션의 미커밋 변경 9개 파일이 섞여 있고, 두 테스트 모두 이번 변경과 코드 경로가 겹치지 않는다). 커밋 전 그 세션과 정리가 필요하다.
7. **알림 발송은 하지 않았다.** 이 제품에 임의 이벤트 발송 경로가 없다(메일은 인증 전용 + SMTP 미설정, 알림벨은 Zabbix 실시간 조회). 사용자에게는 화면 안내, 운영자에게는 WARN 로그로 처리했다. 별도 감사 테이블이 필요한지는 사용자 판단 대기.

---

## 4. 변경 파일

**moveseye-ai** (34 dirty 중 32가 이번 작업 — `README.md`·`config/AiProperties.java`는 선재 변경)
신설 `tool/InvalidationDomains.java`, `test/.../InvalidationContractTest.java`
수정 `tool/AiTool.java`, `chat/engine/AiToolCallbacks.java`, `chat/api/ChatController.java`, `dev/api/DevToolController.java`, `auth/AuthPreflight.java`, 쓰기 툴 24파일, `CLAUDE.md`

**moveseyee_fe**
신설 `constants/aiInvalidation.ts`, `components/ai/AiAssistantGate.tsx`, `__tests__/aiChatInvalidation.test.ts`, `__tests__/AiAssistantGate.test.tsx`
수정 `types/ai.ts`, `stores/aiChatStore.ts`, `hooks/useAiHealth.ts`, `routes/routes.tsx`, `components/ai/AiAssistantButton.tsx`, `layouts/app/SideNav.tsx`, `layouts/app/MobileSideNav.tsx`, `layouts/app/SettingsMenu.tsx`, `constants/navSearchEntries.ts`, `locales/{kr,en}.json`, `__tests__/AiAssistantButton.test.tsx`

**_workspace** 신설 `contract_ai-invalidation.md`
