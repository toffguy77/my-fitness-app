# Import blocks for existing resources.
# These are used once during initial `terraform apply` to bring
# existing Yandex Cloud resources under Terraform management.
#
# After successful import, these blocks can be removed.
#
# Usage:
#   terraform apply -var-file=prod.tfvars  (imports existing prod resources)
#
# To import:
# 1. Fill in the actual IDs below
# 2. Run: terraform plan -var-file=prod.tfvars
# 3. Review the plan — should show no changes for imported resources
# 4. Run: terraform apply -var-file=prod.tfvars

# Uncomment and fill IDs when ready to import existing prod resources:
#
# import {
#   to = yandex_iam_service_account.app
#   id = "ajetieia8uunpq733f9t"  # existing SA ID
# }
#
# import {
#   to = yandex_mdb_postgresql_user.app
#   id = "c9q1384cb8tqrg09o8n4:existing_user_name"
# }
#
# import {
#   to = yandex_mdb_postgresql_database.app
#   id = "c9q1384cb8tqrg09o8n4:web-app-db"
# }
