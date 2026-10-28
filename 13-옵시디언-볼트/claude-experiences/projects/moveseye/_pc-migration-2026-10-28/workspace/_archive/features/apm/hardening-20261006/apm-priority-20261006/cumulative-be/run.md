# CUMULATIVE BE 회귀 실행

- JDK: `C:/Program Files/Java/jdk-17`
- 저장소: `C:/solutions/moveseye-be-spring`
- 기준: `aab73fc` 이후 순위 2~4 작업 디렉터리
- 실제 결과: 203개 테스트, 실패·오류·skip 0. 24개 XML suite에는 nested suite가 포함된다.
- 실제 PG 검증: `ApmMetricIngestAtomicityIT` 14개, `ApmMetric1mStoreIT` 11개.
- 테스트: BUILD SUCCESSFUL, 3분 13초.
- `:bootJar --max-workers=1`: BUILD SUCCESSFUL, 19초.
- 공유 서버 재시작·배포는 하지 않았다.

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :test --max-workers=1 --tests '*OtlpMetricsReaderTest' --tests '*OtlpMetricIdentityTest' --tests '*CumulativeDeltaTrackerTest' --tests '*ApmCumulativePropertiesTest' --tests '*MetricIngestorTest' --tests '*MetricIngestPipelineTest' --tests '*ApmMetricIngestAtomicityIT' --tests '*ApmMetric1mStoreIT' --tests '*ApmMetric1mStoreTest' --tests '*ApmIngestDropStatRecorderTest' --tests '*ApmServiceDropTallyTest' --tests '*ApmIngestDropQueryServiceTest' --tests '*ApmServiceDropSummaryServiceTest' --tests '*LiveRuntimeIngestTest'
.\gradlew.bat :bootJar --max-workers=1
```

새 raw typed identity는 합성 JSON→실제 reader로 검증하고, 저장 정확성과 rollback은 실제 PostgreSQL로 별도 검증했다. 제품 OTLP HTTP→FE 브라우저 전체 E2E 또는 부하 시험으로 표시하지 않는다. 이전 521개·단계 1의 79개·FE 117개를 이 203개에 합산하지 않았다.
