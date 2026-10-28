# MovesEye APM Confluence 통합 가이드

- 날짜: 2026-09-15
- 산출물: C:/solutions/_workspace/guides/apm-confluence-complete-2026-09-15.md 및 .html
- 문서·Controller·FE API·DTO·Collector 템플릿을 대조했다. 구현 레포는 변경하지 않았다.
- 구문서의 endpoints/{routeHash}/series와 /home/widgets/apm-*를 현재 endpoints/series 및 /apm/widgets/*로 정리했다.
- 로그 수신 후 폐기, RUM 페이지별 TTFB·p75 시계열 미제공, BE 전용 비교·대시보드 API를 구분했다.
- 교훈: 트레이스 표본 수·메트릭 요청 수·RUM PV·세션의 의미를 구분하고 문서 경로와 최신 코드를 함께 대조한다.
- 검증: 독자 검토, JSON 5개 파싱, HTML 표 23개·코드 블록 18개·장 12개 구조 확인. 고객 환경 재실행과 실제 Confluence 붙여넣기는 수행하지 않았다.

## handbook 기반 v1.1 보강

- apm-handbook의 00-index부터 17-sources까지 18개 문서를 반영하고 원문별 본문 연결표를 추가했다.
- 설계 배경, 언어별 설치, 등록 정책, AI 도구, 수집 필드와 화면 연결, 용량 기준, RUM·K8s 운영을 보강했다.
- SLO는 확인 창 내부 AND, 빠른·느린 소진 조건 사이 OR다. Gauge의 집계와 누적 Counter 차분을 구분했다.
- 누적 첫 관측의 120초 기준과 초기화 처리를 코드로 확인했다. 지연 스팬의 원본 저장과 유한한 파생 재집계 범위는 별개다.
- 용량 예시의 추가 차원을 명시하고 메트릭 인덱스 비용의 중복 합산을 방지했다.
- 최종 검증: 표 46개, JSON 예제 5개, 코드 블록 23개, 장 12개, handbook 출처 18개 연결 확인. 실제 Confluence 붙여넣기와 고객 환경 재실행은 수행하지 않았다.
