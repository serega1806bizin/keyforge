#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/certs"
DOMAIN="id.localtest.me"
mkdir -p "$CERT_DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "mkcert found - issuing a locally-trusted cert."
  mkcert -install
  mkcert -cert-file "$CERT_DIR/$DOMAIN.pem" -key-file "$CERT_DIR/$DOMAIN-key.pem" \
    "$DOMAIN" "*.localtest.me" localhost 127.0.0.1
else
  echo "mkcert not installed - generating a self-signed OpenSSL cert."
  CONF="$(mktemp)"
  cat > "$CONF" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3_ext
prompt = no
[dn]
CN = $DOMAIN
[v3_ext]
subjectAltName = DNS:$DOMAIN, DNS:*.localtest.me, DNS:localhost, IP:127.0.0.1
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$CERT_DIR/$DOMAIN-key.pem" \
    -out "$CERT_DIR/$DOMAIN.pem" \
    -config "$CONF"
  rm -f "$CONF"
fi

echo "Certs written to $CERT_DIR"
