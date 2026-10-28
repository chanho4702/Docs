# 검수 요청 — 자산 관리 > 자산 현황 대시보드 (ZM-116)

> 작성 2026-08-26 · Claude → Codex 검수(COLLAB.md §8). **커밋 완료·리베이스 완료·미푸시** — 격리 worktree 브랜치 `ZM-116`: **최종(2차 리베이스 후)** BE `0e2aad5`(← `ZM-79@e6e3199`) · FE `a54e875`+검수 반영 `fb878fa`(← `master@a8cae71`). worktree 제거 후 **2026-08-26 로컬 병합 완료(사용자 지시)**: FE `master` ← `ZM-116` ff(`fb878fa`) · BE `ZM-79` ← `ZM-116` ff(`0e2aad5`, 다른 세션의 CostService 주석 1줄 미커밋 변경은 stash→merge→pop으로 보존). 미푸시. **코덱스 검수 완료·반영 완료(2026-08-26)** — 하단 `## 검수 결과` 참조.
> 설계 [features/assets/asset-dashboard/devdesign_asset-dashboard.md](devdesign_asset-dashboard.md) · 계약 [features/assets/asset-dashboard/contract_asset-dashboard.md](contract_asset-dashboard.md) v1.1 · 정적 QA `features/assets/asset-dashboard/qa_asset-dashboard.md` · 런타임 QA `features/assets/asset-dashboard/e2e_asset-dashboard.md`

## 1. 범위

| 레포 | 위치 | 내용 |
|---|---|---|
| BE | `C:\worktrees\zm-116-be` (base `3cc08ea`, 브랜치 `ZM-116`) | `GET /assets/dashboard` 신설 · `GET /assets?qualityTag=` 필터 추가 · `asset/quality/AssetQualityPolicy`(완성도 10항목+태그 9종)를 `CostService` reviewCandidates와 **공유** · live 벌크 상태(60초 캐시, 실패 시 null) · 활동 일별/최근 쿼리. **마이그레이션 없음** |
| FE | `C:\worktrees\zm-116-fe` (base `ba018f0`, 브랜치 `ZM-116`) | `/asset/dashboard` 페이지(메뉴 첫 항목) · 컴포넌트 14개 · 자산 목록 `qualityTag` 필터 칩 · `palette.ts`에 `tagPresetChartColor()` 추가 · 도움말 1건 · i18n `assetDashboard.*` |

> 🔒 메인 체크아웃(`C:\solutions\moveseye-be-spring`·`moveseyee_fe`)에는 손대지 않았다. 다른 세션이 :3000/:5173을 쓰고 있어 이 작업은 :3001/:5174로 검증했다.

## 2. 의도 (한 줄씩)

- 비용 대시보드는 **돈**의 질문, 이 화면은 **구성·품질·상태**의 질문 — 같은 것을 두 번 보여주지 않는다(설계 §0.2).
- **본체는 데이터 품질**이다. dev 실측(79건)에서 미분류 78%·vendor 1건·location 0건이라 분포 도넛은 성립하지 않는다 → 모든 차트에 "미입력" 조각을 1급 값으로, 작업 큐 태그 9종을 목록 필터(`qualityTag`)로 곧장 잇는다.
- 두 화면의 판정이 갈리면 안 되므로 `owner_missing/host_unlinked/cost_missing`은 한 함수(`AssetQualityPolicy`), 취득·만료일은 `CostParamResolver` 호출(폴백체인 복제 금지).

## 3. 🔴 불안한 지점 (검수 우선순위)

### BE
1. **`live` 실패 판정이 휴리스틱** — `HostLiveAggregator`가 예외를 삼키고 빈 맵을 주므로 "대상 호스트가 있는데 가용성 응답 0건 → 실패(null)"로 본다. 전 호스트가 정상적으로 조회에서 빠지는 상황이 있으면 오탐.
2. **시각 기준이 두 가지** — `generatedAt`·`live.asOf`는 진짜 UTC, `lastSyncedAt`·`createdAt`은 기존 관례(로컬 벽시계+`Z`). 계약 §4에 명시했고 FE는 두 값을 빼지 않지만, 관례 자체가 결함이다(비용 `basisDate` +9h 사고와 같은 뿌리).
3. **`qualityTag` 목록 필터가 메모리 집계 상한을 물려받음** — 태그가 붙은 요청은 `excluded=false` 자산 전량을 로드해 정책을 돌린 뒤 `id IN (...)`. 1만 건 전제(설계 Q8). `applyIdFilter=false`일 때 더미 `IN (-1)` 바인딩(Postgres `IN ()` 문법 오류 회피, id 양수 전제).
4. **`asset ↔ cost` 양방향 의존이 한 겹 더** — `AssetService → asset.quality → CostParamResolver`. 컴파일은 되지만 구조 냄새.
5. `live` 캐시가 사용자 단위 60초라 필터를 바꿔도 같은 스냅샷(의도) · 무효화 수단 없음.
6. `AssetDashboardRow` → `AssetQualityEvaluation` 이동은 순수 리팩터(diff가 커 보임).

