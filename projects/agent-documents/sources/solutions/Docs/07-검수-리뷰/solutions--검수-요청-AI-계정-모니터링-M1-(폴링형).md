# 검수 요청 — AI 계정 모니터링 M1 (폴링형)

- 작성: 2026-08-25 · 작성자: Claude (구현 파이프라인 오케스트레이터)
- 상태: **구현·QA 완주, 전량 미커밋** (BE `ZM-79` 브랜치 작업트리 + FE + moveseye-ai 1파일)
- 정본: 설계 `devdesign_ai-account-monitoring.md` v1 · 조사 `research_ai-account-monitoring.md` · 계약 `contract_ai-account-monitoring.md` · QA `qa_ai-account-monitoring.md` · E2E `e2e_ai-account-monitoring.md`

---

## 1. 범위·의도

모니터링 제품의 신규 감시 축: **고객 조직이 등록한 AI 계정(Anthropic/OpenAI Admin API)의 사용량·비용·인벤토리를 폴링해 시계열로 쌓고, 예산/급증/미사용/수집실패를 평가·표시**한다. 일반 에디션(라이선스 게이팅 없음). M2(Claude Code OTel 수신)·M3은 미구현 — 스키마만 여지를 둠.

사용자 결정 반영: 계정 관리를 설정 메뉴에 두지 않고 **모니터링 > AI 사용 현황 한 화면(사용량/인벤토리/계정 관리 3탭)**에서 처리. 계정 0건이면 등록 유도 empty state.

## 2. 변경 규모

| 레포 | 내용 |
|---|---|
| moveseye-be-spring | `aimonitor/` 패키지 신규(컨트롤러 1·서비스 6·domain 7·dto 8·provider 8), `V30__ai_monitor.sql`(3테이블+스케줄러 시드 2), ErrorCode 6종, HomeWidgetType `AI_MONITOR_COST` 추가, 테스트 10파일+픽스처 4 |
| moveseyee_fe | types/api/hooks/constants 신규, AI 사용 현황 페이지(3탭·KPI·차트·표·인벤토리·알람 카드·계정 모달), 홈 위젯, 라우트/SideNav/전역검색/도움말/i18n, 테스트 6파일 |
| moveseye-ai | `screens.json`에 화면 1건 등록(챗봇 화면 가이드용) |

EP 10개: 계정 CRUD+연결테스트+인벤토리(§1), usage/compact/alerts(§2). 전부 관리자 전용(userRole 축). 에러는 200+바디 code(기존 계약 보존).

## 3. QA 이력 (클로즈드 루프 완료)

- **정적 1차 FAIL**(HIGH 1·MEDIUM 3·LOW 4) → 전건 수정 → **재검증 PASS**(잔여 LOW 5) → 전건 수정.
  - HIGH였던 것: 에러 클래스 불일치로 조회 에러 배너가 죽은 코드 → "권한 없음이 $0 대시보드로 보임". `AiMonitorApiError extends ApiEnvelopeError`로 해소, 회귀 테스트로 잠금.
  - 구조적 원인: `@JsonInclude(NON_NULL)` 키 생략 vs `null` 혼재 → 계약서 **§0.1 DTO별 대응표** 신설로 재발 차단.
- **E2E**(실기동·브라우저): 시나리오 11개 **HIGH 0**, MEDIUM 3(시계 이원화·게이지 색·unpriced 의미)·LOW 3 → **전건 수정 완료**.
- 회귀 테스트는 매번 "일부러 되돌려 그 테스트만 빨간지" 확인 후 복구하는 절차를 지킴.

## 4. 최종 테스트 상태

- BE: app **1,120** + engine-zabbix **90** green (aimonitor 78건 포함, RepositoryIT 17건은 실제 Postgres에 V30 적용해 검증)
- FE: jest **1,163 통과 / 1 실패** — 실패 1건은 `AiAssistantPage` 선재 결함(클린 트리에서 재현 확인, 본 작업 무관). tsc·build·eslint 통과, i18n kr/en 완전 일치·고아 키 0.

