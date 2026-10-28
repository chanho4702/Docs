// 번들러용 ES module. consentGranted()를 실제 동의 관리 코드와 연결한다.
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { onLCP, onINP, onCLS, onTTFB, onFCP } from 'web-vitals';

export async function startMovesEyeRum({
  consentGranted = () => false,
  publicRumToken = 'PASTE_ONCE_ISSUED_RUM_TOKEN',
  propagateTraceHeaderCorsUrls = [] // 계측할 백엔드 URL만 명시한다.
} = {}) {
  if (!consentGranted()) return;
  const endpoint = __ENDPOINT__;
  const tokenId = __TOKEN_ID__;
  const sessionId = crypto.randomUUID(); // 동의 뒤 메모리에만 생성한다.
  const page = () => location.pathname;
  const headers = { Authorization: 'Bearer ' + publicRumToken };
  // 재시도는 메모리 안에서만 한다. 시각·id·본문을 그대로 보내 서버 영수증 중복 제거를 유지한다.
  const MAX_PENDING_VITALS = 20;
  const MAX_PENDING_BYTES = 32 * 1024;
  const MAX_ATTEMPTS = 3;
  const MAX_AGE_MS = 60_000;
  const REQUEST_TIMEOUT_MS = 5_000;
  const RETRY_BASE_MS = 1_000;
  const vitals = new Set();
  let pendingBytes = 0;
  let stopped = false;
  let suspended = false;
  const collecting = () => !stopped && consentGranted();
  const removeVital = item => {
    clearTimeout(item.timer);
    if (vitals.delete(item)) pendingBytes -= item.bytes;
  };
  const clearVitals = () => {
    for (const item of vitals) {
      item.controller?.abort();
      removeVital(item);
    }
  };
  const transmitVital = async item => {
    if (!collecting()) { clearVitals(); return; }
    if (!vitals.has(item)) return;
    if (Date.now() - item.createdAt >= MAX_AGE_MS) { removeVital(item); return; }
    item.attempts++;
    const controller = new AbortController();
    item.controller = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let retry = false;
    let retryAfterMs = 0;
    try {
      const response = await fetch(endpoint + '/v1/metrics?tokenId=' + tokenId, {
        method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
        headers: {...headers, 'Content-Type': 'application/json'},
        body: item.body, signal: controller.signal
      });
      // 200 partialSuccess는 완료이며 인증·본문 오류를 다시 보내지 않는다.
      retry = !response.ok && [429, 502, 503, 504].includes(response.status);
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        retryAfterMs = /^\d+$/.test(retryAfter.trim())
          ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
      }
    } catch {
      retry = true; // 네트워크 단절·응답 시간 초과. 토큰과 본문을 로그에 남기지 않는다.
    } finally {
      clearTimeout(timeout);
      item.controller = undefined;
    }
    if (!collecting()) { clearVitals(); return; }
    if (!vitals.has(item)) return;
    const delay = Math.max(retryAfterMs,
      RETRY_BASE_MS * 2 ** (item.attempts - 1) * (1 + Math.random()));
    if (retry && !item.noRetry && !suspended && item.attempts < MAX_ATTEMPTS
        && Date.now() + delay - item.createdAt < MAX_AGE_MS) {
      item.timer = setTimeout(() => { void transmitVital(item); }, delay);
    } else {
      removeVital(item);
    }
  };
  const queueVital = body => {
    if (!collecting()) { clearVitals(); return; }
    const bytes = new TextEncoder().encode(body).byteLength;
    if (vitals.size >= MAX_PENDING_VITALS || pendingBytes + bytes > MAX_PENDING_BYTES) return;
    const item = {body, bytes, attempts: 0, createdAt: Date.now(), noRetry: suspended};
    vitals.add(item);
    pendingBytes += bytes;
    void transmitVital(item);
  };
  // 종료 시 지연 재시도는 폐기한다. 마지막 Vital과 이미 전송 중인 요청은 keepalive 1회만 맡긴다.
  const pageHide = () => {
    suspended = true;
    for (const item of vitals) {
      item.noRetry = true;
      if (!item.controller) removeVital(item);
    }
  };
  const pageShow = () => { suspended = false; };
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('pageshow', pageShow);
  const exporter = new OTLPTraceExporter({ url: endpoint + '/v1/traces?tokenId=' + tokenId, headers });
  const gatedExporter = {
    export: (spans, callback) => collecting() ? exporter.export(spans, callback) : callback({code: 0}),
    shutdown: () => exporter.shutdown(),
    forceFlush: () => exporter.forceFlush()
  };
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'browser' }),
    spanProcessors: [{
      onStart: span => span.setAttributes({
        'rum.page.path': page(), 'session.id': sessionId,
        // SDK의 실제 span 시작 시각을 navigation 기준으로 바꿔 리소스 워터폴에 보낸다.
        'resource.start_time': Math.max(0, span.startTime[0] * 1000 + span.startTime[1] / 1e6 - performance.timeOrigin)
      }),
      onEnd: () => {}, forceFlush: async () => {}, shutdown: async () => {}
    }, new BatchSpanProcessor(gatedExporter)]
  });
  provider.register();
  const ignoreUrls = [new RegExp('^' + endpoint.replaceAll('.', '\\.') + '/')];
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({ ignoreUrls, propagateTraceHeaderCorsUrls }),
      new XMLHttpRequestInstrumentation({ ignoreUrls, propagateTraceHeaderCorsUrls })
    ]
  });
  const sendVital = ({name, value, id}) => {
    if (!collecting()) { clearVitals(); return; }
    const attributes = Object.entries({
      'rum.page.path': page(), 'session.id': sessionId, 'web_vitals.id': id
    }).map(([key, value]) => ({key, value: {stringValue: value}}));
    const body = JSON.stringify({resourceMetrics: [{
      resource: {attributes: []}, scopeMetrics: [{scope: {name: 'web-vitals'}, metrics: [{
        name: 'web_vitals.' + name.toLowerCase(), unit: name === 'CLS' ? '1' : 'ms',
        gauge: {dataPoints: [{timeUnixNano: String(BigInt(Date.now()) * 1000000n), asDouble: value, attributes}]}
      }]}]
    }]});
    // 최종 Web Vital 관측을 OTLP/JSON gauge로 전송한다. 쿠키·입력값·리플레이는 수집하지 않는다.
    queueVital(body);
  };
  [onLCP, onINP, onCLS, onTTFB, onFCP].forEach(register => register(sendVital));
  const tracer = provider.getTracer('moveseye-rum-errors');
  const recordError = reason => {
    if (!collecting()) return;
    // error와 unhandledrejection은 같은 exception 이벤트로 보낸다. reason은 문자열·null·
    // 임의 객체일 수도 있으므로 원문을 String/JSON/message로 변환해 담지 않는다.
    // 저장 시 RumSanitizer.stack이 메시지 첫 줄·PII를 제거하고 UTF-8 4096바이트로 제한한다.
    const type = typeof reason?.name === 'string' ? reason.name : 'Error';
    const stack = typeof reason?.stack === 'string' ? reason.stack : '';
    const span = tracer.startSpan('exception');
    span.addEvent('exception', {
      'exception.type': type || 'Error',
      'exception.stacktrace': stack
    });
    span.end();
  };
  const error = event => recordError(event.error);
  const rejection = event => recordError(event.reason);
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  // 동의 철회 시 호출한다. consentGranted()도 즉시 false를 반환해야 한다.
  return async () => {
    stopped = true;
    clearVitals();
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
    window.removeEventListener('error', error);
    window.removeEventListener('unhandledrejection', rejection);
    await provider.shutdown();
  };
}