### FE
7. **`tagPresetChartColor()`가 전역 `palette.ts`에 들어감** — 순수 추가(기존 값 무변경)지만 전 화면 공용 파일.
8. **`inventory_sparse`는 완성도 5항목의 정확한 역함수가 아니다** — 태그 정의는 "5항목 중 채운 것 ≤ 1". "시리얼 3.8%" 막대를 누르면 시리얼 빈 76건이 아니라 33건이 나온다(툴팁 안내). 정확히 하려면 항목별 태그가 필요(M2 후보).
9. `classification_tag_mismatch`(29) 클릭은 `qualityTag=classification_tag_mismatch`로 정확 착지하나, 완성도 "기기분류" 막대는 `unclassified`(62)로 감 — 의도된 부분집합 관계.
10. `ASSET_QUALITY_TAG_ORDER`·OS 계열 7코드가 BE 허용 집합의 **사본**(F-5: 변경 시 계약서 개정 의무).
11. 브레드크럼 "대시보드"는 루트 i18n 키 `dashboard` 공용.
12. 전체 jest 회귀 실패 2건(`TriggerFormDrawer`·`AiAssistantPage`)은 **사전 존재**(clean HEAD에서 재현 확인) — 이 작업과 무관.

### 설계에서 바뀐 것(계약 §6 표 참조)
`byOsFamily` 한글→코드 · 만료 6구간 배타적 · `lifecycle.byStatus.other` · `generatedAt` UTC · `host_unlinked` source 조건 제거 · `color`→`colorPreset` · 헤더 [동기화]→[새로고침] · 딥링크에 현재 필터 동반(savedView 충돌 축 제거) · 완성도 막대 조치 경로 = `qualityTag`.

## 4. 검증 / 미검증

| 항목 | 상태 |
|---|---|
| BE 전체 테스트 | ✅ 1432 / 156 classes / 0 fail (신규 78: 집계 16·OS 17·정책 14·서비스 13·태그필터 18) |
| BE 런타임(dev 5433, :3001) | ✅ `GET /assets/dashboard` 200 · 9종 `qualityTag` total == `tagCounts` 전건 일치 · AND·페이징·400 |
| FE tsc / eslint | ✅ 0 / 0 |
| FE 대시보드+목록 테스트 | ✅ 70/70 (계약 §5 실제 응답을 `: TAssetDashboard` 픽스처로 tsc 강제 · R-1은 공용 필터를 실제로 렌더하는 별도 스위트로 고정) |
| FE 전체 회귀 | 1344/1346 — 실패 2건(`TriggerFormDrawer`·`AiAssistantPage`) 사전 존재(clean HEAD 재현) |
| 정적 경계면 QA | ✅ `features/assets/asset-dashboard/qa_asset-dashboard.md` — PASS 27 / FAIL 6(HIGH 0·MEDIUM 2·LOW 4) → **전건 조치**(F1·F2 custom 딥링크 축, F3 owner_missing 축, F4 오류 소비, F5 주석, F6 계약 명문화) |
| 런타임 E2E(브라우저, :3001/:5174) | ✅ `features/assets/asset-dashboard/e2e_asset-dashboard.md` — PASS 96 / FAIL 3(MEDIUM 1·LOW 2) → **전건 조치**(F-1 계약 문구 HTTP 200+바디, F-2 미지 qualityTag 알림+URL 정리, F-3 표 라벨 번역). 막대 색은 canvas 픽셀로 실측, 9종 태그 왕복 전건 일치 |
| 수정분 런타임 재검증(2차) | ✅ 6항목 PASS 5 / 부분 1 — R-1(미지 `qualityTag` 시 필터 셀렉트 표시만 stale, 공용 `DmoveTableFilter`의 비제어 Select 원인) → 자산 목록 쪽에서만 좁게 수정(key 리마운트). 공용 컴포넌트 무수정 |
| 다른 세션 영향 | ✅ 없음(worktree 격리, :3000/:5173 미접촉) |

