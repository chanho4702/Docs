---
type: feature-map
tags: [moveseye, feature-map, cloud, aws, snapshot]
updated: 2026-10-19
---

# 클라우드(AWS) — 게이팅·자격증명·과금 0 기본선·EC2·VPC·스냅샷·플릿 지표·비용 엔진

> 기능 지도 [[무브스아이-기능-지도]] · 허브 [[moveseye]] · 링크는 `C:\solutions` 로컬 파일(file://)이라 이 PC에서만 열린다. 읽기용 사본은 [[2026-10-07-docs-reading-repo]].

**한 줄** — 기능 게이팅·자격증명(DB→.env→IAM)·수집 범위·유료 스위치, 클라우드 개요, EC2 목록·상세·타임라인, 모니터링 소스 매트릭스, CloudWatch 예산 가드, VPC·노출 진단, 스냅샷 배치(구간 적재·리전 범위·구성 주기 분리), 비용 엔진.

**상태** — 현행. 재구축(08-24~26)·플릿 지표(08-26, 미푸시)·ZM-151·153 스냅샷 적재량·주기(09-21, 푸시 완료). 원칙: 과금 0 기본, 유료 API는 옵트인.

## 정본 문서 (moveseye-docs)
- [클라우드 AWS(상세 가이드)](file:///C:/solutions/moveseye-docs/guides/features/클라우드-AWS.md)
- [EC2 대시보드](file:///C:/solutions/moveseye-docs/guides/pages/모니터링/클라우드-EC2-대시보드.md)
- [EC2 목록](file:///C:/solutions/moveseye-docs/guides/pages/모니터링/클라우드-EC2-목록.md)
- [VPC 그룹 목록](file:///C:/solutions/moveseye-docs/guides/pages/모니터링/클라우드-VPC-그룹-목록.md)
- [클라우드 스냅샷 적재량 정리(기능 문서, ZM-151)](file:///C:/solutions/moveseye-docs/features/클라우드-스냅샷-적재량-정리.md)
- [클라우드 스냅샷 수집 주기 분리(기능 문서, ZM-153)](file:///C:/solutions/moveseye-docs/features/클라우드-스냅샷-수집-주기-분리.md)

## 설계·기획 (_workspace)
- [devdesign_cloud-monitoring-rebuild](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/devdesign_cloud-monitoring-rebuild.md)
- [devdesign_ec2-monitoring-sources](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/devdesign_ec2-monitoring-sources.md)
- [devdesign_aws-status-timeline](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/devdesign_aws-status-timeline.md)
- [devdesign_cloud-cost-optin](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/devdesign_cloud-cost-optin.md)
- [devdesign_cloud-fleet-extras](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/devdesign_cloud-fleet-extras.md)
- [devdesign_cloud-infra-permission](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/devdesign_cloud-infra-permission.md)
- [backlog_cloud-snapshot-region-scope](file:///C:/solutions/_workspace/features/cloud/snapshot/backlog_cloud-snapshot-region-scope.md)

## 계약 (_workspace/contract_*)
- [contract_aws-free-monitoring](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/contract_aws-free-monitoring.md)
- [contract_aws-status-timeline](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/contract_aws-status-timeline.md)
- [contract_aws-zero-cost](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/contract_aws-zero-cost.md)
- [contract_cloud-gating](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/contract_cloud-gating.md)
- [contract_cloud-infra-permission](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/contract_cloud-infra-permission.md)
- [contract_cloud-monitoring-overview](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/contract_cloud-monitoring-overview.md)
- [contract_asset-cloud](file:///C:/solutions/_workspace/features/assets/asset-cloud/contract_asset-cloud.md)

## 보고·검수·QA 증거
- [zm-151_cloud-snapshot-storage](file:///C:/solutions/_workspace/features/cloud/snapshot/zm-151_cloud-snapshot-storage.md)
- [zm-153_cloud-snapshot-config-cadence](file:///C:/solutions/_workspace/features/cloud/snapshot/zm-153_cloud-snapshot-config-cadence.md)
- [zm-151-154_runtime-check](file:///C:/solutions/_workspace/planning/sprint-zm-151-156/zm-151-154_runtime-check.md)
- [review_aws-status-timeline](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/review_aws-status-timeline.md)
- [review_cloud-cost-optin](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/review_cloud-cost-optin.md)
- [review_cloud-fleet-extras](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/review_cloud-fleet-extras.md)
- [review_cloud-fleet-metrics-p3](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/review_cloud-fleet-metrics-p3.md)
- [review_cloud-gating](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/review_cloud-gating.md)
- [review_ec2-monitoring-sources](file:///C:/solutions/_workspace/features/cloud/aws-monitoring/review_ec2-monitoring-sources.md)

## 경험 노트 (Vault)
[[2026-08-26-ec2-monitoring-sources-and-cloud-cost]] · [[2026-08-26-cloud-fleet-extras]] · [[2026-08-24-cloud-infra-permission]] · [[2026-08-26-asset-cloud-integration]] · [[2026-09-22-zm151-156-backlog-sprint]] · [[2026-09-16-apm-observability-backlogs]]

## 열린 항목
- 플릿 지표 커밋 7건 미푸시·브라우저 렌더 미확인
- 인스턴스 스냅샷은 회차마다 대수만큼 누적(비용 근거라 의도) — CLD-02
- 유료 API P2·P3 미착수

## 이웃 영역
[[자산과-비용]] · [[설정과-운영-기반]]