## 5. 🔴 불안한 지점 (검수 시 여기를 봐달라)

1. **프로바이더 성공 응답 파싱 미실측** — Admin 키 미보유라 usage/cost/인벤토리의 **성공 응답 shape는 문서 기반 픽스처**다. E2E에서 실호출이 나가 **인증·에러 경로(401 원문 표시)는 실측 통과**했지만, 성공 파싱은 키 발급 후 재검증 필요. OpenAI가 특히 불안(조사 자체가 지식 기반 — `group_by` 파라미터 표기 등 미확정).
2. **V30 수정과 dev DB 체크섬** — E2E 후 D-1 수정으로 V30 파일이 바뀌어 dev DB(5433) flyway checksum을 수동 복구했다(사용자 등록 계정 1건 보존, 절차는 계약서에 기록). **V30이 커밋·배포된 뒤에는 이 방식 불가 — V31 분리 필요.** 커밋 전 마지막 점검 항목.
3. **URL 변경** — 브레드크럼 i18n 키 충돌(`ai-usage`→`ai_usage` 네임스페이스가 AI 어시스턴트 소유)로 경로를 `/monitoring/ai-account-usage`로 바꿨다. 세그먼트→i18n 키 파생이라는 숨은 결합이 원인 — 같은 함정이 다른 신규 화면에서도 날 수 있다.
4. **unpricedDays 의미** — E2E D-3로 `unpricedRows`(상시 >0으로 무의미)를 **계정×날짜 단위 `unpricedDays`**로 재설계. 계약서 갱신됨. FE 배지 문구와 함께 검토 요망.
5. **알람 push 부재(Q7 미결)** — BE에 발신 경로가 없어(메일 빈 부재·Zabbix 주입 없음·알림벨은 라이브 조회) M1은 평가+화면 노출뿐. 사용자 결정 대기: SMTP / 인앱 알림 테이블 / Zabbix trapper.
6. **주차 표기 불일치(이월)** — periodKey를 `2026-W05`로 패딩하면서 moveseye-ai `GET /ai/usage`(`2026-W5`)와 어긋남. 저쪽 정정은 별도 과제.
7. **선재 이슈 2건(본 작업 밖, 기록만)** — `AiAssistantPage` 테스트 1건 상시 실패 · 로그인 `FingerprintJS.load()` 무타임아웃(지연 시 버튼 무반응).

## 6. 검증 / 미검증

| 항목 | 상태 |
|---|---|
| 마이그레이션 실적용(빈 DB V1~V30) | ✅ IT로 매 실행 검증 |
| upsert 멱등·CASCADE·집계 SQL | ✅ 실 Postgres IT |
| 계정 CRUD·암호화(enc:v1)·마스킹·"비우면 유지" | ✅ E2E 실측 |
| 프로바이더 인증·에러 경로 | ✅ E2E에서 실호출 401 원문 확인 |
| 프로바이더 **성공 응답 파싱** | ❌ 픽스처만 — Admin 키 발급 후 실측 필요 |
| 대시보드 값 정합(삽입 데이터 대조)·알람 카드·권한 차단·홈 위젯 | ✅ E2E 실측 |
| 폴링 배치 실주기 동작(스케줄러 lease 포함 장기 구동) | ❌ 수동 실행만 확인 |
| 스케줄러 **화면** 렌더 | ⚠️ API·라벨 키만 확인(MCP 탭 FingerprintJS 블록으로 렌더 미확인) |
| 예산 경고 80/100%·percent 정밀도 | ✅ 단위+E2E |

---

# M2 — Claude Code OTel 수신형 + 구독 플랜 활용도 (2026-08-25 완주)

## 7. M2 범위·의도