### QA가 잡은 것 중 검수자가 알아야 할 구조적 사실
- **custom 자산은 `coverage`가 무조건 `unmonitored`로 저장된다**(`AssetDerivation.coverage(SOURCE_CUSTOM, null)`) — 연결 여부와 무관. 그래서 "연결된 custom만" 고르는 목록 축이 없고, 소스×커버리지 막대의 custom 조각은 `?source=custom` 전체로 착지(툴팁에 연결/미연결 수 명시). 정확한 축(`hostLinked=true`)은 M2.
- 딥링크가 현재 필터를 동반하므로 **필터 축과 태그가 충돌하면 반드시 0건**이 된다 → `QUALITY_TAG_CONFLICTS`(`owner_missing`↔`owner`, `unclassified`/`classification_tag_mismatch`↔`deviceType`)로 충돌 축만 제거, 직교 태그는 필터 유지(테스트 고정).
- 미지 `qualityTag`는 레포 관례대로 **HTTP 200 + 바디 `code:400`** — FE는 `resolveApiError().errorCode`로 분기(진짜 400으로 바뀌어도 동작).

## 5. 커밋 (2026-08-26 승인 후 완료)
- BE `#ZM-116 [FEATURE] 자산 현황 대시보드 — 집계 EP·품질 정책 공유·qualityTag 목록 필터 -2026-08-26`
- FE `#ZM-116 [FEATURE] 자산 현황 대시보드 화면 — KPI·구성/생애주기/품질/운영/변화 위젯·qualityTag 딥링크 -2026-08-26`
- 각 worktree에서 변경 파일만 명시 add, 트레일러 없음, 푸시 안 함. BE `735963f`(25파일) · FE `d186b38`(38파일).
- ✅ 2026-08-26 리베이스 완료(사용자 지시): BE `735963f`→`987e88f` onto `ZM-79@0000d45`(겹친 파일 0) · FE `d186b38`→`857eea7` onto `master@72c531b`(겹친 파일 `locales/kr.json`·`en.json` 자동 병합, 충돌 0). 리베이스 후 검증: 로케일 JSON 유효·루트 키 중복 0 · tsc 0 · FE 대시보드/목록 70/70 · BE asset/cost 패키지 230/0/0(app 모듈 `:test`).
- 2차 리베이스(메인이 `#ZM-79` CloudWatch 스위치 커밋으로 또 앞섬, 충돌 0·로케일 자동 병합): BE `0e2aad5`, FE `a54e875`·`fb878fa`. 검증 tsc 0·76/76·BE 컴파일 OK. 그 시점 기준 ff 병합 가능 — 메인이 계속 움직이므로 병합 직전 `git rebase` 한 번 더 권장.
- 검수 반영 커밋 FE `7561d5d`→2차 리베이스 후 `fb878fa`(10파일, +236/−35): live 상태 조각 클릭 제거·완성도 링크 대상 건수 명시(6번째 불일치 `expiryDate`→`cost_missing` 포함)·키보드 접근·활동 추이 낭독 텍스트. tsc 0·76/76.

---

## 검수 결과 — BE (Codex, 2026-08-26)

- 🟡 불안 지점 1 — `live` 실패 휴리스틱은 실제로 “가용성 응답 0건”을 조회 실패로 처리합니다. 근거: `asset/dashboard/AssetLiveStatusResolver.java:76-80`. `HostLiveAggregator`가 예외를 삼켜 빈 `Map`을 반환하므로, 대상 hostid가 있으나 권한·응답 범위 때문에 정상적으로 0건이 나온 경우도 `live=null`이 됩니다. 요청서에 적힌 제한이 코드와 일치합니다.

- 🟡 불안 지점 2 — timestamp 기준 혼재가 확인됩니다. 근거: `AssetDashboardService.java:70,101`, `dto/AssetDashboardResDto.java:70-73`. `generatedAt`은 `clock.instant()`를 UTC로 포맷하지만, `lastSyncedAt`은 `LocalDateTime`에 `Z` 패턴을 붙여 직렬화합니다. 서버 시간대가 UTC가 아니면 두 값을 FE에서 직접 비교할 수 없습니다.

