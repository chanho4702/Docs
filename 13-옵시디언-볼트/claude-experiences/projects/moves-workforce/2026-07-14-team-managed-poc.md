---
tags: [moves-workforce, forge, jira, entity-property, team-managed, poc]
created: 2026-07-14
updated: 2026-07-14
status: PoC 완료 — 전 항목 실측, 설계 변경 2건 도출
---

# PoC 결과: 이슈 프로퍼티 + jira:entityProperty (팀 관리형 지원)

> **결론 먼저**: **현재 설계로 구현 가능.** 6개 검증 영역 전부 실측 통과. 단 실측이 문서와 달랐던 지점 2곳이 설계에 반영되어야 한다 — ① **date 인덱스는 write 시점에 date-only(`yyyy-MM-dd`)만 파싱**(datetime ISO는 조용히 무시됨) → 인덱스용/표시용 필드 분리, ② `in (...)`·`is EMPTY`가 **문서에 없지만 실제로 동작** → JQL 이식이 예상보다 쉬움. 미실측 2건(clone 복사 여부, alias 충돌)은 리스크 관리로 남김.
>
> 진단 문서: [[2026-07-14-team-managed-field-gap]]

## 검증 환경

- 사이트: `tom-chkim-dev.atlassian.net` (development 앱 설치본 업그레이드)
- 방법: PoC 전용 webtrigger(`src/poc/entityPropertyPoc.js`, asApp) — 본 구현과 동일한 Forge 런타임 경로
- 테스트 이슈: **ASD-5/6/7** (팀 관리형, next-gen) · **WORK-101/102/103** (회사 관리형, classic) — 사이트에 남겨둠(육안 확인용)
- 2단계 배포: Phase A(webtrigger만) → 프로퍼티 사전 write → Phase B(`jira:entityProperty` 추가) → 재색인 검증

---

## 1. Issue Property + jira:entityProperty

**검증 내용**: 팀/회사 관리형 모두 프로퍼티 read/write 가능한지, manifest 선언 후 인덱싱되는지, 반영 시점·재색인 여부.

**검증 방법**: `PUT/GET /rest/api/3/issue/{key}/properties/movesRmsPoc` (asApp)를 양쪽 프로젝트 유형에 실행. 선언 **전** ASD-5·WORK-101에 write → 선언 배포 → rewrite 없이 alias 검색. 선언 **후** ASD-6·WORK-102에 write하며 write→검색가능 지연 폴링 측정.

**실제 결과**:
- write 201 / read 200 — **팀·회사 관리형 완전 동일** ✅
- **선언 전에 쓴 값이 rewrite 없이 alias 검색에 즉시 매칭** — 모듈 등록 시점에 기존 저장값까지 인덱싱됨 (Connect 시절 "재저장 필요" 통념과 다름) ✅
- 선언 후 write → 검색 가능까지 **약 0.8~1.0초** (1회 폴링에 매칭; 기존 커스텀필드 인덱스 지연으로 캐시 패치까지 갔던 것 대비 우수) ✅

**문서 근거**: https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-entity-property/ (인덱싱 시점·재색인은 문서에 **명시 없음** — 실측으로 확인)

**성공/실패**: ✅ 성공 | **영향도**: 마이그레이션 배치가 재색인에 의존할 필요 없음(단, 대량 데이터 재색인 소요시간은 미측정 → §6 참고).

## 2. JQL 동작 검증

**검증 내용**: user/date/string alias의 연산자 전체 매트릭스.

**검증 방법**: 값 배치를 알고 있는 6개 이슈에 대해 alias JQL 실행, 기대 집합과 대조.

**실제 결과** (전 항목 기대값과 정확히 일치):

