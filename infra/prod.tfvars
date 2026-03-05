environment      = "prod"
folder_id        = "b1g7q85lgictgf4j1dq8"
pg_cluster_id    = "c9q1384cb8tqrg09o8n4"
pg_database_name = "web-app-db"
pg_user_name     = "burcev-web"
sa_name          = "burcev-prod"

# Prod DB uses Russian locale (existing state)
pg_db_lc_collate = "ru_RU.UTF-8"
pg_db_lc_type    = "ru_RU.UTF-8"

# DB owner differs from the managed user
pg_db_owner = "web-app-user"

# Existing user grants and permissions
pg_user_grants      = ["mdb_admin"]
pg_user_permissions = ["web-app-db"]