- 🟡 불안 지점 3 — `qualityTag` 필터는 SQL이 아닌 전체 메모리 판정 후 `IN (:ids)`로 적용되며, 코드상 상한은 강제되지 않습니다. 근거: `AssetService.java:115-130`, `quality/AssetQualityEvaluator.java:74-85`, `repository/AssetRepository.java:98-110`. 빈 결과는 즉시 반환하고 미사용 시 `-1`을 바인딩해 `IN ()` 오류는 피합니다. 다만 자산 수가 설계 전제(1만)를 넘으면 전체 로드·판정과 대형 `IN` 바인딩이 함께 증가합니다.

- 🟡 불안 지점 4 — Spring Bean 순환 의존은 없지만 패키지 의존 방향은 `cost → asset.quality → cost.calc`입니다. 근거: `CostService.java:229,426,452,589,855,955,1018`, `AssetQualityEvaluator.java:96-105`. 현재 `AssetQualityPolicy`는 순수 static 정책이라 런타임 문제는 없으나, 향후 Policy가 비용 서비스를 주입받는 형태로 확장되면 순환이 현실화될 구조입니다.

- 🟡 불안 지점 5 — 캐시 key에 hostid 집합이 포함되지 않습니다. 근거: `AssetLiveStatusResolver.java:65-72,85-95,99-111`. 같은 사용자가 60초 안에 자산 동기화·연결 변경을 겪으면 기존 snapshot에 없는 새 hostid는 `Unknown`으로 집계됩니다. TTL 내 stale 허용은 의도대로지만, 무효화 수단이 없다는 요청서의 설명도 코드와 일치합니다.

- 🟢 불안 지점 6 — `AssetDashboardRow` 잔존 참조는 없습니다. `AssetQualityEvaluation`이 자산·완성 필드·태그·취득/만료 해석 결과를 보유하고, 대시보드와 목록 필터가 모두 이를 통해 판정합니다. 근거: `quality/AssetQualityEvaluation.java`, `quality/AssetQualityEvaluator.java:74-113`.

- 🟢 `CostService` 위임은 기존 의미를 보존합니다. 기존의 `isBlank(ownerName)`, `isBlank(linkedHostid)`, `!incompleteReasons().isEmpty()`가 각각 동일 의미의 `AssetQualityPolicy` 호출로만 치환되었습니다. 근거: `CostService.java:229,426-456,589-592,852-856,955-960,1015-1019`.

- 🟢 빈 모집단·빈 태그 결과는 안전하게 처리됩니다. 대시보드는 0건에서도 30일 activity 및 품질 구조를 반환하고, 목록은 매칭 id가 비면 repository query 없이 빈 페이지를 반환합니다. 근거: `AssetDashboardService.java:249-289`, `AssetDashboardAggregator.java:90-100,405-440`, `AssetService.java:119-124`.

- 🟢 필터 결합은 AND이며 `includeExcluded=true`와 `qualityTag`를 함께 보내도 품질 태그의 모집단은 제외되지 않은 자산으로 유지됩니다. 근거: `AssetQualityEvaluator.java:76-84`, `AssetRepository.java:107-140`.

- 🟢 `live` 상태 네 값은 자산 상세와 공통 함수로 통일되었습니다. 근거: `common/live/HostLiveAggregator.java:157-178`, `AssetService.java:490`, `AssetLiveStatusResolver.java:87-91`. snapshot에 없는 host는 `Unknown`으로 처리됩니다.

- 🟢 DB 집계와 외부 Zabbix 호출 사이에 긴 트랜잭션을 잡지 않습니다. 대시보드 서비스는 DB 값을 먼저 읽고 live를 별도 호출하며, 관련 JSON 필드는 지연 연관관계가 아닙니다. 근거: `AssetDashboardService.java:69-109`, `asset/domain/Asset.java:68-77,120-127`.

총평: **조건부 병합 가능**입니다.  
즉시 수정이 필요한 🔴 결함이나 마이그레이션 누락은 확인되지 않았습니다.  
다만 운영 규모 확장 전에는 `qualityTag`의 메모리/`IN` 상한과 live 캐시 무효화·0건 응답 휴리스틱을 후속 과제로 관리해야 합니다.

