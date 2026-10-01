# L'image mc de Chainguard n'a pas de shell : on copie le binaire dans une image qui en a un.
FROM cgr.dev/chainguard/minio-client:latest AS mc

FROM alpine:3.22
COPY --from=mc /usr/bin/mc /usr/bin/mc
COPY init.sh /init.sh
ENTRYPOINT ["sh", "/init.sh"]
