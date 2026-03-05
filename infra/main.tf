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

  backend "s3" {
    endpoint = "https://storage.yandexcloud.net"
    bucket   = "burcev-terraform-state"
    key      = "infra.tfstate"
    region   = "ru-central1"

    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true

    force_path_style = true
  }
}

provider "yandex" {
  folder_id = var.folder_id
}
