# 팀 기능 P2 증분 설계 검토 (N5 · N6 · N7) — 구현 전 게이트

> 검토: 2026-07-28 / 외부 검토자 (설계서 미수정)
> 대상: `01_architect_design.md` §3 P2 절(N5·N6·N7·팀 지표 단일 정의) · §15 · §9 P2 체크리스트
> 방법: 설계서의 "실측/재사용/무회귀/0줄" 주장 전부를 해당 소스 파일을 직접 열어 대조했다.
>
> ⚠ **검토 중 설계서가 갱신되었다** (2376줄 → 2589줄. §3에 "팀 지표 단일 정의"·N7 소절 추가). 본 검토는 **갱신 후 최신본** 기준이다. 단, 갱신이 §15·§8-3·i18n에 전파되지 않아 생긴 자기모순이 다수 발견됐다(→ M-2).

---

## 0. 총평

- **팀 지표 단일 정의 절(§3, 신설)은 이번 증분의 백미다.** 가동률 3종·완수율 4종·MM 3종 공존을 실측으로 밝히고, "①글로벌만 팀 축에 쓴다 / MD만 쓴다 / 롤업은 `aggregateByTeam` 1개" 로 계산 위치를 코드 수준으로 고정했다. 재사용 지목 함수를 전부 열어 확인한 결과 **일치한다** (`computeGlobalUtilization` people.push 위치·산식, `computeCompletionRate` 2벌 복제, `LOAD_DONE_WINDOW='-26w'`, 드로어 invoke 2개 등).
- **N5의 실측 전제(파일·라인)는 전량 일치한다.** U12·U13·U14·U15 네 결함 주장도 전부 사실로 확인됐다(세부 뉘앙스는 §5).
- 그러나 **U12/N6 인건비 게이팅의 프론트 소비 지점 열거가 불완전**해서, 설계대로 구현하면 종합 개요·필터바에 "₩0"이라는 거짓 숫자가 남는다(H-1). 그리고 **teamMeta 구성이 미정의**라 설계 스스로 내세운 "보이지 않는 팀을 고를 수 없다" 보장이 구현자의 해석에 달려 있다(H-2). 이 둘은 구현 착수 전에 설계서에 반영돼야 한다.

---

## 1. High — 구현 전 설계 수정 필요

### H-1. U12 키 삭제의 방어 논리가 이 코드베이스에서 성립하지 않고, 게이팅 지점 열거가 불완전하다

**설계 주장** (§N6): `canReadCost===false`면 `members[].salary`·`totalSalary` **키 삭제**(`null` 아님 — "`null`은 `Σ`에서 `0`이 되어 '비용 0원'이라는 거짓 숫자를 만든다"). 프론트 대응은 "비교 위젯 인건비 축 제거 + Cost 탭 안내 문구 대체" 2곳.

**실측 반박 — 키 삭제와 null은 이 코드베이스에서 구분되지 않는다.**
`totalSalary`/`salary`의 프론트 소비는 **전부 `?? 0` 폴백**이다:
- `portfolioAggregate.js:37` `totalSalary += p.totalSalary ?? 0` (summarize)
- `portfolioAggregate.js:91,301,324,355,373` 동일 패턴 (salaryByProject·tsrSignals·projActual·costKpi·costPlannedActual)
- `salaryHistogram:106` `seen.set(m.accountId, m.salary ?? 0)`

JS에서 `undefined ?? 0`과 `null ?? 0`은 **동일하게 0**이다. 즉 **키 삭제도 null 할당과 똑같이 "비용 0원"이라는 거짓 숫자를 만든다.** 설계가 §R3-B와 대조하며 제시한 근거("삭제는 Σ 0을 막는다")는 사실이 아니다. 거짓 숫자를 실제로 막는 유일한 수단은 **`costMasked` 기반 UI 게이팅**인데, 그 게이팅 지점 열거가 불완전하다:

| 미열거 소비 지점 | 증상 (키 삭제 후) |
|---|---|
| `PortfolioFilterBar.jsx:119-121` — 필터바 합계 칩 `₩{summary.totalSalary/1e6}M` | **모든 탭에서 항상 보이는 위치**에 "₩0M" 표시 |
| `PortfolioTsrSignalTable.jsx:97,140` — 종합 개요 테이블 salary 컬럼 | "₩0" 표시 |
| `portfolioAggregate.js:301-305` (`tsrSignals`) — `resource.totalSalary`·`burnRate`·`cpi`·`costLevel` | **종합 개요의 Cost 신호등이 0원 기준으로 계산**되어 오신호. Cost 탭 밖(페이지 셸)이라 "Cost 탭 대체"로 안 덮인다 |

