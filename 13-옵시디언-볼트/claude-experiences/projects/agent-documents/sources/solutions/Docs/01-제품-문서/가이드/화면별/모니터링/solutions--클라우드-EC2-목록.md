---
title: EC2 목록
doc_type: page-guide
menu_path: 모니터링 > 클라우드 인프라 모니터링 > AWS 리소스 모니터링 > EC2 목록
route: /cloud-infra-monitoring/.../ec2-list
audience: [사용자, 클라우드 담당자]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: pages/cloud-infra-monitoring/aws-resources/EC2InstanceList.tsx, EC2InstanceDetail.tsx
reviewed_at: 2026-08-11
---

# EC2 목록

> **사이드바** 모니터링 > 클라우드 인프라 모니터링 > AWS 리소스 모니터링 > EC2 목록

## 무엇을 하는 화면인가

개별 EC2 인스턴스를 찾고, 인스턴스별 CloudWatch 지표를 확인하는 화면이다.

## 화면 구성

### 목록

- **리전 필터**
- **VPC 필터링** — 특정 VPC 소속만 좁힌다
- **검색** — 이름, ID, 가용영역(AZ)
- 목록: 인스턴스 이름·ID·유형·상태·AZ 등

### 상세

인스턴스 하나의 지표 차트를 본다.

| 지표 | 내용 |
|---|---|
| CPU 사용률 | |
| 메모리 사용률 | CloudWatch 에이전트가 있어야 수집됨 |
| 네트워크 in / out | 전송량 |
| 네트워크 패킷 in / out | 패킷 수 |
| Disk read / write | 디스크 I/O |

## 사용 흐름

1. 리전을 선택한다.
2. VPC 필터나 검색으로 대상을 좁힌다.
3. 인스턴스를 선택해 지표를 확인한다.

## 주의할 점

- 🕐 **조회에 15~30초가 걸릴 수 있다.** AWS API 실시간 호출이며 화면에 안내가 나온다.
- **메모리 사용률이 비어 있는 것은 흔한 정상 상황이다.** AWS는 기본적으로 메모리를 수집하지 않는다. CloudWatch 에이전트를 설치한 인스턴스에서만 값이 나온다. 여기서 빈 값을 장애로 오인하지 않는다.
- 중지된 인스턴스는 지표가 없다.
- 이 화면은 **조회 전용**이다. 인스턴스를 시작·중지·종료하지 않는다.

## 관련 문서

- [EC2 대시보드](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md)
- [VPC 그룹 목록](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-VPC-%EA%B7%B8%EB%A3%B9-%EB%AA%A9%EB%A1%9D.md)
