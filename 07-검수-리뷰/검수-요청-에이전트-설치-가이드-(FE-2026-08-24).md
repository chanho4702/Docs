# 검수 요청 — 에이전트 설치 가이드 (FE, 2026-08-24)

- 설계 정본: `_workspace/designs/devdesign_agent-install-guide.md` (v1.1, §9에 구현 결과)
- 대상 레포: `moveseyee_fe` (BE 무수정 — 기존 EP 2개 재사용)
- 상태: **커밋 완료 — `5d88bb5` #ZM-113 (master, 미푸시)**. 작업 트리의 aws-gating 미커밋 변경과 분리하기 위해 공유 5파일은 헝크 선별 스테이징(외부 마커 0건 검증 후 커밋)

## 범위 (변경 파일)

**신규**
- `src/pages/zabbix-management/agent-install-guide/commandTemplates.ts` — 명령 생성 순수 로직(본체)
- `src/pages/zabbix-management/agent-install-guide/AgentInstallGuidePage.tsx` — 화면(4카드 세로 흐름)
- `src/components/CommandBlock/CommandBlock.tsx` — 멀티라인 명령 + 복사 버튼(공용)
- `src/hooks/useAgentGuideContext.ts` — `GET /home/system-status`에서 Zabbix 주소·버전 기본값
- `src/__tests__/agent-install-guide.test.ts` — 16건

**수정**
- `src/constants/routes.ts` — `PATH_ZABBIX_MANAGEMENT.agentInstallGuide` (`/zabbix-management/agent-install-guide`)
- `src/routes/routes.tsx` — 라우트(adminOnly) + import
- `src/pages/zabbix-management/host-management/HostTab.tsx` — 필터 버튼 슬롯에 가이드 진입 버튼
- `src/pages/zabbix-management/host-management/HostCreateResultStep.tsx` — agent unavailable 경고 Alert에 action 버튼
- `src/constants/page-guide.ts` — 도움말 엔트리
- `src/constants/queryKey.ts` — `AGENT_GUIDE_QUERY_KEY`(홈 30초 폴링 키와 분리)
- `src/locales/kr.json` / `en.json` — `agent_install_guide.*` + `zabbix_menu_hint.agent_install_guide` + `page_guide.agent_install_guide`

## 의도

새 서버 모니터링 온보딩(에이전트 설치)을 복붙 명령으로 안내. OS(RHEL/Ubuntu/Windows/macOS)×모드(온라인/폐쇄망) 선택 → 우리 Zabbix 서버 주소(`endpoint`)·버전(`detail`)이 박힌 명령 생성 → 호스트 등록 화면으로 연결. 폐쇄망은 다운로드 링크+반입 절차(A안, 셀프호스팅은 2차).

## 🔺 불안한 지점 (검수 포인트)

1. **URL 조립 규칙이 외부(Zabbix repo/CDN) 관례에 의존** — Linux는 서버 풀버전(`zabbix-agent2-7.0.6-release1.el9...rpm`, rpm release 번호는 `release1` 가정+디렉토리 폴백), Windows/macOS는 `{major}-latest` 별칭. 오늘 HEAD 실측으로 전 조합 닫았지만 Zabbix가 체계를 바꾸면 조용히 깨진다. 테스트가 URL 문자열을 고정하고 있으니 형태 변경 시 재실측 필요(테스트 주석에 명시).
2. **텍스트 입력의 query 커밋 방식** — App.tsx가 쿼리 navigate마다 페이지를 리마운트해서 입력값을 blur/Enter 시점에 query로 커밋한다. blur 리마운트로 포커스가 튀는 UX가 수용 가능한지 실사용 판단 필요. 감지값 비동기 도착은 `key` 리마운트 트릭으로 defaultValue 갱신 — 감지 도착 전에 타이핑 중이면 입력이 초기화되는 창(수 초)이 이론상 존재.
3. **sed 기반 conf 치환** — 기본 conf의 `Server=`/`ServerActive=`가 활성 라인이라는 전제. Hostname만 append 보강(`grep -q || tee -a`)을 넣었는데 Server 계열은 안 넣었다(기본 conf에서 항상 활성이라 판단). 재설치/커스텀 conf에선 어긋날 수 있음.
4. **macOS 절차는 실기기 검증 0** — arm64 pkg 경로·launchctl 서비스명은 공식 문서 기반.

## 검증됨

- 단위테스트 16/16 (URL·치환·플레이스홀더·전 조합 무결성)
- `npx tsc --noEmit` 클린, ESLint(변경 파일) 클린
- 전체 스위트 1098 pass / **1 fail = 선재 결함**(`AiAssistantPage.test.tsx` "mirrors a conversation created mid-turn into the URL" — MemoryRouter+AiAssistantPage만 임포트, 본 변경 파일과 접점 0. 미커밋 aws-gating 작업 트리에서도 재현)
- 패키지 URL 전 조합 HEAD 실측(Linux 10개 200 / CDN latest 별칭 리스팅 확인)
- `GET /home/system-status` 런타임 실측: `{type:"zabbix", status:"UP", detail:"7.0.6", endpoint:"https://dmove.co.kr"}` — 훅 가정과 일치
- Vite dev 모듈 변환 200 (:5173 HMR)

## 미검증

- **브라우저 렌더/동작 전반** (Chrome 확장 미연결) — OS 전환·복사 버튼·진입점 2곳 내비게이션·도움말 물음표
- 실서버 설치 완주(VM에서 생성 명령 그대로 실행 → 등록 → livecheck)
