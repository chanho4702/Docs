# 캘린더 겹침 분석 및 다크 사이드바 수정 (2026-09-22)

- FullCalendar.css:263의 event-harness margin-top:0 !important가 dayGrid의 placement.marginTop을 무효화한다.
- 설치된 FullCalendar global bundle + 실제 앱 CSS + 합성 다일 이슈/단일 개인 일정으로 Chromium 재현.
- 월간 필요 간격 23px, 주간 29px가 모두 0px로 계산되어 겹침. 규칙만 제거한 비교에서는 두 뷰 모두 겹치지 않음.
- 캘린더 제품 코드는 분석 요청 범위에 따라 수정하지 않음. 증거: _workspace/calendar-overlap-review/results.json 및 PNG.
- sidebar.css만 수정: 다크 모드 surface-raised + border-bold. 라이트 배경 유지. 실제 설치된 Atlaskit 테마와 CSS로 합성 화면 검증.
- 프론트 114 suites / 1822 tests / 1 snapshot 통과, CI=true build 및 bundle budget 통과. backend 소스 불변으로 이전 116 suites / 1580 tests 결과 재사용.
- Forge lint exit 0. 실제 Jira 설치 화면/배포는 미검증.
- 프로젝트 스킬 UX는 사용자와 협의 전 수정 금지. 현재 신규 생성 시 미노출, 수정 화면에서 별도 저장. 검색/선택 분리와 통합 저장은 제안 단계.
- 전체 출시 전 감사는 아직 완료되지 않음.

- 후속 요청: Sidebar.jsx에 지정된 Moves-Workforce-Dark.svg를 연결. 공용 useColorMode로 다크/라이트 전환 감지. 펼침+다크에만 적용하며 접힌 아이콘은 기존 로고 유지. 프론트 114 suites / 1822 tests 통과.
