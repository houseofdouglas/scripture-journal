terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "818371815071-tf-state"
    key          = "scripture-journal/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "scripture-journal"
      Environment = var.env
      ManagedBy   = "terraform"
    }
  }
}

# Used to build ARNs that include the AWS account ID (e.g. CloudFront IAM policy)
data "aws_caller_identity" "current" {}
