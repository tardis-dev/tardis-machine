from node:16-slim
# version arg contains current git tag
ARG VERSION_ARG
# install git
RUN apt-get update && apt-get install -y git
# install tardis-machine globally (exposes tardis-machine command)
RUN npm install --global --unsafe-perm tardis-machine@$VERSION_ARG
# run it
CMD tardis-machine --cache-dir=/.cache