# ZM-157 이어서 하기 — 인수인계

- 작성: 2026-09-18 · 이 문서 하나만 읽으면 다음 세션이 이어받을 수 있게 쓴다.
- 문서 지도(전체 목록·읽는 순서): [`./INDEX_zm-157-permission.md`](INDEX_zm-157-permission.md)
- 관련 정본
  - 최종 보고서: [`./zm-157_permission-fix.md`](zm-157_permission-fix.md) (1~10장: 문제·수정·검증·후속)
  - 배포 공지 초안: [`./zm-157_배포-공지-초안.md`](zm-157_배포-공지-초안.md)
  - 권한↔API 매핑: [`./contract_zm-157-permission-enforcement.md`](contract_zm-157-permission-enforcement.md)
  - 후속 계약: [`./contract_zm-157-followups.md`](contract_zm-157-followups.md)
  - 검수 기록: [`./review_zm-157-permission.md`](review_zm-157-permission.md)(본 작업 5차) · [`./review_zm-157-followups.md`](review_zm-157-followups.md)(후속 8차)

## 1. 지금 상태 (2026-09-21 기준)

| 레포 | 브랜치·커밋 | 상태 |
|---|---|---|
| BE `moveseye-be-spring` | `master`에 `ZM-157`(**`6dc8e2e`**) 병합됨 — master HEAD는 ZM-159까지 `1799fc4` | 병합 완료, **미푸시** |
| FE `moveseyee_fe` | `master`에 `ZM-157`(**`4bc2c73`**) 병합됨 | 병합 완료, **미푸시** |
| AI `moveseye-ai` | `main` = **`a42eca0`**(`959ebf5` 병합 + MCP 실측 수정) | 병합 완료, **미푸시** |

- 워크트리 `C:/worktrees/zm-157-{be,fe,ai}`는 **2026-09-21에 제거**했다(브랜치 `ZM-157`은 미푸시라 남겨 둠).
- 검증: BE 단위 3,713 + IT 35클래스 429 · FE 관련 300 · AI 194 · dev 서버 실측(보고서 10장) · MCP 실측 12항목 · FE 브라우저 5화면.
- dev DB(`dmove`)에 **V61 + R__ 적용됨** — admin 이메일은 NULL이다(비밀번호 찾기 불가, 이메일 등록 필요).

## 2. 바로 이어서 할 일 (순서대로)

1. **푸시** — 사용자가 직접. BE·FE는 `master`, AI는 `main`. (**유일하게 남은 우리 쪽 할 일**)
2. ~~**AI 병합**~~ — 완료(타 세션이 겹친 5파일을 정리한 뒤 병합, 충돌 0).
3. ~~**MCP 런타임 검증**~~ — **2026-09-21 완료**. 결과 정본: [`./e2e_zm-157-mcp.md`](e2e_zm-157-mcp.md) (12항목 전부 통과).
   - 검증 중 결함 1건 발견·수정: `PendingAuthStore`가 `GETDEL`(Redis 6.2+)을 써서 **Redis 3.0 환경에서 동의 승인이 500**이었다 → Lua로 교체(AI 미커밋).
   - 남은 차이 🟡: 연결 폐기 표시는 다음 토큰 교환·refresh 시점에 일어나 `GET /ai/mcp/grants`에 잠시 남는다(아래 후속 과제 11번).
   - 🔴 **옛 AI + 새 BE는 MCP 발급 전부 거부가 정상**이다(배포 순서 BE→AI 직후).
