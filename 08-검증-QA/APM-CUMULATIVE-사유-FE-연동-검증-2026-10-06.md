# APM CUMULATIVE 사유 FE 연동 검증 — 2026-10-06

상태: 구현·TypeScript·대상 Jest 검증 완료. 커밋·서버 재시작 없음.

## 계약과 변경 범위

기준 계약: [contract_apm-cumulative-correctness-20261006.md](../06-API-%EA%B3%84%EC%95%BD/APM-CUMULATIVE-%EC%A0%95%ED%99%95%EC%84%B1-%EB%B3%B4%EC%99%84-%EA%B3%84%EC%95%BD-2026-10-06.md).

변경 파일은 `moveseyee_fe/`의 다음 5개다.

- `src/types/apm.ts`: 신규 `CUMULATIVE_*` 8종과 관측 전용 사유 분류.
- `src/pages/application-monitoring/collectors/apmCollectorDisplay.ts`: 라벨 키·톤·요약 합산.
- `src/locales/kr.json`, `src/locales/en.json`: 한·영 라벨과 누적 통계 의미 설명.
- `src/__tests__/apmCollectorDisplay.test.ts`: 중립 관측과 구간 보류가 섞인 합산 회귀 검증.

기존 API 경로·DTO 필드·권한·컴포넌트 배치를 유지했다. 신규 라벨은 기존 공유 `apmDropReasonKey`를 경유하여 서비스별 사유 줄에도 적용된다. 모르는 사유의 원문 fallback을 유지한다.

## 표시·합산 정책

| 사유 | 톤 | 수집 제외·보류 요약 |
|---|---|---|
| `CUMULATIVE_UNKNOWN_START` | 중립(`unknown`) | 제외, 전체 사유 표에는 유지 |
| `CUMULATIVE_DUPLICATE` | 중립(`unknown`) | 제외, 전체 사유 표에는 유지 |
| `CUMULATIVE_OUT_OF_ORDER` | 경고 | 포함 |
| `CUMULATIVE_POINT_CONFLICT` | 경고 | 포함 |
| `CUMULATIVE_SCHEMA_CHANGED` | 경고, 라벨에 `구간 보류` 명시 | 포함 |
| `CUMULATIVE_RESET_UNCERTAIN` | 경고, 라벨에 `구간 보류` 명시 | 포함 |
| `CUMULATIVE_INVALID_POINT` | `critical` | 포함 |
| `CUMULATIVE_STATE_LIMIT` | `critical` | 포함 |

`CUMULATIVE_FIRST_SKIPPED`의 기존 합산·중립 톤은 유지했다. 저장된 변형과 사용자 수집 중지의 기존 제외 정책도 유지했다.

사유별 관측 횟수와 정확한 손실량을 구분하기 위해 기존 `실제 손실 누적`을 `수집 제외·보류 누적`으로 정정했다. 서비스별 `total`은 BE 전체 사유 합계여서 중립 관측도 포함된다. 따라서 서비스별 문구는 `수집 사유 N건`으로 바꾸고, 도움말에 기준·중복 관측도 포함하며 정확한 손실량이 아니라는 점을 적었다.

최근 수신 `lostPoints`와 FE 누적 사유 합계는 원래 동일한 집계가 아니다. 신규 중립 2종의 제외 필요성을 BE 담당에게 알렸고, 리더가 BE에서 `accepted`의 기존 의미를 유지하면서 `lostPoints`에서 해당 2종을 제외한다고 확인했다. 기존 `COLLECTION_PAUSED` 제외 차이와 사유 중복 가능성 때문에 두 숫자의 전수 일치를 주장하지 않는다.

## 검증 실행

Jest 실행 명령:

```text
npx jest --runInBand --runTestsByPath src/__tests__/apmCollectorDisplay.test.ts src/__tests__/ApmCollectorsPage.test.tsx src/__tests__/ApmSelfExplain.test.tsx --json --outputFile=C:/solutions/_workspace/verification/apm-priority-20261006/cumulative-fe-jest.json
```

`npx tsc --noEmit`는 전체 FE 소스를 대상으로 실행하여 종료 코드 0으로 통과했다.

Jest는 3개 스위트, 117개 테스트를 통과했다. 실패 0, 건너뜀 0이다. 실행 시간은 249.63초다.

| 스위트 | 통과 |
|---|---:|
| `apmCollectorDisplay.test.ts` | 46 |
| `ApmCollectorsPage.test.tsx` | 47 |
| `ApmSelfExplain.test.tsx` | 24 |

원본 결과: [cumulative-fe-jest.json](verification/apm-priority-20261006/cumulative-fe-jest.json).

`git diff --check`는 통과했다. CRLF 변환 안내는 저장소의 기존 Git 설정에 따른 경고다.

검증 범위는 FE 순수 표시 규칙·기존 React 렌더 회귀·TypeScript 검사다. 실제 BE 응답을 받는 브라우저 E2E, 부하 시험, Gradle/DB 검증은 이 작업에서 실행하지 않았다.
