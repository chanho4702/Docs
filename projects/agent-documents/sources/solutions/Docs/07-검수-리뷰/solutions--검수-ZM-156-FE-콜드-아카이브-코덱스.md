- R1 · 필수 · src/pages/setting/data-archive/archiveDisplay.ts:240 · 현재 BE의 다중 삭제 응답 `busy[]`를 무시하여 전 건 락 대기 실패도 “0개 삭제 완료”로 안내한다 · BE `ArchiveDeleteDto.Result`에는 `busy`가 있고 `ArchiveFileService.deleteAll()`이 락 획득 실패 ID를 여기에 넣지만, FE 타입·결과 안내·`ARCHIVE_BUSY` 오류 매핑에 모두 빠져 있다 · `busy[]` 타입과 재시도 안내를 추가하고 단건 `ARCHIVE_BUSY`도 전용 i18n 문구로 매핑한다.
- R2 · 권장 · src/pages/setting/data-archive/components/ArchiveDeleteModal.tsx:45 · 이상 없음 — 삭제는 확인 모달과 공백 제거된 필수 사유를 거쳐서만 호출된다 · 공백이면 확인 버튼이 비활성화되고, `handleConfirmDelete`가 `RUNNING` 등 삭제 불가 상태를 다시 걸러내며 성공 시 `invalidateLedger()`가 목록을 무효화하고 `rejected[]`도 별도 안내한다 · 수정 불필요.
- R3 · 권장 · src/services/archive.api.ts:86 · 이상 없음 — 다운로드의 blob 저장·JSON 오류 분기·취소·timeout 범위가 계약과 맞는다 · 파일명은 계약 §2.2가 지정한 목록 `fileName`을 사용하고, `ARCHIVE_FILE_REJECTED` 전용 문구가 있으며, 3분 timeout은 삭제 2건과 검사 1건에만 적용되고 공통 Axios 1분 기본값은 그대로다 · 수정 불필요.
- R4 · 필수 · src/pages/setting/data-archive/archiveDisplay.ts:229 · 현재 BE의 구조화된 `warnings: {code,message,params}[]`를 문자열로 간주해 `startsWith()`를 호출하므로 경고가 하나라도 있으면 APM 설정 화면이 예외로 중단된다 · 현재 BE `ApmArchiveSettingsDto`·`ApmArchiveStatusDto`는 `ApmArchiveWarning[]`과 `settingsState`를 반환하지만 FE는 `string[]` 및 문장 머리 판별을 유지한다 · 구조화 경고 타입을 반영하고 `settingsState === "INVALID"` 또는 `code === "SETTINGS_INVALID"`로 판정해 i18n 문구를 표시한다.
- R5 · 필수 · src/pages/setting/data-archive/archiveDisplay.ts:298 · 현재 BE가 `archiveJob.nextRunAt`을 epoch ms로 반환하는데 `Date.parse()`용 ISO 문자열로 처리하여 다음 정리·아카이브 시간이 `—`로 표시된다 · BE `ApmArchiveStatusDto.JobInfo.nextRunAt`과 `LastRun.startedAt`은 `Long`으로 바뀌었지만 FE는 `TSchedulerSetting`을 재사용한다 · 전용 `JobInfo` 타입을 만들고 epoch ms를 직접 차감·`dayjs(number)` 포맷하도록 변경한다.
- R6 · 권장 · src/pages/setting/data-archive/DataArchivePage.tsx:53 · 라이선스 조회 중 `apmLicensed`를 true로 간주하여 `?tab=apm` 직접 진입 시 라이선스 확정 전에 APM 전용 API 세 건을 호출한다 · `ApmArchiveTab`의 query `enabled`는 관리자 여부만 보고 있어 라이선스가 없는 관리자에게도 초기 요청과 전역 라이선스 안내가 샐 수 있다 · 라이선스 로딩 중에는 APM 탭 본문을 마운트하지 말고 query도 `isAdmin && !licenseLoading && allowsFeature("APM")`로 제한한다.
- R7 · 권장 · src/pages/setting/data-archive/components/ApmArchiveTab.tsx:175 · 이상 없음 — 옵트인 데이터셋은 확인 전 controlled checkbox 상태가 바뀌지 않고 `maxHoldDays=0` 안내, 경로 검사 결과와 허용 루트 밖 오류도 화면에 표시된다 · 확인 콜백에서만 targets를 갱신하며 테스트도 확인 전 미체크·확인 후 체크를 단언한다 · 수정 불필요.
- R8 · 권장 · src/pages/application-monitoring/shared/components/ApmArchiveHoldBanner.tsx:25 · 이상 없음 — 배너는 관리자이면서 APM 라이선스가 확정된 경우에만 요청하고 실패를 조용히 숨긴다 · 1분 polling·포커스 재조회 비활성화가 훅에 설정되어 있고 React Query observer 및 컴포넌트 timer는 라우트 이탈 시 정리된다 · 수정 불필요.
- R9 · 필수 · src/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:227 · `ARCHIVE_HOLD`에 삭제와 조건부 재동기화 동작이 그대로 노출되어 “켜고 끄기만” 가능하다는 계약을 위반한다 · 삭제 버튼은 kind와 무관하게 활성화되며 BE 삭제 API도 시드 규칙 삭제를 막지 않아 보류 알람 자체를 제거할 수 있다 · `apmAlertServerJudged(rule.kind)`이면 삭제·재동기화를 숨기거나 비활성화하고 enabled 변경만 허용한다.
- R10 · 권장 · src/routes/routes.tsx:973 · 이상 없음 — 관리 콘솔 정본 등록, 관리자 라우트 가드, `?tab=` 상태, `apm_archive` 카탈로그와 `ResizableDrawer` 규약이 모두 반영됐다 · `adminOnly` 라우트와 `constants/adminConsole.tsx` 항목이 같은 경로를 사용하고 신규 상세 패널은 `ResizableDrawer`만 사용한다 · 수정 불필요.
- R11 · 필수 · src/pages/setting/data-archive/components/ApmArchiveTab.tsx:360 · 현재 BE의 `lastHoldReason:"LOCK_TIMEOUT"`을 소비하지 않아 락 대기로 보류된 항목을 “아직 시도하지 않음”으로 잘못 안내한다 · FE `TApmArchiveHoldItem`에 `lastHoldReason`이 없고 `lastFailureReason`이 null이면 무조건 `hold_not_tried`를 표시한다 · `lastHoldReason`을 타입과 fixture에 추가하고 `LOCK_TIMEOUT`·`NOT_ARCHIVED`를 각각 i18n 안내로 분기한다.
- R12 · 권장 · src/pages/setting/data-archive/archiveDisplay.ts:38 · `ABANDONED` 실패 사유가 알려진 코드 목록과 로케일에 없어 크래시 정리 행이 영문 원문으로 노출된다 · 계약과 BE `ArchiveStatus.REASON_ABANDONED`에 정의돼 있지만 FE는 네 가지 실패 코드만 번역한다 · `ABANDONED`와 현재 BE의 관련 실패 코드를 타입·매핑·kr/en 로케일에 추가한다.
- R13 · 권장 · src/locales/kr.json:4719 · 이상 없음 — 이번에 추가된 고객 문구의 kr/en 키 구조는 대칭이고 검수번호·절 번호·HTML 표기가 없다 · `data_archive`, scheduler, alert, page-guide 키가 양쪽 로케일에 함께 추가됐다 · 수정 불필요.
- R14 · 권장 · src/__tests__/fixtures/archiveContractSample.ts:335 · 계약 fixture가 문자열 warnings와 ISO scheduler 시각을 고정해 현재 BE DTO 드리프트를 전혀 검출하지 못한다 · `busy[]`, `lastHoldReason`, `settingsState`, 구조화 경고, epoch job 시각이 fixture에서 모두 누락됐다 · 현재 BE DTO 표본으로 fixture를 갱신하고 경고 화면 비중단·시간 표시·busy 안내를 단언한다.
- R15 · 권장 · src/__tests__/DataArchivePage.test.tsx:244 · 요청된 혼합 날짜 부모 선택 검증과 `ARCHIVE_HOLD` 삭제 금지 검증이 없다 · 현재 테스트는 삭제된 날짜 부모와 RUNNING 개별 버튼만 따로 검사하고 알람 테스트도 임계·창 숨김만 확인한다 · 같은 날짜에 OK와 RUNNING을 섞어 mutation ID를 확인하고, `ARCHIVE_HOLD` 삭제·재동기화 버튼 부재를 단언한다.

## 판정

수정 후 재검수

현재 BE DTO와의 불일치로 설정 화면 예외, 잘못된 시간·보류 안내가 발생하며 `ARCHIVE_HOLD` 시드 규칙을 삭제할 수 있다. 특히 R1·R4·R5·R9·R11은 운영 오판이나 의도치 않은 삭제로 이어진다.

확인하지 못한 것:

- 사용자 지시로 빌드·테스트·npm 명령 및 브라우저 실행은 하지 않았다.
- BE 워크트리가 미커밋 상태이므로 이번 검수 시점 이후의 DTO 변경 여부는 확인하지 못했다.
- `C:\worktrees\COLLAB.md`가 존재하지 않아 협업 상태 한 줄은 확인하지 못했다.