# Code splitting과 bundle budget 계약

## 경험

Moves Workforce에서 route/tab 단위 `React.lazy`를 재도입했지만, bundle budget script는 "코드 스플리팅이 제거돼 main 한 덩어리"라는 이전 전제와 1.85MB main 기준을 유지했다. 결과적으로 initial main이 약 893KB로 줄어든 뒤에도 budget은 지나치게 느슨하게 통과했고, 최대 async chunk와 전체 route payload는 전혀 측정하지 않았다.

## 결정

- code splitting 변경과 bundle budget 변경은 하나의 architecture contract로 취급한다.
- `asset-manifest.json`의 `entrypoints`로 initial payload를 측정한다.
- initial 합계, 최대 async chunk, 중요 route별 chunk를 따로 관리한다.
- monolith 시절의 기준과 설명을 그대로 두지 않는다. 임계값을 넘겨도 warning만 내는 정책은 안정화 기간에만 허용하고, 기준선이 잡히면 CI gate로 복원한다.
- 전체 async chunk 합계는 사용자가 한 번에 받는 값이 아니므로 initial payload와 같은 의미로 비교하지 않는다.

## 검증

1. production build 후 manifest가 가리키는 모든 entrypoint의 gzip 크기를 합산한다.
2. 가장 큰 async chunk와 기능별 주요 route chunk를 기록한다.
3. lazy 경계가 바뀌는 PR에서 budget test와 주석도 함께 바뀌는지 contract test로 확인한다.
4. unused dependency 제거 전에는 peer/build 간접 사용을 `npm ls`와 production build로 확인한다.

## 관련 프로젝트

- Moves Workforce: `_workspace/logic-bloat-audit/03_verify_report.md`

