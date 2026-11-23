#!/bin/bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "L'installation de Nginx, Certbot et systemd nécessite sudo." >&2
    exit 1
fi

ops_dir=$(cd -- "$(dirname -- "$0")" && pwd)
domain=gow.bertho.tech
site=/etc/nginx/sites-available/$domain

if [[ -e "$site" ]] && ! grep -Eq '^[[:space:]]*include[[:space:]]+snippets/gow-site\.conf[[:space:]]*;' "$site"; then
    cat >&2 <<EOF
Migration manuelle requise dans $site (une seule fois).
Dans le bloc qui sert le site, remplacez root, index, gzip*, add_header et tous les blocs location par la ligne suivante.
    include snippets/gow-site.conf;
Conservez le certificat et la redirection HTTPS de Certbot, puis relancez sudo bash ops/install.sh.
EOF
    exit 1
fi

if ! id gow-deploy >/dev/null 2>&1; then
    /usr/sbin/useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin gow-deploy
fi
install -D -m 0644 "$ops_dir/update.py" /usr/local/lib/gow-site/update.py
install -m 0644 "$ops_dir/gow-site.service" "$ops_dir/gow-site.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gow-site.timer

install -D -m 0644 "$ops_dir/nginx-site.conf" /etc/nginx/snippets/gow-site.conf
# Lors des exécutions suivantes, conserver le certificat et les directives ajoutées par Certbot.
if [[ ! -e "$site" ]]; then
    install -m 0644 "$ops_dir/nginx.conf" "$site"
fi
if [[ ! -L "/etc/nginx/sites-enabled/$domain" ]]; then
    ln -s "$site" "/etc/nginx/sites-enabled/$domain"
fi
/usr/sbin/nginx -t
systemctl reload nginx
certbot --nginx --non-interactive --agree-tos --keep-until-expiring --redirect --cert-name "$domain" -d "$domain"
/usr/sbin/nginx -t
systemctl start gow-site.service
