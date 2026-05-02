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
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:HeadObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.app.arn}/*"
      },
      {
        # Required so GetObject 404s return NoSuchKey (404) instead of AccessDenied (403)
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.app.arn
      }
    ]
  })
}

# CloudFront: CreateInvalidation on the app distribution
resource "aws_iam_role_policy" "lambda_cloudfront" {
  name = "scripture-journal-lambda-cloudfront-${var.env}"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["cloudfront:CreateInvalidation"]
      Resource = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.app.id}"
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
      BUCKET_NAME                = aws_s3_bucket.app.bucket
      ENV                        = var.env
      ADMIN_USERNAME             = "peter"
      # CORS origin — restricted to the custom domain (notes.xzvf.mobi)
      CLOUDFRONT_DOMAIN          = var.custom_domain
      JWT_SECRET_ARN             = aws_ssm_parameter.jwt_secret.arn
      CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.app.id
    }
  }
}

# ── API Gateway HTTP API ────────────────────────────────────────────────────────
# Using API Gateway instead of Lambda Function URL — proven CloudFront integration
# with no account-level public access restrictions.

resource "aws_apigatewayv2_api" "api" {
  name          = "scripture-journal-api-${var.env}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

# Allow API Gateway to invoke the Lambda function
resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
