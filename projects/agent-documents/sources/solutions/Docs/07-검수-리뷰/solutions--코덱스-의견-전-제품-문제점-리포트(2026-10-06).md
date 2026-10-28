# 코덱스 의견 — 전 제품 문제점 리포트(2026-10-06)

- 28건 중 판정은 **동의 20건, 부분 동의 7건, 반대 1건**이다. 중요도는 **높음 22건, 중간 5건, 낮음·해소 1건**으로 본다.
- 가장 큰 정정은 `APV-01`이다. 검토 시점 BE는 보고서 기준 `e55948c`가 아니라 `aab73fc`이며, 과거 원문 비관리자 노출은 이미 수정됐다.
- “결정 필요” 8건 중 5건은 이미 설계·계약·ADR에서 결정됐다. 특히 맵 전 사용자 편집, 합성 감시 서비스 계정, APM `DOWN`, MCP 확인 게이트는 미결정이 아니다.
- 중간 항목 표본 26건 중 **24건은 코드와 일치**, 1건은 중요도 과장, 1건은 실행하지 않아 미확인이다. 코드 관찰 자체는 대체로 정확하지만 중요도·정책 상태·운영 영향이 섞여 있다.
- 요청에 따라 빌드·테스트·서버·HTTP 호출은 하지 않았으며, 현재 작업 트리를 포함한 정적 코드와 Git 이력만 확인했다.

## A. 높음 28건 재판정