### Claude 반영 (BE, 2026-08-26)
| 항목 | 조치 |
|---|---|
| 🟡1 live 0건=실패 휴리스틱 | [ ](미반영·사유 기재) 코드 무변경. 후속: `HostLiveAggregator`가 예외를 삼키지 말고 실패 신호(Optional/플래그)를 돌려주도록 바꾸는 게 근본 해법 — 공용 컴포넌트라 별도 티켓 |
| 🟡2 timestamp 기준 혼재 | [ ] 코드 무변경(기존 관례 `LocalDateTime`+`Z`는 `/assets/summary` 등 전 DTO 공통 결함). FE는 두 값을 빼지 않음(`staleSync` boolean만 사용). 전역 정리는 별도 티켓 |
| 🟡3 qualityTag 메모리/IN 상한 | [ ] 코드 무변경. 설계 Q8 전제(1만 건). 초과 설치본에서 SQL 전환 — M2 |
| 🟡4 cost→asset.quality→cost.calc 방향 | [ ] 코드 무변경. `AssetQualityPolicy`는 static 순수 정책으로 유지하는 것을 규약으로 — 비용 서비스 주입 금지(주석으로 명시 예정, M2) |
| 🟡5 live 캐시 key에 hostid 집합 없음 | [ ] 코드 무변경(60초 TTL 내 stale 허용이 설계 의도). 동기화 직후 새 hostid가 60초간 Unknown — 허용 |
| 🟢6·CostService 등가·빈 모집단·AND·상태 통일·트랜잭션 | 확인 완료 |

## 검수 결과 — FE (Codex, 2026-08-26)

- 🔴 근거: `src/pages/asset/dashboard/AssetDashboardPage.tsx:575` — `Unavailable` 상태 조각을 누르면 `coverage=monitored` 목록으로 이동한다. 이는 상태 필터가 아니라 모니터링 여부 필터이므로, 계약 샘플 기준 `Unavailable 47건` 클릭이 `monitored 75건`으로 확장된다. `src/pages/asset/dashboard/components/AssetLiveStatusCard.tsx:59-64`가 해당 조각을 클릭 가능하게 만들며, 해당 정확성에 대한 테스트도 없다. 정확한 목록 축이 없으면 클릭을 제거하거나 “모니터링 자산 전체”임을 명시해야 한다.

- 🔴 근거: `src/pages/asset/dashboard/AssetDashboardPage.tsx:82-92, 513-527` — 완성도 차트의 위치·시리얼·벤더/모델·OS·좌표는 모두 `qualityTag=inventory_sparse`로 연결된다. 이 태그는 “인벤토리 5항목 중 채운 것 ≤1”인 자산 33건이지, 선택한 항목이 비어 있는 전체 자산이 아니다. 그런데 `src/locales/kr.json:3299`는 “그 항목이 비어 있는 자산만” 열린다고 설명한다. 예를 들어 시리얼 누락 76건 막대를 눌러도 33건만 열린다. 알려진 M1 제한이라도 현 UI 문구는 실제 집합과 다르므로 수정이 필요하다.

- 🟢 근거: `src/constants/palette.ts:565-574`, `src/pages/asset/dashboard/AssetDashboardPage.tsx:147-159` — `tagPresetChartColor()`는 AntD preset을 hex로 변환하며, 미지 preset은 현재 팔레트의 muted 색으로 안전하게 폴백한다. 기존 팔레트 값은 변경하지 않았고, 기기분류 차트만 이 함수를 사용한다. FE 불안 지점 7은 이상 없다.

- 🟢 근거: `src/pages/asset/dashboard/deepLink.ts:42-82`, `src/pages/asset/dashboard/AssetDashboardPage.tsx:380, 459-463, 498, 535` — `unclassified`·`classification_tag_mismatch`·`owner_missing`·`expired` 및 작업 큐 9종은 `qualityTag`로 전달된다. 특히 `classification_tag_mismatch`는 `deviceType=notClassified`로 축소되지 않고 정확한 태그 집합으로 이동한다. 불안 지점 9는 이상 없다.

- 🟢 근거: `src/constants/asset.ts:302-310, 369-379`, `src/types/asset.ts:315-330` — OS 계열 7개와 품질 태그 9개가 계약의 허용 집합과 일치한다. BE와의 사본 구조 자체는 남아 있으나 현재 코드상 drift는 확인되지 않았다. 불안 지점 10은 현재 이상 없다.

- 🟢 근거: `src/layouts/app/SideNav.tsx:331-334`, `src/layouts/app/MobileSideNav.tsx:339-342`, `src/constants/routes.ts:260-265` — 자산 메뉴 첫 항목이 공용 `dashboard` i18n 키와 `/asset/dashboard` 경로를 일관되게 사용한다. 불안 지점 11은 이상 없다.

