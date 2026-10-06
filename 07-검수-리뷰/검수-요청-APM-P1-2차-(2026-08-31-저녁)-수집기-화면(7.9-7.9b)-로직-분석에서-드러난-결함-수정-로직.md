# 검수 요청 — APM P1 2차 (2026-08-31 저녁): 수집기 화면(7.9·7.9b) · 로직 분석에서 드러난 결함 수정 · 로직 분석 문서

> 1차 검수 `review_apm-p1.md`·`review_apm-p1_codex.md`(반영 완료, 커밋 BE `3b67d01`·FE `223ae83` #ZM-122). 이번은 그 위의 **미커밋 증분**만.

## 1. FE — 수집기 화면 (WBS 7.9 + 7.9b) `moveseyee_fe` 미커밋 23파일
- 탭 4(`?tab=`): **상태**(Collector 표·선택 시계열·"최근 60초 수신 확인" 버튼·드롭 표(누적값·lastSeenAt 필터 각주)·route 상한 초과 표) · **토큰·설정 생성**(토큰 표·회수·발급 Drawer `withConfig` 옵션·🔴 원문 1회 표시 모달+복사+"다시 볼 수 없음" 확인·기존 토큰 yaml 재생성=자리표시 안내) · **설치 가이드**(os×stack → 단계 카드·명령 복사·envVars·verify·notices Alert) · **등록·설정**(설정 폼 부분 PUT·keep_raw_sql 경고·승인 대기 승인/거절·unknown_service 표).
- 7.9b: `useLicense` D-14/7/1 구간 배너("만료 시 APM 수집 즉시 중단 — Collector가 403을 폐기") + 수집기 중지 절차 링크 + 토큰 일괄 회수(강확인).
- 관리자 아니면 전 훅 `enabled:false` + 배너(계약 §8.1이 조회까지 관리자). 온보딩 카드 딥링크 `?tab=tokens`. 도움말 `chart_help` 47→58.
- 테스트 신규 100, 전체 jest **2000/2002**(선재 2). tsc·typecheck:contract·eslint 0.
- 🔴 불안: **브라우저 미검증**(BE·Collector 미기동) — 특히 `text/yaml` 응답이 axios에서 문자열로 오는지 · `X-Apm-Token-Placeholder`/`X-Apm-Warning` 헤더는 인터셉터가 `data`만 돌려주고 CORS expose도 없어 **FE에 닿지 않음** → 본문 `${RECEIVE_TOKEN}` 잔존·요청 옵션으로 판정(BE 무수정, 헤더 의존 시 `Access-Control-Expose-Headers` 선행 필요) · 성공은 yaml·실패는 JSON envelope 분기 · 수집기 EP 계약 표본 JSON 없음(픽스처는 DTO 파생) · 일괄 회수는 순차 루프(중간 실패 시 부분 회수) · `apmGuessEndpoint`는 관리자 브라우저 origin.

## 2. 로직 분석 문서 `../analysis/apm-p1-logic-analysis.md` (1,012줄·근거 547개)
- 코드 실동작 정본(§0 흐름 → §1 수신 … §10 FE → §11 결정 27건 → §12 한계). "(추정)" 9건 표기.
- 🔴 **분석이 새로 찾은 결함(코드 확인)**: A1 알람 캐시 유예가 영원히 만족(매 배치 `markProvisioned(now)`) · A2 sync 배지(drift/NOT_SUPPORTED)가 다음 평가 배치에 리셋 · A3 규칙 비활성화 시 Zabbix 트리거 활성 유지·열린 이벤트 영구 미해소 · A4 resync THEIRS 임계 검증 우회(STALE 0 채택 가능) · A5 라이선스 만료 시 롤업 정지/보존 가동 비대칭 → 5m/1h 공백 영구화(워터마크 행 0에도 전진) · 🟡 토큰 scope/kind 미강제 · `mask_sql`/`keep_raw_sql` 설정 소비자 0 · `PENDING_APPROVAL` state 도달 불가 · APM 403 vs AI 503 만료 정책 차이(의도).

## 3. BE — 결함 수정 `moveseye-be-spring` 미커밋 22파일 (전체 `:test` **2082 green**, +22 신규, 마이그레이션 없음)
| 항목 | 판정 | 수정 요지 |
|---|---|---|
| A1 캐시 유예 영구 만족 | 수정 | `markProvisioned`는 생성/Zabbix id 변경 재생성/enforce 경로에서만. 존재 확인만 하면 무기록. `cache_ready`는 첫 push 성공에서만 true, 유예 2분 후 `does not exist`는 error 기록·다음 배치 재시도 (`ZabbixAlertBridge`·`ApmAlertRuleBinding`) |
| A2 sync 배지 리셋 | 수정 | **배지는 세운 쪽이 내린다** — push 성공은 push 오류만, sync는 자기 `NOT_SUPPORTED`(접두 `ERROR_PREFIX_NOT_SUPPORTED`)만 해제. drift는 resync/재생성만 |
| A3 비활성화 시 Zabbix·이벤트 방치 | 수정 | 비활성화 = 우리 DB 열린 이벤트 해소(먼저) → Zabbix 트리거 `status=1`(실패해도 CRUD 성공). 재활성화 = 정의 재적용 + `status=0`. 삭제도 열린 이벤트 해소. ⚠️ 해소 사유 컬럼 없음(로그만) |
| A4 THEIRS 검증 우회 | 수정 | `adoptTheirThreshold`에 CRUD와 같은 `validThreshold`; STALE은 THEIRS 거부 |
| A5 롤업/보존 비대칭 | 수정 | `ApmRollupJob.requiresActiveLicense=false`(DB 내부 파생 — `SchedulerJob` javadoc 기준 확장) + 워터마크는 0행이면 유지, 단 창이 `maxBuckets`에 잘렸거나 원본 보존 경계를 넘긴 경우 전진(최악 정체 `maxBuckets×step`). ⚠️ 런타임 미검증(단위 분기만) |
| 토큰 scope/kind | 수정 | OTLP 수신은 `kind=COLLECTOR`·scopes에 `ingest` 있어야 통과, 아니면 403. ⚠️ 빈 scopes 배열도 거부(V38 컬럼 주석 "빈 배열=전부 허용"과 반대 — 발급 경로는 항상 `["ingest"]`) |
| `keep_raw_sql` 소비자 0 | 수정 | `ApmCollectorConfigService`가 요청 미지정 시 설정값을 기본으로. `mask_sql`은 P2 예약 명시 |
| `PENDING_APPROVAL`·403/503 정책 | 문서화/주석만 | |
- 🔴 검수 요망: `ApmRollupWatermarkTest` Mockito varargs 스텁(`any(Object[].class)`) — 같은 함정이 다른 jdbc 목에 남아 "검증 안 하고 통과"할 수 있음 · A6(고아 스코프 정리)·A7(전역/서비스별 아이템 공유)은 미착수 · `setTriggersEnabled`는 바인딩 수 × 2 Zabbix 콜.

## 4. 검수 관점
1. A1~A5 수정이 분석 문서의 근거 라인을 실제로 닫는가(상태 전이·워터마크 규칙). 문서가 틀린 항목이 있으면 그것도.
2. FE 수집기 화면이 계약 §2·§8과 필드명·응답 코드·권한 축에서 일치하는가; 토큰 원문이 로그·상태·URL 어디에도 남지 않는가(react-query 캐시에 원문이 남는지 포함).
3. 로직 분석 문서의 §11 결정·§12 한계 중 사실과 다른 서술.

## 5. 2차 코덱스 검수 반영 (`review_apm-p1-r2_codex.md` 🔴3·🟡2)
| # | 지적 | 반영 |
|---|---|---|
| 1 🔴 | 토큰 원문이 react-query mutation 캐시에 잔존 | `useIssueApmToken`을 **mutation 우회**(직접 await, 원문은 컴포넌트 로컬 state만, 목록 쿼리 무효화). 테스트: `getMutationCache().getAll()` 0건·직렬화에 토큰 없음·모달 닫힘 후 DOM에 원문/yaml 없음 |
| 2 🔴 | FE가 `keepRawSql:false` 항상 전송 | 삼중 상태(전역 기본값/켬/끔) Segmented, 미변경 시 payload에서 키 생략(`undefined`), 전역값 라벨 표시·실효값 기준 경고(`data-source=global|explicit`). 발급·재생성 둘 다 |
| 3 🔴 | 트리거 다건 status 변경 부분 실패 | 바인딩별 완주 + 요약(`ok/fail/skip`) + 실패 바인딩 `error` 접두 `TRIGGER_STATUS_PENDING: wanted=…`(push 배지보다 우선) → 평가 배치 시작부(5분)·sync(일 1회)에서 **배지 붙은 바인딩에서 출발**해 재시도, 원하는 상태는 규칙 `enabled`에서 재독. 대상 소멸(트리거 없음·미소유·규칙 삭제) 시 배지 해제. 부수: 트리거 생성/enforce에 `status` 동봉 |
| 4 🟡 | 일괄 회수 부분 실패 UX | 결과 패널(성공 n·실패 m·실패 토큰 목록)+"실패분 재시도"(실패분만 호출) |
| 5 🟡 | 분석 문서 A20 구현 현황 불일치 | 정정 + §8 부분 실패/재시도 전이 문단 추가 |
- 테스트: FE 2015/2017(선재 2) · BE **2091 green**(신규 9). 🔴 잔여 불안: 재시도 상한·백오프 없음(5분마다 바인딩당 2콜) · 대기 중 push 실패 사유는 배지에 안 실림 · resync OURS가 사용자가 손으로 켠 트리거 status도 규칙값으로 되돌림(행동 변화) · FE 전역값 로딩 중 라벨 잠깐 "끔" · AI 모니터링 `useReissueAiMonitorToken`에 같은 캐시 잔존 패턴(숨김 상태, 미수정).