| ID | 판정 | 적정 중요도 | 근거(파일:행과 한 줄) | 리포트가 놓쳤거나 틀린 점 |
|---|---|---:|---|---|
| HOME-01 | 동의 | 높음 | `home/HomeWidgetService.java:27`이 `new DashboardWidgetService(...)`로 직접 생성. 본 서비스의 `DashboardWidgetService.java:92-103,118-123`에만 `@Transactional`이 있다. | 해당 두 메서드뿐 아니라 직접 생성된 본체의 모든 프록시 기반 부가기능이 우회된다. |
| MON-01 | 부분 동의 | 중간 | `HostService.java:1647,1680-1687`, `NetworkService.java:344-347`이 `[...,bytes]` 계열을 전제한다. | 코드의 불일치는 확실하지만 실제 설치 템플릿 보유 여부는 확인하지 않았다. 모든 설치의 높음급 장애로 일반화한 것은 과하다. |
| MON-02 | 동의 | 중간 | `MemoryService.java:125,136,149-151`에서 `%`인 `SWAP_UTILIZATION`에 MB 변환이 적용되고, `useMemoryChart.ts:18-29`의 단위도 반대다. | 실제 버그다. 다만 단일 차트 표시 결함이므로 제품 전체 “높음”보다는 중간이 적정하다. |
| MON-03 | 동의 | 높음 | `HostController.java:269-279`가 요청자 `CallerContext`를 넘기고 `ReportService.java:245-250,330-367`이 그 결과를 공용 스냅샷으로 저장한다. | 최초 조회자 범위가 정본이 되는 문제와, 반대로 관리자 생성본이 제한 사용자에게 노출되는 문제가 함께 있다. |
| EVT-01 | 부분 동의 | 높음 | `V1__baseline.sql:200`은 `name varchar(255)`, `EventSyncService.java:504-542`는 원문을 그대로 쓰고 `:265-269`는 오류를 재포장한다. | Zabbix 7의 확장된 문제명은 255자를 넘을 수 있다. 다만 외부 호출까지 포함한 전체 동기화가 DB 트랜잭션 하나는 아니므로, 실패 전 청크가 이미 반영될 수 있다. “전부 롤백”이 아니라 **부분 반영 후 반복 실패**가 더 정확하다. |
| EVT-02 | 동의 | 높음 | `useSetDefaultDate.ts:13-19`, `ProblemList.tsx:308-313`이 진입 시각 `to`를 URL에 고정하고, `EventService.java:508-510`이 그대로 상한으로 쓴다. | SSE가 재조회만 할 뿐 시간창을 전진시키지 않는다는 지적이 맞다. |
| EVT-03 | 동의 | 높음 | `EventSyncService.java:103,162-166,287-290,617-622`가 정렬·페이지 없이 10,000건 한 번만 읽는다. | 초과분의 선택이 비결정적이며, 초과 시 되짚기까지 중단된다. |
| EVT-04 | 동의 | 높음 | `EventProblemRepository.java:82`, `EventService.java:508-510,641-642,802-821`이 기간 행을 먼저 전량 읽고 Java에서 필터링한다. | 30일 해결분까지 벨 폴링에 들어오는 점이 특히 위험하다. |
| EVT-05 | 동의 | 높음 | `EventSyncService.java:182-235,705-717`이 열린 문제와 사용자 조합을 만들고 `false` 행도 저장한다. | 읽지 않은 상태는 행 부재로 표현할 수 있어 대부분의 생성 행이 불필요하다. |
| AST-01 | 동의 | 높음 | `AssetController.java:63-100`의 조회에는 `requireAdmin`·호스트 범위 검사가 없고, 쓰기만 `:115` 이후 관리자 검사다. | 우발적 누락은 아니다. `contract_assets-core.md:90`에서 조회 `U`로 정한 기존 결정이므로 “결정되지 않음”이 아니라 재검토가 필요한 설계 부채다. |
| AST-02 | 동의 | 높음 | `SearchAssetListDto.java:86`이 최대 100으로 제한하는 반면 FE export는 1,000을 요청한다. | 경고도 `>=1000`을 기준으로 하므로 101~999건은 조용히 잘린다. |
| AST-03 | 동의 | 중간 | `AssetSyncService.java:163-226`은 이번 응답에 있는 호스트만 upsert하며, 사라진 Zabbix 호스트를 해제하는 경로가 없다. | 현상은 맞지만 삭제 정책이 없다는 문제다. 즉시 데이터 삭제보다 “원천에서 사라짐” 상태 추가가 안전하다. |
| MAP-01 | 동의 | 높음 | `PinDetailPanel.tsx:149`가 `/asset/list/{hostid}`로 이동하지만 `AssetController.java:91`은 자산 PK를 받는다. | 같은 hostid에 복수 자산이 가능한데 “첫 자산 ID”를 임의 선택하는 수정도 위험하다. |
| MAP-02 | 동의 | 높음 | `useNetworkMap.ts:77`이 `/hosts/server`를 쓰고 `HostService.java:1616,1626`이 `device_type=server`를 요구한다. | `devdesign_network-maps.md:103`에는 분류 제한 없는 검색형 호스트 목록이 이미 명시돼 있다. 정책 질문이 아니라 구현 결함이다. |
| MAP-03 | 부분 동의 | 높음 | `geoMap.ts:17`, `MapCanvas.tsx:21,128,155`에서 외부 스타일의 `load` 뒤에만 핀 레이어를 만든다. | 폐쇄망 전제에서는 높음이 맞다. 다만 “타일 실패 상태에서도 바로 레이어 추가”는 MapLibre의 유효 style이 필요하므로, 명시적인 내장 빈 style로 전환해야 한다. |
| ZCF-01 | 동의 | 높음 | `HostManageService.java:203-210,693-700`이 Agent 인터페이스 한 개만 `host.update.interfaces`에 싣는다. | Zabbix 7에서 `interfaces`는 교체 의미다. 생략 인터페이스는 삭제 대상이며, 아이템이 물린 인터페이스라면 조용한 삭제 대신 요청 전체가 거부될 수 있다. 보고서는 이 거부 경로를 빠뜨렸다. |
| ZCF-02 | 동의 | 높음 | `HostGroupService.java:184-190`, `ZabbixHostGroupServiceImpl.java:55-65,77-80`이 로컬 사본 호스트 목록으로 `hostgroup.massupdate`를 호출한다. | `massupdate`도 대상 그룹의 소속 교체 의미다. 누락 호스트가 다른 그룹을 가지고 있으면 제거되고, 유일한 그룹을 잃는 상황이면 Zabbix가 거부할 수 있다. |
| ZOP-01 | 부분 동의 | 중간 | `ZabbixScriptManageController.java:46-90`은 관리자 검사 후 `ZabbixScriptManageService.java:70-167`에서 서비스 계정 토큰으로 실행한다. | `contract_script.md`에 명시된 의도된 서비스 계정 모델이다. 관리자 전용이라는 추가 경계가 있어 일반 권한 상승과 동일하게 높음으로 볼 근거는 부족하다. |
| CLD-01 | 동의 | 높음 | `AwsReadOnlyGateway.java:165-174`가 `includeAllInstances(true)`, `AwsServiceImpl.java:893-911`과 `Ec2StatusRules.java:26-52`가 `ok` 외 값을 실패로 만든다. | 비실행 인스턴스의 `not-applicable`, 시작 중의 `initializing`이 실제로 실패 집계된다. `stopped`만 별도 처리하며 `pending` 분기는 검사 실패 뒤라 도달하지 못할 수 있다. |
| CLD-02 | 부분 동의 | 높음 | `CloudSnapshotService.java:132-133`, `CloudInstanceSnapshotRepository.java:18-36`, `CloudCostEstimateService.java:69-73`이 인스턴스별 5분 행을 장기간 집계한다. | 1,000대·30일 864만 행 산식은 맞다. 다만 실제 실행계획과 응답시간은 측정하지 않았고, 인스턴스별 기록 자체는 비용 계산을 위한 의도된 구조다. |
| APV-01 | 반대 | 낮음 | 현재 `ApmRawTextPolicy.java:44-48`은 비관리자에게 저장 설정과 무관하게 `MASKED`를 강제한다. 커밋 `aab73fc`에서 수정됐다. | 보고서 기준 커밋 뒤에 해소됐다. 현재 작업 트리 기준 미해결로 다루면 안 된다. |
| APC-01 | 동의 | 높음 | `ApmStuckRequestLedger.java:110-125`, `ApmAlertEvaluationService.java:367-376`, `ApmStuckRequestMonitor.java:201-215`가 각각 조회 후 생성하고, `V38__apm_p1.sql`에는 열린 이벤트 부분 UNIQUE가 없다. | 10월 6일 APM 보완 뒤에도 유효하다. migration 번호는 기존 문서의 V69+가 아니라 현재 최신 번호를 다시 배정해야 한다. |
| APC-02 | 부분 동의 | 중간 | `CumulativeDeltaTracker`, `RumRateLimiter`, `LiveSpanRing`, `ApmStuckRequestMonitor`의 상태가 JVM 로컬이다. | 현상은 여전히 유효하다. 현재 지원 배포는 BE 1대이므로 현재 장애가 아니라 **HA 도입 조건부** 문제다. CUMULATIVE 작업 트리 수정도 JVM 간 공유를 구현하지 않았다. |
| APC-03 | 부분 동의 | 높음 | `ApmSyntheticController`는 `apm.view/edit`만 검사하고 `ApmSyntheticService.java:331,359,380,532,660` 등은 슈퍼 관리자 토큰을 쓴다. | `devdesign_apm.md:285`, `contract_apm-p3.md:1312-1313`에서 이미 선택된 모델이다. 다만 `apm.edit` 역할이 전체 Zabbix 웹 시나리오 권한으로 확대되는 위험은 높음이 맞다. |
| AI-01 | 동의 | 높음 | `OAuthService.java:293-300`이 `URI.getScheme()` 결과를 case-sensitive 비교하고, FE `navigation.ts:11`이 동의 결과 URL로 직접 이동한다. | Java `URI.getScheme()`은 입력의 대소문자를 보존한다. 악용에는 동적 등록 활성화, 로그인 사용자의 동의 화면 방문·클릭, 브라우저/CSP의 `javascript:` 실행 허용이 필요하다. HttpOnly cookie 탈취를 단정할 수는 없지만 같은 origin 스크립트 실행과 외부 redirect는 가능하다. |
| SEC-01 | 동의 | 높음 | `V10__seed_admin.sql`이 고정 초기 관리자 자격정보를 넣고 강제 변경 상태를 저장하지 않는다. | 설치 가이드의 “즉시 변경”은 운영 권고일 뿐 강제 정책이 아니다. 관리자 추가 경로도 없어 단순 비활성화로 해결되지 않는다. |
| SEC-02 | 동의 | 높음 | `JwtAuthFilter.java:100-102`가 관리자 요청마다 `getSuperAdminToken()`을 호출하고 `ZabbixUserServiceImpl.java:40-55`는 로그인 실패를 전파한다. | MovesEye 자체 설정·관리 화면까지 외부 Zabbix 가용성에 결합된다. |
| OPS-01 | 동의 | 높음 | `EmailServiceImpl.java:27,37,82,134`는 `JavaMailSender`를 필요로 하지만 현재 `application.yml`에 `spring.mail.*` 매핑이 없다. | `git show f84f4ec -- src/main/resources/application.yml`에서 AWS 작업 중 `spring.mail`과 `app.zabbix` 매핑이 함께 삭제됐다. 대체 설정 코드는 없고 문서·주석은 그대로여서 의도보다는 회귀일 가능성이 높다. |

