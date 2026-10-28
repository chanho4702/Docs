---
name: integration-verify
description: "moves-approval-jira 통합 검증 방법 — resolver 응답 shape ↔ invokeApproval 소비 경로 교차 비교, resolver 3단계 등록, 불변식 1~10 감사, 권한 범위(형제 resolver·팀장 범위·읽기/쓰기 대칭), 엔트리 3곳·i18n·마이그레이션 점검, 테스트·빌드 실행. integration-verifier 가 검증·QA·재검증할 때 반드시 사용."
---

# Integration Verify — 경계면 교차 검증

## 순서

1. `git diff --stat` 와 `git status` 로 실제 바뀐 파일을 확정한다(보고서 목록을 믿지 않는다).
2. 경계면 표를 만든다 — 설계서 계약의 resolver 마다 한 줄:

| resolver | 생산자(파일:라인, 반환 shape) | 소비자(파일:라인, 접근 경로) | 일치 |
|---|---|---|---|

3. 아래 점검표를 훑는다.
4. 실행: `npm run merge` → `npm test -- --runInBand` → `npm run test:ui -- --runInBand` → `npm run build:ui`.
5. `03_verify_report.md` 작성.

## 점검표

**등록**
- [ ] 새 resolver 가 `guardedDefine` + `PermissionMap` + `CONTROLLER_REGISTRARS` 세 곳에 있다
- [ ] 프론트 `invokeApproval('fn')` 의 fn 이 실제 등록 이름과 같다

**shape**
- [ ] `invokeApproval` 는 `content` 를 벗긴다 — 소비자가 `.content` 를 한 번 더 읽지 않는다
- [ ] 필드명(camelCase) 이 SQL 컬럼(snake_case) → Repository 매핑 → 응답 → 화면까지 일관
- [ ] 실패 분기가 `error.code` 로 되어 있고 그 code 가 `ErrorCodes`·`locales/*/error.json` 에 있다
- [ ] 시각은 epoch ms 로 나가고, SQL 바인딩은 `SqlTime` 을 거친다

**불변식** (`CLAUDE.md` 1~10)
- [ ] scopeKey 와 dedupe_key UNIQUE 로 열린 요청 하나가 보장된다(동시 제출 테스트가 있는가)
- [ ] 도메인에 `Date.now()`·`new Date()` 무인자 호출·fetch·SQL 이 없다 (`grep -rn "Date.now\|new Date()" src/domain`)
- [ ] CAS UPDATE 에 `rev = rev + 1`
- [ ] 결재자 UPDATE 에 `decision_type='PENDING'` 조건
- [ ] 이벤트 id 가 결정적
- [ ] 엔티티 프로퍼티 값이 판정·권한에 쓰이지 않는다
- [ ] `asApp()` 사용처가 `AGENTS.md` 허용 목록 안이고, 그 결과가 응답으로 나가지 않는다

**권한 범위**
- [ ] 같은 데이터를 내주는 **형제 resolver 전부** 같은 범위로 좁혀졌다(목록·상세·내보내기·카운트)
- [ ] 읽기에 있는 범위 검증이 같은 대상의 쓰기(결정·일괄 결정)에도 있다
- [ ] 팀장은 자기 팀원 타임시트만 조회·결정한다 — 다른 팀 accountId 를 넣어 호출하는 테스트가 있는가
- [ ] `SELF` 는 서버의 `context.accountId` 를 쓴다(클라이언트 값 불신)

**유휴 비용 (Forge SQL 은 요청·실행 시간마다 과금 — 2026-10-10 사고)**
- [ ] 새 `scheduledTrigger`·`consumer` 가 추가되지 않았다. 스케줄은 **하루 1회 `approval-sweep` 하나**에서 큐 fan-out 한다(5분·시간당 트리거 금지)
- [ ] 각 배치 작업의 **빈 상태(처리 대상 0건) SQL 횟수**를 모의 executeQuery 로 세는 테스트가 있고 상한이 숫자로 고정돼 있다
- [ ] 트리거·consumer 경로가 호출마다 `information_schema` 를 조회하지 않는다(KVS 스키마 마커 → 캐시 → 폴백 순)
- [ ] 리스 획득이 조건부 UPDATE 1회(행 없을 때만 INSERT)이고, 바뀌지 않은 커서를 다시 쓰지 않는다
- [ ] 기능 OFF·연동 미연결·대상 없음 이면 **SQL 진입 전에** 반환한다(정책은 KVS)
- [ ] Jira 이벤트 트리거(`onWorklogChanged`·`onIssueChanged`)가 무관한 이벤트에서 SQL 0회로 끝난다
- [ ] resolver 응답 후 fire-and-forget 으로 배치를 돌리지 않는다(실행 보장 없음)

**번들 로드**
- [ ] `npm run check:bundle` 통과 — Jest 는 순환 import TDZ 를 못 잡는다. 모듈 최상위에서 다른 모듈의 default export 를 **값으로 즉시 읽는**(기본 매개변수·싱글턴 생성) 코드는 순환 고리에서 배포 즉시 전 resolver 를 죽인다(2026-10-12)

**프론트·배포 단위**
- [ ] 새 엔트리가 craco ENTRIES·public html·manifest 세 곳에 있다
- [ ] i18n 키가 kr/en 양쪽에 있고 merge 가 통과한다, 화면 하드코딩 문자열 없음
- [ ] 쿼리키가 팩토리에서 나온다
- [ ] 마이그레이션 번호가 중복·역순이 아니다
- [ ] `manifest.yml` app id 가 Confluence 앱 id 로 돌아가지 않았다

## 보고서 (`_workspace/<slug>/03_verify_report.md`)

```markdown
# 검증 리포트 (회차 N)
## 요약  통과 x / 실패 y / 미검증 z
## 실패   - [파일:라인] 무엇이 어긋남 → 고치는 방법 (담당: backend|frontend)
## 미검증 - 항목 / 이유(실행 불가·실측 필요) / 확인 방법
## 통과   - 경계면 표, 점검표 체크 결과
## 실행 결과  명령별 통과/실패 + 실패 출력 발췌
```
