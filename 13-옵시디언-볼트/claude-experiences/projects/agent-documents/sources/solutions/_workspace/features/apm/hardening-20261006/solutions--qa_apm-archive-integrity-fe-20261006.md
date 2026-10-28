# APM 아카이브 무결성 FE 반영·검증

작성일: 2026-10-06. 담당: `/root/apm_cumulative_fe`.

계약 정본: `C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-archive-integrity-20261006.md`.

## 구현 결과

- `CORRUPT`를 오류 상태인 **무결성 실패**로 표시한다. `FILE_HASH_MISMATCH`, `FILE_UNAVAILABLE`, `INTEGRITY_FAILED`, `ARCHIVE_INTEGRITY_FAILED`를 한·영 UI와 오류 해석에 연결했다.
- 파일 소유와 읽기 허용을 나눴다. CORRUPT는 용량 합계, 날짜 묶음 선택 및 사유를 입력한 삭제에 포함하며 다운로드·verify는 차단한다. OK/SUPERSEDED의 `fileExists=false`는 다운로드만 막고, verify로 실물 미확인을 확정할 수 있다.
- verify는 성공·`ok:false`·요청 오류 모두 원장 목록, 상세, 같은 날 이력, APM 상태, 보류의 5개 query를 무효화한다. 활성 query의 재조회를 기다리며 관계없는 query는 건드리지 않는다.
- `ok:false` 또는 격리 오류를 받은 행은 화면에 남은 오래된 OK 응답 때문에 다운로드·검사가 다시 활성화되지 않도록 CORRUPT로 유지한다. BE 재조회가 DELETED를 반환하면 그 상태를 존중한다. 검증 실패는 일회성 toast가 아닌 목록·상세의 지속 안내와 재생성 안내로 표현한다.
- 삭제 확인에 **파일 삭제만으로 원본 보호가 해제되지 않음**을 안내한다. DELETED 상세와 같은 날 이력에도 무결성 실패 사유와 삭제 기록을 함께 표시한다.
- `INTEGRITY_FAILED` 보류는 설정된 최대 보류 기간과 관계없이 **만료 없음 — 정상 보관본 재생성 필요**로 표시한다. APM 상태의 무결성 경고와 APM 메뉴 보류 배너는 오류 톤으로 표시하고 일반 만료 경고보다 우선한다. 일반 보류 및 실패 시 삭제 설정 설명에도 무결성 예외를 명시했다.
- createdAt은 검사 시각이 아니므로 상세에서 구분하고, 실제 검사 시각은 실패 상세·감사 기록을 확인하도록 안내한다.

## 계약 확인과 범위

- BE 담당 `/root/apm_audit_data`와 missing-file verify 허용, CORRUPT의 실제 `fileExists` boolean, HTTP 200/body 409 오류, 보류 생성 시점을 확인했다. API 경로·응답 필드와 언랩 깊이는 바꾸지 않았다.
- CORRUPT 원장은 verify 응답 전에 저장된다. 원본 보류 행은 다음 retention 판정에서 생길 수 있으므로, verify 직후 보류 건수가 증가한다는 주장을 하지 않는다. 해당 간격에도 파일 목록의 격리·재생성 안내는 표시한다.
- 파일 용량 합계는 원장 bytes 기준이며 실제 디스크 점유 측정값이 아니다. checksum은 보관본과 현재 DB 원본의 최신성 일치를 보장하지 않는다.
- 순위 5의 `METRIC_TIME_*` 타입·표시·회귀는 동결 상태를 유지했다. 공유 locale 파일의 기존 순위 5 변경을 보존하고 `data_archive` 영역만 추가 수정했다.
- 순위 9~10 제품 구현은 하지 않았다. 해당 계획 정본은 `_workspace/features/apm/hardening-20261006/apm-query-controls-20261006.md`다.

## 검증

1. `npx jest --runInBand --runTestsByPath src/__tests__/dataArchiveDisplay.test.ts src/__tests__/DataArchivePage.test.tsx src/__tests__/useArchiveIntegrity.test.tsx`
   - 3 suites, 82 tests 통과, 실패 0, skip 0. 실행 시간 120.284초.
   - 증거: `_workspace/_archive/features/apm/hardening-20261006/apm-priority-20261006/archive-integrity-fe-jest.json`.