### 불안정하다고 표시된 전제에 대한 세부 의견

- **HOME-01:** `open-in-view: false`인 상태에서 repository 조회가 끝나면 엔티티는 장기 영속 컨텍스트에 남지 않는다. `updateLayout()`은 명시적 `save()` 없이 필드만 바꾸므로 dirty checking으로 저장되지 않는다. 파생 삭제인 `deleteByUserIdAndDashboardKey()`도 외부 트랜잭션이 없으면 `TransactionRequiredException` 계열 실패가 가능하다. 드러나지 않은 이유는 FE가 mutation 뒤 로컬/Query cache를 갱신해 새로고침 전까지 성공처럼 보일 수 있고, 테스트가 mock 기반이라 Spring proxy/JPA flush를 거치지 않기 때문이다.

- **ZCF-01·02:** 두 건 모두 Zabbix의 “전체 교체” 성격을 실제로 밟는다. 다만 기존 객체가 참조 중이거나 호스트가 모든 그룹을 잃는 경우에는 삭제보다 API 거부가 먼저 발생할 수 있다. 따라서 영향은 “조용한 제거 **또는** 저장 전체 실패”다.

- **CLD-01:** `includeAllInstances(true)`가 비실행 상태를 포함시키고 현재 변환은 `ok` 외 상태를 전부 실패로 센다. 보고서의 조건부 표현보다 확실한 코드 결함에 가깝다.

