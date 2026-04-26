# ── ACM Wildcard Certificate ──────────────────────────────────────────────────

resource "aws_acm_certificate" "app" {
  domain_name       = "*.xzvf.mobi"
  validation_method = "DNS"

  subject_alternative_names = [
    "xzvf.mobi"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "scripture-journal-wildcard-cert-${var.env}"
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

# ── Route53 Alias Records ─────────────────────────────────────────────────────

resource "aws_route53_record" "app" {
  zone_id = var.route53_zone_id
  name    = var.custom_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

# Optional: IPv6 AAAA record for CloudFront
resource "aws_route53_record" "app_ipv6" {
  zone_id = var.route53_zone_id
  name    = var.custom_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

# ── Wildcard Certificate Benefits ─────────────────────────────────────────────
#
# This wildcard certificate covers:
#   - notes.xzvf.mobi (scripture journal application)
#   - *.xzvf.mobi (any other subdomain)
#   - xzvf.mobi (root domain, included in SANs)
#
# You can now host multiple services under xzvf.mobi without creating new certs.