**수신형**: 구독(Pro/Max) 계정엔 조회 API가 없으므로, 사용량 발생지(각 개발자 PC의 Claude Code)가 우리 BE로 텔레메트리를 쏘게 한다(공식 OTel 지원). 사용자별(user.email) 토큰·비용·세션·활동시간·코드라인을 통합 대시보드에.
**구독 활용도**(사용자 결정): 수신 계정의 달러는 실지출이 아니라 **환산 가치** — 폴링 예산(초과=나쁨)과 의미가 정반대(플랜가 초과=본전, 저활용=시트 낭비). 사용자별 플랜가(기본+예외) 등록 → byUser 활용도 %, 색 의미 반전. 수신 계정은 예산 경고/알람/compact에서 제외.
**동의·가이드**(사용자 지시): 관리자 고지 확인(`consentAcknowledged` — 등록·재발급 모두, 같은 고지 컴포넌트 재사용) + 직원 공지문 템플릿 + 완성 스니펫 복사 + 3방식 배포 안내. 프롬프트·응답 원문은 수집하지 않음(기본 redaction 그대로).

주요 산출: BE `aimonitor/otel/` 6파일 + V31(활동 지표)·V33(사용자 플랜)·V34(밀리초 정밀도+dedup 영수증), OTLP http/json 직접 파싱(proto 의존성 0), 수신 토큰=단방향 해시(위조 방지)·1회 표시·재발급. FE 수신 계정 UI·동의 게이트·토큰/스니펫 모달·byUser(활동 3열+플랜/활용도)·source 필터·플랜 편집 표·위젯 구독액 분리.

## 8. 설계 판단 중 검수 요망 지점

1. **OTLP 엔드포인트만 진짜 HTTP 상태 코드**(전역 "에러도 200" 관례의 의도적 예외) — 클라이언트가 FE가 아니라 OTel exporter라 200이면 데이터를 버린다. 라이선스 만료도 503(재시도 유도).
2. **temporality 방어**: 실측으로 DELTA(숫자 1) 확정. 누적 오인의 위험 비대칭(수백 배 부풀림) 때문에 UNSPECIFIED는 누적 취급·첫 관측은 기준점만.
3. **중복 적재 dedup**: 실측에서 같은 페이로드 3회=3배 확인 → 적재 성공 본문 sha-256 영수증(TTL 30분, `ON CONFLICT DO NOTHING`). 401 재전송은 안 막음(테스트 확인). 한계: 30분 초과 재전송.
4. **compact 분리**: costUsd=폴링 실지출만, `subscriptionCostUsd` 신설(수신 전용 조직 $0 오해 방지). §2.1 usage의 costUsd(전 소스)와 **뜻이 다름** — 계약·타입 주석에 명시.
5. **@LicenseExempt 허용 목록에 OTLP 추가** + 대가로 A5-c 신설(어노테이션만 남기고 내부 검사를 지우면 실패).
6. 중복 경로 관용은 **한 겹까지**(WARN 로그), protobuf 오설정은 415+힌트(SDK 기본값이 protobuf라 실제로 밟기 쉬움 — 슬라이스 테스트가 전역 핸들러 없이 돌아 500을 놓쳤던 것 수정 포함).

## 9. M2 검증 / 미검증

| 항목 | 상태 |
|---|---|
| OTLP 실 페이로드 (실제 Claude Code 2.1.241 전송) | ✅ **실측** — temporality=DELTA(숫자)·user.email=dataPoint 속성·type 철자 확정, 적재값 페이로드와 완전 일치 |
| 수신 보안 왕복 (401/재발급 무효화/중복경로/415) | ✅ E2E |
| 동의 게이트 (등록·재발급, 체크 전 차단) | ✅ E2E+테스트 |
| 플랜 활용도 (기본/예외/제거/색·라벨/month 전용) | ✅ E2E |
| 수신 예산 제외 3지점 + 값 보존 | ✅ E2E+테스트 (9,990%에도 조용) |
| dedup 동작 | ✅ 단위+IT (30분 초과 재전송은 미커버 — 문서화된 한계) |
| **다수 개발자 동시 수신·장기 구동** | ❌ 1인 실측만 — 운영 초기 관찰 필요 |
| Anthropic/OpenAI 폴링 성공 응답 파싱 | ❌ 여전히 픽스처 — Admin 키 발급 후 실측(M1 이월) |

## 10-A. 후속 확장 (2026-08-25 오후, 사용자 지시 4건)

