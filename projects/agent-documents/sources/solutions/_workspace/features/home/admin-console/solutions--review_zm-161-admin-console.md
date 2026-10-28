# 검수 요청 — ZM-161 설정 메뉴를 "관리 콘솔"로 분리(FE 전용)

- 요청: Claude · 2026-09-22 · 사용자 "설정에 탭이 너무 많은데 백오피스로 분리 … 같은 SPA 안에 … 자빅스 관리는 운영 메뉴라 사이드바에 남기고 설정 메뉴들만 분리"
- 검수 대상: FE `moveseyee_fe` 브랜치 **`ZM-161`**(워크트리 `C:/worktrees/zm-161-fe`, master `39ece8e` 기준). 커밋 **`d47c0a5`**(20파일, 2026-09-22 승인, master fast-forward 병합·미푸시)
- BE 변경 없음. 경로(`/setting/**`)·권한 축·BE 계약 전부 그대로다.

## 무엇이 바뀌었나(한 줄)
헤더 ⚙ 드롭다운에 12개가 한 줄로 쌓여 있던 것을 **개인 설정 2개 + "관리 콘솔" 1개**로 줄이고, `/setting/**`를 **자체 좌측 내비를 가진 별도 레이아웃**(같은 SPA)으로 열었다. 콘솔 홈(`/setting`)이 그룹별 카드로 설정 화면을 편다.

## 범위 (17파일: 수정 9 · 신규 8)
| 층 | 변경 |
|---|---|
| 정본 `constants/adminConsole.tsx` (신규) | `ADMIN_CONSOLE_GROUPS` 5그룹 12항목(내 계정 2 · 계정·접근 2 · 데이터 소스 3 · 운영 3 · APM 관리 2) + `isAdminConsoleEntryVisible`·`visibleAdminConsoleGroups`·`adminConsoleActiveKeys` |
| 내비 `layouts/app/settingsNavItems.tsx`·`SettingsSideNav.tsx`·`SettingsMobileSideNav.tsx` (신규) | 데스크톱 Sider·모바일 Drawer가 **같은 훅**으로 항목을 만든다. 고정 항목: "모니터링으로 돌아가기"(`/home`)·"관리 콘솔"(`/setting`) |
| 레이아웃 `layouts/settings/index.tsx` (신규) · `layouts/app/App.tsx` | `AppLayout`에 `nav?: "app" \| "settings"` prop. `settings`면 `SideNav`/`MobileSideNav` 대신 콘솔 내비. 접힘·폭 상태는 공유 |
| `layouts/app/SettingsMenu.tsx` | 드롭다운을 개인 항목 + 구분선 + "관리 콘솔"로. `SETTINGS_ENTRIES` export는 **평탄본으로 유지**(전역 검색·정적 테스트가 이 이름을 봄) + `groupLabelKey` 추가 |
| `routes/routes.tsx` | `/setting` 블록 레이아웃 `DashboardLayout` → `SettingsLayout`, `index` 라우트에 `AdminConsoleHome` |
| 홈 `pages/setting/AdminConsoleHome.tsx`·`admin-console-home.scss` (신규) | `SettingsHero` + 그룹별 카드. 색은 팔레트 CSS 변수만(다크 모드 규칙 별도 없음) |
| `components/GlobalSearch/GlobalSearch.tsx` | 설정 화면 검색 결과의 상위 이름을 "관리 콘솔 › {그룹}"으로 |
| i18n `kr.json`·`en.json` | `admin_console.*`(menu·eyebrow·title·desc·back_to_app·group.5) + `settings_menu_desc.admin_console` |
| 스타일 `app-layout.scss` | `.settings-nav__eyebrow`·`.settings-nav__back` |
| 테스트 `__tests__/AdminConsoleNav.test.tsx` (신규, 13건) | 정본↔평탄본 동일 집합·자빅스 관리 미포함·i18n 두 언어·경로→key 세그먼트 판정·노출 축(USER/ADMIN/APM view만/권한 응답 전)·SettingsSideNav 렌더(USER 크래시 없음·ADMIN 전부·선택 표시)·콘솔 홈 카드 |

## 의도 (선택한 설계 · 버린 대안)
- **URL을 바꾸지 않았다.** `/admin/**`으로 갈면 모델은 깨끗하지만 AI 서버 `moveseye-ai/.../docs/screens.json`(10경로)·`moveseye-docs` 안내 5편·FE 테스트 10파일이 `/setting/...`을 문자열로 물고 있어 세 저장소가 동시에 낡는다. 분리는 레이아웃·내비 층에서만.
- **별도 앱이 아니다.** 설치형이라 배포 산출물 하나가 더 늘고 쿠키·권한·라이선스 게이트·i18n을 두 번 유지해야 한다(사용자 결정).
- **자빅스 관리는 콘솔에 넣지 않았다.** 운영자가 관제 중에 드나드는 화면이라 사이드바 잔류(사용자 결정). 테스트가 `/zabbix-management` 접두어 항목이 콘솔에 없음을 고정.
- **개인 설정(마이 페이지·연결된 앱)도 콘솔 내비에 "내 계정" 그룹으로 들어간다.** 콘솔 = "메인 사이드바에 없는 모든 설정"이 경계. USER에게는 이 그룹만 보인다. 버린 것: 개인 설정만 `DashboardLayout`에 남기기 — 같은 `/setting/**` 아래서 레이아웃이 갈리면 마이 페이지에서 사이드바가 튄다.
- **APM 알람 규칙·SLO는 콘솔 목록에 남지만 경로가 `/application-monitoring/**`라 APM 레이아웃으로 열린다.** 콘솔은 진입점만 준다(현행과 동일). 축은 그대로 `permission: apm`(알람 규칙 `edit`·SLO `view`).
- **`SETTINGS_ENTRIES`를 없애지 않고 평탄본으로 유지**해 `apmRoutes`·`apmAdminGating`·`GlobalSearch` 테스트가 무수정으로 통과한다.
- ⚙ "관리 콘솔" 항목은 **콘솔에 보이는 관리 항목이 하나라도 있을 때**만 뜬다(관리자, 또는 APM 권한만 받은 USER).