4. ~~**FE 브라우저 확인**~~ — **2026-09-21 완료**(사용자 목록의 상태·작업·MCP 권한 열, 역할 편집 잠금 칸+툴팁, 연결된 앱의 커넥터 주소·연결 순서·클라이언트별 탭, 마이 페이지에 역할·그룹 필드 없음+비밀번호 변경 안내). 🔴 **권한 없는 화면의 403 안내만 미확인** — 일반 계정 비밀번호를 몰라 로그인하지 못했다(동작 자체는 dev `:3002` API로 실측함).
5. **미검증 2건** — 로그인 IP 제한(공용 IP 15분 잠금 위험으로 생략했음, 격리 환경에서), 옛 형식 토큰(`typ` 없음) 거부.
6. **배포** — 공지 초안대로. 순서 🔴 **BE → (즉시) AI → FE**.

## 3. 다른 브랜치와 얽힌 것

- ✅ **ZM-151**: 09-21 `V64__cloud_vpc_snapshot_dedup.sql`로 재번호하고 BE master에 ff 병합(`0c3d9e6`·`3741f37`). 어느 DB에도 V60으로 적용된 적이 없어(5433·5432 확인) 이력 정리는 필요 없었다. 관련 146건·BE 전체 4,248건 통과(실패 1건은 로컬 PG 한국어 로캘 탓 — `ApmSchemaIT`가 영문 "partition"을 찾음).
- ✅ **FE master 깨짐 해소(09-22)**: 미추적 모듈을 import하던 상태는 ZM-152 미커밋 28파일(09-16 완료분)을 `2c58efb`로 커밋해 해소. 같이 찾은 master 기존 실패(서비스 맵 v2 뒤 남은 굵기 테스트)는 `1954534`로 교체. APM 58스위트·1,241건 통과, FE 전체 3,466건 중 무관한 3스위트(AI 어시스턴트·데이터소스 설정·트리거 폼)만 실패.
- **ZM-159**는 master에 병합돼 있고, 우리 코드와 충돌 없이 합쳐졌다. 단 알림 추이 집계가 `listHistory` → `countHistory`로 바뀌어 캐시 격리 테스트 대역을 보강했다(`HostGroupMonitoringTest.countMatching`).

## 4. 후속 과제 (우선순위 순)

| # | 내용 | 근거·메모 |
|---|---|---|
| 1 | **동기화를 Zabbix id 기준 upsert로** — 지금은 매 회차 그룹을 지우고 다시 넣어 로컬 id가 재부여된다. 화면이 들고 있던 그룹 id가 다음 동기화 뒤 다른 그룹을 가리킬 수 있다. 현재는 잠금 후 외부 식별자 대조로 **중단**만 한다(`LockedGroupIdentity` → `ZABBIX_SYNC_CONFLICT`) | 후속 검수 7·8차. 근본 해결이며 사용자 그룹·호스트 그룹 API 전반에 영향 |
| 2 | **동기화 부분 실패를 응답에 노출** — 지금은 전체 롤백 + 예외지만, 잠금 초과로 건너뛴 사용자는 로그만 남는다 | 후속 검수 4차 |
| 3 | **운영 Redis Lua·통계 SQL 자동 회귀 테스트**(격리 Redis·PostgreSQL) — 현재 수동 실측만 | 본 검수 5차 🟡 |
| 4 | **사용자·역할·권한 변경 감사 로그** — `user_change_log` 신설(행위자·대상·전후 값). `host_change_log` 패턴 참고 | 1차 검토 M8 |
| 5 | **MCP 일반 쓰기 툴의 서버 측 확인 게이트** — 삭제는 막았지만 호스트 비활성화·템플릿 해제 등은 클라이언트 확인에 의존. BE 토큰 발급 구조 변경 필요 | AI 1차 검수 B-M1 |
| 6 | **역할 편집 화면의 무효 칸 정리** — FE는 잠금 표시까지 했다. BE 권한 스키마에서 실제로 뺄지 결정 | 계약서 2.6 |
| 7 | **공유 EP의 권한 축** — 홈·전역 검색·벨·`/hosts/server`·`/hosts/detail`·`/event/problems`는 막지 않았다(막으면 사이드바·홈 붕괴). 데이터 범위는 Zabbix 역할에만 의존 | 계약서 1장 |
| 8 | `/hosts/{groupid}/reports`의 **그룹 단위 가시성 필터**는 넣었지만, 저장 리포트 본문은 로컬 스냅샷이라 그룹 밖 호스트가 섞일 수 있다 | 본 검수 남은 위험 |
| 9 | **AI 툴 등급 결정** — `closeProblem`·`delete_host_chart`는 현행 유지(일반 쓰기). 더 보수적으로 갈지 재검토 | 사용자 결정 09-17 |
| 10 | **문서 커밋** — `moveseye-docs`는 우리가 커밋하지 않는다. ZM-157 반영분(기능 문서·ADR-0002·MCP 연결 가이드 등)이 미커밋 상태로 남아 있다 | 사용자 지시 09-17 |
| 11 | **연결된 앱 목록의 폐기 반영 시점** — 회수된 연결이 다음 사용 전까지 목록에 남는다. `myGrants` 조회에서 BE 세대를 1회 대조해 폐기·제외하거나, 배포 공지 문구에 "다음 사용 시점" 단서를 넣는다 | MCP 실측 09-21 |

