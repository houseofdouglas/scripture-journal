# SSM parameter for the JWT secret is managed outside Terraform
# because the SystemAdministrator SSO role lacks ssm:PutParameter.
#
# Create it once manually after first deploy:
#
#   aws ssm put-parameter \
#     --name "/scripture-journal/dev/jwt-secret" \
#     --value "$(openssl rand -base64 48)" \
#     --type SecureString
#
# Alternatively, set var.jwt_secret and Terraform will inject it directly
# into the Lambda environment (simpler for dev — skips SSM entirely).