참고: `PortfolioSalaryByProject`·`PortfolioSalaryHistogram`·`PortfolioProjectTable`은 **어디서도 import되지 않는 고아 위젯**이라 무관하다(확인 완료).

**수정 방안**
1. 키 삭제 결정 자체는 유지해도 된다(원본 제거 = 프론트 재계산 차단이라는 **본래 목적**은 유효). 단 근거 문장을 "Σ 거짓 숫자 방지"에서 "원본 데이터 제거"로 정정할 것 — 잘못된 근거는 다음 설계에서 또 인용된다(§R3 자기모순 전례).
2. §N6 프론트 대응을 **소비 지점 전수 목록**으로 교체: 비교 위젯 축 + Cost 탭 + **필터바 totalSalary 칩 숨김** + **TsrSignalTable salary 컬럼·cost 신호(costLevel/cpi/burnRate) 컬럼 숨김**. `costMasked`를 `PortfolioFilterBar`·`PortfolioTsrSignalTable`에 prop으로 내려야 한다.
3. §9 체크리스트의 테스트 항목 "**급여 컬럼을 조회조차 하지 않음**(U7 패턴 복제)"은 **구현 불가능**하다 — U7은 급여가 별도 쿼리였지만, 포트폴리오의 salary는 `getAllSnapshots()`가 통째로 읽는 `members_json` 안에 있다(`PortfolioAggregator.js:294-304` 적재, `PortfolioDashboardService.js:150` parse). 읽은 뒤 제거하는 것만 가능하다. 단언을 "응답에 `salary`/`totalSalary` 키 부재 + `costMasked:true`"로 바꿔야 한다.

### H-2. `teamMeta` 구성이 미정의라, "보이지 않는 팀을 고를 수 없다" 보장이 구현 해석에 달려 있다

설계는 세 곳에서 서로 충돌하는 서술을 한다:

| 위치 | 서술 | 함의 |
|---|---|---|
| §3 계약 표 (:774,:784) | `teamMeta`는 "`roleMeta`/`levelMeta`와 **동형** 객체 맵(기존 관례)" | `roleMeta`는 `getRoleListService()` = **KVS 전체 role** (`PortfolioDashboardService.js:160`). 동형이면 teamMeta = **전체 팀** |
| §R5 근거 3 (:529) | "`users` 1회 SELECT로 `accountId→team_key` 맵" | memberTeamMap = **전 사용자** (스코프 무관) |
| §N6 표 (:981) | "선택지를 응답 `teamMeta`에서 파생 — **teamMeta에 실제로 등장하는 팀만** 옵션. 서버가 이미 `scopedProjectIds`로 응답을 좁혔으므로 **데이터 파생이 스코프와 자동 일치**" | teamMeta = **스코프 내 팀만** 이어야 성립 |

`scopedProjectIds`가 좁히는 것은 `projects[]`뿐이다(`PortfolioDashboardService.js:156-158`). teamMeta·memberTeamMap을 관례대로(전체 목록으로) 만들면, TEAM_ONLY 사용자의 멀티셀렉트에 **스코프 밖 팀이 전부 노출·선택 가능**해진다 — 설계가 `getTeamOptions`를 기각한 바로 그 이유("보이지 않는 팀을 고를 수 있는 상태")가 재현된다. 반대로 teamMeta를 스코프로 좁히면 "roleMeta와 동형" 관용구 선언이 깨지고, **캘린더의 teamMeta**(전 프로젝트 인력 기준)와도 구성 규칙이 갈린다.

