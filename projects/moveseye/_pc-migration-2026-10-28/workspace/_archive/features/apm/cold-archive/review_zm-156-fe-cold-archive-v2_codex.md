## R1~R15 반영 판정

| R# | 닫힘/부분/미반영/해당 없음 | 근거(파일:줄) |
|---|---|---|
| R1 | 닫힘 | 현재 BE의 `busy` 필드(`zm-156-be/.../archive/ArchiveDeleteDto.java:33`)가 FE 타입에 반영됐고(`src/types/archive.ts:85`), 부분 삭제 안내(`src/pages/setting/data-archive/archiveDisplay.ts:346`)와 단건 `ARCHIVE_BUSY` 매핑(`src/pages/setting/data-archive/archiveDisplay.ts:363`)도 추가됐다. |
| R2 | 해당 없음 | 최초 검수 당시 정상 항목이다. 삭제 사유를 `trim()`하고(`src/pages/setting/data-archive/components/ArchiveDeleteModal.tsx:32`), 혼합 상태 재필터링도 테스트한다(`src/__tests__/DataArchivePage.test.tsx:253`). |
| R3 | 해당 없음 | 다운로드의 `blob`, 장시간 timeout, 취소 처리가 유지됐다(`src/services/archive.api.ts:86`, `src/pages/setting/data-archive/components/ArchiveFilesTab.tsx:229`). |
| R4 | 닫힘 | 경고가 `{code,message,params}`로 정의됐고(`src/types/archive.ts:165`), `settingsState`도 반영됐다(`src/types/archive.ts:172`). 아카이브 경고 처리에서 `startsWith` 판별은 사라졌으며, 미지 코드에는 `message ?? code` 폴백이 있다(`src/pages/setting/data-archive/archiveDisplay.ts:284`). |
| R5 | 닫힘 | 별도 `TApmArchiveJobInfo`가 epoch ms 숫자로 정의됐고(`src/types/archive.ts:175`), 남은 시간과 표시 시각도 숫자를 직접 사용한다(`src/pages/setting/data-archive/components/ApmArchiveStatusCard.tsx:44`). 기존 스케줄러의 `TSchedulerSetting.nextRunAt: string`은 그대로 유지돼 소비자 회귀가 없다(`src/types/scheduler.ts:24`, `src/types/scheduler.ts:37`). |
| R6 | 닫힘 | 라이선스 로딩 중에는 `DSpin`만 렌더링해 `ApmArchiveTab`을 마운트하지 않는다(`src/pages/setting/data-archive/DataArchivePage.tsx:95`). 세 쿼리 모두 `isAdmin && !licenseLoading && allowsFeature("APM")` 조건을 사용한다(`src/pages/setting/data-archive/components/ApmArchiveTab.tsx:113`). |
| R7 | 해당 없음 | 최초 검수 당시 정상 항목이다. opt-in 확인은 확인 콜백 안에서만 상태를 바꾸고(`src/pages/setting/data-archive/components/ApmArchiveTab.tsx:192`), `maxHoldDays=0` 안내도 유지된다(`src/pages/setting/data-archive/components/ApmArchiveTab.tsx:582`). |
| R8 | 해당 없음 | 최초 검수 당시 정상 항목이다. 공용 보류 배너도 관리자·라이선스 로딩 완료·APM 허용 조건으로만 쿼리한다(`src/pages/application-monitoring/shared/components/ApmArchiveHoldBanner.tsx:29`). |
| R9 | 부분 | `ARCHIVE_HOLD`의 재동기화와 삭제 버튼은 숨겨졌다(`src/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:229`, `:239`). 보호 오류 코드도 매핑됐다(`src/services/apiEnvelope.ts:45`). 다만 모든 규칙에 “수정” 버튼이 남아 있어(`ApmAlertRulesTab.tsx:218`) 계약의 “토글만” 조건에는 맞지 않는다. Drawer가 실제로는 `enabled`만 전송한다(`ApmAlertRuleDrawer.tsx:134`). |
| R10 | 해당 없음 | 최초 검수 당시 정상 항목이다. 관리자 라우트가 유지되고(`src/routes/routes.tsx:977`), 상세 화면은 `ResizableDrawer`를 사용한다(`src/pages/setting/data-archive/components/ArchiveFileDetailDrawer.tsx:106`). |
| R11 | 닫힘 | `lastHoldReason`이 타입에 추가됐고(`src/types/archive.ts:263`), `LOCK_TIMEOUT`을 보관 실패가 아닌 판정 미룸으로 분기한다(`src/pages/setting/data-archive/archiveDisplay.ts:332`, `src/pages/setting/data-archive/components/ApmArchiveTab.tsx:385`). |
| R12 | 부분 | 화면 매핑과 kr/en 로케일에는 `ABANDONED`, `DEFERRED`가 모두 추가됐다(`src/pages/setting/data-archive/archiveDisplay.ts:40`, `src/locales/kr.json:4767`, `src/locales/en.json:4767`). 그러나 `TArchiveFailReason`에는 여전히 네 코드만 있고(`src/types/archive.ts:26`), `TArchiveFile.failReason`도 해당 타입을 사용하지 않는다(`src/types/archive.ts:51`). |
| R13 | 해당 없음 | 최초 검수 당시 정상 항목이다. 정적 JSON 키 비교 결과 `data_archive`, `apm`, `scheduler`, `page_guide` 모두 kr/en 키 차이가 0건이었다. 관련 신규 키도 양쪽에 존재한다(`src/locales/kr.json:4869`, `src/locales/en.json:4869`). |
| R14 | 닫힘 | fixture에 `busy`(`src/__tests__/fixtures/archiveContractSample.ts:140`), 구조화 경고(`:289`), `settingsState`(`:327`), `lastHoldReason`(`:370`), epoch ms JobInfo(`:399`)가 반영됐다. 미지 경고의 서버 메시지 폴백도 단언한다(`src/__tests__/dataArchiveDisplay.test.ts:225`). |
| R15 | 닫힘 | 같은 날짜의 OK 항목만 삭제 ID에 포함하고 RUNNING을 제외하는 테스트가 있다(`src/__tests__/DataArchivePage.test.tsx:253`, `:277`). `ARCHIVE_HOLD` 삭제·재동기화 버튼 부재도 단언한다(`src/__tests__/ApmAlertRulesPage.test.tsx:354`). |

