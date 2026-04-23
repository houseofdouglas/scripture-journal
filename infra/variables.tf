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