**수정 방안** (권장): 역할을 분리해 명문화하라 —
- `teamMeta`는 **이름 사전**일 뿐이다(전체 팀이어도 무해). 옵션 파생은 teamMeta 키가 아니라 **`projects[].members[]`(이미 스코프 적용됨)의 accountId를 `memberTeamMap`으로 사상해 실제 등장하는 teamKey 집합**에서 한다.
- 이렇게 하면 서버는 관례대로 구현하고(전체 맵), 스코프 일치는 클라이언트 파생 규칙이 보장한다. §N6 표의 "teamMeta에 실제로 등장하는 팀만"이라는 문장을 이 규칙으로 교체할 것.
- `memberTeamMap`을 전 사용자로 만드는 것 자체는 (팀 소속이 민감정보가 아니라는 H4 선언 하에) 수용 가능하나, 그 판단도 한 줄 명시 권장.

---

## 2. Medium

### M-1. N6 가동률 축은 모집단이 다른데, 상호작용 표가 4축을 일괄 서술한다 + `teamComparison` 시그니처로는 가동률 축을 계산할 수 없다

§3 "팀 지표 단일 정의" 결정 A/D로 N6 가동률 축의 원천이 `projects[].members[].utilization`(②)에서 **`utilization.people[]`(①글로벌)**로 바뀌었다. 옳은 정정이다(②는 사람당 값이 여러 개라 롤업 불가 — 실측 일치). 그러나 후속 정리가 안 됐다:

1. `utilization.people[]`은 **필터 무관 글로벌**이다(`PortfolioDashboardService.js:163` 주석 "필터 무관 글로벌", `meta.utilizationPeople`에서 직접). §N6 상호작용 표의 "**프로젝트 멀티셀렉트와 AND — 팀 합계는 그 범위로 줄어든다**"(:977)와 "선택 팀 합계 무손실"(:976) 논증은 `projects[].members[]` 유래 3축(MD·완수율·인건비)에만 성립한다. **가동률 축은 프로젝트 선택과 무관하게 항상 전사 값**이다. 한 위젯에서 3축은 필터에 반응하고 1축은 반응하지 않는 비대칭을 사용자에게 알리지 않으면 "필터를 걸었는데 가동률이 안 변한다"는 버그 리포트가 된다. → 상호작용 표에 가동률 축 예외 행 추가 + InfoTip.
2. §9 체크리스트(:2285)의 **`teamComparison(selected, memberTeamMap, teamMeta, {axis, topN})` 시그니처에는 `utilization.people[]` 입력이 없다.** 계약대로 구현하면 가동률 축을 계산할 수 없다. 시그니처에 `utilizationPeople` 인자를 추가하거나 축별 함수를 분리해 명시할 것.
3. P2-a 배포 후 **다음 배치 실행 전**까지 `people[]`에 `investedMd`/`availMd`가 없다. N7은 null 처리를 설계했지만(:1011) N6 위젯의 동일 상황 폴백은 미정 — `aggregateStatus`/`lastAggregatedAt`로 "집계 전" 표기를 N6에도 명시 권장.

### M-2. §3의 정정이 §15·§8·§8-3·i18n에 전파되지 않아 자기모순이 잔존한다

§3(단일 진실 원천)은 갱신됐는데 파생 절이 옛 결론을 그대로 갖고 있다. §15와 체크리스트만 읽는 구현자는 **폐기된 결론을 구현한다** — 이번 회차 설계 원칙("같은 절에서 규칙과 예시가 어긋나던 §R3 사고 재발 방지")에 정면으로 걸린다.

| 위치 | 잔존 서술 | §3 최신 결론 |
|---|---|---|
| §15 N4(재확인) 행 (:2569) | "인당 분모가 없어 **가중 계산 불가** → `팀 인원 평균 가동률` 라벨 분리" | 결정 D: 분모(`availMd`) 있음 → **가중 Σ/Σ, 단일 라벨 `팀 가동률`**, 라벨 분리 폐기(:862) |
| §8-3 D2 행 (:2113) | "✅ 라벨 분리로 제거 — `팀 가동률` ≠ `팀 인원 평균 가동률`" | 동상 — 라벨 분리 자체가 폐기됨 |
| §7 i18n (:2011) | `portfolio.team.axis.effort` = "**투입 공수(MM)**" | 결정 B: **MD** (MM은 팀 합산이 정의되지 않아 기각, :818-821) |
| §N6 표(:979)·§9(:2288)·§15(:2567) | 정렬 폴백 "**공수(MM)** 축" | 동상 — MD |
| §8 영향표 (:2069) | "배치(`PortfolioAggregator`) **무변경** — 회귀 방어의 핵심" / §R5(:524) "배치 변경 없음" | P2-a 체크리스트(:2236): `computeGlobalUtilization` **people.push 2필드 추가**(배치 수정) |
| §15 머리말 (:2565-2566) | "신규는 **N5·N6 2건**이다" / "범위: P2 전체 + N5 + N6" | §3·§9에 **N7이 존재**하고 P2-b의 절반이다 |

