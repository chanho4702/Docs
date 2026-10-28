# K8s 테스트 입력

cluster-restarts-0.159.0.json은 contrib 0.159.0의 출력 계약을 OTLP/JSON으로 옮긴 재현 입력이다.
실클러스터 캡처 파일은 아니다. 테스트가 namespace/pod·관측 시각·count를 바꿔 시나리오를 만든다.

- Gauge(Int): k8s.container.restarts, unit={restart}, asInt는 JSON int64 문자열.
- 마지막 종료 이유는 resource.attributes의 k8s.container.status.last_terminated_reason 문자열.
- 출처: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md

IT는 이 파일을 실제 OtlpMetricsReader로 읽고 ApmKubernetesMetricObserver→공통 SQL writer까지 실행한다.
