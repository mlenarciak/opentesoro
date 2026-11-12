import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput, Duration, Fn, IgnoreMode, RemovalPolicy, Stack, type StackProps,
  aws_certificatemanager as acm, aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins, aws_ec2 as ec2, aws_ecs as ecs,
  aws_ecr_assets as ecrAssets, aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam, aws_logs as logs, aws_route53 as route53,
  aws_route53_targets as route53Targets, aws_s3 as s3, custom_resources as cr,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { canonicalRedirectCode, type DemoDomain } from './config.js';

export interface DemoStackProps extends StackProps {
  domain?: DemoDomain;
  /** Offline infrastructure tests use a synthetic digest instead of staging the production Docker context. */
  image?: ecs.ContainerImage;
  /** Controlled temporary build context for offline staging regression tests. */
  sourceDirectory?: string;
}

/** Only synthetic, bounded per-visitor memory sessions. Private SQLite deployment remains a separate product mode. */
export class DemoStack extends Stack {
  constructor(scope: Construct, id: string, props: DemoStackProps) {
    super(scope, id, props);
    const vpc = new ec2.Vpc(this, 'Network', {
      ipAddresses: ec2.IpAddresses.cidr('10.84.0.0/20'),
      availabilityZones: [Fn.select(0, Fn.getAzs(this.region)), Fn.select(1, Fn.getAzs(this.region))],
      natGateways: 0, restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        { name: 'Tasks', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Origin', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    // Standalone rules are essential: the CloudFront-managed SG exists only after the VPC origin/distribution.
    const albSg = new ec2.SecurityGroup(this, 'OriginSecurityGroup', { vpc, allowAllOutbound: false, disableInlineRules: true, description: 'Only the CloudFront VPC origin can reach the internal load balancer' });
    const taskSg = new ec2.SecurityGroup(this, 'ApplicationSecurityGroup', { vpc, allowAllOutbound: false, disableInlineRules: true, description: 'Only the internal ALB can reach the demo' });
    albSg.addEgressRule(taskSg, ec2.Port.tcp(3000), 'Bun application and health checks');
    taskSg.addIngressRule(albSg, ec2.Port.tcp(3000), 'Internal load balancer only');
    taskSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'ECR and CloudWatch HTTPS without NAT');

    const logBucket = new s3.Bucket(this, 'OriginLogs', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true, objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN, lifecycleRules: [{ expiration: Duration.days(30) }],
    });
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Origin', {
      vpc, internetFacing: false, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: albSg, dropInvalidHeaderFields: true,
      desyncMitigationMode: elbv2.DesyncMitigationMode.STRICTEST,
      deletionProtection: true, idleTimeout: Duration.seconds(60),
    });
    alb.logAccessLogs(logBucket, 'access');
    const targets = new elbv2.ApplicationTargetGroup(this, 'ApplicationTargets', {
      vpc, port: 3000, protocol: elbv2.ApplicationProtocol.HTTP, targetType: elbv2.TargetType.IP,
      healthCheck: { path: '/health', healthyHttpCodes: '200', interval: Duration.seconds(30), timeout: Duration.seconds(5), healthyThresholdCount: 2, unhealthyThresholdCount: 3 },
      deregistrationDelay: Duration.seconds(30),
    });
    const listener = alb.addListener('PrivateHttp', { port: 80, protocol: elbv2.ApplicationProtocol.HTTP, open: false, defaultTargetGroups: [targets] });
    const privateOrigin = new cloudfront.VpcOrigin(this, 'PrivateOrigin', {
      endpoint: cloudfront.VpcOriginEndpoint.applicationLoadBalancer(alb),
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY, httpPort: 80,
    });
    privateOrigin.node.addDependency(listener, ...vpc.publicSubnets.map(subnet => subnet.internetConnectivityEstablished));
    const origin = origins.VpcOrigin.withVpcOrigin(privateOrigin, { readTimeout: Duration.seconds(60) });
    const headers = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true }, frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.SAME_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: false, override: true },
        contentSecurityPolicy: { contentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'", override: true },
      },
    });
    const redirect = props.domain ? new cloudfront.Function(this, 'CanonicalHost', { runtime: cloudfront.FunctionRuntime.JS_2_0, code: cloudfront.FunctionCode.fromInline(canonicalRedirectCode(props.domain.domainName)) }) : undefined;
    const functionAssociations = redirect ? [{ function: redirect, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }] : undefined;
    const distribution = new cloudfront.Distribution(this, 'Web', {
      comment: 'OpenTesoro isolated synthetic per-visitor demo',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, enableIpv6: true,
      domainNames: props.domain ? [props.domain.domainName] : undefined,
      certificate: props.domain ? acm.Certificate.fromCertificateArn(this, 'ExistingCertificate', props.domain.certificateArn) : undefined,
      minimumProtocolVersion: props.domain ? cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021 : undefined,
      defaultBehavior: {
        origin, viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: headers, compress: true, functionAssociations,
      },
      additionalBehaviors: {
        '/assets/*': { origin, viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS, cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, responseHeadersPolicy: headers, compress: true, functionAssociations },
      },
      // Error caching has its own TTL; API authorization/session errors must never be shared across visitors.
      errorResponses: [400, 403, 404, 405, 414, 500, 501, 502, 503, 504].map(httpStatus => ({ httpStatus, ttl: Duration.seconds(0) })),
    });
    const webUrl = props.domain ? `https://${props.domain.domainName}` : `https://${distribution.distributionDomainName}`;

    const lookupLogs = new logs.LogGroup(this, 'OriginLookupLogs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN });
    const sgLookupCall: cr.AwsSdkCall = {
      service: 'EC2', action: 'describeSecurityGroups',
      parameters: { Filters: [{ Name: 'vpc-id', Values: [vpc.vpcId] }, { Name: 'group-name', Values: ['CloudFront-VPCOrigins-Service-SG'] }] },
      physicalResourceId: cr.PhysicalResourceId.of('CloudFrontVpcOriginSecurityGroup'),
    };
    const sgLookup = new cr.AwsCustomResource(this, 'CloudFrontOriginSecurityGroup', {
      onCreate: sgLookupCall, onUpdate: sgLookupCall, installLatestAwsSdk: false, logGroup: lookupLogs,
      policy: cr.AwsCustomResourcePolicy.fromStatements([new iam.PolicyStatement({ actions: ['ec2:DescribeSecurityGroups'], resources: ['*'] })]),
    });
    sgLookup.node.addDependency(distribution);
    const cfSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'ManagedCloudFrontOriginSecurityGroup', sgLookup.getResponseField('SecurityGroups.0.GroupId'), { mutable: false });
    albSg.addIngressRule(cfSg, ec2.Port.tcp(80), 'CloudFront VPC origin only');

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, containerInsightsV2: ecs.ContainerInsights.DISABLED });
    const task = new ecs.FargateTaskDefinition(this, 'DemoTask', {
      cpu: 512, memoryLimitMiB: 1024,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });
    const root = props.sourceDirectory ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const image = props.image ?? ecs.ContainerImage.fromAsset(root, {
      file: 'Dockerfile.public-demo', platform: ecrAssets.Platform.LINUX_AMD64, ignoreMode: IgnoreMode.DOCKER,
      // Explicit allowlist: local data, unrelated docs/tests and infrastructure never enter staging or its content hash.
      exclude: [
        '**', '!Dockerfile.public-demo', '!.dockerignore', '!package.json', '!bun.lock', '!tsconfig.json', '!LICENSE', '!THIRD_PARTY_NOTICES.md',
        '!apps/', '!apps/server/', '!apps/server/package.json', '!apps/server/src/', '!apps/server/src/**', '!apps/web/', '!apps/web/**',
        '!packages/', '!packages/engine/', '!packages/engine/package.json', '!packages/engine/src/', '!packages/engine/src/**',
        '!packages/sdk/', '!packages/sdk/package.json', '!packages/sdk/src/', '!packages/sdk/src/**',
        '!packages/agicap/', '!packages/agicap/package.json', '!packages/agicap/src/', '!packages/agicap/src/**',
        '**/node_modules/**', '**/dist/**', '**/.data/**', '**/data/**', '**/.env*', '**/*.sqlite*', '**/*.db*',
        '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx', '**/*.cer', '**/*.crt', '**/*.csr', '**/*.der',
        '**/*.test.*', '**/test/**', '**/tests/**', '**/coverage/**', '**/test-results/**', '**/*.log', '**/README.md',
      ],
    });
    const appLogs = new logs.LogGroup(this, 'ApplicationLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.RETAIN });
    const container = task.addContainer('Demo', {
      image, user: '1000:1000', readonlyRootFilesystem: true, privileged: false,
      versionConsistency: ecs.VersionConsistency.ENABLED,
      environment: {
        NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '3000', PUBLIC_DEMO_ORIGIN: webUrl, STATIC_DIR: '/app/web',
        PUBLIC_DEMO_MAX_SESSIONS: '32', PUBLIC_DEMO_TTL_SECONDS: '1800', PUBLIC_DEMO_ABSOLUTE_TTL_SECONDS: '7200',
        PUBLIC_DEMO_MAX_DB_PAGES: '512', PUBLIC_DEMO_MAX_BODY_BYTES: '131072', PUBLIC_DEMO_MAX_MUTATIONS: '200',
        PUBLIC_DEMO_REQUESTS_PER_MINUTE: '120', PUBLIC_DEMO_MAX_CONCURRENT: '16', PUBLIC_DEMO_NEW_SESSIONS_PER_MINUTE: '12',
      },
      portMappings: [{ containerPort: 3000, protocol: ecs.Protocol.TCP }],
      logging: ecs.LogDrivers.awsLogs({ logGroup: appLogs, streamPrefix: 'demo', mode: ecs.AwsLogDriverMode.NON_BLOCKING }),
      stopTimeout: Duration.seconds(30),
    });
    const service = new ecs.FargateService(this, 'DemoService', {
      cluster, taskDefinition: task, desiredCount: 1, assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, securityGroups: [taskSg],
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4, enableExecuteCommand: false,
      // Sessions are process-local: stop the old generation before routing requests to its replacement.
      circuitBreaker: { rollback: true }, minHealthyPercent: 0, maxHealthyPercent: 100,
      healthCheckGracePeriod: Duration.seconds(60),
    });
    targets.addTarget(service.loadBalancerTarget({ containerName: container.containerName, containerPort: 3000 }));
    service.node.addDependency(listener);
    if (props.domain) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'ExistingZone', { hostedZoneId: props.domain.hostedZoneId, zoneName: props.domain.domainName });
      for (const type of ['A', 'AAAA'] as const) {
        const recordProps = { zone, recordName: props.domain.domainName, target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution)) };
        if (type === 'A') new route53.ARecord(this, 'WebA', recordProps);
        else new route53.AaaaRecord(this, 'WebAAAA', recordProps);
      }
    }
    new CfnOutput(this, 'WebUrl', { value: webUrl });
    new CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new CfnOutput(this, 'TargetGroupArn', { value: targets.targetGroupArn });
  }
}
