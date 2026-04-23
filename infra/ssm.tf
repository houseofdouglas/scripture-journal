resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/scripture-journal/${var.env}/jwt-secret"
  type        = "SecureString"
  value       = "REPLACE_ME_BEFORE_USE"
  description = "JWT signing secret for scripture-journal API (HS256)"

  lifecycle {
    ignore_changes = [value]
  }
}
