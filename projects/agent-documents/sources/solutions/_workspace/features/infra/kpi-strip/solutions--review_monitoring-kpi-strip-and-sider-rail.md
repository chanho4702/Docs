# 검수 요청: 모니터링 KPI 스트립(목록·상세) + 사이드바 아이콘 레일 + 헤더 전역 검색 (2026-08-22)

## 범위 (FE만, BE 무변경)
- 신규 `src/components/StatCard/StatCard.tsx` — 공용 KPI 카드(`StatCard`) + CSS grid 나열(`StatCardRow`)
- 신규 `src/pages/monitoring/components/HostStatusKpiStrip.tsx` — 서버/네트워크 목록 상단 4장(전체/장애/경고/정상·기타), 데이터 = 목록 응답 `statusCounts`
- 신규 `src/pages/monitoring/host-group/HostGroupListKpiStrip.tsx` — 호스트 그룹 목록 상단 5장(그룹 수/전체 호스트/가용성/건강도/활성 알람), 데이터 = 목록 `total` + `useHomeSummary()`(홈 위젯과 단일 출처)
- 연결: `ServerMonitoring.tsx`, `NetworkMonitoring.tsx`, `HostGroupTableView.tsx`
- i18n: `monitoring_kpi.*` 7키 (kr/en)
- 사이드바: 접힘 = 폭 0 → **아이콘 레일 64px**. `useResizableSidebar.ts`에 `COLLAPSED_SIDER_WIDTH`·`useSiderCollapsed`(localStorage 영속, 키 `siderCollapsed`), `App.tsx`(`--sider-width`가 레일 폭 반영, `.isCollapsed` 클래스 제거), `SideNav.tsx`(`collapsedWidth`, 레일에선 `fav_icon.png` 마크만), `app-layout.scss`(zero-width visibility 해킹 제거, 그룹 제목→구분선, 아이콘 중앙 정렬)
- 테스트: `src/__tests__/MonitoringKpiStrips.test.tsx` 8건

## 의도
- 목록 3종이 "필터+표"뿐이라 밋밋 → 모집단 기준 숫자를 상단에. **페이지 단위 값(평균 CPU·트래픽 합)은 의도적으로 제외**(BE가 paged 기준으로 합산해 페이지 넘기면 숫자가 바뀜).
- 호스트 그룹 목록 API는 alerts/statusCounts를 기본값으로만 채움(HostService 주석) → 홈 summary 재사용.

## 불안한 지점 (여기를 봐 주세요)
1. **브라우저 렌더 미확인** — Chrome MCP가 localhost를 에러 페이지로만 띄워 스크린샷 0장. 정적(tsc/eslint)·jest·Vite 변환 200만 확인. 특히 사이드바 레일은 **실제로 봐야** 함: 아이콘 중앙 정렬(`padding-inline: calc(50% - 8px) !important`), 그룹 제목 구분선, 서브메뉴 popup 위치, 로고 마크 흰색 필터.
2. 사이드바 기본값이 **펼침**으로 바뀜(이전 `useState(true)`=접힘). 저장값 없을 때 기준. 의도적이나 이견 가능.
3. 모바일(isSmall) 진입 시 `setCollapsed(true)`가 localStorage에도 `true`를 써서 데스크톱 복귀 시 레일로 시작할 수 있음(경미).
4. `HostGroupListKpiStrip`이 `useHomeSummary` 폴링(HOME_SUMMARY_INTERVAL)을 호스트 그룹 목록에서도 돌림 — 홈과 캐시 공유라 추가 비용은 페이지 체류 중 주기 호출 1개.
5. `StatCardRow`의 `minmax(160px,1fr)` — 사이드바 펼침+1280px에서 5장이 2줄로 꺾일 수 있음(의도된 반응형이지만 보기 싫으면 `minCardWidth` 조정).

## 검증 / 미검증
- ✅ `tsc --noEmit`, eslint(--max-warnings 0), jest 신규 8 + licenseMenuLock 3
- ❌ 브라우저 시각 확인, 다크 모드에서 StatCard 보더/톤 색, 모바일 Drawer 회귀

