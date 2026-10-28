---
name: ai-write-invalidation-and-gate
description: "2026-08-28 AI 쓰기 결과가 F5 전까지 화면에 안 나오던 문제 + AI 화면 URL 직접 접근 차단. 커밋 AI main 27e8cd8·FE master 0c6973a(미푸시), 런타임 미검증"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2718fc4c-a2e9-4233-a08b-cf43cd7cbf51
  modified: 2026-08-28T01:02:38.194Z
---

ZM-112. AI 어시스턴트의 쓰기 결과가 화면에 즉시 안 나오던 문제와 접근 통제를 함께 처리했다.
커밋 완료: `moveseye-ai` main `27e8cd8`(32파일) · `moveseyee_fe` master `0c6973a`(16파일). **미푸시.**
검수 요청서 `_workspace/features/ai/ai-assistant/review_ai-invalidation-and-gate.md`, 계약 `_workspace/features/ai/ai-assistant/contract_ai-invalidation.md`.

**본체는 신고보다 컸다.** "차트가 F5해야 보인다"는 증상이었고, 원인은 `aiChatStore.ts`에
`invalidateQueries`가 **한 줄도 없다**는 것이었다 — 차트만이 아니라 AI의 **모든 쓰기 툴**이 같았다.
"탭을 벗어났다 오면 보인다"는 `destroyInactiveTabPane` 재마운트였을 뿐이다.

해법 = **무효화 힌트 계약**. AI 서버가 계약의 주인이 된다.
- `AiTool.invalidates()` default 메서드 → 쓰기 툴 29개가 자기가 바꾼 도메인 선언
- 토큰 사전 10개(`InvalidationDomains`): widgets·assets·asset-cost·hosts·zabbix-items·
  zabbix-triggers·zabbix-templates·alerts·maintenance·notify
- `AiToolCallbacks`가 **성공한 툴에만** SSE `tool_result.invalidates`로 실음
- FE `constants/aiInvalidation.ts`가 토큰→쿼리키 prefix로 푼다(TanStack 부분 매칭이라 파라미터 불필요)
- `InvalidationContractTest`가 미선언·오타·READ 오염을 **빌드에서** 잡는다

🔴 **유료 API 축은 무효화 대상에서 제외**(CloudWatch·Cost Explorer). 무효화 한 번이 곧 과금이다.
🔴 **기록 재생(`transcriptToEntries`)에서는 무효화하지 않는다** — 과거 대화를 여는 것만으로
   화면이 새로고침되면 안 된다. 실시간 스트림에서만.
🔴 `aiChatStore`는 React 트리 밖 모듈 싱글턴인데 **`lib/react-query/query.instance.ts`가
   queryClient를 export**한다(Provider와 같은 인스턴스) → CustomEvent 우회 불필요.

**조사 중 나온 것 셋**(신고에 없었음):
1. `ChatController`가 전 EP에서 `auth.require()`(로그인만) — 설계 M6은 "관리자만"인데 서버가
   강제 안 함. API 직접 호출로 비관리자가 AI 채팅 사용 가능했다. `requireAdmin`으로 승격.
   `DevToolController`도 함께(확인 게이트 우회로 DESTRUCTIVE 직접 실행 통로).
   `/ai/health`는 인증 없이 유지 — FE 진입점 판정이 이 값에 달렸다. MCP는 별개 축이라 무접촉.
2. 권한 거부가 **흔적을 안 남김** → `AuthPreflight`에 `AI-ACCESS-DENIED` WARN(자격증명 값 제외).
3. 🔴 **관리자 판정 축 불일치** — FE `isSuperRole`(userRole ADMIN **또는** Zabbix Super admin) vs
   서버 `userRole`만. 1을 고치는 순간 "메뉴는 보이는데 403"이 된다([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--user-management-breadcrumb-and-pending|user-management-breadcrumb-and-pending]]
   계열, 2026-08-18 홈 위젯 QA F1과 같은 함정). AI 계열 진입점 전부 `userRoleAdminOnly`로 통일
   (라우트 3 + FAB + SideNav + MobileSideNav + SettingsMenu + navSearchEntries).
   `SettingsMenu`에는 `userRoleAdminOnly` 필드를 신설했다(기존 `adminOnly`는 존치).

**알림 발송은 안 했다** — 이 제품엔 임의 이벤트 발송 경로가 없다(메일=인증 전용+SMTP 미설정,
알림벨=Zabbix 실시간 조회). 사용자에겐 게이트 안내 카드, 운영자에겐 WARN 로그로 처리.