- **AI-01:** `JavaScript:...//`처럼 뒤에 붙는 `?code=...`를 주석 처리하는 URI라면 실제 실행 가능한 형태가 된다. 사용자 상호작용 없이 임의 URL 하나만 여는 것으로 끝나는 취약점은 아니지만, OAuth 동의라는 정상 흐름을 이용하는 저장형 공격 경계다.

- **OPS-01:** 표준 `SPRING_MAIL_HOST`를 직접 주면 Spring Boot relaxed binding이 동작할 수 있다. 문제는 설치 문서가 안내하는 `MAIL_HOST`가 현재 아무 곳에도 매핑되지 않는다는 점이다. `app.zabbix`도 동일한 유형의 회귀다.

- **EVT-01:** 이름 길이 전제는 타당하다. 수정은 자르기보다 `text` 또는 Zabbix 상한에 맞춘 확장이어야 한다. 이름을 잘라 저장하면 식별·조사 정확성을 잃는다.

- **APV/APC:** `APV-01`만 해소됐다. `APC-01`은 그대로이며, `APC-02`는 현재 CUMULATIVE 보완으로 단일 JVM 정확성은 강화 중이지만 다중 JVM 상태 공유는 여전히 없다.

## B. “결정 필요” 분류 검토

| 질문 | 기존 결정 기록 | 결론 |
|---|---|---|
| 자산·비용·맵 조회를 일반 사용자에게 둘 것인가 | `_workspace/contract_assets-core.md:90`, `_workspace/designs/devdesign_asset-cost.md`, `_workspace/contract_network-maps.md:28,97`, `_workspace/contract_geo-maps.md:30` | **이미 결정됨.** 자산·비용 조회와 맵 전 EP는 인증 사용자 허용이다. 현재 보안 기준에서 다시 뒤집을지 결정할 문제이지, 기존 의도가 불명확한 것은 아니다. AST-01은 설계 부채로 봐야 한다. |
| 스크립트·합성 감시를 슈퍼 관리자 토큰으로 실행할 것인가 | `_workspace/contract_script.md`, `_workspace/designs/devdesign_apm.md:285`, `_workspace/contract_apm-p3.md:1312-1313` | **이미 결정됨.** Script는 MovesEye 관리자, 합성 감시는 `apm.edit`를 서비스 계정으로 위임하는 구조다. 재인증·감사·대상 소유권 검사가 부족한 결함은 별개다. |
| 초기 관리자 정책 | `moveseye-docs/operations/설치-배포-가이드.md:272`의 즉시 변경 안내 | **부분 결정.** 운영 권고는 있지만 강제 변경·1회 토큰·관리자 추가·복구 정책은 없다. SEC-01은 결정 대기가 아니라 보안 결함으로 먼저 다뤄야 한다. |
| `spring.mail.*`·`app.zabbix.*` 삭제 의도 | `f84f4ec` 이력과 현재 `MailProperties.java:7`, `ZabbixProperties.java:6` | **결정 기록 없음, 회귀로 판단.** 관련 없는 AWS 커밋에서 삭제됐고 문서와 소비 코드는 유지됐다. 정상화가 우선이다. |
| 네트워크 맵 팔레트 호스트 범위 | `_workspace/designs/devdesign_network-maps.md:103` | **이미 결정됨.** 검색·호스트 그룹 필터를 가진 일반 호스트 목록이다. server-only는 MAP-02 구현 결함이다. |
| 서비스 상태 `DOWN` | `_workspace/designs/devdesign_apm.md:123`, `_workspace/contract_apm-read-api.md:141` | **이미 결정됨.** 바인딩된 합성 감시 실패일 때만 `DOWN`이다. 현재 미구현은 APV-03 결함이다. |
| 삭제된 Zabbix 호스트의 자산 | 명시적인 ADR·계약을 찾지 못함 | **실제 결정 필요.** 안전한 기본값은 삭제가 아니라 `orphaned/unmonitored` 상태로 보관하고 관리자가 연결 해제·제외를 선택하게 하는 것이다. |
| MCP 쓰기 서버 확인 | `moveseye-docs/decisions/ADR-0002-역할-권한-BE-강제와-세션-세대.md:45,61,88` | **현재 범위는 이미 결정됨.** 서버 측 확인 게이트는 범위 밖, 파괴 작업 기본 차단과 입력 기반 위험도 판정을 채택했다. 남은 질문은 도입 시기와 UX다. |

