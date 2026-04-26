# ── ACM Certificate ───────────────────────────────────────────────────────────

resource "aws_acm_certificate" "app" {
  domain_name       = "notes.xzvf.mobi"
  validation_method = "DNS"

  subject_alternative_names = [
    "notes.xzvf.mobi"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "scripture-journal-app-cert-${var.env}"
  }
}

# ── ACM Validation Records ─────────────────────────────────────────────────────

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.app.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn           = aws_acm_certificate.app.arn
  timeouts {
    create = "5m"
  }
  depends_on = [aws_route53_record.cert_validation]
}

# ── Route53 Alias Record ───────────────────────────────────────────────────────

resource "aws_route53_record" "app" {
  zone_id = var.route53_zone_id
  name    = "notes.xzvf.mobi"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

# ── CloudFront Distribution — Update to use ACM Certificate ──────────────────

# Update the existing distribution's viewer_certificate block from the cloudfront.tf file
# This requires modifying cloudfront.tf to use:
#
#   viewer_certificate {
#     acm_certificate_arn            = aws_acm_certificate.app.arn
#     ssl_support_method             = "sni-only"
#     minimum_protocol_version       = "TLSv1.2_2021"
#   }
#
# And add this to the distribution block:
#   aliases = ["notes.xzvf.mobi"]
