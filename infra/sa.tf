# Service Account
resource "yandex_iam_service_account" "app" {
  name        = var.sa_name
  description = "${var.environment} environment service account for BURCEV"
}

# Static access key for S3
resource "yandex_iam_service_account_static_access_key" "s3_key" {
  service_account_id = yandex_iam_service_account.app.id
  description        = "S3 access key for ${var.environment}"
}

# Grant storage.editor role
# Using iam_member (not iam_binding) to avoid overwriting other bindings on the folder.
resource "yandex_resourcemanager_folder_iam_member" "storage_editor" {
  folder_id = var.folder_id
  role      = "storage.editor"
  member    = "serviceAccount:${yandex_iam_service_account.app.id}"
}