즉, 8건 중 **5건은 이미 결정**, 1건은 부분 정책만 있고, 1건은 명백한 설정 회귀, 1건만 실질적인 신규 정책 결정(AST-03)이다.

## C. 중간·낮음 표본 검수

| ID | 판정 | 한 줄 |
|---|---|---|
| HOME-04 | 맞음 | `AlarmListWidget.tsx:28-44`가 고정 50건을 받은 뒤 심각도를 거른다. |
| HOME-09 | 맞음 | 시스템 카드 링크는 일반 사용자에게도 보이지만 `routes.tsx:980-1019` 대상은 관리자 전용이다. |
| MON-05 | 맞음 | `icmppingsec` catalog 단위는 `s`인데 `NetworkMonitoring.tsx:85`와 차트가 변환 없이 `ms`로 표시한다. |
| MON-06 | 맞음 | `MemoryMonitoringDetail.tsx:37`, `ListGraphIndicator.tsx:41` 등 Query key에 host id가 없다. |
| EVT-11 | 맞음 | `EventService.java:387,602-613,682-692`가 사본 응답 중에도 Zabbix 하이드레이션·가시성 조회 실패를 전파한다. |
| EVT-14 | 맞음 | `UpdateProblemModal.tsx:47,74-83` 기본값은 `PROBLEM`이고 BE 조회도 활성 문제로 한정된다. |
| AST-09 | 맞음 | `CostDataValidator.java:116-122`는 임의 통화를 허용하고 `CostService.java:208-212`는 환산 없이 합산한다. |
| AST-18 | 맞음 | `AssetService.java:182-183`은 Zabbix source만 실시간 보강하고 FE는 실시간 블록 부재를 문제 수 0으로 보인다. |
| MAP-08 | 맞음 | `explore.ts:30,37`은 `source→target`만 사용하고 `edgeMarkers.ts:24`의 표시 방향은 반영하지 않는다. |
| MAP-10 | 맞음 | `NetworkArchitectureService.java:97,178`은 읽기-비교-저장이고 엔티티에 `@Version`이 없다. |
| ZCF-08 | 맞음 | FE는 1,000을 요청하지만 `ManagedHostListReqDto.java:49`가 200으로 줄이며 다른 필터는 현재 페이지에서 만든다. |
| ZCF-09 | 맞음 | 17종을 선택할 수 있지만 `ItemCreateReqDto`와 `ZabbixItemManageService.java:238,342`에는 유형별 필수 필드가 없다. Zabbix 오류 형태만 런타임 미확인이다. |
| ZOP-02 | 맞음 | SNMPv3 선택지는 있으나 `NetworkDiscoveryFormDrawer.tsx:432-436`에 보안 입력이 없다. 기존 비밀값 처리 결과는 런타임 미확인이다. |
| ZOP-07 | 맞음 | `MaintenanceSummary.java:22,33`은 서버 timezone, FE는 브라우저 timezone을 써 한 행의 표시 기준이 갈린다. |
| CLD-05 | 맞음 | `AwsReadOnlyGateway.java:94-272`가 여러 AWS API의 `nextToken`을 따라가지 않고 일부 응답은 상수를 돌려준다. |
| CLD-12 | 맞음 | `CloudMetricsService.java:241-246`은 `SUM/period`, `AwsServiceImpl.java:636-643`은 `AVERAGE`를 써 같은 지표의 의미가 다르다. |
| APV-03 | 맞음 | `ApmStatusJudge`는 `DOWN`을 반환하지 않고 설계는 합성 실패 시 `DOWN`을 명시한다. |
| APV-12 | 맞음 | `ApmAlertRuleController.java:332-345`는 `requireRead`, FE `routes.tsx:922-927`은 edit 전용이다. |
| APC-06 | 맞음 | `ArchiveFileService.java:132-163`의 verify 결과가 원장 상태를 바꾸지 않고 `ApmArchiveDropGate.java:124-139`는 기존 OK만 본다. |
| APC-07 | 맞음 | `ApmLiveProperties.java:95`는 2,000까지 허용하지만 `LiveSpanRing.java:139-147`은 200 초과를 거부한다. |
| AI-03 | 과장 | `AiAssistantPage.tsx:66-78`의 자동 전송은 사실이나 쓰기 확인은 유지된다. 직접 권한 상승보다 비용·사용자 의도·prompt injection UX 문제에 가까워 보안 “중간”은 과하다. |
| AI-05 | 맞음 | `McpAccessInterceptor.java:49-54`에 `/apm` 허용 prefix가 없는데 AI MCP 툴 목록에는 APM 툴이 노출된다. |
| SEC-03 | 맞음 | 계정당 단일 세션 키와 visitor별 바인딩이 서로 다른 키 축을 써 재로그인·세션 교체가 진동할 수 있다. |
| SEC-07 | 미확인 | 테스트의 한 단계 호출 추적과 실제 두 단계 호출 구조 불일치는 코드로 확인했으나, 실행 금지 조건 때문에 현재 테스트 실패 여부는 확인하지 않았다. |
| OPS-12 | 맞음 | `Dockerfile:20`, `bitbucket-pipelines.yml:12-44`에서 테스트 제외, 기본 10초 stop, `latest` 교체 후 prune이 확인된다. |
| OPS-18 | 맞음 | `SettingService.java:73-83`은 URL/관리자 인증만 갱신하고 이전 서버 기준 사본·연결·사용자 자료는 정리하지 않는다. 영향은 보고서가 표시한 대로 추론이다. |

