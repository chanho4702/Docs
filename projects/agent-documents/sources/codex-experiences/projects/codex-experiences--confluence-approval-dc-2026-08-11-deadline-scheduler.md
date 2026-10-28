# Confluence Approval DC deadline scheduler 및 마감 임박 처리

## 구현

- C9 adapter에 `ExpirySweepScheduler`를 `@Named` lifecycle component로 추가했다.
- 고정 `JobId`/`JobRunnerKey`를 사용하고 `RUN_ONCE_PER_CLUSTER`로 `Schedule.forInterval(...)` job을 등록했다.
- 등록 전에는 같은 id의 job을 해제하고, plugin 종료 시 job과 runner를 모두 해제한다. 설정 저장 후에도 같은 재등록 경로를 호출한다.
- job은 domain의 `ApprovalWorkflowService.expireDueAll()`만 호출한다. 만료 건수가 있을 때만 소요 시간과 건수를 로그로 남기며, 예외는 로그 후 삼킨다.
- `dueSoon`은 AO에 저장하지 않고 REST 응답을 만들 때 `Instant now`를 받는 순수 함수로 계산했다.

## 검증

- `mvn -B -pl approval-confluence9 -am verify`가 `BUILD SUCCESS`였다.
- domain 21건, C9 15건의 단위 테스트가 통과했다.

## 교훈

- Data Center scheduler는 node별 실행을 피하기 위해 `RUN_ONCE_PER_CLUSTER`를 명시해야 한다.
- scheduler의 `scheduleJob`은 checked `SchedulerServiceException`을 선언하므로 lifecycle 등록 경로에서 예외를 포획해 Quick Reload나 다음 설정 저장 시 재시도할 수 있게 한다.
