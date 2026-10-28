---
tags: [moves-workforce, forge, jira, custom-field, team-managed, diagnosis]
created: 2026-07-14
updated: 2026-07-14
status: 진단 완료 · 해결 방향 확정(PoC 대기)
---

# 팀 관리형 프로젝트에서 코워커·작업이력 필드가 비는 이유

> **한 줄 요약**: 팀 관리형(team-managed) 프로젝트에서는 Forge 커스텀 필드가 **이슈 필드 응답에 아예 실리지 않는다.** 값 쓰기(write)와 JQL 검색 인덱스는 동작하고, 값을 **다시 읽어오는 것만** 안 된다. 그래서 JQL로만 소비하는 `projectId`는 정상처럼 보이고, 값을 읽어 화면에 표시해야 하는 **코워커·등록일·등록자**만 죽는다. 앱 코드 버그가 아니라 Jira 플랫폼 제약.


## 1. 증상

팀 관리형 프로젝트(DWEB, RFC, ZM 등)의 이슈를 앱에 작업으로 등록하면:

- **작업 등록 자체는 됨** — 이슈가 프로젝트 이슈 목록에 정상 표시 (`moves_RMS_projectId` 지정 OK로 보임)
- **코워커 지정이 안 됨** — 지정해도 화면에 항상 빈 값
- **작업이력(등록일·등록자)이 안 남음** — 작업 이력 페이지가 비어 있음

회사 관리형(company-managed) 프로젝트에서는 셋 다 정상.

## 2. 배경: 필드 값이 나가는 통로는 2개

앱의 Forge 커스텀 필드 6종(`moves_RMS_projectId`, `moves_RMS_coworkers`, 등록일, 등록자, wbsParent, predecessors)은 모두 같은 방식으로 저장한다 — `PUT /rest/api/3/app/field/{id}/value` (asApp).

저장된 값을 Jira가 내주는 통로는 둘로 나뉜다:

1. **검색 인덱스 (JQL 매칭)** — `moves_RMS_projectId = "abc"` 조건으로 이슈를 *찾을 때*. 값이 아니라 조건에 맞는 이슈 목록만 반환.
2. **이슈 필드 표현 (REST 응답의 fields)** — 이슈 조회 시 `fields.customfield_10742: [...]`처럼 *값 자체를* 반환.

팀 관리형 프로젝트의 제약은 정확히 **2번만** 망가뜨린다. Forge 필드가 팀 관리형 프로젝트에 연결(컨텍스트 적용)되지 않아 이슈 응답의 필드 집합에서 통째로 빠진다. 쓰기와 ①인덱스는 멀쩡하다.

```
앱이 필드 값 write (PUT /app/field/{id}/value) — 팀 관리형에서도 성공(2xx)
        │
        ├─→ ① 검색 인덱스        : 반영됨   → "이 조건의 이슈 찾아줘" 동작 ✅
        └─→ ② 이슈 필드 응답     : 필드 없음 → "값을 읽어서 보여줘" 불가   ❌
```

비유: 도서관 **검색대에는 등록돼 있어 검색하면 찾아지는데**, 정작 책을 펼치면 그 페이지가 **인쇄돼 있지 않은** 상태.

## 3. 증거: 같은 앱, 두 이슈 비교

앱에 등록된 이슈 두 건을 `fields=*all&expand=names`로 직접 조회해 비교:

| 확인 항목 | DS-4 (회사 관리형) | DWEB-30 (팀 관리형) |
|---|---|---|
| JQL `moves_RMS_projectId is not EMPTY` 매칭 | ✅ 매칭됨 | ✅ 매칭됨 |
| 응답 fields에 `moves_RMS_*` 존재 | ✅ 6종 모두 (customfield_10742~10748) | ❌ 하나도 없음 (names 맵에도 없음) |
| projectId 값 읽기 | ✅ 값 반환 | ❌ 필드 자체가 없음 |

write 로그도 성공이고 JQL도 매칭되니 겉보기엔 반쯤 동작하는 것처럼 보이지만, 실제로는 "읽기" 통로 하나만 정확히 죽어 있다. 팀 관리형 프로젝트 설정에서 관리자가 앱 필드를 레이아웃에 추가하는 방법도 없다 (Forge `jira:customField`는 회사 관리형 전용 — 공식 제약).

## 4. 왜 projectId만 되는가

앱이 필드마다 **다른 통로를 쓰기 때문**.

| 필드 | 앱이 소비하는 방식 | 통로 | 팀 관리형 |
|---|---|---|---|
| projectId | "이 프로젝트의 이슈 다 줘" — 검색 조건으로만 사용, 값을 표시할 일 없음 | ① JQL만 | ✅ 동작 |
| coworkers | `issue.fields[필드ID]`에서 꺼내 아바타 표시·편집 | ② fields 읽기 | ❌ 항상 빈 값 |
| 등록일·등록자 | `issue.fields[필드ID]`에서 꺼내 이력 테이블·번업 구성 | ② fields 읽기 | ❌ 항상 빈 값 |