표본 결과는 **맞음 24, 과장 1, 미확인 1, 틀림 0**이다. 영역 문서의 정적 구조 설명은 신뢰할 만하다. 다만 AI 문서는 보안 분류가 다소 공격적이고, Zabbix 운영·설정 문서는 확인된 코드 구조와 외부 시스템의 실제 반응을 한 항목에 섞으므로 “코드 확인”과 “실서버 확인”을 계속 분리해야 한다.

## D. 빠진 높음급 문제

### 1. APM CUMULATIVE 원시 시계열 충돌

보고서의 `APC-02`는 다중 노드만 다루지만, 기준 코드에는 단일 노드에서도 저장 차원으로 축약된 `dimsHash`를 CUMULATIVE 차분 키로 사용해 서로 다른 원시 시계열이 같은 직전값을 공유하는 문제가 있었다. 상태코드 200·201이나 서로 다른 원시 attribute가 하나의 저장 차원으로 접히면 요청량·히스토그램 증분이 틀릴 수 있다.

- 근거: 현재 작업 전 코드와 차이를 보여 주는 `MetricIngestor.java:742-756`, `CumulativeDeltaTracker.java:64-65`
- 보완 기록: `_workspace/contract_apm-cumulative-correctness-20261006.md:3,7-12`
- 현재 상태: 작업 트리는 `sourceIdentityHash` 기반 차분, 시간순 처리, epoch·경계 검증을 구현했지만 문서 상태가 “리더 직렬 검증 대기”다. 따라서 **높음 문제는 발견됐고 수정 중이나 아직 완료 판정할 수 없다.**

