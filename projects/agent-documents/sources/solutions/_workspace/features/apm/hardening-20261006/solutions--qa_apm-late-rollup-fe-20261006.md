# APM 지연 재집계·시간 정책 FE 연동 — 2026-10-06

상태: 구현·검증 완료. FE 기준 `59186c0`. 커밋·BE 편집·서버 기동 없음.

계약: [features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md](solutions--contract_apm-late-rollup-20261006.md).

## 변경

| reason | 한국어 라벨 | 톤·합산 |
|---|---|---|
| `METRIC_TIME_EXPIRED` | 보존 기간 초과로 제외된 메트릭 | `critical`, 수집 제외·보류 합산에 포함 |
| `METRIC_TIME_FUTURE` | 미래 시각 오차 초과로 제외된 메트릭 | `critical`, 합산에 포함 |
| `METRIC_TIME_RETIRED` | 이미 정리된 날짜여서 제외된 메트릭 | `critical`, 합산에 포함 |

세 사유는 실제 적재되지 않은 영구 정책 제외다. 기존 기준·중복 관측 제외 분류에 넣지 않았다. 전체 사유 표와 서비스별 사유 요약에도 기존 공통 라벨 함수를 통해 표시된다. 도움말에는 수집 지연/보존 설정, 앱·수집기·서버의 시계 확인, 보존 확대가 이미 정리된 원본을 복구하지 않는다는 차이를 설명했다.

변경한 FE 파일:

- `src/types/apm.ts`
- `src/pages/application-monitoring/collectors/apmCollectorDisplay.ts` — 시간 정책의 기존 critical 분류를 설명하는 주석만 추가.
- `src/locales/kr.json`, `src/locales/en.json`
- `src/__tests__/apmCollectorDisplay.test.ts`

API 요청/응답 필드는 변경하지 않았다. 정책 제외의 기존 HTTP 200 `{}`와 일시 장애 HTTP 503 처리를 유지한다. `partialSuccess`를 새로 가정하지 않는다.

## 검증

실행 명령:

```text
npx jest --runInBand --runTestsByPath src/__tests__/apmCollectorDisplay.test.ts --json --outputFile=C:/solutions/_workspace/_archive/features/apm/hardening-20261006/apm-priority-20261006/late-rollup-fe-jest.json
npx tsc --noEmit
```

Jest는 **1개 스위트·50개 테스트 통과**, 실패 0·건너뜀 0이다(16.296초). 원본: [late-rollup-fe-jest.json](../../../_archive/features/apm/hardening-20261006/apm-priority-20261006/late-rollup-fe-jest.json).

전체 FE 대상 `npx tsc --noEmit`는 종료 코드 0으로 통과했다. `git diff --check`도 통과했다. CRLF 변환 안내 외 내용 오류 없음.

새 회귀는 세 사유의 한·영 라벨 차이, critical 톤, 세 제외 사유의 합산과 중복 관측의 제외를 검증한다. 브라우저·실제 OTLP 수신·DB 검증은 이 FE 작업에서 실행하지 않는다.

순위 9~10은 [준비 계획](solutions--apm-query-controls-20261006.md)만 작성했고 제품 변경은 착수하지 않았다.