부작용: 등록일 기록의 중복 방지 가드(`readIssueFieldValue`)도 ②를 쓰므로 팀 관리형에서는 항상 "값 없음"으로 읽혀 매번 재기록(덮어쓰기)된다.

## 5. 해결 옵션

### A. 코워커·등록일·등록자를 이슈 프로퍼티로 이전 — **권장**

- 이슈 프로퍼티(issue property)는 프로젝트 유형 무관 read/write 가능, `search/jql`의 `properties` 파라미터로 검색 응답에 동봉 → 현행 "검색 1패스로 목록+값" 패턴 유지.
- manifest `jira:entityProperty` 선언 시 JQL 검색(myWork 협업자 조건)도 별칭(alias)으로 대체 가능.
- **projectId는 JQL 전용 소비라 손대지 않아도 됨** → 변경 범위가 코워커 + 작업이력 2개 영역으로 한정.

### B. 회사 관리형 프로젝트만 지원 (운영 정책) — 차선

코드 무변경으로 가장 확실하지만 팀 관리형 요구 자체를 못 채움. 채택 시 이슈 추가 모달에서 팀 관리형 이슈(`project.simplified === true`) 필터링 UX 가드 필요.

### C. Forge SQL(앱 DB)에 저장 — 비추천

JQL 결합(협업자 검색·기간 필터 조합)이 전부 깨져 리팩토링 범위 최대.

## 6. A안(프로퍼티 이전)의 트레이드오프

1. **Jira 네이티브 노출 상실 (회사 관리형에서의 퇴행)** — 프로퍼티는 이슈 화면·네비게이터 컬럼·CSV 내보내기·보드 필터에 안 나옴. 사용자 직접 JQL도 alias 문법으로 바뀌고 자동완성 없음.
2. **JQL 표현력 타입별 제한 — PoC 필수** — entityProperty 인덱스는 타입별 연산자 고정(string은 `=`/`!=`만, user는 accountId 매칭+`currentUser()`, date는 범위). 배열 인덱싱은 공식 지원. `in (...)`은 OR 전개 필요, `is EMPTY` 지원은 문서에 없어 실측 필요.
3. **마이그레이션·배포 순서** — 기존 회사 관리형 이슈의 필드값→프로퍼티 복사 배치(수천 건이면 큐/청크). 인덱싱은 모듈 선언 이후 write부터 반영 → "manifest 배포 → 배치 실행" 순서 강제. 이행기 이중 소스(폴백 읽기 vs 일괄 절체) 결정 필요.
4. **무결성 약화** — readOnly 앱 필드는 사용자가 못 건드리지만, 프로퍼티는 이슈 편집 권한자가 REST로 수정·삭제 가능. 등록자 위변조 방지 보증이 API 레벨에서 낮아짐.
5. **자잘한 차이** — clone 시 필드는 복사되지만 프로퍼티는 미복사 · dev/prod 공존 사이트에서 프로퍼티 키 상호 덮어씀(환경 프리픽스 or 운영 단일 앱, [[project_forge_env_field_duplication|필드 2벌 문제]]와 반대 방향) · 검색 응답 프로퍼티 상한 5개/요청 — **프로퍼티 1개의 객체**(`{coworkers, assignedAt, assignedById}`)로 묶으면 무관.

치명적 차단 요인은 없고 3·5는 설계로 흡수 가능. 실질 감수 대상은 **1(노출)·4(무결성)**, **2는 PoC 선행 조건**. 반대급부: 팀 관리형 지원 + dev/prod 필드 2벌 해소 + 필드 인덱스 지연([[2026-07-02-issue-link-gantt|간트 상위지정 버그]] 원인) 해소.

## 7. 다음 단계

1. **PoC (dev 환경, 소규모)** — `jira:entityProperty` 선언 + 코워커 accountId 배열 user 타입 인덱싱 + alias JQL 실측(다중 계정 OR, is EMPTY, 팀 관리형 이슈 매칭)
2. PoC 통과 시 **RFC 본 구현** — write 2곳(코워커 갱신·등록일/등록자 기록), read 경로(이슈 테이블·작업이력·간트·캘린더·리포트), 마이그레이션 배치
3. **병행 여부 결정** — 회사 관리형의 Jira 이슈 화면 노출 유지가 필요하면 필드 이중 write 절충안 검토

## 참고

- Forge jira:customField — https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field/
- 팀 관리형에서 jira:customField 표시 불가 — https://community.developer.atlassian.com/t/display-jira-customfield-on-issue-view-in-software-project-team-managed/64043
- Forge jira:entityProperty — https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-entity-property/
- Enhanced JQL Search (search/jql) — https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
- 관련: [[forge-readonly-appfield-write]] · [[2026-07-02-issue-link-gantt]]
