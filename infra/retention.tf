# Что мы обещали людям в политике конфиденциальности — и проверка, что это
# по-прежнему правда.
#
# Кластер PostgreSQL не заведён в Terraform: им управляет консоль Yandex Cloud,
# и заводить его сюда ради одной настройки — значит дать Terraform право менять
# и всё остальное, включая пересоздание. Поэтому здесь только чтение и
# утверждение: `terraform plan` падает, если срок хранения резервных копий
# опустился ниже обещанных тридцати дней.
#
# Срок был семь дней, пока это не проверили: страница /legal/privacy обещала
# тридцать, и расхождение не было видно ниоткуда.

data "yandex_mdb_postgresql_cluster" "app" {
  cluster_id = var.pg_cluster_id
}

check "backup_retention_matches_the_privacy_policy" {
  assert {
    condition = data.yandex_mdb_postgresql_cluster.app.config[0].backup_retain_period_days >= 30

    error_message = format(
      "Резервные копии хранятся %d дней, а /legal/privacy обещает 30. Либо поднимите срок (yc managed-postgresql cluster update %s --backup-retain-period-days 30), либо исправьте текст политики.",
      data.yandex_mdb_postgresql_cluster.app.config[0].backup_retain_period_days,
      var.pg_cluster_id,
    )
  }
}
