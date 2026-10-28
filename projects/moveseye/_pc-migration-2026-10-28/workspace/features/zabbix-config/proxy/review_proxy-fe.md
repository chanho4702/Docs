# 검수 요청 — 프록시·프록시 그룹 관리 FE (2026-10-28)

- 워크트리 `C:\worktrees\zbx-proxy-fe`(브랜치 `zabbix-proxy`, master `edf667c` 기준, **미커밋**)
- 계약 `_workspace/features/zabbix-config/proxy/contract_proxy.md` · BE 검수 `review_proxy-be.md`(2차 승인)

## 범위

| 구분 | 파일 |
|---|---|
| 화면 | `pages/zabbix-management/proxy/ProxyManagementPage.tsx`(탭) · `ProxyTab.tsx` · `ProxyFormDrawer.tsx` · `ProxyGroupTab.tsx` · `ProxyGroupFormDrawer.tsx` · `proxyErrors.ts` |
| 데이터 | `types/zabbix-proxy.ts` · `services/zabbix-proxy.api.ts` · `hooks/useZabbixProxy.ts` · `constants/queryKey.ts`(PROXY_QUERY_KEY) |
| 연결 | `constants/routes.ts`(proxyManagement) · `routes/routes.tsx` · `layouts/app/SideNav.tsx`·`MobileSideNav.tsx`(Zabbix 관리 › 시스템 그룹) · `constants/breadcrumbSegments.ts` · `navSearchEntries.ts` · `page-guide.ts` · `enums/common.ts`(PROXY_MODE·PROXY_GROUP_ID) · `locales/kr.json`·`en.json`(proxy_management·zabbix_menu_hint·page_guide) |
| 테스트 | `__tests__/ProxyManagement.test.tsx`(16) |

## 의도

- 목록은 BE가 전체를 주므로 화면에서 거른다(모드·상태·그룹·검색, URL 쿼리 — 리마운트 대비). `showPagination={false}`(스크립트 탭과 같은 방식).
- 폼은 열 때 한 번만 채운다(상세 재조회가 편집 중 값·PSK 입력을 덮지 않게 — Web 시나리오 FE 반려 교훈). 다른 프록시의 상세가 남아 있으면 채우지도 저장하지도 않는다.
- 🔴 모드 전환 시 암호화 방식을 새 모드 쪽으로 옮긴다(`carryTlsAcrossModes`) — 옮기지 않으면 새 모드 쪽 기본값("없음")으로 저장돼 암호화가 조용히 꺼진다(BE 1차 검수 🔴과 같은 문제를 화면에서도 막음, BE는 `PROXY_TLS_REQUIRED`로 생략을 거부).
- PSK: 지금 PSK를 쓰는 중이면 "비우면 유지"(모드를 바꿔도 결과가 PSK면 Zabbix가 유지 — 실측), 없는데 켜면 식별자·값 필수(클라이언트 검증 + BE `PROXY_PSK_REQUIRED`).
- 사용자 지정 타임아웃을 켜면 빈 칸을 전역 값으로 채운다(Zabbix가 10개 전부 요구).
- 삭제: 호스트가 있는 프록시·프록시나 호스트가 있는 그룹은 버튼을 막고 이유를 툴팁으로. 디스커버리 규칙·액션 조건은 목록에 없으므로 BE `PROXY_IN_USE` 메시지(이름 포함)를 그대로 보여 준다.
- 버린 대안: 프록시 상세를 별도 페이지로 — Zabbix 관리의 다른 폼과 같게 `ResizableDrawer`. 그룹 폼에서 소속 프록시 편집 — BE·Zabbix 모두 프록시 쪽 필드라 다건 수정·부분 실패가 생긴다.

## 중점 확인 요청

1. `ProxyFormDrawer` — 모드 전환(`onValuesChange` + `carryTlsAcrossModes`)·PSK 필수 판정(`pskKeepable`)·`valuesToRequest`가 계약 §3과 BE 정규화에 맞는지. 특히 수정에서 화면과 다른 값을 보내는 경로, 반대로 BE가 거부할 값을 보내는 경로.
2. 폼 채움 규칙(`filledFor`) — 생성↔수정 전환, 다른 프록시로 바로 다시 열기, 닫았다 열기에서 이전 값이 남는지.
3. `Form` `disabled={!detailReady}`와 탭 `forceRender` — 숨은 탭의 검증 실패 시 해당 탭으로 옮기는지(`handleFailed`).
4. 화면 거름 필터의 URL 키(`proxyMode`·`proxyGroupId`·`status`)가 탭 전환 시 정리되는지, 그룹 필터 "그룹 없음"(값 "0").
5. 무효화 범위 — 프록시·그룹 변경이 서로의 목록과 호스트 등록 폼의 프록시 선택지(`HOST_MANAGE_QUERY_KEY.PROXIES`)까지 다시 읽는지.
6. i18n — kr/en 키 일치(스크립트로 확인함), 문구가 계약·실측과 어긋나는 곳.

## 검증 현황

- 통과: `ProxyManagement.test.tsx` 16건, 관련 회귀(AdminConsoleNav·SideNavPermissions·PageHeaderDescription·zm157PageAccess·WebScenarioManagement) 77건, `tsc --noEmit`, `typecheck:contract`, eslint(새 파일).
- 미실시: 브라우저 실화면 확인(BE 재기동 후 런타임 실측 때 함께), 그룹 폼 저장 경로의 테스트(목록 삭제 차단만 있음).

## 검수 결과

### 1차(gpt-6.1-sol high) — 반려 · 원문 `_workspace/_archive/features/zabbix-config/proxy/review_proxy-fe_codex.md`

- [x] 🔴 다시 열 때 옛 캐시로 채우고 최신 상세를 무시 → 상세 훅을 `staleTime 0`·`refetchOnMount always`로 열 때마다 새로 받고, **받는 중에는 채우지도 저장하지도 않는다**(`detailReady`에 `!isFetching`). 그룹 폼도 같게. 테스트 "waits for this open's fresh detail…".
- [x] 🔴 생성 화면에 이전 입력·PSK가 남음 → 채우기 전에 항상 `form.resetFields()`(생성·수정 모두, 그룹 폼도). 테스트 "a new create starts empty…".
- [x] 🟡 수정에서 비운 포트·지연·최소 온라인이 빠져 옛 값 유지 → `valuesToRequest(v, isEdit)` — 수정은 빈 값을 그대로(BE·Zabbix가 거부), 생성은 생략. 테스트 "clearing the port on edit…".
- [x] 🟡 모드 왕복 시 다중 선택 손실 → 모드별 마지막 선택을 기억(`tlsByMode`)했다가 돌아오면 되돌림, 처음 가는 모드만 옮겨 담음. 테스트 "a mode round trip restores…".
- FE 테스트 16→20건 통과, tsc·eslint 통과.