## 5. 다음 세션이 알아야 할 함정

- **테스트 실행**
  - 통합 테스트: `--tests "*IT"`는 Windows에서 `.git`으로 전개된다(대소문자 무시 glob) → **`--tests "com.dmove.moveseye.*IT"`**.
  - IT는 공유 DB `moveseye_it`을 drop&create 한다 → 실행 전 `Get-CimInstance Win32_Process -Filter "Name='java.exe'"`로 다른 Gradle 테스트 워커가 없는지 확인.
  - 실행 중 BE가 `build/classes`를 공유하므로 BE 테스트는 **격리 워크트리**에서. bootRun 중인 워크트리에서 test 금지.
  - `ApmCollectorLiveRuntimeTest`는 이 PC의 otelcol(상시 기동)과 충돌해 간헐 실패한다 — 환경 문제.
  - IT DB는 기본 도커 5433이다. Docker가 꺼져 있으면 IT가 **조용히 skip**된다(실행 시간 0) → `IT_DB_URL=jdbc:postgresql://localhost:5432/`로 로컬 PG를 쓰고 `:cleanTest`로 캐시를 버린다. 단 로컬 PG는 한국어 로캘이라 `ApmSchemaIT` 1건이 영문 "partition" 문구 비교로 실패한다(동작은 정상).
- **런타임 검증**: 사용자 BE(:3000)를 죽이지 말고 **워크트리에서 :3002로** 띄운다. 스크립트 예: 스크래치패드 `run_be_3002_zm157.ps1`(`_tools/run_be_3000_dev.ps1`에서 포트만 바꾼 것, `.env`는 정본을 읽는다). dev admin 비밀번호는 `qwe123`, 헤더 `x-visitor-id` 필수, access 토큰 30분 만료.
- **커밋 규칙**: 커밋 전 파일 목록+메시지 승인, `git add -A` 금지, 푸시는 사용자 직접, `Co-Authored-By` 금지, 메시지는 `#ZM-157 [TYPE] 제목 -YYYY-MM-DD`.
- **코덱스 검수**: `codex exec --skip-git-repo-check --sandbox read-only -m gpt-6-astra -c model_reasoning_effort='"xhigh"' -C <워크트리> -o <결과.md> - < <프롬프트.md>`. 회차마다 **범위를 좁혀** 물어야 끝난다(전체 → 반영분 → 특정 파일).
- **경합 설계 원칙(이번에 8회 검수로 수렴한 것)**: ① 잠금 전 값은 **값으로 복사**, ② 잠금 후 값은 **캐시 우회(열 조회)**, ③ 판정은 **쓰는 순간의 DB 상태**로(조건부 UPDATE), ④ 원격 호출은 잠금·트랜잭션 **밖**, ⑤ 폐기·발급은 **원자 단위**(Lua/한 트랜잭션).
