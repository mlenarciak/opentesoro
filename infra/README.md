# AWS public demo

This stack publishes a **synthetic, per-visitor demo**. It does not host a company's private SQLite file, connect banking/provider credentials, or turn entity filters into tenant isolation. The private launcher and local Docker recipe remain separate.

The read-only review on 12 November 2026 found no resources matching OpenTesoro in the DLT account's Milan CloudFormation, ECS clusters/services, ECR, Lambda, ALB, HTTP APIs or tagged EC2 instances, or in global S3, CloudFront and Route 53 listings. The chosen deployment creates its own VPC and app resources in account `509581811464`, Region `eu-south-1`, through profile `dlt`. It does not reuse the existing DLT network or change OpenFatture.

## Architecture

CloudFront supplies a public HTTPS URL immediately; a custom domain is optional. A **VPC origin** connects it to an internal Application Load Balancer in isolated subnets. The ALB sends requests to one Bun Fargate task on port 3000. Its security group accepts only the ALB; the ALB accepts only CloudFront's service-managed VPC-origin security group. There is no public load-balancer endpoint, public application port, EFS, NAT gateway or persistent financial volume.

The task has a public IP solely for outbound HTTPS to ECR and CloudWatch, avoiding a NAT gateway. It runs as uid 1000 with a read-only root filesystem, 0.5 vCPU and 1 GiB memory. Its application role has **no AWS service/data/secret permissions**; the separate execution role pulls only the image and publishes logs. CloudFront and VPC origins also use AWS-managed service infrastructure. The reviewed CDK bootstrap ECR repository uses immutable image tags; CDK tags the image by source content and ECS version consistency resolves it to a digest.

The dedicated public-demo launcher allocates bounded in-memory SQLite stores per visitor, seeded with synthetic examples. Sessions expire and disappear when the task restarts or a deployment replaces it. Keep desired count at **one**: memory sessions are local to that process, and multiple tasks would require deliberate session routing or a different state design. Deployments use minimum healthy **0%** and maximum **100%**: the old task stops before its replacement, preventing requests from alternating between two generations of memory sessions. A brief interruption/503 and a fresh demo workspace after replacement are expected and should be visible in the UI. Public demonstrations must not accept provider credentials or a persistent database path.

`PUBLIC_DEMO_ORIGIN` is the exact public HTTPS origin, derived from the generated CloudFront hostname or the selected custom domain. It is independent of the origin's internal HTTP host/scheme. The target group and listener exist before CloudFront, and the task definition can then reference the distribution URL without a resource cycle. The CloudFront SG lookup follows the official CDK pattern and uses standalone ingress rules to avoid a SG/distribution cycle.

All API and HTML requests disable caching and forward viewer cookies, Origin/authorization headers and query strings, excluding the viewer Host header. `Set-Cookie` responses reach the browser. Supported HTTP error responses also have zero error-cache TTL; a visitor's session/CSRF error must not become another visitor's cached response. Only content-hashed `/assets/*` files use caching. Bun serves SPA paths; CloudFront never converts API 403/404 responses into `index.html`.

The ALB and application use HTTP **inside the private VPC-origin path**. Viewer traffic uses CloudFront HTTPS. No public origin certificate is needed for the initial generated hostname. The website CSP permits same-origin scripts, fonts and API connections. ALB access logs expire after 30 days in a private SSE-S3 bucket; application logs retain 30 days, and the SG-lookup helper logs retain seven. Logs/buckets are retained on stack deletion. ALB deletion protection and production stack termination protection require deliberate cleanup to stop recurring charges.

## Review and deploy

Infrastructure dependencies have their **own** `package.json`, `bun.lock` and `node_modules`, outside the app's root workspaces and root lockfile. From this directory:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
AWS_PROFILE=dlt AWS_REGION=eu-south-1 bun run synth -- -c stage=prod --output /tmp/opentesoro-reviewed
AWS_PROFILE=dlt AWS_REGION=eu-south-1 bun run diff -- --app /tmp/opentesoro-reviewed --no-change-set
```

`Dockerfile.public-demo` is the only deployed image recipe; the private default Dockerfile must not be substituted. Before publication, build and run that image with a read-only filesystem, verify `/health`, separate visitor cookies, cross-session isolation, reset/expiry behavior, CSRF failures and private/provider configuration rejection. Scan the staged Docker context for database files, populated environment files and keys. The Docker recipe and CDK exclusions omit these; they never belong in Git or an image.

Review the frozen assembly/diff before deployment. This stack must only add its own resources. It does not purchase a domain, create a new hosted zone, change existing application policies, or enable a paid CloudFront flat-rate subscription. After review, deploy the same assembly with the normal CloudFormation path:

```sh
AWS_PROFILE=dlt AWS_REGION=eu-south-1 bun run deploy -- \
  --app /tmp/opentesoro-reviewed --require-approval never
