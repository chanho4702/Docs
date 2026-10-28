# Project Worklog Queue — Frontend review report

## 결론

이번 RFC에서는 프런트엔드 소스·번역 변경이 필요하지 않습니다.

`static/ui/` 전체를 대상으로 `startProjectWorklogBatch`를 검색했으며 호출 지점은 없습니다. 따라서 enqueue 요청의 성공을 Worklog 집계 완료로 표시하거나, `appJobId`를 polling하는 기존 UI도 없습니다. 새 실행 버튼·polling·toast는 설계 범위 밖이므로 추가하지 않았습니다.

## 확인한 경계면 계약

`SchedulerController`는 `guardedDefine`으로 `startProjectWorklogBatch()`를 등록하고, `responseWrapper`는 service 반환값을 `content`로 감싸지 않고 최상위에 펼칩니다. 실제 Forge Bridge 응답은 아래와 같습니다.

```js
// 성공
{success: true, appJobId: string | null, queuedCount: number, accepted: true}

// 실패
{success: false, error: {name, code, message, cause}}
```

추후 UI를 추가할 때는 `result.content`가 아니라 최상위 `result.queuedCount`를 사용해야 합니다. `queuedCount > 0`은 **queue 등록 성공**일 뿐 집계 완료가 아니므로, 완료 toast로 표시해서는 안 됩니다. `queuedCount === 0`은 활성 프로젝트 없음으로 안내하고, `success === false`는 `result.error`로 오류를 표시합니다.

## 변경 범위

- `static/ui/src/`: 변경 없음
- `locales/kr/`, `locales/en/`: 변경 없음
- `npm run merge`: 번역 추가가 없어 실행하지 않음

## 검증

```powershell
Set-Location static/ui
npm test -- --runInBand `
  src/pages/projectDetail/calender/__test__/worklogDrop.test.js `
  src/pages/worklogExport/utils/__test__/worklogFilter.test.js `
  src/pages/worklogExport/utils/__test__/worklogXlsx.test.js
```

결과: 3 suites, 29 tests passed.

검토 범위의 resolver 호출자는 없으므로, enqueue/완료 상태 혼동에 대한 UI 회귀 테스트를 추가할 대상도 없습니다.
