# Moves Workforce 개인 종합 분석

## 결정
- 인력 현황과 중복되는 전사 분석 탭 대신 기존 사이드 패널의 상세보기에서 개인 분석 페이지로 이동한다.
- 기간별 기록 시간·프로젝트 구성·원본 워크로그는 신규 전용 조회, 기본 프로필·스킬·프로젝트 경험은 기존 프로필을 재사용한다.
- SELF 마이페이지 API는 타인 조회로 확장하지 않는다. 대상 인원 TeamAnalyticsScope 및 scopedProjectIds 교집합을 서버에서 적용한다.
- 기존 profile의 load/inProgressIssues는 이번 분석과 범위가 달라 신규 페이지에서 소비하지 않는다. 프로젝트 경험에는 프로젝트 범위 필터를 보완한다.
- 워크로그 검색 후보는 timezone 경계를 위해 기간 양끝을 2일 넓히고, 최종 집계는 started에 보존된 날짜·작성자로 필터한다. 검색/워크로그 전체 pagination과 명시적 상한 오류를 사용한다.

## 검증 교훈
- TeamLeadFieldPolicy는 읽기 resolver에도 payload allowlist가 필요하다. PermissionMap 등록만으로는 날짜 입력이 보존되지 않는다.
- PowerShell에서 Python stdin으로 한글을 전달하면 기본 인코딩 때문에 문자열이 물음표로 저장될 수 있다. apply_patch UTF-8로 복구하고 원본/merge 생성본 및 실제 화면 문구까지 확인한다.
- 키 존재 테스트만으로 번역 손상을 검출하지 못한다. 이번에는 브라우저의 실제 한국어 상세보기 버튼 탐색이 손상을 드러냈다.
- CRA build는 출력 디렉토리를 먼저 청소한다. Custom UI index.html을 검사하는 forge lint는 build 완료 후 순차 실행한다.
- 실제 React 컴포넌트와 Forge 테스트 응답을 webpack fixture로 연결해 상세보기, 기간 변경, 프로젝트 필터, 이슈 링크, 오류/빈 결과/재시도/복귀를 확인했다. 실제 Jira 권한과 지연시간의 검증을 대체하지 않는다.

## 근거
- 작업 문서: C:/CloudJira/moves-workforce/_workspace/resource-person-analysis/
- [[projects/agent-documents/sources/codex-experiences/topics/codex-experiences--tanstack-query-cross-domain-invalidation|tanstack-query-cross-domain-invalidation]]
