# 검수 요청 — APM "장애 및 에러" 메뉴 FE (2026-10-08)

- 레포 `C:\solutions\moveseyee_fe`(master 작업 트리, 미커밋). diff 전문 `scratchpad/incidents-fe.diff`(3,000줄, 신규 파일 포함)
- 설계 정본 `_workspace/features/apm/alerts/apm-incidents-menu-20261008.md` §2.1. BE 짝 `review_apm-incidents-menu-be-20261008.md`(코덱스 3차 조건부 승인 → 주석 정정 반영)
- 구현은 `fe-engineer` 에이전트, 검수 요청서는 Claude.

## 1. BE 계약(확정)
- `GET /apm/alert-events` 권한 `apm.edit`→`apm.view`, `open?: boolean`(true면 열린 것만·**from/to 무시**), SQL 페이징·임의 offset 정확.
- `GET /apm/stuck-requests` `open=true`도 **from/to 무시**(의미 통일), 임의 offset 정확.

## 2. 변경 요약 (27 수정 + 신규 `pages/application-monitoring/incidents/`)
| 영역 | 변경 |
|---|---|
| 새 화면 | `incidents/ApmIncidentsPage.tsx` — 탭 `alerts`(기본)·`stuck`·`errors`, `?tab=` URL, `destroyInactiveTabPane`, `ApmEditRequired` 없음(라우트 가드 `apm.view`). 툴바: 에러 탭은 옛 `ApmErrorsPage` props 그대로(env·서비스 셀렉터), 알람·걸림 탭은 갱신 버튼만(서비스 필터는 탭 안 DSelect 하나). 서비스 목록은 에러 탭에서만 env로 좁힘. 탭 전환 시 `offset`·`open` 제거 |
| 탭 이동 | `ApmAlertEventsTab`·`ApmAlertStuckTab` → `incidents/tabs/`. 알람 탭: `canManage` 제거, "열린 것만" 스위치(URL `open`, 없으면 **켬**, 끄면 `open=0`), 켜면 스트립 숨김·제목/빈 상태 문구 분기·안내 문구. 걸림 탭: 기본 끔, 켜면 공용 안내 문구 `apm.incidents.open_only_hint` |
| 콘솔 | `ApmAlertRulesPage` 탭 `rules`·`zabbix`만, 툴바 항상 `hideTimeRange`. 🔴 옛 `?tab=events|stuck` 리다이렉트 `ApmAlertLegacyTabRedirect`는 **라우트 가드 바깥**(콘솔 라우트가 `permissionAxis="edit"`라 화면 안에서 하면 view 운영자가 가드에서 먼저 튕김) |
| 에러 분석 | `ApmErrorsPage` → `/incidents?tab=errors`로 쿼리·해시 유지 replace(옛 `tab`은 버림). `errors` 라우트는 PageWrapper+FeatureGate 안에 그대로(게이트 수 단언 유지) |
| 경로·상수 | `PATH_APPLICATION_MONITORING.incidents`, `apmIncidentsPath()`, `apmAlertEventsPath()`→새 주소. `APM_ALERT_TAB` 2값, `APM_INCIDENT_TAB`·ORDER·DEFAULT·`resolveApmIncidentTab`, `APM_LEGACY_ALERT_TAB_TO_INCIDENT`, `APM_ALERT_OPEN_PARAM` |
| 훅·타입 | `TApmAlertEventsParams.open?`; 🔴 `useApmAlertEvents` **쿼리 키에 `open` 누락**이었음 → 추가 |
| 내비 5곳 | SideNav·MobileSideNav(트레이스 다음, `WarningOutlined`), routes, navSearchEntries(`apm-errors`→`apm-incidents`, 15 유지), breadcrumbSegments, page-guide(탭 키 alerts/stuck/errors) |
| 홈 위젯 | `ApmAlertsWidget` "더보기" 권한 분기 제거 → 항상 알람 탭 |
| i18n | `apm.menu.incidents`·`apm.desc.incidents`·`apm.incidents.*`·`page_guide.apm_incidents*` 추가, `apm.alerts.tab.events/stuck` 제거, 알람 규칙 설명·`edit_required`·`stuck.note` 문구 정리. CRLF·키 순서 유지 |
| 테스트 | 신규 `incidents/__tests__/ApmIncidentsPage.test.tsx`(기본 탭·딥링크·열린 것만 기본 켬/끄면 open=0·콘솔 리다이렉트). 갱신 8종(`apmRoutes` SIDEBAR 9·SCREEN 18, `apmAdminGating` 18, `apmHelpContent`, `ApmAlertRulesPage`, `apmAggPagesWiring`, `ApmHomeWidgets`, `ApmOverviewPage`, `apmAlertHooks`) |

