---
name: project-resource-analysis-perf
description: "Resource 분석 리포트 성능 개선 방향 - 프로젝트 단위 1회 페치+KVS 캐시 채택, Forge SQL 적재 방안은 배제됨"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0a9054a4-0822-4828-8bd9-f91363700f4c
---

Resource 분석 리포트 페이지(`static/ui/.../analysisReport/resource/`) 데이터 로드 성능 개선 작업.

병목은 집계 연산이 아니라 **Jira REST API 페치 + 이슈별 워크로그 N+1 페이지네이션**(`getProjectWorklogs` → `getBulkIssuesByProject` → `getExtraWorklogs`).

채택된 방향 (2026-05-26):
- 기존: 페이지(인원 10명) 단위로 워크로그 조회·캐시 → 공유 이슈 중복 페치, 페이지 이동마다 재조회.
- 변경: `getResourceAnalysisListService`가 기간 내 **프로젝트 전체 워크로그를 1회 조회·집계**해 `ResourceList:projectId:start:end` 키로 KVS 캐시. 프론트는 페이지 인원만 메모리 슬라이스.

**Why:** 인력 도메인 특성상 팀원들이 이슈를 공유 → 인원 단위 분리는 비싼 워크로그 페이지네이션을 페이지마다 중복 수행함. 연산을 프론트로 내리는 안은 병목(페치 지연)을 못 줄여서 기각.

**How to apply:**
- **Forge SQL 적재(`worklog_issue_daily`) 방안은 사용자가 명시적으로 배제("3번은 안됨")** — `src/rdb/schema/ddl/worklog.js`에 DDL이 주석으로 설계돼 있으나 채택 안 함. 워크로그 SQL 동기화를 다시 제안하지 말 것.
- 이슈별 초과 워크로그 페이지네이션 병렬화는 **공통 `WorklogService.getProjectWorklogs`를 건드리지 않고** Resource 전용 `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js`(`getResourceProjectWorklogs`)로 분리해 구현함. 사용자 요청: 공통 경로 수정 금지(myWork/dashboard 등 영향 방지). slim normalize라 full issue/worklog 객체는 미보관.
- 후속 후보(미적용): 상세 패널(`getResourceWorklogDetailService`)의 per-member 재페치.
- 날짜 범위가 매우 넓거나 이슈가 극단적으로 많으면 `maxResults=5000` / 256MB 런타임 한계 주의.

관련: [[project-rfc125]]
