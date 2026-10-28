# 2026-08-26 — 자산 현황 대시보드(ZM-116): 설계 → 격리 worktree 하네스 구현 → QA 완주

> 프로젝트 [[moveseye]] · 설계 `_workspace/features/assets/asset-dashboard/devdesign_asset-dashboard.md` · 계약 `_workspace/features/assets/asset-dashboard/contract_asset-dashboard.md` v1.1 · 검수 `_workspace/features/assets/asset-dashboard/review_asset-dashboard.md`
> 관련: [[2026-07-13-network-maps]](자산관리 전수감사) · 비용 대시보드(`devdesign_asset-cost.md` §8.3)

## 무엇을 했나

요청: "자산관리 하위에 차트 대시보드 페이지 하나 따줘 — 어떤 데이터로 구성되고 어떤 화면이 필요한지 관리자 입장에서 설계".
설계 후 사용자 지시 세 개가 이어졌다: **하네스로 구현** · **다른 세션 영향 안 받게** · **ZM-116**.

- 설계 v1: 관리자의 질문 5개(구성/커버리지/**기록 신뢰도**/생애주기/최근 변화) → KPI 6 + 섹션 A~E 위젯 15개, EP 1개 `GET /assets/dashboard`.
- 구현: BE(EP·`AssetQualityPolicy`·live 벌크·`qualityTag` 목록 필터) 1432 tests green, FE(페이지·컴포넌트 14·목록 필터 칩) tsc 0 / 70 tests, 정적 QA 27 PASS·6 FAIL 전건 조치, 런타임 QA 96 PASS·3 FAIL 전건 조치 + 재검증. 승인 후 커밋 BE `735963f`·FE `d186b38`(미푸시).

## 결정과 근거

1. **형제 화면과의 경계를 먼저 그었다.** 비용 대시보드가 이미 있어 "돈의 질문 vs 구성·품질·상태의 질문"으로 나누고, 겹치는 판정(`owner_missing`·`host_unlinked`·`cost_missing`·만료일)은 **한 함수/한 계산기**를 공유하게 했다. 두 화면 숫자가 갈리는 순간 둘 다 못 믿게 된다.
2. **실측이 화면의 본체를 바꿨다.** dev DB 79건: 미분류 78%, `vendor` 1건, `location` 0건, `date_hw_*` 0건. 벤더별 도넛은 조각이 하나다. 그래서 본체를 **데이터 품질**(완성도 10항목 + 작업 큐 태그 9종)로 두고, 모든 분포 차트에 "미입력" 조각을 1급 값으로 넣었다. 설치 고객 초기 상태도 이럴 것이다 — **인벤토리를 채우게 만드는 화면**이어야 값이 생긴다.
3. **실측이 원인도 알려줬다.** `inventory_mode=-1`이 33건 → 동기화를 아무리 돌려도 인벤토리가 영영 안 온다(태그 `inventory_disabled`). 분류 태그 키가 두 벌(`device-type:서버` 32 vs `device_type:server` 15) → 미분류 62건의 원인(태그 `classification_tag_mismatch`). 집계만 했으면 "미분류 78%"라는 숫자만 남았을 것.
4. **M2 항목을 M1로 당겼다** — `GET /assets?qualityTag=`. FE 연동 중 "가장 많이 눌릴 태그(66/79)가 갈 곳이 없다"(F-2)가 드러나 커밋 전에 닫았다. 구현은 SQL 술어 복제가 아니라 **정책으로 id 집합 → `id IN`** — `expired`·`cost_missing`이 폴백체인이라 SQL로 옮기면 대시보드와 갈린다.
5. 차트는 **전부 막대**(도넛 0). dataviz 규칙: 근접값 비교엔 도넛 금지, 미분류 78%면 나머지는 근접값이다.

## 교훈

