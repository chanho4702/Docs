# _workspace 문서 허브

> 최근 작업·APM·OpenTelemetry를 처음 읽는 분은 [통합 읽기 안내](../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B0%9C%EC%9A%94/MovesEye-%EC%B5%9C%EA%B7%BC-%EC%9E%91%EC%97%85%EA%B3%BC-APM-%EC%9D%BD%EA%B8%B0-%EC%95%88%EB%82%B4.md)부터 시작하세요. 현재 코드와 대조한 [APM 부족점 리포트](../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B0%9C%EC%9A%94/%ED%98%84%EC%9E%AC-APM-%EA%B5%AC%ED%98%84%EC%9D%98-%EB%B6%80%EC%A1%B1%EC%A0%90-%EB%B6%84%EC%84%9D-%EB%A6%AC%ED%8F%AC%ED%8A%B8.md)도 함께 정리했습니다(2026-10-05). 이 폴더의 설계·검수 기록은 상세 근거로 활용합니다.

기능 작업의 설계·계약·검증·검토 기록을 보관한다. 문서는 삭제하지 않고 누적 보존하며, 코드나 다른 문서에서 참조하는 경로는 이동 시 함께 갱신한다.

## 작업군 문서 지도 (먼저 볼 것)

여러 이슈·문서가 얽힌 작업군은 루트에 `INDEX_{작업군}.md`를 두고, 그 한 장에서 정본(`moveseye-docs`)·증거(`_workspace`)·경험(옵시디언)과 읽는 순서를 연결한다. 새 문서가 생기면 해당 INDEX에 한 줄 추가한다.

| 작업군 | 지도 |
|---|---|
| 자빅스 성능(`ZM-123`·`ZM-93`·`ZM-136`) | [`INDEX_zabbix-performance.md`](%EC%9E%90%EB%B9%85%EC%8A%A4-%EC%84%B1%EB%8A%A5-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-123-ZM-93-ZM-136%29.md) |
| 사용자 권한(`ZM-157`) | [`INDEX_zm-157-permission.md`](%EA%B6%8C%ED%95%9C-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-157%29.md) |

## 구조

| 경로 | 내용 |
|---|---|
| 루트 `INDEX_*.md` | 작업군 문서 지도(위 표) |
| 루트 `contract_*.md` | BE↔FE API 계약 정본. 협업 규약의 고정 경로이므로 루트에 유지한다. |
| `designs/` | 설계, 개발 설계, 갭 분석, 디자인 검토 |
| `verification/` | `qa_`, `e2e_`, scan 검증 결과 |
| `reviews/` | 구현·설계 검토 기록 |
| `planning/` | 계획, 작업 기록, 적용 제안, WIP |
| `implementation/` | BE/FE 구현·리팩터링 메모 |
| `analysis/` | 감사, 진단, 리포트, 조사, 참고 자료 |
| `guides/` | 제품·운영 가이드와 포트폴리오 정리. APM은 `guides/apm-handbook/00-index.md`(종합 안내서 — 단위별 17분책, 목차·읽는 순서 3코스·분책 지도. 개념·조건·전체상·데이터의 길·단계별·운영·검증)부터. 구 `guides/apm-handbook.md`는 안내 스텁만 |
| `archive/` | 현재 작업과 무관하지만 보존해야 하는 문서 |
| `_archive/` | 스크립트, 로그, 응답 샘플, 스크린샷 등 비문서 산출물 |

## 새 문서 작성

- API 계약은 계속 `_workspace/contract_{feature}.md`에 작성한다.
- 정적·런타임 검증은 각각 `verification/qa_{feature}.md`, `verification/e2e_{feature}.md`에 작성한다.
- 검토 문서는 `reviews/review_{feature}.md`, 설계는 `designs/devdesign_{feature}.md` 또는 `designs/design_{feature}.md`를 사용한다.
- 동일 기능의 문서는 동일한 `{feature}` 이름을 쓴다. 예: `designs/devdesign_asset-cost.md`와 `contract_asset-cost.md`.
- Markdown 상대 링크는 대상의 현재 위치를 기준으로 작성한다. 문서를 이동할 때는 코드 주석을 포함한 `_workspace/...` 참조와 상대 링크를 함께 갱신한다.

## 비문서 산출물

일회성 검증 스크립트·로그·응답 샘플·토큰·쿠키는 작업 중 scratchpad에 두고, 보존 가치가 있을 때만 `_archive/scripts`, `_archive/logs`, `_archive/data`, `_archive/screenshots`로 옮긴다. credential이나 token은 문서에 기록하지 않는다.