## 새 결함

- N1 · 필수 · `src/services/archive.api.ts:155` · APM 설정 저장 요청에 잠금 대기용 timeout이 적용되지 않았다 · BE는 설정 잠금을 최대 60초 기다린 뒤 `ARCHIVE_BUSY`를 반환하지만(`zm-156-be/.../ApmArchiveAdminService.java:135`, `ArchiveDayLock.java:43`), Axios 기본 timeout도 정확히 60초다(`src/services/axiosInstance.ts:258`). 경계에서 클라이언트 timeout이 먼저 발생하면 전용 오류 코드와 재시도 창을 받을 수 없다 · `updateApmSettings`에도 `{ timeout: ARCHIVE_LOCK_WAIT_TIMEOUT_MS }`를 적용하고 API 호출 인자 테스트를 추가한다.
- N2 · 권장 · `src/__tests__/fixtures/archiveContractSample.ts:387` · epoch ms로 고친 fixture의 설명이 여전히 “스케줄러 DTO 시각은 ISO 문자열”이라고 적혀 있다 · 실제 표본은 숫자이며 현재 BE는 전용 `JobInfo`를 반환한다 · 주석을 “전용 JobInfo의 시각은 epoch ms”로 수정한다.

## 판정

수정 후 재검수

필수적으로 APM 설정 저장 timeout 경계를 수정해야 하며, R9의 “토글만” UI 조건도 완전히 충족되지 않았다.  
R12의 실패 사유 타입도 현재 BE의 `ABANDONED`·`DEFERRED`와 아직 일치하지 않는다.

확인하지 못한 것

- 요청에 따라 빌드·테스트·npm 명령과 브라우저 실행은 하지 않았다.
- 검수 도중 구현 파일 변경이 한 차례 발생했으며, 본 판정은 마지막 `git status` 및 정적 조회 시점의 워크트리를 기준으로 한다.
- 실제 60초 잠금 경합 상황에서 Axios와 BE 중 어느 쪽이 먼저 종료되는지는 실행 검증하지 않았다.