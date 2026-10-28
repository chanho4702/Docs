---
type: project
tags: [moveseye, apm, install-guide, frontend, antd, drawer, i18n, lesson]
created: 2026-09-14
updated: 2026-09-16
status: done
---

# 2026-09-14~16 — APM 설치 가이드 확장 + FE 정비 묶음 (ZM-149 · ZM-122)

- 프로젝트: [[moveseye]] · APM 본 흐름은 [[2026-09-02-apm-p2-traces]] → [[2026-09-23-apm-p5-realtime]]
- 상태: ✅ 전부 커밋(미푸시). 설치 가이드 계열은 #ZM-122, 드로어·가독성은 #ZM-149.

사흘 동안 사용자 지적("구리다", "맥은 지원 안 해?", "경로 입력하면 명령이 바뀌게", "테이블 뭉개진 거")을 따라 작은 작업이 이어졌다. 개별로는 작지만 **"고객이 읽는 문자열의 규칙"**과 **"FE 진입점 5곳"**이라는 두 규칙이 여기서 확정됐다.

## 무엇을

| 날짜 | 작업 | 커밋 | 핵심 |
|---|---|---|---|
| 09-14 | **사이드 패널 공통화 `ResizableDrawer`** | FE `d1bfe31`·회귀 `1091b75` (#ZM-149) | 컴포넌트·훅 두 구현 → 정본 하나(`components/Drawer/ResizableDrawer.tsx`), 25곳 교체, 저장 키 `dmove:drawerw:`. 🔴 지운 scss를 상대경로로 import한 2파일이 Vite 오버레이로 앱 전체 불능 — tsc·eslint·jest 전부 통과했는데도 → [[static-checks-miss-asset-imports]] |
| 09-14 | 설치 가이드 탭 가독성 | FE `e0560cb`·`8e845b1` | 긴 한국어 안내는 `ApmGuideText`(문장 경계 줄바꿈·`**`/백틱 → strong/code), `CommandBlock` flex 열+`wrap`, 목차는 해시 링크 금지(리마운트) → `scrollIntoView` |
| 09-15 | **macOS 지원** | BE `e14bcc0`·FE `5823067` | `Os.MACOS`(별칭 mac·darwin·osx), LaunchDaemon plist·`launchctl bootstrap system`, 🔴 데몬은 root라 설정 600·큐 700. `QueueDir` 3필드 → 생성자 호출처 전부 |
| 09-15 | **설치 경로 입력 → 명령 재생성** | BE `e7aae83`·FE `99394f5` | `ApmInstallPaths` record 한 벌이 정본(`resolve`·파생 `binPath/configPath/agentJar`). 🔴 FE 문자열 치환 금지 — systemd ExecStart·plist·New-Service까지 파생이 있어 놓친다. FE는 500ms 디바운스 재조회(URL에 안 실음) |
| 09-15 | 카드 접기·출처 접힘·고객 문구 정리 | 같은 커밋 | `CollapsibleCard`(DOM 유지·localStorage). 고객 문자열에서 `(R1 실측)`·`§3.1`·`_workspace/…`·HTML 태그·내부 용어 제거 |
| 09-15 | 포트·충돌 가이드 + **프로세서 상세 옵션** | BE `301f901`·`2896c40`·FE `ab45574` | `attributesDrop/redactionPii/filterMetrics {useDefaults, extra}` → 생성기가 템플릿 목록 항목 줄만 교체(파서 안 씀·주석 보존). 기본 규칙은 `config-defaults.processors`로 내려줌 |
| 09-15 | APM 차트 카드 높이 정렬·표 열 균일화·메서드 필터 | FE(미커밋→후속 커밋) | `apm-pages.scss`(카드 height 100%·flex column) APM 라우트만. 표는 폭 전부 제거+`tableLayout="fixed"`+`scroll x:100%` |
| 09-16 | **스케줄러 표 뭉개짐** | FE `406f861` | 원인 = `tableLayout`·`scroll` 부재로 요약 문자열이 1,085px 차지, 폭 없는 '작업' 열이 55px로 눌려 세로 글자. 같은 처방. + 21개 작업 중 12개(APM 9·클라우드 3)가 라벨 없이 job_key로 뜨던 것 카탈로그 등록 |
| 09-16 | 🔴 **SLO 진입점 오판** | FE `3a09b33` → 테스트 정정 `2e1ae38` | 아래 교훈 |

## 결정과 이유

- **경로 파생은 BE가 한다.** 설치 명령은 OS별 서비스 정의(systemd·plist·New-Service)까지 경로를 파생하므로 FE 치환은 반드시 누락이 생긴다. FE는 입력만 받아 재조회.
- **기본 제외 + 추가 없음 = 프로세서 통째 제거.** 빈 `include`는 모든 지표를 폐기하므로 "빈 목록으로 남기기"가 더 위험하다. 기본 마스킹을 끄면 `X-Apm-Warning: masking-reduced`(raw-sql과 쉼표 합성)+WARN 로그+yaml 헤더 주석.
- **고객 문구 규칙**(사용자 "우리가 검증한 버전은 2.31.1입니다(R1 실측) 이런 거 있으면 안 돼" + "AI스러운 문구 빼라"): 내부 검수 번호·설계서 절·실측 표식·`_workspace` 경로·HTML 태그 금지, 관리자가 아는 말로. Swagger `@Schema`는 개발자용이라 유지.
- SLO 메뉴: 사용자 결정 **사이드바 유지 + ⚙ 진입점도 유지** → `apmRoutes.test.tsx` 정정, 설계서 S1 행 기록.

## 함정·교훈

- 🔴 **"메뉴에 없다"고 말하기 전에 진입점 5곳을 전부 grep한다** — 데스크톱 `SideNav`·`MobileSideNav`·헤더 ⚙ `SettingsMenu.SETTINGS_ENTRIES`·검색 `navSearchEntries.ts`·라우트. 09-16 SLO를 "주소로만 진입"이라 오판해(실은 ⚙ 설정 메뉴에 설계 확정) 사이드바에 중복 추가 → `apmRoutes.test.tsx` 2건 깨짐. 사용자가 "설정에 있지 않냐"고 하면 **사용자 말부터 검증**. 메뉴 커밋 전엔 그 테스트를 돌린다.
- 🔴 스케줄러 화면 이름은 i18n 키만으론 안 뜬다 — `SCHEDULER_JOB_CATALOG`에 항목이 있어야 `labelOf`가 찾는다. `SCHEDULER_SUCCESS_LOGGED_JOBS`는 BE `SchedulerRunLogPolicy.DEFAULTS`와 같은 집합이어야 한다(APM·클라우드 배치는 실패만 기록 — 넣으면 화면 안내가 거짓).
- 🔴 헤드리스로 관리자 전용 화면 URL 직접 진입은 404 — redux `userRole`이 채워지기 전에 가드가 튕긴다. 홈 먼저 띄우고 `pushState`+`popstate`. ⚠️ 실제 사용자도 저장 세션 없이 관리자 URL을 직접 열면 같은 404일 수 있음(범위 밖, 미수정).
- 🔴 옵션 DTO 필드 추가는 정식 생성자만 쓰는 규칙(P4 D1) 때문에 `new ApmCollectorConfigOptionsDto(` 호출처 main 2·test 20+를 전부 손봐야 컴파일된다.
- 🔴 Python 편집 스크립트를 heredoc으로 넘기면 `\\`가 접혀 자바 문자열 앵커가 안 맞고, 멱등 검사는 "new가 old를 접두로 포함"하는 앵커에서 블록이 두 번 들어간다(types/apm.ts 실제 발생). 스크립트는 파일로 쓰고 실행, 앵커는 new 텍스트에 다시 안 나오는 것으로.
- BE 테스트는 bootRun(`build/classes` 공유) 중이라 **격리 워크트리에서**. 런타임 실측은 `_tools/run_be_3000_dev.ps1`로 재기동 후(사용자 요청 시에만 — [[2026-09-17-zm157-permission-enforcement]] 09-16 "안 해도 됨" 피드백).
- 카드 접기 테스트는 describe `beforeEach`에서 `localStorage.clear()` 필수. 헤드리스 캡처 쿠키는 accessToken이 짧아 캡처 직전 재로그인.
- Chrome MCP 탭이 localhost/127.0.0.1/[::1]:5173 전부 거부(Vite가 [::1]만 바인딩) → 헤드리스 CDP 스크립트로 대체([[2026-09-02-network-map-archify]]).

## 관련
[[2026-09-15-apm-dashboards]](같은 날 위젯 대시보드) · [[static-checks-miss-asset-imports]] · 메모리 `apm-install-paths`·`apm-install-macos`·`apm-collector-config-processors`·`resizable-drawer-common`·`scheduler-table-layout`·`verify-all-nav-entry-points`
