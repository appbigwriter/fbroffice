#!/bin/sh
# Sessão gráfica de usuário separado. O sandbox padrão do Chrome permanece ativo.
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec dbus-run-session -- /opt/fbroffice-browser/desktop.sh