전부 기계적 정정이지만, 이 설계서는 "이름이 값을 속이는 것"을 막으려고 단일 정의 절을 만든 참이다. i18n의 MM 라벨은 그대로 두면 **화면에 박제**된다.

### M-3. N7의 `grants: [RESOURCE_MANAGEMENT read]` 유지 근거가 성립하지 않는다

§N7 결정 1(:1022-1023): "grants를 남겨두는 이유: 자원관리 권한 보유자(조직 관리자)도 같은 화면을 쓸 수 있게 — 팀장 전용으로 좁히면 관리자가 자기 팀을 못 본다."

그러나 결정 2(:1032)는 "서버는 **항상** `principal.leadingScopeAccountIds`와 교집합"이다. 팀 리더가 아닌 관리자는 `leadingScopeAccountIds = []`(PrincipalResolver.js:71,128 확인) → **grant로 통과해도 항상 빈 결과**다. 반대로 관리자가 실제 리더라면 `teamLead` 축만으로 이미 통과한다. 즉 grants가 실제로 열어주는 것은 "빈 섹션"뿐이고, 관리자에게 임의 팀을 보여주려면 `grantedBy` 분기가 필요한데 그건 결정 1이 "같은 응답이 grant 경로에 따라 다른 행 집합"이라며 **스스로 기각한 구조**다.

**수정 방안**: 둘 중 하나로 확정하라. (a) grants를 제거하고 `teamLead` 단독 축으로 — fail-close 일관, 화면 노출 조건(`isTeamLead()`)과도 일치. (b) 관리자 열람이 정말 요구라면 `grantedBy==='RESOURCE'`일 때 payload `teamKey`를 그대로 쓰는 분기를 **명시적 결정으로** 추가하고 결정 1의 표를 갱신. 현재 문면은 (a)의 코드에 (b)의 근거를 붙인 상태다.

### M-4. `TeamSelect`는 옵션 소스를 내부 고정한다 — N6의 "teamMeta 파생 옵션"과 충돌

`TeamSelect.jsx:53`은 **컴포넌트 내부에서 `useTeamOptions()`를 호출**하고 옵션 주입 prop이 없다. §9(:2282-2283)는 "TeamSelect에 isMulti 추가"와 "옵션은 getTeamOptions가 아니라 teamMeta에서 파생"을 나란히 요구하는데, **TeamSelect를 그대로 쓰면 옵션은 반드시 getTeamOptions(전체 팀)**다. 즉:
- `options` 오버라이드 prop 신설이 필요하다(설계 미기재), 또는 N6 필터바는 TeamSelect가 아닌 별도 Select를 쓴다(→ "새 Select를 만들지 않는다" 원칙과 충돌).
- 파생 옵션에는 `depth`/`parentTeamKey`가 없다(teamMeta는 flat `{key:name}`) → TeamSelect의 들여쓰기 렌더(`formatOptionLabel`, :76-82)와 계층 표현이 사라진다. 수용한다면 그 사실을, 계층이 필요하면 파생 소스를 어디서 보강할지를 정할 것.

`isMulti` 자체는 실측상 무리 없다 — `...rest` 스프레드(:84)·`value ?? null`(:67)이라 미지정 시 현행 경로 불변이고, 설계가 동일성 고정 테스트를 이미 요구한다. 이 부분은 잘 짚었다.

### M-5. N5 "그룹 키에 teamKey 금지" 조항의 **근거가 사실이 아니다** (처방은 옳다)

설계(:907): "그룹 키에 팀을 추가하면 `first`가 바뀌면서 `end`가 달라진다 — 정확히 '연차 -6MD' 계열."

