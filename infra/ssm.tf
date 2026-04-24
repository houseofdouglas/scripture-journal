resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/scripture-journal/${var.env}/jwt-secret"
  type        = "SecureString"
  value       = "REPLACE_ME_BEFORE_USE"
  description = "JWT signing secret for scripture-journal API (HS256)"

  lifecycle {
    # Prevent Terraform from overwriting the real secret after initial creation.
    # Update via: aws ssm put-parameter --name ... --value "$(openssl rand -base64 48)" --overwrite
    ignore_changes = [value]
  }
}
