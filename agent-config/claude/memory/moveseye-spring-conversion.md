---
name: moveseye-spring-conversion
description: "moveseye-be(NestJS)를 Spring Boot로 변환 중 — 산출물 위치, 승인된 결정, 모듈 진행 순서"
metadata: 
  node_type: memory
  type: project
  originSessionId: a2cae85a-fb41-4add-a0ef-be5a54d79705
---

moveseye-be(NestJS)를 Spring Boot 3.3/Java 17로 변환하는 작업이 2026-06-10 시작됨.
산출물: `C:\solutions\moveseye-be-spring\` (진행 현황표는 그 README.md).

**2026-06-22 채택 확정: 백엔드는 Spring 단일로 결정**(Nest 병행 종료 → [[be-dual-maintenance]]). 변환은 사실상 완료 상태였고, 이제 이 구현이 정본이다. 앞으로 새 기능은 Spring에만 반영한다.

**승인된 결정**: Gradle Kotlin DSL / Flyway baseline(`ddl-auto: none`) / **403도 HTTP 200 반환하는 원본 버그 동작 보존**, 401만 실상태코드.

**진행**: 공통+auth(1차), user 26개 EP(2차), zabbix+zabbix-sync(3차) 완료 — 모두 2026-06-10. `gradlew build` 성공 + 실 Zabbix 7.0.6 연동 검증(logout이 user.login→캐시→user.logout 거쳐 success). JWT는 시크릿 160비트 문제로 jjwt→auth0 java-jwt 교체. zabbix JSON-RPC는 본문을 직렬화 문자열로 보내야 함(객체 본문=chunked→Zabbix "Invalid JSON"). setting·email·admin(user 3+role 2 EP, 기본 admin 시드 @PostConstruct) 완료. 6개 모듈 변환됨(auth/user/zabbix+sync/setting/email/admin). **host 모듈 진행 중**: 기반(Zabbix item/history/trend 서비스+impl, MetricUtils, ZabbixItemKey, DateRangeFilterDto) + 메트릭 하위 6종 + host event 완료(+ ZabbixProblemService get/getCount, HostStatus enum, ZabbixHostGetParams에 hostids 추가). 빌드 성공. **FE 사이드바 미표시 이슈 해결(2026-06-10).** 증상: admin(ADMIN) 로그인 시 사이드바 사라짐. 근인: FE SideNav `if(!permissions) return []` → permissions는 GET /users/role/permission?type=ADMIN&platform=DMOVE 응답(DMoveModule[])으로 채워지는데 이게 403(HTTP200 body code403) 반환됨. 회귀원인: 원본 user.controller는 @UseGuards에 RolesGuard 없음 → @Roles(SUPER_ADMIN)가 무시됐는데(setting.controller도 동일), Spring은 RolesInterceptor 전역등록으로 모든 @Roles 강제→원본에 없던 차단 추가. 수정: @RolesGuarded 마커(=원본 @UseGuards(RolesGuard)) 도입, RolesInterceptor는 빈클래스에 @RolesGuarded 있을때만 @Roles 검사. 원본 RolesGuard 걸린 AdminUserController/AdminUsrgrpController에만 마커 추가, user/setting은 마커없어 @Roles 무시(원본 동작 1:1). 검증: admin→role/permission 200, 9모듈 정상→사이드바 복구. ⚠️교훈: NestJS @Roles는 RolesGuard가 @UseGuards로 걸린 컨트롤러에서만 유효, 데코레이터만으론 무효. Spring 인터셉터 전역등록 시 이 적용범위 차이 주의.

**단위 테스트 대표 세트 포팅(2026-06-10).** JUnit5+Mockito+AssertJ. ⚠️ Gradle9는 JUnit Platform launcher 자동 미추가 → testRuntimeOnly("org.junit.platform:junit-platform-launcher") 필수(없으면 "Failed to load JUnit Platform"). 포팅: CommonUtilsTest(escapeString/escapeHtml/escapeLike/random), MetricUtilsTest(bytesToMB/KB·isMoreThan1Hour·max/minValue·parseLsblkOutput), HostStatusTest(fromSeverity), AuthServiceTest(login 5케이스 Mockito), EventServiceTest(acknowledge 비트마스크+suppressUntil epoch, ArgumentCaptor). 전부 그린. ⚠️ ApiError.getMessage()=ErrorCode.getCode() 문자열. User는 Mockito.mock으로. 원본 22개 spec 중 핵심부터, 나머지 동일 패턴 점진 확대 가능.

**UserCommand/EmailCommand 변환 생략 결정(2026-06-10).** 원본 user.command.ts/email.command.ts의 @MessagePattern은 원본에서도 dead code: main.ts에 connectMicroservice/startAllMicroservices/createMicroservice 전무(HTTP app.listen만), 모든 start스크립트 dist/main, 호출 클라이언트(ClientsModule/ClientProxy)도 없음. 위임로직(getUserByField, EmailService.send*)은 이미 Spring 존재. 변환하면 원본에 없던 transport 신설=계약 1:1 보존 위배+중복이라 생략. 향후 MQ 필요시 @RabbitListener 등 별도 신설.

**정상 로그인 E2E 완료(2026-06-10, 실 Zabbix 7.0.6).** zabbix 연동 USER는 DB password NULL(이메일인증 온보딩)이라 guest(USER)·Admin(id57, zabbix_userid1=Zabbix SuperAdmin)에 pgcrypto crypt(gen_salt('bf',10)) bcrypt 임시주입→테스트후 NULL 원복(dev DB 원상복구). POST /auth/login 200+JWT+실 Zabbix API토큰 발급. JWT+x-visitor-id로 /users/my-profile 200, /event/problems 200(total335/statusCounts937 실데이터 트리), /event/bells 200(total60), /event/{id} 200(event+trigger), /event/problems/{id} 200(isAcknowledged/isSuppressed/isHostDisabled 키 노출=Boolean래퍼 검증), occurrenceTime .000Z moment포맷 일치. EventSyncService cron 실동작(46 events). ⚠️ guest는 Zabbix problem.get No permissions→INVALID_TOKEN 매핑(원본 권한 의존 거동). bcrypt $2a$(pgcrypto)도 Spring BCryptPasswordEncoder 검증 OK.

**Flyway V1 baseline 완료·검증(2026-06-10).** db/migration/V1__baseline.sql = dev DB(dmove) pg_dump --schema-only(테이블14+enum11+제약/FK/인덱스). ⚠️ pg_dump18의 \restrict/\unrestrict psql 메타명령 제거 필수(Flyway 파싱 불가). pg_dump 경로 C:\Program Files\PostgreSQL\18\bin. 검증: 임시 빈DB(dmove_fwtest)에 SPRING_FLYWAY_ENABLED=true 기동→"applied 1 migration, now at v1"→테이블/enum 생성+401 확인 후 임시DB drop(dev 미접촉). baseline 규칙: 빈DB는 V1실행/기존DB는 baseline-version=1로 V1스킵, 변경은 V2부터. ⚠️ dev DB에 과거 flyway_schema_history 잔재 가능성(덤프는 --exclude-table 제외).

**🎉 전체 9개 기능 모듈 변환 완료(2026-06-10).** event 최상위 모듈 완료(8EP: acknowledge/problems/bells/problems:id/:id/:id-acknowledge GET/list-previous/isRead + 동기화 2 cron). EventProblem·EventReadStatus JPA 엔티티 + native upsert(JdbcTemplate, ON CONFLICT — read_status는 is_read 미갱신 보존). ZabbixEventService 신설(event.get/getCount/acknowledge raw), ZabbixProblemService.getCountRaw 추가, getAlerts는 getTriggersRaw 재사용. ⚠️ 계약보존: 시간은 moment.toISOString()과 동일 .SSS'Z' String, resolutionTime 미해결시 "Pending"; EventProblemResDto는 problems(트리/info/children)·bells(status/isRead) 공유 + NON_NULL, status 필드 보존; ProblemDetailResDto의 is-접두 boolean은 Lombok 키변형 회피 위해 Boolean 래퍼. 빌드·기동·8라우트(401) 검증. 남은 것은 부가작업뿐(UserCommand 전송수단 미정, Flyway baseline, 테스트, AWS 실연동).

**aws 모듈 완료(5EP: regions/vpcs/ec2s/ec2-dashboard/ec2, AWS SDK v2 EC2/CloudWatch, AwsServiceStub→AwsServiceImpl, host EC2S 실동작). ⚠️ AwsService.Instance→InstanceRef rename(AWS SDK Instance와 이름충돌). build.gradle aws bom 2.28.29.**

**host 모듈 완료(13/13 메인 EP + 메트릭6 + event)** — getHostGroup(/hostgroups)·getHostNetwork(/hosts-network) 마지막 추가. 전 라우트 매핑·기동(401) 검증. → **7개 모듈 완료**(auth/user/zabbix+sync/setting/email/admin/host). **다음: aws 모듈**(CloudWatch/EC2, AwsServiceStub 교체 → host EC2S recently-viewed 실동작), event 최상위, UserCommand, Flyway baseline/테스트. ⚠️ ServerMonitoringDto.alerts 원본 버그로 항상 null, getHostItems cpuUsage 0 보존. 헬퍼 추가: ZabbixHostService.getRaw(List<Map>, 풍부한 host.get), ItemGetParams.filterInterfaceid, ZabbixHistoryService.getRange(raw history), ZabbixBasicItem.interfaceid. **다음: 메인 host 집계 잔여 7EP**(getHostGroup/getServers/getHostNetwork/getProblemsByHostGroup/getHostGroupDetail/getHostGroupDetailProblems/getInterfaceDetails — host.service 64KB). getInterfaceDetails 매우 복잡(중첩 itemMap·discovery), getServers/getHostGroup 대형. EC2S/cloud는 AwsService 스텁. RecentlyViewed.region은 원본 엔티티에 없어 무시. 공통: DataTimestampDto(itemid 없는 집계용), interface 패키지=hostinterface, network type=String('SUM'), event 정렬 quirk 보존. 잔여: 최상위 event/aws, UserCommand. 패턴: 각 메트릭 service는 ZabbixItemService.get/getByListKey + ZabbixHistoryService/TrendService, DTO는 dto/ 하위, controller는 @VisitorIdCheck+@RequestMapping("/host"). **보류: FE 사이드 패널(네비 메뉴) 미표시 이슈** — 권한/메뉴 API 응답형식 의심, FE 콘솔 정보 받으면 디버깅. 전체 로드맵은 moveseye-be-spring/README.md "남은 작업 로드맵" 섹션이 정본.

**빌드 환경**: JDK 17은 `C:\Program Files\Java\jdk-17`(시스템 기본은 Java 8 → `$env:JAVA_HOME` 지정 필수). Gradle Wrapper(9.2.1) 생성됨 — `.\gradlew.bat build -x test`. **이 PC에서 실제 빌드/기동/테스트 가능 확인(2026-06-18)** — `gradlew build` 전체 테스트 통과, `gradlew bootRun -x test`로 3000 기동·login 200까지 검증됨(과거 "컴파일 검증 불가" 메모는 무효).

**⚠️ Spring 기동 함정(2026-06-18, 두 번 막힘)**: `gradlew bootRun`이 `${DB_HOST}`/jdbcUrl 치환은 되는데 DB 연결만 실패(`Driver claims to not accept jdbcUrl` / `Unable to determine Dialect`)하면 **`.env`의 CRLF(`\r`)가 범인**이다. env 값 끝의 CR을 strip해서 export해야 함. 기동 레시피: `.env` 로드(CR 제거) + `SPRING_FLYWAY_ENABLED=false`(이미 baseline된 dev DB) + `JAVA_HOME=jdk-17` export 후 `gradlew bootRun -x test`(~6초, "Started MoveseyeApplication", Tomcat port 3000). 포트 3000에 이미 java가 떠 있어도 포팅 전 구 바이너리일 수 있으니 코드 변경 후엔 반드시 재기동.

**Why:** API 계약 1:1 보존이 최우선 원칙(FE가 기존 동작에 결합됨). 세부 발견사항은 옵시디언 노트 `claude-experiences/projects/moveseye/2026-06-10-spring-conversion.md` 참조.

**How to apply:** 후속 모듈 변환 요청 시 위 README 현황표와 옵시디언 노트를 먼저 확인하고, 0단계 분석→승인→모듈 단위 변환 워크플로를 유지한다. 이 PC에는 JDK 17/Gradle이 없어 컴파일 검증 불가 상태임을 기억할 것.
