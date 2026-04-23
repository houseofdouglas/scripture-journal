output "cloudfront_domain" {
  description = "CloudFront distribution domain — use this to access the app."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — needed for cache invalidations on deploy."
  value       = aws_cloudfront_distribution.app.id
}

output "app_bucket_name" {
  description = "S3 bucket for app data (content/, users/, auth/)."
  value       = aws_s3_bucket.app.bucket
}

output "spa_bucket_name" {
  description = "S3 bucket for SPA static files."
  value       = aws_s3_bucket.spa.bucket
}
