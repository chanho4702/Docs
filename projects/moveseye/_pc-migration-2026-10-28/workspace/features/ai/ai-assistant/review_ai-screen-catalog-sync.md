# 검수 요청 — AI 화면 카탈로그 동기화 + 대시보드 요약 툴 2개 (2026-08-31)

작성: Claude / 상태: **미커밋**, 런타임 미검증
관련 레포: `moveseye-ai`, `moveseyee_fe` (BE `moveseye-be-spring`은 무수정)

---

## 1. 무엇을 했나

사용자 요청: "자산관리 대시보드, 자빅스 관리 구성현황 등 최근에 추가한 페이지들을 AI 서버와 사용 가이드 카탈로그에 등록해 달라."

### 1-1. 드러난 상태

AI 서버의 화면 카탈로그(`resources/docs/screens.json`)는 **30개**였고 FE 실제 화면은 **46개**였다. 빠진 16개 중에는 사용자가 지목한 두 화면이 모두 들어 있었다.

| # | 문제 | 영향 |
|---|---|---|
| A | 화면 16개 미등록 | `search_docs`("그거 어디서 해요?")가 그 화면을 못 찾고, "이 화면 요약"이 **가장 긴 접두 일치**로 상위 화면에 떨어진다. 예: `/asset/dashboard`에서 물으면 `/asset/list` 설명이 나갔다 |
| B | `zabbix-user-management`가 **옮겨 간 구 경로**(`/zabbix-management/user-management`)를 가리킴 | 그 경로는 2026-08-20에 `/setting/user-management`로 이동해 지금은 redirect다 — 실사용 경로에서 화면 해석 실패 |
| C | 그 사이 생긴 탭 미등록 | ZM-118 대시보드 탭 5개, 이벤트 현황 탭(ZM-99), 비용 3탭. 탭을 모르면 탭별 설명 대신 화면 일반 설명이 나간다 |
| D | 지목된 두 화면에 **데이터 툴이 없음** | 등록만 하면 AI가 화면 설명은 하는데 "자산 현황 요약해줘"엔 못 답한다 |

### 1-2. 조치

**A·B·C — 카탈로그 동기화** (`screens.json` 30 → 46)

신규 16: `asset-dashboard` `asset-detail` `zabbix-config-overview` `zabbix-monitoring-coverage` `zabbix-agent-install-guide` `cloud-ec2-dashboard` `cloud-ec2-list` `cloud-ec2-detail` `cloud-vpc-list` `event-by-hostgroup` `event-detail` `ai-alert-intelligence` `setting-cloud-infra` `setting-connected-apps` `monitoring-server-detail` `monitoring-network-detail`

경로 정정 1: `zabbix-user-management` → id·경로·메뉴를 `setting-user-management` / `/setting/user-management` / Settings로.

탭 추가: 관리 화면 5곳에 `dashboard`, 렌즈 2곳에 `list`, `event-alert`에 `overview`+`list`, `asset-cost`에 `dashboard`+`hw`+`cloud`.

설명 본문은 FE `page_guide` 한국어 도움말(정본)에서 옮겨 왔다 — 두 곳이 다른 말을 하지 않게.

**명령 카탈로그 연결** (`commands.json`): `/` 명령 15개의 `screens` 배열에 새 화면 23건을 이었다(예: 구성 현황에서 "수집 안 되는 항목 점검", 자산 현황에서 "빠진 정보 찾기").

**D — 읽기 툴 2개 신설**

| 툴 | BE | 비고 |
|---|---|---|
| `get_asset_dashboard` (NEUTRAL/READ) | `GET /assets/dashboard` | 화면과 같은 집계기. 필터 6축 그대로 |
| `zabbix_get_config_overview` (ZABBIX/READ) | `GET /zabbix-manage/overview` | 캐시 값 + `collectedAt` |

둘 다 **응답을 통째로 싣지 않는다**. 원본은 호스트그룹·소유자를 전량 주고 작업 큐를 50건 주므로 상위 10개 / 10건으로 줄이되 **전체 건수는 숫자로 남긴다**(잘렸다는 사실이 사라지면 안 된다).

**FE 사용 가이드 카탈로그**: `AI_TOOL_CATALOG`에 두 툴 등록 + `ai_chat.tools.*`·`ai_chat.tool_examples.*` 한/영 4건.

**규약**: `moveseye-ai/CLAUDE.md`의 화면 가이드 항목에 "탭·경로 변경도 등록 대상"과 이번 drift 사례를 못 박았다.

---

