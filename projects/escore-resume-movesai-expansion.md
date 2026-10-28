---
title: 에스코어 이력서 무브스아이 경력 상세 보강
date: 2026-08-08
tags:
  - resume
  - moveseye
  - moves-workforce
  - word
---

# 에스코어 이력서 무브스아이 경력 상세 보강

## 목적

기존 에스코어 지원용 이력서에서 디무브 경력이 지나치게 축약되어 있던 문제를 해결했다. `MovesEye`와 `Moves Workforce`를 별도 제품으로 나누고, 실제 수행 업무를 기능·아키텍처·보안·배포·운영·품질 기준으로 최대한 구체화했다.

연관 기록: [[escore-resume-customization]], [[moveseye-documentation-system]], [[moves-workforce-documentation-baseline-sync]]

## 결과

- 원본은 보존하고 `[시너지파트너즈] - 김찬호 후보자 이력서_에스코어_무브스아이_상세보강본.docx`를 별도 생성했다.
- 디무브 경력을 공통 담당업무 5개, MovesEye 17개, Moves Workforce 17개, Elastic Stack 3개, 개발 품질·운영 방식 3개 항목으로 확장했다.
- 핵심역량과 기술 스택 표에도 Java 17, Spring Boot 3.3, Zabbix 7 JSON-RPC, PostgreSQL, Redis, Flyway, Vault, Atlassian Forge, React/TypeScript를 반영했다.
- Microsoft Word에서 PDF로 렌더링한 뒤 8쪽 전체를 이미지로 검수했다. 잘림·겹침·글리프 손상 없이 표, 사진, 링크, 독립 페이지 구성이 유지됐다.
- 최종 문서는 124개 문단, 실제 목록 문단 73개, 표 7개, 사진 1개이며 ZIP 무결성·원본 media hash·placeholder 부재를 확인했다.

## 포함한 근거와 수치

- MovesEye: NestJS→Spring Boot 3.3/Java 17 전환, Zabbix 7 JSON-RPC adapter, Gradle multi-module port 격리, 570개 테스트와 19개 runtime 응답 그룹 동등성, N+1 제거로 6.4초→269ms, 자산 75건 동기화, Network Map stencil 45종·FE 테스트 291개, Geo Map 결함 12건 보완, host/item/template/trigger API, OTP·JWT·cookie 보안, Vault·scheduler·비용 dashboard, 라이선스 초기 kernel, 온프레미스 장애 진단과 문서 체계.
- Moves Workforce: Forge resolver registrar 32개, Forge SQL table 13개, Custom Entity 12종, Jira N+1 cache, Man-Month 재설계, Progress/Portfolio/Gantt/WBS/Team analytics, 109개 resolver 권한 매핑과 14개 resource key, Async Events·Queue 대량 처리, 저장공간 모니터링, bundle 1.73MB→271KB, 백엔드 테스트 1,066개와 production build 통과, 제품·운영·사용자 문서화.

## 과장 방지 원칙

- 구현 완료, 배포 대기, 설계 전용을 같은 완료형으로 쓰지 않는다.
- 라이선스는 `초기 license kernel 구현`, 온프레미스 배포는 `장애 진단·복구 절차 정리`처럼 검증된 범위만 표현한다.
- OpenSearch/RAG는 보유 경험으로 포장하지 않고 학습·확장 준비 상태를 유지한다.

## 재사용 교훈

한 회사 안에서 여러 제품을 병행했다면 회사 단위의 짧은 요약만으로는 역할의 폭이 사라진다. 제품별로 `문제→설계/구현→검증 수치→운영 결과`를 분리하고, 상태가 다른 작업은 완료·대기·설계로 명시하면 상세성과 신뢰도를 함께 확보할 수 있다.