실측 반박: 그룹 키는 `` `${schedule_start_date}__${schedule_end_date}__${schedule_type}` ``(`useProjectWorkersSchedule.js:47`)로 **start/end 문자열 자체가 키의 성분**이다. 한 그룹의 모든 행은 동일한 `schedule_end_date`를 가지므로, 키에 `teamKey`를 덧붙여 그룹이 쪼개져도 각 조각의 `first.schedule_end_date`는 **변할 수 없다**. 즉 주장된 날짜 사고는 발생하지 않는다. 실제 위험은 다른 것이다 — **다인 통합 이벤트(AvatarStack)가 팀별로 쪼개져 중복 렌더**되는 UI 회귀.

결론(필터는 `:40` `filtered` 단계에만)은 여전히 옳으므로 구현 지침은 유지하되, **근거를 정정**할 것. 검증된 것처럼 서술된 가짜 함정은 다음 설계에서 "전례"로 인용될 때 해를 끼친다(U3·"유일하게 동작한다" 전례와 같은 유형). 나머지 N5 실측(필터 단계 분리 `:40-42`/`:91-122` vs 조립 `:61`/`:125-168`, `+1일 보정` 위치, invalidate 2곳 `:207-209`/`:235-237`, `dayMaxEvents={3}`, PermissionMap 0줄 — `getTeamOptions` OR에 `['PROJECT','read']` `PermissionMap.js:77-78`)은 **전부 파일 대조로 일치**했다.

---

## 3. Low

| # | 항목 | 내용 |
|---|---|---|
| L-1 | 캘린더 조기 반환 shape | `getProjectCalendarWorklogService`는 스코프 교집합이 비면 `{data:[]}`를 **조기 반환**한다(`ProjectCalendarService.js:75-77`). 여기에 `memberTeamMap`/`teamMeta`를 안 실으면 루트 필드 집합이 경로별로 갈린다 — 설계가 `emptyShape()`에 적용한 1:1 원칙을 이 분기에도 명시할 것 |
| L-2 | `emptyShape()`의 `costMasked` 값 | 빈 환경 조기 반환 시 `costMasked`가 principal을 반영하는지 미정. `!canReadCost(principal)`로 채우도록 명시 권장(하드코딩 `false`면 빈 환경의 Member에게 비용 UI가 잠깐 열려 보인다 — 데이터가 없어 무해하나 일관성) |
| L-3 | N6 멀티셀렉트의 '팀 미지정' | 미선택 기본 표에는 `팀 미지정` 행이 있는데, **선택 모드에서 '팀 미지정'을 고를 수 있는지** 미정(`TeamSelect includeNoneOption` 존재). 정하지 않으면 구현이 갈린다 |
| L-4 | `PortfolioTeamDist` 체크리스트 부재 | §R5 표 #2(:539)는 P2에 `PortfolioTeamDist`(구성비)를 약속했고 §N6도 "별개 위젯"으로 언급하나, §9 P2 체크리스트에 생성 항목이 없다. P2 범위인지 이후인지 확정할 것 |
| L-5 | `computeCompletionRate` "export 승격" | `WorkAssignmentRules.js:96` 복사본은 **이미 export**돼 있다. 승격 없이 그쪽을 import하면 끝 — 어느 쪽을 import할지 지정하라(§8-3 C6 취지대로 하나를 지목해야 함) |
| L-6 | "N6가 3번째 복사본" 카운트 | 백엔드 `canReadCost` 복사본은 **1개뿐**(`ProjectDashboardService.js:135-136` — 승격 대상과 문자 그대로 동일식임을 확인, 동작 차이 없음). N6가 만들면 2번째다. 사소한 과장이나 등록부 정확성 차원에서 정정 |
| L-7 | N5 빈 결과 UX | `useTeamOptions()`는 전체 팀을 주므로, 이 프로젝트에 없는 팀을 고르면 캘린더가 통째로 빈다. "선택 팀 인원이 이 프로젝트에 없음" 상태 표시를 고려(선택) |

---

## 4. 사실 확인 결과 — 새 결함 주장 4건 (요청 항목 E)