| JQL | 결과 | 판정 |
|---|---|---|
| `movesPocCoworkers = currentUser()` | 호출자(앱 유저)가 coworkers에 든 3건 정확 | ✅ |
| `movesPocCoworkers = "<accountId>"` | 3건 정확 | ✅ |
| `A OR B` (다중 사용자) | 4건 정확 | ✅ |
| `movesPocCoworkers in ("A","B")` | 4건 정확 — **문서에 없지만 동작** | ✅ |
| `is EMPTY` / `is not EMPTY` | 2건/4건 정확 — **문서에 없지만 동작** | ✅ |
| `movesPocAssignedAt >= / <= / 범위결합` | date-only 저장 시 정확 (아래 ⚠️) | ✅* |
| `ORDER BY movesPocAssignedAt ASC` | 4건 순서 정확 (07-10→12→14→16) | ✅ |
| 배열 contains 의미론 | [A,B] 저장 이슈가 `= A`에도 `= B`에도 매칭 | ✅ |
| string alias `movesPocAssignedBy = "..."` | 3건 정확 | ✅ |
| `project = ASD AND ...` (타 조건 결합) | 팀 관리형만 2건 정확 | ✅ |

**⚠️ 발견 — date 타입 포맷 함정**: `"2026-07-14T12:00:00.000+0900"`·`"...Z"` 등 **datetime ISO로 write하면 date 인덱스에 조용히 안 들어감**(에러 없음). `"2026-07-14"` date-only로 쓰면 즉시 인덱싱. 반면 **선언 시점 일괄 인덱싱은 datetime 문자열도 처리**하는 비대칭이 있음 — write 경로 파서가 더 엄격.

**문서 근거**: 위 모듈 문서의 타입별 연산자 표(string은 `=`/`!=`만 명시, `in`/`is EMPTY` 미기재, date 포맷 미기재).

**성공/실패**: ✅ 성공(포맷 규칙 준수 조건부) | **영향도**: **[설계 변경 1]** 프로퍼티에 `assignedAt`(date-only, 인덱스용)과 `assignedAtIso`(datetime, 표시용)를 분리 저장. **[설계 단순화]** `in`/`is EMPTY` 동작으로 기존 JQL(`moves_RMS_coworkers in (...)`)을 OR 전개 없이 거의 1:1 치환 가능.

## 3. search/jql + properties

**검증 내용**: `properties` 파라미터로 프로퍼티를 검색 결과에 동봉 수신, 추가 REST 없이 현행 1패스 구조 유지.

**검증 방법**: `GET /rest/api/3/search/jql?jql=...&fields=summary,project&properties=movesRmsPoc`.

**실제 결과**: 각 이슈에 `properties.movesRmsPoc: {coworkers, assignedAt, assignedById}` 동봉 반환 ✅. 값 없는 이슈는 `properties: {}`. **팀 관리형 이슈(ASD-5)도 값 정상 동봉** — fields와 달리 프로젝트 유형 무관. 응답 예시:

```json
{ "key": "ASD-5",
  "fields": { "summary": "...", "project": { "key": "ASD", "simplified": true } },
  "properties": { "movesRmsPoc": {
      "coworkers": ["712020:4c9f849c-...", "712020:4519c5b6-..."],
      "assignedAt": "2026-07-10T09:00:00.000+0900",
      "assignedById": "712020:4c9f849c-..." } } }
```

**문서 근거**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/ (`properties` 파라미터, 최대 5개 키)

**성공/실패**: ✅ 성공 | **영향도**: 현행 "검색 1패스로 목록+값" 패턴 그대로 유지, N+1 없음. 프로퍼티 1키에 객체로 묶으면 5개 제한과 무관.

## 4. Team-managed 동등성

**검증 내용**: 회사 관리형과 동일 결과가 나오는지, 원래 커스텀 필드 문제를 실제로 해결하는지.

**검증 방법**: 모든 §1~3 테스트를 양 유형에 병행. 추가로 **원버그 재현**: 팀 관리형 ASD-7에 기존 방식(커스텀필드 `PUT /app/field/{id}/value`) write 후 fields read-back.

