# MovesEye와 OpenTelemetry 기술 블로그 원고

`index.html`을 브라우저에서 열면 두 글과 이미지 네 장을 확인할 수 있습니다. 인터넷 연결 없이 읽을 수 있습니다.

## 복사하고 게시하는 방법

1. 원하는 글의 HTML을 열고 **본문 복사** 또는 **Markdown 복사**를 누릅니다.
2. 블로그 편집기에 붙여 넣습니다. 본문 복사의 서식 지원은 편집기에 따라 다릅니다.
3. 본문에 표시된 위치에 `images/`의 PNG를 업로드합니다. 로컬 이미지 링크는 외부 블로그에서 자동으로 공개되지 않습니다.
4. 마지막의 다른 글 링크를 실제 게시 주소로 바꾸거나, 단독 게시라면 해당 문장을 제거합니다.

## 원고

| 구분 | 원고 | 읽기·복사용 HTML |
|---|---|---|
| 개념 편 | [01-opentelemetry.md](solutions--01-opentelemetry.md) | [01-opentelemetry.html](01-opentelemetry.html) |
| 구축 편 | [02-moveseye-apm.md](solutions--02-moveseye-apm.md) | [02-moveseye-apm.html](02-moveseye-apm.html) |

## 이미지

| 파일명 | 삽입 위치 | 내용 |
|---|---|---|
| `01-otel-pipeline` | 개념 편 첫 구성 설명 | Agent·SDK → Collector → 백엔드 |
| `02-trace-waterfall` | 개념 편 Trace 설명 | 가상의 주문 요청과 Span 시간 관계 |
| `03-moveseye-paths` | 구축 편 아키텍처 설명 | 메트릭·보존 Trace·라이브 Span·진행 중 요청 |
| `04-active-requests` | 구축 편 Java 확장 설명 | 요청 종료 후 전송과 처리 중 집계의 차이 |

각 그림은 `images/`에 PNG와 SVG로 들어 있습니다. PNG의 가로 해상도는 2,880px이며 흰 배경입니다. SVG는 확대해도 선명한 벡터 형식입니다.

`opentelemetry-moveseye-diagrams.drawio`는 네 페이지 통합 원본입니다. draw.io 또는 diagrams.net의 파일 열기/가져오기에서 열 수 있습니다. `drawio/`에는 개별 원본도 있습니다. 도형·연결선·문구를 편집할 수 있으며 그림 하나를 비트맵으로 붙인 파일이 아닙니다.

그림은 이번 원고를 위해 직접 제작했습니다. 외부 이미지나 로고는 사용하지 않았습니다. 주문 요청의 숫자는 가상 예시이며 실제 제품 화면이나 성능 측정 결과가 아닙니다.

## 편집·재생성

원고를 수정한 뒤 `python build_assets.py`를 실행하면 HTML과 SVG·draw.io를 다시 만듭니다. PNG 재생성과 검증은 `python render_and_verify.py`를 사용합니다. 후자는 Python의 Playwright·Pillow와 Chromium이 필요합니다.

`EDITOR-NOTES.md`는 게시 본문에 포함하지 않는 근거·범위 메모입니다. `qa/`는 검증 결과와 미리보기입니다.
