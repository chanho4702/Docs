# 전체 검수 백엔드 수정 결과

`.claude/skills/forge-backend-dev/SKILL.md`를 적용했고 기존 변경을 보존하며 resolver와 회귀 테스트만 수정했다. 빌드·배포·커밋은 수행하지 않았다.

## 수정

1. `RetentionRepository.findApprovers/findEvents`에서 UUID 문자열을 `UUID_TO_BIN(?)`로 변환하고, 부속 테이블 미준비 시 `STORAGE_NOT_READY`로 내보내기를 중단한다. 빈 ID 목록은 SQL을 호출하지 않는다.
2. `InboxService.listInbox`가 스캔 4회 예산으로 끝나면 가시 행이 limit 미만/0개여도 `hasMore: true`와 마지막 원본 스캔 커서를 유지한다. limit 이상 모았을 때는 마지막 반환 행의 커서를 사용해 초과 수집분이 다음 페이지에서 빠지지 않게 했다.
3. `ExpiryService`의 임박·독촉 알림 생성에 `notificationAllowed = shouldEmitNotifications` 주입 경계를 추가했다. 라이선스 비활성에서도 만료·정리는 계속한다.
4. approval 보관 삭제 가능 숫자와 실제 삭제 모두 `min(lastExport.cutoff, 현재 정책 cutoff)`로 좁힌다. 무기한이면 숫자는 0이고 삭제는 `RETENTION_EXPORT_REQUIRED`로 거절한다.
5. worklog history 보관 화면의 삭제 가능 숫자도 실제 삭제와 동일한 현재 정책 clamp를 사용한다.
6. `PinService.isRequired`의 정책 조회 실패를 빈 객체로 바꾸던 처리를 제거해 저장 장애가 PIN 필수 검사를 우회하지 못하게 했다.
7. 보관 내보내기에 TIMESHEET 제출 스냅샷을 순차 조회하여 포함했다. 요청 metadata, 단계 임계값·그룹, event ID를 추가했다.

## 응답 계약

기존 `{ cutoff, requests, approvers, events, nextCursor }` envelope는 유지한다. 확장한 필드는 다음과 같다.

```js
requests[i] = {
  // 기존 필드
  contentHash, revision, minimumApprovals, flowId, prevRequestId,
  // targetKind === 'TIMESHEET'에만 추가, findSubmission 결과 그대로
  timesheet: submissionOrNull,
};
approvers[i] = { /* 기존 필드 */ stepRequired, viaGroup };
events[i] = { /* 기존 필드 */ eventId };
```

transition/fieldChange/worklogCreate/worklogCertification의 기존 블록은 유지했다. TIMESHEET 스냅샷에는 TimesheetRepository가 반환하는 snapshot/기간/정책·위반 근거를 그대로 담는다. 프론트가 이 블록과 metadata를 실제 내보내기 파일에 보존하는 후속 작업이 필요하다.

## 검증

다음 6개 회귀 suite를 마지막 metadata 수정 뒤 다시 실행하여 **6 suites / 40 tests 통과**했다.

```text
npm.cmd test -- --runInBand --runTestsByPath
  src/resolver/retention/__test__/RetentionRepository.test.js
  src/resolver/retention/__test__/RetentionService.test.js
  src/resolver/inbox/__test__/InboxService.test.js
  src/resolver/approval/__test__/ExpiryService.test.js
  src/resolver/signature/__test__/PinService.test.js
  src/resolver/worklogHistory/__test__/WorklogHistoryRetentionService.test.js
```

PowerShell의 npm.ps1 실행 정책 때문에 `npm` 첫 실행은 실패했고 동일 작업을 `npm.cmd`로 완료했다. 프론트 변경 후 리더가 전체 필수 테스트·번들·lint를 수행한다.

## 잔존 설계와 제한

- PIN 동시 실패 횟수 유실, 스윕 첫 100건 후보 고갈, 24회 실패 페이지 영구 건너뜀은 설계 보고서에 기록했다.
- 보관 대상은 외부 적용 상태가 바뀌면 같은 cutoff에도 늘어날 수 있다. 내보낸 request ID 집합을 서버에 고정하지 않은 기존 계약은 남는다.
- 필드 변경 WAITING/FAILED/APPLYING 보관 보호와 PUT timeout 결과 대조는 별도 설계가 필요하다.
- fieldChange 공유 `findByRequestIds`의 출력에는 fieldType/appliedBy/applyCode/conflictValue 등 세부 근거가 모두 포함되지 않는다. 이번 수정에서는 형제 목록의 응답 계약을 넓히지 않았다.
- 기존 `pageExpired`의 준비 상태 실패 시 빈 페이지 반환, 타 대상의 저장소가 스냅샷 미준비를 null로 돌려주는 경계는 남는다. 승인자/이벤트의 silent 누락만 이번 범위에서 STORAGE_NOT_READY로 막았다.
- 신규 resolver·scope·모듈·마이그레이션은 없다.