**실제 결과**:
- 프로퍼티 read/write/검색/동봉: 팀·회사 관리형 **결과 완전 동일** ✅
- 원버그 재현 성공: ASD-7 필드 write **204 성공** → `fields` read-back에 **필드 자체 부재** (회사 관리형 WORK-103은 값 반환) — dmove 운영에서 본 증상과 정확히 일치. JQL 인덱스는 팀 관리형에서도 매칭(`moves_RMS_coworkers in (...)` 1건) — 진단 문서의 "write·인덱스는 되고 read만 죽는 비대칭" 재확인 ✅
- 즉 프로퍼티 이전은 이 문제를 **실제로 해결** ✅

**문서 근거**: [[2026-07-14-team-managed-field-gap]] §3 (dmove 실데이터) + 본 PoC 재현.

**성공/실패**: ✅ 성공 | **영향도**: 팀 관리형 지원의 기술적 차단 요인 없음 확정.

## 5. Issue Property 제약사항

**검증 내용**: clone 복사 여부, 수정 권한, 크기/개수 제한, dev/prod 키 충돌.

**검증 방법·결과**:

| 항목 | 방법 | 결과 | 판정 |
|---|---|---|---|
| 크기 제한 | 40KB/30KB PUT | 40KB → **400 "Maximum length is 32,768 bytes"**, 30KB → 201 | ✅ 실측 |
| 인덱스 요소 수 | 문서 | 앱 전체 100 요소 제한 — 본 설계 3개로 여유 | 📄 문서 |
| 수정 권한 | 문서 | "Browse projects + **Edit issues** 권한이면 누구나 REST로 set 가능" — 위변조 리스크 확정 | 📄 문서 |
| clone 시 복사 | — | **미실측** (clone은 REST 미제공, UI 전용). 커뮤니티 통설은 "미복사" — 배포 전 수동 1회 확인 필요 | ⏳ 보류 |
| dev/prod 키 충돌 | 구조 논증 | 프로퍼티는 이슈에 붙는 **전역 키-값**(앱 네임스페이스 없음) — 같은 키를 쓰면 상호 덮어씀 확정. 이 사이트에도 앱 2개 env 공존(필드 2벌 재확인) | ✅ 확정 |
| **alias 충돌** (신규 식별) | — | 두 env가 같은 `searchAlias`를 선언하면? **미실측** — dev/prod 공존 사이트에서 검색 모호 가능 | ⏳ 보류 |

**문서 근거**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-properties/ (권한·32KB), entityProperty 모듈 문서(100 요소).

**성공/실패**: ✅ 대부분 확정, 2건 보류 | **영향도**: 32KB는 coworkers 수백 명까지 여유. 위변조 리스크는 진단 문서 §6-4 그대로 수용. **[설계 변경 2 후보]** alias에 환경 구분이 필요할 수 있음(운영 단일 앱 원칙이면 불필요).

## 6. Migration

**검증 내용**: 커스텀필드 → 프로퍼티 복사 절차, 배포 순서, 주의사항.

**검증 방법**: WORK-103에서 리허설 — ① 기존 방식으로 필드 write(204) → ② fields read로 accountId 추출 → ③ 프로퍼티로 변환 write(201) → ④ alias 검색 매칭 확인.

**실제 결과**: 4단계 전부 성공, 이관 직후 검색 매칭 ✅. 배포 순서도 실측 확인: **manifest 선언 배포(+설치본 업그레이드) → write → 즉시 검색 가능**. 특기사항:
- 선언 **전** 값도 등록 시 일괄 인덱싱되므로(§1) "복사 먼저, 선언 나중" 순서도 이론상 동작하나, 대량 데이터의 일괄 인덱싱 소요시간이 미지수이므로 **선언 먼저 → 배치 복사**를 표준 순서로 권장.
- 마이그레이션 소스 읽기는 **회사 관리형에서만 가능**(팀 관리형은 fields가 안 읽히므로 이관할 원본 자체가 없음 — 그 데이터는 어차피 사용자에게 보인 적 없는 값).
- date는 이관 시 date-only로 변환해야 함(§2 함정).
- `forge deploy`만으로 기존 설치본에 반영 안 될 수 있음 — **`forge install --upgrade` 필요**했음(실측).

