# ── App data bucket ───────────────────────────────────────────────────────────

resource "aws_s3_bucket" "app" {
  bucket = "scripture-journal-app-${var.account_id}-${var.env}"
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# Deny any access not coming through CloudFront (Origin Access Control)
resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id
  policy = data.aws_iam_policy_document.app_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.app]
}

# Allows the browser to PUT PDFs directly to tmp/extract/ via a presigned
# URL (PDF Textract extraction) without routing the file through Lambda.
resource "aws_s3_bucket_cors_configuration" "app" {
  bucket = aws_s3_bucket.app.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = ["https://${var.custom_domain}", "http://localhost:5173"]
    allowed_headers = ["content-type"]
    max_age_seconds = 3000
  }
}

# Belt-and-braces cleanup for tmp/extract/ objects: the Lambda deletes them
# right after extraction (success or failure), but an abandoned upload or a
# failed delete would otherwise linger indefinitely.
resource "aws_s3_bucket_lifecycle_configuration" "app_tmp_expiry" {
  bucket = aws_s3_bucket.app.id

  rule {
    id     = "expire-tmp"
    status = "Enabled"
    filter {
      prefix = "tmp/"
    }
    expiration {
      days = 1
    }
  }
}

data "aws_iam_policy_document" "app_bucket" {
  # CloudFront OAC read access — content/ (scripture JSON) and users/ (journal data)
  statement {
    sid    = "CloudFrontReadContent"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.app.arn}/content/*",
      "${aws_s3_bucket.app.arn}/users/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }
}

# ── SPA hosting bucket ────────────────────────────────────────────────────────

resource "aws_s3_bucket" "spa" {
  bucket = "scripture-journal-spa-${var.account_id}-${var.env}"
}

resource "aws_s3_bucket_versioning" "spa" {
  bucket = aws_s3_bucket.spa.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "spa" {
  bucket                  = aws_s3_bucket.spa.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id
  policy = data.aws_iam_policy_document.spa_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.spa]
}

data "aws_iam_policy_document" "spa_bucket" {
  statement {
    sid    = "CloudFrontReadSPA"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }
}
