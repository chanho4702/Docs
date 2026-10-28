# KVS 잔여 기능 감사 기록

기준: 2026-08-26

## P1 — 공휴일 목록이 100건을 넘으면 일정·분석 계산에서 누락됨

- `getPublicHolidayListService()`와 관리 화면용 fresh 조회는 `findByField('by-date')` 결과만 사용한다(`src/resolver/backoffice/publicHoliday/PublicHolidayService.js:38-75`). 공통 helper의 기본 limit은 100이며 커서를 소비하지 않는다.
- 이 목록은 일정·가동률·진척도·리포트 배치의 작업일 계산에 공통 입력으로 쓰인다. 여러 국가/연도 데이터를 누적하면 101번째 이후 공휴일이 오류 없이 빠져 MD/MM과 가동률 계산이 틀어진다.

권장 수정: 날짜 인덱스의 paged 조회를 적용하고, 전량이 필요한 모든 소비 경로가 같은 상한과 `truncated` 처리 정책을 공유하도록 한다.

## P1 — 대용량 사용자 업로드 job의 실패 항목 조회·정리가 100건에서 멈춤

- `getFailListService`, `getJobBatchService`는 job ID 기준 `findByWhere()`를 그대로 반환하고, `removeFailJobListService`, `removeJobBatchService`도 같은 결과만 삭제한다(`src/resolver/utils/job/JobService.js:32-91`).
- job 하나에서 100개보다 많은 행이 실패하거나 batch가 생성되면 뒤의 행은 UI에 표시되지 않고 삭제도 되지 않는다. 실패 재시도/정리 이후에도 KVS에 잔재가 남아 이후 운영 진단을 왜곡하고 저장 공간을 누적한다.

권장 수정: job별 최대 실패/배치 건수를 명시하고 `findByWherePaged()`로 조회·삭제를 끝까지 수행한다. 상한을 둘 경우에는 목록과 정리에서 동일 상한 및 명시적 `truncated` 신호를 사용한다.
