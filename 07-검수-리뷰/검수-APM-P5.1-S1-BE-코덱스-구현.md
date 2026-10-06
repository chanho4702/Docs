## 구현 완료

`p5-live`의 **P5.1 1단계 수신 관문**을 구현했습니다. 커밋 없이 파일 변경 상태로 남겼습니다.

### 검증 결과

| 항목 | 통과 | 실패 | 스킵 |
|---|---:|---:|---:|
| 최종 `:test` 전체 | **3,249** | **0** | **0** |
| 신규 테스트 | **93** | **0** | **0** |

- 최종 실행: `BUILD SUCCESSFUL`, **5분 33초**
- `LicenseArchitectureTest`, `OtelArchitectureTest`, 기존 저장 OTLP·Live 스트림 테스트 통과
- 압축·해제 경계값, 거짓 Content-Length, 100MiB 해제분 gzip 폭탄, 스팬 수, 인코딩·바인딩·필터 예외 검증
- 실제 Tomcat 소켓에서 정상·chunked 수신, 느린 업로드 타임아웃 및 gzip 슬롯 반환 검증
- [전체 테스트 리포트](/C:/solutions/moveseye-be-spring-p5/build/reports/tests/test/index.html)

## 구현 항목

| 항목 | 구현 내용 |
|---|---|
| 수신·인증 | `POST /apm/otlp-live/v1/traces`. 기존 토큰 인증과 COLLECTOR/ingest 판정을 공용 코드로 재사용 |
| 라이선스·보안 | 직접 APM 라이선스 검사, `@LicenseExempt`, 아키텍처 허용 목록 등록, 전용 permitAll 추가 |
| 오류 응답 | 경로 전용 guard·advice로 OTLP 오류 JSON 반환. 사람용 envelope 차단 |
| 본문 보호 | 압축본 524,288B·해제 후 2,097,152B, 선언 길이 선검사와 실제 계수, 해제 중 즉시 중단 |
| 읽기·동시성 | Servlet 비동기 읽기, 기본 3초 타임아웃, gzip 슬롯 기본 4개, 초과 시 503 |
| 파서 | 전체 트리 없이 선택 파싱, 엄격한 UTF-8, 미지 필드 건너뛰기, 깊이 제한, 1,001번째 스팬에서 413 |
| 설정·계수 | 기본 OFF → 인증·라이선스 통과 후 `503 APM_LIVE_DISABLED`. ON 성공 응답과 AtomicLong 카운터 구현 |

## 변경 파일

**수정 4개**

- [SecurityConfig.java](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/config/SecurityConfig.java)
- [ApmOtlpController.java](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpController.java)
- [application.yml](/C:/solutions/moveseye-be-spring-p5/src/main/resources/application.yml)
- [LicenseArchitectureTest.java](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/license/LicenseArchitectureTest.java)

**신규 구현 10개**

- `collector/ingest/ApmIngestTokenPolicy.java`
- [collector/ingest/live/](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live): `ApmOtlpLiveController.java`, `ApmLiveSpansProperties.java`, `LiveBodyReader.java`, `LiveSpanParser.java`, `LiveIngestGuardFilter.java`, `LiveIngestAdvice.java`, `LiveIngestResponses.java`, `LiveIngestException.java`, `LiveIngestCounters.java`

**신규 테스트·지원 파일 7개**

- [테스트 디렉터리](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/live): `ApmOtlpLiveControllerTest.java`, `ApmLiveSpansPropertiesTest.java`, `LiveSpanParserTest.java`, `LiveIngestFailureTest.java`, `LiveIngestSecurityChainTest.java`, `LiveIngestSocketTest.java`, `LiveIngestTestSupport.java`

## 정본 차이·검수 지점

- **스팬 초과:** 정본의 초과분 partialSuccess 대신, 이번 지시대로 **1,001번째에서 배치 전체 413**입니다. 후속 교체 주석을 남겼습니다.
- **타임아웃:** 정본 §2.3.0에 따라 **408 `APM_LIVE_READ_TIMEOUT`**입니다. 지정된 카운터 목록에서는 `malformed`로 계수합니다.
- **계수 단위:** `accepted`는 **파싱 완료 스팬 수**, `rejected{reason}`은 **거절 요청 수**입니다. 아직 링·집계 성공 수가 아닙니다.
- **gzip 슬롯:** 압축본 버퍼도 제한하기 위해 회선 읽기 시작부터 파싱 완료까지 보유합니다. 느린 요청 4개가 슬롯을 점유하면 추가 gzip 요청은 503입니다.
- **회수 토큰:** 기존 COLLECTOR 인증의 회수 거절 → 401을 유지합니다. `APM_TOKEN_REVOKED` 예외가 전달되면 해당 코드도 보존합니다.
- **인증 DB 접근:** 메타 캐시는 후속 범위이므로 기존 토큰 서비스의 DB 조회가 남아 있습니다.

## 미구현·보류

요청 범위 밖인 **링·집계·dedup·SSE·메타 캐시·조회/보존 EP·Collector 라이브 YAML·설치 가이드**는 구현하지 않았습니다. 정본·계약서·Obsidian 등 worktree 밖 문서도 수정하지 않았습니다.
