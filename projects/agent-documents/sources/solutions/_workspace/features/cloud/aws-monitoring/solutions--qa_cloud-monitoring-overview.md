# Cloud Monitoring Overview — 정적 계약 QA

- 검증일: 2026-08-24
- 기준 계약: `_workspace/features/cloud/aws-monitoring/contract_cloud-monitoring-overview.md`
- 대조 범위: Spring `CloudInfraController`·`CloudOverviewQueryDto`·`AwsServiceImpl` ↔ FE `cloud-infra.ts`·service·`EC2Dashboard`·route/nav gate
- 방식: 코드 정적 대조. 실제 AWS 자격증명으로 API를 호출하는 검증은 포함하지 않음.

## 결과 요약

| 구분 | 결과 |
|---|---|
| 경로·HTTP 메서드 | 통과 — `GET /cloud-infras/overview` 양쪽 일치 |
| 인증·권한 gate | 통과 — BE `requireView(cloudInfraMonitoring, awsResources)`, FE `DmovePermissionsKey.AWS_RESOURCES` |
| query 계약 | 통과 — `regions`, `range`, `from`, `to` 서버 검증 및 FE 호출 일치 |
| envelope·언랩 | 통과 — `ApiResult<T>` → axios 1차 / `useDmoveQuery` 2차 언랩 후 payload 소비 |
| payload 필드·nullable | 통과 — `TCloudOverview`와 현 BE map 키 일치 |
| 부분 수집 상태 | 통과 — P1 2건 수정 후 재검증 완료 |

## 항목별 대조

| 항목 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 요청 경로·권한 | `GET /cloud-infras/overview`, `awsResources.view` | Controller와 FE service가 동일 경로를 사용하고, BE `requireView`/FE route·menu가 동일 permission key를 사용 | 통과 |
| query | regions(최대 20), range 또는 from+to | `CloudOverviewQueryDto`가 배타·기간을 검증하며 dashboard는 regions/range를 전송 | 통과 |
| response payload | summary, collection, riskResources, trends, alarms | `AwsServiceImpl` response map과 `TCloudOverview` 필드·literal·nullable 일치 | 통과 |
| envelope | 화면은 payload를 직접 소비 | service `TResponse<TCloudOverview>`와 `useDmoveQuery` 언랩 깊이 일치 | 통과 |
| direct URL/미설정 | 권한 차단 및 설정 안내 | `PageWrapper` permission gate와 `CloudInfraGate`가 적용됨 | 통과 |

## 발견 사항 및 재검증

| ID | 심각도 | 결과 | 근거 | 판정 |
|---|---|---|---|---|
| QA-OV-01 | P1 → Closed | Alarm·Metric collection state 분리 | `AwsServiceImpl.java:376-393`이 alarm과 metric 상태·reason을 각각 계산하고, `:407-409`에서 `cloudWatch=metric`, `alarms=alarm`을 별도 map으로 응답 | 통과 |
| QA-OV-02 | P1 → Closed | collection 상태·사유 UI 표시 | `EC2Dashboard.tsx:47`이 EC2/CloudWatch/Alarm을 모두 오류 판정에 포함하고, `:61-64`가 세 source의 state와 reason을 렌더링 | 통과 |

## 잔여 런타임 확인

실제 AWS에서 Alarm 조회만 실패하거나 Metric 조회만 실패한 응답을 만들 수 있는 환경에서는, 두 collection state/reason이 독립적으로 내려오고 화면에 노출되는지 기능 QA로 확인한다.
