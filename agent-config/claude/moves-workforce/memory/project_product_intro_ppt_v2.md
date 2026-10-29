---
name: product-intro-ppt-v2
description: 제품 소개 PPT v2(44장) 빌드 구조·캡처 자동 교체·PowerPoint 거부 원인(LINE 음수 크기)·AI 티 제거 방향 — 2026-09-14
metadata: 
  node_type: memory
  type: project
  originSessionId: d7ad1f1a-365b-4bb6-a4a4-bd29b93a2c89
  modified: 2026-09-14T05:32:56.698Z
---

제품 소개 PPT는 `_workspace/product-intro-ppt/build.js`(pptxgenjs)로 생성한다 → `Moves_Workforce_Dmove_제품소개_v2.pptx`(루트). 옛 12장 파일은 보존. `captures/<key>.png`를 넣고 `npm run build`하면 placeholder가 실캡처로 자동 교체된다(목록 `CAPTURE_LIST.md`, 실캡처 3장 확보: progress·gantt·portfolio).

**Why:** 사용자가 기존 PPT를 "설득력·상세도·디자인 부족, 실 이미지 적극 활용, AI 티 빼기"로 재작성 요구(2026-09-14).

**How to apply:**
- pptxgenjs `LINE`에 음수 w/h를 주면 XSD·python-pptx는 통과하지만 **PowerPoint가 파일을 거부**한다 → 절대값+`flipH/flipV`. 렌더 QA는 PowerShell COM(`Slide.Export` PNG)으로.
- 사용자가 싫어하는 "AI 티": 원형 아이콘 카드 격자·헤더 칩·동일 카드 반복. 타이포 중심(번호·괘선 표·틸 대시 포인트)과 실캡처 위 번호 마커를 쓸 것.
- 경쟁사 실명 금지, 근사/추정/스냅샷 단서 유지, 연락처·링크는 "(기입)". 관련: [[project-competitive-analysis]], [[dmove-brand-palette]].