| # | 판정 | 근거 |
|---|---|---|
| **U12** | ✅ **사실** | `PermissionMap.js:218` `getPortfolioDashboard: R('REPORT','list')` / `ResourceCatalog.js:44-45` Member `REPORT read=true` / `PortfolioAggregator.js:294-304` `members[].salary`(유효급여)·`:401` `totalSalary` 적재 / `PortfolioDashboardService.js:146,150` 그대로 응답. **개인 유효급여가 전 REPORT 보유자에게 나가는 중** — 맞다. "N6 축과 분리 불가"라는 판단도 옳다(원본이 payload에 남으면 파생 축 게이팅 무의미). 단 마스킹 범위·근거는 H-1 참조 |
| **U13** | ✅ **사실** (발현 조건 좁음) | `ProjectCalender.jsx:140-145` `new Date('yyyy-mm-dd')`(UTC 파싱)+`setDate`+`toISOString`, `WorklogPage.jsx:168` **동일 코드 복제 확인**. `TimeUtils.addDaysToDateString:63`은 `'T00:00:00'` 로컬 파싱 — 규약 불일치 맞다. **값이 틀어지는 시나리오**: DST 시간대(예: America/New_York) 뷰어가 봄 전환(3월)을 가로지르는 다일 이벤트를 볼 때 — `2027-03-10` 시작 5d: UTC 파싱→로컬 3-09 19:00 EST→`setDate(+5)`→3-14 19:00 EDT = UTC 3-14 23:00→`toISOString`→**3-14** (기대 3-15, **1일 축소**). KST(DST 없음)에서는 오프셋이 왕복 상쇄되어 미발현. 별도로 `days = Math.round(sec/(hourRate·3600))`은 시간대 무관 왜곡 — `1d 4h`(12h) 로그가 **2일 이벤트**로 렌더, hourRate 설정 변경 시 과거 로그 전체가 어긋남. "별도 과제" 처분에 동의 |
| **U14** | ✅ **사실** (표현 일부 과장) | `tabs.js:55` `projectDetailTabs(t,project_id,toast,...)`에 `context` 인자 자체가 없고 `:130`이 `<ProjectCalender project_id toast/>`만 렌더. → `getMyScheduleList` `enabled: !!context?.accountId`(`ProjectCalender.jsx:79`) **항상 false** 맞다. 드래그는 "크래시"가 아니라 `onEventDrop`의 try/catch(:193-214)가 `context.timezone` TypeError를 삼키고 `revert()` — **조용한 항상 실패**다. 추가 발견: context를 넣어도 `:202` `event.extendedProps.started`는 존재하지 않는 필드(extendedProps는 `{issue, worklog}`)라 시간 재계산이 별도로 깨져 있다 — U14 수정 시 함께 볼 것 |
| **U15** | ✅ **사실** | 인라인 키 5종 확인: `'coworkerFieldId'`·`'getProjectWorklog'`(useProjectCalender.js:8,16) / `'getSettingData'`·`'getMyScheduleList'`(ProjectCalender.jsx:66,73) / `'getAllProjectWorkersSchedule'`(useProjectWorkersSchedule.js:13). invalidate 하드코딩 2곳(:207-209,:235-237) 일치. "N5는 쿼리키를 안 건드리므로 기록만" 처분 타당 |

---

## 5. 요청 항목별 판정 요약

### A. 지표 단일 정의
**크게 개선됐다.** 검토 시작 시점엔 "재사용" 선언뿐이었으나, 갱신본은 가동률 3종·완수율 4종·MM 3종을 실측 열거하고 계산 위치를 특정했다. 지목 함수 대조 결과: `computeGlobalUtilization`(사람당 1값, `investedMd`/`availMd` 내부 보유 — `PortfolioAggregator.js:172-215` 일치), `computeCompletionRate` 2벌(`ResourceManagementService.js:261`·`WorkAssignmentRules.js:96` 일치), `getResourceLoadSummary` 병렬 페치 구조 일치. "스코프만 다르고 산식은 같다"가 ①단일 원천 + `aggregateByTeam` 단일 롤업(D4)으로 구조화됐다. 남은 구멍: **M-1(가동률 축 모집단·시그니처), M-2(정정 미전파)**.

