FROM debian:bookworm-slim

ARG PB_VERSION=0.25.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /pb

RUN curl -fsSL -o /tmp/pocketbase.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
  && unzip /tmp/pocketbase.zip -d /pb \
  && rm -f /tmp/pocketbase.zip \
  && chmod +x /pb/pocketbase

COPY start.sh /pb/start.sh
RUN chmod +x /pb/start.sh

EXPOSE 8090

CMD ["/pb/start.sh"]
