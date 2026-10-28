# 워크로그 정책 계층 및 Workforce 연계 요구사항

## 목표

워크로그 정책을 사이트 전체에만 고정하지 않고 다음 범위에서 설정하고 상속할 수 있게 한다.

1. 사이트 기본 정책
2. Workforce에서 전달한 프로젝트 정책
3. Jira 프로젝트 override
4. Jira 이슈 override

각 하위 범위는 전체 정책을 복제하지 않고 필요한 필드만 override한다. 관리 화면과 워크로그 화면은 최종 적용값과 각 값의 출처를 함께 보여 준다.

## 정책 대상

- 과거 날짜 작성 허용 일수
- 미래 날짜 작성 허용 여부
- 일·주 최대 시간
- 기간 자동 마감과 제출 후 잠금
- 워크로그 생성·수정·삭제 허용 기간
- 위반 시 차단 또는 경고
- 엄격한 사전 승인 또는 사후 인증 방식
- 워크로그 이력 수집과 보관 정책

정책 키별로 `inherit`, 명시 값, Workforce 잠금 상태를 구분한다. 잠긴 값은 Jira에서 완화할 수 없고, 더 엄격한 로컬 값의 허용 여부는 설계에서 명확히 정한다.

## Workforce 계약

- Workforce 프로젝트 정책과 필요 시 이슈 정책은 서명된 versioned contract로 수신한다.
- 서명, 발행자, 대상 cloud/project/issue, revision, issuedAt/expiry를 검증한다.
- 마지막으로 검증된 정책을 로컬에 저장하고, 런타임 판정에서 Workforce property를 매번 직접 조회하지 않는다.
- 서명 실패·만료·대상 불일치는 적용하지 않고 관리자에게 상태와 해결 방법을 표시한다.
- 현재 Workforce의 실제 송신 구현과 public keyring은 검증되지 않았으므로, 계약·검증·fallback을 독립적으로 설계한다.

## 우선순위와 안전성

- 기본 우선순위: `site < Workforce project < Jira project < Jira issue`.
- Workforce가 잠근 키는 로컬 override보다 우선한다.
- 일부 키만 덮어쓰는 sparse override를 사용한다.
- 최종 정책 판정 결과에 source와 revision을 남겨 이후 감사가 가능해야 한다.
- 사용자가 워크로그를 작성·수정·삭제하기 전에 적용 제한과 이유를 알 수 있어야 한다.

## 비용·성능 제약

- 목록 행마다 Jira/Workforce entity property를 조회하지 않는다.
- 검증된 Workforce 정책은 SQL에 캐시하고 revision이 바뀔 때만 갱신한다.
- 프로젝트·이슈 override는 요청 단위로 batch 조회한다.
- 정책 해석은 워크로그 mutation, 승인 요청, 인증 판정 같은 경계에서 한 번만 수행한다.
- 새 scheduled trigger를 추가하지 않는다.
- 기존 five-minute/hourly 작업은 기능이 꺼졌거나 처리 대상이 없으면 저비용으로 즉시 종료한다.
- 현행 append-only 이력의 전체 설명 저장은 기본 비활성으로 유지한다.
- 운영 진단에서 처리 건수, Jira API 호출 수, SQL query 수, 스킵 사유를 확인할 수 있게 한다.

## 현재 코드와의 호환

- 기존 전역 설정은 사이트 기본값으로 그대로 해석한다.
- 기존 `approval_project_config.policy_json` 데이터는 Jira 프로젝트 override로 마이그레이션 없이 읽을 수 있어야 한다.
- 기존 엄격 사전 승인과 사후 인증 흐름을 모두 유지한다.
- resolver는 `guardedDefine`, `PermissionMap`, `CONTROLLER_REGISTRARS` 3종을 맞춘다.
- 조회 목록은 Jira issue browse 권한으로 다시 좁힌다.
- 서명 검증 전 entity property는 표시 외 판정에 사용하지 않는다.

## 산출물

- 구현 가능한 상세 설계와 변경 파일 목록
- 정책 merge 및 잠금 규칙
- 저장 구조와 Workforce 계약
- resolver/API와 관리자·이슈 UI 흐름
- 비용 상한과 failure mode
- 테스트 전략 및 단계별 구현 순서