### B. 인건비 게이팅
U12는 사실. `CostAccess.js` 승격 대상은 백엔드에 1개뿐이며 승격식은 문자 그대로 동일(동작 차이 없음). `emptyShape()` 1:1 주장은 실측 일치(`PortfolioDashboardService.js:67-78` — 정상 경로 루트 10필드와 정확히 동일). **키 삭제 vs §R3-B null 마스킹**: 두 규칙의 공존 자체는 가능하다(§R3-B=형태 안정이 목적인 DTO, N6=원본 제거가 목적인 집계 입력 — 목적이 다르다). 그러나 **키 삭제의 명시 근거("null은 Σ에서 0, 삭제는 아님")는 `?? 0` 소비부 앞에서 거짓**이고, 거짓 숫자의 실제 방어선인 costMasked 게이팅 목록이 불완전하다 → **H-1**. "기존 동작 축소" 범위도 문서(Cost 탭)보다 넓다: 종합 개요 신호등의 Cost 신호·salary 컬럼, 필터바 합계 칩.

### C. N5 캘린더
"행 필터링 ↔ 이벤트 조립 분리" 주장 **사실**(파일 대조 완료, +1일 보정은 `:61`에 격리, `selectedAccountIds` 선례가 `:40-42`에 존재). `memberTeamMap` 하나로 두 소스를 덮는 설계 **성립** — 일정 행은 `account_id` 보유(`UserSchedule.FIND_BY_PROJECT_ID`가 projectusers 조인), 원천을 `projectusers ⋈ users`로 지정해 휴가-only 인원 누락도 막았다. `PermissionMap` 0줄 **사실**. 단 **그룹 키 금지 조항의 근거는 허위**(M-5)이고, 조기 반환 shape(L-1)이 남는다.

### D. N6 필터 ↔ 비교
**무손실 논증은 members[] 유래 3축에서 옳다** — 필터 술어(`p.members.some(m→선택팀)`)와 팀 합산이 같은 배열·같은 맵을 쓰므로, 팀 X에 0이 아닌 기여를 주는 프로젝트는 정의상 필터를 통과한다. 반례 없음. 상위10+기타+미지정도 합계 보존(사람당 팀 1개라 팀 간 이중계상 없음). 그러나 **가동률 축은 이 논증 밖**(M-1)이고, **TEAM_ONLY 선택지 차단은 teamMeta 구성에 달려 있어 현재 미보장**(H-2), '팀 미지정' 선택 가능 여부 미정(L-3).

### F. 회귀 위험
- `TeamSelect isMulti`: 미지정 시 동일성 — 코드 구조상 성립 가능(`...rest`·`value ?? null`), 동일성 고정 테스트 요구도 있음. 옵션 소스 충돌만 해결 필요(M-4).
- `memberTeamMap` 부재 키: `?? null` 소비 규약이 명문화돼 있고 `'__NONE__'` 센티넬·`TEAM_FILTER_NONE` import 규칙과 정합. **안전**.
- P0/P1 확정과의 모순: S6(스냅샷 **테이블** 무변경)은 유지되나 "배치 무변경" 문구들이 P2-a의 aggregator 수정과 충돌(M-2). 3상태 필터·`whereIn([])` 가드·C1은 모순 없음(P2 체크리스트에 `findProjectIdsByTeamKeys` 가드 포함 확인).
- 기존 동작 축소 범위: **문서화보다 넓다** — H-1 표 참조.

### G. 단계 분할 (P2-a → P2-b → P2-c)
**성립한다.** P2-a(순수 추가: project_team·teamKey 응답·배치 2필드·`aggregateByTeam`)가 전제를 깔고, P2-b(N7+N5)는 P2-a 산출물만 의존하며 기존 화면 무변경, P2-c(N6+U12)는 유일한 동작 축소라 단독·최후 배포 — 롤백 단위 분리 논리가 타당하다. 각 단계 배포 가능 판정 명시됨. 주의 1건: P2-a 배포~다음 배치 실행 사이 `investedMd`/`availMd` 부재 구간 — N7은 null 설계가 있으나 N6 폴백 명시 필요(M-1-3).

---

## 6. 결론

**H-1·H-2를 설계서에 반영한 뒤 구현 착수를 권한다.** 둘 다 코드 구조 변경이 아니라 설계서의 열거·정의 보강이라 반영 비용은 작지만, 반영 없이 착수하면 각각 "전 사용자에게 ₩0 오표기"(ScopeSplitCell 사건과 동일한 `?? 0` 삼킴 유형)와 "TEAM_ONLY 스코프 보장 무산"으로 직행한다. M-2(정정 전파)는 기계적이므로 같은 커밋에서 처리하고, M-3·M-4는 P2-b·P2-c 착수 전까지, L은 구현 중 처리로 충분하다.
