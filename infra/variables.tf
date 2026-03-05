variable "folder_id" {
  description = "Yandex Cloud folder ID"
  type        = string
}

variable "environment" {
  description = "Environment name: dev or prod"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be 'dev' or 'prod'."
  }
}

variable "pg_cluster_id" {
  description = "Existing PostgreSQL cluster ID"
  type        = string
}

variable "pg_user_password" {
  description = "Password for the PostgreSQL user"
  type        = string
  sensitive   = true
}

variable "pg_database_name" {
  description = "Name of the PostgreSQL database"
  type        = string
}

variable "pg_user_name" {
  description = "Name of the PostgreSQL user"
  type        = string
}

variable "sa_name" {
  description = "Name of the service account"
  type        = string
}

variable "pg_db_lc_collate" {
  description = "LC_COLLATE for the database"
  type        = string
  default     = "en_US.UTF-8"
}

variable "pg_db_lc_type" {
  description = "LC_CTYPE for the database"
  type        = string
  default     = "en_US.UTF-8"
}

variable "pg_db_owner" {
  description = "Database owner (if different from pg_user_name)"
  type        = string
  default     = ""
}

variable "pg_user_grants" {
  description = "Grants for the PostgreSQL user"
  type        = list(string)
  default     = []
}

variable "pg_user_permissions" {
  description = "Database permissions for the user"
  type        = list(string)
  default     = []
}
