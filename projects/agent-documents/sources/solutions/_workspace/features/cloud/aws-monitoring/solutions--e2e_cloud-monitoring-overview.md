# Cloud monitoring overview 런타임 QA

- 검증일: 2026-08-24
- 범위: `GET /cloud-infras/overview`, Cloud Overview 진입 URL 및 `range`/`regions` 전달 경로
- 제약: 공유 중인 BE(:3000)·FE(:5173)는 중단하거나 재기동하지 않았다. 따라서 실행 중 BE가 새 구현을 반영했는지 먼저 확인했다.

## 결과 요약

**보류 (배포 전 런타임 검증 불가).** 소스와 단위 테스트는 새 Overview API를 포함하지만, 현재 :3000 프로세스는 해당 엔드포인트를 올린 빌드가 아니어서 인증된 ADMIN 요청도 404를 반환한다. FE :5173은 새 라우트의 SPA 진입 HTML을 정상 반환한다. 신규 BE를 별도 포트에 기동한 뒤 아래 API/화면 흐름을 재실행해야 한다.

## 실행 환경

| 대상 | 관측 | 결과 |
|---|---|---|
| BE | `localhost:3000`에서 Java PID 20348이 listen | 실행 중이나 신규 API 미반영 |
| FE | `localhost:5173`에서 Vite(Node PID 28756)가 listen | 실행 중 |

## 검증 기록

| 흐름 | 재현/입력 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| 미인증 API | `GET /cloud-infras/overview` | 인증 거부 | HTTP 401, `{"status":"error","code":401,"message":"INVALID_TOKEN"}` | 통과 (인증 경계) |
| ADMIN API | 로컬 dev ADMIN으로 로그인 후 cookie + `x-visitor-id`를 포함해 `GET /cloud-infras/overview?range=1h` | 200 data 또는 AWS 미설정 계약 오류 | HTTP 404, `{"statusCode":404,"message":"Not Found"}` | 보류 — 실행 중 BE가 구 버전 |
| 잘못된 query | `range=invalid`, `range=1h&from=...&to=...`, region 21개 | HTTP 200 / `INVALID_QUERY` | API 자체가 404여서 도달 불가 | 보류 |
| AWS 미설정 | 인증된 ADMIN 요청 | `CLOUD_NOT_CONFIGURED` | API 자체가 404여서 도달 불가 | 보류 |
| 부분 실패 | 일부 AWS 리전 수집 실패 | 다른 리전 data 보존 + `collection.regions[].*.state/reason` | 실제 AWS 수집 endpoint에 도달 불가 | 보류 |
| FE 직접 진입 | `/cloud-infra-monitoring/ec2-dashboard?range=6h&regions=ap-northeast-2` | Vite SPA 진입 가능, 앱에서 URL로 query 전달 | HTTP 200, Vite SPA HTML 반환 | 통과 (서버 진입) |

## 보조 검증

- `moveseyee_fe`: `yarn tsc --noEmit` 통과.
- `moveseye-be-spring/build/test-results/test/TEST-com.dmove.moveseye.aws.dto.CloudOverviewQueryDtoTest.xml`: 3 tests, failures 0, errors 0.
  - 기본 `1h` 및 서버 period 선택
  - 7일 초과/region 20개 초과 거부
  - `range`와 명시 기간 동시 전달 거부
- 전체 Gradle `--tests` 필터는 멀티모듈의 test 없는 `engine-zabbix`에도 필터가 전달되어 실패한다. 이는 API 결함이 아니라 Gradle 실행 방식의 제약이며, 위의 실제 XML 결과로 query DTO 테스트 통과를 확인했다.

## 확인된 FE 동작 경로

`EC2Dashboard`는 URL의 `regions`와 `range`를 query string으로 보존하고, range selector(`1h`, `6h`, `24h`, `7d`) 변경 시 `useQueryParams.updateParams`로 URL을 갱신한다. Overview data가 들어오면 위험 리소스, CPU/Network Top, Alarm, 리전별 수집 상태를 렌더하도록 연결되어 있다. 단, 로그인한 브라우저에서의 data 렌더링은 신규 BE 기동 전에는 endpoint 404로 검증할 수 없다.

## 재실행 절차

1. 다른 공유 프로세스를 건드리지 않는 포트에서 신규 Spring 빌드를 기동한다(예: `SERVER_PORT=3001` 및 현 개발 DB/AWS 환경 변수 유지).
2. ADMIN 로그인 cookie와 `x-visitor-id`를 사용해 아래를 호출한다.

   ```text
   GET /cloud-infras/overview?range=1h
   GET /cloud-infras/overview?regions=ap-northeast-2&range=6h
   GET /cloud-infras/overview?range=invalid
   ```

3. 성공 시 `summary`, `collection`, `riskResources`, `trends`, `alarms`의 값과 partial/unavailable reason을 계약서와 대조한다.
4. FE의 API base URL을 해당 포트로 연결한 후 ADMIN으로 로그인해 Overview 진입, range 변경, region 필터, 부분 실패 배지와 빈 metric 상태를 DOM으로 확인한다.
