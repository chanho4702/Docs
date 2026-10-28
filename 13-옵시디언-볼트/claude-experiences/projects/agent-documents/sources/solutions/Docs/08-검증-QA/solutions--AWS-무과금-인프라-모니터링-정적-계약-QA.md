# AWS 무과금 인프라 모니터링 정적 계약 QA

- 검증일: 2026-08-24
- 범위: `_workspace/contract_aws-free-monitoring.md` ↔ Spring BE ↔ React FE
- 방식: 정적 교차 대조. 공유 작업공간이므로 코드 수정·되돌리기는 수행하지 않음.

## 대조 결과

| 항목 | 기대(BE/계약) | 실제(FE/BE) | 심각도 | 판정·수정 제안 |
|---|---|---|---|---|
| EC2 운영 상세 경로·요청 | `GET /cloud-infras/ec2/detail`, `instanceId`·`region` 필수 | BE `CloudInfraController.java:120`, FE `services/cloud-infra.ts:112-118`이 동일 경로·동일 파라미터를 사용 | 통과 | 일치 |
| VPC 상세 경로·요청 | `GET /cloud-infras/vpcs/detail`, `vpcId`·`region` 필수 | BE `CloudInfraController.java:129-134`, FE `services/cloud-infra.ts:120-127`이 동일 | 통과 | 일치 |
| CloudTrail 경로·기본 요청 | `GET /cloud-infras/cloudtrail/events`, `region` 필수, `resourceId` 선택 | BE `CloudInfraController.java:137-143`, FE `services/cloud-infra.ts:129-136`이 동일. `CloudTrailEvents.tsx:19-23`도 리전·리소스 ID를 전달 | 통과 | 일치 |
| CloudTrail 선택 query 지원 | 계약은 `eventName`, `maxResults`(1~50 clamp)도 지원 | BE DTO는 지원(`CloudTrailEventsDto.java:10-24`)하지만 FE service 공개 시그니처는 `region`, `resourceId`만 받음(`services/cloud-infra.ts:129-136`) | 낮음 | 현재 상세 화면 요구에는 영향 없음. 향후 변경 이력 필터/표시 수 선택을 추가할 때 service 인자와 queryKey에 `eventName`, `maxResults`를 포함할 것. |
| 응답 envelope 언랩 | `ApiResult.data`를 FE 소비처가 payload로 받음. 200 + `code:403`은 오류여야 함 | axios가 1회 body 언랩(`axiosInstance.ts:126-132`), `useDmoveQuery.ts:51-55, 68-73`가 failure envelope를 throw 후 `data`를 반환. 신규 세 화면 모두 `data?.payloadField`를 사용 | 통과 | 과다 언랩 없음. |
| nullable·collection shape | EC2/VPC `collection.cloudWatchUsed: false`, nullable IP·상태·포트 등 보존 | BE `AwsServiceImpl.java:517-570`가 두 상세 응답에 `cloudWatchUsed:false`를 넣고, FE `types/cloud-infra.ts:96-192`가 nullable 필드를 동일하게 모델링 | 통과 | 일치 |
| CloudTrail unavailable | 실패를 빈 정상 목록으로 보이지 않고 `items:[] + collection.state='unavailable'`로 반환·안내 | BE `AwsServiceImpl.java:576-599`가 해당 union을 반환, FE type `types/cloud-infra.ts:195-221` 및 `CloudTrailEvents.tsx:27-36`가 경고로 분기 | 통과 | 일치 |
| VPC → EC2 목록 리전 보존 | VPC별 연결 EC2 탐색은 해당 VPC의 `region` 문맥을 유지해야 함 | `VPCGroupList.tsx:59-61`이 `vpcIds=${record.vpcId}&regions=${record.region}`을 함께 전달. EC2 목록은 두 파라미터를 합쳐 API로 전달함(`EC2InstanceList.tsx:33-42`). | 통과 | 재검증 완료. |
| VPC 상세 → EC2 상세 | 연결 EC2 클릭 시 instanceId·region을 전달 | `VPCDetail.tsx:245-249`가 `/ec2-list/:instanceId?region=...`를 생성하며, `EC2OperationalDetail.tsx:14-21`에서 두 값을 사용 | 통과 | 일치 |
| 권한·AWS 설정 gate | 서버에서 `cloudInfraMonitoring.awsResources.view` 강제, FE는 직접 URL도 gate | 모든 신규 endpoint가 `requireAwsResourcesView` 후 `requireConfigured` 실행(`CloudInfraController.java:120-143,156`), route 부모도 `AWS_RESOURCES` PageWrapper + `CloudInfraGate`를 적용(`routes.tsx:443-452`) | 통과 | 클라이언트 숨김에만 의존하지 않음. |
| 기존 유료 EC2 상세 API 잔존 | 이번 무과금 상세 화면은 CloudWatch를 호출하지 않아야 함 | 신규 `EC2OperationalDetail`은 `/ec2/detail`만 호출. 그러나 기존 `/cloud-infras/ec2`와 `getInstanceDetail`은 여전히 `GetMetricData`를 실행(`AwsServiceImpl.java:468-513,644-660`; `services/cloud-infra.ts:100-110`). 현재 해당 hook은 활성 라우트에서 사용되지 않음(`useEC2InstanceDetail.ts:21-35`). | 중간 | 화면 경로의 직접 호출은 제거됐지만 비용 API와 legacy hook이 남아 있음. 무과금 정책을 클라우드 모듈 전체에 적용할지 결정한 뒤, 제거/명시적 유료 기능 격리/권한 분리를 수행할 것. |
| 기존 AWS Overview 유료 수집 | 무과금 강화 범위와 기존 Overview의 비용 경계를 명확히 해야 함 | `EC2Dashboard.tsx:30-33`은 `/cloud-infras/overview`를 호출하며, BE overview는 `GetMetricData`를 사용(`AwsServiceImpl.java:401-456`) | 중간 | 신규 계약의 3개 endpoint에는 해당하지 않지만, 메뉴의 AWS 클라우드 개요를 열면 유료 CloudWatch 조회가 발생. Overview를 수동 실행·유료 표시로 격리하거나 무과금 상태/인벤토리 개요로 교체할지 제품 결정을 문서화할 것. |
| AWS NotFound 예외 매핑 | `InvalidInstanceID.NotFound` → `INSTANCE_NOT_FOUND`, `InvalidVpcID.NotFound` → `VPC_NOT_FOUND`; 다른 AWS 오류는 숨기지 않음 | EC2 상세는 `AwsServiceImpl.java:536-542`, VPC 상세는 `579-585`에서 resource-specific `.NotFound`만 `ApiError`로 변환. `awsNotFoundError`의 양성·음성 케이스는 `AwsServiceImplNotFoundTest.java:11-17`에 있음. 계약도 두 조건을 명시함. | 통과 | 재검증 완료. |

## 결론

- 신규 무과금 상세 API 3종의 path, 요청값, 응답 envelope, nullable shape, CloudTrail unavailable 처리, 권한/설정 gate는 계약과 일치한다.
- VPC 목록의 연결 EC2 링크가 `region`을 보존하도록 수정되어 해당 경계면 결함은 해소됐다.
- 기존 `/cloud-infras/ec2` 및 `/overview` CloudWatch 조회는 신규 상세 기능과 분리되어 있으나, 무과금 정책의 적용 범위를 명확히 하지 않으면 사용자가 비용 없는 화면으로 오해할 수 있다.

## 재검증 메모

- 2026-08-24: VPC → EC2 링크의 `regions` 전달과 AWS NotFound 매핑을 재검증했다.
- `gradlew.bat test --tests com.dmove.moveseye.aws.AwsServiceImplNotFoundTest`는 루트 테스트까지는 수행했으나, `engine-zabbix` 하위 모듈에 같은 테스트가 없어 Gradle의 전역 `--tests` 필터가 `No tests found`로 종료됐다. 이는 대상 테스트의 assertion 실패가 아니라 멀티모듈 필터 적용 방식의 제약이다.
