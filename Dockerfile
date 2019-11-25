# node v13 is required
from node:13-slim
# version arg contains current git tag
ARG VERSION_ARG
# install tardis-machine globally (exposes tardis-machine command)
RUN npm install --global --unsafe-perm tardis-machine@$VERSION_ARG
# run it
CMD tardis-machine --cache-dir=/.cache