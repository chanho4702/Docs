---
title: 기능명
doc_type: feature
audience: [기획, 개발, QA, 운영]
status: draft
owner: 담당자
baseline: YYYY-MM-DD
source_of_truth: 코드·OpenAPI·contract 경로
reviewed_at: YYYY-MM-DD
review_cycle: event-driven
---

# 기능명

## 1. 사용자 목표와 범위

- 해결하는 문제:
- 주 사용자:
- 포함:
- 제외:

## 2. 현재 상태

`현재 | 부분 | 계획 | 보류` 중 하나와 근거를 쓴다.

## 3. 데이터 원천과 소유권

| 데이터 | 원천 | 읽기 | 쓰기 | cache/동기화 |
|---|---|---|---|---|

## 4. 사용자 흐름

정상 흐름, 권한 없음, 빈 데이터, 외부 시스템 오류 흐름을 구분한다.

## 5. API 계약

| Method | Path | 요청 | 응답 | 권한 |
|---|---|---|---|---|

상세 DTO는 OpenAPI/코드에 연결하고 여기에는 불변식과 특이 계약만 쓴다.

## 6. 상태·동시성·실패

- 상태 전이:
- idempotency:
- 동시 실행:
- retry/timeout:
- partial failure:

## 7. 권한과 보안

- 기능 permission:
- 데이터 범위:
- 감사 로그:
- secret/개인정보:

## 8. 운영

- 설정·환경변수:
- metric/log:
- 장애 증상과 복구:
- migration/rollback:

## 9. 검증 근거

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위 | | |
| 계약 | | |
| runtime | | |

## 10. 결정과 열린 항목

- 결정:
- 기각 대안:
- 열린 항목:
- Obsidian 관련 노트:

## 변경 이력

| 날짜 | 변경 |
|---|---|
