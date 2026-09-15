environment      = "prod"
folder_id        = "b1g7q85lgictgf4j1dq8"
pg_cluster_id    = "c9q1384cb8tqrg09o8n4"
pg_database_name = "web-app-db"
pg_user_name     = "burcev-web"
sa_name          = "burcev-prod"

# Prod DB uses Russian locale (existing state)
pg_db_lc_collate = "ru_RU.UTF-8"
pg_db_lc_type    = "ru_RU.UTF-8"

# DB owner differs from the managed user (changing owner forces DB replacement in YC MDB!)
# Владелец боевой базы — burcev-web, проверено запросом к самой базе.
# Здесь стояло "web-app-user", и `terraform plan` отвечал на это
# «must be replaced»: смена владельца заменяет ресурс, то есть удаляет
# боевую базу со всеми данными. README при этом предлагает запускать
# apply именно так.
pg_db_owner = "burcev-web"

# Existing user grants and permissions
pg_user_grants      = ["mdb_admin"]
pg_user_permissions = ["web-app-db"]
