---
name: home-landing-page
description: "홈(랜딩) 페이지 — 2026-07-20 설계+BE+FE+정적QA 완료(미커밋, ZM-87). E2E는 :3000 스테일 빌드 블로커로 부분 완료 — 재기동 후 재검증 필요"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6ed4717f-0c0a-490a-9fef-8e2ca9cf913f
  modified: 2026-07-20T02:06:53.196Z
---

2026-07-20 홈(랜딩) 페이지 신설 — 설계·구현·정적QA 완료, 런타임 E2E 부분 완료. 산출물: `_workspace/devdesign_home.md`·`features/home/home-widgets/contract_home.md`·`qa_home.md`·`e2e_home.md`. **미커밋**(BE·FE 모두 ZM-87).

**확정 설계:** 5개 섹션(KPI 밴드 / 현재 알람 top-5 / 호스트그룹 상태 / 맵 요약 / 최근 리포트) + 통합 `GET /home/summary`(Redis `HOME_SUMMARY:{userId}` 60초 캐시, 부분 실패 시 필드 null) + 랜딩 `/`→`/home` 전환(SignIn 리다이렉트 포함). `recentReports`는 비관리자 **null**(FE 카드 미노출), 관리자 0건 `[]`(카드+empty). 조회 전용이라 Flyway 신규 없음.

**BE(ZM-87):** `home/` 패키지(HomeController·HomeService·HomeSummaryDto), 공용화 리팩터링 — `HostService.computeInfraKpi`, `AdminAccessChecker.isAdmin`(throw 없는 판정), `ReportManagementService.getRecentReports`. 빌드·테스트 그린. **선행 조치로 BE ZM-87에 origin/develop ff-병합**(ZM-69 포함, V11까지 — 이전 ZM-87은 master 기준이라 호스트 등록분 미포함이었음).

**FE(ZM-87):** `pages/home/` 6컴포넌트, `home.api`·`useHome`(요약 refetch 60초)·`HOME_QUERY_KEY`, 알람/그룹 목록은 기존 EP 재사용(홈 전용 쿼리키). tsc·eslint·jest 460 통과.

**QA 교훈:**
- HIGH: i18n 루트 `home` 키 중복(플랫+객체) → `t("home")`이 키 문자열 반환, 전 화면 브레드크럼 회귀. **로케일에 신규 네임스페이스 추가 시 루트 키 충돌 전수 확인 필수.** 수정: 플랫 키 삭제+`t("home.title")`.
- E2E 블로커: `:3000`이 bootRun exploded classes 스테일 혼재(AssetSummaryDto.class 11일 전) → 신규 코드와 `NoSuchMethodError`(Error라 catch(Exception) 미포착) → 원시 500. **bootRun 장기 기동 서버는 코드 병합 후 clean build+재기동 필수.** 프로세스 kill이 권한 정책에 막혀 사용자 재기동 대기 상태.

**잔여:** ①:3000 재기동(clean build 후) → functional-qa 시나리오 1·3·7 재검증 ②브라우저 확장 연결 시 FE 런타임(랜딩 리다이렉트·렌더·브레드크럼 문자열·네비게이션·언어/다크모드) ③비admin recentReports 분기(실 Zabbix 일반계정 필요) ④커밋(BE·FE ZM-87, Co-Authored-By 금지 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--no-coauthored-by-trailer|no-coauthored-by-trailer]]) ⑤Zabbix superadmin 계정 블록 정황 점검(E2E 중 stale .env 폴백이 유발). 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--nav-restructure-2026-07-13|nav-restructure-2026-07-13]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--host-registration-feature|host-registration-feature]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--geo-maps-feature|geo-maps-feature]]