### 2. 일반 사용자의 맵 물리 삭제 권한은 MAP-11을 높음으로 올려야 한다

리포트는 이를 중간 감사·권한 문제로 다뤘지만, 현재는 로그인 사용자 누구나 네트워크 맵과 지리 맵을 생성·수정·대표 지정·물리 삭제할 수 있다. 버전 이력·휴지통·삭제 감사도 없다.

- `networkmap/NetworkArchitectureController.java:32-34,55-99`
- `NetworkArchitectureService.java:116-122`
- `_workspace/contract_network-maps.md:97,100-107,189-190,241`
- `geomap/GeoClusterController.java:40,55-110`

문서 성격이라는 기존 결정을 감안해도, 여러 운영자가 공유하는 설치본에서 전 구성도를 복구 불가능하게 삭제할 수 있으므로 인증·권한 경계상 높음이다. 최소한 삭제·대표 지정은 `edit` 권한 또는 관리자, soft delete와 감사 기록이 필요하다.

## E. 처리 계획에 대한 의견

### 한 번에 넣으면 안 되는 항목

- **APV-01:** 이미 `aab73fc`에서 해결됐다. 다시 손대면 중복 수정이나 회귀만 만든다.
- **APC-01:** 단순 코드 수정이 아니다. 기존 중복 정리 → nullable scope를 고려한 부분 UNIQUE index → 동시 충돌 시 정상 회복 순서가 필요한 DB migration 작업이다.
- **EVT-01:** 컬럼 확장과 실패 격리, 기존 운영 DB migration을 동반한다. 작은 FE 수정과 같은 배포 단위로 묶지 않는 편이 낫다.
- **AST-02:** 서버 export 또는 안정된 페이지 반복이라는 API·성능 설계가 먼저다. 단순 limit 상향은 안 된다.
- **AI-01:** 보안 hotfix로 독립 커밋·릴리스하는 편이 추적과 회귀 검증에 좋다.
- **APV-02:** 네 개 APM 조사 화면과 repository query 계약을 함께 바꾸는 작업이다. 현재 CUMULATIVE 작업 트리와 직접 같은 파일은 적더라도, 미커밋 APM 변경이 큰 상태에서는 별도 커밋으로 격리해야 한다.

권장 묶음은 다음 정도다.

1. `HOME-01` 단독  
2. `MON-02 + MON-05 + MON-06`  
3. `EVT-02` 및 별도 `EVT-10/OPS-04`  
4. `MAP-01`  
5. `CLD-13 + CLD-18`  
6. `AI-01` 보안 hotfix  
7. `EVT-01`, `AST-02`, `APC-01`, `APV-02`는 각각 독립 작업

### 수정 방향에 대한 이견