## 색 체계 분리(사용자 요청 "원 페이지랑 조금 구분되는 색")
| 층 | 변경 |
|---|---|
| `constants/palette.ts` | `CONSOLE_NAV`(모드 무관, 딥 인디고-슬레이트 `#1C2140`, 선택 periwinkle `#8FA3FF`) + `TPalette.CONSOLE`(모드별 `accent`·`accentSoft`·`page`·`hero`: light `#4C5BD4`/`#F3F4FB`/`#1C2140`, dark `#8FA3FF`/`#0F1020`/`#151936`) + CSS 변수 `--console-*` 7개 주입 |
| `SettingsSideNav`·`SettingsMobileSideNav` | `NAV` → `CONSOLE_NAV` |
| `App.tsx` | 콘솔이면 `.app-layout.is-console` 훅 클래스 |
| `App.css` | `.content.is-settings` 바탕 `--surface-sunken` → `--console-page` |
| `settings-control-plane.scss` | `--control-accent(-soft)` → `--console-accent(-soft)`, 히어로 면·빛·아이콘·eyebrow teal → 인디고 |
| `app-layout.scss` | 콘솔 eyebrow 색·리사이즈 핸들 호버·⚙ "관리 콘솔" 아이콘에 콘솔 강조색 |

원칙: 관제 = teal(hue≈185), 콘솔 = 인디고(hue≈232). **명도·구조는 같게** 두고 색상축만 옮겨 "다른 앱"이 아니라 "같은 앱의 다른 영역"으로 읽히게 했다. 버튼·링크 같은 antd 브랜드 액션색(teal)은 그대로다 — 영역 표지는 사이드바·본문 바탕·카드 강조·히어로가 맡는다.

실측(computed style): 라이트 사이드바 `rgb(28,33,64)`·본문 `rgb(243,244,251)`·카드 아이콘 `rgb(76,91,212)` / 다크 본문 `rgb(15,16,32)`·아이콘 `rgb(143,163,255)` / `/home`은 사이드바 `rgb(15,46,51)`(teal) 그대로.

## 중점 확인 요청
1. **노출 축 정합** — `isAdminConsoleEntryVisible`(콘솔 내비·⚙·홈·검색)과 라우트 가드 `decidePageAccess`가 같은 결론인지. 특히 권한 응답 전(`permissions === undefined`)에 콘솔 내비가 APM 항목을 감추는 것(fail-closed)과 가드의 `wait`가 어긋나는 경우가 없는지.
2. **`AppLayout`의 `MobileNav` 컴포넌트 선택이 렌더마다 바뀌지 않는지** — `nav` prop이 라우트 트리로 고정되므로 같은 레이아웃 안에서 바뀔 일은 없지만, `/setting`↔`/home` 이동 시 레이아웃 자체가 교체되는 것을 확인.
3. **antd `type: "group"` 항목의 접힌 레일 동작** — `collapsed`일 때 그룹 `label: undefined`로 넘긴다. antd 5에서 빈 그룹 제목이 툴팁·빈 줄로 새지 않는지(메인 사이드바 `topGroupTitle`과 같은 기법이라 같은 결과일 것으로 봄, 실측은 펼친 상태만).
4. **`adminConsoleActiveKeys`의 다중 선택** — `/setting/report-management/apm`은 `report-management` 하나만 잡힌다. 같은 접두어를 공유하는 항목이 앞으로 추가될 때(`/setting/ai` vs `/setting/ai-monitor`) 세그먼트 판정이 유지되는지 테스트가 고정하고 있음.
5. **콘솔 홈의 `index` 라우트가 `PageWrapper` 없이 가드를 안 거치는 것이 맞는지** — 개인 항목이 항상 보이므로 로그인만 있으면 열리는 화면이 의도. 관리 항목은 홈 카드에서만 가려지고 실제 차단은 각 화면의 `adminOnly` 가드가 한다.

## 검증 결과
- `tsc --noEmit` 0 · eslint(변경 11파일) 0
- jest 7 suites 141 tests 통과: `AdminConsoleNav`(신규 13)·`apmAdminGating`·`apmRoutes`·`GlobalSearch`·`SideNavPermissions`·`zm157PageAccess`·`NetworkMapRouteMove`
- 헤드리스 Chrome 실측(dev BE :3000 + 워크트리 Vite :5174, admin): `/setting` 콘솔 내비 14항목·5그룹·카드 12 · `/setting/user-management`·`/setting/schedulers` 선택 표시 · `/setting/license/apply` → `license` 선택 · `/home`은 메인 사이드바 · ⚙ 드롭다운 `[My Page, Connected Apps, ---, Admin Console]`(콘솔 안에서는 Admin Console 선택 표시) · 모바일 420px 서랍 14항목
- 미실측: 접힌 레일(64px) 상태의 콘솔 내비, 한국어 로케일 렌더(키는 테스트가 두 언어 고정), 다크 모드 카드 색

## 코덱스 판정 기입란
(검수자 작성)
