# 최종 구현·검증

2026-10-06. 코드는 로컬에 반영했으며 배포·커밋·Marketplace 제출은 실행하지 않았다.

## 완료 범위

- 워크포스 manifest와 sidebar를 참조해 globalPage에 `layout: blank`, 업무함에 전체 viewport AppShell을 적용했다. 사이드 메뉴는 240px/접힘 56px, 메뉴와 본문은 각각 스크롤한다. 업무함 안 설정도 같은 화면 구조이며, 별도 adminPage는 기존 iframe의 자동 높이를 유지한다.
- 프로젝트의 워크로그 승인 필수 조건·허용 결재선·자동 기본 결재선 및 이슈 패널 선택을 연결했다. 승인 전에는 Jira 워크로그를 만들지 않으며 승인된 원본을 요청자 본인이 등록한다. 직접 resolver 호출에서도 승인 조건을 검사한다.
- 승인 상태와 등록 상태를 분리하고 모호한 POST 결과는 UNKNOWN으로 보존한다. 자동 재전송하지 않고 수동 대조를 지원한다.
- 설정 11개와 알림 화면을 lazy 로딩하고 정책 변경 후 캐시를 갱신한다. 관리자 판정은 invocation 안에서 공유하고 호출 간에 재확인한다. 승인 목록은 JOIN과 cursor로 건별 상세 조회를 피한다.
- 한영 가이드 14쌍, Markdown 31개를 준비했다. 제한 범위·워크포스 호환 기능/서명 키 준비·심사 시험 항목을 포함한다.

## 검사 결과

| 검사 | 결과 |
|---|---|
| 번역 merge | exit 0 |
| 전체 백엔드 | 91 suites / 1314 tests PASS, exit 0 |
| 전체 UI | 44 suites / 366 tests PASS, 실제 Jest 직렬 실행 exit 0 |
| Claude 보완 후 UI build | exit 0 |
| Markdown 언어 쌍·상대 링크·UTF-8 | 31개 / 14쌍 PASS |
| git diff --check | exit 0, CRLF 변환 안내만 있음 |

빌드의 Atlaskit analytics source map 누락 2건 및 react-select CSS minimizer calc 경고는 남아 있다. 빌드 실패는 아니며 의존성 업그레이드는 실행하지 않았다.

## 번들 측정

HTML에 포함된 초기 JS의 gzip 합계. lazy 청크와 CSS는 이 합계에 포함하지 않는다.

| 진입점 | 저장된 이전 빌드 | 최종 빌드 |
|---|---:|---:|
| 업무함 | 362142 bytes | 362754 bytes |
| 설정 | 430406 bytes | 177584 bytes |
| 이슈 | 199121 bytes | 201691 bytes |
| 워크로그 | 89578 bytes | 89772 bytes |

이전 값은 작업 시작 시 존재하던 빌드에서 캡처했으며 동일 소스의 최적화만 제거한 대조군이 아니다. 신규 사전승인 구현도 포함되어 있다. 시간·API 호출 비용 감소의 실측값으로 해석하지 않는다. 측정 파일은 `_workspace/sidebar-layout/bundle-before.json`, `bundle-after.json`이다.

## 화면 확인과 남은 실측

실제 AppShell JSX와 CSS를 정적 렌더하여 headless Chrome으로 1280px 다크 화면·480px 좁은 화면의 전체 높이/배치를 확인했다. 내용은 검증용 placeholder이며 실제 제품 데이터나 Marketplace 제출 스크린샷이 아니다. 좁은 화면 펼침과 listener 정리는 UI 테스트로 확인했다.

실제 Jira iframe 안의 조작·작성자 보존·POST property 원자성/GET expansion·SQL 마이그레이션과 인덱스·네트워크 장애 회복은 배포 후 시험해야 한다. 앱 밖 REST·자동화·다른 앱의 워크로그 등록은 전부 사전 차단하지 않는다. 전환은 validator와 규칙을 연결한 범위에서 제한하고 기존 PASS 예외를 문서에 고지했다. 워크포스 양쪽 호환 기능과 서명 키가 준비되어야 연동을 완료할 수 있다.

Forge lint 최종 실행은 exit 0, `No issues found`다. CLI 업데이트 안내만 남았으며 CLI 버전은 변경하지 않았다. Claude 첫 평가는 `05_claude_review.md`에 기록했고, P1과 P2 표시·고지 항목을 수정한 뒤 전체 검사를 다시 통과했다. 부분 DRAFT를 구분할 수 없는 승인 생성의 자동 재시도 제안은 안전하지 않아 fail-closed를 유지했다.

Claude 보완 후 읽기 전용 재검토 결과는 P0/P1/P2 잔여 결함 없음, 검토 대상 네 항목 모두 통과다. Flow principals 배열 순서 안정성은 실제 편집 저장에서 확인할 P3 수준의 실측 항목으로 남겼다.