## 후속: 모델 선택 드롭다운 (2026-08-28, 커밋 FE `9e9c051`·AI `9aaeb7a`)

모델이 자유 텍스트라 ID를 외워 쳐야 했고 오타는 첫 대화에서야 죽었다.
`constants/ai.ts`의 `LLM_MODEL_CATALOG`에 **Anthropic 8종만** 정의하고 입력은 **AutoComplete**.

🔴 **목록을 가질 수 있는 건 Anthropic 하나뿐**이다 — OPENAI는 호환 게이트웨이(그 서버가 정함),
   AZURE_OPENAI의 model은 고객이 정한 **배포 이름**, OLLAMA는 로컬에 받아 둔 모델. 그래서 Select가
   아니라 AutoComplete다(목록에 있으면 고르고 없으면 친다).
🔴 **목록은 FE 상수에 둔다** — 설정 화면은 AI 서버가 죽어 있을 때도 쓰는 화면이라 서버에 물으면
   정작 필요한 순간 비어 버린다. 정적 지식이라 물을 이유도 없다.
⚠️ 카탈로그는 AI 서버 `ai.pricing.models`와 **같은 집합**이어야 한다(목록에만 있으면 "단가 미설정").

🔴 **브라우저로 열어야만 잡히는 것이 4개 나왔다**(전부 정적 검사·테스트 통과 상태였음):
1. 저장값이 검색어가 되어 **목록에 지금 쓰는 모델 하나만** 보임 → 필터를 직접 잡아 타이핑 시에만 좁힘
2. AutoComplete는 "치면 제안"이 기본이라 **첫 클릭은 포커스만**, 두 번째에 열림 → `open` 직접 제어
3. 목록 폭이 입력칸에 묶여 **ID가 잘림** → `popupMatchSelectWidth={360}`
4. 오타 치면 검색 결과 0건이라 **화살표까지 사라짐** → 판정을 `knownModels`(프로바이더)로. 입력값이 아니라

🔴 **덤으로 실제 버그**: `ai.pricing.models`의 `claude-sonnet-5` 단가가 3/15(Sonnet 4.6 값)로 틀려 있었다.
   실제 2/10 — 그 모델 쓰는 설치본은 비용을 5할 부풀려 보고 **월 예산 경고도 같은 값으로 판정**했다.
   모델 ID에 **날짜 접미사를 붙이지 않는다**(`claude-opus-5`가 완전한 ID). 테스트로 굳혀 둠.

**잔여 / 위험**
- 🔴 **런타임 전량 미검증.** :3100은 변경 이전 빌드로 떠 있었고(사용자 소유 프로세스라 재기동 안 함),
  차트가 실제로 즉시 갱신되는 장면을 **한 번도 못 봤다.** 게이트 발동·403 화면도 미확인.
  SSE는 `fetch`라 axios 인터셉터를 안 탄다 — 403 시 화면 거동을 별도로 봐야 한다.
- 🔴 축 축소로 **Zabbix Super admin + userRole USER 계정은 AI 메뉴가 사라진다.** 그런 계정이
  실제로 있는지 dev DB에서 확인 안 했다.
- FE 전체 테스트에 **선재 실패 2건**(`AiAssistantPage` mid-turn URL, `TriggerFormDrawer` 에러 메시지).
  작업 트리에 다른 세션 미커밋 9파일이 섞여 있다 — 그쪽 정리 필요.
- 연쇄 무효화를 좁게 잡음: `zabbix_delete_host`는 `hosts`만(자산 영향 가능), `acknowledge_problem`은
  홈 위젯 알람 카운트를 안 턴다(과잉 방지).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

AI 쓰기 반영·접근 통제 — 2026-08-28 ZM-112 커밋(AI `27e8cd8`·FE `0c6973a`, 미푸시). 안 생기던 진짜 이유=`aiChatStore`에 invalidateQueries가 아예 없음(차트만이 아닌 전 쓰기 툴) → AI 서버가 도메인 토큰 10개를 선언하는 무효화 힌트 계약. 🔴채팅 API가 관리자 검사를 안 했음 · 🔴FE `isSuperRole` vs 서버 `userRole` 축 불일치 · 🔴유료 API는 무효화 금지 · 기록 재생엔 무효화 금지. 런타임 전량 미검증
