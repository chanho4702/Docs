---
name: aws-cred-single-source
description: "Spring aws 모듈 자격증명을 하이브리드(DB Setting(CLOUD) 우선, 없으면 .env/IAM 표준 체인)로 통일 — 원본 1:1 이탈"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5aad34a9-af49-424f-969b-c09ac651ddd6
---

**2026-07-01 결정: Spring `moveseye-be-spring` aws 모듈의 AWS 자격증명을 하이브리드 단일 흐름으로 통일했다.** 사용자가 "1:1 안 해도 됨, 더 나은 로직 OK" + ".env 키로 자동 모니터링 원함"이라 원본 계약 보존 예외로 진행.

**하이브리드 로직(EC2·CloudWatch 공통):** `DB setting(type=CLOUD)`에 자격증명이 있으면 우선 사용, 없거나 비면 AWS 표준 자격증명 체인(`DefaultCredentialsProvider`) = `.env`의 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`(실행 스크립트가 프로세스 env로 export), IAM 역할·프로파일 등을 자동 인식. 리전은 region 파라미터 → setting.defaultRegion → 표준 리전 체인(`AWS_REGION`) → `us-east-1` 순.

**이전(원본 Nest 그대로 포팅):** EC2/VPC/regions는 DB `Setting(CLOUD)`, CloudWatch 지표만 별도 env `app.aws.accessKeyId/secretKey`(`AwsProperties`)로 이원화 → "목록은 뜨는데 상세 그래프만 빈" 함정. `app.aws`는 `.env` 표준 `AWS_ACCESS_KEY_ID`와 이름이 달라 연결도 안 됐음.

**변경 파일:** `AwsServiceImpl.java`(`dbCredsOrNull`/`credentialsProvider`/`resolveRegion` 하이브리드, ec2Client·cloudWatchClient 공통화), `AwsService.java` 주석, `config/AwsProperties.java` 삭제(@ConfigurationPropertiesScan 등록이라 안전). build + test 그린.

**성능(2026-07-01 같이 개선): AWS 조회 병렬화.** 원인 = `getVpcs`/`listInstancesDetailed`/`summaryInstances`가 전 리전(~20개)을 **순차** 루프(리전당 2~3콜=40~60콜 순차)라 15~30초. `getEc2`도 CloudWatch 지표 8개 순차(원본 Nest는 Promise.all 병렬인데 포팅서 퇴화). 조치 = 공용 `runParallel()`(제한 스레드풀 16, 제출 순서 보존, 리전별 실패 skip)로 리전 팬아웃 + 8지표를 병렬화 → 벽시계 합계→최대 1건(~2~3초). 응답 shape/순서 불변. 추가 여지: 전 리전 대신 defaultRegion/자원 있는 리전만 스캔.

**How to apply:**
- AWS 모니터링 켜는 법 2가지: (1) `.env`에 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`(이미 존재) → 별도 조치 없이 자동, (2) 설정화면(설정>클라우드 인프라, `POST /settings/cloud-infra`)에서 username=AccessKeyId·password=SecretKey·defaultRegion 저장 → DB 우선 사용. **DB가 env보다 우선.**
- 미설정(`SETTING_NOT_FOUND`)을 더 이상 강제로 안 던짐 — DB 없으면 표준 체인 시도. 둘 다 없을 때만 AWS SDK가 credential 로드 실패로 던짐.
- dev DB `setting` 테이블은 현재 **0행**이지만 `.env`에 AWS 키가 있으므로, 재기동하면 env 자격증명으로 자동 모니터링됨.
- 이 변경은 :3000(bootRun) 재기동해야 반영됨. BE 가이드의 "CloudWatch=app.aws" 서술은 stale.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-dual-maintenance|be-dual-maintenance]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--moveseye-spring-conversion|moveseye-spring-conversion]].
