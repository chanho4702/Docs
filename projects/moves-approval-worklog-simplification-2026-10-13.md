# 워크로그 건별 승인 단순화 — 2026-10-13

진행 중인 구현의 결정과 검증 경계를 기록한다. 배포 완료 기록은 아니다.

## 현재 선택

- 일반 이슈·상태·필드 승인은 코드를 보존하고 런타임과 UI에서 제외한다. 기존 WORKLOG_CERTIFICATION 승인 원장을 건별 승인에 재사용한다.
- 작성은 asUser를 유지한다. Jira 이슈는 Approval 패널, Workforce 앱 내부 작성은 정상 출처로 수용한다. 이전 asApp 작성 대안 문서는 현재 확정안으로 적용하지 않는다.
- 승인 원장이 먼저 잠금을 결정하고 인증·서명 게시물은 투영이다. 게시 실패가 사용자 수정권을 되살리면 안 된다.
- 공식 user/viewissue/search는 issueKey를 받으며 issueId는 명시된 파라미터가 아니다. 실제 이슈를 조회해 id/key를 대조하고 active=true인 후보만 인정한다. 조회 실패는 승인자 적격으로 해석하지 않는다.
- 정상 출처 enum은 APP/WORKFORCE/APP_CHANGED/WF_CHANGED다. 생성 출처만 검사하면 정상 경로 수정 건이 재접수·복구에서 누락될 수 있다.
- approved current request와 신규 인증 근거는 export 이후에도 보호한다. 파일 export가 모든 행의 용량 회수를 의미하지 않는다.
- 이슈 삭제 뒤 SQL 보존과 사용자 조회 가능성은 다르다. 일반 권한 필터와 승인 export에는 삭제 이슈가 제외될 수 있으며 worklog history의 마스킹 export와 별개다.
- 승인 후 외부 시간 증가를 감지하면 CHANGED 표시를 내고 기존 확정 시간만 집계한다. 현재 시간 증가분을 재승인 없이 인증하지 않는다.

## 검증 중 얻은 교훈

SQL CAS 결과를 무시하면 요청 원장과 인증 연결이 어긋난다. 이벤트 중복 때 기존 요청에 재연결하고, 결정 완료 상태이면 투영까지 재처리해야 한다. 소명은 원래 승인 기준을 바꾸는 신규 인증 경로로 사용하면 안 된다.

사용하지 않는 집계 KVS 캐시에 계속 쓰는 경로를 제거했다. 사용자·승인 상태를 재확인한 집계를 오래된 전체 합계로 대체하지 않는다.

전체 테스트와 번들 로드 검사는 다르다. Jest 통과 뒤에도 webpack 모듈 평가의 순환 초기화를 별도로 확인한다. 모든 병렬 에이전트 완료 전 앱 빌드는 금지한다.

## 설명 자료

저장소 `docs/worklog-approval/`에 설계·구현, 요구사항 대응표, 사용자·관리자 가이드, 공식 가격 기반 비용·용량 가정, 아키텍처·처리 흐름 HTML을 만든다. 실제 사이트 검증과 코드 테스트를 구분한다.

공식 근거: [Jira 사용자 검색](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/#api-rest-api-3-user-viewissue-search-get), [Forge pricing](https://developer.atlassian.com/platform/forge/forge-platform-pricing/).

[[moves-approval-jira-asapp-worklog-2026-10-11]] · [[moves-approval-jira-hardening-2026-10-10]]

## 2026-10-14 구현·배포 검증

- 승인/마감 보호 보완 bf55600: 실패 행 이후 재처리, 소명 원래 snapshot 고정, 구 인증 덮기 금지, 최초 작성자 서명 조직 조회. HTTP 통신/본문 오류를 차단 성공으로 계산하지 않는 진단 회귀 7개.
- 설명 ADF 보존 eaeb3be, 모바일 목록/마감0 안내 892247a, 조회 API/조직 연결 9ed6c26, 현행 egress 선언 3444c18. Workforce 삭제 확정 공수 8c3bb5d, 조직 API/공수 필드 b61c8fe.
- 전체 BE Approval 2865 / Workforce 2405, UI Approval 812(실패 fixture 수정 후 관련3suite 재실행) / Workforce 2711. 양 앱 build 통과, Approval check:bundle 통과, WF app/panel gzip 예산 통과.
- 실제 Chromium 15화면에서 JS 오류/가로 넘침 없음. 480px 편집기 ADF 저장 payload 확인. API는 fixture이므로 Jira 저장 증거로 취급하지 않음.
- custom scopes 등록 후 Approval development4.0.0, Workforce moves-rms8.0.0을 tom-chkim-dev Jira에 배포/설치 upgrade 완료. 이 사이트 WF Jira 설치 환경은 development가 아니라 moves-rms이므로 중복 설치 금지.
- 남은 외부 검증: 사이트 App REST APIs/3LO 인증 호출, 다른 사용자 org property 앱 권한, 일반 사용자 직접 PUT/DELETE 차단. 열린 브라우저의 CDP Emulation.setFocusEmulationEnabled가 연속 timeout하여 실제 화면 확인 불가.
- 교훈: UI 마감0 안내가 실제 OFF 의미와 어긋나 있었다. 로컬 날짜 fixture에 UTC toISOString을 쓰면 한국시간 오전 테스트에서 하루 차이가 난다. lazy editor 단위 테스트는 실제 준비 완료 시점을 모사해야 한다.
- 문서: docs/worklog-approval/README.md, LOCK_VERIFICATION.md, VALIDATION.md, API_INTEGRATION.md 및 설계/요구사항/가이드/비용/HTML 아키텍처.