---
title: EC2 대시보드
doc_type: page-guide
menu_path: 모니터링 > 클라우드 인프라 모니터링 > AWS 리소스 모니터링 > EC2 대시보드
route: /cloud-infra-monitoring/.../ec2-dashboard
audience: [사용자, 클라우드 담당자]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: pages/cloud-infra-monitoring/aws-resources/EC2Dashboard.tsx
reviewed_at: 2026-08-11
---

# EC2 대시보드

> **사이드바** 모니터링 > 클라우드 인프라 모니터링 > AWS 리소스 모니터링 > EC2 대시보드

## 무엇을 하는 화면인가

EC2 인스턴스 현황을 **집계 관점**에서 보는 화면이다. 개별 인스턴스를 찾는 것이 아니라 전체 규모와 분포를 파악한다.

## 화면 구성

| 위젯 | 내용 |
|---|---|
| **총 인스턴스 수** | 선택 리전 기준 전체 대수 |
| **인스턴스 유형** | 유형별 분포 (t3.medium 등) |
| **인스턴스 상태 비율** | running·stopped 등 상태별 비율 |
| **리전별 배포 상태** | 리전에 걸친 분포 |
| **상태 확인** | 헬스 체크 결과 |

상단의 **리전 필터**로 범위를 조정하며, "전체"를 선택하면 모든 리전을 합산한다.

## 사용 흐름

1. 리전을 선택하거나 전체로 둔다.
2. 총 대수와 상태 비율로 규모를 파악한다.
3. 유형 분포에서 **비용에 영향이 큰 대형 인스턴스** 비중을 확인한다.
4. 개별 인스턴스를 봐야 하면 [EC2 목록](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%AA%A9%EB%A1%9D.md)으로 이동한다.

## 주의할 점

- **stopped 인스턴스도 집계에 포함된다.** "총 인스턴스 수"를 가동 중인 대수로 읽지 않는다. 상태 비율을 함께 본다.
- 전체 리전 조회는 리전마다 API를 호출하므로 느리다.
- 수치는 조회 시점 기준이며 자동 갱신되지 않는다.
- 비용은 이 화면에서 다루지 않는다. 자산 비용은 [비용](../%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EB%B9%84%EC%9A%A9.md) 화면이다.

## 관련 문서

- [EC2 목록](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%AA%A9%EB%A1%9D.md)
- [VPC 그룹 목록](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-VPC-%EA%B7%B8%EB%A3%B9-%EB%AA%A9%EB%A1%9D.md)
