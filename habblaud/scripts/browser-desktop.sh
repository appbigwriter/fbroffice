#!/bin/sh
# O gerenciador de janelas mantém a sessão viva mesmo quando o Chrome fecha.
openbox &
window_manager=$!
/usr/bin/google-chrome --user-data-dir=/var/lib/fbroffice-browser/profile --no-first-run --disable-dev-shm-usage about:blank &
wait "$window_manager"
