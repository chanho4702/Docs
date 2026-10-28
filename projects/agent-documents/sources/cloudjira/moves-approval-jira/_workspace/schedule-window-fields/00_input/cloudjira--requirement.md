# schedule-window-fields — 승인된 일정·워크로그 작성 기간을 앱 전용 필드로

작성일: 2026-10-11. 근거: 사용자 결정(QUESTIONS Q91 답, 대화 2026-10-11).

## 1. 사용자 요구
- 승인 없이 Jira 에서 직접 바꾼 값을 앱이 자동으로 되돌리지 않는다. 대신 **공식 값을 사람이 못 바꾸는 곳**에 둔다.
- 방법: **앱 전용 읽기 전용 필드**(Forge `jira:customField`, `readOnly: true` — 앱만 app field value API 로 씀. 워크포스 `moves_RMS_projectId` 가 같은 방식이며 일반 이슈 PUT 은 "Field does not support update" 로 거부된 운영 기록이 있다).
- **이슈 작업 기한과 워크로그 작성 기한은 다른 개념**이다. 필드 두 묶음:
  1. 승인 시작일 / 승인 종료일 — 이슈의 승인된 작업 일정. 필드 변경 승인으로만 바뀐다.
  2. 워크로그 작성 시작 / 작성 종료 — 이 이슈에 시간을 적을 수 있는 기간. 관리자 또는 승인으로만 바뀐다.
- **세밀한 정책**: 전체 → 프로젝트 → 이슈 단계. 예: "3월 워크로그는 4월이 되면(또는 4월 N일 이후) 추가·수정·삭제 불가", 기간별·이슈별 예외.
- 승인 앱 안에서 동작. 워크포스는 워크포스 탭 작성 시 같은 작성 기간을 지키도록 통제 문서(`movesApproval.ctl`)로 기간 값을 받는 정도만.

## 2. 이미 있는 것 (겹치지 않게 재사용·정리)
- 정책 카탈로그 `src/domain/worklogPolicy/catalog.js`: pastDateMaxDays, futureDateAllowed, createWindowDays, editWindowDays, deleteWindowDays, periodAutoCloseDays, lockSubmittedPeriod, approvalUnit, timeZone… 정책 계층(사이트→프로젝트→이슈, 워크포스 rms.policy 잠금 병합).
- 기간 마감·재개방(`PeriodCloseService`, 두 단계 재개방 요구 Q137 — 새 입력 허용 / 수정까지 허용).
- 통제권 기간 창(`worklogDateWindow`, Start date 필드 매핑 `StartDateField`, `ctl.sf`) — **Jira 기본 Start date~Due date 기준**. 이것을 앱 필드 기준으로 바꾼다(필드 매핑·사이트마다 다른 id 문제도 사라짐).
- 필드 변경 승인(`src/resolver/fieldChange/*`, 규칙: 프로젝트×유형×필드, 적용 asUser + 옵션 asApp fallback Q90).

## 3. 설계가 답할 것
- 필드 정의(manifest 모듈, 타입 date, readOnly, 화면 배치 안내, JQL 이름), 값 쓰기 경로(app field value API, asApp 사유 — AGENTS 추가 문구), 실측 관문(모든 경로에서 사람이 못 바꾸는지, bulk edit·CSV import·자동화·REST).
- 필드 변경 승인이 앱 필드를 대상으로 할 때의 흐름(요청 → 승인 → 앱 필드 쓰기, Jira 기본 기한 동기화는 옵션), 기본 일정과 승인 일정 불일치 표시.
- 워크로그 작성 기간 결정 규칙: 앱 필드 값 + 정책 계층 + 기간 마감 + 승인 잠금이 어떻게 합쳐지는지 **우선순위 표와 예시 10개 이상**("3월 것 4월 수정 금지", 이슈 작성 기간이 비어 있을 때, 프로젝트는 허용인데 이슈가 막을 때 등).
- 기존 통제권 기간 창(Start date 기준)에서 앱 필드 기준으로의 전환·호환(이미 커밋된 코드 영향), 워크포스 ctl 계약 변경(작성 기간 실어 보내기).
- 관리 화면(전체·프로젝트·이슈별 설정, 이슈 패널에서 작성 기간 보기·변경 요청).
- 유휴 SQL 0 추가, 감사 기록(누가 언제 작성 기간·승인 일정을 바꿨나), 마이그레이션 번호(현재 마지막 v060).
- 문서는 **사람이 쓴 것처럼 쉬운 한국어**로. 결론·예시 먼저, 코드 이름은 부록.
