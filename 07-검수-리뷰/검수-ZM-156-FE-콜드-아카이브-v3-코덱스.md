## 잔여 반영 판정

| 항목 | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| N1 설정 저장 timeout | 닫힘 | `src/services/archive.api.ts:159-164`, `src/__tests__/dataArchiveDisplay.test.ts:373-386` |
| R9 `ARCHIVE_HOLD` 토글 전용 | 닫힘 | 수정·삭제·재동기화 버튼을 숨기고 스위치만 유지한다. 토글 payload는 `{enabled}`뿐이다. `src/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:203-208`, `:218-253`, `src/__tests__/ApmAlertRulesPage.test.tsx:343-383` |
| R12 실패 사유 타입 | 닫힘 | BE의 6개 `REASON_*`와 FE 배열이 일치하며 `TArchiveFile.failReason`과 보류 실패 사유도 해당 타입을 사용한다. `C:\worktrees\zm-156-be\src\main\java\com\dmove\moveseye\archive\ledger\ArchiveStatus.java:34-44`, `src/types/archive.ts:29-38`, `:59`, `:264`, `src/__tests__/fixtures/archiveContractSample.ts:367` |
| N2 픽스처 주석 | 닫힘 | 전용 `JobInfo` 및 epoch ms임을 명시했다. `src/__tests__/fixtures/archiveContractSample.ts:387` |
| `LOCK_TIMEOUT` 경고 | 닫힘 | 코드 상수, `table`·`day`·`at` 치환, i18n, 픽스처와 중복 처리 테스트가 있다. 미지 코드의 `message ?? code` 폴백도 유지된다. `src/types/archive.ts:155-169`, `src/pages/setting/data-archive/archiveDisplay.ts:261-278`, `src/locales/kr.json:4869`, `src/locales/en.json:4869`, `src/__tests__/fixtures/archiveContractSample.ts:499-505`, `src/__tests__/dataArchiveDisplay.test.ts:222-244` |
| 다른 알람 규칙 회귀 | 닫힘 | 서버 판정 목록에는 `ARCHIVE_HOLD`만 포함된다. `STUCK_REQUEST`는 기존처럼 임계값 편집이 가능하고 창만 숨기며, 일반 규칙 편집 payload 테스트도 유지된다. `src/types/apm.ts:673-683`, `src/pages/application-monitoring/alert-rules/components/ApmAlertRuleDrawer.tsx:134-140`, `:255-305`, `src/__tests__/ApmAlertRulesPage.test.tsx:312-330` |

## 새 결함

- M1 · 권장 · `src/constants/archive.ts:109` · timeout 상수 주석이 여전히 “삭제·무결성 검사” 및 “이 두 호출에만”이라고 설명한다 · N1 반영으로 `updateApmSettings`도 이 상수를 사용하므로 실제 사용처와 주석이 불일치한다(`src/services/archive.api.ts:162`) · 주석에 APM 설정 저장을 추가하고 호출 개수를 전제로 한 표현을 제거한다.

## 판정

승인

이유 1: N1·R9·R12·N2와 `LOCK_TIMEOUT` 경고 계약은 모두 정적으로 충족한다.  
이유 2: M1은 실행 동작에 영향을 주지 않는 비차단 주석 정합성 문제다.

확인하지 못한 것:

- 요청에 따라 build·test·npm 명령은 실행하지 않았다.
- 브라우저 동작 및 실제 BE 연동은 확인하지 않았다.
- 지시된 `C:\worktrees\COLLAB.md`가 존재하지 않아 협업 상태 표시는 확인하지 못했다.