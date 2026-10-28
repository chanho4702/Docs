# AWS 무과금 인프라 상세 모니터링 런타임 QA

- 검증일: 2026-08-24
- 대상 계약: `_workspace/contract_aws-free-monitoring.md`
- 실행 환경: 기존 공유 Spring `:3000` (PID 29208, 15:26 기동), Vite `:5173` (PID 13880, 15:25 기동)
- 제약: 공유 프로세스를 중단·재기동하지 않았으며, 관리자 인증은 기존 dev seed 계정을 사용했다. AWS 리소스 생성·변경은 수행하지 않았다.

## 결과 요약

| 항목 | 결과 | 실제 증거 |
|---|---|---|
| 인증 없는 EC2/VPC 상세·CloudTrail 차단 | 통과 | 세 endpoint 모두 HTTP 401, body `{"status":"error","code":401,"message":"INVALID_TOKEN"}` |
| 관리자 인증 | 통과 | `POST /auth/login`이 HTTP 200, HttpOnly `accessToken` 쿠키를 발급 |
| VPC 상세 해피 패스 | 통과 | `GET /cloud-infras/vpcs/detail?vpcId=vpc-0ea1f08815b1de501&region=ap-northeast-2` → HTTP 200 / `collection.cloudWatchUsed:false` |
| VPC 구성·노출 진단 | 통과 | subnet 4건, route table/IGW/SG 및 public-IP 자동할당 warning 4건, `0.0.0.0/0:22` critical 1건 반환 |
| CloudTrail Event history | 통과 | `GET /cloud-infras/cloudtrail/events?region=ap-northeast-2&maxResults=999` → HTTP 200, `collection={state:"ok", retentionDays:90, nextTokenAvailable:false}` |
| CloudTrail 필터 우선순위 | 통과 | `resourceId`와 `eventName` 동시 전달 시 HTTP 200 빈 목록; 계약대로 `resourceId`가 우선 적용됨 |
| 존재하지 않는 EC2/VPC 오류 | 실패 | 계약의 `INSTANCE_NOT_FOUND` / `VPC_NOT_FOUND` 대신 HTTP 500 발생 (아래 P1) |
| 상세 화면 CloudWatch 미호출 | 통과 | 상세 서비스 메서드에 `GetMetricData` 경로가 없고, 실제 VPC 상세 response `collection.cloudWatchUsed:false`; FE API 단위 테스트 통과 |

## 재현 명령

관리자 로그인으로 발급한 HttpOnly `accessToken` 쿠키와 `x-visitor-id`를 사용했다. 쿠키 값은 기록하지 않는다.

```powershell
# 인증 없이: 세 endpoint 모두 401 INVALID_TOKEN
curl.exe -i "http://localhost:3000/cloud-infras/ec2/detail?instanceId=i-qa-probe&region=ap-northeast-2"
curl.exe -i "http://localhost:3000/cloud-infras/vpcs/detail?vpcId=vpc-qa-probe&region=ap-northeast-2"
curl.exe -i "http://localhost:3000/cloud-infras/cloudtrail/events?region=ap-northeast-2"

# 인증 후 실제 VPC 상세
curl.exe -i -b <cookie-jar> -H "x-visitor-id: qa-aws-free-monitoring" \
  "http://localhost:3000/cloud-infras/vpcs/detail?vpcId=vpc-0ea1f08815b1de501&region=ap-northeast-2"

# 인증 후 CloudTrail Event history (maxResults는 서버가 1~50으로 clamp)
curl.exe -i -b <cookie-jar> -H "x-visitor-id: qa-aws-free-monitoring" \
  "http://localhost:3000/cloud-infras/cloudtrail/events?region=ap-northeast-2&maxResults=999"
```

## P1 — 존재하지 않는 리소스가 계약 오류가 아닌 HTTP 500

아래 두 요청은 모두 HTTP 500 `{"statusCode":500,"message":"Internal server error"}`를 반환했다.

```text
GET /cloud-infras/ec2/detail?instanceId=i-qa-probe&region=ap-northeast-2
GET /cloud-infras/vpcs/detail?vpcId=vpc-qa-probe&region=ap-northeast-2
```

계약은 각각 `INSTANCE_NOT_FOUND`, `VPC_NOT_FOUND`를 요구한다. `AwsServiceImpl`의 `getEc2OperationalDetail()` / `getVpcDetail()`은 AWS `Describe*` 호출 결과가 빈 경우만 `ApiError`로 전환하고, AWS SDK의 not-found 예외는 그대로 전파한다. 따라서 존재하지 않는 ID는 UI에서 의도한 빈/오류 안내 대신 서버 오류가 된다.

- 관련 구현: `moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java:517`, `:539`
- 권장 조치: AWS SDK의 `InvalidInstanceID.NotFound` / `InvalidVpcID.NotFound` 예외를 각각 기존 `ApiError(ErrorCode.INSTANCE_NOT_FOUND)` / `ApiError(ErrorCode.VPC_NOT_FOUND)`로 매핑하고 동일 요청을 재검증한다.

### 수정 후 재검증 (2026-08-24)

BE 소스에는 `Ec2Exception`의 `InvalidInstanceID.NotFound` / `InvalidVpcID.NotFound`를 각각 계약 오류로 변환하는 수정이 반영되어 있다. 단위 테스트도 다음 명령으로 통과했다.

```powershell
cd C:\solutions\moveseye-be-spring
.\gradlew.bat :test --tests com.dmove.moveseye.aws.AwsServiceImplNotFoundTest
# BUILD SUCCESSFUL
```

그러나 공유 `:3000` 프로세스는 수정 클래스가 반영되기 전 기동된 상태라, 같은 관리자 인증 요청을 재실행해도 여전히 두 endpoint가 HTTP 500을 반환했다. 즉 소스·단위 테스트는 통과했지만 **현재 실행 중인 서버에서의 P1은 아직 미해결**이다.

재기동 권한을 가진 담당자가 Spring 프로세스를 새 빌드로 재기동한 뒤 아래 두 요청을 다시 실행해 body `code`가 각각 `INSTANCE_NOT_FOUND`, `VPC_NOT_FOUND`인지 확인해야 한다.

```text
GET /cloud-infras/ec2/detail?instanceId=i-qa-probe&region=ap-northeast-2
GET /cloud-infras/vpcs/detail?vpcId=vpc-qa-probe&region=ap-northeast-2
```

## 비용 안전성 확인

- 상세 API 구현(`getEc2OperationalDetail`, `getVpcDetail`)은 EC2 `Describe*`만 사용한다.
- CloudTrail은 `LookupEvents`만 사용하며 response가 90일 Event history 범위를 명시한다.
- `GetMetricData` 사용은 `overview` 및 기존 EC2 metric 메서드에만 존재하며 상세 메서드 범위에는 없다.
- 실제 VPC 상세 response는 `collection.cloudWatchUsed:false`였다.
- FE API 호출 검증: `yarn jest src/__tests__/cloudInfraOperationalApi.test.ts --runInBand` → 2/2 통과. EC2/VPC 상세 및 CloudTrail URL/params 전달을 확인했다.

## UI 확인 범위

Vite SPA는 상세 URL에 HTTP 200으로 진입 shell을 제공했다. 실제 데이터 UI DOM 확인은 브라우저 인증 세션 자동화 도구가 이 QA 환경에 연결되어 있지 않아 수행하지 못했다. API의 해피 패스(VPC)와 CloudTrail 응답, FE API 호출 테스트로 연결 경로를 확인했으며, P1 수정 후 로그인 브라우저에서 VPC 상세와 CloudTrail 테이블을 한 번 더 확인해야 한다.
