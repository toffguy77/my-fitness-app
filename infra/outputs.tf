output "service_account_id" {
  description = "Service account ID"
  value       = yandex_iam_service_account.app.id
}

output "s3_access_key" {
  description = "S3 access key ID"
  value       = yandex_iam_service_account_static_access_key.s3_key.access_key
}

output "s3_secret_key" {
  description = "S3 secret key"
  value       = yandex_iam_service_account_static_access_key.s3_key.secret_key
  sensitive   = true
}

output "database_name" {
  description = "PostgreSQL database name"
  value       = yandex_mdb_postgresql_database.app.name
}

output "database_user" {
  description = "PostgreSQL user name"
  value       = yandex_mdb_postgresql_user.app.name
}
