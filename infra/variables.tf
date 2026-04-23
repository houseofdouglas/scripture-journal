variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region for all resources."
}

variable "env" {
  type        = string
  default     = "dev"
  description = "Deployment environment (dev | prod)."

  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be dev or prod."
  }
}

variable "account_id" {
  type        = string
  default     = "818371815071"
  description = "AWS account ID — used in bucket naming."
}

variable "jwt_secret" {
  type        = string
  sensitive   = true
  default     = ""
  description = <<-EOT
    JWT signing secret injected directly into the Lambda environment.
    When set, the Lambda uses this value and skips the SSM lookup.
    Generate with: openssl rand -base64 48
    Pass as: terraform apply -var="jwt_secret=<value>"
    or store in terraform.tfvars (gitignored).
  EOT
}

variable "cloudfront_domain" {
  type        = string
  default     = ""
  description = <<-EOT
    CloudFront distribution domain injected into the Lambda env.
    Leave blank on the first apply (CloudFront doesn't exist yet).
    After the first apply, re-run with:
      terraform apply -var="cloudfront_domain=$(terraform output -raw cloudfront_domain)"
  EOT
}