2. `npx tsc --noEmit`: exit 0. 프로젝트 설정상 `src/__tests__`는 제외하며 제품 코드를 검사했다.
3. 상세·삭제 이력 및 보류 배너의 추가 2개 회귀는 첫 실행 후 페이지 suite를 별도로 재실행했다.
   - `npx jest --runInBand --runTestsByPath src/__tests__/DataArchivePage.test.tsx`: 1 suite, 40 tests 통과, 실패 0, skip 0. 실행 시간 72.672초.
   - 증거: `_workspace/_archive/features/apm/hardening-20261006/apm-priority-20261006/archive-integrity-fe-page-jest.json`.
   - 최종 파일 기준 중복 제외 검증 범위: 3 suites, 84 tests. 페이지 40 + 표시·서비스 40 + 실제 QueryClient 4.
4. `git diff --check`: 통과. CRLF 변환 예정 안내만 있으며 공백 오류는 없다.

검증은 실제 React 컴포넌트를 jsdom에서 렌더링하고 클릭·입력해 수행했다. 목록/상세 UI는 API hook payload mock을 소비하며 HTTP 서버는 연결하지 않았다. 별도 hook suite에서는 실제 TanStack QueryClient와 활성 query를 사용해 성공·checksum 불일치·실물 미확인 후 5개 조회의 실행 횟수와 새 cache 값을 검증하고, 오류 시 비활성 cache의 stale 상태를 확인했다.

페이지 suite에서는 Ant Design/rc-table의 스크롤바 측정 중 jsdom이 구현하지 않은 `window.getComputedStyle(elt, pseudoElt)` console 오류가 반복 출력됐다. 테스트 실패나 skip은 없으나 실제 브라우저의 스타일·레이아웃 검증을 대신하는 결과로 해석하지 않는다.

실제 브라우저 E2E, BE 테스트, DB 조작, 서버 기동·재시작, 커밋은 수행하지 않았다.

## 변경 파일 — FE 루트 기준 15개

| 파일 | 변경 목적 |
|---|---|
| `src/types/archive.ts` | 신규 상태·실패·경고 코드와 계약 주석 |
| `src/constants/archive.ts` | 상태 톤, 파일 소유/읽기 허용 분리, 오류 코드 |
| `src/hooks/useArchive.ts` | verify 후 5개 query 무효화·재조회 대기 |
| `src/pages/setting/data-archive/archiveDisplay.ts` | 상태별 허용 판정·요약·보류·오류 매핑 |
| `src/pages/setting/data-archive/components/ArchiveFilesTab.tsx` | 즉시 격리 결과·버튼·지속 안내 |
| `src/pages/setting/data-archive/components/ArchiveFileDetailDrawer.tsx` | 격리 안내·삭제와 실패 이력 동시 표시 |
| `src/pages/setting/data-archive/components/ArchiveDeleteModal.tsx` | 원본 보호 유지 안내 |
| `src/pages/setting/data-archive/components/ApmArchiveTab.tsx` | 무결성 보류의 만료 없음 표시 |
| `src/pages/application-monitoring/shared/components/ApmArchiveHoldBanner.tsx` | 오류 톤·무결성 경고 우선 |
| `src/locales/kr.json`, `src/locales/en.json` | archive 표시 문구·정책 예외 설명, 순위 5 변경 보존 |
| `src/__tests__/fixtures/archiveContractSample.ts` | CORRUPT 원장 fixture |
| `src/__tests__/dataArchiveDisplay.test.ts` | 상태별 동작·용량·라벨·경고·오류 회귀 |
| `src/__tests__/DataArchivePage.test.tsx` | React 목록·삭제·verify·상세·보류 UI 회귀 |
| `src/__tests__/useArchiveIntegrity.test.tsx` | 실제 QueryClient 갱신·오류 cache 회귀 |

## 재사용 교훈

원장을 바꾸는 검사에서는 `ok:false`가 mutation 성공 응답일 수 있다. HTTP 실패만 invalidate하거나 결과 toast만 붙이면 목록·상세·보류가 서로 다른 상태를 보여 준다. 파일 소유 여부와 다운로드 허용 여부는 격리 상태 도입 시 반드시 분리해야 하며, 삭제된 원장에도 정책 판단 근거가 남는다면 이력을 숨기지 않아야 한다.
