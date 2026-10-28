---
name: project-jira-test-data-platform
description: Jira 테스트 데이터 생성 플랫폼 - C:\test-sample에 구축된 풀스택 앱 현황
metadata: 
  node_type: memory
  type: project
  originSessionId: c4e41387-8868-4c20-9170-011b12ba09b6
---

Jira Test Data Generation Platform이 C:\test-sample에 완전히 구현되었음.

**Why:** RMS/PMS 분석 시스템 테스트용 현실적 Jira 데이터 대량 생성 필요

**How to apply:** 이 프로젝트를 계속 개발할 때 기존 아키텍처와 파일 구조를 참고

## 구조
- Monorepo: `client/` (React+Vite) + `server/` (Node.js+Express)
- 루트에서 `npm run dev`로 동시 실행 (concurrently)
- Vite proxy: 클라이언트 /api → 서버 3001포트

## 서버 핵심 파일
- `server/src/clients/jira.client.ts` - Jira REST API v3 wrapper (전역 Limiter 5개 동시성)
- `server/src/generators/issue.generator.ts` - Epic/Story/Task/Bug 계층 생성
- `server/src/generators/worklog.generator.ts` - 날짜 분포 알고리즘 (마감일 집중, 불균형)
- `server/src/queue/bulk.queue.ts` - 3계층 동시성 큐 (3/10/5)
- `server/src/utils/limiter.ts` - p-limit 대신 커스텀 Limiter 클래스 (CJS 호환)

## 클라이언트 핵심 패턴
- Zustand stores: connection(persist), generation, queue, ui
- TanStack Query v5로 서버 상태 관리
- ECharts: WorklogHeatmap, WorkloadBar, PlannedVsActual, IssueStatusPie, RiskIndicatorGauge, BurndownLine
- 모든 API 요청: services/*.service.ts → api.client.ts → Axios

## 기술 결정
- p-limit 대신 커스텀 Limiter 클래스 사용 (CJS 호환성)
- uuid@^9 (CJS), faker-js@^9, express@^4.21 사용
- Atlaskit 패키지 일부 포함하되 CSS 없이 커스텀 스타일링

## 빌드 상태 (2026-05-24)
- Server: tsc --noEmit 오류 없음
- Client: tsc --noEmit 오류 없음, vite build 성공 (764 모듈)
- 의존성 설치 완료
