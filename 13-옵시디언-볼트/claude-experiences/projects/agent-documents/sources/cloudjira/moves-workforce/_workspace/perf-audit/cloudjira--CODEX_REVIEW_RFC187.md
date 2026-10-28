Reading additional input from stdin...
OpenAI Codex v0.147.0
--------
workdir: C:\CloudJira\moves-workforce
model: gpt-5.6-terra
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019ff52d-8175-75f2-a3db-a8dd9a8fd2eb
--------
user
성능 개선 리팩토링 10건의 코드 리뷰를 요청한다. 근거 감사 보고서는 _workspace/perf-audit/BACKEND_2026-08-12.md 와 FRONTEND_2026-08-12.md, 수정 리포트는 같은 폴더의 FIX_STAGE1_BACKEND.md / FIX_STAGE1_FRONTEND.md / FIX_STAGE2_BACKEND.md / FIX_STAGE2_FRONTEND.md 이다. 워킹 트리의 미커밋 변경(git diff HEAD)이 전부 이번 리뷰 대상이다.

변경 의도와 대상:
[백엔드]
1. A-1 워크로그 추가 조회 페이지 크기 20→100 (래퍼 기본값 승계): src/resolver/myWork/MyWorkService.jsx, src/resolver/utils/worklog/WorklogService.js
2. A-8 SQL 인덱스 무력화 해소 (BIN_TO_UUID(col)=? → col=UUID_TO_BIN(?)): src/rdb/query/ProjectDashboard.js
3. A-3 대시보드 통계 2종의 동일 전량 스캔 통합 + viewerId 키 60초 캐시: src/api/jira/issue/ProjectParticipantFetcher.js(신규), src/api/jira/issue/IssueApi.js, src/resolver/projectDashboard/ProjectDashboardService.js, src/resolver/projectIssue/ProjectUsersService.js
4. A-7 마스터 사전 6종 60초 모듈 캐시 + 쓰기 경로 22곳 무효화: src/resolver/backoffice/DictionaryCache.js(신규), Role/Level/Skill/ProjectStatus/PublicHoliday/Setting 서비스, src/seed/SeedData.js
[프론트]
5. P1-7 업로드 폴링 document.hidden 가드 + 복귀 즉시 1회: static/ui/src/polling/jobPolling.js, JobPollingManager.jsx
6. P1-9 My Work 동일 resolver 2회→1회 (캘린더 데이터에서 요약 파생, 월경계 clip): static/ui/src/pages/myWork/WorklogPage.jsx, utils/useMyWorklogList.js, utils/useMyWorklogSummary.js
7. P1-14 사용자 정보 캐시를 accountId 단위로 재설계(배치 창 로더): static/ui/src/utils/queryKey/jiraKeys.js, utils/useJiraUserInfos.js, utils/jiraApi/users/getUserInfos.js
8. P1-4 getUser 개별 호출 4곳 벌크 전환: pages/projectDetail/cost/CostByIssueTable.jsx, salary/SalaryManagementPage.jsx, user/ProjectUserPanel.jsx, pages/resource/... useProjectResourceMembers.js
9. P1-3 프로젝트 상세 탭 3중 마운트 해소: components/feedback/ToastFlags.js, constants/tabs.js, components/tab/CommonTab.jsx
10. P1-8 사용자 검색 디바운스+레이스 가드: components/select/UserSearchSelect.jsx / P1-13 표 어댑터 상수 절감: components/table/TableSurface.jsx, tableSort.js

리뷰 관점 (중요 순):
1) 정합성 회귀 — 응답 shape·표시 값 불변 주장 검증. 특히: P1-9의 월경계 clip이 종전 서버 필터와 정말 동치인가, A-3 캐시의 viewerId 키가 권한 누수를 완전히 막는가, A-7 무효화 누락 쓰기 경로가 정말 없는가(grep 검증), P1-14 배치 창 로더의 동시 마운트 경합.
2) 캐시 도입의 stale 위험 — 60초 TTL 2종이 사용자 체감 버그("수정했는데 안 바뀜")를 만들 시나리오.
3) 성능 주장 자체의 타당성 — 실제로 왕복이 줄었는가, 새 오버헤드(배치 창 setTimeout, fetchQuery 다발)가 이득을 상쇄하지 않는가.
4) 동시성/레이스 — 폴링 visibilitychange, UserSearchSelect 가드, DictionaryCache Promise 캐시의 실패 경로.

출력: 결함은 심각도(치명/중요/사소)와 파일:라인, 구체적 실패 시나리오로. 스타일 지적은 생략. 문제없는 항목은 항목 번호로 짧게 확인만.
hook: SessionStart
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
hook: UserPromptSubmit Failed
codex
변경 사항과 감사·수정 보고서를 대조해 정합성·캐시·동시성 중심으로 리뷰하겠습니다. 이 작업은 프론트–백엔드 계약과 성능 검증이 핵심이라 `integration-verify` 지침을 적용합니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -Raw 'C:\\CloudJira\\moves-workforce\\.agents\\skills\\integration-verify\\SKILL.md'; Write-Output \""'`n---INDEX---"; Get-Content -Raw '"'C:\\Users\\DMOVE\\Codex-experiences\\INDEX.md'; Write-Output \""'`n---ROOT---"; Get-Content -Raw '"'CLAUDE.md'" in C:\CloudJira\moves-workforce
 succeeded in 3883ms:
---
name: integration-verify
description: "Moves RMS ?듯빀 ?뺥빀?깆쓣 寃利앺븯???ㅽ궗. 諛깆뿏??resolver ?묐떟 shape ???꾨줎??invoke ?뚮퉬 肄붾뱶瑜?援먯감 鍮꾧탳?섍퀬, jest/鍮뚮뱶瑜??ㅽ뻾?섎ŉ, ?깅뒫 ?⑦꽩 ?꾨컲怨?i18n ?꾨씫???먭??쒕떎. integration-verifier ?먯씠?꾪듃媛 ?ъ슜. 寃利?QA/?뚯뒪???뺥빀???뺤씤 ???ъ슜."
---

# Integration Verify ???듯빀 ?뺥빀??寃利?
媛?而댄룷?뚰듃媛 媛쒕퀎?곸쑝濡?留욎븘??**?곌껐 吏?먯뿉??怨꾩빟???닿툔?섎뒗** 寃쎄퀎硫?踰꾧렇媛 ?고????먮윭??二쇱썝?몄씠?? ???ㅽ궗???듭떖? "議댁옱 ?뺤씤"???꾨땲??**"寃쎄퀎硫?援먯감 鍮꾧탳"** ??

## 寃利??먯튃: ?묒そ ?숈떆 ?쎄린

?쒖そ留?蹂대㈃ 寃쎄퀎硫?踰꾧렇瑜?紐??〓뒗?? ?앹궛?먯? ?뚮퉬?먮? **媛숈씠** ?닿퀬 鍮꾧탳?쒕떎.

| 寃쎄퀎硫?| ?앹궛??(?쇱そ) | ?뚮퉬??(?ㅻⅨ履? | ?먭? |
|--------|-------------|---------------|------|
| ?묐떟 shape | resolver??responseWrapper 諛섑솚 媛앹껜 | `invoke()` 寃곌낵 `result.content.xxx` ?묎렐 | ?꾨뱶紐끒룹쨷泥?援ъ“ ?쇱튂 |
| **?쒕퉬???대? ?뚮퉬??* | Service ?⑥닔 諛섑솚 shape 蹂寃?| **洹??⑥닔瑜?import ?섎뒗 ?ㅻⅨ 諛깆뿏??Service** | ?⑥닔紐??꾩뿭 grep ??紐⑤뱺 ?대? ?몄텧 吏?먯쓽 ?뚮퉬 肄붾뱶 ?쇱튂 |
| **?ㅼ쨷 shape ?ъ궗??而댄룷?뚰듃** | 媛숈? 而댄룷?뚰듃???꾨떖?섎뒗 **?쒕줈 ?ㅻⅨ 媛앹껜 2醫??댁긽** | 洹?而댄룷?뚰듃媛 ?쎈뒗 ?꾨뱶 ?꾩껜 | 媛?shape??**紐⑤뱺 李몄“ ?꾨뱶媛 ?ㅼ옱?섎뒗媛** (?쒖そ?먮쭔 ?덈뒗 ?꾨뱶 = 議곗슜???ㅽ몴湲? |
| ?⑥닔 留ㅽ븨 | `src/index.js` ?깅줉 + `registerXxxController` | ?꾨줎??`invoke('fnName')` | fnName ?쇱튂, ?깅줉 ?꾨씫 ?놁쓬 |
| ?섑븨 | 諛깆뿏?쒓? `{ content:{ items:[] } }`濡?媛먯뙂 | ?꾨줎?멸? `.content.items` unwrap | ?섑븨 ?④퀎 ?쇱튂 |
| 荑쇰━??| ??| `queryKey/` ?⑺넗由??ъ슜 ?щ? | ?몃씪??諛곗뿴 ?꾨떂 |
| i18n | `locales/kr/*`쨌`locales/en/*` ??+ merge ?ㅽ뻾 | UI `t('key')` | ??議댁옱 (`locales/script/*.json`? 鍮??ㅽ뀅 ??嫄곌린 ?덉쑝硫?誘몃컲?? |
| 沅뚰븳 | 諛깆삤?쇱뒪 resolver 沅뚰븳 媛??| `canRead/canWrite(pageId)` | ?쇱튂 |

> ?좑툘 **?쒕퉬???묐떟 怨꾩빟 蹂寃????꾩닔 ?덉감** (2026-07-13 ?뚭? 援먰썕): resolver?뷀봽濡좏듃 寃쎄퀎留?蹂대㈃ ???쒕떎.
> Service ?⑥닔???ㅻⅨ ?꾨찓??Service 媛 吏곸젒 import ???ъ궗?⑺븯??寃쎌슦媛 ?덈떎 ???? `getProjectStatusListService`
> 怨꾩빟??`{rows:[...]}` 濡?諛붽엥?????꾨줎???뚮퉬泥?3怨녹? 怨좎낀吏留?`PortfolioDashboardService` ???대? ?몄텧(諛곗뿴濡?> `.map`)???볦퀜 ?듯빀 ??쒕낫???꾩껜媛 "?곗씠?곕? 遺덈윭?ㅼ? 紐삵뻽?듬땲??濡??ㅼ슫?먮떎.
> **怨꾩빟??諛붾??⑥닔???⑥닔紐낆쑝濡?`src/` ?꾩뿭 grep ?섏뿬 由ъ「踰??깅줉遺 ?몄쓽 紐⑤뱺 import/?몄텧 吏?먯쓣 援먯감 鍮꾧탳?섎씪.**

> ?좑툘 **??而댄룷?뚰듃媛 ?щ윭 shape??諛쏆쓣 ??* (2026-07-22 ?뚭? 援먰썕): resolver?뷀봽濡좏듃 異뺣쭔 蹂대㈃ 紐??〓뒗 遺瑜섍? ?덈떎.
> **?묒そ ??怨꾩빟??吏耳곕뒗?곕룄** 踰꾧렇媛 ?쒕떎 ???묒뾽 諛곗젙 ?붾㈃??`ScopeSplitCell` ? `candidate.project` ?
> `candidate.company` ??媛앹껜???ъ궗?⑸릺?붾뜲, `assignedCount` ??`project` ?먮쭔 ?덇퀬 `company` ?먮뒗 ?녿떎.
> 而댄룷?뚰듃媛 `scope?.assignedCount ?? 0` ?쇰줈 ?쎌뼱 ?꾩궗 ?ㅼ퐫?꾧? **??긽 "?좊떦 ?묒뾽 ?놁쓬"** ?쇰줈 ?쒓린?먮떎
> (怨쇰????몄썝???ъ쑀濡?떎怨??ㅽ뙋?쒗궎?? 洹??붾㈃??留됱쑝?ㅻ뜕 ?ㅽ뙣 紐⑤뱶 洹??먯껜).
> **?먭?踰?** 媛숈? 而댄룷?뚰듃??2醫??댁긽??媛앹껜瑜??섍린??吏?먯쓣 李얘퀬(?몄텧遺 grep), 而댄룷?뚰듃媛 李몄“?섎뒗 **紐⑤뱺 ?꾨뱶**瑜?> 媛?shape???ㅼ젣 ?앹궛 肄붾뱶? ?議고븯?? ?듭뀛??泥댁씠?씲??? 0` ? ??寃고븿??**?먮윭 ?놁씠 ?쇱폒** ?섎せ??媛믪쑝濡??뚮뜑?쒕떎.
> 怨듯넻 ?꾨뱶 / A ?꾩슜 / B ?꾩슜???쒕줈 遺꾨━??由ы룷?몄뿉 ?④만 寃?

## 媛뺥븳 泥댄겕由ъ뒪??(議댁옱 ?뺤씤 < 援먯감 鍮꾧탳)

| ?쏀븿 | 媛뺥븿 |
|------|------|
| resolver媛 議댁옱?섎뒗媛? | resolver ?묐떟 shape怨??꾨줎??`result.content` ?묎렐???쇱튂?섎뒗媛? |
| invoke瑜??몄텧?섎뒗媛? | ?몄텧 fnName??`src/index.js`???깅줉???⑥닔? 留ㅼ묶?섎뒗媛? |
| 踰덉뿭 ?ㅺ? ?덈뒗媛? | `t()`媛 李몄“?섎뒗 ?ㅺ? `locales/kr/`쨌`locales/en/`???덇퀬 merge?먮뒗媛? |
| 而댄룷?뚰듃媛 ?꾨뱶瑜??쎈뒗媛? | 洹?而댄룷?뚰듃???섏뼱?ㅻ뒗 **紐⑤뱺 shape**??洹??꾨뱶媛 ?ㅼ옱?섎뒗媛? |

## ?꾨줈?앺듃 ?뱁솕 ?먭?

- **invoke ?묐떟 ?묎렐:** `{ success, content, error }`?먯꽌 `result.content`瑜??뺥솗??爰쇰궡怨?`result.success===false`瑜?泥섎━?섎뒗媛?
- **camelCase/snake_case:** DB 而щ읆 ??Query 寃곌낵 ???묐떟 ?꾨뱶 ???꾨줎???묎렐???꾨뱶紐??쇨???- **利됱떆 ?묐떟 vs ??鍮꾨룞湲?:** ?묒? ?낅줈????`src/queue/consumer.js`+`JobPollingManager.jsx`)?먯꽌 ?꾨줎?멸? 利됱떆 ?묐떟?먯꽌 理쒖쥌 寃곌낵瑜??묎렐?섏? ?딅뒗媛?
- **?깅뒫 ?꾨컲:** ?뚰겕濡쒓렇 ?ㅺ굔 議고쉶媛 怨듯넻 ?섏튂 寃쎈줈瑜??섏젙?덈뒗媛(湲덉?)? ?꾩슜 蹂묐젹 ?섏쿂 + `p-limit`?멸?? Resource 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆?멸??
- **i18n:** ko-KR/en-US瑜?吏곸젒 ?섏젙?섏? ?딆븯?붽?? merge媛 ?ㅽ뻾?먮뒗媛?

## ?ㅽ뻾 寃利?
- 諛깆뿏?? 猷⑦듃 `npm test` (jest)
- ?꾨줎?? `cd static/ui && npm test`, ?꾩슂 ??`npm run build`
- **鍮뚮뱶 ?듦낵 ???뺤긽 ?숈옉.** 鍮뚮뱶媛 ?듦낵?대룄 shape 遺덉씪移섎뒗 ?고??꾩뿉 ?곗쭊?? 諛섎뱶??援먯감 鍮꾧탳瑜?蹂묓뻾?쒕떎.

## 寃利??쒖젏: ?먯쭊??incremental)

?꾩껜 ?꾩꽦 ??1?뚭? ?꾨땲??**媛?紐⑤뱢(resolver + ????? ?꾩꽦 吏곹썑** 利됱떆 ?대떦 寃쎄퀎硫댁쓣 援먯감 寃利? 珥덇린 遺덉씪移섍? ?꾩냽 紐⑤뱢濡??꾪뙆?섎뒗 寃껋쓣 留됰뒗??

## 異쒕젰

`_workspace/<feature>/03_verify_report.md`??**?듦낵 / ?ㅽ뙣 / 誘멸?利?* 3遺꾨쪟濡??묒꽦. ?ㅽ뙣 ??ぉ? `?뚯씪:?쇱씤` + 遺덉씪移??댁슜 + ?섏젙 諛⑸쾿. 寃쎄퀎硫??댁뒋??backend쨌frontend ?묒そ???듭?. 寃利?遺덇? ??ぉ? "誘멸?利??쇰줈 紐낆떆?섍퀬 異붿륫?쇰줈 ?듦낵 泥섎━?섏? ?딅뒗??


---INDEX---
# Codex Experiences

- [[projects/confluence-approval-dc-2026-08-12-qa-6b-rework]] Confluence Approval DC 諛곗튂 6b QA 寃고븿 ?ъ옉?낃낵 寃利??섍꼍 ?쒖빟 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-qa-6a-rework]] Confluence Approval DC 諛곗튂 6a QA ?ъ옉?? ?곸뿭 ?ㅼ틦?? ?댁떆 ?대갚, ?ㅼ젙 諛??대찓???명솚 ?섏젙.

- [[projects/confluence-approval-dc-2026-08-12-cancel-region-hash]] Confluence Approval DC 痍⑥냼 ?곹깭, ?붿껌 硫붾え, ?곸뿭 蹂몃Ц ?댁떆 湲곕컲 ?뺣? 留뚮즺 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-reapproval-qa-fixes]] Confluence Approval DC ?ъ듅???④퀎 snapshot 蹂듭썝, 洹몃９ 異쒖쿂 蹂댁〈 諛?QA ?섏젙 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-email-due-soon]] Confluence Approval DC C9 email MailQueue 梨꾨꼸, 留덇컧 ?꾨컯 ?⑹꽦 ???뚮┝, ?ㅼ젙 諛?寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-notification-outbox]] Confluence Approval DC C9 媛먯궗 ?대깽??湲곕컲 in-app ?뚮┝ outbox, ?ъ떆??drain, 沅뚰븳 ?꾪꽣 寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-review-fixes]] Confluence Approval DC C9 ?ㅼ젙 ??κ낵 scheduler lifecycle, macro render-context ?ㅼ젙 cache??由щ럭 ?섎━ 諛?寃利?湲곕줉.
- [[projects/confluence-approval-dc-2026-08-11-deadline-scheduler]] Confluence Approval DC C9 cluster ?⑥씪 留뚮즺 sweep, ?ㅼ젙 ?щ벑濡? `dueSoon` ?뚯깮 ?묐떟怨?寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-group-approver-snapshot]] Confluence Approval DC C9 洹몃９ ?뱀씤???좏깮, user key snapshot, `VIA_GROUP` 蹂댁〈怨?Flow 寃利??쒖젏 遺꾨━ 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-10-app-settings]] Confluence Approval DC ???꾩뿭 ?ㅼ젙 援ы쁽怨?C9 寃利?李⑤떒 ?먯씤 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-user-key-regression]] Confluence Approval DC ?ъ슜??寃??key瑜?Confluence user key濡?蹂듦뎄?섍퀬 username ????곗씠???쒖떆 fallback??異붽???湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-formatting]] Confluence Approval DC C9 Java ?뚯씪???뺤텞???щ㎎??湲곕뒫 蹂寃??놁씠 蹂듦뎄?섍퀬 Maven 寃利앹쓣 ?꾨즺??湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11]] C9 ?뱀씤 ?낅Т??3-tab, ?곸꽭 REST ?묐떟, AO Flow ?곌껐怨??ㅽ뻾 以?target lock 寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-09]] Confluence 9 REST媛 Jersey HK2濡??앹꽦?섎뒗 ?쒖빟, ActiveObjects??plugin-scoped OSGi 議고쉶, C9/C10 manifest쨌?⑦궎吏?寃利?湲곕줉.

- [[projects/moves-workforce-documentation-2026-08-06-sync]] 2026-08-06 肄붾뱶 湲곗??좉낵 ?쒗뭹 臾몄꽌??鍮꾨룞湲??ъ쭛怨꽷톢017 schema ?쒕━?꾪듃瑜??숆린?뷀븳 湲곕줉.

- [[topics/confluence-dc-ao-table-name]] Confluence Data Center Active Objects entity table-name 30???쒗븳怨?吏㏃? `@Table` 紐낅챸 洹쒖튃.

- [[topics/tanstack-query-cross-domain-invalidation]] ???섎굹???ㅼ젙 蹂寃쎌씠 ?щ윭 ?붾㈃???뚯깮 cache??誘몄튂???곹뼢??query key prefix helper濡?愿由ы븯???⑦꽩.
- [[projects/moves-workforce-documentation-baseline-sync]] ???댁쁺 諛고룷蹂멸낵 媛쒕컻 湲곗???遺꾨━, ?ㅼ젣 ?곹븳쨌沅뚰븳쨌schema 怨꾩빟??援먯감 寃利앺빐 臾몄꽌瑜??숆린?뷀븯???⑦꽩.
- [[projects/moveseye/moveseye-documentation-system|moveseye-documentation-system]] ??multi-repo ?쒗뭹 臾몄꽌 ?뺣낯쨌?묒뾽 利앷굅쨌Obsidian MOC瑜?遺꾨━?섍퀬 code/OpenAPI/Flyway/route瑜??ъ떎 ?먯쿇?쇰줈 ?곌껐?섎뒗 ?⑦꽩.
- [[topics/forge-kvs-eventual-consistency-cache]] ??Custom Entity query??eventual consistency媛 mutation 吏곹썑 frontend refetch瑜??댁쟾 媛믪쑝濡??섎룎由????덈뒗 寃쎄퀎? ????⑦꽩.
- [[topics/confluence-dc-forge-approval-estimation]] ??Confluence Data Center ?뱀씤 ???곗젙?먯꽌 Forge Cloud? Java P2瑜?遺꾨━?섍퀬 macro쨌?대윭?ㅽ꽣쨌Marketplace 鍮꾩슜??怨꾩궛?섎뒗 湲곗?.
- [[topics/code-splitting-bundle-budget-contract]] ??肄붾뱶 ?ㅽ뵆由ы똿 援ъ“媛 諛붾???initial/async chunk ?덉궛怨?CI gate瑜??④퍡 媛깆떊?섎뒗 ?⑦꽩.
- [[projects/escore-resume-customization]] ???먯뒪肄붿뼱 Elastic Stack ?ъ??섏슜 ?대젰?쒖쓽 MovesEye쨌Moves Workforce 洹쇨굅, 怨쇱옣 諛⑹? ?먯튃, 7?섏씠吏 Word 寃??湲곗???
- [[vault_updates/escore-resume-movesai-expansion|escore-resume-movesai-expansion]] ???붾Т釉?寃쎈젰??MovesEye쨌Moves Workforce쨌Elastic Stack쨌?덉쭏/?댁쁺?쇰줈 理쒕? ?뺤옣?섍퀬 8?섏씠吏 Word ?뚮뜑留곸쓣 寃?섑븳 湲곕줉.


---ROOT---
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> ?꾪뻾??湲곗?: **2026-08-10 / ?뚯뒪 `03857aa`(2026-08-10)**
> ?쒗뭹 臾몄꽌(`Moves_Workforce_*.md`)??蹂꾨룄 湲곗??좎쓣 媛吏꾨떎 ??`README.md` ?뚮Ц??湲곗??졼?李몄“.

## ?꾨줈?앺듃 媛쒖슂

Atlassian Jira Cloud??Forge ??(Moves RMS). ?꾨줈?앺듃 ?몃젰쨌? 愿由? ?뚰겕濡쒓렇 異붿쟻, MD/MM쨌媛?숇쪧쨌吏꾩쿃?꽷룸퉬??遺꾩꽍, 媛꾪듃.
釉뚮옖移? `RFC-NNN`, 媛쒕컻 ?듯빀: `develop`, 硫붿씤: `master`

## 湲곗닠 ?ㅽ깮

- **?고???*: Forge (`nodejs22.x`, arm64, 256MB) ??`manifest.yml`??`runtime.name`???⑥씪 吏꾩떎
- **?꾨줎?몄뿏??*: React 18, React Router 7 (MemoryRouter), Zustand 5, TanStack Query 5
- **UI**: Atlaskit (Jira 怨듭떇 ?붿옄?몄떆?ㅽ뀥) + `@compiled/react`
- **李⑦듃/?쒓컖??*: ECharts(`echarts-for-react`), FullCalendar 6, `@xyflow/react`(?곹깭 ?뚮줈??, `react-grid-layout`(??쒕낫??, `react-kanban-kit`(移몃컲), `@svar-ui/react-gantt`(媛꾪듃 ??MIT. GPL??`wx-react-gantt`???ъ슜 湲덉?)
- **留덊겕?ㅼ슫/ADF**: `@mdxeditor/editor`, `marklassian`, `adf-to-md`
- **?좏떥**: `dayjs`, `moment-timezone`, `p-limit`(?숈떆???쒗븳)
- **DB**: Forge SQL (MySQL/TiDB) + Forge KVS (NoSQL)
- **鍮뚮뱶**: CRA + **craco**(`craco start` / `craco build`, ?ㅼ젙? `static/ui/craco.config.js`), 鍮뚮뱶 ??`bundle:check` 寃뚯씠?멸? ?댁뼱 遺숇뒗??| **?뚯뒪??*: jest(?꾨줎?몃룄 `react-scripts test`媛 ?꾨땲??jest 吏곸젒) | **紐⑤땲?곕쭅**: Sentry | **i18n**: `@forge/bridge`
- **諛깆뿏???섏〈??*: `@forge/api`, `@forge/sql`, `@forge/kvs`, `@forge/events`, `@forge/resolver`, `exceljs`(?묒? ?낅줈??

## 二쇱슂 而ㅻ㎤??
```bash
# 諛깆뿏???뚯뒪??(猷⑦듃) ??jest
npm test

# ?꾨줎?몄뿏??媛쒕컻 ?쒕쾭
cd static/ui && npm start

# ?꾨줎?몄뿏???뚯뒪??cd static/ui && npm test

# ?꾨줎?몄뿏??鍮뚮뱶 (prebuild?먯꽌 ?먮룞?쇰줈 踰덉뿭 merge ?ㅽ뻾)
# build = build:app(craco build) + bundle:check(踰덈뱾 ?덉궛 寃뚯씠????珥덇낵?대룄 寃쎄퀬留?
cd static/ui && npm run build
# CI? ?숈씪 議곌굔?쇰줈 ?뺤씤?섎젮硫? CI=true npm run build   ??濡쒖뺄留??듦낵?섍퀬 CI媛 源⑥???寃껋쓣 留됰뒗??
# 踰덉뿭 ?뚯씪 蹂묓빀 ???ㅼ젣 ?ㅽ겕由쏀듃: locales/script/merge.js
cd static/ui && npm run merge

# Forge 諛고룷 (manifest.yml 湲곗?)
forge deploy
forge tunnel   # 濡쒖뺄 媛쒕컻???곕꼸
```

## 踰덉뿭(i18n) 洹쒖튃

**`locales/en-US.json`, `locales/ko-KR.json` 吏곸젒 ?섏젙 湲덉?.**

踰덉뿭 異붽? ??
1. `locales/kr/{湲곕뒫}.json` + `locales/en/{湲곕뒫}.json` ??踰덉뿭 ??媛?異붽? (?뚯씪紐낆? 湲곕뒫 ?⑥쐞. `locales/script/*.json`? 鍮??ㅽ뀅?대씪 嫄곌린 ?ｌ쑝硫?merge??諛섏쁺?섏? ?딆쓬)
2. `cd static/ui && npm run merge` ?ㅽ뻾 (`locales/script/merge.js`) ??`locales/kr/*.json` + `locales/en/*.json` ??`ko-KR.json` / `en-US.json` ?앹꽦

UI?먯꽌 踰덉뿭 ?ъ슜: `useI18nStore`??`t()` ?⑥닔 (`static/ui/src/stores/useI18nStore.js`)

## 諛깆뿏???꾪궎?띿쿂

### 怨꾩링 援ъ“
```
src/index.js  ?? Controller  ?? Service  ?? (Repository)  ?? DB
```

?꾨찓?몃퀎濡?`src/resolver/{?꾨찓??/` ?꾨옒??臾띠뿬 ?덉쓬.

| 遺꾨쪟 | ?꾨찓???붾젆?좊━ |
|------|----------------|
| ?꾨줈?앺듃 | `project`, `projectIssue`, `projectDashboard`, `projectCalendar`, `projectProgress`, `projectCost`, `projectTeam`, `projectSubscription` |
| 遺꾩꽍 | `issueAnalysis`, `resourceAnalysis`, `teamAnalytics`, `portfolioDashboard` |
| 媛쒖씤 | `myWork`, `mySchedule`, `myPage` |
| ?먯썝 | `resourceManagement`, `workAssignment` |
| 湲고? | `gantt`, `storage`, `scheduler`, `license`, `utils` |
| 諛깆삤?쇱뒪 | `backoffice/{user,role,level,team,skill,permission,setting,projectStatus,publicHoliday}` |

- `XxxController.js` ??resolver ?⑥닔 ?깅줉 (`registerXxxController(resolver)` export)
- `XxxService.js` ??鍮꾩쫰?덉뒪 濡쒖쭅
- `XxxRepository.js` ??DB ?묎렐 (?좏깮?? ?녿뒗 ?꾨찓?몄? Service?먯꽌 `src/rdb/query/` 吏곸젒 ?ъ슜)
- ?쇰? ?꾨찓?몄? `.jsx` ?뺤옣???ъ슜 (`myWork`, `mySchedule`)

**??而⑦듃濡ㅻ윭 異붽? ??*: `src/index.js`??**`CONTROLLER_REGISTRARS` 諛곗뿴?먮쭔** 異붽??쒕떎. 沅뚰븳 怨꾩빟 ?뚯뒪??`test/permission/permissionMap.contract.test.js`)媛 ??諛곗뿴??import ???깅줉 ?⑥닔紐낆쓣 ?섏쭛?섎?濡?紐⑸줉????怨녹뿉 蹂듭젣?섏? ?딅뒗??
(二쇱쓽: ?遺遺?`registerXxxController` ?ㅼ씠諛띿씠??`ProjectStatusController`??`projectStatusController`, Sentry??`SentryConfig`濡??쇨????놁쓬)

### 沅뚰븳 媛??+ ?묐떟 ?쒖?????`guardedDefine`

resolver ?깅줉? `guardedDefine`???대떎. ???⑥닔媛 `responseWrapper`瑜??대?濡??≪닔?섎?濡?**`resolver.define` + `responseWrapper` 議고빀? ?좉퇋 肄붾뱶?먯꽌 ?ъ슜?섏? ?딅뒗??**

```js
// src/permission/permissionGuard.js
import { guardedDefine } from '../../permission/permissionGuard';

export function registerProjectTeamController(resolver) {
    guardedDefine(resolver, 'getProjectTeams', ({ payload }) => getProjectTeamsService(payload));

    // 媛???듦낵 ??req.principal ??遺李⑸맂??    guardedDefine(resolver, 'getTeamMemberCandidates', ({ payload, principal }) =>
        getTeamMemberCandidatesService(payload, principal));
}
```

- `src/permission/PermissionMap.js` ??**誘몄꽑???⑥닔???먯쿇 嫄곕?(deny-by-default)**. ?좉퇋 resolver ?⑥닔???ш린 ?깅줉???꾩닔?대ŉ, 鍮좊쑉由щ㈃ ?고??꾩뿉??`PERMISSION_UNMAPPED`濡?二쎈뒗??
- ?ㅼ퐫???뺤콉 紐⑤뱢: `PrincipalResolver`, `ProjectScope`(`ALL | MEMBER_ONLY | TEAM_ONLY`), `ResourceCatalog`, `CostAccess`(`PROJECT_COST` 遺꾨━), `SalaryVisibility`, `TeamAnalyticsScope`, `TeamLeadFieldPolicy`

**??媛???듦낵 = ?곗씠??踰붿쐞 ?뺤젙???꾨땲??** 媛?쒕뒗 "???⑥닔瑜?遺瑜????덈굹"留?蹂몃떎. ?щТ쨌?몄궗 ?곗씠?곕? ?댁＜??resolver??`principal`???쒕퉬?ㅺ퉴吏 ?꾨떖??**?묐떟 ?댁슜???곕줈 醫곹???* ?쒕떎. ?ㅼ젣濡?諛잛? 寃껊뱾:
- 湲됱뿬쨌?먭????뺤콉(`SalaryVisibility`)怨?**蹂꾧컻濡?* `CostAccess.canReadCost(principal)`瑜??④퍡 ?붽뎄?쒕떎. ?뺤콉留?蹂대㈃ 湲곕낯媛?INDIVIDUAL) ?ㅼ튂媛 ?꾨? ?대┛??
- ?몃젰 紐낅???`TeamAnalyticsScope.resolveTeamAnalyticsScope(principal)` ?⑥씪 異쒖쿂瑜??곕Ⅸ?? ?쒕뱶 `Team Lead` ?꾨━?뗭씠 `RESOURCE_MANAGEMENT read`瑜?媛吏誘濡??ㅼ퐫?꾨? ??蹂대㈃ ??μ씠 ?꾩궗 紐낅?瑜?蹂몃떎.
- **???붾㈃留?留됱쑝硫??뺤젣 resolver濡??고쉶?쒕떎.** 媛숈? ?곗씠?곕? ?댁＜??寃쎈줈瑜??꾨? 李얠븘 媛숈? ?먯젙???듦낵?쒗궗 寃?(?몃젰 紐낅???5媛쒖???.
- ?쎄린?먮쭔 ?덇퀬 ?곌린???녿뒗 寃利앹쓣 議곗떖??寃? 寃利앹? **怨듭슜 ?⑥닔濡?戮묒븘** ??寃쎈줈媛 媛숈? 寃껋쓣 蹂닿쾶 ?쒕떎 (`assertTeamInProjectScope` ?꾨?).
- `principal` ?꾨씫? **fail-close** ?ъ빞 ?쒕떎 ??而⑦듃濡ㅻ윭媛 ?꾨떖??鍮좊쑉?ㅻ룄 議곗슜???대━吏 ?딄쾶.
- ?묐떟 ?뺥깭??醫낆쟾怨??숈씪:
  - ?깃났 `{ success: true, ...result }`
  - ?ㅽ뙣 `{ success: false, error: { name, code, message, cause } }`

### ?먮윭 泥섎━
- 而ㅼ뒪? ?먮윭 ?대옒?? `src/error/` (`CustomEntityError`, `ForgeAPIError`, `LogicalError`, `SqlError`, `PermissionError`, `ProjectScopeError`)
- ?먮윭 肄붾뱶 ?뺤쓽: `src/utils/errors/ErrorCodes.js`
- ???먮윭?ㅼ쓣 throw?섎㈃ 媛???섑띁媛 `{ success:false, error }` ?뺥깭濡?吏곷젹??
### DB ?묎렐 ?⑦꽩
- **MySQL**: `src/rdb/query/` ??Query ?대옒???ъ슜 ??`CommonQuery`, `ProjectQuery`, `ProjectDashboard`, `ProjectUsersQuery`, `ProjectTeamQuery`, `ProjectSubscriptionQuery`, `PortfolioSnapshotQuery`, `GanttFolderQuery`, `SkillMappingQuery`, `UserQuery`, `UserSchedule`. 荑쇰━ 議곕┰? `QueryBuilder.js`
- **NoSQL (KVS)**: `src/nosql/query/CustomEntityManager.js` ?ъ슜
- Storage ?뷀떚??role, level, team, skill, permission, status, status_link, settings, holiday, job, job_batch, job_fail ????KVS, ?꾨줈?앺듃/?ъ슜???뚰겕濡쒓렇/援щ룆 ?곗씠?곕뒗 MySQL
- ?ㅽ궎留?留덉씠洹몃젅?댁뀡: `src/rdb/schema/` (`ddl/`, `migrate.js`, `isDBReady.js`) ??DDL? `ddl/index.js`???깅줉
- **Forge SQL(TiDB) ?쒖빟**: FK 誘멸컯?? `ON DELETE CASCADE` 臾댄슚, ?몃옖??뀡 誘몄?????cascade ??젣?????덈꺼 ?쒖감 硫깅벑 DELETE濡?援ы쁽
- KVS??**鍮?臾몄옄????μ쓣 嫄곕?**?쒕떎. ?좏깮 ?꾨뱶??`|| ''` ????띿꽦 ?먯껜瑜??앸왂??寃?- KVS ?뷀떚?곗뿉 ???띿꽦??異붽??섎㈃ `manifest.yml`??attributes ?좎뼵??癒쇱? 諛붽씀怨?`forge deploy` ?댁빞 ?쒕떎 (?꾨땲硫??????422)
- **`findAll()`? 100嫄??섎뱶罹?*?닿퀬 而ㅼ꽌瑜?踰꾨┛????珥덇낵遺꾩씠 **議곗슜??* ?섎┛?? ?꾨웾???꾩슂??怨?紐⑸줉 議고쉶, ?대쫫 以묐났 ?먯젙 ??? `findAllPaged(indexName, pageLimit, maxItems)`瑜??대떎. 紐⑸줉怨?以묐났 ?먯젙???ㅻⅨ ?곹븳???곕㈃ "紐⑸줉???녿뒗????μ? 嫄곕?"媛 ?앷린誘濡??곹븳? ?곸닔濡?怨듭쑀??寃?(?ㅽ궗 ?꾨━?뗭씠 133媛쒕씪 ?ㅼ젣濡?諛잛븯??

### Jira API
- `src/api/jira/` ?꾨옒 `UserApi`, `IssueApi`, `WorklogApi`, `TimeTrackingApi`
- `@forge/api`??`requestJira()` ?ъ슜, `src/api/jira/util/RequestJiaJson.js`濡??쒖???- **`asUser()`媛 湲곕낯**. `asApp()`? ?꾪궎?띿쿂 臾몄꽌???닿굅???뚮옯???덉쇅?먮쭔 ?ъ슜?쒕떎 (留덉폆?뚮젅?댁뒪 ?ъ궗 遺??
- 而ㅼ뒪? ?꾨뱶 議고쉶 ??`fieldsByKeys: true` ?꾩닔 ??`getCustomFieldId`媛 Forge key瑜?諛섑솚?섎?濡?`false`硫????꾨뱶媛 議곗슜???꾨씫?쒕떎

## ?꾨줎?몄뿏???꾪궎?띿쿂

### ?쇱슦??(`static/ui/src/App.jsx`)
`MemoryRouter` 湲곕컲. ??濡쒕뱶 ??i18n 珥덇린??+ 沅뚰븳 濡쒕뱶 ???뚮뜑留?(????濡쒕뵫 ?앸굹???붾㈃ ?쒖떆).
```
/                          ??/myWork 濡?由щ떎?대젆??/myWork                    ??WorklogPage (湲곕낯 吏꾩엯)
/dashboard                 ??PortfolioDashboardPage (?꾩궗 ?듯빀 ??쒕낫??
/project                   ??MainPage  (?? ?꾨줈?앺듃 紐⑸줉 + 移몃컲)
/project/:id               ??ProjectDetailPage
/resource                  ??ResourcePage (?몃젰?꾪솴 / ?꾨줈?앺듃諛곗젙 / ? 遺꾩꽍)
/my-page                   ??MyPage (媛쒖씤 ??쒕낫??
/backoffice/users          ??UserPage
/backoffice/team           ??TeamPage
/backoffice/skill          ??SkillPage
/backoffice/role           ??RolePage
/backoffice/level          ??LevelPage
/backoffice/project-status ??ProjectStatusPage
/backoffice/setting        ??SettingPage
/backoffice/permission     ??PermissionSettingPage
/backoffice/public-holiday ??PublicHolidayPage
/backoffice/storage        ??StoragePage (DB ?ъ슜??紐⑤땲?곕쭅)
```

??援ъ꽦? `static/ui/src/constants/tabs.js`???뺤쓽 (`mainPageTabs`, `projectDetailTabs`). 沅뚰븳???곕씪 `canRender`濡????몄텧 ?쒖뼱.

### 肄붾뱶 ?ㅽ뵆由ы똿 二쇱쓽 (2026-08-05 ?щ룄??
??而댄룷?뚰듃??`React.lazy`濡?遺꾪븷???덈떎. **媛?而⑦뀒?대꼫??泥???? ?뺤쟻**?쇰줈 ?먭퀬, lazy ??? 諛섎뱶??`CommonTab.jsx`??Suspense 寃쎄퀎 ?꾨옒???덉뼱???쒕떎. 寃쎄퀎 ?놁씠 suspend ?섎㈃ React error #426???쒕떎 (2026-08-04??lazy瑜??꾨㈃ ?먮났?덈뜕 ?먯씤). 猷⑦듃 `index.js`媛 `ReactDOM.render`(legacy)??`startTransition`쨌`isPending`? 臾댄슚?대?濡? #426? Suspense 寃쎄퀎濡쒕쭔 留됰뒗??

### ?곹깭 愿由?(Zustand Stores)
`static/ui/src/stores/`
- `useI18nStore`: `t(key)` 踰덉뿭 ?⑥닔, `init()` 珥덇린??- `usePermissionStore`: `canRead(pageId)`, `canWrite(pageId)` 沅뚰븳 泥댄겕, 諛깆삤?쇱뒪 ?섏씠吏 ?묎렐 ?쒖뼱
- `useLicenseStore` + `licenseDecision.js`: ?쇱씠?좎뒪 ?곹깭. **李⑤떒? 紐낆떆??INACTIVE ?섎굹肉?*?대떎 ???먯젙 遺덇?(UNAVAILABLE)???듦낵?쒗궓?? 諛깆뿏??`assertLicenseAllowed`媛 `responseWrapper`濡?紐⑤뱺 resolver瑜?媛먯떥誘濡? ?먯젙 遺덇?瑜?李⑤떒?쇰줈 ?ㅻ（硫??곷쪟 5xx ??踰덉씠 ???꾨㈃ ?뺤?媛 ?쒕떎. ?꾨줎?맞룸갚?붾뱶媛 **媛숈? 寃쎄퀎**?ъ빞 "?쒕쾭???묐떟?섎뒗???붾㈃留?媛?대뱶 ?섏씠吏"媛 ???앷릿??- `useJobStore`: ?묒? ?낅줈???묒뾽 ID 異붿쟻 (localStorage, TTL 24h)

### ?쒕쾭 ?곹깭 (React Query)
荑쇰━ ?ㅻ뒗 ?⑺넗由??⑥닔濡?愿由? `static/ui/src/utils/queryKey/`
`userKeys`, `projectKeys`, `backofficeKeys`, `portfolioKeys`, `resourceKeys`, `teamAnalyticsKeys`, `assignmentKeys`, `myWorkKeys`, `myPageKeys`, `jiraKeys`, `logicalAuditKeys`
```js
userKeys.all           // ["users"]
userKeys.list(params)  // ["users", "list", params]
projectKeys.kanban()   // ["kanban"]
```
**??荑쇰━ ?ㅻ뒗 諛섎뱶??`queryKey/` ?꾨옒 ?⑺넗由??⑥닔濡??뺤쓽.** `queryKeyContract.test.js`媛 怨꾩빟??寃?ы븳??

### 怨듭슜 UI 吏??(RFC-178, 2026-08-05)
???붾㈃? ?꾨옒瑜?癒쇱? ?뺤씤?섍퀬 ?ъ궗?⑺븳?? ?ㅽ뵾?덈뒗 ?꾨㈃ ?쒓굅?먭퀬 濡쒕뵫? ?ㅼ펷?덊넠?쇰줈 ?쒗쁽?쒕떎.

| ?⑸룄 | ?꾩튂 |
|------|------|
| ?섏씠吏 ???ㅻ뜑 | `components/layout/PageContainer.jsx`, `PageHeader.jsx` |
| ??쒕낫??洹몃━??| `components/layout/BentoGrid.jsx` |
| 濡쒕뵫 ?쒗쁽 | `components/skeleton/Skeleton.jsx`, `components/table/skeletonRows.js` |
| ?뚯씠釉?| `components/table/` (`CommonTable`, `PagingTable`, `CursorPagingTable`, `TreeTable`) |
| 移대뱶/?꾩껜?붾㈃ | `components/card/` (`Card`, `CardFullscreen`, `Summary`) |
| 李⑦듃 怨듯넻 | `components/chart/` (`ChartTableToggle`, `ViewToggleButtons`, `EmptyState`, `expandContext`) |
| 李⑦듃 ?됱긽 | `constants/chartPalette.js` |

### ?꾨줎?몄뿏??Jira 吏곸젒 ?몄텧
?쇰? ?붾㈃? 諛깆뿏??resolver瑜?嫄곗튂吏 ?딄퀬 `static/ui/src/utils/jiraApi/`?먯꽌 `@forge/bridge`??`requestJira`濡?Jira REST瑜?吏곸젒 ?몄텧 (JQL ?앹꽦湲?`jqlMaker` ?ы븿).
而ㅼ뒪? ?꾨뱶 write 吏곹썑 `search`/`jql` ?ъ“?뚮뒗 ?몃뜳??吏?곗쑝濡???媛믪씠 ?ㅻ?濡? invalidate ????쒕쾭 ?묐떟?쇰줈 罹먯떆瑜??⑥튂?쒕떎.

### Forge Bridge ?몄텧
```js
import { invoke } from '@forge/bridge';
const result = await invoke('resolverFunctionName', { ...params });
// result: { success, content, error }
```

## 二쇱슂 ?섏씠吏 援ъ“ (`static/ui/src/pages/`)

- `myWork/` ?????뚰겕濡쒓렇 ?섏씠吏 (湲곕낯 吏꾩엯, `/myWork`)
- `myPage/` ??媛쒖씤 ??쒕낫??(`/my-page`)
- `portfolio/` ???꾩궗 ?듯빀 ??쒕낫??(`/dashboard`)
- `resource/` ???먯썝愿由?(`/resource`, ?몃젰?꾪솴쨌?꾨줈?앺듃諛곗젙쨌? 遺꾩꽍)
- `project/` ???꾨줈?앺듃 紐⑸줉 (`/project` ??
- `projectKanban/` ??移몃컲 蹂대뱶 (`/project` ?? `ProjectKanbanBoard`)
- `license/`, `nonPermission/` ???쇱씠?좎뒪 留뚮즺쨌沅뚰븳 ?놁쓬 ?붾㈃
- `projectDetail/` ???꾨줈?앺듃 ?곸꽭 (`/project/:id`), `ProjectDetailTabs` 湲곕컲 ??
  - `dashboard/` ????쒕낫??(`react-grid-layout`)
  - `user/` ???꾨줈?앺듃 ?몃젰 (?섏쐞: ?몃젰 / 湲됱뿬 `salary/` / ?묒뾽 諛곗젙 `assignment/`)
  - `work/` ???묒뾽愿由?(紐⑸줉 | ?몃━ | 媛꾪듃 酉??꾪솚, `gantt/` ?ы븿)
  - `progress/` ??吏꾩쿃??  - `cost/` ??鍮꾩슜
  - `calender/` ???꾨줈?앺듃 罹섎┛??(FullCalendar)
  - `issue/` ???꾨줈?앺듃 ?댁뒋
  - `taskHistory/` ???묒뾽 ?대젰
  - `analysisReport/issue|resource|team/` ???댁뒋쨌?몃젰쨌? 遺꾩꽍 由ы룷??
諛깆삤?쇱뒪 ?섏씠吏??蹂꾨룄濡?`static/ui/src/backoffice/page/` ?꾨옒???꾩튂 (`user`, `team`, `skill`, `role`, `level`, `permission`, `setting`, `projectStatus`, `publicHoliday`, `storage`).

## Forge ???뱀씠?ы빆

- **manifest.yml**: Global Page, Custom Fields(projectId, coworkers, projectAssignedDate, projectAssignedById, wbsParent), Scheduled Trigger, SQL, Storage ?뺤쓽
- **?ㅼ튂 ?몃━嫄?* (`src/trigger/onInstall.js`): SEED_VERSION 愿由? KVS??湲곕낯 ?곗씠??珥덇린??(?쒕뱶 媛믪? `src/seed/SeedData.js`)
- **?ㅼ?以??몃━嫄?*: `runPortfolioSnapshot`(?꾩궗 ??쒕낫???ㅻ깄??, `runSubscriptionReconcile`(?꾨줈?앺듃 援щ룆 ?뺥빀???ㅼ쐲, RFC-171)
- **??湲곕컲 ?낅줈??* (`src/queue/consumer.js`): ??⑸웾 ?ъ슜???낅줈?쒕뒗 `@forge/events` ???ъ슜, ?꾨줎?몃뒗 `JobPollingManager.jsx`濡?吏꾪뻾瑜??대쭅
- **DB 留덉씠洹몃젅?댁뀡**: `src/rdb/schema/migrate.js` ??`runMigration` ?⑥닔 (manifest???깅줉)
- **?섍꼍 遺꾨━**: dev/prod ?깆씠 ???ъ씠?몄뿉 怨듭〈?섎㈃ 媛숈? ?대쫫??而ㅼ뒪? ?꾨뱶媛 2踰??앷꺼 JQL ?대쫫 留ㅼ묶??紐⑦샇?댁쭊?? ?댁쁺 ?ъ씠?몄뿉???⑥씪 ?섍꼍 ?깅쭔 ?ㅼ튂??寃?- **? 愿由ы삎 ?꾨줈?앺듃**: Forge 而ㅼ뒪? ?꾨뱶媛 `fields` ?묐떟?먯꽌 ?듭㎏濡?鍮좎쭊??write쨌JQL ?몃뜳?ㅻ뒗 ?숈옉). `projectId`??而ㅼ뒪? ?꾨뱶 洹몃?濡??곌퀬, **`coworkers`쨌?깅줉?셋룸벑濡앹옄쨌`wbsParent`???댁뒋 ?뷀떚???꾨줈?쇳떚(`movesRms`)濡??댁쟾 ?꾨즺**??`manifest.yml`??`jira:entityProperty`, `searchAlias`濡?JQL 寃??.
  - ?쎄린??**諛섎뱶??`static/ui/src/utils/jiraApi/coworkerProperty.js`(?꾨줎?? / `src/api/jira/issue/IssuePropertyApi.js`(諛깆뿏??留?* ?ъ슜?쒕떎. `issue.properties` ?몃씪???묎렐 湲덉?.
  - ?곌린??`mergeIssueProperty`(read-merge-write)濡??ㅻⅨ ?ㅻ? 蹂댁〈?쒕떎. `writeIssueProperty`???꾩껜 援먯껜??湲곗〈 媛믪쓣 ?좊┛??
  - `getCoworkerFieldIdApi`/`coworkerFieldId` ?몄옄??**?명솚 ?좎??⑹씠硫??쎄린???곗씠吏 ?딅뒗??*(`IssueApi.js` 二쇱꽍 李몄“). ??肄붾뱶?먯꽌 ??寃쎈줈濡?coworker瑜??쎌? 留?寃?
## ?꾨찓???곸꽭 臾몄꽌

- `src/resolver/gantt/GANTT.md` ??媛꾪듃 ?곗씠??紐⑤뜽쨌?대뜑 怨꾩링쨌???諛⑹떇
- `static/ui/src/pages/projectDetail/work/WORK_VIEWS.md` ???묒뾽愿由?酉??꾪솚 ??紐⑸줉/?몃━/媛꾪듃)쨌?몃━ 酉?(諛깆뿏???놁쓬, 媛꾪듃 ?곗씠?걔톗utation ?ъ궗??
- `src/resolver/projectProgress/CALCULATION.md` ??吏꾩쿃???곗떇
- ?쒗뭹/?ㅺ퀎 臾몄꽌 ?명듃??由ы룷吏?좊━ 猷⑦듃??`Moves_Workforce_*.md` (git 誘몄텛??

## ?섎꽕?? 湲곕뒫 ?ㅺ퀎쨌媛쒕컻쨌寃利?
**紐⑺몴:** ?좉퇋 湲곕뒫???ㅺ퀎 ??諛깆뿏??援ы쁽 ???꾨줎??援ы쁽 ??寃利??쒖감 ?뚯씠?꾨씪?몄쑝濡??꾨Ц ?먯씠?꾪듃媛 援ы쁽?쒕떎(寃쎄퀎硫?怨꾩빟???⑥씪 吏꾩떎濡?. ?고??꾩씠 ? ?듭떊??吏?먰븯硫?蹂묐젹 ? 紐⑤뱶濡??꾪솚 媛??

**?몃━嫄?** ?좉퇋 湲곕뒫 媛쒕컻/?ㅺ퀎, RFC 湲곕뒫 援ы쁽, ??ㅽ깮 湲곕뒫쨌?섏씠吏쨌由ы룷??異붽?, 湲곕뒫 ?섏젙쨌蹂댁셿쨌?ъ떎???붿껌 ??`feature-harness` ?ㅽ궗???ъ슜?섎씪. ?⑥닚 吏덈Ц쨌?⑥씪 ?뚯씪 ?섏젙? 吏곸젒 ?묐떟 媛??

**蹂寃??대젰:**
| ?좎쭨 | 蹂寃??댁슜 | ???| ?ъ쑀 |
|------|----------|------|------|
| 2026-05-29 | 珥덇린 援ъ꽦 (?먯씠?꾪듃 4 + ?ㅽ궗 5) | ?꾩껜 | - |
| 2026-05-29 | i18n 寃쎈줈 ?뺤젙 (locales/kr쨌en???ㅼ젣 merge ?뚯뒪, script??鍮??ㅽ뀅) | skills/forge-frontend-dev | 吏꾩쿃???섏씠吏 援ы쁽 以?merge.js ?ㅽ솗??|
| 2026-05-29 | ?고????대갚 紐낆떆 (而ㅼ뒪? agent_type쨌TeamCreate 誘몄?????general-purpose ?쒕툕?먯씠?꾪듃 ?뚯씠?꾨씪?? | skills/feature-harness | 泥??ㅼ쟾 媛?숈뿉??? 紐⑤뱶 遺덇? ?뺤씤 |
| 2026-05-30 | ?쒖감 ?뚯씠?꾨씪?몄쓣 二?寃쎈줈濡??밴꺽(? 紐⑤뱶???듭뀡 媛뺣벑), Phase 4 蹂묐젹???뺣━(backend?뭚rontend ?쒖꽌 媛뺤젣), ?묒뾽 ?꾨줈?좎퐳 ?쒖감 ?곗꽑 ?ъ옉??| feature-harness + ?먯씠?꾪듃 4 | ?대갚???ъ떎??二?寃쎈줈??臾몄꽌쨌?ㅽ뻾 ?쇱튂?쒗궡 |
| 2026-05-30 | ?묒뾽 ?붾젆?좊━ 湲곕뒫蹂??쒕툕?붾젆?좊━??`_workspace/<feature>/` (湲곗〈 progress-page 留덉씠洹몃젅?댁뀡) | ?꾩껜 | ?ㅺ린???숈떆 ?묒뾽 ??_workspace 異⑸룎 諛⑹? |
| 2026-05-30 | settings.local.json ?뺣━ (?쇳쉶???먯깋 紐낅졊 ?쒓굅, ?ъ궗???⑦꽩留??좎?) | settings.local.json | allow 由ъ뒪???몄씠利??쒓굅 |
| 2026-06-11 | i18n ?뚯뒪 寃쎈줈 ?꾨㈃ ?숆린??(`locales/script` ??`locales/kr`쨌`locales/en`) | CLAUDE.md i18n 洹쒖튃, ?먯씠?꾪듃 3(architect/frontend/verifier), ?ㅽ궗 3(feature-design/forge-frontend-dev/integration-verify) | ?섎꽕??媛먯궗?먯꽌 script/*.json??2諛붿씠??鍮??ㅽ뀅?꾩쓣 ?뺤씤 (merge.js??kr/en留??쎌쓬), 5-29 ?뺤젙??forge-frontend-dev ??怨녹뿉留?諛섏쁺???덉뿀??|
| 2026-06-11 | feature-design SKILL.md frontmatter 源⑥쭚 ?섏젙 (`/---` ??`---`) | skills/feature-design | frontmatter 誘명뙆?깆쑝濡??ㅽ궗 description???몄텧?섏? ?딅뜕 踰꾧렇 |
| 2026-06-11 | ?고???媛깆떊 諛섏쁺: 而ㅼ뒪? subagent_type 吏곸젒 ?앹꽦 + SendMessage ?ы샇異?而⑦뀓?ㅽ듃 ?좎?) 梨꾪깮, general-purpose+Read ?고쉶 ?먭린 | skills/feature-harness | ?고??꾩씠 而ㅼ뒪? ?먯씠?꾪듃 ???4醫낃낵 SendMessage瑜?吏?먰븿???뺤씤 (TeamCreate???ъ쟾??誘몄??????쒖감 ?뚯씠?꾨씪???좎?) |
| 2026-07-13 | 寃쎄퀎硫?援먯감 鍮꾧탳??"?쒕퉬???대? ?뚮퉬?? ??ぉ 異붽? ???묐떟 怨꾩빟 蹂寃????⑥닔紐?`src/` ?꾩뿭 grep?쇰줈 諛깆뿏???대? import/?몄텧 吏???꾩닔 ?뺤씤 | skills/integration-verify | ?꾨줈?앺듃 ?섏씠吏 P0?먯꽌 getProjectStatusListService 怨꾩빟??`{rows}`濡?諛붽씀硫?PortfolioDashboardService ?대? ?몄텧(諛곗뿴 `.map`)???꾨씫 ???듯빀 ??쒕낫??濡쒕뵫 ?ㅼ슫 ?뚭?. resolver?뷀봽濡좏듃留?蹂대뜕 寃利앹쓽 ?ш컖吏? ?뺤씤 |
| 2026-07-22 | 寃쎄퀎硫?援먯감 鍮꾧탳??"?ㅼ쨷 shape ?ъ궗??而댄룷?뚰듃" ??ぉ 異붽? ????而댄룷?뚰듃??2醫??댁긽 媛앹껜瑜??섍린??吏?먯쓣 李얠븘 李몄“ ?꾨뱶 ?꾩껜瑜?媛?shape???앹궛 肄붾뱶? ?議?| skills/integration-verify | ?묒뾽 諛곗젙 ?붾㈃?먯꽌 `ScopeSplitCell`??`candidate.project`쨌`candidate.company` ?묒そ???ъ궗?⑸릺?붾뜲 `assignedCount`媛 project ?꾩슜?대씪 ?꾩궗 ?ㅼ퐫?꾧? ??긽 "?좊떦 ?묒뾽 ?놁쓬"?쇰줈 ?ㅽ몴湲? **?묒そ ??怨꾩빟??吏耳쒖꽌** resolver?뷀봽濡좏듃 異?寃利앹쑝濡쒕뒗 ???≫삍怨? `?? 0`??寃고븿???먮윭 ?놁씠 ?쇱섟??|
| 2026-08-10 | CLAUDE.md ?꾨㈃ ?꾪뻾?????고???22.x ?뺤젙, ?쇱슦??6媛쑣톜esolver ?꾨찓?맞룹옘由ы궎쨌?섏씠吏 援ъ“ 蹂닿컯, `guardedDefine`/`PermissionMap` ?깅줉 洹쒖빟怨?RFC-178 怨듭슜 UI 吏?먃룹퐫???ㅽ뵆由ы똿 二쇱쓽 異붽? | CLAUDE.md | 7-23 ?댄썑 誘멸갚?좎쑝濡??ㅼ젣 肄붾뱶? ?닿툔??臾몄꽌 理쒖떊???먭??먯꽌 ?뺤씤) |
| 2026-08-10 | 諛깆뿏???깅줉 ?⑦꽩 ?뺤젙(`responseWrapper` ??`guardedDefine`) + `PermissionMap` ?깅줉 ?④퀎 ?좎꽕, ?뚭????듦낵 ???곗씠??踰붿쐞 ?뺤젙??洹쒖빟怨?KVS `findAll()` 100嫄??섎뱶罹?異붽? | skills/forge-backend-dev, agents/backend-engineer | ?ㅽ궗??**?먭린???⑦꽩??媛瑜댁튂怨??덉뿀怨?* `PermissionMap` ?깅줉???듭㎏濡?鍮좎졇 ?덉뿀????洹몃?濡??곕Ⅴ硫??좉퇋 resolver媛 ?고??꾩뿉 `PERMISSION_UNMAPPED`濡?二쎈뒗??|
| 2026-08-10 | 寃쎄퀎硫?援먯감 鍮꾧탳???뚮룞???곗씠???ㅼ쨷 寃쎈줈?띉룔뚯씫湲겸넄?곌린 寃利??移??2??異붽? + 沅뚰븳 ?뚭? 援먰썕 釉붾줉 | skills/integration-verify, agents/integration-verifier | ?ㅻ같????媛먯궗?먯꽌 ?뺤씤: ?몃젰 紐낅?瑜???resolver留?醫곹삍?붾땲 媛숈? `buildPeopleContext()`瑜??곕뒗 ?뺤젣 4媛쒕줈 洹몃?濡??고쉶?먭퀬(?붾㈃? 留됲삍吏留?`invoke` 吏곸젒 ?몄텧? ?ル┝), ?쎄린媛 嫄곕??섎뒗 teamKey瑜??곌린媛 ?듦낵?쒖섟?쇰ŉ, 湲됱뿬 寃뚯씠?낆씠 ?뺤콉 湲곕낯媛?INDIVIDUAL)?먯꽌???대젮 ?덉뿀??|


hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git status --short; git diff --stat HEAD; git diff --name-only HEAD; Get-ChildItem '_workspace\\perf-audit' -File | Select-Object -ExpandProperty Name; Get-Content -Raw '_workspace\\perf-audit\\BACKEND_2026-08-12.md'; Get-Content -Raw '_workspace\\perf-audit\\FRONTEND_2026-08-12.md'; Get-Content -Raw '_workspace\\perf-audit\\FIX_STAGE1_BACKEND.md'; Get-Content -Raw '_workspace\\perf-audit\\FIX_STAGE1_FRONTEND.md'; Get-Content -Raw '_workspace\\perf-audit\\FIX_STAGE2_BACKEND.md'; Get-Content -Raw '_workspace\\perf-audit\\FIX_STAGE2_FRONTEND.md'" in C:\CloudJira\moves-workforce
 succeeded in 2658ms:
BACKEND_2026-08-12.md
CODEX_REVIEW_RFC187.md
FIX_STAGE1_BACKEND.md
FIX_STAGE1_FRONTEND.md
FIX_STAGE2_BACKEND.md
FIX_STAGE2_FRONTEND.md
FRONTEND_2026-08-12.md
# 諛깆뿏??src/) 鍮꾪슚?㉱룰퀬鍮꾩슜 濡쒖쭅 媛먯궗 ??2026-08-12

- ????뚯뒪: `develop` @ `f6e521c` 湲곗? ?묒뾽 ?몃━ (`src/` ?꾨줈?뺤뀡 肄붾뱶 ?꾩껜)
- 諛⑸쾿: grep ?꾩닔 + ?뺣룆. ?몄텧遺?뷀뵾?몄텧遺 ?숈떆 ?쎄린濡??몄텧 ?잛닔瑜?**?앹쑝濡?* ?곗텧. DDL怨?荑쇰━瑜??議고빐 ?몃뜳???뺥빀 ?뺤씤. **肄붾뱶 ?섏젙 ?놁쓬**
- 異붿륫 諛곗젣: 肄붾뱶?먯꽌 ?쎌? ?곸닔쨌猷⑦봽 援ъ“쨌DDL ?좎뼵留?洹쇨굅濡??쇱븯?? ?뺤씤 遺덇???寃껋? ?뚮?寃利앫띿뿉 ?④꼈??
> **?ш컖??* ??**P1** ?ъ슜??泥닿컧/鍮꾩슜 ??쨌 **P2** 議곌굔遺쨌以묎컙 쨌 **P3** ?ъ냼

## ?쒖쇅(?щ낫怨?????

| ??ぉ | 洹쇨굅 |
|------|------|
| ?먯썝 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆(Forge SQL ?곸옱 諛곗젣) | ?섎룄??寃곗젙 |
| ?뚰겕濡쒓렇 ?섏쿂 湲곕뒫蹂?寃⑸━(怨듯넻 寃쎈줈 ?섏젙 湲덉?) | ?섎룄??寃곗젙 ??寃⑸━???섏쿂 **?대?**??鍮꾪슚?⑤쭔 吏?곹븳??|
| 由ъ빻???덉궛 200嫄??덈떒 / `applyDefaultEstimate` ?곹븳 / 諛깊븘 job ?곹깭 湲곌퀎 | `_workspace/subscription-audit/AUDIT_2026-08-11.md` 湲곕낫怨?|
| 援щ룆 ?꾨찓???쇰컲 | ??媛먯궗 ?꾨즺 ??**鍮꾩슜 愿???좉퇋 吏?곷쭔** ?ㅼ뿀??|

## 湲고샇

`P` ?쒖꽦 ?꾨줈?앺듃 ??쨌 `I_p` ?꾨줈?앺듃 ?댁뒋 ??쨌 `M_p` ?꾨줈?앺듃 ?몄썝 ??쨌 `w_i` ?댁뒋 i ?뚰겕濡쒓렇 嫄댁닔 쨌
`U` ?깅줉 ?ъ슜????쨌 `W` ??쒕낫???꾩젽 ??쨌 `B` ??諛곗튂 ??쨌 `S` ?붾㈃ 吏꾩엯 ???숈떆 invoke ??

????덉떆??**P=30 쨌 I=5,000(?됯퇏 I_p??67) 쨌 ?곸꽭 ????꾨줈?앺듃 1,000?댁뒋 쨌 U=500** 湲곗?.

## ?뚯씠釉?洹쒕え (DDL쨌肄붾뱶 ?ㅼ륫)

| ?뚯씠釉?| ????洹쒕え | 洹쇨굅 |
|---|---|---|
| `users` | ?깅줉 ?몄썝, 10짼~10쨀 | `MAX_USER_CANDIDATES=1000`(`TeamService.js:65`), `TEAM_SCOPE_WARN_THRESHOLD=2000`(`PrincipalResolver.js:59`) |
| `projectusers` | 誇(?꾨줈?앺듃 횞 ?ъ엯 ?몄썝) | 1??諛곗젙 ?곹븳 `TEAM_ASSIGN_MAX=500` |
| `project` | 10쨔~10짼 | ??|
| `portfolio_project_snapshot` | ?쒖꽦 ?꾨줈?앺듃??1??(+JSON 3而щ읆) | PK = `project_id` |
| `gantt_folder_issue` | ?댁뒋 ?섏뿉 鍮꾨? | PK = `issue_key` |

> **?뚰겕濡쒓렇 SQL ?뚯씠釉붿? 議댁옱?섏? ?딅뒗??** `src/rdb/schema/ddl/worklog.js` ???꾩껜媛 二쇱꽍?닿퀬 `ddl/index.js` ??誘몃벑濡앹씠?? ?뚰겕濡쒓렇???꾨? Jira REST 寃쎌쑀?대?濡?**"?뚰겕濡쒓렇 ?뚯씠釉?N+1" 異뺤? ?대떦 ?놁쓬**?대떎.

---

## ?붿빟

| ?ш컖??| 嫄댁닔 | ??ぉ |
|--------|------|------|
| **P1** | 8 | A-1 ?뚰겕濡쒓렇 異붽?議고쉶 ?섏씠吏 20 쨌 A-2 吏꾩쿃/鍮꾩슜 罹먯떆 臾댄슚 쨌 A-3 ??쒕낫???꾩젽蹂??꾨웾 ?ㅼ틪 쨌 A-4 `checkJobCompletion` O(B짼) 쨌 A-5 ?ы듃?대━??諛곗튂 臾댁쬆遺?쨌 A-6 媛??怨좎젙鍮?횞 invoke ??쨌 A-7 留덉뒪???ъ쟾 ?쒕쾭 罹먯떆 遺??쨌 A-8 `BIN_TO_UUID()` 濡?PK ?몃뜳??臾대젰??|
| **P2** | 17 | B-1 ~ B-17 |
| **P3** | 15 | C-1 ~ C-15 |

**媛??????媛쒖꽑**: `maxResult: 20` ??`100` ?곸닔 ??湲??(A-1) ??`/myWork` 吏꾩엯 Jira ?몄텧 **275 ??65 (??7%)**.
**??踰덉㎏**: `WHERE BIN_TO_UUID(p.project_id) = ?` ??`WHERE p.project_id = UUID_TO_BIN(?)` (A-8) ???꾨줈?앺듃 ?곸꽭 4媛???쓽 ?꾨웾 議곗씤 ?쒓굅.

---

# P1

## A-1. ?뚰겕濡쒓렇 異붽? 議고쉶媛 ?섏씠吏 ?ш린 20?쇰줈 ?쒖감 ??API 湲곕낯媛?100??踰꾨━怨?5諛곕? ??遺瑜몃떎

- **?앹궛??API)**: `C:\CloudJira\moves-workforce\src\api\jira\worklog\WorklogApi.js:4` ??`maxResult = 100` ??湲곕낯媛?- **?뚮퉬????*: `C:\CloudJira\moves-workforce\src\resolver\myWork\MyWorkService.jsx:114-135`
- **?뚮퉬????*: `C:\CloudJira\moves-workforce\src\resolver\utils\worklog\WorklogService.js:209-230`

```js
// MyWorkService.jsx:118-122 / WorklogService.js:213-217 ??臾몄옄 洹몃?濡?媛숈? 蹂듭궗蹂?2踰?while (true) {
    const res = await getWorkLogByIssueKey({
        issueIdOrKey: issueKey,
        startAt: currentStartAt,
        maxResult: 20});          // ??湲곕낯媛?100??援녹씠 20?쇰줈 ??텣??```

寃???묐떟???몃씪???뚰겕濡쒓렇 ?곹븳(`worklog.maxResults`, ?듭긽 20)??**?섏씠吏 ?ш린濡??ㅼ씤???ъ궗??*??寃껋쑝濡?蹂댁씤?? ??媛믪? 臾닿??섎떎 ??`startAt` 留?20?먯꽌 ?쒖옉?섎㈃ ?섍퀬 ?섏씠吏 ?ш린??100?댁뼱???쒕떎.

- **鍮꾩슜**: ?뚰겕濡쒓렇 200嫄??댁뒋 1媛?= `ceil((200??0)/20)` = **Jira 9???쒖감**. `maxResult:100` ?대㈃ `ceil(180/100)` = **2??*.
  `/myWork` 吏꾩엯???댁뒋 200嫄?以?30嫄댁씠 ?뚰겕濡쒓렇 200嫄?珥덇낵 ??寃??1 + **270??*(`pLimit(5)` ??54?쇱슫??. ?섏젙 ??**61??*(12?쇱슫??.
- **?議곌뎔???대? 由ы룷 ?덉뿉 ?덈떎**: `ResourceWorklogFetcher.js:6,37-50` 쨌 `ProjectCalendarService.js:11,17-34` ??`EXTRA_PAGE_SIZE = 100` + **蹂묐젹**?대떎. myWork/怨듯넻 ??寃쎈줈留???諛⑹떇?쇰줈 ?⑥븯??
- **?섏젙 諛⑺뼢**: `maxResult: 100`. ?щ젰???섎㈃ `ProjectCalendarService.fetchExtraWorklogs` ?뺥깭(offset 紐⑸줉 ??`Promise.all`)濡?蹂묐젹?붽퉴吏.

## A-2. 吏꾩쿃?꽷룸퉬????쓽 10遺?KVS 罹먯떆媛 **Jira ?몄텧????嫄대룄 以꾩씠吏 紐삵븳??*

- `C:\CloudJira\moves-workforce\src\resolver\projectProgress\ProjectProgressService.js:49-52` ??`:199-215` (`buildIssuesArray`)
- `C:\CloudJira\moves-workforce\src\resolver\projectCost\ProjectCostService.js:66-90` ??`:206-218` (`buildByIssue`)

```js
// ProjectProgressService.js:49-52 ??罹먯떆 hit ?몃뜲?꾟?if (cached && new Date(cached.expireTime) >= new Date()) {
    const issues = await buildIssuesArray({ projectId, coworkerFieldId, hourRate });   // ??    return assembleResponse(cached.value, issues, thresholdPP);
}
// :200-204 ??媛??鍮꾩떬 ???섏튂瑜?洹몃?濡??ㅼ떆 ?쒕떎
const [holidayResult, worklogs, rawIssues] = await Promise.all([
    getPublicHolidayListService(),
    getResourceProjectWorklogs({ projectId }),                // ?뚰겕濡쒓렇 ?꾨웾
    fetchAllProjectIssues({ projectId, coworkerFieldId }),    // ?댁뒋 ?꾨웾
]);
```

`issues[]`/`byIssue[]` 媛 KVS 媛??곹븳(240KiB) ?뚮Ц??罹먯떆?먯꽌 鍮좎졇 ?덇퀬, 洹멸구 ?ш뎄?깊븯?ㅻ㈃ 寃곌뎅 ?먮낯???ㅼ떆 ?섏튂?댁빞 ?섎뒗 援ъ“?? `ProjectCostService.js:70-71` 二쇱꽍???대? ?몄??섍퀬 ?덈떎 ??*"??寃쎈줈???대? ?뚰겕濡쒓렇쨌?댁뒋 ?꾨웾???ы럹移섑븯誘濡?*.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃, 罹먯떆 hit쨌miss 臾닿? ?숈씪)**:
  `fetchAllProjectIssues` = `ceil(1000/100)` = **寃??10??* + `getResourceProjectWorklogs` = 寃??1??+ `誇 ceil((w_i??0)/100)`.
  ?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋媛 100嫄댁씠硫?**珥?111??Jira ?몄텧**. 罹먯떆媛 ?덉빟?섎뒗 寃껋? **JS 吏묎퀎 CPU肉?*?대떎.
- 吏꾩쿃????낵 鍮꾩슜 ??? 媛숈? ???섏튂瑜?**媛곴컖** ?섑뻾?쒕떎 ?????ъ슜?먭? ????쓣 ?대㈃ 222??(B-14).
- **?섏젙 諛⑺뼢**: (a) 罹먯떆 ??곸쓣 ?ㅼ쭛?붾떎 ??`issues[]`/`byIssue[]` 瑜?蹂꾨룄 KVS ?ㅻ줈 **泥?겕 遺꾪븷 ???*(240KiB ?곹븳 ?뚰뵾), ?먮뒗 (b) `ProjectRaw:{projectId}` 5遺?TTL 怨듭쑀 罹먯떆瑜??먭퀬 吏꾩쿃쨌鍮꾩슜쨌byIssue ?ш뎄?깆씠 **媛숈? ?먯떆 ?섏튂 寃곌낵 ?꾩뿉??怨꾩궛留?* ?쒕떎. (b)媛 ??媛?以묐났(B-14)源뚯? ?④퍡 ?놁븻??

## A-3. ?꾨줈?앺듃 ??쒕낫?????꾩젽 ?섎굹媛 ?댁뒋 ?꾨웾 ?ㅼ틪 1踰? 洹멸쾬??**?숈씪 荑쇰━瑜?2踰?*

- **?뚮퉬??*: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:59-79` ???꾩젽 **1媛쒕떦 `invoke('getChartDataById')` 1??*
- **?앹궛??*: `C:\CloudJira\moves-workforce\src\resolver\projectDashboard\ProjectDashboardService.js:265-276`
- **以묐났???ㅼ껜**: `C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:14` vs `:95`

```js
// IssueApi.js:14  (getAssigneeStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
// IssueApi.js:95  (getIssueParticipantStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
```

**URL??臾몄옄 ?⑥쐞濡?媛숇떎.** ???⑥닔??媛숈? ?곗씠?곕? 媛곸옄 ?꾨웾 ?섏씠吏 猷⑦봽濡?湲곸뼱? 吏묎퀎留??ㅻⅤ寃??쒕떎(?대떦?먮퀎 嫄댁닔 / ?댁뒋蹂?李몄뿬????. `getChartDataset`(`:176-211`)?????섏쓣 蹂꾧컻 `dataType`(`assignee` / `issue`)?쇰줈 遺꾧린?섎?濡????꾩젽??媛숈씠 ?볦씠硫?**媛숈? ?ㅼ틪??2踰?* ?섍컙?? ?뚰겕濡쒓렇 ?꾩젽留?10遺?KVS 罹먯떆媛 ?덇퀬(`WorklogService.js:26-47`) assignee/issue ?꾩젽?먮뒗 罹먯떆媛 **?녿떎**.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃)**: assignee ?꾩젽 1媛?= 寃??**10??*. assignee + issue ???꾩젽 = **20??*(洹몄쨷 10???꾩쟾 以묐났).
  `level`/`role`/`team` ?꾩젽? 媛곴컖 KVS 留덉뒪???ъ쟾 ?ㅼ틪 1~2?뚯뵫(A-7怨?怨깊빐吏꾨떎).
  ?꾩젽 `W` 媛???쒕낫??= resolver invoke `W` ????媛??怨좎젙鍮꾨룄 `W` 諛?A-6).
- **?섏젙 諛⑺뼢**: ??`getAssigneeStats`/`getIssueParticipantStats` 瑜?**1?⑥뒪 ?섏쿂 + 2吏묎퀎**濡??⑹튇??怨듯넻 ?섏쿂 寃⑸━ ?먯튃??留욊쾶 `projectDashboard` ?꾩슜 ?섏쿂 ?좎꽕). ???뚰겕濡쒓렇 ?꾩젽怨??숈씪?섍쾶 `Assignee:{projectId}` 10遺?KVS 罹먯떆瑜?遺숈뿬 ?꾩젽 媛꽷룹옱諛⑸Ц 媛?以묐났???≪닔?쒕떎.

## A-4. ???꾨즺 ?먯젙??諛곗튂留덈떎 ?꾨웾 fan-in ??KVS ?쎄린媛 諛곗튂 ?섏쓽 **?쒓낢**

`C:\CloudJira\moves-workforce\src\queue\consumer.js:240-249` (?몄텧遺 `:93`, `:154`, `:215`)

```js
const checkJobCompletion = async (appJobId, totalBatches) => {
    const batchResults = await Promise.all(
        Array.from({ length: totalBatches }, (_, i) =>
            jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)));
    const doneBatches = batchResults.filter(b => b?.done);
    if (doneBatches.length < totalBatches) return;   // ???遺遺??ш린??議곌린 return
```

**諛곗튂媛 ?섎굹 ?앸궇 ?뚮쭏??* ?꾩껜 諛곗튂 ?곹깭瑜??ㅼ떆 ?쎈뒗?? ?꾩슂?됱? `B`?몃뜲 ?ㅼ젣??`B횞B`.

- **鍮꾩슜**: `KVS_reads = B 횞 (B+1) ??B짼`
  - ?ъ슜???묒? ?낅줈??(`UserService.js:587` `chunk(items, 20)` ??`B = ceil(U/20)`):
    U=1,000 ??B=50 ??**2,550??* 쨌 U=5,000 ??B=250 ??**62,750??* 쨌 U=10,000 ??B=500 ??**250,500??*
  - 援щ룆 諛깊븘 (`SubscriptionBackfill.js` `BATCH_SIZE=50` ??`B = ceil(N/50)`):
    N=2,000 ??B=40 ??**1,640??* 쨌 N=10,000 ??B=200 ??**40,200??*
  - `concurrencyLimit`(3/2) ?뚮Ц???숈떆???щ윭 踰뚯씠 媛숈? fan-in???덈떎. ?ъ떆?꾧? ?쇰㈃ ???섏뼱?쒕떎.
- **?섏젙 諛⑺뼢**: 媛숈? ?뚯씪 怨꾩뿴??`getJobBatchService`(`JobService.js:73-80`)媛 ?대? ?곕뒗 `findByWhere('jobId', appJobId)` **?몃뜳??議고쉶 1??*濡?援먯껜(B>100?대㈃ 而ㅼ꽌 ?섏씠吏??꾩슂). ?먮뒗 ?꾨즺 ?먯젙??留덉?留?諛곗튂?먯꽌留??섑뻾.

## A-5. ?ы듃?대━????諛곗튂媛 **利앸텇 ?놁씠** ???꾨줈?앺듃 ??湲곌컙??留ㅼ씪 ?ы럹移?
- `C:\CloudJira\moves-workforce\src\resolver\portfolioDashboard\PortfolioAggregator.js:276-281`
- ?뚰겕濡쒓렇 珥덇낵遺?猷⑦봽: `C:\CloudJira\moves-workforce\src\resolver\resourceAnalysis\ResourceWorklogFetcher.js:35-50`

```js
const [projectUserRows, worklogs, scheduleRows, rawIssues] = await Promise.all([
    getProjectMemberRows(projectId),
    getResourceProjectWorklogs({ projectId, startDate, endDate, as: 'app' }),  // startDate = ?꾨줈?앺듃 ?쒖옉??    getProjectWorkersScheduleRepository({ projectId, startDate, endDate }),
    fetchAllProjectIssues({ projectId, coworkerFieldId, as: 'app' }),          // ?댁뒋 ?꾨웾
]);
```

"?댁젣 ?댄썑 蹂寃쎈텇" ?먯젙???대뵒?먮룄 ?녿떎. 蹂寃??щ?? 臾닿??섍쾶 紐⑤뱺 ?쒖꽦 ?꾨줈?앺듃瑜?**留ㅼ씪 ??湲곌컙 ?꾨웾 ?ш퀎??*?쒕떎.

- **鍮꾩슜 ??1???ㅽ뻾 = 1??**
  ```
  Jira = 誇_p [ 1(?뚰겕濡쒓렇 寃?? + ceil(I_p/100) + ceil(M_p/100) ]  +  誇_{i : w_i>20} ceil((w_i??0)/100)
  SQL  = 1 + 3P
  ```
  ???P=30, I_p??67, M_p??): 湲곕낯??= 30 횞 (1+2+1) = **120 Jira ?몄텧**, SQL 91.
  臾몄젣??留덉?留???씠?? ?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋留덈떎 理쒖냼 1?뚭? 遺숆퀬 `w_i` ???꾨줈?앺듃媛 ?숈쓣?섎줉 ?⑥“ 利앷??쒕떎 ??  5,000 ?댁뒋 以?10%媛 20嫄?珥덇낵硫?**+500????*, 30%硫?**+1,500????*濡?湲곕낯??쓽 4~12諛곌? ?섏뼱 諛곗튂 鍮꾩슜??吏諛고븳??
  ??鍮꾩슜? **?꾨줈?앺듃 ?섎챸 ?대궡 留ㅼ씪 諛섎났**?쒕떎(2???꾨줈?앺듃硫?媛숈? ?뚰겕濡쒓렇瑜?730???ы럹移?.
- **?섏젙 諛⑺뼢**: ?ㅻ깄?룹뿉 `lastAggregatedAt` ???먭퀬 `updated >= lastAggregatedAt` 移댁슫??寃??1?뚮줈 臾대?寃??꾨줈?앺듃瑜?嫄대꼫?대떎. ?먮뒗 ?뚰겕濡쒓렇 議고쉶 李쎌쓣 利앸텇 李쎌쑝濡?醫곹엳怨??꾩쟻遺꾩? ?ㅻ깄?룹뿉 ?⑹궛 蹂댁〈?쒕떎.

## A-6. 沅뚰븳 媛??怨좎젙鍮꾧? **?붾㈃ 吏꾩엯 invoke ?섎쭔??怨깊빐吏꾨떎**

- `C:\CloudJira\moves-workforce\src\permission\permissionGuard.js:119-150` ??紐⑤뱺 guarded resolver媛 `resolvePrincipal` ?듦낵
- `C:\CloudJira\moves-workforce\src\permission\PrincipalResolver.js:207-215`, `:218`

```js
// :207-215 ??罹먯떆??buildPrincipal ??**?앸궃 ?ㅼ뿉留?* 梨꾩썙吏꾨떎
const cached = cache.get(accountId);
if (cached && cached.expireAt > Date.now()) return cached.value;
const principal = await buildPrincipal(accountId);   // ???숈떆 吏꾩엯 ???꾩썝???ш린濡??ㅼ뼱?⑤떎
cache.set(accountId, { value: principal, expireAt: Date.now() + CACHE_TTL_MS });

// :218 ??鍮꼆dmin(??ㅼ닔)?먭쾶??Jira REST ?뺣났??臾댁“嫄? 洹몃━怨?users SQL(:255)怨?吏곷젹濡??좏뻾?쒕떎
const isAdmin = await isAdministrator();      // asUser GET /rest/api/3/mypermissions
```

30珥?L1 罹먯떆(`:62`)??**?붾㈃ 吏꾩엯 ?ъ씠**?먮쭔 ?ｊ퀬 **吏꾩엯 洹??쒓컙**?먮뒗 ?ｌ? ?딅뒗?? React Query媛 resolver瑜??숈떆??`S`媛??섎㈃ `S`媛??꾨? `buildPrincipal` ???덈떎.

- **鍮꾩슜(罹먯떆 誘몄뒪 1?뚮떦)**: Jira 1(`/mypermissions`) + SQL 1~4 + KVS 2(team index + permission set).
  `/backoffice/users` 吏꾩엯(?숈떆 invoke 6媛? = Jira **6??* + SQL **6??* + KVS **12??*媛 ?쒖닔 媛??怨좎젙鍮?
  洹??붾㈃ ?꾩껜 Jira ?몄텧 7??以?**6??86%)** 媛 媛?쒕떎.
- **?섏젙 諛⑺뼢(?④낵 ????**:
  1. `isAdministrator()` ? `getUserInfoService()` 瑜?`Promise.all` 濡?蹂묐젹?????뺣났 2????1??(?섏? ?낅┰).
  2. 罹먯떆 媛믪쓣 `Promise` 濡???ν빐 in-flight dedup. **??而⑦뀒?대꼫媛 媛덈━硫??ｌ? ?딅뒗??*(誘멸?利?李몄“) ??洹몃옒??1踰덉씠 癒쇱???
  3. admin ?먯젙??蹂꾨룄 吏㏃? TTL濡?遺꾨━??鍮꼆dmin 寃쎈줈??Jira ?뺣났???쒓굅.

## A-7. 留덉뒪???ъ쟾(role/level/skill/permission/status/holiday)???쒕쾭 罹먯떆媛 ?녿떎 ???붾㈃ 吏꾩엯留덈떎 ?꾨웾 ?ㅼ틪

`getTeamIndex()` 留?60珥?紐⑤뱢 TTL 罹먯떆瑜?媛뽯뒗??`backoffice/team/TeamTreeCache.js:95-104`). ?섎㉧吏???몄텧留덈떎 KVS瑜?移쒕떎.

| ?쒕퉬??| ?꾩튂 | 1??KVS 鍮꾩슜 |
|---|---|---|
| `getRoleListService` | `backoffice\role\RoleService.js:36` | `findAll()` 1 |
| `getLevelListService` | `backoffice\level\LevelService.js:86` | `findAll()` 1 |
| `getSkillListService` | `backoffice\skill\SkillService.js:58` | `findAllPaged` **2** (?꾨━??141嫄? |
| `getProjectStatusListService` | `backoffice\projectStatus\ProjectStatusService.js:78` | 1 |
| `getPublicHolidayListService` | `backoffice\publicHoliday\PublicHolidayService.js:34` | 1 |
| `getSettingDataService` | `backoffice\setting\SettingService.js:11` | `findById` 1 |

- **鍮꾩슜 ??`/backoffice/users` 吏꾩엯**: `roleLevelMap()`(`UserService.js:151-171`)??`getUserListWithPaging`쨌`getUserMetaCount`(`:785`) ??寃쎈줈?먯꽌 媛곴컖 ?몄텧?섍퀬, ?꾨줎?멸? `getRoleList`/`getLevelList`/`getPermissionList` 瑜????낅┰ ?몄텧 ??**role 3 + level 3 + permission 3 = KVS 9??*(?꾩슂遺?3??.
- **鍮꾩슜 ??`/resource` ?몃젰?꾪솴 吏꾩엯**: `buildPeopleContext`(`ResourceManagementService.js:59-77`)媛 role 1 + level 1 + skill 2 + settings 1 + rollup 1 = 6?? ?꾨줎??`SkillMultiSelect.jsx:34` 媛 `getSkillList` **2????*(諛⑷툑 ?쒕쾭媛 ?쎌? 寃껉낵 ?숈씪 ?곗씠?? = **9?? 洹몄쨷 3???쒖닔 以묐났**.
- **鍮꾩슜 ???꾨줈?앺듃 ??쒕낫??*: `getLevelChartData`/`getRoleChartData`(`ProjectDashboardService.js:213-231`)媛 ?꾩젽留덈떎 ?몄텧 ??level/role ?꾩젽 `W` 媛쒕㈃ `findAll` **W??*. 媛숈? ?뚯씪 `:114-120` ??`salaryPolicy` ??"猷⑦봽 諛?1??濡?紐낆떆?곸쑝濡??몄씠?ㅽ똿?덈뒗??level/role? ?⑥븯??
- **?섏젙 諛⑺뼢**: `TeamTreeCache` ? ?숉삎??紐⑤뱢 ?ㅼ퐫??60珥?TTL 罹먯떆瑜?role/level/skill/permission/status/holiday/setting???꾩엯. ?꾨? ?蹂寃??ъ쟾?닿퀬 60珥?stale ?섏슜 ?좊?媛 ?대? ?덈떎. ?곌린 寃쎈줈??`loadTeamIndexFresh` 泥섎읆 罹먯떆瑜??고쉶?쒕떎.

## A-8. `WHERE BIN_TO_UUID(p.project_id) = ?` ??PK ?몃뜳?ㅻ? ?⑥닔濡?臾대젰??
`C:\CloudJira\moves-workforce\src\rdb\query\ProjectDashboard.js:16`

```sql
FROM project p LEFT JOIN projectusers pu ON p.project_id = pu.project_id
WHERE BIN_TO_UUID(p.project_id) = ?          -- ???몃뜳??而щ읆???⑥닔瑜??뚯썙 鍮꾧탳
GROUP BY p.project_id
```

?몃뜳??而щ읆???⑥닔濡?媛먯떥硫?PK瑜?紐??꾨떎. **???꾩껜?먯꽌 ????怨노쭔** ???뺥깭?????섎㉧吏 ??荑쇰━??`project_id = UUID_TO_BIN(?)` 濡??몃뜳?ㅻ? ?꾨떎(`grep "WHERE BIN_TO_UUID" src/rdb` ?좎씪 留ㅼ튂, 寃利??꾨즺).

- **?몄텧遺 4怨?* ???꾨줈?앺듃 ?곸꽭??**??쒕낫?쑣룸퉬?㈑룹쭊泥숇룄쨌湲됱뿬 ??吏꾩엯留덈떎** 諛쒖깮?쒕떎:
  `ProjectDashboardController`(?붿빟 移대뱶) 쨌 `ProjectCostService.js:102` 쨌 `ProjectProgressService.js:58` 쨌 `ProjectUsersService.js:171`
- **鍮꾩슜**: ?몄텧 1?뚮떦 `project` ?????ㅼ틪 + `projectusers` ?꾨웾 議곗씤 ???꾪꽣. ?꾨줈?앺듃 100媛?횞 ?됯퇏 ?몄썝 20紐낆씠硫?**1?됱쓣 ?살쑝????2,000?됱쓣 議곗씤**?쒕떎(?뺤긽?대㈃ PK 1??+ ?몃뜳??20??.
- **??*: ??荑쇰━媛 留뚮뱶??`total_salary` 瑜?吏꾩쿃?꾨뒗 **?곗????딅뒗??* ??`ProjectDashboardService.js:37` 二쇱꽍??吏곸젒 *"吏꾩쿃???섏씠吏??total_salary 瑜??곗????딅뒗??= 100% ??퉬"* ?쇨퀬 ?곸뼱 ??붾뜲, 洹?媛믪쓣 留뚮뱾湲??꾪븳 議곗씤+`SUM`+`GROUP BY` ??洹몃?濡??덈떎.
- **?섏젙 諛⑺뼢**: `WHERE p.project_id = UUID_TO_BIN(?)` (?뚮씪誘명꽣쨌諛섑솚 shape 遺덈?). 異붽?濡?吏꾩쿃/鍮꾩슜? `findProjectByIdRepository`(PK 1??lookup)濡?媛덉븘?怨??몄썝 ?섎뒗 ?대? ?섏튂??`memberRows.length` ?먯꽌 痍⑦븳??B-5).

---

# P2

## B-1. `getBulkIssuesByProject` ??`maxResults=5000` ?⑥씪 ?붿껌, `nextPageToken` 猷⑦봽 ?놁쓬

`C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:177-198`

```js
const url = route`/rest/api/3/search/jql?jql=${jql}&maxResults=${maxResults}&fields=worklog`;  // 湲곕낯 5000
const result = await requestJiraJson({ as, url, ... });
return result?.issues || [];      // nextPageToken ???쎌??? 猷⑦봽?섏????딅뒗??```

媛숈? ?뚯씪??`getProjectIssuesByFilter`쨌`getProjectGanttIssues` ??`nextPageToken` do-while 猷⑦봽瑜??꾨뒗????寃쎈줈留??⑤컻?대떎. ?몄텧 1?뚮줈 ??蹂댁씠吏留?**`fields=worklog` 瑜?理쒕? 5,000?댁뒋遺???踰덉뿉** 諛쏅뒗?????댁뒋???몃씪???뚰겕濡쒓렇 20嫄?횞 5,000 = 理쒕? 10留??뷀듃由ш? `memoryMB: 256` ?⑥닔 ?섎굹???ㅼ뼱?ㅺ퀬, ?ы듃?대━??諛곗튂??`PROJECT_CONCURRENCY=2` ?????꾨줈?앺듃遺꾩씠 ?숈떆 ?곸＜?쒕떎. 諛섎?濡?Jira媛 ?섏씠吏瑜??섎씪 二쇰㈃ **珥덇낵遺꾩씠 議곗슜???꾨씫**?섏뼱 怨듭닔媛 怨쇱냼 吏묎퀎?쒕떎(?대뒓 履쎌씠???먰빐).

- **?뚮퉬泥?*: `WorklogService.js:133`, `ResourceWorklogFetcher.js:75`(??吏꾩쿃/鍮꾩슜/?ы듃?대━???꾨?), `ProjectService.js:272`
- **媛숈? 寃고븿??`getProjectIssuesByUser`(`IssueApi.js:206-264`)쨌`getIssuesByWorklogAuthor`(`:272-315`)?먮룄 ?덈떎** ??????`maxResults=5000` ?⑤컻. ?議곌뎔 `ResourceLoadFetcher.fetchInProgressIssuesForAccount:95-125` ??`maxResults=100` + 猷⑦봽瑜??쒕?濡??덈떎.
- **?섏젙 諛⑺뼢**: `maxResults=100` + `nextPageToken` 猷⑦봽(湲곗〈 ?⑦꽩 ?ъ궗??. ?섏씠吏 ?⑥쐞濡??뚰겕濡쒓렇瑜??묒뼱 ?ｌ쑝硫??곸＜ 硫붾え由ш? ?곸닔?붾맂??

## B-2. `getMyIssueList` ???꾨줎?멸? ???곕뒗 `worklog` 瑜??듭㎏濡??ㅼ뼱 蹂대궦??
- **?앹궛??*: `C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:251`(`fields` ??`worklog` ?ы븿) ??`C:\CloudJira\moves-workforce\src\resolver\myWork\MyWorkService.jsx:204-215`(`data: issues` ?먮낯 洹몃?濡?
- **?뚮퉬??*: `static/ui/src/pages/myWork/table/useMyIssueTable.js:18`, `static/ui/src/pages/myPage/hooks/useMyPageIssues.js:30`

???뚮퉬??紐⑤몢 ?뚰겕濡쒓렇瑜??곗? ?딅뒗??myPage??`statusCategory.key` 濡??꾨즺 ?먯젙留???`useMyPageIssues.js:11-14` 二쇱꽍). 洹몃윴??`fields` 媛 `getProjectWorklogService`(?뚰겕濡쒓렇媛 **?꾩슂??* 寃쎈줈)? 怨듭쑀???쒖そ 湲곗??쇰줈 怨좎젙???덈떎.

- **鍮꾩슜**: ?댁뒋 500嫄?횞 (?몃씪???뚰겕濡쒓렇 理쒕? 20嫄?횞 author/avatarUrls 媛앹껜) ??**??MB ?묐떟**. `/myWork` ??湲곕낯 吏꾩엯 ?붾㈃?대떎.
- **?섏젙 諛⑺뼢**: `getProjectIssuesByUser` ??`fields` ?몄옄瑜??닿퀬(湲곕낯媛??꾪뻾 ?좎? = 臾댄쉶洹) `getMyIssueListService` 留?`worklog` 瑜?類 吏묓빀???섍릿??

## B-3. `job_fail` ??TTL???녾퀬 ??젣 寃쎈줈媛 **?숈옉?섏? ?딅뒗??*

- **???*: `C:\CloudJira\moves-workforce\src\queue\consumer.js:54`, `:66` ??`jobFailManager.save(...)` (`job`/`job_batch` ??`saveTTL` 30h ?몃뜲 ?ш린留?`save`)
- **??젣**: `C:\CloudJira\moves-workforce\src\resolver\utils\job\JobService.js:66-68`

```js
// JobService.js:67 ??findByWhere 媛 二쇰뒗 ?됱? {key, value} ??item.id ??undefined
await Promise.all(items.map(item => jobManager.delete(item.id)));
// :93 ??媛숈? ?뚯씪??job_batch ??item.key 瑜??대떎. ???⑥닔媛 媛덈졇??await Promise.all(items.map(item => jobManager.delete(item.key)));
```

???payload(`consumer.js:54-58`)?먮룄 `id` ?꾨뱶媛 ?녿떎. 寃뚮떎媛 ?꾨줎?몃뒗 `removeFailJobList` 瑜??몄텧?섏? ?딅뒗??`static/ui/src/stores/useJobStore.js:73-74` ??`removeJobBatch`/`removeJob` 留?.

- **鍮꾩슜**: ?ㅽ뙣 1嫄?= KVS ?뷀듃由?1媛?**?곴뎄 ?붿〈**. 1,000紐??낅줈?쒖뿉??誘몄〈???대찓??5%硫??뚮떦 50嫄? 二?1???댁쁺?대㈃ ??2,600嫄?
- **?섏젙 諛⑺뼢**: `item.key` 濡??뺤젙 + `saveTTL` ?곸슜.

## B-4. ?ы듃?대━???ㅻ깄?룹쓣 ???꾨줈?앺듃 ?꾨즺 **??* ?쇨큵 ???????꾩븘????洹몃궇 怨꾩궛 ?꾨웾 ?뚯떎

`C:\CloudJira\moves-workforce\src\resolver\portfolioDashboard\PortfolioAggregator.js:506-530`

```js
const settled = await Promise.allSettled(projectRows.map(p => limit(() => aggregateOneProject(...))));
...
for (const s of succeeded) { await upsertSnapshot(s.snapshot); }   // ???꾨? ?앸궃 ?ㅼ뿉??泥?write, 洹멸쾬??1?됱뵫 吏곷젹
```

- **鍮꾩슜/?쒓컙**: `T ??(P / PROJECT_CONCURRENCY) 횞 T_project`. ?꾨줈?앺듃??8~15珥덈㈃ P=30 ??120~225s(?ъ쑀), **P=80 ??320~600s**, P=100 ??500~750s濡?`timeoutSeconds: 600` 寃쎄퀎瑜??섎뒗?? ??꾩븘????upsert 猷⑦봽???꾨떖?섏? 紐삵빐 **?깃났 怨꾩궛遺꾧퉴吏 ?꾨웾 ?먭린**?섍퀬 `finally` ?????댁젣???ㅽ뻾?섏? ?딆븘 `STALE_LOCK_MS`(900s) ?숈븞 ?쎌씠 ?⑤뒗?? 泥댄겕?ъ씤?멸? ?놁뼱 ?ъ떆?꾨룄 泥섏쓬遺?곕떎.
  SQL? ?꾨줈?앺듃??3??硫ㅻ쾭 + ?쇱젙 + upsert) = **3P??*. P=100?대㈃ 300?? upsert 100?뚮뒗 ?꾩쟾 吏곷젹?대씪 RTT 30ms 媛????洹멸쾬留?3珥?
- **?섏젙 諛⑺뼢**: `aggregateOneProject` ?깃났 利됱떆 `upsertSnapshot` ?쇰줈 遺遺?寃곌낵瑜??뺤젙?쒕떎. 硫ㅻ쾭쨌?쇱젙 議고쉶??`project_id IN (...)` ?ㅺ굔 踰꾩쟾?쇰줈 2?뚮줈 異뺤냼?섍퀬, upsert??`PortfolioSnapshotQuery.UPSERT` 媛 ?대? `ON DUPLICATE KEY UPDATE` ?대?濡??ㅽ뻾 `VALUES` 濡?臾띕뒗??

## B-5. 吏꾩쿃?꽷룸퉬?⑹씠 ?곗????딅뒗 吏묎퀎瑜??꾪빐 臾닿굅???붿빟 荑쇰━瑜?遺瑜몃떎

- `C:\CloudJira\moves-workforce\src\resolver\projectCost\ProjectCostService.js:100-106`
- `C:\CloudJira\moves-workforce\src\resolver\projectProgress\ProjectProgressService.js:56-61`

```js
const [holidayResult, summary, memberRows, worklogs, rawIssues] = await Promise.all([
    ...,
    getSummaryDataService({ project_id: projectId }),   // A-8??鍮?sargable ?꾨웾 議곗씤
    getProjectMemberRows(projectId),                     // projectusers ??users ??????媛숈? ?뚯씠釉?2踰덉㎏ 議고쉶
    ...
]);
```

`summary` ?먯꽌 ?ㅼ젣濡??곕뒗 媛믪? `start_date`/`end_date`/`total_member_count`(`:112-114`)肉먯씠怨?`total_salary` ??`members` 濡??ш퀎?고빐 踰꾨┛??`:136`). ?몄썝 ?섎뒗 `memberRows.length` 濡??섏삤怨??좎쭨??`ProjectQuery.FIND_BY_ID`(PK, 議곗씤 ?놁쓬)濡??섏삩??

- **鍮꾩슜**: 鍮꾩슜 ??罹먯떆 miss 1?뚮떦 `projectusers` 瑜?2踰??쎄퀬 洹몄쨷 1踰덉? ?꾨웾 ?ㅼ틪. 吏꾩쿃????룄 ?숈씪.
- **?섏젙 諛⑺뼢**: `getSummaryDataService` ??`findProjectByIdRepository` 濡?援먯껜, ?몄썝 ?섎뒗 `memberRows` ?먯꽌 痍⑦븳??

## B-6. `users` ???꾪꽣쨌?뺣젹 而щ읆???몃뜳?ㅺ? ?섎굹???녿떎

DDL: `C:\CloudJira\moves-workforce\src\rdb\schema\ddl\users.sql.js:1-26` ??`PRIMARY KEY (account_id)` 媛 **?좎씪???몃뜳??*. `ALTER_USERS_ADD_TEAM_KEY` 二쇱꽍??*"?몃뜳?ㅻ뒗 ?먯? ?딅뒗????users ???뚭퇋紐?* 濡??섎룄瑜?諛앺엺?? `migrate.js` ?꾩껜??`CREATE INDEX`/`ADD INDEX` 媛 ?녿떎(寃利??꾨즺).

| ?몃뜳???녿뒗 而щ읆 | ?ъ슜泥?|
|---|---|
| `team_key` (WHERE/IN/IS NULL/GROUP BY) | `TeamRepository.js:116-127, 139-152, 158-170, 180-192`, `UserQuery.TEAM_COUNT`쨌`TEAM_INHERIT_COUNT`쨌`CLEAR_TEAM_BY_TEAM_KEY`, `UserRepository.js:16-19` |
| `role_key`/`level_key`/`permission_key` | `UserRepository.js:248-305`, `:168-213`, `ROLE/LEVEL/PERMISSION_COUNT` |
| `created_at` (ORDER BY) | `UserRepository.js:198, 234`, `TeamRepository.js:165, 186, 249` |

- **鍮꾩슜**: ???꾨?媛 ?????ㅼ틪 + filesort. U=1,000?대㈃ 媛쒕퀎濡쒕뒗 媛먮떦?섎굹 **???붾㈃???щ윭 踰?移쒕떎** ??`getProjectTeamsService`(`ProjectTeamService.js:76-98`)???대떦 ? ??1??吏꾩엯??`countUsersByTeam()`(?꾨웾 GROUP BY) + `findUsersByTeamKeys()`(?꾨웾 ?ㅼ틪) + `findUserRowsByAccountIds` 2?뚮? 諛쒖깮?쒖폒 **users ?꾨웾 ?ㅼ틪 2??*媛 ?쒕떎.
- **?섏젙 諛⑺뼢**: `team_key` ???몃뜳??1媛?異붽?(硫깅벑 `ALTER`, v018). role/level/permission ? 諛깆삤?쇱뒪 ?꾩슜?대씪 ?꾩닚??

## B-7. ????濡쒕뱶 ???깅떒 沅뚰븳 ?꾪꽣 ????μ씠 10紐낆쓣 蹂대젮怨??꾩궗瑜??쎈뒗??
- `C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:437-441` ??`FIND_ALL_ALLOCATIONS`(???꾨줈?앺듃 횞 ??諛곗젙 ?몄썝, WHERE ?놁쓬) ??`allRows.filter(r => visible.has(r.account_id))`
- `:391-396` ??`findUsersRepository({})` ?꾨웾 ??`.filter(id => !visible || visible.has(id))`

- **鍮꾩슜**: TEAM_ONLY/LEADING ?ㅼ퐫???ъ슜?먭? ?먭린 ? 10紐낅쭔 蹂?沅뚰븳?몃뜲 `projectusers` 誇(?꾨줈?앺듃횞?몄썝) ?꾨웾 + `users` ?꾨웾???쒕쾭 硫붾え由щ줈 ?뚯뼱?щ┛?? ?꾨줈?앺듃 100 횞 ?몄썝 20?대㈃ **2,000?됱쓣 ?쎌뼱 10?됱쓣 ?④릿??*.
- `findUsersRepository` ??`whereIn('account_id', users)` 瑜??대? 吏?먰븯怨?`principal.leadingScopeAccountIds` 媛 洹?紐⑸줉?대떎.
- **?섏젙 諛⑺뼢**: `visible` ??`null` ???꾨땺 ??accountId 吏묓빀??`IN` ?덈줈 諛???ｋ뒗?? **??`QueryBuilder.whereIn([])` ? 議곌굔???듭㎏濡?踰꾨젮 fail-open ?대?濡?鍮?諛곗뿴 媛???꾩닔** ??`TeamRepository.js:1-13` 二쇱꽍??C3 洹쒖빟??洹몃?濡??곕? 寃?

## B-8. `getResourceProfile` ?????щ엺 ?쒕줈?대? ?대젮怨??꾩궗 而⑦뀓?ㅽ듃瑜??듭㎏濡??ъ“由?
`C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:285-295`

```js
const [ctx, inProgressIssues, historyRes, roleListRes, statusRes, assignedMap, projectCountMap] = await Promise.all([
    buildPeopleContext(),   // ???ъ슜??SQL + Jira bulk + KVS 6醫?+ ?ㅽ궗 留ㅽ븨 SQL
    ...
]);
const person = ctx.people.find((p) => p.accountId === accountId) ?? null;   // 1紐낅쭔 ?대떎
```

`buildPeopleContext`(`:53-77`)??`SELECT * FROM users ORDER BY created_at DESC`(WHERE ?놁쓬) ?꾨웾 + `SELECT_SKILLS_BY_ACCOUNTS(N)` + `userMap(userRows)`(Jira bulk `ceil(N/100)`??瑜??섑뻾?쒕떎.

- **鍮꾩슜(U=1,000)**: ?쒕줈??1?뚮떦 users ?꾨웾 ?ㅼ틪(1,000?? `salary` ?ы븿 ??而щ읆) + user_skills `IN`(1,000 ?뚮젅?댁뒪??? + **Jira bulk 10??*. ?ㅼ궗??1??????퉬??999/1,000.
- 媛숈? ?붿껌?먯꽌 `role` ??**2踰?* ?ㅼ틪?쒕떎: `buildPeopleContext` ?대?(`:70`) + `:289` ??`getRoleListService()`. `ctx.people[i].roleName` ???대? ?댁꽍???덈떎.
- **?섏젙 諛⑺뼢**: ?꾨줈???꾩슜 寃쎈웾 遺꾧린(`findUsersRepository({users:[accountId]})` + `SELECT_SKILL_IDS_BY_ACCOUNT`), `skillMap`(KVS)留?怨듭쑀. 以묐났 `getRoleListService()` ?쒓굅.

## B-9. 寃쎈웾 荑쇰━媛 ?덈뒗??臾닿굅??荑쇰━濡?accountId留?戮묐뒗??
`C:\CloudJira\moves-workforce\src\resolver\workAssignment\WorkAssignmentService.js:81-84`

```js
const { rows = [] } = await executeQuery(ProjectUsersQuery.FIND_BY_PROJECT_ID, [projectId]);
return [...new Set((rows ?? []).map((r) => r.account_id).filter(Boolean))];
```

`FIND_BY_PROJECT_ID`(`ProjectUsersQuery.js:36-52`)??`LEFT JOIN users` + `COUNT(1) OVER()` ?덈룄???⑥닔 + 10媛?而щ읆??諛섑솚?쒕떎. ?꾩슂??嫄?`account_id` ?섎굹肉먯씠怨?**?뺥솗??洹??⑸룄??`FIND_ACCOUNT_IDS_BY_PROJECT`(`:129-133`)媛 ?대? 議댁옱**?섎ŉ `ProjectTeamService.js:59` ??洹멸구 ?대떎.

- **鍮꾩슜**: `getWorkAssignmentBoard`쨌`getWorkAssignmentPool` ??resolver媛 吏꾩엯留덈떎 遺덊븘?뷀븳 users 議곗씤 + ?덈룄???⑥닔. ?몄썝 50紐낆씠硫?50??횞 10而щ읆 + users 50??議곗씤 ??50??횞 1而щ읆?쇰줈 異뺤냼 媛??
- **?섏젙 諛⑺뼢**: `FIND_ACCOUNT_IDS_BY_PROJECT` 濡?援먯껜.

## B-10. `onIssueCreated` ??援щ룆怨?臾닿????ъ씠?????댁뒋 ?앹꽦留덈떎 ?쇱씠?좎뒪 KVS 議고쉶媛 癒쇱? ?덈떎

`C:\CloudJira\moves-workforce\src\trigger\onIssueCreated.js:37-42`

```js
if (!(await isProjectSubscriptionReady())) return;   // 1) SQL (肄쒕뱶 isolate ??
if (await isLicenseBlocked()) return;                // 2) KVS get (+TTL 留뚮즺 ??License API)
const sub = await findSubscriptionBySourceRepository('SPACE', evt.projectId);  // 3) SQL
if (!sub) return;                                    // ???遺遺꾩쓽 ?댁뒋???ш린????```

援щ룆??**?섎굹???녿뒗 ?ㅽ럹?댁뒪???댁뒋**?щ룄 2)源뚯? 諛섎뱶???ㅽ뻾?쒕떎.

- **鍮꾩슜(誘몃ℓ移??댁뒋 1嫄대떦)**: KVS 1 + SQL 1~2(肄쒕뱶 isolate硫?`information_schema` 1??異붽? ??`TableReadiness.js:36-53` ??`readyTables` ??isolate ?섎챸 罹먯떆).
  ?댁뒋 300嫄?????KVS 300 + SQL 300~600???? 2,000嫄????ъ씠?몃㈃ KVS 2,000 + SQL 理쒕? 4,000????
  ?쇱씠?좎뒪 API ?먯껜??KVS 罹먯떆 TTL(1h)濡???4???쇱씠??**UNAVAILABLE ??鍮좎?硫?TTL 60s????,440????+ 留ㅻ쾲 KVS write** 濡??대떎.
- **?섏젙 諛⑺뼢**: ?쒖꽌瑜?`findSubscriptionBySource ??isLicenseBlocked` 濡?諛붽씔???쇱씠?좎뒪???ㅼ젣 write 吏곸쟾?먮쭔 ?뺤씤?대룄 寃쎄퀎媛 媛숇떎).

## B-11. 由ъ빻??watermark ?뺤껜 ??留ㅼ떆媛??꾨웾 ?ъ뒪罹붿쑝濡??섎룎?꾧컙??
- `C:\CloudJira\moves-workforce\src\resolver\projectSubscription\SubscriptionSweeper.js:206`, `:220`
- `C:\CloudJira\moves-workforce\src\resolver\projectSubscription\SubscriptionJqlBuilder.js:211-214`

```js
const completed = scan.completed && apply.failed === 0;
...  watermark: completed ? startedAt : null,
...
if (mode === 'RECONCILE' && sub.watermark) parts.push(`updated >= "${lower}"`);   // watermark ?놁쑝硫??섑븳 ?놁쓬
```

?뺤긽 ?꾩＜ 寃쎈줈??利앸텇 李쎌씠???쒓컙??1?섏씠吏濡??몃떎(**?듦낵**). 洹몃윭??APPLY媛 1嫄댁씠?쇰룄 ?ㅽ뙣?섎㈃(???꾨뱶 沅뚰븳/吏??429) `completed=false` ??watermark 誘몄쟾吏????ㅼ쓬 二쇨린 JQL?먯꽌 **利앸텇 ?섑븳???щ씪??baseline ?댄썑 ?꾨웾???ㅼ떆 ?묐뒗??**

- **鍮꾩슜**: ?뺤껜 援щ룆 1嫄대떦 `min(??곸닔, MAX_SCAN_ISSUES=2000)/100` = 理쒕? 20 寃???쒓컙 ??**480 寃????援щ룆**. `SWEEP_BATCH_SIZE=20` 援щ룆???④퍡 ?뺤껜?섎㈃ ?섎（ 理쒕? 9,600 寃?됱씠 ?몄엯 0嫄댁쑝濡??뚮え?섍퀬, `MAX_REQUESTS=600` ?덉궛???뺤껜 援щ룆???낆떇???뺤긽 援щ룆??諛由곕떎.
- **?섏젙 諛⑺뼢**: apply ?ㅽ뙣媛 **遺遺?*?대㈃ ?깃났遺?湲곗??쇰줈 watermark瑜??꾩쭊?쒗궎嫄곕굹(?ㅽ뙣遺꾩? `IS EMPTY` 濡??ㅼ떆 ?≫엳誘濡??덉쟾), ?곗냽 ?ㅽ뙣 援щ룆??諛깆삤?꾨줈 ?좎떆 ?쒖쇅?쒕떎.

## B-12. `getPublicHolidayListService` 媛 100嫄??섎뱶罹???鍮꾩슜쨌吏꾩쿃???レ옄媛 議곗슜????댁쭊??
`C:\CloudJira\moves-workforce\src\resolver\backoffice\publicHoliday\PublicHolidayService.js:34`

```js
const rows = (await queryManager.findByField('by-date')).results;   // CustomEntityManager.js:47 ??limit 湲곕낯 100
```

`findAll()` 100嫄??섎뱶罹↔낵 **媛숈? ?⑥젙??`findByField` ?먮룄 ?⑥븘 ?덈떎.** ?쒓뎅 怨듯쑕????15~19嫄?+ ?泥닿났?댁씪/?щ궡 ?대Т瑜??ｌ쑝硫?**5~6?꾩튂**?먯꽌 ?곹븳 ?꾨떖.

- **?곹뼢 寃쎈줈**: `ProjectCostService.js:101`, `ProjectProgressService.js:57`쨌`:201`, `IssueAnalysisService.js:39`쨌`:186`, `ResourceAnalysisService.js`, `PortfolioAggregator.js:493` ???꾨? ?곸뾽??MD ?곗떇???낅젰?대떎.
- **?섏젙 諛⑺뼢**: `findAllPaged('by-date', 100, N)`.

## B-13. `findUserByAccountIdService` ???낅┰ ?몄텧 4~5??吏곷젹

`C:\CloudJira\moves-workforce\src\resolver\backoffice\user\UserService.js:281-322`

```
findByAccountId(SQL) ??getBulkJiraUsersApi(Jira) ??getTeamIndex(KVS) ??resolveSalaryPolicySafe(KVS) ??getLevelListService(KVS)
```

??3媛쒕뒗 ?쒕줈 ?낅┰?몃뜲 `await` 濡?以꾩꽭?뚯졇 ?덈떎.

- **鍮꾩슜**: ?ъ슜???몄쭛 紐⑤떖 ?닿린 = ?뺣났 4~5??媛???ы븿 6??. `Promise.all` 濡?臾띠쑝硫?2??
- **?섏젙 諛⑺뼢**: 1??SQL ?댄썑 ?섎㉧吏瑜?`Promise.all`.

## B-14. `getCurrentUserApi()` 濡?Jira `/myself` 瑜?遺瑜대뒗??`context.accountId` 媛 ?대? ?덈떎

`C:\CloudJira\moves-workforce\src\resolver\backoffice\user\UserService.js:393`, `:482`, `:561` 쨌
`C:\CloudJira\moves-workforce\src\resolver\backoffice\team\TeamService.js:636`, `:647` 쨌
`C:\CloudJira\moves-workforce\src\resolver\project\ProjectService.js:245`

`PrincipalResolver.js` ?ㅻ뜑 二쇱꽍???ㅼ뒪濡?*"accountId ??context ?먯꽌 痍⑤뱷(Jira /myself 遺덊븘??"* ?쇨퀬 ?곸뼱 ?볦븯?붾뜲, ?곌린 ?쒕퉬??6怨녹? `created_id`/`updated_id` ?섎굹 ?살쑝?ㅺ퀬 Jira瑜???踰???移쒕떎.

- **鍮꾩슜**: `addUser`쨌`updateUser`쨌`uploadUsersExcelWithQueue`쨌`assignUsersToTeam`쨌`unassignUsersFromTeam`쨌`updateProjectPartial` **媛?1??遺덊븘?뷀븳 Jira ?뺣났**(?꾩냽 ?곌린? 吏곷젹).
- **?섏젙 諛⑺뼢**: 而⑦듃濡ㅻ윭媛 `context.accountId`(?먮뒗 `principal.accountId`)瑜??쒕퉬?ㅼ뿉 ?섍릿??

## B-15. ?곹깭 ??젣/?뺣젹??SQL쨌KVS N+1 ?쒖감 ???ш린??B-14媛 怨깊빐吏꾨떎

`C:\CloudJira\moves-workforce\src\resolver\backoffice\projectStatus\ProjectStatusService.js:166-217`, `:275-295`, `:327-356`

```js
for (const project of projectList) { await updateProjectPartialService(data); }   // :168
for (const link of linksToDelete)  { await linkManager.delete(link.key); }        // :191
```

`saveStatusOrder`/`saveStatusLink` ???꾨웾 ??젣 ???꾨웾 ??μ쓣 ?쒖감 猷⑦봽濡??쒕떎.

- **鍮꾩슜**: ?곹깭???꾨줈?앺듃 200媛쒓? 臾쇰젮 ?덉쑝硫?UPDATE **200???쒖감**. 洹몃━怨?`updateProjectPartialService` ??B-14??`/myself` 瑜?留ㅻ쾲 遺瑜대?濡?**Jira 200??*源뚯? 遺숇뒗??
- ?鍮덈룄 寃쎈줈(議곗쭅 ?명똿 蹂寃???P2. **?섏젙 諛⑺뼢**: `WHERE project_status_key = ?` ?⑥씪 UPDATE濡?移섑솚.

## B-16. `/resource` ?붾㈃?????ъ슜??紐낅?瑜?**??resolver媛 媛곴컖** 議곕┰?쒕떎

`C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:206`(`buildPeopleContext`), `:390-401`(`findUsersRepository({})` ?ъ“??, `:432-459`(`userMap` ?ы샇異?

?꾨줎?몃뒗 吏꾩엯 ??`getResourceOverview` 쨌 `getResourceLoadSummary` 쨌 `getResourceAllocationGraph` 瑜?媛곴컖 invoke?쒕떎(`useResourceOverview.js:20`, `useResourceLoadSummary.js:23`, `allocation/useResourceAllocation.js:21`).

- **鍮꾩슜(U=500)**: ?ъ슜???꾨웾 SQL **3??* + Jira user bulk **理쒕? 10??*(overview 5 + allocation 5) + 媛??怨좎젙鍮?횞3.
- **?섏젙 諛⑺뼢**: ??resolver瑜???吏꾩엯 ?⑥쐞濡??⑹튂嫄곕굹 `buildPeopleContext` 寃곌낵瑜?60珥?TTL KVS 罹먯떆濡?怨듭쑀?쒕떎.

## B-17. 吏꾩쿃?꽷룸퉬?㈑룻룷?명뤃由ъ삤媛 **媛숈? ?먯떆 ?곗씠?곕? 媛곸옄** ?섏튂?쒕떎

`ProjectProgressService.js:56-61` 쨌 `ProjectCostService.js:100-106` 쨌 `PortfolioAggregator.js:276-281` ??紐⑤몢 `fetchAllProjectIssues` + `getResourceProjectWorklogs` 瑜?媛숈? ?꾨줈?앺듃??????낅┰ ?섑뻾?쒕떎.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃)**: 吏꾩쿃????111??+ 鍮꾩슜 ??111??+ ?쇨컙 諛곗튂 111??= **?섎（ 333???댁긽**, ?꾨? 媛숈? ?곗씠??
- **?섏젙 諛⑺뼢**: A-2??(b) ??`ProjectRaw:{projectId}` 怨듭쑀 罹먯떆. ???뚮퉬?먭? ??踰덉쓽 ?섏튂瑜??섎닠 ?대떎.

---

# P3

| # | ?꾩튂 | ?댁슜 | ?섏젙 諛⑺뼢 |
|---|------|------|-----------|
| C-1 | `src\resolver\myWork\MyWorkService.jsx:18-22` | role/level/status瑜?**id留덈떎 媛쒕퀎 `findById`**(KVS N+1, ?숈떆???쒗븳 ?놁쓬, 3以?`Promise.all` 以묒꺽). ?꾨줈?앺듃 30媛쑣톎istinct 16醫낆씠硫?KVS get 16????紐⑸줉 ?쒕퉬??3?뚮㈃ 異⑸텇 | `getRoleListService`+`getLevelListService`+`getProjectStatusListService` 濡?援먯껜(`UserService.roleLevelMap()` 怨?媛숈? ?⑦꽩) |
| C-2 | `manifest.yml:113-115` + `src\rdb\schema\migrate.js:55-63` | `init-db` ?ㅼ?以꾩씠 **hour**. 留ㅼ떆媛?留덉씠洹몃젅?댁뀡 ?대젰 SQL 2??+ ?곸슜遺??놁뼱??`list()` ?꾨웾 濡쒓렇 17以?= 48 SQL/??+ 408以??? `onInstall` ???대? ?ㅼ튂쨌?낃렇?덉씠????`runMigration` ???덈떎 | `interval: day` + `executed` ?덉쓣 ?뚮쭔 濡쒓렇 |
| C-3 | `src\api\jira\field\FieldApi.js:51-63` | `getCoworkerFieldIdApi` 媛 媛숈? ?뚯씪 `findAppFieldIdByName`(`:12,21-37`)??`fieldIdCache` 瑜??곗? ?딄퀬 留ㅻ쾲 `/rest/api/3/field` ?꾨웾??諛쏅뒗?? 寃뚮떎媛 ?좎씪 ?몄텧遺(`PortfolioAggregator.js:494`)媛 ?섍릿 媛믪? `getProjectIssuesByFilter` ??fields 議곕┰??**?곗씠吏 ?딄퀬**(`IssueApi.js:355-358` 二쇱꽍) `normalizeIssue` ???몄옄瑜???諛쏅뒗??= 諛곗튂??1???ы몴(閭사ⅷ) ?몄텧(????ъ씠???묐떟 ?섎갚 KB) | ?몄텧 ?쒓굅, ?먮뒗 `findAppFieldIdByName` 寃쎈줈濡??듭씪 |
| C-4 | `src\api\jira\user\UserApi.js:54-73` | `getBulkJiraUsersApi` ??100媛?泥?겕 猷⑦봽媛 **吏곷젹**. U=1,000?대㈃ Jira 10???쒖감. `TeamService.fetchCandidateProfiles:326-353` ? 媛숈? ?곹솴??`pLimit(4)` 濡?蹂묐젹?뷀빐 ???| 泥?겕 猷⑦봽瑜?`pLimit` 蹂묐젹濡?|
| C-5 | `src\utils\license\LicenseGuard.js:112-134` | `ResponseWrapper.js:7` ??紐⑤뱺 resolver瑜?媛먯떥誘濡?production?먯꽌 `context.license.active` 遺????**invoke 1嫄대떦 KVS get 1??*. `PrincipalResolver` ??媛숈? 臾몄젣瑜?30珥?L1濡?留됱븯?붾뜲 ?ш린??L1???녿떎 | KVS TTL??誘몃윭留곹븯??紐⑤뱢 ?ㅼ퐫??L1 異붽? |
| C-6 | `src\resolver\backoffice\role\RoleService.js:36` 쨌 `level\LevelService.js:86` | 紐⑸줉? `findAll()`(100罹??몃뜲 媛숈? ?꾨찓??quick-add??`CatalogBulkService.js:32` ?먯꽌 `findAllPaged('name',100,5000)` 濡??꾨웾??蹂몃떎. **skill留?怨좎퀜議뚭퀬**(`SkillService.js:58`) role/level? ?⑥븯????"紐⑸줉???녿뒗????μ? 嫄곕?"??媛숈? 援ъ“ | ?곹븳 ?곸닔瑜?怨듭쑀?섎뒗 `findAllPaged` 濡??듭씪 |
| C-7 | `src\seed\SeedData.js:160`, `:206` | ?꾨━???대쫫 異⑸룎 ?먯젙쨌`migratePermissionSets` 媛 `findAll()`(100罹?. 沅뚰븳 ?명듃 100媛?珥덇낵 ??珥덇낵遺꾩씠 **議곗슜??留덉씠洹몃젅?댁뀡?먯꽌 ?꾨씫**(移댄깉濡쒓렇 ??蹂댁땐쨌怨좎븘 ?뺣━쨌projectScope 蹂댁젙 誘몄쟻?? | `findAllPaged` |
| C-8 | `src\resolver\projectDashboard\ProjectDashboardService.js:559-568` | `saveCharts` 媛 李⑦듃留덈떎 `await insertChart` ?쒖감. 媛숈? ?뚯씪 怨꾩뿴 `bulkUpdateLayoutsRepository`(`ProjectDashboardRepository.js:89-113`)???대? ?ㅽ뻾 `VALUES`+`ON DUPLICATE KEY` ?⑦꽩??媛뽮퀬 ?덈떎 | 洹??⑦꽩 ?ъ궗?⑺빐 INSERT 1?뚮줈 |
| C-9 | `src\resolver\backoffice\user\UserService.js:778-785` | 4媛?移댁슫??荑쇰━瑜?`Promise.all` 濡??뚮┛ ??`await roleLevelMap()` ???곕줈 湲곕떎由곕떎(?섏〈 ?놁쓬) | 媛숈? `Promise.all` ???⑸쪟 |
| C-10 | `src\rdb\query\QueryBuilder.js:3` (`_select = ['*']`) | `.select()` ?놁씠 `.from('users')` 留?遺瑜?怨?8怨?`UserRepository.js:23-33, 38-49, 61-89, 168-213`, `TeamRepository.js:69-76, 162-170, 183-192, 212-215`). `role_key`/`team_key`/`account_id` 留??곕뒗 ?뚮퉬?먭? ?遺遺꾩씤??`salary` 源뚯? ?꾩넚?쒕떎. `ProjectUsersQuery.FIND_BY_PROJECT_ID` ??湲됱뿬 ?꾩텧??留됱쑝??而щ읆??紐낆떆?덈뒗??`:28-35` 二쇱꽍) users 吏곸젒 議고쉶 寃쎈줈??洹?洹쒖쑉???녿떎. **?깅뒫蹂대떎 寃뚯씠??寃ш퀬??愿??* | ?뚮퉬 ?꾨뱶留?`.select(...)` 紐낆떆 |
| C-11 | `src\queue\consumer.js:45-70` | ?ㅽ뙣 ??ぉ留덈떎 `await jobFailManager.save(...)` ?쒖감. 諛곗튂 20嫄??꾨웾 ?ㅽ뙣 ??KVS write 20??吏곷젹 | ?ㅽ뙣 紐⑸줉??紐⑥븘 `Promise.all` |
| C-12 | `src\resolver\utils\worklog\WorklogService.js:189-205` | `normalizeWorklog` 媛 ?뚰겕濡쒓렇 ?뷀듃由щ쭏??`issue:issue`, `worklog:log` **?먮낯 媛앹껜 ?꾩껜**瑜?遺숈씤?? ???뚮퉬??3媛?aggregate ?⑥닔)媛 ?꾨? 踰꾨젮 ?ㅽ빐???놁쑝?? ??諛곗뿴???묐떟?쇰줈 ?섍????뚮퉬?먭? ?앷린硫?O(n짼) 吏곷젹?붽? ?쒕떎 | 吏묎퀎 ?꾨뱶留??④릿??`ResourceWorklogFetcher.js:15-21` 媛 ?대? 洹??뺥깭) |
| C-13 | `UserService.js:446-448` 쨌 `UserRepository.js:66-78`쨌`:189-201` 쨌 `GanttFolderService.js:168쨌170`, `:258-260` | ?쒕줈 ?낅┰??荑쇰━??吏곷젹 await(??젣 cascade 3嫄? count?봪ist, ?대뜑 議고쉶 2~3?곗냽). 媛??뺣났 1~2???덇컧 | `Promise.all`. ??`users` ??젣????3嫄??댄썑?ъ빞 ?쒕떎 |
| C-14 | `src\resolver\storage\StorageQuery.js:37` | `SELECT BIN_TO_UUID(project_id), COUNT(*) FROM project GROUP BY project_id` ??`project_id` 媛 PK??`cnt` ??**?몄젣??1**. ?????ㅼ틪 + 洹몃９?묒씠 臾댁쓽誘??섎㉧吏 5媛??ㅽ럺? ?뺣떦???ㅽ뻾 吏묎퀎) | ?⑥닚 `COUNT(*)` ?먮뒗 ?쒓굅 |
| C-15 | `src\rdb\query\CommonQuery.js:11-13`, `UserRepository.js:61-89`쨌`168-213` | deep `OFFSET` ?섏씠吏? ??洹쒕え(users ??0쨀)?먯꽌??臾몄젣 ?꾨땲?? 而ㅼ꽌 諛⑹떇(`getProjectUserWithScrollRepository:165-202`)???대? 援ы쁽???덉뼱 **愿濡媛 媛덈젮 ?덈떎** | 洹쒕え 利앷? ??而ㅼ꽌濡??듭씪 |

---

# ?듦낵 (?뺤씤?덇퀬 臾몄젣 ?놁쓬)

> 移⑤У??"誘멸?利??쇰줈 ?ㅻ룆?섏? ?딅룄濡?紐낆떆?쒕떎.

## ?몃뜳???뺥빀 (DDL ?ㅼ륫 ?議?

`projectusers`(`INDEX(project_id, account_id)` + `INDEX(account_id)`) 쨌 `project_team`(PK 蹂듯빀 + `INDEX(team_key)`) 쨌 `user_skills`/`project_skills`(PK 蹂듯빀 + `INDEX(skill_id)`) 쨌 `gantt_folder`(`INDEX(project_id)`, `INDEX(project_id, parent_folder_id)`) 쨌 `gantt_folder_issue`(PK `issue_key` + `INDEX(project_id)`, `INDEX(folder_id)`) 쨌 `gantt_folder_link`(PK 3而щ읆 + 3蹂댁“) 쨌 `portfolio_project_snapshot`(PK `project_id` + `INDEX(risk_score)` ??`SELECT_ALL ORDER BY risk_score DESC` ? ?뺥솗???쇱튂) 쨌 `project_dashboard`(`INDEX(project_id)`) 쨌 `user_schedule`(`INDEX(account_id)` + `UNIQUE(account_id, schedule_start_date, schedule_type)` ??`FIND_BY_PROJECT_ID` ?좎쭨 踰붿쐞源뚯? 而ㅻ쾭)
??**?꾨? WHERE/JOIN/ORDER BY 而щ읆怨??뺥빀.** ?덉쇅??`users`(B-6)肉먯씠??

## ?섎㉧吏 異?
| 異?| ?뺤씤 ?댁슜 | ?먯젙 |
|----|----------|------|
| **DB N+1 (?ㅺ굔 議고쉶)** | `SkillMappingQuery.SELECT_SKILLS_BY_ACCOUNTS/BY_PROJECTS`, `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNTS`쨌`FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS`쨌`FIND_MEMBER_TEAMS_BY_PROJECTS`, `ProjectTeamQuery.FIND_PROJECT_IDS_BY_TEAM_KEYS`, `UserQuery.UPDATE_TEAM_BY_ACCOUNTS` ???꾨? `IN` ???⑺넗由щ줈 1??議곕┰. ?몃떦/?꾨줈?앺듃??諛섎났 荑쇰━??B-4(諛곗튂)瑜?鍮쇰㈃ ?녿떎 | **?듦낵** |
| **bulk write** | `addUsersBulk`(?ㅽ뻾 INSERT IGNORE), `bulkInsertUsers`, `UPSERT_NON_PRIMARY_BULK`, `INSERT_USER_SKILLS(n)`, `INSERT_PROJECT_SKILLS(n)`, `bulkUpdateLayoutsRepository` ???꾨? ?ㅽ뻾 臾몄옣. ?묒? ?낅줈????`consumer.js:82`)??諛곗튂??1 INSERT | **?듦낵** |
| **p-limit ?숈떆???쒗븳** | ?꾨줈?앺듃 吏묎퀎(2), ?뚰겕濡쒓렇 珥덇낵 ?섏씠吏(5), 援щ룆 APPLY(2)쨌湲곕낯異붿젙(2)쨌?뚯뒪硫뷀?(3), ?깅줉??湲곕줉(5), ? ?꾨낫 ?꾨줈??4), ?몃젰遺??諛곗튂(3), myWork/罹섎┛??5) ?????蹂묐젹 吏?먯뿉 ?꾨? ?곹븳 | **?듦낵** |
| **諛곗튂??怨듯넻 ?먯썝 ?몄씠?ㅽ똿** | `PortfolioAggregator.js:490-509` 媛 settings쨌holiday쨌coworkerFieldId쨌`policyCtx` 瑜?猷⑦봽 **諛?1??*濡?議곕떖???꾨줈?앺듃蹂?二쇱엯. 二쇱꽍??*"aggregateOneProject ?덉뿉??濡쒕뱶?섎㈃ ?꾨줈?앺듃 ??횞 KVS ?뺣났 = ?깅뒫 ?ш퀬"* ?쇨퀬 紐삳컯???????紐⑤쾾 ?щ? | **?듦낵** |
| **`resolvePrincipal` 議고쉶 ??* | 30珥?L1 + KVS??`permission` `findById` 1?? ? ?ㅼ퐫??議고쉶??`isTeamLead \|\| TEAM_ONLY` ???뚮쭔(`:151-158`), ???꾨줈?앺듃 id 議고쉶??`Promise.all`(`:402-404`) | **?듦낵**(?숈떆 吏꾩엯 ??罹먯떆 誘몄쟻以묒? A-6) |
| **`TeamTreeCache`** | 60珥?TTL, ?곌린 寃쎈줈留?`loadTeamIndexFresh`. ? 100媛??댄븯硫?miss ??KVS 1??| **?듦낵** |
| **coworker resolve N+1** | `CoworkerResolver.js:20-40` ???섏씠吏 ?꾩껜 coworker id瑜?dedup ??**?붿껌??bulk 1??*. 移댁슫?몃쭔 ?꾩슂???뚮퉬泥섎뒗 ?곗? 留먮씪??寃쎄퀬媛 二쇱꽍???덇퀬 ?ㅼ젣濡?progress/cost/portfolio??`accountId[].length` 留??대떎 | **?듦낵** |
| **?몃젰 遺??諛곗튂(`ResourceLoadFetcher`)** | accountId 50媛?泥?겕 횞 `pLimit(3)`, POST search + `nextPageToken` 猷⑦봽, 泥?겕 ?⑥쐞 ?ㅽ뙣 寃⑸━, 洹몃９ 吏묎퀎瑜?**異붽? Jira 0??*濡?媛숈? ?⑥뒪?먯꽌 ?섏쭛(`:264-347`) | **?듦낵** |
| **? ?꾨낫 ?꾨줈??`TeamService.js:326-353`)** | 100媛?泥?겕 `pLimit(4)` 蹂묐젹 + 泥?겕 ?⑥쐞 ?ㅽ뙣 寃⑸━. 1,000紐?= Jira 10??3?쇱슫??| **?듦낵** |
| **`MyTeamAnalysisService.js:101-109`** | 7媛??낅┰ ?몄텧???섎굹??`Promise.all`, ?몄썝 異뺤쓣 `leadingScopeAccountIds` 濡?**癒쇱? 醫곹엺 ??* 議고쉶(B-7??吏?ν빐?????뺥깭) | **?듦낵** |
| **`mySchedule/*` ?꾩껜** | ?꾨? ?④굔 SQL. 猷⑦봽쨌N+1쨌Jira ?몄텧 0嫄?| **?듦낵** |
| **`storage/*` ?꾩껜** | 珥?SQL 8??`information_schema` 1 + ?꾨줈?앺듃紐?1 + ?됱닔 6媛?**蹂묐젹**), 媛쒕퀎 try/catch 寃⑸━ | **?듦낵**(C-14 ?쒖쇅) |
| **`MyPageService.jsx`** | ??μ냼瑜??쎌? ?딅뒗 ?쒖닔 ?묒? ?щℓ?? `MAX_ROWS=20000` ?곹븳 | **?듦낵** |
| **`ProjectCalendarService` / `ResourceWorklogFetcher`** | 珥덇낵 ?뚰겕濡쒓렇瑜?`EXTRA_PAGE_SIZE=100` offset 紐⑸줉 ??`Promise.all` 蹂묐젹. **A-1??吏?ν빐?????뺥깭** | **?듦낵** |
| **`GanttService.getProjectGanttData`** | ?꾩슜 ?섏쿂 1?⑥뒪 + ?대뜑 3荑쇰━ 蹂묐젹 + coworker bulk 1?? issuelinks瑜?search ?묐떟??inline?쇰줈 諛쏆븘 per-issue ?몄텧 0 | **?듦낵** |
| **?먯젙 紐⑤뱢** | `permissionGuard`쨌`ResourceCatalog`쨌`TeamAnalyticsScope`쨌`TeamLeadFieldPolicy`쨌`ProjectScope`쨌`CostAccess` ?꾨? **I/O 0 ?쒖닔 紐⑤뱢** | **?듦낵** |
| **`SkillService.js:58`** | `findAllPaged('name', 100, CATALOG_MAX_ITEMS)` 濡?100嫄?罹??뚰뵾 + bulk 寃쎈줈? ?곹븳 ?곸닔 怨듭쑀 | **?듦낵**(role/level? C-6) |
| **以묐났 ?대쫫 寃利?4醫?* | ?꾨? `findByWhere` ?몃뜳???숇벑寃??1?? ?꾨웾 ?ㅼ틪 ?꾨떂 | **?듦낵** |
| **`PortfolioSnapshotQuery.SELECT_ALL` ??JSON 3而щ읆** | `SELECT *` ?⑥슜?쇰줈 ?섏떖?덉쑝??`PortfolioDashboardService.js:242-244` 媛 `members_json`/`monthly_effort_json`/`weekly_effort_json` ???꾨? ?뚮퉬 ???뺣떦 | **?듦낵** |
| **`ProjectService` ??젣 cascade 10?곗냽 吏곷젹** | 蹂묐젹??媛?ν빐 蹂댁씠??TiDB ?몃옖??뀡 遺???섏뿉??"?먯떇 ??遺紐? ?쒖꽌媛 ?ъ떆???덉쟾?깆쓽 寃쎄퀎?대ŉ 二쇱꽍??洹쇨굅瑜?紐낆떆 | **?듦낵**(?섎룄??吏곷젹) |
| **`TableReadiness` ?꾨줈釉?* | `true` 留?紐⑤뱢 罹먯떆 ??而⑦뀒?대꼫??1??`information_schema` 議고쉶. 諛고룷-留덉씠洹몃젅?댁뀡 ?쒖감 諛⑹뼱濡??섎룄??| **?듦낵** |
| **TTL ?덈뒗 KVS 罹먯떆** | `ProjectProgress`/`ProjectCost`(10遺?, `ResourceAnalysis`(5쨌10遺?, `WorklogService`(10遺?, ?쇱씠?좎뒪(1h/1遺? 紐⑤몢 TTL 吏????臾댄븳 ?꾩쟻 ?놁쓬. `ProjectService.js:105쨌110` ???꾨줈?앺듃 ??젣 ???뚯깮 罹먯떆 ?ㅻ? 紐낆떆 delete | **?듦낵**(罹먯떆 **?④낵**??A-2) |
| **`onIssueCreated` ??＜ 諛⑹뼱** | 援щ룆 誘몄〈????**Jira ?몄텧 0??* 議곌린 醫낅즺. ?덈? throw ?섏? ?딆븘 ?ъ떆????＜ ?놁쓬 | **?듦낵**(?쒖꽌??B-10) |
| **?섎룞 ?ъ쭛怨?CTA** | ??1?대깽?몃쭔 ?ｊ퀬 `aggregatingStartedAt` ?쎌씠 以묐났 ?ㅽ뻾 李⑤떒 ???고?濡?鍮꾩슜??諛곗쬆?섏? ?딅뒗??| **?듦낵** |
| **?ㅼ?以?二쇨린 ?鍮?珥앸웾** | ?ы듃?대━??= day 1?? 由ъ빻??= hour 24?? ?????댁긽???⑥? 諛곗닔 ?놁쓬 | **?듦낵**(init-db hour??C-2) |
| **由ъ빻???뺤긽 寃쎈줈** | watermark `updated >=` 利앸텇 李쎌쑝濡?援щ룆???쒓컙??寃??1~2?섏씠吏. 20援щ룆 ??480~960 寃???쇰줈 ?덉궛(600/?ㅽ뻾) ?鍮??ъ쑀 | **?듦낵**(?뺤껜 ?쒕뒗 B-11) |
| **?뚰겕濡쒓렇 SQL ?뚯씠釉?異?* | `ddl/worklog.js` ?꾩껜 二쇱꽍 + `ddl/index.js` 誘몃벑濡?= ?뚯씠釉?誘몄〈?? ?뚰겕濡쒓렇 DB N+1 異뺤? **?대떦 ?놁쓬** | **?대떦 ?놁쓬** |

---

# 誘멸?利?(??媛먯궗濡??뺤젙?????녿뒗 寃?

| ??ぉ | ?ъ쑀 |
|------|------|
| Forge媛 **?숈떆 invoke瑜?媛숈? 而⑦뀒?대꼫濡?蹂대궡?붿?** | 紐⑤뱢 ?ㅼ퐫??罹먯떆(`PrincipalResolver` L1, `TeamTreeCache`, `fieldIdCache`)???ㅽ슚 ?곸쨷瑜좎씠 ?ш린 ?щ젮 ?덈떎. 而⑦뀒?대꼫媛 媛덈━硫?in-flight dedup?쇰줈??A-6??諛곗닔瑜?紐?留됰뒗????**洹몃옒??A-6??1?쒖쐞 ?섏젙? dedup???꾨땲??`isAdministrator` 蹂묐젹??*濡??≪븯??|
| `/rest/api/3/search/jql` ??`maxResults` ?ㅽ슚 ?곹븳 | B-1??`maxResults=5000` ???ㅼ젣濡?5,000嫄댁쓣 ?뚮젮二쇰뒗吏(硫붾え由??꾪뿕) ?섎━?붿?(議곗슜???꾨씫) 肄붾뱶濡??뺤젙 遺덇?. **?대뒓 履쎌씠???섏씠吏 猷⑦봽 遺?щ뒗 寃고븿**?대씪??寃곕줎? ?깅┰ |
| TiDB???ㅼ젣 ?ㅽ뻾 怨꾪쉷 | A-8쨌B-6? ?쒖? SQL ?먮━(鍮?sargable ?좎뼱, ?몃뜳??遺????洹쇨굅?쒕떎. TiDB ?듯떚留덉씠?媛 ?대뼸寃?泥섎━?섎뒗吏??`EXPLAIN` ?ㅼ륫???꾩슂?섎떎 |
| ?ㅼ젣 ?ъ씠?몄쓽 `w_i` 遺꾪룷 | A-1/A-5??諛곗닔??"?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋 鍮꾩쑉"???좏삎?대떎. 10%/30% ??媛吏濡??쒖떆?덉쓣 肉??ㅼ륫???꾨땲??|
| 媛??붾㈃???ㅼ젣 ?꾩젽 ??`W` | A-3/A-7????쒕낫??諛곗닔???ъ슜?먭? 諛곗튂???꾩젽 ?섏뿉 鍮꾨?. ?쒕뱶 湲곕낯 ??쒕낫??援ъ꽦? ?뺤씤?섏? ?딆븯??|
| KVS/SQL ?뺣났???ㅼ젣 吏??ms) | ?몄텧 **?잛닔**留??뚮떎. "紐?珥?鍮⑤씪吏?붽?"??諛고룷 ?섍꼍 ?ㅼ륫 ?꾩슂 |
| ?꾨줎??React Query 罹먯떆媛 ?≪닔?섎뒗 ?ы샇異?鍮꾩쑉 | `staleTime` ??嫄몃┛ 荑쇰━(??쒕낫???꾩젽 5遺??????щ갑臾????쒕쾭瑜???移쒕떎. 蹂?媛먯궗 ?섏튂??**cold 吏꾩엯 1??* 湲곗? |

# ?꾨줎?몄뿏??鍮꾪슚?㉱룰퀬鍮꾩슜 濡쒖쭅 媛먯궗 ??2026-08-12

- **???*: `static/ui/src` ?꾩껜 (582 ?뚯씪, JS/JSX)
- **?뚯뒪**: `develop` @ `2556a51` 湲곗? ?묒뾽 ?몃━
- **諛⑸쾿**: ?뺤쟻 異붿쟻(?앹궛???뚮퉬???숈떆 ?쎄린) + 鍮뚮뱶 ?곗텧臾??뚯뒪留?諛붿씠??洹??遺꾩꽍. **肄붾뱶 ?섏젙 ?놁쓬**
- **踰덈뱾 怨꾩륫**: `static/ui/build` ?곗텧臾?2026-08-12 15:34 鍮뚮뱶)??`main.js.map` ??VLQ ?뚯떛???⑦궎吏蹂??앹꽦 諛붿씠?몃? 洹??
> ?ш컖????**P1** 泥닿컧 ??/ **P2** 以묎컙 / **P3** ?ъ냼

### ?쒖쇅(?щ낫怨?????
- 援щ룆 媛먯궗(`_workspace/subscription-audit/AUDIT_2026-08-11.md`) 蹂닿퀬遺???F-8 ?뚯뒪 寃??臾대뵒諛붿슫????`projectDetail/issue/subscription/` ?꾩뿭
- RFC-160/182~185 而ㅻ컠???뚮젮吏??뱀꽦 ?????숆껐 怨꾩륫, ?⑤꼸 localStorage, `CardFullscreen`/`CardCollapseContext` ??1?뚯꽦 resize ?붿뒪?⑥튂(?뚯씪 二쇱꽍???섎룄 紐낆떆)
- ?섎룄??寃곗젙 ??肄붾뱶 ?ㅽ뵆由ы똿 援ъ“(2026-08-05 ?щ룄??, ?뚰겕濡쒓렇 湲곕뒫蹂??꾩슜 ?섏쿂 遺꾨━

---

## ?붿빟

| ?ш컖??| 嫄댁닔 | ?????ぉ |
|--------|------|-----------|
| **P1** | 14 | 踰덈뱾 ?좎텧(main 34%), ?④? ??8 invoke, ??3以?留덉슫?? `getUser` N+1 4怨? 媛꾪듃 ?몄쭛留덈떎 ?꾨웾 ?ъ“?? 3珥?諛깃렇?쇱슫???대쭅 |
| **P2** | 21 | ??쒕낫???꾨웾 ?대쭅 44?? 移몃컲 ?대쭅???ъ슜??濡쒕뱶遺???젣, 愿묒뿭 invalidate 2怨? staleTime ?꾨씫 8怨?|
| **P3** | 36 | 誘몃찓紐??뚯깮媛뮻룹씤?쇱씤 ?대줈?쨌v5 臾댄슚 ?듭뀡 7怨냈룸뜲?쒖퐫??|

**?섏젙 ?곗꽑?쒖쐞 沅뚭퀬**: P1-1(踰덈뱾 ?????ъ슜??珥덇린 濡쒕뵫) ??P1-13 + P1-12(???대뙌?걔룻뻾 議곕┰, ???몄뒪?댁뒪 65媛쒖뿉 怨깊빐吏? ??P1-2/P1-3(??留덉슫????吏꾩엯??invoke쨌?뚮뜑 ??컻) ??P1-4 + P1-14(?ъ슜???뺣낫 N+1 怨?洹?罹먯떆 ???ㅺ퀎??**?④퍡** 怨좎퀜???대뱷???⑥쟾?섎떎) ??P1-5/P1-7/P1-9 ??

> **??以??뺣━**: 愿???먯껜???????덈떎(?붾컮?댁뒪 10怨? 罹먯떆 ?⑥튂 洹쒖빟, 荑쇰━???⑺넗由?怨꾩빟 ?뚯뒪?? ECharts 遺꾨━, `assignment/` 紐⑤쾾 ?щ?). 臾몄젣??嫄곗쓽 ?꾨? **洹?愿?됱뿉???댄깉???뚯닔 吏??*?대ŉ, ?댄깉??怨녹씠 ?섑븘 **媛?????곗씠?걔룰?????? 吏꾩엯 寃쎈줈**??紐곕젮 ?덈떎.

---

## ?꾩젣 ?????꾨옒 ?щ윭 ??ぉ??鍮꾩슜???ш린???뚯깮?쒕떎

### (a) React Query ?꾩뿭 湲곕낯媛믪씠 鍮꾩뼱 ?덈떎

`static/ui/src/index.js:37`
```js
const queryClient = new QueryClient()
```

`defaultOptions` 誘몄?????v5 湲곕낯媛?洹몃?濡? **`staleTime: 0`, `refetchOnMount: true`, `refetchOnWindowFocus: true`, `retry: 3`**.

- ??131媛?以?127媛쒖냼媛 `staleTime` ??媛쒕퀎 紐낆떆??諛⑹뼱?덉?留? **?꾨씫??8媛?荑쇰━??李??ъ빱?ㅺ? ?뚯븘???뚮쭏?ㅒ룹옱留덉슫?몃쭏???ъ“??*?쒕떎(P2-6).
- `retry: 3` ???꾩뿭?대떎. queryFn ?먯꽌 `if (!res?.success) throw` ?섎뒗 ?뚯씪??**40媛?*?몃뜲 `retry` 瑜?override ???뚯씪? **9媛?*肉???沅뚰븳 嫄곕?쨌?쇱씠?좎뒪 李⑤떒쨌?뚯씠釉?誘몄?鍮꾩쿂??**?ъ떆?꾪빐???덈? ?깃났?섏? ?딅뒗 ?ㅽ뙣**媛 ?됰룞 1?뚮떦 **invoke 4??*(1s/2s/4s 諛깆삤??瑜??쒖슦怨??섏꽌???먮윭 ?붾㈃???щ떎.
- **?섏젙 諛⑺뼢**: `new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: (n, e) => n < 2 && !isPermanentError(e) } } })` 濡?諛붾떏??源붽퀬, ?ㅼ떆媛꾩꽦???꾩슂??怨노쭔 媛쒕퀎 override.

### (b) 而댄룷?뚰듃 硫붾え?댁젣?댁뀡???ъ떎???녿떎

`React.memo` ?ъ슜泥섎뒗 ???깆뿉 **1嫄?*(`backoffice/page/projectStatus/modal/flow/ProjectStatusFlow.jsx:34`, xyflow ?붽뎄?ы빆). `useMemo` 556 / `useCallback` 129 濡?**?곗씠?곕뒗 硫붾え?섏?留?而댄룷?뚰듃쨌??議곕┰? 硫붾え?섏? ?딅뒗** ?⑦꽩???쇨????덈떎.

???깆쓽 ?뚯씠釉붿? Atlaskit DynamicTable 怨꾩빟??`rows = [{ key, cells: [{ content: <JSX/> }] }]` ?뺥깭??**??議곕┰ ?먯껜媛 JSX ?몃━ ?앹꽦**?대떎. ?곕씪??`React.memo` 遺???먯껜蹂대떎 **`rows` ?앹꽦??`useMemo` 諛뽰뿉 ?덈뒗 寃?*???ㅼ젣 鍮꾩슜?대떎 ??P1-12(??JSX 議곕┰)? P1-13(洹??꾩뿉 ?뱁엳??怨듭슜 ?대뙌????洹?紐⑸줉?대떎. (?꾪궎?띿쿂 ?먯껜???뺤긽 ?먯젙 ??媛쒕퀎 吏?먮쭔 怨좎튂硫??섍퀬, `TableSurface` ??`React.memo` 瑜???踰??먮㈃ 鍮꾨찓紐??몄텧遺瑜?怨좎튂吏 ?딄퀬???곷떦 遺遺?諛⑹뼱?쒕떎)

---

## P1 ??泥닿컧 ??
### P1-1. 湲곕낯 吏꾩엯 ?쇱슦?멸? 留덊겕?ㅼ슫 ?먮뵒?걔룹틮由곕뜑 ?ㅽ깮??`main` 踰덈뱾??怨좎젙?쒗궓??(痢≪젙移?

- **?뺤쟻 import 泥댁씤**: `App.jsx:23` (`import WorklogPage from "./pages/myWork/WorklogPage"` ???섎룄???뺤쟻) ??`pages/myWork/WorklogPage.jsx:2-3` ??`components/calendar/FullCalendar.jsx:1-5` (`@fullcalendar/*`, `@fullcalendar/moment-timezone`) / `pages/myWork/modal/WorklogModal.jsx:22-24` ??`components/markdown/MarkdownEditor.jsx:1,10` (`@mdxeditor/editor` + `style.css`), `marklassian`, `adf-to-md`

`App.jsx:26-27` ??肄붾뱶 ?ㅽ뵆由ы똿??紐⑹쟻??**紐낆떆?곸쑝濡?* ?대젃寃??곸뼱 ?먯뿀??

```
// 臾닿굅???쇱씠釉뚮윭由?ECharts/ApexCharts/FullCalendar/MDXEditor/xyflow/kanban/gantt)媛
// 媛??섏씠吏瑜??곕씪 main 諛뽰쑝濡?鍮좎???寃껋씠 ??遺꾨━??紐⑹쟻?대떎.
```

洹몃윴??**FullCalendar ? MDXEditor ??紐⑹쟻?濡?鍮좎?吏 ?딆븯??** 湲곕낯 吏꾩엯 ?쇱슦?몃쭔 ?뺤쟻?쇰줈 ?먮뒗 寃곗젙?? 洹??쇱슦?멸? ???쇱씠釉뚮윭由щ? ?뺤쟻?쇰줈 ?뚭퀬 ?ㅻ뒗 諛붾엺??臾대젰?붾릱??

**鍮꾩슜 ?뺣웾** (?뚯뒪留?諛붿씠??洹?? `main.4db70f69.js` ?먮낯 3,702KB / gzip 898KB ???덉궛 950KB):

| ?ㅽ깮 | main ???먮낯 諛붿씠??| 鍮꾩쨷 |
|------|---------------------|------|
| MDXEditor 怨꾩뿴 (`@mdxeditor/editor` + `lexical`쨌`@lexical/*` + `@codemirror/*` + `prismjs` + `micromark`/`mdast`/`marked` + `@radix-ui/*`) | **986 KB** | **27.3%** |
| FullCalendar + `moment`(-timezone) | **275 KB** | **7.6%** |
| ?⑷퀎 | **1,261 KB** | **34.1%** |

- 媛쒕퀎 ?곸쐞 湲곗뿬: `@codemirror/view` 191KB, `@fullcalendar/core` 154KB, `lexical` 120KB, `@mdxeditor/editor` 99KB, `moment` 60KB, `prismjs` 55KB, `@codemirror/state` 49KB
- `main.895b72f2.css` **156KB** ?먮룄 mdxeditor ?대옒??15媛쒖냼쨌`fc-daygrid` ??FullCalendar 洹쒖튃???ы븿
- gzip ?섏궛 ??main 898KB 以????**250~300KB** (?먮낯 鍮꾩쨷 34% 횞 肄섑뀗痢좊퀎 ?뺤텞瑜??몄감). ?덉궛 ?ъ쑀媛 52KB 肉먯씠誘濡?**踰덈뱾 ?덉궛 寃뚯씠?몃? ?ㅼ젣濡??꾪삊?섎뒗 ?좎씪???⑹뼱由?*??
- **?꾧? ??鍮꾩슜???대뒗媛**: MDXEditor ??`WorklogModal` ?덉뿉?쒕쭔 ?곗씤??`WorklogModal.jsx:619`) ??**?뚰겕濡쒓렇 ?깅줉 踰꾪듉????踰덈룄 ?꾨Ⅴ吏 ?딆? ?ъ슜?먮룄 986KB 瑜??대젮諛쏅뒗??** ECharts(1,112KB 泥?겕)??媛숈? 洹쒖튃?쇰줈 ?대? ?щ컮瑜닿쾶 遺꾨━???덉뼱(`components/chart/echart/ThemedECharts.js:15` 二쇱꽍??洹쇨굅源뚯? 紐낆떆) **愿?됱씠 ??怨노쭔 ?닿툔???뺥깭**??

**援먯감 寃利?*: ??媛吏 ?낅┰?곸씤 怨꾩륫??媛숈? 寃곕줎???꾨떖?덈떎 ?????뚯뒪留?`mappings` VLQ ?뚯떛?쇰줈 **?앹꽦 諛붿씠??*瑜?洹??????, ???뚯뒪留?`sourcesContent` 瑜??⑦궎吏蹂??⑹궛??**?먮낯 ?뚯뒪 ?ш린**(MDXEditor 怨꾩뿴 2,002KB + FullCalendar 531KB + moment 189KB = main sourcesContent 珥앺빀 8,055KB ??**34%**). ??諛⑸쾿??34%濡??쇱튂?쒕떎. ?ㅼ껜??吏곸젒 ?뺤씤?덈떎 ??`main.js` ?덉뿉 tz ?곗씠??臾몄옄??`America/New_York`, `Asia/Seoul`, `Antarctica/Vostok`)怨?`lexical` ?щ낵 118媛? `fc-*` ?대옒??223媛쒓? 洹몃?濡??덈떎.

**?섏젙 諛⑺뼢**: `WorklogPage` ???뺤쟻?쇰줈 ?좎?(泥??붾㈃ ?뺣났 ?좎?)?섎릺 洹??덉뿉?????⑹뼱由щ쭔 lazy 濡??대┛??????`MarkdownEditor` 瑜?`React.lazy` + 紐⑤떖 ?대? Suspense 寃쎄퀎(紐⑤떖 ?ㅽ뵂 ?쒖뿉留?濡쒕뱶), ??`CustomFullCalendar` 瑜?`React.lazy` + 罹섎┛???곸뿭 Suspense 寃쎄퀎. `marklassian`/`adf2md` ???숈쟻 `import()` 濡?蹂???쒖젏?먮쭔. ?④낵 ?뺤씤? `CI=true npm run build` ??`node scripts/check-bundle-budget.js`.

---

### P1-2. `/resource` 吏꾩엯 ??**蹂댁씠吏 ?딅뒗 ??3媛?*???곗씠?곌? ?꾨? 濡쒕뱶?쒕떎

- `pages/resource/ResourcePage.jsx:52-73` ??`<TabPanel>` 4媛쒕? 議곌굔 ?놁씠 ?뚮뜑
- ?먯씤: Atlaskit `@atlaskit/tabs@18.3.4` ??`TabPanel` ? children ??**臾댁“嫄??뚮뜑**?섍퀬 HTML `hidden` ?띿꽦留?遺숈씤??(`node_modules/@atlaskit/tabs/dist/cjs/components/tab-panel.js:22-41` ??`React.createElement(Focusable, {..., hidden}, ... children)` ?뺤씤)

利?4媛???쓽 ?낆씠 **?숈떆???ㅽ뻾**?쒕떎.

**鍮꾩슜 ?뺣웾 ???섏씠吏 吏꾩엯 1?뚮떦 invoke 8嫄?* (?숈씪 ?ㅻ뒗 dedup 諛섏쁺):

| resolver | ?뚯쑀 ??| 泥??붾㈃???꾩슂? |
|---|---|---|
| `getResourceOverview` / `getResourceLoadSummary` / `getSettingData` / `getTeamOptions` | ?몃젰?꾪솴(怨듭쑀) | O |
| `getTeamAnalyticsScope` | ? 遺꾩꽍(**?④?**) | X |
| **`getPortfolioDashboard`** | ? 遺꾩꽍(**?④?**) | X ?????꾨줈?앺듃 raw + `members[]`쨌`monthlyEffort[]`쨌`weeklyEffort[]` ?꾨웾 |
| `getAssignmentProjectCards` | ?꾨줈?앺듃 諛곗젙(**?④?**) | X |
| **`getAssignmentProjectMetrics`** | ?꾨줈?앺듃 諛곗젙(**?④?**) | X ?????꾨줈?앺듃 Jira 諛곗튂 ?ㅼ틪 |

媛??臾닿굅??2嫄댁씠 **?????④? ???뚯쑀**?? 怨꾩궛???④퍡 ??퉬?쒕떎 ???④? `TeamAnalyticsTab` ??`teamMetricsByTeam` + `rollupTeamTree`(`teamAnalytics/hooks/useTeamAnalyticsData.js:153-183`)瑜??뚮━怨?**ECharts ?몄뒪?댁뒪 6媛쒕? ?ㅼ젣濡??앹꽦**?섎ŉ, ?④? `OrganizationTab` ??`aggregateByTeam` + `rollupTeamTree`(`organization/OrganizationTab.jsx:110-129`)瑜? ?④? `ProjectAssignmentBoard` 媛 `hydratePeople` + `sortHydratedRows`(`assignment/ProjectAssignmentBoard.jsx:143-152`)瑜????몄썝??????뚮┛??

> ?議곌뎔: ?섎㉧吏 ??而⑦뀒?대꼫???뺤긽?대떎. `components/tabs/CommonTab.jsx:70-81` ? **?쒖꽦 ???섎굹留?* ?뚮뜑?쒕떎(`MainPageTabs`/`ProjectDetailTabs` 媛 ?닿구 ?대떎). `ResourcePage` 留?raw `TabPanel` ???곕뒗 ?덉쇅??

**?섏젙 諛⑺뼢**: `Tabs` ??`selected`/`onChange` 瑜?遺숈뿬 `{selected === n && <XxxTab/>}` 濡?媛먯떥嫄곕굹, `CommonTab` ?쇰줈 ?닿??쒕떎.

**媛숈? ?먯씤???뚭퇋紐??щ?**: `pages/projectDetail/issue/IssueAddModal.jsx:207-211` ??"?묒뾽 異붽?" 紐⑤떖???닿린留??대룄 `activeTab === 0` ?몃뜲 `SubscriptionTab` ??留덉슫?몃뤌 援щ룆 ?곗씠???섏튂媛 ?쒖옉?쒕떎.

---

### P1-3. ?꾨줈?앺듃 ?곸꽭 吏꾩엯 ??**?쒖꽦 ???꾩껜媛 3踰?留덉슫?몃릺怨?2踰??먭린**?쒕떎

?곗뇙 (紐⑤몢 ?뺤씤):
1. `pages/projectDetail/ProjectDetailPage.jsx:22` ??`const toast = ToastFlags();` (?뚮뜑 蹂몃Ц 吏곸젒 ?몄텧)
2. `components/feedback/ToastFlags.js:75-86` ??`return { showSuccess: ..., FlagUI: <FlagPortal register={register}/> };` ??**留??뚮뜑 ??媛앹껜 由ы꽣??+ ??JSX**
3. `components/tabs/ProjectDetailTabs.jsx:22-25` ??`useMemo(..., [t, project_id, toast, ...])` ??`toast` ?꾩씠?댄떚?곌? 留ㅻ쾲 諛붾뚯뼱 **硫붾え媛 ?덈? ?덊듃?섏? ?딅뒗??*
4. `constants/tabs.js:80,99,109,...` ??`component: () => <DashboardPage project_id={project_id}/>` ?뺥깭??**?몃씪???붿궡??而댄룷?뚰듃 12媛?*媛 留ㅻ쾲 ???⑥닔濡??앹꽦
5. `components/tabs/CommonTab.jsx:78` ??`<ActivePage />` ??element **type ???щ씪吏誘濡?React 媛 ?쒕툕?몃━瑜??듭㎏濡??몃쭏?댄듃/由щ쭏?댄듃**

**鍮꾩슜 ?뺣웾**: `ProjectDetailPage` ??吏꾩엯 ??理쒖냼 3???뚮뜑?쒕떎(珥덇린 / `forgeContextKeys.current()` = `view.getContext()` ?댁냼 / `findProjectById` ?댁냼 ??`:29-42`). 利?**湲곕낯 ??`DashboardPage` 媛 3踰?留덉슫?몃릺怨?2踰?踰꾨젮吏꾨떎.** 留덉슫?몃쭏??ECharts ?몄뒪?댁뒪 ?ъ깮??+ `react-grid-layout` ?ъ륫??+ staleTime ?녿뒗 荑쇰━ ?ъ슂泥?`dashboard/DashboardPage.jsx:52-55` `getChartInfo`, `dashboard/summary/SummaryPanel.jsx:15-20` `getSummaryData`)???곕씪?⑤떎. ?댄썑 遺紐④? ??踰덈쭔 ???뚮뜑?섎㈃ ?ъ슜?먭? 嫄몄뼱???꾪꽣쨌?좏깮 ?몃뱶쨌酉곕え?쒓? **?꾨? 珥덇린??*?쒕떎.

**?섏젙 諛⑺뼢**: `const toast = useMemo(() => ToastFlags(), [])` (?대? `show*` ???대? ref 湲곕컲?대씪 ?덉쟾) + `tabs.js` ???몃씪???붿궡?쒕? 而댄룷?뚰듃 李몄“ + props ?꾨떖濡?援먯껜.

---

### P1-4. `getUser` N+1 ??4媛??붾㈃???몄썝 ?섎쭔??媛쒕퀎 Jira ?몄텧 (踰뚰겕 寃쎈줈媛 ?대? ?덈뒗??誘몄궗??

| ?꾩튂 | 肄붾뱶 | 鍮꾩슜 |
|---|---|---|
| `pages/projectDetail/cost/CostByIssueTable.jsx:66-74` | `for (let i=0; i<accountIds.length; i+=5) { await Promise.all(...map(id => executeRequest('getUser', {accountId:id}))) }` | 硫ㅻ쾭 40紐???**40 ?몄텧 / 8 ?쒖감 ?쇱슫??*, 鍮꾩슜 ??**吏꾩엯 利됱떆**(?쒕줈???닿린 ?? |
| `pages/projectDetail/salary/SalaryManagementPage.jsx:112-118` | `Promise.all(userIds.map(accountId => executeRequest('getUser', {accountId})))` | ?섏씠吏??10 ?몄텧, 100紐??꾨줈?앺듃 ?꾩＜ = **100 ?몄텧**. staleTime ?놁뼱 ?ъ쭊?낅쭏??諛섎났 |
| `pages/projectDetail/user/ProjectUserPanel.jsx:88-101` | ?숈씪 ?⑦꽩 | ?섏씠吏??10 ?몄텧, 10?섏씠吏 = **100 ?몄텧**. staleTime ?놁쓬 |
| `pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js:131-144` | 5媛쒖뵫 ?쒖감 諛곗튂 | ? ?꾪꽣 ??`USER_MAX=100` ??**100 ?몄텧 / 20 ?쒖감 ?쇱슫??* |

**?대? 踰뚰겕 寃쎈줈媛 ?덈떎**: `utils/useJiraUserInfos.js:5-26` (`fetchBulkUsers` ??`/user/bulk`, 50 id/?몄텧) + `utils/jiraApi/users/getUserInfos.js` (`useUserInfos`, staleTime 10遺?. `pages/projectDetail/taskHistory/TaskHistoryTable.jsx:108` ? ?대? ?닿구 ?대떎.

**?섏젙 諛⑺뼢**: ??怨?紐⑤몢 `useUserInfos(accountIds)` 濡?援먯껜 ??100紐낆씠 **2 ?몄텧**. `CostByIssueTable` ? 異붽?濡?`enabled` 瑜??쒕줈???ㅽ뵂??嫄몄뼱 吏꾩엯 ??0 ?몄텧濡?

---

### P1-5. 媛꾪듃/?몃━ ?몃씪???몄쭛 3醫낆씠 留ㅻ쾲 **?꾨줈?앺듃 ?댁뒋 ?꾨웾 ?ъ“??*瑜?嫄대떎 (+ 罹먯떆 ?⑥튂 洹쒖빟 ?꾨컲)

- `pages/projectDetail/gantt/useGanttMutations.js:443-445` (?대떦?? / `:511-513` (?묒뾽?? / `:584-586` (怨꾪쉷 MD)

```js
onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) });
},
```

????紐⑤몢 `onMutate` ?숆? ?⑥튂 + `onError` 濡ㅻ갚???대? 媛뽰떠 ?볤퀬 **留덉?留됱뿉 ?꾩껜 臾댄슚??*瑜?嫄대떎. `ganttKeys.data` ??`getProjectGanttData` ???쒕쾭?먯꽌 ?꾨줈?앺듃 ?댁뒋瑜?JQL 濡??꾨웾 ?섏씠吏??섏쭛(`src/resolver/gantt/GanttService.js:66-71`)?섍퀬 ?대뜑 3荑쇰━ + `resolveCoworkerUsersMap` 踰뚰겕 ?좎? 議고쉶源뚯? ?섎뒗 **媛??臾닿굅??resolver** ??

**鍮꾩슜 ?뺣웾**: 洹몃━?쒖뿉???대떦??1紐?蹂寃?= 沅뚰븳議고쉶(紐⑤뱢 TTL 罹먯떆 hit) + `assignIssue` + **??珥덉쭨由??꾨웾 ?ъ“??1??*. 20???곗냽 吏??= ?꾨웾 ?ъ“??20??

**異붽?濡??묒뾽??`useUpdateCoworkers`)??洹쒖빟 ?꾨컲?대떎**: ???낆씠 遺瑜대뒗 `updateProjectIdField` ??`src/resolver/projectIssue/ProjectUsersService.js:270-283` ?먯꽌 `setAppFieldValueForIssues`(??而ㅼ뒪??꾨뱶 write)瑜??꾨떎. **而ㅼ뒪??꾨뱶 write 吏곹썑 invalidate** ??Jira 寃???몃뜳??吏???뚮Ц????由ы룷媛 湲덉???諛붾줈 洹??⑦꽩?대떎(CLAUDE.md?뚰봽濡좏듃?붾뱶 Jira 吏곸젒 ?몄텧??.

> 媛숈? ?뚯씪 怨꾩뿴???뺣컲? 愿?됱쓣 紐낆떆?곸쑝濡?援ы쁽???먯뿀????`useGanttFolderMutations.js:16-21`(invalidate 湲덉?, ?묐떟 湲곕컲 遺遺??⑥튂), `useGanttMutations.js:156-158`(?쇱젙/遺紐?留곹겕??"?몃뜳??吏???뚮Ц??invalidate ???" 洹쇨굅 二쇱꽍). **??3媛쒕쭔 ?댄깉**?덈떎.

**?섏젙 諛⑺뼢**: `onSettled` 3媛쒕? ?쒓굅?섍퀬 `onSuccess` ?먯꽌 ?쒕쾭 ?묐떟?쇰줈 ?대떦 task 留?`setQueryData` ?⑥튂 ???ы띁 `patchTask` 媛 媛숈? ?뚯씪 `:23` ???대? ?덈떎.

---

### P1-6. ?쒖감 20?섏씠吏 ?댁뒋 ?щ· 2怨?+ **?댁뒋 1嫄??깅줉???꾩껜 ?ы겕濡ㅼ쓣 ?좊컻**

- `pages/projectDetail/issue/useWorkListQueries.js:60-79` ??`do { await executeRequest('searchIssueWithJQL', param) } while (nextPageToken)`, ?곹븳 `issue/workListQuery.js:17-19` (`MAX_PAGES=20, MAX_ISSUES=2000, PAGE=100`)
- `pages/projectDetail/taskHistory/TaskHistoryPage.jsx:54-87` ???숈씪 援ъ“, ?곹븳 `:21-23`

而ㅼ꽌 湲곕컲?대씪 **蹂묐젹??遺덇?, ?꾨? 吏곷젹**. 1,200 ?댁뒋 ?꾨줈?앺듃 = 泥??쎌? ?꾩뿉 **12???뺣났**. ?묒뾽紐⑸줉 履쎌? 洹?寃곌낵瑜?`buildGroups`(`workListQuery.js:75-98`)濡?洹몃９蹂?`{count, statusDist}` **?뺤닔 紐?媛?*濡?以꾩뿬 踰꾨┛????2,000媛??댁뒋 媛앹껜瑜?諛쏆븘 媛쒖닔留??대떎.

**?ы듃由ш굅**: `pages/projectDetail/issue/IssueAddModal.jsx:119` ?댁뒋 1嫄??깅줉 ??`invalidateQueries(projectKeys.taskHistory(project_id))` ??**12???щ· ?꾩껜 ?ъ떎??*. `issue/subscription/useSubscriptions.js:34` ??媛숈? ?ㅻ? 臾댄슚?뷀븳??

**遺??*: `useWorkListQueries.js:88` ??`fields: ['*all']` 濡????꾨뱶瑜?諛쏅뒗?????뚯씠釉붿씠 ?ㅼ젣 ?곕뒗 嫄?9媛쒕떎.

**?섏젙 諛⑺뼢**: 洹몃９ 移댁슫?몃뒗 `maxResults:0` 移댁슫??荑쇰━ ?먮뒗 ?쒕쾭 吏묎퀎 resolver 濡? ?묒뾽?대젰? ?깅줉???댁뒋瑜?`setQueryData` 濡?append.

---

### P1-7. `JobPollingManager` ??3珥?raw `setInterval` ??**諛깃렇?쇱슫????뿉?쒕룄** 怨꾩냽 ?덈떎

- `polling/jobPolling.js:3` ??`export const POLL_INTERVAL_MS = 3000;`
- `polling/JobPollingManager.jsx:50` ??job ???낅┰ `setInterval(async () => {...}, 3000)`
- `stores/useJobStore.js:43` ??`addJob` ??`.slice(0, 5)` 濡?理쒕? 5嫄?異붿쟻
- `App.jsx:94` ??`MemoryRouter` 諛붾줈 ?꾨옒 臾댁“嫄?留덉슫????**?깆쓽 紐⑤뱺 ?붾㈃**?먯꽌 ?숈옉

**?듭떖**: ?쒖닔 `setInterval` ?대씪 `document.visibilityState` 瑜?蹂댁? ?딅뒗?? ?議곌뎔?쇰줈, 媛숈? ?깆쓽 React Query ?대쭅? `@tanstack/query-core` ??`queryObserver.js:215` `if (this.options.refetchIntervalInBackground || focusManager.isFocused())` 媛?쒕줈 諛깃렇?쇱슫?쒖뿉???먮룞 ?뺤??쒕떎. **???대쭅留??덉쇅??**

醫낅즺 議곌굔??`isTerminalJob` ?먮뒗 `job === null` 肉먯씠?? resolver 媛 怨꾩냽 ?ㅽ뙣?섎㈃ backoff 媛 30珥덉뿉??罹〓릺怨?`jobPolling.js:4,7-10`) **?곴뎄??硫덉텛吏 ?딅뒗??*.

**鍮꾩슜 ?뺣웾**: 異붿쟻 job 5嫄?湲곗? **20 invoke/遺?= 1,200 invoke/?쒓컙**(`getUploadJobStatus`), 釉뚮씪?곗? ??쓣 ?ㅻⅨ 怨녹뿉 ?먯뼱???좎?. `useJobStore` ??localStorage TTL ??24h(`useJobStore.js:6`)??釉뚮씪?곗?瑜??ㅼ떆 ?댁뼱???ш컻?쒕떎.

**?섏젙 諛⑺뼢**: `document.hidden` ?대㈃ ?ㅽ궢?섍퀬 `visibilitychange` 濡??ш컻(1以?媛??. 寃쎄낵 ?쒓컙???곕Ⅸ 媛꾧꺽 ?곹뼢(?? 5遺???10珥?怨?N?????ш린 議곌굔 異붽?.

---

### P1-8. ?ъ슜??寃?됱씠 **???낅젰留덈떎 `invoke`**, 寃뚮떎媛 ?낅젰???좎떎?쒕떎

- `components/select/UserSearchSelect.jsx:100-113` ??`handleInputChange` 媛 `loadUsers({search: val, nextPage:0})` 瑜?**?붾컮?댁뒪 ?놁씠** 利됱떆 ?몄텧
- 吏꾩엯 寃쎈줈: `backoffice/page/user/UserListPaging.jsx:132` ??`components/search/UserSearchFilter.jsx:150`

```js
const loadUsers = useCallback(async ({ search, nextPage = 0 }) => {
    if (loadingRef.current) return;      // ??:46  ?명뵆?쇱씠??以??낅젰? 踰꾨젮吏꾨떎
    ...
    const res = await invoke("searchUser", { keyword: search, page: nextPage, size: 10 });
```

- `utils/useDebounce.js` 媛 ?덇퀬 ?뺤젣 `pages/project/ProjectHeader.jsx:30` ? `useDebounce(name, 300)` ???대떎 ?????뚯씪留?鍮좎죱??
- ???섏걶 嫄?`:46` ??議곌린 return ?대떎. **?붿껌?????덈뒗 ?숈븞?????낅젰? 踰꾨젮吏꾨떎.** `reqSeqRef`(`:60,70`)???묐떟 ??쟾留?留됱? ???쒕∼? 紐?留됱쑝誘濡? 留덉?留?湲?먯쓽 寃?됱씠 ?꾩삁 諛쒖궗?섏? ?딆븘 ??寃곌낵媛 ?⑤뒗 寃쎈줈媛 ?앷릿??

**鍮꾩슜 ?뺣웾**: 寃?됱뼱 N湲??= 理쒕? **N??`invoke('searchUser')`**(媛곴컖 Jira ?ъ슜??寃???뺣났). "?띻만?? ?낅젰 ??6???쒕룄 以??쇰????쒕∼??寃곌낵媛 ?닿툔?쒕떎.

**?섏젙 諛⑺뼢**: `useDebounce(keyword, 300)` ??effect ?먯꽌 1?뚮쭔 ?몄텧. ?붾컮?댁뒪媛 ?ㅼ뼱媛硫?`loadingRef` 議곌린 return 媛???먯껜媛 遺덊븘?뷀빐吏꾨떎.

---

### P1-9. `/myWork` 吏꾩엯 ??**媛숈? ?뚰겕濡쒓렇 resolver 瑜???踰?* ?몄텧?쒕떎

`pages/myWork/WorklogPage.jsx:79-87` (罹섎┛??媛??踰붿쐞) 怨?`:118-126` (?곷떒 KPI ?붿빟, ?대쾲 ??1??留먯씪) ??**????* `useMyWorklogList({... mine:true})` 瑜??몄텧?쒕떎.

`pages/myWork/utils/useMyWorklogList.js:20` ??荑쇰━ ?ㅺ? ?좎쭨 踰붿쐞瑜??ы븿?섎?濡?`myWorkKeys.worklogList(resolverName, selectedProjectIds, startDate, endDate)`) ??荑쇰━??**罹먯떆媛 媛덈━怨??쒕쾭瑜?2踰?移쒕떎**.

湲곕낯 吏꾩엯 ?곹깭?먯꽌 FullCalendar ??`dateRange` ???대쾲 ?ъ쓣 ?꾩쟾??**?ы븿?섎뒗** 6二?援ш컙?대떎. 利?(2)媛 ?꾩슂濡??섎뒗 ?곗씠?곕뒗 (1)??**?대? ?꾨? ?ㅼ뼱 ?덈떎**.

**鍮꾩슜 ?뺣웾**: `/myWork` 吏꾩엯 1?뚮떦 ?좏깮 ?꾨줈?앺듃 ?꾩껜?????臾닿굅??Jira ?뚰겕濡쒓렇 吏묎퀎 **2??*(`getMyCalendarWorklog`). ?꾨줈?앺듃 ?좏깮??諛붽? ?뚮쭏???ㅼ떆 2??

**?섏젙 諛⑺뼢**: ?붿빟? (1)??寃곌낵?먯꽌 怨꾩궛(`useMyWorklogSummary` ???대? ?쒖닔 reduce??, 罹섎┛?붽? ?대쾲 ?ъ쓣 踰쀬뼱??寃쎌슦?먮쭔 ?붿빟??荑쇰━瑜?`enabled` 濡?耳좊떎.

---

### P1-10. ?꾨컮? ?꾨줈釉뚭? 愿怨꾨룄瑜?**?꾨컮? ?섎쭔???꾩껜 ?ш렇由ш린** ?쒕떎

`pages/resource/allocation/AllocationGraph.jsx:26,30-49,51-54,75`

```js
const [avatarOkSet, setAvatarOkSet] = useState(() => new Set());            // :26
img.onload = () => { setAvatarOkSet(prev => prev.has(url) ? prev : new Set(prev).add(url)); }; // :37-40
const option = useMemo(() => buildAllocationOption({...avatarOkSet}), [..., avatarOkSet]);      // :51-54
<ECharts option={option} notMerge={true} .../>                                                  // :75
```

`onload` 留덈떎 **??`Set`** ??留뚮뱾?댁졇 `option` useMemo 媛 臾댄슚?붾릺怨? `notMerge={true}` ??ECharts 媛 留ㅻ쾲 **?꾨웾 teardown ???ш렇由ш린** ?쒕떎. 猷⑦듃媛 `ReactDOM.render`(legacy ??`index.js:2,39`)??**?ㅼ씠?곕툕 `img.onload` ??諛곗묶?섏? ?딅뒗??* ???대?吏 1媛?濡쒕뱶 = ?뚮뜑 1??

**鍮꾩슜 ?뺣웾**: ?꾨컮? M紐???**M??由щ젋??횞 M??`buildAllocationOption` ?꾩껜 ?ш뎄??*(`allocation/allocationGraphOption.js:98-357` ???몃뱶 `projects+teams+members` + ?ｌ? `projectTeamPairs+members` ?꾨웾 + tooltip ?대줈? ?ъ깮?? **횞 M??ECharts notMerge ?ш렇由ш린**. ?곹븳 `MAX_GRAPH_PROJECTS=15` ?먯꽌 ?대떦??50~100紐낆씠硫?**50~100?곗냽 ?꾩껜 ?ш렇由ш린** ??愿怨꾨룄瑜??쇱튇 吏곹썑 ??珥덇컙 ?꾨━利?

**?섏젙 諛⑺뼢**: `onload` 寃곌낵瑜?`useRef` ??紐⑥븘 `requestAnimationFrame`/吏㏃? ??대㉧濡?**1?뚮쭔** flush ?섍굅?? ?꾨줈釉뚮? `Promise.allSettled` 濡?臾띠뼱 ?꾨? ?앸궃 ??`setAvatarOkSet` ????踰덈쭔 ?몄텧.

---

### P1-11. 而ㅼ뒪? ??쒕낫???꾩젽??**?쒕줈??由ъ궗?댁쫰瑜??꾩뿭?쇰줈 利앺룺**?쒗궓??
`components/chart/echart/EchartPanel.jsx:21-35`

```js
const observer = new ResizeObserver(() => {
    window.dispatchEvent(new Event("resize"));   // ???ㅻ줈? ?놁쓬
});
observer.observe(containerRef.current);
```

`echarts-for-react` ??**window resize 瑜?援щ룆**?쒕떎(媛숈? ?ъ떎??`components/card/CardFullscreen.jsx:17`, `components/card/collapse/CardCollapseContext.jsx:50` 二쇱꽍??紐낆떆???덈떎). ?곕씪??**???꾩젽??而⑦뀒?대꼫媛 而ㅼ?硫??섏씠吏??紐⑤뱺 ECharts ?몄뒪?댁뒪媛 ?ъ륫?빧룹옱?뚮뜑**?쒕떎.

?ъ슜泥섎뒗 `pages/projectDetail/dashboard/ChartTemplate.js` ??`react-grid-layout` ?꾩뿉 ?꾩젽 6~12媛쒓? ?щ씪媛???꾨줈?앺듃 ??쒕낫?쒕떎.

**鍮꾩슜 ?뺣웾**: ?꾩젽 N媛?媛곴컖??ResizeObserver 瑜?媛뽯뒗?? ?꾩젽 ?섎굹瑜??쒕옒洹?由ъ궗?댁쫰?섎㈃ ?덉씠?꾩썐 ?щ같移섎줈 ?щ윭 而⑦뀒?대꼫 ?ш린媛 諛붾뚭퀬 ??媛??듭?踰꾧? 諛쒗솕 ??媛곴컖 ?꾩뿭 resize ?붿뒪?⑥튂 ??**N媛?李⑦듃媛 留ㅻ쾲 ?ъ륫??*. ?쒕옒洹몃뒗 ?꾨젅???⑥쐞濡?諛쒖깮?섎?濡?**?쒕옒洹?1珥?= 理쒕? 60?꾨젅??횞 N ?붿뒪?⑥튂 횞 N 李⑦듃 ?ъ륫??(O(N짼))**. 寃뚮떎媛 李⑦듃 由ъ궗?댁쫰媛 而⑦뀒?대꼫 ?ш린瑜??ㅼ떆 嫄대뱶由щ㈃ ?듭?踰꾧? ?щ컻?뷀븯???섎㉨??寃쎈줈媛 ?대젮 ?덈떎.

> ?議곌뎔: `CardFullscreen.jsx:25`쨌`CardCollapseContext.jsx:55`쨌`portfolio/widgets/ChartBox.jsx:19`쨌`resource/teamAnalytics/TeamChartBox.jsx:32` ???꾨? **1?뚯꽦 `setTimeout` ?붿뒪?⑥튂**(100~200ms)??臾몄젣?녿떎 ???곗냽 諛쒗솕?섎뒗 寃껋? `EchartPanel` ?섎굹肉먯씠??

**?섏젙 諛⑺뼢**: ?꾩뿭 ?붿뒪?⑥튂瑜?踰꾨━怨??대떦 李⑦듃 ?몄뒪?댁뒪?먮쭔 `echartsInstance.resize()` 瑜??몄텧?섍굅?? 理쒖냼??rAF 濡?肄붿뼹?덉뒪 + ?ш린 蹂?붽? ?ㅼ젣濡??덉쓣 ?뚮쭔 諛쒗솕.

---

### P1-12. 寃???낅젰 臾대뵒諛붿슫??+ ?????議곕┰ 誘몃찓紐?(4媛??붾㈃)

`utils/useDebounce.js` ?????꾩뿭?먯꽌 10怨녹씠 ?뺤긽 ?ъ슜 以묒씤??200~500ms), ?꾨옒 4怨노쭔 鍮좎졇 ?덇퀬 **?섑븘 ???諛곗뿴??媛???щ떎**.

| ?꾩튂 | 臾대뵒諛붿슫??吏??| 誘몃찓紐???議곕┰ | 鍮꾩슜 ?뺣웾 |
|---|---|---|---|
| `pages/projectDetail/work/ProjectTreeView.jsx:87,171,192` | `search` state 利됱떆 媛깆떊(`work/TreeStructurePanel.jsx:105-115`) | ??(?뚯씠?꾨씪???먯껜媛 鍮꾩뙂) | ??湲?먮떦 `tasks.filter` ??`gantt/ganttAdapter.js:101-239 toSvarTasks`(遺紐⑥쭛??2???ㅼ틪 + ???몃뱶 留ㅽ븨) ??`:253-396 synthesizeFolderNodes`(?대뜑 ?ш? 濡ㅼ뾽) ??`buildWorkTree` ??`flattenTree` ??`nodesById` Map ?ш뎄異? **500 ?댁뒋 + 20 ?대뜑?먯꽌 3湲??= ?뚯씠?꾨씪??3???꾩＜ + 醫뚯륫 ???꾨웾 ?щ젋??* |
| `pages/resource/organization/OrganizationTab.jsx:99,290-326` | `backoffice/page/team/TeamTreePanel.jsx:127` `onChange={e => onSearchChange(e.currentTarget.value)}` | `:290` `const rows = members.map(...)` ??`useMemo` ?놁쓬, `members` ??? 誘몄꽑????**?꾩궗 ?몄썝 ?꾨웾**(`:167-175`), `head`(`:279-288`)??留??뚮뜑 ??媛앹껜 | **500紐?議곗쭅?먯꽌 ????踰덈떦 3,000媛?? 媛앹껜 + 洹??덉쓽 `UserAvatar`/`SemanticBadge`/`SkillTags`/`Badge` ?섎━癒쇳듃.** `directOnly` ?좉?쨌? ?좏깮쨌?몃━ ?묎린?먯꽌???숈씪 |
| `pages/myPage/sections/MyIssuesPanel.jsx:112-174` / `MyWorklogPanel.jsx:148,205` | `SearchInput`(`MyIssuesPanel.jsx:185-189`) | ?꾪꽣留?`rowsData`)? `:61-100` ?먯꽌 硫붾え?덈뒗??**?뺤옉 鍮꾩떬 ?섎━癒쇳듃 議곕┰(`:112`)??硫붾え 諛?* | `getMyIssueList` ???쒕쾭 ?섏씠吏뺤씠 ?놁뼱 ?꾨웾???대젮以?? ?댁뒋 N嫄?= **???낅젰 1?뚮떦 N횞5 ?**. `CommonTable rowsPerPage=10` ?대씪 DOM ? 10?됱씤??**踰꾨젮吏?N-10?됱쓣 留ㅻ쾲 留뚮뱺??* |
| `backoffice/page/team/TeamPage.jsx:97-99` + `TeamTreePanel.jsx:127` | ?숈씪 | `useMemo` 3?⑥? 嫄몃젮 ?덉쓬 | ?쒕쾭 ?곹븳 500? 湲곗? **???낅젰??1,500???쒗쉶 + 理쒕? 500媛?`TeamNodeRow` ?щ젋??*(memo ?놁쓬, ?몃씪??style) |

**媛숈? 遺瑜섏쓽 誘몃찓紐???議곕┰** (寃?됯낵 臾닿??섍쾶 遺紐??곹샇?묒슜留덈떎 諛쒖깮):
- `pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx:159-249` ??`const rows = members.map(...)` 誘몃찓紐? 遺紐?`ResourceAnalysisPage.jsx:44-55` 媛 state 12媛쒕? ?뚯쑀?섎?濡?DatePicker ??湲?먃룻듯븘?걔룻? ?좏깮쨌泥댄겕諛뺤뒪쨌?쒕줈??媛쒗룓媛 ?꾨? ?щ젋?붾? ?좊컻. ?꾨웾 ?섏튂 紐⑤뱶 `members` 理쒕? 500(`resourceMembersAdapter.js:25`), `CommonTable` ? 10?됰쭔 洹몃┝ ??**?곹샇?묒슜 1?뚮떦 ~4,000 ? ?섎━癒쇳듃 ?앹꽦, 洹몄쨷 40媛쒕쭔 ?붾㈃???섍컧**
- `pages/resource/overview/ResourceOverviewTable.jsx:69-121` ??`rows` ??`useMemo` 吏留?deps ??`onRowSelect` 媛 遺紐?`ResourceOverviewTab.jsx:155`)?먯꽌 **?몃씪???붿궡??*????긽 臾댄슚?? `rowsPerPage=15` ?몃뜲 ?꾨웾 議곕┰ ??**500紐낆씠硫?4,000?, ?⑤뒗 嫄?120?.** ?쒕줈??5??媛쒗룓 = 10??諛섎났
- `pages/resource/assignment/people/CompanyResourceTable.jsx:60,158` + `ProjectAssignmentBoard.jsx:468` ???숈씪???몃씪??`onRowSelect`. `onAssign` ? `useCallback` ?쇰줈 ?쒕?濡?怨좎젙???덉뼱 **??履쎈쭔 ?볦튇 耳?댁뒪**
- `pages/project/ProjectList.jsx:18,24-26,44-79` ???뚯깮 ?곗씠?곕? `useState`+`useEffect` 濡??ㅺ퀬 ?덉뼱 **?곗씠??1?뚮떦 ?뚮뜑 2??*(鍮?rows ??effect ??setRows/setPages ???щ젋??. `statusMap`(`:24`)??留??뚮뜑 ?ъ깮?? `ProjectPage.jsx:30` ??5遺??대쭅?쇰줈 ?좏쑕 ?곹깭?먯꽌??諛섎났
- `pages/projectDetail/progress/ProgressRiskTable.jsx:62,73` ??`rows`/`head` ????誘몃찓紐? 80??湲곗? 480?/?뚮뜑

**?섏젙 諛⑺뼢**: ??寃??4怨녹뿉 `useDebounce(search, 200~300)`, ??議곕┰ ?꾨? `useMemo`, 遺紐⑥쓽 ?몃씪??肄쒕갚??`useCallback` ?쇰줈 怨좎젙. `CompanyResourceTable` ??`useInfiniteSlice`(30媛??덈룄?? ?⑦꽩???대? 由ы룷???덉쑝誘濡?????쒕뒗 洹몄そ?쇰줈 ?섎졃?쒗궗 ???덈떎.

---

### P1-13. 怨듭슜 ???대뙌?곌? **留??뚮뜑 O(?됁쀬뿴)** 濡??꾨뒗 ?몄텧遺媛 ?덈컲?대떎 (???몄뒪?댁뒪 65媛쒖뿉 怨깊빐吏?

`components/table/TableSurface.jsx:46-75` ????媛쒖쓽 `useMemo` 瑜?`dataRows`(= `rows` prop **李몄“**)???섏〈?쒗궓??

```js
const dataRows = Array.isArray(rows) ? rows : [];                       // :46
const effectiveRows = isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows;  // :47
...
const sortable = useMemo(() => { ... resolveSortableColumns(head, dataRows) }, [signature, isLoading, dataRows]);  // :60-68
const adaptedRows = useMemo(() => adaptRows(head, effectiveRows, sortable), [signature, effectiveRows, sortable]); // :71-75
```

**?몄텧遺媛 ?뚮뜑留덈떎 ??諛곗뿴??留뚮뱾硫???硫붾え媛 ?듭㎏濡?臾댄슚?붾맂??** `CommonTable` ?몄텧 ?뚯씪 35媛?以?**17怨녹씠 `rows` 瑜?硫붾え?섏? ?딅뒗??* ??`MyIssuesPanel.jsx:112`, `MyTeamAnalysisPanel.jsx:202`, `PortfolioCostOverrunRank.jsx:27`, `PortfolioProjectTable.jsx:78`, `PortfolioTsrSignalTable.jsx:117`, `PortfolioUtilization.jsx:143`(?몃씪??`rows={topPeople.map(...)}`), `ResourceAnalysisChart.jsx:165`, `ResourceAnalysisTable.jsx:159`, `ResourceAnalysisTeamTable.jsx:117`, `TeamCoverageTable.jsx:93`, `IssueAddModal.jsx:59`, `ProgressRiskTable.jsx:73`, `StorageTableList.jsx:29`, `FailListModal.jsx:17`, `OrganizationTab.jsx:290` ?? (P1-12 ? 媛숈? 吏?먮뱾?댁?留?**鍮꾩슜??痢듭씠 ?ㅻⅤ??* ??嫄곌린?쒕뒗 JSX 議곕┰, ?ш린?쒕뒗 洹??꾩뿉 ?뱁엳??怨듭슜 ?대뙌??

**鍮꾩슜 ?뺣웾** (?ㅼ젣 ?⑥닔 蹂몃Ц ?뺤씤):
- `resolveSortableColumns`(`tableSort.js:72-101`) ???뺣젹 媛??而щ읆留덈떎 **????猷⑦봽**. `sortValue`/`sortKey` 媛 ?녿뒗 而щ읆? 議곌린 ?덉텧?????섍퀬 ?앷퉴吏 ?ㅼ틪?쒕떎.
- `adaptRows`(`tableSort.js:146-175`) ???뺣젹 媛??而щ읆留덈떎 `rows.map` + `filter` + `map` = **??湲몄씠 諛곗뿴 3媛??좊떦**. ?댄썑 `sortValue`/`sortKey` ?붾쪟 寃?щ줈 **????횞 ???** ????踰????ㅼ틪?쒕떎.
- 200??횞 ?뺣젹 而щ읆 4媛?= ?뚮뜑??**諛곗뿴 ?щ’ ~2,400媛?+ O(200횞8) ?ㅼ틪**.
- 濡쒕뵫 以묒뿉??`:47` ??`buildSkeletonRows(...)`(`skeletonRows.js:21`)媛 留??뚮뜑 ??諛곗뿴??留뚮뱾??**硫붾え瑜??뺤젙?곸쑝濡?臾댄슚??*?쒕떎.

**諛곗닔**: 怨듭슜 ???몄뒪?댁뒪 珥?**65媛?*(`CommonTable` 37 + `ChartTableToggle` 24 + `CursorPagingTable` 3 + `PagingTable` 1).

**?섏젙 諛⑺뼢**: `effectiveRows` 瑜?`useMemo([signature, skeletonRowCount, isLoading, rows])` 濡?媛먯떥怨? `<DynamicTable>` ??`frozenHead`/`adaptedRows`/`rowsPerPage` 留?蹂대뒗 `React.memo` ?섑띁濡?媛먯떬????洹몃윭硫?**鍮꾨찓紐??몄텧遺 17怨녹쓣 怨좎튂吏 ?딄퀬??諛⑹뼱**?쒕떎.

> **遺??議곌굔遺 鍮꾩슜**: `TableSurface.jsx:88-90` ??`frozenHead` ?????숆껐??耳쒖졇 ?덉쑝硫?**??긽 ??李몄“**??`:82` 二쇱꽍?濡?`adaptedHead` ???섎룄?곸쑝濡?硫붾え?섏? ?딅뒗??. Atlaskit `dynamic-table` ??`withSortedPageRows` ??`getDerivedStateFromProps` 瑜?**prevProps 鍮꾧탳 ?놁씠 留??뚮뜑** ?ㅽ뻾?쒕떎(`node_modules/@atlaskit/dynamic-table/dist/cjs/hoc/with-sorted-page-rows.js:145-165`).
> ??**?뺣젹??嫄몃젮 ?덉? ?딆쑝硫?* `getSortedRows`(`:37-40`)媛 `rows` 瑜?洹몃?濡?諛섑솚?섍퀬 `getPageRows` ?щ씪?댁뒪留??섎?濡?**鍮꾩슜? 臾댁떆??留뚰븯??*.
> ??**?ъ슜?먭? ?뺣젹 ?ㅻ뜑瑜??대┃????*?먮뒗 留??뚮뜑 `Array.from(rows)` ?꾨웾 蹂듭궗 + `Intl.Collator.compare` 湲곕컲 `.sort()` 媛 ?덈떎. 200?됱씠硫??뚮뜑??**??,530??collator 鍮꾧탳**. 利???寃쎈줈??"?뺣젹??耳????먯꽌留?諛쒗쁽?쒕떎.

---

### P1-14. `useUserInfos` ??荑쇰━?ㅺ? **accountId 諛곗뿴 ?꾩껜** ???붾㈃ 媛?罹먯떆 怨듭쑀 0, ?섏씠吏留덈떎 ?꾨웾 ?ъ“??
`utils/queryKey/jiraKeys.js:4`
```js
userInfos: (accountIds) => ['jiraUserInfos', accountIds],
```

**id 吏묓빀 ?꾩껜媛 ??*?쇱꽌 吏묓빀????紐낆씠?쇰룄 ?ㅻⅤ硫??꾩쟾???ㅻⅨ 罹먯떆 ?뷀듃由ш? ?쒕떎. **?ъ슜???⑥쐞 罹먯떆媛 ?놁뼱 寃뱀튂???몄썝??留ㅻ쾲 ?ㅼ떆 諛쏅뒗??** ?뚮퉬泥?6怨?`myPage/MyPageHeader.jsx:37`, `myWork/modal/WorklogModal.jsx:97`, `myWork/MyIssueTable.jsx:41`, `project/ProjectDetailDrawer.jsx:90`, `projectDetail/calender/useProjectWorkersSchedule.js:34`, `projectDetail/taskHistory/TaskHistoryTable.jsx:108`)???꾨? ?쒕줈 ?ㅻⅨ ?ㅻ? ?대떎.

**鍮꾩슜 ?뺣웾**: `TaskHistoryTable` ??20???섏씠吏濡?10?섏씠吏 ?섍린硫???**罹먯떆 ?뷀듃由?10媛?횞 bulk ?붿껌 10??*. ?ㅼ젣 ?깆옣 ?몄썝??30紐낅퓧?댁뼱??理쒕? 200紐낅텇???섏튂?쒕떎(**??.7諛?怨쇰떎**). ?붾㈃????린硫??묒뾽?대젰 ???꾨줈?앺듃 ?쒕줈?? 媛숈? ??먯씤?곕룄 泥섏쓬遺???ㅼ떆 諛쏅뒗??

**寃뱀튂??臾몄젣 2嫄?(媛숈? 寃쎈줈)**:
- `utils/useJiraUserInfos.js:16-24` ??50媛?泥?겕瑜?`for...of await` 濡?**吏곷젹** 泥섎━. 200紐?= 4泥?겕 = **4??吏곷젹 ?뺣났**. `Promise.all`(?먮뒗 ?숈떆??2~3 ?쒗븳)?대㈃ 1?뚮텇?대떎. 諛깆뿏?쒖뿉??`p-limit` 愿?됱씠 ?덈뒗???꾨줎????寃쎈줈?먮쭔 ?녿떎.
- `utils/jiraApi/users/getUserInfos.js:8-12` ??`useMemo(..., [accountIds])` ?몃뜲 ?몄텧遺媛 ?몃씪??諛곗뿴(`memberRows.map(...)`, `accountId ? [accountId] : []`)???섍린誘濡?**留??뚮뜑 `Set` ?앹꽦 + `sort` 媛 ?ㅼ떆 ?덈떎**.

**?섏젙 諛⑺뼢**: ?ㅻ? accountId **?⑥쐞**濡?履쇨컻嫄곕굹(`['jiraUser', id]` + `useQueries`), 理쒖냼??bulk ?묐떟??`queryClient.setQueryData` 濡?媛쒕퀎 ?ъ슜??罹먯떆???ъ뼱 ?ㅼ쓬 吏묓빀???덊듃?섍쾶 ?쒕떎. 泥?겕 猷⑦봽??`Promise.all` 濡?

> ????ぉ? P1-4(`getUser` N+1)??**?섏젙 紐⑹쟻吏**?닿린???섎떎 ?????붾㈃??`useUserInfos` 濡???린湲??꾩뿉 ???ㅺ퀎瑜?癒쇱? 怨좎퀜???대뱷???⑥쟾???쒕떎.

---

## P2 ??以묎컙

### P2-1. ?ъ쭛怨??대쭅????쒕낫??**?꾩껜 ?섏씠濡쒕뱶**瑜?15珥덈쭏??理쒕? 44???ㅼ떆 諛쏅뒗??`pages/portfolio/PortfolioDashboardPage.jsx:34-35,62-68` ??`refetchInterval: aggregating ? AGGREGATION_POLL_MS(15s) : false`, `AGGREGATION_MAX_WAIT_MS = 11遺?.

**二쇨린 ?먯껜???⑸━?곸씠????臾몄젣???대쭅 ??곸씠??** ?꾨즺 ?먯젙???꾩슂??嫄?`data.lastAggregatedAt` ???꾨뱶肉먯씤??`:115-122`), 留??깅쭏??`getPortfolioDashboard` 媛 ???꾨줈?앺듃 raw(`projects[]` + 媛??꾨줈?앺듃??`members[]`쨌`monthlyEffort[]`쨌`weeklyEffort[]`쨌`issueSummary`)瑜??듭㎏濡??대젮以?? 諛깆뿏?쒖뿉 媛踰쇱슫 ?곹깭 議고쉶媛 ?녿떎 ??`src/resolver/portfolioDashboard/PortfolioDashboardController.js` ?깅줉 ?⑥닔??`getPortfolioDashboard`, `triggerPortfolioAggregation` ?섎퓧.

**鍮꾩슜**: ?ъ쭛怨?踰꾪듉 1?대┃ = 理쒕? `11min / 15s = 44?? ?꾨웾 ?섏튂. ?꾨줈?앺듃 50嫄?횞 硫ㅻ쾭 20紐낆씠硫?留????섎갚 KB. 留??묐떟??`data` 李몄“瑜?媛깆떊 ??`usePortfolioFilter.js:65-68` `selectedProjects` ??**???꾩젽 ?ъ쭛怨?+ ??ECharts ?ш렇由ш린媛 44???곗뇙**.

**?섏젙**: `lastAggregatedAt`/`aggregateStatus` 留?二쇰뒗 寃쎈웾 resolver 瑜??대쭅?섍퀬, 媛믪씠 諛붾??쒖젏??`getPortfolioDashboard` 瑜?1?뚮쭔 invalidate.

### P2-2. 移몃컲 3遺??대쭅???ъ슜?먭? "??遺덈윭?? 移대뱶瑜?3遺꾨쭏??吏?대떎
`pages/projectKanban/ProjectKanbanBoard.jsx:63-86`(`refetchInterval: 3*60*1000`) vs `:165-203`.
`queryFn`(65-83)? `buildStatusData` + `applyProjectListToDataSource` 濡?dataSource 瑜?**泥섏쓬遺???ㅼ떆 留뚮뱺??*. 諛섎㈃ `loadMoreOldProjects` ??`queryClient.setQueryData` 濡?湲곗〈 罹먯떆??**蹂묓빀**?쒕떎 ??3遺??대쭅??蹂묓빀遺꾩쓣 ?꾨? ?좊┛?? 洹몃윴??`oldPage`/`hasMoreOld` state(`:36-37,196-197`)???⑥븘 ?덉뼱 "?붾낫湲?瑜??ㅼ떆 ?뚮윭??**?ㅼ쓬 ?섏씠吏遺??* 媛?몄삩???щ씪吏?移대뱶?????뚯븘?⑤떎).

**鍮꾩슜**: 移몃컲 泥대쪟 以?3遺꾨쭏??invoke 2??+ **?ъ슜?먭? 紐낆떆?곸쑝濡?濡쒕뱶??移대뱶 ?뚯떎**(5嫄댁뵫 3?섏씠吏 = 15??.
**?섏젙**: ?대쭅 ?쒓굅(蹂?대뒗 `useKanbanMutations` 媛 ?숆? ?⑥튂+?뺥솗 invalidate 濡??대? 泥섎━) ?먮뒗 異붽? 濡쒕뱶 ?곹깭?먯꽌 `refetchInterval` ???덈떎.

### P2-3. 湲됱뿬 ?몄쭛 1??= 湲됱뿬 ???섏씠吏 ?ъ“??+ ?먭? ?ъ쭛怨?`pages/projectDetail/salary/SalaryManagementPage.jsx:135-136`. `projectKeys.salary(project_id)` 瑜?page ?놁씠 遺瑜대㈃ **?꾨━?쎌뒪**(`utils/queryKey/projectKeys.js:91-93`)??罹먯떆??紐⑤뱺 ?섏씠吏媛 ?ъ“?뚮릺怨? `projectKeys.cost` ??KVS 10遺?罹먯떆濡?蹂댄샇?섎뒗 媛??臾닿굅???먭? 吏묎퀎瑜?踰꾨┛?? staleTime ???놁쑝??`getUser` 10???⑥씠釉?P1-4)源뚯? ?곕씪?⑤떎.
**鍮꾩슜**: ? 1媛??뺤젙 = 20+ invoke. 10嫄??몄쭛 = ?먭? ?ъ쭛怨?10??
**?섏젙**: ?대떦 ?됰쭔 `setQueryData` ?⑥튂, cost ??`refetchType:'none'`.

### P2-4. `UserPage` ??`userKeys.all` 4????臾닿???荑쇰━源뚯? ?ъ“??`backoffice/page/user/UserPage.jsx:204,215,224,236`. `utils/queryKey/userKeys.js:2-12` 湲곗? `all = ["users"]` 媛 `list`/`meta`/`failList`/`findUser` 瑜?**?꾨?** ??뒗?? ???섏씠吏??留덉슫?몃맂 ?섏쐞 荑쇰━??3媛쒕떎.
**鍮꾩슜**: ?ъ슜??1紐??깅줉(204)쨌?섏젙(215) 1?뚮떦 **3 invoke** ??洹몄쨷 `getAllFailList`(?묒? ?낅줈???ㅽ뙣 紐⑸줉)???깅줉/?섏젙怨?臾닿??섎?濡?**?됰룞 1?뚮떦 1 invoke 媛 ?쒖닔 ??퉬**.
**?섏젙**: ?깅줉/?섏젙/??젣??`userKeys.lists()` + `userKeys.meta()` 留? ?낅줈??224)쨌?ㅽ뙣紐⑸줉(236)?먯꽌留?`failList()`.

### P2-5. ?뚰겕濡쒓렇 ?쒕옒洹???μ씠 ???꾩껜 ?ъ“??(罹먯떆 ?⑥튂 洹쒖빟 ?꾨컲)
`pages/projectDetail/calender/worklogDrop.js:48` ??`invalidateQueries(calendarKeys.projectWorklogs({projectId,startDate,endDate}))` 諛붾줈 ?ㅼ쓬 以?`:51` ?먯꽌 ?대? `event.setExtendedProp('worklog', result)` 濡?濡쒖뺄 ?⑥튂瑜??쒕떎. `calender/ProjectCalender.jsx:279` ???숈씪.
**鍮꾩슜**: ?쒕옒洹?1嫄대떦 `getProjectCalendarWorklog`(??踰붿쐞 JQL + ?뚰겕濡쒓렇 ?뺤옣) 1?? 10嫄??щ같移?= 10?? ?몃뜳??吏?곗쑝濡???`started` 媛 ?뚯븘? ?대깽?멸? ?먯쐞移섎줈 ????뚭? 由ъ뒪???숇컲.

### P2-6. `staleTime` 誘몄꽕??8媛???李??ъ빱??蹂듦?쨌?щ쭏?댄듃留덈떎 ?ъ“???꾩뿭 湲곕낯媛믪씠 `staleTime:0` + `refetchOnWindowFocus:true` ?대?濡??꾩젣 (a)) ?꾨옒??**?ㅻⅨ 李쎌쓣 遊ㅻ떎媛 ?뚯븘???뚮쭏??* ?ъ“?뚮맂??

| ?꾩튂 | resolver |
|---|---|
| `backoffice/page/user/UserPage.jsx:137-143` | `getAllFailList` |
| `backoffice/page/user/UserPage.jsx:145-150` | `getUserMetaCount` |
| `backoffice/page/projectStatus/ProjectStatusPage.jsx:28-38` | `getProjectStatusList` |
| `backoffice/page/projectStatus/ProjectStatusPage.jsx:40-47` | `getStatusLink` |
| `pages/myWork/myProject/useMyProjectList.js:16-23` | `getMyProjectList` |
| `pages/projectDetail/dashboard/summary/SummaryPanel.jsx:15-20` | `getSummaryData` |
| `pages/projectDetail/dashboard/DashboardPage.jsx:52-55` | `getChartInfo` |
| `pages/projectDetail/issue/ProjectIssuePanel.jsx:48-51` | `getSettingData` (??P2-7) |
| `pages/projectDetail/salary/SalaryManagementPage.jsx:74-78`, `user/ProjectUserPanel.jsx:70-74`, `analysisReport/resource/hooks/useProjectResourceMembers.js:87-102,131-144` | 紐⑸줉/`getUser` |

?뺤젣 ?낅뱾? ?대? 5遺꾩쓣 以??`useSkillList.js:44`, `useRoleList.js:45`, `usePublicHolidayList.js:44`, `usePermissionList.js:58`) ???꾨쭔 ?꾨씫?대떎. `/myWork` ??湲곕낯 吏꾩엯 ?쇱슦?몃씪 ?쇱슦?몃? ?ㅺ컝 ?뚮쭏???꾨줈?앺듃 紐⑸줉??留ㅻ쾲 ?ㅼ떆 諛쏄퀬, 洹?寃곌낵媛 ?뚰겕濡쒓렇 ?섏튂 泥댁씤(P1-9)???낃뎄??

### P2-7. `settingKeys.detail()` ?섎굹??staleTime ??5媛吏 + queryFn 3踰?`getSettingData` ??17媛쒖냼?먯꽌 ?몄텧?섏?留??꾨? 媛숈? ??`settingKeys.detail()` ?대씪 dedup ? ?뺤긽?대떎. 洹몃윴??**愿痢≪옄蹂?staleTime ???쒓컖媛?*?대떎 ??30遺?`myWork/WorklogPage.jsx:150`, `myPage/MyPage.jsx:115`, `projectDetail/{assignment,gantt,taskHistory,work,calender}`, `resource/*`), 10遺?`backoffice/page/setting/SettingPage.jsx:26`, `MonthMmSummary.jsx:41`, `hooks/useSalaryPolicy.js:63`, `IssueAnalysisPage.jsx:31`, `useProjectResourceMembers.js:74`), **臾댁꽕??1嫄?*(`projectDetail/issue/ProjectIssuePanel.jsx:48-51`).

**鍮꾩슜**: React Query ??stale ?먯젙? 愿痢≪옄 ?⑥쐞????**臾댁꽕??愿痢≪옄媛 留덉슫?몃맆 ?뚮쭏??臾댁“嫄??ъ“??*?섍퀬, 洹?寃곌낵媛 怨듭쑀 罹먯떆瑜?媛깆떊?쒕떎. 利??묒뾽愿由?紐⑸줉) ??뿉 ?ㅼ뼱媛??뚮쭏??`getSettingData` 1?뚭? 異붽??쒕떎. 留뚮즺 ?쒖젏??留덉슫???쒖꽌??醫뚯슦??鍮꾧껐?뺤쟻?대떎.

queryFn ??3踰뚯씠??**??λ릺??shape ??媛덈┛??* ??`SettingPage.jsx:16-27` ? `const {success, ...setting} = result` 濡?success 瑜?踰쀪린怨? `WorklogPage.jsx:144-152`쨌`MonthMmSummary.jsx:38-42` ??envelope ?듭㎏濡??ｋ뒗?? ?꾩옱???뚮퉬遺媛 ?꾨? 猷⑦듃??`hourRate` 留??쎌뼱 **?곗뿰??* ?숈옉?쒕떎.
**?섏젙**: `useSettingData()` 怨듭슜 ??1媛쒕줈 ?듯빀.

### P2-8. ? 遺꾩꽍 ??씠 媛숈? ?꾩껜 吏묎퀎瑜???踰??뚮━怨? 異?踰꾪듉 ?대┃留덈떎 ?ㅼ떆 ?뚮┛??`pages/resource/teamAnalytics/charts/TeamCompareBar.jsx:74-85` 媛 ?낆씠 ?대? 怨꾩궛????`metrics`(`hooks/useTeamAnalyticsData.js:153-170`)瑜????곌퀬 `teamComparison(...)` ???몄텧?섎뒗?? ???⑥닔媛 ?대??먯꽌 **`teamMetricsByTeam` ???듭㎏濡??ㅼ떆 遺瑜몃떎**(`utils/team/teamMetrics.js:430-435`).
**鍮꾩슜**: ??吏꾩엯 1?뚮떦 `teamMetricsByTeam` **2???ㅽ뻾**(媛곴컖 `誇(projects 횞 members)` ?쒗쉶 + `aggregateByTeam` 2??+ `utilizationPeople` ?꾨웾 map). `axis` 媛 deps ???덉뼱 **異?踰꾪듉(媛?숇쪧/怨듭닔/吏꾩쿃瑜??멸굔鍮? ?대┃ 1?뚮떦 ?꾩껜 吏묎퀎媛 ?듭㎏濡??ъ떎??*?쒕떎 ???ㅼ젣濡?諛붾뚮뒗 嫄??뺣젹 湲곗?怨?topN ?덈떒肉?`teamMetrics.js:457-494`).
**?섏젙**: `teamComparison` ??異?臾닿? 遺遺?= `teamMetricsByTeam`)怨?異??섏〈 遺遺??뺣젹+topN+'湲고?')?쇰줈 遺꾨━?섍퀬 ?욎そ? ?낆쓽 `metrics` ?ъ궗??

### P2-9. 媛꾪듃 ?곗씠??濡쒕뱶媛 **?쒕쾭媛 ?곗????딅뒗 媛?*??吏곷젹濡?留됲? ?덈떎
`pages/projectDetail/gantt/useGanttData.js:18-33` ??`coworkerFieldId` 荑쇰━媛 `isSuccess` ???뚭퉴吏 蹂?荑쇰━媛 `enabled:false`. 洹몃윴??`src/resolver/gantt/GanttService.js:56` ? `({projectId, coworkerFieldId} = {})` 濡?援ъ“遺꾪빐留??섍퀬 **蹂몃Ц ?대뵒?쒕룄 ?곗? ?딅뒗??*(?꾩껜 ?뚯씪 grep 寃곌낵 ?쒓렇?덉쿂/二쇱꽍 2嫄대퓧, "??而ㅼ뒪??꾨뱶 id 議곕떖 遺덊븘?? 二쇱꽍 議댁옱).
**鍮꾩슜**: 媛꾪듃쨌?몃━ 泥?濡쒕뱶媛 `getCustomFieldId`(?대??곸쑝濡?`view.getContext()` ??`constants/customField.js:4`) 釉뚮━吏 ?뺣났 1?뚮? 湲곕떎由??ㅼ뿉???쒖옉?섎뒗 **遺덊븘?뷀븳 吏곷젹 ?뚰꽣??*. 寃뚮떎媛 媛숈? `view.getContext()` 寃곌낵媛 `forgeContextKeys.current()`(`ProjectDetailPage.jsx:29`, staleTime Infinity)? `jiraKeys.coworkerField()` **???ㅼ뿉 以묐났 罹먯떆**?쒕떎(`calender/useProjectCalender.js:9` ?????ㅻⅨ `calendarKeys.coworkerField()` ??3踰?.

### P2-10. ?몃━ ???꾨웾??memo ?놁씠 ?몃씪???대줈? 5媛쒖뵫 諛쏅뒗??`pages/projectDetail/work/TreeStructurePanel.jsx:194-213` ??`rows.map` ?덉뿉??`onToggle`/`onSelect`/`onDragStart`/`onDragOver`/`onDrop` 5媛쒕? ?꾨? ?몃씪???앹꽦. `TreeNodeRow`(`:251`)??`React.memo` 媛 ?꾨땲怨? `handleDragOver`(`:67-73`)??dragover ?대깽?몃쭏??`setDropTargetId(id)` 瑜??몄텧?쒕떎.
**鍮꾩슜**: ?쒕옒洹몃줈 ???섎굹瑜?吏?섏튌 ?뚮쭏??**媛?????꾨웾 ?щ젋??*(500?됱씠硫?500 횞 Tooltip/Avatar/Icon ?몃━ ?ъ깮??. 寃????湲?먃룸끂???좏깮???숈씪.

### P2-11. 媛꾪듃 ?몄뒪?몄뿉 MutationObserver 2媛쒓? 留?DOM 蹂寃쎈쭏???꾩껜 ?ㅼ쐲
`pages/projectDetail/gantt/GanttChart.jsx:436-468`(placeholder ?대옒?? ? `:475-529`(?대뜑 ?대옒??. 媛곴컖 `mo.observe(host, {childList:true, subtree:true})` 濡?嫄몃젮 `host.querySelectorAll('.wx-bar[data-task-id]')` ?꾨웾 ?쒗쉶 + ?대옒???좉????섍퀬, ??踰덉㎏??`.wx-grid .wx-body .wx-row[data-id]` 源뚯? 異붽? ?쒗쉶?섎ŉ ?됰쭏??理쒕? 4媛??대옒?ㅻ? ?좉??쒕떎. 留덉슫??`tasks` 蹂寃???**媛곴컖 30?꾨젅??rAF ?뚰봽**(`:457-461`, `:518-522`)媛 遺숇뒗??
**鍮꾩슜**: SVAR ???ㅽ겕濡?以????됱쓣 ?ъ깮?깊븯誘濡??ㅽ겕濡??쒕옒洹?1?뚯뿉 ???듭?踰꾧? 怨꾩냽 源⑥뼱?쒕떎. 200??湲곗? **?꾨젅?꾨떦 ~1,800???대옒???곗궛**.
**?섏젙**: ???댄럺?몃? ?섎굹濡??⑹퀜 ?ㅼ쐲 1?뚮줈 以꾩씠怨?`apply` 瑜?rAF 肄붿뼹?덉뒪.

### P2-12. ?몃젰 遺꾩꽍 ??酉??좉? 1?뚮떦 500???꾨웾 ?ы럹移?`pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js:87-102`(staleTime ?놁쓬 + `keepPreviousData:true` = v5 臾댄슚) / `:131-144`(N+1 `getUser`, staleTime ?놁쓬). `resourceMembersAdapter.js:62-63` ??`pagesize = isFullFetch ? 500 : 10` ??荑쇰━ ?ㅼ뿉 ?ㅼ뼱媛꾨떎(`:88-92`).
**鍮꾩슜**: ?몃퀎?뷀?蹂??좉? 3??= `findProjectusersByProjectId` **6 invoke**(洹몄쨷 3?뚮뒗 500???섏씠濡쒕뱶) + ?몃퀎 蹂듦?留덈떎 `getUser` 100??猷⑦봽 ?ъ떎?? alt-tab 蹂듦?留뚯쑝濡쒕룄 ?숈씪 鍮꾩슜 ?щ컻??
**?섏젙**: ??荑쇰━??staleTime 5~10遺? `placeholderData: keepPreviousData` 濡?援먯껜. 500?됱씠 10?됱쓽 ?곸쐞吏묓빀?대?濡?1???섏튂 ???대씪 ?щ씪?댁떛??媛??

### P2-13. 留덉씠?섏씠吏 ?꾨줈?앺듃 移대뱶 1?대┃ = 臾닿굅??JQL invoke 2嫄?`pages/myPage/MyPage.jsx:67,85-104` + `sections/MyProjectsPanel.jsx:94-99,159` ??移대뱶 ?대┃??利됱떆 `selectedProjectIds` 瑜?媛깆떊 ??`myPageKeys.issues(...)`(`getMyIssueList`) + `myPageKeys.worklogs(...)`(`getMyCalendarWorklog`) ???ㅺ? ?숈떆??諛붾먮떎.
**鍮꾩슜**: 移대뱶 ?대┃ 1?뚮떦 **invoke 2嫄?*. ?꾨줈?앺듃 10媛쒕? ?섎굹??怨⑤씪 ?ㅼ퐫?꾨? 醫곹엳硫?**20嫄?*. `keepPreviousData` ??源쒕묀?꾨쭔 留됯퀬 ?붿껌? 洹몃?濡??섍컙?? ?좏깮 議고빀留덈떎 ??罹먯떆 ?뷀듃由ш? ?볦씤??
**?섏젙**: `normalizedProjectIds` ??200~300ms ?붾컮?댁뒪, ?먮뒗 紐낆떆??"?곸슜" 踰꾪듉.

### P2-14. `getProjectUserWithScroll` ??罹먯떆 怨꾩링 ?놁씠 ?몄쭛 ???뚮쭏???ы샇異?`pages/projectDetail/user/ProjectIssueAssignSelect.jsx:47,58-63` ??React Query ???`useState` + 留덉슫???댄럺?몃줈 `invoke`. ?몄텧 吏?먯? `issue/ProjectIssueTable.jsx:290`(?대떦??/`:314`(?묒뾽?? ??`InlineEdit editView`(?몄쭛 以묒뿉留??뚮뜑 = ???뚮쭏????留덉슫?? ? `gantt/GanttUserModal.jsx:78`(?곸쐞媛 `key={task.id}` 濡?媛뺤젣 ?щ쭏?댄듃).
**鍮꾩슜**: ?/紐⑤떖 1???ㅽ뵂 = invoke 1?? 罹먯떆 0. **20???대떦??吏??= ?숈씪 泥??섏씠吏 20??invoke.** ?대떦???묒뾽?먮㈃ 2諛? (寃???낅젰 ?먯껜??400ms ?붾컮?댁뒪 ?뺤긽)

### P2-15. ?곸꽭 ?쒕줈???뺤옣 ??媛숈? 李⑦듃/?뚯씠釉붿씠 2踰?留덉슫??`pages/projectDetail/analysisReport/issue/IssueAnalysisPage.jsx:99` 媛 ?쒕줈?대? ?レ? ?딄퀬 ?뺤옣 ?ы꽭???대ŉ, `components/drawer/SideDrawer.jsx:100` ? `isOpen` ?대㈃ children ??怨꾩냽 留덉슫?명빐 ?붾떎 ??`IssueAnalysisChart` 媛 `:117` 怨?`:143` ?묒そ?? `WorklogDetailPanel` ??`:123` 怨?`:147` ?묒そ?? `analysisReport/resource/ResourceAnalysisPage.jsx:353-362`(?쒕줈?? / `:383-392`(?ы꽭) ?숈씪.
**鍮꾩슜**: ?붾㈃???섎굹留?蹂댁씠?붾뜲 ECharts ?몄뒪?댁뒪 2媛쒓? 珥덇린?붋룹옱?쒕줈??`notMerge={true}`) + ?뚰겕濡쒓렇 ?뚯씠釉???2踰? invoke ????怨듭쑀??異붽? ?놁쓬(?쒖닔 ?뚮뜑/GPU ??퉬).

### P2-16. ??쒕낫???쒕ぉ 蹂寃쎌씠 硫뷀? ?꾨웾 ?ъ“?????꾩젽 ?꾨웾 ?щ젅?댁븘??`pages/projectDetail/dashboard/DashboardPage.jsx:184-190` ??`updateChartTitle` 吏곹썑 `invalidateQueries(projectKeys.dashboardInfo)`. ?묐떟??`:58-72` ?댄럺?몃? ?ъ떎?됲빐 `items` 諛곗뿴???덈줈 ?앹꽦?섍퀬 `ReactGridLayout` ??6~12媛??꾩젽???щ같移섑븳?? ???쒕ぉ? ?대? ?먯뿉 ?덉쑝誘濡?`setQueryData` 濡?異⑸텇?섎떎. (P1-3 ??3以?留덉슫?몄? 怨깊빐吏꾨떎)

### P2-17. `SalaryCell` ??**?留덈떎** `useQuery` 瑜?留뚮뱺??`components/salary/SalaryCell.jsx:52` ??`const { policy, isLevelBand, isPolicyLoading } = useSalaryPolicy(responsePolicy);` 媛 而댄룷?뚰듃 理쒖긽?? `mode` 遺꾧린(`:54-58`)蹂대떎 **??*???덈떎. `hooks/useSalaryPolicy.js:53-64` ??`useQuery({queryKey: settingKeys.detail()})` ?대떎.

?ㅽ듃?뚰겕??dedupe ?섏?留?**QueryObserver ??? ?몄뒪?댁뒪留덈떎 ?앹꽦**?섍퀬, 洹??ㅺ? invalidate ?섎㈃ **??????숈떆??由щ젋??*?쒕떎. 寃뚮떎媛 `mode='plain'`/`'band'` ???뺤콉???꾪? ?곗? ?딄퀬 利됱떆 諛섑솚?섎뒗???낆? ?대? ?ㅽ뻾???ㅻ떎 ??`salary/SalaryManagementPage.jsx:234,265,284` 3怨녠낵 `backoffice/page/level/useLevelList.js:74-75` 2怨녹씠 ?꾨? `mode="plain"`/`"band"` ?? `responsePolicy` 瑜??섍꺼諛쏅뒗 寃쎌슦(`:75` ?곗꽑 ?곸슜)?먮룄 ?낆? 洹몃?濡??덈떎.

**鍮꾩슜 ?뺣웾**: 湲됱뿬愿由???50??횞 湲됱뿬 而щ읆 2媛?= **???붾㈃??QueryObserver 100媛?*. `settingKeys.detail()` invalidate(P2-3 ??湲됱뿬 ???寃쎈줈 ?ы븿) ??踰덉뿉 100媛?而댄룷?뚰듃媛 ?숈떆 由щ젋?? `backoffice/page/user/UserListPaging.jsx:92` ??媛숈? 援ъ“.
**?섏젙**: ?뺤콉????而⑦뀒?대꼫?먯꽌 1???쎌뼱 `policy` prop ?쇰줈 ?대젮蹂대궡怨?`SalaryCell` ? ?대? prop ?곗꽑), ? ?대? ?낆? ?대갚?쇰줈留? 理쒖냼??`mode !== 'policy'` 硫??낆쓣 ?吏 ?딄쾶 遺꾧린.

### P2-18. `DropdownJql` ???쒕∼?ㅼ슫??**?댁? ?딆븘??* 留덉슫??利됱떆 Jira REST 瑜?移쒕떎
`components/project/DropdownJql.jsx:61-69` ??`useEffect(() => { ... searchHook(searchTermDebounced) ... }, [searchTermDebounced])` ??**?대┝ ?щ? 媛?쒓? ?녿떎.** 留덉슫???쒖젏(`searchTermDebounced === ''`)?먮룄 ?ㅽ뻾?쒕떎. React Query 瑜??곗? ?딄퀬 濡쒖뺄 `useState` ??**罹먯떆???녿떎** ??媛숈? ?붾㈃???ㅼ떆 ?ㅼ뼱媛??뚮쭏??諛섎났.

`components/filter/ProjectFilter.jsx:135,141` ??`DropdownJql` ??2媛??뚮뜑?섎?濡?**?붾㈃??`getProjects` + `getUsersGroups` 2??*媛 ?ъ슜??議곗옉 ?꾩뿉 ?섍컙??
**鍮꾩슜 ?뺣웾**: `ProjectFilter` ?ъ슜泥?4怨?`IssueAnalysisTable.jsx:321`, `IssueAddModal.jsx:200`, `ProjectIssuePanel.jsx:151`, `TaskHistoryPage.jsx:100`) 횞 2 = 4?붾㈃ 紐⑤몢 諛⑸Ц ??**Jira REST 8??*, ?꾨? 議곗옉 ???꾨━?섏튂.
**?섏젙**: `DropdownMenu` ??`onOpenChange` 濡?理쒖큹 ?ㅽ뵂 ?쒖뿉留??섏튂?섍굅??`useQuery` + `enabled: isOpen` + `staleTime`.

### P2-19. `JiraUserSelect` ?????낅젰留덈떎 `invoke` (P1-8 怨?媛숈? 遺瑜?
`components/select/JiraUserSelect.jsx:99-113` ??`AsyncCreatableSelect` ??`loadOptions` ??react-select 媛 ?붾컮?댁뒪?섏? ?딆쑝誘濡??낅젰留덈떎 `invoke('searchJiraUsers')`. ?몃젰 異붽? 紐⑤떖 ?깆뿉???ъ슜.
**鍮꾩슜**: "源泥좎닔" ?낅젰 ???쒓? IME 議고빀 以묎컙 ?④퀎 ?ы븿 **8~11??invoke**(?붾컮?댁뒪 ??1??.
**?섏젙**: `loadOptions` 瑜??붾컮?댁뒪 ?섑븨?섍굅??`useDebounce(keyword, 300)` 湲곕컲?쇰줈 ?꾪솚. **媛숈? ?대뜑 ?덉뿉??洹쒖튃??媛덈┛??* ??`ProjectUserSelect.jsx:94`(1000ms), `DropdownJql.jsx:50`(500ms)? ?붾컮?댁뒪媛 ?덈떎.

### P2-20. `CardCollapseProvider` 而⑦뀓?ㅽ듃 媛믪씠 ?묎린 1?뚯뿉 ??移대뱶瑜?由щ젋?붿떆?⑤떎
`components/card/collapse/CardCollapseContext.jsx:58` ??`const api = useMemo(() => ({ state, toggle }), [state, toggle])`. `state` 媛 諛붾뚮㈃ ??媛앹껜 ??`useCardCollapse` ?뚮퉬??**?꾩썝**(移대뱶 + `BentoTile`) 由щ젋??
**鍮꾩슜**: ?꾩궗 ??쒕낫???꾩젽 10~15媛?湲곗? 移대뱶 1媛쒕? ?묒쓣 ??**~25媛?而댄룷?뚰듃 由щ젋??*(+ `:55` ???꾩뿭 resize ?붿뒪?⑥튂濡?李⑦듃 ?ъ륫??1??.
**?섏젙**: `state` ? `toggle` ??而⑦뀓?ㅽ듃 2媛쒕줈 遺꾨━?섍굅????됲꽣?뺤쑝濡?

### P2-21. `TaskHistory` ?뚯씠釉붿씠 React Query 諛붽묑 ??罹먯떆 0
`pages/projectDetail/taskHistory/TaskHistoryTable.jsx:39-45,57-87,90-93` ??`useState` 吏곸젒 愿由? 而ㅼ꽌??蹂닿??섏?留??묐떟? 踰꾨젮 **Next ??Prev ??Next = 3??異붽? ?붿껌**. ?뺤젣 `analysisReport/issue/IssueAnalysisTable.jsx:176-187` ? 而ㅼ꽌瑜?荑쇰━ ?ㅼ뿉 ?ｌ뼱 staleTime 5遺꾩쑝濡?Prev 媛 罹먯떆 ?덊듃?쒕떎 ??**?섎룄???⑦꽩??諛붾줈 ?놁뿉 ?덈떎**.

---

## P3 ???ъ냼

| # | ?꾩튂 | ?댁슜 |
|---|------|------|
| P3-1 | `pages/projectDetail/gantt/useGanttMutations.js:540` | 怨꾪쉷MD ?????`executeRequest('getIssue', {fields:'timetracking'})` ?④굔 GET. MD ?몄쭛 1??= 沅뚰븳議고쉶 + getIssue + updateIssue + (P1-5?? ?꾨웾 ?ъ“??|
| P3-2 | `pages/projectDetail/work/TreeDetailPanel.jsx:501,534-541` | `splitDependencies(ganttLinks, node.id)` ? `nodesById.forEach(...)` 媛 useMemo ?놁씠 留??뚮뜑 O(?꾩껜 ?몃뱶) ?ㅼ틪. ?곸쐞媛 寃?됀룸뱶?섍렇?ㅻ쾭留덈떎 ?щ젋?붾릺誘濡?怨깊빐吏꾨떎 |
| P3-3 | `pages/projectDetail/gantt/GanttChart.jsx:103-120` | `mousemove` 留덈떎 `setTip({x,y,task})` state 媛깆떊(珥덈떦 ~60??. 蹂꾨룄 而댄룷?뚰듃 寃⑸━???섎룄?곸씠??媛숈? task쨌洹쇱젒 醫뚰몴硫??ㅽ궢 媛??|
| P3-4 | `useProjectResourceMembers.js:170`, `cost/CostByIssueTable.jsx:39`, `cost/CostByIssueChart.jsx:18`, `cost/CostByRoleLevel.jsx:61` | `data?.x ?? {}` / `?? []` 媛 濡쒕뵫 以?**留??뚮뜑 ??李몄“** ??李⑦듃 option useMemo 臾댄슚????`notMerge={true}` 濡?**李⑦듃 ?꾩껜 ?щ뱶濡쒖슦** |
| P3-5 | `pages/projectDetail/dashboard/ChartTemplate.js:128-131` | ?뚯씠釉붿씠 ?ロ? ?덉뼱??`isSwitch` false, `:279`) 1000+ ??媛앹껜瑜?留뚮뱾怨? `.sort()` 媛 React Query 罹먯떆 諛곗뿴??**?쒖옄由?蹂??*?쒕떎 |
| P3-6 | `ChartTemplate.js:104,165,248` | head memo ?섏〈?깆뿉 `t` ?꾨씫, option ?섏〈?깆뿉 `t` ?꾨씫(濡쒖????꾪솚 ???쇰꺼 stale), filter memo ??`teamNote`(留??뚮뜑 ??JSX, `:195-200`)???섏〈??**?곴뎄 誘몄뒪** |
| P3-7 | `dashboard/DashboardPage.jsx:255,280-282` | ?몃씪??`layout={items.map(...)}` + 移대뱶???몃씪???붿궡??3媛?12?꾩젽 = 36 ?대줈?/?뚮뜑) |
| P3-8 | `dashboard/DashboardPage.jsx:159,177` | `projectKeys.dashboardData` 瑜?臾댄슚?뷀븯?붾뜲 ???ㅻ? ?깅줉??`useQuery` 媛 ?녿떎(`projectKeys.js:65` ?뺤쓽, 李몄“????2以꾨퓧). 臾댄빐?섏?留??ㅼ젣 ?꾩젽 ?곗씠?곌? `dashboardItem` ?ㅼ뿉 ?덈떎???ъ떎??媛由곕떎 |
| P3-9 | `pages/projectDetail/issue/IssueAddModal.jsx:59` | `rows` 誘몃찓紐?+ `rowsPerPage=100` + `maxResults:100`. 泥댄겕諛뺤뒪 20踰?= 100??媛앹껜 20???ш뎄異???,000 ?섎━癒쇳듃). `:128-141` 寃?됱? 300ms ?붾컮?댁뒪媛 ?덉쑝??React Query 諛뽰씠??紐⑤떖 ?ъ삤????罹먯떆 0 |
| P3-10 | `pages/projectDetail/user/ProjectUserPanel.jsx:237,255` | 媛숈? ?꾨━?쎌뒪 ??`projectKeys.users`)瑜?onSuccess/onSettled ?먯꽌 **2??* 臾댄슚????`:216` ???숆? ?⑥튂媛 利됱떆 ?먭린 |
| P3-11 | `pages/projectDetail/user/ProjectTeamBar.jsx:100` | `onDone={() => refetch()}` ?몃뜲 `hooks/useProjectTeams.js:71` ???대? invalidate ?쒕떎 ?????1?뚮떦 `getProjectTeams` **2??* |
| P3-12 | `pages/projectDetail/issue/ProjectIssueTable.jsx:548-553,150-163` | memo ?섏〈?깆쓽 `jiraPermissions` 媛 `utils/jiraApi/useJiraEditGuards.js:116` `return data ?? mapPermissions(null)` 濡?**濡쒕뵫 以?留??뚮뜑 ??媛앹껜** ??????理쒕? 50) 횞 InlineEdit 4媛??몃━ ?ш뎄異? `head` ??誘몃찓紐?|
| P3-13 | `pages/projectDetail/issue/ProjectIssueTable.jsx:193-199` | ? ?몃씪???몄쭛 1?뚮떦 write + `getIssue(*all)` + `getBulkUser` = **3 ?뺣났**. 20???쇨큵 ?몄쭛 = ~60 ?붿껌 (罹먯떆 ?⑥튂 ?꾨왂 ?먯껜??洹쒖빟 以?? |
| P3-14 | `analysisReport/team/ProjectTeamAnalysisPage.jsx:94-97` + `resource/ResourceAnalysisTeamTable.jsx:67-70` | 媛숈? `members` 諛곗뿴濡?`aggregateByTeam` ??**媛곴컖** ?섑뻾(理쒕? 500??횞 2). ?섏씠吏 二쇱꽍 `:90-93` ??以묐났???몄??섍퀬 ?덈떎 |
| P3-15 | `progress/ProgressBars.jsx:30,54`, `progress/ProgressStatusDistribution.jsx:31,65` | 留??뚮뜑 ?덈줈 留뚮뱺 諛곗뿴??useMemo ?섏〈?깆뿉 ?ｌ뼱 memo 媛 ?덈? ?덊듃?섏? ?딆쓬(6??3?됱씠??鍮꾩슜? 誘몃?) |
| P3-16 | `analysisReport/resource/ResourceAnalysisPage.jsx:41-42` | `getDefaultDateRange()` 瑜?留??뚮뜑 ?몄텧(?뺤젣 `ProjectTeamAnalysisPage.jsx:56` ? `useMemo(...,[])` 濡??щ컮由? |
| P3-17 | `calender/ProjectCalender.jsx:226,235,247,266,336` | FullCalendar ???몃씪???대줈? 5媛????뚰겕濡쒓렇 紐⑤떖 媛쒗룓留뚯쑝濡??듭뀡 ?뗭씠 諛붾뚯뼱 `eventContent` 媛 ??? ?ъ떎??`dayMaxEvents=3` 횞 ~35?) |
| P3-18 | `pages/portfolio/PortfolioDashboardPage.jsx:196-200` | `signalBands` 媛 ?뚮뜑 蹂몃Ц?먯꽌 留ㅻ쾲 ??媛앹껜 ??`PortfolioTsrSignalTable.jsx:69` ??`signals` useMemo 媛 ??긽 臾댄슚?붾릺??`tsrSignals` + `signalLevelsForSort` 瑜?2횞N log N ???ъ떎?? P2-1 ???대쭅 44?뚯? 怨깊빐吏꾨떎 |
| P3-19 | `pages/portfolio/utils/portfolioAggregate.js:73-79,111-118` | `keys.map(k => selected.map(p => members.filter(...).length))` = `O(keys 횞 projects 횞 members)`. `salaryHistogram` ??踰꾪궥留덈떎 `Array.from(seen.values()).filter(...)` 濡??꾩껜 諛곗뿴 ?ъ깮?? ?몄텧遺媛 ?꾨? `useMemo` ??鍮덈룄????떎 |
| P3-20 | `pages/projectKanban/ProjectKanbanBoard.jsx:205-227` | `configMap` ??`useMemo` ?놁씠 ?몃씪????`<Kanban configMap={configMap}>`(`:259`)??留ㅻ쾲 ??李몄“ ??移대뱶 N???щ젋?? 媛숈? ?뚯씪???ㅻⅨ ?몃뱾??7媛쒕뒗 ?꾨? `useCallback` ?몃뜲 ?ш린留?鍮좎죱??|
| P3-21 | `components/select/ProjectUserSelect.jsx:152`, `ProjectIssueSelect.jsx:172` | `components={{ MenuList: ({children}) => {...} }}` 濡?**?뚮뜑 蹂몃Ц?먯꽌 而댄룷?뚰듃瑜??뺤쓽**?쒕떎(?대???`useRef`/`useLayoutEffect` 蹂댁쑀). 遺紐??뚮뜑留덈떎 而댄룷?뚰듃 identity 媛 諛붾뚯뼱 react-select 媛 MenuList 瑜?**留ㅻ쾲 ?몃쭏?댄듃/由щ쭏?댄듃** ???ㅽ겕濡??꾩튂 ?먯떎(洹몃옒??`scrollPosRef` 濡??섎룞 蹂듭썝?섎뒗 肄붾뱶媛 ?덈떎). ?몄씠?ㅽ똿?섎㈃ 蹂듭썝 肄붾뱶媛 遺덊븘?뷀빐吏꾨떎 |
| P3-22 | `components/table/useStableColumnWidths.js:41-84` | `useLayoutEffect` ???섏〈??諛곗뿴???녿떎(?섎룄??. ?뺤긽 寃쎈줈??泥??ㅻ뜲?댄꽣 ?섏씤?몄뿉???숆껐??`:43` 媛?쒕줈 O(1) ?댁?留? `toPercentWidths` 媛 `null` ??諛섑솚?섎뒗 寃쎌슦(`:55` ??珥앺빀 0 = `display:none`)?먮뒗 **?곸썝???숆껐?섏? ?딆븘** 留??뚮뜑 `getBoundingClientRect()` 瑜?而щ읆 ??2???몄텧?쒕떎. **?④꺼吏???룹젒??移대뱶 ?덉쓽 ??*媛 ?ш린 ?대떦?쒕떎(P1-2 ??`ResourcePage` ?④? ??낵 怨깊빐吏꾨떎). ???ㅽ뙣 ???쒓렇?덉쿂瑜?"痢≪젙 遺덇?"濡?湲곕줉???ъ떆?꾨? 留됱쓣 寃?|
| P3-23 | `backoffice/page/user/UserPage.jsx:198,207` | `UserRegistrationModal`/`UserEditModal` ??`isOpen=false` ?щ룄 ??긽 ?뚮뜑?섍퀬 ??紐⑤떖??理쒖긽?⑥뿉??`usePermissionCatalog()` ?몄텧(`hooks/usePermissionCatalog.js:32-41` ??`enabled` 媛???놁쓬) ??**?섏씠吏 吏꾩엯 1?뚮떦 `getPermissionCatalog` 1 invoke ??퉬** |
| P3-24 | `pages/myWork/myProject/MyProjectList.jsx:95-97` | `projects.filter(...)` 媛 useMemo ?놁씠 留??뚮뜑, `searchQuery.toLowerCase()` 瑜???ぉ留덈떎 ?ъ깮??|
| P3-25 | `utils/jiraApi/issue/getJqlIssue.js:33` ??`pages/myWork/MyLogSummary.jsx:32` | 媛쒖닔留??꾩슂?쒕뜲 `maxResults`/`fields` 誘몄??뺤쑝濡?湲곕낯 50嫄댁쓣 諛쏆븘 `.length` 瑜??대떎 ??**51嫄??댁긽?대㈃ KPI ?レ옄媛 50?먯꽌 硫덉텣??*(?뺥솗??臾몄젣 寃명븿) |
| P3-26 | `pages/project/modal/ProjectModal.jsx:99-107,129` | `staleTime:0` ?쇰줈 ???뚮쭏??`findProjectById` ?ъ“???몄쭛 紐⑤떖?대씪 ?섎룄?????덉쓬). `:129` `Promise.all(userSet.values().map(...))` ??Set ?댄꽣?덉씠?곗뿉 `.map` ??嫄곕뒗 ?뺥깭(ES2025 Iterator Helpers)???고??꾩뿉 ?곕씪 throw 媛?????깅뒫 異뺤? ?꾨땲??湲곕줉 |
| P3-27 | `pages/myPage/hooks/useMyPermissionMatrix.js:34-59` | `sections`(以묒꺽 map) + `all`(flatMap) + `summary`(filter 3??媛 留??뚮뜑 ?ㅽ뻾?섍퀬 ??`sections` 諛곗뿴??諛섑솚??`MyPermissionSection` ????긽 由щ젋?? 移댄깉濡쒓렇 14媛??섏??대씪 ?ㅻ퉬?⑹? ?묐떎 |
| P3-28 | `pages/resource/assignment/projects/ProjectCardList.jsx:64` | `cards.map(...)` ??硫붾え 諛?+ `ProjectCard` 誘몃찓紐???蹂대뱶 由щ젋?붾쭏????移대뱶 ?щ젋???섏떗 ???곹븳) |
| P3-29 | `keepPreviousData: true` **7怨?* ??`useProjectResourceMembers.js:101,159`, `cost/useProjectCostSummary.js:43`, `dashboard/summary/SummaryPanel.jsx:19`, `progress/ProgressPage.jsx:42`, `salary/SalaryManagementPage.jsx:77`, `user/ProjectUserPanel.jsx:73` | `@tanstack/react-query@5.95.2` ?먯꽌 ??**遺덈━???듭뀡? ?쒓굅**?먮떎(v5??`placeholderData: keepPreviousData` ?⑥닔 ?뺥깭留??좏슚 ??`useWorkListQueries.js:119`쨌`useLevelList.js:56` ???щ컮瑜???. ?ㅽ듃?뚰겕 ??퉬???놁쑝???섏씠吏 ?꾪솚留덈떎 ?뚯씠釉붿씠 ?ㅼ펷?덊넠?쇰줈 鍮꾩썙吏怨?10??湲됱뿬??InlineEdit+Select ?ы븿 ~60?)???꾨웾 ?щ쭏?댄듃?쒕떎 |
| P3-30 | `analysisReport/resource/hooks/useProjectResourceMembers.js:87`, `salary/SalaryManagementPage.jsx:74` | `enabled` ?꾨씫(?뺤젣 荑쇰━ `:158` ?먮뒗 ?덉쓬) |
| P3-31 | `pages/resource/overview/ResourceOverviewTable.jsx:41`, `assignment/people/CompanyResourceTable.jsx:47`, `organization/OrganizationTab.jsx:279`, `myPage/sections/MyIssuesPanel.jsx:102` | `head` 媛앹껜媛 留??뚮뜑 ?덈줈 ?앹꽦 ??`CommonTable`??TableSurface` ??而щ읆 ???숆껐 怨꾩륫???ъ떎?됰맆 ?ъ? |
| P3-32 | `pages/projectDetail/user/IssueAssignSelect.jsx` | **?곕뱶肄붾뱶** ??`static/ui/src` ?꾩뿭 import 0嫄댁씠怨? 鍮꾨룞湲??꾨땶 `Select` ??`loadOptions`/`defaultOptions`(`:51-52`)瑜??섍꺼 諛곗꽑?대룄 ?듭뀡?????щ떎. ?댁븘 ?덈뒗 寃??寃쎈줈濡??ㅼ씤?섏? ?딅룄濡?湲곕줉 |
| P3-33 | `utils/useRoleLevelPermissions.js:10-54` vs `:56-84` | `useRoleLevelPermissions` ? `useRoleLevel` ??roles/levels 荑쇰━瑜?**湲??洹몃?濡?蹂듬텤**?덈떎. 荑쇰━?ㅺ? 媛숈븘 ?ㅽ듃?뚰겕??怨듭쑀?섏?留??좎?蹂댁닔 ?댁쨷?붿씠怨? `enabled` 媛?쒓? ?놁뼱 `components/search/UserSearchFilter.jsx:54` 泥섎읆 ?꾪꽣 UI 媛 蹂댁씠湲곕쭔 ?섎㈃ invoke 3?뚭? ?섍컙??|
| P3-34 | `components/chart/echart/ThemedECharts.js` ?뚮퉬泥??꾨컲 | `echarts-for-react` ??`node_modules/echarts-for-react/lib/core.js:52` ?먯꽌 `isEqual(pick(props, ['option', ...]))` 濡?**源딆? 鍮꾧탳**瑜??쒕떎. 媛믪씠 媛숈쑝硫?`setOption` ? 嫄대꼫?곗?留?**series ?곗씠??諛곗뿴 ?꾩껜瑜?留??뚮뜑 ?쒗쉶**?쒕떎. `option` ???몃씪??議곕┰???섍린???뚮퉬泥섍? ?⑥븘 ?덉쑝硫?洹몃쭔??怨깊빐吏꾨떎(??ㅼ닔??硫붾え???덉쓬 ???뚰넻怨쇈?李몄“) |
| P3-35 | `polling/JobPollingManager.jsx:24` | `const { jobIds, forgetJob, cleanupJob, init } = useJobStore();` ????됲꽣 ?놁씠 ?ㅽ넗???꾩껜 援щ룆. ??猷⑦듃???곸떆 留덉슫?몃릺吏留?`useJobStore` ?곹깭媛 `jobIds` ?섎굹肉먯씠???ㅼ넀?대뒗 誘몃??섎떎. **怨듭슜 ?덉씠?댁뿉????됲꽣 ?놁씠 援щ룆?섎뒗 ?좎씪??吏??*?대씪 湲곕줉留??④릿??|
| P3-36 | `components/table/TableSurface.jsx:47` | 濡쒕뵫 以?`buildSkeletonRows(head, skeletonRowCount)`(`skeletonRows.js:21`)媛 留??뚮뜑 ??諛곗뿴??留뚮뱾??`adaptedRows` 硫붾え瑜?**?뺤젙?곸쑝濡?* 臾댄슚?뷀븳??P1-13 ??濡쒕뵫 援ш컙 鍮꾩슜) |

---

## ?듦낵 (?뺤씤?덇퀬 臾몄젣 ?놁쓬)

> 移⑤У = 誘멸?利??ㅻ룆??留됯린 ?꾪빐 紐낆떆?쒕떎.

| 異?| ?뺤씤 ?댁슜 | ?먯젙 |
|----|----------|------|
| **?뚮뜑 猷⑦봽 ??`invoke()` (吏꾩꽦 N+1)** | 582 ?뚯씪 ??踰붿쐞?먯꽌 `.map()`/`forEach` **?뚮뜑 猷⑦봽** ?덉쓽 `invoke`/`requestJira` **0嫄?*. P1-4 ??`getUser` ???꾨? queryFn ?대? 猷⑦봽(?섏젙 ??곸씠吏留??뚮뜑 猷⑦봽???꾨땲?? | **?듦낵** |
| **`requestJira` 寃쎈줈 吏묒쨷??* | ?꾨줎?몄쓽 Jira 吏곸젒 ?몄텧? `utils/jiraApi/requestJira.js:168` ?⑥씪 吏?먯쓣 ?듦낵?쒕떎. ?곕컻??`requestJira` ?몄텧 ?놁쓬 | **?듦낵** |
| **肄붾뱶 ?ㅽ뵆由ы똿 援ъ“** | `App.jsx` ?쇱슦??15媛?+ `constants/tabs.js` ??13媛?+ `ProjectWorkPanel.jsx` 酉?2媛쒓? `React.lazy`. 鍮뚮뱶 ?곗텧臾쇱뿉??**echarts(1,112KB 泥?겕)쨌xyflow쨌svar-gantt쨌exceljs쨌react-grid-layout쨌kanban-kit ??main ??0諛붿씠??* ?뺤씤 ??遺꾨━ ?먯껜???섎룄?濡??숈옉 以묒씠???덉쇅??P1-1 ???⑹뼱由? | **?듦낵** |
| **???쒖꽦-only ?뚮뜑** | `components/tabs/CommonTab.jsx:70-81` ???쒖꽦 ??1媛쒕쭔 ?뚮뜑 + Suspense/ChunkErrorBoundary 寃쎄퀎 ?뚯쑀. `MainPageTabs`/`ProjectDetailTabs` 媛 ?대? ?ъ슜 | **?듦낵** (?덉쇅 2嫄? P1-2 `ResourcePage`, `IssueAddModal`) |
| **?대쭅 諛깃렇?쇱슫???뺤?** | `pages/project/ProjectPage.jsx:30`(5遺?쨌`projectKanban/ProjectKanbanBoard.jsx:85`(3遺?? `refetchIntervalInBackground` 誘몄꽕????`query-core/queryObserver.js:215` ??`focusManager.isFocused()` 媛?쒕줈 諛깃렇?쇱슫????뿉???뺤?. `ProjectPage.jsx:31` ???대떦 ?듭뀡??**二쇱꽍 泥섎━**??寃껊룄 ?섎룄?? ????? `CommonTab` ???숈떆???댁븘 ?덉????딅떎 | **?듦낵** (?덉쇅: P1-7 `JobPollingManager` ??raw setInterval ?대씪 ??蹂댄샇 諛? |
| **紐⑤떖 ?곗씠???좊줈??* | `components/modal/CommonModal.jsx:26` ??`{isOpen && children}` ?쇰줈 寃뚯씠????`TeamSelect`쨌`ProjectUserPanel`쨌`ProjectIssuePanel`쨌`RequiredSkillEditor` ?깆씠 ?닿린 ?꾧퉴吏 留덉슫?????? `projectKanban/KanbanCard.jsx:188,194` 媛 移대뱶留덈떎 紐⑤떖 2媛쒕? ?뚮뜑?섏?留?媛숈? ?댁쑀濡?移대뱶??invoke 0 | **?듦낵** (?덉쇅: P3-23 `UserPage` ??紐⑤떖 2醫낆? `CommonModal` 諛뽰뿉???낆쓣 ?몄텧) |
| **`enabled` 媛??* | resource/portfolio/myPage ???낆씠 沅뚰븳쨌?앸퀎??媛??蹂댁쑀(`canRead`, `canReadReport`, `!!accountId && projectIds.length>0`, `!!teamKey`, `!!projectId && enabled`). myWork/backoffice ??`useMyWorklogList.js:28`, `useMyIssueTable.js:23`, `WorklogPage.jsx:104,134`, `ProjectDetailDrawer.jsx:85,104,114`, `useSkillQuickAddModal.js:31`, `useUserEditModal.js:86,114`, `useTeamMemberAssignModal.js:44` ?뺤긽 | **?듦낵** (?꾨씫 2嫄?P3-30) |
| **ECharts `option` 硫붾え??* | portfolio ?꾩젽 13醫?+ teamAnalytics 6醫?+ allocation + myPage 3醫?+ `cost/*`쨌`progress/ProgressSCurve.jsx:127`쨌`analysisReport/issue/IssueAnalysisChart.jsx:252`쨌`taskHistory/TaskHistoryBurnup.jsx:70`쨌`dashboard/ChartTemplate.js:160` **?꾨? `useMemo` + ?щ컮瑜?deps**. `t`(`stores/useI18nStore.js:4-13`)? `isDark` ???덉젙 李몄“ | **?듦낵** (deps 媛 留ㅻ쾲 諛붾뚮뒗 ?덉쇅 2嫄? P1-10, P3-4) |
| **ECharts ?뚮쭏 ?깅줉 ?꾩튂** | `components/chart/echart/ThemedECharts.js:15` 媛 `utils/echartsTheme`(=`import * as echarts`) 瑜??뚯쑀?섍퀬 `App.jsx:3-7` ??吏꾩엯遺 import 瑜?湲덉??섎뒗 洹쇨굅瑜?紐낆떆. 鍮뚮뱶?먯꽌 echarts 0諛붿씠??in main ?쇰줈 ?ㅼ쬆??| **?듦낵** |
| **Zustand ??됲꽣 踰붿쐞** | ?ㅽ넗????됲꽣媛 **??媛앹껜/諛곗뿴??諛섑솚?섎뒗 吏??0嫄?*(`s => s.t`, `s => s.canRead('X')` ???ㅼ뭡?쇰쭔). 愿묒뿭 ?щ젋???좊컻 ?놁쓬. projectDetail ?몃━??React Context ???녿떎 | **?듦낵** |
| **?곌린 ??罹먯떆 ?⑥튂 洹쒖빟** | `projectDetail/assignment/*`(`useAssignWorkItem.js:17,45-51` ??invalidate 湲덉? + `refetchOnWindowFocus:false`), `gantt/useGanttFolderMutations.js:16-21`, `useGanttMutations` ???쇱젙/遺紐?留곹겕 3醫?`:156-158` 洹쇨굅 二쇱꽍), `ProjectIssueTable` ??`patchGroupPage`, `resource/assignment/patchAssignmentCache.js:6,95` ?꾨? 以??| **?듦낵** (?꾨컲 2嫄? P1-5 `useUpdateCoworkers`, P2-5 ?뚰겕濡쒓렇 ?쒕∼) |
| **?숆????낅뜲?댄듃** | `projectKanban/useKanbanMutations.js` 6醫?紐⑤몢 `onMutate` ?숆? ?⑥튂 + `onError` 濡ㅻ갚 + ?뺥솗 踰붿쐞 invalidate(`utils/queryKey/projectKeys.js:25-39`) | **?듦낵** |
| **愿묒뿭 invalidate ?⑤컻** | `backoffice/page/setting/SalaryPolicySetting.jsx:116-121`(6??? `backoffice/page/team/TeamPage.jsx:103-111`(5??? **?대떦 ?섏씠吏???쒖꽦 愿痢≪옄媛 ?놁뼱 stale 留덊궧?쇰줈 ?앸궃??*(?ㅼ젣 ?ъ“??0~1??. `TeamPage.jsx:106-108` ??洹쇨굅 二쇱꽍???덈떎. `utils/queryKey/salaryBandInvalidation.js` ???꾩슜 ?뚯뒪?몃줈 怨좎젙 | **?듦낵** (?ㅼ젣 ??뙆 2嫄? P2-3 湲됱뿬, P2-4 ?ъ슜?? |
| **荑쇰━???⑺넗由?怨꾩빟** | ?몃씪??諛곗뿴 由ы꽣??0嫄? `utils/queryKey/queryKeyContract.test.js:24` 媛 `invalidateQueries|setQueryData|...(\[` ?⑦꽩???뺢퇋?앹쑝濡?湲덉? | **?듦낵** |
| **?쒕쾭 ?섏씠吏?* | `backoffice/page/user/UserListPaging.jsx:33`(`getUserListWithPaging`), `pages/project/ProjectPage.jsx:26`(page/pagesize), `IssueAnalysisTable`쨌`TaskHistoryTable`(而ㅼ꽌), `getProjectSalaryList`(page), `findProjectusersByProjectId`(page/pageSize), `assignment/ProjectGroupCard.jsx:55-56,127-134`(1??lazy 留덉슫????`display` ?좉? ???묎린/?닿린 ?ъ“??0) ?뺤긽. **?꾨웾 ?섏떊 ???대씪 ?섏씠吏뺤? `useTeamMemberAssignModal.js:54-86` 1嫄대퓧?닿퀬, `:19-25` 二쇱꽍??"?쒕쾭 ?섏씠吏?寃쎈줈??沅뚰븳 異뺤씠 ?щ씪 ?????녿떎"??洹쇨굅媛 臾몄꽌??*???덈떎 | **?듦낵** |
| **媛?곹솕/?덈룄??* | `resource/assignment/people/CompanyResourceTable.jsx:45` 媛 `useInfiniteSlice(rows,{initial:30,step:30})`. `CommonTable`??TableSurface`?묭ynamicTable ? `rowsPerPage` 濡?DOM ???쒗븳. (臾몄젣??DOM ???꾨땲??洹??욌떒 議곕┰ ??P1-12) | **?듦낵** |
| **?붾컮?댁뒪 ?곸슜 ?꾪솴** | ?뺤긽 10怨???`AssignmentPage.jsx:108-109`(200ms), `ProjectIssuePanel.jsx:42`쨌`IssueAddModal.jsx:35`쨌`IssueAnalysisTable.jsx:164`쨌`TaskHistoryTable.jsx:47`쨌`useSubscriptionPreview.js:26`(300ms), `ProjectHeader.jsx:30`(300ms), `ProjectIssueAssignSelect.jsx:78`(400ms), `DropdownJql.jsx:50`(500ms), `ProjectAssignmentBoard.jsx:77`(200ms), `ProjectUserSelect.jsx:60,109`(1000ms) | **?듦낵** (?꾨씫 5怨? P1-8, P1-12) |
| **Jira 沅뚰븳 議고쉶 罹먯떛** | `utils/jiraApi/useJiraEditGuards.js:26-27,51-71` 紐⑤뱢 TTL 5遺?罹먯떆 ??裕ㅽ뀒?댁뀡留덈떎 ?ъ“???놁쓬 | **?듦낵** |
| **?숈씪 resolver 以묐났 ?몄텧 (??怨듭쑀)** | `getSettingData` 17媛쒖냼 ?꾨? `settingKeys.detail()` 怨듭쑀, `getResourceOverview` 4媛???怨듭쑀(`resourceKeys.overview()`), `getPortfolioDashboard` 瑜?`/dashboard` ? ? 遺꾩꽍 ??씠 怨듭쑀(`useTeamAnalyticsData.js:29-33,83` ??罹먯떆 媛??뺥깭源뚯? 留욎땄), `ganttKeys.data` 瑜?GanttPage/ProjectTreeView 媛 怨듭쑀(酉??꾪솚 ?ъ“??0) | **?듦낵** (staleTime 遺덉씪移섎쭔 P2-7, `view.getContext()` 3以??ㅻ쭔 P2-9) |
| **? 吏묎퀎 ?뚭퀬由ъ쬁 蹂듭옟??* | `utils/team/` ??`teamMetricsByTeam`쨌`rollupTeamTree`쨌`aggregateByTeam`쨌`projectTeamMatrix`쨌`compositionByTeam` ?꾨? ?⑥씪 ?쒗쉶 + Map 湲곕컲. `rollupTeamTree` ??O(teams) + ?ъ씠??諛⑹뼱(`visited`) 蹂댁쑀 | **?듦낵** (以묐났 ?몄텧留?P2-8, P3-14) |
| **`projectDetail/assignment/` ??異?* | 蹂대뱶 1 invoke(`useWorkAssignmentBoard.js:22-34`), ?? `poolOpen && meta?.poolAvailable` ?⑤뵒留⑤뱶(`AssignmentPage.jsx:96`), ???뚯깮媛?硫붾え?? ???몃뱾??`useCallback`, ?쒖닔 ?좏떥??誘몃?寃????먮낯 李몄“ 諛섑솚 ??**由ы룷 ??紐⑤쾾 ?щ?** | **?듦낵** |
| **愿怨꾨룄 ?⑤뵒留⑤뱶 濡쒕뱶** | `AllocationGraphSection` ? `graphOpen` ???뚮쭔 留덉슫????`getResourceAllocationGraph` 媛 ?쇱튌 ?뚮쭔 諛쒖궗(`ProjectAssignmentBoard.jsx:336-340`) | **?듦낵** |
| **FullCalendar 由ъ궗?댁쫰 泥섎━** | `components/calendar/FullCalendar.jsx:27-38` ??ResizeObserver ??**?먭린 ?몄뒪?댁뒪?먮쭔** `getApi().updateSize()` 瑜??몄텧?쒕떎(?꾩뿭 ?붿뒪?⑥튂 ?꾨떂) | **?듦낵** |
| **1?뚯꽦 ?꾩뿭 resize ?붿뒪?⑥튂** | `components/card/CardFullscreen.jsx:25`, `components/card/collapse/CardCollapseContext.jsx:55`, `portfolio/widgets/ChartBox.jsx:19`, `resource/teamAnalytics/TeamChartBox.jsx:32` ???꾨? `setTimeout` 1?뚯꽦(100~200ms) ???곗냽 諛쒗솕 ?놁쓬 | **?듦낵** (?곗냽 諛쒗솕 1嫄? P1-11) |
| **以묐났 ?좏떥/?섏〈??* | `from 'moment'` 吏곸젒 import **0嫄?* ??moment ??`@fullcalendar/moment-timezone` ?꾩씠 ?섏〈?깅퓧?닿퀬 ??肄붾뱶??`dayjs` 濡??듭씪. **?댁쨷 ?좎쭨 ?쇱씠釉뚮윭由??ъ슜 ?놁쓬.** ECharts ??`ThemedECharts` ?⑥씪 吏꾩엯 | **?듦낵** |
| **?ㅽ넗??以묐났 濡쒕뱶 媛??* | `stores/usePermissionStore.js:37` 쨌 `stores/useLicenseStore.js:82` ??`_loaded`/`_loading` 媛???뺤뿉 `App.jsx:72-78` ???댁쨷 `useEffect`(StrictMode ?댁쨷 ?ㅽ뻾 ?ы븿)?먯꽌??invoke 1??| **?듦낵** |
| **`adaptRows` 臾대?寃?理쒖쟻??* | `components/table/tableSort.js:191` ??`if (!needsRewrite) return rows` 媛 ?ㅼ젣濡??숈옉?쒕떎. `sortValue` 瑜??곕뒗 ?쒓? 4媛쒕퓧(`StorageProjectList`, `StorageTableList`, `PortfolioProjectTable`, `ResourceAnalysisTable`)?대씪 **O(?됁쀬뿴) 媛앹껜 ?꾨웾 ?ы븷??寃쎈줈??嫄곗쓽 ?吏 ?딅뒗??* ??P1-13 ???ㅻ퉬?⑹? ?ㅼ틪쨌?꾩떆諛곗뿴 履쎌씠??| **?듦낵** |
| **`hooks/` ??staleTime쨌enabled** | `useProjectTeams`(60s + enabled), `useTeamOptions`(5m + enabled), `useTeamUserCandidates`(5m + enabled), `usePermissionCatalog`(10m + gcTime), `usePublicHolidayList`(30m), `useJiraEditGuards`(5m + 紐⑤뱢 TTL 罹먯떆) ?뺤긽. `useTeamMemberCandidates` ??`staleTime:0` ? `:37` ??洹쇨굅媛 紐낆떆??**?섎룄??* ?좏깮 | **?듦낵** |
| **`CardFullscreen` ?댁쨷 ?뚮뜑 ?놁쓬** | `components/card/CardFullscreen.jsx:29` ??`if (!isOpen) return null` 濡??ロ엺 ?숈븞 children ??洹몃━吏 ?딅뒗??`Card.jsx:82` 媛 ??긽 ?뚮뜑?섎뒗 寃껋쿂??蹂댁씠???ㅻ퉬??0). **P2-15 ???쒕줈???댁쨷 留덉슫?몄????ㅻⅨ 援ъ“** | **?듦낵** |
| **`useInfiniteSlice`** | `utils/useInfiniteSlice.js` ??IntersectionObserver ?뺣━쨌?섏〈???뺤긽 | **?듦낵** |
| **`JobPollingManager` ?대? 諛⑹뼱** | `inFlightRef` 以묐났 ?몄텧 李⑤떒 쨌 `nextPollAtRef` 吏??諛깆삤??쨌 `intervalsRef` 以묐났 ?명꽣踰?諛⑹? 쨌 ?몃쭏?댄듃 ?뺣━(`:40-44`) 紐⑤몢 媛뽰땄 ??寃고븿? **諛깃렇?쇱슫??誘몄젙吏? 醫낅즺 議곌굔**(P1-7)肉?| **?듦낵** |

---

## 誘멸?利?(??媛먯궗濡??뺤씤?????녿뒗 寃?

| ??ぉ | ?ъ쑀 |
|------|------|
| P1-1 ??**gzip ?덇컧???뺥솗移?* | ?먮낯 諛붿씠??洹??1,261KB / 34.1%)? ?뚯뒪留듭쑝濡??뺤젙?덉쑝?? gzip ? 肄섑뀗痢좊퀎 ?뺤텞瑜좎씠 ?щ씪 ?ㅼ젣 lazy 遺꾨━ ??`node scripts/check-bundle-budget.js` 瑜??ㅼ떆 ?뚮젮???뺤젙?쒕떎. 蹂몃Ц??250~300KB ??鍮꾨? 異붿젙移섎떎 |
| 媛???ぉ??**?ㅼ젣 泥닿컧 吏??ms)** | ?뺤쟻 遺꾩꽍?대씪 ?몄텧 ?잛닔쨌?щ젋??踰붿쐞쨌諛붿씠?몃쭔 ?뺣웾?뷀뻽?? ?꾨줈?뚯씪???ㅼ륫(React DevTools Profiler / Performance ??? 誘몄닔??|
| ????곗씠???쒕굹由ъ삤??**?ㅼ젣 ?곗씠??洹쒕え** | 500紐?議곗쭅쨌2,000 ?댁뒋쨌50 ?꾨줈?앺듃 ?깆? 肄붾뱶???곹븳 ?곸닔(`USER_MAX=100`, `MAX_ISSUES=2000`, `MAX_GRAPH_PROJECTS=15`, ? 500)?먯꽌 媛?몄삩 媛믪씠?? ?댁쁺 ?ъ씠?몄쓽 ?ㅼ젣 遺꾪룷??誘명솗??|
| Forge iframe ?먯꽌 `refetchOnWindowFocus` ??**?ㅼ젣 諛쒗솕 鍮덈룄** | Jira ?섏씠吏? iframe ?ъ씠 ?ъ빱???꾪솚??`focusManager` ???대뼸寃??≫엳?붿???諛고룷 ?섍꼍 ?ㅼ륫 ?꾩슂. ?꾩젣 (a) ??鍮꾩슜? "諛쒗솕?쒕떎硫???議곌굔遺??|
| `EchartPanel` ??ResizeObserver **?섎㉨??猷⑦봽 ?ㅼ옱 ?щ?** | 肄붾뱶 寃쎈줈??媛?ν븯??李⑦듃 resize ??而⑦뀒?대꼫 ?ш린 蹂?????듭?踰??щ컻??, ?ㅼ젣濡?臾댄븳 猷⑦봽???ㅼ뼱媛?붿???釉뚮씪?곗? ?ㅼ륫 ?꾩슂. 由ъ궗?댁쫰 利앺룺(N媛?李⑦듃 ?숈떆 ?ъ륫?? ?먯껜??肄붾뱶濡??뺤젙 |
| ?뚯뒪?맞룸퉴???ㅽ뻾 | ??媛먯궗??**?쎄린 ?꾩슜**?대씪 `npm test`쨌`npm run build` 瑜??덈줈 ?뚮━吏 ?딆븯?? 踰덈뱾 ?섏튂??湲곗〈 `build/` ?곗텧臾?2026-08-12 15:34, `main.4db70f69.js` = raw 3,701,918B / gzip 898,285B / ?덉궛 950,000B) 湲곗??대떎 |
| P1-13 ??Atlaskit ?ъ젙?ъ씠 **?ㅼ젣濡??쇰쭏???먯＜ 諛쒗쁽?섎뒗吏** | 肄붾뱶??`getSortedRows` ??`sortKey` 媛 ?덉쓣 ?뚮쭔 ?뺣젹?쒕떎(?뺤씤 ?꾨즺). 利?"?ъ슜?먭? ?뺣젹 ?ㅻ뜑瑜??대┃?????먯꽌留?諛쒗쁽?섎뒗?? ?ㅼ궗?⑹뿉???뺣젹??耳???梨??ㅻ옒 癒몃Т??鍮꾩쑉? 誘명솗?몄씠?? **?뺣젹??耳쒖? ?딆? ?쒖뿉?쒖쓽 鍮꾩슜(?곕━ 履?`resolveSortableColumns`/`adaptRows` ?ъ떎??? 議곌굔 ?놁씠 諛쒖깮**?섎?濡???ぉ ?먯껜???깅┰?쒕떎 |
| ?쒓? IME 議고빀 以?`onInputChange` **?ㅼ젣 諛쒗솕 ?잛닔** | P1-8쨌P2-19 ??"8~11????議고빀 以묎컙 ?④퀎媛 留ㅻ쾲 諛쒗솕?쒕떎??媛?뺤씠?? 釉뚮씪?곗?쨌IME 議고빀???곕씪 ?ㅻⅤ誘濡??ㅼ륫 ?꾩슂(?붾컮?댁뒪 ?곸슜????뱀꽦? 媛?뺢낵 臾닿??섍쾶 ?깅┰) |

# ?깅뒫 媛먯궗 1?④퀎 諛깆뿏???섏젙 ??A-1 / A-8

湲곗? 蹂닿퀬?? `_workspace/perf-audit/BACKEND_2026-08-12.md`
?묒뾽?? 2026-08-12 쨌 踰붿쐞: **A-1, A-8 ??嫄대쭔** (?ㅻⅨ ??ぉ 誘몃?寃?

---

## A-1. ?뚰겕濡쒓렇 異붽? 議고쉶 ?섏씠吏 ?ш린 20 ??100

### ?섏젙 ?뚯씪

| ?뚯씪 | ?쇱씤(?섏젙 ?? | 蹂寃?|
|------|--------------|------|
| `src/resolver/myWork/MyWorkService.jsx` | 114-125 (`getExtraWorklogs`) | `maxResult: 20` ?몄옄 **?쒓굅** + 洹쇨굅 二쇱꽍 3以?|
| `src/resolver/utils/worklog/WorklogService.js` | 209-220 (`getExtraWorklogs`) | ?숈씪 |

> 蹂닿퀬?쒖쓽 ?뚮퉬????寃쎈줈??`src/resolver/worklog/`媛 ?꾨땲??**`src/resolver/utils/worklog/WorklogService.js`** ??蹂닿퀬??:58 ?쒓린媛 ?뺥솗, ?섎ː 硫붿떆吏 寃쎈줈媛 異뺤빟??.

### ?좏깮??媛믨낵 諛⑹떇: **100 (?섑띁 湲곕낯媛??밴퀎)**

`src/api/jira/worklog/WorklogApi.js:4` ???쒓렇?덉쿂媛 ?대? `maxResult = 100` ?대떎.
???몄텧遺?먯꽌 `maxResult` ?몄옄瑜?**鍮쇱꽌** ??湲곕낯媛믪쓣 洹몃?濡??寃??덈떎.

- **??100?멸?**: Jira ?꾩슜 ?붾뱶?ъ씤??`GET /issue/{key}/worklog`)??API 湲곕낯 5000源뚯? ?덉슜?쒕떎. 20? 寃???묐떟 ?몃씪???곹븳(`worklog.maxResults`)???섏씠吏 ?ш린濡??ㅼ씤???ъ궗?⑺븳 媛믪씠怨???媛믪? 臾닿??섎떎. 由ы룷 ???議곌뎔 `ResourceWorklogFetcher.js:6`쨌`ProjectCalendarService.js:11` ???대? `EXTRA_PAGE_SIZE = 100` ?쇰줈 ?댁쁺 以묒씠??**?숈씪 媛믪쑝濡??섎졃**?쒖섟??
- **?????곸닔瑜?留뚮뱾吏 ?딆븯??*: ?곸닔瑜??덈줈 export ?섎㈃ 由ы룷 ?덉뿉 100 由ы꽣?댁씠 3踰뚯㎏媛 ?쒕떎. ?섑띁 湲곕낯媛믪씠 ?대? ?⑥씪 異쒖쿂?대?濡????몄텧遺媛 `WorklogApi.js:4` **??怨?*??怨듭쑀?섍쾶 ?섎뒗 履쎌씠 ?먯뿰?ㅻ읇???섎ː??"?섑띁 湲곕낯媛??쒖슜" ?듭뀡). 媛??몄텧遺??異쒖쿂瑜?媛由ы궎??二쇱꽍???④꼈??
- **誘몃?寃??좎?**: `startAt = 20` 湲곕낯媛??숇큺 20嫄??댄썑遺??議고쉶), 猷⑦봽 醫낅즺 議곌굔(`currentStartAt >= res.total`), 諛섑솚媛?`all` = ?뚰겕濡쒓렇 諛곗뿴).

### 諛섑솚 shape

**遺덈?.** `getExtraWorklogs` ?????뚯씪 紐⑤몢 ?대?(non-export) ?ы띁?대ŉ ?뚰겕濡쒓렇 媛앹껜 諛곗뿴??諛섑솚?쒕떎. ?섏씠吏 ?ш린??猷⑦봽 ?곗닠???곗씠吏 ?딅뒗??`currentStartAt += logs.length`) ???섏씠吏??嫄댁닔留??섍퀬 ?꾩쟻 寃곌낵 吏묓빀? ?숈씪?섎떎.

### 湲곕? ?④낵 (蹂닿퀬???곗젙)

?뚰겕濡쒓렇 200嫄??댁뒋 1媛? Jira 9???쒖감 ??2?? `/myWork` 吏꾩엯 275????65????7%).

---

## A-8. ??쒕낫???붿빟 SQL ??PK ?몃뜳??蹂듦뎄

### ?섏젙 ?뚯씪

`src/rdb/query/ProjectDashboard.js:16` (`GETSUMMARY`)

```sql
-- before
WHERE BIN_TO_UUID(p.project_id) = ?
-- after
WHERE p.project_id = UUID_TO_BIN(?)
```

### ?뚮씪誘명꽣 ?뺤씤

- 諛붿씤?? `ProjectDashboardRepository.getSummaryDataRepository(project_id)` ??`.bindParams(project_id)` ??**UUID 臾몄옄??1媛?*.
- ?몄텧遺 4怨??꾨? UUID 臾몄옄?댁쓣 ?섍릿?? `ProjectDashboardController.js:35`(payload) 쨌 `ProjectCostService.js:102` 쨌 `ProjectProgressService.js:58` 쨌 `ProjectUsersService.js:171`.
- 愿濡 ?쇱튂: `src/rdb/query/` 9媛??뚯씪?먯꽌 `project_id = UUID_TO_BIN(?)` ?뺥깭媛 46???ъ슜 以????숈씪 ?뺥깭濡?留욎톬??

### ?덊떚?⑦꽩 ?붿〈 ?щ? (寃利?

`grep "WHERE BIN_TO_UUID"` / `BIN_TO_UUID(...) =` ??`src/` ?꾩껜?먯꽌 **????怨녹씠 ?좎씪**. 蹂닿퀬??:227 ??"???꾩껜?먯꽌 ????怨노쭔" 吏꾩닠怨??쇱튂?섎ŉ, **蹂닿퀬?쒖뿉 ?녿뜕 異붽? 諛쒓껄 ?놁쓬**.
(SELECT ?덉쓽 `BIN_TO_UUID(p.project_id) AS project_id` ??異쒕젰 蹂?섏씠???몃뜳?ㅼ? 臾닿? ??洹몃?濡???)

### 諛섑솚 shape

**遺덈?.** SELECT ?댟?GROUP BY`쨌而щ읆 蹂꾩묶 ?꾨? 誘몃?寃? `{ project_id, project_name, start_date, end_date, total_member_count, total_salary }` 洹몃?濡?

> 蹂닿퀬?쒓? ?④퍡 ?멸툒???꾩냽(吏꾩쿃/鍮꾩슜??`findProjectByIdRepository` PK 議고쉶濡??꾪솚, 誘몄궗??`total_salary` 議곗씤 ?쒓굅 = B-5)? **踰붿쐞 諛뽰씠??誘몄닔??*.

---

## ?뚯뒪??
猷⑦듃 `npm test` (jest) ?꾩껜 ?ㅽ뻾:

```
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
Time:        27.007 s
```

`SalaryPolicyLeak.test.js` ??`getSummaryDataService` 怨꾩빟 ?뚯뒪??#10, ?쒕퉬??shape 臾대?寃?寃利? ?ы븿 ?꾨? ?듦낵.
濡쒓렇??蹂댁씠??`[LICENSE] ... non-success status` ??`LicenseGuard.test.js:151` ???섎룄?곸쑝濡??좊컻?섎뒗 ?곷쪟 ?μ븷 ?쒕굹由ъ삤??`console.error` 濡? ?ㅽ뙣媛 ?꾨땲??

# ?깅뒫 媛먯궗 1?④퀎 ?꾨줎???섏젙 ??P1-7 / P1-9

??? `FRONTEND_2026-08-12.md` ??**P1-7, P1-9 ??嫄대쭔**. ?ㅻⅨ ??ぉ? ?먮?吏 ?딆븯??

## P1-7. ?낅줈??job ?대쭅??諛깃렇?쇱슫????뿉?쒕룄 吏??
| ?뚯씪 | 蹂寃?|
|------|------|
| `static/ui/src/polling/jobPolling.js:31-38` | `isDocumentHidden()` 異붽? (`typeof document !== 'undefined' && document.hidden === true`) |
| `static/ui/src/polling/JobPollingManager.jsx:20` | `pollJobRef` 異붽? ??interval쨌visibilitychange 媛 ??긽 理쒖떊 ?뚮뜑??poll 蹂몃Ц??蹂닿쾶 ?쒕떎 |
| `static/ui/src/polling/JobPollingManager.jsx:48-58` | `visibilitychange` 由ъ뒪?? ??蹂듦? ??異붿쟻 以묒씤 job ?꾨?瑜?**利됱떆 1??* ?대쭅. ?ㅻ뒗 ?ㅻ깄??`[...keys()]`) ???쒗쉶 ??`pollJob` ??`stopPolling` ?쇰줈 Map ??吏?????덈떎 |
| `static/ui/src/polling/JobPollingManager.jsx:60-118` | 湲곗〈 interval 蹂몃Ц??`pollJob(jobId)` 濡?異붿텧(濡쒖쭅 臾대?寃? ?ㅼ뿬?곌린留??뺣━) |
| `static/ui/src/polling/JobPollingManager.jsx:124-136` | interval ? `if (isDocumentHidden()) return;` ??`pollJobRef.current?.(jobId)` 留??몄텧 |

遺덈??쇰줈 ??寃? `POLL_INTERVAL_MS=3000`, backoff(`getPollingRetryDelay`)쨌`MAX_CONSECUTIVE_POLL_FAILURES`,
`isTerminalJob` ?꾨즺 ?먯젙, `inFlightRef`/`nextPollAtRef` 媛?? job 異붿쟻(`useJobStore`), ?몃쭏?댄듃 ?뺣━.

- **?④? 以??꾨즺 job ?꾨씫 諛⑹?**: 蹂듦? 利됱떆 1???대쭅??洹?蹂댁옣?대떎. 洹?1?뚮룄 `nextPollAtRef` backoff ??議댁쨷?쒕떎(?ㅽ뙣 ?곹깭?먯꽌 backoff 瑜?源⑥? ?딄린 ?꾪빐). ?④? 媛?쒕뒗 interval ?깆뿉留??먯뼱 蹂듦? ?대쭅??留됱? ?딅뒗??
- 媛먯궗媛 ?④퍡 ?쒖븞??"寃쎄낵 ?쒓컙蹂?媛꾧꺽 ?곹뼢쨌N?????ш린"???대쭅 二쇨린 蹂寃쎌씠??吏??踰붿쐞 諛???誘몄쟻??

## P1-9. `/myWork` 媛숈? resolver 2???몄텧

| ?뚯씪 | 蹂寃?|
|------|------|
| `static/ui/src/pages/myWork/utils/useMyWorklogList.js:7,30` | ?듭뀡 `enabled = true` 異붽? ??湲곗〈 `enabled` 議곌굔怨?AND. 湲곕낯媛믪씠???ㅻⅨ ?몄텧遺(`MyIssueTable.jsx:29`) ?숈옉? 遺덈? |
| `static/ui/src/pages/myWork/utils/useMyWorklogSummary.js:3-42` | `clipWorklogsToRange(myWorklogs, startDate, endDate)` 異붽? ???뚰겕濡쒓렇瑜??좎쭨 踰붿쐞(inclusive)濡??섎씪 ???숈씪 shape 諛섑솚 |
| `static/ui/src/pages/myWork/WorklogPage.jsx:118-152` | ?붿빟??罹섎┛??荑쇰━ 寃곌낵?먯꽌 ?뚯깮. 而ㅻ쾭 紐????뚮쭔 ?붿빟 ?꾩슜 荑쇰━ `enabled` |

?숈옉:

```
calendarCoversSummary = startDate <= ?대쾲????&& endDate >= ?대쾲?щ쭚??  // 'YYYY-MM-DD' ?ъ쟾??= ?좎쭨??  true  ???붿빟 ?꾩슜 荑쇰━ disabled, summary = useMyWorklogSummary(clip(罹섎┛?붽껐怨? ?대쾲??)  ??invoke 1??  false ??醫낆쟾?濡??붿빟 ?꾩슜 荑쇰━ enabled                                    ??invoke 2??湲곗〈怨??숈씪)
```

### ?ｌ? 耳?댁뒪 ?먯젙

??踰붿쐞瑜??ㅼ젣濡??議고븳 寃곌낵:

| ?곹솴 | 罹섎┛??踰붿쐞 | ?먯젙 |
|------|-------------|------|
| 湲곕낯 吏꾩엯(`initialView='dayGridMonth'`, `FullCalendar.jsx:47`) | ?대쾲 ?ъ쓣 ?ы븿?섎뒗 6二?洹몃━??`datesSet` ??activeStart~activeEnd, end ??exclusive???ㅽ엳?????볥떎) | **而ㅻ쾭 ???뚯깮, invoke 1??* |
| 罹섎┛?붾? ?댁쟾/?ㅼ쓬 ?щ줈 ?대룞 | ?대쾲 ?ъ쓣 踰쀬뼱??| 而ㅻ쾭 ?ㅽ뙣 ???붿빟 ?꾩슜 荑쇰━ ?좎? |
| `dayGridWeek` 濡??꾪솚(headerToolbar ??議댁옱, `FullCalendar.jsx:71`) | 1二?| 而ㅻ쾭 ?ㅽ뙣 ???붿빟 ?꾩슜 荑쇰━ ?좎? |
| 理쒖큹 ?뚮뜑(`dateRange` 珥덇린媛?= ?ㅻ뒛~?ㅻ뒛) | 1??| 而ㅻ쾭 ?ㅽ뙣吏留?**??荑쇰━ 紐⑤몢 `selectedProjectIds.length > 0` ???꾩슂**?섍퀬 ?꾨줈?앺듃 紐⑸줉 濡쒕뱶??`datesSet` 蹂대떎 ??쑝誘濡?洹??곹깭濡?諛쒖궗?섏? ?딅뒗??|
| ??酉?`viewMode='table'`) | 留덉?留?罹섎┛??踰붿쐞 ?좎? | 而ㅻ쾭 ?щ????곕씪 ?꾩? ?숈씪. ???곗씠?곕뒗 蹂꾨룄 ??`mine:false`)?대씪 臾닿? |

**??寃쎄퀎 二??? 泥섎━ ???쒖떆 媛?蹂댁〈???듭떖.** `useMyWorklogSummary` ??二쇨컙 ?⑷퀎???붿슂???쒖옉?대씪
?대쾲 二쇨? 吏?쒕떖??嫄몄튌 ???덈떎. 醫낆쟾 ?붿빟 荑쇰━???쒕쾭(`MyWorkService.processMyIssue` ??`isInRange`)媛
**?대쾲 ??踰붿쐞濡??뚰겕濡쒓렇瑜??대? 嫄몃윭** 以ъ쑝誘濡?洹?吏?쒕떖 硫곗튌? ?⑷퀎???놁뿀??
罹섎┛??寃곌낵(6二?瑜?洹몃?濡??섍린硫?洹?硫곗튌???뷀빐??**二쇨컙 ?⑷퀎媛 醫낆쟾蹂대떎 而ㅼ쭊??*.
??`clipWorklogsToRange` 濡??붿빟 踰붿쐞瑜??묎컳???곸슜???쒖떆 媛믪쓣 醫낆쟾怨??쇱튂?쒖섟??
(醫낆쟾????寃쎄퀎 二?怨쇱냼 吏묎퀎???깅뒫 ?섏젙 踰붿쐞 諛뽰씠??洹몃?濡?蹂댁〈?덈떎. 蹂꾨룄 ?먮떒 ?꾩슂.)

?꾪꽣 議곌굔 ?숈씪?? author ??罹섎┛??荑쇰━??`mine:true`(媛숈? `getMyCalendarWorklog`, ?쒕쾭媛
`author.accountId === accountId` ?꾪꽣), ?꾨줈?앺듃 ?좏깮? ?묒そ ??`normalizedProjectIds` ??洹몃?濡쒕떎.
?뚯깮? `useMemo`(`WorklogPage.jsx:144-150`).

## 寃利?
- `cd static/ui && npm test` ??**71 suites / 1218 tests ?꾨? ?듦낵** (?ㅻ깄??1 ?듦낵)
- `cd static/ui && CI=true npm run build` ??**?깃났**, `bundle:check` `withinBudget: true`
  (`main.js` gzip 898,643 B / ?덉궛 950,000 B)
- i18n ??異붽? ?놁쓬 ??`npm run merge` 遺덊븘??鍮뚮뱶 prebuild 媛 ?ㅽ뻾?섍릿 ??

## 蹂寃??뚯씪 (???묒뾽遺?

```
static/ui/src/polling/jobPolling.js
static/ui/src/polling/JobPollingManager.jsx
static/ui/src/pages/myWork/WorklogPage.jsx
static/ui/src/pages/myWork/utils/useMyWorklogList.js
static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
```

> `git status` ??蹂댁씠??`src/**`(`MyWorkService.jsx`, `WorklogService.js`, `ProjectDashboard.js`)쨌`.gitignore`
> ?섏젙? **???묒뾽遺꾩씠 ?꾨땲??*(?숈떆 吏꾪뻾 以묒씤 諛깆뿏???섏젙). ?뺤씤留??섍퀬 嫄대뱶由ъ? ?딆븯??

# ?깅뒫 媛먯궗 2?④퀎 諛깆뿏???섏젙 ??A-3 쨌 A-7 (2026-08-12)

- 洹쇨굅 臾몄꽌: `_workspace/perf-audit/BACKEND_2026-08-12.md` (A-3, A-7)
- 踰붿쐞: **A-3 쨌 A-7 ??嫄대쭔**. 1?④퀎 誘몄빱諛?蹂寃?MyWorkService / WorklogService / `rdb/query/ProjectDashboard.js` / WorklogPage ??? ?먮?吏 ?딆븯??
- **?묐떟 shape 遺덈?** ???대쾲 蹂寃쎌쑝濡?諛붾?resolver ?묐떟 ?꾨뱶??**?녿떎**.
- ?뚯뒪?? 猷⑦듃 `npm test` ??**70 suites / 1,110 tests ?꾨? ?듦낵**.

---

## A-3. ??쒕낫???듦퀎 2醫낆쓽 ?숈씪 ?꾨웾 ?ㅼ틪 以묐났

### 臾댁뾿???덈굹

`getAssigneeStats`(?대떦?먮퀎 嫄댁닔)? `getIssueParticipantStats`(?댁뒋蹂?李몄뿬????媛 **臾몄옄 ?⑥쐞濡?媛숈? 寃??URL**??媛곸옄 ?꾨웾 ?섏씠吏 猷⑦봽濡?湲곷뜕 寃껋쓣, **1?⑥뒪 ?꾩슜 ?섏쿂 + 2吏묎퀎**濡?媛덈옄??

| ?뚯씪 | ?댁슜 |
|---|---|
| `src/api/jira/issue/ProjectParticipantFetcher.js` (**?좉퇋**) | ??쒕낫??李몄뿬???꾩슜 1?⑥뒪 ?섏쿂. `maxResults=100` + `nextPageToken` 猷⑦봽??醫낆쟾怨??숈씪, ?댁뒋??`{issueKey, accountId, displayName, avatar, coworkers}` 理쒖냼 ?꾨뱶留??④릿??|
| `src/api/jira/issue/IssueApi.js:9-71` | `getAssigneeStats` ???섏튂 ?쒓굅, ?섏쿂 寃곌낵?먯꽌 **吏묎퀎留?*. coworker bulk resolve??醫낆쟾?濡?猷⑦봽 諛?1??|
| `src/api/jira/issue/IssueApi.js:73-115` | `getIssueParticipantStats` ??媛숈? ?섏쿂 寃곌낵?먯꽌 李몄뿬???섎쭔 吏묎퀎 |
| `src/resolver/projectIssue/ProjectUsersService.js:300-316` | ???쒕퉬?ㅼ뿉 `viewerId` ?몄옄 ?듦낵(湲곕낯 `null`) |
| `src/resolver/projectDashboard/ProjectDashboardService.js:203-206, 265-282` | `principal?.accountId` 瑜?`viewerId` 濡??꾨떖 |

**怨꾩빟 遺덈? 洹쇨굅**
- `getAssigneeStats` ??`[{accountId, name, avatar, value}]` (誘몃같?뺤? `accountId:'unassigned'`, `name:'unassigned'`)
- `getIssueParticipantStats` ??`{averageParticipants, issueStats:[{name, value}]}`
- ???⑥닔??export ?꾩튂쨌?쒓렇?덉쿂(異붽? ?몄옄??optional ?ㅼそ)瑜??좎??덉쑝誘濡?湲곗〈 mock(`SalaryPolicyLeak.test.js:172-176`)怨??대? ?뚮퉬??`ProjectDashboardService` ?좎씪)媛 洹몃?濡??숈옉?쒕떎.
- ?쒗쉶 ?쒖꽌媛 ?섏씠吏 ?쒖꽌 洹몃?濡쒕씪 寃곌낵 諛곗뿴 ?쒖꽌??醫낆쟾怨?媛숇떎(李⑦듃 移댄뀒怨좊━ ?쒖꽌 遺덈?).

### ?붿껌 媛?罹먯떆 ???꾩엯?덈떎. TTL 60珥?쨌 **?꾨줈?몄뒪 硫붾え由?* 쨌 ?ъ슜?먮퀎 ??
?꾨줎?몃뒗 ?꾩젽??`invoke('getChartDataById')` 1?뚯씠誘濡?`ChartTemplate.js`) assignee/issue ???꾩젽?
**?쒕줈 ?ㅻⅨ invoke** ?? ?붿껌 ?ㅼ퐫??硫붾え留뚯쑝濡쒕뒗 媛먯궗媛 吏?곹븳 以묐났(1,000?댁뒋 ?꾨줈?앺듃 = 寃??20?? 洹몄쨷 10???꾩쟾 以묐났)??洹몃?濡??⑤뒗?? 洹몃옒???섏쿂??紐⑤뱢 ?ㅼ퐫???⑥씪 ?뷀듃由?TTL 罹먯떆瑜???? 蹂댁닔?곸쑝濡??≪? 洹쇨굅:

| 寃곗젙 | 洹쇨굅 |
|---|---|
| **TTL 60珥?* | `TeamTreeCache.getTeamIndex` 愿濡. 媛숈? ?뚯씪 怨꾩뿴???뚰겕濡쒓렇 ?꾩젽 KVS 罹먯떆(10遺?蹂대떎 **10諛?蹂댁닔??*?대떎. stale ? "?대떦?먮? 諛붽씔 ??李⑦듃 諛섏쁺??理쒕? 60珥???떎" ?섎굹肉먯씠??|
| **KVS 媛 ?꾨땲???꾨줈?몄뒪 硫붾え由?* | ??寃?됱? `as:'user'` ??**寃곌낵媛 ?몄텧??沅뚰븳?쇰줈 ?꾪꽣留?*?쒕떎. `Assignee:{projectId}` ?뺥깭??KVS 怨듭쑀 罹먯떆(媛먯궗 ?섏젙諛⑺뼢 ?????ъ슜??媛?媛??踰붿쐞瑜??욎쓣 ???덉뼱 梨꾪깮?섏? ?딆븯??|
| **罹먯떆 ?ㅼ뿉 `viewerId`(?몄텧??accountId) ?ы븿** | 媛숈? ?몄뒪?댁뒪???ㅻⅨ ?ъ슜?먭? ????⑥쓽 媛??踰붿쐞瑜?蹂댁? ?딅뒗??|
| **`viewerId` ?놁쑝硫?罹먯떆 誘몄궗??* | principal ?꾨떖??鍮좎?硫?議곗슜??怨듭쑀?섏? ?딄쾶 fail-safe |
| **?뷀듃由?1媛쒕쭔 ?좎?** | ??쒕낫?쒕뒗 ???ъ슜?먭? ???꾨줈?앺듃 ?꾩젽???곗냽 ?뚮뜑?쒕떎. ?ㅻⅨ ?ㅺ? ?ㅻ㈃ 援먯껜?섎?濡??곸＜ 硫붾え由ш? ?곸닔(`memoryMB: 256` 蹂댄샇) |

?뺥빀????**臾댄슚??吏?먯? ?녿떎**(Jira ?댁뒋媛 ?먮낯?닿퀬 ?깆씠 ?곌린瑜??섏? ?딅뒗 ?쎄린 ?꾩슜 吏묎퀎 ??TTL 留뚮즺媛 ?좎씪??媛깆떊 寃쎈줈).

### ?④낵

- ???붿껌 ?덉뿉?????듦퀎瑜?紐⑤몢 ?곕뒗 `getChartData`(?꾩껜 李⑦듃) 寃쎈줈: 寃??**2횞N ??N??*.
- ?꾩젽蹂?invoke 寃쎈줈: 媛숈? ?몄뒪?댁뒪濡??쇱슦?낅릺硫???踰덉㎏ ?꾩젽??寃??**N????0??*. ?쇱슦?낆씠 媛덈━硫?醫낆쟾怨??숈씪(臾댄쉶洹).
- ?꾨줎??援ъ“(?꾩젽蹂?invoke)??**?먮?吏 ?딆븯??*.

---

## A-7. 留덉뒪???ъ쟾 6醫?臾댁틦??KVS ?ㅼ틪

### 臾댁뾿???덈굹

`backoffice/team/TeamTreeCache.getTeamIndex` ? **?숉삎**??60珥?紐⑤뱢 罹먯떆瑜?怨듭슜 紐⑤뱢濡?戮묒븘 6醫낆뿉 ?곸슜?덈떎.

- **?좉퇋**: `src/resolver/backoffice/DictionaryCache.js`
  - `readDictionary(name, loader)` / `invalidateDictionary(name)` / `invalidateAllDictionaries()`
  - TTL **60珥?*(getTeamIndex 愿濡 洹몃?濡?.
  - **媛믪씠 ?꾨땲??Promise 瑜??대뒗??* ?????붿껌?먯꽌 媛숈? ?ъ쟾??`Promise.all` 濡??숈떆???쎈뒗 怨녹씠 ?щ읉?대씪(`buildPeopleContext` + `getResourceProfile` ??role 2???? 媛믩쭔 ?댁쑝硫??숈떆 吏꾩엯???꾨? miss ?쒕떎. loader ?ㅽ뙣??罹먯떆?섏? ?딅뒗??
  - **?쒓퀎瑜??뚯씪 ?곷떒 二쇱꽍??紐낆떆**: Forge ???몄뒪?댁뒪媛 ?щ윭 媛쒕씪 **罹먯떆??invalidate ???몄텧???몄뒪?댁뒪?먮쭔 ?곸슜?쒕떎** ??諛깆삤?쇱뒪?먯꽌 ?ъ쟾??怨좎퀜???ㅻⅨ ?몄뒪?댁뒪??TTL(60珥???吏?섏빞 ??媛믪쓣 蹂몃떎.
  - 罹먯떆 媛믪? ?몄텧 媛?怨듭쑀?섎?濡?**媛??쒕퉬?ㅺ? ?몄텧留덈떎 ?뺤? 蹂듭궗**??諛섑솚?쒕떎(?뚮퉬??蹂?뺤뿉 ?섑븳 罹먯떆 ?ㅼ뿼 李⑤떒. ?뱁엳 `LevelController.gateLevelBands` 媛 ?묐떟??媛怨듯븳??.

| ?쒕퉬??| ?쎄린(罹먯떆 ?곸슜) | ?곹븳 洹쒖빟 |
|---|---|---|
| `getRoleListService` | `RoleService.js:51` | `findAll()` **?좎?**(100嫄?罹?洹몃?濡? |
| `getLevelListService` | `LevelService.js:110` | `findAll()` ?좎? |
| `getSkillListService` | `SkillService.js:75` | `findAllPaged('name',100,CATALOG_MAX_ITEMS)` ?좎?(bulk 寃쎈줈? 媛숈? ?곸닔) |
| `getProjectStatusListService` | `ProjectStatusService.js:95` | `findAll()` ?좎? |
| `getPublicHolidayListService` | `PublicHolidayService.js:49` | `findByField('by-date')` ?좎? (B-12 ??蹂꾧굔?대씪 ?먮?吏 ?딆쓬) |
| `getSettingDataService` | `SettingService.js:25` | `findById('settings')` ?좎? |

> `getProjectStatusExistLinkService`(移몃컲 ?꾩슜, `findByFilterExists`)??媛먯궗 ?쒖뿉 ?놁뼱 罹먯떆?섏? ?딆븯??
> `permission` ?ъ쟾? 媛먯궗 ?쒖쓽 6醫낆뿉 ?녾퀬 沅뚰븳 ?먯젙 異뺤씠???대쾲 踰붿쐞?먯꽌 ?쒖쇅?덈떎.

### 臾댄슚??吏??(?곌린 寃쎈줈 grep ?꾩닔)

| ?ъ쟾 | 臾댄슚???꾩튂 |
|---|---|
| role | `RoleService.js:25`(addRole) 쨌 `:88`(delete) 쨌 `:109`(update) 쨌 `:126`(addRoleBulk) |
| level | `LevelService.js:74`(addLevel) 쨌 `:154`(delete) 쨌 `:177`(update) 쨌 `:193`(addLevelBulk) |
| skill | `SkillService.js:45`(addSkill) 쨌 `:114`(delete) 쨌 `:135`(update) 쨌 `:158`(addSkillBulk) |
| status | `ProjectStatusService.js:24`(addProjectStatus) 쨌 `:63`(移몃컲 add) 쨌 `:68`(移몃컲 add 留곹겕?ㅽ뙣 濡ㅻ갚 delete) 쨌 `:171`(delete-isolated) 쨌 `:211`(delete 蹂몄껜) 쨌 `:260`(update) 쨌 `:374`(`saveStatusOrder` ???쒖꽌 ?ъ젙?섎룄 status write. `setStatusLink`쨌`deleteProjectStatus` 媛 ??寃쎈줈濡??ㅼ뼱?⑤떎) |
| holiday | `PublicHolidayService.js:27`(add) 쨌 `:77`(delete) 쨌 `:91`(update) |
| settings | `SettingService.js:83`(updateSetting) |
| status + settings (?쒕뱶) | `SeedData.js:27` `runSeed()` 留먮? `invalidateAllDictionaries()` ??`ensureSeed()` 媛 `userPermissionCheckService` 瑜??듯빐 **resolver ?몄뒪?댁뒪 ?덉뿉??* ?????덉뼱 ?꾩슂?섎떎 |

- `addRoleBulk/addLevelBulk/addSkillBulk` ??`addCatalogItemsBulk` 瑜?**await ????* 臾댄슚?뷀븯?꾨줉 async 濡?諛붽엥??諛섑솚媛?shape 遺덈?: `{data:{added, skipped}}`).
- **?곌린 寃利?寃쎈줈??罹먯떆瑜??吏 ?딅뒗??* ???대쫫 以묐났 ?먯젙(`checkDuplicated`)쨌`findById`쨌`updateSetting` ??`prev` ?쎄린???꾨? KVS 吏곸젒 議고쉶 洹몃?濡쒕떎(`loadTeamIndexFresh` 洹쒖빟怨??숉삎). stale ?몃뜳?ㅻ줈 以묐났 ?먯젙???섏? ?딅뒗??
- `src/trigger/demoSeed.js`(?뱁듃由ш굅)??role/level/status 瑜??곗?留?**resolver ? ?ㅻⅨ Forge ?⑥닔 = ?ㅻⅨ 紐⑤뱢 ?몄뒪?댁뒪**??洹??몄뒪?댁뒪??罹먯떆瑜?吏?뚮룄 ?섎?媛 ?녿떎(?쒖뿰???꾧뎄?닿린???섎떎). 臾댄슚?붾? 異붽??섏? ?딆븯怨? 洹?寃쎈줈 ?댄썑 理쒕? 60珥?stale ? TTL 濡??먯뿰 ?댁냼?쒕떎.

### ?섏슜???쒓퀎 (紐낆떆)

1. **?몄뒪?댁뒪蹂?罹먯떆** ??諛깆삤?쇱뒪?먯꽌 ??븷/?깃툒/?ㅽ궗/?곹깭/怨듯쑕???ㅼ젙??怨좎튂硫?**?ㅻⅨ ?몄뒪?댁뒪??理쒕? 60珥?* ??媛믪쓣 蹂몃떎. 怨좎튇 愿由ъ옄 蹂몄씤???붾㈃? (媛숈? ?몄뒪?댁뒪濡??쇱슦?낅맆 ?? 利됱떆 諛섏쁺?섏?留?蹂댁옣? ?꾨땲?? `TeamTreeCache` 媛 ?대? 媛숈? 怨꾩빟?대떎.
2. **`settings.salaryPolicy` ??60珥?stale ???*?대떎(INDIVIDUAL ??LEVEL_BAND ?꾪솚 諛섏쁺??理쒕? 60珥???떎). 愿由ъ옄 1?몄씠 ?꾨Ⅴ???鍮덈룄 ?ㅼ젙?닿퀬, 沅뚰븳 ?먯젙???대? 理쒕? 90珥?stale(TeamTree 60 + principal 30)???섏슜?섍퀬 ?덉뼱 媛숈? 湲됱쓽 寃쎄퀎濡??먮떒?덈떎. `SettingService.js:17-23` 二쇱꽍???④꼈??

### ?④낵 (媛먯궗 ?곗젙 湲곗?)

- `/backoffice/users` 吏꾩엯: role 3 + level 3 ??**媛?1??*(媛숈? ?붿껌 ???숈떆 ?몄텧源뚯? Promise 怨듭쑀濡??≪닔).
- `/resource` ?몃젰?꾪솴 吏꾩엯: role/level/skill/settings 以묐났 ?ㅼ틪 ?쒓굅.
- ?꾨줈?앺듃 ??쒕낫?? level/role ?꾩젽 `W` 媛???`findAll` **W????1??*(60珥???.

---

## ?뚯뒪??
```
npm test  (root, jest)
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
```

泥??ㅽ뻾?먯꽌 `SettingService.test.js` 쨌 `SalaryPolicySetting.test.js` 2嫄댁씠 ?ㅽ뙣?덈떎 ?????뚯씪? **write ?놁씠 KVS mock 諛섑솚媛믩쭔 諛붽퓭 媛硫?* `getSettingDataService()` 瑜?諛섎났 ?몄텧?댁꽌,
耳?댁뒪 媛꾩뿉 罹먯떆媛 ?⑥쑝硫???耳?댁뒪 媛믪씠 ?섏삩?? 罹먯떆???뺤긽 ?숈옉???쒕윭??寃껋씠誘濡??쒕퉬?ㅺ? ?꾨땲???뚯뒪?몄뿉 `beforeEach` 由ъ뀑(`invalidateAllDictionaries()`)???ｌ뼱 ?댁냼?덈떎
(`SalaryPolicySetting.test.js:19,25` 쨌 `SettingService.test.js:17,24`).

## 蹂寃??뚯씪

**?좉퇋**
- `src/api/jira/issue/ProjectParticipantFetcher.js`
- `src/resolver/backoffice/DictionaryCache.js`

**?섏젙**
- `src/api/jira/issue/IssueApi.js`
- `src/resolver/projectIssue/ProjectUsersService.js`
- `src/resolver/projectDashboard/ProjectDashboardService.js`
- `src/resolver/backoffice/role/RoleService.js`
- `src/resolver/backoffice/level/LevelService.js`
- `src/resolver/backoffice/skill/SkillService.js`
- `src/resolver/backoffice/projectStatus/ProjectStatusService.js`
- `src/resolver/backoffice/publicHoliday/PublicHolidayService.js`
- `src/resolver/backoffice/setting/SettingService.js`
- `src/seed/SeedData.js`
- `src/resolver/backoffice/setting/__test__/SettingService.test.js` (罹먯떆 由ъ뀑)
- `src/resolver/backoffice/setting/__test__/SalaryPolicySetting.test.js` (罹먯떆 由ъ뀑)

resolver ?좉퇋 ?깅줉 ?놁쓬 ??`PermissionMap.js` 쨌 `CONTROLLER_REGISTRARS` 蹂寃??놁쓬.
KVS ?좉퇋 ?띿꽦 ?놁쓬 ??`manifest.yml` 蹂寃??놁쓬.

# ?깅뒫 媛먯궗 2?④퀎 ???꾨줎?몄뿏???섏젙 由ы룷??
- 湲곗? 媛먯궗?? `_workspace/perf-audit/FRONTEND_2026-08-12.md`
- ??? **P1-14 ??P1-4 ??P1-3 ??P1-8 ??P1-13** (4嫄? 吏???쒖꽌?濡?
- ?좎쭨: 2026-08-12 / 踰붿쐞: `static/ui/` ?덉そ留?(1?④퀎 ?섏젙 ?뚯씪쨌`src/` 諛깆뿏??誘몄젒珥?
- 寃곌낵: `npm test` **73 suites / 1235 tests ?듦낵**(湲곗???71/1218 ??+2 suites/+17 tests), `CI=true npm run build` ?깃났, 踰덈뱾 ?덉궛 ?듦낵(gzip 899,163 / 950,000)

---

## P1-14. ?ъ슜???뺣낫 罹먯떆 ???ъ꽕怨????щ엺 ?⑥쐞

### 臾댁뾿??諛붽엥??
| ?뚯씪 | 吏??| ?댁슜 |
|---|---|---|
| `static/ui/src/utils/queryKey/jiraKeys.js` | `:9` | `userInfo: (accountId) => ['jiraUserInfo', accountId]` **?좎꽕**. `userInfos`(吏묓빀)??`:10` ???④릿??|
| `static/ui/src/utils/useJiraUserInfos.js` | `:111` `loadUserInfo` | accountId **1紐?* ?⑥쐞 濡쒕뜑 ??媛숈? ?깆쓽 ?붿껌??紐⑥븘 `/user/bulk` 1?뚮줈 諛쒖궗(留덉씠?щ줈 諛곗튂) |
| ??| `:33` `mapWithConcurrency`, `:66` `fetchBulkUsers` | 50媛?泥?겕 **吏곷젹 for-await ???숈떆 3媛?蹂묐젹**. 200紐?= 4???쒖감 ?뺣났 ??2?쇱슫??|
| `static/ui/src/utils/jiraApi/users/getUserInfos.js` | `:19` `resolveUserInfos` | 吏묓빀 荑쇰━??queryFn ??id 留덈떎 `queryClient.fetchQuery(jiraKeys.userInfo(id))` ??**?좎꽑?섎㈃ ?뺣났 0** |
| ??| `:39` | ?뺢퇋??硫붾え媛 `accountIds` **李몄“**媛 ?꾨땲??媛??쒓렇?덉쿂瑜?蹂몃떎(?몃씪??諛곗뿴 ?몄텧遺?먯꽌 Set+sort ?ъ떎???쒓굅) |
| ??| `:65` `useUserInfoMap` | 媛숈? 議고쉶??留??뺥깭(`{data: {accountId: user}, isLoading}`) ??P1-4 ??4媛??붾㈃???대떎 |

### ?ㅺ퀎 洹쇨굅 (??`useQueries` 媛 ?꾨땲?????뺥깭?멸?)

- **諛섑솚 shape 遺덈????붽뎄?ы빆**?댁뿀?? `useUserInfos` ???ъ쟾??`{data: user[], isLoading}` ??
  `useQueries` 濡?諛붽씀硫?寃곌낵 諛곗뿴???뚮뜑留덈떎 ??李몄“???뚮퉬泥?6怨녹쓽 `useMemo`(留?議곕┰)媛 ?꾨? 源⑥쭊??
  洹몃옒??**吏묓빀 ?ㅻ뒗 "李몄“ ?덉젙???꾩슜 ?뉗? ?섑띁"濡??④린怨?*, ?ㅼ젣 ?뺣났 ?щ????щ엺 ?⑥쐞 ?뷀듃由ъ쓽 ?좎꽑?꾧? ?뺥븳??
- 媛쒖씤 ?뷀듃由? `staleTime 10遺?(醫낆쟾怨??숈씪) + `gcTime 30遺?. 愿李곗옄媛 ?녿뒗 ?뷀듃由щ씪 gc 瑜?紐낆떆?섏? ?딆쑝硫?  湲곕낯 5遺꾩뿉 ?щ씪??"?붾㈃ 媛??ъ궗???대씪??紐⑹쟻 ?먯껜媛 諛섏? 臾댁궛?쒕떎.
- 諛곗튂 李쎌? `setTimeout(0)`(`useJiraUserInfos.js:122`). microtask 濡?紐⑥쑝硫?react-query 媛 queryFn ??  ????誘몃쨪 ?쒖옉?섎뒗 寃쎈줈?먯꽌 諛곗튂媛 履쇨컻吏꾨떎.
- ?ㅽ뙣??泥?겕??**reject** ?쒕떎. `resolve(null)` 濡??섍린硫?"?녿뒗 ?ъ슜??媛 媛쒖씤 罹먯떆??援노뒗??
  媛쒕퀎 ?ㅽ뙣???곸쐞?먯꽌 `.catch(() => null)` 濡??≪닔 ??洹??щ엺留?鍮좎쭊??醫낆쟾 ?숈옉 ?좎?, `retry:false`).

### ?④낵

- `TaskHistoryTable` 20??횞 10?섏씠吏: 罹먯떆 ?뷀듃由?10媛?횞 bulk 10????**?깆옣 ?몄썝(?? 30紐? 1?뚮텇**. ?댄썑 ?섏씠吏???뺣났 0.
- ?붾㈃ ?대룞(?묒뾽?대젰 ???꾨줈?앺듃 ?쒕줈????罹섎┛???먯꽌 寃뱀튂???몄썝 ?ъ“???놁쓬.

### ?뚯븘???숈옉 蹂??1嫄?
諛섑솚 諛곗뿴???쒖꽌媛 **Jira ?묐떟 ?쒖꽌 ??accountId ?ㅻ쫫李⑥닚**?쇰줈 諛붾먮떎(?ㅺ? ?뺢퇋???뺣젹 紐⑸줉?대?濡?寃곗젙??.
?뚮퉬泥?6怨?以?5怨녹? accountId 濡?留듭쓣 留뚮뱾???곕?濡?臾댁쁺?? `myWork/modal/WorklogModal.jsx:97`(?묒뾽???꾨컮? ?섏뿴)留??쒖떆 ?쒖꽌媛 ?щ씪吏????덈떎. 媛??먯껜???숈씪.

### ?뚯뒪??
`static/ui/src/utils/__test__/jiraUserInfoLoader.test.js` **?좉퇋 8嫄?* ??媛숈? ???붿껌??bulk ?⑹튂湲? 以묐났 id 1??
?녿뒗 ?ъ슜??`null`, 泥?겕 ?ㅽ뙣 reject, ?뺤떇 ?꾨컲 臾댁솗蹂? 泥?겕 蹂묐젹?? ?ㅽ뙣 泥?겕 臾댁떆, id ?꾪꽣留?
`queryKeyFactories.test.js:29~` ??`userInfo`/`userInfos` 怨꾩빟 ?⑥뼵 異붽?. `queryKeyContract.test.js` ?듦낵(?몃씪????諛곗뿴 ?놁쓬).

---

## P1-4. `getUser` N+1 4怨???踰뚰겕 ??
| ?뚯씪 | 吏??| ??| ??|
|---|---|---|---|
| `pages/projectDetail/cost/CostByIssueTable.jsx` | `:62-67` | ??**吏꾩엯 利됱떆** ???꾨웾 硫ㅻ쾭瑜?5紐낆뵫 ?쒖감(40紐?= 40?뺣났/8?쇱슫?? | `useUserInfoMap(drawerAccountIds)` ??**?쒕줈?대? ???댁뒋??硫ㅻ쾭留?*. 吏꾩엯 ??0?뺣났 |
| `pages/projectDetail/salary/SalaryManagementPage.jsx` | `:109` | ?섏씠吏??10 媛쒕퀎 ?몄텧, staleTime ?놁쓬 | `useUserInfoMap(userIds)` ??bulk 1??+ 10遺?罹먯떆 |
| `pages/projectDetail/user/ProjectUserPanel.jsx` | `:88` | ?숈씪 | ?숈씪 |
| `analysisReport/resource/hooks/useProjectResourceMembers.js` | `:134-140` | 5紐낆뵫 **?쒖감** 諛곗튂(100紐?= 100?뺣났/20?쇱슫?? | `useUserInfoMap(userMapIds)` ??bulk 2??|

- 議고쉶 寃뚯씠??`shouldFetchUserMap`, ?대뙌?곗쓽 ?⑥씪 異쒖쿂)??**洹몃?濡??먭퀬** ?먯젙??false 硫?鍮?諛곗뿴???섍릿??
  `enabled:false` ? 寃곌낵媛 媛숇떎(?뺣났 0, `isLoading` false) ??`isUserMapLoading` ?뚮퉬泥?臾댄쉶洹.
- ?쒖떆 媛?遺덈?: ???붾㈃ 紐⑤몢 `UserAvatar`(=`avatarUrls['24x24']`, `displayName`) ? `displayName` 留??쎈뒗??
  `/user/bulk` 媛 ????以??`TaskHistoryTable` ???대? 媛숈? 寃쎈줈瑜??대떎).
- **?숈옉 蹂??1嫄?*: 鍮꾩슜 ???쒕줈?대? **泥섏쓬 ????* 硫ㅻ쾭 ?대쫫??bulk 1?뺣났留뚰겮 ??쾶 梨꾩썙吏꾨떎(洹몃룞??accountId ?대갚).
  吏꾩엯 利됱떆 40?뺣났???놁븷???媛?닿퀬, ??踰덉㎏遺?곕뒗 ?щ엺 ?⑥쐞 罹먯떆??利됱떆 ?щ떎. 媛먯궗?쒖쓽 ?섏젙 諛⑺뼢 洹몃?濡쒕떎.
- **?뚯뒪??1嫄??섏젙**: `resource/__test__/resourceAdapterSingleSource.test.js:63~` ???꾨컮? 議고쉶媛
  `resourceAnalysisKeys.userMap` ??怨듭슜 `useUserInfoMap` ?쇰줈 ??꺼?? "??怨녹뿉?쒕쭔 議고쉶?쒕떎"??**洹쒖빟? ?좎???梨?*
  ?⑥뼵 ??곸쓣 `useUserInfoMap(` ?쇰줈 諛붽씀怨????ㅺ? 0怨녹엫???④퍡 紐삳컯?섎떎.

---

## P1-3. ?꾨줈?앺듃 ?곸꽭 ??3以?留덉슫??
### ?곗뇙 3怨좊━瑜?紐⑤몢 ?딆뿀??
1. **toast ?꾩씠?댄떚??* ??`components/feedback/ToastFlags.js:86`: 諛섑솚 媛앹껜瑜?`useMemo(..., [show, register])` 濡?怨좎젙.
   `show`/`register` ???대? ref 湲곕컲 `useCallback([])` ?대씪 **1?뚮쭔** 留뚮뱾?댁쭊??
   > 媛먯궗?쒓? ?쒖븞??`const toast = useMemo(() => ToastFlags(), [])` ??**梨꾪깮?섏? ?딆븯??* ????洹쒖튃 ?꾨컲?대떎.
   > `ToastFlags` ?대?媛 `useRef`/`useCallback` ???곕?濡?2?뚯감 ?뚮뜑?먯꽌 ?⑺넗由ш? ?ㅽ뻾?섏? ?딆쑝硫?   > ???몄텧 ?섍? 以꾩뼱 React 媛 二쎈뒗?? 怨좎튌 ???덈뒗 ?먮━??`ToastFlags` ?대?肉먯씠怨? ????以꾨줈 ?몄텧遺 30??怨녹씠 ?④퍡 ?ル뒗??
2. **??而댄룷?뚰듃 ?꾩씠?댄떚??* ??`constants/tabs.js`: `component: () => <X .../>` ?몃씪???붿궡??12媛쒕?
   **而댄룷?뚰듃 李몄“ + `props`** 濡?援먯껜(`:80,100,111,125,140,151,171,182,196,208,220,234`).
3. **props ?꾨떖** ??`components/tabs/CommonTab.jsx:31,83`: `const pageProps = config?.props` ??`<ActivePage {...pageProps} />`.
   `mainPageTabs`(props ?놁쓬)??`{...undefined}` 濡?臾댁쁺??

### ?⑤뒗 ?뚮뜑/留덉슫??
`ProjectDetailPage` ???ъ쟾??3踰??뚮뜑?쒕떎(珥덇린 / `view.getContext()` ?댁냼 / `findProjectById` ?댁냼).
諛붾?寃껋? **洹??뚮뜑媛 ??쓣 ?щ쭏?댄듃?섏? ?딅뒗??*??寃껋씠??
- toast ?덉젙?붾줈 `ProjectDetailTabs` ??`useMemo` 媛 3踰덉㎏ ?뚮뜑?먯꽌 ?덊듃?쒕떎.
- 2踰덉㎏ ?뚮뜑(context ?댁냼)??tabs 諛곗뿴???ㅼ떆 留뚮뱾?댁?吏留?element **type ??媛숈븘** 由щ젋?붾줈 ?앸궃??  (`ProjectCalender` 留???`context` prop ??諛쏅뒗??.
- 利?**留덉슫??3???먭린 2????留덉슫??1??*. ECharts ?ъ깮?굿톑rid ?ъ륫?빧룻븘??珥덇린?붽? ?щ씪吏꾨떎.

### 1??留덉슫???뺤씤 諛⑸쾿 (?붿껌 ??ぉ)

1. **?뺤쟻 ?뚭? ?뚯뒪??異붽???** ??`components/tabs/__test__/tabMountIdentity.test.js` 6嫄?
   ??`ToastFlags` 諛섑솚??`useMemo([show, register])` ?멸? ???몄텧遺媛 `useMemo(() => ToastFlags(), [])` 濡?媛먯떥吏 ?딆븯?붽?
   ??`tabs.js` ???몃씪???붿궡??而댄룷?뚰듃媛 ?녾퀬 紐⑤뱺 `component` 媛믪씠 ?앸퀎?먯씤媛 ???몄옄媛 `props` 濡??대젮媛?붽?
   ??`CommonTab` ???ㅽ봽?덈뱶?섎뒗媛. ??以??섎굹留???ㅻ룄 ?붾㈃? 硫姨≫븯怨?**?꾪꽣留?議곗슜??珥덇린??*?섎?濡??뚯뒪濡?紐삳컯?섎떎.
   (??由ы룷?먮뒗 `@testing-library/react` 媛 ?놁뼱 留덉슫???잛닔瑜?吏곸젒 ? ???녿떎 ??由ы룷 愿濡?濡??뺤쟻 ?⑥뼵.)
2. **?ㅽ뻾 ?뺤씤** ??媛쒕컻 鍮뚮뱶?먯꽌 `pages/projectDetail/dashboard/DashboardPage.jsx` 理쒖긽?⑥뿉
   `useEffect(() => console.log('[mount] DashboardPage'), [])` 瑜??꾩떆濡??ｊ퀬 `/project/:id` 吏꾩엯:
   ?섏젙 ??3以????섏젙 ??**1以?*. ?먮뒗 React DevTools Profiler 濡?吏꾩엯 而ㅻ컠 3媛?以?`DashboardPage` 媛
   "Mount" 濡??≫엳??而ㅻ컠??1媛쒖씤吏 蹂몃떎. ?ㅽ듃?뚰겕 ??뿉?쒕뒗 `getChartInfo`/`getSummaryData` 媛
   吏꾩엯??3????1?뚮줈 以??staleTime ?녿뒗 ??荑쇰━??留덉슫?몃쭏???ъ슂泥?뻽??.

---

## P1-8. `UserSearchSelect` 臾대뵒諛붿슫??+ ?명뵆?쇱씠???낅젰 ?좎떎

`components/select/UserSearchSelect.jsx`

| 吏??| ?댁슜 |
|---|---|
| `:53` | `const debouncedKeyword = useDebounce(keyword, 300)` (由ы룷 愿濡 `utils/useDebounce.js`, ?뺤젣 `ProjectHeader.jsx:30` 怨??숈씪) |
| `:119-131` | `handleInputChange` ???곹깭留?媛깆떊?섍퀬 **議고쉶瑜?嫄몄? ?딅뒗??* |
| `:133-136` | effect 媛 ?붾컮?댁뒪??媛믪쑝濡?**1?뚮쭔** 議고쉶. `hasTypedRef` 濡?留덉슫??吏곹썑 ?먮룞 議고쉶瑜?留됰뒗??理쒖큹 紐⑸줉? 醫낆쟾?濡?硫붾돱 ?ㅽ뵂???대떦) |
| `:57-58` | 議곌린 return 媛?쒕? **?섏씠吏?nextPage>0)?먮쭔** ?④꼈??????寃?됱? 吏꾪뻾 以??붿껌???덉뼱??諛섎뱶??諛쒖궗?쒕떎(?낅젰 ?좎떎 ?먯씤 ?쒓굅) |
| `:62-64` | 湲곕낯紐⑸줉 罹먯떆 寃쎈줈?먯꽌 `reqSeqRef` 瑜?**?щ┛??* ??寃?됱뼱瑜?吏??吏곹썑 ??寃???묐떟???ㅻ뒭寃???뼱?곕뜕 ?덉씠?ㅻ? 留됰뒗??|
| `:110-116` | `finally` ??濡쒕뵫 ?댁젣瑜?理쒖떊 seq ???뚮쭔 ???ㅻ뒭寃??앸궃 ???붿껌??吏꾪뻾 以??붿껌??濡쒕뵫 ?쒖떆瑜??꾩? ?딅뒗??|
| `:139-143` | 臾댄븳?ㅽ겕濡ㅻ룄 **?붾컮?댁뒪??* 寃?됱뼱 湲곗?(?붾㈃?????덈뒗 紐⑸줉??湲곗?怨??쇱튂) |

?④낵: "?띻만?? ?낅젰 = `invoke('searchUser')` 理쒕? 6???쇰????쒕∼??寃곌낵 ?닿툔?? ??**1??*, 洹몃━怨?留덉?留?湲?먯쓽 寃?됱씠 諛섎뱶??諛섏쁺?쒕떎.
?좏깮쨌?쒖떆쨌?섏씠吏??숈옉? 洹몃?濡쒕떎.

---

## P1-13. `TableSurface` ?대뙌?????몄텧遺 17怨녹쓣 怨좎튂吏 ?딄퀬

### 寃곕줎遺?? "?쒓렇?덉쿂濡??대뙌?곕? 嫄대꼫?곌린"???깅┰?섏? ?딅뒗??(鍮꾩슜 ?쇱쬆)

- ?대뙌???곗텧臾?`adaptedRows`)? ???`content` ??**洹??뚮뜑?먯꽌 ?덈줈 留뚮뱾?댁쭊 JSX** ??瑜?洹몃?濡??ㅼ뼱 ?섎Ⅸ??
  ?뺣젹媛??쒓렇?덉쿂媛 媛숇떎怨????곗텧臾쇱쓣 ?ъ궗?⑺븯硫??댁슜??諛붾??쒓? **?먮윭 ?놁씠 ???붾㈃?쇰줈 援노뒗??*
  (?몃씪???몄쭛쨌?곹깭 蹂寃쎌쿂??row key ??洹몃?濡쒖씤??content 留?諛붾뚮뒗 寃쎈줈媛 ?ㅼ젣濡??덈떎).
- 洹몃젃?ㅺ퀬 content 源뚯? 鍮꾧탳?섎젮硫??대뙌?곗? 媛숈? O(?됁쀬뿴) ?쒗쉶 + JSX 鍮꾧탳媛 ?꾩슂?섎떎 ??**?꾨굜 寃껋씠 ?녿떎**.
- 媛먯궗?쒓? ?쒖븞??`React.memo(DynamicTable)` ????由ы룷?먯꽌??嫄곗쓽 ?덊듃?섏? ?딅뒗??
  `frozenHead` ?????숆껐??耳쒖?硫?**??긽 ??李몄“**?닿퀬(`TableSurface.jsx:82` 二쇱꽍???섎룄), `emptyView` 瑜?  ?몃씪??JSX 濡??섍린???몄텧遺媛 留롫떎. ?덊듃?섎뒗 寃쎌슦???대? rows 瑜?硫붾え???몄텧遺肉먯씠???대뱷??寃뱀튇????**?ｌ? ?딆븯??*.

洹몃옒??諛⑺뼢??**?곸닔 ?덇컧 + ?뺤젙???쏅룑 ?쒓굅**濡??≪븯??

### ?섏젙

| ?뚯씪 | 吏??| ?댁슜 | 鍮꾩슜 |
|---|---|---|---|
| `components/table/TableSurface.jsx` | `:33,47` | `rows` 誘몄쟾????怨듭쑀 `EMPTY_ROWS` | 留??뚮뜑 ??`[]` 濡?硫붾え媛 ?듭㎏濡?源⑥???寃쎈줈 ?쒓굅 |
| ??| `:72-76` | `effectiveRows`(?ㅼ펷?덊넠) **硫붾え** | 濡쒕뵫 以?`buildSkeletonRows` 媛 留??뚮뜑 ??諛곗뿴 ???대뙌??硫붾え **?뺤젙 臾댄슚??*??? ?좎씪?섍쾶 100% ?쏅룎??寃쎈줈 |
| `components/table/tableSort.js` | `:146` `adaptRows` | 而щ읆??`map`+`filter`+`every`+`map`+?먯젙猷⑦봽 ??**諛곗뿴 1媛?쨌 ?쒗쉶 2??* | 200?됁쀬젙??而щ읆: 諛곗뿴 ?щ’ **2,400 ??800**, ?붿냼 ?묎렐 ~3,200 ??~1,600. `isNumericLike` ??鍮꾩닽?먮? 留뚮굹硫??댄썑 ?몄텧 ?앸왂 |
| ??| `:72` `resolveSortableColumns` | ?쒕줈 ?ㅻⅨ key 瑜?蹂??쒓컙 **議곌린 醫낅즺** | ?ㅻ뜲?댄꽣 key 而щ읆(?遺遺?泥????됱뿉??媛덈┛???먯꽌 ?????ㅼ틪 ??2???ㅼ틪 |

- ?곗텧臾?怨꾩빟(RFC-184 짠2)? 湲??洹몃?濡??좎?: `sortValue > sortKey > key` ?곗꽑?쒖쐞, `sortValue:null` = 寃곗륫(???대갚 湲덉?),
  而щ읆 ?⑥쐞 ????듭씪(?レ옄 `-Infinity` / 臾몄옄 `''`), `sortValue`/`sortKey` ?쒓굅, **臾대?寃????먮낯 李몄“ 諛섑솚**.
- ?몄텧遺 17怨?諛?`CommonTable`/`PagingTable`/`CursorPagingTable` 怨듦컻 props: **臾댁닔??*.
- 湲곗〈 ?뚯뒪??54嫄??꾨? ?듦낵 + 3嫄?異붽?(`tableSort.test.js` 議곌린醫낅즺 臾댄쉶洹 1, `tableContract.test.js` 硫붾え쨌EMPTY_ROWS 2) = **57嫄?*.

---

## 寃利?
```
cd static/ui && npx jest --silent
  ??Test Suites: 73 passed, 73 total   Tests: 1235 passed, 1235 total   (湲곗???71/1218)

cd static/ui && CI=true npm run build
  ??Compiled successfully (eslint 寃쎄퀬 0)
  ??bundle:check {"file":"static/js/main.77946a6d.js","gzipBytes":899163,"budgetBytes":950000,"withinBudget":true}
```

- i18n: **?좉퇋 ???놁쓬**. 鍮뚮뱶 prebuild 媛 `npm run merge` 瑜??ㅽ뻾?덇퀬 `locales/` ?곗텧臾쇱뿉 diff ?놁쓬(?뚯뒪? ?대? ?숆린).
- `p-limit` ? ?꾨줎?몄뿉???곗? ?딆븯????v7 ? ESM-only ??jest `transformIgnorePatterns`(?꾩옱 `@forge` 留??덉슜) 諛뽰씠??  ?뚯뒪?멸? 二쎈뒗?? ?꾩슂??湲곕뒫??"?숈떆 N媛?肉먯씠??`useJiraUserInfos.js:33` ??`mapWithConcurrency` 濡???좏뻽???숈떆??3).
- 蹂寃??뚯씪? ?꾨? `static/ui/` ?덉そ?대떎. 1?④퀎 ?뚯씪(`WorklogPage.jsx`, `useMyWorklogList/Summary`, `polling/*`)怨?  `src/` 諛깆뿏?쒕뒗 嫄대뱶由ъ? ?딆븯??

## ?꾩냽 ?뺤씤???꾩슂??寃?(E2E 誘몄닔??

1. 鍮꾩슜 ???쒕줈??**泥??ㅽ뵂** ??硫ㅻ쾭 ?대쫫?????뺣났 ??쾶 梨꾩썙吏??寃껋씠 ?섏슜 媛?ν븳吏(?ㅼ궗??泥닿컧).
2. `WorklogModal` ?묒뾽???꾨컮? ?섏뿴 ?쒖꽌(accountId ?ㅻ쫫李⑥닚?쇰줈 諛붾?.
3. ?꾨줈?앺듃 ?곸꽭 吏꾩엯 ??`DashboardPage` 留덉슫??1??????"?뺤씤 諛⑸쾿"???꾩떆 濡쒓렇 ?먮뒗 Profiler 濡??ㅽ솚寃??뺤씤.

fatal: detected dubious ownership in repository at 'C:/CloudJira/moves-workforce'
'C:/CloudJira/moves-workforce' is owned by:
	DESKTOP-Q21AG2J/DMOVE (S-1-5-21-257218257-3326819578-2473551123-1001)
but the current user is:
	DESKTOP-Q21AG2J/CodexSandboxOffline (S-1-5-21-257218257-3326819578-2473551123-1004)
To add an exception for this directory, call:

	git config --global --add safe.directory C:/CloudJira/moves-workforce
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file

warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file


hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
codex
현재 실행 계정과 저장소 소유자가 달라 Git이 기본 설정에서 diff를 거부했지만, 저장소 설정을 바꾸지 않는 일회성 안전 디렉터리 옵션으로 정확한 `HEAD` 대비 변경분을 읽어 검토를 계속하겠습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git -c safe.directory='C:/CloudJira/moves-workforce' status --short; git -c safe.directory='C:/CloudJira/moves-workforce' diff --stat HEAD; git -c safe.directory='C:/CloudJira/moves-workforce' diff --name-status HEAD" in C:\CloudJira\moves-workforce
 succeeded in 2582ms:
 M .gitignore
 M src/api/jira/issue/IssueApi.js
 M src/rdb/query/ProjectDashboard.js
 M src/resolver/backoffice/level/LevelService.js
 M src/resolver/backoffice/projectStatus/ProjectStatusService.js
 M src/resolver/backoffice/publicHoliday/PublicHolidayService.js
 M src/resolver/backoffice/role/RoleService.js
 M src/resolver/backoffice/setting/SettingService.js
 M src/resolver/backoffice/setting/__test__/SalaryPolicySetting.test.js
 M src/resolver/backoffice/setting/__test__/SettingService.test.js
 M src/resolver/backoffice/skill/SkillService.js
 M src/resolver/myWork/MyWorkService.jsx
 M src/resolver/projectDashboard/ProjectDashboardService.js
 M src/resolver/projectIssue/ProjectUsersService.js
 M src/resolver/utils/worklog/WorklogService.js
 M src/seed/SeedData.js
 M static/ui/src/components/feedback/ToastFlags.js
 M static/ui/src/components/select/UserSearchSelect.jsx
 M static/ui/src/components/table/TableSurface.jsx
 M static/ui/src/components/table/__test__/tableContract.test.js
 M static/ui/src/components/table/__test__/tableSort.test.js
 M static/ui/src/components/table/tableSort.js
 M static/ui/src/components/tabs/CommonTab.jsx
 M static/ui/src/constants/tabs.js
 M static/ui/src/pages/myWork/WorklogPage.jsx
 M static/ui/src/pages/myWork/utils/useMyWorklogList.js
 M static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
 M static/ui/src/pages/projectDetail/analysisReport/resource/__test__/resourceAdapterSingleSource.test.js
 M static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js
 M static/ui/src/pages/projectDetail/analysisReport/team/__test__/projectTeamAnalysisWiring.test.js
 M static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx
 M static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx
 M static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx
 M static/ui/src/polling/JobPollingManager.jsx
 M static/ui/src/polling/jobPolling.js
 M static/ui/src/utils/jiraApi/users/getUserInfos.js
 M static/ui/src/utils/queryKey/jiraKeys.js
 M static/ui/src/utils/queryKey/queryKeyFactories.test.js
 M static/ui/src/utils/useJiraUserInfos.js
?? .container-service-assets/
?? du.exe.stackdump
?? src/api/jira/issue/ProjectParticipantFetcher.js
?? src/resolver/backoffice/DictionaryCache.js
?? static/ui/src/components/tabs/__test__/
?? static/ui/src/pages/projectDetail/work/WORK_VIEWS.md
?? static/ui/src/utils/__test__/jiraUserInfoLoader.test.js
 .gitignore                                         |   5 +-
 src/api/jira/issue/IssueApi.js                     | 163 +++++++++------------
 src/rdb/query/ProjectDashboard.js                  |   2 +-
 src/resolver/backoffice/level/LevelService.js      |  34 +++--
 .../projectStatus/ProjectStatusService.js          |  33 ++++-
 .../publicHoliday/PublicHolidayService.js          |  17 ++-
 src/resolver/backoffice/role/RoleService.js        |  34 +++--
 src/resolver/backoffice/setting/SettingService.js  |  20 ++-
 .../setting/__test__/SalaryPolicySetting.test.js   |   4 +
 .../setting/__test__/SettingService.test.js        |   4 +
 src/resolver/backoffice/skill/SkillService.js      |  43 ++++--
 src/resolver/myWork/MyWorkService.jsx              |   6 +-
 .../projectDashboard/ProjectDashboardService.js    |  19 ++-
 src/resolver/projectIssue/ProjectUsersService.js   |  15 +-
 src/resolver/utils/worklog/WorklogService.js       |   6 +-
 src/seed/SeedData.js                               |   4 +
 static/ui/src/components/feedback/ToastFlags.js    |  17 ++-
 .../ui/src/components/select/UserSearchSelect.jsx  |  43 ++++--
 static/ui/src/components/table/TableSurface.jsx    |  29 +++-
 .../table/__test__/tableContract.test.js           |  15 ++
 .../components/table/__test__/tableSort.test.js    |  11 ++
 static/ui/src/components/table/tableSort.js        |  47 +++---
 static/ui/src/components/tabs/CommonTab.jsx        |   7 +-
 static/ui/src/constants/tabs.js                    |  48 +++---
 static/ui/src/pages/myWork/WorklogPage.jsx         |  29 +++-
 .../ui/src/pages/myWork/utils/useMyWorklogList.js  |   6 +-
 .../src/pages/myWork/utils/useMyWorklogSummary.js  |  40 +++++
 .../__test__/resourceAdapterSingleSource.test.js   |   7 +-
 .../resource/hooks/useProjectResourceMembers.js    |  28 ++--
 .../__test__/projectTeamAnalysisWiring.test.js     |   3 +-
 .../pages/projectDetail/cost/CostByIssueTable.jsx  |  36 ++---
 .../projectDetail/salary/SalaryManagementPage.jsx  |  15 +-
 .../pages/projectDetail/user/ProjectUserPanel.jsx  |  19 +--
 static/ui/src/polling/JobPollingManager.jsx        | 139 +++++++++++-------
 static/ui/src/polling/jobPolling.js                |   7 +
 static/ui/src/utils/jiraApi/users/getUserInfos.js  |  72 +++++++--
 static/ui/src/utils/queryKey/jiraKeys.js           |   6 +
 .../src/utils/queryKey/queryKeyFactories.test.js   |   3 +
 static/ui/src/utils/useJiraUserInfos.js            | 130 +++++++++++++---
 39 files changed, 793 insertions(+), 373 deletions(-)
M	.gitignore
M	src/api/jira/issue/IssueApi.js
M	src/rdb/query/ProjectDashboard.js
M	src/resolver/backoffice/level/LevelService.js
M	src/resolver/backoffice/projectStatus/ProjectStatusService.js
M	src/resolver/backoffice/publicHoliday/PublicHolidayService.js
M	src/resolver/backoffice/role/RoleService.js
M	src/resolver/backoffice/setting/SettingService.js
M	src/resolver/backoffice/setting/__test__/SalaryPolicySetting.test.js
M	src/resolver/backoffice/setting/__test__/SettingService.test.js
M	src/resolver/backoffice/skill/SkillService.js
M	src/resolver/myWork/MyWorkService.jsx
M	src/resolver/projectDashboard/ProjectDashboardService.js
M	src/resolver/projectIssue/ProjectUsersService.js
M	src/resolver/utils/worklog/WorklogService.js
M	src/seed/SeedData.js
M	static/ui/src/components/feedback/ToastFlags.js
M	static/ui/src/components/select/UserSearchSelect.jsx
M	static/ui/src/components/table/TableSurface.jsx
M	static/ui/src/components/table/__test__/tableContract.test.js
M	static/ui/src/components/table/__test__/tableSort.test.js
M	static/ui/src/components/table/tableSort.js
M	static/ui/src/components/tabs/CommonTab.jsx
M	static/ui/src/constants/tabs.js
M	static/ui/src/pages/myWork/WorklogPage.jsx
M	static/ui/src/pages/myWork/utils/useMyWorklogList.js
M	static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
M	static/ui/src/pages/projectDetail/analysisReport/resource/__test__/resourceAdapterSingleSource.test.js
M	static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js
M	static/ui/src/pages/projectDetail/analysisReport/team/__test__/projectTeamAnalysisWiring.test.js
M	static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx
M	static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx
M	static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx
M	static/ui/src/polling/JobPollingManager.jsx
M	static/ui/src/polling/jobPolling.js
M	static/ui/src/utils/jiraApi/users/getUserInfos.js
M	static/ui/src/utils/queryKey/jiraKeys.js
M	static/ui/src/utils/queryKey/queryKeyFactories.test.js
M	static/ui/src/utils/useJiraUserInfos.js
warning: in the working copy of 'locales/en-US.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'locales/ko-KR.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/TableSurface.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableContract.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableSort.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/tableSort.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/jiraApi/users/getUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/useJiraUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'locales/en-US.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'locales/ko-KR.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/TableSurface.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableContract.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableSort.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/tableSort.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/jiraApi/users/getUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/useJiraUserInfos.js', LF will be replaced by CRLF the next time Git touches it

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git -c safe.directory='C:/CloudJira/moves-workforce' diff --unified=80 HEAD -- 'src/api/jira/issue/IssueApi.js' 'src/api/jira/issue/ProjectParticipantFetcher.js' 'src/rdb/query/ProjectDashboard.js' 'src/resolver/projectDashboard/ProjectDashboardService.js' 'src/resolver/projectIssue/ProjectUsersService.js' 'src/resolver/myWork/MyWorkService.jsx' 'src/resolver/utils/worklog/WorklogService.js' 'src/resolver/backoffice/DictionaryCache.js' 'src/resolver/backoffice/role/RoleService.js' 'src/resolver/backoffice/level/LevelService.js' 'src/resolver/backoffice/skill/SkillService.js' 'src/resolver/backoffice/projectStatus/ProjectStatusService.js' 'src/resolver/backoffice/publicHoliday/PublicHolidayService.js' 'src/resolver/backoffice/setting/SettingService.js' 'src/seed/SeedData.js'" in C:\CloudJira\moves-workforce
 succeeded in 1778ms:
diff --git a/src/api/jira/issue/IssueApi.js b/src/api/jira/issue/IssueApi.js
index 8ac2b5d..9bd64fd 100644
--- a/src/api/jira/issue/IssueApi.js
+++ b/src/api/jira/issue/IssueApi.js
@@ -1,216 +1,185 @@
 import { requestJiraJson, putJiraJson, postJiraJson, deleteJira } from "../util/RequestJiaJson";
 import {route} from "@forge/api";
 import { MOVES_PROPERTY_KEY } from "./IssuePropertyApi";
 import { getBulkJiraUsersApi } from "../user/UserApi";
+// A-3 — 아래 두 통계는 **같은 검색을 각자 전량 스캔**했다. 페치는 전용 페처가 1패스로 담당하고
+//   여기서는 집계만 한다(두 함수의 시그니처·응답 shape 불변).
+import { getProjectParticipantIssues } from "./ProjectParticipantFetcher";
 
-export const getAssigneeStats = async ({projectId, coworkerFieldId, includeCoworker = false}) => {
+export const getAssigneeStats = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
 
-    let nextPageToken = null;
     let assigneeMap = {};
-    // coworker 는 프로퍼티에 accountId 만 저장되므로 이름/아바타 미상 → 페이지 루프 밖에서 1회 bulk resolve.
+    // coworker 는 프로퍼티에 accountId 만 저장되므로 이름/아바타 미상 → 집계 루프 밖에서 1회 bulk resolve.
     const coworkerIdsToResolve = new Set();
-    do {
-        // coworker 는 fields 가 아니라 이슈 프로퍼티(movesRms)에서 읽는다(팀 관리형 지원).
-        const url = route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100${nextPageToken ? `&nextPageToken=${nextPageToken}` : ''}`;
-
-
-        const result = await requestJiraJson({
-            as: 'user',
-            url,
-            logPrefix: '[GET ASSIGNEE USERS ]'
-        });
-
 
-        const issues = result?.issues || [];
-
-        issues.forEach(issue => {
-
-            const assignee = issue.fields.assignee;
-            const key = assignee?.accountId || 'unassigned';
-            const name = assignee?.displayName || 'unassigned';
-            const avatar = assignee?.avatarUrls?.["24x24"] || null;
-
-            if (!assigneeMap[key]) {
-                assigneeMap[key] = {
-                    accountId: key,
-                    name,
-                    avatar,
-                    value: 0
-                };
-            }
-            assigneeMap[key].value++;
-
-            // 협업자 포함하여 계산이 필요할때 — 프로퍼티 coworker(accountId[])
-            if (includeCoworker) {
-                const coworkers = issue.properties?.[MOVES_PROPERTY_KEY]?.coworkers ?? [];
-
-                coworkers.forEach(cKey => {
-                    if (!cKey) return;
-
-                    if (!assigneeMap[cKey]) {
-                        // 이름/아바타는 아직 미상(accountId 로 placeholder) → resolve 대상에 등록.
-                        assigneeMap[cKey] = {
-                            accountId: cKey,
-                            name: cKey,
-                            avatar: null,
-                            value: 0
-                        };
-                        coworkerIdsToResolve.add(cKey);
-                    }
-
-                    assigneeMap[cKey].value++;
-                });
-            }
-        });
-
-        nextPageToken = result?.nextPageToken || null;
+    // 1패스 페처(ProjectParticipantFetcher) 결과에서 집계만 한다. 순회 순서는 페이지 순서 그대로라
+    // 결과 배열의 순서도 종전과 같다.
+    const records = await getProjectParticipantIssues({projectId, viewerId});
+
+    records.forEach(record => {
+
+        const key = record.accountId || 'unassigned';
+        const name = record.displayName || 'unassigned';
+        const avatar = record.avatar || null;
+
+        if (!assigneeMap[key]) {
+            assigneeMap[key] = {
+                accountId: key,
+                name,
+                avatar,
+                value: 0
+            };
+        }
+        assigneeMap[key].value++;
+
+        // 협업자 포함하여 계산이 필요할때 — 프로퍼티 coworker(accountId[])
+        if (includeCoworker) {
+            record.coworkers.forEach(cKey => {
+                if (!cKey) return;
+
+                if (!assigneeMap[cKey]) {
+                    // 이름/아바타는 아직 미상(accountId 로 placeholder) → resolve 대상에 등록.
+                    assigneeMap[cKey] = {
+                        accountId: cKey,
+                        name: cKey,
+                        avatar: null,
+                        value: 0
+                    };
+                    coworkerIdsToResolve.add(cKey);
+                }
 
-    } while (nextPageToken);
+                assigneeMap[cKey].value++;
+            });
+        }
+    });
 
-    // 페이지 루프 밖 1회 bulk resolve — coworker 이름/아바타 부착(N+1 회귀 금지).
+    // 집계 루프 밖 1회 bulk resolve — coworker 이름/아바타 부착(N+1 회귀 금지).
     if (coworkerIdsToResolve.size > 0) {
         const results = await getBulkJiraUsersApi([...coworkerIdsToResolve], 'user');
         (results || []).forEach(res => {
             (res?.values || []).forEach(user => {
                 const entry = user?.accountId ? assigneeMap[user.accountId] : null;
                 if (entry) {
                     entry.name = user.displayName || entry.name;
                     entry.avatar = user.avatarUrls?.["24x24"] || null;
                 }
             });
         });
     }
 
     return Object.values(assigneeMap);
 };
 
-export const getIssueParticipantStats = async ({projectId, coworkerFieldId, includeCoworker = false}) => {
-
-    let nextPageToken = null;
+export const getIssueParticipantStats = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
 
     const issueStats = [];       // 이슈별 참여자 수
     let totalParticipants = 0;   // 전체 합
-    do {
-        // coworker 는 프로퍼티(movesRms)에서 읽는다. 참여자 수 집계(카운트만) → user resolve 불필요.
-        const url = route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100${nextPageToken ? `&nextPageToken=${nextPageToken}` : ''}`;
-
-        const result = await requestJiraJson({
-            as: 'user',
-            url,
-            logPrefix: '[GET ISSUE PARTICIPANTS ]'
-        });
-
-        const issues = result?.issues || [];
-
-        issues.forEach(issue => {
 
-            const participants = new Set();
+    // getAssigneeStats 와 **같은 1패스 페치 결과**를 쓴다(참여자 수 집계는 카운트만 → user resolve 불필요).
+    const records = await getProjectParticipantIssues({projectId, viewerId});
 
-            const assignee = issue.fields.assignee;
-            if (assignee?.accountId) {
-                participants.add(assignee.accountId);
-            }
+    records.forEach(record => {
 
-            if (includeCoworker) {
-                const coworkers = issue.properties?.[MOVES_PROPERTY_KEY]?.coworkers ?? [];
+        const participants = new Set();
 
-                coworkers.forEach(accountId => {
-                    if (accountId) {
-                        participants.add(accountId);
-                    }
-                });
-            }
+        if (record.accountId) {
+            participants.add(record.accountId);
+        }
 
-            const count = participants.size;
-
-            issueStats.push({
-                name: issue.key, // 이슈 이름
-                value: count // 개수
+        if (includeCoworker) {
+            record.coworkers.forEach(accountId => {
+                if (accountId) {
+                    participants.add(accountId);
+                }
             });
+        }
 
-            totalParticipants += count;
-        });
+        const count = participants.size;
 
-        nextPageToken = result?.nextPageToken || null;
+        issueStats.push({
+            name: record.issueKey, // 이슈 이름
+            value: count // 개수
+        });
 
-    } while (nextPageToken);
+        totalParticipants += count;
+    });
 
     const avg = issueStats.length
         ? totalParticipants / issueStats.length
         : 0;
 
     return {
         averageParticipants: avg,
         issueStats
     };
 };
 
 // 프로젝트에 할당된 이슈 조회
 export const getIssuesByProject =async ({projectId, nextPageToken}) => {
 
     const url = route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&maxResults=100${nextPageToken ? `&nextPageToken=${nextPageToken}` : ''}`;
 
     const result = await requestJiraJson({
         as: 'user',
         url,
         logPrefix: '[GET ISSUE BY PROJECT ]'
     });
 
     const issues = result?.issues || [];
     const returnNextPageToken = result?.nextPageToken || null;
 
     return {
         issues,
         returnNextPageToken
     }
 }
 
 /**
  * 프로젝트에 worklog가 있는 이슈 전체 조회
  * @param projectId
  * @param maxResults
  * @param startDate
  * @param endDate
  * @param accountId
  * @returns {Promise<*|*[]>}
  */
 export const getBulkIssuesByProject =async ({projectId, maxResults = 5000,startDate,endDate, accountId, as = 'user'}) => {
 
     let jql = `moves_RMS_projectId="${projectId}"`;
 
     if (startDate && endDate) {
         jql += ` AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
     }
 
     if (accountId){
         jql += ` AND worklogAuthor IN (${accountId.map(id => `"${id}"`).join(',')})`;
     }
 
     const url = route`/rest/api/3/search/jql?jql=${jql}&maxResults=${maxResults}&fields=worklog`;
 
     const result = await requestJiraJson({
         as,
         url,
         logPrefix: '[GET BULK ISSUE BY PROJECT]'
     });
 
     return  result?.issues || [];
 }
 /**
  * 프로젝트에 할당된 사용자의 이슈 조회
  * - 내가 assignee 인 이슈
  * - 내가 coworkerFieldId 협업자로 들어간 이슈 포함
  *
  * (나에게 할당된 이슈가 5천개가 넘지 않을 거라 가정)
  */
 export const getProjectIssuesByUser = async ({selectedProjectIds,
                                                  maxResults = 5000,
                                                  accountId, startDate, endDate,
                                                  coworkerFieldId}) => {
 
     const projectIds = Array.isArray(selectedProjectIds)
         ? selectedProjectIds
         : selectedProjectIds ? [selectedProjectIds] : [];
 
 
     const accountIds = Array.isArray(accountId)
diff --git a/src/rdb/query/ProjectDashboard.js b/src/rdb/query/ProjectDashboard.js
index 807a559..887e2dd 100644
--- a/src/rdb/query/ProjectDashboard.js
+++ b/src/rdb/query/ProjectDashboard.js
@@ -1,47 +1,47 @@
 export const ProjectDashboard = {
     "GETSUMMARY": `
         SELECT BIN_TO_UUID(p.project_id)     AS project_id,
                p.project_name,
 
                p.start_date,
                p.end_date,
 
                COUNT(DISTINCT pu.account_id) AS total_member_count,
                IFNULL(SUM(pu.salary), 0)     AS total_salary
 
         FROM project p
                  LEFT JOIN projectusers pu
                            ON p.project_id = pu.project_id
 
-        WHERE BIN_TO_UUID(p.project_id) = ?
+        WHERE p.project_id = UUID_TO_BIN(?)
 
         GROUP BY p.project_id
     `,
     "INSERT":`
         INSERT INTO project_dashboard (
             dashboard_id,
             project_id,
             dashboard_title,
             chart_type,
             data_type,
             pos_x,
             pos_y,
             width,
             height            
         ) VALUES (?,UUID_TO_BIN(?),?,?,?,?,?,?,?)
     `,
     DELETE_BY_DASHBOARD_ID:`
         DELETE FROM project_dashboard
         WHERE project_id = UUID_TO_BIN(?) AND dashboard_id = ? ;
     `,
     DELETE_BY_PROJECT_ID:`
         DELETE FROM project_dashboard
         WHERE project_id = UUID_TO_BIN(?)
     `,
     UPDATE_TITLE:`
         UPDATE project_dashboard
         SET
             dashboard_title = ?
         WHERE dashboard_id = ?
     `
 }
\ No newline at end of file
diff --git a/src/resolver/backoffice/level/LevelService.js b/src/resolver/backoffice/level/LevelService.js
index 8e052ad..323156e 100644
--- a/src/resolver/backoffice/level/LevelService.js
+++ b/src/resolver/backoffice/level/LevelService.js
@@ -1,189 +1,205 @@
 import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
 import {addCatalogItemsBulk} from '../CatalogBulkService';
 import crypto from 'crypto';
 import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
 import {LogicalError} from "../../../error/LogicalError";
 import {findUserWithLevel} from "../user/UserRepository";
 // 급여 정책(RFC-163) — 밴드 정규화·검증은 순수 모듈에 둔다(Forge 의존 없음).
 import {isValidSalaryBand, toBandAttribute} from "../../projectCost/SalaryPolicy";
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 const ENTITY = 'level';
 
 /**
  * 급여 밴드 3필드를 KVS 저장 형태로 정규화한다 (설계서 §3-2).
  *
  * ⚠ KVS 규약 — 빈 문자열 저장 거부 + integer attribute 에 null 금지
  *   → **미입력이면 속성 자체를 만들지 않는다.** `|| ''` / `null` 금지.
  * ⚠ `kvs.entity().set(id, {...data})` 는 **전체 치환**이므로, 속성을 생략하면 이전 값이 자동으로 사라진다
  *   (= 프론트가 빈 문자열을 보내면 밴드가 해제된다. 별도 삭제 API 불필요).
  * ⚠ 대표값 미전달 + min/max 유효 → `round((min+max)/2)` 서버 폴백(API 직접 호출 대비).
  */
 const buildBandAttributes = ({salaryMin, salaryMax, salaryRepresentative} = {}) => {
     const min = toBandAttribute(salaryMin);
     const max = toBandAttribute(salaryMax);
     let representative = toBandAttribute(salaryRepresentative);
 
     if (representative === undefined && min !== undefined && max !== undefined) {
         representative = Math.round((min + max) / 2);
     }
 
     const band = {
         ...(min !== undefined && {salaryMin: min}),
         ...(max !== undefined && {salaryMax: max}),
         ...(representative !== undefined && {salaryRepresentative: representative}),
     };
 
     if (!isValidSalaryBand(band)) {
         throw new LogicalError(
             ErrorCodes.LEVEL_SALARY_BAND_INVALID,
             'salaryMin must be >= 0 and <= salaryMax',
         );
     }
 
     return band;
 };
 
 /** KVS 저장값 → 응답 밴드 3필드. **미입력은 `null` 로 정규화**(프론트에 undefined 를 보내지 않는다, §6-1). */
 const toBandDto = (value = {}) => ({
     salaryMin: value?.salaryMin ?? null,
     salaryMax: value?.salaryMax ?? null,
     salaryRepresentative: value?.salaryRepresentative ?? null,
 });
 
 export const addLevelService = async (LevelData) =>{
     if(!LevelData.name ){
         throw new LogicalError(ErrorCodes.LEVEL_NAME_REQUIRED, ErrorCodes.LEVEL_NAME_REQUIRED)
     }
 
     const queryManager = customEntityManager(ENTITY);
 
     const id = "level-"+crypto.randomUUID();
 
     await checkDuplicated(queryManager, id, LevelData.name);
 
     // 밴드 3필드는 정규화해 저장한다(미입력 속성 생략). 나머지 필드는 기존 그대로.
     const {salaryMin, salaryMax, salaryRepresentative, ...rest} = LevelData;
     const saved = {
         ...rest,
         ...buildBandAttributes({salaryMin, salaryMax, salaryRepresentative}),
     };
 
     await queryManager.save(id, saved)
+    invalidateDictionary(ENTITY);
 
     return {
         data: {
             id,
             // 키 이름은 기존 계약 유지(`LevelData`). 값은 **실제 저장된** 정규화 결과다.
             LevelData: saved,
         },
     };
 }
 
-export const getLevelListService = async () =>{
+/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAll = 100건 캡)은 종전 그대로다. */
+const loadLevelList = async () => {
 
    const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findAll()).results;
 
-    const mappedData = rows.map(row => ({
+    return rows.map(row => ({
         id: row.key,
         name: row.value.name,
         description: row.value.description,
         // 급여 밴드(RFC-163) — 미설정 등급은 `null` 3개. 프론트가 undefined 분기를 하지 않게 한다.
         ...toBandDto(row.value),
         /*
          * 금액과 **분리된** "설정 여부" 신호. 비용 권한이 없으면 Controller 가 금액 3필드를
          * 지우는데, 급여 정책 화면의 "밴드 미설정 N개" 경고는 금액이 아니라 이 사실만 필요하다.
          * 금액으로 판정하게 두면 게이팅이 곧 경고 무력화가 된다.
          */
         hasSalaryBand: row.value?.salaryMin != null
             || row.value?.salaryMax != null
             || row.value?.salaryRepresentative != null,
     }));
+};
+
+export const getLevelListService = async () =>{
+    const mappedData = await readDictionary(ENTITY, loadLevelList);
 
+    // 캐시 값은 공유 객체다 — Controller 의 밴드 게이팅(gateLevelBands)이 원본을 건드리지 못하게
+    // 호출마다 얕은 복사해 반환한다(응답 shape 불변).
     return {
-        data: mappedData
+        data: mappedData.map(row => ({...row}))
     };
 }
 
 export const findLevelByIdService = async ({id}) =>{
 
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if(!result ){
         throw new LogicalError(ErrorCodes.LEVEL_NOT_FOUND, ErrorCodes.LEVEL_NOT_FOUND)
     }
 
     const levelData = {
         name: result.name,
         description: result.description,
         // 급여 밴드(RFC-163) — 미설정이면 `null` 3개(§6-1)
         ...toBandDto(result),
     }
 
     return {
         data: {
             id,
             levelData,
         },
     };
 }
 
 export const deleteLevelService = async (levelId) => {
 
     // 해당 래밸이 적용된 사용자 확인
     const res = await findUserWithLevel(levelId.id);
     if(res?.rows?.length > 0)
         throw new LogicalError(ErrorCodes.CAN_NOT_DELETE,ErrorCodes.CAN_NOT_DELETE);
 
     const queryManager = customEntityManager(ENTITY);
 
     await queryManager.delete(levelId.id);
+    invalidateDictionary(ENTITY);
 
     return ;
 }
 
 export const updateLevelService = async (levelData) => {
 
     const { id, name, description ,isNameChanged, salaryMin, salaryMax, salaryRepresentative} = levelData;
 
     const data = {
         name,
         description,
         // 급여 밴드(RFC-163). set() 은 전체 치환이라 미입력 속성을 생략하면 기존 밴드가 해제된다.
         ...buildBandAttributes({salaryMin, salaryMax, salaryRepresentative}),
     };
 
     const queryManager = customEntityManager(ENTITY);
 
     if (isNameChanged) {
         await checkDuplicated(queryManager, id, name);
     }
 
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
     return {
         data: {
             id,
             data,
         },
     };
 }
 
-export const addLevelBulkService = ({ items }) => addCatalogItemsBulk({
-    entity: ENTITY,
-    idPrefix: 'level',
-    items,
-    buildRecord: item => ({ name: item.name, description: item.description || '' }),
-});
+export const addLevelBulkService = async ({ items }) => {
+    const result = await addCatalogItemsBulk({
+        entity: ENTITY,
+        idPrefix: 'level',
+        items,
+        buildRecord: item => ({ name: item.name, description: item.description || '' }),
+    });
+    invalidateDictionary(ENTITY);
+    return result;
+};
 
 const checkDuplicated = async (queryManager, id, name) => {
     const { results = [] } = await queryManager.findByWhere('name',name);
 
     const duplicated = results.some(({ key }) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.LEVEL_NAME_DUPLICATED, ErrorCodes.LEVEL_NAME_DUPLICATED)
     }
 };
diff --git a/src/resolver/backoffice/projectStatus/ProjectStatusService.js b/src/resolver/backoffice/projectStatus/ProjectStatusService.js
index c95ed79..d134d5f 100644
--- a/src/resolver/backoffice/projectStatus/ProjectStatusService.js
+++ b/src/resolver/backoffice/projectStatus/ProjectStatusService.js
@@ -1,361 +1,380 @@
 import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
 import crypto from 'crypto';
 import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
 import {LogicalError} from "../../../error/LogicalError";
 import {getProjectByStatusId, updateProjectPartialService} from "../../project/ProjectService";
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 const ENTITY = 'status';
 
 export const addProjectStatusService = async (projectStatusData) =>{
 
     if(!projectStatusData.name ){
         throw new LogicalError(ErrorCodes.STATUS_NAME_REQUIRED, ErrorCodes.STATUS_NAME_REQUIRED)
     }
 
     const queryManager = customEntityManager(ENTITY);
 
     const id = "status-"+crypto.randomUUID();
 
     await checkDuplicated(queryManager, id, projectStatusData.name);
 
     await queryManager.save(id, {id,...projectStatusData})
+    invalidateDictionary(ENTITY);
 
     return {
         id,
         projectStatusData
     };
 }
 
 export const addProjectStatusFromKanbanService= async ({name,prev}) =>{
     if(!name ){
         throw new LogicalError(ErrorCodes.STATUS_NAME_REQUIRED, ErrorCodes.STATUS_NAME_REQUIRED)
     }
 
     const queryManager = customEntityManager(ENTITY);
     const linkManager = customEntityManager('status_link');
 
     const id = "status-"+crypto.randomUUID();
 
     if (!prev?.id) {
         throw new LogicalError("PREV_STATUS_REQUIRED", "이전 상태가 필요합니다.");
     }
 
     await checkDuplicated(queryManager, id, name);
 
     const data = {
         id: id,
         name: name,
         color:"grey",
         order:prev.order+1
     }
 
     const linkId = `${prev.id}-${id}`;
     const linkData = {
         id: linkId,
         from: prev.id,
         to: id,
     };
 
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
     try {
         await linkManager.save(linkId, linkData);// 연결 추가
     }catch (e){
         await queryManager.delete(id); //링크 실패시 해당 상태도 삭제
+        invalidateDictionary(ENTITY);
         throw e; // 롤백 후 반드시 실패를 전파 → responseWrapper 가 success:false 직렬화 (미전파 시 존재하지 않는 컬럼이 성공 처리됨)
     }
     return {id:id};
 }
 
 /**
  * 프로젝트 상태 전체 조회.
  * 계약: {rows:[...]} — 배열을 직접 반환하면 responseWrapper 가 {success, 0:…, 1:…} 로
  * 인덱스 스프레드해 프론트가 역조립해야 하고, 실패 응답(error)과 구분이 불가능해진다.
  */
-export const getProjectStatusListService = async () =>{
+/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAll = 100건 캡)은 종전 그대로다. */
+const loadProjectStatusList = async () => {
 
    const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findAll()).results;
 
+    return rows.map(row => ({
+        id: row.key,
+        name: row.value.name,
+        color: row.value.color,
+        order: row.value.order
+    }));
+};
+
+export const getProjectStatusListService = async () =>{
+    const rows = await readDictionary(ENTITY, loadProjectStatusList);
+
+    // 캐시 값은 공유 객체다 — 소비자 변형이 캐시를 오염시키지 않게 호출마다 얕은 복사(응답 shape 불변).
     return {
-        rows: rows.map(row => ({
-            id: row.key,
-            name: row.value.name,
-            color: row.value.color,
-            order: row.value.order
-        }))
+        rows: rows.map(row => ({...row}))
     };
 }
 
 /** 칸반 보드용 — 링크(순서)가 정의된 상태만. 계약: {rows:[...]} (위와 동일 사유) */
 export const getProjectStatusExistLinkService = async () => {
 
     const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findByFilterExists('name','order')).results;
 
     return {
         rows: rows
             .filter(row => row.value.order != null)
             .map(row => ({
                 id: row.key,
                 name: row.value.name,
                 color: row.value.color,
                 order: row.value.order
             }))
     };
 }
 
 export const findProjectStatusByIdService = async ({id}) =>{
 
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if(!result ){
         throw new LogicalError(ErrorCodes.STATUS_NOT_FOUND, ErrorCodes.STATUS_NOT_FOUND)
     }
 
     return {
         id : result.id,
         name: result.name,
         color: result.color,
         order:result.order
     }
 
 }
 
 export const deleteProjectStatusService = async ({id}) => {
 
     const statusManager = customEntityManager('status');
     const linkManager   = customEntityManager('status_link');
     // 상태 수 1개면 삭제 불가 처리
     const allStatus = (await statusManager.findByField('name')).results;
     if (allStatus.length <= 1) {
         throw new LogicalError("STATUS_MIN_REQUIRED", "STATUS_MIN_REQUIRED"); // 최소 1개의 상태가 필요합니다
     }
     // 링크 조회
     const linkList =  (await linkManager.findByField('from')).results;
 
     let incoming; // 현재 상태에 연결된
     let outgoing; // 현재 연결된
 
     linkList.forEach(statusLink => {
         const to = statusLink.value.to;
         const from = statusLink.value.from;
 
         if (to === id) incoming = statusLink;
         if (from === id) outgoing = statusLink;
     });
 
     const isIsolated = !incoming && !outgoing; // 새로 추가됐지만 링크가 없는 상태
     const isMiddle = incoming && outgoing;
     const isFirst  = !incoming && outgoing;
     const isLast   = incoming && !outgoing;
 
     if (isIsolated) {
         await statusManager.delete(id);
+        invalidateDictionary(ENTITY);
         return;
     }
 
     if (isFirst) {
         throw new LogicalError("PREV_STATUS_REQUIRED", "PREV_STATUS_REQUIRED"); //이전 상태가 없어 삭제할 수 없습니다
     }
     // 프로젝트 이전 상태 변경해주기
     const prevStatusId = incoming.value.from;
     const { rows: projectList }  = await getProjectByStatusId(id); // 삭제 대상 프로젝트 조회
     if(projectList.length !== 0){
         for (const project of projectList) { // 해당 프로젝트를 업데이트 해줌
             const data ={
                 project_id: project.project_id,
                 project_status_key: prevStatusId,
             };
             await updateProjectPartialService(data);
         }
     }
 
     // 중간일 때만 이어붙이기
     if (isMiddle) {
         const from = incoming.value.from;
         const to   = outgoing.value.to;
         const newId = `${from}-${to}`;
 
         const exist = await linkManager.findById(newId);
         if (!exist) {
             await linkManager.save(newId, { id: newId, from, to });
         }
     }
 
     // 기존 링크 삭제
     const linksToDelete = [incoming, outgoing].filter(Boolean);
     for (const link of linksToDelete) {
         await linkManager.delete(link.key);
     }
 
     // 상태 삭제
     await statusManager.delete(id);
+    invalidateDictionary(ENTITY);
 
     // 맨뒤면 order 재정의 불필요
     if (isLast) {
         return {prevStatusId:prevStatusId} ;
     }
 
     // 중간 or 맨앞 링크 재조회 후 순서 재정의
     const updatedLinksRes = await linkManager.findByField('from');
     const updatedLinks = updatedLinksRes.results ?? [];
 
     const edges = updatedLinks.map(l => ({
         source: l.value.from,
         target: l.value.to,
     }));
 
     if (edges.length > 0) {
         const orderedNodes = getOrderedNodes(edges);
         await saveStatusOrder(orderedNodes);
     }
 
     return {prevStatusId:prevStatusId} ;
 };
 
 
 export const updateProjectStatusService = async (statusData) => {
 
     const { id, name,  color,isNameChanged} = statusData;
 
     const data = {
         id,
         name,
         color
     };
 
     const queryManager = customEntityManager(ENTITY);
     const orgData = await queryManager.findById(id);
 
     if (isNameChanged) {
         await checkDuplicated(queryManager, id, name);
     }
 
     const finalData = {
         ...orgData,
         ...(name !== undefined && { name }),
         ...(color !== undefined && { color })
     };
 
     await queryManager.save(id, finalData);
+    invalidateDictionary(ENTITY);
     return {
         id,
         data,
     };
 }
 
 const checkDuplicated = async (queryManager, id, name) => {
     const {results = []} = await queryManager.findByWhere('name', name);
 
     const duplicated = results.some(({key}) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.STATUS_NAME_DUPLICATED, ErrorCodes.STATUS_NAME_DUPLICATED)
     }
 };
 
 
 
 export const setStatusLinkService = async (data) =>{
     const edges = data.edges;
     // 각 상태의 연결 저장
     await saveStatusLink(edges);
     //  엣지의 순서
     const orderedNodes = getOrderedNodes(edges);
 
     // 해당 연결 순서 업데이트
     await saveStatusOrder(orderedNodes);
     return;
 }
 
 const saveStatusLink = async (edges) =>{
     const queryManager = customEntityManager('status_link');
 
     const linksRes = await queryManager.findByField('from');
     const existing = linksRes.results;
     // 현재 정의 된 연결 전체 삭제
     for (const row of existing) {
         await queryManager.delete(row.key);
     }
     // 연결 새로 정의
     for (const { source, target } of edges) {
         const linkId = `${source}-${target}`;
 
         await queryManager.save(linkId, {
             id: linkId,
             from: source,
             to: target,
         });
 
     }
 }
 const getOrderedNodes = (edges) => {
     // 진입 간선 수 계산
     const inDegree = {};
     const graph = {};
 
     for (const { source, target } of edges) {
         if (!inDegree[source]) inDegree[source] = 0;
         if (!inDegree[target]) inDegree[target] = 0;
         if (!graph[source]) graph[source] = [];
 
         graph[source].push(target);
         inDegree[target]++;
     }
 
     // 진입 간선 0인 노드부터 시작 (= 맨 앞 노드)
     const queue = Object.keys(inDegree).filter(n => inDegree[n] === 0);
     const ordered = [];
 
     while (queue.length) {
         const node = queue.shift();
         ordered.push(node);
 
         for (const next of (graph[node] || [])) {
             inDegree[next]--;
             if (inDegree[next] === 0) queue.push(next);
         }
     }
 
     return ordered;
 }
 
 const saveStatusOrder = async (orderedNodes) => {
 
     const queryManager = customEntityManager('status');
 
     // 전체 상태 한 번만 조회
     const allStatusData = (await queryManager.findByField('name')).results;
 
     // orderedNodes에 없는 것들 order null 초기화
     const resetTargets = allStatusData.filter(s => !orderedNodes.includes(s.key));
 
     if(resetTargets.length !== 0){
         for (const existing of resetTargets) {
             await queryManager.save(existing.key, {
                 id: existing.key,
                 name: existing.value.name,
                 color : existing.value.color,
             });
         }
     }
     // 전체 조회 결과에서 필터링해서 재사용
     for (const [index, nodeId] of orderedNodes.entries()) {
         const existing = allStatusData.find(s => s.key === nodeId);
         await queryManager.save(nodeId, {
             id: existing.value.id,
             name: existing.value.name,
             color : existing.value.color,
             order: index + 1,
         });
     }
+
+    // order 재정의도 status 쓰기다 — 무효화를 빠뜨리면 칸반 순서가 "저장했는데 안 바뀜"이 된다.
+    invalidateDictionary(ENTITY);
 }
 
 export const getStatusLinkService = async () =>{
     const queryManager = customEntityManager('status_link');
     return await queryManager.findByField('from');
 }
diff --git a/src/resolver/backoffice/publicHoliday/PublicHolidayService.js b/src/resolver/backoffice/publicHoliday/PublicHolidayService.js
index 8394243..6f58f1a 100644
--- a/src/resolver/backoffice/publicHoliday/PublicHolidayService.js
+++ b/src/resolver/backoffice/publicHoliday/PublicHolidayService.js
@@ -1,95 +1,106 @@
 import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
 import crypto from 'crypto';
 import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
 import {LogicalError} from "../../../error/LogicalError";
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 const ENTITY = 'holiday';
 
 export const addPublicHolidayService = async (holidayData) => {
     const { name, holidayDate, workRatio } = holidayData;
 
     if (!name) {
         throw new LogicalError(ErrorCodes.HOLIDAY_NAME_REQUIRED, ErrorCodes.HOLIDAY_NAME_REQUIRED);
     }
     if (!holidayDate) {
         throw new LogicalError(ErrorCodes.HOLIDAY_DATE_REQUIRED, ErrorCodes.HOLIDAY_DATE_REQUIRED);
     }
 
     const queryManager = customEntityManager(ENTITY);
     const id = 'holiday-' + crypto.randomUUID();
 
     await checkDuplicatedDate(queryManager, id, holidayDate);
 
     const data = { name, holidayDate, workRatio: workRatio ?? 0 };
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
 
     return {
         data: { id, ...data },
     };
 };
 
-export const getPublicHolidayListService = async () => {
+/** KVS 로드 + 응답 매핑. 상한 규약(findByField 기본 100건)은 종전 그대로다(B-12 는 별건). */
+const loadPublicHolidayList = async () => {
     const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findByField('by-date')).results;
 
-    const mappedData = rows.map(row => ({
+    return rows.map(row => ({
         id: row.key,
         name: row.value.name,
         holidayDate: row.value.holidayDate,
         workRatio: row.value.workRatio,
     }));
+};
+
+export const getPublicHolidayListService = async () => {
+    const mappedData = await readDictionary(ENTITY, loadPublicHolidayList);
 
-    return { data: mappedData };
+    // 캐시 값은 공유 객체다 — 소비자 변형이 캐시를 오염시키지 않게 호출마다 얕은 복사(응답 shape 불변).
+    return { data: mappedData.map(row => ({...row})) };
 };
 
 export const findPublicHolidayByIdService = async ({ id }) => {
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if (!result) {
         throw new LogicalError(ErrorCodes.HOLIDAY_NOT_FOUND, ErrorCodes.HOLIDAY_NOT_FOUND);
     }
 
     return {
         data: {
             id,
             name: result.name,
             holidayDate: result.holidayDate,
             workRatio: result.workRatio,
         },
     };
 };
 
 export const deletePublicHolidayService = async ({ id }) => {
     const queryManager = customEntityManager(ENTITY);
     await queryManager.delete(id);
+    invalidateDictionary(ENTITY);
 };
 
 export const updatePublicHolidayService = async (holidayData) => {
     const { id, name, holidayDate, workRatio, isDateChanged } = holidayData;
 
     const queryManager = customEntityManager(ENTITY);
 
     if (isDateChanged) {
         await checkDuplicatedDate(queryManager, id, holidayDate);
     }
 
     const data = { name, holidayDate, workRatio };
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
 
     return {
         data: { id, ...data },
     };
 };
 
 const checkDuplicatedDate = async (queryManager, id, holidayDate) => {
     const { results = [] } = await queryManager.findByWhere('by-date', holidayDate);
 
     const duplicated = results.some(({ key }) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.HOLIDAY_DATE_DUPLICATED, ErrorCodes.HOLIDAY_DATE_DUPLICATED);
     }
 };
diff --git a/src/resolver/backoffice/role/RoleService.js b/src/resolver/backoffice/role/RoleService.js
index daf9a55..f083596 100644
--- a/src/resolver/backoffice/role/RoleService.js
+++ b/src/resolver/backoffice/role/RoleService.js
@@ -1,124 +1,138 @@
 import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
 import {addCatalogItemsBulk} from '../CatalogBulkService';
 import crypto from 'crypto';
 import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
 import {LogicalError} from "../../../error/LogicalError";
 import {findUserWithRole} from "../user/UserRepository";
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 const ENTITY = 'role';
 
 export const addRoleService = async (roleData) =>{
 
     if(!roleData.name ){
         throw new LogicalError(ErrorCodes.ROLE_NAME_REQUIRED, ErrorCodes.ROLE_NAME_REQUIRED)
     }
 
     const queryManager = customEntityManager(ENTITY);
 
     const id = "role-"+crypto.randomUUID();
 
     await checkDuplicated(queryManager, id, roleData.name);
 
     await queryManager.save(id, roleData)
+    invalidateDictionary(ENTITY);
 
     return {
         data: {
             id,
             roleData,
         },
     };
 }
 
-export const getRoleListService = async () =>{
-
+/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAll = 100건 캡)은 종전 그대로다. */
+const loadRoleList = async () => {
     const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findAll()).results;
 
     if(!rows) throw LogicalError(ErrorCodes.ROLE_NOT_FOUND);
 
-    const mappedData = rows.map(row => ({
+    return rows.map(row => ({
         id: row.key,
         name: row.value.name,
         description: row.value.description,
     }));
+};
 
+export const getRoleListService = async () =>{
+    const mappedData = await readDictionary(ENTITY, loadRoleList);
+
+    // 캐시 값은 공유 객체다 — 소비자 변형이 캐시를 오염시키지 않게 호출마다 얕은 복사(응답 shape 불변).
     return {
-        data: mappedData
+        data: mappedData.map(row => ({...row}))
     };
 }
 
 export const findRoleByIdService = async ({id}) =>{
 
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if(!result) throw LogicalError(ErrorCodes.ROLE_NOT_FOUND);
 
     const roleData = {
         name: result.name,
         description: result.description,
     }
 
     return {
         data: {
             id,
             roleData,
         },
     };
 }
 
 export const deleteRoleService = async (roleId) => {
     const res = await findUserWithRole(roleId.id);
     if(res?.rows?.length > 0)
         throw new LogicalError(ErrorCodes.CAN_NOT_DELETE,ErrorCodes.CAN_NOT_DELETE);
 
     const queryManager = customEntityManager(ENTITY);
 
     await queryManager.delete(roleId.id);
+    invalidateDictionary(ENTITY);
 
     return;
 }
 
 export const updateRoleService = async (roleData) => {
 
     const { id, name, description ,isNameChanged} = roleData;
 
     const data = {
         name,
         description
     };
 
     const queryManager = customEntityManager(ENTITY);
 
     if (isNameChanged) {
         await checkDuplicated(queryManager, id, name);
     }
 
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
     return {
         success: true,
         data: {
             id,
             data,
         },
     };
 }
 
-export const addRoleBulkService = ({ items }) => addCatalogItemsBulk({
-    entity: ENTITY,
-    idPrefix: 'role',
-    items,
-    buildRecord: item => ({ name: item.name, description: item.description || '' }),
-});
+export const addRoleBulkService = async ({ items }) => {
+    const result = await addCatalogItemsBulk({
+        entity: ENTITY,
+        idPrefix: 'role',
+        items,
+        buildRecord: item => ({ name: item.name, description: item.description || '' }),
+    });
+    invalidateDictionary(ENTITY);
+    return result;
+};
 
 const checkDuplicated = async (queryManager, id, name) => {
     const { results = [] } = await queryManager.findByWhere('name',name);
 
     const duplicated = results.some(({ key }) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.ROLE_NAME_DUPLICATED, ErrorCodes.ROLE_NAME_DUPLICATED)
     }
 };
diff --git a/src/resolver/backoffice/setting/SettingService.js b/src/resolver/backoffice/setting/SettingService.js
index 6d7544f..df8a3fa 100644
--- a/src/resolver/backoffice/setting/SettingService.js
+++ b/src/resolver/backoffice/setting/SettingService.js
@@ -1,70 +1,86 @@
 import {customEntityManager} from "../../../nosql/query/CustomEntityManager";
 import {LogicalError} from '../../../error/LogicalError';
 import {ErrorCodes} from '../../../utils/errors/ErrorCodes';
 import {DEFAULT_SETTINGS} from './SettingDefaults';
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 
 const ENTITY = 'settings';
 
-export const getSettingDataService = async () => {
+const loadSettingRecord = async () => {
     const queryManager = customEntityManager(ENTITY);
-    const saved = await queryManager.findById("settings");
+    return await queryManager.findById("settings");
+};
+
+/**
+ * A-7 — 소비자가 가장 많은 사전이다(진척/비용/자원/포트폴리오/작업배정/급여정책이 전부 읽는다).
+ *
+ * ⚠ **60초 stale 을 수용한다.** `salaryPolicy` 변경(INDIVIDUAL ↔ LEVEL_BAND)도 그 대상이라
+ *   정책을 바꿔도 다른 인스턴스는 최대 60초 동안 옛 정책으로 판정한다. 관리자 1인이 누르는
+ *   저빈도 설정 변경이고, 권한 판정이 이미 최대 90초 stale(TeamTree 60 + principal 30)을
+ *   수용하고 있어 같은 급의 경계다. 쓰기 경로(updateSetting)는 저장 직전 KVS 를 직접 읽는다.
+ */
+export const getSettingDataService = async () => {
+    const saved = await readDictionary(ENTITY, loadSettingRecord);
     // 기존 installation에는 새 attribute가 없을 수 있으므로 read에서도 기본값을 보충한다.
+    // (스프레드가 호출마다 새 객체를 만들므로 캐시 값이 소비자에게 공유되지 않는다.)
     return {...DEFAULT_SETTINGS, ...(saved ?? {})};
 };
 
 
 export const updateSettingService = async ({
     currency,
     hourRate,
     utilizationUnderBand,
     utilizationOverBand,
     utilizationRedBand,
     scopeTodoAmberRatio,
     scopeTodoRedRatio,
     progressThreshold,
     salaryPolicy,
 } = {}) => {
     const queryManager = customEntityManager(ENTITY);
 
     // 급여 정책(RFC-163) — 도메인 밖 값은 저장 전에 거부한다(§7-1).
     if (salaryPolicy != null && salaryPolicy !== 'INDIVIDUAL' && salaryPolicy !== 'LEVEL_BAND') {
         throw new LogicalError(
             ErrorCodes.SETTING_SALARY_POLICY_INVALID,
             "salaryPolicy must be 'INDIVIDUAL' or 'LEVEL_BAND'",
         );
     }
 
     if (
         progressThreshold != null
         && (typeof progressThreshold !== 'number'
             || !Number.isFinite(progressThreshold)
             || progressThreshold < 0
             || progressThreshold > 100)
     ) {
         throw new LogicalError(
             ErrorCodes.SETTING_PROGRESS_THRESHOLD_INVALID,
             'progressThreshold must be a finite number between 0 and 100',
         );
     }
 
     const prev = await queryManager.findById("settings");
 
     const next = {
         ...DEFAULT_SETTINGS,
         ...(prev ?? {}),
         ...(currency != null && { currency }),
         ...(hourRate != null && { hourRate }),
         ...(utilizationUnderBand != null && { utilizationUnderBand }),
         ...(utilizationOverBand != null && { utilizationOverBand }),
         ...(utilizationRedBand != null && { utilizationRedBand }),
         ...(scopeTodoAmberRatio != null && { scopeTodoAmberRatio }),
         ...(scopeTodoRedRatio != null && { scopeTodoRedRatio }),
         ...(progressThreshold != null && { progressThreshold }),
         ...(salaryPolicy != null && { salaryPolicy }),
     };
 
     await queryManager.save("settings", next);
+    invalidateDictionary(ENTITY);
     return {content: {settings: next}};
 };
 
diff --git a/src/resolver/backoffice/skill/SkillService.js b/src/resolver/backoffice/skill/SkillService.js
index a433000..1e7e928 100644
--- a/src/resolver/backoffice/skill/SkillService.js
+++ b/src/resolver/backoffice/skill/SkillService.js
@@ -1,155 +1,170 @@
 // 스킬 마스터 CRUD (RoleService 1:1 복제 + category 필드).
 // 마스터 사전 = KVS 'skill' 엔티티(role/level 패리티). 사용자/프로젝트 매핑은 SQL(SkillMappingQuery).
 // deleteSkill 은 사용중 가드: user_skills + project_skills 참조 > 0 → CAN_NOT_DELETE(role 의 findUserWithRole 가드와 동일 개념).
 
 import { customEntityManager } from '../../../nosql/query/CustomEntityManager';
 import { addCatalogItemsBulk, CATALOG_MAX_ITEMS } from '../CatalogBulkService';
 import crypto from 'crypto';
 import { ErrorCodes } from '../../../utils/errors/ErrorCodes';
 import { LogicalError } from '../../../error/LogicalError';
 import { executeQuery } from '../../../rdb/query/CommonQuery';
 import { SkillMappingQuery } from '../../../rdb/query/SkillMappingQuery';
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import { invalidateDictionary, readDictionary } from '../DictionaryCache';
 
 const ENTITY = 'skill';
 
 // Forge KVS 는 선언된 속성에 빈 문자열('')을 저장하면 "cannot be empty" 로 거부한다.
 // → 값이 없는(category/description) 속성은 payload 에서 아예 제외하고 저장한다.
 // (name 은 필수 가드 후 항상 존재. 응답 shape 은 별도로 '' 기본값을 유지한다.)
 const buildSkillEntity = ({ name, category, description }) => {
     const entity = { name };
     if (category) entity.category = category;
     if (description) entity.description = description;
     return entity;
 };
 
 export const addSkillService = async (skillData) => {
     if (!skillData.name) {
         throw new LogicalError(ErrorCodes.SKILL_NAME_REQUIRED, ErrorCodes.SKILL_NAME_REQUIRED);
     }
 
     const queryManager = customEntityManager(ENTITY);
 
     const id = 'skill-' + crypto.randomUUID();
 
     await checkDuplicated(queryManager, id, skillData.name);
 
     const data = {
         name: skillData.name,
         category: skillData.category ?? '',
         description: skillData.description ?? '',
     };
 
     await queryManager.save(id, buildSkillEntity(data));
+    invalidateDictionary(ENTITY);
 
     return {
         data: {
             id,
             skillData: data,
         },
     };
 };
 
-export const getSkillListService = async () => {
+/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAllPaged, bulk 경로와 같은 상수)은 종전 그대로다. */
+const loadSkillList = async () => {
     const queryManager = customEntityManager(ENTITY);
 
     // 스킬 프리셋만 133건이라 findAll() 의 100건 하드캡에 걸린다. 목록·필터·스킬 매핑과
     // quick-add 의 "이미 존재" 표시가 모두 이 응답을 쓰므로 잘리면 중복 등록까지 유발한다.
     // 상한은 bulk 경로와 같은 값을 쓴다 — 둘이 갈리면 "목록엔 없는데 저장은 거부"가 생긴다.
     const rows = (await queryManager.findAllPaged('name', 100, CATALOG_MAX_ITEMS)).results;
 
     if (!rows) throw new LogicalError(ErrorCodes.SKILL_NOT_FOUND, ErrorCodes.SKILL_NOT_FOUND);
 
-    const mappedData = rows.map(row => ({
+    return rows.map(row => ({
         id: row.key,
         name: row.value.name,
         category: row.value.category ?? '',
         description: row.value.description ?? '',
     }));
+};
 
+export const getSkillListService = async () => {
+    const mappedData = await readDictionary(ENTITY, loadSkillList);
+
+    // 캐시 값은 공유 객체다 — 소비자 변형이 캐시를 오염시키지 않게 호출마다 얕은 복사(응답 shape 불변).
     return {
-        data: mappedData,
+        data: mappedData.map(row => ({...row})),
     };
 };
 
 export const findSkillByIdService = async ({ id }) => {
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if (!result) throw new LogicalError(ErrorCodes.SKILL_NOT_FOUND, ErrorCodes.SKILL_NOT_FOUND);
 
     const skillData = {
         name: result.name,
         category: result.category ?? '',
         description: result.description ?? '',
     };
 
     return {
         data: {
             id,
             skillData,
         },
     };
 };
 
 export const deleteSkillService = async ({ id }) => {
     // 사용중 가드: user_skills + project_skills 참조 건수
     const { rows } = await executeQuery(SkillMappingQuery.COUNT_USES_BY_SKILL, [id, id]);
     const uses = Number(rows?.[0]?.total ?? 0);
     if (uses > 0) {
         throw new LogicalError(ErrorCodes.CAN_NOT_DELETE, ErrorCodes.CAN_NOT_DELETE);
     }
 
     const queryManager = customEntityManager(ENTITY);
     await queryManager.delete(id);
+    invalidateDictionary(ENTITY);
 
     return;
 };
 
 export const updateSkillService = async (skillData) => {
     const { id, name, category, description, isNameChanged } = skillData;
 
     const data = {
         name,
         category: category ?? '',
         description: description ?? '',
     };
 
     const queryManager = customEntityManager(ENTITY);
 
     if (isNameChanged) {
         await checkDuplicated(queryManager, id, name);
     }
 
     await queryManager.save(id, buildSkillEntity(data));
+    invalidateDictionary(ENTITY);
 
     return {
         success: true,
         data: {
             id,
             data,
         },
     };
 };
 
-export const addSkillBulkService = ({ items }) => addCatalogItemsBulk({
-    entity: ENTITY,
-    idPrefix: 'skill',
-    items,
-    // 빈 값 속성 제외는 buildSkillEntity 가 담당한다(KVS 가 빈 문자열을 거부한다)
-    buildRecord: item => buildSkillEntity({
-        name: item.name,
-        category: item.category ?? '',
-        description: item.description ?? '',
-    }),
-});
+export const addSkillBulkService = async ({ items }) => {
+    const result = await addCatalogItemsBulk({
+        entity: ENTITY,
+        idPrefix: 'skill',
+        items,
+        // 빈 값 속성 제외는 buildSkillEntity 가 담당한다(KVS 가 빈 문자열을 거부한다)
+        buildRecord: item => buildSkillEntity({
+            name: item.name,
+            category: item.category ?? '',
+            description: item.description ?? '',
+        }),
+    });
+    invalidateDictionary(ENTITY);
+    return result;
+};
 
 const checkDuplicated = async (queryManager, id, name) => {
     const { results = [] } = await queryManager.findByWhere('name', name);
 
     const duplicated = results.some(({ key }) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.SKILL_NAME_DUPLICATED, ErrorCodes.SKILL_NAME_DUPLICATED);
     }
 };
diff --git a/src/resolver/myWork/MyWorkService.jsx b/src/resolver/myWork/MyWorkService.jsx
index a4275d9..137cee4 100644
--- a/src/resolver/myWork/MyWorkService.jsx
+++ b/src/resolver/myWork/MyWorkService.jsx
@@ -34,169 +34,171 @@ export const getMyProjectListService = async ({ accountId }) => {
     );
 
     const data = myProjects.map(project => ({
         ...project,
         role: roleMap.get(project.role_key) || null,
         level: levelMap.get(project.level_key) || null,
         status: statusMap.get(project.project_status_key) || null,
     }));
 
     return {
         success: true,
         data
     };
 };
 /**
  * 프로젝트에 할당된 이슈 조회 + 이슈에 20개 이상 워크로그 존재시 추가 로드
  * @param accountId
  * @param selectedProjectIds
  * @param startDate
  * @param endDate
  * @param coworkerFieldId
  * @returns {Promise<{data: FlatArray<Awaited<[]|*[]>[], 1>[]}>}
  */
 export const getProjectWorklogService = async ({ accountId,selectedProjectIds, startDate, endDate, coworkerFieldId }) =>{
 
     const {issues} = await getProjectIssuesByUser({
         selectedProjectIds,
         accountId,
         startDate,
         endDate,
         coworkerFieldId
     });
 
     const limit = pLimit(5);
 
     const worklogChunks = await Promise.all(
         issues.map(issue =>
             limit(() =>
                 processIssue(issue, startDate, endDate)
             )
         )
     );
     return {
         data: worklogChunks.filter(Boolean)
     };
 }
 
 const processIssue = async (issue, startDate, endDate) => {
     const { worklog } = issue.fields;
 
     // worklog 없는 이슈 skip
     if (!worklog || worklog.total === 0) return (startDate && endDate) ? null : issue;
 
     // 20개 이상이면 추가 조회해서 합치기
     if (worklog.total > worklog.maxResults) {
         const extra = await getExtraWorklogs(issue.key, worklog.maxResults);
         worklog.worklogs.push(...extra);
     }
 
     // 워크로그 날짜 필터링
     const filtered = worklog.worklogs.filter(wl => {
         if (!startDate || !endDate) return true;
         return isInRange(wl.started.substring(0, 10), startDate, endDate);
     });
 
     if (filtered.length === 0) return (startDate && endDate) ? null : issue;
 
     // 필터된 워크로그로 issue 반환
     return {
         ...issue,
         fields: {
             ...issue.fields,
             worklog: {
                 ...worklog,
                 worklogs: filtered,
             },
         },
     };
 };
 
+// startAt=20 은 검색 응답에 인라인되는 워크로그 상한(worklog.maxResults)이고,
+// 페이지 크기는 그와 무관하다 — maxResult 는 넘기지 않고 WorklogApi.getWorkLogByIssueKey 의
+// 기본값(100)을 그대로 쓴다(WorklogService.getExtraWorklogs 와 같은 출처를 공유).
 const getExtraWorklogs = async (issueKey, startAt = 20) => {
     let all = [];
     let currentStartAt = startAt;
 
     while (true) {
         const res = await getWorkLogByIssueKey({
             issueIdOrKey: issueKey,
-            startAt: currentStartAt,
-            maxResult: 20});
+            startAt: currentStartAt});
         const logs = res?.worklogs || [];
 
         all.push(...logs);
 
         currentStartAt += logs.length;
 
         if (!logs.length || currentStartAt >= res.total) {
             break;
         }
     }
 
     return all;
 };
 /**
  * myWork 캘린더 전용 - 내가 작성한 워크로그만 조회.
  * worklogAuthor 기준으로 이슈를 가져오고(담당자/협업자 무관), 워크로그도 author===accountId 로 필터링한다.
  * 캘린더 전용 경로로, 테이블(getProjectWorklogService)에는 영향을 주지 않는다.
  */
 export const getMyCalendarWorklogService = async ({ accountId, selectedProjectIds, startDate, endDate }) => {
 
     const { issues } = await getIssuesByWorklogAuthor({
         selectedProjectIds,
         accountId,
         startDate,
         endDate
     });
 
     const limit = pLimit(5);
 
     const worklogChunks = await Promise.all(
         issues.map(issue =>
             limit(() => processMyIssue(issue, accountId, startDate, endDate))
         )
     );
 
     return {
         data: worklogChunks.filter(Boolean)
     };
 };
 
 const processMyIssue = async (issue, accountId, startDate, endDate) => {
     const { worklog } = issue.fields;
 
     if (!worklog || worklog.total === 0) return null;
 
     let allWorklogs = worklog.worklogs;
 
     // 20개 초과면 추가 조회해서 합치기
     if (worklog.total > worklog.maxResults) {
         const extra = await getExtraWorklogs(issue.key, worklog.maxResults);
         allWorklogs = [...allWorklogs, ...extra];
     }
 
     // 내가 작성한 워크로그 + 날짜 범위 필터
     const filtered = allWorklogs.filter(wl => {
         if (wl.author?.accountId !== accountId) return false;
         if (!startDate || !endDate) return true;
         return isInRange(wl.started.substring(0, 10), startDate, endDate);
     });
 
     if (filtered.length === 0) return null;
 
     return {
         ...issue,
         fields: {
             ...issue.fields,
             worklog: {
                 ...worklog,
                 worklogs: filtered,
             },
         },
     };
 };
 
 /**
  * 테이블 조회 로직 프론튿에서 20개 이상인 워크로그 조회 연산 => 이후 getProjectWorklogService 한번에 조회하는 로직에서 문제 발생시 대체 방안으로 사용
  * @param accountId
  * @param selectedProjectIds
  * @param coworkerFieldId
  * @returns {Promise<{data: []}>}
diff --git a/src/resolver/projectDashboard/ProjectDashboardService.js b/src/resolver/projectDashboard/ProjectDashboardService.js
index 2cd1484..27f11e4 100644
--- a/src/resolver/projectDashboard/ProjectDashboardService.js
+++ b/src/resolver/projectDashboard/ProjectDashboardService.js
@@ -123,230 +123,237 @@ export const getChartDataService = async ({ project_id ,coworkerFieldId, startDa
         rows.map(async (row) => {
             // startDate/endDate 는 인자로 받는다. 과거엔 스코프에 없는 변수를 참조해
             // 이 함수가 호출되는 즉시 ReferenceError 였다(프론트가 getChartDataById 만 써서 미발현).
             const chartData = await getChartDataset({
                 project_id,
                 dataType: row.data_type,
                 chartType: row.chart_type,
                 coworkerFieldId,
                 startDate,
                 endDate,
                 accountId,
                 principal, // salary 데이터셋 게이트(U7)
                 salaryPolicy
             });
 
             return {
                 dashboard_id: row.dashboard_id,
                 project_id: project_id,
                 dashboard_title: row.dashboard_title,
                 chart_type: row.chart_type,
                 data_type: row.data_type,
                 pos_x: row.pos_x,
                 pos_y: row.pos_y,
                 width: row.width,
                 height: row.height,
                 chartData,
             };
         })
     );
 
     return {
         rows: result,
     };
 };
 
 /**
  * 재무 민감 데이터셋(salary) 열람 가능 여부 (U7).
  *
  * 대시보드 resolver 의 가드는 DASHBOARD read 인데, 시드 Member 가 DASHBOARD read 를 가진다
  * (ResourceCatalog: DASHBOARD member=rf). 따라서 salary 데이터셋이 게이트 없이 나가면
  * 전 사용자가 프로젝트 급여의 min/max/avg/median 을 보게 된다 — PROJECT_COST 를 member=ff 로
  * 막아둔 의도가 이 경로로 우회된다. 인원이 적으면 min/max 는 사실상 개인 급여다.
  *
  * 판정은 PROJECT_COST read 기준(getProjectSalaryList / getProjectCostSummary 와 동일 게이트).
  * principal 이 없으면(전달 누락) fail-close 로 거부한다.
  */
 // P2-c — 이 판정은 `src/permission/CostAccess.js` 로 승격됐다(§16 C4). 복사본을 만들지 말 것.
 //   승격식은 문자 그대로 동일하므로 동작 차이가 없다.
 
 // P3-A 팀 미지정 — SQL 센티널과 라벨. `UserQuery.TEAM_COUNT` / `mapCountWithMeta` 와 같은 규약이다.
 const UNASSIGNED_TEAM_KEY = 'NONE';
 const UNASSIGNED_TEAM_LABEL = 'Unassigned';
 
 const getChartDataset = async ({ project_id, dataType, chartType,coworkerFieldId ,startDate,endDate,accountId, principal, salaryPolicy = null}) => {
     switch (dataType) {
         case "level":
             return await getLevelChartData(project_id, chartType);
         case "role":
             return await getRoleChartData(project_id, chartType);
         case "team":
             return await getTeamChartData(project_id, chartType);
         case "salary":
             // 권한 없으면 데이터를 만들지 않고 거부 신호를 담은 빈 결과를 반환한다.
             // 예외를 던지지 않는 이유: 이미 대시보드에 배치된 위젯이 있으면 대시보드 전체가 깨진다.
             // 조용히 빈 값만 주지도 않는다(§조용한 실패 금지) — denied 플래그로 프론트가 안내할 수 있게 한다.
             if (!canReadCost(principal)) {
                 return { denied: true, reason: COST_DENIED_REASON, histogram: [], summary: null, labels: [], datasets: [] };
             }
             /*
              * 급여 정책(RFC-163) — LEVEL_BAND 에서는 **프로젝트 급여 히스토그램을 만들지 않는다.**
              *   이 위젯의 입력은 `projectusers.salary` **원시값**이고 출력 `summary.{min,max}` 는
              *   정의상 특정 개인의 금액이다(전사 히스토그램과 성격이 다르다 — §5-3).
              *   ⚠ 권한 축이 먼저 판정된다(위 canReadCost). 둘 다 걸리면 PROJECT_COST_REQUIRED 가 이긴다.
              *   ⚠ `getSalaryRepository` 를 **호출조차 하지 않는다**(SalaryChartGate.test.js 관례).
              */
             if (!canShowIndividualSalary(salaryPolicy)) {
                 return { denied: true, reason: SALARY_HIDDEN_REASON, histogram: [], summary: null, labels: [], datasets: [] };
             }
             return await getSalaryChartData(project_id, chartType);
         case "assignee":
-            return getAssigneeChartData(project_id,chartType,coworkerFieldId);
+            // A-3 — principal.accountId 는 참여자 페처의 인스턴스 캐시 키다(가시 범위 혼입 방지). 없으면 캐시 미사용.
+            return getAssigneeChartData(project_id,chartType,coworkerFieldId, principal?.accountId ?? null);
         case "issue":
-            return getIssueChartData(project_id,chartType,coworkerFieldId);
+            return getIssueChartData(project_id,chartType,coworkerFieldId, principal?.accountId ?? null);
         case "worklog":
             return getWorklogChartData(project_id,chartType,startDate,endDate,accountId)
         default:
             return [];
     }
 };
 // 등급별 인원 수
 const getLevelChartData = async (project_id, chartType) => {
     const levelRes = await getLevelListService();
     const levelData = levelRes?.data ?? levelRes?.content ?? [];
     const levelMap = new Map(levelData.map((level) => [level.id, level]));
 
     const rows = await groupByLevelRepository(project_id);
     const normalizedRows = normalizeLabelRows(rows, levelMap);
     return formatChartData(normalizedRows, chartType);
 };
 //역할 별 인원 수
 const getRoleChartData = async (project_id, chartType) => {
     const roleRes = await getRoleListService();
     const roleData = roleRes?.data ?? roleRes?.content ?? [];
     const roleMap = new Map(roleData.map((role) => [role.id, role]));
 
     const rows = await groupByRoleRepository(project_id);
     const normalizedRows = normalizeLabelRows(rows, roleMap);
     return formatChartData(normalizedRows, chartType);
 };
 /**
  * P3-A 팀별 인원 수 — role/level 과 **같은 3단 파이프라인**(조회 → 라벨 정규화 → 차트 포맷).
  *
  * ⚠ **재무 축이 아니다.** 인원 수만 센다 — `PROJECT_COST` 게이트가 필요 없고
  *   `salary` 데이터셋처럼 `canReadCost` 로 막지 않는다(막으면 DASHBOARD read 사용자가 팀 위젯을 못 쓴다).
  *
  * ⚠ 팀 미지정(`'NONE'`)은 `mapCountWithMeta` 와 **같은 규약**으로 라벨을 붙인다.
  *   [알려진 한계] 그 규약이 영문 리터럴이라 한국어 UI 에도 "Unassigned" 로 나온다 —
  *   고칠 때는 `UserService.mapCountWithMeta` 와 **함께** 고쳐야 두 화면이 갈리지 않는다.
  */
 const getTeamChartData = async (project_id, chartType) => {
     const rows = await groupByTeamRepository(project_id);
 
     // teamIndex.byKey 값은 `{teamKey, name, ...}` 이라 `normalizeLabelRows` 의 `label?.name` 규약과 그대로 맞는다.
     const teamIndex = await getTeamIndex();
     const teamMap = teamIndex?.byKey ?? new Map();
 
     const labeled = rows.map((row) => (
         row.name === UNASSIGNED_TEAM_KEY ? { ...row, name: UNASSIGNED_TEAM_LABEL } : row
     ));
 
     const normalizedRows = normalizeLabelRows(labeled, teamMap);
     return formatChartData(normalizedRows, chartType);
 };
 
 // 급여 데이터
 const getSalaryChartData = async (project_id, chartType) =>{
     const result = await getSalaryRepository(project_id);
     const salaries = result.map(r => r.salary);
     const salaryData = buildSalaryDistribution(salaries);
     return formatSalaryChartData(salaryData,chartType);
 }
+/*
+ * A-3 — 담당자 위젯과 이슈(참여자) 위젯은 **문자 단위로 같은 검색**을 각자 전량 스캔했다.
+ *   페치는 `ProjectParticipantFetcher` 가 1패스로 담당하고 두 함수는 집계만 파생한다.
+ *   두 위젯이 각각 invoke 되는 구조(프론트 `ChartTemplate`)는 그대로이므로, 요청 간 중복은
+ *   그 페처의 60초 인스턴스 캐시가 흡수한다(캐시 키에 viewerId 포함 — 가시 범위 혼입 방지).
+ */
 // 담당자 데이터
-const getAssigneeChartData = async (project_id, chartType,coworkerFieldId) =>{
-    const param = {projectId:project_id};
+const getAssigneeChartData = async (project_id, chartType,coworkerFieldId, viewerId = null) =>{
+    const param = {projectId:project_id, viewerId};
     const rows = await getAssigneeStatsService(param);
     return formatChartData(rows,chartType);
 }
 
-const getIssueChartData = async (project_id,  chartType,coworkerFieldId) =>{
-    const param = {projectId:project_id,coworkerFieldId,includeCoworker:true};
+const getIssueChartData = async (project_id,  chartType,coworkerFieldId, viewerId = null) =>{
+    const param = {projectId:project_id,coworkerFieldId,includeCoworker:true, viewerId};
     const issueData = await getIssueParticipantStatsService(param);
 
     return formatChartData(issueData.issueStats,chartType);
 }
 
 const getWorklogChartData = async (project_id,  chartType,startDate,endDate,accountId) =>{
     return formatWorklogChartData(project_id,  chartType,startDate,endDate,accountId);
 }
 // 급여 분포 계산
 const buildSalaryDistribution = (salaries, bucketCount = 5) => {
     if (!salaries || salaries.length === 0) {
         return {
             histogram: [],
             summary: null
         };
     }
     // 정렬
     const sorted = [...salaries].sort((a, b) => a - b);
 
     const n = sorted.length;
 
     // 기본 통계
     const min = sorted[0];
     const max = sorted[n - 1];
     const sum = sorted.reduce((acc, v) => acc + v, 0);
     const avg = Math.round(sum / n);
     // 중앙 값
     const median =
         n % 2 === 0
             ? Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
             : sorted[Math.floor(n / 2)];
 
     if (min === max) {
         return {
             histogram: [
                 {
                     range: `${min}`,
                     count: n
                 }
             ],
             summary: { min, max, avg, median }
         };
     }
 
     const q1 = sorted[Math.floor(n * 0.25)];
     const q3 = sorted[Math.floor(n * 0.75)];
     const iqr = q3 - q1;
 
     const lowerBound = q1 - 1.5 * iqr;
     const upperBound = q3 + 1.5 * iqr;
 
     const normalValues = sorted.filter(v => v >= lowerBound && v <= upperBound);
     const outliers = sorted.filter(v => v < lowerBound || v > upperBound);
 
     const normalMin = normalValues[0];
     const normalMax = normalValues[normalValues.length - 1];
 
     /*
      * 전체 min !== max 여도 IQR 로 이상치를 걷어내면 남은 값이 전부 같을 수 있다(예: [3000,3000,3000,3000,9000]).
      * 그때 step 이 0 이 되어 아래 bucket index 가 0/0 = NaN 이 되고 buckets[NaN] 접근에서 터진다.
      * 값이 하나뿐인 분포이므로 구간을 나누지 않고 단일 bucket 으로 돌려준다.
      */
     if (normalMax === normalMin) {
         const histogram = [{ range: `${normalMin}`, count: normalValues.length }];
         if (outliers.length > 0) {
             histogram.push({ range: "Outliers", count: outliers.length });
         }
         return { histogram, summary: { min, max, avg, median } };
     }
 
     const step = Math.ceil((normalMax - normalMin) / bucketCount);
 
     const buckets = [];
 
     for (let i = 0; i < bucketCount; i++) {
         const start = normalMin + step * i;
         const end = i === bucketCount - 1
             ? normalMax
             : start + step;
 
diff --git a/src/resolver/projectIssue/ProjectUsersService.js b/src/resolver/projectIssue/ProjectUsersService.js
index a5c7eb7..ad275cd 100644
--- a/src/resolver/projectIssue/ProjectUsersService.js
+++ b/src/resolver/projectIssue/ProjectUsersService.js
@@ -220,168 +220,175 @@ export const getProjectSalaryListService = async ({page = 1, pagesize = 10, proj
     return {rows, meta: {projectMonths, salaryPolicy: policy, unpricedMemberCount}};
 };
 
 /**
  * 급여 관리 탭 편집 (급여 관리 리뉴얼).
  * salary / salary_type 중 전송된 것만 갱신(빈 문자열/undefined = 미변경, CASE '' 패턴).
  * @param salary 투입 급여(미변경 시 '')
  * @param salary_type 계산 모드 'PROJECT'|'ANNUAL'(미변경 시 '')
  * @param project_member_id 대상 projectusers PK(uuid)
  * @param accountId 수정자 accountId(context)
  * @returns {Promise<Result<*>>} 수정 결과
  */
 export const updateProjectMemberSalaryService = async ({salary = '', salary_type = '', project_member_id}, {accountId}) => {
     /*
      * 급여 정책(RFC-163, D5) — LEVEL_BAND 에서는 투입급여·계산모드가 **계산에 쓰이지 않는다**.
      *   쓰이지 않는 값을 편집하게 두면 "왜 숫자가 안 바뀌나"가 발생하므로 서버가 거부한다.
      *   ⚠ write 경로이므로 정책 조회 실패는 예외 전파(= 거부). 이것이 fail-close 방향과 정합한다.
      */
     const {policy} = await loadSalaryPolicyContext();
     if (policy === SALARY_POLICY.LEVEL_BAND) {
         throw new LogicalError(
             ErrorCodes.SALARY_POLICY_LEVEL_BAND,
             'individual salary is read-only while salaryPolicy is LEVEL_BAND',
         );
     }
 
     // 빈 문자열은 "미변경" 의미이므로 통과. 값이 있을 때만 유효성 검사.
     if (salary_type !== '' && !VALID_SALARY_TYPES.includes(salary_type)) {
         throw new LogicalError('INVALID_SALARY_TYPE', `Invalid salary_type: ${salary_type}`);
     }
 
     const params = [
         salary,
         salary,
         salary_type,
         salary_type,
         accountId,
         project_member_id,
     ];
 
     return await updateSalaryByKeyRepository(params);
 };
 
 /**
  * 프로젝트 상세 > 작업 데이터 등록 / 수정
  * @param customFieldId 등록 / 수정하려는 customFieldId => 참고 customField.js
  * @param issueId 등록 / 수정 하려는 issueId
  * @param value 등록 / 수정 하려는 value
  * @returns {Promise<void>}
  */
 export const updateProjectIdFieldService = async ({customFieldId, issueId, value}) => {
     // ★ 앱 필드 write 는 AppFieldValueApi 가 유일 경로다(RFC-171). value 는 **직렬화 전 원본값**을
     //   넘긴다 — 과거처럼 호출부가 JSON 조각 문자열을 조립하지 않는다.
     //   coworker(user 컬렉션)는 [{accountId}], 그 외(projectId 등)는 문자열.
     const rawValue = Array.isArray(value)
         ? value.map(accountId => ({accountId}))
         : String(value ?? '');
 
     await setAppFieldValueForIssues({
         fieldIdOrKey: customFieldId,
         issueIds: issueId,
         value: rawValue,
     });
 }
 
 /**
  * 프로젝트 상세 > 작업 데이터 삭제
  * @param customFieldId 삭제하려는 customFieldId => 참고 customField.js
  * @param issueId 삭제하려는 issueId
  * @returns {Promise<void>}
  */
 export const deleteProjectIssueService = async ({customFieldId, issueId}) => {
     // 빈 문자열 = 필드 값 해제(기존 동작과 동일: body 의 value 가 "")
     await setAppFieldValueForIssues({
         fieldIdOrKey: customFieldId,
         issueIds: issueId,
         value: '',
     });
 }
 
+/*
+ * A-3 — 두 통계는 같은 검색을 1패스로 공유한다(ProjectParticipantFetcher).
+ *   `viewerId`(호출자 accountId)는 그 페처의 **인스턴스 캐시 키**로만 쓰인다. 검색이 `as:'user'` 라
+ *   결과가 호출자 권한으로 필터링되므로 사용자별로 갈라야 가시 범위가 섞이지 않는다.
+ *   전달되지 않으면 캐시를 쓰지 않는다(fail-safe) — 응답 shape·집계 결과는 종전과 동일하다.
+ */
+
 // 인력별 할당 이슈 개수
-export const getAssigneeStatsService = async ({projectId, coworkerFieldId, includeCoworker = false}) => {
-    return await getAssigneeStats({projectId, coworkerFieldId, includeCoworker});
+export const getAssigneeStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
+    return await getAssigneeStats({projectId, coworkerFieldId, includeCoworker, viewerId});
 }
 
 // 이슈별 참여 인원 개수
-export const getIssueParticipantStatsService = async ({projectId, coworkerFieldId, includeCoworker = false}) => {
-    return  await getIssueParticipantStats({projectId, coworkerFieldId, includeCoworker});
+export const getIssueParticipantStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
+    return  await getIssueParticipantStats({projectId, coworkerFieldId, includeCoworker, viewerId});
 }
 
 export const getProjectUserWithScrollService = async ({project_id, cursor = null, limit = 5}) => {
     // 1. DB 조회
     const rows = await getProjectUserWithScrollRepository({project_id, cursor, limit});
 
     if (!rows || rows.length === 0) {
         return {
             data: [],
             nextCursor: null,
             hasMore: false
         };
     }
 
     // 2. accountId 추출
     const accountIds = rows
         .map(r => r.account_id)
         .filter(Boolean);
 
     // 3. 사용자 api 조회
     const jiraResults = await getBulkJiraUsersApi(accountIds);
 
     // 4. 병합을 위한 map
     const jiraMap = new Map();
 
     jiraResults.forEach(res => {
         res?.values?.forEach(user => {
             jiraMap.set(user.accountId, user);
         });
     });
 
     // 5. 사용자 정보 병합 추후 필요시 분리
     const merged = rows.map(row => {
         const jiraUser = jiraMap.get(row.account_id);
         return {
             ...row,
             emailAddress: jiraUser?.emailAddress ?? 'Unknown User',
             displayName: jiraUser?.displayName ?? 'Unknown User',
             avatar: jiraUser?.avatarUrls?.['24x24'] ?? null
         };
     });
 
     // 6. cursor 계산
     const lastItem = merged[merged.length - 1];
 
     return {
         data: merged,
         nextCursor: lastItem?.project_member_id ?? null,
         hasMore: merged.length === limit
     };
 };
 
 export const searchProjectUserService = async ({project_id , keyword}) =>{
     // 키워드로 지라 호출 검색
     const jiraUsers = (await searchJiraUsersApi('user',keyword))
         .filter(u => u.accountType !== 'user');
 
     const accountIds = jiraUsers.map(u => u.accountId); // 검색된 ids
 
     // 프로젝트에 할당 되어있는지 확인
     const dbUsers = await searchProjectUserByAccountId(project_id, accountIds);
 
     const dbSet = new Set(dbUsers.map(u => u.account_id));
 
     const result = jiraUsers.filter(u => dbSet.has(u.accountId)).map(mapUser);
 
     return {
         data: result
     };
 }
 
 const mapUser = (u) => ({
     account_id: u.accountId,
     displayName: u.displayName,
     avatar: u?.avatarUrls?.['24x24'] ?? null
 });
 
 /**
  * 프로젝트 상세 > 작업(이슈) 코워커 전용 갱신 (팀 관리형 지원).
  * - 이슈 프로퍼티(movesRms)를 read-merge-write 해 coworkers(accountId[])만 교체한다.
diff --git a/src/resolver/utils/worklog/WorklogService.js b/src/resolver/utils/worklog/WorklogService.js
index 33e0837..6dc0c13 100644
--- a/src/resolver/utils/worklog/WorklogService.js
+++ b/src/resolver/utils/worklog/WorklogService.js
@@ -129,169 +129,171 @@ export const getProjectWorklogs = async ({ projectId, startDate, endDate, accoun
     const accountIdArray = accountId
         ? (Array.isArray(accountId) ? accountId : [accountId])
         : undefined;
 
     const issues = await getBulkIssuesByProject({ projectId, startDate, endDate, accountId: accountIdArray });
     // 워크로그 안쌓인 것들만 필터링
     const issuesWithWorklog = issues.filter(
         issue => issue.fields?.worklog?.total > 0
     );
 
     const limit = pLimit(5);
 
     const results = await Promise.all(
         issuesWithWorklog.map(issue =>
             limit(() => processIssue(issue, startDate, endDate))
         )
     );
     return results.flat();
 };
 
 // 이슈 처리 워크로그 20개 이상일 경우 처리하기 위한 로직
 const processIssue = async (issue, startDate, endDate) => {
 
     const { worklog } = issue.fields;
 
     // worklog 없는 이슈 skip
     if (!worklog || worklog.total === 0) return [];
 
     let result = [];
 
     const filterFn = (log) => {
         if (!startDate || !endDate) return true;
 
         return isInRange(log.date, startDate, endDate);
     };
 
     result.push(
         ...worklog.worklogs
             .map(log => normalizeWorklog(log, issue))
             .filter(filterFn)
     );
     // 20개 이상일 경우 worklog 데이터 호출
     if (worklog.total > worklog.maxResults) {
         const extra = await getExtraWorklogs(issue.key, worklog.maxResults);
 
         result.push(
             ...extra
                 .map(log => normalizeWorklog(log, issue))
                 .filter(filterFn)
         );
     }
     return result;
 };
 
 export const isInRange = (date, startDate, endDate) => {
     return new Date(date) >= new Date(startDate)
         && new Date(date) <= new Date(endDate);
 };
 
 //필요한 필드만 추출
 const normalizeWorklog = (log,issue) => {
 
     return {
         id: log.id,                                 // 워크로그 아이디
         issueId: log.issueId,                       // 이슈 아이디
         issueKey: issue.key,
         accountId: log.author?.accountId,           // 작업자 아이디
         emailAddress: log.author?.emailAddress,     // 작업자 메일
         displayName: log.author?.displayName,       // 작업자 이름
         avatarUrl: log.author?.avatarUrls["16x16"], // 작업자 아바타
         started: log.started,                       // 작업 시작일
         date: log.started.substring(0, 10),         // 년-월-일
         timeSpentSeconds: log.timeSpentSeconds,      // 소비한 시간(초)
         issue:issue,
         worklog:log,
     }
 };
 
 
 //20개 초과 worklog만 추가 조회
+// startAt=20 은 검색 응답에 인라인되는 워크로그 상한(worklog.maxResults)이고,
+// 페이지 크기는 그와 무관하다 — maxResult 는 넘기지 않고 WorklogApi.getWorkLogByIssueKey 의
+// 기본값(100)을 그대로 쓴다(MyWorkService.getExtraWorklogs 와 같은 출처를 공유).
 const getExtraWorklogs = async (issueKey, startAt = 20) => {
     let all = [];
     let currentStartAt = startAt;
 
     while (true) {
         const res = await getWorkLogByIssueKey({
             issueIdOrKey: issueKey,
-            startAt: currentStartAt,
-            maxResult: 20});
+            startAt: currentStartAt});
         const logs = res?.worklogs || [];
 
         all.push(...logs);
 
         currentStartAt += logs.length;
 
         if (!logs.length || currentStartAt >= res.total) {
             break;
         }
     }
 
     return all;
 };
 // 담당자 + 일별 집계
 const aggregateByUserDate = (worklogs) => {
 
     const map = new Map();
 
     for (const log of worklogs) {
 
         const key = `${log.accountId}:${log.date}`;
 
         if (!map.has(key)) {
             map.set(key, {
                 accountId: log.accountId,
                 emailAddress: log.emailAddress,     // 작업자 메일
                 displayName: log.displayName,       // 작업자 이름
                 avatarUrl: log.avatarUrl,           // 작업자 아바타
                 issueKey: log.issueKey,
                 date: log.date,
                 seconds: 0
             });
         }
 
         map.get(key).seconds += log.timeSpentSeconds;
     }
 
     return Array.from(map.values());
 };
 // 일별 집계
 export const aggregateByDate = (worklogs) => {
 
     const map = new Map();
 
     for (const log of worklogs) {
 
         const key = log.date;
 
         if (!map.has(key)) {
             map.set(key, {
                 date: log.date,
                 seconds: 0
             });
         }
 
         map.get(key).seconds += log.timeSpentSeconds;
     }
 
     return Array.from(map.values());
 };
 // 사용자별 총 집계
 export const aggregateByUser = (worklogs) => {
 
     const map = new Map();
 
     for (const log of worklogs) {
 
         const key = log.accountId;
 
         if (!map.has(key)) {
             map.set(key, {
                 accountId: log.accountId,
                 seconds: 0
             });
         }
 
         map.get(key).seconds += log.timeSpentSeconds;
     }
 
     return Array.from(map.values());
diff --git a/src/seed/SeedData.js b/src/seed/SeedData.js
index da2f420..1502bea 100644
--- a/src/seed/SeedData.js
+++ b/src/seed/SeedData.js
@@ -1,103 +1,107 @@
 import {customEntityManager} from "../nosql/query/CustomEntityManager";
 import {kvs} from "@forge/kvs";
 import {SEED_VERSION} from "../trigger/onInstall";
 import {getTimeTracking} from "../api/jira/user/TimeTrackingApi";
 import {runMigration} from "../rdb/schema/migrate";
 import {
     getSeedPages,
     getMigrateSource,
     getDefaultForNew,
     RESOURCE_KEYS,
     CATALOG,
 } from "../permission/ResourceCatalog";
 // projectScope 정규화 단일 출처(C2)
 import {normalizeScope} from "../permission/ProjectScope";
 import {DEFAULT_SETTINGS} from '../resolver/backoffice/setting/SettingDefaults';
+// A-7 — 시드는 status/settings 를 쓴다. `ensureSeed()` 가 **resolver 인스턴스 안에서** 돌 수 있으므로
+//   (PermissionService.userPermissionCheckService) 사전 캐시를 무효화하지 않으면 그 인스턴스가 60초 동안 옛 값을 본다.
+import {invalidateAllDictionaries} from '../resolver/backoffice/DictionaryCache';
 
 export const runSeed = async () =>{
     await addPermissionSeed();       // 시드 Admin/Member 카탈로그 파생 재생성(멱등 덮어쓰기)
     await addPresetPermissionSeed(); // 대표 역할 세트 4종 — **최초 1회만 생성**(재생성 금지)
     await migratePermissionSets();   // 커스텀 세트 키 병합/고아정리/projectScope 보정(멱등)
     await addStatusSeed();
     await addSettingSeed();
     await addStatusLink();
+    invalidateAllDictionaries();     // status/settings 를 썼다 — 사전 캐시 무효화(호출된 인스턴스 한정)
 }
 
 export const ensureSeed = async() =>{
     const version = await kvs.get('seed_version');
     if (!version || version < SEED_VERSION) {
         await runMigration();
         await runSeed();
         await kvs.set("seed_version", SEED_VERSION);
     }
 }
 
 /**
  * 시드 Admin/Member 권한 세트 = 리소스 카탈로그 파생(결정적) → 매 마이그레이션마다 덮어쓰기(멱등).
  * edit:false(관리자 pages/name 수정 불가) 불변 시드이므로 pages/name/edit 는 항상 재생성해 드리프트를 제거한다.
  * (기존 `if(existing) continue` 스킵 로직 제거 — 카탈로그 변경이 시드에 반영되도록)
  *
  * projectScope (§10 시드 scope 토글 완화):
  *  - Admin  : 항상 'ALL' 강제(불변).
  *  - Member : 관리자가 updatePermissionScope 로 토글 가능하므로, **재생성 시 기존 저장값을 읽어 보존**(없으면 'ALL').
  *             → pages/name 은 재생성하되 관리자가 설정한 scope 는 마이그레이션에서 잃지 않음(멱등).
  */
 export const addPermissionSeed = async () => {
     const queryManager = customEntityManager('permission');
 
     // Admin: projectScope 불변('ALL')
     await queryManager.save('permission-Admin', {
         id: 'permission-Admin',
         name: 'Admin',
         edit: false,
         pages: getSeedPages('admin'),
         projectScope: 'ALL',
     });
 
     // Member: pages/name/edit 재생성 + projectScope 는 기존 저장값 보존
     //   ⚠ 리터럴 삼항 금지(C2) — 여기서 뭉개면 TEAM_ONLY Member 가 시드 재생성 때마다 ALL 로 리셋된다.
     const existingMember = await queryManager.findById('permission-Member');
     const memberScope = normalizeScope(existingMember?.projectScope);
     await queryManager.save('permission-Member', {
         id: 'permission-Member',
         name: 'Member',
         edit: false,
         pages: getSeedPages('member'),
         projectScope: memberScope,
     });
 };
 
 // ── 대표 역할 권한 세트(프리셋) ─────────────────────────────────────────────
 
 const RW = Object.freeze({ read: true, write: true });
 const RO = Object.freeze({ read: true, write: false });
 const NO = Object.freeze({ read: false, write: false });
 
 /**
  * 프리셋 프로비저닝 원장(top-level KVS).
  *
  * ★ **이것이 "되살리지 않는다"의 핵심이다.** 세트 존재 여부로 판정하면
  *   관리자가 지운 세트가 다음 SEED_VERSION bump 때 되살아난다. 원장은 **세트와 별개로 남으므로**
  *   "한 번 제공했다"는 사실이 삭제와 무관하게 보존된다.
  *   값: `{ 'permission-PM': true, ... }` — 객체 저장은 선례 있음(LicenseGuard, PortfolioSnapshotRepository).
  */
 const PRESET_LEDGER_KEY = 'permission_preset_provisioned';
 
 /**
  * 대표 역할 세트 정의 (17키 카탈로그 파생).
  *
  * 설계 원칙:
  *  - **SETTINGS 계열은 전부 닫는다.** 백오피스는 Admin 영역이며, 여기를 열면 프리셋이 곧 관리자 권한이 된다.
  *  - **PROJECT_COST 는 PM/PMO 만.** 재무 민감이고 §R3-B("팀장에게 재무를 열지 않는다")와 일관.
  *  - **팀장/팀원은 TEAM_ONLY.** P1 의 TEAM_ONLY 를 실제로 쓸 수 있게 하는 진입점이다.
  *  - **TEAM_MANAGEMENT 는 팀장에게도 주지 않는다.** 팀장 판정은 권한세트가 아니라
  *    `team.leaderAccountId` 관계에서 파생되고(§R3), 진입점은 권한 게이트가 없는 `/my-page` 다.
  *
  * `grant(entry)` 는 카탈로그 엔트리를 받아 값을 정한다 — **미래에 카탈로그 키가 늘어도
  * 각 프리셋이 명시적으로 판정**하므로 새 키가 조용히 열리지 않는다(defaultForNew 에 기대지 않는다).
  */
 export const PRESET_PERMISSION_SETS = Object.freeze([
     {
         id: 'permission-PM',
         name: 'PM',
         projectScope: 'ALL',

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$targets = @('"'src/api/jira/issue/ProjectParticipantFetcher.js','src/resolver/projectDashboard/ProjectDashboardService.js','src/resolver/projectIssue/ProjectUsersService.js','src/resolver/projectDashboard/ProjectDashboardController.js','src/resolver/projectIssue/ProjectUsersController.js'); foreach ("'$file in $targets) { if (Test-Path $file) { Write-Output "--- $file"; $line=0; Get-Content $file | ForEach-Object { $line++; '"'{0,4}: {1}' -f "'$line, $_ } } }; Write-Output '"'--- search stats call sites'; rg -n --glob '*.js' --glob '*.jsx' 'getAssigneeStats(Service)?|getIssueParticipantStats(Service)?|getProjectParticipantIssues|getChartDataById' src static/ui/src" in C:\CloudJira\moves-workforce
 succeeded in 2827ms:
--- src/api/jira/issue/ProjectParticipantFetcher.js
   1: /**
   2:  * ?꾨줈?앺듃 ??쒕낫???꾩슜 李몄뿬???섏쿂 ???깅뒫 媛먯궗 A-3.
   3:  *
   4:  * `getAssigneeStats`(?대떦?먮퀎 嫄댁닔)? `getIssueParticipantStats`(?댁뒋蹂?李몄뿬?????? * **臾몄옄 ?⑥쐞濡?媛숈? 寃??URL**??媛곸옄 ?꾨웾 ?섏씠吏 猷⑦봽濡?湲곴퀬 吏묎퀎留??щ━?덈떎.
   5:  * ???꾩젽???④퍡 ?볦씤 ??쒕낫?쒕뒗 1,000?댁뒋 ?꾨줈?앺듃?먯꽌 寃??20??洹몄쨷 10???꾩쟾 以묐났)瑜??덈떎.
   6:  *
   7:  * ???섏튂瑜?**1?⑥뒪濡??⑹튂怨?* ??吏묎퀎??洹?寃곌낵?먯꽌 ?뚯깮?쒕떎(IssueApi ????export ???쒓렇?덉쿂쨌?묐떟 shape 遺덈?).
   8:  *
   9:  * ?좑툘 怨듯넻 ?섏튂 寃쎈줈 寃⑸━ ?먯튃: ???섏쿂??**??쒕낫?????듦퀎 ?꾩슜**?대떎.
  10:  *    ?뚮퉬泥섍? ?섏뼱?섎㈃ ?ш린??遺꾧린?섏? 留먭퀬 ?꾩슜 ?섏쿂瑜??덈줈 留뚮뱺??
  11:  *
  12:  * ?? ?몄뒪?댁뒪 罹먯떆(?붿껌 媛?以묐났 ?≪닔) ??????????????????????????????????????
  13:  * ?꾩젽? ?꾨줎?멸? ?꾩젽??`invoke('getChartDataById')` 1?뚮줈 ?몄텧?섎?濡?assignee/issue ???꾩젽?
  14:  * **?쒕줈 ?ㅻⅨ invoke** ?? ?붿껌 ?ㅼ퐫??硫붾え留뚯쑝濡쒕뒗 以묐났???⑥븘, 紐⑤뱢 ?ㅼ퐫??TTL 罹먯떆瑜??붾떎.
  15:  *
  16:  *  - TTL 60珥???`TeamTreeCache` 愿濡瑜??곕Ⅸ???뚰겕濡쒓렇 ?꾩젽??KVS 10遺?罹먯떆蹂대떎 蹂댁닔??.
  17:  *  - **KVS 媛 ?꾨땲???꾨줈?몄뒪 硫붾え由?*?? 寃?됱? `as:'user'` ??寃곌낵媛 **?몄텧??沅뚰븳?쇰줈 ?꾪꽣留?*?섎?濡? *    projectId 留뚯쑝濡?KVS ??怨듭쑀 罹먯떆瑜??먮㈃ ?ъ슜??媛?媛??踰붿쐞媛 ?욎씤?? 洹몃옒?? *    罹먯떆 ?ㅼ뿉 **viewerId(?몄텧??accountId)** 瑜??ы븿?섍퀬, viewerId 媛 ?놁쑝硫?**罹먯떆瑜??꾩삁 ?곗? ?딅뒗??*(fail-safe).
  18:  *  - ?뷀듃由щ뒗 **1媛쒕쭔** ?좎??쒕떎(??쒕낫?쒕뒗 ???ъ슜?먭? ???꾨줈?앺듃???꾩젽?ㅼ쓣 ?곗냽 ?뚮뜑?쒕떎).
  19:  *    ?ㅻⅨ ?꾨줈?앺듃/?ъ슜?먭? ?ㅻ㈃ 援먯껜?섎?濡??곸＜ 硫붾え由ш? ?곸닔濡?臾띠씤??`memoryMB: 256`).
  20:  *  - Forge ???몄뒪?댁뒪媛 ?щ윭 媛쒕씪 罹먯떆 ?곸쨷? **媛숈? ?몄뒪?댁뒪濡??쇱슦?낅릱???뚮쭔** ?쇱뼱?쒕떎.
  21:  *    stale ? 理쒕? 60珥??댁뒋 ?대떦??蹂寃쎌씠 李⑦듃????쾶 諛섏쁺?????덈떎).
  22:  */
  23: 
  24: import { route } from '@forge/api';
  25: import { requestJiraJson } from '../util/RequestJiaJson';
  26: import { MOVES_PROPERTY_KEY } from './IssuePropertyApi';
  27: 
  28: /** 紐⑤뱢 ?ㅼ퐫??罹먯떆 TTL (ms) ??TeamTreeCache ? 媛숈? 媛?*/
  29: const TTL_MS = 60 * 1000;
  30: 
  31: /** ?⑥씪 ?뷀듃由?罹먯떆: { key, at, records } */
  32: let cached = null;
  33: 
  34: /**
  35:  * ?꾨줈?앺듃 ???댁뒋瑜?1?⑥뒪濡??섏쭛??**吏묎퀎???꾩슂??理쒖냼 ?꾨뱶留?* ?④릿??
  36:  * (assignee ??fields, coworker ???댁뒋 ?꾨줈?쇳떚(movesRms) ??? 愿由ы삎 吏??
  37:  */
  38: const fetchParticipantIssues = async (projectId) => {
  39:     let nextPageToken = null;
  40:     const records = [];
  41: 
  42:     do {
  43:         const url = route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100${nextPageToken ? `&nextPageToken=${nextPageToken}` : ''}`;
  44: 
  45:         const result = await requestJiraJson({
  46:             as: 'user',
  47:             url,
  48:             logPrefix: '[GET PROJECT PARTICIPANT ISSUES]'
  49:         });
  50: 
  51:         const issues = result?.issues || [];
  52: 
  53:         issues.forEach(issue => {
  54:             const assignee = issue.fields?.assignee;
  55: 
  56:             records.push({
  57:                 issueKey: issue.key,
  58:                 accountId: assignee?.accountId || null,
  59:                 displayName: assignee?.displayName || null,
  60:                 avatar: assignee?.avatarUrls?.["24x24"] || null,
  61:                 coworkers: issue.properties?.[MOVES_PROPERTY_KEY]?.coworkers ?? [],
  62:             });
  63:         });
  64: 
  65:         nextPageToken = result?.nextPageToken || null;
  66: 
  67:     } while (nextPageToken);
  68: 
  69:     return records;
  70: };
  71: 
  72: /**
  73:  * ??쒕낫??李몄뿬??吏묎퀎???댁뒋 ?덉퐫??
  74:  *
  75:  * @param {string} projectId ??projectId (moves_RMS_projectId)
  76:  * @param {string|null} viewerId ?몄텧??accountId. **?놁쑝硫?罹먯떆瑜??곗? ?딅뒗??*(媛??踰붿쐞 ?쇱엯 諛⑹?)
  77:  * @returns {Promise<Array<{issueKey, accountId, displayName, avatar, coworkers}>>}
  78:  */
  79: export const getProjectParticipantIssues = async ({ projectId, viewerId = null }) => {
  80:     if (!viewerId) return await fetchParticipantIssues(projectId);
  81: 
  82:     const key = `${viewerId}::${projectId}`;
  83:     const now = Date.now();
  84: 
  85:     if (cached && cached.key === key && now - cached.at < TTL_MS) return cached.records;
  86: 
  87:     const records = await fetchParticipantIssues(projectId);
  88:     cached = { key, at: now, records };
  89:     return records;
  90: };
  91: 
  92: /** ?뚯뒪??紐낆떆??珥덇린?붿슜. */
  93: export const invalidateProjectParticipantIssues = () => {
  94:     cached = null;
  95: };
--- src/resolver/projectDashboard/ProjectDashboardService.js
   1: import {
   2:     addChartDataRepository, bulkUpdateLayoutsRepository,
   3:     deleteChartByChartIdRepository,
   4:     getChartDataRepository,
   5:     getSummaryDataRepository, updateChartTitleRepository
   6: } from "./ProjectDashboardRepository";
   7: import {LogicalError} from "../../error/LogicalError";
   8: // P2-c ???щТ ?대엺 ?먯젙 ?⑥씪 異쒖쿂(짠16 C4). private 蹂듭궗蹂몄쓣 ??import 濡??泥댄뻽??
   9: import {canReadCost, COST_DENIED_REASON} from "../../permission/CostAccess";
  10: // 湲됱뿬 ?뺤콉(RFC-163) ???쒖떆 寃뚯씠?? ?ㅽ뙣 ???④?(LEVEL_BAND) ?대갚(짠5-1).
  11: import {canShowIndividualSalary, resolveSalaryPolicySafe, SALARY_HIDDEN_REASON} from "../../permission/SalaryVisibility";
  12: import {
  13:     getSalaryRepository,
  14:     groupByLevelRepository,
  15:     groupByRoleRepository,
  16:     groupByTeamRepository
  17: } from "../projectIssue/ProjectUsersRepository";
  18: // P3-A ??? ?대쫫 ?ъ쟾. 60珥?罹먯떆???꾩젽???щ윭 媛쒖뿬??KVS 而ㅼ꽌 猷⑦봽媛 諛섎났?섏? ?딅뒗??
  19: import {getTeamIndex} from "../backoffice/team/TeamTreeCache";
  20: import {getLevelListService} from "../backoffice/level/LevelService";
  21: import {getRoleListService} from "../backoffice/role/RoleService";
  22: import {getAssigneeStatsService, getIssueParticipantStatsService} from "../projectIssue/ProjectUsersService";
  23: import {
  24:     aggregateByDateService,
  25:     aggregateByUserService,
  26:     aggregateWorklogByUserDateService
  27: } from "../utils/worklog/WorklogService";
  28: 
  29: // ?곷떒 ?붿빟 ?뺣낫 議고쉶
  30: // ?꾨줈?앺듃 李몄뿬 ?몃젰, 湲곌컙, ?멸굔鍮?
  31: /*
  32:  * ??湲됱뿬 ?뺤콉(RFC-163) ??**???쒕퉬?ㅻ뒗 ?뺤콉???쎌? ?딅뒗?? ?덈? ?ｌ? 留덈씪.**
  33:  *
  34:  *   `getSummaryDataService` ??resolver ?꾩슜???꾨땲??**?대? ?뚮퉬?먭? 3怨?*?대떎:
  35:  *     쨌 `ProjectCostService.js:114`      (?대? ?먭린 settings 瑜??쎄퀬 ?덈떎 ??以묐났 議고쉶媛 ?쒕떎)
  36:  *     쨌 `ProjectUsersService.js:170`
  37:  *     쨌 `ProjectProgressService.js:70`   (吏꾩쿃???섏씠吏??total_salary 瑜??곗????딅뒗??= 100% ??퉬)
  38:  *
  39:  *   ?ш린??`resolveSalaryPolicySafe()` 瑜??ｌ쑝硫???寃쎈줈 ?꾨???KVS ?뺣났??異붽??쒕떎
  40:  *   (`getSettingDataService` ?먮뒗 硫붾え?댁쫰媛 ?녿떎). `getUserInfo` 媛 `PrincipalResolver` ?뚮Ц??
  41:  *   Controller ?먯꽌 寃뚯씠?낇븯??寃껉낵 **?뺥솗??媛숈? ?곹솴**?대떎.
  42:  *   ??LEVEL_BAND ??`total_salary` ???쒓굅??`ProjectDashboardController.js` ?뺤쓽遺?먯꽌 ?쒕떎.
  43:  */
  44: export const getSummaryDataService = async ({project_id}) => {
  45: 
  46:     const result = await getSummaryDataRepository(project_id);
  47: 
  48:     const rows = result.rows;
  49: 
  50:     if (!rows || rows.length === 0) {
  51:         return {
  52:             project_id,
  53:             project_name: null,
  54:             start_date: null,
  55:             end_date: null,
  56:             total_member_count: 0,
  57:             total_salary: 0
  58:         };
  59:     }
  60: 
  61:     const row = rows[0];
  62: 
  63:     return {
  64:         project_id: row.project_id,
  65:         project_name: row.project_name,
  66:         start_date: row.start_date,
  67:         end_date: row.end_date,
  68:         total_member_count: row.total_member_count,
  69:         total_salary: row.total_salary
  70:     };
  71: };
  72: // 李⑦듃 ?뺣낫 議고쉶
  73: export const getChartInfoService = async ({project_id}) =>{
  74:     const res = await getChartDataRepository(project_id);
  75:     return { rows: res?.rows ?? [] };
  76: }
  77: /**
  78:  * @param project_id
  79:  * @param dashboard_id
  80:  * @param data_type
  81:  * @param chart_type
  82:  * @param coworkerFieldId
  83:  * @param startDate
  84:  * @param endDate
  85:  * @param accountId Worklog lineStack 李⑦듃??寃쎌슦留?諛쏅뒗 ?뚮씪硫뷀?
  86:  * @returns {Promise<{dashboard_id: *, chartData: {data: *}|{categories: *, seriesData: [{data: *}]}|{categories: *, seriesData: [{data: *}]}|*|{categories: *, seriesData: [{data: *}], summary: *}|{data: *, summary: *}|{categories: *, seriesData: [{data: *}], summary: *}|{data: *, year: *}|{categories: unknown[], series: {name: string, accountId: *, data: {value: number, avatarUrl: *}[]}[], raw: unknown}|[]}>}
  87:  */
  88: export const getChartDataByIdService = async ({ project_id, dashboard_id, data_type, chart_type, coworkerFieldId ,startDate,endDate,accountId, principal}) => {
  89: 
  90:     // 湲됱뿬 ?뺤콉(RFC-163) ??salary ?곗씠?곗뀑???뚮쭔 ?뺤콉???쎈뒗???ㅻⅨ ?꾩젽??KVS ?뺣났??異붽??섏? ?딅뒗??.
  91:     const salaryPolicy = data_type === 'salary' ? await resolveSalaryPolicySafe() : null;
  92: 
  93:     const chartData = await getChartDataset({
  94:         project_id,
  95:         dataType: data_type,
  96:         chartType: chart_type,
  97:         coworkerFieldId,
  98:         startDate,
  99:         endDate,
 100:         accountId,
 101:         principal, // salary ?곗씠?곗뀑 寃뚯씠??U7)
 102:         salaryPolicy
 103:     });
 104: 
 105:     return { dashboard_id, chartData };
 106: };
 107: 
 108: // ?꾩껜 李⑦듃 ?곗씠??議고쉶
 109: export const getChartDataService = async ({ project_id ,coworkerFieldId, startDate, endDate, accountId, principal}) => {
 110:     const res = await getChartDataRepository(project_id); // 李⑦듃 ?뺣낫 議고쉶
 111:     const rows = res?.rows ?? [];
 112: 
 113:     /*
 114:      * 湲됱뿬 ?뺤콉(RFC-163) ??**猷⑦봽 諛뽰뿉??1?뚮쭔** ?쎈뒗??
 115:      *   getChartDataset ?덉뿉???쎌쑝硫??꾩젽 ?섎쭔??KVS ?뺣났???앷릿??
 116:      *   salary ?꾩젽???섎굹???놁쑝硫??꾩삁 ?쎌? ?딅뒗??
 117:      */
 118:     const salaryPolicy = rows.some((row) => row.data_type === 'salary')
 119:         ? await resolveSalaryPolicySafe()
 120:         : null;
 121: 
 122:     const result = await Promise.all(
 123:         rows.map(async (row) => {
 124:             // startDate/endDate ???몄옄濡?諛쏅뒗?? 怨쇨굅???ㅼ퐫?꾩뿉 ?녿뒗 蹂?섎? 李몄“??
 125:             // ???⑥닔媛 ?몄텧?섎뒗 利됱떆 ReferenceError ????꾨줎?멸? getChartDataById 留??⑥꽌 誘몃컻??.
 126:             const chartData = await getChartDataset({
 127:                 project_id,
 128:                 dataType: row.data_type,
 129:                 chartType: row.chart_type,
 130:                 coworkerFieldId,
 131:                 startDate,
 132:                 endDate,
 133:                 accountId,
 134:                 principal, // salary ?곗씠?곗뀑 寃뚯씠??U7)
 135:                 salaryPolicy
 136:             });
 137: 
 138:             return {
 139:                 dashboard_id: row.dashboard_id,
 140:                 project_id: project_id,
 141:                 dashboard_title: row.dashboard_title,
 142:                 chart_type: row.chart_type,
 143:                 data_type: row.data_type,
 144:                 pos_x: row.pos_x,
 145:                 pos_y: row.pos_y,
 146:                 width: row.width,
 147:                 height: row.height,
 148:                 chartData,
 149:             };
 150:         })
 151:     );
 152: 
 153:     return {
 154:         rows: result,
 155:     };
 156: };
 157: 
 158: /**
 159:  * ?щТ 誘쇨컧 ?곗씠?곗뀑(salary) ?대엺 媛???щ? (U7).
 160:  *
 161:  * ??쒕낫??resolver ??媛?쒕뒗 DASHBOARD read ?몃뜲, ?쒕뱶 Member 媛 DASHBOARD read 瑜?媛吏꾨떎
 162:  * (ResourceCatalog: DASHBOARD member=rf). ?곕씪??salary ?곗씠?곗뀑??寃뚯씠???놁씠 ?섍?硫?
 163:  * ???ъ슜?먭? ?꾨줈?앺듃 湲됱뿬??min/max/avg/median ??蹂닿쾶 ?쒕떎 ??PROJECT_COST 瑜?member=ff 濡?
 164:  * 留됱븘???섎룄媛 ??寃쎈줈濡??고쉶?쒕떎. ?몄썝???곸쑝硫?min/max ???ъ떎??媛쒖씤 湲됱뿬??
 165:  *
 166:  * ?먯젙? PROJECT_COST read 湲곗?(getProjectSalaryList / getProjectCostSummary ? ?숈씪 寃뚯씠??.
 167:  * principal ???놁쑝硫??꾨떖 ?꾨씫) fail-close 濡?嫄곕??쒕떎.
 168:  */
 169: // P2-c ?????먯젙? `src/permission/CostAccess.js` 濡??밴꺽?먮떎(짠16 C4). 蹂듭궗蹂몄쓣 留뚮뱾吏 留?寃?
 170: //   ?밴꺽?앹? 臾몄옄 洹몃?濡??숈씪?섎?濡??숈옉 李⑥씠媛 ?녿떎.
 171: 
 172: // P3-A ? 誘몄?????SQL ?쇳떚?먭낵 ?쇰꺼. `UserQuery.TEAM_COUNT` / `mapCountWithMeta` ? 媛숈? 洹쒖빟?대떎.
 173: const UNASSIGNED_TEAM_KEY = 'NONE';
 174: const UNASSIGNED_TEAM_LABEL = 'Unassigned';
 175: 
 176: const getChartDataset = async ({ project_id, dataType, chartType,coworkerFieldId ,startDate,endDate,accountId, principal, salaryPolicy = null}) => {
 177:     switch (dataType) {
 178:         case "level":
 179:             return await getLevelChartData(project_id, chartType);
 180:         case "role":
 181:             return await getRoleChartData(project_id, chartType);
 182:         case "team":
 183:             return await getTeamChartData(project_id, chartType);
 184:         case "salary":
 185:             // 沅뚰븳 ?놁쑝硫??곗씠?곕? 留뚮뱾吏 ?딄퀬 嫄곕? ?좏샇瑜??댁? 鍮?寃곌낵瑜?諛섑솚?쒕떎.
 186:             // ?덉쇅瑜??섏?吏 ?딅뒗 ?댁쑀: ?대? ??쒕낫?쒖뿉 諛곗튂???꾩젽???덉쑝硫???쒕낫???꾩껜媛 源⑥쭊??
 187:             // 議곗슜??鍮?媛믩쭔 二쇱????딅뒗??짠議곗슜???ㅽ뙣 湲덉?) ??denied ?뚮옒洹몃줈 ?꾨줎?멸? ?덈궡?????덇쾶 ?쒕떎.
 188:             if (!canReadCost(principal)) {
 189:                 return { denied: true, reason: COST_DENIED_REASON, histogram: [], summary: null, labels: [], datasets: [] };
 190:             }
 191:             /*
 192:              * 湲됱뿬 ?뺤콉(RFC-163) ??LEVEL_BAND ?먯꽌??**?꾨줈?앺듃 湲됱뿬 ?덉뒪?좉렇?⑥쓣 留뚮뱾吏 ?딅뒗??**
 193:              *   ???꾩젽???낅젰? `projectusers.salary` **?먯떆媛?*?닿퀬 異쒕젰 `summary.{min,max}` ??
 194:              *   ?뺤쓽???뱀젙 媛쒖씤??湲덉븸?대떎(?꾩궗 ?덉뒪?좉렇?④낵 ?깃꺽???ㅻⅤ????짠5-3).
 195:              *   ??沅뚰븳 異뺤씠 癒쇱? ?먯젙?쒕떎(??canReadCost). ????嫄몃━硫?PROJECT_COST_REQUIRED 媛 ?닿릿??
 196:              *   ??`getSalaryRepository` 瑜?**?몄텧議곗감 ?섏? ?딅뒗??*(SalaryChartGate.test.js 愿濡).
 197:              */
 198:             if (!canShowIndividualSalary(salaryPolicy)) {
 199:                 return { denied: true, reason: SALARY_HIDDEN_REASON, histogram: [], summary: null, labels: [], datasets: [] };
 200:             }
 201:             return await getSalaryChartData(project_id, chartType);
 202:         case "assignee":
 203:             // A-3 ??principal.accountId ??李몄뿬???섏쿂???몄뒪?댁뒪 罹먯떆 ?ㅻ떎(媛??踰붿쐞 ?쇱엯 諛⑹?). ?놁쑝硫?罹먯떆 誘몄궗??
 204:             return getAssigneeChartData(project_id,chartType,coworkerFieldId, principal?.accountId ?? null);
 205:         case "issue":
 206:             return getIssueChartData(project_id,chartType,coworkerFieldId, principal?.accountId ?? null);
 207:         case "worklog":
 208:             return getWorklogChartData(project_id,chartType,startDate,endDate,accountId)
 209:         default:
 210:             return [];
 211:     }
 212: };
 213: // ?깃툒蹂??몄썝 ??
 214: const getLevelChartData = async (project_id, chartType) => {
 215:     const levelRes = await getLevelListService();
 216:     const levelData = levelRes?.data ?? levelRes?.content ?? [];
 217:     const levelMap = new Map(levelData.map((level) => [level.id, level]));
 218: 
 219:     const rows = await groupByLevelRepository(project_id);
 220:     const normalizedRows = normalizeLabelRows(rows, levelMap);
 221:     return formatChartData(normalizedRows, chartType);
 222: };
 223: //??븷 蹂??몄썝 ??
 224: const getRoleChartData = async (project_id, chartType) => {
 225:     const roleRes = await getRoleListService();
 226:     const roleData = roleRes?.data ?? roleRes?.content ?? [];
 227:     const roleMap = new Map(roleData.map((role) => [role.id, role]));
 228: 
 229:     const rows = await groupByRoleRepository(project_id);
 230:     const normalizedRows = normalizeLabelRows(rows, roleMap);
 231:     return formatChartData(normalizedRows, chartType);
 232: };
 233: /**
 234:  * P3-A ?蹂??몄썝 ????role/level 怨?**媛숈? 3???뚯씠?꾨씪??*(議고쉶 ???쇰꺼 ?뺢퇋????李⑦듃 ?щ㎎).
 235:  *
 236:  * ??**?щТ 異뺤씠 ?꾨땲??** ?몄썝 ?섎쭔 ?쇰떎 ??`PROJECT_COST` 寃뚯씠?멸? ?꾩슂 ?녾퀬
 237:  *   `salary` ?곗씠?곗뀑泥섎읆 `canReadCost` 濡?留됱? ?딅뒗??留됱쑝硫?DASHBOARD read ?ъ슜?먭? ? ?꾩젽??紐??대떎).
 238:  *
 239:  * ??? 誘몄???`'NONE'`)? `mapCountWithMeta` ? **媛숈? 洹쒖빟**?쇰줈 ?쇰꺼??遺숈씤??
 240:  *   [?뚮젮吏??쒓퀎] 洹?洹쒖빟???곷Ц 由ы꽣?댁씠???쒓뎅??UI ?먮룄 "Unassigned" 濡??섏삩????
 241:  *   怨좎튌 ?뚮뒗 `UserService.mapCountWithMeta` ? **?④퍡** 怨좎퀜?????붾㈃??媛덈━吏 ?딅뒗??
 242:  */
 243: const getTeamChartData = async (project_id, chartType) => {
 244:     const rows = await groupByTeamRepository(project_id);
 245: 
 246:     // teamIndex.byKey 媛믪? `{teamKey, name, ...}` ?대씪 `normalizeLabelRows` ??`label?.name` 洹쒖빟怨?洹몃?濡?留욌뒗??
 247:     const teamIndex = await getTeamIndex();
 248:     const teamMap = teamIndex?.byKey ?? new Map();
 249: 
 250:     const labeled = rows.map((row) => (
 251:         row.name === UNASSIGNED_TEAM_KEY ? { ...row, name: UNASSIGNED_TEAM_LABEL } : row
 252:     ));
 253: 
 254:     const normalizedRows = normalizeLabelRows(labeled, teamMap);
 255:     return formatChartData(normalizedRows, chartType);
 256: };
 257: 
 258: // 湲됱뿬 ?곗씠??
 259: const getSalaryChartData = async (project_id, chartType) =>{
 260:     const result = await getSalaryRepository(project_id);
 261:     const salaries = result.map(r => r.salary);
 262:     const salaryData = buildSalaryDistribution(salaries);
 263:     return formatSalaryChartData(salaryData,chartType);
 264: }
 265: /*
 266:  * A-3 ???대떦???꾩젽怨??댁뒋(李몄뿬?? ?꾩젽? **臾몄옄 ?⑥쐞濡?媛숈? 寃??*??媛곸옄 ?꾨웾 ?ㅼ틪?덈떎.
 267:  *   ?섏튂??`ProjectParticipantFetcher` 媛 1?⑥뒪濡??대떦?섍퀬 ???⑥닔??吏묎퀎留??뚯깮?쒕떎.
 268:  *   ???꾩젽??媛곴컖 invoke ?섎뒗 援ъ“(?꾨줎??`ChartTemplate`)??洹몃?濡쒖씠誘濡? ?붿껌 媛?以묐났?
 269:  *   洹??섏쿂??60珥??몄뒪?댁뒪 罹먯떆媛 ?≪닔?쒕떎(罹먯떆 ?ㅼ뿉 viewerId ?ы븿 ??媛??踰붿쐞 ?쇱엯 諛⑹?).
 270:  */
 271: // ?대떦???곗씠??
 272: const getAssigneeChartData = async (project_id, chartType,coworkerFieldId, viewerId = null) =>{
 273:     const param = {projectId:project_id, viewerId};
 274:     const rows = await getAssigneeStatsService(param);
 275:     return formatChartData(rows,chartType);
 276: }
 277: 
 278: const getIssueChartData = async (project_id,  chartType,coworkerFieldId, viewerId = null) =>{
 279:     const param = {projectId:project_id,coworkerFieldId,includeCoworker:true, viewerId};
 280:     const issueData = await getIssueParticipantStatsService(param);
 281: 
 282:     return formatChartData(issueData.issueStats,chartType);
 283: }
 284: 
 285: const getWorklogChartData = async (project_id,  chartType,startDate,endDate,accountId) =>{
 286:     return formatWorklogChartData(project_id,  chartType,startDate,endDate,accountId);
 287: }
 288: // 湲됱뿬 遺꾪룷 怨꾩궛
 289: const buildSalaryDistribution = (salaries, bucketCount = 5) => {
 290:     if (!salaries || salaries.length === 0) {
 291:         return {
 292:             histogram: [],
 293:             summary: null
 294:         };
 295:     }
 296:     // ?뺣젹
 297:     const sorted = [...salaries].sort((a, b) => a - b);
 298: 
 299:     const n = sorted.length;
 300: 
 301:     // 湲곕낯 ?듦퀎
 302:     const min = sorted[0];
 303:     const max = sorted[n - 1];
 304:     const sum = sorted.reduce((acc, v) => acc + v, 0);
 305:     const avg = Math.round(sum / n);
 306:     // 以묒븰 媛?
 307:     const median =
 308:         n % 2 === 0
 309:             ? Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
 310:             : sorted[Math.floor(n / 2)];
 311: 
 312:     if (min === max) {
 313:         return {
 314:             histogram: [
 315:                 {
 316:                     range: `${min}`,
 317:                     count: n
 318:                 }
 319:             ],
 320:             summary: { min, max, avg, median }
 321:         };
 322:     }
 323: 
 324:     const q1 = sorted[Math.floor(n * 0.25)];
 325:     const q3 = sorted[Math.floor(n * 0.75)];
 326:     const iqr = q3 - q1;
 327: 
 328:     const lowerBound = q1 - 1.5 * iqr;
 329:     const upperBound = q3 + 1.5 * iqr;
 330: 
 331:     const normalValues = sorted.filter(v => v >= lowerBound && v <= upperBound);
 332:     const outliers = sorted.filter(v => v < lowerBound || v > upperBound);
 333: 
 334:     const normalMin = normalValues[0];
 335:     const normalMax = normalValues[normalValues.length - 1];
 336: 
 337:     /*
 338:      * ?꾩껜 min !== max ?щ룄 IQR 濡??댁긽移섎? 嫄룹뼱?대㈃ ?⑥? 媛믪씠 ?꾨? 媛숈쓣 ???덈떎(?? [3000,3000,3000,3000,9000]).
 339:      * 洹몃븣 step ??0 ???섏뼱 ?꾨옒 bucket index 媛 0/0 = NaN ???섍퀬 buckets[NaN] ?묎렐?먯꽌 ?곗쭊??
 340:      * 媛믪씠 ?섎굹肉먯씤 遺꾪룷?대?濡?援ш컙???섎늻吏 ?딄퀬 ?⑥씪 bucket ?쇰줈 ?뚮젮以??
 341:      */
 342:     if (normalMax === normalMin) {
 343:         const histogram = [{ range: `${normalMin}`, count: normalValues.length }];
 344:         if (outliers.length > 0) {
 345:             histogram.push({ range: "Outliers", count: outliers.length });
 346:         }
 347:         return { histogram, summary: { min, max, avg, median } };
 348:     }
 349: 
 350:     const step = Math.ceil((normalMax - normalMin) / bucketCount);
 351: 
 352:     const buckets = [];
 353: 
 354:     for (let i = 0; i < bucketCount; i++) {
 355:         const start = normalMin + step * i;
 356:         const end = i === bucketCount - 1
 357:             ? normalMax
 358:             : start + step;
 359: 
 360:         buckets.push({
 361:             min: start,
 362:             max: end,
 363:             count: 0
 364:         });
 365:     }
 366: 
 367:     normalValues.forEach(value => {
 368:         const index = Math.min(
 369:             Math.floor((value - normalMin) / step),
 370:             bucketCount - 1
 371:         );
 372:         buckets[index].count++;
 373:     });
 374: 
 375:     const histogram = buckets.map(b => ({
 376:         range: `${b.min} ~ ${b.max}`,
 377:         count: b.count
 378:     }));
 379: 
 380:     if (outliers.length > 0) {
 381:         histogram.push({
 382:             range: "Outliers",
 383:             count: outliers.length
 384:         });
 385:     }
 386: 
 387:     return {
 388:         histogram,
 389:         summary: {
 390:             min,
 391:             max,
 392:             avg,
 393:             median
 394:         }
 395:     };
 396: }
 397: 
 398: const normalizeLabelRows = (rows, labelMap) => {
 399:     const safeRows = rows?.rows ?? rows ?? [];
 400: 
 401:     return safeRows.map((row) => {
 402:         const label = labelMap?.get(row.name);
 403: 
 404:         return {
 405:             name: label?.name ?? row.name, // ?놁쑝硫??꾩씠??
 406:             value: Number(row.value ?? 0),
 407:         };
 408:     });
 409: };
 410: // role, level, assignee ?곗씠??李⑦듃 ?뺥깭 ?뺢퇋??
 411: const formatChartData = (rows, chartType) => {
 412:     switch (chartType) {
 413:         case "pie":
 414:             return {
 415:                 data: rows.map((row) => ({
 416:                     name: row.name,
 417:                     value: Number(row.value ?? 0),
 418:                     avatarUrl : row.avatar ?? null
 419:                 }))
 420:             };
 421:         case "bar":
 422:             return {
 423:                 categories: rows.map((row) => row.name),
 424:                 seriesData: [
 425:                     {
 426:                         data: rows.map((row) => Number(row.value ?? 0)),
 427:                     }
 428:                 ]
 429:             };
 430:         case "line":
 431:             return {
 432:                 categories: rows.map((row) => row.name),
 433:                 seriesData: [
 434:                     {
 435:                         data: rows.map((row) => Number(row.value ?? 0)),
 436:                     }
 437:                 ]
 438:             };
 439: 
 440:         default:
 441:             return rows;
 442:     }
 443: };
 444: // salary 李⑦듃 ?곗씠???뺢퇋??
 445: const formatSalaryChartData = (salaryData, chartType) => {
 446:     const { histogram, summary } = salaryData;
 447: 
 448:     switch (chartType) {
 449:         case "bar":
 450:             return {
 451:                 categories: histogram.map(h => h.range),
 452:                 seriesData: [
 453:                     {
 454:                         data: histogram.map(h => h.count)
 455:                     }
 456:                 ],
 457:                 summary
 458:             };
 459: 
 460:         case "pie":
 461:             return {
 462:                 data: histogram.map(h => ({
 463:                     name: h.range,
 464:                     value: h.count
 465:                 })),
 466:                 summary
 467:             };
 468:         case "line":
 469:             return {
 470:                 categories: histogram.map(h => h.range),
 471:                 seriesData: [
 472:                     {
 473:                         data: histogram.map(h => h.count)
 474:                     }
 475:                 ],
 476:                 summary
 477:             };
 478: 
 479:         default:
 480:             return salaryData;
 481:     }
 482: };
 483: 
 484: const formatWorklogChartData = async (project_id, chartType,startDate,endDate,accountId) => {
 485:     let data ;
 486:     switch (chartType) {
 487:         case "heatmap":
 488:             data = await aggregateByDateService({projectId:project_id,startDate,endDate});
 489: 
 490:             const formatted = data.map(item => [
 491:                 item.date,
 492:                 Number(item.seconds ?? 0)
 493:             ]);
 494: 
 495:             const year = formatted?.[0]?.[0]?.slice(0, 4) || new Date().getFullYear().toString();
 496: 
 497:             return {
 498:                 data: formatted,
 499:                 year
 500:             };
 501:         case "lineStack": {
 502:             const raw = await aggregateWorklogByUserDateService({
 503:                 projectId: project_id,startDate,endDate,accountId
 504:             });
 505:             const dateSet = new Set();
 506:             const userMap = {};
 507: 
 508:             raw.forEach(({ date, accountId, seconds, displayName, emailAddress, avatarUrl }) => {
 509:                 dateSet.add(date);
 510: 
 511:                 if (!userMap[accountId]) {
 512:                     userMap[accountId] = {
 513:                         info: {
 514:                             displayName,
 515:                             emailAddress,
 516:                             avatarUrl
 517:                         },
 518:                         dates: {}
 519:                     };
 520:                 }
 521: 
 522:                 userMap[accountId].dates[date] =
 523:                     (userMap[accountId].dates[date] || 0) + Number(seconds ?? 0);
 524:             });
 525: 
 526:             const categories = Array.from(dateSet).sort();
 527: 
 528:             const series = Object.entries(userMap).map(([accountId, { info, dates }]) => ({
 529: 
 530:                 name: `${info.displayName} (${info.emailAddress})`,
 531:                 accountId,
 532: 
 533:                 data: categories.map(date => {
 534:                     const sec = dates[date] || 0;
 535:                     return {
 536:                         value: Number((sec / 3600).toFixed(1)),
 537:                         avatarUrl: info.avatarUrl
 538:                     };
 539:                 })
 540:             }));
 541: 
 542:             return {
 543:                 categories,
 544:                 series,
 545:                 raw
 546:             };
 547:         }
 548: 
 549:         default:
 550:             return [];
 551:     }
 552: };
 553: 
 554: 
 555: // 李⑦듃 ?뺣낫 異붽?
 556: export const addChartService = async (chartData) =>{
 557:     const { project_id, charts, type } = chartData;
 558: 
 559:     if (!project_id || !charts?.length) {
 560:         throw new LogicalError(500,"Internal Server Error","INVALID_PARAMETER")
 561:     }
 562: 
 563:     return await saveCharts(project_id, charts);
 564: }
 565: 
 566: const saveCharts = async (project_id, charts) => {
 567:     const results = [];
 568: 
 569:     for (const chart of charts) {
 570:         validateChart(chart);
 571:         const saved = await insertChart(project_id, chart);
 572:         results.push(saved);
 573:     }
 574:     return results;
 575: };
 576: 
 577: const insertChart = async (project_id, chart) => {
 578: 
 579:     const chartData = {
 580:         ...chart,
 581:         project_id
 582:     };
 583:     await addChartDataRepository(chartData);
 584: 
 585:     return chartData;
 586: };
 587: 
 588: export const updateChartTitleService = async({ dashboard_id, title }) =>{
 589:     await updateChartTitleRepository(dashboard_id,title);
 590:     return;
 591: }
 592: 
 593: export const updateChartLayoutService = async (chartData) =>{
 594:     const { project_id, layouts } = chartData;
 595: 
 596:     if (!project_id) throw new LogicalError(500,"Internal Server Error","PROJECT_ID_REQUIRED");
 597: 
 598:     const rows = Array.isArray(layouts) ? layouts : [];
 599:     if (rows.length === 0) return { savedCount: 0 };
 600: 
 601:     const params = rows.map(layout => ([
 602:         layout.pos_x,
 603:         layout.pos_y,
 604:         layout.width,
 605:         layout.height,
 606:         layout.dashboard_id,
 607:         project_id
 608:     ]));
 609: 
 610:     // Repository 媛 ?ㅽ뙣瑜?throw ?섎?濡??ш린???쇳궎吏 ?딅뒗??U8).
 611:     // responseWrapper 媛 { success:false, error } 濡?吏곷젹?????꾨줎?몄쓽 res.success 遺꾧린媛 ?ㅼ젣濡??숈옉?쒕떎.
 612:     const result = await bulkUpdateLayoutsRepository(params);
 613:     return { savedCount: rows.length, rowsAffected: result?.rowsAffected ?? null };
 614: }
 615: 
 616: export const removeChartService = async ({project_id,chartId}) =>{
 617:     await deleteChartByChartIdRepository(project_id, chartId);
 618:     return;
 619: }
 620: 
 621: const validateChart = (chart) => {
 622:     if (!chart.i)
 623:         throw new LogicalError(500,"Internal Server Error","CHART_ID_REQUIRED");
 624:     if (!chart.dataType)
 625:         throw new LogicalError(500,"Internal Server Error","DATA_TYPE_REQUIRED");
 626:     if (!chart.chartType)
 627:         throw new LogicalError(500,"Internal Server Error","CHART_TYPE_REQUIRED");
 628: 
 629:     if (chart.x == null || chart.y == null) {
 630:         throw new LogicalError(500,"Internal Server Error","POSITION_REQUIRED");
 631:     }
 632: 
 633:     if (chart.w == null || chart.h == null) {
 634:         throw new LogicalError(500,"Internal Server Error","SIZE_REQUIRED");
 635:     }
 636: };
--- src/resolver/projectIssue/ProjectUsersService.js
   1: import {
   2:     deleteProjectUsersByKeyRepository,
   3:     deleteProjectMemberByAccountRepository,
   4:     findProjectusersByProjectIdRepository, getProjectUserWithScrollRepository,
   5:     insertProjectusersRepository, searchProjectUserByAccountId,
   6:     updateProjectUsersByKeyRepository,
   7:     findSalaryByProjectIdRepository, updateSalaryByKeyRepository
   8: } from "./ProjectUsersRepository";
   9: import {searchByAccountId} from "../backoffice/user/UserRepository";
  10: // P2-a ???몃젰 ?됱쓽 teamName ?댁꽍(KVS 留덉뒪?? 60珥?罹먯떆)
  11: import {getTeamIndex} from "../backoffice/team/TeamTreeCache";
  12: import {ErrorCodes} from "../../utils/errors/ErrorCodes";
  13: import {ForgeAPIError} from "../../error/ForgeAPIError";
  14: import api, {route} from "@forge/api";
  15: import {setAppFieldValueForIssues} from "../../api/jira/field/AppFieldValueApi";
  16: import {getAssigneeStats, getIssueParticipantStats} from "../../api/jira/issue/IssueApi";
  17: import {mergeIssueProperty} from "../../api/jira/issue/IssuePropertyApi";
  18: import {recordAssignedDateOnce} from "../../api/jira/issue/AssignedDateRecorder";
  19: import {getBulkJiraUsersApi, searchJiraUsersApi} from "../../api/jira/user/UserApi";
  20: import {getSummaryDataService} from "../projectDashboard/ProjectDashboardService";
  21: import {computeProjectMonths, computeEffectiveSalary} from "../projectCost/EffectiveSalary";
  22: // 湲됱뿬 ?뺤콉(RFC-163) ??怨꾩궛 寃쎈줈. 議고쉶 ?ㅽ뙣???덉쇅 ?꾪뙆(?④? ?대갚 湲덉?, 짠5-1).
  23: import {loadSalaryPolicyContext} from "../projectCost/SalaryPolicyContext";
  24: import {isUnpricedMember, SALARY_POLICY, toLevelBandDto} from "../projectCost/SalaryPolicy";
  25: import {LogicalError} from "../../error/LogicalError";
  26: 
  27: /**
  28:  * ?꾨줈?앺듃 ?곸꽭 > ?꾨줈?앺듃 ?몃젰 ?깅줉
  29:  * 諛깆삤?쇱뒪 users ???깅줉???ъ슜?먮쭔 異붽? 媛????誘몃벑濡?accountId 媛 ?섎굹?쇰룄 ?덉쑝硫?
  30:  * UNREGISTERED_USER 濡?嫄곕??쒕떎. (湲곗〈??誘몃벑濡??ъ슜???먮룞 ?깅줉(bulkInsertUsers)? ?먯?)
  31:  * @param project_id ?꾨줈?앺듃 PK
  32:  * @param jiraUser 吏???ъ슜??accountId
  33:  * @param accountId ?깅줉??accountId
  34:  * @returns {Promise<Result<*>>} ?깅줉 寃곌낵 諛섑솚
  35:  */
  36: export const insertProjectusersService = async ({project_id, jiraUser}, {accountId}) => {
  37:     const requestedIds = (jiraUser || []).map(userInfo => userInfo.value);
  38: 
  39:     if (requestedIds.length > 0) {
  40:         const dbUsers = (await searchByAccountId(requestedIds))?.rows ?? [];
  41:         const registered = new Set(dbUsers.map(u => u.account_id));
  42:         if (requestedIds.some(id => !registered.has(id))) {
  43:             throw new LogicalError(ErrorCodes.UNREGISTERED_USER, ErrorCodes.UNREGISTERED_USER);
  44:         }
  45:     }
  46: 
  47:     const insertProjectUsersParam = [project_id, accountId, accountId, project_id, ...requestedIds];
  48:     return await insertProjectusersRepository(insertProjectUsersParam, requestedIds.length);
  49: }
  50: 
  51: /**
  52:  * ?꾨줈?앺듃 ?몃젰 異붽????ъ슜??寃????Jira 寃??寃곌낵 以?諛깆삤?쇱뒪 users ???깅줉???ъ슜?먮쭔 諛섑솚.
  53:  * ?묐떟 ?먯냼 shape ? searchJiraUsers(Jira raw user)? ?숈씪 ???꾨줎??JiraUserSelect 留ㅽ븨 ?ъ궗??
  54:  */
  55: export const searchRegisteredJiraUsersService = async ({keyword}) => {
  56:     const jiraUsers = (await searchJiraUsersApi('user', keyword)) || [];
  57:     const accountIds = jiraUsers.map(u => u.accountId).filter(Boolean);
  58:     if (accountIds.length === 0) return [];
  59: 
  60:     const dbUsers = (await searchByAccountId(accountIds))?.rows ?? [];
  61:     const dbSet = new Set(dbUsers.map(u => u.account_id));
  62:     return jiraUsers.filter(u => dbSet.has(u.accountId));
  63: }
  64: 
  65: /**
  66:  * ?꾨줈?앺듃 ?곸꽭 > ?몃젰 愿由?議고쉶
  67:  * @param page ?꾩옱 ?섏씠吏
  68:  * @param pagesize ?섏씠吏 ?ш린 (湲곕낯 10)
  69:  * @param project_id ?좊뱶???꾨줈?앺듃 ID
  70:  * @returns {Promise<Result<*>>} ?꾨줈?앺듃 ???몃젰 議고쉶 寃곌낵
  71:  */
  72: export const findProjectusersByProjectIdService = async ({page, pagesize= 10, project_id}) => {
  73:     const pageParams = {page, pagesize};
  74:     const params = [project_id];
  75:     const result = await findProjectusersByProjectIdRepository(pageParams, params);
  76: 
  77:     // P2-a ???됱뿉 ? 異뺤쓣 ?밸뒗?? **湲곗〈 ?꾨뱶(snake_case)???섎굹??嫄대뱶由ъ? ?딅뒗 ?쒖닔 異붽?**??
  78:     //   teamName ? KVS 留덉뒪?곕씪 SQL 濡?紐?媛?몄삩????60珥?罹먯떆 ?몃뜳?ㅻ줈 ?댁꽍(L2).
  79:     //   ????섎굹???놁쑝硫??몃뜳?ㅻ? 議고쉶???댁쑀媛 ?녿떎(遺덊븘?뷀븳 KVS ?뺣났 ?뚰뵾).
  80:     const rows = result?.rows ?? [];
  81:     if (!rows.some(r => r.team_key)) {
  82:         return { ...result, rows: rows.map(r => ({ ...r, teamKey: null, teamName: null })) };
  83:     }
  84: 
  85:     const teamIndex = await getTeamIndex();
  86:     return {
  87:         ...result,
  88:         rows: rows.map(r => ({
  89:             ...r,
  90:             teamKey: r.team_key ?? null,
  91:             teamName: r.team_key ? teamIndex.byKey.get(r.team_key)?.name ?? null : null,
  92:         })),
  93:     };
  94: }
  95: 
  96: /**
  97:  * ?꾨줈?앺듃 ?곸꽭 > ?몃젰 ??젣
  98:  * @param project_member_id ??젣 ?섎젮??project_member ?뚯씠釉?PK
  99:  * @returns {Promise<Result<*>>} ??젣 寃곌낵
 100:  */
 101: export const deleteProjectUsersByKeyService = async ({project_member_id}) => {
 102:     const params = [project_member_id];
 103:     return await deleteProjectUsersByKeyRepository(params)
 104: }
 105: 
 106: /**
 107:  * /resource ?꾨줈?앺듃 諛곗젙 ??> 諛곗젙 ?몄썝 紐낅떒?먯꽌 硫ㅻ쾭 ?쒓굅(?꾨줈?앺듃 諛곗젙 痍⑥냼).
 108:  * roster ?됱뿉??project_member_id(PK)媛 ?녾퀬 accountId 留??덉뼱 (project_id, account_id) 蹂듯빀?ㅻ줈 ??젣?쒕떎.
 109:  * - ?몃젰 愿由???deleteProjectUsersByKey ? ?숈씪 ?쒕㎤?? 硫ㅻ쾭??쭔 ?쒓굅(?댁뒋 ?대떦/coworker ?댁젣???섏? ?딅뒗??.
 110:  * - ?????誘몄〈????rowsAffected === 0 ??USER_NOT_FOUND(LogicalError). updateUser 誘몄〈??泥섎━? ?숈씪 ?⑦꽩.
 111:  *   (蹂꾨룄 PROJECT_MEMBER_NOT_FOUND 肄붾뱶??誘몄떊????ErrorCodes 臾대?寃??쒖빟. 由ы룷???쒖븞 李멸퀬)
 112:  * - Forge SQL ? ?④굔 DELETE ???몃옖??뀡/cascade 臾닿?.
 113:  * @param project_id ?꾨줈?앺듃 PK(uuid) ??inherited scope 媛?쒓? payload.project_id 濡??뚯냽 寃利?
 114:  * @param accountId ?쒓굅 ???Jira accountId
 115:  * @returns {Promise<{project_id: string, accountId: string, removed: true}>}
 116:  */
 117: export const removeProjectMemberByAccountService = async ({project_id, accountId}, droppedFields = []) => {
 118:     const result = await deleteProjectMemberByAccountRepository([project_id, accountId]);
 119:     if (result.rowsAffected === 0) {
 120:         throw new LogicalError(ErrorCodes.USER_NOT_FOUND, ErrorCodes.USER_NOT_FOUND);
 121:     }
 122:     // droppedFields: 짠R3-C(議곗슜???ㅽ뙣 湲덉?). ???묐떟? content ?섑띁媛 ?놁뼱 猷⑦듃??遺숈씤?? RESOURCE 寃쎈줈????긽 [].
 123:     return {project_id, accountId, removed: true, droppedFields};
 124: }
 125: 
 126: /**
 127:  * ?꾨줈?앺듃 ?곸꽭 > ?몃젰 ?곗씠???섏젙
 128:  * @param role_key 蹂寃??섎젮??role KVS key(?놁쓣 寃쎌슦 '')
 129:  * @param level_key 蹂寃??섎젮??level KVS key(?놁쓣 寃쎌슦 '')
 130:  * @param salary 蹂寃쏀븯?ㅻ뒗 ?곕큺 (?놁쓣 寃쎌슦 '')
 131:  * @param project_member_id 蹂寃쏀븯?ㅻ뒗 project_member ?뚯씠釉?PK
 132:  * @param accountId ?섏젙??accountId
 133:  * @returns {Promise<Result<*>>} ?섏젙 寃곌낵 諛섑솚
 134:  */
 135: export const updateProjectUsersByKeyService = async ({role_key = '', level_key = '', project_member_id}, {accountId}) => {
 136:     // ?좑툘 salary ???섎룄?곸쑝濡?諛쏆? ?딅뒗?? ??寃쎈줈??媛?쒕뒗 PROJECT write ?? 湲됱뿬瑜??ш린???곕㈃
 137:     //    PROJECT_COST ?놁씠 ?ъ엯湲됱뿬瑜?怨좎튌 ???덇쾶 ?쒕떎(2026-07-13 湲됱뿬 由щ돱?쇱쓽 ?붿옱???.
 138:     //    湲됱뿬 ?몄쭛? updateProjectMemberSalary(W('PROJECT_COST','inherited')) 瑜??대떎.
 139:     const params = [
 140:         role_key,
 141:         role_key,
 142:         level_key,
 143:         level_key,
 144:         accountId,
 145:         project_member_id
 146:     ]
 147:     return await updateProjectUsersByKeyRepository(params)
 148: }
 149: 
 150: const VALID_SALARY_TYPES = ['PROJECT', 'ANNUAL'];
 151: 
 152: /**
 153:  * 湲됱뿬 愿由???議고쉶 (湲됱뿬 愿由?由щ돱??.
 154:  * 湲곌컙(start/end)留뚯쑝濡?projectMonths ?곗젙 ??媛??됱뿉 effective_salary 遺李?
 155:  * 怨듯쑕???섏튂 ?놁쓬(?뷀븷 ?섏궛? start/end 留??꾩슂).
 156:  * @param page ?꾩옱 ?섏씠吏(湲곕낯 1)
 157:  * @param pagesize ?섏씠吏 ?ш린(湲곕낯 10)
 158:  * @param project_id ?꾨줈?앺듃 PK(uuid)
 159:  * @returns {Promise<{rows: Array, meta: {projectMonths: number}}>}
 160:  */
 161: export const getProjectSalaryListService = async ({page = 1, pagesize = 10, project_id}) => {
 162:     if (!project_id) {
 163:         const {policy} = await loadSalaryPolicyContext();
 164:         return {rows: [], meta: {projectMonths: 0, salaryPolicy: policy, unpricedMemberCount: 0}};
 165:     }
 166: 
 167:     const pageParams = {page, pagesize};
 168: 
 169:     // 蹂묐젹 ?섏튂: ?꾨줈?앺듃 湲곌컙(summary) + 湲됱뿬 ??users 議곗씤) + 湲됱뿬 ?뺤콉. 怨듯쑕???섏튂 ?놁쓬.
 170:     const [summary, salaryResult, policyCtx] = await Promise.all([
 171:         getSummaryDataService({project_id}),
 172:         findSalaryByProjectIdRepository(pageParams, [project_id]),
 173:         loadSalaryPolicyContext(),
 174:     ]);
 175: 
 176:     const projectMonths = computeProjectMonths(summary?.start_date, summary?.end_date);
 177:     const {policy, levelBands} = policyCtx;
 178:     const isLevelBand = policy === SALARY_POLICY.LEVEL_BAND;
 179: 
 180:     let unpricedMemberCount = 0;
 181: 
 182:     const rows = (salaryResult?.rows ?? []).map((row) => {
 183:         const effective_salary = computeEffectiveSalary(
 184:             {
 185:                 salaryType: row.salary_type,
 186:                 salary: row.salary,
 187:                 annualSalary: row.annual_salary,
 188:                 levelKey: row.level_key,
 189:             },
 190:             {projectMonths, policy, levelBands}
 191:         );
 192: 
 193:         if (isUnpricedMember({effectiveSalary: effective_salary, salaryType: row.salary_type}, policy)) {
 194:             unpricedMemberCount++;
 195:         }
 196: 
 197:         /*
 198:          * ?뵏 LEVEL_BAND ??媛쒖씤 湲덉븸(salary / annual_salary / salary_type)??**?묐떟???ｌ? ?딅뒗??*.
 199:          *   `...row` ?ㅽ봽?덈뱶瑜??곕㈃ 而щ읆???섏뼱???뚮쭏??議곗슜???덈?濡? ?ш린?쒕뒗 **紐낆떆 ?붿씠?몃━?ㅽ듃**濡?議곕┰?쒕떎.
 200:          */
 201:         if (isLevelBand) {
 202:             return {
 203:                 project_member_id: row.project_member_id,
 204:                 account_id: row.account_id,
 205:                 role_key: row.role_key,
 206:                 level_key: row.level_key,
 207:                 level_band: toLevelBandDto(row.level_key, levelBands),
 208:                 effective_salary,
 209:                 total_count: row.total_count,
 210:             };
 211:         }
 212: 
 213:         return {
 214:             ...row,
 215:             salary_type: row.salary_type ?? 'PROJECT',
 216:             effective_salary,
 217:         };
 218:     });
 219: 
 220:     return {rows, meta: {projectMonths, salaryPolicy: policy, unpricedMemberCount}};
 221: };
 222: 
 223: /**
 224:  * 湲됱뿬 愿由????몄쭛 (湲됱뿬 愿由?由щ돱??.
 225:  * salary / salary_type 以??꾩넚??寃껊쭔 媛깆떊(鍮?臾몄옄??undefined = 誘몃?寃? CASE '' ?⑦꽩).
 226:  * @param salary ?ъ엯 湲됱뿬(誘몃?寃???'')
 227:  * @param salary_type 怨꾩궛 紐⑤뱶 'PROJECT'|'ANNUAL'(誘몃?寃???'')
 228:  * @param project_member_id ???projectusers PK(uuid)
 229:  * @param accountId ?섏젙??accountId(context)
 230:  * @returns {Promise<Result<*>>} ?섏젙 寃곌낵
 231:  */
 232: export const updateProjectMemberSalaryService = async ({salary = '', salary_type = '', project_member_id}, {accountId}) => {
 233:     /*
 234:      * 湲됱뿬 ?뺤콉(RFC-163, D5) ??LEVEL_BAND ?먯꽌???ъ엯湲됱뿬쨌怨꾩궛紐⑤뱶媛 **怨꾩궛???곗씠吏 ?딅뒗??*.
 235:      *   ?곗씠吏 ?딅뒗 媛믪쓣 ?몄쭛?섍쾶 ?먮㈃ "???レ옄媛 ??諛붾뚮굹"媛 諛쒖깮?섎?濡??쒕쾭媛 嫄곕??쒕떎.
 236:      *   ??write 寃쎈줈?대?濡??뺤콉 議고쉶 ?ㅽ뙣???덉쇅 ?꾪뙆(= 嫄곕?). ?닿쾬??fail-close 諛⑺뼢怨??뺥빀?쒕떎.
 237:      */
 238:     const {policy} = await loadSalaryPolicyContext();
 239:     if (policy === SALARY_POLICY.LEVEL_BAND) {
 240:         throw new LogicalError(
 241:             ErrorCodes.SALARY_POLICY_LEVEL_BAND,
 242:             'individual salary is read-only while salaryPolicy is LEVEL_BAND',
 243:         );
 244:     }
 245: 
 246:     // 鍮?臾몄옄?댁? "誘몃?寃? ?섎??대?濡??듦낵. 媛믪씠 ?덉쓣 ?뚮쭔 ?좏슚??寃??
 247:     if (salary_type !== '' && !VALID_SALARY_TYPES.includes(salary_type)) {
 248:         throw new LogicalError('INVALID_SALARY_TYPE', `Invalid salary_type: ${salary_type}`);
 249:     }
 250: 
 251:     const params = [
 252:         salary,
 253:         salary,
 254:         salary_type,
 255:         salary_type,
 256:         accountId,
 257:         project_member_id,
 258:     ];
 259: 
 260:     return await updateSalaryByKeyRepository(params);
 261: };
 262: 
 263: /**
 264:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽 ?곗씠???깅줉 / ?섏젙
 265:  * @param customFieldId ?깅줉 / ?섏젙?섎젮??customFieldId => 李멸퀬 customField.js
 266:  * @param issueId ?깅줉 / ?섏젙 ?섎젮??issueId
 267:  * @param value ?깅줉 / ?섏젙 ?섎젮??value
 268:  * @returns {Promise<void>}
 269:  */
 270: export const updateProjectIdFieldService = async ({customFieldId, issueId, value}) => {
 271:     // ?????꾨뱶 write ??AppFieldValueApi 媛 ?좎씪 寃쎈줈??RFC-171). value ??**吏곷젹?????먮낯媛?*??
 272:     //   ?섍릿????怨쇨굅泥섎읆 ?몄텧遺媛 JSON 議곌컖 臾몄옄?댁쓣 議곕┰?섏? ?딅뒗??
 273:     //   coworker(user 而щ젆????[{accountId}], 洹???projectId ????臾몄옄??
 274:     const rawValue = Array.isArray(value)
 275:         ? value.map(accountId => ({accountId}))
 276:         : String(value ?? '');
 277: 
 278:     await setAppFieldValueForIssues({
 279:         fieldIdOrKey: customFieldId,
 280:         issueIds: issueId,
 281:         value: rawValue,
 282:     });
 283: }
 284: 
 285: /**
 286:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽 ?곗씠????젣
 287:  * @param customFieldId ??젣?섎젮??customFieldId => 李멸퀬 customField.js
 288:  * @param issueId ??젣?섎젮??issueId
 289:  * @returns {Promise<void>}
 290:  */
 291: export const deleteProjectIssueService = async ({customFieldId, issueId}) => {
 292:     // 鍮?臾몄옄??= ?꾨뱶 媛??댁젣(湲곗〈 ?숈옉怨??숈씪: body ??value 媛 "")
 293:     await setAppFieldValueForIssues({
 294:         fieldIdOrKey: customFieldId,
 295:         issueIds: issueId,
 296:         value: '',
 297:     });
 298: }
 299: 
 300: /*
 301:  * A-3 ?????듦퀎??媛숈? 寃?됱쓣 1?⑥뒪濡?怨듭쑀?쒕떎(ProjectParticipantFetcher).
 302:  *   `viewerId`(?몄텧??accountId)??洹??섏쿂??**?몄뒪?댁뒪 罹먯떆 ??*濡쒕쭔 ?곗씤?? 寃?됱씠 `as:'user'` ??
 303:  *   寃곌낵媛 ?몄텧??沅뚰븳?쇰줈 ?꾪꽣留곷릺誘濡??ъ슜?먮퀎濡?媛덈씪??媛??踰붿쐞媛 ?욎씠吏 ?딅뒗??
 304:  *   ?꾨떖?섏? ?딆쑝硫?罹먯떆瑜??곗? ?딅뒗??fail-safe) ???묐떟 shape쨌吏묎퀎 寃곌낵??醫낆쟾怨??숈씪?섎떎.
 305:  */
 306: 
 307: // ?몃젰蹂??좊떦 ?댁뒋 媛쒖닔
 308: export const getAssigneeStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
 309:     return await getAssigneeStats({projectId, coworkerFieldId, includeCoworker, viewerId});
 310: }
 311: 
 312: // ?댁뒋蹂?李몄뿬 ?몄썝 媛쒖닔
 313: export const getIssueParticipantStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
 314:     return  await getIssueParticipantStats({projectId, coworkerFieldId, includeCoworker, viewerId});
 315: }
 316: 
 317: export const getProjectUserWithScrollService = async ({project_id, cursor = null, limit = 5}) => {
 318:     // 1. DB 議고쉶
 319:     const rows = await getProjectUserWithScrollRepository({project_id, cursor, limit});
 320: 
 321:     if (!rows || rows.length === 0) {
 322:         return {
 323:             data: [],
 324:             nextCursor: null,
 325:             hasMore: false
 326:         };
 327:     }
 328: 
 329:     // 2. accountId 異붿텧
 330:     const accountIds = rows
 331:         .map(r => r.account_id)
 332:         .filter(Boolean);
 333: 
 334:     // 3. ?ъ슜??api 議고쉶
 335:     const jiraResults = await getBulkJiraUsersApi(accountIds);
 336: 
 337:     // 4. 蹂묓빀???꾪븳 map
 338:     const jiraMap = new Map();
 339: 
 340:     jiraResults.forEach(res => {
 341:         res?.values?.forEach(user => {
 342:             jiraMap.set(user.accountId, user);
 343:         });
 344:     });
 345: 
 346:     // 5. ?ъ슜???뺣낫 蹂묓빀 異뷀썑 ?꾩슂??遺꾨━
 347:     const merged = rows.map(row => {
 348:         const jiraUser = jiraMap.get(row.account_id);
 349:         return {
 350:             ...row,
 351:             emailAddress: jiraUser?.emailAddress ?? 'Unknown User',
 352:             displayName: jiraUser?.displayName ?? 'Unknown User',
 353:             avatar: jiraUser?.avatarUrls?.['24x24'] ?? null
 354:         };
 355:     });
 356: 
 357:     // 6. cursor 怨꾩궛
 358:     const lastItem = merged[merged.length - 1];
 359: 
 360:     return {
 361:         data: merged,
 362:         nextCursor: lastItem?.project_member_id ?? null,
 363:         hasMore: merged.length === limit
 364:     };
 365: };
 366: 
 367: export const searchProjectUserService = async ({project_id , keyword}) =>{
 368:     // ?ㅼ썙?쒕줈 吏???몄텧 寃??
 369:     const jiraUsers = (await searchJiraUsersApi('user',keyword))
 370:         .filter(u => u.accountType !== 'user');
 371: 
 372:     const accountIds = jiraUsers.map(u => u.accountId); // 寃?됰맂 ids
 373: 
 374:     // ?꾨줈?앺듃???좊떦 ?섏뼱?덈뒗吏 ?뺤씤
 375:     const dbUsers = await searchProjectUserByAccountId(project_id, accountIds);
 376: 
 377:     const dbSet = new Set(dbUsers.map(u => u.account_id));
 378: 
 379:     const result = jiraUsers.filter(u => dbSet.has(u.accountId)).map(mapUser);
 380: 
 381:     return {
 382:         data: result
 383:     };
 384: }
 385: 
 386: const mapUser = (u) => ({
 387:     account_id: u.accountId,
 388:     displayName: u.displayName,
 389:     avatar: u?.avatarUrls?.['24x24'] ?? null
 390: });
 391: 
 392: /**
 393:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽(?댁뒋) 肄붿썙而??꾩슜 媛깆떊 (? 愿由ы삎 吏??.
 394:  * - ?댁뒋 ?꾨줈?쇳떚(movesRms)瑜?read-merge-write ??coworkers(accountId[])留?援먯껜?쒕떎.
 395:  *   assignedAt/assignedAtIso/assignedById ???ㅻⅨ ?꾨뱶??蹂댁〈(merge). 鍮?諛곗뿴?대㈃ ?댁젣(coworkers:[]).
 396:  * - coworker ?몄쭛? ?ъ슜???≪뀡?대?濡?best-effort 媛 ?꾨땲???ㅽ뙣瑜??꾪뙆(?꾨줎???좎뒪??.
 397:  * - projectId 踰붿슜 ?꾨뱶 write(updateProjectIdFieldService)? 遺꾨━ ??projectId ?⑸룄??臾대?寃?
 398:  * @param issueId ????댁뒋 id(?レ옄) ?먮뒗 key
 399:  * @param accountIds ?묒뾽??accountId 諛곗뿴
 400:  * @returns {Promise<{content:{issueId, coworkers:string[]}}>}
 401:  */
 402: export const updateIssueCoworkersService = async ({issueId, accountIds}) => {
 403:     const ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : [];
 404:     // ?묒뾽??吏?뺣쭏??2嫄댁뵫 李랁? 怨쇰떎. ?ㅽ뙣??mergeIssueProperty 媛 ?꾪뙆?쒕떎. ?꾩슂 ???댁젣.
 405:     // console.log('[MOVES][updateIssueCoworkers] req', JSON.stringify({issueId, count: ids.length}));
 406:     await mergeIssueProperty(issueId, {coworkers: ids}); // read-merge-write, ?ㅻⅨ ?꾨뱶 蹂댁〈
 407:     // console.log('[MOVES][updateIssueCoworkers] OK', String(issueId));
 408:     return {content: {issueId, coworkers: ids}};
 409: };
 410: 
 411: /**
 412:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽(?댁뒋) ?깅줉?셋룸벑濡앹옄 湲곕줉 (best-effort / 鍮꾩감?? ???댁뒋 ?꾨줈?쇳떚(movesRms) ?꾪솚.
 413:  * - 媛?쒕뒗 ?꾨줈?쇳떚 assignedAt 湲곗?: ?대? ?깅줉???덉쑝硫?skip(理쒖큹 ?깅줉 ?쒖젏쨌?깅줉???좎?).
 414:  *   ??? 愿由ы삎?먯꽌 留ㅻ쾲 ??뼱?곕뜕 遺?묒슜(?붽뎄?ы빆 짠4-2) ?댁냼.
 415:  * - assignedAt ? 諛섎뱶??date-only(slice(0,10)) 濡????date ?몃뜳???⑥젙 짠3-3). ISO ?먮낯? assignedAtIso.
 416:  * - coworkers ??湲곗〈 ?꾨줈?쇳떚 ?꾨뱶??merge 濡?蹂댁〈(...prev).
 417:  * - ?깅줉??accountId ??resolver context ?먯꽌 ?쒕쾭媛 痍⑤뱷(?꾨?議?諛⑹?).
 418:  * - 媛쒕퀎 read/write ?ㅽ뙣?대룄 throw ?섏? ?딄퀬 skip 吏묎퀎(?꾩껜 ?ㅽ뙣 ??recorded:0 源뚯? ?덉슜).
 419:  * - (湲곗〈 assignedDateFieldId/assignedByFieldId ?몄옄???꾨줎???명솚???꾪빐 payload 濡?怨꾩냽 ???臾댁떆?쒕떎.)
 420:  * @param issueIds ?깅줉???댁뒋 id 臾몄옄??諛곗뿴
 421:  * @param accountId ?깅줉??accountId (context 痍⑤뱷)
 422:  * @returns {Promise<{recorded: number, skipped: number}>}
 423:  */
 424: export const recordIssueAssignedDateService = async ({issueIds, accountId}) => {
 425:     // 濡쒖쭅 蹂몄껜??AssignedDateRecorder 濡?異붿텧?먮떎(援щ룆 ?몄엯 4寃쎈줈? 媛?쑣톗erge쨌date-only 洹쒖튃????踰뚮줈 怨듭쑀).
 426:     // ??寃쎈줈???뺤콉? 臾대?寃???assignedById 瑜?湲곕줉?섍퀬 assignedVia 留덉빱???곗? ?딅뒗??
 427:     const {recorded, skipped} = await recordAssignedDateOnce({
 428:         issueIds,
 429:         extra: (prev) => ({assignedById: accountId ?? prev?.assignedById ?? null}),
 430:         // ?섎룞 ?깅줉(紐⑤떖 ?ㅼ쨷 ?좏깮)? 諛곗튂 ?곹븳 ??곸씠 ?꾨땲?????붿껌??嫄??꾨? 湲곕줉?쒕떎.
 431:         maxPerRun: Infinity,
 432:         logPrefix: '[recordIssueAssignedDate] fail ??skip',
 433:     });
 434: 
 435:     return {recorded, skipped};  // ?묐떟 shape 遺덈?(capped ???몄텧?섏? ?딅뒗??
 436: };
--- src/resolver/projectDashboard/ProjectDashboardController.js
   1: import {guardedDefine} from "../../permission/permissionGuard";
   2: import {
   3:     addChartService, getChartDataByIdService,
   4:     getChartDataService, getChartInfoService,
   5:     getSummaryDataService, removeChartService, updateChartLayoutService,
   6:     updateChartTitleService
   7: } from "./ProjectDashboardService";
   8: // 湲됱뿬 ?뺤콉(RFC-163) ??**Controller ?덉씠??寃뚯씠??*(짠5-3 ??3 ??getUserInfo ?좊?? ?숈씪 ?댁쑀)
   9: import {canShowIndividualSalary, resolveSalaryPolicySafe} from "../../permission/SalaryVisibility";
  10: import {canReadCost} from "../../permission/CostAccess";
  11: 
  12: 
  13: export const registerProjectDashboardController = resolver =>{
  14:     /*
  15:      * 湲됱뿬 ?뺤콉(RFC-163) ??LEVEL_BAND ?먯꽌??`total_salary`(誇 ?ъ엯湲됱뿬) **???먯껜瑜??쒓굅**?쒕떎.
  16:      *   1???꾨줈?앺듃?먯꽌??洹??щ엺???ъ엯湲됱뿬 洹몃?濡쒕씪 媛쒖씤 湲덉븸?대떎.
  17:      *   `?? 0` ?쇰줈 嫄곗쭞 0 ??洹몃━吏 紐삵븯寃?**?ㅻ? ?놁븻??*(?꾨줎??SummaryPanel ??KpiTile ??誘몃젋??.
  18:      *
  19:      * ?졻슑 **寃뚯씠?낆? 諛섎뱶???ш린(Controller)?먯꽌 ?쒕떎.** `getSummaryDataService` ??resolver ?꾩슜???꾨땲??
  20:      *   ?대? ?뚮퉬?먭? **3怨?*?대떎 ??`ProjectCostService:114`(?대? ?먭린 settings 瑜??쎈뒗??,
  21:      *   `ProjectUsersService:170`, `ProjectProgressService:70`(total_salary 瑜??곗????딅뒗??.
  22:      *   ?쒕퉬?ㅼ뿉 ?뺤콉 議고쉶瑜??ｌ쑝硫?洹?3怨??꾨???KVS ?뺣났??異붽??쒕떎(`getSettingDataService` ??硫붾え?댁쫰 ?놁쓬).
  23:      *   `getUserInfo`(PrincipalResolver ?대? ?몄텧)쨌`updateUser` ? **媛숈? ?먮떒**?대떎.
  24:      *
  25:      * ??fail-close: `resolveSalaryPolicySafe` ??議고쉶 ?ㅽ뙣 ??LEVEL_BAND(= ?④?)濡??대갚?쒕떎.
  26:      *
  27:      * ?졻슑 **?뺤콉怨?臾닿??섍쾶 `PROJECT_COST` read ???붽뎄?쒕떎.** ??媛?쒕뒗 DASHBOARD read ?닿퀬
  28:      *   ?쒕뱶 Member ?뗭? DASHBOARD read=true / PROJECT_COST read=false ?? ?뺤콉留?蹂대㈃
  29:      *   湲곕낯媛믪씤 INDIVIDUAL ?ㅼ튂(= 湲곗〈 ?ㅼ튂 ?꾨?)?먯꽌 **紐⑤뱺 援ъ꽦?먯씠 ?꾨줈?앺듃 ?멸굔鍮꾨? 蹂몃떎**
  30:      *   ??1???꾨줈?앺듃硫?洹몃?濡?洹??щ엺???ъ엯湲됱뿬?? ?먮옒 "蹂꾧굔 RFC" 濡?誘몃쨪 ???援щ찉?몃뜲
  31:      *   `getProjectSalaryList`쨌`getProjectCostSummary` ? 媛숈? 寃뚯씠?몃줈 ?ш린???ル뒗??
  32:      *   (`canReadCost` ??principal ?꾨씫 ??fail-close ??)
  33:      */
  34:     guardedDefine(resolver, 'getSummaryData', async ({payload, principal}) => {
  35:         const res = await getSummaryDataService(payload);
  36:         if (canReadCost(principal) && canShowIndividualSalary(await resolveSalaryPolicySafe())) return res;
  37:         const {total_salary, ...rest} = res ?? {};
  38:         return rest;
  39:     });
  40: 
  41:     guardedDefine(resolver, 'getChartInfo', ({payload}) => getChartInfoService(payload));
  42: 
  43:     // principal ?꾨떖: salary ?곗씠?곗뀑??PROJECT_COST read 瑜??붽뎄?쒕떎(U7).
  44:     // 媛??DASHBOARD read)留뚯쑝濡쒕뒗 ?щТ 誘쇨컧 ?곗씠?곕? 留됱? 紐삵븯誘濡??쒕퉬?ㅺ? dataType ?⑥쐞濡??먯젙?쒕떎.
  45:     guardedDefine(resolver, 'getChartDataById', ({payload, principal}) => getChartDataByIdService({...payload, principal}));
  46: 
  47:     guardedDefine(resolver, 'getChartData', ({payload, principal}) => getChartDataService({...payload, principal}));
  48: 
  49:     guardedDefine(resolver, 'addChart', ({payload}) => addChartService(payload));
  50: 
  51:     guardedDefine(resolver, 'updateChartTitle', ({payload}) => updateChartTitleService(payload));
  52: 
  53:     guardedDefine(resolver, 'updateChartLayout', ({payload}) => updateChartLayoutService(payload));
  54: 
  55:     guardedDefine(resolver, 'removeChart', ({payload}) => removeChartService(payload));
  56: }
--- src/resolver/projectIssue/ProjectUsersController.js
   1: import {guardedDefine} from "../../permission/permissionGuard";
   2: import {
   3:     deleteProjectIssueService,
   4:     deleteProjectUsersByKeyService,
   5:     findProjectusersByProjectIdService, getProjectUserWithScrollService, getProjectUserWitScrollService,
   6:     insertProjectusersService, searchProjectUserService, searchRegisteredJiraUsersService,
   7:     updateProjectIdFieldService,
   8:     updateProjectUsersByKeyService,
   9:     recordIssueAssignedDateService,
  10:     updateIssueCoworkersService,
  11:     getProjectSalaryListService,
  12:     updateProjectMemberSalaryService,
  13:     removeProjectMemberByAccountService
  14: } from "./ProjectUsersService";
  15: 
  16: export const registerProjectUsersController = resolver => {
  17:     guardedDefine(resolver, 'insertProjectusers', ({payload, context}) => insertProjectusersService(payload, context));
  18: 
  19:     guardedDefine(resolver, 'findProjectusersByProjectId', ({payload}) => findProjectusersByProjectIdService(payload));
  20: 
  21:     guardedDefine(resolver, 'deleteProjectUsersByKey', ({payload}) => deleteProjectUsersByKeyService(payload));
  22: 
  23:     /* /resource ?꾨줈?앺듃 諛곗젙 ??> 諛곗젙 ?몄썝 紐낅떒 硫ㅻ쾭 ?쒓굅(?꾨줈?앺듃 諛곗젙 痍⑥냼) ??(project_id, accountId) 蹂듯빀????젣 */
  24:     // droppedFields ?꾨떖 ?????寃쎈줈 allowlist 寃곌낵瑜??묐떟???몄텧(짠R3-C).
  25:     guardedDefine(resolver, 'removeProjectMemberByAccount', ({payload, droppedFields}) =>
  26:         removeProjectMemberByAccountService(payload, droppedFields));
  27: 
  28:     guardedDefine(resolver, 'updateProjectUsersByKey', ({payload, context}) => updateProjectUsersByKeyService(payload, context));
  29: 
  30:     /* app 沅뚰븳?쇰줈 ?ㅽ뻾?댁빞 ?댁꽌 backend 濡쒖쭅?먯꽌 ?ㅽ뻾*/
  31:     guardedDefine(resolver, 'updateProjectIdField', ({payload}) => updateProjectIdFieldService(payload));
  32: 
  33:     guardedDefine(resolver, 'deleteProjectIssue', ({payload}) => deleteProjectIssueService(payload));
  34: 
  35:     /* 肄붿썙而??꾩슜 媛깆떊(? 愿由ы삎): ?댁뒋 ?꾨줈?쇳떚 read-merge-write. app 沅뚰븳 ?꾩슂 ??backend 濡쒖쭅 ?ㅽ뻾 */
  36:     guardedDefine(resolver, 'updateIssueCoworkers', ({payload}) => updateIssueCoworkersService(payload));
  37: 
  38:     /* ?깅줉?셋룸벑濡앹옄 湲곕줉: ?깅줉??accountId ??payload 媛 ?꾨땲??context ?먯꽌 ?쒕쾭媛 痍⑤뱷(?꾨?議?諛⑹?) */
  39:     guardedDefine(resolver, 'recordIssueAssignedDate', ({payload, context}) =>
  40:         recordIssueAssignedDateService({...payload, accountId: context?.accountId})
  41:     );
  42: 
  43:     guardedDefine(resolver, 'getProjectUserWithScroll', ({payload}) => getProjectUserWithScrollService(payload));
  44: 
  45:     guardedDefine(resolver, 'searchProjectUser', ({payload}) => searchProjectUserService(payload));
  46: 
  47:     /* ?몃젰 異붽????ъ슜??寃????諛깆삤?쇱뒪 ?깅줉 ?ъ슜?먮쭔 諛섑솚(?깅줉???ъ슜?먮쭔 異붽? 媛???뺤콉) */
  48:     guardedDefine(resolver, 'searchRegisteredJiraUsers', ({payload}) => searchRegisteredJiraUsersService(payload));
  49: 
  50:     /* 湲됱뿬 愿由?由щ돱????湲됱뿬 ??議고쉶/?몄쭛. ?몄쭛??accountId ??context ?먯꽌 ?쒕쾭 痍⑤뱷 */
  51:     guardedDefine(resolver, 'getProjectSalaryList', ({payload}) => getProjectSalaryListService(payload));
  52: 
  53:     guardedDefine(resolver, 'updateProjectMemberSalary', ({payload, context}) => updateProjectMemberSalaryService(payload, context));
  54: }
--- search stats call sites
src\api\jira\issue\ProjectParticipantFetcher.js:4: * `getAssigneeStats`(담당자별 건수)와 `getIssueParticipantStats`(이슈별 참여자 수)는
src\api\jira\issue\ProjectParticipantFetcher.js:14: * 위젯은 프론트가 위젯당 `invoke('getChartDataById')` 1회로 호출하므로 assignee/issue 두 위젯은
src\api\jira\issue\ProjectParticipantFetcher.js:82:export const getProjectParticipantIssues = async ({ projectId, viewerId = null }) => {
src\api\jira\issue\IssueApi.js:7:import { getProjectParticipantIssues } from "./ProjectParticipantFetcher";
src\api\jira\issue\IssueApi.js:9:export const getAssigneeStats = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
src\api\jira\issue\IssueApi.js:17:    const records = await getProjectParticipantIssues({projectId, viewerId});
src\api\jira\issue\IssueApi.js:73:export const getIssueParticipantStats = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
src\api\jira\issue\IssueApi.js:78:    // getAssigneeStats 와 **같은 1패스 페치 결과**를 쓴다(참여자 수 집계는 카운트만 → user resolve 불필요).
src\api\jira\issue\IssueApi.js:79:    const records = await getProjectParticipantIssues({projectId, viewerId});
src\api\jira\issue\CoworkerResolver.js:5: * getAssigneeStats)는 accountId → user 객체 변환이 필요하다. 여러 이슈의 coworker 를 flat + dedup 해
src\api\jira\issue\CoworkerResolver.js:8: * ⚠️ 카운트만 필요한 소비처(progress/cost/portfolio, getIssueParticipantStats)는 이 함수를 쓰지 말 것
src\permission\PermissionMap.js:192:    getChartDataById: R('DASHBOARD', 'detail'),
static/ui/src\utils\queryKey\projectKeys.js:66:    dashboardItemPrefix: (projectId, itemId) => ['getChartDataById', projectId, itemId],
static/ui/src\utils\queryKey\projectKeys.js:68:        ['getChartDataById', projectId, itemId, startDate, endDate, accountId],
static/ui/src\utils\queryKey\queryKeyFactories.test.js:10:            'getChartDataById', 'P1', 'chart-1', null, undefined, null,
src\resolver\__test__\SalaryPolicyLeak.test.js:173:    getAssigneeStats: jest.fn(async () => []),
src\resolver\__test__\SalaryPolicyLeak.test.js:174:    getIssueParticipantStats: jest.fn(async () => ({ issueStats: [] })),
src\resolver\projectIssue\ProjectUsersService.js:16:import {getAssigneeStats, getIssueParticipantStats} from "../../api/jira/issue/IssueApi";
src\resolver\projectIssue\ProjectUsersService.js:308:export const getAssigneeStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
src\resolver\projectIssue\ProjectUsersService.js:309:    return await getAssigneeStats({projectId, coworkerFieldId, includeCoworker, viewerId});
src\resolver\projectIssue\ProjectUsersService.js:313:export const getIssueParticipantStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
src\resolver\projectIssue\ProjectUsersService.js:314:    return  await getIssueParticipantStats({projectId, coworkerFieldId, includeCoworker, viewerId});
src\resolver\projectDashboard\ProjectDashboardController.js:3:    addChartService, getChartDataByIdService,
src\resolver\projectDashboard\ProjectDashboardController.js:45:    guardedDefine(resolver, 'getChartDataById', ({payload, principal}) => getChartDataByIdService({...payload, principal}));
src\resolver\projectDashboard\__test__\TeamChartData.test.js:30:const { getChartDataByIdService } = require('../ProjectDashboardService');
src\resolver\projectDashboard\__test__\TeamChartData.test.js:35:const call = (chartType = 'pie', principal = NO_COST_PRINCIPAL) => getChartDataByIdService({
src\resolver\projectDashboard\__test__\TeamChartData.test.js:123:        const { chartData } = await getChartDataByIdService({
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:1:import { getChartDataByIdService } from '../ProjectDashboardService';
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:54:        const res = await getChartDataByIdService({ ...base, principal });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:64:        const res = await getChartDataByIdService({ ...base });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:73:        const res = await getChartDataByIdService({ ...base, principal });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:82:        const res = await getChartDataByIdService({ ...base, principal });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:91:        const res = await getChartDataByIdService({ ...base, data_type: 'role', principal });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:113:        const res = await getChartDataByIdService({ ...base, principal: ADMIN });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:125:        const res = await getChartDataByIdService({ ...base, principal });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:132:        await getChartDataByIdService({ ...base, data_type: 'role', principal: ADMIN });
src\resolver\projectDashboard\__test__\SalaryChartGate.test.js:156:        const res = await getChartDataByIdService({ ...base, principal: ADMIN });
src\resolver\projectDashboard\ProjectDashboardService.js:22:import {getAssigneeStatsService, getIssueParticipantStatsService} from "../projectIssue/ProjectUsersService";
src\resolver\projectDashboard\ProjectDashboardService.js:88:export const getChartDataByIdService = async ({ project_id, dashboard_id, data_type, chart_type, coworkerFieldId ,startDate,endDate,accountId, principal}) => {
src\resolver\projectDashboard\ProjectDashboardService.js:125:            // 이 함수가 호출되는 즉시 ReferenceError 였다(프론트가 getChartDataById 만 써서 미발현).
src\resolver\projectDashboard\ProjectDashboardService.js:274:    const rows = await getAssigneeStatsService(param);
src\resolver\projectDashboard\ProjectDashboardService.js:280:    const issueData = await getIssueParticipantStatsService(param);
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js:68:            return invoke('getChartDataById', {

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$file='"'src/resolver/projectDashboard/ProjectDashboardService.js'; "'$start=258; $end=295; $n=0; Get-Content $file | ForEach-Object { $n++; if($n -ge $start -and $n -le $end){'"'{0,4}: {1}' -f "'$n,$_}}; Write-Output '"'--- Chart template'; "'$file='"'static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js'; "'$n=0; Get-Content $file | ForEach-Object { $n++; if($n -le 130){'"'{0,4}: {1}' -f "'$n,$_}}; Write-Output '"'--- guarded principal'; "'$file='"'src/permission/permissionGuard.js'; "'$n=0; Get-Content $file | ForEach-Object { $n++; if($n -ge 85 -and $n -le 175){'"'{0,4}: {1}' -f "'$n,$_}}' in C:\CloudJira\moves-workforce
 succeeded in 3111ms:
 258: // 湲됱뿬 ?곗씠??
 259: const getSalaryChartData = async (project_id, chartType) =>{
 260:     const result = await getSalaryRepository(project_id);
 261:     const salaries = result.map(r => r.salary);
 262:     const salaryData = buildSalaryDistribution(salaries);
 263:     return formatSalaryChartData(salaryData,chartType);
 264: }
 265: /*
 266:  * A-3 ???대떦???꾩젽怨??댁뒋(李몄뿬?? ?꾩젽? **臾몄옄 ?⑥쐞濡?媛숈? 寃??*??媛곸옄 ?꾨웾 ?ㅼ틪?덈떎.
 267:  *   ?섏튂??`ProjectParticipantFetcher` 媛 1?⑥뒪濡??대떦?섍퀬 ???⑥닔??吏묎퀎留??뚯깮?쒕떎.
 268:  *   ???꾩젽??媛곴컖 invoke ?섎뒗 援ъ“(?꾨줎??`ChartTemplate`)??洹몃?濡쒖씠誘濡? ?붿껌 媛?以묐났?
 269:  *   洹??섏쿂??60珥??몄뒪?댁뒪 罹먯떆媛 ?≪닔?쒕떎(罹먯떆 ?ㅼ뿉 viewerId ?ы븿 ??媛??踰붿쐞 ?쇱엯 諛⑹?).
 270:  */
 271: // ?대떦???곗씠??
 272: const getAssigneeChartData = async (project_id, chartType,coworkerFieldId, viewerId = null) =>{
 273:     const param = {projectId:project_id, viewerId};
 274:     const rows = await getAssigneeStatsService(param);
 275:     return formatChartData(rows,chartType);
 276: }
 277: 
 278: const getIssueChartData = async (project_id,  chartType,coworkerFieldId, viewerId = null) =>{
 279:     const param = {projectId:project_id,coworkerFieldId,includeCoworker:true, viewerId};
 280:     const issueData = await getIssueParticipantStatsService(param);
 281: 
 282:     return formatChartData(issueData.issueStats,chartType);
 283: }
 284: 
 285: const getWorklogChartData = async (project_id,  chartType,startDate,endDate,accountId) =>{
 286:     return formatWorklogChartData(project_id,  chartType,startDate,endDate,accountId);
 287: }
 288: // 湲됱뿬 遺꾪룷 怨꾩궛
 289: const buildSalaryDistribution = (salaries, bucketCount = 5) => {
 290:     if (!salaries || salaries.length === 0) {
 291:         return {
 292:             histogram: [],
 293:             summary: null
 294:         };
 295:     }
--- Chart template
   1: import EchartPanel from "../../../components/chart/echart/EchartPanel";
   2: import ECharts from '../../../components/chart/echart/ThemedECharts';
   3: import React, {useEffect, useMemo, useState} from "react";
   4: import pieChartOption from "../../../components/chart/echart/options/pieChartOption";
   5: import barChartOption from "../../../components/chart/echart/options/barChartOption";
   6: import lineChartOption from "../../../components/chart/echart/options/lineChartOption";
   7: import { LoadingBar } from "../../../components/feedback/LoadingOverlay";
   8: import {useQuery} from "@tanstack/react-query";
   9: import {invoke} from "@forge/bridge";
  10: import CommonTable from "../../../components/table/CommonTable";
  11: import {calendarHeatmapOption} from "../../../components/chart/echart/options/calendarHeatmapOption";
  12: import stackedLineChartOption from "../../../components/chart/echart/options/stackedLineChartOption";
  13: import {DatePicker} from "@atlaskit/datetime-picker";
  14: import {Inline} from "@atlaskit/primitives";
  15: import {ProjectUserSelect} from "../../../components/select/ProjectUserSelect";
  16: import {useI18nStore} from "../../../stores/useI18nStore";
  17: import {token} from "@atlaskit/tokens";
  18: import {InfoTip} from "../progress/InfoTip";
  19: import {projectKeys} from "../../../utils/queryKey/projectKeys";
  20: 
  21: const datePickerSelectProps = {
  22:     styles: {
  23:         control: (base, state) => ({
  24:             ...base,
  25:             minHeight: '36px',
  26:             height: '36px',
  27:             borderWidth: '1px',
  28:             borderRadius: '4px',
  29:             borderColor: state.isFocused
  30:                 ? token('color.border.focused', '#0052CC')
  31:                 : token('color.border', '#DFE1E6'),
  32:             boxShadow: 'none',
  33:             '&:hover': {
  34:                 borderColor: token('color.border.focused', '#0052CC'),
  35:             },
  36:         }),
  37:     },
  38: };
  39: 
  40: const CHART_OPTION_MAP = {
  41:     pie: pieChartOption,
  42:     bar: barChartOption,
  43:     line:lineChartOption,
  44:     heatmap :calendarHeatmapOption,
  45:     lineStack : stackedLineChartOption
  46: };
  47: 
  48: export default function ChartTemplate({ item, project_id, coworkerFieldId }) {
  49:     const [isSwitch, setIsSwitch] = useState(false); // 李⑦듃酉?由ъ뒪??酉?
  50:     const [startDate, setStartDate] = useState(null);
  51:     const [endDate, setEndDate] = useState(null);
  52: 
  53:     const t = useI18nStore(s =>s.t);
  54: 
  55:     const [selectedUserId, setSelectedAccountIds] = useState(null);
  56: 
  57:     const isUserFilterChart = item.chartType === 'lineStack';
  58: 
  59:     const { data: individualData, isLoading,isFetching  } = useQuery({
  60:         queryKey: projectKeys.dashboardItem(
  61:             project_id,
  62:             item.i,
  63:             startDate,
  64:             endDate,
  65:             isUserFilterChart ? selectedUserId : null
  66:         ),
  67:         queryFn: async () => {
  68:             return invoke('getChartDataById', {
  69:                 project_id,
  70:                 dashboard_id: item.i,
  71:                 data_type: item.dataType,
  72:                 chart_type: item.chartType,
  73:                 coworkerFieldId,
  74:                 startDate,
  75:                 endDate,
  76:                 ...(isUserFilterChart && { accountId: selectedUserId })
  77:             });
  78:         },
  79:         enabled: !!coworkerFieldId,
  80:         staleTime: 1000 * 60 * 5,
  81:     });
  82: 
  83:     const chartData = individualData?.chartData ;
  84:     // ?뚯씠釉?酉?
  85:     const head = useMemo(() => {
  86:         if (item.chartType === 'lineStack') {
  87:             return {
  88:                 cells: [
  89:                     { key: 'user',      content: t('dashboard.chartTemplate.table.header.lineStack.user') },
  90:                     { key: 'email',     content: t('dashboard.chartTemplate.table.header.lineStack.email')},
  91:                     { key: 'date',      content: t('dashboard.chartTemplate.table.header.lineStack.date')},
  92:                     { key: 'issueKey',  content: t('dashboard.chartTemplate.table.header.lineStack.issueKey') },
  93:                     { key: 'worklog',   content: t('dashboard.chartTemplate.table.header.lineStack.worklog') }
  94:                 ],
  95:             };
  96:         }
  97: 
  98:         return {
  99:             cells: [
 100:                 { key: 'item', content: t('dashboard.chartTemplate.table.header.common.content') },
 101:                 { key: 'count', content: t('dashboard.chartTemplate.table.header.common.count')}
 102:             ],
 103:         };
 104:     }, [item.chartType]);
 105:     const rows = useMemo(() => {
 106:         if (!chartData) return [];
 107: 
 108:         if (item.chartType === 'pie') {
 109:             return chartData.data.map((row, idx) => ({
 110:                 key: `${row.name}-${idx}`,
 111:                 cells: [
 112:                     { content: row.name },
 113:                     { content: row.value },
 114:                 ],
 115:             }));
 116:         }
 117: 
 118:         if (item.chartType === 'heatmap') {
 119:             return (chartData.data || []).map(([date, seconds], idx) => ({
 120:                 key: `${date}-${idx}`,
 121:                 cells: [
 122:                     { content: date },
 123:                     { content: (seconds / 3600).toFixed(1) + ' h' },
 124:                 ],
 125:             }));
 126:         }
 127: 
 128:         if (item.chartType === 'lineStack') {
 129:             return (chartData.raw || [])
 130:                 .sort((a, b) => b.date.localeCompare(a.date))
--- guarded principal
  85: 
  86:     // ?? account 異???
  87:     const accountKeys = meta.teamLead.accountTargets ?? [];
  88:     if (accountKeys.length) {
  89:         const targets = collectTargets(payload, accountKeys);
  90:         if (targets.length) {
  91:             anyAxisResolved = true;
  92:             const allowed = new Set(principal.leadingScopeAccountIds ?? []);
  93:             if (allowed.size === 0) return false;                       // ???吏묓빀 ?놁쓬 ??嫄곕?
  94:             if (!targets.every(id => allowed.has(id))) return false;
  95:         }
  96:     }
  97: 
  98:     // ?? team 異???
  99:     const teamKeys = meta.teamLead.teamTargets ?? [];
 100:     if (teamKeys.length) {
 101:         const targets = collectTargets(payload, teamKeys);
 102:         if (targets.length) {
 103:             anyAxisResolved = true;
 104:             const allowed = new Set(principal.leadingScopeTeamKeys ?? []);
 105:             if (allowed.size === 0) return false;
 106:             if (!targets.every(key => allowed.has(key))) return false;
 107:         }
 108:     }
 109: 
 110:     return anyAxisResolved;   // ???遺덈챸 ??嫄곕?(fail-close)
 111: };
 112: 
 113: /**
 114:  * (resource,action) 媛???⑺넗由? responseWrapper ?덉뿉???ㅽ뻾???먮윭???쒖? 吏곷젹??.
 115:  *
 116:  * @param {object} meta   PERMISSION_MAP ?뷀듃由?
 117:  * @param {string} name   resolver ?대쫫 ??TEAM_LEAD allowlist 議고쉶 ??
 118:  */
 119: export const guard = (meta, name) => (handler) => async (req) => {
 120:     const principal = await resolvePrincipal(req.context);
 121: 
 122:     const bySet = isSatisfied(principal, meta);
 123:     const byLead = !bySet && isTeamLeadOver(principal, meta, req.payload);
 124: 
 125:     if (!bySet && !byLead) {
 126:         // ?대뼡 怨꾩젙??????몄?/?꾨땶吏媛 ?먮윭 肄붾뱶濡??덉뼱?섍?吏 ?딅룄濡?湲곗〈 肄붾뱶濡??듭씪?쒕떎.
 127:         throw new PermissionError(
 128:             ErrorCodes.PERMISSION_DENIED,
 129:             'You do not have permission to perform this action',
 130:         );
 131:     }
 132: 
 133:     // ???쒖꽌 怨좎젙: **?ㅼ퐫??寃利앹씠 allowlist ?곸슜蹂대떎 癒쇱???**
 134:     //   諛섎?濡??먮㈃ allowlist ?먯꽌 projectId 媛 鍮좎쭊 resolver ???ㅼ퐫??寃利앹씠 議곗슜??臾대젰?붾맂??
 135:     //   (payload ?먯꽌 ?ㅺ? ?щ씪??`pid` 媛 undefined ??寃利?skip).
 136:     enforceProjectScope(principal, meta, req.payload);   // TEAM_ONLY ??scopedProjectIds 媛 ?≪닔(臾대?寃?
 137: 
 138:     // ?좎썝 ?꾨떖 ??list ?몃뱾?ш? principal 濡?memberProjectIds ?꾪꽣 ?섑뻾
 139:     req.principal = principal;
 140:     req.grantedBy = bySet ? 'RESOURCE' : 'TEAM_LEAD';
 141: 
 142:     // ??allowlist 瑜?**媛????怨녹뿉??* ?곸슜?쒕떎(짠R3-A).
 143:     //   ?쒕퉬?ㅻ쭏???몄텧?섍쾶 ?먮㈃ ?몄젨媛 ?섎굹媛 鍮좎?怨? 洹?resolver 留?議곗슜???대┛??
 144:     //   RESOURCE 寃쎈줈??payload 媛 ?먮낯 洹몃?濡쒕씪 湲곗〈 ?숈옉??1諛붿씠?몃룄 諛붾뚯? ?딅뒗??
 145:     const { payload, droppedFields } = applyTeamLeadFieldPolicy(name, req.payload, req.grantedBy);
 146:     req.payload = payload;
 147:     req.droppedFields = droppedFields;
 148: 
 149:     return handler(req);
 150: };
 151: 
 152: /**
 153:  * 媛?쒕? ?⑹꽦??resolver ???깅줉. 誘몄꽑?몄? deny-by-default.
 154:  */
 155: export const guardedDefine = (resolver, name, handler) => {
 156:     const meta = PERMISSION_MAP[name];
 157: 
 158:     if (meta === undefined) {
 159:         console.error(`[PERM] '${name}' PermissionMap ?꾨씫 ??deny-by-default`);
 160:         resolver.define(
 161:             name,
 162:             responseWrapper(() => {
 163:                 throw new PermissionError(
 164:                     ErrorCodes.PERMISSION_UNMAPPED,
 165:                     `Resolver '${name}' has no permission mapping`,
 166:                 );
 167:             }),
 168:         );
 169:         return;
 170:     }
 171: 
 172:     if (meta === 'PUBLIC' || meta === 'SELF') {
 173:         // 由ъ냼??寃???놁쓬. SELF ???쒕퉬?ㅺ? context.accountId 濡?self-scope 梨낆엫.
 174:         //   grantedBy ??遺李⑺븯吏 ?딅뒗?????異뺤씠 ?녿뒗 寃쎈줈) ???뚮퉬 痢≪? undefined 瑜?RESOURCE 濡?痍④툒?쒕떎.
 175:         resolver.define(name, responseWrapper(handler));

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 5 'A-3|A-7|A-1|A-8|P1-7|P1-9|P1-14|P1-4|P1-3|P1-8|P1-13|무효화|stale|동시|race|경합' '_workspace/perf-audit/FIX_STAGE1_BACKEND.md' '_workspace/perf-audit/FIX_STAGE2_BACKEND.md' '_workspace/perf-audit/FIX_STAGE1_FRONTEND.md' '_workspace/perf-audit/FIX_STAGE2_FRONTEND.md'" in C:\CloudJira\moves-workforce
 succeeded in 2922ms:
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-1-# 성능 감사 2단계 — 프론트엔드 수정 리포트
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-2-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-3-- 기준 감사서: `_workspace/perf-audit/FRONTEND_2026-08-12.md`
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:4:- 대상: **P1-14 → P1-4 → P1-3 → P1-8 → P1-13** (4건, 지시 순서대로)
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-5-- 날짜: 2026-08-12 / 범위: `static/ui/` 안쪽만 (1단계 수정 파일·`src/` 백엔드 미접촉)
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-6-- 결과: `npm test` **73 suites / 1235 tests 통과**(기준선 71/1218 → +2 suites/+17 tests), `CI=true npm run build` 성공, 번들 예산 통과(gzip 899,163 / 950,000)
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-7-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-8----
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-9-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:10:## P1-14. 사용자 정보 캐시 키 재설계 — 사람 단위
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-11-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-12-### 무엇을 바꿨나
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-13-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-14-| 파일 | 지점 | 내용 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-15-|---|---|---|
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-16-| `static/ui/src/utils/queryKey/jiraKeys.js` | `:9` | `userInfo: (accountId) => ['jiraUserInfo', accountId]` **신설**. `userInfos`(집합)는 `:10` 에 남긴다 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-17-| `static/ui/src/utils/useJiraUserInfos.js` | `:111` `loadUserInfo` | accountId **1명** 단위 로더 — 같은 틱의 요청을 모아 `/user/bulk` 1회로 발사(마이크로 배치) |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:18:| 〃 | `:33` `mapWithConcurrency`, `:66` `fetchBulkUsers` | 50개 청크 **직렬 for-await → 동시 3개 병렬**. 200명 = 4회 순차 왕복 → 2라운드 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-19-| `static/ui/src/utils/jiraApi/users/getUserInfos.js` | `:19` `resolveUserInfos` | 집합 쿼리의 queryFn 이 id 마다 `queryClient.fetchQuery(jiraKeys.userInfo(id))` — **신선하면 왕복 0** |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-20-| 〃 | `:39` | 정규화 메모가 `accountIds` **참조**가 아니라 값 시그니처를 본다(인라인 배열 호출부에서 Set+sort 재실행 제거) |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:21:| 〃 | `:65` `useUserInfoMap` | 같은 조회의 맵 형태(`{data: {accountId: user}, isLoading}`) — P1-4 의 4개 화면이 쓴다 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-22-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-23-### 설계 근거 (왜 `useQueries` 가 아니라 이 형태인가)
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-24-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-25-- **반환 shape 불변이 요구사항**이었다. `useUserInfos` 는 여전히 `{data: user[], isLoading}` 다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-26-  `useQueries` 로 바꾸면 결과 배열이 렌더마다 새 참조라 소비처 6곳의 `useMemo`(맵 조립)가 전부 깨진다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-27-  그래서 **집합 키는 "참조 안정성 전용 얇은 래퍼"로 남기고**, 실제 왕복 여부는 사람 단위 엔트리의 신선도가 정한다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:28:- 개인 엔트리: `staleTime 10분`(종전과 동일) + `gcTime 30분`. 관찰자가 없는 엔트리라 gc 를 명시하지 않으면
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-29-  기본 5분에 사라져 "화면 간 재사용"이라는 목적 자체가 반쯤 무산된다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-30-- 배치 창은 `setTimeout(0)`(`useJiraUserInfos.js:122`). microtask 로 모으면 react-query 가 queryFn 을
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-31-  한 틱 미뤄 시작하는 경로에서 배치가 쪼개진다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-32-- 실패한 청크는 **reject** 한다. `resolve(null)` 로 넘기면 "없는 사용자"가 개인 캐시에 굳는다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-33-  개별 실패는 상위에서 `.catch(() => null)` 로 흡수 → 그 사람만 빠진다(종전 동작 유지, `retry:false`).
--
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-49-없는 사용자 `null`, 청크 실패 reject, 형식 위반 무왕복, 청크 병렬성, 실패 청크 무시, id 필터링.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-50-`queryKeyFactories.test.js:29~` 에 `userInfo`/`userInfos` 계약 단언 추가. `queryKeyContract.test.js` 통과(인라인 키 배열 없음).
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-51-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-52----
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-53-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:54:## P1-4. `getUser` N+1 4곳 → 벌크 훅
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-55-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-56-| 파일 | 지점 | 전 | 후 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-57-|---|---|---|---|
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-58-| `pages/projectDetail/cost/CostByIssueTable.jsx` | `:62-67` | 탭 **진입 즉시** 표 전량 멤버를 5명씩 순차(40명 = 40왕복/8라운드) | `useUserInfoMap(drawerAccountIds)` — **드로어를 연 이슈의 멤버만**. 진입 시 0왕복 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:59:| `pages/projectDetail/salary/SalaryManagementPage.jsx` | `:109` | 페이지당 10 개별 호출, staleTime 없음 | `useUserInfoMap(userIds)` — bulk 1회 + 10분 캐시 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-60-| `pages/projectDetail/user/ProjectUserPanel.jsx` | `:88` | 동일 | 동일 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-61-| `analysisReport/resource/hooks/useProjectResourceMembers.js` | `:134-140` | 5명씩 **순차** 배치(100명 = 100왕복/20라운드) | `useUserInfoMap(userMapIds)` — bulk 2회 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-62-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-63-- 조회 게이트(`shouldFetchUserMap`, 어댑터의 단일 출처)는 **그대로 두고** 판정이 false 면 빈 배열을 넘긴다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-64-  `enabled:false` 와 결과가 같다(왕복 0, `isLoading` false) — `isUserMapLoading` 소비처 무회귀.
--
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-70-  `resourceAnalysisKeys.userMap` → 공용 `useUserInfoMap` 으로 옮겨져, "한 곳에서만 조회한다"는 **규약은 유지한 채**
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-71-  단언 대상을 `useUserInfoMap(` 으로 바꾸고 옛 키가 0곳임을 함께 못박았다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-72-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-73----
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-74-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:75:## P1-3. 프로젝트 상세 탭 3중 마운트
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-76-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-77-### 연쇄 3고리를 모두 끊었다
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-78-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-79-1. **toast 아이덴티티** — `components/feedback/ToastFlags.js:86`: 반환 객체를 `useMemo(..., [show, register])` 로 고정.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-80-   `show`/`register` 는 이미 ref 기반 `useCallback([])` 이라 **1회만** 만들어진다.
--
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-104-   (이 리포에는 `@testing-library/react` 가 없어 마운트 횟수를 직접 셀 수 없다 — 리포 관례대로 정적 단언.)
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-105-2. **실행 확인** — 개발 빌드에서 `pages/projectDetail/dashboard/DashboardPage.jsx` 최상단에
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-106-   `useEffect(() => console.log('[mount] DashboardPage'), [])` 를 임시로 넣고 `/project/:id` 진입:
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-107-   수정 전 3줄 → 수정 후 **1줄**. 또는 React DevTools Profiler 로 진입 커밋 3개 중 `DashboardPage` 가
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-108-   "Mount" 로 잡히는 커밋이 1개인지 본다. 네트워크 탭에서는 `getChartInfo`/`getSummaryData` 가
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:109:   진입당 3회 → 1회로 준다(staleTime 없는 두 쿼리라 마운트마다 재요청했다).
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-110-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-111----
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-112-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:113:## P1-8. `UserSearchSelect` 무디바운스 + 인플라이트 입력 유실
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-114-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-115-`components/select/UserSearchSelect.jsx`
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-116-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-117-| 지점 | 내용 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-118-|---|---|
--
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-127-효과: "홍길동" 입력 = `invoke('searchUser')` 최대 6회(일부는 드롭돼 결과 어긋남) → **1회**, 그리고 마지막 글자의 검색이 반드시 반영된다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-128-선택·표시·페이징 동작은 그대로다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-129-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-130----
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-131-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:132:## P1-13. `TableSurface` 어댑터 — 호출부 17곳을 고치지 않고
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-133-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-134-### 결론부터: "시그니처로 어댑터를 건너뛰기"는 성립하지 않는다 (비용 논증)
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-135-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-136-- 어댑터 산출물(`adaptedRows`)은 셀의 `content` — **그 렌더에서 새로 만들어진 JSX** — 를 그대로 실어 나른다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-137-  정렬값 시그니처가 같다고 옛 산출물을 재사용하면 내용이 바뀐 표가 **에러 없이 옛 화면으로 굳는다**
--
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-146-### 수정
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-147-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-148-| 파일 | 지점 | 내용 | 비용 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-149-|---|---|---|---|
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-150-| `components/table/TableSurface.jsx` | `:33,47` | `rows` 미전달 시 공유 `EMPTY_ROWS` | 매 렌더 새 `[]` 로 메모가 통째로 깨지던 경로 제거 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:151:| 〃 | `:72-76` | `effectiveRows`(스켈레톤) **메모** | 로딩 중 `buildSkeletonRows` 가 매 렌더 새 배열 → 어댑터 메모 **확정 무효화**였다. 유일하게 100% 헛돌던 경로 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-152-| `components/table/tableSort.js` | `:146` `adaptRows` | 컬럼당 `map`+`filter`+`every`+`map`+판정루프 → **배열 1개 · 순회 2회** | 200행×정렬4컬럼: 배열 슬롯 **2,400 → 800**, 요소 접근 ~3,200 → ~1,600. `isNumericLike` 는 비숫자를 만나면 이후 호출 생략 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-153-| 〃 | `:72` `resolveSortableColumns` | 서로 다른 key 를 본 순간 **조기 종료** | 실데이터 key 컬럼(대부분 첫 두 행에서 갈린다)에서 전 행 스캔 → 2행 스캔 |
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-154-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-155-- 산출물 계약(RFC-184 §2)은 글자 그대로 유지: `sortValue > sortKey > key` 우선순위, `sortValue:null` = 결측(키 폴백 금지),
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-156-  컬럼 단위 타입 통일(숫자 `-Infinity` / 문자 `''`), `sortValue`/`sortKey` 제거, **무변경 시 원본 참조 반환**.
--
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-170-  → bundle:check {"file":"static/js/main.77946a6d.js","gzipBytes":899163,"budgetBytes":950000,"withinBudget":true}
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-171-```
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-172-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-173-- i18n: **신규 키 없음**. 빌드 prebuild 가 `npm run merge` 를 실행했고 `locales/` 산출물에 diff 없음(소스와 이미 동기).
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-174-- `p-limit` 은 프론트에서 쓰지 않았다 — v7 은 ESM-only 라 jest `transformIgnorePatterns`(현재 `@forge` 만 허용) 밖이라
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md:175:  테스트가 죽는다. 필요한 기능이 "동시 N개"뿐이라 `useJiraUserInfos.js:33` 의 `mapWithConcurrency` 로 대신했다(동시성 3).
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-176-- 변경 파일은 전부 `static/ui/` 안쪽이다. 1단계 파일(`WorklogPage.jsx`, `useMyWorklogList/Summary`, `polling/*`)과
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-177-  `src/` 백엔드는 건드리지 않았다.
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-178-
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-179-## 후속 확인이 필요한 것 (E2E 미수행)
_workspace/perf-audit/FIX_STAGE2_FRONTEND.md-180-
--
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md:1:# 성능 감사 1단계 프론트 수정 — P1-7 / P1-9
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-2-
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md:3:대상: `FRONTEND_2026-08-12.md` 의 **P1-7, P1-9 두 건만**. 다른 항목은 손대지 않았다.
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-4-
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md:5:## P1-7. 업로드 job 폴링이 백그라운드 탭에서도 지속
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-6-
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-7-| 파일 | 변경 |
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-8-|------|------|
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-9-| `static/ui/src/polling/jobPolling.js:31-38` | `isDocumentHidden()` 추가 (`typeof document !== 'undefined' && document.hidden === true`) |
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-10-| `static/ui/src/polling/JobPollingManager.jsx:20` | `pollJobRef` 추가 — interval·visibilitychange 가 항상 최신 렌더의 poll 본문을 보게 한다 |
--
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-16-`isTerminalJob` 완료 판정, `inFlightRef`/`nextPollAtRef` 가드, job 추적(`useJobStore`), 언마운트 정리.
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-17-
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-18-- **숨김 중 완료 job 누락 방지**: 복귀 즉시 1회 폴링이 그 보장이다. 그 1회도 `nextPollAtRef` backoff 는 존중한다(실패 상태에서 backoff 를 깨지 않기 위해). 숨김 가드는 interval 틱에만 두어 복귀 폴링을 막지 않는다.
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-19-- 감사가 함께 제안한 "경과 시간별 간격 상향·N회 후 포기"는 폴링 주기 변경이라 지시 범위 밖 → 미적용.
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-20-
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md:21:## P1-9. `/myWork` 같은 resolver 2회 호출
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-22-
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-23-| 파일 | 변경 |
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-24-|------|------|
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-25-| `static/ui/src/pages/myWork/utils/useMyWorklogList.js:7,30` | 옵션 `enabled = true` 추가 → 기존 `enabled` 조건과 AND. 기본값이라 다른 호출부(`MyIssueTable.jsx:29`) 동작은 불변 |
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-26-| `static/ui/src/pages/myWork/utils/useMyWorklogSummary.js:3-42` | `clipWorklogsToRange(myWorklogs, startDate, endDate)` 추가 — 워크로그를 날짜 범위(inclusive)로 잘라 낸 동일 shape 반환 |
--
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-73-static/ui/src/pages/myWork/utils/useMyWorklogList.js
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-74-static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-75-```
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-76-
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md-77-> `git status` 에 보이는 `src/**`(`MyWorkService.jsx`, `WorklogService.js`, `ProjectDashboard.js`)·`.gitignore`
_workspace/perf-audit/FIX_STAGE1_FRONTEND.md:78:> 수정은 **이 작업분이 아니다**(동시 진행 중인 백엔드 수정). 확인만 하고 건드리지 않았다.
--
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:1:# 성능 감사 2단계 백엔드 수정 — A-3 · A-7 (2026-08-12)
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-2-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:3:- 근거 문서: `_workspace/perf-audit/BACKEND_2026-08-12.md` (A-3, A-7)
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:4:- 범위: **A-3 · A-7 두 건만**. 1단계 미커밋 변경(MyWorkService / WorklogService / `rdb/query/ProjectDashboard.js` / WorklogPage 등)은 손대지 않았다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-5-- **응답 shape 불변** — 이번 변경으로 바뀐 resolver 응답 필드는 **없다**.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-6-- 테스트: 루트 `npm test` → **70 suites / 1,110 tests 전부 통과**.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-7-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-8----
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-9-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:10:## A-3. 대시보드 통계 2종의 동일 전량 스캔 중복
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-11-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-12-### 무엇을 했나
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-13-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-14-`getAssigneeStats`(담당자별 건수)와 `getIssueParticipantStats`(이슈별 참여자 수)가 **문자 단위로 같은 검색 URL**을
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-15-각자 전량 페이지 루프로 긁던 것을, **1패스 전용 페처 + 2집계**로 갈랐다.
--
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-34-**서로 다른 invoke** 다. 요청 스코프 메모만으로는 감사가 지적한 중복(1,000이슈 프로젝트 = 검색 20회, 그중 10회 완전 중복)이
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-35-그대로 남는다. 그래서 페처에 모듈 스코프 단일 엔트리 TTL 캐시를 뒀다. 보수적으로 잡은 근거:
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-36-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-37-| 결정 | 근거 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-38-|---|---|
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:39:| **TTL 60초** | `TeamTreeCache.getTeamIndex` 관례. 같은 파일 계열의 워크로그 위젯 KVS 캐시(10분)보다 **10배 보수적**이다. stale 은 "담당자를 바꾼 뒤 차트 반영이 최대 60초 늦다" 하나뿐이다 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-40-| **KVS 가 아니라 프로세스 메모리** | 이 검색은 `as:'user'` 라 **결과가 호출자 권한으로 필터링**된다. `Assignee:{projectId}` 형태의 KVS 공유 캐시(감사 수정방향 ②)는 사용자 간 가시 범위를 섞을 수 있어 채택하지 않았다 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-41-| **캐시 키에 `viewerId`(호출자 accountId) 포함** | 같은 인스턴스에 다른 사용자가 와도 남의 가시 범위를 보지 않는다 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-42-| **`viewerId` 없으면 캐시 미사용** | principal 전달이 빠지면 조용히 공유되지 않게 fail-safe |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-43-| **엔트리 1개만 유지** | 대시보드는 한 사용자가 한 프로젝트 위젯을 연속 렌더한다. 다른 키가 오면 교체되므로 상주 메모리가 상수(`memoryMB: 256` 보호) |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-44-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:45:정합성 상 **무효화 지점은 없다**(Jira 이슈가 원본이고 앱이 쓰기를 하지 않는 읽기 전용 집계 — TTL 만료가 유일한 갱신 경로).
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-46-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-47-### 효과
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-48-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-49-- 한 요청 안에서 두 통계를 모두 쓰는 `getChartData`(전체 차트) 경로: 검색 **2×N → N회**.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-50-- 위젯별 invoke 경로: 같은 인스턴스로 라우팅되면 두 번째 위젯이 검색 **N회 → 0회**. 라우팅이 갈리면 종전과 동일(무회귀).
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-51-- 프론트 구조(위젯별 invoke)는 **손대지 않았다**.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-52-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-53----
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-54-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:55:## A-7. 마스터 사전 6종 무캐시 KVS 스캔
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-56-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-57-### 무엇을 했나
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-58-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-59-`backoffice/team/TeamTreeCache.getTeamIndex` 와 **동형**인 60초 모듈 캐시를 공용 모듈로 뽑아 6종에 적용했다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-60-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-61-- **신규**: `src/resolver/backoffice/DictionaryCache.js`
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-62-  - `readDictionary(name, loader)` / `invalidateDictionary(name)` / `invalidateAllDictionaries()`
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-63-  - TTL **60초**(getTeamIndex 관례 그대로).
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:64:  - **값이 아니라 Promise 를 담는다** — 한 요청에서 같은 사전을 `Promise.all` 로 동시에 읽는 곳이 여럿이라(`buildPeopleContext` + `getResourceProfile` 의 role 2회 등) 값만 담으면 동시 진입이 전부 miss 한다. loader 실패는 캐시하지 않는다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-65-  - **한계를 파일 상단 주석에 명시**: Forge 는 인스턴스가 여러 개라 **캐시도 invalidate 도 호출된 인스턴스에만 적용된다** → 백오피스에서 사전을 고쳐도 다른 인스턴스는 TTL(60초)이 지나야 새 값을 본다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-66-  - 캐시 값은 호출 간 공유되므로 **각 서비스가 호출마다 얕은 복사**해 반환한다(소비자 변형에 의한 캐시 오염 차단. 특히 `LevelController.gateLevelBands` 가 응답을 가공한다).
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-67-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-68-| 서비스 | 읽기(캐시 적용) | 상한 규약 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-69-|---|---|---|
--
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-75-| `getSettingDataService` | `SettingService.js:25` | `findById('settings')` 유지 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-76-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-77-> `getProjectStatusExistLinkService`(칸반 전용, `findByFilterExists`)는 감사 표에 없어 캐시하지 않았다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-78-> `permission` 사전은 감사 표의 6종에 없고 권한 판정 축이라 이번 범위에서 제외했다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-79-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:80:### 무효화 지점 (쓰기 경로 grep 전수)
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-81-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:82:| 사전 | 무효화 위치 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-83-|---|---|
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-84-| role | `RoleService.js:25`(addRole) · `:88`(delete) · `:109`(update) · `:126`(addRoleBulk) |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-85-| level | `LevelService.js:74`(addLevel) · `:154`(delete) · `:177`(update) · `:193`(addLevelBulk) |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-86-| skill | `SkillService.js:45`(addSkill) · `:114`(delete) · `:135`(update) · `:158`(addSkillBulk) |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-87-| status | `ProjectStatusService.js:24`(addProjectStatus) · `:63`(칸반 add) · `:68`(칸반 add 링크실패 롤백 delete) · `:171`(delete-isolated) · `:211`(delete 본체) · `:260`(update) · `:374`(`saveStatusOrder` — 순서 재정의도 status write. `setStatusLink`·`deleteProjectStatus` 가 이 경로로 들어온다) |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-88-| holiday | `PublicHolidayService.js:27`(add) · `:77`(delete) · `:91`(update) |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-89-| settings | `SettingService.js:83`(updateSetting) |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-90-| status + settings (시드) | `SeedData.js:27` `runSeed()` 말미 `invalidateAllDictionaries()` — `ensureSeed()` 가 `userPermissionCheckService` 를 통해 **resolver 인스턴스 안에서** 돌 수 있어 필요하다 |
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-91-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:92:- `addRoleBulk/addLevelBulk/addSkillBulk` 는 `addCatalogItemsBulk` 를 **await 한 뒤** 무효화하도록 async 로 바꿨다(반환값 shape 불변: `{data:{added, skipped}}`).
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:93:- **쓰기 검증 경로는 캐시를 타지 않는다** — 이름 중복 판정(`checkDuplicated`)·`findById`·`updateSetting` 의 `prev` 읽기는 전부 KVS 직접 조회 그대로다(`loadTeamIndexFresh` 규약과 동형). stale 인덱스로 중복 판정을 하지 않는다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:94:- `src/trigger/demoSeed.js`(웹트리거)는 role/level/status 를 쓰지만 **resolver 와 다른 Forge 함수 = 다른 모듈 인스턴스**라 그 인스턴스의 캐시를 지워도 의미가 없다(시연용 도구이기도 하다). 무효화를 추가하지 않았고, 그 경로 이후 최대 60초 stale 은 TTL 로 자연 해소된다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-95-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-96-### 수용한 한계 (명시)
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-97-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-98-1. **인스턴스별 캐시** — 백오피스에서 역할/등급/스킬/상태/공휴일/설정을 고치면 **다른 인스턴스는 최대 60초** 옛 값을 본다. 고친 관리자 본인의 화면은 (같은 인스턴스로 라우팅될 때) 즉시 반영되지만 보장은 아니다. `TeamTreeCache` 가 이미 같은 계약이다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:99:2. **`settings.salaryPolicy` 도 60초 stale 대상**이다(INDIVIDUAL ↔ LEVEL_BAND 전환 반영이 최대 60초 늦다). 관리자 1인이 누르는 저빈도 설정이고, 권한 판정이 이미 최대 90초 stale(TeamTree 60 + principal 30)을 수용하고 있어 같은 급의 경계로 판단했다. `SettingService.js:17-23` 주석에 남겼다.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-100-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-101-### 효과 (감사 산정 기준)
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-102-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md:103:- `/backoffice/users` 진입: role 3 + level 3 → **각 1회**(같은 요청 내 동시 호출까지 Promise 공유로 흡수).
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-104-- `/resource` 인력현황 진입: role/level/skill/settings 중복 스캔 제거.
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-105-- 프로젝트 대시보드: level/role 위젯 `W` 개 → `findAll` **W회 → 1회**(60초 내).
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-106-
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-107----
_workspace/perf-audit/FIX_STAGE2_BACKEND.md-108-
--
_workspace/perf-audit/FIX_STAGE1_BACKEND.md:1:# 성능 감사 1단계 백엔드 수정 — A-1 / A-8
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-2-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-3-기준 보고서: `_workspace/perf-audit/BACKEND_2026-08-12.md`
_workspace/perf-audit/FIX_STAGE1_BACKEND.md:4:작업일: 2026-08-12 · 범위: **A-1, A-8 두 건만** (다른 항목 미변경)
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-5-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-6----
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-7-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md:8:## A-1. 워크로그 추가 조회 페이지 크기 20 → 100
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-9-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-10-### 수정 파일
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-11-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-12-| 파일 | 라인(수정 후) | 변경 |
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-13-|------|--------------|------|
--
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-33-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-34-워크로그 200건 이슈 1개: Jira 9회 순차 → 2회. `/myWork` 진입 275회 → 65회(−77%).
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-35-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-36----
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-37-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md:38:## A-8. 대시보드 요약 SQL — PK 인덱스 복구
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-39-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-40-### 수정 파일
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-41-
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-42-`src/rdb/query/ProjectDashboard.js:16` (`GETSUMMARY`)
_workspace/perf-audit/FIX_STAGE1_BACKEND.md-43-

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$targets = @('"'src/resolver/backoffice/DictionaryCache.js','src/resolver/backoffice/role/RoleService.js','src/resolver/backoffice/level/LevelService.js','src/resolver/backoffice/skill/SkillService.js','src/resolver/backoffice/projectStatus/ProjectStatusService.js','src/resolver/backoffice/publicHoliday/PublicHolidayService.js','src/resolver/backoffice/setting/SettingService.js'); foreach ("'$file in $targets) { Write-Output "--- $file"; $line=0; Get-Content $file | ForEach-Object { $line++; '"'{0,4}: {1}' -f "'$line, $_ } }; Write-Output '"'--- entity write hits'; rg -n -i -C 2 \"customEntityManager\\('(role|level|skill|project_status|public_holiday|setting)'|customEntityManager\\(ENTITY\\)|entity:\\s*'(role|level|skill)'|ENTITY\\s*=\\s*'(role|level|skill|project_status|public_holiday|setting)'\" src; Write-Output '--- direct settings/status ids'; rg -n -i -C 2 \"save\\(|delete\\(|set\\(\" src | rg -C 2 \"projectStatus|status|holiday|setting|role|level|skill\"" in C:\CloudJira\moves-workforce
 succeeded in 5522ms:
--- src/resolver/backoffice/DictionaryCache.js
   1: /**
   2:  * 留덉뒪???ъ쟾(role/level/skill/status/holiday/settings) 紐⑤뱢 罹먯떆 ???깅뒫 媛먯궗 A-7.
   3:  *
   4:  * `backoffice/team/TeamTreeCache.getTeamIndex()` ? **?숉삎**?대떎(TTL 60珥?紐⑤뱢 ?ㅼ퐫??.
   5:  * ???ъ쟾?ㅼ? ?蹂寃쎌씤???붾㈃ 吏꾩엯留덈떎 KVS ?꾨웾 ?ㅼ틪???섍컮??
   6:  *   `/backoffice/users` 吏꾩엯 = role 3 + level 3 + permission 3, `/resource` 吏꾩엯 = role/level/skill/settings 6????
   7:  *
   8:  * ?? 罹먯떆 ?뱀꽦(紐낆떆???쒓퀎) ????????????????????????????????????????????????
   9:  * Forge ??而⑦뀒?대꼫媛 ?ㅼ쨷 ?몄뒪?댁뒪??**罹먯떆??invalidate ???몄텧???몄뒪?댁뒪?먮쭔 ?곸슜?쒕떎.**
  10:  * 諛깆삤?쇱뒪?먯꽌 ?ъ쟾??怨좎퀜??**?ㅻⅨ ?몄뒪?댁뒪??TTL(60珥???吏?섏빞** ??媛믪쓣 蹂몃떎.
  11:  * ??"???吏곹썑 ?ㅻⅨ ?붾㈃?먯꽌 ???대쫫??蹂댁씪 ???덈떎"媛 ??罹먯떆???섏슜???쒓퀎??TeamTreeCache ? ?숈씪).
  12:  * ???뺥솗?깆씠 罹먯떆???섏〈?섎뒗 ?먯젙(?곌린 寃利씲룹쨷蹂??먯젙)?먮뒗 **?곗? ?딅뒗??* ??洹?寃쎈줈??怨꾩냽 KVS 瑜?吏곸젒 移쒕떎.
  13:  *
  14:  * ?? 媛?怨듭쑀 二쇱쓽 ??????????????????????????????????????????????????????????
  15:  * 罹먯떆 媛믪? ?щ윭 ?몄텧??**媛숈? 媛앹껜瑜?怨듭쑀**?쒕떎. ?뚮퉬?먭? 諛곗뿴/?먯냼瑜?蹂?뺥븯硫?罹먯떆媛 ?ㅼ뿼?섎?濡? * 媛??쒕퉬?ㅻ뒗 罹먯떆??諛곗뿴??洹몃?濡??대낫?댁? 留먭퀬 **?몄텧留덈떎 ?뺤? 蹂듭궗**??諛섑솚?쒕떎.
  16:  */
  17: 
  18: /** 紐⑤뱢 ?ㅼ퐫??罹먯떆 TTL (ms) ??TeamTreeCache ? 媛숈? 媛?*/
  19: const TTL_MS = 60 * 1000;
  20: 
  21: /** entity 紐???{ promise, at } */
  22: const store = new Map();
  23: 
  24: /**
  25:  * TTL 罹먯떆 ?쎄린. miss 硫?`loader()` 濡?KVS ?꾨웾 濡쒕뱶 ???곸옱?쒕떎.
  26:  *
  27:  * **媛믪씠 ?꾨땲??Promise 瑜??대뒗??* ?????붿껌 ?덉뿉??媛숈? ?ъ쟾??`Promise.all` 濡??숈떆???쎈뒗 怨녹씠
  28:  * ?щ읉?대씪(`buildPeopleContext` + `getResourceProfile` ??role 2???? 媛믩쭔 ?댁쑝硫??숈떆 吏꾩엯???꾨? miss ?쒕떎.
  29:  * ?ㅽ뙣??罹먯떆?섏? ?딅뒗??TTL 60珥??숈븞 ?ㅽ뙣瑜??ъ깮?섏? ?딄쾶 ?뷀듃由щ? ?섎룎由곕떎).
  30:  *
  31:  * @param {string} name 罹먯떆 ??= KVS ?뷀떚?곕챸)
  32:  * @param {() => Promise<*>} loader KVS 濡쒕뜑
  33:  */
  34: export const readDictionary = async (name, loader) => {
  35:     const now = Date.now();
  36:     const hit = store.get(name);
  37:     if (hit && now - hit.at < TTL_MS) return await hit.promise;
  38: 
  39:     const promise = loader();
  40:     store.set(name, { promise, at: now });
  41: 
  42:     try {
  43:         return await promise;
  44:     } catch (e) {
  45:         const current = store.get(name);
  46:         if (current && current.promise === promise) store.delete(name);
  47:         throw e;
  48:     }
  49: };
  50: 
  51: /** ?대떦 ?ъ쟾??紐⑤뱺 write 吏곹썑 ?몄텧(best-effort ???몄텧???몄뒪?댁뒪?먮쭔 ?곸슜?쒕떎). */
  52: export const invalidateDictionary = (name) => {
  53:     store.delete(name);
  54: };
  55: 
  56: /** ?꾩껜 臾댄슚?????쒕뱶/?뚯뒪???꾩슜. */
  57: export const invalidateAllDictionaries = () => {
  58:     store.clear();
  59: };
--- src/resolver/backoffice/role/RoleService.js
   1: import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
   2: import {addCatalogItemsBulk} from '../CatalogBulkService';
   3: import crypto from 'crypto';
   4: import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
   5: import {LogicalError} from "../../../error/LogicalError";
   6: import {findUserWithRole} from "../user/UserRepository";
   7: // A-7 ??留덉뒪???ъ쟾 60珥?紐⑤뱢 罹먯떆(TeamTreeCache ?숉삎). ?몄뒪?댁뒪蹂?罹먯떆?쇰뒗 ?쒓퀎??DictionaryCache 二쇱꽍 李몄“.
   8: import {invalidateDictionary, readDictionary} from '../DictionaryCache';
   9: 
  10: const ENTITY = 'role';
  11: 
  12: export const addRoleService = async (roleData) =>{
  13: 
  14:     if(!roleData.name ){
  15:         throw new LogicalError(ErrorCodes.ROLE_NAME_REQUIRED, ErrorCodes.ROLE_NAME_REQUIRED)
  16:     }
  17: 
  18:     const queryManager = customEntityManager(ENTITY);
  19: 
  20:     const id = "role-"+crypto.randomUUID();
  21: 
  22:     await checkDuplicated(queryManager, id, roleData.name);
  23: 
  24:     await queryManager.save(id, roleData)
  25:     invalidateDictionary(ENTITY);
  26: 
  27:     return {
  28:         data: {
  29:             id,
  30:             roleData,
  31:         },
  32:     };
  33: }
  34: 
  35: /** KVS ?꾨웾 濡쒕뱶 + ?묐떟 留ㅽ븨. ?곹븳 洹쒖빟(findAll = 100嫄?罹?? 醫낆쟾 洹몃?濡쒕떎. */
  36: const loadRoleList = async () => {
  37:     const queryManager = customEntityManager(ENTITY);
  38: 
  39:     const rows = (await queryManager.findAll()).results;
  40: 
  41:     if(!rows) throw LogicalError(ErrorCodes.ROLE_NOT_FOUND);
  42: 
  43:     return rows.map(row => ({
  44:         id: row.key,
  45:         name: row.value.name,
  46:         description: row.value.description,
  47:     }));
  48: };
  49: 
  50: export const getRoleListService = async () =>{
  51:     const mappedData = await readDictionary(ENTITY, loadRoleList);
  52: 
  53:     // 罹먯떆 媛믪? 怨듭쑀 媛앹껜?????뚮퉬??蹂?뺤씠 罹먯떆瑜??ㅼ뿼?쒗궎吏 ?딄쾶 ?몄텧留덈떎 ?뺤? 蹂듭궗(?묐떟 shape 遺덈?).
  54:     return {
  55:         data: mappedData.map(row => ({...row}))
  56:     };
  57: }
  58: 
  59: export const findRoleByIdService = async ({id}) =>{
  60: 
  61:     const queryManager = customEntityManager(ENTITY);
  62: 
  63:     const result = await queryManager.findById(id);
  64: 
  65:     if(!result) throw LogicalError(ErrorCodes.ROLE_NOT_FOUND);
  66: 
  67:     const roleData = {
  68:         name: result.name,
  69:         description: result.description,
  70:     }
  71: 
  72:     return {
  73:         data: {
  74:             id,
  75:             roleData,
  76:         },
  77:     };
  78: }
  79: 
  80: export const deleteRoleService = async (roleId) => {
  81:     const res = await findUserWithRole(roleId.id);
  82:     if(res?.rows?.length > 0)
  83:         throw new LogicalError(ErrorCodes.CAN_NOT_DELETE,ErrorCodes.CAN_NOT_DELETE);
  84: 
  85:     const queryManager = customEntityManager(ENTITY);
  86: 
  87:     await queryManager.delete(roleId.id);
  88:     invalidateDictionary(ENTITY);
  89: 
  90:     return;
  91: }
  92: 
  93: export const updateRoleService = async (roleData) => {
  94: 
  95:     const { id, name, description ,isNameChanged} = roleData;
  96: 
  97:     const data = {
  98:         name,
  99:         description
 100:     };
 101: 
 102:     const queryManager = customEntityManager(ENTITY);
 103: 
 104:     if (isNameChanged) {
 105:         await checkDuplicated(queryManager, id, name);
 106:     }
 107: 
 108:     await queryManager.save(id, data);
 109:     invalidateDictionary(ENTITY);
 110:     return {
 111:         success: true,
 112:         data: {
 113:             id,
 114:             data,
 115:         },
 116:     };
 117: }
 118: 
 119: export const addRoleBulkService = async ({ items }) => {
 120:     const result = await addCatalogItemsBulk({
 121:         entity: ENTITY,
 122:         idPrefix: 'role',
 123:         items,
 124:         buildRecord: item => ({ name: item.name, description: item.description || '' }),
 125:     });
 126:     invalidateDictionary(ENTITY);
 127:     return result;
 128: };
 129: 
 130: const checkDuplicated = async (queryManager, id, name) => {
 131:     const { results = [] } = await queryManager.findByWhere('name',name);
 132: 
 133:     const duplicated = results.some(({ key }) => key !== id);
 134: 
 135:     if (duplicated) {
 136:         throw new LogicalError(ErrorCodes.ROLE_NAME_DUPLICATED, ErrorCodes.ROLE_NAME_DUPLICATED)
 137:     }
 138: };
--- src/resolver/backoffice/level/LevelService.js
   1: import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
   2: import {addCatalogItemsBulk} from '../CatalogBulkService';
   3: import crypto from 'crypto';
   4: import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
   5: import {LogicalError} from "../../../error/LogicalError";
   6: import {findUserWithLevel} from "../user/UserRepository";
   7: // 湲됱뿬 ?뺤콉(RFC-163) ??諛대뱶 ?뺢퇋?붋룰?利앹? ?쒖닔 紐⑤뱢???붾떎(Forge ?섏〈 ?놁쓬).
   8: import {isValidSalaryBand, toBandAttribute} from "../../projectCost/SalaryPolicy";
   9: // A-7 ??留덉뒪???ъ쟾 60珥?紐⑤뱢 罹먯떆(TeamTreeCache ?숉삎). ?몄뒪?댁뒪蹂?罹먯떆?쇰뒗 ?쒓퀎??DictionaryCache 二쇱꽍 李몄“.
  10: import {invalidateDictionary, readDictionary} from '../DictionaryCache';
  11: 
  12: const ENTITY = 'level';
  13: 
  14: /**
  15:  * 湲됱뿬 諛대뱶 3?꾨뱶瑜?KVS ????뺥깭濡??뺢퇋?뷀븳??(?ㅺ퀎??짠3-2).
  16:  *
  17:  * ??KVS 洹쒖빟 ??鍮?臾몄옄?????嫄곕? + integer attribute ??null 湲덉?
  18:  *   ??**誘몄엯?μ씠硫??띿꽦 ?먯껜瑜?留뚮뱾吏 ?딅뒗??** `|| ''` / `null` 湲덉?.
  19:  * ??`kvs.entity().set(id, {...data})` ??**?꾩껜 移섑솚**?대?濡? ?띿꽦???앸왂?섎㈃ ?댁쟾 媛믪씠 ?먮룞?쇰줈 ?щ씪吏꾨떎
  20:  *   (= ?꾨줎?멸? 鍮?臾몄옄?댁쓣 蹂대궡硫?諛대뱶媛 ?댁젣?쒕떎. 蹂꾨룄 ??젣 API 遺덊븘??.
  21:  * ????쒓컪 誘몄쟾??+ min/max ?좏슚 ??`round((min+max)/2)` ?쒕쾭 ?대갚(API 吏곸젒 ?몄텧 ?鍮?.
  22:  */
  23: const buildBandAttributes = ({salaryMin, salaryMax, salaryRepresentative} = {}) => {
  24:     const min = toBandAttribute(salaryMin);
  25:     const max = toBandAttribute(salaryMax);
  26:     let representative = toBandAttribute(salaryRepresentative);
  27: 
  28:     if (representative === undefined && min !== undefined && max !== undefined) {
  29:         representative = Math.round((min + max) / 2);
  30:     }
  31: 
  32:     const band = {
  33:         ...(min !== undefined && {salaryMin: min}),
  34:         ...(max !== undefined && {salaryMax: max}),
  35:         ...(representative !== undefined && {salaryRepresentative: representative}),
  36:     };
  37: 
  38:     if (!isValidSalaryBand(band)) {
  39:         throw new LogicalError(
  40:             ErrorCodes.LEVEL_SALARY_BAND_INVALID,
  41:             'salaryMin must be >= 0 and <= salaryMax',
  42:         );
  43:     }
  44: 
  45:     return band;
  46: };
  47: 
  48: /** KVS ??κ컪 ???묐떟 諛대뱶 3?꾨뱶. **誘몄엯?μ? `null` 濡??뺢퇋??*(?꾨줎?몄뿉 undefined 瑜?蹂대궡吏 ?딅뒗?? 짠6-1). */
  49: const toBandDto = (value = {}) => ({
  50:     salaryMin: value?.salaryMin ?? null,
  51:     salaryMax: value?.salaryMax ?? null,
  52:     salaryRepresentative: value?.salaryRepresentative ?? null,
  53: });
  54: 
  55: export const addLevelService = async (LevelData) =>{
  56:     if(!LevelData.name ){
  57:         throw new LogicalError(ErrorCodes.LEVEL_NAME_REQUIRED, ErrorCodes.LEVEL_NAME_REQUIRED)
  58:     }
  59: 
  60:     const queryManager = customEntityManager(ENTITY);
  61: 
  62:     const id = "level-"+crypto.randomUUID();
  63: 
  64:     await checkDuplicated(queryManager, id, LevelData.name);
  65: 
  66:     // 諛대뱶 3?꾨뱶???뺢퇋?뷀빐 ??ν븳??誘몄엯???띿꽦 ?앸왂). ?섎㉧吏 ?꾨뱶??湲곗〈 洹몃?濡?
  67:     const {salaryMin, salaryMax, salaryRepresentative, ...rest} = LevelData;
  68:     const saved = {
  69:         ...rest,
  70:         ...buildBandAttributes({salaryMin, salaryMax, salaryRepresentative}),
  71:     };
  72: 
  73:     await queryManager.save(id, saved)
  74:     invalidateDictionary(ENTITY);
  75: 
  76:     return {
  77:         data: {
  78:             id,
  79:             // ???대쫫? 湲곗〈 怨꾩빟 ?좎?(`LevelData`). 媛믪? **?ㅼ젣 ??λ맂** ?뺢퇋??寃곌낵??
  80:             LevelData: saved,
  81:         },
  82:     };
  83: }
  84: 
  85: /** KVS ?꾨웾 濡쒕뱶 + ?묐떟 留ㅽ븨. ?곹븳 洹쒖빟(findAll = 100嫄?罹?? 醫낆쟾 洹몃?濡쒕떎. */
  86: const loadLevelList = async () => {
  87: 
  88:    const queryManager = customEntityManager(ENTITY);
  89: 
  90:     const rows = (await queryManager.findAll()).results;
  91: 
  92:     return rows.map(row => ({
  93:         id: row.key,
  94:         name: row.value.name,
  95:         description: row.value.description,
  96:         // 湲됱뿬 諛대뱶(RFC-163) ??誘몄꽕???깃툒? `null` 3媛? ?꾨줎?멸? undefined 遺꾧린瑜??섏? ?딄쾶 ?쒕떎.
  97:         ...toBandDto(row.value),
  98:         /*
  99:          * 湲덉븸怨?**遺꾨━??* "?ㅼ젙 ?щ?" ?좏샇. 鍮꾩슜 沅뚰븳???놁쑝硫?Controller 媛 湲덉븸 3?꾨뱶瑜?
 100:          * 吏?곕뒗?? 湲됱뿬 ?뺤콉 ?붾㈃??"諛대뱶 誘몄꽕??N媛? 寃쎄퀬??湲덉븸???꾨땲?????ъ떎留??꾩슂?섎떎.
 101:          * 湲덉븸?쇰줈 ?먯젙?섍쾶 ?먮㈃ 寃뚯씠?낆씠 怨?寃쎄퀬 臾대젰?붽? ?쒕떎.
 102:          */
 103:         hasSalaryBand: row.value?.salaryMin != null
 104:             || row.value?.salaryMax != null
 105:             || row.value?.salaryRepresentative != null,
 106:     }));
 107: };
 108: 
 109: export const getLevelListService = async () =>{
 110:     const mappedData = await readDictionary(ENTITY, loadLevelList);
 111: 
 112:     // 罹먯떆 媛믪? 怨듭쑀 媛앹껜????Controller ??諛대뱶 寃뚯씠??gateLevelBands)???먮낯??嫄대뱶由ъ? 紐삵븯寃?
 113:     // ?몄텧留덈떎 ?뺤? 蹂듭궗??諛섑솚?쒕떎(?묐떟 shape 遺덈?).
 114:     return {
 115:         data: mappedData.map(row => ({...row}))
 116:     };
 117: }
 118: 
 119: export const findLevelByIdService = async ({id}) =>{
 120: 
 121:     const queryManager = customEntityManager(ENTITY);
 122: 
 123:     const result = await queryManager.findById(id);
 124: 
 125:     if(!result ){
 126:         throw new LogicalError(ErrorCodes.LEVEL_NOT_FOUND, ErrorCodes.LEVEL_NOT_FOUND)
 127:     }
 128: 
 129:     const levelData = {
 130:         name: result.name,
 131:         description: result.description,
 132:         // 湲됱뿬 諛대뱶(RFC-163) ??誘몄꽕?뺤씠硫?`null` 3媛?짠6-1)
 133:         ...toBandDto(result),
 134:     }
 135: 
 136:     return {
 137:         data: {
 138:             id,
 139:             levelData,
 140:         },
 141:     };
 142: }
 143: 
 144: export const deleteLevelService = async (levelId) => {
 145: 
 146:     // ?대떦 ?섎갭???곸슜???ъ슜???뺤씤
 147:     const res = await findUserWithLevel(levelId.id);
 148:     if(res?.rows?.length > 0)
 149:         throw new LogicalError(ErrorCodes.CAN_NOT_DELETE,ErrorCodes.CAN_NOT_DELETE);
 150: 
 151:     const queryManager = customEntityManager(ENTITY);
 152: 
 153:     await queryManager.delete(levelId.id);
 154:     invalidateDictionary(ENTITY);
 155: 
 156:     return ;
 157: }
 158: 
 159: export const updateLevelService = async (levelData) => {
 160: 
 161:     const { id, name, description ,isNameChanged, salaryMin, salaryMax, salaryRepresentative} = levelData;
 162: 
 163:     const data = {
 164:         name,
 165:         description,
 166:         // 湲됱뿬 諛대뱶(RFC-163). set() ? ?꾩껜 移섑솚?대씪 誘몄엯???띿꽦???앸왂?섎㈃ 湲곗〈 諛대뱶媛 ?댁젣?쒕떎.
 167:         ...buildBandAttributes({salaryMin, salaryMax, salaryRepresentative}),
 168:     };
 169: 
 170:     const queryManager = customEntityManager(ENTITY);
 171: 
 172:     if (isNameChanged) {
 173:         await checkDuplicated(queryManager, id, name);
 174:     }
 175: 
 176:     await queryManager.save(id, data);
 177:     invalidateDictionary(ENTITY);
 178:     return {
 179:         data: {
 180:             id,
 181:             data,
 182:         },
 183:     };
 184: }
 185: 
 186: export const addLevelBulkService = async ({ items }) => {
 187:     const result = await addCatalogItemsBulk({
 188:         entity: ENTITY,
 189:         idPrefix: 'level',
 190:         items,
 191:         buildRecord: item => ({ name: item.name, description: item.description || '' }),
 192:     });
 193:     invalidateDictionary(ENTITY);
 194:     return result;
 195: };
 196: 
 197: const checkDuplicated = async (queryManager, id, name) => {
 198:     const { results = [] } = await queryManager.findByWhere('name',name);
 199: 
 200:     const duplicated = results.some(({ key }) => key !== id);
 201: 
 202:     if (duplicated) {
 203:         throw new LogicalError(ErrorCodes.LEVEL_NAME_DUPLICATED, ErrorCodes.LEVEL_NAME_DUPLICATED)
 204:     }
 205: };
--- src/resolver/backoffice/skill/SkillService.js
   1: // ?ㅽ궗 留덉뒪??CRUD (RoleService 1:1 蹂듭젣 + category ?꾨뱶).
   2: // 留덉뒪???ъ쟾 = KVS 'skill' ?뷀떚??role/level ?⑤━??. ?ъ슜???꾨줈?앺듃 留ㅽ븨? SQL(SkillMappingQuery).
   3: // deleteSkill ? ?ъ슜以?媛?? user_skills + project_skills 李몄“ > 0 ??CAN_NOT_DELETE(role ??findUserWithRole 媛?쒖? ?숈씪 媛쒕뀗).
   4: 
   5: import { customEntityManager } from '../../../nosql/query/CustomEntityManager';
   6: import { addCatalogItemsBulk, CATALOG_MAX_ITEMS } from '../CatalogBulkService';
   7: import crypto from 'crypto';
   8: import { ErrorCodes } from '../../../utils/errors/ErrorCodes';
   9: import { LogicalError } from '../../../error/LogicalError';
  10: import { executeQuery } from '../../../rdb/query/CommonQuery';
  11: import { SkillMappingQuery } from '../../../rdb/query/SkillMappingQuery';
  12: // A-7 ??留덉뒪???ъ쟾 60珥?紐⑤뱢 罹먯떆(TeamTreeCache ?숉삎). ?몄뒪?댁뒪蹂?罹먯떆?쇰뒗 ?쒓퀎??DictionaryCache 二쇱꽍 李몄“.
  13: import { invalidateDictionary, readDictionary } from '../DictionaryCache';
  14: 
  15: const ENTITY = 'skill';
  16: 
  17: // Forge KVS ???좎뼵???띿꽦??鍮?臾몄옄??'')????ν븯硫?"cannot be empty" 濡?嫄곕??쒕떎.
  18: // ??媛믪씠 ?녿뒗(category/description) ?띿꽦? payload ?먯꽌 ?꾩삁 ?쒖쇅?섍퀬 ??ν븳??
  19: // (name ? ?꾩닔 媛??????긽 議댁옱. ?묐떟 shape ? 蹂꾨룄濡?'' 湲곕낯媛믪쓣 ?좎??쒕떎.)
  20: const buildSkillEntity = ({ name, category, description }) => {
  21:     const entity = { name };
  22:     if (category) entity.category = category;
  23:     if (description) entity.description = description;
  24:     return entity;
  25: };
  26: 
  27: export const addSkillService = async (skillData) => {
  28:     if (!skillData.name) {
  29:         throw new LogicalError(ErrorCodes.SKILL_NAME_REQUIRED, ErrorCodes.SKILL_NAME_REQUIRED);
  30:     }
  31: 
  32:     const queryManager = customEntityManager(ENTITY);
  33: 
  34:     const id = 'skill-' + crypto.randomUUID();
  35: 
  36:     await checkDuplicated(queryManager, id, skillData.name);
  37: 
  38:     const data = {
  39:         name: skillData.name,
  40:         category: skillData.category ?? '',
  41:         description: skillData.description ?? '',
  42:     };
  43: 
  44:     await queryManager.save(id, buildSkillEntity(data));
  45:     invalidateDictionary(ENTITY);
  46: 
  47:     return {
  48:         data: {
  49:             id,
  50:             skillData: data,
  51:         },
  52:     };
  53: };
  54: 
  55: /** KVS ?꾨웾 濡쒕뱶 + ?묐떟 留ㅽ븨. ?곹븳 洹쒖빟(findAllPaged, bulk 寃쎈줈? 媛숈? ?곸닔)? 醫낆쟾 洹몃?濡쒕떎. */
  56: const loadSkillList = async () => {
  57:     const queryManager = customEntityManager(ENTITY);
  58: 
  59:     // ?ㅽ궗 ?꾨━?뗫쭔 133嫄댁씠??findAll() ??100嫄??섎뱶罹≪뿉 嫄몃┛?? 紐⑸줉쨌?꾪꽣쨌?ㅽ궗 留ㅽ븨怨?
  60:     // quick-add ??"?대? 議댁옱" ?쒖떆媛 紐⑤몢 ???묐떟???곕?濡??섎━硫?以묐났 ?깅줉源뚯? ?좊컻?쒕떎.
  61:     // ?곹븳? bulk 寃쎈줈? 媛숈? 媛믪쓣 ?대떎 ???섏씠 媛덈━硫?"紐⑸줉???녿뒗????μ? 嫄곕?"媛 ?앷릿??
  62:     const rows = (await queryManager.findAllPaged('name', 100, CATALOG_MAX_ITEMS)).results;
  63: 
  64:     if (!rows) throw new LogicalError(ErrorCodes.SKILL_NOT_FOUND, ErrorCodes.SKILL_NOT_FOUND);
  65: 
  66:     return rows.map(row => ({
  67:         id: row.key,
  68:         name: row.value.name,
  69:         category: row.value.category ?? '',
  70:         description: row.value.description ?? '',
  71:     }));
  72: };
  73: 
  74: export const getSkillListService = async () => {
  75:     const mappedData = await readDictionary(ENTITY, loadSkillList);
  76: 
  77:     // 罹먯떆 媛믪? 怨듭쑀 媛앹껜?????뚮퉬??蹂?뺤씠 罹먯떆瑜??ㅼ뿼?쒗궎吏 ?딄쾶 ?몄텧留덈떎 ?뺤? 蹂듭궗(?묐떟 shape 遺덈?).
  78:     return {
  79:         data: mappedData.map(row => ({...row})),
  80:     };
  81: };
  82: 
  83: export const findSkillByIdService = async ({ id }) => {
  84:     const queryManager = customEntityManager(ENTITY);
  85: 
  86:     const result = await queryManager.findById(id);
  87: 
  88:     if (!result) throw new LogicalError(ErrorCodes.SKILL_NOT_FOUND, ErrorCodes.SKILL_NOT_FOUND);
  89: 
  90:     const skillData = {
  91:         name: result.name,
  92:         category: result.category ?? '',
  93:         description: result.description ?? '',
  94:     };
  95: 
  96:     return {
  97:         data: {
  98:             id,
  99:             skillData,
 100:         },
 101:     };
 102: };
 103: 
 104: export const deleteSkillService = async ({ id }) => {
 105:     // ?ъ슜以?媛?? user_skills + project_skills 李몄“ 嫄댁닔
 106:     const { rows } = await executeQuery(SkillMappingQuery.COUNT_USES_BY_SKILL, [id, id]);
 107:     const uses = Number(rows?.[0]?.total ?? 0);
 108:     if (uses > 0) {
 109:         throw new LogicalError(ErrorCodes.CAN_NOT_DELETE, ErrorCodes.CAN_NOT_DELETE);
 110:     }
 111: 
 112:     const queryManager = customEntityManager(ENTITY);
 113:     await queryManager.delete(id);
 114:     invalidateDictionary(ENTITY);
 115: 
 116:     return;
 117: };
 118: 
 119: export const updateSkillService = async (skillData) => {
 120:     const { id, name, category, description, isNameChanged } = skillData;
 121: 
 122:     const data = {
 123:         name,
 124:         category: category ?? '',
 125:         description: description ?? '',
 126:     };
 127: 
 128:     const queryManager = customEntityManager(ENTITY);
 129: 
 130:     if (isNameChanged) {
 131:         await checkDuplicated(queryManager, id, name);
 132:     }
 133: 
 134:     await queryManager.save(id, buildSkillEntity(data));
 135:     invalidateDictionary(ENTITY);
 136: 
 137:     return {
 138:         success: true,
 139:         data: {
 140:             id,
 141:             data,
 142:         },
 143:     };
 144: };
 145: 
 146: export const addSkillBulkService = async ({ items }) => {
 147:     const result = await addCatalogItemsBulk({
 148:         entity: ENTITY,
 149:         idPrefix: 'skill',
 150:         items,
 151:         // 鍮?媛??띿꽦 ?쒖쇅??buildSkillEntity 媛 ?대떦?쒕떎(KVS 媛 鍮?臾몄옄?댁쓣 嫄곕??쒕떎)
 152:         buildRecord: item => buildSkillEntity({
 153:             name: item.name,
 154:             category: item.category ?? '',
 155:             description: item.description ?? '',
 156:         }),
 157:     });
 158:     invalidateDictionary(ENTITY);
 159:     return result;
 160: };
 161: 
 162: const checkDuplicated = async (queryManager, id, name) => {
 163:     const { results = [] } = await queryManager.findByWhere('name', name);
 164: 
 165:     const duplicated = results.some(({ key }) => key !== id);
 166: 
 167:     if (duplicated) {
 168:         throw new LogicalError(ErrorCodes.SKILL_NAME_DUPLICATED, ErrorCodes.SKILL_NAME_DUPLICATED);
 169:     }
 170: };
--- src/resolver/backoffice/projectStatus/ProjectStatusService.js
   1: import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
   2: import crypto from 'crypto';
   3: import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
   4: import {LogicalError} from "../../../error/LogicalError";
   5: import {getProjectByStatusId, updateProjectPartialService} from "../../project/ProjectService";
   6: // A-7 ??留덉뒪???ъ쟾 60珥?紐⑤뱢 罹먯떆(TeamTreeCache ?숉삎). ?몄뒪?댁뒪蹂?罹먯떆?쇰뒗 ?쒓퀎??DictionaryCache 二쇱꽍 李몄“.
   7: import {invalidateDictionary, readDictionary} from '../DictionaryCache';
   8: 
   9: const ENTITY = 'status';
  10: 
  11: export const addProjectStatusService = async (projectStatusData) =>{
  12: 
  13:     if(!projectStatusData.name ){
  14:         throw new LogicalError(ErrorCodes.STATUS_NAME_REQUIRED, ErrorCodes.STATUS_NAME_REQUIRED)
  15:     }
  16: 
  17:     const queryManager = customEntityManager(ENTITY);
  18: 
  19:     const id = "status-"+crypto.randomUUID();
  20: 
  21:     await checkDuplicated(queryManager, id, projectStatusData.name);
  22: 
  23:     await queryManager.save(id, {id,...projectStatusData})
  24:     invalidateDictionary(ENTITY);
  25: 
  26:     return {
  27:         id,
  28:         projectStatusData
  29:     };
  30: }
  31: 
  32: export const addProjectStatusFromKanbanService= async ({name,prev}) =>{
  33:     if(!name ){
  34:         throw new LogicalError(ErrorCodes.STATUS_NAME_REQUIRED, ErrorCodes.STATUS_NAME_REQUIRED)
  35:     }
  36: 
  37:     const queryManager = customEntityManager(ENTITY);
  38:     const linkManager = customEntityManager('status_link');
  39: 
  40:     const id = "status-"+crypto.randomUUID();
  41: 
  42:     if (!prev?.id) {
  43:         throw new LogicalError("PREV_STATUS_REQUIRED", "?댁쟾 ?곹깭媛 ?꾩슂?⑸땲??");
  44:     }
  45: 
  46:     await checkDuplicated(queryManager, id, name);
  47: 
  48:     const data = {
  49:         id: id,
  50:         name: name,
  51:         color:"grey",
  52:         order:prev.order+1
  53:     }
  54: 
  55:     const linkId = `${prev.id}-${id}`;
  56:     const linkData = {
  57:         id: linkId,
  58:         from: prev.id,
  59:         to: id,
  60:     };
  61: 
  62:     await queryManager.save(id, data);
  63:     invalidateDictionary(ENTITY);
  64:     try {
  65:         await linkManager.save(linkId, linkData);// ?곌껐 異붽?
  66:     }catch (e){
  67:         await queryManager.delete(id); //留곹겕 ?ㅽ뙣???대떦 ?곹깭????젣
  68:         invalidateDictionary(ENTITY);
  69:         throw e; // 濡ㅻ갚 ??諛섎뱶???ㅽ뙣瑜??꾪뙆 ??responseWrapper 媛 success:false 吏곷젹??(誘몄쟾????議댁옱?섏? ?딅뒗 而щ읆???깃났 泥섎━??
  70:     }
  71:     return {id:id};
  72: }
  73: 
  74: /**
  75:  * ?꾨줈?앺듃 ?곹깭 ?꾩껜 議고쉶.
  76:  * 怨꾩빟: {rows:[...]} ??諛곗뿴??吏곸젒 諛섑솚?섎㈃ responseWrapper 媛 {success, 0:?? 1:?? 濡?
  77:  * ?몃뜳???ㅽ봽?덈뱶???꾨줎?멸? ??“由쏀빐???섍퀬, ?ㅽ뙣 ?묐떟(error)怨?援щ텇??遺덇??ν빐吏꾨떎.
  78:  */
  79: /** KVS ?꾨웾 濡쒕뱶 + ?묐떟 留ㅽ븨. ?곹븳 洹쒖빟(findAll = 100嫄?罹?? 醫낆쟾 洹몃?濡쒕떎. */
  80: const loadProjectStatusList = async () => {
  81: 
  82:    const queryManager = customEntityManager(ENTITY);
  83: 
  84:     const rows = (await queryManager.findAll()).results;
  85: 
  86:     return rows.map(row => ({
  87:         id: row.key,
  88:         name: row.value.name,
  89:         color: row.value.color,
  90:         order: row.value.order
  91:     }));
  92: };
  93: 
  94: export const getProjectStatusListService = async () =>{
  95:     const rows = await readDictionary(ENTITY, loadProjectStatusList);
  96: 
  97:     // 罹먯떆 媛믪? 怨듭쑀 媛앹껜?????뚮퉬??蹂?뺤씠 罹먯떆瑜??ㅼ뿼?쒗궎吏 ?딄쾶 ?몄텧留덈떎 ?뺤? 蹂듭궗(?묐떟 shape 遺덈?).
  98:     return {
  99:         rows: rows.map(row => ({...row}))
 100:     };
 101: }
 102: 
 103: /** 移몃컲 蹂대뱶????留곹겕(?쒖꽌)媛 ?뺤쓽???곹깭留? 怨꾩빟: {rows:[...]} (?꾩? ?숈씪 ?ъ쑀) */
 104: export const getProjectStatusExistLinkService = async () => {
 105: 
 106:     const queryManager = customEntityManager(ENTITY);
 107: 
 108:     const rows = (await queryManager.findByFilterExists('name','order')).results;
 109: 
 110:     return {
 111:         rows: rows
 112:             .filter(row => row.value.order != null)
 113:             .map(row => ({
 114:                 id: row.key,
 115:                 name: row.value.name,
 116:                 color: row.value.color,
 117:                 order: row.value.order
 118:             }))
 119:     };
 120: }
 121: 
 122: export const findProjectStatusByIdService = async ({id}) =>{
 123: 
 124:     const queryManager = customEntityManager(ENTITY);
 125: 
 126:     const result = await queryManager.findById(id);
 127: 
 128:     if(!result ){
 129:         throw new LogicalError(ErrorCodes.STATUS_NOT_FOUND, ErrorCodes.STATUS_NOT_FOUND)
 130:     }
 131: 
 132:     return {
 133:         id : result.id,
 134:         name: result.name,
 135:         color: result.color,
 136:         order:result.order
 137:     }
 138: 
 139: }
 140: 
 141: export const deleteProjectStatusService = async ({id}) => {
 142: 
 143:     const statusManager = customEntityManager('status');
 144:     const linkManager   = customEntityManager('status_link');
 145:     // ?곹깭 ??1媛쒕㈃ ??젣 遺덇? 泥섎━
 146:     const allStatus = (await statusManager.findByField('name')).results;
 147:     if (allStatus.length <= 1) {
 148:         throw new LogicalError("STATUS_MIN_REQUIRED", "STATUS_MIN_REQUIRED"); // 理쒖냼 1媛쒖쓽 ?곹깭媛 ?꾩슂?⑸땲??
 149:     }
 150:     // 留곹겕 議고쉶
 151:     const linkList =  (await linkManager.findByField('from')).results;
 152: 
 153:     let incoming; // ?꾩옱 ?곹깭???곌껐??
 154:     let outgoing; // ?꾩옱 ?곌껐??
 155: 
 156:     linkList.forEach(statusLink => {
 157:         const to = statusLink.value.to;
 158:         const from = statusLink.value.from;
 159: 
 160:         if (to === id) incoming = statusLink;
 161:         if (from === id) outgoing = statusLink;
 162:     });
 163: 
 164:     const isIsolated = !incoming && !outgoing; // ?덈줈 異붽??먯?留?留곹겕媛 ?녿뒗 ?곹깭
 165:     const isMiddle = incoming && outgoing;
 166:     const isFirst  = !incoming && outgoing;
 167:     const isLast   = incoming && !outgoing;
 168: 
 169:     if (isIsolated) {
 170:         await statusManager.delete(id);
 171:         invalidateDictionary(ENTITY);
 172:         return;
 173:     }
 174: 
 175:     if (isFirst) {
 176:         throw new LogicalError("PREV_STATUS_REQUIRED", "PREV_STATUS_REQUIRED"); //?댁쟾 ?곹깭媛 ?놁뼱 ??젣?????놁뒿?덈떎
 177:     }
 178:     // ?꾨줈?앺듃 ?댁쟾 ?곹깭 蹂寃쏀빐二쇨린
 179:     const prevStatusId = incoming.value.from;
 180:     const { rows: projectList }  = await getProjectByStatusId(id); // ??젣 ????꾨줈?앺듃 議고쉶
 181:     if(projectList.length !== 0){
 182:         for (const project of projectList) { // ?대떦 ?꾨줈?앺듃瑜??낅뜲?댄듃 ?댁쨲
 183:             const data ={
 184:                 project_id: project.project_id,
 185:                 project_status_key: prevStatusId,
 186:             };
 187:             await updateProjectPartialService(data);
 188:         }
 189:     }
 190: 
 191:     // 以묎컙???뚮쭔 ?댁뼱遺숈씠湲?
 192:     if (isMiddle) {
 193:         const from = incoming.value.from;
 194:         const to   = outgoing.value.to;
 195:         const newId = `${from}-${to}`;
 196: 
 197:         const exist = await linkManager.findById(newId);
 198:         if (!exist) {
 199:             await linkManager.save(newId, { id: newId, from, to });
 200:         }
 201:     }
 202: 
 203:     // 湲곗〈 留곹겕 ??젣
 204:     const linksToDelete = [incoming, outgoing].filter(Boolean);
 205:     for (const link of linksToDelete) {
 206:         await linkManager.delete(link.key);
 207:     }
 208: 
 209:     // ?곹깭 ??젣
 210:     await statusManager.delete(id);
 211:     invalidateDictionary(ENTITY);
 212: 
 213:     // 留⑤뮘硫?order ?ъ젙??遺덊븘??
 214:     if (isLast) {
 215:         return {prevStatusId:prevStatusId} ;
 216:     }
 217: 
 218:     // 以묎컙 or 留⑥븵 留곹겕 ?ъ“?????쒖꽌 ?ъ젙??
 219:     const updatedLinksRes = await linkManager.findByField('from');
 220:     const updatedLinks = updatedLinksRes.results ?? [];
 221: 
 222:     const edges = updatedLinks.map(l => ({
 223:         source: l.value.from,
 224:         target: l.value.to,
 225:     }));
 226: 
 227:     if (edges.length > 0) {
 228:         const orderedNodes = getOrderedNodes(edges);
 229:         await saveStatusOrder(orderedNodes);
 230:     }
 231: 
 232:     return {prevStatusId:prevStatusId} ;
 233: };
 234: 
 235: 
 236: export const updateProjectStatusService = async (statusData) => {
 237: 
 238:     const { id, name,  color,isNameChanged} = statusData;
 239: 
 240:     const data = {
 241:         id,
 242:         name,
 243:         color
 244:     };
 245: 
 246:     const queryManager = customEntityManager(ENTITY);
 247:     const orgData = await queryManager.findById(id);
 248: 
 249:     if (isNameChanged) {
 250:         await checkDuplicated(queryManager, id, name);
 251:     }
 252: 
 253:     const finalData = {
 254:         ...orgData,
 255:         ...(name !== undefined && { name }),
 256:         ...(color !== undefined && { color })
 257:     };
 258: 
 259:     await queryManager.save(id, finalData);
 260:     invalidateDictionary(ENTITY);
 261:     return {
 262:         id,
 263:         data,
 264:     };
 265: }
 266: 
 267: const checkDuplicated = async (queryManager, id, name) => {
 268:     const {results = []} = await queryManager.findByWhere('name', name);
 269: 
 270:     const duplicated = results.some(({key}) => key !== id);
 271: 
 272:     if (duplicated) {
 273:         throw new LogicalError(ErrorCodes.STATUS_NAME_DUPLICATED, ErrorCodes.STATUS_NAME_DUPLICATED)
 274:     }
 275: };
 276: 
 277: 
 278: 
 279: export const setStatusLinkService = async (data) =>{
 280:     const edges = data.edges;
 281:     // 媛??곹깭???곌껐 ???
 282:     await saveStatusLink(edges);
 283:     //  ?ｌ????쒖꽌
 284:     const orderedNodes = getOrderedNodes(edges);
 285: 
 286:     // ?대떦 ?곌껐 ?쒖꽌 ?낅뜲?댄듃
 287:     await saveStatusOrder(orderedNodes);
 288:     return;
 289: }
 290: 
 291: const saveStatusLink = async (edges) =>{
 292:     const queryManager = customEntityManager('status_link');
 293: 
 294:     const linksRes = await queryManager.findByField('from');
 295:     const existing = linksRes.results;
 296:     // ?꾩옱 ?뺤쓽 ???곌껐 ?꾩껜 ??젣
 297:     for (const row of existing) {
 298:         await queryManager.delete(row.key);
 299:     }
 300:     // ?곌껐 ?덈줈 ?뺤쓽
 301:     for (const { source, target } of edges) {
 302:         const linkId = `${source}-${target}`;
 303: 
 304:         await queryManager.save(linkId, {
 305:             id: linkId,
 306:             from: source,
 307:             to: target,
 308:         });
 309: 
 310:     }
 311: }
 312: const getOrderedNodes = (edges) => {
 313:     // 吏꾩엯 媛꾩꽑 ??怨꾩궛
 314:     const inDegree = {};
 315:     const graph = {};
 316: 
 317:     for (const { source, target } of edges) {
 318:         if (!inDegree[source]) inDegree[source] = 0;
 319:         if (!inDegree[target]) inDegree[target] = 0;
 320:         if (!graph[source]) graph[source] = [];
 321: 
 322:         graph[source].push(target);
 323:         inDegree[target]++;
 324:     }
 325: 
 326:     // 吏꾩엯 媛꾩꽑 0???몃뱶遺???쒖옉 (= 留????몃뱶)
 327:     const queue = Object.keys(inDegree).filter(n => inDegree[n] === 0);
 328:     const ordered = [];
 329: 
 330:     while (queue.length) {
 331:         const node = queue.shift();
 332:         ordered.push(node);
 333: 
 334:         for (const next of (graph[node] || [])) {
 335:             inDegree[next]--;
 336:             if (inDegree[next] === 0) queue.push(next);
 337:         }
 338:     }
 339: 
 340:     return ordered;
 341: }
 342: 
 343: const saveStatusOrder = async (orderedNodes) => {
 344: 
 345:     const queryManager = customEntityManager('status');
 346: 
 347:     // ?꾩껜 ?곹깭 ??踰덈쭔 議고쉶
 348:     const allStatusData = (await queryManager.findByField('name')).results;
 349: 
 350:     // orderedNodes???녿뒗 寃껊뱾 order null 珥덇린??
 351:     const resetTargets = allStatusData.filter(s => !orderedNodes.includes(s.key));
 352: 
 353:     if(resetTargets.length !== 0){
 354:         for (const existing of resetTargets) {
 355:             await queryManager.save(existing.key, {
 356:                 id: existing.key,
 357:                 name: existing.value.name,
 358:                 color : existing.value.color,
 359:             });
 360:         }
 361:     }
 362:     // ?꾩껜 議고쉶 寃곌낵?먯꽌 ?꾪꽣留곹빐???ъ궗??
 363:     for (const [index, nodeId] of orderedNodes.entries()) {
 364:         const existing = allStatusData.find(s => s.key === nodeId);
 365:         await queryManager.save(nodeId, {
 366:             id: existing.value.id,
 367:             name: existing.value.name,
 368:             color : existing.value.color,
 369:             order: index + 1,
 370:         });
 371:     }
 372: 
 373:     // order ?ъ젙?섎룄 status ?곌린????臾댄슚?붾? 鍮좊쑉由щ㈃ 移몃컲 ?쒖꽌媛 "??ν뻽?붾뜲 ??諛붾????쒕떎.
 374:     invalidateDictionary(ENTITY);
 375: }
 376: 
 377: export const getStatusLinkService = async () =>{
 378:     const queryManager = customEntityManager('status_link');
 379:     return await queryManager.findByField('from');
 380: }
--- src/resolver/backoffice/publicHoliday/PublicHolidayService.js
   1: import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
   2: import crypto from 'crypto';
   3: import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
   4: import {LogicalError} from "../../../error/LogicalError";
   5: // A-7 ??留덉뒪???ъ쟾 60珥?紐⑤뱢 罹먯떆(TeamTreeCache ?숉삎). ?몄뒪?댁뒪蹂?罹먯떆?쇰뒗 ?쒓퀎??DictionaryCache 二쇱꽍 李몄“.
   6: import {invalidateDictionary, readDictionary} from '../DictionaryCache';
   7: 
   8: const ENTITY = 'holiday';
   9: 
  10: export const addPublicHolidayService = async (holidayData) => {
  11:     const { name, holidayDate, workRatio } = holidayData;
  12: 
  13:     if (!name) {
  14:         throw new LogicalError(ErrorCodes.HOLIDAY_NAME_REQUIRED, ErrorCodes.HOLIDAY_NAME_REQUIRED);
  15:     }
  16:     if (!holidayDate) {
  17:         throw new LogicalError(ErrorCodes.HOLIDAY_DATE_REQUIRED, ErrorCodes.HOLIDAY_DATE_REQUIRED);
  18:     }
  19: 
  20:     const queryManager = customEntityManager(ENTITY);
  21:     const id = 'holiday-' + crypto.randomUUID();
  22: 
  23:     await checkDuplicatedDate(queryManager, id, holidayDate);
  24: 
  25:     const data = { name, holidayDate, workRatio: workRatio ?? 0 };
  26:     await queryManager.save(id, data);
  27:     invalidateDictionary(ENTITY);
  28: 
  29:     return {
  30:         data: { id, ...data },
  31:     };
  32: };
  33: 
  34: /** KVS 濡쒕뱶 + ?묐떟 留ㅽ븨. ?곹븳 洹쒖빟(findByField 湲곕낯 100嫄?? 醫낆쟾 洹몃?濡쒕떎(B-12 ??蹂꾧굔). */
  35: const loadPublicHolidayList = async () => {
  36:     const queryManager = customEntityManager(ENTITY);
  37: 
  38:     const rows = (await queryManager.findByField('by-date')).results;
  39: 
  40:     return rows.map(row => ({
  41:         id: row.key,
  42:         name: row.value.name,
  43:         holidayDate: row.value.holidayDate,
  44:         workRatio: row.value.workRatio,
  45:     }));
  46: };
  47: 
  48: export const getPublicHolidayListService = async () => {
  49:     const mappedData = await readDictionary(ENTITY, loadPublicHolidayList);
  50: 
  51:     // 罹먯떆 媛믪? 怨듭쑀 媛앹껜?????뚮퉬??蹂?뺤씠 罹먯떆瑜??ㅼ뿼?쒗궎吏 ?딄쾶 ?몄텧留덈떎 ?뺤? 蹂듭궗(?묐떟 shape 遺덈?).
  52:     return { data: mappedData.map(row => ({...row})) };
  53: };
  54: 
  55: export const findPublicHolidayByIdService = async ({ id }) => {
  56:     const queryManager = customEntityManager(ENTITY);
  57: 
  58:     const result = await queryManager.findById(id);
  59: 
  60:     if (!result) {
  61:         throw new LogicalError(ErrorCodes.HOLIDAY_NOT_FOUND, ErrorCodes.HOLIDAY_NOT_FOUND);
  62:     }
  63: 
  64:     return {
  65:         data: {
  66:             id,
  67:             name: result.name,
  68:             holidayDate: result.holidayDate,
  69:             workRatio: result.workRatio,
  70:         },
  71:     };
  72: };
  73: 
  74: export const deletePublicHolidayService = async ({ id }) => {
  75:     const queryManager = customEntityManager(ENTITY);
  76:     await queryManager.delete(id);
  77:     invalidateDictionary(ENTITY);
  78: };
  79: 
  80: export const updatePublicHolidayService = async (holidayData) => {
  81:     const { id, name, holidayDate, workRatio, isDateChanged } = holidayData;
  82: 
  83:     const queryManager = customEntityManager(ENTITY);
  84: 
  85:     if (isDateChanged) {
  86:         await checkDuplicatedDate(queryManager, id, holidayDate);
  87:     }
  88: 
  89:     const data = { name, holidayDate, workRatio };
  90:     await queryManager.save(id, data);
  91:     invalidateDictionary(ENTITY);
  92: 
  93:     return {
  94:         data: { id, ...data },
  95:     };
  96: };
  97: 
  98: const checkDuplicatedDate = async (queryManager, id, holidayDate) => {
  99:     const { results = [] } = await queryManager.findByWhere('by-date', holidayDate);
 100: 
 101:     const duplicated = results.some(({ key }) => key !== id);
 102: 
 103:     if (duplicated) {
 104:         throw new LogicalError(ErrorCodes.HOLIDAY_DATE_DUPLICATED, ErrorCodes.HOLIDAY_DATE_DUPLICATED);
 105:     }
 106: };
--- src/resolver/backoffice/setting/SettingService.js
   1: import {customEntityManager} from "../../../nosql/query/CustomEntityManager";
   2: import {LogicalError} from '../../../error/LogicalError';
   3: import {ErrorCodes} from '../../../utils/errors/ErrorCodes';
   4: import {DEFAULT_SETTINGS} from './SettingDefaults';
   5: // A-7 ??留덉뒪???ъ쟾 60珥?紐⑤뱢 罹먯떆(TeamTreeCache ?숉삎). ?몄뒪?댁뒪蹂?罹먯떆?쇰뒗 ?쒓퀎??DictionaryCache 二쇱꽍 李몄“.
   6: import {invalidateDictionary, readDictionary} from '../DictionaryCache';
   7: 
   8: 
   9: const ENTITY = 'settings';
  10: 
  11: const loadSettingRecord = async () => {
  12:     const queryManager = customEntityManager(ENTITY);
  13:     return await queryManager.findById("settings");
  14: };
  15: 
  16: /**
  17:  * A-7 ???뚮퉬?먭? 媛??留롮? ?ъ쟾?대떎(吏꾩쿃/鍮꾩슜/?먯썝/?ы듃?대━???묒뾽諛곗젙/湲됱뿬?뺤콉???꾨? ?쎈뒗??.
  18:  *
  19:  * ??**60珥?stale ???섏슜?쒕떎.** `salaryPolicy` 蹂寃?INDIVIDUAL ??LEVEL_BAND)??洹???곸씠??
  20:  *   ?뺤콉??諛붽퓭???ㅻⅨ ?몄뒪?댁뒪??理쒕? 60珥??숈븞 ???뺤콉?쇰줈 ?먯젙?쒕떎. 愿由ъ옄 1?몄씠 ?꾨Ⅴ??
  21:  *   ?鍮덈룄 ?ㅼ젙 蹂寃쎌씠怨? 沅뚰븳 ?먯젙???대? 理쒕? 90珥?stale(TeamTree 60 + principal 30)??
  22:  *   ?섏슜?섍퀬 ?덉뼱 媛숈? 湲됱쓽 寃쎄퀎?? ?곌린 寃쎈줈(updateSetting)?????吏곸쟾 KVS 瑜?吏곸젒 ?쎈뒗??
  23:  */
  24: export const getSettingDataService = async () => {
  25:     const saved = await readDictionary(ENTITY, loadSettingRecord);
  26:     // 湲곗〈 installation?먮뒗 ??attribute媛 ?놁쓣 ???덉쑝誘濡?read?먯꽌??湲곕낯媛믪쓣 蹂댁땐?쒕떎.
  27:     // (?ㅽ봽?덈뱶媛 ?몄텧留덈떎 ??媛앹껜瑜?留뚮뱾誘濡?罹먯떆 媛믪씠 ?뚮퉬?먯뿉寃?怨듭쑀?섏? ?딅뒗??)
  28:     return {...DEFAULT_SETTINGS, ...(saved ?? {})};
  29: };
  30: 
  31: 
  32: export const updateSettingService = async ({
  33:     currency,
  34:     hourRate,
  35:     utilizationUnderBand,
  36:     utilizationOverBand,
  37:     utilizationRedBand,
  38:     scopeTodoAmberRatio,
  39:     scopeTodoRedRatio,
  40:     progressThreshold,
  41:     salaryPolicy,
  42: } = {}) => {
  43:     const queryManager = customEntityManager(ENTITY);
  44: 
  45:     // 湲됱뿬 ?뺤콉(RFC-163) ???꾨찓??諛?媛믪? ????꾩뿉 嫄곕??쒕떎(짠7-1).
  46:     if (salaryPolicy != null && salaryPolicy !== 'INDIVIDUAL' && salaryPolicy !== 'LEVEL_BAND') {
  47:         throw new LogicalError(
  48:             ErrorCodes.SETTING_SALARY_POLICY_INVALID,
  49:             "salaryPolicy must be 'INDIVIDUAL' or 'LEVEL_BAND'",
  50:         );
  51:     }
  52: 
  53:     if (
  54:         progressThreshold != null
  55:         && (typeof progressThreshold !== 'number'
  56:             || !Number.isFinite(progressThreshold)
  57:             || progressThreshold < 0
  58:             || progressThreshold > 100)
  59:     ) {
  60:         throw new LogicalError(
  61:             ErrorCodes.SETTING_PROGRESS_THRESHOLD_INVALID,
  62:             'progressThreshold must be a finite number between 0 and 100',
  63:         );
  64:     }
  65: 
  66:     const prev = await queryManager.findById("settings");
  67: 
  68:     const next = {
  69:         ...DEFAULT_SETTINGS,
  70:         ...(prev ?? {}),
  71:         ...(currency != null && { currency }),
  72:         ...(hourRate != null && { hourRate }),
  73:         ...(utilizationUnderBand != null && { utilizationUnderBand }),
  74:         ...(utilizationOverBand != null && { utilizationOverBand }),
  75:         ...(utilizationRedBand != null && { utilizationRedBand }),
  76:         ...(scopeTodoAmberRatio != null && { scopeTodoAmberRatio }),
  77:         ...(scopeTodoRedRatio != null && { scopeTodoRedRatio }),
  78:         ...(progressThreshold != null && { progressThreshold }),
  79:         ...(salaryPolicy != null && { salaryPolicy }),
  80:     };
  81: 
  82:     await queryManager.save("settings", next);
  83:     invalidateDictionary(ENTITY);
  84:     return {content: {settings: next}};
  85: };
  86: 
--- entity write hits
src\resolver\backoffice\CatalogBulkService.js-25-    }
src\resolver\backoffice\CatalogBulkService.js-26-
src\resolver\backoffice\CatalogBulkService.js:27:    const queryManager = customEntityManager(entity);
src\resolver\backoffice\CatalogBulkService.js-28-    // 중복 판정은 **전량**을 봐야 한다. findAll() 은 100건 하드캡이라 그 뒤 항목이 조용히
src\resolver\backoffice\CatalogBulkService.js-29-    // "기존에 없음"으로 판정돼 같은 이름이 다시 저장된다(스킬 프리셋은 133건).
--
src\resolver\backoffice\level\LevelService.js-10-import {invalidateDictionary, readDictionary} from '../DictionaryCache';
src\resolver\backoffice\level\LevelService.js-11-
src\resolver\backoffice\level\LevelService.js:12:const ENTITY = 'level';
src\resolver\backoffice\level\LevelService.js-13-
src\resolver\backoffice\level\LevelService.js-14-/**
--
src\resolver\backoffice\level\LevelService.js-58-    }
src\resolver\backoffice\level\LevelService.js-59-
src\resolver\backoffice\level\LevelService.js:60:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\level\LevelService.js-61-
src\resolver\backoffice\level\LevelService.js-62-    const id = "level-"+crypto.randomUUID();
--
src\resolver\backoffice\level\LevelService.js-86-const loadLevelList = async () => {
src\resolver\backoffice\level\LevelService.js-87-
src\resolver\backoffice\level\LevelService.js:88:   const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\level\LevelService.js-89-
src\resolver\backoffice\level\LevelService.js-90-    const rows = (await queryManager.findAll()).results;
--
src\resolver\backoffice\level\LevelService.js-119-export const findLevelByIdService = async ({id}) =>{
src\resolver\backoffice\level\LevelService.js-120-
src\resolver\backoffice\level\LevelService.js:121:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\level\LevelService.js-122-
src\resolver\backoffice\level\LevelService.js-123-    const result = await queryManager.findById(id);
--
src\resolver\backoffice\level\LevelService.js-149-        throw new LogicalError(ErrorCodes.CAN_NOT_DELETE,ErrorCodes.CAN_NOT_DELETE);
src\resolver\backoffice\level\LevelService.js-150-
src\resolver\backoffice\level\LevelService.js:151:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\level\LevelService.js-152-
src\resolver\backoffice\level\LevelService.js-153-    await queryManager.delete(levelId.id);
--
src\resolver\backoffice\level\LevelService.js-168-    };
src\resolver\backoffice\level\LevelService.js-169-
src\resolver\backoffice\level\LevelService.js:170:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\level\LevelService.js-171-
src\resolver\backoffice\level\LevelService.js-172-    if (isNameChanged) {
--
src\resolver\backoffice\role\RoleService.js-8-import {invalidateDictionary, readDictionary} from '../DictionaryCache';
src\resolver\backoffice\role\RoleService.js-9-
src\resolver\backoffice\role\RoleService.js:10:const ENTITY = 'role';
src\resolver\backoffice\role\RoleService.js-11-
src\resolver\backoffice\role\RoleService.js-12-export const addRoleService = async (roleData) =>{
--
src\resolver\backoffice\role\RoleService.js-16-    }
src\resolver\backoffice\role\RoleService.js-17-
src\resolver\backoffice\role\RoleService.js:18:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\role\RoleService.js-19-
src\resolver\backoffice\role\RoleService.js-20-    const id = "role-"+crypto.randomUUID();
--
src\resolver\backoffice\role\RoleService.js-35-/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAll = 100건 캡)은 종전 그대로다. */
src\resolver\backoffice\role\RoleService.js-36-const loadRoleList = async () => {
src\resolver\backoffice\role\RoleService.js:37:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\role\RoleService.js-38-
src\resolver\backoffice\role\RoleService.js-39-    const rows = (await queryManager.findAll()).results;
--
src\resolver\backoffice\role\RoleService.js-59-export const findRoleByIdService = async ({id}) =>{
src\resolver\backoffice\role\RoleService.js-60-
src\resolver\backoffice\role\RoleService.js:61:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\role\RoleService.js-62-
src\resolver\backoffice\role\RoleService.js-63-    const result = await queryManager.findById(id);
--
src\resolver\backoffice\role\RoleService.js-83-        throw new LogicalError(ErrorCodes.CAN_NOT_DELETE,ErrorCodes.CAN_NOT_DELETE);
src\resolver\backoffice\role\RoleService.js-84-
src\resolver\backoffice\role\RoleService.js:85:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\role\RoleService.js-86-
src\resolver\backoffice\role\RoleService.js-87-    await queryManager.delete(roleId.id);
--
src\resolver\backoffice\role\RoleService.js-100-    };
src\resolver\backoffice\role\RoleService.js-101-
src\resolver\backoffice\role\RoleService.js:102:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\role\RoleService.js-103-
src\resolver\backoffice\role\RoleService.js-104-    if (isNameChanged) {
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-15-    }
src\resolver\backoffice\projectStatus\ProjectStatusService.js-16-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:17:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-18-
src\resolver\backoffice\projectStatus\ProjectStatusService.js-19-    const id = "status-"+crypto.randomUUID();
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-35-    }
src\resolver\backoffice\projectStatus\ProjectStatusService.js-36-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:37:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-38-    const linkManager = customEntityManager('status_link');
src\resolver\backoffice\projectStatus\ProjectStatusService.js-39-
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-80-const loadProjectStatusList = async () => {
src\resolver\backoffice\projectStatus\ProjectStatusService.js-81-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:82:   const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-83-
src\resolver\backoffice\projectStatus\ProjectStatusService.js-84-    const rows = (await queryManager.findAll()).results;
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-104-export const getProjectStatusExistLinkService = async () => {
src\resolver\backoffice\projectStatus\ProjectStatusService.js-105-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:106:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-107-
src\resolver\backoffice\projectStatus\ProjectStatusService.js-108-    const rows = (await queryManager.findByFilterExists('name','order')).results;
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-122-export const findProjectStatusByIdService = async ({id}) =>{
src\resolver\backoffice\projectStatus\ProjectStatusService.js-123-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:124:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-125-
src\resolver\backoffice\projectStatus\ProjectStatusService.js-126-    const result = await queryManager.findById(id);
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-244-    };
src\resolver\backoffice\projectStatus\ProjectStatusService.js-245-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:246:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-247-    const orgData = await queryManager.findById(id);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-248-
--
src\resolver\backoffice\permission\PermissionService.js-16-export const addPermissionService = async ({name, pages, projectScope}) =>{
src\resolver\backoffice\permission\PermissionService.js-17-
src\resolver\backoffice\permission\PermissionService.js:18:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\permission\PermissionService.js-19-
src\resolver\backoffice\permission\PermissionService.js-20-    const id = "permission-"+crypto.randomUUID();
--
src\resolver\backoffice\permission\PermissionService.js-30-
src\resolver\backoffice\permission\PermissionService.js-31-export const getPermissionListService = async () =>{
src\resolver\backoffice\permission\PermissionService.js:32:   const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\permission\PermissionService.js-33-
src\resolver\backoffice\permission\PermissionService.js-34-    const rows = (await queryManager.findAll()).results;
--
src\resolver\backoffice\permission\PermissionService.js-47-export const findPermissionByIdService = async ({id}) =>{
src\resolver\backoffice\permission\PermissionService.js-48-
src\resolver\backoffice\permission\PermissionService.js:49:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\permission\PermissionService.js-50-
src\resolver\backoffice\permission\PermissionService.js-51-    const result = await queryManager.findById(id);
--
src\resolver\backoffice\permission\PermissionService.js-68-        throw new LogicalError(ErrorCodes.CAN_NOT_DELETE,ErrorCodes.CAN_NOT_DELETE);
src\resolver\backoffice\permission\PermissionService.js-69-
src\resolver\backoffice\permission\PermissionService.js:70:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\permission\PermissionService.js-71-
src\resolver\backoffice\permission\PermissionService.js-72-    await queryManager.delete(id);
--
src\resolver\backoffice\permission\PermissionService.js-77-export const updatePermissionService = async ({id,name,pages,isNameChanged,projectScope}) => {
src\resolver\backoffice\permission\PermissionService.js-78-
src\resolver\backoffice\permission\PermissionService.js:79:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\permission\PermissionService.js-80-
src\resolver\backoffice\permission\PermissionService.js-81-    // 시드 방어: 이 경로는 커스텀 세트(edit:true) 전용이다.
--
src\resolver\backoffice\permission\PermissionService.js-121- */
src\resolver\backoffice\permission\PermissionService.js-122-export const updatePermissionScopeService = async ({ id, projectScope }) => {
src\resolver\backoffice\permission\PermissionService.js:123:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\permission\PermissionService.js-124-
src\resolver\backoffice\permission\PermissionService.js-125-    const set = await queryManager.findById(id);
--
src\resolver\backoffice\permission\PermissionService.js-152-
src\resolver\backoffice\permission\PermissionService.js-153-export const getMemberId = async () =>{
src\resolver\backoffice\permission\PermissionService.js:154:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\permission\PermissionService.js-155-    const { results = [] } = await queryManager.findByWhere('name',"Member");
src\resolver\backoffice\permission\PermissionService.js-156-    return results[0]?.key;
--
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-18-    }
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-19-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:20:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-21-    const id = 'holiday-' + crypto.randomUUID();
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-22-
--
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-34-/** KVS 로드 + 응답 매핑. 상한 규약(findByField 기본 100건)은 종전 그대로다(B-12 는 별건). */
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-35-const loadPublicHolidayList = async () => {
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:36:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-37-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-38-    const rows = (await queryManager.findByField('by-date')).results;
--
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-54-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-55-export const findPublicHolidayByIdService = async ({ id }) => {
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:56:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-57-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-58-    const result = await queryManager.findById(id);
--
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-73-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-74-export const deletePublicHolidayService = async ({ id }) => {
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:75:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-76-    await queryManager.delete(id);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-77-    invalidateDictionary(ENTITY);
--
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-81-    const { id, name, holidayDate, workRatio, isDateChanged } = holidayData;
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-82-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:83:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-84-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-85-    if (isDateChanged) {
--
src\resolver\backoffice\skill\SkillService.js-13-import { invalidateDictionary, readDictionary } from '../DictionaryCache';
src\resolver\backoffice\skill\SkillService.js-14-
src\resolver\backoffice\skill\SkillService.js:15:const ENTITY = 'skill';
src\resolver\backoffice\skill\SkillService.js-16-
src\resolver\backoffice\skill\SkillService.js-17-// Forge KVS 는 선언된 속성에 빈 문자열('')을 저장하면 "cannot be empty" 로 거부한다.
--
src\resolver\backoffice\skill\SkillService.js-30-    }
src\resolver\backoffice\skill\SkillService.js-31-
src\resolver\backoffice\skill\SkillService.js:32:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\skill\SkillService.js-33-
src\resolver\backoffice\skill\SkillService.js-34-    const id = 'skill-' + crypto.randomUUID();
--
src\resolver\backoffice\skill\SkillService.js-55-/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAllPaged, bulk 경로와 같은 상수)은 종전 그대로다. */
src\resolver\backoffice\skill\SkillService.js-56-const loadSkillList = async () => {
src\resolver\backoffice\skill\SkillService.js:57:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\skill\SkillService.js-58-
src\resolver\backoffice\skill\SkillService.js-59-    // 스킬 프리셋만 133건이라 findAll() 의 100건 하드캡에 걸린다. 목록·필터·스킬 매핑과
--
src\resolver\backoffice\skill\SkillService.js-82-
src\resolver\backoffice\skill\SkillService.js-83-export const findSkillByIdService = async ({ id }) => {
src\resolver\backoffice\skill\SkillService.js:84:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\skill\SkillService.js-85-
src\resolver\backoffice\skill\SkillService.js-86-    const result = await queryManager.findById(id);
--
src\resolver\backoffice\skill\SkillService.js-110-    }
src\resolver\backoffice\skill\SkillService.js-111-
src\resolver\backoffice\skill\SkillService.js:112:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\skill\SkillService.js-113-    await queryManager.delete(id);
src\resolver\backoffice\skill\SkillService.js-114-    invalidateDictionary(ENTITY);
--
src\resolver\backoffice\skill\SkillService.js-126-    };
src\resolver\backoffice\skill\SkillService.js-127-
src\resolver\backoffice\skill\SkillService.js:128:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\skill\SkillService.js-129-
src\resolver\backoffice\skill\SkillService.js-130-    if (isNameChanged) {
--
src\resolver\backoffice\setting\SettingService.js-10-
src\resolver\backoffice\setting\SettingService.js-11-const loadSettingRecord = async () => {
src\resolver\backoffice\setting\SettingService.js:12:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\setting\SettingService.js-13-    return await queryManager.findById("settings");
src\resolver\backoffice\setting\SettingService.js-14-};
--
src\resolver\backoffice\setting\SettingService.js-41-    salaryPolicy,
src\resolver\backoffice\setting\SettingService.js-42-} = {}) => {
src\resolver\backoffice\setting\SettingService.js:43:    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\setting\SettingService.js-44-
src\resolver\backoffice\setting\SettingService.js-45-    // 급여 정책(RFC-163) — 도메인 밖 값은 저장 전에 거부한다(§7-1).
--- direct settings/status ids
--
src\resolver\issueAnalysis\IssueAnalysisService.js-42-
src\resolver\issueAnalysis\IssueAnalysisService.js-43-    const hourRate = settings?.hourRate || 8; // ??? ??? ??
src\resolver\issueAnalysis\IssueAnalysisService.js:44:    const holidaySet = new Set((holidayResult?.data || []).map(h => h.holidayDate)); // ??? ??
src\resolver\issueAnalysis\IssueAnalysisService.js-45-
src\resolver\issueAnalysis\IssueAnalysisService.js-46-    const result = await getProjectIssuesByFilter(projectId, nextPageToken, filterJql, maxResults, coworkerFieldId);
--
--
src\resolver\issueAnalysis\IssueAnalysisService.js-189-
src\resolver\issueAnalysis\IssueAnalysisService.js-190-    const hourRate = settings?.hourRate || 8;
src\resolver\issueAnalysis\IssueAnalysisService.js:191:    const holidaySet = new Set((holidayResult?.data || []).map(h => h.holidayDate));
src\resolver\issueAnalysis\IssueAnalysisService.js-192-
src\resolver\issueAnalysis\IssueAnalysisService.js-193-    // ?? ?? ???????? ?? ? ??? ?? ??? ????(???? ?? ???)
--
src\seed\SeedData.js-235-};
--
src\seed\SeedData.js-261-        const existing = await queryManager.findById(status.id);
src\seed\SeedData.js-262-        if (existing) continue;
src\seed\SeedData.js:263:        await queryManager.save(status.id, status);
src\seed\SeedData.js-264-    }
src\seed\SeedData.js-265-}
--
src\seed\SeedData.js-323-        // ?? ??? ????, ??? ?? ?(??? band ?)? ????.
src\seed\SeedData.js-324-        // spread ??? exists ? ?? ? ??? ??? ?(hourRate ?)? ???? ??.
src\seed\SeedData.js:325:        await queryManager.save("settings", { ...settings, ...exists });
src\seed\SeedData.js-326-        return;
src\seed\SeedData.js-327-    }
src\seed\SeedData.js-328-
src\seed\SeedData.js:329:    await queryManager.save("settings", settings);
src\seed\SeedData.js-330-}
--
--
--
src\resolver\projectProgress\__test__\ProgressCalculator.test.js-182-    it('done ??? ???? ??', () => {
src\resolver\projectProgress\__test__\ProgressCalculator.test.js-183-        const issues = [normalizeIssue(mkIssue({ key: 'A', statusKey: 'done', plannedSeconds: 144000, actualSeconds: 0, startDate: '2026-06-01' }))];
src\resolver\projectProgress\__test__\ProgressCalculator.test.js:184:        const r = computeDelayPredicted(issues, 8, '2026-06-30', new Set());
src\resolver\projectProgress\__test__\ProgressCalculator.test.js-185-        expect(r.estimatedEndDate).toBe(null);
--
src\resolver\myWork\MyWorkService.jsx-12-    const myProjects = await getMyProjectListRepository(accountId);
src\resolver\myWork\MyWorkService.jsx-13-
src\resolver\myWork\MyWorkService.jsx:14:    const roleIds = [...new Set(myProjects.map(v => v.role_key).filter(Boolean))];
src\resolver\myWork\MyWorkService.jsx:15:    const levelIds = [...new Set(myProjects.map(v => v.level_key).filter(Boolean))];
src\resolver\myWork\MyWorkService.jsx:16:    const statusIds = [...new Set(myProjects.map(v => v.project_status_key).filter(Boolean))];
src\resolver\myWork\MyWorkService.jsx-17-
src\resolver\myWork\MyWorkService.jsx-18-    const [roles, levels,status] = await Promise.all([
--
src\resolver\projectProgress\ProjectProgressService.js-63-    const publicHolidays = holidayResult?.data || [];
src\resolver\projectProgress\ProjectProgressService.js-64-    const holidayMap = buildHolidayMap(publicHolidays);
src\resolver\projectProgress\ProjectProgressService.js:65:    const holidaySet = new Set(publicHolidays.map(h => h.holidayDate));
src\resolver\projectProgress\ProjectProgressService.js-66-
src\resolver\projectProgress\ProjectProgressService.js-67-    // ???? ?? (??? ???? ?? ??. ??? null ? ????? noPeriod ??)
--
src\resolver\projectProgress\ProjectProgressService.js:144:    await kvs.set(cacheKey, cachePayload, { ttl: { unit: 'MINUTES', value: 10 } });
src\resolver\projectProgress\ProjectProgressService.js-145-
src\resolver\projectProgress\ProjectProgressService.js-146-    const issues = buildIssuesFromNorm(issuesNorm, hourRate, holidaySet, lastWorklogDateMap);
--
src\resolver\projectProgress\ProjectProgressService.js-203-        fetchAllProjectIssues({ projectId, coworkerFieldId }),
src\resolver\projectProgress\ProjectProgressService.js-204-    ]);
src\resolver\projectProgress\ProjectProgressService.js:205:    const holidaySet = new Set((holidayResult?.data || []).map(h => h.holidayDate));
src\resolver\projectProgress\ProjectProgressService.js-206-    const issuesNorm = rawIssues.map(i => normalizeIssue(i, coworkerFieldId));
src\resolver\projectProgress\ProjectProgressService.js-207-
--
src\resolver\projectProgress\ProgressCalculator.js-135- * ?? = plannedTotalMd ??? ??.
src\resolver\projectProgress\ProgressCalculator.js-136- */
src\resolver\projectProgress\ProgressCalculator.js:137:export const generatePlanLine = (startDate, endDate, plannedTotalMd, holidaySet = new Set()) => {
src\resolver\projectProgress\ProgressCalculator.js-138-    if (!startDate || !endDate || plannedTotalMd == null || plannedTotalMd === 0) return [];
src\resolver\projectProgress\ProgressCalculator.js-139-
--
src\resolver\workAssignment\WorkAssignmentService.js:352:    const memberSet = new Set(memberIds);
src\resolver\workAssignment\WorkAssignmentService.js-353-
src\resolver\workAssignment\WorkAssignmentService.js-354-    const [ctx, requiredIds, settings] = await Promise.all([
--
src\resolver\project\ProjectService.js-103-const invalidateProjectKvsCache = async (project_id) => {
--
src\resolver\workAssignment\WorkAssignmentIssueFetcher.js-241-        for (const c of n.coworkerAccountIds) if (c) participants.add(c);
--
src\rdb\schema\ddl\skillMapping.sql.js-2-// ?? ???(??)? KVS(skill ???), ??? ??? Forge SQL.
src\rdb\schema\ddl\skillMapping.sql.js-3-// users/project ? SQL ??? ????????? SQL ??(??? ?2.2/?2.3).
src\rdb\schema\ddl\skillMapping.sql.js:4:// FK/CASCADE ? TiDB ??? ? ? ?? ?? DELETE(??? ?2.2, Forge SQL No FK Cascade ??).
src\rdb\schema\ddl\skillMapping.sql.js-5-
src\rdb\schema\ddl\skillMapping.sql.js-6-export const CREATE_USER_SKILLS_TABLE = `
--
src\resolver\gantt\__test__\GanttValidationService.test.js-14-describe('detectTreeCycle (WBS ?? ???)', () => {
--
--
src\resolver\workAssignment\AssignmentProjectService.js-47-            const list = map.get(row.project_id) ?? [];
src\resolver\workAssignment\AssignmentProjectService.js-48-            list.push(row.skill_id);
src\resolver\workAssignment\AssignmentProjectService.js:49:            map.set(row.project_id, list);
src\resolver\workAssignment\AssignmentProjectService.js-50-        }
--
src\resolver\resourceManagement\__test__\ResourceSalaryLeak.test.js-77-const findForbiddenKeys = (value, path = '$', found = []) => {
--
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-5- *   ? ? ??? ?? ?? ? ???? **?? ??? ??**
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-6- *   ? integer attribute ? null / ?? ?? ? `Math.round`
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js:7: *   ? `set()` ? ?? ?? ? ?? ??? ? ?? ??
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-8- */
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-9-
--
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-15-jest.mock('../../../../nosql/query/CustomEntityManager', () => ({
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-16-    customEntityManager: jest.fn(() => ({
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js:17:        save: (...a) => mockSave(...a),
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-18-        findById: (...a) => mockFindById(...a),
src\resolver\backoffice\level\__test__\LevelSalaryBand.test.js-19-        findAll: (...a) => mockFindAll(...a),
--
src\resolver\projectIssue\__test__\recordIssueAssignedDate.test.js-31-
--
src\resolver\gantt\__test__\GanttFolderService.test.js-242-            .rejects.toMatchObject({ code: ErrorCodes.GANTT_CROSS_PROJECT_REF });
--
src\resolver\backoffice\level\LevelService.js-17- * ? KVS ?? ? ? ??? ?? ?? + integer attribute ? null ??
src\resolver\backoffice\level\LevelService.js-18- *   ? **????? ?? ??? ??? ???.** `|| ''` / `null` ??.
src\resolver\backoffice\level\LevelService.js:19: * ? `kvs.entity().set(id, {...data})` ? **?? ??**???, ??? ???? ?? ?? ???? ????
src\resolver\backoffice\level\LevelService.js-20- *   (= ???? ? ???? ??? ??? ????. ?? ?? API ???).
src\resolver\backoffice\level\LevelService.js-21- * ? ??? ??? + min/max ?? ? `round((min+max)/2)` ?? ??(API ?? ?? ??).
--
src\resolver\backoffice\level\LevelService.js-71-    };
src\resolver\backoffice\level\LevelService.js-72-
src\resolver\backoffice\level\LevelService.js:73:    await queryManager.save(id, saved)
src\resolver\backoffice\level\LevelService.js-74-    invalidateDictionary(ENTITY);
src\resolver\backoffice\level\LevelService.js-75-
--
src\resolver\backoffice\level\LevelService.js-151-    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\level\LevelService.js-152-
src\resolver\backoffice\level\LevelService.js:153:    await queryManager.delete(levelId.id);
src\resolver\backoffice\level\LevelService.js-154-    invalidateDictionary(ENTITY);
src\resolver\backoffice\level\LevelService.js-155-
--
src\resolver\backoffice\level\LevelService.js-164-        name,
src\resolver\backoffice\level\LevelService.js-165-        description,
src\resolver\backoffice\level\LevelService.js:166:        // ?? ??(RFC-163). set() ? ?? ???? ??? ??? ???? ?? ??? ????.
src\resolver\backoffice\level\LevelService.js-167-        ...buildBandAttributes({salaryMin, salaryMax, salaryRepresentative}),
src\resolver\backoffice\level\LevelService.js-168-    };
--
src\resolver\backoffice\level\LevelService.js-174-    }
src\resolver\backoffice\level\LevelService.js-175-
src\resolver\backoffice\level\LevelService.js:176:    await queryManager.save(id, data);
src\resolver\backoffice\level\LevelService.js-177-    invalidateDictionary(ENTITY);
src\resolver\backoffice\level\LevelService.js-178-    return {
--
src\resolver\resourceManagement\__test__\ResourceLoadFetcherGroups.test.js-41-};
--
src\resolver\gantt\GanttMapper.js-198-        for (const edge of t._links) {
--
src\resolver\resourceManagement\ResourceManagementService.js-97-        const list = skillIdsByAccount.get(row.account_id) ?? [];
src\resolver\resourceManagement\ResourceManagementService.js-98-        list.push(row.skill_id);
src\resolver\resourceManagement\ResourceManagementService.js:99:        skillIdsByAccount.set(row.account_id, list);
src\resolver\resourceManagement\ResourceManagementService.js-100-    }
src\resolver\resourceManagement\ResourceManagementService.js-101-
--
src\resolver\resourceManagement\ResourceManagementService.js-196-
--
src\resolver\resourceManagement\ResourceManagementService.js-244-// status ????? "??" ???? ??(key/name/color/order ?). ??? status-done(DONE) ? ????.
src\resolver\resourceManagement\ResourceManagementService.js-245-//   ? ?? status ?/?? ??? ??? ?? ????, ??? end_date < today ??(?? ?5/?8-1).
src\resolver\resourceManagement\ResourceManagementService.js:246:const TERMINAL_STATUS_KEYS = new Set(['status-done']);
src\resolver\resourceManagement\ResourceManagementService.js-247-const TERMINAL_NAME_RE = /(done|closed?|complete|completed|finish|finished|??|??|??)/i;
src\resolver\resourceManagement\ResourceManagementService.js-248-
--
--
src\resolver\resourceManagement\ResourceManagementService.js-479-        if (!projectMap.has(projectId)) {
src\resolver\resourceManagement\ResourceManagementService.js-480-            const statusKey = row.project_status_key ?? null;
src\resolver\resourceManagement\ResourceManagementService.js:481:            projectMap.set(projectId, {
src\resolver\resourceManagement\ResourceManagementService.js-482-                projectId,
--
--
src\resolver\resourceManagement\ResourceManagementService.js-615-// ?? (c) ?? ?? set / get ???????????????????????????????????????????????????
src\resolver\resourceManagement\ResourceManagementService.js-616-const normalizeSkillIds = (skillIds) =>
src\resolver\resourceManagement\ResourceManagementService.js:617:    [...new Set((Array.isArray(skillIds) ? skillIds : []).filter(Boolean))];
src\resolver\resourceManagement\ResourceManagementService.js-618-
src\resolver\resourceManagement\ResourceManagementService.js-619-export const getUserSkillsService = async ({ accountId }) => {
--
src\resolver\projectDashboard\ProjectDashboardService.js-507-
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-21-    await checkDuplicated(queryManager, id, projectStatusData.name);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-22-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:23:    await queryManager.save(id, {id,...projectStatusData})
src\resolver\backoffice\projectStatus\ProjectStatusService.js-24-    invalidateDictionary(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-25-
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-60-    };
src\resolver\backoffice\projectStatus\ProjectStatusService.js-61-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:62:    await queryManager.save(id, data);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-63-    invalidateDictionary(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-64-    try {
src\resolver\backoffice\projectStatus\ProjectStatusService.js:65:        await linkManager.save(linkId, linkData);// ?? ??
src\resolver\backoffice\projectStatus\ProjectStatusService.js-66-    }catch (e){
src\resolver\backoffice\projectStatus\ProjectStatusService.js:67:        await queryManager.delete(id); //?? ??? ?? ??? ??
src\resolver\backoffice\projectStatus\ProjectStatusService.js-68-        invalidateDictionary(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-69-        throw e; // ?? ? ??? ??? ?? ? responseWrapper ? success:false ??? (??? ? ???? ?? ??? ?? ???)
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-168-
src\resolver\backoffice\projectStatus\ProjectStatusService.js-169-    if (isIsolated) {
src\resolver\backoffice\projectStatus\ProjectStatusService.js:170:        await statusManager.delete(id);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-171-        invalidateDictionary(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-172-        return;
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-197-        const exist = await linkManager.findById(newId);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-198-        if (!exist) {
src\resolver\backoffice\projectStatus\ProjectStatusService.js:199:            await linkManager.save(newId, { id: newId, from, to });
src\resolver\backoffice\projectStatus\ProjectStatusService.js-200-        }
src\resolver\backoffice\projectStatus\ProjectStatusService.js-201-    }
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-204-    const linksToDelete = [incoming, outgoing].filter(Boolean);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-205-    for (const link of linksToDelete) {
src\resolver\backoffice\projectStatus\ProjectStatusService.js:206:        await linkManager.delete(link.key);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-207-    }
src\resolver\backoffice\projectStatus\ProjectStatusService.js-208-
src\resolver\backoffice\projectStatus\ProjectStatusService.js-209-    // ?? ??
src\resolver\backoffice\projectStatus\ProjectStatusService.js:210:    await statusManager.delete(id);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-211-    invalidateDictionary(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-212-
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-257-    };
src\resolver\backoffice\projectStatus\ProjectStatusService.js-258-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:259:    await queryManager.save(id, finalData);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-260-    invalidateDictionary(ENTITY);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-261-    return {
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-296-    // ?? ?? ? ?? ?? ??
src\resolver\backoffice\projectStatus\ProjectStatusService.js-297-    for (const row of existing) {
src\resolver\backoffice\projectStatus\ProjectStatusService.js:298:        await queryManager.delete(row.key);
src\resolver\backoffice\projectStatus\ProjectStatusService.js-299-    }
src\resolver\backoffice\projectStatus\ProjectStatusService.js-300-    // ?? ?? ??
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-302-        const linkId = `${source}-${target}`;
src\resolver\backoffice\projectStatus\ProjectStatusService.js-303-
src\resolver\backoffice\projectStatus\ProjectStatusService.js:304:        await queryManager.save(linkId, {
src\resolver\backoffice\projectStatus\ProjectStatusService.js-305-            id: linkId,
src\resolver\backoffice\projectStatus\ProjectStatusService.js-306-            from: source,
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-353-    if(resetTargets.length !== 0){
src\resolver\backoffice\projectStatus\ProjectStatusService.js-354-        for (const existing of resetTargets) {
src\resolver\backoffice\projectStatus\ProjectStatusService.js:355:            await queryManager.save(existing.key, {
src\resolver\backoffice\projectStatus\ProjectStatusService.js-356-                id: existing.key,
src\resolver\backoffice\projectStatus\ProjectStatusService.js-357-                name: existing.value.name,
--
src\resolver\backoffice\projectStatus\ProjectStatusService.js-363-    for (const [index, nodeId] of orderedNodes.entries()) {
src\resolver\backoffice\projectStatus\ProjectStatusService.js-364-        const existing = allStatusData.find(s => s.key === nodeId);
src\resolver\backoffice\projectStatus\ProjectStatusService.js:365:        await queryManager.save(nodeId, {
src\resolver\backoffice\projectStatus\ProjectStatusService.js-366-            id: existing.value.id,
src\resolver\backoffice\projectStatus\ProjectStatusService.js-367-            name: existing.value.name,
--
src\resolver\resourceAnalysis\ResourceAnalysisService.js-86-            const dates = ratioByAccountDate.get(account_id) ?? new Map();
--
src\resolver\portfolioDashboard\PortfolioDashboardService.js:160:    const scopedSet = scoped === null ? null : new Set(scoped);
src\resolver\portfolioDashboard\PortfolioDashboardService.js-161-
src\resolver\portfolioDashboard\PortfolioDashboardService.js-162-    const [rows, settings, statusList, roleList, levelList, teamIndex, memberTeamPairs] = await Promise.all([
--
src\resolver\backoffice\user\UserRepository.js-73-            .from('users')
--
src\resolver\teamAnalytics\TeamAnalyticsService.js-125-            jiraUsers = await userMap(leaderIds.map(id => ({ account_id: id })));
--
src\resolver\backoffice\role\RoleService.js-22-    await checkDuplicated(queryManager, id, roleData.name);
src\resolver\backoffice\role\RoleService.js-23-
src\resolver\backoffice\role\RoleService.js:24:    await queryManager.save(id, roleData)
src\resolver\backoffice\role\RoleService.js-25-    invalidateDictionary(ENTITY);
src\resolver\backoffice\role\RoleService.js-26-
--
src\resolver\backoffice\role\RoleService.js-85-    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\role\RoleService.js-86-
src\resolver\backoffice\role\RoleService.js:87:    await queryManager.delete(roleId.id);
src\resolver\backoffice\role\RoleService.js-88-    invalidateDictionary(ENTITY);
src\resolver\backoffice\role\RoleService.js-89-
--
src\resolver\backoffice\role\RoleService.js-106-    }
src\resolver\backoffice\role\RoleService.js-107-
src\resolver\backoffice\role\RoleService.js:108:    await queryManager.save(id, data);
src\resolver\backoffice\role\RoleService.js-109-    invalidateDictionary(ENTITY);
src\resolver\backoffice\role\RoleService.js-110-    return {
--
src\resolver\utils\job\JobService.js-27-    const jobManager = customEntityManager("job");
--
--
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-24-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-25-    const data = { name, holidayDate, workRatio: workRatio ?? 0 };
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:26:    await queryManager.save(id, data);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-27-    invalidateDictionary(ENTITY);
--
--
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-88-
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-89-    const data = { name, holidayDate, workRatio };
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:90:    await queryManager.save(id, data);
src\resolver\backoffice\publicHoliday\PublicHolidayService.js-91-    invalidateDictionary(ENTITY);
--
src\resolver\projectTeam\__test__\ProjectTeamService.test.js-231-        }));
--
src\resolver\backoffice\skill\SkillService.js-1-// ?? ??? CRUD (RoleService 1:1 ?? + category ??).
src\resolver\backoffice\skill\SkillService.js-2-// ??? ?? = KVS 'skill' ???(role/level ???). ???/???? ??? SQL(SkillMappingQuery).
src\resolver\backoffice\skill\SkillService.js:3:// deleteSkill ? ??? ??: user_skills + project_skills ?? > 0 ? CAN_NOT_DELETE(role ? findUserWithRole ??? ?? ??).
src\resolver\backoffice\skill\SkillService.js-4-
src\resolver\backoffice\skill\SkillService.js-5-import { customEntityManager } from '../../../nosql/query/CustomEntityManager';
--
src\resolver\backoffice\skill\SkillService.js-42-    };
src\resolver\backoffice\skill\SkillService.js-43-
src\resolver\backoffice\skill\SkillService.js:44:    await queryManager.save(id, buildSkillEntity(data));
src\resolver\backoffice\skill\SkillService.js-45-    invalidateDictionary(ENTITY);
src\resolver\backoffice\skill\SkillService.js-46-
--
src\resolver\backoffice\skill\SkillService.js-111-
src\resolver\backoffice\skill\SkillService.js-112-    const queryManager = customEntityManager(ENTITY);
src\resolver\backoffice\skill\SkillService.js:113:    await queryManager.delete(id);
src\resolver\backoffice\skill\SkillService.js-114-    invalidateDictionary(ENTITY);
src\resolver\backoffice\skill\SkillService.js-115-
--
src\resolver\backoffice\skill\SkillService.js-132-    }
src\resolver\backoffice\skill\SkillService.js-133-
src\resolver\backoffice\skill\SkillService.js:134:    await queryManager.save(id, buildSkillEntity(data));
src\resolver\backoffice\skill\SkillService.js-135-    invalidateDictionary(ENTITY);
src\resolver\backoffice\skill\SkillService.js-136-
--
src\resolver\backoffice\team\TeamService.js-98-/** ?? accountId ?? ? Jira ??? ? (UserService.userMap ???) */
--
src\resolver\backoffice\team\__test__\TeamLeadership.test.js-16-
--
src\resolver\backoffice\setting\SettingService.js-80-    };
src\resolver\backoffice\setting\SettingService.js-81-
src\resolver\backoffice\setting\SettingService.js:82:    await queryManager.save("settings", next);
src\resolver\backoffice\setting\SettingService.js-83-    invalidateDictionary(ENTITY);
src\resolver\backoffice\setting\SettingService.js-84-    return {content: {settings: next}};
--
src\resolver\backoffice\team\__test__\TeamService.test.js-33-jest.mock('../../../../nosql/query/CustomEntityManager', () => ({

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$targets = @('"'static/ui/src/pages/myWork/WorklogPage.jsx','static/ui/src/pages/myWork/utils/useMyWorklogList.js','static/ui/src/pages/myWork/utils/useMyWorklogSummary.js','static/ui/src/polling/jobPolling.js','static/ui/src/polling/JobPollingManager.jsx','static/ui/src/utils/queryKey/jiraKeys.js','static/ui/src/utils/useJiraUserInfos.js','static/ui/src/utils/jiraApi/users/getUserInfos.js'); foreach ("'$file in $targets) { Write-Output "--- $file"; $line=0; Get-Content $file | ForEach-Object { $line++; '"'{0,4}: {1}' -f "'$line, $_ } }' in C:\CloudJira\moves-workforce
 succeeded in 4501ms:
--- static/ui/src/pages/myWork/WorklogPage.jsx
   1: import React, {useEffect, useMemo, useRef, useState} from 'react';
   2: import {CustomFullCalendar} from "../../components/calendar/FullCalendar";
   3: import {WorklogModal} from "./modal/WorklogModal";
   4: import {STATUS_COLOR_MAP} from "../../constants/statusColorMap";
   5: import {invoke, Modal, view} from "@forge/bridge";
   6: import {Flex, Stack} from "@atlaskit/primitives/compiled";
   7: import {executeRequest} from "../../utils/jiraApi/requestJira";
   8: import {useI18nStore} from "../../stores/useI18nStore";
   9: import {token} from "@atlaskit/tokens";
  10: import PageContainer from "../../components/layout/PageContainer";
  11: import {
  12:     addDaysToDateString,
  13:     formatToHHmm,
  14:     getDateString,
  15:     getTimeISOString
  16: } from "../../utils/TimeUtils";
  17: import {MyLogSummary} from "./MyLogSummary";
  18: import {Box} from "@atlaskit/primitives";
  19: import MyProjectList from "./myProject/MyProjectList";
  20: import Card from "../../components/card/Card";
  21: import ResizablePanels, {Panel, PanelToggleButton} from "../../components/layout/ResizablePanels";
  22: import CalendarPlusIcon from "@atlaskit/icon/core/calendar-plus";
  23: import TasksIcon from "@atlaskit/icon/core/tasks";
  24: import DiagramSymbolActionIcon from "@atlaskit/icon-lab/core/diagram-symbol-action";
  25: import CalendarIcon from "@atlaskit/icon/core/calendar";
  26: import TableIcon from "@atlaskit/icon/core/table";
  27: import {ViewModeToggle} from "../../components/toggle/ViewModeToggle";
  28: import { useQuery, useQueryClient} from "@tanstack/react-query";
  29: import {useMyWorklogList} from "./utils/useMyWorklogList";
  30: import LoadingOverlay from "../../components/feedback/LoadingOverlay";
  31: import MyIssueTable from "./table/MyIssueTable";
  32: import {clipWorklogsToRange, useMyWorklogSummary} from "./utils/useMyWorklogSummary";
  33: import { getUserIssueIds} from "../../utils/jiraApi/issue/getJqlIssue";
  34: import {ScheduleModal} from "./modal/ScheduleModal";
  35: import {scheduleTypeOptions} from "../../constants/scheduleTypeOptions";
  36: import Button from "@atlaskit/button/new";
  37: import AddIcon from "@atlaskit/icon/core/add";
  38: import {usePublicHolidayList} from "../../utils/usePublicHolidayList";
  39: import {scheduleKeys, settingKeys} from '../../utils/queryKey/logicalAuditKeys';
  40: import {myWorkKeys} from '../../utils/queryKey/myWorkKeys';
  41: const context = await view.getContext()
  42: 
  43: export default function WorklogPage() {
  44:     const t = useI18nStore(s => s.t);
  45: 
  46:     const calendarRef = useRef(null);
  47: 
  48:     const queryClient = useQueryClient();
  49: 
  50:     const [viewMode, setViewMode] = useState("calendar");
  51:     const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  52:     const [projectCount, setProjectCount] = useState(0);
  53: 
  54:     const [dateRange, setDateRange] = useState({
  55:         start: new Date(),
  56:         end: new Date()
  57:     });
  58: 
  59:     // ?뚰겕濡쒓렇 紐⑤떖
  60:     const [isWorklogOpen, setIsWorklogOpen] = useState(false);
  61:     const [worklogInfo, setWorklogInfo] = useState(null);
  62: 
  63:     // ?쇱젙 紐⑤떖
  64:     const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  65:     const [scheduleInfo, setScheduleInfo] = useState(null);
  66: 
  67:     const [clickedDate, setClickedDate] = useState(null);
  68: 
  69:     const formatDate = (date) => getDateString(date);
  70: 
  71:     const startDate = formatDate(dateRange.start);
  72:     const endDate = formatDate(dateRange.end);
  73: 
  74:     const normalizedProjectIds = useMemo(
  75:         () => [...(selectedProjectIds ?? [])].sort(),
  76:         [selectedProjectIds]
  77:     );
  78:     // 1. ???뚰겕濡쒓렇 紐⑸줉 議고쉶 (?닿? ?묒꽦???뚰겕濡쒓렇留?
  79:     const {isLoading, myWorklogs,isFetching,coworkerFieldId}
  80:         = useMyWorklogList(
  81:             {
  82:                 context,
  83:                 selectedProjectIds:normalizedProjectIds,
  84:                 startDate,
  85:                 endDate,
  86:                 mine: true
  87:             });
  88: 
  89:     const {
  90:         data: myScheduleList,
  91:         isLoading: isScheduleLoading
  92:     } = useQuery({
  93:         queryKey: scheduleKeys.myList({startDate, endDate}),
  94:         queryFn: async () => {
  95:             const result = await invoke("getMyScheduleList", {
  96:                 startDate,
  97:                 endDate
  98:             });
  99:             if (!result?.success) {
 100:                 throw new Error(result?.error?.message ?? 'getMyScheduleList failed');
 101:             }
 102:             return result;
 103:         },
 104:         enabled: !!context?.accountId,
 105:         staleTime: 1000 * 60 * 5
 106:     });
 107: 
 108:     const summaryRange = useMemo(() => {
 109:         const now = new Date();
 110:         const start = new Date(now.getFullYear(), now.getMonth(), 1);
 111:         const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
 112:         return {
 113:             startDate: formatDate(start),
 114:             endDate: formatDate(end)
 115:         };
 116:     }, []);
 117: 
 118:     /*
 119:      * ?붿빟? ??罹섎┛??荑쇰━(1) 寃곌낵?먯꽌 ?뚯깮?쒕떎 ??媛숈? resolver(`getMyCalendarWorklog`)瑜?
 120:      * ?좎쭨 踰붿쐞留??щ━????踰?移섎뜕 寃껋쓣 湲곕낯 吏꾩엯?먯꽌 1?뚮줈 以꾩씤??
 121:      *
 122:      * 湲곕낯 ?곹깭??罹섎┛??媛??踰붿쐞???대쾲 ?ъ쓣 ?듭㎏濡??ы븿?섎뒗 6二?援ш컙?대씪 ?붿빟???꾩슂??
 123:      * ?뚰겕濡쒓렇媛 ?대? ???ㅼ뼱? ?덈떎. 罹섎┛?붾? ?ㅻⅨ ?щ줈 ?섍꺼 ?대쾲 ?ъ쓣 ??? 紐삵븯寃??섎㈃
 124:      * (??寃쎄퀎 ?? 洹몃븣留??붿빟 ?꾩슜 荑쇰━瑜?耳좊떎.
 125:      * ???좎쭨??紐⑤몢 'YYYY-MM-DD' 臾몄옄?댁씠???ъ쟾??鍮꾧탳媛 怨??좎쭨 鍮꾧탳??
 126:      */
 127:     const calendarCoversSummary = !!startDate && !!endDate
 128:         && startDate <= summaryRange.startDate
 129:         && endDate >= summaryRange.endDate;
 130: 
 131:     const {
 132:         myWorklogs: summaryWorklogs
 133:     } = useMyWorklogList({
 134:         context,
 135:         selectedProjectIds: normalizedProjectIds,
 136:         startDate: summaryRange.startDate,
 137:         endDate: summaryRange.endDate,
 138:         mine: true,
 139:         enabled: !calendarCoversSummary
 140:     });
 141: 
 142:     // 罹섎┛??寃곌낵瑜????뚮뒗 ?붿빟 踰붿쐞濡??섎씪 ?ｋ뒗???쒕쾭媛 ?붿빟 ?꾩슜 荑쇰━???섎뜕 寃껉낵 媛숈? ?꾪꽣).
 143:     // author쨌?꾨줈?앺듃 ?좏깮 議곌굔? (1)??mine:true + 媛숈? normalizedProjectIds ???숈씪?섎떎.
 144:     const summarySource = useMemo(
 145:         () => (calendarCoversSummary
 146:             ? clipWorklogsToRange(myWorklogs, summaryRange.startDate, summaryRange.endDate)
 147:             : summaryWorklogs),
 148:         [calendarCoversSummary, myWorklogs, summaryWorklogs, summaryRange]
 149:     );
 150: 
 151:     const summary = useMyWorklogSummary({
 152:         myWorklogs: summarySource
 153:     });
 154: 
 155:     const {data:issueCountData} =useQuery({
 156:         queryKey: myWorkKeys.issueIds(normalizedProjectIds),
 157:         enabled: !!selectedProjectIds?.length,
 158:         queryFn: () =>
 159:             getUserIssueIds({
 160:                 selectedProjectIds: normalizedProjectIds,
 161:                 accountId: context.accountId,
 162:                 coworker: true
 163:             }),
 164:         staleTime: 1000 * 60 * 5,
 165:     });
 166: 
 167:     const {data:settingData} = useQuery(
 168:         {
 169:             queryKey: settingKeys.detail(),
 170:             queryFn: async () =>{
 171:                 return await invoke('getSettingData')
 172:             },
 173:             staleTime: 1000 * 60 * 30
 174:         }
 175:     );
 176: 
 177:     const {data : holidayList , isLoading:isHolidayLoading} = usePublicHolidayList();
 178: 
 179:     const worklogEvents = useMemo(() => {
 180:         if (!myWorklogs?.data) return [];
 181: 
 182:         const hourRate = settingData?.hourRate || 8;
 183: 
 184:         return myWorklogs.data.flatMap(issue =>
 185:             issue.fields.worklog.worklogs.map(worklog => {
 186:                 const timeSpent = worklog.timeSpent || '';
 187:                 const isMultiDay = /\d+[dw]/.test(timeSpent); // w ?먮뒗 d ?쒖떇???덉쓣 ??泥섎━
 188: 
 189:                 if (isMultiDay) {
 190:                     const days = Math.round(worklog.timeSpentSeconds / (hourRate * 3600));
 191:                     if (days > 1) {
 192:                         const status = issue.fields?.status?.statusCategory;
 193:                         const color = STATUS_COLOR_MAP[status?.colorName] || STATUS_COLOR_MAP["medium-gray"];
 194:                         const startDateStr = worklog.started.substring(0, 10);
 195:                         const endDate = new Date(startDateStr);
 196:                         endDate.setDate(endDate.getDate() + days);
 197:                         const endDateStr = endDate.toISOString().substring(0, 10);
 198:                         return {
 199:                             start: startDateStr,
 200:                             end: endDateStr,
 201:                             allDay: true,
 202:                             backgroundColor: color.bg,
 203:                             borderColor: color.bg,
 204:                             textColor: color.text,
 205:                             extendedProps: { type: "worklog", issue, worklog }
 206:                         };
 207:                     }
 208:                 }
 209: 
 210:                 return {
 211:                     start: worklog.started,
 212:                     extendedProps: { type: "worklog", issue, worklog }
 213:                 };
 214:             })
 215:         );
 216: 
 217:     }, [myWorklogs, settingData]);
 218: 
 219:     const scheduleEvents = useMemo(() => {
 220: 
 221:         const events = makeScheduleEvents(
 222:             myScheduleList?.data || []
 223:         );
 224: 
 225:         return events.map(event => ({
 226:             ...event,
 227:             extendedProps: {
 228:                 ...event.extendedProps,
 229:                 type: "schedule"
 230:             }
 231:         }));
 232: 
 233:     }, [myScheduleList]);
 234: 
 235:     const holidayEvents = useMemo(() => {
 236:         return makeHolidayEvents(holidayList || []);
 237:     }, [holidayList]);
 238: 
 239:     const holidayDates = useMemo(() => {
 240:         return new Set((holidayList || []).map(h => h.holidayDate));
 241:     }, [holidayList]);
 242: 
 243:     const mergedEvents = useMemo(() => {
 244: 
 245:         return [
 246:             ...worklogEvents,
 247:             ...scheduleEvents,
 248:             ...holidayEvents
 249:         ];
 250: 
 251:     }, [worklogEvents, scheduleEvents, holidayEvents]);
 252: 
 253: 
 254:     const onEventClick = async (eventInfo) => {
 255: 
 256:         const {type} = eventInfo.event.extendedProps;
 257: 
 258:         // ?뚰겕濡쒓렇
 259:         if (type === "worklog") {
 260:             setWorklogInfo({
 261:                 ...eventInfo.event.extendedProps
 262:             });
 263:             setIsWorklogOpen(true);
 264: 
 265:             return;
 266:         }
 267: 
 268:         // ?쇱젙
 269:         if (type === "schedule") {
 270:             const {schedule} = eventInfo.event.extendedProps;
 271:             setScheduleInfo(schedule);
 272:             setIsScheduleOpen(true);
 273: 
 274:             return;
 275:         }
 276:     };
 277: 
 278:     const onDateClick = (dateInfo) => {
 279:         setClickedDate(dateInfo.dateStr);
 280:         setWorklogInfo(null);
 281:         setIsWorklogOpen(true);
 282:     };
 283: 
 284:     //?좎쭨 踰붿쐞 蹂寃?
 285:     const onDatesSetChange = (data) => {
 286: 
 287:         setDateRange({
 288:             start: data.start,
 289:             end: data.end
 290:         });
 291:     };
 292:     //Worklog Drag
 293:     const onEventDrop = async (eventInfo) => {
 294:         const {event} = eventInfo;
 295:         const {type} = event.extendedProps;
 296:         // ?쇱젙? ?쒕옒洹??덊븿
 297:         if (type !== "worklog") {
 298:             eventInfo.revert();
 299:             return;
 300:         }
 301:         const pathParams = {
 302:             issueIdOrKey: event.extendedProps.issue.key,
 303:             id: event.extendedProps.worklog.id
 304:         }
 305:         const started = getTimeISOString(getDateString(event.start),
 306:             formatToHHmm(new Date(event.extendedProps.worklog.started)), context.timezone)
 307:         const params = {
 308:             started: started,
 309:         }
 310:         const result = await executeRequest('updateWorklog', params, pathParams);
 311:         // executeRequest ???ㅽ뙣 ??{success:false} 諛섑솚 ???ㅽ뙣硫??쒕옒洹몃? ?먯쐞移섎줈 ?섎룎由곕떎(沅뚰븳 嫄곕? ?ы븿)
 312:         if (result?.success === false) {
 313:             eventInfo.revert();
 314:             return;
 315:         }
 316:         // 耳덈┛?붾쭔 ?몃꺼由щ뱶
 317:         await queryClient.invalidateQueries({
 318:             queryKey: myWorkKeys.calendarWorklogs(normalizedProjectIds, startDate, endDate)
 319:         });
 320:         event.setExtendedProp('worklog', result)
 321:     };
 322:     /*
 323:     * 紐⑤떖
 324:     * */
 325:     const closeWorklogModal = () => {
 326:         setIsWorklogOpen(false);
 327:         setWorklogInfo(null);
 328:     };
 329: 
 330:     const closeScheduleModal = () => {
 331:         setIsScheduleOpen(false);
 332:         setScheduleInfo(null);
 333:     };
 334: 
 335:     const submitWorklogModal = async () => {
 336:         closeWorklogModal();
 337:         await queryClient.invalidateQueries({queryKey: myWorkKeys.calendarWorklogsAll});
 338:         await queryClient.invalidateQueries({queryKey: myWorkKeys.projectWorklogsAll});
 339:     };
 340: 
 341:     const submitScheduleModal = async () => {
 342:         await queryClient.invalidateQueries({queryKey: scheduleKeys.all});
 343:         closeScheduleModal();
 344:     };
 345: 
 346:     return (
 347:         <PageContainer>
 348:             <Stack space="space.200">
 349:                 <MyLogSummary
 350:                     projectCount={projectCount}
 351:                     summary={summary}
 352:                     issueCount={issueCountData}
 353:                     settingData={settingData}
 354:                     holidayList={holidayList}
 355:                 />
 356: 
 357:                 {/*
 358:                   * 蹂몃Ц ?믪씠 ??`85vh` 怨좎젙?대뜕 寃껋쓣 **?꾩뿉????留뚰겮 類 媛?*?쇰줈 諛붽씔??
 359:                   *
 360:                   * 85vh ??酉고룷?몄쓽 85% 瑜???긽 ?붽뎄?섎뒗?? 洹??꾩뿉 ?대?
 361:                   *   app-main ?⑤뵫 48 + KPI ???~63 + Stack 媛꾧꺽 16 ??127px
 362:                   * ???뱁? ?덉뼱 ?⑹씠 100vh 瑜??섏뿀?????섏씠吏 ?ㅽ겕濡ㅼ씠 ?앷린怨?
 363:                   * 洹??덉뿉??罹섎┛?붽? ???ㅽ겕濡ㅻ뤌 ?댁쨷 ?ㅽ겕濡ㅼ씠 ?먮떎.
 364:                   *
 365:                   * ???곸닔 127 ? ????媛믪쓽 ?⑹씠?? ?곷떒 援ъ꽦??諛붾뚮㈃ 媛숈씠 ?먮킄???쒕떎.
 366:                   *   理쒖냼 ?믪씠瑜??ъ꽌 ?묒? ?붾㈃?먯꽌 罹섎┛?붽? 萸됯컻吏吏 ?딄쾶 ?쒕떎.
 367:                   */}
 368:                 {/*
 369:                   * 醫뚯슦 遺꾪븷? 怨듭슜 <ResizablePanels> ?뚯쑀(?묎린쨌?쒕옒洹??덈퉬 議곗젅쨌localStorage).
 370:                   * ??醫낆쟾 <Inline> + xcss({flex:'2'/'8'}) ??**raw flex 媛믪씠 議곗슜??臾댁떆**??
 371:                   *   ?ㅼ젣濡쒕뒗 2:8 ???꾨땲??hug + ?묐걹 ?뺣젹?댁뿀?? ?댁젣 肄붾뱶媛 ?섎룄??20:80 ???곸슜?쒕떎.
 372:                   */}
 373:                 <ResizablePanels
 374:                     storageKey="myWork.panels.layout"
 375:                     height="calc(100vh - 127px)"
 376:                     minHeight={520}
 377:                 >
 378:                     {/* ?꾨줈?앺듃 */}
 379:                     <Panel
 380:                         id="projects"
 381:                         title={t('worklog.layout.project')}
 382:                         defaultWeight={20}
 383:                         minWidth={260}
 384:                     >
 385:                         <Card
 386:                             title={t('worklog.layout.project')}
 387:                             headerRight={<PanelToggleButton panelId="projects" />}
 388:                         >
 389:                             <MyProjectList
 390:                                 context={context}
 391:                                 selectedProjectIds={selectedProjectIds}
 392:                                 onSelectProjects={setSelectedProjectIds}
 393:                                 onTotalCountChange={setProjectCount}
 394:                             />
 395:                         </Card>
 396:                     </Panel>
 397: 
 398:                     {/* 硫붿씤 */}
 399:                     <Panel
 400:                         id="main"
 401:                         title={t('worklog.layout.task')}
 402:                         defaultWeight={80}
 403:                         minWidth={880}
 404:                     >
 405:                         <Card title={t('worklog.layout.task')} headerRight={
 406:                                 <>
 407:                                     <ViewModeToggle
 408:                                         viewMode={viewMode}
 409:                                         onChange={(mode) => {
 410:                                             setViewMode(mode);
 411:                                         }}
 412:                                         items={[
 413:                                             {mode: "calendar", icon: <CalendarIcon label="" />, label: t('worklog.button.calender')},
 414:                                             {mode: "table", icon: <TableIcon label="" />, label: t('worklog.button.table')},
 415:                                         ]}
 416:                                     />
 417:                                     <PanelToggleButton panelId="main" />
 418:                                 </>
 419:                             }
 420:                         >
 421:                             {viewMode === "calendar" && (
 422:                                 <Box style={{flexShrink: 0, marginBottom: 8, display: "flex",
 423:                                     justifyContent: "space-between", alignItems: "center",gap: 12, flexWrap: "wrap"}}>
 424:                                     {/*
 425:                                       * 議곗옉 ?덈궡 ??留ㅼ씪 ?곕뒗 ?붾㈃?대씪 **?쏀엳??二쇱옣?섏? ?딄쾶** ?ㅼ쓣 ??텣??
 426:                                       * ?덉쟾???쒕ぉ??援듦쾶 ?섍퀬 肄쒕줎?쇰줈 ?댁뼱 遺숈뿬(`**?좎쭨 ?대┃**: ?뚰겕濡쒓렇 異붽?)
 427:                                       * ???⑹뼱由ш? 蹂몃Ц泥섎읆 ?쏀삍?? ?꾩씠肄샕룰??먮? 媛숈? ?ㅼ쑝濡??뺥엳怨?
 428:                                       * ??ぉ ?ъ씠???щ갚?쇰줈留?媛瑜몃떎.
 429:                                       */}
 430:                                     <Box style={{
 431:                                         display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
 432:                                         fontSize: 12, color: token("color.text.subtlest", "#8993A4"),
 433:                                     }}>
 434:                                         {[
 435:                                             [CalendarPlusIcon, 'worklog.guide.date'],
 436:                                             [TasksIcon, 'worklog.guide.issue'],
 437:                                             [DiagramSymbolActionIcon, 'worklog.guide.item'],
 438:                                         ].map(([Icon, key]) => (
 439:                                             <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
 440:                                                 <Icon label="" size="small" color="currentColor" />
 441:                                                 {t(`${key}.title`)} 쨌 {t(`${key}.description`)}
 442:                                             </span>
 443:                                         ))}
 444:                                     </Box>
 445: 
 446:                                     {/*
 447:                                       * ?깅줉 吏꾩엯????媛?
 448:                                       * 罹섎┛???좎쭨瑜??대┃?대룄 ?뚰겕濡쒓렇瑜??????덉?留?洹멸굔 **?뚯븘??蹂댁씠??湲?*?대씪,
 449:                                       * ???붾㈃??二??됰룞(?뚰겕濡쒓렇 ?깅줉)? 踰꾪듉?쇰줈???몃떎.
 450:                                       * ?좎쭨 ?놁씠 ?꾨Ⅴ硫?紐⑤떖???ㅻ뒛濡??곕떎(`onDateClick` 怨?媛숈? ?곹깭 珥덇린??.
 451:                                       */}
 452:                                     {/* ?깃꺽???ㅻⅨ ???깅줉(?묒뾽 湲곕줉 / 媛쒖씤 ?쇱젙)?대씪 遺숈뿬 ?먯? ?딅뒗??
 453:                                         ??gap ? space ?좏겙留?諛쏅뒗????'gap.200' 媛숈? 媛믪? 議곗슜??臾댁떆??媛꾧꺽??0 ???쒕떎. */}
 454:                                     <Flex gap="space.100">
 455:                                         <Button
 456:                                             iconBefore={AddIcon}
 457:                                             appearance="primary"
 458:                                             onClick={() => {
 459:                                                 setClickedDate(getDateString(new Date()));
 460:                                                 setWorklogInfo(null);
 461:                                                 setIsWorklogOpen(true);
 462:                                             }}
 463:                                         >
 464:                                             {t('worklog.button.addWorklog')}
 465:                                         </Button>
 466: 
 467:                                         <Button
 468:                                             iconBefore={AddIcon}
 469:                                             onClick={() => {
 470:                                                 setClickedDate(null);
 471:                                                 setScheduleInfo(null);
 472:                                                 setIsScheduleOpen(true);
 473:                                             }}
 474:                                         >
 475:                                             {t('worklog.button.addSchedule')}
 476:                                         </Button>
 477:                                     </Flex>
 478: 
 479:                                 </Box>
 480:                             )}
 481: 
 482:                             <LoadingOverlay isLoading={isLoading || isFetching || isScheduleLoading}>
 483:                                 <Box
 484:                                     style={{
 485:                                         flex: "1 1 auto",
 486:                                         minHeight: 0,
 487:                                         height: '100%',
 488:                                         overflow: viewMode === "calendar" ? 'hidden' : 'auto'
 489:                                     }}
 490:                                 >
 491:                                     {viewMode === "calendar" ? (
 492:                                         <CustomFullCalendar
 493:                                             context={context}
 494:                                             event={mergedEvents}
 495:                                             onEventClick={onEventClick}
 496:                                             onDatesSetChange={onDatesSetChange}
 497:                                             calendarRef={calendarRef}
 498:                                             onEventDrop={onEventDrop}
 499:                                             onDateClick={onDateClick}
 500:                                             holidayDates={holidayDates}
 501:                                             settingData={settingData}
 502:                                         />
 503:                                     ) : (
 504:                                         <MyIssueTable
 505:                                             context={context}
 506:                                             selectedProjectIds={normalizedProjectIds}
 507:                                             onWorklogClick={(worklog) => {
 508:                                                 setWorklogInfo(worklog);
 509:                                                 setIsWorklogOpen(true);
 510:                                             }}
 511:                                             settingData={settingData}
 512:                                         />
 513:                                     )}
 514:                                 </Box>
 515:                             </LoadingOverlay>
 516:                         </Card>
 517:                     </Panel>
 518:                 </ResizablePanels>
 519:             </Stack>
 520: 
 521:             {/* Worklog Modal */}
 522:             <WorklogModal
 523:                 selectedProjectIds={normalizedProjectIds}
 524:                 isOpen={isWorklogOpen}
 525:                 closeModal={closeWorklogModal}
 526:                 worklogInfo={worklogInfo}
 527:                 submitModal={submitWorklogModal}
 528:                 clickedDate={clickedDate}
 529:                 coworkerFieldId={coworkerFieldId}
 530:                 settingData={settingData}
 531:                 holidayDates={holidayDates}
 532:                 myScheduleList={myScheduleList?.data}
 533:             />
 534: 
 535:             {/* Schedule Modal */}
 536:             <ScheduleModal
 537:                 isOpen={isScheduleOpen}
 538:                 closeModal={closeScheduleModal}
 539:                 submitModal={submitScheduleModal}
 540:                 clickedDate={clickedDate}
 541:                 scheduleInfo={scheduleInfo}
 542:             />
 543:         </PageContainer>
 544:     );
 545: }
 546: 
 547: export const makeHolidayEvents = (holidayList = []) => {
 548:     return holidayList.map(holiday => ({
 549:         id: holiday.id,
 550:         title: holiday.name,
 551:         start: holiday.holidayDate,
 552:         allDay: true,
 553:         display: "block",
 554:         backgroundColor: "transparent",
 555:         borderColor: "transparent",
 556:         extendedProps: {
 557:             type: "holiday",
 558:         }
 559:     }));
 560: };
 561: 
 562: export const makeScheduleEvents = (scheduleData = []) => {
 563: 
 564:     const typeMap = new Map(
 565:         scheduleTypeOptions.map(v => [v.value, v])
 566:     );
 567: 
 568:     return scheduleData.map(schedule => {
 569: 
 570:         const typeInfo = typeMap.get(schedule.schedule_type);
 571: 
 572:         return {
 573:             id: schedule.schedule_id,
 574:             title: typeInfo?.label || schedule.schedule_type,
 575:             start: schedule.schedule_start_date,
 576:             // ??κ컪? inclusive, allDay ?대깽?몄쓽 end ??exclusive ??+1??蹂댁젙?댁빞 醫낅즺?쇨퉴吏 洹몃젮吏꾨떎
 577:             end: addDaysToDateString(schedule.schedule_end_date, 1),
 578:             allDay: true,
 579:             backgroundColor: typeInfo?.backgroundColor,
 580:             borderColor: typeInfo?.backgroundColor,
 581:             textColor: typeInfo?.color,
 582: 
 583:             extendedProps: {
 584:                 type: "schedule",
 585:                 schedule,
 586:                 typeInfo
 587:             }
 588:         };
 589:     });
 590: };
--- static/ui/src/pages/myWork/utils/useMyWorklogList.js
   1: import {keepPreviousData, useQuery} from "@tanstack/react-query";
   2: import {invoke} from "@forge/bridge";
   3: import {CustomFieldId, getCustomFieldId} from "../../../constants/customField";
   4: import {jiraKeys} from "../../../utils/queryKey/jiraKeys";
   5: import {myWorkKeys} from "../../../utils/queryKey/myWorkKeys";
   6: 
   7: // enabled: ?몄텧遺媛 "??踰붿쐞???ㅻⅨ 荑쇰━ 寃곌낵濡??泥?媛???대씪怨??먮떒?덉쓣 ???꾨뒗 ?ㅼ쐞移?
   8: // 湲곕낯媛?true ??湲곗〈 ?몄텧遺???숈옉? 洹몃?濡쒕떎.
   9: export const useMyWorklogList = ({context, selectedProjectIds, startDate, endDate, mine = false, enabled = true}) =>{
  10: 
  11:     const { data: coworkerFieldId, isLoading: isCoworkerFieldLoading } = useQuery({
  12:         queryKey: jiraKeys.coworkerField(),
  13:         queryFn: () => getCustomFieldId(CustomFieldId.coworkerIdField),
  14:         staleTime: 1000 * 60 * 30,
  15:     });
  16: 
  17:     // mine=true: ?닿? ?묒꽦???뚰겕濡쒓렇留?(罹섎┛???꾩슜) / false: ?대떦/?묒뾽 ?댁뒋 湲곗? (?뚯씠釉붋룹슂??
  18:     const resolverName = mine ? 'getMyCalendarWorklog' : 'getProjectWorklog';
  19: 
  20:     // ??議곌굔 ?꾨줈?앺듃 ?꾩씠???쒖옉??醫낅즺??
  21:     const { data: myWorklogs, isLoading,isFetching} = useQuery({
  22:         queryKey: myWorkKeys.worklogList(resolverName, selectedProjectIds, startDate, endDate),
  23:         queryFn: async () =>
  24:             invoke(resolverName, {
  25:                 accountId: context.accountId,
  26:                 selectedProjectIds,
  27:                 ...(startDate && endDate ? { startDate, endDate } : {}),
  28:                 coworkerFieldId
  29:             }),
  30:         enabled: enabled && !!context?.accountId && (selectedProjectIds?.length ?? 0) > 0 && !isCoworkerFieldLoading,
  31:         placeholderData: keepPreviousData,
  32:         staleTime: 1000 * 60, // 吏㏐쾶 ?ㅼ젙
  33:     });
  34: 
  35:     //console.log(":: [getProjectWorklog] ::",myWorklogs);
  36: 
  37:     return {
  38:         isLoading,
  39:         myWorklogs,
  40:         isFetching,
  41:         coworkerFieldId
  42:     };
  43: }
--- static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
   1: import {useMemo} from "react";
   2: 
   3: /**
   4:  * ?뚰겕濡쒓렇 ?묐떟???좎쭨 踰붿쐞(inclusive)濡??섎씪 ?몃떎.
   5:  *
   6:  * ?붿빟??罹섎┛??荑쇰━ 寃곌낵?먯꽌 ?뚯깮?????대떎. ?쒕쾭(`MyWorkService.processMyIssue`)??
   7:  * ?붿껌 踰붿쐞濡??뚰겕濡쒓렇瑜??대? 嫄몃윭 二쇰?濡? ???볦? 罹섎┛??踰붿쐞 寃곌낵瑜?洹몃?濡??섍린硫?
   8:  * ??寃쎄퀎??嫄몄튇 二??? ?⑷퀎媛 醫낆쟾 媛믨낵 ?щ씪吏꾨떎. 媛숈? 踰붿쐞濡??섎씪 ?쒖떆 媛믪쓣 蹂댁〈?쒕떎.
   9:  * ?좎쭨??'YYYY-MM-DD' ??臾몄옄??鍮꾧탳媛 怨??좎쭨 鍮꾧탳??
  10:  */
  11: export const clipWorklogsToRange = (myWorklogs, startDate, endDate) => {
  12: 
  13:     if (!myWorklogs?.data || !startDate || !endDate) return myWorklogs;
  14: 
  15:     const data = [];
  16: 
  17:     myWorklogs.data.forEach(issue => {
  18: 
  19:         const worklog = issue.fields?.worklog;
  20:         const worklogs = worklog?.worklogs;
  21: 
  22:         if (!worklogs?.length) return;
  23: 
  24:         const filtered = worklogs.filter(wl => {
  25:             const day = wl?.started?.substring(0, 10);
  26:             return !!day && day >= startDate && day <= endDate;
  27:         });
  28: 
  29:         if (!filtered.length) return;
  30: 
  31:         data.push({
  32:             ...issue,
  33:             fields: {
  34:                 ...issue.fields,
  35:                 worklog: {...worklog, worklogs: filtered}
  36:             }
  37:         });
  38:     });
  39: 
  40:     return {...myWorklogs, data};
  41: };
  42: 
  43: export const useMyWorklogSummary = ({myWorklogs}) => {
  44: 
  45:     return useMemo(() => {
  46: 
  47:         if (!myWorklogs?.data) {
  48:             return {
  49:                 todaySeconds: 0,
  50:                 weekSeconds: 0,
  51:                 monthSeconds: 0,
  52:             };
  53:         }
  54: 
  55:         const now = new Date();
  56: 
  57:         // ?ㅻ뒛
  58:         const todayStart = new Date(now);
  59:         todayStart.setHours(0, 0, 0, 0);
  60: 
  61:         const todayEnd = new Date(now);
  62:         todayEnd.setHours(23, 59, 59, 999);
  63: 
  64:         // ?대쾲二?(?붿슂???쒖옉)
  65:         const weekStart = new Date(now);
  66:         const day = weekStart.getDay();
  67: 
  68:         const diff = day === 0 ? -6 : 1 - day;
  69: 
  70:         weekStart.setDate(weekStart.getDate() + diff);
  71:         weekStart.setHours(0, 0, 0, 0);
  72: 
  73:         const weekEnd = new Date(weekStart);
  74:         weekEnd.setDate(weekStart.getDate() + 6);
  75:         weekEnd.setHours(23, 59, 59, 999);
  76: 
  77:         // ?대쾲??
  78:         const monthStart = new Date(
  79:             now.getFullYear(),
  80:             now.getMonth(),
  81:             1
  82:         );
  83: 
  84:         const monthEnd = new Date(
  85:             now.getFullYear(),
  86:             now.getMonth() + 1,
  87:             0
  88:         );
  89: 
  90:         monthEnd.setHours(23, 59, 59, 999);
  91: 
  92:         let todaySeconds = 0;
  93:         let weekSeconds = 0;
  94:         let monthSeconds = 0;
  95: 
  96:         myWorklogs.data.forEach(issue => {
  97: 
  98:             issue.fields?.worklog?.worklogs?.forEach(worklog => {
  99: 
 100:                 const started = new Date(worklog.started);
 101:                 const seconds = worklog.timeSpentSeconds || 0;
 102: 
 103:                 // ?ㅻ뒛
 104:                 if (started >= todayStart && started <= todayEnd) {
 105:                     todaySeconds += seconds;
 106:                 }
 107: 
 108:                 // ?대쾲二?
 109:                 if (started >= weekStart && started <= weekEnd) {
 110:                     weekSeconds += seconds;
 111:                 }
 112: 
 113:                 // ?대쾲??
 114:                 if (started >= monthStart && started <= monthEnd) {
 115:                     monthSeconds += seconds;
 116:                 }
 117: 
 118:             });
 119:         });
 120: 
 121:         return {
 122:             todaySeconds,
 123:             weekSeconds,
 124:             monthSeconds,
 125:         };
 126: 
 127:     }, [myWorklogs]);
 128: };
--- static/ui/src/polling/jobPolling.js
   1: export const TERMINAL_JOB_STATUSES = new Set(['COMPLETED', 'PARTIAL', 'FAILED']);
   2: export const MAX_CONSECUTIVE_POLL_FAILURES = 3;
   3: export const POLL_INTERVAL_MS = 3000;
   4: export const MAX_POLL_BACKOFF_MS = 30000;
   5: 
   6: /** ?곗냽 ?ㅽ뙣 ?잛닔???곕Ⅸ exponential backoff. 理쒕? 30珥덈줈 ?쒗븳?쒕떎. */
   7: export const getPollingRetryDelay = (consecutiveFailures) => Math.min(
   8:     POLL_INTERVAL_MS * (2 ** Math.max(0, consecutiveFailures - 1)),
   9:     MAX_POLL_BACKOFF_MS,
  10: );
  11: 
  12: /**
  13:  * `getUploadJobStatus`???쒖? resolver envelope瑜??댁꽍?쒕떎.
  14:  *
  15:  * `job:null`? ?쒕쾭???묒뾽???녿떎???뺤긽 ?묐떟?대떎. 諛섎㈃ content/job ?꾨뱶媛 鍮좎쭊
  16:  * ?깃났 ?묐떟? 怨꾩빟 ?꾨컲?대?濡?transient ?ㅻ쪟濡?痍④툒?댁빞 local tracking???ｋ텋由?
  17:  * 吏?곗? ?딅뒗??
  18:  */
  19: export const readJobFromResponse = (result) => {
  20:     if (!result?.success) {
  21:         const error = new Error(result?.error?.message ?? 'getUploadJobStatus failed');
  22:         error.code = result?.error?.code;
  23:         throw error;
  24:     }
  25:     if (!result.content || !Object.prototype.hasOwnProperty.call(result.content, 'job')) {
  26:         throw new Error('getUploadJobStatus returned an invalid response shape');
  27:     }
  28:     return result.content.job;
  29: };
  30: 
  31: export const isTerminalJob = (job) => TERMINAL_JOB_STATUSES.has(job?.status);
  32: 
  33: /**
  34:  * 諛깃렇?쇱슫????씠硫??대쭅 ?깆쓣 嫄대꼫?대떎.
  35:  * React Query ?대쭅??`focusManager` 濡?諛깃렇?쇱슫?쒖뿉???먮룞 ?뺤??섎뒗 寃껉낵 媛숈? 寃쎄퀎瑜?
  36:  * raw setInterval 寃쎈줈?먮룄 留욎텣?? ??씠 ?ㅼ떆 蹂댁씠硫?利됱떆 1???대쭅???④? 以??앸궃 job ???뚯닔?쒕떎.
  37:  */
  38: export const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden === true;
--- static/ui/src/polling/JobPollingManager.jsx
   1: import { useEffect, useRef, useState } from 'react';
   2: import { invoke } from '@forge/bridge';
   3: import {useJobStore} from "../stores/useJobStore";
   4: import {useI18nStore} from "../stores/useI18nStore";
   5: import {userKeys} from "../utils/queryKey/userKeys";
   6: import {useQueryClient} from "@tanstack/react-query";
   7: import {
   8:     isDocumentHidden,
   9:     isTerminalJob,
  10:     MAX_CONSECUTIVE_POLL_FAILURES,
  11:     POLL_INTERVAL_MS,
  12:     getPollingRetryDelay,
  13:     readJobFromResponse,
  14: } from './jobPolling';
  15: 
  16: export default function JobPollingManager({toast }) {
  17:     const intervalsRef = useRef(new Map());
  18:     const failuresRef = useRef(new Map());
  19:     const inFlightRef = useRef(new Set());
  20:     const nextPollAtRef = useRef(new Map());
  21:     const pollJobRef = useRef(null);
  22:     const t = useI18nStore(s => s.t);
  23:     const queryClient = useQueryClient();
  24:     const [initialized, setInitialized] = useState(false);
  25: 
  26:     const { jobIds, forgetJob, cleanupJob, init } = useJobStore();
  27: 
  28:     useEffect(() => {
  29:         init();
  30:         setInitialized(true);
  31:     }, []);
  32: 
  33: 
  34:     // initialized ???댄썑?먮쭔 ?대쭅 ?쒖옉
  35:     useEffect(() => {
  36:         if (!initialized) return;
  37:         jobIds.forEach(startPolling);
  38:     }, [jobIds, initialized]);
  39: 
  40:     // 而댄룷?뚰듃 ?몃쭏?댄듃 ??紐⑤뱺 ?명꽣踰??뺣━
  41:     useEffect(() => {
  42:         return () => {
  43:             intervalsRef.current.forEach((intervalId) => clearInterval(intervalId));
  44:             intervalsRef.current.clear();
  45:         };
  46:     }, []);
  47: 
  48:     // ??씠 ?ㅼ떆 蹂댁씠硫??④? 以?嫄대꼫??留뚰겮??利됱떆 1???대쭅?쇰줈 留뚰쉶?쒕떎.
  49:     // (?④? 以??꾨즺??job ??蹂듦? ???꾨씫?섏? ?딅뒗 蹂댁옣? ??利됱떆 1?뚮떎.)
  50:     useEffect(() => {
  51:         const onVisibilityChange = () => {
  52:             if (isDocumentHidden()) return;
  53:             // pollJob ??stopPolling ?쇰줈 Map ??吏?????덉쑝誘濡??ㅻ? 癒쇱? ?ㅻ깄?룻븳??
  54:             [...intervalsRef.current.keys()].forEach((jobId) => pollJobRef.current?.(jobId));
  55:         };
  56:         document.addEventListener('visibilitychange', onVisibilityChange);
  57:         return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  58:     }, []);
  59: 
  60:     // ?대쭅 1?? interval 怨?visibilitychange 蹂듦?媛 媛숈? 蹂몃Ц??怨듭쑀?쒕떎.
  61:     const pollJob = async (jobId) => {
  62:         if (Date.now() < (nextPollAtRef.current.get(jobId) ?? 0)) return;
  63:         if (inFlightRef.current.has(jobId)) return;
  64:         inFlightRef.current.add(jobId);
  65:         try {
  66:             const result = await invoke('getUploadJobStatus', { jobId });
  67:             const job = readJobFromResponse(result);
  68:             failuresRef.current.set(jobId, 0);
  69:             nextPollAtRef.current.delete(jobId);
  70: 
  71:             if (job === null) {
  72:                 stopPolling(jobId);
  73:                 forgetJob(jobId);
  74:                 return;
  75:             }
  76: 
  77:             const { total, processed, failed, status } = job;
  78: 
  79:             if (isTerminalJob(job)) {
  80:                 stopPolling(jobId);
  81:                 if (status === 'COMPLETED') {
  82:                     toast.showSuccess(
  83:                         `${t('common.upload.success')} (${processed}/${total})`
  84:                     );
  85:                 } else if (status === 'PARTIAL') {
  86:                     toast.showInfo(
  87:                         `${t('common.upload.partial')} (${failed})`
  88:                     );
  89:                 } else {
  90:                     toast.showError(
  91:                         t('common.upload.finishedWithStatus')
  92:                     );
  93:                 }
  94: 
  95:                 await cleanupJob(jobId); // terminal ?뺤씤 ?꾩뿉留?server + local ?뺣━
  96: 
  97:                 // ?꾨즺 ?쒖젏??紐⑸줉 媛깆떊
  98:                 queryClient.invalidateQueries({ queryKey: userKeys.lists() });
  99:                 // ?ㅽ뙣 紐⑸줉??媛깆떊 (PARTIAL??寃쎌슦 failList???볦엫)
 100:                 queryClient.invalidateQueries({ queryKey: userKeys.failList() });
 101:             }
 102:         } catch (e) {
 103:             console.error(e);
 104:             const failures = (failuresRef.current.get(jobId) ?? 0) + 1;
 105:             failuresRef.current.set(jobId, failures);
 106:             nextPollAtRef.current.set(jobId, Date.now() + getPollingRetryDelay(failures));
 107: 
 108:             // ?쇱떆?곸씤 resolver/transport ?ㅽ뙣 ?쒕몢 踰덉쑝濡?server job怨?local 異붿쟻??
 109:             // 吏?곗? ?딅뒗?? ??踰??곗냽 ?ㅽ뙣?덉쓣 ????踰덈쭔 ?뚮━怨?backoff polling? ?좎??쒕떎.
 110:             if (failures === MAX_CONSECUTIVE_POLL_FAILURES) {
 111:                 // ?뚮┝? ?꾧퀎移??꾨떖 ????踰덈쭔 ?닿퀬 polling/local tracking? ?좎??쒕떎.
 112:                 // ?ㅼ쓬 ?깃났 ?묐떟???ㅽ뙣 ?잛닔瑜?0?쇰줈 ?섎룎由щŉ, server cleanup? terminal?먯꽌留??쒕떎.
 113:                 toast.showError(t('common.upload.error'));
 114:             }
 115:         } finally {
 116:             inFlightRef.current.delete(jobId);
 117:         }
 118:     };
 119: 
 120:     // interval쨌visibilitychange ?묒そ????긽 理쒖떊 ?뚮뜑??pollJob ??蹂닿쾶 ?쒕떎.
 121:     pollJobRef.current = pollJob;
 122: 
 123:     const startPolling = (jobId) => {
 124:         if (intervalsRef.current.has(jobId)) return; // 以묐났 諛⑹?
 125:         toast.showInfo(t('common.upload.start')); // ?ㅼ젣濡??덈줈 ?쒖옉?섎뒗 jobId?먮쭔 ?ㅽ뻾??
 126: 
 127:         const intervalId = setInterval(() => {
 128:             // 諛깃렇?쇱슫????뿉?쒕뒗 ?깆쓣 嫄대꼫?대떎. 二쇨린쨌backoff쨌?꾨즺 ?먯젙? 洹몃?濡??먭퀬
 129:             // ?몄텧留??섏? ?딅뒗????蹂듦? ??visibilitychange 媛 利됱떆 1???대쭅?쒕떎.
 130:             if (isDocumentHidden()) return;
 131:             pollJobRef.current?.(jobId);
 132:         }, POLL_INTERVAL_MS);
 133: 
 134:         intervalsRef.current.set(jobId, intervalId);
 135:     };
 136: 
 137:     const stopPolling = (jobId) => {
 138:         const intervalId = intervalsRef.current.get(jobId);
 139:         if (intervalId) clearInterval(intervalId);
 140:         intervalsRef.current.delete(jobId);
 141:         inFlightRef.current.delete(jobId);
 142:         nextPollAtRef.current.delete(jobId);
 143:     };
 144: 
 145:     return null;
 146: }
--- static/ui/src/utils/queryKey/jiraKeys.js
   1: // Jira ?먯껜 ?곗씠??沅뚰븳) 議고쉶 荑쇰━??????resolver 媛 ?꾨땶 requestJira 吏곸젒 ?몄텧??
   2: export const jiraKeys = {
   3:     userMap: (accountIds) => ['userMap', accountIds],
   4:     /*
   5:      * ?ъ슜???쒖떆?뺣낫 罹먯떆??**?щ엺 ?⑥쐞**媛 ?⑥씪 異쒖쿂??`userInfo`).
   6:      * `userInfos` ??"???몄텧遺媛 ?붽뎄??吏묓빀"???뉗? ?섑띁 ??諛섑솚 諛곗뿴??李몄“ ?덉젙?깅쭔 ?대떦?섍퀬,
   7:      * ?ㅼ젣 ?뺣났 ?щ???媛쒖씤 ?뷀듃由ъ쓽 ?좎꽑?꾧? ?뺥븳??P1-14).
   8:      */
   9:     userInfo: (accountId) => ['jiraUserInfo', accountId],
  10:     userInfos: (accountIds) => ['jiraUserInfos', accountIds],
  11:     coworkerField: () => ['coworkerFieldId'],
  12:     // ?몄텧 ?ъ슜?먯쓽 Jira ?꾨줈?앺듃 沅뚰븳 "getMyPermissions"
  13:     myPermissions: (projectKey) => ['jiraMyPermissions', projectKey],
  14: };
--- static/ui/src/utils/useJiraUserInfos.js
   1: import {executeRequest} from "./jiraApi/requestJira";
   2: 
   3: /*
   4:  * Jira ?ъ슜??bulk 議고쉶??**?⑥씪 異쒖쿂**.
   5:  *
   6:  * ?? ??濡쒕뜑媛 遺숈뿀??(?깅뒫 媛먯궗 P1-14) ?????????????????????????????????????
   7:  * ?덉쟾?먮뒗 ?붾㈃留덈떎 "???붾㈃???깆옣?섎뒗 accountId 吏묓빀"???듭㎏濡?罹먯떆 ?ㅻ줈 ?쇰떎.
   8:  * 吏묓빀????紐낅쭔 ?щ씪???꾩쟾???ㅻⅨ ?뷀듃由щ씪, 媛숈? ??먯쓣 ?붾㈃留덈떎쨌?섏씠吏留덈떎 ?ㅼ떆 諛쏆븯??
   9:  * ?댁젣 罹먯떆??**?щ엺 ?⑥쐞**(`jiraKeys.userInfo(accountId)`)濡??↔퀬, ?ㅼ젣 ?뺣났? ???뚯씪?? * 留덉씠?щ줈 諛곗튂 濡쒕뜑媛 紐⑥븘??`/user/bulk`(50紐??몄텧) 濡??몃떎.
  10:  *   - 諛곗튂 李쎌? `setTimeout(0)` ??媛숈? ?깆뿉 ?쒖옉??fetchQuery ?ㅼ씠 **?꾨?** ??諛곗튂???ㅼ뼱?⑤떎.
  11:  *     (microtask 濡?紐⑥쑝硫?react-query 媛 queryFn ??????誘몃쨪 ?쒖옉????諛곗튂媛 履쇨컻吏꾨떎.)
  12:  *   - 泥?겕???숈떆???곹븳????**蹂묐젹**(吏곷젹 for-await ?????200紐낆씠硫?4???쒖감 ?뺣났?댁뿀??.
  13:  *     諛깆뿏?쒕뒗 `p-limit` ???곗?留??꾨줎?몃뒗 洹??⑦궎吏媛 ESM-only ??jest 蹂?????諛뽰씠???? *     ?곕뒗 湲곕뒫??"?숈떆 N媛?肉먯씠???꾨옒 `mapWithConcurrency` 濡???좏븳??
  14:  */
  15: 
  16: const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,256}$/;
  17: const BULK_CHUNK_SIZE = 50;   // /user/bulk ??accountId 理쒕? 媛쒖닔
  18: const BULK_CONCURRENCY = 3;   // ?숈떆 ?뺣났 ?곹븳(諛깆뿏??p-limit 愿濡? 媛숈? 痍⑥?)
  19: 
  20: export const isValidAccountId = (id) => typeof id === 'string' && ACCOUNT_ID_PATTERN.test(id);
  21: 
  22: const chunkArray = (arr, size) => {
  23:     const chunks = [];
  24:     for (let i = 0; i < arr.length; i += size) {
  25:         chunks.push(arr.slice(i, i + size));
  26:     }
  27:     return chunks;
  28: };
  29: 
  30: /** ?숈떆 ?ㅽ뻾??`limit` 媛쒕줈 臾띠뼱 map ?쒕떎. 寃곌낵 ?쒖꽌???낅젰 ?쒖꽌 洹몃?濡? */
  31: const mapWithConcurrency = async (items, limit, worker) => {
  32:     const results = new Array(items.length);
  33:     let cursor = 0;
  34: 
  35:     const runner = async () => {
  36:         while (cursor < items.length) {
  37:             const index = cursor++;
  38:             results[index] = await worker(items[index]);
  39:         }
  40:     };
  41: 
  42:     await Promise.all(
  43:         Array.from({length: Math.min(limit, items.length)}, runner),
  44:     );
  45:     return results;
  46: };
  47: 
  48: /**
  49:  * 泥?겕 1???뺣났. `executeRequest` ??throw ?섏? ?딄퀬 `{success:false,error}` 瑜??뚮젮二쇰?濡? * **`values` 諛곗뿴 ?좊Т**濡??깃났/?ㅽ뙣瑜?媛瑜몃떎(?ㅽ뙣??null).
  50:  */
  51: const fetchChunk = async (chunk) => {
  52:     const res = await executeRequest('getBulkUser', {
  53:         accountId: chunk,
  54:         maxResults: BULK_CHUNK_SIZE,
  55:     });
  56:     return Array.isArray(res?.values) ? res.values : null;
  57: };
  58: 
  59: /**
  60:  * accountId[] ??user[] (??踰덉뿉 ?꾨웾). ?ㅽ뙣??泥?겕??議곗슜??鍮좎쭊??醫낆쟾 ?숈옉 洹몃?濡?.
  61:  * 媛쒕퀎 罹먯떆媛 ?꾩슂 ?녿뒗 ?몄텧遺(`useWorkListQueries`)媛 ?대떎.
  62:  */
  63: export const fetchBulkUsers = async (accountIds = []) => {
  64:     const safeList = accountIds.filter(isValidAccountId);
  65:     if (safeList.length === 0) return [];
  66: 
  67:     const chunks = chunkArray(safeList, BULK_CHUNK_SIZE);
  68:     const results = await mapWithConcurrency(chunks, BULK_CONCURRENCY, fetchChunk);
  69:     return results.flatMap(values => values ?? []);
  70: };
  71: 
  72: // ?? ?щ엺 ?⑥쐞 濡쒕뜑 (留덉씠?щ줈 諛곗튂) ????????????????????????????????????????????
  73: const pendingWaiters = new Map(); // accountId ??[{resolve, reject}]
  74: let flushScheduled = false;
  75: 
  76: const flush = async () => {
  77:     flushScheduled = false;
  78:     const waitersById = new Map(pendingWaiters);
  79:     pendingWaiters.clear();
  80: 
  81:     const ids = [...waitersById.keys()];
  82: 
  83:     await mapWithConcurrency(chunkArray(ids, BULK_CHUNK_SIZE), BULK_CONCURRENCY, async (chunk) => {
  84:         let values = null;
  85:         let failure = null;
  86:         try {
  87:             values = await fetchChunk(chunk);
  88:         } catch (error) {
  89:             failure = error;
  90:         }
  91: 
  92:         if (!values) {
  93:             // ?ㅽ뙣??**嫄곕?**?쒕떎 ??resolve(null) 濡??섍린硫?"?녿뒗 ?ъ슜??濡?罹먯떆??援노뒗??
  94:             const error = failure ?? new Error('getBulkUser failed');
  95:             chunk.forEach(id => waitersById.get(id)?.forEach(w => w.reject(error)));
  96:             return;
  97:         }
  98: 
  99:         const byId = new Map(values.filter(u => u?.accountId).map(u => [u.accountId, u]));
 100:         chunk.forEach(id => waitersById.get(id)?.forEach(w => w.resolve(byId.get(id) ?? null)));
 101:     });
 102: };
 103: 
 104: /**
 105:  * accountId 1紐???user | null. 媛숈? ?깆쓽 ?붿껌? ??諛곗튂濡?臾띠뿬 `/user/bulk` 1?뚭? ?쒕떎.
 106:  * (?녿뒗 ?ъ슜?먮뒗 `null` ??react-query ??`undefined` 瑜?罹먯떆?섏? 紐삵븳??)
 107:  */
 108: export const loadUserInfo = (accountId) => new Promise((resolve, reject) => {
 109:     if (!isValidAccountId(accountId)) {
 110:         resolve(null);
 111:         return;
 112:     }
 113:     const waiters = pendingWaiters.get(accountId) ?? [];
 114:     waiters.push({resolve, reject});
 115:     pendingWaiters.set(accountId, waiters);
 116: 
 117:     if (!flushScheduled) {
 118:         flushScheduled = true;
 119:         setTimeout(flush, 0);
 120:     }
 121: });
--- static/ui/src/utils/jiraApi/users/getUserInfos.js
   1: import {useMemo} from "react";
   2: import {useQuery, useQueryClient} from "@tanstack/react-query";
   3: import {isValidAccountId, loadUserInfo} from "../../useJiraUserInfos";
   4: import {jiraKeys} from "../../queryKey/jiraKeys";
   5: 
   6: /*
   7:  * ?ъ슜???쒖떆?뺣낫(displayName/avatar) 議고쉶 ??
   8:  *
   9:  * 罹먯떆??**?щ엺 ?⑥쐞**(`jiraKeys.userInfo(accountId)`)?????붾㈃쨌?섏씠吏媛 ?щ씪??媛숈? ?щ엺? ?ㅼ떆 諛쏆? ?딅뒗??
  10:  * 吏묓빀 ?⑥쐞 ??`jiraKeys.userInfos`)??"???몄텧遺媛 ?붽뎄??紐⑸줉"???뉗? ?섑띁濡쒕쭔 ?⑤뒗??
  11:  * 諛섑솚 諛곗뿴??李몄“瑜?吏묓빀留덈떎 ?덉젙?곸쑝濡??좎????뚮퉬泥섏쓽 `useMemo` 瑜?源⑥? ?딄린 ?꾪븳 寃껋씠怨?
  12:  * ?ㅼ젣 ?뺣났 ?щ????꾨옒 ?щ엺 ?⑥쐞 `fetchQuery` 媛 寃곗젙?쒕떎(?좎꽑?섎㈃ 0 ?뺣났).
  13:  */
  14: const USER_STALE_TIME = 1000 * 60 * 10;
  15: const USER_GC_TIME = 1000 * 60 * 30;  // 愿李곗옄媛 ?녿뒗 媛쒖씤 ?뷀듃由щ룄 30遺꾩? ?④꺼 ?붾㈃ 媛??ъ궗?⑹쓣 諛쏅뒗??
  16: const EMPTY_LIST = [];
  17: 
  18: const resolveUserInfos = async (queryClient, accountIds) => {
  19:     const users = await Promise.all(accountIds.map(accountId => queryClient.fetchQuery({
  20:         queryKey: jiraKeys.userInfo(accountId),
  21:         queryFn: () => loadUserInfo(accountId),
  22:         staleTime: USER_STALE_TIME,
  23:         gcTime: USER_GC_TIME,
  24:         // ?ㅽ뙣??洹??щ엺留?鍮좎쭊??醫낆쟾 ?숈옉). ?ъ떆?꾨뒗 諛곗튂 ?뺣났??利앺룺?쒗궎誘濡??덈떎.
  25:         retry: false,
  26:     }).catch(() => null)));
  27: 
  28:     return users.filter(Boolean);
  29: };
  30: 
  31: export const useUserInfos = (accountIds = []) => {
  32:     const queryClient = useQueryClient();
  33: 
  34:     /*
  35:      * ?몄텧遺 ?ㅼ닔媛 ?몃씪??諛곗뿴(`rows.map(...)`)???섍릿????李몄“瑜?硫붾え ?ㅻ줈 ?곕㈃ 留??뚮뜑
  36:      * Set+sort 媛 ?ㅼ떆 ?덈떎. 媛??쒓렇?덉쿂(臾몄옄??濡???좏븳??
  37:      */
  38:     const idSignature = Array.isArray(accountIds) ? `${accountIds.length}|${accountIds.join('|')}` : '';
  39:     const normalizedIds = useMemo(
  40:         () => [...new Set(Array.isArray(accountIds) ? accountIds : [])]
  41:             .filter(isValidAccountId)
  42:             .sort((a, b) => a.localeCompare(b)),
  43:         // ??accountIds 李몄“媛 ?꾨땲??**媛??쒓렇?덉쿂**瑜?蹂몃떎(?몃씪??諛곗뿴 ?몄텧遺 臾댄쉶洹)
  44:         [idSignature],
  45:     );
  46: 
  47:     const {data = EMPTY_LIST, isLoading} = useQuery({
  48:         queryKey: jiraKeys.userInfos(normalizedIds),
  49:         queryFn: () => resolveUserInfos(queryClient, normalizedIds),
  50:         enabled: normalizedIds.length > 0,
  51:         staleTime: USER_STALE_TIME,
  52:     });
  53: 
  54:     return {
  55:         data,
  56:         isLoading
  57:     };
  58: };
  59: 
  60: /**
  61:  * 媛숈? 議고쉶??**留??뺥깭**. `userMap[accountId]` 濡??곕뜕 ?붾㈃(湲됱뿬쨌?꾨줈?앺듃 ?몃젰쨌鍮꾩슜쨌?몃젰遺꾩꽍)???대떎.
  62:  * 諛섑솚 shape ? `{ data: {accountId: user}, isLoading }`.
  63:  */
  64: export const useUserInfoMap = (accountIds = []) => {
  65:     const {data, isLoading} = useUserInfos(accountIds);
  66: 
  67:     const map = useMemo(() => {
  68:         const result = {};
  69:         (data ?? []).forEach(user => {
  70:             if (user?.accountId) result[user.accountId] = user;
  71:         });
  72:         return result;
  73:     }, [data]);
  74: 
  75:     return {data: map, isLoading};
  76: };

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$targets = @('"'static/ui/src/pages/myWork/utils/useMyWorklogSummary.js','static/ui/src/pages/myWork/utils/useMyWorklogList.js','src/resolver/myWork/MyWorkService.jsx','src/api/jira/worklog/WorklogApi.js'); foreach ("'$file in $targets) { Write-Output "--- $file"; $line=0; Get-Content $file | ForEach-Object { $line++; '"'{0,4}: {1}' -f "'$line, $_ } }; Write-Output '"'--- MyWork resolver calls and inclusivity'; rg -n -C 5 \"getMyCalendarWorklog|startDate|endDate|getWorkLogByIssueKey\" src/resolver/myWork src/api/jira/worklog" in C:\CloudJira\moves-workforce
 succeeded in 4420ms:
--- static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
   1: import {useMemo} from "react";
   2: 
   3: /**
   4:  * ?뚰겕濡쒓렇 ?묐떟???좎쭨 踰붿쐞(inclusive)濡??섎씪 ?몃떎.
   5:  *
   6:  * ?붿빟??罹섎┛??荑쇰━ 寃곌낵?먯꽌 ?뚯깮?????대떎. ?쒕쾭(`MyWorkService.processMyIssue`)??
   7:  * ?붿껌 踰붿쐞濡??뚰겕濡쒓렇瑜??대? 嫄몃윭 二쇰?濡? ???볦? 罹섎┛??踰붿쐞 寃곌낵瑜?洹몃?濡??섍린硫?
   8:  * ??寃쎄퀎??嫄몄튇 二??? ?⑷퀎媛 醫낆쟾 媛믨낵 ?щ씪吏꾨떎. 媛숈? 踰붿쐞濡??섎씪 ?쒖떆 媛믪쓣 蹂댁〈?쒕떎.
   9:  * ?좎쭨??'YYYY-MM-DD' ??臾몄옄??鍮꾧탳媛 怨??좎쭨 鍮꾧탳??
  10:  */
  11: export const clipWorklogsToRange = (myWorklogs, startDate, endDate) => {
  12: 
  13:     if (!myWorklogs?.data || !startDate || !endDate) return myWorklogs;
  14: 
  15:     const data = [];
  16: 
  17:     myWorklogs.data.forEach(issue => {
  18: 
  19:         const worklog = issue.fields?.worklog;
  20:         const worklogs = worklog?.worklogs;
  21: 
  22:         if (!worklogs?.length) return;
  23: 
  24:         const filtered = worklogs.filter(wl => {
  25:             const day = wl?.started?.substring(0, 10);
  26:             return !!day && day >= startDate && day <= endDate;
  27:         });
  28: 
  29:         if (!filtered.length) return;
  30: 
  31:         data.push({
  32:             ...issue,
  33:             fields: {
  34:                 ...issue.fields,
  35:                 worklog: {...worklog, worklogs: filtered}
  36:             }
  37:         });
  38:     });
  39: 
  40:     return {...myWorklogs, data};
  41: };
  42: 
  43: export const useMyWorklogSummary = ({myWorklogs}) => {
  44: 
  45:     return useMemo(() => {
  46: 
  47:         if (!myWorklogs?.data) {
  48:             return {
  49:                 todaySeconds: 0,
  50:                 weekSeconds: 0,
  51:                 monthSeconds: 0,
  52:             };
  53:         }
  54: 
  55:         const now = new Date();
  56: 
  57:         // ?ㅻ뒛
  58:         const todayStart = new Date(now);
  59:         todayStart.setHours(0, 0, 0, 0);
  60: 
  61:         const todayEnd = new Date(now);
  62:         todayEnd.setHours(23, 59, 59, 999);
  63: 
  64:         // ?대쾲二?(?붿슂???쒖옉)
  65:         const weekStart = new Date(now);
  66:         const day = weekStart.getDay();
  67: 
  68:         const diff = day === 0 ? -6 : 1 - day;
  69: 
  70:         weekStart.setDate(weekStart.getDate() + diff);
  71:         weekStart.setHours(0, 0, 0, 0);
  72: 
  73:         const weekEnd = new Date(weekStart);
  74:         weekEnd.setDate(weekStart.getDate() + 6);
  75:         weekEnd.setHours(23, 59, 59, 999);
  76: 
  77:         // ?대쾲??
  78:         const monthStart = new Date(
  79:             now.getFullYear(),
  80:             now.getMonth(),
  81:             1
  82:         );
  83: 
  84:         const monthEnd = new Date(
  85:             now.getFullYear(),
  86:             now.getMonth() + 1,
  87:             0
  88:         );
  89: 
  90:         monthEnd.setHours(23, 59, 59, 999);
  91: 
  92:         let todaySeconds = 0;
  93:         let weekSeconds = 0;
  94:         let monthSeconds = 0;
  95: 
  96:         myWorklogs.data.forEach(issue => {
  97: 
  98:             issue.fields?.worklog?.worklogs?.forEach(worklog => {
  99: 
 100:                 const started = new Date(worklog.started);
 101:                 const seconds = worklog.timeSpentSeconds || 0;
 102: 
 103:                 // ?ㅻ뒛
 104:                 if (started >= todayStart && started <= todayEnd) {
 105:                     todaySeconds += seconds;
 106:                 }
 107: 
 108:                 // ?대쾲二?
 109:                 if (started >= weekStart && started <= weekEnd) {
 110:                     weekSeconds += seconds;
 111:                 }
 112: 
 113:                 // ?대쾲??
 114:                 if (started >= monthStart && started <= monthEnd) {
 115:                     monthSeconds += seconds;
 116:                 }
 117: 
 118:             });
 119:         });
 120: 
 121:         return {
 122:             todaySeconds,
 123:             weekSeconds,
 124:             monthSeconds,
 125:         };
 126: 
 127:     }, [myWorklogs]);
 128: };
--- static/ui/src/pages/myWork/utils/useMyWorklogList.js
   1: import {keepPreviousData, useQuery} from "@tanstack/react-query";
   2: import {invoke} from "@forge/bridge";
   3: import {CustomFieldId, getCustomFieldId} from "../../../constants/customField";
   4: import {jiraKeys} from "../../../utils/queryKey/jiraKeys";
   5: import {myWorkKeys} from "../../../utils/queryKey/myWorkKeys";
   6: 
   7: // enabled: ?몄텧遺媛 "??踰붿쐞???ㅻⅨ 荑쇰━ 寃곌낵濡??泥?媛???대씪怨??먮떒?덉쓣 ???꾨뒗 ?ㅼ쐞移?
   8: // 湲곕낯媛?true ??湲곗〈 ?몄텧遺???숈옉? 洹몃?濡쒕떎.
   9: export const useMyWorklogList = ({context, selectedProjectIds, startDate, endDate, mine = false, enabled = true}) =>{
  10: 
  11:     const { data: coworkerFieldId, isLoading: isCoworkerFieldLoading } = useQuery({
  12:         queryKey: jiraKeys.coworkerField(),
  13:         queryFn: () => getCustomFieldId(CustomFieldId.coworkerIdField),
  14:         staleTime: 1000 * 60 * 30,
  15:     });
  16: 
  17:     // mine=true: ?닿? ?묒꽦???뚰겕濡쒓렇留?(罹섎┛???꾩슜) / false: ?대떦/?묒뾽 ?댁뒋 湲곗? (?뚯씠釉붋룹슂??
  18:     const resolverName = mine ? 'getMyCalendarWorklog' : 'getProjectWorklog';
  19: 
  20:     // ??議곌굔 ?꾨줈?앺듃 ?꾩씠???쒖옉??醫낅즺??
  21:     const { data: myWorklogs, isLoading,isFetching} = useQuery({
  22:         queryKey: myWorkKeys.worklogList(resolverName, selectedProjectIds, startDate, endDate),
  23:         queryFn: async () =>
  24:             invoke(resolverName, {
  25:                 accountId: context.accountId,
  26:                 selectedProjectIds,
  27:                 ...(startDate && endDate ? { startDate, endDate } : {}),
  28:                 coworkerFieldId
  29:             }),
  30:         enabled: enabled && !!context?.accountId && (selectedProjectIds?.length ?? 0) > 0 && !isCoworkerFieldLoading,
  31:         placeholderData: keepPreviousData,
  32:         staleTime: 1000 * 60, // 吏㏐쾶 ?ㅼ젙
  33:     });
  34: 
  35:     //console.log(":: [getProjectWorklog] ::",myWorklogs);
  36: 
  37:     return {
  38:         isLoading,
  39:         myWorklogs,
  40:         isFetching,
  41:         coworkerFieldId
  42:     };
  43: }
--- src/resolver/myWork/MyWorkService.jsx
   1: import {getMyProjectListRepository} from "./MyWorkRepository";
   2: import {findRoleByIdService} from "../backoffice/role/RoleService";
   3: import {findLevelByIdService} from "../backoffice/level/LevelService";
   4: import {findProjectStatusByIdService} from "../backoffice/projectStatus/ProjectStatusService";
   5: import {getProjectIssuesByUser, getIssuesByWorklogAuthor} from "../../api/jira/issue/IssueApi";
   6: import {isInRange} from "../utils/worklog/WorklogService";
   7: import pLimit from "p-limit";
   8: import {getWorkLogByIssueKey} from "../../api/jira/worklog/WorklogApi";
   9: 
  10: export const getMyProjectListService = async ({ accountId }) => {
  11: 
  12:     const myProjects = await getMyProjectListRepository(accountId);
  13: 
  14:     const roleIds = [...new Set(myProjects.map(v => v.role_key).filter(Boolean))];
  15:     const levelIds = [...new Set(myProjects.map(v => v.level_key).filter(Boolean))];
  16:     const statusIds = [...new Set(myProjects.map(v => v.project_status_key).filter(Boolean))];
  17: 
  18:     const [roles, levels,status] = await Promise.all([
  19:         Promise.all(roleIds.map(id => findRoleByIdService({ id }))),
  20:         Promise.all(levelIds.map(id => findLevelByIdService({ id }))),
  21:         Promise.all(statusIds.map(id => findProjectStatusByIdService(({ id }))))
  22:     ]);
  23: 
  24:     const roleMap = new Map(
  25:         roles.map(r => [r.data.id, r.data.roleData])
  26:     );
  27: 
  28:     const levelMap = new Map(
  29:         levels.map(l => [l.data.id, l.data.levelData])
  30:     );
  31: 
  32:     const statusMap = new Map(
  33:         status.map(l => [l.id, l])
  34:     );
  35: 
  36:     const data = myProjects.map(project => ({
  37:         ...project,
  38:         role: roleMap.get(project.role_key) || null,
  39:         level: levelMap.get(project.level_key) || null,
  40:         status: statusMap.get(project.project_status_key) || null,
  41:     }));
  42: 
  43:     return {
  44:         success: true,
  45:         data
  46:     };
  47: };
  48: /**
  49:  * ?꾨줈?앺듃???좊떦???댁뒋 議고쉶 + ?댁뒋??20媛??댁긽 ?뚰겕濡쒓렇 議댁옱??異붽? 濡쒕뱶
  50:  * @param accountId
  51:  * @param selectedProjectIds
  52:  * @param startDate
  53:  * @param endDate
  54:  * @param coworkerFieldId
  55:  * @returns {Promise<{data: FlatArray<Awaited<[]|*[]>[], 1>[]}>}
  56:  */
  57: export const getProjectWorklogService = async ({ accountId,selectedProjectIds, startDate, endDate, coworkerFieldId }) =>{
  58: 
  59:     const {issues} = await getProjectIssuesByUser({
  60:         selectedProjectIds,
  61:         accountId,
  62:         startDate,
  63:         endDate,
  64:         coworkerFieldId
  65:     });
  66: 
  67:     const limit = pLimit(5);
  68: 
  69:     const worklogChunks = await Promise.all(
  70:         issues.map(issue =>
  71:             limit(() =>
  72:                 processIssue(issue, startDate, endDate)
  73:             )
  74:         )
  75:     );
  76:     return {
  77:         data: worklogChunks.filter(Boolean)
  78:     };
  79: }
  80: 
  81: const processIssue = async (issue, startDate, endDate) => {
  82:     const { worklog } = issue.fields;
  83: 
  84:     // worklog ?녿뒗 ?댁뒋 skip
  85:     if (!worklog || worklog.total === 0) return (startDate && endDate) ? null : issue;
  86: 
  87:     // 20媛??댁긽?대㈃ 異붽? 議고쉶?댁꽌 ?⑹튂湲?
  88:     if (worklog.total > worklog.maxResults) {
  89:         const extra = await getExtraWorklogs(issue.key, worklog.maxResults);
  90:         worklog.worklogs.push(...extra);
  91:     }
  92: 
  93:     // ?뚰겕濡쒓렇 ?좎쭨 ?꾪꽣留?
  94:     const filtered = worklog.worklogs.filter(wl => {
  95:         if (!startDate || !endDate) return true;
  96:         return isInRange(wl.started.substring(0, 10), startDate, endDate);
  97:     });
  98: 
  99:     if (filtered.length === 0) return (startDate && endDate) ? null : issue;
 100: 
 101:     // ?꾪꽣???뚰겕濡쒓렇濡?issue 諛섑솚
 102:     return {
 103:         ...issue,
 104:         fields: {
 105:             ...issue.fields,
 106:             worklog: {
 107:                 ...worklog,
 108:                 worklogs: filtered,
 109:             },
 110:         },
 111:     };
 112: };
 113: 
 114: // startAt=20 ? 寃???묐떟???몃씪?몃릺???뚰겕濡쒓렇 ?곹븳(worklog.maxResults)?닿퀬,
 115: // ?섏씠吏 ?ш린??洹몄? 臾닿??섎떎 ??maxResult ???섍린吏 ?딄퀬 WorklogApi.getWorkLogByIssueKey ??
 116: // 湲곕낯媛?100)??洹몃?濡??대떎(WorklogService.getExtraWorklogs ? 媛숈? 異쒖쿂瑜?怨듭쑀).
 117: const getExtraWorklogs = async (issueKey, startAt = 20) => {
 118:     let all = [];
 119:     let currentStartAt = startAt;
 120: 
 121:     while (true) {
 122:         const res = await getWorkLogByIssueKey({
 123:             issueIdOrKey: issueKey,
 124:             startAt: currentStartAt});
 125:         const logs = res?.worklogs || [];
 126: 
 127:         all.push(...logs);
 128: 
 129:         currentStartAt += logs.length;
 130: 
 131:         if (!logs.length || currentStartAt >= res.total) {
 132:             break;
 133:         }
 134:     }
 135: 
 136:     return all;
 137: };
 138: /**
 139:  * myWork 罹섎┛???꾩슜 - ?닿? ?묒꽦???뚰겕濡쒓렇留?議고쉶.
 140:  * worklogAuthor 湲곗??쇰줈 ?댁뒋瑜?媛?몄삤怨??대떦???묒뾽??臾닿?), ?뚰겕濡쒓렇??author===accountId 濡??꾪꽣留곹븳??
 141:  * 罹섎┛???꾩슜 寃쎈줈濡? ?뚯씠釉?getProjectWorklogService)?먮뒗 ?곹뼢??二쇱? ?딅뒗??
 142:  */
 143: export const getMyCalendarWorklogService = async ({ accountId, selectedProjectIds, startDate, endDate }) => {
 144: 
 145:     const { issues } = await getIssuesByWorklogAuthor({
 146:         selectedProjectIds,
 147:         accountId,
 148:         startDate,
 149:         endDate
 150:     });
 151: 
 152:     const limit = pLimit(5);
 153: 
 154:     const worklogChunks = await Promise.all(
 155:         issues.map(issue =>
 156:             limit(() => processMyIssue(issue, accountId, startDate, endDate))
 157:         )
 158:     );
 159: 
 160:     return {
 161:         data: worklogChunks.filter(Boolean)
 162:     };
 163: };
 164: 
 165: const processMyIssue = async (issue, accountId, startDate, endDate) => {
 166:     const { worklog } = issue.fields;
 167: 
 168:     if (!worklog || worklog.total === 0) return null;
 169: 
 170:     let allWorklogs = worklog.worklogs;
 171: 
 172:     // 20媛?珥덇낵硫?異붽? 議고쉶?댁꽌 ?⑹튂湲?
 173:     if (worklog.total > worklog.maxResults) {
 174:         const extra = await getExtraWorklogs(issue.key, worklog.maxResults);
 175:         allWorklogs = [...allWorklogs, ...extra];
 176:     }
 177: 
 178:     // ?닿? ?묒꽦???뚰겕濡쒓렇 + ?좎쭨 踰붿쐞 ?꾪꽣
 179:     const filtered = allWorklogs.filter(wl => {
 180:         if (wl.author?.accountId !== accountId) return false;
 181:         if (!startDate || !endDate) return true;
 182:         return isInRange(wl.started.substring(0, 10), startDate, endDate);
 183:     });
 184: 
 185:     if (filtered.length === 0) return null;
 186: 
 187:     return {
 188:         ...issue,
 189:         fields: {
 190:             ...issue.fields,
 191:             worklog: {
 192:                 ...worklog,
 193:                 worklogs: filtered,
 194:             },
 195:         },
 196:     };
 197: };
 198: 
 199: /**
 200:  * ?뚯씠釉?議고쉶 濡쒖쭅 ?꾨줎?우뿉??20媛??댁긽???뚰겕濡쒓렇 議고쉶 ?곗궛 => ?댄썑 getProjectWorklogService ?쒕쾲??議고쉶?섎뒗 濡쒖쭅?먯꽌 臾몄젣 諛쒖깮???泥?諛⑹븞?쇰줈 ?ъ슜
 201:  * @param accountId
 202:  * @param selectedProjectIds
 203:  * @param coworkerFieldId
 204:  * @returns {Promise<{data: []}>}
 205:  */
 206: export const getMyIssueListService = async ({ accountId,selectedProjectIds, coworkerFieldId }) =>{
 207: 
 208:     const {issues} = await getProjectIssuesByUser({
 209:         selectedProjectIds,
 210:         accountId,
 211:         coworkerFieldId
 212:     });
 213: 
 214:     return {
 215:         data : issues
 216:     }
 217: }
--- src/api/jira/worklog/WorklogApi.js
   1: import {route} from "@forge/api";
   2: import {requestJiraJson} from "../util/RequestJiaJson";
   3: //異붽? worklog 議고쉶 (pagination)
   4: export const getWorkLogByIssueKey = async ({ issueIdOrKey, startAt = 0, maxResult = 100, as = 'user' }) => {
   5: 
   6:     const url = route`/rest/api/3/issue/${issueIdOrKey}/worklog?startAt=${startAt}&maxResults=${maxResult}`;
   7: 
   8:     const result = await requestJiraJson({
   9:         as,
  10:         url,
  11:         logPrefix: '[GET WORKLOG]'
  12:     });
  13: 
  14:     return result;
  15: };
--- MyWork resolver calls and inclusivity
src/api/jira/worklog\WorklogApi.js-1-import {route} from "@forge/api";
src/api/jira/worklog\WorklogApi.js-2-import {requestJiraJson} from "../util/RequestJiaJson";
src/api/jira/worklog\WorklogApi.js-3-//추가 worklog 조회 (pagination)
src/api/jira/worklog\WorklogApi.js:4:export const getWorkLogByIssueKey = async ({ issueIdOrKey, startAt = 0, maxResult = 100, as = 'user' }) => {
src/api/jira/worklog\WorklogApi.js-5-
src/api/jira/worklog\WorklogApi.js-6-    const url = route`/rest/api/3/issue/${issueIdOrKey}/worklog?startAt=${startAt}&maxResults=${maxResult}`;
src/api/jira/worklog\WorklogApi.js-7-
src/api/jira/worklog\WorklogApi.js-8-    const result = await requestJiraJson({
src/api/jira/worklog\WorklogApi.js-9-        as,
--
src/resolver/myWork\MyWorkController.jsx-1-import {guardedDefine} from "../../permission/permissionGuard";
src/resolver/myWork\MyWorkController.jsx-2-import {
src/resolver/myWork\MyWorkController.jsx-3-    getMyIssueListService,
src/resolver/myWork\MyWorkController.jsx-4-    getMyProjectListService,
src/resolver/myWork\MyWorkController.jsx-5-    getProjectWorklogService,
src/resolver/myWork\MyWorkController.jsx:6:    getMyCalendarWorklogService
src/resolver/myWork\MyWorkController.jsx-7-} from "./MyWorkService";
src/resolver/myWork\MyWorkController.jsx-8-
src/resolver/myWork\MyWorkController.jsx-9-// SELF: 모든 함수는 payload.accountId 를 무시하고 context.accountId 로 강제(타인 워크로그 열람 차단).
src/resolver/myWork\MyWorkController.jsx-10-export function registerMyWorkController(resolver) {
src/resolver/myWork\MyWorkController.jsx-11-
--
src/resolver/myWork\MyWorkController.jsx-13-        getMyProjectListService({...payload, accountId: context?.accountId}));
src/resolver/myWork\MyWorkController.jsx-14-
src/resolver/myWork\MyWorkController.jsx-15-    guardedDefine(resolver, 'getProjectWorklog', ({payload, context}) =>
src/resolver/myWork\MyWorkController.jsx-16-        getProjectWorklogService({...payload, accountId: context?.accountId}));
src/resolver/myWork\MyWorkController.jsx-17-
src/resolver/myWork\MyWorkController.jsx:18:    guardedDefine(resolver, 'getMyCalendarWorklog', ({payload, context}) =>
src/resolver/myWork\MyWorkController.jsx:19:        getMyCalendarWorklogService({...payload, accountId: context?.accountId}));
src/resolver/myWork\MyWorkController.jsx-20-
src/resolver/myWork\MyWorkController.jsx-21-    guardedDefine(resolver, 'getMyIssueList', ({payload, context}) =>
src/resolver/myWork\MyWorkController.jsx-22-        getMyIssueListService({...payload, accountId: context?.accountId}));
src/resolver/myWork\MyWorkController.jsx-23-}
--
src/resolver/myWork\MyWorkService.jsx-3-import {findLevelByIdService} from "../backoffice/level/LevelService";
src/resolver/myWork\MyWorkService.jsx-4-import {findProjectStatusByIdService} from "../backoffice/projectStatus/ProjectStatusService";
src/resolver/myWork\MyWorkService.jsx-5-import {getProjectIssuesByUser, getIssuesByWorklogAuthor} from "../../api/jira/issue/IssueApi";
src/resolver/myWork\MyWorkService.jsx-6-import {isInRange} from "../utils/worklog/WorklogService";
src/resolver/myWork\MyWorkService.jsx-7-import pLimit from "p-limit";
src/resolver/myWork\MyWorkService.jsx:8:import {getWorkLogByIssueKey} from "../../api/jira/worklog/WorklogApi";
src/resolver/myWork\MyWorkService.jsx-9-
src/resolver/myWork\MyWorkService.jsx-10-export const getMyProjectListService = async ({ accountId }) => {
src/resolver/myWork\MyWorkService.jsx-11-
src/resolver/myWork\MyWorkService.jsx-12-    const myProjects = await getMyProjectListRepository(accountId);
src/resolver/myWork\MyWorkService.jsx-13-
--
src/resolver/myWork\MyWorkService.jsx-47-};
src/resolver/myWork\MyWorkService.jsx-48-/**
src/resolver/myWork\MyWorkService.jsx-49- * 프로젝트에 할당된 이슈 조회 + 이슈에 20개 이상 워크로그 존재시 추가 로드
src/resolver/myWork\MyWorkService.jsx-50- * @param accountId
src/resolver/myWork\MyWorkService.jsx-51- * @param selectedProjectIds
src/resolver/myWork\MyWorkService.jsx:52: * @param startDate
src/resolver/myWork\MyWorkService.jsx:53: * @param endDate
src/resolver/myWork\MyWorkService.jsx-54- * @param coworkerFieldId
src/resolver/myWork\MyWorkService.jsx-55- * @returns {Promise<{data: FlatArray<Awaited<[]|*[]>[], 1>[]}>}
src/resolver/myWork\MyWorkService.jsx-56- */
src/resolver/myWork\MyWorkService.jsx:57:export const getProjectWorklogService = async ({ accountId,selectedProjectIds, startDate, endDate, coworkerFieldId }) =>{
src/resolver/myWork\MyWorkService.jsx-58-
src/resolver/myWork\MyWorkService.jsx-59-    const {issues} = await getProjectIssuesByUser({
src/resolver/myWork\MyWorkService.jsx-60-        selectedProjectIds,
src/resolver/myWork\MyWorkService.jsx-61-        accountId,
src/resolver/myWork\MyWorkService.jsx:62:        startDate,
src/resolver/myWork\MyWorkService.jsx:63:        endDate,
src/resolver/myWork\MyWorkService.jsx-64-        coworkerFieldId
src/resolver/myWork\MyWorkService.jsx-65-    });
src/resolver/myWork\MyWorkService.jsx-66-
src/resolver/myWork\MyWorkService.jsx-67-    const limit = pLimit(5);
src/resolver/myWork\MyWorkService.jsx-68-
src/resolver/myWork\MyWorkService.jsx-69-    const worklogChunks = await Promise.all(
src/resolver/myWork\MyWorkService.jsx-70-        issues.map(issue =>
src/resolver/myWork\MyWorkService.jsx-71-            limit(() =>
src/resolver/myWork\MyWorkService.jsx:72:                processIssue(issue, startDate, endDate)
src/resolver/myWork\MyWorkService.jsx-73-            )
src/resolver/myWork\MyWorkService.jsx-74-        )
src/resolver/myWork\MyWorkService.jsx-75-    );
src/resolver/myWork\MyWorkService.jsx-76-    return {
src/resolver/myWork\MyWorkService.jsx-77-        data: worklogChunks.filter(Boolean)
src/resolver/myWork\MyWorkService.jsx-78-    };
src/resolver/myWork\MyWorkService.jsx-79-}
src/resolver/myWork\MyWorkService.jsx-80-
src/resolver/myWork\MyWorkService.jsx:81:const processIssue = async (issue, startDate, endDate) => {
src/resolver/myWork\MyWorkService.jsx-82-    const { worklog } = issue.fields;
src/resolver/myWork\MyWorkService.jsx-83-
src/resolver/myWork\MyWorkService.jsx-84-    // worklog 없는 이슈 skip
src/resolver/myWork\MyWorkService.jsx:85:    if (!worklog || worklog.total === 0) return (startDate && endDate) ? null : issue;
src/resolver/myWork\MyWorkService.jsx-86-
src/resolver/myWork\MyWorkService.jsx-87-    // 20개 이상이면 추가 조회해서 합치기
src/resolver/myWork\MyWorkService.jsx-88-    if (worklog.total > worklog.maxResults) {
src/resolver/myWork\MyWorkService.jsx-89-        const extra = await getExtraWorklogs(issue.key, worklog.maxResults);
src/resolver/myWork\MyWorkService.jsx-90-        worklog.worklogs.push(...extra);
src/resolver/myWork\MyWorkService.jsx-91-    }
src/resolver/myWork\MyWorkService.jsx-92-
src/resolver/myWork\MyWorkService.jsx-93-    // 워크로그 날짜 필터링
src/resolver/myWork\MyWorkService.jsx-94-    const filtered = worklog.worklogs.filter(wl => {
src/resolver/myWork\MyWorkService.jsx:95:        if (!startDate || !endDate) return true;
src/resolver/myWork\MyWorkService.jsx:96:        return isInRange(wl.started.substring(0, 10), startDate, endDate);
src/resolver/myWork\MyWorkService.jsx-97-    });
src/resolver/myWork\MyWorkService.jsx-98-
src/resolver/myWork\MyWorkService.jsx:99:    if (filtered.length === 0) return (startDate && endDate) ? null : issue;
src/resolver/myWork\MyWorkService.jsx-100-
src/resolver/myWork\MyWorkService.jsx-101-    // 필터된 워크로그로 issue 반환
src/resolver/myWork\MyWorkService.jsx-102-    return {
src/resolver/myWork\MyWorkService.jsx-103-        ...issue,
src/resolver/myWork\MyWorkService.jsx-104-        fields: {
--
src/resolver/myWork\MyWorkService.jsx-110-        },
src/resolver/myWork\MyWorkService.jsx-111-    };
src/resolver/myWork\MyWorkService.jsx-112-};
src/resolver/myWork\MyWorkService.jsx-113-
src/resolver/myWork\MyWorkService.jsx-114-// startAt=20 은 검색 응답에 인라인되는 워크로그 상한(worklog.maxResults)이고,
src/resolver/myWork\MyWorkService.jsx:115:// 페이지 크기는 그와 무관하다 — maxResult 는 넘기지 않고 WorklogApi.getWorkLogByIssueKey 의
src/resolver/myWork\MyWorkService.jsx-116-// 기본값(100)을 그대로 쓴다(WorklogService.getExtraWorklogs 와 같은 출처를 공유).
src/resolver/myWork\MyWorkService.jsx-117-const getExtraWorklogs = async (issueKey, startAt = 20) => {
src/resolver/myWork\MyWorkService.jsx-118-    let all = [];
src/resolver/myWork\MyWorkService.jsx-119-    let currentStartAt = startAt;
src/resolver/myWork\MyWorkService.jsx-120-
src/resolver/myWork\MyWorkService.jsx-121-    while (true) {
src/resolver/myWork\MyWorkService.jsx:122:        const res = await getWorkLogByIssueKey({
src/resolver/myWork\MyWorkService.jsx-123-            issueIdOrKey: issueKey,
src/resolver/myWork\MyWorkService.jsx-124-            startAt: currentStartAt});
src/resolver/myWork\MyWorkService.jsx-125-        const logs = res?.worklogs || [];
src/resolver/myWork\MyWorkService.jsx-126-
src/resolver/myWork\MyWorkService.jsx-127-        all.push(...logs);
--
src/resolver/myWork\MyWorkService.jsx-138-/**
src/resolver/myWork\MyWorkService.jsx-139- * myWork 캘린더 전용 - 내가 작성한 워크로그만 조회.
src/resolver/myWork\MyWorkService.jsx-140- * worklogAuthor 기준으로 이슈를 가져오고(담당자/협업자 무관), 워크로그도 author===accountId 로 필터링한다.
src/resolver/myWork\MyWorkService.jsx-141- * 캘린더 전용 경로로, 테이블(getProjectWorklogService)에는 영향을 주지 않는다.
src/resolver/myWork\MyWorkService.jsx-142- */
src/resolver/myWork\MyWorkService.jsx:143:export const getMyCalendarWorklogService = async ({ accountId, selectedProjectIds, startDate, endDate }) => {
src/resolver/myWork\MyWorkService.jsx-144-
src/resolver/myWork\MyWorkService.jsx-145-    const { issues } = await getIssuesByWorklogAuthor({
src/resolver/myWork\MyWorkService.jsx-146-        selectedProjectIds,
src/resolver/myWork\MyWorkService.jsx-147-        accountId,
src/resolver/myWork\MyWorkService.jsx:148:        startDate,
src/resolver/myWork\MyWorkService.jsx:149:        endDate
src/resolver/myWork\MyWorkService.jsx-150-    });
src/resolver/myWork\MyWorkService.jsx-151-
src/resolver/myWork\MyWorkService.jsx-152-    const limit = pLimit(5);
src/resolver/myWork\MyWorkService.jsx-153-
src/resolver/myWork\MyWorkService.jsx-154-    const worklogChunks = await Promise.all(
src/resolver/myWork\MyWorkService.jsx-155-        issues.map(issue =>
src/resolver/myWork\MyWorkService.jsx:156:            limit(() => processMyIssue(issue, accountId, startDate, endDate))
src/resolver/myWork\MyWorkService.jsx-157-        )
src/resolver/myWork\MyWorkService.jsx-158-    );
src/resolver/myWork\MyWorkService.jsx-159-
src/resolver/myWork\MyWorkService.jsx-160-    return {
src/resolver/myWork\MyWorkService.jsx-161-        data: worklogChunks.filter(Boolean)
src/resolver/myWork\MyWorkService.jsx-162-    };
src/resolver/myWork\MyWorkService.jsx-163-};
src/resolver/myWork\MyWorkService.jsx-164-
src/resolver/myWork\MyWorkService.jsx:165:const processMyIssue = async (issue, accountId, startDate, endDate) => {
src/resolver/myWork\MyWorkService.jsx-166-    const { worklog } = issue.fields;
src/resolver/myWork\MyWorkService.jsx-167-
src/resolver/myWork\MyWorkService.jsx-168-    if (!worklog || worklog.total === 0) return null;
src/resolver/myWork\MyWorkService.jsx-169-
src/resolver/myWork\MyWorkService.jsx-170-    let allWorklogs = worklog.worklogs;
--
src/resolver/myWork\MyWorkService.jsx-176-    }
src/resolver/myWork\MyWorkService.jsx-177-
src/resolver/myWork\MyWorkService.jsx-178-    // 내가 작성한 워크로그 + 날짜 범위 필터
src/resolver/myWork\MyWorkService.jsx-179-    const filtered = allWorklogs.filter(wl => {
src/resolver/myWork\MyWorkService.jsx-180-        if (wl.author?.accountId !== accountId) return false;
src/resolver/myWork\MyWorkService.jsx:181:        if (!startDate || !endDate) return true;
src/resolver/myWork\MyWorkService.jsx:182:        return isInRange(wl.started.substring(0, 10), startDate, endDate);
src/resolver/myWork\MyWorkService.jsx-183-    });
src/resolver/myWork\MyWorkService.jsx-184-
src/resolver/myWork\MyWorkService.jsx-185-    if (filtered.length === 0) return null;
src/resolver/myWork\MyWorkService.jsx-186-
src/resolver/myWork\MyWorkService.jsx-187-    return {

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git -c safe.directory='C:/CloudJira/moves-workforce' diff --unified=100 HEAD -- 'static/ui/src/utils/useJiraUserInfos.js' 'static/ui/src/utils/jiraApi/users/getUserInfos.js' 'static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx' 'static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx' 'static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx' 'static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js'" in C:\CloudJira\moves-workforce
 succeeded in 6145ms:
diff --git a/static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js b/static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js
index c827c3e..e772449 100644
--- a/static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js
+++ b/static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js
@@ -1,205 +1,201 @@
 import { useMemo } from 'react';
 import { invoke } from '@forge/bridge';
 import { useQuery } from '@tanstack/react-query';
 
-import { executeRequest } from '../../../../../utils/jiraApi/requestJira';
+import { useUserInfoMap } from '../../../../../utils/jiraApi/users/getUserInfos';
 import { useTeamOptions } from '../../../../../hooks/useTeamOptions';
 import {
     resourceAnalysisKeys,
     settingKeys,
 } from '../../../../../utils/queryKey/logicalAuditKeys';
 import {
     VIEW_MODE_MEMBER,
     resolveFetchPlan,
     resolveMemberTeamFilter,
     applyTeamFilter,
     shouldFetchUserMap,
     unwrapInvoke,
     buildAnalysisMap,
     resolveBaseMmDays,
     resolveMonthMm,
     buildMembers,
     buildPages,
 } from '../resourceMembersAdapter';
 
 /**
  * useProjectResourceMembers — 프로젝트 인력 분석 행의 **단일 조립 지점** (설계서 §7-3).
  *
  * 인력 분석(`ResourceAnalysisPage`)과 프로젝트 상세 > 분석 > 팀(C)이 **같은 어댑터 한 벌**을 쓴다.
  * 두 벌이 되면 한쪽만 고쳐지는 순간 인별 표와 팀 소계가 갈린다.
  *
  * 🔴 **상태 소유권**: 이 훅은 `viewMode` state 를 **소유하지 않는다.** 강등이 적용된
  *   `effectiveViewMode` 를 **반환**하고 렌더 가드를 책임진다. 페이지는 그 값으로 렌더하고
  *   `useEffect` 로 자기 state 를 동기화한다(한 프레임의 잘린 소계를 막는 이중 방어).
  *
  * 🔴 **`isUserError`/`isAnalysisError` 를 분리해 싣는다.** 통합 `isError` 를 두지 않는다 —
  *   현행이 둘을 다른 조건으로 쓴다: 배너 = OR, 표 차단 = `isTeamView && isAnalysisError`.
  *   합치면 그 차이를 표현할 수 없다.
  *
  * 쿼리키는 **기존 `resourceAnalysisKeys` 를 그대로** 쓴다(신규 키 금지 — 같은 데이터를 두 번 조회하게 된다).
  *
  * @param {object} p
  * @param {string} p.projectId
  * @param {string} p.startDate
  * @param {string} p.endDate
  * @param {'member'|'team'} [p.viewMode='member'] 페이지가 소유한 state(원본)
  * @param {number} [p.page=1]                     인별 모드 페이지 번호
  * @param {string|null} [p.teamKey]               팀 필터(`TEAM_FILTER_NONE` 포함)
  * @param {boolean} [p.includeDescendants=false]  하위 팀 포함
  */
 export const useProjectResourceMembers = ({
     projectId,
     startDate,
     endDate,
     viewMode = VIEW_MODE_MEMBER,
     page = 1,
     teamKey = null,
     includeDescendants = false,
 } = {}) => {
     /*
      * 하위 팀 포함 판정용 계층.
      * ⚠ `getTeamOptions` 를 쓴다 — `getTeamList` 는 grant 가 좁아 PROJECT 권한만 가진
      *   프로젝트 참여자에게 **항상 거부**된다(매 진입마다 실패 호출). fail-soft: 실패해도 자기 팀만 걸린다.
      */
     const { options: teamTree } = useTeamOptions();
 
     const { data: settingData } = useQuery({
         queryKey: settingKeys.detail(),
         queryFn: async () => {
             const result = await invoke('getSettingData');
             if (!result?.success) throw new Error(result?.error?.message ?? 'getSettingData failed');
             const { success, ...settings } = result;
             return settings;
         },
         staleTime: 1000 * 60 * 10,
     });
 
     /*
      * 1) 인원 조회. 팀 필터/팀별 뷰는 **전량 조회**로 전환한다 — 현재 페이지만 클라이언트 필터를 걸면
      *    "3페이지에 있는 개발팀 사람이 안 보이는" 조용한 오답이 된다.
      *    `pagesize` 를 쿼리키에 넣어 인력 탭의 캐시와 섞이지 않게 한다.
      *
      * ⚠ 총 인원은 **응답에 실려 오므로** 상한 판정을 먼저 할 수 없다 → 1차 계획으로 조회하고
      *   응답이 온 뒤 같은 함수로 강등을 다시 계산한다(순수 함수라 두 번 불러도 안전하다).
      */
     const requestPlan = resolveFetchPlan({ viewMode, page, teamKey, totalMemberCount: 0 });
 
     const { data: userData, isLoading: isUserLoading, isError: isUserError } = useQuery({
         queryKey: resourceAnalysisKeys.projectUsers({
             projectId,
             page: requestPlan.effectivePage,
             pageSize: requestPlan.pagesize,
         }),
         queryFn: async () => unwrapInvoke(
             await invoke('findProjectusersByProjectId', {
                 page: requestPlan.effectivePage,
                 pagesize: requestPlan.pagesize,
                 project_id: projectId,
             }),
             'findProjectusersByProjectId',
         ),
         keepPreviousData: true,
     });
 
     const rawUserList = userData?.rows || [];
     const totalMemberCount = rawUserList?.[0]?.total_count ?? 0;
 
     const plan = resolveFetchPlan({ viewMode, page, teamKey, totalMemberCount });
     const { isFullFetch, isTeamFilterUnavailable, effectiveViewMode, isTeamView } = plan;
 
     const teamFilter = useMemo(
         () => resolveMemberTeamFilter({ teamTree, teamKey, includeDescendants, isTeamFilterUnavailable }),
         [teamTree, teamKey, includeDescendants, isTeamFilterUnavailable],
     );
 
     const userList = useMemo(
         () => applyTeamFilter(rawUserList, teamFilter),
         [rawUserList, teamFilter],
     );
 
     const pages = useMemo(
         () => buildPages({ totalMemberCount, isFullFetch }),
         [totalMemberCount, isFullFetch],
     );
 
     const userIds = useMemo(
         () => [...new Set(userList.map(d => d.account_id))],
         [userList],
     );
 
-    // 인원 표시 정보 조회 - 5명씩 배치로 순차 요청
-    const { data: userMap = {}, isLoading: isUserMapLoading } = useQuery({
-        queryKey: resourceAnalysisKeys.userMap(userIds),
-        queryFn: async () => {
-            const results = [];
-            for (let i = 0; i < userIds.length; i += 5) {
-                const batch = await Promise.all(
-                    userIds.slice(i, i + 5).map(accountId => executeRequest('getUser', { accountId })),
-                );
-                results.push(...batch);
-            }
-            return Object.fromEntries(results.map(r => [r.accountId, r]));
-        },
-        enabled: shouldFetchUserMap({ userIdCount: userIds.length, isTeamView }),
-    });
+    /*
+     * 인원 표시 정보(아바타) — 사람 단위 캐시 + bulk 로 받는다(P1-4/P1-14).
+     * 예전에는 5명씩 **순차** 개별 `getUser` 였다(100명 = 100왕복/20라운드).
+     * 조회 여부 판정(`shouldFetchUserMap`)은 어댑터의 단일 출처 그대로다 — 막힐 땐 빈 배열을 넘겨
+     * 훅이 비활성 상태가 되게 한다(useQuery 의 `enabled:false` 와 같은 결과: 왕복 0, isLoading false).
+     */
+    const userMapIds = useMemo(
+        () => (shouldFetchUserMap({ userIdCount: userIds.length, isTeamView }) ? userIds : []),
+        [userIds, isTeamView],
+    );
+    const { data: userMap, isLoading: isUserMapLoading } = useUserInfoMap(userMapIds);
 
     /*
      * 2) 기간 내 프로젝트 전체 워크로그 집계 (페이지 무관 - 1회 조회 후 캐시).
      *
      * 🔴 실패를 삼키면 `members` 조립의 `?? 0` 이 **전원 실적 0** 을 만든다. 인별 뷰에선 "0 MD" 행이지만
      *   팀 뷰에선 **"가동률 0%인 팀"** 이 되어 훨씬 그럴듯한 거짓이 된다 → `isAnalysisError` 로 밝힌다.
      */
     const { data, isLoading: isAnalysisLoading, isError: isAnalysisError } = useQuery({
         queryKey: resourceAnalysisKeys.list({ projectId, startDate, endDate }),
         queryFn: async () => unwrapInvoke(
             await invoke('getResourceAnalysisList', { projectId, startDate, endDate }),
             'getResourceAnalysisList',
         ),
         enabled: !!projectId && !!startDate && !!endDate,
         keepPreviousData: true,
         staleTime: 1000 * 60 * 5,
     });
 
     const analysisMap = useMemo(() => buildAnalysisMap(data), [data]);
 
     const baseMmDays = useMemo(
         () => resolveBaseMmDays(data, startDate, endDate),
         [data, startDate, endDate],
     );
 
     const monthMmMap = data?.monthMmMap ?? {};
     const monthMm = useMemo(() => resolveMonthMm(monthMmMap, startDate), [monthMmMap, startDate]);
 
     const hourRate = data?.hourRate ?? settingData?.hourRate ?? 8;
 
     const members = useMemo(
         () => buildMembers({ userList, analysisMap, data, baseMmDays }),
         [userList, analysisMap, data, baseMmDays],
     );
 
     return {
         // ── 설계서 §7-3 계약 ──────────────────────────────────────────────
         members,
         userMap,
         totalMemberCount,
         isFullFetch,
         isTeamFilterUnavailable,
         effectiveViewMode,
         baseMmDays,
         monthMm,
         isLoading: isUserLoading || isAnalysisLoading,
         isUserError,
         isAnalysisError,
 
         // ── 현행 화면 보존에 필요한 additive 필드 ─────────────────────────
         rawUserList,       // 팀 셀렉트 옵션의 원천(필터 **전** 목록이어야 옵션이 사라지지 않는다)
         userList,
         pages,
         teamFilter,
         monthMmMap,
         hourRate,
         isUserLoading,
         isAnalysisLoading,
         isUserMapLoading,
     };
 };
diff --git a/static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx b/static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx
index 04636b2..67481e3 100644
--- a/static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx
+++ b/static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx
@@ -1,179 +1,167 @@
 import React, { useMemo, useState } from 'react';
 import ECharts from '../../../components/chart/echart/ThemedECharts';
-import { useQuery } from '@tanstack/react-query';
 import Button from '@atlaskit/button/new';
 import CrossIcon from '@atlaskit/icon/core/cross';
 import { IssueComponent } from '../../../components/issue/IssueComponent';
 import { UserAvatar } from '../../../components/avatar/UserAvatar';
 import Card from '../../../components/card/Card';
 import SideDrawer from '../../../components/drawer/SideDrawer';
 import { useI18nStore } from '../../../stores/useI18nStore';
 import { useColorMode } from '../../../utils/useColorMode';
 import { formatCurrency } from '../../../utils/costFormat';
-import { executeRequest } from '../../../utils/jiraApi/requestJira';
+import { useUserInfoMap } from '../../../utils/jiraApi/users/getUserInfos';
 import pieChartOption from '../../../components/chart/echart/options/pieChartOption';
 import CommonTable from '../../../components/table/CommonTable';
 import '../../../components/table/table.css';
-import {projectKeys} from '../../../utils/queryKey/projectKeys';
 
 /**
  * A8-2 — 이슈별 비용 테이블(페이징) + 행 클릭 시 열리는 상세 **드로어**.
  *   - 표: 전체 이슈(페이징 10/페이지). 항상 전체 폭을 쓴다.
  *   - 드로어: 멤버별 비용 비율 파이 + "왜 이 비용인가" 멤버별 구성 상세 테이블.
  *
  * 예전엔 우측에 카드가 `flex-basis: 0 → 40%` 로 밀고 들어왔다. 표가 그만큼 좁아져
  * 컬럼이 접히는 데다, **펼치는 0.3s 동안 컨테이너 폭이 0** 이라 파이가 0×0 으로 잡히는
  * 경합(ResizeObserver + rAF + setTimeout 으로 방어하던 그것)이 있었다.
  * 드로어는 열리는 순간 이미 제 폭이라 그 방어가 통째로 필요 없다.
  *
  * 소비 shape(R5): data.byIssue[{ issueKey, summary, actualMd, cost, costPerMd, estimatedCost,
  *                                byMember:[{accountId, cost, actualMd}] }]
  */
 const round1 = (v) => Math.round((v ?? 0) * 10) / 10;
 const ROWS_PER_PAGE = 10;
 const DRAWER_WIDTH_KEY = 'cost.issueDrawer.width';
 
 export default function CostByIssueTable({ data }) {
     const t = useI18nStore(s => s.t);
     const isDark = useColorMode();
     const currency = data?.currency ?? 'KRW';
     const issues = data?.byIssue ?? [];
 
     const [selectedKey, setSelectedKey] = useState(null);
     const [isPanelOpen, setIsPanelOpen] = useState(false);
     const selected = useMemo(
         () => issues.find(i => i.issueKey === selectedKey) ?? null,
         [issues, selectedKey]
     );
 
     const handleSelect = (issueKey) => {
         if (selectedKey === issueKey) {
             setIsPanelOpen(prev => !prev);
         } else {
             setSelectedKey(issueKey);
             setIsPanelOpen(true);
         }
     };
 
-    // 멤버 표시명 조회 — byMember 의 accountId 들 unique 후 5명씩 배치
-    const accountIds = useMemo(() => {
-        const set = new Set();
-        for (const it of issues) for (const m of (it.byMember ?? [])) if (m.accountId) set.add(m.accountId);
-        return [...set];
-    }, [issues]);
+    /*
+     * 멤버 표시명 조회 — **드로어를 연 이슈의 멤버만**, bulk 로 한 번에.
+     *
+     * 예전에는 탭 진입 즉시 표 전체(이슈 전량)의 멤버를 5명씩 순차로 개별 조회했다(멤버 40명 = 40왕복/8라운드).
+     * userMap 을 쓰는 곳은 드로어의 파이·상세표뿐이라 진입 시점에는 한 건도 필요 없다(P1-4).
+     */
+    const drawerAccountIds = useMemo(() => {
+        if (!isPanelOpen || !selected) return [];
+        return [...new Set((selected.byMember ?? []).map(m => m.accountId).filter(Boolean))];
+    }, [isPanelOpen, selected]);
 
-    const { data: userMap = {} } = useQuery({
-        queryKey: projectKeys.costUserMap(accountIds),
-        queryFn: async () => {
-            const results = [];
-            for (let i = 0; i < accountIds.length; i += 5) {
-                const batch = await Promise.all(
-                    accountIds.slice(i, i + 5).map(id => executeRequest('getUser', { accountId: id })),
-                );
-                results.push(...batch);
-            }
-            return Object.fromEntries(results.map(r => [r.accountId, r]));
-        },
-        enabled: accountIds.length > 0,
-        staleTime: 1000 * 60 * 30,
-    });
+    const { data: userMap } = useUserInfoMap(drawerAccountIds);
 
     // ── 좌측: 이슈 표 (페이징) ──────────────────────────────────────────────
     const tableHead = useMemo(() => ({
         cells: [
             { key: 'key', content: t('cost.issue.col.key'), width: 30 },
             { key: 'actualMd', content: t('cost.issue.col.actualMd'), width: 14, isSortable: true },
             { key: 'cost', content: t('cost.issue.col.cost'), width: 20, isSortable: true },
             { key: 'estimatedCost', content: t('cost.issue.col.estimatedCost'), width: 20, isSortable: true },
             { key: 'costPerMd', content: t('cost.issue.col.costPerMd'), width: 16, isSortable: true },
         ],
     }), [t]);
 
     const tableRows = useMemo(() => issues.map((issue) => ({
         key: issue.issueKey,
         onClick: () => handleSelect(issue.issueKey),
         style: selectedKey === issue.issueKey
             ? { background: isDark ? '#1C2B41' : '#DEEBFF', cursor: 'pointer' }
             : { cursor: 'pointer' },
         cells: [
             {
                 key: 'key',
                 content: (
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                         <IssueComponent issueKey={issue.issueKey} issueImage={issue.issueTypeIconUrl} />
                         {issue.summary && (
                             <span style={{ fontSize: 11, color: '#8993A4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240, display: 'block' }}>
                                 {issue.summary}
                             </span>
                         )}
                     </div>
                 ),
             },
             { key: 'actualMd', content: <span style={{ fontSize: 12 }}>{round1(issue.actualMd)} MD</span> },
             { key: 'cost', content: <span style={{ fontSize: 12, fontWeight: 600 }}>{formatCurrency(issue.cost, currency)}</span> },
             {
                 key: 'estimatedCost',
                 content: (issue.estimatedCost ?? 0) > 0
                     ? <span style={{ fontSize: 12 }}>{formatCurrency(issue.estimatedCost, currency)}</span>
                     : <span style={{ color: '#8993A4' }}>-</span>,
             },
             {
                 key: 'costPerMd',
                 content: issue.costPerMd == null
                     ? <span style={{ color: '#8993A4' }}>-</span>
                     : <span style={{ fontSize: 12 }}>{formatCurrency(issue.costPerMd, currency)}</span>,
             },
         ],
     })), [issues, currency, selectedKey, isDark]);
 
     // ── 우측: 멤버 비용 비율 파이 ───────────────────────────────────────────
     const members = selected?.byMember ?? [];
     const pieOption = useMemo(() => {
         if (!members.length) return null;
         const pdata = members.map(m => ({
             name: userMap[m.accountId]?.displayName ?? m.accountId,
             value: m.cost,
         }));
         const base = pieChartOption({ t, title: selected.issueKey, data: pdata, radius: ['38%', '64%'], center: ['50%', '52%'] });
         base.tooltip = {
             ...base.tooltip,
             formatter: (p) => `${p.name}<br/><b>${formatCurrency(p.value, currency)}</b> (${p.percent}%)`,
         };
         return base;
     }, [members, selected, userMap, currency, t]);
 
     // ── 드로어: "왜 이 비용인가" 멤버별 구성 상세 테이블 ────────────────────
     const detailHead = useMemo(() => ({
         cells: [
             { key: 'member', content: t('cost.issue.col.member'), width: 38 },
             { key: 'actualMd', content: t('cost.issue.col.actualMd'), width: 20, isSortable: true },
             { key: 'cost', content: t('cost.issue.col.cost'), width: 24, isSortable: true },
             { key: 'ratio', content: t('cost.issue.col.ratio'), width: 18, isSortable: true },
         ],
     }), [t]);
 
     const detailRows = useMemo(() => {
         const total = members.reduce((s, m) => s + (m.cost ?? 0), 0);
         return members.map(m => ({
             key: m.accountId,
             cells: [
                 { key: 'member', content: <UserAvatar response={userMap[m.accountId]} displayNoUser={m.accountId} /> },
                 { key: 'actualMd', content: <span style={{ fontSize: 12 }}>{round1(m.actualMd)} MD</span> },
                 { key: 'cost', content: <span style={{ fontSize: 12, fontWeight: 600 }}>{formatCurrency(m.cost, currency)}</span> },
                 { key: 'ratio', content: <span style={{ fontSize: 12 }}>{total > 0 ? Math.round((m.cost / total) * 100) : 0}%</span> },
             ],
         }));
     }, [members, userMap, currency]);
 
     return (
         <>
             <Card
                 title={t('cost.issue.title')}
                 info={{ calc: t('cost.issue.calc'), interp: t('cost.issue.interp') }}
             >
                 <CommonTable
                     head={tableHead}
                     rows={tableRows}
                     rowsPerPage={ROWS_PER_PAGE}
                     emptyMessage={t('cost.issue.empty')}
                 />
diff --git a/static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx b/static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx
index 340cad8..7dc68ae 100644
--- a/static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx
+++ b/static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx
@@ -1,218 +1,209 @@
 import React, { useEffect, useMemo, useState } from "react";
 import { invoke } from "@forge/bridge";
 import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
 import { Box, Stack, Inline } from "@atlaskit/primitives";
 import Pagination from "@atlaskit/pagination";
 import Select from "@atlaskit/select";
 import Textfield from "@atlaskit/textfield";
 import InlineEdit from "@atlaskit/inline-edit";
 import SectionMessage from "@atlaskit/section-message";
 import WarningIcon from "@atlaskit/icon/core/warning";
 import InformationIcon from "@atlaskit/icon/core/information";
 import Tooltip from "@atlaskit/tooltip";
 import { token } from "@atlaskit/tokens";
 import CommonTable from "../../../components/table/CommonTable";
 import { UserAvatar } from "../../../components/avatar/UserAvatar";
 import { InfoTip } from "../progress/InfoTip";
-import { executeRequest } from "../../../utils/jiraApi/requestJira";
+import { useUserInfoMap } from "../../../utils/jiraApi/users/getUserInfos";
 import { formatNumber, parseNumber } from "../../../utils/numberUtils";
 import { projectKeys } from "../../../utils/queryKey/projectKeys";
-import { jiraKeys } from "../../../utils/queryKey/jiraKeys";
 import { useI18nStore } from "../../../stores/useI18nStore";
 import { usePermissionStore } from "../../../stores/usePermissionStore";
 import { useSalaryPolicy } from "../../../hooks/useSalaryPolicy";
 import SalaryCell from "../../../components/salary/SalaryCell";
 import { tFormat } from "../../../utils/i18n";
 
 /**
  * 급여 관리 탭 — 인력관리(부모)의 자식 탭.
  *
  * getProjectSalaryList 소비 (02_backend_report §2-3) — **정책에 따라 rows shape 이 다르다**:
  *   INDIVIDUAL: { project_member_id, account_id, role_key, level_key,
  *                 salary, salary_type:'PROJECT'|'ANNUAL', annual_salary|null,
  *                 effective_salary, total_count }
  *   LEVEL_BAND: { project_member_id, account_id, role_key, level_key,
  *                 level_band:{min,max,representative}|null,   ← salary/salary_type/annual_salary **키 없음**
  *                 effective_salary, total_count }
  *   meta: { projectMonths, salaryPolicy, unpricedMemberCount:number|null }
  *
  * ⚠ `level_band` 는 **여기서만** `representative` 를 포함한다(사용자 목록의 `levelBand` 는 `{min,max}` 뿐).
  *   `<SalaryCell>` 은 `min`/`max` 만 읽으므로 두 shape 을 그대로 넘겨도 안전하다.
  *
  * ⚠ LEVEL_BAND 에서는 `updateProjectMemberSalary` 를 **호출하지 않는다**(InlineEdit 자체가 없다).
  *   서버도 `SALARY_POLICY_LEVEL_BAND` 로 거부한다 — 이중 방어.
  */
 // 헤더 라벨 + 설명 툴팁 (ProjectIssueTable.jsx withTooltip 컨벤션)
 const withTooltip = (label, content) => (
     <Inline alignBlock="center" space="space.050">
         <span>{label}</span>
         <Tooltip content={content}>
             {(tooltipProps) => (
                 <span {...tooltipProps} style={{ display: 'flex', alignItems: 'center', color: token("color.text.subtle", "#6B7280"), cursor: 'help' }}>
                     <InformationIcon label="" size="small" color="currentColor" />
                 </span>
             )}
         </Tooltip>
     </Inline>
 );
 
 export default function SalaryManagementPage({ project_id, toast }) {
     const t = useI18nStore(s => s.t);
     const canWrite = usePermissionStore(s => s.canWrite("PROJECT_COST"));
     const [page, setPage] = useState(1);
     const queryClient = useQueryClient();
 
     useEffect(() => {
         setPage(1);
     }, [project_id]);
 
     const modeOptions = useMemo(() => [
         { label: t('salary.mode.project'), value: 'PROJECT' },
         { label: t('salary.mode.annual'), value: 'ANNUAL' },
     ], [t]);
 
     const { data, isLoading } = useQuery({
         queryKey: projectKeys.salary(project_id, page),
         queryFn: () => invoke('getProjectSalaryList', { project_id, page }),
         keepPreviousData: true,
     });
 
     const dataList = data?.rows || [];
     const projectMonths = data?.meta?.projectMonths ?? 0;
 
     /*
      * 정책 원천은 `getSettingData` 지만, 이 화면의 rows 를 실제로 만든 모드는 `meta.salaryPolicy` 다.
      * 훅에 넘겨 **응답 쪽을 우선**시킨다(설정 캐시 stale 시 컬럼과 데이터가 어긋나는 것을 막는다).
      */
     const responsePolicy = data?.meta?.salaryPolicy;
     const { isLevelBand } = useSalaryPolicy(responsePolicy);
 
     /*
      * 🔴 `unpricedMemberCount` 는 **`number | null`** 이다(02_backend_report §3 D-3).
      *   배포 직후 10분간 살아 있는 레거시 캐시에는 이 값이 없어 `null` 이 온다.
      *   `?? 0` 으로 채우면 "가격 미산정 0명"이라는 거짓이 되므로 **`> 0` 일 때만** 경고한다
      *   (`null`·`0` 둘 다 미표시).
      */
     const unpricedCount = data?.meta?.unpricedMemberCount;
     const showUnpricedWarn = typeof unpricedCount === 'number' && unpricedCount > 0;
 
     const pages = useMemo(() => {
         const total = dataList?.[0]?.total_count ?? 0;
         return Array.from({ length: Math.ceil(total / 10) }, (_, i) => i + 1);
     }, [dataList]);
 
     const userIds = useMemo(
         () => [...new Set(dataList.map(d => d.account_id))],
         [dataList]
     );
 
-    const { data: userMap = {} } = useQuery({
-        queryKey: jiraKeys.userMap(userIds),
-        queryFn: async () => {
-            const results = await Promise.all(
-                userIds.map(accountId => executeRequest('getUser', { accountId }))
-            );
-            return Object.fromEntries(results.map(r => [r.accountId, r]));
-        },
-        enabled: dataList.length > 0,
-    });
+    // 표시명·아바타는 사람 단위 캐시 + bulk 1회로 받는다(개별 getUser N+1 제거, P1-4/P1-14)
+    const { data: userMap } = useUserInfoMap(userIds);
 
     const updateMutation = useMutation({
         mutationFn: (params) => invoke('updateProjectMemberSalary', params),
         onSuccess: (result) => {
             // 경계면 계약: result.success 로 반드시 분기 (success:false 도 reject 없이 반환됨)
             if (!result?.success) {
                 toast.showError(
                     t('common.toast.title.Fail'),
                     t('salary.toast.error')
                 );
                 return;
             }
             toast.showSuccess(
                 t('common.toast.title.success'),
                 t('salary.toast.success')
             );
             queryClient.invalidateQueries({ queryKey: projectKeys.salary(project_id) });
             queryClient.invalidateQueries({ queryKey: projectKeys.cost(project_id) });
         },
         onError: () => {
             toast.showError(
                 t('common.toast.title.Fail'),
                 t('salary.toast.error')
             );
         },
     });
 
     const hasNoPeriod = projectMonths === 0;
 
     /*
      * LEVEL_BAND 는 **읽기 전용 밴드 뷰**다(§7-5) — 연봉·계산 모드·투입 급여 3열이 사라지고
      * 등급 밴드 1열이 들어온다. 계산에 쓰이지 않는 값을 편집하게 두면
      * "왜 숫자가 안 바뀌나"가 발생하기 때문이다(D5).
      */
     const head = {
         cells: [
             { key: 'user', content: t('salary.table.user') },
             ...(isLevelBand ? [
                 { key: 'levelBand', content: t('salary.table.levelBand') },
             ] : [
                 { key: 'annualSalary', content: t('salary.table.annualSalary') },
                 { key: 'mode', content: t('salary.table.mode') },
                 { key: 'investSalary', content: withTooltip(t('salary.table.investSalary'), t('salary.table.tooltip.investSalary')) },
             ]),
             { key: 'effectiveSalary', content: withTooltip(t('salary.table.effectiveSalary'), t('salary.table.tooltip.effectiveSalary')) },
         ],
     };
 
     const rows = useMemo(() => {
         return dataList.map(row => {
             const isAnnual = row.salary_type === 'ANNUAL';
             const annualMissing = row.annual_salary == null;
 
             // 연봉 표시(읽기): 미등록이면 '-' + 경고. 금액 렌더는 <SalaryCell> 이 유일한 구현부다.
             const annualContent = (
                 <SalaryCell
                     mode="plain"
                     amount={row.annual_salary}
                     missingWarning={t('salary.warn.noAnnual')}
                 />
             );
 
             // 등급 밴드(LEVEL_BAND 전용, 읽기) — 밴드가 없으면 인건비가 0으로 계산된다는 경고를 함께 낸다.
             const bandContent = (
                 <SalaryCell
                     mode="band"
                     band={row.level_band}
                     missingWarning={t('salary.warn.noBand')}
                 />
             );
 
             // 계산 모드(편집)
             const modeContent = canWrite ? (
                 <InlineEdit
                     readView={() => (
                         <div style={{ minWidth: '80px', minHeight: '30px' }}>
                             {isAnnual ? t('salary.mode.annual') : t('salary.mode.project')}
                         </div>
                     )}
                     editView={fieldProps => (
                         <Select {...fieldProps}
                                 options={modeOptions}
                                 autoFocus
                                 value={fieldProps.value}
                                 onChange={(value) => fieldProps.onChange(value)}
                                 menuPortalTarget={document.body}
                                 menuPosition="fixed"
                                 styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                         />
                     )}
                     defaultValue={{
                         label: isAnnual ? t('salary.mode.annual') : t('salary.mode.project'),
                         value: row.salary_type,
                     }}
                     onConfirm={(value) => {
                         if (value?.value && value.value !== row.salary_type) {
                             updateMutation.mutate({
                                 project_member_id: row.project_member_id,
                                 salary_type: value.value,
                             });
diff --git a/static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx b/static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx
index 938ac10..e21dbd4 100644
--- a/static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx
+++ b/static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx
@@ -1,201 +1,188 @@
 import React, {useEffect, useMemo, useRef, useState} from "react";
 import {invoke} from "@forge/bridge";
 import {Inline} from "@atlaskit/primitives/compiled";
 import Button from "@atlaskit/button/new";
 import CommonTable from "../../../components/table/CommonTable";
 import Pagination from "@atlaskit/pagination";
 import {Box, Stack} from "@atlaskit/primitives";
 import {UserAvatar} from "../../../components/avatar/UserAvatar";
-import {executeRequest} from "../../../utils/jiraApi/requestJira";
+import {useUserInfoMap} from "../../../utils/jiraApi/users/getUserInfos";
 import {useRoleLevelPermissions} from "../../../utils/useRoleLevelPermissions";
 import InlineEdit from "@atlaskit/inline-edit";
 import Select from "@atlaskit/select";
 import {UserAddModal} from "./UserAddModal";
 import {useI18nStore} from "../../../stores/useI18nStore";
 import {usePermissionStore} from "../../../stores/usePermissionStore";
 import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
 import AddIcon from "@atlaskit/icon/core/add";
 import DeleteIcon from "@atlaskit/icon/core/delete";
 import ProjectTeamBar from "./ProjectTeamBar";
-import {jiraKeys} from "../../../utils/queryKey/jiraKeys";
 import {projectKeys} from "../../../utils/queryKey/projectKeys";
 
 export const ProjectUserPanel = ({context ,project_id, toast}) => {
     const t = useI18nStore(s => s.t)
     const canWrite = usePermissionStore(s=>s.canWrite("PROJECT"));
     const canKanbanWrite = usePermissionStore(s=>s.canWrite("KANBAN"));
     const [page, setPage] = useState(1);
     const [isModalOpen, setIsModalOpen] = useState(false);
     const queryClient = useQueryClient();
     const { roles, levels } = useRoleLevelPermissions();
 
     const canEdit = context === 'kanban'
         ? canKanbanWrite
         : canWrite;
 
     useEffect(() => {
         setPage(1);
     }, [project_id]);
 
     const roleOptions = useMemo(
         () =>
             roles.map((role) => ({
                 label: role.name,
                 value: role.id,
             })),
         [roles]
     );
 
     const levelOptions = useMemo(
         () =>
             levels.map((level) => ({
                 label: level.name,
                 value: level.id,
             })),
         [levels]
     );
 
     const head = {
         cells: [
             { key: 'name', content: t('projectDetail.user.table.head.0') },
             { key: 'role', content: t('projectDetail.user.table.head.1') },
             { key: 'level', content: t('projectDetail.user.table.head.2') },
             // 팀 (P2-a) — findProjectusersByProjectId 행에 teamKey/teamName 이 실린다
             { key: 'team', content: t('projectDetail.user.col.team') },
             { key: 'action', content: t('projectDetail.user.table.head.4') },
         ],
     }
 
     const { data, isLoading } = useQuery({
         queryKey: projectKeys.userPage(project_id, page),
         queryFn: () =>
             invoke('findProjectusersByProjectId', { page, project_id }),
         keepPreviousData: true
     });
 
     const dataList = data?.rows || [];
 
     const pages = useMemo(() => {
         const total = dataList?.[0]?.total_count ?? 0;
         return Array.from({ length: Math.ceil(total / 10) }, (_, i) => i + 1);
     }, [dataList]);
 
     const userIds = useMemo(
         () => [...new Set(dataList.map(d => d.account_id))],
         [dataList]
     );
 
-    const { data: userMap = {} } = useQuery({
-        queryKey: jiraKeys.userMap(userIds),
-        queryFn: async () => {
-            const results = await Promise.all(
-                userIds.map(accountId =>
-                    executeRequest('getUser', { accountId })
-                )
-            );
-            return Object.fromEntries(
-                results.map(r => [r.accountId, r])
-            );
-        },
-        enabled: dataList.length > 0
-    });
+    // 표시명·아바타는 사람 단위 캐시 + bulk 1회로 받는다(개별 getUser N+1 제거, P1-4/P1-14)
+    const { data: userMap } = useUserInfoMap(userIds);
 
     const rows = useMemo(() => {
         return dataList.map(data => ({
             key: data.project_member_id,
             cells: [
                 {key: 'name', content: <UserAvatar response={userMap?.[data.account_id]}/>},
                 {key: 'role', content:
                         canEdit ?
                             (   <InlineEdit readView={() => <div style={{minWidth: '40px', minHeight: '30px'}}>{roles.find(item => item.id === data.role_key)?.name || '-'}</div>}
                                             editView={fieldProps =>
                                                 <Select {...fieldProps}
                                                         options={roleOptions}
                                                         autoFocus
                                                         value={fieldProps.value}
                                                         onChange={(value) => fieldProps.onChange(value)}
                                                         menuPortalTarget={document.body}
                                                         menuPosition="fixed"
                                                         styles={{
                                                             menuPortal: (base) => ({
                                                                 ...base,
                                                                 zIndex: 9999,
                                                             }),
                                                         }}
                                                 />
                                             }
                                             defaultValue={{label:roles.find(item => item.id === data.role_key)?.name, value: data.role_key}}
                                             onConfirm={(value) => {
                                                 if (value?.value !== data.role_key) {
                                                     updateMutation.mutate({
                                                         project_member_id: data.project_member_id,
                                                         role_key: value.value
                                                     });
                                                 }
                                             }}
                                             hideActionButtons/>
                             ):
                             (
                                 <div style={{minWidth: '40px', minHeight: '30px'}}>{roles.find(item => item.id === data.role_key)?.name || '-'}</div>
                             )
                 },
                 {key: 'level', content:
                         canEdit ?
                             (
                                 <InlineEdit readView={() => <div style={{minWidth: '40px', height: '30px'}}>{levels.filter(item => item.id === data.level_key).at(0)?.name || '-'}</div>}
                                             editView={fieldProps =>
                                                 <Select {...fieldProps} options={levelOptions}
                                                         autoFocus
                                                         value={fieldProps.value}
                                                         onChange={(value) => fieldProps.onChange(value)}
                                                         menuPortalTarget={document.body}
                                                         menuPosition="fixed"
                                                         styles={{
                                                             menuPortal: (base) => ({
                                                                 ...base,
                                                                 zIndex: 9999,
                                                             }),
                                                         }}
                                                 />
                                             }
                                             defaultValue={{label:levels.find(item => item.id === data.level_key)?.name, value: data.level_key}}
                                             onConfirm={(value) => {
                                                 if (value?.value !== data.level_key) {
                                                     updateMutation.mutate({
                                                         project_member_id: data.project_member_id,
                                                         level_key: value.value
                                                     });
                                                 }
                                             }}
                                             hideActionButtons/>
                             ):
                             (
                                 <div style={{minWidth: '40px', height: '30px'}}>{levels.filter(item => item.id === data.level_key).at(0)?.name || '-'}</div>
                             )
                 },
                 {key: 'team', content: (
                     // 서버가 camelCase(teamName)와 SQL 원본(team_key)을 함께 준다.
                     // 이름이 없으면 '-' 로 두고 **teamKey(UUID)를 라벨로 쓰지 않는다**(F2/F4 규칙).
                     <div style={{minWidth: '40px'}}>{data.teamName ?? '-'}</div>
                 )},
                 {key: 'action', content: <Button
                         iconBefore={DeleteIcon}
                         onClick={() => deleteMutation.mutate(data.project_member_id)}>{t('common.button.delete')}</Button>}
             ]
         }));
     }, [dataList, userMap, roles, levels]);
 
 
     const deleteMutation = useMutation({
         mutationFn: (id) => invoke('deleteProjectUsersByKey', { project_member_id: id }),
 
         onSuccess: () => {
             toast.showSuccess(
                 t('common.toast.title.success'),
                 t('projectDetail.user.toast.description.success.delete')
             );
             queryClient.invalidateQueries({ queryKey: projectKeys.users(project_id) });
         },
 
         onError: () => {
             toast.showError(
diff --git a/static/ui/src/utils/jiraApi/users/getUserInfos.js b/static/ui/src/utils/jiraApi/users/getUserInfos.js
index 09c8ab4..65bdc95 100644
--- a/static/ui/src/utils/jiraApi/users/getUserInfos.js
+++ b/static/ui/src/utils/jiraApi/users/getUserInfos.js
@@ -1,25 +1,77 @@
-import {fetchBulkUsers} from "../../useJiraUserInfos";
-import {useQuery} from "@tanstack/react-query";
 import {useMemo} from "react";
+import {useQuery, useQueryClient} from "@tanstack/react-query";
+import {isValidAccountId, loadUserInfo} from "../../useJiraUserInfos";
 import {jiraKeys} from "../../queryKey/jiraKeys";
 
+/*
+ * 사용자 표시정보(displayName/avatar) 조회 훅.
+ *
+ * 캐시는 **사람 단위**(`jiraKeys.userInfo(accountId)`)다 — 화면·페이지가 달라도 같은 사람은 다시 받지 않는다.
+ * 집합 단위 키(`jiraKeys.userInfos`)는 "이 호출부가 요구한 목록"의 얇은 래퍼로만 남는다:
+ * 반환 배열의 참조를 집합마다 안정적으로 유지해 소비처의 `useMemo` 를 깨지 않기 위한 것이고,
+ * 실제 왕복 여부는 아래 사람 단위 `fetchQuery` 가 결정한다(신선하면 0 왕복).
+ */
+const USER_STALE_TIME = 1000 * 60 * 10;
+const USER_GC_TIME = 1000 * 60 * 30;  // 관찰자가 없는 개인 엔트리도 30분은 남겨 화면 간 재사용을 받는다
+
+const EMPTY_LIST = [];
+
+const resolveUserInfos = async (queryClient, accountIds) => {
+    const users = await Promise.all(accountIds.map(accountId => queryClient.fetchQuery({
+        queryKey: jiraKeys.userInfo(accountId),
+        queryFn: () => loadUserInfo(accountId),
+        staleTime: USER_STALE_TIME,
+        gcTime: USER_GC_TIME,
+        // 실패는 그 사람만 빠진다(종전 동작). 재시도는 배치 왕복을 증폭시키므로 끈다.
+        retry: false,
+    }).catch(() => null)));
+
+    return users.filter(Boolean);
+};
+
 export const useUserInfos = (accountIds = []) => {
+    const queryClient = useQueryClient();
 
-    const normalizedIds = useMemo(() => {
-        return [...new Set(accountIds)]
-            .filter(Boolean)
-            .sort((a, b) => a.localeCompare(b));
-    }, [accountIds]);
+    /*
+     * 호출부 다수가 인라인 배열(`rows.map(...)`)을 넘긴다 — 참조를 메모 키로 쓰면 매 렌더
+     * Set+sort 가 다시 돈다. 값 시그니처(문자열)로 대신한다.
+     */
+    const idSignature = Array.isArray(accountIds) ? `${accountIds.length}|${accountIds.join('|')}` : '';
+    const normalizedIds = useMemo(
+        () => [...new Set(Array.isArray(accountIds) ? accountIds : [])]
+            .filter(isValidAccountId)
+            .sort((a, b) => a.localeCompare(b)),
+        // ⚠ accountIds 참조가 아니라 **값 시그니처**를 본다(인라인 배열 호출부 무회귀)
+        [idSignature],
+    );
 
-    const { data = [], isLoading } = useQuery({
+    const {data = EMPTY_LIST, isLoading} = useQuery({
         queryKey: jiraKeys.userInfos(normalizedIds),
-        queryFn: () => fetchBulkUsers(normalizedIds),
+        queryFn: () => resolveUserInfos(queryClient, normalizedIds),
         enabled: normalizedIds.length > 0,
-        staleTime: 1000 * 60 * 10,
+        staleTime: USER_STALE_TIME,
     });
 
     return {
         data,
         isLoading
     };
 };
+
+/**
+ * 같은 조회의 **맵 형태**. `userMap[accountId]` 로 쓰던 화면(급여·프로젝트 인력·비용·인력분석)이 쓴다.
+ * 반환 shape 은 `{ data: {accountId: user}, isLoading }`.
+ */
+export const useUserInfoMap = (accountIds = []) => {
+    const {data, isLoading} = useUserInfos(accountIds);
+
+    const map = useMemo(() => {
+        const result = {};
+        (data ?? []).forEach(user => {
+            if (user?.accountId) result[user.accountId] = user;
+        });
+        return result;
+    }, [data]);
+
+    return {data: map, isLoading};
+};
diff --git a/static/ui/src/utils/useJiraUserInfos.js b/static/ui/src/utils/useJiraUserInfos.js
index 07251a4..8617b0f 100644
--- a/static/ui/src/utils/useJiraUserInfos.js
+++ b/static/ui/src/utils/useJiraUserInfos.js
@@ -1,34 +1,124 @@
 import {executeRequest} from "./jiraApi/requestJira";
 
+/*
+ * Jira 사용자 bulk 조회의 **단일 출처**.
+ *
+ * ── 왜 로더가 붙었나 (성능 감사 P1-14) ─────────────────────────────────────
+ * 예전에는 화면마다 "이 화면에 등장하는 accountId 집합"을 통째로 캐시 키로 썼다.
+ * 집합이 한 명만 달라도 완전히 다른 엔트리라, 같은 팀원을 화면마다·페이지마다 다시 받았다.
+ * 이제 캐시는 **사람 단위**(`jiraKeys.userInfo(accountId)`)로 잡고, 실제 왕복은 이 파일의
+ * 마이크로 배치 로더가 모아서 `/user/bulk`(50명/호출) 로 낸다.
+ *   - 배치 창은 `setTimeout(0)` — 같은 틱에 시작된 fetchQuery 들이 **전부** 한 배치에 들어온다.
+ *     (microtask 로 모으면 react-query 가 queryFn 을 한 틱 미뤄 시작할 때 배치가 쪼개진다.)
+ *   - 청크는 동시성 상한을 둔 **병렬**(직렬 for-await 였다 — 200명이면 4회 순차 왕복이었다).
+ *     백엔드는 `p-limit` 을 쓰지만 프론트는 그 패키지가 ESM-only 라 jest 변환 대상 밖이다 —
+ *     쓰는 기능이 "동시 N개"뿐이라 아래 `mapWithConcurrency` 로 대신한다.
+ */
+
 const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,256}$/;
+const BULK_CHUNK_SIZE = 50;   // /user/bulk 의 accountId 최대 개수
+const BULK_CONCURRENCY = 3;   // 동시 왕복 상한(백엔드 p-limit 관례와 같은 취지)
 
-export const fetchBulkUsers = async (accountIds = []) => {
+export const isValidAccountId = (id) => typeof id === 'string' && ACCOUNT_ID_PATTERN.test(id);
+
+const chunkArray = (arr, size) => {
+    const chunks = [];
+    for (let i = 0; i < arr.length; i += size) {
+        chunks.push(arr.slice(i, i + size));
+    }
+    return chunks;
+};
+
+/** 동시 실행을 `limit` 개로 묶어 map 한다. 결과 순서는 입력 순서 그대로. */
+const mapWithConcurrency = async (items, limit, worker) => {
+    const results = new Array(items.length);
+    let cursor = 0;
 
-    const safeList = accountIds.filter(
-        id => typeof id === 'string' && ACCOUNT_ID_PATTERN.test(id)
+    const runner = async () => {
+        while (cursor < items.length) {
+            const index = cursor++;
+            results[index] = await worker(items[index]);
+        }
+    };
+
+    await Promise.all(
+        Array.from({length: Math.min(limit, items.length)}, runner),
     );
+    return results;
+};
+
+/**
+ * 청크 1회 왕복. `executeRequest` 는 throw 하지 않고 `{success:false,error}` 를 돌려주므로
+ * **`values` 배열 유무**로 성공/실패를 가른다(실패는 null).
+ */
+const fetchChunk = async (chunk) => {
+    const res = await executeRequest('getBulkUser', {
+        accountId: chunk,
+        maxResults: BULK_CHUNK_SIZE,
+    });
+    return Array.isArray(res?.values) ? res.values : null;
+};
 
+/**
+ * accountId[] → user[] (한 번에 전량). 실패한 청크는 조용히 빠진다(종전 동작 그대로).
+ * 개별 캐시가 필요 없는 호출부(`useWorkListQueries`)가 쓴다.
+ */
+export const fetchBulkUsers = async (accountIds = []) => {
+    const safeList = accountIds.filter(isValidAccountId);
     if (safeList.length === 0) return [];
 
-    const chunks = chunkArray(safeList, 50);
-    const results = [];
+    const chunks = chunkArray(safeList, BULK_CHUNK_SIZE);
+    const results = await mapWithConcurrency(chunks, BULK_CONCURRENCY, fetchChunk);
+    return results.flatMap(values => values ?? []);
+};
+
+// ── 사람 단위 로더 (마이크로 배치) ────────────────────────────────────────────
+const pendingWaiters = new Map(); // accountId → [{resolve, reject}]
+let flushScheduled = false;
+
+const flush = async () => {
+    flushScheduled = false;
+    const waitersById = new Map(pendingWaiters);
+    pendingWaiters.clear();
 
-    for (const chunk of chunks) {
-        const res = await executeRequest('getBulkUser', {
-            accountId: chunk,
-            maxResults: 50,
-        });
-        if (Array.isArray(res?.values)) {
-            results.push(...res.values);
+    const ids = [...waitersById.keys()];
+
+    await mapWithConcurrency(chunkArray(ids, BULK_CHUNK_SIZE), BULK_CONCURRENCY, async (chunk) => {
+        let values = null;
+        let failure = null;
+        try {
+            values = await fetchChunk(chunk);
+        } catch (error) {
+            failure = error;
         }
-    }
-    return results;
+
+        if (!values) {
+            // 실패는 **거부**한다 — resolve(null) 로 넘기면 "없는 사용자"로 캐시에 굳는다.
+            const error = failure ?? new Error('getBulkUser failed');
+            chunk.forEach(id => waitersById.get(id)?.forEach(w => w.reject(error)));
+            return;
+        }
+
+        const byId = new Map(values.filter(u => u?.accountId).map(u => [u.accountId, u]));
+        chunk.forEach(id => waitersById.get(id)?.forEach(w => w.resolve(byId.get(id) ?? null)));
+    });
 };
 
-const chunkArray = (arr, size) => {
-    const chunks = [];
-    for (let i = 0; i < arr.length; i += size) {
-        chunks.push(arr.slice(i, i + size));
+/**
+ * accountId 1명 → user | null. 같은 틱의 요청은 한 배치로 묶여 `/user/bulk` 1회가 된다.
+ * (없는 사용자는 `null` — react-query 는 `undefined` 를 캐시하지 못한다.)
+ */
+export const loadUserInfo = (accountId) => new Promise((resolve, reject) => {
+    if (!isValidAccountId(accountId)) {
+        resolve(null);
+        return;
     }
-    return chunks;
-};
+    const waiters = pendingWaiters.get(accountId) ?? [];
+    waiters.push({resolve, reject});
+    pendingWaiters.set(accountId, waiters);
+
+    if (!flushScheduled) {
+        flushScheduled = true;
+        setTimeout(flush, 0);
+    }
+});
warning: in the working copy of 'static/ui/src/utils/jiraApi/users/getUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/useJiraUserInfos.js', LF will be replaced by CRLF the next time Git touches it

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$targets = @('"'static/ui/src/components/feedback/ToastFlags.js','static/ui/src/constants/tabs.js','static/ui/src/components/tabs/CommonTab.jsx','static/ui/src/components/select/UserSearchSelect.jsx','static/ui/src/components/table/TableSurface.jsx','static/ui/src/components/table/tableSort.js'); foreach ("'$file in $targets) { Write-Output "--- $file"; $line=0; Get-Content $file | ForEach-Object { $line++; '"'{0,4}: {1}' -f "'$line, $_ } }; Write-Output '"'--- tab callers'; rg -n -C 5 '<CommonTab|CommonTab\\(' static/ui/src; Write-Output '--- UserSearch callers'; rg -n -C 3 '<UserSearchSelect|UserSearchSelect\\(' static/ui/src" in C:\CloudJira\moves-workforce
 succeeded in 3971ms:
--- static/ui/src/components/feedback/ToastFlags.js
   1: import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
   2: import Flag, { FlagGroup } from '@atlaskit/flag';
   3: import SuccessIcon from '@atlaskit/icon/core/status-success';
   4: import ErrorIcon from '@atlaskit/icon/core/status-error';
   5: import InformationIcon from '@atlaskit/icon/core/status-information';
   6: import { token } from '@atlaskit/tokens';
   7: 
   8: const ICON_MAP = {
   9:     success: <SuccessIcon label="success" color={token('color.icon.success', '#22A06B')} />,
  10:     info:<InformationIcon label='info' color={token('color.icon.information',"#357DE8")}/>,
  11:     error: <ErrorIcon label="error" color={token('color.icon.danger','#C9372C')} />,
  12: };
  13: 
  14: // ?뚮┝ ?숈옉 ?쒕떇: 吏㏐쾶 ?대떎 ?먮룞?쇰줈 ?щ씪吏怨??섎룞 X 遺덊븘??, 留롮씠 ?볦씠吏 ?딄쾶 理쒖떊 N媛쒕쭔 ?좎?.
  15: const AUTO_DISMISS_MS = 2500; // 湲곗〈 AutoDismissFlag 8珥????뚮┝泥섎읆 吏㏐쾶
  16: const MAX_VISIBLE = 3;        // ?볦엫 諛⑹?: ?붾㈃??理쒖떊 3媛쒓퉴吏留?
  17: 
  18: // ?좎뒪??flags) ?곹깭瑜??먯껜?곸쑝濡??뚯쑀?섎뒗 ?뚮뜑 而댄룷?뚰듃.
  19: // ?곹깭瑜??ш린??媛?ъ꽌, ?좎뒪?멸? ?④퀬/?щ씪吏???toast瑜?留뚮뱺 ?곸쐞 而댄룷?뚰듃媛
  20: // 由щ젋?붾릺吏 ?딅룄濡??쒕떎(?곸쐞 由щ젋?붽? 吏꾪뻾 以묒씤 ?ъ슜???숈옉??諛⑺빐?섎뜕 臾몄젣 ?닿껐).
  21: function FlagPortal({ register }) {
  22:     const [flags, setFlags] = useState([]);
  23:     const seq = useRef(0);
  24:     const timers = useRef({}); // id ??setTimeout ?몃뱾
  25: 
  26:     const remove = useCallback((id) => {
  27:         setFlags((prev) => prev.filter((flag) => flag.id !== id));
  28:         if (timers.current[id]) {
  29:             clearTimeout(timers.current[id]);
  30:             delete timers.current[id];
  31:         }
  32:     }, []);
  33: 
  34:     useEffect(() => {
  35:         register((payload) => {
  36:             const id = ++seq.current;
  37:             // 理쒖떊??留??욎뿉 異붽??섎릺 MAX_VISIBLE 媛쒓퉴吏留??좎?(珥덇낵遺꾩? ?섎씪 ?볦엫 諛⑹?).
  38:             setFlags((prev) => [{ id, ...payload }, ...prev].slice(0, MAX_VISIBLE));
  39:             // 吏㏃? ??대㉧濡??먮룞 ?쒓굅(?섎룞 X ?놁씠???뚮┝泥섎읆 ?щ씪吏?.
  40:             timers.current[id] = setTimeout(() => remove(id), AUTO_DISMISS_MS);
  41:         });
  42:     }, [register, remove]);
  43: 
  44:     // ?몃쭏?댄듃 ???⑥? ??대㉧ ?뺣━.
  45:     useEffect(() => () => {
  46:         Object.values(timers.current).forEach(clearTimeout);
  47:         timers.current = {};
  48:     }, []);
  49: 
  50:     return (
  51:         <FlagGroup onDismissed={remove}>
  52:             {flags.map((flag) => (
  53:                 <Flag
  54:                     key={flag.id}
  55:                     id={flag.id}
  56:                     icon={ICON_MAP[flag.appearance]}
  57:                     title={flag.title}
  58:                     description={flag.description}
  59:                 />
  60:             ))}
  61:         </FlagGroup>
  62:     );
  63: }
  64: 
  65: export default function ToastFlags() {
  66:     // emit ?⑥닔??FlagPortal??留덉슫?몃릺硫??깅줉?쒕떎. ref?쇱꽌 ?몄텧??由щ젋?붾? ?좊컻?섏? ?딅뒗??
  67:     const emitRef = useRef(null);
  68:     const register = useCallback((emit) => {
  69:         emitRef.current = emit;
  70:     }, []);
  71:     const show = useCallback((payload) => {
  72:         emitRef.current?.(payload);
  73:     }, []);
  74: 
  75:     /*
  76:      * ?뵶 諛섑솚 媛앹껜??**??踰덈쭔** 留뚮뱺??(?깅뒫 媛먯궗 P1-3).
  77:      *
  78:      * ?덉쟾??留??뚮뜑 ??媛앹껜 + ??`FlagUI` element ??? ??toast 瑜??먯떇?먭쾶 ?대젮蹂대궡???붾㈃
  79:      * (`ProjectDetailPage` ??`ProjectDetailTabs`)?먯꽌??洹??꾩씠?댄떚?곌? `useMemo` ?섏〈?깆뿉 ?ㅼ뼱媛
  80:      * **硫붾え媛 ?곴뎄??鍮쀫굹媛붽퀬**, 寃곌낵?곸쑝濡??쒖꽦 ??씠 遺紐??뚮뜑留덈떎 留덉슫???먭린?먮떎.
  81:      *
  82:      * `show`/`register` ??ref 湲곕컲 `useCallback([])` ?대씪 ?좎큹???뚮뜑 媛?遺덈??대떎 ??
  83:      * 利?留ㅻ쾲 ?덈줈 留뚮뱾 ?댁쑀媛 ?놁뿀?? ?몄텧遺?먯꽌 `useMemo(() => ToastFlags(), [])` 濡?媛먯떥??寃껋?
  84:      * ??洹쒖튃 ?꾨컲?대씪(2?뚯감 ?뚮뜑?먯꽌 ?대? ?낆씠 ?몄텧?섏? ?딅뒗?? ?ш린??怨좎튂??寃껋씠 ?좎씪???먮━??
  85:      */
  86:     return useMemo(() => ({
  87:         showSuccess: (title, description) =>
  88:             show({ title, description, appearance: 'success' }),
  89: 
  90:         showInfo: (title, description) =>
  91:             show({ title, description, appearance: 'info' }),
  92: 
  93:         showError: (title, description) =>
  94:             show({ title, description, appearance: 'error' }),
  95: 
  96:         FlagUI: <FlagPortal register={register} />,
  97:     }), [show, register]);
  98: }
--- static/ui/src/constants/tabs.js
   1: import React from 'react';
   2: import ProjectIcon from "@atlaskit/icon/core/project";
   3: import KanbanIcon from "@atlaskit/icon-lab/core/kanban";
   4: import CalendarIcon from "@atlaskit/icon/core/calendar";
   5: import PeopleGroupIcon from "@atlaskit/icon/core/people-group";
   6: import TaskIcon from "@atlaskit/icon/core/task";
   7: import DashboardIcon from "@atlaskit/icon/core/dashboard";
   8: import ChartBarIcon from "@atlaskit/icon/core/chart-bar";
   9: import ChartTrendIcon from "@atlaskit/icon/core/chart-trend";
  10: import CoinsIcon from "@atlaskit/icon-lab/core/coins";
  11: import ClockIcon from "@atlaskit/icon/core/clock";
  12: import PersonAddIcon from "@atlaskit/icon/core/person-add";
  13: 
  14: // ?? ??肄붾뱶 ?ㅽ뵆由ы똿 (2026-08-05 ?щ룄?? ??
  15: //
  16: // ?뵶 lazy ??씠 ?깅┰?섎뒗 **?꾩젣**: ??肄섑뀗痢좉? Suspense 寃쎄퀎 ?꾨옒???덉뼱???쒕떎(`CommonTab.jsx`).
  17: //    寃쎄퀎 ?놁씠 泥?겕瑜?湲곕떎由щŉ suspend ?섎㈃ React error #426 ???쒕떎 ??
  18: //    2026-08-04 ??lazy 瑜??꾨㈃ ?먮났???먯씤??諛붾줈 ?닿쾬?댁뿀怨??뱀떆 MainPageTabs ??寃쎄퀎媛 ?놁뿀??,
  19: //    ?대쾲?먮뒗 寃쎄퀎瑜?CommonTab ??怨녹쑝濡?紐⑥븘 紐⑤뱺 ??而⑦뀒?대꼫媛 鍮좎쭚?놁씠 蹂댄샇?쒕떎.
  20: //
  21: // 媛?而⑦뀒?대꼫??**泥???? ?뺤쟻** ??吏꾩엯 利됱떆 洹몃━???붾㈃?대씪 lazy 濡??먮㈃ 泥?겕 ?뺣났留???踰????붾떎.
  22: //
  23: // ?뵶 `component` ?먮뒗 **而댄룷?뚰듃 李몄“**瑜?二쇨퀬 ?몄옄??`props` 濡?遺꾨━?쒕떎 (?깅뒫 媛먯궗 P1-3).
  24: //    ?몃씪???붿궡??而댄룷?뚰듃(`() => <X .../>`)瑜?二쇰㈃ ??諛곗뿴???ㅼ떆 留뚮뱾?댁쭏 ?뚮쭏??
  25: //    element ??**type ???щ씪??* React 媛 ???쒕툕?몃━瑜??듭㎏濡??몃쭏?댄듃/由щ쭏?댄듃?쒕떎
  26: //    (ECharts ?ъ깮??쨌 grid ?ъ륫??쨌 ?ъ슜?먭? 嫄몄뼱???꾪꽣/?좏깮 珥덇린??.
  27: //    `props` 留?諛붾뚮뒗 寃껋? ?щ쭏?댄듃媛 ?꾨땲??由щ젋?붾떎 ??洹몃옒??`context` 泥섎읆 ?섏쨷???댁냼?섎뒗 媛믩룄 ?덉쟾?섎떎.
  28: import ProjectPage from '../pages/project/ProjectPage';
  29: import DashboardPage from '../pages/projectDetail/dashboard/DashboardPage';
  30: 
  31: const ProjectKanbanBoard = React.lazy(() => import('../pages/projectKanban/ProjectKanbanBoard'));
  32: const ProjectUserPanel = React.lazy(() => import('../pages/projectDetail/user/ProjectUserPanel')
  33:     .then(module => ({default: module.ProjectUserPanel})));
  34: const SalaryManagementPage = React.lazy(() => import('../pages/projectDetail/salary/SalaryManagementPage'));
  35: const AssignmentPage = React.lazy(() => import('../pages/projectDetail/assignment/AssignmentPage'));
  36: const ProjectWorkPanel = React.lazy(() => import('../pages/projectDetail/work/ProjectWorkPanel'));
  37: const ProjectCalender = React.lazy(() => import('../pages/projectDetail/calender/ProjectCalender'));
  38: const IssueAnalysisPage = React.lazy(() => import('../pages/projectDetail/analysisReport/issue/IssueAnalysisPage'));
  39: const ResourceAnalysisPage = React.lazy(() => import('../pages/projectDetail/analysisReport/resource/ResourceAnalysisPage')
  40:     .then(module => ({default: module.ResourceAnalysisPage})));
  41: const ProjectTeamAnalysisPage = React.lazy(() => import('../pages/projectDetail/analysisReport/team/ProjectTeamAnalysisPage'));
  42: const ProgressPage = React.lazy(() => import('../pages/projectDetail/progress/ProgressPage'));
  43: const CostPage = React.lazy(() => import('../pages/projectDetail/cost/CostPage'));
  44: const TaskHistoryPage = React.lazy(() => import('../pages/projectDetail/taskHistory/TaskHistoryPage'));
  45: 
  46: export const mainPageTabs = (t, canReadProject, canReadKanban) =>[
  47:     {
  48:         key: 'PROJECT',
  49:         label:  (
  50:             <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
  51:                 <ProjectIcon label="" />
  52:                 {t('common.tabs.project')}
  53:             </span>
  54:         ),
  55:         component: ProjectPage,
  56:         canRender: () => canReadProject,
  57:     },
  58:     {
  59:         key: 'kanban',
  60:         label:  (
  61:             <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
  62:                 <KanbanIcon label="" />
  63:                 {t('common.tabs.kanban')}
  64:             </span>
  65:         ),
  66:         component: ProjectKanbanBoard,
  67:         canRender: () => canReadKanban,
  68:     },
  69: ];
  70: 
  71: 
  72: 
  73: /**
  74:  * ???몄옄 ?쒖꽌??`components/tabs/ProjectDetailTabs.jsx` ?몄텧遺? **?뺥솗??* 留욎떠???쒕떎.
  75:  *   `canReadProject` ??P1-e(遺꾩꽍 > ?)?먯꽌 異붽??먮떎 ??`context` ?욎뿉 ?⑤떎.
  76:  */
  77: export const projectDetailTabs = (t,project_id,toast,canReadReport,canWriteProject,canReadCost,canReadProject,context) =>[
  78:     {
  79:         key: 'dashboard',
  80:         label:  (
  81:             <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
  82:                 <DashboardIcon label="" />
  83:                 {t('common.pages.dashboard')}
  84:             </span>
  85:         ),
  86:         component: DashboardPage,
  87:         props: {project_id},
  88:     },
  89:     {
  90:         key: 'projectUser',
  91:         label:  (
  92:             <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
  93:                 <PeopleGroupIcon label="" />
  94:                 {t('projectDetail.tabs.0')}
  95:             </span>
  96:         ),
  97:         children: [
  98:             {
  99:                 key: 'projectUserList',
 100:                 label: (
 101:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 102:                         <PeopleGroupIcon label="" />
 103:                         {t('projectDetail.tabs.userList')}
 104:                     </span>
 105:                 ),
 106:                 component: ProjectUserPanel,
 107:                 props: {project_id, toast},
 108:             },
 109:             {
 110:                 key: 'projectSalary',
 111:                 label: (
 112:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 113:                         <CoinsIcon label="" />
 114:                         {t('salary.tab.label')}
 115:                     </span>
 116:                 ),
 117:                 component: SalaryManagementPage,
 118:                 props: {project_id, toast},
 119:                 canRender: () => canReadCost,
 120:             },
 121:             {
 122:                 // ?묒뾽 諛곗젙 ???쎄린(?먮떒)???꾨줈?앺듃 ?곸꽭 吏꾩엯 沅뚰븳(PROJECT read)?대㈃ 異⑸텇?섍퀬,
 123:                 // ?곌린(諛곗젙 ?ㅽ뻾)??踰꾪듉 ?덈꺼?먯꽌 canWrite('PROJECT') + Jira ASSIGN_ISSUES 濡?寃뚯씠?낇븳??
 124:                 key: 'projectAssignment',
 125:                 label: (
 126:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 127:                         <PersonAddIcon label="" />
 128:                         {t('projectDetail.tabs.assignment')}
 129:                     </span>
 130:                 ),
 131:                 component: AssignmentPage,
 132:                 props: {project_id, toast},
 133:             },
 134:         ],
 135:     },
 136:     {
 137:         // ?묒뾽 愿由??뚯씠釉? 쨌 ?몃━ 쨌 媛꾪듃瑜???洹몃９?쇰줈 臾띔퀬, 洹몃９ ?덉뿉??酉곕? ?꾪솚?쒕떎.
 138:         // ????"媛숈? ?묒뾽(?댁뒋) 吏묓빀"???ㅻⅨ ?쒗쁽?대?濡???쓣 ?섎늻吏 ?딅뒗??
 139:         key: 'projectIssue',
 140:         label:  (
 141:             <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
 142:                 <TaskIcon label="" />
 143:                 {t('projectDetail.tabs.1')}
 144:             </span>
 145:         ),
 146:         component: ProjectWorkPanel,
 147:         props: {project_id, toast},
 148:     },
 149:     {
 150:         key: 'projectCalender',
 151:         label:  (
 152:             <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
 153:                 <CalendarIcon label="" />
 154:                 {t('projectDetail.tabs.calendar')}
 155:             </span>
 156:         ),
 157:         component: ProjectCalender,
 158:         props: {project_id, toast, context},
 159:     },
 160:     {
 161:         key: 'analysisReport',
 162:         label: (
 163:             <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
 164:                 <ChartBarIcon label="" />
 165:                 {t('projectDetail.tabs.analysisReport')}
 166:             </span>
 167:         ),
 168:         children: [
 169:             {
 170:                 key: 'issueAnalysis',
 171:                 label: (
 172:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 173:                         <TaskIcon label="" />
 174:                         {t('projectDetail.tabs.issueAnalysis')}
 175:                     </span>
 176:                 ),
 177:                 component: IssueAnalysisPage,
 178:                 props: {project_id},
 179:             },
 180:             {
 181:                 key: 'resourceAnalysis',
 182:                 label: (
 183:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 184:                         <PeopleGroupIcon label="" />
 185:                         {t('projectDetail.tabs.resourceAnalysis')}
 186:                     </span>
 187:                 ),
 188:                 component: ResourceAnalysisPage,
 189:                 props: {project_id},
 190:             },
 191:             {
 192:                 // ? ???대떦 ? 諛곗젙 ???ㅼ젣 ?뚰겕濡쒓렇 湲곗뿬???議?P1-e). ?몃젰 遺꾩꽍 ?ㅼ쓬???⑤떎.
 193:                 // ?뵶 REPORT 留뚯쑝濡쒕뒗 ?щ엺?뷀? 異?`findProjectusersByProjectId` = PROJECT read)??紐?諛쏅뒗??
 194:                 // ??沅뚰븳???놁뼱??**??쓣 ?④린吏 ?딅뒗??* ???좏깮?섎㈃ `NoPermissionPage` 媛 ?щ떎(由ы룷 愿濡).
 195:                 key: 'projectTeamAnalysis',
 196:                 label: (
 197:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 198:                         <PeopleGroupIcon label="" />
 199:                         {t('projectDetail.tabs.teamAnalysis')}
 200:                     </span>
 201:                 ),
 202:                 component: ProjectTeamAnalysisPage,
 203:                 props: {project_id},
 204:                 canRender: () => canReadReport && canReadProject,
 205:             },
 206:             {
 207:                 key: 'projectProgress',
 208:                 label: (
 209:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 210:                         <ChartTrendIcon label="" />
 211:                         {t('projectDetail.tabs.progressAnalysis')}
 212:                     </span>
 213:                 ),
 214:                 component: ProgressPage,
 215:                 props: {project_id},
 216:                 canRender: () => canReadReport,
 217:             },
 218:             {
 219:                 key: 'projectCost',
 220:                 label: (
 221:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 222:                         <CoinsIcon label="" />
 223:                         {t('cost.tab.label')}
 224:                     </span>
 225:                 ),
 226:                 component: CostPage,
 227:                 props: {project_id},
 228:                 canRender: () => canReadCost,
 229:             },
 230:             {
 231:                 // ?묒뾽 ?대젰? "?댁뒋 紐⑸줉???ㅻⅨ 酉?媛 ?꾨땲???쒓컙異?遺꾩꽍(踰덉뾽쨌scope creep)?대씪
 232:                 // ?묒뾽 洹몃９???꾨땶 遺꾩꽍 由ы룷?몄뿉 ?붾떎.
 233:                 key: 'taskHistory',
 234:                 label: (
 235:                     <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
 236:                         <ClockIcon label="" />
 237:                         {t('taskHistory.tab.label')}
 238:                     </span>
 239:                 ),
 240:                 component: TaskHistoryPage,
 241:                 props: {project_id},
 242:                 canRender: () => canWriteProject,
 243:             },
 244:         ]
 245:     },
 246: ];
--- static/ui/src/components/tabs/CommonTab.jsx
   1: import React, { Suspense, useState } from 'react';
   2: import Tabs, { Tab, TabList } from '@atlaskit/tabs';
   3: import DropdownTab from './DropdownTab';
   4: import NoPermissionPage from '../../pages/nonPermission/NoPermissionPage';
   5: import { PageSkeleton } from '../skeleton/Skeleton';
   6: import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
   7: 
   8: const getFirstKey = (tabs) => {
   9:     return tabs[0]?.children?.[0]?.key ?? tabs[0]?.key;
  10: }
  11: 
  12: const findActiveConfig = (tabs, activeTab)  =>  {
  13:     for (const tab of tabs) {
  14:         if (tab.key === activeTab) return { config: tab, component: tab.component };
  15:         const child = tab.children?.find(c => c.key === activeTab);
  16:         // ?먯떇 ??씠 active 硫??먯떇??config(canRender ??瑜?諛섑솚?댁빞 ?먯떇 沅뚰븳 寃뚯씠?멸? ?숈옉?쒕떎.
  17:         if (child) return { config: child, component: child.component };
  18:     }
  19:     return {};
  20: }
  21: 
  22: export default function CommonTab({ tabs }) {
  23:     const [activeTab, setActiveTab] = useState(() => getFirstKey(tabs));
  24: 
  25:     const { config, component: ActivePage } = findActiveConfig(tabs, activeTab);
  26:     const canRender = config?.canRender ? config.canRender() : true;
  27:     /*
  28:      * ???몄옄??`props` 濡?諛쏅뒗????`component` ??而댄룷?뚰듃 **李몄“**?ъ빞 ??諛곗뿴???ㅼ떆 留뚮뱾?댁졇??
  29:      * element type ???좎??섍퀬, ?쒖꽦 ??씠 ?щ쭏?댄듃?섏? ?딅뒗??P1-3, 怨꾩빟? `constants/tabs.js` 二쇱꽍).
  30:      */
  31:     const pageProps = config?.props;
  32: 
  33:     const selectedIndex = tabs.findIndex(
  34:         tab => tab.key === activeTab || tab.children?.some(c => c.key === activeTab)
  35:     );
  36: 
  37:     return (
  38:         <Tabs
  39:             selected={selectedIndex}
  40:             onChange={(index) => {
  41:                 const tab = tabs[index];
  42:                 if (tab.children) return;
  43:                 setActiveTab(tab.key);
  44:             }}
  45:         >
  46:             <TabList>
  47:                 {tabs.map((tab) => (
  48:                     <Tab key={tab.key}>
  49:                         {tab.children ? (
  50:                             <DropdownTab
  51:                                 label={tab.label}
  52:                                 items={tab.children}
  53:                                 onSelect={(key) => setActiveTab(key)}
  54:                             />
  55:                         ) : (
  56:                             tab.label
  57:                         )}
  58:                     </Tab>
  59:                 ))}
  60:             </TabList>
  61: 
  62:             {/*
  63:               * ?뵶 lazy ??씠 ?깅┰?섎뒗 議곌굔? **??Suspense 寃쎄퀎**??
  64:               *
  65:               *   ??而댄룷?뚰듃媛 lazy ???꾪솚 以?泥?겕瑜?湲곕떎由щŉ suspend ?섎뒗?? ?대? 諛쏆쓣 寃쎄퀎媛 ?놁쑝硫?
  66:               *   React error #426("A component suspended while responding to synchronous input")???쒕떎.
  67:               *   2026-08-04 ??lazy 瑜??꾨㈃ ?먮났???먯씤???닿쾬?댁뿀?? 寃쎄퀎瑜?CommonTab ??怨녹뿉 ?먯뼱
  68:               *   紐⑤뱺 ??而⑦뀒?대꼫(MainPageTabs / ProjectDetailTabs)媛 鍮좎쭚?놁씠 蹂댄샇?섍쾶 ?쒕떎.
  69:               *
  70:               *   ??startTransition ?쇰줈 "?댁쟾 ?붾㈃ ?좎?"瑜??몃━吏 留?寃??????깆? `index.js` 媛
  71:               *     ReactDOM.render(legacy root)??concurrent 湲곕뒫???숈옉?섏? ?딅뒗??
  72:               *     startTransition ?덉쓽 ?낅뜲?댄듃???숆린濡?泥섎━?섍퀬 useTransition ??isPending ? ??긽 false ??
  73:               *     (洹몃젃寃??섎젮硫?createRoot ?꾪솚???좏뻾?쇱빞 ?섍퀬, 洹멸굔 ???꾩껜 ?뚭? 寃利앹씠 ?꾩슂??蹂꾧굔?대떎.)
  74:               */}
  75:             {ActivePage && (
  76:                 /*
  77:                  * key={activeTab} ??寃쎄퀎????踰??먮윭瑜??≪쑝硫?怨꾩냽 ?먮윭 ?붾㈃??蹂댁뿬二쇰?濡?
  78:                  * ??쓣 ??린硫??덈줈 留덉슫?몃뤌 由ъ뀑?섍쾶 ?쒕떎. ?닿쾶 ?놁쑝硫?泥?겕 ?섎굹媛 ?ㅽ뙣????
  79:                  * 硫姨≫븳 ?ㅻⅨ ??퉴吏 ?먮윭 ?붾㈃???쒕떎.
  80:                  */
  81:                 <ChunkErrorBoundary key={activeTab}>
  82:                     <Suspense fallback={<PageSkeleton />}>
  83:                         {canRender ? <ActivePage {...pageProps} /> : <NoPermissionPage />}
  84:                     </Suspense>
  85:                 </ChunkErrorBoundary>
  86:             )}
  87:         </Tabs>
  88:     );
  89: }
--- static/ui/src/components/select/UserSearchSelect.jsx
   1: import {useCallback, useEffect, useRef, useState} from "react";
   2: import {invoke} from "@forge/bridge";
   3: import Select, {CheckboxOption} from '@atlaskit/select';
   4: import {useI18nStore} from "../../stores/useI18nStore";
   5: import {useDebounce} from "../../utils/useDebounce";
   6: import {token} from "@atlaskit/tokens";
   7: 
   8: /*
   9: *  ?ъ슜??寃??李?
  10: *  value: ?꾩옱 ?좏깮???ъ슜??紐⑸줉
  11: *  onChange: ?좏깮 ?곹깭
  12: *  onApply: ?좏깮 ?꾨즺 ????踰덈쭔 ?몄텧 -> 寃?됱갹 諛붽묑?곸뿭???좏깮 ?덉쓣 ??
  13: * */
  14: 
  15: const thinSelectStyles = {
  16:     control: (base, state) => ({
  17:         ...base,
  18:         minHeight: '32px',
  19:         borderWidth: '1px',
  20:         borderColor: state.isFocused
  21:             ? token('color.border.focused', '#0052CC')
  22:             : token('color.border', '#DFE1E6'),
  23:         boxShadow: 'none',
  24:         '&:hover': {
  25:             borderColor: token('color.border.focused', '#0052CC'),
  26:         },
  27:     }),
  28: };
  29: 
  30: export const UserSearchSelect = ({ value, onChange, onApply}) =>{
  31:     const [options, setOptions] = useState([]); // 紐⑸줉
  32:     const [page, setPage] = useState(0);  // ?ㅽ겕濡??섏씠吏?
  33:     const [keyword, setKeyword] = useState(''); // 寃?됱뼱
  34:     const [loading, setLoading] = useState(false);
  35:     const [hasMore, setHasMore] = useState(true); // ?ㅽ겕濡??섏씠吏???
  36:     const t = useI18nStore(s => s.t);
  37: 
  38:     // 湲곕낯 紐⑸줉(寃?됱뼱 ?놁쓬) 罹먯떆: 理쒖큹 ?ㅽ뵂 ??鍮좊Ⅴ寃?蹂댁뿬二쇨린??
  39:     const defaultCacheRef = useRef(null);
  40:     // 以묐났 ?몄텧 諛⑹?(臾댄븳?ㅽ겕濡?諛⑹뼱) ??**寃??nextPage 0)?먮뒗 嫄몄? ?딅뒗??*
  41:     const loadingRef = useRef(false);
  42:     // ?붿껌 ??쟾 諛⑹?: 留덉?留??붿껌留?諛섏쁺
  43:     const reqSeqRef = useRef(0);
  44:     // ?ъ슜?먭? ?ㅼ젣濡???댄븨???ㅼ뿉留?寃?됱쓣 嫄대떎(理쒖큹 紐⑸줉? 硫붾돱 ?ㅽ뵂???대떦)
  45:     const hasTypedRef = useRef(false);
  46: 
  47:     /*
  48:      * 寃?됱뼱???붾컮?댁뒪(300ms, 由ы룷 愿濡 `useDebounce`) ??**??踰덈쭔** 議고쉶?쒕떎.
  49:      * ?덉쟾?????낅젰留덈떎 `invoke('searchUser')` 瑜?利됱떆 ?덇퀬("?띻만?? = 6??, 寃뚮떎媛
  50:      * 吏꾪뻾 以??붿껌???덉쑝硫??꾨옒 媛?쒓? 洹??낅젰??**踰꾨젮??* 留덉?留?湲?먯쓽 寃?됱씠 ?꾩삁 ?⑥? ?딄퀬
  51:      * ??寃곌낵媛 ?⑤뒗 寃쎈줈媛 ?덉뿀??P1-8).
  52:      */
  53:     const debouncedKeyword = useDebounce(keyword, 300);
  54: 
  55:     // search ?ъ슜??寃?됱뼱, nextPage ?ㅽ겕濡??섏씠吏?
  56:     const loadUsers = useCallback(async ({ search, nextPage = 0 }) => {
  57:         // ?섏씠吏뺣쭔 以묐났 諛⑹? ????寃?됱? 吏꾪뻾 以??붿껌???덉뼱??諛섎뱶??諛쒖궗?쒕떎(?낅젰 ?좎떎 湲덉?)
  58:         if (nextPage > 0 && loadingRef.current) return;
  59: 
  60:         // 罹먯떆 議곌굔: 寃?됱뼱 ?녾퀬 泥??섏씠吏?대ŉ 罹먯떆 議댁옱?섎㈃ 諛붾줈 ?ъ슜
  61:         if (!search && nextPage === 0 && defaultCacheRef.current) {
  62:             // ?뵶 吏꾪뻾 以??붿껌??臾댄슚?뷀븳???????섎㈃ 寃?됱뼱瑜?吏??吏곹썑 ??寃??寃곌낵媛 ?ㅻ뒭寃???뼱?대떎
  63:             reqSeqRef.current += 1;
  64:             const cached = defaultCacheRef.current;
  65:             setOptions(cached.options);
  66:             setHasMore(cached.hasMore);
  67:             setPage(0);
  68:             return;
  69:         }
  70: 
  71:         loadingRef.current = true;
  72:         setLoading(true);
  73: 
  74:         const mySeq = ++reqSeqRef.current;
  75: 
  76:         try {
  77:             const res = await invoke("searchUser", {
  78:                 keyword: search,
  79:                 page: nextPage,
  80:                 size: 10,
  81:             });
  82: 
  83:             // 理쒖떊 ?붿껌???꾨땲硫??먭린
  84:             if (mySeq !== reqSeqRef.current) return;
  85: 
  86:             const users = res?.data?.user ?? [];
  87:             const mapped = users.map((u) => ({
  88:                 label: u.emailAddress ? `${u.displayName} (${u.emailAddress})` : u.displayName,
  89:                 value: u.accountId,
  90:             }));
  91: 
  92:             if (nextPage === 0) {
  93:                 setOptions(mapped);
  94:             } else {
  95:                 setOptions((prev) => [...prev, ...mapped]); // 湲곗〈 媛믪뿉 異붽???set
  96:             }
  97: 
  98: 
  99:             const nextHasMore = res?.data?.hasMore ?? false;
 100:             setHasMore(nextHasMore);
 101:             setPage(nextPage);
 102: 
 103:             if (!search && nextPage === 0) {
 104:                 defaultCacheRef.current = {
 105:                     options: mapped,
 106:                     hasMore: nextHasMore,
 107:                     page: 0,
 108:                 };
 109:             }
 110:         } finally {
 111:             // ?ㅻ뒭寃??앸궃 ???붿껌??**吏꾪뻾 以묒씤 理쒖떊 ?붿껌??* 濡쒕뵫 ?쒖떆瑜??꾩? ?딄쾶 ?쒕떎
 112:             if (mySeq === reqSeqRef.current) {
 113:                 loadingRef.current = false;
 114:                 setLoading(false);
 115:             }
 116:         }
 117:     },[]);
 118: 
 119:     const handleInputChange = useCallback(
 120:         (val, actionMeta) => {
 121:             if (actionMeta.action !== "input-change") return val;
 122: 
 123:             hasTypedRef.current = true;
 124:             setKeyword(val);
 125:             setHasMore(true); // ??寃???쒖옉?대?濡?hasMore 珥덇린??
 126:             setPage(0);       // ??寃???쒖옉?대?濡?page 由ъ뀑
 127: 
 128:             return val;       // ?ㅼ젣 議고쉶???붾컮?댁뒪??媛믪쑝濡??꾨옒 effect 媛 1?뚮쭔 ?몃떎
 129:         },
 130:         []
 131:     );
 132: 
 133:     useEffect(() => {
 134:         if (!hasTypedRef.current) return;
 135:         loadUsers({ search: debouncedKeyword, nextPage: 0 });
 136:     }, [debouncedKeyword, loadUsers]);
 137: 
 138:     // 而댄룷?뚰듃 ?대? ?ㅽ겕濡??대졇?????ㅼ쓬 ?섏씠吏濡?
 139:     const handleMenuScrollToBottom = useCallback(() => {
 140:         if (!hasMore) return;
 141:         // ?붾㈃?????덈뒗 紐⑸줉??湲곗?? **?붾컮?댁뒪??* 寃?됱뼱???낅젰 以묒씤 湲?먭? ?꾨땲??
 142:         loadUsers({ search: debouncedKeyword, nextPage: page + 1 });
 143:     }, [hasMore, debouncedKeyword, page, loadUsers]);
 144: 
 145:     // 而댄룷?뚰듃 ?대┃??理쒖큹 濡쒕뱶
 146:     const handleMenuOpen = useCallback(() => {
 147:         if (options.length === 0) {
 148:             loadUsers({ search: "", nextPage: 0 });
 149:         }
 150:     }, [options.length, loadUsers]);
 151: 
 152:     // ?좏깮 ?앸궗??????踰덈쭔 ?몄텧
 153:     const handleBlur = () => {
 154:         onApply?.();
 155:     };
 156: 
 157:     return (
 158:         <Select
 159:             isMulti
 160:             components={{ Option: CheckboxOption }} // 泥댄겕 諛뺤뒪 ?듭뀡 ?쒖꽦
 161:             options={options}
 162:             isLoading={loading}
 163:             onInputChange={handleInputChange}
 164:             onMenuScrollToBottom={handleMenuScrollToBottom}
 165:             onMenuOpen={handleMenuOpen}
 166:             onBlur={handleBlur}
 167:             placeholder={t('user.table.filter.user')}
 168:             closeMenuOnSelect={false}
 169:             onChange={onChange}
 170:             value={value}
 171:             styles={thinSelectStyles}
 172:         />
 173:     );
 174: }
--- static/ui/src/components/table/TableSurface.jsx
   1: import React, { useCallback, useMemo, useRef } from 'react';
   2: import DynamicTable from '@atlaskit/dynamic-table';
   3: 
   4: import { useI18nStore } from '../../stores/useI18nStore';
   5: import ColumnResizeOverlay from './ColumnResizeOverlay';
   6: import { buildSkeletonRows } from './skeletonRows';
   7: import { adaptHead, adaptRows, resolveSortableColumns } from './tableSort';
   8: import useStableColumnWidths, { headSignature } from './useStableColumnWidths';
   9: import './table.css';
  10: 
  11: /**
  12:  * DynamicTable 湲곕컲 ??3醫?`CommonTable`/`PagingTable`/`CursorPagingTable`)??怨듭쑀?섎뒗 **??*.
  13:  *
  14:  * ?뺣젹 ?대뙌?걔룻룺 ?숆껐쨌由ъ궗?댁쫰 ?ㅻ쾭?덉씠쨌?ㅼ펷?덊넠??**?ш린 ??怨녹뿉?쒕쭔** 援ы쁽?쒕떎.
  15:  * 媛쒕퀎 ?붾㈃(63媛???? ?꾨Т寃껊룄 怨좎튂吏 ?딆븘???꾨옒瑜?洹몃?濡??삳뒗??
  16:  *   - 而щ읆 ??씠 泥??ㅻ뜲?댄꽣 ?섏씤???쒖젏 洹몃?濡??숆껐(?섏씠吏 ?꾪솚쨌?꾪꽣쨌?뺣젹??遺덈?)
  17:  *   - ?ㅻ뜑 寃쎄퀎 ?쒕옒洹몃줈 ??議곗젅(?붾툝?대┃?쇰줈 蹂듦?)
  18:  *   - **?뺣젹???ㅼ젣濡??섎뒗 而щ읆?먮쭔** ?붿궡?쒓? ?⑤뒗??二쎌? ?댄룷?섏뒪 ?쒓굅)
  19:  *
  20:  * ??而댄룷?뚰듃???대??⑹씠?????붾㈃? `CommonTable`/`PagingTable`/`CursorPagingTable` ???대떎.
  21:  *
  22:  * ?? ?대뙌??鍮꾩슜?????(?깅뒫 媛먯궗 P1-13) ????????????????????????????????????
  23:  * `rows` 瑜?硫붾え?섏? ?딅뒗 ?몄텧遺媛 ?덈컲?대씪(35怨?以?17怨? ?대뙌?곌? ?뚮뜑留덈떎 ?ㅼ떆 ?덈떎.
  24:  * "?쒓렇?덉쿂瑜?留뚮뱾??媛믪씠 媛숈쑝硫??듭㎏濡?嫄대꼫?곌린"??**?ш린???깅┰?섏? ?딅뒗??*:
  25:  *   - ?대뙌?곗쓽 ?곗텧臾쇱? ???`content`(洹??뚮뜑?먯꽌 ?덈줈 留뚮뱾?댁쭊 JSX)瑜?洹몃?濡??ㅼ뼱 ?섎Ⅸ??
  26:  *     ?뺣젹媛믩쭔 媛숇떎怨????곗텧臾쇱쓣 ?ъ궗?⑺븯硫?**?댁슜??諛붾??쒓? ???붾㈃?쇰줈 援노뒗??*(?먮윭 ?놁씠).
  27:  *   - 洹몃젃?ㅺ퀬 ?댁슜源뚯? 鍮꾧탳?섎젮硫??대뙌?곗? 媛숈? O(?됁쀬뿴) ?쒗쉶媛 ?꾩슂?섎떎 ???꾨굜 寃껋씠 ?녿떎.
  28:  * 洹몃옒??諛⑺뼢??諛붽퓭 **?곸닔瑜?以꾩???*: 而щ읆??諛곗뿴 3媛쑣룹닚??4????諛곗뿴 1媛쑣룹닚??2??`tableSort.adaptRows`),
  29:  * ?뺣젹 ?먯젙? 媛믪씠 媛덈━??利됱떆 議곌린 醫낅즺. 洹몃━怨?**?뺤젙?곸쑝濡??쏅룎???좎씪??寃쎈줈**(濡쒕뵫 以? * ?ㅼ펷?덊넠 ???ъ깮????硫붾え濡?留됱븯?? ?몄텧遺 17怨녹? ?먮?吏 ?딅뒗??
  30:  */
  31: 
  32: const EMPTY_ROWS = [];
  33: export default function TableSurface({
  34:     head,
  35:     rows,
  36:     isLoading = false,
  37:     skeletonRowCount = 5,
  38:     rowsPerPage,
  39:     defaultPage,
  40:     emptyView,
  41:     isFixedSize = false,
  42:     isResizable = true,
  43:     stableWidths = true,
  44:     style,
  45:     className,
  46:     footer,
  47: }) {
  48:     const t = useI18nStore(s => s.t);
  49:     const wrapperRef = useRef(null);
  50: 
  51:     const labels = useMemo(() => ({
  52:         asc: t('common.table.sortAsc'),
  53:         desc: t('common.table.sortDesc'),
  54:         button: t('common.table.sortButton'),
  55:     }), [t]);
  56: 
  57:     /*
  58:      * head ???몄텧遺 ?ㅼ닔媛 ?뚮뜑留덈떎 ?몃씪???앹꽦?섎?濡?**媛앹껜 李몄“瑜?硫붾え ?ㅻ줈 ?곕㈃ 留??뚮뜑 ?ш퀎??*?쒕떎.
  59:      * ?뺣젹 ?먯젙???꾩슂??寃껋? 而щ읆 key 紐⑸줉肉먯씠???쒓렇?덉쿂 臾몄옄?대줈 ??좏븳??
  60:      */
  61:     const signature = headSignature(head);
  62: 
  63:     // rows 誘몄쟾????**媛숈? 鍮?諛곗뿴**???대떎 ??留??뚮뜑 ??`[]` 硫??꾨옒 硫붾え媛 ?꾨? ?쏅룉??    const dataRows = Array.isArray(rows) ? rows : EMPTY_ROWS;
  64: 
  65:     /*
  66:      * ?뵶 ?ㅼ펷?덊넠 ?됱? **諛섎뱶??硫붾え**?쒕떎.
  67:      *   `buildSkeletonRows` ??留??몄텧 ??諛곗뿴?대씪, 濡쒕뵫 以묒뿉???대뙌??硫붾え媛 **?뺤젙?곸쑝濡?* 鍮쀫굹媛붾떎
  68:      *   (濡쒕뵫 ?곹깭?먯꽌 遺紐④? 由щ젋?붾맆 ?뚮쭏??O(?됁쀬뿴) ?щ???.
  69:      */
  70:     const effectiveRows = useMemo(
  71:         () => (isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows),
  72:         // ???꾨옒 sortable/adaptedRows ? 媛숈? ?댁쑀濡?head ???signature 瑜?蹂몃떎(留??뚮뜑 ??媛앹껜).
  73:         [isLoading, signature, skeletonRowCount, dataRows],
  74:     );
  75: 
  76:     /*
  77:      * 濡쒕뵫 以묒뿉??**吏곸쟾 ?먯젙??遺숇뱺??** ?ㅼ펷?덊넠 ?됱? ? key 媛 而щ읆 key ??     * 洹몃?濡??먯젙?섎㈃ "?뺣젹 遺덇?"媛 ?섏뼱 ?붿궡?쒓? 留?濡쒕뵫留덈떎 源쒕묀?몃떎.
  78:      */
  79:     const lastSortableRef = useRef(null);
  80:     const sortable = useMemo(() => {
  81:         if (isLoading) {
  82:             const previous = lastSortableRef.current;
  83:             if (previous && previous.signature === signature) return previous.value;
  84:             return resolveSortableColumns(head, []);
  85:         }
  86:         return resolveSortableColumns(head, dataRows);
  87:         // ???섏〈?깆뿉 head 瑜??ｌ? ?딅뒗????留??뚮뜑 ??媛앹껜??硫붾え媛 臾대젰?댁쭊?? signature 媛 ??좏븳??
  88:     }, [signature, isLoading, dataRows]);
  89:     if (!isLoading) lastSortableRef.current = { signature, value: sortable };
  90: 
  91:     const adaptedRows = useMemo(
  92:         () => adaptRows(head, effectiveRows, sortable),
  93:         // ?꾩? 媛숈? ?댁쑀濡?head ???signature ????蹂?섏씠 head ?먯꽌 蹂대뒗 寃껋? 而щ읆 key 援ъ꽦肉먯씠??
  94:         [signature, effectiveRows, sortable],
  95:     );
  96:     // head ??硫붾え?섏? ?딅뒗????踰덉뿭쨌?댄똻 ??content 媛 諛붾뚯뿀?붾뜲 ?쒓렇?덉쿂媛 媛숈쑝硫????ㅻ뜑媛 ?⑤뒗??    const adaptedHead = adaptHead(head, sortable, labels);
  97: 
  98:     const { widths, theadHeight, tableWidth, gutter, setWidths, resetEdge } = useStableColumnWidths({
  99:         wrapperRef,
 100:         head,
 101:         rowCount: dataRows.length,
 102:         isLoading,
 103:         enabled: stableWidths !== false,
 104:     });
 105: 
 106:     // ?숆껐????? head.cells[].width(%) 濡??대젮蹂대궦????DynamicTable ??th/td ?묒そ??嫄몄뼱 以??    const frozenHead = widths && Array.isArray(adaptedHead?.cells)
 107:         ? { ...adaptedHead, cells: adaptedHead.cells.map((cell, i) => (cell ? { ...cell, width: widths[i] } : cell)) }
 108:         : adaptedHead;
 109: 
 110:     const getTableWidth = useCallback(
 111:         () => wrapperRef.current?.querySelector('table')?.getBoundingClientRect().width ?? 0,
 112:         [],
 113:     );
 114: 
 115:     const showResizer = isResizable !== false && Array.isArray(widths) && widths.length > 1;
 116:     // ?좉퇋 怨꾩빟: head.cells[].isResizable === false ??而щ읆???ㅻⅨ履?寃쎄퀎???몃뱾???④릿??    const edges = showResizer ? (head?.cells ?? []).map(cell => cell?.isResizable !== false) : null;
 117: 
 118:     const wrapperClassName = ['table-wrapper', widths ? 'is-width-frozen' : null, className]
 119:         .filter(Boolean)
 120:         .join(' ');
 121: 
 122:     return (
 123:         <div className={wrapperClassName} style={style} ref={wrapperRef}>
 124:             <DynamicTable
 125:                 head={frozenHead}
 126:                 rows={adaptedRows}
 127:                 isLoading={false}
 128:                 isFixedSize={isFixedSize}
 129:                 emptyView={emptyView}
 130:                 {...(rowsPerPage != null ? { rowsPerPage } : {})}
 131:                 {...(defaultPage != null ? { defaultPage } : {})}
 132:             />
 133: 
 134:             {showResizer && (
 135:                 <ColumnResizeOverlay
 136:                     widths={widths}
 137:                     theadHeight={theadHeight}
 138:                     // ?몃뱾??left(%) 湲곗????뚯씠釉붿뿉 留욎텛??媛믩뱾 ??gutter(?덉꽭濡??ㅽ겕濡ㅻ컮 ??留뚰겮 ?ㅻⅨ履쎌쓣 醫곹엺??                    tableWidth={tableWidth}
 139:                     gutter={gutter}
 140:                     edges={edges}
 141:                     label={t('common.table.resizeColumn')}
 142:                     getTableWidth={getTableWidth}
 143:                     onResize={setWidths}
 144:                     onResetEdge={resetEdge}
 145:                 />
 146:             )}
 147: 
 148:             {footer}
 149:         </div>
 150:     );
 151: }
--- static/ui/src/components/table/tableSort.js
   1: /*
   2:  * 怨듭슜 ?뚯씠釉??뺣젹 ?대뙌????**?쒖닔 紐⑤뱢**(React ?놁쓬, 洹몃옒???⑥쐞 ?뚯뒪?멸? 媛?ν븯??.
   3:  *
   4:  * ?? ???대뙌?곗씤媛 ??????????????????????????????????????????????????????????
   5:  * Atlaskit DynamicTable ???뺣젹 媛믪? **?ㅼ쭅 ?????`key`** ??
   6:  * (`hoc/with-sorted-page-rows.js` ??`getSortingCellValue`: ?ㅻ뜑 key ? 媛숈? ?꾩튂??`cells[i].key` 瑜?爰쇰궡 鍮꾧탳)
   7:  * 洹몃윴???몄텧遺 ??ㅼ닔??? `key` ??**而щ읆 ?앸퀎??*('name','status' ???됰쭏???숈씪)瑜??ｋ뒗??
   8:  * ??`isSortable` 而щ읆???붿궡?쒕쭔 ?꾩슦怨??쒖꽌???곸썝??洹몃?濡쒖???二쎌? ?붿궡??32媛?.
   9:  *
  10:  * ?ㅽ뻾?????`key` ??**React key 濡??곗씠吏 ?딅뒗??*(`components/table-row.js` ??`key: cellIndex`).
  11:  * 洹몃옒???뺣젹媛믪쑝濡???뼱?⑤룄 ?ъ“?뺤뿉 ?꾨Т ?곹뼢???녿떎 ?????ъ떎?????대뙌?곗쓽 洹쇨굅??
  12:  *
  13:  * ?? 怨꾩빟 ???????????????????????????????????????????????????????????????????
  14:  *   rows[].cells[].sortValue  (沅뚯옣) ?뺣젹 媛믪쓽 ?⑥씪 異쒖쿂. **?쒖떆媛믪씠 ?꾨땲???먮낯 媛?*???ｋ뒗??
  15:  *                             ?? ?쒖떆??"3h" ?쇰룄 sortValue ??`10800`(珥?,
  16:  *                                 ?쒖떆??"2026-01-02" ?뺤떇?대씪??sortValue ???뺣젹 媛?ν븳 ISO 臾몄옄??
  17:  *   rows[].cells[].sortKey    (deprecated 蹂꾩묶) `sortValue` 媛 ?놁쓣 ?뚮쭔 ?쎈뒗?? storage 2?붾㈃ 援ъ젣??
  18:  *   rows[].cells[].key        (?덇굅?? ???섏씠 ?놁쓣 ?뚮쭔 ?뺣젹媛믪쑝濡??댁꽍?쒕떎.
  19:  *
  20:  * ??**?뺣젹 而щ읆??`sortValue` ??紐⑤뱺 ?됱뿉 洹좎씪?섍쾶 以??** ?쇰? ?됰쭔 二쇰㈃ ?섎㉧吏媛 ? `key`(而щ읆 ?앸퀎??濡? *   ?대갚??洹?而щ읆??議곗슜??**臾몄옄???뺣젹濡?媛뺣벑**?쒕떎(?レ옄 10 ??2 蹂대떎 ?욎꽌????. 媛믪씠 ?녿뒗 ?됱?
  21:  *   ?꾨뱶瑜?鍮쇱? 留먭퀬 `sortValue: null` 濡?紐낆떆??寃???null ? 寃곗륫?쇰줈 泥섎━???쒖そ ?앹뿉 紐⑥씤??
  22:  *
  23:  * ??`sortValue`/`sortKey` ??DynamicTable 濡??대젮蹂대궡湲???**諛섎뱶???쒓굅**?쒕떎.
  24:  *   ? 媛앹껜??誘몄????꾨뱶??洹몃?濡?`<td>` 濡??ㅽ봽?덈뱶?섏뼱 React unknown-prop 寃쎄퀬瑜??몃떎.
  25:  *   (?ㅻ뜑??`isResizable` ??媛숈? ?댁쑀濡?`<th>` 濡??덈?濡?`adaptHead` ?먯꽌 ?쒓굅?쒕떎.)
  26:  */
  27: 
  28: const has = (cell, field) => Object.prototype.hasOwnProperty.call(cell, field);
  29: 
  30: /**
  31:  * 而щ읆???뺣젹 ?먯쿇媛???sortValue > sortKey > key ?? ?놁쑝硫?null(=寃곗륫).
  32:  *
  33:  * ??**?꾨뱶??議댁옱 ?щ?**濡?媛덈┛?? `sortValue: null` ? "媛믪씠 ?녿떎"???살씠誘濡?key 濡??대갚?섏? ?딅뒗???? *   ?대갚?섎㈃ 而щ읆 ?앸퀎??'effectiveMd')媛 ?뺣젹媛믪쑝濡??욎뿬 ?レ옄 而щ읆???듭㎏濡?臾몄옄?댁씠 ?쇰쾭由곕떎.
  34:  */
  35: function rawSortValue(cell) {
  36:     if (!cell) return null;
  37:     if (has(cell, 'sortValue')) return cell.sortValue ?? null;
  38:     if (has(cell, 'sortKey')) return cell.sortKey ?? null;
  39:     return cell.key ?? null;
  40: }
  41: 
  42: function hasSortMeta(cell) {
  43:     return !!cell && (has(cell, 'sortValue') || has(cell, 'sortKey'));
  44: }
  45: 
  46: function isNumericLike(value) {
  47:     if (typeof value === 'number') return Number.isFinite(value);
  48:     if (typeof value === 'string') {
  49:         const trimmed = value.trim();
  50:         return trimmed !== '' && Number.isFinite(Number(trimmed));
  51:     }
  52:     return false;
  53: }
  54: 
  55: /**
  56:  * ?뺣젹 媛???먯젙 ??**?붿궡???몄텧 洹쒖튃???⑥씪 異쒖쿂**.
  57:  *
  58:  * `head.cells[i].isSortable === true` ??而щ읆留??먯젙?쒕떎(?몄텧遺媛 ?붿껌?섏? ?딆? 怨녹뿉 ?붿궡?쒕? ?덈줈 留뚮뱾吏 ?딅뒗??.
  59:  *
  60:  *  1. ?대뒓 ?됱씠??`sortValue`/`sortKey` 瑜?媛吏?       ???뺣젹 媛?? *  2. ? `key` ???쒕줈 ?ㅻⅨ 媛믪씠 2媛??댁긽              ???뺣젹 媛??(?ㅻ뜲?댄꽣瑜?key ???ｌ? ?덇굅??臾댄쉶洹)
  61:  *  3. ? `key` 媛 紐⑤뱺 ?됱뿉???숈씪?섍굅???꾨? ?놁쓬     ??**?뺣젹 遺덇?**(二쎌? ?붿궡???쒓굅)
  62:  *  4. ?됱씠 2媛?誘몃쭔                                     ???뺣젹 遺덇? (?뺣젹?대룄 ?쒖꽌媛 ??諛붾먮떎)
  63:  *
  64:  * 而щ읆 ?앸퀎?먮뒗 ?뺤쓽???됰쭏??媛숆퀬 ?ㅻ뜲?댄꽣???뺤쓽???됰쭏???ㅻⅤ???? * 洹몃옒????洹쒖튃????吏묐떒??**?몄텧遺 ?섏젙 ?놁씠** 湲곌퀎?곸쑝濡?媛덈씪?몃떎.
  65:  *
  66:  * @returns {boolean[]} 而щ읆 ??留뚰겮???먯젙 寃곌낵
  67:  */
  68: export function resolveSortableColumns(head, rows) {
  69:     const cells = head?.cells;
  70:     if (!Array.isArray(cells)) return [];
  71:     const list = Array.isArray(rows) ? rows : [];
  72: 
  73:     return cells.map((cell, i) => {
  74:         if (!cell?.isSortable) return false;
  75:         if (list.length < 2) return false;
  76: 
  77:         let firstKey;
  78:         let sawKey = false;
  79: 
  80:         for (let r = 0; r < list.length; r++) {
  81:             const target = list[r]?.cells?.[i];
  82:             if (!target) continue;
  83:             if (target.sortValue != null || target.sortKey != null) return true;
  84: 
  85:             const key = target.key;
  86:             if (key == null) continue;
  87:             if (!sawKey) {
  88:                 firstKey = key;
  89:                 sawKey = true;
  90:             } else if (key !== firstKey) {
  91:                 // ?쒕줈 ?ㅻⅨ 媛믪쓣 ?대? 遊ㅼ쑝硫?寃곌낵??true 濡??뺤젙 ???⑥? ?됱쓣 ??蹂??댁쑀媛 ?녿떎.
  92:                 return true;
  93:             }
  94:         }
  95:         return false;
  96:     });
  97: }
  98: 
  99: /**
 100:  * head ?ъ옉????`isSortable` ???먯젙 寃곌낵濡???뼱?곌퀬, ?뺣젹 媛??而щ읆??i18n ?댄똻??二쇱엯?쒕떎.
 101:  *
 102:  * Atlaskit ? ?댄똻/aria 瑜??곸뼱濡??섎뱶肄붾뵫('Sort ascending')???먮?濡?**怨듭슜 ?덈꺼 1??二쇱엯**?쇰줈
 103:  * 紐⑤뱺 ?쒓? ??踰덉뿉 踰덉뿭?쒕떎. ?몄텧遺媛 吏곸젒 以 媛믪씠 ?덉쑝硫?洹멸쾬???곗꽑?쒕떎.
 104:  *
 105:  * ??留??뚮뜑 ?몄텧?대룄 ?섎뒗 媛믪떬 ?⑥닔??而щ읆 ?섎쭔??. ?ㅽ엳??硫붾え?섎㈃ ?ㅻ뜑 content(踰덉뿭쨌?댄똻)媛
 106:  *   媛깆떊?먮뒗???쒓렇?덉쿂媛 媛숈븘 **???ㅻ뜑媛 ?⑤뒗** ?ш퀬媛 ?쒕떎.
 107:  */
 108: export function adaptHead(head, sortable, labels) {
 109:     const cells = head?.cells;
 110:     if (!Array.isArray(cells)) return head;
 111: 
 112:     return {
 113:         ...head,
 114:         cells: cells.map((cell, i) => {
 115:             if (!cell) return cell;
 116:             // isResizable ? ?곕━ 怨꾩빟 ?꾩슜 ?꾨뱶 ???④꺼?먮㈃ <th> ?띿꽦?쇰줈 ?덉뼱 React 寃쎄퀬媛 ?쒕떎
 117:             const { isResizable, ...rest } = cell;
 118:             const canSort = !!sortable?.[i];
 119:             rest.isSortable = canSort;
 120: 
 121:             if (canSort && labels) {
 122:                 if (rest.ascendingSortTooltip == null && labels.asc != null) rest.ascendingSortTooltip = labels.asc;
 123:                 if (rest.descendingSortTooltip == null && labels.desc != null) rest.descendingSortTooltip = labels.desc;
 124:                 if (rest.buttonAriaRoleDescription == null && labels.button != null) rest.buttonAriaRoleDescription = labels.button;
 125:             }
 126:             return rest;
 127:         }),
 128:     };
 129: }
 130: 
 131: /**
 132:  * rows ?ъ옉?????뺣젹 ???而щ읆??? `key` 瑜?**?뺢퇋?붾맂 ?뺣젹媛?*?쇰줈 ??뼱?곌퀬
 133:  * `sortValue`/`sortKey` 瑜??쒓굅?쒕떎.
 134:  *
 135:  * **而щ읆 ?⑥쐞 ????듭씪**: 洹?而щ읆??媛믪씠 ?꾨? ?レ옄(?먮뒗 ?レ옄濡??쏀엳??臾몄옄??硫?Number, ?꾨땲硫?String.
 136:  *   DynamicTable 鍮꾧탳湲곕뒗 ??낆씠 ?욎씠硫??レ옄瑜?臾댁“嫄??욎쑝濡?紐곌퀬, `undefined` 硫?鍮꾧탳 ?먯껜媛 臾대꼫吏꾨떎.
 137:  *   寃곗륫移섎뒗 ?レ옄 而щ읆 `-Infinity`, 臾몄옄 而щ읆 `''` 濡?梨꾩슫????ASC ?먯꽌 留??? DESC ?먯꽌 留??ㅻ줈 **?쇨??섍쾶** 紐⑥씤??
 138:  *
 139:  * **臾대?寃?理쒖쟻??*: 諛붽? 寃껋씠 ?섎굹???놁쑝硫?`rows` 瑜?**?먮낯 李몄“ 洹몃?濡?* ?뚮젮以??
 140:  *   ?덇굅??????ㅼ닔)?먯꽌 ?뚮뜑??O(?됁쀬뿴) 媛앹껜 ?좊떦??0???쒕떎.
 141:  */
 142: export function adaptRows(head, rows, sortable) {
 143:     if (!Array.isArray(rows) || rows.length === 0) return rows;
 144:     const cells = head?.cells;
 145:     if (!Array.isArray(cells)) return rows;
 146: 
 147:     const columnCount = cells.length;
 148:     const normalized = new Array(columnCount).fill(null);
 149:     let needsRewrite = false;
 150: 
 151:     /*
 152:      * ??而щ읆??**諛곗뿴 1媛?쨌 ?쒗쉶 2??*濡??앸궦???덉쟾??`map`+`filter`+`map`+?먯젙猷⑦봽 = 諛곗뿴 3媛?쨌 ?쒗쉶 4??.
 153:      *   ???⑥닔???몄텧遺媛 `rows` 瑜?硫붾え?섏? ?딆쑝硫??뚮뜑留덈떎 ?ㅼ떆 ?꾨뒗???몄텧遺 35怨?以?17怨?,
 154:      *   硫붾え ?ㅽ궢???꾪븳 ?쒓렇?덉쿂 鍮꾧탳???댁감??媛숈? ?쒗쉶瑜??붽뎄?섎?濡?**?곸닔瑜?以꾩씠??履?*???ㅼ씠?듭씠??
 155:      *   (?먯꽭??洹쇨굅??`TableSurface` ??二쇱꽍)
 156:      */
 157:     for (let i = 0; i < columnCount; i++) {
 158:         if (!sortable?.[i]) continue;
 159: 
 160:         const column = new Array(rows.length);
 161:         let sawPresent = false;
 162:         let numeric = true;
 163: 
 164:         for (let r = 0; r < rows.length; r++) {
 165:             const value = rawSortValue(rows[r]?.cells?.[i]);
 166:             column[r] = value;
 167:             if (value == null) continue;
 168:             sawPresent = true;
 169:             if (numeric && !isNumericLike(value)) numeric = false;
 170:         }
 171: 
 172:         const asNumber = sawPresent && numeric;
 173:         for (let r = 0; r < rows.length; r++) {
 174:             const value = column[r];
 175:             column[r] = value == null
 176:                 ? (asNumber ? Number.NEGATIVE_INFINITY : '')
 177:                 : (asNumber ? Number(value) : String(value));
 178:             if (!needsRewrite && rows[r]?.cells?.[i]?.key !== column[r]) needsRewrite = true;
 179:         }
 180: 
 181:         normalized[i] = column;
 182:     }
 183: 
 184:     // ?뺣젹怨?臾닿??섍쾶, sortValue/sortKey 媛 ?⑥븘 ?덉쑝硫?<td> 濡??덈?濡?諛섎뱶??嫄룹뼱?몃떎.
 185:     if (!needsRewrite) {
 186:         for (let r = 0; r < rows.length && !needsRewrite; r++) {
 187:             const rowCells = rows[r]?.cells;
 188:             if (!Array.isArray(rowCells)) continue;
 189:             for (let i = 0; i < rowCells.length; i++) {
 190:                 if (hasSortMeta(rowCells[i])) {
 191:                     needsRewrite = true;
 192:                     break;
 193:                 }
 194:             }
 195:         }
 196:     }
 197: 
 198:     if (!needsRewrite) return rows;
 199: 
 200:     return rows.map((row, r) => {
 201:         const rowCells = row?.cells;
 202:         if (!Array.isArray(rowCells)) return row;
 203:         return {
 204:             ...row,
 205:             cells: rowCells.map((cell, i) => {
 206:                 if (!cell) return cell;
 207:                 const column = normalized[i];
 208:                 if (!column && !hasSortMeta(cell)) return cell;
 209:                 // eslint-disable-next-line no-unused-vars -- rest ?ㅽ봽?덈뱶濡????꾨뱶瑜??⑥뼱?대뒗 寃껋씠 紐⑹쟻
 210:                 const { sortValue, sortKey, ...rest } = cell;
 211:                 if (column) rest.key = column[r];
 212:                 return rest;
 213:             }),
 214:         };
 215:     });
 216: }
 217: 
 218: /**
 219:  * head + rows 瑜???踰덉뿉 ?대뙌?명븳???뚯뒪?맞룸떒諛??몄텧??.
 220:  * `TableSurface` ??head/rows ??硫붾え 二쇨린媛 ?щ씪 `adaptHead`/`adaptRows` 瑜??곕줈 遺瑜몃떎.
 221:  */
 222: export function adaptTable(head, rows, { sortable, labels } = {}) {
 223:     const flags = sortable ?? resolveSortableColumns(head, rows);
 224:     return {
 225:         sortable: flags,
 226:         head: adaptHead(head, flags, labels),
 227:         rows: adaptRows(head, rows, flags),
 228:     };
 229: }
--- tab callers
static/ui/src\backoffice\page\permission\PermissionList.jsx-6-export default function PermissionList(props){
static/ui/src\backoffice\page\permission\PermissionList.jsx-7-    const t = useI18nStore(s=>s.t);
static/ui/src\backoffice\page\permission\PermissionList.jsx-8-    const {head,rows,loading,toast}  = usePermissionList(props);
static/ui/src\backoffice\page\permission\PermissionList.jsx-9-    return (
static/ui/src\backoffice\page\permission\PermissionList.jsx-10-        <>
static/ui/src\backoffice\page\permission\PermissionList.jsx:11:            <CommonTable
static/ui/src\backoffice\page\permission\PermissionList.jsx-12-                head={head}
static/ui/src\backoffice\page\permission\PermissionList.jsx-13-                rows={rows}
static/ui/src\backoffice\page\permission\PermissionList.jsx-14-                isLoading={loading}
static/ui/src\backoffice\page\permission\PermissionList.jsx-15-                emptyMessage ={t('common.empty')}
static/ui/src\backoffice\page\permission\PermissionList.jsx-16-            />
--
static/ui/src\backoffice\page\level\LevelList.jsx-6-export default function LevelList(props) {
static/ui/src\backoffice\page\level\LevelList.jsx-7-    const t = useI18nStore(s=>s.t);
static/ui/src\backoffice\page\level\LevelList.jsx-8-    const {head,rows,emptyMessage,loading,toast}  = useLevelList(props);
static/ui/src\backoffice\page\level\LevelList.jsx-9-    return (
static/ui/src\backoffice\page\level\LevelList.jsx-10-        <>
static/ui/src\backoffice\page\level\LevelList.jsx:11:            <CommonTable
static/ui/src\backoffice\page\level\LevelList.jsx-12-                head={head}
static/ui/src\backoffice\page\level\LevelList.jsx-13-                rows={rows}
static/ui/src\backoffice\page\level\LevelList.jsx-14-                isLoading={loading}
static/ui/src\backoffice\page\level\LevelList.jsx-15-                emptyMessage ={t('common.empty')}
static/ui/src\backoffice\page\level\LevelList.jsx-16-            />
--
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-7-    const t = useI18nStore(s=>s.t);
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-8-    const {head,rows,toast,loading }  = useProjectStatusList(props);
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-9-
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-10-    return (
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-11-        <>
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx:12:            <CommonTable
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-13-                head={head}
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-14-                rows={rows}
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-15-                emptyMessage ={t('common.empty')}
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-16-                isLoading={props.loading}
static/ui/src\backoffice\page\projectStatus\ProjectStatusList.jsx-17-            />
--
static/ui/src\backoffice\page\skill\SkillList.jsx-7-    const t = useI18nStore(s => s.t);
static/ui/src\backoffice\page\skill\SkillList.jsx-8-
static/ui/src\backoffice\page\skill\SkillList.jsx-9-    const { head, rows, loading, toast } = useSkillList(props);
static/ui/src\backoffice\page\skill\SkillList.jsx-10-    return (
static/ui/src\backoffice\page\skill\SkillList.jsx-11-        <>
static/ui/src\backoffice\page\skill\SkillList.jsx:12:            <CommonTable
static/ui/src\backoffice\page\skill\SkillList.jsx-13-                head={head}
static/ui/src\backoffice\page\skill\SkillList.jsx-14-                rows={rows}
static/ui/src\backoffice\page\skill\SkillList.jsx-15-                isLoading={loading}
static/ui/src\backoffice\page\skill\SkillList.jsx-16-                emptyMessage={t('common.empty')}
static/ui/src\backoffice\page\skill\SkillList.jsx-17-            />
--
static/ui/src\backoffice\page\role\RoleList.jsx-7-    const t = useI18nStore(s=>s.t);
static/ui/src\backoffice\page\role\RoleList.jsx-8-
static/ui/src\backoffice\page\role\RoleList.jsx-9-    const {head, rows,emptyMessage,loading,toast }= useRoleList(props);
static/ui/src\backoffice\page\role\RoleList.jsx-10-    return (
static/ui/src\backoffice\page\role\RoleList.jsx-11-        <>
static/ui/src\backoffice\page\role\RoleList.jsx:12:            <CommonTable
static/ui/src\backoffice\page\role\RoleList.jsx-13-                head={head}
static/ui/src\backoffice\page\role\RoleList.jsx-14-                rows={rows}
static/ui/src\backoffice\page\role\RoleList.jsx-15-                isLoading={loading}
static/ui/src\backoffice\page\role\RoleList.jsx-16-                emptyMessage ={t('common.empty')}
static/ui/src\backoffice\page\role\RoleList.jsx-17-            />
--
static/ui/src\backoffice\page\storage\StorageTableList.jsx-46-    }));
static/ui/src\backoffice\page\storage\StorageTableList.jsx-47-
static/ui/src\backoffice\page\storage\StorageTableList.jsx-48-    return (
static/ui/src\backoffice\page\storage\StorageTableList.jsx-49-        <div>
static/ui/src\backoffice\page\storage\StorageTableList.jsx-50-            <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('storage.table.title')}</div>
static/ui/src\backoffice\page\storage\StorageTableList.jsx:51:            <CommonTable
static/ui/src\backoffice\page\storage\StorageTableList.jsx-52-                head={head}
static/ui/src\backoffice\page\storage\StorageTableList.jsx-53-                rows={rows}
static/ui/src\backoffice\page\storage\StorageTableList.jsx-54-                rowsPerPage={20}
static/ui/src\backoffice\page\storage\StorageTableList.jsx-55-                emptyMessage={t('storage.table.empty')}
static/ui/src\backoffice\page\storage\StorageTableList.jsx-56-            />
--
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-78-        <div style={{ marginBottom: '16px' }}>
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-79-            <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, marginBottom: '8px' }}>
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-80-                {t('storage.project.title')}
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-81-                <InfoTip interp={t('storage.notice.estimate')} />
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-82-            </div>
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:83:            <CommonTable
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-84-                head={head}
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-85-                rows={projects.length === 0 ? [] : allRows}
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-86-                rowsPerPage={20}
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-87-                emptyMessage={t('storage.project.empty')}
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-88-            />
--
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-31-                <Button appearance="subtle" onClick={onClose}>
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-32-                    {t('common.button.close')}
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-33-                </Button>
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-34-            )}
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-35-        >
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx:36:            <CommonTable
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-37-                head={head}
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-38-                rows={rows}
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-39-                emptyMessage={t('common.empty')}
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-40-                rowsPerPage={10}
static/ui/src\backoffice\page\user\modal\fail\FailListModal.jsx-41-            />
--
static/ui/src\components\tabs\ProjectDetailTabs.jsx-23-        () => projectDetailTabs(t,project_id,toast,canReadReport,canWriteProject,canReadCost,canReadProject,context),
static/ui/src\components\tabs\ProjectDetailTabs.jsx-24-        [t,project_id,toast,canReadReport,canWriteProject,canReadCost,canReadProject,context]
static/ui/src\components\tabs\ProjectDetailTabs.jsx-25-    );
static/ui/src\components\tabs\ProjectDetailTabs.jsx-26-
static/ui/src\components\tabs\ProjectDetailTabs.jsx-27-    // lazy 탭의 Suspense 경계는 CommonTab 이 소유한다(모든 탭 컨테이너 공통).
static/ui/src\components\tabs\ProjectDetailTabs.jsx:28:    return <CommonTab tabs={tabs} />;
static/ui/src\components\tabs\ProjectDetailTabs.jsx-29-}
--
static/ui/src\components\tabs\MainPageTabs.jsx-16-    const tabs = useMemo(
static/ui/src\components\tabs\MainPageTabs.jsx-17-        () => mainPageTabs(t, canReadProject, canReadKanban),
static/ui/src\components\tabs\MainPageTabs.jsx-18-        [t, canReadProject, canReadKanban]
static/ui/src\components\tabs\MainPageTabs.jsx-19-    );
static/ui/src\components\tabs\MainPageTabs.jsx-20-
static/ui/src\components\tabs\MainPageTabs.jsx:21:    return <CommonTab tabs={tabs} />;
static/ui/src\components\tabs\MainPageTabs.jsx-22-}
--
static/ui/src\components\tabs\CommonTab.jsx-17-        if (child) return { config: child, component: child.component };
static/ui/src\components\tabs\CommonTab.jsx-18-    }
static/ui/src\components\tabs\CommonTab.jsx-19-    return {};
static/ui/src\components\tabs\CommonTab.jsx-20-}
static/ui/src\components\tabs\CommonTab.jsx-21-
static/ui/src\components\tabs\CommonTab.jsx:22:export default function CommonTab({ tabs }) {
static/ui/src\components\tabs\CommonTab.jsx-23-    const [activeTab, setActiveTab] = useState(() => getFirstKey(tabs));
static/ui/src\components\tabs\CommonTab.jsx-24-
static/ui/src\components\tabs\CommonTab.jsx-25-    const { config, component: ActivePage } = findActiveConfig(tabs, activeTab);
static/ui/src\components\tabs\CommonTab.jsx-26-    const canRender = config?.canRender ? config.canRender() : true;
static/ui/src\components\tabs\CommonTab.jsx-27-    /*
--
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-6-export default function PublicHolidayList(props) {
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-7-    const t = useI18nStore(s=>s.t);
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-8-    const {head, rows, emptyMessage, loading, toast} = usePublicHolidayList(props);
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-9-    return (
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-10-        <>
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx:11:            <CommonTable
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-12-                head={head}
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-13-                rows={rows}
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-14-                isLoading={loading}
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-15-                emptyMessage={t('common.empty')}
static/ui/src\backoffice\page\publicHoliday\PublicHolidayList.jsx-16-            />
--
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-217-                        onChange={(o) => setDueFilter(o?.value ?? "all")}
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-218-                    />
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-219-                </div>
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-220-            </Box>
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-221-
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:222:            <CommonTable
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-223-                head={head}
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-224-                rows={rows}
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-225-                isLoading={isLoading}
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-226-                rowsPerPage={10}
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-227-                emptyMessage={
--
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-281-                        hours: round1(filteredSeconds / 3600),
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-282-                    })}
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-283-                </span>
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-284-            </Box>
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-285-
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:286:            <CommonTable
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-287-                head={isFlat ? flatHead : groupHead}
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-288-                rows={isFlat ? flatTableRows : groupTableRows}
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-289-                isLoading={isLoading}
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-290-                rowsPerPage={10}
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-291-                emptyMessage={
--
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-237-            { content: group.inProgressCount != null ? group.inProgressCount : <Dash /> },
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-238-            { content: group.doneCount != null ? group.doneCount : <Dash /> },
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-239-        ],
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-240-    }));
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-241-
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx:242:    return <CommonTable head={head} rows={rows} emptyMessage={t('common.empty')} />;
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-243-}
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-244-
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-245-function MemberTable({ members, hasWeightedMetrics, t }) {
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-246-    const head = {
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-247-        cells: [
--
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-284-            { content: m.doneCount ?? <Dash /> },
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-285-            { content: m.projectCount ?? <Dash /> },
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-286-        ],
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-287-    }));
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-288-
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx:289:    return <CommonTable head={head} rows={rows} emptyMessage={t('common.empty')} />;
static/ui/src\pages\myPage\sections\MyTeamAnalysisPanel.jsx-290-}
--
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-50-            },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-51-        ],
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-52-    }));
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-53-
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-54-    return (
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:55:        <CommonTable
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-56-            head={head}
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-57-            rows={rows}
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-58-            emptyView={<EmptyState message={t("portfolio.cost.empty")} height={null} />}
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-59-        />
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-60-    );
--
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-122-            },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-123-        }),
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-124-    }));
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-125-
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-126-    return (
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:127:        <CommonTable
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-128-            head={head}
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-129-            rows={rows}
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-130-            emptyView={<EmptyState message={t("portfolio.table.empty")} height={null} />}
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-131-        />
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-132-    );
--
static/ui/src\components\chart\ChartTableToggle.jsx-29-            </div>
static/ui/src\components\chart\ChartTableToggle.jsx-30-
static/ui/src\components\chart\ChartTableToggle.jsx-31-            {view === "chart" ? (
static/ui/src\components\chart\ChartTableToggle.jsx-32-                chart
static/ui/src\components\chart\ChartTableToggle.jsx-33-            ) : (
static/ui/src\components\chart\ChartTableToggle.jsx:34:                <CommonTable
static/ui/src\components\chart\ChartTableToggle.jsx-35-                    head={tableHead}
static/ui/src\components\chart\ChartTableToggle.jsx-36-                    rows={tableRows}
static/ui/src\components\chart\ChartTableToggle.jsx-37-                    isFixedSize
static/ui/src\components\chart\ChartTableToggle.jsx-38-                    maxHeight={tableMaxHeight}
static/ui/src\components\chart\ChartTableToggle.jsx-39-                    {...(rowsPerPage != null ? { rowsPerPage } : {})}
--
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-119-            };
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-120-        });
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-121-    }, [people, t, loadMap, isLoadPending, onRowSelect, hourRate]);
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-122-
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-123-    return (
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx:124:        <CommonTable
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-125-            head={head}
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-126-            rows={rows}
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-127-            rowsPerPage={15}
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-128-            emptyMessage={t('common.empty')}
static/ui/src\pages\resource\overview\ResourceOverviewTable.jsx-129-        />
--
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-130-            {topPeople.length > 0 && (
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-131-                <div style={{ marginTop: 10 }}>
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-132-                    <div style={{ fontSize: 12, fontWeight: 600, color: token("color.text", "#42526E"), marginBottom: 4 }}>
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-133-                        {t("portfolio.utilization.overloadTop")}
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-134-                    </div>
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:135:                    <CommonTable
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-136-                        maxHeight={180}
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-137-                        head={{
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-138-                            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-139-                                { key: "member", content: t("portfolio.utilization.colMember"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-140-                                { key: "util", content: t("portfolio.utilization.colUtil"), isSortable: true },
--
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-168-                    <span style={{ marginLeft: 4 }}>{t("portfolio.overview.viewTable")}</span>
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-169-                </ToggleBtn>
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-170-            </div>
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-171-
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-172-            {view === "signal" ? (
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx:173:                <CommonTable
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-174-                    head={head}
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-175-                    rows={rows}
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-176-                    emptyView={<EmptyState message={t("portfolio.table.empty")} height={null} />}
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-177-                />
static/ui/src\pages\portfolio\widgets\PortfolioTsrSignalTable.jsx-178-            ) : (
--
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-52-            ],
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-53-        }));
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-54-    }, [history, t]);
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-55-
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-56-    return (
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx:57:        <CommonTable
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-58-            head={head}
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-59-            rows={rows}
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-60-            rowsPerPage={10}
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-61-            emptyMessage={t('resource.profile.history.empty')}
static/ui/src\pages\resource\overview\profile\ProjectHistoryList.jsx-62-        />
--
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-349-                    </SectionMessage>
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-350-                </Box>
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-351-            )}
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-352-
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-353-            <Stack>
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx:354:                <CommonTable head={head} rows={rows} isLoading={isLoading} emptyMessage={t('salary.empty')} />
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-355-                {pages.length > 0 && (
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-356-                    <Pagination
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-357-                        nextLabel="Next"
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-358-                        label="Page"
static/ui/src\pages\projectDetail\salary\SalaryManagementPage.jsx-359-                        pageLabel="Page"
--
static/ui/src\pages\resource\organization\OrganizationTab.jsx-384-                    </SectionMessage>
static/ui/src\pages\resource\organization\OrganizationTab.jsx-385-                </Box>
static/ui/src\pages\resource\organization\OrganizationTab.jsx-386-            )}
static/ui/src\pages\resource\organization\OrganizationTab.jsx-387-
static/ui/src\pages\resource\organization\OrganizationTab.jsx-388-            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', marginTop: 10 }}>
static/ui/src\pages\resource\organization\OrganizationTab.jsx:389:                <CommonTable
static/ui/src\pages\resource\organization\OrganizationTab.jsx-390-                    head={head}
static/ui/src\pages\resource\organization\OrganizationTab.jsx-391-                    rows={rows}
static/ui/src\pages\resource\organization\OrganizationTab.jsx-392-                    rowsPerPage={25}
static/ui/src\pages\resource\organization\OrganizationTab.jsx-393-                    emptyMessage={t('resource.org.empty')}
static/ui/src\pages\resource\organization\OrganizationTab.jsx-394-                />
--
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-127-            ],
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-128-        }));
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-129-    }, [issues, t, siteUrl, hourRate]);
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-130-
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-131-    return (
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx:132:        <CommonTable
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-133-            head={head}
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-134-            rows={rows}
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-135-            rowsPerPage={10}
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-136-            emptyMessage={t('resource.profile.issue.empty')}
static/ui/src\pages\resource\overview\profile\InProgressIssueList.jsx-137-        />
--
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-276-                    />
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-277-                )}
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-278-                {/*row data 리스트 데이터*/}
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-279-                {isSwitch && (
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-280-                    <div style={{ width: "100%", height: "100%", overflowY: "auto", position: "absolute" }}>
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js:281:                        <CommonTable head={head} rows={rows} />
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-282-                    </div>
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-283-                )}
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-284-            </div>
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-285-        </EchartPanel>
static/ui/src\pages\projectDetail\dashboard\ChartTemplate.js-286-    );
--
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-257-                            onClick={() => setIsModalOpen(true)}>{t('projectDetail.user.add')}</Button>
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-258-                    </Inline>
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-259-                </Box>
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-260-            )}
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-261-            <Stack>
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx:262:                <CommonTable head={head} rows={rows} isLoading={isLoading} emptyMessage={t('common.empty')}/>
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-263-                {pages.length > 0 && <Pagination
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-264-                    nextLabel="Next"
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-265-                    label="Page"
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-266-                    pageLabel="Page"
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-267-                    pages={pages}
--
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-133-                        {t(f.labelKey)}
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-134-                    </button>
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-135-                ))}
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-136-            </div>
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-137-
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx:138:            <CommonTable
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-139-                head={head}
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-140-                rows={rows}
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-141-                maxHeight="40vh"
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-142-                emptyMessage={t('projectDetail.analysis.progress.risk.empty')}
static/ui/src\pages\projectDetail\progress\ProgressRiskTable.jsx-143-            />
--
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-157-        <>
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-158-            <Card
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-159-                title={t('cost.issue.title')}
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-160-                info={{ calc: t('cost.issue.calc'), interp: t('cost.issue.interp') }}
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-161-            >
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:162:                <CommonTable
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-163-                    head={tableHead}
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-164-                    rows={tableRows}
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-165-                    rowsPerPage={ROWS_PER_PAGE}
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-166-                    emptyMessage={t('cost.issue.empty')}
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-167-                />
--
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-199-                                notMerge={true}
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-200-                            />
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-201-                        </div>
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-202-                        <div>
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-203-                            <div className="cost-issue-detail-title">{t('cost.issue.detailTitle')}</div>
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:204:                            <CommonTable head={detailHead} rows={detailRows} rowsPerPage={detailRows.length || 1} />
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-205-                        </div>
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-206-                    </div>
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-207-                ) : (
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-208-                    <div className="cost-table-empty">{t('cost.issue.empty')}</div>
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-209-                )}
--
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-157-        });
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-158-    }, [visibleRows, selected, loadMap, isLoadPending, hourRate, canAssign, thresholds, busyAccountId, onRowSelect, onAssign, t]);
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-159-
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-160-    return (
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-161-        <>
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx:162:            <CommonTable
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-163-                head={head}
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-164-                rows={tableRows}
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-165-                rowsPerPage={Math.max(tableRows.length, 1)}
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-166-                emptyMessage={t('common.empty')}
static/ui/src\pages\resource\assignment\people\CompanyResourceTable.jsx-167-            />
--
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-197-                                />
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-198-                            </div>
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-199-                        )}
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-200-                        <ProjectFilter addJqlMap={addJqlMap} />
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-201-                        <div style={{overflowY: 'auto', maxHeight: '50vh', marginTop: '12px'}}>
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx:202:                            <CommonTable head={head} rows={rows} rowsPerPage={100} isLoading={isLoading} emptyMessage={t('common.empty')}/>
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-203-                        </div>
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-204-                    </div>
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-205-                </TabPanel>
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-206-
static/ui/src\pages\projectDetail\issue\IssueAddModal.jsx-207-                <TabPanel>
--
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-177-    const table = (
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-178-        // ⚠️ `key` 로 remount 해 페이지네이션을 1페이지로 되돌린다.
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-179-        //    DynamicTable 은 현재 페이지를 내부 state 로 들고 있어(CommonTable 은 `page` 를 전달하지 않는다)
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-180-        //    검색으로 행 수가 줄면 빈 페이지에 머문다. `resetPageKey` 는 검색어/풀 토글에만 반응하므로
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-181-        //    배정 캐시 패치로 행 값만 바뀔 때는 remount 되지 않는다(페이지 유지).
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx:182:        <CommonTable
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-183-            key={resetPageKey}
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-184-            head={head}
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-185-            rows={rows}
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-186-            rowsPerPage={10}
static/ui/src\pages\projectDetail\assignment\candidate\AssignmentCandidateTable.jsx-187-            emptyMessage={emptyMessage ?? t('assignment.candidate.empty')}
--
static/ui/src\pages\project\ProjectList.jsx-140-
static/ui/src\pages\project\ProjectList.jsx-141-    return (
static/ui/src\pages\project\ProjectList.jsx-142-        <>
static/ui/src\pages\project\ProjectList.jsx-143-        <Stack>
static/ui/src\pages\project\ProjectList.jsx-144-        <div className="clickable-rows">
static/ui/src\pages\project\ProjectList.jsx:145:            <CommonTable head={head} rows={rows} isLoading={isLoading} emptyMessage ={t('common.empty')}/>
static/ui/src\pages\project\ProjectList.jsx-146-        </div>
static/ui/src\pages\project\ProjectList.jsx-147-        {/* 페이징은 표 하단 가운데 — Pagination 자체는 좌측 정렬이라 감싸서 중앙에 놓는다 */}
static/ui/src\pages\project\ProjectList.jsx-148-        {pages.length > 0 && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
static/ui/src\pages\project\ProjectList.jsx-149-            <Pagination
static/ui/src\pages\project\ProjectList.jsx-150-                nextLabel={t('common.table.next')}
--
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-182-                        <span style={{ fontSize: 12, fontWeight: 600 }}>{count}</span>
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-183-                    </span>
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-184-                ))}
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-185-            </div>
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-186-
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx:187:            <CommonTable
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-188-                head={head}
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-189-                rows={rows}
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-190-                rowsPerPage={rows.length || 1}
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-191-                isLoading={isLoading}
static/ui/src\pages\projectDetail\analysisReport\team\TeamCoverageTable.jsx-192-                emptyMessage={t('projectDetail.analysis.team.coverage.empty')}
--
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-118-                 * 자체 높이 상한(옛 `maxHeight="26vh"`)은 두지 않는다.
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-119-                 * 상세가 드로어로 옮겨간 뒤로는 드로어 본문이 이미 스크롤을 갖고 있어,
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-120-                 * 여기서 또 26vh 로 자르면 스크롤이 두 겹이 되고 표는 잘린 채로 남았다.
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-121-                 * 길이는 CommonTable 의 페이징(10행)이 잡는다.
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-122-                 */
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx:123:                <CommonTable
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-124-                    head={head}
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-125-                    rows={rows}
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-126-                    emptyMessage={t('projectDetail.analysis.issue.worklog.empty')}
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-127-                />
static/ui/src\pages\projectDetail\analysisReport\issue\WorklogDetailPanel.jsx-128-            )}
--
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-206-                    )}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-207-                </span>
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-208-            </div>
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-209-
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-210-            {/* 테이블 */}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx:211:            <CommonTable
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-212-                head={head}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-213-                rows={rows}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-214-                maxHeight="28vh"
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-215-                emptyMessage={t('projectDetail.analysis.issue.worklog.empty')}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisChart.jsx-216-            />
--
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-247-            ],
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-248-        };
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-249-    });
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-250-
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-251-    return (
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx:252:        <CommonTable
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-253-            head={head}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-254-            rows={rows}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-255-            isLoading={isLoading}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-256-            emptyMessage={t('projectDetail.analysis.resource.empty')}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTable.jsx-257-        />
--
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-231-        };
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-232-    });
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-233-
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-234-    return (
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-235-        <>
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx:236:            <CommonTable
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-237-                head={head}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-238-                rows={rows}
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-239-                /*
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-240-                 * 팀 소계는 전량이 한눈에 보여야 의미가 있다 — `CommonTable` 기본 10행 페이징이면
static/ui/src\pages\projectDetail\analysisReport\resource\ResourceAnalysisTeamTable.jsx-241-                 * 조직이 잘려 보인다. 고정 상수(50)를 두면 팀이 그보다 많을 때 **다시 잘린다**
--- UserSearch callers
static/ui/src\components\search\UserSearchFilter.jsx-147-                }}>
static/ui/src\components\search\UserSearchFilter.jsx-148-                {/* 사용자 검색 */}
static/ui/src\components\search\UserSearchFilter.jsx-149-                <div style={{ width: 300 }}>
static/ui/src\components\search\UserSearchFilter.jsx:150:                    <UserSearchSelect
static/ui/src\components\search\UserSearchFilter.jsx-151-                        value={users}
static/ui/src\components\search\UserSearchFilter.jsx-152-                        onChange={changeUsers}
static/ui/src\components\search\UserSearchFilter.jsx-153-                        onApply={applyUsers}

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$targets = @('"'static/ui/src/components/tabs/CommonTab.jsx','static/ui/src/components/select/UserSearchSelect.jsx','static/ui/src/components/table/TableSurface.jsx','static/ui/src/components/table/tableSort.js','static/ui/src/pages/projectDetail/ProjectDetailPage.jsx','static/ui/src/components/tabs/ProjectDetailTabs.jsx','static/ui/src/pages/project/MainPage.jsx'); foreach ("'$file in $targets) { if(Test-Path $file){Write-Output "--- $file"; $line=0; Get-Content $file | ForEach-Object { $line++; '"'{0,4}: {1}' -f "'$line, $_ } } }' in C:\CloudJira\moves-workforce
 succeeded in 3178ms:
--- static/ui/src/components/tabs/CommonTab.jsx
   1: import React, { Suspense, useState } from 'react';
   2: import Tabs, { Tab, TabList } from '@atlaskit/tabs';
   3: import DropdownTab from './DropdownTab';
   4: import NoPermissionPage from '../../pages/nonPermission/NoPermissionPage';
   5: import { PageSkeleton } from '../skeleton/Skeleton';
   6: import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
   7: 
   8: const getFirstKey = (tabs) => {
   9:     return tabs[0]?.children?.[0]?.key ?? tabs[0]?.key;
  10: }
  11: 
  12: const findActiveConfig = (tabs, activeTab)  =>  {
  13:     for (const tab of tabs) {
  14:         if (tab.key === activeTab) return { config: tab, component: tab.component };
  15:         const child = tab.children?.find(c => c.key === activeTab);
  16:         // ?먯떇 ??씠 active 硫??먯떇??config(canRender ??瑜?諛섑솚?댁빞 ?먯떇 沅뚰븳 寃뚯씠?멸? ?숈옉?쒕떎.
  17:         if (child) return { config: child, component: child.component };
  18:     }
  19:     return {};
  20: }
  21: 
  22: export default function CommonTab({ tabs }) {
  23:     const [activeTab, setActiveTab] = useState(() => getFirstKey(tabs));
  24: 
  25:     const { config, component: ActivePage } = findActiveConfig(tabs, activeTab);
  26:     const canRender = config?.canRender ? config.canRender() : true;
  27:     /*
  28:      * ???몄옄??`props` 濡?諛쏅뒗????`component` ??而댄룷?뚰듃 **李몄“**?ъ빞 ??諛곗뿴???ㅼ떆 留뚮뱾?댁졇??
  29:      * element type ???좎??섍퀬, ?쒖꽦 ??씠 ?щ쭏?댄듃?섏? ?딅뒗??P1-3, 怨꾩빟? `constants/tabs.js` 二쇱꽍).
  30:      */
  31:     const pageProps = config?.props;
  32: 
  33:     const selectedIndex = tabs.findIndex(
  34:         tab => tab.key === activeTab || tab.children?.some(c => c.key === activeTab)
  35:     );
  36: 
  37:     return (
  38:         <Tabs
  39:             selected={selectedIndex}
  40:             onChange={(index) => {
  41:                 const tab = tabs[index];
  42:                 if (tab.children) return;
  43:                 setActiveTab(tab.key);
  44:             }}
  45:         >
  46:             <TabList>
  47:                 {tabs.map((tab) => (
  48:                     <Tab key={tab.key}>
  49:                         {tab.children ? (
  50:                             <DropdownTab
  51:                                 label={tab.label}
  52:                                 items={tab.children}
  53:                                 onSelect={(key) => setActiveTab(key)}
  54:                             />
  55:                         ) : (
  56:                             tab.label
  57:                         )}
  58:                     </Tab>
  59:                 ))}
  60:             </TabList>
  61: 
  62:             {/*
  63:               * ?뵶 lazy ??씠 ?깅┰?섎뒗 議곌굔? **??Suspense 寃쎄퀎**??
  64:               *
  65:               *   ??而댄룷?뚰듃媛 lazy ???꾪솚 以?泥?겕瑜?湲곕떎由щŉ suspend ?섎뒗?? ?대? 諛쏆쓣 寃쎄퀎媛 ?놁쑝硫?
  66:               *   React error #426("A component suspended while responding to synchronous input")???쒕떎.
  67:               *   2026-08-04 ??lazy 瑜??꾨㈃ ?먮났???먯씤???닿쾬?댁뿀?? 寃쎄퀎瑜?CommonTab ??怨녹뿉 ?먯뼱
  68:               *   紐⑤뱺 ??而⑦뀒?대꼫(MainPageTabs / ProjectDetailTabs)媛 鍮좎쭚?놁씠 蹂댄샇?섍쾶 ?쒕떎.
  69:               *
  70:               *   ??startTransition ?쇰줈 "?댁쟾 ?붾㈃ ?좎?"瑜??몃━吏 留?寃??????깆? `index.js` 媛
  71:               *     ReactDOM.render(legacy root)??concurrent 湲곕뒫???숈옉?섏? ?딅뒗??
  72:               *     startTransition ?덉쓽 ?낅뜲?댄듃???숆린濡?泥섎━?섍퀬 useTransition ??isPending ? ??긽 false ??
  73:               *     (洹몃젃寃??섎젮硫?createRoot ?꾪솚???좏뻾?쇱빞 ?섍퀬, 洹멸굔 ???꾩껜 ?뚭? 寃利앹씠 ?꾩슂??蹂꾧굔?대떎.)
  74:               */}
  75:             {ActivePage && (
  76:                 /*
  77:                  * key={activeTab} ??寃쎄퀎????踰??먮윭瑜??≪쑝硫?怨꾩냽 ?먮윭 ?붾㈃??蹂댁뿬二쇰?濡?
  78:                  * ??쓣 ??린硫??덈줈 留덉슫?몃뤌 由ъ뀑?섍쾶 ?쒕떎. ?닿쾶 ?놁쑝硫?泥?겕 ?섎굹媛 ?ㅽ뙣????
  79:                  * 硫姨≫븳 ?ㅻⅨ ??퉴吏 ?먮윭 ?붾㈃???쒕떎.
  80:                  */
  81:                 <ChunkErrorBoundary key={activeTab}>
  82:                     <Suspense fallback={<PageSkeleton />}>
  83:                         {canRender ? <ActivePage {...pageProps} /> : <NoPermissionPage />}
  84:                     </Suspense>
  85:                 </ChunkErrorBoundary>
  86:             )}
  87:         </Tabs>
  88:     );
  89: }
--- static/ui/src/components/select/UserSearchSelect.jsx
   1: import {useCallback, useEffect, useRef, useState} from "react";
   2: import {invoke} from "@forge/bridge";
   3: import Select, {CheckboxOption} from '@atlaskit/select';
   4: import {useI18nStore} from "../../stores/useI18nStore";
   5: import {useDebounce} from "../../utils/useDebounce";
   6: import {token} from "@atlaskit/tokens";
   7: 
   8: /*
   9: *  ?ъ슜??寃??李?
  10: *  value: ?꾩옱 ?좏깮???ъ슜??紐⑸줉
  11: *  onChange: ?좏깮 ?곹깭
  12: *  onApply: ?좏깮 ?꾨즺 ????踰덈쭔 ?몄텧 -> 寃?됱갹 諛붽묑?곸뿭???좏깮 ?덉쓣 ??
  13: * */
  14: 
  15: const thinSelectStyles = {
  16:     control: (base, state) => ({
  17:         ...base,
  18:         minHeight: '32px',
  19:         borderWidth: '1px',
  20:         borderColor: state.isFocused
  21:             ? token('color.border.focused', '#0052CC')
  22:             : token('color.border', '#DFE1E6'),
  23:         boxShadow: 'none',
  24:         '&:hover': {
  25:             borderColor: token('color.border.focused', '#0052CC'),
  26:         },
  27:     }),
  28: };
  29: 
  30: export const UserSearchSelect = ({ value, onChange, onApply}) =>{
  31:     const [options, setOptions] = useState([]); // 紐⑸줉
  32:     const [page, setPage] = useState(0);  // ?ㅽ겕濡??섏씠吏?
  33:     const [keyword, setKeyword] = useState(''); // 寃?됱뼱
  34:     const [loading, setLoading] = useState(false);
  35:     const [hasMore, setHasMore] = useState(true); // ?ㅽ겕濡??섏씠吏???
  36:     const t = useI18nStore(s => s.t);
  37: 
  38:     // 湲곕낯 紐⑸줉(寃?됱뼱 ?놁쓬) 罹먯떆: 理쒖큹 ?ㅽ뵂 ??鍮좊Ⅴ寃?蹂댁뿬二쇨린??
  39:     const defaultCacheRef = useRef(null);
  40:     // 以묐났 ?몄텧 諛⑹?(臾댄븳?ㅽ겕濡?諛⑹뼱) ??**寃??nextPage 0)?먮뒗 嫄몄? ?딅뒗??*
  41:     const loadingRef = useRef(false);
  42:     // ?붿껌 ??쟾 諛⑹?: 留덉?留??붿껌留?諛섏쁺
  43:     const reqSeqRef = useRef(0);
  44:     // ?ъ슜?먭? ?ㅼ젣濡???댄븨???ㅼ뿉留?寃?됱쓣 嫄대떎(理쒖큹 紐⑸줉? 硫붾돱 ?ㅽ뵂???대떦)
  45:     const hasTypedRef = useRef(false);
  46: 
  47:     /*
  48:      * 寃?됱뼱???붾컮?댁뒪(300ms, 由ы룷 愿濡 `useDebounce`) ??**??踰덈쭔** 議고쉶?쒕떎.
  49:      * ?덉쟾?????낅젰留덈떎 `invoke('searchUser')` 瑜?利됱떆 ?덇퀬("?띻만?? = 6??, 寃뚮떎媛
  50:      * 吏꾪뻾 以??붿껌???덉쑝硫??꾨옒 媛?쒓? 洹??낅젰??**踰꾨젮??* 留덉?留?湲?먯쓽 寃?됱씠 ?꾩삁 ?⑥? ?딄퀬
  51:      * ??寃곌낵媛 ?⑤뒗 寃쎈줈媛 ?덉뿀??P1-8).
  52:      */
  53:     const debouncedKeyword = useDebounce(keyword, 300);
  54: 
  55:     // search ?ъ슜??寃?됱뼱, nextPage ?ㅽ겕濡??섏씠吏?
  56:     const loadUsers = useCallback(async ({ search, nextPage = 0 }) => {
  57:         // ?섏씠吏뺣쭔 以묐났 諛⑹? ????寃?됱? 吏꾪뻾 以??붿껌???덉뼱??諛섎뱶??諛쒖궗?쒕떎(?낅젰 ?좎떎 湲덉?)
  58:         if (nextPage > 0 && loadingRef.current) return;
  59: 
  60:         // 罹먯떆 議곌굔: 寃?됱뼱 ?녾퀬 泥??섏씠吏?대ŉ 罹먯떆 議댁옱?섎㈃ 諛붾줈 ?ъ슜
  61:         if (!search && nextPage === 0 && defaultCacheRef.current) {
  62:             // ?뵶 吏꾪뻾 以??붿껌??臾댄슚?뷀븳???????섎㈃ 寃?됱뼱瑜?吏??吏곹썑 ??寃??寃곌낵媛 ?ㅻ뒭寃???뼱?대떎
  63:             reqSeqRef.current += 1;
  64:             const cached = defaultCacheRef.current;
  65:             setOptions(cached.options);
  66:             setHasMore(cached.hasMore);
  67:             setPage(0);
  68:             return;
  69:         }
  70: 
  71:         loadingRef.current = true;
  72:         setLoading(true);
  73: 
  74:         const mySeq = ++reqSeqRef.current;
  75: 
  76:         try {
  77:             const res = await invoke("searchUser", {
  78:                 keyword: search,
  79:                 page: nextPage,
  80:                 size: 10,
  81:             });
  82: 
  83:             // 理쒖떊 ?붿껌???꾨땲硫??먭린
  84:             if (mySeq !== reqSeqRef.current) return;
  85: 
  86:             const users = res?.data?.user ?? [];
  87:             const mapped = users.map((u) => ({
  88:                 label: u.emailAddress ? `${u.displayName} (${u.emailAddress})` : u.displayName,
  89:                 value: u.accountId,
  90:             }));
  91: 
  92:             if (nextPage === 0) {
  93:                 setOptions(mapped);
  94:             } else {
  95:                 setOptions((prev) => [...prev, ...mapped]); // 湲곗〈 媛믪뿉 異붽???set
  96:             }
  97: 
  98: 
  99:             const nextHasMore = res?.data?.hasMore ?? false;
 100:             setHasMore(nextHasMore);
 101:             setPage(nextPage);
 102: 
 103:             if (!search && nextPage === 0) {
 104:                 defaultCacheRef.current = {
 105:                     options: mapped,
 106:                     hasMore: nextHasMore,
 107:                     page: 0,
 108:                 };
 109:             }
 110:         } finally {
 111:             // ?ㅻ뒭寃??앸궃 ???붿껌??**吏꾪뻾 以묒씤 理쒖떊 ?붿껌??* 濡쒕뵫 ?쒖떆瑜??꾩? ?딄쾶 ?쒕떎
 112:             if (mySeq === reqSeqRef.current) {
 113:                 loadingRef.current = false;
 114:                 setLoading(false);
 115:             }
 116:         }
 117:     },[]);
 118: 
 119:     const handleInputChange = useCallback(
 120:         (val, actionMeta) => {
 121:             if (actionMeta.action !== "input-change") return val;
 122: 
 123:             hasTypedRef.current = true;
 124:             setKeyword(val);
 125:             setHasMore(true); // ??寃???쒖옉?대?濡?hasMore 珥덇린??
 126:             setPage(0);       // ??寃???쒖옉?대?濡?page 由ъ뀑
 127: 
 128:             return val;       // ?ㅼ젣 議고쉶???붾컮?댁뒪??媛믪쑝濡??꾨옒 effect 媛 1?뚮쭔 ?몃떎
 129:         },
 130:         []
 131:     );
 132: 
 133:     useEffect(() => {
 134:         if (!hasTypedRef.current) return;
 135:         loadUsers({ search: debouncedKeyword, nextPage: 0 });
 136:     }, [debouncedKeyword, loadUsers]);
 137: 
 138:     // 而댄룷?뚰듃 ?대? ?ㅽ겕濡??대졇?????ㅼ쓬 ?섏씠吏濡?
 139:     const handleMenuScrollToBottom = useCallback(() => {
 140:         if (!hasMore) return;
 141:         // ?붾㈃?????덈뒗 紐⑸줉??湲곗?? **?붾컮?댁뒪??* 寃?됱뼱???낅젰 以묒씤 湲?먭? ?꾨땲??
 142:         loadUsers({ search: debouncedKeyword, nextPage: page + 1 });
 143:     }, [hasMore, debouncedKeyword, page, loadUsers]);
 144: 
 145:     // 而댄룷?뚰듃 ?대┃??理쒖큹 濡쒕뱶
 146:     const handleMenuOpen = useCallback(() => {
 147:         if (options.length === 0) {
 148:             loadUsers({ search: "", nextPage: 0 });
 149:         }
 150:     }, [options.length, loadUsers]);
 151: 
 152:     // ?좏깮 ?앸궗??????踰덈쭔 ?몄텧
 153:     const handleBlur = () => {
 154:         onApply?.();
 155:     };
 156: 
 157:     return (
 158:         <Select
 159:             isMulti
 160:             components={{ Option: CheckboxOption }} // 泥댄겕 諛뺤뒪 ?듭뀡 ?쒖꽦
 161:             options={options}
 162:             isLoading={loading}
 163:             onInputChange={handleInputChange}
 164:             onMenuScrollToBottom={handleMenuScrollToBottom}
 165:             onMenuOpen={handleMenuOpen}
 166:             onBlur={handleBlur}
 167:             placeholder={t('user.table.filter.user')}
 168:             closeMenuOnSelect={false}
 169:             onChange={onChange}
 170:             value={value}
 171:             styles={thinSelectStyles}
 172:         />
 173:     );
 174: }
--- static/ui/src/components/table/TableSurface.jsx
   1: import React, { useCallback, useMemo, useRef } from 'react';
   2: import DynamicTable from '@atlaskit/dynamic-table';
   3: 
   4: import { useI18nStore } from '../../stores/useI18nStore';
   5: import ColumnResizeOverlay from './ColumnResizeOverlay';
   6: import { buildSkeletonRows } from './skeletonRows';
   7: import { adaptHead, adaptRows, resolveSortableColumns } from './tableSort';
   8: import useStableColumnWidths, { headSignature } from './useStableColumnWidths';
   9: import './table.css';
  10: 
  11: /**
  12:  * DynamicTable 湲곕컲 ??3醫?`CommonTable`/`PagingTable`/`CursorPagingTable`)??怨듭쑀?섎뒗 **??*.
  13:  *
  14:  * ?뺣젹 ?대뙌?걔룻룺 ?숆껐쨌由ъ궗?댁쫰 ?ㅻ쾭?덉씠쨌?ㅼ펷?덊넠??**?ш린 ??怨녹뿉?쒕쭔** 援ы쁽?쒕떎.
  15:  * 媛쒕퀎 ?붾㈃(63媛???? ?꾨Т寃껊룄 怨좎튂吏 ?딆븘???꾨옒瑜?洹몃?濡??삳뒗??
  16:  *   - 而щ읆 ??씠 泥??ㅻ뜲?댄꽣 ?섏씤???쒖젏 洹몃?濡??숆껐(?섏씠吏 ?꾪솚쨌?꾪꽣쨌?뺣젹??遺덈?)
  17:  *   - ?ㅻ뜑 寃쎄퀎 ?쒕옒洹몃줈 ??議곗젅(?붾툝?대┃?쇰줈 蹂듦?)
  18:  *   - **?뺣젹???ㅼ젣濡??섎뒗 而щ읆?먮쭔** ?붿궡?쒓? ?⑤뒗??二쎌? ?댄룷?섏뒪 ?쒓굅)
  19:  *
  20:  * ??而댄룷?뚰듃???대??⑹씠?????붾㈃? `CommonTable`/`PagingTable`/`CursorPagingTable` ???대떎.
  21:  *
  22:  * ?? ?대뙌??鍮꾩슜?????(?깅뒫 媛먯궗 P1-13) ????????????????????????????????????
  23:  * `rows` 瑜?硫붾え?섏? ?딅뒗 ?몄텧遺媛 ?덈컲?대씪(35怨?以?17怨? ?대뙌?곌? ?뚮뜑留덈떎 ?ㅼ떆 ?덈떎.
  24:  * "?쒓렇?덉쿂瑜?留뚮뱾??媛믪씠 媛숈쑝硫??듭㎏濡?嫄대꼫?곌린"??**?ш린???깅┰?섏? ?딅뒗??*:
  25:  *   - ?대뙌?곗쓽 ?곗텧臾쇱? ???`content`(洹??뚮뜑?먯꽌 ?덈줈 留뚮뱾?댁쭊 JSX)瑜?洹몃?濡??ㅼ뼱 ?섎Ⅸ??
  26:  *     ?뺣젹媛믩쭔 媛숇떎怨????곗텧臾쇱쓣 ?ъ궗?⑺븯硫?**?댁슜??諛붾??쒓? ???붾㈃?쇰줈 援노뒗??*(?먮윭 ?놁씠).
  27:  *   - 洹몃젃?ㅺ퀬 ?댁슜源뚯? 鍮꾧탳?섎젮硫??대뙌?곗? 媛숈? O(?됁쀬뿴) ?쒗쉶媛 ?꾩슂?섎떎 ???꾨굜 寃껋씠 ?녿떎.
  28:  * 洹몃옒??諛⑺뼢??諛붽퓭 **?곸닔瑜?以꾩???*: 而щ읆??諛곗뿴 3媛쑣룹닚??4????諛곗뿴 1媛쑣룹닚??2??`tableSort.adaptRows`),
  29:  * ?뺣젹 ?먯젙? 媛믪씠 媛덈━??利됱떆 議곌린 醫낅즺. 洹몃━怨?**?뺤젙?곸쑝濡??쏅룎???좎씪??寃쎈줈**(濡쒕뵫 以? * ?ㅼ펷?덊넠 ???ъ깮????硫붾え濡?留됱븯?? ?몄텧遺 17怨녹? ?먮?吏 ?딅뒗??
  30:  */
  31: 
  32: const EMPTY_ROWS = [];
  33: export default function TableSurface({
  34:     head,
  35:     rows,
  36:     isLoading = false,
  37:     skeletonRowCount = 5,
  38:     rowsPerPage,
  39:     defaultPage,
  40:     emptyView,
  41:     isFixedSize = false,
  42:     isResizable = true,
  43:     stableWidths = true,
  44:     style,
  45:     className,
  46:     footer,
  47: }) {
  48:     const t = useI18nStore(s => s.t);
  49:     const wrapperRef = useRef(null);
  50: 
  51:     const labels = useMemo(() => ({
  52:         asc: t('common.table.sortAsc'),
  53:         desc: t('common.table.sortDesc'),
  54:         button: t('common.table.sortButton'),
  55:     }), [t]);
  56: 
  57:     /*
  58:      * head ???몄텧遺 ?ㅼ닔媛 ?뚮뜑留덈떎 ?몃씪???앹꽦?섎?濡?**媛앹껜 李몄“瑜?硫붾え ?ㅻ줈 ?곕㈃ 留??뚮뜑 ?ш퀎??*?쒕떎.
  59:      * ?뺣젹 ?먯젙???꾩슂??寃껋? 而щ읆 key 紐⑸줉肉먯씠???쒓렇?덉쿂 臾몄옄?대줈 ??좏븳??
  60:      */
  61:     const signature = headSignature(head);
  62: 
  63:     // rows 誘몄쟾????**媛숈? 鍮?諛곗뿴**???대떎 ??留??뚮뜑 ??`[]` 硫??꾨옒 硫붾え媛 ?꾨? ?쏅룉??    const dataRows = Array.isArray(rows) ? rows : EMPTY_ROWS;
  64: 
  65:     /*
  66:      * ?뵶 ?ㅼ펷?덊넠 ?됱? **諛섎뱶??硫붾え**?쒕떎.
  67:      *   `buildSkeletonRows` ??留??몄텧 ??諛곗뿴?대씪, 濡쒕뵫 以묒뿉???대뙌??硫붾え媛 **?뺤젙?곸쑝濡?* 鍮쀫굹媛붾떎
  68:      *   (濡쒕뵫 ?곹깭?먯꽌 遺紐④? 由щ젋?붾맆 ?뚮쭏??O(?됁쀬뿴) ?щ???.
  69:      */
  70:     const effectiveRows = useMemo(
  71:         () => (isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows),
  72:         // ???꾨옒 sortable/adaptedRows ? 媛숈? ?댁쑀濡?head ???signature 瑜?蹂몃떎(留??뚮뜑 ??媛앹껜).
  73:         [isLoading, signature, skeletonRowCount, dataRows],
  74:     );
  75: 
  76:     /*
  77:      * 濡쒕뵫 以묒뿉??**吏곸쟾 ?먯젙??遺숇뱺??** ?ㅼ펷?덊넠 ?됱? ? key 媛 而щ읆 key ??     * 洹몃?濡??먯젙?섎㈃ "?뺣젹 遺덇?"媛 ?섏뼱 ?붿궡?쒓? 留?濡쒕뵫留덈떎 源쒕묀?몃떎.
  78:      */
  79:     const lastSortableRef = useRef(null);
  80:     const sortable = useMemo(() => {
  81:         if (isLoading) {
  82:             const previous = lastSortableRef.current;
  83:             if (previous && previous.signature === signature) return previous.value;
  84:             return resolveSortableColumns(head, []);
  85:         }
  86:         return resolveSortableColumns(head, dataRows);
  87:         // ???섏〈?깆뿉 head 瑜??ｌ? ?딅뒗????留??뚮뜑 ??媛앹껜??硫붾え媛 臾대젰?댁쭊?? signature 媛 ??좏븳??
  88:     }, [signature, isLoading, dataRows]);
  89:     if (!isLoading) lastSortableRef.current = { signature, value: sortable };
  90: 
  91:     const adaptedRows = useMemo(
  92:         () => adaptRows(head, effectiveRows, sortable),
  93:         // ?꾩? 媛숈? ?댁쑀濡?head ???signature ????蹂?섏씠 head ?먯꽌 蹂대뒗 寃껋? 而щ읆 key 援ъ꽦肉먯씠??
  94:         [signature, effectiveRows, sortable],
  95:     );
  96:     // head ??硫붾え?섏? ?딅뒗????踰덉뿭쨌?댄똻 ??content 媛 諛붾뚯뿀?붾뜲 ?쒓렇?덉쿂媛 媛숈쑝硫????ㅻ뜑媛 ?⑤뒗??    const adaptedHead = adaptHead(head, sortable, labels);
  97: 
  98:     const { widths, theadHeight, tableWidth, gutter, setWidths, resetEdge } = useStableColumnWidths({
  99:         wrapperRef,
 100:         head,
 101:         rowCount: dataRows.length,
 102:         isLoading,
 103:         enabled: stableWidths !== false,
 104:     });
 105: 
 106:     // ?숆껐????? head.cells[].width(%) 濡??대젮蹂대궦????DynamicTable ??th/td ?묒そ??嫄몄뼱 以??    const frozenHead = widths && Array.isArray(adaptedHead?.cells)
 107:         ? { ...adaptedHead, cells: adaptedHead.cells.map((cell, i) => (cell ? { ...cell, width: widths[i] } : cell)) }
 108:         : adaptedHead;
 109: 
 110:     const getTableWidth = useCallback(
 111:         () => wrapperRef.current?.querySelector('table')?.getBoundingClientRect().width ?? 0,
 112:         [],
 113:     );
 114: 
 115:     const showResizer = isResizable !== false && Array.isArray(widths) && widths.length > 1;
 116:     // ?좉퇋 怨꾩빟: head.cells[].isResizable === false ??而щ읆???ㅻⅨ履?寃쎄퀎???몃뱾???④릿??    const edges = showResizer ? (head?.cells ?? []).map(cell => cell?.isResizable !== false) : null;
 117: 
 118:     const wrapperClassName = ['table-wrapper', widths ? 'is-width-frozen' : null, className]
 119:         .filter(Boolean)
 120:         .join(' ');
 121: 
 122:     return (
 123:         <div className={wrapperClassName} style={style} ref={wrapperRef}>
 124:             <DynamicTable
 125:                 head={frozenHead}
 126:                 rows={adaptedRows}
 127:                 isLoading={false}
 128:                 isFixedSize={isFixedSize}
 129:                 emptyView={emptyView}
 130:                 {...(rowsPerPage != null ? { rowsPerPage } : {})}
 131:                 {...(defaultPage != null ? { defaultPage } : {})}
 132:             />
 133: 
 134:             {showResizer && (
 135:                 <ColumnResizeOverlay
 136:                     widths={widths}
 137:                     theadHeight={theadHeight}
 138:                     // ?몃뱾??left(%) 湲곗????뚯씠釉붿뿉 留욎텛??媛믩뱾 ??gutter(?덉꽭濡??ㅽ겕濡ㅻ컮 ??留뚰겮 ?ㅻⅨ履쎌쓣 醫곹엺??                    tableWidth={tableWidth}
 139:                     gutter={gutter}
 140:                     edges={edges}
 141:                     label={t('common.table.resizeColumn')}
 142:                     getTableWidth={getTableWidth}
 143:                     onResize={setWidths}
 144:                     onResetEdge={resetEdge}
 145:                 />
 146:             )}
 147: 
 148:             {footer}
 149:         </div>
 150:     );
 151: }
--- static/ui/src/components/table/tableSort.js
   1: /*
   2:  * 怨듭슜 ?뚯씠釉??뺣젹 ?대뙌????**?쒖닔 紐⑤뱢**(React ?놁쓬, 洹몃옒???⑥쐞 ?뚯뒪?멸? 媛?ν븯??.
   3:  *
   4:  * ?? ???대뙌?곗씤媛 ??????????????????????????????????????????????????????????
   5:  * Atlaskit DynamicTable ???뺣젹 媛믪? **?ㅼ쭅 ?????`key`** ??
   6:  * (`hoc/with-sorted-page-rows.js` ??`getSortingCellValue`: ?ㅻ뜑 key ? 媛숈? ?꾩튂??`cells[i].key` 瑜?爰쇰궡 鍮꾧탳)
   7:  * 洹몃윴???몄텧遺 ??ㅼ닔??? `key` ??**而щ읆 ?앸퀎??*('name','status' ???됰쭏???숈씪)瑜??ｋ뒗??
   8:  * ??`isSortable` 而щ읆???붿궡?쒕쭔 ?꾩슦怨??쒖꽌???곸썝??洹몃?濡쒖???二쎌? ?붿궡??32媛?.
   9:  *
  10:  * ?ㅽ뻾?????`key` ??**React key 濡??곗씠吏 ?딅뒗??*(`components/table-row.js` ??`key: cellIndex`).
  11:  * 洹몃옒???뺣젹媛믪쑝濡???뼱?⑤룄 ?ъ“?뺤뿉 ?꾨Т ?곹뼢???녿떎 ?????ъ떎?????대뙌?곗쓽 洹쇨굅??
  12:  *
  13:  * ?? 怨꾩빟 ???????????????????????????????????????????????????????????????????
  14:  *   rows[].cells[].sortValue  (沅뚯옣) ?뺣젹 媛믪쓽 ?⑥씪 異쒖쿂. **?쒖떆媛믪씠 ?꾨땲???먮낯 媛?*???ｋ뒗??
  15:  *                             ?? ?쒖떆??"3h" ?쇰룄 sortValue ??`10800`(珥?,
  16:  *                                 ?쒖떆??"2026-01-02" ?뺤떇?대씪??sortValue ???뺣젹 媛?ν븳 ISO 臾몄옄??
  17:  *   rows[].cells[].sortKey    (deprecated 蹂꾩묶) `sortValue` 媛 ?놁쓣 ?뚮쭔 ?쎈뒗?? storage 2?붾㈃ 援ъ젣??
  18:  *   rows[].cells[].key        (?덇굅?? ???섏씠 ?놁쓣 ?뚮쭔 ?뺣젹媛믪쑝濡??댁꽍?쒕떎.
  19:  *
  20:  * ??**?뺣젹 而щ읆??`sortValue` ??紐⑤뱺 ?됱뿉 洹좎씪?섍쾶 以??** ?쇰? ?됰쭔 二쇰㈃ ?섎㉧吏媛 ? `key`(而щ읆 ?앸퀎??濡? *   ?대갚??洹?而щ읆??議곗슜??**臾몄옄???뺣젹濡?媛뺣벑**?쒕떎(?レ옄 10 ??2 蹂대떎 ?욎꽌????. 媛믪씠 ?녿뒗 ?됱?
  21:  *   ?꾨뱶瑜?鍮쇱? 留먭퀬 `sortValue: null` 濡?紐낆떆??寃???null ? 寃곗륫?쇰줈 泥섎━???쒖そ ?앹뿉 紐⑥씤??
  22:  *
  23:  * ??`sortValue`/`sortKey` ??DynamicTable 濡??대젮蹂대궡湲???**諛섎뱶???쒓굅**?쒕떎.
  24:  *   ? 媛앹껜??誘몄????꾨뱶??洹몃?濡?`<td>` 濡??ㅽ봽?덈뱶?섏뼱 React unknown-prop 寃쎄퀬瑜??몃떎.
  25:  *   (?ㅻ뜑??`isResizable` ??媛숈? ?댁쑀濡?`<th>` 濡??덈?濡?`adaptHead` ?먯꽌 ?쒓굅?쒕떎.)
  26:  */
  27: 
  28: const has = (cell, field) => Object.prototype.hasOwnProperty.call(cell, field);
  29: 
  30: /**
  31:  * 而щ읆???뺣젹 ?먯쿇媛???sortValue > sortKey > key ?? ?놁쑝硫?null(=寃곗륫).
  32:  *
  33:  * ??**?꾨뱶??議댁옱 ?щ?**濡?媛덈┛?? `sortValue: null` ? "媛믪씠 ?녿떎"???살씠誘濡?key 濡??대갚?섏? ?딅뒗???? *   ?대갚?섎㈃ 而щ읆 ?앸퀎??'effectiveMd')媛 ?뺣젹媛믪쑝濡??욎뿬 ?レ옄 而щ읆???듭㎏濡?臾몄옄?댁씠 ?쇰쾭由곕떎.
  34:  */
  35: function rawSortValue(cell) {
  36:     if (!cell) return null;
  37:     if (has(cell, 'sortValue')) return cell.sortValue ?? null;
  38:     if (has(cell, 'sortKey')) return cell.sortKey ?? null;
  39:     return cell.key ?? null;
  40: }
  41: 
  42: function hasSortMeta(cell) {
  43:     return !!cell && (has(cell, 'sortValue') || has(cell, 'sortKey'));
  44: }
  45: 
  46: function isNumericLike(value) {
  47:     if (typeof value === 'number') return Number.isFinite(value);
  48:     if (typeof value === 'string') {
  49:         const trimmed = value.trim();
  50:         return trimmed !== '' && Number.isFinite(Number(trimmed));
  51:     }
  52:     return false;
  53: }
  54: 
  55: /**
  56:  * ?뺣젹 媛???먯젙 ??**?붿궡???몄텧 洹쒖튃???⑥씪 異쒖쿂**.
  57:  *
  58:  * `head.cells[i].isSortable === true` ??而щ읆留??먯젙?쒕떎(?몄텧遺媛 ?붿껌?섏? ?딆? 怨녹뿉 ?붿궡?쒕? ?덈줈 留뚮뱾吏 ?딅뒗??.
  59:  *
  60:  *  1. ?대뒓 ?됱씠??`sortValue`/`sortKey` 瑜?媛吏?       ???뺣젹 媛?? *  2. ? `key` ???쒕줈 ?ㅻⅨ 媛믪씠 2媛??댁긽              ???뺣젹 媛??(?ㅻ뜲?댄꽣瑜?key ???ｌ? ?덇굅??臾댄쉶洹)
  61:  *  3. ? `key` 媛 紐⑤뱺 ?됱뿉???숈씪?섍굅???꾨? ?놁쓬     ??**?뺣젹 遺덇?**(二쎌? ?붿궡???쒓굅)
  62:  *  4. ?됱씠 2媛?誘몃쭔                                     ???뺣젹 遺덇? (?뺣젹?대룄 ?쒖꽌媛 ??諛붾먮떎)
  63:  *
  64:  * 而щ읆 ?앸퀎?먮뒗 ?뺤쓽???됰쭏??媛숆퀬 ?ㅻ뜲?댄꽣???뺤쓽???됰쭏???ㅻⅤ???? * 洹몃옒????洹쒖튃????吏묐떒??**?몄텧遺 ?섏젙 ?놁씠** 湲곌퀎?곸쑝濡?媛덈씪?몃떎.
  65:  *
  66:  * @returns {boolean[]} 而щ읆 ??留뚰겮???먯젙 寃곌낵
  67:  */
  68: export function resolveSortableColumns(head, rows) {
  69:     const cells = head?.cells;
  70:     if (!Array.isArray(cells)) return [];
  71:     const list = Array.isArray(rows) ? rows : [];
  72: 
  73:     return cells.map((cell, i) => {
  74:         if (!cell?.isSortable) return false;
  75:         if (list.length < 2) return false;
  76: 
  77:         let firstKey;
  78:         let sawKey = false;
  79: 
  80:         for (let r = 0; r < list.length; r++) {
  81:             const target = list[r]?.cells?.[i];
  82:             if (!target) continue;
  83:             if (target.sortValue != null || target.sortKey != null) return true;
  84: 
  85:             const key = target.key;
  86:             if (key == null) continue;
  87:             if (!sawKey) {
  88:                 firstKey = key;
  89:                 sawKey = true;
  90:             } else if (key !== firstKey) {
  91:                 // ?쒕줈 ?ㅻⅨ 媛믪쓣 ?대? 遊ㅼ쑝硫?寃곌낵??true 濡??뺤젙 ???⑥? ?됱쓣 ??蹂??댁쑀媛 ?녿떎.
  92:                 return true;
  93:             }
  94:         }
  95:         return false;
  96:     });
  97: }
  98: 
  99: /**
 100:  * head ?ъ옉????`isSortable` ???먯젙 寃곌낵濡???뼱?곌퀬, ?뺣젹 媛??而щ읆??i18n ?댄똻??二쇱엯?쒕떎.
 101:  *
 102:  * Atlaskit ? ?댄똻/aria 瑜??곸뼱濡??섎뱶肄붾뵫('Sort ascending')???먮?濡?**怨듭슜 ?덈꺼 1??二쇱엯**?쇰줈
 103:  * 紐⑤뱺 ?쒓? ??踰덉뿉 踰덉뿭?쒕떎. ?몄텧遺媛 吏곸젒 以 媛믪씠 ?덉쑝硫?洹멸쾬???곗꽑?쒕떎.
 104:  *
 105:  * ??留??뚮뜑 ?몄텧?대룄 ?섎뒗 媛믪떬 ?⑥닔??而щ읆 ?섎쭔??. ?ㅽ엳??硫붾え?섎㈃ ?ㅻ뜑 content(踰덉뿭쨌?댄똻)媛
 106:  *   媛깆떊?먮뒗???쒓렇?덉쿂媛 媛숈븘 **???ㅻ뜑媛 ?⑤뒗** ?ш퀬媛 ?쒕떎.
 107:  */
 108: export function adaptHead(head, sortable, labels) {
 109:     const cells = head?.cells;
 110:     if (!Array.isArray(cells)) return head;
 111: 
 112:     return {
 113:         ...head,
 114:         cells: cells.map((cell, i) => {
 115:             if (!cell) return cell;
 116:             // isResizable ? ?곕━ 怨꾩빟 ?꾩슜 ?꾨뱶 ???④꺼?먮㈃ <th> ?띿꽦?쇰줈 ?덉뼱 React 寃쎄퀬媛 ?쒕떎
 117:             const { isResizable, ...rest } = cell;
 118:             const canSort = !!sortable?.[i];
 119:             rest.isSortable = canSort;
 120: 
 121:             if (canSort && labels) {
 122:                 if (rest.ascendingSortTooltip == null && labels.asc != null) rest.ascendingSortTooltip = labels.asc;
 123:                 if (rest.descendingSortTooltip == null && labels.desc != null) rest.descendingSortTooltip = labels.desc;
 124:                 if (rest.buttonAriaRoleDescription == null && labels.button != null) rest.buttonAriaRoleDescription = labels.button;
 125:             }
 126:             return rest;
 127:         }),
 128:     };
 129: }
 130: 
 131: /**
 132:  * rows ?ъ옉?????뺣젹 ???而щ읆??? `key` 瑜?**?뺢퇋?붾맂 ?뺣젹媛?*?쇰줈 ??뼱?곌퀬
 133:  * `sortValue`/`sortKey` 瑜??쒓굅?쒕떎.
 134:  *
 135:  * **而щ읆 ?⑥쐞 ????듭씪**: 洹?而щ읆??媛믪씠 ?꾨? ?レ옄(?먮뒗 ?レ옄濡??쏀엳??臾몄옄??硫?Number, ?꾨땲硫?String.
 136:  *   DynamicTable 鍮꾧탳湲곕뒗 ??낆씠 ?욎씠硫??レ옄瑜?臾댁“嫄??욎쑝濡?紐곌퀬, `undefined` 硫?鍮꾧탳 ?먯껜媛 臾대꼫吏꾨떎.
 137:  *   寃곗륫移섎뒗 ?レ옄 而щ읆 `-Infinity`, 臾몄옄 而щ읆 `''` 濡?梨꾩슫????ASC ?먯꽌 留??? DESC ?먯꽌 留??ㅻ줈 **?쇨??섍쾶** 紐⑥씤??
 138:  *
 139:  * **臾대?寃?理쒖쟻??*: 諛붽? 寃껋씠 ?섎굹???놁쑝硫?`rows` 瑜?**?먮낯 李몄“ 洹몃?濡?* ?뚮젮以??
 140:  *   ?덇굅??????ㅼ닔)?먯꽌 ?뚮뜑??O(?됁쀬뿴) 媛앹껜 ?좊떦??0???쒕떎.
 141:  */
 142: export function adaptRows(head, rows, sortable) {
 143:     if (!Array.isArray(rows) || rows.length === 0) return rows;
 144:     const cells = head?.cells;
 145:     if (!Array.isArray(cells)) return rows;
 146: 
 147:     const columnCount = cells.length;
 148:     const normalized = new Array(columnCount).fill(null);
 149:     let needsRewrite = false;
 150: 
 151:     /*
 152:      * ??而щ읆??**諛곗뿴 1媛?쨌 ?쒗쉶 2??*濡??앸궦???덉쟾??`map`+`filter`+`map`+?먯젙猷⑦봽 = 諛곗뿴 3媛?쨌 ?쒗쉶 4??.
 153:      *   ???⑥닔???몄텧遺媛 `rows` 瑜?硫붾え?섏? ?딆쑝硫??뚮뜑留덈떎 ?ㅼ떆 ?꾨뒗???몄텧遺 35怨?以?17怨?,
 154:      *   硫붾え ?ㅽ궢???꾪븳 ?쒓렇?덉쿂 鍮꾧탳???댁감??媛숈? ?쒗쉶瑜??붽뎄?섎?濡?**?곸닔瑜?以꾩씠??履?*???ㅼ씠?듭씠??
 155:      *   (?먯꽭??洹쇨굅??`TableSurface` ??二쇱꽍)
 156:      */
 157:     for (let i = 0; i < columnCount; i++) {
 158:         if (!sortable?.[i]) continue;
 159: 
 160:         const column = new Array(rows.length);
 161:         let sawPresent = false;
 162:         let numeric = true;
 163: 
 164:         for (let r = 0; r < rows.length; r++) {
 165:             const value = rawSortValue(rows[r]?.cells?.[i]);
 166:             column[r] = value;
 167:             if (value == null) continue;
 168:             sawPresent = true;
 169:             if (numeric && !isNumericLike(value)) numeric = false;
 170:         }
 171: 
 172:         const asNumber = sawPresent && numeric;
 173:         for (let r = 0; r < rows.length; r++) {
 174:             const value = column[r];
 175:             column[r] = value == null
 176:                 ? (asNumber ? Number.NEGATIVE_INFINITY : '')
 177:                 : (asNumber ? Number(value) : String(value));
 178:             if (!needsRewrite && rows[r]?.cells?.[i]?.key !== column[r]) needsRewrite = true;
 179:         }
 180: 
 181:         normalized[i] = column;
 182:     }
 183: 
 184:     // ?뺣젹怨?臾닿??섍쾶, sortValue/sortKey 媛 ?⑥븘 ?덉쑝硫?<td> 濡??덈?濡?諛섎뱶??嫄룹뼱?몃떎.
 185:     if (!needsRewrite) {
 186:         for (let r = 0; r < rows.length && !needsRewrite; r++) {
 187:             const rowCells = rows[r]?.cells;
 188:             if (!Array.isArray(rowCells)) continue;
 189:             for (let i = 0; i < rowCells.length; i++) {
 190:                 if (hasSortMeta(rowCells[i])) {
 191:                     needsRewrite = true;
 192:                     break;
 193:                 }
 194:             }
 195:         }
 196:     }
 197: 
 198:     if (!needsRewrite) return rows;
 199: 
 200:     return rows.map((row, r) => {
 201:         const rowCells = row?.cells;
 202:         if (!Array.isArray(rowCells)) return row;
 203:         return {
 204:             ...row,
 205:             cells: rowCells.map((cell, i) => {
 206:                 if (!cell) return cell;
 207:                 const column = normalized[i];
 208:                 if (!column && !hasSortMeta(cell)) return cell;
 209:                 // eslint-disable-next-line no-unused-vars -- rest ?ㅽ봽?덈뱶濡????꾨뱶瑜??⑥뼱?대뒗 寃껋씠 紐⑹쟻
 210:                 const { sortValue, sortKey, ...rest } = cell;
 211:                 if (column) rest.key = column[r];
 212:                 return rest;
 213:             }),
 214:         };
 215:     });
 216: }
 217: 
 218: /**
 219:  * head + rows 瑜???踰덉뿉 ?대뙌?명븳???뚯뒪?맞룸떒諛??몄텧??.
 220:  * `TableSurface` ??head/rows ??硫붾え 二쇨린媛 ?щ씪 `adaptHead`/`adaptRows` 瑜??곕줈 遺瑜몃떎.
 221:  */
 222: export function adaptTable(head, rows, { sortable, labels } = {}) {
 223:     const flags = sortable ?? resolveSortableColumns(head, rows);
 224:     return {
 225:         sortable: flags,
 226:         head: adaptHead(head, flags, labels),
 227:         rows: adaptRows(head, rows, flags),
 228:     };
 229: }
--- static/ui/src/pages/projectDetail/ProjectDetailPage.jsx
   1: import ProjectDetailTabs from "../../components/tabs/ProjectDetailTabs";
   2: import {useLocation, useNavigate, useParams} from "react-router-dom";
   3: import React from "react";
   4: import {useQuery} from "@tanstack/react-query";
   5: import {invoke, view} from "@forge/bridge";
   6: import EmptyState from "@atlaskit/empty-state";
   7: import Button from "@atlaskit/button/new";
   8: import {useI18nStore} from "../../stores/useI18nStore";
   9: import ToastFlags from "../../components/feedback/ToastFlags";
  10: import PageContainer from "../../components/layout/PageContainer";
  11: import {findProjectByIdQueryKeys} from "../../utils/queryKey/projectKeys";
  12: import {isProjectScopeDenied} from "../../utils/permissionError";
  13: import {forgeContextKeys} from "../../utils/queryKey/logicalAuditKeys";
  14: 
  15: export default function ProjectDetailPage(){
  16:     const { id } = useParams();
  17:     const location = useLocation();
  18:     const navigate = useNavigate();
  19: 
  20:     const projectName = location.state?.projectName;
  21: 
  22:     const toast = ToastFlags();
  23:     const t = useI18nStore(s=>s.t);
  24: 
  25:     // ?꾨줈?앺듃 ?곸꽭 ?섏쐞 ?붾㈃??媛곴컖 view.getContext()瑜??몄텧?섏? ?딅룄濡???寃쎄퀎?먯꽌
  26:     // ??踰덈쭔 議고쉶?쒕떎. ?뱁엳 Calendar??accountId/timezone??紐⑤몢 以鍮꾨맂 ?ㅼ뿉留?
  27:     // ?쇱젙 議고쉶? drag mutation???쒖옉?쒕떎.
  28:     const { data: forgeContext = null } = useQuery({
  29:         queryKey: forgeContextKeys.current(),
  30:         queryFn: () => view.getContext(),
  31:         staleTime: Infinity,
  32:         retry: 2,
  33:     });
  34: 
  35:     // ???꾨줈?앺듃 ?곗씠??踰붿쐞: 鍮꾩냼???꾨줈?앺듃 ?곸꽭 吏곸젒 ?묎렐(吏곸젒 URL 吏꾩엯 ?? ??
  36:     //   ?쒕쾭媛 PERMISSION_PROJECT_SCOPE_DENIED 瑜?諛섑솚 ???묎렐 遺덇? ?덈궡 + 紐⑸줉 蹂듦?.
  37:     //   (?꾨줎?몃뒗 ?뚯냽???먯껜 ?먮떒?섏? ?딄퀬 ?쒕쾭 ?묐떟留??좊ː)
  38:     const { data: scopeCheck } = useQuery({
  39:         queryKey: findProjectByIdQueryKeys(id),
  40:         queryFn: () => invoke('findProjectById', { project_id: id }),
  41:         enabled: !!id,
  42:         staleTime: 60 * 1000,
  43:         retry: false,
  44:     });
  45: 
  46:     if (scopeCheck && isProjectScopeDenied(scopeCheck)) {
  47:         return (
  48:             <EmptyState
  49:                 header={t('permission.error.projectScopeDeniedTitle')}
  50:                 description={t('permission.error.projectScopeDenied')}
  51:                 headingLevel={2}
  52:                 primaryAction={
  53:                     <Button appearance="primary" onClick={() => navigate('/project')}>
  54:                         {t('permission.error.projectScopeReturnList')}
  55:                     </Button>
  56:                 }
  57:             />
  58:         );
  59:     }
  60: 
  61:     return (
  62:         <PageContainer title={projectName}>
  63:             <ProjectDetailTabs t={t} project_id={id} toast={toast} context={forgeContext}/>
  64:             {toast.FlagUI}
  65:         </PageContainer>
  66:     );
  67: }
--- static/ui/src/components/tabs/ProjectDetailTabs.jsx
   1: import React, {useMemo} from "react";
   2: import {projectDetailTabs} from "../../constants/tabs";
   3: import CommonTab from "./CommonTab";
   4: import {useI18nStore} from "../../stores/useI18nStore";
   5: import {usePermissionStore} from "../../stores/usePermissionStore";
   6: 
   7: export default function ProjectDetailTabs({project_id,toast,context}){
   8:     const t = useI18nStore(s => s.t);
   9:     const canReadReport = usePermissionStore(s => s.canRead('REPORT'));
  10:     const canWriteProject = usePermissionStore(s => s.canWrite('PROJECT'));
  11:     const canReadCost = usePermissionStore(s => s.canRead('PROJECT_COST'));
  12:     /*
  13:      * ?뵶 遺꾩꽍 > ?(P1-e)? `REPORT read` **?** `PROJECT read` 瑜??④퍡 ?붽뎄?쒕떎.
  14:      *   ?щ엺?뷀? 異뺤쓣 二쇰뒗 `findProjectusersByProjectId` 媛 `PROJECT read` ?꾩슜?대씪
  15:      *   REPORT 留뚯쑝濡쒕뒗 ?대떦/湲곗뿬 ?議곌? 源⑥쭊??
  16:      *   ??痍⑤뱷쨌?꾨떖쨌?섏〈??諛곗뿴 **3怨녹쓣 ?④퍡** 怨좎퀜???쒕떎(?섎굹留?鍮좊쑉由щ㈃ 沅뚰븳 濡쒕뱶 ??媛깆떊?섏? ?딅뒗??.
  17:      */
  18:     const canReadProject = usePermissionStore(s => s.canRead('PROJECT'));
  19: 
  20:     // ?몃━/媛꾪듃 酉??꾪솚 寃뚯씠?몃뒗 ??ProjectWorkPanel)??canRead('PROJECT') 濡?吏곸젒 ?쎈뒗??
  21:     // (2026-07-23 媛꾪듃 沅뚰븳 ?듯빀: PROJECT_GANTT ??PROJECT)
  22:     const tabs = useMemo(
  23:         () => projectDetailTabs(t,project_id,toast,canReadReport,canWriteProject,canReadCost,canReadProject,context),
  24:         [t,project_id,toast,canReadReport,canWriteProject,canReadCost,canReadProject,context]
  25:     );
  26: 
  27:     // lazy ??쓽 Suspense 寃쎄퀎??CommonTab ???뚯쑀?쒕떎(紐⑤뱺 ??而⑦뀒?대꼫 怨듯넻).
  28:     return <CommonTab tabs={tabs} />;
  29: }

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 2 'dataRows|const dataRows' 'static/ui/src/components/table/TableSurface.jsx'; Get-Content 'static/ui/src/components/table/TableSurface.jsx' | Select-Object -Index 60,61,62,63,64; git -c safe.directory='C:/CloudJira/moves-workforce' diff --check HEAD; git -c safe.directory='C:/CloudJira/moves-workforce' diff --numstat HEAD" in C:\CloudJira\moves-workforce
 succeeded in 4851ms:
63-
64-    // rows 미전달 시 **같은 빈 배열**을 쓴다 — 매 렌더 새 `[]` 면 아래 메모가 전부 헛돈다
65:    const dataRows = Array.isArray(rows) ? rows : EMPTY_ROWS;
66-
67-    /*
--
71-     */
72-    const effectiveRows = useMemo(
73:        () => (isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows),
74-        // ⚠ 아래 sortable/adaptedRows 와 같은 이유로 head 대신 signature 를 본다(매 렌더 새 객체).
75:        [isLoading, signature, skeletonRowCount, dataRows],
76-    );
77-
--
87-            return resolveSortableColumns(head, []);
88-        }
89:        return resolveSortableColumns(head, dataRows);
90-        // ⚠ 의존성에 head 를 넣지 않는다 — 매 렌더 새 객체라 메모가 무력해진다. signature 가 대신한다.
91:    }, [signature, isLoading, dataRows]);
92-    if (!isLoading) lastSortableRef.current = { signature, value: sortable };
93-
--
103-        wrapperRef,
104-        head,
105:        rowCount: dataRows.length,
106-        isLoading,
107-        enabled: stableWidths !== false,
    const signature = headSignature(head);

    // rows 誘몄쟾????**媛숈? 鍮?諛곗뿴**???대떎 ??留??뚮뜑 ??`[]` 硫??꾨옒 硫붾え媛 ?꾨? ?쏅룉??    const dataRows = Array.isArray(rows) ? rows : EMPTY_ROWS;

    /*
4	1	.gitignore
66	97	src/api/jira/issue/IssueApi.js
1	1	src/rdb/query/ProjectDashboard.js
25	9	src/resolver/backoffice/level/LevelService.js
26	7	src/resolver/backoffice/projectStatus/ProjectStatusService.js
14	3	src/resolver/backoffice/publicHoliday/PublicHolidayService.js
24	10	src/resolver/backoffice/role/RoleService.js
18	2	src/resolver/backoffice/setting/SettingService.js
4	0	src/resolver/backoffice/setting/__test__/SalaryPolicySetting.test.js
4	0	src/resolver/backoffice/setting/__test__/SettingService.test.js
29	14	src/resolver/backoffice/skill/SkillService.js
4	2	src/resolver/myWork/MyWorkService.jsx
13	6	src/resolver/projectDashboard/ProjectDashboardService.js
11	4	src/resolver/projectIssue/ProjectUsersService.js
4	2	src/resolver/utils/worklog/WorklogService.js
4	0	src/seed/SeedData.js
14	3	static/ui/src/components/feedback/ToastFlags.js
33	10	static/ui/src/components/select/UserSearchSelect.jsx
26	3	static/ui/src/components/table/TableSurface.jsx
15	0	static/ui/src/components/table/__test__/tableContract.test.js
11	0	static/ui/src/components/table/__test__/tableSort.test.js
29	18	static/ui/src/components/table/tableSort.js
6	1	static/ui/src/components/tabs/CommonTab.jsx
30	18	static/ui/src/constants/tabs.js
26	3	static/ui/src/pages/myWork/WorklogPage.jsx
4	2	static/ui/src/pages/myWork/utils/useMyWorklogList.js
40	0	static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
6	1	static/ui/src/pages/projectDetail/analysisReport/resource/__test__/resourceAdapterSingleSource.test.js
12	16	static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js
2	1	static/ui/src/pages/projectDetail/analysisReport/team/__test__/projectTeamAnalysisWiring.test.js
12	24	static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx
3	12	static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx
3	16	static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx
82	57	static/ui/src/polling/JobPollingManager.jsx
7	0	static/ui/src/polling/jobPolling.js
62	10	static/ui/src/utils/jiraApi/users/getUserInfos.js
6	0	static/ui/src/utils/queryKey/jiraKeys.js
3	0	static/ui/src/utils/queryKey/queryKeyFactories.test.js
110	20	static/ui/src/utils/useJiraUserInfos.js
warning: in the working copy of 'static/ui/src/components/table/TableSurface.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableContract.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableSort.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/tableSort.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/jiraApi/users/getUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/useJiraUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/TableSurface.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableContract.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableSort.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/tableSort.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/jiraApi/users/getUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/useJiraUserInfos.js', LF will be replaced by CRLF the next time Git touches it

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$file='"'static/ui/src/components/table/useStableColumnWidths.js'; "'$n=0; Get-Content $file | ForEach-Object { $n++; if($n -le 90){'"'{0,4}: {1}' -f "'$n,$_}}; Write-Output '"'--- TableSurface diff'; git -c safe.directory='C:/CloudJira/moves-workforce' diff --unified=70 HEAD -- 'static/ui/src/components/table/TableSurface.jsx' 'static/ui/src/components/table/tableSort.js' 'static/ui/src/components/table/__test__/tableContract.test.js' 'static/ui/src/components/table/__test__/tableSort.test.js'" in C:\CloudJira\moves-workforce
 succeeded in 4434ms:
   1: import { useCallback, useLayoutEffect, useState } from 'react';
   2: 
   3: import { resetEdgeWidths, toPercentWidths } from './columnWidths';
   4: 
   5: /**
   6:  * 而щ읆 ??**怨꾩륫-?숆껐** ????"?몃）遺덈）"???닿껐梨?
   7:  *
   8:  * ?? ??怨꾩륫?멸? ????????????????????????????????????????????????????????????
   9:  * 63媛???以?head `width` 瑜?吏?뺥븳 怨녹? 8?뚯씪肉먯씠怨??섎㉧吏???꾨? auto ??
  10:  * auto ??**?꾩옱 ?섏씠吏???댁슜**?쇰줈 ??쓣 ?뺥븯誘濡??섏씠吏瑜??섍만 ?뚮쭏??而щ읆??異쒕쟻?몃떎.
  11:  * ?щ엺??63媛??쒖쓽 ??쓣 ?먯쑝濡??뺥븯??寃껋? ?좎?蹂댁닔 遺梨꾩씠怨? `isFixedSize`(洹좊벑遺꾪븷)?? * ??誘몄????쒕? 利됱떆 萸됯컿?? ??**泥??ㅻ뜲?댄꽣 ?섏씤?몃? 怨꾩륫??洹?媛?洹몃?濡?紐?諛뺣뒗??**
  12:  * 怨꾩륫媛믪? ?몄텧遺??`width` ?좎뼵???대? 諛섏쁺??寃곌낵??**?대뼡 ?쒕룄 紐⑥뼇??諛붾뚯? ?딅뒗??*
  13:  * (?⑹씠 80???쒕룄 洹몃?濡??좎??쒕떎 ???뺢퇋?뷀븯吏 ?딅뒗 ?댁쑀).
  14:  *
  15:  * ?? ?몄젣 怨꾩륫?섎굹 ??????????????????????????????????????????????????????????
  16:  * **?ㅻ뜲?댄꽣 泥??섏씤???댄썑.** ?ㅼ펷?덊넠 ?? % ??div ??而щ읆 ??쓣 吏?쒗븯吏 紐삵븳?? * (?ㅻ뜑 ?띿뒪?몃쭔 諛섏쁺?? ??洹??④퀎?먯꽌 ?쇰━硫??ㅻ뜲?댄꽣媛 ?섎┛??
  17:  * ?⑤뒗 由ы뵆濡쒖슦???ㅼ펷?덊넠?믪떎?곗씠??1?뚮퓧?닿퀬, 洹??ㅻ줈???섏씠吏 ?꾪솚쨌?뺣젹쨌?꾪꽣???꾩쟾 遺덈??대떎.
  18:  *
  19:  * ?? 由ъ뀑 ???????????????????????????????????????????????????????????????????
  20:  * 而щ읆 援ъ꽦(?쒓렇?덉쿂)??諛붾뚮㈃(`pickCells` 沅뚰븳 寃뚯씠?? ?뺤콉 遺꾧린, ?숈쟻 series) ?ш퀎痢≫븳??
  21:  */
  22: export function headSignature(head) {
  23:     const cells = head?.cells;
  24:     if (!Array.isArray(cells)) return '';
  25:     return cells.map((cell, i) => String(cell?.key ?? `#${i}`)).join('|');
  26: }
  27: 
  28: export default function useStableColumnWidths({ wrapperRef, head, rowCount = 0, isLoading = false, enabled = true }) {
  29:     const signature = headSignature(head);
  30:     const columnCount = head?.cells?.length ?? 0;
  31: 
  32:     // { signature, baseline, widths, theadHeight } ???쒓렇?덉쿂源뚯? ???⑹뼱由щ줈 ?ㅼ뼱 ?먯옄?곸쑝濡?由ъ뀑?쒕떎
  33:     const [frozen, setFrozen] = useState(null);
  34: 
  35:     /*
  36:      * ?섏〈??諛곗뿴???녿떎 ??留??뚮뜑 ???꾨옒 媛?쒕? ?쒖꽌?濡??듦낵???뚮쭔 怨꾩륫?쒕떎.
  37:      * ?대? ?숆껐?먭퀬 ?쒓렇?덉쿂媛 媛숈쑝硫???踰덉㎏ 媛?쒖뿉??O(1) 濡?鍮좎졇?섍컙??
  38:      */
  39:     useLayoutEffect(() => {
  40:         if (!enabled || columnCount === 0) return;
  41:         if (frozen && frozen.signature === signature) return;
  42:         if (isLoading || rowCount < 1) return;
  43: 
  44:         const table = wrapperRef?.current?.querySelector('table');
  45:         if (!table) return;
  46: 
  47:         // `querySelectorAll('thead th')` ??? ?덉뿉 ?쒓? 以묒꺽?섎㈃ ?⑥쓽 ?ㅻ뜑源뚯? 湲곷뒗????        // tHead ??泥????留?蹂몃떎(HTMLTableElement ?쒖? API).
  48:         const headCells = table.tHead?.rows?.[0]?.cells;
  49:         if (!headCells || headCells.length !== columnCount) return;
  50: 
  51:         const widths = toPercentWidths(Array.from(headCells, el => el.getBoundingClientRect().width));
  52:         // ?덉씠?꾩썐???녿뒗 ?섍꼍(jsdom ??? ?⑹씠 0 ???숆껐?섏? ?딄퀬 ?꾪뻾 ?숈옉???좎??쒕떎
  53:         if (!widths) return;
  54: 
  55:         const theadRect = table.tHead.getBoundingClientRect();
  56:         const tableWidth = table.getBoundingClientRect().width ?? 0;
  57:         const wrapperWidth = wrapperRef.current.getBoundingClientRect().width ?? 0;
  58: 
  59:         /*
  60:          * `gutter` = ?섑띁 ?⑤뵫 諛뺤뒪? ?뚯씠釉??ъ씠???щ갚 ??**?몃줈 ?ㅽ겕濡ㅻ컮 ??*.
  61:          *
  62:          * 由ъ궗?댁쫰 ?ㅻ쾭?덉씠???섑띁???덈?諛곗튂?섎뒗???몃뱾??left ??`widths[]` ?꾩쟻%,
  63:          * 利?**?뚯씠釉???* 湲곗??대떎. ??湲곗?? 蹂댄넻 媛숈?留?`maxHeight` 濡??몃줈 ?ㅽ겕濡ㅻ컮媛 ?⑤㈃
  64:          * ?섑띁 ?????ㅽ겕濡ㅻ컮(??5px) 媛 ?뚯씠釉???씠??媛덈씪吏꾨떎.
  65:          *
  66:          * ??쓣 px 濡?紐?諛뺤? ?딄퀬 **?щ갚留?* ??ν븯???댁쑀: ?쒕뒗 `width:100%` ??而⑦뀒?대꼫 ??蹂??         * (李?由ъ궗?댁쫰, Jira ?ъ씠?쒕컮 ?묎린 ??40px ??Forge iframe ?대씪 ?뷀븯??瑜??곕씪媛꾨떎.
  67:          * ?ㅻ쾭?덉씠瑜?怨꾩륫 ?쒖젏 px 濡?怨좎젙?섎㈃ ?몃뱾???닿툔?섍퀬, 而⑦뀒?대꼫媛 醫곸븘吏????ㅻ쾭?덉씠媛
  68:          * ?섑띁瑜??섏퀜 **?녿뜕 媛濡??ㅽ겕濡ㅻ컮**源뚯? 留뚮뱺??`.table-wrapper` ??overflow-x:auto).
  69:          * ?щ갚? 而⑦뀒?대꼫 ??낵 臾닿????곸닔??`left:0 + right:gutter` 硫???蹂?붾? ?먮룞 異붿쥌?섍퀬
  70:          * `right >= 0` ?대씪 媛濡?overflow 媛 援ъ“?곸쑝濡?遺덇??ν븯??
  71:          */
  72:         setFrozen({
  73:             signature,
  74:             baseline: widths,
  75:             widths,
  76:             theadHeight: theadRect.height ?? 0,
  77:             tableWidth,
  78:             gutter: Math.max(0, wrapperWidth - tableWidth),
  79:         });
  80:     });
  81: 
  82:     // ?쒓렇?덉쿂媛 ?닿툔???숈븞? ??쓣 ?곸슜?섏? ?딅뒗????auto 濡??ㅼ떆 洹몃젮吏怨? 洹??곹깭瑜??ш퀎痢≫븳??    const active = frozen && frozen.signature === signature ? frozen : null;
  83: 
  84:     const setWidths = useCallback(next => {
  85:         setFrozen(prev => (prev && Array.isArray(next) ? { ...prev, widths: next } : prev));
  86:     }, []);
  87: 
  88:     const resetEdge = useCallback(edgeIndex => {
  89:         setFrozen(prev => (prev ? { ...prev, widths: resetEdgeWidths(prev.widths, prev.baseline, edgeIndex) } : prev));
  90:     }, []);
--- TableSurface diff
diff --git a/static/ui/src/components/table/TableSurface.jsx b/static/ui/src/components/table/TableSurface.jsx
index 219a22e..b27c5d0 100644
--- a/static/ui/src/components/table/TableSurface.jsx
+++ b/static/ui/src/components/table/TableSurface.jsx
@@ -1,124 +1,147 @@
 import React, { useCallback, useMemo, useRef } from 'react';
 import DynamicTable from '@atlaskit/dynamic-table';
 
 import { useI18nStore } from '../../stores/useI18nStore';
 import ColumnResizeOverlay from './ColumnResizeOverlay';
 import { buildSkeletonRows } from './skeletonRows';
 import { adaptHead, adaptRows, resolveSortableColumns } from './tableSort';
 import useStableColumnWidths, { headSignature } from './useStableColumnWidths';
 import './table.css';
 
 /**
  * DynamicTable 기반 표 3종(`CommonTable`/`PagingTable`/`CursorPagingTable`)이 공유하는 **셸**.
  *
  * 정렬 어댑터·폭 동결·리사이즈 오버레이·스켈레톤을 **여기 한 곳에서만** 구현한다.
  * 개별 화면(63개 표)은 아무것도 고치지 않아도 아래를 그대로 얻는다:
  *   - 컬럼 폭이 첫 실데이터 페인트 시점 그대로 동결(페이지 전환·필터·정렬에 불변)
  *   - 헤더 경계 드래그로 폭 조절(더블클릭으로 복귀)
  *   - **정렬이 실제로 되는 컬럼에만** 화살표가 남는다(죽은 어포던스 제거)
  *
  * 이 컴포넌트는 내부용이다 — 화면은 `CommonTable`/`PagingTable`/`CursorPagingTable` 을 쓴다.
+ *
+ * ── 어댑터 비용에 대해 (성능 감사 P1-13) ────────────────────────────────────
+ * `rows` 를 메모하지 않는 호출부가 절반이라(35곳 중 17곳) 어댑터가 렌더마다 다시 돈다.
+ * "시그니처를 만들어 값이 같으면 통째로 건너뛰기"는 **여기서 성립하지 않는다**:
+ *   - 어댑터의 산출물은 셀의 `content`(그 렌더에서 새로 만들어진 JSX)를 그대로 실어 나른다.
+ *     정렬값만 같다고 옛 산출물을 재사용하면 **내용이 바뀐 표가 옛 화면으로 굳는다**(에러 없이).
+ *   - 그렇다고 내용까지 비교하려면 어댑터와 같은 O(행×열) 순회가 필요하다 — 아낄 것이 없다.
+ * 그래서 방향을 바꿔 **상수를 줄였다**: 컬럼당 배열 3개·순회 4회 → 배열 1개·순회 2회(`tableSort.adaptRows`),
+ * 정렬 판정은 값이 갈리는 즉시 조기 종료. 그리고 **확정적으로 헛돌던 유일한 경로**(로딩 중
+ * 스켈레톤 행 재생성)는 메모로 막았다. 호출부 17곳은 손대지 않는다.
  */
+
+const EMPTY_ROWS = [];
 export default function TableSurface({
     head,
     rows,
     isLoading = false,
     skeletonRowCount = 5,
     rowsPerPage,
     defaultPage,
     emptyView,
     isFixedSize = false,
     isResizable = true,
     stableWidths = true,
     style,
     className,
     footer,
 }) {
     const t = useI18nStore(s => s.t);
     const wrapperRef = useRef(null);
 
     const labels = useMemo(() => ({
         asc: t('common.table.sortAsc'),
         desc: t('common.table.sortDesc'),
         button: t('common.table.sortButton'),
     }), [t]);
 
-    const dataRows = Array.isArray(rows) ? rows : [];
-    const effectiveRows = isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows;
-
     /*
      * head 는 호출부 다수가 렌더마다 인라인 생성하므로 **객체 참조를 메모 키로 쓰면 매 렌더 재계산**된다.
      * 정렬 판정에 필요한 것은 컬럼 key 목록뿐이라 시그니처 문자열로 대신한다.
      */
     const signature = headSignature(head);
 
+    // rows 미전달 시 **같은 빈 배열**을 쓴다 — 매 렌더 새 `[]` 면 아래 메모가 전부 헛돈다
+    const dataRows = Array.isArray(rows) ? rows : EMPTY_ROWS;
+
+    /*
+     * 🔴 스켈레톤 행은 **반드시 메모**한다.
+     *   `buildSkeletonRows` 는 매 호출 새 배열이라, 로딩 중에는 어댑터 메모가 **확정적으로** 빗나갔다
+     *   (로딩 상태에서 부모가 리렌더될 때마다 O(행×열) 재변환).
+     */
+    const effectiveRows = useMemo(
+        () => (isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows),
+        // ⚠ 아래 sortable/adaptedRows 와 같은 이유로 head 대신 signature 를 본다(매 렌더 새 객체).
+        [isLoading, signature, skeletonRowCount, dataRows],
+    );
+
     /*
      * 로딩 중에는 **직전 판정을 붙든다.** 스켈레톤 행은 셀 key 가 컬럼 key 라
      * 그대로 판정하면 "정렬 불가"가 되어 화살표가 매 로딩마다 깜빡인다.
      */
     const lastSortableRef = useRef(null);
     const sortable = useMemo(() => {
         if (isLoading) {
             const previous = lastSortableRef.current;
             if (previous && previous.signature === signature) return previous.value;
             return resolveSortableColumns(head, []);
         }
         return resolveSortableColumns(head, dataRows);
         // ⚠ 의존성에 head 를 넣지 않는다 — 매 렌더 새 객체라 메모가 무력해진다. signature 가 대신한다.
     }, [signature, isLoading, dataRows]);
     if (!isLoading) lastSortableRef.current = { signature, value: sortable };
 
     const adaptedRows = useMemo(
         () => adaptRows(head, effectiveRows, sortable),
         // 위와 같은 이유로 head 대신 signature — 행 변환이 head 에서 보는 것은 컬럼 key 구성뿐이다.
         [signature, effectiveRows, sortable],
     );
     // head 는 메모하지 않는다 — 번역·툴팁 등 content 가 바뀌었는데 시그니처가 같으면 옛 헤더가 남는다
     const adaptedHead = adaptHead(head, sortable, labels);
 
     const { widths, theadHeight, tableWidth, gutter, setWidths, resetEdge } = useStableColumnWidths({
         wrapperRef,
         head,
         rowCount: dataRows.length,
         isLoading,
         enabled: stableWidths !== false,
     });
 
     // 동결된 폭은 head.cells[].width(%) 로 내려보낸다 — DynamicTable 이 th/td 양쪽에 걸어 준다
     const frozenHead = widths && Array.isArray(adaptedHead?.cells)
         ? { ...adaptedHead, cells: adaptedHead.cells.map((cell, i) => (cell ? { ...cell, width: widths[i] } : cell)) }
         : adaptedHead;
 
     const getTableWidth = useCallback(
         () => wrapperRef.current?.querySelector('table')?.getBoundingClientRect().width ?? 0,
         [],
     );
 
     const showResizer = isResizable !== false && Array.isArray(widths) && widths.length > 1;
     // 신규 계약: head.cells[].isResizable === false 인 컬럼의 오른쪽 경계는 핸들을 숨긴다
     const edges = showResizer ? (head?.cells ?? []).map(cell => cell?.isResizable !== false) : null;
 
     const wrapperClassName = ['table-wrapper', widths ? 'is-width-frozen' : null, className]
         .filter(Boolean)
         .join(' ');
 
     return (
         <div className={wrapperClassName} style={style} ref={wrapperRef}>
             <DynamicTable
                 head={frozenHead}
                 rows={adaptedRows}
                 isLoading={false}
                 isFixedSize={isFixedSize}
                 emptyView={emptyView}
                 {...(rowsPerPage != null ? { rowsPerPage } : {})}
                 {...(defaultPage != null ? { defaultPage } : {})}
             />
 
             {showResizer && (
                 <ColumnResizeOverlay
                     widths={widths}
                     theadHeight={theadHeight}
                     // 핸들의 left(%) 기준을 테이블에 맞추는 값들 — gutter(≈세로 스크롤바 폭)만큼 오른쪽을 좁힌다
                     tableWidth={tableWidth}
                     gutter={gutter}
                     edges={edges}
diff --git a/static/ui/src/components/table/__test__/tableContract.test.js b/static/ui/src/components/table/__test__/tableContract.test.js
index dffc4c1..a33a519 100644
--- a/static/ui/src/components/table/__test__/tableContract.test.js
+++ b/static/ui/src/components/table/__test__/tableContract.test.js
@@ -1,73 +1,88 @@
 /*
  * 공용 표 계약 — **소스 정적 검사**.
  *
  * 렌더 테스트가 없는 리포이므로(@testing-library/react 부재), 63개 표가 의존하는 두 가지를
  * 소스 텍스트로 못 박는다:
  *   1. 3종 표가 전부 `TableSurface` 를 거친다 (공용 지점 우회 = 개선이 그 표만 비껴간다)
  *   2. `CommonTable` 의 공개 props 이름이 그대로다 (호출부 60파일 무수정 조건)
  */
 import fs from 'fs';
 import path from 'path';
 
 const tableDir = path.join(__dirname, '..');
 const read = file => fs.readFileSync(path.join(tableDir, file), 'utf8');
 
 describe('3종 표는 TableSurface 를 거친다', () => {
     it.each(['CommonTable.jsx', 'PagingTable.jsx', 'CursorPagingTable.jsx'])('%s', file => {
         const source = read(file);
         expect(source).toMatch(/import\s+TableSurface\s+from\s+'\.\/TableSurface'/);
         expect(source).toMatch(/<TableSurface/);
         // DynamicTable 직접 렌더는 TableSurface 한 곳뿐이어야 한다
         expect(source).not.toMatch(/from\s+'@atlaskit\/dynamic-table'/);
     });
 
     it('TableSurface 만 DynamicTable 을 직접 쓴다', () => {
         expect(read('TableSurface.jsx')).toMatch(/from\s+'@atlaskit\/dynamic-table'/);
     });
 });
 
 describe('CommonTable 공개 API 무변경', () => {
     const source = read('CommonTable.jsx');
 
     it.each([
         'head',
         'rows',
         'rowsPerPage',
         'defaultPage',
         'emptyMessage',
         'emptyView',
         'isLoading',
         'skeletonRows',
         'maxHeight',
         'wrapperStyle',
         'isFixedSize',
     ])('props %s 가 그대로 있다', name => {
         expect(source).toMatch(new RegExp(`\\b${name}\\b`));
     });
 
     it('신규 props 는 기본값이 켜져 있어 호출부가 아무것도 몰라도 개선을 받는다', () => {
         expect(source).toMatch(/isResizable\s*=\s*true/);
         expect(source).toMatch(/stableWidths\s*=\s*true/);
     });
 });
 
+describe('P1-13 어댑터 비용 — 확정적으로 헛도는 경로가 없다', () => {
+    const source = read('TableSurface.jsx');
+
+    it('스켈레톤 행이 메모된다 (매 렌더 새 배열 = 어댑터 메모 확정 무효화)', () => {
+        expect(source).toMatch(/const effectiveRows = useMemo\(/);
+        expect(source).toMatch(/buildSkeletonRows\(head, skeletonRowCount\)/);
+    });
+
+    it('rows 미전달 시 같은 빈 배열을 쓴다', () => {
+        expect(source).toMatch(/const EMPTY_ROWS = \[\];/);
+        expect(source).toMatch(/Array\.isArray\(rows\) \? rows : EMPTY_ROWS/);
+    });
+
+});
+
 describe('마이그레이션 3그룹은 sortValue 계약을 쓴다', () => {
     const srcRoot = path.join(tableDir, '..', '..');
     const migrated = [
         'pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx',
         'pages/portfolio/widgets/PortfolioProjectTable.jsx',
         'backoffice/page/storage/StorageProjectList.jsx',
         'backoffice/page/storage/StorageTableList.jsx',
     ];
 
     it.each(migrated)('%s', file => {
         const source = fs.readFileSync(path.join(srcRoot, file), 'utf8');
         expect(source).toMatch(/sortValue:/);
     });
 
     it('storage 2파일에는 죽은 sortKey 오용이 남아 있지 않다', () => {
         for (const file of migrated.filter(f => f.includes('storage'))) {
             expect(fs.readFileSync(path.join(srcRoot, file), 'utf8')).not.toMatch(/sortKey:/);
         }
     });
 });
diff --git a/static/ui/src/components/table/__test__/tableSort.test.js b/static/ui/src/components/table/__test__/tableSort.test.js
index 0c1a524..8e9ab02 100644
--- a/static/ui/src/components/table/__test__/tableSort.test.js
+++ b/static/ui/src/components/table/__test__/tableSort.test.js
@@ -9,140 +9,151 @@ import { adaptHead, adaptRows, adaptTable, resolveSortableColumns } from '../tab
 const head = (...cells) => ({ cells });
 const row = (key, ...cells) => ({ key, cells });
 
 describe('resolveSortableColumns — 화살표 노출 판정', () => {
     it('컬럼 식별자를 key 에 넣은 레거시 표는 정렬 불가로 판정된다(죽은 화살표 32개)', () => {
         const h = head({ key: 'name', isSortable: true }, { key: 'cost', isSortable: true });
         const rows = [
             row('r1', { key: 'name', content: 'A' }, { key: 'cost', content: '1' }),
             row('r2', { key: 'name', content: 'B' }, { key: 'cost', content: '2' }),
         ];
         expect(resolveSortableColumns(h, rows)).toEqual([false, false]);
     });
 
     it('죽은 화살표 컬럼은 head 에서 isSortable 이 false 로 덮어써진다', () => {
         const h = head({ key: 'name', isSortable: true });
         const rows = [
             row('r1', { key: 'name', content: 'A' }),
             row('r2', { key: 'name', content: 'B' }),
         ];
         const adapted = adaptTable(h, rows);
         expect(adapted.head.cells[0].isSortable).toBe(false);
     });
 
     it('셀 key 에 실데이터를 넣은 표는 정렬 가능 판정을 유지한다(myPage 무회귀)', () => {
         const h = head({ key: 'issue', isSortable: true });
         const rows = [
             row('r1', { key: 'ABC-1', content: 'ABC-1' }),
             row('r2', { key: 'ABC-2', content: 'ABC-2' }),
         ];
         expect(resolveSortableColumns(h, rows)).toEqual([true]);
         expect(adaptTable(h, rows).head.cells[0].isSortable).toBe(true);
     });
 
     it('sortValue 를 준 컬럼은 정렬 가능하고 셀 key 가 sortValue 로 대체된다', () => {
         const h = head({ key: 'time', isSortable: true });
         const rows = [
             row('r1', { key: 'time', content: '3h', sortValue: 10800 }),
             row('r2', { key: 'time', content: '30m', sortValue: 1800 }),
         ];
         const adapted = adaptTable(h, rows);
         expect(adapted.sortable).toEqual([true]);
         expect(adapted.rows.map(r => r.cells[0].key)).toEqual([10800, 1800]);
     });
 
     it('deprecated 별칭 sortKey 도 읽는다(storage 2파일 구제)', () => {
         const h = head({ key: 'size', isSortable: true });
         const rows = [
             row('r1', { key: 'size-0', content: '1 KB', sortKey: 1024 }),
             row('r2', { key: 'size-1', content: '2 KB', sortKey: 2048 }),
         ];
         const adapted = adaptTable(h, rows);
         expect(adapted.sortable).toEqual([true]);
         expect(adapted.rows.map(r => r.cells[0].key)).toEqual([1024, 2048]);
     });
 
     it('sortValue 가 sortKey 보다 우선한다', () => {
         const h = head({ key: 'size', isSortable: true });
         const rows = [
             row('r1', { key: 'x', content: 'a', sortValue: 1, sortKey: 99 }),
             row('r2', { key: 'y', content: 'b', sortValue: 2, sortKey: 98 }),
         ];
         expect(adaptTable(h, rows).rows.map(r => r.cells[0].key)).toEqual([1, 2]);
     });
 
     it('행이 2개 미만이면 정렬 불가다(정렬해도 순서가 안 바뀐다)', () => {
         const h = head({ key: 'time', isSortable: true });
         expect(resolveSortableColumns(h, [])).toEqual([false]);
         expect(resolveSortableColumns(h, [row('r1', { key: 'time', sortValue: 1 })])).toEqual([false]);
     });
 
+    it('값이 갈리는 즉시 판정이 끝나도 결과는 같다 (조기 종료 무회귀)', () => {
+        const h = head({ key: 'issue', isSortable: true });
+        const rows = [
+            row('r1', { key: 'ABC-1' }),
+            row('r2', { key: 'ABC-2' }),   // ← 여기서 true 확정
+            row('r3', null),               // 뒤에 이상한 행이 있어도 판정이 바뀌지 않는다
+            row('r4', { key: 'ABC-1' }),
+        ];
+        expect(resolveSortableColumns(h, rows)).toEqual([true]);
+    });
+
     it('isSortable 미지정 컬럼에는 어떤 경우에도 화살표가 생기지 않는다', () => {
         const h = head({ key: 'time' });
         const rows = [
             row('r1', { key: 'a', sortValue: 1 }),
             row('r2', { key: 'b', sortValue: 2 }),
         ];
         expect(resolveSortableColumns(h, rows)).toEqual([false]);
         expect(adaptTable(h, rows).head.cells[0].isSortable).toBe(false);
     });
 });
 
 describe('adaptRows — 셀 정규화', () => {
     it('sortValue / sortKey 는 결과 셀 객체에서 제거된다(<td> 스프레드 누수 방지)', () => {
         const h = head({ key: 'size', isSortable: true }, { key: 'etc' });
         const rows = [
             row('r1', { key: 'size', content: 'a', sortValue: 1 }, { key: 'etc', content: 'x', sortKey: 7 }),
             row('r2', { key: 'size', content: 'b', sortValue: 2 }, { key: 'etc', content: 'y', sortKey: 8 }),
         ];
         const adapted = adaptRows(h, rows, resolveSortableColumns(h, rows));
         for (const r of adapted) {
             for (const cell of r.cells) {
                 expect(cell).not.toHaveProperty('sortValue');
                 expect(cell).not.toHaveProperty('sortKey');
             }
         }
     });
 
     it('숫자 컬럼의 결측치는 -Infinity 로, 문자 컬럼의 결측치는 빈 문자열로 채운다', () => {
         const h = head({ key: 'num', isSortable: true }, { key: 'str', isSortable: true });
         const rows = [
             row('r1', { key: 'num', sortValue: 5 }, { key: 'str', sortValue: 'b' }),
             row('r2', { key: 'num', sortValue: null }, { key: 'str', sortValue: null }),
             row('r3', { key: 'num', sortValue: 7 }, { key: 'str', sortValue: 'a' }),
         ];
         const adapted = adaptRows(h, rows, resolveSortableColumns(h, rows));
         expect(adapted.map(r => r.cells[0].key)).toEqual([5, Number.NEGATIVE_INFINITY, 7]);
         expect(adapted.map(r => r.cells[1].key)).toEqual(['b', '', 'a']);
     });
 
     it('sortValue: null 은 "값 없음"이지 key 폴백이 아니다(컬럼 식별자가 정렬값에 섞이지 않는다)', () => {
         const h = head({ key: 'effectiveMd', isSortable: true });
         const rows = [
             row('r1', { key: 'effectiveMd', sortValue: 12 }),
             row('r2', { key: 'effectiveMd', sortValue: null }),
             row('r3', { key: 'effectiveMd', sortValue: 3 }),
         ];
         const keys = adaptRows(h, rows, resolveSortableColumns(h, rows)).map(r => r.cells[0].key);
         expect(keys).toEqual([12, Number.NEGATIVE_INFINITY, 3]);
     });
 
     it('컬럼 안에서 타입이 하나로 통일된다(숫자 문자열도 숫자로)', () => {
         const h = head({ key: 'n', isSortable: true });
         const rows = [
             row('r1', { key: 'n', sortValue: '10' }),
             row('r2', { key: 'n', sortValue: 2 }),
         ];
         const keys = adaptRows(h, rows, resolveSortableColumns(h, rows)).map(r => r.cells[0].key);
         expect(keys).toEqual([10, 2]);
         expect(keys.every(k => typeof k === 'number')).toBe(true);
     });
 
     it('숫자가 아닌 값이 섞이면 컬럼 전체를 문자열로 통일한다', () => {
         const h = head({ key: 'mix', isSortable: true });
         const rows = [
             row('r1', { key: 'mix', sortValue: 10 }),
             row('r2', { key: 'mix', sortValue: 'N/A' }),
         ];
         const keys = adaptRows(h, rows, resolveSortableColumns(h, rows)).map(r => r.cells[0].key);
         expect(keys).toEqual(['10', 'N/A']);
     });
diff --git a/static/ui/src/components/table/tableSort.js b/static/ui/src/components/table/tableSort.js
index 0145cf7..f2af9e7 100644
--- a/static/ui/src/components/table/tableSort.js
+++ b/static/ui/src/components/table/tableSort.js
@@ -13,210 +13,221 @@
  * ── 계약 ───────────────────────────────────────────────────────────────────
  *   rows[].cells[].sortValue  (권장) 정렬 값의 단일 출처. **표시값이 아니라 원본 값**을 넣는다.
  *                             예) 표시는 "3h" 라도 sortValue 는 `10800`(초),
  *                                 표시는 "2026-01-02" 형식이라도 sortValue 는 정렬 가능한 ISO 문자열.
  *   rows[].cells[].sortKey    (deprecated 별칭) `sortValue` 가 없을 때만 읽는다. storage 2화면 구제용.
  *   rows[].cells[].key        (레거시) 위 둘이 없을 때만 정렬값으로 해석한다.
  *
  * ⚠ **정렬 컬럼의 `sortValue` 는 모든 행에 균일하게 준다.** 일부 행만 주면 나머지가 셀 `key`(컬럼 식별자)로
  *   폴백해 그 컬럼이 조용히 **문자열 정렬로 강등**된다(숫자 10 이 2 보다 앞서는 식). 값이 없는 행은
  *   필드를 빼지 말고 `sortValue: null` 로 명시할 것 — null 은 결측으로 처리돼 한쪽 끝에 모인다.
  *
  * ⚠ `sortValue`/`sortKey` 는 DynamicTable 로 내려보내기 전 **반드시 제거**한다.
  *   셀 객체의 미지정 필드는 그대로 `<td>` 로 스프레드되어 React unknown-prop 경고를 낸다.
  *   (헤더의 `isResizable` 도 같은 이유로 `<th>` 로 새므로 `adaptHead` 에서 제거한다.)
  */
 
 const has = (cell, field) => Object.prototype.hasOwnProperty.call(cell, field);
 
 /**
  * 컬럼의 정렬 원천값 — sortValue > sortKey > key 순. 없으면 null(=결측).
  *
  * ⚠ **필드의 존재 여부**로 갈린다. `sortValue: null` 은 "값이 없다"는 뜻이므로 key 로 폴백하지 않는다 —
  *   폴백하면 컬럼 식별자('effectiveMd')가 정렬값으로 섞여 숫자 컬럼이 통째로 문자열이 돼버린다.
  */
 function rawSortValue(cell) {
     if (!cell) return null;
     if (has(cell, 'sortValue')) return cell.sortValue ?? null;
     if (has(cell, 'sortKey')) return cell.sortKey ?? null;
     return cell.key ?? null;
 }
 
 function hasSortMeta(cell) {
     return !!cell && (has(cell, 'sortValue') || has(cell, 'sortKey'));
 }
 
 function isNumericLike(value) {
     if (typeof value === 'number') return Number.isFinite(value);
     if (typeof value === 'string') {
         const trimmed = value.trim();
         return trimmed !== '' && Number.isFinite(Number(trimmed));
     }
     return false;
 }
 
 /**
  * 정렬 가능 판정 — **화살표 노출 규칙의 단일 출처**.
  *
  * `head.cells[i].isSortable === true` 인 컬럼만 판정한다(호출부가 요청하지 않은 곳에 화살표를 새로 만들지 않는다).
  *
  *  1. 어느 행이든 `sortValue`/`sortKey` 를 가짐        → 정렬 가능
  *  2. 셀 `key` 의 서로 다른 값이 2개 이상              → 정렬 가능 (실데이터를 key 에 넣은 레거시 무회귀)
  *  3. 셀 `key` 가 모든 행에서 동일하거나 전부 없음     → **정렬 불가**(죽은 화살표 제거)
  *  4. 행이 2개 미만                                     → 정렬 불가 (정렬해도 순서가 안 바뀐다)
  *
  * 컬럼 식별자는 정의상 행마다 같고 실데이터는 정의상 행마다 다르다 —
  * 그래서 이 규칙이 두 집단을 **호출부 수정 없이** 기계적으로 갈라낸다.
  *
  * @returns {boolean[]} 컬럼 수 만큼의 판정 결과
  */
 export function resolveSortableColumns(head, rows) {
     const cells = head?.cells;
     if (!Array.isArray(cells)) return [];
     const list = Array.isArray(rows) ? rows : [];
 
     return cells.map((cell, i) => {
         if (!cell?.isSortable) return false;
         if (list.length < 2) return false;
 
         let firstKey;
         let sawKey = false;
-        let sawDistinct = false;
 
         for (let r = 0; r < list.length; r++) {
             const target = list[r]?.cells?.[i];
             if (!target) continue;
             if (target.sortValue != null || target.sortKey != null) return true;
 
             const key = target.key;
             if (key == null) continue;
             if (!sawKey) {
                 firstKey = key;
                 sawKey = true;
             } else if (key !== firstKey) {
-                sawDistinct = true;
+                // 서로 다른 값을 이미 봤으면 결과는 true 로 확정 — 남은 행을 더 볼 이유가 없다.
+                return true;
             }
         }
-        return sawDistinct;
+        return false;
     });
 }
 
 /**
  * head 재작성 — `isSortable` 을 판정 결과로 덮어쓰고, 정렬 가능 컬럼에 i18n 툴팁을 주입한다.
  *
  * Atlaskit 은 툴팁/aria 를 영어로 하드코딩('Sort ascending')해 두므로 **공용 레벨 1회 주입**으로
  * 모든 표가 한 번에 번역된다. 호출부가 직접 준 값이 있으면 그것을 우선한다.
  *
  * ⚠ 매 렌더 호출해도 되는 값싼 함수다(컬럼 수만큼). 오히려 메모하면 헤더 content(번역·툴팁)가
  *   갱신됐는데 시그니처가 같아 **옛 헤더가 남는** 사고가 난다.
  */
 export function adaptHead(head, sortable, labels) {
     const cells = head?.cells;
     if (!Array.isArray(cells)) return head;
 
     return {
         ...head,
         cells: cells.map((cell, i) => {
             if (!cell) return cell;
             // isResizable 은 우리 계약 전용 필드 — 남겨두면 <th> 속성으로 새어 React 경고가 난다
             const { isResizable, ...rest } = cell;
             const canSort = !!sortable?.[i];
             rest.isSortable = canSort;
 
             if (canSort && labels) {
                 if (rest.ascendingSortTooltip == null && labels.asc != null) rest.ascendingSortTooltip = labels.asc;
                 if (rest.descendingSortTooltip == null && labels.desc != null) rest.descendingSortTooltip = labels.desc;
                 if (rest.buttonAriaRoleDescription == null && labels.button != null) rest.buttonAriaRoleDescription = labels.button;
             }
             return rest;
         }),
     };
 }
 
 /**
  * rows 재작성 — 정렬 대상 컬럼의 셀 `key` 를 **정규화된 정렬값**으로 덮어쓰고
  * `sortValue`/`sortKey` 를 제거한다.
  *
  * **컬럼 단위 타입 통일**: 그 컬럼의 값이 전부 숫자(또는 숫자로 읽히는 문자열)면 Number, 아니면 String.
  *   DynamicTable 비교기는 타입이 섞이면 숫자를 무조건 앞으로 몰고, `undefined` 면 비교 자체가 무너진다.
  *   결측치는 숫자 컬럼 `-Infinity`, 문자 컬럼 `''` 로 채운다 → ASC 에서 맨 앞, DESC 에서 맨 뒤로 **일관되게** 모인다.
  *
  * **무변경 최적화**: 바꿀 것이 하나도 없으면 `rows` 를 **원본 참조 그대로** 돌려준다.
  *   레거시 표(대다수)에서 렌더당 O(행×열) 객체 할당이 0이 된다.
  */
 export function adaptRows(head, rows, sortable) {
     if (!Array.isArray(rows) || rows.length === 0) return rows;
     const cells = head?.cells;
     if (!Array.isArray(cells)) return rows;
 
     const columnCount = cells.length;
     const normalized = new Array(columnCount).fill(null);
     let needsRewrite = false;
 
+    /*
+     * ⚡ 컬럼당 **배열 1개 · 순회 2회**로 끝낸다(예전엔 `map`+`filter`+`map`+판정루프 = 배열 3개 · 순회 4회).
+     *   이 함수는 호출부가 `rows` 를 메모하지 않으면 렌더마다 다시 도는데(호출부 35곳 중 17곳),
+     *   메모 스킵을 위한 시그니처 비교는 어차피 같은 순회를 요구하므로 **상수를 줄이는 쪽**이 실이익이다.
+     *   (자세한 근거는 `TableSurface` 의 주석)
+     */
     for (let i = 0; i < columnCount; i++) {
         if (!sortable?.[i]) continue;
 
-        const raw = rows.map(row => rawSortValue(row?.cells?.[i]));
-        const present = raw.filter(v => v != null);
-        const numeric = present.length > 0 && present.every(isNumericLike);
-        const column = raw.map(v => {
-            if (v == null) return numeric ? Number.NEGATIVE_INFINITY : '';
-            return numeric ? Number(v) : String(v);
-        });
-        normalized[i] = column;
+        const column = new Array(rows.length);
+        let sawPresent = false;
+        let numeric = true;
 
-        if (!needsRewrite) {
-            for (let r = 0; r < rows.length; r++) {
-                if (rows[r]?.cells?.[i]?.key !== column[r]) {
-                    needsRewrite = true;
-                    break;
-                }
-            }
+        for (let r = 0; r < rows.length; r++) {
+            const value = rawSortValue(rows[r]?.cells?.[i]);
+            column[r] = value;
+            if (value == null) continue;
+            sawPresent = true;
+            if (numeric && !isNumericLike(value)) numeric = false;
         }
+
+        const asNumber = sawPresent && numeric;
+        for (let r = 0; r < rows.length; r++) {
+            const value = column[r];
+            column[r] = value == null
+                ? (asNumber ? Number.NEGATIVE_INFINITY : '')
+                : (asNumber ? Number(value) : String(value));
+            if (!needsRewrite && rows[r]?.cells?.[i]?.key !== column[r]) needsRewrite = true;
+        }
+
+        normalized[i] = column;
     }
 
     // 정렬과 무관하게, sortValue/sortKey 가 남아 있으면 <td> 로 새므로 반드시 걷어낸다.
     if (!needsRewrite) {
         for (let r = 0; r < rows.length && !needsRewrite; r++) {
             const rowCells = rows[r]?.cells;
             if (!Array.isArray(rowCells)) continue;
             for (let i = 0; i < rowCells.length; i++) {
                 if (hasSortMeta(rowCells[i])) {
                     needsRewrite = true;
                     break;
                 }
             }
         }
     }
 
     if (!needsRewrite) return rows;
 
     return rows.map((row, r) => {
         const rowCells = row?.cells;
         if (!Array.isArray(rowCells)) return row;
         return {
             ...row,
             cells: rowCells.map((cell, i) => {
                 if (!cell) return cell;
                 const column = normalized[i];
                 if (!column && !hasSortMeta(cell)) return cell;
                 // eslint-disable-next-line no-unused-vars -- rest 스프레드로 두 필드를 떨어내는 것이 목적
                 const { sortValue, sortKey, ...rest } = cell;
                 if (column) rest.key = column[r];
                 return rest;
             }),
         };
     });
 }
 
 /**
  * head + rows 를 한 번에 어댑트한다(테스트·단발 호출용).
  * `TableSurface` 는 head/rows 의 메모 주기가 달라 `adaptHead`/`adaptRows` 를 따로 부른다.
  */
 export function adaptTable(head, rows, { sortable, labels } = {}) {
     const flags = sortable ?? resolveSortableColumns(head, rows);
     return {
         sortable: flags,
         head: adaptHead(head, flags, labels),
         rows: adaptRows(head, rows, flags),
     };
 }
warning: in the working copy of 'static/ui/src/components/table/TableSurface.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableContract.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableSort.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/tableSort.js', LF will be replaced by CRLF the next time Git touches it

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 2 'isSortable\\s*:' static/ui/src | Select-Object -First 400; Write-Output '--- dynamic isSortable expressions'; rg -n 'isSortable\\s*:\\s*["'^,}]*('"\\?|&&|\\(|[A-Za-z_"'$][A-Za-z0-9_$]*'"\\.)' static/ui/src" in C:\CloudJira\moves-workforce
2026-08-12T08:59:21.764289Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 7.3 seconds
Total output lines: 401
Output:
static/ui/src\components\table\__test__\tableSort.test.js-12-describe('resolveSortableColumns — 화살표 노출 판정', () => {
static/ui/src\components\table\__test__\tableSort.test.js-13-    it('컬럼 식별자를 key 에 넣은 레거시 표는 정렬 불가로 판정된다(죽은 화살표 32개)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:14:        const h = head({ key: 'name', isSortable: true }, { key: 'cost', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-15-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-16-            row('r1', { key: 'name', content: 'A' }, { key: 'cost', content: '1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-21-
static/ui/src\components\table\__test__\tableSort.test.js-22-    it('죽은 화살표 컬럼은 head 에서 isSortable 이 false 로 덮어써진다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:23:        const h = head({ key: 'name', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-24-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-25-            row('r1', { key: 'name', content: 'A' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-31-
static/ui/src\components\table\__test__\tableSort.test.js-32-    it('셀 key 에 실데이터를 넣은 표는 정렬 가능 판정을 유지한다(myPage 무회귀)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:33:        const h = head({ key: 'issue', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-34-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-35-            row('r1', { key: 'ABC-1', content: 'ABC-1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-41-
static/ui/src\components\table\__test__\tableSort.test.js-42-    it('sortValue 를 준 컬럼은 정렬 가능하고 셀 key 가 sortValue 로 대체된다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:43:        const h = head({ key: 'time', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-44-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-45-            row('r1', { key: 'time', content: '3h', sortValue: 10800 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-52-
static/ui/src\components\table\__test__\tableSort.test.js-53-    it('deprecated 별칭 sortKey 도 읽는다(storage 2파일 구제)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:54:        const h = head({ key: 'size', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-55-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-56-            row('r1', { key: 'size-0', content: '1 KB', sortKey: 1024 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-63-
static/ui/src\components\table\__test__\tableSort.test.js-64-    it('sortValue 가 sortKey 보다 우선한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:65:        const h = head({ key: 'size', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-66-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-67-            row('r1', { key: 'x', content: 'a', sortValue: 1, sortKey: 99 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-72-
static/ui/src\components\table\__test__\tableSort.test.js-73-    it('행이 2개 미만이면 정렬 불가다(정렬해도 순서가 안 바뀐다)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:74:        const h = head({ key: 'time', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-75-        expect(resolveSortableColumns(h, [])).toEqual([false]);
static/ui/src\components\table\__test__\tableSort.test.js-76-        expect(resolveSortableColumns(h, [row('r1', { key: 'time', sortValue: 1 })])).toEqual([false]);
--
static/ui/src\components\table\__test__\tableSort.test.js-78-
static/ui/src\components\table\__test__\tableSort.test.js-79-    it('값이 갈리는 즉시 판정이 끝나도 결과는 같다 (조기 종료 무회귀)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:80:        const h = head({ key: 'issue', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-81-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-82-            row('r1', { key: 'ABC-1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-101-describe('adaptRows — 셀 정규화', () => {
static/ui/src\components\table\__test__\tableSort.test.js-102-    it('sortValue / sortKey 는 결과 셀 객체에서 제거된다(<td> 스프레드 누수 방지)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:103:        const h = head({ key: 'size', isSortable: true }, { key: 'etc' });
static/ui/src\components\table\__test__\tableSort.test.js-104-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-105-            row('r1', { key: 'size', content: 'a', sortValue: 1 }, { key: 'etc', content: 'x', sortKey: 7 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-116-
static/ui/src\components\table\__test__\tableSort.test.js-117-    it('숫자 컬럼의 결측치는 -Infinity 로, 문자 컬럼의 결측치는 빈 문자열로 채운다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:118:        const h = head({ key: 'num', isSortable: true }, { key: 'str', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-119-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-120-            row('r1', { key: 'num', sortValue: 5 }, { key: 'str', sortValue: 'b' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-128-
static/ui/src\components\table\__test__\tableSort.test.js-129-    it('sortValue: null 은 "값 없음"이지 key 폴백이 아니다(컬럼 식별자가 정렬값에 섞이지 않는다)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:130:        const h = head({ key: 'effectiveMd', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-131-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-132-            row('r1', { key: 'effectiveMd', sortValue: 12 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-139-
static/ui/src\components\table\__test__\tableSort.test.js-140-    it('컬럼 안에서 타입이 하나로 통일된다(숫자 문자열도 숫자로)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:141:        const h = head({ key: 'n', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-142-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-143-            row('r1', { key: 'n', sortValue: '10' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-150-
static/ui/src\components\table\__test__\tableSort.test.js-151-    it('숫자가 아닌 값이 섞이면 컬럼 전체를 문자열로 통일한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:152:        const h = head({ key: 'mix', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-153-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-154-            row('r1', { key: 'mix', sortValue: 10 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-160-
static/ui/src\components\table\__test__\tableSort.test.js-161-    it('무변경 최적화 — 바꿀 것이 없는 레거시 표는 rows 를 동일 참조로 돌려준다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:162:        const h = head({ key: 'name', isSortable: true }, { key: 'etc' });
static/ui/src\components\table\__test__\tableSort.test.js-163-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-164-            row('r1', { key: 'name', content: 'A' }, { key: 'etc', content: 'x' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-170-
static/ui/src\components\table\__test__\tableSort.test.js-171-    it('실데이터 key 컬럼도 정규화가 불필요하면 원본 참조를 유지한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:172:        const h = head({ key: 'issue', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-173-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-174-            row('r1', { key: 'ABC-1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-181-describe('adaptHead — 헤더 재작성', () => {
static/ui/src\components\table\__test__\tableSort.test.js-182-    it('정렬 가능한 컬럼에만 i18n 툴팁을 주입한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:183:        const h = head({ key: 'a', isSortable: true }, { key: 'b', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-184-        const labels = { asc: '오름차순 정렬', desc: '내림차순 정렬', button: '정렬 버튼' };
static/ui/src\components\table\__test__\tableSort.test.js-185-        const adapted = adaptHead(h, [true, false], labels);
--
static/ui/src\components\table\__test__\tableSort.test.js-192-
static/ui/src\components\table\__test__\tableSort.test.js-193-    it('호출부가 직접 준 툴팁이 있으면 덮어쓰지 않는다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:194:        const h = head({ key: 'a', isSortable: true, ascendingSortTooltip: '직접 지정' });
static/ui/src\components\table\__test__\tableSort.test.js-195-        const adapted = adaptHead(h, [true], { asc: '기본', desc: 'd', button: 'b' });
static/ui/src\components\table\__test__\tableSort.test.js-196-        expect(adapted.cells[0].ascendingSortTooltip).toBe('직접 지정');
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-57-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-58-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:59:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:60:            { key: 'members', content: t('teamAnalytics.metric.utilMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:61:            { key: 'util', content: t('teamAnalytics.metric.utilization'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:62:            { key: 'effort', content: t('teamAnalytics.metric.effortMd'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-63-        ],
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-64-    }), [t]);
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-51-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-52-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx:53:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx:54:            { key: 'total', content: t('teamAnalytics.metric.utilMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-55-            ...BAND_PAIRS.map(({ band }) => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx:56:                key: band, content: t(`teamAnalytics.band.${band}`), isSortable: true,
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-57-            })),
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-58-        ],
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-74-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-75-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx:76:            { key: 'project', content: t('teamAnalytics.col.project'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx:77:            { key: 'total', content: t('teamAnalytics.metric.effortMd'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-78-            ...model.teamColumns.map((c) => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-79-                key: c.teamKey ?? '__unassigned__',
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-80-                content: c.teamName,
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx:81:                isSortable: true,
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-82-            })),
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-83-        ],
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-44-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-45-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx:46:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx:47:            { key: 'total', content: t('teamAnalytics.metric.orgMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx:48:            ...model.series.map((s) => ({ key: s.name, content: s.name, isSortable: true })),
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-49-        ],
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-50-    }), [model.series, t]);
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-119-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-120-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx:121:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx:122:            { key: 'value', content: t(`teamAnalytics.axis.${axis}`), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx:123:            { key: 'members', content: t('teamAnalytics.metric.activeMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-124-        ],
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-125-    }), [t, axis]);
--
static/ui/src\backoffice\page\storage\StorageTableList.jsx-13-    const head = {
static/ui/src\backoffice\page\storage\StorageTableList.jsx-14-        cells: [
static/ui/src\backoffice\page\storage\StorageTableList.jsx:15:            { key: 'name', content: t('storage.table.col.name'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageTableList.jsx:16:            { key: 'desc', content: t('storage.table.col.desc'), isSortable: false },
static/ui/src\backoffice\page\storage\StorageTableList.jsx:17:            { key: 'size', content: t('storage.table.col.size'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageTableList.jsx:18:            { key: 'rows', content: t('storage.table.col.rows'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageTableList.jsx-19-        ],
static/ui/src\backoffice\page\storage\StorageTableList.jsx-20-    };
--
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-138-    const flatHead = {
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-139-        cells: [
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:140:            { key: "date", content: t("myPage.worklog.col.date"), isSortable: true, width: 12 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:141:            { key: "issueKey", content: t("worklog.worklogTable.key"), isSortable: true, width: 14 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:142:            { key: "summary", content: t("worklog.worklogTable.summary"), isSortable: true, width: 30 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:143:            { key: "time", content: t("myPage.worklog.col.time"), isSortable: true, width: 12 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-144-            { key: "comment", content: t("myPage.worklog.col.comment"), width: 32 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-145-        ],
--
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-196-    const groupHead = {
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-197-        cells: [
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:198:            { key: "issueKey", content: t("worklog.worklogTable.key"), isSortable: true, width: 16 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:199:            { key: "summary", content: t("worklog.worklogTable.summary"), isSortable: true, width: 46 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:200:            { key: "hours", content: t("myPage.worklog.col.totalTime"), isSortable: true, width: 18 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:201:            { key: "count", content: t("myPage.worklog.col.count"), isSortable: true, width: 20 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-202-        ],
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-203-    };
--
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-24-    const head = {
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-25-        cells: [
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:26:            { key: 'name', content: t('storage.project.col.name'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:27:            { key: 'size', content: t('storage.project.col.size'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:28:            { key: 'percent', content: t('storage.project.col.percent'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:29:            { key: 'rows', content: t('storage.project.col.rows'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-30-        ],
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-31-    };
--
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-102-    const head = {
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-103-        cells: [
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:104:            { key: "issueKey", content: t("worklog.worklogTable.key"), isSortable: true, width: 14 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:105:            { key: "summary", content: t("worklog.worklogTable.summary"), isSortable: true, width: 38 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:106:            { key: "status", content: t("worklog.worklogTable.status"), isSortable: true, width: 16 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:107:            { key: "role", content: t("myPage.issues.col.myRole"), isSortable: true, width: 14 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:108:            { key: "d…735 tokens truncated…able.jsx:76:            { key: 'costPerMd', content: t('cost.issue.col.costPerMd'), width: 16, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-77-        ],
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-78-    }), [t]);
--
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-135-        cells: [
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-136-            { key: 'member', content: t('cost.issue.col.member'), width: 38 },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:137:            { key: 'actualMd', content: t('cost.issue.col.actualMd'), width: 20, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:138:            { key: 'cost', content: t('cost.issue.col.cost'), width: 24, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:139:            { key: 'ratio', content: t('cost.issue.col.ratio'), width: 18, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-140-        ],
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-141-    }), [t]);
--
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-86-    const tableHead = useMemo(() => ({
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-87-        cells: [
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx:88:            { key: 'month', content: t('cost.burnup.colMonth'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx:89:            { key: 'actual', content: t('cost.burnup.colActual'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx:90:            { key: 'cumulative', content: t('cost.burnup.colCumulative'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-91-        ],
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-92-    }), [t]);
--
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-108-        cells: [
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-109-            { key: 'name', content: axisLabel },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx:110:            { key: 'planned', content: t('cost.roleLevel.planned'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx:111:            { key: 'actual', content: t('cost.roleLevel.actual'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx:112:            { key: 'memberCount', content: t('cost.roleLevel.colMemberCount'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-113-        ],
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-114-    }), [t, axisLabel]);
--
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-37-        cells: [
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-38-            { key: 'metric', content: t('projectDetail.analysis.progress.bar.colMetric') },
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx:39:            { key: 'rate', content: t('projectDetail.analysis.progress.bar.colRate'), isSortable: true },
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-40-        ],
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-41-    }), [t]);
--
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-44-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-45-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx:46:                { key: "label", content: axis === "role" ? t("portfolio.cost.byRoleLevel.role") : t("portfolio.cost.byRoleLevel.level"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx:47:                { key: "planned", content: t("portfolio.cost.byRoleLevel.planned"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx:48:                { key: "actual", content: t("portfolio.cost.byRoleLevel.actual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-49-            ],
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-50-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-38-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-39-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx:40:                { key: "project", content: t("portfolio.cost.planActual.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx:41:                { key: "planned", content: t("portfolio.cost.planActual.planned"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx:42:                { key: "actual", content: t("portfolio.cost.planActual.actual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-43-            ],
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-44-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-16-    const head = {
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-17-        cells: [
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:18:            { key: "name", content: t("portfolio.cost.overrunRank.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:19:            { key: "cpi", content: t("portfolio.cost.overrunRank.colCpi"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:20:            { key: "burnRate", content: t("portfolio.cost.overrunRank.colBurnRate"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:21:            { key: "completion", content: t("portfolio.cost.overrunRank.colCompletion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-22-            { key: "state", content: t("portfolio.cost.overrunRank.colState") },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-23-        ],
--
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-56-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-57-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:58:                { key: "project", content: t("portfolio.plannedActual.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:59:                { key: "planned", content: t("portfolio.plannedActual.planned"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:60:                { key: "actual", content: t("portfolio.plannedActual.actual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:61:                { key: "rate", content: t("portfolio.plannedActual.colRate"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-62-            ],
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-63-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-42-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-43-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx:44:                { key: "month", content: t("portfolio.cost.monthlyBurn.colMonth"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx:45:                { key: "actual", content: t("portfolio.cost.monthlyBurn.colActual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-46-            ],
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-47-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-56-                        ? t("portfolio.effortTrend.colWeek")
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-57-                        : t("portfolio.effortTrend.colMonth"),
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx:58:                    isSortable: true,
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-59-                },
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx:60:                ...series.map((s) => ({ key: s.name, content: s.name, isSortable: true })),
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-61-            ],
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-62-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-44-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-45-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:46:                { key: "project", content: t("portfolio.issueStatus.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:47:                { key: "done", content: t("portfolio.issueStatus.done"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:48:                { key: "inProgress", content: t("portfolio.issueStatus.inProgress"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:49:                { key: "todo", content: t("portfolio.issueStatus.todo"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:50:                { key: "total", content: t("portfolio.issueStatus.colTotal"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-51-            ],
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-52-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-37-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-38-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx:39:                { key: "project", content: t("portfolio.roleLevel.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx:40:                ...series.map((s) => ({ key: s.name, content: s.name, isSortable: true })),
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-41-            ],
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-42-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-51-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-52-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx:53:                { key: "bucket", content: t("portfolio.salary.colBucket"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx:54:                { key: "count", content: t("portfolio.salary.colCount"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-55-            ],
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-56-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-57-    const head = {
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-58-        cells: pickCells(columnKeys, {
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:59:            name: { key: "name", content: t("portfolio.table.name"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-60-            status: { key: "status", content: t("portfolio.table.status") },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:61:            members: { key: "members", content: t("portfolio.table.members"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:62:            actualMm: { key: "actualMm", content: t("portfolio.table.actualMm"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:63:            salary: { key: "salary", content: t("portfolio.table.salary"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:64:            completion: { key: "completion", content: t("portfolio.table.completion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:65:            schedule: { key: "schedule", content: t("portfolio.table.schedule"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:66:            utilization: { key: "utilization", content: t("portfolio.table.utilization"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-67-            risk: { key: "risk", content: t("portfolio.table.risk") },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-68-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-58-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-59-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:60:                { key: "issueKey", content: t("portfolio.problem.colIssue"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:61:                { key: "projectName", content: t("portfolio.problem.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-62-                { key: "summary", content: t("portfolio.problem.colSummary") },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:63:                { key: "assignee", content: t("portfolio.problem.assignee"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:64:                { key: "delayDays", content: t("portfolio.problem.x"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:65:                { key: "effortDiff", content: t("portfolio.problem.y"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:66:                { key: "severity", content: t("portfolio.problem.severity"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-67-            ],
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-68-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-187-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-188-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:189:                { key: "project", content: t("portfolio.gantt.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:190:                { key: "start", content: t("portfolio.gantt.colStart"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:191:                { key: "end", content: t("portfolio.gantt.colEnd"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:192:                { key: "duration", content: t("portfolio.gantt.colDuration"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:193:                { key: "elapsed", content: t("portfolio.gantt.colElapsed"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:194:                { key: "completion", content: t("portfolio.gantt.colCompletion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-195-            ],
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-196-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-86-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-87-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:88:                { key: "band", content: t("portfolio.utilization.colBand"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:89:                { key: "count", content: t("portfolio.utilization.colCount"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-90-            ],
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-91-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-137-                        head={{
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-138-                            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:139:                                { key: "member", content: t("portfolio.utilization.colMember"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:140:                                { key: "util", content: t("portfolio.utilization.colUtil"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-141-                            ],
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-142-                        }}
--
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-215-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-216-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:217:                { key: "project", content: t("portfolio.utilization.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:218:                { key: "member", content: t("portfolio.utilization.colMember"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:219:                { key: "util", content: t("portfolio.utilization.colUtil"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:220:                { key: "band", content: t("portfolio.utilization.colState"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-221-            ],
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-222-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-58-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-59-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx:60:                { key: "project", content: t("portfolio.scopeProgress.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx:61:                { key: "completion", content: t("portfolio.scopeProgress.completion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx:62:                { key: "schedule", content: t("portfolio.scopeProgress.schedule"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-63-            ],
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-64-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-54-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-55-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx:56:                { key: "project", content: t("portfolio.risk.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx:57:                { key: "risk", content: t("portfolio.risk.colRisk"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx:58:                { key: "diff", content: t("portfolio.risk.colDiff"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-59-                { key: "status", content: t("portfolio.risk.colStatus") },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-60-            ],
--
--- dynamic isSortable expressions

 exited 1 in 7289ms:
static/ui/src\components\table\__test__\tableSort.test.js-12-describe('resolveSortableColumns — 화살표 노출 판정', () => {
static/ui/src\components\table\__test__\tableSort.test.js-13-    it('컬럼 식별자를 key 에 넣은 레거시 표는 정렬 불가로 판정된다(죽은 화살표 32개)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:14:        const h = head({ key: 'name', isSortable: true }, { key: 'cost', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-15-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-16-            row('r1', { key: 'name', content: 'A' }, { key: 'cost', content: '1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-21-
static/ui/src\components\table\__test__\tableSort.test.js-22-    it('죽은 화살표 컬럼은 head 에서 isSortable 이 false 로 덮어써진다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:23:        const h = head({ key: 'name', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-24-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-25-            row('r1', { key: 'name', content: 'A' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-31-
static/ui/src\components\table\__test__\tableSort.test.js-32-    it('셀 key 에 실데이터를 넣은 표는 정렬 가능 판정을 유지한다(myPage 무회귀)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:33:        const h = head({ key: 'issue', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-34-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-35-            row('r1', { key: 'ABC-1', content: 'ABC-1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-41-
static/ui/src\components\table\__test__\tableSort.test.js-42-    it('sortValue 를 준 컬럼은 정렬 가능하고 셀 key 가 sortValue 로 대체된다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:43:        const h = head({ key: 'time', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-44-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-45-            row('r1', { key: 'time', content: '3h', sortValue: 10800 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-52-
static/ui/src\components\table\__test__\tableSort.test.js-53-    it('deprecated 별칭 sortKey 도 읽는다(storage 2파일 구제)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:54:        const h = head({ key: 'size', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-55-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-56-            row('r1', { key: 'size-0', content: '1 KB', sortKey: 1024 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-63-
static/ui/src\components\table\__test__\tableSort.test.js-64-    it('sortValue 가 sortKey 보다 우선한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:65:        const h = head({ key: 'size', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-66-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-67-            row('r1', { key: 'x', content: 'a', sortValue: 1, sortKey: 99 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-72-
static/ui/src\components\table\__test__\tableSort.test.js-73-    it('행이 2개 미만이면 정렬 불가다(정렬해도 순서가 안 바뀐다)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:74:        const h = head({ key: 'time', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-75-        expect(resolveSortableColumns(h, [])).toEqual([false]);
static/ui/src\components\table\__test__\tableSort.test.js-76-        expect(resolveSortableColumns(h, [row('r1', { key: 'time', sortValue: 1 })])).toEqual([false]);
--
static/ui/src\components\table\__test__\tableSort.test.js-78-
static/ui/src\components\table\__test__\tableSort.test.js-79-    it('값이 갈리는 즉시 판정이 끝나도 결과는 같다 (조기 종료 무회귀)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:80:        const h = head({ key: 'issue', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-81-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-82-            row('r1', { key: 'ABC-1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-101-describe('adaptRows — 셀 정규화', () => {
static/ui/src\components\table\__test__\tableSort.test.js-102-    it('sortValue / sortKey 는 결과 셀 객체에서 제거된다(<td> 스프레드 누수 방지)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:103:        const h = head({ key: 'size', isSortable: true }, { key: 'etc' });
static/ui/src\components\table\__test__\tableSort.test.js-104-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-105-            row('r1', { key: 'size', content: 'a', sortValue: 1 }, { key: 'etc', content: 'x', sortKey: 7 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-116-
static/ui/src\components\table\__test__\tableSort.test.js-117-    it('숫자 컬럼의 결측치는 -Infinity 로, 문자 컬럼의 결측치는 빈 문자열로 채운다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:118:        const h = head({ key: 'num', isSortable: true }, { key: 'str', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-119-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-120-            row('r1', { key: 'num', sortValue: 5 }, { key: 'str', sortValue: 'b' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-128-
static/ui/src\components\table\__test__\tableSort.test.js-129-    it('sortValue: null 은 "값 없음"이지 key 폴백이 아니다(컬럼 식별자가 정렬값에 섞이지 않는다)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:130:        const h = head({ key: 'effectiveMd', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-131-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-132-            row('r1', { key: 'effectiveMd', sortValue: 12 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-139-
static/ui/src\components\table\__test__\tableSort.test.js-140-    it('컬럼 안에서 타입이 하나로 통일된다(숫자 문자열도 숫자로)', () => {
static/ui/src\components\table\__test__\tableSort.test.js:141:        const h = head({ key: 'n', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-142-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-143-            row('r1', { key: 'n', sortValue: '10' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-150-
static/ui/src\components\table\__test__\tableSort.test.js-151-    it('숫자가 아닌 값이 섞이면 컬럼 전체를 문자열로 통일한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:152:        const h = head({ key: 'mix', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-153-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-154-            row('r1', { key: 'mix', sortValue: 10 }),
--
static/ui/src\components\table\__test__\tableSort.test.js-160-
static/ui/src\components\table\__test__\tableSort.test.js-161-    it('무변경 최적화 — 바꿀 것이 없는 레거시 표는 rows 를 동일 참조로 돌려준다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:162:        const h = head({ key: 'name', isSortable: true }, { key: 'etc' });
static/ui/src\components\table\__test__\tableSort.test.js-163-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-164-            row('r1', { key: 'name', content: 'A' }, { key: 'etc', content: 'x' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-170-
static/ui/src\components\table\__test__\tableSort.test.js-171-    it('실데이터 key 컬럼도 정규화가 불필요하면 원본 참조를 유지한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:172:        const h = head({ key: 'issue', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-173-        const rows = [
static/ui/src\components\table\__test__\tableSort.test.js-174-            row('r1', { key: 'ABC-1' }),
--
static/ui/src\components\table\__test__\tableSort.test.js-181-describe('adaptHead — 헤더 재작성', () => {
static/ui/src\components\table\__test__\tableSort.test.js-182-    it('정렬 가능한 컬럼에만 i18n 툴팁을 주입한다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:183:        const h = head({ key: 'a', isSortable: true }, { key: 'b', isSortable: true });
static/ui/src\components\table\__test__\tableSort.test.js-184-        const labels = { asc: '오름차순 정렬', desc: '내림차순 정렬', button: '정렬 버튼' };
static/ui/src\components\table\__test__\tableSort.test.js-185-        const adapted = adaptHead(h, [true, false], labels);
--
static/ui/src\components\table\__test__\tableSort.test.js-192-
static/ui/src\components\table\__test__\tableSort.test.js-193-    it('호출부가 직접 준 툴팁이 있으면 덮어쓰지 않는다', () => {
static/ui/src\components\table\__test__\tableSort.test.js:194:        const h = head({ key: 'a', isSortable: true, ascendingSortTooltip: '직접 지정' });
static/ui/src\components\table\__test__\tableSort.test.js-195-        const adapted = adaptHead(h, [true], { asc: '기본', desc: 'd', button: 'b' });
static/ui/src\components\table\__test__\tableSort.test.js-196-        expect(adapted.cells[0].ascendingSortTooltip).toBe('직접 지정');
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-57-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-58-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:59:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:60:            { key: 'members', content: t('teamAnalytics.metric.utilMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:61:            { key: 'util', content: t('teamAnalytics.metric.utilization'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx:62:            { key: 'effort', content: t('teamAnalytics.metric.effortMd'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-63-        ],
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilScatter.jsx-64-    }), [t]);
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-51-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-52-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx:53:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx:54:            { key: 'total', content: t('teamAnalytics.metric.utilMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-55-            ...BAND_PAIRS.map(({ band }) => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx:56:                key: band, content: t(`teamAnalytics.band.${band}`), isSortable: true,
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-57-            })),
static/ui/src\pages\resource\teamAnalytics\charts\TeamUtilBandStack.jsx-58-        ],
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-74-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-75-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx:76:            { key: 'project', content: t('teamAnalytics.col.project'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx:77:            { key: 'total', content: t('teamAnalytics.metric.effortMd'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-78-            ...model.teamColumns.map((c) => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-79-                key: c.teamKey ?? '__unassigned__',
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-80-                content: c.teamName,
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx:81:                isSortable: true,
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-82-            })),
static/ui/src\pages\resource\teamAnalytics\charts\TeamProjectStack.jsx-83-        ],
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-44-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-45-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx:46:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx:47:            { key: 'total', content: t('teamAnalytics.metric.orgMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx:48:            ...model.series.map((s) => ({ key: s.name, content: s.name, isSortable: true })),
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-49-        ],
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompositionStack.jsx-50-    }), [model.series, t]);
--
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-119-    const tableHead = useMemo(() => ({
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-120-        cells: [
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx:121:            { key: 'team', content: t('teamAnalytics.col.team'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx:122:            { key: 'value', content: t(`teamAnalytics.axis.${axis}`), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx:123:            { key: 'members', content: t('teamAnalytics.metric.activeMembers'), isSortable: true },
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-124-        ],
static/ui/src\pages\resource\teamAnalytics\charts\TeamCompareBar.jsx-125-    }), [t, axis]);
--
static/ui/src\backoffice\page\storage\StorageTableList.jsx-13-    const head = {
static/ui/src\backoffice\page\storage\StorageTableList.jsx-14-        cells: [
static/ui/src\backoffice\page\storage\StorageTableList.jsx:15:            { key: 'name', content: t('storage.table.col.name'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageTableList.jsx:16:            { key: 'desc', content: t('storage.table.col.desc'), isSortable: false },
static/ui/src\backoffice\page\storage\StorageTableList.jsx:17:            { key: 'size', content: t('storage.table.col.size'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageTableList.jsx:18:            { key: 'rows', content: t('storage.table.col.rows'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageTableList.jsx-19-        ],
static/ui/src\backoffice\page\storage\StorageTableList.jsx-20-    };
--
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-138-    const flatHead = {
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-139-        cells: [
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:140:            { key: "date", content: t("myPage.worklog.col.date"), isSortable: true, width: 12 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:141:            { key: "issueKey", content: t("worklog.worklogTable.key"), isSortable: true, width: 14 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:142:            { key: "summary", content: t("worklog.worklogTable.summary"), isSortable: true, width: 30 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:143:            { key: "time", content: t("myPage.worklog.col.time"), isSortable: true, width: 12 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-144-            { key: "comment", content: t("myPage.worklog.col.comment"), width: 32 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-145-        ],
--
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-196-    const groupHead = {
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-197-        cells: [
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:198:            { key: "issueKey", content: t("worklog.worklogTable.key"), isSortable: true, width: 16 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:199:            { key: "summary", content: t("worklog.worklogTable.summary"), isSortable: true, width: 46 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:200:            { key: "hours", content: t("myPage.worklog.col.totalTime"), isSortable: true, width: 18 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx:201:            { key: "count", content: t("myPage.worklog.col.count"), isSortable: true, width: 20 },
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-202-        ],
static/ui/src\pages\myPage\sections\MyWorklogPanel.jsx-203-    };
--
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-24-    const head = {
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-25-        cells: [
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:26:            { key: 'name', content: t('storage.project.col.name'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:27:            { key: 'size', content: t('storage.project.col.size'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:28:            { key: 'percent', content: t('storage.project.col.percent'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx:29:            { key: 'rows', content: t('storage.project.col.rows'), isSortable: true },
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-30-        ],
static/ui/src\backoffice\page\storage\StorageProjectList.jsx-31-    };
--
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-102-    const head = {
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-103-        cells: [
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:104:            { key: "issueKey", content: t("worklog.worklogTable.key"), isSortable: true, width: 14 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:105:            { key: "summary", content: t("worklog.worklogTable.summary"), isSortable: true, width: 38 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:106:            { key: "status", content: t("worklog.worklogTable.status"), isSortable: true, width: 16 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:107:            { key: "role", content: t("myPage.issues.col.myRole"), isSortable: true, width: 14 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx:108:            { key: "duedate", content: t("myPage.issues.col.due"), isSortable: true, width: 18 },
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-109-        ],
static/ui/src\pages\myPage\sections\MyIssuesPanel.jsx-110-    };
--
static/ui/src\pages\projectDetail\progress\ProgressStatusDistribution.jsx-47-                    ? t('projectDetail.analysis.progress.status.byCount')
static/ui/src\pages\projectDetail\progress\ProgressStatusDistribution.jsx-48-                    : t('projectDetail.analysis.progress.status.byEffort'),
static/ui/src\pages\projectDetail\progress\ProgressStatusDistribution.jsx:49:                isSortable: true,
static/ui/src\pages\projectDetail\progress\ProgressStatusDistribution.jsx-50-            },
static/ui/src\pages\projectDetail\progress\ProgressStatusDistribution.jsx-51-        ],
--
static/ui/src\pages\projectDetail\progress\ProgressSCurve.jsx-193-    const tableHead = useMemo(() => ({
static/ui/src\pages\projectDetail\progress\ProgressSCurve.jsx-194-        cells: [
static/ui/src\pages\projectDetail\progress\ProgressSCurve.jsx:195:            { key: 'date', content: t('projectDetail.analysis.progress.sCurve.colDate'), isSortable: true },
static/ui/src\pages\projectDetail\progress\ProgressSCurve.jsx:196:            { key: 'planned', content: labels.planned, isSortable: true },
static/ui/src\pages\projectDetail\progress\ProgressSCurve.jsx:197:            { key: 'actual', content: labels.actual, isSortable: true },
static/ui/src\pages\projectDetail\progress\ProgressSCurve.jsx-198-        ],
static/ui/src\pages\projectDetail\progress\ProgressSCurve.jsx-199-    }), [t, labels]);
--
static/ui/src\pages\projectDetail\cost\CostPlanActualBar.jsx-58-        cells: [
static/ui/src\pages\projectDetail\cost\CostPlanActualBar.jsx-59-            { key: 'metric', content: t('cost.planActual.colMetric') },
static/ui/src\pages\projectDetail\cost\CostPlanActualBar.jsx:60:            { key: 'amount', content: t('cost.planActual.colAmount'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostPlanActualBar.jsx-61-        ],
static/ui/src\pages\projectDetail\cost\CostPlanActualBar.jsx-62-    }), [t]);
--
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-71-        cells: [
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-72-            { key: 'key', content: t('cost.issue.col.key'), width: 30 },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:73:            { key: 'actualMd', content: t('cost.issue.col.actualMd'), width: 14, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:74:            { key: 'cost', content: t('cost.issue.col.cost'), width: 20, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:75:            { key: 'estimatedCost', content: t('cost.issue.col.estimatedCost'), width: 20, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:76:            { key: 'costPerMd', content: t('cost.issue.col.costPerMd'), width: 16, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-77-        ],
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-78-    }), [t]);
--
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-135-        cells: [
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-136-            { key: 'member', content: t('cost.issue.col.member'), width: 38 },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:137:            { key: 'actualMd', content: t('cost.issue.col.actualMd'), width: 20, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:138:            { key: 'cost', content: t('cost.issue.col.cost'), width: 24, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx:139:            { key: 'ratio', content: t('cost.issue.col.ratio'), width: 18, isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-140-        ],
static/ui/src\pages\projectDetail\cost\CostByIssueTable.jsx-141-    }), [t]);
--
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-86-    const tableHead = useMemo(() => ({
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-87-        cells: [
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx:88:            { key: 'month', content: t('cost.burnup.colMonth'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx:89:            { key: 'actual', content: t('cost.burnup.colActual'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx:90:            { key: 'cumulative', content: t('cost.burnup.colCumulative'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-91-        ],
static/ui/src\pages\projectDetail\cost\CostBurnUp.jsx-92-    }), [t]);
--
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-108-        cells: [
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-109-            { key: 'name', content: axisLabel },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx:110:            { key: 'planned', content: t('cost.roleLevel.planned'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx:111:            { key: 'actual', content: t('cost.roleLevel.actual'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx:112:            { key: 'memberCount', content: t('cost.roleLevel.colMemberCount'), isSortable: true },
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-113-        ],
static/ui/src\pages\projectDetail\cost\CostByRoleLevel.jsx-114-    }), [t, axisLabel]);
--
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-37-        cells: [
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-38-            { key: 'metric', content: t('projectDetail.analysis.progress.bar.colMetric') },
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx:39:            { key: 'rate', content: t('projectDetail.analysis.progress.bar.colRate'), isSortable: true },
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-40-        ],
static/ui/src\pages\projectDetail\progress\ProgressBars.jsx-41-    }), [t]);
--
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-44-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-45-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx:46:                { key: "label", content: axis === "role" ? t("portfolio.cost.byRoleLevel.role") : t("portfolio.cost.byRoleLevel.level"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx:47:                { key: "planned", content: t("portfolio.cost.byRoleLevel.planned"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx:48:                { key: "actual", content: t("portfolio.cost.byRoleLevel.actual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-49-            ],
static/ui/src\pages\portfolio\widgets\PortfolioCostByRoleLevel.jsx-50-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-38-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-39-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx:40:                { key: "project", content: t("portfolio.cost.planActual.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx:41:                { key: "planned", content: t("portfolio.cost.planActual.planned"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx:42:                { key: "actual", content: t("portfolio.cost.planActual.actual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-43-            ],
static/ui/src\pages\portfolio\widgets\PortfolioCostPlannedActual.jsx-44-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-16-    const head = {
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-17-        cells: [
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:18:            { key: "name", content: t("portfolio.cost.overrunRank.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:19:            { key: "cpi", content: t("portfolio.cost.overrunRank.colCpi"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:20:            { key: "burnRate", content: t("portfolio.cost.overrunRank.colBurnRate"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx:21:            { key: "completion", content: t("portfolio.cost.overrunRank.colCompletion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-22-            { key: "state", content: t("portfolio.cost.overrunRank.colState") },
static/ui/src\pages\portfolio\widgets\PortfolioCostOverrunRank.jsx-23-        ],
--
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-56-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-57-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:58:                { key: "project", content: t("portfolio.plannedActual.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:59:                { key: "planned", content: t("portfolio.plannedActual.planned"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:60:                { key: "actual", content: t("portfolio.plannedActual.actual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx:61:                { key: "rate", content: t("portfolio.plannedActual.colRate"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-62-            ],
static/ui/src\pages\portfolio\widgets\PortfolioPlannedActual.jsx-63-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-42-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-43-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx:44:                { key: "month", content: t("portfolio.cost.monthlyBurn.colMonth"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx:45:                { key: "actual", content: t("portfolio.cost.monthlyBurn.colActual"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-46-            ],
static/ui/src\pages\portfolio\widgets\PortfolioMonthlyBurn.jsx-47-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-56-                        ? t("portfolio.effortTrend.colWeek")
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-57-                        : t("portfolio.effortTrend.colMonth"),
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx:58:                    isSortable: true,
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-59-                },
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx:60:                ...series.map((s) => ({ key: s.name, content: s.name, isSortable: true })),
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-61-            ],
static/ui/src\pages\portfolio\widgets\PortfolioEffortTrend.jsx-62-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-44-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-45-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:46:                { key: "project", content: t("portfolio.issueStatus.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:47:                { key: "done", content: t("portfolio.issueStatus.done"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:48:                { key: "inProgress", content: t("portfolio.issueStatus.inProgress"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:49:                { key: "todo", content: t("portfolio.issueStatus.todo"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx:50:                { key: "total", content: t("portfolio.issueStatus.colTotal"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-51-            ],
static/ui/src\pages\portfolio\widgets\PortfolioIssueStatusDist.jsx-52-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-37-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-38-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx:39:                { key: "project", content: t("portfolio.roleLevel.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx:40:                ...series.map((s) => ({ key: s.name, content: s.name, isSortable: true })),
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-41-            ],
static/ui/src\pages\portfolio\widgets\PortfolioRoleLevelDist.jsx-42-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-51-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-52-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx:53:                { key: "bucket", content: t("portfolio.salary.colBucket"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx:54:                { key: "count", content: t("portfolio.salary.colCount"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-55-            ],
static/ui/src\pages\portfolio\widgets\PortfolioSalaryHistogram.jsx-56-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-57-    const head = {
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-58-        cells: pickCells(columnKeys, {
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:59:            name: { key: "name", content: t("portfolio.table.name"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-60-            status: { key: "status", content: t("portfolio.table.status") },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:61:            members: { key: "members", content: t("portfolio.table.members"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:62:            actualMm: { key: "actualMm", content: t("portfolio.table.actualMm"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:63:            salary: { key: "salary", content: t("portfolio.table.salary"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:64:            completion: { key: "completion", content: t("portfolio.table.completion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:65:            schedule: { key: "schedule", content: t("portfolio.table.schedule"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx:66:            utilization: { key: "utilization", content: t("portfolio.table.utilization"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-67-            risk: { key: "risk", content: t("portfolio.table.risk") },
static/ui/src\pages\portfolio\widgets\PortfolioProjectTable.jsx-68-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-58-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-59-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:60:                { key: "issueKey", content: t("portfolio.problem.colIssue"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:61:                { key: "projectName", content: t("portfolio.problem.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-62-                { key: "summary", content: t("portfolio.problem.colSummary") },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:63:                { key: "assignee", content: t("portfolio.problem.assignee"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:64:                { key: "delayDays", content: t("portfolio.problem.x"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:65:                { key: "effortDiff", content: t("portfolio.problem.y"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx:66:                { key: "severity", content: t("portfolio.problem.severity"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-67-            ],
static/ui/src\pages\portfolio\widgets\PortfolioProblemBubble.jsx-68-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-187-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-188-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:189:                { key: "project", content: t("portfolio.gantt.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:190:                { key: "start", content: t("portfolio.gantt.colStart"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:191:                { key: "end", content: t("portfolio.gantt.colEnd"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:192:                { key: "duration", content: t("portfolio.gantt.colDuration"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:193:                { key: "elapsed", content: t("portfolio.gantt.colElapsed"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx:194:                { key: "completion", content: t("portfolio.gantt.colCompletion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-195-            ],
static/ui/src\pages\portfolio\widgets\PortfolioScheduleGantt.jsx-196-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-86-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-87-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:88:                { key: "band", content: t("portfolio.utilization.colBand"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:89:                { key: "count", content: t("portfolio.utilization.colCount"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-90-            ],
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-91-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-137-                        head={{
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-138-                            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:139:                                { key: "member", content: t("portfolio.utilization.colMember"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:140:                                { key: "util", content: t("portfolio.utilization.colUtil"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-141-                            ],
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-142-                        }}
--
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-215-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-216-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:217:                { key: "project", content: t("portfolio.utilization.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:218:                { key: "member", content: t("portfolio.utilization.colMember"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:219:                { key: "util", content: t("portfolio.utilization.colUtil"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx:220:                { key: "band", content: t("portfolio.utilization.colState"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-221-            ],
static/ui/src\pages\portfolio\widgets\PortfolioUtilization.jsx-222-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-58-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-59-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx:60:                { key: "project", content: t("portfolio.scopeProgress.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx:61:                { key: "completion", content: t("portfolio.scopeProgress.completion"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx:62:                { key: "schedule", content: t("portfolio.scopeProgress.schedule"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-63-            ],
static/ui/src\pages\portfolio\widgets\PortfolioScopeProgress.jsx-64-        }),
--
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-54-        () => ({
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-55-            cells: [
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx:56:                { key: "project", content: t("portfolio.risk.colProject"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx:57:                { key: "risk", content: t("portfolio.risk.colRisk"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx:58:                { key: "diff", content: t("portfolio.risk.colDiff"), isSortable: true },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-59-                { key: "status", content: t("portfolio.risk.colStatus") },
static/ui/src\pages\portfolio\widgets\PortfolioRiskTop.jsx-60-            ],
--
--- dynamic isSortable expressions

codex
현재 코드 대조에서 A-3 캐시는 동일 사용자 키를 사용하지만, 첫 대시보드 마운트의 동시 요청을 합치지 못하는 구조와 권한 변경 직후의 캐시 재검증 부재를 확인했습니다. 나머지 항목은 실제 호출 경로·쓰기 경로를 계속 교차 확인하고, 마지막에 테스트 결과도 포함하겠습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git -c safe.directory='C:/CloudJira/moves-workforce' diff --unified=100 HEAD -- '.gitignore' 'src/resolver/backoffice/setting/SettingService.js' 'src/resolver/backoffice/projectStatus/ProjectStatusService.js' 'src/resolver/backoffice/publicHoliday/PublicHolidayService.js' 'src/resolver/backoffice/skill/SkillService.js' 'src/seed/SeedData.js'; Write-Output '--- direct custom entity manager entity literals'; rg -n -i \"customEntityManager\\((['\\\"])(role|level|skill|project[_-]?status|public[_-]?holiday|setting)\\1\\)\" src; Write-Output '--- status set/seed authors'; rg -n -i -C 2 \"customEntityManager\\(|project_status|publicHoliday|holiday|settings\" src/trigger src/seed src/resolver/backoffice" in C:\CloudJira\moves-workforce
2026-08-12T08:59:41.218255Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 4.5 seconds
Output:
위치 줄:2 문자:448
+ ... ager entity literals'; rg -n -i "customEntityManager\((['\"])(role|le ...
+                                                                 ~
식 또는 문에서 예기치 않은 ')' 토큰입니다.
위치 줄:2 문자:513
+ ... level|skill|project[_-]?status|public[_-]?holiday|setting)\1\)" src;  ...
+                                                               ~~~
식 또는 문에서 예기치 않은 '\1\' 토큰입니다.
위치 줄:2 문자:516
+ ... evel|skill|project[_-]?status|public[_-]?holiday|setting)\1\)" src; W ...
+                                                                 ~
식 또는 문에서 예기치 않은 ')' 토큰입니다.
위치 줄:2 문자:583
+ ... status set/seed authors'; rg -n -i -C 2 "customEntityManager\(|projec ...
+                                              ~~~~~~~~~~~~~~~~~~~~
식 또는 문에서 예기치 않은 'customEntityManager\' 토큰입니다.
위치 줄:2 문자:604
+ ... atus set/seed authors'; rg -n -i -C 2 "customEntityManager\(|project_ ...
+                                                                 ~
빈 파이프 요소는 사용할 수 없습니다.
위치 줄:2 문자:650
+ ... oliday|holiday|settings" src/trigger src/seed src/resolver/backoffice
+                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
문자열에 " 종결자가 없습니다.
위치 줄:2 문자:696
+ ... oliday|holiday|settings" src/trigger src/seed src/resolver/backoffice
+                                                                          ~
식에 닫는 ')'가 없습니다.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : UnexpectedToken
 

 exited 1 in 4471ms:
위치 줄:2 문자:448
+ ... ager entity literals'; rg -n -i "customEntityManager\((['\"])(role|le ...
+                                                                 ~
식 또는 문에서 예기치 않은 ')' 토큰입니다.
위치 줄:2 문자:513
+ ... level|skill|project[_-]?status|public[_-]?holiday|setting)\1\)" src;  ...
+                                                               ~~~
식 또는 문에서 예기치 않은 '\1\' 토큰입니다.
위치 줄:2 문자:516
+ ... evel|skill|project[_-]?status|public[_-]?holiday|setting)\1\)" src; W ...
+                                                                 ~
식 또는 문에서 예기치 않은 ')' 토큰입니다.
위치 줄:2 문자:583
+ ... status set/seed authors'; rg -n -i -C 2 "customEntityManager\(|projec ...
+                                              ~~~~~~~~~~~~~~~~~~~~
식 또는 문에서 예기치 않은 'customEntityManager\' 토큰입니다.
위치 줄:2 문자:604
+ ... atus set/seed authors'; rg -n -i -C 2 "customEntityManager\(|project_ ...
+                                                                 ~
빈 파이프 요소는 사용할 수 없습니다.
위치 줄:2 문자:650
+ ... oliday|holiday|settings" src/trigger src/seed src/resolver/backoffice
+                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
문자열에 " 종결자가 없습니다.
위치 줄:2 문자:696
+ ... oliday|holiday|settings" src/trigger src/seed src/resolver/backoffice
+                                                                          ~
식에 닫는 ')'가 없습니다.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : UnexpectedToken
 

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git -c safe.directory='C:/CloudJira/moves-workforce' diff --unified=100 HEAD -- '.gitignore' 'src/resolver/backoffice/setting/SettingService.js' 'src/resolver/backoffice/projectStatus/ProjectStatusService.js' 'src/resolver/backoffice/publicHoliday/PublicHolidayService.js' 'src/resolver/backoffice/skill/SkillService.js' 'src/seed/SeedData.js'" in C:\CloudJira\moves-workforce
 succeeded in 3392ms:
diff --git a/.gitignore b/.gitignore
index 78a1dd5..c9dd429 100644
--- a/.gitignore
+++ b/.gitignore
@@ -1,74 +1,77 @@
 # These are some examples of commonly ignored file patterns.
 # You should customize this list as applicable to your project.
 # Learn more about .gitignore:
 #     https://www.atlassian.com/git/tutorials/saving-changes/gitignore
 
 # Node artifact files
 node_modules/
 dist/
 
 # Compiled Java class files
 *.class
 
 # Compiled Python bytecode
 *.py[cod]
 
 # Log files
 *.log
 
 # Package files
 *.jar
 
 # Maven
 target/
 dist/
 
 # JetBrains IDE
 .idea/
 
 # Unit test reports
 TEST*.xml
 
 # Generated by MacOS
 .DS_Store
 
 # Generated by Windows
 Thumbs.db
 
 # Applications
 *.app
 *.exe
 *.war
 
 # Large media files
 *.mp4
 *.tiff
 *.avi
 *.flv
 *.mov
 *.wmv
 *.toml
 
 #forge
 /.forge/
 
 #locales merge
 /locales/*.json
 
 #feature-harness 작업 산출물(설계서·리포트 등 scratch)
 /_workspace/
 
 #데모 시더 — 코드 전체 커밋 제외 (시연용 임시 도구, manifest.yml 의 demo-seed-trigger 변경분도 커밋 시 제외할 것)
 /scripts/demo-seed/
 /src/trigger/demoSeed.js
 
 #문서·노트·하네스 설정 (코드만 커밋)
 /CLAUDE.md
 /.claude/
 /2026-*.md
 /src/resolver/projectProgress/CALCULATION.md
 /Moves_Workforce_*.md
 /라이선스_정책_구현.md
 /src/resolver/gantt/GANTT.md
 
-/.agents/*
\ No newline at end of file
+/.agents/*
+
+
+/Moves_Workforce_사용자_매뉴얼/*
\ No newline at end of file
diff --git a/src/resolver/backoffice/projectStatus/ProjectStatusService.js b/src/resolver/backoffice/projectStatus/ProjectStatusService.js
index c95ed79..d134d5f 100644
--- a/src/resolver/backoffice/projectStatus/ProjectStatusService.js
+++ b/src/resolver/backoffice/projectStatus/ProjectStatusService.js
@@ -1,361 +1,380 @@
 import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
 import crypto from 'crypto';
 import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
 import {LogicalError} from "../../../error/LogicalError";
 import {getProjectByStatusId, updateProjectPartialService} from "../../project/ProjectService";
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 const ENTITY = 'status';
 
 export const addProjectStatusService = async (projectStatusData) =>{
 
     if(!projectStatusData.name ){
         throw new LogicalError(ErrorCodes.STATUS_NAME_REQUIRED, ErrorCodes.STATUS_NAME_REQUIRED)
     }
 
     const queryManager = customEntityManager(ENTITY);
 
     const id = "status-"+crypto.randomUUID();
 
     await checkDuplicated(queryManager, id, projectStatusData.name);
 
     await queryManager.save(id, {id,...projectStatusData})
+    invalidateDictionary(ENTITY);
 
     return {
         id,
         projectStatusData
     };
 }
 
 export const addProjectStatusFromKanbanService= async ({name,prev}) =>{
     if(!name ){
         throw new LogicalError(ErrorCodes.STATUS_NAME_REQUIRED, ErrorCodes.STATUS_NAME_REQUIRED)
     }
 
     const queryManager = customEntityManager(ENTITY);
     const linkManager = customEntityManager('status_link');
 
     const id = "status-"+crypto.randomUUID();
 
     if (!prev?.id) {
         throw new LogicalError("PREV_STATUS_REQUIRED", "이전 상태가 필요합니다.");
     }
 
     await checkDuplicated(queryManager, id, name);
 
     const data = {
         id: id,
         name: name,
         color:"grey",
         order:prev.order+1
     }
 
     const linkId = `${prev.id}-${id}`;
     const linkData = {
         id: linkId,
         from: prev.id,
         to: id,
     };
 
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
     try {
         await linkManager.save(linkId, linkData);// 연결 추가
     }catch (e){
         await queryManager.delete(id); //링크 실패시 해당 상태도 삭제
+        invalidateDictionary(ENTITY);
         throw e; // 롤백 후 반드시 실패를 전파 → responseWrapper 가 success:false 직렬화 (미전파 시 존재하지 않는 컬럼이 성공 처리됨)
     }
     return {id:id};
 }
 
 /**
  * 프로젝트 상태 전체 조회.
  * 계약: {rows:[...]} — 배열을 직접 반환하면 responseWrapper 가 {success, 0:…, 1:…} 로
  * 인덱스 스프레드해 프론트가 역조립해야 하고, 실패 응답(error)과 구분이 불가능해진다.
  */
-export const getProjectStatusListService = async () =>{
+/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAll = 100건 캡)은 종전 그대로다. */
+const loadProjectStatusList = async () => {
 
    const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findAll()).results;
 
+    return rows.map(row => ({
+        id: row.key,
+        name: row.value.name,
+        color: row.value.color,
+        order: row.value.order
+    }));
+};
+
+export const getProjectStatusListService = async () =>{
+    const rows = await readDictionary(ENTITY, loadProjectStatusList);
+
+    // 캐시 값은 공유 객체다 — 소비자 변형이 캐시를 오염시키지 않게 호출마다 얕은 복사(응답 shape 불변).
     return {
-        rows: rows.map(row => ({
-            id: row.key,
-            name: row.value.name,
-            color: row.value.color,
-            order: row.value.order
-        }))
+        rows: rows.map(row => ({...row}))
     };
 }
 
 /** 칸반 보드용 — 링크(순서)가 정의된 상태만. 계약: {rows:[...]} (위와 동일 사유) */
 export const getProjectStatusExistLinkService = async () => {
 
     const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findByFilterExists('name','order')).results;
 
     return {
         rows: rows
             .filter(row => row.value.order != null)
             .map(row => ({
                 id: row.key,
                 name: row.value.name,
                 color: row.value.color,
                 order: row.value.order
             }))
     };
 }
 
 export const findProjectStatusByIdService = async ({id}) =>{
 
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if(!result ){
         throw new LogicalError(ErrorCodes.STATUS_NOT_FOUND, ErrorCodes.STATUS_NOT_FOUND)
     }
 
     return {
         id : result.id,
         name: result.name,
         color: result.color,
         order:result.order
     }
 
 }
 
 export const deleteProjectStatusService = async ({id}) => {
 
     const statusManager = customEntityManager('status');
     const linkManager   = customEntityManager('status_link');
     // 상태 수 1개면 삭제 불가 처리
     const allStatus = (await statusManager.findByField('name')).results;
     if (allStatus.length <= 1) {
         throw new LogicalError("STATUS_MIN_REQUIRED", "STATUS_MIN_REQUIRED"); // 최소 1개의 상태가 필요합니다
     }
     // 링크 조회
     const linkList =  (await linkManager.findByField('from')).results;
 
     let incoming; // 현재 상태에 연결된
     let outgoing; // 현재 연결된
 
     linkList.forEach(statusLink => {
         const to = statusLink.value.to;
         const from = statusLink.value.from;
 
         if (to === id) incoming = statusLink;
         if (from === id) outgoing = statusLink;
     });
 
     const isIsolated = !incoming && !outgoing; // 새로 추가됐지만 링크가 없는 상태
     const isMiddle = incoming && outgoing;
     const isFirst  = !incoming && outgoing;
     const isLast   = incoming && !outgoing;
 
     if (isIsolated) {
         await statusManager.delete(id);
+        invalidateDictionary(ENTITY);
         return;
     }
 
     if (isFirst) {
         throw new LogicalError("PREV_STATUS_REQUIRED", "PREV_STATUS_REQUIRED"); //이전 상태가 없어 삭제할 수 없습니다
     }
     // 프로젝트 이전 상태 변경해주기
     const prevStatusId = incoming.value.from;
     const { rows: projectList }  = await getProjectByStatusId(id); // 삭제 대상 프로젝트 조회
     if(projectList.length !== 0){
         for (const project of projectList) { // 해당 프로젝트를 업데이트 해줌
             const data ={
                 project_id: project.project_id,
                 project_status_key: prevStatusId,
             };
             await updateProjectPartialService(data);
         }
     }
 
     // 중간일 때만 이어붙이기
     if (isMiddle) {
         const from = incoming.value.from;
         const to   = outgoing.value.to;
         const newId = `${from}-${to}`;
 
         const exist = await linkManager.findById(newId);
         if (!exist) {
             await linkManager.save(newId, { id: newId, from, to });
         }
     }
 
     // 기존 링크 삭제
     const linksToDelete = [incoming, outgoing].filter(Boolean);
     for (const link of linksToDelete) {
         await linkManager.delete(link.key);
     }
 
     // 상태 삭제
     await statusManager.delete(id);
+    invalidateDictionary(ENTITY);
 
     // 맨뒤면 order 재정의 불필요
     if (isLast) {
         return {prevStatusId:prevStatusId} ;
     }
 
     // 중간 or 맨앞 링크 재조회 후 순서 재정의
     const updatedLinksRes = await linkManager.findByField('from');
     const updatedLinks = updatedLinksRes.results ?? [];
 
     const edges = updatedLinks.map(l => ({
         source: l.value.from,
         target: l.value.to,
     }));
 
     if (edges.length > 0) {
         const orderedNodes = getOrderedNodes(edges);
         await saveStatusOrder(orderedNodes);
     }
 
     return {prevStatusId:prevStatusId} ;
 };
 
 
 export const updateProjectStatusService = async (statusData) => {
 
     const { id, name,  color,isNameChanged} = statusData;
 
     const data = {
         id,
         name,
         color
     };
 
     const queryManager = customEntityManager(ENTITY);
     const orgData = await queryManager.findById(id);
 
     if (isNameChanged) {
         await checkDuplicated(queryManager, id, name);
     }
 
     const finalData = {
         ...orgData,
         ...(name !== undefined && { name }),
         ...(color !== undefined && { color })
     };
 
     await queryManager.save(id, finalData);
+    invalidateDictionary(ENTITY);
     return {
         id,
         data,
     };
 }
 
 const checkDuplicated = async (queryManager, id, name) => {
     const {results = []} = await queryManager.findByWhere('name', name);
 
     const duplicated = results.some(({key}) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.STATUS_NAME_DUPLICATED, ErrorCodes.STATUS_NAME_DUPLICATED)
     }
 };
 
 
 
 export const setStatusLinkService = async (data) =>{
     const edges = data.edges;
     // 각 상태의 연결 저장
     await saveStatusLink(edges);
     //  엣지의 순서
     const orderedNodes = getOrderedNodes(edges);
 
     // 해당 연결 순서 업데이트
     await saveStatusOrder(orderedNodes);
     return;
 }
 
 const saveStatusLink = async (edges) =>{
     const queryManager = customEntityManager('status_link');
 
     const linksRes = await queryManager.findByField('from');
     const existing = linksRes.results;
     // 현재 정의 된 연결 전체 삭제
     for (const row of existing) {
         await queryManager.delete(row.key);
     }
     // 연결 새로 정의
     for (const { source, target } of edges) {
         const linkId = `${source}-${target}`;
 
         await queryManager.save(linkId, {
             id: linkId,
             from: source,
             to: target,
         });
 
     }
 }
 const getOrderedNodes = (edges) => {
     // 진입 간선 수 계산
     const inDegree = {};
     const graph = {};
 
     for (const { source, target } of edges) {
         if (!inDegree[source]) inDegree[source] = 0;
         if (!inDegree[target]) inDegree[target] = 0;
         if (!graph[source]) graph[source] = [];
 
         graph[source].push(target);
         inDegree[target]++;
     }
 
     // 진입 간선 0인 노드부터 시작 (= 맨 앞 노드)
     const queue = Object.keys(inDegree).filter(n => inDegree[n] === 0);
     const ordered = [];
 
     while (queue.length) {
         const node = queue.shift();
         ordered.push(node);
 
         for (const next of (graph[node] || [])) {
             inDegree[next]--;
             if (inDegree[next] === 0) queue.push(next);
         }
     }
 
     return ordered;
 }
 
 const saveStatusOrder = async (orderedNodes) => {
 
     const queryManager = customEntityManager('status');
 
     // 전체 상태 한 번만 조회
     const allStatusData = (await queryManager.findByField('name')).results;
 
     // orderedNodes에 없는 것들 order null 초기화
     const resetTargets = allStatusData.filter(s => !orderedNodes.includes(s.key));
 
     if(resetTargets.length !== 0){
         for (const existing of resetTargets) {
             await queryManager.save(existing.key, {
                 id: existing.key,
                 name: existing.value.name,
                 color : existing.value.color,
             });
         }
     }
     // 전체 조회 결과에서 필터링해서 재사용
     for (const [index, nodeId] of orderedNodes.entries()) {
         const existing = allStatusData.find(s => s.key === nodeId);
         await queryManager.save(nodeId, {
             id: existing.value.id,
             name: existing.value.name,
             color : existing.value.color,
             order: index + 1,
         });
     }
+
+    // order 재정의도 status 쓰기다 — 무효화를 빠뜨리면 칸반 순서가 "저장했는데 안 바뀜"이 된다.
+    invalidateDictionary(ENTITY);
 }
 
 export const getStatusLinkService = async () =>{
     const queryManager = customEntityManager('status_link');
     return await queryManager.findByField('from');
 }
diff --git a/src/resolver/backoffice/publicHoliday/PublicHolidayService.js b/src/resolver/backoffice/publicHoliday/PublicHolidayService.js
index 8394243..6f58f1a 100644
--- a/src/resolver/backoffice/publicHoliday/PublicHolidayService.js
+++ b/src/resolver/backoffice/publicHoliday/PublicHolidayService.js
@@ -1,95 +1,106 @@
 import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
 import crypto from 'crypto';
 import {ErrorCodes} from "../../../utils/errors/ErrorCodes";
 import {LogicalError} from "../../../error/LogicalError";
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 const ENTITY = 'holiday';
 
 export const addPublicHolidayService = async (holidayData) => {
     const { name, holidayDate, workRatio } = holidayData;
 
     if (!name) {
         throw new LogicalError(ErrorCodes.HOLIDAY_NAME_REQUIRED, ErrorCodes.HOLIDAY_NAME_REQUIRED);
     }
     if (!holidayDate) {
         throw new LogicalError(ErrorCodes.HOLIDAY_DATE_REQUIRED, ErrorCodes.HOLIDAY_DATE_REQUIRED);
     }
 
     const queryManager = customEntityManager(ENTITY);
     const id = 'holiday-' + crypto.randomUUID();
 
     await checkDuplicatedDate(queryManager, id, holidayDate);
 
     const data = { name, holidayDate, workRatio: workRatio ?? 0 };
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
 
     return {
         data: { id, ...data },
     };
 };
 
-export const getPublicHolidayListService = async () => {
+/** KVS 로드 + 응답 매핑. 상한 규약(findByField 기본 100건)은 종전 그대로다(B-12 는 별건). */
+const loadPublicHolidayList = async () => {
     const queryManager = customEntityManager(ENTITY);
 
     const rows = (await queryManager.findByField('by-date')).results;
 
-    const mappedData = rows.map(row => ({
+    return rows.map(row => ({
         id: row.key,
         name: row.value.name,
         holidayDate: row.value.holidayDate,
         workRatio: row.value.workRatio,
     }));
+};
+
+export const getPublicHolidayListService = async () => {
+    const mappedData = await readDictionary(ENTITY, loadPublicHolidayList);
 
-    return { data: mappedData };
+    // 캐시 값은 공유 객체다 — 소비자 변형이 캐시를 오염시키지 않게 호출마다 얕은 복사(응답 shape 불변).
+    return { data: mappedData.map(row => ({...row})) };
 };
 
 export const findPublicHolidayByIdService = async ({ id }) => {
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if (!result) {
         throw new LogicalError(ErrorCodes.HOLIDAY_NOT_FOUND, ErrorCodes.HOLIDAY_NOT_FOUND);
     }
 
     return {
         data: {
             id,
             name: result.name,
             holidayDate: result.holidayDate,
             workRatio: result.workRatio,
         },
     };
 };
 
 export const deletePublicHolidayService = async ({ id }) => {
     const queryManager = customEntityManager(ENTITY);
     await queryManager.delete(id);
+    invalidateDictionary(ENTITY);
 };
 
 export const updatePublicHolidayService = async (holidayData) => {
     const { id, name, holidayDate, workRatio, isDateChanged } = holidayData;
 
     const queryManager = customEntityManager(ENTITY);
 
     if (isDateChanged) {
         await checkDuplicatedDate(queryManager, id, holidayDate);
     }
 
     const data = { name, holidayDate, workRatio };
     await queryManager.save(id, data);
+    invalidateDictionary(ENTITY);
 
     return {
         data: { id, ...data },
     };
 };
 
 const checkDuplicatedDate = async (queryManager, id, holidayDate) => {
     const { results = [] } = await queryManager.findByWhere('by-date', holidayDate);
 
     const duplicated = results.some(({ key }) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.HOLIDAY_DATE_DUPLICATED, ErrorCodes.HOLIDAY_DATE_DUPLICATED);
     }
 };
diff --git a/src/resolver/backoffice/setting/SettingService.js b/src/resolver/backoffice/setting/SettingService.js
index 6d7544f..df8a3fa 100644
--- a/src/resolver/backoffice/setting/SettingService.js
+++ b/src/resolver/backoffice/setting/SettingService.js
@@ -1,70 +1,86 @@
 import {customEntityManager} from "../../../nosql/query/CustomEntityManager";
 import {LogicalError} from '../../../error/LogicalError';
 import {ErrorCodes} from '../../../utils/errors/ErrorCodes';
 import {DEFAULT_SETTINGS} from './SettingDefaults';
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import {invalidateDictionary, readDictionary} from '../DictionaryCache';
 
 
 const ENTITY = 'settings';
 
-export const getSettingDataService = async () => {
+const loadSettingRecord = async () => {
     const queryManager = customEntityManager(ENTITY);
-    const saved = await queryManager.findById("settings");
+    return await queryManager.findById("settings");
+};
+
+/**
+ * A-7 — 소비자가 가장 많은 사전이다(진척/비용/자원/포트폴리오/작업배정/급여정책이 전부 읽는다).
+ *
+ * ⚠ **60초 stale 을 수용한다.** `salaryPolicy` 변경(INDIVIDUAL ↔ LEVEL_BAND)도 그 대상이라
+ *   정책을 바꿔도 다른 인스턴스는 최대 60초 동안 옛 정책으로 판정한다. 관리자 1인이 누르는
+ *   저빈도 설정 변경이고, 권한 판정이 이미 최대 90초 stale(TeamTree 60 + principal 30)을
+ *   수용하고 있어 같은 급의 경계다. 쓰기 경로(updateSetting)는 저장 직전 KVS 를 직접 읽는다.
+ */
+export const getSettingDataService = async () => {
+    const saved = await readDictionary(ENTITY, loadSettingRecord);
     // 기존 installation에는 새 attribute가 없을 수 있으므로 read에서도 기본값을 보충한다.
+    // (스프레드가 호출마다 새 객체를 만들므로 캐시 값이 소비자에게 공유되지 않는다.)
     return {...DEFAULT_SETTINGS, ...(saved ?? {})};
 };
 
 
 export const updateSettingService = async ({
     currency,
     hourRate,
     utilizationUnderBand,
     utilizationOverBand,
     utilizationRedBand,
     scopeTodoAmberRatio,
     scopeTodoRedRatio,
     progressThreshold,
     salaryPolicy,
 } = {}) => {
     const queryManager = customEntityManager(ENTITY);
 
     // 급여 정책(RFC-163) — 도메인 밖 값은 저장 전에 거부한다(§7-1).
     if (salaryPolicy != null && salaryPolicy !== 'INDIVIDUAL' && salaryPolicy !== 'LEVEL_BAND') {
         throw new LogicalError(
             ErrorCodes.SETTING_SALARY_POLICY_INVALID,
             "salaryPolicy must be 'INDIVIDUAL' or 'LEVEL_BAND'",
         );
     }
 
     if (
         progressThreshold != null
         && (typeof progressThreshold !== 'number'
             || !Number.isFinite(progressThreshold)
             || progressThreshold < 0
             || progressThreshold > 100)
     ) {
         throw new LogicalError(
             ErrorCodes.SETTING_PROGRESS_THRESHOLD_INVALID,
             'progressThreshold must be a finite number between 0 and 100',
         );
     }
 
     const prev = await queryManager.findById("settings");
 
     const next = {
         ...DEFAULT_SETTINGS,
         ...(prev ?? {}),
         ...(currency != null && { currency }),
         ...(hourRate != null && { hourRate }),
         ...(utilizationUnderBand != null && { utilizationUnderBand }),
         ...(utilizationOverBand != null && { utilizationOverBand }),
         ...(utilizationRedBand != null && { utilizationRedBand }),
         ...(scopeTodoAmberRatio != null && { scopeTodoAmberRatio }),
         ...(scopeTodoRedRatio != null && { scopeTodoRedRatio }),
         ...(progressThreshold != null && { progressThreshold }),
         ...(salaryPolicy != null && { salaryPolicy }),
     };
 
     await queryManager.save("settings", next);
+    invalidateDictionary(ENTITY);
     return {content: {settings: next}};
 };
 
diff --git a/src/resolver/backoffice/skill/SkillService.js b/src/resolver/backoffice/skill/SkillService.js
index a433000..1e7e928 100644
--- a/src/resolver/backoffice/skill/SkillService.js
+++ b/src/resolver/backoffice/skill/SkillService.js
@@ -1,155 +1,170 @@
 // 스킬 마스터 CRUD (RoleService 1:1 복제 + category 필드).
 // 마스터 사전 = KVS 'skill' 엔티티(role/level 패리티). 사용자/프로젝트 매핑은 SQL(SkillMappingQuery).
 // deleteSkill 은 사용중 가드: user_skills + project_skills 참조 > 0 → CAN_NOT_DELETE(role 의 findUserWithRole 가드와 동일 개념).
 
 import { customEntityManager } from '../../../nosql/query/CustomEntityManager';
 import { addCatalogItemsBulk, CATALOG_MAX_ITEMS } from '../CatalogBulkService';
 import crypto from 'crypto';
 import { ErrorCodes } from '../../../utils/errors/ErrorCodes';
 import { LogicalError } from '../../../error/LogicalError';
 import { executeQuery } from '../../../rdb/query/CommonQuery';
 import { SkillMappingQuery } from '../../../rdb/query/SkillMappingQuery';
+// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
+import { invalidateDictionary, readDictionary } from '../DictionaryCache';
 
 const ENTITY = 'skill';
 
 // Forge KVS 는 선언된 속성에 빈 문자열('')을 저장하면 "cannot be empty" 로 거부한다.
 // → 값이 없는(category/description) 속성은 payload 에서 아예 제외하고 저장한다.
 // (name 은 필수 가드 후 항상 존재. 응답 shape 은 별도로 '' 기본값을 유지한다.)
 const buildSkillEntity = ({ name, category, description }) => {
     const entity = { name };
     if (category) entity.category = category;
     if (description) entity.description = description;
     return entity;
 };
 
 export const addSkillService = async (skillData) => {
     if (!skillData.name) {
         throw new LogicalError(ErrorCodes.SKILL_NAME_REQUIRED, ErrorCodes.SKILL_NAME_REQUIRED);
     }
 
     const queryManager = customEntityManager(ENTITY);
 
     const id = 'skill-' + crypto.randomUUID();
 
     await checkDuplicated(queryManager, id, skillData.name);
 
     const data = {
         name: skillData.name,
         category: skillData.category ?? '',
         description: skillData.description ?? '',
     };
 
     await queryManager.save(id, buildSkillEntity(data));
+    invalidateDictionary(ENTITY);
 
     return {
         data: {
             id,
             skillData: data,
         },
     };
 };
 
-export const getSkillListService = async () => {
+/** KVS 전량 로드 + 응답 매핑. 상한 규약(findAllPaged, bulk 경로와 같은 상수)은 종전 그대로다. */
+const loadSkillList = async () => {
     const queryManager = customEntityManager(ENTITY);
 
     // 스킬 프리셋만 133건이라 findAll() 의 100건 하드캡에 걸린다. 목록·필터·스킬 매핑과
     // quick-add 의 "이미 존재" 표시가 모두 이 응답을 쓰므로 잘리면 중복 등록까지 유발한다.
     // 상한은 bulk 경로와 같은 값을 쓴다 — 둘이 갈리면 "목록엔 없는데 저장은 거부"가 생긴다.
     const rows = (await queryManager.findAllPaged('name', 100, CATALOG_MAX_ITEMS)).results;
 
     if (!rows) throw new LogicalError(ErrorCodes.SKILL_NOT_FOUND, ErrorCodes.SKILL_NOT_FOUND);
 
-    const mappedData = rows.map(row => ({
+    return rows.map(row => ({
         id: row.key,
         name: row.value.name,
         category: row.value.category ?? '',
         description: row.value.description ?? '',
     }));
+};
 
+export const getSkillListService = async () => {
+    const mappedData = await readDictionary(ENTITY, loadSkillList);
+
+    // 캐시 값은 공유 객체다 — 소비자 변형이 캐시를 오염시키지 않게 호출마다 얕은 복사(응답 shape 불변).
     return {
-        data: mappedData,
+        data: mappedData.map(row => ({...row})),
     };
 };
 
 export const findSkillByIdService = async ({ id }) => {
     const queryManager = customEntityManager(ENTITY);
 
     const result = await queryManager.findById(id);
 
     if (!result) throw new LogicalError(ErrorCodes.SKILL_NOT_FOUND, ErrorCodes.SKILL_NOT_FOUND);
 
     const skillData = {
         name: result.name,
         category: result.category ?? '',
         description: result.description ?? '',
     };
 
     return {
         data: {
             id,
             skillData,
         },
     };
 };
 
 export const deleteSkillService = async ({ id }) => {
     // 사용중 가드: user_skills + project_skills 참조 건수
     const { rows } = await executeQuery(SkillMappingQuery.COUNT_USES_BY_SKILL, [id, id]);
     const uses = Number(rows?.[0]?.total ?? 0);
     if (uses > 0) {
         throw new LogicalError(ErrorCodes.CAN_NOT_DELETE, ErrorCodes.CAN_NOT_DELETE);
     }
 
     const queryManager = customEntityManager(ENTITY);
     await queryManager.delete(id);
+    invalidateDictionary(ENTITY);
 
     return;
 };
 
 export const updateSkillService = async (skillData) => {
     const { id, name, category, description, isNameChanged } = skillData;
 
     const data = {
         name,
         category: category ?? '',
         description: description ?? '',
     };
 
     const queryManager = customEntityManager(ENTITY);
 
     if (isNameChanged) {
         await checkDuplicated(queryManager, id, name);
     }
 
     await queryManager.save(id, buildSkillEntity(data));
+    invalidateDictionary(ENTITY);
 
     return {
         success: true,
         data: {
             id,
             data,
         },
     };
 };
 
-export const addSkillBulkService = ({ items }) => addCatalogItemsBulk({
-    entity: ENTITY,
-    idPrefix: 'skill',
-    items,
-    // 빈 값 속성 제외는 buildSkillEntity 가 담당한다(KVS 가 빈 문자열을 거부한다)
-    buildRecord: item => buildSkillEntity({
-        name: item.name,
-        category: item.category ?? '',
-        description: item.description ?? '',
-    }),
-});
+export const addSkillBulkService = async ({ items }) => {
+    const result = await addCatalogItemsBulk({
+        entity: ENTITY,
+        idPrefix: 'skill',
+        items,
+        // 빈 값 속성 제외는 buildSkillEntity 가 담당한다(KVS 가 빈 문자열을 거부한다)
+        buildRecord: item => buildSkillEntity({
+            name: item.name,
+            category: item.category ?? '',
+            description: item.description ?? '',
+        }),
+    });
+    invalidateDictionary(ENTITY);
+    return result;
+};
 
 const checkDuplicated = async (queryManager, id, name) => {
     const { results = [] } = await queryManager.findByWhere('name', name);
 
     const duplicated = results.some(({ key }) => key !== id);
 
     if (duplicated) {
         throw new LogicalError(ErrorCodes.SKILL_NAME_DUPLICATED, ErrorCodes.SKILL_NAME_DUPLICATED);
     }
 };
diff --git a/src/seed/SeedData.js b/src/seed/SeedData.js
index da2f420..1502bea 100644
--- a/src/seed/SeedData.js
+++ b/src/seed/SeedData.js
@@ -1,123 +1,127 @@
 import {customEntityManager} from "../nosql/query/CustomEntityManager";
 import {kvs} from "@forge/kvs";
 import {SEED_VERSION} from "../trigger/onInstall";
 import {getTimeTracking} from "../api/jira/user/TimeTrackingApi";
 import {runMigration} from "../rdb/schema/migrate";
 import {
     getSeedPages,
     getMigrateSource,
     getDefaultForNew,
     RESOURCE_KEYS,
     CATALOG,
 } from "../permission/ResourceCatalog";
 // projectScope 정규화 단일 출처(C2)
 import {normalizeScope} from "../permission/ProjectScope";
 import {DEFAULT_SETTINGS} from '../resolver/backoffice/setting/SettingDefaults';
+// A-7 — 시드는 status/settings 를 쓴다. `ensureSeed()` 가 **resolver 인스턴스 안에서** 돌 수 있으므로
+//   (PermissionService.userPermissionCheckService) 사전 캐시를 무효화하지 않으면 그 인스턴스가 60초 동안 옛 값을 본다.
+import {invalidateAllDictionaries} from '../resolver/backoffice/DictionaryCache';
 
 export const runSeed = async () =>{
     await addPermissionSeed();       // 시드 Admin/Member 카탈로그 파생 재생성(멱등 덮어쓰기)
     await addPresetPermissionSeed(); // 대표 역할 세트 4종 — **최초 1회만 생성**(재생성 금지)
     await migratePermissionSets();   // 커스텀 세트 키 병합/고아정리/projectScope 보정(멱등)
     await addStatusSeed();
     await addSettingSeed();
     await addStatusLink();
+    invalidateAllDictionaries();     // status/settings 를 썼다 — 사전 캐시 무효화(호출된 인스턴스 한정)
 }
 
 export const ensureSeed = async() =>{
     const version = await kvs.get('seed_version');
     if (!version || version < SEED_VERSION) {
         await runMigration();
         await runSeed();
         await kvs.set("seed_version", SEED_VERSION);
     }
 }
 
 /**
  * 시드 Admin/Member 권한 세트 = 리소스 카탈로그 파생(결정적) → 매 마이그레이션마다 덮어쓰기(멱등).
  * edit:false(관리자 pages/name 수정 불가) 불변 시드이므로 pages/name/edit 는 항상 재생성해 드리프트를 제거한다.
  * (기존 `if(existing) continue` 스킵 로직 제거 — 카탈로그 변경이 시드에 반영되도록)
  *
  * projectScope (§10 시드 scope 토글 완화):
  *  - Admin  : 항상 'ALL' 강제(불변).
  *  - Member : 관리자가 updatePermissionScope 로 토글 가능하므로, **재생성 시 기존 저장값을 읽어 보존**(없으면 'ALL').
  *             → pages/name 은 재생성하되 관리자가 설정한 scope 는 마이그레이션에서 잃지 않음(멱등).
  */
 export const addPermissionSeed = async () => {
     const queryManager = customEntityManager('permission');
 
     // Admin: projectScope 불변('ALL')
     await queryManager.save('permission-Admin', {
         id: 'permission-Admin',
         name: 'Admin',
         edit: false,
         pages: getSeedPages('admin'),
         projectScope: 'ALL',
     });
 
     // Member: pages/name/edit 재생성 + projectScope 는 기존 저장값 보존
     //   ⚠ 리터럴 삼항 금지(C2) — 여기서 뭉개면 TEAM_ONLY Member 가 시드 재생성 때마다 ALL 로 리셋된다.
     const existingMember = await queryManager.findById('permission-Member');
     const memberScope = normalizeScope(existingMember?.projectScope);
     await queryManager.save('permission-Member', {
         id: 'permission-Member',
         name: 'Member',
         edit: false,
         pages: getSeedPages('member'),
         projectScope: memberScope,
     });
 };
 
 // ── 대표 역할 권한 세트(프리셋) ─────────────────────────────────────────────
 
 const RW = Object.freeze({ read: true, write: true });
 const RO = Object.freeze({ read: true, write: false });
 const NO = Object.freeze({ read: false, write: false });
 
 /**
  * 프리셋 프로비저닝 원장(top-level KVS).
  *
  * ★ **이것이 "되살리지 않는다"의 핵심이다.** 세트 존재 여부로 판정하면
  *   관리자가 지운 세트가 다음 SEED_VERSION bump 때 되살아난다. 원장은 **세트와 별개로 남으므로**
  *   "한 번 제공했다"는 사실이 삭제와 무관하게 보존된다.
  *   값: `{ 'permission-PM': true, ... }` — 객체 저장은 선례 있음(LicenseGuard, PortfolioSnapshotRepository).
  */
 const PRESET_LEDGER_KEY = 'permission_preset_provisioned';
 
 /**
  * 대표 역할 세트 정의 (17키 카탈로그 파생).
  *
  * 설계 원칙:
  *  - **SETTINGS 계열은 전부 닫는다.** 백오피스는 Admin 영역이며, 여기를 열면 프리셋이 곧 관리자 권한이 된다.
  *  - **PROJECT_COST 는 PM/PMO 만.** 재무 민감이고 §R3-B("팀장에게 재무를 열지 않는다")와 일관.
  *  - **팀장/팀원은 TEAM_ONLY.** P1 의 TEAM_ONLY 를 실제로 쓸 수 있게 하는 진입점이다.
  *  - **TEAM_MANAGEMENT 는 팀장에게도 주지 않는다.** 팀장 판정은 권한세트가 아니라
  *    `team.leaderAccountId` 관계에서 파생되고(§R3), 진입점은 권한 게이트가 없는 `/my-page` 다.
  *
  * `grant(entry)` 는 카탈로그 엔트리를 받아 값을 정한다 — **미래에 카탈로그 키가 늘어도
  * 각 프리셋이 명시적으로 판정**하므로 새 키가 조용히 열리지 않는다(defaultForNew 에 기대지 않는다).
  */
 export const PRESET_PERMISSION_SETS = Object.freeze([
     {
         id: 'permission-PM',
         name: 'PM',
         projectScope: 'ALL',
         // 프로젝트 수행 전권(비용 포함). 백오피스는 없음.
         grant: (entry) => (entry.section === 'WORKFORCE' ? RW : NO),
     },
     {
         id: 'permission-PMO',
         name: 'PMO',
         projectScope: 'ALL',
         // 전사 조회 전용 — 쓰기 0.
         grant: (entry) => (entry.section === 'WORKFORCE' ? RO : NO),
     },
     {
         id: 'permission-TeamLead',
         name: 'Team Lead',
         projectScope: 'TEAM_ONLY',
         grant: (entry) => {
             if (entry.section !== 'WORKFORCE') return NO;
             if (entry.key === 'PROJECT_COST') return NO;   // 재무 민감(§R3-B)
             return RO;
         },
     },

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npm test -- --runInBand' in C:\CloudJira\moves-workforce
2026-08-12T09:00:15.238857Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 3 seconds
Output:
npm : 이 시스템에서 스크립트를 실행할 수 없으므로 C:\nvm4w\nodejs\npm.ps1 파일을 로드할 수 없습니다. 자세한 내용은 about_Execution_Policies(https://go.micr
osoft.com/fwlink/?LinkID=135170)를 참조하십시오.
위치 줄:2 문자:1
+ npm test -- --runInBand
+ ~~~
    + CategoryInfo          : 보안 오류: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess

 exited 1 in 2982ms:
npm : 이 시스템에서 스크립트를 실행할 수 없으므로 C:\nvm4w\nodejs\npm.ps1 파일을 로드할 수 없습니다. 자세한 내용은 about_Execution_Policies(https://go.micr
osoft.com/fwlink/?LinkID=135170)를 참조하십시오.
위치 줄:2 문자:1
+ npm test -- --runInBand
+ ~~~
    + CategoryInfo          : 보안 오류: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess

codex
검증 명령은 PowerShell의 실행 정책 때문에 `npm.ps1`이 차단되어 `npm.cmd`로 재실행하겠습니다. 코드나 환경 설정을 바꾸지는 않습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npm.cmd test -- --runInBand' in C:\CloudJira\moves-workforce
2026-08-12T09:00:41.138054Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 7.4 seconds
Output:

> jira-global-page-custom-ui@1.1.17 test
> jest --runInBand

Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e4b078f4f1c39cefebd935f88c719534-4ed08feba65e805510c02c88ea2edee3-4b1b402037519a563ee00e5c1161109a'
    at Object.openSync (node:fs:560:18)
    at writeFileSync (node:fs:2451:35)
    at HasteMap._persist (C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2743:37)
    at C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2480:16
    at async C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1487:48
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1476:20)
    at async _run10000 (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1538:7)
    at async runCLI (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1444:3)
    at async Object.run (C:\CloudJira\moves-workforce\node_modules\jest-cli\build\index.js:656:9)

 exited 1 in 7409ms:

> jira-global-page-custom-ui@1.1.17 test
> jest --runInBand

Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e4b078f4f1c39cefebd935f88c719534-4ed08feba65e805510c02c88ea2edee3-4b1b402037519a563ee00e5c1161109a'
    at Object.openSync (node:fs:560:18)
    at writeFileSync (node:fs:2451:35)
    at HasteMap._persist (C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2743:37)
    at C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2480:16
    at async C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1487:48
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1476:20)
    at async _run10000 (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1538:7)
    at async runCLI (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1444:3)
    at async Object.run (C:\CloudJira\moves-workforce\node_modules\jest-cli\build\index.js:656:9)

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npm.cmd test -- --runInBand --no-cache' in C:\CloudJira\moves-workforce
2026-08-12T09:00:57.722790Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 8.7 seconds
Output:

> jira-global-page-custom-ui@1.1.17 test
> jest --runInBand --no-cache

Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e4b078f4f1c39cefebd935f88c719534-4ed08feba65e805510c02c88ea2edee3-4b1b402037519a563ee00e5c1161109a'
    at Object.openSync (node:fs:560:18)
    at writeFileSync (node:fs:2451:35)
    at HasteMap._persist (C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2743:37)
    at C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2480:16
    at async C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1487:48
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1476:20)
    at async _run10000 (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1538:7)
    at async runCLI (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1444:3)
    at async Object.run (C:\CloudJira\moves-workforce\node_modules\jest-cli\build\index.js:656:9)

 exited 1 in 8660ms:

> jira-global-page-custom-ui@1.1.17 test
> jest --runInBand --no-cache

Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e4b078f4f1c39cefebd935f88c719534-4ed08feba65e805510c02c88ea2edee3-4b1b402037519a563ee00e5c1161109a'
    at Object.openSync (node:fs:560:18)
    at writeFileSync (node:fs:2451:35)
    at HasteMap._persist (C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2743:37)
    at C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2480:16
    at async C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1487:48
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1476:20)
    at async _run10000 (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1538:7)
    at async runCLI (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1444:3)
    at async Object.run (C:\CloudJira\moves-workforce\node_modules\jest-cli\build\index.js:656:9)

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 3 'jiraKeys\\.(userInfo|userInfos|userMap)|jiraUserInfo|jiraUserInfos|userMap\\(' static/ui/src; Write-Output '--- query cache clear/invalidate user details'; rg -n -C 3 'invalidateQueries|removeQueries|setQueryData' static/ui/src | rg -C 2 'jira|userInfo|userMap|getUser|users'" in C:\CloudJira\moves-workforce
 succeeded in 11731ms:
static/ui/src\utils\jiraApi\users\getUserInfos.js-6-/*
static/ui/src\utils\jiraApi\users\getUserInfos.js-7- * 사용자 표시정보(displayName/avatar) 조회 훅.
static/ui/src\utils\jiraApi\users\getUserInfos.js-8- *
static/ui/src\utils\jiraApi\users\getUserInfos.js:9: * 캐시는 **사람 단위**(`jiraKeys.userInfo(accountId)`)다 — 화면·페이지가 달라도 같은 사람은 다시 받지 않는다.
static/ui/src\utils\jiraApi\users\getUserInfos.js:10: * 집합 단위 키(`jiraKeys.userInfos`)는 "이 호출부가 요구한 목록"의 얇은 래퍼로만 남는다:
static/ui/src\utils\jiraApi\users\getUserInfos.js-11- * 반환 배열의 참조를 집합마다 안정적으로 유지해 소비처의 `useMemo` 를 깨지 않기 위한 것이고,
static/ui/src\utils\jiraApi\users\getUserInfos.js-12- * 실제 왕복 여부는 아래 사람 단위 `fetchQuery` 가 결정한다(신선하면 0 왕복).
static/ui/src\utils\jiraApi\users\getUserInfos.js-13- */
--
static/ui/src\utils\jiraApi\users\getUserInfos.js-18-
static/ui/src\utils\jiraApi\users\getUserInfos.js-19-const resolveUserInfos = async (queryClient, accountIds) => {
static/ui/src\utils\jiraApi\users\getUserInfos.js-20-    const users = await Promise.all(accountIds.map(accountId => queryClient.fetchQuery({
static/ui/src\utils\jiraApi\users\getUserInfos.js:21:        queryKey: jiraKeys.userInfo(accountId),
static/ui/src\utils\jiraApi\users\getUserInfos.js-22-        queryFn: () => loadUserInfo(accountId),
static/ui/src\utils\jiraApi\users\getUserInfos.js-23-        staleTime: USER_STALE_TIME,
static/ui/src\utils\jiraApi\users\getUserInfos.js-24-        gcTime: USER_GC_TIME,
--
static/ui/src\utils\jiraApi\users\getUserInfos.js-46-    );
static/ui/src\utils\jiraApi\users\getUserInfos.js-47-
static/ui/src\utils\jiraApi\users\getUserInfos.js-48-    const {data = EMPTY_LIST, isLoading} = useQuery({
static/ui/src\utils\jiraApi\users\getUserInfos.js:49:        queryKey: jiraKeys.userInfos(normalizedIds),
static/ui/src\utils\jiraApi\users\getUserInfos.js-50-        queryFn: () => resolveUserInfos(queryClient, normalizedIds),
static/ui/src\utils\jiraApi\users\getUserInfos.js-51-        enabled: normalizedIds.length > 0,
static/ui/src\utils\jiraApi\users\getUserInfos.js-52-        staleTime: USER_STALE_TIME,
--
static/ui/src\utils\useJiraUserInfos.js-6- * ── 왜 로더가 붙었나 (성능 감사 P1-14) ─────────────────────────────────────
static/ui/src\utils\useJiraUserInfos.js-7- * 예전에는 화면마다 "이 화면에 등장하는 accountId 집합"을 통째로 캐시 키로 썼다.
static/ui/src\utils\useJiraUserInfos.js-8- * 집합이 한 명만 달라도 완전히 다른 엔트리라, 같은 팀원을 화면마다·페이지마다 다시 받았다.
static/ui/src\utils\useJiraUserInfos.js:9: * 이제 캐시는 **사람 단위**(`jiraKeys.userInfo(accountId)`)로 잡고, 실제 왕복은 이 파일의
static/ui/src\utils\useJiraUserInfos.js-10- * 마이크로 배치 로더가 모아서 `/user/bulk`(50명/호출) 로 낸다.
static/ui/src\utils\useJiraUserInfos.js-11- *   - 배치 창은 `setTimeout(0)` — 같은 틱에 시작된 fetchQuery 들이 **전부** 한 배치에 들어온다.
static/ui/src\utils\useJiraUserInfos.js-12- *     (microtask 로 모으면 react-query 가 queryFn 을 한 틱 미뤄 시작할 때 배치가 쪼개진다.)
--
static/ui/src\utils\queryKey\jiraKeys.js-6-     * `userInfos` 는 "이 호출부가 요구한 집합"의 얇은 래퍼 — 반환 배열의 참조 안정성만 담당하고,
static/ui/src\utils\queryKey\jiraKeys.js-7-     * 실제 왕복 여부는 개인 엔트리의 신선도가 정한다(P1-14).
static/ui/src\utils\queryKey\jiraKeys.js-8-     */
static/ui/src\utils\queryKey\jiraKeys.js:9:    userInfo: (accountId) => ['jiraUserInfo', accountId],
static/ui/src\utils\queryKey\jiraKeys.js:10:    userInfos: (accountIds) => ['jiraUserInfos', accountIds],
static/ui/src\utils\queryKey\jiraKeys.js-11-    coworkerField: () => ['coworkerFieldId'],
static/ui/src\utils\queryKey\jiraKeys.js-12-    // 호출 사용자의 Jira 프로젝트 권한 "getMyPermissions"
static/ui/src\utils\queryKey\jiraKeys.js-13-    myPermissions: (projectKey) => ['jiraMyPermissions', projectKey],
--
static/ui/src\utils\queryKey\queryKeyFactories.test.js-26-    });
static/ui/src\utils\queryKey\queryKeyFactories.test.js-27-
static/ui/src\utils\queryKey\queryKeyFactories.test.js-28-    test('shared Jira and setting caches have one canonical factory each', () => {
static/ui/src\utils\queryKey\queryKeyFactories.test.js:29:        expect(jiraKeys.userMap(['A1'])).toEqual(['userMap', ['A1']]);
static/ui/src\utils\queryKey\queryKeyFactories.test.js-30-        // 사용자 표시정보는 **사람 단위**가 캐시의 단일 출처다(P1-14) — 집합 키는 얇은 래퍼로만 남는다
static/ui/src\utils\queryKey\queryKeyFactories.test.js:31:        expect(jiraKeys.userInfo('A1')).toEqual(['jiraUserInfo', 'A1']);
static/ui/src\utils\queryKey\queryKeyFactories.test.js:32:        expect(jiraKeys.userInfos(['A1', 'A2'])).toEqual(['jiraUserInfos', ['A1', 'A2']]);
static/ui/src\utils\queryKey\queryKeyFactories.test.js-33-        expect(jiraKeys.coworkerField()).toEqual(['coworkerFieldId']);
static/ui/src\utils\queryKey\queryKeyFactories.test.js-34-        expect(settingKeys.detail()).toEqual(['settings', 'detail']);
static/ui/src\utils\queryKey\queryKeyFactories.test.js-35-    });
--- query cache clear/invalidate user details
static/ui/src\hooks\useTeamMemberCandidates.js-92-        onSuccess: (res) => {
static/ui/src\hooks\useTeamMemberCandidates.js-93-            if (res?.success) {
static/ui/src\hooks\useTeamMemberCandidates.js:94:                queryClient.invalidateQueries({ queryKey: projectKeys.users(projectId) });
static/ui/src\hooks\useTeamMemberCandidates.js:95:                queryClient.invalidateQueries({ queryKey: projectKeys.projectTeams(projectId) });
static/ui/src\hooks\useTeamMemberCandidates.js:96:                queryClient.invalidateQueries({ queryKey: projectKeys.teamMemberCandidatesPrefix(projectId) });
--
static/ui/src\pages\projectDetail\assignment\patchAssignmentCache.js-3- *
static/ui/src\pages\projectDetail\assignment\patchAssignmentCache.js-4- * ?? ? invalidate ? ??? ????
static/ui/src\pages\projectDetail\assignment\patchAssignmentCache.js-5- *   Jira ?? ???? write ?? ? ?? ????(project_jira_search_index_lag).
static/ui/src\pages\projectDetail\assignment\patchAssignmentCache.js:6: *   `invalidateQueries` ? board ? ????? ?? ??? ??? ??? ???.
static/ui/src\pages\projectDetail\assignment\patchAssignmentCache.js-7- *   ??? write ?? **?? GET** ?? ??? ?? `{ item, previous }` ? ?????
--
static/ui/src\pages\projectDetail\user\UserAddModal.jsx-28-            .finally(() => {
static/ui/src\pages\projectDetail\user\UserAddModal.jsx-29-                onClose()
static/ui/src\pages\projectDetail\user\UserAddModal.jsx:30:                queryClient.invalidateQueries({ queryKey: projectKeys.users(project_id) });
static/ui/src\pages\projectDetail\user\UserAddModal.jsx-31-            })
static/ui/src\pages\projectDetail\user\UserAddModal.jsx-32-    }
--
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-182-                t('projectDetail.user.toast.description.success.delete')
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-183-            );
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx:184:            queryClient.invalidateQueries({ queryKey: projectKeys.users(project_id) });
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-185-        },
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-186-
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-187-        onError: () => {
--
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-200-            await queryClient.cancelQueries({ queryKey: projectKeys.users(project_id) });
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-201-
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-202-            const previousData = queryClient.getQueryData(projectKeys.userPage(project_id, page));
--
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-222-                t('projectDetail.user.toast.description.success.update')
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-223-            );
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx:224:            queryClient.invalidateQueries({ queryKey: projectKeys.users(project_id) });
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-225-        },
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-226-
--
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-240-
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-241-        onSettled: () => {
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx:242:            queryClient.invalidateQueries({ queryKey: projectKeys.users(project_id) });
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-243-        }
static/ui/src\pages\projectDetail\user\ProjectUserPanel.jsx-244-    });
--
static/ui/src\pages\projectDetail\gantt\useGanttMutations.js-435-            }
static/ui/src\pages\projectDetail\gantt\useGanttMutations.js-436-            const message = err?.cause?.code === 'JIRA_PERMISSION_DENIED'
static/ui/src\pages\projectDetail\gantt\useGanttMutations.js-437-                ? t('projectDetail.issue.jiraPermission.assign')
--
static/ui/src\pages\projectDetail\gantt\useGanttMutations.js-441-

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$file='"'static/ui/src/components/table/skeletonRows.js'; "'$n=0; Get-Content $file | ForEach-Object { $n++; '"'{0,4}: {1}' -f "'$n,$_}}; Write-Output '"'--- setting usage policy gateways'; rg -n -C 3 'resolveSalaryPolicySafe|getSettingDataService|salaryPolicy' src/resolver src/permission | Select-Object -First 300; Write-Output '--- cache participant invalidation import/use'; rg -n -C 2 'invalidateProjectParticipantIssues|ProjectParticipantFetcher' src static/ui/src" in C:\CloudJira\moves-workforce
2026-08-12T09:02:07.360437Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.7 seconds
Output:
위치 줄:2 문자:128
+ ... ontent $file | ForEach-Object { $n++; '{0,4}: {1}' -f $n,$_}}; Write- ...
+                                                                 ~
식 또는 문에서 예기치 않은 '}' 토큰입니다.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : UnexpectedToken
 

 exited 1 in 1672ms:
위치 줄:2 문자:128
+ ... ontent $file | ForEach-Object { $n++; '{0,4}: {1}' -f $n,$_}}; Write- ...
+                                                                 ~
식 또는 문에서 예기치 않은 '}' 토큰입니다.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : UnexpectedToken
 

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$file='"'static/ui/src/components/table/skeletonRows.js'; "'$n=0; Get-Content $file | ForEach-Object { $n++; '"'{0,4}: {1}' -f "'$n,$_ }; rg -n -C 2 '"'invalidateProjectParticipantIssues|ProjectParticipantFetcher' src static/ui/src" in C:\CloudJira\moves-workforce
 succeeded in 3157ms:
   1: import React from 'react';
   2: import { SkeletonCell } from '../skeleton/Skeleton';
   3: 
   4: // ? ??쓣 議곌툑???닿툔?섍쾶 ???꾨? 媛숈? ??씠硫?吏꾩쭨 ?곗씠?곌? ?꾨땲??寃⑹옄臾대뒳濡??쏀엺??
   5: const CELL_WIDTHS = ['82%', '64%', '74%', '56%', '70%'];
   6: 
   7: /**
   8:  * ??濡쒕뵫???ㅼ펷?덊넠 ????**?ㅻ뜑??吏꾩쭨瑜?洹몃?濡??곌퀬 蹂몃Ц ?됰쭔 鍮꾩슫??**
   9:  *
  10:  * ?쒕뒗 而щ읆 援ъ꽦???대? ?뺥빐???덈떎. ?ㅻ뜑瑜?癒쇱? 洹몃젮 ?먮㈃ 濡쒕뵫 以묒뿉??"?대뼡 媛믪씠
  11:  * ?대뒓 ?먮━???ъ?"媛 蹂댁씠怨? ?곗씠?곌? ?꾩갑?대룄 而щ읆 ??룹젙???쒖떆媛 洹몃?濡쒕씪 ?쒓? ?붾뱾由ъ? ?딅뒗??
  12:  * 洹몃옒??Atlaskit DynamicTable ??`isLoading`(諛섑닾紐??ㅻ쾭?덉씠 + ?ㅽ뵾??? ?곗? ?딅뒗??
  13:  *
  14:  * @param head     DynamicTable head ??`cells` 濡?而щ읆 ?섏? key 瑜?洹몃?濡??곕씪媛꾨떎.
  15:  * @param rowCount 洹몃┫ ????
  16:  */
  17: export function buildSkeletonRows(head, rowCount) {
  18:     const cells = head?.cells ?? [];
  19:     if (!cells.length || rowCount <= 0) return [];
  20: 
  21:     return Array.from({ length: rowCount }, (_, r) => ({
  22:         key: `skeleton-${r}`,
  23:         cells: cells.map((cell, i) => ({
  24:             key: cell.key ?? `c${i}`,
  25:             content: <SkeletonCell width={CELL_WIDTHS[(r + i) % CELL_WIDTHS.length]} />,
  26:         })),
  27:     }));
  28: }
src\api\jira\issue\IssueApi.js-5-// A-3 — 아래 두 통계는 **같은 검색을 각자 전량 스캔**했다. 페치는 전용 페처가 1패스로 담당하고
src\api\jira\issue\IssueApi.js-6-//   여기서는 집계만 한다(두 함수의 시그니처·응답 shape 불변).
src\api\jira\issue\IssueApi.js:7:import { getProjectParticipantIssues } from "./ProjectParticipantFetcher";
src\api\jira\issue\IssueApi.js-8-
src\api\jira\issue\IssueApi.js-9-export const getAssigneeStats = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
--
src\api\jira\issue\IssueApi.js-13-    const coworkerIdsToResolve = new Set();
src\api\jira\issue\IssueApi.js-14-
src\api\jira\issue\IssueApi.js:15:    // 1패스 페처(ProjectParticipantFetcher) 결과에서 집계만 한다. 순회 순서는 페이지 순서 그대로라
src\api\jira\issue\IssueApi.js-16-    // 결과 배열의 순서도 종전과 같다.
src\api\jira\issue\IssueApi.js-17-    const records = await getProjectParticipantIssues({projectId, viewerId});
--
src\api\jira\issue\ProjectParticipantFetcher.js-94-
src\api\jira\issue\ProjectParticipantFetcher.js-95-/** 테스트/명시적 초기화용. */
src\api\jira\issue\ProjectParticipantFetcher.js:96:export const invalidateProjectParticipantIssues = () => {
src\api\jira\issue\ProjectParticipantFetcher.js-97-    cached = null;
src\api\jira\issue\ProjectParticipantFetcher.js-98-};
--
src\resolver\projectIssue\ProjectUsersService.js-299-
src\resolver\projectIssue\ProjectUsersService.js-300-/*
src\resolver\projectIssue\ProjectUsersService.js:301: * A-3 — 두 통계는 같은 검색을 1패스로 공유한다(ProjectParticipantFetcher).
src\resolver\projectIssue\ProjectUsersService.js-302- *   `viewerId`(호출자 accountId)는 그 페처의 **인스턴스 캐시 키**로만 쓰인다. 검색이 `as:'user'` 라
src\resolver\projectIssue\ProjectUsersService.js-303- *   결과가 호출자 권한으로 필터링되므로 사용자별로 갈라야 가시 범위가 섞이지 않는다.
--
src\resolver\projectDashboard\ProjectDashboardService.js-265-/*
src\resolver\projectDashboard\ProjectDashboardService.js-266- * A-3 — 담당자 위젯과 이슈(참여자) 위젯은 **문자 단위로 같은 검색**을 각자 전량 스캔했다.
src\resolver\projectDashboard\ProjectDashboardService.js:267: *   페치는 `ProjectParticipantFetcher` 가 1패스로 담당하고 두 함수는 집계만 파생한다.
src\resolver\projectDashboard\ProjectDashboardService.js-268- *   두 위젯이 각각 invoke 되는 구조(프론트 `ChartTemplate`)는 그대로이므로, 요청 간 중복은
src\resolver\projectDashboard\ProjectDashboardService.js-269- *   그 페처의 60초 인스턴스 캐시가 흡수한다(캐시 키에 viewerId 포함 — 가시 범위 혼입 방지).

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$targets=@('"'static/ui/src/utils/__test__/jiraUserInfoLoader.test.js','static/ui/src/components/tabs/__test__/tabComponentIdentity.test.js','static/ui/src/polling/__test__/jobPolling.test.js','static/ui/src/pages/myWork/utils/__test__/useMyWorklogSummary.test.js'); foreach("'$file in $targets){if(Test-Path $file){Write-Output "--- $file"; $n=0; Get-Content $file | ForEach-Object {$n++;'"'{0,4}: {1}' -f "'$n,$_}}}' in C:\CloudJira\moves-workforce
 succeeded in 2688ms:
--- static/ui/src/utils/__test__/jiraUserInfoLoader.test.js
   1: import {executeRequest} from '../jiraApi/requestJira';
   2: import {fetchBulkUsers, loadUserInfo} from '../useJiraUserInfos';
   3: 
   4: jest.mock('../jiraApi/requestJira', () => ({
   5:     executeRequest: jest.fn(),
   6: }));
   7: 
   8: const user = (id) => ({accountId: id, displayName: `user-${id}`});
   9: const ids = (count, prefix = 'u') => Array.from({length: count}, (_, i) => `${prefix}${i}`);
  10: 
  11: beforeEach(() => {
  12:     executeRequest.mockReset();
  13:     executeRequest.mockImplementation(async (_key, {accountId}) => ({
  14:         values: accountId.map(user),
  15:     }));
  16: });
  17: 
  18: describe('P1-14 ?ъ슜??議고쉶 ???щ엺 ?⑥쐞 ?붿껌??bulk ??踰덉쑝濡?紐⑥씤??, () => {
  19:     it('媛숈? ?깆쓽 媛쒕퀎 ?붿껌??/user/bulk 1?뚮줈 臾띠씤??, async () => {
  20:         const results = await Promise.all(['a', 'b', 'c'].map(loadUserInfo));
  21: 
  22:         expect(executeRequest).toHaveBeenCalledTimes(1);
  23:         expect(executeRequest.mock.calls[0][1].accountId).toEqual(['a', 'b', 'c']);
  24:         expect(results.map(r => r.displayName)).toEqual(['user-a', 'user-b', 'user-c']);
  25:     });
  26: 
  27:     it('媛숈? ?щ엺???щ윭 踰??붿껌?대룄 id ????踰덈쭔 ?ㅻ┛??, async () => {
  28:         const results = await Promise.all([loadUserInfo('a'), loadUserInfo('a')]);
  29: 
  30:         expect(executeRequest.mock.calls[0][1].accountId).toEqual(['a']);
  31:         expect(results[0]).toEqual(results[1]);
  32:     });
  33: 
  34:     it('?묐떟???녿뒗 ?щ엺? null (undefined ??react-query 媛 罹먯떆?섏? 紐삵븳??', async () => {
  35:         executeRequest.mockResolvedValueOnce({values: []});
  36:         await expect(loadUserInfo('ghost')).resolves.toBeNull();
  37:     });
  38: 
  39:     it('?뵶 泥?겕 ?ㅽ뙣??reject ?쒕떎 ??resolve(null) 濡??섍린硫?"?녿뒗 ?ъ슜??濡?罹먯떆??援노뒗??, async () => {
  40:         executeRequest.mockResolvedValueOnce({success: false, error: {code: 500}});
  41:         await expect(loadUserInfo('a')).rejects.toBeTruthy();
  42:     });
  43: 
  44:     it('accountId ?뺤떇???꾨땲硫??뺣났 ?놁씠 null', async () => {
  45:         await expect(loadUserInfo('bad id!')).resolves.toBeNull();
  46:         expect(executeRequest).not.toHaveBeenCalled();
  47:     });
  48: });
  49: 
  50: describe('fetchBulkUsers ??泥?겕媛 蹂묐젹?대떎 (吏곷젹 for-await ?쒓굅)', () => {
  51:     it('120紐낆? 50媛쒖뵫 3泥?겕濡??섍?怨??꾨웾???뚮젮以??, async () => {
  52:         const started = [];
  53:         executeRequest.mockImplementation(async (_key, {accountId}) => {
  54:             started.push(accountId.length);
  55:             // 泥?겕媛 吏곷젹?대㈃ ???쒖젏????泥?겕媛 ?대? ?앸굹 ?덈떎 ??蹂묐젹?대㈃ ?뗭씠 ?④퍡 ???덈떎
  56:             await new Promise(resolve => setTimeout(resolve, 5));
  57:             return {values: accountId.map(user)};
  58:         });
  59: 
  60:         const promise = fetchBulkUsers(ids(120));
  61:         await Promise.resolve();
  62:         expect(started.length).toBe(3);
  63: 
  64:         const users = await promise;
  65:         expect(users).toHaveLength(120);
  66:         expect(executeRequest).toHaveBeenCalledTimes(3);
  67:     });
  68: 
  69:     it('?ㅽ뙣??泥?겕??議곗슜??鍮좎쭊??(醫낆쟾 ?숈옉)', async () => {
  70:         executeRequest
  71:             .mockResolvedValueOnce({success: false, error: {code: 500}})
  72:             .mockImplementationOnce(async (_key, {accountId}) => ({values: accountId.map(user)}));
  73: 
  74:         const users = await fetchBulkUsers(ids(60));
  75:         expect(users).toHaveLength(10);
  76:     });
  77: 
  78:     it('?뺤떇???닿툔??accountId ??嫄몃윭吏꾨떎', async () => {
  79:         await fetchBulkUsers(['ok-1', '', null, 'has space']);
  80:         expect(executeRequest.mock.calls[0][1].accountId).toEqual(['ok-1']);
  81:     });
  82: });
--- static/ui/src/polling/__test__/jobPolling.test.js
   1: import {
   2:     isTerminalJob,
   3:     MAX_CONSECUTIVE_POLL_FAILURES,
   4:     MAX_POLL_BACKOFF_MS,
   5:     getPollingRetryDelay,
   6:     readJobFromResponse,
   7: } from '../jobPolling';
   8: 
   9: describe('upload job polling contract', () => {
  10:     it('?쒖? envelope??content.job??諛섑솚?쒕떎', () => {
  11:         const job = { id: 'job-1', status: 'RUNNING' };
  12:         expect(readJobFromResponse({ success: true, content: { job } })).toBe(job);
  13:     });
  14: 
  15:     it('job:null? ?뺤긽?곸씤 異붿쟻 醫낅즺 ?좏샇濡?蹂댁〈?쒕떎', () => {
  16:         expect(readJobFromResponse({ success: true, content: { job: null } })).toBeNull();
  17:     });
  18: 
  19:     it('wrapper ?ㅽ뙣? shape ?꾨씫? transient ?ㅻ쪟濡??섏쭊??, () => {
  20:         expect(() => readJobFromResponse({
  21:             success: false,
  22:             error: { code: 'JOB_STATUS_READ_FAILED', message: 'temporary' },
  23:         })).toThrow('temporary');
  24:         expect(() => readJobFromResponse({ success: true, content: {} }))
  25:             .toThrow('invalid response shape');
  26:     });
  27: 
  28:     it('server cleanup ???terminal ?곹깭留??먯젙?쒕떎', () => {
  29:         expect(isTerminalJob({ status: 'RUNNING' })).toBe(false);
  30:         expect(isTerminalJob({ status: 'COMPLETED' })).toBe(true);
  31:         expect(isTerminalJob({ status: 'PARTIAL' })).toBe(true);
  32:         expect(isTerminalJob({ status: 'FAILED' })).toBe(true);
  33:         expect(MAX_CONSECUTIVE_POLL_FAILURES).toBeGreaterThanOrEqual(3);
  34:     });
  35: 
  36:     it('?곗냽 ?ㅽ뙣 retry delay瑜?吏??利앷??쒗궎???곹븳?쇰줈 ?쒗븳?쒕떎', () => {
  37:         expect(getPollingRetryDelay(1)).toBe(3000);
  38:         expect(getPollingRetryDelay(2)).toBe(6000);
  39:         expect(getPollingRetryDelay(3)).toBe(12000);
  40:         expect(getPollingRetryDelay(99)).toBe(MAX_POLL_BACKOFF_MS);
  41:     });
  42: });

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -i \"customEntityManager\\('role'\\)|customEntityManager\\('level'\\)|customEntityManager\\('skill'\\)|customEntityManager\\('status'\\)|customEntityManager\\('holiday'\\)|customEntityManager\\('settings'\\)\" src; rg -n -i \"ENTITY\\s*=\\s*'role'|ENTITY\\s*=\\s*'level'|ENTITY\\s*=\\s*'skill'|ENTITY\\s*=\\s*'status'|ENTITY\\s*=\\s*'holiday'|ENTITY\\s*=\\s*'settings'\" src" in C:\CloudJira\moves-workforce
 succeeded in 2074ms:
src\seed\SeedData.js:238:    const queryManager = customEntityManager('status');
src\seed\SeedData.js:269:    const statusManager = customEntityManager('status');
src\seed\SeedData.js:305:    const queryManager = customEntityManager('settings');
src\resolver\backoffice\projectStatus\ProjectStatusService.js:143:    const statusManager = customEntityManager('status');
src\resolver\backoffice\projectStatus\ProjectStatusService.js:345:    const queryManager = customEntityManager('status');
src\resolver\backoffice\level\LevelService.js:12:const ENTITY = 'level';
src\resolver\backoffice\publicHoliday\PublicHolidayService.js:8:const ENTITY = 'holiday';
src\resolver\backoffice\role\RoleService.js:10:const ENTITY = 'role';
src\resolver\backoffice\projectStatus\ProjectStatusService.js:9:const ENTITY = 'status';
src\resolver\backoffice\setting\SettingService.js:9:const ENTITY = 'settings';
src\resolver\backoffice\skill\SkillService.js:15:const ENTITY = 'skill';

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -uu -n -i \"customEntityManager\\('role'\\)|customEntityManager\\('level'\\)|customEntityManager\\('skill'\\)|customEntityManager\\('status'\\)|customEntityManager\\('holiday'\\)|customEntityManager\\('settings'\\)\" src scripts; rg -uu -n -i \"entity:\\s*'role'|entity:\\s*'level'|entity:\\s*'skill'\" src scripts" in C:\CloudJira\moves-workforce
2026-08-12T09:03:23.005111Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 2.2 seconds
Output:
src\seed\SeedData.js:238:    const queryManager = customEntityManager('status');
src\seed\SeedData.js:269:    const statusManager = customEntityManager('status');
src\seed\SeedData.js:305:    const queryManager = customEntityManager('settings');
src\trigger\demoSeed.js:85:    const {results = []} = await customEntityManager('status').findAll();
src\resolver\backoffice\projectStatus\ProjectStatusService.js:143:    const statusManager = customEntityManager('status');
src\resolver\backoffice\projectStatus\ProjectStatusService.js:345:    const queryManager = customEntityManager('status');

 exited 1 in 2209ms:
src\seed\SeedData.js:238:    const queryManager = customEntityManager('status');
src\seed\SeedData.js:269:    const statusManager = customEntityManager('status');
src\seed\SeedData.js:305:    const queryManager = customEntityManager('settings');
src\trigger\demoSeed.js:85:    const {results = []} = await customEntityManager('status').findAll();
src\resolver\backoffice\projectStatus\ProjectStatusService.js:143:    const statusManager = customEntityManager('status');
src\resolver\backoffice\projectStatus\ProjectStatusService.js:345:    const queryManager = customEntityManager('status');

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$file='"'src/trigger/demoSeed.js'; "'$n=0; Get-Content $file | ForEach-Object {$n++; if($n -le 160){'"'{0,4}: {1}' -f "'$n,$_}}; rg -uu -n -i "save'"\\(|delete\\(\" src/trigger/demoSeed.js" in C:\CloudJira\moves-workforce
 succeeded in 1622ms:
   1: import api, {route} from '@forge/api';
   2: import {executeQuery} from '../rdb/query/CommonQuery';
   3: import {customEntityManager} from '../nosql/query/CustomEntityManager';
   4: import {createQueue} from '../utils/queueUtil';
   5: import {GanttFolderQuery} from '../rdb/query/GanttFolderQuery';
   6: 
   7: /**
   8:  * [DEMO] ?쒖뿰???곗씠???쒕뜑 ???꾩떆 ?뱁듃由ш굅 (?쒖뿰 ???쒓굅 ???
   9:  *
  10:  * ?몃? ?ㅽ겕由쏀듃(scripts/demo-seed/seed.js)媛 Jira ?댁뒋/?뚰겕濡쒓렇瑜?留뚮뱺 ??
  11:  * ???꾩슜 ?곗씠??project/users/projectusers/user_schedule + KVS role/level)?
  12:  * readOnly ?깊븘??moves_RMS_projectId) ?쒓퉭?????몃━嫄곕줈 ?섑뻾?쒕떎.
  13:  * (readOnly Forge ?꾨뱶????而⑦뀓?ㅽ듃??app/field/value ?붾뱶?ъ씤?몃줈留?write 媛??
  14:  *
  15:  * actions: ping | seed-app | tag-issues | reset-app
  16:  * ?몄쬆: x-demo-secret ?ㅻ뜑 (DEMO_SECRET ?쇱튂 ?꾩닔)
  17:  */
  18: const DEMO_SECRET = 'moves-demo-seed-2026';
  19: const CREATED_ID = 'demo-seeder';
  20: 
  21: const json = (statusCode, body) => ({
  22:     statusCode,
  23:     headers: {'Content-Type': ['application/json']},
  24:     body: JSON.stringify(body),
  25: });
  26: 
  27: const getHeader = (headers = {}, name) => {
  28:     const v = headers[name] ?? headers[name.toLowerCase()];
  29:     return Array.isArray(v) ? v[0] : v;
  30: };
  31: 
  32: export const runDemoSeed = async (event) => {
  33:     try {
  34:         if (getHeader(event.headers, 'x-demo-secret') !== DEMO_SECRET) {
  35:             return json(401, {success: false, error: 'unauthorized'});
  36:         }
  37: 
  38:         const payload = JSON.parse(event.body || '{}');
  39:         const {action} = payload;
  40:         console.log('[DEMO-SEED] action:', action);
  41: 
  42:         switch (action) {
  43:             case 'ping':
  44:                 return json(200, {success: true, pong: true});
  45:             case 'seed-app':
  46:                 return json(200, await seedApp(payload));
  47:             case 'tag-issues':
  48:                 return json(200, await tagIssues(payload));
  49:             case 'reset-app':
  50:                 return json(200, await resetApp(payload));
  51:             case 'refresh-dashboard':
  52:                 return json(200, await refreshDashboard());
  53:             case 'seed-gantt':
  54:                 return json(200, await seedGantt(payload));
  55:             case 'update-project':
  56:                 return json(200, await updateProject(payload));
  57:             case 'snapshot-status':
  58:                 return json(200, await snapshotStatus());
  59:             default:
  60:                 return json(400, {success: false, error: `unknown action: ${action}`});
  61:         }
  62:     } catch (e) {
  63:         console.error('[DEMO-SEED] failed', e);
  64:         return json(500, {success: false, error: e.message, cause: String(e.cause || '')});
  65:     }
  66: };
  67: 
  68: /** KVS ?뷀떚??role/level)瑜??대쫫 湲곗??쇰줈 蹂댁옣?섍퀬 name?뭝d 留?諛섑솚 */
  69: const ensureNamedEntities = async (entityName, names = []) => {
  70:     const manager = customEntityManager(entityName);
  71:     const {results = []} = await manager.findAll();
  72:     const byName = new Map(results.map(r => [r.value?.name, r.key]));
  73: 
  74:     for (const name of names) {
  75:         if (byName.has(name)) continue;
  76:         const id = `${entityName}-${crypto.randomUUID()}`;
  77:         await manager.save(id, {id, name, description: '[DEMO]'});
  78:         byName.set(name, id);
  79:     }
  80:     return byName;
  81: };
  82: 
  83: /** KVS status ?뷀떚??name?뭝d 留?(?꾨줈?앺듃 ?곹깭???쒕뱶濡??대? 議댁옱?댁빞 ?? */
  84: const getStatusMap = async () => {
  85:     const {results = []} = await customEntityManager('status').findAll();
  86:     return new Map(results.map(r => [r.value?.name, r.key]));
  87: };
  88: 
  89: const seedApp = async ({roles = [], levels = [], users = [], projects = [], schedules = []}) => {
  90:     const roleMap = await ensureNamedEntities('role', roles);
  91:     const levelMap = await ensureNamedEntities('level', levels);
  92:     const statusMap = await getStatusMap();
  93: 
  94:     // 1) users upsert (?곕큺 + ??븷/吏곴툒/沅뚰븳)
  95:     for (const u of users) {
  96:         await executeQuery(`
  97:             INSERT INTO users (account_id, role_key, level_key, permission_key, salary, created_id)
  98:             VALUES (?, ?, ?, ?, ?, ?)
  99:             ON DUPLICATE KEY UPDATE
 100:                 role_key = VALUES(role_key),
 101:                 level_key = VALUES(level_key),
 102:                 salary = VALUES(salary),
 103:                 updated_id = VALUES(created_id)
 104:         `, [
 105:             u.accountId,
 106:             roleMap.get(u.roleName) || null,
 107:             levelMap.get(u.levelName) || null,
 108:             u.permissionKey || 'permission-Member',
 109:             u.salary ?? null,
 110:             CREATED_ID,
 111:         ]);
 112:     }
 113: 
 114:     // 2) projects (?대쫫 湲곗? 硫깅벑 ???덉쑝硫??ъ궗?? + projectusers
 115:     const createdProjects = [];
 116:     for (const p of projects) {
 117:         const statusKey = statusMap.get(p.statusName);
 118:         if (!statusKey) throw new Error(`unknown project status: ${p.statusName} (KVS status ?쒕뱶 ?뺤씤 ?꾩슂)`);
 119: 
 120:         const found = await executeQuery(
 121:             `SELECT BIN_TO_UUID(project_id) AS project_id FROM project WHERE project_name = ?`,
 122:             [p.name],
 123:         );
 124:         let projectId = found?.rows?.[0]?.project_id;
 125: 
 126:         if (!projectId) {
 127:             projectId = crypto.randomUUID();
 128:             await executeQuery(`
 129:                 INSERT INTO project (project_id, project_name, project_status_key, start_date, end_date, total_budget, created_id, updated_id)
 130:                 VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?)
 131:             `, [projectId, p.name, statusKey, p.startDate, p.endDate, p.totalBudget ?? null, CREATED_ID, CREATED_ID]);
 132:         }
 133: 
 134:         for (const m of p.members || []) {
 135:             await executeQuery(`
 136:                 INSERT INTO projectusers (project_member_id, project_id, account_id, role_key, level_key, salary, salary_type, created_id, updated_id)
 137:                 SELECT UUID_TO_BIN(UUID()), UUID_TO_BIN(?), u.account_id, u.role_key, u.level_key, ?, ?, ?, ?
 138:                 FROM users u
 139:                 WHERE u.account_id = ?
 140:                   AND NOT EXISTS (
 141:                         SELECT 1 FROM projectusers pu
 142:                         WHERE pu.project_id = UUID_TO_BIN(?) AND pu.account_id = u.account_id
 143:                   )
 144:             `, [projectId, m.salary ?? null, m.salaryType || 'PROJECT', CREATED_ID, CREATED_ID, m.accountId, projectId]);
 145:         }
 146: 
 147:         createdProjects.push({name: p.name, projectId});
 148:     }
 149: 
 150:     // 3) user_schedule (?곗감/諛섏감/異쒖옣 ?? ??UNIQUE(account_id, start, type) ??IGNORE 濡?硫깅벑
 151:     for (const s of schedules) {
 152:         await executeQuery(`
 153:             INSERT IGNORE INTO user_schedule
 154:                 (schedule_id, account_id, schedule_start_date, schedule_end_date, schedule_type, work_ratio, description, created_id, updated_id)
 155:             VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?, ?)
 156:         `, [s.accountId, s.startDate, s.endDate, s.type, s.workRatio ?? 0, s.description || '[DEMO]', CREATED_ID, CREATED_ID]);
 157:     }
 158: 
 159:     return {success: true, projects: createdProjects, userCount: users.length, scheduleCount: schedules.length};
 160: };
77:        await manager.save(id, {id, name, description: '[DEMO]'});

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem 'static/ui/src/components/tabs/__test__' -File | Select-Object -ExpandProperty FullName; Get-ChildItem 'static/ui/src/pages/myWork/utils' -Recurse -File | Where-Object {"'$_.Name -match '"'test'} | Select-Object -ExpandProperty FullName; git -c safe.directory='C:/CloudJira/moves-workforce' diff --check HEAD; git -c safe.directory='C:/CloudJira/moves-workforce' status --short" in C:\CloudJira\moves-workforce
 succeeded in 1780ms:
C:\CloudJira\moves-workforce\static\ui\src\components\tabs\__test__\tabMountIdentity.test.js
 M .gitignore
 M src/api/jira/issue/IssueApi.js
 M src/rdb/query/ProjectDashboard.js
 M src/resolver/backoffice/level/LevelService.js
 M src/resolver/backoffice/projectStatus/ProjectStatusService.js
 M src/resolver/backoffice/publicHoliday/PublicHolidayService.js
 M src/resolver/backoffice/role/RoleService.js
 M src/resolver/backoffice/setting/SettingService.js
 M src/resolver/backoffice/setting/__test__/SalaryPolicySetting.test.js
 M src/resolver/backoffice/setting/__test__/SettingService.test.js
 M src/resolver/backoffice/skill/SkillService.js
 M src/resolver/myWork/MyWorkService.jsx
 M src/resolver/projectDashboard/ProjectDashboardService.js
 M src/resolver/projectIssue/ProjectUsersService.js
 M src/resolver/utils/worklog/WorklogService.js
 M src/seed/SeedData.js
 M static/ui/src/components/feedback/ToastFlags.js
 M static/ui/src/components/select/UserSearchSelect.jsx
 M static/ui/src/components/table/TableSurface.jsx
 M static/ui/src/components/table/__test__/tableContract.test.js
 M static/ui/src/components/table/__test__/tableSort.test.js
 M static/ui/src/components/table/tableSort.js
 M static/ui/src/components/tabs/CommonTab.jsx
 M static/ui/src/constants/tabs.js
 M static/ui/src/pages/myWork/WorklogPage.jsx
 M static/ui/src/pages/myWork/utils/useMyWorklogList.js
 M static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
 M static/ui/src/pages/projectDetail/analysisReport/resource/__test__/resourceAdapterSingleSource.test.js
 M static/ui/src/pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js
 M static/ui/src/pages/projectDetail/analysisReport/team/__test__/projectTeamAnalysisWiring.test.js
 M static/ui/src/pages/projectDetail/cost/CostByIssueTable.jsx
 M static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx
 M static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx
 M static/ui/src/polling/JobPollingManager.jsx
 M static/ui/src/polling/jobPolling.js
 M static/ui/src/utils/jiraApi/users/getUserInfos.js
 M static/ui/src/utils/queryKey/jiraKeys.js
 M static/ui/src/utils/queryKey/queryKeyFactories.test.js
 M static/ui/src/utils/useJiraUserInfos.js
?? .container-service-assets/
?? du.exe.stackdump
?? src/api/jira/issue/ProjectParticipantFetcher.js
?? src/resolver/backoffice/DictionaryCache.js
?? static/ui/src/components/tabs/__test__/
?? static/ui/src/pages/projectDetail/work/WORK_VIEWS.md
?? static/ui/src/utils/__test__/jiraUserInfoLoader.test.js
warning: in the working copy of 'static/ui/src/components/table/TableSurface.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableContract.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/__test__/tableSort.test.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/components/table/tableSort.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/jiraApi/users/getUserInfos.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'static/ui/src/utils/useJiraUserInfos.js', LF will be replaced by CRLF the next time Git touches it

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 4 'resolveSalaryPolicySafe|export const getSettingDataService|updateSettingService|readDictionary' src/permission/SalaryVisibility.js src/resolver/backoffice/setting/SettingService.js src/resolver/projectIssue/ProjectUsersController.js src/resolver/projectCost/ProjectCostController.js src/resolver/projectDashboard/ProjectDashboardController.js" in C:\CloudJira\moves-workforce
 succeeded in 1258ms:
src/resolver/projectDashboard/ProjectDashboardController.js-5-    getSummaryDataService, removeChartService, updateChartLayoutService,
src/resolver/projectDashboard/ProjectDashboardController.js-6-    updateChartTitleService
src/resolver/projectDashboard/ProjectDashboardController.js-7-} from "./ProjectDashboardService";
src/resolver/projectDashboard/ProjectDashboardController.js-8-// 급여 정책(RFC-163) — **Controller 레이어 게이팅**(§5-3 ⚠#3 의 getUserInfo 선례와 동일 이유)
src/resolver/projectDashboard/ProjectDashboardController.js:9:import {canShowIndividualSalary, resolveSalaryPolicySafe} from "../../permission/SalaryVisibility";
src/resolver/projectDashboard/ProjectDashboardController.js-10-import {canReadCost} from "../../permission/CostAccess";
src/resolver/projectDashboard/ProjectDashboardController.js-11-
src/resolver/projectDashboard/ProjectDashboardController.js-12-
src/resolver/projectDashboard/ProjectDashboardController.js-13-export const registerProjectDashboardController = resolver =>{
--
src/resolver/projectDashboard/ProjectDashboardController.js-21-     *   `ProjectUsersService:170`, `ProjectProgressService:70`(total_salary 를 쓰지도 않는다).
src/resolver/projectDashboard/ProjectDashboardController.js-22-     *   서비스에 정책 조회를 넣으면 그 3곳 전부에 KVS 왕복이 추가된다(`getSettingDataService` 는 메모이즈 없음).
src/resolver/projectDashboard/ProjectDashboardController.js-23-     *   `getUserInfo`(PrincipalResolver 내부 호출)·`updateUser` 와 **같은 판단**이다.
src/resolver/projectDashboard/ProjectDashboardController.js-24-     *
src/resolver/projectDashboard/ProjectDashboardController.js:25:     * ⚠ fail-close: `resolveSalaryPolicySafe` 는 조회 실패 시 LEVEL_BAND(= 숨김)로 폴백한다.
src/resolver/projectDashboard/ProjectDashboardController.js-26-     *
src/resolver/projectDashboard/ProjectDashboardController.js-27-     * ⚠⚠ **정책과 무관하게 `PROJECT_COST` read 도 요구한다.** 이 가드는 DASHBOARD read 이고
src/resolver/projectDashboard/ProjectDashboardController.js-28-     *   시드 Member 셋은 DASHBOARD read=true / PROJECT_COST read=false 다. 정책만 보면
src/resolver/projectDashboard/ProjectDashboardController.js-29-     *   기본값인 INDIVIDUAL 설치(= 기존 설치 전부)에서 **모든 구성원이 프로젝트 인건비를 본다**
--
src/resolver/projectDashboard/ProjectDashboardController.js-32-     *   (`canReadCost` 는 principal 누락 시 fail-close 다.)
src/resolver/projectDashboard/ProjectDashboardController.js-33-     */
src/resolver/projectDashboard/ProjectDashboardController.js-34-    guardedDefine(resolver, 'getSummaryData', async ({payload, principal}) => {
src/resolver/projectDashboard/ProjectDashboardController.js-35-        const res = await getSummaryDataService(payload);
src/resolver/projectDashboard/ProjectDashboardController.js:36:        if (canReadCost(principal) && canShowIndividualSalary(await resolveSalaryPolicySafe())) return res;
src/resolver/projectDashboard/ProjectDashboardController.js-37-        const {total_salary, ...rest} = res ?? {};
src/resolver/projectDashboard/ProjectDashboardController.js-38-        return rest;
src/resolver/projectDashboard/ProjectDashboardController.js-39-    });
src/resolver/projectDashboard/ProjectDashboardController.js-40-
--
src/resolver/backoffice/setting/SettingService.js-2-import {LogicalError} from '../../../error/LogicalError';
src/resolver/backoffice/setting/SettingService.js-3-import {ErrorCodes} from '../../../utils/errors/ErrorCodes';
src/resolver/backoffice/setting/SettingService.js-4-import {DEFAULT_SETTINGS} from './SettingDefaults';
src/resolver/backoffice/setting/SettingService.js-5-// A-7 — 마스터 사전 60초 모듈 캐시(TeamTreeCache 동형). 인스턴스별 캐시라는 한계는 DictionaryCache 주석 참조.
src/resolver/backoffice/setting/SettingService.js:6:import {invalidateDictionary, readDictionary} from '../DictionaryCache';
src/resolver/backoffice/setting/SettingService.js-7-
src/resolver/backoffice/setting/SettingService.js-8-
src/resolver/backoffice/setting/SettingService.js-9-const ENTITY = 'settings';
src/resolver/backoffice/setting/SettingService.js-10-
--
src/resolver/backoffice/setting/SettingService.js-20- *   정책을 바꿔도 다른 인스턴스는 최대 60초 동안 옛 정책으로 판정한다. 관리자 1인이 누르는
src/resolver/backoffice/setting/SettingService.js-21- *   저빈도 설정 변경이고, 권한 판정이 이미 최대 90초 stale(TeamTree 60 + principal 30)을
src/resolver/backoffice/setting/SettingService.js-22- *   수용하고 있어 같은 급의 경계다. 쓰기 경로(updateSetting)는 저장 직전 KVS 를 직접 읽는다.
src/resolver/backoffice/setting/SettingService.js-23- */
src/resolver/backoffice/setting/SettingService.js:24:export const getSettingDataService = async () => {
src/resolver/backoffice/setting/SettingService.js:25:    const saved = await readDictionary(ENTITY, loadSettingRecord);
src/resolver/backoffice/setting/SettingService.js-26-    // 기존 installation에는 새 attribute가 없을 수 있으므로 read에서도 기본값을 보충한다.
src/resolver/backoffice/setting/SettingService.js-27-    // (스프레드가 호출마다 새 객체를 만들므로 캐시 값이 소비자에게 공유되지 않는다.)
src/resolver/backoffice/setting/SettingService.js-28-    return {...DEFAULT_SETTINGS, ...(saved ?? {})};
src/resolver/backoffice/setting/SettingService.js-29-};
src/resolver/backoffice/setting/SettingService.js-30-
src/resolver/backoffice/setting/SettingService.js-31-
src/resolver/backoffice/setting/SettingService.js:32:export const updateSettingService = async ({
src/resolver/backoffice/setting/SettingService.js-33-    currency,
src/resolver/backoffice/setting/SettingService.js-34-    hourRate,
src/resolver/backoffice/setting/SettingService.js-35-    utilizationUnderBand,
src/resolver/backoffice/setting/SettingService.js-36-    utilizationOverBand,
--
src/permission/SalaryVisibility.js-29- * ⚠ fail-close 의 의미: 실패하면 **숨기는 쪽**(LEVEL_BAND)으로 간다. 노출 쪽 폴백 금지.
src/permission/SalaryVisibility.js-30- * ⚠ **계산 경로에는 쓰지 않는다.**
src/permission/SalaryVisibility.js-31- * @returns {Promise<'INDIVIDUAL'|'LEVEL_BAND'>}
src/permission/SalaryVisibility.js-32- */
src/permission/SalaryVisibility.js:33:export const resolveSalaryPolicySafe = async () => {
src/permission/SalaryVisibility.js-34-    try {
src/permission/SalaryVisibility.js-35-        return normalizeSalaryPolicy((await getSettingDataService())?.salaryPolicy);
src/permission/SalaryVisibility.js-36-    } catch (e) {
src/permission/SalaryVisibility.js-37-        console.error('[SalaryVisibility] policy load failed → hide', e);

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
codex
리뷰를 마쳤습니다. A-7의 쓰기 경로는 `src` 전체 검색으로 대조했고, 일반 CRUD·bulk·status 순서 저장·시드 경로에는 무효화가 모두 연결돼 있었습니다. 다만 설정 캐시가 급여 표시 정책까지 캐싱하는 점과 A-3의 캐시 구현에는 실제 회귀 시나리오가 남습니다.
codex
리뷰 결과: 중요 3건입니다.

- **중요 — A-3 초기 대시보드에서 중복 전량 스캔이 그대로 발생합니다.** [ProjectParticipantFetcher.js:85](C:/CloudJira/moves-workforce/src/api/jira/issue/ProjectParticipantFetcher.js:85) 는 완료된 `records`만 캐시합니다. `ChartTemplate`의 assignee/issue 위젯은 동시에 각자 `invoke()`되므로, 첫 요청이 끝나기 전 두 요청 모두 cache miss → 각각 전량 페이지 스캔합니다. 표준 첫 진입에서 목표인 `2N → N`이 달성되지 않습니다. 캐시에 in-flight `Promise`를 먼저 넣어야 합니다.

- **중요 — A-3의 `viewerId` 키는 계정 간 누수만 막고, 동일 계정의 Jira 권한 변경은 우회합니다.** [ProjectParticipantFetcher.js:85](C:/CloudJira/moves-workforce/src/api/jira/issue/ProjectParticipantFetcher.js:85) 캐시 hit 시 `as:'user'` Jira 검색을 다시 하지 않습니다. 사용자가 프로젝트 Browse/이슈 보안 권한을 잃은 직후에도 같은 `viewerId`라면 최대 60초간 기존 참여자 통계를 받습니다. 또한 앱은 “읽기 전용”이 아닙니다. [ProjectUsersService.js:402](C:/CloudJira/moves-workforce/src/resolver/projectIssue/ProjectUsersService.js:402)가 coworker property를 갱신하지만 이 캐시를 무효화하지 않아, 저장 후 대시보드가 최대 60초간 이전 참여자 수를 표시합니다.

- **중요 — A-7 settings 캐시가 급여 노출 정책을 최대 60초간 이전 값으로 판정합니다.** [SettingService.js:25](C:/CloudJira/moves-workforce/src/resolver/backoffice/setting/SettingService.js:25), [DictionaryCache.js:37](C:/CloudJira/moves-workforce/src/resolver/backoffice/DictionaryCache.js:37)입니다. 한 인스턴스에서 `INDIVIDUAL → LEVEL_BAND`로 전환해도, 이미 `INDIVIDUAL`을 캐싱한 다른 인스턴스는 `resolveSalaryPolicySafe()`를 통해 개인 급여를 계속 노출할 수 있습니다. 이는 단순 “수정했는데 안 보임”을 넘어 급여 표시 정책의 fail-close 경계를 깨뜨립니다. 정책 게이트 조회는 fresh read로 분리하거나, 전 인스턴스에 적용되는 버전 기반 무효화가 필요합니다.

문제없음: 1(A-1), 2(A-8), 5(P1-7), 6(P1-9), 7(P1-14), 8(P1-4), 9(P1-3), 10(P1-8/P1-13). 특히 P1-9의 clip은 서버와 같은 `started.substring(0, 10)`의 inclusive 범위 조건이라 동치입니다. A-7의 role/level/skill/status/holiday/settings 쓰기 경로도 grep으로 대조했으며, 일반 CRUD·bulk·status 순서 저장·시드 경로의 무효화 누락은 없었습니다.

`git diff --check HEAD`는 통과했습니다. Jest는 샌드박스가 `%LOCALAPPDATA%\Temp\jest`의 haste-map 쓰기를 막아 `npm.cmd test -- --runInBand --no-cache`까지 실행 불가했습니다.
hook: Stop
hook: Stop
hook: Stop Completed
hook: Stop Failed
tokens used
269,248
리뷰 결과: 중요 3건입니다.

- **중요 — A-3 초기 대시보드에서 중복 전량 스캔이 그대로 발생합니다.** [ProjectParticipantFetcher.js:85](C:/CloudJira/moves-workforce/src/api/jira/issue/ProjectParticipantFetcher.js:85) 는 완료된 `records`만 캐시합니다. `ChartTemplate`의 assignee/issue 위젯은 동시에 각자 `invoke()`되므로, 첫 요청이 끝나기 전 두 요청 모두 cache miss → 각각 전량 페이지 스캔합니다. 표준 첫 진입에서 목표인 `2N → N`이 달성되지 않습니다. 캐시에 in-flight `Promise`를 먼저 넣어야 합니다.

- **중요 — A-3의 `viewerId` 키는 계정 간 누수만 막고, 동일 계정의 Jira 권한 변경은 우회합니다.** [ProjectParticipantFetcher.js:85](C:/CloudJira/moves-workforce/src/api/jira/issue/ProjectParticipantFetcher.js:85) 캐시 hit 시 `as:'user'` Jira 검색을 다시 하지 않습니다. 사용자가 프로젝트 Browse/이슈 보안 권한을 잃은 직후에도 같은 `viewerId`라면 최대 60초간 기존 참여자 통계를 받습니다. 또한 앱은 “읽기 전용”이 아닙니다. [ProjectUsersService.js:402](C:/CloudJira/moves-workforce/src/resolver/projectIssue/ProjectUsersService.js:402)가 coworker property를 갱신하지만 이 캐시를 무효화하지 않아, 저장 후 대시보드가 최대 60초간 이전 참여자 수를 표시합니다.

- **중요 — A-7 settings 캐시가 급여 노출 정책을 최대 60초간 이전 값으로 판정합니다.** [SettingService.js:25](C:/CloudJira/moves-workforce/src/resolver/backoffice/setting/SettingService.js:25), [DictionaryCache.js:37](C:/CloudJira/moves-workforce/src/resolver/backoffice/DictionaryCache.js:37)입니다. 한 인스턴스에서 `INDIVIDUAL → LEVEL_BAND`로 전환해도, 이미 `INDIVIDUAL`을 캐싱한 다른 인스턴스는 `resolveSalaryPolicySafe()`를 통해 개인 급여를 계속 노출할 수 있습니다. 이는 단순 “수정했는데 안 보임”을 넘어 급여 표시 정책의 fail-close 경계를 깨뜨립니다. 정책 게이트 조회는 fresh read로 분리하거나, 전 인스턴스에 적용되는 버전 기반 무효화가 필요합니다.

문제없음: 1(A-1), 2(A-8), 5(P1-7), 6(P1-9), 7(P1-14), 8(P1-4), 9(P1-3), 10(P1-8/P1-13). 특히 P1-9의 clip은 서버와 같은 `started.substring(0, 10)`의 inclusive 범위 조건이라 동치입니다. A-7의 role/level/skill/status/holiday/settings 쓰기 경로도 grep으로 대조했으며, 일반 CRUD·bulk·status 순서 저장·시드 경로의 무효화 누락은 없었습니다.

`git diff --check HEAD`는 통과했습니다. Jest는 샌드박스가 `%LOCALAPPDATA%\Temp\jest`의 haste-map 쓰기를 막아 `npm.cmd test -- --runInBand --no-cache`까지 실행 불가했습니다.
