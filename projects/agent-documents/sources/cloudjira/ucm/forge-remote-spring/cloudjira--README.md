# Forge Remote Compute - Spring Boot - Reference Application

[![Atlassian license](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

This repository provides an Example Forge Remote Compute Server implementation based on Spring Boot.

## 로컬 실행 (UCM)

운영 MongoDB Atlas 대신 로컬 Mongo를 쓰는 `local` profile이 있다.

```bash
docker compose -f docker-compose.local.yml up -d      # 로컬 Mongo (ucm-mongo-local, 27017)
./mvnw -DskipTests package
java -jar target/frc-refapp-spring-boot-1.0.0.jar --spring.profiles.active=local
curl localhost:15080/ping                              # pong
```

- 다른 Mongo를 쓰려면 `MONGO_URI` 환경변수를 지정한다.
- `/ping` 외 엔드포인트는 Forge가 서명한 FIT가 필요하다. 실제 호출은 터널(cloudflared/ngrok)로 노출하고 dev 환경 manifest의 `remotes.baseUrl`을 그 주소로 바꿔서 테스트한다.
- profile 없이 실행하면 기본값 `prd`로 운영 Atlas에 붙으니 주의.

## Java 런타임 / 보안 패치

- 빌드·실행 모두 **Java 17 LTS** 기준이다 (`pom.xml` `java.version`=17, Dockerfile은 `maven:3-eclipse-temurin-17` → `eclipse-temurin:17-jre`).
- Dockerfile은 CVE-2026-91403 / CVE-2026-114820 (eMudhra 중간 CA, CVSS 9.1) 대응으로 `docker/emudhra-blocked.certs`의 지문 16개를 JDK `blocked.certs`에 추가한다. 베이스 이미지가 패치판(17.0.21+)으로 올라가도 그대로 둔다.
- 이미지를 다시 빌드하면 최신 17.x 패치가 반영되므로 CVE 대응 시 `docker compose build --pull` 로 재빌드한다.

## Running the server

1. In `application.properties`, replace value of `app.id` with the id from your app's `manifest.yml`
    * This _must_ be the full app id, including the `ari:cloud:ecosystem::app` prefix
2. Export `APP_SECRET` environment variable
    * This secret is used for HTTP Basic authentication for the `/frc-external` endpoint

```bash
export APP_SECRET=<YOUR SECRET>
```

3. Spin up the dependent containers by running `docker compose up --detach`
    * Run `docker compose down` to shut down the containers
4. Run `mvn spring-boot:run`
5. The server will be listening on port `8080`
    * You can change the port by setting `server.port` in `application.properties`

**[Optional]** To use your own configurations, go to `application.properties` and edit

* `spring.data.redis.ssl.enabled` to `true` to enable [TLS](https://github.com/redis/lettuce/wiki/SSL-Connections)
* `spring.data.redis.host` and `spring.data.redis.port` to use your own Redis server
* etc.

## App Configuration

### Single App Configuration
For a single app, use the `app.id` property in the `application.yml`:

```yaml
app:
  id: ari:cloud:ecosystem::app/<YOUR_APP_ID>
```

Alternatively, you can set the `APP_ID` environment variable, which Spring Boot will automatically map to the `app.id` property:

```bash
export APP_ID=ari:cloud:ecosystem::app/<YOUR_APP_ID>
```

### Multi-App Configuration
For multiple apps, instead of the `app.id` property, use the `multi-app` property:

```yaml
multi-app:
  apps:
    - app-id: "ari:cloud:ecosystem::app/<YOUR_APP_ID>"
    - app-id: "ari:cloud:ecosystem::app/<YOUR_APP_ID2>"
```

### AGC (Atlassian Government Cloud) Support

For AGC-compatible Forge apps, you'll need to register a separate app ID. See the [AGC documentation](https://developer.atlassian.com/platform/framework/agc/guides/build-agc-compatible-forge-apps/) for more details.

In your server configuration, you'll need to specify different JWKS and storage URLs for the Federal environment. Use the multi-app configuration to specify different URLs for your AGC app:

```yaml
multi-app:
  apps:
    - app-id: "ari:cloud:ecosystem::app/<YOUR_REGULAR_APP_ID>"
    - app-id: "ari:cloud:ecosystem::app/<YOUR_AGC_APP_ID>"
      storage-base-url: "https://api.atlassian-us-gov-mod.com/forge/storage/kvs"
      jwks-endpoint: "https://forge.cdn.prod.atlassian-dev-us-gov-mod.net/.well-known/jwks.json"
```
The server will automatically detect which app is making the request and use the appropriate configuration based on the app ID in the JWT token.
>**Note**: The first app doesn't specify `storage-base-url` and `jwks-endpoint` because the server defaults to using URLS for standard cloud environment apps.

>**Note**: The `storage-base-url` is only necessary if you are using Forge storage.

## Invocations

- `POST /frc`: Custom UI Remote invocation endpoint (via `invokeRemote` from `@forge/bridge`)
- `POST /frc-backend`: Backend Remote invocation endpoint (via `invokeRemote` from `@forge/api`)
- `POST /frc-event`: Events Remote invocation endpoint (via `modules.trigger.endpoint` in `manifest.yml`)
- `POST /frc-scheduled-trigger`: Scheduled trigger endpoint (via `modules.scheduledTrigger.endpoint` in `manifest.yml`)
- `GET /frc-external`: An endpoint to receive a request originating from outside the Forge platform, such as IFTTT, to
  perform a product API request

To manually test `/frc-external`, simply use `curl` like below:

```shell
curl --request GET "http://localhost:8080/frc-external?installationId=ari%3Acloud%3Aecosystem%3A%3Aapp%2F00000000-0000-0000-0000-000000000000" \
  --user "app:${APP_SECRET}" \
  --header "Accept: application/json"
```

### Invocation results

- If the invocation was successful and the token is valid, the response will be an HTTP 2xx
- If the invocation failed because the token provided was not valid, the response will be an HTTP 401 or 404

## Disclaimer

Please be aware that the basic authentication method utilized in this project is solely for demonstration purposes.
Atlassian does not endorse the use of basic authentication and the npm libraries associated with it.
We strongly advise replacing this authentication method with a more secure option that aligns with your specific use
cases.

## Tests

Tests can be run via:

```
./mvnw verify
```

## Contributions

Contributions to Forge Remote Compute - Spring Boot - Reference Application are welcome! Please
see [CONTRIBUTING.md](cloudjira--CONTRIBUTING.md) for details.

## License

Copyright (c) 2023 Atlassian US., Inc.
Apache 2.0 licensed, see [LICENSE](file:///C:/CloudJira/ucm/forge-remote-spring/LICENSE) file.

<br/>

[![From Atlassian](https://raw.githubusercontent.com/atlassian-internal/oss-assets/master/banner-cheers.png)](https://www.atlassian.com)
