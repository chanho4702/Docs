# 독립 리뷰 결함 1·2·5·6 검증 및 수정

2026-10-14. claude-review.json의 result와 현재 코드를 대조했다. 네 결함 모두 실제 코드 경로로 확인되어 수정했다.

- **1 재조정 실패 전파**: 실패 행에서 break하지 않는다. 뒤의 행도 처리하며 실패 행까지 방문 cursor를 전진시킨다. 페이지 끝에서 cursor를 초기화해 다음 전체 순환에서 실패 행을 다시 시도한다. 한 영구 실패가 뒤 승인 건을 굶기지 않는다. 실패 시 complete는 false, pending은 true이며 실패 진단에는 id·허용 형식 error code만 반환한다. 사용자 원문·exception message는 버린다. 영구 실패를 자동 삭제하거나 영원히 제외하지 않는다. 원인 정정 후 재시도할 수 있어야 하기 때문이다. 실패한 해당 사용자의 월 문서는 기존 게시 fail-close 원칙으로 미게시될 수 있지만 다른 사람의 뒤 행은 처리된다.
- **2 소명 승인 대상 불일치**: 소명은 현재 3h 관찰 snapshot을 승인 대상으로 저장하지 않는다. 원래 승인 cert.batchId에 연결된 immutable 요청 snapshot을 조회하고 approvalModel=1·원래 verified fingerprint·작성자·이슈·cert fingerprint를 대조한 뒤 2h baseline을 승인 원장과 content_hash에 싣는다. 현재 3h는 observation 필드로만 저장한다. 소명 결정은 별도 인증 batch를 생성하지 않고 기존 시간·batch를 보존한다. 이전 코드가 이미 접수한 잘못된 소명은 beforeDecide에서 baseline을 다시 대조하고 CONTENT_CHANGED로 만료한다. 변경 내용의 APPROVED 원장이 새로 생기지 않는다.
- **5 구 인증 덮어쓰기**: 요청 서비스도 worklog_cert의 CERTIFIED·MISMATCH를 잠금 근거로 사용한다. 수동/자동 새 일반 승인을 받지 않는다. 이미 잘못 생성된 pending 요청은 결정 직전에 기존 인증을 대조하여 만료한다. 투영에도 보호를 두어 이미 존재하는 다른 CERTIFIED·MISMATCH row를 archive/recertify하지 않는다. 구 직접 인증은 새 승인으로 승격되지 않는다. 소명은 원래 model=1 승인 snapshot이 검증되는 경우만 가능하다.
- **6 잘못된 마감 문구**: get의 lockReason은 PeriodLockService reasonCode를 그대로 반환한다. 자동 접수의 마감은 CLOSED이며, PERIOD_SUBMITTED/PERIOD_APPROVED는 LOCKED + 실제 lockReason이다.

팀 자동 접수 담당 요청에 따라 requestAutomatically의 upperLeadsOf 호출에 `{automatic:true}`만 추가했다. TeamScope/org 구현 파일은 변경하지 않았다.

변경 파일:

1. src/resolver/worklogCertification/WorklogRequestService.js
2. src/resolver/worklogCertification/ApprovalCertificationProjection.js
3. src/resolver/approval/target/WorklogCertificationTargetAdapter.js
4. src/resolver/worklogCertification/__test__/WorklogRequestService.test.js
5. src/resolver/worklogCertification/__test__/ApprovalCertificationProjection.test.js
6. src/resolver/worklogCertification/__test__/WorklogCertification.test.js

새 테이블·migration·audit 행 수정·기존 승인 자료 변경은 없다. 새 소명 접수의 observation은 started/seconds/fingerprint/sourceUpdatedAt만 포함하며 워크로그 설명 원문을 복제하지 않는다. 실패 진단은 reconciliation 반환 요약이며 새 append-only 감사 테이블을 만들거나 운영 알림 UI를 구현했다고 주장하지 않는다.

최종 검증 명령:

```text
npm test -- --runInBand src/resolver/worklogCertification/__test__ src/resolver/workforce/__test__/WorkforcePublisher.test.js src/resolver/worklogControl/__test__/WorklogControlWorker.test.js src/resolver/fieldChange/__test__/moduleCycle.test.js src/trigger/__test__/idleSqlBudget.test.js
```

3 suites / 51 tests 회귀 검사 및 최종 8 suites / 151 tests 확장 검사 모두 통과했다. 빌드·커밋·배포는 root가 전체 에이전트 종료 후 진행한다.