**문서 근거**: §1·§3 문서 + 실측.

**성공/실패**: ✅ 성공 | **영향도**: 배치 설계 단순 — 회사 관리형 이슈 대상 "필드 read(검색 1패스) → 프로퍼티 write" 청크 루프.

## 성능 (추가 요청 항목)

- **검색 동봉 비용**: 동일 JQL·fields로 5회 평균 — fields만 **364ms** vs fields+properties **370ms** (**+6ms, ~2%**) → properties 동봉은 사실상 무비용.
- **write→검색 반영 지연**: 약 **0.8~1.0초** (팀/회사 관리형 동일) → 기존 커스텀필드에서 겪은 인덱스 지연(수 초, 캐시 패치로 우회)보다 양호. 단 write 직후 즉시 재조회 UI는 기존처럼 **서버 응답 캐시 패치 패턴 유지** 권장 ([[project_jira_search_index_lag]]와 동일 원칙).
- 대량(수천 건) 이슈에서의 properties 동봉 페이지네이션 부하는 dev 데이터 규모 한계로 미측정 — 본 구현 검증 단계에서 실데이터 측정 항목으로 이월.

---

## 종합 결론

**① 현재 설계로 구현 가능한가 — 가능 (확정).** 프로퍼티 1키 객체 + entityProperty 인덱스 + search/jql properties 동봉으로 팀 관리형 코워커·작업이력이 회사 관리형과 완전 동일하게 동작함을 실측했다.

**② 설계 변경 필요 지점**
1. **date 분리 저장**: `assignedAt`은 date-only(`yyyy-MM-dd`, 인덱스용) + `assignedAtIso`(datetime, 표시·정밀도용) 2필드로. (실측 함정 — datetime은 write 시점 인덱스에 조용히 누락)
2. **JQL 치환 단순화**: `in (...)`·`is EMPTY` 실동작 확인 → 기존 coworker JQL을 OR 전개 없이 이식. 설계서의 "OR로 풀어쓰기" 항목 제거 가능.
3. (조건부) dev/prod 공존 사이트가 계속 존재한다면 프로퍼티 키·alias에 환경 접미사. 운영 단일 앱 원칙 유지 시 불필요.

**③ 남은 리스크**
- **clone 시 프로퍼티 미복사(미실측)** — 배포 전 수동 1회 확인. 미복사가 맞으면 "클론 이슈는 코워커 비어있음"을 알려진 동작으로 문서화.
- **alias 충돌(두 env 동일 alias, 미실측)** — dev/prod 공존 사이트 한정. 운영 단일 앱이면 무관.
- **대량 데이터 일괄 인덱싱 소요시간** — 선언 시점 재색인이 수만 건에서 얼마나 걸리는지 미지수 → 표준 순서(선언 먼저, 배치가 write)로 설계하면 의존하지 않음.
- **위변조**(편집 권한자의 REST 수정) — 문서상 확정된 트레이드오프, 수용 여부는 정책 결정.

## 정리 상태 / 재현 방법

- 작업 트리(미커밋): `manifest.yml`(webtrigger + jira:entityProperty PoC 블록), `src/poc/entityPropertyPoc.js` — **본 구현 전 제거 또는 본 구현으로 대체**
- dev 사이트 잔존물: ASD-5/6/7, WORK-101/102/103 (프로퍼티 부착) — 육안 확인용으로 유지, 불필요 시 삭제
- webtrigger: `forge webtrigger delete`로 제거 예정 (URL 노출 방지, 토큰 가드 있음)
- 재현: webtrigger `?action=env|seed|write|read|search|perf|indexlag|big&token=...` — 코드 주석 참조
