# PostgreSQL user
resource "yandex_mdb_postgresql_user" "app" {
  cluster_id = var.pg_cluster_id
  name       = var.pg_user_name
  password   = var.pg_user_password
}

# PostgreSQL database
resource "yandex_mdb_postgresql_database" "app" {
  cluster_id = var.pg_cluster_id
  name       = var.pg_database_name
  owner      = yandex_mdb_postgresql_user.app.name
  lc_collate = "en_US.UTF-8"
  lc_type    = "en_US.UTF-8"

  extension {
    name = "uuid-ossp"
  }
}
