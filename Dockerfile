#
# uWebSockets.js v20.59.0 requires glibc >= 2.38 for the prebuilt Linux addon.
# Use the explicit trixie variant to keep the base image on glibc >= 2.38.
FROM node:25.8.2-trixie-slim
# version arg contains current git tag
ARG VERSION_ARG
# install git
RUN apt-get update && apt-get install -y git
# install tardis-machine globally (exposes tardis-machine command)
RUN npm install --global --unsafe-perm tardis-machine@$VERSION_ARG

ENV UWS_HTTP_MAX_HEADERS_SIZE=20000
# run it
CMD tardis-machine --cache-dir=/.cache
