FROM node:26.7.0-bookworm-slim AS package

COPY publish-artifact/tardis-machine.tgz /tmp/tardis-machine.tgz

RUN mkdir /tmp/tardis-machine \
  && tar -xzf /tmp/tardis-machine.tgz --strip-components=1 -C /tmp/tardis-machine \
  && node /tmp/tardis-machine/bin/tardis-machine.js --version > /dev/null \
  && node --input-type=module --eval "await import('/tmp/tardis-machine/dist/index.js')" \
  && rm /tmp/tardis-machine.tgz

FROM node:26.7.0-bookworm-slim

ENV NODE_ENV=production
ENV TM_CACHE_DIR=/.cache

COPY --from=package /tmp/tardis-machine /opt/tardis-machine

ENTRYPOINT ["node", "/opt/tardis-machine/bin/tardis-machine.js"]
