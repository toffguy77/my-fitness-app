# NOTE: The S3 backend bucket "burcev-terraform-state" must be created manually
# before running `terraform init`. This is a bootstrap problem — Terraform
# cannot create the bucket it uses to store its own state.
#
# Create it via the Yandex Cloud console or CLI:
#   yc storage bucket create --name burcev-terraform-state

terraform {
  required_version = ">= 1.5"

  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.135"
    }
  }

  # Yandex Object Storage, не AWS. Отсюда набор пропусков: у Yandex нет ни
  # STS, ни IAM-ролей, ни метаданных инстанса, и запрос к ним не возвращает
  # ошибку, а просто не разрешается. Без skip_requesting_account_id backend
  # уходит в sts.ru-central1.amazonaws.com и `terraform init` не проходит
  # вовсе — ни у кого, независимо от прав.
  backend "s3" {
    endpoints = {
      s3 = "https://storage.yandexcloud.net"
    }
    bucket = "burcev-terraform-state"
    key    = "infra.tfstate"
    region = "ru-central1"

    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true

    use_path_style = true
  }
}

provider "yandex" {
  folder_id = var.folder_id
}
