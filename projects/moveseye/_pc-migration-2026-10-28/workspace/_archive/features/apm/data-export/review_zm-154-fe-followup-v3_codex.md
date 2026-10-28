## N1 반영 판정

| 항목 | 판정 | 근거(파일:줄) |
|---|---|---|
| N1 | 닫힘 | `loadRealDmoveApi`는 커스텀 치환·변환 없이 `jest.requireActual("@/services/axiosInstance")`를 반환한다(`src/__tests__/support/realDmoveApi.ts:20~23`). URL 모듈만 Jest 대역으로 해석된다(`jest.config.cjs:13`, `__mocks__/apiBaseUrlMock.js:5~7`). zm157은 실제 인터셉터에 HTTP adapter만 주입하고(`src/__tests__/zm157RealWiring.test.tsx:95~104`), Redux store 대역도 유지한다(`:38~41`). 기존 9개 테스트 단언은 약해지지 않았다. 제거된 것은 구식 `import.meta.env` marker와 수동 dependency allowlist 검사뿐이다(`review_zm-154-fe-followup-v2_codex.md:16`). 실제 `clearAuthInfo`를 사용하게 되었지만 zm157은 401을 발생시키지 않아 해당 범위는 종전에도 단언하지 않았으며, 401 refresh·재시도는 별도 실배선 테스트가 담당한다(`src/__tests__/axiosCallerSignal.test.ts:201~255`). `API_BASE_URL`은 종전과 동일한 `import.meta.env.VITE_API_URL` 값이다(`src/constants/apiBaseUrl.ts:8`, `src/services/axiosInstance.ts:3,46`). 다른 런타임 참조인 `ENV.API_URL`은 소비처가 없고(`src/constants/env.ts:9`), 주소를 단언하는 인접 스위트는 axios 대역의 자체 `baseURL`을 사용한다(`src/__tests__/useEventStream.test.tsx:17~26,102~121`). |

새 결함 없음.

## 판정

승인

- N1의 확정적 로딩 실패가 제거됐고 실제 `axiosInstance`·인터셉터·공유 모듈 배선이 보존됐다.
- Vite 런타임 API 주소는 종전과 같으며 Jest 매핑으로 다른 스위트의 주소 가정이 바뀌는 회귀도 발견되지 않았다.

확인하지 못한 것:

- 지시대로 빌드·Jest·npm 명령을 실행하지 않아 문서에 기재된 9/9 및 178/178 통과 결과를 재현하지 못했다.
- 실제 Vite 빌드의 환경변수 주입과 브라우저 네트워크 요청은 확인하지 못했다.
- zm157 스위트 자체에는 401 응답 단언이 없어 Redux dispatch를 포함한 401 실패 흐름은 정적으로만 확인했다.