# 검증 기록

기준일: 2026-10-14. 로컬 소스 검증과 실제 사이트 검증을 구분한다.

## 자동 검증

| 검사 | 결과 |
|---|---|
| Approval backend 전체 | 190 suites / 2,855 tests 통과 |
| Workforce backend 전체 | 175 suites / 2,405 tests 통과 |
| Approval check:bundle | 실제 webpack 번들 require와 resolver·trigger export 로드 통과 |
| Approval UI 전체 | 92 suites / 816 tests 통과 |
| Workforce UI 전체 | 171 suites / 2,711 tests, snapshot 1개 통과 |
| 두 앱 UI production build·예산 | 빌드 통과. Workforce app 494,320 / 950,000 bytes, panel 331,583 / 350,000 bytes gzip 예산 통과 |
| Forge lint | Approval 0 issues. 신규 모듈/egress major upgrade 승인 후 이전 배포 성공. Workforce PermissionLinter Unknown product 경고 남음 |
| Approval 활성 UI bundle | 수동 3LO 조직 조회 resolver 이름·`api.atlassian.com/svc/jira` 문자열 없음 |

실행 로그는 `_workspace/worklog-approval-simplification/*-complete.log`에 보관한다. PowerShell의 stderr 포장인 NativeCommandError 문구만으로 실패를 판단하지 않고 프로세스 종료 코드와 Jest/build 최종 결과를 대조한다.

## 잠금과 감사 회귀

- 승인·마감·인증 잠금, 다른 기간으로 옮기기, 본인 소유자 확인.
- 생성 출처 검증과 자동/수동 요청, 자기 승인 방지, 팀장·이슈 열람 범위.
- 동시 결정 CAS, 재배달, 승인 투영 재시도와 실패 행 뒤 진행.
- 소명 snapshot의 원래 승인 기준 고정, 관찰 값 분리, 기존 인증 덮어쓰기 차단.
- 마감 확정 집계와 외부 변경/삭제 보존, 서명·현재 이슈 열람 범위.
- 보호된 승인 원장/인증 근거 보관과 export·purge 분리.
- HTTP 0/400/401/429/500을 차단 성공으로 오인하지 않는 진단 7개 회귀.

## 독립 검토

실제 Claude CLI의 Read/Grep/Glob 읽기 전용 검토를 수행했다. 코드 검토는 테스트 실행이나 Jira 실측이 아니다. 투영 재시도 정지, 소명 대상 불일치, 최초 작성자의 팀장 캐시 의존, 삭제 확정분 집계 소실, 구 인증 덮어쓰기, 잠금 사유 혼동 6건을 소스와 대조하여 보완했다. 검토 원문과 보완 보고는 작업 폴더의 `claude-review.json`, `08_backend_review_fixes.md`에 있다.

영구 실패 행은 자동 삭제하거나 숨기지 않으며 다음 순환에서 재시도한다. 실패한 사용자의 월 인증 문서는 불완전한 승인 데이터를 게시하지 않도록 계속 차단할 수 있다. 다른 행이 그 실패 때문에 정지하지 않는 것을 검증했다.

## 브라우저 검증 범위

실제 React·Atlaskit 컴포넌트를 사용하는 로컬 fixture와 Chromium으로 320/480/1280px 화면을 검사한다. API와 Forge bridge는 mock이다. 이 검사는 가독성·모달 호출·입력·버튼 상태·프론트 오류를 확인하며 Jira iframe이나 실제 저장을 증명하지 않는다. 최종 편집기·반응형 보완 후 결과는 아래에 추가한다.

아키텍처 HTML과 처리 흐름 HTML은 standalone artifact다. 자동 visual-check는 1440×900, 1600×1000, 1920×1080, 2048×1320에서 통과했다. 별도로 생성 이미지를 열어 양 끝 크기와 밝은/어두운 테마의 글자·연결선을 확인했다. 자동 receipt의 visualReview pending 표시는 수동 검토를 자동 완료로 위조하지 않고 그대로 보존한다.

## 실제 사이트: 미검증

아래 항목은 완료로 표시하지 않는다.

- 실제 사이트에서 entity property 전용 설정 UI 표시와 수동 API URL·token 입력 제거를 확인했다.
- Workforce 앱 계정의 다른 작성자 조직 property 조회 권한.
- 권한 스킴 변경 후 일반 사용자 직접 Jira PUT·DELETE 차단.
- 승인 직후 큐 지연과 Workforce 집계 반영 시간, 실제 이슈 삭제 후 감사 조회.

실사이트 잠금 수용 시험은 [차단 검증 절차](cloudjira--LOCK_VERIFICATION.md)에 따른다.

최종 로컬 브라우저: 320/480/1280px × 5화면 총 15개에서 페이지 오류·문서 가로 넘침 없음. 작성 버튼의 모달 context, 소명 사유 필수·잠금 유지, 정책 일수 오류를 확인했다. 480px 편집기에서 설명과 2시간을 입력하고 createWorklog의 ADF doc·7200초 payload를 확인했다. 이 저장은 fixture이며 실제 Jira 저장은 아니다.

빌드 경고: Approval 의존 패키지의 누락 source map(Atlaskit·marklassian)과 Atlaskit CSS minimizer 경고, Workforce의 오래된 Browserslist 자료 안내가 남아 있다. 빌드는 성공했고 해당 경고를 오류 없는 결과로 숨기지 않는다.

## 개발 배포·등록 결과

2026-10-14, tom-chkim-dev.atlassian.net Jira 설치 업그레이드 완료:

| 앱 | 환경 | 배포 버전 | 설치 |
|---|---|---|---|
| Moves Approval | development | 4.6.0 | Up-to-date |
| Moves Workforce | moves-rms (DEV) | 8.0.0 | Upgrade complete |

과거 Approval custom scope 두 개와 Workforce 조직 scope는 development 환경에 등록했지만, Approval scope는 현재 manifest의 route와 연결되지 않는다. 등록된 custom scope는 삭제·개명할 수 없으므로 환경 metadata에만 남는다. 이전 Approval 배포본 4.2.0은 `api.atlassian.com` outbound 권한 때문에 Runs on Atlassian eligibility가 없었다. 수동 3LO 조직 조회·egress·Approval apiRoute를 제거한 4.6.0을 development에 배포했고 `forge eligibility`에서 Runs on Atlassian eligible을 확인했다. Jira 설치는 major version 4, Up-to-date다.

이전 4.2.0 검증에서는 실제 열린 Approval 개발 사이트 탭을 두 방식으로 선택했으나 Emulation.setFocusEmulationEnabled CDP timeout이 연속 발생했다. 당시 3LO 연결 화면과 일반 사용자 직접 PUT/DELETE 차단의 실사이트 증거는 수집하지 못했다. 사용자의 로그인 세션을 다른 자동화 수단으로 추출하거나 토큰을 대체하지 않았다.

4.3.0 배포 후 새 Chrome session에서 Approval `설정 → 워크포스 연동`을 열었다. 화면은 “워크포스 앱과 서명한 정보를 주고받아”라는 활성 경로를 표시했고 `조직 조회 API 연결`, API base URL, access token 입력은 0건이었다. 브라우저 console error도 0건이었다. 일반 사용자 직접 Jira PUT·DELETE 차단은 별도 권한 수용 시험이므로 이 확인에 포함하지 않는다.

CLI 증거: approval/workforce-deploy.log, approval/workforce-install-upgrade.log, approval/workforce-api-scopes-verified.log.