- 🟡 근거: `src/pages/asset/dashboard/components/AssetHBarCard.tsx:151-166`, `src/pages/asset/dashboard/components/AssetStackedBarCard.tsx:141-170`, `src/pages/asset/dashboard/components/AssetKpiRow.tsx:57-80` — 마우스 클릭 가능한 차트·범례·KPI 카드에 `button` 역할, `tabIndex`, 키보드 이벤트가 없다. 화면낭독용 값 텍스트는 제공하지만, 키보드 사용자에게는 드릴다운 경로가 없다.

- 🟡 근거: `src/pages/asset/dashboard/components/AssetActivityTrendCard.tsx:103-112` — 다른 차트는 숨김 텍스트에 각 항목별 수치를 제공하지만, 활동 추이는 DOM에 일수만 남긴다. canvas의 일별 생성·수정·제외·복원·동기화 수치는 보조기기가 읽을 수 없다.

- 🟢 근거: `src/pages/asset/dashboard/AssetDashboardPage.tsx:546-595` — `live === null`이면 D 섹션만 실패 카드로 접고, 로딩 중에는 skeleton 카드와 표를 유지한다. 부분 성공 계약과 맞다.

- 🟢 근거: `src/hooks/useAsset.ts:84-92`, `src/hooks/useDmoveQuery.ts:36-58`, `src/services/asset.api.ts:80-82` — 쿼리키는 대시보드 6개 URL 필터만으로 구성되고, `useDmoveQuery`의 단일 envelope unwrap 뒤 payload를 직접 소비한다. `data.data` 과다 언랩은 없다. 페이지 리마운트 환경에도 URL 상태만 사용한다.

- 🟢 근거: `src/pages/asset/AssetListPage.tsx:100-141, 449-487` — `qualityTag`를 API 파라미터로 전달하고, 실패 envelope의 `ASSET_INVALID_QUALITY_TAG`를 감지해 URL을 정리한다. `DmoveTable`에도 `loading`이 전달된다. 공용 필터의 비제어 Select 문제는 `qualityTag` 변경 시 좁은 key 리마운트로 방지한다.

- 🟢 근거: `src/routes/routes.tsx:864-875` — 새 절대경로 `/asset/dashboard`는 부모 `/asset`의 유효한 접두 경로이며, 기존 자산 자식 라우트와 같은 구조다. 앱 전체를 깨는 잘못된 절대 자식 라우트 배치는 아니다.

- 🟢 근거: `src/constants/palette.ts:565-574`, `src/locales/en.json`, `src/locales/kr.json` — palette fallback이 존재하고 두 locale 파일은 Node `JSON.parse`로 유효함을 확인했다. 커밋만으로는 요청서의 기존 전체 Jest 실패 2건 재현 여부는 판정할 수 없다.

총평: **조건부 병합**입니다.  
조건은 `Unavailable` 드릴다운의 잘못된 집합 이동과 완성도 막대의 잘못된 “정확한 대상” 안내를 수정하는 것입니다.  
그 외 라우팅, payload unwrap, `live=null`, 목록 필터 및 팔레트 전역 영향에는 현재 이상이 없습니다.

### Claude 반영 (FE, 2026-08-26)
| 항목 | 조치 |
|---|---|
| 🔴1 live 상태 조각 → `coverage=monitored` 오착지 | [x] 상태 4조각 **클릭 제거** + 부제 안내, navigate 미호출 테스트 2건 |
| 🔴2 완성도 인벤토리 5항목 툴팁이 실제 집합(`inventory_sparse` 33건)과 불일치 | [x] 반영 중 **6번째 불일치 발견**: `expiryDate`(24건)→`cost_missing`(11건, 만료일은 판정에 없음). 하드코딩 대신 런타임에 `missing`과 `tagCounts[tag]`를 비교해 exact/approx 문구 선택 + 대상 건수 병기. 항목별 정확 태그는 M2 |
| 🟡 키보드 접근(클릭 가능 KPI·범례) | [x] `activatable.ts` 신설, KPI 6타일·누적막대 범례 적용. ⚠️ 가로막대 5종의 canvas 드릴다운은 여전히 마우스 전용(숨김 텍스트를 포커스 가능 버튼으로 바꾸는 안은 별도 판단) |
| 🟡 활동 추이 숨김 텍스트에 일별 수치 없음 | [x] 5계열 총계 + 움직임 있는 날만 일별 수치 |
| 🟢 팔레트·딥링크·코드 집합·메뉴·live null·언랩·목록 필터·라우트·로케일 | 확인 완료 |
