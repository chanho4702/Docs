---
type: project
tags: [project, forge, jira, rms, ppt, pptx-skill, pptxgenjs, presentation, design]
created: 2026-09-14
updated: 2026-09-14
status: active
---

# 제품 소개 PPT v2 실제 생성 (44장, pptxgenjs, 캡처 자동 교체)

[[2026-09-11-ppt-prompt-pptx-skill]]의 프롬프트를 실제로 실행해 만든 것이 아니라, 사용자가 기존 12장 PPT(9/9)를 보고 "강화·디자인 개선·실 이미지 적극 활용·AI 티 빼기"를 요구해 **전면 재구성**한 버전.

- 산출물: `Moves_Workforce_Dmove_제품소개_v2.pptx`(리포 루트, 원본은 그대로 둠) · 빌드 `_workspace/product-intro-ppt/build.js` (+ `package.json`, `PLAN.md`, `CAPTURE_LIST.md`, `captures/`, `assets/`)
- 구성: 표지·목차 → 01 왜 필요한가(4) → 02 무엇인가(4) → 03 핵심 기능(15) → 04 숫자의 신뢰(2) → 05 왜 우리인가(4) → 06 도입(4) → 마무리 → 부록 3. 발표자 노트 전 장.
- **캡처 자동 교체 구조**: `captures/<key>.png`가 있으면 브라우저 프레임에 삽입(프레임이 이미지 비율에 맞춰 줄어듦), 없으면 점선 placeholder에 파일명·화면 경로·강조 영역·권장 비율을 적음. 사용자는 파일만 넣고 `npm run build`. 확보된 실캡처 3장(진척률·간트·통합 대시보드)은 옛 PPT에서 추출.

## 삽질·교훈

1. **PowerPoint가 "파일을 열 수 없습니다"로 거부 — XSD 검증·python-pptx·markitdown은 전부 통과.** 원인은 pptxgenjs `LINE` 도형에 **음수 w/h**(위로 향하는 화살표 `h: y2-y1 < 0`)가 `<a:ext cy="-…">`로 그대로 기록된 것. 해결: 절대값 + `flipH/flipV`. 진단은 `MAX_SLIDES` 환경변수로 슬라이드 수를 제한해 이분 탐색(1·2 OK → 7 FAIL → 5 FAIL). **스키마 검증 통과 ≠ PowerPoint 열림.** 렌더 QA는 반드시 PowerPoint(COM)로.
2. 렌더링 파이프라인(LibreOffice 없음): PowerShell COM `Presentations.Open` + `Slide.Export(png, 1600, 900)`. 한글 파일명도 문제없음.
3. **"AI 티" 지적**(사용자): 원형 아이콘 카드 격자·헤더 칩·똑같은 3~6 카드 반복이 원인. 고친 것 — 헤더 칩→작은 텍스트 라벨, 아이콘 리스트→틸 대시+제목(`points()` 헬퍼), 역할표→괘선 표, 원칙/차별점→큰 번호 리스트, 스텝 카드 아이콘→큰 번호, **실캡처 위 번호 마커**(`markers()`, 이미지 내부 비율 좌표)로 "사람이 주석 단" 느낌. 아이콘은 도식(입력→앱→출력, 흩어진 자료)에만 남김.
4. placeholder 텍스트는 박스가 작으면(폭<3.4in 또는 높이<2.3in) 제목이 두 줄로 깨져 겹친다 → small 모드(제목/파일명 분리, 상세 생략).
5. 폰트는 Noto Sans KR(설치 확인). 배포 시 PDF 내보내기 권장(수신자 PC에 폰트 없으면 대체됨).
6. 경쟁 비교는 실명 없이 **유형**(타임시트·원가 앱 / 간트·PPM / 외부 서버형 / 국내 구축형 PMS)으로만, 근거는 [[2026-08-31-competitive-analysis-v2]] v3.
