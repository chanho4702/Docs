사용자가 APM 전반을 분석해 완성도를 평가하고 개선 우선순위를 나열하라고 요청했고, Claude 의견도 들어보라고 명시했습니다. 당신은 독립 검토자입니다. 한국어로 답하세요.

읽기 전용입니다. 코드/문서/설정 수정, commit/push, 서버 기동/재시작, DB 접속, 외부 통신 도구 사용을 하지 마세요. .env, vault, 인증정보 파일은 읽지 마세요. 응답 텍스트만 작성하면 호출자가 보존합니다. 다른 에이전트를 생성하지 마세요. 배경 작업도 시작하지 마세요.

기준: C:/solutions/moveseye-be-spring HEAD e55948c, C:/solutions/moveseyee_fe HEAD 9dfcbe8. COLLAB은 SOLO-CODEX, 이번 Claude 요청은 검토에 한정합니다. 기능은 폭넓게 구현됐지만 지원 규모와 HA는 미완료입니다. 이전 보완 문서 C:/solutions/moveseye-docs/overview/apm-scale-readiness.md를 참고하세요. 10/05 구보고서에는 이미 수정된 문제가 있으니 그대로 반복하지 마세요.

아래 발견을 독립적으로 비판해 주세요. 실제 관련 코드만 좁게 읽고, 잘못된 인과/과도한 심각도/누락된 방어가 있으면 지적하세요. 전체 레포를 다시 읽을 필요는 없습니다.

1. 보안: trace/query/ApmRawTextPolicy.java:52는 현재 keepRawSql=false면 비관리자에게 RAW를 반환합니다. true 동안 저장한 과거 원문을 off 시 소급 마스킹하지 않습니다(core/setting/ApmSettingService.java:265~299). export/ApmExportService.java:49~58도 과거 원문 잔존을 명시하고 export는 항상 권한 기반 마스킹합니다. 화면 trace/error 상세는 현재 설정에 의존합니다. 원문 보관을 켰다가 끈 경우 일반 apm.view 사용자에게 과거 원문 노출 가능성. 실제 고객 DB 재현은 안 했습니다.
2. 누적계열 충돌: collector/ingest/store/MetricIngestor.java:438~449,728은 정규화 dims.hash를 CumulativeDeltaTracker 키로 씁니다. 실제 production Normalizer/Tracker 컴파일 클래스를 JShell로 호출해 status200과201이 status_class2xx 같은 키가 됨을 확인. 각 첫값100/20, 다음110/22의 기대 delta10+2=12인데 실제90+22=112. source/DB 수정 없는 비DB 재현입니다.
3. 역순 도착: CumulativeDeltaTracker Last는 관측 time을 보관하지 않음. 같은 startTime에서100(t0),120(t2),110(t1지연),130(t3)는 기대30, 실제150(20+110+20). 정상 프로세스재시작과 구분한 직접클래스 재현입니다.
4. FE: 전역 오류/DB/외부호출의 env 필터는 서비스 옵션만 좁히고 실제 Explorer 조회에 전달되지 않으며, 지금 새로고침도 옵션 조회만 refetch. trace페이지는 최근 useApmRefresh로 수정돼 동일 문제로 묶으면 안 됩니다.
5. 운영: 열린 알람 이벤트의 조회 후 생성 두 경로, 열린 이벤트 DB UNIQUE 없음, 평가 트랜잭션 안 Zabbix 외부 I/O, 종료 알람 보존 공백. 'Zabbix에서 분리한 독자 알림 작업 때 함께 개선' 기존 결정은 유지합니다.
6. 규모: 서비스 overview는 findAll 후 모든 service 지표조립. 시간축 상한은 총계열/JSON/SQL스캔 상한이 아님. 서비스·인스턴스 cardinality 예산 불충분, DB dims JSON/hash 반복저장비용. 일부 예산/live/누적기준은 노드메모리.
7. 과거 SQL 합성1404만행 시험은 실제 OTLP+조회+SSE 복합부하가 아닙니다. Java521+Node25+브라우저HTTP4는 선별 회귀이며 전체 제품 품질이나 규모 보증이 아닙니다.

원하는 답변:
- 핵심 기능·신뢰성·규모·운영·UX의 전반 완성도 판단(완료율 %는 금지, 소스와 실행 증거 구분).
- 위 지적에 동의/수정/반대하는 이유와 코드 근거. 확정/조건부/미검증 구분.
- 최우선 10개 개선 순서, 개선 이유와 완료 조건.
- 현 판단에서 가장 과장되거나 놓친 부분 3개 이내.

보고 길이는 한국어 1200~2000단어 이내면 충분합니다. 파일을 쓰지 말고 stdout 최종 답변으로 반환하세요.
