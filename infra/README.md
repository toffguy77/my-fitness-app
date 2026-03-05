# Infrastructure — Terraform

Terraform configuration for managing BURCEV dev/prod resources on Yandex Cloud.

## What it manages

- **Service accounts** with static access keys for S3
- **IAM bindings** (storage.editor role per service account)
- **PostgreSQL users** and **databases** in the existing Managed PostgreSQL cluster

## Prerequisites

1. [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
2. Yandex Cloud CLI (`yc`) authenticated
3. S3 state bucket created manually (one-time bootstrap):
   ```bash
   yc storage bucket create --name burcev-terraform-state
   ```
4. Export S3 credentials for the backend:
   ```bash
   export AWS_ACCESS_KEY_ID="<state-bucket-key>"
   export AWS_SECRET_ACCESS_KEY="<state-bucket-secret>"
   ```

## Usage

### Initialize

```bash
cd infra
terraform init
```

### Plan and apply for dev

```bash
terraform plan  -var-file=dev.tfvars  -var 'pg_user_password=YOUR_PASSWORD'
terraform apply -var-file=dev.tfvars  -var 'pg_user_password=YOUR_PASSWORD'
```

### Plan and apply for prod

```bash
terraform plan  -var-file=prod.tfvars -var 'pg_user_password=YOUR_PASSWORD'
terraform apply -var-file=prod.tfvars -var 'pg_user_password=YOUR_PASSWORD'
```

### Retrieve outputs

```bash
terraform output                    # all outputs
terraform output s3_secret_key      # single sensitive output (printed raw)
```

## Importing existing resources

Existing prod resources (service account, DB user, database) can be imported into Terraform state. See `imports.tf` for instructions — uncomment the import blocks, fill in IDs, then run `terraform apply -var-file=prod.tfvars`.

## Notes

- `pg_user_password` is sensitive and must be passed via `-var` flag or `TF_VAR_pg_user_password` env var. It is **not** stored in tfvars files.
- Uses `yandex_resourcemanager_folder_iam_member` (not `_binding`) to avoid overwriting other role bindings on the folder.
- Dev and prod share the same Terraform config but use separate `.tfvars` files.
