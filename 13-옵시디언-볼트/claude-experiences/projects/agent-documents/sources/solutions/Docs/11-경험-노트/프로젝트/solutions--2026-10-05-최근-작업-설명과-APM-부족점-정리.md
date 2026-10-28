---
tags: [moveseye, documentation, apm, review]
updated: 2026-10-05
---

# 최근 작업 설명과 APM 부족점 정리

사용자가 문서 과다·가독성 저하와 설계/구현 구분의 어려움을 호소해 코드·커밋·문서 기준의 설명 묶음을 작성했다. 정본 입구는 `C:/solutions/moveseye-docs/overview/start-here.md`, 부족점 리포트는 같은 폴더 `apm-gap-report.md`다. 전문은 Vault에 복제하지 않는다.

- BE `3637c77`, FE `9dfcbe8`, V69 소스 기준. 서비스·DB·부하 시험 미실시. 코드 변경 없음.
- 과거 백로그의 미착수를 그대로 현재 상태로 취급하면 오판한다. 콜드 아카이브는 10월 2일 소스 구현, 복원·장기 상세는 별도 보류다.
- 메트릭 영수증과 저장 분리, 걸림 알람 두 생성 경로, 고정 SSE writer 용량, RUM fetch 응답/재시도 공백을 현재 코드로 다시 확인했다. 실제 운영 사고 발생으로 단정하지 않았다.
- 읽기 순서는 최근 작업 → APM → OTel → 설계/구현 지도 → 부족점. 기존 허브와 APM 분책에 새 입구를 연결하고 원문은 보존했다.
- 독립 독자 6문항 검증 후 RUM 상태 표기·진행 중 경로·용어·실측 과장 4건 보완. 신규 6문서의 로컬 링크 116개 검증.

교훈: 문서 개수를 줄이는 것만큼 중요한 것은 현재 상태와 독자별 읽기 깊이를 분리하는 일이다. 구현·시험·배포를 한 단어 ‘완료’로 묶지 않는다.

관련: [[projects/moveseye/moveseye|moveseye]] · [[projects/moveseye/moveseye-documentation-system|moveseye-documentation-system]] · [[topics/backend/otel-collector-pitfalls|otel-collector-pitfalls]]
