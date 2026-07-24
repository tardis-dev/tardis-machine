#
# uWebSockets.js v20.59.0 requires glibc >= 2.38 for the prebuilt Linux addon.
# Use the explicit trixie variant to keep the base image on glibc >= 2.38.
FROM node:25.8.2-trixie-slim
# version arg contains current git tag
ARG VERSION_ARG
# install git
RUN apt-get update && apt-get install -y git
# install tardis-machine globally (exposes tardis-machine command)
RUN for attempt in $(seq 1 60); do \
      npm view "tardis-machine@$VERSION_ARG" version --prefer-online >/dev/null 2>&1 && break; \
      if [ "$attempt" -eq 60 ]; then exit 1; fi; \
      sleep 10; \
    done && \
    npm install --global --unsafe-perm "tardis-machine@$VERSION_ARG"

ENV UWS_HTTP_MAX_HEADERS_SIZE=20000
# run it
CMD tardis-machine --cache-dir=/.cache