## 2. 검증한 것 / 안 한 것

**했다**
- `moveseye-ai` `./gradlew test` — **105 passed / 0 failed** (기존 98 + 신규 7)
- `moveseyee_fe` `npx tsc --noEmit` 오류 0, `eslint` 0 warnings, AI 관련 스위트 13 passed
- `screens.json`·`commands.json` JSON 유효성, i18n 키 한/영 대칭

**신규 테스트 2종**
- `ScreenToolReferenceTest` — 카탈로그의 `tools` 배열(화면·탭 전부)이 **실재하는 툴만** 가리키는지 클래스패스 스캔으로 대조. 지금까지 이 축에 방어선이 없었다(오타면 그 화면의 능력만 조용히 사라진다). 더불어 새 화면 라우트 해석·탭 존재를 고정.
- `OverviewToolsTest` — 두 툴의 엔드포인트·필터 전달, 축약해도 총계가 남는지, **live=null과 degraded가 0으로 뭉개지지 않는지**.

**안 했다 — 검수의 초점**
- 🔴 **런타임 전량 미검증.** :3100은 이 변경 이전 빌드로 떠 있다(사용자 소유 프로세스). 새 툴이 실제 BE 응답을 받아 무엇을 내는지 **한 번도 보지 못했다** — DTO 필드명을 소스로만 맞췄다.
- 🔴 새 화면에서 "이 화면 요약"이 실제로 그 화면 설명을 내는지 미확인.
- 🔴 `/assets/dashboard`·`/zabbix-manage/overview`가 **관리자 권한**을 요구하는지 실호출로 확인 안 했다(구성 현황 컨트롤러는 코드상 `AdminAccessChecker.requireAdmin`. AI 채팅은 지금 관리자 전용이라 실무상 문제는 없을 것으로 봤다).

---

## 3. 불안한 지점 (우선순위 순)

1. **DTO 필드명을 실측이 아니라 소스로 맞췄다.** `get_asset_dashboard`는 `composition.byHostGroup`·`quality.workQueue` 같은 중첩 경로를 직접 읽는다. BE가 이름을 바꾸면 예외 없이 **빈 값이 조용히 나간다**(이 레포 규약이 경고하는 바로 그 함정). 실호출 한 번이면 갈린다.
2. **사용자 관리 화면 id를 바꿨다**(`zabbix-user-management` → `setting-user-management`). `commands.json`에 참조가 0건임을 확인했고 코드 참조도 없지만, 저장된 대화 기록에 옛 id가 남아 있을 가능성은 확인하지 않았다.
3. **클라우드·연결된 앱 등 5개 화면은 `tools`가 빈 배열이다.** 의도한 것이다(그 데이터를 가져올 툴이 실제로 없다) — 화면 안내만 된다. 클라우드는 유료 API 축이라 툴을 만드는 것 자체가 별도 판단이 필요하다.
4. **`recentChanges`를 엔티티별 합계로 접었다.** 날짜별 추이가 사라진다. `list_config_changes`가 그 질문을 받는다고 보고 접었지만, "지난주에 변경이 몰린 날"류 질문은 한 단계 더 돌게 된다.
5. **FE 툴 카탈로그의 더 큰 drift는 손대지 않았다** — 서버 툴 62개 중 FE `AI_TOOL_CATALOG`에 이름이 있는 것은 43개다(이번 2개 포함). 나머지 19개는 도움말에서 **영어 서버 설명**으로 뜬다(코드가 의도적으로 그렇게 폴백한다). 사용자 요청 범위 밖이라 보고만 한다.
6. **FE `page-guide.ts`도 6개 화면이 비어 있다** — 클라우드 하위 4, 이벤트 그룹별/상세, 서버·네트워크 상세, AI 알람 분석. 이번에 AI 카탈로그에는 넣었으나 FE 도움말(AI 없이 완결되어야 하는 정본)에는 안 넣었다. 별건으로 판단.

---

## 4. 변경 파일

**moveseye-ai** (⚠️ `README.md`·`config/AiProperties.java`는 **다른 세션의 선재 변경** — 이번 작업 아님)
- 신설 `tool/asset/GetAssetDashboardTool.java`, `tool/zabbix/GetConfigOverviewTool.java`, `test/docs/ScreenToolReferenceTest.java`, `test/tool/OverviewToolsTest.java`
- 수정 `resources/docs/screens.json`, `resources/docs/commands.json`, `CLAUDE.md`

**moveseyee_fe**
- 수정 `constants/ai.ts`, `locales/kr.json`, `locales/en.json`
