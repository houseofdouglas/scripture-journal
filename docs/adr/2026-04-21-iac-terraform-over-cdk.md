# ADR: Terraform over AWS CDK for IaC

**Date**: 2026-04-21
**Status**: Accepted

## Context

The project needs infrastructure-as-code for a small AWS serverless stack: one S3 bucket, one CloudFront distribution, a handful of Lambda functions with Function URLs, SSM parameters for secrets, and IAM roles. The project is solo-developed, cost-optimized, and has no requirement today for multi-cloud or multi-provider orchestration.

Two candidates were considered: AWS CDK (TypeScript) and Terraform (HCL).

## Decision

Use **Terraform** as the IaC tool. Store state in a **separate S3 bucket** from the application data bucket, using the S3 backend with native state locking (`use_lockfile = true`, requires Terraform ≥ 1.10).

Lambda bundles are produced by an `esbuild` step in a `npm run build:lambdas` script (or equivalent) before `terraform apply`. The resulting ZIP artifacts are referenced from the Terraform config.

## Rationale

- **Deploy speed.** CDK synthesizes to CloudFormation, which has known-slow update/rollback loops on stacks that touch CloudFront, Lambda, and IAM together. Terraform talks to AWS APIs directly and iterates faster.
- **Trustworthy plan output.** `terraform plan` shows the precise resource-level diff. `cdk diff` shows a CloudFormation template diff, which is one layer removed from what CloudFormation will actually do.
- **Hard separation between app and infra.** HCL cannot import TypeScript — the boundary is enforced by the language, not by convention.
- **Portability.** Terraform knowledge transfers across cloud providers and roles more broadly than CDK.
- **No CloudFormation stack limits or rollback-state wedges** to work around.

## Trade-offs accepted

- **Lambda bundling is a separate step.** CDK's `NodejsFunction` bundles at synth time; in Terraform we run `esbuild` ourselves. Five lines of config, negligible cost for a solo project.
- **SPA deployment** (build → upload to S3 → CloudFront invalidation) requires a few more lines of HCL than CDK's `BucketDeployment`. Acceptable.
- **State bucket must exist before first apply.** Created once via a one-time bootstrap (either manually or via a tiny `bootstrap/` Terraform config using a local backend). Documented in `infra/README.md` when that file is written.

## State bucket separation

App data and Terraform state live in **different S3 buckets**:

- **App bucket**: `scripture-journal-app-<account-id>-<env>`. Accessed by Lambdas and CloudFront.
- **State bucket**: `<account-id>-tf-state` (shared across projects). Accessed only by developers and CI.

Reasons:
- **Blast radius**: state contains every resource attribute Terraform tracks, including sensitive values. Lambdas must not have any path to it.
- **IAM isolation**: clean, non-overlapping policies per bucket.
- **Bootstrap cycle**: combining state and app data in one bucket creates a chicken-and-egg problem (can't destroy without losing state).
- **Policy differences**: state bucket wants MFA delete, no lifecycle expiration, aggressive versioning; app bucket has different retention needs.

## Consequences

- `infra/` contains Terraform modules, not CDK constructs.
- The build pipeline must produce Lambda ZIPs before `terraform apply`. This is codified in `package.json` scripts and CI.
- Any future addition of a non-AWS provider (e.g., Cloudflare, GitHub secrets as code) fits naturally into the same Terraform config.