- 🔴 **컬럼 존재 ≠ 값 존재 ≠ 입력 경로 존재**(재확인). 설계 전에 `jsonb_each_text` 채움률 한 방을 돌리는 게 설계서 열 줄보다 낫다.
- 🔴 **`color`가 hex가 아니라 AntD preset 이름**(`"blue"`)이었고, `"blue"`만 CSS 기본색으로 우연히 먹혀 **일부 막대만 칠해지는** 형태였다. 계약서 §5에 **실제 응답 JSON**을 싣고 FE가 그걸 `: TAssetDashboard` 픽스처로 박아 tsc가 강제하게 한 것이 이걸 잡았다. 계약서의 TS 인터페이스만으론 못 잡는다(타입은 `string`이라 맞았다).
- 🔴 **딥링크에 현재 필터를 동반하면 충돌 축은 반드시 0건**(`owner=보안팀 & qualityTag=owner_missing`). 동반 규칙을 넣는 순간 충돌 표(`QUALITY_TAG_CONFLICTS`)가 같이 필요하다. 반대로 안 동반하면 "62건 눌렀는데 목록 78건".
- 🔴 **custom 자산은 `coverage`가 무조건 `unmonitored`** — `source=custom&coverage=monitored`는 구조적으로 0건. dev에 `customLinked=0`이라 런타임 QA는 못 잡고 **정적 QA가 파생 규칙 코드를 읽어** 잡았다. 두 QA의 분업이 실제로 서로 다른 결함을 낸 사례.
- 이 레포 오류 관례는 **HTTP 200 + 바디 `code:400`** — 계약서에 "400"이라고 쓰면 거짓. FE는 HTTP 상태 말고 `errorCode`로 분기.
- 🔴 **hidden MCP 탭은 첫 페인트 전이면 ECharts canvas가 DOM에 아예 없다**(rAF 정지 메모의 확장). 막대 색 실측은 canvas 픽셀 히스토그램으로 가능했다.
- **격리 worktree가 그대로 먹혔다.** `git worktree add C:/worktrees/zm-116-{be,fe} -b ZM-116 HEAD` + `.env` 복사(untracked라 worktree에 없다) + 포트 :3001/:5174. 세션 중 다른 세션이 `_workspace`를 재편(`designs/` 하위로 이동)하고 :3000을 내렸다 올렸는데 이쪽엔 영향 0. 주의: `.env` 두 벌 중 **Spring 정본**을 복사할 것(암호화 키가 다르다).
- 하네스 폴백(팀 도구 없음 → `Agent` 스폰 + `SendMessage`로 같은 에이전트 이어가기 + `_workspace` 파일 인계)이 5라운드(BE→FE 골격 병렬 → 계약 대조 → F-1/F-2 → QA 2종 병렬 → 결함 수정 → 재검증)를 컨텍스트 유지한 채 돌았다. 에이전트가 **지시와 다른 판단을 근거와 함께 보고**(동기화→새로고침, 클라이언트 필터링 거부)한 것이 두 번 다 옳았다.

## 잔여
- ✅ 재검증(2차) 5 PASS + R-1(공용 필터 비제어 Select stale 표시)은 목록 쪽 key 리마운트로 해소 → 승인 후 커밋 → 사용자 지시로 리베이스 완료 BE `987e88f`·FE `857eea7`(충돌 0, 로케일 자동 병합, 검증 green, 미푸시). → Codex 검수(`codex exec` BE·FE 병렬, 읽기 전용): BE 🔴0/🟡5·FE 🔴2/🟡2 → FE 반영 커밋 `7561d5d`. 검수가 잡은 것: **목록에 축이 없는 차원(live 상태)을 클릭 가능하게 두면 근사 집합으로 오착지** → 축 없으면 클릭 제거가 답 · **완성도 막대 건수 ≠ 링크 대상 건수인 항목이 6개**(검수는 5개 지목, 반영 중 `expiryDate`→`cost_missing` 추가 발견) → 문구를 하드코딩하지 말고 런타임 비교로.
- 🔴 Gradle 멀티모듈 `--tests` 필터는 `:test`로 — 루트 `test`는 매칭 없는 서브모듈(engine-zabbix)에서 BUILD FAILED가 나 실패로 오인하기 쉽다(테스트 XML은 전부 green이었다).
- M2: 목록 축 `expiryWindow`·`osFamily`·`hostLinked` · 위치/벤더 위젯(채움률 30% 게이트) · 인벤토리 일괄 활성화 액션 · 홈 위젯 2종 · `stale_asset` · M3 일별 스냅샷(추이).
- ✅ worktree 제거 완료(2차 리베이스 후 최종 BE `0e2aad5`·FE `a54e875`+`fb878fa`, 브랜치 `ZM-116` 보존). 로컬 ff 병합 완료(FE master·BE ZM-79 — BE 로컬 master는 8/20에 멈춘 유령, 'master로 머지' 지시는 실질 메인 ZM-79로 확인 후 진행). 다른 세션 미커밋 1줄과 겹친 파일은 pathspec stash로 치웠다 되돌림. 푸시는 사용자. 🔴 메인이 세션 중 3번 움직였다(다른 세션 활발) — 병합 직전 rebase 1회는 의식적으로. 다른 세션 worktree(zm-114·zm-118)는 완료 판정 근거(`git cherry`) 없이는 제거하지 않는다.