---

## 2차 (같은 날) — 호스트 상세 헤더 KPI + 헤더 전역 검색

### 범위
**BE (`moveseye-be-spring`, ZM-79, 미커밋)**
- `GET /hosts/{hostid}/summary` — `HostSummaryResDto`: 사용률 4종(목록 getServers와 같은 fetchHostItemsMap 재사용 → 표와 숫자 일치), 최고 심각도 status, 활성 알람 total+심각도 분포, deviceType(DeviceTypeResolver), device_type 제외 태그, 그룹, 인터페이스 수/가용 수
- `GET /hosts/search?keyword=&limit=` — `HostSearchResDto`: 이름·IP 부분일치(대소문자 무시), 이름순, limit 상한 20. 포트에 키워드 질의가 없어 전체 host 1콜 후 메모리 필터(목록과 같은 비용, 실측 0.07~0.27초)
- 테스트 `HostSummaryTest` 4건 + 기존 `HostListPortTest` 9건 green. dev(5433·76대) 실호출로 목록 vs 요약 사용률 동일 확인(10695: 11.36/27.79)

**FE**
- `components/Dashboard/HostDetailKpiStrip.tsx` — `MonitoringDetailDashboard`(서버·네트워크 상세 공용) 동기화줄 아래에 StatCard 6장(CPU/메모리/디스크/트래픽/활성 알람(→문제 목록 `?hostId=` 링크)/인터페이스 가용) + 기기분류·그룹·태그 칩 줄. 테스트 3건
- `components/GlobalSearch/GlobalSearch.tsx` + scss, `constants/navSearchEntries.ts` — 헤더 브레드크럼 옆 검색 버튼, Ctrl+K/⌘K 팔레트. 화면(사이드바 평탄본 + `SETTINGS_ENTRIES`(export로 변경) + `page_guide.*.summary` 설명) / 호스트(2글자부터 250ms 디바운스) 두 섹션. 권한·관리자·라이선스 잠금은 사이드바와 같은 규칙. 테스트 6건
- i18n `host_summary.*`, `global_search.*`

### 불안한 지점
6. **`navSearchEntries.ts`는 사이드바의 수동 사본** — 메뉴를 옮기면 둘 다 고쳐야 한다(파일 상단에 경고). SideNav를 데이터 정의로 리팩터하는 게 정석이나 MobileSideNav까지 중복이라 이번엔 범위 밖.
7. 호스트 검색 결과의 상세 경로: `deviceType==="network"`만 네트워크 상세, 나머지(보안/DB/HW/미분류)는 서버 상세로 보냄. 상세 골격은 공용이라 열리지만 네트워크 전용 차트는 안 나온다.
8. `/hosts/search`는 매 호출 host.get 전체(76대) — 호스트 수천 대 환경에서는 캐시(Redis 30초)나 포트 keyword 질의가 필요.
9. 상세 KPI의 사용률 톤 임계(90/70)는 여기서 처음 정한 값 — 목록 `TableProgressBar`는 임계 색이 아예 없다(전부 같은 파란색). 후속으로 목록 진행바에도 같은 기준을 입히면 "장애 호스트가 왜 안 보이나"가 해소된다.
10. 🔴 역시 **브라우저 렌더 0장** — 특히 검색 모달 스타일(`.global-search__modal .ant-modal-content` 패딩 오버라이드)·헤더에서 검색 버튼 폭이 브레드크럼과 겹치지 않는지.
11. COLLAB 스위치가 `SOLO-CODEX`인 상태에서 BE를 수정·재기동했다(사용자 지시). 스위치 줄은 건드리지 않았다.

### 검증 / 미검증
- ✅ BE: compileJava, HostSummaryTest 4 + HostListPortTest 9, dev 실호출(summary·search)
- ✅ FE: tsc, eslint, jest 신규 17건(KPI 8 + 상세 3 + 검색 6)
- ❌ 브라우저, 다크 모드, 모바일 폭에서 검색 버튼 축약(`@media ≤991px`)