## 3. 검증
- `tsc --noEmit` 0 · `typecheck:contract` 통과 · 변경 파일 eslint 0
- 관련 jest 10파일 220 중 214 통과·6 실패 = **전부 기존**(apmRoutes 3 `useApmRefresh` QueryClient 없음, apmHelpContent 3 kr/en 불일치) — 이번 변경으로 늘거나 바뀐 것 없음
- 전체 jest(에이전트 실행, 다른 jest와 겹쳐 돌아 비정상 지연): 3,952 중 23 실패 = 기존 8 + 15(ApmCollectorTokensTab 4·ApmRumScreens 6·RetentionSettingForm 1·AiMonitorReceiveFlow 1·HostFormDrawer 1·zm157RealWiring 1·LicenseSettingsPages 1 — 이번 변경 파일 미사용, 타임아웃 의심). **Claude가 단독 재실행 중** — 결과는 §5.
- 브라우저 런타임 미검증.

## 4. 의견 요청
1. 🔴 콘솔 리다이렉트를 가드 바깥에 둔 것 — 보안상 문제 없는지(리다이렉트는 쿼리를 새 주소로 넘길 뿐 데이터 없음). 옛 `/application-monitoring/alert-rules?tab=events`(PATH_APM_LEGACY) → 콘솔 → incidents 2단 리다이렉트가 끊기지 않는지.
2. 알람 탭 "열린 것만" **기본 켬**(URL에 없으면 켬, 끄면 `open=0`)과 걸림 탭 **기본 끔**(`open=1`일 때만) — 같은 키 다른 기본값. 혼란 요소인지.
3. `useApmAlertEvents` 쿼리 키 `open` 누락 수정이 기존 무효화(`ALERT_EVENTS` 접두 매칭)에 영향 없는지.
4. 에러 탭 리다이렉트에서 옛 `tab` 쿼리를 버리는 처리.
5. 개요 "최근 알람" 카드 각주 문구("전체 이력을 보세요")를 "장애 및 에러"로 바꿀지.

## 5. 전체 jest 단독 재실행 결과
- Claude 재실행(코덱스 검수와 겹쳐 부하 상태): 3,952 중 22 실패 = 기존 8 + 5개 스위트 14건(zm157RealWiring·LicenseSettingsPages·HostFormDrawer·ApmCollectorTokensTab·ApmRumScreens), 실행 시간 206~890초로 비정상.
- **그 5개 스위트만 단독 재실행: 5 스위트 109건 전부 통과** → 부하 타임아웃이었음. 이번 변경의 실패 유발 **0**, 남는 실패는 master 기존 8건뿐.

## 6. 코덱스 1차 **조건부 승인**(`_codex.md`)
🔴1 걸림 탭 `open=1` 빈 상태 문구가 창 무시 계약과 모순 · 🔴2 `apmAlertEventsPath()`가 `open=0` 없이 기본 "열린 것만" 화면으로 보내 해소된 알람 링크가 목록에 없음 · 🔴3 비배수 `offset` 딥링크가 DmoveTable 페이지 번호(`floor(offset/limit)`)와 어긋나 행 겹침 · 🟡 권한 주석 2곳 정합 · §4 답: 가드 밖 리다이렉트 허용·기본값 차이 허용·쿼리 키 OK·`/errors` tab 제거 OK·각주 문구 변경보다 `open=0` 링크가 먼저.

