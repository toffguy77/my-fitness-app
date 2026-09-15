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

  # Расширения перечислены здесь не для установки, а чтобы совпадать с базой.
  #
  # Terraform считает список расширений частью определения базы и на любое
  # расхождение отвечает заменой ресурса — то есть удалением боевой базы со
  # всеми данными. `pg_trgm` пришёл миграцией 066 (поиск по названию продукта,
  # индексы idx_products_name_trgm и idx_products_brand_trgm) и в конфигурации
  # отсутствовал; `terraform plan` из README показывал
  # «must be replaced», и apply снёс бы прод.
  #
  # Поэтому: расширение, добавленное миграцией, добавляется и сюда — в том же
  # изменении, а не потом.
  extension {
    name = "uuid-ossp"
  }

  extension {
    name = "pg_trgm"
  }

  # Замена базы недопустима ни при каких расхождениях: данные в ней
  # невосстановимы из конфигурации.
  lifecycle {
    prevent_destroy = true
  }
}
