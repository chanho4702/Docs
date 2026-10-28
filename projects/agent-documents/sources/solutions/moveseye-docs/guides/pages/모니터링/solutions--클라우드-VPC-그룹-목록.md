---
title: VPC 그룹 목록
doc_type: page-guide
menu_path: 모니터링 > 클라우드 인프라 모니터링 > AWS 리소스 모니터링 > VPC 그룹 목록
route: /cloud-infra-monitoring/.../vpc-group-list
audience: [사용자, 클라우드 담당자]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: pages/cloud-infra-monitoring/aws-resources/VPCGroupList.tsx
reviewed_at: 2026-08-11
---

# VPC 그룹 목록

> **사이드바** 모니터링 > 클라우드 인프라 모니터링 > AWS 리소스 모니터링 > VPC 그룹 목록

## 무엇을 하는 화면인가

AWS의 VPC(가상 네트워크)를 목록으로 확인하는 화면이다. 온프레미스 장비와 클라우드 자원을 같은 제품 안에서 보기 위한 진입점이다.

## 화면 구성

- **리전 필터** — 조회할 AWS 리전을 고른다
- **검색** — 이름, ID, 리전, IPv4 CIDR로 찾는다
- 목록: VPC 이름·ID·리전·CIDR 등

## 사용 흐름

1. 리전을 선택한다.
2. 목록에서 대상 VPC를 찾는다.
3. 해당 VPC의 인스턴스를 보려면 [EC2 목록](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%AA%A9%EB%A1%9D.md)에서 VPC 필터를 쓴다.

## 주의할 점

- 🕐 **조회에 15~30초가 걸릴 수 있다.** AWS API를 실시간으로 호출하기 때문이며, 화면에도 안내가 표시된다. 응답이 늦다고 새로고침을 반복하면 오히려 느려진다.
- 목록이 비었다면 다음을 확인한다.
  - AWS 자격증명이 설정돼 있는가
  - 선택한 리전에 실제 VPC가 있는가
  - 자격증명에 조회 권한이 있는가
- 이 화면은 **조회 전용**이다. AWS 자원을 생성·변경하지 않는다.

## 관련 문서

- [EC2 대시보드](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md)
- [EC2 목록](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%AA%A9%EB%A1%9D.md)
- [설치·배포 가이드 — AWS 자격증명](../../../operations/solutions--%EC%84%A4%EC%B9%98-%EB%B0%B0%ED%8F%AC-%EA%B0%80%EC%9D%B4%EB%93%9C.md)
