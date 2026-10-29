---
name: zabbix-data-archiving-backlog
description: "자빅스 메트릭 데이터 아카이빙(감사용 일 단위 파일 보관) — 설계 초안만 있고 구현 0, 09-16 백로그 I7로 등록"
metadata: 
  node_type: memory
  type: project
  originSessionId: 466d8c85-3e19-4f33-ba04-6092970fcac6
  modified: 2026-09-16T08:15:10.036Z
---

자빅스 메트릭 아카이빙은 **설계 초안만 있고 구현 0**이다(2026-08-31~09-02 설계, 2026-09-16 백로그 등록).
정본 설계 `_workspace/features/platform/data-archiving/devdesign_data-archiving.md`, 백로그 `_workspace/planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md` I7.

확정: 감사용 원본 보관(차트 기간 확장 아님) · DB 아닌 파일(하루 ZIP 1개, CSV.gz) · 원시+시간집계 · Spring Batch 미도입(기존 SchedulerJob) · 목록에 파일 경로·실물 존재 여부 · 다운로드·선택 삭제.
09-16 결정: 파일 보관 기간은 화면에서 설정(기본 5년) · 텍스트 데이터는 기본 포함 + 화면 스위치로 끔(끌 때 확인, manifest에 설정값 기록). 사용자 결정은 전부 끝났고, 남은 미결 3건(포트 구조·서명·외부 스토리지)은 기본안이 있다.

**Why:** 설계만 쓰고 "나중에 할 목록"에 안 넣어서 사용자가 09-16에 등록 여부를 물었다 — 설계서만 있으면 잊힌다.
**How to apply:** 착수 시 🔴 V41 번호는 낡았으니 재배정 · 병렬 호출 금지(자빅스 PHP 워커 점유) · 삭제해도 행은 남김(사유 필수) · 실패율 20% 넘으면 빈 ZIP 만들지 않음. APM 콜드 아카이브(I6, [[apm-comprehension-backlog]])와 파일 기록기·목록 화면을 공유하도록 먼저 착수하는 쪽이 공용으로 만든다.
