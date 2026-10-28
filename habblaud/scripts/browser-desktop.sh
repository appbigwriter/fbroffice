#!/bin/sh
openbox &
exec /usr/bin/google-chrome --user-data-dir=/var/lib/fbroffice-browser/profile --no-first-run --disable-dev-shm-usage about:blank
