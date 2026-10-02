# IAM Policies

Least-privilege policies to replace the Admin policy previously used for this project.
Apply them once using your existing admin credentials, then detach Admin.

## Policies

### `deploy-policy.json` — Developer / CI-CD

Covers everything needed to:
- Run `terraform init / plan / apply` for any resource in `infra/`
- Sync the SPA build to S3 (`aws s3 sync dist/spa s3://…`)
- Invalidate the CloudFront cache after a SPA deploy
- Run admin scripts locally (`npm run create-user`, `npm run ingest-scripture`)

**Services scoped:**

| Service | Resource scope | What's allowed |
|---|---|---|
| S3 (state) | `818371815071-tf-state` | Full CRUD on `scripture-journal/*` state key |
| S3 (app + SPA) | Named dev + prod buckets only | Bucket config + object CRUD |
| Lambda | `scripture-journal-api-{dev,prod}` | Create/update/delete/permissions |
| IAM | `scripture-journal-lambda-{dev,prod}` roles | CRUD + PassRole |
| CloudFront | All distributions in account | CRUD + invalidations |
| API Gateway v2 | `us-east-1` APIs | CRUD on all HTTP API resources |
| SSM | `/scripture-journal/*` parameters | Get/Put/Delete |
| ACM | All certs in account | Request/describe/delete |
| Route53 | Zone `Z09637711ZOOUGKI57DYD` only | Record CRUD |
| CloudWatch Logs | `/aws/lambda/scripture-journal-*` | Create/describe/query/read |
| CloudWatch Metrics | All | Put alarm + read metrics |
| STS | — | `GetCallerIdentity` (Terraform data source) |

### `deploy-read-policy.json` — Terraform refresh reads (companion to the deploy policy)

During `plan`, Terraform's AWS provider reads many configuration endpoints for each resource it manages. For example, it calls `lambda:GetFunctionCodeSigningConfig`, `s3:GetReplicationConfiguration`, and the other per-bucket `Get*Configuration` actions. This policy grants read-only `Get*`/`List*`/`Describe*` on this project's resources, so that adding a resource type doesn't break CI one missing read at a time. It is a separate policy because `deploy-policy.json` is close to IAM's size cap. Attach it everywhere `scripture-journal-deploy` is attached.

| Service | Resource scope | What's allowed |
|---|---|---|
| Lambda | `scripture-journal-api-{dev,prod}` | `Get*`, `List*` |
| S3 | The four app/SPA buckets (bucket-level ARNs only) | `Get*`, `List*` (bucket configuration, not objects) |
| IAM | `scripture-journal-lambda-{dev,prod}` roles | `Get*`, `List*` |
| SSM | `/scripture-journal/*` parameters | `Get*`, `Describe*`, `List*` |
| Route53 | Zone `Z09637711ZOOUGKI57DYD` and changes | `Get*`, `List*` |
| CloudFront, ACM, API Gateway v2 | Account (these don't support narrower scoping for reads) | Read-only |

### `monitor-policy.json` — Read-only observability

Read-only access suitable for a monitoring user, dashboard tool, or on-call access.
Does **not** allow any writes — cannot deploy, mutate data, or invalidate caches.

| Service | What's allowed |
|---|---|
| CloudWatch Logs | Describe/query/read `scripture-journal-*` log groups |
| CloudWatch Metrics | Read metrics and alarms |
| Lambda | Get function config + concurrency (no invoke, no update) |
| API Gateway v2 | GET only (read API config) |
| CloudFront | Get distribution config and invalidation history |
| S3 | ListBucket on the four app/SPA buckets (no object access) |

---

## Applying the policies

### Prerequisites
You need an IAM user or role with admin access for this one-time setup.

### Create the policies

```bash
# Deploy policy
aws iam create-policy \
  --policy-name scripture-journal-deploy \
  --policy-document file://infra/iam/deploy-policy.json \
  --description "Full deploy access for scripture-journal (Terraform + scripts)"

# Monitor policy
aws iam create-policy \
  --policy-name scripture-journal-monitor \
  --policy-document file://infra/iam/monitor-policy.json \
  --description "Read-only monitoring access for scripture-journal"
```

### Create and attach the read policy

```bash
aws iam create-policy \
  --policy-name scripture-journal-deploy-read \
  --policy-document file://infra/iam/deploy-read-policy.json \
  --description "Read-only access Terraform needs to refresh scripture-journal resources"

aws iam attach-role-policy \
  --role-name scripture-journal-github-actions \
  --policy-arn arn:aws:iam::818371815071:policy/scripture-journal-deploy-read
```

### Attach to your IAM user

```bash
ACCOUNT_ID=818371815071
YOUR_IAM_USER=peter   # replace with your IAM username

# Attach deploy policy
aws iam attach-user-policy \
  --user-name $YOUR_IAM_USER \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/scripture-journal-deploy

# Detach the old Admin policy
aws iam detach-user-policy \
  --user-name $YOUR_IAM_USER \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

### Attach monitor policy (optional — separate user or role)

```bash
aws iam attach-user-policy \
  --user-name $MONITOR_USER \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/scripture-journal-monitor
```

---

### Update after editing `deploy-policy.json`

```bash
aws iam create-policy-version \
  --policy-arn arn:aws:iam::818371815071:policy/scripture-journal-deploy \
  --policy-document file://infra/iam/deploy-policy.json \
  --set-as-default
```

IAM caps a managed policy at **6,144 characters, not counting whitespace**. `deploy-policy.json` is at about 6,090, so there is little headroom. Check the size before adding actions:

```bash
python3 -c "import json;print(len(json.dumps(json.load(open('infra/iam/deploy-policy.json')),separators=(',',':'))))"
```

If a change would exceed the cap, move a group of statements into a second managed policy attached to the same role and user, instead of loosening resource scopes.

IAM keeps at most 5 versions. If the call fails with `LimitExceeded`, delete the oldest non-default version first with `aws iam list-policy-versions` and then `aws iam delete-policy-version`.

---

## Testing the deploy policy

After switching to the scoped policy, run:

```bash
# Verify Terraform can plan without errors
terraform -chdir=infra plan -var="env=dev"

# Verify scripts work
npm run create-user:deployed -- --username test-probe --password "$(openssl rand -base64 16)"
```

If Terraform hits a missing permission, the error will name the exact action and resource.
Add only that action, scoped to the same resource pattern already in the policy.

---

## Notes

- **CloudFront** cannot be scoped to a specific distribution ARN for most `Create*` and `List*` actions — those actions don't support resource-level restrictions. The `Resource: "*"` on the CloudFront statement is intentional and standard practice.
- **ACM** certificates are scoped to the account but not to a specific cert ARN, because Terraform needs to call `ListCertificates` to find existing ones during `plan`.
- **API Gateway v2** ARNs do not include an account ID — this is an AWS quirk.
- **SSM** `DescribeParameters` does not support resource-level permissions, so it sits in the `Unscoped` statement (`Resource: "*"`) with `sts:GetCallerIdentity`. It only lists parameter metadata, never values.
- **S3** `GetReplicationConfiguration` is read by Terraform's AWS provider when it refreshes every `aws_s3_bucket`, even though no replication is configured.
- **Route53** `GetChange` requires `arn:aws:route53:::change/*` (not zone-scoped) because change IDs are global.
- The deploy policy does **not** grant `lambda:InvokeFunction` — the scripts call the deployed API over HTTPS, not Lambda directly.
