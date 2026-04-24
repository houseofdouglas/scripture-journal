# ── IAM execution role ─────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda" {
  name = "scripture-journal-lambda-${var.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Basic execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# S3 read/write on the app data bucket
resource "aws_iam_role_policy" "lambda_s3" {
  name = "scripture-journal-lambda-s3-${var.env}"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:HeadObject",
        "s3:DeleteObject",
      ]
      Resource = "${aws_s3_bucket.app.arn}/*"
    }]
  })
}

# SSM: GetParameter on the JWT secret only
resource "aws_iam_role_policy" "lambda_ssm" {
  name = "scripture-journal-lambda-ssm-${var.env}"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = aws_ssm_parameter.jwt_secret.arn
    }]
  })
}

# ── Lambda function ────────────────────────────────────────────────────────────

resource "aws_lambda_function" "api" {
  function_name = "scripture-journal-api-${var.env}"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  filename      = "${path.module}/../dist/lambda.zip"
  timeout       = 30
  memory_size   = 256

  source_code_hash = filebase64sha256("${path.module}/../dist/lambda.zip")

  environment {
    variables = {
      BUCKET_NAME       = aws_s3_bucket.app.bucket
      ENV               = var.env
      ADMIN_USERNAME    = "peter"
      # Populated via -var="cloudfront_domain=..." after the first apply.
      # Empty on initial deploy — app.ts CORS falls back to "*" when unset.
      CLOUDFRONT_DOMAIN = var.cloudfront_domain
    }
  }
}

# ── Function URL ───────────────────────────────────────────────────────────────

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE" # JWT auth is handled in the Hono middleware

  # The Function URL sits behind CloudFront — browsers never hit it directly,
  # so "*" is safe here. Real auth is enforced by JWT middleware in Hono.
  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["GET", "POST"]
    allow_headers     = ["Content-Type", "Authorization"]
    max_age           = 86400
  }
}
