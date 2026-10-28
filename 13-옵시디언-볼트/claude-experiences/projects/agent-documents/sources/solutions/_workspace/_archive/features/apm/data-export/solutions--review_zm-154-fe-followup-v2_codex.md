## R1~R5 반영 판정

| R# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 닫힘 | v1/v2 필드가 옵셔널로 모델링되고 다른 소비자는 모달뿐이다(`src/types/apm.ts:3702`). v1 계획+엔드포인트 필터를 판별한다(`src/pages/application-monitoring/shared/apmExport.ts:88`). 실제 렌더 경로에서 버튼 잠금·클릭 가드·경고가 적용된다(`src/pages/application-monitoring/shared/components/ApmExportModal.tsx:151`, `src/pages/application-monitoring/shared/components/ApmExportModal.tsx:203`, `src/pages/application-monitoring/shared/components/ApmExportModal.tsx:520`). 필터가 없으면 토큰 없이 v1 다운로드가 진행된다(`src/pages/application-monitoring/shared/components/ApmExportModal.tsx:218`). |
| R2 | 닫힘 | 호출부 취소를 WeakSet에 표시한다(`src/services/linkCallerSignal.ts:22`, `src/services/linkCallerSignal.ts:58`). 응답 인터셉터가 취소 오류의 대체 요청 맵 판정보다 먼저 표식을 검사하여 reject한다(`src/services/axiosInstance.ts:183`, `src/services/axiosInstance.ts:199`). WeakSet이므로 signal 수명 종료 후 GC 가능하다. |
| R3 | 닫힘 | `linkCallerSignal`이 unsubscribe를 반환한다(`src/services/linkCallerSignal.ts:67`). 성공 시 호출되고(`src/services/axiosInstance.ts:169`), 네트워크 오류·취소·401을 포함한 모든 실패 분기 진입 직후 호출된다(`src/services/axiosInstance.ts:180`). 401 재시도는 요청 인터셉터에서 새 리스너를 연결한다(`src/services/axiosInstance.ts:143`, `src/services/axiosInstance.ts:151`). |
| R4 | 닫힘 | 만료 시각에 의한 클라이언트 선판정이 제거됐고 BE의 `APM_EXPORT_INVALID`만 재계획 사유로 사용한다(`src/pages/application-monitoring/shared/components/ApmExportModal.tsx:161`, `src/pages/application-monitoring/shared/components/ApmExportModal.tsx:251`). 재조회 결과를 자동 다운로드하지 않아 INVALID가 반복돼도 자동 루프가 생기지 않는다(`src/pages/application-monitoring/shared/components/ApmExportModal.tsx:165`). |
| R5 | 부분 | 신규 테스트는 실제 `createDmoveApi`와 adapter, 401→refresh→재요청 흐름을 통과한다(`src/__tests__/axiosCallerSignal.test.ts:8`, `src/__tests__/axiosCallerSignal.test.ts:201`). Vite의 env 접근 격리와 Jest 매핑도 추가됐다(`src/constants/apiBaseUrl.ts:8`, `jest.config.cjs:13`). 그러나 이 이동이 기존 실제 배선 테스트 로더를 깨뜨린다(N1). |

## #4·#5 연동 판정

- #4: 충족 — `returnHeaders`는 옵트인이며 다운로드만 활성화한다(`src/services/axiosInstance.ts:21`, `src/services/apm.api.ts:1007`). 헤더 `true` 또는 헤더 미노출 시 계획값이 결손이면 저장 후 모달을 유지하며 기준 시각 포함 경고를 표시한다(`src/pages/application-monitoring/shared/components/ApmExportModal.tsx:232`, `src/pages/application-monitoring/shared/components/ApmExportModal.tsx:529`, `src/locales/kr.json:67`).
- #5: 충족 — 적용 필터는 계획 응답의 `q`·`method`만 사용하며(`src/pages/application-monitoring/shared/components/ApmExportModal.tsx:270`), `red-series`는 필터 표시 대상에서 제외된다(`src/pages/application-monitoring/shared/apmExport.ts:79`, `src/pages/application-monitoring/shared/components/ApmExportModal.tsx:284`).

- N1 · 필수 · src/__tests__/support/realDmoveApi.ts:26 · `apiBaseUrl` 분리로 기존 `zm157RealWiring` 실제 인터셉터 테스트가 로딩 단계에서 확정적으로 실패한다 · 로더는 `axiosInstance.ts`에 더 이상 존재하지 않는 `import.meta.env.VITE_API_URL`을 요구하며 없으면 즉시 throw하고(`src/__tests__/support/realDmoveApi.ts:27`), 이를 제거해도 새 의존성 `../constants/apiBaseUrl`과 `./linkCallerSignal`이 dependency map에 없어 다시 실패한다(`src/__tests__/support/realDmoveApi.ts:44`, `src/services/axiosInstance.ts:3`, `src/services/axiosInstance.ts:43`); 실제 사용처는 `src/__tests__/zm157RealWiring.test.tsx:19`이다 · 이제 Jest 매핑으로 원본 모듈을 직접 불러올 수 있으므로 커스텀 소스 로더를 제거하고 실제 `axiosInstance`를 사용하거나, 로더의 marker 치환을 없애고 두 신규 의존성을 매핑한 뒤 해당 기존 스위트까지 검증한다.

## 판정

수정 후 재검수

- R1~R4와 계약 #4·#5의 기능 경로는 근본 원인을 닫았다.
- 하지만 N1 때문에 기존 Jest 스위트가 확정적으로 깨지므로 R5를 완료로 판정할 수 없다.

확인하지 못한 것:

- 지시대로 빌드·Jest·npm 명령은 실행하지 않아 실제 Vite 빌드와 전체 테스트 결과를 확인하지 못했다.
- 브라우저의 실제 요청 취소, BE 슬롯 반납, 401 실통신, CORS 환경의 보존 헤더 노출은 확인하지 못했다.
- `C:\worktrees\COLLAB.md`가 존재하지 않아 협업 상태 표시는 확인하지 못했다.