```

Do not use `--hotswap` or `--express`. Output `WebUrl` is the canonical public origin; `CloudFrontUrl`, `DistributionId`, cluster/service names and target-group ARN support operational checks. Verify CloudFormation completion, ECS steady state, target health, the deployed image digest, HTTPS and two independent browser sessions. Confirm the task ENI cannot accept arbitrary public connections and the ALB remains internal. Deployment is not complete merely because synthesis passed.

Cached AZ labels cover the reviewed DLT account and fictional offline CI account `111111111111`. Subnets use `Fn::GetAZs` at deployment; a different real account may require CDK's read-only AZ discovery and a reviewed context update. Offline tests use a deliberately fictional image digest and create no AWS resources.

## Optional custom domain

Domain ownership/availability is a separate operator decision. `opentesoro.com` was unavailable during the initial review; it is not owned or configured by this stack. The default CloudFront URL allows publication while domain selection is unresolved.

After a domain is acquired or ownership confirmed, supply all three values together on **every** synth, diff and deployment:

```sh
AWS_PROFILE=dlt AWS_REGION=eu-south-1 bun run synth -- -c stage=prod \
  -c domainName=demo.example.com \
  -c hostedZoneId=Z_EXISTING_PUBLIC_ZONE \
  -c certificateArn=arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID
```

Use an issued ACM certificate in **us-east-1**, covering that exact hostname, and an existing delegated public Route 53 hosted zone in the deployment account. Partial configuration fails synthesis. The stack imports those resources, adds A/AAAA aliases, updates the exact public demo origin, and redirects the generated CloudFront hostname to the canonical domain before the application starts. Paths and repeated encoded query parameters are preserved. Domain changes create a new browser origin; existing disposable demo cookies need not migrate. Removing all domain context removes aliases and restores the generated origin.

## Cost and private-data alternative

Current Milan on-demand rates reviewed on 12 November 2026: Fargate Linux x86 vCPU **USD 0.0486/vCPU-hour**, memory **USD 0.0053/GiB-hour**, ALB **USD 0.0265/hour**, ALB capacity **USD 0.0084/LCU-hour**, and public IPv4 **USD 0.005/address-hour**. At 730 hours, the 0.5-vCPU/1-GiB task, internal ALB and one task public IP total about **USD 44.60/month before LCU, CloudFront, logs, storage, ECR and transfer usage**. Allow roughly **USD 45–60/month for a small demo**; this is an estimate, not a cap. The stop-before-start rollout keeps one application generation rather than adding an overlapping task. Internal ALB and CloudFront private ENIs do not consume charged public IPv4 addresses.

Use CloudFront **pay-as-you-go**. VPC origins have no additional feature fee there. The newer Free/Pro **flat-rate** subscriptions exclude VPC origins; selecting the Business flat-rate plan would add USD 200/month and is not part of this deployment. CloudFront usage, optional future domain registration and DNS are separate; no paid Shield Advanced, Inspector registry scanning or NAT gateway is enabled.

For private business data, keep one writer on a separately protected host with a retained **encrypted EBS** volume mounted as a local filesystem, restricted access, encrypted off-host online SQLite backups, restore drills and monitoring. Do not place the current WAL database on EFS/NFS, and do not rely on ephemeral Fargate storage for persistence. A single EC2 host plus EBS preserves the existing SQLite design; a scalable managed database would require an explicit application storage migration. The public-demo stack does not create either private option.

Primary references: [CloudFront VPC-origin prerequisites and Milan support](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html), [CDK VPC-origin SG pattern](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins-readme.html), [VPC origins feature pricing](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-cloudfront-vpc-origins/), [CloudFront plans and pay-as-you-go](https://aws.amazon.com/cloudfront/pricing/), [Milan ECS rates](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/eu-south-1/index.json), [Milan ELB rates](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/eu-south-1/index.json), [public IPv4 pricing](https://aws.amazon.com/vpc/pricing/), [SQLite WAL local-host requirement](https://www.sqlite.org/wal.html), [EBS volumes](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volumes.html), [EBS encryption/security](https://docs.aws.amazon.com/ebs/latest/userguide/security.html).
