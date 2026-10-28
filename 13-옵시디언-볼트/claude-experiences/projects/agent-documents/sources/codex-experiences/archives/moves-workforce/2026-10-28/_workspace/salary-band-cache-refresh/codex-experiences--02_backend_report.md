# Backend report

## 변경 여부

Backend 변경 없음.

## 실제 응답 shape

기존 `addLevel`, `updateLevel`, `deleteLevel` resolver 계약을 그대로 사용한다. 각 modal hook은 기존과 같이 `res.success === true`일 때만 부모 `onSuccess()`를 호출한다. 이번 결함은 성공 응답 이후 frontend query cache 무효화 범위가 부족한 문제이므로 resolver/Service/Repository/DB/manifest를 수정하지 않는다.

## 테스트

Backend 소스 변경은 없으며 최종 통합 검증 단계에서 root `npm test`로 회귀 여부를 확인한다.

