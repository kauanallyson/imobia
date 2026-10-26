#!/bin/sh
# Executado pelo entrypoint do Postgres só na primeira inicialização do
# volume. Cria o banco da Evolution API, separado do banco do CRM.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE evolution"
