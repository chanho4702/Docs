---
type: experience
tags: [moveseye, apm, opentelemetry, documentation, blog, drawio]
created: 2026-10-22
updated: 2026-10-22
---

# APM 구축 편과 OTel 개념 편의 블로그 원고

사용자가 복사 가능한 기술 블로그 두 편과 이미지를 요청했다. 산출물 정본은 `C:/solutions/_workspace/blog/apm-otel-20261022/`이며 원고를 Vault에 중복 저장하지 않는다.

## 결정과 교훈

- 개념 편은 가상 주문 요청, 구축 편은 실제 Collector 템플릿·Java 확장·LiveSpanRing 구현과 과거 개발 기록으로 구분했다. 배포 완료나 성능 개선 효과를 코드 존재만으로 주장하지 않는다.
- 라이브 경로에 Tail sampling이 없다는 것과 화면에 모든 요청이 점으로 표시된다는 것은 다르다. 현재 LiveSpanRing은 수용 데이터를 집계한 뒤 표시 표본을 유지한다. 서비스별 HTTP 서버 Span 수와 최종 사용자 요청 수도 다르다.
- 독립 독자 검토의 8개 질문으로 Agent/SDK 관계, TTL, 진행 중 요청 관측 시점, HTTP 재시도 의미를 보강했다. 구현자가 익숙한 TTL·SPI·RPC도 공개 글에는 짧게 풀어야 한다.
- 외부 이미지를 가져오는 대신 동일한 도형·문구 데이터에서 SVG와 편집 가능한 mxGraph XML(draw.io)을 생성했다. PNG는 Chromium으로 렌더링하고 글자 실측 폭을 텍스트 상자 폭과 비교했다.
- 복사 가능한 HTML과 Markdown을 함께 제공하되, 로컬 이미지와 다른 글 링크는 게시 시 업로드·주소 치환이 필요하다고 안내했다. 공개 본문에는 내부 경로를 넣지 않고 별도 편집자 메모에 근거를 남겼다.

관련: [[2026-10-05-documentation-apm-overview]] · [[otel-collector-pitfalls]] · [[moveseye]]