1. **표 재구성**: byUser 12열→6열(토큰/활동/활용도 병합열), 전 표 가로 스크롤 제거. 🔴 원인은 `DmoveTable`의 `scroll` 기본값 `{x:1000}` — 생략하면 스크롤 강제. 실브라우저(1280·800px) 확인.
2. **Codex CLI 수신 지원**: 수신 provider `CODEX_CLI` 추가. 🔴 **실측이 문서를 뒤집은 사례** — 공개 문서·계약 초안은 `codex.turn.token_usage` 메트릭을 전제했으나 실제 CLI 0.149.0은 **`resourceLogs`(`codex.sse_event` 속성, 문자열 숫자)**로 보냄(3라운드 FAIL) → `/v1/logs` 수신 신설(인증·dedup·라이선스 공통 `receive()`), 이어 4라운드에서 `timeUnixNano:"0"` → **1970 버킷 소실**(HIGH) 발견 → 시각 폴백 3단(원시각→observed→서버 수신 시각, 메트릭 경로의 "버림"도 동일 규칙으로 통일). 5라운드 실측 PASS(실 Codex 1턴이 현재 버킷·byUser 등장). `user.email` 실제 수신 확인(귀속 동작), prompt는 `[REDACTED]`. Codex는 비용 미제공 → `priced=false` + 화면 확정형 문구, **비용 미제공 사용자에겐 플랜/활용도 생략**(단 토큰 0 사용자는 값 유지 — 시트 낭비 신호 보존). `tool_token_count`는 이중 계상 위험으로 미합산.
3. **가이드 메일 발송**: 토큰 모달에서 이메일 목록으로 스니펫+공지문 발송(BE는 relay만 — 토큰 원문 무저장·무로그). SMTP 미설정=명확한 에러(무음 금지), 형식 오류=전체 거부(부분 발송 후 거부 방지), SMTP 실패=부분 생존. 공지문은 도구별 분기(수집/미수집 항목 사실관계).
4. **byUser 탭 재진입 가이드** + 토큰 응답에 `provider`(도구 오인 시 endpoint 규칙이 반대라 조용한 무수신 — 응답이 자기 도구를 밝힘. `endpoint`는 도구 공통 유지 — 같은 필드가 도구별 다른 의미를 갖는 함정 회피).

QA: 정적 M2 라운드 PASS(잔여 8건 전건 닫음, 재발급 동의 재확인 게이트 신설 포함) + E2E 3~5라운드(결함 R3-D1~D4·R4-D1 전건 수정·실측 재확인).

## 10-B. 최종 상태 (2026-08-25 마감)

- BE: **app 1,260 / engine-zabbix 90 green** (aimonitor **205**, RepositoryIT는 실 Postgres V1~V34 적용)
- FE: **jest 1,275 통과 / 1 실패**(선재 `AiAssistantPage` — clean 트리 재현 확인, 본 작업 무관) · tsc·build·eslint 통과 · i18n `ai_monitor` **269리프** kr/en 일치
- 마이그레이션: **V30·V31·V33·V34** (🔴 V32·V35는 병행 세션 소유 — 커밋 제외)
- 🔴 **병행 세션의 AWS 비용 작업 미커밋 파일 존재**(BE V32·V35 등 / FE CloudInfra 3파일) — 커밋은 파일 단위 스테이징 필수
- 정정 2건: "FingerprintJS 무타임아웃"은 오진(실원인=백그라운드 탭 타이머 지연) · "Codex는 user.email 미제공 가능" 문구 철회(실측으로 수신 확인)
- ⚠️ 운영 배포 시: 초기 안내(`/v1/metrics`)로 설정한 Codex 사용자가 있다면 **재안내 필요**(스니펫 정규화가 옛 주소 붙여넣기는 자동 교정하나, 이미 배포된 설정은 무수신) — 사내 미배포 상태라 현재 해당자 없음

---

## 검수 결과 (Codex 기록란)

<!-- Codex: 결함은 심각도(🔴/🟡/🟢)와 근거를 붙여 여기에 기록. Claude가 반영 후 [x]로 닫는다. -->

