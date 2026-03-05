# PostgreSQL user
resource "yandex_mdb_postgresql_user" "app" {
  cluster_id = var.pg_cluster_id
  name       = var.pg_user_name
  password   = var.pg_user_password

  dynamic "permission" {
    for_each = var.pg_user_permissions
    content {
      database_name = permission.value
    }
  }

  grants = var.pg_user_grants
}

# PostgreSQL database
resource "yandex_mdb_postgresql_database" "app" {
  cluster_id = var.pg_cluster_id
  name       = var.pg_database_name
  owner      = var.pg_db_owner != "" ? var.pg_db_owner : yandex_mdb_postgresql_user.app.name
  lc_collate = var.pg_db_lc_collate
  lc_type    = var.pg_db_lc_type

  extension {
    name = "uuid-ossp"
  }
}
