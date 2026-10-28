# 검수 요청 — ZM-159 알람 동기화 범위 설정 (운영 회피책)

- 요청: Claude · 2026-09-18 · 사용자 지시: "호스트그룹 지정이랑 심각도 선택, 꺼진 규칙 제외 등 범위를 줄일 수 있는 것들을 설정으로 다 빼줘"
- BE `C:/worktrees/zm-159-be`(ZM-159) · FE `C:/worktrees/zm-159-fe`(ZM-159) — 양쪽 미커밋 변경이 범위
- 배경: 알람 동기화(15초 보정 5분)는 **열린 프로블럼 전량**을 1콜(상한 1만)로 받는다. 열린 알람이 많은 설치본은 부하가 크고 상한 밖이 화면에서 누락된다. 구조 해결(T-A A-2, 커서 분할)은 별도 티켓으로 보류 — 그 사이 **운영으로 좁히는 수단**을 제공한다.

## 범위
| 층 | 변경 |
|---|---|
| DB | `V62__setting_event_sync_scope.sql` — `setting_type_enum`에 `EVENT_SYNC` 추가(V24 선례, PG12+ 트랜잭션 허용) |
| BE | `EventSyncScope`(설정 value 해석: groupIds·minSeverity·excludeSuppressed·enabledRulesOnly, 해석 실패·미지 값은 제한 없음) · `AlertQuery.withGroupIds` 신설 · `EventSyncService.syncScope()`가 보정·증분 질의에 범위 적용(설정 읽기 실패 시 전부 동기화) · `SettingType.EVENT_SYNC` · `SettingController` GET/POST `/setting/event-sync-scope`(관리자) · `SettingService.secretKeysFor` 분기 |
| FE | `EventSyncScopeCard`(자빅스 데이터소스 설정 화면 하단) — 그룹 다중선택(기존 `/users/host-groups` 재사용)·최소 심각도·억제 제외·꺼진 규칙 제외, 주의 배너. `setting.api` 2개, 타입·쿼리키·kr/en 번역 |
| 테스트 | BE `EventSyncScopeTest`(해석·적용·오타 내성) 5건 + `EventSyncServiceTest` 3건(기본 전부/범위 적용/설정 실패 폴백). FE 4건(렌더·저장 payload·번역 키) |

## 중점 확인 요청
1. **질의 정확성**: `withGroupIds`가 뒤쪽 필드(limit·enabledRulesOnly 등)를 잃지 않는가(그 클래스의 알려진 함정). 범위가 보정·증분 **양쪽**에 실리는가. `minSeverity` → `severities` 확장(이상 등급 전부)이 Zabbix `severities` 의미와 맞는가.
2. **부작용 경계**: 좁힌 알람이 사라지는 화면 목록이 맞는가(벨·문제 목록 기본·홈 위젯). 사본을 읽는 다른 소비자(통계·AI 요약·SSE)가 더 있는가. 이미 사본에 있던 행이 범위 밖이 되면 어떻게 되는가(되짚기·좀비 정리와의 상호작용 — A-1 규칙과 충돌하는가).
3. **설정 경로**: PG enum 추가 마이그레이션의 안전성, 설정 저장 시 비밀값 병합 분기(`EVENT_SYNC` → 빈 집합)가 맞는가, 관리자 권한 가드.
4. FE: 그룹 값 축(`zabbixHostGroupId`)이 BE가 기대하는 groupids와 같은가, 미설정(null) 응답 처리, 저장 payload.
5. 테스트가 위를 고정하는가. 빠진 경계는?

## 출력 형식
- `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 근거 · 제안`. 확인 못 한 것은 "추정". 파일 수정·빌드 금지.

---

## 반영 기록 (2026-09-18, 코덱스 gpt-5.6-sol high → `review_zm-159-event-sync-scope_codex.md`)
| 번호 | 판정 | 반영 |
|---|---|---|
| R1 필수 | 수용 | `enabledRulesOnly`가 **목록 조회에는 적용되지 않던** 결함(집계 경로에만 있었다) 수정 — 어댑터에 `enabledRuleChunks`/`problemsRaw` 추가해 활성 트리거 id를 `objectids` 500개씩 실어 3경로(경량·규칙 포함·소유자 포함) 모두 적용. `ProblemGetParams`에 `objectids`(+`toBuilder`) |
| R2 필수 | 수용 | 범위 밖 기존 사본 행이 매 회차 "사라진 후보"로 뽑히던 문제 — 후보 조회가 심각도·억제·규칙 활성·`group_refs`를 함께 돌려주고, 범위 밖 행은 되짚기에서 제외(커서는 그대로 전진해 앞에서 막히지 않음). 범위 밖 행은 갱신이 멈춘 채 A-1 좀비 정리(2일)가 치운다 → 사본이 설정과 결국 일치 |
| R3 필수 | 수용 | 조치 직후 표적 재동기화(`resyncEvents`)가 범위 판정 없이 upsert하던 경로에 `EventSyncScope.matches(alert)` 적용 — 범위 밖 알람이 벨·목록에 되살아나지 않는다 |
| R4 필수 | 수용 | FE: 조회 실패(`isError`)와 미설정(null)을 구분 — 실패면 오류 배너 + 재시도, 폼·저장 **비활성**(기존 설정을 빈 값으로 덮어쓰는 사고 방지) |
| R5 권장 | 수용 | 주의 문구에 **이벤트 현황 통계·AI 알람 요약**도 영향받는다고 명시(둘 다 사본을 읽는다). 영향 없는 경로(이력 모드·리포트·그룹별 문제 요약)와 구분 |
| R6 권장 | 수용 | 그룹 선택지에서 `zabbixHostGroupId` 없는 행 제외(로컬 PK를 groupids로 보내지 않는다) |
| R7 권장 | 수용 | 그룹 목록을 500건씩 **전체 페이지 수집**(상한 5,000 — 넘으면 검색형 선택으로 전환 필요, 주석에 명시) |
| R8 권장 | 수용 | BE 판정 테스트 4건 추가(사본 행·알람 기준, groupid 키 매칭, 판정 불가 시 범위 안), FE 테스트는 그룹 목록 형태 변경 반영 |

🔴 알아 둘 것: 범위를 좁히면 **이미 사본에 있던 범위 밖 알람은 즉시 사라지지 않고** 2일 뒤 정리 배치가 지운다(그동안 화면에 남는다). 즉시 제거하려면 사본 전수 스캔이 필요해 이번 범위에서는 하지 않았다.