| 항목 | 권장 방향 |
|---|---|
| HOME-01 | `DashboardWidgetService`를 Spring bean으로 주입한다. 단순 annotation 추가보다 실제 DB 통합 테스트로 dirty checking·derived delete를 고정해야 한다. |
| MON-02 | 즉시 BE/FE 뒤바꿈을 고치되, 장기적으로 응답에 unit을 싣거나 서버에서 단위를 정규화한다. |
| AI-01 | scheme을 `Locale.ROOT`로 소문자화한 뒤 허용 목록으로 검사한다. absolute/opaque URI, userinfo, 제어문자도 거부하고 FE에서도 방어한다. |
| EVT-01 | 이름을 자르지 말고 `text` 또는 확정된 상한으로 확장한다. DB 실패를 `ZABBIX_API_ERROR`로 덮지 말고 부분 회차 상태를 남긴다. |
| EVT-02 | 기본 기간은 상대 시간창으로 표현해 요청 시 “현재”를 계산한다. 사용자가 선택한 절대 기간만 URL에 `to`를 보존한다. |
| AST-02 | 전용 서버 export 또는 stable keyset pagination으로 전량을 순회하고, 잘림 여부를 응답·파일에 명시한다. |
| MAP-01 | `ResolvedHostDto`에 정확한 `assetId`를 싣거나 hostid 필터 목록으로 이동한다. 복수 자산이면 선택 기준을 API 계약으로 정해야 한다. |
| APC-01 | 기존 열린 중복을 먼저 정리하고 부분 UNIQUE를 추가한 뒤, 충돌을 “이미 열린 이벤트 있음”으로 회복한다. 조회 후 저장만 바꾸는 것으로는 부족하다. |
| APV-01 | 추가 수정 없음. 회귀 테스트만 유지한다. |
| EVT-10/OPS-04 | 15초를 분 단위로 반올림하지 말고 초 단위를 보존한다. 기존 저장값 복구 정책도 필요하다. |
| APV-02 | FE 필터가 아니라 BE의 trace/error/DB/external query 모두에서 environment를 적용한다. export 모집단도 같아야 한다. |
| CLD-13 | boolean/string 타입부터 통일하고 “차단됨/허용됨” 의미를 이름에 반영한다. 라벨만 뒤집으면 안 된다. |
| CLD-18 | FE 표현 수정으로 묶어도 된다. |
| MON-05 | `LatestValue.unit`을 응답으로 전달해 `s→ms`를 명시적으로 변환하는 방향이 안전하다. |
| MON-06 | 모든 Query key에 host id를 포함한다. |

### 공통 원인 10개에 대한 의견

공통 원인의 분류 자체는 대체로 동의한다. 다만 다음은 조정이 필요하다.

- “전체 교체 API의 부분 DTO 사용”은 ZCF-01·02에는 정확하지만 사용자 media/action 등 모든 Zabbix 쓰기 API까지 같은 원인으로 일반화하려면 추가 표본이 필요하다.
- “프로세스 메모리 상태”는 현재 단일 BE 지원 범위에서는 조건부다. 지금의 최상위 제품 결함처럼 다루기보다 HA 전환 gate로 관리해야 한다.
- 메뉴·주소 복제와 감사 로그 부족은 사실이지만, 설치 차단·데이터 오표시·권한 상승보다 우선할 문제는 아니다.
- 우선순위는 다음처럼 바꾸는 편이 낫다.

  1. 설치 설정 회귀(`spring.mail`, `app.zabbix`)
  2. 권한과 서비스 계정 위임 경계
  3. 지표 key·단위·시간창 계약
  4. 실패를 0·빈 값으로 바꾸는 처리
  5. 외부 API 교체 semantics
  6. 전량 조회·메모리 필터링
  7. 파괴 작업 감사·복구
  8. 다중 노드 상태 공유
  9. 메뉴·주소 정본화

## F. 총평

이 리포트는 **코드 구조와 재현 조건을 찾는 능력은 높고, 중간 항목까지 포함한 사실 정확성도 좋다.** 다만 “현재 코드에 존재하는 결함”, “이미 승인된 위험한 설계”, “향후 HA에서만 발생하는 조건부 한계”, “외부 시스템 반응을 아직 확인하지 않은 추론”을 중요도 표에서 충분히 구분하지 못했다. 특히 `APV-01`은 이미 해소됐고, 5.2절의 다수 항목은 미결정이 아니며, 현재 진행 중인 CUMULATIVE 정확성 문제는 오히려 종합 리포트에서 빠졌다. 따라서 이 문서를 그대로 일괄 작업 목록으로 실행하면 안 되지만, 위 재분류를 반영해 **보안 hotfix·설정 회귀·데이터 정확성·DB migration·정책 재검토를 별도 작업으로 나누는 전제라면 작업 착수의 좋은 기반**으로 사용할 수 있다.