## 7. 반영 (fe-engineer 2차)
| # | 반영 |
|---|---|
| 🔴1 | 걸림 탭 `open=1`이면 `apm.incidents.empty_stuck_open`("지금 걸려 있는 요청이 없습니다"), 아니면 기존 `apm.alerts.stuck.empty`. kr/en 추가 |
| 🔴2 | `apmAlertEventsPath()` → `?tab=alerts&open=0[&serviceUid=]`. 개요 최근 알람 개별 행·전체 보기·홈 위젯 더보기 모두 이 헬퍼(홈 위젯 목록도 창 안 발화라 이력이 맞다고 판단). 메뉴 진입 `/incidents`만 기본 켬 |
| 🔴3 | 신규 `hooks/useAlignedPagination.ts` — URL offset을 `floor(offset/limit)*limit`로 내려 **첫 렌더 요청부터** 정렬값 사용, URL은 effect에서 replace, 0이면 키 삭제, 음수·비숫자 0. 두 탭 공용 |
| 🟡 | `ApmAlertRulesPage`(가드도 edit 축, `ApmEditRequired`는 방어선)·`useApmAlerts`(훅별 축: 규칙·미리보기·Zabbix edit / 이벤트·걸림·서비스별 적용 규칙 view) 주석 정리 |
| 테스트 | incidents 테스트에 빈 상태 켬/끔·`offset=25&limit=20`→20(두 탭)·경계값 유지·5→키 삭제·정렬 함수·`apmAlertEventsPath`. ApmOverviewPage(해소 알람 행 `open=0`)·ApmHomeWidgets 기대값 갱신 |
| 미반영(범위 밖) | `/application-monitoring/alert-rules`부터의 2단 리다이렉트 전체 테스트·실제 Router URL 변경 검증 — 런타임 검증 성격, 후속 |

검증: tsc 0·contract 통과·eslint 0. 관련 jest는 에이전트 환경에서 메모리 부족으로 미완 → **Claude 단독 실행 결과는 §8**. diff `scratchpad/incidents-fe-r2.diff`.

## 9. 코덱스 2차 **승인**(`_codex2.md`, 2026-10-10)
🔴 없음. 🟡 후속 권장(미반영): 다음 페이지 전환(`offset=40`) 테스트·`limit` 변경 시 재정렬 테스트. 🟢 `open=0` 링크 3곳·메뉴 진입 기본 켬·홈 위젯 이력 판단·`useAlignedPagination` 무한 replace 없음·주석 정합 확인.

## 8. 관련 jest 단독 실행(Claude, 2026-10-10)
- 🔴 **원인 규명**: 신규 `ApmIncidentsPage.test.tsx`의 "비배수 offset" 그룹이 **동기 무한 렌더 루프**로 영영 끝나지 않았다(에이전트 2회·Claude 4회 실행 전부 미완). 원인은 테스트의 `useQueryParams` mock이 렌더마다 새 `URLSearchParams`를 만들고, 공용 `DmoveTable`의 effect(`[onFilter, searchParams, hasQuery]`)가 `offset&limit`이 있을 때 `setTableParams`를 부르는 조합 — **제품 코드가 아니라 mock 산물**. mock을 참조 캐시(`mockSearchParamsFor`)로 수정.
- 수정 후 `ApmIncidentsPage.test.tsx` **32/32 통과**(17초).
- 나머지 관련 5개(ApmOverviewPage·apmRoutes·ApmAlertRulesPage·apmHelpContent·apmAdminGating): 142 중 136 통과·6 실패 = **전부 master 기존**(apmRoutes 서비스 상세 골격 3·apmHelpContent 3). ApmHomeWidgets 20/20·apmAlertHooks 8/8 별도 통과.
- 부수: 중단된 jest 실행의 고아 워커(26+4+2개, 4.2GB)가 메모리를 잡아 후속 실행을 막았음 — 전부 정리. 교훈: 백그라운드 jest가 중단되면 워커를 먼저 정리할 것.
