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

variable "route53_zone_id" {
  type        = string
  default     = "Z09637711ZOOUGKI57DYD"
  description = "Route53 hosted zone ID for xzvf.mobi domain."
}

variable "custom_domain" {
  type        = string
  default     = "notes.xzvf.mobi"
  description = "Custom domain name for the CloudFront distribution."
}
