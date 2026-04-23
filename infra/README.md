# infra

Terraform stack for scripture-journal. Manages all AWS resources.

## State

Remote state lives in `s3://818371815071-tf-state/scripture-journal/terraform.tfstate` (us-east-1).
That bucket was created manually on 2026-04-21 with versioning, AES-256 encryption, and public access blocked.
It is **not** managed by this stack — do not `terraform import` it.

Native S3 state locking is used (`use_lockfile = true`). No DynamoDB table needed.

## Structure

```
infra/
├── main.tf          # Terraform + provider + backend config
├── variables.tf     # Input variables (region, env, account_id)
├── s3.tf            # App data bucket + SPA bucket
├── cloudfront.tf    # CloudFront distribution + OACs
├── outputs.tf       # Useful post-apply values
└── modules/         # Reusable sub-modules (lambda, etc.) — added as features are built
```

Resources added as features are spec'd and built:
- `lambda.tf` — Lambda functions + Function URLs + IAM roles
- `ssm.tf` — SSM parameters (JWT secret)

## Bootstrap (one-time, already done)

The state bucket was created with:

```bash
aws s3api create-bucket --bucket 818371815071-tf-state --region us-east-1
aws s3api put-bucket-versioning --bucket 818371815071-tf-state \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket 818371815071-tf-state \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-public-access-block --bucket 818371815071-tf-state \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

## Usage

```bash
cd infra

# First time
terraform init

# Preview changes
terraform plan -var="env=dev"

# Apply
terraform apply -var="env=dev"
```

## Lambda build step

Lambda source lives in `src/functions/`. Before `terraform apply`, build ZIPs:

```bash
npm run build:lambdas   # runs esbuild, outputs to dist/functions/
```

CI runs this automatically before `terraform apply`.
